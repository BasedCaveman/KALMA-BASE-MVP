//kalma/frontend/components/signal/LocalizedSignalChart.tsx
//
// Client wrapper that renders the per-signal context chart with its
// labels in the visitor's language. On the place page the chart data is
// otherwise computed server-side in English; this recomputes it from the
// raw structured_data after hydration.
//
// Same crawler-safe contract as components/shared/Localized.tsx: the
// language context is 'en' on the server + first paint, so the initial
// HTML carries the English chart labels; only after mount does a
// non-English visitor get the localized version.

'use client';

import { useTranslation } from '@/hooks/useTranslation';
import { getSignalChartData } from '@/lib/signal-engine/chart-data';
import type { Locale } from '@/lib/signal-engine/i18n';
import SignalContextChart from '@/components/signal/SignalContextChart';

export default function LocalizedSignalChart({
  signalTypeId,
  structuredData,
  evaluatedAt,
  markerColor,
}: {
  signalTypeId: string;
  structuredData: Record<string, any>;
  evaluatedAt: string | null;
  markerColor: string;
}) {
  const { language } = useTranslation();
  const chart = getSignalChartData(
    signalTypeId,
    structuredData,
    evaluatedAt,
    language as Locale,
  );
  if (chart.shape === null) return null;
  return <SignalContextChart data={chart} markerColor={markerColor} />;
}
