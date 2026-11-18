// Settings and username panels of the start menu.
import { useState } from 'react'
import { signInWithGoogle, signOut, setUsername as saveUsername } from '../../supabase'
import { getReduceMotion, setReduceMotion } from '../../cameraFeel'
import BrightnessSlider from '../BrightnessSlider'
import VolumeSliders from '../VolumeSliders'
import { Button, SectionLabel } from '../ui'
import { ControlSettings } from '../PauseMenu'
import useMenuEnv from '../../menuTouch'
import { GoogleIcon } from './shared'

export function SettingsPanel({ user, username, onRename }) {
  const { touch } = useMenuEnv()
  return (
    <div>
      {touch && (
        <>
          <SectionLabel>Controls</SectionLabel>
          <ControlSettings brightness={false} audio={false} />
        </>
      )}
      <SectionLabel style={touch ? { marginTop: 18 } : undefined}>Audio</SectionLabel>
      <VolumeSliders />
      <SectionLabel style={{ marginTop: 18 }}>Display</SectionLabel>
      <BrightnessSlider />
      <ReduceMotionToggle />
      <SectionLabel style={{ marginTop: 18 }}>Account</SectionLabel>
      {user ? (
        <div className="ui-setting">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffe066', textTransform: 'none', letterSpacing: 1, minWidth: 0 }}>
            {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" className="ui-avatar" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username ?? '…'}</span>
          </span>
          <span className="ui-row" style={{ flexWrap: 'nowrap' }}>
            {username && <Button size="sm" onClick={onRename}>Rename</Button>}
            <Button size="sm" onClick={() => signOut()}>Sign out</Button>
          </span>
        </div>
      ) : (
        <div className="ui-stack">
          <Button block onClick={() => signInWithGoogle()}><GoogleIcon /> Sign in with Google</Button>
          <div className="ui-note">Keeps your progress across devices and your name on the leaderboard.</div>
        </div>
      )}
    </div>
  )
}

// Tiny accessibility option: turns off head bob + fire kick (weapon sway stays, subtler).
function ReduceMotionToggle() {
  const [on, setOn] = useState(getReduceMotion())
  return (
    <div className="ui-setting">
      Reduce motion
      <Button size="sm" aria-pressed={on} onClick={() => { setReduceMotion(!on); setOn(!on) }} style={{ minWidth: 64 }}>
        {on ? 'On' : 'Off'}
      </Button>
    </div>
  )
}

export function UsernamePickerView({ onDone }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'saving' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = async () => {
    if (value.trim().length < 2 || status === 'saving') return
    setStatus('saving')
    try {
      await saveUsername(value)
      onDone()
    } catch (err) {
      setErrorMsg(err?.message?.includes('unique') ? 'Name taken' : 'Error')
      setStatus('error')
    }
  }

  return (
    <div className="ui-stack">
      <div className="ui-note">Shown on the leaderboard.</div>
      <div className="ui-field">
        <input
          className="ui-input"
          value={value}
          onChange={(e) => { setValue(e.target.value.slice(0, 24)); setStatus('idle'); setErrorMsg('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="YourName"
          maxLength={24}
          autoFocus
        />
        <Button variant="primary" onClick={handleSave} disabled={value.trim().length < 2 || status === 'saving'}>
          {status === 'saving' ? '…' : 'Save'}
        </Button>
      </div>
      {errorMsg && <div className="ui-note" style={{ color: '#cc4444' }}>{errorMsg}</div>}
    </div>
  )
}
