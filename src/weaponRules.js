// Wave 3 "Mystery Box + Upgrade Bench" — pure rules (no store / three / net imports).
// store.js applies the patches these return; tests exercise them directly.

export const MAX_GUNS = 3             // carried guns (knife is separate)

// ── Names ────────────────────────────────────────────────────────────────────
export const WEAPON_NAMES = {
  pistol: 'Pistol', shotgun: 'Shotgun', ak47: 'AK-47', deagle: 'Desert Eagle',
  flamethrower: 'Flamethrower', crossbow: 'Crossbow',
}
export const UPGRADED_NAMES = {
  pistol: 'Mustang', shotgun: 'Widowmaker', ak47: 'Red Fang', deagle: 'Hand Cannon',
  flamethrower: "Dragon's Breath", crossbow: 'Wraith',
}
export const weaponName = (w, upgraded = false) =>
  (upgraded ? UPGRADED_NAMES[w] : WEAPON_NAMES[w]) ?? String(w)

// ── Ammo / damage ────────────────────────────────────────────────────────────
export const BASE_CLIP = { pistol: 10, shotgun: 8, ak47: 30, deagle: 7, flamethrower: 0, crossbow: 1 }
// Reserve a freshly obtained box weapon starts with (flamethrower = fuel units).
export const START_RESERVE = { pistol: 30, shotgun: 24, ak47: 90, deagle: 21, flamethrower: 1000, crossbow: 10 }
export const UPGRADE_CLIP_MULT = 1.5
export const UPGRADE_DAMAGE_MULT = 2

export const clipSize = (w, upgraded = false) => {
  const base = BASE_CLIP[w] ?? 10
  return upgraded && base > 0 ? Math.round(base * UPGRADE_CLIP_MULT) : base
}

// Crossbow bolts one-shot everything (even a boss: 20 body / 60 head vs 16 hp).
export const CROSSBOW_DAMAGE_MULT = 20
// Multiplier on top of the base hit damage (body 1 / head 3, flame tick) for this weapon.
export const damageMult = (w, upgraded = false) =>
  (w === 'crossbow' ? CROSSBOW_DAMAGE_MULT : 1) * (upgraded ? UPGRADE_DAMAGE_MULT : 1)

// ── Mystery Box ──────────────────────────────────────────────────────────────
export const BOX_COST = 100           // ≈ one early door; cheap enough to gamble, dear enough to matter
export const BOX_CYCLE_MS = 3000      // weapons cycle above the box
export const BOX_TAKE_MS = 8000       // time to grab the result before it sinks
export const BOX_TEDDY_MS = 3500      // bear shown before the box moves
export const BOX_USES_MIN = 8
export const BOX_USES_MAX = 12
export const BOX_START_ROOM = 'hall'  // never the sealed-start main room: you have to open a door

// Weighted pool: every shop weapon + the box-exclusive crossbow.
export const BOX_WEIGHTS = { pistol: 6, shotgun: 18, ak47: 16, deagle: 10, flamethrower: 6, crossbow: 16 }

export function rollBoxWeapon(rng = Math.random, exclude = []) {
  const pool = Object.keys(BOX_WEIGHTS).filter((w) => !exclude.includes(w))
  const list = pool.length ? pool : Object.keys(BOX_WEIGHTS)
  let total = 0
  for (const w of list) total += BOX_WEIGHTS[w]
  let r = rng() * total
  for (const w of list) {
    r -= BOX_WEIGHTS[w]
    if (r < 0) return w
  }
  return list[list.length - 1]
}

export const rollBoxUses = (rng = Math.random) =>
  BOX_USES_MIN + Math.min(BOX_USES_MAX - BOX_USES_MIN, Math.floor(rng() * (BOX_USES_MAX - BOX_USES_MIN + 1)))

// One paid use. Returns { uses, teddy, weapon }; the maxUses-th use is the bear.
export function boxRollOutcome({ uses, maxUses }, rng = Math.random, exclude = []) {
  const n = uses + 1
  if (n >= maxUses) return { uses: n, teddy: true, weapon: null }
  return { uses: n, teddy: false, weapon: rollBoxWeapon(rng, exclude) }
}

// Where the box goes after a bear: a random OTHER currently-open room that has a box spot.
export function pickBoxRoom(openRooms, current, anchors, rng = Math.random) {
  const cands = [...openRooms].filter((r) => r !== current && anchors[r]?.box)
  if (!cands.length) return current
  return cands[Math.min(cands.length - 1, Math.floor(rng() * cands.length))]
}

// ── Carrying guns ────────────────────────────────────────────────────────────
// Patch for taking / buying weapon `w`. Free slot -> added and equipped. Full (MAX_GUNS)
// -> replaces the weapon in hand (CoD rule). Already carried -> just refilled.
// `s` needs: weapon, ownedWeapons, bulletsInClip, reserveBullets, savedClips, savedReserves, upgradedWeapons.
export function giveWeapon(s, w, { reserve = START_RESERVE[w] ?? 0, maxGuns = MAX_GUNS } = {}) {
  const ups = { ...(s.upgradedWeapons ?? {}) }
  if (s.ownedWeapons.includes(w)) {
    const clip = clipSize(w, !!ups[w])
    if (w === s.weapon) {
      return { bulletsInClip: clip, reserveBullets: Math.max(s.reserveBullets, reserve), isReloading: false }
    }
    return {
      savedClips: { ...s.savedClips, [w]: clip },
      savedReserves: { ...s.savedReserves, [w]: Math.max(s.savedReserves[w] ?? 0, reserve) },
    }
  }
  const savedClips = { ...s.savedClips, [s.weapon]: s.bulletsInClip }
  const savedReserves = { ...s.savedReserves, [s.weapon]: s.reserveBullets }
  let ownedWeapons
  if (s.ownedWeapons.length < maxGuns) {
    ownedWeapons = [...s.ownedWeapons, w]
  } else {
    ownedWeapons = s.ownedWeapons.map((x) => (x === s.weapon ? w : x))
    savedClips[s.weapon] = 0
    savedReserves[s.weapon] = 0
    delete ups[s.weapon]
  }
  ups[w] = false
  return {
    weapon: w,
    ownedWeapons,
    upgradedWeapons: ups,
    bulletsInClip: clipSize(w, false),
    reserveBullets: reserve,
    savedClips,
    savedReserves,
    isReloading: false,
  }
}

// ── Upgrade Bench ────────────────────────────────────────────────────────────
export const BENCH_COST = 750         // tuned vs. ~€1100 total income by wave 20 (doors are €550)
export const BENCH_TIME = 3           // seconds the gun is "inside" the bench
export const BENCH_ROOM = 'bedroom'

export function canUpgrade(s) {
  return !!s.weapon && s.activeItem !== 'knife' && !(s.upgradedWeapons ?? {})[s.weapon] && !s.benchBusy
}

// Patch applied when the bench finishes: x2 damage flag, +50% mag, mag topped up and
// reserve raised to at least `reserveFloor` (the weapon's Max-Ammo level).
export function upgradePatch(s, reserveFloor = 0) {
  const w = s.weapon
  return {
    upgradedWeapons: { ...(s.upgradedWeapons ?? {}), [w]: true },
    bulletsInClip: clipSize(w, true),
    reserveBullets: Math.max(s.reserveBullets, reserveFloor),
    isReloading: false,
  }
}
