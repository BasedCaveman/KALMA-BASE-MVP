//kalma/frontend/hooks/useFollow.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  followUser, unfollowUser, isFollowingUser,
  followPlace, unfollowPlace, isFollowingPlace,
  getFollowedPlaces, getFollowedPlaceIds, getFollowingIds,
  watchMarket, unwatchMarket, isWatchingMarket,
} from '@/lib/social/follows'
import type { Place } from '@/lib/social/types'

// ── Follow a user ──────────────────────────────────────────────────────────────

export function useFollowUser(currentProfileId: string | null, targetProfileId: string | null) {
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLoading, setIsLoading]   = useState(false)

  useEffect(() => {
    if (!currentProfileId || !targetProfileId) return
    isFollowingUser(currentProfileId, targetProfileId).then(setIsFollowing)
  }, [currentProfileId, targetProfileId])

  const toggle = useCallback(async () => {
    if (!currentProfileId || !targetProfileId) return
    setIsLoading(true)
    if (isFollowing) {
      await unfollowUser(currentProfileId, targetProfileId)
      setIsFollowing(false)
    } else {
      await followUser(currentProfileId, targetProfileId)
      setIsFollowing(true)
    }
    setIsLoading(false)
  }, [currentProfileId, targetProfileId, isFollowing])

  return { isFollowing, isLoading, toggle }
}

// ── Follow a place ─────────────────────────────────────────────────────────────

export function useFollowPlace(profileId: string | null, placeId: string | null) {
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLoading, setIsLoading]   = useState(false)

  useEffect(() => {
    if (!profileId || !placeId) return
    isFollowingPlace(profileId, placeId).then(setIsFollowing)
  }, [profileId, placeId])

  const toggle = useCallback(async () => {
    if (!profileId || !placeId) return
    setIsLoading(true)
    if (isFollowing) {
      await unfollowPlace(profileId, placeId)
      setIsFollowing(false)
    } else {
      await followPlace(profileId, placeId)
      setIsFollowing(true)
    }
    setIsLoading(false)
  }, [profileId, placeId, isFollowing])

  return { isFollowing, isLoading, toggle }
}

// ── Followed places list (for home screen + profile) ──────────────────────────

export function useFollowedPlaces(profileId: string | null): {
  places: Place[]
  placeIds: string[]
  isLoading: boolean
  refresh: () => void
} {
  const [places, setPlaces]   = useState<Place[]>([])
  const [placeIds, setPlaceIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!profileId) {
      setPlaces([])
      setPlaceIds([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    async function load() {
      const [p, ids] = await Promise.all([
        getFollowedPlaces(profileId!),
        getFollowedPlaceIds(profileId!),
      ])
      if (cancelled) return
      setPlaces(p)
      setPlaceIds(ids)
      setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [profileId, tick])

  return { places, placeIds, isLoading, refresh: () => setTick((t) => t + 1) }
}

// ── Following IDs (for feed queries) ─────────────────────────────────────────

export function useFollowingIds(profileId: string | null): {
  followingIds: string[]
  isLoading: boolean
} {
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!profileId) {
      setFollowingIds([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    getFollowingIds(profileId).then((ids) => {
      if (!cancelled) {
        setFollowingIds(ids)
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [profileId])

  return { followingIds, isLoading }
}

// ── Watch a market ─────────────────────────────────────────────────────────────

export function useWatchMarket(profileId: string | null, marketId: number | null) {
  const [isWatching, setIsWatching] = useState(false)
  const [isLoading, setIsLoading]  = useState(false)

  useEffect(() => {
    if (!profileId || !marketId) return
    isWatchingMarket(profileId, marketId).then(setIsWatching)
  }, [profileId, marketId])

  const toggle = useCallback(async () => {
    if (!profileId || !marketId) return
    setIsLoading(true)
    if (isWatching) {
      await unwatchMarket(profileId, marketId)
      setIsWatching(false)
    } else {
      await watchMarket(profileId, marketId)
      setIsWatching(true)
    }
    setIsLoading(false)
  }, [profileId, marketId, isWatching])

  return { isWatching, isLoading, toggle }
}
