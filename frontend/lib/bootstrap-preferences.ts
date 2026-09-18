//frontend/lib/bootstrap-preferences.ts
import type { LocationContextValue } from '@/lib/location';

export type BootstrapPreferences = {
  language: string;
  currency: string;
  timezone: string | null;
  homeLocation: LocationContextValue | null;
  source: {
    language: 'user' | 'browser' | 'fallback';
    currency: 'user' | 'timezone' | 'country' | 'fallback';
    location: 'manual' | 'ip' | 'capital-fallback' | 'none';
    timezone: 'manual' | 'ip' | 'browser' | 'none';
  };
};
