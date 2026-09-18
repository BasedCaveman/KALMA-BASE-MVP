// kalma/frontend/app/page.tsx
//
// Public landing page. Server component — every paragraph below is in
// the initial HTML body, so AI crawlers (GPTBot, ClaudeBot, etc.) can
// extract it on first fetch without JS execution.
//
// The previous /page.tsx was a client-rendered dapp home (location
// picker, nearby city cards, balances). That content moved to /today
// and is reachable via BottomNav. This file is the citable surface that
// the GEO audit identified as missing.
//
// Design constraint: this page renders inside layout.tsx's 430px
// max-width wrapper. Wider desktop layouts come with the desktop track.

import { supabase } from '@/lib/supabase';
import { serializeJsonLd } from '@/lib/json-ld';
import LandingContent from '@/components/landing/LandingContent';

// ISR — re-render every 15 min so the live-signals teaser stays fresh
// without overloading Supabase on every request. Engine cadence is 6h.
export const revalidate = 900;

// ── Data ───────────────────────────────────────────────────────────────────

type SignalTeaser = {
  id: string;
  signalTypeId: string;
  severity: string;
  placeName: string;
  placeRegion: string | null;
  placeCountry: string;
  placeSlug: string;
};

async function fetchSignalsTeaser(): Promise<SignalTeaser[]> {
  try {
    const { data, error } = await supabase
      .from('local_signals')
      .select(
        `id, signal_type_id, severity, places ( name, region, country, slug )`
      )
      .eq('status', 'active')
      .order('evaluated_at', { ascending: false })
      .limit(6);
    if (error || !data) return [];
    return data
      .map((row: any) => {
        const place = Array.isArray(row.places) ? row.places[0] : row.places;
        if (!place) return null;
        return {
          id: row.id,
          signalTypeId: row.signal_type_id,
          severity: row.severity,
          placeName: place.name,
          placeRegion: place.region,
          placeCountry: place.country,
          placeSlug: place.slug,
        };
      })
      .filter(Boolean) as SignalTeaser[];
  } catch {
    return [];
  }
}

async function countActiveSignals(): Promise<number> {
  try {
    const { count } = await supabase
      .from('local_signals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countLiveAlerts(): Promise<number> {
  try {
    const { count } = await supabase
      .from('weather_alerts')
      .select('id', { count: 'exact', head: true })
      .gt('expires', new Date().toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * The most severe signal anywhere right now, with the numbers behind it.
 * Rendered before we can place the visitor, and it is what an AI crawler
 * ingests: a concrete live fact rather than a value proposition.
 */
async function fetchGlobalLead() {
  const RANK: Record<string, number> = { extreme: 4, high: 3, medium: 2, moderate: 2, low: 1 };
  try {
    const { data } = await supabase
      .from('local_signals')
      .select('signal_type_id, severity, structured_data, places ( name, slug )')
      .eq('status', 'active')
      .order('evaluated_at', { ascending: false })
      .limit(60);
    let best: any = null;
    let bestRank = -1;
    for (const row of data ?? []) {
      const place = Array.isArray((row as any).places) ? (row as any).places[0] : (row as any).places;
      if (!place?.slug) continue;
      const rank = RANK[String((row as any).severity ?? '').toLowerCase()] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        best = {
          signalTypeId: String((row as any).signal_type_id),
          severity: String((row as any).severity),
          placeName: place.name as string,
          placeSlug: place.slug as string,
          structuredData: ((row as any).structured_data ?? {}) as Record<string, unknown>,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function countActivePlaces(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('places')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── Schema.org JSON-LD ─────────────────────────────────────────────────────

// Add a WebSite + WebPage entity on top of the Organization that
// layout.tsx already emits. This page is the canonical entry point.
const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Kalma',
  url: 'https://kalma.me/',
  inLanguage: ['en', 'pt-BR', 'es', 'fr', 'de', 'zh'],
  description:
    'Local weather signals for people exposed to weather risk — farmers, growers, hospitality, outdoor operators.',
};

// Inline a small FAQ here so the page carries FAQPage schema. AI models
// disproportionately cite FAQ-shaped content because it maps 1:1 to
// user queries.
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is Kalma?',
    a: 'Kalma is a local weather signal network. It surfaces daily weather signals — rainfall risk, heat stress, cold spells, drought stretches, frost risk — for cities around the world. People exposed to weather can follow signals for their place and answer Yes/No questions to protect what they have built.',
  },
  {
    q: 'Who is Kalma for?',
    a: 'Farmers and growers (coffee, beans, soy, grapes), rural hospitality operators, outdoor event organizers, logistics operators, construction sites, and local communities exposed to weather risk.',
  },
  {
    q: 'Is Kalma a gambling product?',
    a: 'No. Kalma surfaces weather-derived risk signals as its primary product. Yes/No positions are a secondary mechanism that lets users hedge against the conditions they observe. There is no roulette and no sports betting — only weather thresholds resolved against actual weather data.',
  },
  {
    q: 'Where does Kalma get its weather data?',
    a: 'Open-Meteo (open-meteo.com) — both the live forecast API and the 10-year historical archive. Every signal cites Open-Meteo as its source. Future versions will integrate higher-resolution data sources.',
  },
  {
    q: 'How are signals computed?',
    a: 'For each place and signal type, the engine compares the forecast with what that place normally sees for the same time of year. Triggers fire when the forecast is meaningfully unusual — for example, much heavier rain than the local wettest day pattern, or several forecast days with minimum temperature below a user-set value.',
  },
  {
    q: 'What cities does Kalma cover?',
    a: 'Currently 50+ signal cities across 6 continents, with new places added as users create city signals. Coverage includes São Paulo, Lavras (MG, Brazil), London, Mexico City, Lagos, Mumbai, Tokyo, Auckland, and more.',
  },
  {
    q: 'Is Kalma live on mainnet?',
    a: 'No. Kalma is currently on the Base Sepolia testnet (chain id 6343). All funds are throwaway test USDC. Mainnet launch follows public testnet validation.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

// ── Page ───────────────────────────────────────────────────────────────────
//
// Server component: fetch the teaser + place count, emit the EN-canonical
// JSON-LD (what crawlers cite — stable, not per-visitor), and hand the
// data to <LandingContent>, the client component that localises the
// visible copy. SSR renders LandingContent in EN (useTranslation's
// initial state) so the first HTML payload is fully English for
// crawlers; it re-renders in the user's saved language after hydration.

export default async function LandingPage() {
  const [teasers, activePlaceCount, activeSignalCount, activeAlertCount, globalLead] =
    await Promise.all([
      fetchSignalsTeaser(),
      countActivePlaces(),
      countActiveSignals(),
      countLiveAlerts(),
      fetchGlobalLead(),
    ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }}
      />
      <LandingContent
        teasers={teasers}
        activePlaceCount={activePlaceCount}
        activeSignalCount={activeSignalCount}
        activeAlertCount={activeAlertCount}
        globalLead={globalLead}
      />
    </>
  );
}
