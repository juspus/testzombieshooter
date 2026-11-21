// Screamer aura: every non-screamer inside a live screamer's radius is sped up. Computed ONCE per
// tick (screamers x zombies; usually 0-4 screamers) instead of every zombie scanning the whole
// list every frame (25 x 25). The speed boost never stacks: one flag per zombie.

export function computeAuras(list, screamerArch) {
  const n = list.length
  let any = false
  for (let i = 0; i < n; i++) list[i].aura = false
  const r2 = screamerArch.auraRadius * screamerArch.auraRadius
  for (let i = 0; i < n; i++) {
    const s = list[i]
    if (s.type !== 'screamer' || s.dying || s.corpse) continue
    for (let j = 0; j < n; j++) {
      const z = list[j]
      if (z === s || z.type === 'screamer' || z.aura) continue
      const dx = s.x - z.x, dz = s.z - z.z
      if (dx * dx + dz * dz <= r2) { z.aura = true; any = true }
    }
  }
  return any
}
