// The Director: pure turn / round bookkeeping and helpers shared by the store and the runtime.
// Rules and the message contract live in director.js; nothing here touches the store or the net.
import { DIRECTOR, firstDefender, turnWaves, compareTurns, matchWinner, makeState, encodeZombies } from './director'

/** Seconds on the between-turns card before the host starts the next turn (Ready skips it). */
export const BETWEEN_S = 8

export const otherSide = (side) => (side === 'host' ? 'guest' : 'host')

/** Turn number 0..2*ROUNDS-1: round r first half = 2(r-1), second half = 2(r-1)+1. */
export function turnIndex(round, defender) {
  return (round - 1) * 2 + (defender === firstDefender(round) ? 0 : 1)
}

/** Inverse of turnIndex: { round, defender }. */
export function turnAt(index) {
  const round = Math.floor(index / 2) + 1
  const first = firstDefender(round)
  return { round, defender: index % 2 === 0 ? first : otherSide(first) }
}

/** A valid dir_next target: integer round in range, defender a side. */
export function validTurn(round, defender) {
  return Number.isInteger(round) && round >= 1 && round <= DIRECTOR.ROUNDS && (defender === 'host' || defender === 'guest')
}

/** The wave a turn of round r starts on, and the one it ends on. */
export const firstWave = (round) => turnWaves(round)[0]
export const lastWave = (round) => turnWaves(round).at(-1)

/** Normalised turn result from a wire payload (or null). */
export function cleanTurn(t) {
  if (!t || typeof t !== 'object') return null
  const waves = Math.max(0, Math.min(DIRECTOR.WAVES_PER_TURN, Math.floor(+t.wavesCleared || 0)))
  return { wavesCleared: waves, damageTaken: Math.max(0, Math.round(+t.damageTaken || 0)), died: !!t.died }
}

/** 'host' | 'guest' | 'tie' for a round, or null until both turns are in. */
export function roundWinner(turns, round) {
  const r = turns?.[round]
  if (!r?.host || !r?.guest) return null
  const c = compareTurns(r.host, r.guest)
  return c === 'a' ? 'host' : c === 'b' ? 'guest' : 'tie'
}

/** Match result from `side`'s point of view: 'win' | 'lose' | 'draw' | null (still going). */
export function resultFor(rounds, side) {
  const w = matchWinner(rounds)
  if (!w) return null
  return w === 'draw' ? 'draw' : w === side ? 'win' : 'lose'
}

/** Round wins { host, guest }. */
export function score(rounds) {
  return { host: rounds.filter((r) => r === 'host').length, guest: rounds.filter((r) => r === 'guest').length }
}

/**
 * Which spawn cluster a dir_spawn lands on. `index` is a SPAWN_CLUSTERS index (the full map list);
 * when that cluster is not active (its room is still sealed) the nearest active one is used.
 * Returns an index into `active`, or -1 for a bad index.
 */
export function resolveCluster(index, all, active) {
  if (!Number.isInteger(index) || index < 0 || index >= all.length || !active.length) return -1
  const c = all[index]
  const direct = active.indexOf(c)
  if (direct >= 0) return direct
  let best = 0
  let bd = Infinity
  active.forEach((a, i) => {
    const d = (a.x - c.x) ** 2 + (a.z - c.z) ** 2
    if (d < bd) { bd = d; best = i }
  })
  return best
}

/** Indices (into the full list) of the clusters currently active: sent with dir_state. */
export const activeIndices = (all, active) => active.map((c) => all.indexOf(c)).filter((i) => i >= 0)

/**
 * The dir_state payload for a store snapshot `st`. `positions` = live zombie positions by id
 * (getZombiePositions), `cam` = { x, z, yaw } (viewState), `active` = indices of the spawn clusters in play.
 * Extra keys beyond makeState: seed, clusters (active SPAWN_CLUSTERS indices), cleared, damage.
 */
export function buildDirectorState(st, positions, cam, active = []) {
  const d = st.director
  return {
    ...makeState({
      seed: st.versus.seed, round: d.round, wave: st.wave, phase: st.phase,
      budgetLeft: d.budget, spawnLeft: d.windowLeft, hp: st.hp, maxHp: st.maxHp,
      player: cam, zombies: encodeZombies(st.zombies, positions), planks: st.windowPlanks, nextMod: d.nextMod,
    }),
    clusters: active,
    cleared: d.turnCleared,
    damage: Math.round(d.turnDamage),
  }
}
