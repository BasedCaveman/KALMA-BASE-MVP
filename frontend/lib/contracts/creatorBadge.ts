//frontend/lib/contracts/creatorBadge.ts
//
// Full ABI, pulled from Sourcify's verified build of the deployed
// KalmaCreatorBadge (0xC09D602D3db9A48CC4AE97e50B506b5e1229cb0A, exact_match,
// 2026-09-15) rather than hand-maintained. Standalone, permissionless,
// non-transferable badge for a market's creator; see
// MAINNET-PREVIEW-V7/contracts/KalmaCreatorBadge.sol and D-16 in
// docs/V7_ARCHITECTURE_EVOLUTION_LOG.md. Not deployed from this contract,
// not wired into any UI surface yet: mintFor(marketId) is permissionless,
// tokenURI(tokenId) is fully on-chain. Regenerate the same way after any
// future contract change: fetch from Sourcify, don't hand-edit.
export const creatorBadgeAbi = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_climatePool',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'AlreadyMinted',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ERC721IncorrectOwner',
    type: 'error',
    inputs: [
      {
        name: 'sender',
        type: 'address',
      },
      {
        name: 'tokenId',
        type: 'uint256',
      },
      {
        name: 'owner',
        type: 'address',
      },
    ],
  },
  {
    name: 'ERC721InsufficientApproval',
    type: 'error',
    inputs: [
      {
        name: 'operator',
        type: 'address',
      },
      {
        name: 'tokenId',
        type: 'uint256',
      },
    ],
  },
  {
    name: 'ERC721InvalidApprover',
    type: 'error',
    inputs: [
      {
        name: 'approver',
        type: 'address',
      },
    ],
  },
  {
    name: 'ERC721InvalidOperator',
    type: 'error',
    inputs: [
      {
        name: 'operator',
        type: 'address',
      },
    ],
  },
  {
    name: 'ERC721InvalidOwner',
    type: 'error',
    inputs: [
      {
        name: 'owner',
        type: 'address',
      },
    ],
  },
  {
    name: 'ERC721InvalidReceiver',
    type: 'error',
    inputs: [
      {
        name: 'receiver',
        type: 'address',
      },
    ],
  },
  {
    name: 'ERC721InvalidSender',
    type: 'error',
    inputs: [
      {
        name: 'sender',
        type: 'address',
      },
    ],
  },
  {
    name: 'ERC721NonexistentToken',
    type: 'error',
    inputs: [
      {
        name: 'tokenId',
        type: 'uint256',
      },
    ],
  },
  {
    name: 'NoCreator',
    type: 'error',
    inputs: [],
  },
  {
    name: 'SoulboundToken',
    type: 'error',
    inputs: [],
  },
  {
    name: 'StringsInsufficientHexLength',
    type: 'error',
    inputs: [
      {
        name: 'value',
        type: 'uint256',
      },
      {
        name: 'length',
        type: 'uint256',
      },
    ],
  },
  {
    name: 'TokenDoesNotExist',
    type: 'error',
    inputs: [],
  },
  {
    name: 'ZeroAddress',
    type: 'error',
    inputs: [],
  },
  {
    name: 'Approval',
    type: 'event',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
      },
      {
        name: 'approved',
        type: 'address',
        indexed: true,
      },
      {
        name: 'tokenId',
        type: 'uint256',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'ApprovalForAll',
    type: 'event',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
      },
      {
        name: 'operator',
        type: 'address',
        indexed: true,
      },
      {
        name: 'approved',
        type: 'bool',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    name: 'BadgeMinted',
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
    ],
    anonymous: false,
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      {
        name: 'from',
        type: 'address',
        indexed: true,
      },
      {
        name: 'to',
        type: 'address',
        indexed: true,
      },
      {
        name: 'tokenId',
        type: 'uint256',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      {
        name: 'to',
        type: 'address',
      },
      {
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      {
        name: 'owner',
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
    name: 'climatePool',
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
    name: 'getApproved',
    type: 'function',
    inputs: [
      {
        name: 'tokenId',
        type: 'uint256',
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
    name: 'isApprovedForAll',
    type: 'function',
    inputs: [
      {
        name: 'owner',
        type: 'address',
      },
      {
        name: 'operator',
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
    name: 'mintFor',
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
    name: 'minted',
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
    name: 'name',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [
      {
        name: 'tokenId',
        type: 'uint256',
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
    name: 'safeTransferFrom',
    type: 'function',
    inputs: [
      {
        name: 'from',
        type: 'address',
      },
      {
        name: 'to',
        type: 'address',
      },
      {
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'safeTransferFrom',
    type: 'function',
    inputs: [
      {
        name: 'from',
        type: 'address',
      },
      {
        name: 'to',
        type: 'address',
      },
      {
        name: 'tokenId',
        type: 'uint256',
      },
      {
        name: 'data',
        type: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setApprovalForAll',
    type: 'function',
    inputs: [
      {
        name: 'operator',
        type: 'address',
      },
      {
        name: 'approved',
        type: 'bool',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'supportsInterface',
    type: 'function',
    inputs: [
      {
        name: 'interfaceId',
        type: 'bytes4',
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
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'tokenURI',
    type: 'function',
    inputs: [
      {
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'transferFrom',
    type: 'function',
    inputs: [
      {
        name: 'from',
        type: 'address',
      },
      {
        name: 'to',
        type: 'address',
      },
      {
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
