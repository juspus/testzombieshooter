// Versus modes: the versus slice (src/versus.js) and Zombie Mail (src/mail.js, src/mailRuntime.js).
import { keyedRandom } from '../rng'
import { createCoop } from '../coopDown'
import { canSend, spend, mailItem, enqueue, nextDue, land } from '../mail'
import { getRole } from '../net'
import { activeSpawnClusters } from './shared'
import { buildMailZombies } from './spawns'

// Versus slice (src/versus.js). opponent: rival's last status { hp, maxHp, wave, kills, alive, at }.
export const createVersus = () => ({ active: false, mode: null, seed: null, linked: false, opponent: null, result: null, reason: null })

// Zombie Mail (src/mail.js). Separate from `versus` so that slice keeps its shape.
// incoming: deliveries from the rival waiting to land { id, item, edge, cluster, landAt };
// landAt is on the mail clock below. waveExtra: mailed zombies in the current wave (HUD total).
export const createMail = () => ({ meter: 0, sent: [], incoming: [], lastLandAt: -Infinity, waveExtra: 0, pendingModifier: null, seen: [], seq: 0, notice: null })

// Mail clock (seconds): advances only while a versus wave is playing and unpaused. Module state so
// the per-frame tick never writes the store.
export const mailClock = { t: 0 }

// Versus runs and Zombie Mail.
export const createVersusSlice = (set, get) => ({
  mail: createMail(),

  // ── Versus (src/versus.js): both players run their own world with one seed ──
  versus: createVersus(),
  versusLobbyMode: 'coop',   // lobby choice shared host -> guest: 'coop' | a VERSUS_MODES id
  setVersusLobbyMode: (m) => set({ versusLobbyMode: m }),
  // Starts a versus run: sets the slice, DETACHES from the co-op world (the net.js link stays
  // open, only mpRole / mpConnected drop so every co-op branch goes quiet), then seeds the run.
  startVersusRun: (mode, seed, side) => {
    set({
      versus: { ...createVersus(), active: true, mode, seed: String(seed), linked: true },
      mpRole: null, mpConnected: false, remotePlayer: null, partnerMapId: null, coop: createCoop(),
    })
    get().startSeededGame('versus', seed)
    if (mode === 'director') get().startDirector(side ?? getRole() ?? 'host')
  },
  setVersusOpponent: (opponent) => set((s) => ({ versus: { ...s.versus, opponent } })),
  // First result wins; it also ends the competition (linked false), so pause etc. return to normal.
  finishVersus: (result, reason = null) => {
    if (get().versus.result) return false
    set((s) => ({ versus: { ...s.versus, result, reason, linked: false } }))
    // The Director: the match is over for good (also a forfeit): freeze the world under the result card.
    if (get().director.active) set((s) => ({ director: { ...s.director, result, role: null, stage: 'over', windowLeft: 0 }, paused: true }))
    return true
  },
  clearVersus: () => set({ versus: createVersus() }),

  // ── Zombie Mail (src/mail.js, src/mailRuntime.js) ──
  // Sender: pay for an item. Returns the mail id to put on the wire, or null when mail is not allowed.
  spendMail: (itemId) => {
    const s = get()
    const it = mailItem(itemId)
    if (!it || s.runMode !== 'versus' || s.versus.mode !== 'mail' || !s.versus.linked || s.versus.result) return null
    if (s.phase === 'dead' || s.phase === 'start' || !canSend(s.mail.meter, it)) return null
    const id = `m${s.mail.seq + 1}`
    set({ mail: { ...s.mail, meter: spend(s.mail.meter, it), seq: s.mail.seq + 1, sent: [...s.mail.sent, { id, item: it.id }] } })
    return id
  },
  // Receiver: queue a delivery from the rival. Zombie items wait for the mail clock (5 s warning,
  // 4 s apart) and only land while a wave is playing; Blackout sets the next wave's modifier.
  receiveMail: ({ id, item }) => {
    const s = get()
    const it = mailItem(item)
    if (!it || typeof id !== 'string' || s.runMode !== 'versus' || s.versus.mode !== 'mail' || !s.versus.linked || s.versus.result) return false
    if (s.phase === 'dead' || s.phase === 'start' || s.mail.seen.includes(id)) return false
    const seen = [...s.mail.seen, id]
    if (it.modifier && s.phase !== 'playing') {
      // Between waves there is nothing to warn about: intermission re-rolls the wave that is about to
      // start, wave_clear leaves it for the next nextWave().
      if (s.phase === 'intermission') set({ waveModifier: it.modifier, mail: { ...s.mail, seen, notice: { text: 'MAIL: BLACKOUT · NEXT WAVE', at: Date.now() } } })
      else set({ mail: { ...s.mail, seen, pendingModifier: it.modifier, notice: { text: 'MAIL: BLACKOUT · NEXT WAVE', at: Date.now() } } })
      return true
    }
    const clusters = activeSpawnClusters(s.openDoors)
    const cluster = it.modifier ? 0 : Math.min(clusters.length - 1, Math.floor(keyedRandom('mail-cluster', id) * clusters.length))
    const q = enqueue({ list: s.mail.incoming, lastLandAt: s.mail.lastLandAt }, { id, item: it.id, edge: clusters[cluster]?.edge, cluster }, mailClock.t)
    set({ mail: { ...s.mail, seen, incoming: q.list } })
    return true
  },
  // Lands at most one due delivery per call. Only runs while a wave is playing (see tick()).
  mailTick: (delta) => {
    mailClock.t += delta
    const s = get()
    if (!s.mail.incoming.length || s.lastKillPending) return
    const q = { list: s.mail.incoming, lastLandAt: s.mail.lastLandAt }
    const due = nextDue(q, mailClock.t)
    if (!due) return
    const nq = land(q, due.id, mailClock.t)
    const it = mailItem(due.item)
    const mail = { ...s.mail, incoming: nq.list, lastLandAt: nq.lastLandAt }
    if (it?.modifier) { set({ mail: { ...mail, pendingModifier: it.modifier } }); return }
    const clusters = activeSpawnClusters(s.openDoors)
    const made = buildMailZombies(due, it?.types ?? [], s.nextId, clusters[due.cluster] ?? clusters[0], s.waveModifier)
    const active = s.zombies.filter((z) => !z.dying).length
    const slots = Math.max(0, 25 - active)
    set({
      zombies: [...s.zombies, ...made.slice(0, slots)],
      pendingSpawns: [...s.pendingSpawns, ...made.slice(slots)],
      nextId: s.nextId + made.length,
      mail: { ...mail, waveExtra: mail.waveExtra + made.length },
    })
  },
})
