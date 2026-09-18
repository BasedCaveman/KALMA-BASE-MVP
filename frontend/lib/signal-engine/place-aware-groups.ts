// kalma/frontend/lib/signal-engine/place-aware-groups.ts
//
// Filter the "affected groups" chips on a signal card so we don't
// claim, for instance, that "coffee growers" will be affected by a
// signal in Washington State — Washington's climate doesn't support
// commercial coffee farming, so the chip is noise.
//
// The signal engine currently copies the per-type default group list
// from `signal_type_registry.affected_groups` onto every emitted
// signal regardless of place. This module lives on the render side:
// it intersects that list with a per-group geographic predicate so
// only locally-plausible groups appear in the UI.
//
// Heuristic, not exhaustive. We use latitude bands as a first cut.
// Real-world fit also depends on altitude, precipitation regime, and
// soil — none of which we model here. Generic groups (farmers,
// tourism, construction, etc.) always pass through; only the
// crop-specific ones carry predicates.
//
// If a predicate filters everything to zero we fall back to the
// generic groups in the list (or nothing, if there are no generic
// groups). Better to show nothing than something wrong.

import {
  canonicalGroup,
  isSpecificGroup,
} from './activity-profile';

export type PlaceGeo = {
  lat: number;
  lon: number;
  country?: string | null;
  region?: string | null;
};

type Predicate = (place: PlaceGeo) => boolean;

/** Coffee belt — roughly 28°N to 28°S. Includes Hawaii (US) and the
 *  southern fringe of subtropical farming regions. Washington (~47°N),
 *  Patagonia (-50°S) and northern Europe land outside. */
const tropicalOrSubtropical: Predicate = (p) => Math.abs(p.lat) <= 28;

/** Classic vineyard / grape latitude bands. 28°-55° on each
 *  hemisphere covers Bordeaux (45°N), Napa (38°N), Mendoza (-33°S),
 *  Barossa (-35°S), and stretches to Mosel (50°N) and the southern
 *  tip of New Zealand (-45°S). Excludes the deep tropics. */
const grapeLatitudes: Predicate = (p) => {
  const a = Math.abs(p.lat);
  return a >= 28 && a <= 55;
};

/** Soy farming concentrates in midlatitudes (US Midwest, Argentina,
 *  Brazilian Cerrado at the southern edge). Skip the deep tropics
 *  and high latitudes. */
const soyLatitudes: Predicate = (p) => {
  const a = Math.abs(p.lat);
  return a >= 12 && a <= 50;
};

/** Beans grow widely — from tropical highlands to temperate
 *  farmlands. We only exclude polar and near-polar latitudes. */
const beanLatitudes: Predicate = (p) => Math.abs(p.lat) <= 55;

/** Horticulture and orchards aren't deeply tropical operations;
 *  fruit cultivation usually wants seasonal temperature swings. */
const notDeepTropics: Predicate = (p) => Math.abs(p.lat) >= 12;

// Predicate map keyed by the exact group string used in
// signal_type_registry. Add to this as new signal types ship new
// crop-specific groups. Groups not listed here are universal and
// always pass through (farmers, tourism, construction, logistics,
// hydro_operators, drainage_operators, livestock, etc.).
const GROUP_PREDICATES: Record<string, Predicate> = {
  // Coffee — tropical / subtropical only.
  coffee_growers: tropicalOrSubtropical,
  coffee_farmers: tropicalOrSubtropical,

  // Grapes / wine — temperate bands.
  vineyards: grapeLatitudes,
  grape_growers: grapeLatitudes,

  // Soy — midlatitudes.
  soy_farmers: soyLatitudes,

  // Beans — broad, but not polar.
  bean_farmers: beanLatitudes,

  // Orchards / horticulture — not deep tropics.
  orchards: notDeepTropics,
  horticulture: notDeepTropics,
};

/**
 * Filter the affected_groups list to those that plausibly exist at
 * the signal's place. Universal groups (no predicate) always stay.
 * Crop-specific groups are dropped if their geographic predicate
 * fails for the place.
 *
 * If filtering removes every group, returns an empty array — the
 * SignalCard chip row already conditionally renders only when there's
 * at least one group, so an empty result hides the row entirely
 * (better than showing wrong information).
 */
export function filterAffectedGroups(
  groups: string[],
  place: PlaceGeo,
  profileGroups?: string[] | null,
  communityGroups?: string[] | null,
): string[] {
  if (!groups || groups.length === 0) return [];

  const community = new Set(
    (Array.isArray(communityGroups) ? communityGroups : []).map(canonicalGroup),
  );

  // Evidence beats geometry: when the place has a verified activity
  // profile (place_activity_profiles, Wikipedia-derived), activity-
  // specific groups are kept iff the profile documents them, and the
  // latitude heuristics below are skipped entirely. This also corrects
  // legacy signals emitted before the engine started refining groups.
  if (Array.isArray(profileGroups)) {
    const evidenced = new Set(profileGroups.map(canonicalGroup));
    return groups.filter(
      (g) =>
        !isSpecificGroup(g) ||
        evidenced.has(canonicalGroup(g)) ||
        community.has(canonicalGroup(g)),
    );
  }

  if (
    typeof place.lat !== 'number' ||
    typeof place.lon !== 'number' ||
    Number.isNaN(place.lat) ||
    Number.isNaN(place.lon)
  ) {
    // No location data — fall back to the unfiltered list rather than
    // hiding everything. This shouldn't happen in practice because
    // place rows always have coords, but the guard keeps the chip
    // row resilient.
    return groups;
  }

  return groups.filter((g) => {
    // No trusted article, but neighbours have reported the activity: that
    // is evidence, and evidence beats a latitude band. This is what lets
    // the loop reach the small rural places where Wikipedia is thinnest —
    // the ones where affected_groups matters most.
    if (community.has(canonicalGroup(g))) return true;
    const pred = GROUP_PREDICATES[g];
    if (!pred) return true;
    return pred(place);
  });
}
