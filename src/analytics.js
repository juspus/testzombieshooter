// Product analytics: fire-and-forget, batched inserts into public.events.
// Never throws, never blocks gameplay. No-op in tests / Playwright / when opted out.
import { supabase } from './supabase'
import { useGameStore } from './store'

const ANON_KEY = 'cabin.anon.v1'
const OPTOUT_KEY = 'cabin.analytics.optout'
const FLUSH_SIZE = 10
const FLUSH_MS = 5000
const MAX_NAME = 64
const MAX_PROPS_BYTES = 2048

let enabledOverride = null
let queue = []
let timer = null
let warned = false
let userId = null
let authHooked = false
let inited = false
let sessionId = null
let anonId = null

function warnOnce(err) {
  if (warned) return
  warned = true
  try { console.warn('[analytics] disabled after error:', err?.message ?? err) } catch { /* ignore */ }
}

function rid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch { /* ignore */ }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function isEnabled() {
  if (enabledOverride !== null) return enabledOverride
  try {
    if (import.meta.env?.MODE === 'test') return false
    if (typeof navigator !== 'undefined' && navigator.webdriver) return false
  } catch { /* ignore */ }
  return true
}

function optedOut() {
  try { return localStorage.getItem(OPTOUT_KEY) === '1' } catch { return false }
}

function isMobile() {
  try {
    return /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  } catch { return false }
}

function getAnonId() {
  if (anonId) return anonId
  try {
    let v = localStorage.getItem(ANON_KEY)
    if (!v) {
      v = rid()
      localStorage.setItem(ANON_KEY, v)
    }
    anonId = v
  } catch {
    anonId = rid()
  }
  return anonId
}

function hookAuth() {
  if (authHooked) return
  authHooked = true
  try {
    supabase.auth.getSession()
      ?.then((r) => { userId = r?.data?.session?.user?.id ?? userId })
      ?.catch(() => {})
    supabase.auth.onAuthStateChange((_e, session) => { userId = session?.user?.id ?? null })
  } catch (e) { warnOnce(e) }
}

function clampProps(props) {
  try {
    const s = JSON.stringify(props ?? {})
    if (s === undefined || s.length > MAX_PROPS_BYTES) return {}
    return JSON.parse(s)
  } catch { return {} }
}

export function flush() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!queue.length) return
  const rows = queue
  queue = []
  try {
    const p = supabase.from('events').insert(rows)
    if (p && typeof p.then === 'function') p.then((res) => { if (res?.error) warnOnce(res.error) }, warnOnce)
  } catch (e) { warnOnce(e) }
}

export function track(name, props = {}) {
  try {
    if (!isEnabled() || optedOut()) return
    if (typeof name !== 'string' || !name) return
    if (!sessionId) sessionId = rid()
    hookAuth()
    queue.push({
      name: name.slice(0, MAX_NAME),
      props: clampProps(props),
      user_id: userId,
      anon_id: getAnonId(),
      session_id: sessionId,
      client: isMobile() ? 'mobile' : 'desktop',
    })
    if (queue.length >= FLUSH_SIZE) flush()
    else if (!timer) timer = setTimeout(flush, FLUSH_MS)
  } catch (e) { warnOnce(e) }
}

export function initAnalytics() {
  if (inited) return
  try {
    if (!isEnabled() || optedOut() || typeof window === 'undefined') return
    if (typeof useGameStore?.subscribe !== 'function') return
    inited = true

    track('session_start', { mobile: isMobile(), ua: navigator.userAgent.slice(0, 120) })

    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)

    let prev = useGameStore.getState()
    useGameStore.subscribe((s) => {
      try {
        if (s.phase !== prev.phase) {
          if (prev.phase === 'start' && s.phase === 'intermission') {
            track('game_start', { map: s.mapId, mp: s.mpRole ?? 'solo' })
          } else if (s.phase === 'wave_clear') {
            track('wave_clear', { wave: s.wave, kills: s.kills })
          } else if (s.phase === 'dead') {
            const perks = s.perks || {}
            track('death', {
              wave: s.wave, kills: s.kills, money: Math.round(s.money),
              weapon: s.weapon, perks: Object.keys(perks).filter((k) => perks[k]),
            })
          }
        }
        if (s.shopOpen && !prev.shopOpen) track('shop_open', { wave: s.wave })
      } catch (e) { warnOnce(e) }
      prev = s
    })
  } catch (e) { warnOnce(e) }
}

// Test hooks
export function __setEnabledForTests(v) {
  enabledOverride = v
  queue = []
  if (timer) { clearTimeout(timer); timer = null }
  userId = null
  warned = false
}
