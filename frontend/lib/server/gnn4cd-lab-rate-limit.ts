//kalma/frontend/lib/server/gnn4cd-lab-rate-limit.ts

import type { NextRequest } from 'next/server';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';
import { getGnn4cdLabAdminClient } from '@/lib/server/gnn4cd-lab';

export async function checkGnn4cdLabRateLimit(
  request: NextRequest,
  bucket: string,
  options: { limit: number; windowMs: number },
) {
  const supabase = getGnn4cdLabAdminClient();
  if (!supabase) return { allowed: false, hits: 0 };
  return checkIpThrottle(supabase, bucket, hashIp(getClientIp(request)), options);
}

export function gnn4cdLabClientHash(request: NextRequest) {
  return hashIp(getClientIp(request)).slice(0, 16);
}
