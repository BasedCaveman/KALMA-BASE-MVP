'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { ThemeProvider } from '@/hooks/useTheme'
import { TranslationProvider } from '@/hooks/useTranslation'
import { CurrencyProvider } from '@/lib/currency-context'
import { UnitsProvider } from '@/lib/units-context'
import { needsWalletProvider } from '@/lib/ssr-routes'
import ThemeStyles from '@/components/design/ThemeStyles'

// `ssr: false` is deliberate: wallet state is a classic hydration-mismatch
// source. But it renders NOTHING on the server, so any route that keeps this
// provider serves an empty HTML body and is assembled by the browser. That is
// fine for the product surfaces and fatal for the pages we want cited, which
// is why the brief archive routes below skip it entirely. See lib/ssr-routes.ts.
const Web3Provider = dynamic(() => import('./Web3Provider'), { ssr: false })

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  // Same value on the server and on the client, because it is derived purely
  // from the path, so the two renders agree and nothing re-mounts.
  const wallet = needsWalletProvider(pathname)

  return (
    <ThemeProvider>
      <ThemeStyles />
      <TranslationProvider>
        <CurrencyProvider>
          <UnitsProvider>
            {wallet ? <Web3Provider>{children}</Web3Provider> : children}
          </UnitsProvider>
        </CurrencyProvider>
      </TranslationProvider>
    </ThemeProvider>
  )
}
