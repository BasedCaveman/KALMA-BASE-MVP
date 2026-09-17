// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MarketTypeRegistry
 * @notice Admin-managed registry of market types for ClimatePool.
 *
 * Allows adding new market types (snow, wind, humidity, etc.) without
 * redeploying the pool contract. ClimatePool reads from this at creation.
 *
 * Pre-registered types:
 *   1 = rain        (precipitation_sum, mm)
 *   2 = temp_high   (temperature_2m_max, °C)
 *   3 = temp_low    (temperature_2m_min, °C)
 *   4 = snow        (snowfall_sum, cm)
 */
contract MarketTypeRegistry {

    struct MarketType {
        string name;
        string metric;          // Open-Meteo daily field name
        string unit;            // Display unit
        bool active;
        uint256 minDuration;    // 0 = use pool default
        uint256 maxDuration;    // 0 = use pool default
    }

    address public owner;
    address public pendingOwner;

    uint256 public nextTypeId = 1;
    mapping(uint256 => MarketType) public marketTypes;

    event TypeRegistered(uint256 indexed typeId, string name, string metric, string unit);
    event TypeUpdated(uint256 indexed typeId, bool active);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();
    error InvalidTypeId();
    error TypeNotActive();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;

        // Pre-register 4 core types
        _register("rain", "precipitation_sum", "mm", 0, 0);
        _register("temp_high", "temperature_2m_max", "\xC2\xB0C", 0, 0);  // °C in UTF-8
        _register("temp_low", "temperature_2m_min", "\xC2\xB0C", 0, 0);
        _register("snow", "snowfall_sum", "cm", 0, 0);
    }

    function _register(
        string memory name,
        string memory metric,
        string memory unit,
        uint256 minDuration,
        uint256 maxDuration
    ) internal returns (uint256 typeId) {
        typeId = nextTypeId++;
        marketTypes[typeId] = MarketType({
            name: name,
            metric: metric,
            unit: unit,
            active: true,
            minDuration: minDuration,
            maxDuration: maxDuration
        });
        emit TypeRegistered(typeId, name, metric, unit);
    }

    // ── Admin ──

    function registerType(
        string calldata name,
        string calldata metric,
        string calldata unit,
        uint256 minDuration,
        uint256 maxDuration
    ) external onlyOwner returns (uint256 typeId) {
        typeId = _register(name, metric, unit, minDuration, maxDuration);
    }

    function setActive(uint256 typeId, bool active) external onlyOwner {
        if (typeId == 0 || typeId >= nextTypeId) revert InvalidTypeId();
        marketTypes[typeId].active = active;
        emit TypeUpdated(typeId, active);
    }

    // ── Views ──

    function isValidType(uint256 typeId) external view returns (bool) {
        return typeId > 0 && typeId < nextTypeId && marketTypes[typeId].active;
    }

    function getType(uint256 typeId) external view returns (
        string memory name, string memory metric, string memory unit,
        bool active, uint256 minDuration, uint256 maxDuration
    ) {
        if (typeId == 0 || typeId >= nextTypeId) revert InvalidTypeId();
        MarketType storage t = marketTypes[typeId];
        return (t.name, t.metric, t.unit, t.active, t.minDuration, t.maxDuration);
    }

    function getTypeCount() external view returns (uint256) {
        return nextTypeId - 1;
    }

    // ── Ownership ──

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
