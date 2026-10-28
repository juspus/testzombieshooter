// GET /api/turn -> { iceServers: [...] } for WebRTC relay (co-op on mobile data / strict NATs).
// Provider-agnostic: set TURN_URLS (comma-separated turn:/turns: urls) + TURN_USERNAME + TURN_CREDENTIAL.
// With nothing configured it returns { iceServers: [] } and the client keeps PeerJS defaults.
// TURN credentials are handed to the browser by design (TURN has no other auth); never logged here.
// Ephemeral-credential providers (e.g. Cloudflare Realtime TURN) are not wired up: their
// request/response shape could not be verified from the build environment.

export function buildIceServers(env = process.env) {
  const urls = String(env.TURN_URLS || '')
    .split(',').map((u) => u.trim()).filter((u) => /^turns?:/i.test(u))
  if (!urls.length || !env.TURN_USERNAME || !env.TURN_CREDENTIAL) return []
  return [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }]
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  // Short cache so rotating the credential takes effect quickly.
  res.setHeader('Cache-Control', 'private, max-age=60')
  res.status(200).json({ iceServers: buildIceServers() })
}
