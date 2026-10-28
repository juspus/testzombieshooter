// Two-browser Zombie Mail versus smoke test through a local PeerJS server (dev only, ?peer=local).
// Needs: `npx peerjs --port 9000 --host 127.0.0.1` and `npx vite --port 5173`.
// Usage: node scripts/versus-smoke.cjs [baseUrl] [screenshotDir]
const { chromium } = require('playwright')
const base = process.argv[2] || 'http://localhost:5173'
const OUT = (process.argv[3] || require('os').tmpdir()) + '/'
const st = (p, f) => p.evaluate(f)
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1 }

async function lobby(b) {
  const host = await (await b.newContext({ viewport: { width: 900, height: 500 } })).newPage()
  const guest = await (await b.newContext({ viewport: { width: 900, height: 500 } })).newPage()
  for (const p of [host, guest]) p.on('pageerror', (e) => console.log('pageerror', e.message))
  await host.goto(base + '/?peer=local')
  await host.getByTestId('menu-coop').click()
  await host.getByRole('button', { name: 'Host game' }).click()
  await host.waitForFunction(() => /[A-HJ-NP-Z2-9]{5}$/.test((document.querySelector('[data-testid="menu-coop"]')?.textContent || '').trim()), null, { timeout: 15000 })
  const code = (await host.getByTestId('menu-coop').textContent()).trim().match(/[A-HJ-NP-Z2-9]{5}$/)[0]
  await guest.goto(base + '/?peer=local')
  await guest.getByTestId('menu-coop').click()
  await guest.getByLabel('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await host.waitForFunction(() => window.__game.getState().mpConnected, null, { timeout: 20000 })
  return { host, guest }
}

;(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const mode = process.argv[2] || 'all'
  // ---- Scenario 1: kill guest ----
  let { host, guest } = await lobby(b)
  await host.getByTestId('mode-mail').click()
  await guest.waitForSelector('[data-testid="lobby-mode"]', { timeout: 8000 })
  ok((await guest.getByTestId('lobby-mode').textContent()).includes('Zombie Mail'), 'guest panel shows Mode: Zombie Mail')
  await host.getByRole('button', { name: 'Start game' }).click()
  await guest.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 10000 })
  await host.waitForFunction(() => window.__game.getState().phase !== 'start')
  for (const p of [host, guest]) { await p.evaluate(() => window.__game.getState().skipIntermission()); await p.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 40000 }) }
  await host.waitForTimeout(1500)
  const info = async (p) => p.evaluate(() => { const s = window.__game.getState(); return { role: s.mpRole, conn: s.mpConnected, runMode: s.runMode, seed: s.runSeed, vs: s.versus, zombies: s.zombies.length, phase: s.phase, wave: s.wave } })
  const hi = await info(host); const gi = await info(guest)
  console.log(JSON.stringify({ hi, gi }))
  ok(hi.role === null && gi.role === null && !hi.conn && !gi.conn, 'mpRole null / mpConnected false on both')
  ok(hi.runMode === 'versus' && gi.runMode === 'versus' && hi.seed && hi.seed === gi.seed, 'same runSeed, runMode versus')
  ok(hi.vs.linked && gi.vs.linked, 'versus linked')
  ok(hi.zombies > 0 && gi.zombies > 0, 'each has own zombies')
  await host.waitForSelector('[data-testid="rival-strip"]'); await guest.waitForSelector('[data-testid="rival-strip"]')
  await host.waitForTimeout(1500)
  console.log('host strip:', await host.getByTestId('rival-strip').textContent())
  ok((await info(host)).vs.opponent?.maxHp > 0, 'host has opponent status')
  await host.screenshot({ path: OUT + 'vs-host-desktop.png' })
  // pause rule
  await host.evaluate(() => window.__game.getState().hitPlayer(0)) // noop
  // kill guest
  await guest.evaluate(() => window.__game.getState().hitPlayer(9999))
  await host.waitForSelector('[data-testid="versus-win"]', { timeout: 6000 })
  const hv = (await info(host)).vs
  ok(hv.result === 'win' && hv.reason === 'death', 'host win by death: ' + hv.result + '/' + hv.reason)
  console.log('host strip:', await host.getByTestId('rival-strip').textContent().catch(() => 'n/a'))
  await host.screenshot({ path: OUT + 'vs-host-win.png' })
  await guest.waitForFunction(() => window.__game.getState().phase === 'dead')
  await guest.waitForSelector('[data-testid="versus-result"]', { timeout: 5000 })
  const gv = (await info(guest)).vs
  ok(gv.result === 'lose', 'guest lose: ' + gv.result)
  await guest.waitForTimeout(2200)
  await guest.screenshot({ path: OUT + 'vs-guest-lose.png' })
  ok(await guest.locator('text=Leaderboard').count() === 0, 'no leaderboard UI on guest death screen')
  // rematch from both
  await host.getByTestId('versus-rematch').click()
  await guest.waitForFunction(() => /rival ready/i.test(document.querySelector('[data-testid="versus-rematch"]')?.textContent || ''), null, { timeout: 5000 })
  await guest.getByTestId('versus-rematch').click()
  await guest.waitForFunction(() => window.__game.getState().phase === 'playing' || window.__game.getState().phase === 'intermission', null, { timeout: 8000 })
  await host.waitForFunction((s) => window.__game.getState().runSeed !== s && ['playing', 'intermission'].includes(window.__game.getState().phase), hi.seed, { timeout: 8000 })
  for (const p of [host, guest]) { await p.evaluate(() => window.__game.getState().skipIntermission()); await p.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 8000 }).catch(async () => console.log('STUCK', p === host ? 'host' : 'guest', await p.evaluate(() => { const s = window.__game.getState(); return JSON.stringify({ ph: s.phase, paused: s.paused, il: s.intermissionLeft }) }))) }
  const h2 = await info(host); const g2 = await info(guest)
  ok(h2.seed === g2.seed && h2.seed !== hi.seed && h2.vs.result === null && g2.vs.result === null, 'rematch: fresh shared seed, results reset')
  // keep playing on host: kill guest again -> host win overlay -> keep playing -> continues solo
  await guest.evaluate(() => window.__game.getState().hitPlayer(9999))
  await host.waitForSelector('[data-testid="versus-win"]', { timeout: 6000 })
  await host.getByTestId('versus-keep').click()
  await host.waitForTimeout(500)
  ok((await info(host)).phase === 'playing' || (await info(host)).phase === 'intermission', 'keep playing continues the run')
  ok(await host.evaluate(() => window.__game.getState().paused) === false, 'unpaused after keep playing')
  // guest closes -> host (result already win) unaffected
  await host.context().close(); await guest.context().close()

  // ---- Scenario 2: forfeit ----
  ;({ host, guest } = await lobby(b))
  await host.getByTestId('mode-mail').click()
  await host.getByRole('button', { name: 'Start game' }).click()
  await guest.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 10000 })
  for (const p of [host, guest]) { await p.evaluate(() => window.__game.getState().skipIntermission()); await p.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 40000 }) }
  // no-pause rule (host)
  await host.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')) })
  // the forfeit takes up to 30 s; keep the idle host alive through it
  await host.evaluate(() => window.__game.setState({ hp: 1e6, maxHp: 1e6 }))
  await guest.goto('about:blank')   // a real navigation fires pagehide (context.close() does not)
  await guest.context().close()
  const t0 = Date.now()
  await host.waitForSelector('[data-testid="versus-win"]', { timeout: 40000 }).catch(async (e) => {
    console.log('FORFEIT-DEBUG', await host.evaluate(() => { const s = window.__game.getState(); return JSON.stringify({ phase: s.phase, paused: s.paused, vs: s.versus, now: Date.now() }) }))
    throw e
  })
  console.log('forfeit after ms', Date.now() - t0)
  const f = (await info(host)).vs
  ok(f.result === 'win' && f.reason === 'forfeit', 'forfeit win: ' + f.result + '/' + f.reason)
  await host.screenshot({ path: OUT + 'vs-host-forfeit.png' })
  await host.getByTestId('versus-keep').click()
  ok(await host.getByTestId('versus-rematch').count() === 0, 'rematch hidden after keep playing (link gone)')
  await host.context().close()

  // ---- Scenario 3: co-op still works, and pause is allowed there ----
  ;({ host, guest } = await lobby(b))
  await host.getByRole('button', { name: 'Start game' }).click()
  await guest.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 10000 })
  const c = await host.evaluate(() => { const s = window.__game.getState(); return { r: s.mpRole, c: s.mpConnected, rm: s.runMode, v: s.versus.active } })
  const cg = await guest.evaluate(() => { const s = window.__game.getState(); return { r: s.mpRole, c: s.mpConnected, rm: s.runMode } })
  ok(c.r === 'host' && c.c && c.rm === 'normal' && !c.v && cg.r === 'guest' && cg.c, 'co-op start unchanged: ' + JSON.stringify([c, cg]))
  await b.close()
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
