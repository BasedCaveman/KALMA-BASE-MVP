// kalma/frontend/lib/growth/place-events.ts
//
// A date the reader already had in their head, and weather arriving in that
// window. See lib/growth/hooks.ts for what this powers and why the hook it
// feeds may only state an overlap between two date ranges, never predict
// what happens to the event.
//
// Backed by public.place_events (supabase/migrations/20260807_place_events.sql),
// not a code constant: the first cut of this lived as a hardcoded map for
// exactly one afternoon, and moved to a table the same day for the reason
// every enrichment source in this schema is a table: growth beyond a
// handful of hand-reviewed rows needs a place to write to. Only `verified`
// rows are read; a future place-search enrichment pass writes candidates
// here as unverified and a human promotes them, the same review gate as
// place_activity_profiles' coord_verified.
//
// Two kinds:
//   RECURRING  month-granular, annual. Carnival moves with Easter and
//              Oktoberfest straddles two months, so these claim a month
//              range rather than exact dates a periodic enrichment pass
//              cannot keep current.
//   SCHEDULED  a specific one-off with real dates: a congress, an Olympics,
//              a fixture already on a public calendar. The more valuable
//              case and the reason this table has two kinds rather than
//              one, but deliberately not self-service: only events already
//              public somewhere (a city calendar, a news article, an
//              organizer's own site) belong here, never a pop-up or a
//              small private gathering. The schema enforces that a row
//              cites a source; it cannot enforce that the event is major,
//              which stays a human judgment at review time.

import { rest } from './kalma-data.ts';

export type PlaceEvent = {
  name: string;
  kind: 'recurring' | 'scheduled';
  outdoor: boolean;
  /** 1-12. Set together with monthEnd for a recurring event, else null. */
  monthStart: number | null;
  monthEnd: number | null;
  /** ISO date. Set together with dateEnd for a scheduled event, else null. */
  dateStart: string | null;
  dateEnd: string | null;
};

interface RawPlaceEvent {
  place_id: string;
  name: string;
  kind: 'recurring' | 'scheduled';
  outdoor: boolean;
  month_start: number | null;
  month_end: number | null;
  date_start: string | null;
  date_end: string | null;
}

/**
 * place_id → verified events. Only `verified` rows are trusted, the same
 * bar as `coord_verified` on place_activity_profiles.
 */
export async function fetchPlaceEvents(): Promise<Map<string, PlaceEvent[]>> {
  const rows = await rest<RawPlaceEvent[]>(
    'place_events?select=place_id,name,kind,outdoor,month_start,month_end,date_start,date_end&verified=is.true&limit=1000',
  );
  const map = new Map<string, PlaceEvent[]>();
  for (const row of rows) {
    const list = map.get(row.place_id) ?? [];
    list.push({
      name: row.name,
      kind: row.kind,
      outdoor: row.outdoor,
      monthStart: row.month_start,
      monthEnd: row.month_end,
      dateStart: row.date_start,
      dateEnd: row.date_end,
    });
    map.set(row.place_id, list);
  }
  return map;
}

/** True when `month` (1-12) falls in a range that may wrap the year end. */
function monthInRange(month: number, start: number, end: number): boolean {
  return start <= end
    ? month >= start && month <= end
    : month >= start || month <= end;
}

/**
 * The months a validity window touches, walked one at a time so a window
 * spanning a year boundary needs no special case. Bails after 24 months so a
 * malformed or open-ended window cannot spin.
 */
function monthsTouched(start: Date, end: Date): Set<number> {
  const months = new Set<number>();
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  for (let guard = 0; guard < 24; guard++) {
    months.add(cursor.getUTCMonth() + 1);
    if (
      cursor.getUTCFullYear() > end.getUTCFullYear() ||
      (cursor.getUTCFullYear() === end.getUTCFullYear() &&
        cursor.getUTCMonth() >= end.getUTCMonth())
    ) {
      break;
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * The outdoor events, among `events`, whose window overlaps the signal's
 * validity window [from, to]. Recurring events are compared by month
 * (wrap-aware); scheduled events by exact date-range overlap.
 */
export function eventsInWindow(
  events: PlaceEvent[],
  from: string | null | undefined,
  to: string | null | undefined,
): PlaceEvent[] {
  if (!events.length || !from) return [];

  const start = new Date(from);
  // A signal with no end is treated as covering its start day/month only,
  // which is the conservative reading.
  const end = to ? new Date(to) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end.getTime() < start.getTime()) return [];

  const months = monthsTouched(start, end);

  return events.filter((e) => {
    if (!e.outdoor) return false;
    if (e.kind === 'recurring') {
      if (e.monthStart == null || e.monthEnd == null) return false;
      return [...months].some((m) => monthInRange(m, e.monthStart!, e.monthEnd!));
    }
    // scheduled: exact date-range overlap.
    if (!e.dateStart || !e.dateEnd) return false;
    const eStart = new Date(e.dateStart);
    const eEnd = new Date(e.dateEnd);
    if (Number.isNaN(eStart.getTime()) || Number.isNaN(eEnd.getTime())) return false;
    return eStart.getTime() <= end.getTime() && eEnd.getTime() >= start.getTime();
  });
}
