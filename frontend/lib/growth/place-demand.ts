// kalma/frontend/lib/growth/place-demand.ts
//
// The coverage loop: today's misses become tomorrow's answers.
//
// The reply engine's dominant rejection is `no_place_data`. People tweet about
// Alfenas, Ribeirão Preto and Pradópolis; the catalog holds capitals. Every
// one of those rejections is a place where somebody is talking about weather
// risk and we cannot say a word, which is the single biggest limit on the
// account and on the product behind it.
//
// So instead of discarding the mention, we resolve it and drop it into the
// demand funnel the app already has: `POST /api/places/candidate` records the
// interest, and the signal-engine cron promotes popular candidates into
// `places`, at which point they start getting daily signals and the reply
// engine can finally answer them.
//
// Precision matters more than volume here, because a bad candidate becomes a
// bad place. A mention only counts if it survives three filters: it came out
// of a tweet that already passed the weather-conversation gate, a geocoder
// recognised the name, and the result is a real settlement rather than a
// country, a region or a brand.

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kalma.me').replace(/\/$/, '');

export interface ResolvedPlace {
  name: string;
  region: string | null;
  country: string | null;
  country_code: string | null;
  lat: number;
  lon: number;
  population: number;
}

/**
 * Nouns that are never a settlement, in the six languages this engine reads.
 *
 * Built from the real miss corpus: of 229 strings this extractor produced in
 * its first 26 days, 203 were not places. An 11% hit rate, and each new one
 * costs a geocoder call before it is recognised as noise. These are the
 * classes that recur.
 *
 * Matched against the WHOLE mention and against its FIRST token only, never
 * against any token anywhere: "Campo Grande" and "Rio Claro" are real towns
 * whose names contain ordinary words, and this project has shipped a silently
 * over-rejecting filter three times already. Whole-string and first-token are
 * the two shapes the corpus actually shows.
 */
const NEVER_A_SETTLEMENT = new Set([
  // Weather itself, which is what a weather account tweets about.
  'heat', 'heatwave', 'heat wave', 'drought', 'flooding', 'flood', 'floods',
  'tornado', 'wildfire', 'wildfires', 'monsoon', 'haboob', 'rain', 'rains',
  'snow', 'storm', 'storms', 'quake', 'earthquake', 'hurricane', 'typhoon',
  'chuva', 'chuvas', 'lluvia', 'lluvias', 'tiempo', 'temperatura',
  'temperaturas', 'temperature', 'temperatures', 'temperature', 'tormenta',
  'tormenta severa', 'meteorologia', 'pronostico', 'mausam', 'alerta',
  'alertas', 'frontalsystem', 'ensoleillement', 'precipitations',
  'precipitacoes', 'gewitter', 'hitze', 'regen', 'niederschlag', 'canicule',
  'seca', 'geada', 'granizo', 'nieve', 'neige',
  // Farming, which is what the audience tweets about.
  'corn', 'cornbelt', 'wheat', 'soybeans', 'soybean', 'soy', 'cotton',
  'cultivos', 'cultivo', 'agro', 'agronegocios', 'agronegocio', 'safra',
  'colheita', 'plantio', 'harvest', 'crops', 'crop', 'livestock', 'cattle',
  'pasture', 'desertfarmers', 'produccionagropecuaria', 'campoargentino',
  // Newsroom and timeline furniture.
  'breaking', 'update', 'updates', 'records', 'record', 'observations',
  'observation', 'surveillance', 'capital', 'capitalnews', 'ultimasnoticias',
  'effect', 'effects', 'parts', 'umbrellas', 'time', 'today', 'tomorrow',
  'tonight', 'weekend', 'this weekend', 'season', 'summer', 'winter',
  'spring', 'autumn', 'fall', 'tage', 'sont', 'europe', 'european',
]);

/**
 * Structural shapes that are never a settlement either, checked as patterns
 * because they are open-ended in a way a word list cannot be.
 */
const NON_PLACE_SHAPES: RegExp[] = [
  // "Buckingham County", "Van Wert County", "rowancounty". 31 of the 203
  // misses, the single largest class. A county is an ADM2 region, and the
  // geocoder rejects regions anyway, so this is a pure saving.
  /\bcount(y|ies)\b|county$/i,
  /\bparish$|\bborough$|\bmunicipality$|\bdistrict$/i,
  // "Southern Ontario", "Northern Illinois", "NW India". A direction in front
  // of a region names an area, never a town.
  //
  // Only the -ern form and the compass abbreviations. The bare words are NOT
  // here on purpose: North Platte, South Bend, West Palm Beach and East
  // Lansing are real cities, and rejecting them to catch "west central"
  // would be exactly the over-rejection this file has shipped before. The
  // geocoder still turns "west central" down; it just costs a lookup.
  /^(northern|southern|eastern|western)\b/i,
  /^(central|coastal|upper|lower|greater|interior)\b/i,
  /^(nw|ne|sw|se)\b/i,
  // "juillet2026", "wx2026": a year glued to a word is a hashtag, not a town.
  /\d{4}/,
  // Twitter furniture that survived the wx filter: #KCMO, #TXwx variants,
  // #OOTT, #KLBK. Four or fewer letters with no vowel is not a place name.
  /^[bcdfghjklmnpqrstvwxyz]{3,5}$/i,
];

/**
 * Is this mention something we should not even ask the geocoder about?
 *
 * Precision is the point: a false reject costs one uncovered town, a false
 * accept costs a geocoder call and risks a junk candidate becoming a real
 * place. Verified against both halves of the live corpus, so it must kill
 * noise WITHOUT killing any of the 26 mentions that did resolve.
 */
export function looksLikeNonPlace(name: string): boolean {
  const clean = stripAccents(name.trim().toLowerCase()).replace(/\s+/g, ' ');
  if (!clean) return true;
  if (NEVER_A_SETTLEMENT.has(clean)) return true;
  const first = clean.split(' ')[0];
  if (NEVER_A_SETTLEMENT.has(first)) return true;
  return NON_PLACE_SHAPES.some((shape) => shape.test(clean));
}

/**
 * Words that follow a preposition and start with a capital without being a
 * place. Kept short on purpose: the geocoder is the real filter, this list
 * only saves pointless lookups.
 */
const NOT_A_PLACE = new Set([
  'deus', 'jesus', 'brasil', 'brazil', 'portugal', 'argentina', 'chile',
  'twitter', 'instagram', 'whatsapp', 'youtube', 'google', 'inmet', 'noaa',
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

/**
 * Capitalised names that follow a locative preposition: "em Alfenas",
 * "no Sul de Minas", "in Ribeirão Preto", "en Rosario".
 *
 * Deliberately narrow. A general capitalised-token sweep pulls in every
 * surname and headline word on X, and each false positive costs a geocoder
 * call and risks a junk candidate.
 */
export interface PlaceMention {
  name: string;
  /**
   * Hashtags carry less context than prose, so they are held to a higher
   * population bar: "#Goa" resolves to a 20,000-person town in the
   * Philippines because Goa, India is a state and states are filtered out.
   */
  fromHashtag: boolean;
}

/**
 * Three or more comma-joined capitalized words in a short span: "Boone,
 * Madison, Stanton & Others", "Smith, Jones and Lee counties". This is the
 * shape of a multi-county advisory, not a sentence naming one specific city.
 * Checked against the ORIGINAL text (capitalization is the whole signal),
 * never the lowercased/normalized copy used for word matching.
 *
 * Lives here rather than in reply-engine.ts, which had the only copy, because
 * both consumers ask the same question of the same tweet: the reply engine
 * refuses to trust a city name found inside a list, and the demand extractor
 * has to refuse for the same reason. Splitting the definition is how the two
 * would drift.
 */
export function looksLikePlaceList(text: string): boolean {
  return /\b[A-Z][a-zA-Z]+(?:,\s*[A-Z][a-zA-Z]+){2,}/.test(text);
}

export function extractPlaceMentions(text: string): PlaceMention[] {
  const found: PlaceMention[] = [];
  // "Extreme Heat Warning for Boone, Madison, Stanton & Others" yields
  // "Boone" through the `for` trigger, and Boone is a surname on a county
  // list, not the subject of the tweet. 24 of the 203 dead strings in the
  // first corpus are county names harvested this way. The hashtag path below
  // is unaffected: a hashtag is an account naming its own patch on purpose,
  // not a name parsed out of a sentence.
  const isList = looksLikePlaceList(text);
  // Locative prepositions, plus the handful of verbs weather posts actually
  // use ("o temporal que atingiu Ribeirão Preto"). Sentence-initial capitals
  // are covered: a real post starts "Em Pradópolis a estação do INMET...".
  const TRIGGER =
    '[Ee]m|[Nn]o|[Nn]a|[Dd]e|[Dd][oa]s|[Ii]n|[Aa]t|[Ee]n|[Pp]ara|[Pp]ra|[Ff]or|[Aa]cross|atingiu|atinge|atingindo|castigou|hits?|struck|azot[óo]|golpe[óo]';
  const pattern = new RegExp(
    `\\b(?:${TRIGGER})\\s+((?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇÑ][\\wÁÀÂÃÉÊÍÓÔÕÚÜÇÑáàâãéêíóôõúüçñ'’-]+)(?:\\s+(?:de|do|da|dos|das|del|la|le)?\\s*[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇÑ][\\wÁÀÂÃÉÊÍÓÔÕÚÜÇÑáàâãéêíóôõúüçñ'’-]+){0,2})`,
    'g',
  );

  for (const match of isList ? [] : text.matchAll(pattern)) {
    const raw = match[1].trim().replace(/\s+/g, ' ');
    if (raw.length < 4 || raw.length > 40) continue;
    const first = raw.split(' ')[0].toLowerCase();
    if (NOT_A_PLACE.has(stripAccents(first))) continue;
    if (looksLikeNonPlace(raw)) continue;
    found.push({ name: raw, fromHashtag: false });
  }

  // Hashtags are how weather accounts name their patch: #Bretagne, #Ontario,
  // #Goa, #Konkan. On the curated local accounts this is the single richest
  // source of "somewhere we do not cover yet", and the preposition pattern
  // above sees none of it.
  for (const match of text.matchAll(/#([A-Za-zÁÀÂÃÉÊÍÓÔÕÚÜÇÑ][\wÁÀÂÃÉÊÍÓÔÕÚÜÇÑáàâãéêíóôõúüçñ-]{3,24})/g)) {
    const tag = match[1];
    // Weather hashtags are not places: #ONwx, #agwx, #uksnow, #Goaweather.
    if (/wx$|weather|snow|storm|rain|clima|tempo|meteo|forecast|alerta|update/i.test(tag)) {
      continue;
    }
    if (NOT_A_PLACE.has(stripAccents(tag.toLowerCase()))) continue;
    if (looksLikeNonPlace(tag)) continue;
    found.push({ name: tag, fromHashtag: true });
  }

  const seen = new Set<string>();
  return found.filter((m) => {
    const key = m.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Resolve a mention to a real settlement. Returns null for anything that is
 * not clearly a populated place: countries, regions and one-house hamlets all
 * make bad entries in a catalog whose whole value is that its rows are real.
 */
export async function geocodePlace(
  name: string,
  languageHint = 'pt',
  minPopulation = 5000,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedPlace | null> {
  const params = new URLSearchParams({
    name,
    count: '10',
    language: languageHint,
    format: 'json',
  });
  try {
    const res = await fetchImpl(`${GEOCODE_URL}?${params}`, {
      headers: { 'user-agent': 'kalma-growth/1.0 (+https://kalma.me)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        country_code?: string;
        admin1?: string;
        population?: number;
        feature_code?: string;
      }>;
    };
    const results = json.results ?? [];
    const wanted = stripAccents(name).toLowerCase();

    // AMBIGUITY IS A REJECT, not a coin flip, and "how many candidates share
    // this name" has to be judged on REAL settlements, checked BEFORE the
    // population bar the caller asked for.
    //
    // Two traps, found by testing this against real tweets:
    //
    //  1. Filtering by the caller's population bar first, THEN checking for a
    //     single survivor, is backwards. "Ontario" names ten settlements
    //     (California, Oregon, Ohio, New York, Wisconsin...). A stricter bar
    //     can quietly turn a real ambiguity into a false single match by
    //     removing the other candidates from view rather than resolving which
    //     one was meant. "#Ontario" in a Canadian storm warning nearly seeded
    //     the catalog with Ontario, California this way.
    //  2. But judging ambiguity on EVERY same-named result is too strict the
    //     other way: "Winnipeg" also names a Missouri hamlet and a Florida
    //     hamlet that the geocoder carries with no population figure at all.
    //     Those are not real candidates, they are database noise, and
    //     counting them turned the actual city of Winnipeg, Manitoba
    //     (749,607 people) into a false "ambiguous, skip".
    //
    // So ambiguity is judged only among results the geocoder actually knows
    // the population of. A name with two or more real, sized settlements is
    // genuinely ambiguous and is skipped. A name with exactly one is not,
    // regardless of how many population-less namesakes exist alongside it.
    //
    // One more trap: "Río de Janeiro" (with the Spanish accent, a scatter of
    // tiny Mexican and Colombian hamlets, some with a population of 17)
    // accent-folds to the same string as Brazil's "Rio de Janeiro" and turned
    // a 6.7 MILLION person city into "ambiguous, skip". A floor of 500 people
    // is not the demand bar the caller passed (that stays separate below);
    // it exists only to decide whether a same-named result is a real
    // settlement or geocoder noise before ambiguity is judged.
    const REAL_SETTLEMENT_FLOOR = 500;
    const realSettlements = results.filter(
      (result) =>
        stripAccents(result.name).toLowerCase() === wanted &&
        // GeoNames settlement codes all begin PPL (PPL, PPLA, PPLA2, PPLC...).
        //
        // This used to test `startsWith('P')`, with a comment saying PCLI was
        // a country and therefore excluded. PCLI starts with P. The check let
        // through exactly the thing its own comment said it was keeping out,
        // and on 2026-08-29 the autopilot reported demand for "Nepal, null
        // (NP, pop 28,087,871)". A country is not a place we can record a
        // local signal for, and one promoted into `places` would produce
        // daily briefs for a point somewhere in the middle of it.
        (!result.feature_code || result.feature_code.startsWith('PPL')) &&
        typeof result.population === 'number' &&
        result.population >= REAL_SETTLEMENT_FLOOR,
    );
    if (realSettlements.length !== 1) return null;

    const result = realSettlements[0];
    if (result.population! < minPopulation) return null;

    return {
      name: result.name,
      region: result.admin1 ?? null,
      country: result.country ?? null,
      country_code: result.country_code ?? null,
      lat: result.latitude,
      lon: result.longitude,
      population: result.population ?? 0,
    };
  } catch {
    return null;
  }
}

export interface DemandResult {
  ok: boolean;
  status: number | null;
  throttled: boolean;
}

/**
 * Record demand for a place. The endpoint dedupes on an ~11km grid, skips
 * anything already covered, and rate-limits itself, so this is safe to call
 * from a loop that runs all day.
 */
export async function submitCandidate(
  place: ResolvedPlace,
  fetchImpl: typeof fetch = fetch,
): Promise<DemandResult> {
  try {
    const res = await fetchImpl(`${SITE}/api/places/candidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: place.name,
        region: place.region,
        country: place.country,
        country_code: place.country_code,
        lat: place.lat,
        lon: place.lon,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { throttled?: boolean };
    return { ok: res.ok, status: res.status, throttled: Boolean(json.throttled) };
  } catch {
    return { ok: false, status: null, throttled: false };
  }
}

/** Map a tweet's language to a geocoder language hint. */
export function geocodeLanguage(tweetLang: string | null): string {
  const lang = (tweetLang || '').slice(0, 2).toLowerCase();
  return ['pt', 'es', 'en', 'fr', 'de', 'it'].includes(lang) ? lang : 'en';
}
