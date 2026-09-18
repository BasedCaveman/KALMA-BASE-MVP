//frontend/components/location/LocationPicker.tsx
'use client';

import { useMemo, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { formatLocationLabel, type LocationContextValue } from '@/lib/location';
import { logPlaceCandidate } from '@/lib/place-candidate';

type GeoResult = {
  id: number;
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
};

const GEO_CACHE_PREFIX = 'kalma-geo-v1:';
const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRIMARY_BG = '#173126';
const PRIMARY_TEXT = '#F3EBDD';

function pickerCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Location',
      current: 'Current location',
      approximateArea: 'Approximate area',
      manualCity: 'Manual city',
      noLocation: 'No location selected',
      quietHint: 'Approximate by default. Change only if you want a specific city.',
      searchTitle: 'Choose a city manually',
      searchPlaceholder: 'Choose a city',
      search: 'Search',
      searching: '...',
      clear: 'Clear chosen place',
      open: 'Change',
      close: 'Hide',
      typeMore: 'Type at least 2 letters.',
      noCity: 'No city found. Try another spelling.',
      searchFailed: 'Could not search cities right now.',
      foundOne: 'Found 1 place.',
      foundMany: 'Found {count} places.',
      using: 'Using {city}.',
      results: 'Results',
    },
    pt: {
      title: 'Localização',
      current: 'Local atual',
      approximateArea: 'Área aproximada',
      manualCity: 'Cidade manual',
      noLocation: 'Nenhuma localização selecionada',
      quietHint: 'Aproximado por padrão. Mude só se você quiser uma cidade específica.',
      searchTitle: 'Escolher cidade manualmente',
      searchPlaceholder: 'Escolha uma cidade',
      search: 'Buscar',
      searching: '...',
      clear: 'Limpar lugar escolhido',
      open: 'Mudar',
      close: 'Ocultar',
      typeMore: 'Digite pelo menos 2 letras.',
      noCity: 'Nenhuma cidade encontrada. Tente outra grafia.',
      searchFailed: 'Não foi possível buscar cidades agora.',
      foundOne: '1 lugar encontrado.',
      foundMany: '{count} lugares encontrados.',
      using: 'Usando {city}.',
      results: 'Resultados',
    },
    es: {
      title: 'Ubicación',
      current: 'Ubicación actual',
      approximateArea: 'Área aproximada',
      manualCity: 'Ciudad manual',
      noLocation: 'Ninguna ubicación seleccionada',
      quietHint: 'Aproximada por defecto. Cámbiala solo si quieres una ciudad específica.',
      searchTitle: 'Elegir ciudad manualmente',
      searchPlaceholder: 'Elige una ciudad',
      search: 'Buscar',
      searching: '...',
      clear: 'Quitar lugar elegido',
      open: 'Cambiar',
      close: 'Ocultar',
      typeMore: 'Escribe al menos 2 letras.',
      noCity: 'No se encontró ninguna ciudad. Prueba otra grafía.',
      searchFailed: 'No se pudo buscar ciudades ahora.',
      foundOne: '1 lugar encontrado.',
      foundMany: '{count} lugares encontrados.',
      using: 'Usando {city}.',
      results: 'Resultados',
    },
    fr: {
      title: 'Localisation',
      current: 'Position actuelle',
      approximateArea: 'Zone approximative',
      manualCity: 'Ville manuelle',
      noLocation: 'Aucune localisation sélectionnée',
      quietHint: 'Approximative par défaut. Modifie uniquement si tu veux une ville précise.',
      searchTitle: 'Choisir une ville manuellement',
      searchPlaceholder: 'Choisis une ville',
      search: 'Rechercher',
      searching: '...',
      clear: 'Effacer le lieu choisi',
      open: 'Modifier',
      close: 'Masquer',
      typeMore: 'Tape au moins 2 lettres.',
      noCity: 'Aucune ville trouvée. Essaie une autre orthographe.',
      searchFailed: "Impossible de rechercher des villes pour l'instant.",
      foundOne: '1 lieu trouvé.',
      foundMany: '{count} lieux trouvés.',
      using: 'Utilisation de {city}.',
      results: 'Résultats',
    },
    de: {
      title: 'Standort',
      current: 'Aktueller Standort',
      approximateArea: 'Ungefährer Bereich',
      manualCity: 'Manuelle Stadt',
      noLocation: 'Kein Standort ausgewählt',
      quietHint: 'Standardmäßig ungefähr. Nur ändern, wenn du eine bestimmte Stadt willst.',
      searchTitle: 'Stadt manuell wählen',
      searchPlaceholder: 'Stadt wählen',
      search: 'Suchen',
      searching: '...',
      clear: 'Gewählten Ort entfernen',
      open: 'Ändern',
      close: 'Ausblenden',
      typeMore: 'Mindestens 2 Buchstaben eingeben.',
      noCity: 'Keine Stadt gefunden. Andere Schreibweise versuchen.',
      searchFailed: 'Städtesuche derzeit nicht möglich.',
      foundOne: '1 Ort gefunden.',
      foundMany: '{count} Orte gefunden.',
      using: 'Verwendet wird {city}.',
      results: 'Ergebnisse',
    },
    zh: {
      title: '位置',
      current: '当前位置',
      approximateArea: '大致区域',
      manualCity: '手动城市',
      noLocation: '未选择位置',
      quietHint: '默认使用大致位置。只有当你想用某个特定城市时再更改。',
      searchTitle: '手动选择城市',
      searchPlaceholder: '选择一个城市',
      search: '搜索',
      searching: '...',
      clear: '清除已选位置',
      open: '更改',
      close: '隐藏',
      typeMore: '请至少输入 2 个字符。',
      noCity: '未找到城市。请尝试其他拼写。',
      searchFailed: '当前无法搜索城市。',
      foundOne: '找到 1 个位置。',
      foundMany: '找到 {count} 个位置。',
      using: '正在使用 {city}。',
      results: '结果',
    },
  };

  return table[language] ?? table.en;
}

function normalizeGeoQuery(value: string) {
  return value.trim().toLowerCase();
}

function getGeoCacheKey(query: string) {
  return `${GEO_CACHE_PREFIX}${normalizeGeoQuery(query)}`;
}

function readGeoCache(query: string): GeoResult[] | null {
  try {
    const raw = localStorage.getItem(getGeoCacheKey(query));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      timestamp: number;
      results: GeoResult[];
    };

    if (!parsed?.timestamp || !Array.isArray(parsed.results)) {
      localStorage.removeItem(getGeoCacheKey(query));
      return null;
    }

    if (Date.now() - parsed.timestamp > GEO_CACHE_TTL_MS) {
      localStorage.removeItem(getGeoCacheKey(query));
      return null;
    }

    return parsed.results;
  } catch {
    return null;
  }
}

function writeGeoCache(query: string, results: GeoResult[]) {
  try {
    localStorage.setItem(
      getGeoCacheKey(query),
      JSON.stringify({
        timestamp: Date.now(),
        results,
      })
    );
  } catch {
    // ignore cache write failures
  }
}

function buildCityLabel(city: GeoResult) {
  return [city.name, city.admin1, city.country].filter(Boolean).join(', ');
}

export default function LocationPicker({
  location,
  onSetManual,
  onClearManual,
  mode = 'summary-toggle',
}: {
  location: LocationContextValue | null;
  onSetManual: (input: {
    city: string;
    region?: string | null;
    country?: string | null;
    countryCode?: string | null;
    lat?: number | null;
    lon?: number | null;
  }) => void;
  onClearManual: () => void;
  mode?: 'summary-toggle' | 'editor';
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = pickerCopy(language);

  const [city, setCity] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const isManual = location?.mode === 'manual';

  const currentLabel = useMemo(() => {
    if (!location) return copy.noLocation;
    return formatLocationLabel(location);
  }, [location, copy.noLocation]);

  const modeLabel = useMemo(() => {
    if (!location) return copy.noLocation;
    if (location.mode === 'manual') return copy.manualCity;
    if (location.mode === 'approximate') return copy.approximateArea;
    return copy.noLocation;
  }, [location, copy]);

  async function handleSearch() {
    const trimmed = city.trim();

    if (trimmed.length < 2) {
      setStatusText(copy.typeMore);
      setResults([]);
      return;
    }

    const cached = readGeoCache(trimmed);
    if (cached) {
      setResults(cached);
      setStatusText(
        cached.length === 0
          ? copy.noCity
          : cached.length === 1
            ? copy.foundOne
            : copy.foundMany.replace('{count}', String(cached.length))
      );
      return;
    }

    try {
      setIsSearching(true);
      setStatusText('');
      setResults([]);

      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}` +
        `&count=6&language=en&format=json`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Geocoding failed with ${res.status}`);
      }

      const data = await res.json();
      const nextResults: GeoResult[] = Array.isArray(data?.results) ? data.results : [];

      setResults(nextResults);
      writeGeoCache(trimmed, nextResults);

      if (!nextResults.length) {
        setStatusText(copy.noCity);
      } else if (nextResults.length === 1) {
        setStatusText(copy.foundOne);
      } else {
        setStatusText(copy.foundMany.replace('{count}', String(nextResults.length)));
      }
    } catch (err) {
      console.error('Location search failed:', err);
      setResults([]);
      setStatusText(copy.searchFailed);
    } finally {
      setIsSearching(false);
    }
  }

  function handlePick(cityResult: GeoResult) {
    onSetManual({
      city: cityResult.name,
      region: cityResult.admin1 ?? null,
      country: cityResult.country ?? null,
      countryCode: cityResult.country_code ?? null,
      lat: cityResult.latitude ?? null,
      lon: cityResult.longitude ?? null,
    });

    // Record demand for the "catalog grows with demand" pipeline.
    if (typeof cityResult.latitude === 'number' && typeof cityResult.longitude === 'number') {
      logPlaceCandidate({
        name: cityResult.name,
        region: cityResult.admin1 ?? null,
        country: cityResult.country ?? null,
        lat: cityResult.latitude,
        lon: cityResult.longitude,
      });
    }

    setCity('');
    setResults([]);
    setStatusText(copy.using.replace('{city}', buildCityLabel(cityResult)));
    setIsExpanded(false);
  }

  const editor = (
    <div>
      {mode === 'summary-toggle' ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.textSoft,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          {copy.quietHint}
        </div>
      ) : null}

      {isManual ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClearManual}
            style={{
              ...neu.subtle,
              border: 'none',
              borderRadius: R.md,
              padding: '11px 13px',
              background: C.surface,
              color: C.text,
              fontFamily: fonts.sans,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copy.clear}
          </button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
        <input
          id="location-city-search"
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSearch();
            }
          }}
          placeholder={copy.searchPlaceholder}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: 'none',
            background: C.surfaceHigh,
            color: C.text,
            borderRadius: R.lg,
            padding: '15px 14px',
            fontFamily: fonts.sans,
            fontSize: 16,
            outline: 'none',
            boxShadow: `inset 1px 1px 0 ${C.surfaceHigh}, 3px 3px 8px ${C.shadowA}40, -3px -3px 8px ${C.shadowB}60`,
          }}
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={isSearching}
          style={{
            minWidth: 0,
            border: 'none',
            borderRadius: R.lg,
            padding: '0 18px',
            background: PRIMARY_BG,
            color: PRIMARY_TEXT,
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: `0 8px 18px ${C.shadowA}24, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          {isSearching ? copy.searching : copy.search}
        </button>
      </div>

      {statusText ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.textSoft,
          }}
        >
          {statusText}
        </div>
      ) : null}

      {results.length ? (
        <div
          style={{
            ...neu.controlPressed,
            borderRadius: R.lg,
            padding: 8,
            display: 'grid',
            gap: 6,
            marginTop: 12,
          }}
        >
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: C.textMutedStrong,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              padding: '2px 6px 4px',
            }}
          >
            {copy.results}
          </div>

          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handlePick(result)}
              style={{
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                color: C.text,
                fontFamily: fonts.sans,
                fontSize: 15,
                padding: '12px 10px',
                borderRadius: R.sm,
                cursor: 'pointer',
              }}
            >
              {buildCityLabel(result)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {mode === 'summary-toggle' ? (
        <>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            style={{
              ...neu.controlPressed,
              width: '100%',
              border: 'none',
              borderRadius: R.lg,
              padding: '12px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              textAlign: 'left',
              boxSizing: 'border-box',
              marginBottom: isExpanded ? 12 : 0,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: C.textMutedStrong,
                  letterSpacing: 1.1,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {copy.title}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.text,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: 3,
                }}
              >
                {currentLabel}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  color: C.textSoft,
                  lineHeight: 1.4,
                }}
              >
                {modeLabel}
              </div>
            </div>

            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 12,
                color: C.textMutedStrong,
                whiteSpace: 'nowrap',
                marginLeft: 8,
              }}
            >
              {isExpanded ? copy.close : copy.open}
            </div>
          </button>

          {isExpanded ? editor : null}
        </>
      ) : (
        editor
      )}
    </div>
  );
}
