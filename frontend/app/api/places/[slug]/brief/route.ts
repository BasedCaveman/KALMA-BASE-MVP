// kalma/frontend/app/api/places/[slug]/brief/route.ts
//
// GET /api/places/:slug/brief          → latest brief for the place
// GET /api/places/:slug/brief?date=YYYY-MM-DD → that day's brief
//
// Machine feed for the Daily Place Brief archive: a clean JSON artifact
// AI agents and integrations can poll daily without scraping HTML. Read
// is anon (place_briefs has a public-read policy); the response carries
// the same four-kinds-of-truth structure the SSR page renders, plus the
// verification note so directional checks can't be quoted as forecast
// grades.

import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isValidBriefDate } from '@/lib/signal-engine/brief';
import { computeTrackRecord } from '@/lib/signal-engine/brief-track-record';

export const runtime = 'nodejs';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const date = new URL(req.url).searchParams.get('date');
  if (date && !isValidBriefDate(date)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }

  const { data: place, error: placeErr } = await supabase
    .from('places')
    .select('id, slug, name, region, country, country_code, lat, lon')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (placeErr) {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!place) {
    return NextResponse.json({ error: 'place_not_found' }, { status: 404 });
  }

  let query = supabase
    .from('place_briefs')
    .select(
      'brief_date, signals, observations, commodity_events, verification, verified_at, created_at, updated_at',
    )
    .eq('place_id', place.id);
  query = date
    ? query.eq('brief_date', date)
    : query.order('brief_date', { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'brief_fetch_failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'brief_not_found' }, { status: 404 });
  }

  // Place-level verification track record (coverage, not a forecast grade;
  // see brief-track-record.ts). Cheap Supabase read over the same table.
  const trackRecord = await computeTrackRecord(supabase, place.id, 30);

  return NextResponse.json(
    {
      place: {
        slug: place.slug,
        name: place.name,
        region: place.region,
        country: place.country,
        country_code: place.country_code,
        lat: place.lat,
        lon: place.lon,
      },
      brief: data,
      track_record: trackRecord,
      html_url: `${SITE_URL}/places/${place.slug}/briefs/${data.brief_date}`,
      archive_url: `${SITE_URL}/places/${place.slug}/briefs`,
    },
    {
      headers: {
        // Public + cacheable: today's brief refreshes on the cron cadence,
        // past briefs are effectively immutable.
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    },
  );
}
