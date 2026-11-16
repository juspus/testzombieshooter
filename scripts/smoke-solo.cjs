// Solo smoke test: the game boots, a run starts, a zombie dies, wave 1 clears and wave 2 begins.
// Fails (exit 1) on any console error, uncaught page error, or a blank (white/black) frame.
// Needs a Vite dev server (or a non-production build served by `vite preview`): the script
// reads window.__game and window.__r3f, which only exist outside production builds.
// No PeerJS server and no network are needed; failed network requests are not errors here.
//
// Usage: node scripts/smoke-solo.cjs <baseUrl> [shotDir]
//   e.g. node scripts/smoke-solo.cjs http://localhost:5173 /tmp/smoke
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const shotDir = process.argv[3] || null
if (shotDir) fs.mkdirSync(shotDir, { recursive: true })

const T0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s] ${m}`)
const failures = []
const check = (cond, msg) => { log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures.push(msg) }

// Console errors that are about the sandbox/CI having no network, not about the game.
// The cabin has ~1,540 non-zombie meshes at wave 1; an empty Arena has none. Floor well below the real value.
const MIN_WORLD_MESHES = 1200

const IGNORED_ERRORS = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION|PROXY|TUNNEL)/i,
  /Failed to fetch/i,                  // supabase / api calls without network
  /WebSocket connection .* failed/i,
]

async function shot(page, name) {
  if (shotDir) await page.screenshot({ path: path.join(shotDir, `smoke-${name}.png`) }).catch(() => {})
}

// Render one frame ourselves and read pixels back: a white or black or flat-coloured canvas fails.
async function frameStats(page) {
  return page.evaluate(() => {
    const { gl, scene, camera } = window.__r3f
    gl.render(scene, camera)
    const ctx = gl.getContext()
    const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight
    const px = new Uint8Array(4)
    const seen = new Set()
    let sum = 0, n = 0
    for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) {
      ctx.readPixels(Math.floor((w * i) / 16), Math.floor((h * j) / 16), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
      seen.add(`${px[0] >> 3},${px[1] >> 3},${px[2] >> 3}`)
      sum += (px[0] + px[1] + px[2]) / 3; n++
    }
    return { colors: seen.size, mean: sum / n }
  })
}

// Scene structure: how many meshes the world has besides zombies, and which zombie ids have a mesh.
// Every zombie mesh carries userData.zombieId (id -1 is the hidden shader warmer).
async function sceneStats(page) {
  return page.evaluate(() => {
    const { scene } = window.__r3f
    let meshes = 0, zombieMeshes = 0
    const ids = new Set()
    scene.traverse((o) => {
      if (!o.isMesh) return
      meshes++
      const z = o.userData && o.userData.zombieId
      if (z !== undefined) { zombieMeshes++; ids.add(z) }
    })
    return { meshes, worldMeshes: meshes - zombieMeshes, zombieMeshIds: [...ids] }
  })
}

// Put one live zombie 1.5-4 m straight ahead of the camera, at its own floor height, and return its
// id and health. Its root group is the highest ancestor that holds no other zombie's meshes.
// Zombie.jsx moves the group again on the next frame, so the caller shoots at once.
async function placeZombieInFront(page, dist, nth) {
  return page.evaluate(([d, nth]) => {
    const { scene, camera } = window.__r3f
    const st = window.__game.getState()
    const z = st.zombies.filter((x) => !x.dying)[nth]
    if (!z) return null
    let mesh = null
    scene.traverse((o) => { if (!mesh && o.isMesh && o.userData && o.userData.zombieId === z.id) mesh = o })
    if (!mesh) return null
    const only = (root) => { let ok = true; root.traverse((o) => { if (o.isMesh && o.userData && o.userData.zombieId !== undefined && o.userData.zombieId !== z.id) ok = false }); return ok }
    let root = mesh
    while (root.parent && root.parent !== scene && only(root.parent)) root = root.parent
    const dir = camera.getWorldDirection(camera.position.clone())
    const len = Math.hypot(dir.x, dir.z) || 1
    root.position.set(camera.position.x + (dir.x / len) * d, root.position.y, camera.position.z + (dir.z / len) * d)
    root.updateMatrixWorld(true)
    return { id: z.id, type: z.type, health: z.health, locked: document.pointerLockElement === document.querySelector('canvas'), ammo: st.bulletsInClip }
  }, [dist, nth])
}

;(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (!IGNORED_ERRORS.some((re) => re.test(t))) errors.push('console.error: ' + t)
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  const G = (fn, arg) => page.evaluate(fn, arg)
  const phase = () => G(() => window.__game.getState().phase)

  try {
    // 1. Boot: the start menu renders (not a white screen).
    await page.goto(`${base}/?lofi=0&gov=0`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="menu-play"]', { timeout: 60000 })
    const rootKids = await G(() => document.getElementById('root')?.children.length ?? 0)
    const bodyText = await G(() => document.body.innerText.trim().length)
    check(rootKids > 0 && bodyText > 0, `start menu rendered (root children ${rootKids}, text chars ${bodyText})`)
    await shot(page, '1-menu')

    // 2. Start a run through the real Play button.
    await page.click('[data-testid="menu-play"]')
    await page.waitForFunction(() => window.__game.getState().phase !== 'start', null, { timeout: 30000 })
    check((await phase()) === 'intermission', `Play starts a run (phase ${await phase()})`)

    // 3. Skip the first intermission: wave 1 spawns.
    await G(() => window.__game.getState().skipIntermission())
    await page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 120000 })
    const wave1 = await G(() => { const s = window.__game.getState(); return { wave: s.wave, zombies: s.zombies.length, pending: s.pendingSpawns.length } })
    check(wave1.wave === 1 && wave1.zombies > 0, `wave 1 is playing with ${wave1.zombies} zombies (+${wave1.pending} queued)`)
    await G(() => window.__game.setState({ hp: 1e6, maxHp: 1e6 }))   // zombies must not end the run
    await page.waitForTimeout(1500)
    const f = await frameStats(page)
    check(f.colors >= 4 && f.mean > 0.5 && f.mean < 250, `frame is not blank (${f.colors} distinct colours, mean brightness ${f.mean.toFixed(0)})`)
    await shot(page, '2-wave1')


    // 3b. Scene structure: an empty cabin or a missing ZombieManager must fail, even though the
    //     store-driven steps below would still pass. (Arena null: ~1,500 -> ~0 world meshes.)
    const liveIds = await G(() => window.__game.getState().zombies.filter((z) => !z.dying).map((z) => z.id))
    await page.waitForFunction((ids) => {
      const have = new Set(); window.__r3f.scene.traverse((o) => { if (o.isMesh && o.userData && o.userData.zombieId !== undefined) have.add(o.userData.zombieId) })
      return ids.every((i) => have.has(i))
    }, liveIds, { timeout: 20000 }).catch(() => {})
    const sc = await sceneStats(page)
    check(sc.worldMeshes >= MIN_WORLD_MESHES, `cabin and world are in the scene (${sc.worldMeshes} non-zombie meshes, need >= ${MIN_WORLD_MESHES})`)
    const missing = liveIds.filter((id) => !sc.zombieMeshIds.includes(id))
    check(liveIds.length > 0 && missing.length === 0, `every live zombie has meshes in the scene (${liveIds.length} live, missing ids: ${missing.join(',') || 'none'})`)

    // 3c. A real shot: click the canvas (the first click takes pointer lock, the second fires),
    //     then a click on a zombie put in the crosshair must damage it through Player.jsx's raycast.
    await page.mouse.click(640, 360)
    const locked = await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'), null, { polling: 100, timeout: 10000 }).then(() => true, () => false)
    check(locked, 'a click on the canvas takes pointer lock')
    const ammo0 = await G(() => window.__game.getState().bulletsInClip)
    await page.mouse.click(640, 360)
    const fired = await page.waitForFunction((n) => window.__game.getState().bulletsInClip < n, ammo0, { polling: 100, timeout: 20000 }).then(() => true, () => false)
    check(fired, `a click fires: bulletsInClip ${ammo0} -> ${await G(() => window.__game.getState().bulletsInClip)}`)
    // Zombie.jsx moves a placed zombie on its next frame, so a click that lands after a frame misses:
    // retry with other distances and other zombies.
    let hitInfo = null
    const tried = []
    for (const [d, nth] of [[3, 0], [2.5, 1], [3, 2], [2, 3], [3.5, 0], [2.5, 4], [3, 1], [2, 2]]) {
      const placed = await placeZombieInFront(page, d, nth)
      if (!placed) continue
      await page.mouse.click(640, 360)
      await page.waitForTimeout(250)
      const after = await G((id) => { const z = window.__game.getState().zombies.find((x) => x.id === id); return z ? { health: z.health, dying: !!z.dying } : null }, placed.id)
      tried.push(`#${placed.id}(${placed.type}) d${d} lock=${placed.locked} ammo=${placed.ammo} hp ${placed.health}->${after ? after.health : '?'}`)
      if (after && (after.dying || after.health < placed.health)) { hitInfo = { id: placed.id, before: placed.health, after, dist: d }; break }
    }
    check(!!hitInfo, hitInfo ? `a shot at a zombie in the crosshair hit it: #${hitInfo.id} health ${hitInfo.before} -> ${hitInfo.after.health}${hitInfo.after.dying ? ' (killed)' : ''} (attempt ${tried.length})` : `a shot at a zombie in the crosshair hit it (attempts: ${tried.join('; ')})`)

    // 4. Kill one zombie and see the kill counted.
    const k0 = await G(() => window.__game.getState().kills)
    const victim = await G(() => {
      const st = window.__game.getState()
      const z = st.zombies.find((x) => !x.dying)
      for (let i = 0; i < 12 && !window.__game.getState().zombies.find((x) => x.id === z.id)?.dying; i++) st.hitZombie(z.id, true)
      return z.id
    })
    const k1 = await G(() => window.__game.getState().kills)
    check(k1 === k0 + 1, `killed zombie #${victim}: kills ${k0} -> ${k1}`)

    // 5. Clear the wave: kill everything, including queued spawns as they slot in.
    const deadline = Date.now() + 180000
    while (Date.now() < deadline && (await phase()) === 'playing') {
      await G(() => {
        for (const z of window.__game.getState().zombies) {
          if (!z.dying) for (let i = 0; i < 12; i++) { window.__game.getState().hitZombie(z.id, true); if (window.__game.getState().zombies.find((x) => x.id === z.id)?.dying) break }
        }
      })
      await page.waitForTimeout(500)
    }
    const afterClear = await phase()
    check(afterClear === 'wave_clear' || afterClear === 'intermission', `wave 1 cleared (phase ${afterClear})`)
    if (afterClear === 'wave_clear') await shot(page, '3-wave-clear')

    // 6. The wave-clear card hands over to wave 2's intermission by itself (about 3 s).
    await page.waitForFunction(() => window.__game.getState().phase === 'intermission' && window.__game.getState().wave === 2, null, { timeout: 90000 })
    const w2 = await G(() => { const s = window.__game.getState(); return { wave: s.wave, money: s.money, kills: s.kills } })
    check(w2.wave === 2, `reached wave 2 (money ${w2.money}, kills ${w2.kills})`)
    await shot(page, '4-wave2-intermission')

    // 7. Wave 2 starts too. (No modifier: a random Blackout would make the brightness check flaky.)
    await G(() => { window.__game.setState({ waveModifier: null }); window.__game.getState().skipIntermission() })
    await page.waitForFunction(() => window.__game.getState().phase === 'playing' && window.__game.getState().wave === 2, null, { timeout: 120000 })
    check(true, 'wave 2 is playing')
    const f2 = await frameStats(page)
    check(f2.colors >= 4 && f2.mean > 0.5 && f2.mean < 250, `wave 2 frame is not blank (${f2.colors} distinct colours, mean ${f2.mean.toFixed(0)})`)
    await shot(page, '5-wave2')
  } catch (e) {
    failures.push('script error: ' + (e && e.message ? e.message.split('\n')[0] : e))
    log('ERROR ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e))
    await shot(page, 'failure')
  }

  check(errors.length === 0, errors.length === 0 ? 'no console errors or page errors' : `${errors.length} console/page error(s)`)
  for (const e of errors.slice(0, 10)) log('  ' + e.slice(0, 300))

  await browser.close()
  if (failures.length) { console.log(`\nSMOKE FAILED (${failures.length}): ` + failures.join('; ')); process.exit(1) }
  console.log('\nSMOKE OK')
})().catch((e) => { console.error(e); process.exit(1) })
