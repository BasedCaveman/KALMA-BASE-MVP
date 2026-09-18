// kalma/frontend/components/shared/ServiceWorkerRegister.tsx
//
// Registers the conservative offline-shell service worker (public/sw.js).
// Production only — in dev a SW just gets in the way of HMR. Renders nothing.
//
// Safety: sw.js is network-first for HTML so a new deploy is always picked up;
// this registration just calls update() on load so an updated worker installs
// promptly. If we ever need to kill the SW, ship a sw.js that unregisters.

'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;
        // Pull any newer worker on each load.
        reg.update().catch(() => {});
      } catch {
        // Registration failure is non-fatal — the app works without the SW.
      }
    };

    // Defer past first paint so registration never competes with hydration.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
