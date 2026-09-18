//kalma/frontend/lib/weather-alerts/alert-copy.ts
//
// Fully localized alert summaries built from structured fields — NOT machine
// translation of the source (Portuguese) CAP text. An automatically
// mistranslated official government warning is a real-world safety risk (a
// flipped threshold, a wrong severity word), so this module never feeds
// `description` through a translation API. Instead it extracts the numeric
// thresholds INMET's CAP generator writes in a small, consistent set of
// sentence shapes and recomposes a designed sentence per language from
// `event_key` + severity + those numbers. If a description doesn't match the
// known shape (new event type, generator format change), the summary falls
// back to just the translated event name + severity — never the raw
// untranslated source text as primary content. The original description
// stays reachable via the alert's outbound "official source" link.

export type AlertThresholds = {
  humidityPct?: [number, number];
  frostMaxC?: number;
  coldDropC?: [number, number];
  windKmh?: [number, number];
  rainMmHour?: [number, number];
  // A range ("50 e 100 mm/dia") or a single ceiling ("até 50 mm/dia") — kept
  // distinct so the sentence reads "up to 50mm/day" instead of a fake "0-50".
  rainMmDay?: [number, number] | number;
  hail?: boolean;
};

// event_key -> translated event name (mirrors lib/weather-alerts/inmet.ts
// EVENT_KEY_MAP; an unmapped key has no entry here and falls back to the
// source-language `event` string, which is an acceptable last resort for a
// proper-noun event label — never a full untranslated sentence).
const EVENT_LABELS: Record<string, Record<string, string>> = {
  heavy_rain: { en: 'Heavy rain', pt: 'Chuva intensa', es: 'Lluvia intensa', fr: 'Fortes pluies', de: 'Starkregen', zh: '强降雨' },
  storm: { en: 'Storm', pt: 'Tempestade', es: 'Tormenta', fr: 'Orage', de: 'Unwetter', zh: '风暴' },
  high_wind: { en: 'Strong wind', pt: 'Vendaval', es: 'Viento fuerte', fr: 'Vent violent', de: 'Sturmböen', zh: '大风' },
  coastal_wind: { en: 'Coastal wind', pt: 'Ventos costeiros', es: 'Viento costero', fr: 'Vent côtier', de: 'Küstenwind', zh: '沿海大风' },
  low_humidity: { en: 'Low humidity', pt: 'Baixa umidade', es: 'Humedad baja', fr: 'Faible humidité', de: 'Niedrige Luftfeuchtigkeit', zh: '低湿度' },
  frost: { en: 'Frost', pt: 'Geada', es: 'Helada', fr: 'Gel', de: 'Frost', zh: '霜冻' },
  cold_spell: { en: 'Cold spell', pt: 'Declínio de temperatura', es: 'Ola de frío', fr: 'Vague de froid', de: 'Kälteeinbruch', zh: '降温' },
  heatwave: { en: 'Heatwave', pt: 'Onda de calor', es: 'Ola de calor', fr: 'Vague de chaleur', de: 'Hitzewelle', zh: '热浪' },
};

export function eventLabel(eventKey: string, sourceEvent: string, language: string): string {
  const table = EVENT_LABELS[eventKey];
  return table?.[language] ?? table?.en ?? sourceEvent;
}

// Extraction targets the specific, consistent sentence shapes INMET's CAP
// generator produces (verified against live descriptions across all 8
// mapped event types on 2026-07-14). Each regex is anchored to the
// Portuguese boilerplate; a non-match returns an empty object, which
// buildAlertSummary treats as "no numbers available" rather than guessing.
export function extractThresholds(eventKey: string, description: string): AlertThresholds {
  const text = description.toLowerCase();

  switch (eventKey) {
    case 'low_humidity': {
      const m = text.match(/(\d+)\s*%\s*e\s*(\d+)\s*%/);
      if (!m) return {};
      const a = Number(m[1]);
      const b = Number(m[2]);
      return { humidityPct: [Math.min(a, b), Math.max(a, b)] };
    }
    case 'frost': {
      const m = text.match(/at[ée]\s*(\d+)\s*º?\s*c/);
      return m ? { frostMaxC: Number(m[1]) } : {};
    }
    case 'cold_spell': {
      const m = text.match(/entre\s*(\d+)\s*º?\s*c\s*e\s*(\d+)\s*º?\s*c/);
      if (!m) return {};
      const a = Number(m[1]);
      const b = Number(m[2]);
      return { coldDropC: [Math.min(a, b), Math.max(a, b)] };
    }
    case 'high_wind': {
      const m = text.match(/(\d+)\s*km\/h\s*e\s*(\d+)\s*km\/h/);
      if (!m) return {};
      const a = Number(m[1]);
      const b = Number(m[2]);
      return { windKmh: [Math.min(a, b), Math.max(a, b)] };
    }
    case 'heavy_rain':
    case 'storm': {
      const out: AlertThresholds = {};
      const hourly = text.match(/chuva entre\s*(\d+)\s*e\s*(\d+)\s*mm\/h/);
      if (hourly) out.rainMmHour = [Number(hourly[1]), Number(hourly[2])];

      // Two generator shapes: "ou até 50 mm/dia" (single ceiling) or
      // "ou 50 e 100 mm/dia" (range).
      const dailyRange = text.match(/ou\s*(\d+)\s*e\s*(\d+)\s*mm\/dia/);
      const dailyMax = text.match(/ou\s*at[ée]\s*(\d+)\s*mm\/dia/);
      if (dailyRange) out.rainMmDay = [Number(dailyRange[1]), Number(dailyRange[2])];
      else if (dailyMax) out.rainMmDay = Number(dailyMax[1]);

      const wind = text.match(/ventos intensos\s*\((\d+)-(\d+)\s*km\/h\)/);
      if (wind) out.windKmh = [Number(wind[1]), Number(wind[2])];

      out.hail = /granizo/.test(text);
      return out;
    }
    default:
      return {};
  }
}

function fmtRange(range: [number, number], unit: string): string {
  return range[0] === range[1] ? `${range[0]}${unit}` : `${range[0]}–${range[1]}${unit}`;
}

// rainMmDay is a range ("50 e 100 mm/dia") or a single ceiling ("até 50
// mm/dia") — this renders each shape as its own natural phrase per language,
// e.g. "up to 50 mm/day" vs "between 50-100 mm/day", never a fake "0-50".
const DAILY_PHRASE: Record<string, { upTo: (n: number) => string; between: (r: [number, number]) => string }> = {
  en: { upTo: (n) => `up to ${n} mm/day`, between: (r) => `between ${fmtRange(r, ' mm/day')}` },
  pt: { upTo: (n) => `até ${n} mm/dia`, between: (r) => `entre ${fmtRange(r, ' mm/dia')}` },
  es: { upTo: (n) => `hasta ${n} mm/día`, between: (r) => `entre ${fmtRange(r, ' mm/día')}` },
  fr: { upTo: (n) => `jusqu'à ${n} mm/jour`, between: (r) => `entre ${fmtRange(r, ' mm/jour')}` },
  de: { upTo: (n) => `bis zu ${n} mm/Tag`, between: (r) => `zwischen ${fmtRange(r, ' mm/Tag')}` },
  zh: { upTo: (n) => `每日最高 ${n} mm`, between: (r) => `每日 ${fmtRange(r, ' mm')}` },
};

function dailyPhrase(value: number | [number, number], language: string): string {
  const table = DAILY_PHRASE[language] ?? DAILY_PHRASE.en;
  return Array.isArray(value) ? table.between(value) : table.upTo(value);
}

// One template function per language: takes the translated event label
// (already resolved) plus whatever thresholds were extracted, and returns a
// single designed sentence. Every branch is plain concatenation of
// translator-owned strings and numbers — nothing here is machine-translated.
function sentenceFor(language: string, eventKey: string, t: AlertThresholds): string | null {
  const R: Record<string, (t: AlertThresholds) => string | null> = {
    en: (t) => {
      if (eventKey === 'low_humidity' && t.humidityPct) return `Relative humidity expected between ${fmtRange(t.humidityPct, '%')}.`;
      if (eventKey === 'frost' && t.frostMaxC != null) return `Minimum temperature may fall to ${t.frostMaxC}°C.`;
      if (eventKey === 'cold_spell' && t.coldDropC) return `Temperature expected to drop ${fmtRange(t.coldDropC, '°C')}.`;
      if (eventKey === 'high_wind' && t.windKmh) return `Winds expected between ${fmtRange(t.windKmh, ' km/h')}.`;
      if ((eventKey === 'heavy_rain' || eventKey === 'storm') && (t.rainMmHour || t.windKmh)) {
        const parts: string[] = [];
        if (t.rainMmHour) parts.push(`rain between ${fmtRange(t.rainMmHour, ' mm/h')}`);
        if (t.rainMmDay) parts.push(dailyPhrase(t.rainMmDay, 'en'));
        if (t.windKmh) parts.push(`winds ${fmtRange(t.windKmh, ' km/h')}`);
        if (t.hail) parts.push('hail possible');
        return parts.length ? `${parts.join(', ')}.` : null;
      }
      return null;
    },
    pt: (t) => {
      if (eventKey === 'low_humidity' && t.humidityPct) return `Umidade relativa entre ${fmtRange(t.humidityPct, '%')}.`;
      if (eventKey === 'frost' && t.frostMaxC != null) return `Temperatura mínima pode cair até ${t.frostMaxC}°C.`;
      if (eventKey === 'cold_spell' && t.coldDropC) return `Queda de temperatura entre ${fmtRange(t.coldDropC, '°C')}.`;
      if (eventKey === 'high_wind' && t.windKmh) return `Ventos entre ${fmtRange(t.windKmh, ' km/h')}.`;
      if ((eventKey === 'heavy_rain' || eventKey === 'storm') && (t.rainMmHour || t.windKmh)) {
        const parts: string[] = [];
        if (t.rainMmHour) parts.push(`chuva entre ${fmtRange(t.rainMmHour, ' mm/h')}`);
        if (t.rainMmDay) parts.push(dailyPhrase(t.rainMmDay, 'pt'));
        if (t.windKmh) parts.push(`ventos ${fmtRange(t.windKmh, ' km/h')}`);
        if (t.hail) parts.push('possibilidade de granizo');
        return parts.length ? `${parts.join(', ')}.` : null;
      }
      return null;
    },
    es: (t) => {
      if (eventKey === 'low_humidity' && t.humidityPct) return `Humedad relativa entre ${fmtRange(t.humidityPct, '%')}.`;
      if (eventKey === 'frost' && t.frostMaxC != null) return `La temperatura mínima podría bajar hasta ${t.frostMaxC}°C.`;
      if (eventKey === 'cold_spell' && t.coldDropC) return `Descenso de temperatura entre ${fmtRange(t.coldDropC, '°C')}.`;
      if (eventKey === 'high_wind' && t.windKmh) return `Vientos entre ${fmtRange(t.windKmh, ' km/h')}.`;
      if ((eventKey === 'heavy_rain' || eventKey === 'storm') && (t.rainMmHour || t.windKmh)) {
        const parts: string[] = [];
        if (t.rainMmHour) parts.push(`lluvia entre ${fmtRange(t.rainMmHour, ' mm/h')}`);
        if (t.rainMmDay) parts.push(dailyPhrase(t.rainMmDay, 'es'));
        if (t.windKmh) parts.push(`vientos ${fmtRange(t.windKmh, ' km/h')}`);
        if (t.hail) parts.push('posible granizo');
        return parts.length ? `${parts.join(', ')}.` : null;
      }
      return null;
    },
    fr: (t) => {
      if (eventKey === 'low_humidity' && t.humidityPct) return `Humidité relative attendue entre ${fmtRange(t.humidityPct, ' %')}.`;
      if (eventKey === 'frost' && t.frostMaxC != null) return `La température minimale pourrait descendre à ${t.frostMaxC}°C.`;
      if (eventKey === 'cold_spell' && t.coldDropC) return `Baisse de température attendue de ${fmtRange(t.coldDropC, ' °C')}.`;
      if (eventKey === 'high_wind' && t.windKmh) return `Vents attendus entre ${fmtRange(t.windKmh, ' km/h')}.`;
      if ((eventKey === 'heavy_rain' || eventKey === 'storm') && (t.rainMmHour || t.windKmh)) {
        const parts: string[] = [];
        if (t.rainMmHour) parts.push(`pluie entre ${fmtRange(t.rainMmHour, ' mm/h')}`);
        if (t.rainMmDay) parts.push(dailyPhrase(t.rainMmDay, 'fr'));
        if (t.windKmh) parts.push(`vents ${fmtRange(t.windKmh, ' km/h')}`);
        if (t.hail) parts.push('grêle possible');
        return parts.length ? `${parts.join(', ')}.` : null;
      }
      return null;
    },
    de: (t) => {
      if (eventKey === 'low_humidity' && t.humidityPct) return `Relative Luftfeuchtigkeit zwischen ${fmtRange(t.humidityPct, ' %')} erwartet.`;
      if (eventKey === 'frost' && t.frostMaxC != null) return `Die Mindesttemperatur kann auf ${t.frostMaxC}°C fallen.`;
      if (eventKey === 'cold_spell' && t.coldDropC) return `Temperaturrückgang um ${fmtRange(t.coldDropC, ' °C')} erwartet.`;
      if (eventKey === 'high_wind' && t.windKmh) return `Wind zwischen ${fmtRange(t.windKmh, ' km/h')} erwartet.`;
      if ((eventKey === 'heavy_rain' || eventKey === 'storm') && (t.rainMmHour || t.windKmh)) {
        const parts: string[] = [];
        if (t.rainMmHour) parts.push(`Regen zwischen ${fmtRange(t.rainMmHour, ' mm/h')}`);
        if (t.rainMmDay) parts.push(dailyPhrase(t.rainMmDay, 'de'));
        if (t.windKmh) parts.push(`Wind ${fmtRange(t.windKmh, ' km/h')}`);
        if (t.hail) parts.push('möglicher Hagel');
        return parts.length ? `${parts.join(', ')}.` : null;
      }
      return null;
    },
    zh: (t) => {
      if (eventKey === 'low_humidity' && t.humidityPct) return `预计相对湿度在 ${fmtRange(t.humidityPct, '%')} 之间。`;
      if (eventKey === 'frost' && t.frostMaxC != null) return `最低气温可能降至 ${t.frostMaxC}°C。`;
      if (eventKey === 'cold_spell' && t.coldDropC) return `气温预计下降 ${fmtRange(t.coldDropC, '°C')}。`;
      if (eventKey === 'high_wind' && t.windKmh) return `预计风速在 ${fmtRange(t.windKmh, ' km/h')} 之间。`;
      if ((eventKey === 'heavy_rain' || eventKey === 'storm') && (t.rainMmHour || t.windKmh)) {
        const parts: string[] = [];
        if (t.rainMmHour) parts.push(`降雨 ${fmtRange(t.rainMmHour, ' mm/h')}`);
        if (t.rainMmDay) parts.push(dailyPhrase(t.rainMmDay, 'zh'));
        if (t.windKmh) parts.push(`风速 ${fmtRange(t.windKmh, ' km/h')}`);
        if (t.hail) parts.push('可能有冰雹');
        return parts.length ? `${parts.join('，')}。` : null;
      }
      return null;
    },
  };
  return (R[language] ?? R.en)(t);
}

const FALLBACK_SUMMARY: Record<string, string> = {
  en: 'See the official source for full details.',
  pt: 'Veja a fonte oficial para todos os detalhes.',
  es: 'Consulta la fuente oficial para más detalles.',
  fr: "Consultez la source officielle pour tous les détails.",
  de: 'Vollständige Details in der amtlichen Quelle.',
  zh: '详情请见官方来源。',
};

/**
 * Build a fully localized, non-machine-translated summary sentence for an
 * alert. Returns a designed fallback (never the raw source description)
 * when the description doesn't match a known extraction shape.
 */
export function buildAlertSummary(eventKey: string, description: string, language: string): string {
  const thresholds = extractThresholds(eventKey, description);
  const sentence = sentenceFor(language, eventKey, thresholds);
  return sentence ?? FALLBACK_SUMMARY[language] ?? FALLBACK_SUMMARY.en;
}
