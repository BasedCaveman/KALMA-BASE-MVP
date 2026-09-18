// kalma/frontend/components/landing/LandingNow.tsx
//
// The first thing on the home page: something true, local, and happening now.
//
// WHY THIS EXISTS. Until 2026-08-05 the landing opened with a six-line serif
// headline promising that Kalma helps you "read the weather clearly before it
// turns into a problem", then a paragraph explaining the method, and only then
// a form asking the visitor to pick a city. The entire first screen contained
// no weather: no place, no temperature, no warning, no number. It asked for
// work before showing anything worth the work, and the primary button said
// "Use my location", which asks the visitor for something instead of offering
// them something.
//
// Meanwhile the product knows ~490 live signals across 238 places and a couple
// of dozen active government warnings at any moment. The most persuasive thing
// Kalma owns is that it knows things RIGHT NOW, and the front door hid all of
// it. This block inverts that: show, then ask.
//
// TWO AUDIENCES, ONE BLOCK. The server renders the global live facts, which is
// what an AI crawler ingests (the home is the citability surface: EN-canonical
// SSR, FAQPage + WebSite JSON-LD). After hydration, a visitor we can place by
// approximate IP gets their OWN nearest place instead. Crawler and human both
// get something concrete; neither gets a promise.

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { resolveSignalString, type Locale } from '@/lib/signal-engine/i18n';
import { getSignalComparison } from '@/lib/signal-engine/comparison';
import { useCitySearch, type CitySearchResult } from '@/hooks/useCitySearch';
import { PLACE_MATCH_MAX_KM } from '@/components/landing/IntentLauncher';
import PlaceDailyQuestionLazy from '@/components/pulse/PlaceDailyQuestionLazy';
import { logPlaceCandidate } from '@/lib/place-candidate';

type Nearest = {
  slug: string;
  name: string;
  region: string | null;
  km: number;
  signalTypeId: string | null;
  severity: string | null;
  structuredData: Record<string, unknown> | null;
};

const COPY: Record<string, {
  nearYou: string;
  liveNow: string;
  open: string;
  quiet: string;
  /** {signals} signals in {places} places. {alerts} official warnings active. */
  stats: string;
  unusualAbove: string;
  pastLine: string;
  change: string;
  searchPlaceholder: string;
  quietSoon: string;
}> = {
  en: {
    nearYou: 'Right now, near you',
    liveNow: 'Right now',
    open: 'Open {place}',
    quiet: 'Nothing unusual here today. That is worth knowing too.',
    stats: '{signals} live signals in {places} places · {alerts} official warnings active',
    unusualAbove: "Unusual above",
    pastLine: "Past the line this place is normally under.",
    change: "Another place",
    searchPlaceholder: "Search a city",
    quietSoon: "No signal here yet. Cities that get searched enter the catalogue on one of the next passes.",
  },
  pt: {
    nearYou: 'Agora, perto de você',
    liveNow: 'Agora',
    open: 'Abrir {place}',
    quiet: 'Nada fora do normal aqui hoje. Isso também é informação.',
    stats: '{signals} sinais ativos em {places} lugares · {alerts} avisos oficiais vigentes',
    unusualAbove: "Incomum acima de",
    pastLine: "Passou da linha que este lugar normalmente não cruza.",
    change: "Outro lugar",
    searchPlaceholder: "Buscar cidade",
    quietSoon: "Ainda sem sinal aqui. Cidades buscadas entram no catálogo em uma das próximas leituras.",
  },
  es: {
    nearYou: 'Ahora, cerca de ti',
    liveNow: 'Ahora',
    open: 'Abrir {place}',
    quiet: 'Nada fuera de lo normal hoy aquí. Eso también es información.',
    stats: '{signals} señales activas en {places} lugares · {alerts} avisos oficiales vigentes',
    unusualAbove: "Inusual por encima de",
    pastLine: "Pasó la línea que este lugar normalmente no cruza.",
    change: "Otro lugar",
    searchPlaceholder: "Buscar ciudad",
    quietSoon: "Aún sin señal aquí. Las ciudades buscadas entran al catálogo en una de las próximas lecturas.",
  },
  fr: {
    nearYou: 'En ce moment, près de toi',
    liveNow: 'En ce moment',
    open: 'Ouvrir {place}',
    quiet: "Rien d'inhabituel ici aujourd'hui. C'est aussi une information.",
    stats: '{signals} signaux actifs dans {places} lieux · {alerts} alertes officielles en cours',
    unusualAbove: "Inhabituel au-dessus de",
    pastLine: "Au-delà de la ligne que ce lieu ne franchit pas d'habitude.",
    change: "Un autre lieu",
    searchPlaceholder: "Chercher une ville",
    quietSoon: "Pas encore de signal ici. Les villes recherchées entrent au catalogue lors d'un prochain passage.",
  },
  de: {
    nearYou: 'Jetzt, in deiner Nähe',
    liveNow: 'Jetzt',
    open: '{place} öffnen',
    quiet: 'Heute nichts Ungewöhnliches hier. Auch das ist eine Information.',
    stats: '{signals} aktive Signale an {places} Orten · {alerts} amtliche Warnungen aktiv',
    unusualAbove: "Ungewöhnlich über",
    pastLine: "Über der Linie, die dieser Ort normalerweise nicht überschreitet.",
    change: "Ein anderer Ort",
    searchPlaceholder: "Stadt suchen",
    quietSoon: "Hier noch kein Signal. Gesuchte Städte kommen bei einem der nächsten Durchläufe in den Katalog.",
  },
  zh: {
    nearYou: '此刻，你附近',
    liveNow: '此刻',
    open: '打开{place}',
    quiet: '今天这里没有异常。这也是一种信息。',
    stats: '{places} 个地点有 {signals} 条活跃信号 · {alerts} 条官方预警生效中',
    unusualAbove: "异常高于",
    pastLine: "已越过这个地方通常不会越过的界线。",
    change: "换个地方",
    searchPlaceholder: "搜索城市",
    quietSoon: "这里还没有信号。被搜索过的城市会在接下来的某次读取中进入目录。",
  },
};

const TONE: Record<string, 'below' | 'label' | 'accent'> = {
  extreme: 'below',
  high: 'below',
  medium: 'label',
  moderate: 'label',
  low: 'accent',
};

export default function LandingNow({
  activeSignalCount,
  activePlaceCount,
  activeAlertCount,
  /** Most severe signal anywhere right now, rendered before we can place the visitor. */
  globalLead,
}: {
  activeSignalCount: number;
  activePlaceCount: number;
  activeAlertCount: number;
  globalLead: {
    signalTypeId: string;
    severity: string;
    placeName: string;
    placeSlug: string;
    structuredData: Record<string, unknown> | null;
  } | null;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = COPY[language] ?? COPY.en;
  const locale = (language as Locale) ?? 'en';

  const [near, setNear] = useState<Nearest | null>(null);

  // In-card city search. Pedro's case: someone sitting in Carrancas who wants
  // Lavras had to scroll a whole fold to the launcher. The card had the room.
  // Reuses the launcher's geocoder AND its 60km rule, imported rather than
  // re-stated, so the two entry points can never disagree about what counts as
  // "this place".
  const { results, isSearching, searchCities, clearCitySearch } = useCitySearch();
  const [pendingPlace, setPendingPlace] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [query, setQuery] = useState('');

  async function pick(lat: number, lon: number, picked: CitySearchResult) {
    try {
      const res = await fetch(
        `/api/places/nearest?lat=${lat}&lon=${lon}&limit=1&withSignal=1`,
      ).then((r) => (r.ok ? r.json() : null));
      const place = res?.places?.[0];
      if (place && place.km <= PLACE_MATCH_MAX_KM) {
        setNear({
          slug: place.slug,
          name: place.name,
          region: place.region ?? null,
          km: place.km,
          signalTypeId: res.leadSignal?.signalTypeId ?? null,
          severity: res.leadSignal?.severity ?? null,
          structuredData: res.leadSignal?.structuredData ?? null,
        });
        setChanging(false);
        setQuery('');
        clearCitySearch();
        return;
      }
      // Beyond the rule the two are different weather. Register the demand and
      // say plainly that the place has no reading yet, rather than showing a
      // neighbouring city's signal as if it were theirs.
      //
      // Through the SHARED helper, not a raw fetch. The first version here
      // posted by hand and dropped region/country, which is why the Nepal
      // search of 2026-08-05 landed with country NULL while every other
      // surface records it. Five entry points feed this funnel; they all go
      // through one door.
      logPlaceCandidate({
        name: picked.name,
        region: picked.admin1 ?? null,
        country: picked.country ?? null,
        country_code: picked.country_code ?? null,
        lat,
        lon,
        feature_code: picked.feature_code ?? null,
      });
      setPendingPlace(picked.name);
      setChanging(false);
      setQuery('');
      clearCitySearch();
    } catch {
      /* leave the card as it was */
    }
  }


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loc = await fetch('/api/approximate-location').then((r) => (r.ok ? r.json() : null));
        if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;
        const res = await fetch(
          `/api/places/nearest?lat=${loc.lat}&lon=${loc.lon}&limit=1&withSignal=1`,
        ).then((r) => (r.ok ? r.json() : null));
        const place = res?.places?.[0];
        if (cancelled || !place) return;
        setNear({
          slug: place.slug,
          name: place.name,
          region: place.region ?? null,
          km: place.km,
          signalTypeId: res.leadSignal?.signalTypeId ?? null,
          severity: res.leadSignal?.severity ?? null,
          structuredData: res.leadSignal?.structuredData ?? null,
        });
      } catch {
        /* stay on the global view; never break the home for a lookup */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Which story we are telling: the visitor's own place once we know it,
  // otherwise the most severe thing happening anywhere.
  const headline = near ? copy.nearYou : copy.liveNow;
  const placeName = near?.name ?? globalLead?.placeName ?? null;
  const placeSlug = near?.slug ?? globalLead?.placeSlug ?? null;
  const signalTypeId = near ? near.signalTypeId : globalLead?.signalTypeId ?? null;
  const severity = (near ? near.severity : globalLead?.severity ?? null) ?? null;
  const structuredData = near ? near.structuredData : globalLead?.structuredData ?? null;

  if (!placeName || !placeSlug) return null;

  const title = signalTypeId
    ? resolveSignalString(locale, `signals.${signalTypeId}.title`, {})
    : null;
  const toneKey = TONE[String(severity ?? '').toLowerCase()] ?? 'accent';
  const tone = toneKey === 'below' ? C.below : toneKey === 'label' ? C.label : C.accent;

  // THE differentiator, in one line: not the forecast, the deviation from what
  // this exact place normally sees. A conventional weather app can tell you it
  // will rain 68mm; only this can tell you 12mm is normal here.
  const comparison = signalTypeId
    ? getSignalComparison(signalTypeId, structuredData ?? {}, locale)
    : null;
  const usualNum = comparison ? parseFloat(comparison.usualValue) : NaN;
  const nowNum = comparison ? parseFloat(comparison.nowValue) : NaN;

  // The threshold of unusual for this exact place, when the engine recorded
  // one (baseline_p90_*). Without it the two bars are anchored at zero, and a
  // 23.4C normal against a 28.6C forecast reads as two nearly equal bars even
  // though 5.2C over a weekly average is the entire reason the signal fired.
  // The p90 line is what makes the picture say something: the forecast is past
  // the line this place is normally under.
  const p90Key = Object.keys(structuredData ?? {}).find((k) => k.includes('_p90'));
  const p90Num = p90Key ? Number((structuredData as any)[p90Key]) : NaN;
  const hasP90 = Number.isFinite(p90Num);

  // Scale from the normal value, not from zero, and say so in the axis labels.
  // A truncated axis is only dishonest when it is unlabelled; every number here
  // is on screen next to its bar.
  const rawLo = Math.min(usualNum, nowNum, hasP90 ? p90Num : Infinity);
  const hi = Math.max(usualNum, nowNum, hasP90 ? p90Num : -Infinity);
  // Headroom below the smallest value. Anchoring the axis exactly at the
  // minimum made the minimum vanish: the normal rendered at 4% and read as
  // "almost nothing", when it is the reference everything else is measured
  // against. The axis now starts below it so the normal keeps real presence
  // and the gap above it is what the eye compares.
  const rawSpan = hi - rawLo;
  const lo = rawSpan > 0 ? rawLo - rawSpan * 0.8 : rawLo;
  const span = hi - lo;
  const pos = (v: number) =>
    span > 0 ? Math.max(0.06, Math.min(1, (v - lo) / span)) : 1;
  const ratio =
    Number.isFinite(usualNum) && Number.isFinite(nowNum) ? pos(Math.min(usualNum, nowNum)) : null;

  const stats = copy.stats
    .replace('{signals}', String(activeSignalCount))
    .replace('{places}', String(activePlaceCount))
    .replace('{alerts}', String(activeAlertCount));

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Two panels, one composition: what the data says beside what you can
          add. The second column is deliberately the daily question and not a
          community feed. Measured 2026-08-05: 1 observation in 7 days and 3
          places out of 238 with any observation ever, so a column that
          REPORTED community activity would read "nothing here" almost
          everywhere and make the home look dead. A question is generated for
          every place, every day, so this column is never empty, and it puts
          the one-tap loop on the front door instead of three folds down. */}
      <div className="k-duo">
      <div
        className="k-rise"
        style={{
          ...neu.panelRaised,
          borderRadius: R.xl,
          padding: '16px 16px 14px',
          border: `1px solid ${tone}44`,
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: C.textMutedStrong,
            marginBottom: 10,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 26,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
            color: C.text,
            marginBottom: title ? 8 : 14,
          }}
        >
          {placeName}
        </div>

        {title ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
            {severity ? (
              <span
                style={{
                  flexShrink: 0,
                  padding: '3px 9px',
                  borderRadius: R.pill,
                  border: `1px solid ${tone}`,
                  background: `${tone}22`,
                  color: C.text,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                {resolveSignalString(locale, `signals.severity.${String(severity).toLowerCase()}`, {}) ||
                  String(severity)}
              </span>
            ) : null}
            <span
              style={{
                fontFamily: fonts.sans,
                fontSize: 15,
                lineHeight: 1.4,
                color: C.textSoft,
              }}
            >
              {title}
            </span>
          </div>
        ) : (
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              lineHeight: 1.5,
              color: C.textMuted,
              marginBottom: 14,
            }}
          >
            {copy.quiet}
          </div>
        )}

        {/* The deviation, drawn. Two bars against the same scale: what this
            place normally sees, and what is forecast. This is the one beat
            worth animating on the page, and it is animated for a reason the
            framework allows (explanation, not decoration): the growing bar is
            the product's whole argument made visible in 420ms. A number alone
            states the gap; the bar makes you feel it. */}
        {comparison && ratio !== null ? (
          <div style={{ display: 'grid', gap: 7, marginBottom: 16 }}>
            {[
              { label: comparison.usualLabel, value: comparison.usualValue, v: usualNum, kind: 'usual' as const },
              ...(hasP90
                ? [{ label: copy.unusualAbove, value: `${p90Num}${comparison.nowValue.replace(/[\d.,-]/g, '')}`, v: p90Num, kind: 'threshold' as const }]
                : []),
              { label: comparison.nowLabel, value: comparison.nowValue, v: nowNum, kind: 'now' as const },
            ].map((row, i) => {
              const crosses = row.kind === 'now' && hasP90 && nowNum > p90Num;
              const color =
                row.kind === 'usual' ? `${C.textMuted}66` : row.kind === 'threshold' ? `${C.label}88` : tone;
              return (
                <div key={row.label} style={{ display: 'grid', gap: 3 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontFamily: fonts.mono,
                      fontSize: 10,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: row.kind === 'now' ? C.text : C.textMuted,
                    }}
                  >
                    <span>{row.label}</span>
                    <span style={{ fontWeight: 700 }}>{row.value}</span>
                  </div>
                  <div
                    style={{
                      height: row.kind === 'threshold' ? 2 : 6,
                      borderRadius: 999,
                      background: `${C.divider}55`,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      className="k-grow"
                      style={{
                        height: '100%',
                        borderRadius: 999,
                        background: color,
                        width: `${Math.round(pos(row.v) * 100)}%`,
                        transformOrigin: 'left',
                        animation: 'k-grow-bar 420ms var(--k-ease-out) both',
                        animationDelay: `${200 + i * 90}ms`,
                      }}
                    />
                  </div>
                  {crosses ? (
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 12,
                        color: tone,
                        lineHeight: 1.4,
                        marginTop: 2,
                      }}
                    >
                      {copy.pastLine}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Offers a place, not a permission prompt. "Use my location" asked the
            visitor for something; this hands them somewhere to go. */}
        <Link
          href={`/places/${placeSlug}`}
          className="k-press"
          style={{
            ...neu.controlRaised,
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '9px 16px',
            borderRadius: R.md,
            border: 'none',
            background: C.accent,
            color: C.bg,
            fontFamily: fonts.sans,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.1,
            textDecoration: 'none',
            alignSelf: 'start',
          }}
        >
          {copy.open.replace('{place}', placeName)} →
        </Link>

        {/* Change city, without leaving the card. */}
        <div style={{ marginTop: 12 }}>
          {!changing ? (
            <button
              type="button"
              onClick={() => setChanging(true)}
              style={{
                border: 'none',
                background: 'none',
                padding: '6px 0',
                minHeight: 44,
                color: C.textMutedStrong,
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              {copy.change}
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.trim().length >= 3) void searchCities(e.target.value);
                }}
                placeholder={copy.searchPlaceholder}
                style={{
                  ...neu.controlPressed,
                  minHeight: 44,
                  border: 'none',
                  borderRadius: R.md,
                  padding: '10px 12px',
                  background: C.surfaceDeep,
                  color: C.text,
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              {isSearching ? null : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {results.slice(0, 4).map((r) => (
                    <button
                      key={`${r.name}-${r.latitude}-${r.longitude}`}
                      type="button"
                      onClick={() => void pick(r.latitude, r.longitude, r)}
                      style={{
                        textAlign: 'left',
                        minHeight: 44,
                        padding: '8px 10px',
                        borderRadius: R.md,
                        border: `1px solid ${C.divider}`,
                        background: 'transparent',
                        color: C.text,
                        fontFamily: fonts.sans,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {r.name}
                      <span style={{ color: C.textMuted }}>
                        {r.admin1 ? `, ${r.admin1}` : ''}{r.country ? `, ${r.country}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* A place beyond the 60km rule has no reading of its own yet. Say
              when it will, instead of showing a neighbour's signal as theirs. */}
          {pendingPlace ? (
            <div
              style={{
                marginTop: 10,
                fontFamily: fonts.sans,
                fontSize: 12,
                color: C.textMuted,
                lineHeight: 1.5,
              }}
            >
              {pendingPlace}: {copy.quietSoon}
            </div>
          ) : null}
        </div>
      </div>

      <PlaceDailyQuestionLazy placeSlug={placeSlug} placeName={placeName} />
      </div>

      <div
        style={{
          marginTop: 12,
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: C.textMuted,
          lineHeight: 1.6,
        }}
      >
        {stats}
      </div>
    </section>
  );
}
