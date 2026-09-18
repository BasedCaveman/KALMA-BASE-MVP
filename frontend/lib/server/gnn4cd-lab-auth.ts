//kalma/frontend/lib/server/gnn4cd-lab-auth.ts

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const GNN4CD_LAB_COOKIE = 'kalma_gnn4cd_lab';
export const GNN4CD_LAB_COOKIE_MAX_AGE = 8 * 60 * 60;

function labSecret() {
  return process.env.GNN4CD_LAB_SECRET || process.env.CRON_SECRET || null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isGnn4cdLabConfigured() {
  return labSecret() != null;
}

export function verifyGnn4cdLabSecret(candidate: string) {
  const expected = labSecret();
  return expected != null && safeEqual(candidate, expected);
}

export function gnn4cdLabSessionToken() {
  const secret = labSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update('kalma-gnn4cd-lab-session-v1').digest('hex');
}

export function verifyGnn4cdLabSession(candidate: string | undefined) {
  const expected = gnn4cdLabSessionToken();
  return expected != null && candidate != null && safeEqual(candidate, expected);
}

export function isGnn4cdLabRequestAuthorized(request: NextRequest) {
  const cookieToken = request.cookies.get(GNN4CD_LAB_COOKIE)?.value;
  if (verifyGnn4cdLabSession(cookieToken)) return true;

  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  return verifyGnn4cdLabSecret(bearer);
}

export function isSameOriginMutation(request: NextRequest) {
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
