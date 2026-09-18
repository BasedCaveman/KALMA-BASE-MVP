// kalma/frontend/app/api/leaderboard/route.ts
//
// Public read for the /compete leaderboard. Returns the on-chain creator/
// responder boards plus the off-chain observer reputation board for field
// reports. Canonical fields are passed through untouched; the /compete UI
// applies the warm labels (terminology seam).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP = 25;
const COMPETITION_START_ISO =
  new Date(
    (Number(process.env.COMPETITION_START_TS || '') ||
      Math.floor(Date.parse('2026-07-25T00:00:00Z') / 1000)) * 1000,
  ).toISOString();
const COMPETITION_END_ISO =
  new Date(
    (Number(process.env.COMPETITION_END_TS || '') ||
      Math.floor(Date.parse('2026-08-15T23:59:59Z') / 1000)) * 1000,
  ).toISOString();

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const sb = admin();
  if (!sb) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const [metaRes, buildersRes, predictorsRes, postsRes] = await Promise.all([
    sb.from('competition_meta').select('competition_start, competition_end, last_indexed_block, updated_at').eq('id', 1).maybeSingle(),
    sb.from('competition_scores').select('*').gt('markets_created', 0)
      .order('creator_revenue_wei', { ascending: false })
      .order('tvl_attracted_wei', { ascending: false })
      .limit(TOP),
    sb.from('competition_scores').select('*').gt('markets_predicted', 0)
      .order('markets_predicted', { ascending: false })
      .order('volume_wei', { ascending: false })
      .limit(TOP),
    sb.from('signal_posts')
      .select('id,author_id,category,severity,created_at,moderation_state')
      .eq('moderation_state', 'visible')
      .gte('created_at', COMPETITION_START_ISO)
      .lte('created_at', COMPETITION_END_ISO)
      .not('category', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const builders = buildersRes.data ?? [];
  const predictors = predictorsRes.data ?? [];
  const posts = postsRes.data ?? [];
  const postIds = posts.map((post) => post.id).filter(Boolean);
  const reactionsRes = postIds.length
    ? await sb.from('field_report_reactions').select('post_id,reaction').in('post_id', postIds)
    : { data: [], error: null };

  // Resolve display names in one query.
  const observerProfileIds = [...new Set(posts.map((post) => post.author_id).filter(Boolean))];
  const addrs = [...new Set([...builders, ...predictors].map((r) => r.address))];
  const nameMap = new Map<string, string>();
  const profileMap = new Map<string, { address: string; name: string | null }>();
  if (addrs.length) {
    const { data: profs } = await sb.from('profiles').select('wallet_address, display_name, handle').in('wallet_address', addrs);
    for (const p of profs ?? []) {
      const name = p.display_name || (p.handle ? `@${p.handle}` : null);
      if (name) nameMap.set(p.wallet_address, name);
    }
  }
  if (observerProfileIds.length) {
    const { data: profs } = await sb
      .from('profiles')
      .select('id,wallet_address,display_name,handle')
      .in('id', observerProfileIds);
    for (const p of profs ?? []) {
      const address = String(p.wallet_address ?? '').toLowerCase();
      if (!address) continue;
      profileMap.set(String(p.id), {
        address,
        name: p.display_name || (p.handle ? `@${p.handle}` : null),
      });
    }
  }

  const reactionCounts = new Map<string, { still_here: number; gone: number }>();
  for (const reaction of reactionsRes.data ?? []) {
    const postId = String(reaction.post_id);
    const current = reactionCounts.get(postId) ?? { still_here: 0, gone: 0 };
    if (reaction.reaction === 'still_here') current.still_here += 1;
    if (reaction.reaction === 'gone') current.gone += 1;
    reactionCounts.set(postId, current);
  }

  const observers = new Map<
    string,
    {
      address: string;
      name: string | null;
      field_reports: number;
      useful_reports: number;
      confirmations: number;
      gone_reports: number;
      reputation_score: number;
    }
  >();

  for (const post of posts) {
    const profile = profileMap.get(String(post.author_id));
    if (!profile) continue;
    const counts = reactionCounts.get(String(post.id)) ?? { still_here: 0, gone: 0 };
    const severityWeight = post.severity === 'high' ? 3 : post.severity === 'medium' ? 2 : 1;
    const useful = counts.still_here > counts.gone ? 1 : 0;
    const row = observers.get(profile.address) ?? {
      address: profile.address,
      name: profile.name,
      field_reports: 0,
      useful_reports: 0,
      confirmations: 0,
      gone_reports: 0,
      reputation_score: 0,
    };
    row.field_reports += 1;
    row.useful_reports += useful;
    row.confirmations += counts.still_here;
    row.gone_reports += counts.gone;
    row.reputation_score += 10 + severityWeight + counts.still_here * 4 - counts.gone * 3;
    observers.set(profile.address, row);
  }

  const observerRows = [...observers.values()]
    .map((row) => ({ ...row, reputation_score: Math.max(0, Math.round(row.reputation_score)) }))
    .filter((row) => row.field_reports > 0)
    .sort((a, b) => {
      const scoreDiff = b.reputation_score - a.reputation_score;
      if (scoreDiff !== 0) return scoreDiff;
      const usefulDiff = b.useful_reports - a.useful_reports;
      if (usefulDiff !== 0) return usefulDiff;
      return b.confirmations - a.confirmations;
    })
    .slice(0, TOP);
  // Force wei-sized fields to strings. Supabase serializes int8/numeric
  // columns as JS numbers; values >2^53 then stringify as scientific notation
  // (e.g. "1.355e+21"), which BigInt() rejects and would crash any client
  // that parses them. Normalizing here keeps every consumer safe.
  const WEI_FIELDS = ['tvl_attracted_wei', 'creator_revenue_wei', 'volume_wei'] as const;
  const toPlainString = (v: unknown): string => {
    if (v == null) return '0';
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return '0';
      return Math.trunc(v).toLocaleString('fullwide', { useGrouping: false });
    }
    const s = String(v).trim();
    if (!s) return '0';
    if (/e/i.test(s)) {
      const n = Number(s);
      return Number.isFinite(n)
        ? Math.trunc(n).toLocaleString('fullwide', { useGrouping: false })
        : '0';
    }
    return s.split('.')[0];
  };
  const decorate = (rows: typeof builders) =>
    rows.map((r) => {
      const out: Record<string, unknown> = { ...r, name: nameMap.get(r.address) ?? null };
      for (const f of WEI_FIELDS) if (f in out) out[f] = toPlainString(out[f]);
      return out;
    });

  const meta = {
    ...(metaRes.data ?? {}),
    competition_start: COMPETITION_START_ISO,
    competition_end: COMPETITION_END_ISO,
  };

  return NextResponse.json(
    { meta, builders: decorate(builders), predictors: decorate(predictors), observers: observerRows },
    { headers: { 'cache-control': 's-maxage=30, stale-while-revalidate=60' } },
  );
}
