// kalma/frontend/lib/growth/x-copy.ts
//
// The copy engine. Everything the account says is built here from a real
// recorded number, never from an adjective.
//
// The rules this file enforces, in the order they matter:
//
//  1. LINE ONE IS THE WHOLE GAME. On X the first line is the headline, and
//     its only job is to stop a thumb. It always carries a place and a
//     number, never the product name.
//  2. Sell the feeling, not the feature. Nobody wants a "weather signal".
//     They want to not lose the flowering to a night they could have seen
//     coming. So the second line is always the so-what for a specific person.
//  3. Specific beats vague, and here specificity is also the honesty policy:
//     the fear in "could hit -8.1°C on Tuesday" comes from the number, never
//     from an adjective. Alarmist wording is a hard fail (same gate the
//     weather-news scorer applies), so the number has to do the work.
//  4. Honesty is proof. Every receipt post carries its own caveat, and the
//     forecast posts say when a forecast can still move.
//  5. Deposits before withdrawals. Most posts ask for nothing at all. The
//     link is a separate self-reply the policy layer decides to send or not,
//     because a link in the post itself costs reach.
//  6. No em dashes, no gambling vocabulary, no Above/Below in public copy.
//
// Language: the place's own language for the PT/ES belt, English everywhere
// else. A grower in Lavras is the reader we care about first.

import { isNotable } from './kalma-data.ts';
import type { BriefRow, BriefSignal, SignalPlace, VerificationCheck } from './kalma-data.ts';
import { audiencePhrase, exposedGroups } from './audience.ts';
import { pickHook } from './hooks.ts';
import type { GrowthLang } from './types.ts';
import { systemForCountry, convertThreshold, type UnitSystem } from '../units.ts';

export type PostFormat =
  | 'signal'
  | 'receipt'
  | 'alert'
  | 'explainer'
  | 'question'
  | 'observation';

export interface XPost {
  format: PostFormat;
  text: string;
  /** Sent as a reply to our own post when the policy allows an ask. */
  linkReply: string | null;
  /** Absolute page URL the post is about (for logging and the card). */
  pageUrl: string | null;
  placeSlug: string | null;
  lang: GrowthLang;
  /** Signal type behind a signal post — used to keep a day's plan varied. */
  signalTypeId: string | null;
}

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kalma.me').replace(/\/$/, '');

const BANNED = /\b(bet|betting|bettor|gamble|gambling|odds|wager|payout|aposta|apostar|apuesta)\b/i;
const ALARMIST = /\b(urgent|urgente|catastroph|catástrof|apocalyp|devastat|terrifying|aterrador|panic|pânico|panico)\w*/i;

/** X's hard limit is 280; leave room for the trailing source label. */
const MAX_POST = 275;

// ── formatting helpers ───────────────────────────────────────────────────────

/** Trim trailing zeros so 27.0 reads as 27 and 8.15 stays 8.15. */
export function num(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '?';
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/**
 * A stored metric value, formatted and unit-suffixed for the reader's
 * measurement system, in the reader's own language ("28°C" / "82°F",
 * "8mm" / "0.31 in"). The card a post carries follows the place's country
 * the same way (`systemForCountry` in lib/units.ts); a post that says °C
 * over an imperial card is the exact kind of mismatch a reader notices.
 */
export function unitSlot(
  value: unknown,
  metricUnit: '°C' | 'mm' | 'cm',
  system: UnitSystem,
  metricDecimals = 1,
): string {
  const metric = Number(value);
  if (!isFinite(metric)) return '?';
  const { value: display, unit } = convertThreshold(metric, metricUnit, system);
  const formatted = system === 'imperial' ? String(display) : num(display, metricDecimals);
  return `${formatted}${unit}`;
}

const LOCALE: Record<GrowthLang, string> = {
  en: 'en-US', pt: 'pt-BR', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', zh: 'zh-CN',
};

const TODAY_WORD: Record<GrowthLang, [string, string]> = {
  en: ['today', 'tomorrow'],
  pt: ['hoje', 'amanhã'],
  es: ['hoy', 'mañana'],
  fr: ["aujourd'hui", 'demain'],
  de: ['heute', 'morgen'],
  zh: ['今天', '明天'],
};

/** "today" / "tomorrow" / a weekday name, in the reader's language. */
export function dayWord(iso: string | null | undefined, lang: GrowthLang, now = new Date()): string {
  if (!iso) return '';
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (isNaN(date.getTime())) return '';
  const startOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((startOf(date) - startOf(now)) / 86400000);
  if (days === 0) return TODAY_WORD[lang][0];
  if (days === 1) return TODAY_WORD[lang][1];
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** Short date for receipts: "24 Jul". */
function shortDate(iso: string, lang: GrowthLang): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** "Lavras" / "Lavras, Minas Gerais" when the region disambiguates. */
export function placeLabel(place: SignalPlace, withRegion = false): string {
  if (withRegion && place.region) return `${place.name}, ${place.region}`;
  return place.name;
}

/** Stable per place+day+format variant pick, so copy varies but reruns don't. */
export function pickVariant<T>(options: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[hash % options.length];
}

// ── the quality gate ─────────────────────────────────────────────────────────

export interface CopyProblem {
  rule: string;
  detail: string;
}

/**
 * A number carrying a unit somebody can act on. Days count: "11 dry days in a
 * row" is as actionable as a rainfall total, and is the whole claim for the
 * run-length signals.
 */
export function hasMeasurement(text: string): boolean {
  return MEASUREMENT.test(text);
}

const MEASUREMENT = new RegExp(
  [
    // A physical quantity next to its unit: 48mm, 1.9 in, 37.4°C, 75 km/h.
    String.raw`\d+(?:[.,]\d+)?\s*(?:mm|cm|in\b|inch|inches|°|graus|degrees|km\/h|kmh|mph)`,
    // A duration, which in this account's copy usually carries an adjective
    // between the number and the unit: "11 dry days in a row", "5 días
    // seguidos". Allowing up to two words is what makes those count.
    String.raw`\d+\s*(?:\S+\s+){0,2}(?:days?|dias?|días?|hours?|horas?)\b`,
  ].join('|'),
  'i',
);

/**
 * Everything the account is not allowed to say, checked mechanically. The
 * digit rule is the interesting one: a post with no number in it is a vague
 * post, and vague is the failure mode this whole engine exists to avoid.
 */
export function checkCopy(
  text: string,
  options: { requireNumber?: boolean; requireMeasurement?: boolean } = {},
): CopyProblem[] {
  const problems: CopyProblem[] = [];
  if (text.length > 280) {
    problems.push({ rule: 'length', detail: `${text.length} chars` });
  }
  if (BANNED.test(text)) {
    problems.push({ rule: 'gambling_language', detail: text.match(BANNED)![0] });
  }
  if (ALARMIST.test(text)) {
    problems.push({ rule: 'alarmist', detail: text.match(ALARMIST)![0] });
  }
  if (/[—–]/.test(text)) {
    problems.push({ rule: 'em_dash', detail: 'use commas or periods' });
  }
  if ((options.requireNumber ?? true) && !/\d/.test(text)) {
    problems.push({ rule: 'not_specific', detail: 'no number in the copy' });
  }
  // A digit is not the same as a measurement. "34 times the normal rain for
  // this week in Melbourne" cleared the digit rule and went out with no
  // millimetre figure anywhere in it: startling, and useless to the neighbour
  // it would be forwarded to. Place-specific posts have to carry a quantity
  // somebody can act on, not only a multiple.
  if (options.requireMeasurement && !MEASUREMENT.test(text)) {
    problems.push({
      rule: 'no_measurement',
      detail: 'a multiple or bare digit, with no measured quantity',
    });
  }
  if (/\b(above|below|acima|abaixo)\s+(the\s+)?(threshold|line)\b/i.test(text)) {
    problems.push({ rule: 'legacy_above_below', detail: 'internal wording leaked' });
  }
  return problems;
}

// ── signal posts (F1) ────────────────────────────────────────────────────────

type Slots = Record<string, string>;

interface Formula {
  /** Line 1: the headline. */
  hook: string;
  /** Line 2: the so-what for a person, not a dataset. */
  stake: string;
}

function fill(template: string, slots: Slots): string {
  return contract(template.replace(/\{(\w+)\}/g, (_, key) => slots[key] ?? ''));
}

/**
 * Portuguese and Spanish contract prepositions with articles, and a slot that
 * drops "a soja" after "em" produces "em a soja", which is the exact tell of a
 * machine writing in a language it does not speak.
 */
export function contract(text: string): string {
  return text
    .replace(/\bem a\b/g, 'na')
    .replace(/\bem o\b/g, 'no')
    .replace(/\bem as\b/g, 'nas')
    .replace(/\bem os\b/g, 'nos')
    .replace(/\bde a\b/g, 'da')
    .replace(/\bde o\b/g, 'do')
    .replace(/\bde as\b/g, 'das')
    .replace(/\bde os\b/g, 'dos')
    .replace(/\ba el\b/g, 'al')
    .replace(/\bde el\b/g, 'del');
}

/**
 * Headline formulas per signal type. Multiple variants each, because an
 * account that posts the same sentence with a different city every day reads
 * as a machine and stops earning follows.
 */
const SIGNAL_FORMULAS: Record<string, Partial<Record<GrowthLang, Formula[]>>> = {
  frost_risk: {
    en: [
      {
        hook: '{place} could drop to {cold} on {day}.',
        stake: 'Damage starts near {thr}, and the exposed part is {who}. The work that saves it happens the evening before, not the morning after.',
      },
      {
        hook: '{day} night in {place} is forecast at {cold}.',
        stake: 'That is the night you either cover {who} or you do not. Covering costs an evening. The other way costs the season.',
      },
    ],
    pt: [
      {
        hook: '{place} pode chegar a {cold} na {day}.',
        stake: 'O estrago começa perto de {thr}, e a parte exposta é {who}. O que salva se faz na véspera, não na manhã seguinte.',
      },
      {
        hook: 'A noite de {day} em {place} está prevista em {cold}.',
        stake: 'É a noite em que você cobre {who} ou não cobre. Cobrir custa uma noite. O contrário custa a safra.',
      },
    ],
    es: [
      {
        hook: '{place} puede bajar a {cold} el {day}.',
        stake: 'El daño empieza cerca de {thr}, y la parte expuesta es {who}. Lo que lo salva se hace la noche anterior.',
      },
      {
        hook: 'La noche del {day} en {place} está prevista en {cold}.',
        stake: 'Es la noche en la que cubres {who} o no lo haces. Cubrir cuesta una noche. Lo otro cuesta la temporada.',
      },
    ],
  },

  dry_stretch_window: {
    en: [
      {
        hook: '{days} dry days in a row start {day} in {place}.',
        stake: 'A dry day here means {thr} or less. One is nothing. {days} in a row is a decision about {who} you make this week, not next.',
      },
      {
        hook: '{place} has {days} straight days under {thr} of rain ahead of it, from {day}.',
        stake: 'The length of the run is the story, not any single day. By the time you can see it in {who}, the cheap fix is already gone.',
      },
    ],
    pt: [
      {
        hook: '{days} dias seguidos de seca começam {day} em {place}.',
        stake: 'Dia seco aqui é {thr} ou menos. Um não é nada. {days} seguidos é uma decisão sobre {who} que se toma esta semana, não na outra.',
      },
      {
        hook: '{place} tem {days} dias seguidos abaixo de {thr} pela frente, a partir de {day}.',
        stake: 'O que importa é o tamanho da sequência, não um dia isolado. Quando dá pra ver em {who}, o conserto barato já passou.',
      },
    ],
    es: [
      {
        hook: '{days} días seguidos de sequía empiezan el {day} en {place}.',
        stake: 'Un día seco aquí es {thr} o menos. Uno no es nada. {days} seguidos es una decisión sobre el agua que se toma esta semana.',
      },
    ],
  },

  rainfall_risk_rising: {
    en: [
      {
        hook: '{mm} over 48 hours for {place}. The normal for this week of the year is {median}.',
        stake: 'That gap is the part worth planning around, and it reaches {who} first. Drainage and timing are decided before it starts, not during.',
      },
      {
        hook: '{place} is looking at {mm} over two days against a {median} normal.',
        stake: 'Rain is not the problem. Rain arriving faster than the ground takes it is. That difference lands on {who}.',
      },
    ],
    pt: [
      {
        hook: '{mm} em 48 horas em {place}. O normal para esta semana do ano é {median}.',
        stake: 'É essa diferença que dá pra planejar, e ela chega primeiro em {who}. Drenagem e hora do corte se decidem antes, não no meio.',
      },
      {
        hook: '{place} deve receber {mm} em dois dias, contra {median} de normal.',
        stake: 'Chuva não é o problema. Chuva chegando mais rápido do que o solo aceita é. Essa diferença cai em {who}.',
      },
    ],
    es: [
      {
        hook: '{mm} en 48 horas en {place}. Lo normal para esta semana del año es {median}.',
        stake: 'Esa diferencia es lo que se puede planificar. Drenaje, momento de corte y todo lo que esté secándose afuera.',
      },
    ],
  },

  heavy_rain_event: {
    en: [
      {
        hook: 'A single day at {mm} is on the table for {place} on {day}.',
        stake: 'A heavy day here usually tops out near {p90}. Worth knowing which of your ground drains, and where {who} sits when it does not.',
      },
      {
        hook: '{place} has a {mm} day in the forecast for {day}.',
        stake: 'The ground does not care about the weekly total, it cares about how much lands at once. {p90} is the usual heavy day here.',
      },
    ],
    pt: [
      {
        hook: '{mm} num único dia estão no radar para {place} na {day}.',
        stake: 'Dia forte aqui costuma parar perto de {p90}. Vale saber qual parte do terreno escoa e onde {who} fica quando não escoa.',
      },
      {
        hook: '{place} tem um dia de {mm} previsto para {day}.',
        stake: 'O solo não liga para o total da semana, liga para quanto cai de uma vez. O dia forte normal aqui é {p90}.',
      },
    ],
    es: [
      {
        hook: '{mm} en un solo día están previstos para {place} el {day}.',
        stake: 'Un día fuerte aquí llega cerca de {p90}. Conviene saber qué parte del terreno drena y cuál retiene.',
      },
    ],
  },

  heat_stress_window: {
    en: [
      {
        hook: '{place} is set for a week averaging {maxc} highs. The normal for now is {medianc}.',
        stake: 'Heat that sits for days is a different animal from a hot afternoon, and it lands on {who}. Water and shade get decided early or not at all.',
      },
      {
        hook: 'Seven days of {maxc} highs ahead in {place}, against a {medianc} normal.',
        stake: 'The heat that hurts is the heat that will not let the night cool down. What it lands on is {who}.',
      },
    ],
    pt: [
      {
        hook: '{place} entra numa semana com máximas médias de {maxc}. O normal para agora é {medianc}.',
        stake: 'Calor que fica dias é outro bicho, e é em {who} que ele pega. Água e sombra se resolvem antes ou não se resolvem.',
      },
      {
        hook: 'Sete dias de máximas em {maxc} em {place}, contra {medianc} de normal.',
        stake: 'O calor que machuca é o que não deixa a noite esfriar. É em {who} que ele cai.',
      },
    ],
    es: [
      {
        hook: '{place} entra en una semana con máximas medias de {maxc}. Lo normal ahora es {medianc}.',
        stake: 'El calor que se queda días no es una tarde calurosa. Agua del ganado, horario de aplicación y quien trabaja al mediodía lo sienten primero.',
      },
    ],
  },

  consecutive_cold_below: {
    en: [
      {
        hook: '{days} days in a row below {thr} start {day} in {place}.',
        stake: 'Cold that stays is what slows down {who}, and it changes what is worth doing this week. One cold night is weather. {days} is a plan.',
      },
    ],
    pt: [
      {
        hook: '{days} dias seguidos abaixo de {thr} começam {day} em {place}.',
        stake: 'Frio que fica é o que trava {who} e muda o que vale a pena fazer na semana. Uma noite fria é tempo. {days} dias é planejamento.',
      },
    ],
    es: [
      {
        hook: '{days} días seguidos por debajo de {thr} empiezan el {day} en {place}.',
        stake: 'El frío que se queda frena el crecimiento y cambia lo que vale la pena hacer esta semana.',
      },
    ],
  },

  water_recovery_signal: {
    en: [
      {
        hook: '{place} has taken {mm} over the last 14 days. The usual for this stretch is {median}.',
        stake: 'Good news is worth recording too. This is the window where the ground actually holds what it gets.',
      },
    ],
    pt: [
      {
        hook: '{place} recebeu {mm} em 14 dias. O normal para este período é {median}.',
        stake: 'Notícia boa também merece registro. É nesta janela que o solo realmente segura o que recebe.',
      },
    ],
    es: [
      {
        hook: '{place} recibió {mm} en 14 días. Lo normal para este periodo es {median}.',
        stake: 'Lo bueno también se registra. Es la ventana en la que el suelo de verdad retiene lo que recibe.',
      },
    ],
  },
};

const SOURCE_LABEL: Record<GrowthLang, string> = {
  en: 'Open-Meteo forecast, recorded daily.',
  pt: 'Previsão Open-Meteo, registrada todo dia.',
  es: 'Pronóstico Open-Meteo, registrado a diario.',
  fr: 'Prévision Open-Meteo, enregistrée chaque jour.',
  de: 'Open-Meteo Vorhersage, täglich aufgezeichnet.',
  zh: 'Open-Meteo 预报，每日记录。',
};

const LINK_LEAD: Record<GrowthLang, string> = {
  en: 'The full read for {place}, with what neighbours are reporting:',
  pt: 'A leitura completa de {place}, com o que os vizinhos estão relatando:',
  es: 'La lectura completa de {place}, con lo que reportan los vecinos:',
  fr: 'La lecture complète pour {place} :',
  de: 'Die vollständige Lage für {place}:',
  zh: '{place} 的完整解读：',
};

/** Pull the numbers a formula needs out of a signal's structured_data. */
function slotsFor(
  signal: BriefSignal,
  place: SignalPlace,
  groups: string[],
  lang: GrowthLang,
): Slots {
  const sd = signal.structured_data ?? {};
  const system = systemForCountry(place.country_code, place.country);
  const n = (key: string, decimals = 1): string => num(Number(sd[key]), decimals);
  const c = (key: string, decimals = 1): string => unitSlot(sd[key], '°C', system, decimals);
  const mmVal = (key: string, decimals = 1): string => unitSlot(sd[key], 'mm', system, decimals);
  return {
    place: placeLabel(place),
    who: audiencePhrase(signal.signal_type_id, groups, lang),
    days: n('observed_run_days', 0),
    thr:
      sd.threshold_mm !== undefined
        ? mmVal('threshold_mm', 0)
        : c('threshold_celsius', 0),
    cold: c('coldest_forecast_celsius'),
    mm:
      sd.forecast_48h_mm !== undefined
        ? mmVal('forecast_48h_mm', 0)
        : sd.wettest_forecast_mm !== undefined
          ? mmVal('wettest_forecast_mm', 0)
          : mmVal('recent_14d_sum_mm'),
    median:
      sd.baseline_median_mm !== undefined
        ? mmVal('baseline_median_mm')
        : c('baseline_median_c'),
    p90: mmVal('baseline_p90_mm'),
    maxc: c('forecast_7d_max_avg_c'),
    medianc: c('baseline_median_c'),
    day: dayWord(
      String(
        sd.run_start_date ??
          sd.coldest_forecast_date ??
          sd.wettest_forecast_date ??
          '',
      ),
      lang,
    ),
  };
}

/**
 * Build the day's signal post for one place.
 *
 * Returns null when the post would not be worth a stranger's attention: no
 * formula for the type, a missing number, or, most importantly, a place where
 * this weather touches nothing we can evidence. A cold night at a ski resort
 * is not news, and posting it anyway is how an account stops being believed.
 */
export function buildSignalPost(
  brief: BriefRow,
  signal: BriefSignal,
  lang: GrowthLang,
): XPost | null {
  const byLang = SIGNAL_FORMULAS[signal.signal_type_id];
  const formulas = byLang?.[lang] ?? byLang?.en;
  if (!formulas?.length) return null;
  if (!exposedGroups(signal.signal_type_id, brief.groups).length) return null;
  if (!isNotable(signal)) return null;

  const slots = slotsFor(signal, brief.place, brief.groups, lang);
  const formula = pickVariant(formulas, `${brief.place.slug}${brief.brief_date}signal`);
  const stake = fill(formula.stake, slots);

  // The formula's own hook is the floor, not the ceiling. lib/growth/hooks.ts
  // offers a stronger opening when one is genuinely available (a phrase the
  // place owns, an anomaly big enough to state as a multiple, a belief worth
  // correcting) and returns null otherwise, which keeps this exactly as it
  // was. See that file for why none of those families is allowed to raise
  // the volume of the claim itself.
  const sd = signal.structured_data ?? {};
  const upgraded = pickHook({
    signalTypeId: signal.signal_type_id,
    severity: signal.severity,
    placeSlug: brief.place.slug,
    placeLabel: placeLabel(brief.place),
    lang,
    forecast: Number(
      sd.forecast_48h_mm ?? sd.wettest_forecast_mm ?? sd.recent_14d_sum_mm,
    ),
    // Already unit-converted for this place by slotsFor, so the hook cannot
    // disagree with the card or with the rest of the post.
    forecastLabel: slots.mm,
    baseline: Number(sd.baseline_median_mm),
    windowStart: signal.valid_from,
    windowEnd: signal.valid_until,
    events: brief.events,
  });
  const formulaHook = fill(formula.hook, slots);
  let hook = upgraded ? upgraded.text : formulaHook;

  // A hook that replaces the formula's own line can leave the whole post
  // without a single measured quantity, because several stake lines carry no
  // number either (heat_stress_window and rainfall_risk_rising are the two
  // that bite). The result is a post nobody can act on and therefore nobody
  // forwards, and forwarding, share via copy link, is the highest-weighted
  // action in X's ranker.
  //
  // Fall back to the formula's own hook rather than dropping the post: the
  // formula always states its numbers, so this keeps the supply of signal
  // posts intact instead of silently deleting a whole signal type, which is
  // what a plain rejection here would have done.
  if (upgraded && !hasMeasurement(`${hook} ${stake}`) && hasMeasurement(formulaHook)) {
    hook = formulaHook;
  }

  // An unfilled slot leaves a "?" from num(): that is a vague post, not a post.
  if (hook.includes('?') || stake.includes('?')) return null;

  const text = `${hook}\n\n${stake}\n\n${SOURCE_LABEL[lang]}`;
  if (text.length > MAX_POST) {
    const short = `${hook}\n\n${stake}`;
    if (short.length > MAX_POST) return null;
    return finish('signal', short, brief.place, lang, signal.signal_type_id);
  }
  return finish('signal', text, brief.place, lang, signal.signal_type_id);
}

// ── receipts (F2) ────────────────────────────────────────────────────────────

interface ReceiptCopy {
  hit: string;
  miss: string;
  caveat: string;
}

/**
 * Two receipts, and the miss is the more valuable one. Anybody can publish
 * the days they were right. Publishing the days the sky went the other way is
 * the only reason a stranger should believe the days we were right.
 */
const RECEIPT: Record<GrowthLang, ReceiptCopy> = {
  en: {
    hit: 'On {date} we recorded {subject} for {place}. The sky followed: {actual}{unit} that day, against a {baseline}{unit} baseline.',
    miss: 'On {date} we recorded {subject} for {place}. The sky did not follow: {actual}{unit} that day, against a {baseline}{unit} baseline.',
    caveat: 'A directional check on one day. We publish the misses too, or the record would not be worth reading.',
  },
  pt: {
    hit: 'No dia {date} registramos {subject} em {place}. O céu confirmou: {actual}{unit} naquele dia, contra uma base de {baseline}{unit}.',
    miss: 'No dia {date} registramos {subject} em {place}. O céu não seguiu: {actual}{unit} naquele dia, contra uma base de {baseline}{unit}.',
    caveat: 'Checagem direcional de um dia. Publicamos também os erros, senão o registro não valeria nada.',
  },
  es: {
    hit: 'El {date} registramos {subject} en {place}. El cielo lo confirmó: {actual}{unit} ese día, frente a una base de {baseline}{unit}.',
    miss: 'El {date} registramos {subject} en {place}. El cielo no lo siguió: {actual}{unit} ese día, frente a una base de {baseline}{unit}.',
    caveat: 'Chequeo direccional de un día. También publicamos los fallos, si no el registro no valdría nada.',
  },
  fr: { hit: '', miss: '', caveat: '' },
  de: { hit: '', miss: '', caveat: '' },
  zh: { hit: '', miss: '', caveat: '' },
};

/** Signals that expect the recorded day to come in ABOVE its baseline. */
const EXPECTS_ABOVE = new Set([
  'rainfall_risk_rising',
  'heavy_rain_event',
  'heat_stress_window',
  'water_recovery_signal',
]);

/** Did the recorded day move the way the signal implied? */
export function checkLanded(check: VerificationCheck): boolean {
  const above = check.actual > check.baseline;
  return EXPECTS_ABOVE.has(check.signal_type_id) ? above : !above;
}

/**
 * What the signal was about, in the reader's language. The stored check title
 * is English only, and an English clause dropped into a Portuguese post is
 * the fastest way to look like a translation bot.
 */
const RECEIPT_SUBJECT: Record<string, Partial<Record<GrowthLang, string>>> = {
  frost_risk: { en: 'a frost risk', pt: 'risco de geada', es: 'riesgo de helada' },
  consecutive_cold_below: { en: 'a cold run', pt: 'uma sequência de frio', es: 'una racha de frío' },
  heat_stress_window: { en: 'heat above the usual range', pt: 'calor acima do normal', es: 'calor por encima de lo normal' },
  heavy_rain_event: { en: 'a heavy rain day', pt: 'um dia de chuva forte', es: 'un día de lluvia fuerte' },
  rainfall_risk_rising: { en: 'rainfall trending above normal', pt: 'chuva acima do normal', es: 'lluvia por encima de lo normal' },
  dry_stretch_window: { en: 'a dry stretch', pt: 'uma sequência seca', es: 'una racha seca' },
  water_recovery_signal: { en: 'water conditions improving', pt: 'recuperação de água', es: 'recuperación de agua' },
};

function receiptSubject(signalTypeId: string, lang: GrowthLang): string | null {
  const entry = RECEIPT_SUBJECT[signalTypeId];
  return entry?.[lang] ?? entry?.en ?? null;
}

/**
 * The receipt post. This is the account's strongest asset because it is the
 * one thing nobody else in the feed does: publish the record afterwards,
 * including the days the read was wrong. Honesty is the proof.
 */
export function buildReceiptPost(
  brief: BriefRow,
  check: VerificationCheck,
  lang: GrowthLang,
): XPost | null {
  const tmpl = RECEIPT[lang]?.hit ? RECEIPT[lang] : RECEIPT.en;
  const subject = receiptSubject(check.signal_type_id, lang);
  if (!subject) return null;
  const shape = checkLanded(check) ? tmpl.hit : tmpl.miss;
  // Same rule as the card this post carries: units follow the PLACE's
  // country (lib/units.ts), never the stored metric unit as-is. A post that
  // says 28.3°C over a °F card is the mismatch a reader notices first.
  const system = systemForCountry(brief.place.country_code, brief.place.country);
  const metricUnit = check.unit === 'mm' ? 'mm' : '°C';
  const actual = convertThreshold(check.actual, metricUnit, system);
  const baseline = convertThreshold(check.baseline, metricUnit, system);
  const fmt = (value: number) => (system === 'imperial' ? String(value) : num(value));
  const text = `${fill(shape, {
    date: shortDate(brief.brief_date, lang),
    subject,
    place: placeLabel(brief.place),
    actual: fmt(actual.value),
    baseline: fmt(baseline.value),
    unit: actual.unit,
  })}\n\n${tmpl.caveat}`;
  if (text.length > MAX_POST) return null;
  return finish('receipt', text, brief.place, lang);
}

/**
 * The check worth publishing: the one where the recorded day and the baseline
 * are furthest apart. A day that came in at 27.6°C against a 26.3°C baseline
 * is true and boring; a day that came in at 9.8mm against 0 is the record
 * doing its job.
 */
export function loudestCheck(checks: VerificationCheck[]): VerificationCheck | null {
  /** A gap only counts once it is big enough to matter on the ground. */
  const FLOOR: Record<string, number> = { mm: 8, '°C': 3, cm: 3, 'km/h': 20 };
  const scored = checks
    .filter((c) => isFinite(c.actual) && isFinite(c.baseline))
    .map((c) => {
      const spread = Math.abs(c.actual - c.baseline);
      const floor = FLOOR[c.unit] ?? 1;
      return { check: c, spread, passes: spread >= floor };
    })
    .filter((c) => c.passes)
    .sort((a, b) => b.spread - a.spread);
  return scored.length ? scored[0].check : null;
}

// ── official alerts (F3) ─────────────────────────────────────────────────────

const ALERT_COPY: Record<GrowthLang, { hook: string; stake: string }> = {
  en: {
    hook: '{source} has a {event} warning in force, valid until {until}.',
    stake: 'It names the areas it covers, so a warning either includes your ground or it does not. That distinction is the whole point of an official alert.',
  },
  pt: {
    hook: '{source} tem um aviso de {event} em vigor, válido até {until}.',
    stake: 'O aviso nomeia as áreas que cobre, então ou inclui o seu terreno ou não inclui. Essa diferença é o motivo de um alerta oficial existir.',
  },
  es: {
    hook: '{source} tiene un aviso de {event} en vigor, válido hasta {until}.',
    stake: 'El aviso nombra las áreas que cubre, así que o incluye tu terreno o no. Esa diferencia es el sentido de una alerta oficial.',
  },
  fr: { hook: '', stake: '' },
  de: { hook: '', stake: '' },
  zh: { hook: '', stake: '' },
};

/** The language an official source publishes in, so the relay matches it. */
const SOURCE_LANG: Record<string, GrowthLang> = { inmet: 'pt' };

const SOURCE_TAG: Record<GrowthLang, string> = {
  en: 'Source: {source}, official.',
  pt: 'Fonte: {source}, oficial.',
  es: 'Fuente: {source}, oficial.',
  fr: 'Source : {source}, officiel.',
  de: 'Quelle: {source}, offiziell.',
  zh: '来源：{source}，官方。',
};

/** The language to relay a given alert in. */
export function alertLang(source: string): GrowthLang {
  return SOURCE_LANG[source.toLowerCase()] ?? 'en';
}

export function buildAlertPost(
  alert: { source: string; event: string; expires: string | null },
  lang: GrowthLang,
): XPost | null {
  const tmpl = ALERT_COPY[lang]?.hook ? ALERT_COPY[lang] : ALERT_COPY.en;
  const until = alert.expires
    ? new Intl.DateTimeFormat(LOCALE[lang], {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }).format(new Date(alert.expires)) + ' UTC'
    : '';
  if (!until) return null;
  const text = `${fill(tmpl.hook, {
    source: alert.source.toUpperCase(),
    event: alert.event,
    until,
  })}\n\n${tmpl.stake}\n\n${fill(SOURCE_TAG[lang] ?? SOURCE_TAG.en, {
    source: alert.source.toUpperCase(),
  })}`;
  if (text.length > MAX_POST) return null;
  return {
    format: 'alert',
    text,
    linkReply: null,
    pageUrl: null,
    placeSlug: null,
    lang,
    signalTypeId: null,
  };
}

// ── shared tail ──────────────────────────────────────────────────────────────

function finish(
  format: PostFormat,
  text: string,
  place: SignalPlace,
  lang: GrowthLang,
  signalTypeId: string | null = null,
): XPost {
  const pageUrl = `${SITE}/places/${place.slug}`;
  return {
    format,
    text,
    linkReply: `${fill(LINK_LEAD[lang], { place: placeLabel(place) })}\n${pageUrl}`,
    pageUrl,
    placeSlug: place.slug,
    lang,
    signalTypeId,
  };
}

// ── explainers and questions (no product in them at all) ─────────────────────
//
// A feed that only announces things is a broadcast, and a broadcast from a
// small account is ignored. These two formats exist to make the account worth
// following on its own: one gives away something genuinely useful about
// reading weather, the other asks a question only someone who works outside
// can answer.
//
// Neither mentions Kalma, carries a link, or attaches a card. They are pure
// deposits. The account earns the right to the occasional ask by making most
// of what it posts free of one.

interface Evergreen {
  en: string;
  pt: string;
  es: string;
}

/**
 * Weather literacy, given away. Each one answers a question people actually
 * get wrong, and each carries a real number because a rule without a number
 * is a platitude. Number four is the lesson this project learned the hard way
 * on its first day of posting.
 */
const EXPLAINERS: Evergreen[] = [
  {
    en: 'A 30% chance of rain and 100mm of rain are not a contradiction.\n\nChance answers whether any rain falls. Accumulation answers how much. Ground floods on the second number, so that is the one worth reading.',
    pt: '30% de chance de chuva e 100mm de chuva não se contradizem.\n\nA chance responde se vai chover. O acumulado responde quanto. O terreno alaga pelo segundo número, então é esse que vale ler.',
    es: 'Un 30% de probabilidad de lluvia y 100mm de lluvia no se contradicen.\n\nLa probabilidad responde si va a llover. El acumulado responde cuánto. El terreno se inunda por el segundo número.',
  },
  {
    en: 'One day under 1mm is nothing. Twelve in a row is a different thing entirely.\n\nDry damage is a function of the run, not of any single day. The number worth watching is how many, not how dry.',
    pt: 'Um dia abaixo de 1mm não é nada. Doze seguidos são outra coisa.\n\nO estrago da seca é função da sequência, não de um dia isolado. O número que importa é quantos, não o quanto.',
    es: 'Un día por debajo de 1mm no es nada. Doce seguidos son otra cosa.\n\nEl daño de la seca depende de la racha, no de un día suelto. El número que importa es cuántos, no cuánto.',
  },
  {
    en: 'When a forecast says a number is above normal, that "normal" is usually the median of the same week across the last 10 years.\n\nIt is not a target and not a promise. It only tells you whether today is unusual for the date.',
    pt: 'Quando a previsão diz que um número está acima do normal, esse "normal" costuma ser a mediana da mesma semana nos últimos 10 anos.\n\nNão é meta nem promessa. Só diz se hoje está fora do comum para a data.',
    es: 'Cuando un pronóstico dice que un número está por encima de lo normal, ese "normal" suele ser la mediana de esa misma semana en los últimos 10 años.\n\nNo es una meta ni una promesa. Solo dice si hoy es raro para la fecha.',
  },
  {
    en: 'A rainfall forecast 4 days out can move by a factor of 5 between model runs. We watched one go from 169mm to 29mm in a single morning.\n\nThat is not the model failing, it is how far ahead it is looking. Decisions that cost money belong in the 48 hour window.',
    pt: 'Uma previsão de chuva para daqui a 4 dias pode mudar 5 vezes de uma rodada para outra. Vimos uma sair de 169mm para 29mm numa única manhã.\n\nNão é falha do modelo, é a distância. Decisão que custa dinheiro se toma na janela de 48 horas.',
    es: 'Un pronóstico de lluvia a 4 días puede cambiar 5 veces entre corridas. Vimos uno pasar de 169mm a 29mm en una sola mañana.\n\nNo es que el modelo falle, es la distancia. Las decisiones que cuestan dinero van en la ventana de 48 horas.',
  },
  {
    en: 'A 75 km/h gust and a 30 km/h wind can be the same afternoon.\n\nGust is the peak, sustained is the average. Structures fail on the gust. Drying, spraying and everything you plan around happen on the sustained.',
    pt: 'Uma rajada de 75 km/h e um vento de 30 km/h podem ser a mesma tarde.\n\nRajada é o pico, o sustentado é a média. Estrutura cai na rajada. Secagem, pulverização e o que você planeja acontecem no sustentado.',
    es: 'Una ráfaga de 75 km/h y un viento de 30 km/h pueden ser la misma tarde.\n\nLa ráfaga es el pico, el sostenido es el promedio. Las estructuras caen con la ráfaga. El secado y la aplicación dependen del sostenido.',
  },
];

/**
 * Questions only someone who works outside can answer. The point is the
 * replies: an account with no conversation has no reason to be followed, and
 * the answers are worth more to us than any post we could write.
 */
const QUESTIONS: Evergreen[] = [
  {
    en: 'For anyone growing under a dry stretch: how many days do you let pass before you change anything?\n\n5? 10? Or only once you can see it in the crop?',
    pt: 'Para quem está sob uma sequência seca: quantos dias você deixa passar antes de mudar alguma coisa?\n\n5? 10? Ou só quando dá pra ver na lavoura?',
    es: 'Para quien está bajo una racha seca: ¿cuántos días dejás pasar antes de cambiar algo?\n\n¿5? ¿10? ¿O solo cuando ya se ve en el cultivo?',
  },
  {
    en: 'Frost question, for people who actually go out at night: what is the temperature where you stop watching and start covering?\n\n2°C? 0°C? Lower?',
    pt: 'Pergunta de geada, para quem sai de madrugada mesmo: qual é a temperatura em que você para de olhar e começa a cobrir?\n\n2°C? 0°C? Menos?',
    es: 'Pregunta de helada, para quien sale de noche en serio: ¿a qué temperatura dejás de mirar y empezás a cubrir?\n\n¿2°C? ¿0°C? ¿Menos?',
  },
  {
    en: '40mm of rain forecast in 48 hours. What changes first on your ground?\n\nDrainage, the timing of what you were going to do, or nothing until it is actually falling?',
    pt: '40mm de chuva previstos em 48 horas. O que muda primeiro no seu terreno?\n\nDrenagem, a hora do que você ia fazer, ou nada até começar a cair de verdade?',
    es: '40mm de lluvia previstos en 48 horas. ¿Qué cambia primero en tu campo?\n\n¿El drenaje, el momento de lo que ibas a hacer, o nada hasta que caiga?',
  },
  {
    en: 'Genuine question for anyone who works outside: which do you trust more when they disagree, the forecast on your phone or what the sky looked like at 6am?\n\nAnd how often is the second one right?',
    pt: 'Pergunta séria para quem trabalha fora: quando discordam, em qual você confia mais, na previsão do celular ou em como o céu estava às 6 da manhã?\n\nE quantas vezes a segunda acerta?',
    es: 'Pregunta en serio para quien trabaja afuera: cuando no coinciden, ¿en cuál confiás más, en el pronóstico del celular o en cómo estaba el cielo a las 6?\n\n¿Y cuántas veces acierta la segunda?',
  },
];

function pickEvergreen(
  library: Evergreen[],
  lang: GrowthLang,
  seed: string,
): string {
  const entry = pickVariant(library, seed);
  return entry[(lang === 'pt' || lang === 'es' ? lang : 'en')];
}

/**
 * A useful thing, given away, with nothing asked for. No card, no link, no
 * product name.
 */
export function buildExplainerPost(lang: GrowthLang, seed: string): XPost | null {
  const text = pickEvergreen(EXPLAINERS, lang, seed);
  if (text.length > MAX_POST) return null;
  return {
    format: 'explainer',
    text,
    linkReply: null,
    pageUrl: null,
    placeSlug: null,
    lang,
    signalTypeId: null,
  };
}

/** A question the audience can answer from their own working experience. */
export function buildQuestionPost(lang: GrowthLang, seed: string): XPost | null {
  const text = pickEvergreen(QUESTIONS, lang, seed);
  if (text.length > MAX_POST) return null;
  return {
    format: 'question',
    text,
    linkReply: null,
    pageUrl: null,
    placeSlug: null,
    lang,
    signalTypeId: null,
  };
}
