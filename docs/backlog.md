# Backlog: everything still open

What is still open after the finished plans (R, P4, C, D, S, G, A, E, H, J) and the two archived audits (2026-09-29, 2026-09-30), condensed from their "deferred", "reports" and "leftovers" sections. What was done is told in `docs/history.md`. The open items of the current audits are in `docs/audits/2026-10-02.md`, `docs/audits/2026-10-03-cards.md` and `docs/audits/2026-10-07-debt.md`. Per-card approximations are not repeated here: they live in `docs/approximations.md` (an approximation lifted is removed from there; a new one is added there).

Each item cites its origin (plan, lot). "Status checked" means compared with the later plans; where an item may have been done by a later plan without the text saying so, it says "check".

## Deferred until a card requires it

From PLAN-R ("Deferred until no card requires it", state of 2026-10-02, audit section 5.9) and the "absent but no card concerned" list of the 2026-09-30 audit (section 3.2). Implement a rule here only when a card of the pool needs it; before doing so, reread the paragraph of the history about the lot that deferred it.

| Rule | What | Trigger | Status |
|---|---|---|---|
| 509.1a (a creature blocks one attacker) | A creature blocking several attackers ("can block an additional creature", "can block any number of creatures") | a pool card with such an ability | still deferred (PLAN-R R5) |
| 509.1c, 509.1d | Blocking obligations ("must be blocked if able", "blocks if able", "blocks this attacker if able") with maximization | done in PLAN-C C4 (MKM cards). Lure-style effects ("all creatures able to block it do so") | the maximization exists; no Lure in the pool |
| 310 (battles) | Battles (siege, defense counters, protector) | a pool card that is a battle | still deferred (PLAN-R, PLAN-C "What we do not do") |
| 702.26 (phasing) | Phasing | done in PLAN-G G4e (Robe of Stars) | done; check other phasing cards when added |
| 613.1c / layer 3 | Text-changing effects (layer 3) | no impact in Standard so far; New Blood (PLAN-E E7) is an approximation in `approximations.md` | still deferred |
| 732 | Loop shortcuts (optional loops). Mandatory loops are a draw (104.4b), done in R6; the three safety guards remain | a pool card whose loop is meant to be played | still deferred (PLAN-R R6) |
| 702.61 (split second) | Split second as a keyword for a card that grants it as a static: the split-second player flag stays for Samut (single card) | PLAN-C C11 made `spellHasKeyword`, so only the Samut flag remains | single-card flag in the debt reference |
| 613 outside the battlefield | Real layers for cards in hand, on the stack and in the graveyard. Replaced by spell characteristics (`spellHasKeyword`, `grantedSpellKeywords`, PLAN-C C11); judged more costly than useful | Leyline of Transformation (types of cards outside the battlefield) and Prismari / Lorehold (granted abilities, not keywords) stay approximated | deferred by decision (PLAN-C) |
| 616.1 | A `ChoiceRequest` for the order of replacement effects: the engine still picks the order best for the affected player (`chooseReplacementOrder`, up to 5 replacements, then the best result) | a card where the order is a real decision for a player who is not the affected one | deferred (PLAN-R R1) |
| 722 | View of the player who controls another player's turn | done (`view.ts`) | done |
| 615.7 | "The next time" shields | done (`fx.shield`, TDM) | done |
| 903 partner / background | Commander pairs (partner, "choose a Background", friends forever) | a deck that has a pair (PLAN-E) | done 2026-10-09 (rules 178, Mario & Luigi deck: `canPair`, `decklist.ts`) |
| Mechanics absent from the pool on 2026-09-30 | day and night, dungeons, the Ring, energy, initiative (the undertaking), battles. Phyrexian mana, phasing, regeneration, monarch were added since (G4e, H6) | check each against the pool with `npm run coverage -- --set <ext> --text` before assuming it is absent | check |

Related deferrals from the same plans:
- PLAN-C "What we do not do" lists the same rules (block several attackers, battles, phasing, layer 3, loop shortcuts) as waiting for a card that requires them.
- Commander, Limited and eternal formats were out of scope; Commander was added by PLAN-E. Limited and eternal formats stay out of scope (CLAUDE.md).

## Rules and engine

**Replacement and prevention families (PLAN-R R4.4, R4.5, R4.6; PLAN-H H8b)**
- Spell gratuities (`firstSpellFree`, `freeFromExileOncePerTurn`) and family B (gifts granted to spells) stay player flags: merging them would only move one-card booleans around (R4.4).
- Family L (`flashFor` is already generic; `jaceLoyaltyInstant` went through `fx.thisTurn`); life flags: `cantGainLife` was merged by H8b, `noLifeGainForAll` remains to check (R4.5).
- The rest of `TurnStats` (life gained, cards drawn, spells cast...) is not in the turn log: these are general statistics read at every condition evaluation, and recounting them in the log would cost more without reducing one-card debt (R4.6).
- Combat player statics kept separate for want of a common evaluator: `attackTax` / `blockTax`, `maxOneAttacker`, `maxBlockingCreatures` (508.1 vs 509.1; H8b).
- `GraveyardReplacement` `gainLife` / `createToken` -> `then`: dropped (two evaluators would remain: the life gain is part of the replacement, the token comes from a reflexive ability, 603.12; H7a).

**Cost and choice slots (PLAN-C C8, C9, C12)**
- Still automatic (documented): evidence "X = value of the targets" (Urgent Necropsy), forage, counter removal among several creatures of one kind (Dyadrine; Quilled Greatwurm needs `removeCountersAmong`/kind choice), symbol exile (Zemo), Champions (C8).
- Entry choices still on their default: exile-linked returns, state-based actions, sneak (C9). PLAN-H H9 added questions for the other paths; arrivals outside a resolution (copies created by an effect, exile-linked returns) still make the default "as it enters" choice without a question (H9, H11 report).
- Entry-choice flows not covered by `asEnters` (H9): a token copy created by an effect asks no question; the 1/1 characteristic of Abuelo's Awakening right after arriving (needs `LayerMods` in `MoveSpec`); `shockLand` stays apart (already a common arrival question).

**Approximation groups left by PLAN-C C12** (check each against `docs/approximations.md` before starting; some were touched by later plans)
- "Add N mana in any combination of colors" (6 to 8 cards: Vivi Ornitier banned, Flamebraider, Interdimensional Web Watch, Hermitic Herbalist): needs distinct mana units in the solver. Still in `approximations.md`: all mana of one chosen color when committed by hand.
- Choices at resolution without a target (about 15 cards, one by one): partly done by D1 (`fx.yourChoice`), H2c (Finality) and H4; remaining ones are listed in `approximations.md`.
- "Tap N untapped creatures", the source included (9 cards): E7 added "tap N untapped creatures of a type"; check the rest.
- "Player who put the counters" (9 cards): partly done (Lasting Tarfire); check.
- Eriette, the Beguiler: modeled as a static (control while the Aura stays attached) instead of a trigger "whenever an Aura becomes attached" with a timestamped control effect (layer 2). Needs an attachment trigger and a control duration tied to the Aura (single card).

**Single-card remains of the DSL (PLAN-S, PLAN-H reports)**
- Kept after PLAN-S for want of a generic form that really simplifies: `exileNamesakes`, `millUntil`, `chooseCardName`, `becomeCopyKeepAbilities`, the pair of "wheels" (`mayWheel`, `mayShuffleHandGraveyardDraw`), `shield`, `noncombatBonusThisTurn`, `setBasePTAll`, `diesOrExiled`, `notSubtype` (read by `printedMatch` during layers, which ignores unknown fields). (`chooseRiot`, the four "keep ...", `destroyAllButChosenType` were merged later by H8a and H9.)
- Interval comparisons as `{ min?, max? }` (hundreds of literals for little gain), `GameState.over` (implicit guard against `flow` overwriting the end of the game; four tests fail without it), `mulliganQueue` / `mulliganTaken` / `leylineAsked` -> a `setup` group and `eventBatch` / `leftBatch` -> a `batch` group (S10, not done), splitting `fx` (about 970 lines in one literal) into `engine/src/dsl/*.ts`, a single `creature()` token factory (S10b: signatures differ across extensions), `CardScript` derived from `CardDef` (S10b). (Merging the action `RulesEvent`s with the action triggers, T1/T2 of the PLAN-S final option, was done by PLAN-J J3: one `action` trigger, TriggerSpec 58 -> 41.)
- PLAN-S final option, on the user's decision only: the "pay" family (`pay{who, cost, skip, unless}` replacing `mayPay`, `unlessPay`, `payCostOf`, `forage`, `collectEvidence`, `behold`, `tapOrSacrifice`, `removeCounterFromEach`, `exileForManaValue`; about -8 Effect variants / -40 fields) and the `CardDef` rework (`castOptions[]`, `kicker{}`, `entersAsCopy{}`, a single CDA field, `rules[]`; about -30 fields).
- PLAN-H H9 left single-card: `while: { exiled }` of Emrakul (duration, not counted by the guard because the name `exiled` is shared in another sense).
- C14 left some "this turn"-like fields that last beyond a turn; PLAN-H H7b and H11 moved them (`exiledVia`, `expires`, turn log), so the `turnFields` list is empty.

**Layers and copies**
- Counter-granted abilities apply after all other layer 6 effects whatever their timestamp (documented approximation, 2026-09-30 audit section 3.2).
- Aura control timestamp is that of its arrival (R2.4).

## Cards: documented approximations to revisit

Per card, in `docs/approximations.md`. Cards the plans left explicitly documented:
- **PLAN-D:** Sidisi (its X comes from the sacrificed creature; Likeness Looter, The Mycosynth Gardens and Rydia were tied to X by PLAN-J J6c), Theorist's Sanctum (behold on entering), Kindle the Inner Flame (flashback behold), Lifecraft Engine, Raiding Schemes, Hawkeye (several reflexive modes), Moonlit Meditation copies that come from amass, endure or a gift, Zhao, Ruthless Admiral sacrificed by itself (untested), North Wind Avatar (card outside the game).
- **PLAN-A:** Fear of Burning Alive ("that source" of a resolved spell has no object to designate), Central Elevator (a Room's names), Heirloom Epic (convoke of an ability), Eluge's {U} reduction, "other than Alania", Vision Quest (graveyard offered first), Zenos (opponent chosen when transforming), Great Train Heist (Treasures of an emblem), Sonic Shrieker, Shark Shredder's attack, the kind of counters removed from one creature (Quilled Greatwurm). Kept on purpose: Arena-style automatic choices, "exact in duel" entries, timings with the same result, the "outside the game" zone (Extrapolate the Impossible, Turtles Forever, North Wind Avatar).
- **PLAN-E:** Relic of Legends, New Blood, ascension (one permanent only), Propaganda, Orcish Bowmasters, Enlightened Tutor and Herald's Horn, "untap up to N lands", Phyrexian Altar, Teferi's Protection. 903.9b timing: the commander question comes at the next check, not at the instant of the move.
- **PLAN-H (H11 report):** Nuka-Nuke Launcher (radiation on each opponent instead of only the defending player: needs an emblem held by that player); sneak (the kept defender is not rechecked, 508.4a, as ninjutsu was before H5); Kili (only the mana part of an Equip cost is replaced); one defender for the tokens of one effect (general entry added in H5).
- **PLAN-G:** the 15 cards with Commander-only mechanics excluded from the reprint sets (`EXCLUDED_REPRINTS`): Breeches, Brazen Plunderer; Dargo, the Shipwrecker; Malcolm, Keen-Eyed Navigator; Akroma's Will; Bruse Tarl, Boorish Herder; Command Beacon; Inalla, Archmage Ritualist; Ishai, Ojutai Dragonspeaker; Kraum, Ludevic's Opus; Thrasios, Triton Hero; Tymna the Weaver; Vial Smasher the Fierce; Yuriko, the Tiger's Shadow; Jeska's Will; Command Tower. The plan said "to resume with Commander": Commander exists since PLAN-E, so they can now be added. Also out of the plan's scope: Commander sets, "Eternal" sets (TLE, SPE, TMC, HOC), Jumpstart (J25), Clue Edition (CLU), promos, Through the Omenpaths (OM1), Modern Horizons 3 Special Guests (set absent).
- **PLAN-C C19:** 5 cards that Scryfall does not have in French.
- **Card tests (PLAN-C C13, continuous):** the share of cards named in a rules test per extension. State at C13 (2026-10-03): FDN 41 %, FRA 23 %, EOE 23 %, DFT 17 %, OTJ 13 %, BLB 19 %, TDM 35 %, DSK 15 %, LCI 18 %, FIN 14 %; target at least 50 % per extension for the extensions before R7 and TDM, rares and mythics first, then cards with nontrivial effects. After PLAN-D D9 the overall figure was 4,356 / 5,171 (84 %, K lots + D9 tested the M/R/U cards of eleven extensions): measure again with `npm run coverage -- --set all --tests [--meta]` and with `--set <EXT>` for the never-named cards. Also pending: more Oracle expectation patterns (`clause` in `oracle-expectations.test.ts`) for recurring text forms, more official-ruling tests (`rulings.test.ts`) for other interactions (PLAN-R R7 "to continue").

## PLAN-J: not done (2026-10-09)

- **Automatic choices kept** (user decision, as in PLAN-H): the exiled card of Force of Will, Force of Vigor, Daze, Flare of Malice; Cresting Mosasaurus's sacrifice; which Army gets amass counters; which lands "untap up to N lands" picks (only yours); the permanent Gene Pollinator and Relic of Legends tap; the kind of counter removed for Scholar of New Horizons and O'aka.
- **Immediate "effects" in replacements and mana abilities** (`GraveyardReplacement.gainLife` / `createToken`, `onPrevent.opponentsMill`, mana `removeCounter`, `drawback.opponentsGainLife`): a generic list would need an effect runner off the stack, inside mana payment; PLAN-H rejected it for the graveyard replacements. The Mindskinner's mill was made a real mill instead (J4c).
- **Token-copy exceptions as `LayerMods`** (`copyToken`'s ~10 exception fields, Firion's `equipDiscount`, `removeSupertypes`): a copy rework for two keys.
- **Renames only, kept:** the activation flags `exhaustReuse`, `powerUpExtraUses`, `activateAsThoughHaste`, `jaceLoyaltyInstant` (under `abilityCost` they would stay one-card fields); the ninjutsu cost as `CostDef.bounce` (one key, a changed default pick); the low-value keys `graveyardSize`, `stash`, `forageOrPay`, `collectEvidenceTargetsManaValue`, the default-pick hints `distinctColors` / `preferHighManaValue`.
- **Approximations kept:** Skyseer's Chariot (a "nonland name" question would need a new name kind in the client, the server catalog and the protocol, for one card); Nameless Inversion (an empty `setSubtypes` means "all subtypes" for Ultima; "loses all creature types" needs its own form); Creeping Bloodsucker and Winding Constrictor (damage dealt and player counters do not return what was done); Sidisi; Drown in the Loch (a per-target graveyard size).
- **Variants and ops kept** (no generic form or a net gain of zero): Amount `pow`, the Wheel of Misfortune family (`numberChosen`, `numberChoosers`, `chooseNumbers`), `beholdSharingType`, `extraTurn`, `prime`, `opponentDealtNoncombatDamageLastTurn` (the turn log is cleared each turn), `sourceDealtDamage` (an object's lifetime), the six single-card Refs, Karmic Justice's `destroyed`, ops `counterAbilitySilence`, `countersAboveBase`, `exileForManaValue` (the "pay" family, user's call), `flickerChosen`, `meld`, `portent`, `tripleTriad`, `revealFaceDown`, `reduceSpeed`; `while: "sourceTapped"` / `"tapped"`.

## AI

- Multiplayer: ISMCTS is for duels only; Commander at two uses it (kept after a 40-game measure); in 3 to 4 players the heuristic level plays. Medium-level priority decisions take 1.5 to 4 s on boards of 50 to 90 permanents (four-player games), already before C17 (`docs/ai.md`, "Pitfalls") (PLAN-C C17).
- Server-side determinization `forAgent` for AI seats was not done (PLAN-E E14): the server AI receives the full state as in the browser worker, under the same rule "never read the opponent's hand, deck, library order or hidden faces".
- Medium AI in Commander proposes illegal decisions that are refused cleanly (the game continues): to examine (PLAN-H report).
- Performance ideas not done (PLAN-H report): tokens created by batch, lazy trigger sources, cheaper state copy, AI bounds on very large boards. PLAN-S: compiled filters once (P3) and a trigger index by event (P4): under 4 % and 8 % of profile time after P1/P2; the absolute bench target of 5,000 decisions/s is judged before and after, never reached against an old number on WSL.
- 2026-09-29/30 audit leftovers: no card-specific hints in `policy.ts` (holding a counterspell, targeting the right threat), no deck-specific game plan, no archetype mulligan, no multiplayer policy beyond the lethal/threat attack choice, no weight tuning by self-play.
- Commander balance (PLAN-E E15, to decide with the user): with the medium AI Edgar Markov wins 59.3 % +/- 3.9 in duel (600 games) and its seats 33.3 % +/- 5.3 at four players (300 games); lists were not touched (a gap is fixed in the AI first).
- Commander position in the bench (PLAN-E E15 report): not done.

## Client and interface

From PLAN-C C18 (not done) and PLAN-R R8 (not done):
- Choice of the lands to tap at payment and of the hybrid symbol (manual tapping before casting, C5, already allows choosing).
- Scry and surveil by dragging (top, bottom, graveyard) instead of the two generic steps (choose, then order).
- `Card` memoized (views are recreated at each update: a custom comparison to measure); sizes in `rem` instead of px; Biome rule `noStaticElementInteractions` (12 cases).
- Accessibility to finish: ARIA of the choice windows, all sizes in `rem`.
- Land untap for a land whose ability has another cost or a trigger (Arena does not allow it either); combat preview that ignores replacements and triggers.
- Playwright capture for the new client choices of PLAN-A (the two modes of Teamwork, target tied to a chosen player, counters split among creatures) (A report).
- From the 2026-09-30 audit section 4: always answer a trigger the same way ("always respond the same"), automatic lands and a sample hand in the deckbuilder, a mana-value column view; check what is left against the current interface before starting.

## Platform, security, operations

- Public service gaps (2026-09-29/30 audits): no accounts, ranking, matchmaking, spectators, chat or emotes, game history; the 200 room slots can be occupied by abandoned rooms (5 minutes each). Rooms are persisted since P2/C16, so this item concerns capacity only (`maxRooms`, `maxHeapMb`, `MTGX_MAX_AI_ROOMS`).
- AI rooms: 12 at most in practice (RSS 640 MB under pm2's 768 MB, PLAN-E E15 measure); to revisit if the VPS changes.
- Absolute bench: the CPU is variable under WSL; `bench` and `ai-smoke` are reliable only on mains power (CLAUDE.md pitfalls).
- Legalities are checked weekly against Scryfall (C19) but a rotation or an announced ban before a reimport goes through `cards/data/legality-overrides.json`.
- The meta snapshot of `docs/meta/2026-09-29/` is dated (online games, one representative list per archetype): redo the analysis (same method) before a new meta-driven lot (PLAN-P4 limits).

## Process reminders from the plans

- A [rules] lot advances `RULES_VERSION`; golden games that replay identically stay untouched; a lot without rules change must replay them identically without advancing the version (PLAN-C).
- Group [rules] lots in one release: each version change can interrupt online games and make local saves unresumable; run `npx tsx tools/rooms-check.ts` before deploying (PLAN-C C16, `deploy/update.sh`).
- Report of a lot: tests added, gaps found, approximations removed or added, change in the debt reference, bench if a hot path is touched (PLAN-C).
- Before implementing a deferred rule, reread the paragraph of `docs/history.md` that deferred it (CLAUDE.md "Deferred until a card requires it").
