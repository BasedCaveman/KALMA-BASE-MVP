// kalma/frontend/lib/growth/account-quality.ts
//
// Is a candidate account a room we can join, or a machine talking to nobody?
//
// Fourteen days of live running answered this the hard way: the engine used
// 10 of roughly 240 available reply slots, and every reply it did publish
// scored vis:0.0. The three most recent targets were @iembot_ama (Iowa
// Mesonet's relay), @_FresnoCA (alert feed) and @BOM_Qld (bureau feed). All
// three are automated. None of them can ever reply back, and in X's published
// ranking weights the author replying to our reply is the highest-scoring
// event available to a small account.
//
// So the question stopped being "how big is this account" and became "is
// there a person behind it". Follower count is a weight here, never a gate.
//
// Pure and import-free on purpose, the same discipline as
// lib/signal-engine/activity-profile.ts: these predicates REJECT accounts, and
// this project has been bitten three separate times by filters that rejected
// in silence. They need to be testable without a browser anywhere near them.

/** Below this there is no room to be seen in, whatever the conversation. */
export const MIN_FOLLOWERS = 300;

/**
 * Account size as a curve rather than a cutoff. Too small and a reply is read
 * by nobody; too large and it lands around position 200 in the thread. Peaks
 * near 25k and decays both ways on a log scale, so a 250k account still
 * scores when its conversation is strong, and a 2.5M account effectively
 * does not.
 */
export function sizeWeight(followers: number): number {
  if (followers < MIN_FOLLOWERS) return 0;
  const decades = Math.log10(followers);
  const peak = Math.log10(25_000);
  return Math.max(0, 3 - Math.abs(decades - peak) * 1.5);
}

/**
 * Handles that are almost always an automated relay.
 *
 * Deliberately narrow. The `bot` rule requires an underscore or a capital
 * before it precisely so that a person called Talbot is not read as a
 * machine, which is the shape of false positive that quietly shrinks a
 * target list.
 */
export function looksLikeBotHandle(handle: string): boolean {
  if (/^iembot/i.test(handle)) return true;
  // @_FresnoCA: underscore, city, state code. A very common alert-feed shape.
  if (/^_[A-Za-z]+[A-Z]{2}$/.test(handle)) return true;
  // The "bot" suffix needs a separator to be believable, otherwise a person
  // called Talbot reads as a machine. Three safe shapes: a camelCase capital,
  // an underscore, or a weather word glued straight to it.
  if (/Bot\d*$/.test(handle)) return true; // WeatherBot
  if (/_bot\d*$/i.test(handle)) return true; // wx_bot
  if (/(wx|weather|clima|tempo|meteo|alert|storm|rain)bot\d*$/i.test(handle)) return true;
  if (/_alerts?$/i.test(handle)) return true;
  return false;
}

/** Bios that say outright that nobody is home. */
export function looksLikeBotBio(bio: string): boolean {
  return /\b(bot|automated|auto-?generated|unofficial feed|tweets? (are )?generated|automatizado|no oficial)\b/i.test(
    bio,
  );
}

/**
 * Does this profile post the same sentence with the variables swapped?
 *
 * An automated relay repeats its shape: "Severe Thunderstorm Warning for
 * Pima County in AZ until 7:30pm MST", "Severe Thunderstorm Warning for
 * Pinal County in AZ until 7:45pm MST", entity slots swapped, sentence
 * frame fixed. Two independent signals, because a feed that varies its verb
 * ("continues" / "issues" / "expires") defeats a first-word check, while a
 * feed that varies only its opening word (a region prefix) defeats a
 * whole-sentence check.
 *
 * Thresholds are deliberately strict (85% dominance, or an identical
 * four-word head four times over) because this is the ONLY signal
 * `isAutomatedFeed` uses now. An earlier version paired a looser 70%
 * threshold with a "follows fewer than 10 accounts" cross-check, reasoning
 * that a real regional forecaster who opens every post with their region
 * name would still follow a community. Live-tested against @AlleyCenter, a
 * genuine county-warning relay bot posting the sentence above 17 times in
 * 19 visible tweets: it follows 207 accounts, so the cross-check blocked the
 * correct rejection. Follow count is not a reliable signal either direction;
 * dropped rather than re-tuned.
 */
export function looksTemplated(texts: string[]): boolean {
  const openings = texts
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
    )
    .filter((words) => words.length >= 2);
  if (openings.length < 6) return false;

  const tally = (values: string[]): number =>
    Math.max(...Object.values(values.reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {})));

  // One: the same opening word carries almost the whole feed.
  const firstWords = openings.map((w) => w[0]);
  if (tally(firstWords) / openings.length >= 0.85) return true;

  // Two: an identical four-word opening comes back four times or more.
  const heads = openings.map((w) => w.slice(0, 4).join(' '));
  return tally(heads) >= 4;
}

/**
 * The rejection gate. A machine cannot reply back, so it can never produce
 * the one event worth the most to us.
 *
 * `following` is accepted but no longer used to decide (kept in the input
 * shape so callers do not need to change). See looksTemplated's doc comment
 * for why the follow-count cross-check was removed after live testing.
 */
export function isAutomatedFeed(input: {
  handle: string;
  bio: string;
  texts: string[];
  following: number;
}): boolean {
  if (looksLikeBotHandle(input.handle)) return true;
  if (looksLikeBotBio(input.bio)) return true;
  return looksTemplated(input.texts);
}

/**
 * An account whose posts never draw a reply is a broadcast, and our reply
 * lands in an empty room. One sighting is not evidence either way, so this
 * only fires once we have seen the account at least twice and not one of
 * those posts drew a single reply.
 */
export const MIN_APPEARANCES_FOR_CONVERSATION_TEST = 2;

export function hasNoConversation(appearances: number, totalReplies: number): boolean {
  return appearances >= MIN_APPEARANCES_FOR_CONVERSATION_TEST && totalReplies === 0;
}

/**
 * Rank. Conversation over popularity, and answering people over both.
 *
 * Likes are the weakest term by design: an audience that likes and scrolls on
 * is not a room we can join. `repliesToOthers` carries the largest single
 * bonus because it is the direct proxy for "this account can reply to us".
 */
export function scoreAccount(input: {
  appearances: number;
  repliesPerPost: number;
  likesPerPost: number;
  repliesToOthers: number;
  followers: number;
  newestAgeMinutes: number;
}): number {
  return (
    input.appearances * 1.5 +
    Math.log2(1 + input.repliesPerPost) * 3 +
    (input.repliesToOthers > 0 ? 4 : 0) +
    Math.log2(1 + input.likesPerPost) * 0.5 +
    sizeWeight(input.followers) +
    (input.newestAgeMinutes < 1440 ? 2 : 1)
  );
}
