//kalma/frontend/lib/server/gnn4cd-lab.ts

import { createClient } from '@supabase/supabase-js';
import {
  gnn4cdResultSchema,
  type Gnn4cdResult,
  type Gnn4cdRunnerRequest,
} from '@/lib/gnn4cd-lab/contracts';
import { computeGnn4cdMetrics, percentile, type Gnn4cdMetrics } from '@/lib/gnn4cd-lab/metrics';

const RUNNER_TIMEOUT_MS = 250_000;

export type Gnn4cdRunRow = {
  id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  origin: 'runner' | 'import';
  place_name: string;
  latitude: number;
  longitude: number;
  period_start: string;
  period_end: string;
  model_name: string | null;
  model_version: string | null;
  upstream_commit: string | null;
  checkpoint_sha256: string | null;
  runner_version: string | null;
  sample_count: number;
  metrics: Gnn4cdMetrics | null;
  runtime: Gnn4cdResult['runtime'] | null;
  provenance: Gnn4cdResult['provenance'] | null;
  error_code: string | null;
  error_message: string | null;
};

export type Gnn4cdReliability = {
  measured_runs: number;
  completed_runs: number;
  failed_runs: number;
  success_rate_pct: number | null;
  p50_total_ms: number | null;
  p95_total_ms: number | null;
};

export function getGnn4cdLabAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function runnerConfig() {
  const url = process.env.GNN4CD_RUNNER_URL?.replace(/\/$/, '') || null;
  const secret = process.env.GNN4CD_RUNNER_SECRET || null;
  return { url, secret, configured: Boolean(url && secret) };
}

export function getGnn4cdLabCapabilities() {
  return {
    database_configured: getGnn4cdLabAdminClient() != null,
    runner_configured: runnerConfig().configured,
    import_enabled: true,
  };
}

function reliabilityFor(rows: Gnn4cdRunRow[]): Gnn4cdReliability {
  const measured = rows.filter((row) => row.status === 'completed' || row.status === 'failed');
  const completed = measured.filter((row) => row.status === 'completed');
  const failed = measured.filter((row) => row.status === 'failed');
  const totalDurations = completed
    .map((row) => row.runtime?.total_ms)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    measured_runs: measured.length,
    completed_runs: completed.length,
    failed_runs: failed.length,
    success_rate_pct: measured.length ? Math.round((completed.length / measured.length) * 10_000) / 100 : null,
    p50_total_ms: percentile(totalDurations, 0.5),
    p95_total_ms: percentile(totalDurations, 0.95),
  };
}

export async function listGnn4cdRuns(limit = 30) {
  const supabase = getGnn4cdLabAdminClient();
  if (!supabase) throw new Error('Supabase service access is not configured.');
  const { data, error } = await supabase
    .from('gnn4cd_experiment_runs')
    .select(
      'id, created_at, started_at, completed_at, status, origin, place_name, latitude, longitude, period_start, period_end, model_name, model_version, upstream_commit, checkpoint_sha256, runner_version, sample_count, metrics, runtime, provenance, error_code, error_message',
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Gnn4cdRunRow[];
  return { runs: rows, reliability: reliabilityFor(rows) };
}

function baseRun(result: Gnn4cdResult, origin: 'runner' | 'import') {
  return {
    status: 'completed',
    origin,
    started_at: new Date(Date.now() - result.runtime.total_ms).toISOString(),
    completed_at: new Date().toISOString(),
    place_name: result.request.place_name,
    latitude: result.request.latitude,
    longitude: result.request.longitude,
    period_start: result.request.period_start,
    period_end: result.request.period_end,
    contract_version: result.contract_version,
    model_name: result.model.name,
    model_version: result.model.version,
    upstream_commit: result.model.upstream_commit,
    checkpoint_sha256: result.model.checkpoint_sha256,
    runner_version: result.runner.version,
    sample_count: result.samples.length,
    metrics: computeGnn4cdMetrics(result.samples, result.expected_sample_count),
    runtime: result.runtime,
    provenance: result.provenance,
    request_payload: result.request,
    result_payload: result,
  };
}

export async function importGnn4cdResult(result: Gnn4cdResult) {
  const supabase = getGnn4cdLabAdminClient();
  if (!supabase) throw new Error('Supabase service access is not configured.');
  const parsed = gnn4cdResultSchema.parse(result);
  const { data, error } = await supabase
    .from('gnn4cd_experiment_runs')
    .insert(baseRun(parsed, 'import'))
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not store the imported run.');
  return data.id as string;
}

async function markRunFailed(runId: string, error: unknown) {
  const supabase = getGnn4cdLabAdminClient();
  if (!supabase) return;
  const message = error instanceof Error ? error.message : String(error);
  await supabase
    .from('gnn4cd_experiment_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_code: error instanceof DOMException && error.name === 'AbortError' ? 'runner_timeout' : 'runner_failed',
      error_message: message.slice(0, 2000),
    })
    .eq('id', runId);
}

export async function runGnn4cdBacktest(request: Gnn4cdRunnerRequest) {
  const supabase = getGnn4cdLabAdminClient();
  if (!supabase) throw new Error('Supabase service access is not configured.');
  const runner = runnerConfig();
  if (!runner.configured || !runner.url || !runner.secret) {
    throw new Error('The GNN4CD runner is not configured.');
  }

  const startedAt = new Date().toISOString();
  const { data: queued, error: queueError } = await supabase
    .from('gnn4cd_experiment_runs')
    .insert({
      status: 'running',
      origin: 'runner',
      started_at: startedAt,
      place_name: request.place_name,
      latitude: request.latitude,
      longitude: request.longitude,
      period_start: request.period_start,
      period_end: request.period_end,
      request_payload: request,
    })
    .select('id')
    .single();
  if (queueError || !queued) throw new Error(queueError?.message ?? 'Could not create the run.');

  const runId = queued.id as string;
  try {
    const response = await fetch(`${runner.url}/v1/backtests`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${runner.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(RUNNER_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`Runner returned ${response.status}: ${detail}`);
    }
    const result = gnn4cdResultSchema.parse(await response.json());

    const coordinateDelta =
      Math.abs(result.request.latitude - request.latitude) +
      Math.abs(result.request.longitude - request.longitude);
    if (
      result.request.place_name !== request.place_name ||
      result.request.period_start !== request.period_start ||
      result.request.period_end !== request.period_end ||
      coordinateDelta > 0.000_001
    ) {
      throw new Error('Runner response does not match the requested place and period.');
    }

    const completed = baseRun(result, 'runner');
    const { error: updateError } = await supabase
      .from('gnn4cd_experiment_runs')
      .update(completed)
      .eq('id', runId);
    if (updateError) throw new Error(updateError.message);
    return runId;
  } catch (error) {
    await markRunFailed(runId, error);
    throw error;
  }
}

export async function checkGnn4cdRunnerHealth() {
  const runner = runnerConfig();
  if (!runner.configured || !runner.url || !runner.secret) {
    return { ok: false, configured: false, error: 'runner_not_configured' };
  }
  try {
    const startedAt = Date.now();
    const response = await fetch(`${runner.url}/health`, {
      headers: { authorization: `Bearer ${runner.secret}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      configured: true,
      latency_ms: Date.now() - startedAt,
      runner: body,
      error: response.ok ? null : `runner_http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
