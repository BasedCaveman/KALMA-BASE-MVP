import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import {
  composeCard,
  severityMeta,
  type StoredSignal,
} from '@/lib/signal-engine/composer';
import {
  resolveSignalString,
  type Locale,
} from '@/lib/signal-engine/i18n';
import SignalsPageClient from './SignalsPageClient';
import { BRAND_GOLD } from '@/components/design/KalmaMark';

export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Active local weather signals',
  description:
    'Read active local weather-risk signals across Kalma, including rainfall, heat stress, cold spells, dry stretches, frost risk, and heavy rain events.',
  alternates: { canonical: '/signals' },
};

type SsrSignalSummary = {
  id: string;
  placeName: string;
  placeRegion: string | null;
  placeCountry: string;
  placeSlug: string;
  severityLabel: string;
  title: string;
  body: string;
  validUntil: string | null;
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

async function getSignalsSummary(): Promise<SsrSignalSummary[]> {
  const { data, error } = await supabase
    .from('local_signals')
    .select(
      `id, place_id, signal_type_id, status, severity, confidence,
       anomaly_score, affected_groups, source_stack, structured_data,
       valid_from, valid_until, evaluated_at,
       places!inner ( name, region, country, slug )`
    )
    .eq('status', 'active')
    .order('evaluated_at', { ascending: false })
    .limit(12);

  if (error || !data) {
    if (error) console.error('[signals] SSR summary failed:', error.message);
    return [];
  }

  const locale: Locale = 'en';

  return data
    .map((row: any): SsrSignalSummary | null => {
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      if (!place) return null;
      const stored: StoredSignal = {
        id: row.id,
        place_id: row.place_id,
        signal_type_id: row.signal_type_id,
        status: row.status,
        severity: row.severity,
        confidence: row.confidence ?? 0,
        anomaly_score: row.anomaly_score ?? 0,
        affected_groups: row.affected_groups ?? [],
        source_stack: row.source_stack ?? [],
        structured_data: row.structured_data ?? {},
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        evaluated_at: row.evaluated_at,
      };
      const composed = composeCard(stored);
      const meta = severityMeta(composed.severity);
      return {
        id: composed.id,
        placeName: place.name,
        placeRegion: place.region ?? null,
        placeCountry: place.country,
        placeSlug: place.slug,
        severityLabel: resolveSignalString(locale, meta.labelKey),
        title: resolveSignalString(locale, composed.titleKey),
        body: resolveSignalString(locale, composed.bodyKey, composed.bodyValues),
        validUntil: row.valid_until ?? null,
      };
    })
    .filter((signal): signal is SsrSignalSummary => signal !== null);
}

function CrawlerIntro({ signals }: { signals: SsrSignalSummary[] }) {
  return (
    <section
      aria-label="Crawler-readable active weather signals summary"
      aria-hidden="true"
      style={{
        ...crawlerOnlyStyle,
      }}
    >
      <h1
        style={{
          margin: '0 0 8px',
          fontFamily: "var(--font-display), 'Playfair Display', serif",
          fontSize: 26,
          lineHeight: 1.15,
          fontWeight: 600,
        }}
      >
        Active local weather signals on Kalma
      </h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--k-text-soft)' }}>
        Kalma tracks local weather-risk signals for rainfall, heat stress, cold spells,
        dry stretches, frost risk, and heavy rain events. Each signal is tied to a
        place, a validity window, Open-Meteo weather data, and a coordination action.
      </p>
      {signals.length > 0 ? (
        <ol style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
          {signals.slice(0, 6).map((signal) => (
            <li key={signal.id} style={{ fontSize: 13, lineHeight: 1.45 }}>
              <Link
                href={`/places/${signal.placeSlug}`}
                tabIndex={-1}
                style={{ color: BRAND_GOLD, fontWeight: 700 }}
              >
                {signal.placeName}
                {signal.placeRegion ? `, ${signal.placeRegion}` : ''}, {signal.placeCountry}
              </Link>
              {': '}
              <strong>{signal.severityLabel}</strong>
              {' — '}
              {signal.title}. {signal.body}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--k-text-muted)' }}>
          No active weather signals are available in the server-rendered summary right now.
        </p>
      )}
      <noscript>
        <p>
          JavaScript is disabled. Use the place links above or open /places/&lt;slug&gt;
          pages for server-rendered signal details.
        </p>
      </noscript>
    </section>
  );
}

export default async function SignalsPage() {
  const signals = await getSignalsSummary();

  return (
    <>
      <CrawlerIntro signals={signals} />
      <SignalsPageClient />
    </>
  );
}
