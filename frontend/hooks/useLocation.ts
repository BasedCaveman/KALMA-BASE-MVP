//frontend/hooks/useLocation.ts
'use client';

import { useMemo } from 'react';
import { useLocationContext } from '@/hooks/useLocationContext';

export type LocationInfo = {
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  currency: string;
  currencySymbol: string;
  language: string;
  timezone: string;
};

const CURRENCY_MAP: Record<string, { currency: string; symbol: string }> = {
  BR: { currency: 'BRL', symbol: 'R$' },
  US: { currency: 'USD', symbol: '$' },
  GB: { currency: 'GBP', symbol: '£' },
  DE: { currency: 'EUR', symbol: '€' },
  FR: { currency: 'EUR', symbol: '€' },
  IT: { currency: 'EUR', symbol: '€' },
  ES: { currency: 'EUR', symbol: '€' },
  PT: { currency: 'EUR', symbol: '€' },
  MX: { currency: 'MXN', symbol: '$' },
  AR: { currency: 'ARS', symbol: '$' },
  CO: { currency: 'COP', symbol: '$' },
  CL: { currency: 'CLP', symbol: '$' },
  PE: { currency: 'PEN', symbol: 'S/' },
  NG: { currency: 'NGN', symbol: '₦' },
  KE: { currency: 'KES', symbol: 'KSh' },
  ZA: { currency: 'ZAR', symbol: 'R' },
  GH: { currency: 'GHS', symbol: '₵' },
  IN: { currency: 'INR', symbol: '₹' },
  JP: { currency: 'JPY', symbol: '¥' },
  CN: { currency: 'CNY', symbol: '¥' },
};

const COUNTRY_CODE_MAP: Record<string, string> = {
  Brazil: 'BR',
  'United States': 'US',
  'United Kingdom': 'GB',
  Germany: 'DE',
  France: 'FR',
  Italy: 'IT',
  Spain: 'ES',
  Portugal: 'PT',
  Mexico: 'MX',
  Argentina: 'AR',
  Colombia: 'CO',
  Chile: 'CL',
  Peru: 'PE',
  Nigeria: 'NG',
  Kenya: 'KE',
  'South Africa': 'ZA',
  Ghana: 'GH',
  India: 'IN',
  Japan: 'JP',
  China: 'CN',
};

const DEFAULT_LOCATION: LocationInfo = {
  city: 'Austin',
  country: 'United States',
  countryCode: 'US',
  latitude: 30.2672,
  longitude: -97.7431,
  currency: 'USD',
  currencySymbol: '$',
  language: 'en-US',
  timezone: 'America/Chicago',
};

function getBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'en-US';
  return navigator.language || 'en-US';
}

function inferCountryCode(country: string | null | undefined): string {
  if (!country) return DEFAULT_LOCATION.countryCode;
  return COUNTRY_CODE_MAP[country] ?? DEFAULT_LOCATION.countryCode;
}

export function useLocation() {
  const { location, isLoading, error } = useLocationContext();

  const mappedLocation = useMemo<LocationInfo>(() => {
    if (!location || location.lat == null || location.lon == null) {
      return {
        ...DEFAULT_LOCATION,
        language: getBrowserLanguage(),
      };
    }

    const countryCode = inferCountryCode(location.country);
    const currencyInfo = CURRENCY_MAP[countryCode] ?? {
      currency: 'USD',
      symbol: '$',
    };

    return {
      city: location.city ?? DEFAULT_LOCATION.city,
      country: location.country ?? DEFAULT_LOCATION.country,
      countryCode,
      latitude: location.lat,
      longitude: location.lon,
      currency: currencyInfo.currency,
      currencySymbol: currencyInfo.symbol,
      language: getBrowserLanguage(),
      timezone: location.timezone ?? DEFAULT_LOCATION.timezone,
    };
  }, [location]);

  return {
    location: mappedLocation,
    loading: isLoading,
    error: error || null,
  };
}
