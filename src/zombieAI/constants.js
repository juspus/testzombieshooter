// Zombie AI tuning shared by the sim (src/zombieAI/*) and the pose layer (components/Zombie.jsx).
// No imports: this file must stay runnable in Node.

export const ZOMBIE_HEIGHT = 1.8
export const DEATH_DURATION = 0.75
export const ARENA_BOUND = 18.5
export const ZOMBIE_R = 0.30             // physical collision radius
export const PATH_INTERVAL = 0.12        // seconds between A* recalculations
export const WAYPOINT_REACH = 0.6        // distance to advance to next waypoint
export const ATTACK_RANGE = 1.8          // distance to window face to start hitting
export const ATTACK_INTERVAL = 2.0       // seconds between plank/player hits
export const PLAYER_ATTACK_RANGE = 1.0   // distance to local player to start hitting

// Hit reactions (timers live in the sim, the pose layer only draws them)
export const FLASH_DURATION = 0.09
export const LEAN_DURATION = 0.3
export const HEAD_SNAP_DURATION = 0.26
export const STAGGER_COOLDOWN = 0.55     // min gap between movement pauses (stops AK stun-lock)
export const DEATH_SHOTGUN_DURATION = 0.95
export const DEATH_KNIFE_DURATION = 0.9
export const BURN_VISUAL_DURATION = 1.0

// zs.flashCmd: a pending hit-flash material swap for the pose layer
export const FLASH_NONE = 0
export const FLASH_ON = 1
export const FLASH_OFF = 2
