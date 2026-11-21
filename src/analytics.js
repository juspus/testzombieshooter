// Product analytics: fire-and-forget, batched inserts into public.events.
// Never throws, never blocks gameplay. No-op in tests / Playwright / when opted out.
import { getSupabase, peekSupabase } from './supabase'
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
// Current run (set on game_start). run_id lets SQL join game_start/wave_clear/death
// without guessing from timestamps; runStartedAt gives death a duration.
let runId = null
let runStartedAt = 0

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
    // The SDK loads lazily; attach once it's there (events before that go out with user_id null).
    getSupabase().then((supabase) => {
      supabase.auth.getSession()
        ?.then((r) => { userId = r?.data?.session?.user?.id ?? userId })
        ?.catch(() => {})
      supabase.auth.onAuthStateChange((_e, session) => { userId = session?.user?.id ?? null })
    }).catch(() => {})
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
  const send = (supabase) => {
    try {
      const p = supabase.from('events').insert(rows)
      if (p && typeof p.then === 'function') p.then((res) => { if (res?.error) warnOnce(res.error) }, warnOnce)
    } catch (e) { warnOnce(e) }
  }
  const loaded = peekSupabase()
  if (loaded) send(loaded)
  else getSupabase().then(send, warnOnce)
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
          if ((prev.phase === 'start' || prev.phase === 'dead') && s.phase === 'intermission') {
            runId = rid()
            runStartedAt = Date.now()
            track('game_start', { map: s.mapId, mp: s.mpRole ?? 'solo', run_id: runId })
            if (s.runMode === 'daily') track('daily_start', { date: s.dailyDate, ranked: s.dailyRanked, run_id: runId })
          } else if (s.phase === 'wave_clear') {
            track('wave_clear', { wave: s.wave, kills: s.kills, run_id: runId })
          } else if (s.phase === 'dead') {
            const perks = s.perks || {}
            track('death', {
              wave: s.wave, kills: s.kills, money: Math.round(s.money),
              weapon: s.weapon, perks: Object.keys(perks).filter((k) => perks[k]),
              run_id: runId, secs: runStartedAt ? Math.round((Date.now() - runStartedAt) / 1000) : null,
            })
            if (s.runMode === 'daily') {
              track('daily_end', {
                date: s.dailyDate, ranked: s.dailyRanked, wave: s.wave, kills: s.kills,
                run_id: runId, secs: runStartedAt ? Math.round((Date.now() - runStartedAt) / 1000) : null,
              })
            }
          }
        }
        if (s.shopOpen && !prev.shopOpen) track('shop_open', { wave: s.wave })
      } catch (e) { warnOnce(e) }
      prev = s
    })
  } catch (e) { warnOnce(e) }
}

// ── Crash reporting (t-errors) ─────────────────────────────────────────────────────────
// Uncaught errors, rejected promises and WebGL context losses become one 'client_error' event
// (props.kind says which). Goes through track(), so the opt-out and the test / webdriver guard
// already apply. Rate-limited: each distinct error is reported once per session and the whole
// session stops after MAX_ERRORS. No personal data: a clipped message, a few frames of our own
// files (file name and line only, never a URL or query string), browser family, build id.
export const ERROR_EVENT = 'client_error'
export const MAX_ERRORS = 8          // per session, all kinds together
const MAX_MSG = 160
const MAX_FRAMES = 4
const IGNORED = /ResizeObserver loop|^Script error\.?$/i

/** Strip URLs down to their file name (no origin, path, query or hash) and clip the length. */
export function sanitizeMessage(raw) {
  let m = typeof raw === 'string' ? raw : String(raw?.message ?? raw ?? '')
  m = m.replace(/\bhttps?:\/\/[^\s)'"]+/gi, (u) => {
    const file = u.split(/[?#]/)[0].split('/').filter(Boolean).pop() || 'url'
    return file.includes('.') ? file : 'url'
  })
  m = m.replace(/[?#]\S*/g, '')            // any stray query / hash
  m = m.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'email')
  m = m.replace(/\b(peer|room|id)\s+[\w-]{4,}/gi, '$1 <id>')   // PeerJS errors name the room code
  return m.replace(/\s+/g, ' ').trim().slice(0, MAX_MSG)
}

/**
 * Keep at most MAX_FRAMES frames that point into our own bundle, as "fn file:line:col".
 * Frames from other origins (extensions, third-party scripts) and node_modules are dropped.
 */
export function trimStack(stack, origin = '') {
  if (typeof stack !== 'string') return []
  const out = []
  for (const line of stack.split('\n')) {
    const m = line.match(/(?:at\s+(?:(.*?)\s+\()?|^(.*?)@)?((?:https?:\/\/|\/)[^\s)]+?):(\d+):(\d+)\)?\s*$/)
    if (!m) continue
    const url = m[3]
    if (/node_modules|extension:\/\//.test(url)) continue
    if (/^https?:\/\//.test(url) && origin && !url.startsWith(origin)) continue
    const file = url.split(/[?#]/)[0].split('/').filter(Boolean).pop() || 'file'
    const fn = (m[1] || m[2] || '').replace(/^.*[/\\]/, '').slice(0, 40)
    out.push(`${fn ? fn + ' ' : ''}${file}:${m[4]}:${m[5]}`)
    if (out.length >= MAX_FRAMES) break
  }
  return out
}

/** "Chrome on Android": family names only, no versions. */
export function browserFamily(ua = '') {
  const browser =
    /EdgA?\/|Edg\//.test(ua) ? 'Edge' :
    /OPR\/|Opera/.test(ua) ? 'Opera' :
    /SamsungBrowser/.test(ua) ? 'Samsung' :
    /FxiOS|Firefox/.test(ua) ? 'Firefox' :
    /CriOS|Chrome/.test(ua) ? 'Chrome' :
    /Safari/.test(ua) ? 'Safari' : 'Other'
  const os =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Linux|CrOS/.test(ua) ? 'Linux' : 'Other'
  return `${browser} on ${os}`
}

/** Build id: the commit when the host exposes it, else the entry bundle's hashed file name. */
export function buildId() {
  try {
    const sha = import.meta.env?.VITE_VERCEL_GIT_COMMIT_SHA
    if (sha) return String(sha).slice(0, 7)
    const entry = [...document.scripts].map((s) => s.src).find((u) => /\/assets\/index-/.test(u))
    if (entry) return (entry.split('/').pop() || '').replace(/^index-|\.js.*$/g, '').slice(0, 12) || 'unknown'
  } catch { /* ignore */ }
  return 'dev'
}

let errorsSent = 0
const errorSeen = new Set()

/**
 * Report one problem. Returns true when an event was queued (false: ignored, duplicate or over cap).
 * Opt-out and the test / webdriver guard are enforced here and again by track().
 */
export function reportClientError(kind, message, stack, extra) {
  try {
    if (errorsSent >= MAX_ERRORS) return false
    const msg = sanitizeMessage(message)
    if (!msg || IGNORED.test(msg)) return false
    const origin = typeof location !== 'undefined' ? location.origin : ''
    const frames = trimStack(stack, origin)
    const key = `${kind}|${msg}|${frames[0] ?? ''}`
    if (errorSeen.has(key)) return false
    if (!isEnabled() || optedOut()) return false   // do not spend the budget while nothing can be sent
    errorSeen.add(key)
    errorsSent++
    track(ERROR_EVENT, {
      kind, msg, frames,
      browser: browserFamily(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      build: buildId(),
      ...extra,
    })
    flush()   // a crashing page may not live to the 5 s batch
    return true
  } catch { return false }
}

let errorsHooked = false
/** Install the window listeners once (main.jsx, before the app mounts). */
export function initErrorReporting() {
  if (errorsHooked || typeof window === 'undefined') return
  errorsHooked = true
  const origin = window.location.origin
  window.addEventListener('error', (e) => {
    // A resource that failed to load (img / script) has no message; a foreign script is not ours.
    if (!e.message && !e.error) return
    if (e.filename && !e.filename.startsWith(origin)) return
    reportClientError('error', e.error?.message ?? e.message, e.error?.stack ?? (e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : ''))
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    reportClientError('rejection', r?.message ?? (typeof r === 'string' ? r : 'rejection'), r?.stack)
  })
  // webglcontextlost does not bubble: listen in the capture phase on window to see every canvas.
  window.addEventListener('webglcontextlost', () => reportClientError('webgl_lost', 'webglcontextlost'), true)
}

// Test hooks
export function __setEnabledForTests(v) {
  enabledOverride = v
  errorsSent = 0
  errorSeen.clear()
  queue = []
  if (timer) { clearTimeout(timer); timer = null }
  userId = null
  warned = false
}
