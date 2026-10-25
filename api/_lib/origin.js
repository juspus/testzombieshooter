export const FALLBACK_ORIGIN = 'https://cabin.puodzius.dev'

const EXACT_HOSTS = new Set(['cabin.puodzius.dev', 'testzombieshooter.vercel.app'])

export function isAllowedHost(host) {
  if (typeof host !== 'string') return false
  if (EXACT_HOSTS.has(host)) return true
  if (/^[a-z0-9-]+-juspus-projects\.vercel\.app$/.test(host)) return true
  return /^localhost:\d{1,5}$/.test(host)
}

// Same header logic as api/share.js, but the host must be allowlisted
// (the result is used in Stripe redirect URLs).
export function getSafeOrigin(req) {
  const first = (v) => (Array.isArray(v) ? v[0] : String(v ?? '')).split(',')[0].trim().toLowerCase()
  const host = first(req.headers['x-forwarded-host'] ?? req.headers.host)
  if (!isAllowedHost(host)) return FALLBACK_ORIGIN
  const proto = host.startsWith('localhost') ? (first(req.headers['x-forwarded-proto']) === 'https' ? 'https' : 'http') : 'https'
  return `${proto}://${host}`
}
