import type { Metadata, Viewport } from 'next'
import { DM_Sans, Playfair_Display, JetBrains_Mono } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { serializeJsonLd } from '@/lib/json-ld'
import AppProviders from '@/components/AppProviders'
import MaterialFilters from '@/components/design/MaterialFilters'
import SidebarNav from '@/components/design/SidebarNav'
import CreatorEarningsAutoCollect from '@/components/shared/CreatorEarningsAutoCollect'
import ServiceWorkerRegister from '@/components/shared/ServiceWorkerRegister'
import InstallPrompt from '@/components/shared/InstallPrompt'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me'

// Self-hosted via next/font: no fonts.googleapis/gstatic round trips (two
// origins saved on slow rural connections), automatic preload, and the PWA
// can serve type offline. Exposed as CSS variables so the inline-style
// design system (palette fonts.*) and SSR pages can reference them.
const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})
const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

// Official Kalma accounts. Single source of truth for the brand handles so
// twitter cards + the Organization sameAs graph stay in sync. Change here if
// the handles ever move.
const KALMA_X_HANDLE = '@kalmadotme'
const KALMA_SAME_AS = [
  'https://x.com/kalmadotme',
  'https://www.instagram.com/kalmadotme',
]

// Title + description reframed away from "Climate Prediction Markets"
// language for two reasons: (1) it violates Kalma's internal copy rules
// (no gambling framing) and (2) the GEO audit showed AI models conflate
// Kalma with Kalshi / Polymarket when surfaced as a "prediction market."
// Anchor on weather intelligence + who it's for + what they do.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Kalma — Local weather signals for people exposed to weather risk',
    template: '%s — Kalma',
  },
  description:
    'Daily local weather signals for farmers, growers, hospitality, and outdoor operators. Track rainfall, heat, cold, and drought risk for your city — and act before conditions shift.',
  applicationName: 'Kalma',
  keywords: [
    'weather signals',
    'local weather intelligence',
    'rainfall risk',
    'heat stress',
    'cold spell',
    'frost risk',
    'dry stretch',
    'drought risk',
    'farmers',
    'growers',
    'agriculture weather',
    'outdoor events weather',
    'weather decisions',
    'Kalma',
  ],
  authors: [{ name: 'Kalma' }],
  creator: 'Kalma',
  publisher: 'Kalma',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Kalma',
    title: 'Kalma — Local weather signals for people exposed to weather risk',
    description:
      'Daily local weather signals for farmers, growers, hospitality, and outdoor operators. Track rainfall, heat, cold, and drought risk for your city.',
    locale: 'en_US',
    alternateLocale: ['pt_BR', 'es_ES', 'fr_FR', 'de_DE', 'zh_CN'],
  },
  twitter: {
    card: 'summary_large_image',
    site: KALMA_X_HANDLE,
    creator: KALMA_X_HANDLE,
    title: 'Kalma — Local weather signals for people exposed to weather risk',
    description:
      'Daily local weather signals for farmers, growers, hospitality, and outdoor operators.',
  },
  appleWebApp: {
    capable: true,
    title: 'Kalma',
    // 'black' (not 'black-translucent') keeps content below the status bar so
    // the sticky header isn't tucked under the notch in standalone mode.
    statusBarStyle: 'black',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

// Organization JSON-LD — emitted on every page so AI models pick up Kalma
// as a recognized entity ("weather signal network on Base Sepolia") and can
// disambiguate from the Wikipedia "Kalma" entries (Finnish folklore +
// Darfur refugee camp).
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Kalma',
  alternateName: 'Kalma — local weather signal network',
  url: SITE_URL,
  description:
    'Kalma is a local weather signal network. It generates daily weather signals (rainfall risk, heat stress, cold spells, drought, frost) for cities around the world, then lets people open Above/Below markets on those conditions to protect what they have built.',
  foundingDate: '2026',
  knowsAbout: [
    'weather risk',
    'rainfall anomaly detection',
    'heat stress',
    'frost risk',
    'drought forecasting',
    'crop weather',
    'outdoor event weather',
  ],
  sameAs: KALMA_SAME_AS,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale removed — allows desktop & mobile pinch/zoom for
  // accessibility, important for sunlight readability on phones too.
  // Dark — matches the app's dark-by-default palette + the PWA manifest so
  // the mobile browser chrome / standalone status bar don't flash light.
  themeColor: '#0D1710',
}

// Global responsive CSS. Inline so it ships in the SSR'd <head> and
// applies before any client hydration. Two breakpoints:
//
//   < 1024px  → mobile/tablet column. Old 430px constraint preserved
//               for app-shell pages so the dapp UI stays mobile-shaped.
//               BottomNav visible; SidebarNav hidden.
//   ≥ 1024px  → desktop two-column. Sidebar on the left (sticky), main
//               content area widens to ~880px. BottomNav hidden;
//               SidebarNav visible.
//
// Marketing / SSR-content pages (the landing at `/`, /places/[slug])
// pick a wider max-content via their own page-level styles; the layout
// just stops being a hard cap.
const responsiveCSS = `
  .k-app {
    --k-mobile-bottom-clearance: calc(136px + env(safe-area-inset-bottom, 0px));
    width: 100%;
    max-width: min(430px, 100vw);
    margin: 0 auto;
    min-height: 100vh;
    position: relative;
    box-sizing: border-box;
    overflow-x: clip;
    /* IMPORTANT: do NOT apply filter / transform / perspective /
       will-change to .k-app. Any of those create a "containing
       block" for descendants with position: fixed / sticky, which
       breaks (a) the sticky AppHeader, (b) the position-fixed
       burger menu overlay, and (c) the position-fixed BottomNav.
       Visual grain texture is now applied via .k-grain-overlay
       below, which is a fixed-position sibling, not a parent. */
  }
  .k-grain-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    /* Solid transparent so the SVG turbulence filter has pixels to
       work with; the visual effect comes from the filter alone. */
    background: rgba(0, 0, 0, 0);
    filter: url(#grain-bg);
    opacity: 0.6;
  }
  .k-app-grid {
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(var(--k-bg-grid, #D4CCBC10) 1px, transparent 1px),
      linear-gradient(90deg, var(--k-bg-grid, #D4CCBC10) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    z-index: 0;
  }
  .k-content {
    position: relative;
    z-index: 1;
    min-width: 0;
    max-width: 100%;
    overflow-x: clip;
  }

  /* Sidebar + bottom nav swap. Default: bottom nav visible, sidebar hidden. */
  .k-sidebar { display: none; }

  /* Sticky action bar (UX-1) responsive split.
     Mobile + tablet (<1024px): sticky bar visible above BottomNav;
       the inline CTA on the page is hidden via
       .k-action-inline-desktop-only so the user sees ONE button.
     Desktop (≥1024px): sticky bar hidden (BottomNav is also hidden,
       sidebar nav takes over); the inline CTA shows in its natural
       position within the predict pane / form. */
  .k-action-inline-desktop-only { display: none; }

  @media (min-width: 1024px) {
    .k-app {
      --k-mobile-bottom-clearance: 0px;
      max-width: 1180px;
      padding: 24px;
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: 32px;
      align-items: start;
    }
    .k-sidebar { display: block; }
    /* The dapp's existing BottomNav has its own fixed-position wrapper;
       hide it whenever the sidebar is visible. */
    .k-bottom-nav-wrap { display: none !important; }
    /* Hide the mobile sticky CTA; show the inline desktop CTA. */
    .k-sticky-action-bar { display: none !important; }
    .k-action-inline-desktop-only { display: block; }
    /* Page-level wrappers can use this hook to widen at desktop. */
    .k-content { width: 100%; }
  }

  @media (min-width: 1280px) {
    .k-app {
      max-width: 1320px;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 40px;
    }
  }
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${playfairDisplay.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: responsiveCSS }} />
      </head>

      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          minHeight: '100vh',
          overscrollBehavior: 'none',
          overflowX: 'hidden',
        }}
      >
        {/* schema.org Organization — global, every page. AI models
            disambiguate "Kalma" away from the Wikipedia folklore entry
            and away from confusion with Kalshi. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
        />

        {/* Design layer loads instantly */}
        <MaterialFilters />

        {/* Grain overlay — fixed sibling of .k-app instead of a
            filter on .k-app itself. Putting `filter: url(#grain-bg)`
            on a parent of the dapp tree was creating a CSS
            containing block that broke position: sticky/fixed for
            AppHeader, the burger menu overlay, and BottomNav (the
            mobile footer nav would scroll away on long pages). */}
        <div className="k-grain-overlay" aria-hidden="true" />

        {/* All providers: theme + i18n + currency + wallet */}
        <AppProviders>
          <div className="k-app">
            {/* subtle grid background — color set by ThemeStyles CSS var */}
            <div className="k-app-grid" />

            {/* Sidebar nav — visible at ≥1024px, hidden by CSS otherwise.
                The component itself always renders; the .k-sidebar class
                that wraps it controls visibility. */}
            <SidebarNav />

            {/* Silent, gasless delivery of pending creator earnings to
                embedded-wallet creators on app open (renders nothing). */}
            <CreatorEarningsAutoCollect />

            <div className="k-content">{children}</div>

            {/* Quiet, contextual PWA install prompt (Android/desktop Chrome). */}
            <InstallPrompt />
          </div>
        </AppProviders>

        {/* Offline-shell service worker — production only, renders nothing. */}
        <ServiceWorkerRegister />
        <SpeedInsights />
      </body>
    </html>
  )
}
