// kalma/frontend/lib/growth/x-plan.ts
//
// Turns today's recorded data into the day's posting plan.
//
// Two rules shape the plan, both from how attention actually works:
//
//  - Rotate formats. A signal post asks the reader to care about a place. A
//    receipt post proves the account keeps score. An alert post routes real
//    authority. Three days of the same format and the feed stops seeing us.
//  - Rotate places and languages. The same city twice in a week reads like a
//    feed, not a voice, and it wastes the 190 other places carrying a live
//    signal today.
//
// The plan is pure: it takes data in and returns posts out, so it can be
// dry-run, inspected, and unit-checked without touching a browser.

import {
  type BriefRow,
  type AlertRow,
  langForPlace,
  rankBriefs,
  topSignal,
} from './kalma-data.ts';
import {
  alertLang,
  buildAlertPost,
  buildExplainerPost,
  buildQuestionPost,
  buildReceiptPost,
  buildSignalPost,
  checkCopy,
  loudestCheck,
  type XPost,
} from './x-copy.ts';

export interface PlanInput {
  briefs: BriefRow[];
  verified: BriefRow[];
  alerts: AlertRow[];
  /** How many posts to plan for the day. */
  count: number;
  /** Place slugs already posted recently — skipped for freshness. */
  recentPlaces: string[];
  /** Post texts already published — exact repeats are dropped. */
  recentTexts: string[];
  /**
   * Formats to leave out of this plan. The autopilot uses it to fall back to
   * receipts on days when every live forecast claim has already gone stale.
   */
  excludeFormats?: Array<XPost['format']>;
  /**
   * Formats to try FIRST. The autopilot posts once per tick, so without this
   * the day-one slot order would mean it only ever published signal posts and
   * the explainer and question formats would never run.
   */
  preferFormats?: Array<XPost['format']>;
  /** Language for the formats that are not tied to a place. */
  evergreenLang?: 'en' | 'pt' | 'es';
  /** Stable seed so a rerun on the same day picks the same evergreen item. */
  seed?: string;
}

export interface PlanResult {
  posts: XPost[];
  /** Copy that was built and then rejected, with the reason. */
  rejected: Array<{ text: string; reasons: string[] }>;
}

/**
 * Format order by slot. Half of it asks nothing at all: an account that only
 * announces things is a broadcast, and a broadcast from a small account is
 * ignored.
 */
const SLOT_ORDER: Array<XPost['format']> = [
  'signal',
  'explainer',
  'receipt',
  'question',
  'signal',
  'alert',
];

export function planPosts(input: PlanInput): PlanResult {
  const posts: XPost[] = [];
  const rejected: PlanResult['rejected'] = [];
  const usedPlaces = new Set(input.recentPlaces);
  const usedLangs = new Map<string, number>();
  const usedTypes = new Set<string>();
  const recentTexts = new Set(input.recentTexts.map(fingerprint));

  const evergreenLang = input.evergreenLang ?? 'en';
  const seed = input.seed ?? new Date().toISOString().slice(0, 10);
  const ranked = rankBriefs(input.briefs);
  const verified = [...input.verified];
  const alerts = [...input.alerts];

  const accept = (post: XPost | null): boolean => {
    if (!post) return false;
    // A signal post is about one named place and is the format most likely to
    // be forwarded to somebody who lives there, so it has to carry a quantity
    // that survives being read cold. Explainers and questions are deliberately
    // general and are exempt; receipts always carry their recorded value.
    const problems = checkCopy(post.text, {
      requireMeasurement: post.format === 'signal',
    });
    if (problems.length) {
      rejected.push({
        text: post.text,
        reasons: problems.map((p) => `${p.rule}: ${p.detail}`),
      });
      return false;
    }
    if (recentTexts.has(fingerprint(post.text))) return false;
    // Two posts in the same language back to back is fine; three is a rut.
    const langCount = usedLangs.get(post.lang) ?? 0;
    if (langCount >= Math.max(1, Math.ceil(input.count / 2))) return false;
    // Two frost posts in one day is one frost post and one echo.
    if (post.signalTypeId && usedTypes.has(post.signalTypeId)) return false;

    posts.push(post);
    recentTexts.add(fingerprint(post.text));
    usedLangs.set(post.lang, langCount + 1);
    if (post.signalTypeId) usedTypes.add(post.signalTypeId);
    if (post.placeSlug) usedPlaces.add(post.placeSlug);
    return true;
  };

  const nextSignalPost = (): XPost | null => {
    for (const brief of ranked) {
      if (usedPlaces.has(brief.place.slug)) continue;
      const signal = topSignal(brief);
      if (!signal) continue;
      const post = buildSignalPost(brief, signal, langForPlace(brief.place));
      if (post) return post;
      // Mark it used anyway: no formula for this type in this language, so
      // the same place would fail again on the next pass.
      usedPlaces.add(brief.place.slug);
    }
    return null;
  };

  const nextReceiptPost = (): XPost | null => {
    while (verified.length) {
      const brief = verified.shift()!;
      const check = loudestCheck(brief.verification?.checks ?? []);
      if (!check) continue;
      if (usedPlaces.has(brief.place.slug)) continue;
      const post = buildReceiptPost(brief, check, langForPlace(brief.place));
      if (post) return post;
    }
    return null;
  };

  const nextAlertPost = (): XPost | null => {
    while (alerts.length) {
      const alert = alerts.shift()!;
      const post = buildAlertPost(alert, alertLang(alert.source));
      if (post) return post;
    }
    return null;
  };

  const excluded = new Set(input.excludeFormats ?? []);
  const preferred = (input.preferFormats ?? []).filter((f) => !excluded.has(f));
  const order = [
    ...preferred,
    ...SLOT_ORDER.filter((f) => !excluded.has(f) && !preferred.includes(f)),
  ];
  if (!order.length) return { posts, rejected };

  for (let slot = 0; posts.length < input.count && slot < input.count * 3; slot++) {
    const want = order[slot % order.length];
    const built =
      want === 'receipt'
        ? nextReceiptPost()
        : want === 'alert'
          ? nextAlertPost()
          : want === 'explainer'
            ? buildExplainerPost(evergreenLang, `${seed}explainer`)
            : want === 'question'
              ? buildQuestionPost(evergreenLang, `${seed}question`)
              : nextSignalPost();
    if (accept(built)) continue;
    // Nothing available in the wanted format: fall back to a signal post so a
    // quiet alert day never turns into a silent account.
    if (want !== 'signal' && !excluded.has('signal')) accept(nextSignalPost());
  }

  return { posts, rejected };
}

/** Loose identity of a post, so near-identical copy counts as a repeat. */
export function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9áàâãéêíóôõúüçñ ]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
