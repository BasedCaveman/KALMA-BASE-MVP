//frontend/lib/contracts/marketTypeRegistry.ts
export const marketTypeRegistryAbi = [
  {
    type: 'function',
    name: 'isValidType',
    inputs: [{ name: 'typeId', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getType',
    inputs: [{ name: 'typeId', type: 'uint256' }],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'metric', type: 'string' },
      { name: 'unit', type: 'string' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
  },
] as const;
