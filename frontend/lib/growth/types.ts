// kalma/frontend/lib/growth/types.ts
//
// Shared types for the growth pipeline (Telegram-fed links → X replies/posts).
// Kept dependency-free so triage/compose stay unit-testable without Supabase.

export type GrowthKind = 'reply' | 'post';

export type GrowthStatus =
  | 'pending'
  | 'drafting'
  | 'awaiting_approval'
  | 'approved'
  | 'posting'
  | 'posted'
  | 'rejected'
  | 'failed'
  | 'skipped';

/** The six app languages (mirrors useTranslation). */
export type GrowthLang = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

/** Minimal place shape the matcher needs — a projection of public.places. */
export interface PlaceLite {
  slug: string;
  name: string;
  region: string | null;
  country: string;
  country_code: string;
}

/** Result of classifying + enriching an incoming link. */
export interface TriageResult {
  kind: GrowthKind;
  /** Present when kind === 'reply' — the tweet being replied to. */
  targetTweetId: string | null;
  /** Text we extracted to reason about (tweet text or news title+lead). */
  contextText: string;
  newsTitle: string | null;
  newsSummary: string | null;
  /** X handle for a reply (from the tweet), else null. */
  author: string | null;
  /** Detected content language (tweet lang), mapped to a supported lang, else null. */
  sourceLang: GrowthLang | null;
  /** The place we matched, if any. */
  place: PlaceLite | null;
}

/** A composed draft ready to be queued/posted. */
export interface Draft {
  text: string;
  lang: GrowthLang;
  /** Absolute URL of the /api/og place card, only when a live signal exists. */
  cardUrl: string | null;
}
