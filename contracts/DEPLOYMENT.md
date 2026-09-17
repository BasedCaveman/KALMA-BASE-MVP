# Kalma Base Sepolia contracts

These contracts are being deployed to Base Sepolia, not MegaETH. The current
Solidity uses standard EVM behavior only; there are no MegaETH-specific
precompiles, opcodes, RPC calls, or gas assumptions in this package.

Network:

- Chain ID: `84532`
- Currency for gas: native `ETH`
- RPC: use the official Base Sepolia RPC or a trusted provider

Deploy order for the hackathon MVP:

1. `FaucetBS`
2. `MarketTypeRegistryBS`
3. `ClimatePoolBS`
4. `ClimateOracleBS`

Constructor notes:

- `FaucetBS(address usdc, address initialOwner)`
- `MarketTypeRegistryBS()`
- `ClimatePoolBS(address usdc, address platformAddress, address climateFundAddress, address marketTypeRegistry)`
- `ClimateOracleBS(address pool, address usdc)`

Official Circle USDC on Base Sepolia:

`0x036CbD53842c5426634e7929541eC2318f3dCF7e`

USDC uses 6 decimals. Verify the balance and network in the explorer before
funding the faucet.

Deployment addresses:

- `MarketTypeRegistryBS`: `0xbE4D6EC834e786D272b7Ff8A90cEc969590499db`
- `FaucetBS`: `0x45176C683A245e84c9ee3f56242532031490a005`
- `ClimatePoolBS`: `0x770a62F413B42B05B827F2beBe118d34B899f97D`
- `ClimateOracleBS`: `0xf076af5EDDc6A14a3d879E77F743630574155298`

After deployment, fund `FaucetBS` with Base Sepolia ETH for the `0.001 ETH`
drip and transfer Base Sepolia USDC to it for the `100 USDC` test-credit
claim. Test `dripEthFor(user)` first, then test `claimTestCredits()` from a
user account.

After deploying `ClimatePoolBS`, deploy `ClimateOracleBS` with the pool address, then call `ClimatePoolBS.setOracle(oracleAddress)` from the pool owner.

The faucet amount and ETH drip must be reviewed before deployment so the claim
flow matches the MVP: the ETH drip may be automatic, while test USDC is
released only after the user explicitly chooses “Deposit test credits.” When
using real Base Sepolia USDC, the faucet must hold that token and use its
verified contract address; never substitute a mainnet address or a token from
another network.

Base Sepolia uses native ETH for gas. USDC cannot pay gas without a separate paymaster or relayer.
