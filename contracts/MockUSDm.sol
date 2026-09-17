// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDm is ERC20, Ownable {
    // Test-only allocation released after the user explicitly chooses
    // “Deposit test credits” in the MVP.
    uint256 public constant FAUCET_AMOUNT = 100 * 1e18;
    uint256 public constant FAUCET_COOLDOWN = 24 hours;
    uint256 public constant ETH_DRIP = 0.001 ether;

    mapping(address => uint256) public lastFaucetClaim;

    error FaucetCooldown(uint256 nextClaimAt);
    error EthTransferFailed();

    event FaucetClaimed(address indexed user, uint256 usdmAmount, uint256 ethAmount);

    constructor(address initialOwner) ERC20("Mock USDm", "USDm") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function faucet() external {
        _claimFaucet(msg.sender);
    }

    /// @notice Testnet-only relayer/admin path so a backend can sponsor faucet claims
    /// for wallets that have zero native gas.
    function faucetFor(address user) external onlyOwner {
        _claimFaucet(user);
    }

    function canClaimFaucet(address user) external view returns (bool) {
        return block.timestamp >= lastFaucetClaim[user] + FAUCET_COOLDOWN;
    }

    function timeUntilNextClaim(address user) external view returns (uint256) {
        uint256 nextClaim = lastFaucetClaim[user] + FAUCET_COOLDOWN;
        if (block.timestamp >= nextClaim) return 0;
        return nextClaim - block.timestamp;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    function _claimFaucet(address user) internal {
        uint256 nextClaim = lastFaucetClaim[user] + FAUCET_COOLDOWN;
        if (block.timestamp < nextClaim) revert FaucetCooldown(nextClaim);

        lastFaucetClaim[user] = block.timestamp;
        _mint(user, FAUCET_AMOUNT);

        uint256 ethSent = 0;
        if (address(this).balance >= ETH_DRIP) {
            (bool ok, ) = payable(user).call{value: ETH_DRIP}("");
            if (!ok) revert EthTransferFailed();
            ethSent = ETH_DRIP;
        }

        emit FaucetClaimed(user, FAUCET_AMOUNT, ethSent);
    }

    receive() external payable {}
}
