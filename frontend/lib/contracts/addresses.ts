//frontend/lib/contracts/addresses.ts
export const CHAIN = {
  id: 84532,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  rpcBackup: 'https://base-sepolia-rpc.publicnode.com',
  blockExplorer: 'https://sepolia.basescan.org',
} as const;

// v7 relaunch, 2026-08-27 (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md). ClimatePool
// is immutable, so this is a new address, not an upgrade: escape hatch
// (abandonMarket), oracle-state clamps, no claim deadline, permissionless fee
// delivery, token-scaled minimums, and predictWithPermit. MOCK_USDM changed
// too, to a fresh token carrying ERC20Permit; the old one has none.
//
// V5 stays live at its own address and is NOT drained by this switch (fake
// testnet money; see D-11, one immutable pool per settlement asset).
// MarketLauncherConfig.getDefaultPool() was repointed on chain to pool id 2
// (the new pool), so /create follows this automatically. Old addresses, kept
// for reference and for anyone still reading a V5 position directly:
//   MOCK_USDM      0x4a8FDd6E0Bc792264eed322E43Da2A4E37E32f2c
//   CLIMATE_POOL   0x73bCf89971563C1Df6C3e059A5B18B6a10eAfFED
//   CLIMATE_ORACLE 0x850B6bbb25fdcB9D49EBd5E149B19b4D6ceD04E4
export const CONTRACTS = {
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
  MOCK_USDM: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
  FAUCET: '0x45176C683A245e84c9ee3f56242532031490a005' as `0x${string}`,
  MARKET_TYPE_REGISTRY: '0xbE4D6EC834e786D272b7Ff8A90cEc969590499db' as `0x${string}`,
  CLIMATE_POOL: '0x770a62F413B42B05B827F2beBe118d34B899f97D' as `0x${string}`,
  CLIMATE_ORACLE: '0xf076af5EDDc6A14a3d879E77F743630574155298' as `0x${string}`,
  MARKET_LAUNCHER_CONFIG: '0x900863739B7fAeac55Ea7B684d334C66a880eA5a' as `0x${string}`,
  // Deployed 2026-09-15 (D-16, docs/V7_ARCHITECTURE_EVOLUTION_LOG.md).
  // Standalone, permissionless, no core touch: neither reads nor is read by
  // anything above. Not yet wired into any UI surface.
  //   CREATOR_BADGE       climatePool() confirmed on chain == CLIMATE_POOL
  //                       above. Sourcify exact_match.
  //   REFERRAL_REGISTRY   no constructor args. Sourcify exact_match.
  CREATOR_BADGE: '0xC09D602D3db9A48CC4AE97e50B506b5e1229cb0A' as `0x${string}`,
  REFERRAL_REGISTRY: '0x2A470bDfb9DDfbcF57b02726474100cA317f3e53' as `0x${string}`,
} as const;

export const MARKET_TYPES = {
  // V5 (simple weather thresholds — historicalAvg = raw observed metric)
  RAIN: 1,
  TEMP_HIGH: 2,
  TEMP_LOW: 3,
  SNOW: 4,
  // V6 (binary signal-based — historicalAvg encoded per migration 20260513)
  COLD_SPELL: 5, // consecutive_cold_below     · historicalAvg = °C + 100
  DRY_STRETCH: 6, // dry_stretch_window        · historicalAvg = mm (raw)
  FROST_RISK: 7, // frost_risk                 · historicalAvg = 102 (fixed 2°C)
  HEAVY_RAIN: 8, // heavy_rain_event           · historicalAvg = pct × 100  or raw mm
} as const;

/**
 * On-chain encoding helpers for V6 binary market types. The contract
 * stores historicalAvg as uint256, so negative temperatures and
 * percentile thresholds need encoded layouts. See migration
 * 20260513_signal_types_v6.sql for the source of truth.
 *
 * V6 testnet note: the /create form currently passes the historical
 * preview average for `userThreshold` (same shape used by V5 types).
 * Cold spell can use that directly (avg min-temp → meaningful °C
 * threshold). Dry stretch and Heavy rain *cannot* — the "threshold"
 * for those types is conceptually different (mm/day floor for dry
 * stretch, percentile for heavy rain) and bears no relation to the
 * historical daily average. Until we ship the per-type input UI, those
 * two use registry-default thresholds and ignore userThreshold.
 */
export function encodeHistoricalAvg(
  typeId: number,
  userThreshold: number,
  heavyRainMode: 'percentile' | 'fixed' = 'percentile',
  durationDays = 1,
): bigint {
  switch (typeId) {
    case MARKET_TYPES.COLD_SPELL:
      // The contract only evaluates actualValue >= historicalAvg. Invert the
      // unsigned value so that Yes means the observed minimum is below X.
      return BigInt(10_001 - Math.round(userThreshold + 100));
    case MARKET_TYPES.DRY_STRETCH:
      // Threshold is a *daily rainfall floor* (typically 1mm — anything
      // below counts as a dry day). The historical avg passed in here
      // is daily rainfall, not the floor, so we'd encode 3-8mm and call
      // every normal-ish day "dry" — too permissive. Hardcode the
      // migration default (1mm) until the form exposes this input.
      return BigInt(Math.max(1, Math.round(durationDays)));
    case MARKET_TYPES.FROST_RISK:
      // Fixed by design: 2°C + 100 = 102. User cannot tune this on-chain.
      return 9_899n;
    case MARKET_TYPES.HEAVY_RAIN:
      if (heavyRainMode === 'fixed' && userThreshold > 0) {
        return BigInt(Math.max(0, Math.round(userThreshold)));
      }
      return BigInt(Math.max(1, Math.round(userThreshold)));
    default:
      // V5 types fall through to the legacy raw-value encoding in /create.
      return BigInt(Math.round(userThreshold));
  }
}

/**
 * Decode a V6 cold_spell / frost_risk THRESHOLD (historicalAvg on-chain)
 * back to Celsius.
 *
 * Two generations of this encoding coexist in production, and there is no
 * version column to tell them apart — only the number itself. Markets
 * minted before the inversion (commit 9f3098e, 2026-08-01/02) used a plain
 * `celsius + 100` offset; every real cold line lands that encoding in
 * roughly 20-220. `encodeHistoricalAvg` above has inverted since, to
 * `10001 - (celsius + 100)`; every real cold line lands THAT encoding in
 * roughly 9800-9990. Verified against production 2026-08-06: 14 markets in
 * the low range, one (freshly seeded the same day) in the high range,
 * nothing in between. The ranges cannot overlap for any plausible
 * temperature, so the magnitude alone is a safe discriminator — but it IS a
 * discriminator standing in for a version flag the schema doesn't have.
 * A market minted on-chain never changes encoding after the fact, so this
 * split is permanent for the 14 old markets, not a transient migration
 * window.
 */
export function decodeColdLine(encoded: number): number {
  return encoded >= 1_000 ? 9_901 - encoded : encoded - 100;
}

/**
 * Decode a resolved market's on-chain `actualValue` for display. For
 * cold_spell/frost_risk it shares decodeColdLine's encoding (both are
 * written by the same watchdog.mjs / lib/oracle-cre/derive.ts branch),
 * every other type stores actualValue as the plain metric already.
 * Every UI surface that shows an observed weather value must go through
 * this, not reimplement the marketTypeId check inline.
 */
export function decodeActualValue(marketTypeId: number | null | undefined, actualValue: number): number {
  if (marketTypeId === MARKET_TYPES.COLD_SPELL || marketTypeId === MARKET_TYPES.FROST_RISK) {
    return decodeColdLine(actualValue);
  }
  return actualValue;
}

export const USDM_DECIMALS = 6;
