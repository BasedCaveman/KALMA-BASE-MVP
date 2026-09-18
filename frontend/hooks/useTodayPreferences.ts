'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/social/auth-fetch';
import { useAccount } from '@/hooks/useWallet';
import type { ActivityTaxonomyId, RiskTaxonomyId } from '@/lib/activity-taxonomy';
import {
  DEFAULT_TODAY_PREFERENCES,
  readTodayPreferences,
  writeTodayPreferences,
  type TodayPreferences,
} from '@/lib/today-preferences';

export function useTodayPreferences() {
  const { address } = useAccount();
  const [preferences, setPreferences] = useState<TodayPreferences>(DEFAULT_TODAY_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPreferences(readTodayPreferences());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!address || !hydrated) return;

    let cancelled = false;
    const walletAddress = address;

    async function loadRemote() {
      const local = readTodayPreferences();
      const hasLocalPreference =
        local.activityFilter !== DEFAULT_TODAY_PREFERENCES.activityFilter ||
        local.riskFilter !== DEFAULT_TODAY_PREFERENCES.riskFilter;

      if (hasLocalPreference) {
        await authFetch('/api/preferences/today', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address: walletAddress, ...local }),
        }).catch(() => null);
      }

      const response = await authFetch(`/api/preferences/today?address=${encodeURIComponent(walletAddress)}`, {
        headers: { accept: 'application/json' },
      }).catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (cancelled || !response?.ok) return;

      const remote = payload?.preferences as Partial<TodayPreferences> | undefined;
      const next = {
        activityFilter: remote?.activityFilter ?? local.activityFilter,
        riskFilter: remote?.riskFilter ?? local.riskFilter,
      } as TodayPreferences;

      setPreferences(next);
      writeTodayPreferences(next);
    }

    void loadRemote();
    return () => {
      cancelled = true;
    };
  }, [address, hydrated]);

  const updatePreferences = (updates: Partial<TodayPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...updates };
      writeTodayPreferences(next);
      if (address) {
        void authFetch('/api/preferences/today', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, ...next }),
        }).catch(() => null);
      }
      return next;
    });
  };

  return {
    preferences,
    hydrated,
    setActivityFilter: (activityFilter: ActivityTaxonomyId) => updatePreferences({ activityFilter }),
    setRiskFilter: (riskFilter: RiskTaxonomyId) => updatePreferences({ riskFilter }),
  };
}
