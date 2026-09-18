// kalma/frontend/lib/growth/hooks.ts
//
// The first line decides whether the rest of the post gets read.
//
// This exists because of a post that went out on 2026-08-06. It opened
// "48mm in 48 hours for Houston." That is accurate, and it is the least
// interesting true sentence available about Houston getting seventeen times
// its normal rain. The line every reader on Earth already knows was sitting
// right there and the engine could not see it.
//
// What this module does NOT do is make the claim louder. Kalma's whole
// position is that it states a measurable thing and lets the reader decide
// (Golden Rule 8, and docs/FALSIFIABLE_CLAIMS_2026-08-05.md). A hook that
// manufactures alarm buys attention with the only asset the account has.
// So every family below earns attention from something already true:
// arithmetic the reader can check, a belief worth correcting, or a phrase
// the place already owns.
//
// The ladder, strongest first. First family that fits wins; when none fit,
// this returns null and the caller keeps the formula's own hook, which is
// the current behaviour and a perfectly good floor.
//
//   1. IDIOM     a phrase the place already owns, when the situation
//                genuinely matches it. Rare, curated, highest attention.
//   2. EVENT     a date the reader already had in their head, overlapping
//                this window. The strongest coordination hook there is.
//   3. RATIO     the anomaly as a multiple. Pure arithmetic, and a big
//                multiple is startling without a single loaded word.
//   4. REFRAME   correct a belief the reader is holding. This is the move
//                behind Kalma's best existing copy ("Rain is not the
//                problem. Rain arriving faster than the soil takes it is.")
//
// Deliberately absent: urgency ("act now"), instruction ("prepare"),
// superlatives ("historic", "unprecedented"), and anything a person could
// not check by looking at the numbers underneath.

import { eventsInWindow, type PlaceEvent } from './place-events.ts';
import type { GrowthLang } from './types.ts';

export type HookFamily = 'idiom' | 'event' | 'ratio' | 'reframe';

export type Hook = {
  text: string;
  family: HookFamily;
};

export type HookInput = {
  signalTypeId: string;
  /** local_signals.severity: low | medium | high | extreme */
  severity: string;
  placeSlug: string;
  placeLabel: string;
  lang: GrowthLang;
  /** The headline forecast quantity (mm, or degrees C for heat/cold). */
  forecast?: number;
  /**
   * The same quantity already rendered for the reader: unit-converted to the
   * PLACE's measurement system and suffixed ("48mm", "1.9 in"). Passed in
   * rather than formatted here so there is exactly one place that decides
   * units (lib/units.ts, via x-copy's slotsFor) and no chance of a hook
   * printing °C over a °F card, which is a bug this repo has already shipped
   * once. The ratio hook refuses to fire without it.
   */
  forecastLabel?: string;
  /** The matching baseline for the same window and quantity. */
  baseline?: number;
  /** The signal's validity window, used to spot an event falling inside it. */
  windowStart?: string | null;
  windowEnd?: string | null;
  /** This place's verified events (lib/growth/place-events.ts), already
   *  resolved by the caller from BriefRow.events. This module does no I/O. */
  events?: PlaceEvent[];
};

// ── 1. Idiom ────────────────────────────────────────────────────────────────
//
// A phrase the place already owns. This is the family that pays for the whole
// module, and it is also the one that can embarrass the account, so the bar
// is high and the list is short. Rules for adding one:
//
//   - It must be a phrase a person outside the city would recognise. An
//     in-joke reads as a stranger pretending to be a local.
//   - It must not sit on top of a disaster. "When the levee breaks" for New
//     Orleans is a Katrina reference, and using a city's worst day as a
//     headline device is exactly the alarmism this account refuses. Left out
//     on purpose, not overlooked.
//   - It must be true to the weather at hand, gated by `fits` and
//     `minSeverity` below. "Houston, we have a problem" over a mild week is
//     the manufactured urgency this module exists to avoid.
//   - It sets up the number, never replaces it. The claim still follows.
//
// `fits` lists signal type ids. `minSeverity` is the floor.

type Idiom = {
  fits: string[];
  minSeverity: 'medium' | 'high' | 'extreme';
  text: Partial<Record<GrowthLang, string>>;
};

const SEVERITY_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

export const PLACE_IDIOMS: Record<string, Idiom[]> = {
  'houston-tx-us': [
    {
      // Apollo 13, and the most quoted sentence any city has. Works for any
      // signal severe enough to actually be a problem, which is the gate.
      fits: [
        'heavy_rain_event',
        'rainfall_risk_rising',
        'dry_stretch_window',
        'heat_stress_window',
      ],
      minSeverity: 'high',
      text: {
        en: 'Houston, we have a problem.',
        pt: 'Houston, temos um problema.',
        es: 'Houston, tenemos un problema.',
      },
    },
  ],
  'phoenix-az-us': [
    {
      // "But it's a dry heat" is the standing joke about Phoenix, and a
      // rain signal there is the joke failing. Wry, not alarmed.
      fits: ['heavy_rain_event', 'rainfall_risk_rising'],
      minSeverity: 'high',
      text: { en: 'The dry heat is not the story this week.' },
    },
  ],
  'seattle-wa-us': [
    {
      // Seattle's reputation is rain, so a DRY signal is the surprise. Using
      // the stereotype against itself is the reframe, not the cliche.
      fits: ['dry_stretch_window'],
      minSeverity: 'high',
      text: { en: 'The city everyone jokes about for rain is not getting any.' },
    },
  ],
};

function idiomHook(input: HookInput): Hook | null {
  const entries = PLACE_IDIOMS[input.placeSlug];
  if (!entries) return null;
  const rank = SEVERITY_RANK[input.severity] ?? -1;
  for (const entry of entries) {
    if (!entry.fits.includes(input.signalTypeId)) continue;
    if (rank < SEVERITY_RANK[entry.minSeverity]) continue;
    const text = entry.text[input.lang] ?? entry.text.en;
    if (text) return { text, family: 'idiom' };
  }
  return null;
}

// ── 2. Event ────────────────────────────────────────────────────────────────
//
// A recurring event whose month overlaps the signal's validity window. See
// lib/growth/recurring-events.ts for why the catalog is month-granular and
// recurring-only.
//
// The line states an overlap between two date ranges, which is checkable, and
// stops there. It does not say the event is at risk, will be disrupted, or
// should be rescheduled: Kalma does not model any of that, and the claim that
// follows this hook is still the ordinary falsifiable one about millimetres
// or degrees. The event earns attention; the number carries the meaning.

const EVENT_TEXT: Record<GrowthLang, (event: string, place: string) => string> = {
  en: (event, place) => `The forecast window covers ${event} in ${place}.`,
  pt: (event, place) => `A janela da previsão cobre ${event} em ${place}.`,
  es: (event, place) => `La ventana del pronóstico cubre ${event} en ${place}.`,
  fr: (event, place) => `La fenêtre de prévision couvre ${event} à ${place}.`,
  de: (event, place) => `Der Vorhersagezeitraum fällt mit ${event} in ${place} zusammen.`,
  zh: (event, place) => `预报窗口正值 ${place} 的${event}。`,
};

function eventHook(input: HookInput): Hook | null {
  if (!input.events?.length) return null;
  const matches = eventsInWindow(input.events, input.windowStart, input.windowEnd);
  if (!matches.length) return null;
  const render = EVENT_TEXT[input.lang] ?? EVENT_TEXT.en;
  return { text: render(matches[0].name, input.placeLabel), family: 'event' };
}

// ── 3. Ratio ────────────────────────────────────────────────────────────────
//
// The anomaly stated as a multiple. "Seventeen times the normal" is startling
// and contains no adjective at all: the reader can divide the two numbers in
// the post and get the same answer, which is the only kind of emphasis this
// account is allowed.
//
// Floor of 4x because below that a multiple is less vivid than the raw pair
// of numbers, and a baseline near zero makes small absolute differences look
// enormous (0.2mm to 2mm is "ten times" and means nothing). The absolute
// floor guards that.

const RATIO_MIN = 4;
/** Below this the baseline is too small for a multiple to carry meaning. */
const RATIO_MIN_BASELINE = 1;

// The multiple LEADS but never travels alone: it is always stated next to the
// absolute amount it came from.
//
// Two reasons, found by reading a live post. "34 times the normal rain for
// this week in Melbourne" went out carrying no millimetre figure anywhere,
// because the hook replaces the formula's own hook line and the
// rainfall_risk_rising stake line has no number in it either. A reader can be
// startled by 34x; nobody can plan around it, and nobody forwards to a
// neighbour a warning the neighbour cannot act on. Share-via-copy-link is the
// highest-weighted action in the ranker (20.0), and it is a forward, so the
// post has to survive being read cold by a third person.
//
// The second reason is accuracy. "for this week" described the baseline as a
// weekly normal. It is not: evaluator.ts builds it as a 48-hour rolling sum
// over the same day-of-year window in past years ("Build 48h rolling sums for
// fair comparison"). The comparison was always sound; the sentence describing
// it was not.
const RATIO_TEXT: Record<GrowthLang, (n: string, place: string, amount: string) => string> = {
  en: (n, place, amount) => `${amount} of rain in 48 hours for ${place}, ${n} times the normal for this time of year.`,
  pt: (n, place, amount) => `${amount} de chuva em 48 horas em ${place}, ${n} vezes o normal para esta época do ano.`,
  es: (n, place, amount) => `${amount} de lluvia en 48 horas en ${place}, ${n} veces lo normal para esta época del año.`,
  fr: (n, place, amount) => `${amount} de pluie en 48 heures à ${place}, ${n} fois la normale pour cette période de l'année.`,
  de: (n, place, amount) => `${amount} Regen in 48 Stunden in ${place}, ${n} mal so viel wie für diese Jahreszeit normal.`,
  zh: (n, place, amount) => `${place} 48 小时内降雨 ${amount}，是该时节常年的 ${n} 倍。`,
};

/** Rain-shaped signals only: a "multiple" of a temperature is meaningless. */
const RATIO_SIGNALS = new Set(['heavy_rain_event', 'rainfall_risk_rising']);

function ratioHook(input: HookInput): Hook | null {
  if (!RATIO_SIGNALS.has(input.signalTypeId)) return null;
  const { forecast, baseline, forecastLabel } = input;
  if (
    typeof forecast !== 'number' ||
    typeof baseline !== 'number' ||
    !Number.isFinite(forecast) ||
    !Number.isFinite(baseline) ||
    baseline < RATIO_MIN_BASELINE
  ) {
    return null;
  }
  // No absolute amount, no multiple. A bare "34 times normal" is the failure
  // this hook was rewritten to stop; falling through to the next family
  // leaves a post that still carries its own numbers.
  if (!forecastLabel || forecastLabel === '?') return null;
  const ratio = forecast / baseline;
  if (!Number.isFinite(ratio) || ratio < RATIO_MIN) return null;
  const rounded = String(Math.round(ratio));
  const render = RATIO_TEXT[input.lang] ?? RATIO_TEXT.en;
  return { text: render(rounded, input.placeLabel, forecastLabel), family: 'ratio' };
}

// ── 4. Reframe ──────────────────────────────────────────────────────────────
//
// Correct a belief the reader is already holding. This is the strongest thing
// Kalma writes and it was already in the copy before this module existed:
// "Rain is not the problem. Rain arriving faster than the soil takes it is."
//
// It earns attention by being arguable, which is also why each one has to be
// defensible on the meteorology. These describe a mechanism, never an action.

const REFRAMES: Partial<Record<string, Partial<Record<GrowthLang, string>>>> = {
  heavy_rain_event: {
    en: 'Rain is not the problem. Rain arriving faster than the ground takes it is.',
    pt: 'Chuva não é o problema. Chuva chegando mais rápido do que o solo aceita é.',
    es: 'La lluvia no es el problema. La lluvia que llega más rápido de lo que el suelo acepta sí.',
  },
  rainfall_risk_rising: {
    en: 'Rain is not the problem. Rain arriving faster than the ground takes it is.',
    pt: 'Chuva não é o problema. Chuva chegando mais rápido do que o solo aceita é.',
    es: 'La lluvia no es el problema. La lluvia que llega más rápido de lo que el suelo acepta sí.',
  },
  dry_stretch_window: {
    en: 'One dry day is nothing. The run is what does the damage.',
    pt: 'Um dia seco não é nada. O que faz o estrago é a sequência.',
    es: 'Un día seco no es nada. Lo que hace el daño es la racha.',
  },
  heat_stress_window: {
    en: 'A hot afternoon passes. Heat that stays for days is a different thing.',
    pt: 'Uma tarde quente passa. Calor que fica por dias é outra coisa.',
    es: 'Una tarde calurosa pasa. El calor que se queda por días es otra cosa.',
  },
  frost_risk: {
    en: 'Frost damage is decided before the cold arrives, not during it.',
    pt: 'O dano da geada se decide antes do frio chegar, não durante.',
    es: 'El daño de la helada se decide antes de que llegue el frío, no durante.',
  },
};

function reframeHook(input: HookInput): Hook | null {
  const byLang = REFRAMES[input.signalTypeId];
  const text = byLang?.[input.lang] ?? byLang?.en;
  return text ? { text, family: 'reframe' } : null;
}

// ── The ladder ──────────────────────────────────────────────────────────────

/**
 * The strongest hook available for this signal, or null to keep the caller's
 * own formula hook.
 *
 * Order is fixed rather than scored: these families are not commensurable,
 * and a fixed order is auditable in a way a tuned weight is not. An idiom
 * that fits is always the best line on the page; an event the reader already
 * has in their calendar beats a number they have to be told to care about; a
 * 17x multiple always beats a general reframe; the reframe is the floor above
 * "state the number".
 */
export function pickHook(input: HookInput): Hook | null {
  return (
    idiomHook(input) ?? eventHook(input) ?? ratioHook(input) ?? reframeHook(input)
  );
}
