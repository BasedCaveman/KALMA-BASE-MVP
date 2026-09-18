export const faucetAbi = [
  { type: 'function', name: 'claimTestCredits', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'canClaim', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'USDC_DRIP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;
