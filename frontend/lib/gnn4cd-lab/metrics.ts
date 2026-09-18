//kalma/frontend/lib/gnn4cd-lab/metrics.ts

import type { Gnn4cdSample } from './contracts';

export type EventMetrics = {
  threshold_mm_h: number;
  hits: number;
  misses: number;
  false_alarms: number;
  correct_dry: number;
  probability_of_detection: number | null;
  false_alarm_ratio: number | null;
  critical_success_index: number | null;
  f1: number | null;
};

export type Gnn4cdMetrics = {
  sample_count: number;
  coverage_pct: number;
  mae_mm_h: number;
  rmse_mm_h: number;
  bias_mm_h: number;
  pearson_r: number | null;
  baseline_mae_mm_h: number | null;
  mae_gain_vs_baseline_pct: number | null;
  wet_event: EventMetrics;
  heavy_event: EventMetrics;
};

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? round(numerator / denominator) : null;
}

function eventMetrics(samples: Gnn4cdSample[], threshold: number): EventMetrics {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctDry = 0;

  for (const sample of samples) {
    const estimated = sample.estimate_mm_h >= threshold;
    const observed = sample.observation_mm_h >= threshold;
    if (estimated && observed) hits += 1;
    else if (!estimated && observed) misses += 1;
    else if (estimated && !observed) falseAlarms += 1;
    else correctDry += 1;
  }

  return {
    threshold_mm_h: threshold,
    hits,
    misses,
    false_alarms: falseAlarms,
    correct_dry: correctDry,
    probability_of_detection: safeRatio(hits, hits + misses),
    false_alarm_ratio: safeRatio(falseAlarms, hits + falseAlarms),
    critical_success_index: safeRatio(hits, hits + misses + falseAlarms),
    f1: safeRatio(2 * hits, 2 * hits + falseAlarms + misses),
  };
}

export function computeGnn4cdMetrics(
  samples: Gnn4cdSample[],
  expectedSampleCount = samples.length,
): Gnn4cdMetrics {
  if (samples.length === 0) throw new Error('At least one valid sample is required.');

  let absoluteError = 0;
  let squaredError = 0;
  let signedError = 0;
  let estimateSum = 0;
  let observationSum = 0;

  for (const sample of samples) {
    const error = sample.estimate_mm_h - sample.observation_mm_h;
    absoluteError += Math.abs(error);
    squaredError += error ** 2;
    signedError += error;
    estimateSum += sample.estimate_mm_h;
    observationSum += sample.observation_mm_h;
  }

  const meanEstimate = estimateSum / samples.length;
  const meanObservation = observationSum / samples.length;
  let covariance = 0;
  let estimateVariance = 0;
  let observationVariance = 0;
  for (const sample of samples) {
    const estimateDelta = sample.estimate_mm_h - meanEstimate;
    const observationDelta = sample.observation_mm_h - meanObservation;
    covariance += estimateDelta * observationDelta;
    estimateVariance += estimateDelta ** 2;
    observationVariance += observationDelta ** 2;
  }

  const correlationDenominator = Math.sqrt(estimateVariance * observationVariance);
  const baselineSamples = samples.filter((sample) => sample.baseline_mm_h != null);
  const baselineMae = baselineSamples.length
    ? baselineSamples.reduce(
        (sum, sample) => sum + Math.abs(sample.baseline_mm_h! - sample.observation_mm_h),
        0,
      ) / baselineSamples.length
    : null;
  const mae = absoluteError / samples.length;

  return {
    sample_count: samples.length,
    coverage_pct: round((samples.length / Math.max(expectedSampleCount, samples.length)) * 100, 2),
    mae_mm_h: round(mae),
    rmse_mm_h: round(Math.sqrt(squaredError / samples.length)),
    bias_mm_h: round(signedError / samples.length),
    pearson_r: correlationDenominator > 0 ? round(covariance / correlationDenominator) : null,
    baseline_mae_mm_h: baselineMae == null ? null : round(baselineMae),
    mae_gain_vs_baseline_pct:
      baselineMae == null || baselineMae === 0
        ? null
        : round((1 - mae / baselineMae) * 100, 2),
    wet_event: eventMetrics(samples, 0.1),
    heavy_event: eventMetrics(samples, 5),
  };
}

export function percentile(values: number[], quantile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return round(sorted[index], 2);
}
