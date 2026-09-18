//kalma/frontend/hooks/useNotifications.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import { authFetch } from '@/lib/social/auth-fetch'
import type { Notification } from '@/lib/social/types'

export function useNotifications(address: string | null | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [isLoading, setIsLoading]         = useState(true)

  const load = useCallback(async () => {
    if (!address) {
      setNotifications([])
      setUnreadCount(0)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const response = await authFetch(`/api/notifications?address=${encodeURIComponent(address)}`, {
      headers: { accept: 'application/json' },
    }).catch(() => null)
    const payload = await response?.json().catch(() => null)
    setNotifications(response?.ok && Array.isArray(payload?.notifications) ? payload.notifications : [])
    setUnreadCount(response?.ok ? payload?.unreadCount ?? 0 : 0)
    setIsLoading(false)
  }, [address])

  useEffect(() => {
    load()
  }, [load])

  const readAll = useCallback(async () => {
    if (!address) return
    await authFetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, action: 'mark_all_read' }),
    }).catch(() => null)
    setUnreadCount(0)
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    )
  }, [address])

  const readOne = useCallback(async (id: string) => {
    if (!address) return
    await authFetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, id, action: 'mark_read' }),
    }).catch(() => null)
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [address])

  return {
    notifications,
    unreadCount,
    isLoading,
    refresh: load,
    markAllRead: readAll,
    markOneRead: readOne,
  }
}

/** Lightweight badge-only hook — cheap poll for bell icon. */
export function useUnreadCount(address: string | null | undefined, pollMs = 60_000) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!address) return

    let cancelled = false

    async function fetch() {
      const response = await authFetch(`/api/notifications?address=${encodeURIComponent(address!)}`, {
        headers: { accept: 'application/json' },
      }).catch(() => null)
      const payload = await response?.json().catch(() => null)
      if (!cancelled) setCount(response?.ok ? payload?.unreadCount ?? 0 : 0)
    }

    fetch()
    const id = setInterval(fetch, pollMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [address, pollMs])

  return count
}
