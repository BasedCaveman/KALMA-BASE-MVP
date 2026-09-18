// kalma/frontend/lib/ip-rate-limit.ts
//
// Shared client-IP helpers for server-side rate limiting.
//
// The IP is never stored raw — it's hashed with a salt so the persisted value
// can't be reversed to an address. The salt comes from a dedicated env var and
// MUST NOT reuse a high-value secret (the old eth-drip code fell back to
// SUPABASE_SERVICE_ROLE_KEY, which coupled the service-role key into a
// low-value bucketing hash — fixed here by dropping that fallback).
//
// Set IP_HASH_SALT (or the legacy GAS_DRIP_IP_HASH_SALT) in the deployment env
// for a stable per-deployment salt. Local dev falls back to a static,
// non-secret default so the app keeps running; production must set the env var
// before making privacy claims about stored IP hashes.

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export function getClientIp(req: NextRequest): string {
  // SECURITY: do not trust the leftmost `x-forwarded-for` value. A client can
  // send its own `x-forwarded-for` header; the platform appends the real hop,
  // it does not overwrite the attacker-controlled leftmost entry. Bucketing a
  // rate limit on that value lets an attacker rotate fake IPs and bypass every
  // per-IP cooldown. On Vercel, `x-real-ip` is set by the edge to the true
  // connecting client IP and is not client-spoofable — prefer it.
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // Fallback for non-Vercel / local dev (where x-real-ip is absent). Take the
  // LAST hop in the chain — the entry added by the nearest trusted proxy —
  // rather than the spoofable leftmost one.
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const hops = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return 'unknown';
}

export function hashIp(ip: string): string {
  const salt =
    process.env.IP_HASH_SALT ||
    process.env.GAS_DRIP_IP_HASH_SALT;
  if (!salt && process.env.NODE_ENV === 'production') {
    throw new Error('Missing IP_HASH_SALT in production environment');
  }
  return createHash('sha256').update(`${salt || 'kalma-ip-hash-v1'}:${ip}`).digest('hex');
}

// ── Generic per-IP rolling-window throttle ──────────────────────────────────
//
// Backed by public.ip_throttle (see 20260610_ip_throttle.sql): one row per
// accepted hit, counted per (bucket, ip_hash) over a rolling window. Used by
// routes that do privileged server-side work for unauthenticated callers
// (test-credits owner-key mints, places catalog inserts).
//
// Fail-open by design: if the throttle storage errors, the route proceeds —
// these are testnet abuse caps, not authentication, and a Supabase blip must
// not take the faucet down with it.

export type IpThrottleResult = { allowed: boolean; hits: number };

export async function checkIpThrottle(
  supabase: SupabaseClient,
  bucket: string,
  ipHash: string,
  opts: { limit: number; windowMs: number },
): Promise<IpThrottleResult> {
  if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
    return { allowed: true, hits: 0 };
  }

  try {
    const since = new Date(Date.now() - opts.windowMs).toISOString();

    // Opportunistic cleanup keeps the table bounded without a cron.
    await supabase
      .from('ip_throttle')
      .delete()
      .eq('bucket', bucket)
      .eq('ip_hash', ipHash)
      .lt('hit_at', since);

    const { count, error: countError } = await supabase
      .from('ip_throttle')
      .select('hit_at', { count: 'exact', head: true })
      .eq('bucket', bucket)
      .eq('ip_hash', ipHash)
      .gte('hit_at', since);
    if (countError) throw countError;

    const hits = count ?? 0;
    if (hits >= opts.limit) return { allowed: false, hits };

    const { error: insertError } = await supabase
      .from('ip_throttle')
      .insert({ bucket, ip_hash: ipHash });
    if (insertError) throw insertError;

    return { allowed: true, hits: hits + 1 };
  } catch (error) {
    console.warn(`[ip-throttle] ${bucket} storage error (failing open):`, error);
    return { allowed: true, hits: 0 };
  }
}
