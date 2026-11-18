// Procedural sound synthesis via Web Audio API — no audio files required.
// The implementation lives in src/sounds/*: this file only re-exports it, so no importer changes.
// All AudioContext and bus state is in sounds/core.js (one context, one set of buses).
export {
  getAudioContext,
  installAudioUnlock,
  playVolumePreview,
  setAudioHold,
  setDangerMuffle,
  setSlowMoMuffle,
  volumeCurve,
} from './sounds/core'
export {
  setListenerPose,
} from './sounds/spatial'
export {
  playBoltPickup,
  playCrossbowReload,
  playEmptyClick,
  playGrenadeBoom,
  playGrenadeBounce,
  playGrenadePin,
  playGrenadeThrow,
  playGrenadeTick,
  playGunshot,
  playKnifeSwing,
  playPumpAction,
  playReload,
  playRemoteGunshot,
  playRemoteKnifeSwing,
  playShellThonk,
  startFlamethrowerSound,
  stopFlamethrowerSound,
} from './sounds/weapons'
export {
  playAcidSplash,
  playArmorPing,
  playExploderHiss,
  playExplosion,
  playScreamerScreech,
  playSpiderLand,
  playSpiderShriek,
  playSpiderSkitter,
  playSpitLaunch,
  playSpitWindup,
  playZombieDie,
  playZombieFootstep,
  playZombieGroan,
  zombieGroanAllowed,
} from './sounds/zombies'
export {
  playBenchDone,
  playBenchWork,
  playBoxCycle,
  playBoxJingle,
  playBoxTeddy,
  playDoorDenied,
  playDoorOpen,
  playGlassShatter,
  playPlankBreak,
  playPlankHit,
  playThunder,
  setRainIndoor,
  startRain,
  stopRain,
} from './sounds/world'
export {
  setMusicIntensity,
  startEerieMusic,
  stopEerieMusic,
} from './sounds/music'
export {
  playFootstep,
  playHeadshotTink,
  playHitTick,
  playKillConfirm,
  playLastKillSting,
  playPowerupDrop,
  playPowerupPickup,
  playRemoteFootstep,
  setHeartbeatIntensity,
  startHeartbeat,
  stopHeartbeat,
} from './sounds/player'
