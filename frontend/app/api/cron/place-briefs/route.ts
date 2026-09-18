// kalma/frontend/app/api/cron/place-briefs/route.ts
//
// Vercel-Cron route for the Daily Place Brief + Verification Archive.
//
// Two passes per run:
//   1. Compose — upsert today's brief for every active place. Pure
//      Supabase reads (active local_signals, the day's observations,
//      routed commodity events); no external API calls, so the whole
//      catalog composes in seconds.
//   2. Verify — for briefs whose date has passed and verified_at is
//      still null, fetch recorded Open-Meteo daily values and stamp the
//      directional verification. One Open-Meteo call per brief, bounded
//      by VERIFY_CAP per pass.
//
// Auth: same CRON_SECRET bearer/query pattern as the signal-engine cron.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  composeBriefForPlace,
  verifyBrief,
  utcToday,
  type BriefPlace,
  type BriefSignal,
} from '@/lib/signal-engine/brief';
import { BriefActualsError } from '@/lib/signal-engine/brief-actuals';
import type { CommodityContextEvent } from '@/lib/signal-engine/commodity-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Verification lookback: skip briefs older than the Open-Meteo forecast
// API's past-data window (~92 days) - they can no longer be verified.
const VERIFY_MAX_AGE_DAYS = 90;
//
// 80 was set when the catalog held a fraction of today's places. It no
// longer clears the backlog it is supposed to clear: at 245 active places
// (2026-08-22), one new brief per place becomes verifiable every day, but
// two passes at 80 each cap out at 160/day, a structural deficit of 85/day
// that can only grow as the catalog grows. Found live: Lavras and
// Yellowknife briefs from 2026-08-12 through 2026-08-20, nine days, sat
// unverified while 2026-08-10 was stamped ten days late. The oldest-first
// ordering below means this is not noise, it is arithmetic: demand exceeds
// supply, so the backlog only lengthens and the newest briefs are always
// the ones still waiting.
//
// 200 was set on the assumption that capacity was the binding constraint. It
// was not. Measured 2026-09-09 06:40 UTC: selected 200, attempted 200, verified
// 150, deferred 0, and all 50 misses were provider_http 429. The pass used
// 45.6s of its 300s budget. So the limit being hit was Open-Meteo's rate limit,
// not our own cap or our own clock, and raising the cap alone would only have
// produced more 429s.
//
// The pass now paces itself (BATCH_PAUSE_MS) and retries 429 inside
// fetchDailyActuals, which buys the headroom this larger cap spends. 600 per
// pass is 1,200/day against ~252/day of arrivals, so the backlog drains instead
// of merely holding. TIME_BUDGET_MS stops the pass before maxDuration can kill
// it mid-batch and lose the run's accounting.
const VERIFY_CAP = Number(process.env.PLACE_BRIEFS_VERIFY_CAP ?? 600);
// Pause between batches. With VERIFY_CONCURRENCY 10 this holds the sustained
// request rate near 5/s, comfortably inside Open-Meteo's published 600/min,
// where the unpaced burst above was measurably not.
const BATCH_PAUSE_MS = Number(process.env.PLACE_BRIEFS_VERIFY_PAUSE_MS ?? 2_000);
// Stop starting new batches past this point, leaving room for the in-flight
// batch and the response. maxDuration is 300s.
const TIME_BUDGET_MS = 250_000;
// Concurrent Open-Meteo calls during the verify pass. Kept modest and apart
// from VERIFY_CAP (which bounds total WORK) so a slow response from one
// place cannot serialize behind 199 others - it bounds how much of the
// budget any one pass can spend waiting on the network at once, not how
// much work the pass does.
const VERIFY_CONCURRENCY = Number(process.env.PLACE_BRIEFS_VERIFY_CONCURRENCY ?? 10);

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === expected;
}

async function loadActivePlaces(supabase: SupabaseClient): Promise<BriefPlace[]> {
  const { data, error } = await supabase
    .from('places')
    .select('id, slug, name, lat, lon, place_activity_profiles (groups, coord_verified)')
    .eq('active', true);
  if (error) throw new Error(`load places: ${error.message}`);
  return (data ?? []).map((row: any) => {
    const { place_activity_profiles: profile, ...place } = row;
    const profileRow = Array.isArray(profile) ? profile[0] : profile;
    return {
      ...place,
      activityGroups:
        profileRow && profileRow.coord_verified
          ? ((profileRow.groups ?? []) as string[])
          : null,
    } as BriefPlace;
  });
}

async function loadCommodityEvents(
  supabase: SupabaseClient,
): Promise<CommodityContextEvent[]> {
  const { data, error } = await supabase
    .from('commodity_context_events')
    .select('commodity, kind, pct_7d, pct_30d, latest_close, unit, source')
    .gt('valid_until', new Date().toISOString());
  if (error) {
    console.warn('[place-briefs] commodity events load failed:', error.message);
    return [];
  }
  return (data ?? []) as CommodityContextEvent[];
}

async function runOnce(supabase: SupabaseClient) {
  const startedAt = Date.now();
  const today = utcToday();

  const places = await loadActivePlaces(supabase);
  const commodityEvents = await loadCommodityEvents(supabase);
  const placeById = new Map(places.map((p) => [p.id, p]));

  // Pass 1 — compose today's briefs.
  let created = 0;
  let updated = 0;
  let composeErrors = 0;
  const errorLog: Array<{ place: string; stage: string; message: string }> = [];
  for (const place of places) {
    try {
      const result = await composeBriefForPlace(
        supabase,
        place,
        commodityEvents,
        today,
      );
      if (result === 'created') created += 1;
      else updated += 1;
    } catch (e) {
      composeErrors += 1;
      errorLog.push({
        place: place.slug,
        stage: 'compose',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Pass 2 — verify past briefs that haven't been stamped yet.
  const oldestVerifiable = new Date(
    Date.now() - VERIFY_MAX_AGE_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const { data: pending, error: pendingErr } = await supabase
    .from('place_briefs')
    .select('id, place_id, brief_date, signals')
    .is('verified_at', null)
    .lt('brief_date', today)
    .gte('brief_date', oldestVerifiable)
    .order('brief_date', { ascending: true })
    .limit(VERIFY_CAP);
  if (pendingErr) {
    errorLog.push({ place: '*', stage: 'verify-list', message: pendingErr.message });
  }

  let verified = 0;
  let verifyDeferred = 0;
  let verifyErrors = 0;
  const verifyErrorCodes: Record<string, number> = {};
  // Batched rather than sequential: at the raised cap above, one-at-a-time
  // network calls would spend most of maxDuration waiting rather than
  // working. Each batch still awaits fully before the next starts, so a
  // batch's errors are attributed correctly and the pass cannot outlive
  // VERIFY_CONCURRENCY in-flight requests at once.
  const runnable = (pending ?? []).flatMap((row) => {
    const place = placeById.get(row.place_id as string);
    if (!place) return []; // place deactivated since — leave unverified
    return [{ row, place }];
  });
  let verifyBudgetExhausted = false;
  for (let i = 0; i < runnable.length; i += VERIFY_CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      // Reported, never silent: an unexplained shortfall is what made the
      // original 200-cap diagnosis take two passes to reach.
      verifyBudgetExhausted = true;
      break;
    }
    if (i > 0 && BATCH_PAUSE_MS > 0) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    const batch = runnable.slice(i, i + VERIFY_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ row, place }) => {
        try {
          const ok = await verifyBrief(
            supabase,
            {
              id: row.id as string,
              brief_date: row.brief_date as string,
              signals: (row.signals ?? []) as BriefSignal[],
            },
            place,
          );
          return { ok, place };
        } catch (e) {
          return {
            ok: null,
            place,
            error: e instanceof Error ? e : new Error(String(e)),
          };
        }
      }),
    );
    for (const r of results) {
      if (r.ok === true) verified += 1;
      else if (r.ok === false) verifyDeferred += 1; // actuals not published yet - retry next pass
      else {
        verifyErrors += 1;
        const code = r.error instanceof BriefActualsError ? r.error.code : 'unknown';
        verifyErrorCodes[code] = (verifyErrorCodes[code] ?? 0) + 1;
        errorLog.push({ place: r.place.slug, stage: 'verify', message: r.error?.message ?? 'unknown' });
      }
    }
  }

  return {
    brief_date: today,
    places: places.length,
    created,
    updated,
    compose_errors: composeErrors,
    verified,
    verify_deferred: verifyDeferred,
    verify_errors: verifyErrors,
    verify_error_codes: verifyErrorCodes,
    verify_budget_exhausted: verifyBudgetExhausted,
    verify_selected: (pending ?? []).length,
    verify_attempted: runnable.length,
    verify_skipped_missing_place: (pending ?? []).length - runnable.length,
    elapsed_ms: Date.now() - startedAt,
    error_log: errorLog.slice(0, 20),
  };
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
    const summary = await runOnce(supabase);
    console.info('[place-briefs] run summary', JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const POST = GET;
