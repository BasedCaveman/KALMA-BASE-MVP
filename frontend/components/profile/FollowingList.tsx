// kalma/frontend/components/profile/FollowingList.tsx
//
// "Following" section on /profile. Shows the places the user has
// favorited (via useFavorites localStorage). Each row links to the
// place page; an unfollow chevron drops it from the list.
//
// Place metadata (name, region, country) is hydrated from Supabase by
// slug — the favorites store only carries slugs.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useFavorites } from '@/hooks/useFavorites';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

const FOLLOW_COPY: Record<string, { emptyPre: string; followCta: string; emptyPost: string; unfollow: string }> = {
  en: { emptyPre: 'No places followed yet. Tap', followCta: 'Follow this place', emptyPost: 'on any city page to see it here.', unfollow: 'Unfollow' },
  pt: { emptyPre: 'Nenhum lugar seguido ainda. Toque em', followCta: 'Seguir este lugar', emptyPost: 'em qualquer página de cidade para vê-lo aqui.', unfollow: 'Deixar de seguir' },
  es: { emptyPre: 'Aún no sigues ningún lugar. Toca', followCta: 'Seguir este lugar', emptyPost: 'en cualquier página de ciudad para verlo aquí.', unfollow: 'Dejar de seguir' },
  fr: { emptyPre: 'Aucun lieu suivi pour le moment. Touche', followCta: 'Suivre ce lieu', emptyPost: "sur n'importe quelle page de ville pour le voir ici.", unfollow: 'Ne plus suivre' },
  de: { emptyPre: 'Noch keine Orte gefolgt. Tippe auf', followCta: 'Diesem Ort folgen', emptyPost: 'auf einer beliebigen Stadtseite, um ihn hier zu sehen.', unfollow: 'Entfolgen' },
  zh: { emptyPre: '还没有关注任何地点。在任意城市页面点击', followCta: '关注这个地点', emptyPost: '即可在此看到它。', unfollow: '取消关注' },
};

type PlaceRow = {
  slug: string;
  name: string;
  region: string | null;
  country: string;
};

export default function FollowingList() {
  const { favorites, toggle, hydrated } = useFavorites();
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = FOLLOW_COPY[language] ?? FOLLOW_COPY.en;
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Hydrate place metadata from Supabase whenever the favorites list
  // changes. Cheap query: a single .in() on slugs.
  useEffect(() => {
    if (!hydrated) return;
    if (favorites.length === 0) {
      setPlaces([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    supabase
      .from('places')
      .select('slug, name, region, country')
      .in('slug', favorites)
      .eq('active', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setPlaces([]);
        } else {
          // Preserve the order in `favorites` so newest-added shows up
          // in a stable place rather than alphabetical by name.
          const bySlug = new Map(data.map((p) => [p.slug, p as PlaceRow]));
          setPlaces(
            favorites
              .map((s) => bySlug.get(s))
              .filter(Boolean) as PlaceRow[],
          );
        }
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [favorites, hydrated]);

  if (!hydrated) return null;
  if (favorites.length === 0) {
    return (
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: C.textMuted,
          padding: '8px 0 4px',
          lineHeight: 1.55,
        }}
      >
        {copy.emptyPre}{' '}
        <span
          style={{
            fontWeight: 600,
            color: C.text,
            fontFamily: fonts.sans,
          }}
        >
          {copy.followCta}
        </span>{' '}
        {copy.emptyPost}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {isLoading && places.length === 0 ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.textMuted,
          }}
        >
          Loading followed places…
        </div>
      ) : (
        places.map((p) => (
          <div
            key={p.slug}
            style={{
              ...neu.subtle,
              borderRadius: R.lg,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'transparent',
            }}
          >
            <Link
              href={`/places/${p.slug}`}
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: 'none',
                color: C.text,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.25,
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: 0.5,
                  opacity: 0.6,
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                {[p.region, p.country].filter(Boolean).join(' · ')}
              </div>
            </Link>
            <button
              type="button"
              aria-label={`${copy.unfollow} ${p.name}`}
              onClick={() => toggle(p.slug)}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.textMutedStrong,
                padding: '6px 8px',
                cursor: 'pointer',
                fontFamily: fonts.sans,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {copy.unfollow}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
