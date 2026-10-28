import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { preloadSupabase } from './supabase'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Pull the Supabase SDK chunk in when idle, after first paint.
preloadSupabase()
