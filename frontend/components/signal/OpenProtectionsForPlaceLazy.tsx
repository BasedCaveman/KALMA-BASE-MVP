//kalma/frontend/components/signal/OpenProtectionsForPlaceLazy.tsx
//
// Client-side lazy wrapper for OpenProtectionsForPlace, same reason as
// SignalActionCTALazy right above it in this folder: it pulls the
// wagmi/viem stack through useMarketsSnapshot, so importing it statically
// from the (server-rendered) places page would put that stack in the
// server bundle's critical path.

'use client';

import dynamic from 'next/dynamic';

const OpenProtectionsForPlaceLazy = dynamic(
  () => import('@/components/signal/OpenProtectionsForPlace'),
  { ssr: false, loading: () => null },
);

export default OpenProtectionsForPlaceLazy;
