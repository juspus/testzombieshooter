// One zombie, one frame: the state machine that used to live in Zombie.jsx's useFrame.
// Pure sim (no React / three.js): positions, timers and decisions go into the zombie's sim state
// (state.js); the pose layer draws them. `sys` is the ZombieSystem (system.js), `sys.ctx` the
// per-tick context (player positions, plank state, walls...) computed once per frame.
import { findPath, isBlocked } from '../walls'
import { EXPLODER, SPIDER, spiderCanMove, spiderAirborne } from '../zombieSpecials'
import { modFx } from '../modifiers'
import {
  ATTACK_RANGE, ATTACK_INTERVAL, PLAYER_ATTACK_RANGE, PATH_INTERVAL,
  DEATH_SHOTGUN_DURATION, DEATH_KNIFE_DURATION, DEATH_DURATION, FLASH_OFF,
} from './constants'
import { applyMove, hasDirectPath, followPath } from './movement'
import { startFuse, exploderTick } from './exploder'
import { spitterThink, spitterTick, spitterCancel } from './spitter'
import { spiderTick, spiderDeathTick } from './spider'

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// Settle into a frozen corpse: no more AI, the pose layer drops it from every registry and bakes
// its matrices; the store keeps it as a corpse (capped), see store.js removeDyingZombie.
function settleCorpse(sys, zs) {
  zs.corpse = true
  const fx = zs.fx
  if (fx.flash > 0) { fx.flash = 0; zs.flashCmd = FLASH_OFF }
  zs.burn = 0
  sys.store.getState().removeDyingZombie(zs.id)
}

// Death animation timing. Style depends on the killing blow (fx.kill, recorded by recordHit):
// 0 default fall, 1 blast back along the shot (shotgun / deagle), 2 knife slump in place.
function deathTick(sys, zs, dt) {
  const fx = zs.fx
  if (!zs.deathStarted) {
    zs.deathStarted = true
    const kill = fx.kill
    fx.style = kill ? (kill.weapon === 'knife' ? 2 : (kill.weapon === 'shotgun' || kill.weapon === 'deagle') ? 1 : 0) : 0
    if (fx.style === 1) {
      // World-axis tilt so the top of the body travels along the shot direction
      const kl = Math.hypot(kill.dx, kill.dz) || 1
      fx.kx = kill.dx / kl; fx.kz = kill.dz / kl
      fx.dur = DEATH_SHOTGUN_DURATION
      if (kill.weapon === 'shotgun') {
        // closer + more pellets = harder blast
        const closeness = Math.max(0.35, Math.min(1.3, 1.3 - kill.dist / 10))
        fx.vel = (2.5 + 0.7 * Math.min(kill.pellets, 8)) * closeness
        fx.hop = 0.18
      } else {
        fx.vel = 2.2; fx.hop = 0.08
      }
    } else {
      fx.dur = fx.style === 2 ? DEATH_KNIFE_DURATION : DEATH_DURATION
      fx.vel = 0; fx.hop = 0
    }
  }
  zs.dyingT = Math.min(zs.dyingT + dt, fx.dur)
  const t = zs.dyingT / fx.dur
  let rotT, yT
  if (fx.style === 2) {
    // knife: knees buckle and the body folds down in place before toppling
    yT = 0.55 * smooth(0, 0.55, t) + 0.45 * smooth(0.55, 1, t)
    rotT = 0.3 * smooth(0, 0.55, t) + 0.7 * smooth(0.55, 1, t)
    zs.deathBuckle = smooth(0, 0.5, t)
  } else if (fx.style === 1) {
    rotT = yT = 1 - (1 - t) * (1 - t)   // ease-out: thrown, then lands
  } else {
    rotT = yT = t * t  // ease-in: accelerates like gravity
  }
  zs.deathRotT = rotT
  zs.y = zs.baseY * (1 - yT * 0.85) + (fx.hop > 0 ? Math.sin(Math.min(1, t * 2) * Math.PI) * fx.hop : 0)
  if (fx.vel > 0.05) {
    const step = fx.vel * dt
    applyMove(zs, fx.kx * step, fx.kz * step, sys.walls)
    fx.vel *= Math.exp(-4.5 * dt)
  }
  if (zs.dyingT >= fx.dur) settleCorpse(sys, zs)
}

function setYawToward(zs, tx, tz) {
  zs.yaw = Math.atan2(tx - zs.x, tz - zs.z)   // what Object3D.lookAt gives a horizontal target
}

export function tickZombie(sys, zs, ctx) {
  if (zs.corpse) return   // settled corpse: frozen, no per-frame work
  const dt = ctx.dt
  const fx = zs.fx
  zs.animDirty = false

  // Hit reaction timers (the pose layer draws the flash / lean / head snap)
  if (fx.flash > 0) {
    fx.flash -= dt
    if (fx.flash <= 0) zs.flashCmd = FLASH_OFF
  }
  if (fx.staggerCd > 0) fx.staggerCd -= dt
  if (fx.lean > 0) { fx.lean -= dt; fx.leanDirty = true }
  if (fx.head > 0) { fx.head -= dt; fx.headDirty = true }

  // Burning flame visual: decays independent of phase / death state
  if (zs.burn > 0) zs.burn = Math.max(0, zs.burn - dt)

  // Death animation: plays regardless of phase
  if (zs.dying) {
    if (zs.isExploder && !zs.ex.done) {
      if (zs.ex.fuse < 0) startFuse(sys, zs, EXPLODER.DEATH_FUSE)
      exploderTick(sys, zs, dt)
    }
    if (zs.isSpider) {
      if (spiderDeathTick(zs, dt)) settleCorpse(sys, zs)
      return
    }
    deathTick(sys, zs, dt)
    return
  }

  if (ctx.phase !== 'playing') return
  const store = sys.store
  const arch = zs.arch

  // Exploder fuse keeps burning through stagger
  if (zs.isExploder) exploderTick(sys, zs, dt)

  // Hit stagger: brief movement/attack pause (lean pose is applied by the pose layer)
  if (fx.stagger > 0) {
    fx.stagger -= dt
    if (zs.isSpitter) spitterCancel(zs)
    if (!(zs.isSpider && spiderAirborne(zs.spd))) return   // a climbing / falling spider keeps going
  }

  // First zombie to physically reach a window's opening shatters its glass: covers both boarded
  // (attack_window mode) and unboarded (walked straight through) windows. No-op on maps whose
  // windows have no glass to break.
  const wdefs = sys.map.WINDOW_DEFS
  for (let i = 0; i < wdefs.length; i++) {
    const w = wdefs[i]
    const wdx = zs.x - w.winX, wdz = zs.z - w.winZ
    if (wdx * wdx + wdz * wdz <= ATTACK_RANGE * ATTACK_RANGE) {
      store.getState().breakWindow(w.id)
      break
    }
  }

  // Local player position (also used for melee-attack detection: always local)
  const lx = ctx.lx, lz = ctx.lz

  // Idle groan: randomized interval; the audio layer caps concurrent voices and favours nearby
  // zombies, so a rejected groan just retries soon.
  zs.groanTimer -= dt
  if (zs.groanTimer <= 0) {
    const gdx = lx - zs.x, gdz = lz - zs.z
    zs.groanTimer = sys.io.audio.groan(zs.x, 1.4, zs.z, zs.groanPitch, Math.sqrt(gdx * gdx + gdz * gdz))
      ? 6 + Math.random() * 8
      : 0.8 + Math.random() * 1.2
  }

  // W5 co-op: downed / bled-out players are ignored (zombies retarget the partner).
  const selfOk = ctx.selfOk
  const rp = ctx.rp
  let px, pz
  if (rp && !selfOk) {
    px = rp.x; pz = rp.z
  } else if (rp) {
    const dl2 = (zs.x - lx) ** 2 + (zs.z - lz) ** 2
    const dr2 = (zs.x - rp.x) ** 2 + (zs.z - rp.z) ** 2
    px = dr2 < dl2 ? rp.x : lx
    pz = dr2 < dl2 ? rp.z : lz
  } else {
    px = lx; pz = lz
  }

  const planks = ctx.planks

  // Spitter: where to stand (gx, gz) and whether to hold + spit; everyone else chases the player
  let gx = px, gz = pz
  if (zs.isSpitter) {
    spitterThink(sys, zs, dt, px, pz)
    spitterTick(sys, zs, dt, px, pz)
    gx = zs.sp.gx; gz = zs.sp.gz
  }

  // Spider: floor <-> ceiling state machine. Anything but 'floor' = up off the ground.
  const sp = zs.spd
  let offFloor = false
  if (zs.isSpider) offFloor = spiderTick(sys, zs, dt, px, pz)
  const walls = (offFloor && sys.getCeilWalls()) || sys.walls
  const plankOk = !zs.noPlankAttack && !offFloor
  const hw = sys.cabinHW, hd = sys.cabinHD

  // Revert attack mode if the target plank was destroyed or zombie entered the cabin
  if (zs.mode === 'attack_window' && zs.targetWindow >= 0) {
    const insideCabin = Math.abs(zs.x) < hw && Math.abs(zs.z) < hd
    if ((planks[zs.targetWindow] ?? 0) === 0 || insideCabin) {
      if (!insideCabin) {
        const win = wdefs[zs.targetWindow]
        if (win.wall === 'N' || win.wall === 'S') zs.x = win.winX
        else zs.z = win.winZ
      }
      zs.mode = 'chase'
      zs.targetWindow = -1
      zs.path = []
      zs.pathTimer = 0
    }
  }

  // Periodic pathfinding: recalculate toward player OR window attack position
  zs.pathTimer -= dt
  if (zs.pathTimer <= 0) {
    zs.pathTimer = PATH_INTERVAL

    // Consider switching to attack_window mode (nearest boarded, active window)
    if (plankOk && zs.mode !== 'attack_window') {
      let nearWin = null, nearDist = Infinity
      for (let i = 0; i < wdefs.length; i++) {
        const win = wdefs[i]
        if (!((planks[win.id] ?? 0) > 0 && sys.isWindowActive(win.id))) continue
        const dx = zs.x - win.ax, dz = zs.z - win.az
        const d = dx * dx + dz * dz
        if (nearWin === null || d < nearDist) { nearDist = d; nearWin = win }
      }
      if (nearWin !== null) {
        let isClosest = true
        const list = sys.list
        for (let i = 0; i < list.length; i++) {
          const o = list[i]
          if (o === zs || o.corpse) continue
          const dx = o.x - nearWin.ax, dz = o.z - nearWin.az
          if (dx * dx + dz * dz < nearDist) { isClosest = false; break }
        }
        const insideCabin = Math.abs(zs.x) < hw && Math.abs(zs.z) < hd
        if (isClosest && zs.aggressor && !insideCabin) {
          zs.mode = 'attack_window'
          zs.targetWindow = nearWin.id
          zs.path = []
        }
      }
    }

    // A* toward window attack position or player
    if (zs.mode === 'attack_window' && zs.targetWindow >= 0) {
      const win = wdefs[zs.targetWindow]
      const newPath = findPath(zs.x, zs.z, win.ax, win.az)
      if (newPath && newPath.length > 1) {
        zs.path = newPath
        zs.wpIdx = 1
      }
    } else {
      const newPath = findPath(zs.x, zs.z, gx, gz)
      if (newPath && newPath.length > 1) {
        zs.path = newPath
        zs.wpIdx = 1
      } else if (plankOk && !isBlocked(px, pz)) {
        // Player unreachable via open path: force nearest window attack
        let nearWin = -1, nearDist = Infinity
        for (let i = 0; i < wdefs.length; i++) {
          const win = wdefs[i]
          if ((planks[win.id] ?? 0) === 0 || !sys.isWindowActive(win.id)) continue
          const dx = zs.x - win.ax, dz = zs.z - win.az
          const d = dx * dx + dz * dz
          if (d < nearDist) { nearDist = d; nearWin = win.id }
        }
        if (nearWin >= 0) {
          zs.mode = 'attack_window'
          zs.targetWindow = nearWin
          zs.path = []
        }
      }
    }
  }

  // Determine movement direction
  let moving = false
  const isAttackMode = zs.mode === 'attack_window' && zs.targetWindow >= 0

  if (isAttackMode) {
    const win = wdefs[zs.targetWindow]
    const dx = win.winX - zs.x, dz = win.winZ - zs.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    setYawToward(zs, win.winX, win.winZ)
    if (dist <= ATTACK_RANGE) {
      zs.attacking = true
      zs.attackTimer -= dt
      if (zs.isExploder) {
        startFuse(sys, zs, EXPLODER.PRIME_TIME)   // bursts at the window instead of clawing the planks
      } else if (zs.attackTimer <= 0) {
        zs.attackTimer = ATTACK_INTERVAL
        // Only host applies plank damage (prevents double-damage in multiplayer)
        const gs = store.getState()
        if (!gs.mpRole || gs.mpRole === 'host') {
          for (let i = 0; i < arch.plankHits; i++) gs.hitPlank(win.id)
        }
        sys.io.audio.plankHit(win.winX, 1.2, win.winZ)
      }
    } else {
      zs.attacking = false
      const tx = win.ax, tz = win.az
      const tdx = tx - zs.x, tdz = tz - zs.z
      const tdist = Math.sqrt(tdx * tdx + tdz * tdz)
      if (hasDirectPath(zs.x, zs.z, tx, tz, sys.walls)) {
        if (tdist > 0.01) { zs.mx = tdx / tdist; zs.mz = tdz / tdist; moving = true }
      } else {
        moving = followPath(zs, tx, tz, sys.walls)
      }
    }
  } else {
    // Local-player melee range check: independent of the chase target (px,pz), which may be the
    // remote player. Damage is fully client-local.
    const ldx = lx - zs.x, ldz = lz - zs.z
    if (selfOk && !zs.isExploder && !offFloor && ldx * ldx + ldz * ldz <= PLAYER_ATTACK_RANGE * PLAYER_ATTACK_RANGE) {
      zs.mode = 'attack_player'
      setYawToward(zs, lx, lz)
      zs.attacking = true
      zs.attackTimer -= dt
      if (zs.attackTimer <= 0) {
        zs.attackTimer = ATTACK_INTERVAL
        store.getState().hitPlayer(arch.playerDamage, zs.x, zs.z)
      }
    } else {
      if (zs.mode === 'attack_player') zs.mode = 'chase'
      zs.attacking = false
      if (zs.isExploder) {
        // reaching either player arms the fuse
        let nd2 = selfOk ? ldx * ldx + ldz * ldz : Infinity
        if (rp) nd2 = Math.min(nd2, (zs.x - rp.x) ** 2 + (zs.z - rp.z) ** 2)
        if (nd2 <= EXPLODER.PRIME_RANGE * EXPLODER.PRIME_RANGE) startFuse(sys, zs, EXPLODER.PRIME_TIME)
      }
      setYawToward(zs, px, pz)
      if (hasDirectPath(zs.x, zs.z, gx, gz, walls)) {
        const dx = gx - zs.x, dz = gz - zs.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > 0.01) { zs.mx = dx / dist; zs.mz = dz / dist; moving = true }
      } else {
        moving = followPath(zs, gx, gz, walls)
      }
    }
  }

  // Exploder plants its feet while the fuse burns; spitter holds still to hold the shot
  if (zs.isExploder && zs.ex.fuse >= 0) moving = false
  if (zs.isSpitter && (zs.sp.hold || zs.sp.state === 1)) moving = false
  if (zs.isSpider && !spiderCanMove(sp)) moving = false

  if (moving) {
    let speedMultiplier = arch.speedMultiplier
    if (zs.isExploder && (px - zs.x) ** 2 + (pz - zs.z) ** 2 <= EXPLODER.RUSH_RANGE * EXPLODER.RUSH_RANGE) speedMultiplier *= EXPLODER.RUSH_MULT
    if (offFloor) speedMultiplier *= SPIDER.CEIL_SPEED_MUL
    if (zs.aura) speedMultiplier *= ctx.auraSpeedMul   // inside a live screamer's aura (auras.js)
    const step = ctx.speed * speedMultiplier * modFx.speedMul * dt   // Bloodlust modifier
    applyMove(zs, zs.mx * step, zs.mz * step, walls)

    // Footstep sound: proximity to local player's ears
    const sdx = lx - zs.x, sdz = lz - zs.z
    if (sdx * sdx + sdz * sdz < 144) {
      zs.stepTimer -= dt
      if (zs.stepTimer <= 0) {
        if (zs.isSpider) {
          // skitter from where it is: overhead when it's on the ceiling
          zs.stepTimer = 0.32 + Math.random() * 0.12
          sys.io.audio.spiderSkitter(zs.x, zs.y, zs.z)
        } else {
          zs.stepTimer = 0.55 + Math.random() * 0.1
          sys.io.audio.footstep(zs.x, 0.2, zs.z)
        }
      }
    }
  }

  // Animation inputs for the pose layer
  zs.moving = moving
  zs.animDirty = true

  // Converge toward host's authoritative position (guest mode)
  const gp = sys.remote[zs.id]
  if (gp) {
    const ex = gp.x - zs.x, ez = gp.z - zs.z
    const err = Math.sqrt(ex * ex + ez * ez)
    if (err > 2.0) {
      // Large divergence: snap immediately (teleport / respawn edge case)
      zs.x = gp.x
      zs.z = gp.z
    } else {
      // Time-based exponential convergence: ~80% of error closed per 100ms
      // independent of frame rate (unlike a fixed 0.25/frame)
      const f = Math.min(1, dt * 16)
      zs.x += ex * f
      zs.z += ez * f
    }
  }
}
