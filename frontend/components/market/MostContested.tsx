// kalma/frontend/components/market/MostContested.tsx
//
// CO-5: disagreement is the magnet. This surfaces the open signals the crowd
// is most split on — the closest to a 50/50 question with the most people
// already in — so the browse page leads with "here's what people can't agree
// on this week" rather than a flat list. Hidden until at least two qualify.

'use client';

import { useMemo } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import type { Market } from '@/hooks/useMarkets';
import { CompactMarketGrid } from '@/components/market/MarketCard';

function copyFor(language: string) {
  const t: Record<string, { label: string; sub: string }> = {
    en: { label: 'Most contested', sub: 'Where the crowd is most split right now' },
    pt: { label: 'Mais disputados', sub: 'Onde a galera está mais dividida agora' },
    es: { label: 'Más reñidos', sub: 'Donde la gente está más dividida ahora' },
    fr: { label: 'Les plus disputés', sub: 'Là où le groupe est le plus partagé' },
    de: { label: 'Am umstrittensten', sub: 'Wo die Menge gerade am uneinigsten ist' },
    zh: { label: '最有争议', sub: '此刻大家分歧最大的地方' },
  };
  return t[language] ?? t.en;
}

export default function MostContested({ markets }: { markets: Market[] }) {
  const { C, fonts } = useColors();
  const { language } = useTranslation();
  const copy = copyFor(language);

  const contested = useMemo(() => {
    return markets
      .filter(
        (m) =>
          !m.resolved &&
          !m.cancelled &&
          m.daysLeft > 0 &&
          m.participantCount >= 2 &&
          m.abovePoolValue + m.belowPoolValue > 0,
      )
      .map((m) => ({ m, dist: Math.abs(m.aboveCrowdPct - 50) }))
      .sort((a, b) => a.dist - b.dist || b.m.participantCount - a.m.participantCount)
      .slice(0, 3)
      .map((x) => x.m);
  }, [markets]);

  if (contested.length < 2) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10, paddingLeft: 4 }}>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: C.label,
          }}
        >
          {copy.label}
        </span>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textMuted }}>{copy.sub}</span>
      </div>
      <CompactMarketGrid markets={contested} className="k-markets-compact-grid" />
    </div>
  );
}
