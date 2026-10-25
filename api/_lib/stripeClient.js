import Stripe from 'stripe'

let client
let cachedKey

// Lazily created so a missing key never crashes module load.
export function getStripe(key = process.env.STRIPE_SECRET_KEY) {
  if (!key) return null
  if (!client || cachedKey !== key) {
    client = new Stripe(key)
    cachedKey = key
  }
  return client
}
