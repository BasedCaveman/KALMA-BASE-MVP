import type { ActivityTaxonomyId, RiskTaxonomyId } from '@/lib/activity-taxonomy';

const STORAGE_KEY = 'kalma-today-preferences-v1';

export type TodayPreferences = {
  activityFilter: ActivityTaxonomyId;
  riskFilter: RiskTaxonomyId;
};

export const DEFAULT_TODAY_PREFERENCES: TodayPreferences = {
  activityFilter: 'all',
  riskFilter: 'all',
};

export function readTodayPreferences(): TodayPreferences {
  if (typeof window === 'undefined') return DEFAULT_TODAY_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TODAY_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      activityFilter:
        typeof parsed?.activityFilter === 'string'
          ? parsed.activityFilter
          : DEFAULT_TODAY_PREFERENCES.activityFilter,
      riskFilter:
        typeof parsed?.riskFilter === 'string'
          ? parsed.riskFilter
          : DEFAULT_TODAY_PREFERENCES.riskFilter,
    } as TodayPreferences;
  } catch {
    return DEFAULT_TODAY_PREFERENCES;
  }
}

export function writeTodayPreferences(next: TodayPreferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore privacy mode / quota failures
  }
}

export function writeTodayActivityPreference(activityFilter: ActivityTaxonomyId) {
  const current = readTodayPreferences();
  writeTodayPreferences({ ...current, activityFilter });
}
