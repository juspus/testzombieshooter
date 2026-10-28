// Wave 3 "Grenades" — pure rules + tuning (no three / store / net imports so it is
// trivially unit-testable). store.js owns the inventory, components/Grenades.jsx the
// pooled in-flight sim + explosion, Player.jsx the cook/throw input.

export const GRENADE = {
  START: 0,             // none for free: grenades only come from the Shop
  MAX: 4,               // carry cap
  COST: 25,             // € per grenade in the Shop
  FUSE: 2.5,            // s from pin-pull to boom (cooking eats into it)
  // ── throw / flight ──
  THROW_SPEED: 13,      // m/s along the camera direction
  THROW_LIFT: 2.2,      // extra upward m/s so a level throw arcs
  GRAVITY: 15,
  RADIUS_BODY: 0.11,    // collision radius against floor / walls
  BOUNCE_WALL: 0.5,     // restitution off walls
  BOUNCE_FLOOR: 0.38,
  FLOOR_FRICTION: 0.7,  // horizontal speed kept per floor bounce
  ROLL_DRAG: 2.6,       // 1/s horizontal decay while rolling
  REST_VY: 1.1,         // below this bounce speed the grenade rolls instead of hopping
  // ── blast ──
  RADIUS: 4.5,          // m: nothing outside this is hurt
  INNER: 1.0,           // m: full damage inside this
  ZOMBIE_MAX: 4.5,      // < armored (5) / brute (7) / boss (16) health: heavy, never one-shot; walkers (2) die inside ~3 m
  PLAYER_MAX: 16,       // BASE_HP is 20: point blank hurts a lot but a cooked-in-hand blast is survivable at full HP
  PLANK_RADIUS: 3.6,
  PLANK_HITS: 6,
  SHAKE: 1,             // camera shake impulse at the centre (scaled by distance)
}

// 1 up to `inner`, then linear to 0 at `radius`.
export function blastFalloff(d, radius = GRENADE.RADIUS, inner = GRENADE.INNER) {
  if (d <= inner) return 1
  if (d >= radius) return 0
  return (radius - d) / (radius - inner)
}
export const grenadeZombieDamage = (d) => GRENADE.ZOMBIE_MAX * blastFalloff(d)
export const grenadePlayerDamage = (d) => GRENADE.PLAYER_MAX * blastFalloff(d)
export const grenadePlankHits = (d) => (d <= GRENADE.PLANK_RADIUS ? GRENADE.PLANK_HITS : 0)
export const grenadeShake = (d) => GRENADE.SHAKE * Math.max(0, 1 - d / (GRENADE.RADIUS * 2.2))

// ── Inventory rules ──────────────────────────────────────────────────────────
export const canBuyGrenade = (n, money) => n < GRENADE.MAX && money >= GRENADE.COST

// ── Cooking ──────────────────────────────────────────────────────────────────
// Seconds of fuse left after cooking for `cookTime` (never negative).
export const fuseLeft = (cookTime) => Math.max(0, GRENADE.FUSE - Math.max(0, cookTime))
// True once the grenade would go off in the thrower's hand.
export const cookedOut = (cookTime) => cookTime >= GRENADE.FUSE
// Seconds until the next audible tick while cooking: 0.55 s at the start, 0.12 s at the end.
export function tickInterval(cookTime) {
  const k = Math.min(1, Math.max(0, cookTime / GRENADE.FUSE))
  return 0.55 - 0.43 * k * k
}

// Initial velocity: camera direction (unit) * speed, plus lift.
export function throwVelocity(dx, dy, dz, out) {
  out.x = dx * GRENADE.THROW_SPEED
  out.y = dy * GRENADE.THROW_SPEED + GRENADE.THROW_LIFT
  out.z = dz * GRENADE.THROW_SPEED
  return out
}

// ── Ballistics ───────────────────────────────────────────────────────────────
// body: { x,y,z, vx,vy,vz, rest, rolling, bounce }. rayFn(ox,oy,oz,dx,dy,dz,maxDist,out) -> bool fills
// out {dist,nx,ny,nz} (worldRay.raycastWorld, wrapped). Moves the body by dt with
// gravity; reflects off whatever the swept ray hits (damped), settles into a roll on
// the floor. Allocation-free; the shared `_o` is scratch for the ray result.
const _o = { dist: 0, nx: 0, ny: 0, nz: 0 }
export function stepBody(b, dt, rayFn) {
  if (b.rest) return
  const G = GRENADE
  let left = dt
  for (let iter = 0; iter < 3 && left > 1e-5; iter++) {
    b.vy -= G.GRAVITY * left
    const speed = Math.hypot(b.vx, b.vy, b.vz)
    const len = speed * left
    if (len < 1e-6) break
    const dx = b.vx / speed, dy = b.vy / speed, dz = b.vz / speed
    // sweep to the surface, stopping one body-radius short of it
    if (rayFn(b.x, b.y, b.z, dx, dy, dz, len + G.RADIUS_BODY, _o) && _o.dist - G.RADIUS_BODY < len) {
      const travel = Math.max(0, _o.dist - G.RADIUS_BODY)
      b.x += dx * travel; b.y += dy * travel; b.z += dz * travel
      const vn = b.vx * _o.nx + b.vy * _o.ny + b.vz * _o.nz
      const floor = _o.ny > 0.7
      const e = floor ? G.BOUNCE_FLOOR : G.BOUNCE_WALL
      if (vn < -b.bounce) b.bounce = -vn   // loudest impact since the caller last reset it (for the clunk sound)
      if (vn < 0) {
        b.vx -= (1 + e) * vn * _o.nx
        b.vy -= (1 + e) * vn * _o.ny
        b.vz -= (1 + e) * vn * _o.nz
      }
      if (floor) {
        b.vx *= G.FLOOR_FRICTION; b.vz *= G.FLOOR_FRICTION
        if (Math.abs(b.vy) < G.REST_VY) { b.vy = 0; b.y = Math.max(b.y, G.RADIUS_BODY); b.rolling = true }
      }
      left -= left * (travel / len) + 1e-4   // spent roughly this share of the step
    } else {
      b.x += b.vx * left; b.y += b.vy * left; b.z += b.vz * left
      left = 0
    }
  }
  if (b.rolling) {
    // rolling on the floor: no vertical motion, horizontal drag until it stops
    b.y = G.RADIUS_BODY; b.vy = 0
    const k = Math.exp(-G.ROLL_DRAG * dt)
    b.vx *= k; b.vz *= k
    if (b.vx * b.vx + b.vz * b.vz < 0.04) { b.vx = b.vz = 0; b.rest = true }
  }
}
