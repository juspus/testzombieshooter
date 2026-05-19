import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store'
import { send, onMessage, offMessage } from '../net'
import { getZombiePositions, applyRemoteZombiePositions } from './Zombie'
import { pushRemotePlayerSample } from './RemotePlayer'
import { buildGrid } from '../walls'
import { allWallSegments } from '../cabin'

const POS_INTERVAL    = 1 / 30  // 30 /s  (~33 ms)
const ZOMBIE_INTERVAL = 0.05    // 20 /s  (50 ms)

export default function NetManager() {
  const mpRole      = useGameStore((s) => s.mpRole)
  const mpConnected = useGameStore((s) => s.mpConnected)
  const phase       = useGameStore((s) => s.phase)
  const wave        = useGameStore((s) => s.wave)

  const posTimer    = useRef(0)
  const zombieTimer = useRef(0)

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

  // ── Subscribe to incoming messages ────────────────────────────────────
  useEffect(() => {
    if (!mpConnected) return

    onMessage('pos', (data) => {
      pushRemotePlayerSample(data)
    })

    onMessage('game_event', ({ event, data }) => {
      applyRemoteEvent(event, data)
    })

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
    }
  }, [mpConnected, mpRole])

  // ── Per-frame sends ────────────────────────────────────────────────────
  useFrame((state, delta) => {
    if (!mpConnected) return

    posTimer.current += delta
    if (posTimer.current >= POS_INTERVAL) {
      posTimer.current = 0
      const cam = state.camera
      send('pos', {
        x: cam.position.x,
        y: cam.position.y,
        z: cam.position.z,
        yaw: cam.rotation.y,
        pitch: cam.rotation.x,
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
      store.nextWave()
      break
    case 'wave_start':
      useGameStore.setState({
        phase: 'playing',
        zombies: data.zombies,
        pendingSpawns: data.pendingSpawns,
        nextId: data.nextId,
        wave: data.wave,
        waveElapsed: 0,
        waveHeadshots: 0,
        waveKnifeKills: 0,
        wavePlanksLost: 0,
        waveStartPlanks: data.waveStartPlanks ?? 0,
      })
      break
    case 'wave_clear':
      useGameStore.setState({ phase: 'wave_clear', lastWaveBonuses: data.bonuses })
      break
    case 'die':
      store.die()
      break
    case 'hit_zombie':
      store.hitZombie(data.id, data.isHeadshot, data.source ?? 'gun')
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
        buildGrid(allWallSegments(newPlanks))
        useGameStore.setState({ windowPlanks: newPlanks })
      }
      break
    }
    case 'skip_intermission':
      store.skipIntermission()
      break
    default:
      break
  }
}
