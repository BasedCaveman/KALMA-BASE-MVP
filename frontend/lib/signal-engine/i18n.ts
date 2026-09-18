// kalma/frontend/lib/signal-engine/i18n.ts
//
// Translation strings for signal cards in all 6 supported languages.
// The bodies use {{token}} interpolation against structured_data values.
//
// Tone rules (study-locked):
//   - Headlines are unbranded weather-alert style
//   - No "Kalma observed", "we predict", "AI says"
//   - Calm infrastructure voice
//   - Concrete numeric anchoring where it helps reader judgment

export type Locale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

export const SIGNAL_STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    // ─────────────────────────────────────────────────────────────────────
    // Signal copy v2 — comparative framing.
    //
    // Replaces percentile / "95th-percentile threshold" language with
    // human comparisons people can imagine: "around double the usual",
    // "well above what this place usually sees on its rainiest days",
    // "longer than typical for this time of year".
    //
    // Numbers stay anchored. Severity is carried by the visual pill, not
    // by the prose tone — so low-severity signals don't read as
    // catastrophic. The composer wraps each signal with a SEVERITY-aware
    // intensity adverb at render time (see composer.ts intensityPhrase).
    //
    // Statistical fields (percentile, sample_size, anomaly_score) stay
    // available in structured_data for advanced surfaces but don't
    // surface in the title / body.
    // ─────────────────────────────────────────────────────────────────────
    'signals.rainfall_risk_rising.title': 'Rainfall is trending above the usual',
    'signals.rainfall_risk_rising.body':
      'Around {{forecast_48h_mm}}mm of rain may fall in the next 48 hours — above the {{baseline_median_mm}}mm typical for this period. Field access, drying, and outdoor logistics may be affected.',
    'signals.heat_stress_window.title': 'Heat is building above the usual range',
    'signals.heat_stress_window.body':
      'Daily highs may average around {{forecast_7d_max_avg_c}}°C over the next week — above the {{baseline_median_c}}°C typical for this time of year. Outdoor work, livestock, and crops in flowering can come under stress.',
    'signals.water_recovery_signal.title': 'Water conditions are improving',
    'signals.water_recovery_signal.body':
      'Around {{recent_14d_sum_mm}}mm of rain has fallen over the past 14 days — above the {{baseline_median_mm}}mm typical for this period. A healthier water balance is restoring across this area.',
    // Edge-case variant: places where the 14-day rainfall baseline is
    // genuinely zero (very arid climates). Avoid the awkward
    // "above the 0mm typical" phrasing — frame it as measurable rain
    // returning instead.
    'signals.water_recovery_signal.body.zero_baseline':
      'Around {{recent_14d_sum_mm}}mm of rain has fallen over the past 14 days — measurable moisture for an area that usually sees almost none. A healthier water balance is restoring locally.',
    'signals.consecutive_cold_below.title': 'A cold stretch is on the way',
    'signals.consecutive_cold_below.body':
      '{{observed_run_days}} days in a row could stay below {{threshold_celsius}}°C, starting {{run_start_date}}. Longer than this region usually sees at this time of year. Crops in flowering, livestock, and rooftop venues may be exposed.',
    'signals.dry_stretch_window.title': 'A dry stretch is forming',
    'signals.dry_stretch_window.body':
      '{{observed_run_days}} dry days in a row could start {{run_start_date}}. A dry day here means {{threshold_mm}}mm of rain or less; the important number is the length of the run. Crops in flowering or fruit-set windows are most exposed.',
    'signals.frost_risk.title': 'Frost is possible this week',
    'signals.frost_risk.body':
      'Lows could dip to about {{coldest_forecast_celsius}}°C on {{coldest_forecast_date}} — under the {{threshold_celsius}}°C frost line that damages buds and tender leaves. Orchards, gardens, and tender crops may face damage.',
    'signals.heavy_rain_event.title': 'A heavy rain day could hit',
    'signals.heavy_rain_event.body':
      'A single day could bring around {{wettest_forecast_mm}}mm of rain on {{wettest_forecast_date}} — above the local heavy-rain reference for this time of year (around {{baseline_p95_mm}}mm in a day). Construction, drainage, and outdoor events should review schedules.',
    'signals.heavy_rain_event.body.near_reference':
      'A single day could bring around {{wettest_forecast_mm}}mm of rain on {{wettest_forecast_date}} — close to the local heavy-rain reference for this time of year (around {{baseline_p95_mm}}mm in a day). Construction, drainage, and outdoor events should review schedules.',
    'signals.attribution.kalma_infrastructure':
      'Generated through Kalma local signal infrastructure',
    'signals.severity.extreme': 'Extreme',
    'signals.severity.high': 'High',
    'signals.severity.medium': 'Medium',
    'signals.severity.low': 'Low',
    'signals.severity.strong': 'Strong',
    'signals.severity.active': 'Active',
    'signals.severity.unknown': 'Active',

    // ── Market context (commodity futures) ──────────────────────────────
    // Shown only when a place's verified activity profile documents the
    // affected group. Source is always labeled — this is market data,
    // a different kind of truth than the weather signal above it.
    'signals.market_context.label': 'Market context',
    'signals.market_context.surge': '{{commodity}} prices up {{pct}}% this week',
    'signals.market_context.drop': '{{commodity}} prices down {{pct}}% this week',
    'signals.market_context.high_52w': '{{commodity}} prices at a 12-month high',
    'signals.market_context.low_52w': '{{commodity}} prices at a 12-month low',
    'signals.market_context.source': 'futures market',
    'signals.commodity.coffee': 'Coffee',
    'signals.commodity.soybeans': 'Soybean',
    'signals.commodity.wheat': 'Wheat',
    'signals.commodity.corn': 'Corn',
    'signals.commodity.sugar': 'Sugar',
    'signals.commodity.cotton': 'Cotton',
    'signals.commodity.cocoa': 'Cocoa',
    'signals.commodity.rice': 'Rice',
    'signals.commodity.cattle': 'Cattle',
  },

  pt: {
    // Signal copy v2 — same comparative framing as EN. No "percentil" /
    // "faixa sazonal" wording in user-facing text.
    'signals.rainfall_risk_rising.title': 'A chuva está acima do habitual',
    'signals.rainfall_risk_rising.body':
      'Cerca de {{forecast_48h_mm}}mm de chuva podem cair nas próximas 48 horas — acima dos {{baseline_median_mm}}mm normais para este período. Acesso ao campo, secagem e logística externa podem ser afetados.',
    'signals.heat_stress_window.title': 'O calor está acima do habitual',
    'signals.heat_stress_window.body':
      'As máximas diárias podem ficar em torno de {{forecast_7d_max_avg_c}}°C na próxima semana — acima dos {{baseline_median_c}}°C normais para esta época. Trabalho externo, rebanho e culturas em floração podem sofrer estresse.',
    'signals.water_recovery_signal.title': 'O balanço hídrico está melhorando',
    'signals.water_recovery_signal.body':
      'Cerca de {{recent_14d_sum_mm}}mm de chuva caíram nos últimos 14 dias — acima dos {{baseline_median_mm}}mm normais para este período. Um balanço hídrico mais saudável está se recompondo na região.',
    'signals.water_recovery_signal.body.zero_baseline':
      'Cerca de {{recent_14d_sum_mm}}mm de chuva caíram nos últimos 14 dias — uma quantidade significativa para uma região que normalmente quase não recebe chuva. O balanço hídrico está se recompondo localmente.',
    'signals.consecutive_cold_below.title': 'Vem aí um período de frio',
    'signals.consecutive_cold_below.body':
      '{{observed_run_days}} dias seguidos podem ficar abaixo de {{threshold_celsius}}°C, a partir de {{run_start_date}}. Mais longo do que esta região costuma ver nesta época. Lavouras em floração, rebanho e locais ao ar livre podem ser afetados.',
    'signals.dry_stretch_window.title': 'Forma-se um período de estiagem',
    'signals.dry_stretch_window.body':
      '{{observed_run_days}} dias secos seguidos podem começar em {{run_start_date}}. Dia seco aqui significa {{threshold_mm}}mm de chuva ou menos; o número importante é o tamanho da sequência. Culturas em floração ou frutificação são as mais expostas.',
    'signals.frost_risk.title': 'Risco de geada esta semana',
    'signals.frost_risk.body':
      'As mínimas podem cair para cerca de {{coldest_forecast_celsius}}°C em {{coldest_forecast_date}} — abaixo da linha de geada de {{threshold_celsius}}°C que danifica brotos e folhas tenras. Pomares, hortas e culturas sensíveis podem ter perdas.',
    'signals.heavy_rain_event.title': 'Pode vir um dia de chuva forte',
    'signals.heavy_rain_event.body':
      'Um único dia pode trazer cerca de {{wettest_forecast_mm}}mm de chuva em {{wettest_forecast_date}} — acima da referência local de chuva forte para esta época do ano (cerca de {{baseline_p95_mm}}mm em um dia). Construção, drenagem e eventos ao ar livre devem rever programações.',
    'signals.heavy_rain_event.body.near_reference':
      'Um único dia pode trazer cerca de {{wettest_forecast_mm}}mm de chuva em {{wettest_forecast_date}} — perto da referência local de chuva forte para esta época do ano (cerca de {{baseline_p95_mm}}mm em um dia). Construção, drenagem e eventos ao ar livre devem rever programações.',
    'signals.attribution.kalma_infrastructure':
      'Gerado pela infraestrutura local de sinais Kalma',
    'signals.severity.extreme': 'Extremo',
    'signals.severity.high': 'Alto',
    'signals.severity.medium': 'Médio',
    'signals.severity.low': 'Baixo',
    'signals.severity.strong': 'Forte',
    'signals.severity.active': 'Ativo',
    'signals.severity.unknown': 'Ativo',

    'signals.market_context.label': 'Contexto de mercado',
    'signals.market_context.surge': 'Preço do(a) {{commodity}} sobe {{pct}}% na semana',
    'signals.market_context.drop': 'Preço do(a) {{commodity}} cai {{pct}}% na semana',
    'signals.market_context.high_52w': 'Preço do(a) {{commodity}} na máxima de 12 meses',
    'signals.market_context.low_52w': 'Preço do(a) {{commodity}} na mínima de 12 meses',
    'signals.market_context.source': 'mercado futuro',
    'signals.commodity.coffee': 'café',
    'signals.commodity.soybeans': 'soja',
    'signals.commodity.wheat': 'trigo',
    'signals.commodity.corn': 'milho',
    'signals.commodity.sugar': 'açúcar',
    'signals.commodity.cotton': 'algodão',
    'signals.commodity.cocoa': 'cacau',
    'signals.commodity.rice': 'arroz',
    'signals.commodity.cattle': 'boi',
  },

  es: {
    'signals.rainfall_risk_rising.title': 'La lluvia está por encima de lo habitual',
    'signals.rainfall_risk_rising.body':
      'Podrían caer cerca de {{forecast_48h_mm}}mm de lluvia en las próximas 48h — por encima de los {{baseline_median_mm}}mm habituales para este período. Acceso al campo, secado y logística exterior pueden verse afectados.',
    'signals.heat_stress_window.title': 'Ventana de estrés térmico formándose',
    'signals.heat_stress_window.body':
      'Máximas diarias promediando {{forecast_7d_max_avg_c}}°C esperadas en los próximos 7 días, por encima del rango estacional de {{baseline_p90_c}}°C. Trabajo exterior, ganado y floración pueden sufrir estrés.',
    'signals.water_recovery_signal.title': 'Condiciones de recuperación hídrica mejorando',
    'signals.water_recovery_signal.body':
      'Lluvia reciente de {{recent_14d_sum_mm}}mm en 14 días apoya un balance hídrico positivo para esta zona, por encima de la mediana estacional de {{baseline_median_mm}}mm.',
    // Variante para zonas áridas con mediana = 0 mm
    'signals.water_recovery_signal.body.zero_baseline':
      'Cerca de {{recent_14d_sum_mm}}mm de lluvia en 14 días — humedad medible para una zona que normalmente casi no recibe lluvia. El balance hídrico local se está recomponiendo.',
    'signals.consecutive_cold_below.title': 'Ola de frío prolongada por delante',
    'signals.consecutive_cold_below.body':
      'Los próximos {{observed_run_days}} días consecutivos se prevén por debajo de {{threshold_celsius}}°C en esta zona, desde el {{run_start_date}}. Cultivos en floración, ganado y locales al aire libre pueden verse afectados.',
    'signals.dry_stretch_window.title': 'Período seco desarrollándose',
    'signals.dry_stretch_window.body':
      '{{observed_run_days}} días secos seguidos podrían empezar el {{run_start_date}}. Un día seco aquí significa {{threshold_mm}}mm de lluvia o menos; el número importante es la duración de la racha. Cultivos en floración o cuajado de fruta son los más expuestos.',
    'signals.frost_risk.title': 'Riesgo de helada esta semana',
    'signals.frost_risk.body':
      'Temperatura mínima prevista de {{coldest_forecast_celsius}}°C el {{coldest_forecast_date}}, por debajo del umbral de helada de {{threshold_celsius}}°C. Huertos, jardines y cultivos sensibles pueden sufrir daños.',
    'signals.heavy_rain_event.title': 'Evento de lluvia fuerte probable',
    'signals.heavy_rain_event.body':
      'Un solo día podría traer cerca de {{wettest_forecast_mm}}mm de lluvia el {{wettest_forecast_date}} — por encima de la referencia local de lluvia fuerte para esta época del año (alrededor de {{baseline_p95_mm}}mm en un día). Construcción, drenaje y eventos al aire libre deben revisar planificación.',
    'signals.heavy_rain_event.body.near_reference':
      'Un solo día podría traer cerca de {{wettest_forecast_mm}}mm de lluvia el {{wettest_forecast_date}} — cerca de la referencia local de lluvia fuerte para esta época del año (alrededor de {{baseline_p95_mm}}mm en un día). Construcción, drenaje y eventos al aire libre deben revisar planificación.',
    'signals.attribution.kalma_infrastructure':
      'Generado por la infraestructura local de señales Kalma',
    'signals.severity.extreme': 'Extremo',
    'signals.severity.high': 'Alto',
    'signals.severity.medium': 'Medio',
    'signals.severity.low': 'Bajo',
    'signals.severity.strong': 'Fuerte',
    'signals.severity.active': 'Activo',
    'signals.severity.unknown': 'Activo',

    'signals.market_context.label': 'Contexto de mercado',
    'signals.market_context.surge': 'El precio del {{commodity}} sube {{pct}}% esta semana',
    'signals.market_context.drop': 'El precio del {{commodity}} baja {{pct}}% esta semana',
    'signals.market_context.high_52w': 'El precio del {{commodity}} en máximo de 12 meses',
    'signals.market_context.low_52w': 'El precio del {{commodity}} en mínimo de 12 meses',
    'signals.market_context.source': 'mercado de futuros',
    'signals.commodity.coffee': 'café',
    'signals.commodity.soybeans': 'soja',
    'signals.commodity.wheat': 'trigo',
    'signals.commodity.corn': 'maíz',
    'signals.commodity.sugar': 'azúcar',
    'signals.commodity.cotton': 'algodón',
    'signals.commodity.cocoa': 'cacao',
    'signals.commodity.rice': 'arroz',
    'signals.commodity.cattle': 'ganado',
  },

  fr: {
    'signals.rainfall_risk_rising.title': 'La pluie dépasse l’habituel',
    'signals.rainfall_risk_rising.body':
      'Environ {{forecast_48h_mm}}mm de pluie pourraient tomber dans les prochaines 48h — au-dessus des {{baseline_median_mm}}mm habituels pour cette période. Accès aux champs, séchage et logistique extérieure peuvent être affectés.',
    'signals.heat_stress_window.title': 'Fenêtre de stress thermique en formation',
    'signals.heat_stress_window.body':
      'Maximales journalières en moyenne autour de {{forecast_7d_max_avg_c}}°C prévues sur 7 jours, au-dessus de la plage saisonnière de {{baseline_p90_c}}°C. Travail extérieur, élevage et floraison peuvent subir un stress.',
    'signals.water_recovery_signal.title': "Conditions de récupération hydrique en amélioration",
    'signals.water_recovery_signal.body':
      'Pluies récentes de {{recent_14d_sum_mm}}mm sur 14 jours soutiennent un bilan hydrique positif pour cette zone, au-dessus de la médiane saisonnière de {{baseline_median_mm}}mm.',
    // Variante pour zones arides avec médiane = 0 mm
    'signals.water_recovery_signal.body.zero_baseline':
      "Environ {{recent_14d_sum_mm}}mm de pluie sur 14 jours — une humidité mesurable pour une zone qui n'en reçoit presque jamais. Le bilan hydrique local se reconstitue.",
    'signals.consecutive_cold_below.title': 'Vague de froid prolongée à venir',
    'signals.consecutive_cold_below.body':
      'Les {{observed_run_days}} prochains jours consécutifs sont prévus sous {{threshold_celsius}}°C dans cette zone, à partir du {{run_start_date}}. Cultures en floraison, élevage et lieux extérieurs peuvent être exposés.',
    'signals.dry_stretch_window.title': 'Période de sécheresse en développement',
    'signals.dry_stretch_window.body':
      '{{observed_run_days}} jours secs d’affilée pourraient commencer le {{run_start_date}}. Un jour sec ici signifie {{threshold_mm}}mm de pluie ou moins; le nombre important est la longueur de la séquence. Les cultures en floraison ou en nouaison sont les plus exposées.',
    'signals.frost_risk.title': 'Risque de gel cette semaine',
    'signals.frost_risk.body':
      'Température minimale prévue à {{coldest_forecast_celsius}}°C le {{coldest_forecast_date}}, sous le seuil de gel de {{threshold_celsius}}°C. Vergers, potagers et cultures sensibles peuvent subir des dégâts.',
    'signals.heavy_rain_event.title': 'Événement de fortes pluies probable',
    'signals.heavy_rain_event.body':
      'Une seule journée pourrait apporter environ {{wettest_forecast_mm}}mm de pluie le {{wettest_forecast_date}} — au-dessus de la référence locale de fortes pluies pour cette période de l’année (environ {{baseline_p95_mm}}mm sur une journée). Construction, drainage et événements extérieurs doivent revoir leurs plannings.',
    'signals.heavy_rain_event.body.near_reference':
      'Une seule journée pourrait apporter environ {{wettest_forecast_mm}}mm de pluie le {{wettest_forecast_date}} — proche de la référence locale de fortes pluies pour cette période de l’année (environ {{baseline_p95_mm}}mm sur une journée). Construction, drainage et événements extérieurs doivent revoir leurs plannings.',
    'signals.attribution.kalma_infrastructure':
      "Généré par l'infrastructure locale de signaux Kalma",
    'signals.severity.extreme': 'Extrême',
    'signals.severity.high': 'Élevé',
    'signals.severity.medium': 'Moyen',
    'signals.severity.low': 'Faible',
    'signals.severity.strong': 'Fort',
    'signals.severity.active': 'Actif',
    'signals.severity.unknown': 'Actif',

    'signals.market_context.label': 'Contexte de marché',
    'signals.market_context.surge': 'Le prix du {{commodity}} augmente de {{pct}}% cette semaine',
    'signals.market_context.drop': 'Le prix du {{commodity}} baisse de {{pct}}% cette semaine',
    'signals.market_context.high_52w': 'Le prix du {{commodity}} au plus haut depuis 12 mois',
    'signals.market_context.low_52w': 'Le prix du {{commodity}} au plus bas depuis 12 mois',
    'signals.market_context.source': 'marché à terme',
    'signals.commodity.coffee': 'café',
    'signals.commodity.soybeans': 'soja',
    'signals.commodity.wheat': 'blé',
    'signals.commodity.corn': 'maïs',
    'signals.commodity.sugar': 'sucre',
    'signals.commodity.cotton': 'coton',
    'signals.commodity.cocoa': 'cacao',
    'signals.commodity.rice': 'riz',
    'signals.commodity.cattle': 'bétail',
  },

  de: {
    'signals.rainfall_risk_rising.title': 'Regen liegt über dem Üblichen',
    'signals.rainfall_risk_rising.body':
      'In den nächsten 48 Stunden könnten etwa {{forecast_48h_mm}}mm Regen fallen — über den {{baseline_median_mm}}mm, die für diesen Zeitraum üblich sind. Feldzugang, Trocknung und Außenlogistik können betroffen sein.',
    'signals.heat_stress_window.title': 'Hitzestressfenster bildet sich',
    'signals.heat_stress_window.body':
      'Tageshöchstwerte um durchschnittlich {{forecast_7d_max_avg_c}}°C in den nächsten 7 Tagen erwartet, über dem saisonalen Bereich von {{baseline_p90_c}}°C. Außenarbeit, Vieh und Blütezeit können unter Stress geraten.',
    'signals.water_recovery_signal.title': 'Wasserregeneration verbessert sich',
    'signals.water_recovery_signal.body':
      'Jüngster Niederschlag von {{recent_14d_sum_mm}}mm in 14 Tagen unterstützt eine positive Wasserbilanz für diese Region, über dem saisonalen Median von {{baseline_median_mm}}mm.',
    // Variante für aride Regionen mit Median = 0 mm
    'signals.water_recovery_signal.body.zero_baseline':
      'Etwa {{recent_14d_sum_mm}}mm Niederschlag in 14 Tagen — messbare Feuchtigkeit für eine Region, die normalerweise fast keinen Regen erhält. Die lokale Wasserbilanz erholt sich.',
    'signals.consecutive_cold_below.title': 'Anhaltende Kältewelle voraus',
    'signals.consecutive_cold_below.body':
      'Die nächsten {{observed_run_days}} aufeinanderfolgenden Tage werden voraussichtlich in dieser Region unter {{threshold_celsius}}°C bleiben, ab {{run_start_date}}. Kulturen in der Blüte, Vieh und Außenanlagen können betroffen sein.',
    'signals.dry_stretch_window.title': 'Trockenperiode entwickelt sich',
    'signals.dry_stretch_window.body':
      '{{observed_run_days}} trockene Tage in Folge könnten ab {{run_start_date}} beginnen. Ein trockener Tag heißt hier {{threshold_mm}}mm Regen oder weniger; wichtig ist die Länge der Serie. Kulturen in Blüte- oder Fruchtansatzphasen sind am stärksten betroffen.',
    'signals.frost_risk.title': 'Frostrisiko in dieser Woche',
    'signals.frost_risk.body':
      'Tiefsttemperatur am {{coldest_forecast_date}} voraussichtlich {{coldest_forecast_celsius}}°C, unter der {{threshold_celsius}}°C-Frostgrenze. Obstgärten, Gärten und empfindliche Kulturen können Schaden erleiden.',
    'signals.heavy_rain_event.title': 'Starkregenereignis wahrscheinlich',
    'signals.heavy_rain_event.body':
      'Ein einzelner Tag könnte am {{wettest_forecast_date}} etwa {{wettest_forecast_mm}}mm Regen bringen — über der lokalen Starkregen-Referenz für diese Jahreszeit (etwa {{baseline_p95_mm}}mm an einem Tag). Bau, Entwässerung und Außenveranstaltungen sollten die Planung überprüfen.',
    'signals.heavy_rain_event.body.near_reference':
      'Ein einzelner Tag könnte am {{wettest_forecast_date}} etwa {{wettest_forecast_mm}}mm Regen bringen — nahe der lokalen Starkregen-Referenz für diese Jahreszeit (etwa {{baseline_p95_mm}}mm an einem Tag). Bau, Entwässerung und Außenveranstaltungen sollten die Planung überprüfen.',
    'signals.attribution.kalma_infrastructure':
      'Erzeugt durch die lokale Signalinfrastruktur von Kalma',
    'signals.severity.extreme': 'Extrem',
    'signals.severity.high': 'Hoch',
    'signals.severity.medium': 'Mittel',
    'signals.severity.low': 'Niedrig',
    'signals.severity.strong': 'Stark',
    'signals.severity.active': 'Aktiv',
    'signals.severity.unknown': 'Aktiv',

    'signals.market_context.label': 'Marktkontext',
    'signals.market_context.surge': '{{commodity}}-Preis steigt diese Woche um {{pct}}%',
    'signals.market_context.drop': '{{commodity}}-Preis fällt diese Woche um {{pct}}%',
    'signals.market_context.high_52w': '{{commodity}}-Preis auf 12-Monats-Hoch',
    'signals.market_context.low_52w': '{{commodity}}-Preis auf 12-Monats-Tief',
    'signals.market_context.source': 'Terminmarkt',
    'signals.commodity.coffee': 'Kaffee',
    'signals.commodity.soybeans': 'Sojabohnen',
    'signals.commodity.wheat': 'Weizen',
    'signals.commodity.corn': 'Mais',
    'signals.commodity.sugar': 'Zucker',
    'signals.commodity.cotton': 'Baumwolle',
    'signals.commodity.cocoa': 'Kakao',
    'signals.commodity.rice': 'Reis',
    'signals.commodity.cattle': 'Rind',
  },

  zh: {
    'signals.rainfall_risk_rising.title': '降雨高于通常水平',
    'signals.rainfall_risk_rising.body':
      '未来48小时可能有约 {{forecast_48h_mm}}毫米降雨，高于这个时期通常的 {{baseline_median_mm}}毫米。田间作业、晾晒和户外物流可能受到影响。',
    'signals.heat_stress_window.title': '热应激窗口形成',
    'signals.heat_stress_window.body':
      '未来7天最高气温平均约 {{forecast_7d_max_avg_c}}°C，高于该地区季节性 {{baseline_p90_c}}°C 的范围。户外工作、牲畜和作物开花期可能面临压力。',
    'signals.water_recovery_signal.title': '水资源恢复条件改善',
    'signals.water_recovery_signal.body':
      '近14天降雨量 {{recent_14d_sum_mm}}毫米支持该地区水量平衡向好，高于季节性中位数 {{baseline_median_mm}}毫米。',
    // 干旱地区(基线 = 0 毫米)的变体文案
    'signals.water_recovery_signal.body.zero_baseline':
      '近14天约 {{recent_14d_sum_mm}}毫米降雨 — 对一个平时几乎无雨的地区而言，已是可测量的湿润。当地水量平衡正在恢复。',
    'signals.consecutive_cold_below.title': '持续寒冷天气将至',
    'signals.consecutive_cold_below.body':
      '该地区未来 {{observed_run_days}} 天连续预报气温低于 {{threshold_celsius}}°C，从 {{run_start_date}} 开始。开花期作物、牲畜及户外场所可能受影响。',
    'signals.dry_stretch_window.title': '干旱期形成中',
    'signals.dry_stretch_window.body':
      '从 {{run_start_date}} 开始，可能连续 {{observed_run_days}} 个干燥日。这里的干燥日指降雨 {{threshold_mm}}毫米或更少；关键数字是连续天数。处于开花或坐果期的作物最为暴露。',
    'signals.frost_risk.title': '本周霜冻风险',
    'signals.frost_risk.body':
      '{{coldest_forecast_date}} 预报最低气温 {{coldest_forecast_celsius}}°C，低于 {{threshold_celsius}}°C 霜冻阈值。果园、菜园和敏感作物可能遭受损害。',
    'signals.heavy_rain_event.title': '强降雨事件可能',
    'signals.heavy_rain_event.body':
      '{{wettest_forecast_date}} 单日可能有约 {{wettest_forecast_mm}}毫米降雨，高于这个时段当地强降雨参考值（单日约 {{baseline_p95_mm}}毫米）。施工、排水和户外活动应审视计划。',
    'signals.heavy_rain_event.body.near_reference':
      '{{wettest_forecast_date}} 单日可能有约 {{wettest_forecast_mm}}毫米降雨，接近这个时段当地强降雨参考值（单日约 {{baseline_p95_mm}}毫米）。施工、排水和户外活动应审视计划。',
    'signals.attribution.kalma_infrastructure':
      '由 Kalma 本地信号基础设施生成',
    'signals.severity.extreme': '极端',
    'signals.severity.high': '高',
    'signals.severity.medium': '中',
    'signals.severity.low': '低',
    'signals.severity.strong': '强',
    'signals.severity.active': '活跃',
    'signals.severity.unknown': '活跃',

    'signals.market_context.label': '市场行情',
    'signals.market_context.surge': '{{commodity}}价格本周上涨{{pct}}%',
    'signals.market_context.drop': '{{commodity}}价格本周下跌{{pct}}%',
    'signals.market_context.high_52w': '{{commodity}}价格达到12个月新高',
    'signals.market_context.low_52w': '{{commodity}}价格达到12个月新低',
    'signals.market_context.source': '期货市场',
    'signals.commodity.coffee': '咖啡',
    'signals.commodity.soybeans': '大豆',
    'signals.commodity.wheat': '小麦',
    'signals.commodity.corn': '玉米',
    'signals.commodity.sugar': '食糖',
    'signals.commodity.cotton': '棉花',
    'signals.commodity.cocoa': '可可',
    'signals.commodity.rice': '大米',
    'signals.commodity.cattle': '肉牛',
  },
};

/**
 * Localized one-line copy for a commodity market context event
 * (surge/drop/high_52w/low_52w — see lib/signal-engine/commodity-context.ts).
 * Returns null when the event doesn't carry enough data to phrase (e.g. a
 * week-change kind with no pct_7d), so callers can skip rendering cleanly.
 */
export function marketContextCopy(
  locale: Locale,
  event: {
    commodity: string;
    kind: 'surge' | 'drop' | 'high_52w' | 'low_52w';
    pct_7d: number | null;
  },
): string | null {
  const commodity = resolveSignalString(locale, `signals.commodity.${event.commodity}`);
  if (event.kind === 'surge' || event.kind === 'drop') {
    if (event.pct_7d === null) return null;
    return resolveSignalString(locale, `signals.market_context.${event.kind}`, {
      commodity,
      pct: Math.abs(event.pct_7d),
    });
  }
  return resolveSignalString(locale, `signals.market_context.${event.kind}`, { commodity });
}

/**
 * Resolve a translation key with token interpolation.
 * Tokens use {{name}} syntax. Missing tokens are left blank.
 */
export function resolveSignalString(
  locale: Locale,
  key: string,
  values: Record<string, any> = {}
): string {
  const dict = SIGNAL_STRINGS[locale] ?? SIGNAL_STRINGS.en;
  const template = dict[key] ?? SIGNAL_STRINGS.en[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = values[name];
    return v === undefined || v === null ? '' : String(v);
  });
}
