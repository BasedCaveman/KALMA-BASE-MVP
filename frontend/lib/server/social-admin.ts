import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function normalizeWalletAddress(address: unknown) {
  const value = String(address ?? '').toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(value) ? value : null;
}

export async function getOrCreateProfileId(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  walletAddress: string,
) {
  const existing = await sb
    .from('profiles')
    .select('id')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing.data?.id) return { id: existing.data.id as string, error: null as string | null };

  const created = await sb
    .from('profiles')
    .upsert({ wallet_address: walletAddress }, { onConflict: 'wallet_address' })
    .select('id')
    .single();

  if (created.error || !created.data?.id) {
    return { id: null, error: created.error?.message ?? 'profile_failed' };
  }

  return { id: created.data.id as string, error: null as string | null };
}
