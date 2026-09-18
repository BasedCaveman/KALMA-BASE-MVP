//kalma/frontend/hooks/useFunnelViewport.ts
//
// Fires a funnel counter the first time an element is actually on screen.
//
// Why this exists: `composer_seen` and `pulse_seen` were documented in
// supabase/migrations/20260804_funnel_events.sql as "scrolled into view (it
// lazy-mounts)", and neither ever meant that. Both components lazy-load with
// `dynamic(..., { ssr: false })`, which mounts after hydration wherever the
// reader happens to be, and both fired their event from a bare mount effect.
// So the number counted page loads, and the ratio against `composer_engaged`
// could not distinguish "the ask was refused" from "the ask was never
// reached". Those two readings call for opposite work.
//
// The `_seen` events keep firing on mount. This adds the `_viewed` half, so
// viewed/seen is itself the measurement: what fraction of arrivals get far
// enough down the page to be asked at all.
//
// Returns a CALLBACK ref, not a ref object, on purpose. PlaceDailyQuestion
// returns null until its fetch resolves, so the node this watches appears
// after the first render. An effect keyed on the event name would have run
// once against a null ref and never fired again, which is the same class of
// silent-nothing bug the hook exists to fix.

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { trackFunnel, type FunnelEvent, type FunnelSurface } from '@/lib/funnel';

export function useFunnelViewport<T extends HTMLElement>(
  event: FunnelEvent,
  surface: FunnelSurface,
  placeSlug?: string | null,
) {
  const fired = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const attach = useCallback(
    (node: T | null) => {
      observer.current?.disconnect();
      observer.current = null;

      if (!node || fired.current) return;
      // No fallback on purpose. An environment without IntersectionObserver
      // records nothing rather than falling back to a mount count, which is
      // exactly the ambiguity this hook exists to remove.
      if (typeof IntersectionObserver === 'undefined') return;

      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || fired.current) continue;
            fired.current = true;
            trackFunnel(event, surface, placeSlug);
            io.disconnect();
            observer.current = null;
            return;
          }
        },
        // Any intersection, not a fraction. The composer is taller than a phone
        // screen once its chips are open (Golden Rule 4: the device is a cracked
        // Android held in sunlight), so a 0.5 threshold would never fire for the
        // readers who matter most.
        { threshold: 0.01 },
      );

      io.observe(node);
      observer.current = io;
    },
    [event, surface, placeSlug],
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return attach;
}
