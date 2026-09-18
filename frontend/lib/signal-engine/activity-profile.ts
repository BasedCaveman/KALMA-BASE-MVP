//kalma/frontend/lib/signal-engine/activity-profile.ts
//
// Place activity profiles: which weather-exposed economic activities are
// documented for a place, extracted from its English Wikipedia article.
// The signal engine refines each signal's affected_groups against the
// profile at emit time so a dry-stretch signal in Winnipeg talks about
// grain growers, not coffee growers.
//
// Design notes (docs/PLACE_ACTIVITY_ENRICHMENT_2026-07-07.md):
//   - This file is intentionally self-contained (zero imports). It is
//     shared by three runtimes: the Next.js cron routes, the browser
//     bundle (chip filtering), and plain Node scripts via native type
//     stripping — which cannot resolve extensionless TS imports.
//   - Keep it free of enums/namespaces/parameter properties; Node's
//     type stripping rejects TS syntax that requires transformation.

export type SignalCategory =
  | 'rainfall'
  | 'heat'
  | 'temperature'
  | 'water'
  | 'general';

export type ActivityDef = {
  /** Word-boundary patterns matched against article text. Usually
   *  case-insensitive; a case-sensitive pattern in the list lets a rule
   *  accept generic lowercase usage while rejecting proper nouns
   *  ("orchards" = agriculture, "Orchard Road" = shopping street). */
  terms: RegExp[];
  /** Signal categories where this group is weather-relevant (append step). */
  categories: SignalCategory[];
};

// ── Taxonomy ────────────────────────────────────────────────────────────────
//
// Canonical group slug → detection pattern + relevant signal categories.
// Groups listed here are "specific": when a trusted profile exists, a
// specific group only survives on a signal if the article evidences it,
// and evidenced groups are appended to signals of a matching category.
// Groups NOT listed here (farmers, tourism, construction, logistics,
// energy_demand, drainage_operators, hydro_operators, …) are universal
// and never gated.
//
// Patterns are conservative: ambiguous words ("bean", "corn", "cotton
// mills", plain "rice" as cuisine) require an agronomic pairing, so a
// food-culture paragraph doesn't mint a farming community.

const CROP_CATEGORIES: SignalCategory[] = [
  'rainfall',
  'heat',
  'temperature',
  'water',
];

export const ACTIVITY_TAXONOMY: Record<string, ActivityDef> = {
  coffee_growers: {
    // Requires an agronomic pairing — bare "coffee" matches café culture
    // (Melbourne, Vienna) and would mint growers who don't exist. Both
    // directions: "coffee production" and "production of coffee" (Lavras).
    terms: [
      /\bcoffee[- ](?:producing|production|growing|growers?|plantations?|farms?|farming|cultivation|crops?|beans?|industry|exports?|belt|region)\b/i,
      /\b(?:production|producers?|cultivation|growers?|growing|exporters?|exports?|plantations?|crops?)\s(?:of\s)?(?:[\w-]+[,\s]+){0,3}coffee\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  grain_farmers: {
    terms: [
      /\bwheat\b|\bmaize\b|\bbarley\b|\bcanola\b|\bsorghum\b|\boats\b|\bcereal (?:crops?|production)\b|\bgrain (?:production|farming|belt|elevators?|exports?|trade|exchange|hub)\b|\bagribusiness\b|\bwheat\s?belt\b|\bcorn (?:production|belt|farming|growers)\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  soy_farmers: {
    // "soy sauce" / "soya-sauce" / "soy milk" are cuisine, not farming.
    terms: [/\bsoy(?:a|beans?)?\b(?![ -](?:sauce|milk))/i],
    categories: CROP_CATEGORIES,
  },
  bean_farmers: {
    terms: [
      /\bbeans? (?:production|farming|cultivation|crops?)\b|\bcommon beans?\b|\bpulses\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  rice_farmers: {
    terms: [
      /\brice (?:padd(?:y|ies)|production|farming|cultivation|fields?|growing|farmers?)\b|\bpaddy fields?\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  sugarcane_growers: {
    terms: [/\bsugar\s?cane\b|\bsugar (?:mills?|industry|plantations?)\b/i],
    categories: CROP_CATEGORIES,
  },
  cotton_growers: {
    terms: [/\bcotton (?:production|farming|plantations?|growing|belt)\b/i],
    categories: CROP_CATEGORIES,
  },
  tea_growers: {
    terms: [/\btea (?:plantations?|estates?|production|growing|industry)\b/i],
    categories: CROP_CATEGORIES,
  },
  cocoa_growers: {
    // Same guard as coffee: bare "cocoa" matches chocolate industry towns
    // and historical events ("the cocoa crisis").
    terms: [
      /\b(?:cocoa|cacao)[- ](?:producing|production|growing|growers?|plantations?|farms?|farming|cultivation|crops?|beans?|exports?|industry|belt|region)\b/i,
      /\b(?:production|producers?|cultivation|growers?|growing|exporters?|exports?|plantations?|crops?)\s(?:of\s)?(?:[\w-]+[,\s]+){0,3}(?:cocoa|cacao)\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  grape_growers: {
    terms: [
      /\bvineyards?\b|\bviticulture\b|\bwine[- ]?making\b|\bwine (?:production|region|industry)\b|\bwiner(?:y|ies)\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  orchards: {
    // Case-sensitive lowercase rule: generic prose says "orchards";
    // capitalized "Orchard" is a proper noun (Orchard Road, hotel names).
    terms: [
      /\borchards?\b/,
      /\bcitrus\b|\bstone fruits?\b|\bfruit (?:production|growing|cultivation|belt)\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  horticulture: {
    terms: [
      /\bhorticultur\w*\b|\bgreenhouses?\b|\bmarket gardens?\b|\bvegetable (?:production|farming|growing|cultivation)\b|\bfloricultur\w*\b|\bflower (?:production|farms?|cultivation)\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  livestock: {
    // "beef"/"poultry" need an industry pairing — dietary mentions
    // ("do not eat beef") are not ranching.
    terms: [
      /\blivestock\b|\bcattle\b|\bdairy (?:farming|industry|production|farms?)\b|\branch(?:es|ing)\b|\bstockyards?\b|\bsheep\b|\bgoats?\b|\bpig farming\b|\b(?:beef|poultry) (?:production|industry|farms?|farming|exports?)\b/i,
    ],
    categories: CROP_CATEGORIES,
  },
  fishing: {
    // "seafood" alone is restaurant copy (Sydney); require the industry.
    terms: [
      /\bfishing (?:industry|ports?|fleets?|villages?|communit\w+)\b|\bfisher(?:y|ies|men)\b|\baquaculture\b|\bseafood (?:industry|processing|exports?)\b/i,
    ],
    categories: ['rainfall', 'heat', 'water'],
  },
  street_vendors: {
    terms: [
      /\bstreet (?:vendors?|markets?|food|stalls?)\b|\bopen-air markets?\b|\bnight markets?\b|\bhawkers?\b/i,
    ],
    categories: ['rainfall', 'heat'],
  },
  ski_tourism: {
    terms: [/\bski (?:resorts?|areas?|industry|tourism)\b|\bwinter sports\b/i],
    categories: ['temperature'],
  },
  // ── Weather-exposed work that is not farming ──────────────────────────────
  // Added 2026-08-05. The taxonomy was entirely rural, so a reader in a city
  // was offered coffee, soy and cattle and nothing that was actually theirs.
  // These three are exposed to weather anywhere, which is exactly why the
  // daily question now offers them at every place rather than waiting for an
  // encyclopedia to mention them.
  construction: {
    terms: [
      /\bconstruction (?:industry|sector|works?|sites?|boom)\b|\bcivil construction\b/i,
    ],
    categories: ['rainfall', 'heat', 'general'],
  },
  lodging: {
    terms: [
      /\b(?:tourism|hospitality) (?:industry|sector)\b|\bhotels? and (?:inns|guesthouses)\b|\bguest ?houses?\b/i,
    ],
    categories: ['rainfall', 'temperature'],
  },
  local_commerce: {
    terms: [
      /\b(?:retail|commerce|commercial) (?:sector|centre|center|district|hub)\b|\bshopping district\b|\bmarket town\b/i,
    ],
    categories: ['rainfall', 'temperature'],
  },
  road_transport: {
    terms: [
      /\b(?:road|highway) (?:transport|haulage|freight|network)\b|\btrucking\b|\blogistics hub\b/i,
    ],
    categories: ['rainfall', 'general'],
  },
};

/** Registry vocabulary → canonical taxonomy slug. The signal type
 *  registry predates the taxonomy and uses a few synonyms. */
const GROUP_ALIASES: Record<string, string> = {
  coffee_farmers: 'coffee_growers',
  vineyards: 'grape_growers',
};

export function canonicalGroup(group: string): string {
  return GROUP_ALIASES[group] ?? group;
}

/** True when the group is activity-specific (evidence-gated). Universal
 *  groups — farmers, tourism, construction, logistics, … — return false
 *  and always pass through refinement untouched. */
export function isSpecificGroup(group: string): boolean {
  return canonicalGroup(group) in ACTIVITY_TAXONOMY;
}

// ── Matching ────────────────────────────────────────────────────────────────

export type ActivityEvidence = {
  group: string;
  terms: string[];
  excerpt: string;
};

export type ActivityMatch = {
  groups: string[];
  evidence: ActivityEvidence[];
};

/** Scan article plain text against the taxonomy. Returns canonical group
 *  slugs in taxonomy (priority) order plus a short excerpt per match so a
 *  wrong chip can be traced back to its sentence. */
// ── Context that disqualifies a match ───────────────────────────────────────
//
// A pattern hit is not evidence that a place does something TODAY. Read the
// five groups Curitiba was given, every one a false positive, and they share
// visible markers:
//
//   coffee     "State (... ) later mate and coffee cultivation"
//   grain/soy  "in the 1970s wheat, corn and soybean cultivation"
//   livestock  "In the 19th century ... between cattle-breeding countryside
//               and marketplaces"
//   horticulture "a botanical garden and three greenhouses"
//
// Three of them are history, one is the state rather than the city, and one is
// a municipal botanical garden. Showing "coffee growers" to everyone in a city
// of 1.9 million reads as invention, because the reader cannot see the article
// behind it: they just see Kalma asserting something false about their home.
//
// So a match is dropped when its surrounding text is PAST TENSE, ELSEWHERE, or
// ORNAMENTAL. Biased towards rejecting, per the taxonomy's own standing rule
// that under-claiming beats over-claiming: a place that really does grow
// coffee will say so in the present somewhere else in the article, and if it
// does not, the community layer can still add the group from field evidence.
const DISQUALIFYING_CONTEXT: RegExp[] = [
  // Past tense: centuries, decades, explicit history framing.
  /\b(?:1[0-9]|20)th century\b/i,
  /\bin the (?:1[0-9]{3}s|[0-9]{4}s)\b/i,
  /\b1[0-9]{3}s\b/,
  /\bhistorical(?:ly)?\b|\bformerly\b|\bin the past\b|\buntil the\b|\bonce (?:a|the|an)\b/i,
  // Elsewhere: the state, the surrounding countryside, the wider region.
  /\bcountryside\b|\bhinterland\b|\bsurrounding (?:region|area|municipalities)\b/i,
  /\bthe State\b/,
  // Ornamental rather than productive: gardens, parks, seedling nurseries.
  /\bbotanical garden\b|\bpublic parks?\b|\bseedlings?\b|\bornamental\b/i,
  // Everything below was found by sampling 14 stored profiles at random on
  // 2026-08-05 and reading them. Roughly ten were false positives, and only
  // two of those were history. The term patterns are simply looser than they
  // look, so the context gate has to carry the rest.
  //
  // The word appears in a completely different subject:
  //   Boulder      "reduction in GREENHOUSE GAS emissions"      -> horticulture
  //   Guayaquil    "empanadas made with WHEAT FLOUR"            -> grain
  //   Manaus       "patron saint of FISHERMEN"                  -> fishing
  /\bgreenhouse gas(?:es)?\b/i,
  /\bflour\b|\bbread\b|\bcuisine\b|\bdish(?:es)?\b|\brecipes?\b|\bempanadas?\b|\bfood processing\b/i,
  /\bpatron saint\b|\bfestival\b|\bcarnival\b/i,
  // Moved through, not grown here:
  //   Rio          "handles WHEAT on Handysize ships"           -> grain
  /\bships?\b|\bcargo\b|\bwharf\b|\bport (?:of|handles|terminal)\b|\bimports?\b/i,
  // On show, not in production:
  //   Harrisburg   "LIVESTOCK are on display ... competitions"  -> livestock
  /\bon display\b|\bcompetitions?\b|\bfairgrounds?\b|\bexhibitions?\b|\bmuseums?\b/i,
  // Bare years, which the decade patterns above miss:
  //   Joao Pessoa  "in 1574, after the attack on Tracunhaem"    -> sugarcane
  //   Caracas      colonial wheat prices in the Iberian Peninsula
  /\b1[0-8][0-9]{2}\b/,
  /\bin (?:19|20)[0-9]{2}\b|\bas of (?:19|20)[0-9]{2}\b/i,
  // Second round, from re-reading Rio after the first pass. Its three groups
  // all survived and all three were still wrong, every one imperial or
  // colonial narrative with no year inside the excerpt window:
  //   coffee    "the new coffee cultivation in the Paraiba Valley"
  //   sugarcane "capital of his new empire ... in the Campos region"
  //   commerce  "the historic core ... Paco Imperial, built during colonial
  //              times"
  // Era words carry the history even when no date is nearby.
  /\bempires?\b|\bimperial\b|\bcolonial\b|\bprovince\b|\bcaptaincy\b|\bhistoric core\b|\bdynasty\b/i,
  // A named valley or region is somewhere around the place, not the place.
  /\b[A-Z][a-zA-Zá-úÁ-Ú]+ (?:Valley|Region|Basin|Plateau)\b/,
  // Third round, from auditing the live corpus on 2026-08-06 after the
  // second re-enrichment. Two more false positives, neither historical nor
  // elsewhere in the senses already covered above:
  //   Manaus       "its zoo and orchid greenhouse ... open for public
  //                 visits"                              -> horticulture
  //   Mexico City   "bighorn sheep, caracara, zebras ... Zoo Los Coyotes"
  //                                                       -> livestock
  // A zoo exhibit is not a farm or a greenhouse operation no matter which
  // taxonomy term it sits next to.
  /\bzoo(?:s|logical (?:parks?|gardens?))?\b/i,
  //   Joao Pessoa  "which at that time was only a small fishing village"
  //                                                       -> fishing
  // "a small fishing village" is a near-universal cliche opening line for a
  // coastal city's founding story, not a claim about today's economy. Kept
  // narrow (the diminutive is required) rather than banning "fishing
  // village" outright or banning "at that time" generally: a broader version
  // of either would also reject genuinely current claims found in the same
  // audit (Berkeley's shopping district shares an excerpt window with an
  // unrelated "the mayor at that time" clause; Salem's "wineries and
  // vineyards that are open to the public" is itself the true positive).
  /\b(?:small|sleepy|tiny) fishing village\b/i,
  // Fourth round, 2026-08-07, forced by a published mistake rather than an
  // audit: a post told Houston that 48mm of rain "reaches the rice first".
  // Houston has no rice inside it. The Gulf Coast rice belt is real but sits
  // in Wharton, Colorado and Matagorda counties, an hour or more away. Three
  // signatures below, one per city that survived every rule above.
  //
  // (1) TRADE MANIFEST. A port ships what it does not grow.
  //   Luanda  "the chief exports are coffee, cotton, sugar, diamonds, iron"
  //                                                        -> coffee
  // The giveaway is the manifest shape (a list mixing crops with minerals),
  // not the word "export" alone, which is why this targets the framing and
  // leaves "coffee exports from the region rose" style claims matchable.
  /\b(?:chief|main|principal|major|leading) (?:exports?|imports?)\b/i,
  /\bexports? (?:are|include|consist|comprise)\b/i,
  /\bcommodities exported\b/i,
  /\bnatural harbou?r\b/i,
  // (2) PAST-TENSE ECONOMIC NARRATIVE. The city grew on this crop; the
  // article says so in the past tense and the crop left decades ago.
  //   Sao Paulo  "coffee production was a major factor in the growth of"
  //                                                        -> coffee
  //   Sao Paulo  "Minas Gerais was famous for its dairy production"
  //                                     -> livestock, and about another state
  // Dated-decade rules above miss these: there is no year in the window.
  /\b(?:was|were) (?:a |the )?(?:major|chief|main|principal|important|famous|known)\b/i,
  /\bbecame (?:a|the|an)\b/i,
  /\bgrowth of\b/i,
  // (3) CROP ENUMERATION. The commodity is item N in a descriptive list,
  // which is botany or pre-industrial history, not a claim about the
  // economy of the place today.
  //   Phoenix  "new crops such as sweet corn, tapary beans, squash, lentils,
  //             sugar cane, and melons ... native plants such as saguaro"
  //                                            -> sugarcane (this is Hohokam)
  /\b(?:crops?|plants|produce|vegetables|fruits) such as\b/i,
  /\bnative plants\b/i,
  // Fifth round, 2026-08-07, same day as the fourth: re-fetching all 239
  // articles with the new rules put rice back on Houston, from a passage the
  // previous fetch had not returned at all. Two classes, neither seen before.
  //
  // (4) CAPABILITY, NOT PRACTICE. The article describes what the land could
  // support, which is geology, not an economy.
  //   Houston  "surface soil is suitable for rice farming in suburban
  //             outskirts where the city continues to grow"   -> rice
  // Note the second half of that sentence: the outskirts are turning into
  // city. Both halves are disqualifying, so both are matched.
  /\bsuitable for\b|\bideal for\b|\bwell[- ]suited\b|\bcould support\b|\bpotential for\b/i,
  /\boutskirts\b|\bsuburban\b|\bexurb\w*\b|\bperipher\w+\b/i,
  // (5) THE TERM IS PART OF A PROPER NOUN. A place named after a crop is not
  // a place that grows it, and this one was a bus timetable.
  //   Sacramento  "the Blue Line to the City of Roseville through the City
  //                of Citrus Heights"                         -> orchards
  // The taxonomy already tries to hold this line with case-sensitive terms;
  // this catches the ones that slip through as the first word of a settlement
  // name. Kept to settlement suffixes rather than any capitalised pair, which
  // would reject most sentences that merely start with the crop.
  /\b[A-Z][a-zA-Zá-úÁ-Ú]+ (?:Heights|Springs|Grove|Hills|Park|Township|Junction)\b/,
  // (6) A SHOW IS NOT A FARM. Same fetch, one group further down:
  //   Houston  "the annual Houston Livestock Show and Rodeo, held over 20
  //             days from early to late March"                -> livestock
  // The existing exhibition rule wanted the words "on display" or
  // "exhibition", and a rodeo announces itself differently. Heat over
  // Houston does not reach a herd, it reaches an event, and the copy layer
  // would have said "the herd".
  /\brodeo\b|\b(?:livestock|cattle|horse|poultry) shows?\b/i,
  // (7) FOUNDING NARRATIVE. Found while auditing what the REPLY path would
  // now say, which shares this profile: five cities were about to be told
  // about "the herd" on the strength of their founding story. livestock is
  // the loosest group in the taxonomy (bare "cattle" and "goats" match
  // anything) so it collects these more than any other.
  //   Hartford  "led 100 settlers with 130 head of cattle in a trek from
  //              Newtown in the Massachusetts Bay Colony"      (the 1630s)
  //   Oakland   "squatters cut down their fruit trees, killed their cattle
  //              ... the rancho"
  //   Berkeley  "the primary activity of the ranch was raising cattle for
  //              meat and hides"
  //   Dubai     "an oval-shaped town surrounded by a mud wall, scattered
  //              with goats and camels"
  //   Toronto   "the Union Stockyards ... the inspiration for the
  //              'Hogtown' nickname"
  // "colonial" was already gated; "Colony" as a proper noun was not.
  /\bsettlers?\b|\bsquatters?\b|\bcolon(?:y|ists?)\b|\brancho\b/i,
  /\bnicknamed?\b|\bmud (?:wall|walls|brick|huts?)\b/i,
];

/** True when the excerpt around a hit shows it is not a present-day, local activity. */
export function isDisqualifiedContext(excerpt: string): boolean {
  return DISQUALIFYING_CONTEXT.some((re) => re.test(excerpt));
}

export function matchActivities(text: string): ActivityMatch {
  const groups: string[] = [];
  const evidence: ActivityEvidence[] = [];
  if (!text) return { groups, evidence };

  for (const [group, def] of Object.entries(ACTIVITY_TAXONOMY)) {
    for (const pattern of def.terms) {
      const m = text.match(pattern);
      if (!m || typeof m.index !== 'number') continue;
      const start = Math.max(0, m.index - 60);
      const end = Math.min(text.length, m.index + m[0].length + 80);
      const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
      // A hit inside history, inside the state, or inside a botanical garden
      // is not evidence the place does this now. Keep scanning the other
      // patterns rather than accepting it.
      if (isDisqualifiedContext(excerpt)) continue;
      groups.push(group);
      evidence.push({ group, terms: [m[0]], excerpt });
      break; // first clean pattern is enough evidence
    }
  }
  return { groups, evidence };
}

// ── Refinement ──────────────────────────────────────────────────────────────

/**
 * Refine a signal's affected_groups against what is known about a place.
 *
 * Two sources, deliberately asymmetric (L-a, docs/OBSERVATION_LEARNING_LOOP_2026-07-28.md):
 *
 * - `profileGroups` — Wikipedia-derived, coordinate-verified. This source
 *   GATES: null/undefined means no trusted profile and defaults are
 *   returned unchanged (legacy behavior, latitude heuristics remain the UI
 *   net); when present, specific defaults must be evidenced to survive,
 *   universal defaults always stay, and evidenced groups whose taxonomy
 *   categories match this signal's category are appended.
 *
 * - `communityGroups` — confirmed by field observations from people in the
 *   place. This source only ADDS. It is applied whether or not a Wikipedia
 *   profile exists, and it can restore a group the article failed to
 *   document, because neighbours reporting cattle is better evidence about
 *   a small rural town than an encyclopedia's silence. It never removes: a
 *   post proves presence, and nobody posting proves nothing.
 *
 * Capped so the chip row stays readable (UI renders at most 6).
 */
export function refineAffectedGroups(
  defaults: string[],
  profileGroups: string[] | null | undefined,
  category: string,
  cap: number = 6,
  communityGroups?: string[] | null,
): string[] {
  const base = Array.isArray(defaults) ? defaults : [];
  const community = Array.isArray(communityGroups) ? communityGroups : [];
  if (!Array.isArray(profileGroups) && community.length === 0) return base;

  const kept = Array.isArray(profileGroups)
    ? base.filter((g) => {
        if (!isSpecificGroup(g)) return true;
        const canonical = canonicalGroup(g);
        if (profileGroups.some((p) => canonicalGroup(p) === canonical)) return true;
        // Community evidence outranks the article's silence.
        return community.some((c) => canonicalGroup(c) === canonical);
      })
    : base;

  const present = new Set(kept.map(canonicalGroup));
  const additions: string[] = [];
  for (const raw of [...(profileGroups ?? []), ...community]) {
    const g = canonicalGroup(raw);
    if (present.has(g)) continue;
    const def = ACTIVITY_TAXONOMY[g];
    if (!def || !def.categories.includes(category as SignalCategory)) continue;
    present.add(g);
    additions.push(g);
  }

  return [...kept, ...additions].slice(0, Math.max(1, cap));
}

// ── Wikipedia fetcher ───────────────────────────────────────────────────────

export type PlaceForEnrichment = {
  name: string;
  region?: string | null;
  country?: string | null;
  lat: number;
  lon: number;
};

export type WikiActivityProfile = {
  groups: string[];
  evidence: ActivityEvidence[];
  wikiTitle: string | null;
  sourceUrl: string | null;
  coordVerified: boolean;
};

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_USER_AGENT =
  'KalmaPlaceEnrichment/1.0 (https://kalma.me; signal infrastructure)';
/** Article coordinate must sit within this distance of the place row.
 *  Generous: metro articles pin the historic center, promoted places pin
 *  wherever the searcher's geocoder pointed. */
const COORD_MAX_KM = 150;

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type WikiPage = {
  title?: string;
  missing?: boolean;
  extract?: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  pageprops?: Record<string, unknown>;
};

async function wikiQuery(
  title: string,
  props: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<WikiPage | null> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    titles: title,
    ...props,
  });
  const res = await fetchImpl(`${WIKI_API}?${params.toString()}`, {
    headers: {
      'User-Agent': WIKI_USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`wikipedia http ${res.status} for "${title}"`);
  const data = (await res.json()) as {
    query?: { pages?: WikiPage[] };
  };
  const page = data.query?.pages?.[0];
  if (!page || page.missing) return null;
  return page;
}

/** Cheap metadata call: coordinates + disambiguation flag. Kept separate
 *  from the extract because MediaWiki defers `coordinates` to a
 *  continuation batch when combined with the slow `extracts` prop —
 *  the combined request silently drops coords for large articles. */
function fetchWikiMeta(title: string, fetchImpl: typeof fetch) {
  return wikiQuery(
    title,
    { prop: 'coordinates|pageprops', ppprop: 'disambiguation', colimit: '1' },
    fetchImpl,
  );
}

function fetchWikiExtract(title: string, fetchImpl: typeof fetch) {
  return wikiQuery(title, { prop: 'extracts', explaintext: '1' }, fetchImpl);
}

/**
 * Resolve the place's Wikipedia article and extract its activity profile.
 * Tries "Name, Region" → "Name, Country" → "Name", skipping disambiguation
 * pages. A candidate whose primary coordinate lies within COORD_MAX_KM is
 * trusted (coordVerified). If no candidate verifies, the first readable
 * article is returned unverified — stored for observability, never used
 * for engine refinement.
 */
export async function fetchWikiActivityProfile(
  place: PlaceForEnrichment,
  fetchImpl: typeof fetch = fetch,
): Promise<WikiActivityProfile> {
  // Qualified candidates carry our own region/country in the title, so
  // even when the article exposes no GeoData coordinate (e.g. "Des
  // Moines, Iowa" stores coords in Wikidata only) a landing is trusted.
  // The bare name is not — that's where disambiguation bites.
  const candidates: Array<{ title: string; qualified: boolean }> = [];
  if (place.region) {
    candidates.push({ title: `${place.name}, ${place.region}`, qualified: true });
  }
  if (place.country && place.country !== place.name) {
    candidates.push({ title: `${place.name}, ${place.country}`, qualified: true });
  }
  candidates.push({ title: place.name, qualified: false });
  const seen = new Set<string>();
  const titles = candidates.filter((c) => {
    if (seen.has(c.title)) return false;
    seen.add(c.title);
    return true;
  });

  let chosen: { title: string; verified: boolean } | null = null;
  let fallbackTitle: string | null = null;

  for (const candidate of titles) {
    let meta: WikiPage | null = null;
    try {
      meta = await fetchWikiMeta(candidate.title, fetchImpl);
    } catch {
      continue; // network/HTTP error on this candidate — try the next
    }
    if (!meta) continue;
    if (meta.pageprops && 'disambiguation' in meta.pageprops) continue;

    const resolvedTitle = meta.title ?? candidate.title;
    const coord = meta.coordinates?.[0];
    // Coordinate present → must sit near the place row (hard check).
    // Coordinate absent → trust only titles we qualified ourselves.
    const verified = coord
      ? haversineKm(
          { lat: coord.lat, lon: coord.lon },
          { lat: place.lat, lon: place.lon },
        ) <= COORD_MAX_KM
      : candidate.qualified;

    if (verified) {
      chosen = { title: resolvedTitle, verified: true };
      break;
    }
    if (!fallbackTitle) fallbackTitle = resolvedTitle;
  }

  if (!chosen && fallbackTitle) chosen = { title: fallbackTitle, verified: false };

  if (chosen) {
    let extract = '';
    try {
      const page = await fetchWikiExtract(chosen.title, fetchImpl);
      extract = page?.extract ?? '';
    } catch {
      extract = '';
    }
    const match = matchActivities(extract);
    return {
      groups: match.groups,
      evidence: match.evidence,
      wikiTitle: chosen.title,
      sourceUrl: wikiUrl(chosen.title),
      coordVerified: chosen.verified,
    };
  }

  return {
    groups: [],
    evidence: [],
    wikiTitle: null,
    sourceUrl: null,
    coordVerified: false,
  };
}

function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

// ── Manual field corrections ────────────────────────────────────────────────
//
// Wikipedia will never describe a small municipality well, and the context
// gate above cannot fix either of its two failure modes:
//
//   EMPTY  the article is a genuine one-line stub with no economic content
//          to match or reject (Perdões, Minas Gerais — verified against the
//          live article and its full edit history back to 2017; it has
//          never said more than "Perdões is a municipality in the state of
//          Minas Gerais"). The gate did not cause this: there was nothing
//          there to gate.
//   WRONG  the article states something false in plain present tense, with
//          no historical/elsewhere/ornamental marker any context rule could
//          key on (Carrancas, Minas Gerais — "The main agricultural
//          products are sugarcane, coffee, bananas, and corn" is the
//          article's own claim, unqualified; the town grows none of those).
//
// PLACE_ACTIVITY_OVERRIDES replaces the Wikipedia-derived groups outright for
// a listed slug. Field knowledge from someone who has actually been there
// outranks an encyclopedia article, thin or wrong. Only add an entry once
// it has been verified against the real place, not assumed from the
// taxonomy — these two were verified by Pedro on 2026-08-06.
export const PLACE_ACTIVITY_OVERRIDES: Record<string, string[]> = {
  'perdoes-mg-br': ['coffee_growers', 'livestock'],
  'carrancas-mg-br': [
    'livestock',
    'grain_farmers',
    'soy_farmers',
    'lodging',
    'local_commerce',
  ],
};

/** Apply a manual field correction over a freshly fetched Wikipedia profile,
 *  when one is on file for this slug. Replaces groups/evidence entirely
 *  rather than merging with the article's own (possibly wrong) evidence —
 *  see PLACE_ACTIVITY_OVERRIDES. wikiTitle/sourceUrl/coordVerified are kept
 *  as-is so the article that was checked (and rejected) stays traceable. */
export function applyPlaceOverride(
  slug: string,
  profile: WikiActivityProfile,
): WikiActivityProfile {
  const override = PLACE_ACTIVITY_OVERRIDES[slug];
  if (!override) return profile;
  return {
    ...profile,
    groups: override,
    evidence: override.map((group) => ({
      group,
      terms: ['manual override'],
      excerpt: `Field-verified correction, not from ${profile.wikiTitle ?? 'the Wikipedia article'}. See PLACE_ACTIVITY_OVERRIDES.`,
    })),
  };
}

// ── Enrichment orchestration ────────────────────────────────────────────────
//
// Shared by /api/cron/enrich-places (daily) and
// scripts/enrich-place-activities.mjs (manual backfill). Takes a Supabase
// client structurally so this module stays dependency-free.

type DbClient = {
  from(table: string): any;
};

export type EnrichOptions = {
  /** Max Wikipedia fetches this pass (bounds runtime + politeness). */
  limit?: number;
  /** Re-fetch even when the profile is fresh. */
  force?: boolean;
  /** Restrict to a single place slug (QA). */
  onlySlug?: string;
  /** Log matches without writing rows. */
  dryRun?: boolean;
  /** Delay between Wikipedia fetches. */
  sleepMs?: number;
  log?: (msg: string) => void;
  fetchImpl?: typeof fetch;
};

export type EnrichSummary = {
  active_places: number;
  stale: number;
  fetched: number;
  written: number;
  unverified: number;
  errors: Array<{ slug: string; message: string }>;
};

const FRESH_DAYS = 30;
/** Unverified profiles retry sooner — the article may resolve once the
 *  place row gains a region, or after taxonomy/matching improvements. */
const UNVERIFIED_RETRY_DAYS = 7;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function enrichPlaceActivities(
  db: DbClient,
  opts: EnrichOptions = {},
): Promise<EnrichSummary> {
  const log = opts.log ?? (() => {});
  const limit = opts.limit ?? 20;
  const sleepMs = opts.sleepMs ?? 1100;

  let placesQuery = db
    .from('places')
    .select('id, slug, name, region, country, lat, lon')
    .eq('active', true);
  if (opts.onlySlug) placesQuery = placesQuery.eq('slug', opts.onlySlug);
  const { data: places, error: pErr } = await placesQuery;
  if (pErr) throw new Error(`load places: ${pErr.message}`);

  const { data: profiles, error: prErr } = await db
    .from('place_activity_profiles')
    .select('place_id, refresh_after');
  if (prErr) throw new Error(`load profiles: ${prErr.message}`);

  const refreshByPlace = new Map<string, string>(
    (profiles ?? []).map((p: { place_id: string; refresh_after: string }) => [
      p.place_id,
      p.refresh_after,
    ]),
  );

  const now = Date.now();
  const stale = (places ?? []).filter(
    (p: { id: string }) =>
      opts.force ||
      !refreshByPlace.has(p.id) ||
      Date.parse(refreshByPlace.get(p.id) as string) <= now,
  );
  // Oldest/never-fetched first. Under --force every active place is "stale"
  // regardless of refresh_after, so without this a run with no explicit
  // --limit silently reprocesses the same leading slice every time (stable
  // query order, no ORDER BY) and the tail never gets touched — which is
  // exactly what left Guayaquil holding a pre-fix profile for a week while
  // repeated --force runs kept re-fetching the same 200 places ahead of it.
  stale.sort((a: { id: string }, b: { id: string }) => {
    const ra = refreshByPlace.get(a.id);
    const rb = refreshByPlace.get(b.id);
    if (!ra && !rb) return 0;
    if (!ra) return -1;
    if (!rb) return 1;
    return Date.parse(ra) - Date.parse(rb);
  });

  const summary: EnrichSummary = {
    active_places: places?.length ?? 0,
    stale: stale.length,
    fetched: 0,
    written: 0,
    unverified: 0,
    errors: [],
  };
  log(
    `[enrich-places] ${summary.active_places} active places, ${summary.stale} stale, limit ${limit}`,
  );

  const batch = stale.slice(0, limit);
  for (let i = 0; i < batch.length; i += 1) {
    const place = batch[i];
    try {
      const fetched = await fetchWikiActivityProfile(
        place,
        opts.fetchImpl ?? fetch,
      );
      const profile = applyPlaceOverride(place.slug, fetched);
      summary.fetched += 1;
      if (!profile.coordVerified) summary.unverified += 1;

      log(
        `[enrich-places] ${place.slug} → ${profile.wikiTitle ?? 'NO ARTICLE'} ` +
          `(${profile.coordVerified ? 'verified' : 'UNVERIFIED'}) ` +
          `groups=[${profile.groups.join(', ')}]` +
          (profile !== fetched ? ' [manual override applied]' : ''),
      );

      if (!opts.dryRun) {
        const retryDays = profile.coordVerified
          ? FRESH_DAYS
          : UNVERIFIED_RETRY_DAYS;
        const { error: upErr } = await db
          .from('place_activity_profiles')
          .upsert(
            {
              place_id: place.id,
              groups: profile.groups,
              evidence: profile.evidence,
              source: 'wikipedia',
              source_url: profile.sourceUrl,
              wiki_title: profile.wikiTitle,
              coord_verified: profile.coordVerified,
              fetched_at: new Date().toISOString(),
              refresh_after: new Date(
                now + retryDays * 24 * 60 * 60 * 1000,
              ).toISOString(),
            },
            { onConflict: 'place_id' },
          );
        if (upErr) throw new Error(upErr.message);
        summary.written += 1;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ slug: place.slug, message });
      log(`[enrich-places] ERROR ${place.slug}: ${message}`);
    }
    if (i < batch.length - 1) await sleep(sleepMs);
  }

  return summary;
}
