// kalma/frontend/lib/growth/telegram.ts
//
// Telegram Bot API helper for the LOCAL growth bot (long polling, not a webhook
// — the bot runs on your Mac so it can write into the Obsidian vault, which a
// Vercel function could never reach). No SDK, just fetch.
//
// Env:
//   TELEGRAM_BOT_TOKEN          token of the bot you already have (@BotFather)
//   TELEGRAM_ALLOWED_CHAT_IDS   comma-separated chat ids allowed to drive it

const API = 'https://api.telegram.org';

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function isConfigured(): boolean {
  return botToken() !== null;
}

/** Chat ids permitted to use the bot (you + teammates). Empty → allow none. */
export function isAllowedChat(chatId: number | string): boolean {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS || '';
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(String(chatId));
}

async function call<T = unknown>(
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok: boolean;
      result?: T;
    };
    return json.ok ? (json.result ?? null) : null;
  } catch {
    return null;
  }
}

export interface TgMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  from?: { id: number; language_code?: string };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

/**
 * Long-poll for new updates. `offset` is last_update_id + 1. `timeout` is the
 * long-poll hold in seconds (server-side wait). Returns [] on any error so the
 * caller's loop keeps going.
 */
export async function getUpdates(
  offset: number,
  timeout = 30,
): Promise<TgUpdate[]> {
  const result = await call<TgUpdate[]>(
    'getUpdates',
    { offset, timeout, allowed_updates: ['message'] },
    (timeout + 10) * 1000,
  );
  return result ?? [];
}

export async function sendMessage(
  chatId: number | string,
  text: string,
): Promise<void> {
  await call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}
