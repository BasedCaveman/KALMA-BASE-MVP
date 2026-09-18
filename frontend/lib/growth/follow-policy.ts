// kalma/frontend/lib/growth/follow-policy.ts
//
// Who this account follows, how few, and how slowly.
//
// WHY FOLLOW AT ALL. X's bidirectional follow boost (ranking_scorer.rs in
// xai-org/x-algorithm, read 2026-08-13) takes the weight on P(reply) from 5.0
// to 20.0 for ORIGINAL posts by an author the viewer mutually follows. Read
// the condition carefully: it excludes replies and reposts, so the boost is
// not on our reply to them, it is on OUR OWN POSTS IN THEIR FEED, forever,
// once the follow is mutual. Ten real mutuals is ten feeds where everything
// we publish carries four times the weight on the most valuable prediction in
// the model. That is the compounding asset, and it costs ten follows.
//
// WHY SO FEW, AND SO SLOWLY. `FollowBot` is one of the eight task heads in
// bdsm/, X's inauthentic-account detector, which reads an account's action
// sequence with a position embedding built to represent "burstiness,
// mechanical cadence". Following is the single most bot-shaped action
// available to us, and unlike a bad post it cannot be deleted quietly. So:
// one a day, a hard total ceiling, never the same account twice, and no
// unfollowing ever (follow/unfollow churn is the exact FollowBot signature).
//
// The follow itself is worthless unless it becomes MUTUAL, and it can only
// become mutual if a person is behind the account and reads their
// notifications. That is why the eligibility bar below is the one discovery
// already measures: `repliesToOthers`, whether this account replies to
// people. An account that never replies to anyone will never follow us back
// and can never produce the boost even if it did.
//
// Pure and import-free, the same discipline as account-quality.ts: these
// decisions are hard to reverse in public, so they have to be testable
// without a browser.

/** At most one new follow a day. Not a rate to tune upward casually. */
export const MAX_FOLLOWS_PER_DAY = 1;

/**
 * Hard ceiling on accounts followed by the autopilot, ever.
 *
 * At one a day this is roughly a month of following, which is enough to hold
 * the boost with the whole vetted list and still leave the account's
 * following count small enough to read as a person curating a feed rather
 * than a bot harvesting one. Raising it is a decision to be taken on
 * evidence, after looking at how many of the first ones went mutual.
 */
export const MAX_FOLLOWS_TOTAL = 25;

/**
 * The minimum number of replies-to-other-people discovery must have seen
 * before we will follow an account.
 *
 * One is deliberately low: the measurement reads a single page of the
 * /with_replies tab, so it undercounts, and a zero can mean "never replies"
 * or "we could not read it". Requiring evidence of at least one real reply
 * keeps out the broadcast accounts without pretending the count is precise.
 */
export const MIN_REPLIES_TO_OTHERS = 1;

export interface FollowCandidate {
  handle: string;
  /** Replies this account made to other people, from discovery. */
  repliesToOthers?: number;
  /** Discovery's own ranking, used only to order an already-eligible pool. */
  score?: number;
}

export interface FollowState {
  /** Lowercased handles the autopilot has already followed, ever. */
  alreadyFollowed: string[];
  /**
   * Follow ATTEMPTS recorded today, successful or not.
   *
   * Counting attempts rather than successes is what stops a single bad
   * candidate from being reopened on every tick: a follow that fails still
   * cost a profile visit, and the visit is the part X can see.
   */
  followsToday: number;
  /**
   * Handles to drop from the queue without spending a slot against the total
   * ceiling: deleted accounts, and accounts whose profile shows no follow
   * button at all. They are not follows, so they must not be counted as
   * follows, but returning to them every day would be pure noise.
   */
  skipHandles?: string[];
}

export interface FollowDecision {
  handle: string | null;
  reason: string;
}

/**
 * Pick at most one account to follow this tick, or explain why none.
 *
 * Ordering inside the eligible pool is by discovery score, so the accounts
 * most likely to be worth a mutual go first while the ceiling is far away.
 */
export function nextFollow(
  candidates: FollowCandidate[],
  state: FollowState,
): FollowDecision {
  if (state.followsToday >= MAX_FOLLOWS_PER_DAY) {
    return { handle: null, reason: 'daily_follow_cap' };
  }
  if (state.alreadyFollowed.length >= MAX_FOLLOWS_TOTAL) {
    return { handle: null, reason: 'total_follow_cap' };
  }

  const seen = new Set(
    [...state.alreadyFollowed, ...(state.skipHandles ?? [])].map((h) => h.toLowerCase()),
  );
  const eligible = candidates
    .filter((c) => !seen.has(c.handle.toLowerCase()))
    .filter((c) => (c.repliesToOthers ?? 0) >= MIN_REPLIES_TO_OTHERS)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (!eligible.length) {
    return { handle: null, reason: 'no_eligible_candidate' };
  }
  return { handle: eligible[0].handle, reason: 'ok' };
}
