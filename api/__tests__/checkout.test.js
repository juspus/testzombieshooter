import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockReq, mockRes } from './helpers.js'

const h = vi.hoisted(() => ({
  create: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('../_lib/stripeClient.js', () => ({
  getStripe: () => (process.env.STRIPE_SECRET_KEY ? { checkout: { sessions: { create: h.create } } } : null),
}))
vi.mock('../_lib/supabaseAdmin.js', () => {
  const q = { select: () => q, eq: () => q, maybeSingle: h.maybeSingle }
  return {
    getSupabaseAdmin: () =>
      process.env.SUPABASE_SERVICE_ROLE_KEY ? { auth: { getUser: h.getUser }, from: () => q } : null,
  }
})

import handler from '../checkout.js'

const UID = '123e4567-e89b-42d3-a456-426614174000'
const authed = (extra = {}) => ({ authorization: 'Bearer tok123', host: 'cabin.puodzius.dev', ...extra })
const saved = {}

beforeEach(() => {
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPPORTER_PRICE_CENTS']) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
  h.create.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/abc' })
  h.getUser.mockReset().mockResolvedValue({ data: { user: { id: UID, email: 'a@b.co' } }, error: null })
  h.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null })
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
})

describe('POST /api/checkout', () => {
  it('405 on non-POST', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'GET', headers: authed() }), res)
    expect(res.statusCode).toBe(405)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('503 when stripe key missing', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'checkout_unavailable' })
  })

  it('503 when service role key missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(503)
  })

  it('503 when webhook secret missing (payments could never be granted)', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(503)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('uses a per-user idempotency key so repeat clicks reuse one session', async () => {
    await handler(mockReq({ method: 'POST', headers: authed() }), mockRes())
    await handler(mockReq({ method: 'POST', headers: authed() }), mockRes())
    const k1 = h.create.mock.calls[0][1].idempotencyKey
    expect(k1).toMatch(/^checkout_[0-9a-f]{64}$/)
    expect(h.create.mock.calls[1][1].idempotencyKey).toBe(k1)
    h.getUser.mockResolvedValue({ data: { user: { id: '223e4567-e89b-42d3-a456-426614174000' } }, error: null })
    await handler(mockReq({ method: 'POST', headers: authed() }), mockRes())
    expect(h.create.mock.calls[2][1].idempotencyKey).not.toBe(k1)
  })

  it('401 without bearer token', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: { host: 'cabin.puodzius.dev' } }), res)
    expect(res.statusCode).toBe(401)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('401 with invalid token', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } })
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(401)
    expect(h.getUser).toHaveBeenCalledWith('tok123')
    expect(h.create).not.toHaveBeenCalled()
  })

  it('409 when already owned', async () => {
    h.maybeSingle.mockResolvedValue({ data: { id: 1 }, error: null })
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'already_owned' })
    expect(h.create).not.toHaveBeenCalled()
  })

  it('creates a session on success', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/c/pay/abc' })
    const arg = h.create.mock.calls[0][0]
    expect(arg.mode).toBe('payment')
    expect(arg.metadata).toEqual({ user_id: UID, sku: 'supporter_pack' })
    expect(arg.client_reference_id).toBe(UID)
    expect(arg.customer_email).toBe('a@b.co')
    expect(arg.line_items[0].price_data).toMatchObject({ currency: 'eur', unit_amount: 499 })
    expect(arg.success_url).toBe('https://cabin.puodzius.dev/?checkout=success&session_id={CHECKOUT_SESSION_ID}')
    expect(arg.cancel_url).toBe('https://cabin.puodzius.dev/?checkout=cancel')
    expect(arg.custom_text.submit.message).toContain('right of withdrawal')
    expect(arg.custom_text.submit.message).toContain('https://cabin.puodzius.dev/terms.html')
    expect(arg.custom_text.submit.message.length).toBeLessThanOrEqual(1200)
    expect(arg.consent_collection).toBeUndefined()
  })

  it('uses SUPPORTER_PRICE_CENTS', async () => {
    process.env.SUPPORTER_PRICE_CENTS = '999'
    await handler(mockReq({ method: 'POST', headers: authed() }), mockRes())
    expect(h.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(999)
  })

  it('falls back to canonical origin for untrusted hosts', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed({ host: 'evil.example', 'x-forwarded-host': 'evil.example' }) }), res)
    expect(h.create.mock.calls[0][0].success_url.startsWith('https://cabin.puodzius.dev/')).toBe(true)
  })

  it('allows preview and localhost origins', async () => {
    await handler(mockReq({ method: 'POST', headers: authed({ 'x-forwarded-host': 'cabin-git-x-juspus-projects.vercel.app', 'x-forwarded-proto': 'https' }) }), mockRes())
    expect(h.create.mock.calls[0][0].cancel_url).toBe('https://cabin-git-x-juspus-projects.vercel.app/?checkout=cancel')
    h.create.mockClear()
    await handler(mockReq({ method: 'POST', headers: authed({ host: 'localhost:3000' }) }), mockRes())
    expect(h.create.mock.calls[0][0].cancel_url).toBe('http://localhost:3000/?checkout=cancel')
  })

  it('omits customer_email when user has none', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
    await handler(mockReq({ method: 'POST', headers: authed() }), mockRes())
    expect('customer_email' in h.create.mock.calls[0][0]).toBe(false)
  })

  it('500 when stripe throws', async () => {
    h.create.mockRejectedValue(new Error('boom'))
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: authed() }), res)
    expect(res.statusCode).toBe(500)
  })
})
