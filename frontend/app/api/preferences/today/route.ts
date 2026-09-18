import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfileId, getSupabaseAdmin, normalizeWalletAddress } from '@/lib/server/social-admin';
import { requireWalletAuth } from '@/lib/server/privy-auth';
import { ACTIVITY_TAXONOMY, RISK_TAXONOMY } from '@/lib/activity-taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVITY_IDS = new Set(ACTIVITY_TAXONOMY.map((item) => item.id));
const RISK_IDS = new Set(RISK_TAXONOMY.map((item) => item.id));

function normalizeActivity(value: unknown) {
  return typeof value === 'string' && ACTIVITY_IDS.has(value as any) ? value : 'all';
}

function normalizeRisk(value: unknown) {
  return typeof value === 'string' && RISK_IDS.has(value as any) ? value : 'all';
}

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const address = normalizeWalletAddress(new URL(req.url).searchParams.get('address'));
  if (!address) return NextResponse.json({ error: 'bad_address' }, { status: 400 });

  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });


  const profile = await getOrCreateProfileId(sb, address);
  if (!profile.id) return NextResponse.json({ error: 'profile_failed', message: profile.error }, { status: 500 });

  const { data, error } = await sb
    .from('user_preferences')
    .select('today_activity_filter,today_risk_filter')
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'read_failed', message: error.message }, { status: 500 });

  return NextResponse.json({
    preferences: {
      activityFilter: normalizeActivity(data?.today_activity_filter),
      riskFilter: normalizeRisk(data?.today_risk_filter),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { address?: string; activityFilter?: string; riskFilter?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const address = normalizeWalletAddress(body.address);
  if (!address) return NextResponse.json({ error: 'bad_address' }, { status: 400 });

  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });


  const profile = await getOrCreateProfileId(sb, address);
  if (!profile.id) return NextResponse.json({ error: 'profile_failed', message: profile.error }, { status: 500 });

  const row = {
    profile_id: profile.id,
    today_activity_filter: normalizeActivity(body.activityFilter),
    today_risk_filter: normalizeRisk(body.riskFilter),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('user_preferences')
    .upsert(row, { onConflict: 'profile_id' })
    .select('today_activity_filter,today_risk_filter')
    .single();

  if (error) return NextResponse.json({ error: 'write_failed', message: error.message }, { status: 500 });

  return NextResponse.json({
    preferences: {
      activityFilter: normalizeActivity(data?.today_activity_filter),
      riskFilter: normalizeRisk(data?.today_risk_filter),
    },
  });
}
