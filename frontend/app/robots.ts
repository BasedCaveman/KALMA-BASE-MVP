// kalma/frontend/app/robots.ts
//
// Next.js robots metadata route. Replaces the previous behavior where
// /robots.txt fell through to the SPA shell (Next.js catch-all), which
// gave AI crawlers no useful directives.
//
// Policy:
//   - Allow major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.)
//     and traditional search engines.
//   - Disallow:
//       /api/*                 — server-side endpoints, not content
//       /operator-console-9f3x — hidden operator UI, must not be indexed
//   - Point to the dynamic sitemap.
//
// References:
//   https://platform.openai.com/docs/bots
//   https://www.anthropic.com/news/anthropic-bot
//   https://docs.perplexity.ai/guides/perplexity-bot

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kalma.me';

// Bot user-agents we explicitly want to allow. Each gets the same rule
// set; we list them explicitly (rather than a wildcard) so that future
// per-bot tuning (e.g. blocking a crawler that misbehaves) is a one-line
// change.
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'cohere-ai',
  'Bytespider',
  'DuckAssistBot',
  'YouBot',
];

const SEARCH_BOTS = ['Googlebot', 'Bingbot', 'DuckDuckBot', 'Slurp', 'Baiduspider'];

const COMMON_DISALLOW = [
  '/api/',
  '/operator-console-9f3x',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rule for any bot not listed below.
      {
        userAgent: '*',
        allow: '/',
        disallow: COMMON_DISALLOW,
      },
      ...AI_BOTS.map((ua) => ({
        userAgent: ua,
        allow: '/',
        disallow: COMMON_DISALLOW,
      })),
      ...SEARCH_BOTS.map((ua) => ({
        userAgent: ua,
        allow: '/',
        disallow: COMMON_DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
