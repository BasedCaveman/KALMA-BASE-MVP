// kalma/frontend/components/signal/SignalsGroupedView.tsx
//
// Continent-grouped signals view for /signals. The flat 50-card feed
// gets hard to scan on mobile when signals span the globe. This view
// keeps the user's nearest places expanded at the top, and collapses
// the rest of the world into one region pill per continent that opens
// on tap.
//
// Layout:
//   NEAR YOU         — top N closest places with active signals,
//                      fully expanded
//   OTHER REGIONS    — one section per continent (collapsed by default).
//                      Each region row shows place count + signal count
//                      + a highest-severity pill so the user can decide
//                      whether to open it.
//
// Sorting:
//   - "Near you" picks the closest places by haversine distance, then
//     severity tiebreak. Position-cities (where the user has an active
//     market) jump to the top regardless of distance.
//   - Within each region group, places are sorted by distance.
//
// Position-city boost and saved-place boost are inherited from the
// useLocalSignalsNearby hook that produces the input cards.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { SignalCard } from './SignalCard';
import MarketCard, { CompactMarketGrid } from '@/components/market/MarketCard';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useFavorites } from '@/hooks/useFavorites';
import {
  severityMeta,
  type SignalCard as SignalCardPayload,
} from '@/lib/signal-engine/composer';
import { resolveSignalString, type Locale } from '@/lib/signal-engine/i18n';
import type { CommodityContextEvent } from '@/lib/signal-engine/commodity-context';
import type { Market } from '@/hooks/useMarkets';

/** Max cards shown in the Following section. Users can follow many
 *  places without flooding the feed — top N by severity wins. */
const MAX_FOLLOWING_CARDS = 5;

type LocalSignalWithPlace = SignalCardPayload & {
  place: {
    slug: string;
    name: string;
    region: string | null;
    country: string;
    lat: number;
    lon: number;
    activityGroups?: string[] | null;
    communityGroups?: string[] | null;
  };
  marketContext?: CommodityContextEvent[];
};

// Country code → continent label. Covers every country code that
// currently has a row in public.places. Anything not listed lands in
// 'Other' until we expand the table.
const CONTINENT_BY_CC: Record<string, string> = {
  CA: 'North America', US: 'North America', MX: 'North America',
  HT: 'North America', CU: 'North America', GT: 'North America',
  PA: 'North America', DO: 'North America',

  BR: 'Latin America', AR: 'Latin America', CL: 'Latin America',
  CO: 'Latin America', PE: 'Latin America', EC: 'Latin America',
  UY: 'Latin America', BO: 'Latin America', PY: 'Latin America',
  VE: 'Latin America',

  FR: 'Europe', DE: 'Europe', ES: 'Europe', PT: 'Europe', IT: 'Europe',
  GB: 'Europe', NL: 'Europe', BE: 'Europe', PL: 'Europe', CH: 'Europe',
  SE: 'Europe', NO: 'Europe', FI: 'Europe', DK: 'Europe', GR: 'Europe',

  NG: 'Africa', CM: 'Africa', GQ: 'Africa', AO: 'Africa', ZA: 'Africa',
  KE: 'Africa', EG: 'Africa', MA: 'Africa', GH: 'Africa', SN: 'Africa',
  ET: 'Africa', TN: 'Africa', DZ: 'Africa', UG: 'Africa', TZ: 'Africa',

  CN: 'Asia', JP: 'Asia', KR: 'Asia', IN: 'Asia', TH: 'Asia', VN: 'Asia',
  ID: 'Asia', PH: 'Asia', SG: 'Asia', MY: 'Asia', PK: 'Asia', BD: 'Asia',
  TR: 'Asia', SA: 'Asia', AE: 'Asia', IR: 'Asia', IL: 'Asia',

  AU: 'Oceania', NZ: 'Oceania', FJ: 'Oceania', PG: 'Oceania',
};

function continentForCountry(country: string): string {
  // The signal feed gives us full country names; map by name → CC isn't
  // needed since we'll keep the CC handy when we need it. But here we
  // accept whatever the row has. Hardcoded matches first.
  const named: Record<string, string> = {
    Brazil: 'Latin America',
    Argentina: 'Latin America',
    Chile: 'Latin America',
    Colombia: 'Latin America',
    Peru: 'Latin America',
    Haiti: 'North America',
    Mexico: 'North America',
    'United States': 'North America',
    Canada: 'North America',
    France: 'Europe',
    Germany: 'Europe',
    Spain: 'Europe',
    Portugal: 'Europe',
    Italy: 'Europe',
    'United Kingdom': 'Europe',
    Netherlands: 'Europe',
    Belgium: 'Europe',
    Nigeria: 'Africa',
    Cameroon: 'Africa',
    'Equatorial Guinea': 'Africa',
    Angola: 'Africa',
    'South Africa': 'Africa',
    Kenya: 'Africa',
    Egypt: 'Africa',
    Morocco: 'Africa',
    Ghana: 'Africa',
    Senegal: 'Africa',
    Ethiopia: 'Africa',
    China: 'Asia',
    Japan: 'Asia',
    'South Korea': 'Asia',
    India: 'Asia',
    Thailand: 'Asia',
    Vietnam: 'Asia',
    Indonesia: 'Asia',
    Philippines: 'Asia',
    Singapore: 'Asia',
    Malaysia: 'Asia',
    Australia: 'Oceania',
    'New Zealand': 'Oceania',
  };
  return named[country] ?? 'Other';
}

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

const SEVERITY_RANK: Record<string, number> = {
  extreme: 5,
  strong: 4,
  high: 4,
  medium: 3,
  active: 2,
  low: 1,
};

function topSeverityIn(signals: LocalSignalWithPlace[]) {
  let best = '';
  let bestRank = -1;
  for (const s of signals) {
    const r = SEVERITY_RANK[s.severity] ?? 0;
    if (r > bestRank) {
      bestRank = r;
      best = s.severity;
    }
  }
  return best;
}

function copyFor(language: string) {
  const t: Record<string, Record<string, string>> = {
    en: {
      near: 'Near you',
      regions: 'Other regions',
      placesCount: 'places',
      placeCount: 'place',
      signalsCount: 'signals',
      signalCount: 'signal',
      tapToExpand: 'Tap to expand',
      emptyContinent: 'No active signals in this region.',
      searchPlaceholder: 'Search a city, region, or country',
      searchClear: 'Clear',
      searchEmpty: 'No signals match',
      searchResults: 'Search results',
      showMore: 'Show more',
      following: 'Following',
      followingMore: 'more on /profile',
      openProtections: 'Open protections without a signal yet',
      openProtectionsBody:
        'These places have a real question you can answer right now, even though no risk signal called it out yet.',
    },
    pt: {
      near: 'Perto de você',
      regions: 'Outras regiões',
      placesCount: 'locais',
      placeCount: 'local',
      signalsCount: 'sinais',
      signalCount: 'sinal',
      tapToExpand: 'Toque para abrir',
      emptyContinent: 'Sem sinais ativos nesta região.',
      searchPlaceholder: 'Buscar cidade, região ou país',
      searchClear: 'Limpar',
      searchEmpty: 'Nenhum sinal encontrado',
      searchResults: 'Resultados',
      showMore: 'Mostrar mais',
      following: 'Seguindo',
      followingMore: 'mais em /profile',
      openProtections: 'Proteções abertas sem sinal ainda',
      openProtectionsBody:
        'Esses lugares têm uma pergunta de verdade que você já pode responder, mesmo sem nenhum sinal de risco ter avisado ainda.',
    },
    es: {
      near: 'Cerca de ti',
      regions: 'Otras regiones',
      placesCount: 'lugares',
      placeCount: 'lugar',
      signalsCount: 'señales',
      signalCount: 'señal',
      tapToExpand: 'Toca para expandir',
      emptyContinent: 'Sin señales activas en esta región.',
      searchPlaceholder: 'Buscar ciudad, región o país',
      searchClear: 'Limpiar',
      searchEmpty: 'Sin resultados',
      searchResults: 'Resultados',
      showMore: 'Mostrar más',
      following: 'Siguiendo',
      followingMore: 'más en /profile',
      openProtections: 'Protecciones abiertas sin señal todavía',
      openProtectionsBody:
        'Estos lugares tienen una pregunta real que ya puedes responder, aunque ninguna señal de riesgo la haya anunciado todavía.',
    },
    fr: {
      near: 'Près de vous',
      regions: 'Autres régions',
      placesCount: 'lieux',
      placeCount: 'lieu',
      signalsCount: 'signaux',
      signalCount: 'signal',
      tapToExpand: 'Toucher pour ouvrir',
      emptyContinent: 'Aucun signal actif dans cette région.',
      searchPlaceholder: 'Chercher une ville, région ou pays',
      searchClear: 'Effacer',
      searchEmpty: 'Aucun résultat',
      searchResults: 'Résultats',
      showMore: 'Voir plus',
      following: 'Suivis',
      followingMore: 'plus sur /profile',
      openProtections: 'Protections ouvertes sans signal pour l’instant',
      openProtectionsBody:
        'Ces lieux ont une vraie question à laquelle tu peux déjà répondre, même si aucun signal de risque ne l’a encore signalée.',
    },
    de: {
      near: 'In deiner Nähe',
      regions: 'Andere Regionen',
      placesCount: 'Orte',
      placeCount: 'Ort',
      signalsCount: 'Signale',
      signalCount: 'Signal',
      tapToExpand: 'Tippen zum Öffnen',
      emptyContinent: 'Keine aktiven Signale in dieser Region.',
      searchPlaceholder: 'Stadt, Region oder Land suchen',
      searchClear: 'Löschen',
      searchEmpty: 'Keine Ergebnisse',
      searchResults: 'Ergebnisse',
      showMore: 'Mehr anzeigen',
      following: 'Gefolgt',
      followingMore: 'mehr auf /profile',
      openProtections: 'Offene Absicherungen ohne eigenes Signal',
      openProtectionsBody:
        'Diese Orte haben eine echte Frage, die du schon beantworten kannst, auch wenn noch kein Risiko-Signal sie angezeigt hat.',
    },
    zh: {
      near: '你附近',
      regions: '其他地区',
      placesCount: '个地点',
      placeCount: '个地点',
      signalsCount: '个信号',
      signalCount: '个信号',
      tapToExpand: '点击展开',
      emptyContinent: '该地区暂无活跃信号。',
      searchPlaceholder: '搜索城市、地区或国家',
      searchClear: '清除',
      searchEmpty: '无匹配结果',
      searchResults: '搜索结果',
      showMore: '查看更多',
      following: '已关注',
      followingMore: '更多在 /profile',
      openProtections: '尚无信号的开放保护',
      openProtectionsBody: '这些地方已经有一个真实的问题你可以现在回答，即使还没有风险信号提示过。',
    },
  };
  return t[language] ?? t.en;
}

// ─────────────────────────────────────────────────────────────────────

export default function SignalsGroupedView({
  signals,
  userLat,
  userLon,
  nearCount = 5,
  searchQuery,
  onSearchChange,
  orphanMarkets = [],
}: {
  signals: LocalSignalWithPlace[];
  userLat: number | null;
  userLon: number | null;
  nearCount?: number;
  /** URL-backed search string. When non-empty the view renders a flat
   *  ranked list of matches instead of the continent/country hierarchy. */
  searchQuery?: string;
  /** Called when the user types in or clears the search input. */
  onSearchChange?: (q: string) => void;
  /** Open, answerable markets no active signal points to yet. Rendered
   *  between Near you and Following, first 3 fully expanded to match
   *  the Near you column above, the rest (if any) compact. */
  orphanMarkets?: Market[];
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const locale = (language ?? 'en') as Locale;
  const copy = copyFor(language);

  const hasUserLoc = typeof userLat === 'number' && typeof userLon === 'number';

  // Followed places — drives the new "Following" section between
  // Near you and the continent hierarchy. Read once from localStorage
  // via useFavorites; the hook listens for cross-tab updates so the
  // section stays in sync when the user toggles a Follow on
  // /places/[slug].
  const { favorites } = useFavorites();
  const followedSet = useMemo(() => new Set(favorites), [favorites]);

  // Local mirror of the URL search so typing feels instant. The parent
  // page debounces nothing for v1 — push is cheap and the wire-up keeps
  // search shareable. If perf shows up as a problem we can debounce
  // here without changing the public API.
  const [localSearch, setLocalSearch] = useState(searchQuery ?? '');
  // Keep local in sync if the URL changes from outside (back/forward
  // button, IntentLauncher arrival, etc.).
  useEffect(() => {
    setLocalSearch(searchQuery ?? '');
  }, [searchQuery]);

  const searchActive = localSearch.trim().length > 0;

  useEffect(() => {
    if (!onSearchChange) return;
    if (localSearch === (searchQuery ?? '')) return;

    const handle = window.setTimeout(() => {
      onSearchChange(localSearch);
    }, 260);

    return () => window.clearTimeout(handle);
  }, [localSearch, searchQuery, onSearchChange]);

  // Paginação para o modo busca. A hierarquia (sem search) já está
  // colapsada por padrão; só o flat list de resultados precisa.
  const SEARCH_PAGE_SIZE = 20;
  const [searchShown, setSearchShown] = useState(SEARCH_PAGE_SIZE);
  useEffect(() => {
    setSearchShown(SEARCH_PAGE_SIZE);
  }, [searchQuery]);

  // Split signals into three buckets in priority order:
  //   1. nearby     — closest N unique places to user (or first N if no loc)
  //   2. following  — signals from favorited places not already in nearby
  //   3. byContinent — everything else, grouped for the hierarchy
  //
  // Dedupe rule: a signal lands in the first bucket it qualifies for.
  // Near-you wins (you don't need a "Following" reminder of a place that
  // already shows up at the top via proximity). Following wins over the
  // hierarchy (curated > generic).
  const { nearby, following, byContinent } = useMemo(() => {
    if (signals.length === 0) {
      return {
        nearby: [] as LocalSignalWithPlace[],
        following: [] as LocalSignalWithPlace[],
        byContinent: new Map<string, LocalSignalWithPlace[]>(),
      };
    }

    // Step 1: pick `nearby`.
    let near: LocalSignalWithPlace[] = [];
    let rest: LocalSignalWithPlace[] = [];

    if (!hasUserLoc) {
      // No location → show first N as "Near you" (already severity-sorted
      // upstream), the rest go through the next buckets.
      near = signals.slice(0, nearCount);
      rest = signals.slice(nearCount);
    } else {
      const withDistance = signals.map((s) => ({
        signal: s,
        distance: distanceKm(
          { lat: userLat!, lon: userLon! },
          { lat: s.place.lat, lon: s.place.lon },
        ),
      }));
      withDistance.sort((a, b) => a.distance - b.distance);

      const seenNearPlaces = new Set<string>();
      for (const { signal } of withDistance) {
        if (near.length < nearCount && !seenNearPlaces.has(signal.place.slug)) {
          near.push(signal);
          seenNearPlaces.add(signal.place.slug);
        } else if (seenNearPlaces.has(signal.place.slug)) {
          // Additional signals for an already-near place stay under Near you.
          near.push(signal);
        } else {
          rest.push(signal);
        }
      }
    }

    // Step 2: split `rest` into following + hierarchy.
    const followedAll: LocalSignalWithPlace[] = [];
    const remaining: LocalSignalWithPlace[] = [];
    for (const s of rest) {
      if (followedSet.has(s.place.slug)) followedAll.push(s);
      else remaining.push(s);
    }

    // Rank followed signals: severity → anomaly score → place name.
    // Cap to MAX_FOLLOWING_CARDS so a user with many follows doesn't
    // blow out the section. Overflow stays accessible via the hierarchy
    // and the /profile Following list.
    followedAll.sort((a, b) => {
      const sevA = SEVERITY_RANK[a.severity] ?? 0;
      const sevB = SEVERITY_RANK[b.severity] ?? 0;
      if (sevA !== sevB) return sevB - sevA;
      const anomA = a.bodyValues?.anomaly_score
        ? Number(a.bodyValues.anomaly_score)
        : 0;
      const anomB = b.bodyValues?.anomaly_score
        ? Number(b.bodyValues.anomaly_score)
        : 0;
      if (anomA !== anomB) return anomB - anomA;
      return a.place.name.localeCompare(b.place.name);
    });
    const followingCapped = followedAll.slice(0, MAX_FOLLOWING_CARDS);

    // Step 3: group remaining (non-followed, non-near) by continent.
    const map = new Map<string, LocalSignalWithPlace[]>();
    for (const s of remaining) {
      const cont = continentForCountry(s.place.country);
      if (!map.has(cont)) map.set(cont, []);
      map.get(cont)!.push(s);
    }

    return { nearby: near, following: followingCapped, byContinent: map };
  }, [signals, userLat, userLon, hasUserLoc, nearCount, followedSet]);

  const followingOverflow = useMemo(() => {
    // Count of follow-matched signals beyond the visible cap, so the
    // header can hint at the "(N more on /profile)" overflow if any.
    let total = 0;
    for (const s of signals) {
      if (
        followedSet.has(s.place.slug) &&
        !nearby.some((n) => n.id === s.id)
      ) {
        total++;
      }
    }
    return Math.max(0, total - following.length);
  }, [signals, followedSet, nearby, following]);

  // Order continents by their nearest place's distance to user. If we
  // don't have a user location, fall back to a sensible default order
  // (severity → name).
  const orderedContinents = useMemo(() => {
    const entries = Array.from(byContinent.entries());
    entries.sort((a, b) => {
      if (hasUserLoc) {
        const minA = Math.min(
          ...a[1].map((s) =>
            distanceKm({ lat: userLat!, lon: userLon! }, { lat: s.place.lat, lon: s.place.lon })
          )
        );
        const minB = Math.min(
          ...b[1].map((s) =>
            distanceKm({ lat: userLat!, lon: userLon! }, { lat: s.place.lat, lon: s.place.lon })
          )
        );
        return minA - minB;
      }
      // Tiebreak by best severity then name
      return (
        (SEVERITY_RANK[topSeverityIn(b[1])] ?? 0) -
          (SEVERITY_RANK[topSeverityIn(a[1])] ?? 0) || a[0].localeCompare(b[0])
      );
    });
    return entries;
  }, [byContinent, hasUserLoc, userLat, userLon]);

  // ── Search input renderer — used in both branches below ────────────
  const searchInput = (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <input
        id="signals-search"
        name="signals-search"
        value={localSearch}
        onChange={(e) => {
          setLocalSearch(e.target.value);
        }}
        placeholder={copy.searchPlaceholder}
        aria-label={copy.searchPlaceholder}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: `1.5px solid ${searchActive ? C.accent : C.divider}`,
          background: C.surfaceHigh,
          color: C.text,
          borderRadius: R.lg,
          padding: '13px 44px 13px 42px',
          fontFamily: fonts.sans,
          fontSize: 15,
          outline: 'none',
          transition: 'border-color 120ms ease-out',
        }}
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 16,
          height: 16,
          stroke: C.textMuted,
          fill: 'none',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          pointerEvents: 'none',
        }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      {searchActive ? (
        <button
          type="button"
          onClick={() => {
            setLocalSearch('');
            onSearchChange?.('');
          }}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            border: 'none',
            background: 'transparent',
            color: C.textMuted,
            cursor: 'pointer',
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            padding: '4px 6px',
          }}
        >
          {copy.searchClear}
        </button>
      ) : null}
    </div>
  );

  // ── Search-active branch: render a flat ranked list ───────────────
  // The /signals page has already filtered `signals` by the ?place=
  // URL param. Here we just bypass the hierarchy and present the
  // results as a single column (or 2-col on desktop via the same
  // .k-signals-feed-grid class).
  if (searchActive) {
    return (
      <div>
        {searchInput}
        {signals.length === 0 ? (
          <div
            style={{
              ...neu.subtle,
              borderRadius: R.lg,
              padding: '14px 16px',
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textMuted,
              textAlign: 'center',
            }}
          >
            {copy.searchEmpty} &ldquo;{localSearch.trim() || searchQuery}&rdquo;
          </div>
        ) : (
          <>
            <h2
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: C.textMutedStrong,
                margin: '4px 0 12px',
              }}
            >
              {copy.searchResults} ({signals.length})
            </h2>
            <div className="k-signals-feed-grid">
              {signals.slice(0, searchShown).map((s) => (
                <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
              ))}
            </div>
            {searchShown < signals.length ? (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setSearchShown((n) => n + SEARCH_PAGE_SIZE)}
                  style={{
                    ...neu.controlRaised,
                    border: 'none',
                    background: 'transparent',
                    padding: '10px 18px',
                    borderRadius: R.pill,
                    fontFamily: fonts.sans,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.text,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  {copy.showMore}
                  <span style={{ fontFamily: fonts.mono, fontSize: 11, color: C.textMuted }}>
                    +{signals.length - searchShown}
                  </span>
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {searchInput}
      {/* Near you — fully expanded list of nearest signals. */}
      {nearby.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: C.textMutedStrong,
              margin: '8px 0 12px',
            }}
          >
            {copy.near}
          </h2>
          {/* Class controls multi-column layout at ≥1024px (scoped
              CSS in /signals/page.tsx). On mobile the cards keep
              their natural single-column flow with the SignalCard's
              own marginBottom doing the spacing. */}
          <div className="k-signals-feed-grid">
            {nearby.map((s) => (
              <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
            ))}
          </div>
        </section>
      )}

      {/* Open protections without a signal yet: genuinely open markets
          no active signal points to. Sits right after Near you, first 3
          fully expanded (k-signals-feed-grid, same as Near you above) so
          it reads as a continuation of that column rather than a
          separate, lesser section. */}
      {orphanMarkets.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: C.textMutedStrong,
              margin: '8px 0 4px',
            }}
          >
            {copy.openProtections}
          </h2>
          <p
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              color: C.textSoft,
              lineHeight: 1.5,
              margin: '0 0 12px',
            }}
          >
            {copy.openProtectionsBody}
          </p>
          <div className="k-signals-feed-grid">
            {orphanMarkets.slice(0, 3).map((m) => (
              <MarketCard key={m.id.toString()} m={m} />
            ))}
          </div>
          {orphanMarkets.length > 3 ? (
            <div style={{ marginTop: 8 }}>
              <CompactMarketGrid
                markets={orphanMarkets.slice(3)}
                className="k-signals-orphan-grid"
              />
            </div>
          ) : null}
        </section>
      )}

      {/* Following — curated places the user has favorited. Sits between
          Near you (proximity) and Other regions (everything else) so
          followed signals are one scroll away regardless of geography.
          Capped at MAX_FOLLOWING_CARDS sorted by severity → anomaly →
          name. Overflow stays visible in /profile's Following list and
          via search. */}
      {following.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: C.textMutedStrong,
              margin: '8px 0 12px',
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>{copy.following}</span>
            {followingOverflow > 0 ? (
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                  textTransform: 'none',
                  color: C.textMuted,
                  opacity: 0.85,
                }}
              >
                +{followingOverflow} {copy.followingMore}
              </span>
            ) : null}
          </h2>
          <div className="k-signals-feed-grid">
            {following.map((s) => (
              <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
            ))}
          </div>
        </section>
      )}

      {/* Other regions — collapsed continent sections */}
      {orderedContinents.length > 0 && (
        <section>
          <h2
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: C.textMutedStrong,
              margin: '20px 0 12px',
            }}
          >
            {copy.regions}
          </h2>

          {orderedContinents.map(([continent, contSignals]) => (
            <ContinentSection
              key={continent}
              continent={continent}
              signals={contSignals}
              copy={copy}
              locale={locale}
              C={C}
              fonts={fonts}
              neu={neu}
              R={R}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function ContinentSection({
  continent,
  signals,
  copy,
  locale,
  C,
  fonts,
  neu,
  R,
}: {
  continent: string;
  signals: LocalSignalWithPlace[];
  copy: Record<string, string>;
  locale: Locale;
  C: any;
  fonts: any;
  neu: any;
  R: any;
}) {
  const [open, setOpen] = useState(false);
  const places = new Set(signals.map((s) => s.place.slug));
  const topSev = topSeverityIn(signals);
  const topMeta = topSev ? severityMeta(topSev as any) : null;
  const sevLabel = topMeta
    ? resolveSignalString(locale, topMeta.labelKey)
    : '';

  const toneColor = (() => {
    if (!topMeta) return C.textMuted;
    switch (topMeta.tone) {
      case 'critical':
        return C.below;
      case 'warning':
        return C.below;
      case 'caution':
        return C.label;
      case 'positive':
      case 'positive_strong':
        return C.above;
      default:
        return C.textSoft;
    }
  })();

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...neu.panelRaised,
          width: '100%',
          textAlign: 'left',
          padding: '14px 16px',
          borderRadius: R.lg,
          border: 'none',
          color: C.text,
          fontFamily: fonts.sans,
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 17,
              fontWeight: 600,
            }}
          >
            {continent}
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: fonts.mono,
              fontSize: 11,
              color: C.textMuted,
              letterSpacing: 0.5,
            }}
          >
            {places.size} {places.size === 1 ? copy.placeCount : copy.placesCount} ·{' '}
            {signals.length} {signals.length === 1 ? copy.signalCount : copy.signalsCount}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sevLabel && (
            <span
              style={{
                padding: '3px 8px',
                borderRadius: R.pill,
                background: `${toneColor}22`,
                color: toneColor,
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              {sevLabel}
            </span>
          )}
          <span style={{ fontSize: 14, color: C.textMuted }}>
            {open ? '▴' : '▾'}
          </span>
        </div>
      </button>

      {open && (
        <ContinentBody
          signals={signals}
          copy={copy}
          locale={locale}
          C={C}
          fonts={fonts}
          neu={neu}
          R={R}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Body of an expanded continent. Two render modes:
//   - Sparse: ≤2 places OR all places in 1 country → flat list of
//     SignalCards (no extra layer of disclosure).
//   - Dense: ≥3 places spread across ≥2 countries → one CountrySection
//     per country. Each country is independently collapsible so the
//     user only opens the ones they care about.

function ContinentBody({
  signals,
  copy,
  locale,
  C,
  fonts,
  neu,
  R,
}: {
  signals: LocalSignalWithPlace[];
  copy: Record<string, string>;
  locale: Locale;
  C: any;
  fonts: any;
  neu: any;
  R: any;
}) {
  const { byCountry, shouldSubGroup } = useMemo(() => {
    const map = new Map<string, LocalSignalWithPlace[]>();
    const places = new Set<string>();
    for (const s of signals) {
      const c = s.place.country || 'Other';
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(s);
      places.add(s.place.slug);
    }
    // Disclosure rule: country layer adds value only when there are
    // enough places AND they span at least two countries. One country
    // → no point making the user tap through a redundant header.
    const shouldSubGroup = places.size >= 3 && map.size >= 2;
    return { byCountry: map, shouldSubGroup };
  }, [signals]);

  if (!shouldSubGroup) {
    return (
      <div className="k-signals-feed-grid" style={{ marginTop: 10 }}>
        {signals.map((s) => (
          <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
        ))}
      </div>
    );
  }

  // Order countries by severity (worst first), then by place count.
  const orderedCountries = Array.from(byCountry.entries()).sort(
    ([, a], [, b]) => {
      const sevA = SEVERITY_RANK[topSeverityIn(a)] ?? 0;
      const sevB = SEVERITY_RANK[topSeverityIn(b)] ?? 0;
      if (sevA !== sevB) return sevB - sevA;
      return b.length - a.length;
    },
  );

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
      {orderedCountries.map(([country, countrySignals]) => (
        <CountrySection
          key={country}
          country={country}
          signals={countrySignals}
          copy={copy}
          locale={locale}
          C={C}
          fonts={fonts}
          neu={neu}
          R={R}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Country sub-section. Mirrors ContinentSection shape (collapsible
// header with count + worst-severity pill) but at one level deeper.
// Visually distinguished by being slightly inset and using a flatter
// header so the hierarchy reads correctly.

function CountrySection({
  country,
  signals,
  copy,
  locale,
  C,
  fonts,
  neu,
  R,
}: {
  country: string;
  signals: LocalSignalWithPlace[];
  copy: Record<string, string>;
  locale: Locale;
  C: any;
  fonts: any;
  neu: any;
  R: any;
}) {
  const [open, setOpen] = useState(false);
  const places = new Set(signals.map((s) => s.place.slug));
  const topSev = topSeverityIn(signals);
  const topMeta = topSev ? severityMeta(topSev as any) : null;
  const sevLabel = topMeta
    ? resolveSignalString(locale, topMeta.labelKey)
    : '';

  const toneColor = (() => {
    if (!topMeta) return C.textMuted;
    switch (topMeta.tone) {
      case 'critical':
      case 'warning':
        return C.below;
      case 'caution':
        return C.label;
      case 'positive':
      case 'positive_strong':
        return C.above;
      default:
        return C.textSoft;
    }
  })();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px',
          borderRadius: R.md,
          border: `1px solid ${C.divider}`,
          background: 'transparent',
          color: C.text,
          fontFamily: fonts.sans,
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              fontWeight: 600,
              color: C.text,
            }}
          >
            {country}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: fonts.mono,
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: 0.4,
            }}
          >
            {places.size} {places.size === 1 ? copy.placeCount : copy.placesCount} ·{' '}
            {signals.length} {signals.length === 1 ? copy.signalCount : copy.signalsCount}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sevLabel && (
            <span
              style={{
                padding: '2px 7px',
                borderRadius: R.pill,
                background: `${toneColor}22`,
                color: toneColor,
                fontFamily: fonts.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
              }}
            >
              {sevLabel}
            </span>
          )}
          <span style={{ fontSize: 12, color: C.textMuted }}>
            {open ? '▴' : '▾'}
          </span>
        </div>
      </button>

      {open && (
        <CountryBody
          signals={signals}
          copy={copy}
          locale={locale}
          C={C}
          fonts={fonts}
          R={R}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Body of an expanded country. Two render modes, mirroring
// ContinentBody one level deeper:
//   - Sparse: ≤2 places OR all places in 1 region (or null regions) →
//     flat list. The country layer already adds enough disclosure.
//   - Dense: ≥3 places spread across ≥2 named regions → group by
//     region. For US that means state, for Brazil estado, for India
//     state, for any country it's whatever public.places.region says.

function CountryBody({
  signals,
  copy,
  locale,
  C,
  fonts,
  R,
}: {
  signals: LocalSignalWithPlace[];
  copy: Record<string, string>;
  locale: Locale;
  C: any;
  fonts: any;
  R: any;
}) {
  const { byRegion, shouldSubGroup } = useMemo(() => {
    const map = new Map<string, LocalSignalWithPlace[]>();
    const places = new Set<string>();
    const namedRegions = new Set<string>();
    for (const s of signals) {
      const r = (s.place.region ?? '').trim();
      const bucket = r || '__unspecified__';
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(s);
      places.add(s.place.slug);
      if (r) namedRegions.add(r);
    }
    // Disclosure: subgroup only when there are enough places AND
    // they span at least two named regions. A country with one US
    // state covered or all-null regions stays flat.
    const shouldSubGroup = places.size >= 3 && namedRegions.size >= 2;
    return { byRegion: map, shouldSubGroup };
  }, [signals]);

  if (!shouldSubGroup) {
    return (
      <div className="k-signals-feed-grid" style={{ marginTop: 8 }}>
        {signals.map((s) => (
          <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
        ))}
      </div>
    );
  }

  // Order regions by severity, then by place count. Unspecified region
  // (if any signals slipped through without a region) lands last.
  const orderedRegions = Array.from(byRegion.entries()).sort(([ak, a], [bk, b]) => {
    if (ak === '__unspecified__' && bk !== '__unspecified__') return 1;
    if (bk === '__unspecified__' && ak !== '__unspecified__') return -1;
    const sevA = SEVERITY_RANK[topSeverityIn(a)] ?? 0;
    const sevB = SEVERITY_RANK[topSeverityIn(b)] ?? 0;
    if (sevA !== sevB) return sevB - sevA;
    return b.length - a.length;
  });

  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
      {orderedRegions.map(([region, regionSignals]) => (
        <RegionSection
          key={region}
          region={region === '__unspecified__' ? '' : region}
          signals={regionSignals}
          copy={copy}
          locale={locale}
          C={C}
          fonts={fonts}
          R={R}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Region/state sub-section. One level deeper than CountrySection;
// visually flatter (smaller padding, no background panel) so the
// hierarchy reads correctly when continent → country → region all
// stack open at once.

function RegionSection({
  region,
  signals,
  copy,
  locale,
  C,
  fonts,
  R,
}: {
  region: string;
  signals: LocalSignalWithPlace[];
  copy: Record<string, string>;
  locale: Locale;
  C: any;
  fonts: any;
  R: any;
}) {
  const [open, setOpen] = useState(false);
  const places = new Set(signals.map((s) => s.place.slug));
  const topSev = topSeverityIn(signals);
  const topMeta = topSev ? severityMeta(topSev as any) : null;
  const sevLabel = topMeta
    ? resolveSignalString(locale, topMeta.labelKey)
    : '';

  const toneColor = (() => {
    if (!topMeta) return C.textMuted;
    switch (topMeta.tone) {
      case 'critical':
      case 'warning':
        return C.below;
      case 'caution':
        return C.label;
      case 'positive':
      case 'positive_strong':
        return C.above;
      default:
        return C.textSoft;
    }
  })();

  const label = region || copy.emptyContinent;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '7px 12px',
          borderRadius: R.md,
          border: 'none',
          background: 'transparent',
          color: C.textSoft,
          fontFamily: fonts.sans,
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? '▾' : '▸'}</span>
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              fontWeight: 500,
              color: C.text,
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: 0.3,
            }}
          >
            · {places.size} {places.size === 1 ? copy.placeCount : copy.placesCount}
          </span>
        </div>
        {sevLabel ? (
          <span
            style={{
              padding: '2px 6px',
              borderRadius: R.pill,
              background: `${toneColor}1A`,
              color: toneColor,
              fontFamily: fonts.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
            }}
          >
            {sevLabel}
          </span>
        ) : null}
      </button>
      {open && (
        <div className="k-signals-feed-grid" style={{ marginTop: 6, paddingLeft: 8 }}>
          {signals.map((s) => (
            <SignalCard key={s.id} signal={s} showPlace marketContext={s.marketContext} />
          ))}
        </div>
      )}
    </div>
  );
}
