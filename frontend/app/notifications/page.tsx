'use client';

import Link from 'next/link';
import AppHeader from '@/components/shared/AppHeader';
import BottomNav from '@/components/design/BottomNav';
import StartButton from '@/components/shared/StartButton';
import { useAccount } from '@/hooks/useWallet';
import { useColors } from '@/hooks/useColors';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/hooks/useTranslation';
import type { Notification, NotificationType } from '@/lib/social/types';

function pageCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Notifications',
      intro: 'Weather updates, returns ready to collect, and signals from places you follow.',
      empty: 'Nothing needs your attention right now.',
      loggedOut: 'Log in to see weather updates for your places and positions.',
      loading: 'Reading updates...',
      markAll: 'Mark all read',
      open: 'Open',
      read: 'Read',
      unread: 'New',
      claim_ready: 'Return ready',
      market_closing: 'Signal closing soon',
      forecast_shift: 'Forecast changed',
      new_market_in_place: 'New risk signal',
      followed_user_signal: 'Signal from someone you follow',
      followed_place_market: 'New signal in a followed place',
      place_observation: 'New field note',
      watched_market_observation: 'New field note',
      fallback: 'Weather update',
      body_claim_ready: 'The weather answered in {city} — your return is ready to collect.',
      body_field_note: 'New field note: {preview}',
    },
    pt: {
      title: 'Notificações',
      intro: 'Atualizações do clima, retornos prontos para coletar e sinais dos lugares que você segue.',
      empty: 'Nada pede sua atenção agora.',
      loggedOut: 'Entre para ver atualizações dos seus lugares e posições.',
      loading: 'Lendo atualizações...',
      markAll: 'Marcar tudo como lido',
      open: 'Abrir',
      read: 'Lido',
      unread: 'Novo',
      claim_ready: 'Retorno pronto',
      market_closing: 'Sinal fechando em breve',
      forecast_shift: 'Previsão mudou',
      new_market_in_place: 'Novo sinal de risco',
      followed_user_signal: 'Sinal de alguém que você segue',
      followed_place_market: 'Novo sinal em lugar seguido',
      place_observation: 'Nova nota de campo',
      watched_market_observation: 'Nova nota de campo',
      fallback: 'Atualização climática',
      body_claim_ready: 'O clima respondeu em {city} — seu retorno está pronto para coletar.',
      body_field_note: 'Nova nota de campo: {preview}',
    },
    es: {
      title: 'Notificaciones',
      intro: 'Actualizaciones del clima, retornos listos para cobrar y señales de lugares que sigues.',
      empty: 'Nada necesita tu atención ahora.',
      loggedOut: 'Inicia sesión para ver actualizaciones de tus lugares y posiciones.',
      loading: 'Leyendo actualizaciones...',
      markAll: 'Marcar todo como leído',
      open: 'Abrir',
      read: 'Leído',
      unread: 'Nuevo',
      claim_ready: 'Retorno listo',
      market_closing: 'Señal cerrando pronto',
      forecast_shift: 'Pronóstico cambiado',
      new_market_in_place: 'Nueva señal de riesgo',
      followed_user_signal: 'Señal de alguien que sigues',
      followed_place_market: 'Nueva señal en un lugar seguido',
      place_observation: 'Nueva nota de campo',
      watched_market_observation: 'Nueva nota de campo',
      fallback: 'Actualización climática',
      body_claim_ready: 'El clima respondió en {city} — tu retorno está listo para cobrar.',
      body_field_note: 'Nueva nota de campo: {preview}',
    },
    fr: {
      title: 'Notifications',
      intro: 'Mises à jour météo, retours prêts à récupérer et signaux des lieux que tu suis.',
      empty: "Rien ne demande ton attention pour l'instant.",
      loggedOut: 'Connecte-toi pour voir les mises à jour de tes lieux et positions.',
      loading: 'Lecture des mises à jour...',
      markAll: 'Tout marquer comme lu',
      open: 'Ouvrir',
      read: 'Lu',
      unread: 'Nouveau',
      claim_ready: 'Retour prêt',
      market_closing: 'Signal bientôt fermé',
      forecast_shift: 'Prévision modifiée',
      new_market_in_place: 'Nouveau signal de risque',
      followed_user_signal: "Signal d'une personne que tu suis",
      followed_place_market: 'Nouveau signal dans un lieu suivi',
      place_observation: 'Nouvelle note terrain',
      watched_market_observation: 'Nouvelle note terrain',
      fallback: 'Mise à jour météo',
      body_claim_ready: 'La météo a répondu à {city} — ton retour est prêt à récupérer.',
      body_field_note: 'Nouvelle note terrain : {preview}',
    },
    de: {
      title: 'Benachrichtigungen',
      intro: 'Wetter-Updates, abholbereite Rückflüsse und Signale aus Orten, denen du folgst.',
      empty: 'Gerade braucht nichts deine Aufmerksamkeit.',
      loggedOut: 'Melde dich an, um Updates zu deinen Orten und Positionen zu sehen.',
      loading: 'Updates werden gelesen...',
      markAll: 'Alle als gelesen markieren',
      open: 'Öffnen',
      read: 'Gelesen',
      unread: 'Neu',
      claim_ready: 'Rückfluss bereit',
      market_closing: 'Signal schließt bald',
      forecast_shift: 'Vorhersage geändert',
      new_market_in_place: 'Neues Risikosignal',
      followed_user_signal: 'Signal von jemandem, dem du folgst',
      followed_place_market: 'Neues Signal an einem gefolgten Ort',
      place_observation: 'Neue Feldnotiz',
      watched_market_observation: 'Neue Feldnotiz',
      fallback: 'Wetter-Update',
      body_claim_ready: 'Das Wetter hat in {city} geantwortet — dein Rückfluss ist abholbereit.',
      body_field_note: 'Neue Feldnotiz: {preview}',
    },
    zh: {
      title: '通知',
      intro: '天气更新、可领取的回报，以及你关注地点的信号。',
      empty: '现在没有需要你注意的内容。',
      loggedOut: '登录后即可查看你的地点和仓位的更新。',
      loading: '正在读取更新...',
      markAll: '全部标为已读',
      open: '打开',
      read: '已读',
      unread: '新',
      claim_ready: '回报可领取',
      market_closing: '信号即将关闭',
      forecast_shift: '预报有变化',
      new_market_in_place: '新的风险信号',
      followed_user_signal: '你关注的人发布了信号',
      followed_place_market: '关注地点有新信号',
      place_observation: '新的现场笔记',
      watched_market_observation: '新的现场笔记',
      fallback: '天气更新',
      body_claim_ready: '{city} 的天气已见分晓 —— 你的回报可以领取了。',
      body_field_note: '新的现场笔记：{preview}',
    },
  };
  return table[language] ?? table.en;
}

function titleFor(type: NotificationType, copy: Record<string, string>) {
  return copy[type] ?? copy.fallback;
}

// Compose a localized body from the notification's structured fields.
// `data.message` is the legacy EN string kept as fallback for rows written
// before the structured fields existed. The field-note preview itself is
// user-generated content and is shown verbatim, never machine-translated.
function bodyFor(notification: Notification, copy: Record<string, string>) {
  const data = notification.data ?? {};
  if (notification.type === 'claim_ready' && data.city_name) {
    return copy.body_claim_ready.replace('{city}', data.city_name);
  }
  if (
    (notification.type === 'place_observation' || notification.type === 'watched_market_observation') &&
    data.preview
  ) {
    return copy.body_field_note.replace('{preview}', data.preview);
  }
  return data.message ?? titleFor(notification.type, copy);
}

function hrefFor(notification: Notification) {
  if (notification.data?.market_id != null) return `/markets/${notification.data.market_id}`;
  return '/today';
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function NotificationRow({
  notification,
  copy,
  onRead,
}: {
  notification: Notification;
  copy: Record<string, string>;
  onRead: (id: string) => void;
}) {
  const { C, fonts, neu, R } = useColors();
  const unread = !notification.read_at;
  const href = hrefFor(notification);

  return (
    <div
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '14px',
        display: 'grid',
        gap: 10,
        border: unread ? `1px solid ${C.accent}66` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 16,
              lineHeight: 1.25,
              fontWeight: 800,
              color: C.text,
            }}
          >
            {titleFor(notification.type, copy)}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: fonts.sans,
              fontSize: 14,
              lineHeight: 1.45,
              color: C.textMuted,
              overflowWrap: 'anywhere',
            }}
          >
            {bodyFor(notification, copy)}
          </div>
        </div>

        <span
          style={{
            flexShrink: 0,
            borderRadius: R.pill,
            padding: '4px 8px',
            background: unread ? `${C.accent}1F` : C.surfaceSoft,
            color: unread ? C.accent : C.textMutedStrong,
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {unread ? copy.unread : copy.read}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: C.textMutedStrong }}>
          {timeAgo(notification.created_at)}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {unread ? (
            <button
              type="button"
              onClick={() => onRead(notification.id)}
              style={{
                ...neu.controlRaised,
                border: 'none',
                borderRadius: R.md,
                padding: '8px 10px',
                color: C.textSoft,
                fontFamily: fonts.sans,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {copy.read}
            </button>
          ) : null}
          <Link
            href={href}
            onClick={() => unread && onRead(notification.id)}
            style={{
              ...neu.controlRaised,
              borderRadius: R.md,
              padding: '8px 12px',
              color: C.text,
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {copy.open}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { address, isConnected } = useAccount();
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = pageCopy(language);
  const { notifications, unreadCount, isLoading, markAllRead, markOneRead } = useNotifications(address);

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <AppHeader section={copy.title} />
      <main
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '0 16px 28px',
          display: 'grid',
          gap: 14,
        }}
      >
        <section
          style={{
            ...neu.panelRaised,
            borderRadius: R.xl,
            padding: '16px',
            display: 'grid',
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 30,
              lineHeight: 1.05,
              fontWeight: 800,
              color: C.text,
            }}
          >
            {copy.title}
          </div>
          <div style={{ fontFamily: fonts.sans, fontSize: 15, lineHeight: 1.5, color: C.textMuted }}>
            {isConnected ? copy.intro : copy.loggedOut}
          </div>
          {!isConnected ? <StartButton /> : unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              style={{
                ...neu.controlRaised,
                border: 'none',
                borderRadius: R.lg,
                minHeight: 42,
                padding: '0 14px',
                justifySelf: 'start',
                color: C.text,
                fontFamily: fonts.sans,
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {copy.markAll}
            </button>
          ) : null}
        </section>

        {isLoading ? (
          <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 16, color: C.textMuted, fontFamily: fonts.sans }}>
            {copy.loading}
          </div>
        ) : notifications.length > 0 ? (
          <section style={{ display: 'grid', gap: 10 }}>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                copy={copy}
                onRead={markOneRead}
              />
            ))}
          </section>
        ) : isConnected ? (
          <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 16, color: C.textMuted, fontFamily: fonts.sans }}>
            {copy.empty}
          </div>
        ) : null}
      </main>
      <BottomNav />
    </div>
  );
}
