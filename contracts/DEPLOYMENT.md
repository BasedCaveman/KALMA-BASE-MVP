# Kalma Base Sepolia contracts

These contracts are being deployed to Base Sepolia, not MegaETH. The current
Solidity uses standard EVM behavior only; there are no MegaETH-specific
precompiles, opcodes, RPC calls, or gas assumptions in this package.

Network:

- Chain ID: `84532`
- Currency for gas: native `ETH`
- RPC: use the official Base Sepolia RPC or a trusted provider

Deploy order for the hackathon MVP:

1. `MarketTypeRegistryBS`
2. `ClimatePoolBS`
3. `ClimateOracleBS`

Constructor notes:

- `MarketTypeRegistryBS()`
- `ClimatePoolBS(address usdc, address platformAddress, address climateFundAddress, address marketTypeRegistry)`
- `ClimateOracleBS(address pool, address usdc)`

Official Circle USDC on Base Sepolia:

`0x036CbD53842c5426634e7929541eC2318f3dCF7e`

USDC uses 6 decimals. Verify the balance and network in the explorer before
funding the faucet.

Deployment addresses:

- `MarketTypeRegistryBS`: `0xbE4D6EC834e786D272b7Ff8A90cEc969590499db`
- `ClimatePoolBS`: pending deployment
- `ClimateOracleBS`: pending deployment

After deploying `ClimatePoolBS`, deploy `ClimateOracleBS` with the pool address, then call `ClimatePoolBS.setOracle(oracleAddress)` from the pool owner.

The faucet amount and ETH drip must be reviewed before deployment so the claim
flow matches the MVP: the ETH drip may be automatic, while test USDC is
released only after the user explicitly chooses “Deposit test credits.” When
using real Base Sepolia USDC, the faucet must hold that token and use its
verified contract address; never substitute a mainnet address or a token from
another network.

Base Sepolia uses native ETH for gas. USDC cannot pay gas without a separate paymaster or relayer.
