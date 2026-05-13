const DEFAULT_GAME_PATH = '/'

export default function handler(req, res) {
  const requestUrl = getRequestUrl(req)
  const summary = getRunSummary(requestUrl.searchParams)
  const ogImageUrl = new URL('/api/og', requestUrl.origin)

  for (const [key, value] of requestUrl.searchParams.entries()) {
    ogImageUrl.searchParams.set(key, value)
  }

  const title = `Cabin run: wave ${summary.wave}, ${summary.kills} kill${summary.kills === 1 ? '' : 's'}`
  const description = `I reached wave ${summary.wave} with ${summary.kills} kill${summary.kills === 1 ? '' : 's'} in Cabin.`
  const gameUrl = summary.gameUrl || new URL(DEFAULT_GAME_PATH, requestUrl.origin).toString()

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400')
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(requestUrl.toString())}" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl.toString())}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(description)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl.toString())}" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(gameUrl)}" />
  </head>
  <body style="background:#090909;color:#f2f2f2;font-family:'Courier New',monospace;text-align:center;padding:48px;">
    <h1>Cabin run shared</h1>
    <p>${escapeHtml(description)}</p>
    <p><a style="color:#fff;" href="${escapeHtml(gameUrl)}">Play Cabin</a></p>
  </body>
</html>`)
}

function getRequestUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] ?? 'https'
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000'
  return new URL(req.url, `${protocol}://${host}`)
}

function getRunSummary(params) {
  return {
    wave: clampInt(params.get('wave'), 1, 999, 1),
    kills: clampInt(params.get('kills'), 0, 99999, 0),
    money: clampMoney(params.get('money')),
    weapon: cleanText(params.get('weapon') || 'Pistol', 24),
    perks: cleanText(params.get('perks') || 'None', 90),
    gameUrl: cleanUrl(params.get('game')),
  }
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
