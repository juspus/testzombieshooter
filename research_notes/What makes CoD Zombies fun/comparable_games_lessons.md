# Comparable wave-survival and horde games: replayability lessons

Method note: only WebSearch results were usable. WebFetch failed because gamedeveloper.com and cdn.fastly.steamstatic.com are outside the session's allowed network domains, so the Valve slides (Booth GDC 2009 / AIIDE) and Gamasutra pieces were seen only as search snippets. Those hosts would have to be allowed for a deeper read. Many results were SEO or fan content; those are flagged or omitted. Principles only, no names, art, maps or music to copy.

## 1. Left 4 Dead's AI Director: pacing, peaks and valleys, procedural placement

### Takeaway
The Director's job is to generate dramatic pacing and replayability by watching player state and varying population, not by raising raw difficulty. Players choosing easy more than hard led the team toward "shared experience" over difficulty as the goal.

### Cited Findings
- Booth's GDC-era slides list "Generate Dramatic Game Pacing" as an explicit AI goal, alongside robust behaviour, competent human-player proxies and replayability — [The AI Systems of Left 4 Dead (Valve PDF, via search snippet)](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf); related Valve deck [Replayable Cooperative Game Design](https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf) (titles only seen; contents not read)
- Retrospective: the Director monitors how agitated players seem, how accurately they shoot and how well they cooperate, then forms a response strategy — [GamesRadar, The Making Of Left 4 Dead](https://gamesradar.com/making-left-4-dead)
- Booth said that knowing where survivors were heading let the team place ambushes ahead of and behind them, which controlled intensity and led to the Director — [Kotaku interview, as summarised in search results](https://www.kotaku.com.au/?p=894523)
- The team found more players chose easy than hard, and the goal became a shared experience rather than difficulty — [PC Gamer, as summarised in search results](https://www.pcgamer.com/uk/the-anacrusis-is-a-co-op-fps-that-understands-you-want-to-hang-out-with-your-friends)
- Special-infected spawn audio cues warn of threats not yet visible, and each type has its own musical tell — [PC Gamer, Don't startle the witch](https://www.pcgamer.com/uk/great-moments-in-pc-gaming-dont-startle-the-witch)

### Inferences
- Our game has a seeded run and wave/spawn system (`docs/systems.md` mentions a Director versus mode). Pacing as a rhythm (build-up, peak, forced relax) is the transferable principle; the wave gap plus shop already provides the valley, so a within-wave intensity budget (surge, then a quiet window) would be the addition.
- Seeded Daily runs conflict with a reactive Director unless the Director reads only deterministic state or its randomness goes through `keyedRandom`.

### Gaps
- Did not read the primary slides, so exact phase names (build up, sustain peak, peak fade, relax) and numbers are unverified here. Procedural item placement details were not retrieved.

## 2. Wave and horde co-op peers: Killing Floor, Vermintide, Darktide, Deep Rock Galactic, World War Z, Back 4 Blood, Gears Horde

### Takeaway
Between-wave trader time, perk-class identity and a randomly chosen boss final wave are the Killing Floor 2 template; the clearest documented failures are complexity (Back 4 Blood cards) and grindy RNG progression with missing crafting (Darktide launch). Deep Rock Galactic is the counterexample for goodwill: free progression currencies and cosmetic-only paid content, with a backlash fixed fast.

### Cited Findings
- Killing Floor 2: perks are the class system with their own XP goals, starting gear and role; characters are cosmetic. Players earn money between waves to spend at the trader; a later option to skip the trader when done buying was called a huge improvement. Enemy count scales with player count, and the boss is chosen randomly at the start of the last wave, each beaten differently — [Wikipedia](https://en.wikipedia.org/wiki/Killing_Floor_2), [Game Informer review](https://gameinformer.com/games/killing_floor_2/b/playstation4/archive/2016/11/22/killing-floor-2-review-), [PC Gamer classes](https://www.pcgamer.com/these-are-killing-floor-2s-first-four-classes)
- Back 4 Blood: reviewers found the card system unintuitive, highly granular and not much fun to work with; newcomers found it hard to navigate. A mid-2022 overhaul gave the whole deck at the start of an act instead of one draw per level. Solo players had a separate deck, and Turtle Rock looked at solo progression after negative feedback. Some players defended cards as the best part — [mein-mmo](https://mein-mmo.de/en/back-4-blood-how-is-the-left-4-dead-successor-doing-1-year-after-launch,887922), [NME](https://www.nme.com/news/back-4-bloods-solo-mode-may-get-a-progression-overhaul-3066363), [Den of Geek](https://www.denofgeek.com/games/back-4-blood-beta-problems-complaints-reactions) (sources are press and fan posts, 2022-2024)
- Darktide: January 2023 open letter promised focus on a complete crafting system, a more rewarding progression loop and stability, with no new PC content until then. Only one of four crafting aspects shipped at launch; head of design said the earlier crafting system "just wasn't good enough". Critics called loot grindy and RNG-heavy, removing player autonomy. Later fixes (blessings control, mission board, rewards, subclass reworks) helped but did not fully close the gap — [Shacknews](https://shacknews.com/article/133824/warhammer-40000-darktide-launch-apology), [PC Gamer](https://www.pcgamer.com/darktides-crafting-system-isnt-quite-ready-because-fatshark-ripped-it-out-and-started-over-mid-development), [PC Gamer follow-up](https://www.pcgamer.com/games/fps/it-took-a-while-to-get-there-but-now-we-feel-were-in-a-good-place-fatsharks-design-director-talks-doing-years-of-repair-work-on-warhammer-40-000-darktide)
- Vermintide 2: five heroes with career paths, each with a passive and a cooldown super; the lead designer said levels in the first game "didn't actually do anything", which motivated deeper progression — [PC Gamer](https://www.pcgamer.com/warhammer-vermintide-2-gets-overwatch-style-supers-and-rpg-elements)
- Deep Rock Galactic: developer FAQ says Deep Dives will always feature mutators and new ones will be added, with details provisional; the studio remade a cosmetic pack after fans complained about the paid skins, and the original designs were reportedly to be unlockable through play. Player commentary says currencies are free and paid content is cosmetic (user posts, not official) — [DRG Season 01 FAQ](https://www.deeprockgalactic.com/season01-faq), [PC Gamer](https://pcgamer.com/deep-rock-galactic-studio-remakes-cosmetic-dlc-after-fans-complain-everyone-gets-the-original-designs-for-free), [GamesRadar](https://www.gamesradar.com/an-industry-rarity-famously-wholesome-dwarves-and-devs-overcome-cosmetic-backlash-to-somehow-become-more-wholesome)
- World War Z: Saber's Swarm Engine aimed at over a thousand zombies on screen, and the tech was later evolved for another title. Reviewers praised the swarm but said the game fell short of Left 4 Dead's tension and was a competent team shooter — [GamesRadar](https://gamesradar.com/games/action/warhammer-40000-space-marine-2-evolves-world-war-zs-swarm-tech-to-build-epic-battles-with-maybe-thousands-of-tyrannids), [God is a Geek](https://godisageek.com/reviews/world-war-z-review/)
- Gears Horde: the classic escalating-wave format was influential, but a review of Gears 4 says the escalation tended to erode strategic play, which Horde 3.0 addressed with base-building — [GamesRadar](https://gamesradar.com/gears-of-war-4s-new-horde-mode-is-a-deep-but-giddy-world-of-tactical-base-building-where-every-single-person-matters)

### Inferences
- A swarm alone does not create tension; the Director and specials do (World War Z comparison). A wave count that only grows needs a mid-run decision layer (shop, bench, doors) to avoid pure escalation fatigue, which the existing shop, upgrade bench and door costs already do.
- Keep the Mystery Box and perks legible: Back 4 Blood's complaint is granularity and onboarding, so cap choices per decision and show effects in a line.
- A mutator rotation (Deep Rock style) is a cheap replayability lever that composes with the seeded Daily.
- Any paid or cosmetic layer must not gate power (see failures section).

### Gaps
- No Tripwire or Ghost Ship design postmortems were retrieved; Killing Floor 2 coverage was reviews and wiki mirrors only. Gears original Horde tuning and Deep Rock weekly Deep Dive structure were not sourced. Vermintide specials and its horde director had no design source.

## 3. Roguelite loops: Vampire Survivors, Brotato, Hades, Risk of Rain 2, Dead Cells

### Takeaway
Meta progression that guarantees every run earns something removes "zero progress" runs and keeps failure tolerable; the best meta unlocks open new play options rather than only raising numbers. Short loops between death and the next run drive "one more run".

### Cited Findings
- Vampire Survivors has a simple meta loop so a run never restarts from zero, eliminating zero-progress runs; commentary says unlocks should drip-feed and criticises games where the first upgrade takes many winning runs. Starting weapons are meant to evolve. Several analyses tie its reward pacing to slot-machine psychology but note it favours the player — [Game Wisdom](https://game-wisdom.com/critical/success-vampire-survivors), [The Conversation](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613), [Super Jump](https://www.superjumpmagazine.com/looking-back-and-forward-at-the-success-of-vampire-survivors/) (secondhand analysis, no Poncle primary source)
- A design write-up contrasts "permanent power" (Hades, Dead Cells stat gains) with "variety not power" unlocks that add options without raising base strength — [meta as variety not power](https://saschb2b.github.io/game-mechanics/concepts/meta-as-variety-not-power)
- A critic argues Dead Cells unlocks matter because they open new ways to play, and that the faster a player can restart after a loss, the more likely "just one more run" — [Twinfinite](https://twinfinite.net/opinion/hades-endgame-content-does-what-dead-cells-never-could/)
- Counter-view: some players feel strong meta makes losing mean "should have grinded more" — [Lemmy thread cited in search](https://lemmy.imagisphe.re/post/2173661/5475245) (low-authority)
- Risk of Rain 2: items can repeat and stack, producing snowball builds, unlike a deckbuilder where each card is unique; a blog frames good item design as effect, synergy and scaling, and warns a new build type needs supporting items or it becomes a "paperweight" — [Vice](https://vice.com/en/article/7xgvbz/risk-of-rain-2-makes-you-a-force-of-nature), [Choost blog](https://choostgames.com/blog/best-roguelites-build-variety/) (blog, secondary)
- Brotato: one tier-list page says the meta centres on filling six weapon slots plus stat stacking — [earlyguides](https://earlyguides.pages.dev/brotato/tier-list) (unclear provenance, provisional)

### Inferences
- With a limited weapon registry, "variety not power" meta (new starting loadouts, new box pool entries, new perks) avoids the grindy-stat problem and keeps Daily leaderboards fair if Daily runs use a fixed or neutral meta state.
- Perks and upgrade bench should reward stacking on a single axis (fire rate, crit, explosives) so players can steer a run to a build, plus a few cross-system synergies.
- Run-end screen should always show something earned and the next unlock's distance.

### Gaps
- No developer primary sources for Vampire Survivors, Brotato, Hades II heat, Dead Cells or Risk of Rain 2; heat/difficulty-modifier ladders and unlock-pacing numbers were not found. Brotato coverage was thin.

## 4. Short-session and browser/mobile horde games

### Takeaway
Short-session games stay sticky with near-instant start, a complete loop with a clear finish, and small frequent rewards that support both "one more" and "that was enough". The hard data is thin and old.

### Cited Findings
- deltaDNA analysis of 5,000+ games: average first session under nine minutes had 20% Day 1 retention versus 31% for longer sessions, with the caveat that short sessions may reflect churn rather than design — [PocketGamer.biz](https://www.pocketgamer.biz/sponsored-how-first-session-length-impacts-gamer-performance-in-f2p/) (sponsored content)
- A .io developer credits five-second startup, fast mechanic learning, ephemeral leaderboards and network effects — [GitNation, Lessons from 7 Years of .IO Games](https://gitnation.com/contents/lessons-from-7-years-of-io-games-what-works-what-doesnt-work-where-to-go-from-here)
- Short-session design advice: support both "one more" and "that was enough" decisions; small rewards encourage repeat play — [DEV Community](https://dev.to/wen_yong_f063f14db0f44038/designing-browser-survival-horror-for-short-tension-heavy-sessions-5cl) (blog). One 2026 report claimed browser session length quadrupled since 2023; unverified, do not rely on it

### Inferences
- A run that reaches a satisfying beat (first door, first box, boss wave) within roughly 5 minutes and saves/ends cleanly suits a browser. A wave-end screen is the natural "that was enough" exit.

### Gaps
- Nothing found on Zombs Royale or specific mobile zombie shooters, or on Brotato mobile retention.

## 5. Daily and seeded challenges

### Takeaway
A shared seed makes results fair and conversational; one attempt per day creates stakes. Shareability without spoilers (Wordle grid) drives growth. Documented weakness: scoring that rewards reckless play and a loss of discovery for some players.

### Cited Findings
- Spelunky daily: one seed for everyone, one attempt, board ranks final money and level totals, no times or replays recorded; the fairness of identical conditions lets players chase short-lived fame, and the format changed how people played — [Spelunky wiki](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD)), [PC Gamer](https://www.pcgamer.com/au/now-playing-the-spelunky-daily-challenge), [Game Developer via search](https://gamedeveloper.com/design/the-understated-genius-of-the-i-spelunky-i-daily-challenge)
- Critique: top scores cluster on one level and the board rewards greedy play over safe play — [The Ludite](https://theludite.com/2014/06/23/spelunky-when-scoring-goes-bad/); PC Gamer notes some lose the thrill of discovery
- Concept credited to Die Gute Fabrik's Douglas Wilson — [Spelunky coverage via Kotaku](https://kotaku.com/more-games-need-daily-challenge-modes-1740109783)
- Wordle: share grid (built after a player hand-typed emoji results) shows performance without spoiling; one puzzle per day deliberately caps engagement; browser, no account, no ads — [Game Developer GDC 2022](https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success), [Smithsonian](https://www.smithsonianmag.com/smart-news/heres-why-the-word-game-wordle-went-viral-180979439/)

### Inferences
- Daily score should balance survival depth against kills and cash so a safe line and a greedy line both compete; consider a text share string (wave reached, a few symbols for key events) that carries no spoiler. A no-account, link-based boot suits the stack.
- Slay the Spire daily climb was not retrieved; the mutator-of-the-day idea there is unsourced here.

### Gaps
- Slay the Spire Daily Climb, cheating/leaderboard integrity, and any failure data on daily modes were not found.

## 6. Versus and asymmetric modes

### Takeaway
Asymmetric 4v1 modes fail when the lone side feels isolated or the player pool splits; the strongest evidence is from Evolve. L4D-style infected roles work because specials are designed around co-op counters.

### Cited Findings
- Evolve: paywalled roles fragmented the community; one-in-five feels ganged up on and left out; the monster lacks constructive multiplayer moments; new players stopped joining while regulars improved, lengthening queues; the lead writer also cited balance and the business model — [Game Design Skills](https://gamedesignskills.com/game-design/why-did-evolve-fail/), [GamesRadar](https://gamesradar.com/what-evolves-monster-taught-me-about-failings-4v1-multiplayer), [PC Gamer](https://www.pcgamer.com/evolve-dev-says-4v1-caused-more-problems-than-we-ever-imagined), [mein-mmo](https://mein-mmo.de/en/evolve-was-destined-to-fail-when-players-wanted-to-win,240947/). Sources disagree on server shutdown dates (2018 vs July 2023)
- L4D specials are built around teamwork: Hunter and Smoker disable and isolate survivors, Boomer and Tank disrupt and distract; none can be handled alone — [TechRaptor](https://techraptor.net/content/10-years-of-left-4-dead), [Dread Central](https://www.dreadcentral.com/editorials/484927/left-4-dead-made-vital-teamwork-for-the-living-and-undead/)

### Inferences
- For a small browser game, versus should be separate seeded worlds (as already built) which avoids the 4v1 isolation problem and queue dependence; the Director/Mail modes need a bot or solo fallback for an empty pool.
- Each special should force a specific teammate action and have an audio plus visual tell.

### Gaps
- No Dead by Daylight design source found (asymmetric lessons there are inference only). No L4D Versus-specific design talk read.

## 7. Special enemies

### Takeaway
Good specials are readable (distinct audio and silhouette), force a role-specific response, and break the team's formation rather than only adding hit points.

### Cited Findings
- L4D specials split the party and each has a distinctive spawn cue; overlapping cues can bait survivors into ambushes — [PC Gamer](https://www.pcgamer.com/uk/great-moments-in-pc-gaming-dont-startle-the-witch), [Bit-tech](https://bit-tech.net/reviews/gaming/pc/complete-guide-to-left-4-dead/6/)
- A later piece on the sequel frames per-type spawn cues as feedback that makes difficulty feel fair — [Everhem](https://development.everhem.com/zombies-of-left-4-dead-2-why-the-special-infected-still-scare-us-15-years-later-5ff) (low authority)
- Killing Floor 2 boss differs each run and is beaten differently — [Wikipedia](https://en.wikipedia.org/wiki/Killing_Floor_2)

### Inferences
- Existing exploder, armored, spitter and spider types (`zombieSpecials.js`) can be audited against three tests: distinct sound cue, distinct counter, forced movement or target-swap. A boss pick that varies per run (seeded) mirrors the Killing Floor template.

### Gaps
- No Vermintide specials design source; the Gamasutra enemy-interplay piece could not be fetched.

## 8. Progression without grind: feat unlocks, cosmetics, prestige

### Takeaway
Free cosmetic-only monetization and goodwill fixes (Deep Rock) work; RNG loot gates and missing systems (Darktide launch) generate backlash; unlocks that open play options avoid stat grind.

### Cited Findings
- Darktide: RNG mission and loot systems were said to remove autonomy; fixes added player control over blessings — see section 2 sources
- Deep Rock cosmetics: backlash led to a remake and unlockable originals — [80.lv](https://80.lv/articles/deep-rock-galactic-dev-revamps-paid-skins-in-the-game-after-player-criticism)
- Vampire Survivors: criticism of first upgrades needing many winning runs — [Game Wisdom](https://game-wisdom.com/critical/success-vampire-survivors)
- Meta as variety rather than power — [saschb2b](https://saschb2b.github.io/game-mechanics/concepts/meta-as-variety-not-power)

### Inferences
- Feat unlocks ("do X to unlock Y") fit the meta layer and give each run a secondary goal; prefer unlocks that add a sidegrade over a stat bump. Cosmetics unlocked by feats give prestige without power.

### Gaps
- No source specifically on feat-unlock design or prestige systems was retrieved.

## 9. Juice and game feel

### Takeaway
Layered feedback (hit pause, screen shake, knockback, muzzle flash, kill effects) makes the same game feel better, but uniform or excessive shake erases meaning.

### Cited Findings
- Vlambeer's 2013 "Art of Screenshake" talk added feedback elements to a basic shooter step by step; the recreation lists hit pause, screenshake, enemy knockback, muzzle flash and random explosions — [recreation devlog](https://dkliao.itch.io/the-art-of-screenshake-recreation/devlog/451576/quick-breakdown-of-all-the-effects), [Game Developer via search](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)
- A guide suggests 4-8 frames of hit stop applied to both attacker and target, and warns one shake for every event stops conveying information; commenters note overdone shake or stop annoys — [game juice guide](https://gamejuice.pages.dev/articles/screen-shake-guide), [appscale blog](https://appscale.blog/en/blog/game-feel-juice-hitstop-screenshake-easing-2026) (blogs; frame counts unverified against the talk)

### Inferences
- Scale shake and sound by event significance (kill small, headshot, special, boss, downed); give an accessibility toggle. Keep within the repo's rules: no per-frame allocation and fx through `fxBus`; hit pause must respect the delta clamp.

### Gaps
- Nothing found on slow-mo kill-cam conventions or gore/sound studies for horde games.

## 10. What failed

### Takeaway
Failures cluster into complexity walls (cards), grind and RNG, paywalled roles, unhealthy matchmaking in asymmetric modes, and launching with systems missing.

### Cited Findings
- Card system complexity and separate solo deck — Back 4 Blood sources in section 2
- Darktide launch with missing crafting and a content pause — section 2 sources
- Evolve paywalls and queue death spiral — section 6 sources
- Gears escalating hordes eroding strategy — section 2 source
- World War Z swarm without Director tension — section 2 sources

### Inferences
- Checklist for this game: no empty single player (solo must get the full meta and Daily), no power gating by purchase, no system shipped half-built, each new layer (perks, bench, box, doors) explained in one line within the first 3 waves per the repo's hint rule.

### Gaps
- "Too much grind" in other horde games (e.g. Killing Floor 2 perk levelling) and pay-to-win examples beyond Evolve were not sourced.
