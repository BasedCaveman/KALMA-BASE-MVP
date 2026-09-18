//kalma/frontend/app/operator-console-9f3x/gnn4cd-lab/access/route.ts

import { NextResponse, type NextRequest } from 'next/server';
import {
  GNN4CD_LAB_COOKIE,
  GNN4CD_LAB_COOKIE_MAX_AGE,
  gnn4cdLabSessionToken,
  isGnn4cdLabConfigured,
  verifyGnn4cdLabSecret,
} from '@/lib/server/gnn4cd-lab-auth';
import {
  checkGnn4cdLabRateLimit,
  gnn4cdLabClientHash,
} from '@/lib/server/gnn4cd-lab-rate-limit';
import {
  Gnn4cdLabPayloadTooLargeError,
  readGnn4cdLabRequestText,
} from '@/lib/server/gnn4cd-lab-request';

export const runtime = 'nodejs';

const MAX_ACCESS_BODY_BYTES = 4_096;

export async function POST(request: NextRequest) {
  const destination = new URL('/operator-console-9f3x/gnn4cd-lab', request.url);
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(
      await readGnn4cdLabRequestText(request, MAX_ACCESS_BODY_BYTES),
    );
  } catch (error) {
    if (error instanceof Gnn4cdLabPayloadTooLargeError) {
      destination.searchParams.set('error', 'payload-too-large');
      return NextResponse.redirect(destination, { status: 303 });
    }
    destination.searchParams.set('error', 'invalid');
    return NextResponse.redirect(destination, { status: 303 });
  }

  const action = String(form.get('action') ?? 'login');
  const response = NextResponse.redirect(destination, { status: 303 });

  if (action === 'logout') {
    response.cookies.set(GNN4CD_LAB_COOKIE, '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: '/',
    });
    return response;
  }

  if (!isGnn4cdLabConfigured()) {
    destination.searchParams.set('error', 'not-configured');
    return NextResponse.redirect(destination, { status: 303 });
  }

  const throttle = await checkGnn4cdLabRateLimit(request, 'gnn4cd_lab_login', {
    limit: 12,
    windowMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) {
    console.warn('[gnn4cd-lab] login rate limited', {
      client_hash: gnn4cdLabClientHash(request),
    });
    destination.searchParams.set('error', 'rate-limited');
    return NextResponse.redirect(destination, { status: 303 });
  }

  const secret = String(form.get('secret') ?? '');
  const token = gnn4cdLabSessionToken();
  if (!verifyGnn4cdLabSecret(secret) || !token) {
    console.warn('[gnn4cd-lab] rejected login', {
      client_hash: gnn4cdLabClientHash(request),
    });
    destination.searchParams.set('error', 'invalid');
    return NextResponse.redirect(destination, { status: 303 });
  }

  response.cookies.set(GNN4CD_LAB_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: GNN4CD_LAB_COOKIE_MAX_AGE,
    path: '/',
  });
  return response;
}
