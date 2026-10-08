# PLAN-I — Bilingual application, English code and documentation

## Context

The application and the code base are written in French: interface, game log, engine prompts, card ability labels, `RulesError` messages, code comments, test names and every document. That is right for the players but an obstacle to open-sourcing the project.

Goals (user request, 08/10/2026):
1. **The application is bilingual, English or French, French by default.** One language setting drives the interface *and* the cards (name, text and image from Scryfall).
2. **All code and documentation are in English:** identifiers (already English), string literals in source, comments, test names, documents, file names.
3. **The French experience does not change:** with the language set to French, every text shown is the same as today, word for word.

Size at the start (08/10/2026, rough counts of lines with French text):

| Area | Lines of code | French comments | French string literals |
|---|---|---|---|
| `engine/src` | 32 800 | ~5 200 | ~310 (prompts, labels, `RulesError`, counter names) |
| `cards/src` | 74 500 | ~2 200 | ~5 400 (≈3 800 `label`, ≈110 `prompt`, mode names) |
| `client/src` | 12 500 | ~750 | ~330 with accents, many more without; log (`i18n.ts`), tutorial (`lessons.ts`, 814 lines) |
| `ai`, `server`, `tools` | 10 000 | ~960 | ~260 |
| tests (all packages) | 113 000 | ~3 050 | ~6 700 (mostly test names) |
| `docs/`, `README.md`, `CLAUDE.md` | — | — | 77 files, 1.07 MB |

What already exists:
- `planecircle.lang` (`"fr"` by default) in the client store, with toggles in the sidebar and the deck builder; it chooses the **card** language only (`faceName`, `faceText`, `faceImage`, `nameLabel`). Requirement 1 for cards is therefore already met; the interface must now follow the same setting.
- The game log is formatted on the client from engine events (`client/src/i18n.ts`): no engine change needed for it.
- Card references in engine text (`⟦defId⟧`, `engine/src/choices.ts` `cardRef`) are already replaced on the client by the card name in the chosen language (`localizeText`). The design below extends this mechanism.
- Golden games and saved rooms store decisions only, never labels: changing a label changes neither the rules nor `RULES_VERSION`.

## Design

### Source language and catalogs

- **English is the source language everywhere.** Every user-facing literal in the source is English. French lives in catalogs only, keyed by the English text (gettext style: the message id *is* the English text, so the code stays readable and an English player needs no catalog).
- Catalogs (JSON, sorted keys, `{ "<English>": "<French>" }`):
  - `packages/engine/locales/fr.json`: engine prompts, labels, errors, counter names;
  - `packages/cards/locales/fr/<set>.json`: card labels and prompts, one file per set (no merge conflicts between lots, smaller diffs);
  - `packages/client/locales/fr.json`: interface, log, tutorial;
  - `packages/server/locales/fr.json` if the server keeps texts of its own (see I4).
- When an English text has two French translations depending on context, the id takes a context prefix: `"ctx:graveyard|Exile"` (the prefix is removed on display). Used sparingly.
- **The French catalog is written from today's French strings**, during the same pass that rewrites each literal in English: no French text is lost, and the French interface stays identical.

### Text built by the engine

The engine and the server do not know the reader's language (an online game can mix a French and an English player), so they send language-neutral text that each client translates.

- Static text (most card labels): plain English literal, translated by lookup.
- Text with values: `msg("Exile {n} card(s) from your graveyard", { n })` (new `engine/src/text.ts`). It returns a string that carries the template and its arguments with markers, as `cardRef` already does (`⟦defId⟧`). The fields stay `string`: no type, view or protocol change.
- Client side, `localizeText` (`client/src/i18n.ts`) decodes: template lookup in the catalog, arguments localized in turn (card references → card name in the chosen language, translatable words → catalog), then substitution. English display uses the same decoder with no catalog.
- Outside the interface (tools, server logs, test messages), `plainText(text)` gives the English text without markers.
- Engine code that compares displayed text (example: `labels[o]?.startsWith("Déverrouiller")` in `ops/counters.ts`) is rewritten on keys or structured data, not on text.

### Client interface

- `t("Keep hand")`, `t("{n} cards in library", { n })` (`client/src/i18n.ts`), reading the store's `lang`; a hook for components (`useT()`), so the interface re-renders when the language changes.
- Plurals: chosen in code (`n === 1 ? … : …`), as today; no plural engine.
- French keeps the **vouvoiement** (catalog side); English uses "you" naturally.
- One language setting: the existing `planecircle.lang` drives the interface and the cards; the toggles of the sidebar and the deck builder stay (same setting) and a toggle is added on the home screen and in the online lobby. `<html lang>` follows it. Default `fr`; no detection of the browser language (requirement: French by default).
- Precon decks (`packages/cards/decks/*.json`): `name` and `description` in English, French in a `fr` field, as for cards.
- Bundle: the French catalogs go into the card data chunk (`cartes-*.js`, renamed in I6) or a chunk of their own loaded at start-up when the language is French; budgets of `tools/bundle-size.ts` adjusted in I0.

### Guards (tests)

- **`cards/test/locales.test.ts` (catalog completeness):** collects every message id (card definitions walked at run time for `label`, `prompt`, `title`, mode and option names; source scanned for `msg("…")` and `t("…")` literals) and fails on a missing French entry or a stale one. Same model as `debt.test.ts`.
- **`cards/test/english-source.test.ts` (no French in the code):** flags French in string literals and comments of the source (accented letters, frequent French words) outside the catalogs and the data that is French on purpose (Scryfall `fr` fields, `french-overrides.json`, `nameFr`). It starts with a baseline of files still in French, which must only shrink (like `ceilings`), and ends empty in I7.
- **French interface unchanged:** the interface tests (`ui-smoke`, `tutorial-smoke`, `online-smoke`…) click and read French texts; they run in French and must pass without edits to their French strings. That is the regression check of the whole plan.
- **English interface:** `tools/lang-smoke.ts` (I7) plays a game in each language and checks every text shown (see I7).

## Principles

1. **No rules change.** No lot touches the rules: goldens replay identically, `RULES_VERSION` does not move, and the fuzz fingerprint at equal seed is identical before and after each lot (`npm run fuzz -- --games 300 --pool all --seed N`; if the fingerprint includes texts, I0 makes it text-neutral first).
2. **One pass per file:** a file is translated once, strings and comments together, so each file is reviewed once. A lot that only touches a file in passing (I0 wiring the language toggle into `Sidebar.tsx`) leaves its translation to the lot that owns it.
3. **Tests that read a text** (`expect(prompt).toBe("…")`) are updated in the lot that changes that text, not in I5.
4. **Faithful translation, not rewriting:** comments keep their content and length; MTG terms follow the official English Oracle wording (`target`, `exile`, `mana value`, `ward`…); French catalog entries are today's strings, unchanged.
5. **Mechanical lots go through subagents**, one set or one group of files each, in parallel; every lot ends with `npm run verify` and a review of a sample of the diff.

## Lots

### I0 — Infrastructure (M)

- `engine/src/text.ts`: `msg`, the markers, `plainText`; `cardRef` documented as one argument kind.
- Client: `t`, `useT`, the decoder in `localizeText`, catalog loading, language toggle on the home screen and in the lobby, `<html lang>`.
- Catalogs in place; `locales.test.ts` and `english-source.test.ts` (baseline = every file today).
- Fuzz fingerprint made text-neutral if needed.
- A one-off Playwright script: language switch, captures in `test-results/`.
- `CLAUDE.md`: new "Language" convention (written in English, the rest of the file stays French until I6).

### I1 — Client (M/L)

`client/src`: interface (`*.tsx`), game log (`i18n.ts`: the tables `STEP_LABEL`, `PHASE_BAR`, `KEYWORD_LABEL`… become English sources with French entries), tutorial (`lessons.ts`, `Coach.tsx`, `TutorialMenu.tsx`), `names.ts`, `storageRename.ts`, the client tests; precon deck names and descriptions. Comments in the same pass.

### I2 — Engine (M/L)

`engine/src`: prompts, choice labels, keyword and counter names (`counterLabels.ts`, `dsl.ts`), `RulesError` messages (179 calls), `view.ts` texts (costs, "Emblem"), host messages (`host.ts`); logic that compared French texts moves to keys. Comments in the same pass (~5 200 lines). Engine tests that read a changed text are updated.

### I3 — Card scripts (L, by set, in parallel)

- **I3a:** generic helpers first (`fdn/common.ts`, `dsl.ts` facade, `target.*` default labels such as "créature adverse"): they build labels from parts and become `msg` templates.
- **I3b:** one subagent per set (19 Standard sets, the G sets, `edh`, `meta`), each producing the English script and `locales/fr/<set>.json`. Comments in the same pass. `audit-baseline.json` and `debt-baseline.json` reasons in English.
- Order by size: the small sets first, to settle the wording on a sample before the large ones.

### I4 — AI, server, tools (S/M)

- `server/src`: room and connection errors sent to the client become English `msg` texts (translated by the client like the engine's); `PROTOCOL_VERSION` moves only if a message shape changes.
- `ai/src`, `tools/*.ts`: console output in English only (no catalog: these are developer tools). Comments in the same pass.

### I5 — Tests (L, mechanical, in parallel)

Test names (`describe`/`it`), comments and helper messages of every package's tests (`engine/test` alone has 106 000 lines). No assertion changes except texts already handled in I1 to I3. Test file names in English where they are French (`ai/test/golden/4c-vs-izzet.json` → `4c-vs-izzet.json`…).

### I6 — Documentation and file names (L)

- `README.md` and `CLAUDE.md` in English (the README keeps a list of banned cards in the format `legality.test.ts` reads).
- `docs/`: `moteur.md` → `engine.md`, `approximations.md`, `ia.md` → `ai.md`, `deploiement.md` → `deployment.md`, `tutoriel.md` → `tutorial.md`, `historique.md` → `history.md`, `extensions/*.md` (`socle.md` → `core.md`, `reeditions.md` → `reprints.md`), plans, audits, `commander/decks/*.txt` comments, `meta/`. Every link and every path cited in code or tests updated.
- French identifiers of data: precon deck ids (`bienvenue-noir` → `welcome-black`…) with an alias table so saved games, saved decks and replays still load.
- Archived documents condensed into the living ones, then deleted (see "User decisions").

### I7 — Closing (S)

`english-source.test.ts` baseline empty; English runs of `ui-smoke` and `tutorial-smoke`; `npm run verify -- --full`; `CLAUDE.md` conventions final ("documents in English; interface bilingual, French by default, vouvoiement in French"); bilan at the end of this document.

## Order and parallelism

I0 first, alone. Then I1, I2 and I3 can run in parallel (they touch different packages; I3a before I3b). I4 after I2 (it uses the server-side `msg`). I5 and I6 last, in parallel with each other: comments, test names and documents cite paths and names that I1 to I4 can change.

## Checks per lot

- `npm run verify -- --set <EXT>` (I3, by set) or `npm run verify` (other lots); `--ui` for I0, I1, I4 and I7.
- Goldens identical; fuzz fingerprint identical at equal seed.
- `locales.test.ts` green (no missing French entry), `english-source.test.ts` baseline down by the files of the lot.
- A sample of the diff read by hand (strings: meaning kept, MTG wording; comments: content kept).

## Glossary (French → English)

Official English Oracle and rules wording; every translation pass (subagents included) uses it.

| French | English | French | English |
|---|---|---|---|
| bibliothèque | library | cimetière | graveyard |
| exil, exiler | exile | main | hand |
| champ de bataille | battlefield | pile | stack |
| piocher, pioche | draw, draw step | défausser | discard |
| meuler | mill | regard N | scry N |
| surveillance N | surveil N | contrecarrer, contresort | counter, counterspell |
| sort, éphémère, rituel | spell, instant, sorcery | capacité (activée, déclenchée, statique) | ability (activated, triggered, static) |
| blessures | damage | points de vie (PV) | life |
| marqueur | counter | jeton | token |
| engager, dégager | tap, untap | valeur de mana (VM) | mana value |
| force, endurance (F/E) | power, toughness | coût, coût supplémentaire | cost, additional cost |
| vol, portée | flying, reach | initiative, double initiative | first strike, double strike |
| célérité | haste | vigilance | vigilance |
| piétinement | trample | contact mortel | deathtouch |
| lien de vie | lifelink | défense talismanique | hexproof |
| menace | menace | indestructible | indestructible |
| défenseur | defender | flash | flash |
| gardien (mot-clé) | ward | protection contre | protection from |
| entretien | upkeep | étape de fin, nettoyage | end step, cleanup |
| phase principale | main phase | début du combat, fin du combat | beginning of combat, end of combat |
| attaquant, bloqueur | attacker, blocker | adversaire | opponent |
| propriétaire, contrôleur | owner, controller | cible, ciblé | target, targeted |
| sacrifier | sacrifice | détruire | destroy |
| renvoyer en main | return to hand | mélanger | shuffle |
| arriver (sur le champ de bataille) | enter (the battlefield) | mourir | die |
| emblème | emblem | Bienvenue (decks) | Welcome |
| Sans limite (format) | Unlimited | préconstruit | precon (precon deck) |
| la partie, la manche, le match | the game, the game (of a match), the match | mulligan, garder | mulligan, keep |

Keyword actions and mechanics take the English name printed on the cards (Scryfall `keywords`).

## User decisions (08/10/2026)

- **Archived documents are condensed, then deleted** (`PLAN-R.md`, `PLAN-P4.md`, the done plans `PLAN-A` to `PLAN-H`, audits of 29/09 and 30/09, `historique.md`; about 450 KB of the 1.07 MB): what is still useful (the "deferred until a card needs it" list of PLAN-R, the bilans and reports of each plan, a short history) moves into English living documents (`history.md`, `engine.md`, `approximations.md`); the rest leaves the tree. Git history keeps the French originals.

## Critical files

`engine/src/choices.ts` (`cardRef`), new `engine/src/text.ts`, `client/src/i18n.ts`, `client/src/localize.ts`, `client/src/names.ts`, `client/src/store.ts` (`lang`), `cards/src/fdn/common.ts`, `engine/src/dsl.ts`, `engine/src/counterLabels.ts`, `tools/bundle-size.ts`, `packages/cards/test/debt.test.ts` (model for the new guards).

## Tracking

### I0 — Infrastructure (done 2026-10-08)

- `engine/src/text.ts`: `msg` (values as `⟨name|value⟩` markers, nested markers allowed), `parseText`, `renderText`, `plainText`; 7 tests (`engine/test/text.test.ts`).
- Client: `translate.ts` (merged French catalogs, `localize`, `t`, `tr`, `setTextLang`, `<html lang>`), `useT()` in `localize.ts`, `localizeText` on the shared decoder; `LangToggle` on the home screen and in the online lobby, replacing the sidebar and deck builder toggles (same `planecircle.lang` setting).
- Catalogs: `engine/locales/fr.json`, `cards/locales/fr/core.json` (listed in `cards/src/locales.ts`, export `@mtgx/cards/locales`), `client/locales/fr.json`; `tools/locales.ts` sorts them; chunk `locales-*.js` (budget 700 KB).
- Guards: `cards/test/locales.test.ts` (7 tests: listed files, sorted keys and placeholders, conflicts, literal-only calls, missing ids from the source and from translated sets, stale entries) and `cards/test/english-source.test.ts` (3 tests; detector `cards/test/frenchSource.ts`, CLI `tools/french-source.ts`, baseline `cards/data/french-baseline.json`: 649 files, 3 allowed). Both checked by mutation (untranslated `t()`, non-literal call, stale entry, French comment, French labels of a set given a catalog).
- Pilots: Riot prompt and options (engine, `replacement.ts`), format choice on the home screen (`FormatChoice.tsx`, translated whole); `vite.config.ts` and `tools/bundle-size.ts` translated whole, chunks renamed `cartes` → `cards`, `bibliotheques` → `vendor` (third-party code from `node_modules`).
- `CLAUDE.md`: "Language" convention in English.
- Checks: `npm run verify -- --set WOT --ui` green in 363 s (French interface tests unchanged); fuzz fingerprint identical before and after (`--games 300 --pool all --seed 7`: `f07b0933`, 273 685 decisions); one-off Playwright check of the toggle (FR → EN → reload → FR, `<html lang>`, no page error; captures in `test-results/plan-i/`).

### I1, I2, I3, I4 — Code in English, bilingual interface (done 2026-10-08)

Done by parallel agents on disjoint files (engine in 8 groups, client in 4, cards core, server and AI, tools; then card scripts in 14 groups of sets), each writing the French originals into catalog fragments merged with `npx tsx tools/locales.ts --merge`.

- **Catalogs:** engine 552 entries, client 907, server 33, cards core 89 and one catalog per set (8,806 entries in all at the end of the plan); no conflicting id at merge. Ids that the same English could not keep apart use a more precise English or a `ctx:` prefix (`ctx:zone|Exile`, `ctx:card|Commander`, `ctx:gains|Haste`…).
- **Engine:** every prompt, label and `RulesError` goes through `msg`; code that compared displayed text now reads data (`ab.equip` for Equip, locked doors for Rooms, `FACE_DOWN_WARD`, `PROWESS_LABEL`); `altCostMode` takes `"Overload" | "Cleave"`; `RULES_VERSION` unchanged.
- **Client:** interface through `useT()`; engine and server texts through `useLocalize()`/`textIn`; game log as English templates (French output checked word for word against the old log on about 200 events); tutorial lessons as `msg` data; deck names from `DeckList.fr`; local AI and player names localized ("You", "AI n"), online AI seats named by the server with `msg("AI {n} ({level})")` and localized by the client (`withPlayerNames`).
- **Cards:** labels deduced by `scryfall.ts` (Equip, Crew, cycling, alternative costs…) and every set script in English; precon decks with English names and `fr`; validation messages as `msg`; welcome decks renamed `welcome-{white,blue,black,red,green}` (saved games store card lists, not deck ids: no alias needed); golden games renamed (`4c-vs-izzet`, `four-players-a`…).
- **Server, AI, tools:** server errors as `msg` (catalog `server/locales/fr.json`); tool output in English (`verify.ts` regexes follow); Playwright smoke tools keep the French labels they click (`allowed`).
- **Guards:** the debt measure "single-card values" no longer counts player-facing texts (`label`, `prompt`, `text`, `labels`): ceiling 105 → 104. Detector: `fr`/`nameFr`/`frText` data and `// i18n-ignore` lines are skipped.
- **Values of templates** are translated recursively: a name that equals a catalog id would be translated. Measured: 15 English card or token names are catalog ids (basic lands, Cancel, Food, Treasure…); every such card has a French name, which is what French mode shows, and the tokens show their French type. Kept as is.
- **Checks:** whole test suite green (155 files, 13,996 tests); `tsc` and Biome clean; fuzz fingerprint identical to the one before PLAN-I (`--games 300 --pool all --seed 7`: `f07b0933`, 273,685 decisions); golden games identical.
- **French display changes (improvements):** a few prompts now show the French card name where they showed the English one (Agency Outfitter, partner prompts, Room doors); Uldaros Theorix target labels show the French card type.

### I5 — Tests in English (done 2026-10-08)

Eleven agents, balanced by French lines (about 900 each): test titles, comments, helper messages and French test data (made-up card names, labels, player names) in English across 156 files; French kept only where a test checks the French interface (`i18n.test.ts` log expectations, `zoneTabs`, French search input), marked `// i18n-ignore`. Same test counts before and after each group. Also: tutorial lesson ids in English (`screen`, `attack`, `block`, `spells`, `stack`, `abilities`, `game`; saved progress migrated), references to renamed documents in code and tests, a BLB lookup still looking for a French label (the test was passing through the default mode) fixed. The detector gained every French accent and words that are French on their own (`vous`, `avec`, `chaque`…), which found a few last lines.

### I6 — Documentation (done 2026-10-08)

Nine agents (Sonnet): README, CLAUDE.md, every living document translated and renamed; archives condensed into `docs/history.md` (89 KB) and `docs/backlog.md` (18 KB), then removed. Review: mechanic names checked against the Scryfall keywords of the card data (Power-up, not "level up"; split second, not "shared second"; hexproof from a color for Mondo Gecko). Three documents keep French interface strings with an English gloss (`allowed`).

### I7 — Closing (done 2026-10-08)

- `tools/lang-smoke.ts`, in `verify`'s interface tests: home, deck builder, online lobby, tutorial menu and a game against the AI, in French then English; fails on a raw marker, French in English, or an English id shown untranslated in French. First run: both games played to the end, no problem found.
- Last French identifiers: board themes (`night`, `felt`, `wood`, `slate`, `leather`, `random`; saved choices migrated), drawn local match (`"draw"`, old `"nul"` still read as a draw).
- `CLAUDE.md`: "Language" convention final; `lang-smoke` in the checks.
- `npm run verify -- --full`: first run, `mobile-smoke` and `proxy-smoke` timed out because `lang-smoke` (two browser games, about 5 min) ran in one of the two parallel queues; it now runs alone after them, with a 150-action game. Second run: everything green except the bundle budget of the catalogs (712 KB > 700 KB, raised to 900 KB) and three browser tests that failed on a network change of the machine (`ERR_NETWORK_CHANGED`) and passed when rerun alone (`deck-smoke`, `tutorial-smoke`, `ai-smoke`). Whole test suite green (155 files, 13,996 tests), `tsc` and Biome clean.
- `packages/cards/data/french-baseline.json`: `files` empty; `allowed`: 13 files (3 documents and PLAN-I quoting French interface strings, the detector itself, 7 Playwright smoke tools that click French labels, the engine text test with French catalog data).

## Summary (2026-10-08)

- **Result:** the code, the tests and the documents are in English; the interface is bilingual (French by default) with one setting for the interface and the cards; the French interface is unchanged (checked by the French Playwright tests, the French log compared word for word, and `lang-smoke`), apart from a few improvements listed in the I1–I4 tracking.
- **Volume:** 8,806 French catalog entries (engine 552, client 907, server 33, cards 7,314 with core); 730 files changed; 1.07 MB of documents translated or condensed.
- **Rules:** no rules change; `RULES_VERSION` unchanged; golden games identical; fuzz fingerprint identical to the one before the plan (`f07b0933`, 273,685 decisions at seed 7).
- **Guards left in place:** `locales.test.ts` (every message id has its French, no stale or conflicting entry, literal-only calls), `english-source.test.ts` (no French outside `allowed`), `lang-smoke` (display in both languages).
- **Known limits:**
  - Card rules text comes from Scryfall: basic lands and tokens have no French text there, so their text stays English in the French interface (as before).
  - Values of templates are translated recursively: an English name equal to a catalog id would be translated (measured: 15 card or token names, all harmless, see I1–I4).
  - Some English ids differ only slightly where the French had two wordings for one idea ("Draw, then discard one card" / "Draw, then discard a card"): the English stays correct, the French unchanged; they can be unified later together with their French.
