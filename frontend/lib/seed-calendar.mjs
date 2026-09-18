//kalma/frontend/lib/seed-calendar.mjs

const DAY_MS = 86_400_000;
export const SEED_MIN_LEAD_MS = 5 * 60_000;

function parseCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Seed dates must use YYYY-MM-DD');
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid seed date: ${value}`);
  }
  return date;
}

export function parseSeedWindow(start, end, { nowMs = Date.now() } = {}) {
  const startDate = parseCalendarDate(start);
  const endDate = parseCalendarDate(end);
  const durationDays = (endDate.getTime() - startDate.getTime()) / DAY_MS;
  if (durationDays < 1 || durationDays > 30) {
    throw new Error('Seed observation duration must be between 1 and 30 days');
  }
  if (startDate.getTime() <= nowMs + SEED_MIN_LEAD_MS) {
    throw new Error('Seed start must be more than 5 minutes ahead; review the calendar instead of silently changing the observation window');
  }
  if (startDate.getTime() > nowMs + 90 * DAY_MS) {
    throw new Error('Seed start exceeds the contract limit of 90 days ahead');
  }
  return { startDate, endDate, durationDays };
}

// Intervals are half-open: an answer closes exactly at predictionDeadline.
export function findCoverageGaps(windows, { fromMs, untilMs }) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs) || untilMs <= fromMs) {
    throw new Error('Coverage requires a finite, increasing time horizon');
  }
  for (const window of windows) {
    if (!Number.isFinite(window.opensAtMs) || !Number.isFinite(window.closesAtMs)) {
      throw new Error('Coverage windows require finite opening and closing times');
    }
  }
  const ordered = windows
    .filter((window) => window.closesAtMs > window.opensAtMs)
    .slice()
    .sort((a, b) => a.opensAtMs - b.opensAtMs);
  const gaps = [];
  let cursor = fromMs;
  for (const window of ordered) {
    if (window.closesAtMs <= cursor) continue;
    if (window.opensAtMs >= untilMs) break;
    if (window.opensAtMs > cursor) {
      gaps.push({ fromMs: cursor, untilMs: window.opensAtMs });
    }
    cursor = Math.max(cursor, window.closesAtMs);
    if (cursor >= untilMs) break;
  }
  if (cursor < untilMs) gaps.push({ fromMs: cursor, untilMs });
  return gaps;
}

// This projects only current, unresolved on-chain availability forward.
// It cannot reconstruct past availability or assume future seeds happened.
export function marketAnswerWindows(markets, { nowMs, paused = false }) {
  if (paused) return [];
  return markets
    .filter((market) => !market.resolved && !market.cancelled)
    .map((market) => ({
      opensAtMs: nowMs,
      closesAtMs: Math.min(market.predictionDeadlineMs, market.endTimeMs),
    }))
    .filter((window) => window.closesAtMs > nowMs);
}
