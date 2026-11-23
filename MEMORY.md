# MEMORY.md

Running journal for picking up context across sessions. Read this at the
start of every session. Keep entries short — a few lines each.

## Active

- JOIN MID-RUN + PHONE LAYOUT (2026-11-22, cards r-midjoin, r-mobiletext; PR #144 with
  r-continue). Owner picked a PUBLIC list of open runs (not friends-only) and pistol + money scaled
  to wave for joiners. Join lands at the next wave countdown, never mid-fight. Needs migration
  `20261122000000_open_runs.sql` applied in Supabase; without it the list says "not available yet"
  and the room still works by code. Phone: intermission is a one-line strip with a small SKIP,
  landscape start menu in two columns, death screen fits. Desktop pause key P (new).

- CONTINUE A RUN (2026-11-22, owner: "continue my run from the last wave whenever I disconnect or
  die"; card r-continue). Owner picked: solo only (tab closed / crash), one unranked retry on death.
  Wave-start checkpoint in localStorage (`src/runSave.js`, docs/systems.md). A mid-wave exit then
  Continue also marks the run unranked (else closing the tab is a free retry). Co-op rejoin was
  offered as a bigger separate job, not picked.

- Tech roadmap run (agents) (2026-11-16..18): 12 jobs built by agents, each adversarially reviewed and
  QA'd (J1-J10, plus this docs / dead-code job). What landed: CI, lint, solo smoke and perf
  budget (J1), hitboxes (J2), net protocol + crash reports (J3), merged zombie meshes (J4), one
  file per gun (J5), lazy chunks + static bake (J6), zombie AI out of React (J7), store slices
  (J8), sounds / screens / player / arena splits (J9, J10), registry modules (fxBus,
  zombieRegistry; J10), dead-code sweep and lighter docs (this job). Key numbers: cabin wave-8
  draws 3,449 -> about 300 (292 final), main chunk 174 -> 157 kB gzip, zombie tick about 2.2x
  cheaper, 695+ tests. CLAUDE.md went 40 kB -> 17 kB: perf history and systems moved to
  `docs/performance.md` and `docs/systems.md`, weapons to `src/weapons/README.md`.
  Open items: the live `events` insert policy for `client_error` (an owner SQL check in
  Supabase); 2 missing migrations (p-boards); t-sim skipped for weekly budget; the mail-smoke
  and director-smoke join waits are flaky under load; t-lazy is 157 kB against a 150 target;
  perf budget `programs` now reads 25 (was 24 at t-lazy; limit already 25). The agent-run notes
  (plan, briefs, per-job status and reviews) are in `.agents/` (local only, not committed).

- CONTROL PANEL (2026-11-16, owner: "my control panel, where I control your work, see progress,
  reorder"): the live roadmap artifact is now a panel. Top: pipeline counts, Needs you, In
  progress (steps bar, summary, PR/preview), the Queue (drag/arrows/Move to top/Hold), "Ask for
  something" (owner requests -> items/r-*), Shipped; the roadmap below is the backlog. Working
  rules + data contract are in CLAUDE.md "Control panel": read it every session, report in
  progress/<id>, never write queue/order or hold. Old d-order/d-sequence docs are unused now
  (the queue replaced the run-order call). State on 16 Nov: 18 tech cards queued in page order
  (t-ci first), nothing in progress, no progression picks yet. Drag gotcha: moving the captured
  row in the DOM drops pointer capture, so the neighbour moves instead (tested mouse + touch with
  a fake db in Playwright).

- LIVE ROADMAP (2026-11-11, owner: "merge roadmaps, build them further"): "Night After Night",
  https://claude.ai/artifact/D1y2Wem5q9Na5jj5VcP4gF (source `docs/next-roadmap.html`, republish from
  that file with the URL; it replaced the 10-Nov tech roadmap at the same link). It supersedes the
  Cabin Roadmap and Cabin on a Phone (both shipped); their open items moved in (quest, new maps,
  mastery as cards; seasons, 3-4 players under Not now; owner-only list). Picks: ArtifactData
  `list` on `calls` (cards `p-*`/`t-*`, decisions `d-sequence`, `d-point`, `d-firstrun`, `d-types` =
  A/B/C/talk; the old `d-order` doc is the tech page's pick, C = "features first"); write `progress/<id>` when building/shipped. Track 1 (progression): 0 board up
  (p-boards + CI/budget/smoke/lint) -> P1 something to find (feats unlock guns/perks/gear/box/
  bench/diner; Journal; unlock moment; legacy; seeded modes use the full set) -> P2 every run
  counts (levels pay every time, NEW BEST, challenges aim at next unlock) -> P3 reasons for tonight
  (Daily up front, last week's result, nights tally, no streaks) -> P4 longer nights (harder-night
  dials, survivors with a rule, mastery, quest, third map). Track 2 = the tech cards (T1-T4).
  Draft unlock list + run-1 set are in the page (UNLOCKS / START_SET). Owner had SKIPPED special
  waves and CrazyGames/Poki on 27 Oct: don't re-propose.
  Owner picks made on the tech page before the merge (carried, same ids): Go on every tech card
  except Skip t-modes and Skip t-checkjs (yet d-types = A, ask); old d-order = C (features first).
  Progression cards and the three new decisions: no picks yet.

- Owner feedback 2026-11-11: "progression feels flat, no reason to come back, no point".
  Diagnosis: run 1 has everything (6 guns in the box, doors, bench, all perks/power-ups); 11 level
  rewards, 7 cosmetic, last at L20; XP curve assumes long runs (10 waves ~870 XP, but a wave-3 run
  ~95 XP, so L5 takes ~9 runs); achievements/challenges pay badges and XP only; no way to win.
  Advised against permanent stat upgrades.

- SUPABASE (2026-11-23): migrations now applied via the connector: daily_weekly_leaderboards,
  harden_scores_events, open_runs. The connector holds DROP / REVOKE / DELETE for a confirmation
  that never reaches the owner's app (60 s timeout): write migrations without them (alter policy,
  create or replace trigger, mark-stale instead of delete). Still open, owner SQL editor only:
  the 20261015 revokes + purge helper. A hibernated project first fails with "password
  authentication failed"; it came back once the owner opened the dashboard.
- PRODUCTION FACTS (2026-11-11, Supabase project "cabin"): only 3 of 6 migrations applied (fixed
  2026-11-23, see above). events 25 Oct-10 Nov: 49 devices,
  101 sessions, 5 came back another day, median recorded death wave 3, 6 daily starts / 2 ends,
  22 challenges, 87 achievements (webdriver excluded; owner/preview visits included).
  privacy.html/terms.html still have [OWNER_*] placeholders. 0 entitlements.

- Tech baseline (2026-11-10, headless on e198bc9): src 13,908 -> 28,449 lines since 10-26; 117
  meshes/zombie; wave 8 = 5,044 nodes, 4,442 meshes; wave 1 = 723 draws; mobile auto-shoot
  targeting 2.05 ms/frame vs 0.03 ms with box hitboxes; shotgun shot 5.1 ms; main chunk 172 kB gzip
  (146 on 10-28); 90 mode checks in 15 files; no CI. Measure scripts were in the session
  scratchpad (gone); t-budget rebuilds them.

- 2026-11-10: Fixed a black strip at the bottom on load that only a resize cleared (owner report).
  Cause: Game.jsx dropped every height-only resize under 15% (FilteredResizeObserver + a gl.setSize
  override, old iOS URL-bar hack), so a bookmarks bar / URL bar change after load left the canvas
  short. Now R3F resizes always, debounced (resize 100 ms). Guard: src/__tests__/canvasResize.test.js.

- OWNER UI PREFERENCES (2026-10-27): no emoji anywhere in the UI - use short
  text labels. In-game text must be terse (one short line, hints only in the
  first 3 waves via src/hints.js). Lo-fi pass at 400px internal height;
  brightness slider (src/brightness.js). Bloodlust speed 1.4x (2x too hard).

- Cancelled by owner (stopped agents): Barn map, cabin escape quest. Don't restart unasked.

- Supporter Pack shipped in code but inert until STRIPE_* env vars are set
  Also pending: run `supabase/migrations/20261015000000_harden_scores_events_entitlements.sql`
  in the Supabase SQL editor (MCP SQL timed out). PR #125.
  (see docs/LAUNCH_CHECKLIST.md).

## Older entries

Entries from before 2026-11-04 (feature inventory, the 10-26..11-03 roadmap pushes, mobile and versus builds,
the Director design, the dated log) are in `docs/memory-archive.md`, verbatim.
