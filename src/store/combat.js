// Hit markers, the last-kill slow-mo, and damage to zombies (kills, kill money, drops, wave clear).
import { time as gameTime } from '../timeScale'
import { armorMultiplier } from '../zombieSpecials'
import { emitGameEvent } from '../gameEvents'
import { meterForKill, addMeter } from '../mail'
import { dirWindowOpen } from './shared'
import { killMoney, buildWaveBonusSummary } from './economy'
import { maybeDropPowerup } from './drops'

// ── Wave 1 "Feel" module state ───────────────────────────────────────────────
const LAST_KILL_DELAY_MS = 1100   // real-time slow-mo window before WAVE CLEARED
const LAST_KILL_SCALE = 0.3
const BURN_MARKER_INTERVAL_MS = 450
let _lastBurnMarkerAt = 0
let _lastKillTimers = []
let _lastKillToken = 0

export function cancelLastKillFx() {
  _lastKillTimers.forEach(clearTimeout)
  _lastKillTimers = []
  _lastKillToken++   // invalidates a pending wave_clear timeout (restart / death)
  gameTime.scale = 1
}

// Shared damage application for hitZombie (gun/knife) and hitZombieFlame (burn ticks).
export function applyZombieDamage(get, set, id, damage, source, isHeadshot, weapon = null, dist = Infinity) {
  const { zombies, pendingSpawns, kills, waveKills, wave, waveElapsed, waveHeadshots, waveKnifeKills, wavePlanksLost, waveStartPlanks } = get()
  const zombie = zombies.find((z) => z.id === id)
  if (!zombie || zombie.dying) return false
  const { runHeadshots, runKnifeKills } = get()

  // Insta-Kill: any hit (bullet, knife, burn tick) is lethal. Armour (armored zombies) scales the rest.
  const newHealth = get().instaKillOn ? 0 : zombie.health - damage * armorMultiplier(zombie.type, { head: isHeadshot, weapon, dist, source })

  if (newHealth <= 0) {
    const nuked = source === 'nuke'
    const newKills = kills + 1
    const newWaveKills = waveKills + (nuked ? 0 : 1)   // nuke kills pay no kill money
    const newWaveHeadshots = waveHeadshots + (source === 'gun' && isHeadshot ? 1 : 0)
    const newWaveKnifeKills = waveKnifeKills + (source === 'knife' ? 1 : 0)
    // Immediately slot in the next pending zombie so the active count stays at the cap
    const nextPending = pendingSpawns.length > 0 ? pendingSpawns[0] : null
    const newPending = nextPending ? pendingSpawns.slice(1) : pendingSpawns
    // Mark killed zombie as dying (animation plays before removal)
    const newZombies = zombies.map((z) => z.id === id ? { ...z, health: 0, dying: true } : z)
    const withNext = nextPending ? [...newZombies, nextPending] : newZombies
    const activeCount = withNext.filter((z) => !z.dying).length
    const isGuest = get().mpRole === 'guest'
    // Wave 4 progression: one tiny event per kill (XP, challenges, achievements).
    emitGameEvent('kill', { type: zombie.type, source, head: isHeadshot, weapon: weapon ?? (source === 'gun' ? get().weapon : null), big: damage >= 900 })
    const waveOver = !isGuest && activeCount === 0 && newPending.length === 0 && !dirWindowOpen(get())
    const statUpdate = {
      ...(!nuked && get().runMode === 'versus' && get().versus.mode === 'mail'
        ? { mail: { ...get().mail, meter: addMeter(get().mail.meter, meterForKill({ source, headshot: source === 'gun' && isHeadshot })) } }
        : null),
      zombies: withNext,
      pendingSpawns: newPending,
      kills: newKills,
      waveKills: newWaveKills,
      waveHeadshots: newWaveHeadshots,
      waveKnifeKills: newWaveKnifeKills,
      runHeadshots: runHeadshots + (source === 'gun' && isHeadshot ? 1 : 0),
      runKnifeKills: runKnifeKills + (source === 'knife' ? 1 : 0),
    }
    if (!nuked) {
      // Kill money lands on the kill (x2 under Double Money). Co-op: both clients run this for
      // every kill (remote hits too), so each player earns for the partner's kills, as before.
      statUpdate.money = get().money + killMoney(source, isHeadshot) * (get().doubleMoneyOn ? 2 : 1)
      // Drop roll (host / solo only; never on the wave's last kill).
      if (!isGuest && !waveOver) maybeDropPowerup(get, set, zombie)
    }
    if (waveOver) {
      // Hold wave_clear back for LAST_KILL_DELAY_MS so the slow-mo plays out. The
      // host broadcasts wave_clear when phase flips, so the guest transitions
      // LAST_KILL_DELAY_MS later too (same fixed delay, no extra sync needed).
      const bonuses = buildWaveBonusSummary({
        wave,
        waveKills: newWaveKills,
        waveHeadshots: newWaveHeadshots,
        waveKnifeKills: newWaveKnifeKills,
        wavePlanksLost,
        waveStartPlanks,
        waveElapsed,
        modifier: get().waveModifier,
      })
      set({ ...statUpdate, lastKillPending: true })
      get().startLastKillFx()
      const token = ++_lastKillToken
      setTimeout(() => {
        if (token !== _lastKillToken) return
        if (get().phase === 'playing' && get().lastKillPending) {
          set({ phase: 'wave_clear', lastWaveBonuses: bonuses, lastKillPending: false })
        } else {
          set({ lastKillPending: false })
        }
      }, LAST_KILL_DELAY_MS)
    } else {
      set(statUpdate)
    }
    return true
  } else {
    set({ zombies: zombies.map((z) => z.id === id ? { ...z, health: newHealth } : z) })
    return false
  }
}

// Hit markers, last-kill slow-mo and the zombie damage actions.
export const createCombatSlice = (set, get) => ({
  // ── Wave 1 "Feel": hit markers, damage direction, last-kill slow-mo ──────────
  hitMarkerId: 0,         // bumped by registerHit(); HitMarker subscribes to this itself
  hitMarkerKind: 'hit',   // 'hit' | 'head' | 'kill' | 'headkill' | 'burn'
  lastHitX: 0,            // world pos of the zombie that last hit the player (damage indicator)
  lastHitZ: 0,
  lastKillId: 0,          // bumped when the final zombie of a wave dies (slow-mo + sting)
  lastKillPending: false, // host: wave_clear is held back for LAST_KILL_DELAY_MS

  // One marker per trigger pull — callers aggregate pellets / pierce targets first.
  // 'burn' (flamethrower ticks) is throttled so it never spams.
  registerHit: (kind) => {
    if (kind === 'burn') {
      const now = performance.now()
      if (now - _lastBurnMarkerAt < BURN_MARKER_INTERVAL_MS) return
      _lastBurnMarkerAt = now
    }
    set({ hitMarkerKind: kind, hitMarkerId: get().hitMarkerId + 1 })
  },

  // Slow-mo + sting. Runs on host (from the killing blow) and guest ('last_kill' event).
  startLastKillFx: () => {
    cancelLastKillFx()
    gameTime.scale = LAST_KILL_SCALE
    _lastKillTimers = [
      setTimeout(() => { gameTime.scale = 0.65 }, LAST_KILL_DELAY_MS - 250),
      setTimeout(() => { gameTime.scale = 1 }, LAST_KILL_DELAY_MS),
    ]
    set({ lastKillId: get().lastKillId + 1 })
  },
  endLastKillFx: () => { cancelLastKillFx() },

  // weapon/dist feed armour rules (armored zombies, see zombieSpecials.js) and are
  // optional: callers/net events that omit them are treated as a pistol body hit.
  // mult: weapon damage multiplier (upgraded x2, crossbow bolt) — see WR.damageMult
  hitZombie: (id, isHeadshot, source = 'gun', weapon = null, dist = Infinity, mult = 1) =>
    applyZombieDamage(get, set, id, (isHeadshot ? 3 : 1) * mult, source, isHeadshot, weapon, dist),

  // Exploder blast (host-side): area damage to another zombie, or the exploder itself (999).
  hitZombieBurst: (id, damage, source = 'burst') => applyZombieDamage(get, set, id, damage, source, false),   // source 'grenade' keeps grenade kills out of Exploder-burst stats

  // Fractional damage-over-time hit (flamethrower burn tick)
  hitZombieFlame: (id, damage) => applyZombieDamage(get, set, id, damage, 'flame', false),
})
