import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('../profilePersistence', () => ({ persistProfile: vi.fn() }))

import * as storeModule from '../store'

// Guards the store split (docs/next-roadmap.html t-store-slices): the export list of store.js, the
// full key list of useGameStore.getState() (state keys and action names) and the initial value of
// every plain-data key must not move when code is shuffled between src/store/* slices.
// The fixture was captured from the single-file store before the split. Regenerate on purpose only:
//   UPDATE_STORE_SHAPE=1 npx vitest run src/__tests__/store.shape.test.js
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'store.shape.json')

// JSON cannot hold Infinity / NaN / undefined / Set / Map: tag them so they compare exactly.
function plain(v) {
  if (typeof v === 'function') return '[fn]'
  if (v === undefined) return '[undefined]'
  if (typeof v === 'number' && !Number.isFinite(v)) return `[${v}]`
  if (v instanceof Set) return { '[Set]': [...v].map(plain) }
  if (v instanceof Map) return { '[Map]': [...v].map(([k, x]) => [plain(k), plain(x)]) }
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v).sort()) o[k] = plain(v[k])
    return o
  }
  return v
}

function capture() {
  const state = storeModule.useGameStore.getState()
  const exports = {}
  for (const k of Object.keys(storeModule).sort()) {
    const v = storeModule[k]
    exports[k] = typeof v === 'function' ? 'function' : typeof v
  }
  const keys = Object.keys(state).sort()
  const actions = keys.filter((k) => typeof state[k] === 'function')
  const initial = {}
  for (const k of keys) if (typeof state[k] !== 'function') initial[k] = plain(state[k])
  // The first Mystery Box's bear use is rolled with Math.random outside a seeded run.
  if (initial.box) initial.box.maxUses = '[random]'
  return { exports, actions, stateKeys: keys.filter((k) => typeof state[k] !== 'function'), initial }
}

describe('store shape (survives the slice split)', () => {
  const now = capture()
  if (process.env.UPDATE_STORE_SHAPE) fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n')
  const was = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))

  it('exports the same names with the same kinds from store.js', () => {
    expect(now.exports).toEqual(was.exports)
  })
  it('has the same action names', () => {
    expect(now.actions).toEqual(was.actions)
  })
  it('has the same state keys', () => {
    expect(now.stateKeys).toEqual(was.stateKeys)
  })
  it('starts with the same initial values', () => {
    expect(JSON.parse(JSON.stringify(now.initial))).toEqual(was.initial)
  })
  it('keeps state keys and actions disjoint', () => {
    expect(now.actions.filter((a) => now.stateKeys.includes(a))).toEqual([])
  })
})
