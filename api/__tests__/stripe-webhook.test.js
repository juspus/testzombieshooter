import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Stripe from 'stripe'
import { PassThrough } from 'node:stream'
import { mockReq, mockRes } from './helpers.js'

const h = vi.hoisted(() => ({ insert: vi.fn() }))

vi.mock('../_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: () =>
    process.env.SUPABASE_SERVICE_ROLE_KEY ? { from: () => ({ insert: h.insert }) } : null,
}))

import handler, { config } from '../stripe-webhook.js'

const SECRET = 'whsec_test'
const UID = '123e4567-e89b-42d3-a456-426614174000'
const stripe = new Stripe('sk_test_x')
const saved = {}

function sessionEvent(overrides = {}, type = 'checkout.session.completed', id = 'evt_1') {
  return {
    id,
    object: 'event',
    type,
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: 499,
        currency: 'eur',
        client_reference_id: UID,
        metadata: { user_id: UID, sku: 'supporter_pack' },
        ...overrides,
      },
    },
  }
}

async function send(event, { secret = SECRET, signed = true } = {}) {
  const payload = JSON.stringify(event)
  const headers = {}
  if (signed) headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({ payload, secret })
  const res = mockRes()
  await handler(mockReq({ method: 'POST', headers, body: payload }), res)
  return res
}

beforeEach(() => {
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']) saved[k] = process.env[k]
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_WEBHOOK_SECRET = SECRET
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
  h.insert.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
})

describe('POST /api/stripe-webhook', () => {
  it('disables the body parser', () => {
    expect(config).toEqual({ api: { bodyParser: false } })
  })

  it('405 on non-POST', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('503 when env missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = await send(sessionEvent())
    expect(res.statusCode).toBe(503)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('400 on missing signature', async () => {
    const res = await send(sessionEvent(), { signed: false })
    expect(res.statusCode).toBe(400)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('400 on bad signature, no DB write', async () => {
    const res = await send(sessionEvent(), { secret: 'whsec_wrong' })
    expect(res.statusCode).toBe(400)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('400 when the payload is tampered after signing', async () => {
    const payload = JSON.stringify(sessionEvent())
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: { 'stripe-signature': sig }, body: payload.replace('499', '1') }), res)
    expect(res.statusCode).toBe(400)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('ignores unpaid sessions', async () => {
    const res = await send(sessionEvent({ payment_status: 'unpaid' }))
    expect(res.statusCode).toBe(200)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('grants on a paid session with the exact row', async () => {
    const res = await send(sessionEvent())
    expect(res.statusCode).toBe(200)
    expect(h.insert).toHaveBeenCalledTimes(1)
    expect(h.insert).toHaveBeenCalledWith({
      user_id: UID,
      sku: 'supporter_pack',
      source: 'stripe',
      stripe_session_id: 'cs_test_1',
      stripe_event_id: 'evt_1',
      amount_cents: 499,
      currency: 'eur',
    })
  })

  it('grants on async_payment_succeeded', async () => {
    const res = await send(sessionEvent({}, 'checkout.session.async_payment_succeeded', 'evt_2'))
    expect(res.statusCode).toBe(200)
    expect(h.insert).toHaveBeenCalledTimes(1)
  })

  it('falls back to client_reference_id for user id', async () => {
    await send(sessionEvent({ metadata: { sku: 'supporter_pack' } }))
    expect(h.insert.mock.calls[0][0].user_id).toBe(UID)
  })

  it('ignores invalid user id or unknown sku without writing', async () => {
    for (const metadata of [
      { user_id: 'not-a-uuid', sku: 'supporter_pack' },
      { user_id: UID, sku: 'free_money' },
      { user_id: UID },
    ]) {
      const res = await send(sessionEvent({ metadata, client_reference_id: 'nope' }))
      expect(res.statusCode).toBe(200)
    }
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('treats unique violations (23505) as success', async () => {
    h.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    const res = await send(sessionEvent())
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 on other DB errors so Stripe retries', async () => {
    h.insert.mockResolvedValue({ error: { code: '57P01', message: 'down' } })
    const res = await send(sessionEvent())
    expect(res.statusCode).toBe(500)
  })

  it('returns 200 for unknown event types', async () => {
    const res = await send({ id: 'evt_9', object: 'event', type: 'customer.created', data: { object: {} } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ received: true })
    expect(h.insert).not.toHaveBeenCalled()
  })

  // Emulates @vercel/node addHelpers (v24 dist/dev-server.mjs readBody/restoreBody):
  // the stream is drained before the handler runs, then replayed by patching only
  // req.on('data'|'end') and req.read; req.body is a lazy parsed getter.
  async function vercelReq(payload, headers, contentType = 'application/json') {
    const req = mockReq({ method: 'POST', headers: { ...headers, 'content-type': contentType }, body: payload })
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    const replay = new PassThrough()
    const on = replay.on.bind(replay)
    const originalOn = req.on.bind(req)
    req.read = replay.read.bind(replay)
    req.on = req.addListener = (n, cb) => (n === 'data' || n === 'end' ? on(n, cb) : originalOn(n, cb))
    replay.write(body)
    replay.end()
    Object.defineProperty(req, 'body', { get: () => JSON.parse(body.toString()) })
    return req
  }

  it('verifies the raw body under Vercel request helpers (stream pre-drained + replayed)', async () => {
    const payload = JSON.stringify(sessionEvent())
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const res = mockRes()
    await handler(await vercelReq(payload, { 'stripe-signature': sig }), res)
    expect(res.statusCode).toBe(200)
    expect(h.insert).toHaveBeenCalledTimes(1)
  })

  it('fails closed when only a parsed req.body is available (never re-serializes)', async () => {
    const payload = JSON.stringify(sessionEvent())
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const req = mockReq({ method: 'POST', headers: { 'stripe-signature': sig } }) // empty stream
    req.body = JSON.parse(payload)
    const res = mockRes()
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('accepts a raw Buffer req.body when the stream is empty', async () => {
    const payload = JSON.stringify(sessionEvent())
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const req = mockReq({ method: 'POST', headers: { 'stripe-signature': sig } })
    req.body = Buffer.from(payload)
    const res = mockRes()
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(h.insert).toHaveBeenCalledTimes(1)
  })

  it('rejects a validly signed but stale event (replay outside 300 s tolerance)', async () => {
    const payload = JSON.stringify(sessionEvent())
    const timestamp = Math.floor(Date.now() / 1000) - 301
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp })
    const res = mockRes()
    await handler(mockReq({ method: 'POST', headers: { 'stripe-signature': sig }, body: payload }), res)
    expect(res.statusCode).toBe(400)
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('503 (Stripe retries) when the service role key is missing, before any grant', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = await send(sessionEvent())
    expect(res.statusCode).toBe(503)
  })

  it('logs a refund warning when a second paid session hits (user_id, sku)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "entitlements_user_id_sku_key"' } })
    const res = await send(sessionEvent())
    expect(res.statusCode).toBe(200)
    expect(warn).toHaveBeenCalledWith('stripe-webhook: duplicate purchase, refund needed', 'cs_test_1')
    warn.mockRestore()
  })
})
