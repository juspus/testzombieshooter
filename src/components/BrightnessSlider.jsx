import { useState } from 'react'
import { getBrightness, setBrightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX } from '../brightness'

// Start-screen brightness control; applies live (LofiPass listens).
export default function BrightnessSlider() {
  const [v, setV] = useState(getBrightness())
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
      color: '#555', fontSize: 'clamp(9px, 1.8vmin, 12px)', letterSpacing: 3,
      fontFamily: 'Courier New, monospace', textTransform: 'uppercase',
    }}>
      Brightness
      <input
        type="range" min={BRIGHTNESS_MIN} max={BRIGHTNESS_MAX} step={0.05} value={v}
        onChange={(e) => { const n = parseFloat(e.target.value); setBrightness(n); setV(n) }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 'min(160px, 30vw)', accentColor: '#8a1a1a' }}
      />
    </label>
  )
}
