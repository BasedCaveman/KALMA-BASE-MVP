//kalma/frontend/lib/social/follows.ts
import { supabase } from '@/lib/supabase'
import { CONTRACTS } from '@/lib/contracts'
import type { Profile, Place } from './types'

// ── User follows ──────────────────────────────────────────────────────────────

export async function followUser(followerId: string, followingId: string): Promise<boolean> {
  if (followerId === followingId) return false
  const { error } = await supabase
    .from('follow_users')
    .upsert({ follower_id: followerId, following_id: followingId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
  return !error
}

export async function unfollowUser(followerId: string, followingId: string): Promise<boolean> {
  const { error } = await supabase
    .from('follow_users')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  return !error
}

export async function isFollowingUser(followerId: string, followingId: string): Promise<boolean> {
  const { count } = await supabase
    .from('follow_users')
    .select('follower_id', { count: 'exact', head: true })
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  return (count ?? 0) > 0
}

export async function getFollowers(profileId: string, limit = 20, offset = 0): Promise<Profile[]> {
  const { data } = await supabase
    .from('follow_users')
    .select('profiles!follow_users_follower_id_fkey(*)')
    .eq('following_id', profileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean) as Profile[]
}

export async function getFollowing(profileId: string, limit = 20, offset = 0): Promise<Profile[]> {
  const { data } = await supabase
    .from('follow_users')
    .select('profiles!follow_users_following_id_fkey(*)')
    .eq('follower_id', profileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean) as Profile[]
}

/** Batch check: which of these profileIds does the current user follow? */
export async function getFollowingIds(followerId: string): Promise<string[]> {
  const { data } = await supabase
    .from('follow_users')
    .select('following_id')
    .eq('follower_id', followerId)
  return (data ?? []).map((r: any) => r.following_id)
}

// ── Place follows ─────────────────────────────────────────────────────────────

export async function followPlace(profileId: string, placeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('follow_places')
    .upsert({ profile_id: profileId, place_id: placeId }, { onConflict: 'profile_id,place_id', ignoreDuplicates: true })
  return !error
}

export async function unfollowPlace(profileId: string, placeId: string): Promise<boolean> {
  const { error } = await supabase
    .from('follow_places')
    .delete()
    .eq('profile_id', profileId)
    .eq('place_id', placeId)
  return !error
}

export async function isFollowingPlace(profileId: string, placeId: string): Promise<boolean> {
  const { count } = await supabase
    .from('follow_places')
    .select('profile_id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('place_id', placeId)
  return (count ?? 0) > 0
}

export async function getFollowedPlaces(profileId: string): Promise<Place[]> {
  const { data } = await supabase
    .from('follow_places')
    .select('places(*)')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r: any) => r.places).filter(Boolean) as Place[]
}

export async function getFollowedPlaceIds(profileId: string): Promise<string[]> {
  const { data } = await supabase
    .from('follow_places')
    .select('place_id')
    .eq('profile_id', profileId)
  return (data ?? []).map((r: any) => r.place_id)
}

// ── Market watches ────────────────────────────────────────────────────────────

// market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md).
// watch_markets' primary key became (profile_id, market_id, pool_address) in
// the 2026-08-26 migration; the two-column onConflict this file used to pass
// no longer matches any constraint on the table and would fail outright.
export async function watchMarket(profileId: string, marketId: number): Promise<boolean> {
  const { error } = await supabase
    .from('watch_markets')
    .upsert(
      { profile_id: profileId, market_id: marketId, pool_address: CONTRACTS.CLIMATE_POOL.toLowerCase() },
      { onConflict: 'profile_id,market_id,pool_address', ignoreDuplicates: true },
    )
  return !error
}

export async function unwatchMarket(profileId: string, marketId: number): Promise<boolean> {
  const { error } = await supabase
    .from('watch_markets')
    .delete()
    .eq('profile_id', profileId)
    .eq('market_id', marketId)
    .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
  return !error
}

export async function isWatchingMarket(profileId: string, marketId: number): Promise<boolean> {
  const { count } = await supabase
    .from('watch_markets')
    .select('profile_id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('market_id', marketId)
    .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
  return (count ?? 0) > 0
}
