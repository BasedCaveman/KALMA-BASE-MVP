//kalma/frontend/hooks/useProfile.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import { authFetch } from '@/lib/social/auth-fetch';
import { useAccount } from '@/hooks/useWallet';
import {
  isHandleAvailable,
  getProfileStats,
} from '@/lib/social/profiles'
import type { Profile } from '@/lib/social/types'

type Stats = {
  signalsCount: number
  followersCount: number
  followingCount: number
}

type UseProfileResult = {
  profile: Profile | null
  stats: Stats | null
  isLoading: boolean
  hasProfile: boolean
  refresh: () => void
  updateProfile: (
    updates: Partial<Pick<Profile, 'handle' | 'display_name' | 'avatar_url' | 'bio' | 'specialty'>>
  ) => Promise<{ error: string | null }>
  checkHandle: (handle: string) => Promise<boolean>
}

export function useProfile(): UseProfileResult {
  const { address } = useAccount()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!address) {
      setProfile(null)
      setStats(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    async function load() {
      const response = await authFetch(`/api/profile?address=${encodeURIComponent(address!)}`, {
        headers: { accept: 'application/json' },
      })
      const payload = await response.json().catch(() => null)
      const p = response.ok ? (payload?.profile as Profile | null) : null
      if (cancelled) return
      setProfile(p)
      setStats(response.ok ? (payload?.stats as Stats | null) : null)

      setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [address, tick])

  const updateProfile = useCallback(
    async (updates: Partial<Pick<Profile, 'handle' | 'display_name' | 'avatar_url' | 'bio' | 'specialty'>>) => {
      if (!address) return { error: 'Not connected' }
      const response = await authFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, ...updates }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) return { error: payload?.message || payload?.error || 'Could not update profile.' }
      refresh()
      return { error: null }
    },
    [address, refresh]
  )

  const checkHandle = useCallback(
    async (handle: string) => isHandleAvailable(handle),
    []
  )

  return {
    profile,
    stats,
    isLoading,
    hasProfile: !!profile,
    refresh,
    updateProfile,
    checkHandle,
  }
}

/**
 * Fetch any profile by handle — for public profile pages.
 */
export function usePublicProfile(handle: string | null): {
  profile: Profile | null
  stats: Stats | null
  isLoading: boolean
} {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!handle) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    async function load() {
      const { getProfileByHandle } = await import('@/lib/social/profiles')
      const p = await getProfileByHandle(handle!)
      if (cancelled) return
      setProfile(p)

      if (p) {
        const s = await getProfileStats(p.id)
        if (!cancelled) setStats(s)
      }

      setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [handle])

  return { profile, stats, isLoading }
}
