// kalma/frontend/components/social/ObservationFeed.tsx
//
// CW-1: the per-location "what are you seeing?" feed — the Tier-1 read layer.
// People on the ground report what they observe (river's high, frost last
// night, roads dry); reading it makes the signal trustworthy enough to act on.
//
// Reads are public (anon SELECT on visible signal_posts). Writes go through the
// service-role API routes (/api/observations [+ /report]) which enforce the
// link block, length, rate limit and flag-hide (CW-5). Plain text only.

'use client';

import Link from 'next/link';
import { authFetch } from '@/lib/social/auth-fetch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from '@/hooks/useWallet';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { getMarketSignals, getPlaceSignals } from '@/lib/social/signals';
import { trackFunnel } from '@/lib/funnel';
import { useFunnelViewport } from '@/hooks/useFunnelViewport';
import type { SignalPost } from '@/lib/social/types';
import {
  FIELD_REPORT_GROUPS,
  subtypesForGroup,
  subtypeLabel,
  severityLabel,
  type FieldReportGroupId,
  type FieldReportSeverity,
} from '@/lib/field-reports/taxonomy';

const MAX = 280;

// FR-1 composer micro-copy (kept local; the report taxonomy itself is in
// lib/field-reports/taxonomy.ts). Stable IDs render via those helpers.
const FR_UI: Record<string, { pick: string; detail: string; severity: string; sevHint: string }> = {
  en: { pick: 'What are you seeing?', detail: 'Add detail (optional)', severity: 'How serious?', sevHint: 'optional' },
  pt: { pick: 'O que você está vendo?', detail: 'Adicionar detalhe (opcional)', severity: 'Quão grave?', sevHint: 'opcional' },
  es: { pick: '¿Qué estás viendo?', detail: 'Añadir detalle (opcional)', severity: '¿Qué tan grave?', sevHint: 'opcional' },
  fr: { pick: 'Que vois-tu ?', detail: 'Ajouter un détail (optionnel)', severity: 'Quelle gravité ?', sevHint: 'optionnel' },
  de: { pick: 'Was siehst du?', detail: 'Detail hinzufügen (optional)', severity: 'Wie ernst?', sevHint: 'optional' },
  zh: { pick: '你看到了什么？', detail: '添加细节（可选）', severity: '严重程度？', sevHint: '可选' },
};
const SEVERITIES: FieldReportSeverity[] = ['low', 'medium', 'high'];

function copyFor(language: string) {
  const t: Record<string, {
    title: string; placeholder: string; post: string; posting: string;
    empty: string; you: string; report: string; reported: string; someone: string; now: string;
    fieldNote: string; noteSingular: string; notePlural: string; shareHint: string;
    stillHere: string; gone: string; confirmed: string; fading: string; lastSeen: string;
    localPattern: string; reportsOf: string; answerQuestion: string; createSignal: string; shareAlert: string;
  }> = {
    en: { title: 'What are you seeing?', placeholder: 'River up, frost last night, roads dry…', post: 'Share', posting: 'Sharing…', empty: 'No local notes yet. Be the first to share what you’re seeing.', you: 'you', report: 'Flag', reported: 'Flagged', someone: 'Someone', now: 'just now', fieldNote: 'Field note', noteSingular: '1 local note', notePlural: 'local notes', shareHint: 'Short, practical notes help others decide what to do next.', stillHere: 'Still here', gone: 'Gone', confirmed: 'confirmed', fading: 'fading', lastSeen: 'last seen', localPattern: 'Local pattern', reportsOf: 'reports of', answerQuestion: 'Answer question', createSignal: 'Add your city', shareAlert: 'Share alert' },
    pt: { title: 'O que você está vendo?', placeholder: 'Rio subindo, geada ontem, estradas secas…', post: 'Compartilhar', posting: 'Enviando…', empty: 'Ainda sem notas locais. Seja o primeiro a compartilhar o que está vendo.', you: 'você', report: 'Sinalizar', reported: 'Sinalizado', someone: 'Alguém', now: 'agora', fieldNote: 'Nota de campo', noteSingular: '1 nota local', notePlural: 'notas locais', shareHint: 'Notas curtas e práticas ajudam outras pessoas a decidir o próximo passo.', stillHere: 'Ainda está', gone: 'Não está mais', confirmed: 'confirmado', fading: 'perdendo força', lastSeen: 'visto há', localPattern: 'Padrão local', reportsOf: 'relatos de', answerQuestion: 'Responder pergunta', createSignal: 'Adicionar sua cidade', shareAlert: 'Compartilhar alerta' },
    es: { title: '¿Qué estás viendo?', placeholder: 'Río crecido, helada anoche, caminos secos…', post: 'Compartir', posting: 'Enviando…', empty: 'Aún sin notas locales. Sé el primero en compartir lo que ves.', you: 'tú', report: 'Reportar', reported: 'Reportado', someone: 'Alguien', now: 'ahora', fieldNote: 'Nota de campo', noteSingular: '1 nota local', notePlural: 'notas locales', shareHint: 'Las notas cortas y prácticas ayudan a los demás a decidir el siguiente paso.', stillHere: 'Sigue ahí', gone: 'Ya no está', confirmed: 'confirmado', fading: 'se desvanece', lastSeen: 'visto hace', localPattern: 'Patrón local', reportsOf: 'reportes de', answerQuestion: 'Responder pregunta', createSignal: 'Añade tu ciudad', shareAlert: 'Compartir alerta' },
    fr: { title: 'Que vois-tu ?', placeholder: 'Rivière en crue, gel cette nuit, routes sèches…', post: 'Partager', posting: 'Envoi…', empty: 'Pas encore de notes locales. Sois le premier à partager ce que tu vois.', you: 'toi', report: 'Signaler', reported: 'Signalé', someone: 'Quelqu’un', now: "à l'instant", fieldNote: 'Note terrain', noteSingular: '1 note locale', notePlural: 'notes locales', shareHint: 'Des notes courtes et concrètes aident les autres à décider du prochain geste.', stillHere: 'Toujours là', gone: 'Plus là', confirmed: 'confirmé', fading: 's’atténue', lastSeen: 'vu il y a', localPattern: 'Schéma local', reportsOf: 'relevés de', answerQuestion: 'Répondre', createSignal: 'Ajouter ta ville', shareAlert: 'Partager l’alerte' },
    de: { title: 'Was siehst du?', placeholder: 'Fluss steigt, Frost letzte Nacht, Straßen trocken…', post: 'Teilen', posting: 'Senden…', empty: 'Noch keine lokalen Notizen. Sei die erste Person, die teilt, was du siehst.', you: 'du', report: 'Melden', reported: 'Gemeldet', someone: 'Jemand', now: 'gerade eben', fieldNote: 'Feldnotiz', noteSingular: '1 lokale Notiz', notePlural: 'lokale Notizen', shareHint: 'Kurze, praktische Notizen helfen anderen beim nächsten Schritt.', stillHere: 'Noch da', gone: 'Nicht mehr da', confirmed: 'bestätigt', fading: 'wird schwächer', lastSeen: 'gesehen vor', localPattern: 'Lokales Muster', reportsOf: 'Meldungen zu', answerQuestion: 'Frage beantworten', createSignal: 'Stadt hinzufügen', shareAlert: 'Warnung teilen' },
    zh: { title: '你看到了什么？', placeholder: '河水上涨、昨夜结霜、道路干燥…', post: '分享', posting: '发送中…', empty: '还没有本地笔记。成为第一个分享你所见的人。', you: '你', report: '举报', reported: '已举报', someone: '某人', now: '刚刚', fieldNote: '现场笔记', noteSingular: '1 条本地笔记', notePlural: '条本地笔记', shareHint: '简短、具体的现场笔记能帮助其他人决定下一步。', stillHere: '仍然存在', gone: '已经消失', confirmed: '已确认', fading: '正在减弱', lastSeen: '上次看到', localPattern: '本地趋势', reportsOf: '条报告关于', answerQuestion: '回答问题', createSignal: '添加你的城市', shareAlert: '分享警示' },
  };
  return t[language] ?? t.en;
}

// The ask. An empty box labelled "What are you seeing?" is not a question, it
// is a form field, and it sat next to a login wall for months while five notes
// came in. When the caller knows which signal is live here, lead with a
// question that already contains it: the reader has just read the signal above,
// so the composer's job is to ask them to check it against their own field.
//
// Keyed by risk family rather than by signal type, so the seven engine types
// collapse to five asks. Water recovery is deliberately its own family: it is
// the one signal that is good news, and asking "are you seeing this damage?"
// about it would read as nonsense.
type AskFamily = 'dry' | 'water' | 'rain' | 'heat' | 'cold';

const ASK_FAMILY: Record<string, AskFamily> = {
  dry_stretch_window: 'dry',
  water_recovery_signal: 'water',
  rainfall_risk_rising: 'rain',
  heavy_rain_event: 'rain',
  heat_stress_window: 'heat',
  consecutive_cold_below: 'cold',
  frost_risk: 'cold',
};

const ASK_COPY: Record<AskFamily, Record<string, string>> = {
  dry: {
    en: 'A dry stretch is forming here. Are you seeing it on the ground?',
    pt: 'Um período seco está se formando aqui. Você está vendo isso no campo?',
    es: '¿Se está formando una racha seca aquí. Lo estás viendo en el campo?',
    fr: 'Une période sèche se forme ici. Le vois-tu sur le terrain ?',
    de: 'Hier bildet sich eine Trockenphase. Siehst du das vor Ort?',
    zh: '这里正在形成干旱期。你在现场看到了吗？',
  },
  water: {
    en: 'Water conditions look like they are recovering here. Does that match what you see?',
    pt: 'A água parece estar voltando por aqui. Bate com o que você vê?',
    es: 'Las condiciones de agua parecen estar mejorando aquí. ¿Coincide con lo que ves?',
    fr: "Les conditions d'eau semblent s'améliorer ici. Est-ce que ça correspond à ce que tu vois ?",
    de: 'Die Wasserlage scheint sich hier zu erholen. Passt das zu dem, was du siehst?',
    zh: '这里的水情看起来正在恢复。和你看到的一致吗？',
  },
  rain: {
    en: 'Heavy rain is building here. What does it look like where you are?',
    pt: 'Chuva forte está a caminho daqui. Como está aí?',
    es: 'Se está formando lluvia fuerte aquí. ¿Cómo está donde tú estás?',
    fr: 'De fortes pluies se préparent ici. À quoi ça ressemble chez toi ?',
    de: 'Hier baut sich Starkregen auf. Wie sieht es bei dir aus?',
    zh: '这里正在形成强降雨。你那边情况如何？',
  },
  heat: {
    en: 'A heat window is forming here. How is it holding up on the ground?',
    pt: 'Um período de calor forte está chegando aqui. Como está aguentando aí?',
    es: 'Se está formando una ventana de calor aquí. ¿Cómo va en el campo?',
    fr: 'Une fenêtre de chaleur se forme ici. Comment ça tient sur le terrain ?',
    de: 'Hier bildet sich ein Hitzefenster. Wie hält es sich vor Ort?',
    zh: '这里正在形成高温窗口。现场情况如何？',
  },
  cold: {
    en: 'Cold nights are coming here. Did it reach your area?',
    pt: 'Noites frias estão chegando aqui. Já sentiu aí?',
    es: 'Vienen noches frías aquí. ¿Llegó a tu zona?',
    fr: 'Des nuits froides arrivent ici. Est-ce que ça a atteint ta zone ?',
    de: 'Hier kommen kalte Nächte. Hat es deine Gegend erreicht?',
    zh: '这里将迎来寒冷的夜晚。到你那边了吗？',
  },
};

function askFor(signalTypeId: string | undefined, language: string): string | null {
  if (!signalTypeId) return null;
  const family = ASK_FAMILY[signalTypeId];
  if (!family) return null;
  const table = ASK_COPY[family];
  return table[language] ?? table.en;
}

// Deferred-auth copy. Kept out of copyFor()'s single-line table, which is
// already at the edge of readable.
//
// The note is a promise about what the Share button will do, not a wall in
// front of it: the reader has an open composer above this line, so the only
// thing left to say is that identity is asked for once, at the end, and why
// that is worth a tap.
const AUTH_COPY: Record<string, { note: string; signingIn: string }> = {
  en: {
    note: 'Sign in happens when you share, in one tap. Your notes then carry your name and count on the board.',
    signingIn: 'Signing in…',
  },
  pt: {
    note: 'Você entra na hora de compartilhar, num toque. Suas notas passam a levar seu nome e contam no ranking.',
    signingIn: 'Entrando…',
  },
  es: {
    note: 'Inicias sesión al compartir, en un toque. Tus notas llevan tu nombre y cuentan en la tabla.',
    signingIn: 'Iniciando sesión…',
  },
  fr: {
    note: 'La connexion se fait au moment de partager, en un geste. Tes notes portent alors ton nom et comptent au classement.',
    signingIn: 'Connexion…',
  },
  de: {
    note: 'Die Anmeldung passiert beim Teilen, mit einem Tipp. Deine Notizen tragen dann deinen Namen und zählen im Ranking.',
    signingIn: 'Anmeldung…',
  },
  zh: {
    note: '分享时才登录，一步完成。之后你的笔记会署上你的名字并计入排行榜。',
    signingIn: '登录中…',
  },
};

function authCopyFor(language: string) {
  return AUTH_COPY[language] ?? AUTH_COPY.en;
}

// Sign-in and network failure copy for postObservation's error state. The
// API (lib/server/privy-auth.ts) returns a stable `error` code plus an
// English `message` meant as a log-line fallback, not UI text; this table is
// what actually renders, in the reader's language, in plain words (Golden
// Rule 1: no "auth token", no "wallet", no backend vocabulary). Three
// buckets cover all five backend codes: sign-in died and needs redoing,
// this account does not match (rare, wrong linked wallet), or a plain retry
// covers everything else, including a dropped network request.
const ERROR_COPY: Record<string, { signInExpired: string; accountMismatch: string; tryAgain: string }> = {
  en: {
    signInExpired: 'Your sign-in expired. Sign in again to share.',
    accountMismatch: "This account doesn't match. Sign in again.",
    tryAgain: 'Something went wrong. Try again in a moment.',
  },
  pt: {
    signInExpired: 'Sua sessão expirou. Entre de novo para compartilhar.',
    accountMismatch: 'Essa conta não confere. Entre de novo.',
    tryAgain: 'Algo deu errado. Tente de novo em instantes.',
  },
  es: {
    signInExpired: 'Tu sesión expiró. Inicia sesión de nuevo para compartir.',
    accountMismatch: 'Esta cuenta no coincide. Inicia sesión de nuevo.',
    tryAgain: 'Algo salió mal. Intenta de nuevo en un momento.',
  },
  fr: {
    signInExpired: 'Ta connexion a expiré. Reconnecte-toi pour partager.',
    accountMismatch: 'Ce compte ne correspond pas. Reconnecte-toi.',
    tryAgain: "Un problème est survenu. Réessaie dans un instant.",
  },
  de: {
    signInExpired: 'Deine Anmeldung ist abgelaufen. Melde dich erneut an, um zu teilen.',
    accountMismatch: 'Dieses Konto passt nicht. Melde dich erneut an.',
    tryAgain: 'Etwas ist schiefgelaufen. Versuch es gleich noch einmal.',
  },
  zh: {
    signInExpired: '登录已过期，请重新登录后分享。',
    accountMismatch: '账号对不上，请重新登录。',
    tryAgain: '出了点问题，请稍后再试。',
  },
};

function errorCopyFor(language: string) {
  return ERROR_COPY[language] ?? ERROR_COPY.en;
}

/** Maps the API's stable error code to on-brand, localised UI text. Never
 * shows the backend's raw `message` (English-only, written for logs). */
function shareErrorMessage(errorCode: string | undefined, copy: ReturnType<typeof errorCopyFor>): string {
  switch (errorCode) {
    case 'unauthenticated':
    case 'bad_token':
      return copy.signInExpired;
    case 'wallet_mismatch':
      return copy.accountMismatch;
    default:
      return copy.tryAgain;
  }
}

// An action the reader asked for before they had an account. Held while the
// Privy modal is open and replayed the moment an address exists, so signing in
// finishes the job the reader started instead of dumping them back on a form
// they have to fill again.
type PendingAction =
  | { kind: 'post' }
  | { kind: 'react'; signalId: string; reaction: 'still_here' | 'gone' }
  | { kind: 'flag'; signalId: string };

function initialsForAuthor(name: string) {
  const clean = name.replace(/^@/, '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || clean.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string, nowLabel: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return nowLabel;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function authorName(p: SignalPost, fallback: string): string {
  const a = p.author;
  if (a?.display_name) return a.display_name;
  if (a?.handle) return `@${a.handle}`;
  const w = a?.wallet_address;
  if (w) return `${w.slice(0, 6)}…${w.slice(-4)}`;
  return fallback;
}

function freshnessLabel(p: SignalPost, copy: ReturnType<typeof copyFor>): string {
  const counts = p.reaction_counts;
  const still = counts?.still_here ?? 0;
  const gone = counts?.gone ?? 0;
  const lastSeen = counts?.last_confirmed_at ?? p.created_at;
  const age = timeAgo(lastSeen, copy.now);
  if (gone > still && gone > 0) return `${copy.fading} · ${gone} ${copy.gone.toLowerCase()}`;
  if (still > 0) return `${still} ${copy.confirmed} · ${copy.lastSeen} ${age}`;
  return `${copy.lastSeen} ${timeAgo(p.created_at, copy.now)}`;
}

type ReportCluster = {
  category: string;
  count: number;
  confirmed: number;
  gone: number;
  lastSeen: string;
  severity: FieldReportSeverity | null;
};

function buildReportClusters(posts: SignalPost[]): ReportCluster[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const clusters = new Map<string, ReportCluster>();
  for (const post of posts) {
    if (!post.category || new Date(post.created_at).getTime() < cutoff) continue;
    const current = clusters.get(post.category) ?? {
      category: post.category,
      count: 0,
      confirmed: 0,
      gone: 0,
      lastSeen: post.created_at,
      severity: null,
    };
    current.count += 1;
    current.confirmed += post.reaction_counts?.still_here ?? 0;
    current.gone += post.reaction_counts?.gone ?? 0;
    const lastConfirmed = post.reaction_counts?.last_confirmed_at;
    const lastSeen = lastConfirmed && lastConfirmed > post.created_at ? lastConfirmed : post.created_at;
    if (lastSeen > current.lastSeen) current.lastSeen = lastSeen;
    if (post.severity === 'high' || (post.severity === 'medium' && current.severity !== 'high')) {
      current.severity = post.severity;
    } else if (post.severity === 'low' && !current.severity) {
      current.severity = post.severity;
    }
    clusters.set(post.category, current);
  }
  return [...clusters.values()]
    .filter((cluster) => cluster.count >= 2 && cluster.confirmed >= cluster.gone)
    .sort((a, b) => b.count + b.confirmed - (a.count + a.confirmed))
    .slice(0, 2);
}

export default function ObservationFeed({
  marketId,
  placeId,
  highlighted = false,
  title,
  emptyCopy,
  signalTypeId,
  placeSlug,
}: {
  marketId?: number;
  placeId?: string;
  highlighted?: boolean;
  title?: string;
  emptyCopy?: string;
  /** Slug for funnel counters only; the feed itself reads by placeId. */
  placeSlug?: string;
  /**
   * Engine signal type live at this place (e.g. 'dry_stretch_window'). When
   * given, the composer leads with a question about that signal instead of an
   * unlabelled text box. Localised here rather than passed in as a string so
   * EN-canonical server pages (/places/[slug]) can hand over the id and still
   * have the reader see their own language.
   */
  signalTypeId?: string;
}) {
  const { address } = useAccount();
  const { login } = usePrivy();
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = copyFor(language);
  const authCopy = authCopyFor(language);
  const errorCopy = errorCopyFor(language);
  const ask = askFor(signalTypeId, language);

  const [posts, setPosts] = useState<SignalPost[]>([]);
  const [text, setText] = useState('');
  const [group, setGroup] = useState<FieldReportGroupId | null>(null);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [severity, setSeverity] = useState<FieldReportSeverity | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reacted, setReacted] = useState<Record<string, 'still_here' | 'gone'>>({});
  // Held while the Privy modal is open; replayed once an address exists.
  const [pending, setPending] = useState<PendingAction | null>(null);

  // Funnel counters (supabase/migrations/20260804_funnel_events.sql).
  // `composer_seen` fires on mount, which means the page loaded and this
  // component hydrated, NOT that anyone saw it: the lazy wrapper is a plain
  // dynamic import with no viewport gate. `composer_viewed` is the one that
  // means the ask reached a reader. Keep both: viewed/seen is how far down the
  // page people actually get.
  const surface: 'place' | 'market' = marketId != null ? 'market' : 'place';
  const engagedOnce = useRef(false);
  const noteEngagement = useCallback(() => {
    if (engagedOnce.current) return;
    engagedOnce.current = true;
    trackFunnel('composer_engaged', surface, placeSlug);
  }, [surface, placeSlug]);

  useEffect(() => {
    trackFunnel('composer_seen', surface, placeSlug);
  }, [surface, placeSlug]);

  const composerRef = useFunnelViewport<HTMLDivElement>('composer_viewed', surface, placeSlug);

  const load = useCallback(async () => {
    const rows = marketId != null ? await getMarketSignals(marketId, 20) : placeId ? await getPlaceSignals(placeId, 20) : [];
    setPosts(rows);
  }, [marketId, placeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep community intel current without a manual reload: refetch every
  // minute while the tab is visible, and immediately when it regains focus
  // (people check back after stepping outside — that's the freshest moment).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  // FR-1: send the canonical subtype id + severity as structured fields; the
  // free text is just the optional note (raw_text). A report needs either a
  // chosen subtype or some note text.
  //
  // Composing needs no account. Committing does. `canSubmit` therefore ignores
  // `address` entirely: the Share button is live for a signed-out reader, and
  // pressing it opens Privy instead of failing.
  const detail = text.trim();
  const canSubmit = (Boolean(subtype) || detail.length > 0) && detail.length <= MAX && !posting;
  // Separate from canSubmit so the *rule* stays honest: the draft is submittable
  // while the Privy modal is open, it just must not be re-armed by a second tap.
  const awaitingSignIn = pending?.kind === 'post';

  async function postObservation(author: string) {
    setPosting(true);
    setError(null);
    try {
      const res = await authFetch('/api/observations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: author,
          text: detail,
          category: subtype ?? undefined,
          severity: severity ?? undefined,
          marketId: marketId ?? null,
          placeId: placeId ?? null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(shareErrorMessage(payload?.error, errorCopy));
        return;
      }
      if (payload?.signal) setPosts((prev) => [payload.signal as SignalPost, ...prev]);
      trackFunnel('observation_created', surface, placeSlug);
      setText('');
      setGroup(null);
      setSubtype(null);
      setSeverity(null);
    } catch {
      setError(errorCopy.tryAgain);
    } finally {
      setPosting(false);
    }
  }

  function submit() {
    if (!canSubmit || awaitingSignIn) return;
    // The draft is already in state and stays on screen through the modal, so
    // signing in costs the reader nothing they have typed.
    if (!address) {
      trackFunnel('share_pressed_signed_out', surface, placeSlug);
      setPending({ kind: 'post' });
      login();
      return;
    }
    trackFunnel('share_pressed_signed_in', surface, placeSlug);
    void postObservation(address);
  }

  async function sendFlag(signalId: string, author: string) {
    if (reported.has(signalId)) return;
    setReported((prev) => new Set(prev).add(signalId));
    try {
      await authFetch('/api/observations/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: author, signalId, reason: 'flagged' }),
      });
    } catch {
      /* optimistic — leave flagged */
    }
  }

  function report(signalId: string) {
    if (reported.has(signalId)) return;
    if (!address) {
      setPending({ kind: 'flag', signalId });
      login();
      return;
    }
    void sendFlag(signalId, address);
  }

  async function sendReaction(signalId: string, reaction: 'still_here' | 'gone', author: string) {
    setReacted((prev) => ({ ...prev, [signalId]: reaction }));
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== signalId) return p;
        const current = p.reaction_counts ?? { still_here: 0, gone: 0, last_confirmed_at: null };
        const previous = reacted[signalId];
        const next = {
          still_here: Math.max(0, current.still_here + (reaction === 'still_here' ? 1 : 0) - (previous === 'still_here' ? 1 : 0)),
          gone: Math.max(0, current.gone + (reaction === 'gone' ? 1 : 0) - (previous === 'gone' ? 1 : 0)),
          last_confirmed_at:
            reaction === 'still_here'
              ? new Date().toISOString()
              : previous === 'still_here'
                ? current.last_confirmed_at
                : current.last_confirmed_at,
        };
        return { ...p, reaction_counts: next };
      }),
    );
    try {
      await authFetch('/api/observations/react', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: author, signalId, reaction }),
      });
    } catch {
      /* optimistic — next feed refresh will reconcile */
    }
  }

  function react(signalId: string, reaction: 'still_here' | 'gone') {
    if (!address) {
      setPending({ kind: 'react', signalId, reaction });
      login();
      return;
    }
    void sendReaction(signalId, reaction, address);
  }

  // Finish what the reader started. The handler lives in a ref so the effect
  // can depend on `address` and `pending` alone: putting the senders in the
  // dependency array would re-run this on every render, and leaving them out
  // would replay a stale draft.
  const runPending = useRef<() => void>(() => {});
  runPending.current = () => {
    if (!pending || !address) return;
    const action = pending;
    setPending(null);
    // The step that reads the bet: everyone who reached here came back from
    // the Privy modal. share_pressed_signed_out minus this is the drop-off.
    if (action.kind === 'post') {
      trackFunnel('signin_completed', surface, placeSlug);
      void postObservation(address);
    }
    else if (action.kind === 'react') void sendReaction(action.signalId, action.reaction, address);
    else void sendFlag(action.signalId, address);
  };

  useEffect(() => {
    if (address && pending) runPending.current();
  }, [address, pending]);

  async function shareCluster(cluster: ReportCluster) {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const text = `${copy.localPattern}: ${cluster.count} ${copy.reportsOf} ${subtypeLabel(cluster.category, language)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Kalma', text, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
    } catch {
      /* user cancelled or clipboard unavailable */
    }
  }

  const over = text.length > MAX;
  const frUi = FR_UI[language] ?? FR_UI.en;
  const notesLabel =
    posts.length === 1 ? copy.noteSingular : `${posts.length} ${copy.notePlural}`;
  const clusters = useMemo(() => buildReportClusters(posts), [posts]);

  return (
    <div
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px 16px 14px',
        border: highlighted ? `1px solid ${C.accent}55` : undefined,
        background: highlighted ? `${C.surfaceHigh}F2` : undefined,
        boxShadow: highlighted
          ? `0 12px 30px ${C.shadowA}35, inset 1px 1px 0 ${C.shadowB}25`
          : undefined,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          marginBottom: 12,
        }}
      >
        {title ?? copy.title}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '4px 8px',
            borderRadius: R.pill,
            border: `1px solid ${C.divider}`,
            background: highlighted ? `${C.accent}14` : C.surfaceSoft,
            color: highlighted ? C.text : C.textMutedStrong,
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {posts.length > 0 ? notesLabel : copy.fieldNote}
        </span>
        <span
          style={{
            fontFamily: fonts.sans,
            fontSize: 12,
            lineHeight: 1.45,
            color: C.textMuted,
          }}
        >
          {copy.shareHint}
        </span>
      </div>

      {clusters.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {clusters.map((cluster) => {
            const tone = cluster.severity === 'high' ? C.below : cluster.severity === 'medium' ? C.accent : C.above;
            return (
              <div
                key={cluster.category}
                style={{
                  borderRadius: R.md,
                  border: `1px solid ${tone}55`,
                  background: `${tone}12`,
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: tone,
                  }}
                >
                  {copy.localPattern}
                </div>
                <div style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 800, color: C.text }}>
                  {cluster.count} {copy.reportsOf} {subtypeLabel(cluster.category, language)}
                </div>
                <div style={{ fontFamily: fonts.mono, fontSize: 10, color: C.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {cluster.confirmed > 0 ? `${cluster.confirmed} ${copy.confirmed} · ` : ''}
                  {copy.lastSeen} {timeAgo(cluster.lastSeen, copy.now)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {marketId != null ? (
                    <Link
                      href={`/markets/${marketId}`}
                      style={{
                        minHeight: 48,
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '6px 14px',
                        borderRadius: R.pill,
                        background: C.accent,
                        color: C.bg,
                        fontFamily: fonts.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        textDecoration: 'none',
                      }}
                    >
                      {copy.answerQuestion}
                    </Link>
                  ) : (
                    <Link
                      href="/create"
                      style={{
                        minHeight: 48,
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '6px 14px',
                        borderRadius: R.pill,
                        background: C.accent,
                        color: C.bg,
                        fontFamily: fonts.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        textDecoration: 'none',
                      }}
                    >
                      {copy.createSignal}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => shareCluster(cluster)}
                    style={{
                      minHeight: 48,
                      padding: '6px 14px',
                      borderRadius: R.pill,
                      border: `1px solid ${C.divider}`,
                      background: 'transparent',
                      color: C.textMutedStrong,
                      fontFamily: fonts.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {copy.shareAlert}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* The composer is never gated. It used to render only for connected
          addresses, with a login wall in its place, and the product collected
          five field notes in its whole history. Reading, choosing a category
          and typing now cost nothing; the account is asked for once, when
          Share is pressed, and the draft survives the modal. */}
      <div ref={composerRef} style={{ marginBottom: 14 }}>
          {ask ? (
            <div
              style={{
                fontFamily: fonts.display,
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.3,
                color: C.text,
                marginBottom: 12,
              }}
            >
              {ask}
            </div>
          ) : null}

          {/* FR-1 — category chips lead; free text is optional detail below.
              Groups → subtypes → optional severity. */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FIELD_REPORT_GROUPS.map((g) => {
                const active = group === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      noteEngagement();
                      setGroup(active ? null : g.id);
                      setSubtype(null);
                    }}
                    aria-pressed={active}
                    style={{
                      minHeight: 48,
                      padding: '5px 11px',
                      borderRadius: R.pill,
                      border: `1px solid ${active ? C.accent : C.divider}`,
                      background: active ? `${C.accent}1A` : 'transparent',
                      color: active ? C.text : C.textMutedStrong,
                      fontFamily: fonts.sans,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {g.label[(language as 'en')] ?? g.label.en}
                  </button>
                );
              })}
            </div>

            {group ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {subtypesForGroup(group).map((s) => {
                  const active = subtype === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSubtype(active ? null : s.id)}
                      aria-pressed={active}
                      style={{
                        minHeight: 48,
                        padding: '4px 10px',
                        borderRadius: R.pill,
                        border: `1px solid ${active ? C.accent : C.divider}`,
                        background: active ? C.accent : C.surfaceSoft,
                        color: active ? C.bg : C.textSoft,
                        fontFamily: fonts.sans,
                        fontSize: 12,
                        fontWeight: active ? 800 : 600,
                        cursor: 'pointer',
                      }}
                    >
                      {subtypeLabel(s.id, language)}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {subtype ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: C.textMuted }}>
                  {frUi.severity}
                </span>
                {SEVERITIES.map((sv) => {
                  const active = severity === sv;
                  const tone = sv === 'high' ? C.below : sv === 'medium' ? C.accent : C.above;
                  return (
                    <button
                      key={sv}
                      type="button"
                      onClick={() => setSeverity(active ? null : sv)}
                      aria-pressed={active}
                      style={{
                        minHeight: 48,
                        padding: '3px 10px',
                        borderRadius: R.pill,
                        border: `1px solid ${active ? tone : C.divider}`,
                        background: active ? `${tone}22` : 'transparent',
                        color: active ? C.text : C.textMuted,
                        fontFamily: fonts.sans,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {severityLabel(sv, language)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <textarea
            value={text}
            onChange={(e) => {
              noteEngagement();
              setText(e.target.value);
            }}
            aria-label={subtype ? frUi.detail : frUi.pick}
            placeholder={subtype ? frUi.detail : copy.placeholder}
            rows={2}
            maxLength={MAX + 40}
            style={{
              ...neu.controlPressed,
              width: '100%',
              boxSizing: 'border-box',
              resize: 'none',
              border: 'none',
              borderRadius: R.md,
              padding: '10px 12px',
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.text,
              background: C.surfaceDeep,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 11, color: over ? C.below : C.textMuted }}>
              {text.length}/{MAX}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || awaitingSignIn}
              style={{
                ...neu.controlRaised,
                border: 'none',
                borderRadius: R.md,
                minHeight: 48,
                padding: '9px 18px',
                background: C.accent,
                color: C.bg,
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 800,
                cursor: !canSubmit || awaitingSignIn ? 'default' : 'pointer',
                opacity: !canSubmit || awaitingSignIn ? 0.55 : 1,
              }}
            >
              {posting ? copy.posting : awaitingSignIn ? authCopy.signingIn : copy.post}
            </button>
          </div>
          {error ? (
            <div style={{ marginTop: 6, fontFamily: fonts.sans, fontSize: 12, color: C.below }}>{error}</div>
          ) : null}

          {/* One quiet line, below the composer rather than in front of it: by
              the time the reader gets here they have already seen an open box,
              so this reads as what Share will do, not as a door. */}
          {!address ? (
            <div
              style={{
                marginTop: 10,
                fontFamily: fonts.sans,
                fontSize: 12,
                color: C.textMuted,
                lineHeight: 1.5,
              }}
            >
              {authCopy.note}
            </div>
          ) : null}
        </div>

      {posts.length === 0 ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: highlighted ? 14 : 13,
            color: highlighted ? C.textSoft : C.textMuted,
            lineHeight: 1.5,
          }}
        >
          {emptyCopy ?? copy.empty}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            // auto-fit collapses to 1 column on a narrow card and opens up
            // to 3 on a wide one (no media query needed, inline styles
            // only): this is the fix for notes reading as one cramped
            // column when the space for 3 is right there on desktop.
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            alignItems: 'start',
            gap: 12,
          }}
        >
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                borderTop: `1px solid ${C.divider}40`,
                paddingTop: 10,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: highlighted ? `${C.accent}18` : C.surfaceSoft,
                      border: `1px solid ${C.divider}`,
                      color: highlighted ? C.accent : C.textMutedStrong,
                      fontFamily: fonts.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}
                  >
                    {initialsForAuthor(authorName(p, copy.someone))}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 700, color: C.text, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {authorName(p, copy.someone)}
                    </span>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 10,
                        color: C.textMuted,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {copy.fieldNote}
                    </span>
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: fonts.mono, fontSize: 11, color: C.textMuted }}>{timeAgo(p.created_at, copy.now)}</span>
                  {/* Shown to everyone: clicking signs in, then flags. */}
                  <button
                      type="button"
                      onClick={() => report(p.id)}
                      disabled={reported.has(p.id)}
                      style={{
                        border: 'none',
                        background: 'none',
                        cursor: reported.has(p.id) ? 'default' : 'pointer',
                        minHeight: 48,
                        minWidth: 48,
                        padding: '12px 8px',
                        margin: '-12px -8px',
                        fontFamily: fonts.mono,
                        fontSize: 10,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: reported.has(p.id) ? C.textMuted : C.textMutedStrong,
                      }}
                    >
                      {reported.has(p.id) ? copy.reported : copy.report}
                    </button>
                </span>
              </div>
              {p.category ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: R.pill,
                      border: `1px solid ${C.divider}`,
                      background: C.surfaceSoft,
                      fontFamily: fonts.sans,
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  >
                    {subtypeLabel(p.category, language)}
                  </span>
                  {p.severity ? (
                    (() => {
                      const tone = p.severity === 'high' ? C.below : p.severity === 'medium' ? C.accent : C.above;
                      return (
                        <span
                          style={{
                            padding: '3px 9px',
                            borderRadius: R.pill,
                            border: `1px solid ${tone}`,
                            background: `${tone}22`,
                            fontFamily: fonts.mono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            color: C.text,
                          }}
                        >
                          {severityLabel(p.severity, language)}
                        </span>
                      );
                    })()
                  ) : null}
                </div>
              ) : null}
              {p.raw_text ? (
                <div
                  style={{
                    ...neu.subtle,
                    borderRadius: R.md,
                    padding: '10px 12px',
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    color: C.textSoft,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {p.raw_text}
                </div>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    color: C.textMuted,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {freshnessLabel(p, copy)}
                </span>
                {/* Corroboration is the highest-value action in the loop, so it
                    is the last thing that should sit behind a login wall. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(['still_here', 'gone'] as const).map((reaction) => {
                      const active = reacted[p.id] === reaction;
                      return (
                        <button
                          key={reaction}
                          type="button"
                          onClick={() => react(p.id, reaction)}
                          aria-pressed={active}
                          style={{
                            minHeight: 48,
                            padding: '6px 12px',
                            borderRadius: R.pill,
                            border: `1px solid ${active ? C.accent : C.divider}`,
                            background: active ? `${C.accent}1F` : 'transparent',
                            color: active ? C.text : C.textMutedStrong,
                            fontFamily: fonts.sans,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {reaction === 'still_here' ? copy.stillHere : copy.gone}
                        </button>
                      );
                    })}
                  </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
