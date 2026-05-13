export default function handler(req, res) {
  const requestUrl = getRequestUrl(req)
  const summary = getRunSummary(requestUrl.searchParams)
  const description = `Wave ${summary.wave} · ${summary.kills} kill${summary.kills === 1 ? '' : 's'}`

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400')
  res.status(200).send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(description)} in Cabin">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#090909" />
      <stop offset="0.55" stop-color="#190404" />
      <stop offset="1" stop-color="#000000" />
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <g opacity="0.14" fill="#ffffff">
    ${Array.from({ length: 42 }, (_, i) => `<rect x="${(i * 97) % 1200}" y="${(i * 53) % 630}" width="3" height="26" />`).join('')}
  </g>
  <rect x="36" y="36" width="1128" height="558" fill="none" stroke="rgba(185,0,0,0.45)" stroke-width="4" />
  <rect x="56" y="56" width="1088" height="518" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

  <text x="600" y="128" fill="#ffffff" font-family="Courier New, monospace" font-size="78" font-weight="700" text-anchor="middle" letter-spacing="12" filter="url(#glow)">CABIN</text>
  <text x="600" y="184" fill="#aa0000" font-family="Courier New, monospace" font-size="24" text-anchor="middle" letter-spacing="8">RUN RESULTS</text>

  ${metricSvg('WAVE REACHED', summary.wave, 210, 275)}
  ${metricSvg('KILLS', summary.kills, 500, 275)}
  ${metricSvg('CASH BANKED', `€${summary.money}`, 790, 275)}

  <text x="600" y="435" fill="#888888" font-family="Courier New, monospace" font-size="20" text-anchor="middle">Weapon: ${escapeXml(summary.weapon)}</text>
  <text x="600" y="472" fill="#888888" font-family="Courier New, monospace" font-size="20" text-anchor="middle">Perks: ${escapeXml(summary.perks || 'None')}</text>
  <text x="600" y="540" fill="#aaaaaa" font-family="Courier New, monospace" font-size="20" text-anchor="middle">Play Cabin</text>
</svg>`)
}

function metricSvg(label, value, x, y) {
  return `<g>
    <rect x="${x - 125}" y="${y - 48}" width="250" height="140" fill="rgba(0,0,0,0.35)" stroke="rgba(180,0,0,0.38)" />
    <text x="${x}" y="${y}" fill="#777777" font-family="Courier New, monospace" font-size="18" text-anchor="middle" letter-spacing="4">${escapeXml(label)}</text>
    <text x="${x}" y="${y + 62}" fill="#f2f2f2" font-family="Courier New, monospace" font-size="58" font-weight="700" text-anchor="middle">${escapeXml(value)}</text>
  </g>`
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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
