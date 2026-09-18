//kalma/frontend/lib/weather/wind-scale.ts
//
// Impact-anchored wind/gust scale. A raw "82 km/h" means nothing to most
// people — this maps gust speed to what it actually does on the ground
// (branches snap, roofs lose tiles, trees come down), with a color ramp
// from calm blue/green to destructive red.
//
// Thresholds are anchored on the Beaufort scale's damage descriptions:
//   <20   B0–3   leaves rustle
//   20–39 B4–5   dust lifts, small branches sway
//   40–59 B6–7   umbrellas turn, walking harder
//   60–89 B8–9   twigs/branches break, loose tiles shift
//   90–119 B10–11 trees down, roof damage
//   120+  B12    widespread damage
//
// Shared by the weather-layers panel and the shareable place card. Kept
// import-free (like activity-profile.ts) so it works in client components,
// server routes, and satori OG renders alike.

export type WindLocale = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

export type WindBand = {
  id: 'calm' | 'breeze' | 'wind' | 'strong_gusts' | 'damaging_gusts' | 'destructive_gusts';
  /** km/h, inclusive lower bound */
  min: number;
  /** km/h, exclusive upper bound; null = open-ended */
  max: number | null;
  color: string;
  label: Record<WindLocale, string>;
  impact: Record<WindLocale, string>;
};

export const WIND_BANDS: WindBand[] = [
  {
    id: 'calm',
    min: 0,
    max: 20,
    color: '#7EB4E6',
    label: {
      en: 'Calm to light breeze',
      pt: 'Calmo a brisa leve',
      es: 'Calma a brisa ligera',
      fr: 'Calme à brise légère',
      de: 'Ruhig bis leichte Brise',
      zh: '平静至微风',
    },
    impact: {
      en: 'Leaves rustle — nothing to secure.',
      pt: 'Folhas balançam — nada para prender.',
      es: 'Las hojas se mueven — nada que asegurar.',
      fr: 'Les feuilles bougent — rien à fixer.',
      de: 'Blätter rascheln — nichts zu sichern.',
      zh: '树叶轻响——无需防范。',
    },
  },
  {
    id: 'breeze',
    min: 20,
    max: 40,
    color: '#5AAF72',
    label: {
      en: 'Steady breeze',
      pt: 'Brisa constante',
      es: 'Brisa constante',
      fr: 'Brise soutenue',
      de: 'Stetige Brise',
      zh: '持续的风',
    },
    impact: {
      en: 'Dust lifts, thin branches sway.',
      pt: 'Levanta poeira, galhos finos balançam.',
      es: 'Levanta polvo, ramas finas se mecen.',
      fr: 'La poussière se soulève, les fines branches oscillent.',
      de: 'Staub wirbelt auf, dünne Zweige schwanken.',
      zh: '扬尘，细枝摇摆。',
    },
  },
  {
    id: 'wind',
    min: 40,
    max: 60,
    color: '#C8A84A',
    label: {
      en: 'Strong wind',
      pt: 'Vento forte',
      es: 'Viento fuerte',
      fr: 'Vent fort',
      de: 'Starker Wind',
      zh: '强风',
    },
    impact: {
      en: 'Umbrellas turn inside out; walking gets harder.',
      pt: 'Guarda-chuva vira; andar fica difícil.',
      es: 'Los paraguas se voltean; caminar cuesta.',
      fr: 'Les parapluies se retournent ; marcher devient difficile.',
      de: 'Schirme klappen um; Gehen wird schwer.',
      zh: '雨伞翻面，行走吃力。',
    },
  },
  {
    id: 'strong_gusts',
    min: 60,
    max: 90,
    color: '#D8834B',
    label: {
      en: 'Strong gusts',
      pt: 'Rajadas fortes',
      es: 'Ráfagas fuertes',
      fr: 'Fortes rafales',
      de: 'Starke Böen',
      zh: '强阵风',
    },
    impact: {
      en: 'Branches snap; loose tiles and signs shift.',
      pt: 'Galhos quebram; telhas soltas e placas se movem.',
      es: 'Se quiebran ramas; tejas sueltas y letreros se mueven.',
      fr: 'Des branches cassent ; tuiles et panneaux mal fixés bougent.',
      de: 'Äste brechen; lose Ziegel und Schilder verrutschen.',
      zh: '树枝折断，松动的瓦片和招牌移位。',
    },
  },
  {
    id: 'damaging_gusts',
    min: 90,
    max: 120,
    color: '#C86B52',
    label: {
      en: 'Damaging gusts',
      pt: 'Rajadas destrutivas',
      es: 'Ráfagas dañinas',
      fr: 'Rafales destructrices',
      de: 'Schadensträchtige Böen',
      zh: '破坏性阵风',
    },
    impact: {
      en: 'Trees come down; roofs can lose tiles.',
      pt: 'Árvores caem; casas podem destelhar.',
      es: 'Caen árboles; los techos pueden perder tejas.',
      fr: 'Des arbres tombent ; des toits peuvent se découvrir.',
      de: 'Bäume stürzen um; Dächer können abgedeckt werden.',
      zh: '树木倒伏，屋顶可能掀瓦。',
    },
  },
  {
    id: 'destructive_gusts',
    min: 120,
    max: null,
    color: '#A8452E',
    label: {
      en: 'Widespread damage',
      pt: 'Destruição ampla',
      es: 'Daños generalizados',
      fr: 'Dégâts généralisés',
      de: 'Verbreitete Schäden',
      zh: '大范围破坏',
    },
    impact: {
      en: 'Trees uprooted; light structures can fail.',
      pt: 'Árvores arrancadas; estruturas leves podem cair.',
      es: 'Árboles arrancados; estructuras ligeras pueden caer.',
      fr: 'Arbres déracinés ; structures légères menacées.',
      de: 'Bäume entwurzelt; leichte Bauten können versagen.',
      zh: '树木连根拔起，轻型建筑可能受损。',
    },
  },
];

export function windBandFor(gustKmh: number | null | undefined): WindBand {
  const v = Number(gustKmh);
  if (!Number.isFinite(v) || v < 0) return WIND_BANDS[0];
  return (
    WIND_BANDS.find((b) => v >= b.min && (b.max === null || v < b.max)) ??
    WIND_BANDS[WIND_BANDS.length - 1]
  );
}

/** Position of a gust value along the full scale, 0–100%, for markers.
 *  The scale renders 0–140 km/h; anything beyond pins to the right edge. */
export function windScalePct(gustKmh: number | null | undefined): number {
  const v = Number(gustKmh);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(100, (v / 140) * 100);
}

export function normalizeWindLocale(lang: string | null | undefined): WindLocale {
  return (['en', 'pt', 'es', 'fr', 'de', 'zh'] as const).includes(lang as WindLocale)
    ? (lang as WindLocale)
    : 'en';
}
