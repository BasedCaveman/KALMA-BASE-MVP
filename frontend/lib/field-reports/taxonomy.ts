// kalma/frontend/lib/field-reports/taxonomy.ts
//
// FR-1 — canonical taxonomy for structured field reports ("what are you
// seeing?"). Design-spec-first: stable IDs here are the source of truth; the UI
// renders localized labels and the DB stores only the IDs (never raw localized
// strings), mirroring the activity-taxonomy rule. New report types get a new ID
// + labels in all six languages — IDs never change once shipped.
//
// A report = one subtype (REQUIRED) + optional severity + optional short note +
// optional expiry, attached to a place/market. Groups are display buckets only;
// the subtype ID is what's stored. Free text stays available but secondary.

export type Locale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

export type FieldReportGroupId =
  | 'rain_flooding'
  | 'heat_dryness'
  | 'cold_frost'
  | 'wind_storm'
  | 'access_ops'
  | 'recommendation';

export type FieldReportSeverity = 'low' | 'medium' | 'high';
export type FieldReportExpiry = '1h' | '3h' | 'today' | 'custom';

type L = Record<Locale, string>;

export type FieldReportSubtype = {
  id: string; // stable canonical ID — stored in DB, never localized
  group: FieldReportGroupId;
  /** A recommendation/alert is advice, not a sighting — the UI frames these
   *  differently (and they should not feed "still here?" confirmations). */
  advisory?: boolean;
  label: L;
};

export const FIELD_REPORT_GROUPS: { id: FieldReportGroupId; label: L }[] = [
  { id: 'rain_flooding', label: { en: 'Rain / flooding', pt: 'Chuva / alagamento', es: 'Lluvia / inundación', fr: 'Pluie / inondation', de: 'Regen / Überflutung', zh: '降雨 / 洪涝' } },
  { id: 'heat_dryness', label: { en: 'Heat / dryness', pt: 'Calor / seca', es: 'Calor / sequía', fr: 'Chaleur / sécheresse', de: 'Hitze / Trockenheit', zh: '高温 / 干旱' } },
  { id: 'cold_frost', label: { en: 'Cold / frost', pt: 'Frio / geada', es: 'Frío / helada', fr: 'Froid / gel', de: 'Kälte / Frost', zh: '寒冷 / 霜冻' } },
  { id: 'wind_storm', label: { en: 'Wind / storm', pt: 'Vento / tempestade', es: 'Viento / tormenta', fr: 'Vent / tempête', de: 'Wind / Sturm', zh: '大风 / 风暴' } },
  { id: 'access_ops', label: { en: 'Access / operations', pt: 'Acesso / operações', es: 'Acceso / operaciones', fr: 'Accès / opérations', de: 'Zugang / Betrieb', zh: '通行 / 作业' } },
  { id: 'recommendation', label: { en: 'Recommendation / alert', pt: 'Recomendação / alerta', es: 'Recomendación / alerta', fr: 'Recommandation / alerte', de: 'Empfehlung / Warnung', zh: '建议 / 警示' } },
];

export const FIELD_REPORT_SUBTYPES: FieldReportSubtype[] = [
  // Rain / flooding
  { id: 'heavy_rain_now', group: 'rain_flooding', label: { en: 'Heavy rain now', pt: 'Chuva forte agora', es: 'Lluvia fuerte ahora', fr: 'Forte pluie maintenant', de: 'Starkregen jetzt', zh: '正在强降雨' } },
  { id: 'street_flooding', group: 'rain_flooding', label: { en: 'Street flooding', pt: 'Rua alagada', es: 'Calle inundada', fr: 'Rue inondée', de: 'Straße überflutet', zh: '街道积水' } },
  { id: 'river_rising', group: 'rain_flooding', label: { en: 'River / stream rising', pt: 'Rio / córrego subindo', es: 'Río / arroyo creciendo', fr: 'Rivière / ruisseau en crue', de: 'Fluss / Bach steigt', zh: '河水上涨' } },
  { id: 'drainage_blocked', group: 'rain_flooding', label: { en: 'Drainage blocked', pt: 'Drenagem bloqueada', es: 'Drenaje bloqueado', fr: 'Drainage bouché', de: 'Abfluss verstopft', zh: '排水堵塞' } },
  { id: 'landslide_risk', group: 'rain_flooding', label: { en: 'Landslide risk', pt: 'Risco de deslizamento', es: 'Riesgo de deslizamiento', fr: 'Risque de glissement', de: 'Erdrutschgefahr', zh: '滑坡风险' } },
  // Heat / dryness
  { id: 'extreme_heat', group: 'heat_dryness', label: { en: 'Extreme heat', pt: 'Calor extremo', es: 'Calor extremo', fr: 'Chaleur extrême', de: 'Extreme Hitze', zh: '极端高温' } },
  { id: 'animals_stressed', group: 'heat_dryness', label: { en: 'Animals stressed', pt: 'Animais estressados', es: 'Animales estresados', fr: 'Animaux stressés', de: 'Tiere gestresst', zh: '牲畜受热' } },
  { id: 'crops_wilting', group: 'heat_dryness', label: { en: 'Crops wilting', pt: 'Plantas murchando', es: 'Cultivos marchitándose', fr: 'Cultures flétrissent', de: 'Pflanzen welken', zh: '作物枯萎' } },
  { id: 'water_shortage', group: 'heat_dryness', label: { en: 'Water shortage', pt: 'Falta de água', es: 'Escasez de agua', fr: "Pénurie d'eau", de: 'Wassermangel', zh: '缺水' } },
  { id: 'fire_smoke_risk', group: 'heat_dryness', label: { en: 'Fire / smoke risk', pt: 'Risco de fogo / fumaça', es: 'Riesgo de fuego / humo', fr: 'Risque feu / fumée', de: 'Feuer- / Rauchgefahr', zh: '火灾 / 烟雾风险' } },
  // Cold / frost
  { id: 'frost_observed', group: 'cold_frost', label: { en: 'Frost observed', pt: 'Geada observada', es: 'Helada observada', fr: 'Gel observé', de: 'Frost beobachtet', zh: '观测到霜冻' } },
  { id: 'ice_on_road', group: 'cold_frost', label: { en: 'Ice on road', pt: 'Gelo na estrada', es: 'Hielo en la vía', fr: 'Verglas sur la route', de: 'Eis auf der Straße', zh: '路面结冰' } },
  { id: 'cold_damage', group: 'cold_frost', label: { en: 'Cold damage', pt: 'Dano por frio', es: 'Daño por frío', fr: 'Dégâts du froid', de: 'Frostschaden', zh: '冻害' } },
  { id: 'livestock_exposure', group: 'cold_frost', label: { en: 'Livestock exposure', pt: 'Gado exposto', es: 'Ganado expuesto', fr: 'Bétail exposé', de: 'Vieh ungeschützt', zh: '牲畜受冻' } },
  // Wind / storm
  { id: 'strong_wind', group: 'wind_storm', label: { en: 'Strong wind', pt: 'Vento forte', es: 'Viento fuerte', fr: 'Vent fort', de: 'Starker Wind', zh: '强风' } },
  { id: 'hail', group: 'wind_storm', label: { en: 'Hail', pt: 'Granizo', es: 'Granizo', fr: 'Grêle', de: 'Hagel', zh: '冰雹' } },
  { id: 'tree_down', group: 'wind_storm', label: { en: 'Tree / branch down', pt: 'Árvore / galho caído', es: 'Árbol / rama caída', fr: 'Arbre / branche tombé', de: 'Baum / Ast umgestürzt', zh: '树木 / 枝条倒伏' } },
  { id: 'power_outage', group: 'wind_storm', label: { en: 'Power outage', pt: 'Falta de energia', es: 'Corte de luz', fr: 'Coupure de courant', de: 'Stromausfall', zh: '停电' } },
  // Access / operations
  { id: 'road_blocked', group: 'access_ops', label: { en: 'Road blocked', pt: 'Estrada bloqueada', es: 'Camino bloqueado', fr: 'Route bloquée', de: 'Straße gesperrt', zh: '道路阻断' } },
  { id: 'muddy_road', group: 'access_ops', label: { en: 'Muddy road', pt: 'Estrada com lama', es: 'Camino con barro', fr: 'Route boueuse', de: 'Schlammige Straße', zh: '道路泥泞' } },
  { id: 'event_risk', group: 'access_ops', label: { en: 'Event at risk', pt: 'Evento em risco', es: 'Evento en riesgo', fr: 'Événement menacé', de: 'Veranstaltung gefährdet', zh: '活动受影响' } },
  { id: 'outdoor_work_unsafe', group: 'access_ops', label: { en: 'Outdoor work unsafe', pt: 'Trabalho externo arriscado', es: 'Trabajo al aire libre inseguro', fr: 'Travail extérieur risqué', de: 'Außenarbeit unsicher', zh: '户外作业不安全' } },
  { id: 'supply_delay', group: 'access_ops', label: { en: 'Supply delay', pt: 'Atraso de entrega', es: 'Retraso de suministro', fr: 'Retard de livraison', de: 'Lieferverzug', zh: '供应延误' } },
  // Recommendation / alert (advisory — advice, not a sighting)
  { id: 'avoid_route', group: 'recommendation', advisory: true, label: { en: 'Avoid this place / route', pt: 'Evite este lugar / rota', es: 'Evita este lugar / ruta', fr: 'Évitez ce lieu / itinéraire', de: 'Diesen Ort / Weg meiden', zh: '避开此地 / 路线' } },
  { id: 'prepare_irrigation', group: 'recommendation', advisory: true, label: { en: 'Prepare irrigation', pt: 'Prepare irrigação', es: 'Prepara el riego', fr: "Préparez l'irrigation", de: 'Bewässerung vorbereiten', zh: '准备灌溉' } },
  { id: 'cover_crops', group: 'recommendation', advisory: true, label: { en: 'Cover crops', pt: 'Proteja as plantas', es: 'Cubre los cultivos', fr: 'Protégez les cultures', de: 'Pflanzen abdecken', zh: '覆盖作物' } },
  { id: 'move_animals_shade', group: 'recommendation', advisory: true, label: { en: 'Move animals / shade', pt: 'Mova animais / sombra', es: 'Mueve animales / sombra', fr: "Déplacez animaux / ombre", de: 'Tiere / Schatten', zh: '转移牲畜 / 遮荫' } },
  { id: 'delay_outdoor_work', group: 'recommendation', advisory: true, label: { en: 'Delay outdoor work', pt: 'Adie trabalho externo', es: 'Aplaza trabajo exterior', fr: 'Reportez le travail extérieur', de: 'Außenarbeit verschieben', zh: '推迟户外作业' } },
  { id: 'check_neighbors', group: 'recommendation', advisory: true, label: { en: 'Check on neighbours', pt: 'Verifique os vizinhos', es: 'Revisa a los vecinos', fr: 'Vérifiez les voisins', de: 'Nach Nachbarn sehen', zh: '关照邻里' } },
];

export const SEVERITY_LABELS: Record<FieldReportSeverity, L> = {
  low: { en: 'Low', pt: 'Baixa', es: 'Baja', fr: 'Faible', de: 'Niedrig', zh: '低' },
  medium: { en: 'Medium', pt: 'Média', es: 'Media', fr: 'Moyenne', de: 'Mittel', zh: '中' },
  high: { en: 'High', pt: 'Alta', es: 'Alta', fr: 'Élevée', de: 'Hoch', zh: '高' },
};

export const EXPIRY_LABELS: Record<FieldReportExpiry, L> = {
  '1h': { en: '1 hour', pt: '1 hora', es: '1 hora', fr: '1 heure', de: '1 Stunde', zh: '1 小时' },
  '3h': { en: '3 hours', pt: '3 horas', es: '3 horas', fr: '3 heures', de: '3 Stunden', zh: '3 小时' },
  today: { en: 'Today', pt: 'Hoje', es: 'Hoy', fr: "Aujourd'hui", de: 'Heute', zh: '今天' },
  custom: { en: 'Custom', pt: 'Personalizado', es: 'Personalizado', fr: 'Personnalisé', de: 'Benutzerdef.', zh: '自定义' },
};

const SUBTYPE_BY_ID: Record<string, FieldReportSubtype> = Object.fromEntries(
  FIELD_REPORT_SUBTYPES.map((s) => [s.id, s]),
);

export function getSubtype(id: string): FieldReportSubtype | undefined {
  return SUBTYPE_BY_ID[id];
}

export function subtypesForGroup(group: FieldReportGroupId): FieldReportSubtype[] {
  return FIELD_REPORT_SUBTYPES.filter((s) => s.group === group);
}

function pick(label: L, locale: string): string {
  return label[(locale as Locale)] ?? label.en;
}

export function subtypeLabel(id: string, locale: string): string {
  const s = SUBTYPE_BY_ID[id];
  return s ? pick(s.label, locale) : id.replace(/_/g, ' ');
}

export function groupLabel(id: FieldReportGroupId, locale: string): string {
  const g = FIELD_REPORT_GROUPS.find((x) => x.id === id);
  return g ? pick(g.label, locale) : id.replace(/_/g, ' ');
}

export function severityLabel(s: FieldReportSeverity, locale: string): string {
  return pick(SEVERITY_LABELS[s], locale);
}

export function expiryLabel(e: FieldReportExpiry, locale: string): string {
  return pick(EXPIRY_LABELS[e], locale);
}

/** Expiry option → seconds from now (custom returns null — caller supplies). */
export function expiryToSeconds(e: FieldReportExpiry): number | null {
  switch (e) {
    case '1h':
      return 3600;
    case '3h':
      return 3 * 3600;
    case 'today': {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));
    }
    default:
      return null;
  }
}
