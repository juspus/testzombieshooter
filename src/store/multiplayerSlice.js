export const createMultiplayerSlice = (set, get) => ({
  mpRole: null,       // 'host' | 'guest' | null
  mpConnected: false,
  remotePlayer: null, // { x, y, z, yaw, pitch }
  roomCode: null,

  setMpRole: (role, code = null) => set({ mpRole: role, roomCode: code }),
  setMpConnected: (v) => set({ mpConnected: v }),
  setRemotePlayer: (data) => set({ remotePlayer: data }),
  clearMp: () => set({ mpRole: null, mpConnected: false, remotePlayer: null, roomCode: null }),
})
