//frontend/lib/contracts/climateOracle.ts
export const climateOracleAbi = [
  // Public constants
  {
    type: 'function',
    name: 'CHALLENGE_WINDOW',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'CHALLENGE_BOND',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },

  // Public state
  {
    type: 'function',
    name: 'pool',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdm',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingOwner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'operator',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'guardian',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'resolvedAt',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'frozen',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'challenger',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'challengeBondAmount',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },

  // Views
  {
    type: 'function',
    name: 'canResolve',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'ok', type: 'bool' },
      { name: 'reason', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'canClaim',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'ok', type: 'bool' },
      { name: 'reason', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'canChallenge',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'ok', type: 'bool' },
      { name: 'reason', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getChallengeInfo',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'challengerAddr', type: 'address' },
      { name: 'bondAmount', type: 'uint256' },
      { name: 'isFrozen', type: 'bool' },
      { name: 'windowEnd', type: 'uint256' },
    ],
    stateMutability: 'view',
  },

  // Operator / public / guardian actions
  {
    type: 'function',
    name: 'resolve',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'actualValue', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'resolveBatch',
    inputs: [
      { name: 'marketIds', type: 'uint256[]' },
      { name: 'actualValues', type: 'uint256[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'challengeResolution',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'freezeResolution',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'confirmResolution',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reResolve',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'correctedValue', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancel',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // Admin
  {
    type: 'function',
    name: 'setPool',
    inputs: [{ name: '_pool', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setOperator',
    inputs: [{ name: '_operator', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setGuardian',
    inputs: [{ name: '_guardian', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // Events
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'actualValue', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ResolutionChallenged',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'challenger', type: 'address', indexed: true },
      { name: 'bond', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ResolutionFrozen',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ResolutionConfirmed',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'challengeRejected', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ResolutionCorrected',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'correctedValue', type: 'uint256', indexed: false },
      { name: 'challengeUpheld', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ChallengeBondReturned',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'challenger', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ChallengeBondSlashed',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'climateFund', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MarketCancelled',
    inputs: [{ name: 'marketId', type: 'uint256', indexed: true }],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolUpdated',
    inputs: [
      { name: 'oldPool', type: 'address', indexed: true },
      { name: 'newPool', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'oldOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OperatorUpdated',
    inputs: [
      { name: 'oldOperator', type: 'address', indexed: true },
      { name: 'newOperator', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'GuardianUpdated',
    inputs: [
      { name: 'oldGuardian', type: 'address', indexed: true },
      { name: 'newGuardian', type: 'address', indexed: true },
    ],
    anonymous: false,
  },
] as const;
