//kalma/frontend/lib/social/profiles.ts
import { supabase } from '@/lib/supabase'
import type { Profile } from './types'

/** Fetch a profile by wallet address. Returns null if not found. */
export async function getProfileByWallet(walletAddress: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single()
  if (error || !data) return null
  return data as Profile
}

/** Fetch a profile by handle. Returns null if not found. */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle.toLowerCase())
    .single()
  if (error || !data) return null
  return data as Profile
}

/** Upsert a profile. Creates if new, updates if exists. */
export async function upsertProfile(
  walletAddress: string,
  updates: Partial<Pick<Profile, 'handle' | 'display_name' | 'avatar_url' | 'bio' | 'specialty'>>
): Promise<{ profile: Profile | null; error: string | null }> {
  // Validate handle format
  if (updates.handle !== undefined && updates.handle !== null) {
    if (!/^[a-z0-9_]{3,30}$/.test(updates.handle)) {
      return { profile: null, error: 'Handle must be 3–30 characters: lowercase letters, numbers, underscores only.' }
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      wallet_address: walletAddress.toLowerCase(),
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { profile: null, error: 'That handle is already taken.' }
    }
    return { profile: null, error: error.message }
  }

  return { profile: data as Profile, error: null }
}

/** Check if a handle is available. */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('handle', handle.toLowerCase())
  return count === 0
}

/** Get public stats for a profile: markets created, signals posted, positions taken. */
export async function getProfileStats(profileId: string): Promise<{
  signalsCount: number
  followersCount: number
  followingCount: number
}> {
  const [signals, followers, following] = await Promise.all([
    supabase
      .from('signal_posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profileId)
      .eq('moderation_state', 'visible'),
    supabase
      .from('follow_users')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', profileId),
    supabase
      .from('follow_users')
      .select('following_id', { count: 'exact', head: true })
      .eq('follower_id', profileId),
  ])

  return {
    signalsCount:  signals.count  ?? 0,
    followersCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
  }
}
