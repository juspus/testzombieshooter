// Listener pose and the panner outputs for positional sounds (zombies, the co-op partner).
import { _ctx } from './core'

// ─── remote player spatial audio ─────────────────────────────────────────────

// Keep the AudioContext listener's pose in sync with the local camera each frame.
// forwardX / forwardZ are the camera's -sin(yaw) / -cos(yaw) unit vector components.
export function setListenerPose(x, y, z, forwardX, forwardZ) {
  if (!_ctx) return
  const ac = _ctx
  ac.listener.positionX.value = x
  ac.listener.positionY.value = y
  ac.listener.positionZ.value = z
  ac.listener.forwardX.value = forwardX
  ac.listener.forwardY.value = 0
  ac.listener.forwardZ.value = forwardZ
  ac.listener.upX.value = 0
  ac.listener.upY.value = 1
  ac.listener.upZ.value = 0
}

// Create a PannerNode rooted at a world position and connected to ac.destination.
// All audio routed through this node will be spatially positioned in 3-D.
export function _makeSpatialOutput(ac, x, y, z, rolloff = 1) {
  const panner = ac.createPanner()
  panner.panningModel   = 'equalpower'
  panner.distanceModel  = 'linear'
  panner.refDistance    = 1    // full volume up to 1 unit away
  panner.maxDistance    = 32   // ~= cabin diagonal, inaudible beyond this
  panner.rolloffFactor  = rolloff
  panner.positionX.value = x
  panner.positionY.value = y
  panner.positionZ.value = z
  panner.connect(ac.destination)
  return panner
}

// ─── positional zombie / world sounds ────────────────────────────────────────

// Returns a PannerNode at (x,y,z), or null when no position was given (legacy
// no-arg callers such as TestLab keep playing flat, centred audio).
// Zombie sounds roll off a little faster than the co-op partner's.
export function _zombieOutput(ac, x, y, z) {
  if (typeof x !== 'number' || typeof z !== 'number') return null
  return _makeSpatialOutput(ac, x, typeof y === 'number' ? y : 1, z, 1.3)
}
