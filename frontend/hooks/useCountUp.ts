// kalma/frontend/hooks/useCountUp.ts
//
// Ramps a number from 0 → target with an ease-out, via requestAnimationFrame.
// Used for the resolution reveal ("the weather answered: 31°C" counts up).
// When disabled (reduced motion / not ready) it returns the target immediately,
// so the value is always correct and visible without motion.

'use client';

import { useEffect, useRef, useState } from 'react';

export function useCountUp(
  target: number,
  opts?: { enabled?: boolean; durationMs?: number },
): number {
  const { enabled = true, durationMs = 850 } = opts ?? {};
  const [value, setValue] = useState(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(target * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled, durationMs]);

  return value;
}
