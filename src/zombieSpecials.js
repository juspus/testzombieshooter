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
