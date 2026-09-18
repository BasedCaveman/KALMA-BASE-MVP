// kalma/frontend/lib/growth/reply-repertoire.ts
//
// A second, deliberately narrow reply repertoire for useful conversations
// that do not name a city covered by Kalma.
//
// The local-fact path in reply-engine.ts remains the preferred path: when we
// have a matching place and a verified number, we answer with that number.
// This file only unlocks a reply when all of the following are true:
//   - the tweet is fresh and already has a conversation under it;
//   - it describes a concrete weather impact in a domain Kalma serves;
//   - we can add a domain-specific distinction or question without inventing
//     a local fact;
//   - the reply has no link, product mention or promotional ask.

import { topicsInText } from './region-match.ts';
import { normalize } from './triage.ts';
import { checkCopy, pickVariant } from './x-copy.ts';
import type { TweetCandidate } from './x-browser.ts';
import type { GrowthLang } from './types.ts';

export type ConversationDomain =
  | 'agriculture'
  | 'logistics'
  | 'hospitality'
  | 'outdoor_operations'
  | 'climate_data'
  | 'solarpunk';

const DOMAIN_MARKERS: Record<ConversationDomain, string[]> = {
  agriculture: [
    'farm', 'farmer', 'field', 'crop', 'harvest', 'planting', 'pasture', 'orchard',
    'vineyard', 'livestock', 'cattle', 'irrigation', 'lavoura', 'safra', 'colheita',
    'plantio', 'pasto', 'produtor', 'gado', 'cultivo', 'cosecha', 'siembra', 'ganado',
    'agroecologia', 'agroforestry', 'agrofloresta', 'permaculture', 'permacultura',
  ],
  logistics: [
    'route', 'freight', 'delivery', 'truck', 'road', 'traffic', 'shipment', 'cargo',
    'supply chain', 'cold chain', 'rota', 'frete', 'entrega', 'caminhao', 'caminhão',
    'rodovia', 'estrada', 'transito', 'trânsito', 'carga', 'logistica', 'logística',
    'ruta', 'flete', 'camion', 'camión', 'carretera', 'trafico', 'tráfico', 'entrega',
  ],
  hospitality: [
    'hotel', 'lodge', 'lodging', 'guest', 'booking', 'reservation', 'stay', 'tourism',
    'pousada', 'hospedagem', 'hospede', 'hóspede', 'reserva', 'turismo', 'hotelaria',
    'alojamiento', 'huesped', 'huésped', 'reservacion', 'reservación', 'hosteria',
  ],
  outdoor_operations: [
    'outdoor event', 'festival', 'construction site', 'field work', 'crew', 'venue',
    'evento ao ar livre', 'obra', 'canteiro', 'equipe de campo', 'producao do evento',
    'produção do evento', 'evento al aire libre', 'obra', 'equipo de campo', 'recinto',
    // Pop-up villages and temporary residencies: a tent city or a converted
    // site under multi-week weather exposure, folded in here rather than
    // given a domain of its own, since the operational question (site,
    // schedule, infrastructure under weather) is the same one this domain
    // already asks.
    'pop-up village', 'popup village', 'temporary village', 'encampment',
    'residency program', 'vila temporaria', 'vila temporária', 'aldeia temporaria',
    'aldeia temporária', 'vila efemera', 'residencia temporaria', 'aldea temporal',
    'residencia temporal', 'campamento',
  ],
  climate_data: [
    'weather station', 'rain gauge', 'pluviometer', 'radar', 'weather model',
    'forecast model', 'observation', 'observed', 'measured', 'recorded', 'reading',
    'estacao meteorologica', 'estação meteorológica', 'pluviometro', 'pluviômetro',
    'modelo meteorologico', 'modelo meteorológico', 'observacao', 'observação',
    'mediu', 'medido', 'registrou', 'leitura', 'estacion meteorologica',
    'estación meteorológica', 'pluviometro', 'pluviómetro', 'modelo meteorologico',
    'observacion', 'observación', 'midio', 'midió', 'registro', 'lectura',
  ],
  solarpunk: [
    'solarpunk', 'off-grid', 'off grid', 'microgrid', 'micro-grid',
    'decentralized infrastructure', 'decentralised infrastructure',
    'community resilience', 'climate adaptation', 'climate resilience',
    'regenerative infrastructure', 'renewable microgrid', 'community solar',
    'rainwater harvesting', 'water harvesting', 'passive cooling',
    'fora da rede', 'microrrede', 'infraestrutura descentralizada',
    'resiliencia comunitaria', 'resiliência comunitária', 'adaptacao climatica',
    'adaptação climática', 'captacao de agua da chuva', 'captação de água da chuva',
    'fuera de la red', 'microrred', 'infraestructura descentralizada',
    'resiliencia climatica', 'resiliencia climática', 'adaptacion climatica',
    'adaptación climática', 'captacion de agua de lluvia',
  ],
};

// Evidence that the tweet is about something that happened or changed, not a
// generic forecast headline. A measured value counts as evidence too.
const IMPACT_MARKERS = [
  'delay', 'delayed', 'cancel', 'cancelled', 'canceled', 'closed', 'closure',
  'blocked', 'damage', 'damaged', 'lost', 'loss', 'missed', 'stopped', 'disrupted',
  'atras', 'cancel', 'fechad', 'bloque', 'preju', 'perda', 'parou', 'interromp',
  'demora', 'retras', 'cancel', 'cerrad', 'bloque', 'daño', 'dano', 'perdida',
  'interrump', 'colheita', 'plantio', 'harvest', 'planting', 'cosecha', 'siembra',
  'measured', 'recorded', 'observed', 'registr', 'mediu', 'midio', 'midió', 'leitura',
];

const MEASURED_VALUE = /\b-?\d+(?:[.,]\d+)?\s*(?:mm|cm|in|inch|inches|°|c|f|km\/h|mph|%|hours?|horas?|minutes?|minutos?)\b/i;

export function conversationDomain(text: string): ConversationDomain | null {
  const hay = normalize(text);
  // More operational domains first. A hotel post that mentions a delivery
  // should not accidentally become a generic climate-data reply.
  const order: ConversationDomain[] = [
    'hospitality',
    'logistics',
    'agriculture',
    'outdoor_operations',
    'climate_data',
    'solarpunk',
  ];
  return order.find((domain) => DOMAIN_MARKERS[domain].some((marker) => hay.includes(normalize(marker)))) ?? null;
}

export interface ContextReplyGate {
  ok: boolean;
  domain: ConversationDomain | null;
  reason: string;
}

export function contextReplyGate(candidate: TweetCandidate): ContextReplyGate {
  const text = candidate.text || '';
  const hay = normalize(text);
  const domain = conversationDomain(text);

  if (!topicsInText(hay).length) return { ok: false, domain, reason: 'context_no_weather_topic' };
  if (!domain) return { ok: false, domain: null, reason: 'no_place_data' };
  if ((candidate.ageMinutes ?? 9999) > 360) {
    return { ok: false, domain, reason: 'context_too_old' };
  }
  // Join rooms where a conversation is already visible, not empty broadcast
  // threads. This is the strongest quality/reach gate on the context path.
  if (candidate.replies < 1) {
    return { ok: false, domain, reason: 'context_no_conversation' };
  }
  const concrete = MEASURED_VALUE.test(text) || IMPACT_MARKERS.some((marker) => hay.includes(marker));
  if (!concrete) return { ok: false, domain, reason: 'context_no_concrete_impact' };

  return { ok: true, domain, reason: 'context_ready' };
}

const FORMS: Record<ConversationDomain, Record<'en' | 'pt' | 'es', string[]>> = {
  agriculture: {
    en: [
      'For field decisions, total and timing are different signals. What mattered there: how much fell, when it arrived, or how long the condition lasted?',
      'The field outcome can turn on timing, not only the seasonal total. What changed the work there: when rain arrived, how much fell, or the irrigation window?',
    ],
    pt: [
      'Para quem está no campo, total e horário são sinais diferentes. O que decidiu aí: quanto caiu, quando chegou ou por quanto tempo a condição persistiu?',
      'O resultado no campo pode virar pelo momento, não só pelo total da estação. O que mudou o trabalho aí: chegada da chuva, volume ou janela de irrigação?',
    ],
    es: [
      'Para quien está en el campo, total y momento son señales distintas. ¿Qué decidió allí: cuánto cayó, cuándo llegó o cuánto duró la condición?',
      'El resultado en el campo puede cambiar por el momento, no solo por el total de la estación. ¿Qué cambió el trabajo allí: llegada de la lluvia, cantidad o ventana de riego?',
    ],
  },
  logistics: {
    en: [
      'Forecast rain and an actual route delay are different facts. What constrained the operation there: visibility, traffic, road condition, or timing?',
      'The useful signal for a route is the mechanism of the delay. Was it visibility, traffic buildup, surface condition, or the hour the weather arrived?',
    ],
    pt: [
      'Chuva prevista e atraso real na rota são fatos diferentes. O que travou a operação aí: visibilidade, trânsito, condição da via ou horário?',
      'Para a rota, o sinal útil é a causa do atraso. Foi visibilidade, acúmulo de trânsito, condição da via ou a hora em que o tempo mudou?',
    ],
    es: [
      'Lluvia prevista y retraso real en la ruta son hechos distintos. ¿Qué limitó la operación allí: visibilidad, tráfico, estado de la vía o el horario?',
      'Para la ruta, la señal útil es la causa del retraso. ¿Fue visibilidad, tráfico, estado de la vía o la hora en que cambió el tiempo?',
    ],
  },
  hospitality: {
    en: [
      'In hospitality, a forecast can create impact before the weather arrives. Did the decision follow what actually happened, or what guests expected beforehand?',
      'A booking can react to the forecast before the city feels the weather. Was the impact driven by the observed conditions or by the expectation?',
    ],
    pt: [
      'Na hospedagem, a previsão pode produzir impacto antes do tempo acontecer. A decisão veio do que realmente ocorreu ou do que o hóspede esperava?',
      'Uma reserva pode reagir à previsão antes de a cidade sentir o tempo. O impacto veio da condição observada ou da expectativa?',
    ],
    es: [
      'En hospitalidad, el pronóstico puede generar impacto antes de que llegue el tiempo. ¿La decisión respondió a lo que ocurrió o a lo que esperaba el huésped?',
      'Una reserva puede reaccionar al pronóstico antes de que la ciudad sienta el tiempo. ¿El impacto vino de la condición observada o de la expectativa?',
    ],
  },
  outdoor_operations: {
    en: [
      'For an outdoor operation, the forecast only becomes useful when it meets the impact. What changed there: timing, safety, or the ability to keep the schedule?',
      'The operational question is not only whether weather arrived. Which decision moved because of it: timing, safety, staffing, or continuity?',
    ],
    pt: [
      'Em uma operação ao ar livre, a previsão só ganha sentido quando encontra o impacto. O que mudou aí: horário, segurança ou capacidade de manter a programação?',
      'A pergunta operacional não é apenas se o tempo chegou. Qual decisão mudou: horário, segurança, equipe ou continuidade?',
    ],
    es: [
      'En una operación al aire libre, el pronóstico cobra sentido cuando encuentra el impacto. ¿Qué cambió allí: horario, seguridad o capacidad de mantener la programación?',
      'La pregunta operativa no es solo si llegó el tiempo. ¿Qué decisión cambió: horario, seguridad, equipo o continuidad?',
    ],
  },
  climate_data: {
    en: [
      'A regional forecast can get the direction right and miss the observation point. Did the local reading confirm the intensity and timing, or show something else?',
      'The useful comparison is forecast versus the reading at the point. Same intensity and timing, or a different event on the ground?',
    ],
    pt: [
      'Uma previsão regional pode acertar a direção e errar o ponto observado. A leitura local confirmou intensidade e horário ou mostrou outra coisa?',
      'A comparação útil é previsão contra leitura no ponto. Mesma intensidade e horário ou outro acontecimento no chão?',
    ],
    es: [
      'Un pronóstico regional puede acertar la dirección y fallar en el punto observado. ¿La lectura local confirmó intensidad y horario o mostró otra cosa?',
      'La comparación útil es pronóstico contra lectura en el punto. ¿Misma intensidad y horario u otro evento sobre el terreno?',
    ],
  },
  solarpunk: {
    en: [
      'For an off-grid or microgrid setup, which failure mode actually shows up first when the weather turns: generation, storage, or the load itself?',
      'Community resilience plans usually name the hazard. Did this one specify the threshold that triggers the response, or just the hazard type?',
    ],
    pt: [
      'Num sistema fora da rede ou de microrrede, qual falha aparece primeiro quando o tempo vira: geração, armazenamento ou a própria carga?',
      'Planos de resiliência comunitária costumam nomear o risco. Esse especificou o limiar que aciona a resposta, ou só o tipo de risco?',
    ],
    es: [
      'En un sistema fuera de la red o de microrred, ¿qué falla aparece primero cuando cambia el tiempo: generación, almacenamiento o la propia carga?',
      'Los planes de resiliencia comunitaria suelen nombrar el riesgo. ¿Este especificó el umbral que activa la respuesta, o solo el tipo de riesgo?',
    ],
  },
};

function replyLang(candidate: TweetCandidate): 'en' | 'pt' | 'es' {
  const lang = (candidate.lang || '').slice(0, 2) as GrowthLang;
  return lang === 'pt' || lang === 'es' ? lang : 'en';
}

export function buildContextReply(
  candidate: TweetCandidate,
  domain: ConversationDomain,
): { text: string; lang: 'en' | 'pt' | 'es' } | null {
  const lang = replyLang(candidate);
  const text = pickVariant(FORMS[domain][lang], `${candidate.id}:${domain}`);
  if (!text.includes('?') && !text.includes('¿')) return null;
  if (checkCopy(text, { requireNumber: false }).length) return null;
  if (/kalma|https?:\/\//i.test(text)) return null;
  return { text, lang };
}
