// kalma/frontend/components/location/CitySearchBox.tsx
//
// Revamp-5: compact "find a city → instant question" search. Type a city,
// pick it, and the caller swaps the live question to that place (no configure,
// no separate page). Used at the top of /today; the landing has its own
// search inside IntentLauncher.
//
// Presentational + search only — it owns the input and the results dropdown
// and hands the picked CitySearchResult back via onPick. Binding the result to
// a location/route is the caller's job.

'use client';

import { useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import {
  buildCitySearchLabel,
  buildCitySearchMeta,
  useCitySearch,
  type CitySearchResult,
} from '@/hooks/useCitySearch';
import { logPlaceCandidate } from '@/lib/place-candidate';

function copyFor(language: string) {
  const t: Record<string, { placeholder: string; search: string; searching: string; options: string; none: string; use: string }> = {
    en: { placeholder: 'Search city', search: 'Search', searching: 'Searching…', options: 'Choose a city', none: 'No city found. Try another spelling.', use: 'Use' },
    pt: { placeholder: 'Buscar cidade', search: 'Buscar', searching: 'Buscando…', options: 'Escolha uma cidade', none: 'Cidade não encontrada. Tente outra grafia.', use: 'Usar' },
    es: { placeholder: 'Buscar ciudad', search: 'Buscar', searching: 'Buscando…', options: 'Elige una ciudad', none: 'Ciudad no encontrada. Prueba otra grafía.', use: 'Usar' },
    fr: { placeholder: 'Chercher une ville', search: 'Rechercher', searching: 'Recherche…', options: 'Choisir une ville', none: 'Ville introuvable. Essaie une autre orthographe.', use: 'Utiliser' },
    de: { placeholder: 'Stadt suchen', search: 'Suchen', searching: 'Suche…', options: 'Stadt wählen', none: 'Stadt nicht gefunden. Andere Schreibweise versuchen.', use: 'Nutzen' },
    zh: { placeholder: '搜索城市', search: '搜索', searching: '搜索中…', options: '选择城市', none: '未找到城市。请尝试其他拼写。', use: '使用' },
  };
  return t[language] ?? t.en;
}

export default function CitySearchBox({
  onPick,
}: {
  onPick: (result: CitySearchResult) => void;
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = copyFor(language);
  const { results, isSearching, error, searchCities, clearCitySearch } = useCitySearch();
  const [query, setQuery] = useState('');

  function pick(result: CitySearchResult) {
    // Record the demand here rather than leaving it to each consumer.
    // LocationPicker already logs internally; this one did not, so /today
    // (the most used surface in the app) silently taught the catalogue
    // nothing every time someone changed city. A component that performs the
    // search is the right place to record it, because then no future
    // consumer can forget the way this one did.
    logPlaceCandidate({
      name: result.name,
      region: result.admin1 ?? null,
      country: result.country ?? null,
      country_code: result.country_code ?? null,
      lat: result.latitude,
      lon: result.longitude,
      feature_code: result.feature_code ?? null,
    });
    onPick(result);
    setQuery('');
    clearCitySearch();
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          placeholder={copy.placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) clearCitySearch();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void searchCities(query);
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 76px 12px 14px',
            ...neu.controlPressed,
            borderRadius: R.lg,
            border: 'none',
            background: C.surfaceDeep,
            color: C.text,
            fontFamily: fonts.sans,
            fontSize: 14,
            outline: 'none',
          }}
        />
        {query.trim() ? (
          <button
            type="button"
            onClick={() => void searchCities(query)}
            disabled={isSearching}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              color: C.accent,
              cursor: isSearching ? 'default' : 'pointer',
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              padding: '8px 10px',
            }}
          >
            {isSearching ? copy.searching : copy.search}
          </button>
        ) : null}
      </div>

      {results.length > 0 || error ? (
        <div
          style={{
            ...neu.controlPressed,
            borderRadius: R.lg,
            padding: 10,
            marginTop: 8,
            display: 'grid',
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: C.textMutedStrong,
            }}
          >
            {copy.options}
          </div>
          {results.length > 0 ? (
            results.map((result) => (
              <button
                key={`${result.id}-${result.latitude}-${result.longitude}`}
                type="button"
                onClick={() => pick(result)}
                style={{
                  ...neu.controlRaised,
                  border: 'none',
                  borderRadius: R.lg,
                  background: C.surface,
                  color: C.text,
                  padding: '11px 12px',
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
                      fontSize: 14,
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
                      fontSize: 9,
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
                <span style={{ fontFamily: fonts.sans, fontSize: 12, fontWeight: 800, color: C.accent, whiteSpace: 'nowrap' }}>
                  {copy.use}
                </span>
              </button>
            ))
          ) : (
            <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft, lineHeight: 1.5 }}>
              {error || copy.none}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
