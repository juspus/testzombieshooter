// Sound & Weapon Lab  (/?testlab). Soundboard only - the 3-D model viewer moved
// to the Model Playground (/?models, src/playground/).
import { useState, useCallback } from 'react'
import {
  playGunshot, playReload, playEmptyClick, playZombieDie,
  playFootstep, playZombieFootstep, playPlankHit, playPlankBreak,
  playScreamerScreech, playPumpAction, playShellThonk, playKnifeSwing,
  startEerieMusic, stopEerieMusic,
} from '../sounds'

const FONT = "'Courier New', Courier, monospace"

// ─── Data ────────────────────────────────────────────────────────────────────
const GROUPS = [
  { title: 'Weapons', sounds: [
    { id: 'pistol_shot',  label: 'Pistol Shot',  fn: () => playGunshot('pistol'),  dur: 200 },
    { id: 'shotgun_shot', label: 'Shotgun Shot', fn: () => playGunshot('shotgun'), dur: 500 },
    { id: 'pump',         label: 'Pump Action',  fn: playPumpAction,   dur: 250 },
    { id: 'reload',       label: 'Reload',       fn: playReload,       dur: 1100 },
    { id: 'empty',        label: 'Empty Click',  fn: playEmptyClick,   dur: 100 },
    { id: 'shell',        label: 'Shell Thonk',  fn: playShellThonk,   dur: 150 },
    { id: 'knife_swing',  label: 'Knife Swing',  fn: playKnifeSwing,   dur: 280 },
  ] },
  { title: 'Zombies', sounds: [
    { id: 'zombie_die',  label: 'Zombie Die',  fn: playZombieDie,       dur: 600 },
    { id: 'zombie_step', label: 'Zombie Step', fn: playZombieFootstep,  dur: 200 },
    { id: 'screech',     label: 'Screech',     fn: playScreamerScreech, dur: 800 },
  ] },
  { title: 'World', sounds: [
    { id: 'footstep',    label: 'Footstep',    fn: playFootstep,    dur: 150 },
    { id: 'plank_hit',   label: 'Plank Hit',   fn: playPlankHit,    dur: 200 },
    { id: 'plank_break', label: 'Plank Break', fn: playPlankBreak,  dur: 350 },
    { id: 'music_on',    label: 'Start Music', fn: startEerieMusic, dur: 600 },
    { id: 'music_off',   label: 'Stop Music',  fn: stopEerieMusic,  dur: 300 },
  ] },
]

const linkBtn = {
  background: '#141414', border: '1px solid #333', color: '#aaa', padding: '10px 14px',
  minHeight: 44, display: 'flex', alignItems: 'center', textDecoration: 'none',
  fontFamily: FONT, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', borderRadius: 4,
}

export default function TestLab() {
  const [playing, setPlaying] = useState(null)

  const handlePlay = useCallback((sound) => {
    sound.fn()
    setPlaying(sound.id)
    setTimeout(() => setPlaying((prev) => (prev === sound.id ? null : prev)), sound.dur + 200)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#080808', color: '#ccc', fontFamily: FONT,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', userSelect: 'none',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
        padding: 'max(10px, env(safe-area-inset-top)) 12px 10px', background: '#0f0f0f', borderBottom: '1px solid #222',
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: '#ff4400', textTransform: 'uppercase', marginRight: 'auto' }}>
          Sound &amp; Weapon Lab
        </span>
        <a href="/?models" style={linkBtn}>3D Models</a>
        <a href="/" style={linkBtn}>← Game</a>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, WebkitOverflowScrolling: 'touch' }}>
        {GROUPS.map((g) => (
          <section key={g.title} style={{ marginBottom: 18 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 11, letterSpacing: 3, color: '#666', textTransform: 'uppercase', fontWeight: 400 }}>{g.title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {g.sounds.map((sound) => {
                const active = playing === sound.id
                return (
                  <button key={sound.id} data-testid={`snd-${sound.id}`} onClick={() => handlePlay(sound)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    minHeight: 88, padding: '12px 6px', borderRadius: 6, cursor: 'pointer',
                    background: active ? '#150800' : '#0f0f0f',
                    border: `1px solid ${active ? '#ff4400' : '#252525'}`,
                    color: active ? '#ff7744' : '#999',
                    boxShadow: active ? '0 0 10px rgba(255,68,0,0.35)' : 'none',
                    fontFamily: FONT, letterSpacing: 1, fontSize: 11, textTransform: 'uppercase', lineHeight: 1.3,
                    transition: 'all 0.12s', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                  }}>
                    <span>{sound.label}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
