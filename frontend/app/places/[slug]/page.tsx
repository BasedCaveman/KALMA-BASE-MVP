// kalma/frontend/app/places/[slug]/page.tsx
//
// GET /places/:slug
//   Server-rendered, read-only place page. Reads from public.places via the
//   anon key (RLS allows SELECT where active = true).
//
// Behavior:
//   - 404 for unknown or inactive slugs (notFound() throws to Next's 404).
//   - generateStaticParams pre-renders every active place at build time.
//   - generateMetadata sets per-place <title> and <meta description>.
//   - Active signals for the place are fetched + rendered server-side so
//     the initial HTML body contains the actual signal text, numbers,
//     affected groups, and source attribution — citable by AI crawlers
//     without JS execution. Previously this was client-rendered via
//     PlaceSignalsClient (now retired here).
//   - JSON-LD: Place schema + one Dataset entry summarising the
//     signals series so AI models recognise the place as an entity with
//     a structured weather-data feed.
//
// i18n decision (task #30):
//   This page is DELIBERATELY EN-canonical. It is the AI-citability /
//   GEO surface — crawlers and LLMs should ingest stable English prose
//   from the SSR'd DOM (see the <details> comment below re: signals
//   staying in the DOM for crawlers). The signal title/body resolve via
//   resolveSignalString('en', …) on purpose.
//   Human users browsing in another language still get a localised app
//   shell (AppHeader, BottomNav, SidebarNav) and a fully localised live
//   feed at /signals (SignalCard uses useTranslation). The per-place
//   deep page stays English as the canonical citation artifact.
//   ISR caching (revalidate below) also makes per-visitor language
//   varying impractical here without dropping the static cache. If we
//   ever want localised place pages, the path is /[locale]/places/[slug]
//   route variants with generateStaticParams per language — tracked as
//   a separate enhancement, not required for launch.
//
// Revalidation:
//   ISR — re-render every 15 minutes. The signal engine runs every 6h,
//   so 15 min is well below the freshness ceiling and keeps Supabase
//   load light. Crawlers always see signals within 15 min of the
//   latest engine pass.
//
// UX rules:
//   - Calm infrastructure voice. No "bet"/"odds"/"wager" language.
//   - Place name (Brasília) is rendered as-is; no transliteration.
//   - Coordinates rendered in monospace for readability.

import type { Metadata } from 'next';
import { serializeJsonLd } from '@/lib/json-ld';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/design/BottomNav';
import { buildWeatherContext } from '@/lib/place-context';
import { getSignalComparison } from '@/lib/signal-engine/comparison';
import { getSignalChartData } from '@/lib/signal-engine/chart-data';
import FavoriteButton from '@/components/shared/FavoriteButton';
import ShareButton from '@/components/shared/ShareButton';
import ShareCardButton from '@/components/shared/ShareCardButton';
import SignalActionCTA from '@/components/signal/SignalActionCTALazy';
import OpenProtectionsForPlace from '@/components/signal/OpenProtectionsForPlaceLazy';
import ObservationFeedLazy from '@/components/social/ObservationFeedLazy';
import PlaceNowPanelLazy from '@/components/weather/PlaceNowPanelLazy';
import PlaceDailyQuestionLazy from '@/components/pulse/PlaceDailyQuestionLazy';
import WeatherLayersPanel from '@/components/weather/WeatherLayersPanel';
import OfficialAlertsPanel from '@/components/weather/OfficialAlertsPanel';
import WeatherNewsPanel from '@/components/weather/WeatherNewsPanel';
import { Localized } from '@/components/shared/Localized';
import LocalizedSignalChart from '@/components/signal/LocalizedSignalChart';
import { groupLabel } from '@/lib/signal-engine/group-labels';
import { filterAffectedGroups } from '@/lib/signal-engine/place-aware-groups';
import {
  composeCard,
  severityMeta,
  type StoredSignal,
} from '@/lib/signal-engine/composer';
import {
  resolveSignalString,
  marketContextCopy,
  type Locale,
} from '@/lib/signal-engine/i18n';
import {
  eventsForProfile,
  type CommodityContextEvent,
} from '@/lib/signal-engine/commodity-context';

// Re-render every 15 min so signals stay fresh between engine passes.
export const revalidate = 900;

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

type Place = {
  /** places.id. Needed by the observation feed, which keys notes by place
   *  uuid rather than slug (signal_posts.place_id). */
  id: string;
  slug: string;
  name: string;
  region: string | null;
  region_code: string | null;
  country: string;
  country_code: string;
  lat: number;
  lon: number;
  /** Verified Wikipedia-derived activity groups (place_activity_profiles),
   *  or null when the place has no trusted profile yet. Evidence-based
   *  chip filtering supersedes the latitude heuristics when present. */
  activityGroups: string[] | null;
  /** Activity groups confirmed by community field observations
   *  (place_community_activity). Additive: keeps a chip the article or the
   *  latitude band would have dropped, never removes one. */
  communityGroups: string[];
};

// ───────────────────────────────────────────────────────────────────────────
// Data
// ───────────────────────────────────────────────────────────────────────────

/**
 * Fetch one place by slug. Returns null for missing or inactive places.
 * RLS would already filter out inactive rows, but we add the explicit
 * `eq('active', true)` filter for defense in depth and for clarity.
 */
const PLACE_COLUMNS =
  'id, slug, name, region, region_code, country, country_code, lat, lon, place_activity_profiles (groups, coord_verified)';

async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const query = (columns: string) =>
    supabase
      .from('places')
      .select(columns)
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();

  let { data, error } = await query(
    `${PLACE_COLUMNS}, place_community_activity (group_slug, confirmed)`,
  );

  // The community-activity embed is additive: it can only ever ADD a chip.
  // If that table is missing — a deploy that lands ahead of its migration —
  // the embed errors and this page would 404 for every place. Retry without
  // it rather than let an optional enrichment take the page down.
  if (error) {
    console.warn(
      '[places/[slug]] community activity embed failed, retrying without it:',
      error.message,
    );
    ({ data, error } = await query(PLACE_COLUMNS));
  }

  if (error) {
    // Log on the server; do not leak error details to the client.
    console.error('[places/[slug]] supabase error:', error.message);
    return null;
  }
  if (!data) return null;

  // One-to-one embed (profile PK = places FK). Only coordinate-verified
  // profiles drive evidence-based chip filtering.
  const {
    place_activity_profiles: profile,
    place_community_activity: community,
    ...place
  } = data as any;
  const profileRow = Array.isArray(profile) ? profile[0] : profile;
  return {
    ...place,
    activityGroups:
      profileRow && profileRow.coord_verified
        ? ((profileRow.groups ?? []) as string[])
        : null,
    // One-to-many embed. Only corroborated rows count — unconfirmed ones
    // are stored for observability but have not cleared the two-author gate.
    communityGroups: (
      (community ?? []) as Array<{
        group_slug: string;
        confirmed: boolean;
      }>
    )
      .filter((r) => r.confirmed)
      .map((r) => r.group_slug),
  } as Place;
}

/**
 * Fetch currently-active commodity market context events. Routing to
 * this specific place (via place.activityGroups) happens after the
 * fetch with eventsForProfile — the query itself is place-agnostic so
 * it can be shared across every place render on the page.
 */
async function getActiveCommodityEvents(): Promise<CommodityContextEvent[]> {
  const { data, error } = await supabase
    .from('commodity_context_events')
    .select('commodity, kind, pct_7d, pct_30d, latest_close, unit, source')
    .gt('valid_until', new Date().toISOString());
  if (error) {
    console.error(
      '[places/[slug]] commodity_context_events error:',
      error.message,
    );
    return [];
  }
  return (data ?? []) as CommodityContextEvent[];
}

// ── Server-side signal fetcher ─────────────────────────────────────────────

// Loudest first. 'strong' and 'active' are the water-recovery scale rather
// than a damage scale, so they rank below the alarming tiers on purpose.
const SEVERITY_RANK: StoredSignal['severity'][] = [
  'extreme',
  'high',
  'medium',
  'strong',
  'active',
  'low',
];

type SsrSignal = {
  id: string;
  signalTypeId: string;
  severity: StoredSignal['severity'];
  confidence: number;
  affectedGroups: string[];
  sources: string[];
  titleResolved: string;
  bodyResolved: string;
  attributionResolved: string;
  validFrom: string;
  validUntil: string;
  evaluatedAt: string;
  structuredData: Record<string, any>;
  // Translation keys carried alongside the English-resolved strings so the
  // client localization overlay can re-resolve in the visitor's language
  // (see components/shared/Localized.tsx). SSR still renders the *Resolved
  // English strings — this only adds the keys, not new visible text.
  titleKey: string;
  bodyKey: string;
  attributionKey: string;
  severityLabelKey: string;
};

/**
 * Fetch active signals for a place by slug, then run them through the
 * composer + i18n resolver so the SSR'd HTML contains the full title /
 * body / attribution text in English. AI crawlers grab this verbatim.
 */
async function getSignalsForSlug(slug: string): Promise<SsrSignal[]> {
  const { data, error } = await supabase
    .from('local_signals')
    .select(
      `id, place_id, signal_type_id, status, severity, confidence,
       anomaly_score, affected_groups, source_stack, structured_data,
       valid_from, valid_until, evaluated_at,
       places!inner ( slug )`,
    )
    .eq('status', 'active')
    .eq('places.slug', slug)
    .order('evaluated_at', { ascending: false });

  if (error || !data) {
    if (error)
      console.error('[places/[slug]] signals fetch error:', error.message);
    return [];
  }

  // English is the SSR default — the user's chosen locale lives in
  // localStorage and isn't available at server-render time. AI crawlers
  // typically request English anyway.
  const locale: Locale = 'en';

  return data
    .map((row: any): SsrSignal | null => {
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
      try {
        return {
          id: composed.id,
          signalTypeId: composed.signalTypeId,
          severity: composed.severity,
          confidence: composed.confidence,
          affectedGroups: composed.affectedGroups,
          sources: composed.sources,
          titleResolved: resolveSignalString(locale, composed.titleKey),
          bodyResolved: resolveSignalString(
            locale,
            composed.bodyKey,
            composed.bodyValues,
          ),
          attributionResolved: resolveSignalString(
            locale,
            composed.attributionKey,
          ),
          validFrom: stored.valid_from,
          validUntil: stored.valid_until,
          evaluatedAt: stored.evaluated_at,
          structuredData: stored.structured_data,
          titleKey: composed.titleKey,
          bodyKey: composed.bodyKey,
          attributionKey: composed.attributionKey,
          severityLabelKey: severityMeta(composed.severity).labelKey,
        };
      } catch (e) {
        // Don't let one malformed signal sink the page.
        return null;
      }
    })
    .filter((s): s is SsrSignal => s !== null);
}

// ───────────────────────────────────────────────────────────────────────────
// Static params
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pre-render every active place at build time. Unknown slugs fall through
 * to dynamic rendering and resolve to notFound().
 */
export async function generateStaticParams() {
  const { data, error } = await supabase
    .from('places')
    .select('slug')
    .eq('active', true);

  if (error || !data) {
    console.error(
      '[places/[slug]] generateStaticParams failed:',
      error?.message,
    );
    return [];
  }
  return data.map((p) => ({ slug: p.slug }));
}

// ───────────────────────────────────────────────────────────────────────────
// Metadata
// ───────────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlaceBySlug(slug);
  if (!place) {
    return {
      title: 'Place not found',
      description: 'The requested place could not be found.',
    };
  }
  const locationLine = place.region
    ? `${place.name}, ${place.region}, ${place.country}`
    : `${place.name}, ${place.country}`;

  // Anchor the meta description on real signal data when available.
  // Generic descriptions ("Local weather signals for …") underperform
  // ones that contain specific numbers and entities. AI engines + search
  // engines both reward this.
  const signals = await getSignalsForSlug(slug);
  let description: string;
  if (signals.length === 0) {
    description = `Local weather signals for ${locationLine}. Track rainfall, heat, cold, and drought risk on Kalma.`;
  } else {
    const types = Array.from(new Set(signals.map((s) => s.signalTypeId)))
      .map((t) =>
        t === 'rainfall_risk_rising'
          ? 'rainfall'
          : t === 'heat_stress_window'
            ? 'heat'
            : t === 'water_recovery_signal'
              ? 'water'
              : t === 'consecutive_cold_below'
                ? 'cold spell'
                : t === 'dry_stretch_window'
                  ? 'dry stretch'
                  : t === 'frost_risk'
                    ? 'frost'
                    : t === 'heavy_rain_event'
                      ? 'heavy rain'
                      : t,
      )
      .slice(0, 4)
      .join(', ');
    const topSeverity = signals[0].severity;
    description = `${signals.length} active weather signal${signals.length === 1 ? '' : 's'} for ${locationLine}: ${types}. Top severity: ${topSeverity}. Updated daily from Open-Meteo.`;
    // Keep within the 160-char window for clean SERP/AI rendering.
    if (description.length > 160) description = description.slice(0, 157) + '…';
  }

  return {
    title: locationLine,
    description,
    openGraph: {
      title: `${locationLine} — Kalma`,
      description,
      type: 'article',
      url: `/places/${slug}`,
    },
    alternates: {
      canonical: `/places/${slug}`,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────

export default async function PlacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [place, signals, commodityEvents] = await Promise.all([
    getPlaceBySlug(slug),
    getSignalsForSlug(slug),
    getActiveCommodityEvents(),
  ]);
  if (!place) notFound();

  const marketEvents = eventsForProfile(commodityEvents, place.activityGroups);

  // The signal the observation composer asks about. Pick the loudest one
  // rather than signals[0] so the question always matches what dominates the
  // page: a reader who just saw "EXTREME, a dry stretch is forming" should be
  // asked about the dry stretch, not about whichever row happened to sort
  // first. Falls back to undefined, and the composer then shows its generic
  // prompt.
  const leadSignal = [...signals].sort(
    (a, b) =>
      SEVERITY_RANK.indexOf(a.severity) - SEVERITY_RANK.indexOf(b.severity),
  )[0];

  // Coordinates: clamp to 4 dp for display; raw values keep full precision.
  const latStr = place.lat.toFixed(4);
  const lonStr = place.lon.toFixed(4);

  const fontDisplay = "var(--font-display), 'Playfair Display', serif";
  const fontSans = "var(--font-sans), 'DM Sans', system-ui, sans-serif";
  const fontMono = "var(--font-mono), 'JetBrains Mono', monospace";
  // English-canonical SSR surface (crawlers + this page's own resolved
  // strings below both use 'en' — see getSignalsForSlug).
  const locale: Locale = 'en';

  // ── Weather-context paragraph (M3) ───────────────────────────────────────
  // Plain-text 2–3 sentence summary derived from place metadata + active
  // signals. Used in two places: rendered as a <section> on the page,
  // AND injected into the Dataset.description JSON-LD so AI crawlers
  // that don't execute JS still get a rich, citable summary.
  const weatherContext = buildWeatherContext(
    {
      name: place.name,
      region: place.region,
      country: place.country,
      countryCode: place.country_code,
      lat: place.lat,
      lon: place.lon,
    },
    signals.map((s) => ({
      signalTypeId: s.signalTypeId,
      severity: s.severity,
      titleResolved: s.titleResolved,
    })),
  );

  // ── JSON-LD ──────────────────────────────────────────────────────────────
  // Two entries: Place (the city as an entity) + Dataset (the signal
  // series for this place). Both are crawler-extractable.
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me';
  const placeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: place.name,
    description: weatherContext,
    address: {
      '@type': 'PostalAddress',
      addressCountry: place.country_code,
      addressRegion: place.region ?? undefined,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: place.lat,
      longitude: place.lon,
    },
    url: `${SITE_URL}/places/${place.slug}`,
  };

  const datasetJsonLd =
    signals.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          name: `Active weather signals for ${place.name}`,
          // The richer, place-anchored description lifts the citability
          // floor for AI crawlers that read JSON-LD without rendering JS.
          description: weatherContext,
          url: `${SITE_URL}/places/${place.slug}`,
          spatialCoverage: {
            '@type': 'Place',
            geo: {
              '@type': 'GeoCoordinates',
              latitude: place.lat,
              longitude: place.lon,
            },
          },
          isAccessibleForFree: true,
          creator: { '@type': 'Organization', name: 'Kalma' },
          provider: {
            '@type': 'Organization',
            name: 'Open-Meteo',
            url: 'https://open-meteo.com',
          },
          variableMeasured: signals.map((s) => s.signalTypeId),
        }
      : null;

  // Severity → tone color (matches the design palette via CSS vars).
  const severityColor: Record<string, string> = {
    extreme: '#A8452E',
    high: '#A8452E',
    medium: '#C8943A',
    strong: '#3D7A52',
    active: '#3D7A52',
    low: '#6A6150',
  };

  return (
    <>
      {/* schema.org Place — pins this slug as a recognised entity */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(placeJsonLd) }}
      />
      {datasetJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(datasetJsonLd) }}
        />
      ) : null}

      <main
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '24px 18px var(--k-mobile-bottom-clearance)',
          fontFamily: fontSans,
          color: 'var(--k-text)',
        }}
      >
        <header style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              opacity: 0.6,
              marginBottom: 8,
            }}
          >
            {place.country}
            {place.region ? ` · ${place.region}` : ''}
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: 36,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
            }}
          >
            {place.name}
          </h1>

          {/* Action row — follow this place + share. Sits right under
              the title so the affordances are obvious without competing
              with the data below. */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 14,
            }}
          >
            <FavoriteButton
              slug={place.slug}
              labelKeys={{ save: 'place.follow', saved: 'place.following' }}
            />
            <ShareButton
              url={`/places/${place.slug}`}
              title={`${place.name} — weather signals on Kalma`}
              text={weatherContext}
            />
            <ShareCardButton slug={place.slug} placeName={place.name} />
          </div>
        </header>

        {/* Identity strip — country/region inline, kept compact. The
            technical fields (coordinates, slug) moved to a footer
            <details> so farmers reading the page don't see plumbing
            before they reach the signals. SSR + crawler-friendly:
            <details> markup keeps both fields in the page source. */}
        <section
          style={{
            marginBottom: 18,
            padding: '12px 16px',
            borderRadius: 14,
            border:
              '1px solid color-mix(in srgb, var(--k-text) 10%, transparent)',
            background: 'color-mix(in srgb, var(--k-surface) 50%, transparent)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'baseline',
            fontFamily: fontMono,
            fontSize: 12,
          }}
        >
          <span
            style={{
              opacity: 0.55,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Country
          </span>
          <span>
            {place.country}{' '}
            <span style={{ opacity: 0.55 }}>({place.country_code})</span>
          </span>
          {place.region && (
            <>
              <span style={{ opacity: 0.3 }}>·</span>
              <span
                style={{
                  opacity: 0.55,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Region
              </span>
              <span>
                {place.region}
                {place.region_code && (
                  <span style={{ opacity: 0.55 }}> ({place.region_code})</span>
                )}
              </span>
            </>
          )}
        </section>

        {/* ── Now ───────────────────────────────────────────────────────
            What the sky is doing here today, before anything about what may
            change. The page used to open straight into LOCAL SIGNALS, which
            gave a reader arriving at their own city no present-tense anchor to
            read a two-week forecast against, and nothing that differed between
            visits. Client-only on purpose: see PlaceNowPanelLazy. */}
        <PlaceNowPanelLazy lat={place.lat} lon={place.lon} />

        {/* ── Local signals (SSR'd) ─────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <h2
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              opacity: 0.6,
              margin: '0 0 14px',
            }}
          >
            <Localized
              en="Local signals"
              compute={{ kind: 'tKey', key: 'place.localSignals' }}
            />
          </h2>

          {signals.length === 0 ? (
            <div
              style={{
                borderRadius: 14,
                padding: '14px 16px',
                fontSize: 13,
                opacity: 0.65,
                border:
                  '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
                background:
                  'color-mix(in srgb, var(--k-surface) 60%, transparent)',
              }}
            >
              <Localized
                en="No active signals for this place right now. The signal engine re-evaluates every six hours; new conditions surface here when triggers fire."
                compute={{ kind: 'tKey', key: 'place.noSignals' }}
              />
            </div>
          ) : (
            <>
              {/* Scoped styling for <details> disclosure. Server-renderable;
                  no JS needed for the open/close behaviour — native HTML. */}
              <style>{`
                .k-signal-detail { list-style: none; }
                .k-signal-detail summary { list-style: none; cursor: pointer; }
                .k-signal-detail summary::-webkit-details-marker { display: none; }
                .k-signal-detail summary::marker { content: ''; }
                .k-signal-chev {
                  transition: transform 180ms ease-out;
                  flex-shrink: 0;
                  opacity: 0.55;
                }
                .k-signal-detail[open] .k-signal-chev { transform: rotate(90deg); }
                .k-signal-detail .k-signal-body {
                  /* When the parent details is closed, this whole block
                     is hidden by the browser — but it stays in the DOM,
                     so AI crawlers still receive the prose. */
                  padding-top: 14px;
                }
              `}</style>

              {signals.map((s, idx) => {
                const meta = severityMeta(s.severity);
                const tone =
                  severityColor[s.severity] ??
                  'color-mix(in srgb, var(--k-text) 50%, transparent)';
                const severityLabel = resolveSignalString('en', meta.labelKey);
                return (
                  <details
                    key={s.id}
                    open={idx === 0}
                    className="k-signal-detail"
                    style={{
                      borderRadius: 16,
                      marginBottom: 10,
                      border: `1px solid ${tone}33`,
                      background:
                        'color-mix(in srgb, var(--k-surface) 50%, transparent)',
                      overflow: 'hidden',
                    }}
                  >
                    <summary
                      style={{
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: fontMono,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: 999,
                          color: tone,
                          border: `1px solid ${tone}66`,
                          background: `${tone}14`,
                          flexShrink: 0,
                        }}
                      >
                        <Localized
                          en={severityLabel}
                          compute={{
                            kind: 'signalString',
                            key: s.severityLabelKey,
                          }}
                        />
                      </span>
                      <span
                        style={{
                          fontFamily: fontDisplay,
                          fontSize: 16,
                          fontWeight: 600,
                          lineHeight: 1.25,
                          flex: 1,
                          minWidth: 0,
                          letterSpacing: '-0.005em',
                        }}
                      >
                        <Localized
                          en={s.titleResolved}
                          compute={{ kind: 'signalString', key: s.titleKey }}
                        />
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="k-signal-chev"
                        aria-hidden="true"
                      >
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    </summary>

                    <div
                      className="k-signal-body"
                      style={{
                        padding: '0 16px 14px',
                      }}
                    >
                      <p
                        style={{
                          fontSize: 14,
                          lineHeight: 1.55,
                          margin: '0 0 12px',
                          opacity: 0.92,
                        }}
                      >
                        <Localized
                          en={s.bodyResolved}
                          compute={{
                            kind: 'signalString',
                            key: s.bodyKey,
                            values: s.structuredData,
                          }}
                        />
                      </p>

                      {/* Layer 2 — context chart (band or run-strip). Client
                          wrapper so labels localize after hydration; SSR
                          renders the English chart (crawler-safe). */}
                      {getSignalChartData(
                        s.signalTypeId,
                        s.structuredData,
                        s.evaluatedAt ?? null,
                      ).shape !== null ? (
                        <div style={{ marginBottom: 10 }}>
                          <LocalizedSignalChart
                            signalTypeId={s.signalTypeId}
                            structuredData={s.structuredData}
                            evaluatedAt={s.evaluatedAt ?? null}
                            markerColor={tone}
                          />
                        </div>
                      ) : null}

                      {/* Layer 2 — compact "usual vs now" pair */}
                      {(() => {
                        const cmp = getSignalComparison(
                          s.signalTypeId,
                          s.structuredData,
                        );
                        if (!cmp) return null;
                        return (
                          <div
                            style={{
                              marginBottom: 10,
                              display: 'flex',
                              gap: 14,
                              alignItems: 'baseline',
                              flexWrap: 'wrap',
                              fontFamily: fontMono,
                              fontSize: 11,
                              opacity: 0.85,
                            }}
                          >
                            <span>
                              <span style={{ opacity: 0.6, marginRight: 6 }}>
                                <Localized
                                  en={cmp.usualLabel}
                                  compute={{
                                    kind: 'comparisonField',
                                    signalTypeId: s.signalTypeId,
                                    structuredData: s.structuredData,
                                    field: 'usualLabel',
                                  }}
                                />
                                :
                              </span>
                              <span style={{ fontWeight: 600 }}>
                                <Localized
                                  en={cmp.usualValue}
                                  compute={{
                                    kind: 'comparisonField',
                                    signalTypeId: s.signalTypeId,
                                    structuredData: s.structuredData,
                                    field: 'usualValue',
                                  }}
                                />
                              </span>
                            </span>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span>
                              <span style={{ opacity: 0.6, marginRight: 6 }}>
                                <Localized
                                  en={cmp.nowLabel}
                                  compute={{
                                    kind: 'comparisonField',
                                    signalTypeId: s.signalTypeId,
                                    structuredData: s.structuredData,
                                    field: 'nowLabel',
                                  }}
                                />
                                :
                              </span>
                              <span style={{ color: tone, fontWeight: 700 }}>
                                <Localized
                                  en={cmp.nowValue}
                                  compute={{
                                    kind: 'comparisonField',
                                    signalTypeId: s.signalTypeId,
                                    structuredData: s.structuredData,
                                    field: 'nowValue',
                                  }}
                                />
                              </span>
                            </span>
                          </div>
                        );
                      })()}

                      {/* Layer 3 — "Now what?" action CTA. Either
                          deeplinks to the existing market that aligns
                          with this signal, or sends the reader to
                          /create with the right lat/lon/type/start
                          /duration pre-filled. */}
                      <SignalActionCTA
                        signal={{
                          signalTypeId: s.signalTypeId,
                          validFrom: s.validFrom,
                          validUntil: s.validUntil,
                          place: {
                            name: place.name,
                            lat: place.lat,
                            lon: place.lon,
                          },
                        }}
                      />

                      {s.confidence > 0 ? (
                        <div
                          style={{
                            fontFamily: fontMono,
                            fontSize: 10,
                            letterSpacing: 0.6,
                            opacity: 0.55,
                            marginBottom: 10,
                            marginTop: 10,
                            textTransform: 'uppercase',
                          }}
                        >
                          <Localized
                            en={`${Math.round(s.confidence)}% confidence`}
                            compute={{
                              kind: 'tKey',
                              key: 'place.confidence',
                              values: { pct: Math.round(s.confidence) },
                            }}
                          />
                        </div>
                      ) : null}
                      {(() => {
                        // Place-aware filter for the SSR'd chip row —
                        // same logic as SignalCard.tsx, applied here
                        // so the rendered HTML (read by AI crawlers
                        // too) doesn't list groups that don't belong
                        // in this climate.
                        const placeAwareGroups = filterAffectedGroups(
                          s.affectedGroups,
                          {
                            lat: place.lat,
                            lon: place.lon,
                            country: place.country,
                            region: place.region,
                          },
                          place.activityGroups,
                          place.communityGroups,
                        );
                        if (placeAwareGroups.length === 0) return null;
                        return (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 6,
                              marginBottom: 10,
                            }}
                          >
                            {placeAwareGroups.map((g) => (
                              <span
                                key={g}
                                style={{
                                  fontFamily: fontMono,
                                  fontSize: 10,
                                  padding: '3px 8px',
                                  borderRadius: 999,
                                  border:
                                    '1px solid color-mix(in srgb, var(--k-text) 14%, transparent)',
                                  opacity: 0.85,
                                }}
                              >
                                <Localized
                                  en={groupLabel('en', g)}
                                  compute={{ kind: 'groupLabel', slug: g }}
                                />
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {marketEvents.length > 0 ? (
                        <div
                          style={{
                            marginBottom: 10,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border:
                              '1px solid color-mix(in srgb, var(--k-text) 14%, transparent)',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: fontMono,
                              fontSize: 9,
                              letterSpacing: 0.6,
                              textTransform: 'uppercase',
                              opacity: 0.55,
                              marginBottom: 4,
                            }}
                          >
                            <Localized
                              en={resolveSignalString(
                                locale,
                                'signals.market_context.label',
                              )}
                              compute={{
                                kind: 'signalString',
                                key: 'signals.market_context.label',
                              }}
                            />
                          </div>
                          {marketEvents.slice(0, 2).map((ev) => {
                            const copy = marketContextCopy(locale, ev);
                            if (!copy) return null;
                            return (
                              <div
                                key={ev.commodity}
                                style={{
                                  fontFamily: fontSans,
                                  fontSize: 12,
                                  opacity: 0.85,
                                  lineHeight: 1.4,
                                }}
                              >
                                <Localized
                                  en={copy}
                                  compute={{ kind: 'marketContext', event: ev }}
                                />
                                <span style={{ opacity: 0.6 }}>
                                  {' · '}
                                  <Localized
                                    en={resolveSignalString(
                                      locale,
                                      'signals.market_context.source',
                                    )}
                                    compute={{
                                      kind: 'signalString',
                                      key: 'signals.market_context.source',
                                    }}
                                  />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          borderTop:
                            '1px solid color-mix(in srgb, var(--k-text) 8%, transparent)',
                          paddingTop: 10,
                          fontFamily: fontMono,
                          fontSize: 10,
                          opacity: 0.5,
                          gap: 12,
                        }}
                      >
                        <span>
                          <Localized
                            en={s.attributionResolved}
                            compute={{
                              kind: 'signalString',
                              key: s.attributionKey,
                            }}
                          />
                        </span>
                        <span>{s.sources.join(' · ')}</span>
                      </div>
                    </div>
                  </details>
                );
              })}
            </>
          )}
        </section>

        {/* ── Open protections without a signal yet ─────────────────────
            A market for this place can be genuinely open and answerable
            while none of the engine's own signals above happen to cover
            its type (see findOrphanMarkets in signal-action.ts). Without
            this, that market was only reachable from /markets or /today. */}
        <OpenProtectionsForPlace
          place={{ name: place.name, lat: place.lat, lon: place.lon }}
          signals={signals.map((s) => ({
            signalTypeId: s.signalTypeId,
            validFrom: s.validFrom,
            validUntil: s.validUntil,
          }))}
        />

        {/* ── Official alerts ───────────────────────────────────────────
            Source context, and the third kind of truth on this page: a
            government CAP warning routed to this point by polygon, kept
            distinct from the engine's signals above and the community notes
            below (Golden Rule 8). */}
        <OfficialAlertsPanel slug={place.slug} />

        {/* ── The daily question ────────────────────────────────────────
            BEFORE the observation composer, not after (moved 2026-08-05).
            It was below, following the original plan's ordering, and that
            ordering predated the Now block and the alerts panel: stacked up,
            it pushed the question to the middle of a 4,300px page. That
            contradicts its whole purpose, since a zero-effort path that takes
            seven swipes to find is not zero-effort. Effort now rises down the
            page: read what is happening, answer in one tap, write only if you
            have more to say. Client-only, see the lazy wrapper. */}
        <section style={{ marginBottom: 24 }}>
          <PlaceDailyQuestionLazy
            placeSlug={place.slug}
            placeName={place.name}
          />
        </section>

        {/* ── Field observations ────────────────────────────────────────
            The community half of the coordination layer, on the one screen
            where a person is looking at their own city. Until 2026-08-03 this
            feed existed only on /today and /markets/[id], and its composer was
            gated on a connected wallet, so the place page could show someone
            an extreme dry-stretch signal for their own town and give them
            nowhere to say whether it matched the field. Five notes in the
            product's history.

            Deliberately placed AFTER the signals and BEFORE the brief archive:
            Read what the data says, then say what you see, then check the
            record (Golden Rule 8). Client-only by design, see
            ObservationFeedLazy for why it stays out of the SSR payload. */}
        <section style={{ marginBottom: 24 }}>
          <ObservationFeedLazy
            placeId={place.id}
            placeSlug={place.slug}
            signalTypeId={leadSignal?.signalTypeId}
          />
        </section>

        {/* ── Daily brief archive link ──────────────────────────────────
            Entry point into the dated brief archive: the permanent daily
            record of signals + observations + recorded-weather
            verification for this place. Plain SSR anchor — crawlable. */}
        <section style={{ marginBottom: 24 }}>
          <a
            href={`/places/${place.slug}/briefs`}
            style={{
              display: 'block',
              padding: '12px 16px',
              borderRadius: 14,
              border:
                '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
              background:
                'color-mix(in srgb, var(--k-surface) 50%, transparent)',
              color: 'inherit',
              textDecoration: 'none',
              fontFamily: fontMono,
              fontSize: 12,
              letterSpacing: 0.4,
            }}
          >
            <Localized
              en="Daily brief archive — what each day's signals said, what people observed, and what the weather actually recorded →"
              compute={{ kind: 'tKey', key: 'place.briefArchive' }}
            />
          </a>
        </section>

        {/* ── Weather context (M3) ─────────────────────────────────────
            Was above signals; moved below per UX-8 so the actionable
            cards come first. Still SSR'd + still baked into JSON-LD
            for crawler reach (see placeJsonLd + datasetJsonLd above). */}
        <section
          style={{
            marginBottom: 24,
            padding: '16px 18px',
            borderRadius: 16,
            background: 'color-mix(in srgb, var(--k-surface) 40%, transparent)',
            border:
              '1px solid color-mix(in srgb, var(--k-text) 10%, transparent)',
          }}
        >
          <h2
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              opacity: 0.6,
              margin: '0 0 10px',
            }}
          >
            <Localized
              en="Weather context"
              compute={{ kind: 'tKey', key: 'place.weatherContext' }}
            />
          </h2>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              margin: 0,
              opacity: 0.92,
            }}
          >
            <Localized
              en={weatherContext}
              compute={{
                kind: 'weatherContext',
                place: {
                  name: place.name,
                  region: place.region,
                  country: place.country,
                  countryCode: place.country_code,
                  lat: place.lat,
                  lon: place.lon,
                },
                signals: signals.map((s) => ({
                  signalTypeId: s.signalTypeId,
                  severity: s.severity,
                  titleResolved: s.titleResolved,
                })),
              }}
            />
          </p>
        </section>

        <WeatherLayersPanel lat={place.lat} lon={place.lon} />

        {/* Official alerts moved UP, to sit right under the signals: a
            government warning for this exact point is the strongest reason on
            the page to act today, and it was buried below the weather-context
            prose and the graphic layers. News stays down here, because a
            regional story is background, not a reason to do anything. */}
        <WeatherNewsPanel countryCode={place.country_code} />

        {/* ── Technical metadata (UX-8) ────────────────────────────────
            Coordinates + slug used to sit in a 2-col card right under
            the title; farmers reading the page don't need plumbing
            before the actual signals. Tucked into a closed <details>
            so the data stays in the SSR'd HTML for crawlers + power
            users, but doesn't compete with content for attention. */}
        <details
          style={{
            marginTop: 4,
            padding: '10px 14px',
            borderRadius: 12,
            border:
              '1px solid color-mix(in srgb, var(--k-text) 8%, transparent)',
            background: 'color-mix(in srgb, var(--k-surface) 30%, transparent)',
            fontFamily: fontMono,
            fontSize: 11,
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              opacity: 0.55,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            <Localized
              en="Technical details"
              compute={{ kind: 'tKey', key: 'place.technicalDetails' }}
            />
          </summary>
          <div
            style={{
              marginTop: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px 18px',
            }}
          >
            <div>
              <div
                style={{
                  opacity: 0.55,
                  marginBottom: 3,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                Coordinates
              </div>
              <div style={{ opacity: 0.9 }}>
                {latStr}, {lonStr}
              </div>
            </div>
            <div>
              <div
                style={{
                  opacity: 0.55,
                  marginBottom: 3,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                Slug
              </div>
              <div style={{ opacity: 0.9 }}>{place.slug}</div>
            </div>
          </div>
        </details>
      </main>
      <BottomNav />
    </>
  );
}
