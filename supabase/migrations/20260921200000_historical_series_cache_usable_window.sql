-- 20260921200000_historical_series_cache_usable_window.sql
--
-- Third follow-up to 20260921_historical_series_cache.sql. A further
-- review (docs/kalma-coordination-handover-2026-09-15/, evidence/
-- 10-verify-adba4a7.mjs) reproduced that years_with_data (added in
-- 20260921180000) counted a year as "has data" if fetchHistoricalSeries
-- got even ONE raw sample back for it — not whether that year actually
-- produced a usable N-day rolling window. Reproduced: 2 complete years +
-- 3 years with only a single day each read as "5/10 years", passing
-- hasSufficientYearCoverage(), while the percentile baseline only ever
-- drew samples from the 2 complete years.
--
-- years_with_usable_window replaces it, computed by
-- rollingNDaySumByYear() (percentile.ts) — the only place that actually
-- knows whether a year's fetched days formed a complete, calendar-
-- consecutive window at the rolling size (N) the series was fetched for.
-- Table had 0 rows at every step of this branch's work, so this is a
-- rename plus a semantic fix, not a data migration.

alter table public.historical_series_cache
  rename column years_with_data to years_with_usable_window;

comment on column public.historical_series_cache.years_with_usable_window is
  'How many of years_requested actually contributed at least one full, calendar-consecutive N-day rolling window (rollingNDaySumByYear, N = lookback_days + 1) — not how many years returned any raw sample at all. Rows below hasSufficientYearCoverage() (years_with_usable_window >= ceil(years_requested/2)) are not written by seriesCache.ts.';
