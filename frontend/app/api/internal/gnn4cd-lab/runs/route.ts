//kalma/frontend/app/api/internal/gnn4cd-lab/runs/route.ts

import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { gnn4cdRunRequestSchema } from '@/lib/gnn4cd-lab/contracts';
import {
  importGnn4cdResult,
  listGnn4cdRuns,
  runGnn4cdBacktest,
} from '@/lib/server/gnn4cd-lab';
import {
  isGnn4cdLabRequestAuthorized,
  isSameOriginMutation,
} from '@/lib/server/gnn4cd-lab-auth';
import { checkGnn4cdLabRateLimit } from '@/lib/server/gnn4cd-lab-rate-limit';
import {
  Gnn4cdLabPayloadTooLargeError,
  readGnn4cdLabRequestText,
} from '@/lib/server/gnn4cd-lab-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

const MAX_IMPORT_BODY_BYTES = 3_000_000;

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false, error: 'rate_limited' },
    {
      status: 429,
      headers: { ...PRIVATE_HEADERS, 'Retry-After': String(retryAfterSeconds) },
    },
  );
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: 'unauthorized' },
    { status: 401, headers: PRIVATE_HEADERS },
  );
}

export async function GET(request: NextRequest) {
  if (!isGnn4cdLabRequestAuthorized(request)) return unauthorized();
  const throttle = await checkGnn4cdLabRateLimit(request, 'gnn4cd_lab_read', {
    limit: 120,
    windowMs: 15 * 60 * 1000,
  });
  if (!throttle.allowed) return rateLimited(15 * 60);
  try {
    const data = await listGnn4cdRuns();
    return NextResponse.json({ ok: true, ...data }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'runs_unavailable',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isGnn4cdLabRequestAuthorized(request)) return unauthorized();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { ok: false, error: 'origin_rejected' },
      { status: 403, headers: PRIVATE_HEADERS },
    );
  }

  const throttle = await checkGnn4cdLabRateLimit(request, 'gnn4cd_lab_mutation', {
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!throttle.allowed) return rateLimited(60 * 60);

  try {
    const rawBody = await readGnn4cdLabRequestText(request, MAX_IMPORT_BODY_BYTES);
    const body = gnn4cdRunRequestSchema.parse(JSON.parse(rawBody));
    const runId =
      body.mode === 'import'
        ? await importGnn4cdResult(body.result)
        : await runGnn4cdBacktest(body);
    return NextResponse.json({ ok: true, run_id: runId }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof Gnn4cdLabPayloadTooLargeError) {
      return NextResponse.json(
        { ok: false, error: 'payload_too_large' },
        { status: 413, headers: PRIVATE_HEADERS },
      );
    }
    const validation = error instanceof ZodError || error instanceof SyntaxError;
    return NextResponse.json(
      {
        ok: false,
        error: validation ? 'invalid_run' : 'run_failed',
        message:
          error instanceof ZodError
            ? error.issues
            : error instanceof SyntaxError
              ? 'Request body must be valid JSON.'
              : error instanceof Error
                ? error.message
                : String(error),
      },
      { status: validation ? 400 : 502, headers: PRIVATE_HEADERS },
    );
  }
}
