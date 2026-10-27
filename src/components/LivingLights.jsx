import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WINDOW_DEFS } from '../maps/cabin'
import { weather, FX_OFF } from '../weather'

// Cabin lights that misbehave + static moonbeams with drifting dust.
// The Arena's existing point lights register themselves in `lightReg` (callback
// refs); this component's ONE useFrame animates them (fireplace flicker, a
// sputtering ceiling bulb, boss blackout) and the dust motes. No lights,
// shadow casters or per-frame allocations are added.

export const lightReg = {
  fire: null, fire2: null, main: null, bed: null, hall: null, kitchen: null, chest: null, amb: null,
}
const KEYS = ['fire', 'fire2', 'main', 'bed', 'hall', 'kitchen', 'chest', 'amb']

// Dev/tuning constants
const BULB_GAP = [5, 14]          // seconds between ceiling-bulb sputters
const BULB_LEN = [0.25, 0.75]     // length of a sputter
const BLACKOUT_S = 2              // all interior lights dead
const BLACKOUT_FADE_S = 1.2       // ...then come back
const BLACKOUT_FLOOR = 0.03
const AMB_BLACKOUT = 0.25         // ambient fill keeps this fraction during the blackout

// Beam shape in window-local space (x along wall, y up, z into the room).
const WIN_HALF = 1.0
const WIN_Y0 = 0.5
const WIN_Y1 = 2.0
const BEAM_LEN = 2.6
const SHEAR_X = 0.35              // sideways drift per unit of depth
const SHEAR_Y = 0.9               // drop per unit of depth (~42 deg)
const MOTES_PER_BEAM = 22
const BEAM_GAIN = 0.4              // overall moonbeam brightness (tune)

const WALL_ROT = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }
// Moon sits north-west of the cabin, so only N and W windows let light in.
const BEAM_WINDOWS = WINDOW_DEFS.filter((w) => w.wall === 'N' || w.wall === 'W')

// Cheap deterministic noise, no allocations.
function hash(k) {
  const s = Math.sin(k * 12.9898) * 43758.5453
  return s - Math.floor(s)
}
function smooth(x) { return Math.sin(x * 1.7) * Math.sin(x * 2.9 + 1.3) }

// Shared beam geometry: the window rectangle swept along the light direction,
// vertex colours fade to black at the far end (additive => fades out).
let _beamGeo = null
function getBeamGeo() {
  if (_beamGeo) return _beamGeo
  // Three rings along the sweep: faint at the window, brightest just inside, black at the far end.
  const RINGS = [{ f: 0, k: 0.25 }, { f: 0.3, k: 1 }, { f: 1, k: 0 }]
  const pos = []
  const col = []
  for (const r of RINGS) {
    const z = BEAM_LEN * r.f, dx = SHEAR_X * z, dy = -SHEAR_Y * z
    for (const [x, y] of [[-WIN_HALF, WIN_Y0], [WIN_HALF, WIN_Y0], [WIN_HALF, WIN_Y1], [-WIN_HALF, WIN_Y1]]) {
      pos.push(x + dx, y + dy, z)
      col.push(0.035 * r.k * BEAM_GAIN, 0.05 * r.k * BEAM_GAIN, 0.09 * r.k * BEAM_GAIN)
    }
  }
  const idx = []
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    const a = ring * 4, b = (ring + 1) * 4
    for (let e = 0; e < 4; e++) {
      const e2 = (e + 1) % 4
      idx.push(a + e, a + e2, b + e2, a + e, b + e2, b + e)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  _beamGeo = g
  return g
}

let _beamMat = null
function getBeamMat() {
  if (!_beamMat) {
    _beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    })
  }
  return _beamMat
}

let _patchMat = null
function getPatchMat() {
  if (!_patchMat) {
    _patchMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.02 * BEAM_GAIN, 0.03 * BEAM_GAIN, 0.06 * BEAM_GAIN), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    })
  }
  return _patchMat
}

function Moonbeams() {
  const geo = getBeamGeo()
  const mat = getBeamMat()
  const patchMat = getPatchMat()
  const patchDepth = (WIN_Y1 - WIN_Y0) / SHEAR_Y
  const patchZ = ((WIN_Y0 + WIN_Y1) / 2) / SHEAR_Y
  const patchX = SHEAR_X * patchZ
  return (
    <group>
      {BEAM_WINDOWS.map((w) => (
        <group key={w.id} position={[w.winX, 0, w.winZ]} rotation={[0, WALL_ROT[w.wall], 0]}>
          <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />
          <mesh position={[patchX, 0.015, patchZ]} rotation={[-Math.PI / 2, 0, 0]} material={patchMat} renderOrder={5}>
            <planeGeometry args={[WIN_HALF * 2, patchDepth]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Dust({ objRef }) {
  const data = useMemo(() => {
    const n = BEAM_WINDOWS.length * MOTES_PER_BEAM
    const base = new Float32Array(n * 3)
    const phase = new Float32Array(n * 3)
    let k = 0
    for (const w of BEAM_WINDOWS) {
      const th = WALL_ROT[w.wall]
      const c = Math.cos(th), s = Math.sin(th)
      for (let i = 0; i < MOTES_PER_BEAM; i++, k++) {
        const z = 0.15 + Math.random() * (BEAM_LEN * 0.8)
        const lx = (Math.random() * 2 - 1) * WIN_HALF + SHEAR_X * z
        let ly = WIN_Y0 + Math.random() * (WIN_Y1 - WIN_Y0) - SHEAR_Y * z
        if (ly < 0.15) ly = 0.15 + Math.random() * 0.5
        base[k * 3] = w.winX + lx * c + z * s
        base[k * 3 + 1] = ly
        base[k * 3 + 2] = w.winZ - lx * s + z * c
        phase[k * 3] = Math.random() * 6.28
        phase[k * 3 + 1] = Math.random() * 6.28
        phase[k * 3 + 2] = Math.random() * 6.28
      }
    }
    return { n, base, phase, pos: new Float32Array(base) }
  }, [])

  // Handed to the single useFrame in LivingLights via objRef.
  return (
    <points ref={(o) => { objRef.current = o; if (o) o.userData.dust = data }} frustumCulled={false} renderOrder={6}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={data.pos} count={data.n} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        color="#a9bde6" size={0.035} sizeAttenuation transparent opacity={0.7}
        blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false}
      />
    </points>
  )
}

export default function LivingLights() {
  const dustObj = useRef(null)
  const bulbNext = useRef(4 + Math.random() * 6)
  const bulbEnd = useRef(0)
  const bulbSeed = useRef(Math.random() * 100)

  useFrame(() => {
    const t = performance.now() / 1000

    // ── ceiling bulb sputter (random brief dips) ──
    if (t > bulbNext.current) {
      bulbEnd.current = t + BULB_LEN[0] + Math.random() * (BULB_LEN[1] - BULB_LEN[0])
      bulbNext.current = bulbEnd.current + BULB_GAP[0] + Math.random() * (BULB_GAP[1] - BULB_GAP[0])
      bulbSeed.current = Math.random() * 100
    }
    let bulb = 1
    if (t < bulbEnd.current) bulb = hash(Math.floor(t * 26) + bulbSeed.current) < 0.55 ? 0.08 : 0.9

    // ── boss blackout multiplier ──
    const bt = t - weather.bossAt
    let black = 1
    if (bt >= 0 && bt < BLACKOUT_S + BLACKOUT_FADE_S) {
      if (bt < BLACKOUT_S) {
        black = hash(Math.floor(bt * 18)) > 0.82 ? 0.35 : BLACKOUT_FLOOR
      } else {
        const u = (bt - BLACKOUT_S) / BLACKOUT_FADE_S
        black = BLACKOUT_FLOOR + (1 - BLACKOUT_FLOOR) * u * u * (3 - 2 * u)
      }
    }

    // ── fireplace flicker: sines + noise ──
    const fire = 1 + 0.10 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 17.3 + 2) + 0.14 * smooth(t * 4.2)
    const fire2 = 1 + 0.12 * Math.sin(t * 11.7 + 1) + 0.07 * Math.sin(t * 21.1) + 0.16 * smooth(t * 5.3 + 9)

    for (let i = 0; i < KEYS.length; i++) {
      const l = lightReg[KEYS[i]]
      if (!l) continue
      if (l.userData.baseI === undefined) l.userData.baseI = l.intensity
      let m = black
      if (i === 0) m *= fire
      else if (i === 1) m *= fire2
      else if (i === 2) m *= bulb
      else if (i === 7) m = AMB_BLACKOUT + (1 - AMB_BLACKOUT) * black // ambient only partly dies
      l.intensity = l.userData.baseI * m
    }

    // ── dust motes ──
    const pts = dustObj.current
    if (pts) {
      const d = pts.userData.dust
      const p = d.pos, b = d.base, ph = d.phase
      for (let k = 0; k < d.n; k++) {
        const j = k * 3
        p[j] = b[j] + Math.sin(t * 0.21 + ph[j]) * 0.16
        p[j + 1] = b[j + 1] + Math.sin(t * 0.17 + ph[j + 1]) * 0.12
        p[j + 2] = b[j + 2] + Math.sin(t * 0.19 + ph[j + 2]) * 0.16
      }
      pts.geometry.attributes.position.needsUpdate = true
    }
  })

  if (FX_OFF) return null
  return (
    <>
      <Moonbeams />
      <Dust objRef={dustObj} />
    </>
  )
}
