// kalma/frontend/app/api/places/candidate/route.ts
//
// Capture endpoint for the "catalog grows with demand" pipeline.
//
// Every time a user SELECTS a city in the geocoder (LocationPicker, the
// /create city search, the IntentLauncher place input), the client fires
// a fire-and-forget POST here with the chosen geo result. We dedupe by a
// coarse lat/lon grid (~11km) and bump search_count on the matching
// place_candidates row, or insert a new pending candidate.
//
// The signal-engine cron later promotes popular candidates into
// public.places so they start getting daily signals (see
// /api/cron/signal-engine). This route only records demand — it never
// inserts into public.places itself, and never blocks the UI (the client
// ignores the response).
//
// No auth: testnet, low-value write, service-role key server-side only.
// If a place is already an active place, we skip — no point queueing
// something we already cover.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getClientIp, hashIp } from '@/lib/ip-rate-limit';
import { sanitizePlaceName } from '@/lib/server/place-name';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Round lat/lon to 1 decimal (~11km at the equator) for the dedupe grid.
// Two searches within the same cell collapse onto one candidate row.
function gridKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

type CandidateBody = {
  name: string;
  region?: string | null;
  region_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  lat: number;
  lon: number;
  feature_code?: string | null;
};

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  let body: CandidateBody;
  try {
    body = (await req.json()) as CandidateBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (!body?.name || typeof body.lat !== 'number' || typeof body.lon !== 'number') {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }
  // C-2 defense-in-depth: candidate names flow into public.places on promotion.
  // A country is not a place anyone stands in. The Open-Meteo geocoder
  // returns countries and administrative divisions alongside cities, and the
  // client surfaces do not filter them, so a search for "Nepal" queued the
  // country centroid (28, 84) for promotion: a point in the Himalaya that
  // would then be given daily signals and named as if it were a town.
  //
  // Gated here rather than in the five client surfaces on purpose: this route
  // is the one door they all already go through, so one check covers every
  // entry point and any future one. PPL* is Open-Meteo's populated-place
  // class; everything else (PCLI/PCLD country, ADM* division, CONT continent,
  // RGN region) is rejected.
  const feature = typeof body.feature_code === 'string' ? body.feature_code.toUpperCase() : null;
  if (feature && !feature.startsWith('PPL')) {
    return NextResponse.json({ ok: true, skipped: 'not_a_populated_place' }, { status: 200 });
  }

  const cleanName = sanitizePlaceName(body.name);
  if (!cleanName) return NextResponse.json({ error: 'bad_name' }, { status: 400 });
  body.name = cleanName;
  if (body.lat < -90 || body.lat > 90 || body.lon < -180 || body.lon > 180) {
    return NextResponse.json({ error: 'coord_out_of_range' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const key = gridKey(body.lat, body.lon);

  // ── Rate limit (IP-hash + grid) ─────────────────────────────────────────
  // Demand capture is an unauthenticated write that feeds candidate promotion,
  // so cap abuse two ways: a per-IP hourly ceiling (flood protection) and a
  // per-(IP, grid) cooldown (stops one client inflating search_count on a cell
  // to force its promotion). IP is hashed, never stored raw.
  // hashIp throws in production when IP_HASH_SALT is unset (audit M-3) —
  // surface a clean 500 instead of an unhandled route crash.
  let ipHash: string;
  try {
    ipHash = hashIp(getClientIp(req));
  } catch (err) {
    console.error('[candidate] hashIp failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }
  const hourlyLimit = Number(process.env.CANDIDATE_IP_HOURLY_LIMIT ?? '40');
  const gridCooldownH = Number(process.env.CANDIDATE_IP_GRID_COOLDOWN_HOURS ?? '6');

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentHits } = await supabase
    .from('candidate_submissions')
    .select('grid_key', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('last_hit_at', hourAgo);
  if (Number.isFinite(hourlyLimit) && hourlyLimit > 0 && (recentHits ?? 0) >= hourlyLimit) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  if (Number.isFinite(gridCooldownH) && gridCooldownH > 0) {
    const { data: priorHit } = await supabase
      .from('candidate_submissions')
      .select('last_hit_at')
      .eq('ip_hash', ipHash)
      .eq('grid_key', key)
      .maybeSingle();
    if (
      priorHit?.last_hit_at &&
      Date.now() - new Date(priorHit.last_hit_at).getTime() < gridCooldownH * 60 * 60 * 1000
    ) {
      return NextResponse.json({ ok: true, throttled: true }, { status: 200 });
    }
  }

  // Record this accepted hit (drives both limits above on subsequent calls).
  await supabase
    .from('candidate_submissions')
    .upsert(
      { ip_hash: ipHash, grid_key: key, last_hit_at: new Date().toISOString() },
      { onConflict: 'ip_hash,grid_key' },
    );

  // Skip if we already cover this grid cell with an active place — no
  // point logging demand for something already in the daily rotation.
  const { data: existingPlaces } = await supabase
    .from('places')
    .select('id')
    .gte('lat', body.lat - 0.06)
    .lte('lat', body.lat + 0.06)
    .gte('lon', body.lon - 0.06)
    .lte('lon', body.lon + 0.06)
    .eq('active', true)
    .limit(1);
  if (Array.isArray(existingPlaces) && existingPlaces.length > 0) {
    return NextResponse.json({ ok: true, covered: true }, { status: 200 });
  }

  // Upsert-by-grid: bump search_count if the candidate exists, else insert.
  const { data: existing } = await supabase
    .from('place_candidates')
    .select('id, search_count')
    .eq('grid_key', key)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('place_candidates')
      .update({
        search_count: (existing.search_count ?? 0) + 1,
        last_searched_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return NextResponse.json({ ok: true, counted: true }, { status: 200 });
  }

  const { error } = await supabase.from('place_candidates').insert({
    grid_key: key,
    name: body.name,
    region: body.region ?? null,
    region_code: body.region_code ?? null,
    country: body.country ?? null,
    country_code: (body.country_code ?? '').toUpperCase() || null,
    lat: body.lat,
    lon: body.lon,
  });
  if (error) {
    // Race on the unique grid_key → another request inserted first; treat
    // as success (their insert + our intended bump both mean "demand seen").
    if ((error as any).code === '23505') {
      return NextResponse.json({ ok: true, raced: true }, { status: 200 });
    }
    console.warn('[places/candidate] insert failed:', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: true }, { status: 200 });
}
