export const ACTIVITY_TAXONOMY = [
  {
    id: 'all',
    labels: {
      en: 'All',
      pt: 'Todos',
      es: 'Todos',
      fr: 'Tout',
      de: 'Alle',
      zh: '全部',
    },
  },
  {
    id: 'my_work',
    labels: {
      en: 'My work',
      pt: 'Meu trabalho',
      es: 'Mi trabajo',
      fr: 'Mon travail',
      de: 'Meine Arbeit',
      zh: '我的工作',
    },
  },
  {
    id: 'destination',
    labels: {
      en: 'My destination',
      pt: 'Meu destino',
      es: 'Mi destino',
      fr: 'Ma destination',
      de: 'Mein Ziel',
      zh: '我的目的地',
    },
  },
  {
    id: 'hospitality',
    labels: {
      en: 'Hosting',
      pt: 'Hospedagem',
      es: 'Hospedaje',
      fr: 'Hébergement',
      de: 'Unterkunft',
      zh: '住宿接待',
    },
  },
  {
    id: 'roads',
    labels: {
      en: 'Roads',
      pt: 'Estradas',
      es: 'Caminos',
      fr: 'Routes',
      de: 'Straßen',
      zh: '道路',
    },
  },
  {
    id: 'crops',
    labels: {
      en: 'Crops',
      pt: 'Cultivos',
      es: 'Cultivos',
      fr: 'Cultures',
      de: 'Kulturen',
      zh: '作物',
    },
  },
  {
    id: 'livestock',
    labels: {
      en: 'Livestock',
      pt: 'Pecuária',
      es: 'Ganado',
      fr: 'Élevage',
      de: 'Vieh',
      zh: '畜牧',
    },
  },
  {
    id: 'logistics',
    labels: {
      en: 'Logistics',
      pt: 'Logística',
      es: 'Logística',
      fr: 'Logistique',
      de: 'Logistik',
      zh: '物流',
    },
  },
  {
    id: 'construction',
    labels: {
      en: 'Construction',
      pt: 'Obras',
      es: 'Obras',
      fr: 'Chantiers',
      de: 'Baustellen',
      zh: '施工',
    },
  },
  {
    id: 'heat',
    labels: {
      en: 'Heat',
      pt: 'Calor',
      es: 'Calor',
      fr: 'Chaleur',
      de: 'Hitze',
      zh: '高温',
    },
  },
  {
    id: 'rain',
    labels: {
      en: 'Rain',
      pt: 'Chuva',
      es: 'Lluvia',
      fr: 'Pluie',
      de: 'Regen',
      zh: '降雨',
    },
  },
  {
    id: 'water',
    labels: {
      en: 'Water',
      pt: 'Água',
      es: 'Agua',
      fr: 'Eau',
      de: 'Wasser',
      zh: '水',
    },
  },
  {
    id: 'events',
    labels: {
      en: 'Events',
      pt: 'Eventos',
      es: 'Eventos',
      fr: 'Événements',
      de: 'Ereignisse',
      zh: '活动',
    },
  },
  {
    id: 'home',
    labels: {
      en: 'Home',
      pt: 'Casa',
      es: 'Casa',
      fr: 'Maison',
      de: 'Zuhause',
      zh: '家庭',
    },
  },
] as const;

export type ActivityTaxonomyItem = (typeof ACTIVITY_TAXONOMY)[number];
export type ActivityTaxonomyId = ActivityTaxonomyItem['id'];

export const TODAY_FEATURED_ACTIVITY_IDS: ActivityTaxonomyId[] = [
  'all',
  'my_work',
  'destination',
  'hospitality',
  'roads',
  'crops',
  'rain',
];

export function getActivityLabel(
  activityId: ActivityTaxonomyId,
  language: string,
) {
  const item = ACTIVITY_TAXONOMY.find((entry) => entry.id === activityId);
  if (!item) return activityId;
  return item.labels[language as keyof typeof item.labels] ?? item.labels.en;
}

export const RISK_TAXONOMY = [
  {
    id: 'all',
    labels: {
      en: 'All risks',
      pt: 'Todos os riscos',
      es: 'Todos los riesgos',
      fr: 'Tous les risques',
      de: 'Alle Risiken',
      zh: '全部风险',
    },
  },
  {
    id: 'rain',
    labels: {
      en: 'Rain',
      pt: 'Chuva',
      es: 'Lluvia',
      fr: 'Pluie',
      de: 'Regen',
      zh: '降雨',
    },
  },
  {
    id: 'heat',
    labels: {
      en: 'Heat',
      pt: 'Calor',
      es: 'Calor',
      fr: 'Chaleur',
      de: 'Hitze',
      zh: '高温',
    },
  },
  {
    id: 'cold',
    labels: {
      en: 'Cold',
      pt: 'Frio',
      es: 'Frío',
      fr: 'Froid',
      de: 'Kälte',
      zh: '寒冷',
    },
  },
  {
    id: 'dry',
    labels: {
      en: 'Dry',
      pt: 'Seca',
      es: 'Seco',
      fr: 'Sec',
      de: 'Trockenheit',
      zh: '干旱',
    },
  },
  {
    id: 'snow',
    labels: {
      en: 'Snow',
      pt: 'Neve',
      es: 'Nieve',
      fr: 'Neige',
      de: 'Schnee',
      zh: '降雪',
    },
  },
] as const;

export type RiskTaxonomyItem = (typeof RISK_TAXONOMY)[number];
export type RiskTaxonomyId = RiskTaxonomyItem['id'];

export const TODAY_FEATURED_RISK_IDS: RiskTaxonomyId[] = [
  'all',
  'rain',
  'heat',
  'cold',
  'dry',
  'snow',
];

export function getRiskLabel(
  riskId: RiskTaxonomyId,
  language: string,
) {
  const item = RISK_TAXONOMY.find((entry) => entry.id === riskId);
  if (!item) return riskId;
  return item.labels[language as keyof typeof item.labels] ?? item.labels.en;
}
