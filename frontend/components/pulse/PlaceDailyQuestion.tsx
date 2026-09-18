// kalma/frontend/components/pulse/PlaceDailyQuestion.tsx
//
// The daily question. One question, once a day, per place, answered in one tap.
//
// The design rule that matters here is RECIPROCITY: the instant you answer you
// see what your neighbours said. That single line is the entire incentive. It
// is why this is a question and not a form, why there is never a second
// question in the same visit, and why the result renders even for people who
// have not answered (reading the local result is itself a reason to come back).
//
// Identity follows the same rule as a field note (decided 2026-08-04): the
// chips are free to look at, and the tap opens sign-in. The login is a
// one-time cost, not a per-answer cost, which is what makes a daily habit
// possible at all.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { authFetch } from '@/lib/social/auth-fetch';
import { useAccount } from '@/hooks/useWallet';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { trackFunnel } from '@/lib/funnel';
import { useFunnelViewport } from '@/hooks/useFunnelViewport';
import { optionText, promptText, type PulseQuestion } from '@/lib/pulse/questions';

type Payload = {
  day: string;
  question: PulseQuestion;
  counts: Record<string, number>;
  total: number;
  answered: string | null;
};

const COPY: Record<string, {
  eyebrow: string;
  signingIn: string;
  note: string;
  thanks: string;
  nobody: string;
  feedsActivity: string;
  /** {total} people in {place} answered. {count} said {option}. */
  result: string;
}> = {
  en: {
    eyebrow: 'Question of the day',
    signingIn: 'Signing in…',
    note: 'One tap. Sign in happens here, once, and then it is just a tap every morning.',
    thanks: 'Thanks. Here is what your area said today.',
    nobody: 'You are the first to answer here today.',
    feedsActivity: 'This also tells the signals here who they should be warning.',
    result: "{total} people in {place} answered today. {count} said {option}.",
  },
  pt: {
    eyebrow: 'Pergunta do dia',
    signingIn: 'Entrando…',
    note: 'Um toque. Você entra aqui uma vez só, e depois é só um toque toda manhã.',
    thanks: 'Obrigado. Veja o que a sua região respondeu hoje.',
    nobody: 'Você é a primeira pessoa a responder aqui hoje.',
    feedsActivity: 'Isso também ensina os sinais daqui quem eles devem avisar.',
    result: "{total} pessoas em {place} responderam hoje. {count} disseram {option}.",
  },
  es: {
    eyebrow: 'Pregunta del día',
    signingIn: 'Iniciando sesión…',
    note: 'Un toque. Inicias sesión aquí una sola vez, y después es solo un toque cada mañana.',
    thanks: 'Gracias. Esto es lo que respondió tu zona hoy.',
    nobody: 'Eres la primera persona en responder aquí hoy.',
    feedsActivity: 'Esto también enseña a las señales de aquí a quién deben avisar.',
    result: "{total} personas en {place} respondieron hoy. {count} dijeron {option}.",
  },
  fr: {
    eyebrow: 'Question du jour',
    signingIn: 'Connexion…',
    note: 'Un geste. La connexion se fait ici, une seule fois, puis c\'est un geste chaque matin.',
    thanks: 'Merci. Voici ce que ta zone a répondu aujourd\'hui.',
    nobody: 'Tu es la première personne à répondre ici aujourd\'hui.',
    feedsActivity: 'Ça apprend aussi aux signaux d\'ici qui ils doivent alerter.',
    result: "{total} personnes à {place} ont répondu aujourd'hui. {count} ont dit {option}.",
  },
  de: {
    eyebrow: 'Frage des Tages',
    signingIn: 'Anmeldung…',
    note: 'Ein Tipp. Die Anmeldung passiert hier, einmalig, danach ist es jeden Morgen nur ein Tipp.',
    thanks: 'Danke. Das hat deine Gegend heute geantwortet.',
    nobody: 'Du bist heute die erste Person, die hier antwortet.',
    feedsActivity: 'Das zeigt den Signalen hier auch, wen sie warnen sollen.',
    result: "{total} Menschen in {place} haben heute geantwortet. {count} sagten {option}.",
  },
  zh: {
    eyebrow: '每日一问',
    signingIn: '登录中…',
    note: '一步完成。只需在这里登录一次，之后每天早上只要点一下。',
    thanks: '谢谢。这是你所在区域今天的回答。',
    nobody: '你是今天第一个在这里回答的人。',
    feedsActivity: '这也会告诉这里的信号，它们该提醒谁。',
    result: "今天 {place} 有 {total} 人回答。{count} 人选择了{option}。",
  },
};

export default function PlaceDailyQuestion({
  placeSlug,
  placeName,
}: {
  placeSlug: string;
  placeName: string;
}) {
  const { address } = useAccount();
  const { login } = usePrivy();
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = COPY[language] ?? COPY.en;

  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [feedsActivity, setFeedsActivity] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = address ? `?address=${address}` : '';
      const res = await fetch(`/api/places/${placeSlug}/pulse${qs}`);
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      /* the question is a bonus surface; never break the page for it */
    }
  }, [placeSlug, address]);

  useEffect(() => {
    void load();
  }, [load]);

  // `pulse_seen` is a mount counter (the question lazy-loads wherever the
  // reader is); `pulse_viewed` is the one that means it reached a screen.
  useEffect(() => {
    trackFunnel('pulse_seen', 'place', placeSlug);
  }, [placeSlug]);

  const pulseRef = useFunnelViewport<HTMLDivElement>('pulse_viewed', 'place', placeSlug);

  const send = useCallback(
    async (optionId: string, author: string) => {
      if (!data) return;
      setBusy(true);
      try {
        const res = await authFetch(`/api/places/${placeSlug}/pulse`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address: author, questionId: data.question.id, optionId }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          // A stale tab asked yesterday's question. Reload rather than explain.
          if (res.status === 409) void load();
          return;
        }
        trackFunnel('pulse_answered', 'place', placeSlug);
        setFeedsActivity(Boolean(payload?.feedsActivity));
        setData((prev) =>
          prev
            ? { ...prev, counts: payload.counts, total: payload.total, answered: payload.answered }
            : prev,
        );
      } catch {
        /* silent: the reader can tap again */
      } finally {
        setBusy(false);
      }
    },
    [data, placeSlug, load],
  );

  // Same replay pattern as the observation composer: hold the intent, open
  // Privy, finish the job when the address arrives.
  const runPending = useRef<() => void>(() => {});
  runPending.current = () => {
    if (!pending || !address) return;
    const option = pending;
    setPending(null);
    void send(option, address);
  };

  useEffect(() => {
    if (address && pending) runPending.current();
  }, [address, pending]);

  if (!data) return null;

  const { question, counts, total, answered } = data;
  const done = Boolean(answered);
  const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const leaderOption = leader ? question.options.find((o) => o.id === leader[0]) : undefined;

  function choose(optionId: string) {
    if (busy || done) return;
    if (!address) {
      setPending(optionId);
      login();
      return;
    }
    void send(optionId, address);
  }

  return (
    <div ref={pulseRef} style={{ ...neu.panelRaised, borderRadius: R.xl, padding: '16px 16px 14px' }}>
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
        {copy.eyebrow}
      </div>

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
        {promptText(question, language)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {question.options.map((o) => {
          const active = answered === o.id;
          const share = done && total > 0 ? Math.round(((counts[o.id] ?? 0) / total) * 100) : null;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              disabled={busy || done}
              aria-pressed={active}
              style={{
                minHeight: 48,
                padding: '6px 13px',
                borderRadius: R.pill,
                border: `1px solid ${active ? C.accent : C.divider}`,
                background: active ? `${C.accent}1F` : done ? C.surfaceSoft : 'transparent',
                color: active ? C.text : done ? C.textMuted : C.textMutedStrong,
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: active ? 800 : 700,
                cursor: busy || done ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {optionText(o, language)}
              {share !== null ? (
                <span style={{ marginLeft: 7, fontFamily: fonts.mono, fontSize: 11, opacity: 0.8 }}>
                  {share}%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* The reward. Never shown before answering: seeing the result is the
          thing being traded for the tap, and giving it away first removes the
          only reason to answer. */}
      {done ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.text, lineHeight: 1.5 }}>
            {copy.thanks}
          </div>
          {total > 1 && leaderOption ? (
            <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft, lineHeight: 1.5 }}>
              {copy.result
                .replace('{total}', String(total))
                .replace('{place}', placeName)
                .replace('{count}', String(leader?.[1] ?? 0))
                .replace('{option}', optionText(leaderOption, language).toLowerCase())}
            </div>
          ) : (
            <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
              {copy.nobody}
            </div>
          )}
          {feedsActivity ? (
            <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
              {copy.feedsActivity}
            </div>
          ) : null}
        </div>
      ) : !address ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: fonts.sans,
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.5,
          }}
        >
          {pending ? copy.signingIn : copy.note}
        </div>
      ) : null}
    </div>
  );
}
