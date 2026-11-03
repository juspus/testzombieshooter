// Wave 3 special archetypes (Exploder / Spitter / Armored): tuning constants and
// the pure rules behind them, kept free of three.js / store imports so they can
// be unit-tested and shared by the store (damage), hitFx (feedback) and Zombie.jsx (AI).

// ── Armored ──────────────────────────────────────────────────────────────────
export const ARMOR_BODY_MULT = 0.25      // pistol / AK body hits keep 25% of their damage
export const ARMOR_SHOTGUN_PEN_DIST = 5  // shotgun pellets inside this range punch through

// Damage multiplier for a hit on a zombie of `type`. Armour is only beaten by
// headshots, the knife (always a "head" hit), flame, explosions, the Desert Eagle
// and a close-range shotgun blast. `weapon` null = unknown (treated like a pistol).
export function armorMultiplier(type, { head = false, weapon = null, dist = Infinity, source = 'gun' } = {}) {
  if (type !== 'armored') return 1
  if (head) return 1
  if (weapon === 'crossbow') return 1                  // bolts punch through plate
  if (source !== 'gun') return 1                       // knife / flame / burst
  if (weapon === 'deagle') return 1
  if (weapon === 'shotgun' && dist < ARMOR_SHOTGUN_PEN_DIST) return 1
  return ARMOR_BODY_MULT
}
export const isArmorDeflect = (type, o) => armorMultiplier(type, o) < 1

// ── Exploder ─────────────────────────────────────────────────────────────────
export const EXPLODER = {
  PRIME_TIME: 0.6,        // s: hiss + swell + flash before a melee/window burst
  DEATH_FUSE: 0.5,        // s after dying before the corpse bursts (kept < death anim length)
  PRIME_RANGE: 1.25,      // m to a player (or window face) that starts the fuse
  RUSH_RANGE: 5,          // m: speeds up inside this distance to a player
  RUSH_MULT: 1.5,
  PLAYER_RADIUS: 2.5,
  PLAYER_MAX: 12,         // damage at the centre (BASE_HP is 20)
  ZOMBIE_RADIUS: 3.5,
  ZOMBIE_MAX: 4,
  PLANK_RADIUS: 3.2,      // windows closer than this to the blast lose planks
  PLANK_HITS: 6,          // 5 breaks one plain plank, 20 a reinforced one
}
// Linear falloff: 1 at the centre, 0 at/after `radius`.
export const burstFalloff = (d, radius) => (d >= radius ? 0 : Math.max(0, 1 - d / radius))
export const burstPlayerDamage = (d) => EXPLODER.PLAYER_MAX * burstFalloff(d, EXPLODER.PLAYER_RADIUS)
export const burstZombieDamage = (d) => EXPLODER.ZOMBIE_MAX * burstFalloff(d, EXPLODER.ZOMBIE_RADIUS)
export const burstPlankHits = (d) => (d <= EXPLODER.PLANK_RADIUS ? EXPLODER.PLANK_HITS : 0)

// ── Spitter ──────────────────────────────────────────────────────────────────
export const SPITTER = {
  RANGE: 13,              // m: will spit at a visible player inside this distance
  WINDUP: 0.75,           // s telegraph (head back, throat sac swells, gurgle)
  COOLDOWN_MIN: 3,
  COOLDOWN_MAX: 4,
  FLIGHT_MIN: 0.7,
  FLIGHT_MAX: 1.5,
  FLIGHT_SPEED: 8,        // m/s horizontal -> flight time = dist / speed (clamped)
  GLOB_HIT_RADIUS: 0.55,  // a glob that passes this close to the player bursts on them
  PUDDLE_RADIUS: 1.1,
  PUDDLE_LIFE: 4,
  PUDDLE_TICK: 0.5,       // s between damage ticks while standing in a puddle
  PUDDLE_DAMAGE: 1,       // per tick -> 2 hp/s
  SPLASH_DAMAGE: 3,       // direct hit / landing on the player
}
export const globFlightTime = (d) => Math.min(SPITTER.FLIGHT_MAX, Math.max(SPITTER.FLIGHT_MIN, d / SPITTER.FLIGHT_SPEED))

// ── Spider ───────────────────────────────────────────────────────────────────
// Scuttles on all fours with its back to the surface and its limbs bent the wrong way.
// Outside it is a floor zombie (claws planks like a walker). Once inside it climbs to the
// ceiling, crawls to the spot above a player, shrieks (the "look up" cue), drops on them,
// fights on the floor for a moment, then leaps back up.
export const SPIDER = {
  BODY_Y: 0.5,            // m from the clung-to surface to the body centre (limbs reach this far)
  INSIDE_MARGIN: 0.6,     // m inside the walls before it starts climbing (clears the window gap)
  CLIMB_TIME: 0.9,        // s: first climb, up the wall by the window it came in through
  LEAP_TIME: 0.45,        // s: back up after a drop
  CEIL_SPEED_MUL: 1.1,    // on top of the archetype speed while on the ceiling
  DROP_RANGE: 1.0,        // m horizontal to a player before it winds up
  CANCEL_RANGE: 2.4,      // m: player escaped during the wind-up -> back to crawling
  WINDUP: 0.6,            // s shriek + coil before letting go
  RETRY: 0.8,             // s before another wind-up after a cancel
  GRAVITY: 22,            // m/s^2 (a 2.2 m drop takes ~0.45 s)
  LUNGE_SPEED: 2.5,       // m/s horizontal pull toward where the player stood when it let go
  POUNCE_RADIUS: 1.2,     // m: landing this close to a player hits them
  POUNCE_DAMAGE: 7,       // BASE_HP is 20
  FLOOR_TIME: 2.5,        // s on the floor after a drop before leaping back up
  DOORWAY_H: 2.2,         // interior door lintel height (cabin): it ducks under it
  DOORWAY_REACH: 0.9,     // m either side of a door plane where the lintel applies
  CORPSE_Y: 0.16,         // body centre of a corpse lying belly-down, limbs up
  DEATH_ROLL: 0.5,        // s to roll over (floor kill) / settle (ceiling kill)
}

// Height of the surface the spider clings to at (x, z): the ceiling, or a door lintel
// when it is passing through an interior doorway. `doors` = the map's DOOR_DEFS.
export function spiderCeilingAt(x, z, wallH, doors = []) {
  for (const d of doors) {
    const along = d.axis === 'z' ? Math.abs(z - d.z) - d.halfD : Math.abs(x - d.x) - d.halfW
    const across = d.axis === 'z' ? Math.abs(x - d.x) : Math.abs(z - d.z)
    if (along < 0.3 && across < SPIDER.DOORWAY_REACH) return Math.min(wallH, SPIDER.DOORWAY_H)
  }
  return wallH
}

export const freshSpiderState = () => ({ s: 'floor', t: 0, dur: 0, y: SPIDER.BODY_Y, y0: SPIDER.BODY_Y, flip: 0, vy: 0, floorT: 0, cd: 0, climbs: 0 })

const _ease = (k) => k * k * (3 - 2 * k)

// One frame of the surface state machine (pure: mutates `sp`, returns an event or null).
//   s: 'floor' | 'up' (climb / leap) | 'ceil' | 'windup' | 'drop'
// ctx: { inside, hdist (horizontal m to the target player), ceilY (body centre on the ceiling) }
// Events: 'climb', 'windup', 'cancel', 'drop', 'land'. The caller moves the zombie (floor/ceil
// only), applies the pounce on 'land', and plays sounds.
export function spiderStep(sp, dt, { inside, hdist, ceilY }) {
  const floorY = SPIDER.BODY_Y
  switch (sp.s) {
    case 'floor':
      sp.y = floorY; sp.flip = 0
      sp.floorT -= dt
      if (inside && sp.floorT <= 0) {
        sp.s = 'up'; sp.t = 0; sp.y0 = sp.y
        sp.dur = sp.climbs++ === 0 ? SPIDER.CLIMB_TIME : SPIDER.LEAP_TIME
        return 'climb'
      }
      return null
    case 'up': {
      sp.t += dt
      const k = _ease(Math.min(1, sp.t / sp.dur))
      sp.y = sp.y0 + (ceilY - sp.y0) * k
      sp.flip = Math.PI * k
      if (sp.t >= sp.dur) { sp.s = 'ceil'; sp.cd = 0.4 }
      return null
    }
    case 'ceil':
      sp.y += (ceilY - sp.y) * Math.min(1, dt * 8)   // eases under / out from door lintels
      sp.flip = Math.PI
      sp.cd -= dt
      if (sp.cd <= 0 && hdist <= SPIDER.DROP_RANGE) { sp.s = 'windup'; sp.t = SPIDER.WINDUP; return 'windup' }
      return null
    case 'windup':
      sp.t -= dt
      if (hdist > SPIDER.CANCEL_RANGE) { sp.s = 'ceil'; sp.cd = SPIDER.RETRY; return 'cancel' }
      if (sp.t <= 0) { sp.s = 'drop'; sp.vy = 0; sp.y0 = sp.y; return 'drop' }
      return null
    case 'drop': {
      sp.vy += SPIDER.GRAVITY * dt
      sp.y -= sp.vy * dt
      const span = sp.y0 - floorY
      sp.flip = span > 0 ? Math.PI * Math.max(0, Math.min(1, (sp.y - floorY) / span)) : 0
      if (sp.y <= floorY) { sp.y = floorY; sp.flip = 0; sp.s = 'floor'; sp.floorT = SPIDER.FLOOR_TIME; return 'land' }
      return null
    }
    default:
      return null
  }
}
// Moves along a surface this frame (the climb / drop are vertical only).
export const spiderCanMove = (sp) => sp.s === 'floor' || sp.s === 'ceil'
// Mid-air (climbing up or falling): hit stagger does not freeze it there.
export const spiderAirborne = (sp) => sp.s === 'up' || sp.s === 'drop'
