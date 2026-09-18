// kalma/frontend/lib/growth/weather-filter.ts
//
// Relevance gate: Kalma only drafts for WEATHER-RISK content. A teammate may
// forward all sorts of links; this keeps the bot from posting about anything
// that isn't a weather/climate situation. Multilingual keyword match (EN/PT/ES
// primarily) on the tweet-sidecar text or the news title+summary.
//
// Deliberately conservative-but-generous: err toward "relevant" only on a real
// weather term, but cover the vocabulary rural users actually use.

import { normalize } from './triage.ts';

// Whole-word weather-risk vocabulary across the main audience languages.
const WEATHER_TERMS: string[] = [
  // EN
  'weather', 'climate', 'rain', 'rainfall', 'storm', 'thunderstorm', 'flood',
  'flooding', 'drought', 'heat', 'heatwave', 'heat wave', 'frost', 'freeze',
  'cold snap', 'snow', 'snowfall', 'blizzard', 'hail', 'wind', 'gale', 'gust',
  'cyclone', 'hurricane', 'typhoon', 'tornado', 'temperature', 'forecast',
  'humidity', 'dry spell', 'wildfire', 'el nino', 'la nina', 'monsoon',
  'precipitation', 'downpour', 'sleet', 'wildfires',
  // PT
  'clima', 'tempo', 'chuva', 'chuvas', 'tempestade', 'temporal', 'enchente',
  'enchentes', 'inundacao', 'alagamento', 'seca', 'estiagem', 'calor', 'onda de calor',
  'geada', 'frente fria', 'friagem', 'neve', 'granizo', 'vento', 'ventania',
  'rajada', 'ciclone', 'furacao', 'tornado', 'temperatura', 'previsao',
  'umidade', 'chuvarada', 'nevoeiro', 'estiada',
  // ES
  'tiempo', 'lluvia', 'lluvias', 'tormenta', 'inundacion', 'inundaciones',
  'sequia', 'calor', 'ola de calor', 'helada', 'frente frio', 'nieve', 'granizo',
  'viento', 'rafaga', 'ciclon', 'huracan', 'temperatura', 'pronostico',
  'humedad', 'aguacero',
];

const NORMALIZED_TERMS = WEATHER_TERMS.map(normalize);

export interface RelevanceResult {
  relevant: boolean;
  /** The first term that matched (for logging / the ack message). */
  matched: string | null;
}

/**
 * Is this text about a weather-risk situation? Whole-word (accent-folded).
 * Returns the first matching term so the operator sees why it passed.
 */
export function weatherRelevance(text: string): RelevanceResult {
  const hay = normalize(text || '');
  if (!hay.trim()) return { relevant: false, matched: null };

  for (const term of NORMALIZED_TERMS) {
    const re = new RegExp(
      `(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
    );
    if (re.test(hay)) return { relevant: true, matched: term };
  }
  return { relevant: false, matched: null };
}
