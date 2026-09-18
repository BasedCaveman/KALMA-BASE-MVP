//kalma/frontend/components/shared/CreatorEarningsAutoCollect.tsx
//
// Mount-once side-effect: silently delivers pending creator earnings to
// embedded-wallet creators on app open. Renders nothing. See
// hooks/useAutoCollectCreatorEarnings for the why + the guards.
//
// Two components on purpose. The default export is a GATE that decides
// whether the effect should run at all; the inner component is the one that
// calls the hook. The split exists because the routes in lib/ssr-routes.ts
// render without Web3Provider so their HTML reaches AI crawlers, and this was
// the one piece of layout chrome with wallet coupling (via
// useAutoCollectCreatorEarnings -> useWriteContract -> wagmi). Rendered there
// it threw `useConfig must be used within WagmiProvider` during SSR, React
// bailed out, and the page went back to serving an empty body: the exact
// failure the SSR change was meant to fix, arriving from the layout instead
// of the page.
//
// Gating the CHILD rather than the hook is deliberate. A conditional
// `useAutoCollectCreatorEarnings()` would break the rules of hooks on client
// navigation between a brief page and a product page; conditionally rendering
// a component is legal and mounts/unmounts correctly across that boundary.
//
// Nothing is lost by skipping it here: the brief archive is public, anonymous
// and read-only, so there is no connected creator to deliver earnings to.
'use client';

import { usePathname } from 'next/navigation';
import { useAutoCollectCreatorEarnings } from '@/hooks/useAutoCollectCreatorEarnings';
import { needsWalletProvider } from '@/lib/ssr-routes';

function AutoCollect() {
  useAutoCollectCreatorEarnings();
  return null;
}

export default function CreatorEarningsAutoCollect() {
  const pathname = usePathname() ?? '';
  if (!needsWalletProvider(pathname)) return null;
  return <AutoCollect />;
}
