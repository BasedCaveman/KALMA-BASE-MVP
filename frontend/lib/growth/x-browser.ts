// kalma/frontend/lib/growth/x-browser.ts
//
// X actions performed in a real, already-signed-in Chrome (see x-cdp.ts for
// why: the X API has been pay-per-use since 2026-02-06).
//
// Everything here is deliberately conservative:
//   - one action per call, with human-scale pauses built in,
//   - every write returns a structured result instead of throwing,
//   - `dryRun` stops before the irreversible tap and reports what it WOULD do,
//   - no following, no liking, no DMs — posts and replies only.
//
// Selectors are X's stable `data-testid` hooks with fallbacks; if X ships a
// redesign, `probeSelectors()` says which hook broke instead of the bot
// silently doing nothing.

import { Cdp, Page, humanPause, sleep } from './x-cdp.ts';

export const SEL = {
  composer: '[data-testid="tweetTextarea_0"]',
  composerPlaceholder: '[data-testid="tweetTextarea_0_label"]',
  postButtonModal: '[data-testid="tweetButton"]',
  postButtonInline: '[data-testid="tweetButtonInline"]',
  fileInput: '[data-testid="fileInput"]',
  accountSwitcher: '[data-testid="SideNav_AccountSwitcher_Button"]',
  tweetArticle: 'article[data-testid="tweet"]',
  loginForm: 'input[autocomplete="username"]',
  // X suffixes these with the target user id ("1234-follow"), so they are
  // matched by prefix. The unfollow testid is only ever READ here, to detect
  // that we already follow the account; nothing in this codebase clicks it.
  followButton: '[data-testid$="-follow"]',
  unfollowButton: '[data-testid$="-unfollow"]',
} as const;

export interface ActionResult {
  ok: boolean;
  /** Present when the action really happened. */
  url: string | null;
  error: string | null;
  /** True when dryRun stopped us one step before publishing. */
  skipped: boolean;
}

export interface SessionInfo {
  loggedIn: boolean;
  handle: string | null;
}

export interface TweetCandidate {
  id: string;
  handle: string;
  url: string;
  text: string;
  lang: string | null;
  ageMinutes: number | null;
  likes: number;
  replies: number;
  reposts: number;
  isReply: boolean;
  isPromoted: boolean;
}

/** Open a tab, run `fn`, always close the tab. */
export async function withPage<T>(
  cdp: Cdp,
  url: string,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await cdp.newPage(url);
  try {
    await page.waitForLoad();
    return await fn(page);
  } finally {
    await page.close();
  }
}

// ── session ──────────────────────────────────────────────────────────────────

/**
 * Who is this browser signed in as? Reads the account switcher's aria-label,
 * which carries the handle, and falls back to the profile link.
 */
export async function whoami(cdp: Cdp): Promise<SessionInfo> {
  return withPage(cdp, 'https://x.com/home', async (page) => {
    const ready = await page.waitForSelector(
      `${SEL.accountSwitcher}, ${SEL.loginForm}`,
      20000,
    );
    if (!ready) return { loggedIn: false, handle: null };

    const handle = await page.evaluate<string | null>(`(() => {
      const btn = document.querySelector('${SEL.accountSwitcher}');
      if (btn) {
        const label = btn.getAttribute('aria-label') || btn.innerText || '';
        const m = label.match(/@([A-Za-z0-9_]{1,15})/);
        if (m) return m[1];
      }
      const prof = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      if (prof) {
        const href = prof.getAttribute('href') || '';
        const m = href.match(/^\\/([A-Za-z0-9_]{1,15})/);
        if (m) return m[1];
      }
      return null;
    })()`);

    return { loggedIn: handle !== null, handle };
  });
}

// ── writing ──────────────────────────────────────────────────────────────────

export interface PostInput {
  text: string;
  /** Absolute path of a local image to attach (e.g. the place card PNG). */
  imagePath?: string | null;
  /** When true, compose everything but never press Post. */
  dryRun: boolean;
}

/**
 * Fill the focused composer and (unless dryRun) publish. Shared by post and
 * reply — the only difference is which page the composer lives on and which
 * publish button X renders.
 */
async function fillAndSend(
  page: Page,
  input: PostInput,
  buttonSelectors: string[],
): Promise<ActionResult> {
  const hasComposer = await page.waitForSelector(SEL.composer, 20000);
  if (!hasComposer) {
    return { ok: false, url: null, error: 'composer_not_found', skipped: false };
  }

  await page.click(SEL.composer);
  await humanPause(400, 1100);
  // ONE insertText for the whole post. Do not "type it in chunks": X's editor
  // re-renders and resets the selection after each insert, so a second
  // insertText REPLACES everything already in the box. An earlier version
  // chunked this to look more human and published a post consisting only of
  // its last line.
  await page.insertText(input.text);
  await humanPause(300, 900);

  if (input.imagePath) {
    const attached = await page.setFileInput(SEL.fileInput, [input.imagePath]);
    if (attached) {
      // Wait for the upload to register before the button becomes valid.
      await sleep(3500);
    }
  }

  // Confirm the WHOLE post landed. The earlier version of this check only
  // asked for 20 characters, which happily approved a composer holding a
  // 25-character fragment of a 254-character post. Compare the full text.
  const typed = await page.evaluate<string>(
    `(document.querySelector('${SEL.composer}')?.innerText || '')`,
  );
  if (normalizeForCompare(typed) !== normalizeForCompare(input.text)) {
    return {
      ok: false,
      url: null,
      error: `composer_text_mismatch (wanted ${input.text.length} chars, box has ${typed.trim().length})`,
      skipped: false,
    };
  }

  if (input.dryRun) {
    return { ok: true, url: null, error: null, skipped: true };
  }

  await humanPause(900, 2200);

  // Started BEFORE the click: X's response can land within a couple hundred
  // milliseconds, faster than a click-then-listen could ever catch. This is
  // the actual source of truth for what got published — page.currentUrl()
  // after the click is not: X sometimes lands on the new tweet, sometimes on
  // /home, and trusting that once sent a reply to whatever tweet happened to
  // be on the home timeline at that moment rather than to the one intended.
  const createTweetResponse = page.waitForResponseJson<unknown>(
    'CreateTweet',
    15000,
  );

  let clicked = false;
  for (const sel of buttonSelectors) {
    const enabled = await page.evaluate<boolean>(
      `(() => { const b = document.querySelector(${JSON.stringify(sel)});
        return !!b && b.getAttribute('aria-disabled') !== 'true'; })()`,
    );
    if (!enabled) continue;
    clicked = await page.click(sel);
    if (clicked) break;
  }
  if (!clicked) {
    // ⌘+Enter is X's own publish shortcut and survives button renames.
    await page.click(SEL.composer);
    await page.pressKey('Enter', 'Enter', 13, 4);
  }

  // Published when the composer empties out (X clears it on success).
  const cleared = await waitForComposerCleared(page, 25000);
  if (!cleared) {
    // A full composer is not proof of failure, only of an unread UI. X's own
    // CreateTweet response is the source of truth and we have been listening
    // for it since before the click, so ask it before calling this a loss:
    // recording a published reply as failed loses the record AND invites a
    // retry that X then refuses, which is how one unread toast becomes two
    // near-identical replies. Same mistake the follow path made with
    // follow_not_confirmed.
    const strandedId = findTweetId(await createTweetResponse);
    if (strandedId) {
      return {
        ok: true,
        url: `https://x.com/i/status/${strandedId}`,
        error: null,
        skipped: false,
      };
    }
    return { ok: false, url: null, error: await refusalReason(page), skipped: false };
  }

  const tweetId = findTweetId(await createTweetResponse);
  // `/i/status/<id>` is X's handle-independent permalink form — no need to
  // know which account is posting to build a correct link. Falls back to
  // whatever page we ended up on only if the response could not be read.
  const url = tweetId ? `https://x.com/i/status/${tweetId}` : await page.currentUrl();
  return { ok: true, url, error: null, skipped: false };
}

/**
 * Walk a GraphQL response looking for a tweet result: an object carrying a
 * numeric `rest_id` alongside a `legacy.full_text`, which is the shape every
 * variant of X's tweet object carries regardless of which fields around it
 * change. Matching on structure survives API changes that a fixed JSON path
 * would break on.
 */
function findTweetId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  const legacy = obj.legacy;
  if (
    typeof obj.rest_id === 'string' &&
    /^\d+$/.test(obj.rest_id) &&
    legacy &&
    typeof legacy === 'object' &&
    'full_text' in (legacy as Record<string, unknown>)
  ) {
    return obj.rest_id;
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findTweetId(value);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Why X refused, in X's own words.
 *
 * The composer not clearing is a symptom with several causes (duplicate text,
 * a rate limit, a dead session, a draft X will not accept) and they call for
 * opposite responses: skip this draft, or stop the tick entirely. Reading the
 * toast costs one evaluate and turns a guess into a fact. Found live on
 * 2026-08-22, when a failed reply to @NWSHouston reported nothing but
 * `composer_did_not_clear` and the cause had to be reconstructed by hand from
 * the ledger.
 *
 * Classified cases are named so callers can branch on them; anything else
 * comes back with the raw text attached rather than flattened away.
 */
async function refusalReason(page: Page): Promise<string> {
  const raw = await page
    .evaluate<string>(
      `(() => {
        const nodes = [
          ...document.querySelectorAll('[data-testid="toast"], [role="alert"]'),
        ];
        return nodes.map((n) => n.innerText || '').join(' ').trim();
      })()`,
    )
    .catch(() => '');
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'composer_did_not_clear';
  if (/already said|duplicate|j\u00e1 disse/i.test(text)) return 'duplicate_content';
  if (/rate limit|over the (daily )?limit|too many|try again later/i.test(text)) {
    return 'rate_limited';
  }
  if (/log ?in|session|suspended|locked/i.test(text)) return 'session_problem';
  return `composer_did_not_clear: ${text.slice(0, 140)}`;
}

async function waitForComposerCleared(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate<string>(
      `(() => { const c = document.querySelector('${SEL.composer}');
        if (!c) return 'gone';
        return (c.innerText || '').trim() === '' ? 'empty' : 'filled'; })()`,
    );
    if (state === 'gone' || state === 'empty') return true;
    await sleep(500);
  }
  return false;
}

/**
 * Follow one account, from its profile page.
 *
 * Deliberately verbose about refusing. A follow is a public, hard-to-walk-back
 * action and `FollowBot` is one of the heads in X's inauthentic-account
 * detector, so every ambiguous state here returns a reason instead of
 * clicking something: no button found, already following, page did not
 * render. There is no unfollow counterpart on purpose. Follow/unfollow churn
 * is the exact behaviour that classifier is looking for, and nothing in this
 * codebase should ever produce it.
 */
export async function followUser(
  cdp: Cdp,
  handle: string,
  opts: { dryRun?: boolean } = {},
): Promise<ActionResult> {
  return withPage(cdp, `https://x.com/${handle}`, async (page) => {
    const ready = await page.waitForSelector(SEL.accountSwitcher, 15000);
    if (!ready) {
      return { ok: false, url: null, error: 'profile_not_rendered', skipped: false };
    }
    await sleep(1200 + Math.random() * 1500);

    const state = await page.evaluate<string>(`(() => {
      const body = document.body.innerText || '';
      if (/account doesn.t exist|não existe|no existe/i.test(body)) return 'missing';
      if (document.querySelector('${SEL.unfollowButton}')) return 'already';
      if (document.querySelector('${SEL.followButton}')) return 'followable';
      return 'no_button';
    })()`);

    if (state === 'missing') {
      return { ok: false, url: null, error: 'account_not_found', skipped: false };
    }
    if (state === 'already') {
      return { ok: false, url: null, error: 'already_following', skipped: false };
    }
    if (state !== 'followable') {
      return { ok: false, url: null, error: 'follow_button_not_found', skipped: false };
    }
    if (opts.dryRun) {
      return { ok: true, url: `https://x.com/${handle}`, error: null, skipped: true };
    }

    const clicked = await page.click(SEL.followButton).catch(() => false);
    if (!clicked) {
      return { ok: false, url: null, error: 'follow_click_failed', skipped: false };
    }
    // Confirm from the page rather than from the click returning true: the
    // button flips to unfollow once the follow is actually registered.
    for (let i = 0; i < 10; i++) {
      await sleep(600);
      const done = await page.evaluate<boolean>(
        `!!document.querySelector('${SEL.unfollowButton}')`,
      );
      if (done) {
        return { ok: true, url: `https://x.com/${handle}`, error: null, skipped: false };
      }
    }
    return { ok: false, url: null, error: 'follow_not_confirmed', skipped: false };
  });
}

/** Publish a standalone post. */
export async function postTweet(
  cdp: Cdp,
  input: PostInput,
): Promise<ActionResult> {
  return withPage(cdp, 'https://x.com/compose/post', async (page) =>
    fillAndSend(page, input, [SEL.postButtonModal, SEL.postButtonInline]),
  );
}

/** Publish a reply to an existing post URL. */
export async function replyToTweet(
  cdp: Cdp,
  tweetUrl: string,
  input: PostInput,
): Promise<ActionResult> {
  return withPage(cdp, tweetUrl, async (page) => {
    const found = await page.waitForSelector(SEL.tweetArticle, 20000);
    if (!found) {
      return { ok: false, url: null, error: 'tweet_not_found', skipped: false };
    }
    // The status page renders an inline reply box; clicking it focuses the
    // composer without opening the modal.
    await page.click(SEL.composer).catch(() => false);
    return fillAndSend(page, input, [SEL.postButtonInline, SEL.postButtonModal]);
  });
}

// ── reading ──────────────────────────────────────────────────────────────────

/**
 * Live search. Reading through the signed-in browser is what makes a reply
 * strategy possible at zero cost — the paid API bills every post read.
 */
/**
 * Thrown when X serves a blank page instead of results.
 *
 * This is not "no results". Sustained request volume gets the session
 * throttled and every page renders as the splash screen with an empty body,
 * which is indistinguishable from an empty search unless you look. Two
 * discovery runs back to back were enough to trigger it.
 */
export class RateLimited extends Error {}

/** A page that rendered nothing at all is a throttle, not an empty result. */
async function assertRendered(page: Page, what: string): Promise<void> {
  const text = await page.evaluate<string>(
    '(document.body ? document.body.innerText : "").trim().length',
  );
  if (!Number(text)) {
    throw new RateLimited(`${what}: X returned a blank page, back off`);
  }
}

/**
 * Read the timeline ACROSS the scroll, not just where it stops.
 *
 * X virtualizes: an article scrolled well past the viewport is removed from
 * the DOM entirely. Scrolling N times and then extracting once therefore
 * returns roughly one screenful, no matter how far you scrolled, and the
 * scrolling only changes WHICH screenful. This engine already paid for that
 * lesson once, in the engagement sampler, where reading at the end returned 6
 * posts and accumulating per scroll returned 19 over the same timeline.
 *
 * So extract before each scroll and once at the end, merging by tweet id.
 */
async function collectWhileScrolling(
  page: Page,
  scrolls: number,
): Promise<TweetCandidate[]> {
  const byId = new Map<string, TweetCandidate>();
  const absorb = (batch: TweetCandidate[]) => {
    // First read of a tweet wins: counts only ever grow while we scroll, and
    // the earliest read is the one closest to the other cities' read times.
    for (const t of batch) if (!byId.has(t.id)) byId.set(t.id, t);
  };

  absorb(await page.evaluate<TweetCandidate[]>(EXTRACT_TWEETS));
  for (let i = 0; i < scrolls; i++) {
    await page.evaluate('window.scrollBy(0, window.innerHeight * 0.9)');
    await humanPause(1200, 2600);
    absorb(await page.evaluate<TweetCandidate[]>(EXTRACT_TWEETS));
  }
  return [...byId.values()];
}

export async function searchLive(
  cdp: Cdp,
  query: string,
  opts: { scrolls?: number; minLikes?: number } = {},
): Promise<TweetCandidate[]> {
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
  return withPage(cdp, url, async (page) => {
    const found = await page.waitForSelector(SEL.tweetArticle, 20000);
    if (!found) {
      await assertRendered(page, 'search');
      return [];
    }
    return collectWhileScrolling(page, opts.scrolls ?? 2);
  });
}

/** Same extractor against any timeline URL (a list, a profile, home). */
export async function readTimeline(
  cdp: Cdp,
  url: string,
  scrolls = 2,
): Promise<TweetCandidate[]> {
  return withPage(cdp, url, async (page) => {
    const found = await page.waitForSelector(SEL.tweetArticle, 20000);
    if (!found) {
      await assertRendered(page, 'timeline');
      return [];
    }
    return collectWhileScrolling(page, scrolls);
  });
}

/**
 * Source language named by X's own "Translated from X" badge, mapped to a
 * GrowthLang-shaped code.
 *
 * EXTRACT_TWEETS below carries an inline copy of this exact mapping, because
 * it must ship as browser-injected JS text over CDP and cannot import a
 * module. The two must be changed together; this exported copy exists so the
 * mapping itself is unit-testable without a browser, which is how the
 * regression is pinned in scripts/test-focus-cities.mjs.
 */
export const TRANSLATION_BADGE_LANG: Record<string, string> = {
  Portuguese: 'pt', Spanish: 'es', English: 'en',
  French: 'fr', German: 'de', Italian: 'it',
};

/** Mirrors the inline extraction in EXTRACT_TWEETS, for unit testing. */
export function langFromArticleText(articleText: string): string | null {
  const m = articleText.match(/Translated from (\w+)/);
  return (m && TRANSLATION_BADGE_LANG[m[1]]) || null;
}

/**
 * DOM → TweetCandidate[]. Kept as one self-contained expression string so it
 * can be shipped over CDP with no bundling step.
 */
const EXTRACT_TWEETS = `(() => {
  const num = (el) => {
    if (!el) return 0;
    const label = el.getAttribute('aria-label') || el.innerText || '';
    const m = label.replace(/,/g, '').match(/([\\d.]+)\\s*(K|M)?/i);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (!isFinite(n)) return 0;
    const suffix = (m[2] || '').toUpperCase();
    if (suffix === 'K') n *= 1000;
    if (suffix === 'M') n *= 1000000;
    return Math.round(n);
  };
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
    const timeEl = a.querySelector('time');
    const link = timeEl ? timeEl.closest('a[href*="/status/"]') : a.querySelector('a[href*="/status/"]');
    const href = link ? link.getAttribute('href') : null;
    const m = href ? href.match(/^\\/([A-Za-z0-9_]{1,15})\\/status\\/(\\d+)/) : null;
    if (!m) continue;
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    const textEl = a.querySelector('[data-testid="tweetText"]');
    const text = textEl ? (textEl.innerText || '').trim() : '';
    // When X auto-translates a tweet for the viewer, it replaces the
    // tweetText element's content AND its lang attribute with the
    // TRANSLATION's language, not the tweet's own. A Portuguese tweet from
    // @temposleopoldo read as lang="en" this way, and the reply engine wrote
    // an English reply to a Brazilian city's Portuguese-speaking audience
    // (published live, 2026-08-30). The badge X renders for this,
    // "Translated from Portuguese", sits in the article's plain text and
    // names the real source language directly, so it is read in preference
    // to the (potentially translated) lang attribute whenever present.
    const translatedFrom = (a.innerText || '').match(/Translated from (\\w+)/);
    const LANG_NAME_TO_CODE = {
      Portuguese: 'pt', Spanish: 'es', English: 'en',
      French: 'fr', German: 'de', Italian: 'it',
    };
    const lang =
      (translatedFrom && LANG_NAME_TO_CODE[translatedFrom[1]]) ||
      (textEl ? textEl.getAttribute('lang') : null);
    let ageMinutes = null;
    if (timeEl && timeEl.getAttribute('datetime')) {
      const t = Date.parse(timeEl.getAttribute('datetime'));
      if (!isNaN(t)) ageMinutes = Math.round((Date.now() - t) / 60000);
    }
    const body = (a.innerText || '');
    out.push({
      id,
      handle: m[1],
      url: 'https://x.com/' + m[1] + '/status/' + id,
      text,
      lang,
      ageMinutes,
      likes: num(a.querySelector('[data-testid="like"], [data-testid="unlike"]')),
      replies: num(a.querySelector('[data-testid="reply"]')),
      reposts: num(a.querySelector('[data-testid="retweet"], [data-testid="unretweet"]')),
      isReply: /^Replying to|\\nReplying to/.test(body),
      isPromoted: /\\bPromoted\\b|\\bAd\\b\\n/.test(body),
    });
  }
  return out;
})()`;

// ── diagnostics ──────────────────────────────────────────────────────────────

/**
 * Do the hooks the writer depends on still resolve? Run this when the bot
 * goes quiet — a redesign shows up here as a named missing hook rather than
 * as posts that silently never happen. Checked on the compose page, where
 * the composer, the publish button and the media input all exist together.
 */
export async function probeSelectors(
  cdp: Cdp,
): Promise<Record<string, boolean>> {
  return withPage(cdp, 'https://x.com/compose/post', async (page) => {
    await page.waitForSelector(SEL.composer, 20000);
    // The toolbar (publish button, media input) mounts a beat after the
    // composer itself; probing too early reports a false break.
    await page.waitForSelector(SEL.postButtonModal, 8000);
    await sleep(500);
    const names: Array<keyof typeof SEL> = [
      'composer',
      'postButtonModal',
      'fileInput',
    ];
    const result: Record<string, boolean> = {};
    for (const name of names) {
      result[name] = await page.evaluate<boolean>(
        `!!document.querySelector(${JSON.stringify(SEL[name])})`,
      );
    }
    return result;
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
