//kalma/frontend/components/weather/WeatherNewsPanel.tsx
//
// Regional weather-news context (docs/WEATHER_NEWS_CURATION_ROUTINE_2026-07-08.md).
// Reads GET /api/weather/news — items are pre-scored and pre-approved by
// the daily curation cron; this panel only renders and labels them.
//
// A fourth kind of truth alongside forecast layers, official alerts, and
// community observations (Golden Rule 8): institutional news from named,
// scored public sources (WMO, ECMWF, ...), never presented as a local
// forecast or a resolution signal. Each card always shows its publisher
// and links out — Kalma never rewrites or reframes the claim.
//
// i18n: unlike official alerts (lib/weather-alerts/alert-copy.ts, which is
// never machine-translated), news is free-text journalism with no
// structured fields to recompose — the endpoint auto-translates via
// lib/weather-news/translate.ts (DeepL) and this panel tags every
// translated card so it never reads as the publisher's own words.
//
// Coverage is uneven by design (regions vary by source health/day). Rather
// than hide that gap, this panel shows the place's mapped region first and
// tops up with the global feed when the region is thin — but every card
// keeps its own region/source label, so a global item never reads as if it
// were written about this place.

'use client';

import { useEffect, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { newsRegionForCountryCode, type NewsRegion } from '@/lib/weather-news/region';

type WeatherNewsItem = {
  id: string;
  region: NewsRegion;
  title: string;
  summary: string | null;
  language: string;
  canonical_url: string;
  published_at: string | null;
  source: {
    name: string;
    homepage_url: string;
    score_total: number;
  } | null;
  translated: boolean;
  sourceLanguage: string;
};

type WeatherNewsResponse = {
  items: WeatherNewsItem[];
};

const MAX_ITEMS = 3;

async function fetchRegion(region: NewsRegion, limit: number, lang: string): Promise<WeatherNewsItem[]> {
  const params = new URLSearchParams({ region, limit: String(limit), lang });
  const res = await fetch(`/api/weather/news?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`weather news ${res.status}`);
  const json = (await res.json()) as WeatherNewsResponse;
  return json.items ?? [];
}

function panelCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Weather news',
      body: 'Regional and global updates from named, scored public sources — not a forecast, not a local alert.',
      loading: 'Reading weather news...',
      unavailable: 'No weather news available right now.',
      regionGlobal: 'Global',
      autoTranslated: 'Auto-translated',
    },
    pt: {
      title: 'Notícias climáticas',
      body: 'Atualizações regionais e globais de fontes públicas nomeadas e avaliadas — não é previsão nem alerta local.',
      loading: 'Lendo notícias climáticas...',
      unavailable: 'Nenhuma notícia climática disponível agora.',
      regionGlobal: 'Global',
      autoTranslated: 'Tradução automática',
    },
    es: {
      title: 'Noticias climáticas',
      body: 'Actualizaciones regionales y globales de fuentes públicas nombradas y evaluadas — no es un pronóstico ni una alerta local.',
      loading: 'Leyendo noticias climáticas...',
      unavailable: 'No hay noticias climáticas disponibles ahora.',
      regionGlobal: 'Global',
      autoTranslated: 'Traducción automática',
    },
    fr: {
      title: 'Actualités météo',
      body: 'Mises à jour régionales et mondiales de sources publiques nommées et évaluées — ni prévision, ni alerte locale.',
      loading: 'Lecture des actualités météo...',
      unavailable: 'Aucune actualité météo disponible pour le moment.',
      regionGlobal: 'Mondial',
      autoTranslated: 'Traduction automatique',
    },
    de: {
      title: 'Wetternachrichten',
      body: 'Regionale und globale Updates von benannten, bewerteten öffentlichen Quellen — keine Vorhersage, keine lokale Warnung.',
      loading: 'Wetternachrichten werden geladen...',
      unavailable: 'Derzeit keine Wetternachrichten verfügbar.',
      regionGlobal: 'Global',
      autoTranslated: 'Automatisch übersetzt',
    },
    zh: {
      title: '天气新闻',
      body: '来自具名、经评分的公共信息源的区域和全球更新 —— 并非预报，也不是本地警报。',
      loading: '正在加载天气新闻...',
      unavailable: '目前没有可用的天气新闻。',
      regionGlobal: '全球',
      autoTranslated: '自动翻译',
    },
  };
  return table[language] ?? table.en;
}

function regionLabel(region: NewsRegion, copy: Record<string, string>): string {
  if (region === 'global') return copy.regionGlobal;
  return region
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function WeatherNewsPanel({
  countryCode,
}: {
  countryCode: string | null | undefined;
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = panelCopy(language);
  const region = newsRegionForCountryCode(countryCode);

  const [items, setItems] = useState<WeatherNewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        // Region-specific items first; top up with the global feed when
        // the region is thin (coverage varies by source health/month —
        // see docs/WEATHER_NEWS_CURATION_ROUTINE_2026-07-08.md). Each
        // card keeps its own region label, so this never misrepresents
        // a global item as place-specific.
        const regional = region === 'global' ? [] : await fetchRegion(region, MAX_ITEMS, language);
        const needed = MAX_ITEMS - regional.length;
        const global = needed > 0 ? await fetchRegion('global', needed, language) : [];
        const seen = new Set(regional.map((item) => item.id));
        const merged = [...regional, ...global.filter((item) => !seen.has(item.id))];
        if (!cancelled) setItems(merged.slice(0, MAX_ITEMS));
      } catch {
        if (!cancelled) {
          setItems(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [region, language]);

  return (
    <section
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px',
        marginBottom: 24,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: C.textMutedStrong,
          }}
        >
          {copy.title}
        </div>
        <div style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.5, color: C.textMuted }}>
          {copy.body}
        </div>
      </div>

      {loading ? (
        <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 14, color: C.textMuted, fontFamily: fonts.sans }}>
          {copy.loading}
        </div>
      ) : failed || !items || items.length === 0 ? (
        <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 14, color: C.textMuted, fontFamily: fonts.sans }}>
          {copy.unavailable}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item) => (
            <a
              key={item.id}
              href={item.canonical_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...neu.subtle,
                borderRadius: R.lg,
                padding: '12px 13px',
                display: 'grid',
                gap: 6,
                textDecoration: 'none',
                color: 'inherit',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.text,
                  lineHeight: 1.35,
                }}
              >
                {item.title}
              </div>
              {item.summary ? (
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 12.5,
                    color: C.textMuted,
                    lineHeight: 1.45,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.summary}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: C.textMuted,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                <span>
                  {regionLabel(item.region, copy)}
                  {item.source ? ` · ${item.source.name}` : ''}
                </span>
                {item.translated ? (
                  <span
                    style={{
                      ...neu.subtle,
                      borderRadius: 999,
                      padding: '1px 7px',
                      fontSize: 9,
                      letterSpacing: 0.3,
                      color: C.accent,
                    }}
                  >
                    {copy.autoTranslated}
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
