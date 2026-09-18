//frontend/hooks/useTheme.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'kalma-theme'

interface ThemeContextValue {
  theme: ResolvedTheme
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  mode: 'dark',
  setMode: () => {},
  toggle: () => {},
})

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [theme, setTheme] = useState<ResolvedTheme>('dark')

  // Load saved preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        setModeState(saved)
        setTheme(resolveTheme(saved))
      } else {
        setModeState('dark')
        setTheme('dark')
      }
    } catch {
      setModeState('dark')
      setTheme('dark')
    }
  }, [])

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (mode !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light')
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mode])

  // Sync data-theme attribute on html element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    setTheme(resolveTheme(newMode))
    try { localStorage.setItem(STORAGE_KEY, newMode) } catch {}
  }, [])

  const toggle = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light'
    setMode(next)
  }, [theme, setMode])

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
