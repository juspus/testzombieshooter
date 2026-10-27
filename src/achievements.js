// Wave 4 achievements: ~20 visible + 5 hidden ("???" until earned). Pure data + a
// pure evaluator; the tracker (progressTracker.js) owns persistence and toasts.
//
// ctx passed to `test`:
//   evt   the event being processed ({ name, ... } - same events as challenges.js)
//   run   live run counters (see newRun() in progressTracker.js)
//   life  lifetime counters INCLUDING the live run: { totalKills, totalHeadshots, totalKnifeKills, bestWave, level }
//   doorsTotal  buyable doors on the active map (0 on door-less maps -> door achievements can't fire)
// Earned achievements are stored as { [id]: unix-day } in stats.achievements.

export const ACHIEVEMENTS = [
  { id: 'wave5',  name: 'Getting Started', desc: 'Reach wave 5', test: ({ run }) => run.wave >= 5 },
  { id: 'wave10', name: 'Double Digits',   desc: 'Reach wave 10', test: ({ run }) => run.wave >= 10 },
  { id: 'wave15', name: 'Dug In',          desc: 'Reach wave 15', test: ({ run }) => run.wave >= 15 },
  { id: 'wave20', name: 'Cabin Legend',    desc: 'Reach wave 20', test: ({ run }) => run.wave >= 20 },
  { id: 'first_blood', name: 'First Blood', desc: 'Kill your first zombie', test: ({ life }) => life.totalKills >= 1 },
  { id: 'kills_1000', name: 'Exterminator', desc: 'Kill 1,000 zombies in total', test: ({ life }) => life.totalKills >= 1000 },
  { id: 'headshots_100', name: 'Dead Eye', desc: 'Get 100 headshots in total', test: ({ life }) => life.totalHeadshots >= 100 },
  { id: 'marksman', name: 'Marksman', desc: 'Get 15 headshots in one run', test: ({ run }) => run.headshots >= 15 },
  { id: 'knife_50', name: 'Cold Steel', desc: 'Kill 50 zombies with the knife in total', test: ({ life }) => life.totalKnifeKills >= 50 },
  { id: 'knife_boss', name: 'Up Close', desc: 'Kill a boss with the knife', test: ({ evt }) => evt.name === 'kill' && evt.type === 'boss' && evt.source === 'knife' },
  { id: 'all_doors', name: 'Open House', desc: 'Open every door in one run', test: ({ run, doorsTotal }) => doorsTotal > 0 && run.doors.size >= doorsTotal },
  { id: 'nuke_20', name: 'Mushroom Cloud', desc: 'Nuke 20+ zombies at once', test: ({ evt }) => evt.name === 'nuke' && evt.count >= 20 },
  { id: 'upgrade', name: 'Tinkerer', desc: 'Upgrade a weapon at the bench', test: ({ evt }) => evt.name === 'upgrade' },
  { id: 'box_crossbow', name: 'Lucky Draw', desc: 'Take a crossbow from the Mystery Box', test: ({ evt }) => evt.name === 'box_take' && evt.weapon === 'crossbow' },
  { id: 'horde', name: 'Hordebreaker', desc: 'Survive a Horde wave', test: ({ evt }) => evt.name === 'wave_clear' && evt.modifier === 'horde' },
  { id: 'blackout', name: 'Lights Out', desc: 'Survive a Blackout wave', test: ({ evt }) => evt.name === 'wave_clear' && evt.modifier === 'blackout' },
  { id: 'burst3', name: 'Domino Effect', desc: 'Kill 3 zombies with one Exploder burst', test: ({ evt }) => evt.name === 'burst' && evt.count >= 3 },
  { id: 'powerups5', name: 'Power Hungry', desc: 'Collect 5 power-ups in one run', test: ({ run }) => run.powerups >= 5 },
  { id: 'level10', name: 'Veteran', desc: 'Reach player level 10', test: ({ life }) => life.level >= 10 },
  { id: 'daily', name: 'Creature of Habit', desc: 'Complete a daily challenge', test: ({ evt }) => evt.name === 'challenge_done' && evt.scope === 'daily' },
  { id: 'weekly', name: 'Long Haul', desc: 'Complete the weekly challenge', test: ({ evt }) => evt.name === 'challenge_done' && evt.scope === 'weekly' },

  // Hidden: shown as "???" until earned.
  { id: 'pistol_10', name: 'Pistol Whipped', desc: 'Reach wave 10 with nothing but the starting pistol', hidden: true,
    test: ({ run }) => run.wave >= 10 && run.pistolOnly },
  { id: 'boss_rush', name: 'Boss Rush', desc: 'Kill 3 bosses in one run', hidden: true, test: ({ run }) => run.bossKills >= 3 },
  { id: 'pyro', name: 'Pyromaniac', desc: 'Burn 50 zombies to death in one run', hidden: true, test: ({ run }) => run.flameKills >= 50 },
  { id: 'chain', name: 'Chain Reaction', desc: 'Kill 5 zombies with one Exploder burst', hidden: true, test: ({ evt }) => evt.name === 'burst' && evt.count >= 5 },
  { id: 'carpenter_free', name: 'No Time for Carpentry', desc: 'Clear 5 waves in a row without boarding a window', hidden: true, test: ({ run }) => run.noBoardStreak >= 5 },
]

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))

/** Ids newly earned by this ctx (not yet in `earned`). Never throws on a bad test. */
export function evaluateAchievements(ctx, earned = {}) {
  const out = []
  for (const a of ACHIEVEMENTS) {
    if (earned[a.id]) continue
    try { if (a.test(ctx)) out.push(a.id) } catch { /* ignore */ }
  }
  return out
}

/** Display rows for the list view: hidden + unearned shows "???". */
export function achievementRows(earned = {}) {
  return ACHIEVEMENTS.map((a) => {
    const got = !!earned[a.id]
    return { id: a.id, got, name: got || !a.hidden ? a.name : '???', desc: got || !a.hidden ? a.desc : 'Hidden achievement' }
  })
}
