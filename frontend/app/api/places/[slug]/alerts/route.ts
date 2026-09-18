// kalma/frontend/app/api/places/[slug]/alerts/route.ts
//
// GET /api/places/:slug/alerts → active official weather alerts covering the
// place, most severe first. This is the "source context" layer (Golden Rule
// 8): official CAP alerts, labeled and kept distinct from news and community
// observations. Anon read (weather_alerts has a public-read policy on
// expires > now()); routing is bbox prefilter + point-in-polygon on the
// place's lat/lon.

import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { alertsForPlace } from '@/lib/weather-alerts/routing';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data: place, error: placeErr } = await supabase
    .from('places')
    .select('id, slug, name, lat, lon')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (placeErr) {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!place) {
    return NextResponse.json({ error: 'place_not_found' }, { status: 404 });
  }

  const alerts = await alertsForPlace(supabase, Number(place.lat), Number(place.lon));

  return NextResponse.json(
    {
      place: { slug: place.slug, name: place.name },
      // Provenance is explicit: these are official alerts, not news/advice.
      kind: 'official_alert',
      generatedAt: new Date().toISOString(),
      alerts: alerts.map((a) => ({
        id: a.id,
        source: a.source,
        event: a.event,
        eventKey: a.event_key,
        severity: a.severity,
        responseType: a.response_type,
        headline: a.headline,
        description: a.description,
        areaDesc: a.area_desc,
        onset: a.onset,
        expires: a.expires,
        link: a.link,
      })),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } },
  );
}
