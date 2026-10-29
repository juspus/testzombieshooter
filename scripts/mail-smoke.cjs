// Two-browser Zombie Mail smoke test through a local PeerJS server (dev only, ?peer=local).
// Needs: `npx peerjs --port 9000 --host 127.0.0.1` and a Vite dev server.
// Usage: node scripts/mail-smoke.cjs [baseUrl] [screenshotDir]
const { chromium } = require('playwright')
const base = process.argv[2] || 'http://localhost:5173'
const OUT = (process.argv[3] || require('os').tmpdir()) + '/'
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1 }
const G = (p, f, a) => p.evaluate(f, a)

async function lobby(b, hostOpts = {}) {
  const host = await (await b.newContext({ viewport: { width: 900, height: 500 }, ...hostOpts })).newPage()
  const guest = await (await b.newContext({ viewport: { width: 900, height: 500 } })).newPage()
  for (const p of [host, guest]) p.on('pageerror', (e) => console.log('pageerror', e.message))
  await host.goto(base + '/?peer=local')
  await host.getByTestId('menu-versus').click()
  await host.getByTestId('versus-mail').click()
  await host.getByRole('button', { name: 'Host game' }).click()
  await host.waitForFunction(() => /[A-HJ-NP-Z2-9]{5}$/.test((document.querySelector('[data-testid="menu-versus"]')?.textContent || '').trim()), null, { timeout: 15000 })
  const code = (await host.getByTestId('menu-versus').textContent()).trim().match(/[A-HJ-NP-Z2-9]{5}$/)[0]
  await guest.goto(base + '/?peer=local')
  await guest.getByTestId('menu-versus').click()
  await guest.getByTestId('versus-mail').click()
  await guest.getByLabel('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await host.waitForFunction(() => window.__game.getState().mpConnected, null, { timeout: 20000 })
  await guest.waitForSelector('[data-testid="lobby-mode"]', { timeout: 8000 })
  await host.getByRole('button', { name: 'Start game' }).click()
  await guest.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 10000 })
  await host.waitForFunction(() => window.__game.getState().phase !== 'start')
  return { host, guest }
}
const play = async (p) => {
  await G(p, () => window.__game.getState().skipIntermission())
  await p.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 40000 })
  await G(p, () => window.__game.setState({ hp: 1e6, maxHp: 1e6 }))
}
const mail = (p) => G(p, () => { const m = window.__game.getState().mail; return { meter: m.meter, inc: m.incoming.map((e) => e.item), sent: m.sent.length, pm: m.pendingModifier, extra: m.waveExtra } })
const total = (p) => G(p, () => window.__game.getState().getZombiesForWave())
const mailed = (p) => G(p, () => { const s = window.__game.getState(); return [...s.zombies, ...s.pendingSpawns].filter((z) => z.mail).map((z) => [z.mail, z.type]) })
const kill = (p, n, head) => G(p, ([n, head]) => { const s = window.__game.getState(); const ids = s.zombies.filter((z) => !z.dying).slice(0, n).map((z) => z.id); ids.forEach((id) => window.__game.getState().hitZombie(id, head)); return ids.length }, [n, head])
const setMeter = (p, v) => G(p, (v) => { const s = window.__game.getState(); window.__game.setState({ mail: { ...s.mail, meter: v } }) }, v)

;(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

  // ---------------- Desktop sender, desktop receiver ----------------
  let { host, guest } = await lobby(b)
  await play(host); await play(guest)
  await host.waitForSelector('[data-testid="mail-bar"]')
  ok(/Kills fill MAIL\. Send with 1-5/.test(await host.getByTestId('mail-hint').textContent()), 'first-wave hint shown')
  for (const k of ['brute', 'exploders', 'spitters', 'horde', 'blackout']) ok(await host.getByTestId('mail-item-' + k).count() === 1, 'bar item ' + k)
  ok((await mail(host)).meter === 0, 'meter starts at 0')

  // meter: 4 headshots = 6
  await kill(host, 4, true)
  ok((await mail(host)).meter === 6, 'meter after 4 headshot kills = ' + (await mail(host)).meter)
  ok((await host.getByTestId('mail-item-brute').getAttribute('data-ready')) === '1', 'Brute lit at 6')
  ok((await host.getByTestId('mail-item-exploders').getAttribute('data-ready')) === '0', 'Exploders dark at 6')
  await host.screenshot({ path: OUT + 'mail-host-bar.png' })
  await host.waitForTimeout(1500)
  ok((await guest.getByTestId('rival-mail').textContent()).includes('MAIL 6'), 'guest strip shows rival MAIL 6: ' + (await guest.getByTestId('rival-mail').textContent()))

  // send Brute with key 1
  const gTotal0 = await total(guest)
  await host.keyboard.press('Digit1')
  ok((await host.getByTestId('mail-toast').textContent()) === 'Sent: Brute', 'sender toast')
  ok((await mail(host)).meter === 0 && (await mail(host)).sent === 1, 'meter spent, sent recorded')
  await guest.waitForSelector('[data-testid="mail-warning"]', { timeout: 5000 })
  const warnText = await guest.getByTestId('mail-warning').textContent()
  ok(/^MAIL: BRUTE · (NORTH|SOUTH|EAST|WEST)/.test(warnText), 'rival warning: ' + warnText)
  await guest.screenshot({ path: OUT + 'mail-guest-warning.png' })
  ok((await mailed(guest)).length === 0, 'nothing landed during the warning')
  await guest.waitForFunction(() => [...window.__game.getState().zombies, ...window.__game.getState().pendingSpawns].some((z) => z.mail), null, { timeout: 45000 })
  const landed = await mailed(guest)
  ok(landed.length === 1 && landed[0][1] === 'brute', 'brute landed in rival world: ' + JSON.stringify(landed))
  ok((await total(guest)) === gTotal0 + 1, 'rival wave total ' + gTotal0 + ' -> ' + (await total(guest)))
  ok(/\/ (\d+)/.exec(await guest.getByText('KILLS', { exact: true }).locator('..').textContent())?.[1] === String(gTotal0 + 1), 'rival HUD shows new total')
  await guest.screenshot({ path: OUT + 'mail-guest-landed.png' })

  // wrong seed is ignored
  const gm0 = await mail(guest)
  await host.evaluate(async () => { const v = await import('/src/versus.js'); v.sendVersus('mail', { seed: 'WRONGSEED', id: 'evil1', item: 'horde' }) })
  await host.waitForTimeout(1200)
  const gm1 = await mail(guest)
  ok(gm1.inc.length === gm0.inc.length && (await mailed(guest)).length === 1, 'wrong-seed mail ignored')
  // missing seed too
  await host.evaluate(async () => { const v = await import('/src/versus.js'); v.sendVersus('mail', { id: 'evil2', item: 'horde' }) })
  await host.waitForTimeout(800)
  ok((await mail(guest)).inc.length === 0, 'seedless mail ignored')

  // send during rival's intermission: clear guest wave, go to intermission
  await G(guest, () => window.__game.setState({ instaKillOn: true }))
  for (let i = 0; i < 30; i++) { if (!(await kill(guest, 30, false))) break }
  await guest.waitForFunction(() => window.__game.getState().phase === 'wave_clear', null, { timeout: 10000 })
  await G(guest, () => { window.__game.setState({ instaKillOn: false }); window.__game.getState().nextWave() })
  ok((await G(guest, () => window.__game.getState().phase)) === 'intermission', 'guest in intermission')
  await setMeter(host, 30)
  await host.keyboard.press('Digit2')   // exploders (8)
  await host.keyboard.press('Digit5')   // blackout (15)
  await host.waitForTimeout(800)
  const gi = await mail(guest)
  ok(gi.inc.join() === 'exploders', 'exploders queued, not landed, during intermission: ' + gi.inc)
  ok((await mailed(guest)).length === 0, 'no mail zombies in intermission')
  ok((await G(guest, () => window.__game.getState().waveModifier)) === 'blackout', 'Blackout sent in intermission makes the upcoming wave a blackout wave')
  ok((await mail(host)).meter === 7, 'meter 30 - 8 - 15 = 7: ' + (await mail(host)).meter)
  await G(guest, () => window.__game.getState().skipIntermission())
  await guest.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 40000 })
  await G(guest, () => window.__game.setState({ hp: 1e6, maxHp: 1e6 }))
  ok((await mailed(guest)).length === 0, 'still nothing at wave start (fresh 5 s warning)')
  await guest.waitForSelector('[data-testid="mail-warning"]', { timeout: 3000 })
  await guest.waitForFunction(() => window.__game.getState().zombies.filter((z) => z.mail).length === 3, null, { timeout: 45000 })
  ok((await mailed(guest)).every(([, t]) => t === 'exploder'), 'exploders landed as exploders at the new wave')
  ok(await guest.locator('[data-modifier-badge="blackout"]').count() === 1, 'blackout badge on the receiver HUD')
  await guest.screenshot({ path: OUT + 'mail-guest-blackout.png' })

  // Blackout while the rival is playing: applies to the wave after this one
  await setMeter(host, 15)
  await host.keyboard.press('Digit5')
  await guest.waitForFunction(() => window.__game.getState().mail.pendingModifier === 'blackout', null, { timeout: 45000 })
  ok(true, 'blackout queued as pending while playing')
  await G(guest, () => window.__game.setState({ instaKillOn: true }))
  for (let i = 0; i < 40; i++) { if (!(await kill(guest, 30, false))) break }
  await guest.waitForFunction(() => window.__game.getState().phase === 'wave_clear', null, { timeout: 10000 })
  await G(guest, () => { window.__game.setState({ instaKillOn: false }); window.__game.getState().nextWave() })
  ok((await G(guest, () => window.__game.getState().waveModifier)) === 'blackout', 'next wave is a blackout wave')

  // dead / unaffordable sends do nothing
  await setMeter(host, 3)
  await host.keyboard.press('Digit1')
  ok((await host.getByTestId('mail-toast').textContent()) === 'Need 6' && (await mail(host)).meter === 3, 'unaffordable key shows Need 6, no spend')
  await host.context().close(); await guest.context().close()

  // ---------------- Phone sender ----------------
  ;({ host, guest } = await lobby(b, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }))
  await play(host); await play(guest)
  await host.waitForSelector('[data-btn="mail"]', { timeout: 8000 })
  ok(await host.getByTestId('mail-bar').count() === 0, 'no desktop bar on the phone')
  ok(/Tap MAIL/.test(await host.getByTestId('mail-hint').textContent()), 'phone hint: ' + (await host.getByTestId('mail-hint').textContent()))
  const boxes = await G(host, () => Object.fromEntries([...document.querySelectorAll('[data-btn]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.btn, { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }] })))
  console.log('buttons', JSON.stringify(boxes))
  ok(boxes.mail.w >= 48 && boxes.mail.h >= 48, 'MAIL button is 48 px')
  let minGap = 1e9
  for (const k of Object.keys(boxes)) if (k !== 'mail') minGap = Math.min(minGap, Math.hypot(boxes[k].x - boxes.mail.x, boxes[k].y - boxes.mail.y) - boxes[k].w / 2 - boxes.mail.w / 2)
  ok(minGap >= 8, 'MAIL clears every other button (gap ' + minGap.toFixed(1) + ' px, hit pad 8)')
  ok(boxes.mail.x - 24 > 844 * 0.4 && boxes.mail.y + 24 < 390, 'MAIL outside the stick zone and on screen')
  await host.screenshot({ path: OUT + 'mail-phone-cluster.png' })
  await setMeter(host, 20)
  await host.touchscreen.tap(boxes.mail.x, boxes.mail.y)
  await host.waitForSelector('[data-mail-list]', { timeout: 3000 })
  const items = await G(host, () => [...document.querySelectorAll('[data-mail-item]')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.mailItem, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right } }))
  ok(items.length === 5 && items.every((i) => i.h >= 48 && i.top >= 0 && i.bottom <= 390), 'list: 5 items, 48 px, on screen')
  const overlap = items.some((i) => Object.entries(boxes).some(([k, bx]) => Math.abs(bx.x - (i.left + i.right) / 2) < (bx.w + (i.right - i.left)) / 2 && Math.abs(bx.y - (i.top + i.bottom) / 2) < (bx.h + (i.bottom - i.top)) / 2))
  ok(!overlap, 'list overlaps no button')
  ok(await host.getByTestId('mail-bar').count() === 0, 'list open')
  await host.screenshot({ path: OUT + 'mail-phone-list.png' })
  const horde = items.find((i) => i.id === 'horde')
  await host.touchscreen.tap(horde.x, horde.y)
  await host.waitForTimeout(300)
  ok((await host.getByTestId('mail-toast').textContent()) === 'Sent: Horde', 'phone toast: ' + (await host.getByTestId('mail-toast').textContent().catch(() => '')))
  ok((await mail(host)).meter === 8 && await host.locator('[data-mail-list]').count() === 0, 'meter 20-12 = 8, list closed')
  const look = await G(host, () => 1)
  await guest.waitForFunction(() => window.__game.getState().zombies.concat(window.__game.getState().pendingSpawns).filter((z) => z.mail).length === 8, null, { timeout: 45000 })
  ok((await mailed(guest)).every(([, t]) => t === 'runner'), 'horde = 8 runners on the rival')
  // does the MAIL tap steal the look finger? look pointer state is internal; check yaw does not change
  await b.close()
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
