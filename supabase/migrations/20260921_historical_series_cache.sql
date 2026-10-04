-- 20260921_historical_series_cache.sql
--
-- historical_cache stores one flat array of daily values per (place,
-- variable, doy_center, doy_half_window, baseline_years), sorted ascending
-- by value before it is ever written. That is correct for the two callers
-- that rank a single day against the distribution (heat_stress_window,
-- heavy_rain_event's percentile branch) but wrong for the two callers that
-- need N-day rolling sums (rainfall_risk_rising, water_recovery_signal):
-- rollingNDaySum() summed array-adjacent entries of an already
-- value-sorted array, not calendar-adjacent days, producing a rolling-sum
-- distribution with no relationship to the real one. Reproduced against
-- the live code on 2026-09-21 (docs/kalma-coordination-handover-2026-09-15/
-- 08-CLIMATE-COORDINATION-ASSESSMENT-2026-09-21.md).
--
-- historical_series_cache is the fix: it stores the dated series (year,
-- date, value, index-aligned) instead of a pre-sorted flat array, so a
-- reader can group by year and compute rolling sums over real calendar-
-- consecutive days before ever sorting anything. It is a separate table,
-- not a column added to historical_cache, so the two callers that are
-- already correct keep reading the existing table unchanged, and old and
-- new rows never need a shape discriminator.
--
-- `source` defaults to 'open-meteo' and is not read by any code yet. It
-- exists so a second historical source (e.g. NASA POWER, already wired
-- for the unrelated CRE shadow-oracle consensus in lib/oracle-cre) can be
-- added later as additional rows without a second migration.

create table public.historical_series_cache (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null,
  variable text not null,
  doy_center integer not null,
  doy_half_window integer not null,
  baseline_years integer not null,
  source text not null default 'open-meteo',
  years integer[] not null,
  dates date[] not null,
  values numeric[] not null,
  cached_at timestamptz not null default now(),
  constraint historical_series_cache_arrays_aligned check (
    array_length(years, 1) = array_length(dates, 1)
    and array_length(dates, 1) = array_length(values, 1)
  ),
  constraint historical_series_cache_key unique (
    place_id, variable, doy_center, doy_half_window, baseline_years, source
  )
);

comment on table public.historical_series_cache is
  'Dated historical daily series per (place, variable, DOY window, source), used to compute correct N-day rolling sums (rainfall_risk_rising, water_recovery_signal). Sibling of historical_cache, which stores a pre-sorted flat array for single-day percentile ranking (heat_stress_window, heavy_rain_event percentile branch) and is unaffected by this migration.';

comment on column public.historical_series_cache.years is
  'Calendar year of each sample, index-aligned with dates and values. Rolling sums must be computed within one year at a time — never across the concatenation of multiple years'' DOY windows.';

-- Same access pattern as historical_cache: server-side cron/evaluator only,
-- via service_role. No anon/authenticated grants.
revoke all on public.historical_series_cache from public, anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate
  on public.historical_series_cache to service_role, postgres;

create index historical_series_cache_lookup_idx
  on public.historical_series_cache (place_id, variable, doy_half_window, baseline_years, source, doy_center);
