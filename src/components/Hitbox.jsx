import { HB_GEO, HB_MAT, HITBOX_LAYER } from '../hitboxes'

// One invisible zombie hitbox (see src/hitboxes.js). Parent it to the group that animates the body
// part. Not rendered (visible=false), not a shadow caster, no zombieId (the hit flash and corpse
// freeze skip it), on its own layer so visual-tree raycasts never see it.
const UD = {
  head: { hitbox: 'head', isHead: true },
  torso: { hitbox: 'torso', isHead: false },
  leg: { hitbox: 'leg', isHead: false },
  arm: { hitbox: 'arm', isHead: false },
  limb: { hitbox: 'limb', isHead: false },
}

// Static: bake the local matrix once; the parent chain still moves the world matrix.
const prep = (m) => {
  if (!m) return
  m.layers.set(HITBOX_LAYER)
  m.updateMatrix()
  m.matrixAutoUpdate = false
}

export default function Hitbox({ part, box }) {
  if (!box) return null
  return <mesh ref={prep} geometry={HB_GEO} material={HB_MAT} position={box.p} scale={box.s} visible={false} userData={UD[part]} />
}
