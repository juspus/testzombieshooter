import { describe, it, expect } from 'vitest'
import {
  encodeDuel, decodeDuel, validateDuel, buildDuelLink, parseDuelParam, stripDuelParam, compareDuel, ghostAt,
} from '../duel'

const run = { seed: 'abc23xyz', map: 'cabin', name: 'Zed', waves: [5, 13, 24], final: { wave: 4, kills: 31 } }

describe('duel token', () => {
  it('round-trips', () => {
    const t = encodeDuel(run)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeDuel(t)).toEqual({ v: 1, ...run })
  })
  it('keeps unicode names', () => {
    expect(decodeDuel(encodeDuel({ ...run, name: 'Zoë 殭屍' })).name).toBe('Zoë 殭屍')
  })
  it('truncates long names on encode and defaults empty ones', () => {
    expect(decodeDuel(encodeDuel({ ...run, name: 'x'.repeat(40) })).name).toHaveLength(16)
    expect(decodeDuel(encodeDuel({ ...run, name: '  ' })).name).toBe('Player')
  })
  it('rejects bad tokens', () => {
    expect(decodeDuel('')).toBe(null)
    expect(decodeDuel(null)).toBe(null)
    expect(decodeDuel('!!!')).toBe(null)
    expect(decodeDuel('e30')).toBe(null)   // {}
    expect(decodeDuel('x'.repeat(3000))).toBe(null)
  })
  it('rejects invalid payloads', () => {
    const ok = { v: 1, ...run }
    expect(validateDuel(ok)).not.toBe(null)
    expect(validateDuel({ ...ok, v: 2 })).toBe(null)
    expect(validateDuel({ ...ok, map: 'moon' })).toBe(null)
    expect(validateDuel({ ...ok, seed: 'a b' })).toBe(null)
    expect(validateDuel({ ...ok, name: 'x'.repeat(17) })).toBe(null)
    expect(validateDuel({ ...ok, waves: new Array(61).fill(1) })).toBe(null)
    expect(validateDuel({ ...ok, waves: [1, 'a'] })).toBe(null)
    expect(validateDuel({ ...ok, final: { wave: 0, kills: 1 } })).toBe(null)
    expect(validateDuel({ ...ok, final: { wave: 2, kills: -1 } })).toBe(null)
    expect(validateDuel({ ...ok, final: null })).toBe(null)
  })
  it('encode returns null for an invalid run', () => {
    expect(encodeDuel({ ...run, map: 'nope' })).toBe(null)
  })
})

describe('duel link', () => {
  it('builds, parses and strips', () => {
    const t = encodeDuel(run)
    expect(buildDuelLink('https://x.test', t)).toBe(`https://x.test/?duel=${t}`)
    expect(parseDuelParam(`?a=1&duel=${t}`)).toEqual({ token: t })
    expect(parseDuelParam('?a=1')).toBe(null)
    expect(stripDuelParam(`https://x.test/p?duel=${t}&map=diner#h`)).toBe('/p?map=diner#h')
  })
})

describe('compareDuel / ghostAt', () => {
  it('higher wave wins, then kills', () => {
    expect(compareDuel({ wave: 5, kills: 1 }, { wave: 4, kills: 99 })).toBe('win')
    expect(compareDuel({ wave: 3, kills: 99 }, { wave: 4, kills: 1 })).toBe('lose')
    expect(compareDuel({ wave: 4, kills: 10 }, { wave: 4, kills: 9 })).toBe('win')
    expect(compareDuel({ wave: 4, kills: 8 }, { wave: 4, kills: 9 })).toBe('lose')
    expect(compareDuel({ wave: 4, kills: 9 }, { wave: 4, kills: 9 })).toBe('draw')
  })
  it('accepts token payloads', () => {
    expect(compareDuel(decodeDuel(encodeDuel(run)), { wave: 4, kills: 31 })).toBe('draw')
  })
  it('ghostAt reads the cumulative log, then the final, then null', () => {
    const r = decodeDuel(encodeDuel(run))
    expect(ghostAt(r, 1)).toBe(5)
    expect(ghostAt(r, 3)).toBe(24)
    expect(ghostAt(r, 4)).toBe(31)
    expect(ghostAt(r, 5)).toBe(null)
    expect(ghostAt(r, 0)).toBe(null)
    expect(ghostAt(null, 1)).toBe(null)
  })
})
