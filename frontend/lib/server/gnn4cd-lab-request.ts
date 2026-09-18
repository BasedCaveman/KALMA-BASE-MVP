//kalma/frontend/lib/server/gnn4cd-lab-request.ts

import type { NextRequest } from 'next/server';

export class Gnn4cdLabPayloadTooLargeError extends Error {
  constructor() {
    super('GNN4CD lab request payload is too large.');
    this.name = 'Gnn4cdLabPayloadTooLargeError';
  }
}

export async function readGnn4cdLabRequestText(request: NextRequest, maxBytes: number) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Gnn4cdLabPayloadTooLargeError();
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Gnn4cdLabPayloadTooLargeError();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, bytes).toString('utf8');
}
