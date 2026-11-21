import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { preloadSupabase } from './supabase'
import { initErrorReporting } from './analytics'

// Crash reports (opt-out and rate limits live in analytics.js); first, so errors while mounting count too.
initErrorReporting()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Pull the Supabase SDK chunk in when idle, after first paint.
preloadSupabase()
