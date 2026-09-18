// kalma/frontend/lib/growth/focus-cities.ts
//
// The small set of cities the growth engine concentrates on.
//
// WHY CONCENTRATE. Spreading four posts a day across 245 places is the
// opposite of what the retrieval mechanic rewards. A post reaches
// out-of-network readers through SimClusters, whose candidate embedding is
// built from WHO FAVORITED IT (see x-ledger.ts), so every post from a place
// nobody follows starts from zero and stays there. Replying to the same
// handful of local accounts repeatedly is how a real person starts
// recognising us, and recognition is what produces the first favorites.
//
// HOW THESE WERE CHOSEN, on 2026-08-29. scripts/growth/x-city-scan.ts
// measured live weather conversation across 18 candidate cities in the three
// languages this engine writes well. The selection is NOT the top of that
// ranking: the raw score is dominated by one-off viral posts (Curitiba topped
// it on a single 1,012-like tweet from an account that does not cover
// weather), and what actually matters for a reply strategy is whether the
// city has RECURRING weather-serving accounts to build a relationship with.
//
//   cordoba-ar            @smn_cordoba posted 9 times in one scan
//   belo-horizonte-mg-br  @otempo 7 posts, @tempobh 2
//   porto-alegre-rs-br    @temposleopoldo 3, @portoalegre24h 3
//   rio-de-janeiro-rj-br  @alertario (official), @operacoesrio (already followed)
//   tampa-fl-us           @nwstampabay, @foxweather; Atlantic season peaks now
//   denver-co-us          @bianchiweather, @kdvr, @channel2kwgn
//
// TWO SWAPS OUT OF THE FIRST DRAFT, both on evidence.
//
// Houston is out (Pedro, 2026-08-29): the only one of the six already tested,
// and several replies there (@NWSHouston, @chasetxwx, @iembot_ama) produced
// no follow-back. Denver takes the slot.
//
// Belo Horizonte is out because verifying its accounts killed it. It was
// picked on @otempo posting 7 times in one scan, but @otempo replies to
// NOBODY and @tempobh reads as an automated feed, so the city had zero
// accounts to build a relationship with. Posting often and answering nobody
// is a broadcaster, the @iembot_ama pattern that already cost this account
// weeks. "Recurring" was the wrong proxy; "answers people" is the right one,
// because a mutual follow is what the retrieval loop needs.
// Phoenix takes the slot on a verified @jorgetweather (8 replies).
//
// This is a WEIGHT, never a filter. On a quiet day the reply scan already
// returns zero usable candidates fairly often, and turning focus into a hard
// restriction would convert those into guaranteed silence.

/** Place slugs, exactly as stored in `places.slug`. */
export const FOCUS_CITIES: readonly string[] = [
  'cordoba-ar',
  'phoenix-az-us',
  'porto-alegre-rs-br',
  'rio-de-janeiro-rj-br',
  'tampa-fl-us',
  'denver-co-us',
];

/**
 * Added to a reply candidate's score when it matches a focus city.
 *
 * Sized against the terms it competes with in scoreCandidate: freshness
 * contributes up to 10, visibility a few points, and naming the city rather
 * than the state is worth 2. At 3 this reliably outranks a same-freshness
 * candidate elsewhere without letting a day-old focus-city post beat a fresh
 * one somewhere else, which would trade the thing that actually gets replies
 * read (being early) for geography.
 */
export const FOCUS_CITY_BONUS = 3;

export function isFocusCity(slug: string | null | undefined): boolean {
  return slug ? FOCUS_CITIES.includes(slug) : false;
}

/**
 * The local accounts worth answering repeatedly, verified 2026-08-29.
 *
 * This is where concentration actually pays. A reply notifies its author, so
 * it is the one surface that reaches a real person without needing retrieval,
 * and answering the same ~15 people over weeks is how recognition (and then a
 * follow back, and then a favorite) gets built. The 48h per-author cooldown in
 * autopilot-policy.ts is untouched and does not bind here: 15 accounts at one
 * reply each per 48h leaves room for about seven a day, and the engine
 * currently manages one.
 *
 * EVERY handle was checked live rather than taken from the city scan's leader
 * list, and the check changed the answer. The bar is `repliesToOthers`,
 * measured the same way x-discover.ts measures it, because an account that
 * answers nobody can never follow back and can never produce the mutual edge
 * this whole strategy is aimed at.
 *
 * Rejected, and why they are worth naming: @alertario (0 replies, automated),
 * @tempobh (0, automated) and @nwstampabay (1, automated) are official alert
 * relays, which are excellent sources of local fact and useless as
 * relationships. @otempo posts constantly and answers nobody. That is the
 * @iembot_ama pattern this account already lost weeks to.
 */
export interface FocusAccount {
  handle: string;
  city: string;
  /** Replies to other people seen on one pass of /with_replies. */
  repliesToOthers: number;
}

export const FOCUS_ACCOUNTS: readonly FocusAccount[] = [
  { handle: 'bianchiweather', city: 'denver-co-us', repliesToOthers: 16 },
  { handle: 'temposleopoldo', city: 'porto-alegre-rs-br', repliesToOthers: 12 },
  { handle: 'jorgetweather', city: 'phoenix-az-us', repliesToOthers: 8 },
  { handle: 'foxweather', city: 'tampa-fl-us', repliesToOthers: 7 },
  { handle: 'diriodotempo2', city: 'porto-alegre-rs-br', repliesToOthers: 6 },
  { handle: 'operacoesrio', city: 'rio-de-janeiro-rj-br', repliesToOthers: 6 },
  { handle: 'kdvr', city: 'denver-co-us', repliesToOthers: 5 },
  { handle: 'portoalegre24h', city: 'porto-alegre-rs-br', repliesToOthers: 4 },
  { handle: 'smn_cordoba', city: 'cordoba-ar', repliesToOthers: 3 },
  { handle: 'channel2kwgn', city: 'denver-co-us', repliesToOthers: 3 },
];

/** Handles only, for merging into the tick's scan pool. */
export function focusAccountHandles(): string[] {
  return FOCUS_ACCOUNTS.map((a) => a.handle);
}
