import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { inserts, mockClient } = vi.hoisted(() => {
  const inserts = []
  const mockClient = {
    from: () => ({ insert: (rows) => { inserts.push(rows); return Promise.resolve({ error: null }) } }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => {} },
  }
  return { inserts, mockClient }
})
vi.mock('../supabase', () => ({
  getSupabase: () => Promise.resolve(mockClient),
  peekSupabase: () => mockClient,
}))

import {
  reportClientError, sanitizeMessage, trimStack, browserFamily, initErrorReporting,
  __setEnabledForTests, ERROR_EVENT, MAX_ERRORS,
} from '../analytics'

const rows = () => inserts.flat()
const ORIGIN = 'https://cabin.example'

beforeEach(() => {
  vi.useFakeTimers()
  inserts.length = 0
  localStorage.clear()
  __setEnabledForTests(true)
})
afterEach(() => {
  __setEnabledForTests(null)
  vi.useRealTimers()
})

describe('sanitizeMessage', () => {
  it('reduces URLs to a file name and drops query strings and hashes', () => {
    const m = sanitizeMessage('Failed to fetch https://cabin.example/assets/Zombie-ab12.js?token=secret&u=1#frag now')
    expect(m).toBe('Failed to fetch Zombie-ab12.js now')
    expect(m).not.toMatch(/secret|https|\?|#/)
  })
  it('masks e-mail addresses, collapses whitespace, clips length', () => {
    expect(sanitizeMessage('bad user  me@example.com\n here')).toBe('bad user email here')
    expect(sanitizeMessage('x'.repeat(500))).toHaveLength(160)
    expect(sanitizeMessage(undefined)).toBe('')
    expect(sanitizeMessage(new Error('boom'))).toBe('boom')
  })
  it('masks PeerJS peer ids / room codes', () => {
    expect(sanitizeMessage('Could not connect to peer zs-AB12CD')).toBe('Could not connect to peer <id>')
    expect(sanitizeMessage('ID abc123 is taken')).toBe('ID <id> is taken')
  })
})

describe('trimStack', () => {
  const stack = [
    'TypeError: x is undefined',
    `    at hitZombie (${ORIGIN}/assets/index-ab12.js?v=3:10:20)`,
    `    at Object.run (${ORIGIN}/assets/vendor-three-cd34.js:5:6)`,
    `    at ext (chrome-extension://abc/inject.js:1:1)`,
    `    at other (https://evil.example/a.js:1:1)`,
    `    at nm (${ORIGIN}/node_modules/.vite/deps/react.js:1:1)`,
    `    at ${ORIGIN}/assets/Zombie-ef56.js:7:8`,
    `    at a (${ORIGIN}/assets/a.js:1:1)`,
    `    at b (${ORIGIN}/assets/b.js:1:1)`,
    `    at c (${ORIGIN}/assets/c.js:1:1)`,
  ].join('\n')
  it('keeps at most four frames of our own files, as name file:line:col, with no URL', () => {
    const f = trimStack(stack, ORIGIN)
    expect(f).toHaveLength(4)
    expect(f[0]).toBe('hitZombie index-ab12.js:10:20')
    expect(f.join('\n')).not.toMatch(/https?:|\?|evil|extension|node_modules/)
  })
  it('understands Firefox / Safari style frames and bad input', () => {
    expect(trimStack(`hit@${ORIGIN}/assets/index-1.js:3:4`, ORIGIN)).toEqual(['hit index-1.js:3:4'])
    expect(trimStack(undefined)).toEqual([])
    expect(trimStack('no frames here')).toEqual([])
  })
})

describe('browserFamily', () => {
  it('returns family names only', () => {
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS')
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0')).toBe('Firefox on Windows')
    expect(browserFamily('')).toBe('Other on Other')
  })
})

describe('reportClientError', () => {
  it('sends one client_error event with kind, message, frames, browser and build', () => {
    expect(reportClientError('error', 'boom at https://x.example/a.js?q=1', `at f (${location.origin}/assets/a.js:1:2)`)).toBe(true)
    const r = rows()
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe(ERROR_EVENT)
    expect(r[0].props).toMatchObject({ kind: 'error', msg: 'boom at a.js' })
    expect(r[0].props.frames).toEqual(['f a.js:1:2'])
    expect(typeof r[0].props.browser).toBe('string')
    expect(typeof r[0].props.build).toBe('string')
    expect(JSON.stringify(r[0].props)).not.toMatch(/\?q=1|https?:/)
    expect(JSON.stringify(r[0].props).length).toBeLessThan(1500)   // the events policy caps props at 2 KB
  })

  it('reports the same error once per session (dedupe by message and top frame)', () => {
    expect(reportClientError('error', 'same', 'at f (/assets/a.js:1:2)')).toBe(true)
    expect(reportClientError('error', 'same', 'at f (/assets/a.js:1:2)')).toBe(false)
    expect(reportClientError('error', 'same', 'at g (/assets/b.js:9:9)')).toBe(true)   // another place
    expect(reportClientError('rejection', 'same')).toBe(true)                          // another kind
    expect(rows()).toHaveLength(3)
  })

  it('caps the session at MAX_ERRORS events', () => {
    for (let i = 0; i < MAX_ERRORS + 10; i++) reportClientError('error', `distinct ${i}`)
    expect(rows()).toHaveLength(MAX_ERRORS)
  })

  it('ignores noise (ResizeObserver, opaque cross-origin "Script error.", empty messages)', () => {
    expect(reportClientError('error', 'ResizeObserver loop completed with undelivered notifications.')).toBe(false)
    expect(reportClientError('error', 'Script error.')).toBe(false)
    expect(reportClientError('error', '')).toBe(false)
    expect(rows()).toHaveLength(0)
  })

  it('respects the analytics opt-out and does not spend the budget while opted out', () => {
    localStorage.setItem('cabin.analytics.optout', '1')
    expect(reportClientError('error', 'while opted out')).toBe(false)
    vi.advanceTimersByTime(6000)
    expect(rows()).toHaveLength(0)
    localStorage.removeItem('cabin.analytics.optout')
    expect(reportClientError('error', 'while opted out')).toBe(true)   // still reportable once back in
  })

  it('is a no-op when analytics are disabled (tests / webdriver)', () => {
    __setEnabledForTests(false)
    expect(reportClientError('error', 'x')).toBe(false)
    vi.advanceTimersByTime(6000)
    expect(rows()).toHaveLength(0)
  })

  it('flushes right away: a crashing page may not live to the 5 s batch', () => {
    reportClientError('error', 'now')
    expect(inserts).toHaveLength(1)
  })
})

describe('initErrorReporting: window listeners', () => {
  it('turns window error, unhandledrejection and a captured webglcontextlost into events', () => {
    initErrorReporting()
    initErrorReporting()   // idempotent
    const err = new Error('listener boom')
    window.dispatchEvent(new ErrorEvent('error', { message: 'listener boom', error: err }))
    const rej = new Event('unhandledrejection'); rej.reason = new Error('promise boom')
    window.dispatchEvent(rej)
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    canvas.dispatchEvent(new Event('webglcontextlost'))   // does not bubble: only the capture listener sees it
    const kinds = rows().map((r) => r.props.kind)
    expect(kinds).toEqual(['error', 'rejection', 'webgl_lost'])
    canvas.remove()
  })

  it('skips errors from foreign scripts and failed resource loads', () => {
    initErrorReporting()
    window.dispatchEvent(new ErrorEvent('error', { message: 'ext boom', filename: 'chrome-extension://abc/x.js' }))
    window.dispatchEvent(new Event('error'))   // <img onerror> style: no message, no error
    expect(rows()).toHaveLength(0)
  })
})
