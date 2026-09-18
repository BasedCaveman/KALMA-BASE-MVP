import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getLocalizedNewsItem } from '@/lib/weather-news/translate';

const REGIONS = new Set([
  'global',
  'africa',
  'asia',
  'europe',
  'latin-america-caribbean',
  'north-america',
  'oceania-pacific',
]);

// Mirrors useTranslation's supported UI languages.
const UI_LANGUAGES = new Set(['en', 'pt', 'es', 'fr', 'de', 'zh']);

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: 'missing_supabase_env' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const region = url.searchParams.get('region');
  if (region && !REGIONS.has(region)) {
    return NextResponse.json(
      { error: 'invalid_region', allowed: [...REGIONS] },
      { status: 400 },
    );
  }
  const requestedLimit = Number(url.searchParams.get('limit') ?? 3);
  const perRegion = Math.min(
    10,
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 3),
  );
  const requestedLang = url.searchParams.get('lang');
  const lang = requestedLang && UI_LANGUAGES.has(requestedLang) ? requestedLang : 'en';

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
  let query = supabase
    .from('weather_news_items')
    .select(
      'id,region,title,summary,language,canonical_url,published_at,editorial_score,translations,source:weather_news_sources!weather_news_items_source_id_fkey(name,homepage_url,score_total)',
    )
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(region ? perRegion : 100);
  if (region) query = query.eq('region', region);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: 'weather_news_unavailable' },
      { status: 503 },
    );
  }

  const items = region
    ? (data ?? [])
    : (data ?? []).filter((item, index, all) => {
        const earlierInRegion = all
          .slice(0, index)
          .filter((candidate) => candidate.region === item.region).length;
        return earlierInRegion < perRegion;
      });

  // Lazy auto-translation (news only — never the official-alerts layer,
  // see lib/weather-alerts/alert-copy.ts). Every item is labeled with
  // `translated` so the UI can show an "auto-translated" tag; the internal
  // `translations` cache column never leaves this route.
  const localizedItems = await Promise.all(
    items.map(async (item) => {
      const { translations, ...rest } = item as typeof item & {
        translations: Record<string, { title: string; summary: string | null }>;
      };
      const localized = await getLocalizedNewsItem(
        supabase,
        { id: item.id, title: item.title, summary: item.summary, language: item.language, translations: translations ?? {} },
        lang,
      );
      return {
        ...rest,
        title: localized.title,
        summary: localized.summary,
        translated: localized.translated,
        sourceLanguage: item.language,
      };
    }),
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      curation: 'source-scoreboard-v1',
      items: localizedItems,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    },
  );
}
