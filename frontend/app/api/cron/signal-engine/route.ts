// kalma/frontend/app/api/cron/signal-engine/route.ts
//
// Vercel-Cron-triggered route that runs one signal-engine pass.
//
// Schedule + auth:
//   - vercel.json registers a cron entry pointing here.
//   - Vercel injects an `Authorization: Bearer <CRON_SECRET>` header on
//     scheduled invocations. We accept either that bearer or a
//     `?secret=<CRON_SECRET>` query param so the route is callable from
//     the Vercel dashboard, GitHub Actions, or curl during development.
//
// Behavior — same as the legacy scripts/signal-engine.mjs orchestrator:
//   1. Load all active places (RLS lets the service role bypass anon limits).
//   2. Load all active signal types from signal_type_registry.
//   3. For each (place, type) pair → evaluateSignal → upsert into
//      local_signals via dedupe_key (one row per place/type/day).
//   4. Mark expired signals (valid_until < now) as 'expired'.
//
// Returns a summary JSON {created, updated, skipped, errors, elapsed_ms}.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateSignal,
  type Place,
  type SignalTypeDef,
  type CandidateSignal,
} from '@/lib/signal-engine/evaluator';
import { effectiveValidUntil } from '@/lib/signal-engine/validity';
import { refineAffectedGroups } from '@/lib/signal-engine/activity-profile';
import { loadConfirmedCommunityGroups } from '@/lib/signal-engine/observation-activity';
import { sanitizePlaceName } from '@/lib/server/place-name';
import { getCacheStats, resetCacheStats } from '@/lib/signal-engine/cache';

// This route hits Open-Meteo for every (place × type) combination — runs
// long. Force Node runtime + extend the function timeout when on Pro.
export const runtime = 'nodejs';
export const maxDuration = 300; // seconds — capped at the project plan limit

// ── Auth ───────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret set → only allow in dev to ease local testing.
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === expected;
}

// ── Orchestrator ───────────────────────────────────────────────────────────

async function runOnce(supabase: SupabaseClient) {
  const startedAt = Date.now();

  // Counters are module-level (cache.ts) so evaluateSignal can record hits/
  // misses without threading a counter through every call. Reset here so a
  // warm Lambda reused across cron ticks doesn't carry over the last pass's
  // numbers — see cache.ts for why the hit rate was silently zero before the
  // DOY-tolerance fix, and why this number is worth watching.
  resetCacheStats();

  // 1. Expire stale signals first — cheap, no Open-Meteo calls.
  const nowIso = new Date().toISOString();
  const { data: expiredRows, error: expireErr } = await supabase
    .from('local_signals')
    .update({ status: 'expired', expires_reason: 'window_passed' })
    .eq('status', 'active')
    .lt('valid_until', nowIso)
    .select('id');
  if (expireErr) console.warn('[signal-engine] expire failed:', expireErr);
  const expiredCount = expiredRows?.length ?? 0;

  // 1b. Promote popular searched cities into active places so they start
  // getting daily signals this same pass. Demand is captured in
  // place_candidates by /api/places/candidate. Conservative caps keep
  // Open-Meteo cost bounded.
  const promotedCount = await promoteCandidates(supabase);

  // 1c. Candidate funnel observability. `candidate_submissions` is the
  // per-(IP, grid) rate-limit ledger — NOT a demand queue — so its count
  // exceeding place_candidates is normal (multiple IPs share a cell).
  // Surfaced here so funnel health is visible in every cron summary
  // instead of requiring hand SQL.
  const candidateFunnel = await getCandidateFunnel(supabase);

  // 2. Load active places. Database uses lat/lon; the evaluator expects
  // latitude/longitude — alias to bridge the schema↔code naming.
  const { data: places, error: placesErr } = await supabase
    .from('places')
    .select('id, slug, name, latitude:lat, longitude:lon, country_code, region_code')
    .eq('active', true);
  if (placesErr) throw new Error(`load places: ${placesErr.message}`);
  if (!places || places.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      expired: expiredCount ?? 0,
      elapsed_ms: Date.now() - startedAt,
      note: 'no active places',
      historical_cache: getCacheStats(),
    };
  }

  // 3. Load active signal types.
  const { data: signalTypes, error: typesErr } = await supabase
    .from('signal_type_registry')
    .select('id, slug, category, title_template_key, body_template_key, trigger_logic, affected_groups, supported_regions, active')
    .eq('active', true);
  if (typesErr) throw new Error(`load signal types: ${typesErr.message}`);
  if (!signalTypes || signalTypes.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      expired: expiredCount ?? 0,
      elapsed_ms: Date.now() - startedAt,
      note: 'no active signal types',
      historical_cache: getCacheStats(),
    };
  }

  // 3b. Load place activity profiles (written by /api/cron/enrich-places).
  // Only coordinate-verified profiles refine affected_groups — unverified
  // ones may describe the wrong city (disambiguation). A missing profile
  // leaves the type defaults untouched (legacy behavior).
  const { data: profileRows, error: profErr } = await supabase
    .from('place_activity_profiles')
    .select('place_id, groups, coord_verified');
  if (profErr) console.warn('[signal-engine] load activity profiles failed:', profErr.message);
  const activityProfiles = new Map<string, string[]>(
    (profileRows ?? [])
      .filter((r) => r.coord_verified)
      .map((r) => [r.place_id as string, (r.groups ?? []) as string[]])
  );

  // 3c. Load community-confirmed activities (L-a, written by the mining
  // pass in /api/cron/enrich-places). These only ADD groups — a field
  // observation proves an activity is present, while nobody posting about
  // it proves nothing. Unlike the Wikipedia profile they apply even when
  // no article was matched, which is the point: Wikipedia is thinnest for
  // exactly the small rural places this catalog keeps adding.
  let communityGroups = new Map<string, string[]>();
  try {
    communityGroups = await loadConfirmedCommunityGroups(supabase);
  } catch (e) {
    console.warn(
      '[signal-engine] load community activity failed:',
      e instanceof Error ? e.message : e
    );
  }

  // 4. Evaluate every pair. Serial to keep Open-Meteo polite (~50ms RTT each).
  //    On Pro plan with 300s budget, 25 places × 7 types × ~250ms ≈ 45s.
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const errorLog: Array<{ place: string; type: string; message: string }> = [];

  // Track how many (place, type) pairs no longer fire so we can supersede
  // their stale active signals at the end of the loop.
  let superseded = 0;

  // Evaluate places in bounded-concurrency chunks. The catalog grew to ~50
  // places (battle-test expansion); a fully serial pass with cold Open-Meteo
  // fetches for the new cities blew past the 300s function limit, leaving the
  // tail of the list (the newest cities) with no signals. Running
  // SIGNAL_ENGINE_CONCURRENCY places in parallel — each place's own type loop
  // stays serial — keeps every place covered within budget. Open-Meteo
  // tolerates this concurrency; lower the env var if you ever get rate-limited.
  const CONCURRENCY = Math.max(1, Number(process.env.SIGNAL_ENGINE_CONCURRENCY ?? 6));

  async function processPlace(place: Place) {
    const local = { created: 0, updated: 0, skipped: 0, errors: 0, superseded: 0 };
    for (const signalType of signalTypes as SignalTypeDef[]) {
      try {
        const candidate = await evaluateSignal(supabase, place, signalType);
        if (!candidate) {
          local.skipped += 1;
          // "No longer fires" cleanup (Lima water_recovery case): supersede a
          // still-active row whose firing conditions have stopped holding.
          const { data: stale } = await supabase
            .from('local_signals')
            .update({ status: 'superseded' })
            .eq('place_id', place.id)
            .eq('signal_type_id', signalType.id)
            .eq('status', 'active')
            .select('id');
          if (stale && stale.length > 0) local.superseded += stale.length;
          continue;
        }
        // Ground the type-default groups in what this place actually does:
        // the Wikipedia-derived profile drops crop groups the city doesn't
        // have and adds documented ones; community-confirmed activities are
        // then added on top (additive only, never subtractive).
        candidate.affected_groups = refineAffectedGroups(
          candidate.affected_groups,
          activityProfiles.get(place.id) ?? null,
          signalType.category,
          undefined,
          communityGroups.get(place.id) ?? null,
        );
        const result = await upsertSignal(supabase, candidate);
        if (result === 'created') local.created += 1;
        else if (result === 'updated') local.updated += 1;
        else local.skipped += 1;
      } catch (e) {
        local.errors += 1;
        const msg = e instanceof Error ? e.message : String(e);
        errorLog.push({ place: place.slug, type: signalType.id, message: msg });
        // Continue — one Open-Meteo failure shouldn't break the others.
      }
    }
    return local;
  }

  // Shuffle so a cold cache (newly added cities) doesn't always sit at the tail
  // and get starved when we hit the time budget. Combined with the budget guard
  // below, repeated runs progressively warm the climatology cache (cache.ts /
  // historical_cache) until the whole catalog evaluates well within one pass.
  const placeList = (places as Place[]).slice();
  for (let i = placeList.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [placeList[i], placeList[j]] = [placeList[j], placeList[i]];
  }

  // Stop cleanly before Vercel's hard maxDuration kill so partial work — and
  // the warmed cache — always persists with a proper summary, instead of a 300s
  // timeout that drops the whole response.
  const BUDGET_MS = Number(process.env.SIGNAL_ENGINE_BUDGET_MS ?? 240_000);
  let placesProcessed = 0;
  let budgetHit = false;
  for (let i = 0; i < placeList.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetHit = true;
      break;
    }
    const chunk = placeList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(processPlace));
    for (const r of results) {
      created += r.created;
      updated += r.updated;
      skipped += r.skipped;
      errors += r.errors;
      superseded += r.superseded;
    }
    placesProcessed += chunk.length;
  }

  return {
    created,
    updated,
    skipped,
    errors,
    expired: expiredCount ?? 0,
    superseded,
    promoted: promotedCount,
    candidate_funnel: candidateFunnel,
    places_processed: placesProcessed,
    places_total: placeList.length,
    budget_hit: budgetHit,
    // hits/misses/shiftedHits/hitRate for historical_cache this pass. Watch
    // this after deploy: it was silently 0 before the DOY-tolerance fix in
    // cache.ts (exact-match reads meant every request missed). Expected
    // steady state at DOY_TOLERANCE=3 is a hit rate rising toward ~75% (each
    // row now serves ~4 days instead of 1) — see cache.ts for the math.
    historical_cache: getCacheStats(),
    elapsed_ms: Date.now() - startedAt,
    error_log: errorLog.slice(0, 20),
  };
}

// ── Candidate promotion ─────────────────────────────────────────────────────
//
// Promote demand-queue candidates (place_candidates, fed by
// /api/places/candidate) into active places. Policy knobs:
//   - PROMOTE_THRESHOLD: minimum search_count before a candidate is
//     eligible. Starts at 1 on testnet (any genuine search counts) — bump
//     for mainnet to require real repeat demand.
//   - PROMOTE_DAILY_CAP: max promotions per pass, to bound Open-Meteo cost
//     and keep one viral search from flooding the catalog.
const PROMOTE_THRESHOLD = 1;
const PROMOTE_DAILY_CAP = 10;

function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Server-side reverse geocode (no API key, no CSP — this runs in the cron, not
// the browser). Used to backfill country/region for candidates whose client
// geocoder omitted them, since places.country / .country_code are NOT NULL and
// a null there silently fails the promotion insert (23502).
async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<{ country: string | null; country_code: string | null; region: string | null; region_code: string | null } | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    // Normalize ISO long-forms to the common names the seed catalog uses, and
    // strip the trailing " (the)" the ISO list carries, so a promoted city
    // displays "United States" like the seeded ones, not "United States of
    // America (the)".
    const NAME_FIX: Record<string, string> = {
      'United States of America': 'United States',
      'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
      'Russian Federation': 'Russia',
      'Korea (the Republic of)': 'South Korea',
      'Bolivia (Plurinational State of)': 'Bolivia',
      'Venezuela (Bolivarian Republic of)': 'Venezuela',
      'Tanzania, the United Republic of': 'Tanzania',
      'Iran (Islamic Republic of)': 'Iran',
      'Viet Nam': 'Vietnam',
    };
    let countryName = ((j.countryName as string) || '').replace(/\s*\(the\)$/i, '').trim();
    countryName = NAME_FIX[countryName] || countryName;
    return {
      country: countryName || null,
      country_code: (j.countryCode as string) || null,
      region: (j.principalSubdivision as string) || null,
      region_code: (j.principalSubdivisionCode as string) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Snapshot of the city-demand funnel for the cron summary:
 *   submissions_ledger — rows in candidate_submissions (per-IP×grid
 *     rate-limit ledger; an audit trail, not a queue);
 *   candidates_pending / candidates_promoted — place_candidates by
 *     status (the actual demand queue);
 *   places_active — current catalog size.
 * Read-only; failures degrade to nulls rather than breaking the pass.
 */
async function getCandidateFunnel(supabase: SupabaseClient) {
  const count = async (table: string, filter?: { col: string; val: string }) => {
    try {
      let q = supabase.from(table).select('*', { count: 'exact', head: true });
      if (filter) q = q.eq(filter.col, filter.val);
      const { count: n, error } = await q;
      if (error) return null;
      return n ?? 0;
    } catch {
      return null;
    }
  };
  return {
    submissions_ledger: await count('candidate_submissions'),
    candidates_pending: await count('place_candidates', { col: 'status', val: 'pending' }),
    candidates_promoted: await count('place_candidates', { col: 'status', val: 'promoted' }),
    places_active: await count('places', { col: 'active', val: 'true' }),
  };
}

async function promoteCandidates(supabase: SupabaseClient): Promise<number> {
  const { data: candidates, error } = await supabase
    .from('place_candidates')
    .select('id, name, region, region_code, country, country_code, lat, lon, search_count')
    .eq('status', 'pending')
    .gte('search_count', PROMOTE_THRESHOLD)
    .order('search_count', { ascending: false })
    .limit(PROMOTE_DAILY_CAP);

  if (error || !candidates || candidates.length === 0) return 0;

  let promoted = 0;
  for (const c of candidates) {
    if (typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
    try {
      // Dedupe by proximity (~5km) against existing places. If one exists,
      // mark the candidate promoted to its slug without inserting a dup.
      const { data: near } = await supabase
        .from('places')
        .select('slug, lat, lon')
        .gte('lat', c.lat - 0.05)
        .lte('lat', c.lat + 0.05)
        .gte('lon', c.lon - 0.05)
        .lte('lon', c.lon + 0.05);
      const hit = (near ?? []).find(
        (p) =>
          typeof p.lat === 'number' &&
          typeof p.lon === 'number' &&
          haversineKm({ lat: p.lat, lon: p.lon }, { lat: c.lat, lon: c.lon }) <= 5,
      );
      if (hit) {
        await supabase
          .from('place_candidates')
          .update({ status: 'promoted', promoted_slug: hit.slug, promoted_at: new Date().toISOString() })
          .eq('id', c.id);
        continue;
      }

      // Candidates are written from the client geocoder, which often omits
      // country/country_code (and sometimes region). Backfill from a reverse
      // geocode so the NOT NULL columns are satisfied; otherwise the insert
      // fails and the candidate sits 'pending' forever (this was blocking
      // every searched city).
      let country = c.country;
      let countryCode = c.country_code;
      let region = c.region;
      let regionCode = c.region_code;
      if (!country || !countryCode) {
        const geo = await reverseGeocode(c.lat, c.lon);
        if (geo) {
          country = country || geo.country;
          countryCode = countryCode || geo.country_code;
          region = region || geo.region;
          regionCode = regionCode || geo.region_code;
        }
      }
      if (!country || !countryCode) {
        // Still unknown — leave pending to retry next pass rather than insert a
        // row that violates the NOT NULL columns.
        console.warn(`[signal-engine] promote skipped (no country) for ${c.name}`);
        continue;
      }

      const adminTag = regionCode
        ? String(regionCode).split('-').pop()?.toLowerCase() ?? ''
        : region
          ? slugifyName(region).slice(0, 12)
          : '';
      const ccLower = countryCode.toLowerCase();
      const baseSlug = [slugifyName(c.name), adminTag, ccLower].filter(Boolean).join('-');

      let slug = baseSlug;
      for (let i = 2; i <= 9; i++) {
        const { data: clash } = await supabase
          .from('places')
          .select('slug')
          .eq('slug', slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${baseSlug}-${i}`;
      }

      // C-2 defense-in-depth: candidate names are client-originated.
      const promotedName = sanitizePlaceName(c.name);
      if (!promotedName) continue;
      const { error: insErr } = await supabase.from('places').insert({
        slug,
        name: promotedName,
        region,
        region_code: regionCode,
        country,
        country_code: countryCode,
        lat: c.lat,
        lon: c.lon,
        active: true,
      });
      if (insErr && (insErr as any).code !== '23505') {
        console.warn('[signal-engine] promote insert failed:', insErr.message);
        continue;
      }

      await supabase
        .from('place_candidates')
        .update({ status: 'promoted', promoted_slug: slug, promoted_at: new Date().toISOString() })
        .eq('id', c.id);
      promoted += 1;
    } catch (e) {
      console.warn('[signal-engine] promote error:', e instanceof Error ? e.message : String(e));
    }
  }
  return promoted;
}

async function upsertSignal(
  supabase: SupabaseClient,
  signal: CandidateSignal
): Promise<'created' | 'updated' | 'unchanged'> {
  const row = {
    place_id: signal.place_id,
    signal_type_id: signal.signal_type_id,
    severity: signal.severity,
    confidence: signal.confidence,
    anomaly_score: signal.anomaly_score,
    affected_groups: signal.affected_groups,
    source_stack: signal.source_stack,
    structured_data: signal.structured_data,
    dedupe_key: signal.dedupe_key,
    valid_from: signal.valid_from,
    // A signal's validity belongs to its forecast window, not to the time
    // when the evaluator happened to run. Re-evaluations can refresh
    // severity/evidence without silently extending an already published
    // window on every cron tick.
    valid_until: signal.valid_until,
    status: 'active',
    evaluated_at: new Date().toISOString(),
  };

  // Try to find an existing ACTIVE row with the same dedupe_key. Scoped to
  // status = 'active' on purpose: an expired or superseded row must never
  // be found here and flipped back to active. A signal whose window
  // already passed is an immutable, archived record; a genuine new window
  // is a new row (see 06-ROUTE-CONTRACTS-LOTE-1-2.md, "arquivar, nunca
  // reviver"). Without this scope, the expire step above (which runs
  // earlier in the same pass) could mark a row 'expired', and this lookup
  // would then find that same row by dedupe_key and resurrect it with a
  // fresh window in a single cron cycle.
  const { data: existing } = await supabase
    .from('local_signals')
    .select('id, valid_until')
    .eq('dedupe_key', signal.dedupe_key)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('local_signals')
      .update({
        ...row,
        valid_until: effectiveValidUntil({
          existingValidUntil: existing.valid_until,
          candidateValidUntil: signal.valid_until,
        }),
      })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    // Also supersede any other active rows for the same (place, type)
    // — see comment block below for why this matters.
    await supersedePriors(supabase, signal, existing.id);
    return 'updated';
  }

  const { data: inserted, error } = await supabase
    .from('local_signals')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  // Supersede any prior active signals for this (place, type). The
  // dedupe_key already buckets by day, so daily cron passes used to
  // pile up multiple "active" rows for the same place+type (each with
  // a different dedupe_key but overlapping valid_until windows).
  // Production was holding 5 active rows per (place, type) on average
  // before this fix. The latest evaluation always wins.
  if (inserted?.id) await supersedePriors(supabase, signal, inserted.id);
  return 'created';
}

/**
 * Mark any active local_signals row for the same (place_id,
 * signal_type_id) as 'superseded' — except the row identified by
 * keepId, which is the just-upserted current one. Idempotent.
 */
async function supersedePriors(
  supabase: SupabaseClient,
  signal: CandidateSignal,
  keepId: string,
) {
  await supabase
    .from('local_signals')
    .update({ status: 'superseded', superseded_by: keepId })
    .eq('place_id', signal.place_id)
    .eq('signal_type_id', signal.signal_type_id)
    .eq('status', 'active')
    .neq('id', keepId);
}

// ── HTTP entrypoints ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json(
      { error: 'missing_supabase_env' },
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const summary = await runOnce(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Vercel Cron uses GET. POST is provided so manual triggers from the
// dashboard's "Run now" / curl with a body also work.
export const POST = GET;
