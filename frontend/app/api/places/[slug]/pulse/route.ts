// kalma/frontend/app/api/places/[slug]/pulse/route.ts
//
// The daily question for one place. See the WHY block in
// supabase/migrations/20260805_place_pulse_answers.sql.
//
//   GET  - today's question, the local result so far, and whether the caller
//          has already answered. Public: the result line is the reward, and it
//          renders for readers who are not signed in.
//   POST - record one answer. Requires a verified address, same rule as a field
//          note: the chips are free to look at, and the tap opens sign-in.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireWalletAuth } from '@/lib/server/privy-auth';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';
import {
  questionFor,
  questionById,
  pulseDay,
  isActivityGroup,
  type PulseQuestion,
} from '@/lib/pulse/questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Maps an engine signal type to the family the field bank asks about. Same
// mapping as the observation composer's ask, kept here rather than imported
// because that copy lives in a client component.
const FAMILY_BY_TYPE: Record<string, 'dry' | 'water' | 'rain' | 'heat' | 'cold'> = {
  dry_stretch_window: 'dry',
  water_recovery_signal: 'water',
  rainfall_risk_rising: 'rain',
  heavy_rain_event: 'rain',
  heat_stress_window: 'heat',
  consecutive_cold_below: 'cold',
  frost_risk: 'cold',
};

const SEVERITY_RANK: Record<string, number> = {
  extreme: 4, high: 3, medium: 2, moderate: 2, low: 1,
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Sb = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** Everything the question depends on: the place, its lead signal, its groups. */
async function loadContext(sb: Sb, slug: string) {
  const { data: place } = await sb
    .from('places')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!place?.id) return null;

  const { data: signals } = await sb
    .from('local_signals')
    .select('signal_type_id, severity')
    .eq('place_id', place.id)
    .eq('status', 'active');

  // Lead signal = most severe, matching how the place page and the observation
  // ask choose. A question about the worst thing happening is the one worth
  // asking; a question about the third worst is noise.
  let family: 'dry' | 'water' | 'rain' | 'heat' | 'cold' | null = null;
  let best = -1;
  for (const s of signals ?? []) {
    const rank = SEVERITY_RANK[String(s.severity ?? '').toLowerCase()] ?? 0;
    const fam = FAMILY_BY_TYPE[String(s.signal_type_id)];
    if (fam && rank > best) {
      best = rank;
      family = fam;
    }
  }

  // Only a coord-verified profile is trusted, same rule as the signal engine.
  const { data: profile } = await sb
    .from('place_activity_profiles')
    .select('groups, coord_verified')
    .eq('place_id', place.id)
    .maybeSingle();
  const groups: string[] =
    profile?.coord_verified && Array.isArray(profile.groups) ? profile.groups : [];

  return { placeId: place.id as string, family, groups };
}

/** Today's tally for one question at one place. */
async function tally(sb: Sb, placeId: string, questionId: string, day: string) {
  const { data } = await sb
    .from('place_pulse_answers')
    .select('option_id')
    .eq('place_id', placeId)
    .eq('question_id', questionId)
    .eq('day', day);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String(row.option_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return { counts, total: (data ?? []).length };
}

function serialize(q: PulseQuestion) {
  return { id: q.id, bank: q.bank, prompt: q.prompt, options: q.options };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const { slug } = await ctx.params;
  const context = await loadContext(sb, slug);
  if (!context) return NextResponse.json({ error: 'unknown_place' }, { status: 404 });

  const day = pulseDay();
  const question = questionFor({
    placeSlug: slug,
    day,
    family: context.family,
    groups: context.groups,
  });
  const { counts, total } = await tally(sb, context.placeId, question.id, day);

  // Whether THIS reader already answered, when they say who they are. No auth
  // required to read the question, so an absent address simply means unknown.
  let answered: string | null = null;
  const address = String(req.nextUrl.searchParams.get('address') ?? '').toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(address)) {
    const { data: profile } = await sb
      .from('profiles').select('id').eq('wallet_address', address).maybeSingle();
    if (profile?.id) {
      const { data: mine } = await sb
        .from('place_pulse_answers')
        .select('option_id')
        .eq('place_id', context.placeId)
        .eq('question_id', question.id)
        .eq('day', day)
        .eq('author_id', profile.id)
        .maybeSingle();
      answered = mine?.option_id ? String(mine.option_id) : null;
    }
  }

  return NextResponse.json({ day, question: serialize(question), counts, total, answered });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const { slug } = await ctx.params;
  const body = await req.json().catch(() => null);
  const address = String(body?.address ?? '').toLowerCase();
  const questionId = String(body?.questionId ?? '');
  const optionId = String(body?.optionId ?? '');

  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'bad_address' }, { status: 400 });
  }
  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  const context = await loadContext(sb, slug);
  if (!context) return NextResponse.json({ error: 'unknown_place' }, { status: 404 });

  const day = pulseDay();
  // Re-derive today's question server-side rather than trusting the body: the
  // client may be a stale tab from yesterday, and an answer filed against the
  // wrong question would quietly corrupt the tally.
  const question = questionFor({
    placeSlug: slug,
    day,
    family: context.family,
    groups: context.groups,
  });
  if (questionId !== question.id) {
    return NextResponse.json({ error: 'stale_question' }, { status: 409 });
  }
  const known = questionById(questionId, context.groups);
  if (!known || !known.options.some((o) => o.id === optionId)) {
    return NextResponse.json({ error: 'bad_option' }, { status: 400 });
  }

  const throttle = await checkIpThrottle(sb, 'pulse', hashIp(getClientIp(req)), {
    limit: Number(process.env.PULSE_IP_HOURLY_LIMIT ?? '30'),
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const existing = await sb.from('profiles').select('id').eq('wallet_address', address).maybeSingle();
  let authorId = existing.data?.id as string | undefined;
  if (!authorId) {
    const created = await sb
      .from('profiles')
      .upsert({ wallet_address: address }, { onConflict: 'wallet_address' })
      .select('id')
      .single();
    if (created.error) return NextResponse.json({ error: 'profile_failed' }, { status: 500 });
    authorId = created.data.id;
  }

  const { error } = await sb.from('place_pulse_answers').insert({
    place_id: context.placeId,
    question_id: question.id,
    option_id: optionId,
    author_id: authorId,
    day,
  });
  // The unique index is the source of truth for "one answer per day". A repeat
  // is not an error worth showing: return the tally, same as a first answer.
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 500 });
  }

  const { counts, total } = await tally(sb, context.placeId, question.id, day);
  return NextResponse.json({
    day,
    counts,
    total,
    answered: optionId,
    // Signals to the client that this answer will also count as activity
    // evidence, so it can say so honestly rather than implying more.
    feedsActivity: question.bank === 'activity' && isActivityGroup(optionId),
  });
}
