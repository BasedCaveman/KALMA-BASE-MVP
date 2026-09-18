// kalma/frontend/app/markets/[id]/layout.tsx
//
// CO-3: server layout so each shared signal carries a real link preview.
// The page itself is a client component and can't export generateMetadata,
// so this thin server wrapper supplies og:title (the question) + description.
// The og:image is auto-attached by Next from the sibling opengraph-image.tsx.

import type { Metadata } from 'next';
import { readMarketForShare } from '@/lib/server/market-read';
import { marketQuestion } from '@/lib/market-question';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const m = await readMarketForShare(Number(id));

  if (!m) {
    return {
      title: 'Weather signal',
      description: 'Answer Above or Below on a local weather question. Kalma — local weather intelligence.',
    };
  }

  const question = marketQuestion('en', m);
  const place = m.cityName.split(',')[0].trim();
  const description = m.resolved
    ? `${place} · the weather has answered. See how the community called it on Kalma.`
    : `${place} · ${m.abovePct}% say Above, ${m.belowPct}% Below · ${m.participantCount} answering · ${m.daysLeft}d left. Make your call on Kalma.`;

  return {
    title: question,
    description,
    openGraph: {
      title: question,
      description,
      type: 'website',
      siteName: 'Kalma',
    },
    twitter: {
      card: 'summary_large_image',
      title: question,
      description,
    },
  };
}

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
