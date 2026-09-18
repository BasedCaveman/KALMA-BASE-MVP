//kalma/frontend/lib/server/place-name.ts
//
// Defense-in-depth for audit C-2: place names entering public.places can come
// from raw client input (candidate submissions, places/upsert geocode
// fallback) and are later rendered into JSON-LD and SSR HTML. The JSON-LD
// serializer already escapes output; this whitelist keeps markup/control
// characters out of the data at rest too.

const ALLOWED = /[^\p{L}\p{M}\p{N} .,'’()\-\/]/gu;

export function sanitizePlaceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(ALLOWED, '').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return cleaned.length >= 2 ? cleaned : null;
}
