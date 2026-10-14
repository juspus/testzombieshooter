import { createHash } from 'node:crypto'
import { getStripe } from './_lib/stripeClient.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { getSafeOrigin } from './_lib/origin.js'
import { SKU, getPriceCents } from './_lib/price.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const stripe = getStripe()
  const supabase = getSupabaseAdmin()
  // No webhook secret => paid sessions could never be granted; refuse to sell.
  if (!stripe || !supabase || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'checkout_unavailable' })

  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))
  if (!match) return res.status(401).json({ error: 'unauthorized' })

  try {
    const { data, error } = await supabase.auth.getUser(match[1])
    const user = data?.user
    if (error || !user?.id) return res.status(401).json({ error: 'unauthorized' })

    const { data: owned, error: ownedError } = await supabase
      .from('entitlements')
      .select('id')
      .eq('user_id', user.id)
      .eq('sku', SKU)
      .maybeSingle()
    if (ownedError) {
      console.error('checkout: entitlement lookup failed', ownedError.code)
      return res.status(500).json({ error: 'server_error' })
    }
    if (owned) return res.status(409).json({ error: 'already_owned' })

    const origin = getSafeOrigin(req)
    const params = {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: getPriceCents(),
            product_data: {
              name: 'Cabin — Supporter Pack',
              description:
                'Cosmetic weapon finishes, crosshairs and a leaderboard badge. Thanks for supporting the game.',
            },
          },
        },
      ],
      metadata: { user_id: user.id, sku: SKU },
      client_reference_id: user.id,
      ...(user.email ? { customer_email: user.email } : {}),
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      custom_text: {
        submit: {
          message: `By paying you agree to immediate delivery of this digital content and acknowledge that your 14-day right of withdrawal ends once it is delivered. Terms: ${origin}/terms.html`,
        },
      },
    }
    // Same user + same params within a 10-minute window => Stripe returns the same
    // session instead of a new one. Caps session spam and stops two tabs from
    // producing two payable sessions (double charge; the second grant is a no-op).
    const windowId = Math.floor(Date.now() / 600_000)
    const idempotencyKey = 'checkout_' + createHash('sha256').update(`${user.id}|${windowId}|${JSON.stringify(params)}`).digest('hex')
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('checkout: failed', err?.type || err?.name)
    return res.status(500).json({ error: 'server_error' })
  }
}
