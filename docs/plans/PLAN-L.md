# PLAN-L — Backlog pass (2026-10-09)

## Context

After PLAN-J the user asked to do everything in `docs/backlog.md` that can be done now. Five read-only surveys (2026-10-09) checked each item against the code.

**Out of scope:**
- Items that wait on a user decision: the PLAN-S "pay" family and the `CardDef` rework, Commander balance (Edgar Markov), the meta snapshot, the public-service features (accounts, ranking, chat, spectators).
- Rules deferred until a card requires them (blocking several attackers, battles, layer 3, loop shortcuts, 616.1 order, 613 outside the battlefield).
- Approximations kept by user decision (Arena-style automatic choices, PLAN-H and PLAN-J; "outside the game" zone).
- The exact combat preview (needs an engine simulation; the preview stays documented as ignoring replacements and triggers) and land untap beyond `{T}` (Arena does not allow it either).

**Survey findings that change the backlog:**
- C13 is met: every set is at 56 % or more of cards named in a rules test, 81 % overall (5,184 / 6,372).
- "Mana in any combination of colors" already works in the solver and in effects (K2, rules 73). Only a mana ability tapped by hand gives a single color.
- The mechanics listed as absent on 2026-09-30 (day and night, dungeons, the Ring, energy, initiative, battles) are still absent from the pool.
- The C12 groups "tap N untapped creatures" and "player who put the counters" were done in K2. Two cards were missed: Exemplar of Light (`by: "you"`) and Orphans of the Wheat (the source may be tapped).
- Stale entries: the Aura control timestamp (fixed, 613.7e), Fear of Burning Alive (the Oracle says "this creature deals"), and several PLAN-E names already lifted (ascension, Propaganda, Enlightened Tutor, Herald's Horn).
- The sneak defender is not rechecked at resolution (508.4a) and has no approximation entry.
- AI: the refused decisions in Commander come from attack taxes (all heuristic levels) and lone blocks on menace (beginner). The medium AI on Commander boards of 50 to 62 permanents takes 5.7 ms per decision on average (worst 308 ms), not 1.5 to 4 s.
- French: Null Brooch, Scorched Ruins and Mind Twist have a French name but no French text; the five C19 cards are still not in French at Scryfall.

## Principles (as in PLAN-J)

- A lot without a rules change keeps the golden games identical and does not advance `RULES_VERSION`. A [rules] lot advances it once and regenerates only the golden games that diverge (the commit names them).
- Every lifted approximation gets an Oracle-based test and leaves `docs/approximations.md`; a new one is added there.
- New player questions are never asked with a single option; the suggested answer is what the engine chose so far.
- Debt: no single-card field without a reason in `debt-baseline.json`; ceilings lowered as soon as they go down.
- One commit per lot or sub-lot, on `dev`; `npm run verify -- --set <EXT>` per lot, `--full` at the end.

## Lots

### L0 — Housekeeping

- This plan; CLAUDE.md "Plans" line.
- `docs/backlog.md`: C13 figures, the "check" items settled, stale items removed, the any-combination wording, the AI figures.
- `docs/approximations.md`: Fear of Burning Alive removed; sneak defender added (until L9).
- `french-overrides.json`: French text for Null Brooch, Scorched Ruins, Mind Twist.

### L1 — AI (no rules change)

- Attack taxes and minimum blockers repaired for every level (`payableAttacks`, `withRequiredBlocks`); the random AI shares them.
- Arena: refused decisions counted in the report. Bench: Commander at four players, timed by board size.
- Server AI seats: `forAgent`, a determinized state for the seat (hidden hands, libraries and face-down cards redrawn from what the seat may know), so medium and beginner simulations no longer see hidden information. Test like `ismcts.test.ts`.
- Multiplayer: the attackers are chosen against the player the attack will target (today the blockers are read from the lowest-life opponent, then the attack may go to another one).
- Hold a counterspell: on its own main phase, the medium AI keeps the mana for a counterspell in hand rather than casting a spell that would leave it unable to cast it, when the opponent has cards in hand. Judged by arena (600 games).

### L2 — Commander-only cards [rules]

- The ten cards of `EXCLUDED_REPRINTS` still missing: Breeches, Dargo, Inalla, Ishai, Kraum, Malcolm, Thrasios, Tymna, Vial Smasher, Yuriko. Import by name into EDH (an extra-names list in the importer), scripts in `edh/partners.ts`, tests in `edh-partners.test.ts`.
- Commander ninjutsu: an activated ability usable from the command zone (`fromCommand` on activated abilities, as on triggered and static ones).
- Dargo: sacrifice to pay at {2} each (`sacrificeToPay` parameter).

### L3 — Mana in any combination tapped by hand [rules]

- `tapForMana` takes `colors` (one per unit) for a `combination` ability; the offer carries the amount and the flag.
- Client: a division window when tapping such a source; a lone multi-color source asks its color instead of taking the first.
- Baxter Building, Realm-Scorcher Hellkite, Desolation of Smaug: one division question instead of four picks.

### L4 — Approximations, small [rules]

Exemplar of Light, Orphans of the Wheat, Zhao (test), a "damage dealt" store (Sonic Shrieker, Torch the Tower), Cytoplast Manipulator, Central Elevator, Alania, Eluge, Great Train Heist, Zenos, Vision Quest, Orcish Bowmasters, Teferi's Protection, Kindle the Inner Flame, Sorceress's Schemes, Memories Returning, the sneak defender recheck. Each one is checked against its Oracle text and rulings first; one that turns out larger moves to L5 or stays documented with its reason.

### L5 — Approximations, medium [rules]

Eriette (attachment trigger and a control duration tied to the Aura), ability counters timestamped in layer 6, one defender per token (508.4), Moonlit Meditation's "may" on amass, endure and gift tokens, Heirloom Epic (convoke for an ability), Abuelo's Awakening, Theorist's Sanctum, Kíli, Hawkeye, Nuka-Nuke Launcher.

### L6 — Scry and surveil [rules]

- Scry: the bottom cards are ordered by the player (701.22a).
- Client: one window with zones (top, bottom, graveyard) and dragging, with buttons kept for keyboard and touch.

### L7 — Payment choices [rules]

- Phyrexian mana: the player may pay life instead of mana.
- Hybrid: the symbol chosen per spell, for any hybrid cost.
- The lands tapped at payment: the client lets the player tap sources during a "pay" stage of the cast, the automatic payment completing the rest.

### L8 — "Always answer this way"

An "always" checkbox on the "may" questions of a trigger, kept per card and ability in the autopilot settings, with a reset in the sidebar.

### L9 — Deck editor

Automatic basic lands, sample hand, mana-value column view.

### L10 — Client quality

`Card` memoized (measured), a shared accessible dialog (`aria-modal`, `aria-labelledby`, focus trap and return), the Biome rule `noStaticElementInteractions` turned on, font sizes in `rem`.

### L11 — Rules tests

Raise the never-named cards: EDH first, then the lowest sets; more official rulings.

### L12 — Closing

History, backlog, summary.

## Tracking

| Lot | State | Commit | Rules |
|---|---|---|---|
| L0 | done | 0ea6e9c | — |
| L1a | done: attack taxes and minimum blockers, arena refusals, Commander bench | 15c6d4a | — |
| L1b | done: `forAgent` (`fair`), holding a counterspell; attackers weighed against the attacked player measured worse (47.8 % ± 2.8, 1,198 games) and dropped | 968daf5 | — |
| L2 | done: ten Commander-only reprints (EDH), commander ninjutsu, `ref.eventPlayers`, `sacrificeToPay` `{ filter, each }`; fuzz found a mixed player/planeswalker choice crash (fixed) | 38d07d5 | 186 |
| L3 | done: `tapForMana.colors`, the division window, a multi-color source asks its color (it took the first), mana symbols in the "Add" buttons, three cards with one division | a71f5df | 187 |
| L4 | done: 17 items (13 approximations lifted, 2 undocumented gaps, 1 missing test, 3 more cards with the combined search); Kindle the Inner Flame moved to L5 (behold of three cards as a flashback cost) | 798d93a | 188 |
| L9 | done (before L5, client only): basic lands by colored symbols (`decks/autoLands.ts`), sample hand, mana-value columns in place of the collection; checked by `deck-smoke` | 72d1928 | — |
| L5a | done: Hawkeye, Nuka-Nuke Launcher (and intimidate), Kíli, Abuelo's Awakening, Heirloom Epic | 7bb4078 | 189 |
| L5b | done: Moonlit Meditation's "may" for amass, endure and gift (token copies by an effect stay unreplaced, documented), entry choices of token copies, Theorist's Sanctum, Kindle the Inner Flame | 06d861e | 190 |
| L5c | done: who puts counters (infect, wither, costs, entering), ability counters in layer 6, Eriette as a trigger, tokens created attacking divided among defenders; 903.9b left documented (a question before the move is only possible inside a resolution, the draw step and costs would keep the current way: little gain) | 2aad375 | 191 |
| L6 | done, client only (the bottom cards already go in the order picked, 701.22a): one scry/surveil window with zones, drag or buttons, the top order given to the engine's second question automatically | e6b3db7 | — |
| L7 | done [rules 192]: Phyrexian mana paid with life or mana as the player chooses (`CastChoices.phyrexianLife`, offered by `legalActions` when there is a choice, spells and abilities; the AI also tries the most life); the hybrid color offered for any hybrid spell (asked when it matters, and in full control); full control: a "mana" stage of the cast where the player taps the sources, the automatic payment completing the rest; 4 rules tests, `tools/payment-smoke.ts` | 0ebae43 | 192 |
| L8 | done: a trigger's "may" asked to its controller carries `ChoiceRequest.remember` (card, ability, question); "Always answer this way for this ability" keeps the answer in `AutopilotSettings.autoAnswers` (saved with the settings, checked by the server), which the autopilot applies even in full control; a sidebar button forgets them; 1 rules test, `tools/always-answer-smoke.ts`. Also seen on the way: about 25 engine prompts cited a card by its English name (`nameOf`): now a card reference (`cardRefOf`), shown in the interface language (separate commit, fe61fd5) | ddfcacd | — |
| L10 | done, client only: `Card` memoized by value (`sameCard`: face and object compared by content; a stable click function calls the latest `onClick`), measured on a 90-card board in dev mode: about 5 to 8 ms of rendering per update before, near 0 after; shared `Dialog` (`aria-modal`, `aria-labelledby`, focus taken, Tab kept inside, focus given back; Escape and outside click for the windows that close) for the game, choice, scry, graveyard, exile, game-over and deck windows; Biome `noStaticElementInteractions` on (10 cases left, each with its reason: hover previews, context menus, overlays, drag and drop); 115 font sizes in `rem`; `tools/dialog-smoke.ts` | | — |
