// WebRTC voice chat via PeerJS media calls.
// Architecture: guest calls host (guest knows host peer ID = room code).
// Host answers. Both sides exchange streams → bidirectional audio.
// PTT: local audio track disabled by default; enabled only while V is held.

let _call = null
let _localStream = null
let _remoteAudio = null
let _talking = false
let _onTalkingChange = null

export function onTalkingChange(fn) { _onTalkingChange = fn }

async function _getStream() {
  if (_localStream) return _localStream
  _localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  _localStream.getAudioTracks().forEach((t) => { t.enabled = false })
  return _localStream
}

function _attachRemoteStream(remoteStream) {
  if (_remoteAudio) {
    _remoteAudio.srcObject = remoteStream
    return
  }
  _remoteAudio = new Audio()
  _remoteAudio.srcObject = remoteStream
  _remoteAudio.autoplay = true
  // Required on some browsers to unblock autoplay
  _remoteAudio.play().catch(() => {})
}

// Called by the host: listen for the guest's incoming call
export function listenForCall(peer) {
  peer.on('call', async (call) => {
    const stream = await _getStream()
    call.answer(stream)
    call.on('stream', _attachRemoteStream)
    call.on('close', teardownVoice)
    _call = call
  })
}

// Called by the guest: call the host
export async function callHost(peer, hostPeerId) {
  const stream = await _getStream()
  const call = peer.call(hostPeerId, stream)
  call.on('stream', _attachRemoteStream)
  call.on('close', teardownVoice)
  _call = call
}

export function setPTT(active) {
  if (!_localStream) return
  _localStream.getAudioTracks().forEach((t) => { t.enabled = active })
  if (_talking !== active) {
    _talking = active
    _onTalkingChange?.(active)
  }
}

export function isTalking() { return _talking }

export function teardownVoice() {
  try { _call?.close() } catch {}
  try { _localStream?.getTracks().forEach((t) => t.stop()) } catch {}
  if (_remoteAudio) { _remoteAudio.srcObject = null }
  _call = null
  _localStream = null
  _talking = false
  _onTalkingChange?.(false)
}
