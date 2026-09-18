// kalma/frontend/lib/growth/oracle-repertoire.ts
//
// A separate, narrow reply repertoire for the verifiable-data / oracle
// adjacency audience (Chainlink, parametric risk, on-chain data feeds).
//
// Kept entirely apart from reply-repertoire.ts and the weather-topic gate in
// reply-engine.ts on purpose: this audience does not talk about weather, it
// talks about DATA. Gating it behind isWeatherConversation/topicsInText or
// the general OFF_TOPIC crypto ban would reject every legitimate candidate,
// since "token", "chain" and "oracle" are exactly its normal vocabulary.
//
// Golden Rule 1 (blockchain is plumbing, never surface Web3 concepts) stays
// fully in force everywhere else. This file is the one place that
// vocabulary is allowed to appear, and only here: nothing built in this
// file ever feeds a weather-pool reply, a post, or a place page. Decided
// 2026-08-09: "pool separado, registro próprio."
//
// The one thing that must never happen even in this pool: talking price.
// Kalma is not a financial account and this is not an on-ramp for a token
// conversation. PRICE_TALK below is deliberately stricter about price than
// the general crypto filter (reply-engine.ts's looksLikeCrypto) is generous
// about topic: that filter exists to keep meme-coin spam OUT of the weather
// pools, not to police price talk specifically, so it is the wrong tool
// reused here.

import { normalize } from './triage.ts';
import { checkCopy, pickVariant } from './x-copy.ts';
import type { TweetCandidate } from './x-browser.ts';
import type { GrowthLang } from './types.ts';

const ORACLE_MARKERS = [
  'oracle', 'chainlink', 'cre', 'verifiable data', 'attestation', 'data feed',
  'onchain data', 'on-chain data', 'parametric', 'parametric risk',
  'parametric insurance', 'proof of reserve', 'decentralized oracle',
  'decentralised oracle', 'oráculo', 'dados verificáveis', 'dado on-chain',
  'seguro paramétrico', 'oráculo descentralizado', 'datos verificables',
  'dato on-chain', 'seguro paramétrico', 'oráculo descentralizado',
];

/**
 * Price talk is never in scope, even here, and this check runs before and
 * separately from the topic check: a tweet can be legitimately about oracle
 * design AND still slide into price talk by the second sentence, and the
 * whole tweet is disqualified either way.
 */
const PRICE_TALK =
  /\$[a-z]{2,10}\b|\$[\d,.]+\s*[kmb]\b|\b(price|prices|priced|market cap|mcap|pump|dump|ath|floor price|buy now|to the moon|wagmi|ngmi|airdrop|presale|pre-sale|tokenomics|rug pull|rugpull)\b/i;

export interface OracleReplyGate {
  ok: boolean;
  reason: string;
}

/**
 * Markers matched on WORD BOUNDARIES, not as bare substrings.
 *
 * The substring version shipped a reply to a luxury hotel promo on
 * 2026-08-22: `cre` (Chainlink Runtime Environment) is inside "in-cre-dible",
 * and "Part of the incredible Winklerhotels collection" routed a South Tyrol
 * hotel into the oracle pool, where @kalmadotme asked it whether the harder
 * problem was the data source or the dispute window. Three of the markers are
 * short enough to live inside ordinary words (`cre`, and both spellings of
 * `oracle` inside nothing common, but `cre` alone reaches incredible,
 * increase, credit, create, screen, secret, concrete), so the whole list gets
 * boundaries rather than a special case for the one that bit.
 *
 * Built once at module load: this runs against every scanned tweet.
 */
const ORACLE_MARKER_RE = new RegExp(
  `(?<![a-z0-9])(?:${ORACLE_MARKERS.map((m) =>
    normalize(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')})(?![a-z0-9])`,
);

export function looksLikeOracleConversation(text: string): boolean {
  return ORACLE_MARKER_RE.test(normalize(text));
}

/** Exported so account discovery (x-discover-oracle.ts) can screen a
 *  candidate's bio and recent posts with the exact same price line the
 *  reply gate enforces, rather than a second, potentially looser copy. */
export function looksLikePriceTalk(text: string): boolean {
  return PRICE_TALK.test(text);
}

/**
 * Is this account's own content mostly price talk? A single price-adjacent
 * word in one post is normal; a feed that is MOSTLY price talk is a trading
 * or shill account, not a design conversation, even if one post happens to
 * mention "oracle".
 */
export function isPriceHeavyAccount(bio: string, texts: string[]): boolean {
  if (looksLikePriceTalk(bio)) return true;
  if (!texts.length) return false;
  const priceCount = texts.filter((t) => looksLikePriceTalk(t)).length;
  return priceCount / texts.length > 0.4;
}

/**
 * A self-declared paid-promotion role. Caught live on the first real
 * discovery run: @VKESH_AD's bio is "KOL & AMBASSADOR, content creator,
 * (#TRONECOSTAR)", which the topic and price checks both missed, because
 * its posts used genuine oracle vocabulary in what was still promotional
 * copy for an ecosystem campaign. Bio-only and deliberately narrow: these
 * are self-descriptions people choose for themselves, not a guess about
 * intent.
 */
export function isPromotionalRole(bio: string): boolean {
  return /\b(KOL|ambassador|content creator|influencer|airdrop hunter|community manager)\b/i.test(
    bio,
  );
}

/**
 * Same discipline as the general context repertoire (fresh, has a real
 * conversation under it), plus the price gate above. Deliberately does not
 * touch topicsInText/isWeatherConversation: those answer "is this about the
 * sky", and an oracle design conversation is not.
 */
export function oracleReplyGate(candidate: TweetCandidate): OracleReplyGate {
  const text = candidate.text || '';
  if (PRICE_TALK.test(text)) return { ok: false, reason: 'oracle_price_talk' };
  if (!looksLikeOracleConversation(text)) return { ok: false, reason: 'oracle_no_topic' };
  if ((candidate.ageMinutes ?? 9999) > 360) return { ok: false, reason: 'oracle_too_old' };
  if (candidate.replies < 1) return { ok: false, reason: 'oracle_no_conversation' };
  return { ok: true, reason: 'oracle_ready' };
}

/**
 * Design questions, not claims. This account has an actual falsifiable-claim
 * oracle running (docs/FALSIFIABLE_CLAIMS_2026-08-05.md), so the honest
 * question to ask this audience is the same tradeoff that project lives
 * inside: verifiable source vs. settlement speed, threshold vs. dispute
 * window. Never a pitch, never a mention of Kalma or a link, same rule as
 * every other reply this engine sends.
 */
const FORMS: Record<'en' | 'pt' | 'es', string[]> = {
  en: [
    'Genuine question on the design side: for a weather-triggered feed, what matters more, the resolution source being verifiable, or the settlement being fast?',
    'For a parametric trigger, is the harder problem the data source or the dispute window after it fires?',
  ],
  pt: [
    'Pergunta genuína sobre o desenho: num gatilho climático, o que pesa mais, a fonte ser verificável ou o acerto ser rápido?',
    'Num gatilho paramétrico, o problema maior é a fonte do dado ou a janela de disputa depois que ele dispara?',
  ],
  es: [
    'Pregunta genuina sobre el diseño: en un gatillo climático, ¿pesa más que la fuente sea verificable o que el pago sea rápido?',
    'En un gatillo paramétrico, ¿el problema mayor es la fuente del dato o la ventana de disputa después de que dispara?',
  ],
};

function replyLang(candidate: TweetCandidate): 'en' | 'pt' | 'es' {
  const lang = (candidate.lang || '').slice(0, 2) as GrowthLang;
  return lang === 'pt' || lang === 'es' ? lang : 'en';
}

export function buildOracleReply(
  candidate: TweetCandidate,
): { text: string; lang: 'en' | 'pt' | 'es' } | null {
  const lang = replyLang(candidate);
  const text = pickVariant(FORMS[lang], candidate.id);
  if (!text.includes('?') && !text.includes('¿')) return null;
  if (checkCopy(text, { requireNumber: false }).length) return null;
  if (/kalma|https?:\/\//i.test(text)) return null;
  if (PRICE_TALK.test(text)) return null;
  return { text, lang };
}
