// The public list of open runs (supabase/migrations/20261122000000_open_runs.sql): a notice board
// of solo runs whose host opened them mid-run. Joining itself is peer to peer by room code
// (net.js / lateJoin.js); these calls only list, refresh and remove the notices.
// Every call degrades: a missing migration or network error lists nothing and never throws
// into the game (listOpenRuns rejects with Error('unavailable') so the panel can say so).
import { getSupabase, isMissingSchema } from './supabase'

export const OPEN_RUN_HEARTBEAT_MS = 20000

/** Room codes as net.js makes them: 5 chars from the unambiguous alphabet. */
export const isRoomCode = (c) => typeof c === 'string' && /^[A-HJ-NP-Z2-9]{5}$/.test(c)

/** Clean the rows from list_open_runs: valid codes, own map / protocol, no duplicates. */
export function cleanRuns(rows, map, proto) {
  const seen = new Set()
  const out = []
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !isRoomCode(r.code) || r.map !== map || r.proto !== proto || seen.has(r.code)) continue
    seen.add(r.code)
    out.push({ code: r.code, wave: Number.isInteger(r.wave) ? r.wave : 1, updatedAt: r.updated_at ?? null })
  }
  return out
}

export async function listOpenRuns(map, proto) {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('list_open_runs', { p_map: map, p_proto: proto })
  if (error) throw new Error(isMissingSchema(error) ? 'unavailable' : 'failed')
  return cleanRuns(data, map, proto)
}

/** Create or refresh this host's notice. Resolves false on any failure. */
export async function publishOpenRun({ code, secret, map, wave, proto }) {
  try {
    const supabase = await getSupabase()
    const { error } = await supabase.rpc('open_run_upsert', { p_code: code, p_secret: secret, p_map: map, p_wave: wave, p_proto: proto })
    return !error
  } catch { return false }
}

export async function closeOpenRun(code, secret) {
  try {
    const supabase = await getSupabase()
    await supabase.rpc('open_run_close', { p_code: code, p_secret: secret })
  } catch { /* the row goes stale in 60 s anyway */ }
}
