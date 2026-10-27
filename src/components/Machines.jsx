import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { getMap, getInitialMapId } from '../maps'
import { texBoxProps } from '../textures'
import * as WR from '../weaponRules'
import { send, isConnected } from '../net'
import { boxSpot, benchSpot } from '../machineInput'
import { playBoxCycle, playBoxJingle, playBoxTeddy, playBenchWork, playBenchDone } from '../sounds'
import { PistolModel, AKModel, DeagleModel, ShotgunModel, FlamethrowerModel, CrossbowModel, plainGunMat, upgradedGunMat } from './Gun'
import Bolts from './Bolts'

// Wave 3 props: Mystery Box (moves between open rooms) + Upgrade Bench. Everything is
// always-mounted; animation is ref mutation in one useFrame each. Glow = meshBasicMaterial
// (no lights, no shadows). Materials / geometry are module-level and shared.
const ANCHORS = getMap(getInitialMapId()).ROOM_ANCHORS ?? {}
const SHOW_IDS = ['pistol', 'shotgun', 'ak47', 'deagle', 'flamethrower', 'crossbow']

const _glowGold = new THREE.MeshBasicMaterial({ color: '#ffcf4a', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
const _glowCyan = new THREE.MeshBasicMaterial({ color: '#2fd8ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
const _innerGold = new THREE.MeshBasicMaterial({ color: '#d9a52e' })
const _runeCyan = new THREE.MeshBasicMaterial({ color: '#58e6ff' })
const _beamGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.5, 14, 1, true)   // thin: it sits right in front of the player's face
const _quadGeo = new THREE.PlaneGeometry(1.0, 0.5)
const _bear = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.95 })
const _bearDark = new THREE.MeshStandardMaterial({ color: '#2a1a0e', roughness: 0.9 })
const _ballGeo = new THREE.SphereGeometry(1, 10, 8)

function faceCenter(room, spot) {
  const c = ANCHORS[room]
  return c && spot ? Math.atan2(c.x - spot.x, c.z - spot.z) : 0
}

// All six weapon models, hidden except the one the parent shows (visible toggling only:
// they use the same MeshStandardMaterial program as the rest of the scene, so no shader stall).
function Showcase({ upgraded, api, scale = 1.5 }) {
  const pump = useRef()
  const gm = upgraded ? upgradedGunMat : plainGunMat
  return (
    <>
      {SHOW_IDS.map((w) => (
        <group key={w} ref={(el) => (api.current[w] = el)} visible={false} scale={scale}>
          {w === 'pistol' && <PistolModel gunMat={gm} />}
          {w === 'shotgun' && <ShotgunModel gunMat={gm} pumpRef={pump} />}
          {w === 'ak47' && <AKModel gunMat={gm} />}
          {w === 'deagle' && <DeagleModel gunMat={gm} />}
          {w === 'flamethrower' && <FlamethrowerModel gunMat={gm} />}
          {w === 'crossbow' && <CrossbowModel gunMat={gm} />}
        </group>
      ))}
    </>
  )
}

function showOnly(api, id) {
  for (const w of SHOW_IDS) { const g = api.current[w]; if (g) g.visible = w === id }
}

function Teddy() {
  const part = (p, s, m = _bear, k) => <mesh key={k} geometry={_ballGeo} material={m} position={p} scale={s} />
  return (
    <group scale={0.9}>
      {part([0, 0, 0], [0.2, 0.22, 0.17], _bear, 'b')}
      {part([0, 0.3, 0], [0.15, 0.14, 0.14], _bear, 'h')}
      {part([-0.11, 0.42, 0], [0.05, 0.05, 0.04], _bear, 'e1')}
      {part([0.11, 0.42, 0], [0.05, 0.05, 0.04], _bear, 'e2')}
      {part([0, 0.28, 0.13], [0.06, 0.045, 0.05], _bear, 'sn')}
      {part([-0.05, 0.33, 0.125], [0.02, 0.02, 0.02], _bearDark, 'ey1')}
      {part([0.05, 0.33, 0.125], [0.02, 0.02, 0.02], _bearDark, 'ey2')}
      {part([0, 0.285, 0.17], [0.02, 0.016, 0.016], _bearDark, 'no')}
      {part([-0.24, 0.05, 0.02], [0.07, 0.12, 0.07], _bear, 'a1')}
      {part([0.24, 0.05, 0.02], [0.07, 0.12, 0.07], _bear, 'a2')}
      {part([-0.1, -0.24, 0.04], [0.08, 0.1, 0.09], _bear, 'l1')}
      {part([0.1, -0.24, 0.04], [0.08, 0.1, 0.09], _bear, 'l2')}
    </group>
  )
}

// Static structure of the Mystery Box (also used by the model playground).
export function BoxMesh({ lid, beam, glow, show, teddy, api }) {
  return (
    <>
      {/* Crate body */}
      <mesh position={[0, 0.3, 0]} {...texBoxProps([1.1, 0.6, 0.62], 'wood', '#3c2812')} />
      {/* Metal bands + corner plates */}
      <mesh position={[-0.35, 0.3, 0]} {...texBoxProps([0.08, 0.62, 0.64], 'metal', '#7a7f86', 0.5, 0.6)} />
      <mesh position={[0.35, 0.3, 0]} {...texBoxProps([0.08, 0.62, 0.64], 'metal', '#7a7f86', 0.5, 0.6)} />
      <mesh position={[0, 0.02, 0]} {...texBoxProps([1.14, 0.06, 0.66], 'metal', '#55595f', 0.6, 0.5)} />
      {/* Glowing interior (visible once the lid is open) */}
      <mesh ref={glow} position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={_quadGeo} material={_innerGold} visible={false} scale={[1, 1.1, 1]} />
      {/* Lid: hinged on the back top edge */}
      <group ref={lid} position={[0, 0.6, -0.31]}>
        <mesh position={[0, 0.06, 0.31]} {...texBoxProps([1.12, 0.12, 0.64], 'wood', '#4a3016')} />
        <mesh position={[0, 0.125, 0.31]} {...texBoxProps([0.5, 0.02, 0.2], 'metal', '#c9a53a', 0.4, 0.7)} />
      </group>
      {/* Light beam — always on so the box is easy to find */}
      <mesh ref={beam} position={[0, 1.35, 0]} geometry={_beamGeo} material={_glowGold} />
      {/* Floating weapon + bear */}
      <group ref={show} visible={false} position={[0, 1, 0]}>
        <Showcase upgraded={false} api={api} />
      </group>
      <group ref={teddy} visible={false}><Teddy /></group>
    </>
  )
}

function MysteryBox() {
  const room = useGameStore((s) => s.box.room)
  const spot = boxSpot(room)
  const lid = useRef(), beam = useRef(), glow = useRef(), show = useRef(), teddy = useRef()
  const api = useRef({})
  const lidA = useRef(0)

  // Sounds follow the (net-synced) phase, so both peers hear the same thing.
  useEffect(() => useGameStore.subscribe((s, prev) => {
    const b = s.box
    if (b.phase === prev.box.phase && b.at === prev.box.at) return
    const sp = boxSpot(b.room)
    if (!sp) return
    if (b.phase === 'cycling') playBoxCycle(sp.x, 1.2, sp.z, WR.BOX_CYCLE_MS / 1000)
    else if (b.phase === 'ready') playBoxJingle(sp.x, 1.2, sp.z)
    else if (b.phase === 'teddy') playBoxTeddy(sp.x, 1.2, sp.z)
  }), [])

  useFrame(({ clock }, dt) => {
    const b = useGameStore.getState().box
    const now = performance.now()
    const el = now - b.at
    const open = b.phase !== 'idle' ? 1 : 0
    lidA.current += (open - lidA.current) * Math.min(1, dt * 8)
    if (lid.current) lid.current.rotation.x = -lidA.current * 1.9
    const t = clock.elapsedTime
    if (beam.current) {
      beam.current.material.opacity = open ? 0.07 + Math.sin(t * 6) * 0.02 : 0.03 + Math.sin(t * 2) * 0.01
      beam.current.scale.y = open ? 1.2 : 1
    }
    if (glow.current) glow.current.visible = lidA.current > 0.3

    // Floating weapon / bear
    let id = null, y = 0.9
    if (b.phase === 'cycling') {
      // swap faster at first, slowing to a stop on the result
      const k = Math.min(1, el / WR.BOX_CYCLE_MS)
      const step = 0.07 + k * k * 0.3
      const n = Math.floor(el / 1000 / step)
      id = k > 0.97 && b.result && b.result !== 'teddy' ? b.result : SHOW_IDS[n % SHOW_IDS.length]
      y = 0.8 + Math.min(1, el / 400) * 0.6
    } else if (b.phase === 'ready' && b.result && b.result !== 'teddy') {
      id = b.result
      const left = WR.BOX_TAKE_MS - el
      y = 1.4 + Math.sin(t * 3) * 0.05 - (left < 1500 ? (1 - left / 1500) * 0.8 : 0)   // sinks back when time is nearly up
    }
    showOnly(api, id)
    if (show.current) {
      show.current.visible = !!id
      show.current.position.y = y
      show.current.rotation.y = t * 1.6
    }
    if (teddy.current) {
      const on = b.phase === 'teddy'
      teddy.current.visible = on
      if (on) {
        teddy.current.position.y = 1.0 + Math.min(1, el / 400) * 0.45
        teddy.current.rotation.y = Math.sin(t * 3) * 0.6
      }
    }
  })

  if (!spot) return null
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, faceCenter(room, spot), 0]}>
      <BoxMesh lid={lid} beam={beam} glow={glow} show={show} teddy={teddy} api={api} />
    </group>
  )
}

// Static structure of the Upgrade Bench (also used by the model playground).
export function BenchMesh({ runes, ring, show, api, upg }) {
  return (
    <>
      {/* Base cabinet */}
      <mesh position={[0, 0.4, 0]} {...texBoxProps([1.3, 0.8, 0.75], 'metal', '#3c4047', 0.55, 0.55)} />
      {/* Stone top slab */}
      <mesh position={[0, 0.87, 0]} {...texBoxProps([1.5, 0.14, 0.95], 'stone', '#6b6b6b')} />
      {/* Rune panel on the front */}
      <mesh ref={runes} position={[0, 0.42, 0.385]} geometry={_quadGeo} material={_runeCyan} scale={[0.7, 0.5, 1]} />
      {/* Pillars + glowing caps */}
      <mesh position={[-0.6, 1.3, -0.3]} {...texBoxProps([0.14, 0.75, 0.14], 'stone', '#555')} />
      <mesh position={[0.6, 1.3, -0.3]} {...texBoxProps([0.14, 0.75, 0.14], 'stone', '#555')} />
      <mesh position={[-0.6, 1.72, -0.3]} geometry={_ballGeo} material={_runeCyan} scale={0.07} />
      <mesh position={[0.6, 1.72, -0.3]} geometry={_ballGeo} material={_runeCyan} scale={0.07} />
      {/* Glow column over the slab while working */}
      <mesh ref={ring} position={[0, 1.4, 0]} geometry={_beamGeo} material={_glowCyan} scale={[0.9, 0.7, 0.9]} visible={false} />
      <group ref={show} visible={false} position={[0, 1.1, 0]}>
        <Showcase upgraded={upg} api={api} scale={1.3} />
      </group>
    </>
  )
}

function UpgradeBench() {
  const spot = benchSpot()
  const room = Object.keys(ANCHORS).find((r) => ANCHORS[r].bench === spot) ?? 'main'
  const api = useRef({})
  const show = useRef(), ring = useRef(), runes = useRef()
  const [upg, setUpg] = useState(false)          // showcase wears the upgraded material
  const doneAt = useRef(0)
  const lastWeapon = useRef('pistol')

  useEffect(() => useGameStore.subscribe((s, prev) => {
    if (s.benchBusy && !prev.benchBusy && spot) {
      lastWeapon.current = s.benchBusy
      setUpg(false)
      playBenchWork(spot.x, 1.2, spot.z, WR.BENCH_TIME)
    } else if (!s.benchBusy && prev.benchBusy && spot) {
      setUpg(true)
      doneAt.current = performance.now()
      playBenchDone(spot.x, 1.2, spot.z)
    }
  }), [spot])

  useFrame(({ clock }) => {
    const s = useGameStore.getState()
    const t = clock.elapsedTime
    const sinceDone = performance.now() - doneAt.current
    const busy = !!s.benchBusy
    const reveal = !busy && doneAt.current > 0 && sinceDone < 1400   // comes back out upgraded
    showOnly(api, busy ? s.benchBusy : reveal ? lastWeapon.current : null)
    if (show.current) {
      show.current.visible = busy || reveal
      show.current.rotation.y = t * (busy ? 7 : 2)
      show.current.position.y = busy ? 1.05 + Math.sin(t * 40) * 0.015 : 1.25 + (1 - Math.min(1, sinceDone / 400)) * -0.3
      show.current.position.x = busy ? Math.sin(t * 55) * 0.012 : 0
    }
    if (ring.current) {
      ring.current.visible = busy || reveal
      ring.current.material.opacity = busy ? 0.07 + Math.sin(t * 20) * 0.02 : 0.08
    }
    if (runes.current) runes.current.scale.y = busy ? 1 + Math.sin(t * 25) * 0.2 : 1
  })

  if (!spot) return null
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, faceCenter(room, spot), 0]}>
      <BenchMesh runes={runes} ring={ring} show={show} api={api} upg={upg} />
    </group>
  )
}


// Ticks the box timers on every peer; only the host/solo relocates it (and tells the guest).
function BoxClock() {
  useFrame(() => {
    const st = useGameStore.getState()
    if (st.box.phase === 'idle') return
    if (st.tickBox(performance.now(), st.mpRole !== 'guest') === 'moved' && isConnected()) {
      send('game_event', { event: 'box_move', data: { box: useGameStore.getState().box } })
    }
  })
  return null
}

export default function Machines() {
  return (
    <>
      <MysteryBox />
      <UpgradeBench />
      <BoxClock />
      <Bolts />
    </>
  )
}
