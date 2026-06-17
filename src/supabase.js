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
    .from('scores')
    .select('id, name, wave, kills, created_at')
    .order('wave', { ascending: false })
    .order('kills', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}
