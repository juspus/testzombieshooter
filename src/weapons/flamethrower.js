import * as THREE from 'three'
import { UPGRADE_DAMAGE_MULT } from './common'
import { playReload, startFlamethrowerSound, stopFlamethrowerSound } from '../sounds'

// Flamethrower tuning: sustained-damage spray weapon (the store re-exports these as FLAME_*).
export const FLAME = {
  DPS: 0.5,             // burn damage per second per zombie in the stream
  TICK_INTERVAL: 0.2,   // how often burn damage is applied
  FUEL_PER_SEC: 100,    // tank drains this many units/sec while spraying
  RANGE: 9,             // max spray distance
  CONE_COS: 0.92,       // ~23 degree half-angle cone
  BURN_DURATION: 2.0,   // zombies keep burning (taking damage) this long after leaving the stream
}
export const FLAME_START_AMMO = 1000
export const FLAME_AMMO_PACK = { cost: 100, amount: 1000, deepAmount: 1000 }   // Deep Pockets does not raise it

// Napalm thrower (shop, Mystery Box): hold to spray. The "clip" is 0 and the reserve is fuel
// units. Unlike the guns it has no per-shot fire(): while the trigger is held Player.jsx calls
// fire(ctx) once per frame (it drains fuel, lights the spray and the sound), stop(ctx) when it is
// released, and burn(ctx, firing) every frame for the damage-over-time ticks.
export const flamethrower = {
  id: 'flamethrower',
  name: 'Flamethrower',
  upgradedName: "Dragon's Breath",
  caliber: 'Napalm',
  clip: 0,
  startReserve: FLAME_START_AMMO,   // fuel
  maxReserve: 2000,
  cost: 1500,
  buyReserve: FLAME_START_AMMO,
  boxWeight: 6,
  fireMode: 'spray',
  cooldown: 0,
  autoShootInterval: 0.4,
  vibrate: null,
  damageMult: 1,
  pierce: Infinity,   // every zombie in the cone burns
  range: FLAME.RANGE,
  flame: FLAME,
  reload: { base: 1.5, fast: 1.0 },
  ammoPack: FLAME_AMMO_PACK,
  sounds: { shot: null, reload: playReload, start: startFlamethrowerSound, stop: stopFlamethrowerSound },
  model: 'FlamethrowerModel',
  fire,
  stop,
  burn,
  silence,
}

// Module state (one local player): sound running, tick timer, ignited zombies (id -> seconds left).
let _soundOn = false
let _tick = 0
const _burning = new Map()
const _fwd = new THREE.Vector3()
const _toZombie = new THREE.Vector3()
const _zombiePos = new THREE.Vector3()

export const burningCount = () => _burning.size

// One frame of spraying. ctx: camera, delta, gun, flameSpray, kick, consumeFuel.
function fire(ctx) {
  ctx.consumeFuel(FLAME.FUEL_PER_SEC * ctx.delta)
  ctx.gun.setFlameActive?.(true)
  ctx.kick('flamethrower')
  if (!_soundOn) {
    _soundOn = true
    startFlamethrowerSound()
  }
  const muzzle = ctx.gun.getMuzzlePosition?.() ?? ctx.camera.position.clone()
  ctx.camera.getWorldDirection(_fwd)
  ctx.flameSpray.spray(muzzle, _fwd, 2)
}

// Trigger released / no fuel / weapon switched / shop open.
function stop(ctx) {
  ctx.gun.setFlameActive?.(false)
  if (_soundOn) {
    _soundOn = false
    stopFlamethrowerSound()
    _tick = 0
  }
}

// Unmount: never leave the sound looping.
function silence() {
  if (_soundOn) {
    _soundOn = false
    stopFlamethrowerSound()
  }
}

// Burn DoT: runs whenever zombies are alight, even after the stream moves off them or the
// trigger is released; each ignited zombie keeps burning for BURN_DURATION seconds.
// ctx: camera, delta, gun, zombieRefs, hitZombieFlame, deathSound, registerHit, netSend, ignite, upgraded.
function burn(ctx, firing) {
  if (!(firing || _burning.size > 0)) { _tick = 0; return }
  _tick -= ctx.delta
  if (_tick > 0) return
  _tick = FLAME.TICK_INTERVAL
  const damage = FLAME.DPS * FLAME.TICK_INTERVAL * (ctx.upgraded ? UPGRADE_DAMAGE_MULT : 1)
  if (firing) {
    const muzzle = ctx.gun.getMuzzlePosition?.() ?? ctx.camera.position.clone()
    ctx.camera.getWorldDirection(_fwd)
    for (const [id, ref] of Object.entries(ctx.zombieRefs)) {
      if (!ref) continue
      ref.getWorldPosition(_zombiePos)
      _toZombie.copy(_zombiePos).sub(muzzle)
      const dist = _toZombie.length()
      if (dist > FLAME.RANGE || dist < 0.001) continue
      _toZombie.divideScalar(dist)
      if (_toZombie.dot(_fwd) < FLAME.CONE_COS) continue
      _burning.set(Number(id), FLAME.BURN_DURATION)
    }
  }
  for (const [zid, remaining] of _burning) {
    const kill = ctx.hitZombieFlame(zid, damage)
    if (kill) ctx.deathSound(zid)
    ctx.registerHit(kill ? 'kill' : 'burn')
    ctx.ignite(zid)
    ctx.netSend('hit_zombie_flame', { id: zid, damage })
    const next = remaining - FLAME.TICK_INTERVAL
    if (next <= 0) _burning.delete(zid)
    else _burning.set(zid, next)
  }
}
