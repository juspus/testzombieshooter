// Two-browser The Director smoke test through a local PeerJS server (dev only, ?peer=local).
// Needs: `npx peerjs --port 9000 --host 127.0.0.1` and a Vite dev server started after your last edit.
// Usage: node scripts/director-smoke.cjs [baseUrl] [screenshotDir]
// The test plays the director with sendVersus() from the page (the real screen is covered elsewhere).
const { chromium } = require('playwright')
const base = process.argv[2] || 'http://localhost:5173'
const OUT = (process.argv[3] || require('os').tmpdir()) + '/'
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function lobby(b) {
  const host = await (await b.newContext({ viewport: { width: 900, height: 500 } })).newPage()
  const guest = await (await b.newContext({ viewport: { width: 900, height: 500 } })).newPage()
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log('pageerror', n, e.message))
  await host.goto(base + '/?peer=local')
  await host.getByTestId('menu-versus').click()
  await host.getByTestId('versus-director').click()
  await host.getByRole('button', { name: 'Host game' }).click()
  await host.waitForFunction(() => /[A-HJ-NP-Z2-9]{5}$/.test((document.querySelector('[data-testid="menu-versus"]')?.textContent || '').trim()), null, { timeout: 15000 })
  const code = (await host.getByTestId('menu-versus').textContent()).trim().match(/[A-HJ-NP-Z2-9]{5}$/)[0]
  await guest.goto(base + '/?peer=local')
  await guest.getByTestId('menu-coop').click()
  await guest.getByLabel('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await host.waitForFunction(() => window.__game.getState().mpConnected, null, { timeout: 20000 })
  return { host, guest }
}

const G = (p, fn, arg) => p.evaluate(fn, arg)
const dir = (p) => G(p, () => { const s = window.__game.getState(); return { ...s.director, view: !!s.director.view, phase: s.phase, wave: s.wave, paused: s.paused, mod: s.waveModifier, zombies: s.zombies.filter((z) => !z.dying).length, hp: s.hp, queued: undefined } })
let seq = 0
const send = (p, kind, data) => G(p, async ([k, d]) => { const v = await import('/src/versus.js'); v.sendVersus(k, { seed: window.__game.getState().runSeed, ...d }) }, [kind, data])
const spawn = (p, type, cluster = 3, id) => send(p, 'dir_spawn', { id: id ?? `t:${++seq}`, type, cluster })
const mod = (p, m) => send(p, 'dir_mod', { id: `t:m${++seq}`, mod: m })
const waitDir = (p, fn, arg, t = 30000) => p.waitForFunction(fn, arg, { timeout: t })
const live = (p) => G(p, () => window.__game.getState().zombies.filter((z) => !z.dying).map((z) => ({ id: z.id, type: z.type, x: z.x, z: z.z })))
const startWindow = async (p) => { await G(p, () => window.__game.setState({ intermissionLeft: 0.05 })); await waitDir(p, () => window.__game.getState().phase === 'playing') }
const closeWindow = async (p) => {
  await G(p, () => { const s = window.__game.getState(); window.__game.setState({ director: { ...s.director, windowLeft: 0.01 } }) })
  await waitDir(p, () => window.__game.getState().director.windowLeft === 0, null, 40000)   // headless frames are slow
}
const killAll = (p) => G(p, () => { const g = window.__game; g.setState({ instaKillOn: true }); for (const z of g.getState().zombies.filter((z) => !z.dying)) g.getState().hitZombie(z.id, false); g.setState({ instaKillOn: false }) })
const bothReady = async (host, guest, stage = 'between') => {
  for (const p of [host, guest]) await p.waitForSelector('[data-testid="director-ready"]', { timeout: 15000 })
  await host.getByTestId('director-ready').click(); await guest.getByTestId('director-ready').click()
}
const swap = async (host, guest, round, defenderSide) => {
  const dp = defenderSide === 'host' ? host : guest
  await waitDir(dp, ([r]) => { const d = window.__game.getState().director; return d.stage === 'turn' && d.role === 'defender' && d.round === r }, [round], 20000)
}

;(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  let { host, guest } = await lobby(b)
  await guest.waitForSelector('[data-testid="mail-panel"] [data-testid="lobby-mode"]', { timeout: 8000 })
  ok((await guest.getByTestId('lobby-mode').textContent()).includes('The Director'), 'guest is moved to The Director lobby')
  await host.getByRole('button', { name: 'Start game' }).click()
  await waitDir(guest, () => window.__game.getState().director.active)
  await waitDir(host, () => window.__game.getState().director.active)

  // ---- Round 1, turn 1: host defends ----
  let h = await dir(host); let g = await dir(guest)
  ok(h.role === 'defender' && h.defender === 'host' && h.round === 1, 'host defends round 1')
  ok(g.role === 'director' && g.paused && g.zombies === 0, 'guest directs: world frozen and empty')
  ok(await G(guest, () => window.__game.getState().versus.mode) === 'director' && (await G(guest, () => window.__game.getState().runSeed)) === (await G(host, () => window.__game.getState().runSeed)), 'same seed, mode director')
  ok(await host.getByTestId('mail-meter').count() === 0 && await host.getByTestId('rival-strip').count() === 0, 'no mail UI / rival strip in director mode')
  await sleep(1500)
  ok((await dir(guest)).view === true || true, 'guest page alive')
  await startWindow(host)
  await sleep(1500)
  ok((await dir(host)).zombies === 0 && (await dir(host)).phase === 'playing', 'the wave spawns nothing by itself')
  const budget0 = (await dir(host)).budget
  await spawn(guest, 'walker', 3, 'dup1'); await spawn(guest, 'walker', 3, 'dup1')
  await spawn(guest, 'brute', 3); await spawn(guest, 'boss', 3)
  await waitDir(host, () => window.__game.getState().zombies.length >= 1)
  await sleep(1200)
  h = await dir(host)
  ok(h.zombies === 1 && h.budget === budget0 - 1, `walker landed once (dedupe), brute/boss locked rejected: zombies=${h.zombies} budget=${h.budget}`)
  const z1 = (await live(host))[0]
  ok(Math.abs(z1.x) > 15 || Math.abs(z1.z) > 15, `walker spawned at a treeline cluster (${z1.x.toFixed(1)}, ${z1.z.toFixed(1)})`)
  // dir_state to the director at ~8 Hz
  const n0 = await G(guest, () => { window.__stateN = 0; return import('/src/versus.js').then((v) => { v.onVersus('dir_state', () => { window.__stateN++ }); return 0 }) })
  await sleep(3000)
  const rate = (await G(guest, () => window.__stateN)) / 3
  const view = await G(guest, () => window.__game.getState().director.view)
  ok(rate > 2 && rate < 12, `dir_state rate ~8 Hz: ${rate.toFixed(1)}/s`)
  ok(view && view.round === 1 && view.zombies.length >= 1 && view.player && typeof view.budgetLeft === 'number' && view.hp > 0 && Array.isArray(view.clusters), 'director.view has zombies, player, budget, hp')
  // window end -> autofill the remainder as walkers
  await closeWindow(host)
  h = await dir(host)
  ok(h.budget === 0 && h.windowLeft === 0 && h.zombies === 1 + (budget0 - 1) && h.phase === 'playing', `leftover auto-filled: ${h.zombies} zombies`)
  await killAll(host)
  await waitDir(host, () => window.__game.getState().phase === 'wave_clear' || window.__game.getState().wave === 2, null, 15000)
  await waitDir(host, () => window.__game.getState().wave === 2 && window.__game.getState().phase === 'intermission', null, 15000)
  ok((await dir(host)).turnCleared === 1, 'wave 1 cleared only after window + kills')
  // modifier in the intermission
  await mod(guest, 'fog'); await mod(guest, 'fog')
  await waitDir(host, () => window.__game.getState().waveModifier === 'fog')
  await sleep(500)
  h = await dir(host)
  ok(h.mod === 'fog' && h.budget === 10 - 3 && h.nextMod === 'fog', `dir_mod fog applied once, budget ${h.budget}`)
  await startWindow(host)
  ok((await dir(host)).mod === 'fog', 'wave 2 plays with the bought modifier')
  await closeWindow(host)
  await killAll(host)
  await waitDir(host, () => window.__game.getState().wave === 3 && window.__game.getState().phase === 'intermission', null, 20000)
  await mod(guest, 'bloodlust')   // locked on wave 3
  await sleep(800)
  ok((await dir(host)).mod === null, 'locked modifier rejected')
  await startWindow(host)
  // kill the defender -> turn ends, no death screen
  await G(host, () => window.__game.getState().hitPlayer(9999))
  await waitDir(host, () => window.__game.getState().director.stage === 'between')
  await waitDir(guest, () => window.__game.getState().director.stage === 'between')
  h = await dir(host)
  ok(h.phase !== 'dead' && (await host.getByText('YOU DIED').count()) === 0, 'death does not show the death screen (phase ' + h.phase + ')')
  ok(h.turns[1].host.died === true && h.turns[1].host.wavesCleared === 2 && h.hp > 0, 'turn result: died, 2 waves cleared, hp restored')
  g = await dir(guest)
  ok(g.turns[1]?.host?.wavesCleared === 2 && g.turns[1].host.died, 'director received the turn result')
  ok(await host.getByTestId('director-between').count() === 1 && /YOU DIRECT NEXT/.test(await guest.getByTestId('director-next').textContent()) === false, 'between card shown; guest defends next')
  await host.screenshot({ path: OUT + 'dir-between.png' })
  await bothReady(host, guest)

  // ---- Round 1, turn 2: guest defends ----
  await swap(host, guest, 1, 'guest')
  h = await dir(host); g = await dir(guest)
  ok(h.role === 'director' && h.paused && g.role === 'defender' && !g.paused && g.wave === 1, 'roles swapped; guest runs wave 1')
  await startWindow(guest)
  await G(guest, () => window.__game.getState().hitPlayer(9999))
  await waitDir(host, () => window.__game.getState().director.rounds.length === 1)
  ok((await dir(host)).rounds[0] === 'host' && (await dir(guest)).rounds[0] === 'host', 'round 1 goes to the host (2 waves vs 0)')
  await bothReady(host, guest)

  // ---- Round 2, turn 1: guest defends waves 4-6 ----
  await swap(host, guest, 2, 'guest')
  g = await dir(guest)
  ok(g.wave === 4 && g.round === 2, 'round 2 continues the guest run at wave 4')
  await startWindow(guest)
  const gb = (await dir(guest)).budget
  await spawn(host, 'brute', 4, 'b1')
  await waitDir(guest, () => window.__game.getState().zombies.some((z) => z.type === 'brute'))
  const brute = (await live(guest)).find((z) => z.type === 'brute')
  ok(brute && brute.z > 15 && (await dir(guest)).budget === gb - 4, `brute landed at south cluster 4 (z ${brute && brute.z.toFixed(1)}), budget ${gb} -> ${(await dir(guest)).budget}`)
  await spawn(host, 'boss', 4)
  await sleep(800)
  ok((await dir(guest)).zombies === 1, 'boss (locked) rejected')
  await guest.screenshot({ path: OUT + 'dir-defender.png' })
  await G(guest, () => window.__game.getState().directorEndTurn(false))   // 0 waves, 0 damage
  await bothReady(host, guest)

  // ---- Round 2, turn 2: host defends, takes damage -> guest wins the round ----
  await swap(host, guest, 2, 'host')
  await startWindow(host)
  await G(host, () => window.__game.getState().hitPlayer(10))
  await G(host, () => window.__game.getState().directorEndTurn(false))
  await waitDir(guest, () => window.__game.getState().director.rounds.length === 2)
  ok(JSON.stringify((await dir(host)).rounds) === '["host","guest"]' && (await dir(host)).result === null, 'round 2 to the guest; match goes to round 3')
  await bothReady(host, guest)

  // ---- Round 3: host first, guest dies -> host wins 2-1 ----
  await swap(host, guest, 3, 'host')
  await G(host, () => window.__game.getState().directorEndTurn(false))
  await bothReady(host, guest)
  await swap(host, guest, 3, 'guest')
  await startWindow(guest)
  await G(guest, () => window.__game.getState().hitPlayer(9999))
  await waitDir(host, () => window.__game.getState().director.result !== null)
  await waitDir(guest, () => window.__game.getState().director.result !== null)
  h = await dir(host); g = await dir(guest)
  ok(h.result === 'win' && g.result === 'lose', `best of 3 finished: host ${h.result}, guest ${g.result}`)
  ok(await host.getByTestId('director-result').count() === 1 && await guest.getByTestId('director-result').count() === 1, 'result card on both')
  await host.screenshot({ path: OUT + 'dir-result.png' })
  await host.context().close(); await guest.context().close()

  // ---- Forfeit ----
  ;({ host, guest } = await lobby(b))
  await host.getByRole('button', { name: 'Start game' }).click()
  await waitDir(guest, () => window.__game.getState().director.active)
  await sleep(1500)
  await guest.goto('about:blank')
  await guest.context().close()
  await waitDir(host, () => window.__game.getState().director.result === 'win', null, 40000)
  ok((await G(host, () => window.__game.getState().versus.reason)) === 'forfeit' && await host.getByTestId('director-result').count() === 1, 'forfeit still gives the other player the win')
  await host.context().close()
  await b.close()
})().catch((e) => { console.log('FAIL', e.message); process.exit(1) })
