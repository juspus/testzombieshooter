// Triangle / mesh counting for the model playground. Skips invisible subtrees
// (e.g. RemotePlayer keeps every helmet/armour variant mounted but hidden).
export function countScene(root) {
  let tris = 0
  let meshes = 0
  const walk = (o) => {
    if (!o.visible) return
    if (o.isMesh && o.geometry) {
      meshes++
      const g = o.geometry
      const n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0
      tris += Math.floor(n / 3)
    }
    for (const c of o.children) walk(c)
  }
  if (root) walk(root)
  return { tris, meshes }
}
