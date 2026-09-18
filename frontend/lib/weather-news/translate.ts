//kalma/frontend/lib/weather-news/translate.ts
//
// Lazy machine translation for weather-news items (docs/WEATHER_NEWS_CURATION_ROUTINE).
// Deliberately separate from lib/weather-alerts/alert-copy.ts: news is
// free-text journalism with no structured fields to recompose a sentence
// from, so translation is the only practical way to localize it. This is
// lower-stakes than an official CAP warning (WMO/MetSul/etc. news is
// context, not an actionable safety instruction), so the risk of an
// occasional translation error is acceptable — but every translated item
// is still labeled "auto-translated" in the UI, never presented as the
// publisher's own words.
//
// Provider: DeepL (better quality than Google Translate on formal/news
// text, free tier available). Requires DEEPL_API_KEY in Vercel; without it,
// this module no-ops and callers fall back to the original-language text —
// the feed still works, it just isn't localized.

import type { SupabaseClient } from '@supabase/supabase-js';

const DEEPL_TARGET: Record<string, string> = {
  en: 'EN',
  pt: 'PT-BR',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  zh: 'ZH',
};

export type TranslatedText = {
  title: string;
  summary: string | null;
  translated: boolean;
};

async function callDeepL(texts: string[], targetLang: string): Promise<string[] | null> {
  const apiKey = process.env.DEEPL_API_KEY;
  const target = DEEPL_TARGET[targetLang];
  if (!apiKey || !target) return null;

  const base = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  try {
    const res = await fetch(`${base}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: texts, target_lang: target }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { translations?: { text: string }[] };
    return json.translations?.map((t) => t.text) ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the item's title/summary in `targetLang`, translating and caching
 * on first request if needed. Never throws — a translation failure (missing
 * key, API error, timeout) falls back to the original text untranslated.
 */
export async function getLocalizedNewsItem(
  supabase: SupabaseClient,
  item: { id: string; title: string; summary: string | null; language: string; translations: Record<string, { title: string; summary: string | null }> },
  targetLang: string,
): Promise<TranslatedText> {
  if (targetLang === item.language || !DEEPL_TARGET[targetLang]) {
    return { title: item.title, summary: item.summary, translated: false };
  }

  const cached = item.translations?.[targetLang];
  if (cached) return { title: cached.title, summary: cached.summary, translated: true };

  const translated = await callDeepL([item.title, item.summary ?? ''], targetLang);
  if (!translated) return { title: item.title, summary: item.summary, translated: false };

  const [title, summary] = translated;
  const entry = { title, summary: item.summary ? summary || null : null, translatedAt: new Date().toISOString() };

  // Best-effort cache write — a failure here just means the next request
  // translates again, never a user-facing error.
  await supabase
    .from('weather_news_items')
    .update({ translations: { ...item.translations, [targetLang]: entry } })
    .eq('id', item.id)
    .then(null, () => undefined);

  return { title: entry.title, summary: entry.summary, translated: true };
}
