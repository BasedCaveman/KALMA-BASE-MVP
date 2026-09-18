// kalma/frontend/app/api/places/upsert/route.ts
//
// Auto-inserts a place into public.places when a user creates a market
// for a city we don't track yet. This is the "catalog grows with the
// product" pipeline that the user proposed in the slice 3A discussion.
//
// Flow on /create:
//   1. User picks a city in the LocationPicker (Open-Meteo geocoded).
//   2. User signs createMarketWithSeed on-chain.
//   3. /create POSTs to this route with the city name + coords.
//   4. We re-geocode server-side (canonical Open-Meteo answer beats any
//      stale state the client might hold), check for an existing place
//      within ~5km, insert a new row if none.
//
// Why no auth header:
//   - Testnet. The user just paid gas to create a market — they're
//     not anonymous. The on-chain MAX_ACTIVE_MARKETS_PER_CREATOR = 5
//     limit is our effective rate limit for V6.
//   - Pre-mainnet, this route gets:
//       * signed-message header (recover address, check against creator)
//       * rate-limit table keyed by hashed wallet
//       * cooperative-friendly higher limits (see profile slice).
//   - For now: validate inputs server-side, refuse insertions with bad
//     coords or non-geocodable names. No abuse vector for testnet.
//
// Returns 200 with `{ slug, created: boolean }` either way — idempotent
// from the caller's perspective.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';
import { sanitizePlaceName } from '@/lib/server/place-name';

export const runtime = 'nodejs';

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLon *
      sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
}

// Open-Meteo geocoding — same source /create uses for the picker, so the
// canonical name + admin1 + country come from the same place the user
// already saw in the UI.
async function reverseGeocode(name: string): Promise<null | {
  name: string;
  admin1: string | null;
  admin1_code: string | null;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
}> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      name
    )}&count=1&language=en&format=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'kalma-places/0.1' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: any[] };
    const first = data?.results?.[0];
    if (!first || typeof first.latitude !== 'number') return null;
    return {
      name: first.name ?? name,
      admin1: first.admin1 ?? null,
      admin1_code: first.admin1_code ?? null,
      country: first.country ?? '',
      country_code: first.country_code ?? '',
      latitude: first.latitude,
      longitude: first.longitude,
    };
  } catch {
    return null;
  }
}

// ── Route ──────────────────────────────────────────────────────────────────

type UpsertBody = {
  name: string;
  region?: string | null;
  country?: string | null;
  country_code?: string | null;
  lat: number;
  lon: number;
};

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  if (!body?.name || typeof body.lat !== 'number' || typeof body.lon !== 'number') {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }
  if (body.lat < -90 || body.lat > 90 || body.lon < -180 || body.lon > 180) {
    return NextResponse.json({ error: 'coord_out_of_range' }, { status: 400 });
  }

  // Per-IP throttle: this route inserts ACTIVE rows into public.places, each
  // of which the signal-engine cron evaluates daily (Open-Meteo fan-out). A
  // legit creator adds at most a handful of cities (on-chain cap is 5 active
  // markets per wallet); cap the unauthenticated write accordingly.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  {
    const limit = Number(process.env.PLACES_UPSERT_IP_HOURLY_LIMIT ?? '10');
    const throttle = await checkIpThrottle(supabase, 'places_upsert', hashIp(getClientIp(req)), {
      limit,
      windowMs: 60 * 60 * 1000,
    });
    if (!throttle.allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
  }

  // Canonicalize via Open-Meteo. Fall back to the client-provided values
  // if the geocode service is down — we'd rather insert imperfect data
  // than block the user's market creation.
  const geo = await reverseGeocode(body.name);
  // C-2 defense-in-depth: the fallback path inserts raw client input.
  const fallbackName = sanitizePlaceName(body.name);
  if (!geo && !fallbackName) return NextResponse.json({ error: 'bad_name' }, { status: 400 });
  const canonical = geo ?? {
    name: fallbackName as string,
    admin1: body.region ?? null,
    admin1_code: null as string | null,
    country: body.country ?? '',
    country_code: (body.country_code ?? '').toUpperCase(),
    latitude: body.lat,
    longitude: body.lon,
  };

  // Dedupe by proximity: any place within ~5km wins.
  const { data: candidates } = await supabase
    .from('places')
    .select('id, slug, lat, lon')
    .gte('lat', canonical.latitude - 0.05)
    .lte('lat', canonical.latitude + 0.05)
    .gte('lon', canonical.longitude - 0.05)
    .lte('lon', canonical.longitude + 0.05);

  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      if (typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
      const d = distanceKm(
        { lat: c.lat, lon: c.lon },
        { lat: canonical.latitude, lon: canonical.longitude }
      );
      if (d <= 5) {
        return NextResponse.json({ slug: c.slug, created: false }, { status: 200 });
      }
    }
  }

  // Slug pattern: city-{admin1_code or admin1_slug}-{country_code}.
  // Matches the existing seeded slugs (e.g. sao-paulo-sp-br).
  const adminTag = canonical.admin1_code
    ? canonical.admin1_code.split('-').pop()?.toLowerCase() ?? ''
    : canonical.admin1
      ? slugify(canonical.admin1).slice(0, 12)
      : '';
  const ccLower = canonical.country_code.toLowerCase();
  const baseSlug = [slugify(canonical.name), adminTag, ccLower]
    .filter(Boolean)
    .join('-');

  // If the slug collides, suffix -2, -3, … (rare).
  let slug = baseSlug;
  for (let i = 2; i <= 9; i++) {
    const { data: clash } = await supabase
      .from('places')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${i}`;
  }

  const insertRow = {
    slug,
    name: canonical.name,
    region: canonical.admin1,
    region_code: canonical.admin1_code,
    country: canonical.country,
    country_code: canonical.country_code,
    lat: canonical.latitude,
    lon: canonical.longitude,
    active: true,
  };

  const { error } = await supabase.from('places').insert(insertRow);
  if (error) {
    // Race with a parallel insert is possible. If the slug already exists,
    // treat the request as a successful no-op for the caller.
    if ((error as any).code === '23505') {
      return NextResponse.json({ slug, created: false }, { status: 200 });
    }
    console.warn('[places/upsert] insert failed:', error.message);
    return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 500 });
  }

  return NextResponse.json({ slug, created: true }, { status: 200 });
}
