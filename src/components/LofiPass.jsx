import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { modFx } from '../modifiers'
import { getBrightness, onBrightness } from '../brightness'

// Lo-fi horror final pass. The whole scene (world + viewmodel, which Gun/Knife render
// themselves at useFrame priority 1) is drawn into a small linear render target, then
// ONE fullscreen triangle upscales it with NEAREST filtering and applies, in a single
// shader: cheap mip-based bloom, tone map + sRGB output, split-toning colour grade,
// vignette, animated grain, Bayer 4x4 ordered dither and per-channel palette quantization.
//
// Tuning constants (all in this block):
export const LOFI_HEIGHT = 400      // internal render height in px (width follows aspect)
export const LOFI_LEVELS = 64       // palette levels per channel
const GRAIN = 0.02                 // film grain amplitude (display space)
const GRAIN_FPS = 14                // grain refresh rate
const VIGNETTE = 0.8               // edge brightness floor (1 = no vignette)
const BLOOM = 0.55                  // bloom strength
const BLOOM_THRESHOLD = 0.85        // linear luminance where glow starts
const SATURATION = 0.9
// Pre-tonemap gain per map (the grade eats shadows; the diner is already bright).
export const LOFI_EXPOSURE = { cabin: 2.4, diner: 1.1 }
const SHADOW_LIFT = '0.030, 0.045, 0.068' // cold floor lift (rgb) so dark rooms stay readable

// Dev/preview only: ?lofi=0 disables the pass (comparison screenshots).
const ALLOWED = import.meta.env.VITE_VERCEL_ENV !== 'production'
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
export const LOFI_ON = !(ALLOWED && params?.get('lofi') === '0')

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

const FRAG = /* glsl */`
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uAspect;
uniform float uExposure;
uniform float uTint;      // Bloodlust modifier: 0..1 red grade
varying vec2 vUv;

const float LEVELS = ${LOFI_LEVELS.toFixed(1)};
const float M[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 px = floor(vUv * uRes);
  vec2 uv = (px + 0.5) / uRes;
  vec3 col = textureLod(tScene, uv, 0.0).rgb;

  // Bloom: thresholded taps from high mips (the RT's own mip chain = free blur).
  vec2 o = 3.0 / uRes;
  vec3 b = textureLod(tScene, uv + vec2( o.x, o.y), 3.0).rgb
         + textureLod(tScene, uv + vec2(-o.x, o.y), 3.0).rgb
         + textureLod(tScene, uv + vec2( o.x,-o.y), 3.0).rgb
         + textureLod(tScene, uv + vec2(-o.x,-o.y), 3.0).rgb;
  b = b * 0.25 + textureLod(tScene, uv, 4.0).rgb;
  col += max(b - vec3(${BLOOM_THRESHOLD.toFixed(2)}), 0.0) * ${BLOOM.toFixed(2)};

  gl_FragColor = vec4(col * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Grade in display space.
  vec3 c = gl_FragColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c *= mix(vec3(0.82, 0.96, 1.14), vec3(1.12, 1.0, 0.84), smoothstep(0.12, 0.6, l));  // cold shadows / warm highlights
  c = mix(vec3(l), c, ${SATURATION.toFixed(2)});
  c += vec3(${SHADOW_LIFT}) * (1.0 - l);                                               // cold shadow lift
  c = mix(c, vec3(l * 1.25 + 0.05, l * 0.32, l * 0.3), uTint * 0.5);                  // bloodlust red grade
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);                                            // contrast
  vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= mix(${VIGNETTE.toFixed(2)}, 1.0, smoothstep(0.95, 0.25, length(d)));
  c += (hash(px + floor(uTime * ${GRAIN_FPS.toFixed(1)}) * 17.0) - 0.5) * ${GRAIN.toFixed(3)};

  // Ordered dither + palette quantization.
  ivec2 ip = ivec2(mod(px, 4.0));
  float t = M[ip.x + ip.y * 4] / 16.0 - 0.5 + 1.0 / 32.0;
  c = floor(clamp(c, 0.0, 1.0) * (LEVELS - 1.0) + 0.5 + t) / (LEVELS - 1.0);
  gl_FragColor = vec4(c, 1.0);
}`

// Internal height currently in use. FrameGovernor lowers it under load (400 -> 340 -> 288);
// only the render-target size changes, the look stays the same chunky pixels.
let _height = LOFI_HEIGHT
export function setLofiHeight(h) { _height = h }
export function getLofiTargetHeight() { return _api ? _api.rt.height : 0 }   // actual RT height (?perf overlay)

// Module-level handle so ForceRenderOnShopOpen can draw a complete lo-fi frame.
let _api = null
export function renderLofiNow(gl, scene, camera) {
  if (!_api) { gl.render(scene, camera); return }
  gl.setRenderTarget(_api.rt)
  gl.render(scene, camera)
  _api.present(gl)
}

function makeTarget(gl) {
  const ext = gl.extensions
  const hdr = !!gl.capabilities?.isWebGL2 && !!ext &&
    (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'))
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: true,
    depthBuffer: true,
  })
  return rt
}

export default function LofiPass({ exposure = 1 }) {
  const gl = useThree((s) => s.gl)

  const api = useMemo(() => {
    const rt = makeTarget(gl)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tScene: { value: rt.texture },
        uRes: { value: new THREE.Vector2(2, 2) },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uExposure: { value: 1 },
        uTint: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(mesh)
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const present = (r) => {
      r.setRenderTarget(null)
      const ac = r.autoClear
      r.autoClear = true
      r.render(quadScene, quadCam)
      r.autoClear = ac
    }
    return { rt, geo, mat, present }
  }, [gl])

  // Map exposure x the player's brightness setting (src/brightness.js)
  const baseExposure = useRef(exposure)
  useEffect(() => {
    const apply = (b) => { baseExposure.current = exposure * b; api.mat.uniforms.uExposure.value = baseExposure.current * modFx.exposureMul }
    apply(getBrightness())
    return onBrightness(apply)
  }, [api, exposure])

  useEffect(() => {
    _api = api
    return () => {
      if (_api === api) _api = null
      api.rt.dispose(); api.geo.dispose(); api.mat.dispose()
    }
  }, [api])

  // Before Gun/Knife (priority 1): size + bind the target so their gl.render calls land in it.
  useFrame(({ gl: r, size, clock }) => {
    const h = Math.min(_height, Math.max(2, Math.round(size.height)))
    const w = Math.max(2, Math.round(h * size.width / size.height))
    const { rt, mat } = api
    if (rt.width !== w || rt.height !== h) {
      rt.setSize(w, h)
      mat.uniforms.uRes.value.set(w, h)
      mat.uniforms.uAspect.value = w / h
    }
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uTint.value = modFx.tint
    mat.uniforms.uExposure.value = baseExposure.current * modFx.exposureMul   // Blackout dims the final pass
    r.setRenderTarget(rt)
  }, 0.5)

  // After them: upscale + grade to the canvas.
  useFrame(({ gl: r }) => { api.present(r) }, 2)

  return null
}
