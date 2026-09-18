// kalma/frontend/app/api/observations/route.ts
//
// CW-1: post a plain-text weather observation ("what are you seeing?") for a
// market or place. Social writes MUST go through a service-role route — the
// browser anon client is default-denied on signal_posts (see
// 20260529_lock_social_writes.sql). Reads stay public (anon SELECT visible).
//
// CW-5 anti-abuse, server-side (can't be bypassed by calling the API directly):
//   - plain text only, <=280 chars
//   - link block hardened against look-alikes (bare domains, (dot), [.] , " dot ")
//   - per-IP rate limit via the shared ip_throttle bucket
//
// EVERY OBSERVATION HAS AN AUTHOR (2026-08-04). For one day this route also
// accepted anonymous posts stamped with an httpOnly cookie. That was the wrong
// fix for the right problem: the problem was that the wallet was demanded
// *before* the person could type, and the fix for that belongs in the client,
// which now keeps the composer open to everyone and opens Privy at the moment
// Share is pressed (deferred auth, Waze-style). Identity at the commit point
// costs one tap and buys attribution, corroboration weight, leaderboard credit
// and a real moderation handle, none of which a cookie can carry.
//
// So: a post always needs `address` + a Privy token proving that address is the
// caller's. Nothing was stranded by closing the anonymous path, which never
// received a single post in production. `signal_posts.author_id` stays nullable
// from 20260803 because reverting a deployed column is churn with no reader
// benefit; this route simply never writes NULL.
//
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireWalletAuth } from '@/lib/server/privy-auth';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';
import { CONTRACTS } from '@/lib/contracts';
import {
  getSubtype,
  expiryToSeconds,
  type FieldReportSeverity,
  type FieldReportExpiry,
} from '@/lib/field-reports/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CHARS = 280;

// Protocol, www, bare domains, and common obfuscations. Requires no space
// before the TLD so normal notes like "5cm. Net gain" don't trip it.
const LINK_PATTERN =
  /(https?:\/\/|www\.|[a-z0-9-]{2,}\.(?:com|net|org|io|me|xyz|app|co|info|link|gg|tk|ru|cn|biz|site|online)\b|\(dot\)|\[\.\]|\sdot\s)/i;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function previewText(text: string) {
  return text.length <= 120 ? text : `${text.slice(0, 117).trim()}...`;
}

async function notifyObservationFollowers(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  params: {
    authorProfileId: string;
    signalId: string;
    text: string;
    marketId: number | null;
    placeId: string | null;
  },
) {
  try {
    const recipients = new Map<
      string,
      'place_observation' | 'watched_market_observation'
    >();

    if (params.placeId) {
      const { data } = await sb
        .from('follow_places')
        .select('profile_id')
        .eq('place_id', params.placeId)
        .limit(100);
      for (const row of data ?? []) {
        if (row.profile_id && row.profile_id !== params.authorProfileId) {
          recipients.set(row.profile_id, 'place_observation');
        }
      }
    }

    if (params.marketId != null) {
      // market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md);
      // without this, a watcher of a same-numbered market in a different pool
      // would get notified about an observation on a market they never watched.
      const { data } = await sb
        .from('watch_markets')
        .select('profile_id')
        .eq('market_id', params.marketId)
        .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
        .limit(100);
      for (const row of data ?? []) {
        if (
          row.profile_id &&
          row.profile_id !== params.authorProfileId &&
          !recipients.has(row.profile_id)
        ) {
          recipients.set(row.profile_id, 'watched_market_observation');
        }
      }
    }

    const rows = [...recipients.entries()].map(([recipient_id, type]) => ({
      recipient_id,
      type,
      data: {
        signal_id: params.signalId,
        market_id: params.marketId ?? undefined,
        place_id: params.placeId ?? undefined,
        actor_id: params.authorProfileId ?? undefined,
        // `message` is the legacy EN fallback; `preview` lets the client
        // compose a localized body (lib/social/types.ts NotificationData).
        message: `New field note: ${previewText(params.text)}`,
        preview: previewText(params.text),
      },
    }));

    if (rows.length === 0) return;
    const { error } = await sb.from('notifications').insert(rows);
    if (error) {
      console.warn('[observations] notification insert failed:', error.message);
    }
  } catch (err) {
    console.warn(
      '[observations] notification skipped:',
      err instanceof Error ? err.message : err,
    );
  }
}

// Read visible observations for a market or place. Reads MUST go through this
// service-role route: the browser anon client's SELECT grant on signal_posts
// was revoked by 20260602_revoke_nonpublic_grants.sql (it returns 401), so the
// feed cannot read the table directly. Only moderation_state='visible' rows are
// returned, mirroring the old public-read policy.
export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb)
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const marketIdRaw = searchParams.get('marketId');
  const placeId = searchParams.get('placeId');
  const before = searchParams.get('before');
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get('limit') ?? '20') || 20),
  );

  const marketId =
    marketIdRaw != null &&
    marketIdRaw !== '' &&
    Number.isFinite(Number(marketIdRaw))
      ? Number(marketIdRaw)
      : null;

  if (marketId == null && !placeId) {
    return NextResponse.json({ error: 'no_target' }, { status: 400 });
  }

  // A market-page reader wants the same local conversation the place page
  // shows, not only the handful of notes that happen to carry this exact,
  // rotating market_id. POST already resolves and stores a place_id for
  // every market-attached note (see the write path below); GET did not
  // read back through that same place, so a market page showed empty while
  // the place it covers already had active notes. Resolve the market's
  // place here too and match either key, scoped to the live pool so a V7
  // market_id can never pull in a same-numbered V5 post.
  let query = sb
    .from('signal_posts')
    .select('*, author:profiles(*), place:places(*)')
    .eq('moderation_state', 'visible')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (marketId != null) {
    let marketPlaceId: string | null = placeId;
    if (!marketPlaceId) {
      const { data: resolved } = await sb.rpc('resolve_place_for_market', {
        p_market_id: marketId,
      });
      if (resolved) marketPlaceId = String(resolved);
    }
    const marketClause = `and(market_id.eq.${marketId},pool_address.eq.${CONTRACTS.CLIMATE_POOL.toLowerCase()})`;
    query = marketPlaceId
      ? query.or(`${marketClause},place_id.eq.${marketPlaceId}`)
      : query.or(marketClause);
  } else {
    query = query.eq('place_id', placeId as string);
  }
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: 'read_failed', message: error.message },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ signals: rows });

  const { data: reactions, error: reactionError } = await sb
    .from('field_report_reactions')
    .select('post_id,reaction,updated_at')
    .in('post_id', ids);

  if (reactionError) {
    console.warn('[observations] reaction read failed:', reactionError.message);
    return NextResponse.json({ signals: rows });
  }

  const stats = new Map<
    string,
    { still_here: number; gone: number; last_confirmed_at: string | null }
  >();
  for (const reaction of reactions ?? []) {
    const postId = String(reaction.post_id);
    const current = stats.get(postId) ?? {
      still_here: 0,
      gone: 0,
      last_confirmed_at: null,
    };
    if (reaction.reaction === 'still_here') {
      current.still_here += 1;
      const updatedAt = reaction.updated_at
        ? String(reaction.updated_at)
        : null;
      if (
        updatedAt &&
        (!current.last_confirmed_at || updatedAt > current.last_confirmed_at)
      ) {
        current.last_confirmed_at = updatedAt;
      }
    } else if (reaction.reaction === 'gone') {
      current.gone += 1;
    }
    stats.set(postId, current);
  }

  const signals = rows.map((row) => ({
    ...row,
    reaction_counts: stats.get(row.id) ?? {
      still_here: 0,
      gone: 0,
      last_confirmed_at: null,
    },
  }));

  return NextResponse.json({ signals });
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb)
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: {
    address?: string;
    text?: string;
    marketId?: number | string | null;
    placeId?: string | null;
    category?: string;
    severity?: string;
    expiry?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const address = String(body?.address ?? '').toLowerCase();
  const text = String(body?.text ?? '').trim();
  const marketId =
    body?.marketId != null &&
    body.marketId !== '' &&
    Number.isFinite(Number(body.marketId))
      ? Number(body.marketId)
      : null;
  const placeId = body?.placeId ? String(body.placeId) : null;

  // FR-1 structured fields (optional). category must be a known taxonomy
  // subtype; severity must be low/medium/high; expiry resolves to a timestamp.
  const rawCategory = body?.category ? String(body.category) : null;
  const category = rawCategory && getSubtype(rawCategory) ? rawCategory : null;
  if (rawCategory && !category) {
    return NextResponse.json({ error: 'bad_category' }, { status: 400 });
  }
  const rawSeverity = body?.severity ? String(body.severity) : null;
  if (rawSeverity && !['low', 'medium', 'high'].includes(rawSeverity)) {
    return NextResponse.json({ error: 'bad_severity' }, { status: 400 });
  }
  const severity = rawSeverity as FieldReportSeverity | null;
  let expiresAt: string | null = null;
  if (body?.expiry) {
    const secs = expiryToSeconds(String(body.expiry) as FieldReportExpiry);
    if (secs != null)
      expiresAt = new Date(Date.now() + secs * 1000).toISOString();
  }

  // Identity is required, and proven: the address must be well-formed AND
  // linked to the caller's Privy token, so "everyone may post" never becomes
  // "anyone may post as somebody else".
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'bad_address' }, { status: 400 });
  }
  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, message: auth.message },
      { status: auth.status },
    );
  }
  // A report needs either a structured category or some free text.
  if (!text && !category)
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  if (text.length > MAX_CHARS)
    return NextResponse.json({ error: 'too_long' }, { status: 400 });
  if (text && LINK_PATTERN.test(text)) {
    return NextResponse.json(
      { error: 'no_links', message: "Observations can't contain links." },
      { status: 400 },
    );
  }
  if (marketId == null && !placeId) {
    return NextResponse.json({ error: 'no_target' }, { status: 400 });
  }

  // Per-IP rate limit.
  const limit = Number(process.env.OBSERVATION_IP_HOURLY_LIMIT ?? '10');
  const throttle = await checkIpThrottle(
    sb,
    'observation',
    hashIp(getClientIp(req)),
    {
      limit,
      windowMs: 60 * 60 * 1000,
    },
  );
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many observations from this connection. Try again later.',
      },
      { status: 429 },
    );
  }

  // Resolve (or create) the author's profile by wallet. A first-time Google
  // signer reaches here one tap after pressing Share, so this upsert is
  // usually the moment their profile row is born.
  let authorProfileId: string | null = null;
  const existing = await sb
    .from('profiles')
    .select('id')
    .eq('wallet_address', address)
    .maybeSingle();
  if (existing.data?.id) {
    authorProfileId = existing.data.id;
  } else {
    const created = await sb
      .from('profiles')
      .upsert({ wallet_address: address }, { onConflict: 'wallet_address' })
      .select('id')
      .single();
    if (created.error)
      return NextResponse.json({ error: 'profile_failed' }, { status: 500 });
    authorProfileId = created.data.id;
  }
  if (!authorProfileId)
    return NextResponse.json({ error: 'profile_failed' }, { status: 500 });

  // Attribute market-attached observations to a place. The market detail
  // page posts with a marketId only, so without this every note from
  // /markets/[id] lands with place_id NULL — invisible to the daily place
  // briefs (lib/signal-engine/brief.ts reads by place_id) and to the
  // observation learning loop. Markets carry their place's coordinates, so
  // the SQL function resolves the nearest active place within 25 km and
  // returns NULL when a market's city genuinely has no place row.
  let resolvedPlaceId = placeId;
  if (!resolvedPlaceId && marketId != null) {
    const { data: resolved, error: resolveError } = await sb.rpc(
      'resolve_place_for_market',
      { p_market_id: marketId },
    );
    if (resolveError) {
      // Non-fatal: the observation is still worth storing without a place.
      console.warn(
        '[observations] place resolution failed:',
        resolveError.message,
      );
    } else if (resolved) {
      resolvedPlaceId = String(resolved);
    }
  }

  const { data, error } = await sb
    .from('signal_posts')
    .insert({
      author_id: authorProfileId,
      raw_text: text,
      market_id: marketId,
      // 20260826_market_pool_address.sql added a CHECK on this table:
      // (market_id is null) = (pool_address is null). This insert set
      // market_id without ever setting pool_address, so every post made
      // from a market page (marketId only, the common case) violated the
      // constraint and failed with insert_failed, every time, since that
      // migration landed. There is exactly one live pool an observation can
      // be posted against today, the same one every other write in this
      // file already assumes.
      pool_address:
        marketId != null ? CONTRACTS.CLIMATE_POOL.toLowerCase() : null,
      place_id: resolvedPlaceId,
      moderation_state: 'visible',
      category,
      severity,
      expires_at: expiresAt,
    })
    .select('*, author:profiles(*)')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'insert_failed', message: error.message },
      { status: 500 },
    );
  }

  // Notify on the resolved place, not the posted one: a note left on a
  // market now reaches people following that city, which is what following
  // a place was always supposed to mean. Recipients are deduped against
  // the market watchers below and capped, so the fan-out stays bounded.
  await notifyObservationFollowers(sb, {
    authorProfileId,
    signalId: data.id,
    text,
    marketId,
    placeId: resolvedPlaceId,
  });

  return NextResponse.json({ signal: data });
}
