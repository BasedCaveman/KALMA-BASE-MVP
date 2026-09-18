// kalma/frontend/lib/pulse/questions.ts
//
// The daily question. One question, once a day, per place, answered in one tap.
//
// Three banks, each doing a different job:
//   1. field   - confirms what the live signal claims, against the ground
//   2. activity- learns what the weather can cost this person here
//   3. impact  - learns which weather hurts them, and when
//
// Questions live in code rather than a table for the same reason the signal
// strings do: they need to exist in 6 languages, and changing what the product
// asks people should be a code review, not a row edit.
//
// Self-contained by design (no imports): this module is read by the API route,
// the browser component, and the Node-side miner. Same rule as
// lib/signal-engine/activity-profile.ts.

export type PulseBank = 'field' | 'activity' | 'impact';
export type PulseLang = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

export type PulseOption = {
  /** Stable id. For the activity bank this is an ACTIVITY_TAXONOMY group slug. */
  id: string;
  label: Record<PulseLang, string>;
};

export type PulseQuestion = {
  id: string;
  bank: PulseBank;
  prompt: Record<PulseLang, string>;
  options: PulseOption[];
  /**
   * Field-bank questions only: the signal family this question checks. The
   * place's live signal picks the question, so we never ask "did it frost?"
   * where nothing suggests frost.
   */
  family?: 'dry' | 'water' | 'rain' | 'heat' | 'cold';
};

// ── Bank 1: field confirmation ──────────────────────────────────────────────
// Deliberately about yesterday, not today: a person can answer "did it rain
// here yesterday" with certainty, while "is it raining" is already on the map.

const FIELD: PulseQuestion[] = [
  {
    id: 'field_rain_yesterday',
    bank: 'field',
    family: 'rain',
    prompt: {
      en: 'Did it rain where you are yesterday?',
      pt: 'Choveu aí ontem?',
      es: '¿Llovió ahí ayer?',
      fr: 'Est-ce qu\'il a plu chez toi hier ?',
      de: 'Hat es bei dir gestern geregnet?',
      zh: '你那边昨天下雨了吗？',
    },
    options: [
      { id: 'none', label: { en: 'No', pt: 'Não', es: 'No', fr: 'Non', de: 'Nein', zh: '没有' } },
      { id: 'light', label: { en: 'Light', pt: 'Fraca', es: 'Ligera', fr: 'Faible', de: 'Leicht', zh: '小雨' } },
      { id: 'heavy', label: { en: 'Heavy', pt: 'Forte', es: 'Fuerte', fr: 'Forte', de: 'Stark', zh: '大雨' } },
    ],
  },
  {
    id: 'field_dry_ground',
    bank: 'field',
    family: 'dry',
    prompt: {
      en: 'How is the ground holding up where you are?',
      pt: 'Como está o solo aí?',
      es: '¿Cómo está el suelo en tu zona?',
      fr: 'Comment tient le sol chez toi ?',
      de: 'Wie hält der Boden bei dir?',
      zh: '你那边的土壤情况如何？',
    },
    options: [
      { id: 'fine', label: { en: 'Still fine', pt: 'Ainda bom', es: 'Aún bien', fr: 'Encore bon', de: 'Noch gut', zh: '还好' } },
      { id: 'drying', label: { en: 'Drying out', pt: 'Secando', es: 'Secándose', fr: 'Se dessèche', de: 'Trocknet aus', zh: '正在变干' } },
      { id: 'cracking', label: { en: 'Cracking', pt: 'Rachando', es: 'Agrietándose', fr: 'Se craquelle', de: 'Reißt auf', zh: '开裂了' } },
    ],
  },
  {
    id: 'field_frost_reached',
    bank: 'field',
    family: 'cold',
    prompt: {
      en: 'Did the cold reach your area this morning?',
      pt: 'O frio chegou na sua área esta manhã?',
      es: '¿Llegó el frío a tu zona esta mañana?',
      fr: 'Le froid a-t-il atteint ta zone ce matin ?',
      de: 'Hat die Kälte deine Gegend heute Morgen erreicht?',
      zh: '今早的低温到你那边了吗？',
    },
    options: [
      { id: 'no', label: { en: 'No', pt: 'Não', es: 'No', fr: 'Non', de: 'Nein', zh: '没有' } },
      { id: 'lowlands', label: { en: 'Only the low ground', pt: 'Só nas baixadas', es: 'Solo en las bajas', fr: 'Seulement les bas-fonds', de: 'Nur die Senken', zh: '只有低洼处' } },
      { id: 'yes', label: { en: 'Yes, everywhere', pt: 'Sim, em tudo', es: 'Sí, en todo', fr: 'Oui, partout', de: 'Ja, überall', zh: '是，到处都是' } },
    ],
  },
  {
    id: 'field_heat_work',
    bank: 'field',
    family: 'heat',
    prompt: {
      en: "Did yesterday's heat affect how your work went?",
      pt: 'O calor de ontem afetou o desempenho do seu trabalho?',
      es: '¿El calor cambió tu trabajo ayer?',
      fr: 'La chaleur a-t-elle changé ton travail hier ?',
      de: 'Hat die Hitze deine Arbeit gestern verändert?',
      zh: '昨天的高温改变了你的工作吗？',
    },
    options: [
      { id: 'no', label: { en: 'No', pt: 'Não', es: 'No', fr: 'Non', de: 'Nein', zh: '没有' } },
      { id: 'shifted', label: { en: 'Shifted the hours', pt: 'Mudei o horário', es: 'Cambié el horario', fr: 'Décalé les heures', de: 'Zeiten verschoben', zh: '调整了时间' } },
      { id: 'stopped', label: { en: 'Had to stop', pt: 'Tive que parar', es: 'Tuve que parar', fr: 'J\'ai dû arrêter', de: 'Musste aufhören', zh: '不得不停工' } },
    ],
  },
  {
    id: 'field_water_back',
    bank: 'field',
    family: 'water',
    prompt: {
      en: 'Is the water coming back where you are?',
      pt: 'O nível da água está normalizando aí?',
      es: '¿Se está normalizando el nivel del agua ahí?',
      fr: 'Est-ce que l\'eau revient chez toi ?',
      de: 'Kommt das Wasser bei dir zurück?',
      zh: '你那边的水在恢复吗？',
    },
    options: [
      { id: 'no', label: { en: 'Not yet', pt: 'Ainda não', es: 'Todavía no', fr: 'Pas encore', de: 'Noch nicht', zh: '还没有' } },
      { id: 'some', label: { en: 'A little', pt: 'Um pouco', es: 'Un poco', fr: 'Un peu', de: 'Ein wenig', zh: '有一点' } },
      { id: 'yes', label: { en: 'Yes, clearly', pt: 'Sim, bastante', es: 'Sí, bastante', fr: 'Oui, nettement', de: 'Ja, deutlich', zh: '是，很明显' } },
    ],
  },
];

// ── Bank 3: impact ──────────────────────────────────────────────────────────
// Which weather hurts, in the reader's own month. Stored as pulse answers only.
// Note this bank does NOT feed place_community_activity: "frost hurts me" is an
// impact, not an activity, and the taxonomy that table speaks is activities.

const IMPACT: PulseQuestion = {
  id: 'impact_worst_weather',
  bank: 'impact',
  prompt: {
    en: 'Which weather sets you back the most right now?',
    pt: 'Qual clima mais prejudica você aqui?',
    es: '¿Qué clima te perjudica más ahora?',
    fr: 'Quelle météo te pénalise le plus en ce moment ?',
    de: 'Welches Wetter setzt dir gerade am meisten zu?',
    zh: '现在哪种天气对你影响最大？',
  },
  options: [
    { id: 'frost', label: { en: 'Frost', pt: 'Geada', es: 'Helada', fr: 'Gel', de: 'Frost', zh: '霜冻' } },
    { id: 'drought', label: { en: 'Dry spell', pt: 'Estiagem', es: 'Sequía', fr: 'Sécheresse', de: 'Trockenheit', zh: '干旱' } },
    { id: 'heavy_rain', label: { en: 'Heavy rain', pt: 'Chuva forte', es: 'Lluvia fuerte', fr: 'Fortes pluies', de: 'Starkregen', zh: '强降雨' } },
    { id: 'heat', label: { en: 'Heat', pt: 'Calor', es: 'Calor', fr: 'Chaleur', de: 'Hitze', zh: '高温' } },
    { id: 'wind', label: { en: 'Wind', pt: 'Vento', es: 'Viento', fr: 'Vent', de: 'Wind', zh: '大风' } },
    { id: 'hail', label: { en: 'Hail', pt: 'Granizo', es: 'Granizo', fr: 'Grêle', de: 'Hagel', zh: '冰雹' } },
  ],
};

// ── Bank 2: activity ────────────────────────────────────────────────────────
// The only bank whose options are place-specific, because the options ARE
// ACTIVITY_TAXONOMY group slugs and the place's verified profile already says
// which ones are plausible here. Asking a Lavras reader about ski tourism would
// be noise; asking about coffee is the whole point.

const ACTIVITY_PROMPT: Record<PulseLang, string> = {
  en: 'What do you have here that a turn in the weather can damage?',
  pt: 'O que você tem aqui que uma virada no tempo pode prejudicar?',
  es: '¿Qué tienes aquí que un cambio de clima puede dañar?',
  fr: "Qu'est-ce que tu as ici qu'un coup de temps peut abîmer ?",
  de: 'Was hast du hier, das ein Wetterumschwung beschädigen kann?',
  zh: '你在这里有什么是天气突变可能损害的？',
};

/** Localised labels for the taxonomy groups this bank can offer. */
export const ACTIVITY_LABELS: Record<string, Record<PulseLang, string>> = {
  coffee_growers: { en: 'Coffee', pt: 'Café', es: 'Café', fr: 'Café', de: 'Kaffee', zh: '咖啡' },
  grain_farmers: { en: 'Grain', pt: 'Grãos', es: 'Granos', fr: 'Céréales', de: 'Getreide', zh: '谷物' },
  soy_farmers: { en: 'Soy', pt: 'Soja', es: 'Soja', fr: 'Soja', de: 'Soja', zh: '大豆' },
  bean_farmers: { en: 'Beans', pt: 'Feijão', es: 'Frijol', fr: 'Haricots', de: 'Bohnen', zh: '豆类' },
  rice_farmers: { en: 'Rice', pt: 'Arroz', es: 'Arroz', fr: 'Riz', de: 'Reis', zh: '水稻' },
  sugarcane_growers: { en: 'Sugarcane', pt: 'Cana', es: 'Caña', fr: 'Canne à sucre', de: 'Zuckerrohr', zh: '甘蔗' },
  cotton_growers: { en: 'Cotton', pt: 'Algodão', es: 'Algodón', fr: 'Coton', de: 'Baumwolle', zh: '棉花' },
  tea_growers: { en: 'Tea', pt: 'Chá', es: 'Té', fr: 'Thé', de: 'Tee', zh: '茶' },
  cocoa_growers: { en: 'Cocoa', pt: 'Cacau', es: 'Cacao', fr: 'Cacao', de: 'Kakao', zh: '可可' },
  grape_growers: { en: 'Grapes', pt: 'Uva', es: 'Uva', fr: 'Vigne', de: 'Trauben', zh: '葡萄' },
  orchards: { en: 'Orchards', pt: 'Pomar', es: 'Huerta', fr: 'Vergers', de: 'Obstbau', zh: '果园' },
  horticulture: { en: 'Vegetables or garden', pt: 'Horta ou jardim', es: 'Huerta o jardín', fr: 'Potager ou jardin', de: 'Garten oder Gemüse', zh: '菜园或花园' },
  livestock: { en: 'Livestock', pt: 'Gado', es: 'Ganado', fr: 'Élevage', de: 'Vieh', zh: '牲畜' },
  fishing: { en: 'Fishing', pt: 'Pesca', es: 'Pesca', fr: 'Pêche', de: 'Fischerei', zh: '渔业' },
  street_vendors: { en: 'Street trade', pt: 'Comércio na rua', es: 'Comercio en la calle', fr: 'Commerce de rue', de: 'Straßenhandel', zh: '街头生意' },
  ski_tourism: { en: 'Snow season', pt: 'Temporada de neve', es: 'Temporada de nieve', fr: 'Saison de neige', de: 'Skisaison', zh: '雪季' },
  construction: { en: 'Building work', pt: 'Obra', es: 'Obra', fr: 'Chantier', de: 'Baustelle', zh: '工地' },
  lodging: { en: 'Guests or lodging', pt: 'Hospedagem', es: 'Hospedaje', fr: 'Hébergement', de: 'Beherbergung', zh: '住宿' },
  local_commerce: { en: 'My shop or sales', pt: 'Meu negócio ou vendas', es: 'Mi negocio o ventas', fr: 'Mon commerce ou mes ventes', de: 'Mein Geschäft oder Verkauf', zh: '我的店铺或销售' },
  road_transport: { en: 'Roads or deliveries', pt: 'Estrada ou entregas', es: 'Carretera o entregas', fr: 'Route ou livraisons', de: 'Straße oder Lieferungen', zh: '道路或配送' },
};

// Exposed to weather everywhere, so offered at every place rather than waiting
// for an encyclopedia to mention them. This is what stops a reader in a city
// being asked only about coffee, soy and cattle: Curitiba's verified profile is
// [coffee, grain, soy, horticulture, livestock], sourced from a Wikipedia
// article that describes the STATE's agriculture and the city's coffee-trade
// history. Technically sourced, useless to someone living in a 1.9M city.
const UNIVERSAL_GROUPS = ['local_commerce', 'horticulture', 'construction', 'road_transport', 'lodging'];

/** Offered when the place has no verified profile, or as the tail of one. */
// No longer needed as a fallback: the universal groups cover a place with no
// verified profile, and a garden is a better guess for an unknown place than
// cattle.

const OTHER_LABEL: Record<PulseLang, string> = {
  en: 'Something else', pt: 'Outra coisa', es: 'Otra cosa', fr: 'Autre chose', de: 'Etwas anderes', zh: '其他',
};
const NONE_LABEL: Record<PulseLang, string> = {
  en: 'Nothing here', pt: 'Nada aqui', es: 'Nada aquí', fr: 'Rien ici', de: 'Nichts hier', zh: '没有' ,
};

/**
 * Build the activity question for one place. `groups` are the place's verified
 * activity groups; unknown slugs are dropped rather than rendered raw.
 */
export function activityQuestion(groups: string[]): PulseQuestion {
  // Place-specific first, capped at three so the universal ones always fit.
  // Two, not more. The verified profile is evidence about the PLACE, and for a
  // metropolis that evidence is weak: Curitiba's article documents the state's
  // agriculture and the city's coffee-trade history, so three or more slots
  // filled the whole first row with crops for a reader in a 1.9M city.
  const known = groups.filter((g) => ACTIVITY_LABELS[g]).slice(0, 2);
  const local = known.length > 0 ? known : [];
  // Then the ones that are true anywhere. Deduped so a place whose profile
  // already documents, say, lodging does not show it twice.
  const chosen = [...local, ...UNIVERSAL_GROUPS.filter((g) => !local.includes(g))];
  return {
    id: 'activity_what_costs',
    bank: 'activity',
    prompt: ACTIVITY_PROMPT,
    options: [
      ...chosen.map((g) => ({ id: g, label: ACTIVITY_LABELS[g] })),
      { id: 'other', label: OTHER_LABEL },
      { id: 'none', label: NONE_LABEL },
    ],
  };
}

/** Option ids from the activity bank that are real taxonomy groups. */
export function isActivityGroup(optionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_LABELS, optionId);
}

// ── Rotation ────────────────────────────────────────────────────────────────
//
// Everyone in a place sees the SAME question on a given day. That is what makes
// the reciprocity line mean anything: "17 of 23 people here said dry spell" is
// only true if those 23 were asked the same thing. Hence a deterministic
// function of (place, day) rather than anything random or per-user.

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** UTC day string, the same key the answers table stores. */
export function pulseDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Today's question for a place.
 *
 * Bank order over a 3-day cycle: field, activity, impact. Field leads because
 * it is the one that pays the reader back immediately (it is about their own
 * ground today), and it is skipped when the place has no live signal to check,
 * in which case the cycle falls through to the next bank rather than asking
 * about weather nobody claimed.
 */
export function questionFor(opts: {
  placeSlug: string;
  day?: string;
  /** Live signal family at this place, if any. */
  family?: 'dry' | 'water' | 'rain' | 'heat' | 'cold' | null;
  /** Verified activity groups for this place. */
  groups?: string[];
}): PulseQuestion {
  const day = opts.day ?? pulseDay();
  const seed = hash(`${opts.placeSlug}:${day}`);
  const activity = activityQuestion(opts.groups ?? []);
  const fieldForFamily = opts.family
    ? FIELD.find((q) => q.family === opts.family)
    : undefined;

  // Three slots. Without a live signal there is nothing honest to confirm, so
  // that slot becomes the activity question instead of a fabricated one.
  const cycle: PulseQuestion[] = [
    fieldForFamily ?? activity,
    activity,
    IMPACT,
  ];
  return cycle[seed % cycle.length];
}

export function promptText(q: PulseQuestion, lang: string): string {
  const l = (lang in q.prompt ? lang : 'en') as PulseLang;
  return q.prompt[l];
}

export function optionText(o: PulseOption, lang: string): string {
  const l = (lang in o.label ? lang : 'en') as PulseLang;
  return o.label[l];
}

/** Every question id the API will accept, for validation. */
export function isKnownQuestionId(id: string): boolean {
  return id === IMPACT.id || id === 'activity_what_costs' || FIELD.some((q) => q.id === id);
}

export function questionById(id: string, groups: string[] = []): PulseQuestion | null {
  if (id === IMPACT.id) return IMPACT;
  if (id === 'activity_what_costs') return activityQuestion(groups);
  return FIELD.find((q) => q.id === id) ?? null;
}
