//kalma/frontend/hooks/useSignals.ts
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getFeedSignals,
  getMarketSignals,
  getPlaceSignals,
  getAuthorSignals,
  createSignal,
  deleteSignal,
  reportSignal,
} from '@/lib/social/signals'
import type { SignalPost } from '@/lib/social/types'

// ── Signal feed (followed users + followed places) ─────────────────────────────

export function useFeedSignals(params: {
  followingIds: string[]
  followedPlaceIds: string[]
  enabled?: boolean
}) {
  const [signals, setSignals]     = useState<SignalPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore]     = useState(true)
  const cursorRef = useRef<string | undefined>(undefined)

  const { followingIds, followedPlaceIds, enabled = true } = params

  const load = useCallback(async (reset = false) => {
    if (!enabled) return
    if (followingIds.length === 0 && followedPlaceIds.length === 0) {
      setSignals([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    if (reset) cursorRef.current = undefined

    const batch = await getFeedSignals({
      followingIds,
      followedPlaceIds,
      limit: 20,
      before: cursorRef.current,
    })

    if (reset) {
      setSignals(batch)
    } else {
      setSignals((prev) => [...prev, ...batch])
    }

    if (batch.length > 0) {
      cursorRef.current = batch[batch.length - 1].created_at
    }
    setHasMore(batch.length === 20)
    setIsLoading(false)
  }, [enabled, followingIds.join(','), followedPlaceIds.join(',')])

  useEffect(() => {
    load(true)
  }, [load])

  const loadMore = useCallback(() => load(false), [load])
  const refresh  = useCallback(() => load(true),  [load])

  return { signals, isLoading, hasMore, loadMore, refresh }
}

// ── Market signals (commentary on market detail page) ────────────────────────

export function useMarketSignals(marketId: number | null) {
  const [signals, setSignals]     = useState<SignalPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const cursorRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!marketId) { setIsLoading(false); return }
    let cancelled = false
    cursorRef.current = undefined
    setIsLoading(true)

    getMarketSignals(marketId, 20).then((batch) => {
      if (cancelled) return
      setSignals(batch)
      if (batch.length > 0) cursorRef.current = batch[batch.length - 1].created_at
      setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [marketId])

  const refresh = useCallback(() => {
    if (!marketId) return
    cursorRef.current = undefined
    getMarketSignals(marketId, 20).then((batch) => {
      setSignals(batch)
      if (batch.length > 0) cursorRef.current = batch[batch.length - 1].created_at
    })
  }, [marketId])

  return { signals, isLoading, refresh }
}

// ── Place signals ─────────────────────────────────────────────────────────────

export function usePlaceSignals(placeId: string | null) {
  const [signals, setSignals]     = useState<SignalPost[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!placeId) { setIsLoading(false); return }
    let cancelled = false
    getPlaceSignals(placeId, 20).then((batch) => {
      if (!cancelled) { setSignals(batch); setIsLoading(false) }
    })
    return () => { cancelled = true }
  }, [placeId])

  return { signals, isLoading }
}

// ── Author signals (for profile page) ────────────────────────────────────────

export function useAuthorSignals(authorId: string | null) {
  const [signals, setSignals]     = useState<SignalPost[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!authorId) { setIsLoading(false); return }
    let cancelled = false
    getAuthorSignals(authorId, 20).then((batch) => {
      if (!cancelled) { setSignals(batch); setIsLoading(false) }
    })
    return () => { cancelled = true }
  }, [authorId])

  return { signals, isLoading }
}

// ── Signal composer ───────────────────────────────────────────────────────────

export function useSignalComposer(authorId: string | null) {
  const [isSending, setIsSending] = useState(false)

  const post = useCallback(async (params: {
    text: string
    marketId?: number | null
    placeId?: string | null
  }): Promise<{ signal: SignalPost | null; error: string | null }> => {
    if (!authorId) return { signal: null, error: 'Not connected' }
    setIsSending(true)
    const result = await createSignal({ authorId, ...params })
    setIsSending(false)
    return result
  }, [authorId])

  const remove = useCallback(async (signalId: string): Promise<boolean> => {
    if (!authorId) return false
    return deleteSignal(signalId, authorId)
  }, [authorId])

  const report = useCallback(async (signalId: string, reason: string): Promise<boolean> => {
    if (!authorId) return false
    return reportSignal({ reporterId: authorId, signalId, reason })
  }, [authorId])

  return { post, remove, report, isSending }
}
