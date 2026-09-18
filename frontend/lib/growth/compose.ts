// kalma/frontend/lib/growth/compose.ts
//
// Turn a triaged link into an on-brand X draft. Template-based on purpose:
// predictable, localisable, and safe to auto-post (no model hallucination on
// the autonomous news-post path). Replies are human-approved anyway, so the
// operator can edit before the tap.
//
// Voice rules enforced here (CLAUDE.md Golden Rules 3/6/7/8 + Language Rules):
//   - ZERO gambling language (bet/odds/wager/payout/gamble) — scrubbed as a
//     last line of defence, and never present in the templates.
//   - "weather risk", not generic "weather".
//   - Coordination, not prediction; calm, plain, protective register.
//   - The action verb is "read/acompanhar the local signal", never "predict".
//
// A reply/post embeds a place card only when the caller found a LIVE signal for
// the matched place (that's what sets draft.cardUrl).

import type { Draft, GrowthKind, GrowthLang, PlaceLite } from './types';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kalma.me').replace(
  /\/$/,
  '',
);

const BANNED = /\b(bet|betting|bettor|gamble|gambling|odds|wager|payout)\b/gi;

/** X counts every link as 23 chars; keep body headroom for one link. */
const MAX_TEXT = 258;

export interface ComposeInput {
  kind: GrowthKind;
  place: PlaceLite | null;
  newsTitle: string | null;
  /** Source link to reference in a post (omitted for replies). */
  sourceUrl?: string | null;
  lang: GrowthLang;
  /** True when a live signal exists for `place` → card gets attached. */
  hasLiveSignal: boolean;
}

/** Localised place label, e.g. "Lavras, Brazil" / "Lavras (MG)". */
function placeLabel(place: PlaceLite): string {
  return place.region ? `${place.name} (${place.region})` : place.name;
}

// ── templates ────────────────────────────────────────────────────────────────
// {place} placeholder is substituted; keep every line free of banned words.

type Tmpl = { withPlace: string; noPlace: string };

const POST: Record<GrowthLang, Tmpl> = {
  en: {
    withPlace:
      'Weather risk is never abstract. It lands somewhere. In {place}, Kalma tracks what the sky is setting up and what neighbours are seeing on the ground. Read the local signal 👇',
    noPlace:
      'Weather risk is never abstract. It lands somewhere. Kalma turns each local risk window into a plain question your community can read and act on. 👇',
  },
  pt: {
    withPlace:
      'Risco climático não é abstrato. Ele cai em algum lugar. Em {place}, a Kalma acompanha o que o céu está armando e o que os vizinhos estão vendo no chão. Leia o sinal local 👇',
    noPlace:
      'Risco climático não é abstrato. Ele cai em algum lugar. A Kalma transforma cada janela de risco local numa pergunta simples que a sua comunidade lê e usa para se preparar. 👇',
  },
  es: {
    withPlace:
      'El riesgo climático nunca es abstracto. Cae en algún lugar. En {place}, Kalma sigue lo que el cielo está preparando y lo que los vecinos ven en el terreno. Lee la señal local 👇',
    noPlace:
      'El riesgo climático nunca es abstracto. Cae en algún lugar. Kalma convierte cada ventana de riesgo local en una pregunta clara que tu comunidad puede leer y usar. 👇',
  },
  fr: {
    withPlace:
      "Le risque météo n'est jamais abstrait. Il tombe quelque part. À {place}, Kalma suit ce que le ciel prépare et ce que les voisins observent sur le terrain. Lisez le signal local 👇",
    noPlace:
      "Le risque météo n'est jamais abstrait. Il tombe quelque part. Kalma transforme chaque fenêtre de risque local en une question claire que votre communauté peut lire et utiliser. 👇",
  },
  de: {
    withPlace:
      'Wetterrisiko ist nie abstrakt. Es trifft einen Ort. In {place} verfolgt Kalma, was sich am Himmel zusammenbraut und was Nachbarn vor Ort beobachten. Lies das lokale Signal 👇',
    noPlace:
      'Wetterrisiko ist nie abstrakt. Es trifft einen Ort. Kalma macht aus jedem lokalen Risikofenster eine klare Frage, die deine Gemeinde lesen und nutzen kann. 👇',
  },
  zh: {
    withPlace:
      '天气风险从不抽象，它总会落在某个地方。在{place}，Kalma 追踪天空正在酝酿的变化，以及邻里在当地看到的情况。查看本地信号 👇',
    noPlace:
      '天气风险从不抽象，它总会落在某个地方。Kalma 把每一个本地风险窗口，变成社区能读懂并据以准备的清晰问题。👇',
  },
};

const REPLY: Record<GrowthLang, Tmpl> = {
  en: {
    withPlace:
      'This is exactly the kind of weather risk you can follow locally. Kalma has a live signal for {place} right now: what the setup looks like, plus what neighbours are reporting on the ground 👇',
    noPlace:
      'This is exactly the kind of weather risk a community can coordinate around: a plain read on what the sky is setting up, and what neighbours are seeing. That’s what Kalma is for 👇',
  },
  pt: {
    withPlace:
      'É exatamente esse tipo de risco climático que dá pra acompanhar de forma local. A Kalma tem um sinal ativo para {place} agora: o que está armando e o que os vizinhos estão relatando no chão 👇',
    noPlace:
      'É exatamente esse tipo de risco climático que uma comunidade pode coordenar: uma leitura simples do que o céu está armando e do que os vizinhos estão vendo. É pra isso que a Kalma existe 👇',
  },
  es: {
    withPlace:
      'Es justo el tipo de riesgo climático que puedes seguir de forma local. Kalma tiene una señal activa para {place} ahora: cómo se presenta y qué reportan los vecinos en el terreno 👇',
    noPlace:
      'Es justo el tipo de riesgo climático que una comunidad puede coordinar: una lectura clara de lo que el cielo prepara y lo que ven los vecinos. Para eso está Kalma 👇',
  },
  fr: {
    withPlace:
      'C’est exactement le genre de risque météo qu’on peut suivre localement. Kalma a un signal actif pour {place} en ce moment : ce qui se prépare et ce que les voisins rapportent sur le terrain 👇',
    noPlace:
      'C’est exactement le genre de risque météo qu’une communauté peut coordonner : une lecture claire de ce que le ciel prépare et de ce que voient les voisins. C’est à ça que sert Kalma 👇',
  },
  de: {
    withPlace:
      'Genau diese Art von Wetterrisiko lässt sich lokal verfolgen. Kalma hat gerade ein aktives Signal für {place}: was sich zusammenbraut und was Nachbarn vor Ort melden 👇',
    noPlace:
      'Genau diese Art von Wetterrisiko kann eine Gemeinde koordinieren: eine klare Lesart dessen, was der Himmel vorbereitet, und was Nachbarn sehen. Dafür ist Kalma da 👇',
  },
  zh: {
    withPlace:
      '这正是可以在本地持续关注的天气风险。Kalma 现在就有 {place} 的实时信号：正在酝酿的态势，以及邻里在当地的反馈 👇',
    noPlace:
      '这正是社区可以协同应对的天气风险：清晰读懂天空正在酝酿什么，以及邻里看到了什么。这就是 Kalma 的意义 👇',
  },
};

/** Trim to a max length on a word boundary, appending an ellipsis if cut. */
function clamp(text: string, max = MAX_TEXT): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Remove any accidental banned term, and strip em/en dashes (a human-writing
 * rule: dashes read as a bot tell). Latin dashes collapse to a comma; the
 * Chinese double dash (——) collapses to a Chinese comma.
 */
function scrub(text: string): string {
  return text
    .replace(BANNED, '')
    .replace(/\s*——\s*/g, '，')
    .replace(/\s*[—–]+\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Compose the draft. Returns the text plus (when a live signal exists) the
 * absolute card URL the caller should attach as media.
 */
export function compose(input: ComposeInput): Draft {
  const { kind, place, lang, hasLiveSignal } = input;
  const table = kind === 'reply' ? REPLY : POST;
  const tmpl = table[lang] ?? table.en;

  let body = place
    ? tmpl.withPlace.replace('{place}', placeLabel(place))
    : tmpl.noPlace;

  // Posts reference the source link; the place link is carried by the card +
  // the /places link below. Keep one primary URL to preserve length budget.
  const links: string[] = [];
  if (place) links.push(`${SITE}/places/${place.slug}`);
  else links.push(SITE);

  body = clamp(scrub(body));
  const text = `${body}\n\n${links.join(' ')}`;

  const cardUrl =
    place && hasLiveSignal
      ? `${SITE}/api/og/place/${place.slug}?lang=${lang}`
      : null;

  return { text, lang, cardUrl };
}

/** Exposed for tests / callers that want to validate copy. */
export function hasBannedLanguage(text: string): boolean {
  BANNED.lastIndex = 0;
  return BANNED.test(text);
}
