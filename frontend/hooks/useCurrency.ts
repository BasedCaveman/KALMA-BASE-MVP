'use client';

import { useEffect, useState } from 'react';

interface ExchangeRates {
  [key: string]: number;
}

const FALLBACK_RATES: ExchangeRates = {
  USD: 1,
  BRL: 5.22,
  EUR: 0.92,
  GBP: 0.79,
  MXN: 17.5,
  ARS: 850,
  COP: 4000,
  CLP: 900,
  PEN: 3.7,
  NGN: 1500,
  KES: 155,
  ZAR: 18.5,
  GHS: 12.5,
  INR: 83,
  JPY: 150,
  CNY: 7.2,
  CAD: 1.36,
  AUD: 1.55,
};

// Currencies where decimals aren't conventional
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'CLP', 'VND', 'ISK']);

// Canonical locale per currency so thousands/decimal separators always match
// the chosen fiat's convention, independent of the browser locale:
//   USD → 1,234.56   ·   BRL → 1.234,56   ·   EUR → 1.234,56
const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US', BRL: 'pt-BR', EUR: 'de-DE', GBP: 'en-GB', MXN: 'es-MX',
  ARS: 'es-AR', COP: 'es-CO', CLP: 'es-CL', PEN: 'es-PE', NGN: 'en-NG',
  KES: 'en-KE', ZAR: 'en-ZA', GHS: 'en-GH', INR: 'en-IN', JPY: 'ja-JP',
  CNY: 'zh-CN', KRW: 'ko-KR', CAD: 'en-CA', AUD: 'en-AU',
};

function localeFor(currency: string): string {
  return CURRENCY_LOCALE[currency] ?? 'en-US';
}

function decimalsFor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export function useCurrency(targetCurrency: string = 'USD') {
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRates() {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (response.ok) {
          const data = await response.json();
          setRates(data.rates);
        }
      } catch (err) {
        console.error('Failed to fetch exchange rates:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRates();
  }, []);

  const convertFromUSD = (usdAmount: number): number => {
    const rate = rates[targetCurrency] || 1;
    return usdAmount * rate;
  };

  const convertToUSD = (localAmount: number): number => {
    const rate = rates[targetCurrency] || 1;
    return localAmount / rate;
  };

  /**
   * Currency formatter that keeps full precision up to 999,999.99 and switches
   * to compact M/B above a million, so a monetary value always fits on one line
   * (never wraps). Separators follow the chosen fiat's convention.
   *
   * Examples (USD):  240 → $240.00 · 999999.99 → $999,999.99 · 1.5M → $1.5M · 1B → $1B
   * Examples (BRL):  240 → R$240,00 · 999999.99 → R$999.999,99 · 1.5M → R$1,5M
   */
  const formatCurrency = (amount: number, currency: string = targetCurrency): string => {
    const locale = localeFor(currency);
    const decimals = decimalsFor(currency);

    // Guard: NaN or Infinity
    if (!isFinite(amount)) return formatSimple(0, currency, locale, decimals);

    const absAmount = Math.abs(amount);

    // Billions (≥ 1,000,000,000) → compact, e.g. $1B
    if (absAmount >= 1_000_000_000) {
      return formatCompact(amount / 1_000_000_000, currency, locale, 'B');
    }

    // Millions (≥ 1,000,000) → compact, e.g. $1.5M
    if (absAmount >= 1_000_000) {
      return formatCompact(amount / 1_000_000, currency, locale, 'M');
    }

    // Everything below a million keeps full precision (6 integer digits + the
    // currency's decimals), e.g. 999,999.99 — so creator/treasury values read
    // exactly without dropping cents.
    return formatSimple(amount, currency, locale, decimals);
  };

  return {
    rates,
    loading,
    convertFromUSD,
    convertToUSD,
    formatCurrency,
    targetCurrency,
  };
}

// Helper: the currency symbol for a locale (e.g. "$", "R$", "€"), so compact
// values can prepend it manually and keep a uniform M/B suffix.
function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '';
  } catch {
    return '';
  }
}

// Helper: compact value with a uniform M/B suffix and locale-correct decimal
// separator (e.g. $1.5M, R$1,5M, $100M, $1B). Up to one decimal, trailing zero
// dropped.
function formatCompact(shortened: number, currency: string, locale: string, suffix: string): string {
  try {
    const num = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(shortened);
    return `${currencySymbol(currency, locale)}${num}${suffix}`;
  } catch {
    return `${shortened.toFixed(1).replace(/[.,]0$/, '')}${suffix}`;
  }
}

// Helper: standard format with configurable decimals, in the currency's locale.
function formatSimple(amount: number, currency: string, locale: string, decimals: number = 2): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${amount.toFixed(decimals)}`;
  }
}
