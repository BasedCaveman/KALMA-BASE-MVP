//kalma/frontend/lib/gnn4cd-lab/contracts.ts

import { z } from 'zod';

export const GNN4CD_CONTRACT_VERSION = 'kalma.gnn4cd.backtest.v1' as const;

const finiteNumber = z.number().finite();

export const gnn4cdSampleSchema = z.object({
  valid_time: z.string().datetime({ offset: true }),
  latitude: finiteNumber.min(-90).max(90).optional(),
  longitude: finiteNumber.min(-180).max(180).optional(),
  estimate_mm_h: finiteNumber.nonnegative(),
  observation_mm_h: finiteNumber.nonnegative(),
  baseline_mm_h: finiteNumber.nonnegative().optional(),
});

export const gnn4cdResultSchema = z.object({
  contract_version: z.literal(GNN4CD_CONTRACT_VERSION),
  model: z.object({
    name: z.literal('GNN4CD'),
    version: z.string().min(1).max(120),
    upstream_commit: z.string().regex(/^[0-9a-f]{40}$/),
    checkpoint_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    trained_region: z.string().min(1).max(160),
  }),
  runner: z.object({
    version: z.string().min(1).max(120),
  }),
  request: z.object({
    place_name: z.string().min(1).max(160),
    latitude: finiteNumber.min(-90).max(90),
    longitude: finiteNumber.min(-180).max(180),
    period_start: z.string().datetime({ offset: true }),
    period_end: z.string().datetime({ offset: true }),
  }),
  provenance: z.object({
    input_source: z.string().min(1).max(200),
    observation_source: z.string().min(1).max(200),
    baseline_source: z.string().min(1).max(200).optional(),
    input_resolution_km: finiteNumber.positive(),
    output_resolution_km: finiteNumber.positive(),
    notes: z.array(z.string().max(500)).max(20).default([]),
  }),
  runtime: z.object({
    device: z.string().min(1).max(120),
    cold_start: z.boolean(),
    queue_ms: finiteNumber.nonnegative().optional(),
    data_fetch_ms: finiteNumber.nonnegative().optional(),
    model_load_ms: finiteNumber.nonnegative().optional(),
    inference_ms: finiteNumber.nonnegative(),
    total_ms: finiteNumber.nonnegative(),
    peak_memory_mb: finiteNumber.nonnegative().optional(),
    repetitions: z.number().int().min(1).max(100).optional(),
    successful_repetitions: z.number().int().min(0).max(100).optional(),
    p50_inference_ms: finiteNumber.nonnegative().optional(),
    p95_inference_ms: finiteNumber.nonnegative().optional(),
    max_repeat_delta_mm_h: finiteNumber.nonnegative().optional(),
  }).refine(
    (value) =>
      value.repetitions == null ||
      value.successful_repetitions == null ||
      value.successful_repetitions <= value.repetitions,
    {
      message: 'successful_repetitions cannot exceed repetitions.',
      path: ['successful_repetitions'],
    },
  ),
  expected_sample_count: z.number().int().positive().max(10_000),
  samples: z.array(gnn4cdSampleSchema).min(24).max(10_000),
}).refine((value) => value.expected_sample_count >= value.samples.length, {
  message: 'expected_sample_count cannot be smaller than the returned sample count.',
  path: ['expected_sample_count'],
});

export const gnn4cdRunnerRequestSchema = z
  .object({
    mode: z.literal('runner'),
    place_name: z.string().trim().min(1).max(160),
    latitude: finiteNumber.min(-90).max(90),
    longitude: finiteNumber.min(-180).max(180),
    period_start: z.string().datetime({ offset: true }),
    period_end: z.string().datetime({ offset: true }),
  })
  .refine((value) => new Date(value.period_end) > new Date(value.period_start), {
    message: 'period_end must be after period_start',
    path: ['period_end'],
  })
  .refine(
    (value) =>
      new Date(value.period_end).getTime() - new Date(value.period_start).getTime() <=
      31 * 86_400_000,
    {
      message: 'The first lab version accepts windows up to 31 days.',
      path: ['period_end'],
    },
  );

export const gnn4cdImportRequestSchema = z.object({
  mode: z.literal('import'),
  result: gnn4cdResultSchema,
});

export const gnn4cdRunRequestSchema = z.discriminatedUnion('mode', [
  gnn4cdRunnerRequestSchema,
  gnn4cdImportRequestSchema,
]);

export type Gnn4cdResult = z.infer<typeof gnn4cdResultSchema>;
export type Gnn4cdSample = z.infer<typeof gnn4cdSampleSchema>;
export type Gnn4cdRunnerRequest = z.infer<typeof gnn4cdRunnerRequestSchema>;
