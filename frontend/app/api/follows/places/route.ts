import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfileId, getSupabaseAdmin, normalizeWalletAddress } from '@/lib/server/social-admin';
import { requireWalletAuth } from '@/lib/server/privy-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readPlaceId(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, slug: string) {
  const { data, error } = await sb
    .from('places')
    .select('id,slug,name,region,country,country_code,lat,lon,created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data?.id) return { place: null, error: error?.message ?? 'place_not_found' };
  return { place: data, error: null as string | null };
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
    .from('follow_places')
    .select('places(id,slug,name,region,country,country_code,lat,lon,created_at)')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'read_failed', message: error.message }, { status: 500 });
  const places = (data ?? []).map((row: any) => row.places).filter(Boolean);
  return NextResponse.json({ places, slugs: places.map((place: any) => place.slug).filter(Boolean) });
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  let body: { address?: string; slug?: string; slugs?: string[]; action?: 'follow' | 'unfollow' | 'sync' };
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

  if (body.action === 'sync') {
    const slugs = Array.from(new Set((body.slugs ?? []).filter((slug): slug is string => typeof slug === 'string')));
    if (slugs.length === 0) return NextResponse.json({ ok: true });

    const { data: places, error: placesError } = await sb
      .from('places')
      .select('id')
      .in('slug', slugs.slice(0, 50));
    if (placesError) return NextResponse.json({ error: 'place_read_failed', message: placesError.message }, { status: 500 });

    const rows = (places ?? []).map((place: any) => ({ profile_id: profile.id, place_id: place.id }));
    if (rows.length > 0) {
      const { error } = await sb
        .from('follow_places')
        .upsert(rows, { onConflict: 'profile_id,place_id', ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: 'sync_failed', message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!slug) return NextResponse.json({ error: 'missing_slug' }, { status: 400 });

  const resolved = await readPlaceId(sb, slug);
  if (!resolved.place) return NextResponse.json({ error: 'place_not_found', message: resolved.error }, { status: 404 });

  if (body.action === 'unfollow') {
    const { error } = await sb
      .from('follow_places')
      .delete()
      .eq('profile_id', profile.id)
      .eq('place_id', resolved.place.id);
    if (error) return NextResponse.json({ error: 'unfollow_failed', message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, place: resolved.place });
  }

  const { error } = await sb
    .from('follow_places')
    .upsert(
      { profile_id: profile.id, place_id: resolved.place.id },
      { onConflict: 'profile_id,place_id', ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: 'follow_failed', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, place: resolved.place });
}
