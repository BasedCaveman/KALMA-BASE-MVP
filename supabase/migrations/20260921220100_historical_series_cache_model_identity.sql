-- Same model-identity gap as historical_cache_model_identity, on the
-- newer dated-series table. This table has 0 rows in production (never
-- gone live), so 'era5' as the transient default just keeps the column
-- NOT NULL-safe between ADD COLUMN and DROP DEFAULT; there is nothing to
-- backfill. Review 2026-09-21 (fifth round): "source" alone was always
-- 'open-meteo' regardless of which model that provider used, so it could
-- not distinguish a Best Match row from an ERA5 row either.
alter table public.historical_series_cache
  add column model text not null default 'era5';

alter table public.historical_series_cache
  alter column model drop default;

alter table public.historical_series_cache
  drop constraint historical_series_cache_key;

alter table public.historical_series_cache
  add constraint historical_series_cache_key
  unique (place_id, variable, doy_center, doy_half_window, baseline_years, source, lookback_days, model);
