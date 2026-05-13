const SHARE_TOKEN_VERSION = 1
const SHARE_TOKEN_PEPPER = 'cabin-run-share-v1'

export function createRunShareToken(summary) {
  const payload = normalizeSummary(summary)
  const body = base64UrlEncode(stableStringify(payload))
  return `${body}.${signTokenBody(body)}`
}

export function parseRunShareToken(token) {
  if (!token) return null

  const [body, signature, ...extra] = String(token).split('.')
  if (!body || !signature || extra.length > 0) return null
  if (signature !== signTokenBody(body)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(body))
    if (payload?.v !== SHARE_TOKEN_VERSION) return null
    return normalizeSummary({
      wave: payload.w,
      kills: payload.k,
      money: payload.m,
      weapon: payload.weapon,
      perks: Array.isArray(payload.perks) ? payload.perks : [],
      gameUrl: payload.game,
    })
  } catch {
    return null
  }
}

function normalizeSummary(summary) {
  return {
    v: SHARE_TOKEN_VERSION,
    w: clampInt(summary?.wave, 1, 999, 1),
    k: clampInt(summary?.kills, 0, 99999, 0),
    m: clampMoney(summary?.money),
    weapon: cleanText(summary?.weapon || 'Pistol', 24),
    perks: normalizePerks(summary?.perks),
    game: cleanUrl(summary?.gameUrl),
  }
}

function signTokenBody(body) {
  return hashString(`${body}.${SHARE_TOKEN_PEPPER}`).slice(0, 16)
}

function hashString(value) {
  let h1 = 0xdeadbeef ^ value.length
  let h2 = 0x41c6ce57 ^ value.length

  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return `${toHex(h1)}${toHex(h2)}`
}

function toHex(value) {
  return (value >>> 0).toString(16).padStart(8, '0')
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function base64UrlEncode(value) {
  const binary = encodeUtf8(value)
  const encoded = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64')

  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = typeof atob === 'function'
    ? atob(padded)
    : Buffer.from(padded, 'base64').toString('binary')

  return decodeUtf8(binary)
}

function encodeUtf8(value) {
  return encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, byte) => String.fromCharCode(Number.parseInt(byte, 16)))
}

function decodeUtf8(value) {
  return decodeURIComponent(Array.from(value, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function clampMoney(value) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) return '0.00'
  return Math.min(999999, Math.max(0, number)).toFixed(2)
}

function normalizePerks(value) {
  const perks = Array.isArray(value) ? value : String(value || '').split(',')
  return perks.map((perk) => cleanText(perk.trim(), 32)).filter(Boolean).slice(0, 8)
}

function cleanText(value, maxLength) {
  return String(value).replace(/[<>]/g, '').slice(0, maxLength)
}

function cleanUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}
