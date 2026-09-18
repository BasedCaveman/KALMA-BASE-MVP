// kalma/frontend/lib/growth/reply-engine.ts
//
// Replies are the growth engine. Posts are what a visitor reads after they
// arrive; replies are how they arrive at all, because a reply borrows an
// audience that already exists.
//
// The rule that makes this work, and the rule that keeps it out of spam
// territory, is the same rule: NEVER reply without a fact to add.
//
//   - No link. A link in a reply from an unknown account is an ad, it gets
//     muted, and it costs reach. The conversion is the profile click.
//   - No pitch, no product name, no "check out". The reply is a neighbour
//     adding the number they happen to have.
//   - No fact, no reply. If we cannot match the tweet to a place we hold
//     recorded data for, we say nothing at all. That single gate is what
//     stops this being a bot that shouts at strangers.
//
// Reading search results costs nothing through the signed-in browser, which
// is exactly what the paid API bills for.

import {
  anomalyScore,
  isNotable,
  langForPlace,
  signalScore,
  topSignal,
  type BriefRow,
  type BriefSignal,
} from './kalma-data.ts';
import { audiencePhrase, exposedGroups } from './audience.ts';
import { checkCopy, contract, dayWord, num, placeLabel, pickVariant, unitSlot } from './x-copy.ts';
import { systemForCountry } from '../units.ts';
import { looksLikeBotHandle } from './account-quality.ts';
import { regionsInText, topicsInText, type TweetTopic } from './region-match.ts';
import { looksLikePlaceList } from './place-demand.ts';
import { isFocusCity, FOCUS_CITY_BONUS } from './focus-cities.ts';
import { buildAnchoredReply } from './anchored-reply.ts';
import { normalize } from './triage.ts';
import { weatherRelevance } from './weather-filter.ts';
import {
  buildContextReply,
  contextReplyGate,
  type ConversationDomain,
} from './reply-repertoire.ts';
import { buildOracleReply, oracleReplyGate } from './oracle-repertoire.ts';
import type { TweetCandidate } from './x-browser.ts';
import type { GrowthLang } from './types.ts';

// ── finding people worth replying to ─────────────────────────────────────────

/**
 * Search queries, tuned for precision over volume. Two lessons are baked in:
 *
 *  - Bare crop words are traps. "café" returns breakfast, so every query
 *    pairs the weather word with a working context.
 *  - `min_faves` is the reach filter. A reply under a post nobody saw is a
 *    reply nobody sees.
 */
export const REPLY_QUERIES: Array<{ q: string; lang: GrowthLang }> = [
  // Portuguese: the core audience.
  { q: 'geada lavoura -filter:replies -filter:retweets min_faves:3 lang:pt', lang: 'pt' },
  { q: '(seca OR estiagem) (lavoura OR safra OR produtor) -filter:replies -filter:retweets min_faves:5 lang:pt', lang: 'pt' },
  { q: '(chuva OR temporal) (safra OR colheita OR plantio) -filter:replies -filter:retweets min_faves:5 lang:pt', lang: 'pt' },
  { q: '(previsão OR alerta) (geada OR granizo OR temporal) -filter:replies -filter:retweets min_faves:5 lang:pt', lang: 'pt' },
  // Spanish: the rest of the LatAm belt.
  { q: '(helada OR sequía) (cultivo OR cosecha OR productor) -filter:replies -filter:retweets min_faves:5 lang:es', lang: 'es' },
  { q: '(lluvia OR tormenta) (cosecha OR siembra) -filter:replies -filter:retweets min_faves:5 lang:es', lang: 'es' },
  // English: reach, and the ag/weather community that already talks in numbers.
  { q: '(frost OR freeze) (crop OR orchard OR vineyard) -filter:replies -filter:retweets min_faves:10 lang:en', lang: 'en' },
  { q: 'drought (farmers OR harvest OR irrigation) -filter:replies -filter:retweets min_faves:15 lang:en', lang: 'en' },
  { q: '(heatwave OR "heat stress") (livestock OR crop OR harvest) -filter:replies -filter:retweets min_faves:15 lang:en', lang: 'en' },
  { q: '(rainfall OR flooding) (harvest OR planting OR fields) -filter:replies -filter:retweets min_faves:15 lang:en', lang: 'en' },

  // Operational conversations. These require an existing reply under the
  // target tweet, so the engine joins a room rather than speaking into an
  // empty broadcast thread. The context repertoire still applies its own
  // concrete-impact gate after search.
  { q: '(chuva OR temporal OR alagamento) (rota OR rodovia OR entrega OR carga) -filter:replies -filter:retweets min_replies:1 min_faves:2 lang:pt', lang: 'pt' },
  { q: '(chuva OR frio OR calor) (reserva OR pousada OR hospedagem OR cancelamento) -filter:replies -filter:retweets min_replies:1 lang:pt', lang: 'pt' },
  { q: '(chuva OR geada OR seca OR calor) (plantio OR colheita OR lavoura OR pasto) -filter:replies -filter:retweets min_replies:1 min_faves:2 lang:pt', lang: 'pt' },
  { q: '(previsão OR estação OR pluviômetro) (mediu OR registrou OR leitura) -filter:replies -filter:retweets min_replies:1 lang:pt', lang: 'pt' },
  { q: '(lluvia OR tormenta OR inundación) (ruta OR carretera OR entrega OR carga) -filter:replies -filter:retweets min_replies:1 min_faves:2 lang:es', lang: 'es' },
  { q: '(lluvia OR frío OR calor) (reserva OR alojamiento OR hotel OR cancelación) -filter:replies -filter:retweets min_replies:1 lang:es', lang: 'es' },
  { q: '(lluvia OR helada OR sequía OR calor) (siembra OR cosecha OR cultivo OR ganado) -filter:replies -filter:retweets min_replies:1 min_faves:2 lang:es', lang: 'es' },
  { q: '(rain OR flooding OR snow) (route OR freight OR delivery OR road) -filter:replies -filter:retweets min_replies:1 min_faves:5 lang:en', lang: 'en' },
  { q: '(rain OR snow OR heat) (booking OR lodge OR hotel OR cancellation) -filter:replies -filter:retweets min_replies:1 lang:en', lang: 'en' },
  { q: '(rain OR frost OR drought OR heat) (planting OR harvest OR field OR pasture) -filter:replies -filter:retweets min_replies:1 min_faves:5 lang:en', lang: 'en' },
  { q: '(forecast OR "weather station" OR "rain gauge") (measured OR recorded OR reading) -filter:replies -filter:retweets min_replies:1 lang:en', lang: 'en' },

  // Solarpunk / decentralized-infrastructure adjacency. Distinct vocabulary
  // from the agriculture domain's own agroecology/permaculture markers on
  // purpose, so this does not just duplicate that pool's PT/ES queries.
  { q: '(solarpunk OR "off-grid" OR microgrid) (resilience OR adaptation OR storm OR drought OR heat) -filter:replies -filter:retweets min_replies:1 lang:en', lang: 'en' },
  { q: '("community resilience" OR "climate adaptation") (drought OR flood OR heat OR storm) -filter:replies -filter:retweets min_replies:1 lang:en', lang: 'en' },

  // Verifiable-data / oracle adjacency (Chainlink and similar). Feeds the
  // separate oracle-repertoire.ts gate, never the general weather pipeline:
  // see reply-engine.ts's scoreCandidate for why this runs its own check
  // before the crypto ban that protects the other queries above.
  { q: '(chainlink OR "decentralized oracle" OR "onchain data") (weather OR climate OR parametric) -filter:replies -filter:retweets min_replies:1 lang:en', lang: 'en' },
  { q: '("parametric insurance" OR "parametric risk") (oracle OR "data feed" OR "verifiable data") -filter:replies -filter:retweets min_replies:1 lang:en', lang: 'en' },
];

/**
 * Named crops mean a place is farmed, full stop. `horticulture`, `fishing`
 * and `livestock` also turn up on the Wikipedia articles of huge metros, and
 * a city-name search on a metro returns sport, so those rank second.
 */
const CROP_GROUPS = new Set([
  'coffee_growers', 'coffee_farmers', 'grain_farmers', 'soy_farmers',
  'rice_farmers', 'sugarcane_growers', 'cotton_growers', 'tea_growers',
  'cocoa_growers', 'bean_farmers', 'grape_growers', 'orchards',
]);

const WORKING_GROUPS = new Set([...CROP_GROUPS, 'horticulture', 'livestock', 'fishing']);

/**
 * The place-targeted track.
 *
 * The broad queries above borrow reach, but a first pass showed the cost: of
 * 33 good targets, 17 named a town we do not record, so we had nothing to
 * say. Searching FOR the places we hold a loud signal on today inverts that.
 * Every hit is a place we can be specific about, and someone tweeting about
 * the weather over their own town is the exact person this is built for,
 * however small their account.
 */
export function queriesForBriefs(
  briefs: BriefRow[],
  limit = 12,
): Array<{ q: string; lang: GrowthLang }> {
  const WEATHER_WORDS: Record<GrowthLang, string> = {
    en: '(rain OR storm OR frost OR drought OR heat OR weather OR forecast)',
    pt: '(chuva OR temporal OR geada OR seca OR calor OR tempo OR previsão)',
    es: '(lluvia OR tormenta OR helada OR sequía OR calor OR tiempo OR pronóstico)',
    fr: '(pluie OR orage OR gel OR sécheresse OR chaleur)',
    de: '(Regen OR Sturm OR Frost OR Dürre OR Hitze)',
    zh: '(降雨 OR 暴雨 OR 霜冻 OR 干旱 OR 高温)',
  };

  // Working places only. Searching "Miami" or "Boston" returns basketball and
  // baseball; searching "Lavras" or "Winnipeg" returns people talking about
  // the sky over ground that grows something. The second list is both cleaner
  // and full of the exact person this product is for.
  const ranked = [...briefs]
    .filter((brief) => brief.groups.some((g) => WORKING_GROUPS.has(g)))
    .map((brief) => ({ brief, signal: topSignal(brief) }))
    .filter((entry) => entry.signal !== null)
    .sort((a, b) => {
      const cropA = a.brief.groups.some((g) => CROP_GROUPS.has(g)) ? 1 : 0;
      const cropB = b.brief.groups.some((g) => CROP_GROUPS.has(g)) ? 1 : 0;
      if (cropA !== cropB) return cropB - cropA;
      return anomalyScore(b.signal!) - anomalyScore(a.signal!);
    })
    .slice(0, limit);

  return ranked.map(({ brief }) => {
    const lang = langForPlace(brief.place);
    const name = brief.place.name.includes(' ')
      ? `"${brief.place.name}"`
      : brief.place.name;
    return {
      q: `${name} ${WEATHER_WORDS[lang]} -filter:replies -filter:retweets lang:${lang}`,
      lang,
    };
  });
}

/**
 * The primary reply track: accounts whose whole feed is weather or farming.
 *
 * Open search finds people MENTIONING weather ("a concert in the dry season",
 * "running in the Bogotá rain"). Replying to those with a soy forecast is
 * exactly the bot behaviour that gets an account muted. A topical account is
 * itself the corroboration: when @metsul posts, it is about the sky, and the
 * audience reading it is the audience worth being read by.
 *
 * Override with X_TARGET_ACCOUNTS (comma separated) as the list is tuned.
 */
/**
 * The seed list: used only until x-discover.ts has run at least once, or
 * whenever its output is missing or empty. Once discovery has run, the
 * script layer (scripts/growth/x-target-accounts.ts) prefers its output over
 * this. Kept here, not there, so it stays testable without touching the
 * filesystem.
 */
export const SEED_TARGET_ACCOUNTS: string[] = [
    // Found by scripts/growth/x-discover.ts on 2026-07-26, not guessed, and
    // every one re-checked in the browser. All under 20,000 followers and
    // posting the same day, because a reply under a 566K account lands around
    // position 200 while a reply under an active 3K station is read.

    // Local weather communities: stations, spotters, regional forecasters.
    'MeteoBretagne',   // 16.5K, Brittany, 6.5 replies per post
    'WxOntario1',      // 14.4K, Ontario storms
    'meteo_vina',      // 2.7K, Chile, own station, hourly readings
    'BosquesdelItata', // 1.1K, Chile, route-level rain alerts
    'GoaImd',          // 3.8K, India, daily rainfall by gauge
    'indywx',          // 5.3K, Indiana
    'larrydtv',        // 648, Texas panhandle advisories
    'weathermandan10', // 1.2K, US midwest

    // Local NWS field offices: one region each, posting every day, all small.
    'NWSGrandForks',   // 16.2K
    'NWSCheyenne',     // 19.9K
    'NWSMidland',      // 16.3K
    'NWSHastings',     // 18.5K

    // Agriculture, kept under the same ceiling.
    'agrolink',        // 11.7K, Brazil
    'ClimaAoVivo',     // 2.3K, Brazil
    'clarinrural',     // 13K, Argentina
    'bolsadecereales', // 3.7K, Argentina
    'scotconsultoria', // 16.4K, Brazil, soy and safrinha
    'usda_oce',        // 4.5K, US
];

/**
 * Resolved for a one-off script run: env override, else the seed list.
 * `scripts/growth/x-target-accounts.ts` is the one that also checks the
 * discovered-accounts file — this export exists for callers (like the
 * probes used while building this) that just want a synchronous list.
 */
export const TARGET_ACCOUNTS: string[] = (
  process.env.X_TARGET_ACCOUNTS
    ? process.env.X_TARGET_ACCOUNTS.split(',').map((h) => h.trim().replace(/^@/, '')).filter(Boolean)
    : SEED_TARGET_ACCOUNTS
);

/** Words that mean the tweet is about food and drink, not weather risk. */
const OFF_TOPIC = [
  'cafe da manha', 'cafe com leite', 'tomar cafe', 'cafezinho',
  'breakfast', 'latte', 'cappuccino', 'barista', 'desayuno',
  'carne seca', 'boca seca', 'garganta seca', 'lei seca',
  'airdrop', 'crypto', 'nft', 'token', 'giveaway', 'sorteio',
];

/**
 * Sport is why a city-name search cannot be trusted on its own. "Miami Heat",
 * "Carolina Hurricanes", "Seattle Storm", "Tampa Bay Lightning": the weather
 * word IS the team name, and a forecast reply under a basketball post is the
 * single most embarrassing thing this account could do.
 */
const SPORTS_MARKERS = [
  'nba', 'nfl', 'mlb', 'nhl', 'mls', 'ufc', 'fifa', 'uefa', 'ncaa',
  'playoff', 'playoffs', 'roster', 'draft pick', 'free agency', 'lineup',
  'game weather', 'gameday', 'first pitch', 'tip off', 'tipoff', 'halftime',
  'red sox', 'blue jays', 'marlins', 'yankees', 'dodgers', 'lakers', 'celtics',
  'heat daily', 'miami heat', 'okc thunder', 'tampa bay lightning',
  'carolina hurricanes', 'seattle storm',
  'futebol', 'campeonato', 'brasileirao', 'libertadores', 'flamengo',
  'corinthians', 'palmeiras', 'jogo do', 'partida', 'gol de', 'escalacao',
  'liga mx', 'clasico', 'seleccion', 'seleção',
];

/**
 * Word-boundary matched, and no bare team nicknames.
 *
 * The first version used a substring check with 'thunder' in the list, so
 * "SEVERE THUNDERSTORM WATCH ISSUED" was rejected as basketball. Ambiguous
 * nicknames now only count with their city attached.
 */
function looksLikeSport(normalizedText: string): boolean {
  return SPORTS_MARKERS.some((marker) =>
    new RegExp(`(^|[^a-z0-9])${marker.replace(/ /g, '\\s+')}([^a-z0-9]|$)`).test(
      normalizedText,
    ),
  );
}

/**
 * Crypto/meme-coin slang, found live: a post about "the twerking cattle dog
 * narrative" hitting a $379.8K market cap matched as weather content, because
 * 'cattle' sits in CORROBORATION (meant to validate 'heat' as real farm
 * vocabulary) and the post happens to mention a cattle dog. The reply that
 * would have gone out was a serious heat-stress message under a meme-coin
 * pump post, which is worse than any sports false positive: it does not just
 * miss, it makes the account look like it does not know what it is reading.
 *
 * Crypto slang borrows agriculture words on purpose ("yield farming",
 * "harvest rewards"), so no amount of tightening CORROBORATION closes this
 * gap by itself. A dedicated marker list, checked the same way sports is,
 * is the fix that generalizes.
 */
const CRYPTO_MARKERS = [
  'narrative', 'ct can', 'crypto twitter', 'shill', 'shilling', 'degen',
  'ape in', 'aped in', 'rug pull', 'rugpull', 'rugged', 'mcap', 'market cap',
  'presale', 'pre-sale', 'tokenomics', 'whitelist', 'diamond hands',
  'floor price', 'contract address', 'pump.fun', 'memecoin', 'meme coin',
  'to the moon', 'wagmi', 'ngmi', 'degen play',
];

/** $TICKER or a dollar-and-letters market cap figure: $sydney, $379.8K, $2.1M. */
const CRYPTO_PATTERN = /\$[a-z]{2,10}\b|\$[\d,.]+\s*[kmb]\b/i;

function looksLikeCrypto(normalizedText: string): boolean {
  if (CRYPTO_PATTERN.test(normalizedText)) return true;
  return CRYPTO_MARKERS.some((marker) =>
    new RegExp(`(^|[^a-z0-9])${marker.replace(/[ .]/g, '[ .]?')}([^a-z0-9]|$)`).test(
      normalizedText,
    ),
  );
}

/**
 * Compound phrases where a corroboration word means something else entirely.
 * "cattle dog" and "sheepdog" are breeds, not livestock; a heat-stress reply
 * under a post about someone's pet is exactly the wrong-context problem this
 * exists to avoid, crypto or not.
 */
const CORROBORATION_FALSE_FRIENDS = /\bcattle\s+dog\b|\bsheep\s*dog\b|\bherding\s+dog\b/gi;

/**
 * Units and domain words that corroborate a weather word. A topic term alone
 * is not enough: "heat" is a basketball team, "storm" is a nickname, "seca"
 * is a throat. A number with a unit, a forecasting word, or farm vocabulary
 * is what tells us a human is talking about the actual sky.
 */
const CORROBORATION = [
  'previsao', 'previsão', 'pronostico', 'forecast', 'meteorolog', 'clima',
  'inmet', 'noaa', 'nws', 'alerta', 'alert', 'warning', 'aviso', 'defesa civil',
  'lavoura', 'safra', 'colheita', 'plantio', 'produtor', 'irriga', 'pastagem',
  'crop', 'harvest', 'farm', 'orchard', 'vineyard', 'livestock', 'cattle',
  'cultivo', 'cosecha', 'siembra', 'ganado', 'riego',
  'acumulado', 'rainfall', 'precipitation', 'umidade', 'temperatura',
  // Operational-domain corroboration for the context repertoire (Phase 2,
  // reply-repertoire.ts). Without these, an English tweet using an ambiguous
  // term ("storm", "heat") from any of those domains never passes
  // isWeatherConversation at all, so it never even reaches
  // contextReplyGate: found live testing the solarpunk domain, where "storm"
  // plus "microgrid" was rejected as weather_word_without_weather. Portuguese
  // and Spanish tweets rarely hit this (chuva/geada/seca are not ambiguous),
  // which is why the gap was invisible until an English case was tried.
  'freight', 'route', 'delivery', 'shipment', 'supply chain', 'cold chain',
  'frete', 'rodovia', 'transito', 'trânsito', 'logistica', 'logística',
  'flete', 'carretera',
  'booking', 'lodge', 'lodging', 'hotel', 'reservation',
  'pousada', 'hospedagem', 'hotelaria', 'alojamiento', 'reservacion', 'reservación',
  'construction site', 'canteiro',
  'weather station', 'rain gauge', 'estacao meteorologica', 'estação meteorológica',
  'pluviometro', 'pluviômetro', 'estacion meteorologica', 'estación meteorológica',
  'pluviómetro',
  'microgrid', 'off-grid', 'off grid', 'solarpunk',
  'microrrede', 'fora da rede', 'microrred', 'fuera de la red',
];

const UNIT_PATTERN = /\d+\s*(mm|cm|["”]|inches|°|graus|degrees|km\/h|kmh|celsius)/i;

/**
 * English weather words that are also team names. These are the only ones
 * that need a second piece of evidence before we believe the tweet is about
 * the sky. "chuva", "geada" and "seca" carry no such ambiguity, and demanding
 * corroboration for them silences the Portuguese conversation this account
 * exists to be part of.
 */
const AMBIGUOUS_TERMS = [
  'heat', 'storm', 'thunder', 'lightning', 'avalanche', 'hurricane',
  'blizzard', 'cyclone', 'tornado',
];

/**
 * Is this a conversation about the actual sky? A weather topic is the floor.
 * Sports vocabulary is an instant no. An ambiguous English weather word needs
 * a unit or a domain word behind it before we treat it as weather.
 */
export function isWeatherConversation(
  normalizedText: string,
  trustedSource = false,
): boolean {
  if (looksLikeSport(normalizedText)) return false;
  if (looksLikeCrypto(normalizedText)) return false;
  const topics = topicsInText(normalizedText);
  if (!topics.length) return false;

  // A curated weather account posting a weather word is talking about weather.
  if (trustedSource) return true;

  // Everyone else has to show a number or domain vocabulary, because "the dry
  // season in Brasília" in a post about a concert is not a conversation about
  // drought, and answering it with a soy forecast is noise. Compound false
  // friends ("cattle dog") are stripped before this check runs, so a pet
  // breed can never stand in for real livestock vocabulary.
  const cleaned = normalizedText.replace(CORROBORATION_FALSE_FRIENDS, ' ');
  if (UNIT_PATTERN.test(cleaned)) return true;
  const hasAmbiguousOnly = AMBIGUOUS_TERMS.some((term) =>
    new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(cleaned),
  );
  const corroborated = CORROBORATION.some((word) =>
    new RegExp(`(^|[^a-z0-9])${normalize(word)}`).test(cleaned),
  );
  return corroborated && !(hasAmbiguousOnly && !corroborated);
}

export interface ScoredCandidate {
  candidate: TweetCandidate;
  score: number;
  /** The brief we can speak to. Null means: no fact, no reply. */
  brief: BriefRow | null;
  signal: BriefSignal | null;
  /** 'city' when the tweet named the town, 'region' when it named the state. */
  matchedBy: 'city' | 'region' | null;
  /** Verified local number, a guarded domain-specific distinction, or a
   *  design question for the separate oracle/verifiable-data pool. */
  replyMode: 'local_fact' | 'context' | 'oracle' | null;
  contextDomain: ConversationDomain | null;
  reasons: string[];
}

export interface BriefMatch {
  brief: BriefRow;
  signal: BriefSignal;
  matchedBy: 'city' | 'region';
}

/** Signal types that answer a given topic, so a frost post gets frost back. */
const TOPIC_SIGNALS: Record<TweetTopic, string[]> = {
  frost: ['frost_risk', 'consecutive_cold_below'],
  cold: ['consecutive_cold_below', 'frost_risk'],
  heat: ['heat_stress_window'],
  rain: ['rainfall_risk_rising', 'heavy_rain_event'],
  dry: ['dry_stretch_window'],
};

/**
 * Match a tweet to data we can actually speak to.
 *
 * City name first. Failing that, a state or region mention resolves to the
 * place we record inside it whose live signal answers what the tweet is
 * about: a frost post in Minas Gerais gets the frost run for Lavras, never
 * the heat run for somewhere else.
 */
export function matchBrief(text: string, briefs: BriefRow[]): BriefMatch | null {
  const hay = normalize(text);
  const topics = topicsInText(hay);

  /** The best signal on this brief that answers one of the tweet's topics. */
  const answeringSignal = (brief: BriefRow): BriefSignal | null => {
    if (!topics.length) return topSignal(brief);
    const wanted = new Set(topics.flatMap((t) => TOPIC_SIGNALS[t]));
    const matching = brief.signals.filter((s) => wanted.has(s.signal_type_id));
    if (!matching.length) return null;
    return matching.sort((a, b) => signalScore(b) - signalScore(a))[0];
  };

  // 1. The tweet names a town we record.
  let byName: BriefRow | null = null;
  let bestLen = 0;
  for (const brief of briefs) {
    const name = normalize(brief.place.name);
    if (name.length < 5) continue;
    const boundary = new RegExp(`(^|[^a-z0-9])${escapeRe(name)}([^a-z0-9]|$)`);
    if (!boundary.test(hay)) continue;
    if (name.length > bestLen) {
      byName = brief;
      bestLen = name.length;
    }
  }

  // Published live, found the hard way: @NebWxNow posted "Extreme Heat
  // Warning for Boone, Madison, Stanton & Others" — three Nebraska counties
  // in one breath — and the bare word "Madison" matched our Madison,
  // Wisconsin, roughly 500 miles from the actual warning. A county-list
  // advisory is one of the most common NWS-style tweet shapes there is, and a
  // name inside it is not evidence the tweet is about OUR city of that name.
  // When the tweet reads like a list of places and the matched city's own
  // state/region is not independently named, the match is refused rather
  // than trusted.
  if (byName && byName.place.region && looksLikePlaceList(text)) {
    const region = normalize(byName.place.region);
    const regionNamed = new RegExp(`(^|[^a-z0-9])${escapeRe(region)}([^a-z0-9]|$)`).test(hay);
    if (!regionNamed) byName = null;
  }

  if (byName) {
    const signal = answeringSignal(byName);
    if (signal) return { brief: byName, signal, matchedBy: 'city' };
  }

  // 2. The tweet names a state or region we record inside.
  // Raw text, not `hay`: a two-letter postal code is only a postal code when
  // it is capitalized, and `hay` has already lowercased that away.
  const regions = regionsInText(text);
  const candidates: BriefMatch[] = [];
  for (const region of regions) {
    const wanted = normalize(region);
    for (const brief of briefs) {
      if (!brief.place.region || normalize(brief.place.region) !== wanted) continue;
      const signal = answeringSignal(brief);
      if (signal) candidates.push({ brief, signal, matchedBy: 'region' });
    }
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => signalScore(b.signal) - signalScore(a.signal))[0];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The biggest value of a unit already quoted in the tweet, if any. */
function biggestQuoted(text: string, unit: 'mm' | 'c'): number | null {
  const pattern =
    unit === 'mm'
      ? /(\d+(?:[.,]\d+)?)\s*(?:mm|milimetros|milímetros|millimeters)/gi
      : /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*c|graus|degrees)/gi;
  let best: number | null = null;
  for (const m of text.matchAll(pattern)) {
    const value = Number(m[1].replace(',', '.'));
    if (!isFinite(value)) continue;
    best = best === null ? value : Math.max(best, value);
  }
  return best;
}

/**
 * Would our number look smaller than the one they already posted? Someone
 * quoting 200mm of rain does not need our 8mm for a town down the road.
 */
export function undercutsTheirNumbers(text: string, signal: BriefSignal): boolean {
  const sd = signal.structured_data ?? {};
  const ours = Number(
    sd.forecast_48h_mm ?? sd.wettest_forecast_mm ?? sd.recent_14d_sum_mm ?? NaN,
  );
  if (!isFinite(ours)) return false;
  const theirs = biggestQuoted(text, 'mm');
  return theirs !== null && theirs > ours * 1.5;
}

/**
 * Rank a search result. The score is deliberately dominated by two things:
 * whether we can add a fact, and how early we are to the thread.
 */
export function scoreCandidate(
  candidate: TweetCandidate,
  briefs: BriefRow[],
  ownHandle: string,
  /**
   * True when the tweet came from a curated weather/farming account. The
   * source then stands in for the textual corroboration an open search
   * result has to provide for itself.
   */
  trustedSource = false,
): ScoredCandidate {
  const reasons: string[] = [];
  const text = candidate.text || '';
  const hay = normalize(text);

  const reject = (reason: string): ScoredCandidate => {
    reasons.push(reason);
    return {
      candidate,
      score: -1,
      brief: null,
      signal: null,
      matchedBy: null,
      replyMode: null,
      contextDomain: null,
      reasons,
    };
  };

  if (candidate.handle.toLowerCase() === ownHandle.toLowerCase()) {
    return reject('own_post');
  }
  if (candidate.isReply) return reject('is_reply');
  if (candidate.isPromoted) return reject('promoted');
  // An automated relay cannot reply back, and the author replying is the
  // highest-weighted event a reply can earn. The discovered-accounts list is
  // screened for this, but the open and place-name searches are not, and
  // every robot we have actually answered (@iembot_ama, @_FresnoCA,
  // @BOM_Qld) arrived down this path rather than through discovery.
  if (looksLikeBotHandle(candidate.handle)) return reject('automated_feed');
  if (text.length < 40) return reject('too_thin');
  // Hashtag bait is a real signal on open search, but NOT on the curated
  // accounts: local weather communities tag their region and their wx tag on
  // every post (#Bretagne #Morbihan #ONwx). Applying the rule to them was
  // rejecting exactly the accounts we set out to reach.
  if (!trustedSource && (text.match(/#/g) ?? []).length >= 3) {
    return reject('hashtag_bait');
  }

  // The oracle/verifiable-data pool runs its own gate, checked before
  // OFF_TOPIC and isWeatherConversation below on purpose: both of those
  // exist to keep meme-coin spam and off-topic chatter OUT OF THE WEATHER
  // POOLS, and would reject every legitimate oracle conversation on sight,
  // since "token", "chain" and "oracle" are exactly its normal vocabulary.
  // A real candidate here must never reach a filter built for a different
  // audience. See lib/growth/oracle-repertoire.ts for why this is a
  // separate module rather than an exception threaded through the checks
  // below: Golden Rule 1 (blockchain is plumbing) still holds everywhere
  // else, and this is the one place that vocabulary is allowed to appear.
  const oracle = oracleReplyGate(candidate);
  if (oracle.ok) {
    const age = candidate.ageMinutes ?? 9999;
    const freshness = age <= 30 ? 5 : age <= 120 ? 4 : 2;
    const engagement = Math.log2(1 + candidate.likes + candidate.reposts * 2);
    const visibility = engagement <= 6 ? engagement : Math.max(0, 6 - (engagement - 6));
    const conversation = Math.min(candidate.replies, 20) / 5;
    reasons.push('oracle', `age:${age}m`, `vis:${visibility.toFixed(1)}`, `conversation:${candidate.replies}`);
    return {
      candidate,
      score: freshness * 2 + visibility + conversation + 2,
      brief: null,
      signal: null,
      matchedBy: null,
      replyMode: 'oracle',
      contextDomain: null,
      reasons,
    };
  }

  if (OFF_TOPIC.some((term) => hay.includes(term))) return reject('off_topic');
  // topicsInText is the authority on whether this is weather. The older
  // weatherRelevance list matches whole words only, so it says no to
  // "Stormy", "thunderstorms" and "RAINFALL"; it is kept as a widener, never
  // as a veto.
  if (!isWeatherConversation(hay, trustedSource) && !weatherRelevance(text).relevant) {
    return reject('not_weather');
  }
  if (!isWeatherConversation(hay, trustedSource)) {
    return reject('weather_word_without_weather');
  }

  // Calculate thread value before the two reply tracks branch. The context
  // track is stricter on freshness and existing replies; the local-fact track
  // keeps the established 24-hour window.
  const age = candidate.ageMinutes ?? 9999;
  const engagement = Math.log2(1 + candidate.likes + candidate.reposts * 2);
  const visibility = engagement <= 6 ? engagement : Math.max(0, 6 - (engagement - 6));
  const conversation = Math.min(candidate.replies, 20) / 5;

  const match = matchBrief(text, briefs);
  if (!match) {
    const context = contextReplyGate(candidate);
    if (!context.ok || !context.domain) return reject(context.reason);
    const freshness = age <= 30 ? 5 : age <= 120 ? 4 : 2;
    reasons.push(
      `context:${context.domain}`,
      `age:${age}m`,
      `vis:${visibility.toFixed(1)}`,
      `conversation:${candidate.replies}`,
    );
    return {
      candidate,
      score: freshness * 2 + visibility + conversation + 2,
      brief: null,
      signal: null,
      matchedBy: null,
      replyMode: 'context',
      contextDomain: context.domain,
      reasons,
    };
  }
  const { brief, signal, matchedBy } = match;
  if (!exposedGroups(signal.signal_type_id, brief.groups).length) {
    return reject('signal_touches_nothing_here');
  }
  // The number has to be worth saying at all. A ratio can call 8mm "eight
  // times normal"; a person reading a flood alert just sees 8mm.
  if (!isNotable(signal)) return reject('signal_not_notable');
  // Never answer someone quoting 200mm with our 8mm. Adding a smaller number
  // for a nearby town reads as not having read them.
  if (undercutsTheirNumbers(text, signal)) return reject('weaker_than_their_own_number');

  // Early beats popular: a reply 20 minutes in is read, a reply 20 hours in
  // is archaeology.
  const freshness = age <= 30 ? 5 : age <= 120 ? 4 : age <= 360 ? 2 : age <= 1440 ? 1 : 0;
  if (freshness === 0) return reject('too_old');

  // Visibility, not reach. These are different numbers and the difference is
  // the whole strategy: under a post with 5,000 likes our reply is somewhere
  // around position 200 and is read by nobody, while under a post with 20 it
  // sits in view. So the score rises with engagement up to a point and then
  // falls away again.
  // A post already being replied to is a room with a conversation in it,
  // which is worth more than a post that only collected likes.

  // Concentration, not restriction. Replying to the same local accounts
  // repeatedly is how a favorite base gets built (focus-cities.ts), so a
  // focus city outranks an equally fresh candidate elsewhere. It never
  // excludes anything: on a quiet day the scan already returns zero usable
  // candidates often enough that a hard filter would just mean silence.
  const focused = isFocusCity(brief.place.slug);
  reasons.push(
    `place:${brief.place.slug}(${matchedBy})${focused ? '*focus' : ''}`,
    `age:${age}m`,
    `vis:${visibility.toFixed(1)}`,
  );
  return {
    candidate,
    // A tweet that named the town beats one that named the state: the fact we
    // can offer is about their ground rather than near it.
    score:
      freshness * 2 +
      visibility +
      conversation +
      (matchedBy === 'city' ? 2 : 0) +
      (focused ? FOCUS_CITY_BONUS : 0),
    brief,
    signal,
    matchedBy,
    replyMode: 'local_fact',
    contextDomain: null,
    reasons,
  };
}

// ── writing the reply ────────────────────────────────────────────────────────

interface ReplyShape {
  /** The fact. Always first, always a number. */
  fact: string;
  /** One line of what the number means for someone standing there. */
  meaning: string;
}

const REPLY_FORMS: Record<string, Partial<Record<GrowthLang, ReplyShape[]>>> = {
  frost_risk: {
    en: [
      {
        fact: 'For {place} specifically, the run has {day} down at {cold}.',
        meaning: 'The local damage line is around {thr}, so that night is the one to plan {who} around.',
      },
    ],
    pt: [
      {
        fact: 'Em {place} especificamente, a rodada marca {cold} na {day}.',
        meaning: 'A linha de estrago aqui fica perto de {thr}, então é essa noite que decide {who}.',
      },
    ],
    es: [
      {
        fact: 'En {place} en concreto, la corrida marca {cold} el {day}.',
        meaning: 'La línea de daño aquí ronda los {thr}, así que esa noche es la que decide {who}.',
      },
    ],
  },
  dry_stretch_window: {
    en: [
      {
        fact: 'In {place} it is {days} straight days under {thr} from {day} on the current run.',
        meaning: 'One dry day is nothing. The length of the run is what reaches {who}.',
      },
    ],
    pt: [
      {
        fact: 'Em {place} são {days} dias seguidos abaixo de {thr} a partir de {day} na rodada atual.',
        meaning: 'Um dia seco não é nada. É o tamanho da sequência que chega em {who}.',
      },
    ],
    es: [
      {
        fact: 'En {place} son {days} días seguidos por debajo de {thr} desde el {day}.',
        meaning: 'Un día seco no es nada. Lo que llega a {who} es el largo de la racha.',
      },
    ],
  },
  rainfall_risk_rising: {
    en: [
      {
        fact: 'For {place} the current run is {mm} over 48 hours against a {median} normal for this week of the year.',
        meaning: 'It is the rate rather than the total that reaches {who}.',
      },
    ],
    pt: [
      {
        fact: 'Para {place} a rodada atual dá {mm} em 48 horas contra {median} de normal para esta semana do ano.',
        meaning: 'É a velocidade, mais que o total, que chega em {who}.',
      },
    ],
    es: [
      {
        fact: 'Para {place} la corrida actual da {mm} en 48 horas frente a {median} de normal.',
        meaning: 'Es el ritmo, más que el total, lo que llega a {who}.',
      },
    ],
  },
  heavy_rain_event: {
    en: [
      {
        fact: 'In {place} the wettest day on the run is {mm} on {day}, where a heavy day usually tops out near {p90}.',
        meaning: 'That is the day that lands on {who}.',
      },
    ],
    pt: [
      {
        fact: 'Em {place} o dia mais chuvoso da rodada é {mm} na {day}, e dia forte aqui costuma parar perto de {p90}.',
        meaning: 'É esse o dia que pesa em {who}.',
      },
    ],
    es: [
      {
        fact: 'En {place} el día más lluvioso de la corrida es {mm} el {day}, y un día fuerte aquí llega cerca de {p90}.',
        meaning: 'Ese es el día que pesa en {who}.',
      },
    ],
  },
  heat_stress_window: {
    en: [
      {
        fact: 'In {place} the next seven days average {maxc} highs against a {medianc} normal.',
        meaning: 'Heat that stays for days is the kind that reaches {who}.',
      },
    ],
    pt: [
      {
        fact: 'Em {place} os próximos sete dias dão máximas médias de {maxc} contra {medianc} de normal.',
        meaning: 'Calor que fica dias é o que chega em {who}.',
      },
    ],
    es: [
      {
        fact: 'En {place} los próximos siete días promedian máximas de {maxc} frente a {medianc} normal.',
        meaning: 'El calor que se queda días es el que llega a {who}.',
      },
    ],
  },
  consecutive_cold_below: {
    en: [
      {
        fact: 'For {place} the run has {days} days in a row below {thr} from {day}.',
        meaning: 'One cold night is weather. {days} in a row changes what is worth doing with {who}.',
      },
    ],
    pt: [
      {
        fact: 'Para {place} a rodada dá {days} dias seguidos abaixo de {thr} a partir de {day}.',
        meaning: 'Uma noite fria é tempo. {days} seguidos muda o que vale fazer com {who}.',
      },
    ],
    es: [
      {
        fact: 'Para {place} la corrida da {days} días seguidos por debajo de {thr} desde el {day}.',
        meaning: 'Una noche fría es tiempo. {days} seguidos cambian lo que vale hacer con {who}.',
      },
    ],
  },
};

/**
 * When the match came from a state rather than a town, the reply says so up
 * front. A reference point 60km away is worth having; letting someone think
 * it is their own field is how an account loses the room.
 */
const SCOPE_PREFIX: Record<GrowthLang, string> = {
  en: 'The nearest point we record in {region} is {place}.',
  pt: 'O ponto mais próximo que registramos em {region} é {place}.',
  es: 'El punto más cercano que registramos en {region} es {place}.',
  fr: '', de: '', zh: '',
};

const REPLY_SOURCE: Record<GrowthLang, string> = {
  en: '(Open-Meteo run, recorded daily.)',
  pt: '(Rodada Open-Meteo, registrada todo dia.)',
  es: '(Corrida Open-Meteo, registrada a diario.)',
  fr: '(Open-Meteo.)',
  de: '(Open-Meteo.)',
  zh: '(Open-Meteo.)',
};

function fill(template: string, slots: Record<string, string>): string {
  return contract(template.replace(/\{(\w+)\}/g, (_, key) => slots[key] ?? ''));
}

export interface ReplyDraft {
  text: string;
  tweetUrl: string;
  handle: string;
  placeSlug: string | null;
  lang: GrowthLang;
}

/**
 * Compose the reply, or return null when we cannot say something specific.
 * The language follows the tweet when we can tell, because answering a
 * Portuguese post in English is its own kind of noise.
 */
export function buildReply(scored: ScoredCandidate): ReplyDraft | null {
  const { candidate, brief, signal } = scored;
  if (scored.replyMode === 'oracle') {
    const reply = buildOracleReply(candidate);
    if (!reply) return null;
    return {
      text: reply.text,
      tweetUrl: candidate.url,
      handle: candidate.handle,
      placeSlug: null,
      lang: reply.lang,
    };
  }
  if (scored.replyMode === 'context' && scored.contextDomain) {
    // Anchored first, and with NO fallback to the generic forms.
    //
    // The generic context repertoire is what produced 19 replies from 10
    // sentences, one of them sent to six different people, and what answered
    // a prayer with a three-option questionnaire about irrigation windows.
    // Falling back to it when anchoring fails would put both of those back:
    // the posts anchoring rejects are exactly the posts that produced them,
    // because "no crop named" and "nothing specific to say" are the same
    // condition seen from two sides.
    //
    // The cost is reply volume on posts we can only answer generically. That
    // is the intended trade: silence says nothing, and a sentence six people
    // have already received says less than nothing.
    const contextLang: GrowthLang = (['en', 'pt', 'es'] as const).includes(
      (candidate.lang || '').slice(0, 2) as 'en' | 'pt' | 'es',
    )
      ? ((candidate.lang || '').slice(0, 2) as GrowthLang)
      : 'en';
    // The anchored repertoire is agriculture-specific. Other domains already
    // have reviewed, domain-specific questions in reply-repertoire.ts; keep
    // those forms instead of asking logistics or hospitality posts about a
    // crop canopy.
    if (scored.contextDomain !== 'agriculture') {
      const contextual = buildContextReply(candidate, scored.contextDomain);
      if (!contextual) return null;
      return {
        text: contextual.text,
        tweetUrl: candidate.url,
        handle: candidate.handle,
        placeSlug: null,
        lang: contextual.lang,
      };
    }
    const anchored = buildAnchoredReply(candidate.text || '', contextLang, candidate.id);
    if (!anchored) return null;
    return {
      text: anchored.text,
      tweetUrl: candidate.url,
      handle: candidate.handle,
      placeSlug: null,
      lang: contextLang,
    };
  }
  if (!brief || !signal) return null;

  const tweetLang = (candidate.lang || '').slice(0, 2) as GrowthLang;
  const lang: GrowthLang = ['en', 'pt', 'es'].includes(tweetLang)
    ? tweetLang
    : langForPlace(brief.place);

  const byLang = REPLY_FORMS[signal.signal_type_id];
  const forms = byLang?.[lang] ?? byLang?.en;
  if (!forms?.length) return null;

  const sd = signal.structured_data ?? {};
  const system = systemForCountry(brief.place.country_code, brief.place.country);
  const n = (key: string, decimals = 1): string => num(Number(sd[key]), decimals);
  const c = (key: string, decimals = 1): string => unitSlot(sd[key], '°C', system, decimals);
  const mmVal = (key: string, decimals = 1): string => unitSlot(sd[key], 'mm', system, decimals);
  const slots: Record<string, string> = {
    place: placeLabel(brief.place),
    who: audiencePhrase(signal.signal_type_id, brief.groups, lang),
    days: n('observed_run_days', 0),
    thr: sd.threshold_mm !== undefined ? mmVal('threshold_mm', 0) : c('threshold_celsius', 0),
    cold: c('coldest_forecast_celsius'),
    mm:
      sd.forecast_48h_mm !== undefined
        ? mmVal('forecast_48h_mm', 0)
        : mmVal('wettest_forecast_mm', 0),
    median: mmVal('baseline_median_mm'),
    p90: mmVal('baseline_p90_mm'),
    maxc: c('forecast_7d_max_avg_c'),
    medianc: c('baseline_median_c'),
    day: dayWord(
      String(sd.run_start_date ?? sd.coldest_forecast_date ?? sd.wettest_forecast_date ?? ''),
      lang,
    ),
  };

  const form = pickVariant(forms, `${candidate.id}${brief.place.slug}`);
  const fact = fill(form.fact, slots);
  const meaning = fill(form.meaning, slots);
  if (fact.includes('?') || meaning.includes('?')) return null;

  const scope =
    scored.matchedBy === 'region' && brief.place.region
      ? fill(SCOPE_PREFIX[lang] || SCOPE_PREFIX.en, {
          region: brief.place.region,
          place: placeLabel(brief.place),
        })
      : '';

  const text = [scope, fact, meaning, REPLY_SOURCE[lang]]
    .filter(Boolean)
    .join(' ');
  if (checkCopy(text).length) return null;
  // A reply that reads like a pitch is a reply that gets muted.
  if (/kalma|http/i.test(text)) return null;

  return {
    text,
    tweetUrl: candidate.url,
    handle: candidate.handle,
    placeSlug: brief.place.slug,
    lang,
  };
}
