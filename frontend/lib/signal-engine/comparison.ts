// kalma/frontend/lib/signal-engine/comparison.ts
//
// "Layer 2" support data for a signal — a compact `usual vs now` pair
// that gives credibility to the prose without dragging percentile /
// anomaly / sigma jargon into the visible card.
//
// Surfaces in SignalCard as a small mono-font strip below the body
// paragraph. Statistical fields (percentile, sample_size, anomaly
// score) stay inside structured_data for advanced surfaces but never
// reach the user-facing title or body.
//
// Returns null when the signal type doesn't have a natural two-number
// comparison (or when the required structured_data fields are missing).
//
// Labels are localized across the 6 supported languages; numeric values
// (with °C / mm units) stay locale-neutral. The default 'en' output is
// unchanged from the pre-i18n version.

import type { Locale } from './i18n';

export type SignalComparison = {
  /** e.g. "Usual 48h rain" */
  usualLabel: string;
  /** e.g. "8mm" */
  usualValue: string;
  /** e.g. "Forecast" */
  nowLabel: string;
  /** e.g. "22mm" */
  nowValue: string;
};

type StructuredData = Record<string, any>;

// Per-locale label + "day/days" strings. Keyed by an internal label id so
// the number-formatting logic below stays shared across languages.
type LabelId =
  | 'usual48hRain'
  | 'forecast'
  | 'usualAvgHigh'
  | 'forecast7d'
  | 'usual14dRain'
  | 'recent'
  | 'coldThreshold'
  | 'forecastRun'
  | 'dryDayMeans'
  | 'dryRun'
  | 'frostLine'
  | 'coldestForecast'
  | 'seasonalHeavyRainMark'
  | 'forecastPeak';

type ComparisonPhrases = {
  labels: Record<LabelId, string>;
  /** singular / plural day word for run-length values */
  day: string;
  days: string;
  /** "≤{n}mm rain" for the dry-stretch usual value */
  dryDayValue: (mm: number) => string;
};

const PHRASES: Record<Locale, ComparisonPhrases> = {
  en: {
    labels: {
      usual48hRain: 'Usual 48h rain', forecast: 'Forecast',
      usualAvgHigh: 'Usual avg high', forecast7d: 'Forecast 7d',
      usual14dRain: 'Usual 14d rain', recent: 'Recent',
      coldThreshold: 'Cold threshold', forecastRun: 'Forecast run',
      dryDayMeans: 'Dry day means', dryRun: 'Dry run',
      frostLine: 'Frost line', coldestForecast: 'Coldest forecast',
      seasonalHeavyRainMark: 'Seasonal heavy-rain mark', forecastPeak: 'Forecast peak',
    },
    day: 'day', days: 'days',
    dryDayValue: (mm) => `≤${mm}mm rain`,
  },
  pt: {
    labels: {
      usual48hRain: 'Chuva normal 48h', forecast: 'Previsão',
      usualAvgHigh: 'Máx. média normal', forecast7d: 'Previsão 7d',
      usual14dRain: 'Chuva normal 14d', recent: 'Recente',
      coldThreshold: 'Limite de frio', forecastRun: 'Sequência prevista',
      dryDayMeans: 'Dia seco é', dryRun: 'Sequência seca',
      frostLine: 'Linha de geada', coldestForecast: 'Mínima prevista',
      seasonalHeavyRainMark: 'Referência sazonal de chuva forte', forecastPeak: 'Pico previsto',
    },
    day: 'dia', days: 'dias',
    dryDayValue: (mm) => `≤${mm}mm de chuva`,
  },
  es: {
    labels: {
      usual48hRain: 'Lluvia normal 48h', forecast: 'Pronóstico',
      usualAvgHigh: 'Máx. media normal', forecast7d: 'Pronóstico 7d',
      usual14dRain: 'Lluvia normal 14d', recent: 'Reciente',
      coldThreshold: 'Umbral de frío', forecastRun: 'Racha prevista',
      dryDayMeans: 'Día seco es', dryRun: 'Racha seca',
      frostLine: 'Línea de helada', coldestForecast: 'Mínima prevista',
      seasonalHeavyRainMark: 'Referencia estacional de lluvia fuerte', forecastPeak: 'Pico previsto',
    },
    day: 'día', days: 'días',
    dryDayValue: (mm) => `≤${mm}mm de lluvia`,
  },
  fr: {
    labels: {
      usual48hRain: 'Pluie normale 48h', forecast: 'Prévision',
      usualAvgHigh: 'Max. moy. normale', forecast7d: 'Prévision 7j',
      usual14dRain: 'Pluie normale 14j', recent: 'Récent',
      coldThreshold: 'Seuil de froid', forecastRun: 'Série prévue',
      dryDayMeans: 'Jour sec =', dryRun: 'Série sèche',
      frostLine: 'Seuil de gel', coldestForecast: 'Min. prévue',
      seasonalHeavyRainMark: 'Référence saisonnière de fortes pluies', forecastPeak: 'Pic prévu',
    },
    day: 'jour', days: 'jours',
    dryDayValue: (mm) => `≤${mm}mm de pluie`,
  },
  de: {
    labels: {
      usual48hRain: 'Übliche 48h-Regen', forecast: 'Prognose',
      usualAvgHigh: 'Übl. Ø-Höchstwert', forecast7d: 'Prognose 7T',
      usual14dRain: 'Übliche 14T-Regen', recent: 'Aktuell',
      coldThreshold: 'Kälteschwelle', forecastRun: 'Prognose-Serie',
      dryDayMeans: 'Trockentag heißt', dryRun: 'Trockenserie',
      frostLine: 'Frostgrenze', coldestForecast: 'Kälteste Prognose',
      seasonalHeavyRainMark: 'Saisonale Starkregen-Referenz', forecastPeak: 'Prognose-Spitze',
    },
    day: 'Tag', days: 'Tage',
    dryDayValue: (mm) => `≤${mm}mm Regen`,
  },
  zh: {
    labels: {
      usual48hRain: '常年48h降雨', forecast: '预报',
      usualAvgHigh: '常年平均最高', forecast7d: '7天预报',
      usual14dRain: '常年14天降雨', recent: '近期',
      coldThreshold: '寒冷阈值', forecastRun: '预报连续',
      dryDayMeans: '干燥日指', dryRun: '干燥连续',
      frostLine: '霜冻线', coldestForecast: '预报最低',
      seasonalHeavyRainMark: '季节性强降雨参考', forecastPeak: '预报峰值',
    },
    day: '天', days: '天',
    dryDayValue: (mm) => `≤${mm}mm 降雨`,
  },
};

export function getSignalComparison(
  signalTypeId: string,
  structuredData: StructuredData | null | undefined,
  locale: Locale = 'en',
): SignalComparison | null {
  const sd = structuredData ?? {};
  const p = PHRASES[locale] ?? PHRASES.en;
  const dayWord = (n: number) => (n === 1 ? p.day : p.days);

  const num = (k: string): number | null => {
    const v = sd[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const parsed = Number(v);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  switch (signalTypeId) {
    case 'rainfall_risk_rising': {
      const usual = num('baseline_median_mm');
      const now = num('forecast_48h_mm');
      if (usual == null || now == null) return null;
      return {
        usualLabel: p.labels.usual48hRain,
        usualValue: `${usual}mm`,
        nowLabel: p.labels.forecast,
        nowValue: `${now}mm`,
      };
    }
    case 'heat_stress_window': {
      const usual = num('baseline_median_c');
      const now = num('forecast_7d_max_avg_c');
      if (usual == null || now == null) return null;
      return {
        usualLabel: p.labels.usualAvgHigh,
        usualValue: `${usual}°C`,
        nowLabel: p.labels.forecast7d,
        nowValue: `${now}°C`,
      };
    }
    case 'water_recovery_signal': {
      const usual = num('baseline_median_mm');
      const now = num('recent_14d_sum_mm');
      if (usual == null || now == null) return null;
      return {
        usualLabel: p.labels.usual14dRain,
        usualValue: `${usual}mm`,
        nowLabel: p.labels.recent,
        nowValue: `${now}mm`,
      };
    }
    case 'consecutive_cold_below': {
      const threshold = num('threshold_celsius');
      const runDays = num('observed_run_days');
      if (threshold == null || runDays == null) return null;
      return {
        usualLabel: p.labels.coldThreshold,
        usualValue: `${threshold}°C`,
        nowLabel: p.labels.forecastRun,
        nowValue: `${runDays} ${dayWord(runDays)}`,
      };
    }
    case 'dry_stretch_window': {
      const threshold = num('threshold_mm');
      const runDays = num('observed_run_days');
      if (threshold == null || runDays == null) return null;
      return {
        usualLabel: p.labels.dryDayMeans,
        usualValue: p.dryDayValue(threshold),
        nowLabel: p.labels.dryRun,
        nowValue: `${runDays} ${dayWord(runDays)}`,
      };
    }
    case 'frost_risk': {
      const threshold = num('threshold_celsius');
      const coldest = num('coldest_forecast_celsius');
      if (threshold == null || coldest == null) return null;
      return {
        usualLabel: p.labels.frostLine,
        usualValue: `${threshold}°C`,
        nowLabel: p.labels.coldestForecast,
        nowValue: `${coldest}°C`,
      };
    }
    case 'heavy_rain_event': {
      // "Heavy-rain mark" deliberately avoids saying "95th percentile."
      // The number IS the p95 historically, but the user should read it
      // as a reference point for this season, not as the all-time max
      // rain the place can ever receive.
      const heavyMark = num('baseline_p95_mm');
      const peak = num('wettest_forecast_mm');
      if (heavyMark == null || peak == null) return null;
      return {
        usualLabel: p.labels.seasonalHeavyRainMark,
        usualValue: `${heavyMark}mm`,
        nowLabel: p.labels.forecastPeak,
        nowValue: `${peak}mm`,
      };
    }
    default:
      return null;
  }
}
