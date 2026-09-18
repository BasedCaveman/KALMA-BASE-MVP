// kalma/frontend/app/signals/page.tsx
//
// Dedicated signals feed page - the daily habit loop.

'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocationContext } from '@/hooks/useLocationContext';
import {
  useLocalSignalsNearby,
  ACTIVE_SIGNALS_FETCH_CAP,
} from '@/hooks/useLocalSignals';
import { type Market } from '@/hooks/useMarkets';
import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';
import { useFavorites } from '@/hooks/useFavorites';
import { findOrphanMarkets } from '@/lib/signal-engine/signal-action';
import SignalsGroupedView from '@/components/signal/SignalsGroupedView';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import CityPill from '@/components/shared/CityPill';
import {
  signalTypesForRisks,
  formatHorizonLabel,
  chipLabel,
} from '@/components/landing/IntentLauncher';

const SIGNAL_RISKS: Array<{ id: string; label: string }> = [
  { id: 'rain', label: 'Rain' },
  { id: 'heat', label: 'Heat' },
  { id: 'cold', label: 'Cold' },
  { id: 'drought', label: 'Drought' },
];

const SIGNAL_SEVERITIES: Array<{ id: string; label: string }> = [
  { id: 'extreme', label: 'Extreme' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'active', label: 'Active' },
  { id: 'strong', label: 'Strong' },
  { id: 'low', label: 'Low' },
];

type FollowingPlaceSummary = {
  slug: string;
  label: string;
};

const signalsLayoutCSS = `
  .k-signals-toolbar { display: none; }
  @media (max-width: 360px) {
    .k-signals-mobile-place-tail { display: none !important; }
  }

  @media (min-width: 1024px) {
    .k-signals-mobile-place { display: none !important; }

    .k-signals-layout {
      display: block;
    }

    .k-signals-toolbar {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      align-items: stretch;
      margin: 18px 0 22px;
    }

    .k-signals-toolbar-card {
      min-height: 168px;
    }

    .k-signals-toolbar-filter-row {
      display: grid;
      grid-template-columns: 78px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
    }

    .k-signals-toolbar-filter-row + .k-signals-toolbar-filter-row {
      margin-top: 14px;
    }

    .k-signals-toolbar-saved-grid {
      display: grid;
      gap: 12px;
    }

    .k-signals-saved-row {
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
    }

    .k-signals-toolbar-strip {
      display: grid;
      grid-template-columns: 100px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .k-signals-toolbar-strip-items {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      min-width: 0;
    }

    .k-signals-positions-note {
      margin-top: 2px;
    }

    .k-signals-feed-shell > div > div:first-child {
      display: none !important;
    }

    /* Real grid (not column-count masonry): CSS multi-column balances column
       heights, which staggers the top of each column. A grid with
       align-items:start keeps every row flush at the top — the first row of
       signals is always aligned. */
    .k-signals-feed-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 14px;
      align-items: start;
    }

    .k-signals-feed-grid > * {
      min-width: 0;
      margin: 0 !important;
    }
  }

  @media (min-width: 1320px) {
    .k-signals-feed-grid {
      gap: 16px;
    }
  }

  @media (max-width: 1023px) {
    .k-signals-layout {
      display: block;
    }

    .k-signals-feed-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
    }
  }
`;

function pageCopy(language: string) {
  const t: Record<string, Record<string, string>> = {
    en: {
      title: 'Signals',
      intro:
        'Local weather signals from across Kalma, sorted by what is closest to you.',
      introNoLocation:
        'Set a saved place in Profile to see signals near you first.',
      loading: 'Loading signals...',
      empty: 'No active signals right now. Check back tomorrow.',
      noPlaceSignals: 'No signals for {place} yet — here are the nearest ones.',
      nearestSignals: 'Nearest signals',
      addCity: 'Open missing risk signal',
      savedPlace: 'Saved place',
      noPlace: 'No place set',
      change: 'Change',
      searchPlaceholder: 'Search a city, region, or country',
      filteredBy: 'Filtered by',
      placeFilter: 'Place',
      audienceFilter: 'For',
      riskFilter: 'Risk',
      severityFilter: 'Severity',
      whenFilter: 'When',
      removePlaceFilter: 'Remove place filter',
      removeAudienceFilter: 'Remove audience filter',
      removeRiskFilter: 'Remove risk filter',
      removeSeverityFilter: 'Remove severity filter',
      removeHorizonFilter: 'Remove horizon filter',
      clearAll: 'Clear all',
      clearAllFilters: 'Clear filters',
      clearSearch: 'Clear search',
      risk: 'Risk',
      severity: 'Severity',
      risk_rain: 'Rain',
      risk_heat: 'Heat',
      risk_cold: 'Cold',
      risk_drought: 'Drought',
      sev_extreme: 'Extreme',
      sev_high: 'High',
      sev_medium: 'Medium',
      sev_active: 'Active',
      sev_strong: 'Strong',
      sev_low: 'Low',
      following: 'Following',
      positions: 'Positions',
      noFollowing: 'Not following places yet',
      noPositions: 'No resolving positions',
      positionsNote:
        'Displaying the three positions nearest to their resolution date first.',
    },
    pt: {
      title: 'Sinais',
      intro:
        'Sinais climáticos locais de toda a Kalma, ordenados pelo que está mais perto de você.',
      introNoLocation:
        'Defina sua localização no Perfil para ver primeiro os sinais perto de você.',
      loading: 'Carregando sinais...',
      empty: 'Nenhum sinal ativo no momento. Volte amanhã.',
      noPlaceSignals:
        'Ainda não há sinais para {place} — veja os mais próximos.',
      nearestSignals: 'Sinais mais próximos',
      addCity: 'Abrir sinal de risco faltante',
      savedPlace: 'Local salvo',
      noPlace: 'Nenhum local definido',
      change: 'Trocar',
      searchPlaceholder: 'Buscar cidade, região ou país',
      filteredBy: 'Filtrado por',
      placeFilter: 'Local',
      audienceFilter: 'Para',
      riskFilter: 'Risco',
      severityFilter: 'Severidade',
      whenFilter: 'Quando',
      removePlaceFilter: 'Remover filtro de local',
      removeAudienceFilter: 'Remover filtro de público',
      removeRiskFilter: 'Remover filtro de risco',
      removeSeverityFilter: 'Remover filtro de severidade',
      removeHorizonFilter: 'Remover filtro de período',
      clearAll: 'Limpar tudo',
      clearAllFilters: 'Limpar filtros',
      clearSearch: 'Limpar busca',
      risk: 'Risco',
      severity: 'Severidade',
      risk_rain: 'Chuva',
      risk_heat: 'Calor',
      risk_cold: 'Frio',
      risk_drought: 'Seca',
      sev_extreme: 'Extremo',
      sev_high: 'Alto',
      sev_medium: 'Médio',
      sev_active: 'Ativo',
      sev_strong: 'Forte',
      sev_low: 'Baixo',
      following: 'Seguindo',
      positions: 'Posições',
      noFollowing: 'Sem locais seguidos ainda',
      noPositions: 'Sem posições a resolver',
      positionsNote: 'Até três mais próximas de resolver primeiro.',
    },
    es: {
      title: 'Señales',
      intro:
        'Señales climáticas locales de toda Kalma, ordenadas por lo que está más cerca de ti.',
      introNoLocation:
        'Define un lugar guardado en Perfil para ver primero las señales cerca de ti.',
      loading: 'Cargando señales...',
      empty: 'No hay señales activas ahora. Vuelve mañana.',
      noPlaceSignals:
        'Aún no hay señales para {place} — aquí están las más cercanas.',
      nearestSignals: 'Señales más cercanas',
      addCity: 'Abrir señal de riesgo faltante',
      savedPlace: 'Lugar guardado',
      noPlace: 'Ningún lugar definido',
      change: 'Cambiar',
      searchPlaceholder: 'Buscar ciudad, región o país',
      filteredBy: 'Filtrado por',
      placeFilter: 'Lugar',
      audienceFilter: 'Para',
      riskFilter: 'Riesgo',
      severityFilter: 'Severidad',
      whenFilter: 'Cuándo',
      removePlaceFilter: 'Quitar filtro de lugar',
      removeAudienceFilter: 'Quitar filtro de público',
      removeRiskFilter: 'Quitar filtro de riesgo',
      removeSeverityFilter: 'Quitar filtro de severidad',
      removeHorizonFilter: 'Quitar filtro de período',
      clearAll: 'Limpiar todo',
      clearAllFilters: 'Limpiar filtros',
      clearSearch: 'Limpiar búsqueda',
      risk: 'Riesgo',
      severity: 'Severidad',
      risk_rain: 'Lluvia',
      risk_heat: 'Calor',
      risk_cold: 'Frío',
      risk_drought: 'Sequía',
      sev_extreme: 'Extremo',
      sev_high: 'Alto',
      sev_medium: 'Medio',
      sev_active: 'Activo',
      sev_strong: 'Fuerte',
      sev_low: 'Bajo',
      following: 'Siguiendo',
      positions: 'Posiciones',
      noFollowing: 'Aún no sigues lugares',
      noPositions: 'Sin posiciones por resolver',
      positionsNote: 'Hasta tres más próximas a resolverse primero.',
    },
    fr: {
      title: 'Signaux',
      intro:
        'Signaux météo locaux à travers Kalma, classés par proximité avec vous.',
      introNoLocation:
        'Définissez un lieu enregistré dans Profil pour voir les signaux près de vous en premier.',
      loading: 'Chargement des signaux...',
      empty: 'Aucun signal actif pour le moment. Revenez demain.',
      noPlaceSignals:
        'Pas encore de signaux pour {place} — voici les plus proches.',
      nearestSignals: 'Signaux les plus proches',
      addCity: 'Ouvrir un signal de risque manquant',
      savedPlace: 'Lieu enregistré',
      noPlace: 'Aucun lieu défini',
      change: 'Changer',
      searchPlaceholder: 'Rechercher une ville, région ou pays',
      filteredBy: 'Filtré par',
      placeFilter: 'Lieu',
      audienceFilter: 'Pour',
      riskFilter: 'Risque',
      severityFilter: 'Sévérité',
      whenFilter: 'Quand',
      removePlaceFilter: 'Supprimer le filtre de lieu',
      removeAudienceFilter: "Supprimer le filtre d'audience",
      removeRiskFilter: 'Supprimer le filtre de risque',
      removeSeverityFilter: 'Supprimer le filtre de sévérité',
      removeHorizonFilter: 'Supprimer le filtre de période',
      clearAll: 'Tout effacer',
      clearAllFilters: 'Effacer les filtres',
      clearSearch: 'Effacer la recherche',
      risk: 'Risque',
      severity: 'Sévérité',
      risk_rain: 'Pluie',
      risk_heat: 'Chaleur',
      risk_cold: 'Froid',
      risk_drought: 'Sécheresse',
      sev_extreme: 'Extrême',
      sev_high: 'Élevé',
      sev_medium: 'Moyen',
      sev_active: 'Actif',
      sev_strong: 'Fort',
      sev_low: 'Faible',
      following: 'Suivis',
      positions: 'Positions',
      noFollowing: 'Aucun lieu suivi',
      noPositions: 'Aucune position à résoudre',
      positionsNote:
        "Jusqu'à trois positions les plus proches de la résolution.",
    },
    de: {
      title: 'Signale',
      intro: 'Lokale Wettersignale aus ganz Kalma, sortiert nach Nähe zu dir.',
      introNoLocation:
        'Lege im Profil einen Ort fest, um Signale in deiner Nähe zuerst zu sehen.',
      loading: 'Signale werden geladen...',
      empty: 'Derzeit keine aktiven Signale. Schau morgen wieder vorbei.',
      noPlaceSignals:
        'Noch keine Signale für {place} — hier sind die nächstgelegenen.',
      nearestSignals: 'Nächstgelegene Signale',
      addCity: 'Fehlendes Risiko-Signal öffnen',
      savedPlace: 'Gespeicherter Ort',
      noPlace: 'Kein Ort festgelegt',
      change: 'Ändern',
      searchPlaceholder: 'Stadt, Region oder Land suchen',
      filteredBy: 'Gefiltert nach',
      placeFilter: 'Ort',
      audienceFilter: 'Für',
      riskFilter: 'Risiko',
      severityFilter: 'Schwere',
      whenFilter: 'Wann',
      removePlaceFilter: 'Ortsfilter entfernen',
      removeAudienceFilter: 'Zielgruppenfilter entfernen',
      removeRiskFilter: 'Risikofilter entfernen',
      removeSeverityFilter: 'Schwerefilter entfernen',
      removeHorizonFilter: 'Zeitraumfilter entfernen',
      clearAll: 'Alles löschen',
      clearAllFilters: 'Filter löschen',
      clearSearch: 'Suche löschen',
      risk: 'Risiko',
      severity: 'Schwere',
      risk_rain: 'Regen',
      risk_heat: 'Hitze',
      risk_cold: 'Kälte',
      risk_drought: 'Dürre',
      sev_extreme: 'Extrem',
      sev_high: 'Hoch',
      sev_medium: 'Mittel',
      sev_active: 'Aktiv',
      sev_strong: 'Stark',
      sev_low: 'Gering',
      following: 'Folgen',
      positions: 'Positionen',
      noFollowing: 'Noch keine Orte',
      noPositions: 'Keine Positionen vor Auflösung',
      positionsNote: 'Bis zu drei Positionen, die bald aufgelöst werden.',
    },
    zh: {
      title: '信号',
      intro: '来自 Kalma 各地的本地天气信号，按距离你最近的位置排序。',
      introNoLocation: '在“我的”中设置一个保存位置，以便优先显示你附近的信号。',
      loading: '正在加载信号...',
      empty: '目前没有活跃信号。明天再来查看。',
      noPlaceSignals: '{place} 还没有信号 — 以下是最近的信号。',
      nearestSignals: '最近的信号',
      addCity: '开通缺失的风险信号',
      savedPlace: '保存的位置',
      noPlace: '尚未设置位置',
      change: '更改',
      searchPlaceholder: '搜索城市、地区或国家',
      filteredBy: '筛选',
      placeFilter: '地点',
      audienceFilter: '面向',
      riskFilter: '风险',
      severityFilter: '严重性',
      whenFilter: '时间',
      removePlaceFilter: '移除地点筛选',
      removeAudienceFilter: '移除对象筛选',
      removeRiskFilter: '移除风险筛选',
      removeSeverityFilter: '移除严重性筛选',
      removeHorizonFilter: '移除时间筛选',
      clearAll: '清除全部',
      clearAllFilters: '清除筛选',
      clearSearch: '清除搜索',
      risk: '风险',
      severity: '严重性',
      risk_rain: '降雨',
      risk_heat: '高温',
      risk_cold: '低温',
      risk_drought: '干旱',
      sev_extreme: '极端',
      sev_high: '高',
      sev_medium: '中',
      sev_active: '活跃',
      sev_strong: '强',
      sev_low: '低',
      following: '关注',
      positions: '仓位',
      noFollowing: '暂无关注城市',
      noPositions: '暂无临近结算仓位',
      positionsNote: '最多显示三个最接近结算的仓位。',
    },
  };

  return t[language] ?? t.en;
}

export default function SignalsPage() {
  const { C, fonts, neu, R } = useColors();
  const { language, t } = useTranslation();
  const copy = pageCopy(language);
  const { location } = useLocationContext();
  const { favorites } = useFavorites();

  const { markets } = useMarketsSnapshot(location);
  const positionLatLons = useMemo(
    () =>
      markets
        .filter((m) => m.userHasPosition)
        .map((m) => ({ lat: m.lat, lon: m.lon })),
    [markets],
  );

  // The browse groups every active signal by continent → country → city, so it
  // must not re-truncate the feed. Cap at the fetch ceiling (returns only the
  // rows that exist) so every region shows — the old 200 hid most states.
  const { signals: allSignals, isLoading } = useLocalSignalsNearby({
    lat: location?.lat ?? null,
    lon: location?.lon ?? null,
    limit: ACTIVE_SIGNALS_FETCH_CAP,
    positionLatLons,
  });

  // Markets a place can answer right now that no active local_signal points
  // to yet — /signals and /places/[slug] only ever surfaced a market by way
  // of a signal's own CTA (SignalActionCTA), so a place whose live signals
  // happen to all be one family (e.g. three rain-family signals, no
  // heat/cold one) left its genuinely open temp markets reachable only from
  // /markets and /today. Capped and sorted nearest-first like the rest of
  // this page; this is a bridge to the full browse experience, not a second
  // one.
  const ORPHAN_MARKETS_CAP = 6;
  const orphanMarkets = useMemo(
    () =>
      findOrphanMarkets(allSignals, markets)
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
        .slice(0, ORPHAN_MARKETS_CAP),
    [allSignals, markets],
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFilterPlace = (searchParams?.get('place') ?? '').trim();
  const filterPlace = rawFilterPlace.toLowerCase();
  const [searchDraft, setSearchDraft] = useState(rawFilterPlace);

  // Tracks the value WE last pushed into the `place` URL param (via
  // commitSearch below), so the sync-back effect can tell "the URL changed
  // because our own debounced commit landed" apart from "the URL changed for
  // some other reason" (a chip's ✕, Clear all, browser back/forward, a
  // shared link). router.replace resolves asynchronously, so if the user
  // keeps typing while our own commit is still in flight, its eventual echo
  // must not stomp whatever they've typed since. Only a genuinely external
  // change should ever overwrite the live draft.
  const lastCommittedPlaceRef = useRef(rawFilterPlace);

  useEffect(() => {
    if (rawFilterPlace === lastCommittedPlaceRef.current) return;
    lastCommittedPlaceRef.current = rawFilterPlace;
    setSearchDraft(rawFilterPlace);
  }, [rawFilterPlace]);

  const filterRisks = useMemo(() => {
    const raw = searchParams?.get('risks');
    if (!raw) return [] as string[];
    return raw
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }, [searchParams]);

  const filterHorizon = searchParams?.get('horizon') ?? null;
  const filterFor = searchParams?.get('for') ?? null;

  // Coordinates of the searched place (set by the IntentLauncher after it
  // geocodes the typed city). Used to show the nearest signals when the
  // exact place has none yet.
  const searchLat = (() => {
    const v = Number(searchParams?.get('lat'));
    return Number.isFinite(v) && searchParams?.get('lat') ? v : null;
  })();
  const searchLon = (() => {
    const v = Number(searchParams?.get('lon'));
    return Number.isFinite(v) && searchParams?.get('lon') ? v : null;
  })();

  const filterSeverities = useMemo(() => {
    const raw = searchParams?.get('severity');
    if (!raw) return [] as string[];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchParams]);

  const allowedSignalTypes = useMemo(
    () => new Set(signalTypesForRisks(filterRisks)),
    [filterRisks],
  );

  const allowedSeverities = useMemo(
    () => new Set(filterSeverities),
    [filterSeverities],
  );

  const hasActiveFilters =
    filterPlace.length > 0 ||
    filterRisks.length > 0 ||
    !!filterHorizon ||
    !!filterFor ||
    filterSeverities.length > 0;

  const signals = useMemo(() => {
    if (!hasActiveFilters) return allSignals;

    return allSignals.filter((s) => {
      if (
        allowedSignalTypes.size > 0 &&
        !allowedSignalTypes.has(s.signalTypeId)
      ) {
        return false;
      }

      if (allowedSeverities.size > 0 && !allowedSeverities.has(s.severity)) {
        return false;
      }

      if (filterPlace.length > 0) {
        const haystack = [s.place.name, s.place.region ?? '', s.place.country]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(filterPlace)) return false;
      }

      return true;
    });
  }, [
    allSignals,
    hasActiveFilters,
    allowedSignalTypes,
    allowedSeverities,
    filterPlace,
  ]);

  // Nearest-signals fallback. When the user searched a specific place
  // (lat/lon present) but it has no signals yet, surface the closest
  // signals to that location instead of an empty page — still honouring
  // any risk/severity filters they set, just dropping the place match.
  // Origin for the fallback: the place the user searched (lat/lon from the
  // IntentLauncher) OR — for a logged-in user who just opened local signals and
  // whose own city has none yet — their detected location. Read → Sense → Act:
  // an empty state must never dead-end; always leave something nearby to read.
  const originLat = searchLat ?? location?.lat ?? null;
  const originLon = searchLon ?? location?.lon ?? null;

  const nearestSignals = useMemo(() => {
    if (originLat == null || originLon == null) return [];
    if (signals.length > 0) return []; // only used as an empty-state fallback

    const eligible = allSignals.filter((s) => {
      if (
        allowedSignalTypes.size > 0 &&
        !allowedSignalTypes.has(s.signalTypeId)
      )
        return false;
      if (allowedSeverities.size > 0 && !allowedSeverities.has(s.severity))
        return false;
      return typeof s.place.lat === 'number' && typeof s.place.lon === 'number';
    });

    const toRad = (d: number) => (d * Math.PI) / 180;
    const distKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      const dLat = toRad(bLat - aLat);
      const dLon = toRad(bLon - aLon);
      const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
    };

    return eligible
      .map((s) => ({
        s,
        d: distKm(originLat, originLon, s.place.lat, s.place.lon),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map((x) => x.s);
  }, [
    allSignals,
    signals.length,
    originLat,
    originLon,
    allowedSignalTypes,
    allowedSeverities,
  ]);

  const followingPlaces = useMemo<FollowingPlaceSummary[]>(() => {
    if (favorites.length === 0) return [];

    const signalsBySlug = new Map(
      allSignals.map((signal) => [signal.place.slug, signal.place]),
    );

    return favorites.slice(0, 4).map((slug) => {
      const place = signalsBySlug.get(slug);
      const fallback = cityNameFromSlug(slug);

      return {
        slug,
        label: place ? displayCityName(place.name) : fallback,
      };
    });
  }, [favorites, allSignals]);

  const resolvingPositions = useMemo(
    () =>
      markets
        .filter((m) => m.userHasPosition && !m.resolved && !m.cancelled)
        .sort((a, b) => {
          const aTime =
            typeof a.timeToResolveSec === 'number'
              ? a.timeToResolveSec
              : Number.POSITIVE_INFINITY;
          const bTime =
            typeof b.timeToResolveSec === 'number'
              ? b.timeToResolveSec
              : Number.POSITIVE_INFINITY;
          return aTime - bTime;
        })
        .slice(0, 3),
    [markets],
  );

  const toggleParam = useCallback(
    (key: 'risks' | 'severity', value: string) => {
      const current = new URLSearchParams(searchParams?.toString() ?? '');
      const existing = (current.get(key) ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      const next = existing.includes(value)
        ? existing.filter((v) => v !== value)
        : [...existing, value];

      if (next.length === 0) {
        current.delete(key);
      } else {
        current.set(key, next.join(','));
      }

      const qs = current.toString();
      router.push(qs ? `/signals?${qs}` : '/signals');
    },
    [router, searchParams],
  );

  const hasUserLoc =
    typeof location?.lat === 'number' && typeof location?.lon === 'number';

  const locationLabel = useMemo(() => {
    if (!location || !hasUserLoc) return copy.noPlace;
    return [location.city, location.region, location.country]
      .filter(Boolean)
      .join(', ');
  }, [location, hasUserLoc, copy.noPlace]);

  // "Clear all" — wipes everything (place + filters), used by the active-
  // filters summary bar where the place chip is also shown.
  const clearFilters = useCallback(() => {
    router.push('/signals');
  }, [router]);

  // "Clear filters" — scoped to the filter toggles only (risk / severity /
  // horizon / audience); keeps the selected place. Used by the toolbar so its
  // clear is distinct in scope from the summary bar's "Clear all".
  const clearChips = useCallback(() => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    ['risks', 'severity', 'horizon', 'for', 'activity'].forEach((k) =>
      next.delete(k),
    );
    const qs = next.toString();
    router.push(qs ? `/signals?${qs}` : '/signals');
  }, [router, searchParams]);

  const commitSearch = useCallback(
    (q: string) => {
      const current = new URLSearchParams(searchParams?.toString() ?? '');
      const trimmed = q.trim();

      if (trimmed) current.set('place', trimmed);
      else current.delete('place');

      // Record what we're about to push BEFORE the (async) navigation, so
      // the sync-back effect recognises its own echo when it lands, however
      // late, and does not clobber any typing that happened in between.
      lastCommittedPlaceRef.current = trimmed;

      const qs = current.toString();
      router.replace(qs ? `/signals?${qs}` : '/signals');
    },
    [router, searchParams],
  );

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === rawFilterPlace) return;

    const handle = window.setTimeout(() => {
      commitSearch(searchDraft);
    }, 220);

    return () => window.clearTimeout(handle);
  }, [searchDraft, rawFilterPlace, commitSearch]);

  /** Drop a single URL param (used by the chip ✕ buttons). */
  const removeParam = useCallback(
    (key: string) => {
      const current = new URLSearchParams(searchParams?.toString() ?? '');
      current.delete(key);
      const qs = current.toString();
      router.push(qs ? `/signals?${qs}` : '/signals');
    },
    [router, searchParams],
  );

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <AppHeader
        section={t('nav.signals')}
        rightAction={
          <Link
            href="/create"
            aria-label={copy.addCity}
            style={{
              textDecoration: 'none',
              ...neu.controlRaised,
              width: 52,
              height: 52,
              borderRadius: 18,
              display: 'grid',
              placeItems: 'center',
              color: C.accent,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={22}
              height={22}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </Link>
        }
      />

      <style dangerouslySetInnerHTML={{ __html: signalsLayoutCSS }} />

      <main
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '8px 16px 16px',
        }}
      >
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: 32,
            fontWeight: 600,
            color: C.text,
            margin: '12px 0 4px',
            lineHeight: 1.1,
          }}
        >
          {copy.title}
        </h1>

        <p
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.textSoft,
            lineHeight: 1.5,
            margin: '0 0 14px',
          }}
        >
          {hasUserLoc ? copy.intro : copy.introNoLocation}
        </p>

        <Link
          className="k-signals-mobile-place"
          href="/profile"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
            padding: '8px 12px',
            borderRadius: R.pill,
            background: hasUserLoc ? `${C.accent}14` : 'transparent',
            border: `1px solid ${hasUserLoc ? `${C.accent}55` : C.divider}`,
            color: C.textSoft,
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: 0.6,
            textDecoration: 'none',
            marginBottom: 18,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          <span
            style={{ opacity: 0.7, textTransform: 'uppercase', flexShrink: 0 }}
          >
            {copy.savedPlace}
          </span>
          <span
            style={{
              color: C.text,
              fontWeight: 600,
              minWidth: 0,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {locationLabel}
          </span>
          <span
            className="k-signals-mobile-place-tail"
            style={{ opacity: 0.7, flexShrink: 0 }}
          >
            · {copy.change}
          </span>
        </Link>

        <DesktopSignalToolbar
          C={C}
          fonts={fonts}
          neu={neu}
          R={R}
          copy={copy}
          hasUserLoc={hasUserLoc}
          locationLabel={locationLabel}
          filterRisks={filterRisks}
          filterSeverities={filterSeverities}
          followingPlaces={followingPlaces}
          resolvingPositions={resolvingPositions}
          hasActiveFilters={hasActiveFilters}
          searchDraft={searchDraft}
          onSearchChange={setSearchDraft}
          onToggleRisk={(id) => toggleParam('risks', id)}
          onToggleSeverity={(id) => toggleParam('severity', id)}
          onClearAll={clearChips}
        />

        <div className="k-signals-layout">
          <div style={{ minWidth: 0 }}>
            {hasActiveFilters ? (
              <div
                style={{
                  // Sticky on every viewport so the user always sees
                  // what's filtering the feed, even after scrolling
                  // deep into the hierarchy. AppHeader sits at the
                  // top (~56-64px tall) so we offset accordingly.
                  position: 'sticky',
                  top: 0,
                  zIndex: 30,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 18,
                  padding: '10px 4px',
                  alignItems: 'center',
                  minWidth: 0,
                  background: `${C.bg}EE`,
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  borderBottom: `1px solid ${C.divider}`,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    opacity: 0.6,
                    marginRight: 4,
                  }}
                >
                  {copy.filteredBy}
                </span>

                {filterPlace ? (
                  <FilterChip
                    C={C}
                    fonts={fonts}
                    R={R}
                    onRemove={() => removeParam('place')}
                    removeLabel={copy.removePlaceFilter}
                  >
                    {copy.placeFilter} · {rawFilterPlace || filterPlace}
                  </FilterChip>
                ) : null}

                {filterFor ? (
                  <FilterChip
                    C={C}
                    fonts={fonts}
                    R={R}
                    onRemove={() => removeParam('for')}
                    removeLabel={copy.removeAudienceFilter}
                  >
                    {copy.audienceFilter} · {chipLabel(filterFor, language)}
                  </FilterChip>
                ) : null}

                {filterRisks.length > 0 ? (
                  <FilterChip
                    C={C}
                    fonts={fonts}
                    R={R}
                    onRemove={() => removeParam('risks')}
                    removeLabel={copy.removeRiskFilter}
                  >
                    {copy.riskFilter} ·{' '}
                    {filterRisks
                      .map((id) => copy[`risk_${id}`] ?? id)
                      .join(', ')}
                  </FilterChip>
                ) : null}

                {filterSeverities.length > 0 ? (
                  <FilterChip
                    C={C}
                    fonts={fonts}
                    R={R}
                    onRemove={() => removeParam('severity')}
                    removeLabel={copy.removeSeverityFilter}
                  >
                    {copy.severityFilter} ·{' '}
                    {filterSeverities
                      .map((id) => copy[`sev_${id}`] ?? id)
                      .join(', ')}
                  </FilterChip>
                ) : null}

                {filterHorizon ? (
                  <FilterChip
                    C={C}
                    fonts={fonts}
                    R={R}
                    onRemove={() => removeParam('horizon')}
                    removeLabel={copy.removeHorizonFilter}
                  >
                    {copy.whenFilter} ·{' '}
                    {formatHorizonLabel(filterHorizon, language)}
                  </FilterChip>
                ) : null}

                <button
                  type="button"
                  onClick={clearFilters}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '4px 8px',
                    fontFamily: fonts.sans,
                    fontSize: 12,
                    color: C.textMutedStrong,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  {copy.clearAll}
                </button>
              </div>
            ) : null}

            {isLoading ? (
              <div
                style={{
                  ...neu.subtle,
                  borderRadius: R.lg,
                  padding: '14px 16px',
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: C.textMuted,
                }}
              >
                {copy.loading}
              </div>
            ) : signals.length === 0 && nearestSignals.length > 0 ? (
              // Searched a place with no signals yet → show the nearest
              // ones instead of a dead-end empty state.
              <div>
                <div
                  style={{
                    ...neu.subtle,
                    borderRadius: R.lg,
                    padding: '12px 14px',
                    marginBottom: 14,
                    fontFamily: fonts.sans,
                    fontSize: 13,
                    color: C.textSoft,
                    lineHeight: 1.5,
                  }}
                >
                  {copy.noPlaceSignals.replace(
                    '{place}',
                    rawFilterPlace || location?.city || '—',
                  )}
                </div>
                <h2
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: C.textMutedStrong,
                    margin: '0 0 12px',
                  }}
                >
                  {copy.nearestSignals}
                </h2>
                <div className="k-signals-feed-shell">
                  <SignalsGroupedView
                    signals={nearestSignals}
                    userLat={originLat}
                    userLon={originLon}
                    searchQuery=""
                    onSearchChange={setSearchDraft}
                    nearCount={nearestSignals.length}
                  />
                </div>
              </div>
            ) : signals.length === 0 ? (
              <div
                style={{
                  ...neu.subtle,
                  borderRadius: R.xl,
                  padding: '24px 18px',
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: C.textMuted,
                  textAlign: 'center',
                }}
              >
                {copy.empty}
              </div>
            ) : (
              <div className="k-signals-feed-shell">
                <SignalsGroupedView
                  signals={signals}
                  userLat={location?.lat ?? null}
                  userLon={location?.lon ?? null}
                  searchQuery={searchDraft}
                  onSearchChange={setSearchDraft}
                  nearCount={5}
                  orphanMarkets={orphanMarkets}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function DesktopSignalToolbar({
  C,
  fonts,
  neu,
  R,
  copy,
  hasUserLoc,
  locationLabel,
  searchDraft,
  filterRisks,
  filterSeverities,
  followingPlaces,
  resolvingPositions,
  hasActiveFilters,
  onSearchChange,
  onToggleRisk,
  onToggleSeverity,
  onClearAll,
}: {
  C: any;
  fonts: any;
  neu: any;
  R: any;
  copy: Record<string, string>;
  hasUserLoc: boolean;
  locationLabel: string;
  searchDraft: string;
  filterRisks: string[];
  filterSeverities: string[];
  followingPlaces: FollowingPlaceSummary[];
  resolvingPositions: Market[];
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onToggleRisk: (id: string) => void;
  onToggleSeverity: (id: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="k-signals-toolbar">
      <div
        className="k-signals-toolbar-card"
        style={{
          ...neu.panelRaised,
          borderRadius: R.xl,
          padding: '18px 18px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div className="k-signals-toolbar-saved-grid">
          <div className="k-signals-saved-row">
            <ToolbarLabel C={C} fonts={fonts}>
              {copy.savedPlace}
            </ToolbarLabel>
            <Link
              href="/profile"
              style={{
                ...neu.controlPressed,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                color: C.textSoft,
                textDecoration: 'none',
                minWidth: 0,
                minHeight: 36,
                borderRadius: R.pill,
                padding: '7px 10px 7px 16px',
                boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  display: 'block',
                  color: C.text,
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {locationLabel}
              </span>
              <span
                style={{
                  color: hasUserLoc ? C.text : C.accent,
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {copy.change}
              </span>
            </Link>
          </div>

          <ToolbarSummaryStrip
            title={copy.following}
            empty={copy.noFollowing}
            C={C}
            fonts={fonts}
          >
            {followingPlaces.map((place) => (
              <CityPill
                key={place.slug}
                href={`/places/${place.slug}`}
                label={place.label}
              />
            ))}
          </ToolbarSummaryStrip>

          <ToolbarSummaryStrip
            title={copy.positions}
            empty={copy.noPositions}
            C={C}
            fonts={fonts}
          >
            {resolvingPositions.map((market) => (
              <CityPill
                key={market.id.toString()}
                href={`/markets/${market.id}`}
                label={displayCityName(market.cityName)}
                title={`${displayCityName(market.cityName)} · ${resolveLabel(market)}`}
              />
            ))}
          </ToolbarSummaryStrip>
          <div
            className="k-signals-positions-note"
            style={{
              color: C.textMuted,
              fontFamily: fonts.sans,
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1.35,
            }}
          >
            {copy.positionsNote}
          </div>
        </div>
      </div>

      <div
        className="k-signals-toolbar-card"
        style={{
          ...neu.panelRaised,
          borderRadius: R.xl,
          padding: '18px 16px 14px',
          display: 'grid',
          alignContent: 'center',
        }}
      >
        <div style={{ position: 'relative', marginBottom: 22 }}>
          <input
            id="signals-place-search"
            name="signals-place-search"
            value={searchDraft}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: `1.5px solid ${searchDraft ? C.accent : C.divider}`,
              background: C.surfaceHigh,
              color: C.text,
              borderRadius: R.lg,
              padding: '13px 42px 13px 40px',
              fontFamily: fonts.sans,
              fontSize: 14,
              outline: 'none',
              transition: 'border-color 120ms ease-out',
            }}
          />
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 15,
              height: 15,
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
          {searchDraft ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
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
              {copy.clearSearch}
            </button>
          ) : null}
        </div>

        <div className="k-signals-toolbar-filter-row">
          <ToolbarLabel C={C} fonts={fonts}>
            {copy.risk}
          </ToolbarLabel>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, minWidth: 0 }}
          >
            {SIGNAL_RISKS.map((risk) => (
              <ToolbarToggle
                key={risk.id}
                label={copy[`risk_${risk.id}`] ?? risk.label}
                active={filterRisks.includes(risk.id)}
                onClick={() => onToggleRisk(risk.id)}
                C={C}
                fonts={fonts}
                neu={neu}
                R={R}
              />
            ))}
          </div>
        </div>

        <div className="k-signals-toolbar-filter-row">
          <ToolbarLabel C={C} fonts={fonts}>
            {copy.severity}
          </ToolbarLabel>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 10, minWidth: 0 }}
          >
            {SIGNAL_SEVERITIES.map((severity) => (
              <ToolbarToggle
                key={severity.id}
                label={copy[`sev_${severity.id}`] ?? severity.label}
                active={filterSeverities.includes(severity.id)}
                onClick={() => onToggleSeverity(severity.id)}
                C={C}
                fonts={fonts}
                neu={neu}
                R={R}
              />
            ))}
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={onClearAll}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: C.textMutedStrong,
                  cursor: 'pointer',
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: 'underline',
                  padding: '6px 4px',
                }}
              >
                {copy.clearAllFilters}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarSummaryStrip({
  title,
  empty,
  C,
  fonts,
  children,
}: {
  title: string;
  empty: string;
  C: any;
  fonts: any;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.filter(Boolean).length > 0
    : Boolean(children);

  return (
    <div
      className="k-signals-toolbar-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: '100px minmax(0, 1fr)',
        // 'start', not 'center': once the pills wrap to a second line, a
        // vertically centered label reads as floating between the rows
        // instead of belonging to the first one. The paddingTop below nudges
        // the label to the visual center of that first pill row (pills are
        // minHeight 30, the label is a single line of 10px mono text).
        alignItems: 'start',
        gap: 12,
        minWidth: 0,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          paddingTop: 9,
        }}
      >
        {title}
      </span>
      <div
        className="k-signals-toolbar-strip-items"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          minWidth: 0,
          maxHeight: 48,
          overflow: 'visible',
        }}
      >
        {hasChildren ? (
          children
        ) : (
          <span
            style={{
              color: C.textMuted,
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {empty}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolbarLabel({
  C,
  fonts,
  children,
}: {
  C: any;
  fonts: any;
  children: ReactNode;
}) {
  return (
    <span
      style={{
        flexShrink: 0,
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: C.textMutedStrong,
      }}
    >
      {children}
    </span>
  );
}

function ToolbarToggle({
  label,
  active,
  onClick,
  C,
  fonts,
  neu,
  R,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  C: any;
  fonts: any;
  neu: any;
  R: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...(active ? neu.controlPressed : neu.controlRaised),
        border: `1px solid ${active ? `${C.accent}66` : C.divider}`,
        background: active ? `${C.accent}18` : 'transparent',
        color: active ? C.text : C.textSoft,
        borderRadius: R.pill,
        padding: '8px 13px',
        minHeight: 34,
        cursor: 'pointer',
        fontFamily: fonts.sans,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}

function resolveLabel(market: Market) {
  const seconds = market.timeToResolveSec;

  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    return 'soon';
  }

  if (seconds <= 0) return 'resolving';

  const hours = Math.ceil(seconds / 3600);
  if (hours <= 24) return `${hours}h`;

  const days = Math.ceil(seconds / 86400);
  return `${days}d`;
}

function displayCityName(value: string) {
  return value.split(',')[0]?.trim() || value;
}

function cityNameFromSlug(slug: string) {
  const parts = slug.split('-').filter(Boolean);
  if (parts.length <= 1) return slug;

  const withoutCountry = parts.slice(0, -1);
  const maybeRegion = withoutCountry[withoutCountry.length - 1] ?? '';
  const cityParts =
    maybeRegion.length <= 3 ? withoutCountry.slice(0, -1) : withoutCountry;

  return cityParts.join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FilterChip({
  C,
  fonts,
  R,
  children,
  onRemove,
  removeLabel,
}: {
  C: any;
  fonts: any;
  R: any;
  children: ReactNode;
  /** When provided, renders a ✕ button that calls back. The chip
   *  becomes the affordance for removing the filter — no need to
   *  scroll back up to the sidebar / IntentLauncher. */
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: onRemove ? '4px 4px 4px 10px' : '4px 10px',
        borderRadius: R.pill,
        background: `${C.accent}14`,
        border: `1px solid ${C.accent}55`,
        color: C.text,
        fontFamily: fonts.sans,
        fontSize: 12,
        fontWeight: 600,
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove filter'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            border: 'none',
            borderRadius: '50%',
            background: 'transparent',
            color: C.textMuted,
            cursor: 'pointer',
            padding: 0,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      ) : null}
    </span>
  );
}
