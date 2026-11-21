// Power-up state and actions (drops are rolled in combat.js; the pool and timers live in src/powerups.js).
import { buildGrid } from '../walls'
import { emitGameEvent } from '../gameEvents'
import { POWERUP_DEFS, NUKE_REWARD, CARPENTER_REWARD, startEffect, tickEffects, clearEffects, clearDrops, addDrop } from '../powerups'
import { ACTIVE_MAP, allWallSegments } from './shared'
import { _dropPoint } from './drops'
import { _maxAmmoState } from './weapons'
import { applyZombieDamage } from './combat'

// Power-ups: Insta-Kill, Double Money, Max Ammo, Carpenter, Nuke.
export const createPowerupsSlice = (set, get) => ({
  // ── Wave 3 "Power-ups" ───────────────────────────────────────────────────────
  // Drops are rolled by the host/solo player only (applyZombieDamage -> maybeDropPowerup),
  // placed in the module pool in powerups.js, and applied on collect via applyPowerup().
  // Money / ammo / planks are per-client state, so in co-op every client applies the
  // effect to its own store when the host broadcasts `powerup_apply`.
  instaKillOn: false,     // Insta-Kill active (any hit kills). Remaining time: powerups.effects
  doubleMoneyOn: false,   // Double Money active
  powerupBannerId: 0,     // bumped on every pickup; PowerUpHud subscribes to this itself
  powerupBannerType: null,
  killsSinceDrop: 0,      // pity counter (see dropChance)
  lastDropType: null,

  // Spawn a pickup in the world (also the dev hook: __game.getState().dropPowerup('nuke', x, z)).
  dropPowerup: (type, x, z) => {
    if (!POWERUP_DEFS[type]) return null
    const p = _dropPoint(get, x, z)
    return addDrop({ type, x: p.x, z: p.z })
  },

  // Apply a collected power-up to THIS client's state.
  applyPowerup: (type) => {
    if (!POWERUP_DEFS[type]) return
    const st = get()
    emitGameEvent('powerup', { type })   // Wave 4 progression (before the nuke kills below)
    const upd = { powerupBannerId: st.powerupBannerId + 1, powerupBannerType: type }
    if (type === 'insta_kill') { startEffect(type); upd.instaKillOn = true }
    else if (type === 'double_money') { startEffect(type); upd.doubleMoneyOn = true }
    else if (type === 'max_ammo') Object.assign(upd, _maxAmmoState(st))
    else if (type === 'carpenter') {
      // Boards every window to 2 planks and resets hit progress. New planks follow the
      // current strong-plank mode (same rule as addPlank); windows already holding strong
      // planks stay strong; existing plain planks are not auto-upgraded.
      const planks = { ...st.windowPlanks }
      const strong = { ...st.windowPlankStrong }
      const hits = { ...st.plankHits }
      for (const w of ACTIVE_MAP.WINDOW_DEFS ?? []) {
        if ((planks[w.id] ?? 0) < 2) {
          if ((planks[w.id] ?? 0) === 0) strong[w.id] = st.strongPlanksMode
          planks[w.id] = 2
        }
        hits[w.id] = 0
      }
      buildGrid(allWallSegments(planks, st.openDoors))
      Object.assign(upd, { windowPlanks: planks, windowPlankStrong: strong, plankHits: hits, money: st.money + CARPENTER_REWARD })
    } else if (type === 'nuke') {
      upd.money = st.money + NUKE_REWARD
    }
    set(upd)
    // Host/solo: kill every live zombie through the normal kill path (pending ones
    // slot in as usual). Guests just receive the dying flags via zombie_update.
    if (type === 'nuke' && st.mpRole !== 'guest') {
      for (const z of get().zombies) if (!z.dying) applyZombieDamage(get, set, z.id, 1e9, 'nuke', false)
    }
  },

  // Advance timed effects; called every frame by PowerUps.jsx (pause-aware there).
  tickPowerups: (dt) => {
    const expired = tickEffects(dt)
    if (expired.length === 0) return
    const upd = {}
    if (expired.includes('insta_kill')) upd.instaKillOn = false
    if (expired.includes('double_money')) upd.doubleMoneyOn = false
    set(upd)
  },

  resetPowerups: () => {
    clearEffects(); clearDrops()
    set({ instaKillOn: false, doubleMoneyOn: false, killsSinceDrop: 0, lastDropType: null, powerupBannerType: null })
  },
})
