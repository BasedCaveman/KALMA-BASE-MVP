//kalma/frontend/components/Web3Provider.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from '@privy-io/wagmi'
import { PrivyProvider } from '@privy-io/react-auth'
import { wagmiConfig } from '@/lib/wagmi'
import { privyConfig, PRIVY_APP_ID } from '@/lib/privy'
import PrivyWagmiBridge from '@/components/PrivyWagmiBridge'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

// Provider order required by Privy: PrivyProvider → QueryClientProvider →
// WagmiProvider (the WagmiProvider here comes from @privy-io/wagmi so Privy
// drives wagmi's connector state). Mounted client-only via AppProviders'
// dynamic(ssr:false) import, so there is no SSR cookie hydration to thread.
export default function Web3Provider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {/* Keeps wagmi connected when Privy restores a session on return
              visits — otherwise every CTA's login() throws "already logged
              in" and does nothing. */}
          <PrivyWagmiBridge />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
