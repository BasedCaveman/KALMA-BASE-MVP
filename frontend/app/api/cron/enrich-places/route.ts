//kalma/frontend/app/api/cron/enrich-places/route.ts
//
// Daily Vercel-Cron route that keeps place activity profiles in sync with
// reality: for each active place missing a profile (new promotions) or
// whose profile is stale (refresh_after passed), it reads the city's
// English Wikipedia article, extracts documented weather-exposed economic
// activities, and upserts public.place_activity_profiles. The signal
// engine cron then refines every signal's affected_groups against these
// profiles (see docs/PLACE_ACTIVITY_ENRICHMENT_2026-07-07.md).
//
// Steady state is cheap: profiles refresh every 30 days, so a 71-place
// catalog costs ~2-3 Wikipedia fetches per day plus newly promoted
// cities. ENRICH_MAX_PER_RUN bounds a worst-case pass.
//
// Auth mirrors /api/cron/signal-engine: Vercel injects
// `Authorization: Bearer <CRON_SECRET>`; `?secret=` supported for manual
// triggers from curl / the dashboard.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  enrichPlaceActivities,
  ACTIVITY_TAXONOMY,
  canonicalGroup,
} from '@/lib/signal-engine/activity-profile';
import {
  mineObservationActivities,
  OBSERVATION_LEXICON,
  SUBTYPE_ACTIVITY,
  ADVISORY_SUBTYPES,
} from '@/lib/signal-engine/observation-activity';
import { FIELD_REPORT_SUBTYPES } from '@/lib/field-reports/taxonomy';

/**
 * observation-activity.ts is import-free by design (it runs under Node's
 * native type stripping), so it restates two vocabularies it cannot import:
 * the activity slugs and the advisory subtype list. This route holds all
 * three modules, so it is the cheapest place to catch them drifting apart.
 * Warn rather than throw — a stale slug should not take the daily cron down.
 */
function checkVocabularyDrift(): string[] {
  const problems: string[] = [];

  const known = new Set(Object.keys(ACTIVITY_TAXONOMY));
  for (const slug of [
    ...Object.keys(OBSERVATION_LEXICON),
    ...Object.values(SUBTYPE_ACTIVITY),
  ]) {
    if (!known.has(canonicalGroup(slug))) {
      problems.push(`activity slug "${slug}" is not in ACTIVITY_TAXONOMY`);
    }
  }

  const advisory = new Set(
    FIELD_REPORT_SUBTYPES.filter((s) => s.advisory).map((s) => s.id),
  );
  for (const id of ADVISORY_SUBTYPES) {
    if (!advisory.has(id)) problems.push(`"${id}" is no longer advisory`);
  }
  for (const id of advisory) {
    if (!ADVISORY_SUBTYPES.includes(id)) {
      problems.push(`advisory subtype "${id}" is missing from ADVISORY_SUBTYPES`);
    }
  }

  return problems;
}

export const runtime = 'nodejs';
export const maxDuration = 300; // polite 1.1s/fetch × default 20 ≈ 60s

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

  const limit = Math.max(
    1,
    Number(process.env.ENRICH_MAX_PER_RUN ?? 20),
  );

  const drift = checkVocabularyDrift();
  for (const problem of drift) {
    console.warn(`[enrich-places] vocabulary drift: ${problem}`);
  }

  try {
    const summary = await enrichPlaceActivities(supabase, {
      limit,
      log: (msg) => console.log(msg),
    });

    // L-a: after refreshing what the encyclopedia says, learn from what
    // people actually reported. Kept in this cron rather than its own so
    // both halves of a place's activity picture refresh together. A
    // failure here must not fail the Wikipedia pass that already
    // succeeded, so it is reported in the summary, not thrown.
    let observations: unknown = null;
    try {
      observations = await mineObservationActivities(supabase, {
        log: (msg) => console.log(msg),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[enrich-places] observation mining failed:', msg);
      observations = { error: msg };
    }

    return NextResponse.json({
      ok: true,
      ...summary,
      observations,
      vocabulary_drift: drift,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Manual triggers from the dashboard / curl with a body.
export const POST = GET;
