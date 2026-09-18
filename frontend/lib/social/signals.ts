//kalma/frontend/lib/social/signals.ts
import { supabase } from '@/lib/supabase'
import type { SignalPost } from './types'

const MAX_CHARS = 280
const URL_PATTERN = /https?:\/\/|www\./i

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createSignal(params: {
  authorId: string
  text: string
  marketId?: number | null
  placeId?: string | null
}): Promise<{ signal: SignalPost | null; error: string | null }> {
  const text = params.text.trim()

  if (!text) {
    return { signal: null, error: 'Signal cannot be empty.' }
  }
  if (text.length > MAX_CHARS) {
    return { signal: null, error: `Signal must be ${MAX_CHARS} characters or fewer.` }
  }
  if (URL_PATTERN.test(text)) {
    return { signal: null, error: 'Signals cannot contain links.' }
  }

  const { data, error } = await supabase
    .from('signal_posts')
    .insert({
      author_id: params.authorId,
      raw_text: text,
      market_id: params.marketId ?? null,
      place_id: params.placeId ?? null,
      moderation_state: 'visible',
    })
    .select('*, author:profiles(*), place:places(*)')
    .single()

  if (error) return { signal: null, error: error.message }
  return { signal: data as SignalPost, error: null }
}

export async function deleteSignal(signalId: string, authorId: string): Promise<boolean> {
  // Only the author can delete their own signal
  const { error } = await supabase
    .from('signal_posts')
    .delete()
    .eq('id', signalId)
    .eq('author_id', authorId)
  return !error
}

export async function reportSignal(params: {
  reporterId: string
  signalId: string
  reason: string
}): Promise<boolean> {
  const { error } = await supabase
    .from('moderation_reports')
    .insert({
      reporter_id: params.reporterId,
      content_id: params.signalId,
      content_type: 'signal',
      reason: params.reason,
    })
  return !error
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Feed for a user: signals from followed users and followed places */
export async function getFeedSignals(params: {
  followingIds: string[]
  followedPlaceIds: string[]
  limit?: number
  before?: string    // ISO timestamp for pagination cursor
}): Promise<SignalPost[]> {
  const { followingIds, followedPlaceIds, limit = 20, before } = params

  if (followingIds.length === 0 && followedPlaceIds.length === 0) return []

  let query = supabase
    .from('signal_posts')
    .select('*, author:profiles(*), place:places(*)')
    .eq('moderation_state', 'visible')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  // Filter: author in following OR place in followed places
  const orClauses: string[] = []
  if (followingIds.length > 0) {
    orClauses.push(`author_id.in.(${followingIds.join(',')})`)
  }
  if (followedPlaceIds.length > 0) {
    orClauses.push(`place_id.in.(${followedPlaceIds.join(',')})`)
  }
  if (orClauses.length > 0) {
    query = query.or(orClauses.join(','))
  }

  const { data } = await query
  return (data ?? []) as SignalPost[]
}

/** Signals for a specific market (commentary feed on market detail page) */
// Reads go through the service-role GET /api/observations route. The browser
// anon client's SELECT grant on signal_posts was revoked for security
// (20260602_revoke_nonpublic_grants.sql) and now returns 401 — so we must not
// query the table directly from the client.
async function fetchObservations(
  params: { marketId?: number; placeId?: string; limit: number; before?: string },
): Promise<SignalPost[]> {
  const qs = new URLSearchParams();
  if (params.marketId != null) qs.set('marketId', String(params.marketId));
  if (params.placeId) qs.set('placeId', params.placeId);
  qs.set('limit', String(params.limit));
  if (params.before) qs.set('before', params.before);
  try {
    const res = await fetch(`/api/observations?${qs.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => null);
    return (payload?.signals ?? []) as SignalPost[];
  } catch {
    return [];
  }
}

export async function getMarketSignals(marketId: number, limit = 20, before?: string): Promise<SignalPost[]> {
  return fetchObservations({ marketId, limit, before });
}

/** Signals for a specific place */
export async function getPlaceSignals(placeId: string, limit = 20, before?: string): Promise<SignalPost[]> {
  return fetchObservations({ placeId, limit, before })
}

/** Signals by a specific author */
export async function getAuthorSignals(authorId: string, limit = 20, before?: string): Promise<SignalPost[]> {
  let query = supabase
    .from('signal_posts')
    .select('*, author:profiles(*), place:places(*)')
    .eq('author_id', authorId)
    .eq('moderation_state', 'visible')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data } = await query
  return (data ?? []) as SignalPost[]
}
