// One simulated zombie: every piece of state the old Zombie.jsx frame loop kept in refs.
// The pose layer (components/Zombie.jsx) only reads this; the sim (tick.js) owns it.
import { getZombieArchetype } from '../store'
import { keyedRandom } from '../rng'
import { SPIDER, freshSpiderState } from '../zombieSpecials'
import { ZOMBIE_HEIGHT, DEATH_DURATION, PATH_INTERVAL, FLASH_NONE } from './constants'

const GROAN_PITCH = { brute: 0.75, runner: 1.15, screamer: 1.3, armored: 0.7, exploder: 0.8, spider: 1.45 }

export function createZombie(id, type, x, z) {
  const arch = getZombieArchetype(type)
  const isSpider = type === 'spider'
  const baseY = (ZOMBIE_HEIGHT * (arch.heightScale ?? 1)) / 2
  const plankAggroChance = type === 'runner' || type === 'screamer' || type === 'spitter' ? 0 : type === 'brute' ? 0.72 : 0.38
  const zs = {
    id,
    type,
    arch,
    isExploder: type === 'exploder',
    isSpitter: type === 'spitter',
    isSpider,
    noPlankAttack: type === 'runner' || type === 'screamer' || type === 'spitter',
    baseY,
    sx: x, sz: z,            // spawn point (identifies a zombie when a run restarts and ids are reused)
    // transform (the pose layer copies these onto the group)
    x, z,
    y: isSpider ? SPIDER.BODY_Y : baseY,
    yaw: 0,
    // lifecycle
    dying: false,            // mirrors the store's flag (synced each tick)
    corpse: false,           // settled: no more AI, the pose layer freezes the meshes
    pose: null,              // pose callback attached by the component (see ZombieSystem.attachPose)
    // pathfinding / behaviour
    path: [],
    wpIdx: 0,
    pathTimer: keyedRandom('pathT', id) * PATH_INTERVAL,
    mode: 'chase',           // 'chase' | 'attack_window' | 'attack_player'
    targetWindow: -1,
    attackTimer: 0,
    aggressor: keyedRandom('aggro', id) < plankAggroChance,
    stepTimer: Math.random() * 0.6,
    groanTimer: 3 + Math.random() * 8,
    groanPitch: GROAN_PITCH[type] ?? 0.9 + Math.random() * 0.2,
    aura: false,             // inside a live screamer's aura (computed once per tick)
    // per-frame outputs for the pose layer
    moving: false,
    attacking: false,
    mx: 0, mz: 0,
    animDirty: false,        // the tick reached the animation point this frame
    // hit reaction
    fx: {
      flash: 0, lean: 0, leanA: 0, lx: 0, lz: 0, head: 0, headA: 0,
      leanDirty: false, headDirty: false, hbSet: false, hbY: 0, hbZ: 0,
      stagger: 0, staggerCd: 0, lastHit: 0, pellets: 0, kill: null,
      style: 0, dur: DEATH_DURATION, vel: 0, kx: 0, kz: 0, hop: 0,
    },
    flashCmd: FLASH_NONE,
    burn: 0,
    // death
    dyingT: 0,
    deathStarted: false,
    deathRotT: 0,
    deathBuckle: 0,
    // specials
    ex: { fuse: -1, total: 1, done: false, flashT: 0, flashOn: false },
    sp: { state: 0, t: 0, cd: 1.5 + keyedRandom('spit0', id) * 2, post: -1, postT: 0, los: false, hold: false, gx: 0, gz: 0, poseK: 0, poseDirty: false },
    spd: null,
    spDead: null,
  }
  if (isSpider) {
    zs.spd = freshSpiderState()
    zs.spd.tx = 0
    zs.spd.tz = 0
  }
  return zs
}
