-- 20260921120000_historical_series_cache_fixes.sql
--
-- Follow-up to 20260921_historical_series_cache.sql, applied same day
-- after an independent integration review (docs/kalma-coordination-
-- handover-2026-09-15/09-UI-HANDOVER-CLIMATE-INTEGRITY-2026-09-21.md)
-- found three schema-level defects before the table took any real
-- traffic (confirmed empty at review time):
--
-- 1. `years` implied "calendar year of this date", but a DOY window near
--    January can legitimately hold a late-December date labelled with the
--    following year's anchor. Renamed to `anchor_years` to say what it
--    actually is: the label of the fetch-window iteration, not a claim
--    about any individual date's real calendar year. See DatedValue's
--    doc in lib/signal-engine/percentile.ts for why that's the correct
--    key to group rolling sums by regardless.
-- 2. water_recovery_signal's production config (baseline_years=10,
--    doy_half_window=7) only fetched 15 days per year, enough for two
--    14-day rolling sums per year — 20 total, under evaluator.ts's
--    30-sample floor, so the signal type could never fire once the
--    rolling-sum bug was fixed. The fix fetches extra lookback days per
--    year (lib/signal-engine/openMeteoFetcher.ts's fetchHistoricalSeries,
--    `lookbackDays` param); a row fetched with less lookback doesn't have
--    enough history to reproduce the same rolling sums, so lookback_days
--    joins the cache key rather than letting a short row be reused as if
--    it were long enough.
-- 3. `array_length(x, 1) = array_length(y, 1)` is NULL, not FALSE, when
--    both arrays are empty (or one is), and Postgres CHECK constraints
--    treat NULL as satisfied — so an all-empty row silently passed
--    validation. The application layer now skips caching an empty series
--    entirely (see seriesCache.ts), and the CHECK below closes the gap at
--    the schema level too, using coalesce to force a real comparison.

alter table public.historical_series_cache
  rename column years to anchor_years;

alter table public.historical_series_cache
  add column lookback_days integer not null default 0;

alter table public.historical_series_cache
  drop constraint historical_series_cache_key;

alter table public.historical_series_cache
  add constraint historical_series_cache_key unique (
    place_id, variable, doy_center, doy_half_window, baseline_years, source, lookback_days
  );

alter table public.historical_series_cache
  drop constraint historical_series_cache_arrays_aligned;

alter table public.historical_series_cache
  add constraint historical_series_cache_arrays_aligned check (
    coalesce(array_length(anchor_years, 1), 0) = coalesce(array_length(dates, 1), 0)
    and coalesce(array_length(dates, 1), 0) = coalesce(array_length(values, 1), 0)
    and coalesce(array_length(values, 1), 0) > 0
  );

comment on column public.historical_series_cache.anchor_years is
  'Label of the fetch-window iteration each sample belongs to (buildBaselineWindow''s `year`, i.e. targetYear - i) — NOT necessarily the true calendar year of `dates[i]`. A window near January can hold a late-December date under the following year''s anchor. Group by this, not by parsing the date, when computing rolling sums: it is what keeps two different anchor windows from being pooled together, and true calendar-day adjacency is still checked independently via `dates`.';

comment on column public.historical_series_cache.lookback_days is
  'Extra days fetched before doy_half_window''s nominal start, per year, so N-day rolling sums can be computed ending at every candidate date in the window. Part of the cache key: a row cached with less lookback cannot answer a request that needs more.';

-- Defense in depth: no anon/authenticated grants existed before this
-- either, but RLS was OFF, so a future accidental grant would have
-- worked. service_role bypasses RLS regardless (BYPASSRLS), so this has
-- no effect on the only role that is supposed to touch this table.
alter table public.historical_series_cache enable row level security;
