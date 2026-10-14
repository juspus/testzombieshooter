import { SKU, getPriceCents, formatPrice } from './_lib/price.js'

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.status(200).json({
    checkoutEnabled: Boolean(process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
    priceLabel: formatPrice(getPriceCents()),
    sku: SKU,
  })
}
