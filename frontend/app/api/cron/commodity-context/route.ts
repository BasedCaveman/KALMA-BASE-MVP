//kalma/frontend/app/api/cron/commodity-context/route.ts
//
// Daily Vercel-Cron route (after US market close) that refreshes the
// commodity market context layer: fetches daily front-month futures
// closes for every commodity in COMMODITY_MAP, upserts
// public.commodity_prices, and replaces public.commodity_context_events
// with the currently-firing anomalies (surge/drop/52-week extremes).
// Events reach users by intersecting each place's verified activity
// profile with the commodity→group map — coffee context for Lavras,
// not Winnipeg.
//
// Auth mirrors the other crons: Vercel injects
// `Authorization: Bearer <CRON_SECRET>`; `?secret=` supported for
// manual triggers.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runCommodityContext } from '@/lib/signal-engine/commodity-context';

export const runtime = 'nodejs';
export const maxDuration = 120; // 9 symbols × (~1s fetch + 400ms pause)

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'missing_supabase_env' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const summary = await runCommodityContext(supabase, {
      log: (msg) => console.log(msg),
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Manual triggers from the dashboard / curl with a body.
export const POST = GET;
