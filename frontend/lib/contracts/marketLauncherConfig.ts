//frontend/lib/contracts/marketLauncherConfig.ts
export const marketLauncherConfigAbi = [
  {
    type: 'function',
    name: 'defaultPoolId',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDefaultPool',
    inputs: [],
    outputs: [
      { name: 'poolId', type: 'uint256' },
      { name: 'pool', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPool',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: [
      { name: 'pool', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
  },
] as const;
