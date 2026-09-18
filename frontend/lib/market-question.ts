//kalma/frontend/lib/market-question.ts
//
// CO-1 (coordination layer): every signal leads with one plain question.
// People coordinate around a shared question + deadline + visible split —
// this module is the single source of that question so cards, the
// quick-predict sheet, collapsed rows, and share surfaces all ask the same
// thing in the same words.
//
// Phrasing matches the question already shipped on /markets/[id], and fills
// the gap where V6 types (cold spell, dry stretch, frost risk, heavy rain)
// only had English fallbacks. Above/Below semantics are unchanged — the
// question is phrased so "Above" is always the yes-side of the measured
// value, exactly as on the detail page.
//
// Units follow the reader, not the signal: `system` converts the threshold at
// display time (28°C → 82°F). The on-chain value is untouched and stays the
// thing the oracle resolves against. Server renders (metadata, OG cards,
// JSON-LD) leave it at the 'metric' default so the canonical text is stable.

import {
  convertThreshold,
  thresholdTemp,
  thresholdPrecip,
  type UnitSystem,
} from '@/lib/units';
import { decodeColdLine } from '@/lib/contracts';

export type MarketQuestionParams = {
  marketTypeId: number;
  thresholdValue: number;
  unit: string;
  startTime: number;
  endTime: number;
};

type Lang = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'zh';

// "In the next N days" only reads true when N days starts now. A market
// seeded a week ahead (S3-S5's own seed calendar routinely does this) has a
// real gap between "created" and "the weather window opens", and this
// phrasing skipped straight past it: a 3-day window starting in 7 days still
// said "in the next 3 days", which is not a rounding error, it is a false
// statement about when the window is. `now` makes both halves correct:
//   - not started yet: keep the window's full nominal length, but prefix
//     "Starting {date}," so "the next N days" is anchored to that date, not
//     to today.
//   - already running: use days actually REMAINING from now, not the
//     original nominal length, so a 7-day window with 2 days left does not
//     still claim "the next 7 days".
function windowDays(startTime: number, endTime: number, now: number) {
  const from = Math.max(startTime, now);
  return Math.max(1, Math.round((endTime - from) / 86400));
}

const STARTING_LOCALE: Record<Lang, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
};

function formatStartDate(startTime: number, lang: Lang): string {
  return new Intl.DateTimeFormat(STARTING_LOCALE[lang], {
    month: 'short',
    day: 'numeric',
  }).format(new Date(startTime * 1000));
}

// Prefixed onto the question, lowercase-joined, only when startTime is still
// ahead of `now`. Keeps this as one small table instead of doubling every
// phrase in the switch below across marketTypeId x language.
const STARTING_PREFIX: Record<Lang, (date: string) => string> = {
  en: (d) => `Starting ${d}, `,
  pt: (d) => `A partir de ${d}, `,
  es: (d) => `A partir del ${d}, `,
  fr: (d) => `À partir du ${d}, `,
  de: (d) => `Ab dem ${d}, `,
  zh: (d) => `从${d}起，`,
};

// Lowercases the question's first letter so it reads correctly mid-sentence
// after the "Starting X," prefix. A leading non-letter (Spanish "¿", a CJK
// character with no case) passes through unchanged, which is already correct
// there.
function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

export function marketQuestion(
  language: string,
  m: MarketQuestionParams,
  system: UnitSystem = 'metric',
  now: number = Math.floor(Date.now() / 1000),
): string {
  const lang = (
    ['en', 'pt', 'es', 'fr', 'de', 'zh'].includes(language) ? language : 'en'
  ) as Lang;
  const n = windowDays(m.startTime, m.endTime, now);
  const raw = m.thresholdValue ?? 0;
  // Types 1/3/4 carry the registry unit ('mm', '°C', 'cm') on the threshold.
  const converted = convertThreshold(raw, m.unit ?? '', system);
  const t = converted.value;
  const u = converted.unit;
  // V6 cold_spell uses an inverted unsigned encoding: 9886 → 15°C.
  const x = thresholdTemp(decodeColdLine(raw), system);
  // V6 dry_stretch measures a daily rainfall ceiling in mm, and frost_risk a
  // fixed ${frost} night line — both hardcoded below rather than registry-driven.
  const dry = thresholdPrecip(1, system);
  const frost = thresholdTemp(2, system);

  const dayWord: Record<Lang, [string, string]> = {
    en: ['day', 'days'],
    pt: ['dia', 'dias'],
    es: ['día', 'días'],
    fr: ['jour', 'jours'],
    de: ['Tag', 'Tagen'],
    zh: ['天', '天'],
  };
  const win = `${n} ${dayWord[lang][n === 1 ? 0 : 1]}`;

  const question = questionText();
  if (m.startTime > now) {
    const prefixed =
      STARTING_PREFIX[lang](formatStartDate(m.startTime, lang)) +
      lowerFirst(question);
    return prefixed;
  }
  return question;

  function questionText(): string {
    switch (lang) {
      case 'pt':
        switch (m.marketTypeId) {
          case 1:
            return `A chuva vai atingir ou superar ${t}${u} nos próximos ${win}?`;
          case 3:
            return `A média das mínimas vai ficar abaixo de ${t}${u} nos próximos ${win}?`;
          case 4:
            return `O acúmulo de neve vai atingir ou superar ${t}${u} nos próximos ${win}?`;
          case 5:
            return `Uma onda de frio vai levar as noites abaixo de ${x} nos próximos ${win}?`;
          case 6:
            return `A chuva diária vai ficar em até ${dry} pelos próximos ${win}?`;
          case 7:
            return `Alguma noite vai cair abaixo de ${frost} nos próximos ${win}?`;
          case 8:
            return `Vai ter um dia de chuva muito forte nos próximos ${win}?`;
          default:
            return `A média das máximas vai passar de ${t}${u} nos próximos ${win}?`;
        }
      case 'es':
        switch (m.marketTypeId) {
          case 1:
            return `¿Lloverá más de ${t}${u} en los próximos ${win}?`;
          case 3:
            return `¿La mínima promedio quedará por debajo de ${t}${u} en los próximos ${win}?`;
          case 4:
            return `¿Caerán más de ${t}${u} de nieve en los próximos ${win}?`;
          case 5:
            return `¿Una ola de frío llevará las noches por debajo de ${x} en los próximos ${win}?`;
          case 6:
            return `¿La lluvia diaria se mantendrá en ${dry} o menos durante los próximos ${win}?`;
          case 7:
            return `¿Alguna noche bajará de ${frost} en los próximos ${win}?`;
          case 8:
            return `¿Habrá un día de lluvia inusualmente intensa en los próximos ${win}?`;
          default:
            return `¿La máxima promedio superará ${t}${u} en los próximos ${win}?`;
        }
      case 'fr':
        switch (m.marketTypeId) {
          case 1:
            return `Pleuvra-t-il plus de ${t}${u} dans les prochains ${win} ?`;
          case 3:
            return `La minimale moyenne restera-t-elle sous ${t}${u} dans les prochains ${win} ?`;
          case 4:
            return `Tombera-t-il plus de ${t}${u} de neige dans les prochains ${win} ?`;
          case 5:
            return `Une vague de froid fera-t-elle descendre les nuits sous ${x} dans les prochains ${win} ?`;
          case 6:
            return `La pluie quotidienne restera-t-elle à ${dry} ou moins pendant les prochains ${win} ?`;
          case 7:
            return `Une nuit descendra-t-elle sous ${frost} dans les prochains ${win} ?`;
          case 8:
            return `Y aura-t-il une journée de pluie exceptionnellement forte dans les prochains ${win} ?`;
          default:
            return `La maximale moyenne dépassera-t-elle ${t}${u} dans les prochains ${win} ?`;
        }
      case 'de':
        switch (m.marketTypeId) {
          case 1:
            return `Regnet es mehr als ${t}${u} in den nächsten ${win}?`;
          case 3:
            return `Bleibt der durchschnittliche Tiefstwert unter ${t}${u} in den nächsten ${win}?`;
          case 4:
            return `Fällt mehr als ${t}${u} Schnee in den nächsten ${win}?`;
          case 5:
            return `Drückt eine Kältewelle die Nächte unter ${x} in den nächsten ${win}?`;
          case 6:
            return `Bleibt der tägliche Regen bei höchstens ${dry} in den nächsten ${win}?`;
          case 7:
            return `Fällt eine Nacht unter ${frost} in den nächsten ${win}?`;
          case 8:
            return `Gibt es einen ungewöhnlich starken Regentag in den nächsten ${win}?`;
          default:
            return `Übersteigt der durchschnittliche Höchstwert ${t}${u} in den nächsten ${win}?`;
        }
      case 'zh':
        switch (m.marketTypeId) {
          case 1:
            return `未来${n}天降雨量会超过${t}${u}吗？`;
          case 3:
            return `未来${n}天平均最低气温会低于${t}${u}吗？`;
          case 4:
            return `未来${n}天降雪量会超过${t}${u}吗？`;
          case 5:
            return `未来${n}天会有寒潮让夜间低于${x}吗？`;
          case 6:
            return `未来${n}天每日降雨会保持在${dry}以内吗？`;
          case 7:
            return `未来${n}天会有夜间低于${frost}吗？`;
          case 8:
            return `未来${n}天会出现异常强降雨日吗？`;
          default:
            return `未来${n}天平均最高气温会超过${t}${u}吗？`;
        }
      default:
        switch (m.marketTypeId) {
          // "over the next", not "in the next" — imperial renders "1.1 in",
          // and "1.1 in in the next 7 days" is unreadable.
          case 1:
            return `Will it rain more than ${t}${u} over the next ${win}?`;
          case 3:
            return `Will the average low stay below ${t}${u} in the next ${win}?`;
          case 4:
            return `Will more than ${t}${u} of snow fall in the next ${win}?`;
          case 5:
            return `Will a cold spell drop nights below ${x} in the next ${win}?`;
          case 6:
            return `Will daily rain stay at or below ${dry} for the next ${win}?`;
          case 7:
            return `Will any night drop below ${frost} in the next ${win}?`;
          case 8:
            return `Will one unusually heavy rain day hit in the next ${win}?`;
          default:
            return `Will the average high exceed ${t}${u} in the next ${win}?`;
        }
    }
  }
}
