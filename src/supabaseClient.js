// The only static importer of @supabase/supabase-js. Loaded on demand via getSupabase()
// in supabase.js so the SDK stays out of the first-load bundle.
import { createClient } from '@supabase/supabase-js'

// Anon key is intentionally public — safe for client-side use
export const supabase = createClient(
  'https://clhonzagmvgpsaawjwsf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsaG9uemFnbXZncHNhYXdqd3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTk3OTQsImV4cCI6MjA5NzI5NTc5NH0.ALWlS-ih1U8JPuOrubo2gK6ZupxzUUayuHDxLwsSpe0',
)
