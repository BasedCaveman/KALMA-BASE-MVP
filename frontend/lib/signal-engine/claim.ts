// kalma/frontend/lib/signal-engine/claim.ts
//
// FALSIFIABLE CLAIMS.
//
// A signal's prose ("a dry stretch is forming here") survives any weather, so
// it is not a statement about the world. This module turns each signal into a
// claim that a recorded day can prove WRONG:
//
//   "In Lavras, between 2026-08-05 and 2026-08-18, there will be at least 14
//    consecutive days with 1mm or less of daily rain."
//
// One day with 3mm inside that window kills it. That is what makes it a claim.
//
// Why this exists in three places at once:
//   1. Scoring. You cannot measure accuracy on a sentence that cannot fail.
//      Today's brief verification says so itself: it is a directional
//      single-day check, "context, not a forecast grade".
//   2. On-chain anchoring (V7 log, Q-4). Committing vague prose to a chain
//      proves you published a vague sentence at a time. Committing THIS proves
//      you accepted being publicly wrong before you could know.
//   3. Reading. The claim is the machine-checkable half; CONSEQUENCES below
//      are the human half, because "14 days under 1mm" means nothing to
//      someone until it is said in terms of what they do for a living.
//
// The cost is deliberate: Kalma will now be provably wrong sometimes. Vague
// prose protected us from that, and the protection was worth nothing.
//
// Self-contained (zero imports), same rule as activity-profile.ts: this runs
// inside Next cron routes, in the browser, and in plain Node scripts via type
// stripping, which cannot resolve extensionless TS imports.

export type ClaimLocale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

/** Open-Meteo daily variables. The verifier reads exactly these. */
export type ClaimMetric =
  | 'precipitation_sum'
  | 'temperature_2m_max'
  | 'temperature_2m_min';

export type ClaimAggregation =
  /** N consecutive days satisfying the comparator. */
  | 'consecutive_days'
  /** At least one day satisfying the comparator. */
  | 'any_day'
  /** Total across the window. */
  | 'sum'
  /** Mean of the daily values across the window. */
  | 'mean';

export type Claim = {
  signalTypeId: string;
  metric: ClaimMetric;
  aggregation: ClaimAggregation;
  comparator: 'gte' | 'lte';
  /** The number the recorded weather is measured against. */
  threshold: number;
  unit: 'mm' | 'C';
  /** Only for consecutive_days: how many in a row are claimed. */
  runDays?: number;
  /** Inclusive ISO dates. The window must be closed before a verdict exists. */
  from: string;
  to: string;
  /**
   * 'forecast'  - the engine's own forward assertion, restated as a threshold.
   * 'forward_restatement' - the signal itself is retrospective (it fired on
   *   what already happened) and this is a forward claim consistent with it.
   *   Recorded rather than hidden: it is a weaker kind of claim and a reader
   *   of the record deserves to know which they are looking at.
   */
  basis: 'forecast' | 'forward_restatement';
};

function num(sd: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = (sd ?? {})[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const p = Number(v);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

/**
 * Build the falsifiable claim for a signal, or null when the stored data
 * cannot support one. Null is an honest outcome: a signal with no numbers
 * behind it should not be given a claim it never made.
 */
export function buildClaim(
  signalTypeId: string,
  structuredData: Record<string, unknown> | null | undefined,
  from: string,
  to: string,
): Claim | null {
  if (!from || !to) return null;
  const sd = structuredData ?? {};
  const base = { signalTypeId, from, to } as const;

  switch (signalTypeId) {
    case 'dry_stretch_window': {
      const threshold = num(sd, 'threshold_mm');
      const runDays = num(sd, 'observed_run_days');
      if (threshold == null || runDays == null) return null;
      return {
        ...base,
        metric: 'precipitation_sum',
        aggregation: 'consecutive_days',
        comparator: 'lte',
        threshold,
        unit: 'mm',
        runDays,
        basis: 'forecast',
      };
    }
    case 'consecutive_cold_below': {
      const threshold = num(sd, 'threshold_celsius');
      const runDays = num(sd, 'observed_run_days');
      if (threshold == null || runDays == null) return null;
      return {
        ...base,
        metric: 'temperature_2m_min',
        aggregation: 'consecutive_days',
        comparator: 'lte',
        threshold,
        unit: 'C',
        runDays,
        basis: 'forecast',
      };
    }
    case 'frost_risk': {
      const threshold = num(sd, 'threshold_celsius');
      if (threshold == null) return null;
      return {
        ...base,
        metric: 'temperature_2m_min',
        aggregation: 'any_day',
        comparator: 'lte',
        threshold,
        unit: 'C',
        basis: 'forecast',
      };
    }
    case 'heavy_rain_event': {
      // The claim is the threshold crossing, never the forecast value itself:
      // a forecast is never exact, so claiming "68mm will fall" would fail on
      // a day that delivered 61mm and proved the signal right in every way
      // that matters.
      const mark = num(sd, 'baseline_p95_mm');
      if (mark == null) return null;
      return {
        ...base,
        metric: 'precipitation_sum',
        aggregation: 'any_day',
        comparator: 'gte',
        threshold: mark,
        unit: 'mm',
        basis: 'forecast',
      };
    }
    case 'heat_stress_window': {
      // Against the local 90th percentile, which is this place's own line for
      // "unusual", not an absolute temperature.
      const mark = num(sd, 'baseline_p90_c') ?? num(sd, 'baseline_median_c');
      if (mark == null) return null;
      return {
        ...base,
        metric: 'temperature_2m_max',
        aggregation: 'mean',
        comparator: 'gte',
        threshold: mark,
        unit: 'C',
        basis: 'forecast',
      };
    }
    case 'rainfall_risk_rising': {
      const usual = num(sd, 'baseline_median_mm');
      if (usual == null) return null;
      return {
        ...base,
        metric: 'precipitation_sum',
        aggregation: 'sum',
        comparator: 'gte',
        threshold: usual,
        unit: 'mm',
        basis: 'forecast',
      };
    }
    case 'water_recovery_signal': {
      // This signal fires on the LAST 14 days, so it is retrospective. The
      // forward claim ("the recovery holds") is a restatement, flagged as such
      // rather than passed off as what the signal originally asserted.
      const usual = num(sd, 'baseline_median_mm');
      if (usual == null) return null;
      return {
        ...base,
        metric: 'precipitation_sum',
        aggregation: 'sum',
        comparator: 'gte',
        threshold: usual,
        unit: 'mm',
        basis: 'forward_restatement',
      };
    }
    default:
      return null;
  }
}

// ── The sentence ────────────────────────────────────────────────────────────

const T: Record<ClaimLocale, {
  consecutive_lte: string;
  consecutive_gte: string;
  any_lte: string;
  any_gte: string;
  sum_gte: string;
  mean_gte: string;
  day: string;
  days: string;
  restated: string;
}> = {
  en: {
    consecutive_lte: 'In {place}, between {from} and {to}, there will be at least {n} consecutive days with {t} or less of {what}.',
    consecutive_gte: 'In {place}, between {from} and {to}, there will be at least {n} consecutive days with {t} or more of {what}.',
    any_lte: 'In {place}, between {from} and {to}, {what} will fall to {t} or below on at least one day.',
    any_gte: 'In {place}, between {from} and {to}, {what} will reach {t} or more on at least one day.',
    sum_gte: 'In {place}, between {from} and {to}, total {what} will reach {t} or more.',
    mean_gte: 'In {place}, between {from} and {to}, the average {what} will reach {t} or more.',
    day: 'day', days: 'days',
    restated: 'This signal fired on what already happened. The claim above is the forward restatement of it.',
  },
  pt: {
    consecutive_lte: 'Em {place}, entre {from} e {to}, haverá pelo menos {n} dias seguidos com {t} ou menos de {what}.',
    consecutive_gte: 'Em {place}, entre {from} e {to}, haverá pelo menos {n} dias seguidos com {t} ou mais de {what}.',
    any_lte: 'Em {place}, entre {from} e {to}, {what} chegará a {t} ou menos em pelo menos um dia.',
    any_gte: 'Em {place}, entre {from} e {to}, {what} chegará a {t} ou mais em pelo menos um dia.',
    sum_gte: 'Em {place}, entre {from} e {to}, o total de {what} chegará a {t} ou mais.',
    mean_gte: 'Em {place}, entre {from} e {to}, a média de {what} chegará a {t} ou mais.',
    day: 'dia', days: 'dias',
    restated: 'Este sinal disparou pelo que já aconteceu. A afirmação acima é a versão dele para a frente.',
  },
  es: {
    consecutive_lte: 'En {place}, entre {from} y {to}, habrá al menos {n} días seguidos con {t} o menos de {what}.',
    consecutive_gte: 'En {place}, entre {from} y {to}, habrá al menos {n} días seguidos con {t} o más de {what}.',
    any_lte: 'En {place}, entre {from} y {to}, {what} bajará a {t} o menos al menos un día.',
    any_gte: 'En {place}, entre {from} y {to}, {what} llegará a {t} o más al menos un día.',
    sum_gte: 'En {place}, entre {from} y {to}, el total de {what} llegará a {t} o más.',
    mean_gte: 'En {place}, entre {from} y {to}, el promedio de {what} llegará a {t} o más.',
    day: 'día', days: 'días',
    restated: 'Esta señal se activó por lo que ya ocurrió. La afirmación de arriba es su versión hacia adelante.',
  },
  fr: {
    consecutive_lte: "À {place}, entre le {from} et le {to}, il y aura au moins {n} jours consécutifs avec {t} ou moins de {what}.",
    consecutive_gte: "À {place}, entre le {from} et le {to}, il y aura au moins {n} jours consécutifs avec {t} ou plus de {what}.",
    any_lte: "À {place}, entre le {from} et le {to}, {what} descendra à {t} ou moins au moins un jour.",
    any_gte: "À {place}, entre le {from} et le {to}, {what} atteindra {t} ou plus au moins un jour.",
    sum_gte: "À {place}, entre le {from} et le {to}, le total de {what} atteindra {t} ou plus.",
    mean_gte: "À {place}, entre le {from} et le {to}, la moyenne de {what} atteindra {t} ou plus.",
    day: 'jour', days: 'jours',
    restated: "Ce signal s'est déclenché sur ce qui a déjà eu lieu. L'affirmation ci-dessus en est la version tournée vers l'avenir.",
  },
  de: {
    consecutive_lte: 'In {place} wird es zwischen {from} und {to} mindestens {n} aufeinanderfolgende Tage mit {t} oder weniger {what} geben.',
    consecutive_gte: 'In {place} wird es zwischen {from} und {to} mindestens {n} aufeinanderfolgende Tage mit {t} oder mehr {what} geben.',
    any_lte: 'In {place} wird {what} zwischen {from} und {to} an mindestens einem Tag auf {t} oder darunter fallen.',
    any_gte: 'In {place} wird {what} zwischen {from} und {to} an mindestens einem Tag {t} oder mehr erreichen.',
    sum_gte: 'In {place} wird die Gesamtmenge {what} zwischen {from} und {to} {t} oder mehr erreichen.',
    mean_gte: 'In {place} wird der Durchschnitt {what} zwischen {from} und {to} {t} oder mehr erreichen.',
    day: 'Tag', days: 'Tage',
    restated: 'Dieses Signal wurde durch bereits Geschehenes ausgelöst. Die obige Aussage ist die vorwärts gerichtete Fassung davon.',
  },
  zh: {
    consecutive_lte: '在{place}，{from} 至 {to} 之间，将有至少 {n} 个连续日的{what}不超过 {t}。',
    consecutive_gte: '在{place}，{from} 至 {to} 之间，将有至少 {n} 个连续日的{what}达到 {t} 或以上。',
    any_lte: '在{place}，{from} 至 {to} 之间，至少有一天的{what}降至 {t} 或以下。',
    any_gte: '在{place}，{from} 至 {to} 之间，至少有一天的{what}达到 {t} 或以上。',
    sum_gte: '在{place}，{from} 至 {to} 之间，{what}总量将达到 {t} 或以上。',
    mean_gte: '在{place}，{from} 至 {to} 之间，{what}平均值将达到 {t} 或以上。',
    day: '天', days: '天',
    restated: '该信号是基于已经发生的情况触发的。上述表述是它的前瞻版本。',
  },
};

const METRIC_WORD: Record<ClaimMetric, Record<ClaimLocale, string>> = {
  precipitation_sum: {
    en: 'daily rain', pt: 'chuva diária', es: 'lluvia diaria',
    fr: 'pluie quotidienne', de: 'Tagesniederschlag', zh: '日降雨量',
  },
  temperature_2m_max: {
    en: 'daily high', pt: 'máxima diária', es: 'máxima diaria',
    fr: 'maximale quotidienne', de: 'Tageshöchsttemperatur', zh: '日最高气温',
  },
  temperature_2m_min: {
    en: 'the daily low', pt: 'a mínima diária', es: 'la mínima diaria',
    fr: 'la minimale quotidienne', de: 'die Tagestiefsttemperatur', zh: '日最低气温',
  },
};

function fmt(value: number, unit: 'mm' | 'C'): string {
  const n = Math.round(value * 10) / 10;
  return unit === 'mm' ? `${n}mm` : `${n}°C`;
}

/** The claim, written out. This is the sentence that can be proven wrong. */
export function claimSentence(claim: Claim, locale: string, placeName: string): string {
  const l = (locale in T ? locale : 'en') as ClaimLocale;
  const t = T[l];
  const what = METRIC_WORD[claim.metric][l];
  const key =
    claim.aggregation === 'consecutive_days'
      ? (claim.comparator === 'lte' ? 'consecutive_lte' : 'consecutive_gte')
      : claim.aggregation === 'any_day'
        ? (claim.comparator === 'lte' ? 'any_lte' : 'any_gte')
        : claim.aggregation === 'sum'
          ? 'sum_gte'
          : 'mean_gte';
  return t[key]
    .replace('{place}', placeName)
    .replace('{from}', claim.from)
    .replace('{to}', claim.to)
    .replace('{n}', String(claim.runDays ?? 1))
    .replace('{t}', fmt(claim.threshold, claim.unit))
    .replace('{what}', what);
}

export function restatementNote(locale: string): string {
  const l = (locale in T ? locale : 'en') as ClaimLocale;
  return T[l].restated;
}

// ── Verification ────────────────────────────────────────────────────────────

export type DailyPoint = { date: string; value: number | null };

export type ClaimVerdict = {
  status: 'held' | 'failed' | 'pending';
  /** What the recorded weather actually produced, for the record. */
  observed: number | null;
  /** Days with data inside the window. */
  covered: number;
};

/**
 * Evaluate a claim against the recorded daily series.
 *
 * 'pending' is returned whenever the window has not closed OR the series has
 * gaps inside it. Guessing across a gap would let a missing day silently
 * decide a verdict, and the whole point of this record is that a verdict is
 * only ever earned.
 */
export function verifyClaim(
  claim: Claim,
  series: DailyPoint[],
  today: string,
): ClaimVerdict {
  if (today <= claim.to) return { status: 'pending', observed: null, covered: 0 };

  const inWindow = series
    .filter((p) => p.date >= claim.from && p.date <= claim.to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const values = inWindow.filter((p) => typeof p.value === 'number') as Array<{ date: string; value: number }>;
  const covered = values.length;

  // Expected day count across an inclusive date range.
  const expected =
    Math.round(
      (Date.parse(`${claim.to}T00:00:00Z`) - Date.parse(`${claim.from}T00:00:00Z`)) / 86400000,
    ) + 1;
  if (covered < expected) return { status: 'pending', observed: null, covered };

  const ok = (v: number) => (claim.comparator === 'lte' ? v <= claim.threshold : v >= claim.threshold);

  if (claim.aggregation === 'consecutive_days') {
    let best = 0;
    let run = 0;
    for (const p of values) {
      run = ok(p.value) ? run + 1 : 0;
      if (run > best) best = run;
    }
    return {
      status: best >= (claim.runDays ?? 1) ? 'held' : 'failed',
      observed: best,
      covered,
    };
  }

  if (claim.aggregation === 'any_day') {
    const hit = values.find((p) => ok(p.value));
    const extreme = claim.comparator === 'lte'
      ? Math.min(...values.map((p) => p.value))
      : Math.max(...values.map((p) => p.value));
    return { status: hit ? 'held' : 'failed', observed: extreme, covered };
  }

  const total = values.reduce((a, p) => a + p.value, 0);
  const observed = claim.aggregation === 'sum' ? total : total / values.length;
  return { status: ok(observed) ? 'held' : 'failed', observed: Math.round(observed * 10) / 10, covered };
}
