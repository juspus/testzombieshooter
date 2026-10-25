import { getStripe } from './_lib/stripeClient.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { readRawBody } from './_lib/rawBody.js'

// Stripe signs the exact bytes. Note: this flag is Next.js-only and is ignored for
// plain api/*.js functions; readRawBody() copes with Vercel's request helpers.
export const config = { api: { bodyParser: false } }

const ALLOWED_SKUS = ['supporter_pack']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GRANT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const supabase = getSupabaseAdmin()
  if (!stripe || !secret || !supabase) return res.status(503).json({ error: 'webhook_unavailable' })

  const signature = req.headers['stripe-signature']
  if (!signature || Array.isArray(signature)) return res.status(400).json({ error: 'invalid_signature' })

  let event
  try {
    const rawBody = await readRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch {
    return res.status(400).json({ error: 'invalid_signature' })
  }

  if (!GRANT_EVENTS.has(event.type)) return res.status(200).json({ received: true })

  const session = event.data?.object
  if (!session || session.payment_status !== 'paid') return res.status(200).json({ received: true })

  const userId = session.metadata?.user_id || session.client_reference_id
  const sku = session.metadata?.sku
  if (typeof userId !== 'string' || !UUID_RE.test(userId) || !ALLOWED_SKUS.includes(sku)) {
    // Not one of ours / malformed: retrying will never help.
    console.warn('stripe-webhook: ignoring session with invalid metadata', session.id)
    return res.status(200).json({ received: true })
  }

  const { error } = await supabase.from('entitlements').insert({
    user_id: userId,
    sku,
    source: 'stripe',
    stripe_session_id: session.id,
    stripe_event_id: event.id,
    amount_cents: session.amount_total,
    currency: session.currency,
  })

  // 23505 = unique violation: already granted (duplicate delivery or both event types fired).
  // If it hit (user_id, sku) rather than the session/event keys, this is a SECOND paid
  // session for a user who already owns the pack: money taken, nothing granted -> refund.
  if (error?.code === '23505' && /user_id_sku/.test(`${error.message ?? ''} ${error.details ?? ''}`)) {
    console.warn('stripe-webhook: duplicate purchase, refund needed', session.id)
  }
  if (error && error.code !== '23505') {
    console.error('stripe-webhook: insert failed', error.code)
    return res.status(500).json({ error: 'db_error' })
  }

  return res.status(200).json({ received: true })
}
