import { useSettings } from '../settings'
import { playVolumePreview } from '../sounds'
import { VOLUME_ROWS } from './PauseMenu'

// Start-menu Audio section (UI kit rows). The in-run pause panel has the same three
// sliders in ControlSettings. Applies live through the settings store (sounds.js listens).
export default function VolumeSliders() {
  const st = useSettings()
  return VOLUME_ROWS.map(([key, label, preview]) => (
    <label key={key} className="ui-setting">
      <span>{label} <span className="ui-setting__val">{Math.round(st[key] * 100)}%</span></span>
      <input
        type="range" className="ui-range" min={0} max={1} step={0.05} value={st[key]}
        aria-label={`${label} volume`}
        onChange={(e) => { st.setSetting(key, parseFloat(e.target.value)); playVolumePreview(preview) }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </label>
  ))
}
