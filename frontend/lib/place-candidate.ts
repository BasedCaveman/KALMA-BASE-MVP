// kalma/frontend/lib/place-candidate.ts
//
// Fire-and-forget logger for the "catalog grows with demand" pipeline.
// Call logPlaceCandidate() when a user SELECTS a city in any geocoder
// surface (LocationPicker, /create city search, IntentLauncher). It POSTs
// the chosen result to /api/places/candidate, which dedupes by grid and
// bumps a demand counter the signal-engine cron uses to promote popular
// cities into public.places.
//
// Deliberately swallows all errors and never returns anything the caller
// needs to await — recording demand must never block or break the UI.

export type PlaceCandidateInput = {
  name: string;
  region?: string | null;
  region_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  lat: number;
  lon: number;
  /** Open-Meteo feature_code. The route uses it to reject countries and
   *  administrative divisions, which are not places anyone stands in. */
  feature_code?: string | null;
};

export function logPlaceCandidate(input: PlaceCandidateInput): void {
  if (
    typeof input?.name !== 'string' ||
    typeof input.lat !== 'number' ||
    typeof input.lon !== 'number'
  ) {
    return;
  }
  try {
    void fetch('/api/places/candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      keepalive: true, // survive a navigation right after selecting
    }).catch(() => {});
  } catch {
    // ignore — demand logging is best-effort
  }
}
