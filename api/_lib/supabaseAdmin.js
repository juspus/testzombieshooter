import { createClient } from '@supabase/supabase-js'

export const DEFAULT_SUPABASE_URL = 'https://clhonzagmvgpsaawjwsf.supabase.co'

// Service-role client: bypasses RLS. Server only. Returns null if the key is missing.
export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createClient(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
