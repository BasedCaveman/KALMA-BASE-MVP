//kalma/frontend/components/shared/Localized.tsx
//
// Client-side localization overlay for the deliberately EN-canonical
// place page (see app/places/[slug]/page.tsx header — task #30/#13).
//
// The place page is server-rendered in English so crawlers and LLMs
// ingest stable English prose. This component keeps that intact: the
// language context starts at 'en' on the server AND on the first client
// paint (see hooks/useTranslation.tsx getBrowserLanguage — it only reads
// localStorage/navigator inside a post-mount useEffect). So:
//   - server render + first hydration paint → renders the `en` prop
//     verbatim (initial HTML unchanged, zero hydration mismatch);
//   - after mount, if the visitor's language !== 'en', it recomputes the
//     localized value from the serializable `compute` descriptor.
//
// One primitive handles every localizable node on the page (signal
// title/body, severity label, weather-context paragraph, comparison
// labels, group chips, market-context copy, static chrome) so the page
// stays structurally a Server Component — we only swap text.

'use client';

import { useTranslation } from '@/hooks/useTranslation';
import {
  resolveSignalString,
  marketContextCopy,
  type Locale,
} from '@/lib/signal-engine/i18n';
import { getSignalComparison } from '@/lib/signal-engine/comparison';
import { groupLabel } from '@/lib/signal-engine/group-labels';
import {
  buildWeatherContext,
  type PlaceCtx,
  type SignalCtx,
} from '@/lib/place-context';
import type { CommodityContextEvent } from '@/lib/signal-engine/commodity-context';

type ComparisonField = 'usualLabel' | 'usualValue' | 'nowLabel' | 'nowValue';

// Every variant carries only JSON-serializable data — these props cross
// the server→client boundary.
type Compute =
  | { kind: 'signalString'; key: string; values?: Record<string, string | number> }
  | { kind: 'tKey'; key: string; values?: Record<string, string | number> }
  | {
      kind: 'comparisonField';
      signalTypeId: string;
      structuredData: Record<string, any>;
      field: ComparisonField;
    }
  | { kind: 'groupLabel'; slug: string }
  | { kind: 'weatherContext'; place: PlaceCtx; signals: SignalCtx[] }
  | { kind: 'marketContext'; event: CommodityContextEvent };

export function Localized({ en, compute }: { en: string; compute: Compute }) {
  const { language, t, tpl } = useTranslation();

  // Fast path — also the exact server + first-paint render. Guarantees the
  // `en` prop (already computed server-side) is what lands in the HTML.
  if (language === 'en') return <>{en}</>;

  const locale = language as Locale;
  let out = en;

  switch (compute.kind) {
    case 'signalString':
      out = resolveSignalString(locale, compute.key, compute.values ?? {});
      break;
    case 'tKey':
      out = compute.values ? tpl(compute.key, compute.values) : t(compute.key);
      break;
    case 'comparisonField': {
      const cmp = getSignalComparison(
        compute.signalTypeId,
        compute.structuredData,
        locale,
      );
      out = cmp ? cmp[compute.field] : en;
      break;
    }
    case 'groupLabel':
      out = groupLabel(locale, compute.slug);
      break;
    case 'weatherContext':
      out = buildWeatherContext(compute.place, compute.signals, locale);
      break;
    case 'marketContext':
      out = marketContextCopy(locale, compute.event) ?? en;
      break;
  }

  return <>{out}</>;
}
