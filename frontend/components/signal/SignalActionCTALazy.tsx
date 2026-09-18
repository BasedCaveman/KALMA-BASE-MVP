//kalma/frontend/components/signal/SignalActionCTALazy.tsx
//
// Client-side lazy wrapper for SignalActionCTA. The CTA pulls the
// wagmi/viem/privy stack through useMarketsSnapshot; importing it statically
// from the (server-rendered) places pages put that whole stack in their
// critical path. It already renders its own placeholder while loading and
// depends on client-only location context, so deferring it past hydration
// loses no SSR content.

'use client';

import dynamic from 'next/dynamic';

const SignalActionCTALazy = dynamic(
  () => import('@/components/signal/SignalActionCTA'),
  { ssr: false, loading: () => null },
);

export default SignalActionCTALazy;
