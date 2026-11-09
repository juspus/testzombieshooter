// The Director (versus): one player defends their own world while the other builds every wave
// of it from a budget, then they swap. Best of 3 short rounds; in each round both players defend
// WAVES_PER_TURN waves once. Pure rules + the message contract; no store, no net.
//
// Messages ride the versus channel (sendVersus / onVersus in versus.js) and carry the run `seed`;
// a mismatch is dropped, like every versus message.
//   dir_state  defender -> director, STATE_HZ while defending: see makeState()
//   dir_spawn  director -> defender: { seed, id, type, cluster }   cluster = SPAWN_CLUSTERS index
//   dir_mod    director -> defender: { seed, id, mod }             next wave's modifier
//   dir_turn   defender -> director when a turn ends: { seed, round, wavesCleared, damageTaken, died }
//   dir_next   host -> guest: { seed, round, defender }            'host' | 'guest' defends next

export const DIRECTOR = {
  ROUNDS: 3,            // best of 3
  WAVES_PER_TURN: 3,    // round r is waves (r-1)*3+1 .. r*3 of each player's own run
  SPAWN_WINDOW_S: 20,   // director's time to spend a wave's budget once it starts
  BUDGET_BONUS: 2,      // on top of the normal wave size, so a modifier is not free of cost
  STATE_HZ: 8,
  INTERMISSION_S: 15,   // defender's shop time between waves of a turn
}

export const MSG = { STATE: 'dir_state', SPAWN: 'dir_spawn', MOD: 'dir_mod', TURN: 'dir_turn', NEXT: 'dir_next' }

// Spawnable units: store archetype ids (ZOMBIE_ARCHETYPES), cost in budget points, first wave
// they unlock on. Unlocks are a little earlier than in solo so short turns still escalate.
export const DIR_UNITS = [
  { id: 'walker',   label: 'Walker',   cost: 1,  wave: 1 },
  { id: 'crawler',  label: 'Crawler',  cost: 1,  wave: 1 },
  { id: 'runner',   label: 'Runner',   cost: 2,  wave: 2 },
  { id: 'exploder', label: 'Exploder', cost: 3,  wave: 3 },
  { id: 'brute',    label: 'Brute',    cost: 4,  wave: 4 },
  { id: 'spitter',  label: 'Spitter',  cost: 3,  wave: 5 },
  { id: 'armored',  label: 'Armored',  cost: 4,  wave: 6 },
  { id: 'screamer', label: 'Screamer', cost: 2,  wave: 7 },
  { id: 'boss',     label: 'Boss',     cost: 12, wave: 9 },
]

// Next-wave modifiers (modifiers.js ids); bought from that wave's budget before it starts.
export const DIR_MODS = [
  { id: 'fog',       label: 'Fog',       cost: 3, wave: 2 },
  { id: 'blackout',  label: 'Blackout',  cost: 5, wave: 3 },
  { id: 'bloodlust', label: 'Bloodlust', cost: 5, wave: 4 },
]

export const unitDef = (id) => DIR_UNITS.find((u) => u.id === id) ?? null
export const modDef = (id) => DIR_MODS.find((m) => m.id === id) ?? null
export const unitsForWave = (wave) => DIR_UNITS.filter((u) => u.wave <= wave)
export const modsForWave = (wave) => DIR_MODS.filter((m) => m.wave <= wave)

/** Budget points for a wave: the solo wave size (5 + (wave-1)*3) plus a small bonus. */
export const waveBudget = (wave) => 5 + (Math.max(1, wave) - 1) * 3 + DIRECTOR.BUDGET_BONUS

/** Waves a defender plays in round r (1-based). */
export function turnWaves(round) {
  const first = (round - 1) * DIRECTOR.WAVES_PER_TURN + 1
  return Array.from({ length: DIRECTOR.WAVES_PER_TURN }, (_, i) => first + i)
}

/** Who defends first in round r: host in odd rounds, guest in even ones. */
export const firstDefender = (round) => (round % 2 === 1 ? 'host' : 'guest')

/** Can this unit / modifier be bought on this wave with `left` budget? */
export function canBuy(def, wave, left) {
  return !!def && def.wave <= wave && def.cost <= left
}

/** Unspent budget when the spawn window ends: spend it all on walkers (cost 1 each). */
export const autoFill = (left) => Array.from({ length: Math.max(0, Math.floor(left)) }, () => 'walker')

// ── Scoring ──────────────────────────────────────────────────────────────────
// turn = { wavesCleared, damageTaken, died }

/** 'a' | 'b' | 'tie': more waves cleared wins, then less damage taken. */
export function compareTurns(a, b) {
  if (a.wavesCleared !== b.wavesCleared) return a.wavesCleared > b.wavesCleared ? 'a' : 'b'
  if (a.damageTaken !== b.damageTaken) return a.damageTaken < b.damageTaken ? 'a' : 'b'
  return 'tie'
}

/** rounds = ['host' | 'guest' | 'tie', ...] -> 'host' | 'guest' | 'draw' | null (still going). */
export function matchWinner(rounds) {
  const host = rounds.filter((r) => r === 'host').length
  const guest = rounds.filter((r) => r === 'guest').length
  const need = Math.floor(DIRECTOR.ROUNDS / 2) + 1
  if (host >= need) return 'host'
  if (guest >= need) return 'guest'
  if (rounds.length < DIRECTOR.ROUNDS) return null
  return host > guest ? 'host' : guest > host ? 'guest' : 'draw'
}

// ── State snapshot (defender -> director) ───────────────────────────────────
// Zombies travel as [x, z, typeCode, hpFrac] with 1-decimal coordinates to keep the 8 Hz payload small.

export const TYPE_CODES = DIR_UNITS.map((u) => u.id)
const r1 = (n) => Math.round(n * 10) / 10

export function encodeZombies(zombies, positions = {}) {
  const out = []
  for (const z of zombies) {
    if (z.dying) continue
    const p = positions[z.id] ?? z
    const code = TYPE_CODES.indexOf(z.type)
    out.push([r1(p.x), r1(p.z), code < 0 ? 0 : code, r1(z.maxHealth ? z.health / z.maxHealth : 1)])
  }
  return out
}

export const decodeZombie = ([x, z, code, hp]) => ({ x, z, type: TYPE_CODES[code] ?? 'walker', hp })

/**
 * dir_state payload. phase: the defender's store phase. budgetLeft: points still to spend this
 * wave (or for the next wave while in intermission). spawnLeft: seconds left in the spawn window
 * (0 outside it). planks: { [windowId]: count }. nextMod: modifier id bought for the next wave.
 */
export function makeState({ seed, round, wave, phase, budgetLeft, spawnLeft, hp, maxHp, player, zombies, planks, nextMod }) {
  return {
    seed, round, wave, phase,
    budgetLeft, spawnLeft: r1(spawnLeft),
    hp, maxHp,
    player: { x: r1(player.x), z: r1(player.z), yaw: r1(player.yaw ?? 0) },
    zombies,
    planks: planks ?? {},
    nextMod: nextMod ?? null,
  }
}
