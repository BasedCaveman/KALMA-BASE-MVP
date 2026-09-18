// kalma/frontend/components/social/ObservationFeedLazy.tsx
//
// Client-side lazy wrapper for ObservationFeed, mirroring
// components/signal/SignalActionCTALazy.tsx.
//
// /places/[slug] is a server component rendered with ISR and read by AI
// crawlers. ObservationFeed pulls the privy/wagmi stack through useAccount and
// usePrivy, so importing it statically there would put that whole stack in the
// critical path of the page whose whole point is a cheap, citable first
// payload. Community notes are deliberately NOT part of that payload either:
// Golden Rule 8 keeps official data and community coordination separate, and
// the citable artifact is the signal prose, not what a neighbour typed an hour
// ago. Deferring past hydration therefore costs no SSR content that should
// have been there.

'use client';

import dynamic from 'next/dynamic';

const ObservationFeedLazy = dynamic(
  () => import('@/components/social/ObservationFeed'),
  { ssr: false, loading: () => null },
);

export default ObservationFeedLazy;
