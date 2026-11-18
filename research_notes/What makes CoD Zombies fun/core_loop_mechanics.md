# Core loop and mechanics of CoD Zombies (round-based), and why they work

Research limits (read first): WebFetch could not resolve any external host in this session (gamesradar, gamespot, jackhanke.github.io, callofdutyzombies.com all returned DNS failures, so those hosts need to be allowed in the session network settings). Everything below comes from WebSearch result summaries only, not full pages. Primary sources (GameSpot oral history, GamesRadar, Game Informer, GamesBeat interviews) were identified but NOT read in full, so no verbatim developer quotes beyond what the summaries gave. Several hits were SEO filler (presentationbuilder.internationaltrucks.com, ava.ead.domalberto.edu.br, etc.) and are excluded. Treat numbers as per-game and secondary-source.

## 1. Points economy (earning, spending, milking, save vs spend)

### Takeaway
In the Black Ops 1/2 era a body hit pays 10, a body kill 60 (explosive/wonder kills 50), a headshot kill 100, a knife kill about 130, and each board rebuilt 10. Costs scale from cheap perks (500 solo Quick Revive) to 2500 Juggernog and 5000 Pack-a-Punch, which creates the spend-now vs save tension. Values changed in later games (Essence in MW3/Vanguard, reported flattened scoring in BO6).

### Cited Findings
- BO2 guide: body hit 10 points, normal-weapon kill 60, explosive or box "super weapon" kill 50, headshot kill 100; knife kill listed at 130 in a French guide; 10 points per board rebuilt (not on all windows). — [GamerGuides BO2 overview](https://www.gamerguides.com/call-of-duty-black-ops-ii/guide/zombies-guide/zombies-mode/overview); [Millenium BO2 guide](https://www.millenium.org/guide/99455.html)
- BO1 prices: Juggernog 2500; Speed Cola 3000 (sources disagree on a few perks); solo Quick Revive 500, revives automatically up to 3 times in solo, no power needed. — [Black Ops In Depth perk page](https://blackopsindepth.neocities.org/perk-a-colas.html)
- Nuke grants all players 400 points (800 under Double Points); Carpenter 200 base (400 under Double Points per the same guide). — [GamerGuides BO2](https://www.gamerguides.com/call-of-duty-black-ops-ii/guide/zombies-guide); [CoD wiki Power-Ups](https://callofduty.fandom.com/wiki/Power-Ups)
- Cold War Mystery Box costs 950 points to open. — [GamerJournalist](https://gamerjournalist.com/call-of-duty-mystery-box-locations-in-black-ops-cold-war-zombies-die-maschine/)
- BO6: a PC Gamer piece quotes a player saying the points system no longer rewards prioritizing headshots vs melee vs body kills; Dexerto says headshots count as critical kills that give more. Official BO6 point table NOT found. — [PC Gamer](https://www.pcgamer.com/games/call-of-duty/call-of-duty-black-ops-6-zombies-players-have-found-an-easter-egg-thatll-give-you-2-000-free-points-but-you-have-to-be-good-at-trick-shots); [Dexerto](https://dexerto.com/call-of-duty/black-ops-6-how-to-get-points-fast-in-zombies-2972167)
- MW3/Vanguard use Essence as currency earned from kills and contracts. — [GameSpot MW3 PaP explained](https://gamespot.com/articles/call-of-duty-mw3-zombies-pack-a-punch-explained/1100-6519097/)

### Inferences
- The 10/60/100/130 spread rewards precision and risk (knife = closest range = most points), which is the core "skill pays economy" lever; BO6 reportedly flattening it removes that lever.
- Barricade points make the safest activity (repairing) a steady income, tying economy to the defensive early phase.

### Gaps
- "Milking" mechanics (trapping one zombie, repeatedly repairing windows) and the save-vs-spend discourse were not sourced; no designer comment found.
- Wall-weapon prices, door/debris costs, trap costs not retrieved.
- Uncited background (training knowledge, verify): classic doors run roughly 750-2000+, wall guns about 500-1200, Pack-a-Punch 5000.

## 2. Round escalation (count, health, speed, special rounds)

### Takeaway
Community research says zombie health starts at 150 and rises by 100 per round to 950 at round 9, then scales multiplicatively; counts depend on round and player count and stop rising at round 30 in an emulation; spawn delay shrinks each round. Exact original formulas are disputed.

### Cited Findings
- Black Ops guide: base health 150, +100 per round through round 9 (950). Napalm zombies 4x health, Shrieker 2.5x. — [Spookystorm's guide](https://randomonialand.fandom.com/wiki/Spookystorm%27s_Guide_to_Black_Ops_Zombies)
- Spawn delay starts at 2 s, multiplied by 0.95 per round, capping around round 64 (forum); Project Lazarus wiki says minimum reached by round 60 and count stops growing at round 30, and admits original exact formula unknown. Conflicting. — [CoDZombies forum charts](https://callofdutyzombies.com/topic/137395-zombie-charts); [Project Lazarus Rounds](https://project-lazarus.fandom.com/wiki/Rounds)
- A forum thread says an older count formula was wrong and a newer community formula matches real counts from round 12. — [CoDZombies forum](https://callofdutyzombies.com/topic/151774-number-of-zombies-at-bo2)
- Hellhound rounds: last enemy always drops Max Ammo; guide says hound rounds occur roughly every 5 rounds with a 3-round gap (general, not BO1-exact). — [CoD wiki Max Ammo](https://breezewiki.discard.no/callofduty/wiki/Max_Ammo); [TheGlobalGaming](https://theglobalgaming.com/call-of-duty/what-are-hellhounds-zombies)
- Fan analysis: ramp is gradual, rounds start slow, no time limit. — [Sportskeeda](https://sportskeeda.com/call-of-duty-game/why-round-based-zombies-maps-popular-call-duty)
- Unreliable: everycalculators.com 1.10x per-round health multiplier for BO6, unsourced; ignore.

### Inferences
- Linear health early then multiplicative later means starting pistols stop being viable around rounds 10-15, forcing the economy to supply upgrades; this is how the loop forces spending.

### Gaps
- Verified speed progression (walk/run/sprint thresholds), the post-round-9 multiplier (~1.1x, uncited), dog round exact rounds in BO1, per-player-count spawn caps.

## 3. Map structure, barricades, early defensive phase

### Takeaway
Little was retrieved directly. Barricade rebuilding pays 10 per board (BO2) and Carpenter power-up repairs all windows.

### Cited Findings
- 10 points per board; not on all windows. — [GamerGuides BO2](https://www.gamerguides.com/call-of-duty-black-ops-ii/guide/zombies-guide/zombies-mode/overview)
- Carpenter: grab immediately when all barriers are destroyed in a hard round; skip when speedrunning. — [Project Lazarus community strategies](https://project-lazarus.fandom.com/wiki/Community_Power-Up_Strategies)
- Zombies descend on windows; BO6 Liberty Falls described by Treyarch (Miles Leslie) as "smaller, more casual compared to Terminus". — [Dexerto](https://dexerto.com/call-of-duty/treyarch-promised-black-ops-6-map-and-hud-changes-after-cod-next-concerns-2924608)

### Inferences
- Gating by doors plus a power switch converts points into map access, so the economy doubles as a pacing tool.

### Gaps
- Door/debris costs, power-switch design rationale, loop/training-spot geometry: no sourced material.

## 4. Mystery Box, wonder weapons

### Takeaway
The box moves on every map except Nacht der Untoten, signalled by the teddy bear after roughly 6-8 uses; it costs 950 (Cold War). No verified per-weapon odds were found.

### Cited Findings
- Box relocates on all maps but Nacht; bear appears after 6-8 uses; first bear in Verruckt. — [Giant Bomb Mystery Box](https://giantbomb.com/wiki/Objects/The_Mystery_Box); [VGFacts BO2](https://www.vgfacts.com/game/callofdutyblackops2/trivia-5621)
- MW3: bear floats on the crate before it vanishes; you cannot tell if it is empty until paying. — [Game8 / search summary](https://game8.co/games/MW3/archives/433134)
- Claim that Ray Gun/Thundergun hover at 2-5 percent is from an SEO page and is rejected as unsourced.
- Wonder weapons matter at high rounds because standard guns fall off. — [ExitLag blog](https://www.exitlag.com/blog/call-of-duty-zombies/) (low-quality source)

### Inferences
- The bear is a loss-limit on gambling: it punishes streaks of spending and forces a re-evaluation of position, rather than being pure bad luck.

### Gaps
- Actual box odds/weights, designer commentary on gambling appeal.

## 5. Perks and perk limits

### Takeaway
Classic BO1 perks: Juggernog (2500, survive 5 hits, per source), Speed Cola (3000, ~50% faster reload), Quick Revive (500 solo, 3 self-revives). Perk cap number not confirmed; Cold War removed the four-perk limit.

### Cited Findings
- Prices and effects above. — [Black Ops In Depth](https://blackopsindepth.neocities.org/perk-a-colas.html)
- Cold War removed the four-perk limit. — [Twinfinite](https://twinfinite.net/guides/black-ops-cold-war-zombies-best-perks-to-use-first/?amp=1)
- Perma-perks exist so some perk benefits persist after down; Juggernog perma-perk easiest on solo. — [CoD wiki Perma Perks](https://callofduty.fandom.com/wiki/Perma_Perks); [GameRevolution](https://www.gamerevolution.com/?p=57981)
- Juggernog and Elemental Pop jingles sung by Elena Siegman. — [CoD wiki Elena Siegman](https://callofduty.fandom.com/wiki/Elena_Siegman)

### Inferences
- Perma-perks soften the down-loses-everything penalty, a later-game concession to frustration.

### Gaps
- Double Tap, Stamin-Up, etc. numbers; the classic cap of 4 (uncited background); design comments on perk loss.

## 6. Pack-a-Punch and upgrades

### Takeaway
Costs: MW3 tiers 5,000/10,000/15,000; BO2 repack 2,000 with random attachment; BO4 repack steps of 2,500 up to 12,500 total; Vanguard 7,500/15,000/30,000 Essence. Design rationale not found.

### Cited Findings
- All above. — [Cogconnected MW3](https://cogconnected.com/2023/11/mastering-weapon-upgrades-modern-warfare-3-zombies-guide/); [Berkeley Historical Society page (low quality) BO2](https://berkeleyhistoricalsociety.org/?p=4750); [ComicBook BO4](https://comicbook.com/gaming/news/call-of-duty-black-ops-4-zombies-how-to-make-weapons-stronger); [Sportskeeda Vanguard](https://www.sportskeeda.com/esports/how-pack-a-punch-works-call-duty-vanguard-zombies)
- Cold War: upgrading early makes mini-bosses easier. — [Sportskeeda](https://www.sportskeeda.com/esports/should-players-pack-a-punch-buy-perks-first-black-ops-cold-war-zombies)

### Inferences
- Tiered, escalating costs in later games turn one big purchase into a continuing sink, extending the economy's relevance past round 20.

### Gaps
- Original BO1 5,000 price source, damage multipliers, designer intent.

## 7. Power-ups and drops

### Takeaway
Nuke clears the map (+400/800 points), Double Points doubles earnings, Insta-Kill one-shots, Max Ammo refills reserve only, Carpenter repairs windows; collect Double Points first to boost Nuke/Carpenter payouts.

### Cited Findings
- All above. — [Project Lazarus strategies](https://project-lazarus.fandom.com/wiki/Community_Power-Up_Strategies); [CoD wiki Power-Ups](https://callofduty.fandom.com/wiki/Power-Ups)
- Special-round last enemy always drops Max Ammo. — [CoD wiki Max Ammo](https://breezewiki.discard.no/callofduty/wiki/Max_Ammo)

### Gaps
- Official drop rates and per-round caps (only a mod comment found; ignored). Uncited background: max 4 drops per round, a drop guaranteed within first few kills of round 2 or so; verify.

## 8. Training/kiting, camping, high-round strategy

### Takeaway
One (low-quality) source calls the train the core high-level skill and says removing it drives away the high-round community.

### Cited Findings
- Same source claim. — [ExitLag](https://www.exitlag.com/blog/call-of-duty-zombies/)

### Gaps
- No reliable analysis essay retrieved; camp vs train discussion, strategy details unsourced.

## 9. Easter eggs and community

### Takeaway
Easter eggs are optional multi-step objectives giving goals beyond survival, and Treyarch frames design around cooperation.

### Cited Findings
- Optional goals beyond endless rounds. — [ExitLag](https://www.exitlag.com/blog/call-of-duty-zombies/) (weak)
- Blundell says the team designs so players find new things after many playthroughs (Shadows of Evil). — [GameZone](https://gamezone.com/?p=111614)
- Kevin Drew framing around cooperative play. — [GamesBeat BO4](https://gamesbeat.com/how-call-of-duty-black-ops-4s-zombies-mode-is-social-deep-and-customizable/)

### Gaps
- Community behavior (wikis, speedrun, song hunting) unsourced.

## 10. Atmosphere and audio

### Takeaway
Music tracks were written by Kevin Sherwood and sung by Elena Siegman, in house. Round-change attribution not found.

### Cited Findings
- Tracks written by Sherwood, performed by Siegman, recorded in house; 2008 blog: Sherwood guitar, Siegman vocals. — [CoD wiki Elena Siegman](https://callofduty.fandom.com/wiki/Elena_Siegman); [Brian Tuey blog 2008](https://briantuey.blogspot.com/2008)
- Treyarch Declassified episode on Zombies sound design exists (not read). — [CharlieIntel](https://www.charlieintel.com/treyarch-breaks-down-the-sound-design-of-zombies-in-new-declassified-episode/53168/)
- Round change described as eerie rising notes; Shadows of Evil noir jazz. — search summaries only.

### Gaps
- Read the Declassified episode coverage; hidden-song mechanic, radios, announcer lines.

## 11. Co-op and solo

### Takeaway
Solo Quick Revive gives 3 automatic self-revives; Treyarch pushes cooperative design (Drew).

### Cited Findings
- Solo Quick Revive 500, 3 uses. — [Black Ops In Depth](https://blackopsindepth.neocities.org/perk-a-colas.html)
- Spawn counts depend on player count. — [Project Lazarus Rounds](https://project-lazarus.fandom.com/wiki/Rounds)

### Gaps
- Revive timing, point sharing, roles: nothing sourced.

## 12. Session length, pacing, "one more round"

### Gaps
- No sourced material. Only the sourced hint: no time limit, gradual ramp ([Sportskeeda](https://sportskeeda.com/call-of-duty-game/why-round-based-zombies-maps-popular-call-duty)).

## 13. Developer intent and origin

### Takeaway
Zombies began as an unannounced bonus built in spare time in World at War; later teams emphasize replayability, novelty and cooperation.

### Cited Findings
- Blundell: built "in the lunchtimes of World at War"; no voice acting "because there was no budget". — [GameSpot oral history](https://gamespot.com/articles/call-of-duty-zombies-an-oral-history-of-the-unlike/1100-6442252/) (via search summary)
- First map labeled "nazi_zombie_prototype", unlocked after campaign, never announced. — same summary
- Jesse Snyder blog 11 Nov 2008: "pretty much an accident". — [TechSpot](https://www.techspot.com/community/topics/the-secret-history-behind-call-of-dutys-zombie-mode.220986); also [GamesRadar](https://www.gamesradar.com/call-of-duty-zombies-the-accidental-creation-of-a-glorious-gaming-monster)
- Game Informer says Blundell wasn't on the mode then (conflicts with oral-history attribution). — [Game Informer](https://gameinformer.com/feature/the-convoluted-history-of-call-of-dutys-bloody-zombies-mode)
- Blundell: team designs so players find new things after many playthroughs; "brutal" arcade influence (GamesRadar). Zombies stays in CoD because players move between modes (Eurogamer via [CharlieIntel](https://charlieintel.com/treyarch-explains-why-they-havent-made-a-standalone-call-of-duty-zombies-game/33171/)).
- BO6: Liberty Falls changed after CoD Next feedback (darker visuals, HUD revamp). — [Dexerto](https://dexerto.com/call-of-duty/treyarch-promised-black-ops-6-map-and-hud-changes-after-cod-next-concerns-2924608)
- BO7 interviews (Yale Miller, Matt Scronce) exist, contents not read. — [GamesBeat](https://gamesbeat.com/?p=307271); [Windows Central](https://www.windowscentral.com/gaming/call-of-duty/treyarch-on-black-ops-7-we-wanted-to-do-something-absolutely-unique)

### Gaps
- Zielinski and Drew direct quotes; GDC talks; BO7 (2025) and 2026 changes.
- Follow-up: allow those hosts and fetch GameSpot oral history, GamesRadar, Game Informer, jackhanke "Math of CoD Zombies", callofdutyzombies.com points thread.
