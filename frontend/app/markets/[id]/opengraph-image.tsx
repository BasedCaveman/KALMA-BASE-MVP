// kalma/frontend/app/markets/[id]/opengraph-image.tsx
//
// CO-3/CO-4/CO-6: per-signal Open Graph poster. When a question is shared into
// a WhatsApp / Telegram group this 1200×630 PNG is the preview — it must read
// at a glance as "a question my community is answering", or "the weather
// answered", or "a neighbour opened this".
//
// Flavor (?flavor=signal|resolution|creator) tunes the eyebrow + footer so the
// poster matches the share modal's framing. A resolved market always shows the
// result regardless of flavor — the weather's answer is the truth.
//
// Rendered on demand (Node runtime), CDN-cached. Reads the market server-side
// (carrot RPC, not the browser proxy). Any read failure falls back to a clean
// Kalma-branded card — a share must never 500. satori JSX subset only.

import { ImageResponse } from 'next/og';
import { readMarketForShare } from '@/lib/server/market-read';
import { marketQuestion } from '@/lib/market-question';
import { OgBrand } from '@/lib/og/brand';

export const runtime = 'nodejs';
export const alt = 'Kalma — answer this weather question';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0D1710';
const INK = '#ecead0';
const SUB = '#9aa898';
const ABOVE = '#5AAF72';
const BELOW = '#C86B52';
const GOLD = '#C8943A';

type Flavor = 'signal' | 'resolution' | 'creator';

// satori's default font has no ▲/▼ glyphs (tofu) and its border-triangle
// support collapses to a square, so draw the marks as inline SVG polygons.
function Tri({ up, color, size = 22 }: { up: boolean; color: string; size?: number }) {
  const points = up ? `0,${size} ${size},${size} ${size / 2},0` : `0,0 ${size},0 ${size / 2},${size}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'flex' }}>
      <polygon points={points} fill={color} />
    </svg>
  );
}

// The flavor-specific sub-line under the wordmark — the "tagline" that stays
// consistent with the card flavor (signal / resolution / creator).
function brandTagline(flavor: Flavor): string {
  if (flavor === 'resolution') return 'The weather answered';
  if (flavor === 'creator') return 'A signal I opened';
  return 'Local weather, your call';
}

export default async function OGImage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ flavor?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const m = await readMarketForShare(Number(id));

  // Branded fallback — unknown / unreadable market.
  if (!m) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: BG, padding: '60px 70px' }}>
          <OgBrand tagline="Local weather intelligence" />
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: INK, letterSpacing: -1 }}>
            A weather question for your area
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: SUB }}>Answer Yes or No on kalma.me</div>
        </div>
      ),
      { ...size },
    );
  }

  const question = marketQuestion('en', m);
  const place = m.cityName.split(',')[0].trim();
  const requested = (sp.flavor as Flavor) || 'signal';
  // A resolved market is always the resolution flavor — the result is the result.
  const flavor: Flavor = m.resolved ? 'resolution' : requested === 'creator' ? 'creator' : 'signal';

  // CO-4: a resolved share previews the outcome, not the open question.
  if (m.resolved) {
    // above = Yes, below = No (Golden Rule 6: never surface raw Above/Below).
    const winAbove = m.outcome === 'above';
    const winColor = winAbove ? ABOVE : BELOW;
    const winWord = winAbove ? 'Yes' : 'No';
    const actual = m.actualValue != null ? `${m.actualValue}${m.unit}` : winWord;
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG, padding: '56px 70px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: winColor, display: 'flex' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <OgBrand tagline={brandTagline('resolution')} />
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: SUB }}>{place}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: SUB, marginBottom: 14 }}>
              The weather answered
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: -2, color: INK }}>{actual}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tri up={winAbove} color={winColor} size={30} />
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: winColor }}>{winWord}</div>
              </div>
            </div>
            <div style={{ display: 'flex', fontSize: 30, color: SUB, marginTop: 20 }}>{question}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: SUB }}>
            {m.participantCount} {m.participantCount === 1 ? 'person' : 'people'} answered · see it on kalma.me
          </div>
        </div>
      ),
      { ...size },
    );
  }

  const eyebrow = flavor === 'creator' ? 'I opened this — your call?' : 'A local weather question';
  const footer =
    flavor === 'creator'
      ? `Opened on Kalma · bring your people in`
      : `${m.participantCount > 0 ? `${m.participantCount} answering · ` : ''}${m.daysLeft}d left · your call on kalma.me`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG, padding: '52px 70px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: GOLD, display: 'flex' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <OgBrand tagline={brandTagline(flavor)} />
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: SUB }}>
            {place}
          </div>
        </div>

        {/* Flavor eyebrow + the question hero */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 16 }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3, textTransform: 'uppercase', color: flavor === 'creator' ? GOLD : SUB }}>
            {eyebrow}
          </div>
          <div style={{ display: 'flex', fontSize: 58, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, color: INK }}>
            {question}
          </div>
        </div>

        {/* Community split bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', width: '100%', height: 24, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', width: `${m.abovePct}%`, background: ABOVE }} />
            <div style={{ display: 'flex', width: `${m.belowPct}%`, background: BELOW }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, fontWeight: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: ABOVE }}>
              <Tri up color={ABOVE} size={18} />
              {m.abovePct}% Yes
            </div>
            <div style={{ display: 'flex', color: SUB, fontSize: 22, fontWeight: 600 }}>{footer}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: BELOW }}>
              {m.belowPct}% No
              <Tri up={false} color={BELOW} size={18} />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
