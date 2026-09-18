export type WeatherNewsStatus = 'approved' | 'review' | 'rejected';

export interface StoryForScoring {
  title: string;
  summary?: string | null;
  sourceScore: number;
  publishedAt?: string | null;
  now?: Date;
}

export interface WeatherNewsScorecard {
  total: number;
  sourceTrust: number;
  evidenceTraceability: number;
  uncertaintyCalibration: number;
  concision: number;
  communityActionability: number;
  toneBalance: number;
  alarmistSignal: number;
  denialSignal: number;
  pressReleaseSignal: number;
  relevant: boolean;
  status: WeatherNewsStatus;
  rejectionReasons: string[];
}

const WEATHER_TERMS = [
  /\bweather\b/,
  /\bclimat(?:e|ic|ology)\b/,
  /\bforecast\b/,
  /\boutlook\b/,
  /\brain(?:fall|storm|s)?\b/,
  /\bprecipitation\b/,
  /\bdroughts?\b/,
  /\bflood(?:s|ing)?\b/,
  /\bstorms?\b/,
  /\bcyclones?\b/,
  /\bhurricanes?\b/,
  /\bheat ?wave\b/,
  /\btemperature\b/,
  /\bmonsoon\b/,
  /\bmeteorolog/,
  /\bsea level\b/,
  /\bwildfires?\b/,
  /\bfrost\b/,
  /\bsnow\b/,
  /\benso\b/,
  /\bel nino\b/,
  /\bla nina\b/,
  /\bclima(?:tico)?\b/,
  /\btempo severo\b/,
  /\bchuva\b/,
  /\bseca\b/,
  /\binundac/,
  /\bprevisao\b/,
  /\bpronostico\b/,
  /\bsequia\b/,
  /\blluvia\b/,
  /\bmeteorolog/,
  /\bmeteo\b/,
  // ENSO vocabulary — El Niño/La Niña centres (e.g. CIIFEN) headline every
  // bulletin with these, and "el nino"/"la nina" above miss the standalone
  // and coastal forms used in Spanish/Portuguese titles.
  /\bnino costero\b/,
  /\bnin[oa]\b/,
  /\benso\b/,
  /\boscilacion del sur\b/,
  // Frost / cold-spell terms common in Latin-American bulletins.
  /\bheladas?\b/,
  /\bfriaje\b/,
  /\bgeada\b/,
  // Terse English hazard words the evocative headlines use (NASA/NWS/BoM
  // titles say "heat", "Typhoon", "bushfire" without the compound forms above).
  /\bheat\b/,
  /\btyphoon\b/,
  /\btornado(?:es)?\b/,
  /\bbushfire\b/,
  /\bhail\b/,
  /\bblizzard\b/,
  /\bgale(?:s|-force)?\b/,
  /\blandslide\b/,
  /\bmudslide\b/,
  // Spanish / Portuguese hazard vocabulary (WMO es/fr, ACMAD fr, CIIFEN es).
  /\bcalor\b/,
  /\bola de calor\b/,
  /\bonda de calor\b/,
  /\btormenta\b/,
  /\btempestade\b/,
  /\bhuracan\b/,
  /\bciclon\b/,
  /\bgranizo\b/,
  /\benchente\b/,
  /\balagament/,
  /\btemporal\b/,
];

const UNCERTAINTY_TERMS = [
  /\blikely\b/,
  /\bchance\b/,
  /\bprobabil/,
  /\bforecast\b/,
  /\boutlook\b/,
  /\bexpected\b/,
  /\bmay\b/,
  /\bcould\b/,
  /\buncertain/,
  /\bconfidence\b/,
  /\bmodel/,
  /\bscenario\b/,
  /\bpossib/,
  /\bprevis/,
  /\bprevist/,
  /\bperspectiv/,
  /\bpronostic/,
  /\bpuede\b/,
  /\bpode\b/,
  /\bconfianca\b/,
  /\bconfiance\b/,
  /\bpeut\b/,
];

const EVIDENCE_TERMS = [
  /\bdata\b/,
  /\banalys/,
  /\breport\b/,
  /\bobserv/,
  /\brecord/,
  /\bmodel/,
  /\bmeasurement/,
  /\bsatellite\b/,
  /\bsource\b/,
  /\bwmo\b/,
  /\bnoaa\b/,
  /\becmwf\b/,
  /\bbureau of meteorology\b/,
  /\bciifen\b/,
  /\bacmad\b/,
  /\bapec climate cent/,
  /\bdados\b/,
  /\binforme\b/,
  /\brelatorio\b/,
  /\bmedic/,
  /\bmodelo\b/,
  /\bsatelite\b/,
];

const ACTION_TERMS = [
  /\bprepare\b/,
  /\bpreparedness\b/,
  /\bearly warning\b/,
  /\bearly action\b/,
  /\badvisory\b/,
  /\bguidance\b/,
  /\bmonitor\b/,
  /\bprotect\b/,
  /\bplan\b/,
  /\bcommunity\b/,
  /\bcommunities\b/,
  /\bfarm/,
  /\bfisher/,
  /\blivelihood/,
  /\balerta\b/,
  /\bprepar/,
  /\bproteg/,
  /\bcomunidade\b/,
  /\bcomunidad\b/,
  /\bagricult/,
  /\bavis\b/,
];

// These patterns target rhetorical clickbait, not the severity of a real hazard.
const ALARMIST_PATTERNS = [
  /\byou won'?t believe\b/,
  /\bshocking truth\b/,
  /\bpanic now\b/,
  /\bend of the world\b/,
  /\bdoomsday\b/,
  /\bapocalyp/,
  /\bningu[eé]m (?:te )?conta\b/,
  /\bverdade chocante\b/,
  /\bfim do mundo\b/,
  /\bno vas a creer\b/,
  /\bfin del mundo\b/,
];

// Institutional corporate-comms markers (staff appointments, annual reports,
// product launches, partnership/MoU announcements, internal programmes).
// These routinely carry enough forecast/climate vocabulary to pass the
// relevance gate (e.g. "ECMWF launches earthkit 1.0 for weather workflows")
// while describing organisational news, not a weather event or risk signal.
const PRESS_RELEASE_PATTERNS = [
  /\bannual report\b/,
  /\bnewsletter\b/,
  /\bcall for proposals?\b/,
  /\bdeputy director\b/,
  /\bdirector-general\b/,
  /\btakes up (?:the |her |his )?role\b/,
  /\bappointed as\b/,
  /\bjoins (?:the )?(?:board|partnership|council)\b/,
  /\bcouncil (?:meeting|highlights|approves)\b/,
  /\bmemorandum of understanding\b/,
  /\bsigns? (?:a |an )?(?:mou|partnership agreement)\b/,
  /\blaunches [a-z]+ \d/, // product/version launches, e.g. "launches earthkit 1.0"
  /\bcode for earth\b/,
  /\bmachine learning project\b/,
  // Organisational self-congratulation ("world first as we...", "becomes the
  // first centre to...") announcing an internal capability/product, not a
  // weather event. Distinct from hazard-record phrasing ("wettest on record",
  // "breaks the record"), which doesn't match this shape.
  /\bworld first as\b/,
  /\bbecomes the (?:first|latest) (?:weather|climate|forecasting)\b/,
];

const DENIAL_PATTERNS = [
  /\bclimate hoax\b/,
  /\bclimate change (?:is )?(?:a )?hoax\b/,
  /\bglobal warming (?:is )?(?:a )?(?:hoax|fake|fraud)\b/,
  /\bclimate science (?:is )?(?:a )?fraud\b/,
  /\bno climate (?:change|crisis)\b/,
  /\bfarsa climatica\b/,
  /\bmudanca climatica (?:e )?(?:uma )?(?:farsa|fraude)\b/,
  /\baquecimento global (?:e )?(?:uma )?(?:farsa|fraude)\b/,
  /\bcambio climatico (?:es )?(?:una )?(?:farsa|fraude)\b/,
  /\bno existe (?:el )?cambio climatico\b/,
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isWeatherNewsRelevant(value: string): boolean {
  const text = normalize(value);
  return WEATHER_TERMS.some((pattern) => pattern.test(text));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreConcision(text: string): number {
  const length = text.length;
  if (length >= 120 && length <= 700) return 100;
  if (length >= 70 && length < 120) return 78;
  if (length > 700 && length <= 1_200) return 70;
  if (length >= 35 && length < 70) return 55;
  if (length > 1_200 && length <= 2_000) return 40;
  return 20;
}

function scoreEvidence(text: string): number {
  const namedEvidence = countMatches(text, EVIDENCE_TERMS);
  const hasNumber = /\b\d+(?:[.,]\d+)?\s?(?:%|°c|°f|mm|cm|km|m)?\b/i.test(text);
  const hasAttribution = /\b(?:according to|said|reported by|source:|segundo|de acordo com|conforme)\b/.test(text);
  return clampScore(25 + namedEvidence * 16 + (hasNumber ? 20 : 0) + (hasAttribution ? 15 : 0));
}

function scoreUncertainty(text: string): number {
  const count = countMatches(text, UNCERTAINTY_TERMS);
  return clampScore(25 + count * 22);
}

function scoreActionability(text: string): number {
  const count = countMatches(text, ACTION_TERMS);
  return clampScore(20 + count * 18);
}

function formattingAlarmism(original: string): number {
  const letters = original.match(/[a-z]/gi) ?? [];
  const uppercase = original.match(/[A-Z]/g) ?? [];
  const allCaps = letters.length > 20 && uppercase.length / letters.length > 0.72;
  const excessivePunctuation = /[!?]{3,}/.test(original);
  return Number(allCaps) + Number(excessivePunctuation);
}

function scoreTone(alarmistSignal: number, denialSignal: number): number {
  const penalty = alarmistSignal * 25 + denialSignal * 35;
  return clampScore(100 - penalty);
}

export function scoreWeatherNewsStory(input: StoryForScoring): WeatherNewsScorecard {
  const original = `${input.title}. ${input.summary ?? ''}`.trim();
  const text = normalize(original);
  const relevant = isWeatherNewsRelevant(original);
  const alarmistSignal = Math.min(
    5,
    countMatches(text, ALARMIST_PATTERNS) + formattingAlarmism(original),
  );
  const denialSignal = Math.min(5, countMatches(text, DENIAL_PATTERNS));
  const pressReleaseSignal = Math.min(5, countMatches(text, PRESS_RELEASE_PATTERNS));
  const concision = scoreConcision(original);
  const evidenceTraceability = scoreEvidence(text);
  const uncertaintyCalibration = scoreUncertainty(text);
  const communityActionability = scoreActionability(text);
  const toneBalance = scoreTone(alarmistSignal, denialSignal);
  const sourceTrust = clampScore(input.sourceScore);

  const total = clampScore(
    sourceTrust * 0.4 +
      evidenceTraceability * 0.15 +
      uncertaintyCalibration * 0.15 +
      concision * 0.15 +
      communityActionability * 0.1 +
      toneBalance * 0.05,
  );

  const now = input.now ?? new Date();
  const published = input.publishedAt ? new Date(input.publishedAt) : null;
  const stale =
    published !== null &&
    !Number.isNaN(published.getTime()) &&
    now.getTime() - published.getTime() > 62 * 24 * 60 * 60 * 1_000;

  const rejectionReasons: string[] = [];
  if (!relevant) rejectionReasons.push('not_weather_relevant');
  if (sourceTrust < 75) rejectionReasons.push('source_below_75');
  if (total < 70) rejectionReasons.push('editorial_below_70');
  if (alarmistSignal > 1) rejectionReasons.push('alarmist_rhetoric');
  if (denialSignal > 0) rejectionReasons.push('denial_or_distortion');
  if (pressReleaseSignal > 0) rejectionReasons.push('institutional_press_release');
  if (stale) rejectionReasons.push('older_than_62_days');

  const hardReject =
    !relevant ||
    denialSignal > 0 ||
    alarmistSignal > 1 ||
    pressReleaseSignal > 0 ||
    stale;
  const approved = !hardReject && sourceTrust >= 75 && total >= 70;
  const status: WeatherNewsStatus = approved
    ? 'approved'
    : hardReject
      ? 'rejected'
      : 'review';

  return {
    total,
    sourceTrust,
    evidenceTraceability,
    uncertaintyCalibration,
    concision,
    communityActionability,
    toneBalance,
    alarmistSignal,
    denialSignal,
    pressReleaseSignal,
    relevant,
    status,
    rejectionReasons,
  };
}
