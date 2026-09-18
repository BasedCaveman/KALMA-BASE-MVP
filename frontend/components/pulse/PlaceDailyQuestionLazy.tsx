// kalma/frontend/components/pulse/PlaceDailyQuestionLazy.tsx
//
// Client-side lazy wrapper for PlaceDailyQuestion, mirroring
// components/social/ObservationFeedLazy.tsx for the same reason: the question
// pulls the privy/wagmi stack through useAccount and usePrivy, and
// /places/[slug] is an ISR server page whose whole point is a cheap, citable
// first payload. Today's poll result is also not part of what should be cited:
// it is community coordination, not source context (Golden Rule 8).

'use client';

import dynamic from 'next/dynamic';

const PlaceDailyQuestionLazy = dynamic(
  () => import('@/components/pulse/PlaceDailyQuestion'),
  { ssr: false, loading: () => null },
);

export default PlaceDailyQuestionLazy;
