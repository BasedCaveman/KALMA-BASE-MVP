// kalma/frontend/lib/place-context.ts
//
// Deterministic generator for the per-place "weather context" paragraph
// surfaced on /places/[slug] and baked into the page's JSON-LD Dataset
// description for AI crawlers that don't execute JS.
//
// Inputs:
//   - place metadata (lat/lon, region, country) — already in Supabase
//   - active local_signals — already fetched server-side for the page
//   - locale (default 'en')
//
// No extra HTTP calls. Localized across the 6 supported languages
// (task #13). The English ('en') output is kept BYTE-IDENTICAL to the
// original so the SSR paragraph AND the JSON-LD Dataset description
// (the AI-citation artifact — task #30) are unchanged. Other locales
// are used only by the client-side localization overlay after
// hydration; the server still emits English into the initial HTML.
//
// Output shape: 2-3 sentences, ~250-350 chars. Concrete enough to be
// citable, generic enough to work for any place in the catalog.

import type { Locale } from './signal-engine/i18n';

export type PlaceCtx = {
  name: string;
  region: string | null;
  country: string;
  countryCode?: string | null;
  lat: number;
  lon: number;
};

export type SignalCtx = {
  signalTypeId: string;
  severity: string;
  titleResolved?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Locale-keyed phrase tables
//
// Every band/zone/severity/friendly-name is stored as a stable KEY, then
// resolved through PHRASES[locale]. The sentence *assembly* is also
// per-locale (word order differs across languages), so each locale owns
// a small set of template functions. The 'en' branch must reproduce the
// original strings exactly.
// ─────────────────────────────────────────────────────────────────────────

type BandKey =
  | 'equatorial'
  | 'tropical'
  | 'subtropical'
  | 'temperate'
  | 'coolTemperate'
  | 'polar';

type ZoneKey = 'americas' | 'europeAfrica' | 'asiaPacific';
type SeverityKey = 'extreme' | 'high' | 'medium' | 'low' | 'strong' | 'active';

function climateBandKey(lat: number): BandKey {
  const a = Math.abs(lat);
  if (a < 10) return 'equatorial';
  if (a < 23.5) return 'tropical';
  if (a < 35) return 'subtropical';
  if (a < 50) return 'temperate';
  if (a < 66.5) return 'coolTemperate';
  return 'polar';
}

function zoneKey(lon: number): ZoneKey {
  if (lon < -30) return 'americas';
  if (lon < 60) return 'europeAfrica';
  return 'asiaPacific';
}

const SEVERITY_ORDER: SeverityKey[] = ['extreme', 'high', 'medium', 'low', 'strong', 'active'];

function rankSeverity(s: string): number {
  const idx = SEVERITY_ORDER.indexOf(s.toLowerCase() as SeverityKey);
  return idx === -1 ? 99 : idx;
}

type LocalePhrases = {
  bands: Record<BandKey, string>;
  zones: Record<ZoneKey, string>;
  severity: Record<SeverityKey, string>;
  /** Signal-type → friendly noun phrase; falls back to `friendlyDefault`. */
  friendly: Record<string, string>;
  friendlyDefault: string;
  /** "northern hemisphere (Americas)" etc. */
  hemisphere: (north: boolean, zone: string) => string;
  /** "{name} sits in {band} {place}, in the {hemi}." */
  locator: (name: string, band: string, place: string, hemi: string) => string;
  /** "2 extreme, 1 low" → the signals-present middle sentence. */
  signalsSentence: (count: number, mix: string) => string;
  /** "Most notable right now: {friendly}." */
  topSignal: (friendly: string) => string;
  noSignals: string;
};

const FRIENDLY_KEYS = [
  'rainfall_risk_rising',
  'heat_stress_window',
  'water_recovery_signal',
  'consecutive_cold_below',
  'dry_stretch_window',
  'frost_risk',
  'heavy_rain_event',
] as const;

const PHRASES: Record<Locale, LocalePhrases> = {
  en: {
    bands: {
      equatorial: 'equatorial',
      tropical: 'tropical',
      subtropical: 'subtropical',
      temperate: 'temperate',
      coolTemperate: 'cool temperate',
      polar: 'polar',
    },
    zones: { americas: 'Americas', europeAfrica: 'Europe/Africa', asiaPacific: 'Asia–Pacific' },
    severity: { extreme: 'extreme', high: 'high', medium: 'medium', low: 'low', strong: 'strong', active: 'active' },
    friendly: {
      rainfall_risk_rising: 'a rising rainfall risk',
      heat_stress_window: 'a heat-stress window',
      water_recovery_signal: 'improving water-recovery conditions',
      consecutive_cold_below: 'a prolonged cold spell',
      dry_stretch_window: 'a developing dry stretch',
      frost_risk: 'a frost risk',
      heavy_rain_event: 'a likely heavy-rain event',
    },
    friendlyDefault: 'an active signal',
    hemisphere: (north, zone) => `${north ? 'northern' : 'southern'} hemisphere (${zone})`,
    locator: (name, band, place, hemi) => `${name} sits in ${band} ${place}, in the ${hemi}.`,
    signalsSentence: (count, mix) =>
      `The signal engine currently shows ${count} active weather signals here (${mix}), updated daily via Open-Meteo historical and forecast data.`,
    topSignal: (friendly) => `Most notable right now: ${friendly}.`,
    noSignals:
      'No active signals at this hour — Kalma re-evaluates every 24 hours against the local 10-year historical baseline.',
  },
  pt: {
    bands: {
      equatorial: 'equatorial',
      tropical: 'tropical',
      subtropical: 'subtropical',
      temperate: 'temperada',
      coolTemperate: 'temperada fria',
      polar: 'polar',
    },
    zones: { americas: 'Américas', europeAfrica: 'Europa/África', asiaPacific: 'Ásia–Pacífico' },
    severity: { extreme: 'extremo', high: 'alto', medium: 'médio', low: 'baixo', strong: 'forte', active: 'ativo' },
    friendly: {
      rainfall_risk_rising: 'um risco crescente de chuva',
      heat_stress_window: 'uma janela de estresse por calor',
      water_recovery_signal: 'melhora nas condições hídricas',
      consecutive_cold_below: 'um período prolongado de frio',
      dry_stretch_window: 'uma estiagem em formação',
      frost_risk: 'um risco de geada',
      heavy_rain_event: 'um provável evento de chuva forte',
    },
    friendlyDefault: 'um sinal ativo',
    hemisphere: (north, zone) => `hemisfério ${north ? 'norte' : 'sul'} (${zone})`,
    locator: (name, band, place, hemi) => `${name} fica em uma zona ${band}, em ${place}, no ${hemi}.`,
    signalsSentence: (count, mix) =>
      `O motor de sinais mostra ${count} ${count === 1 ? 'sinal meteorológico ativo' : 'sinais meteorológicos ativos'} aqui (${mix}), atualizados diariamente com dados históricos e de previsão do Open-Meteo.`,
    topSignal: (friendly) => `Mais relevante agora: ${friendly}.`,
    noSignals:
      'Nenhum sinal ativo neste momento — a Kalma reavalia a cada 24 horas com base na série histórica local de 10 anos.',
  },
  es: {
    bands: {
      equatorial: 'ecuatorial',
      tropical: 'tropical',
      subtropical: 'subtropical',
      temperate: 'templada',
      coolTemperate: 'templada fría',
      polar: 'polar',
    },
    zones: { americas: 'Américas', europeAfrica: 'Europa/África', asiaPacific: 'Asia–Pacífico' },
    severity: { extreme: 'extremo', high: 'alto', medium: 'medio', low: 'bajo', strong: 'fuerte', active: 'activo' },
    friendly: {
      rainfall_risk_rising: 'un riesgo creciente de lluvia',
      heat_stress_window: 'una ventana de estrés por calor',
      water_recovery_signal: 'mejora en las condiciones hídricas',
      consecutive_cold_below: 'una ola de frío prolongada',
      dry_stretch_window: 'una racha seca en desarrollo',
      frost_risk: 'un riesgo de helada',
      heavy_rain_event: 'un probable evento de lluvia fuerte',
    },
    friendlyDefault: 'una señal activa',
    hemisphere: (north, zone) => `hemisferio ${north ? 'norte' : 'sur'} (${zone})`,
    locator: (name, band, place, hemi) => `${name} se ubica en una zona ${band}, en ${place}, en el ${hemi}.`,
    signalsSentence: (count, mix) =>
      `El motor de señales muestra ${count} ${count === 1 ? 'señal meteorológica activa' : 'señales meteorológicas activas'} aquí (${mix}), actualizadas a diario con datos históricos y de pronóstico de Open-Meteo.`,
    topSignal: (friendly) => `Lo más relevante ahora: ${friendly}.`,
    noSignals:
      'Sin señales activas en este momento — Kalma reevalúa cada 24 horas con base en la serie histórica local de 10 años.',
  },
  fr: {
    bands: {
      equatorial: 'équatoriale',
      tropical: 'tropicale',
      subtropical: 'subtropicale',
      temperate: 'tempérée',
      coolTemperate: 'tempérée froide',
      polar: 'polaire',
    },
    zones: { americas: 'Amériques', europeAfrica: 'Europe/Afrique', asiaPacific: 'Asie–Pacifique' },
    severity: { extreme: 'extrême', high: 'élevé', medium: 'moyen', low: 'faible', strong: 'fort', active: 'actif' },
    friendly: {
      rainfall_risk_rising: 'un risque de pluie croissant',
      heat_stress_window: 'une fenêtre de stress thermique',
      water_recovery_signal: 'une amélioration des conditions hydriques',
      consecutive_cold_below: 'une vague de froid prolongée',
      dry_stretch_window: 'une période sèche en formation',
      frost_risk: 'un risque de gel',
      heavy_rain_event: 'un probable épisode de fortes pluies',
    },
    friendlyDefault: 'un signal actif',
    hemisphere: (north, zone) => `hémisphère ${north ? 'nord' : 'sud'} (${zone})`,
    locator: (name, band, place, hemi) => `${name} se situe dans une zone ${band}, à ${place}, dans l’${hemi}.`,
    signalsSentence: (count, mix) =>
      `Le moteur de signaux affiche actuellement ${count} ${count === 1 ? 'signal météo actif' : 'signaux météo actifs'} ici (${mix}), mis à jour chaque jour avec les données historiques et de prévision d’Open-Meteo.`,
    topSignal: (friendly) => `Le plus notable en ce moment : ${friendly}.`,
    noSignals:
      'Aucun signal actif à cette heure — Kalma réévalue toutes les 24 heures à partir de la série historique locale sur 10 ans.',
  },
  de: {
    bands: {
      equatorial: 'äquatoriale',
      tropical: 'tropische',
      subtropical: 'subtropische',
      temperate: 'gemäßigte',
      coolTemperate: 'kühl-gemäßigte',
      polar: 'polare',
    },
    zones: { americas: 'Amerika', europeAfrica: 'Europa/Afrika', asiaPacific: 'Asien–Pazifik' },
    severity: { extreme: 'extrem', high: 'hoch', medium: 'mittel', low: 'niedrig', strong: 'stark', active: 'aktiv' },
    friendly: {
      rainfall_risk_rising: 'ein steigendes Regenrisiko',
      heat_stress_window: 'ein Hitzestress-Fenster',
      water_recovery_signal: 'sich bessernde Wasserverhältnisse',
      consecutive_cold_below: 'eine anhaltende Kältewelle',
      dry_stretch_window: 'eine sich bildende Trockenphase',
      frost_risk: 'ein Frostrisiko',
      heavy_rain_event: 'ein wahrscheinliches Starkregenereignis',
    },
    friendlyDefault: 'ein aktives Signal',
    hemisphere: (north, zone) => `${north ? 'Nordhalbkugel' : 'Südhalbkugel'} (${zone})`,
    locator: (name, band, place, hemi) => `${name} liegt in einer ${band} Zone in ${place}, auf der ${hemi}.`,
    signalsSentence: (count, mix) =>
      `Die Signal-Engine zeigt hier derzeit ${count} ${count === 1 ? 'aktives Wettersignal' : 'aktive Wettersignale'} (${mix}), täglich aktualisiert mit historischen und Prognosedaten von Open-Meteo.`,
    topSignal: (friendly) => `Aktuell am wichtigsten: ${friendly}.`,
    noSignals:
      'Zurzeit keine aktiven Signale — Kalma wertet alle 24 Stunden anhand der lokalen 10-Jahres-Klimareihe neu aus.',
  },
  zh: {
    bands: {
      equatorial: '赤道',
      tropical: '热带',
      subtropical: '亚热带',
      temperate: '温带',
      coolTemperate: '冷温带',
      polar: '极地',
    },
    zones: { americas: '美洲', europeAfrica: '欧洲/非洲', asiaPacific: '亚太' },
    severity: { extreme: '极端', high: '高', medium: '中', low: '低', strong: '强', active: '活跃' },
    friendly: {
      rainfall_risk_rising: '上升的降雨风险',
      heat_stress_window: '热应激窗口',
      water_recovery_signal: '正在改善的水情',
      consecutive_cold_below: '持续的寒潮',
      dry_stretch_window: '正在形成的干旱期',
      frost_risk: '霜冻风险',
      heavy_rain_event: '可能的强降雨事件',
    },
    friendlyDefault: '一个活跃信号',
    hemisphere: (north, zone) => `${north ? '北半球' : '南半球'}（${zone}）`,
    locator: (name, band, place, hemi) => `${name}位于${place}的${band}地区，处于${hemi}。`,
    signalsSentence: (count, mix) =>
      `信号引擎目前显示此地有 ${count} 个活跃天气信号（${mix}），每日通过 Open-Meteo 的历史与预报数据更新。`,
    topSignal: (friendly) => `当前最值得关注：${friendly}。`,
    noSignals: '此刻没有活跃信号 —— Kalma 每 24 小时依据当地 10 年历史基线重新评估。',
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Sentence builders
// ─────────────────────────────────────────────────────────────────────────

// "2 extreme, 1 low" — sorted by severity descending, severity word localized.
function describeSeverityMix(signals: SignalCtx[], p: LocalePhrases): string {
  if (signals.length === 0) return '';
  const counts: Record<string, number> = {};
  for (const s of signals) {
    const k = s.severity.toLowerCase();
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => rankSeverity(a[0]) - rankSeverity(b[0]))
    .map(([sev, n]) => `${n} ${p.severity[sev as SeverityKey] ?? sev}`)
    .join(', ');
}

function describeTopSignal(signals: SignalCtx[], p: LocalePhrases): string {
  if (signals.length === 0) return '';
  const top = [...signals].sort(
    (a, b) => rankSeverity(a.severity) - rankSeverity(b.severity)
  )[0];
  const friendly = p.friendly[top.signalTypeId] ?? p.friendlyDefault;
  return p.topSignal(friendly);
}

function locatorSentence(place: PlaceCtx, p: LocalePhrases): string {
  const band = p.bands[climateBandKey(place.lat)];
  const hemi = p.hemisphere(place.lat >= 0, p.zones[zoneKey(place.lon)]);
  const tail = place.region
    ? `${place.region}, ${place.country}`
    : place.country;
  return p.locator(place.name, band, tail, hemi);
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the weather-context paragraph for a place, in the given locale.
 *
 * Returns 1–3 sentences depending on what's available:
 *   1. Always: geographic positioning.
 *   2. If active signals exist: count + severity mix + standing data source.
 *   3. If at least one active signal exists: highlight the most severe.
 *
 * The output is plain text — no markup — so the same string works for
 * the SSR'd <section> element and for the JSON-LD Dataset description.
 * The default 'en' output is byte-identical to the pre-i18n version.
 */
export function buildWeatherContext(
  place: PlaceCtx,
  signals: SignalCtx[],
  locale: Locale = 'en'
): string {
  const p = PHRASES[locale] ?? PHRASES.en;
  const parts: string[] = [];
  parts.push(locatorSentence(place, p));

  if (signals.length > 0) {
    parts.push(p.signalsSentence(signals.length, describeSeverityMix(signals, p)));
    parts.push(describeTopSignal(signals, p));
  } else {
    parts.push(p.noSignals);
  }

  return parts.join(' ').trim();
}
