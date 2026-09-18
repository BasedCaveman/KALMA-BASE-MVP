// kalma/frontend/lib/signal-engine/chart-data.ts
//
// Extracts a compact set of inputs for the per-signal context chart
// from the signal's structured_data. The chart shape varies by signal
// type — this layer hides the per-type plumbing from the renderer.
//
// V1 supports the "band" shape: a horizontal track with a shaded
// "usual range" segment, an interior median tick, and a marker for
// the forecast / observed value. Designed for percentile-style
// signals where the data is naturally distributed on a continuous
// axis (rainfall mm, temperature °C).
//
// Run-length signals (cold spell / dry stretch / frost) are returned
// with shape=null so SignalCard can simply omit the chart for them
// — they get a different visualization in a follow-up.

export type BandChartData = {
  shape: 'band';
  /** Lower bound of the shaded "usual range" segment. */
  rangeStart: number;
  /** Upper bound of the shaded "usual range" segment. */
  rangeEnd: number;
  /** Median value, drawn as a tick inside the band. */
  median: number;
  /** The forecast / observed value the signal is reporting on. */
  forecast: number;
  /** Right edge of the chart axis (small headroom above max). */
  maxScale: number;
  /** Left edge of the chart axis. */
  minScale: number;
  /** Short axis-unit suffix, e.g. "mm" or "°C". */
  unit: string;
  /** Inline label for the band, e.g. "Usual range here". */
  bandLabel: string;
  /** Inline label for the forecast marker, e.g. "Forecast" or "Forecast peak". */
  forecastLabel: string;
};

/**
 * Event-shaped signals (cold spell / dry stretch / frost risk) get a
 * horizontal day-strip instead of a band. One cell per day in the
 * forecast horizon; the contiguous block of `runLength` cells starting
 * at `runStartIndex` is highlighted in the severity tone. Cells outside
 * the run are muted.
 */
export type RunStripChartData = {
  shape: 'run-strip';
  /** Total number of cells (forecast horizon, default 14). */
  horizonDays: number;
  /** 0-based index where the run begins. Clamped to [0, horizonDays - runLength]. */
  runStartIndex: number;
  /** Number of highlighted cells. */
  runLength: number;
  /** Short uppercase label above the strip, e.g. "COLD STRETCH". */
  topLabel: string;
  /** Right-aligned uppercase label above the strip, e.g. "STARTS ~MAY 20". */
  topRightLabel: string;
  /** Bottom-aligned thin note below the strip, e.g. "Below 15 °C". */
  noteLabel: string;
};

export type SignalChartData =
  | BandChartData
  | RunStripChartData
  | { shape: null };

type StructuredData = Record<string, any>;

// ── Localized chart labels ───────────────────────────────────────────────
// Numeric values + units stay locale-neutral; only the words localize.
// The 'en' branch reproduces the original strings exactly.

import type { Locale } from './i18n';

type ChartPhrases = {
  usual48h: string;
  forecast: string;
  usualDailyHigh: string;
  forecast7d: string;
  usual14d: string;
  recent14d: string;
  seasonalHeavyRainMark: string;
  forecastPeak: string;
  day: string;
  days: string;
  coldStretch: (n: number, dayWord: string) => string;
  dryStretch: (n: number, dayWord: string) => string;
  frostRiskNight: string;
  starts: (dateStr: string) => string;
  approx: (dateStr: string) => string;
  coldBelow: (threshold: number) => string;
  coldBelowGeneric: string;
  dryAtOrBelow: (threshold: number) => string;
  dryGeneric: string;
  frostNote: (coldestStr: string, threshold: number) => string;
  belowFrostLine: string;
  /** BCP-47 tag for month formatting; uppercase applied except CJK. */
  dateTag: string;
  upperMonth: boolean;
};

const CHART_PHRASES: Record<Locale, ChartPhrases> = {
  en: {
    usual48h: 'Usual 48h', forecast: 'Forecast',
    usualDailyHigh: 'Usual daily high', forecast7d: 'Forecast 7d',
    usual14d: 'Usual 14d', recent14d: 'Recent 14d',
    seasonalHeavyRainMark: 'Seasonal heavy-rain mark', forecastPeak: 'Forecast peak',
    day: 'day', days: 'days',
    coldStretch: (n, d) => `Cold stretch (${n} ${d})`,
    dryStretch: (n, d) => `Dry stretch (${n} ${d})`,
    frostRiskNight: 'Frost-risk night',
    starts: (s) => `starts ~${s}`,
    approx: (s) => `~${s}`,
    coldBelow: (t) => `Below ${t}°C — usual run here is much shorter`,
    coldBelowGeneric: 'Below the local cold threshold',
    dryAtOrBelow: (t) => `Daily rain at or below ${t}mm`,
    dryGeneric: 'Days with little to no rain',
    frostNote: (c, t) => `Coldest forecast: ${c} (frost line ${t}°C)`,
    belowFrostLine: 'below frost line',
    dateTag: 'en-US', upperMonth: true,
  },
  pt: {
    usual48h: 'Normal 48h', forecast: 'Previsão',
    usualDailyHigh: 'Máx. diária normal', forecast7d: 'Previsão 7d',
    usual14d: 'Normal 14d', recent14d: 'Recente 14d',
    seasonalHeavyRainMark: 'Referência sazonal de chuva forte', forecastPeak: 'Pico previsto',
    day: 'dia', days: 'dias',
    coldStretch: (n, d) => `Período frio (${n} ${d})`,
    dryStretch: (n, d) => `Estiagem (${n} ${d})`,
    frostRiskNight: 'Noite com risco de geada',
    starts: (s) => `começa ~${s}`,
    approx: (s) => `~${s}`,
    coldBelow: (t) => `Abaixo de ${t}°C — a sequência normal aqui é bem menor`,
    coldBelowGeneric: 'Abaixo do limite local de frio',
    dryAtOrBelow: (t) => `Chuva diária de ${t}mm ou menos`,
    dryGeneric: 'Dias com pouca ou nenhuma chuva',
    frostNote: (c, t) => `Mínima prevista: ${c} (linha de geada ${t}°C)`,
    belowFrostLine: 'abaixo da linha de geada',
    dateTag: 'pt-BR', upperMonth: true,
  },
  es: {
    usual48h: 'Normal 48h', forecast: 'Pronóstico',
    usualDailyHigh: 'Máx. diaria normal', forecast7d: 'Pronóstico 7d',
    usual14d: 'Normal 14d', recent14d: 'Reciente 14d',
    seasonalHeavyRainMark: 'Referencia estacional de lluvia fuerte', forecastPeak: 'Pico previsto',
    day: 'día', days: 'días',
    coldStretch: (n, d) => `Racha fría (${n} ${d})`,
    dryStretch: (n, d) => `Racha seca (${n} ${d})`,
    frostRiskNight: 'Noche con riesgo de helada',
    starts: (s) => `empieza ~${s}`,
    approx: (s) => `~${s}`,
    coldBelow: (t) => `Bajo ${t}°C — la racha normal aquí es mucho más corta`,
    coldBelowGeneric: 'Bajo el umbral local de frío',
    dryAtOrBelow: (t) => `Lluvia diaria de ${t}mm o menos`,
    dryGeneric: 'Días con poca o nula lluvia',
    frostNote: (c, t) => `Mínima prevista: ${c} (línea de helada ${t}°C)`,
    belowFrostLine: 'bajo la línea de helada',
    dateTag: 'es-ES', upperMonth: true,
  },
  fr: {
    usual48h: 'Normale 48h', forecast: 'Prévision',
    usualDailyHigh: 'Max. quotidien normal', forecast7d: 'Prévision 7j',
    usual14d: 'Normale 14j', recent14d: 'Récent 14j',
    seasonalHeavyRainMark: 'Référence saisonnière fortes pluies', forecastPeak: 'Pic prévu',
    day: 'jour', days: 'jours',
    coldStretch: (n, d) => `Période froide (${n} ${d})`,
    dryStretch: (n, d) => `Période sèche (${n} ${d})`,
    frostRiskNight: 'Nuit à risque de gel',
    starts: (s) => `débute ~${s}`,
    approx: (s) => `~${s}`,
    coldBelow: (t) => `Sous ${t}°C — la série normale ici est bien plus courte`,
    coldBelowGeneric: 'Sous le seuil de froid local',
    dryAtOrBelow: (t) => `Pluie quotidienne à ${t}mm ou moins`,
    dryGeneric: 'Jours avec peu ou pas de pluie',
    frostNote: (c, t) => `Min. prévue : ${c} (seuil de gel ${t}°C)`,
    belowFrostLine: 'sous le seuil de gel',
    dateTag: 'fr-FR', upperMonth: true,
  },
  de: {
    usual48h: 'Üblich 48h', forecast: 'Prognose',
    usualDailyHigh: 'Übl. Tageshöchst', forecast7d: 'Prognose 7T',
    usual14d: 'Üblich 14T', recent14d: 'Aktuell 14T',
    seasonalHeavyRainMark: 'Saisonale Starkregen-Referenz', forecastPeak: 'Prognose-Spitze',
    day: 'Tag', days: 'Tage',
    coldStretch: (n, d) => `Kältephase (${n} ${d})`,
    dryStretch: (n, d) => `Trockenphase (${n} ${d})`,
    frostRiskNight: 'Frostrisiko-Nacht',
    starts: (s) => `beginnt ~${s}`,
    approx: (s) => `~${s}`,
    coldBelow: (t) => `Unter ${t}°C — die übliche Serie ist hier viel kürzer`,
    coldBelowGeneric: 'Unter der lokalen Kälteschwelle',
    dryAtOrBelow: (t) => `Tagesregen bei ${t}mm oder darunter`,
    dryGeneric: 'Tage mit wenig bis keinem Regen',
    frostNote: (c, t) => `Kälteste Prognose: ${c} (Frostgrenze ${t}°C)`,
    belowFrostLine: 'unter der Frostgrenze',
    dateTag: 'de-DE', upperMonth: true,
  },
  zh: {
    usual48h: '常年48h', forecast: '预报',
    usualDailyHigh: '常年日最高', forecast7d: '7天预报',
    usual14d: '常年14天', recent14d: '近14天',
    seasonalHeavyRainMark: '季节性强降雨参考', forecastPeak: '预报峰值',
    day: '天', days: '天',
    coldStretch: (n, d) => `寒冷期（${n}${d}）`,
    dryStretch: (n, d) => `干旱期（${n}${d}）`,
    frostRiskNight: '霜冻风险夜',
    starts: (s) => `约${s}开始`,
    approx: (s) => `约${s}`,
    coldBelow: (t) => `低于${t}°C —— 此地常年连续时间要短得多`,
    coldBelowGeneric: '低于当地寒冷阈值',
    dryAtOrBelow: (t) => `日降雨不超过${t}mm`,
    dryGeneric: '几乎无雨的日子',
    frostNote: (c, t) => `预报最低：${c}（霜冻线${t}°C）`,
    belowFrostLine: '低于霜冻线',
    dateTag: 'zh-CN', upperMonth: false,
  },
};

function num(sd: StructuredData, key: string): number | null {
  const v = sd[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(sd: StructuredData, key: string): string | null {
  const v = sd[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Days between two YYYY-MM-DD date strings (a → b). Returns 0 if either
 * date can't be parsed. Negative when b is before a.
 */
function daysBetween(a: string, b: string): number {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.round((bMs - aMs) / (24 * 60 * 60 * 1000));
}

/**
 * Friendly month-day formatting for the strip's "starts" label.
 * Returns e.g. "MAY 20". Falls back to the raw string if Date.parse
 * can't read it.
 */
function shortDate(iso: string | null, cp: ChartPhrases): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const month = d.toLocaleString(cp.dateTag, { month: 'short', timeZone: 'UTC' });
  const m = cp.upperMonth ? month.toUpperCase() : month;
  return `${m} ${d.getUTCDate()}`;
}

/**
 * Compute where the run starts inside the horizon strip. Uses
 * (run_start_date − evaluatedAt) when both dates are present;
 * otherwise centers the block in the strip. Clamped to keep the run
 * within the horizon bounds.
 */
function clampedRunStart(
  horizonDays: number,
  runLength: number,
  runStartDate: string | null,
  evaluatedAt: string | null,
): number {
  if (runLength >= horizonDays) return 0;
  const desired =
    runStartDate && evaluatedAt
      ? daysBetween(evaluatedAt, runStartDate)
      : Math.floor((horizonDays - runLength) / 2);
  return Math.max(0, Math.min(horizonDays - runLength, desired));
}

/**
 * Build chart inputs for a signal. Returns shape=null when the signal
 * type doesn't have a natural visualization or when required fields
 * are missing from structured_data.
 *
 * `evaluatedAt` is used to position the highlighted run within the
 * forecast horizon for event-shaped signals. Optional; the block
 * centers when missing.
 */
export function getSignalChartData(
  signalTypeId: string,
  structuredData: StructuredData | null | undefined,
  evaluatedAt: string | null = null,
  locale: Locale = 'en',
): SignalChartData {
  const sd = structuredData ?? {};
  const cp = CHART_PHRASES[locale] ?? CHART_PHRASES.en;
  const dayWord = (n: number) => (n === 1 ? cp.day : cp.days);

  // Helpers for axis scaling. We want the axis to comfortably hold
  // both the usual range and the forecast marker with a small visual
  // margin. For temperature axes the lower bound can be the band low
  // minus a couple of degrees; for amount axes (mm) the lower bound is
  // always 0.
  const amountAxis = (
    rangeStart: number,
    rangeEnd: number,
    forecast: number,
  ): { minScale: number; maxScale: number } => {
    const maxOf = Math.max(rangeEnd, forecast);
    return {
      minScale: 0,
      // 15% headroom past whichever is bigger so the marker / band
      // never butts the right edge.
      maxScale: Math.max(rangeStart + 1, maxOf * 1.15),
    };
  };

  const tempAxis = (
    rangeStart: number,
    rangeEnd: number,
    forecast: number,
  ): { minScale: number; maxScale: number } => {
    const minVal = Math.min(rangeStart, forecast);
    const maxVal = Math.max(rangeEnd, forecast);
    return {
      minScale: minVal - 2,
      maxScale: maxVal + 2,
    };
  };

  switch (signalTypeId) {
    case 'rainfall_risk_rising': {
      const median = num(sd, 'baseline_median_mm');
      const p90 = num(sd, 'baseline_p90_mm');
      const forecast = num(sd, 'forecast_48h_mm');
      if (median == null || p90 == null || forecast == null) return { shape: null };
      const { minScale, maxScale } = amountAxis(0, p90, forecast);
      return {
        shape: 'band',
        rangeStart: 0,
        rangeEnd: p90,
        median,
        forecast,
        minScale,
        maxScale,
        unit: 'mm',
        bandLabel: cp.usual48h,
        forecastLabel: cp.forecast,
      };
    }
    case 'heat_stress_window': {
      const median = num(sd, 'baseline_median_c');
      const p90 = num(sd, 'baseline_p90_c');
      const forecast = num(sd, 'forecast_7d_max_avg_c');
      if (median == null || p90 == null || forecast == null) return { shape: null };
      // For temperature we use [median - delta, p90] as a band — there's
      // no natural "0" lower bound, and we want the median visible.
      const span = Math.max(2, p90 - median);
      const rangeStart = median - span;
      const { minScale, maxScale } = tempAxis(rangeStart, p90, forecast);
      return {
        shape: 'band',
        rangeStart,
        rangeEnd: p90,
        median,
        forecast,
        minScale,
        maxScale,
        unit: '°C',
        bandLabel: cp.usualDailyHigh,
        forecastLabel: cp.forecast7d,
      };
    }
    case 'water_recovery_signal': {
      const median = num(sd, 'baseline_median_mm');
      const p75 = num(sd, 'baseline_p75_mm');
      const recent = num(sd, 'recent_14d_sum_mm');
      if (median == null || p75 == null || recent == null) return { shape: null };
      const { minScale, maxScale } = amountAxis(0, p75, recent);
      return {
        shape: 'band',
        rangeStart: 0,
        rangeEnd: p75,
        median,
        forecast: recent,
        minScale,
        maxScale,
        unit: 'mm',
        bandLabel: cp.usual14d,
        forecastLabel: cp.recent14d,
      };
    }
    case 'heavy_rain_event': {
      const median = num(sd, 'baseline_p75_mm') ?? num(sd, 'baseline_median_mm');
      const heavyMark = num(sd, 'baseline_p95_mm');
      const forecast = num(sd, 'wettest_forecast_mm');
      if (median == null || heavyMark == null || forecast == null) return { shape: null };
      const { minScale, maxScale } = amountAxis(0, heavyMark, forecast);
      return {
        shape: 'band',
        rangeStart: 0,
        rangeEnd: heavyMark,
        median,
        forecast,
        minScale,
        maxScale,
        unit: 'mm',
        bandLabel: cp.seasonalHeavyRainMark,
        forecastLabel: cp.forecastPeak,
      };
    }
    case 'consecutive_cold_below': {
      const horizon = Math.max(1, num(sd, 'forecast_horizon_days') ?? 14);
      const runDays = Math.max(1, num(sd, 'observed_run_days') ?? 1);
      const threshold = num(sd, 'threshold_celsius');
      const runStartDate = str(sd, 'run_start_date');
      const runStartIndex = clampedRunStart(
        horizon,
        runDays,
        runStartDate,
        evaluatedAt,
      );
      return {
        shape: 'run-strip',
        horizonDays: horizon,
        runStartIndex,
        runLength: Math.min(runDays, horizon),
        topLabel: cp.coldStretch(runDays, dayWord(runDays)),
        topRightLabel: runStartDate ? cp.starts(shortDate(runStartDate, cp)) : '',
        noteLabel:
          threshold != null ? cp.coldBelow(threshold) : cp.coldBelowGeneric,
      };
    }
    case 'dry_stretch_window': {
      const horizon = Math.max(1, num(sd, 'forecast_horizon_days') ?? 14);
      const runDays = Math.max(1, num(sd, 'observed_run_days') ?? 1);
      const threshold = num(sd, 'threshold_mm');
      const runStartDate = str(sd, 'run_start_date');
      const runStartIndex = clampedRunStart(
        horizon,
        runDays,
        runStartDate,
        evaluatedAt,
      );
      return {
        shape: 'run-strip',
        horizonDays: horizon,
        runStartIndex,
        runLength: Math.min(runDays, horizon),
        topLabel: cp.dryStretch(runDays, dayWord(runDays)),
        topRightLabel: runStartDate ? cp.starts(shortDate(runStartDate, cp)) : '',
        noteLabel:
          threshold != null ? cp.dryAtOrBelow(threshold) : cp.dryGeneric,
      };
    }
    case 'frost_risk': {
      // Frost is a single-day event; render the strip with a 1-day
      // highlight at the coldest forecast date.
      const horizon = Math.max(1, num(sd, 'forecast_horizon_days') ?? 14);
      const threshold = num(sd, 'threshold_celsius') ?? 2;
      const coldDate = str(sd, 'coldest_forecast_date');
      const coldest = num(sd, 'coldest_forecast_celsius');
      const runStartIndex = clampedRunStart(horizon, 1, coldDate, evaluatedAt);
      const coldestStr =
        coldest != null ? `${coldest}°C` : cp.belowFrostLine;
      return {
        shape: 'run-strip',
        horizonDays: horizon,
        runStartIndex,
        runLength: 1,
        topLabel: cp.frostRiskNight,
        topRightLabel: coldDate ? cp.approx(shortDate(coldDate, cp)) : '',
        noteLabel: cp.frostNote(coldestStr, threshold),
      };
    }
    default:
      return { shape: null };
  }
}
