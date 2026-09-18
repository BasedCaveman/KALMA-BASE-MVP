// kalma/frontend/app/places/[slug]/briefs/page.tsx
//
// GET /places/:slug/briefs — the brief archive index for one place.
// Lists recent daily briefs (newest first) with signal/observation counts
// and verification status, linking into /places/:slug/briefs/:date.
// EN-canonical SSR, same policy as the place page.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BottomNav from '@/components/design/BottomNav';
import {
  computeTrackRecord,
  type BriefTrackRecord,
} from '@/lib/signal-engine/brief-track-record';

export const revalidate = 900;

const LIST_LIMIT = 60;

type BriefRow = {
  brief_date: string;
  verified_at: string | null;
  signals: unknown[];
  observations: { count?: number } | null;
};

async function getPlace(slug: string) {
  const { data, error } = await supabase
    .from('places')
    .select('id, slug, name, country')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    console.error('[briefs] place fetch error:', error.message);
    return null;
  }
  return data;
}

async function getBriefs(placeId: string): Promise<BriefRow[]> {
  const { data, error } = await supabase
    .from('place_briefs')
    .select('brief_date, verified_at, signals, observations')
    .eq('place_id', placeId)
    .order('brief_date', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.error('[briefs] list fetch error:', error.message);
    return [];
  }
  return (data ?? []) as BriefRow[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlace(slug);
  if (!place) return { title: 'Briefs not found' };
  return {
    title: `${place.name} — daily brief archive`,
    description: `Dated daily weather-risk briefs for ${place.name}, ${place.country}: signals, community field observations, and recorded-weather verification.`,
    alternates: { canonical: `/places/${slug}/briefs` },
  };
}

// Verified track record: a coverage/credibility strip, NOT an accuracy
// score. Renders nothing until at least one brief has been checked against
// recorded weather (avoids an empty box on brand-new places). Copy stays
// within the directional-check honesty rule: "checked against recorded
// weather", never "correct" / "accurate".
function TrackRecordStrip({
  record,
  fontMono,
  fontSans,
}: {
  record: BriefTrackRecord;
  fontMono: string;
  fontSans: string;
}) {
  if (record.briefs_verified === 0) return null;

  const { above_baseline, near_baseline, below_baseline } = record.verdicts;
  const segs = [
    { key: 'above', label: 'above baseline', value: above_baseline, color: 'var(--k-below, #C86B52)' },
    { key: 'near', label: 'near baseline', value: near_baseline, color: 'var(--k-text-muted, #948B7D)' },
    { key: 'below', label: 'below baseline', value: below_baseline, color: 'var(--k-above, #5AAF72)' },
  ].filter((s) => s.value > 0);
  const checkTotal = record.signal_days_checked;

  return (
    <div
      style={{
        marginTop: 16,
        borderRadius: 14,
        padding: '14px 16px',
        border: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
        background: 'color-mix(in srgb, var(--k-surface) 70%, transparent)',
        fontFamily: fontSans,
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.3,
          textTransform: 'uppercase',
          opacity: 0.6,
          marginBottom: 8,
        }}
      >
        Verified track record
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 700 }}>
          {record.briefs_verified}
          <span style={{ opacity: 0.55, fontSize: 15 }}>
            {' '}/ {record.window_days} days
          </span>
        </span>
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          checked against recorded weather
        </span>
      </div>

      {checkTotal > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              height: 8,
              borderRadius: 5,
              overflow: 'hidden',
              marginTop: 12,
              gap: 2,
            }}
            aria-hidden="true"
          >
            {segs.map((s) => (
              <div
                key={s.key}
                style={{
                  flex: s.value,
                  background: s.color,
                  borderRadius: 3,
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 14px',
              marginTop: 8,
              fontFamily: fontMono,
              fontSize: 11,
              opacity: 0.8,
            }}
          >
            {segs.map((s) => (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: s.color,
                    display: 'inline-block',
                  }}
                />
                {s.value} {s.label}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
            Across {checkTotal} signal-day check{checkTotal === 1 ? '' : 's'}: how the
            recorded weather compared to this place&apos;s historical baseline. This is a
            record of Kalma checking itself daily, not a forecast accuracy score.
          </p>
        </>
      )}
    </div>
  );
}

export default async function BriefArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const place = await getPlace(slug);
  if (!place) notFound();
  const [briefs, trackRecord] = await Promise.all([
    getBriefs(place.id),
    computeTrackRecord(supabase, place.id, 30),
  ]);

  const fontDisplay = "var(--font-display), 'Playfair Display', serif";
  const fontSans = "var(--font-sans), 'DM Sans', system-ui, sans-serif";
  const fontMono = "var(--font-mono), 'JetBrains Mono', monospace";

  return (
    <>
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
            Daily brief archive
          </div>
          <h1
            style={{
              fontFamily: fontDisplay,
              fontSize: 32,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            <Link href={`/places/${slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {place.name}
            </Link>
          </h1>
          <p style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.55, marginTop: 10 }}>
            One entry per day: the weather-risk signals that were active, what the
            community observed on the ground, and, once the day closes, the recorded
            weather next to each signal&apos;s local baseline.
          </p>
          <TrackRecordStrip
            record={trackRecord}
            fontMono={fontMono}
            fontSans={fontSans}
          />
        </header>

        {briefs.length === 0 ? (
          <div
            style={{
              borderRadius: 14,
              padding: '14px 16px',
              fontSize: 13,
              opacity: 0.65,
              border: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
              background: 'color-mix(in srgb, var(--k-surface) 60%, transparent)',
            }}
          >
            No briefs recorded yet for this place. The first one is composed on the
            next daily pass.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {briefs.map((b) => {
              const signalCount = Array.isArray(b.signals) ? b.signals.length : 0;
              const obsCount = b.observations?.count ?? 0;
              return (
                <Link
                  key={b.brief_date}
                  href={`/places/${slug}/briefs/${b.brief_date}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
                    background: 'color-mix(in srgb, var(--k-surface) 60%, transparent)',
                    color: 'inherit',
                    textDecoration: 'none',
                    fontFamily: fontMono,
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{b.brief_date}</span>
                  <span style={{ opacity: 0.7 }}>
                    {signalCount} signal{signalCount === 1 ? '' : 's'} · {obsCount} obs
                    {b.verified_at ? ' · ✓ verified' : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}
