// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FaucetBS
 * @notice Base Sepolia testnet faucet for the silent Privy onboarding flow.
 *
 * ETH is sent by the trusted backend after account creation. The user must
 * explicitly call claimTestCredits after choosing “Deposit test credits”.
 * This contract is testnet-only and must never be funded with mainnet assets.
 */
contract FaucetBS is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant USDC_DECIMALS = 1e6;
    uint256 public constant USDC_DRIP = 100 * USDC_DECIMALS;
    uint256 public constant ETH_DRIP = 0.001 ether;

    IERC20 public immutable usdc;
    address public owner;
    address public pendingOwner;
    mapping(address => bool) public hasClaimed;

    error Unauthorized();
    error ZeroAddress();
    error AlreadyClaimed();
    error InsufficientETH();
    error EthTransferFailed();

    event OwnershipTransferStarted(address indexed oldOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event EthDripped(address indexed user, uint256 amount);
    event TestCreditsClaimed(address indexed user, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _usdc, address initialOwner) {
        if (_usdc == address(0) || initialOwner == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    /// @notice Backend-sponsored native gas drip after Privy account creation.
    function dripEthFor(address user) external onlyOwner nonReentrant {
        if (user == address(0)) revert ZeroAddress();
        if (address(this).balance < ETH_DRIP) revert InsufficientETH();
        (bool ok, ) = payable(user).call{value: ETH_DRIP}("");
        if (!ok) revert EthTransferFailed();
        emit EthDripped(user, ETH_DRIP);
    }

    /// @notice Explicit user action behind “Deposit test credits”.
    function claimTestCredits() external nonReentrant {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        hasClaimed[msg.sender] = true;
        usdc.safeTransfer(msg.sender, USDC_DRIP);
        emit TestCreditsClaimed(msg.sender, USDC_DRIP);
    }

    function canClaim(address user) external view returns (bool) {
        return !hasClaimed[user];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address oldOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function withdrawUSDC(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        usdc.safeTransfer(to, amount);
    }

    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    receive() external payable {}
}
