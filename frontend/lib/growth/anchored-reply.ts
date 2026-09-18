// kalma/frontend/lib/growth/anchored-reply.ts
//
// Replies that answer the post in front of them.
//
// WHY THIS REPLACES THE GENERIC CONTEXT FORMS. Measured 2026-09-06 against
// the live ledger: 22 of 43 published replies came from the context path, and
// those 19 (excluding oracle) used only 10 distinct sentences. One sentence
// went to six different people. Running our own looksTemplated() over our own
// output returns TRUE, which means the reply engine would reject this account
// by the same gate it uses to reject relay bots.
//
// Two failures Pedro flagged, and they are different:
//
//   A commodity post ("Sugar futures rallied 21.5% in August... extreme heat
//   across Europe and Asia") got "What mattered there: how much fell, when it
//   arrived...". There is no "there". The template assumes a field and a
//   place the post never mentions.
//
//   A prayer ("Ya Allah... please grant us abundant rainfall and a bountiful
//   harvest. Amin") got the same three-option technical questionnaire. It
//   passed the old gate because it contains "rainfall" and "harvest". A
//   devotional post is not an operational conversation, and answering one
//   this way earns a mute (-58.8) or a block (-31.2).
//
// THE MECHANISM. A reply must name what the POST named. It needs two anchors
// read out of the tweet itself: a SUBJECT (a crop, a herd, a commodity that
// somebody grows or ships) and a CONDITION (the weather the post is about).
// Templates then reference both, so the sentence could not have been sent to
// anybody else.
//
// The prayer is handled without a special rule: it names no crop, only the
// generic word "harvest", so it yields no subject and gets no reply. The gate
// falls out of the requirement rather than being bolted on beside it.
//
// Still deterministic and still template-based, because the safety of this
// engine comes from every sentence having been read by a person before it
// could ever be sent. What changes is that the sentence now has to fit.

import { normalize } from './triage.ts';
import { topicsInText, type TweetTopic } from './region-match.ts';
import type { GrowthLang } from './types.ts';

/**
 * Things a person grows, herds or ships, in the words a TWEET uses.
 *
 * Deliberately NOT reusing lib/signal-engine/activity-profile.ts. That
 * taxonomy is tuned for Wikipedia prose and matches "sugar cane", "sugar
 * mills", "sugar industry"; the post that exposed this said "Sugar futures
 * rallied", which none of those reach. Different corpus, different tuning,
 * the same lesson the demand extractor learned.
 *
 * The value is the word we put back INTO the reply, so it has to read
 * naturally mid-sentence in each language.
 */
const SUBJECTS: Array<{ re: RegExp; en: string; pt: string; es: string }> = [
  // "Sugar futures" is a commodity-market headline, not evidence about a
  // cane field. Require the crop wording itself so a global price post is
  // rejected instead of receiving an invented field reply.
  { re: /\bsugar\s+cane\b|\bcane\b|\bcana(?:-de-)?\s?acucar\b|\bacucar\b|\bcana\b/,
    en: 'cane', pt: 'a cana', es: 'la caña' },
  { re: /\bcoffee\b|\bcafe\b|\barabica\b|\brobusta\b/,
    en: 'coffee', pt: 'o café', es: 'el café' },
  { re: /\bwheat\b|\btrigo\b/, en: 'wheat', pt: 'o trigo', es: 'el trigo' },
  { re: /\bcorn\b|\bmaize\b|\bmilho\b|\bmaiz\b/, en: 'corn', pt: 'o milho', es: 'el maíz' },
  { re: /\bsoy(?:bean)?s?\b|\bsoja\b/, en: 'soy', pt: 'a soja', es: 'la soja' },
  { re: /\brice\b|\barroz\b|\bpaddy\b/, en: 'rice', pt: 'o arroz', es: 'el arroz' },
  { re: /\bcotton\b|\balgodao\b|\balgodon\b/, en: 'cotton', pt: 'o algodão', es: 'el algodón' },
  { re: /\bcocoa\b|\bcacau\b|\bcacao\b/, en: 'cocoa', pt: 'o cacau', es: 'el cacao' },
  { re: /\bcattle\b|\blivestock\b|\bherds?\b|\bgado\b|\brebanho\b|\bganado\b|\brebano\b/,
    en: 'the herd', pt: 'o rebanho', es: 'el rebaño' },
  // Wine words matter as much as the plant. Found by measuring against the
  // live search queries: "France's Champagne output is set to fall by almost
  // half as scorching heat..." is exactly our conversation (vines, heat) and
  // was rejected because the vocabulary only knew the plant, not the product
  // people actually tweet about.
  { re: /\bvineyards?\b|\bgrapes?\b|\bwine(?:ry|ries)?\b|\bchampagne\b|\bvintage\s+(?:year|harvest|wine)\b|\bvinha\b|\bvinho\b|\buvas?\b|\bvindima\b|\bvinedo\b|\bvino\b|\bvid\b|\bbodega\b/,
    en: 'the vines', pt: 'a vinha', es: 'la viña' },
  { re: /\borchards?\b|\bcitrus\b|\bpomar\b|\blaranja\b|\bnaranja\b|\bhuerto\b/,
    en: 'the orchard', pt: 'o pomar', es: 'el huerto' },
  { re: /\bpasture\b|\bgrazing\b|\bpasto\b|\bpastagem\b|\bpastizal\b/,
    en: 'pasture', pt: 'o pasto', es: 'el pasto' },

  // Beyond farming. The first version of this list held only crops, which
  // silently switched off five of the six conversation domains: a solarpunk
  // post about a microgrid, a logistics post about a route and a hospitality
  // post about a season all stopped producing any reply at all. Caught by the
  // existing solarpunk test rather than in production. Anchoring is meant to
  // make replies specific, not to narrow the engine to agriculture.
  { re: /\bmicrogrid\b|\bsolar\b|\bbatter(?:y|ies)\b|\boff-?grid\b|\bthe grid\b|\bpainel solar\b|\bbateria\b|\bpanel solar\b/,
    en: 'the system', pt: 'o sistema', es: 'el sistema' },
  { re: /\broutes?\b|\bfreight\b|\bdeliver(?:y|ies)\b|\btrucks?\b|\bhaulage\b|\bshipments?\b|\brota\b|\bfrete\b|\bentregas?\b|\bcaminhao\b|\bruta\b|\bflete\b|\bcamion\b/,
    en: 'the route', pt: 'a rota', es: 'la ruta' },
  { re: /\broads?\b|\bhighways?\b|\brodovias?\b|\bestradas?\b|\bcarreteras?\b/,
    en: 'the road', pt: 'a estrada', es: 'la carretera' },
  { re: /\bbookings?\b|\bguests?\b|\bhotels?\b|\bhostels?\b|\bpousadas?\b|\breservas?\b|\bhospedes\b|\bhuespedes\b/,
    en: 'the season', pt: 'a temporada', es: 'la temporada' },
  { re: /\bterraces?\b|\bpatio\b|\boutdoor seating\b|\bterracos?\b|\bterrazas?\b/,
    en: 'the terrace', pt: 'o terraço', es: 'la terraza' },
  { re: /\bfestivals?\b|\bmatch(?:es)?\b|\bfixtures?\b|\bevents?\b|\bsites?\b|\bcrews?\b|\bobras?\b|\bcanteiros?\b|\bequipes?\b|\beventos?\b/,
    en: 'the site', pt: 'o local', es: 'el sitio' },
  { re: /\bboats?\b|\bfishing\b|\bfleet\b|\bpesca\b|\bbarcos?\b|\bpescadores\b/,
    en: 'the boats', pt: 'os barcos', es: 'los barcos' },
];

export interface Anchors {
  subject: string | null;
  condition: TweetTopic | null;
}

/**
 * What this post is actually about, in its own terms.
 *
 * Both anchors are required by the caller. A post with a condition and no
 * subject is weather talk with nobody in it; a post with a subject and no
 * condition is not our conversation at all.
 */
export function extractAnchors(text: string, lang: GrowthLang): Anchors {
  // Matched against the ACCENT-FOLDED text, and the patterns above are
  // written without accents to suit it. JavaScript's \b is defined on
  // [A-Za-z0-9_], so "é" is not a word character and /\bcaf[eé]\b/ never
  // matches "café": the boundary after the accent sits between two non-word
  // characters and fails. That silently killed café, açúcar, algodão, caña,
  // maíz, rebaño and viña, which is most of the Portuguese and Spanish
  // vocabulary. Caught by a test, not in production.
  const hay = normalize(text);
  const hit = SUBJECTS.find((s) => s.re.test(hay));
  const topics = topicsInText(hay);
  return {
    subject: hit ? (lang === 'pt' ? hit.pt : lang === 'es' ? hit.es : hit.en) : null,
    condition: topics[0] ?? null,
  };
}

/**
 * One question per condition, naming the subject the post named.
 *
 * Every form asks something only a person who works with that crop under that
 * condition can answer, which is the point: it cannot have been sent to
 * anybody else. All of them describe and ask, none instruct, per the rule in
 * CLAUDE.md that this account states the observable and never the action.
 */
/** The three languages this engine writes replies in. GrowthLang is wider
 *  (fr, de, zh are used for POSTS), so the reply path narrows it here rather
 *  than shipping half-written templates in a language nobody reviewed. */
type ReplyLang = 'en' | 'pt' | 'es';

function replyLang(lang: GrowthLang): ReplyLang {
  return lang === 'pt' || lang === 'es' ? lang : 'en';
}

const FORMS: Record<TweetTopic, Record<ReplyLang, string[]>> = {
  heat: {
    en: [
      'For {subject}, the heat that matters is usually a run of days rather than one hot afternoon. In what you are seeing, was it the peak or the number of days in a row?',
      'For {subject} the damaging part of a heat spell is often the night that never cools rather than the daytime maximum. Which one showed up in this one?',
      'A heat number for {subject} reads differently depending on where it was taken. Was that a shaded reading, or the canopy itself?',
    ],
    pt: [
      'Para {subject}, o calor que pesa costuma ser uma sequência de dias, não uma tarde quente. No que você está vendo, pesou o pico ou a quantidade de dias seguidos?',
      'Para {subject}, a parte que faz estrago numa onda de calor costuma ser a noite que não esfria, não a máxima do dia. Qual das duas apareceu aqui?',
      'Um número de calor para {subject} muda de sentido conforme onde foi medido. Era leitura na sombra ou no próprio dossel?',
    ],
    es: [
      'Para {subject}, el calor que pesa suele ser una racha de días y no una tarde caliente. En lo que estás viendo, ¿pesó el pico o los días seguidos?',
      'Para {subject}, lo que daña en una ola de calor suele ser la noche que no refresca, no la máxima del día. ¿Cuál apareció en esta?',
      'Un número de calor para {subject} se lee distinto según dónde se tomó. ¿Era lectura a la sombra o el dosel mismo?',
    ],
  },
  dry: {
    en: [
      'For {subject}, a dry stretch usually shows well before the ground looks dry. Was this one long enough to show, or is it still only in the forecast?',
      'For {subject} the number that decides a dry spell is the length of the run, not the seasonal total. How many days without rain did this reach?',
      'Dry weather and water stress are different clocks for {subject}. Which one had already started where you are?',
    ],
    pt: [
      'Para {subject}, uma estiagem costuma aparecer bem antes de o chão parecer seco. Essa já foi longa o suficiente para aparecer, ou ainda está só na previsão?',
      'Para {subject}, o número que decide uma estiagem é o tamanho da sequência, não o total da estação. Quantos dias sem chuva isso alcançou?',
      'Tempo seco e estresse hídrico são relógios diferentes para {subject}. Qual dos dois já tinha começado aí?',
    ],
    es: [
      'Para {subject}, una racha seca suele notarse mucho antes de que el suelo se vea seco. ¿Esta ya fue lo bastante larga, o sigue solo en el pronóstico?',
      'Para {subject}, el número que decide una sequía es el largo de la racha, no el total de la temporada. ¿Cuántos días sin lluvia alcanzó?',
      'Tiempo seco y estrés hídrico son relojes distintos para {subject}. ¿Cuál había empezado ya donde estás?',
    ],
  },
  rain: {
    en: [
      'For {subject}, rain is rarely the problem. Rain arriving faster than the ground takes it is. Was this a steady soak or a short heavy hour?',
      'For {subject} the same total lands differently over one day or over five. How was this one spread?',
      'A forecast total and what actually reached {subject} are two different facts. Did anyone record what fell at the point itself?',
    ],
    pt: [
      'Chuva não é o problema para {subject}, chuva chegando mais rápido do que o solo aceita é. Foi chuva mansa ou uma hora forte?',
      'Para {subject} o mesmo total cai diferente em um dia ou em cinco. Como esse se distribuiu?',
      'O total previsto e o que de fato alcançou {subject} são dois fatos diferentes. Alguém registrou o que caiu no ponto?',
    ],
    es: [
      'La lluvia no es el problema para {subject}, lo es la lluvia que llega más rápido de lo que el suelo acepta. ¿Fue lluvia pareja o una hora fuerte?',
      'Para {subject} el mismo total cae distinto en un día o en cinco. ¿Cómo se repartió este?',
      'El total pronosticado y lo que realmente alcanzó {subject} son dos hechos distintos. ¿Alguien registró lo que cayó en el punto?',
    ],
  },
  frost: {
    en: [
      'For {subject}, frost is decided by the low point and the hours spent under it, not by the daily average. How long did it sit below the line?',
      'For {subject} a frost at the station and a frost in the hollow are different events. Which one was this?',
    ],
    pt: [
      'Para {subject}, a geada se decide pelo ponto mais baixo e pelas horas embaixo dele, não pela média do dia. Quanto tempo ficou abaixo da linha?',
      'Para {subject}, geada na estação e geada no baixio são eventos diferentes. Qual foi esse?',
    ],
    es: [
      'Para {subject}, la helada se decide por el mínimo y las horas debajo de él, no por el promedio del día. ¿Cuánto tiempo estuvo bajo la línea?',
      'Para {subject}, una helada en la estación y una en la hondonada son eventos distintos. ¿Cuál fue esta?',
    ],
  },
  cold: {
    en: [
      'For {subject}, a cold run works through the nights that stack up rather than one cold morning. How many in a row did this one bring?',
      'For {subject} the question in a cold spell is usually how long it held, not how low it went. Which was it here?',
    ],
    pt: [
      'Para {subject}, um período frio pesa pelas noites que se acumulam, não por uma manhã fria. Quantas seguidas esse trouxe?',
      'Para {subject}, a pergunta num friagem costuma ser quanto tempo durou, não quão baixo chegou. Qual foi o caso aqui?',
    ],
    es: [
      'Para {subject}, una racha fría pesa por las noches que se acumulan, no por una mañana fría. ¿Cuántas seguidas trajo esta?',
      'Para {subject}, la pregunta en una racha fría suele ser cuánto duró, no cuán bajo llegó. ¿Cuál fue el caso aquí?',
    ],
  },
};

export interface AnchoredReply {
  text: string;
  subject: string;
  condition: TweetTopic;
}

/**
 * Build a reply that names this post's own subject and condition, or nothing.
 *
 * `seed` picks the variant deterministically (the tweet id at the call site),
 * so a rerun on the same post produces the same sentence rather than a second
 * different one.
 */
export function buildAnchoredReply(
  text: string,
  lang: GrowthLang,
  seed: string,
): AnchoredReply | null {
  const { subject, condition } = extractAnchors(text, lang);
  // Both or nothing. A condition with no subject is weather talk with nobody
  // in it, which is exactly what produced six copies of one sentence.
  if (!subject || !condition) return null;

  const forms = FORMS[condition]?.[replyLang(lang)];
  if (!forms?.length) return null;

  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const form = forms[hash % forms.length];

  return { text: form.replace('{subject}', subject), subject, condition };
}
