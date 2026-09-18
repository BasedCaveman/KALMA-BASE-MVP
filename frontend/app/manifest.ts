// kalma/frontend/app/manifest.ts
//
// PWA web app manifest (Next file-convention → /manifest.webmanifest, and
// Next auto-injects <link rel="manifest">). Makes Kalma installable to the
// home screen on Android/desktop Chrome and gives iOS Safari a standalone
// app shell. Dark theme/background match the app's dark-by-default palette so
// the splash + status bar don't flash light. Icons are generated from the
// brand reticle by scripts/gen-brand-assets.mjs (canonical gold #C8943A).

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kalma — Local weather signals',
    short_name: 'Kalma',
    description:
      'Daily local weather signals for people exposed to weather risk — rainfall, heat, cold, and drought for your city.',
    id: '/',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0D1710',
    theme_color: '#0D1710',
    categories: ['weather', 'productivity', 'utilities'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
