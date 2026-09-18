// kalma/frontend/lib/signal-engine/composer.ts
//
// Turns a stored local_signal row into the rendered card payload
// the UI displays. Headlines are unbranded ("Heavy rainfall risk
// rising"), with attribution in the footer ("Generated through Kalma
// local signal infrastructure").
//
// All text resolves through translation keys at render time so the
// engine output is locale-agnostic.

export type StoredSignal = {
  id: string;
  place_id: string;
  signal_type_id: string;
  status: string;
  severity: 'low' | 'medium' | 'high' | 'extreme' | 'active' | 'strong';
  confidence: number;
  anomaly_score: number;
  affected_groups: string[];
  source_stack: string[];
  structured_data: Record<string, any>;
  valid_from: string;
  valid_until: string;
  evaluated_at: string;
};

export type SignalCard = {
  id: string;
  signalTypeId: string;
  category: string;
  severity: StoredSignal['severity'];
  confidence: number;
  affectedGroups: string[];
  sources: string[]; // pretty source labels
  validFrom: string;
  validUntil: string;
  // Translation keys + interpolation values — UI looks these up
  titleKey: string;
  bodyKey: string;
  bodyValues: Record<string, string | number>;
  // Always the same regardless of signal type
  attributionKey: string;
};

const SOURCE_LABELS: Record<string, string> = {
  'open-meteo': 'Open-Meteo',
  'nasa-power': 'NASA POWER',
  'nasa-firms': 'NASA FIRMS',
  'openaq': 'OpenAQ',
  'copernicus-glofas': 'Copernicus GloFAS',
  'fao-wapor': 'FAO WaPOR',
};

const SIGNAL_TYPE_KEYS: Record<string, { titleKey: string; bodyKey: string; category: string }> = {
  rainfall_risk_rising: {
    titleKey: 'signals.rainfall_risk_rising.title',
    bodyKey: 'signals.rainfall_risk_rising.body',
    category: 'rainfall',
  },
  heat_stress_window: {
    titleKey: 'signals.heat_stress_window.title',
    bodyKey: 'signals.heat_stress_window.body',
    category: 'heat',
  },
  water_recovery_signal: {
    titleKey: 'signals.water_recovery_signal.title',
    bodyKey: 'signals.water_recovery_signal.body',
    category: 'water',
  },
  consecutive_cold_below: {
    titleKey: 'signals.consecutive_cold_below.title',
    bodyKey: 'signals.consecutive_cold_below.body',
    category: 'temperature',
  },
  dry_stretch_window: {
    titleKey: 'signals.dry_stretch_window.title',
    bodyKey: 'signals.dry_stretch_window.body',
    category: 'rainfall',
  },
  frost_risk: {
    titleKey: 'signals.frost_risk.title',
    bodyKey: 'signals.frost_risk.body',
    category: 'temperature',
  },
  heavy_rain_event: {
    titleKey: 'signals.heavy_rain_event.title',
    bodyKey: 'signals.heavy_rain_event.body',
    category: 'rainfall',
  },
};

export function composeCard(signal: StoredSignal): SignalCard {
  const meta = SIGNAL_TYPE_KEYS[signal.signal_type_id] ?? {
    titleKey: `signals.${signal.signal_type_id}.title`,
    bodyKey: `signals.${signal.signal_type_id}.body`,
    category: 'general',
  };

  // Body-key variant for the zero-baseline edge case. The default
  // water_recovery body reads "above the {{baseline_median_mm}}mm
  // typical" — which becomes the awkward "above the 0mm typical" in
  // very arid places where the historical 14-day rain median is
  // genuinely zero. The engine-side floor (MIN_RECENT_14D_MM in
  // evaluator.ts) already prevents Lima-style false positives, but
  // we keep the alternate template as a safety net for semi-arid
  // places that legitimately fire with baseline_median = 0.
  const bodyKey = resolveBodyKey(
    signal.signal_type_id,
    meta.bodyKey,
    signal.structured_data ?? {},
  );

  return {
    id: signal.id,
    signalTypeId: signal.signal_type_id,
    category: meta.category,
    severity: signal.severity,
    confidence: signal.confidence,
    affectedGroups: signal.affected_groups ?? [],
    sources: (signal.source_stack ?? []).map((s) => SOURCE_LABELS[s] ?? s),
    validFrom: signal.valid_from,
    validUntil: signal.valid_until,
    titleKey: meta.titleKey,
    bodyKey,
    // structured_data passed through as interpolation values for the body template
    // e.g. body could be: "Rainfall expected to reach {{forecast_48h_mm}}mm in 48h."
    bodyValues: signal.structured_data ?? {},
    attributionKey: 'signals.attribution.kalma_infrastructure',
  };
}

/**
 * Pick the right body template variant. Most signals use the single
 * default template. A few have alternates for awkward edge cases —
 * e.g. water_recovery in places with a zero rainfall baseline, where
 * "above the 0mm typical" reads badly. Add cases here as needed; the
 * variant key just needs an entry in lib/signal-engine/i18n.ts per
 * locale.
 */
function resolveBodyKey(
  signalTypeId: string,
  defaultKey: string,
  data: Record<string, any>,
): string {
  if (
    signalTypeId === 'water_recovery_signal' &&
    Number(data.baseline_median_mm ?? 0) === 0
  ) {
    return 'signals.water_recovery_signal.body.zero_baseline';
  }

  // heavy_rain_event fires on percentile rank (severity buckets start at p75),
  // so the forecast peak can sit BELOW the p95 shown as "the local heavy-rain
  // reference" — the default body then contradicts its own numbers ("15.1mm —
  // above the reference (15.6mm)"). Use the honest "close to" variant there.
  if (signalTypeId === 'heavy_rain_event') {
    const p95 = Number(data.baseline_p95_mm);
    const peak = Number(data.wettest_forecast_mm);
    if (Number.isFinite(p95) && Number.isFinite(peak) && peak < p95) {
      return 'signals.heavy_rain_event.body.near_reference';
    }
  }

  return defaultKey;
}

/**
 * Severity → display label key + tone color hint.
 * The actual color comes from the design palette at render time.
 */
export function severityMeta(severity: StoredSignal['severity']) {
  switch (severity) {
    case 'extreme':
      return { labelKey: 'signals.severity.extreme', tone: 'critical' };
    case 'high':
      return { labelKey: 'signals.severity.high', tone: 'warning' };
    case 'medium':
      return { labelKey: 'signals.severity.medium', tone: 'caution' };
    case 'low':
      return { labelKey: 'signals.severity.low', tone: 'info' };
    case 'strong':
      return { labelKey: 'signals.severity.strong', tone: 'positive_strong' };
    case 'active':
      return { labelKey: 'signals.severity.active', tone: 'positive' };
    default:
      return { labelKey: 'signals.severity.unknown', tone: 'neutral' };
  }
}
