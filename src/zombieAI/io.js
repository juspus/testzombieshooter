// The AI never touches sounds, particles or the network directly: the host (the live game, or a test)
// hands it an `io` object. Every member is optional; missing ones are no-ops.
//
//   io.audio.groan(x, y, z, pitch, distToPlayer) -> true if a voice was free
//   io.audio.footstep / plankHit / exploderHiss / explosion / spitWindup / spitLaunch(x, y, z)
//   io.audio.spiderSkitter / spiderShriek / spiderLand(x, y, z)
//   io.fx.flash(x, y, z)  io.fx.scorch(x, z)  io.fx.impact(point, normal, kind, scale)
//   io.fx.spit(x0, y0, z0, x1, z1, flight)
//   io.net.event(name, data)       game_event relay (only when linked)
//   io.now()                       wall clock in ms (hit-flash pellet window)
//   io.remotePlayerPos()           { x, z } of the co-op partner, or null

const noop = () => {}
const noopTrue = () => true

export function makeIO(io = {}) {
  const a = io.audio ?? {}
  const f = io.fx ?? {}
  const n = io.net ?? {}
  return {
    audio: {
      groan: a.groan ?? noopTrue,
      footstep: a.footstep ?? noop,
      plankHit: a.plankHit ?? noop,
      exploderHiss: a.exploderHiss ?? noop,
      explosion: a.explosion ?? noop,
      spitWindup: a.spitWindup ?? noop,
      spitLaunch: a.spitLaunch ?? noop,
      spiderSkitter: a.spiderSkitter ?? noop,
      spiderShriek: a.spiderShriek ?? noop,
      spiderLand: a.spiderLand ?? noop,
    },
    fx: {
      flash: f.flash ?? noop,
      scorch: f.scorch ?? noop,
      impact: f.impact ?? noop,
      spit: f.spit ?? noop,
    },
    net: { event: n.event ?? noop },
    now: io.now ?? (() => Date.now()),
    remotePlayerPos: io.remotePlayerPos ?? (() => null),
  }
}
