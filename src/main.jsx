import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { preloadSupabase } from './supabase'
import { installDesktopFeel } from './desktopInput'
import { installVirtualCursor } from './virtualCursor'
import { useGameStore } from './store'

installDesktopFeel()
installVirtualCursor()
installUpdateReload()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Pull the Supabase SDK chunk in when idle, after first paint.
preloadSupabase()

// A new deploy: the service worker precaches the whole app, so this page loaded the OLD build while
// the new worker installed and took over (skipWaiting + clientsClaim). Without this, every deploy
// needs two reloads. Reload once onto the new build, but only on the start menu, never mid-run.
function installUpdateReload() {
  const sw = navigator.serviceWorker
  if (!sw || !sw.controller) return   // first visit: this page already came from the network
  let done = false
  sw.addEventListener('controllerchange', () => {
    if (done) return
    const reload = () => { if (!done) { done = true; window.location.reload() } }
    if (useGameStore.getState().phase === 'start') { reload(); return }
    const stop = useGameStore.subscribe((st) => { if (st.phase === 'start') { stop(); reload() } })
  })
  // Browsers check for a new worker lazily (seen: none within 15 s of a reload). Ask right away.
  window.addEventListener('load', () => { sw.getRegistration().then((r) => r?.update()).catch(() => {}) })
}
