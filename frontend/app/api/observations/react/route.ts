// kalma/frontend/app/api/observations/react/route.ts
//
// FR-2: validation actions for field reports. These are off-chain reactions
// ("still here" / "gone") that feed public freshness/confidence labels.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';
import { requireWalletAuth } from '@/lib/server/privy-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Reaction = 'still_here' | 'gone';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { address?: string; signalId?: string; reaction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const address = String(body?.address ?? '').toLowerCase();
  const signalId = String(body?.signalId ?? '');
  const reaction = String(body?.reaction ?? '') as Reaction;

  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'bad_address' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(signalId)) {
    return NextResponse.json({ error: 'bad_signal' }, { status: 400 });
  }
  if (reaction !== 'still_here' && reaction !== 'gone') {
    return NextResponse.json({ error: 'bad_reaction' }, { status: 400 });
  }

  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });

  const throttle = await checkIpThrottle(sb, 'observation_reaction', hashIp(getClientIp(req)), {
    limit: Number(process.env.OBSERVATION_REACTION_IP_HOURLY_LIMIT ?? '60'),
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many report checks from this connection. Try again later.' },
      { status: 429 },
    );
  }

  const existing = await sb.from('profiles').select('id').eq('wallet_address', address).maybeSingle();
  let profileId = existing.data?.id ?? null;
  if (!profileId) {
    const created = await sb
      .from('profiles')
      .upsert({ wallet_address: address }, { onConflict: 'wallet_address' })
      .select('id')
      .single();
    if (created.error) return NextResponse.json({ error: 'profile_failed' }, { status: 500 });
    profileId = created.data.id;
  }

  const visible = await sb
    .from('signal_posts')
    .select('id')
    .eq('id', signalId)
    .eq('moderation_state', 'visible')
    .maybeSingle();
  if (visible.error) {
    return NextResponse.json({ error: 'read_failed', message: visible.error.message }, { status: 500 });
  }
  if (!visible.data?.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { error } = await sb
    .from('field_report_reactions')
    .upsert(
      {
        post_id: signalId,
        profile_id: profileId,
        reaction,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'post_id,profile_id' },
    );

  if (error) return NextResponse.json({ error: 'reaction_failed', message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reaction });
}
