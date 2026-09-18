//kalma/frontend/lib/signal-engine/observation-activity.ts
//
// L-a — the field-observation learning loop.
//
// `activity-profile.ts` learns what a place does from its Wikipedia
// article. This module learns it from the people who live there: it reads
// visible field observations, matches them against a short-form lexicon,
// and records which weather-exposed activities the community has actually
// reported. The signal engine then adds those groups to a place's signals,
// so Kalma's understanding of who a signal affects improves with every
// post instead of being frozen at whatever an encyclopedia happened to
// document.
//
// Design notes:
//   - Self-contained (zero imports), same as activity-profile.ts and for
//     the same reason: this runs inside Next.js cron routes AND inside
//     plain Node scripts via native type stripping, which cannot resolve
//     extensionless TS imports. Keep it free of enums/namespaces/parameter
//     properties too.
//   - OBSERVATION_LEXICON keys MUST be slugs that exist in
//     ACTIVITY_TAXONOMY (activity-profile.ts). The importing cron route
//     asserts this at startup, since it holds both modules.
//
// Trust posture (docs/OBSERVATION_LEARNING_LOOP_2026-07-28.md):
//   - ADDITIVE ONLY. A post proves an activity is present. No post proves
//     nothing at all — silence is not absence. This module therefore never
//     causes a group to be removed; only the Wikipedia profile gates.
//   - CORROBORATION, not volume. A group is `confirmed` once >= 2 DISTINCT
//     authors have evidenced it. One person posting five times is still one
//     person, and a single enthusiastic user must not redefine a city.
//   - SIGHTINGS ONLY. Advisory subtypes ("cover crops", "move animals to
//     shade") are advice, not observation. They are excluded, matching the
//     taxonomy's own note that advisories don't feed confirmations.
//   - CLOSED VOCABULARY EVIDENCE. Stored evidence is the matched lexicon
//     term, which by construction can only be a phrase from the lexicon
//     itself — it can never carry personal information out of a user's
//     note. Raw observation text is never copied into the profile table.

// ── Text normalization ──────────────────────────────────────────────────────
//
// Field notes are typed on phones, often without accents ("cafezal" /
// "feijao" / "kuhe"). Patterns are authored lowercase and unaccented, and
// the text is folded to match.
//
// Folding creates one cross-language collision worth naming: French "maïs"
// and German "Mais" both fold onto Portuguese "mais" ("more"), which is
// about the most common word there is in a Brazilian weather note. Rather
// than special-case it, the bare French and German forms are simply left
// out of the lexicon and those languages require a pairing ("champ de
// mais", "maisfeld"). Missing a mention is the cheap failure here.

export function foldText(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .toLowerCase();
}

// ── Lexicon ─────────────────────────────────────────────────────────────────
//
// Canonical activity slug → short-form patterns in the six supported
// languages. These are NOT the encyclopedia patterns: a field note says
// "cafezal secando", not "coffee production in the region".
//
// Deliberately conservative in the same direction as the Wikipedia
// taxonomy — ambiguous bare nouns need an agronomic pairing, because the
// cost of minting growers who do not exist is much higher than the cost of
// missing a mention. Where a language's only short word is ambiguous
// (French/German maize), the bare form is dropped rather than guessed.

export type ObservationRule = {
  /** Matched against the folded (lowercase, unaccented) note. One entry
   *  per supported language, in en/pt/es/fr/de/zh order. */
  terms: RegExp[];
};

export const OBSERVATION_LEXICON: Record<string, ObservationRule> = {
  coffee_growers: {
    // "cafe"/"coffee" alone is a drink or a shop in every one of the six
    // languages, so every pattern here carries agronomic context.
    terms: [
      /\bcoffee (?:crop|harvest|trees?|plants?|farm|plantation|beans?|cherries|blossom|flowering)\b/,
      /\bcafezal\b|\bcafeeiro\b|\bcafeicultura\b|\b(?:lavoura|plantacao|colheita|florada|pe) de cafe\b/,
      /\bcafetal\b|\bcafeto\b|\b(?:cosecha|cultivo|plantacion) de cafe\b/,
      /\bcafeier\b|\b(?:plantation|recolte) de cafe\b/,
      /\bkaffeeplantage\b|\bkaffeeernte\b|\bkaffeepflanzen\b/,
      /咖啡(?:树|園|园|豆|樹|采摘|採摘|种植|種植)/,
    ],
  },
  grain_farmers: {
    terms: [
      /\b(?:wheat|maize|barley|sorghum|canola|oats)\b|\bcorn (?:crop|field|harvest)\b/,
      /\bmilho\b|\btrigo\b|\bcevada\b|\bsorgo\b|\baveia\b|\bcanola\b/,
      /\bmaiz\b/,
      /\bble\b|\bchamp de mais\b/,
      /\bweizen\b|\bmaisfeld\b|\bgerste\b|\bhafer\b|\braps\b/,
      /(?:小麦|小麥|玉米|大麦|大麥|高粱|燕麦|燕麥)/,
    ],
  },
  soy_farmers: {
    terms: [
      /\bsoy(?:a|beans?)?\b(?![ -](?:sauce|milk))/,
      /\bsoja\b/,
      /(?:大豆|黄豆|黃豆)/,
    ],
  },
  bean_farmers: {
    terms: [
      /\bbean (?:crop|field|harvest|plants?)\b/,
      /\bfeijoal\b|\b(?:lavoura|plantacao|colheita) de feijao\b/,
      /\bfrijolar\b|\bcultivo de (?:frijol|frijoles|porotos)\b/,
      /\bchamp de haricots\b/,
      /\bbohnenfeld\b/,
      /(?:豆田|豆子地)/,
    ],
  },
  rice_farmers: {
    terms: [
      /\brice (?:paddy|paddies|field|crop|harvest)\b|\bpaddy\b/,
      /\barrozal\b|\b(?:lavoura|plantacao|colheita) de arroz\b/,
      /\bcultivo de arroz\b/,
      /\briziere\b/,
      /\breisfeld\b/,
      /(?:稻田|水稻)/,
    ],
  },
  sugarcane_growers: {
    terms: [
      /\bsugar ?cane\b/,
      /\bcanavial\b|\bcana(?:-| )de(?:-| )acucar\b/,
      /\bcanaveral\b|\bcana de azucar\b/,
      /\bcanne a sucre\b/,
      /\bzuckerrohr\b/,
      /甘蔗/,
    ],
  },
  cotton_growers: {
    terms: [
      /\bcotton (?:crop|field|harvest|bolls?)\b/,
      /\balgodoal\b|\b(?:lavoura|plantacao|colheita) de algodao\b/,
      /\balgodonal\b|\bcultivo de algodon\b/,
      /\bchamp de coton\b/,
      /\bbaumwollfeld\b/,
      /棉花(?:田|地)/,
    ],
  },
  tea_growers: {
    terms: [
      /\btea (?:plantation|estate|garden|bushes|harvest|pickers?)\b/,
      /\bplantacao de cha\b/,
      /\bplantacion de te\b/,
      /\bplantation de the\b/,
      /\bteeplantage\b/,
      /(?:茶园|茶園|采茶|採茶)/,
    ],
  },
  cocoa_growers: {
    terms: [
      /\b(?:cocoa|cacao) (?:crop|harvest|trees?|farm|plantation|pods?|beans?)\b/,
      /\bcacaueiro\b|\bcacaual\b|\b(?:lavoura|plantacao|colheita) de cacau\b/,
      /\bcacaotal\b|\bcultivo de cacao\b/,
      /\bcacaoyer\b|\bplantation de cacao\b/,
      /\bkakaoplantage\b/,
      /可可(?:树|樹|园|園)/,
    ],
  },
  grape_growers: {
    terms: [
      /\bvineyards?\b|\bgrape (?:harvest|vines?|crop)\b/,
      /\bvinhedos?\b|\bparreiras?\b|\bvideiras?\b|\bvindima\b/,
      /\bvinedos?\b|\bvendimia\b/,
      /\bvignobles?\b|\bvendanges?\b/,
      /\bweinberge?\b|\bweinlese\b/,
      /(?:葡萄园|葡萄園)/,
    ],
  },
  orchards: {
    // The Wikipedia rule is case-sensitive to dodge "Orchard Road"; a
    // 280-char note capitalizes at the sentence start, so case-sensitivity
    // here would only create false negatives. Corroboration is the gate.
    terms: [
      /\borchards?\b|\bfruit trees?\b|\bcitrus (?:grove|trees?|crop)\b/,
      /\bpomar(?:es)?\b|\blaranjal\b|\barvores frutiferas\b/,
      /\bnaranjal\b|\bfrutales\b|\bhuertos? de (?:frutales|manzanos)\b/,
      /\bvergers?\b|\barbres fruitiers\b/,
      /\bobstgarten\b|\bobstbaume\b|\bobstplantage\b/,
      /(?:果园|果園|果树|果樹)/,
    ],
  },
  horticulture: {
    terms: [
      /\bgreenhouses?\b|\bpolytunnels?\b|\bmarket garden\b|\bvegetable (?:crop|beds?|patch|garden)\b/,
      /\bestufas?\b|\bhorta\b|\bhortalicas\b|\bolericultura\b|\bfloricultura\b/,
      /\binvernaderos?\b|\bhuerta\b|\bhortalizas\b/,
      /\bserres?\b|\bmaraichage\b|\bpotager\b/,
      /\bgewachshaus\w*\b|\bgemusebeet\b|\bgartnerei\b/,
      /(?:大棚|温室|溫室|菜地)/,
    ],
  },
  livestock: {
    terms: [
      /\b(?:cattle|livestock|herds?|calves|cows?|sheep|goats)\b/,
      /\bgado\b|\brebanho\b|\bbezerros?\b|\bvacas?\b|\bovelhas?\b|\bcabras?\b|\bpasto\b/,
      /\bganado\b|\brebano\b|\bterneros?\b|\bovejas?\b/,
      /\bbetail\b|\btroupeau\b|\bvaches?\b|\bveaux\b|\bbrebis\b|\bchevres?\b/,
      /\bvieh\b|\bherde\b|\bkuhe?\b|\bkalber\b|\bschafe?\b|\bziegen?\b/,
      /(?:牛群|牲畜|奶牛|羊群|放牧)/,
    ],
  },
  fishing: {
    terms: [
      /\bfishing (?:boats?|fleet|nets?|trip|grounds?)\b|\bfishermen\b|\btrawlers?\b/,
      /\bpescadores?\b|\bbarcos? de pesca\b|\bpescaria\b/,
      /\bbarcas? de pesca\b|\bpesquer[oa]s?\b/,
      /\bpecheurs?\b|\bbateaux? de peche\b/,
      /\bfischer\b|\bfischerboote?\b/,
      /(?:渔民|漁民|渔船|漁船|出海)/,
    ],
  },
  street_vendors: {
    terms: [
      /\bstreet (?:vendors?|stalls?|market)\b|\bmarket stalls?\b|\bhawkers?\b/,
      /\bfeira(?:nte)?s?\b|\bbarracas?\b|\bcamelos?\b|\bambulantes\b/,
      /\bpuestos? (?:callejeros?|del mercado)\b|\bvendedores ambulantes\b/,
      /\betals?\b|\bmarche de rue\b|\bvendeurs ambulants\b/,
      /\bmarktstande?\b|\bstrassenverkaufer\b/,
      /(?:摊位|攤位|摊贩|攤販|集市)/,
    ],
  },
  ski_tourism: {
    terms: [
      /\bski (?:resort|slopes?|lifts?|season)\b/,
      /\b(?:estacao|pistas?) de esqui\b/,
      /\b(?:estacion|pistas?) de esqui\b/,
      /\b(?:station|pistes?) de ski\b|\bremontees? mecaniques?\b/,
      /\bskigebiet\b|\bskipisten?\b|\bskilift\w*\b/,
      /(?:滑雪场|滑雪場|雪道)/,
    ],
  },
};

/**
 * Structured field-report subtypes that are themselves evidence of an
 * activity. Deliberately tiny: most subtypes describe weather, not who is
 * exposed to it. "Crops wilting" says someone farms, but `farmers` is a
 * universal group that was never gated, and it does not say WHICH crop —
 * guessing one would be exactly the over-claiming this loop must avoid.
 *
 * Advisory subtypes are excluded wholesale (see ADVISORY_SUBTYPES).
 */
export const SUBTYPE_ACTIVITY: Record<string, string> = {
  animals_stressed: 'livestock',
  livestock_exposure: 'livestock',
};

/** Mirrors `advisory: true` in lib/field-reports/taxonomy.ts. Duplicated
 *  rather than imported to keep this module import-free; the cron route
 *  asserts the two lists agree. */
export const ADVISORY_SUBTYPES: string[] = [
  'avoid_route',
  'prepare_irrigation',
  'cover_crops',
  'move_animals_shade',
  'delay_outdoor_work',
  'check_neighbors',
];

// ── Matching ────────────────────────────────────────────────────────────────

export type ObservationActivityMatch = {
  group: string;
  term: string;
};

/**
 * Activities evidenced by one observation. Returns at most one match per
 * group (the first pattern that fires is evidence enough) so a note that
 * says "cattle" three times still counts once.
 */
export function matchObservationActivities(
  text: string | null | undefined,
  category: string | null | undefined,
): ObservationActivityMatch[] {
  const out: ObservationActivityMatch[] = [];
  const seen = new Set<string>();

  if (category && !ADVISORY_SUBTYPES.includes(category)) {
    const group = SUBTYPE_ACTIVITY[category];
    if (group) {
      seen.add(group);
      out.push({ group, term: category });
    }
  }

  const raw = text ?? '';
  if (raw.trim()) {
    const folded = foldText(raw);
    for (const [group, rule] of Object.entries(OBSERVATION_LEXICON)) {
      if (seen.has(group)) continue;
      let hit: string | null = null;
      for (const pattern of rule.terms) {
        const m = folded.match(pattern);
        if (m) {
          hit = m[0];
          break;
        }
      }
      if (hit) {
        seen.add(group);
        out.push({ group, term: hit });
      }
    }
  }

  return out;
}

// ── Mining orchestration ────────────────────────────────────────────────────
//
// Shared by /api/cron/enrich-places and
// scripts/mine-observation-activities.mjs. Takes a Supabase client
// structurally so this module stays dependency-free.

type DbClient = {
  from(table: string): any;
};

export type MineOptions = {
  /** How far back to read observations. Activities are structural — a
   *  coffee town stays a coffee town — so the window is long. */
  lookbackDays?: number;
  /** Hard bound on posts read in one pass (cost guard). */
  maxPosts?: number;
  /** Distinct authors required before a group refines anything. */
  confirmAuthors?: number;
  /** Evidence entries kept per (place, group). */
  evidenceCap?: number;
  /** Compute and log without writing. */
  dryRun?: boolean;
  log?: (msg: string) => void;
};

export type MineSummary = {
  posts_scanned: number;
  posts_matched: number;
  posts_without_place: number;
  /** Daily question answers folded in as second-stream evidence. */
  answers_scanned: number;
  places_touched: number;
  groups_evidenced: number;
  groups_confirmed: number;
  rows_written: number;
  rows_removed: number;
  errors: Array<{ scope: string; message: string }>;
};

const DEFAULT_LOOKBACK_DAYS = 365;
const DEFAULT_MAX_POSTS = 5000;
const DEFAULT_CONFIRM_AUTHORS = 2;
const DEFAULT_EVIDENCE_CAP = 8;

type Accumulator = {
  placeId: string;
  group: string;
  posts: Set<string>;
  authors: Set<string>;
  firstSeen: string;
  lastSeen: string;
  evidence: Array<{ post_id: string; group: string; term: string; at: string }>;
};

/**
 * Recompute `place_community_activity` from the live observation set.
 *
 * A full recompute rather than an incremental counter, on purpose: posts
 * get hidden, removed, or deleted with their author, and a recompute drops
 * them on the next pass with no cascade logic and no drift. At current
 * volume this is a single small query; `maxPosts` bounds the worst case.
 */
export async function mineObservationActivities(
  db: DbClient,
  opts: MineOptions = {},
): Promise<MineSummary> {
  const log = opts.log ?? (() => {});
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const maxPosts = opts.maxPosts ?? DEFAULT_MAX_POSTS;
  const confirmAuthors = Math.max(1, opts.confirmAuthors ?? DEFAULT_CONFIRM_AUTHORS);
  const evidenceCap = Math.max(1, opts.evidenceCap ?? DEFAULT_EVIDENCE_CAP);

  const summary: MineSummary = {
    posts_scanned: 0,
    posts_matched: 0,
    posts_without_place: 0,
    answers_scanned: 0,
    places_touched: 0,
    groups_evidenced: 0,
    groups_confirmed: 0,
    rows_written: 0,
    rows_removed: 0,
    errors: [],
  };

  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: posts, error: postsErr } = await db
    .from('signal_posts')
    .select('id, place_id, author_id, raw_text, category, created_at')
    .eq('moderation_state', 'visible')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(maxPosts);
  if (postsErr) throw new Error(`load observations: ${postsErr.message}`);

  // Accumulate desired state, keyed "placeId\ngroup".
  const acc = new Map<string, Accumulator>();

  for (const post of posts ?? []) {
    summary.posts_scanned += 1;
    if (!post.place_id) {
      // Market-attached posts predating the attribution fix, or markets
      // with no place row within range. Counted so the gap stays visible.
      summary.posts_without_place += 1;
      continue;
    }
    const matches = matchObservationActivities(post.raw_text, post.category);
    if (matches.length === 0) continue;
    summary.posts_matched += 1;

    const at = String(post.created_at);
    for (const match of matches) {
      const key = `${post.place_id}\n${match.group}`;
      let entry = acc.get(key);
      if (!entry) {
        entry = {
          placeId: String(post.place_id),
          group: match.group,
          posts: new Set<string>(),
          authors: new Set<string>(),
          firstSeen: at,
          lastSeen: at,
          evidence: [],
        };
        acc.set(key, entry);
      }
      entry.posts.add(String(post.id));
      // Count distinct authors. Every observation carries one: the composer is
      // open to everyone, but Share signs the reader in first (deferred auth),
      // so corroboration is always between two identifiable people. Rows with
      // no author are unreachable; skipping them keeps the confirm gate from
      // being padded if that ever stops being true.
      if (post.author_id) entry.authors.add(String(post.author_id));
      if (at < entry.firstSeen) entry.firstSeen = at;
      if (at > entry.lastSeen) entry.lastSeen = at;
      // Posts arrive newest-first, so the cap keeps the most recent
      // evidence — the entries most likely to still be checkable.
      if (entry.evidence.length < evidenceCap) {
        entry.evidence.push({
          post_id: String(post.id),
          group: match.group,
          term: match.term,
          at,
        });
      }
    }
  }

  // ── Second evidence stream: daily question answers ────────────────────────
  //
  // Tapping "coffee" on the daily question is the same claim as writing a note
  // that mentions coffee, made by someone who would never have written the
  // note. Both land in the SAME distinct-author set, so a tapper and a writer
  // corroborate each other and the 2-author confirm gate keeps its meaning.
  //
  // Answers are not re-validated against the taxonomy here: the API checked the
  // option against ACTIVITY_LABELS before storing it, which is the right place
  // for that check and keeps this module import-free. Filtering on the activity
  // bank's question id plus dropping the two non-group options is enough.
  const { data: answers, error: answersErr } = await db
    .from('place_pulse_answers')
    .select('id, place_id, option_id, author_id, created_at')
    .eq('question_id', 'activity_what_costs')
    .gte('created_at', since)
    .limit(maxPosts);
  if (answersErr) throw new Error(`load pulse answers: ${answersErr.message}`);

  for (const answer of answers ?? []) {
    const group = String(answer.option_id);
    if (!answer.place_id || !answer.author_id) continue;
    if (group === 'other' || group === 'none') continue;
    summary.answers_scanned += 1;

    const key = `${answer.place_id}\n${group}`;
    const at = String(answer.created_at);
    let entry = acc.get(key);
    if (!entry) {
      entry = {
        placeId: String(answer.place_id),
        group,
        posts: new Set<string>(),
        authors: new Set<string>(),
        firstSeen: at,
        lastSeen: at,
        evidence: [],
      };
      acc.set(key, entry);
    }
    entry.authors.add(String(answer.author_id));
    if (at < entry.firstSeen) entry.firstSeen = at;
    if (at > entry.lastSeen) entry.lastSeen = at;
    if (entry.evidence.length < evidenceCap) {
      // Tagged so a reader of the evidence blob can tell a tap from a written
      // note. They carry the same weight for confirmation and should not be
      // presented as if they were the same act.
      entry.evidence.push({
        post_id: `pulse:${String(answer.id)}`,
        group,
        term: 'daily_question',
        at,
      });
    }
  }

  const nowIso = new Date().toISOString();
  const rows = [...acc.values()].map((entry) => ({
    place_id: entry.placeId,
    group_slug: entry.group,
    observation_count: entry.posts.size,
    author_count: entry.authors.size,
    confirmed: entry.authors.size >= confirmAuthors,
    evidence: entry.evidence,
    first_seen_at: entry.firstSeen,
    last_seen_at: entry.lastSeen,
    updated_at: nowIso,
  }));

  summary.places_touched = new Set(rows.map((r) => r.place_id)).size;
  summary.groups_evidenced = rows.length;
  summary.groups_confirmed = rows.filter((r) => r.confirmed).length;

  for (const row of rows) {
    log(
      `[mine-observations] ${row.place_id} ${row.group_slug} ` +
        `posts=${row.observation_count} authors=${row.author_count} ` +
        `${row.confirmed ? 'CONFIRMED' : 'unconfirmed'}`,
    );
  }

  // Reconcile against what is already stored. Rows whose evidence has gone
  // (post hidden, removed, or aged out of the window) must disappear —
  // that is the whole point of recomputing rather than incrementing.
  const { data: existing, error: existingErr } = await db
    .from('place_community_activity')
    .select('place_id, group_slug');
  if (existingErr) throw new Error(`load existing rows: ${existingErr.message}`);

  const desired = new Set(rows.map((r) => `${r.place_id}\n${r.group_slug}`));
  const stale = (existing ?? []).filter(
    (r: { place_id: string; group_slug: string }) =>
      !desired.has(`${r.place_id}\n${r.group_slug}`),
  );

  if (opts.dryRun) {
    log(
      `[mine-observations] dry run — would write ${rows.length} row(s), ` +
        `remove ${stale.length}`,
    );
    return summary;
  }

  if (rows.length > 0) {
    const { error: upErr } = await db
      .from('place_community_activity')
      .upsert(rows, { onConflict: 'place_id,group_slug' });
    if (upErr) {
      summary.errors.push({ scope: 'upsert', message: upErr.message });
    } else {
      summary.rows_written = rows.length;
    }
  }

  for (const row of stale) {
    const { error: delErr } = await db
      .from('place_community_activity')
      .delete()
      .eq('place_id', row.place_id)
      .eq('group_slug', row.group_slug);
    if (delErr) {
      summary.errors.push({
        scope: `delete ${row.place_id}/${row.group_slug}`,
        message: delErr.message,
      });
    } else {
      summary.rows_removed += 1;
    }
  }

  return summary;
}

/**
 * Confirmed community groups per place, for the signal engine and the
 * place page. Unconfirmed rows are stored but never returned — they have
 * not cleared the corroboration gate.
 */
export async function loadConfirmedCommunityGroups(
  db: DbClient,
): Promise<Map<string, string[]>> {
  const { data, error } = await db
    .from('place_community_activity')
    .select('place_id, group_slug')
    .eq('confirmed', true);
  if (error) throw new Error(`load community activity: ${error.message}`);

  const byPlace = new Map<string, string[]>();
  for (const row of data ?? []) {
    const placeId = String(row.place_id);
    const list = byPlace.get(placeId);
    if (list) list.push(String(row.group_slug));
    else byPlace.set(placeId, [String(row.group_slug)]);
  }
  return byPlace;
}
