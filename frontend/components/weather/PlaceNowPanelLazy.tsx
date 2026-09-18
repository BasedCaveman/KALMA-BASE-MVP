// kalma/frontend/components/weather/PlaceNowPanelLazy.tsx
//
// Client-side lazy wrapper for PlaceNowPanel, same reasoning as
// SignalActionCTALazy and ObservationFeedLazy.
//
// /places/[slug] is ISR'd and read by AI crawlers, and "what the temperature
// is right this second" is the one thing on the page that must NOT be baked
// into a 15-minute static payload: it would be stale by construction and
// crawlers would cite a number that was never true when read. Fetching it
// client-side is both cheaper for the build (238 prerendered places make no
// Open-Meteo calls) and more honest.

'use client';

import dynamic from 'next/dynamic';

const PlaceNowPanelLazy = dynamic(
  () => import('@/components/weather/PlaceNowPanel'),
  { ssr: false, loading: () => null },
);

export default PlaceNowPanelLazy;
