-- 20260921180000_historical_series_cache_coverage.sql
--
-- Second follow-up to 20260921_historical_series_cache.sql, applied same
-- day after a further review (docs/kalma-coordination-handover-2026-09-15/
-- 10-... — see the review that raised it) reproduced a coverage gap: a
-- fixed sample-count floor downstream (evaluator.ts, "need >= 30 rolling
-- sums") can pass with far thinner real coverage than it implies once
-- lookback days are involved. At baseline_years=10, doy_half_window=7,
-- lookback_days=13 (water_recovery_signal's shape), just 2 of the 10
-- requested years returning data already yields 2 * 15 = 30 rolling
-- 14-day sums — clearing the floor on 20% real year coverage.
--
-- years_requested/years_with_data let the application layer (evaluator.ts's
-- requireSufficientYears, seriesCache.ts's caching decision) tell "10 thin
-- years" from "2 complete years padded by lookback" apart, and stop a
-- badly partial fetch (below half of the requested years) from being
-- cached for the full 7-day TTL as if it were a genuine multi-year
-- baseline — it wasn't cacheable before this column existed to record it.

alter table public.historical_series_cache
  add column years_requested integer not null default 0,
  add column years_with_data integer not null default 0;

comment on column public.historical_series_cache.years_requested is
  'How many anchor-year windows were requested for this fetch (= baseline_years at fetch time).';

comment on column public.historical_series_cache.years_with_data is
  'How many of years_requested actually returned at least one sample. Rows below hasSufficientYearCoverage() (percentile.ts: years_with_data >= ceil(years_requested/2)) are not written by seriesCache.ts in the first place, but the columns stay real integers (not nullable) so a row that predates this check is visibly distinguishable (0/0) rather than silently absent.';
