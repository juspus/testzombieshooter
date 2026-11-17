// Perf budget: a fixed probe, so the numbers in CLAUDE.md stop drifting unnoticed.
//
// Headless Chromium (SwiftShader) at 1280x720, ?wave=8&lofi=0&gov=0, wave 8 started and waited
// until 25 zombies are alive. The world is then paused (store `paused`, so zombies and the camera
// hold still) and ONE frame is rendered by hand with gl.info.autoReset = false:
//   draws, triangles (shadow pass included), scene nodes, meshes, castShadow meshes, lights (total
//   and visible), shader programs. Programs are read again after a real shot (click on the canvas)
//   and after swapping through every weapon, and the highest reading is budgeted: a gun or muzzle
//   material that compiles on first use shows up there.
// The light limits are exact: CLAUDE.md fixes the light count (a changed count recompiles every lit shader).
// To keep the single frame stable the probe is taken three times and the highest value of each
// metric is kept (all samples are in the JSON). The main JS chunk's gzip size comes from the last
// `vite build` in dist/ (run `npx vite build` first).
//
// Limits live in scripts/perf-budget.json. Any value above its limit exits 1 and names the metric.
// Needs a Vite dev server (or a non-production build): window.__game / window.__r3f only exist there.
//
// Usage: node scripts/perf-budget.cjs <baseUrl> [--out result.json] [--limits scripts/perf-budget.json] [--dist dist]
//   e.g. node scripts/perf-budget.cjs http://localhost:5173 --out /tmp/perf-budget-result.json
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const base = (args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'http://localhost:5173').replace(/\/$/, '')
const outPath = flag('--out', path.join(os.tmpdir(), 'perf-budget-result.json'))
const limitsPath = flag('--limits', path.join(__dirname, 'perf-budget.json'))
const distDir = flag('--dist', path.join(__dirname, '..', 'dist'))

const T0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s] ${m}`)

// The entry chunk of the last build: the script tag in dist/index.html, gzipped.
function mainChunkGzipKB() {
  const html = path.join(distDir, 'index.html')
  if (!fs.existsSync(html)) throw new Error(`no ${html}: run "npx vite build" first`)
  const m = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(fs.readFileSync(html, 'utf8'))
  if (!m) throw new Error('no module script in dist/index.html')
  const file = path.join(distDir, m[1].replace(/^\//, ''))
  const gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length
  return { file: path.basename(file), kB: gz / 1000 }
}

async function measureFrame(page) {
  return page.evaluate(() => {
    const { gl, scene, camera } = window.__r3f
    gl.info.autoReset = false
    gl.info.reset()
    gl.render(scene, camera)   // one frame: main pass plus the shadow pass
    const calls = gl.info.render.calls
    const triangles = gl.info.render.triangles
    gl.info.autoReset = true
    let nodes = 0, meshes = 0, casters = 0, lightsTotal = 0, lightsVisible = 0
    scene.traverse((o) => {
      nodes++
      if (o.isMesh) { meshes++; if (o.castShadow) casters++ }
      if (o.isLight) lightsTotal++
    })
    scene.traverseVisible((o) => { if (o.isLight) lightsVisible++ })   // what three.js counts for shaders
    let liveZombies = 0
    for (const z of window.__game.getState().zombies) if (!z.dying) liveZombies++
    return { draws: calls, triangles, nodes, meshes, castShadowMeshes: casters, lightsTotal, lightsVisible, programs: gl.info.programs.length, liveZombies }
  })
}

;(async () => {
  const bundle = mainChunkGzipKB()
  log(`main chunk ${bundle.file}: ${bundle.kB.toFixed(1)} kB gzip`)

  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  page.on('pageerror', (e) => log('pageerror ' + e.message))
  const G = (fn, a) => page.evaluate(fn, a)

  await page.goto(`${base}/?wave=8&lofi=0&gov=0`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="menu-play"]', { timeout: 60000 })
  await page.click('[data-testid="menu-play"]')
  await page.waitForFunction(() => window.__game.getState().phase === 'intermission', null, { timeout: 30000 })
  const wave = await G(() => window.__game.getState().wave)
  if (wave !== 8) throw new Error(`expected wave 8, got ${wave} (are debug params disabled in this build?)`)
  await G(() => { window.__game.setState({ hp: 1e6, maxHp: 1e6 }); window.__game.getState().skipIntermission() })
  await page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 120000 })

  // Wait until 25 zombies are alive (wave 8 has 26: the cap is 25 at once).
  await page.waitForFunction(() => window.__game.getState().zombies.filter((z) => !z.dying).length >= 25, null, { timeout: 120000 })
  log('25 zombies alive, settling')
  await page.waitForTimeout(3000)   // let every zombie mount and compile (shader programs settle)
  await G(() => window.__game.setState({ paused: true }))   // freeze zombies and camera for a stable frame
  await page.waitForTimeout(1000)

  const samples = []
  for (let i = 0; i < 3; i++) { samples.push(await measureFrame(page)); await page.waitForTimeout(300) }
  // Then a real shot and a swap through every weapon, reading the program count after each step.
  const programReadings = [...samples.map((s) => s.programs)]
  const readPrograms = async (label) => { await page.waitForTimeout(800); const n = await G(() => window.__r3f.gl.info.programs.length); programReadings.push(n); log(`programs after ${label}: ${n}`) }
  await G(() => window.__game.setState({ paused: false, ownedWeapons: ['pistol', 'shotgun', 'ak47', 'deagle'] }))
  await page.mouse.click(640, 360)   // takes pointer lock
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'), null, { polling: 100, timeout: 10000 }).catch(() => {})
  const ammo0 = await G(() => window.__game.getState().bulletsInClip)
  await page.mouse.click(640, 360)   // fires
  await page.waitForFunction((n) => window.__game.getState().bulletsInClip < n, ammo0, { polling: 100, timeout: 20000 }).catch(() => log('warning: the shot did not fire'))
  await readPrograms('a shot')
  for (const w of ['shotgun', 'ak47', 'deagle', 'pistol']) {
    await G((x) => window.__game.getState().switchWeapon(x), w)
    await readPrograms('switching to ' + w)
  }
  const keys = ['draws', 'triangles', 'nodes', 'meshes', 'castShadowMeshes', 'lightsTotal', 'lightsVisible', 'programs']
  const measured = {}
  for (const k of keys) measured[k] = Math.max(...samples.map((s) => s[k]))
  measured.programs = Math.max(...programReadings)
  measured.mainChunkGzipKB = Math.round(bundle.kB * 10) / 10
  const live = Math.min(...samples.map((s) => s.liveZombies))
  await browser.close()

  const limits = JSON.parse(fs.readFileSync(limitsPath, 'utf8'))
  const rows = []
  const breaches = []
  for (const k of [...keys, 'mainChunkGzipKB']) {
    const limit = limits[k]
    const over = typeof limit === 'number' && measured[k] > limit
    if (over) breaches.push(k)
    rows.push({ metric: k, value: measured[k], limit: limit ?? null, ok: !over })
  }
  const result = { when: new Date().toISOString(), url: base, wave, liveZombies: live, mainChunk: bundle.file, measured, limits, samples, breaches }
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))

  console.log(`\nperf budget (wave ${wave}, ${live} live zombies, 1280x720, one frame, max of ${samples.length} samples; programs: max of ${programReadings.length} readings incl. after a shot and weapon swaps)`)
  console.log('  metric             value      limit')
  for (const r of rows) console.log(`  ${r.metric.padEnd(18)} ${String(r.value).padStart(8)}  ${String(r.limit ?? '-').padStart(8)}  ${r.ok ? 'ok' : 'OVER'}`)
  console.log(`result written to ${outPath}`)
  if (live < 25) { console.log('\nPERF BUDGET FAILED: fewer than 25 live zombies in the probe frame (' + live + ')'); process.exit(1) }
  if (breaches.length) {
    console.log('\nPERF BUDGET FAILED: over the limit: ' + breaches.map((k) => `${k} ${measured[k]} > ${limits[k]}`).join(', '))
    process.exit(1)
  }
  console.log('\nPERF BUDGET OK')
})().catch((e) => { console.error('perf-budget error: ' + (e && e.message ? e.message : e)); process.exit(1) })
