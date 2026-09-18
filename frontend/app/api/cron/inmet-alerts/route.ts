// kalma/frontend/app/api/cron/inmet-alerts/route.ts
//
// Cron: ingest INMET (Brazil) official CAP weather alerts into the
// weather_alerts source-context layer (Golden Rule 8 — separate from the
// weather-news feed). Twice daily (INMET rate-limits; alerts carry multi-day
// onset/expires windows). CRON_SECRET-gated like the other crons.

import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { runInmetAlertsIngest } from '@/lib/weather-alerts/inmet';

export const runtime = 'nodejs';
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get('authorization') === `Bearer ${expected}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'missing_supabase_env' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // INMET rate-limits detail fetches aggressively, so a single run captures
    // only a handful before backing off; the skip-fresh path lets successive
    // runs accumulate coverage without re-fetching stored alerts. Both knobs
    // are env-tunable if the limit behaviour changes.
    const summary = await runInmetAlertsIngest(supabase, {
      maxDetailsPerRun: Number(process.env.INMET_ALERTS_MAX_DETAILS ?? 40),
      throttleMs: Number(process.env.INMET_ALERTS_THROTTLE_MS ?? 800),
      log: (message) => console.log(message),
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;
