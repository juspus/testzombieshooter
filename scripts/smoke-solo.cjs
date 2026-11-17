// Solo smoke test: the game boots, a run starts, a zombie dies, wave 1 clears and wave 2 begins.
// Fails (exit 1) on any console error, uncaught page error, or a blank (white/black) frame.
// Needs a Vite dev server (or a non-production build served by `vite preview`): the script
// reads window.__game and window.__r3f, which only exist outside production builds.
// No PeerJS server and no network are needed; failed network requests are not errors here.
//
// Usage: node scripts/smoke-solo.cjs <baseUrl> [shotDir] [--prove-world-check]
//   e.g. node scripts/smoke-solo.cjs http://localhost:5173 /tmp/smoke
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const posArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const base = (posArgs[0] || 'http://localhost:5173').replace(/\/$/, '')
const shotDir = posArgs[1] || null
if (shotDir) fs.mkdirSync(shotDir, { recursive: true })

const T0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s] ${m}`)
const failures = []
const check = (cond, msg) => { log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures.push(msg) }

// Console errors that are about the sandbox/CI having no network, not about the game.
// The cabin's static geometry is baked at mount (src/staticMerge.js): ~890 parts become ~49 merged meshes,
// each tagged userData.merged = number of parts it holds. The world check looks for that bake instead of a raw
// mesh count (the rest of the scene, pooled FX meshes and the like, is ~490 meshes with or without a cabin):
// enough merged meshes, enough merged parts, and merged SHADOW CASTERS (the wall slabs). Floors sit well below
// today's values (see the numbers printed by the check) and far above an empty or missing Arena (0).
const MIN_WORLD_MESHES = 400
const MIN_BAKED_MESHES = 30
const MIN_BAKED_PARTS = 600
const MIN_BAKED_CASTER_PARTS = 30
const PROVE_WORLD_CHECK = process.argv.includes('--prove-world-check')   // remove the cabin and expect the check to fail

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
    let meshes = 0, zombieMeshes = 0, bakedMeshes = 0, bakedParts = 0, bakedCasterParts = 0
    const ids = new Set()
    scene.traverse((o) => {
      if (!o.isMesh) return
      meshes++
      const z = o.userData && o.userData.zombieId
      if (z !== undefined) { zombieMeshes++; ids.add(z) }
      const parts = o.userData && o.userData.merged
      if (parts) { bakedMeshes++; bakedParts += parts; if (o.castShadow) bakedCasterParts += parts }
    })
    return { meshes, worldMeshes: meshes - zombieMeshes, bakedMeshes, bakedParts, bakedCasterParts, zombieMeshIds: [...ids] }
  })
}

// What must be in the scene for the cabin to count as present. Returns the list of problems (empty = fine).
function worldProblems(sc) {
  const p = []
  if (sc.worldMeshes < MIN_WORLD_MESHES) p.push(`${sc.worldMeshes} non-zombie meshes, need >= ${MIN_WORLD_MESHES}`)
  if (sc.bakedMeshes < MIN_BAKED_MESHES) p.push(`${sc.bakedMeshes} baked cabin meshes, need >= ${MIN_BAKED_MESHES}`)
  if (sc.bakedParts < MIN_BAKED_PARTS) p.push(`${sc.bakedParts} baked cabin parts, need >= ${MIN_BAKED_PARTS}`)
  if (sc.bakedCasterParts < MIN_BAKED_CASTER_PARTS) p.push(`${sc.bakedCasterParts} baked shadow-casting wall parts, need >= ${MIN_BAKED_CASTER_PARTS}`)
  return p
}
const worldText = (sc) => `${sc.worldMeshes} non-zombie meshes, ${sc.bakedMeshes} baked meshes holding ${sc.bakedParts} cabin parts (${sc.bakedCasterParts} casting)`

// Put one live zombie on the crosshair ray, `dist` m ahead horizontally (root y = body centre = the ray's
// height there), and return its id and health. Following the ray makes the shot independent of where the
// camera looks: taking pointer lock with a real click can turn the camera by a random amount (the click's
// mouse move is read as look movement), up to the +-60 degree pitch clamp. The zombie's root group is the
// highest ancestor that holds no other zombie's meshes. Zombie.jsx moves the group again on the next
// frame, so the caller shoots at once.
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
    root.position.set(camera.position.x + (dir.x / len) * d, camera.position.y + (dir.y / len) * d, camera.position.z + (dir.z / len) * d)
    root.updateMatrixWorld(true)
    return { id: z.id, type: z.type, health: z.health, locked: document.pointerLockElement === document.querySelector('canvas'), ammo: st.bulletsInClip, pitch: Math.round(Math.asin(dir.y) * 100) / 100, cam: [camera.position.x, camera.position.y, camera.position.z].map((v) => Math.round(v * 10) / 10) }
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
    //     store-driven steps below would still pass. (Arena null: 0 baked cabin meshes; `--prove-world-check` shows it.)
    const liveIds = await G(() => window.__game.getState().zombies.filter((z) => !z.dying).map((z) => z.id))
    await page.waitForFunction((ids) => {
      const have = new Set(); window.__r3f.scene.traverse((o) => { if (o.isMesh && o.userData && o.userData.zombieId !== undefined) have.add(o.userData.zombieId) })
      return ids.every((i) => have.has(i))
    }, liveIds, { timeout: 20000 }).catch(() => {})
    const sc = await sceneStats(page)
    const prob = worldProblems(sc)
    check(prob.length === 0, `cabin and world are in the scene (${worldText(sc)})` + (prob.length ? ': ' + prob.join('; ') : ''))
    if (PROVE_WORLD_CHECK) {
      // Self-check: take the cabin out of the scene and the same check has to fail.
      await G(() => {
        const { scene } = window.__r3f
        const arena = []
        scene.traverse((o) => { if (o.isMesh && o.userData && o.userData.merged) { let t = o; while (t.parent && t.parent !== scene) t = t.parent; if (!arena.includes(t)) arena.push(t) } })
        for (const t of arena) scene.remove(t)
      })
      const gone = await sceneStats(page)
      const goneProb = worldProblems(gone)
      log(`cabin removed: ${worldText(gone)}`)
      check(goneProb.length > 0, `world check FAILS with the cabin removed (${goneProb.join('; ')})`)
      await browser.close()
      console.log(goneProb.length > 0 ? '\nPROVE OK: the world check notices a missing cabin' : '\nPROVE FAILED: the world check passed without a cabin')
      process.exit(goneProb.length > 0 && failures.length === 0 ? 0 : 1)
    }
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
      tried.push(`#${placed.id}(${placed.type}) d${d} lock=${placed.locked} ammo=${placed.ammo} pitch=${placed.pitch} cam=${placed.cam} hp ${placed.health}->${after ? after.health : '?'}`)
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

    // 7. Wave 2 starts too (no modifier, so a random Blackout cannot change what it looks like).
    await G(() => { window.__game.setState({ waveModifier: null }); window.__game.getState().skipIntermission() })
    await page.waitForFunction(() => window.__game.getState().phase === 'playing' && window.__game.getState().wave === 2, null, { timeout: 120000 })
    check(true, 'wave 2 is playing')
    // Not a brightness check here: the camera may look at the roof after the clicks above.
    const sc2 = await sceneStats(page)
    const prob2 = worldProblems(sc2)
    check(prob2.length === 0, `wave 2 scene is intact (${worldText(sc2)})` + (prob2.length ? ': ' + prob2.join('; ') : ''))
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
