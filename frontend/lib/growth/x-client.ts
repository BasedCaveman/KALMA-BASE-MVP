// kalma/frontend/lib/growth/x-client.ts
//
// Minimal X (Twitter) API client for the growth pipeline. User-context OAuth
// 1.0a (works for both v1.1 media upload and v2 tweet create), signed with
// node:crypto — no SDK dependency (Golden Rule 2).
//
// Env (all four required to actually post; absent → isConfigured() false and
// every call throws a clear error the route surfaces):
//   X_API_KEY             consumer key
//   X_API_SECRET          consumer secret
//   X_ACCESS_TOKEN        user access token (the posting account)
//   X_ACCESS_TOKEN_SECRET user access token secret
//
// Scope needed on the app/token: tweet.read tweet.write users.read (+ media
// upload). Tier: Free is enough to POST (~1.5k writes/mo); no read/search here.

import crypto from 'node:crypto';

const API_V2 = 'https://api.twitter.com/2/tweets';
const UPLOAD_V1 = 'https://upload.twitter.com/1.1/media/upload.json';

interface Creds {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

function creds(): Creds | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

export function isConfigured(): boolean {
  return creds() !== null;
}

// ── OAuth 1.0a signing ───────────────────────────────────────────────────────

function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Build the OAuth Authorization header. `params` must include ALL request
 * parameters that are part of the signature base: for form-encoded bodies that
 * means the body fields too; for JSON (v2) bodies the JSON is NOT signed, so
 * pass only query params (here: none).
 */
function authHeader(
  method: string,
  url: string,
  c: Creds,
  extraParams: Record<string, string> = {},
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: c.accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauth, ...extraParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(allParams[k])}`)
    .join('&');

  const base = [
    method.toUpperCase(),
    rfc3986(url),
    rfc3986(paramString),
  ].join('&');
  const signingKey = `${rfc3986(c.apiSecret)}&${rfc3986(c.accessSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(base)
    .digest('base64');

  const headerParams: Record<string, string> = {
    ...oauth,
    oauth_signature: signature,
  };
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(headerParams[k])}"`)
      .join(', ')
  );
}

// ── media upload (v1.1, simple base64) ───────────────────────────────────────

/**
 * Fetch a card image (our /api/og PNG) and upload it to X, returning a
 * media_id string. Uses the simple `media_data` form upload (fine for images
 * under ~5MB). Returns null on any failure so the caller can post text-only.
 */
export async function uploadCard(
  cardUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const c = creds();
  if (!c) return null;
  try {
    const imgRes = await fetchImpl(cardUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) return null;
    const b64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

    const body = { media_data: b64, media_category: 'tweet_image' };
    // v1.1 form endpoint: form fields ARE part of the signature base.
    const header = authHeader('POST', UPLOAD_V1, c, body);
    const form = new URLSearchParams(body);

    const res = await fetchImpl(UPLOAD_V1, {
      method: 'POST',
      headers: {
        authorization: header,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { media_id_string?: string };
    return json.media_id_string ?? null;
  } catch {
    return null;
  }
}

// ── tweet create (v2) ────────────────────────────────────────────────────────

export interface PostResult {
  ok: boolean;
  tweetId: string | null;
  error: string | null;
}

export interface PostInput {
  text: string;
  /** Absolute URL of a card to attach as media, if any. */
  cardUrl?: string | null;
  /** When set, posts as a reply to this tweet id. */
  replyToTweetId?: string | null;
}

/**
 * Create a tweet (optionally a reply, optionally with the place card attached).
 * v2 JSON bodies are not part of the OAuth signature base, so no body params
 * are passed to authHeader.
 */
export async function postTweet(
  input: PostInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  const c = creds();
  if (!c) {
    return { ok: false, tweetId: null, error: 'x_not_configured' };
  }

  let mediaId: string | null = null;
  if (input.cardUrl) {
    mediaId = await uploadCard(input.cardUrl, fetchImpl);
    // Card is best-effort: if upload fails we still post the text.
  }

  const payload: Record<string, unknown> = { text: input.text };
  if (mediaId) payload.media = { media_ids: [mediaId] };
  if (input.replyToTweetId) {
    payload.reply = { in_reply_to_tweet_id: input.replyToTweetId };
  }

  try {
    const header = authHeader('POST', API_V2, c);
    const res = await fetchImpl(API_V2, {
      method: 'POST',
      headers: {
        authorization: header,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string };
      detail?: string;
      title?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        tweetId: null,
        error: json.detail || json.title || `x_http_${res.status}`,
      };
    }
    return { ok: true, tweetId: json.data?.id ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      tweetId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
