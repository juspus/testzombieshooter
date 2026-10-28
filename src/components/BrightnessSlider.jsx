import { useState } from 'react'
import { getBrightness, setBrightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX } from '../brightness'

// Settings-panel brightness row; applies live (LofiPass listens).
export default function BrightnessSlider() {
  const [v, setV] = useState(getBrightness())
  return (
    <label className="ui-setting">
      Brightness
      <input
        type="range" className="ui-range" min={BRIGHTNESS_MIN} max={BRIGHTNESS_MAX} step={0.05} value={v}
        onChange={(e) => { const n = parseFloat(e.target.value); setBrightness(n); setV(n) }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </label>
  )
}
