//kalma/frontend/lib/social/notifications.ts
import { supabase } from '@/lib/supabase'
import type { Notification } from './types'

export async function getNotifications(
  recipientId: string,
  limit = 30,
  before?: string
): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('created_at', before)

  const { data } = await query
  return (data ?? []) as Notification[]
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .is('read_at', null)
  return count ?? 0
}

export async function markAllRead(recipientId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', recipientId)
    .is('read_at', null)
  return !error
}

export async function markRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
  return !error
}
