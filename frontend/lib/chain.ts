import { defineChain } from 'viem';

export const RECEIPT_POLL_INTERVAL_MS = 1_000;

export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia.base.org'] },
    public: { http: ['https://sepolia.base.org'] },
  },
  blockExplorers: { default: { name: 'Basescan', url: 'https://sepolia.basescan.org' } },
  contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11' } },
});
