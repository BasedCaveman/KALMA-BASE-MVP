//frontend/lib/contracts/climatePool.ts
//
// Full ABI, pulled from Sourcify's verified build of the deployed V7 pool
// (0x2EDF293B71A524c53EaA1EdBF146b70AA40BCE49, exact_match, 2026-08-27) rather
// than hand-maintained. The previous version of this file covered 35 of the
// contract's 100 functions, 8 of 23 events, and 0 of 52 custom errors, found
// while wiring the v7 hardening pass (claimForBatch, abandonMarket,
// withdrawCreatorEarningsMultiple were missing entry points). Zero errors
// meant every revert in the app decoded as an opaque selector rather than a
// name, not just for the three new functions. Regenerate the same way after
// any future contract change: fetch from Sourcify, don't hand-edit.
export const climatePoolAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_usdm',
        type: 'address',
      },
      {
        name: '_platformAddress',
        type: 'address',
      },
      {
        name: '_climateFundAddress',
        type: 'address',
      },
      {
        name: '_marketTypeRegistry',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'AbandonGraceActive',
    type: 'error',
    inputs: [],
  },
  {
    name: 'AddressEmptyCode',
    type: 'error',
    inputs: [
      {
        name: 'target',
        type: 'address',
      },
    ],
  },
  {
    name: 'AddressInsufficientBalance',
    type: 'error',
    inputs: [
      {
        name: 'account',
        type: 'address',
      },
    ],
  },
  {
    name: 'AlreadyClaimed',
    type: 'error',
    inputs: [],
  },
  {
    name: 'BatchTooLarge',
    type: 'error',
    inputs: [],
  },
  {
    name: 'CancelWindowClosed',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ChallengeWindowActive',
    type: 'error',
    inputs: [],
  },
  {
    name: 'CityNameTooLong',
    type: 'error',
    inputs: [],
  },
  {
    name: 'DuplicateCooldown',
    type: 'error',
    inputs: [],
  },
  {
    name: 'DuplicateMarket',
    type: 'error',
    inputs: [],
  },
  {
    name: 'EnforcedPause',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ExpectedPause',
    type: 'error',
    inputs: [],
  },
  {
    name: 'FailedInnerCall',
    type: 'error',
    inputs: [],
  },
  {
    name: 'FeeTooHigh',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InsufficientSeed',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidCoordinates',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidDuration',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidFeeConfig',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidHistoricalAvg',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidMarketId',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidMarketType',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidStartTime',
    type: 'error',
    inputs: [],
  },
  {
    name: 'InvalidYieldConfig',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MarketAlreadyResolved',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MarketClosed',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MarketNotActive',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MarketNotCancelled',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MarketNotEnded',
    type: 'error',
    inputs: [],
  },
  {
    name: 'MarketNotResolved',
    type: 'error',
    inputs: [],
  },
  {
    name: 'NotChallenged',
    type: 'error',
    inputs: [],
  },
  {
    name: 'NotReResolvable',
    type: 'error',
    inputs: [],
  },
  {
    name: 'NothingToClaim',
    type: 'error',
    inputs: [],
  },
  {
    name: 'OracleTimelockActive',
    type: 'error',
    inputs: [],
  },
  {
    name: 'PermitDeadlinePassed',
    type: 'error',
    inputs: [],
  },
  {
    name: 'PoolSizeCapReached',
    type: 'error',
    inputs: [],
  },
  {
    name: 'PredictionsClosed',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ReentrancyGuardReentrantCall',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ResolutionFrozen',
    type: 'error',
    inputs: [],
  },
  {
    name: 'SafeERC20FailedOperation',
    type: 'error',
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
    ],
  },
  {
    name: 'SeedExceedsMaxPoolSize',
    type: 'error',
    inputs: [],
  },
  {
    name: 'StrategyTimelockActive',
    type: 'error',
    inputs: [],
  },
  {
    name: 'TooManyActiveMarkets',
    type: 'error',
    inputs: [],
  },
  {
    name: 'Unauthorized',
    type: 'error',
    inputs: [],
  },
  {
    name: 'UnsupportedTokenDecimals',
    type: 'error',
    inputs: [],
  },
  {
    name: 'YieldAlreadyDeposited',
    type: 'error',
    inputs: [],
  },
  {
    name: 'YieldDisabled',
    type: 'error',
    inputs: [],
  },
  {
    name: 'YieldNotDeposited',
    type: 'error',
    inputs: [],
  },
  {
    name: 'YieldNotEligible',
    type: 'error',
    inputs: [],
  },
  {
    name: 'YieldRecallTooLate',
    type: 'error',
    inputs: [],
  },
  {
    name: 'YieldStillDeposited',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ZeroAddress',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ZeroAmount',
    type: 'error',
    inputs: [],
  },
  {
    name: 'Claimed',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'user',
        type: 'address',
        indexed: true,
      },
      {
        name: 'payout',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'ClaimedFor',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'user',
        type: 'address',
        indexed: true,
      },
      {
        name: 'keeper',
        type: 'address',
        indexed: true,
      },
      {
        name: 'payout',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'ClimateFundWithdrawn',
    type: 'event',
    inputs: [
      {
        name: 'to',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'caller',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'CreatorEarningsPaid',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'caller',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'FeeConfigUpdated',
    type: 'event',
    inputs: [
      {
        name: 'feeBps',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'platformShare',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'creatorShare',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'climateShare',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'MarketCancelled',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'MarketCreated',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'cityName',
        type: 'string',
        indexed: false,
      },
      {
        name: 'creator',
        type: 'address',
        indexed: true,
      },
      {
        name: 'marketTypeId',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'startTime',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'endTime',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'MarketReResolved',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'newOutcome',
        type: 'bool',
        indexed: false,
      },
      {
        name: 'correctedValue',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'MarketResolved',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'outcome',
        type: 'bool',
        indexed: false,
      },
      {
        name: 'actualValue',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'MaxPoolSizeUpdated',
    type: 'event',
    inputs: [
      {
        name: 'oldCap',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newCap',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'OracleUpdated',
    type: 'event',
    inputs: [
      {
        name: 'oldOracle',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOracle',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'OwnershipTransferred',
    type: 'event',
    inputs: [
      {
        name: 'oldOwner',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'Paused',
    type: 'event',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'PlatformFeesWithdrawn',
    type: 'event',
    inputs: [
      {
        name: 'to',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'caller',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'PositionTaken',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'user',
        type: 'address',
        indexed: true,
      },
      {
        name: 'isAbove',
        type: 'bool',
        indexed: false,
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'Unpaused',
    type: 'event',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldClimateShareUpdated',
    type: 'event',
    inputs: [
      {
        name: 'climateShareBps',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldDeposited',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldHarvested',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'principal',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'yieldAmount',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'toClimate',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'toTreasury',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldShortfall',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'shortfall',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldStrategyProposed',
    type: 'event',
    inputs: [
      {
        name: 'strategy',
        type: 'address',
        indexed: true,
      },
      {
        name: 'eta',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldStrategyUpdated',
    type: 'event',
    inputs: [
      {
        name: 'oldStrategy',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newStrategy',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'YieldWithdrawn',
    type: 'event',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'ABANDON_GRACE',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'CANCEL_LATE_GRACE',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'CANCEL_WINDOW_DIVISOR',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'DUPLICATE_COOLDOWN',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'LOCATION_GRID_STEP',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_ACTIVE_MARKETS_PER_CREATOR',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_CHALLENGE_WINDOW',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_CITY_NAME_LENGTH',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_CLAIM_BATCH',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_FEE_BPS',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_FREEZE',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_MARKET_DURATION',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_SCHEDULE_AHEAD',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_SINGLE_SHARE_BPS',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MAX_TOKEN_DECIMALS',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MIN_CLIMATE_SHARE_BPS',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MIN_MARKET_DURATION',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MIN_TOKEN_DECIMALS',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'MULTIPLIER_PRECISION',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'STRATEGY_TIMELOCK',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'YIELD_MIN_DURATION',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'YIELD_RECALL_BUFFER',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'abandonMarket',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'acceptOracle',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'acceptOwnership',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'acceptYieldStrategy',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'activeMarketCount',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'calculatePayout',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'isAbove',
        type: 'bool',
      },
      {
        name: 'amount',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'payout',
        type: 'uint256',
      },
      {
        name: 'netPayout',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'cancelMarket',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'cellLastMarket',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'claim',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'netPayout',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'claimForBatch',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'users',
        type: 'address[]',
      },
    ],
    outputs: [
      {
        name: 'totalPaid',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'claimMultiple',
    type: 'function',
    inputs: [
      {
        name: 'marketIds',
        type: 'uint256[]',
      },
    ],
    outputs: [
      {
        name: 'totalPayout',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'claimRefund',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'climateFundAddress',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'climateFundBalance',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'climateShareBps',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'createMarketWithSeed',
    type: 'function',
    inputs: [
      {
        name: 'cityName',
        type: 'string',
      },
      {
        name: 'lat',
        type: 'int256',
      },
      {
        name: 'lon',
        type: 'int256',
      },
      {
        name: 'marketTypeId',
        type: 'uint256',
      },
      {
        name: 'historicalAvg',
        type: 'uint256',
      },
      {
        name: 'startTimestamp',
        type: 'uint256',
      },
      {
        name: 'durationDays',
        type: 'uint256',
      },
      {
        name: 'seedAmount',
        type: 'uint256',
      },
      {
        name: 'seedIsAbove',
        type: 'bool',
      },
    ],
    outputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'creatorShareBps',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'depositToStrategy',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'feeBps',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getFeeConfig',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '_feeBps',
        type: 'uint256',
      },
      {
        name: '_platformShare',
        type: 'uint256',
      },
      {
        name: '_creatorShare',
        type: 'uint256',
      },
      {
        name: '_climateShare',
        type: 'uint256',
      },
      {
        name: '_platformAddress',
        type: 'address',
      },
      {
        name: '_climateFundAddress',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getMarket',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'cityName',
        type: 'string',
      },
      {
        name: 'lat',
        type: 'int256',
      },
      {
        name: 'lon',
        type: 'int256',
      },
      {
        name: 'isRainMarket',
        type: 'bool',
      },
      {
        name: 'historicalAvg',
        type: 'uint256',
      },
      {
        name: 'startTime',
        type: 'uint256',
      },
      {
        name: 'endTime',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getMarketStatus',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'abovePool',
        type: 'uint256',
      },
      {
        name: 'belowPool',
        type: 'uint256',
      },
      {
        name: 'resolved',
        type: 'bool',
      },
      {
        name: 'outcome',
        type: 'bool',
      },
      {
        name: 'creator',
        type: 'address',
      },
      {
        name: 'cancelled',
        type: 'bool',
      },
      {
        name: '_creatorEarnings',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getMarketV5',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'cityName',
        type: 'string',
      },
      {
        name: 'lat',
        type: 'int256',
      },
      {
        name: 'lon',
        type: 'int256',
      },
      {
        name: 'marketTypeId',
        type: 'uint256',
      },
      {
        name: 'historicalAvg',
        type: 'uint256',
      },
      {
        name: 'startTime',
        type: 'uint256',
      },
      {
        name: 'endTime',
        type: 'uint256',
      },
      {
        name: 'predictionDeadline',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getOdds',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'abovePct',
        type: 'uint256',
      },
      {
        name: 'belowPct',
        type: 'uint256',
      },
      {
        name: 'aboveMultiplier',
        type: 'uint256',
      },
      {
        name: 'belowMultiplier',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getParticipantCount',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getRemainingPool',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getResolutionDetails',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'actualValue',
        type: 'uint256',
      },
      {
        name: 'resolvedAt',
        type: 'uint256',
      },
      {
        name: 'resolved',
        type: 'bool',
      },
      {
        name: 'outcome',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getUserPosition',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'user',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: 'aboveAmount',
        type: 'uint256',
      },
      {
        name: 'belowAmount',
        type: 'uint256',
      },
      {
        name: 'claimed',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'marketInfo',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'cityName',
        type: 'string',
      },
      {
        name: 'lat',
        type: 'int256',
      },
      {
        name: 'lon',
        type: 'int256',
      },
      {
        name: 'marketTypeId',
        type: 'uint256',
      },
      {
        name: 'historicalAvg',
        type: 'uint256',
      },
      {
        name: 'startTime',
        type: 'uint256',
      },
      {
        name: 'endTime',
        type: 'uint256',
      },
      {
        name: 'predictionDeadline',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'marketState',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'abovePool',
        type: 'uint256',
      },
      {
        name: 'belowPool',
        type: 'uint256',
      },
      {
        name: 'remainingPool',
        type: 'uint256',
      },
      {
        name: 'resolved',
        type: 'bool',
      },
      {
        name: 'outcome',
        type: 'bool',
      },
      {
        name: 'cancelled',
        type: 'bool',
      },
      {
        name: 'actualValue',
        type: 'uint256',
      },
      {
        name: 'resolvedAt',
        type: 'uint256',
      },
      {
        name: 'creator',
        type: 'address',
      },
      {
        name: 'creatorEarnings',
        type: 'uint256',
      },
      {
        name: 'participantCount',
        type: 'uint256',
      },
      {
        name: 'feeBpsAtResolution',
        type: 'uint256',
      },
      {
        name: 'platformShareAtResolution',
        type: 'uint256',
      },
      {
        name: 'creatorShareAtResolution',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'marketTypeRegistry',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'maxPoolSize',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'minPosition',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'minSeed',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'nextMarketId',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'oracle',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'owner',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pause',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'paused',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pendingOracle',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pendingOracleEta',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pendingOwner',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pendingYieldStrategy',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pendingYieldStrategyEta',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'platformAddress',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'platformBalance',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'platformShareBps',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'predict',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'isAbove',
        type: 'bool',
      },
      {
        name: 'amount',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'predictWithPermit',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'isAbove',
        type: 'bool',
      },
      {
        name: 'amount',
        type: 'uint256',
      },
      {
        name: 'deadline',
        type: 'uint256',
      },
      {
        name: 'v',
        type: 'uint8',
      },
      {
        name: 'r',
        type: 'bytes32',
      },
      {
        name: 's',
        type: 'bytes32',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'proposeOracle',
    type: 'function',
    inputs: [
      {
        name: '_oracle',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'proposeYieldStrategy',
    type: 'function',
    inputs: [
      {
        name: '_strategy',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'reResolveMarket',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'correctedValue',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'resolveMarket',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
      {
        name: 'actualValue',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setMarketTypeRegistry',
    type: 'function',
    inputs: [
      {
        name: '_registry',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setOracle',
    type: 'function',
    inputs: [
      {
        name: '_oracle',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setYieldStrategy',
    type: 'function',
    inputs: [
      {
        name: '_strategy',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'totalYieldHarvested',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'transferOwnership',
    type: 'function',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'unpause',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateFeeAddresses',
    type: 'function',
    inputs: [
      {
        name: '_platform',
        type: 'address',
      },
      {
        name: '_climate',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateFeeBps',
    type: 'function',
    inputs: [
      {
        name: 'newFeeBps',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateFeeShares',
    type: 'function',
    inputs: [
      {
        name: '_platform',
        type: 'uint256',
      },
      {
        name: '_creator',
        type: 'uint256',
      },
      {
        name: '_climate',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateMaxPoolSize',
    type: 'function',
    inputs: [
      {
        name: 'newCap',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateYieldClimateShare',
    type: 'function',
    inputs: [
      {
        name: 'climateBps',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'usdm',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'usdmDecimals',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'userPositions',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
      {
        name: '',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: 'aboveAmount',
        type: 'uint256',
      },
      {
        name: 'belowAmount',
        type: 'uint256',
      },
      {
        name: 'claimed',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'verifyAccounting',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: 'balanced',
        type: 'bool',
      },
      {
        name: 'discrepancy',
        type: 'int256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'withdrawClimateFund',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'withdrawCreatorEarnings',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'withdrawCreatorEarningsMultiple',
    type: 'function',
    inputs: [
      {
        name: 'marketIds',
        type: 'uint256[]',
      },
    ],
    outputs: [
      {
        name: 'totalPaid',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'withdrawFromStrategy',
    type: 'function',
    inputs: [
      {
        name: 'marketId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'withdrawPlatformFees',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'yieldClimateShareBps',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'yieldDeposited',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'yieldPrincipal',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'yieldShares',
    type: 'function',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'yieldStrategy',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
] as const;
