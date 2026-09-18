// kalma/frontend/app/sitemap.ts
//
// Dynamic sitemap. Enumerates:
//   - The fixed top-level routes (/, /today, /signals, /markets,
//     /positions, /protection-simulator, /create).
//   - Every active place's /places/[slug] page, pulled from Supabase
//     at build/request time.
//   - Public market detail pages from markets_snapshot.
//
// /api/* and /operator-console-9f3x are excluded because robots.ts
// disallows them.
//
// The sitemap is rendered at request time (no `revalidate` export means
// it's dynamic by default in a `Metadata` route — Next.js will pull
// fresh place rows on each crawler visit, so a newly added city is
// crawlable within minutes rather than waiting for the next deploy).

import type { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase';
import { CONTRACTS } from '@/lib/contracts';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me';

type SitemapItem = MetadataRoute.Sitemap[number];

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: SitemapItem['changeFrequency'];
  priority: number;
}> = [
  // Marketing / discovery surfaces — high priority, change often (signals
  // teaser is fresh on every deploy + cron pass).
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/today', changeFrequency: 'daily', priority: 0.9 },
  { path: '/signals', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/markets', changeFrequency: 'hourly', priority: 0.8 },
  // Action surfaces — useful for AI to know they exist, lower content
  // priority because they're interaction-heavy and thin on prose.
  { path: '/positions', changeFrequency: 'daily', priority: 0.5 },
  { path: '/create', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/protection-simulator', changeFrequency: 'monthly', priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Pull every active place. Lat/lon are not in the sitemap entry, but
  // we need the slug + the latest signal evaluated_at as a freshness
  // signal for the per-place URL.
  let places: MetadataRoute.Sitemap = [];
  try {
    const { data, error } = await supabase
      .from('places')
      .select('slug, created_at')
      .eq('active', true);
    if (!error && data) {
      places = data.map((p) => ({
        url: `${SITE_URL}/places/${p.slug}`,
        lastModified: p.created_at ? new Date(p.created_at) : now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));
    }
  } catch (err) {
    // Sitemap should never hard-fail. Log and fall through with just
    // the static routes — AI crawlers can still discover /places via
    // the homepage links + the /signals feed.
    console.warn('[sitemap] could not enumerate places:', err);
  }

  // Daily brief archive: the per-place index plus recent dated briefs.
  // Bounded to the last 14 days so the sitemap stays lean while giving
  // crawlers a fresh dated URL per place per day (the recurring-crawl
  // incentive). Older briefs stay reachable through the archive index
  // and prev/next links.
  let briefs: MetadataRoute.Sitemap = [];
  try {
    const cutoff = new Date(now.getTime() - 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await supabase
      .from('place_briefs')
      .select('brief_date, updated_at, places!inner(slug, active)')
      .eq('places.active', true)
      .gte('brief_date', cutoff)
      .order('brief_date', { ascending: false })
      .limit(2000);
    if (!error && data) {
      const indexSlugs = new Set<string>();
      for (const b of data as any[]) {
        const slug = b.places?.slug;
        if (!slug) continue;
        indexSlugs.add(slug);
        briefs.push({
          url: `${SITE_URL}/places/${slug}/briefs/${b.brief_date}`,
          lastModified: b.updated_at ? new Date(b.updated_at) : now,
          changeFrequency: 'daily' as const,
          priority: 0.6,
        });
      }
      for (const slug of indexSlugs) {
        briefs.push({
          url: `${SITE_URL}/places/${slug}/briefs`,
          lastModified: now,
          changeFrequency: 'daily' as const,
          priority: 0.65,
        });
      }
    }
  } catch (err) {
    console.warn('[sitemap] could not enumerate place briefs:', err);
  }

  let markets: MetadataRoute.Sitemap = [];
  try {
    // Scoped to the live pool: market_id is only unique within one
    // (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md), and an unscoped read would emit
    // duplicate /markets/{id} URLs once a V5 and a V7 market share an id,
    // crowding the 500-row cap with V5's wound-down history.
    const { data, error } = await supabase
      .from('markets_snapshot')
      .select('market_id, updated_at')
      .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
      .order('market_id', { ascending: false })
      .limit(500);
    if (!error && data) {
      markets = data
        .filter((m) => m.market_id != null)
        .map((m) => ({
          url: `${SITE_URL}/markets/${m.market_id}`,
          lastModified: m.updated_at ? new Date(m.updated_at) : now,
          changeFrequency: 'hourly' as const,
          priority: 0.75,
        }));
    }
  } catch (err) {
    console.warn('[sitemap] could not enumerate markets:', err);
  }

  return [...fixed, ...places, ...briefs, ...markets];
}
