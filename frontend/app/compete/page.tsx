//kalma/frontend/app/compete/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useAccount } from '@/hooks/useWallet';
import AppHeader from '@/components/shared/AppHeader';
import BottomNav from '@/components/design/BottomNav';

// ── Copy (terminology seam: warm, translatable labels over canonical data) ───
function competeCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Leaderboard', subtitle: 'Battle-test runs Jul 25 – Aug 15 on testnet',
      builders: 'Creators', predictors: 'Responders', observers: 'Observers',
      buildersTag: 'Open useful signals for places people watch', predictorsTag: 'Answer live questions with good local reading', observersTag: 'Share field reports people can confirm',
      creatorEarnings: 'Creator earnings', liquidity: 'Liquidity attracted', people: 'People drawn in',
      predictions: 'Answers', volume: 'Volume', accuracy: 'Accuracy', reputation: 'Credibility', reports: 'Reports', confirmed: 'Confirmed', useful: 'Useful', startsIn: 'Starts in', endsIn: 'Ends in',
      day: 'd', hour: 'h', min: 'm', notRanked: "You're not on the board yet.",
      addCity: 'Add your city', takePosition: 'Answer a live question', shareObservation: 'Share a field report', you: 'You',
      empty: 'No launch-window entries yet.', loading: 'Loading the board…',
      builtMarkets: 'signals opened', calledMarkets: 'answers', live: 'Starts Jul 25',
    },
    pt: {
      title: 'Ranking', subtitle: 'Battle-test de 25 de julho a 15 de agosto na testnet',
      builders: 'Criadores', predictors: 'Respondentes', observers: 'Observadores',
      buildersTag: 'Abra sinais úteis para lugares que as pessoas acompanham', predictorsTag: 'Responda sinais ao vivo com boa leitura local', observersTag: 'Compartilhe relatos de campo que outras pessoas confirmam',
      creatorEarnings: 'Ganhos do criador', liquidity: 'Liquidez atraída', people: 'Pessoas atraídas',
      predictions: 'Respostas', volume: 'Volume', accuracy: 'Acerto', reputation: 'Credibilidade', reports: 'Relatos', confirmed: 'Confirmados', useful: 'Úteis', startsIn: 'Começa em', endsIn: 'Termina em',
      day: 'd', hour: 'h', min: 'm', notRanked: 'Você ainda não está no ranking.',
      addCity: 'Adicionar sua cidade', takePosition: 'Responder um sinal ao vivo', shareObservation: 'Compartilhar relato', you: 'Você',
      empty: 'Ainda sem entradas da janela de lançamento.', loading: 'Carregando o ranking…',
      builtMarkets: 'sinais abertos', calledMarkets: 'respostas', live: 'Começa em 25 de julho',
    },
    es: {
      title: 'Ranking', subtitle: 'Battle-test del 25 de julio al 15 de agosto en testnet',
      builders: 'Creadores', predictors: 'Respondedores', observers: 'Observadores',
      buildersTag: 'Abre señales útiles para lugares que la gente sigue', predictorsTag: 'Responde preguntas en vivo con buena lectura local', observersTag: 'Comparte reportes de campo que otros puedan confirmar',
      creatorEarnings: 'Ganancias del creador', liquidity: 'Liquidez atraída', people: 'Personas atraídas',
      predictions: 'Respuestas', volume: 'Volumen', accuracy: 'Acierto', reputation: 'Credibilidad', reports: 'Reportes', confirmed: 'Confirmados', useful: 'Útiles', startsIn: 'Empieza en', endsIn: 'Termina en',
      day: 'd', hour: 'h', min: 'm', notRanked: 'Aún no estás en la tabla.',
      addCity: 'Añade tu ciudad', takePosition: 'Responder una pregunta en vivo', shareObservation: 'Compartir reporte', you: 'Tú',
      empty: 'Aún no hay entradas de la ventana de lanzamiento.', loading: 'Cargando la tabla…',
      builtMarkets: 'señales abiertas', calledMarkets: 'respuestas', live: 'Empieza el 25 de julio',
    },
    fr: {
      title: 'Classement', subtitle: 'Battle-test du 25 juillet au 15 août sur testnet',
      builders: 'Créateurs', predictors: 'Répondeurs', observers: 'Observateurs',
      buildersTag: 'Ouvrez des signaux utiles pour les lieux que les gens suivent', predictorsTag: 'Répondez aux questions en direct avec une bonne lecture locale', observersTag: 'Partagez des relevés terrain que les autres peuvent confirmer',
      creatorEarnings: 'Gains du créateur', liquidity: 'Liquidité attirée', people: 'Personnes attirées',
      predictions: 'Réponses', volume: 'Volume', accuracy: 'Précision', reputation: 'Crédibilité', reports: 'Relevés', confirmed: 'Confirmés', useful: 'Utiles', startsIn: 'Commence dans', endsIn: 'Se termine dans',
      day: 'j', hour: 'h', min: 'm', notRanked: "Vous n'êtes pas encore classé.",
      addCity: 'Ajouter ta ville', takePosition: 'Répondre à une question en direct', shareObservation: 'Partager un relevé', you: 'Vous',
      empty: 'Aucune entrée dans la fenêtre de lancement.', loading: 'Chargement du classement…',
      builtMarkets: 'signaux ouverts', calledMarkets: 'réponses', live: 'Commence le 25 juillet',
    },
    de: {
      title: 'Rangliste', subtitle: 'Battle-Test vom 25. Juli bis 15. August im Testnet',
      builders: 'Ersteller', predictors: 'Antwortende', observers: 'Beobachter',
      buildersTag: 'Öffne nützliche Signale für Orte, die Menschen verfolgen', predictorsTag: 'Beantworte Live-Fragen mit guter lokaler Einordnung', observersTag: 'Teile Feldberichte, die andere bestätigen können',
      creatorEarnings: 'Ersteller-Einnahmen', liquidity: 'Angezogene Liquidität', people: 'Angezogene Personen',
      predictions: 'Antworten', volume: 'Volumen', accuracy: 'Treffer', reputation: 'Glaubwürdigkeit', reports: 'Berichte', confirmed: 'Bestätigt', useful: 'Nützlich', startsIn: 'Startet in', endsIn: 'Endet in',
      day: 'T', hour: 'Std', min: 'Min', notRanked: 'Du bist noch nicht in der Liste.',
      addCity: 'Stadt hinzufügen', takePosition: 'Live-Frage beantworten', shareObservation: 'Feldbericht teilen', you: 'Du',
      empty: 'Noch keine Einträge aus dem Startfenster.', loading: 'Rangliste wird geladen…',
      builtMarkets: 'geöffnete Signale', calledMarkets: 'Antworten', live: 'Startet am 25. Juli',
    },
    zh: {
      title: '排行榜', subtitle: 'Battle-test 于 7 月 25 日至 8 月 15 日在测试网进行',
      builders: '创建者', predictors: '回应者', observers: '观察者',
      buildersTag: '为大家关注的地点打开有用信号', predictorsTag: '用良好的本地判断来回应实时问题', observersTag: '分享可被他人确认的现场报告',
      creatorEarnings: '创建者收益', liquidity: '吸引的流动性', people: '吸引的人数',
      predictions: '回应数', volume: '交易量', accuracy: '准确率', reputation: '可信度', reports: '报告', confirmed: '已确认', useful: '有用', startsIn: '开始倒计时', endsIn: '结束于',
      day: '天', hour: '时', min: '分', notRanked: '你还未上榜。',
      addCity: '添加你的城市', takePosition: '回应实时问题', shareObservation: '分享现场报告', you: '你',
      empty: '启动窗口暂无数据。', loading: '正在加载榜单…',
      builtMarkets: '已打开信号', calledMarkets: '回应', live: '7 月 25 日开始',
    },
  };
  return table[language] ?? table.en;
}

// ── Types ────────────────────────────────────────────────────────────────────
type Row = {
  address: string;
  name: string | null;
  markets_created: number;
  creator_revenue_wei: string;
  participants_attracted: number;
  tvl_attracted_wei: string;
  markets_predicted: number;
  volume_wei: string;
  correct_predictions: number;
  resolved_predictions: number;
  net_return_wei: string;
};
type ObserverRow = {
  address: string;
  name: string | null;
  field_reports: number;
  useful_reports: number;
  confirmations: number;
  gone_reports: number;
  reputation_score: number;
};
type Tab = 'builders' | 'predictors' | 'observers';
type Board = { meta: { competition_start?: string | null; competition_end?: string | null } | null; builders: Row[]; predictors: Row[]; observers: ObserverRow[] };

// ── Helpers ──────────────────────────────────────────────────────────────────
const usdm = (wei: string, dp = 0) => {
  const n = Number(BigInt(wei || '0')) / 1e18;
  return n.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 });
};
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const accuracy = (r: Row) => (r.resolved_predictions > 0 ? `${Math.round((100 * r.correct_predictions) / r.resolved_predictions)}%` : '—');

export default function CompetePage() {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = competeCopy(language);
  const { address } = useAccount();
  const me = address?.toLowerCase();

  const [tab, setTab] = useState<Tab>('builders');
  const [data, setData] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = tab === 'builders' ? data?.builders ?? [] : tab === 'predictors' ? data?.predictors ?? [] : data?.observers ?? [];
  const meRanked = useMemo(() => (me ? rows.some((r) => r.address === me) : false), [rows, me]);

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <AppHeader section={copy.title} />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 16px' }}>
        {/* Hero */}
        <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: '18px 18px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
            <span style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.accent }}>{copy.live}</span>
          </div>
          <h1 style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 1.05, color: C.text, margin: '0 0 4px' }}>{copy.title}</h1>
          <p style={{ fontFamily: fonts.sans, fontSize: 13.5, color: C.textSoft, margin: 0 }}>{copy.subtitle}</p>
          <Countdown start={data?.meta?.competition_start ?? null} end={data?.meta?.competition_end ?? null} copy={copy} C={C} fonts={fonts} neu={neu} R={R} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
          {(['builders', 'predictors', 'observers'] as const).map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  ...(active ? neu.controlPressed : neu.controlRaised),
                  borderRadius: R.lg, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                  border: active ? `1px solid ${C.accent}66` : (neu.controlRaised.border as string),
                }}
              >
                <div style={{ fontFamily: fonts.sans, fontWeight: 700, fontSize: 14.5, color: active ? C.accent : C.text }}>{copy[k]}</div>
                <div style={{ fontFamily: fonts.sans, fontSize: 11, color: C.textMuted, marginTop: 2 }}>{k === 'builders' ? copy.buildersTag : k === 'predictors' ? copy.predictorsTag : copy.observersTag}</div>
              </button>
            );
          })}
        </div>

        {/* Not-ranked nudge */}
        {address && !loading && !meRanked && (
          <Link
            href={tab === 'builders' ? '/create' : tab === 'predictors' ? '/markets' : '/today'}
            style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...neu.subtle, borderRadius: R.md, padding: '10px 14px', marginBottom: 12 }}
          >
            <span style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft }}>{copy.notRanked}</span>
            <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 700, color: C.accent }}>{tab === 'builders' ? copy.addCity : tab === 'predictors' ? copy.takePosition : copy.shareObservation} →</span>
          </Link>
        )}

        {/* CO-6: signal creators are the local stewards who keep useful
            weather questions alive for their places. */}
        {tab === 'builders' && !loading && rows.length > 0 ? (
          <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textMuted, marginBottom: 10, textAlign: 'center' }}>
            {(
              {
                en: 'The people opening useful signals for their places — keep your signal alive each week.',
                pt: 'As pessoas abrindo sinais úteis para seus lugares — mantenha seu sinal vivo a cada semana.',
                es: 'Las personas que abren señales útiles para sus lugares — mantén tu señal viva cada semana.',
                fr: 'Les personnes qui ouvrent des signaux utiles pour leurs lieux — gardez votre signal actif chaque semaine.',
                de: 'Die Menschen, die nützliche Signale für ihre Orte eröffnen — halte dein Signal jede Woche lebendig.',
                zh: '为自己地点打开有用信号的人——让你的信号每周都保持活跃。',
              } as Record<string, string>
            )[language] ?? 'The people opening useful signals for their places — keep your signal alive each week.'}
          </div>
        ) : null}

        {/* Board */}
        {loading ? (
          <p style={{ fontFamily: fonts.sans, color: C.textMuted, textAlign: 'center', padding: 32 }}>{copy.loading}</p>
        ) : rows.length === 0 ? (
          <p style={{ fontFamily: fonts.sans, color: C.textMuted, textAlign: 'center', padding: 32 }}>{copy.empty}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r, i) => {
              const mine = r.address === me;
              const observer = tab === 'observers' ? (r as ObserverRow) : null;
              const chainRow = tab === 'observers' ? null : (r as Row);
              return (
                <div
                  key={r.address}
                  style={{
                    ...neu.subtle, borderRadius: R.md, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: mine ? C.accentSoft : (neu.subtle.background as string),
                    border: mine ? `1px solid ${C.accent}` : (neu.subtle.border as string),
                  }}
                >
                  <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700, color: i < 3 ? C.accent : C.textMuted, width: 28, textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: fonts.sans, fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name ?? shortAddr(r.address)}{mine ? ` · ${copy.you}` : ''}
                    </div>
                    <div style={{ fontFamily: fonts.mono, fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {observer
                        ? `${observer.field_reports} ${copy.reports} · ${copy.confirmed} ${observer.confirmations} · ${copy.useful} ${observer.useful_reports}`
                        : tab === 'builders' && chainRow
                          ? `${chainRow.markets_created} ${copy.builtMarkets} · ${copy.people} ${chainRow.participants_attracted} · ${copy.liquidity} ${usdm(chainRow.tvl_attracted_wei)}`
                          : chainRow
                            ? `${chainRow.markets_predicted} ${copy.calledMarkets} · ${copy.volume} ${usdm(chainRow.volume_wei)} · ${copy.accuracy} ${accuracy(chainRow)}`
                            : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: C.text }}>
                      {observer ? observer.reputation_score : tab === 'builders' && chainRow ? usdm(chainRow.creator_revenue_wei, 2) : chainRow?.markets_predicted ?? 0}
                    </div>
                    <div style={{ fontFamily: fonts.sans, fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {observer ? copy.reputation : tab === 'builders' ? copy.creatorEarnings : copy.predictions}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

// ── Countdown ────────────────────────────────────────────────────────────────
function Countdown({ start, end, copy, C, fonts, neu, R }: { start: string | null; end: string | null; copy: Record<string, string>; C: ReturnType<typeof useColors>['C']; fonts: ReturnType<typeof useColors>['fonts']; neu: ReturnType<typeof useColors>['neu']; R: ReturnType<typeof useColors>['R'] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!end) return null;
  const startMs = start ? new Date(start).getTime() : 0;
  const isBeforeStart = startMs > now;
  const target = isBeforeStart ? startMs : new Date(end).getTime();
  const ms = target - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, ...neu.subtle, borderRadius: R.pill, padding: '6px 12px' }}>
      <span style={{ fontFamily: fonts.sans, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{isBeforeStart ? copy.startsIn : copy.endsIn}</span>
      <span style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: 700, color: C.accent }}>{d}{copy.day} {h}{copy.hour} {m}{copy.min}</span>
    </div>
  );
}
