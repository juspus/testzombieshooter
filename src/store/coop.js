// Co-op: the link to the partner and the "down, not out" state (machine in src/coopDown.js).
import { createCoop } from '../coopDown'

// Co-op link and down / revive state.
export const createCoopSlice = (set, get) => ({
  partnerMapId: null,   // co-op host: map the connected guest has loaded (null = unknown)
  setPartnerMapId: (id) => set({ partnerMapId: id }),

  // ── Multiplayer ──────────────────────────────────────────────────────────
  mpRole: null,       // 'host' | 'guest' | null
  mpConnected: false,
  remotePlayer: null, // { x, y, z, yaw, pitch }
  roomCode: null,

  setMpRole: (role, code = null) => set({ mpRole: role, roomCode: code }),
  setMpConnected: (v) => set({ mpConnected: v }),
  setRemotePlayer: (data) => set({ remotePlayer: data }),
  clearMp: () => set({ mpRole: null, mpConnected: false, remotePlayer: null, roomCode: null, coop: createCoop() }),

  // ── W5 co-op "Down, not out" (state machine: coopDown.js, orchestration: coopRuntime.js) ──
  // coop[role] = { status: 'alive'|'down'|'dead', bleed (s left), revive (0..1 hold progress) }.
  // Host-authoritative; the guest mirrors snapshots. Solo play never leaves 'alive'.
  coop: createCoop(),
  coopReviveProgress: 0,        // my own hold progress while reviving the partner (HUD ring)
  revivedPartnerEventId: 0,     // ++ each time I revive my partner (progression hooks subscribe to this)
  revivedByPartnerEventId: 0,   // ++ each time my partner revives me
  setCoop: (coop) => set({ coop }),
  coopNearPartner: false,       // standing within revive range of a downed partner (HUD prompt)
  setCoopNear: (v) => { if (get().coopNearPartner !== v) set({ coopNearPartner: v }) },
  setCoopReviveProgress: (v) => { if (get().coopReviveProgress !== v) set({ coopReviveProgress: v }) },
})
