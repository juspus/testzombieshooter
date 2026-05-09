import { useGameStore } from '../store'
import { WALL_HEIGHT, WALL_THICKNESS, WIN_BOTTOM, WIN_TOP } from '../walls'

const MAT_COLOR = '#4a4a4a'
const MAT_ROUGH = 0.85

function WallSegment({ x, y, z, w, h, d }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={MAT_COLOR} roughness={MAT_ROUGH} />
    </mesh>
  )
}

function WallMesh({ wall }) {
  const { x, z, axis, halfLen, wStart, wEnd } = wall
  const T = WALL_THICKNESS

  const winH  = WIN_TOP - WIN_BOTTOM
  const topH  = WALL_HEIGHT - WIN_TOP
  const midW  = wEnd - wStart           // width of window opening
  const leftL = wStart + halfLen        // length of left solid section
  const rightL = halfLen - wEnd         // length of right solid section

  if (axis === 'x') {
    const lCX = (-halfLen + wStart) / 2
    const rCX = (wEnd + halfLen) / 2
    const mCX = (wStart + wEnd) / 2
    return (
      <group position={[x, 0, z]}>
        {leftL > 0.05 && <WallSegment x={lCX} y={WALL_HEIGHT / 2} z={0} w={leftL} h={WALL_HEIGHT} d={T} />}
        {rightL > 0.05 && <WallSegment x={rCX} y={WALL_HEIGHT / 2} z={0} w={rightL} h={WALL_HEIGHT} d={T} />}
        <WallSegment x={mCX} y={WIN_BOTTOM / 2}        z={0} w={midW} h={WIN_BOTTOM} d={T} />
        {topH > 0 && <WallSegment x={mCX} y={WIN_TOP + topH / 2} z={0} w={midW} h={topH} d={T} />}
      </group>
    )
  } else {
    const lCZ = (-halfLen + wStart) / 2
    const rCZ = (wEnd + halfLen) / 2
    const mCZ = (wStart + wEnd) / 2
    return (
      <group position={[x, 0, z]}>
        {leftL > 0.05 && <WallSegment x={0} y={WALL_HEIGHT / 2} z={lCZ} w={T} h={WALL_HEIGHT} d={leftL} />}
        {rightL > 0.05 && <WallSegment x={0} y={WALL_HEIGHT / 2} z={rCZ} w={T} h={WALL_HEIGHT} d={rightL} />}
        <WallSegment x={0} y={WIN_BOTTOM / 2}        z={mCZ} w={T} h={WIN_BOTTOM} d={midW} />
        {topH > 0 && <WallSegment x={0} y={WIN_TOP + topH / 2} z={mCZ} w={T} h={topH} d={midW} />}
      </group>
    )
  }
}

export default function Walls() {
  const walls = useGameStore((s) => s.walls)
  return (
    <>
      {walls.map((w) => <WallMesh key={w.id} wall={w} />)}
    </>
  )
}
