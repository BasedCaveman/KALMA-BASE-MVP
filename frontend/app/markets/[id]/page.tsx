import type { Metadata } from 'next';
import { serializeJsonLd } from '@/lib/json-ld';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { marketQuestion } from '@/lib/market-question';
import { supabase } from '@/lib/supabase';
import { CONTRACTS } from '@/lib/contracts';
import MarketDetailClient from './MarketDetailClient';
import { BRAND_GOLD } from '@/components/design/KalmaMark';

export const revalidate = 300;

function parseMarketId(raw: string | undefined) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  return new Date(value * 1000).toISOString().slice(0, 10);
}

type SnapshotMarket = {
  id: number;
  cityName: string;
  marketTypeId: number;
  thresholdValue: number;
  unit: string;
  startTime: number;
  endTime: number;
  abovePct: number;
  belowPct: number;
  participantCount: number;
  resolved: boolean;
  daysLeft: number;
  outcome: 'above' | 'below' | null;
  actualValue: number | null;
};

const UNIT_BY_TYPE: Record<number, string> = {
  1: 'mm',
  2: '°C',
  3: '°C',
  4: 'cm',
  5: '°C',
  6: 'mm',
  7: '°C',
  8: 'mm',
};

const crawlerOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

function weiToNumber(value: unknown) {
  try {
    return Number(BigInt(String(value ?? '0'))) / 1e18;
  } catch {
    return 0;
  }
}

async function readMarketSnapshot(id: number): Promise<SnapshotMarket | null> {
  try {
    const { data, error } = await supabase
      .from('markets_snapshot')
      .select(
        `market_id, city_name, market_type_id, threshold_value, start_time,
         end_time, above_pool_wei, below_pool_wei, participant_count,
         resolved, outcome, actual_value`
      )
      // market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md).
      // Without this, V5 and V7 markets sharing an id make .maybeSingle()
      // throw ("more than one row"), not just return the wrong one.
      .eq('market_id', id)
      .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
      .maybeSingle();

    if (error || !data) return null;

    const marketTypeId = Number(data.market_type_id ?? 0);
    const above = weiToNumber(data.above_pool_wei);
    const below = weiToNumber(data.below_pool_wei);
    const total = above + below;
    const abovePct = total > 0 ? Math.round((above / total) * 100) : 50;
    const endTime = Number(data.end_time ?? 0);

    return {
      id,
      cityName: String(data.city_name ?? `Market ${id}`),
      marketTypeId,
      thresholdValue: Number(data.threshold_value ?? 0),
      unit: UNIT_BY_TYPE[marketTypeId] ?? '',
      startTime: Number(data.start_time ?? 0),
      endTime,
      abovePct,
      belowPct: 100 - abovePct,
      participantCount: Number(data.participant_count ?? 0),
      resolved: !!data.resolved,
      daysLeft: Math.max(0, Math.ceil((endTime - Date.now() / 1000) / 86400)),
      outcome: data.resolved ? (data.outcome ? 'above' : 'below') : null,
      actualValue: typeof data.actual_value === 'number' ? data.actual_value : null,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const marketId = parseMarketId(id);
  const market = marketId == null ? null : await readMarketSnapshot(marketId);

  if (!market) {
    return {
      title: `Weather risk signal ${id}`,
      description:
        'Kalma weather-risk signal detail page with a local yes/no question, observation window, threshold, and community split.',
      alternates: { canonical: `/markets/${id}` },
    };
  }

  const question = marketQuestion('en', market);
  const description = `${question} ${market.cityName} signal window ends ${formatDate(market.endTime)}. Community split: ${market.abovePct}% Above and ${market.belowPct}% Below across ${market.participantCount} participants.`;

  return {
    title: question,
    description: description.length > 170 ? `${description.slice(0, 167)}...` : description,
    alternates: { canonical: `/markets/${id}` },
    openGraph: {
      title: `${question} — Kalma`,
      description,
      type: 'article',
      url: `/markets/${id}`,
    },
  };
}

async function MarketCrawlerIntro({ id }: { id: string }) {
  const marketId = parseMarketId(id);
  const market = marketId == null ? null : await readMarketSnapshot(marketId);

  if (!market) {
    return (
      <section
        aria-label="Crawler-readable weather signal detail summary"
        aria-hidden="true"
        style={{
          ...crawlerOnlyStyle,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>
          Weather risk signal {id}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--k-text-soft)' }}>
          Kalma market detail pages contain a local weather-risk question, threshold,
          observation window, community split, and resolution context when available.
        </p>
      </section>
    );
  }

  const question = marketQuestion('en', market);
  const status = market.resolved
    ? `Resolved ${market.outcome === 'above' ? 'Above' : 'Below'}`
    : `${market.daysLeft} day${market.daysLeft === 1 ? '' : 's'} left`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Kalma weather risk signal ${market.id}`,
    description: `${question} Community split: ${market.abovePct}% Above and ${market.belowPct}% Below.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me'}/markets/${market.id}`,
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: 'Kalma' },
    variableMeasured: market.unit ? `${market.thresholdValue}${market.unit}` : String(market.thresholdValue),
    spatialCoverage: { '@type': 'Place', name: market.cityName },
  };

  return (
    <section
      aria-label="Crawler-readable weather signal detail summary"
      aria-hidden="true"
      style={{
        ...crawlerOnlyStyle,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <h1
        style={{
          margin: '0 0 8px',
          fontFamily: "var(--font-display), 'Playfair Display', serif",
          fontSize: 26,
          lineHeight: 1.15,
          fontWeight: 600,
        }}
      >
        {question}
      </h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--k-text-soft)' }}>
        This Kalma weather-risk signal is for <strong>{market.cityName}</strong>.
        The observation window runs from {formatDate(market.startTime)} to {formatDate(market.endTime)}.
        Community split: {market.abovePct}% Above and {market.belowPct}% Below across {market.participantCount} participants.
        Status: {status}.
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--k-text-muted)' }}>
        Kalma uses local weather thresholds and yes/no coordination around actual weather data.
        See the related place context in <Link href="/signals" tabIndex={-1} style={{ color: BRAND_GOLD }}>active weather signals</Link>.
      </p>
      <noscript>
        <p>
          JavaScript is disabled. This server-rendered summary includes the question,
          window, threshold, and community split for crawlers and text-only readers.
        </p>
      </noscript>
    </section>
  );
}

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <MarketCrawlerIntro id={id} />
      <MarketDetailClient />
    </>
  );
}
