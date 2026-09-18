// kalma/frontend/lib/growth/audience.ts
//
// Who, specifically, does this weather hurt in this place?
//
// Two jobs, and the first one is editorial. A -8°C night in Farellones is
// news to nobody: it is a ski resort at 2,400m and cold is the business.
// The same -8°C in a coffee municipality is the whole year. So a signal only
// earns a post when the place has a VERIFIED activity profile carrying a
// group that is actually exposed to that kind of weather.
//
// The second job is copy. "Crops are exposed" is the vague sentence this
// engine exists to avoid; "the exposed part is the coffee" is a
// sentence a grower recognises as being about them.
//
// Profiles come from `place_activity_profiles` (Wikipedia-grounded, only
// `coord_verified` rows are trusted). No profile means no signal post for
// that place, which is the conservative direction.

import type { GrowthLang } from './types.ts';

/** Weather categories a group can be exposed to. */
export type Exposure = 'frost' | 'cold' | 'heat' | 'rain' | 'dry';

/**
 * Which exposures each documented activity actually cares about. Kept
 * deliberately tight: claiming a group is exposed when it is not is exactly
 * the credibility leak that kills a young account.
 */
const GROUP_EXPOSURE: Record<string, Exposure[]> = {
  coffee_growers: ['frost', 'cold', 'heat', 'rain', 'dry'],
  coffee_farmers: ['frost', 'cold', 'heat', 'rain', 'dry'],
  grape_growers: ['frost', 'cold', 'heat', 'rain', 'dry'],
  orchards: ['frost', 'cold', 'heat', 'rain', 'dry'],
  horticulture: ['frost', 'cold', 'heat', 'rain', 'dry'],
  grain_farmers: ['frost', 'heat', 'rain', 'dry'],
  soy_farmers: ['heat', 'rain', 'dry'],
  rice_farmers: ['heat', 'rain', 'dry'],
  sugarcane_growers: ['heat', 'rain', 'dry'],
  cotton_growers: ['heat', 'rain', 'dry'],
  tea_growers: ['frost', 'cold', 'rain', 'dry'],
  cocoa_growers: ['heat', 'rain', 'dry'],
  bean_farmers: ['frost', 'heat', 'rain', 'dry'],
  livestock: ['cold', 'heat', 'dry'],
  fishing: ['rain'],
  street_vendors: ['rain', 'heat'],
  // Cold and snow are the product on a mountain; only heat threatens it.
  ski_tourism: ['heat'],
  // Everything below is a group the signal engine has always emitted and this
  // file could never say. exposedGroups() returned empty for them, so a place
  // whose profile held only these was refused by both the post and the reply
  // path: Houston came out of the 2026-08-07 audit as
  // [local_commerce, road_transport] and became unpostable, not because the
  // profile was wrong but because there was no phrase to answer it with.
  //
  // These are cities. Weather reaches them through work done outside, trade
  // that depends on people arriving, and roads, not through crops. Exposures
  // stay tight for the same reason the crop rows do: claiming a group is
  // exposed when it is not is the credibility leak this file exists to avoid.
  road_transport: ['rain', 'cold', 'frost'],
  construction: ['rain', 'heat', 'cold', 'frost'],
  local_commerce: ['rain', 'heat'],
  lodging: ['rain', 'heat'],
  // The events hook. Weather and a date that was fixed months ago is the
  // clearest coordination moment a place has: many people, one place, one
  // window. Emitted by the engine already; nothing could read it until now.
  outdoor_events: ['rain', 'heat', 'cold', 'frost'],
};

/** Signal type to the exposure it represents. */
const SIGNAL_EXPOSURE: Record<string, Exposure> = {
  frost_risk: 'frost',
  consecutive_cold_below: 'cold',
  heat_stress_window: 'heat',
  heavy_rain_event: 'rain',
  rainfall_risk_rising: 'rain',
  dry_stretch_window: 'dry',
  water_recovery_signal: 'dry',
};

/**
 * The groups in this place that this signal actually touches, best first.
 * Empty means: do not post this place today.
 */
export function exposedGroups(
  signalTypeId: string,
  groups: string[] | null | undefined,
): string[] {
  const exposure = SIGNAL_EXPOSURE[signalTypeId];
  if (!exposure || !groups?.length) return [];
  return groups.filter((g) => GROUP_EXPOSURE[g]?.includes(exposure));
}

/**
 * How a group is named in copy: a concrete noun phrase a member of that group
 * would use, never the taxonomy key.
 */
const GROUP_PHRASE: Record<string, Partial<Record<GrowthLang, string>>> = {
  // Season-neutral on purpose. Brazilian coffee flowers in September, so a
  // July post claiming "coffee in flower" is wrong to the exact reader whose
  // trust the account is trying to earn. Name the crop, not a growth stage we
  // are not tracking.
  coffee_growers: { en: 'the coffee', pt: 'o cafezal', es: 'el cafetal' },
  coffee_farmers: { en: 'the coffee', pt: 'o cafezal', es: 'el cafetal' },
  grape_growers: { en: 'the vines', pt: 'o parreiral', es: 'la viña' },
  orchards: { en: 'the orchards', pt: 'o pomar', es: 'el huerto' },
  horticulture: { en: 'anything under glass or in beds', pt: 'a horta e as estufas', es: 'la huerta y los invernaderos' },
  grain_farmers: { en: 'grain still in the field', pt: 'o grão ainda na lavoura', es: 'el grano todavía en el campo' },
  soy_farmers: { en: 'the soy', pt: 'a soja', es: 'la soja' },
  rice_farmers: { en: 'the rice', pt: 'o arroz', es: 'el arroz' },
  sugarcane_growers: { en: 'the cane', pt: 'a cana', es: 'la caña' },
  cotton_growers: { en: 'the cotton', pt: 'o algodão', es: 'el algodón' },
  tea_growers: { en: 'the tea', pt: 'o chá', es: 'el té' },
  cocoa_growers: { en: 'the cocoa', pt: 'o cacau', es: 'el cacao' },
  bean_farmers: { en: 'the beans', pt: 'o feijão', es: 'el frijol' },
  livestock: { en: 'the herd', pt: 'o rebanho', es: 'el rebaño' },
  fishing: { en: 'the boats going out', pt: 'os barcos que saem', es: 'los barcos que salen' },
  street_vendors: { en: 'anyone selling on the street', pt: 'quem vende na rua', es: 'quien vende en la calle' },
  ski_tourism: { en: 'the season on the slopes', pt: 'a temporada na montanha', es: 'la temporada en la montaña' },
  // Urban groups. Same rule as the crop phrases above: name the concrete
  // thing a person there would look at, never the action they should take.
  // "the roads in and out" is something a reader can picture and check; "plan
  // your route" is advice this product does not give.
  road_transport: {
    en: 'the roads in and out',
    pt: 'as estradas de entrada e saída',
    es: 'las carreteras de entrada y salida',
  },
  construction: {
    en: 'work on the open sites',
    pt: 'o trabalho nas obras abertas',
    es: 'el trabajo en las obras abiertas',
  },
  local_commerce: {
    en: 'the shops that depend on people walking past',
    pt: 'o comércio que depende de gente passando',
    es: 'el comercio que depende de la gente que pasa',
  },
  lodging: {
    en: 'guests with outdoor plans',
    pt: 'os hóspedes com planos ao ar livre',
    es: 'los huéspedes con planes al aire libre',
  },
  outdoor_events: {
    en: 'anything scheduled outdoors',
    pt: 'o que estiver marcado ao ar livre',
    es: 'lo que esté programado al aire libre',
  },
};

/** Fallback phrase per exposure, used only when a profile is silent. */
const EXPOSURE_PHRASE: Record<Exposure, Partial<Record<GrowthLang, string>>> = {
  frost: { en: 'anything still in flower', pt: 'o que está em florada', es: 'lo que está en floración' },
  cold: { en: 'anything still growing', pt: 'o que ainda está crescendo', es: 'lo que sigue creciendo' },
  heat: { en: 'animals and anyone working outside', pt: 'os animais e quem trabalha fora', es: 'los animales y quien trabaja afuera' },
  rain: { en: 'anything that cannot get wet', pt: 'o que não pode molhar', es: 'lo que no puede mojarse' },
  dry: { en: 'anything you would have to irrigate', pt: 'o que teria de ser irrigado', es: 'lo que habría que regar' },
};

/** The noun phrase to drop into copy for this signal in this place. */
export function audiencePhrase(
  signalTypeId: string,
  groups: string[] | null | undefined,
  lang: GrowthLang,
): string {
  const exposed = exposedGroups(signalTypeId, groups);
  for (const group of exposed) {
    const phrase = GROUP_PHRASE[group]?.[lang] ?? GROUP_PHRASE[group]?.en;
    if (phrase) return phrase;
  }
  const exposure = SIGNAL_EXPOSURE[signalTypeId];
  const fallback = exposure ? EXPOSURE_PHRASE[exposure] : undefined;
  return fallback?.[lang] ?? fallback?.en ?? '';
}
