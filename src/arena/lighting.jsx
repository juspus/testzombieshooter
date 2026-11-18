import LivingLights, { lightReg } from '../components/LivingLights'
import { CHEST_POS } from '../maps/cabin'
import { WH } from './shared'

// The cabin's lights, in mount order: ambient, moonlight (the one shadow caster), hemisphere, five point
// fills, then LivingLights. With the two fireplace lights (props.jsx) that is the 11 the perf budget counts.
// The number never changes at runtime: LivingLights and Storm find these through lightReg.
export default function ArenaLighting() {
  return (
    <>
      {/* ── Lighting ─────────────────────────────────────────────────────── */}
      <ambientLight ref={(o) => { lightReg.amb = o }} intensity={0.55} color="#c8d8f0" />
      {/* Moonlight — shadow map only hits 6 proxy meshes per zombie now */}
      <directionalLight position={[-20, 35, -15]} color="#d0e0ff" intensity={1.8} castShadow
        shadow-mapSize-width={512} shadow-mapSize-height={512}
        shadow-camera-near={1} shadow-camera-far={80}
        shadow-camera-left={-18} shadow-camera-right={18}
        shadow-camera-top={18} shadow-camera-bottom={-18}
      />
      {/* Hemisphere sky/ground fill */}
      <hemisphereLight skyColor="#3a5080" groundColor="#0a1808" intensity={0.4} />
      {/* ── Scene point lights — kept to a minimum to avoid shader recompilation
           stutter when zombie materials mount.  Per-candle/lantern lights removed;
           these four fills + the two fireplace lights cover all four rooms.      ── */}
      {/* Main room warm fill */}
      <pointLight ref={(o) => { lightReg.main = o }} position={[3.5, WH - 0.5,  0]}  color="#ffcc88" intensity={14} distance={24} decay={2} />
      {/* West rooms fill (bedroom / hall / kitchen share one broad light) */}
      <pointLight ref={(o) => { lightReg.bed = o }} position={[-5.5, WH - 0.5, -7]}  color="#ffaa66" intensity={12} distance={14} decay={2} />
      <pointLight ref={(o) => { lightReg.hall = o }} position={[-5.5, WH - 0.5,  0.5]} color="#ffaa55" intensity={12} distance={14} decay={2} />
      <pointLight ref={(o) => { lightReg.kitchen = o }} position={[-5.5, WH - 0.5,  7.5]} color="#ffaa55" intensity={10} distance={12} decay={2} />
      {/* Chest glow */}
      <pointLight ref={(o) => { lightReg.chest = o }} position={[CHEST_POS.x, 1.0, CHEST_POS.z]} color="#ffcc44" intensity={5} distance={8} decay={2} />

      <LivingLights />
    </>
  )
}
