// kalma/frontend/app/opengraph-image.tsx
//
// Default Open Graph / Twitter poster for every route that doesn't define its
// own (home `/`, `/today`, `/markets` list, `/signals`, `/compete`, etc.).
// Per-signal and per-place shares override this with their dynamic posters
// (app/markets/[id]/opengraph-image.tsx, app/places/[slug]/opengraph-image.tsx).
// Next maps this file to both og:image and twitter:image automatically.
//
// Static-ish render (no per-request data), Node runtime, CDN-cached. satori
// JSX subset only — colours are explicit (no CSS vars), matching the brand.

import { ImageResponse } from 'next/og';
import { OgBrand } from '@/lib/og/brand';

export const runtime = 'nodejs';
export const alt = 'Kalma — local weather signals for people exposed to weather risk';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0D1710';
const INK = '#ecead0';
const SUB = '#9aa898';
const GOLD = '#C8943A';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          padding: '60px 70px',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 12, background: GOLD, display: 'flex' }} />

        <OgBrand tagline="Local weather intelligence" size={52} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Single text node so satori wraps it as one paragraph — a manual
              <br/> inside a flex row jams the words together and overflows. */}
          <div style={{ display: 'flex', maxWidth: 1000, fontSize: 60, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.08, color: INK }}>
            Local weather signals for people exposed to weather risk
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: SUB, maxWidth: 900 }}>
            Rainfall, heat, cold, and drought risk for your city — read it daily, act before conditions shift.
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 24, letterSpacing: 2, textTransform: 'uppercase', color: SUB }}>
          kalma.me
        </div>
      </div>
    ),
    { ...size },
  );
}
