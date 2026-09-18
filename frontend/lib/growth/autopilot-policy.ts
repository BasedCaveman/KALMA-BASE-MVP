// kalma/frontend/lib/growth/autopilot-policy.ts
//
// How much the account is allowed to do, and when. Pure functions over a
// ledger, so the whole policy can be reasoned about and tested without a
// browser anywhere near it.
//
// Three forces set these numbers:
//
//  1. A three-week-old account with 3 followers that suddenly posts 30 times
//     a day looks exactly like what it would be. New accounts get their reach
//     scored, and the fastest way to spend a young account is to behave like
//     a bot in week one. So there is a RAMP, not a constant.
//  2. Under 1000 followers, ORIGINAL POSTS are the lever, not replies.
//     X's author cold start (author_cold_start.rs in xai-org/x-algorithm,
//     read 2026-08-13) lifts one eligible post per feed request to rank slot
//     15-16, and its eligibility is: author under 1000 followers, post under
//     1000 impressions, under 24h old, and NOT a reply and NOT a repost.
//     Replies cannot receive it. So while we are under the cap, every
//     original post carries distribution a reply structurally cannot, and
//     the whole subsidy disappears the day we cross 1000 followers.
//  3. Replies still matter, for what they produce rather than for reach:
//     a follow back, which creates the mutual-follow edge that quadruples
//     the reply weight on all our FUTURE original posts (5.0 to 20.0,
//     ranking_scorer.rs bidirectional_boost_eligible), and an engagement
//     edge into the 7-day window user-cred-v2 runs its PageRank over.
//
// See docs/X_ALGORITHM_RESTRATEGY_2026-08-13.md for the full reading.

export interface DayCounts {
  posts: number;
  replies: number;
}

export interface Caps {
  posts: number;
  replies: number;
  /** Minimum seconds between any two actions. */
  minGapSeconds: number;
}

/**
 * The follower count at which X's author cold start stops applying. Above
 * this, an original post loses the free lift and posts and replies compete
 * on closer terms again.
 */
export const COLD_START_FOLLOWER_CAP = 1000;

/**
 * The ramp, in days since the autopilot started, widened by whether the
 * cold-start subsidy is still available to us.
 *
 * `followers` is optional so existing callers and tests keep working; when
 * it is unknown we assume we still qualify, which is true for this account
 * and stays true until it is not.
 */
export function capsForDay(daysRunning: number, followers?: number): Caps {
  if (daysRunning < 3) return { posts: 1, replies: 4, minGapSeconds: 900 };
  if (daysRunning < 7) return { posts: 2, replies: 8, minGapSeconds: 720 };
  if (daysRunning < 14) return { posts: 2, replies: 14, minGapSeconds: 600 };

  const coldStartEligible =
    followers === undefined || followers < COLD_START_FOLLOWER_CAP;
  // One post per scheduled window while the subsidy lasts. Deliberately not
  // higher: author diversity (decay 0.5, floor 0.25) already discounts a
  // second post by the same author inside one feed render to 0.625, so
  // stacking posts into the same hours buys progressively less, and volume
  // is the thing bdsm's timing model reads as mechanical.
  if (coldStartEligible) return { posts: 4, replies: 20, minGapSeconds: 480 };
  return { posts: 3, replies: 20, minGapSeconds: 480 };
}

export interface ActionGate {
  allowed: boolean;
  reason: string;
}

/** Is another action allowed right now? */
export function canAct(
  kind: 'post' | 'reply',
  counts: DayCounts,
  caps: Caps,
  secondsSinceLastAction: number,
  now = new Date(),
): ActionGate {
  if (secondsSinceLastAction < caps.minGapSeconds) {
    return {
      allowed: false,
      reason: `min_gap (${Math.round(caps.minGapSeconds - secondsSinceLastAction)}s left)`,
    };
  }
  const used = kind === 'post' ? counts.posts : counts.replies;
  const cap = kind === 'post' ? caps.posts : caps.replies;
  if (used >= cap) return { allowed: false, reason: `daily_cap (${used}/${cap})` };
  if (!withinActiveHours(now)) return { allowed: false, reason: 'quiet_hours' };
  return { allowed: true, reason: 'ok' };
}

/**
 * Local hours the account is awake. An account that posts evenly around the
 * clock is not a person, and posts at 04:00 local reach nobody anyway.
 * Defaults to 07:00 to 22:59 in the host machine's timezone.
 */
export function withinActiveHours(now = new Date()): boolean {
  const start = Number(process.env.X_ACTIVE_HOUR_START ?? 7);
  const end = Number(process.env.X_ACTIVE_HOUR_END ?? 23);
  const hour = now.getHours();
  return hour >= start && hour < end;
}

/**
 * Should this post carry its link as a self-reply?
 *
 * A link costs reach, and an account that asks for a click every single time
 * drains the goodwill it is building. Roughly one post in three carries the
 * ask; the rest are pure deposits.
 */
export function shouldAttachLink(postsToday: number): boolean {
  return postsToday % 3 === 0;
}

/**
 * Per-author cooldown. Replying to the same account twice in two days is how
 * a helpful reply becomes someone's reason to block you.
 */
export const AUTHOR_COOLDOWN_HOURS = 48;

export function authorIsCoolingDown(
  handle: string,
  repliedAt: Record<string, string>,
  now = new Date(),
): boolean {
  const last = repliedAt[handle.toLowerCase()];
  if (!last) return false;
  const elapsedHours = (now.getTime() - new Date(last).getTime()) / 3_600_000;
  return elapsedHours < AUTHOR_COOLDOWN_HOURS;
}

/** Place cooldown for posts, so the feed is not four days of one city. */
export const PLACE_COOLDOWN_DAYS = 5;
