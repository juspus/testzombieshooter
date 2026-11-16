// Protocol version handshake smoke (dev only, ?peer=local): a guest that pretends to run another
// protocol version (?protocol=2) must make BOTH players see the "different version" message, and
// matching builds must not. Needs: `npx peerjs --port 9000 --host 127.0.0.1` and `npx vite --port 5173`.
// Usage: node scripts/protocol-smoke.cjs [baseUrl] [screenshotDir]
const { chromium } = require('playwright')
const base = process.argv[2] || 'http://localhost:5173'
const shots = process.argv[3]
let failed = 0
const ok = (cond, msg) => { console.log(cond ? 'PASS' : 'FAIL', msg); if (!cond) failed++ }
const MSG = 'Your partner is on a different version. Reload to update.'

async function pair(b, guestQuery) {
  const host = await (await b.newContext()).newPage()
  const guest = await (await b.newContext()).newPage()
  for (const p of [host, guest]) p.on('pageerror', (e) => console.log('pageerror', e.message))
  await host.goto(base + '/?peer=local')
  await host.getByTestId('menu-coop').click()
  await host.getByRole('button', { name: 'Host game' }).click()
  await host.waitForFunction(() => /[A-HJ-NP-Z2-9]{5}$/.test((document.querySelector('[data-testid="menu-coop"]')?.textContent || '').trim()), null, { timeout: 15000 })
  const code = (await host.getByTestId('menu-coop').textContent()).trim().match(/[A-HJ-NP-Z2-9]{5}$/)[0]
  await guest.goto(base + '/?peer=local' + guestQuery)
  await guest.getByTestId('menu-coop').click()
  await guest.getByLabel('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await host.waitForFunction(() => window.__game.getState().mpConnected, null, { timeout: 20000 })
  return { host, guest }
}

;(async () => {
  const b = await chromium.launch()
  // 1. Forced mismatch
  {
    const { host, guest } = await pair(b, '&protocol=2')
    await host.getByTestId('version-mismatch').waitFor({ timeout: 8000 })
    await guest.getByTestId('version-mismatch').waitFor({ timeout: 8000 })
    ok((await host.getByTestId('version-mismatch').textContent()).trim() === MSG, 'host sees the message')
    ok((await guest.getByTestId('version-mismatch').textContent()).trim() === MSG, 'guest sees the message')
    ok(await host.getByRole('button', { name: 'Start game' }).isDisabled(), 'host Start game is disabled')
    ok((await host.getByRole('button', { name: 'Reload' }).count()) === 1, 'host has a Reload button')
    if (shots) { await host.screenshot({ path: `${shots}/protocol-host.png` }); await guest.screenshot({ path: `${shots}/protocol-guest.png` }) }
    await host.context().close(); await guest.context().close()
  }
  // 2. Same versions: no message, Start works
  {
    const { host, guest } = await pair(b, '')
    await host.waitForTimeout(4000)   // longer than the pre-handshake timeout
    ok((await host.getByTestId('version-mismatch').count()) === 0, 'host: no message when versions match')
    ok((await guest.getByTestId('version-mismatch').count()) === 0, 'guest: no message when versions match')
    await host.getByRole('button', { name: 'Start game' }).click()
    await guest.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 10000 })
    ok(true, 'matching builds still start a game together')
    const log = await host.evaluate(() => (window.__netlog || []).filter((e) => e.type === 'hello'))
    ok(log.length >= 2, `__netlog recorded the hello exchange (${log.length} entries)`)
  }
  await b.close()
  if (failed) { console.error(failed, 'FAILED'); process.exit(1) }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
