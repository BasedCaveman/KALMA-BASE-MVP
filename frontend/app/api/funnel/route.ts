// kalma/frontend/app/api/funnel/route.ts
//
// Record one step of the deferred-auth observation funnel. See the WHY block in
// supabase/migrations/20260804_funnel_events.sql: this exists because we opened
// the composer and moved the account to the commit point without any way to
// read whether that worked.
//
// Deliberately narrow. It accepts an allowlisted event name and nothing that
// could identify a person: no free text, no ids from the caller beyond a place
// slug we resolve ourselves. It is unauthenticated by necessity (the whole
// point is measuring people who have not signed in yet), so it is throttled
// per IP and it always answers 204 — a telemetry endpoint must never tell a
// prober whether it was throttled, nor fail a page that called it.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Must stay in step with the CHECK constraint on funnel_events.event.
const EVENTS = new Set([
  'composer_seen',
  'composer_viewed',
  'composer_engaged',
  'share_pressed_signed_out',
  'share_pressed_signed_in',
  'signin_completed',
  'observation_created',
  'pulse_seen',
  'pulse_viewed',
  'pulse_answered',
]);

const SURFACES = new Set(['place', 'market']);

// Generous: composer_seen fires on every feed mount, so a person moving between
// a few places in a session is normal traffic, not abuse. This only exists to
// stop a script from writing millions of rows.
const HOURLY_LIMIT = Number(process.env.FUNNEL_IP_HOURLY_LIMIT ?? '200');

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Always 204. Callers use keepalive and ignore the response; surfacing an error
// would only tempt someone to handle it, and a missed counter must never be
// visible to the person we are counting.
const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return noContent();

    const body = await req.json().catch(() => null);
    const event = String(body?.event ?? '');
    const surface = String(body?.surface ?? '');
    if (!EVENTS.has(event) || !SURFACES.has(surface)) return noContent();

    // The client sends a slug, never a row id: it should not be able to write
    // an arbitrary foreign key, and an unknown slug simply degrades to a
    // place-less count rather than rejecting the event.
    let placeId: string | null = null;
    const slug = body?.placeSlug ? String(body.placeSlug).slice(0, 120) : null;
    if (slug) {
      const { data } = await sb.from('places').select('id').eq('slug', slug).maybeSingle();
      placeId = data?.id ?? null;
    }

    // hashIp throws in production when IP_HASH_SALT is unset. Counting the
    // event without attribution beats losing it, so degrade rather than fail.
    let ipHash: string | null = null;
    try {
      ipHash = hashIp(getClientIp(req));
    } catch {
      ipHash = null;
    }

    if (ipHash) {
      const throttle = await checkIpThrottle(sb, 'funnel', ipHash, {
        limit: HOURLY_LIMIT,
        windowMs: 60 * 60 * 1000,
      });
      if (!throttle.allowed) return noContent();
    }

    await sb.from('funnel_events').insert({ event, surface, place_id: placeId, ip_hash: ipHash });
    return noContent();
  } catch {
    // Telemetry must never take a page down with it.
    return noContent();
  }
}
