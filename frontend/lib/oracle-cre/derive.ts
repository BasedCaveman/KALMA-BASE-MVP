// kalma/frontend/lib/oracle-cre/derive.ts
//
// Pure weather-to-value derivation shared by the CRE shadow oracle.
//
// This is a faithful TypeScript port of the aggregation the operator
// watchdog uses (frontend/scripts/watchdog.mjs `deriveObservedValue`), kept
// byte-identical in behaviour on purpose: the CRE shadow must compute the
// SAME number from the SAME daily series so the trust-page comparison is
// apples-to-apples. The only difference between the operator oracle and the
// CRE side is HOW MANY sources feed this function (one vs several) and where
// consensus is taken, never the math itself.
//
// When the real Chainlink CRE workflow ships, this exact file is the body it
// runs inside the DON (fetch daily series → derive → report), so keep it
// dependency-free.

export const MARKET_TYPES = {
  RAIN: 1,
  TEMP_HIGH: 2,
  TEMP_LOW: 3,
  SNOW: 4,
  COLD_SPELL: 5,
  DRY_STRETCH: 6,
  FROST_RISK: 7,
  HEAVY_RAIN: 8,
} as const;

export type MarketTypeId = (typeof MARKET_TYPES)[keyof typeof MARKET_TYPES];

/** Open-Meteo daily variable name for a market type. */
export function dailyVariableForMarketType(marketTypeId: number): string {
  switch (marketTypeId) {
    case MARKET_TYPES.RAIN:
    case MARKET_TYPES.DRY_STRETCH:
    case MARKET_TYPES.HEAVY_RAIN:
      return 'precipitation_sum';
    case MARKET_TYPES.TEMP_HIGH:
      return 'temperature_2m_max';
    case MARKET_TYPES.TEMP_LOW:
    case MARKET_TYPES.COLD_SPELL:
    case MARKET_TYPES.FROST_RISK:
      return 'temperature_2m_min';
    case MARKET_TYPES.SNOW:
      return 'snowfall_sum';
    default:
      throw new Error(`Unsupported market type ${marketTypeId}`);
  }
}

function longestRun(values: number[], predicate: (v: number) => boolean): number {
  let best = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

/** Clamp to the contract's on-chain actualValue envelope [0, 10000]. */
function clampActualValue(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

export type Derived = {
  /** Human-readable observed value (mm, °C, days). */
  observedFloat: number;
  /** Integer as the contract stores actualValue (matches watchdog exactly). */
  observedInt: number;
};

/**
 * Reduce a daily series to the single observed value for a market type,
 * matching the operator watchdog byte-for-byte.
 */
export function deriveObservedValue(
  marketTypeId: number,
  rawValues: number[],
): Derived {
  if (!rawValues.length) throw new Error('No weather values to derive from');

  switch (marketTypeId) {
    case MARKET_TYPES.RAIN:
    case MARKET_TYPES.SNOW: {
      const total = rawValues.reduce((s, v) => s + v, 0);
      return { observedFloat: Number(total.toFixed(2)), observedInt: clampActualValue(total) };
    }
    case MARKET_TYPES.TEMP_HIGH:
    case MARKET_TYPES.TEMP_LOW: {
      const avg = rawValues.reduce((s, v) => s + v, 0) / rawValues.length;
      return { observedFloat: Number(avg.toFixed(2)), observedInt: clampActualValue(avg) };
    }
    case MARKET_TYPES.COLD_SPELL:
    case MARKET_TYPES.FROST_RISK: {
      const coldest = Math.min(...rawValues);
      return {
        observedFloat: Number(coldest.toFixed(2)),
        observedInt: clampActualValue(10_000 - Math.round(coldest + 100)),
      };
    }
    case MARKET_TYPES.DRY_STRETCH: {
      const dryRun = longestRun(rawValues, (v) => v <= 1);
      return { observedFloat: dryRun, observedInt: dryRun };
    }
    case MARKET_TYPES.HEAVY_RAIN: {
      const wettest = Math.max(...rawValues);
      return { observedFloat: Number(wettest.toFixed(2)), observedInt: clampActualValue(wettest) };
    }
    default:
      throw new Error(`Unsupported market type ${marketTypeId}`);
  }
}

/**
 * Outcome as the contract decides it: "above" (Yes) wins when the observed
 * integer is at least the on-chain threshold. Same comparison the operator
 * resolution encodes, so agreement is judged on the same rule.
 */
export function outcomeAbove(observedInt: number, thresholdInt: number): boolean {
  return observedInt >= thresholdInt;
}
