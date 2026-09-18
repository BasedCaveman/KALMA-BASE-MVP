import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { runWeatherNewsDiscovery } from '@/lib/weather-news/discovery';

export const runtime = 'nodejs';
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  return Boolean(
    expected &&
      request.headers.get('authorization') === `Bearer ${expected}`,
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'missing_supabase_env' },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const maxItemsPerSource = Number(
    process.env.WEATHER_NEWS_MAX_PER_SOURCE ?? 5,
  );

  try {
    const summary = await runWeatherNewsDiscovery(supabase, {
      maxItemsPerSource,
      log: (message) => console.log(message),
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export const POST = GET;
