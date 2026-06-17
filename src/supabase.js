import { createClient } from '@supabase/supabase-js'

// Anon key is intentionally public — safe for client-side use
export const supabase = createClient(
  'https://clhonzagmvgpsaawjwsf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsaG9uemFnbXZncHNhYXdqd3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTk3OTQsImV4cCI6MjA5NzI5NTc5NH0.ALWlS-ih1U8JPuOrubo2gK6ZupxzUUayuHDxLwsSpe0',
)

export async function submitScore({ name, wave, kills }) {
  const { error } = await supabase
    .from('scores')
    .insert({ name: name.trim().slice(0, 24), wave, kills })
  if (error) throw error
}
