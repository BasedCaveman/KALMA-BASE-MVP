//kalma/frontend/lib/json-ld.ts
//
// Safe serializer for JSON-LD <script type="application/ld+json"> blocks.
// JSON.stringify does NOT escape <, >, & — a "</script>" inside any string
// value (e.g. an attacker-chosen on-chain city name) closes the script tag
// early and the rest is parsed as HTML (stored XSS, audit C-1/C-2).
// Escaping to \uXXXX keeps the output valid JSON while making it inert as
// HTML. U+2028/U+2029 are escaped too (legal in JSON, illegal in JS strings).

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
