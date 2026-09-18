import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfileId, getSupabaseAdmin, normalizeWalletAddress } from '@/lib/server/social-admin';
import { requireWalletAuth } from '@/lib/server/privy-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const address = normalizeWalletAddress(searchParams.get('address'));
  if (!address) return NextResponse.json({ error: 'bad_address' }, { status: 400 });

  const auth = await requireWalletAuth(req, address);
  if (!auth.ok) return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });


  const profile = await getOrCreateProfileId(sb, address);
  if (!profile.id) return NextResponse.json({ error: 'profile_failed', message: profile.error }, { status: 500 });

  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '30') || 30));
  const before = searchParams.get('before');

  let query = sb
    .from('notifications')
    .select('*')
    .eq('recipient_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const [notes, unread] = await Promise.all([
    query,
    sb
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .is('read_at', null),
  ]);

  if (notes.error) return NextResponse.json({ error: 'read_failed', message: notes.error.message }, { status: 500 });
  if (unread.error) return NextResponse.json({ error: 'count_failed', message: unread.error.message }, { status: 500 });

  return NextResponse.json({
    notifications: notes.data ?? [],
    unreadCount: unread.count ?? 0,
  });
}

export async function PATCH(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { address?: string; id?: string; action?: 'mark_all_read' | 'mark_read' };
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

  const now = new Date().toISOString();
  const query =
    body.action === 'mark_read' && body.id
      ? sb
          .from('notifications')
          .update({ read_at: now })
          .eq('id', body.id)
          .eq('recipient_id', profile.id)
      : sb
          .from('notifications')
          .update({ read_at: now })
          .eq('recipient_id', profile.id)
          .is('read_at', null);

  const { error } = await query;
  if (error) return NextResponse.json({ error: 'write_failed', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, readAt: now });
}
