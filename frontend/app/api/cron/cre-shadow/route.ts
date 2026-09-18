// kalma/frontend/app/api/cron/cre-shadow/route.ts
//
// CRE shadow oracle cron. For every market whose window has closed, run the
// multi-source consensus (lib/oracle-cre/shadow) and store it in
// public.cre_shadow_resolutions next to the operator oracle's on-chain result
// (public.resolution_evidence). The public /trust page reads both.
//
// This is the parallel run: the CRE shadow can answer as soon as the weather
// window closes, often before the operator watchdog resolves on-chain. When
// the operator side later resolves, we backfill the agreement flag.
//
// Shadow / candidate only: nothing here writes to a contract. Auth: same
// CRON_SECRET pattern as the other crons.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeShadowResolution } from '@/lib/oracle-cre/shadow';
import { CONTRACTS } from '@/lib/contracts';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Bound per run so a backlog can't blow the function budget; the rest converge
// over subsequent runs (same skip-fresh idea as the INMET cron).
const CAP = Number(process.env.CRE_SHADOW_CAP ?? 60);
// Re-compute a market at most this often unless its operator agreement is
// still unknown (then we keep trying so the flag fills in once it resolves).
const REFRESH_MS = 12 * 60 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  return new URL(req.url).searchParams.get('secret') === expected;
}

type SnapshotRow = {
  market_id: number;
  city_name: string;
  lat: number | null;
  lon: number | null;
  market_type_id: number;
  threshold_value: number | null;
  start_time: number | null;
  end_time: number | null;
  resolved: boolean | null;
  outcome: boolean | null;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'supabase env missing' }, { status: 500 });
  }
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  const nowSec = Math.floor(Date.now() / 1000);

  // Candidate markets: window has closed and we have coordinates to resolve.
  // Scoped to the live pool. market_id is only unique WITHIN a pool
  // (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md) — without this filter, a V5 and a
  // V7 market sharing an id would collide in the joins and the upsert below.
  // V5's existing shadow corpus is untouched; this cron simply stops adding
  // to it going forward, matching the wind-down already decided for V5.
  const { data: snaps, error: snapErr } = await supabase
    .from('markets_snapshot')
    .select('market_id, city_name, lat, lon, market_type_id, threshold_value, start_time, end_time, resolved, outcome')
    .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
    .lt('end_time', nowSec)
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .order('end_time', { ascending: false })
    .limit(400);
  if (snapErr) {
    return NextResponse.json({ error: 'snapshot fetch failed', detail: snapErr.message }, { status: 500 });
  }
  const markets = (snaps ?? []) as SnapshotRow[];

  // Existing shadow rows (to skip-fresh) and operator outcomes (to fill agreement).
  const ids = markets.map((m) => m.market_id);
  const [{ data: existing }, { data: evidence }] = await Promise.all([
    supabase.from('cre_shadow_resolutions').select('market_id, computed_at, agrees_with_operator').in('market_id', ids),
    supabase.from('resolution_evidence').select('market_id, historical_avg, current_outcome, resolved_actual_value').in('market_id', ids),
  ]);
  const existingById = new Map((existing ?? []).map((r: any) => [r.market_id, r]));
  const evidenceById = new Map((evidence ?? []).map((r: any) => [r.market_id, r]));

  // The operator's Yes/No outcome. Prefer the explicit current_outcome bool;
  // fall back to deriving it from the resolved value vs the on-chain threshold
  // (current_outcome is only populated on some resolution paths, but a resolved
  // market always has resolved_actual_value + historical_avg). Markets resolved
  // before resolution_evidence existed (market_id <= ~92, all resolved Apr-Jun
  // 2026) have no evidence row at all, so fall back to markets_snapshot.outcome
  // itself, the same boolean the chain resolved to. Checked against the 122
  // markets carrying both: 121 agree, so the snapshot is a reliable last resort,
  // not a guess. Without this, those 91 markets sit in cre_shadow_resolutions
  // with operator_outcome_above stuck at null forever, which /trust then
  // reports as "waiting for the operator to settle" for a market resolved
  // months ago.
  const operatorOutcomeFor = (ev: any, snapshotOutcome: boolean | null): boolean | null => {
    if (ev?.current_outcome != null) return ev.current_outcome;
    if (ev?.resolved_actual_value != null && ev?.historical_avg != null) {
      return Number(ev.resolved_actual_value) >= Number(ev.historical_avg);
    }
    return snapshotOutcome;
  };

  const results: Array<{ market_id: number; status: string }> = [];
  let processed = 0;

  for (const m of markets) {
    if (processed >= CAP) break;

    const prior = existingById.get(m.market_id);
    const ev = evidenceById.get(m.market_id);
    const operatorOutcome: boolean | null = operatorOutcomeFor(ev, m.outcome);

    // Skip-fresh: recently computed AND its operator agreement is already known
    // (or the operator hasn't resolved yet, so there is nothing new to learn).
    if (prior) {
      const age = Date.now() - new Date(prior.computed_at).getTime();
      const agreementSettled = prior.agrees_with_operator !== null || operatorOutcome === null;
      if (age < REFRESH_MS && agreementSettled) continue;
    }

    // Threshold: prefer the authoritative on-chain historical_avg from the
    // operator's evidence; fall back to the snapshot's stored threshold.
    const thresholdInt =
      ev?.historical_avg != null
        ? Number(ev.historical_avg)
        : m.threshold_value != null
          ? Math.round(Number(m.threshold_value))
          : null;
    if (thresholdInt == null) {
      results.push({ market_id: m.market_id, status: 'no_threshold' });
      continue;
    }

    processed += 1;
    try {
      const shadow = await computeShadowResolution(
        {
          lat: Number(m.lat),
          lon: Number(m.lon),
          marketTypeId: m.market_type_id,
          startTime: Number(m.start_time),
          endTime: Number(m.end_time),
        },
        thresholdInt,
      );

      if (shadow.cre_outcome_above == null) {
        results.push({ market_id: m.market_id, status: 'no_sources' });
        continue;
      }

      const agrees =
        operatorOutcome == null ? null : shadow.cre_outcome_above === operatorOutcome;

      const { error: upErr } = await supabase.from('cre_shadow_resolutions').upsert(
        {
          market_id: m.market_id,
          pool_address: CONTRACTS.CLIMATE_POOL.toLowerCase(),
          sources: shadow.sources,
          source_count: shadow.source_count,
          consensus_float: shadow.consensus_float,
          consensus_int: shadow.consensus_int,
          cre_outcome_above: shadow.cre_outcome_above,
          sources_unanimous: shadow.sources_unanimous,
          threshold_int: thresholdInt,
          operator_outcome_above: operatorOutcome,
          agrees_with_operator: agrees,
          method: shadow.method,
          computed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'market_id,pool_address' },
      );
      if (upErr) {
        results.push({ market_id: m.market_id, status: `store_failed:${upErr.message}` });
        continue;
      }
      results.push({ market_id: m.market_id, status: agrees == null ? 'shadow_pending_operator' : agrees ? 'agree' : 'diverge' });
    } catch (e: any) {
      results.push({ market_id: m.market_id, status: `error:${e?.message ?? e}` });
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: markets.length,
    processed,
    cap: CAP,
    results,
  });
}
