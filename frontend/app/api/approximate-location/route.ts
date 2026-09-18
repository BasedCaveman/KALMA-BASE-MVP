import { NextRequest, NextResponse } from 'next/server';

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

function decodeHeaderValue(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toFixedCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(4));
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(4)) : null;
  }
  return null;
}

function readVercelGeo(request: NextRequest) {
  const city = decodeHeaderValue(request.headers.get('x-vercel-ip-city'));
  const region = decodeHeaderValue(
    request.headers.get('x-vercel-ip-country-region')
  );
  const countryCode = request.headers.get('x-vercel-ip-country');
  const timezone = request.headers.get('x-vercel-ip-timezone');
  const lat = toFixedCoord(request.headers.get('x-vercel-ip-latitude'));
  const lon = toFixedCoord(request.headers.get('x-vercel-ip-longitude'));

  if (!city && !region && !countryCode && lat == null && lon == null && !timezone) {
    return null;
  }

  return {
    city,
    region,
    country: countryCode ? REGION_NAMES.of(countryCode) ?? countryCode : null,
    countryCode: countryCode || null,
    lat,
    lon,
    timezone,
    source: 'vercel',
  };
}

export async function GET(request: NextRequest) {
  const vercelGeo = readVercelGeo(request);
  if (vercelGeo) {
    return NextResponse.json(vercelGeo, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  }

  try {
    const upstream = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: 'approximate_lookup_failed', status: upstream.status },
        { status: 502 }
      );
    }

    const data: any = await upstream.json();

    return NextResponse.json(
      {
        city: typeof data?.city === 'string' ? data.city : null,
        region: typeof data?.region === 'string' ? data.region : null,
        country: typeof data?.country_name === 'string' ? data.country_name : null,
        countryCode: typeof data?.country_code === 'string' ? data.country_code : null,
        lat: toFixedCoord(data?.latitude),
        lon: toFixedCoord(data?.longitude),
        timezone: typeof data?.timezone === 'string' ? data.timezone : null,
        source: 'ipapi',
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'approximate_lookup_unavailable' },
      { status: 502 }
    );
  }
}
