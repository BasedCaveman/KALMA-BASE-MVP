// kalma/frontend/components/signal/PlaceSignalsClient.tsx
//
// Client-side wrapper that fetches and renders local weather signals
// for a specific place. Used inside /places/[slug] (a server component)
// so the page itself stays SSR-friendly while signals stream in on the
// client after mount.

'use client';

import { useLocalSignalsByPlace } from '@/hooks/useLocalSignals';
import { SignalCard } from './SignalCard';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

function copyFor(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      heading: 'Local signals',
      loading: 'Loading local signals...',
      empty: 'No active signals for this place right now.',
    },
    pt: {
      heading: 'Sinais locais',
      loading: 'Carregando sinais locais...',
      empty: 'Nenhum sinal ativo para este lugar agora.',
    },
    es: {
      heading: 'Señales locales',
      loading: 'Cargando señales locales...',
      empty: 'No hay señales activas para este lugar ahora.',
    },
    fr: {
      heading: 'Signaux locaux',
      loading: 'Chargement des signaux locaux...',
      empty: 'Aucun signal actif pour ce lieu pour le moment.',
    },
    de: {
      heading: 'Lokale Signale',
      loading: 'Lokale Signale werden geladen...',
      empty: 'Keine aktiven Signale für diesen Ort.',
    },
    zh: {
      heading: '本地信号',
      loading: '正在加载本地信号...',
      empty: '该地区目前没有活跃信号。',
    },
  };
  return table[language] ?? table.en;
}

export default function PlaceSignalsClient({ slug }: { slug: string }) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = copyFor(language);
  const { signals, isLoading } = useLocalSignalsByPlace(slug);

  return (
    <section style={{ marginBottom: 24 }}>
      <h2
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
        {copy.heading}
      </h2>

      {isLoading ? (
        <div
          style={{
            ...neu.subtle,
            borderRadius: R.lg,
            padding: '14px 16px',
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.textMuted,
          }}
        >
          {copy.loading}
        </div>
      ) : signals.length === 0 ? (
        <div
          style={{
            ...neu.subtle,
            borderRadius: R.lg,
            padding: '14px 16px',
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.textMuted,
          }}
        >
          {copy.empty}
        </div>
      ) : (
        signals.map((s) => (
          <SignalCard key={s.id} signal={s} marketContext={s.marketContext} />
        ))
      )}
    </section>
  );
}
