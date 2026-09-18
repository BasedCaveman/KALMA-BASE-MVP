// kalma/frontend/lib/signal-engine/consequence.ts
//
// WHAT THE CLAIM MEANS ON THE GROUND.
//
// claim.ts produces the half a machine can check: "at least 14 consecutive
// days with 1mm or less". That sentence is the record, and it is useless to a
// person until it is said in terms of what they actually do.
//
// This is the same move the wind scale already makes (lib/weather/wind-scale.ts):
// "36 km/h" means nothing, "dust lifts, thin branches sway" means something.
// The register is copied deliberately: OBSERVABLE EFFECT, NOT ADVICE. We say
// what a person would see happening, not what they should do about it. Kalma
// does not know their farm, their cash position or their calendar, and a
// product that tells a grower to irrigate has taken on a liability it cannot
// carry. Description earns trust; instruction spends it.
//
// Keyed by signal type, then by activity family. The families collapse the 16
// ACTIVITY_TAXONOMY groups down to the handful whose exposure genuinely
// differs; everything else reads the default, which is written to be true for
// anyone standing outside.
//
// Self-contained (zero imports), same rule as activity-profile.ts and claim.ts.

export type ConsequenceLocale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

export type ActivityFamily = 'crops' | 'livestock' | 'fishing' | 'outdoor_trade' | 'default';

/** ACTIVITY_TAXONOMY slug to the family whose exposure it shares. */
const FAMILY_OF: Record<string, ActivityFamily> = {
  coffee_growers: 'crops',
  grain_farmers: 'crops',
  soy_farmers: 'crops',
  bean_farmers: 'crops',
  rice_farmers: 'crops',
  sugarcane_growers: 'crops',
  cotton_growers: 'crops',
  tea_growers: 'crops',
  cocoa_growers: 'crops',
  grape_growers: 'crops',
  orchards: 'crops',
  horticulture: 'crops',
  livestock: 'livestock',
  fishing: 'fishing',
  street_vendors: 'outdoor_trade',
  local_commerce: 'outdoor_trade',
};

export function familyFor(groups: string[] | null | undefined): ActivityFamily {
  for (const g of groups ?? []) {
    const f = FAMILY_OF[g];
    if (f) return f;
  }
  return 'default';
}

type Line = Record<ConsequenceLocale, string>;
type ByFamily = Partial<Record<ActivityFamily, Line>> & { default: Line };

const CONSEQUENCES: Record<string, ByFamily> = {
  dry_stretch_window: {
    default: {
      en: 'Ground hardens from the top down. Dust on tracks before anything looks dry.',
      pt: 'O solo endurece de cima para baixo. Poeira nas estradas antes de qualquer coisa parecer seca.',
      es: 'El suelo se endurece desde arriba. Polvo en los caminos antes de que algo parezca seco.',
      fr: 'Le sol durcit par le haut. Poussière sur les chemins avant que rien ne paraisse sec.',
      de: 'Der Boden härtet von oben aus. Staub auf den Wegen, bevor etwas trocken aussieht.',
      zh: '土壤自上而下变硬。在任何东西看起来干燥之前，道路先起尘。',
    },
    crops: {
      en: 'Flowering and fruit set are the exposed windows. Leaves curl at midday first.',
      pt: 'Florada e pegamento são as janelas expostas. As folhas enrolam primeiro no meio do dia.',
      es: 'Floración y cuajado son las ventanas expuestas. Las hojas se enrollan primero al mediodía.',
      fr: 'Floraison et nouaison sont les fenêtres exposées. Les feuilles s\'enroulent d\'abord à midi.',
      de: 'Blüte und Fruchtansatz sind die kritischen Fenster. Blätter rollen sich zuerst mittags ein.',
      zh: '开花和坐果是暴露期。叶片先在正午卷曲。',
    },
    livestock: {
      en: 'Pasture stops growing well before it looks brown. Water points draw down.',
      pt: 'O pasto para de crescer bem antes de ficar marrom. As aguadas baixam.',
      es: 'El pasto deja de crecer mucho antes de verse marrón. Las aguadas bajan.',
      fr: 'La pâture cesse de pousser bien avant de brunir. Les points d\'eau baissent.',
      de: 'Die Weide wächst nicht mehr, lange bevor sie braun wird. Tränken sinken.',
      zh: '牧草在变黄之前就已停止生长。水点水位下降。',
    },
  },
  frost_risk: {
    default: {
      en: 'Low ground and valley floors freeze first, often while slopes stay clear.',
      pt: 'Baixadas e fundos de vale congelam primeiro, muitas vezes com as encostas limpas.',
      es: 'Las bajas y los fondos de valle se hielan primero, a menudo con las laderas limpias.',
      fr: 'Les bas-fonds gèlent en premier, souvent alors que les pentes restent indemnes.',
      de: 'Senken und Talböden frieren zuerst, oft während Hänge frei bleiben.',
      zh: '低洼地和谷底最先结霜，坡地常常无恙。',
    },
    crops: {
      en: 'New growth and open flowers burn on the first night, not the coldest.',
      pt: 'Brotação nova e flores abertas queimam já na primeira noite, não na mais fria.',
      es: 'Los brotes nuevos y las flores abiertas se queman la primera noche, no la más fría.',
      fr: 'Les jeunes pousses et les fleurs ouvertes brûlent dès la première nuit, pas la plus froide.',
      de: 'Neuer Austrieb und offene Blüten verbrennen in der ersten Nacht, nicht der kältesten.',
      zh: '新梢和开放的花在第一个霜夜就受害，而非最冷的那夜。',
    },
  },
  consecutive_cold_below: {
    default: {
      en: 'Cold accumulates night after night. The damage is the run, not any one night.',
      pt: 'O frio se acumula noite após noite. O dano é a sequência, não uma noite isolada.',
      es: 'El frío se acumula noche tras noche. El daño es la racha, no una sola noche.',
      fr: 'Le froid s\'accumule nuit après nuit. Le dommage vient de la série, pas d\'une nuit.',
      de: 'Kälte summiert sich Nacht für Nacht. Der Schaden ist die Serie, nicht eine Nacht.',
      zh: '寒冷逐夜累积。造成损害的是连续期，而非某一夜。',
    },
    livestock: {
      en: 'Young and thin animals lose condition first. Intake rises before weight drops.',
      pt: 'Animais jovens e magros perdem condição primeiro. O consumo sobe antes do peso cair.',
      es: 'Los animales jóvenes y flacos pierden condición primero. El consumo sube antes de bajar el peso.',
      fr: 'Les animaux jeunes et maigres perdent l\'état en premier. L\'ingestion monte avant que le poids baisse.',
      de: 'Junge und magere Tiere verlieren zuerst Kondition. Die Aufnahme steigt, bevor das Gewicht fällt.',
      zh: '幼畜和瘦弱个体最先掉膘。采食量先上升，体重才下降。',
    },
  },
  heavy_rain_event: {
    default: {
      en: 'Runs off before it soaks in. Low crossings and dirt access go first.',
      pt: 'Escorre antes de infiltrar. Travessias baixas e acessos de terra vão primeiro.',
      es: 'Escurre antes de infiltrar. Los vados bajos y los accesos de tierra ceden primero.',
      fr: 'Ruisselle avant de pénétrer. Les passages bas et les accès en terre lâchent en premier.',
      de: 'Läuft ab, bevor es einsickert. Tiefe Furten und Erdwege gehen zuerst.',
      zh: '先径流后下渗。低洼渡口和土路最先中断。',
    },
    crops: {
      en: 'Bare ground moves. Topsoil leaves before standing water is visible.',
      pt: 'Solo descoberto se move. A camada fértil sai antes de aparecer água empoçada.',
      es: 'El suelo desnudo se mueve. La capa fértil se va antes de verse agua estancada.',
      fr: 'Le sol nu bouge. La terre arable part avant que l\'eau ne stagne visiblement.',
      de: 'Offener Boden wandert. Der Oberboden geht, bevor Wasser sichtbar steht.',
      zh: '裸露地表流失。表土在积水出现之前就已被带走。',
    },
    outdoor_trade: {
      en: 'Foot traffic drops before the rain arrives, and returns slowly after.',
      pt: 'O movimento cai antes da chuva chegar, e volta devagar depois.',
      es: 'El movimiento cae antes de que llegue la lluvia, y vuelve despacio después.',
      fr: 'La fréquentation baisse avant l\'arrivée de la pluie et revient lentement.',
      de: 'Die Laufkundschaft bricht vor dem Regen ein und kehrt langsam zurück.',
      zh: '客流在降雨到来前就减少，之后恢复缓慢。',
    },
  },
  heat_stress_window: {
    default: {
      en: 'Afternoons become the limit. Water demand rises faster than the temperature.',
      pt: 'A tarde vira o limite. A demanda de água sobe mais rápido que a temperatura.',
      es: 'La tarde se vuelve el límite. La demanda de agua sube más rápido que la temperatura.',
      fr: 'L\'après-midi devient la limite. La demande en eau monte plus vite que la température.',
      de: 'Der Nachmittag wird zur Grenze. Der Wasserbedarf steigt schneller als die Temperatur.',
      zh: '下午成为极限。需水量上升快于气温。',
    },
    crops: {
      en: 'Pollination is the first thing to fail, quietly and before any wilting.',
      pt: 'A polinização é a primeira coisa a falhar, em silêncio e antes de qualquer murcha.',
      es: 'La polinización es lo primero que falla, en silencio y antes de cualquier marchitez.',
      fr: 'La pollinisation lâche en premier, discrètement et avant tout flétrissement.',
      de: 'Die Bestäubung versagt zuerst, unauffällig und vor jedem Welken.',
      zh: '授粉最先失败，悄无声息，早于任何萎蔫。',
    },
    livestock: {
      en: 'Grazing shifts to night. Animals crowd shade long before they stop eating.',
      pt: 'O pastejo migra para a noite. Os animais se amontoam na sombra bem antes de parar de comer.',
      es: 'El pastoreo se corre a la noche. Los animales se agolpan a la sombra mucho antes de dejar de comer.',
      fr: 'Le pâturage se décale la nuit. Les animaux se serrent à l\'ombre bien avant de cesser de manger.',
      de: 'Das Weiden verlagert sich in die Nacht. Tiere drängen sich in den Schatten, lange bevor sie fressen aufhören.',
      zh: '采食转向夜间。牲畜早在停食之前就已扎堆遮荫。',
    },
  },
  rainfall_risk_rising: {
    default: {
      en: 'More water than this place usually handles in the same stretch of days.',
      pt: 'Mais água do que este lugar costuma dar conta no mesmo intervalo de dias.',
      es: 'Más agua de la que este lugar suele manejar en el mismo intervalo de días.',
      fr: 'Plus d\'eau que ce lieu n\'en encaisse d\'habitude sur la même durée.',
      de: 'Mehr Wasser, als dieser Ort in derselben Zeitspanne gewöhnlich verkraftet.',
      zh: '水量超过这个地方在同样天数里通常能承受的程度。',
    },
  },
  water_recovery_signal: {
    default: {
      en: 'The dry gap is closing. Soil holds moisture between rains again.',
      pt: 'A falta de água está diminuindo. O solo volta a segurar umidade entre uma chuva e outra.',
      es: 'El déficit se está cerrando. El suelo vuelve a retener humedad entre lluvias.',
      fr: 'Le déficit se comble. Le sol retient de nouveau l\'humidité entre deux pluies.',
      de: 'Das Defizit schließt sich. Der Boden hält zwischen den Regen wieder Feuchtigkeit.',
      zh: '亏缺正在收窄。土壤在两次降雨之间重新保住水分。',
    },
  },
};

/**
 * The observable reading for a signal at a place, given what that place is
 * documented to do. Falls back to the default line, then to null when the
 * signal type has no reading at all.
 */
export function consequenceFor(
  signalTypeId: string,
  groups: string[] | null | undefined,
  locale: string,
): { text: string; family: ActivityFamily } | null {
  const entry = CONSEQUENCES[signalTypeId];
  if (!entry) return null;
  const l = (['en', 'pt', 'es', 'fr', 'de', 'zh'].includes(locale) ? locale : 'en') as ConsequenceLocale;
  const family = familyFor(groups);
  const line = entry[family] ?? entry.default;
  return { text: line[l], family: entry[family] ? family : 'default' };
}

/** Every signal type that carries a reading. Used by the test. */
export function coveredSignalTypes(): string[] {
  return Object.keys(CONSEQUENCES);
}
