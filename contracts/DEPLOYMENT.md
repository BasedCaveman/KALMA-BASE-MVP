# Kalma Base Sepolia contracts

These contracts are being deployed to Base Sepolia, not MegaETH. The current
Solidity uses standard EVM behavior only; there are no MegaETH-specific
precompiles, opcodes, RPC calls, or gas assumptions in this package.

Network:

- Chain ID: `84532`
- Currency for gas: native `ETH`
- RPC: use the official Base Sepolia RPC or a trusted provider

Deploy order for the hackathon MVP:

1. `MarketTypeRegistry`
2. `ClimatePool`
3. `ClimateOracle`

Deploy `MockUSDm` only if the team intentionally chooses a clearly labeled
Kalma test token instead of the Base Sepolia USDC already available. It is not
USDC and should not be used when configuring the production-like MVP flow.

Constructor notes:

- `MarketTypeRegistry()`
- `ClimatePool(address usdc, address platformAddress, address climateFundAddress, address marketTypeRegistry)`
- `ClimateOracle(address pool, address usdc)`

After deploying `ClimatePool`, deploy `ClimateOracle` with the pool address, then configure the pool to use the oracle if required by the selected contract version.

The faucet amount and ETH drip must be reviewed before deployment so the claim
flow matches the MVP: the ETH drip may be automatic, while test USDC is
released only after the user explicitly chooses “Deposit test credits.” When
using real Base Sepolia USDC, the faucet must hold that token and use its
verified contract address; never substitute a mainnet address or a token from
another network.

Base Sepolia uses native ETH for gas. USDC cannot pay gas without a separate paymaster or relayer.
