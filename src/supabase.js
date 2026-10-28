import { getAnonId, weekStartUTC } from './daily'

// @supabase/supabase-js is loaded lazily (own chunk). Every helper below awaits getSupabase().
let _client = null
let _loading = null

/** Resolves the shared client, importing the SDK chunk on first call. */
export function getSupabase() {
  if (_client) return Promise.resolve(_client)
  if (!_loading) {
    _loading = import('./supabaseClient').then((m) => (_client = m.supabase), (e) => { _loading = null; throw e })
  }
  return _loading
}

/** The client if already loaded, else null (never triggers the import). */
export function peekSupabase() { return _client }

/** Start loading when the browser is idle, after first paint. Safe to call repeatedly. */
export function preloadSupabase() {
  const go = () => { getSupabase().catch(() => {}) }
  try {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 })
    else setTimeout(go, 1200)
  } catch { /* ignore */ }
}

export async function signInWithGoogle() {
  const supabase = await getSupabase()
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
}

export async function signOut() {
  return (await getSupabase()).auth.signOut()
}

/** Returns an unsubscribe function synchronously; the subscription attaches once the SDK loads. */
export function onAuthStateChange(callback) {
  let sub = null
  let cancelled = false
  getSupabase().then((supabase) => {
    if (cancelled) return
    sub = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null)
    }).data.subscription
  }).catch(() => {})
  return () => { cancelled = true; try { sub?.unsubscribe() } catch { /* ignore */ } }
}

export async function getUser() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getProfile() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  return data ?? null
}

export async function setUsername(username) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, username: username.trim().slice(0, 24) })
  if (error) throw error
}


/**
 * Submit a score. Normal runs keep the original insert shape (works with or without the
 * daily migration). Daily ranked runs add mode/seed_date/anon_id; if the migration isn't
 * applied (missing column) we throw 'daily_unavailable' rather than pollute the all-time board.
 * Throws Error('daily_already_ranked') when the unique index says today's attempt was used.
 */
export async function submitScore({ name, wave, kills, mode = 'normal', seedDate = null }) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const row = { name: name.trim().slice(0, 24), wave, kills, user_id: user?.id ?? null }
  if (mode === 'daily') {
    row.mode = 'daily'
    row.seed_date = seedDate
    if (!user) row.anon_id = getAnonId()
  }
  const { error } = await supabase.from('scores').insert(row)
  if (error) {
    if (mode === 'daily') {
      if (error.code === '23505') throw new Error('daily_already_ranked')
      if (isMissingSchema(error)) throw new Error('daily_unavailable')
    }
    throw error
  }
}

/** True when an error means "table/view/column not there" (migration not applied yet). */
export function isMissingSchema(err) {
  if (!err) return false
  const code = String(err.code ?? '')
  return ['PGRST204', 'PGRST205', '42P01', '42703'].includes(code) || err.status === 404 ||
    /could not find the .* (column|table)|does not exist|schema cache/i.test(err.message ?? '')
}

const LB_COLS = 'id, name, wave, kills, created_at, is_supporter'
const lbOrder = (q) => q.order('wave', { ascending: false }).order('kills', { ascending: false })

/**
 * period: 'all' | 'week' | 'daily'. Rejects with Error('unavailable') when the view for
 * 'daily' doesn't exist yet; 'week' falls back to filtering the all-time view by date.
 */
export async function fetchLeaderboard({ limit = 20, period = 'all' } = {}) {
  const supabase = await getSupabase()
  const view = period === 'week' ? 'leaderboard_week' : period === 'daily' ? 'leaderboard_daily' : 'leaderboard'
  let { data, error } = await lbOrder(supabase.from(view).select(LB_COLS)).limit(limit)
  if (error && period === 'week' && isMissingSchema(error)) {
    ;({ data, error } = await lbOrder(
      supabase.from('leaderboard').select(LB_COLS).gte('created_at', new Date(weekStartUTC()).toISOString()),
    ).limit(limit))
  }
  if (error) {
    if (isMissingSchema(error)) throw new Error('unavailable')
    throw error
  }
  return data
}

/**
 * Has this player already used today's ranked daily on the server? Resolves false when the
 * migration is missing or the request fails (the local record is the fallback).
 */
export async function fetchDailyAttemptUsed(seedDate) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    const anon = getAnonId()
    let q = supabase.from('scores').select('id').eq('mode', 'daily').eq('seed_date', seedDate).limit(1)
    if (user) q = q.eq('user_id', user.id)
    else if (anon) q = q.eq('anon_id', anon)
    else return false
    const { data, error } = await q
    return !error && Array.isArray(data) && data.length > 0
  } catch { return false }
}

// ── Supporter Pack / cosmetics ──────────────────────────────────────────────

/** sku list the signed-in user owns (RLS: owner can SELECT). [] when logged out. */
export async function fetchEntitlements() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('entitlements').select('sku').eq('user_id', user.id)
  if (error) throw error
  return (data ?? []).map((r) => r.sku)
}

/** { stats, cosmetics } from the signed-in user's profile row, or null. */
export async function loadProfileExtras() {
  const supabase = await getSupabase()
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
  const supabase = await getSupabase()
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
  const supabase = await getSupabase()
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
