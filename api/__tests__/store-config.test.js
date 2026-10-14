import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import handler from '../store-config.js'
import { mockReq, mockRes } from './helpers.js'

const KEYS = ['STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPPORTER_PRICE_CENTS']
let saved
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); KEYS.forEach((k) => delete process.env[k]) })
afterEach(() => { KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))) })

describe('GET /api/store-config', () => {
  it('is disabled without keys', () => {
    const res = mockRes()
    handler(mockReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ checkoutEnabled: false, priceLabel: '€4.99', sku: 'supporter_pack' })
    expect(res.headers['cache-control']).toBe('public, max-age=60')
  })

  it('is disabled with only one key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    const res = mockRes()
    handler(mockReq(), res)
    expect(res.body.checkoutEnabled).toBe(false)
  })

  it('is enabled with both keys and honours price override', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    process.env.SUPPORTER_PRICE_CENTS = '700'
    const res = mockRes()
    handler(mockReq(), res)
    expect(res.body).toEqual({ checkoutEnabled: true, priceLabel: '€7.00', sku: 'supporter_pack' })
  })

  it('falls back to default price on garbage', () => {
    process.env.SUPPORTER_PRICE_CENTS = 'abc'
    const res = mockRes()
    handler(mockReq(), res)
    expect(res.body.priceLabel).toBe('€4.99')
  })

  it('rejects non-GET', () => {
    const res = mockRes()
    handler(mockReq({ method: 'POST' }), res)
    expect(res.statusCode).toBe(405)
  })
})
