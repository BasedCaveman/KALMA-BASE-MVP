// kalma/frontend/app/trust/page.tsx
//
// Public transparency page: the live operator oracle and the CRE shadow oracle
// side by side, per resolved (or window-closed) signal, so anyone can follow
// how the two agree during the battle-test.
//
// Honesty (Golden Rule 8): the two oracles are DIFFERENT kinds of truth and
// are labeled as such. The operator oracle is LIVE and ON-CHAIN (single
// source, Open-Meteo, real resolution tx). The CRE side is a SHADOW /
// CANDIDATE run: off-chain multi-source consensus that previews what the
// Chainlink CRE decentralized oracle network will do once deployed. It moves
// no money and writes to no contract. The copy never claims otherwise.

import type { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import { CHAIN } from '@/lib/contracts';
import BottomNav from '@/components/design/BottomNav';
import {
  exclusionLabel,
  poolTrust,
  summarizeAgreement,
  type ComparableRow,
} from '@/lib/oracle-cre/pool-trust';

export const revalidate = 600;

const TYPE_LABEL: Record<number, string> = {
  1: 'Rain', 2: 'Heat (high)', 3: 'Cold (low)', 4: 'Snow',
  5: 'Cold spell', 6: 'Dry stretch', 7: 'Frost', 8: 'Heavy rain',
};

export const metadata: Metadata = {
  title: 'Oracle transparency',
  description:
    'The live operator oracle and the Chainlink CRE shadow oracle, side by side, per resolved weather signal. Follow how the two agree during the battle-test.',
  alternates: { canonical: '/trust' },
};

type ShadowRow = {
  market_id: number;
  pool_address: string;
  sources: Array<{ source: string; observed_float: number; outcome_above: boolean }>;
  source_count: number;
  consensus_float: number | null;
  cre_outcome_above: boolean | null;
  sources_unanimous: boolean | null;
  operator_outcome_above: boolean | null;
  agrees_with_operator: boolean | null;
  computed_at: string;
};

// The statistic must not depend on how much of the table we happen to render.
// The old code fetched the 120 most recent shadow rows and computed "agreement
// so far" over them, silently truncating the record (193 rows on 2026-08-04).
// Now the whole corpus is fetched and summarised, and only TABLE_ROWS of it is
// drawn. The cap is a memory guard, not part of the measurement.
const SHADOW_FETCH_CAP = 2000;
const TABLE_ROWS = 120;

// market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md).
// This page deliberately reads ACROSS every pool, V5's corpus is the whole
// point of the page and must not vanish the moment V7 goes live, so every
// lookup below keys on (pool_address, market_id) rather than market_id alone.
function poolKey(poolAddress: string, marketId: number) {
  return `${poolAddress}:${marketId}`;
}

async function getRows() {
  const { data: shadows, error } = await supabase
    .from('cre_shadow_resolutions')
    .select('market_id, pool_address, sources, source_count, consensus_float, cre_outcome_above, sources_unanimous, operator_outcome_above, agrees_with_operator, computed_at')
    .order('computed_at', { ascending: false })
    .limit(SHADOW_FETCH_CAP);
  if (error) {
    console.error('[trust] shadow fetch error:', error.message);
    return { rows: [] as ShadowRow[], meta: new Map(), evid: new Map() };
  }
  const rows = (shadows ?? []) as ShadowRow[];
  if (!rows.length) return { rows, meta: new Map(), evid: new Map() };

  // Grouped per pool rather than one global `.in('market_id', ids)`: with two
  // pools both starting their ids at 1, a flat id list can't tell a V5 row
  // from a V7 row apart, and `.in()` would return both under the same key.
  const idsByPool = new Map<string, number[]>();
  for (const r of rows) {
    const list = idsByPool.get(r.pool_address) ?? [];
    list.push(r.market_id);
    idsByPool.set(r.pool_address, list);
  }

  const meta = new Map<string, any>();
  const evid = new Map<string, any>();
  await Promise.all(
    [...idsByPool.entries()].map(async ([poolAddress, ids]) => {
      const [{ data: snaps }, { data: evidence }] = await Promise.all([
        // threshold_value carries the encoding era, which is what decides
        // whether a comparison can serve as verification at all
        // (lib/oracle-cre/pool-trust).
        supabase
          .from('markets_snapshot')
          .select('market_id, city_name, market_type_id, threshold_value')
          .eq('pool_address', poolAddress)
          .in('market_id', ids),
        supabase
          .from('resolution_evidence')
          .select('market_id, resolved_source, resolved_observed_value, resolved_actual_value, historical_avg, current_outcome, resolved_tx_hash')
          .eq('pool_address', poolAddress)
          .in('market_id', ids),
      ]);
      for (const s of snaps ?? []) meta.set(poolKey(poolAddress, (s as any).market_id), s);
      for (const e of evidence ?? []) evid.set(poolKey(poolAddress, (e as any).market_id), e);
    }),
  );
  return { rows, meta, evid };
}

function yesNo(above: boolean | null): string {
  if (above == null) return '·';
  return above ? 'Yes' : 'No';
}

export default async function TrustPage() {
  const { rows, meta, evid } = await getRows();

  // Agreement is computed ONLY over pools whose comparison can actually fail.
  // The old headline counted every row, including types whose CRE side is
  // pinned to one answer by an encoding mismatch, which inflated it. See
  // lib/oracle-cre/pool-trust.ts for the mechanism and the production numbers.
  const comparable: ComparableRow[] = rows.map((r) => {
    const key = poolKey(r.pool_address, r.market_id);
    return {
      marketId: r.market_id,
      poolAddress: r.pool_address,
      marketTypeId: meta.get(key)?.market_type_id ?? -1,
      thresholdValue: Number(meta.get(key)?.threshold_value ?? 0),
      agreesWithOperator: r.agrees_with_operator,
    };
  });
  const summary = summarizeAgreement(comparable);
  const awaiting = rows.filter((r) => r.agrees_with_operator === null && r.cre_outcome_above !== null).length;
  const exclusionRows = Object.entries(summary.excluded.byReason)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const fontDisplay = "var(--font-display), 'Playfair Display', serif";
  const fontSans = "var(--font-sans), 'DM Sans', system-ui, sans-serif";
  const fontMono = "var(--font-mono), 'JetBrains Mono', monospace";

  const card = {
    borderRadius: 14,
    border: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
    background: 'color-mix(in srgb, var(--k-surface) 60%, transparent)',
  } as const;

  return (
    <>
      <main
        style={{
          maxWidth: 860,
          margin: '0 auto',
          padding: '24px 18px var(--k-mobile-bottom-clearance)',
          fontFamily: fontSans,
          color: 'var(--k-text)',
        }}
      >
        <header style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.6, marginBottom: 8 }}>
            Oracle transparency
          </div>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 32, fontWeight: 600, margin: 0, lineHeight: 1.15 }}>
            Two oracles, in the open
          </h1>
          <p style={{ fontSize: 14, opacity: 0.78, lineHeight: 1.6, marginTop: 12 }}>
            Every weather signal is resolved by an oracle: it reads what the weather
            actually did and settles the answer. Kalma runs two in parallel, the live
            Open-Meteo operator path and the Chainlink CRE being built, and compares
            them here. The comparison only counts where both could have answered
            differently, so this page reports where the two models can be measured
            against each other as well as how often they match.
          </p>
        </header>

        {/* Legend: two kinds of truth, labeled */}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr', margin: '18px 0' }}>
          <div style={{ ...card, padding: '13px 15px', borderLeft: '4px solid var(--k-above, #5AAF72)' }}>
            <div style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'var(--k-above, #5AAF72)' }}>OPERATOR ORACLE</div>
            <p style={{ fontSize: 12.5, opacity: 0.78, margin: '6px 0 0', lineHeight: 1.5 }}>
              Live and on-chain today. One source (Open-Meteo), settled by a real
              transaction with a 2-hour challenge window.
            </p>
          </div>
          <div style={{ ...card, padding: '13px 15px', borderLeft: '4px solid var(--k-label, #C8A84A)' }}>
            <div style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'var(--k-label, #C8A84A)' }}>CRE SHADOW · CANDIDATE</div>
            <p style={{ fontSize: 12.5, opacity: 0.78, margin: '6px 0 0', lineHeight: 1.5 }}>
              A preview of the Chainlink CRE oracle network: several weather sources,
              consensus of them. Runs off-chain, moves no money. Not on-chain yet.
            </p>
          </div>
        </div>

        {/* Aggregate agreement */}
        <div style={{ ...card, padding: '16px 18px', margin: '14px 0 22px' }}>
          <div style={{ fontFamily: fontMono, fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', opacity: 0.6, marginBottom: 8 }}>
            Agreement so far
          </div>
          {summary.verified.compared ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 700 }}>
                {summary.verified.agree}
                <span style={{ opacity: 0.55, fontSize: 16 }}> / {summary.verified.compared}</span>
              </span>
              <span style={{ fontSize: 13.5, opacity: 0.8 }}>
                verifiable comparisons where the CRE shadow reached the same outcome as
                the live oracle
                {summary.verified.pct != null ? ` (${summary.verified.pct}%)` : ''}.
              </span>
            </div>
          ) : (
            <p style={{ fontSize: 13.5, opacity: 0.7, margin: 0 }}>
              No verifiable comparison yet. Every settled signal so far sits in a pool
              whose comparison cannot fail, so none of them measures the two oracles
              against each other.
            </p>
          )}
          <p style={{ fontSize: 12.5, opacity: 0.68, margin: '10px 0 0', lineHeight: 1.55 }}>
            Counted over pools where the comparison could have come out either way. A
            pool whose outcome is pinned by an encoding mismatch would only inflate this
            number, so it is reported below instead of folded in.
          </p>
          {awaiting > 0 && (
            <p style={{ fontSize: 12.5, opacity: 0.62, margin: '8px 0 0' }}>
              {awaiting} more {awaiting === 1 ? 'signal has' : 'signals have'} a CRE shadow
              answer already, waiting for the operator oracle to settle on-chain.
            </p>
          )}
        </div>

        {/* Excluded pools. Kept visible and itemised: the point of the filter is
            to know WHERE the two models can be compared, so the gap is as much
            of a result as the agreement figure. */}
        {summary.excluded.compared > 0 && (
          <div style={{ ...card, padding: '16px 18px', margin: '0 0 22px', borderLeft: '4px solid var(--k-below, #C86B52)' }}>
            <div style={{ fontFamily: fontMono, fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', opacity: 0.6, marginBottom: 8 }}>
              Not usable as verification
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 700 }}>
                {summary.excluded.compared}
              </span>
              <span style={{ fontSize: 13.5, opacity: 0.8 }}>
                comparisons excluded, of which {summary.excluded.agree} &quot;agree&quot;.
                Those agreements carry no information: the outcome was fixed before the
                weather was read.
              </span>
            </div>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, opacity: 0.75, lineHeight: 1.7 }}>
              {exclusionRows.map(([reason, n]) => (
                <li key={reason}>
                  <span style={{ fontFamily: fontMono }}>{n}</span>{' '}
                  {exclusionLabel(reason as Parameters<typeof exclusionLabel>[0])}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Comparison table */}
        {rows.length === 0 ? (
          <div style={{ ...card, padding: '14px 16px', fontSize: 13, opacity: 0.65 }}>
            Nothing to compare yet. The CRE shadow runs as soon as a signal&apos;s weather
            window closes.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', ...card }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
              <thead>
                <tr style={{ fontFamily: fontMono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--k-text-muted, #948B7D)' }}>
                  <th style={{ textAlign: 'left', padding: '11px 12px' }}>Signal</th>
                  <th style={{ textAlign: 'left', padding: '11px 12px' }}>Operator (on-chain)</th>
                  <th style={{ textAlign: 'left', padding: '11px 12px' }}>CRE shadow</th>
                  <th style={{ textAlign: 'left', padding: '11px 12px' }}>Match</th>
                </tr>
              </thead>
              <tbody style={{ fontFamily: fontMono }}>
                {rows.slice(0, TABLE_ROWS).map((r) => {
                  const rowKey = poolKey(r.pool_address, r.market_id);
                  const m = meta.get(rowKey);
                  const e = evid.get(rowKey);
                  const type = m ? TYPE_LABEL[m.market_type_id] ?? `Type ${m.market_type_id}` : '';
                  // Operator outcome: explicit bool, else derived from the
                  // resolved value vs the on-chain threshold, else the stored
                  // shadow-row copy. Keeps the column live even when
                  // current_outcome was never populated.
                  const derivedOp =
                    e?.resolved_actual_value != null && e?.historical_avg != null
                      ? Number(e.resolved_actual_value) >= Number(e.historical_avg)
                      : null;
                  const opOutcome = e?.current_outcome ?? derivedOp ?? r.operator_outcome_above ?? null;
                  const agrees = r.agrees_with_operator;
                  // A row can "agree" and still be worthless. Say which, per row,
                  // so the table cannot be read as 100 clean confirmations.
                  const trust = poolTrust(
                    m?.market_type_id ?? -1,
                    Number(m?.threshold_value ?? 0),
                    r.market_id,
                    r.pool_address,
                  );
                  const matchLabel =
                    agrees == null
                      ? 'awaiting operator'
                      : !trust.usable
                        ? 'not comparable'
                        : agrees
                          ? '✓ agree'
                          : '✗ diverge';
                  const matchColor =
                    agrees == null || !trust.usable
                      ? 'var(--k-text-muted, #948B7D)'
                      : agrees
                        ? 'var(--k-above, #5AAF72)'
                        : 'var(--k-below, #C86B52)';
                  return (
                    <tr key={poolKey(r.pool_address, r.market_id)} style={{ borderTop: '1px solid color-mix(in srgb, var(--k-text) 9%, transparent)' }}>
                      <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{m?.city_name ?? `#${r.market_id}`}</div>
                        <div style={{ opacity: 0.6, fontSize: 11 }}>{type}</div>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700 }}>{yesNo(opOutcome)}</div>
                        <div style={{ opacity: 0.6, fontSize: 11 }}>
                          {e?.resolved_observed_value != null ? `${e.resolved_observed_value} · ` : ''}
                          {e?.resolved_source ?? 'not resolved yet'}
                        </div>
                        {e?.resolved_tx_hash ? (
                          <a href={`${CHAIN.blockExplorer}/tx/${e.resolved_tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--k-accent, #5AAF72)' }}>
                            tx ↗
                          </a>
                        ) : null}
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700 }}>{yesNo(r.cre_outcome_above)}</div>
                        <div style={{ opacity: 0.6, fontSize: 11 }}>
                          {r.consensus_float != null ? `${r.consensus_float} · ` : ''}
                          {r.source_count} source{r.source_count === 1 ? '' : 's'}
                          {r.source_count > 1 ? (r.sources_unanimous ? ' · unanimous' : ' · split') : ''}
                        </div>
                      </td>
                      <td style={{ padding: '11px 12px', verticalAlign: 'top', color: matchColor, fontWeight: 700, fontSize: 12 }}>
                        {matchLabel}
                        {!trust.usable && agrees != null ? (
                          <div style={{ opacity: 0.7, fontSize: 10.5, fontWeight: 400, marginTop: 3, lineHeight: 1.4 }}>
                            {exclusionLabel(trust.reason)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > TABLE_ROWS && (
          <p style={{ fontSize: 11.5, opacity: 0.55, margin: '10px 0 0' }}>
            Showing the {TABLE_ROWS} most recent of {rows.length} shadow runs. The
            figures above are computed over all of them.
          </p>
        )}

        <p style={{ fontSize: 11.5, opacity: 0.5, lineHeight: 1.55, marginTop: 18 }}>
          The CRE shadow is a candidate run of the Chainlink CRE decentralized oracle
          network, computed off-chain from several public weather sources. It is shown
          for transparency during the battle-test and does not settle any market or move
          any funds. The operator oracle is the live, on-chain resolver. When the CRE
          network is deployed and validated against this record, it can take over
          resolution. Directional weather values, not a forecast accuracy grade.
        </p>
      </main>
      <BottomNav />
    </>
  );
}
