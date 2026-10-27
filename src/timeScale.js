// Global game-time scale for the "last kill" slow-mo. Plain mutable object (not
// store state) so frame loops can read it every frame with zero subscription cost.
// Frame-driven systems multiply their delta by `time.scale`.
export const time = { scale: 1 }
