// kalma/frontend/app/api/places/nearest/route.ts
//
// GET /api/places/nearest?lat=..&lon=..&limit=6
//
// The missing link in "start with your place". The landing could geocode any
// city on Earth through Open-Meteo, but /places/[slug] only exists for the
// active catalog (237 places on 2026-08-04). Without a resolver, picking a
// city could only ever dump the user into a filtered feed, which is why the
// launcher used to send everyone to /today and answer Lavras with Concepcion.
//
// Two callers, one endpoint:
//   - no coordinates yet, or a fresh visitor: gives the nearest few places to
//     the approximate IP location, rendered as "near you" chips so most people
//     never touch the keyboard;
//   - after a geocode: says whether the chosen city is close enough to a place
//     we actually cover, and the client decides to open it or to fall back.
//
// Distance is computed here rather than in SQL on purpose. The catalog is a
// few hundred rows of anon-readable data, a seq scan plus a sort in JS costs
// nothing at this size, and it keeps the whole rule in one readable file
// instead of splitting it across a migration. Revisit if `places` grows past
// a few thousand.

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const revalidate = 0;

const SEVERITY_RANK: Record<string, number> = {
  extreme: 4, high: 3, medium: 2, moderate: 2, low: 1,
};

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

/** Great-circle distance in km. Same formula as resolve_place_for_market. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'bad_coordinates' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('places')
    .select('id, slug, name, region, country, country_code, lat, lon')
    .eq('active', true);

  if (error) {
    console.error('[places/nearest] supabase error:', error.message);
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }

  const places = (data ?? [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      slug: p.slug as string,
      name: p.name as string,
      region: (p.region ?? null) as string | null,
      country: (p.country ?? '') as string,
      countryCode: (p.country_code ?? '') as string,
      km: Math.round(distanceKm(lat, lon, p.lat as number, p.lon as number) * 10) / 10,
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);

  // Optional: the lead signal at the closest place. Folded into this response
  // rather than left to a second round trip, because the landing page uses it
  // above the fold and a second request there is a second chance to be slow.
  // Only signalTypeId + severity travel: the visible title is localised on the
  // client, so shipping English prose here would just be thrown away.
  let leadSignal: {
    signalTypeId: string;
    severity: string;
    structuredData: Record<string, unknown>;
  } | null = null;
  if (searchParams.get('withSignal') === '1' && places.length > 0) {
    const nearestId = (data ?? []).find((p) => p.slug === places[0].slug)?.id;
    if (nearestId) {
      const { data: signals } = await supabase
        .from('local_signals')
        .select('signal_type_id, severity, structured_data')
        .eq('place_id', nearestId)
        .eq('status', 'active');
      let best = -1;
      for (const s of signals ?? []) {
        const rank = SEVERITY_RANK[String(s.severity ?? '').toLowerCase()] ?? 0;
        if (rank > best) {
          best = rank;
          leadSignal = {
            signalTypeId: String(s.signal_type_id),
            severity: String(s.severity),
            // Carries the baseline-vs-forecast pair. This is the sentence a
            // conventional weather app cannot say ("usually 12mm, now 68mm"),
            // so it belongs above the fold, not three screens down.
            structuredData: (s.structured_data ?? {}) as Record<string, unknown>,
          };
        }
      }
    }
  }

  return NextResponse.json(
    { places, leadSignal },
    {
      headers: {
        // Depends on the caller's coordinates, so it is per-user. The catalog
        // behind it changes at most once a cron pass, hence the short private
        // window rather than no-store.
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}
