// W5 one-tap invite: `<origin>/?join=<CODE>` links. Pure helpers + a once-per-page-load reader.
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/   // same alphabet as net.js room codes

export const isValidRoomCode = (c) => typeof c === 'string' && CODE_RE.test(c)
export const buildInviteLink = (origin, code) => `${origin}/?join=${code}`

// Returns { code } (normalised, possibly invalid) or null when the URL has no ?join= param.
export function parseInviteParam(search) {
  const raw = new URLSearchParams(search || '').get('join')
  if (raw == null) return null
  return { code: raw.trim().toUpperCase().slice(0, 12) }
}

// Same URL with `join` removed (keeps every other param + hash).
export function stripJoinParam(href) {
  const u = new URL(href)
  u.searchParams.delete('join')
  return u.pathname + (u.search || '') + u.hash
}

let _invite
// Reads the invite once and strips it from the address bar so a refresh doesn't rejoin.
// Cached so React strict-mode double-mounts see the same value.
export function consumeInvite() {
  if (_invite !== undefined) return _invite
  _invite = null
  try {
    _invite = parseInviteParam(window.location.search)
    if (_invite) window.history.replaceState(null, '', stripJoinParam(window.location.href))
  } catch { /* no window / blocked history: just no invite */ }
  return _invite
}
