// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ClimateOracle v5
 * @notice Optimistic oracle for ClimatePool with bonded public challenges.
 *
 * v5 Changes from v4:
 *   - BONDED CHALLENGES: Any user can challenge a resolution by posting CHALLENGE_BOND (50 USDm).
 *     This freezes the market and forces Guardian review.
 *     If challenge upheld (re-resolve): bond returned to challenger.
 *     If challenge rejected (confirm): bond sent to climate fund.
 *     This prevents spam while keeping the system permissionlessly auditable.
 *   - Guardian can still freeze without bond (operational override).
 *   - Only one active challenge per market.
 *
 * Preserved from v4:
 *   - 2-hour optimistic challenge window
 *   - Guardian freeze/confirm/re-resolve
 *   - actualValue sanity bounds (≤ 10000)
 *   - 2-step ownership, separate Operator/Guardian roles
 *   - Batch resolution
 *
 * Resolution Flow:
 *   1. Operator calls resolve() → 2h challenge window opens
 *   2. Anyone can challenge by posting 50 USDm bond → market frozen
 *   3. Guardian reviews:
 *      a) Challenge upheld → reResolve() → bond returned to challenger
 *      b) Challenge rejected → confirmResolution() → bond to climate fund
 *   4. If no challenge → window expires → claims unlock (happy path)
 */

interface IClimatePool {
    function resolveMarket(uint256 marketId, uint256 actualValue) external;
    function reResolveMarket(uint256 marketId, uint256 correctedValue) external;
    function cancelMarket(uint256 marketId) external;

    function getMarket(uint256 marketId) external view returns (
        string memory cityName, int256 lat, int256 lon,
        bool isRainMarket, uint256 historicalAvg,
        uint256 startTime, uint256 endTime
    );
    function getMarketStatus(uint256 marketId) external view returns (
        uint256 abovePool, uint256 belowPool,
        bool resolved, bool outcome, address creator,
        bool cancelled, uint256 creatorEarnings
    );
    function nextMarketId() external view returns (uint256);
    function climateFundAddress() external view returns (address);
    function usdm() external view returns (address);
}

contract ClimateOracle {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════

    uint256 public constant CHALLENGE_WINDOW = 2 hours;
    uint256 public constant MAX_ACTUAL_VALUE = 10000;
    uint256 public constant CHALLENGE_BOND = 50 * 1e18;     // 50 USDm

    // ═══════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════

    IClimatePool public pool;
    IERC20 public immutable usdm;
    address public owner;
    address public pendingOwner;
    address public operator;
    address public guardian;

    mapping(uint256 => uint256) public resolvedAt;
    mapping(uint256 => bool) public frozen;

    // v5: Challenge bond tracking
    mapping(uint256 => address) public challenger;          // Who posted the bond
    mapping(uint256 => uint256) public challengeBondAmount; // Amount locked (for future variable bonds)

    // ═══════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════

    event MarketResolved(uint256 indexed marketId, uint256 actualValue);
    event ResolutionChallenged(uint256 indexed marketId, address indexed challenger, uint256 bond);
    event ResolutionFrozen(uint256 indexed marketId, address indexed by);
    event ResolutionConfirmed(uint256 indexed marketId, bool challengeRejected);
    event ResolutionCorrected(uint256 indexed marketId, uint256 correctedValue, bool challengeUpheld);
    event ChallengeBondReturned(uint256 indexed marketId, address indexed challenger, uint256 amount);
    event ChallengeBondSlashed(uint256 indexed marketId, address indexed climateFund, uint256 amount);
    event MarketCancelled(uint256 indexed marketId);
    event PoolUpdated(address indexed oldPool, address indexed newPool);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    // ═══════════════════════════════════════════════
    // Errors
    // ═══════════════════════════════════════════════

    error Unauthorized();
    error ZeroAddress();
    error ValueExceedsSanityBound();
    error NotResolved();
    error ChallengeWindowClosed();
    error AlreadyFrozen();
    error NotFrozen();
    error AlreadyChallenged();

    // ═══════════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════════

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian && msg.sender != owner) revert Unauthorized();
        _;
    }

    // ═══════════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════════

    constructor(address _pool, address _usdm) {
        if (_pool == address(0)) revert ZeroAddress();
        if (_usdm == address(0)) revert ZeroAddress();

        pool = IClimatePool(_pool);
        usdm = IERC20(_usdm);
        owner = msg.sender;
        operator = msg.sender;
        guardian = msg.sender;
    }

    // ═══════════════════════════════════════════════
    // Resolution (Operator)
    // ═══════════════════════════════════════════════

    function resolve(uint256 marketId, uint256 actualValue) external onlyOperator {
        if (actualValue > MAX_ACTUAL_VALUE) revert ValueExceedsSanityBound();

        pool.resolveMarket(marketId, actualValue);
        resolvedAt[marketId] = block.timestamp;

        emit MarketResolved(marketId, actualValue);
    }

    function resolveBatch(
        uint256[] calldata marketIds,
        uint256[] calldata actualValues
    ) external onlyOperator {
        require(marketIds.length == actualValues.length, "Length mismatch");
        require(marketIds.length <= 50, "Too many");

        for (uint256 i = 0; i < marketIds.length; i++) {
            if (actualValues[i] > MAX_ACTUAL_VALUE) revert ValueExceedsSanityBound();

            pool.resolveMarket(marketIds[i], actualValues[i]);
            resolvedAt[marketIds[i]] = block.timestamp;

            emit MarketResolved(marketIds[i], actualValues[i]);
        }
    }

    // ═══════════════════════════════════════════════
    // Public Challenge (Bonded - anyone can call)
    // ═══════════════════════════════════════════════

    /**
     * @notice Challenge a market resolution by posting a bond.
     *         Freezes the market and forces Guardian review.
     *         Bond is returned if challenge is upheld (re-resolve),
     *         or sent to climate fund if rejected (confirm).
     * @dev Caller must have approved CHALLENGE_BOND of USDm to this contract.
     */
    function challengeResolution(uint256 marketId) external {
        if (resolvedAt[marketId] == 0) revert NotResolved();
        if (block.timestamp >= resolvedAt[marketId] + CHALLENGE_WINDOW) revert ChallengeWindowClosed();
        if (frozen[marketId]) revert AlreadyFrozen();
        if (challenger[marketId] != address(0)) revert AlreadyChallenged();

        // Take bond
        usdm.safeTransferFrom(msg.sender, address(this), CHALLENGE_BOND);

        // Freeze the market
        frozen[marketId] = true;
        challenger[marketId] = msg.sender;
        challengeBondAmount[marketId] = CHALLENGE_BOND;

        emit ResolutionChallenged(marketId, msg.sender, CHALLENGE_BOND);
        emit ResolutionFrozen(marketId, msg.sender);
    }

    // ═══════════════════════════════════════════════
    // Guardian Actions (Freeze / Confirm / Re-resolve)
    // ═══════════════════════════════════════════════

    /**
     * @notice Guardian freeze (no bond required - operational override).
     *         Use when Guardian independently identifies suspicious resolution.
     */
    function freezeResolution(uint256 marketId) external onlyGuardian {
        if (resolvedAt[marketId] == 0) revert NotResolved();
        if (block.timestamp >= resolvedAt[marketId] + CHALLENGE_WINDOW) revert ChallengeWindowClosed();
        if (frozen[marketId]) revert AlreadyFrozen();

        frozen[marketId] = true;
        emit ResolutionFrozen(marketId, msg.sender);
    }

    /**
     * @notice Confirm a frozen resolution (data was correct).
     *         If a public challenge was active, the bond is slashed to climate fund.
     */
    function confirmResolution(uint256 marketId) external onlyGuardian {
        if (!frozen[marketId]) revert NotFrozen();

        frozen[marketId] = false;

        // Settle bond: challenge rejected → slash to climate fund
        _settleBond(marketId, false);

        emit ResolutionConfirmed(marketId, challenger[marketId] != address(0));
    }

    /**
     * @notice Re-resolve with corrected weather data.
     *         If a public challenge was active, the bond is returned to challenger.
     */
    function reResolve(uint256 marketId, uint256 correctedValue) external onlyGuardian {
        if (!frozen[marketId]) revert NotFrozen();
        if (correctedValue > MAX_ACTUAL_VALUE) revert ValueExceedsSanityBound();

        frozen[marketId] = false;
        resolvedAt[marketId] = block.timestamp;     // Reset challenge window

        pool.reResolveMarket(marketId, correctedValue);

        // Settle bond: challenge upheld → return to challenger
        _settleBond(marketId, true);

        emit ResolutionCorrected(marketId, correctedValue, challenger[marketId] != address(0));
    }

    /**
     * @dev Settle the challenge bond after Guardian decision.
     * @param upheld True = challenger was right → bond returned.
     *               False = challenger was wrong → bond to climate fund.
     */
    function _settleBond(uint256 marketId, bool upheld) internal {
        address challengerAddr = challenger[marketId];
        uint256 bondAmount = challengeBondAmount[marketId];

        if (challengerAddr == address(0) || bondAmount == 0) return;

        // Clear challenge state
        challenger[marketId] = address(0);
        challengeBondAmount[marketId] = 0;

        if (upheld) {
            // Return bond to challenger
            usdm.safeTransfer(challengerAddr, bondAmount);
            emit ChallengeBondReturned(marketId, challengerAddr, bondAmount);
        } else {
            // Slash bond to climate fund
            address climateFund = pool.climateFundAddress();
            usdm.safeTransfer(climateFund, bondAmount);
            emit ChallengeBondSlashed(marketId, climateFund, bondAmount);
        }
    }

    // ═══════════════════════════════════════════════
    // Cancellation (Operator)
    // ═══════════════════════════════════════════════

    function cancel(uint256 marketId) external onlyOperator {
        // If there's an active challenge bond, return it on cancellation
        _returnBondIfActive(marketId);
        pool.cancelMarket(marketId);
        emit MarketCancelled(marketId);
    }

    function _returnBondIfActive(uint256 marketId) internal {
        address challengerAddr = challenger[marketId];
        uint256 bondAmount = challengeBondAmount[marketId];
        if (challengerAddr != address(0) && bondAmount > 0) {
            challenger[marketId] = address(0);
            challengeBondAmount[marketId] = 0;
            usdm.safeTransfer(challengerAddr, bondAmount);
            emit ChallengeBondReturned(marketId, challengerAddr, bondAmount);
        }
    }

    // ═══════════════════════════════════════════════
    // Views
    // ═══════════════════════════════════════════════

    function canResolve(uint256 marketId) external view returns (bool ok, string memory reason) {
        try pool.nextMarketId() returns (uint256 nextId) {
            if (marketId == 0 || marketId >= nextId) return (false, "Invalid market ID");
        } catch {
            return (false, "Cannot read pool");
        }

        try pool.getMarketStatus(marketId) returns (
            uint256, uint256, bool resolved, bool, address, bool cancelled, uint256
        ) {
            if (resolved) return (false, "Already resolved");
            if (cancelled) return (false, "Cancelled");
        } catch {
            return (false, "Cannot read market status");
        }

        try pool.getMarket(marketId) returns (
            string memory, int256, int256, bool, uint256, uint256, uint256 endTime
        ) {
            if (block.timestamp < endTime) return (false, "Market not ended yet");
        } catch {
            return (false, "Cannot read market info");
        }

        return (true, "Ready to resolve");
    }

    function canClaim(uint256 marketId) external view returns (bool ok, string memory reason) {
        if (resolvedAt[marketId] == 0) return (false, "Not resolved via oracle");
        if (frozen[marketId]) return (false, "Resolution frozen - under review");
        if (block.timestamp < resolvedAt[marketId] + CHALLENGE_WINDOW) return (false, "Challenge window active");
        return (true, "Claims open");
    }

    function canChallenge(uint256 marketId) external view returns (bool ok, string memory reason) {
        if (resolvedAt[marketId] == 0) return (false, "Not resolved");
        if (frozen[marketId]) return (false, "Already frozen");
        if (challenger[marketId] != address(0)) return (false, "Already challenged");
        if (block.timestamp >= resolvedAt[marketId] + CHALLENGE_WINDOW) return (false, "Challenge window closed");
        return (true, "Can challenge");
    }

    function getChallengeInfo(uint256 marketId) external view returns (
        address challengerAddr,
        uint256 bondAmount,
        bool isFrozen,
        uint256 windowEnd
    ) {
        return (
            challenger[marketId],
            challengeBondAmount[marketId],
            frozen[marketId],
            resolvedAt[marketId] > 0 ? resolvedAt[marketId] + CHALLENGE_WINDOW : 0
        );
    }

    // ═══════════════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════════════

    function setPool(address _pool) external onlyOwner {
        if (_pool == address(0)) revert ZeroAddress();
        emit PoolUpdated(address(pool), _pool);
        pool = IClimatePool(_pool);
    }

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert ZeroAddress();
        emit OperatorUpdated(operator, _operator);
        operator = _operator;
    }

    function setGuardian(address _guardian) external onlyOwner {
        if (_guardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, _guardian);
        guardian = _guardian;
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
}
