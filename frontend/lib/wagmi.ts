// kalma/frontend/lib/wagmi.ts
//
// wagmi config for the Privy integration. Replaces the Reown WagmiAdapter.
//
// createConfig here comes from @privy-io/wagmi (a drop-in for wagmi's own
// createConfig) so Privy can drive wagmi's connector state and keep the two in
// sync. The chain stays a plain viem `defineChain` keyed by the NUMERIC id 6343
// — this is what fixes the Reown bug where the embedded wallet passed the CAIP-2
// string `eip155:6343` to viem ("Cannot convert eip155:6343 to a BigInt").
//
// http() with no argument uses baseSepolia.rpcUrls.default.http[0], i.e. the
// /api/Base Sepolia-rpc proxy in the browser and carrot.Base Sepolia.com on the server
// (see lib/chain.ts), preserving the CORS-bypass strategy.

import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { baseSepolia } from './chain';

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  // Base Sepolia is fast, but the browser transport currently passes through our
  // RPC proxy. A slightly slower polling cadence cuts receipt/block polling
  // bursts without making the UI feel stale.
  pollingInterval: 8_000,
  transports: {
    [baseSepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
