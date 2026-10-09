# PLAN-J — Debt and approximations pass after the Commander decks

## Context

The last pass on debt and approximations was PLAN-H and the 2026-10-07 audit (rules 149 → 169). Since then, the ten precons, PLAN-I and two days of work (rules 178) have added debt back.

Current debt baseline (`packages/cards/data/debt-baseline.json`):

| Section | Entries | Note |
|---|---|---|
| single-card keys | 120 | 95 still carry the boilerplate reason "to attach to a family" and were never analysed one by one |
| player statics | 52 | |
| keywords | 12 | |
| ops | 17 | |
| union variants | 40 | |

Ceilings that matter here: Single-card values 107, TriggerSpec 61, ObjectFilter 74, CostDef 33.

`docs/approximations.md` has about 29 general entries and about 224 per-card lines (164 `rule`, 34 `auto choice`, 26 `timing`). It had 207 per-card entries after the audit.

Three read-only surveys (2026-10-09) checked every tracked entry against the forms the engine already has. They found three things.

**Debt removable:**
- 7 variants or ops merge exactly into existing forms.
- 21 more need a small generic extension. Most of them go through one generic "action" trigger, about −19 TriggerSpec variants.
- 53 single-card keys, 7 player statics and 1 keyword can go: 19 keys use existing forms, the rest one shared form per family.

**Approximations liftable:** about 30 with small changes, about 19 with medium families.

**Problems found along the way:**
- Undocumented deviations:
  - "life lost this way" stores the amount requested, not the amount actually lost (Malakir Bloodwitch, Exsanguinate);
  - the Riku "modal" check also fires on overload/cleave cards;
  - about 12 `setSubtypes` scripts drop Vehicle, Equipment and land types;
  - `damaged` reads only damage still marked, which is wrong for 8 cards;
  - `spellCost` colored reduction drops unmatched symbols instead of reducing the generic part (118.7c).
- Four claims in the 2026-10-07 audit §5 are wrong:
  - the turn log is cleared each turn, so `sourceDealtDamage`, `sourceDealtCombatDamage` and `opponentDealtNoncombatDamageLastTurn` stay;
  - `prime` cannot use FilterCompare;
  - `untappedInUntapStep` has no log entry;
  - `while: "sourceTapped"` / `"tapped"` have no equivalent.
- Stale reason texts in the baseline: still in French, "Exhume" for Unearth, "to review in R4".

**User decisions (2026-10-09):**
- Do **everything found**: debt and approximations, the medium families included.
- **Keep the Arena-style automatic choices** as PLAN-H decided. These stay automatic: Force of Will/Daze/Flare/Mosasaurus picks, the amass Army, "untap up to N lands", the permanent Gene Pollinator / Relic of Legends taps. Only their rules part is fixed.
- **Golden games may be regenerated** where a lift changes random-number use or the decision sequence. Each commit names the games it regenerated.

**Intended outcome:**
- About 85 fewer tracked debt entries.
- TriggerSpec about 61 → 42; ObjectFilter about 74 → 62; CostDef 33 → about 26.
- About 45 fewer per-card approximations.
- The undocumented deviations fixed.

## Principles (from PLAN-H, unchanged)

- **Lots without a rules change** keep the fuzz fingerprints and the golden games identical, and do not advance `RULES_VERSION`.
  - Fingerprints: seed 7, whole pool and Commander precons, recorded before J1.
  - If a merge believed exact changes a fingerprint, it moves to a [rules] lot.
- **[rules] lots** advance `RULES_VERSION` once per lot. They ship as one grouped release (`tools/rooms-check.ts` before deploying).
- **Keys are counted by name** (`debt.test.ts`). A new field reuses a name already shared with the same meaning (`self`, `combat`, `nth`, `rest`, `targeting`, `untap`). A new name creates a new single-card key.
- **Ceilings** drop in the same commit: `npx tsx tools/debt-ceilings.ts --write "<reason>"`, with one `ceilingNotes` line per lot. A rise is justified in the same line.
- **Tests:**
  - one test per removed field or variant (as `engine/test/filters.test.ts` did in H10), in the set's rules test file or `rulings.test.ts`;
  - every lifted approximation gets an Oracle-based test, and its entry is removed from `approximations.md`;
  - never freeze wrong behaviour.
- **New player questions** are never asked when there is only one option. The suggested answer is what the engine chose so far.
- **Commits:** one per lot or sub-lot, on `dev`, made at the user's request.

## Lots

### J0 — Housekeeping (no rules change) — ✅ done (b05f461)

- Write `docs/plans/PLAN-J.md` from this plan, and point CLAUDE.md's "Plans" line to it.
- `debt-baseline.json` reason texts:
  - translate the three French ones (`absorbsDamage`, `keepsDamage`, `damageHealsFirst`);
  - `exileIfLeaves`: Exhume → Unearth 702.84a, here and in `ceilingNotes`;
  - replace "to review in R4" (`auraStealsCheaper`, `exhaustReuse`, `scryBeforeExplore`, `winFirstCoinFlips`);
  - fix the labels of `freeFromExileOncePerTurn`, `whileCrafting` and `removeCountersAmong`;
  - give each of the ~48 kept boilerplate keys its real one-line reason, taken from the survey (for example `notControlledByYou`: `controller:"opponent"` reads the owner off the battlefield);
  - note that `base`, `equals`, `which` and `foretell` are fields of already-tracked variants or ops.
- `docs/approximations.md`:
  - remove Three Bowls of Porridge: same result, `once` is tracked per object;
  - fix Young Deathclaws: it has scavenge, not recover;
  - recheck Virtue of Loyalty: it is exact within the catalog, since Blossombind also stops untapping.
- `docs/audits/2026-10-07-debt.md`: add a short "Checked 2026-10-09 (PLAN-J)" note correcting the four §5 claims.

### J1 — Exact merges into existing forms (no rules change) — ✅ done (1e8f826)

**Variants** (model types in `packages/engine/src/model/rules.ts`; DSL helpers in `dsl.ts` emit the generic form, so card scripts don't change):
- `manaPoolAtLeast`: becomes `amountAtLeast(manaInPool)`. Amount `manaInPool` then has 2 users.
- `refLife`: becomes "≥ n and not ≥ n+1". This also removes key `equals`.
- `exileAtLeast`: becomes `amountAtLeast(count exile)`. Add a test with a face-down foretold card.
- `evenCounters`: becomes `cond.even/odd` built from `countersOn`, `div` and `sum`.
- `opponentsWithMoreInHand`: becomes `refCount(playersWhere(...))`.
- `unlockedDoorNames`: becomes `amount.distinctNames({subtype:"Room"})`. This one is nearly exact; if the fingerprint moves, it goes to J4.
- op `becomeCopyKeepAbilities` → `becomeCopy{keepAbilities, except}` goes to J4: its 707.9b exceptions make it a rules change.

**Keys:**
- `freeMaxManaValueCreatures` → `freeFilter` with `compare`. This removes `stack.ts:1493,1498`.
- `perTurnEvents`, `perDivisor` and `perSpeed` → `perAmount`. Add `div` and `speed` to `cdaValue` (`layers.ts:177,261`).
- `toYou` → `to: TargetFilter`.
- Danitha's `opponent` → `castSpell.targeting` typed as `TargetFilter`.
- `usingManaFrom` absorbs `usingManaFromSelf`, written `{self:true}`.
- `noManaSpent` → `not amountAtLeast(spent mana, 1)`. Check the last-known information.
- `sameNameAs`: `notSameNameAs` becomes `not:{sameNameAs}`; also check it in `matchesObjectFilter`.
- `discardedThisTurn` → a check on the mayhem `PlayFromZone` path (`stack.ts:684`).
- `graveyardCastRemoveCounters` and `removeCountersAmong` → `CardDef.castFromGraveyard.removeCountersAmong`.
- `exilePermanents` → `counter.exile: boolean | ObjectFilter`.
- `firstThisTurnFree` (Kíli) → a static `condition` on the turn log plus `abilityCost{equip, reduce}`.
- `reduceSymbols` → `spellCost.colored`.
- `bounceOther` / `exileOther` → `CostDef.bounce` / `CostDef.exile`.
- `ownerControl` → op `putFaceDown` replaced by `moveTo` + `MoveSpec.as`. Guard the Aura-host choice.

### J2 — Small shared forms (no rules change) — ✅ done (5ee3cc3)

- **Activated-ability reduction by target:** `reduction.generic` evaluated with the target. Absorbs `reduceByTargetColors` and `reduceByTargetCounters`.
- **ObjectFilter `shares: {what, with: Ref}`**, resolved in `withX`. Absorbs `nameOf`, `sharesCardTypeWith`, `sharesColorWith` and `sharesCreatureTypeWith`; `tapChosen` must call `withX`.
- **`ManaAbilityDef.amount: number | Amount`.** Absorbs `amountGraveyard`, `amountPer`, `amountCounters`, `amountSelfPower` and `amountDistinctPowers`.
- **`produceColorsOf: Ref`.** Absorbs `produceColorsZone` and `produceLinkedColors`.
- **ObjectFilter `chosen`.** Absorbs `numberChosen` and the 5 `*Chosen` fields; `withChosen` is the resolver.
- **Prevention:** `PreventionAbilityDef` is retired in favour of `eventReplacement{damage, prevent}` (`bySource`, 3 cards).
- **Redirection:** `redirectToAttached` becomes `redirectTo: "attached" | "source"`. Absorbs keyword `absorbsDamage`.
- **Stack targets:** `stackItems.only: "spells" | "abilities" | "triggered"`. Absorbs `spellsOnly`, `abilitiesOnly` and `triggeredOnly`.
- **Player designations:** `PlayerState.designations` plus `Condition{kind:"designation"}`. Absorbs `enduringStory`, `PlayerState.citysBlessing` and `Condition.citysBlessing`.
- **`LayerMods.gainAbilitiesOf {zone, filter, triggered}`.** Absorbs `gainActivatedFrom`, `gainActivatedFromGraveyard`, `chosenName` and `triggered`. This one is near-exact, so it moves to J4 if the fingerprint moves.
- **Trigger and condition folds:**
  - `sourceDealtCombatDamage` → `sourceDealtDamage{combat}`;
  - `firstEndStep` → Condition `step.nth`;
  - `discardSelf` → `discard{self}`;
  - `untaps` → `taps{untap}`;
  - `excessDamage` → `isDealtDamage{excess}`.

### J3 — Generic action trigger (no rules change) — ✅ done (594c17c)

- One `TriggerSpec {on:"action", action, whose?, self?}`. It matches the **existing** RulesEvents through a table: event kind → acting player, object, amount. Emitting the existing events keeps the client log, the sounds (`eventSounds.ts`) and the hidden-information filters (`filterEvents`) untouched.
- It absorbs the single-card `search`, `playerLoses`, `discover`, `forage`, `gift`, `bend`, `caseSolved`, `manifestDread`, `attackAbilityTriggered` and `saddled`, and the multi-card `crime`, `collectEvidence`, `scryOrSurveil`, `exhaustActivated`, `expend` (with `n`), `plottedSelf`, `cycleSelf` and `transformsSelf`.
- Matchers today are in `triggers.ts`, around 554–1126.
- Watch-outs:
  - `playerLoses` must accept a player who just lost;
  - `attackTriggered` is dispatched by a direct call (`triggers.ts:1126`);
  - `stack.ts:1061` tests `on === "plottedSelf"`;
  - `castSelf` stays apart;
  - grep `packages/ai` and `client` for `on === "…"` readers.
- Cards use the `when.*` helpers, so the change stays in the engine.

### J4 — Debt merges that change behaviour [rules]

**J4a — Turn-log damage entries and untap batch:** ✅ done, rules 179 (99ddb35)
- Damage entries get the damaged object's `id` and the source object's id, and `TurnLogQuery` gets `self: "target" | "source"`. Match on the object id, not the physical card id (400.7).
- With that:
  - Amount `lkiDamage` (Tangled Colony) goes;
  - op `hellkite` (Steel Hellkite) goes;
  - `GameObject.combatDamagedPlayers` goes;
  - `damaged` (`layers.ts:785`) becomes "marked damage or damaged this turn". This lifts Sold Out and fixes the 8 cards that use `damaged: true`.
- The untap step goes under `simultaneously`; The Millennium Calendar becomes an `untaps{untapStep}` batched trigger. Remove `TurnStats.untappedInUntapStep` and the Calendar half of approximations l.107.
- `becomeCopyKeepAbilities` → `becomeCopy` (from J1).
- `noncombatBonusThisTurn` → `fx.thisTurn` replacement; `playerEffect` fixes `replacement.modify` amounts at resolution.
- `millUntil` → `revealUntilN{rest:"graveyard"}`: reveal and put, not mill.
- `activateTargeting` → `activateAbility.targeting`. Granted abilities now count.

**J4b — Costs:** ✅ done, rules 180 (643cd46); activation flags and ninjutsu bounce cost kept (renames only)
- `"X"` is allowed in `sacrifice.count`, `tapOthers.count`, `exileFromGraveyard.count`, `discard`, `removeCounters.n` and `payLife`. Absorbs `discardX`, `sacrificeX`, `tapX`, `payLifeX`, `removeCountersX` and `exileFromGraveyardX`. Sacrifice for X now respects `cantBeSacrificed`.
- Ninjutsu-style return: `CostDef.bounce{attacking, blocked:false}` (key `blocked`). The default pick changes from weakest attacker to lowest mana value.
- `scryBeforeExplore` → `eventReplacement{explore, add 1}`; explore reads `quantityMods("explore")`.
- `freeFromExileOncePerTurn` → `castPermission{freeFrom:"exile", freeOncePerTurn}`.
- Activation rules on `abilityCost`:
  - `extraUses` absorbs `exhaustReuse` and `powerUpExtraUses`;
  - `asThoughHaste` absorbs `activateAsThoughHaste`;
  - `instantSpeed` absorbs `jaceLoyaltyInstant`;
  - turn-log `activate` entries get an `exhaust` flag.

**J4c — Immediate effects and copies:** ✅ done, rules 181 (29830e1): The Mindskinner's mill fixed; the immediate-effects form, token-copy exceptions and low-value keys kept
- Replacements and mana abilities get immediate `effects: Effect[]`, run off the stack like `asEnters`. Absorbs `gainLife`, `createToken` (through `reflexive`), `opponentsMill`, `removeCounter`, `opponentsGainLife`, `counters`, `countersOnDamaged`, `addCounter` and `drawback`. The Mindskinner's mill now goes through the real mill path, with its replacements, triggers and log.
- Token copies take `except: LayerMods`, and `copyToken`'s ~10 exception fields map onto it. Absorbs `equipDiscount` (Firion becomes copiable, without duplicate equip abilities) and `removeSupertypes`.
- Low-value keys, done last:
  - `graveyardSize` and `halfLibrary` → a per-player mill amount;
  - `stash` → `PlayFromZone` zone `"exile"`;
  - `forageOrPay` → `AdditionalCost.orPay`;
  - `collectEvidenceTargetsManaValue` → an Amount;
  - `distinctColors` and `preferHighManaValue` (default-pick hints) → merged.

### J5 — Small approximation lifts [rules] — ✅ done, rules 182 (Skyseer's Chariot kept: a new name kind across client, server and protocol for one card)

**Families:**
- **Look at an opponent's hand:** `fx.look(ref.handOf(...))`. For Sorcerous Spyglass and Arachne it runs in `asEnters` after `fx.chooseOpponent`; Deep-Cavern Bat looks before its exile.
- **Untap on other players' untap steps:** `untapOnOthersUntap{self}` for Thousand Moons Infantry and Bender's Waterskin.
- **"As this is turned face up":** a counters amount applied inside `turnFaceUp` for Bubble Smuggler and Crowd-Control Warden.
- **Life lost this way:** `loseLife` returns the actual loss and the op adds it up. Fixes Malakir Bloodwitch and Exsanguinate, and lifts the Gray Merchant half.
- **Counter of any kind for costs:** `removeCounterFrom` accepts `"any"`, with the kind still picked by the engine. Lifts Scholar of New Horizons and O'aka.

**Single cards:**
- Chromatic Orrery: `abilityCost{anyMana}`.
- Jason Bright: `not compare power = basePower`.
- Hancock: `perCounter: "any"`.
- Lumbering Megasloth: sum of poison and rad counters over players.
- Promise of Loyalty: `fx.keep`.
- Deep Analysis: flashback with life (`flashbackCost.life`).
- Squirming Emergence: `maxManaValueAmount` on the target; `legal.ts` `targetOptions` resolves dynamic specs without X.
- Hellkite Courser and Command Beacon: `chooseAmong` over the command zone.
- Skyseer's Chariot: a "nonland" name kind.
- Abstract Paintmage: no question when only one color is possible.
- Forbidden Orchard: tap cause `"mana"`.

**Deviations fixed:**
- the Riku modal check excludes overload/cleave alternative-cost modes;
- the `spellCost.colored` unmatched-symbol reduction follows 118.7c (a shared implementation with `costReduction.colored`).

### J6 — Medium approximation families [rules] — 🔄 in progress

**J6a — Public reveal:**
- `fx.reveal(ref)`: the `look` op without `look: true`.
- `search.reveal` emits the reveal after the pick.
- The typecycling and transmute generators (`cards/src/scryfall.ts:416,436`) set it.
- The ~141 "search … reveal it" scripts are migrated, guided by a regex over the Oracle texts. Parker Luck, Keen Duelist, Yennett and Cloak and Dagger's hand go through it too.
- The general entry "Search (701.23)" is removed.
- Check `filterEvents`, `ai/test/hidden-info.test.ts` and the client log line for a public reveal.

**J6b — Library order:**
- `lookAtTop rest: "bottomAnyOrder"` asks the existing `order` question. 13 cards: Stock Up, Beastrider Vanguard, Proteus Staff, Zurgo and Ojutai, Commune with Beavers, Growing Rites, Avengers Tower, Flow State, Collected Company, Morbius, Rediscover the Way, Accumulate Wisdom, Commune with Nature.
- Rowan's Grim Search orders its top cards.
- Cascade puts the uncast card on the bottom with the others in a random order (`ops/spells.ts:80-126`).
- Dazzling Sphinx: random bottom order (a `MoveSpec` flag).
- Golden games regenerated only where they diverge, named in the commit.

**J6c — X tied to an ability's target:**
- Apply `concreteSpec` to `ab.targets` before `validateTargets` (`stack.ts:3403`).
- Add an exact-X map in `legal.ts` `targetOptions`.
- The AI activate paths use it (`packages/ai/src/options.ts` around 152–209, `fitX`).
- Likeness Looter, The Mycosynth Gardens and Rydia move to `manaValueAmount: amount.x`.
- Adjust `woe.test.ts:4608`. Strict fuzz (`--offers 4`) is mandatory. Sidisi stays approximated.

**J6d — "Is a [creature type]" keeps noncreature subtypes:**
- A layer-4 change that keeps `NON_CREATURE_SUBTYPES` (`targets.ts:197`).
- Lifts Nameless Inversion and Honest Work, and fixes the ~12 `setSubtypes` scripts (`otj/blue.ts:132`, `fdn/blue.ts:198,270`, `tmt/blue.ts:242`, `ecl/blue.ts:190`, `spm/green.ts:127`, `msh/green.ts:336`, …).

### J7 — Closing — ⏳ to do

- `docs/history.md`: new section 14 "PLAN-J", with a bilan in the format of the PLAN-H one.
- `docs/backlog.md`:
  - remove the done items (T1/T2 action triggers, PLAN-H reports);
  - add "Not done": the auto-choice lifts declined by the user (alt-cost picks, amass Army, untap lands, tap choice for mana abilities), Creeping Bloodsucker, Winding Constrictor, Sidisi and Drown in the Loch.
- Recount `approximations.md`.
- Update CLAUDE.md "State" and "Documents".
- Run `npm run verify -- --full`.

## Not done (user decision or no generic form)

- Arena-style automatic choices stay. The rules part is fixed where one exists.
- No generic form, or net gain ≤ 0:
  - Amount `pow`;
  - the Wheel of Misfortune family;
  - `beholdSharingType`, `extraTurn`, `prime`;
  - the 6 Refs;
  - Karmic Justice `destroyed`;
  - ops `counterAbilitySilence`, `countersAboveBase`, `exileForManaValue` ("pay" family, the user's call), `flickerChosen`, `meld`, `portent`, `tripleTriad`, `revealFaceDown`, `reduceSpeed`;
  - the 22 genuine single-rule player statics and 11 keywords listed in the survey.

## Critical files

- Engine:
  - `packages/engine/src/model/{rules,effects,cards,state,decisions}.ts`
  - `dsl.ts`, `triggers.ts`, `effects.ts` (evalCondition, evalAmount, resolveRef, withX), `turnlog.ts`, `turn.ts`, `actions.ts`, `stack.ts`, `legal.ts`, `layers.ts`, `mana.ts`, `replacement.ts`, `statics.ts`
  - `ops/{zones,players,permanents,counters,spells,mana}.ts`
  - `record.ts` (`RULES_VERSION`)
- Cards: `packages/cards/src/scryfall.ts` and the scripts named above.
- Guards and baselines: `packages/cards/data/debt-baseline.json`, `packages/cards/test/{debt.test.ts,debtSurface.ts}`, `tools/debt-ceilings.ts`.
- AI: `packages/ai/src/options.ts` (J6c).
- Docs: `docs/approximations.md`, `docs/backlog.md`, `docs/history.md`, `docs/audits/2026-10-07-debt.md`, `CLAUDE.md`.

## Verification

**Before J1:** record the fuzz fingerprints.
- `npm run fuzz -- --games 200 --pool all --seed 7`
- `npm run fuzz -- --games 60 --pool commander --format commander --seed 7`

**Lots without a rules change (J0–J3):**
- The same fingerprints, identical.
- `ai/test/golden.test.ts` passes without `--update`.
- `npm run verify -- --set COMMANDER` and `npm run verify -- --set FDN`, the set most touched by the shared forms. Use another set if a lot is centred on one.
- `debt.test.ts` passes with the lowered ceilings.
- `npx tsx tools/dsl-census.ts --max 1` shows the variants gone.

**[rules] lots (J4–J6):**
- Advance `RULES_VERSION` and add a history line.
- One Oracle test per lifted entry or fixed deviation.
- `npm run verify -- --set <EXT>` for the sets touched.
- Strict fuzz (`--offers 4`) for J5's Squirming Emergence and for J6c.
- `npm run golden -- --update` only for the games that diverge, named in the commit.
- `npx tsx tools/rooms-check.ts` before the grouped deployment.

**Client-visible changes** (J5 look at hand, J6a public reveal, J6b order question):
- The interface tests through verify `--ui`, with Vite restarted first.
- A one-off Playwright capture of the order question and of the reveal, saved in `test-results/`.
- `tutorial-smoke` and `lang-smoke`.
- New French catalog entries (`npx tsx tools/locales.ts`).

**End:** `npm run verify -- --full`. The counts in the history bilan come from `debt-baseline.json` and a recount of `approximations.md`.

## Tracking

| Lot | State | Rules | Commit |
|---|---|---|---|
| J0 | done | — | housekeeping (also: library-search window fix eb9cac1, user request) |
| J1 | done | — | exact merges: 7 variants, 18 single-card keys; fingerprints (seed 7) identical; `putFaceDown` → J4a (manifest through `MoveSpec` would ask a shock land's question) |
| J2 | done | — | small shared forms: 5 variants, 14 single-card keys, 1 player static, 1 keyword; whole pool and mixed fingerprints identical; Commander c42297fe → 637ffb4c (Chrome Mox offers its colors in WUBRG order, no rules change) |
| J3 | done | — | generic action trigger: 18 TriggerSpec variants into 1 (58 → 41); fingerprints identical |
| J4a | done | 179 | turn-log damage and untap entries; 4 ops, 3 variants, 1 key, GameObject.combatDamagedPlayers removed; Sold Out and the Calendar half lifted; golden games and fingerprints identical |
| J4b | done | 180 | X costs in the cost keys (6 keys), Twists and Turns as an explore replacement, Warped Space as a cast permission; activation flags and ninjutsu bounce cost kept (renames only); fingerprints identical |
| J4c | done | 181 | The Mindskinner mills for real; immediate effects in replacements and mana abilities, token-copy exceptions and the low-value keys kept (no form that removes debt without an off-stack effect runner or a copy rework) |
| J5 | done | 182 | 21 approximation entries lifted or removed as stale (Tin Street Gossip), 3 undocumented deviations fixed (life lost, Riku, 118.7c); Skyseer's Chariot kept |
