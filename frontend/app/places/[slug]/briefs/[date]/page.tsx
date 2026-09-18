// kalma/frontend/app/places/[slug]/briefs/[date]/page.tsx
//
// GET /places/:slug/briefs/:date  (date = YYYY-MM-DD, UTC day)
//
// The Daily Place Brief — the dated, permanent public memory of one
// place's day on Kalma: the signals that were active, what the community
// observed, routed market context, and (once the day has passed) the
// recorded weather actuals next to each signal's baseline — "the
// community read, verified."
//
// Design decisions:
//   - EN-canonical SSR, same policy as /places/[slug] (task #30): this is
//     the AI-citability artifact. Section labels are plain English.
//   - Four kinds of truth stay visibly separated (Golden Rule 8):
//     signal engine (Open-Meteo derived) / community observations /
//     futures-market context / recorded actuals. Each section names its
//     source.
//   - Verification is explicitly directional ("above / near / below the
//     local baseline"), never a forecast grade — the caveat is rendered,
//     not just stored.
//   - JSON-LD: one Article (dated report) + one Dataset (the day's
//     recorded actuals, once verified). All JSON-LD goes through
//     serializeJsonLd (the audited C-1/C-2 escaping helper) — never raw
//     JSON.stringify into the script sink.
//
// Revalidation: ISR 15 min for today's brief freshness; past briefs are
// effectively immutable once verified.

import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { serializeJsonLd } from '@/lib/json-ld';
import BottomNav from '@/components/design/BottomNav';
import { groupLabel } from '@/lib/signal-engine/group-labels';
import {
  isValidBriefDate,
  utcToday,
  type PlaceBrief,
  type VerificationCheck,
} from '@/lib/signal-engine/brief';

export const revalidate = 900;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me';

// ── Data ────────────────────────────────────────────────────────────────────

type Place = {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  country: string;
  country_code: string;
  lat: number;
  lon: number;
};

async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const { data, error } = await supabase
    .from('places')
    .select('id, slug, name, region, country, country_code, lat, lon')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    console.error('[briefs/[date]] place fetch error:', error.message);
    return null;
  }
  return (data as Place) ?? null;
}

async function getBrief(placeId: string, date: string): Promise<PlaceBrief | null> {
  const { data, error } = await supabase
    .from('place_briefs')
    .select('*')
    .eq('place_id', placeId)
    .eq('brief_date', date)
    .maybeSingle();
  if (error) {
    console.error('[briefs/[date]] brief fetch error:', error.message);
    return null;
  }
  return (data as PlaceBrief) ?? null;
}

/** Adjacent brief dates for prev/next navigation. */
async function getNeighborDates(
  placeId: string,
  date: string,
): Promise<{ prev: string | null; next: string | null }> {
  const [prevRes, nextRes] = await Promise.all([
    supabase
      .from('place_briefs')
      .select('brief_date')
      .eq('place_id', placeId)
      .lt('brief_date', date)
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('place_briefs')
      .select('brief_date')
      .eq('place_id', placeId)
      .gt('brief_date', date)
      .order('brief_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    prev: (prevRes.data?.brief_date as string) ?? null,
    next: (nextRes.data?.brief_date as string) ?? null,
  };
}

// ── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; date: string }>;
}): Promise<Metadata> {
  const { slug, date } = await params;
  if (!isValidBriefDate(date)) return { title: 'Brief not found' };
  const place = await getPlaceBySlug(slug);
  if (!place) return { title: 'Brief not found' };
  const brief = await getBrief(place.id, date);
  if (!brief) return { title: 'Brief not found' };

  const signalCount = brief.signals?.length ?? 0;
  const obsCount = brief.observations?.count ?? 0;
  const verifiedTag = brief.verified_at ? ' Verified against recorded weather.' : '';
  const description =
    `Daily weather-risk brief for ${place.name}, ${place.country} on ${date}: ` +
    `${signalCount} signal${signalCount === 1 ? '' : 's'}, ${obsCount} field observation${obsCount === 1 ? '' : 's'}.` +
    verifiedTag;

  return {
    title: `${place.name} — daily brief ${date}`,
    description: description.length > 160 ? description.slice(0, 157) + '…' : description,
    openGraph: {
      title: `${place.name} daily brief · ${date} — Kalma`,
      description,
      type: 'article',
      url: `/places/${slug}/briefs/${date}`,
    },
    alternates: { canonical: `/places/${slug}/briefs/${date}` },
  };
}

// ── Page ────────────────────────────────────────────────────────────────────

const severityColor: Record<string, string> = {
  extreme: '#A8452E',
  high: '#A8452E',
  medium: '#C8943A',
  strong: '#3D7A52',
  active: '#3D7A52',
  low: '#6A6150',
};

const verdictCopy: Record<VerificationCheck['verdict'], string> = {
  above_baseline: 'above the local baseline',
  near_baseline: 'near the local baseline',
  below_baseline: 'below the local baseline',
};

const verdictColor: Record<VerificationCheck['verdict'], string> = {
  above_baseline: '#C8943A',
  near_baseline: '#6A6150',
  below_baseline: '#3D7A52',
};

function fmt(n: number | null, unit: string): string {
  return n === null || n === undefined ? '—' : `${n} ${unit}`;
}

export default async function DailyBriefPage({
  params,
}: {
  params: Promise<{ slug: string; date: string }>;
}) {
  const { slug, date } = await params;
  if (!isValidBriefDate(date)) notFound();

  const place = await getPlaceBySlug(slug);
  if (!place) notFound();
  const brief = await getBrief(place.id, date);
  if (!brief) notFound();
  const neighbors = await getNeighborDates(place.id, date);

  const fontDisplay = "var(--font-display), 'Playfair Display', serif";
  const fontSans = "var(--font-sans), 'DM Sans', system-ui, sans-serif";
  const fontMono = "var(--font-mono), 'JetBrains Mono', monospace";

  const signals = brief.signals ?? [];
  const observations = brief.observations ?? { count: 0, latest: [] };
  const commodityEvents = brief.commodity_events ?? [];
  const verification = brief.verification;
  const isToday = date === utcToday();

  // ── JSON-LD ────────────────────────────────────────────────────────────
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Daily weather-risk brief for ${place.name} — ${date}`,
    datePublished: brief.created_at,
    dateModified: brief.updated_at,
    author: { '@type': 'Organization', name: 'Kalma' },
    about: {
      '@type': 'Place',
      name: place.name,
      geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lon },
    },
    url: `${SITE_URL}/places/${slug}/briefs/${date}`,
    isAccessibleForFree: true,
  };

  const actualsJsonLd = verification
    ? {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: `Recorded daily weather for ${place.name} on ${date}`,
        description:
          `Recorded values for ${date}: precipitation ${fmt(verification.actuals.precipitation_sum_mm, 'mm')}, ` +
          `max ${fmt(verification.actuals.temperature_max_c, '°C')}, min ${fmt(verification.actuals.temperature_min_c, '°C')}. ` +
          verification.note,
        temporalCoverage: date,
        spatialCoverage: {
          '@type': 'Place',
          geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lon },
        },
        isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: 'Kalma' },
        provider: { '@type': 'Organization', name: 'Open-Meteo', url: 'https://open-meteo.com' },
      }
    : null;

  const sectionHead: CSSProperties = {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    opacity: 0.6,
    margin: '0 0 12px',
  };
  const card: CSSProperties = {
    borderRadius: 14,
    padding: '14px 16px',
    border: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
    background: 'color-mix(in srgb, var(--k-surface) 60%, transparent)',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
      />
      {actualsJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(actualsJsonLd) }}
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
            Daily brief · {place.country}
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: 32,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
            }}
          >
            <Link href={`/places/${slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {place.name}
            </Link>{' '}
            <span style={{ fontFamily: fontMono, fontSize: 18, opacity: 0.7 }}>{date}</span>
          </h1>
          {brief.verified_at ? (
            <div
              style={{
                display: 'inline-block',
                marginTop: 10,
                padding: '4px 10px',
                borderRadius: 999,
                fontFamily: fontMono,
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: '#3D7A52',
                border: '1px solid color-mix(in srgb, #3D7A52 40%, transparent)',
              }}
            >
              Verified against recorded weather
            </div>
          ) : (
            <div
              style={{
                marginTop: 10,
                fontFamily: fontMono,
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                opacity: 0.55,
              }}
            >
              {isToday ? 'In progress — verification after the day closes' : 'Verification pending'}
            </div>
          )}
        </header>

        {/* ── Signals that day (signal engine / Open-Meteo) ─────────────── */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionHead}>Weather-risk signals · signal engine (Open-Meteo)</h2>
          {signals.length === 0 ? (
            <div style={{ ...card, fontSize: 13, opacity: 0.65 }}>
              No signals were active for this place on {date}. Quiet days are part of the
              record too.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {signals.map((s, i) => (
                <article key={`${s.signal_type_id}-${i}`} style={card}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      alignItems: 'baseline',
                      marginBottom: 6,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{s.title}</h3>
                    <span
                      style={{
                        fontFamily: fontMono,
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: severityColor[s.severity] ?? 'inherit',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.severity}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, opacity: 0.85 }}>
                    {s.body}
                  </p>
                  {s.affected_groups?.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        fontFamily: fontMono,
                        fontSize: 11,
                        opacity: 0.6,
                      }}
                    >
                      {s.affected_groups.map((g) => groupLabel('en', g)).join(' · ')}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* ── Recorded actuals + directional checks ─────────────────────── */}
        {verification && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionHead}>What the day recorded · Open-Meteo daily archive</h2>
            <div style={{ ...card, fontFamily: fontMono, fontSize: 13 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px' }}>
                <span>Rain {fmt(verification.actuals.precipitation_sum_mm, 'mm')}</span>
                <span>Max {fmt(verification.actuals.temperature_max_c, '°C')}</span>
                <span>Min {fmt(verification.actuals.temperature_min_c, '°C')}</span>
                {verification.actuals.snowfall_sum_cm !== null &&
                  verification.actuals.snowfall_sum_cm > 0 && (
                    <span>Snow {fmt(verification.actuals.snowfall_sum_cm, 'cm')}</span>
                  )}
                {verification.actuals.wind_gusts_max_kmh !== null && (
                  <span>Gusts {fmt(verification.actuals.wind_gusts_max_kmh, 'km/h')}</span>
                )}
              </div>
            </div>
            {verification.checks.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {verification.checks.map((c, i) => (
                  <div key={i} style={{ ...card, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{c.title}:</span>{' '}
                    recorded {c.actual}
                    {c.unit === '°C' ? '°C' : ` ${c.unit}`} vs a local baseline of{' '}
                    {c.baseline}
                    {c.unit === '°C' ? '°C' : ` ${c.unit}`} —{' '}
                    <span style={{ color: verdictColor[c.verdict], fontWeight: 600 }}>
                      {verdictCopy[c.verdict]}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, opacity: 0.55, lineHeight: 1.5, marginTop: 10 }}>
              {verification.note}
            </p>
          </section>
        )}

        {/* ── Community observations ────────────────────────────────────── */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionHead}>What people were seeing · community field reports</h2>
          {observations.count === 0 ? (
            <div style={{ ...card, fontSize: 13, opacity: 0.65 }}>
              No field observations were posted for this place on {date}.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontFamily: fontMono, fontSize: 12, opacity: 0.6 }}>
                {observations.count} observation{observations.count === 1 ? '' : 's'} recorded
              </div>
              {observations.latest.map((o, i) => (
                <blockquote key={i} style={{ ...card, margin: 0, fontSize: 13, lineHeight: 1.55 }}>
                  {o.text}
                </blockquote>
              ))}
            </div>
          )}
        </section>

        {/* ── Market context ────────────────────────────────────────────── */}
        {commodityEvents.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionHead}>Market context · futures market</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {commodityEvents.map((e, i) => (
                <div key={i} style={{ ...card, fontFamily: fontMono, fontSize: 13 }}>
                  {e.commodity} · {e.kind.replace('_', ' ')}
                  {typeof e.pct_7d === 'number' ? ` · 7d ${e.pct_7d > 0 ? '+' : ''}${e.pct_7d}%` : ''}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Prev / next navigation ────────────────────────────────────── */}
        <nav
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 28,
            fontFamily: fontMono,
            fontSize: 13,
          }}
        >
          {neighbors.prev ? (
            <Link href={`/places/${slug}/briefs/${neighbors.prev}`} style={{ color: 'inherit' }}>
              ← {neighbors.prev}
            </Link>
          ) : (
            <span />
          )}
          <Link href={`/places/${slug}/briefs`} style={{ color: 'inherit', opacity: 0.7 }}>
            All briefs
          </Link>
          {neighbors.next ? (
            <Link href={`/places/${slug}/briefs/${neighbors.next}`} style={{ color: 'inherit' }}>
              {neighbors.next} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>
      <BottomNav />
    </>
  );
}
