// kalma/frontend/lib/growth/region-match.ts
//
// People do not tweet about the cities a catalog happens to cover. They tweet
// about "geada em lavoura de café no sul de MG", "storms across RS", "Ribeirão
// Preto". So matching only on covered city names throws away almost every real
// conversation, which is what a first pass at the reply engine proved: 22 of
// 33 good targets were dropped for "no place data" while naming a state we
// hold four towns in.
//
// This module widens the match one honest step: a state or region mention
// resolves to a place we actually record inside it. The copy then says so
// ("in Lavras, in Minas Gerais"), because a reference point 60km away is
// useful and pretending it is the same town is not.

import { normalize } from './triage.ts';

/** Alias (lowercase, accent-folded) → the region name stored on `places`. */
const REGION_ALIASES: Record<string, string> = {
  // Brazil: abbreviation and common short form for the states we cover.
  mg: 'Minas Gerais', minas: 'Minas Gerais', 'minas gerais': 'Minas Gerais',
  sp: 'São Paulo', 'sao paulo': 'São Paulo',
  rs: 'Rio Grande do Sul', 'rio grande do sul': 'Rio Grande do Sul', gaucho: 'Rio Grande do Sul',
  pr: 'Paraná', parana: 'Paraná',
  sc: 'Santa Catarina', 'santa catarina': 'Santa Catarina',
  rj: 'Rio de Janeiro', ba: 'Bahia', bahia: 'Bahia',
  go: 'Goiás', goias: 'Goiás',
  mt: 'Mato Grosso', 'mato grosso': 'Mato Grosso',
  ms: 'Mato Grosso do Sul', 'mato grosso do sul': 'Mato Grosso do Sul',
  pe: 'Pernambuco', pernambuco: 'Pernambuco',
  ce: 'Ceará', ceara: 'Ceará',
  pa: 'Pará', para: 'Pará',
  es: 'Espírito Santo', 'espirito santo': 'Espírito Santo',
  df: 'Distrito Federal',
  // United States: the abbreviations that show up in farm and weather posts.
  ks: 'Kansas', kansas: 'Kansas',
  ia: 'Iowa', iowa: 'Iowa',
  ne: 'Nebraska', nebraska: 'Nebraska',
  tx: 'Texas', texas: 'Texas',
  ca: 'California', california: 'California',
  fl: 'Florida', florida: 'Florida',
  ok: 'Oklahoma', oklahoma: 'Oklahoma',
  nd: 'North Dakota', sd: 'South Dakota',
  mn: 'Minnesota', minnesota: 'Minnesota',
  il: 'Illinois', illinois: 'Illinois',
  wa: 'Washington', or: 'Oregon', oregon: 'Oregon',
};

/**
 * Two-letter postal codes that are also ordinary words, in any language this
 * engine reads. These keep their full-name alias above and lose the
 * abbreviation, because no amount of context recovers them.
 *
 *   or  the English conjunction          es  Spanish "is"
 *   ne  French "ne", and NE the compass   go  the English verb, often shouted
 *   ok  agreement, extremely common uppercase
 *
 * `or` and `es` are here because they each already sent a live reply to the
 * wrong continent: "sooner or later" resolved a Spanish tweet about the Mar
 * Menor, in Murcia, to Salem, Oregon (2026-08-21), and "el tiempo es" resolves
 * any Spanish sentence to Espírito Santo. Oregon still matches on "oregon".
 */
const UNSAFE_ABBREVIATIONS = new Set(['or', 'es', 'ne', 'go', 'ok']);

/**
 * Region names mentioned in the text, longest alias first so "mato grosso do
 * sul" is not read as "mato grosso".
 *
 * Takes the ORIGINAL text, not a normalized copy. Capitalization is the whole
 * signal for a two-letter postal code: "MG" is Minas Gerais and "mg" is a
 * milligram, "OR" is Oregon and "or" is a conjunction. The previous version
 * received text that had already been lowercased, so it could not tell them
 * apart and matched every English tweet containing the word "or" to Oregon.
 * `looksLikePlaceList` in reply-engine.ts already had this right, twelve lines
 * from the call site: "capitalization is the whole signal, never the
 * lowercased copy used for word matching".
 *
 * KNOWN LIMIT: several codes collide across the two countries we cover (MS is
 * Mississippi and Mato Grosso do Sul, MT is Montana and Mato Grosso, PA is
 * Pennsylvania and Pará, SC is South Carolina and Santa Catarina). They
 * resolve to the Brazilian state here. The damage is bounded because the
 * caller only keeps a region it holds an actual place in, so a collision is
 * inert unless we record places in the Brazilian state. Worth a country-aware
 * pass if we ever cover both sides of one code.
 */
export function regionsInText(text: string): string[] {
  const hay = normalize(text);
  // A shouted tweet ("EXTREME HEAT OR DAMAGING WIND") makes every two-letter
  // word look like a postal code, so abbreviations are not trusted there.
  const letters = text.replace(/[^A-Za-z]/g, '');
  const shouting =
    letters.length > 20 &&
    letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6;

  const found: Array<{ region: string; length: number }> = [];
  for (const [alias, region] of Object.entries(REGION_ALIASES)) {
    if (alias.length > 2) {
      // Full names carry their own evidence: match case-insensitively.
      if (new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`).test(hay)) {
        found.push({ region, length: alias.length });
      }
      continue;
    }
    if (shouting || UNSAFE_ABBREVIATIONS.has(alias)) continue;
    // Postal codes must be shouted on purpose: "no sul de MG", "across RS".
    const upper = alias.toUpperCase();
    if (new RegExp(`(^|[^A-Za-z0-9])${upper}([^A-Za-z0-9]|$)`).test(text)) {
      found.push({ region, length: alias.length });
    }
  }
  return [...new Set(found.sort((a, b) => b.length - a.length).map((f) => f.region))];
}

/** The weather a tweet is actually about, so a frost post gets a frost answer. */
export type TweetTopic = 'frost' | 'cold' | 'heat' | 'rain' | 'dry';

const TOPIC_TERMS: Record<TweetTopic, string[]> = {
  frost: ['geada', 'helada', 'frost', 'freeze', 'freezing', 'congela', 'gel', 'gelo'],
  cold: [
    'frio', 'friagem', 'frente fria', 'cold', 'chilly', 'baixa temperatura',
    'wind chill', 'kaltluft',
  ],
  heat: [
    'calor', 'onda de calor', 'heat', 'heatwave', 'heat wave', 'ola de calor',
    'altas temperaturas', 'hitze', 'canicule',
  ],
  rain: [
    'chuva', 'chuvas', 'chuvarada', 'temporal', 'tempestade', 'granizo',
    'enchente', 'alagamento', 'lluvia', 'tormenta', 'aguacero',
    'rain', 'rainfall', 'raining', 'storm', 'thunderstorm', 'tstorm',
    'shower', 'hail', 'flood', 'flooding', 'downpour', 'precipitation',
    'precipitacion', 'precipitação', 'monsoon', 'mm de chuva',
    'pluie', 'orage', 'regen', 'niederschlag', 'pioggia',
  ],
  dry: [
    'seca', 'estiagem', 'veranico', 'sequia', 'drought', 'dry spell',
    'sem chuva', 'sécheresse', 'secheresse', 'durre', 'dürre',
  ],
};

/**
 * "Storms" is not "storm", and that difference cost this engine a whole day.
 *
 * The first version required an exact word boundary on both sides, so
 * "Severe Storms", "thunderstorms", "RAINFALL" and "precipitation" all
 * matched NOTHING. Those are the four most common words in the feeds of the
 * exact local weather accounts we set out to reply to, which is why the reply
 * engine sat silent while looking straight at usable posts.
 *
 * Now a term may carry a normal English or Latin inflection.
 */
const INFLECTION = "(s|es|y|ed|ing|ns|en)?";

/** "rainbow" is not weather. Kept explicit rather than tightening the regex. */
const TOPIC_FALSE_FRIENDS = /\brainbows?\b|\bbrainstorm/i;

function matchesTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}${INFLECTION}([^a-z0-9]|$)`).test(text);
}

/** Topics present in the text, most specific first (frost before cold). */
export function topicsInText(normalizedText: string): TweetTopic[] {
  const order: TweetTopic[] = ['frost', 'dry', 'rain', 'heat', 'cold'];
  const cleaned = normalizedText.replace(TOPIC_FALSE_FRIENDS, ' ');
  return order.filter((topic) =>
    TOPIC_TERMS[topic].some((term) => matchesTerm(cleaned, term)),
  );
}
