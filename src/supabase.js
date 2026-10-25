import { createClient } from '@supabase/supabase-js'

// Anon key is intentionally public — safe for client-side use
export const supabase = createClient(
  'https://clhonzagmvgpsaawjwsf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsaG9uemFnbXZncHNhYXdqd3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTk3OTQsImV4cCI6MjA5NzI5NTc5NH0.ALWlS-ih1U8JPuOrubo2gK6ZupxzUUayuHDxLwsSpe0',
)

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export function signOut() {
  return supabase.auth.signOut()
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.unsubscribe()
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  return data ?? null
}

export async function setUsername(username) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, username: username.trim().slice(0, 24) })
  if (error) throw error
}

export async function submitScore({ name, wave, kills }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('scores')
    .insert({ name: name.trim().slice(0, 24), wave, kills, user_id: user?.id ?? null })
  if (error) throw error
}

export async function fetchLeaderboard({ limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('id, name, wave, kills, created_at, is_supporter')
    .order('wave', { ascending: false })
    .order('kills', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// ── Supporter Pack / cosmetics ──────────────────────────────────────────────

/** sku list the signed-in user owns (RLS: owner can SELECT). [] when logged out. */
export async function fetchEntitlements() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('entitlements').select('sku').eq('user_id', user.id)
  if (error) throw error
  return (data ?? []).map((r) => r.sku)
}

/** { stats, cosmetics } from the signed-in user's profile row, or null. */
export async function loadProfileExtras() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('profiles').select('stats, cosmetics').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * Update stats/cosmetics on the user's EXISTING profile row. Never upsert here:
 * profiles.username is NOT NULL, so an insert without it would fail.
 */
export async function saveProfileExtras({ stats, cosmetics }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('profiles').update({ stats, cosmetics }).eq('id', user.id)
  if (error) throw error
}

const STORE_CONFIG_FALLBACK = { checkoutEnabled: false, priceLabel: '€4.99' }

export async function fetchStoreConfig() {
  try {
    const res = await fetch('/api/store-config')
    if (!res.ok) return STORE_CONFIG_FALLBACK
    const json = await res.json()
    return {
      checkoutEnabled: json?.checkoutEnabled === true,
      priceLabel: typeof json?.priceLabel === 'string' ? json.priceLabel : STORE_CONFIG_FALLBACK.priceLabel,
    }
  } catch {
    return STORE_CONFIG_FALLBACK
  }
}

/** Creates a Stripe Checkout session and redirects. Throws Error(server message) on failure. */
export async function startCheckout() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Please sign in first.')
  let res
  try {
    res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    })
  } catch {
    throw new Error('Network error — please try again.')
  }
  let body = null
  try { body = await res.json() } catch { /* non-JSON error body */ }
  if (!res.ok) throw new Error(body?.error || `Checkout failed (${res.status})`)
  if (!body?.url) throw new Error('Checkout failed — no redirect URL.')
  window.location.href = body.url
}
