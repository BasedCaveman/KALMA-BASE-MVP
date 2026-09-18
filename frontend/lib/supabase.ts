//kalma/frontend/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnon) {
  // Fail loud during development — silent failures are harder to debug
  if (typeof window !== 'undefined') {
    console.error('[Kalma] Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: { persistSession: false },  // Kalma uses Privy auth, not Supabase auth
})
