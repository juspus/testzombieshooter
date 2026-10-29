// Two-browser co-op smoke test through a local PeerJS server (dev only, ?peer=local).
// Needs: `npx peerjs --port 9000 --host 127.0.0.1` and `npx vite --port 5173`. Usage: node scripts/twoplayer-smoke.cjs [baseUrl]
const { chromium } = require('playwright')
const base = process.argv[2] || 'http://localhost:5173'
;(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream'] })
  const host = await (await b.newContext()).newPage()
  const guest = await (await b.newContext()).newPage()
  for (const p of [host, guest]) p.on('pageerror', (e) => console.log('pageerror', e.message))
  await host.goto(base + '/?peer=local')
  await host.getByTestId('menu-coop').click()
  await host.getByRole('button', { name: 'Host game' }).click()
  // The room code shows as the Co-op menu item's meta once the PeerJS server answers.
  await host.waitForFunction(() => /[A-HJ-NP-Z2-9]{5}$/.test((document.querySelector('[data-testid="menu-coop"]')?.textContent || '').trim()), null, { timeout: 15000 })
  const code = (await host.getByTestId('menu-coop').textContent()).trim().match(/[A-HJ-NP-Z2-9]{5}$/)[0]
  console.log('room code', code)
  await guest.goto(base + '/?peer=local')
  await guest.getByTestId('menu-coop').click()
  await guest.getByLabel('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await host.waitForFunction(() => window.__game.getState().mpConnected, null, { timeout: 20000 })
  console.log('connected: host', await host.evaluate(() => window.__game.getState().mpConnected), 'guest', await guest.evaluate(() => window.__game.getState().mpConnected))
  await host.getByRole('button', { name: 'Start game' }).click()
  await guest.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 10000 })
  console.log('phases', await host.evaluate(() => window.__game.getState().phase), await guest.evaluate(() => window.__game.getState().phase))
  await b.close()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
