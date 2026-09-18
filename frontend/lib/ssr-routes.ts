// kalma/frontend/lib/ssr-routes.ts
//
// Which routes must deliver their content as HTML, not as a client render.
//
// WHY THIS EXISTS. `components/AppProviders.tsx` wraps the whole app in
// Web3Provider, which is loaded with `dynamic(..., { ssr: false })` because
// wallet state is a well known source of hydration mismatches. The cost of
// that was not obvious until it was measured from outside: `ssr: false`
// renders NOTHING on the server, and since `{children}` is nested inside it,
// every page on kalma.me served between 0 and 44 characters of crawlable text
// (2026-08-22, verified with curl against production, including as GPTBot).
// Page titles were correct throughout, because `generateMetadata` runs on its
// own path, which is exactly why nobody caught it: the pages look right in a
// browser and right in a link preview.
//
// The daily brief archive is the part where that actually costs something.
// It is the AI-citation corpus: 1,245 dated URLs in the live sitemap, each one
// a claim published BEFORE the weather and verified afterwards at the same
// permanent address, carrying Article and Dataset JSON-LD. GPTBot, ClaudeBot
// and CCBot do not execute JavaScript, so all of it was invisible to them, and
// `app/robots.ts` allow-lists fifteen AI crawlers by name.
//
// So these routes opt OUT of the wallet provider and render on the server.
// They can, because they have no wallet coupling at all: between them the
// brief pages import only Link, notFound, supabase, serializeJsonLd,
// BottomNav and groupLabel, and BottomNav is a client component with no
// wallet hooks.
//
// Pure and import-free so it can be tested without a browser or React, the
// same discipline as follow-policy.ts.

/**
 * Routes that render their content server-side, without the wallet provider.
 *
 * Deliberately narrow. This is an allow-list, not a pattern to grow casually:
 * a route added here that later renders a wallet-dependent component will
 * throw during SSR rather than degrade quietly. Widen it only after checking
 * the route's import tree, and add a case to test:ssr-routes when you do.
 */
export function isServerRenderedContentRoute(pathname: string): boolean {
  // /places/<slug>/briefs and /places/<slug>/briefs/<date>
  return /^\/places\/[^/]+\/briefs(?:\/|$)/.test(pathname);
}

/**
 * The inverse, named for the decision it drives at the provider boundary.
 * Anything not explicitly server-rendered keeps today's behaviour exactly.
 */
export function needsWalletProvider(pathname: string): boolean {
  return !isServerRenderedContentRoute(pathname);
}
