//kalma/frontend/app/operator-console-9f3x/gnn4cd-lab/Gnn4cdLabClient.tsx

'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import type { Gnn4cdMetrics } from '@/lib/gnn4cd-lab/metrics';

type RunRow = {
  id: string;
  created_at: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  origin: 'runner' | 'import';
  place_name: string;
  period_start: string;
  period_end: string;
  model_version: string | null;
  checkpoint_sha256: string | null;
  sample_count: number;
  metrics: Gnn4cdMetrics | null;
  runtime: {
    total_ms?: number;
    inference_ms?: number;
    device?: string;
    repetitions?: number;
    successful_repetitions?: number;
    p50_inference_ms?: number;
    p95_inference_ms?: number;
    max_repeat_delta_mm_h?: number;
  } | null;
  provenance: {
    input_source?: string;
    observation_source?: string;
    baseline_source?: string;
  } | null;
  error_code: string | null;
  error_message: string | null;
};

type Reliability = {
  measured_runs: number;
  completed_runs: number;
  failed_runs: number;
  success_rate_pct: number | null;
  p50_total_ms: number | null;
  p95_total_ms: number | null;
};

type LabStatus = {
  capabilities: {
    database_configured: boolean;
    runner_configured: boolean;
    import_enabled: boolean;
  };
  runner_health: {
    ok: boolean;
    configured: boolean;
    latency_ms?: number;
    error?: string | null;
  };
};

const panel: CSSProperties = {
  padding: 20,
  border: '1px solid #2A4131',
  borderRadius: 20,
  background: '#162019',
  boxShadow: '8px 8px 22px #08100B, -6px -6px 18px #223328',
};

const input: CSSProperties = {
  width: '100%',
  minHeight: 48,
  boxSizing: 'border-box',
  padding: '0 12px',
  border: '1px solid #35523D',
  borderRadius: 11,
  background: '#0D1710',
  color: '#E9E2D6',
  fontSize: 15,
};

const label: CSSProperties = {
  display: 'block',
  marginBottom: 7,
  color: '#BFB6A8',
  fontSize: 13,
};

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatNumber(value: number | null | undefined, suffix = '') {
  return value == null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`;
}

function MetricCard({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, background: '#101A13', border: '1px solid #26392C' }}>
      <div style={{ color: '#948B7D', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {name}
      </div>
      <div style={{ marginTop: 5, fontFamily: 'var(--font-mono), monospace', fontSize: 22, color: '#E9E2D6' }}>
        {value}
      </div>
      {note ? <div style={{ color: '#948B7D', fontSize: 11, marginTop: 4 }}>{note}</div> : null}
    </div>
  );
}

function RunCard({ run }: { run: RunRow }) {
  const metrics = run.metrics;
  const statusColor = run.status === 'completed' ? '#79C98F' : run.status === 'failed' ? '#E4957D' : '#C8A84A';
  return (
    <article style={{ ...panel, boxShadow: 'none', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 750 }}>{run.place_name}</div>
          <div style={{ color: '#948B7D', fontSize: 12, marginTop: 4 }}>
            {new Date(run.period_start).toLocaleString('pt-BR')} → {new Date(run.period_end).toLocaleString('pt-BR')}
          </div>
        </div>
        <div style={{ color: statusColor, fontFamily: 'var(--font-mono), monospace', fontSize: 12 }}>
          {run.status.toUpperCase()} · {run.origin}
        </div>
      </div>

      {run.status === 'completed' && metrics ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: 9, marginTop: 14 }}>
            <MetricCard name="MAE" value={formatNumber(metrics.mae_mm_h, ' mm/h')} />
            <MetricCard name="RMSE" value={formatNumber(metrics.rmse_mm_h, ' mm/h')} />
            <MetricCard name="Bias" value={formatNumber(metrics.bias_mm_h, ' mm/h')} />
            <MetricCard name="Wet CSI" value={formatNumber(metrics.wet_event.critical_success_index)} />
            <MetricCard name="Correlation" value={formatNumber(metrics.pearson_r)} />
            <MetricCard name="Coverage" value={formatNumber(metrics.coverage_pct, '%')} />
          </div>
          <div style={{ marginTop: 12, color: '#BFB6A8', fontSize: 12, lineHeight: 1.6 }}>
            <div>Model: {run.model_version ?? '—'} · checkpoint {run.checkpoint_sha256?.slice(0, 12) ?? '—'}</div>
            <div>Input: {run.provenance?.input_source ?? '—'}</div>
            <div>Observation: {run.provenance?.observation_source ?? '—'}</div>
            <div>Baseline: {run.provenance?.baseline_source ?? 'not supplied'}</div>
            <div>
              {run.sample_count.toLocaleString('pt-BR')} samples · {formatNumber(run.runtime?.total_ms, ' ms total')} · {run.runtime?.device ?? 'device not reported'}
            </div>
            {run.runtime?.repetitions ? (
              <div>
                Repeatability: {run.runtime.successful_repetitions ?? 0}/{run.runtime.repetitions} successful · p50 {formatNumber(run.runtime.p50_inference_ms, ' ms')} · p95 {formatNumber(run.runtime.p95_inference_ms, ' ms')} · max delta {formatNumber(run.runtime.max_repeat_delta_mm_h, ' mm/h')}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {run.status === 'failed' ? (
        <div role="alert" style={{ marginTop: 12, color: '#F0C7B8', background: '#402B22', borderRadius: 10, padding: 10, fontSize: 13 }}>
          {run.error_code}: {run.error_message}
        </div>
      ) : null}
    </article>
  );
}

export default function Gnn4cdLabClient() {
  const defaultEnd = useMemo(() => new Date(Date.now() - 5 * 86_400_000), []);
  const defaultStart = useMemo(() => new Date(defaultEnd.getTime() - 3 * 86_400_000), [defaultEnd]);
  const [placeName, setPlaceName] = useState('Carrancas, MG, Brazil');
  const [latitude, setLatitude] = useState('-21.489');
  const [longitude, setLongitude] = useState('-44.644');
  const [periodStart, setPeriodStart] = useState(toLocalInput(defaultStart));
  const [periodEnd, setPeriodEnd] = useState(toLocalInput(defaultEnd));
  const [importText, setImportText] = useState('');
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [working, setWorking] = useState<'runner' | 'import' | 'refresh' | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setWorking('refresh');
    setMessage('');
    try {
      const [runsResponse, statusResponse] = await Promise.all([
        fetch('/api/internal/gnn4cd-lab/runs', { cache: 'no-store' }),
        fetch('/api/internal/gnn4cd-lab/status', { cache: 'no-store' }),
      ]);
      const runsBody = await runsResponse.json();
      const statusBody = await statusResponse.json();
      if (!runsResponse.ok) throw new Error(runsBody.message ?? runsBody.error ?? 'Could not load runs.');
      if (!statusResponse.ok) throw new Error(statusBody.message ?? statusBody.error ?? 'Could not load status.');
      setRuns(runsBody.runs ?? []);
      setReliability(runsBody.reliability ?? null);
      setStatus(statusBody);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!quiet) setWorking(null);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  async function submit(payload: unknown, mode: 'runner' | 'import') {
    setWorking(mode);
    setMessage('');
    try {
      const response = await fetch('/api/internal/gnn4cd-lab/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(body.message)
          ? body.message.map((issue: { message?: string }) => issue.message).filter(Boolean).join(' · ')
          : body.message;
        throw new Error(detail || body.error || 'Run failed.');
      }
      if (mode === 'import') setImportText('');
      setMessage(`Stored run ${body.run_id}.`);
      await refresh(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(null);
    }
  }

  function handleRunner(event: FormEvent) {
    event.preventDefault();
    void submit(
      {
        mode: 'runner',
        place_name: placeName,
        latitude: Number(latitude),
        longitude: Number(longitude),
        period_start: new Date(periodStart).toISOString(),
        period_end: new Date(periodEnd).toISOString(),
      },
      'runner',
    );
  }

  function handleImport(event: FormEvent) {
    event.preventDefault();
    try {
      void submit({ mode: 'import', result: JSON.parse(importText) }, 'import');
    } catch {
      setMessage('Imported content is not valid JSON.');
    }
  }

  const button: CSSProperties = {
    minHeight: 50,
    border: 0,
    borderRadius: 13,
    padding: '0 18px',
    background: '#5AAF72',
    color: '#08100B',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  };

  return (
    <div style={{ width: 'min(1060px, 100%)', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ color: '#C8A84A', fontSize: 12, letterSpacing: '0.14em' }}>PRIVATE · RESEARCH ONLY</div>
          <h1 style={{ margin: '8px 0 5px', fontFamily: 'var(--font-display), serif', fontSize: 'clamp(30px, 5vw, 48px)' }}>
            GNN4CD evaluation lab
          </h1>
          <p style={{ margin: 0, color: '#BFB6A8', maxWidth: 720, lineHeight: 1.55 }}>
            Regional backtests for model accuracy and operational reliability. Results here are evidence, not public weather-risk signals.
          </p>
        </div>
        <form method="post" action="/operator-console-9f3x/gnn4cd-lab/access">
          <input type="hidden" name="action" value="logout" />
          <button type="submit" style={{ ...button, background: '#1E2D24', color: '#BFB6A8', border: '1px solid #35523D' }}>
            Close lab
          </button>
        </form>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10, marginBottom: 18 }}>
        <MetricCard name="Runner" value={status?.runner_health.ok ? 'Healthy' : status?.capabilities.runner_configured ? 'Unavailable' : 'Not configured'} note={status?.runner_health.latency_ms ? `${status.runner_health.latency_ms} ms health check` : undefined} />
        <MetricCard name="Measured runs" value={formatNumber(reliability?.measured_runs)} />
        <MetricCard name="Success rate" value={formatNumber(reliability?.success_rate_pct, '%')} />
        <MetricCard name="p50 total" value={formatNumber(reliability?.p50_total_ms, ' ms')} />
        <MetricCard name="p95 total" value={formatNumber(reliability?.p95_total_ms, ' ms')} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 18 }}>
        <section style={panel}>
          <h2 style={{ margin: '0 0 6px', fontSize: 21 }}>Run a regional backtest</h2>
          <p style={{ margin: '0 0 18px', color: '#948B7D', lineHeight: 1.5, fontSize: 13 }}>
            Calls the isolated Python runner. The first version limits each request to 31 days.
          </p>
          <form onSubmit={handleRunner}>
            <div style={{ marginBottom: 12 }}>
              <label style={label} htmlFor="place-name">Place</label>
              <input id="place-name" style={input} value={placeName} onChange={(event) => setPlaceName(event.target.value)} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={label} htmlFor="latitude">Latitude</label>
                <input id="latitude" style={input} type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => setLatitude(event.target.value)} required />
              </div>
              <div>
                <label style={label} htmlFor="longitude">Longitude</label>
                <input id="longitude" style={input} type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => setLongitude(event.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={label} htmlFor="period-start">Start</label>
                <input id="period-start" style={input} type="datetime-local" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required />
              </div>
              <div>
                <label style={label} htmlFor="period-end">End</label>
                <input id="period-end" style={input} type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required />
              </div>
            </div>
            <button
              type="submit"
              style={{ ...button, width: '100%', opacity: status?.capabilities.runner_configured ? 1 : 0.45 }}
              disabled={working != null || !status?.capabilities.runner_configured}
            >
              {working === 'runner' ? 'Running…' : 'Run GNN4CD backtest'}
            </button>
          </form>
        </section>

        <section style={panel}>
          <h2 style={{ margin: '0 0 6px', fontSize: 21 }}>Import official runner output</h2>
          <p style={{ margin: '0 0 18px', color: '#948B7D', lineHeight: 1.5, fontSize: 13 }}>
            Paste the v1 JSON contract. Kalma validates the checkpoint identity and recomputes every metric before storage.
          </p>
          <form onSubmit={handleImport}>
            <label style={label} htmlFor="import-json">Run JSON</label>
            <textarea
              id="import-json"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="{ &quot;contract_version&quot;: &quot;kalma.gnn4cd.backtest.v1&quot;, ... }"
              required
              spellCheck={false}
              style={{ ...input, minHeight: 226, padding: 12, resize: 'vertical', fontFamily: 'var(--font-mono), monospace', fontSize: 12, lineHeight: 1.5 }}
            />
            <button type="submit" style={{ ...button, width: '100%', marginTop: 12 }} disabled={working != null}>
              {working === 'import' ? 'Validating…' : 'Validate and store run'}
            </button>
          </form>
        </section>
      </div>

      <section style={{ ...panel, marginTop: 18, boxShadow: 'none', background: '#101A13' }}>
        <strong style={{ color: '#C8A84A' }}>Source boundaries</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 10, color: '#BFB6A8', fontSize: 13, lineHeight: 1.5 }}>
          <div><b style={{ color: '#E9E2D6' }}>Model estimate</b><br />GNN4CD output tied to a checkpoint hash.</div>
          <div><b style={{ color: '#E9E2D6' }}>Observation</b><br />Independent recorded-rain reference.</div>
          <div><b style={{ color: '#E9E2D6' }}>Baseline</b><br />Coarse public grid used only for comparison.</div>
          <div><b style={{ color: '#E9E2D6' }}>Operational evidence</b><br />Latency, memory, failures, and sample coverage.</div>
        </div>
      </section>

      {message ? (
        <div role="status" style={{ marginTop: 16, padding: 12, borderRadius: 12, background: message.startsWith('Stored') ? '#1A3522' : '#402B22', color: message.startsWith('Stored') ? '#A8DAB6' : '#F0C7B8' }}>
          {message}
        </div>
      ) : null}

      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 23 }}>Recent evidence</h2>
          <button type="button" onClick={() => void refresh()} disabled={working != null} style={{ ...button, background: '#1E2D24', color: '#BFB6A8', border: '1px solid #35523D' }}>
            {working === 'refresh' ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {runs.length ? runs.map((run) => <RunCard key={run.id} run={run} />) : (
            <div style={{ ...panel, boxShadow: 'none', color: '#948B7D' }}>
              No measured run yet. A result only appears here after schema validation and server-side scoring.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
