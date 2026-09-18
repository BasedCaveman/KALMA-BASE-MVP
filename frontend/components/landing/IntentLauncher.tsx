// kalma/frontend/components/landing/IntentLauncher.tsx
//
// "Prompt-shaped UX, rule-based engine."
//
// Above-the-fold interaction on the landing page (`/`).
//
// PRIMARY PATH (rewritten 2026-08-04): pick your place, land on that place's
// page. One tap on "use my location", or a nearby chip, or a debounced
// typeahead result. It used to take four interactions behind a separate
// SEARCH button, below a five-line hero, and then routed to /today, which
// leads with the nearest live market: with a dozen answerable markets on
// Earth, choosing Lavras was answered with a question about Concepcion, Chile.
//
// SECONDARY PATH (unchanged): the collapsed refine chips (care-about, risk,
// horizon) still build a filtered /signals feed via query params. They are a
// power filter, deliberately not a gate in front of the primary path.
//
// Not a chatbot. No AI. Just structured chips that feel as fast as
// asking a question. The "rule-based engine" reading the params lives
// in app/signals/page.tsx.
//
// Onboarding prompt is now localised across all 6 languages (en/pt/
// es/fr/de/zh). IMPORTANT: only the *labels* are translated — the chip
// `id`s are stable query-param values shared with /signals, so they
// must never change. Chip labels live in CHIP_LABELS keyed by id ×
// language; section headings + CTA live in launcherCopy().

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocationContext } from '@/hooks/useLocationContext';
import {
  buildCitySearchLabel,
  buildCitySearchMeta,
  useCitySearch,
  type CitySearchResult,
} from '@/hooks/useCitySearch';
import {
  getActivityLabel,
  TODAY_FEATURED_ACTIVITY_IDS,
  type ActivityTaxonomyId,
} from '@/lib/activity-taxonomy';
import { logPlaceCandidate } from '@/lib/place-candidate';
import {
  readTodayPreferences,
  writeTodayActivityPreference,
} from '@/lib/today-preferences';

// ── Chip data (stable ids + signal-type mapping) ────────────────────────────
// Labels are resolved per-language at render time via CHIP_LABELS; the
// ids here are the URL-param contract with /signals and must stay fixed.

const AUDIENCE_IDS = ['farm', 'rural-stay', 'events', 'route', 'city'] as const;

const RISK_DEFS: Array<{ id: string; signalTypes: string[] }> = [
  { id: 'rain', signalTypes: ['rainfall_risk_rising', 'heavy_rain_event'] },
  { id: 'heat', signalTypes: ['heat_stress_window'] },
  { id: 'cold', signalTypes: ['consecutive_cold_below', 'frost_risk'] },
  { id: 'drought', signalTypes: ['dry_stretch_window', 'water_recovery_signal'] },
];

const HORIZON_IDS = ['today', 'week', 'weekend', '15d'] as const;

// Chip labels keyed by id → language. Falls back to the en label when a
// language is missing a key. Keeping all chip strings in one place makes
// the translation surface auditable at a glance.
const CHIP_LABELS: Record<string, Record<string, string>> = {
  // Audience
  farm: { en: 'My farm', pt: 'Minha lavoura', es: 'Mi campo', fr: 'Ma ferme', de: 'Mein Hof', zh: '我的农场' },
  'rural-stay': { en: 'My rural stay', pt: 'Minha pousada', es: 'Mi alojamiento rural', fr: 'Mon gîte rural', de: 'Meine Ferienunterkunft', zh: '我的乡村住宿' },
  events: { en: 'My events', pt: 'Meus eventos', es: 'Mis eventos', fr: 'Mes événements', de: 'Meine Events', zh: '我的活动' },
  route: { en: 'My route', pt: 'Minha rota', es: 'Mi ruta', fr: 'Mon trajet', de: 'Meine Route', zh: '我的路线' },
  city: { en: 'My city', pt: 'Minha cidade', es: 'Mi ciudad', fr: 'Ma ville', de: 'Meine Stadt', zh: '我的城市' },
  // Risk
  rain: { en: 'Rain', pt: 'Chuva', es: 'Lluvia', fr: 'Pluie', de: 'Regen', zh: '降雨' },
  heat: { en: 'Heat', pt: 'Calor', es: 'Calor', fr: 'Chaleur', de: 'Hitze', zh: '高温' },
  cold: { en: 'Cold', pt: 'Frio', es: 'Frío', fr: 'Froid', de: 'Kälte', zh: '寒冷' },
  drought: { en: 'Drought', pt: 'Estiagem', es: 'Sequía', fr: 'Sécheresse', de: 'Dürre', zh: '干旱' },
  // Horizon
  today: { en: 'Today', pt: 'Hoje', es: 'Hoy', fr: "Aujourd'hui", de: 'Heute', zh: '今天' },
  week: { en: 'This week', pt: 'Esta semana', es: 'Esta semana', fr: 'Cette semaine', de: 'Diese Woche', zh: '本周' },
  weekend: { en: 'This weekend', pt: 'Este fim de semana', es: 'Este fin de semana', fr: 'Ce week-end', de: 'Dieses Wochenende', zh: '这个周末' },
  // "Next 15 days" caps the IntentLauncher's reach at how far the
  // signal engine actually sees (short-term forecasts, ~1-2wk windows).
  '15d': { en: 'Next 15 days', pt: 'Próximos 15 dias', es: 'Próximos 15 días', fr: 'Prochains 15 jours', de: 'Nächste 15 Tage', zh: '未来 15 天' },
};

export function chipLabel(id: string, language: string): string {
  const entry = CHIP_LABELS[id];
  if (!entry) return id;
  return entry[language] ?? entry.en ?? id;
}

// Place-first arrival copy (2026-08-04). Kept in its own table because the
// keys below belong to the launcher's original filter flow, and mixing the two
// made it impossible to see at a glance which strings serve the primary path.
const ARRIVAL_COPY: Record<
  string,
  { useLocation: string; locating: string; nearYou: string; noPlaces: string; opening: string }
> = {
  en: {
    useLocation: 'Use my location',
    locating: 'Finding your area...',
    nearYou: 'Near you',
    noPlaces: 'No covered place near there yet. We logged it, and you can still read the closest signals.',
    opening: 'Opening...',
  },
  pt: {
    useLocation: 'Usar minha localização',
    locating: 'Encontrando sua área...',
    nearYou: 'Perto de você',
    noPlaces: 'Ainda não há lugar coberto por aí. Registramos, e você já pode ler os sinais mais próximos.',
    opening: 'Abrindo...',
  },
  es: {
    useLocation: 'Usar mi ubicación',
    locating: 'Buscando tu zona...',
    nearYou: 'Cerca de ti',
    noPlaces: 'Todavía no hay un lugar cubierto por ahí. Lo registramos, y ya puedes leer las señales más cercanas.',
    opening: 'Abriendo...',
  },
  fr: {
    useLocation: 'Utiliser ma position',
    locating: 'Recherche de ta zone...',
    nearYou: 'Près de toi',
    noPlaces: "Aucun lieu couvert par ici pour l'instant. C'est enregistré, et tu peux déjà lire les signaux les plus proches.",
    opening: 'Ouverture...',
  },
  de: {
    useLocation: 'Meinen Standort verwenden',
    locating: 'Deine Gegend wird gesucht...',
    nearYou: 'In deiner Nähe',
    noPlaces: 'Dort gibt es noch keinen abgedeckten Ort. Wir haben es notiert, und du kannst die nächstgelegenen Signale schon lesen.',
    opening: 'Wird geöffnet...',
  },
  zh: {
    useLocation: '使用我的位置',
    locating: '正在查找你的区域...',
    nearYou: '你附近',
    noPlaces: '那附近还没有覆盖的地点。已记录，你仍可以查看最近的信号。',
    opening: '正在打开...',
  },
};

function arrivalCopy(language: string) {
  return ARRIVAL_COPY[language] ?? ARRIVAL_COPY.en;
}

// How far a geocoded city may sit from a covered place and still open that
// place's page. Beyond this the two are different weather, so we log the demand
// and fall back to the nearest-signals feed instead of pretending.
export const PLACE_MATCH_MAX_KM = 60;

// Section headings + CTA + placeholder, per language.
function launcherCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      heading: 'What weather are you watching?',
      place: 'Place',
      placePlaceholder: 'Search your city — Perdões, MG',
      activity: 'I need this for',
      audience: 'I care about',
      risk: 'Weather risk',
      when: 'When',
      cta: 'Show local signals →',
      searching: 'Searching…',
      options: 'Choose a city',
      noOptions: 'No city options found. Try another spelling.',
      useCity: 'Use city',
    },
    pt: {
      heading: 'Qual clima você está acompanhando?',
      place: 'Lugar',
      placePlaceholder: 'Busque sua cidade — Perdões, MG',
      activity: 'Preciso disso para',
      audience: 'Eu me importo com',
      risk: 'Risco climático',
      when: 'Quando',
      cta: 'Ver sinais locais →',
      searching: 'Buscando…',
      options: 'Escolha uma cidade',
      noOptions: 'Nenhuma opção encontrada. Tente outra grafia.',
      useCity: 'Usar cidade',
    },
    es: {
      heading: '¿Qué clima estás vigilando?',
      place: 'Lugar',
      placePlaceholder: 'Busca tu ciudad — Perdões, MG',
      activity: 'Lo necesito para',
      audience: 'Me importa',
      risk: 'Riesgo climático',
      when: 'Cuándo',
      cta: 'Ver señales locales →',
      searching: 'Buscando…',
      options: 'Elige una ciudad',
      noOptions: 'No se encontraron opciones. Prueba otra grafía.',
      useCity: 'Usar ciudad',
    },
    fr: {
      heading: 'Quelle météo surveilles-tu ?',
      place: 'Lieu',
      placePlaceholder: 'Cherche ta ville — Perdões, MG',
      activity: "J'en ai besoin pour",
      audience: 'Ce qui compte pour moi',
      risk: 'Risque météo',
      when: 'Quand',
      cta: 'Voir les signaux locaux →',
      searching: 'Recherche…',
      options: 'Choisir une ville',
      noOptions: 'Aucune option trouvée. Essaie une autre orthographe.',
      useCity: 'Utiliser',
    },
    de: {
      heading: 'Welches Wetter beobachtest du?',
      place: 'Ort',
      placePlaceholder: 'Suche deine Stadt — Perdões, MG',
      activity: 'Ich brauche das für',
      audience: 'Mir ist wichtig',
      risk: 'Wetter-Risiko',
      when: 'Wann',
      cta: 'Lokale Signale anzeigen →',
      searching: 'Suche…',
      options: 'Stadt wählen',
      noOptions: 'Keine Optionen gefunden. Andere Schreibweise versuchen.',
      useCity: 'Stadt nutzen',
    },
    zh: {
      heading: '你在关注什么天气？',
      place: '地点',
      placePlaceholder: '搜索你的城市 — Perdões, MG',
      activity: '我需要用于',
      audience: '我关心的是',
      risk: '天气风险',
      when: '时间',
      cta: '查看本地信号 →',
      searching: '搜索中…',
      options: '选择城市',
      noOptions: '未找到城市选项。请尝试其他拼写。',
      useCity: '使用城市',
    },
  };
  return table[language] ?? table.en;
}

// ── Helpers exported for the /signals page to decode the same params ──────

export type NearestPlace = {
  slug: string;
  name: string;
  region: string | null;
  country: string;
  countryCode: string;
  km: number;
};

/** Nearest covered places to a coordinate. Empty on any failure: the arrival
 *  path must still work when the catalog lookup is unavailable. */
async function fetchNearestPlaces(
  lat: number,
  lon: number,
  limit = 4,
): Promise<NearestPlace[]> {
  try {
    const res = await fetch(`/api/places/nearest?lat=${lat}&lon=${lon}&limit=${limit}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { places?: NearestPlace[] };
    return payload?.places ?? [];
  } catch {
    return [];
  }
}

export function signalTypesForRisks(riskIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of riskIds) {
    const r = RISK_DEFS.find((c) => c.id === id);
    if (r) r.signalTypes.forEach((t) => out.add(t));
  }
  return Array.from(out);
}

/**
 * Format a horizon param value for display in the active-filter chip
 * strip on /signals. Recognises the fixed chip ids (localised via
 * CHIP_LABELS); falls back to the raw string (hyphens → spaces).
 * The /signals strip passes the user's current language.
 */
export function formatHorizonLabel(value: string, language = 'en'): string {
  if (CHIP_LABELS[value]) return chipLabel(value, language);
  return value.replace(/-/g, ' ');
}

// ── Component ──────────────────────────────────────────────────────────────

export default function IntentLauncher() {
  const router = useRouter();
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const { location, setManualLocation } = useLocationContext();
  const copy = launcherCopy(language);
  const {
    results: citySearchResults,
    isSearching: citySearchLoading,
    error: citySearchError,
    searchCities,
    clearCitySearch,
  } = useCitySearch();

  // Seed the place input with the user's saved location if they have one.
  // Empty string otherwise — they can type whatever city they care about.
  const initialPlace = useMemo(() => {
    if (!location) return '';
    const parts = [location.city, location.region, location.country].filter(
      Boolean,
    );
    return parts.join(', ');
  }, [location]);

  const arrival = arrivalCopy(language);

  const [place, setPlace] = useState(initialPlace);
  const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null);
  const [nearby, setNearby] = useState<NearestPlace[]>([]);
  const [locating, setLocating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityTaxonomyId>('all');
  const [audience, setAudience] = useState<string | null>(null);
  const [risks, setRisks] = useState<string[]>([]);
  const [horizon, setHorizon] = useState<string | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !submitting;

  // Seed the input ONCE, when the saved location first loads (it arrives
  // async). Never re-seed afterwards — otherwise clearing the field to search a
  // different city snaps it back to the saved city (the reported bug).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && initialPlace) {
      setPlace(initialPlace);
      seededRef.current = true;
    }
  }, [initialPlace]);

  useEffect(() => {
    setActivity(readTodayPreferences().activityFilter);
  }, []);

  // "Near you" chips. Most people should never have to type: the approximate
  // location already exists server-side (no browser permission prompt), so the
  // moment it resolves we can offer the real covered places around it.
  useEffect(() => {
    if (location?.lat == null || location?.lon == null) return;
    let cancelled = false;
    void fetchNearestPlaces(location.lat, location.lon, 4).then((places) => {
      if (!cancelled) setNearby(places);
    });
    return () => {
      cancelled = true;
    };
  }, [location?.lat, location?.lon]);

  // Typeahead. The old flow needed a separate SEARCH press before anything
  // happened, which made picking a city a four-interaction form. Debounced at
  // 250ms so results arrive on their own without a request per keystroke.
  useEffect(() => {
    const typed = place.trim();
    if (selectedCity || typed.length < 2) return;
    const id = window.setTimeout(() => {
      void searchCities(typed);
    }, 250);
    return () => window.clearTimeout(id);
  }, [place, selectedCity, searchCities]);

  /**
   * The arrival itself: take a coordinate and open the place page that covers
   * it. Falls back to the nearest-signals feed only when nothing covered is
   * within PLACE_MATCH_MAX_KM, and records the demand either way so the
   * catalog grows toward where people actually are.
   */
  async function openNearestPlace(input: {
    name: string;
    region: string | null;
    country: string | null;
    lat: number;
    lon: number;
  }) {
    setOpening(true);
    setFallbackNote(null);

    setManualLocation({
      city: input.name,
      region: input.region,
      country: input.country,
      lat: input.lat,
      lon: input.lon,
      timezone: null,
    });
    logPlaceCandidate({
      name: input.name,
      region: input.region,
      country: input.country,
      lat: input.lat,
      lon: input.lon,
    });
    writeTodayActivityPreference(activity);

    const [match] = await fetchNearestPlaces(input.lat, input.lon, 1);
    if (match && match.km <= PLACE_MATCH_MAX_KM) {
      router.push(`/places/${match.slug}`);
      return;
    }

    // Honest fallback: no covered place near there, so say so and hand over the
    // closest live signals rather than opening a page about somewhere else.
    setOpening(false);
    setFallbackNote(arrival.noPlaces);
    const params = new URLSearchParams({
      place: input.name,
      lat: input.lat.toFixed(4),
      lon: input.lon.toFixed(4),
    });
    router.push(`/signals?${params.toString()}`);
  }

  async function useMyLocation() {
    if (location?.lat != null && location?.lon != null) {
      await openNearestPlace({
        name: location.city ?? '',
        region: location.region ?? null,
        country: location.country ?? null,
        lat: location.lat,
        lon: location.lon,
      });
      return;
    }
    // The context is still resolving the approximate area; show that rather
    // than a dead button.
    setLocating(true);
    window.setTimeout(() => setLocating(false), 4000);
  }

  function selectActivity(next: ActivityTaxonomyId) {
    setActivity(next);
    writeTodayActivityPreference(next);
  }

  // Geocode the typed place (Open-Meteo, same source the rest of the app
  // uses). Free text alone can't bind to a real location — typos like
  // "Campiinas" would just produce an empty substring filter. By
  // resolving to lat/lon here we (a) pass coordinates to /signals so it
  // can fall back to the nearest signals when the exact place has none,
  // and (b) feed the demand queue with a canonical candidate.
  async function geocode(query: string): Promise<
    | { name: string; lat: number; lon: number; region: string | null; country: string | null }
    | null
  > {
    try {
      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
        `&count=1&language=en&format=json`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: any[] };
      const first = data?.results?.[0];
      if (!first || typeof first.latitude !== 'number') return null;
      return {
        name: first.name ?? query,
        lat: first.latitude,
        lon: first.longitude,
        region: first.admin1 ?? null,
        country: first.country ?? null,
      };
    } catch {
      return null;
    }
  }

  function pickCity(result: CitySearchResult) {
    setSelectedCity(result);
    setPlace(buildCitySearchLabel(result));
    clearCitySearch();

    // Picking a city opens THAT PLACE, not /today. /today leads with the
    // nearest live market, and with a dozen answerable markets on Earth
    // "nearest" is meaningless: choosing Lavras used to be answered with a
    // question about Concepcion, Chile. The place page is the one surface
    // that is actually about the place the person just named.
    void openNearestPlace({
      name: result.name,
      region: result.admin1 ?? null,
      country: result.country ?? null,
      lat: result.latitude,
      lon: result.longitude,
    });
  }

  async function submit() {
    if (submitting) return;
    const params = new URLSearchParams();
    const typed = place.trim();

    if (selectedCity) {
      params.set('place', selectedCity.name);
      params.set('lat', selectedCity.latitude.toFixed(4));
      params.set('lon', selectedCity.longitude.toFixed(4));
      logPlaceCandidate({
        name: selectedCity.name,
        region: selectedCity.admin1 ?? null,
        country: selectedCity.country ?? null,
        lat: selectedCity.latitude,
        lon: selectedCity.longitude,
      });
    } else if (typed) {
      setSubmitting(true);
      const geo = await geocode(typed);
      setSubmitting(false);
      if (geo) {
        // Use the canonical name + coordinates. /signals filters by the
        // name and uses lat/lon for the nearest-signals fallback.
        params.set('place', geo.name);
        params.set('lat', geo.lat.toFixed(4));
        params.set('lon', geo.lon.toFixed(4));
        logPlaceCandidate({
          name: geo.name,
          region: geo.region,
          country: geo.country,
          lat: geo.lat,
          lon: geo.lon,
        });
      } else {
        // Geocode failed (offline / unknown) — fall back to the raw
        // string so the user still gets a substring-filtered feed.
        params.set('place', typed);
      }
    }

    if (audience) params.set('for', audience);
    if (activity !== 'all') params.set('activity', activity);
    if (risks.length > 0) params.set('risks', risks.join(','));
    if (horizon) params.set('horizon', horizon);
    const query = params.toString();
    router.push(query ? `/signals?${query}` : '/signals');
  }

  function toggleRisk(id: string) {
    setRisks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── Visual styles ────────────────────────────────────────────────────────

  const sectionLabel: React.CSSProperties = {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    opacity: 0.6,
    marginBottom: 10,
  };

  const chipBase: React.CSSProperties = {
    padding: '9px 14px',
    borderRadius: 999,
    border: '1px solid color-mix(in srgb, var(--k-text) 14%, transparent)',
    background: 'transparent',
    color: 'inherit',
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 100ms ease-out, border-color 100ms ease-out',
  };

  const chipActive: React.CSSProperties = {
    background: `${C.accent}1A`,
    borderColor: `${C.accent}66`,
    color: C.text,
  };

  const chipRow: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  };

  const refineCount = (audience ? 1 : 0) + risks.length + (horizon ? 1 : 0);
  const refineLabel =
    ({
      en: 'Refine (optional)',
      pt: 'Refinar (opcional)',
      es: 'Refinar (opcional)',
      fr: 'Affiner (optionnel)',
      de: 'Verfeinern (optional)',
      zh: '细化（可选）',
    } as Record<string, string>)[language] ?? 'Refine (optional)';

  return (
    <section
      style={{
        ...neu.panelRaised,
        borderRadius: 24,
        padding: '22px 20px 20px',
        background: C.surface,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.005em',
          marginBottom: 16,
        }}
      >
        {copy.heading}
      </div>

      {/* ── PLACE ─────────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{copy.place}</div>
      <input
        id="intent-place-search"
        name="place"
        type="text"
        placeholder={copy.placePlaceholder}
        value={place}
        onChange={(e) => {
          setPlace(e.target.value);
          setSelectedCity(null);
          if (!e.target.value.trim()) clearCitySearch();
        }}
        onKeyDown={(e) => {
          // Enter picks the first match. It used to only fire the search,
          // which meant a keyboard user pressed Enter and nothing selected.
          if (e.key === 'Enter' && citySearchResults[0]) {
            e.preventDefault();
            pickCity(citySearchResults[0]);
          }
        }}
        style={{
          width: '100%',
          padding: '12px 86px 12px 14px',
          borderRadius: R.lg,
          border: '1px solid color-mix(in srgb, var(--k-text) 14%, transparent)',
          background: 'color-mix(in srgb, var(--k-surface) 70%, transparent)',
          color: 'inherit',
          fontFamily: fonts.sans,
          fontSize: 14,
          outline: 'none',
          marginBottom: 20,
          boxSizing: 'border-box',
        }}
      />
      {/* The SEARCH button is gone. It was a separate control the user had to
          find and press before anything happened, turning "pick your city"
          into a four-interaction form above a five-line hero. Results now
          arrive on their own, 250ms after typing stops. */}

      {/* Primary affordance: most people should never type at all. This uses
          the server-side approximate location, so there is no browser
          permission prompt and nothing to grant. */}
      <button
        type="button"
        onClick={() => void useMyLocation()}
        disabled={opening}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 52,
          padding: '14px 18px',
          borderRadius: R.lg,
          // Secondary, on purpose. The landing had four filled accent buttons
          // competing on one screen, which means none of them was primary.
          // The single primary action on this fold is the live block's "Open
          // <place>"; this is the fallback for someone whose place we could
          // not guess, so it reads as an option, not as the instruction.
          border: `1px solid ${C.accent}66`,
          background: 'transparent',
          color: C.accent,
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: 700,
          cursor: opening ? 'default' : 'pointer',
          opacity: opening ? 0.75 : 1,
          marginBottom: 6,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        {opening ? arrival.opening : locating ? arrival.locating : arrival.useLocation}
      </button>

      {fallbackNote ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: C.textSoft,
            marginBottom: 8,
          }}
        >
          {fallbackNote}
        </div>
      ) : null}

      {/* a11y: announce search progress/results to assistive tech — the
          Search button only swaps its visible label, which screen readers
          don't surface. (Pre-launch QA, audit #2.) */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {citySearchLoading
          ? copy.searching
          : citySearchResults.length > 0
            ? copy.options
            : citySearchError
              ? copy.noOptions
              : ''}
      </div>

      {citySearchResults.length > 0 || citySearchError ? (
        <div
          style={{
            ...neu.controlPressed,
            borderRadius: R.lg,
            padding: 10,
            margin: '4px 0 18px',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={sectionLabel}>{copy.options}</div>
          {citySearchResults.length > 0 ? (
            citySearchResults.map((result) => (
              <button
                key={`${result.id}-${result.latitude}-${result.longitude}`}
                type="button"
                onClick={() => pickCity(result)}
                style={{
                  ...neu.controlRaised,
                  border: 'none',
                  borderRadius: R.lg,
                  background: 'color-mix(in srgb, var(--k-surface) 78%, transparent)',
                  color: 'inherit',
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
                <span
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 12,
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
                fontSize: 13,
                color: C.textSoft,
                lineHeight: 1.5,
              }}
            >
              {citySearchError || copy.noOptions}
            </div>
          )}
        </div>
      ) : null}

      {/* ── NEAR YOU ─────────────────────────────────────────────────────
          Real covered places around the approximate location, so someone in
          Minas sees towns in Minas before touching the keyboard. Renders
          nothing until the catalog lookup answers, which keeps the panel from
          jumping on first paint. */}
      {nearby.length > 0 ? (
        <>
          <div style={sectionLabel}>{arrival.nearYou}</div>
          <div style={{ ...chipRow, marginBottom: 20 }}>
            {nearby.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => {
                  // Already a covered place, so no resolution round-trip.
                  writeTodayActivityPreference(activity);
                  setOpening(true);
                  router.push(`/places/${p.slug}`);
                }}
                style={chipBase}
              >
                {p.name}
                <span style={{ opacity: 0.55, fontFamily: fonts.mono, fontSize: 10, marginLeft: 6 }}>
                  {p.km < 1 ? '<1' : Math.round(p.km)}km
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* ── ACTIVITY ─────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{copy.activity}</div>
      <div style={chipRow}>
        {TODAY_FEATURED_ACTIVITY_IDS.map((id) => {
          const active = activity === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectActivity(id)}
              style={{ ...chipBase, ...(active ? chipActive : {}) }}
            >
              {getActivityLabel(id, language)}
            </button>
          );
        })}
      </div>

      {/* Refine is optional — the launcher leads with "find your city". The
          care-about / risk / when chips are a power filter, collapsed by default
          so setup never blocks seeing what's live (Read-first). */}
      <button
        type="button"
        onClick={() => setShowRefine((v) => !v)}
        style={{
          ...chipBase,
          alignSelf: 'flex-start',
          margin: '2px 0 12px',
          cursor: 'pointer',
          color: refineCount > 0 ? C.accent : undefined,
        }}
      >
        {refineLabel}
        {refineCount > 0 ? ` · ${refineCount}` : ''} {showRefine ? '▴' : '▾'}
      </button>

      {showRefine ? (
        <>
      {/* ── AUDIENCE ─────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{copy.audience}</div>
      <div style={chipRow}>
        {AUDIENCE_IDS.map((id) => {
          const active = audience === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAudience(active ? null : id)}
              style={{ ...chipBase, ...(active ? chipActive : {}) }}
            >
              {chipLabel(id, language)}
            </button>
          );
        })}
      </div>

      {/* ── RISK ─────────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{copy.risk}</div>
      <div style={chipRow}>
        {RISK_DEFS.map((c) => {
          const active = risks.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleRisk(c.id)}
              style={{ ...chipBase, ...(active ? chipActive : {}) }}
            >
              {chipLabel(c.id, language)}
            </button>
          );
        })}
      </div>

      {/* ── HORIZON ──────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{copy.when}</div>
      <div style={chipRow}>
        {HORIZON_IDS.map((id) => {
          const active = horizon === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setHorizon(active ? null : id)}
              style={{ ...chipBase, ...(active ? chipActive : {}) }}
            >
              {chipLabel(id, language)}
            </button>
          );
        })}
      </div>
        </>
      ) : null}

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%',
          padding: '15px 18px',
          borderRadius: R.lg,
          border: 'none',
          background: 'var(--k-dark-btn)',
          color: 'var(--k-dark-btn-text)',
          fontFamily: fonts.sans,
          fontSize: 15,
          fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'default',
          marginTop: 4,
          boxShadow: `0 12px 24px ${C.shadowA}33`,
          opacity: submitting ? 0.75 : 1,
        }}
      >
        {submitting ? copy.searching : copy.cta}
      </button>
    </section>
  );
}
