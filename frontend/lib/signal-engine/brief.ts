// kalma/frontend/lib/signal-engine/brief.ts
//
// Daily Place Brief composition + verification.
//
// A brief is the dated public memory of one place's day on Kalma:
//   - signals: EN-resolved snapshot of the active local_signals rows
//     (prose + raw structured_data — four-kinds-of-truth labeling kept
//     via source_stack / category);
//   - observations: community field reports posted that day;
//   - commodity_events: market context routed via the place's verified
//     activity profile;
//   - verification (later): recorded Open-Meteo daily actuals for the
//     brief date, plus per-signal directional checks.
//
// Verification honesty note: signals fire over multi-day windows (48h
// rain accumulation, 7-day heat averages) while the brief verifies one
// calendar day. The checks are therefore explicitly *directional* —
// "was the day above/below the place's baseline?" — never a pass/fail
// grade of the forecast. The `note` field carries that caveat into the
// stored JSON so downstream consumers can't misquote it.
//
// Shared by the /api/cron/place-briefs route (writes, service role) and
// the /places/[slug]/briefs pages + JSON feed (reads, anon).

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDailyActuals } from './brief-actuals';
import { buildCompatibleChecks, safeVerification, COMPARISON_NOTE, type ComparisonContract, type WindowEvidence } from './verification-contract';
import { composeCard, type StoredSignal } from './composer';
import { resolveSignalString } from './i18n';
import {
  eventsForProfile,
  type CommodityContextEvent,
} from './commodity-context';

// ── Types ───────────────────────────────────────────────────────────────────

export type BriefSignal = {
  signal_type_id: string;
  category: string;
  severity: StoredSignal['severity'];
  confidence: number;
  affected_groups: string[];
  sources: string[];
  title: string; // EN-resolved (canonical citation text)
  body: string; // EN-resolved
  structured_data: Record<string, any>;
  valid_from: string;
  valid_until: string;
};

export type BriefObservations = {
  count: number;
  latest: Array<{ text: string; created_at: string }>;
};

export type VerificationCheck = {
  signal_type_id: string;
  title: string;
  metric: string;
  /** The place's historical baseline the signal was measured against. */
  baseline: number;
  /** What the day actually recorded. */
  actual: number;
  unit: string;
  comparison_contract?: ComparisonContract;
  verdict: 'above_baseline' | 'near_baseline' | 'below_baseline';
};

export type BriefVerification = {
  actuals: {
    comparison_observations?: Record<string, WindowEvidence>;
    precipitation_sum_mm: number | null;
    temperature_max_c: number | null;
    temperature_min_c: number | null;
    snowfall_sum_cm: number | null;
    wind_gusts_max_kmh: number | null;
  };
  checks: VerificationCheck[];
  comparison_status?: string;
  method: 'open-meteo-daily';
  note: string;
};

export type PlaceBrief = {
  id: string;
  place_id: string;
  brief_date: string; // YYYY-MM-DD
  signals: BriefSignal[];
  observations: BriefObservations;
  commodity_events: CommodityContextEvent[];
  verification: BriefVerification | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BriefPlace = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lon: number;
  /** Verified activity groups, or null when no trusted profile exists. */
  activityGroups: string[] | null;
};

// ── Date helpers ────────────────────────────────────────────────────────────

/** Strict YYYY-MM-DD gate for anything arriving from a URL segment. */
export function isValidBriefDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Today's date in UTC — briefs are bucketed on UTC days, matching the
 *  signal engine's dedupe_key day buckets. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Composition (service role) ──────────────────────────────────────────────

/**
 * Snapshot the current active signals for a place into brief form.
 * EN-resolved on purpose: briefs are the canonical citation artifact,
 * same policy as /places/[slug] (task #30).
 */
async function snapshotSignals(
  supabase: SupabaseClient,
  placeId: string,
): Promise<BriefSignal[]> {
  const { data, error } = await supabase
    .from('local_signals')
    .select(
      `signal_type_id, status, severity, confidence, anomaly_score,
       affected_groups, source_stack, structured_data,
       valid_from, valid_until, evaluated_at, id, place_id`,
    )
    .eq('place_id', placeId)
    .eq('status', 'active')
    .order('evaluated_at', { ascending: false });
  if (error) throw new Error(`signals snapshot: ${error.message}`);

  return (data ?? []).map((row: any): BriefSignal => {
    const composed = composeCard(row as StoredSignal);
    return {
      signal_type_id: composed.signalTypeId,
      category: composed.category,
      severity: composed.severity,
      confidence: composed.confidence,
      affected_groups: composed.affectedGroups,
      sources: composed.sources,
      title: resolveSignalString('en', composed.titleKey),
      body: resolveSignalString('en', composed.bodyKey, composed.bodyValues),
      structured_data: row.structured_data ?? {},
      valid_from: row.valid_from,
      valid_until: row.valid_until,
    };
  });
}

/**
 * Snapshot the day's visible field observations for a place. Text only,
 * no author identity — the brief is a public permanent artifact and
 * observation text is already public + length/link-limited at write time.
 */
async function snapshotObservations(
  supabase: SupabaseClient,
  placeId: string,
  briefDate: string,
): Promise<BriefObservations> {
  const dayStart = `${briefDate}T00:00:00Z`;
  const dayEnd = `${briefDate}T23:59:59Z`;
  const { data, error, count } = await supabase
    .from('signal_posts')
    .select('raw_text, created_at', { count: 'exact' })
    .eq('place_id', placeId)
    .eq('moderation_state', 'visible')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(`observations snapshot: ${error.message}`);
  return {
    count: count ?? data?.length ?? 0,
    latest: (data ?? []).map((r: any) => ({
      text: String(r.raw_text ?? ''),
      created_at: r.created_at,
    })),
  };
}

/**
 * Compose (or refresh) today's brief for one place and upsert it.
 * Reads only from Supabase — no external API calls — so the cron can
 * cover the whole catalog cheaply. Returns 'created' | 'updated'.
 */
export async function composeBriefForPlace(
  supabase: SupabaseClient,
  place: BriefPlace,
  activeCommodityEvents: CommodityContextEvent[],
  briefDate: string = utcToday(),
): Promise<'created' | 'updated'> {
  const signals = await snapshotSignals(supabase, place.id);
  const observations = await snapshotObservations(supabase, place.id, briefDate);
  const commodityEvents = eventsForProfile(
    activeCommodityEvents,
    place.activityGroups,
  );

  const row = {
    place_id: place.id,
    brief_date: briefDate,
    signals,
    observations,
    commodity_events: commodityEvents,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: findErr } = await supabase
    .from('place_briefs')
    .select('id')
    .eq('place_id', place.id)
    .eq('brief_date', briefDate)
    .maybeSingle();
  if (findErr) throw new Error(`brief lookup: ${findErr.message}`);

  if (existing?.id) {
    const { error } = await supabase
      .from('place_briefs')
      .update(row)
      .eq('id', existing.id);
    if (error) throw new Error(`brief update: ${error.message}`);
    return 'updated';
  }
  const { error } = await supabase.from('place_briefs').insert(row);
  if (error) throw new Error(`brief insert: ${error.message}`);
  return 'created';
}

// ── Verification (service role) ─────────────────────────────────────────────

type DailyActuals = BriefVerification['actuals'];

/**
 * Build per-signal directional checks from a brief's signal snapshot and
 * the recorded actuals. Only signal families with a stored baseline get a
 * check; everything else stays context-only (absent from checks).
 */
export function buildChecks(
  signals: BriefSignal[],
  actuals: DailyActuals,
  date?: string,
): VerificationCheck[] {
  return buildCompatibleChecks(signals, actuals, date);
}

/**
 * Verify one past brief in place: fetch the recorded daily values for
 * its date, attach directional checks, and stamp verified_at.
 * Returns false when actuals are not available yet (retry next pass).
 */
export async function verifyBrief(
  supabase: SupabaseClient,
  brief: Pick<PlaceBrief, 'id' | 'brief_date' | 'signals'>,
  place: Pick<BriefPlace, 'lat' | 'lon'>,
): Promise<boolean> {
  const actuals = await fetchDailyActuals(place.lat, place.lon, brief.brief_date);
  if (!actuals) return false;

  const verification: BriefVerification = {
    actuals,
    checks: buildChecks(brief.signals ?? [], actuals, brief.brief_date),
    method: 'open-meteo-daily',
    note: COMPARISON_NOTE,
  };

  const safe = safeVerification(verification, brief.brief_date)!;

  const { error } = await supabase
    .from('place_briefs')
    .update({
      verification: safe,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', brief.id);
  if (error) throw new Error(`brief verify update: ${error.message}`);
  return true;
}
