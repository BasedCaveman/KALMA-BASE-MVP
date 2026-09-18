// kalma/frontend/hooks/useLocalSignals.ts
//
// Reads the weather signals produced by the engine (see
// app/api/cron/signal-engine + lib/signal-engine) from Supabase and
// returns them composed into render-ready SignalCard payloads.
//
// Two flavors:
//   useLocalSignalsByPlace(placeSlug)
//     Place-detail page: every active signal for one place.
//
//   useLocalSignalsNearby({ lat, lon, limit })
//     Home page: all active signals across places, sorted by distance
//     from the user's location. Used to show "what's happening near
//     you" without forcing the user to pick a place.
//
// We rely on the public.local_signals RLS policy (status='active') and
// the public.places + public.signal_type_registry public-read policies,
// so the anon key is enough. No service role on the client.
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  composeCard,
  type SignalCard,
  type StoredSignal,
} from '@/lib/signal-engine/composer';
import {
  eventsForProfile,
  type CommodityContextEvent,
} from '@/lib/signal-engine/commodity-context';

type RawPlace = {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  region_code: string | null;
  country: string;
  country_code: string;
  lat: number;
  lon: number;
  place_activity_profiles:
    | { groups: string[]; coord_verified: boolean }
    | { groups: string[]; coord_verified: boolean }[]
    | null;
  /** Absent when the optional community embed was dropped on retry. */
  place_community_activity?:
    | { group_slug: string; confirmed: boolean }[]
    | null;
};

export type LocalSignalWithPlace = SignalCard & {
  place: {
    id: string;
    slug: string;
    name: string;
    region: string | null;
    country: string;
    lat: number;
    lon: number;
    /** Verified Wikipedia-derived activity groups (place_activity_profiles),
     *  or null with no trusted profile yet. Drives evidence-based chip
     *  filtering in place of the latitude heuristic. */
    activityGroups: string[] | null;
    /** Activity groups confirmed by community field observations
     *  (place_community_activity). Additive: they keep a chip the article
     *  or the latitude band would have dropped, never remove one. */
    communityGroups: string[];
  };
  /** Active commodity market events already routed to this signal's
   *  place (see eventsForProfile in lib/signal-engine/commodity-context.ts).
   *  Empty when the place has no matching profile group or no live event. */
  marketContext: CommodityContextEvent[];
};

/** Currently-active commodity context events, shared across every card in
 *  a fetch — the join to each place happens client-side via activityGroups,
 *  so one small table read covers the whole batch. */
async function fetchActiveCommodityEvents(): Promise<CommodityContextEvent[]> {
  const { data, error } = await supabase
    .from('commodity_context_events')
    .select('commodity, kind, pct_7d, pct_30d, latest_close, unit, source')
    .gt('valid_until', new Date().toISOString());
  if (error) {
    console.warn('[signals] fetchActiveCommodityEvents:', error.message);
    return [];
  }
  return (data ?? []) as CommodityContextEvent[];
}

// ── Distance ──────────────────────────────────────────────────────────────

// Haversine in km. Used only to sort by proximity, not displayed; keep
// approximate (no need for spherical-cap correction at this scale).
function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLon *
      sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
}

// Severity ordering for "what to surface first" when distance is comparable.
const SEVERITY_RANK: Record<string, number> = {
  extreme: 5,
  strong: 4,
  high: 4,
  medium: 3,
  active: 2,
  low: 1,
};

// ── Internal fetcher ──────────────────────────────────────────────────────

// Ceiling on active signals pulled in one browse read. This is a CAP, not a
// fetch size: Postgres returns only the rows that actually exist (≈485 today),
// so raising it is free until the data grows into it. It must stay ABOVE the
// live active-signal count, otherwise `evaluated_at desc` silently drops the
// oldest signals — and because that order is geography-blind, whole regions
// vanish (the old value of 200 collapsed Brazil from 30 cities to 10 and hid
// Belo Horizonte / most of Minas Gerais from the /signals browse). When the
// count approaches this, the real fix is a server-side geo/paginated query,
// not a bigger number.
export const ACTIVE_SIGNALS_FETCH_CAP = 3000;

/** The signal → place join. The community-activity embed is additive — it
 *  can only ever ADD a chip — so it is optional: if that table is missing
 *  (a deploy landing ahead of its migration) the embed errors and would
 *  empty the whole feed. Callers retry with `withCommunity: false` rather
 *  than let an optional enrichment cost every signal on the page. */
function signalSelect(withCommunity: boolean) {
  return `
      id, place_id, signal_type_id, status, severity, confidence,
      anomaly_score, affected_groups, source_stack, structured_data,
      valid_from, valid_until, evaluated_at,
      places ( id, slug, name, region, region_code, country, country_code, lat, lon,
        place_activity_profiles ( groups, coord_verified )${
          withCommunity
            ? ',\n        place_community_activity ( group_slug, confirmed )'
            : ''
        } )
    `;
}

async function fetchActiveSignalsWithPlaces() {
  // One round-trip: join local_signals → places. The cap must exceed the live
  // active count so no place is dropped before the client groups by region.
  const run = (withCommunity: boolean) =>
    supabase
      .from('local_signals')
      .select(signalSelect(withCommunity))
      .eq('status', 'active')
      .order('evaluated_at', { ascending: false })
      .limit(ACTIVE_SIGNALS_FETCH_CAP);

  let { data, error } = await run(true);
  if (error) {
    console.warn(
      '[signals] community activity embed failed, retrying without it:',
      error.message
    );
    ({ data, error } = await run(false));
  }

  if (error) {
    console.warn('[signals] fetchActiveSignalsWithPlaces:', error.message);
    return [];
  }
  return data ?? [];
}

function rowToLocalSignal(
  row: any,
  commodityEvents: CommodityContextEvent[],
): LocalSignalWithPlace | null {
  const place: RawPlace | null = Array.isArray(row.places)
    ? row.places[0]
    : row.places;
  if (!place) return null;

  const stored: StoredSignal = {
    id: row.id,
    place_id: row.place_id,
    signal_type_id: row.signal_type_id,
    status: row.status,
    severity: row.severity,
    confidence: row.confidence ?? 0,
    anomaly_score: row.anomaly_score ?? 0,
    affected_groups: row.affected_groups ?? [],
    source_stack: row.source_stack ?? [],
    structured_data: row.structured_data ?? {},
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    evaluated_at: row.evaluated_at,
  };

  // One-to-one embed (profile PK = places FK). Only coordinate-verified
  // profiles drive evidence-based chip filtering + market-context routing.
  const profileRow = Array.isArray(place.place_activity_profiles)
    ? place.place_activity_profiles[0]
    : place.place_activity_profiles;
  const activityGroups =
    profileRow && profileRow.coord_verified ? profileRow.groups ?? [] : null;

  // One-to-many embed. Only corroborated rows count — unconfirmed ones are
  // stored for observability but have not cleared the two-author gate.
  const communityGroups = (place.place_community_activity ?? [])
    .filter((r) => r.confirmed)
    .map((r) => r.group_slug);

  return {
    ...composeCard(stored),
    place: {
      id: place.id,
      slug: place.slug,
      name: place.name,
      region: place.region,
      country: place.country,
      lat: place.lat,
      lon: place.lon,
      activityGroups,
      communityGroups,
    },
    marketContext: eventsForProfile(commodityEvents, activityGroups),
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────

export function useLocalSignalsNearby(params: {
  lat: number | null | undefined;
  lon: number | null | undefined;
  limit?: number;
  enabled?: boolean;
  /**
   * Coordinates of markets the user has active positions on. Each is
   * matched (within ~50km) to the nearest place in the signal feed, and
   * those places get boosted to the top of the sort order regardless of
   * distance. Empty array = no boost (default).
   */
  positionLatLons?: Array<{ lat: number; lon: number }>;
}) {
  const {
    lat,
    lon,
    limit = 5,
    enabled = true,
    positionLatLons = [],
  } = params;
  const [signals, setSignals] = useState<LocalSignalWithPlace[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Stable key so the effect doesn't re-run on every render of a fresh array.
  const positionKey = positionLatLons
    .map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`)
    .sort()
    .join('|');

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      fetchActiveSignalsWithPlaces(),
      fetchActiveCommodityEvents(),
    ]).then(([rows, commodityEvents]) => {
      if (cancelled) return;
      const cards = rows
        .map((row) => rowToLocalSignal(row, commodityEvents))
        .filter((s): s is LocalSignalWithPlace => !!s);

      const hasUserLoc = typeof lat === 'number' && typeof lon === 'number';

      // Resolve position coordinates → nearest-place slugs from the
      // signal feed. ≤50km cutoff so a market created for a place we
      // don't track yet doesn't accidentally boost an unrelated city.
      const positionSlugs = new Set<string>();
      for (const p of positionLatLons) {
        let nearestSlug: string | null = null;
        let bestDistance = Infinity;
        for (const c of cards) {
          const d = distanceKm(
            { lat: p.lat, lon: p.lon },
            { lat: c.place.lat, lon: c.place.lon }
          );
          if (d < bestDistance) {
            bestDistance = d;
            nearestSlug = c.place.slug;
          }
        }
        if (nearestSlug && bestDistance <= 50) {
          positionSlugs.add(nearestSlug);
        }
      }

      // Resolve user's lat/lon → saved-place slug (nearest place to them).
      let savedPlaceSlug: string | null = null;
      if (hasUserLoc) {
        let nearestDistance = Infinity;
        for (const c of cards) {
          const d = distanceKm(
            { lat: lat!, lon: lon! },
            { lat: c.place.lat, lon: c.place.lon }
          );
          if (d < nearestDistance) {
            nearestDistance = d;
            savedPlaceSlug = c.place.slug;
          }
        }
      }

      // Sort priority, highest first:
      //   1. Position cities (signals on your active markets) always first
      //   2. Saved-place exact match (the place closest to user's lat/lon)
      //   3. Distance to user (when location is known)
      //   4. Severity tiebreaker
      const tier = (c: LocalSignalWithPlace): number => {
        if (positionSlugs.has(c.place.slug)) return 0;
        if (savedPlaceSlug && c.place.slug === savedPlaceSlug) return 1;
        return 2;
      };

      cards.sort((a, b) => {
        const ta = tier(a);
        const tb = tier(b);
        if (ta !== tb) return ta - tb;
        if (hasUserLoc) {
          const da = distanceKm({ lat: lat!, lon: lon! }, { lat: a.place.lat, lon: a.place.lon });
          const db = distanceKm({ lat: lat!, lon: lon! }, { lat: b.place.lat, lon: b.place.lon });
          if (Math.abs(da - db) > 5) return da - db;
        }
        return (
          (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
        );
      });

      setSignals(cards.slice(0, limit));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lon, limit, enabled, positionKey]);

  return { signals, isLoading };
}

export function useLocalSignalsByPlace(placeSlug: string | null | undefined) {
  const [signals, setSignals] = useState<LocalSignalWithPlace[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!placeSlug) {
      setIsLoading(false);
      setSignals([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      // Resolve the slug → place_id, then fetch that place's signals.
      // Cheaper than client-side filtering of the global list.
      const { data: placeRow } = await supabase
        .from('places')
        .select('id')
        .eq('slug', placeSlug)
        .maybeSingle();
      if (cancelled || !placeRow?.id) {
        setSignals([]);
        setIsLoading(false);
        return;
      }

      const runPlaceQuery = (withCommunity: boolean) =>
        supabase
          .from('local_signals')
          .select(signalSelect(withCommunity))
          .eq('status', 'active')
          .eq('place_id', placeRow.id)
          .order('evaluated_at', { ascending: false });

      const [first, commodityEvents] = await Promise.all([
        runPlaceQuery(true),
        fetchActiveCommodityEvents(),
      ]);
      let { data, error } = first;
      // Same optional-embed retry as fetchActiveSignalsWithPlaces.
      if (error) {
        console.warn(
          '[signals] community activity embed failed, retrying without it:',
          error.message
        );
        ({ data, error } = await runPlaceQuery(false));
      }

      if (error) {
        console.warn('[signals] place fetch:', error.message);
        setSignals([]);
      } else {
        const cards = (data ?? [])
          .map((row) => rowToLocalSignal(row, commodityEvents))
          .filter((s): s is LocalSignalWithPlace => !!s);
        cards.sort(
          (a, b) =>
            (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
        );
        if (!cancelled) setSignals(cards);
      }
      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [placeSlug]);

  return { signals, isLoading };
}
