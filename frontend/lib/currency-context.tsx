'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCurrency } from '@/hooks/useCurrency'

const COUNTRY_CURRENCY: Record<string, string> = {
  BR: 'BRL', US: 'USD', GB: 'GBP',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR',
  MX: 'MXN', AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN',
  NG: 'NGN', KE: 'KES', ZA: 'ZAR', GH: 'GHS',
  IN: 'INR', JP: 'JPY', CN: 'CNY', KR: 'KRW',
  CA: 'CAD', AU: 'AUD',
}

export const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'USD · $' },
  { code: 'BRL', label: 'BRL · R$' },
  { code: 'EUR', label: 'EUR · €' },
  { code: 'GBP', label: 'GBP · £' },
  { code: 'MXN', label: 'MXN · $' },
  { code: 'ARS', label: 'ARS · $' },
  { code: 'COP', label: 'COP · $' },
  { code: 'NGN', label: 'NGN · ₦' },
  { code: 'KES', label: 'KES · KSh' },
  { code: 'ZAR', label: 'ZAR · R' },
  { code: 'INR', label: 'INR · ₹' },
  { code: 'JPY', label: 'JPY · ¥' },
  { code: 'CNY', label: 'CNY · ¥' },
  { code: 'CAD', label: 'CAD · $' },
  { code: 'AUD', label: 'AUD · $' },
] as const

const STORAGE_KEY = 'kalma-currency'

function detectCurrency(): string {
  if (typeof window === 'undefined') return 'USD'
  try {
    // Check saved preference first
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && CURRENCY_OPTIONS.some(c => c.code === saved)) return saved

    // Detect from browser locale
    const lang = navigator.language || 'en-US'
    const parts = lang.split('-')
    const country = parts.length >= 2 ? parts[parts.length - 1].toUpperCase() : null
    if (country && COUNTRY_CURRENCY[country]) return COUNTRY_CURRENCY[country]

    // Fallback by language
    const langOnly = parts[0].toLowerCase()
    const LANG_FALLBACK: Record<string, string> = {
      pt: 'BRL', ja: 'JPY', zh: 'CNY', ko: 'KRW', hi: 'INR',
      de: 'EUR', fr: 'EUR', es: 'MXN', it: 'EUR',
    }
    if (LANG_FALLBACK[langOnly]) return LANG_FALLBACK[langOnly]
  } catch {
    // ignore
  }
  return 'USD'
}

interface CurrencyContextValue {
  formatLocal: (usdmAmount: number) => string
  convertLocal: (usdmAmount: number) => number
  currencyCode: string
  setCurrency: (code: string) => void
  ratesLoading: boolean
}

const CurrencyContext = createContext<CurrencyContextValue>({
  formatLocal: (n) => `$${n.toFixed(2)}`,
  convertLocal: (n) => n,
  currencyCode: 'USD',
  setCurrency: () => {},
  ratesLoading: true,
})

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState('USD')

  useEffect(() => {
    setCode(detectCurrency())
  }, [])

  const { formatCurrency, convertFromUSD, loading } = useCurrency(code)

  function setCurrency(newCode: string) {
    setCode(newCode)
    try { localStorage.setItem(STORAGE_KEY, newCode) } catch {}
  }

  const value = useMemo<CurrencyContextValue>(() => ({
    formatLocal: (usdm: number) => formatCurrency(convertFromUSD(usdm)),
    convertLocal: (usdm: number) => convertFromUSD(usdm),
    currencyCode: code,
    setCurrency,
    ratesLoading: loading,
  }), [formatCurrency, convertFromUSD, code, loading])

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrencyContext() {
  return useContext(CurrencyContext)
}
