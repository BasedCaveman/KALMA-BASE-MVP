//kalma/frontend/lib/social/types.ts

export type Profile = {
  id: string                  // uuid — Supabase auth user id
  wallet_address: string      // checksummed 0x address
  handle: string | null       // @handle — unique, lowercase, alphanumeric + underscores
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  specialty: 'rain' | 'temp' | 'snow' | 'all' | null  // market type focus
  created_at: string
  updated_at: string
}

export type Place = {
  id: string
  slug: string                // e.g. "perdoes-mg-br"
  name: string                // "Perdões"
  region: string | null       // "Minas Gerais"
  country: string             // "Brazil"
  country_code: string        // "BR"
  lat: number
  lon: number
  created_at: string
}

export type SignalPost = {
  id: string
  // NULL when the note was posted without a wallet. `anon_id` carries the
  // httpOnly browser identity instead (20260803_anonymous_observations.sql).
  // Exactly one of the two is always set.
  author_id: string | null
  anon_id?: string | null
  raw_text: string            // ≤280 chars, no URLs
  market_id: number | null    // links to onchain marketId (bigint stored as number)
  place_id: string | null
  moderation_state: 'visible' | 'hidden' | 'removed'
  created_at: string
  // FR-1 structured field report (all null for legacy plain-text notes)
  category?: string | null    // canonical taxonomy subtype id (lib/field-reports/taxonomy)
  severity?: 'low' | 'medium' | 'high' | null
  expires_at?: string | null
  reaction_counts?: {
    still_here: number
    gone: number
    last_confirmed_at: string | null
  }
  // joined
  author?: Profile
  place?: Place
}

export type Notification = {
  id: string
  recipient_id: string
  type: NotificationType
  data: NotificationData
  read_at: string | null
  created_at: string
}

export type NotificationType =
  | 'claim_ready'
  | 'market_closing'
  | 'forecast_shift'
  | 'new_market_in_place'
  | 'followed_user_signal'
  | 'followed_place_market'
  | 'place_observation'
  | 'watched_market_observation'

export type NotificationData = {
  market_id?: number
  place_id?: string
  signal_id?: string
  actor_id?: string
  /** Legacy EN fallback body. New rows also carry the structured fields
   *  below so the client can compose a localized body per language. */
  message?: string
  /** claim_ready: city the resolved market belongs to. */
  city_name?: string
  /** place_observation / watched_market_observation: field-note excerpt
   *  (user-generated content — shown verbatim, never machine-translated). */
  preview?: string
}

export type FollowUserRow    = { follower_id: string; following_id: string; created_at: string }
export type FollowPlaceRow   = { profile_id: string;  place_id: string;     created_at: string }
export type WatchMarketRow   = { profile_id: string;  market_id: number;    created_at: string }
export type ModerationReport = {
  id: string
  reporter_id: string
  content_id: string
  content_type: 'signal'
  reason: string
  created_at: string
}
