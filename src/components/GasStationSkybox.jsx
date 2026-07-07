import { useMemo } from 'react'
import * as THREE from 'three'

// Same cylinder-skybox recipe as ForestSkybox.jsx: 1 draw call, 1 scene node,
// zero per-frame cost, no shadows. Depicts the empty highway and distant
// skyline beyond the gas station forecourt (the forecourt itself — pumps,
// canopy — is real geometry in DinerArena.jsx, not painted here).

const SKYBOX_RADIUS = 46
const SKYBOX_HEIGHT = 70
const TEXTURE_WIDTH = 2048
const TEXTURE_HEIGHT = 512

const palette = {
  skyTop: '#05070f',
  skyMid: '#0a0f1c',
  skyLow: '#141a24',
  moon: '#56606c',
  cloud: '#10131e',
  farBuilding: '#0a0d14',
  midBuilding: '#080a10',
  nearSilhouette: '#020304',
  roadAsphalt: '#0c0c0e',
  roadLine: '#3a3a30',
  wire: '#0a0c10',
  windowLit: '#d8a84a',
  windowDim: '#3a3428',
  signGlow: '#d84048',
  groundHaze: '#141210',
}

function createRandom(seed) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function drawBuilding(ctx, rng, x, baseY, height, width, color) {
  ctx.fillStyle = color
  ctx.fillRect(x - width / 2, baseY - height, width, height)
  // Sparse lit/dim windows
  const cols = Math.max(2, Math.floor(width / 14))
  const rows = Math.max(2, Math.floor(height / 16))
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const wx = x - width / 2 + 6 + c * (width / cols)
      const wy = baseY - height + 8 + r * (height / rows)
      ctx.fillStyle = rng() < 0.14 ? palette.windowLit : palette.windowDim
      ctx.fillRect(Math.floor(wx), Math.floor(wy), 4, 6)
    }
  }
}

function makeGasStationTexture() {
  if (typeof document === 'undefined') return null

  const rng = createRandom(0x6a5051)
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false

  const sky = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT)
  sky.addColorStop(0, palette.skyTop)
  sky.addColorStop(0.55, palette.skyMid)
  sky.addColorStop(1, palette.skyLow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  // Muted moon, reused motif from the forest skybox for tonal consistency.
  const moonX = TEXTURE_WIDTH * 0.22
  const moonY = TEXTURE_HEIGHT * 0.16
  const glow = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 150)
  glow.addColorStop(0, 'rgba(86, 96, 108, 0.25)')
  glow.addColorStop(1, 'rgba(86, 96, 108, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  ctx.fillStyle = palette.moon
  ctx.beginPath()
  ctx.arc(moonX, moonY, 16, 0, Math.PI * 2)
  ctx.fill()

  // Stars
  for (let i = 0; i < 160; i += 1) {
    ctx.fillStyle = rng() < 0.8 ? '#2c3648' : '#44506a'
    ctx.fillRect(Math.floor(rng() * TEXTURE_WIDTH), Math.floor(10 + rng() * 190), 1, 1)
  }

  // Low haze band at the horizon
  const haze = ctx.createLinearGradient(0, 300, 0, 360)
  haze.addColorStop(0, 'rgba(20,18,16,0)')
  haze.addColorStop(1, palette.groundHaze)
  ctx.fillStyle = haze
  ctx.fillRect(0, 300, TEXTURE_WIDTH, 60)

  // Far skyline — distant town silhouette, low and sparse
  for (let x = -40; x < TEXTURE_WIDTH + 40; x += 30 + rng() * 40) {
    drawBuilding(ctx, rng, x, 330 + rng() * 6, 30 + rng() * 60, 18 + rng() * 22, palette.farBuilding)
  }

  // Mid skyline — bigger, sparser boxes (occasional roadside billboard/building)
  for (let x = -60; x < TEXTURE_WIDTH + 60; x += 90 + rng() * 120) {
    if (rng() < 0.65) drawBuilding(ctx, rng, x, 342 + rng() * 8, 60 + rng() * 90, 30 + rng() * 26, palette.midBuilding)
  }

  // Power line poles marching along the roadside
  ctx.strokeStyle = palette.wire
  ctx.lineWidth = 1
  let lastTopX = -50, lastTopY = 300
  for (let x = -50; x < TEXTURE_WIDTH + 50; x += 70) {
    const poleH = 46 + rng() * 6
    const topY = 348 - poleH
    ctx.fillStyle = palette.nearSilhouette
    ctx.fillRect(x - 2, topY, 4, poleH)
    ctx.fillRect(x - 14, topY, 28, 3)
    ctx.beginPath()
    ctx.moveTo(lastTopX, lastTopY + 6)
    ctx.lineTo(x, topY + 6)
    ctx.stroke()
    lastTopX = x
    lastTopY = topY
  }

  // Foreground: flat empty highway sweeping to the horizon
  ctx.fillStyle = palette.roadAsphalt
  ctx.fillRect(0, 350, TEXTURE_WIDTH, TEXTURE_HEIGHT - 350)
  for (let x = 0; x < TEXTURE_WIDTH; x += 46) {
    ctx.fillStyle = palette.roadLine
    ctx.fillRect(x, 350, 22, 3)
  }

  // Cracked shoulder/verge, close-in silhouette to hem in the lot like the cabin's treeline
  ctx.fillStyle = palette.nearSilhouette
  for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
    const edgeY = 405 + 10 * Math.sin((x / TEXTURE_WIDTH) * Math.PI * 6) + 6 * Math.sin((x / TEXTURE_WIDTH) * Math.PI * 17)
    ctx.fillRect(x, edgeY, 1, TEXTURE_HEIGHT - edgeY)
  }
  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = rng() < 0.5 ? '#181614' : '#0c0a08'
    ctx.fillRect(rng() * TEXTURE_WIDTH, 410 + rng() * 100, 2 + rng() * 5, 1 + rng() * 3)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true

  return texture
}

export default function GasStationSkybox() {
  const texture = useMemo(() => makeGasStationTexture(), [])

  if (!texture) return null

  return (
    <mesh position={[0, 22, 0]} frustumCulled={false} renderOrder={-100}>
      <cylinderGeometry args={[SKYBOX_RADIUS, SKYBOX_RADIUS, SKYBOX_HEIGHT, 96, 1, true]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  )
}
