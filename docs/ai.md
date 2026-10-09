# The AI: levels, evaluation, combat by simulation, ISMCTS

The AI plays against the human in the browser (Web Worker): the level is chosen on the home screen (**Beginner**, **Medium**, **Expert**; in the code `beginner`, `medium`, `expert`), and this choice is kept in `localStorage`, under `planecircle.aiLevel`. The code is in `packages/ai/src/`.

## Files

| File | Role |
|---|---|
| `levels.ts` | `aiAgent(level, { seed, budget, players })`: the agent of a level; `AiLevel`, `AiBudget` |
| `profile.ts` | `Profile`: what distinguishes the levels (noise, responses, attacks, blocks, counterattack, mulligan, budget) |
| `heuristic.ts` | Heuristic decisions parameterized by the profile. `heuristicAgent()` = the Medium AI (fuzz, bench, tests) |
| `evaluate.ts` | Position evaluation; simulations (`rollout`, `simulate`, `step`) |
| `combat.ts` | Expert level: attacks and blocks by simulation |
| `ismcts.ts` | Expert level, duel: ISMCTS for priority decisions |
| `policy.ts` | Fast policy of the ISMCTS simulations |
| `choices.ts` | Answers to generic choices (scry, discard, trigger targets...) |
| `random.ts`, `scripted.ts` | Random AI (fuzz), scripted opponent (tutorial) |

## The levels

| Level | Spells | Attacks | Blocks | Other |
|---|---|---|---|---|
| **Beginner** | One-step simulation, but it sometimes takes a correct option at random rather than the best one (45%), or forgets to play (20%); no responses, no combat turn | What no blocker can kill without dying, plus a few at random; without thinking about the counterattack | Only if it kills without dying, or to survive | Wide mulligans; always plays its lands |
| **Medium** | One-step simulation, then evaluation | Combat rules (duels, lethal attack, safety on defense) | Greedy by simulation | |
| **Expert** | In a duel, ISMCTS; in multiplayer, like Medium with the counterattack | Search by simulation of the opposing blocks | Search: double blocks, local improvements | Evaluation with the opposing counterattack |

## Choices and mulligan

- **Generic choices** (`choices.ts`): targets of a trigger and new targets of a copy, "you may" and "unless ... pays" (yes or no), small numbers (X to pay, up to 6 values) and choosing one option among 6 at most: each answer is tried by a short simulation (`bestBySimulation`), the best position wins; otherwise the answer suggested by the engine.
- **Multiple choices, distributions, trigger order** (PLAN-C, C17): a few candidates, simulated until the stack is empty, answering the following questions with the suggestion (`bestSettled`):
  - distribution (combat damage, damage or counters divided): the suggestion, everything on one recipient, and for damage, enough to destroy the most valuable opposing creatures first, the rest to the player;
  - choosing several options (scry, search, piles, proliferate, multiple targets): the suggestion, the most and the least valuable, only its own, only the opponents';
  - trigger order: all the permutations up to three abilities.
- **Chosen costs and enters choices** (C8, C9): the engine's suggestion, which already ranks the objects (wither the creature that survives, sacrifice the least valuable...).
- **Mulligan** (`heuristic.ts`, "normal" profile): 2 to 5 lands out of 7; curve: with two lands, a spell of value 2 or less, with more, a spell playable the following turn (C17); at least one spell whose colored symbols are all produced by the lands in hand, basic land types included (305.6; before C17, basic lands, which do not print their ability, skipped this check).
- **Attacks in multiplayer** (`attackTarget`, C17): the player the attack can kill, otherwise the most threatening (power, planeswalkers, hand), and no longer always the one with the least life.
- **Legal declarations** (PLAN-L L1): every level drops the taxed attacks it cannot pay, the last ones first (`payableAttacks`, 508.1h), and the blocks below an attacker's minimum (menace, "three or more"; `withRequiredBlocks`). These were the decisions refused in Commander (Propaganda, menace).
- **Holding a counterspell** (PLAN-L L1, Medium and Expert): on its own main phase, an option after which none of the counterspells in hand could still be paid loses 2.5 (about one opposing spell), as long as an opponent has cards in hand.

## Evaluation (`evaluate.ts`)

- **Lasting characteristics.** Creatures are estimated from their characteristics in play, without the "until end of turn" effects (`durableChars`: `computeBattlefield` on a shallow copy of the state, without those effects).
  - An Aura (Pacifism), an Equipment or a permanent buff count through their effect on the creature.
  - A temporary buff counts only through what it changes in combat.
  - Before this, the AI never cast Pacifism.
- **Value of a creature** (`profileValue`): an offensive part and a defensive part.
  - Offensive: power, flying, menace, trample, double strike, lifelink.
  - Defensive: toughness, deathtouch, reach, first strike, vigilance.
  - "Can't attack" or defender cancel the first; "can't block" reduces the second; "doesn't untap" reduces the whole.
- **Other permanents.**
  - An Equipment has a value of its own, attached or not (it can change bearer).
  - An attached Aura is worth little: it counts through its host.
  - Beyond 7 lands, one more land is worth little.
- **Hand.** A permanent in hand is worth less than in play (0.7); an instant or sorcery keeps its flexibility (1.5).
- **Counterattack** (Expert level, during its turn): `incomingDamage` estimates the damage of the next opposing attack. The creatures that attacked stay tapped until the AI's next turn. The penalty is half the life loss, and it is strong if the attack would be lethal.

### Commander (PLAN-E)

- **Effective life** (`effectiveLife`): life, reduced in proportion to the combat damage received from the most threatening commander (life × (21 − damage) / 21); without commander damage, life. Read by `evaluate` and `targetOpponent`.
- **Commander waiting** in the command zone: 0.6 × its creature value, divided by 1 + (casts from the zone) / 2; it no longer counts as an emblem. The 903.9a question is settled by simulation (yes: the commander stays available).
- **Attack target** with several players (`attackTarget`): a player that an attacking commander can finish with its 21 points of commander damage is "killable".
- **Determinization**: a commander is public, even in a hand; it is neither drawn at random nor used to guess hidden cards.
- **ISMCTS** stays reserved for the duel, Commander included: 65% ± 15 against the Medium level over 40 two-player Commander games (random decks, budget 60, 2026-10-06).
- **Arena:** `npm run arena -- --a medium --b medium --format commander [--pool commander] [--by-deck] [--players 4]` (`--by-deck`: the decks swap places, the AIs stay; "A" is the first precon, Edgar Markov; `--deck cmd-<id>`: that precon against each of the others). A Commander game that exceeds 150 turns is counted as unfinished (`playGame` and `maxTurns`): a game may never end under the rules (each player controls a Darksteel Angel, which Dack Fayden hands out to the opponents), and the Medium level slows down when the board exceeds 150 permanents. The arena runs on all cores minus two by default (`--jobs`); see "Measurements (tournament)".
- **Precon balance (2026-10-06, Medium AI on both sides):** in a duel, Edgar Markov wins 59.3% ± 3.9 against Y'shtola (600 games, 21 turns on average); at four (Edgar, Y'shtola, Edgar, Y'shtola), Edgar's seats win 33.3% ± 5.3 (300 games, 40 turns): Y'shtola's drains hit every opponent. Outside the 45 to 55% target in both cases, in opposite directions; the lists are not touched (the user decides). The Ur-Dragon (third precon, `--deck cmd-ur-dragon`, against the other two): 54.9% ± 4.0 in a duel (600 games, 17 turns), 41.2% ± 5.7 at four (300 games, 37 turns). Rakdos, Lord of Riots (fourth precon, against the other three): 33.2% ± 3.8 in a duel (600 games), 26.6% ± 5.0 at four (300 games): clearly weak, to be studied in the AI.

## Combat by simulation (`combat.ts`, Expert level)

- **Attacks.** Sets of attackers are tried:
  - first the choice of the rules;
  - then all subsets up to 4 optional attackers, or, beyond that, prefixes sorted by evasion and by power.
  
  Each is played on a copy: the opponent blocks like the Medium AI, then the position after combat is evaluated, counterattack included.
- **Blocks.** Starting from the greedy blocks, then trying:
  - double blocks on the same attacker;
  - removing or swapping a blocker.

## ISMCTS (`ismcts.ts`, Expert level, duel)

- **When.** Priority decisions that have at least two sensible options: main phases, responses, combat windows.
- **Root.** Pass, plus the 5 best options of the one-step evaluation (`priorityOptions` of `heuristic.ts`). The initial bias favors the options the evaluation prefers.
- **Determinization, at each iteration** (P3, lot R8 of PLAN-R):
  - each hidden card of the opponent (hand and library) is replaced by a draw: a basic land of its seen colors (4 times out of 10), otherwise one of its seen cards (battlefield, graveyard, exile, spells on the stack);
  - its own library is shuffled (sorted first by definition), and the engine's randomness is removed.

  The AI therefore benefits neither from the opposing hand nor from the list of its deck: only from what has been shown. Before R8, it drew the hand from the opponent's real remaining cards.
- **Selection**: UCB1.
- **Simulation**: the fast policy (`policy.ts`), for both players, until the start of the AI's next turn:
  - a land, then the most expensive spell, with simple targets depending on whether the effect harms or helps;
  - attacks by rules, naive blocks.
- **Reward**: win 1, loss 0; otherwise a sigmoid of the evaluation difference with the starting position.
- **Final choice**: the most visited option.
- **Tree limited to the root.** With a few dozen to a few hundred iterations, deeper nodes would be visited too little.
- **Budget.**
  - In the browser: 0.7 s of thinking (`AI_BUDGET`, `client/src/scenario.ts`). About 2 to 3 ms per iteration on the dev machine; if fewer than 24 iterations fit in that time (slow machine), the heuristic decision is kept.
  - In tests and in the tournament: a budget in iterations, for reproducible results.
- **Multiplayer.** No ISMCTS (too costly to stay fluid): Expert keeps the evaluation with counterattack and the combat by simulation.

## Latency

- The display pause between two AI actions (`aiDelay`, 0.9 s, `engine/src/host.ts`) absorbs the thinking. The AI prepares its next action during the pause of the previous one (`settle`).
- An Expert AI therefore does not seem slower, even on a slow machine: it simply does fewer iterations there.
- `tools/ai-smoke.ts` checks this in the browser, with the normal processor then slowed down 4 times.

## Measurements (tournament)

`npm run arena -- --a expert --b medium --games 600 [--jobs 10] [--budget 100] [--pool decks|all|mix]`

- `--jobs`: parallel processes, by default the number of cores minus two (`--jobs 1`: everything in the same process). Each process asks for the next game as soon as it finishes its own: a long four-player Commander game (up to 150 turns, decisions of several seconds) no longer leaves the other cores idle (before 2026-10-07, each process had its fixed slice of games, and `--jobs` was 1 by default). A game depends only on its number and the seed: the result is identical whatever `--jobs`.
- Progress on the error output every 10 s: games played, elapsed time, estimated remaining time, A's rate.
- The report cites the five slowest decisions (duration, game, seed, decision rank, turn, player, level, wait, board size) and the command that replays each of these games alone (`--first N --games 1 --jobs 1`); `MTGX_SLOW_MS=N` in front of that command details every decision longer than N ms. Decision times measured in parallel are higher than with `--jobs 1` (shared cores): profile a game alone.

- Games go in pairs: same seed, places and decks swapped. An AI's rate against a copy of itself is therefore exactly 50%.
- Syntax `expert:200` for a budget specific to one AI; `expert:0` for Expert without ISMCTS.

Results, on precon decks and random two-color decks (`--pool mix`), ISMCTS at 100 iterations:

| Pair | Games | First's win rate |
|---|---|---|
| Medium (evaluation v2) against the original AI | 1,000 | 55.5% ± 3.1 |
| Medium against Beginner | 1,000 | 65.6% ± 2.9 |
| Expert against Medium | 600 | 60.8% ± 3.9 |
| Expert against Beginner | 600 | 73.2% ± 3.5 |
| Expert against Expert without ISMCTS | 300 | 56.7% ± 5.6 |

On the Standard meta decks (`--pool meta`, ISMCTS at 100 iterations), on 2026-09-30:

| Pair | Games | Before P3 | After P3 |
|---|---|---|---|
| Expert against Medium | 600 | 66.8% ± 3.8 | 65.0% ± 3.8 |

**Reference of 2026-10-03** (after PLAN-C C17, ISMCTS at 100 iterations, all of Standard playable):

| Pair | Pool | Games | First's win rate |
|---|---|---|---|
| Expert against Medium | whole pool (random two-color decks) | 600 | 62.2% ± 3.9 |
| Expert against Medium | Standard meta | 600 | 66.2% ± 3.8 |

Expert decision time during these tournaments (loaded machine): 78 to 96 ms on average, 570 to 740 ms at the 95th percentile; the maximum (10 to 20 s) comes from decisions on large boards, bounded in the interface by the time budget. The first run of this tournament found an internal engine error (mana of a Treasure with a doubler), fixed before the measurement (`RULES_VERSION` 71).

P3 (determinization by the seen cards, "you may" choices and small choices tried by simulation, mulligan by colors) affects both levels; the difference is not significant. The Expert AI keeps its lead without knowing the opposing deck list.

Expert decision time at 100 iterations: about 30 ms on average (most decisions are trivial), 300 ms at the 95th percentile; in the interface, the time budget bounds the thinking.

The "original AI" is the heuristic AI from before the levels: a frozen copy was used for the measurement, then removed.

Changes of lot C17 (choices, mulligan, attacks in multiplayer), measured on paired seeds against the previous behavior (temporary toggle, removed afterwards), on 2026-10-03:

| Measurement | Games | New one's win rate |
|---|---|---|
| Medium, whole pool | 600 | 50.2% ± 4.0 |
| Medium, meta | 800 | 50.2% ± 3.5 |
| Medium, four players (seats A, B, A, B) | 400 | 49.8% ± 4.9 |
| Basic land colors at mulligan, whole pool | 800 | 50.2% ± 3.5 |
| Same, meta | 800 | 51.2% ± 3.5 |

No significant difference, and no regression: these choices are rare in a game (over 80 meta games, the answer changes only 2 times at the mulligan, 4 times for trigger order, 10 times for multiple targets, never for the distribution of combat damage). They are kept for their correctness.

`npm run arena -- … --players 4` plays four-player games (seats A, B, A, B, shifted from one game to the next, random decks).

PLAN-L L1 (2026-10-09):

| Change | Games | A wins |
|---|---|---|
| `medium-fair` (decides on `forAgent`) vs `medium`, mix | 600 | 50.5% ± 4.0 |
| Same, Commander precons, four players | 200 | 46.2% ± 6.9 |
| Holding a counterspell vs without, meta | 600 | 50.3% ± 4.0 |
| Attackers weighed against the player they attack (multiplayer) vs before, four players | 1,198 | 47.8% ± 2.8, discarded |

Attempts without measurable gain, discarded:
- ISMCTS settings (exploration, reward scale, 4 or 8 options, a one-turn-longer horizon);
- ISMCTS on attacks (53%): the simulations' opponent blocks naively, which makes the attacks too aggressive.

## Pitfalls

- **Multiplayer, large boards:** a Medium-level priority decision took 1.5 to 4 s when the battlefield had 50 to 90 permanents (long four-player games, measured in the tournament on 2026-10-03). On 2026-10-09 the bench's Commander line (four precons, 12 games) measured 5.7 ms on average on boards of 50 to 62 permanents, 308 ms at worst. The Medium level still has no time budget. Bound set on 2026-10-06 for choices (The Ur-Dragon deck, trigger loops): with more than 12 objects on the stack or more than 150 permanents, choices are no longer simulated (engine suggestion, order by value); a trigger target used to take up to 242 s with 92 objects on the stack.

- **Hidden information.** The AI code must never read the opposing hand, the list of its deck or the order of the libraries. It goes through `determinize` (ISMCTS), which draws only from what has been seen. One-step simulations (`rollout`, `simulate`) do draw, and resolve searches and reveals, on the state they are given: in the interface and on the server, the levels therefore decide on `forAgent(s, seat)` (option `fair`, PLAN-L L1), a determinization that keeps the cards the seat may look at (`mayLookAt`: its top card under Vizier of the Menagerie, opposing face-down creatures under Found Footage) and those its pending question shows. Without it, Medium cast Harmonize only when its top cards were Dragons. Tests, fuzz and tournament use the real state unless the level is suffixed `-fair` (`--a medium-fair`). `ai/test/ismcts.test.ts` checks both.
- **`applyMutable` is not transactional.** An illegal decision leaves the state half-modified. In a simulation, go through `step` (`evaluate.ts`): "pass" is applied in place, the rest by `submit`, which works on a copy.
- **`GameHost.run` and waits.** During an `await` of the loop (display pause), a human decision can be applied by `submitHuman`, whose `run()` returns control immediately (the loop is already running). After each wait, the loop must therefore restart from the current state, and never wait without reason: otherwise the AI stays blocked. `engine/test/host.test.ts` checks this.
- **Budget.** In time in the interface (same latency on all machines), in iterations in tests, the tournament, the fuzz and the bench (reproducible).
- **Fuzz.** `npm run fuzz -- --ai levels` mixes the three levels, with a small-budget ISMCTS, and is part of `verify`.
