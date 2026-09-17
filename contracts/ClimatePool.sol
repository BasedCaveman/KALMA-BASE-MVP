// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/Pausable.sol";

/**
 * @title ClimatePool v5
 * @notice Parimutuel climate prediction market with permissionless creation.
 *
 * v5 Changes from v4:
 *   1. MARKET TYPE REGISTRY: marketTypeId replaces isRainMarket bool.
 *      New types added via external MarketTypeRegistry without redeploying pool.
 *   2. ANTI-DUPLICATE: Grid-based collision using (lat, lon, marketTypeId) key.
 *   3. FEE CAPS: MAX_FEE_BPS = 300 (3%) hardcoded immutable.
 *   4. FUTURE-DATED MARKETS: startTimestamp + predictionDeadline.
 *   5. YIELD HOOKS: depositToStrategy/withdrawFromStrategy (stubbed).
 *   6. VRF RESERVED SLOTS: For future Chainlink VRF integration.
 *
 * Security: CEI, ReentrancyGuard, Pausable, 2-step ownership, pull-pattern fees.
 * Terminology: predict, Above/Below, position, participant, seed.
 */
contract ClimatePool is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════

    uint256 public constant MIN_SEED = 10 * 1e18;
    uint256 public constant MIN_POSITION = 1 * 1e18;
    uint256 public constant MAX_ACTIVE_MARKETS_PER_CREATOR = 5;
    uint256 public constant MIN_MARKET_DURATION = 1 hours;
    uint256 public constant MAX_MARKET_DURATION = 90 days;
    uint256 public constant MAX_SCHEDULE_AHEAD = 90 days;
    uint256 public constant MAX_CITY_NAME_LENGTH = 64;
    uint256 public constant CLAIM_DEADLINE = 90 days;
    uint256 public constant MULTIPLIER_PRECISION = 1e6;
    uint256 public constant CANCEL_WINDOW_DIVISOR = 4;
    uint256 public constant CANCEL_LATE_GRACE = 48 hours;

    // Fee caps - immutable
    uint256 public constant MAX_FEE_BPS = 300;
    uint256 public constant MAX_SINGLE_SHARE_BPS = 6000;
    uint256 public constant MIN_CLIMATE_SHARE_BPS = 1500;

    // Anti-duplicate
    uint256 public constant LOCATION_GRID_STEP = 100000;
    uint256 public constant DUPLICATE_COOLDOWN = 24 hours;

    // Yield infrastructure
    uint256 public constant YIELD_MIN_DURATION = 3 days;
    uint256 public constant YIELD_RECALL_BUFFER = 24 hours;

    // ═══════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════

    IERC20 public immutable usdm;

    address public owner;
    address public pendingOwner;
    address public oracle;

    uint256 public feeBps = 50;
    uint256 public platformShareBps = 5000;
    uint256 public creatorShareBps = 2500;
    uint256 public climateShareBps = 2500;
    address public platformAddress;
    address public climateFundAddress;

    uint256 public platformBalance;
    uint256 public climateFundBalance;

    uint256 public nextMarketId = 1;
    uint256 public maxPoolSize = 100_000 * 1e18;

    // Market type registry (external contract)
    address public marketTypeRegistry;

    // Yield strategy (address(0) = disabled)
    address public yieldStrategy;

    // Future: Chainlink VRF reserved storage
    uint256[5] private __vrfReservedSlots;

    struct MarketInfo {
        string cityName;
        int256 lat;
        int256 lon;
        uint256 marketTypeId;          // v5: replaces isRainMarket
        uint256 historicalAvg;
        uint256 startTime;
        uint256 endTime;
        uint256 predictionDeadline;
    }

    struct MarketState {
        uint256 abovePool;
        uint256 belowPool;
        uint256 remainingPool;
        bool resolved;
        bool outcome;
        bool cancelled;
        uint256 actualValue;
        uint256 resolvedAt;
        address creator;
        uint256 creatorEarnings;
        uint256 participantCount;
    }

    struct UserPosition {
        uint256 aboveAmount;
        uint256 belowAmount;
        bool claimed;
    }

    mapping(uint256 => MarketInfo) public marketInfo;
    mapping(uint256 => MarketState) public marketState;
    mapping(uint256 => mapping(address => UserPosition)) public userPositions;
    mapping(address => uint256) public activeMarketCount;
    mapping(uint256 => mapping(address => bool)) private _isParticipant;

    // Anti-duplicate: grid cell → last market id
    mapping(bytes32 => uint256) public cellLastMarket;

    // Yield: market → deposited to strategy flag
    mapping(uint256 => bool) public yieldDeposited;

    // ═══════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════

    event MarketCreated(uint256 indexed marketId, string cityName, address indexed creator, uint256 marketTypeId, uint256 startTime, uint256 endTime);
    event PositionTaken(uint256 indexed marketId, address indexed user, bool isAbove, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcome, uint256 actualValue);
    event MarketReResolved(uint256 indexed marketId, bool newOutcome, uint256 correctedValue);
    event MarketCancelled(uint256 indexed marketId);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event FeeConfigUpdated(uint256 feeBps, uint256 platformShare, uint256 creatorShare, uint256 climateShare);
    event MaxPoolSizeUpdated(uint256 oldCap, uint256 newCap);
    event UnclaimableSwept(uint256 indexed marketId, uint256 amount);
    event YieldDeposited(uint256 indexed marketId, uint256 amount);
    event YieldWithdrawn(uint256 indexed marketId, uint256 amount);

    // ═══════════════════════════════════════════════
    // Errors
    // ═══════════════════════════════════════════════

    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidMarketId();
    error MarketNotActive();
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error MarketNotEnded();
    error MarketNotCancelled();
    error MarketClosed();
    error PredictionsClosed();
    error AlreadyClaimed();
    error NothingToClaim();
    error InsufficientSeed();
    error TooManyActiveMarkets();
    error InvalidDuration();
    error InvalidStartTime();
    error CityNameTooLong();
    error InvalidCoordinates();
    error InvalidHistoricalAvg();
    error InvalidFeeConfig();
    error FeeTooHigh();
    error ClaimDeadlineNotReached();
    error PoolSizeCapReached();
    error CancelWindowClosed();
    error ChallengeWindowActive();
    error ResolutionFrozen();
    error NotReResolvable();
    error DuplicateMarket();
    error DuplicateCooldown();
    error InvalidMarketType();
    error YieldDisabled();
    error YieldNotEligible();
    error YieldAlreadyDeposited();
    error YieldNotDeposited();
    error YieldRecallTooLate();

    // ═══════════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════════

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert Unauthorized();
        _;
    }

    modifier validMarket(uint256 marketId) {
        if (marketId == 0 || marketId >= nextMarketId) revert InvalidMarketId();
        _;
    }

    // ═══════════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════════

    constructor(
        address _usdm,
        address _platformAddress,
        address _climateFundAddress,
        address _marketTypeRegistry
    ) {
        if (_usdm == address(0)) revert ZeroAddress();
        if (_platformAddress == address(0)) revert ZeroAddress();
        if (_climateFundAddress == address(0)) revert ZeroAddress();
        if (_marketTypeRegistry == address(0)) revert ZeroAddress();

        usdm = IERC20(_usdm);
        owner = msg.sender;
        platformAddress = _platformAddress;
        climateFundAddress = _climateFundAddress;
        marketTypeRegistry = _marketTypeRegistry;
    }

    // ═══════════════════════════════════════════════
    // Market Creation (Permissionless)
    // ═══════════════════════════════════════════════

    function createMarketWithSeed(
        string calldata cityName,
        int256 lat,
        int256 lon,
        uint256 marketTypeId,
        uint256 historicalAvg,
        uint256 startTimestamp,
        uint256 durationDays,
        uint256 seedAmount,
        bool seedIsAbove
    ) external nonReentrant whenNotPaused returns (uint256 marketId) {
        // ── Input validation ──
        if (bytes(cityName).length == 0 || bytes(cityName).length > MAX_CITY_NAME_LENGTH) revert CityNameTooLong();
        if (lat < -90000000 || lat > 90000000) revert InvalidCoordinates();
        if (lon < -180000000 || lon > 180000000) revert InvalidCoordinates();
        if (historicalAvg == 0) revert InvalidHistoricalAvg();
        if (seedAmount < MIN_SEED) revert InsufficientSeed();
        if (activeMarketCount[msg.sender] >= MAX_ACTIVE_MARKETS_PER_CREATOR) revert TooManyActiveMarkets();

        // Validate market type via registry
        _validateMarketType(marketTypeId);

        uint256 durationSeconds = durationDays * 1 days;
        if (durationSeconds < MIN_MARKET_DURATION) revert InvalidDuration();
        if (durationSeconds > MAX_MARKET_DURATION) revert InvalidDuration();

        // ── Resolve start time ──
        uint256 observationStart;
        if (startTimestamp == 0 || startTimestamp <= block.timestamp) {
            observationStart = block.timestamp;
        } else {
            if (startTimestamp > block.timestamp + MAX_SCHEDULE_AHEAD) revert InvalidStartTime();
            observationStart = startTimestamp;
        }

        uint256 observationEnd = observationStart + durationSeconds;
        uint256 predDeadline = observationStart > block.timestamp
            ? observationStart
            : observationEnd;

        // ── Anti-duplicate check ──
        bytes32 cellKey = _marketCellKey(lat, lon, marketTypeId);
        uint256 existingId = cellLastMarket[cellKey];

        if (existingId != 0 && existingId < nextMarketId) {
            MarketInfo storage existing = marketInfo[existingId];
            MarketState storage existingState = marketState[existingId];

            bool isStillActive = !existingState.resolved && !existingState.cancelled;
            bool windowsOverlap = observationStart < existing.endTime && observationEnd > existing.startTime;

            if (isStillActive && windowsOverlap) revert DuplicateMarket();

            if (existingState.resolved && existing.endTime + DUPLICATE_COOLDOWN > block.timestamp) {
                if (observationStart < existing.endTime + DUPLICATE_COOLDOWN) revert DuplicateCooldown();
            }
        }

        // ── Create market ──
        marketId = nextMarketId++;

        marketInfo[marketId] = MarketInfo({
            cityName: cityName,
            lat: lat,
            lon: lon,
            marketTypeId: marketTypeId,
            historicalAvg: historicalAvg,
            startTime: observationStart,
            endTime: observationEnd,
            predictionDeadline: predDeadline
        });

        marketState[marketId].creator = msg.sender;
        activeMarketCount[msg.sender]++;
        cellLastMarket[cellKey] = marketId;

        if (seedIsAbove) {
            marketState[marketId].abovePool = seedAmount;
            userPositions[marketId][msg.sender].aboveAmount = seedAmount;
        } else {
            marketState[marketId].belowPool = seedAmount;
            userPositions[marketId][msg.sender].belowAmount = seedAmount;
        }
        marketState[marketId].participantCount = 1;
        _isParticipant[marketId][msg.sender] = true;

        usdm.safeTransferFrom(msg.sender, address(this), seedAmount);

        emit MarketCreated(marketId, cityName, msg.sender, marketTypeId, observationStart, observationEnd);
        emit PositionTaken(marketId, msg.sender, seedIsAbove, seedAmount);
    }

    function _validateMarketType(uint256 typeId) internal view {
        (bool ok, bytes memory data) = marketTypeRegistry.staticcall(
            abi.encodeWithSignature("isValidType(uint256)", typeId)
        );
        if (!ok || data.length < 32) revert InvalidMarketType();
        bool valid = abi.decode(data, (bool));
        if (!valid) revert InvalidMarketType();
    }

    function _marketCellKey(int256 lat, int256 lon, uint256 typeId) internal pure returns (bytes32) {
        int256 gridLat = (lat / int256(LOCATION_GRID_STEP)) * int256(LOCATION_GRID_STEP);
        int256 gridLon = (lon / int256(LOCATION_GRID_STEP)) * int256(LOCATION_GRID_STEP);
        return keccak256(abi.encode(gridLat, gridLon, typeId));
    }

    // ═══════════════════════════════════════════════
    // Predictions
    // ═══════════════════════════════════════════════

    function predict(uint256 marketId, bool isAbove, uint256 amount)
        external nonReentrant whenNotPaused validMarket(marketId)
    {
        if (amount < MIN_POSITION) revert ZeroAmount();

        MarketState storage state = marketState[marketId];
        MarketInfo storage info = marketInfo[marketId];

        if (state.resolved || state.cancelled) revert MarketNotActive();
        if (block.timestamp >= info.predictionDeadline) revert PredictionsClosed();
        if (state.abovePool + state.belowPool + amount > maxPoolSize) revert PoolSizeCapReached();

        if (isAbove) {
            state.abovePool += amount;
            userPositions[marketId][msg.sender].aboveAmount += amount;
        } else {
            state.belowPool += amount;
            userPositions[marketId][msg.sender].belowAmount += amount;
        }

        if (!_isParticipant[marketId][msg.sender]) {
            _isParticipant[marketId][msg.sender] = true;
            state.participantCount++;
        }

        usdm.safeTransferFrom(msg.sender, address(this), amount);

        emit PositionTaken(marketId, msg.sender, isAbove, amount);
    }

    // ═══════════════════════════════════════════════
    // Resolution
    // ═══════════════════════════════════════════════

    function resolveMarket(uint256 marketId, uint256 actualValue)
        external onlyOracle validMarket(marketId)
    {
        MarketState storage state = marketState[marketId];
        MarketInfo storage info = marketInfo[marketId];

        if (state.resolved) revert MarketAlreadyResolved();
        if (state.cancelled) revert MarketNotActive();
        if (block.timestamp < info.endTime) revert MarketNotEnded();

        bool outcome = actualValue >= info.historicalAvg;

        state.resolved = true;
        state.outcome = outcome;
        state.actualValue = actualValue;
        state.resolvedAt = block.timestamp;
        state.remainingPool = state.abovePool + state.belowPool;

        if (activeMarketCount[state.creator] > 0) {
            activeMarketCount[state.creator]--;
        }

        emit MarketResolved(marketId, outcome, actualValue);
    }

    function reResolveMarket(uint256 marketId, uint256 correctedValue)
        external onlyOracle validMarket(marketId)
    {
        MarketState storage state = marketState[marketId];
        if (!state.resolved) revert MarketNotResolved();

        uint256 totalPool = state.abovePool + state.belowPool;
        if (state.remainingPool != totalPool) revert NotReResolvable();

        bool newOutcome = correctedValue >= marketInfo[marketId].historicalAvg;

        state.outcome = newOutcome;
        state.actualValue = correctedValue;
        state.resolvedAt = block.timestamp;

        emit MarketReResolved(marketId, newOutcome, correctedValue);
    }

    function cancelMarket(uint256 marketId)
        external onlyOracle validMarket(marketId)
    {
        MarketState storage state = marketState[marketId];
        MarketInfo storage info = marketInfo[marketId];

        if (state.resolved || state.cancelled) revert MarketNotActive();

        uint256 duration = info.endTime - info.startTime;
        uint256 earlyDeadline = info.startTime + (duration / CANCEL_WINDOW_DIVISOR);
        bool inEarlyWindow = block.timestamp <= earlyDeadline;
        bool inLateWindow = block.timestamp >= info.endTime + CANCEL_LATE_GRACE;
        if (!inEarlyWindow && !inLateWindow) revert CancelWindowClosed();

        state.cancelled = true;

        if (activeMarketCount[state.creator] > 0) {
            activeMarketCount[state.creator]--;
        }

        emit MarketCancelled(marketId);
    }

    // ═══════════════════════════════════════════════
    // Claims & Payouts
    // ═══════════════════════════════════════════════

    function claim(uint256 marketId)
        external nonReentrant validMarket(marketId)
        returns (uint256 netPayout)
    {
        netPayout = _processClaim(marketId, msg.sender);
        if (netPayout == 0) revert NothingToClaim();
        usdm.safeTransfer(msg.sender, netPayout);
    }

    function claimMultiple(uint256[] calldata marketIds)
        external nonReentrant returns (uint256 totalPayout)
    {
        require(marketIds.length <= 50, "Too many markets");

        for (uint256 i = 0; i < marketIds.length; i++) {
            uint256 mid = marketIds[i];
            if (mid == 0 || mid >= nextMarketId) continue;
            totalPayout += _processClaim(mid, msg.sender);
        }

        if (totalPayout == 0) revert NothingToClaim();
        usdm.safeTransfer(msg.sender, totalPayout);
    }

    function claimRefund(uint256 marketId)
        external nonReentrant validMarket(marketId)
    {
        MarketState storage state = marketState[marketId];
        if (!state.cancelled) revert MarketNotCancelled();

        UserPosition storage pos = userPositions[marketId][msg.sender];
        if (pos.claimed) revert AlreadyClaimed();

        uint256 refund = pos.aboveAmount + pos.belowAmount;
        if (refund == 0) revert NothingToClaim();

        pos.claimed = true;
        usdm.safeTransfer(msg.sender, refund);
        emit Claimed(marketId, msg.sender, refund);
    }

    function _processClaim(uint256 marketId, address user) internal returns (uint256 netPayout) {
        MarketState storage state = marketState[marketId];
        if (!state.resolved) return 0;

        _requireChallengeWindowPassed(marketId, state.resolvedAt);

        UserPosition storage pos = userPositions[marketId][user];
        if (pos.claimed) return 0;

        uint256 totalPool = state.abovePool + state.belowPool;
        uint256 winningPool;
        uint256 userStake;

        if (state.outcome) {
            winningPool = state.abovePool;
            userStake = pos.aboveAmount;
        } else {
            winningPool = state.belowPool;
            userStake = pos.belowAmount;
        }

        if (userStake == 0 || winningPool == 0) return 0;

        uint256 grossPayout = (userStake * totalPool) / winningPool;
        uint256 profit = grossPayout > userStake ? grossPayout - userStake : 0;
        uint256 totalFee = (profit * feeBps) / 10000;

        if (totalFee > 0) {
            uint256 platformFee = (totalFee * platformShareBps) / 10000;
            uint256 creatorFee = (totalFee * creatorShareBps) / 10000;
            uint256 climateFee = totalFee - platformFee - creatorFee;

            platformBalance += platformFee;
            state.creatorEarnings += creatorFee;
            climateFundBalance += climateFee;
        }

        netPayout = grossPayout - totalFee;
        pos.claimed = true;
        state.remainingPool -= (netPayout + totalFee);

        emit Claimed(marketId, user, netPayout);
    }

    function _requireChallengeWindowPassed(uint256 marketId, uint256 resolvedAt) internal view {
        uint256 challengeWindow = 2 hours;
        bool isFrozen = false;

        if (oracle != address(0)) {
            (bool okW, bytes memory dataW) = oracle.staticcall(
                abi.encodeWithSignature("CHALLENGE_WINDOW()")
            );
            if (okW && dataW.length >= 32) {
                challengeWindow = abi.decode(dataW, (uint256));
            }

            (bool okF, bytes memory dataF) = oracle.staticcall(
                abi.encodeWithSignature("frozen(uint256)", marketId)
            );
            if (okF && dataF.length >= 32) {
                isFrozen = abi.decode(dataF, (bool));
            }
        }

        if (block.timestamp < resolvedAt + challengeWindow) revert ChallengeWindowActive();
        if (isFrozen) revert ResolutionFrozen();
    }

    // ═══════════════════════════════════════════════
    // Views
    // ═══════════════════════════════════════════════

    /// @notice Backward-compatible view (returns isRainMarket derived from typeId)
    function getMarket(uint256 marketId) external view validMarket(marketId) returns (
        string memory cityName, int256 lat, int256 lon,
        bool isRainMarket, uint256 historicalAvg,
        uint256 startTime, uint256 endTime
    ) {
        MarketInfo storage info = marketInfo[marketId];
        return (info.cityName, info.lat, info.lon, info.marketTypeId == 1,
                info.historicalAvg, info.startTime, info.endTime);
    }

    /// @notice Full v5 view with marketTypeId and predictionDeadline
    function getMarketV5(uint256 marketId) external view validMarket(marketId) returns (
        string memory cityName, int256 lat, int256 lon,
        uint256 marketTypeId, uint256 historicalAvg,
        uint256 startTime, uint256 endTime, uint256 predictionDeadline
    ) {
        MarketInfo storage info = marketInfo[marketId];
        return (info.cityName, info.lat, info.lon, info.marketTypeId,
                info.historicalAvg, info.startTime, info.endTime, info.predictionDeadline);
    }

    function getMarketStatus(uint256 marketId) external view validMarket(marketId) returns (
        uint256 abovePool, uint256 belowPool,
        bool resolved, bool outcome, address creator,
        bool cancelled, uint256 _creatorEarnings
    ) {
        MarketState storage s = marketState[marketId];
        return (s.abovePool, s.belowPool, s.resolved, s.outcome, s.creator, s.cancelled, s.creatorEarnings);
    }

    function getOdds(uint256 marketId) external view validMarket(marketId) returns (
        uint256 abovePct, uint256 belowPct,
        uint256 aboveMultiplier, uint256 belowMultiplier
    ) {
        MarketState storage s = marketState[marketId];
        uint256 total = s.abovePool + s.belowPool;
        if (total == 0) return (50, 50, 0, 0);
        abovePct = (s.abovePool * 100) / total;
        belowPct = 100 - abovePct;
        if (s.abovePool > 0) aboveMultiplier = (total * MULTIPLIER_PRECISION) / s.abovePool;
        if (s.belowPool > 0) belowMultiplier = (total * MULTIPLIER_PRECISION) / s.belowPool;
    }

    function getUserPosition(uint256 marketId, address user) external view validMarket(marketId) returns (
        uint256 aboveAmount, uint256 belowAmount, bool claimed
    ) {
        UserPosition storage pos = userPositions[marketId][user];
        return (pos.aboveAmount, pos.belowAmount, pos.claimed);
    }

    function calculatePayout(uint256 marketId, bool isAbove, uint256 amount) external view validMarket(marketId) returns (
        uint256 payout, uint256 netPayout
    ) {
        MarketState storage s = marketState[marketId];
        uint256 ap = s.abovePool;
        uint256 bp = s.belowPool;
        if (isAbove) { ap += amount; } else { bp += amount; }
        uint256 total = ap + bp;
        uint256 winPool = isAbove ? ap : bp;
        if (winPool == 0) return (0, 0);
        payout = (amount * total) / winPool;
        uint256 profit = payout > amount ? payout - amount : 0;
        netPayout = payout - ((profit * feeBps) / 10000);
    }

    function getResolutionDetails(uint256 marketId) external view validMarket(marketId) returns (
        uint256 actualValue, uint256 resolvedAt, bool resolved, bool outcome
    ) {
        MarketState storage s = marketState[marketId];
        return (s.actualValue, s.resolvedAt, s.resolved, s.outcome);
    }

    function getParticipantCount(uint256 marketId) external view validMarket(marketId) returns (uint256) {
        return marketState[marketId].participantCount;
    }

    function getRemainingPool(uint256 marketId) external view validMarket(marketId) returns (uint256) {
        return marketState[marketId].remainingPool;
    }

    function verifyAccounting() external view returns (bool balanced, int256 discrepancy) {
        uint256 expected = platformBalance + climateFundBalance;
        for (uint256 i = 1; i < nextMarketId; i++) {
            MarketState storage s = marketState[i];
            if (s.resolved) {
                expected += s.remainingPool;
            } else if (!s.cancelled) {
                expected += s.abovePool + s.belowPool;
            }
            expected += s.creatorEarnings;
        }
        uint256 actual = usdm.balanceOf(address(this));
        balanced = (actual >= expected);
        discrepancy = int256(actual) - int256(expected);
    }

    // ═══════════════════════════════════════════════
    // Fee Withdrawals (Pull Pattern)
    // ═══════════════════════════════════════════════

    function withdrawPlatformFees() external nonReentrant {
        if (msg.sender != platformAddress) revert Unauthorized();
        uint256 amount = platformBalance;
        if (amount == 0) revert NothingToClaim();
        platformBalance = 0;
        usdm.safeTransfer(platformAddress, amount);
    }

    function withdrawClimateFund() external nonReentrant {
        if (msg.sender != climateFundAddress) revert Unauthorized();
        uint256 amount = climateFundBalance;
        if (amount == 0) revert NothingToClaim();
        climateFundBalance = 0;
        usdm.safeTransfer(climateFundAddress, amount);
    }

    function withdrawCreatorEarnings(uint256 marketId) external nonReentrant validMarket(marketId) {
        MarketState storage s = marketState[marketId];
        if (msg.sender != s.creator) revert Unauthorized();
        uint256 amount = s.creatorEarnings;
        if (amount == 0) revert NothingToClaim();
        s.creatorEarnings = 0;
        usdm.safeTransfer(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════
    // Fee & Pool Config (Owner) - Capped
    // ═══════════════════════════════════════════════

    function getFeeConfig() external view returns (
        uint256 _feeBps, uint256 _platformShare, uint256 _creatorShare, uint256 _climateShare,
        address _platformAddress, address _climateFundAddress
    ) {
        return (feeBps, platformShareBps, creatorShareBps, climateShareBps, platformAddress, climateFundAddress);
    }

    function updateFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = newFeeBps;
        emit FeeConfigUpdated(feeBps, platformShareBps, creatorShareBps, climateShareBps);
    }

    function updateFeeShares(uint256 _platform, uint256 _creator, uint256 _climate) external onlyOwner {
        if (_platform + _creator + _climate != 10000) revert InvalidFeeConfig();
        if (_platform > MAX_SINGLE_SHARE_BPS) revert InvalidFeeConfig();
        if (_creator > MAX_SINGLE_SHARE_BPS) revert InvalidFeeConfig();
        if (_climate < MIN_CLIMATE_SHARE_BPS) revert InvalidFeeConfig();
        platformShareBps = _platform;
        creatorShareBps = _creator;
        climateShareBps = _climate;
        emit FeeConfigUpdated(feeBps, _platform, _creator, _climate);
    }

    function updateFeeAddresses(address _platform, address _climate) external onlyOwner {
        if (_platform == address(0) || _climate == address(0)) revert ZeroAddress();
        platformAddress = _platform;
        climateFundAddress = _climate;
    }

    function updateMaxPoolSize(uint256 newCap) external onlyOwner {
        emit MaxPoolSizeUpdated(maxPoolSize, newCap);
        maxPoolSize = newCap;
    }

    // ═══════════════════════════════════════════════
    // Yield Infrastructure (Stubbed)
    // ═══════════════════════════════════════════════

    function setYieldStrategy(address _strategy) external onlyOwner {
        yieldStrategy = _strategy;
    }

    /**
     * @notice Deposit a market's idle funds to yield strategy.
     * @dev Only for markets with duration > YIELD_MIN_DURATION.
     *      Strategy must be set. Funds must not already be deposited.
     *      Currently stubbed - emits event but does not transfer.
     */
    function depositToStrategy(uint256 marketId) external onlyOwner validMarket(marketId) {
        if (yieldStrategy == address(0)) revert YieldDisabled();

        MarketInfo storage info = marketInfo[marketId];
        MarketState storage state = marketState[marketId];

        if (state.resolved || state.cancelled) revert MarketNotActive();
        if (info.endTime - info.startTime < YIELD_MIN_DURATION) revert YieldNotEligible();
        if (yieldDeposited[marketId]) revert YieldAlreadyDeposited();

        uint256 poolTotal = state.abovePool + state.belowPool;
        yieldDeposited[marketId] = true;

        // STUB: In production, transfer poolTotal to yieldStrategy here
        // usdm.safeTransfer(yieldStrategy, poolTotal);

        emit YieldDeposited(marketId, poolTotal);
    }

    /**
     * @notice Withdraw funds from yield strategy back to pool before resolution.
     * @dev Must be called at least YIELD_RECALL_BUFFER before endTime.
     */
    function withdrawFromStrategy(uint256 marketId) external onlyOwner validMarket(marketId) {
        if (yieldStrategy == address(0)) revert YieldDisabled();
        if (!yieldDeposited[marketId]) revert YieldNotDeposited();

        MarketInfo storage info = marketInfo[marketId];
        if (block.timestamp > info.endTime - YIELD_RECALL_BUFFER) revert YieldRecallTooLate();

        yieldDeposited[marketId] = false;

        // STUB: In production, call strategy.withdraw() and verify balance returned
        // IYieldStrategy(yieldStrategy).withdraw(marketId);

        MarketState storage state = marketState[marketId];
        uint256 poolTotal = state.abovePool + state.belowPool;
        emit YieldWithdrawn(marketId, poolTotal);
    }

    // ═══════════════════════════════════════════════
    // Oracle, Registry & Ownership
    // ═══════════════════════════════════════════════

    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroAddress();
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function setMarketTypeRegistry(address _registry) external onlyOwner {
        if (_registry == address(0)) revert ZeroAddress();
        marketTypeRegistry = _registry;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ═══════════════════════════════════════════════
    // Emergency
    // ═══════════════════════════════════════════════

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function sweepUnclaimable(uint256 marketId) external onlyOwner validMarket(marketId) {
        MarketState storage s = marketState[marketId];
        if (!s.resolved) revert MarketNotResolved();
        if (block.timestamp < s.resolvedAt + CLAIM_DEADLINE) revert ClaimDeadlineNotReached();

        uint256 remaining = s.remainingPool;
        if (remaining == 0) revert NothingToClaim();

        s.remainingPool = 0;
        usdm.safeTransfer(platformAddress, remaining);

        emit UnclaimableSwept(marketId, remaining);
    }
}
