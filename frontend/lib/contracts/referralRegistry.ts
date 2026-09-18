//frontend/lib/contracts/referralRegistry.ts
//
// Full ABI, pulled from Sourcify's verified build of the deployed
// KalmaReferralRegistry (0x2A470bDfb9DDfbcF57b02726474100cA317f3e53,
// exact_match, 2026-09-15) rather than hand-maintained. Standalone,
// permissionless, first-touch referral attribution; see
// MAINNET-PREVIEW-V7/contracts/KalmaReferralRegistry.sol and D-16 in
// docs/V7_ARCHITECTURE_EVOLUTION_LOG.md. This is the attribution half only:
// automatic payout needs a ClimatePool core change and does not exist yet.
// Not wired into any UI surface yet. Regenerate the same way after any
// future contract change: fetch from Sourcify, don't hand-edit.
export const referralRegistryAbi = [
  {
    name: 'AlreadySet',
    type: 'error',
    inputs: [],
  },
  {
    name: 'SelfReferral',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ZeroReferrer',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ReferralSet',
    type: 'event',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
      },
      {
        name: 'referrer',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'hasReferrer',
    type: 'function',
    inputs: [
      {
        name: 'user',
        type: 'address',
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
    name: 'referrerOf',
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
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'setReferrer',
    type: 'function',
    inputs: [
      {
        name: 'referrer',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
