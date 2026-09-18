import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfileId, getSupabaseAdmin, normalizeWalletAddress } from '@/lib/server/social-admin';
import { requireWalletAuth } from '@/lib/server/privy-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROFILE_FIELDS = 'id,wallet_address,handle,display_name,avatar_url,bio,specialty,created_at,updated_at';

async function readProfileStats(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, profileId: string) {
  const [signals, followers, following] = await Promise.all([
    sb
      .from('signal_posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profileId)
      .eq('moderation_state', 'visible'),
    sb
      .from('follow_users')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', profileId),
    sb
      .from('follow_users')
      .select('following_id', { count: 'exact', head: true })
      .eq('follower_id', profileId),
  ]);

  return {
    signalsCount: signals.count ?? 0,
    followersCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const address = normalizeWalletAddress(new URL(req.url).searchParams.get('address'));
  if (!address) return NextResponse.json({ error: 'bad_address' }, { status: 400 });

  const profileId = await getOrCreateProfileId(sb, address);
  if (!profileId.id) {
    return NextResponse.json({ error: 'profile_failed', message: profileId.error }, { status: 500 });
  }

  const { data, error } = await sb
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', profileId.id)
    .single();

  if (error) return NextResponse.json({ error: 'read_failed', message: error.message }, { status: 500 });
  return NextResponse.json({ profile: data, stats: await readProfileStats(sb, profileId.id) });
}

export async function PATCH(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const address = normalizeWalletAddress(body.address);
  if (!address) return NextResponse.json({ error: 'bad_address' }, { status: 400 });

  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });

  const updates: Record<string, unknown> = {};
  for (const key of ['handle', 'display_name', 'avatar_url', 'bio', 'specialty']) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key] ?? null;
  }

  // Audit M-2: server-side caps + avatar URL validation (fields render on
  // public surfaces: /compete, feeds, place pages).
  const FIELD_LIMITS: Record<string, number> = { display_name: 60, bio: 280, specialty: 60 };
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    const value = updates[field];
    if (value == null) continue;
    if (typeof value !== 'string') return NextResponse.json({ error: `bad_${field}` }, { status: 400 });
    updates[field] = value.trim().slice(0, max) || null;
  }
  if (updates.avatar_url != null) {
    const raw = typeof updates.avatar_url === 'string' ? updates.avatar_url.trim() : '';
    let parsed: URL | null = null;
    try {
      parsed = raw ? new URL(raw) : null;
    } catch {
      parsed = null;
    }
    if (raw && (!parsed || !['http:', 'https:'].includes(parsed.protocol) || raw.length > 500)) {
      return NextResponse.json(
        { error: 'bad_avatar_url', message: 'Avatar must be an http(s) image URL.' },
        { status: 400 },
      );
    }
    updates.avatar_url = raw || null;
  }

  if (typeof updates.handle === 'string') {
    const handle = updates.handle.toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
      return NextResponse.json(
        { error: 'bad_handle', message: 'Handle must be 3-30 characters: lowercase letters, numbers, underscores only.' },
        { status: 400 },
      );
    }
    updates.handle = handle;
  }

  const { data, error } = await sb
    .from('profiles')
    .upsert(
      {
        wallet_address: address,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address' },
    )
    .select(PROFILE_FIELDS)
    .single();

  if (error) {
    const message = error.code === '23505' ? 'That handle is already taken.' : error.message;
    return NextResponse.json({ error: 'write_failed', message }, { status: 400 });
  }

  return NextResponse.json({ profile: data, stats: await readProfileStats(sb, data.id) });
}
