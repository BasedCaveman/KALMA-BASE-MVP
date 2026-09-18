// kalma/frontend/hooks/useReducedMotion.ts
//
// True when the user asked the OS to reduce motion. Motion in Kalma is
// "barely there" and always optional — gate any JS-driven animation (count-ups,
// staggered reveals) on this, and mirror it in CSS with
// @media (prefers-reduced-motion: reduce).

'use client';

import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  // Default false on the server / first paint; corrected after mount. Anything
  // gated on this should have a visible, motion-free base state regardless.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}
