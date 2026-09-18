//kalma/frontend/app/api/internal/gnn4cd-lab/status/route.ts

import { NextResponse, type NextRequest } from 'next/server';
import { checkGnn4cdRunnerHealth, getGnn4cdLabCapabilities } from '@/lib/server/gnn4cd-lab';
import { isGnn4cdLabRequestAuthorized } from '@/lib/server/gnn4cd-lab-auth';
import { checkGnn4cdLabRateLimit } from '@/lib/server/gnn4cd-lab-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export async function GET(request: NextRequest) {
  if (!isGnn4cdLabRequestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }
  const throttle = await checkGnn4cdLabRateLimit(request, 'gnn4cd_lab_read', {
    limit: 120,
    windowMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': '900' } },
    );
  }
  const capabilities = getGnn4cdLabCapabilities();
  const health = await checkGnn4cdRunnerHealth();
  return NextResponse.json(
    { ok: true, capabilities, runner_health: health },
    { headers: PRIVATE_HEADERS },
  );
}
