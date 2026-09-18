//frontend/app/markets/page.tsx
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import FaucetBanner from '@/components/shared/FaucetBanner';
import MarketCard, { CompactMarketGrid } from '@/components/market/MarketCard';
import MostContested from '@/components/market/MostContested';
// LocationPicker removed from /markets in UX-4 (slim chrome).
// Inline location chip links to /profile where the full picker lives.
import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';
import { useLocationContext } from '@/hooks/useLocationContext';
import {
  buildCitySearchLabel,
  buildCitySearchMeta,
  useCitySearch,
  type CitySearchResult,
} from '@/hooks/useCitySearch';
import { logPlaceCandidate } from '@/lib/place-candidate';
// ProtocolStats removed from /markets in UX-4 (slim chrome).
// Belongs on /profile alongside the rest of the protocol-level
// metadata — adding it there is tracked separately so we don't
// touch the /profile element sequence in this commit.

function pageCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      search: 'Search cities...',
      searchAction: 'Search',
      searchClear: 'Clear',
      searchNoResults: 'No cities match',
      searchOptions: 'Choose a city',
      searchNoOptions: 'No city options found. Try another spelling.',
      useCity: 'Use city',
      intro:
        'Open questions are ordered by distance from your saved place; when a place has several, the one resolving soonest comes first. Your positions and followed places come after.',
      loadingLocation: 'Loading your location...',
      loading: 'Loading protections...',
      noMarkets: 'No live protections available right now.',
      allClosedTitle: 'All questions are closed for answers right now',
      allClosedBody: 'Current windows are waiting on weather resolution. New questions open soon — meanwhile, read what people are seeing or open a question for your own place.',
      allClosedRead: 'Read field reports',
      allClosedAdd: 'Add your city',
      topPick: 'Top pick',
      nearby: 'Nearby',
      moreMarkets: 'More protections',
      showMore: 'Show more',
      create: 'Add',
      positions: 'Positions',
      noPositions: 'No resolving positions',
      positionsNote: 'Displaying the three positions nearest to their resolution date first.',
      noLocation:
        'Location helps sort nearby cities. You can still browse and add new ones normally.',
      savedPlace: 'Saved place',
      noPlace: 'No place set',
      change: 'Change',
    },
    pt: {
      search: 'Buscar cidades...',
      searchAction: 'Buscar',
      searchClear: 'Limpar',
      searchNoResults: 'Nenhuma cidade encontrada',
      searchOptions: 'Escolha uma cidade',
      searchNoOptions: 'Nenhuma opção encontrada. Tente outra grafia.',
      useCity: 'Usar cidade',
      intro:
        'As perguntas abertas são ordenadas pela distância do seu local salvo; quando um local tem várias, a que resolve antes vem primeiro. Suas posições e locais seguidos vêm em seguida.',
      loadingLocation: 'Carregando sua localização...',
      loading: 'Carregando proteções...',
      noMarkets: 'Não há proteções ativas disponíveis agora.',
      allClosedTitle: 'Todas as perguntas estão fechadas para respostas agora',
      allClosedBody: 'As janelas atuais aguardam a resolução do tempo. Novas perguntas abrem em breve — enquanto isso, leia o que as pessoas estão vendo ou abra uma pergunta para o seu lugar.',
      allClosedRead: 'Ler notas de campo',
      allClosedAdd: 'Adicionar sua cidade',
      topPick: 'Destaque',
      nearby: 'Próximos',
      moreMarkets: 'Mais proteções',
      showMore: 'Mostrar mais',
      create: 'Criar',
      positions: 'Posições',
      noPositions: 'Sem posições a resolver',
      positionsNote: 'Até três mais próximas de resolver primeiro.',
      noLocation:
        'A localização ajuda a ordenar as cidades próximas. Você ainda pode navegar e criar normalmente.',
      savedPlace: 'Local salvo',
      noPlace: 'Nenhum local definido',
      change: 'Trocar',
    },
    es: {
      search: 'Buscar ciudades...',
      searchAction: 'Buscar',
      searchClear: 'Limpiar',
      searchNoResults: 'No se encontraron ciudades',
      searchOptions: 'Elige una ciudad',
      searchNoOptions: 'No se encontraron opciones. Prueba otra grafía.',
      useCity: 'Usar ciudad',
      intro:
        'Las preguntas abiertas se ordenan por distancia desde tu lugar guardado; si un lugar tiene varias, la que resuelve antes va primero. Tus posiciones y lugares seguidos vienen después.',
      loadingLocation: 'Cargando tu ubicación...',
      loading: 'Cargando protecciones...',
      noMarkets: 'No hay protecciones activas disponibles ahora.',
      allClosedTitle: 'Todas las preguntas están cerradas para respuestas ahora',
      allClosedBody: 'Las ventanas actuales esperan la resolución del tiempo. Pronto se abren nuevas preguntas — mientras tanto, lee lo que la gente está viendo o abre una pregunta para tu lugar.',
      allClosedRead: 'Leer notas de campo',
      allClosedAdd: 'Añade tu ciudad',
      topPick: 'Destacado',
      nearby: 'Cercanos',
      moreMarkets: 'Más protecciones',
      showMore: 'Mostrar más',
      create: 'Crear',
      positions: 'Posiciones',
      noPositions: 'Sin posiciones por resolver',
      positionsNote: 'Hasta tres más próximas a resolverse primero.',
      noLocation:
        'La ubicación ayuda a ordenar las ciudades cercanas. Aun así puedes navegar y crear normalmente.',
      savedPlace: 'Lugar guardado',
      noPlace: 'Ningún lugar definido',
      change: 'Cambiar',
    },
    fr: {
      search: 'Rechercher des villes...',
      searchAction: 'Rechercher',
      searchClear: 'Effacer',
      searchNoResults: 'Aucune ville trouvée',
      searchOptions: 'Choisir une ville',
      searchNoOptions: 'Aucune option trouvée. Essaie une autre orthographe.',
      useCity: 'Utiliser',
      intro:
        'Les questions ouvertes sont triées par distance depuis votre lieu enregistré ; si un lieu en a plusieurs, celle qui se résout le plus tôt vient en premier. Vos positions et lieux suivis viennent ensuite.',
      loadingLocation: 'Chargement de votre position...',
      loading: 'Chargement des protections...',
      noMarkets: 'Aucune protection active pour le moment.',
      allClosedTitle: 'Toutes les questions sont fermées aux réponses pour le moment',
      allClosedBody: 'Les fenêtres en cours attendent la résolution météo. De nouvelles questions ouvrent bientôt — en attendant, lis ce que les gens voient ou ouvre une question pour ton lieu.',
      allClosedRead: 'Lire les notes terrain',
      allClosedAdd: 'Ajouter ta ville',
      topPick: 'Sélection',
      nearby: 'Proches',
      moreMarkets: 'Plus de protections',
      showMore: 'Voir plus',
      create: 'Créer',
      positions: 'Positions',
      noPositions: 'Aucune position à résoudre',
      positionsNote: "Jusqu'à trois positions les plus proches de la résolution.",
      noLocation:
        'La position aide à trier les villes proches. Vous pouvez quand même parcourir et créer normalement.',
      savedPlace: 'Lieu enregistré',
      noPlace: 'Aucun lieu défini',
      change: 'Changer',
    },
    de: {
      search: 'Städte suchen...',
      searchAction: 'Suchen',
      searchClear: 'Löschen',
      searchNoResults: 'Keine Städte gefunden',
      searchOptions: 'Stadt wählen',
      searchNoOptions: 'Keine Optionen gefunden. Andere Schreibweise versuchen.',
      useCity: 'Stadt nutzen',
      intro:
        'Offene Fragen sind nach Entfernung von deinem gespeicherten Ort sortiert; hat ein Ort mehrere, kommt die zuerst, die am frühesten auflöst. Deine Positionen und gefolgten Orte folgen danach.',
      loadingLocation: 'Dein Standort wird geladen...',
      loading: 'Schutzfragen werden geladen...',
      noMarkets: 'Derzeit sind keine aktiven Schutzfragen verfügbar.',
      allClosedTitle: 'Alle Fragen sind gerade für Antworten geschlossen',
      allClosedBody: 'Die laufenden Fenster warten auf die Wetter-Auflösung. Neue Fragen öffnen bald — lies inzwischen, was Menschen vor Ort sehen, oder eröffne eine Frage für deinen Ort.',
      allClosedRead: 'Feldnotizen lesen',
      allClosedAdd: 'Stadt hinzufügen',
      topPick: 'Top-Auswahl',
      nearby: 'In der Nähe',
      moreMarkets: 'Mehr Schutzfragen',
      showMore: 'Mehr anzeigen',
      create: 'Erstellen',
      positions: 'Positionen',
      noPositions: 'Keine Positionen vor Auflösung',
      positionsNote: 'Bis zu drei Positionen, die bald aufgelöst werden.',
      noLocation:
        'Der Standort hilft beim Sortieren naher Städte. Du kannst trotzdem normal stöbern und erstellen.',
      savedPlace: 'Gespeicherter Ort',
      noPlace: 'Kein Ort festgelegt',
      change: 'Ändern',
    },
    zh: {
      search: '搜索城市...',
      searchAction: '搜索',
      searchClear: '清除',
      searchNoResults: '未找到城市',
      searchOptions: '选择城市',
      searchNoOptions: '未找到城市选项。请尝试其他拼写。',
      useCity: '使用城市',
      intro: '开放中的问题按与你保存地点的距离排序；同一地点有多个问题时，最先揭晓的排在前面。你的持仓和已关注地点随后显示。',
      loadingLocation: '正在加载你的位置...',
      loading: '正在加载保护问题...',
      noMarkets: '当前没有可用的活跃保护问题。',
      allClosedTitle: '目前所有问题都已停止接收回答',
      allClosedBody: '当前窗口正在等待天气结果。新的问题即将开放——在此期间，可以查看大家的现场观察，或为你的地方开启一个问题。',
      allClosedRead: '查看现场笔记',
      allClosedAdd: '添加你的城市',
      topPick: '首选',
      nearby: '附近',
      moreMarkets: '更多保护',
      showMore: '查看更多',
      create: '创建',
      positions: '仓位',
      noPositions: '暂无临近结算仓位',
      positionsNote: '最多显示三个最接近结算的仓位。',
      noLocation:
        '位置有助于排序附近城市。即使没有位置，你仍然可以正常浏览和创建城市。',
      savedPlace: '保存的位置',
      noPlace: '尚未设置位置',
      change: '更改',
    },
  };

  return table[language] ?? table.en;
}

/**
 * Simple "Show more" pagination button used at the bottom of each
 * section that has more items than the current visible window. Shows
 * the remaining count so the user knows what they're about to load.
 */
function ShowMoreButton({
  label,
  remaining,
  onClick,
  fonts,
  C,
  R,
  neu,
}: {
  label: string;
  remaining: number;
  onClick: () => void;
  fonts: any;
  C: any;
  R: any;
  neu: any;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 4px' }}>
      <button
        type="button"
        onClick={onClick}
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
        {label}
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: C.textMuted,
          }}
        >
          +{remaining}
        </span>
      </button>
    </div>
  );
}

function SectionLabel({
  label,
  count,
  fonts,
  C,
}: {
  label: string;
  count?: number;
  fonts: any;
  C: any;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: '18px 0 10px',
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      {typeof count === 'number' ? (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: C.textMutedStrong,
          }}
        >
          {count}
        </div>
      ) : null}
    </div>
  );
}

export default function MarketsPage() {
  const { C, fonts, neu, R } = useColors();
  const { language, t } = useTranslation();
  const copy = pageCopy(language);

  const {
    location,
    isLoading: locationLoading,
    error: locationError,
    setManualLocation,
  } = useLocationContext();
  const {
    results: citySearchResults,
    isSearching: citySearchLoading,
    error: citySearchError,
    searchedQuery: citySearchedQuery,
    searchCities,
    clearCitySearch,
  } = useCitySearch();

  const {
    markets,
    primaryMarket,
    secondaryMarkets,
    remainingMarkets,
    isLoading,
  } = useMarketsSnapshot(location);

  const hasLocation = location?.lat != null && location?.lon != null;

  // Short readable location label for the inline chip — mirrors the
  // pattern used on /signals so the two pages read consistently.
  const locationLabel = useMemo(() => {
    if (!location || !hasLocation) return copy.noPlace;
    return [location.city, location.region, location.country]
      .filter(Boolean)
      .join(', ');
  }, [location, hasLocation, copy.noPlace]);
  const [searchQuery, setSearchQuery] = useState('');

  const liveCount = useMemo(
    () => markets.filter((m) => !m.resolved && !m.cancelled).length,
    [markets]
  );

  // Live windows can all be past their answer deadline at once (e.g. between
  // resolution cycles). Without this the page reads as a wall of closed cards
  // with nothing to do — surface the pause and route energy to reading field
  // reports or opening a question instead.
  const openForAnswersCount = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return markets.filter(
      (m) =>
        !m.resolved &&
        !m.cancelled &&
        now < m.predictionDeadline &&
        now < m.endTime,
    ).length;
  }, [markets]);
  const allClosedForAnswers =
    !isLoading && markets.length > 0 && openForAnswersCount === 0;

  const searchActive = searchQuery.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    const q = searchQuery.trim().toLowerCase();
    return markets.filter((m) =>
      m.cityName?.toLowerCase().includes(q) ||
      m.displayCityName?.toLowerCase().includes(q)
    );
  }, [markets, searchQuery, searchActive]);

  function handleCitySearchPick(result: CitySearchResult) {
    setManualLocation({
      city: result.name,
      region: result.admin1 ?? null,
      country: result.country ?? null,
      lat: result.latitude,
      lon: result.longitude,
      timezone: result.timezone ?? null,
    });

    logPlaceCandidate({
      name: result.name,
      region: result.admin1 ?? null,
      country: result.country ?? null,
      lat: result.latitude,
      lon: result.longitude,
    });

    setSearchQuery('');
    clearCitySearch();
  }

  // Paginação simples para evitar listas infinitas e DOM gigante na
  // primeira renderização. Cada seção controla seu próprio "ver mais".
  // Mobile-first: 12 cards full + 30 collapsed cabem ~3-4 telas.
  const NEARBY_PAGE_SIZE = 12;
  const MORE_PAGE_SIZE = 30;
  const [nearbyShown, setNearbyShown] = useState(NEARBY_PAGE_SIZE);
  const [moreShown, setMoreShown] = useState(MORE_PAGE_SIZE);

  const visibleSecondary = useMemo(
    () => secondaryMarkets.slice(0, nearbyShown),
    [secondaryMarkets, nearbyShown]
  );
  const visibleRemaining = useMemo(
    () => remainingMarkets.slice(0, moreShown),
    [remainingMarkets, moreShown]
  );

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
    [markets]
  );

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Markets dash + grid (Phase 3b-2e).
               Mobile: each piece stacks vertically as before.
               Desktop ≥1024px: search + location + protocol stats
               share one compact strip; market cards lay out 2-col.
               ≥1280px: cards lay out 3-col so wider screens don't
               waste horizontal space on the "Nearby" section. */
            /* Slim dash (UX-4): single row containing the search
               input and the saved-place chip. Mobile lets the chip
               wrap underneath; desktop keeps them side by side. */
            .k-markets-dash {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              align-items: center;
              margin-bottom: 14px;
            }
            .k-markets-location-chip {
              flex: 1 1 280px;
              min-width: 0;
            }
            @media (max-width: 360px) {
              .k-markets-location-chip-tail {
                display: none !important;
              }
            }
            .k-markets-grid > * { min-width: 0; }
            .k-markets-compact-grid {
              display: grid;
              gap: 8px;
              min-width: 0;
              overflow: visible;
            }
            @media (min-width: 1024px) {
              .k-markets-page { max-width: 1120px; margin: 0 auto; }
              /* Magnetic / masonry packing via CSS columns. Plain
                 block children (not inline-block — see /signals page
                 for the reasoning); gap 12px so columns read as
                 distinct rather than one wall. */
              .k-markets-grid {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
              }
              .k-markets-grid > * {
                margin: 0 0 12px 0 !important;
              }
              .k-markets-compact-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
              }
              /* Magnetic / masonry packing via CSS columns. Plain
                 block children (not inline-block — see /signals page
                 for the reasoning); gap 12px so columns read as
                 distinct rather than one wall. */
              .k-markets-grid {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
              }
              .k-markets-grid > * {
                margin: 0 0 12px 0 !important;
              }
              .k-markets-compact-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
              }
            }
            @media (min-width: 1024px) and (max-width: 1180px) {
              .k-markets-grid,
              .k-markets-compact-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
            }
          `,
        }}
      />
      <AppHeader
        section={t('nav.markets')}
        rightAction={
          <Link
            href="/create"
            style={{
              textDecoration: 'none',
              ...neu.controlRaised,
              width: 52,
              height: 52,
              borderRadius: 18,
              display: 'grid',
              placeItems: 'center',
              color: C.text,
              fontFamily: fonts.sans,
              fontSize: 26,
              fontWeight: 600,
              flexShrink: 0,
            }}
            aria-label={copy.create}
            title={copy.create}
          >
            +
          </Link>
        }
      />

      <div className="k-markets-page" style={{ padding: '0 16px 24px' }}>
        {/* ── Slim dash (UX-4) ──────────────────────────────────────
            Was: 600-700px of chrome (intro paragraph + ProtocolStats
            panel + position strip + LocationPicker full panel +
            FaucetBanner + no-location message)
            before the first market card.
            Now: one search row with the location chip inline, the
            position pills as a slim row underneath (only when the
            user actually has positions), and the situational banners
            below as before. ProtocolStats moved off this page (it
            belongs in /profile next to the rest of the protocol-
            level metadata). Intro paragraph dropped — the page
            header already says "Protections" and the rest speaks for
            itself. */}
        <div className="k-markets-dash">
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              id="cities-search"
              name="cities-search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) clearCitySearch();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void searchCities(searchQuery);
              }}
              placeholder={copy.search}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: `1.5px solid ${searchQuery ? C.accent : C.divider}`,
                background: C.surfaceHigh,
                color: C.text,
                borderRadius: R.lg,
                padding: '15px 92px 15px 46px',
                fontFamily: fonts.sans,
                fontSize: 16,
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
            />
            <svg
              viewBox="0 0 24 24"
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 18,
                height: 18,
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
            {searchQuery ? (
              <button
                type="button"
                onClick={() => void searchCities(searchQuery)}
                disabled={citySearchLoading}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  color: C.textMuted,
                  cursor: 'pointer',
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  padding: '4px 6px',
                }}
              >
                {citySearchLoading ? '...' : copy.searchAction}
              </button>
            ) : null}
          </div>

          {/* Location chip — same pattern as /signals so users
              moving between the two pages read the same identity. */}
          <Link
            href="/profile"
            className="k-markets-location-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              padding: '10px 14px',
              borderRadius: R.pill,
              background: hasLocation ? `${C.accent}14` : 'transparent',
              border: `1px solid ${hasLocation ? `${C.accent}55` : C.divider}`,
              color: C.textSoft,
              fontFamily: fonts.mono,
              fontSize: 11,
              letterSpacing: 0.6,
              textDecoration: 'none',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <span style={{ opacity: 0.7, textTransform: 'uppercase', flexShrink: 0 }}>
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
            <span className="k-markets-location-chip-tail" style={{ opacity: 0.7, flexShrink: 0 }}>
              · {copy.change}
            </span>
          </Link>
        </div>

        {/* Position pills — slim row, only when the user has active
            positions about to resolve. The old "POSITIONS" header
            row + 1-line note are dropped; the pill semantics speak
            for themselves. */}
        {resolvingPositions.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                color: C.textMutedStrong,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              {copy.positions}
            </span>
            {resolvingPositions.map((market) => (
              <Link
                key={market.id.toString()}
                href={`/markets/${market.id}`}
                style={{
                  border: `1px solid ${C.divider}`,
                  borderRadius: R.pill,
                  padding: '5px 11px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: C.surfaceSoft,
                  color: C.textSoft,
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                }}
              >
                {market.cityPillName ?? market.displayCityName ?? market.cityName}
              </Link>
            ))}
          </div>
        ) : null}

        <FaucetBanner />

        {searchActive && (citySearchResults.length > 0 || citySearchError) ? (
          <div
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              padding: 14,
              marginBottom: 14,
              display: 'grid',
              gap: 8,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                color: C.textMutedStrong,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              {copy.searchOptions}
            </div>
            {citySearchResults.length > 0 ? (
              citySearchResults.map((result) => (
                <button
                  key={`${result.id}-${result.latitude}-${result.longitude}`}
                  type="button"
                  onClick={() => handleCitySearchPick(result)}
                  style={{
                    ...neu.controlRaised,
                    border: 'none',
                    borderRadius: R.lg,
                    background: C.surfaceSoft,
                    color: C.text,
                    padding: '12px 14px',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontFamily: fonts.sans,
                        fontSize: 15,
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {result.name}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 2,
                        fontFamily: fonts.mono,
                        fontSize: 10,
                        color: C.textMuted,
                        letterSpacing: 0.9,
                        textTransform: 'uppercase',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {buildCitySearchMeta(result) || buildCitySearchLabel(result)}
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 13,
                      fontWeight: 800,
                      color: C.accent,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copy.useCity}
                  </span>
                </button>
              ))
            ) : (
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: C.textSoft,
                  lineHeight: 1.5,
                }}
              >
                {citySearchError || copy.searchNoOptions}
              </div>
            )}
          </div>
        ) : null}

        {locationLoading ? (
          <div
            style={{
              marginBottom: 14,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
            }}
          >
            {copy.loadingLocation}
          </div>
        ) : !hasLocation ? (
          <div
            style={{
              ...neu.controlPressed,
              borderRadius: R.lg,
              padding: '12px 14px',
              marginBottom: 16,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: locationError ? C.below : C.textSoft,
              lineHeight: 1.5,
            }}
          >
            {locationError || copy.noLocation}
          </div>
        ) : null}

        {searchActive ? (
          searchResults.length > 0 ? (
            <CompactMarketGrid className="k-markets-compact-grid" markets={searchResults} />
          ) : (
            <div
              style={{
                ...neu.panelRaised,
                borderRadius: R.xl,
                padding: 18,
                fontFamily: fonts.sans,
                fontSize: 15,
                color: C.textSoft,
              }}
            >
              {citySearchedQuery
                ? copy.searchNoOptions
                : `${copy.searchNoResults} "${searchQuery}"`}
            </div>
          )
        ) : isLoading ? (
          <div
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              padding: 18,
              fontFamily: fonts.sans,
              fontSize: 15,
              color: C.textSoft,
            }}
          >
            {copy.loading}
          </div>
        ) : !primaryMarket ? (
          <div
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              padding: 18,
              fontFamily: fonts.sans,
              fontSize: 15,
              color: C.textSoft,
            }}
          >
            {copy.noMarkets}
          </div>
        ) : (
          <>
            {allClosedForAnswers ? (
              <div
                style={{
                  ...neu.panelRaised,
                  borderRadius: R.xl,
                  padding: '18px 16px',
                  marginBottom: 14,
                  border: `1px solid ${C.accent}40`,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 16,
                    fontWeight: 700,
                    color: C.text,
                    lineHeight: 1.35,
                  }}
                >
                  {copy.allClosedTitle}
                </div>
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    color: C.textSoft,
                    lineHeight: 1.5,
                  }}
                >
                  {copy.allClosedBody}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Link
                    href="/today"
                    style={{
                      minHeight: 48,
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      borderRadius: R.pill,
                      background: C.accent,
                      color: C.bg,
                      fontFamily: fonts.sans,
                      fontSize: 14,
                      fontWeight: 800,
                      textDecoration: 'none',
                    }}
                  >
                    {copy.allClosedRead}
                  </Link>
                  <Link
                    href="/create"
                    style={{
                      minHeight: 48,
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      borderRadius: R.pill,
                      border: `1px solid ${C.dividerStrong}`,
                      color: C.text,
                      fontFamily: fonts.sans,
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    {copy.allClosedAdd}
                  </Link>
                </div>
              </div>
            ) : null}

            {/* CO-5: lead with what the crowd can't agree on. */}
            <MostContested markets={markets} />

            <SectionLabel label={copy.topPick} fonts={fonts} C={C} />
            <MarketCard m={primaryMarket} />

            {secondaryMarkets.length > 0 ? (
              <>
                <SectionLabel
                  label={copy.nearby}
                  count={liveCount}
                  fonts={fonts}
                  C={C}
                />
                <div className="k-markets-grid">
                  {visibleSecondary.map((market) => (
                    <MarketCard key={market.id.toString()} m={market} />
                  ))}
                </div>
                {nearbyShown < secondaryMarkets.length ? (
                  <ShowMoreButton
                    label={copy.showMore}
                    remaining={secondaryMarkets.length - nearbyShown}
                    onClick={() => setNearbyShown((n) => n + NEARBY_PAGE_SIZE)}
                    fonts={fonts}
                    C={C}
                    R={R}
                    neu={neu}
                  />
                ) : null}
              </>
            ) : null}

            {remainingMarkets.length > 0 ? (
              <>
                <SectionLabel
                  label={copy.moreMarkets}
                  count={remainingMarkets.length}
                  fonts={fonts}
                  C={C}
                />
                <CompactMarketGrid className="k-markets-compact-grid" markets={visibleRemaining} />
                {moreShown < remainingMarkets.length ? (
                  <ShowMoreButton
                    label={copy.showMore}
                    remaining={remainingMarkets.length - moreShown}
                    onClick={() => setMoreShown((n) => n + MORE_PAGE_SIZE)}
                    fonts={fonts}
                    C={C}
                    R={R}
                    neu={neu}
                  />
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
