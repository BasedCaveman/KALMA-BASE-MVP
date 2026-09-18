// kalma/frontend/app/api/observations/report/route.ts
//
// CW-5: community flag on an observation. Service-role (moderation_reports is
// service-role-only). At a flag threshold the post auto-hides
// (moderation_state -> hidden) pending operator review, so abuse is contained
// without waiting on a human. Per-IP rate limited so flagging can't be weaponised.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';
import { requireWalletAuth } from '@/lib/server/privy-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HIDE_THRESHOLD = Number(process.env.OBSERVATION_FLAG_HIDE_THRESHOLD ?? '3');

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { address?: string; signalId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const address = String(body?.address ?? '').toLowerCase();
  const signalId = String(body?.signalId ?? '');
  const reason = String(body?.reason ?? 'flagged').slice(0, 280);

  if (!/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: 'bad_address' }, { status: 400 });
  if (!signalId) return NextResponse.json({ error: 'no_signal' }, { status: 400 });

  // H-1c: flags require a verified Privy session, so one attacker can no
  // longer mint 3 fake reporter identities and auto-hide arbitrary posts.
  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });

  const throttle = await checkIpThrottle(sb, 'observation_report', hashIp(getClientIp(req)), {
    limit: Number(process.env.OBSERVATION_REPORT_IP_HOURLY_LIMIT ?? '20'),
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  // Resolve reporter profile (create a bare one if needed).
  let reporterId: string | null = null;
  const existing = await sb.from('profiles').select('id').eq('wallet_address', address).maybeSingle();
  if (existing.data?.id) {
    reporterId = existing.data.id;
  } else {
    const created = await sb
      .from('profiles')
      .upsert({ wallet_address: address }, { onConflict: 'wallet_address' })
      .select('id')
      .single();
    if (created.error) return NextResponse.json({ error: 'profile_failed' }, { status: 500 });
    reporterId = created.data.id;
  }

  await sb.from('moderation_reports').insert({
    reporter_id: reporterId,
    content_id: signalId,
    content_type: 'signal',
    reason,
  });

  // CW-5: auto-hide at the threshold of distinct reporters.
  const { data: reports } = await sb
    .from('moderation_reports')
    .select('reporter_id')
    .eq('content_id', signalId)
    .eq('content_type', 'signal');
  const distinct = new Set((reports ?? []).map((r) => r.reporter_id)).size;
  let hidden = false;
  if (distinct >= HIDE_THRESHOLD) {
    await sb.from('signal_posts').update({ moderation_state: 'hidden' }).eq('id', signalId);
    hidden = true;
  }

  return NextResponse.json({ ok: true, hidden });
}
