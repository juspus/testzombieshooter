import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import { send, onMessage, offMessage } from '../net'
import { getZombiePositions, applyRemoteZombiePositions, Zombie } from './Zombie'
import { pushRemotePlayerSample } from './RemotePlayer'
import { zombieHitFxFromNet } from '../hitFx'
import { buildGrid } from '../walls'
import { getMap, getInitialMapId } from '../maps'
import { addDrop, takeDrop } from '../powerups'
import Grenades from './Grenades'
import { BOX_COST } from '../weaponRules'
import { playRemoteGunshot, playRemoteFootstep, playRemoteKnifeSwing } from '../sounds'

// Map is chosen once (debug ?map= param) and fixed for the whole session.
const { allWallSegments } = getMap(getInitialMapId())

const POS_INTERVAL    = 1 / 30  // 30 /s  (~33 ms)
const ZOMBIE_INTERVAL = 0.05    // 20 /s  (50 ms)

export default function NetManager() {
  const mpRole      = useGameStore((s) => s.mpRole)
  const mpConnected = useGameStore((s) => s.mpConnected)
  const phase       = useGameStore((s) => s.phase)
  const wave        = useGameStore((s) => s.wave)

  const posTimer    = useRef(0)
  const zombieTimer = useRef(0)

  // ── Pause game when host switches tabs ────────────────────────────────
  useEffect(() => {
    if (!mpConnected || mpRole !== 'host') return

    const handleVisibility = () => {
      const hidden = document.hidden
      useGameStore.setState({ paused: hidden })
      send('game_event', { event: hidden ? 'pause' : 'resume', data: {} })
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [mpConnected, mpRole])

  // ── Broadcast phase transitions ────────────────────────────────────────
  useEffect(() => {
    if (!mpConnected) return

    // Either player dying ends the game for both
    if (phase === 'dead') {
      send('game_event', { event: 'die', data: {} })
      return
    }

    // Only host drives wave progression
    if (mpRole !== 'host') return

    if (phase === 'playing') {
      const s = useGameStore.getState()
      send('game_event', {
        event: 'wave_start',
        data: {
          zombies: s.zombies,
          pendingSpawns: s.pendingSpawns,
          nextId: s.nextId,
          wave: s.wave,
          waveStartPlanks: s.waveStartPlanks,
          openDoors: s.openDoors,   // Wave 3: late-join / reconnect door state
          modifier: s.waveModifier, // Wave 3: wave modifier (guest applies the same visuals/speeds)
          box: s.box,               // Wave 3: Mystery Box location / use counter
        },
      })
    }

    if (phase === 'wave_clear') {
      send('game_event', {
        event: 'wave_clear',
        data: { bonuses: useGameStore.getState().lastWaveBonuses },
      })
    }
  }, [phase, wave, mpConnected, mpRole])

  // ── Host pushes door state when a guest (re)connects mid-run ───────────
  useEffect(() => {
    if (!mpConnected || mpRole !== 'host') return
    const s = useGameStore.getState()
    if (s.phase !== 'start' && Object.keys(s.openDoors).length) {
      send('game_event', { event: 'door_sync', data: { openDoors: s.openDoors } })
    }
    if (s.phase !== 'start') send('game_event', { event: 'box_sync', data: { box: s.box } })   // Wave 3 late join
  }, [mpConnected, mpRole])

  // ── Host tells the guest when the final zombie dies so both play the slow-mo ──
  useEffect(() => {
    if (!mpConnected || mpRole !== 'host') return
    return useGameStore.subscribe((s, prev) => {
      if (s.lastKillId !== prev.lastKillId) send('game_event', { event: 'last_kill', data: {} })
    })
  }, [mpConnected, mpRole])

  // ── Subscribe to incoming messages ────────────────────────────────────
  useEffect(() => {
    if (!mpConnected) return

    onMessage('pos', (data) => {
      pushRemotePlayerSample(data)
    })

    onMessage('game_event', ({ event, data }) => {
      applyRemoteEvent(event, data)
    })

    // Frag grenade thrown by the partner: simulate it here too (it hurts our own player; the host
    // alone applies zombie / plank damage). See Grenades.jsx.
    onMessage('grenade_throw', (d) => Grenades.throw(d))

    onMessage('remote_sound', ({ sound, weapon, up, x, y, z }) => {
      if (sound === 'gunshot')  playRemoteGunshot(weapon, x, y, z, !!up)
      else if (sound === 'footstep') playRemoteFootstep(x, y, z)
      else if (sound === 'knife')    playRemoteKnifeSwing(x, y, z)
    })

    // ── Power-ups (host-authoritative) ────────────────────────────────────
    if (mpRole === 'guest') {
      // Host rolled a drop: mirror it (same id) without re-broadcasting
      onMessage('powerup_spawn', (d) => addDrop(d, { notify: false }))
      // Host validated a collect (by either player): both apply it to their own state
      onMessage('powerup_apply', ({ id, type }) => {
        takeDrop(id)
        useGameStore.getState().applyPowerup(type)
      })
    } else {
      // Guest asks to collect: validate the drop still exists, then apply on both
      onMessage('powerup_collect', ({ id }) => {
        const d = takeDrop(id)
        if (!d) return
        useGameStore.getState().applyPowerup(d.type)
        send('powerup_apply', { id: d.id, type: d.type })
      })
    }

    if (mpRole === 'guest') {
      onMessage('zombie_update', (posMap) => {
        applyRemoteZombiePositions(posMap)
        // Also sync health / dying from the host snapshot
        const state = useGameStore.getState()
        const incoming = posMap   // posMap also carries health on this channel now
        // (see host send below — we send { id: { x, z, health, dying } })
        if (!incoming) return
        const current = state.zombies
        const updated = current.map((z) => {
          const r = incoming[z.id]
          if (!r) return z
          if (r.health === z.health && r.dying === z.dying) return z
          return { ...z, health: r.health, dying: r.dying }
        })
        useGameStore.setState({ zombies: updated })
      })
    }

    return () => {
      offMessage('pos')
      offMessage('game_event')
      offMessage('zombie_update')
      offMessage('remote_sound')
      offMessage('grenade_throw')
      offMessage('powerup_spawn')
      offMessage('powerup_apply')
      offMessage('powerup_collect')
    }
  }, [mpConnected, mpRole])

  // ── Per-frame sends ────────────────────────────────────────────────────
  useFrame((state, delta) => {
    if (!mpConnected) return

    posTimer.current += delta
    if (posTimer.current >= POS_INTERVAL) {
      posTimer.current = 0
      const cam = state.camera
      const { weapon, activeItem, helmet, bodyArmor } = useGameStore.getState()
      send('pos', {
        x: cam.position.x,
        y: cam.position.y,
        z: cam.position.z,
        yaw: cam.rotation.y,
        pitch: cam.rotation.x,
        weapon,
        activeItem,
        helmet,
        bodyArmor,
      })
    }

    if (mpRole === 'host') {
      zombieTimer.current += delta
      if (zombieTimer.current >= ZOMBIE_INTERVAL) {
        zombieTimer.current = 0
        // Merge Three.js positions with store health/dying state
        const positions = getZombiePositions()
        const zombies = useGameStore.getState().zombies
        const payload = {}
        for (const z of zombies) {
          const pos = positions[z.id]
          payload[z.id] = {
            x: pos?.x ?? z.x,
            z: pos?.z ?? z.z,
            health: z.health,
            dying: z.dying,
          }
        }
        send('zombie_update', payload)
      }
    }
  })

  return null
}

// ── Apply an event received from the remote peer ──────────────────────────
function applyRemoteEvent(event, data) {
  const store = useGameStore.getState()
  switch (event) {
    case 'start_game':
      store.startGame()
      break
    case 'next_wave':
      store.nextWave(data?.modifier ?? null)   // host's modifier roll (announced during intermission)
      break
    case 'wave_start':
      useGameStore.setState({
        phase: 'playing',
        shopOpen: false,
        zombies: data.zombies,
        pendingSpawns: data.pendingSpawns,
        nextId: data.nextId,
        wave: data.wave,
        waveModifier: data.modifier ?? null,
        waveElapsed: 0,
        waveHeadshots: 0,
        waveKnifeKills: 0,
        wavePlanksLost: 0,
        waveStartPlanks: data.waveStartPlanks ?? 0,
      })
      if (data.openDoors) store.setOpenDoors(data.openDoors)
      if (data.box) store.setBox({ ...data.box, at: performance.now() })
      break
    case 'wave_clear':
      store.endLastKillFx()
      useGameStore.setState({ phase: 'wave_clear', lastWaveBonuses: data.bonuses })
      break
    case 'last_kill':
      store.startLastKillFx()
      break
    case 'die':
      store.die()
      break
    case 'hit_zombie':
      store.hitZombie(data.id, data.isHeadshot, data.source ?? 'gun', data.weapon ?? null, data.dist ?? Infinity, data.mult ?? 1)
      zombieHitFxFromNet(data)
      break
    case 'hit_zombie_flame':
      store.hitZombieFlame(data.id, data.damage)
      Zombie.ignite(data.id)
      break
    case 'hit_plank':
      store.hitPlank(data.windowId)
      break
    case 'add_plank': {
      // Apply plank without deducting money (remote player already paid on their side)
      const { windowPlanks } = useGameStore.getState()
      const current = windowPlanks[data.windowId] ?? 0
      if (current < 2) {
        const newPlanks = { ...windowPlanks, [data.windowId]: current + 1 }
        buildGrid(allWallSegments(newPlanks, useGameStore.getState().openDoors))
        useGameStore.setState({ windowPlanks: newPlanks })
      }
      break
    }
    // ── Wave 3 buyable doors (host-authoritative) ──────────────────────────
    // Guest asks; host validates the door is buyable, opens it, then broadcasts
    // `door_open` with by:'guest' (guest pays on the ack) or by:'sync' (already
    // open - no charge). Money is per-player, so the opener always pays their own.
    case 'door_request': {
      if (useGameStore.getState().mpRole !== 'host') break
      if (store.openDoors[data.id]) {
        send('game_event', { event: 'door_open', data: { id: data.id, by: 'sync' } })
      } else if (store.canOpenDoor(data.id)) {
        store.applyDoorOpen(data.id)
        send('game_event', { event: 'door_open', data: { id: data.id, by: 'guest' } })
      }
      break
    }
    case 'door_open': {
      if (data.by === 'guest' && useGameStore.getState().mpRole === 'guest') {
        const def = getMap(getInitialMapId()).DOOR_DEFS?.find((d) => d.id === data.id)
        if (def && !store.openDoors[data.id]) useGameStore.setState({ money: Math.max(0, store.money - def.cost) })
      }
      store.applyDoorOpen(data.id)
      break
    }
    case 'door_sync':
      store.setOpenDoors(data.openDoors)
      break
    // ── Wave 3 Mystery Box (host-authoritative rolls) ───────────────────────────
    // Guest asks (with the guns it holds, so the host can avoid duplicates); host rolls and
    // broadcasts the whole box. The payer takes the weapon locally and sends box_take.
    case 'box_request': {
      if (useGameStore.getState().mpRole !== 'host') break
      if (store.box.phase === 'idle' && store.boxRoll('guest', data.held ?? [])) {
        send('game_event', { event: 'box_roll', data: { box: useGameStore.getState().box } })
      } else {
        send('game_event', { event: 'box_sync', data: { box: store.box } })
      }
      break
    }
    case 'box_roll': {
      const me = useGameStore.getState()
      // The guest pays when the host's ack confirms the roll (a bear is refunded = free).
      if (data.box.payer === 'guest' && me.mpRole === 'guest' && data.box.phase === 'cycling') {
        useGameStore.setState({ money: Math.max(0, me.money - BOX_COST) })
      }
      store.setBox({ ...data.box, at: performance.now() })
      break
    }
    case 'box_take':
      store.setBox({ phase: 'idle', result: null, payer: null, at: performance.now() })
      break
    case 'box_move':
    case 'box_sync':
      store.setBox({ ...data.box, at: performance.now() })
      break
    case 'skip_intermission':
      store.skipIntermission()
      break
    case 'pause':
      useGameStore.setState({ paused: true })
      break
    case 'resume':
      useGameStore.setState({ paused: false })
      break
    default:
      break
  }
}
