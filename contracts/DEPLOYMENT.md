# Kalma Base Sepolia contracts

Deploy order for the hackathon MVP:

1. `MockUSDm` only if an approved Base Sepolia test token is unavailable.
2. `MarketTypeRegistry`
3. `ClimatePool`
4. `ClimateOracle`

Constructor notes:

- `MockUSDm(address initialOwner)`
- `MarketTypeRegistry()`
- `ClimatePool(address usdm, address platformAddress, address climateFundAddress, address marketTypeRegistry)`
- `ClimateOracle(address pool, address usdm)`

After deploying `ClimatePool`, deploy `ClimateOracle` with the pool address, then configure the pool to use the oracle if required by the selected contract version.

The current `MockUSDm` is a test-only token and is not USDC. Do not present it as real USDC. The faucet amount and ETH drip must be reviewed before deployment so the claim flow matches the MVP: the ETH drip may be automatic, while test USDC is released only after the user explicitly chooses “Deposit test credits.”

Base Sepolia uses native ETH for gas. USDC cannot pay gas without a separate paymaster or relayer.
