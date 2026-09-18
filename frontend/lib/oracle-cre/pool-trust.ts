// kalma/frontend/lib/oracle-cre/pool-trust.ts
//
// Which pools can be used as a verification source.
//
// WHY THIS EXISTS. /trust is an internal instrument for comparing two models,
// the Open-Meteo operator path and the Chainlink CRE being built. Its headline
// number was "91.5% agreement", and that number was measured over the wrong
// population. Read from production on 2026-08-04, by market type:
//
//   type            compared  agree  distinct CRE outcomes  distinct op outcomes
//   1 rain              19      17            2                      2
//   2 temp high         19      19            2                      2
//   3 temp low          17      16            2                      2
//   5 cold spell         9       8            1                      2
//   6 dry stretch       13      12            1                      2
//   7 frost              7       7            1                      1
//   8 heavy rain        18      18            1                      1
//
// Types 5 to 8 have a CRE side that produced ONE outcome across every
// comparison. For 7 and 8 neither side varies at all. A comparison that cannot
// come out differently is not evidence that either oracle works, and counting
// it inflates the figure in the flattering direction.
//
// THE MECHANISM. It is not noise, it is a unit mismatch with a precise cause.
// BT-004 (fixed 2026-08-01, 9f3098e) corrected `encodeHistoricalAvg` and
// `deriveObservedValue` together. The CRE shadow runs the corrected
// derive.ts, but every market on chain today was minted by the OLD encoder,
// so for types 5 to 8 the shadow compares a new-encoding observation against
// an old-encoding threshold:
//
//   type 5/7  derive gives 10000 - (coldest + 100), roughly 9880
//             chain holds  coldest + 100,           104 to 124, or fixed 102
//             => observed >= threshold, always. Always "Yes".
//   type 6    derive gives the longest dry RUN in days, 3 or more
//             chain holds  the 1mm daily FLOOR, literally 1
//             => always "Yes".
//   type 8    derive gives the wettest day in mm, tens
//             chain holds  a percentile sentinel, 9500
//             => never reaches it. Always "No".
//
// The V5 types (1 to 4) store raw values under both encoders and are
// unaffected, which is exactly what the BT-004 triage predicted.
//
// THE RULE. A comparison counts as verification only when the observed value
// and the on-chain threshold are expressed in the same units under the same
// encoding version. Everything else is still computed, still shown, and still
// kept in the record, but reported separately and never folded into the
// headline.
//
// Dependency-free on purpose, like derive.ts: this file is meant to ship
// inside the CRE workflow body when the DON deploys.

import { MARKET_TYPES } from './derive';

/** Why a comparison cannot serve as verification. */
export type TrustExclusion =
  /** Threshold was written by the pre-BT-004 encoder, so the units differ. */
  | 'legacy_encoding'
  /** Value is valid under both encoders; we cannot tell which wrote it. */
  | 'ambiguous_encoding'
  /** Type has no defined derivation, so nothing can be compared. */
  | 'unsupported_type';

export type PoolTrust =
  | { usable: true }
  | { usable: false; reason: TrustExclusion };

/**
 * The last market minted before the BT-004 encoder shipped.
 *
 * This is a historical fact, not a tunable: `encodeHistoricalAvg` was
 * corrected on 2026-08-01 (9f3098e) and `markets_snapshot` still held exactly
 * 213 markets with max(market_id) = 213 on 2026-08-04, because no seed run
 * happened in between (Run 5 was the next one scheduled). So every market up
 * to and including 213 carries an old-encoding threshold, and nothing after it
 * does.
 *
 * Do not raise this to "fix" an exclusion. Raising it re-admits comparisons
 * that are measuring nothing.
 *
 * SCOPED TO ONE POOL. `market_id` stopped being globally unique on 2026-08-27
 * (the multi-pool migration): the V7 pool mints its own market_id sequence
 * starting at 1, so V7's market 6 and V5's market 6 are different markets
 * that happen to share a number. Every market V7 (or any later pool) has ever
 * minted postdates BT-004, so this id cutoff must only ever gate the V5 pool
 * it was measured against, never any other. See LEGACY_POOL_ADDRESS below.
 */
export const LEGACY_ENCODING_MAX_MARKET_ID = 213;

/**
 * The only pool this file's id-based cutoff was ever measured against
 * (production V5, retired 2026-08-27). Lowercase, matches how pool_address is
 * stored everywhere else in this codebase.
 */
export const LEGACY_POOL_ADDRESS = '0x73bcf89971563c1df6c3e059a5b18b6a10eaffed';

// Acceptance bands for a threshold written by the CORRECTED encoder. These are
// a second, independent check on top of the id cutoff: if a market above the
// cutoff still carries a legacy-shaped threshold (a seeder run from a stale
// checkout, say) it stays excluded and stays visible, rather than silently
// polluting the headline. Both checks must pass.
//
// Bands are derived directly from `encodeHistoricalAvg` in
// lib/contracts/addresses.ts. Old and new bands are disjoint by construction
// for types 5, 7 and 8; type 6 overlaps at exactly 1 and is handled below.
const COLD_SPELL_MIN = 9_800; // 10001 - (X + 100), plausible X keeps this high
const COLD_SPELL_MAX = 9_990;
const FROST_ENCODED = 9_899; // fixed 2C line, the encoder emits this constant
const DRY_STRETCH_MIN_DAYS = 2; // 1 is the legacy mm floor AND a 1-day window
const HEAVY_RAIN_MAX_MM = 500; // a real millimetre threshold, never the 9500 sentinel

/**
 * Can this comparison be counted as verification?
 *
 * `marketId` carries the encoding era (but only within `poolAddress`, see
 * LEGACY_POOL_ADDRESS above), `thresholdValue` is the on-chain `historicalAvg`
 * as stored.
 */
export function poolTrust(
  marketTypeId: number,
  thresholdValue: number,
  marketId: number,
  poolAddress: string,
): PoolTrust {
  const t = Math.round(thresholdValue);
  const legacyIdApplies =
    poolAddress.toLowerCase() === LEGACY_POOL_ADDRESS && marketId <= LEGACY_ENCODING_MAX_MARKET_ID;

  switch (marketTypeId) {
    // V5 types: raw values under both encoders, so the era does not matter and
    // the id cutoff does not apply. These are the pools that have been doing
    // real work all along.
    case MARKET_TYPES.RAIN:
    case MARKET_TYPES.TEMP_HIGH:
    case MARKET_TYPES.TEMP_LOW:
    case MARKET_TYPES.SNOW:
      return { usable: true };

    case MARKET_TYPES.COLD_SPELL:
      if (legacyIdApplies) return { usable: false, reason: 'legacy_encoding' };
      if (t < COLD_SPELL_MIN || t > COLD_SPELL_MAX) return { usable: false, reason: 'legacy_encoding' };
      return { usable: true };

    case MARKET_TYPES.FROST_RISK:
      if (legacyIdApplies) return { usable: false, reason: 'legacy_encoding' };
      if (t !== FROST_ENCODED) return { usable: false, reason: 'legacy_encoding' };
      return { usable: true };

    case MARKET_TYPES.DRY_STRETCH:
      if (legacyIdApplies) return { usable: false, reason: 'legacy_encoding' };
      // A window of 1 day encodes to 1 under the new rule and the legacy mm
      // floor is also 1. Unprovable either way, so it does not count. Real dry
      // stretches run several days, so this should stay rare.
      if (t < DRY_STRETCH_MIN_DAYS) return { usable: false, reason: 'ambiguous_encoding' };
      return { usable: true };

    case MARKET_TYPES.HEAVY_RAIN:
      if (legacyIdApplies) return { usable: false, reason: 'legacy_encoding' };
      // Above the band is the 9500 percentile sentinel or something equally
      // unexplained (one legacy market carries 700). A genuine millimetre
      // threshold that large deserves a human look, not silent trust.
      if (t < 1 || t > HEAVY_RAIN_MAX_MM) return { usable: false, reason: 'legacy_encoding' };
      return { usable: true };

    default:
      return { usable: false, reason: 'unsupported_type' };
  }
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export type ComparableRow = {
  marketId: number;
  poolAddress: string;
  marketTypeId: number;
  thresholdValue: number;
  /** null while the operator has not settled on chain yet. */
  agreesWithOperator: boolean | null;
};

export type AgreementSummary = {
  /** Comparisons that can serve as verification. */
  verified: { compared: number; agree: number; pct: number | null };
  /** Comparisons kept in the record but excluded from the headline. */
  excluded: { compared: number; agree: number; byReason: Record<TrustExclusion, number> };
};

/**
 * Split comparisons into what can be trusted as a verification source and what
 * cannot, and compute the agreement figure over the trusted half only.
 *
 * Rows still awaiting the operator (agreesWithOperator === null) are counted in
 * neither: they are pending, not excluded.
 */
export function summarizeAgreement(rows: ComparableRow[]): AgreementSummary {
  const byReason: Record<TrustExclusion, number> = {
    legacy_encoding: 0,
    ambiguous_encoding: 0,
    unsupported_type: 0,
  };
  let vCompared = 0;
  let vAgree = 0;
  let xCompared = 0;
  let xAgree = 0;

  for (const row of rows) {
    if (row.agreesWithOperator === null) continue;
    const trust = poolTrust(row.marketTypeId, row.thresholdValue, row.marketId, row.poolAddress);
    if (trust.usable) {
      vCompared += 1;
      if (row.agreesWithOperator) vAgree += 1;
    } else {
      xCompared += 1;
      if (row.agreesWithOperator) xAgree += 1;
      byReason[trust.reason] += 1;
    }
  }

  return {
    verified: {
      compared: vCompared,
      agree: vAgree,
      pct: vCompared ? Math.round((vAgree / vCompared) * 1000) / 10 : null,
    },
    excluded: { compared: xCompared, agree: xAgree, byReason },
  };
}

/** Short human label for an exclusion, for the internal table. */
export function exclusionLabel(reason: TrustExclusion): string {
  switch (reason) {
    case 'legacy_encoding':
      return 'pre-BT-004 threshold, units differ';
    case 'ambiguous_encoding':
      return 'threshold valid under both encoders';
    case 'unsupported_type':
      return 'no derivation for this type';
  }
}
