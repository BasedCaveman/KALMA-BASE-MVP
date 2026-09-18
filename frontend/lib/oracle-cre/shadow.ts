// kalma/frontend/lib/oracle-cre/shadow.ts
//
// CRE shadow resolution: run every source, take consensus, decide the
// outcome. This is what the real Chainlink CRE workflow will do inside the
// DON (each node fetches, computes, and the network agrees). Until the DON is
// deployed, we run it here in SHADOW MODE: off-chain, no on-chain write, no
// money moved. The trust page publishes this next to the live operator oracle
// so the accuracy of both is visible during the battle-test.
//
// Honesty: a shadow consensus is NOT decentralized consensus yet. Every
// surface that renders this must label it "candidate / shadow", never claim
// the DON has spoken. See app/trust/page.tsx.

import { outcomeAbove } from './derive';
import { fetchAllSources, type MarketWindow, type SourceReading } from './sources';

export type ShadowSource = {
  source: string;
  source_url: string;
  observed_float: number;
  observed_int: number;
  outcome_above: boolean;
};

export type ShadowResolution = {
  /** Per-source readings that responded. */
  sources: ShadowSource[];
  source_count: number;
  /** Median observed integer across responding sources. */
  consensus_int: number;
  /** Median observed human value across responding sources. */
  consensus_float: number;
  /** Consensus outcome vs the on-chain threshold. Null if no source responded. */
  cre_outcome_above: boolean | null;
  /** True when every responding source agreed on the outcome. */
  sources_unanimous: boolean;
  method: 'multi-source-median';
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compute the shadow resolution for a market window against its on-chain
 * threshold. Returns a fully populated result even when sources are missing;
 * `cre_outcome_above` is null only when NO source responded (caller skips
 * storing that and retries next pass).
 */
export async function computeShadowResolution(
  window: MarketWindow,
  thresholdInt: number,
): Promise<ShadowResolution> {
  const readings: SourceReading[] = await fetchAllSources(window);

  const sources: ShadowSource[] = readings.map((r) => ({
    source: r.source,
    source_url: r.sourceUrl,
    observed_float: r.observedFloat,
    observed_int: r.observedInt,
    outcome_above: outcomeAbove(r.observedInt, thresholdInt),
  }));

  if (!sources.length) {
    return {
      sources,
      source_count: 0,
      consensus_int: 0,
      consensus_float: 0,
      cre_outcome_above: null,
      sources_unanimous: false,
      method: 'multi-source-median',
    };
  }

  const consensusInt = Math.round(median(sources.map((s) => s.observed_int)));
  const consensusFloat = Number(median(sources.map((s) => s.observed_float)).toFixed(2));
  const outcomes = sources.map((s) => s.outcome_above);

  return {
    sources,
    source_count: sources.length,
    consensus_int: consensusInt,
    consensus_float: consensusFloat,
    cre_outcome_above: outcomeAbove(consensusInt, thresholdInt),
    sources_unanimous: outcomes.every((o) => o === outcomes[0]),
    method: 'multi-source-median',
  };
}
