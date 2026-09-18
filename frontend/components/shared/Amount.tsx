'use client'

import { C, fonts } from '@/components/design/palette'
import { useCurrencyContext } from '@/lib/currency-context'

/**
 * Display a USDC amount in the user's local currency.
 *
 * <Amount usdm={50} />           → "R$261.00" with "≈ 50 USDC" hint below
 * <Amount usdm={50} hint={false} /> → "R$261.00" only
 * <Amount usdm={50} inline />    → "R$261.00" inline, no hint, inherits parent font
 */
export function Amount({
  usdm,
  hint = true,
  inline = false,
  size = 'normal',
}: {
  usdm: number
  hint?: boolean
  inline?: boolean
  size?: 'normal' | 'large' | 'small'
}) {
  const { formatLocal, currencyCode } = useCurrencyContext()

  const localStr = formatLocal(usdm)
  const isUSD = currencyCode === 'USD'

  // Inline mode: just the formatted string, no wrapper
  if (inline) {
    return <>{isUSD ? `${usdm.toFixed(usdm >= 100 ? 0 : usdm >= 1 ? 1 : 2)} USDC` : localStr}</>
  }

  const fontSize = size === 'large' ? 20 : size === 'small' ? 13 : 15

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span style={{
        fontFamily: fonts.sans,
        fontSize,
        fontWeight: 700,
        color: C.text,
      }}>
        {isUSD ? `${usdm.toFixed(usdm >= 100 ? 0 : 1)} USDC` : localStr}
      </span>

      {hint && !isUSD ? (
        <span style={{
          fontFamily: fonts.mono,
          fontSize: Math.max(9, fontSize - 4),
          color: C.textMuted,
          marginTop: 1,
        }}>
          ≈ {usdm.toFixed(usdm >= 100 ? 0 : 1)} USDC
        </span>
      ) : null}
    </span>
  )
}

/**
 * Format a USDC value as a local currency string (hook-based, for use in computed text).
 * Returns { local: "R$261.00", hint: "≈ 50 USDC", isUSD: false }
 */
export function useLocalAmount(usdm: number) {
  const { formatLocal, currencyCode } = useCurrencyContext()
  const isUSD = currencyCode === 'USD'

  return {
    local: isUSD ? `${usdm.toFixed(usdm >= 100 ? 0 : 1)} USDC` : formatLocal(usdm),
    hint: isUSD ? null : `≈ ${usdm.toFixed(usdm >= 100 ? 0 : 1)} USDC`,
    isUSD,
  }
}
