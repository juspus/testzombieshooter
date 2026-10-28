import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import handler, { buildIceServers } from '../turn.js'
import { mockReq, mockRes } from './helpers.js'

const KEYS = ['TURN_URLS', 'TURN_USERNAME', 'TURN_CREDENTIAL']
let saved
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]) })
afterEach(() => { KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))) })

describe('GET /api/turn', () => {
  it('returns empty iceServers with no env', () => {
    const res = mockRes()
    handler(mockReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ iceServers: [] })
  })
  it('builds a static server from env, dropping non-turn urls', () => {
    process.env.TURN_URLS = 'turn:a.example:3478, turns:a.example:443?transport=tcp, http://bad'
    process.env.TURN_USERNAME = 'u'
    process.env.TURN_CREDENTIAL = 'c'
    const res = mockRes()
    handler(mockReq(), res)
    expect(res.body.iceServers).toEqual([{ urls: ['turn:a.example:3478', 'turns:a.example:443?transport=tcp'], username: 'u', credential: 'c' }])
    expect(res.headers['cache-control']).toMatch(/max-age/)
  })
  it('needs username and credential', () => {
    expect(buildIceServers({ TURN_URLS: 'turn:a:3478', TURN_USERNAME: 'u' })).toEqual([])
  })
  it('rejects non-GET', () => {
    const res = mockRes()
    handler(mockReq({ method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
  })
})
