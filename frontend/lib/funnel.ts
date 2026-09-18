// kalma/frontend/lib/funnel.ts
//
// Client half of the deferred-auth funnel counter. See the WHY block in
// supabase/migrations/20260804_funnel_events.sql.
//
// Three rules this file exists to enforce:
//   1. It can never break the page. Every call is fire-and-forget and every
//      failure is swallowed. A counter is not worth a broken composer.
//   2. It can never block an interaction. `keepalive` lets the request outlive
//      the click (and the Privy modal opening) without anything awaiting it.
//   3. It never sends anything about the person. Only an allowlisted event
//      name, which surface it happened on, and a place slug already in the URL.

'use client';

export type FunnelEvent =
  | 'composer_seen'
  | 'composer_viewed'
  | 'composer_engaged'
  | 'share_pressed_signed_out'
  | 'share_pressed_signed_in'
  | 'signin_completed'
  | 'observation_created'
  | 'pulse_seen'
  | 'pulse_viewed'
  | 'pulse_answered';

export type FunnelSurface = 'place' | 'market';

export function trackFunnel(
  event: FunnelEvent,
  surface: FunnelSurface,
  placeSlug?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    void fetch('/api/funnel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, surface, placeSlug: placeSlug ?? null }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never surface telemetry failures */
  }
}
