/** Deck lists only (without the card data): usable by the interface without weighing down the bundle. */

import { CUSTOM_PRINTING, type Format } from "@mtgx/engine";
import cmdCounterBlitz from "../decks/cmd-counter-blitz.json";
import cmdDarkLeo from "../decks/cmd-dark-leo.json";
import cmdEdgarMarkov from "../decks/cmd-edgar-markov.json";
import cmdFantasticFour from "../decks/cmd-fantastic-four.json";
import cmdMultiverseReforged from "../decks/cmd-multiverse-reforged.json";
import cmdMutantMenace from "../decks/cmd-mutant-menace.json";
import cmdRakdos from "../decks/cmd-rakdos.json";
import cmdTurtlePower from "../decks/cmd-turtle-power.json";
import cmdUrDragon from "../decks/cmd-ur-dragon.json";
import cmdVision from "../decks/cmd-vision.json";
import cmdYshtola from "../decks/cmd-yshtola.json";
import finCloud from "../decks/fin-cloud.json";
import finSephiroth from "../decks/fin-sephiroth.json";
import meta4cControl from "../decks/meta-4c-control.json";
import metaDimirMidrange from "../decks/meta-dimir-midrange.json";
import metaIzzetSpellementals from "../decks/meta-izzet-spellementals.json";
import metaJundSacrifice from "../decks/meta-jund-sacrifice.json";
import metaMonoGreenLandfall from "../decks/meta-mono-green-landfall.json";
import welcomeBlack from "../decks/welcome-black.json";
import welcomeBlue from "../decks/welcome-blue.json";
import welcomeGreen from "../decks/welcome-green.json";
import welcomeRed from "../decks/welcome-red.json";
import welcomeWhite from "../decks/welcome-white.json";
import type { DeckEntries } from "./decklist";

/** A deck: cards by English name (canonical key), with their number of copies. */
export interface DeckList {
  id: string;
  /** Name and description in English; French in `fr` (PLAN-I), shown when the interface is in French. */
  name: string;
  description?: string;
  fr?: { name?: string; description?: string };
  colors: string[];
  cover?: string;
  /** Commander (PLAN-E): the commander (one line), apart from the deck. */
  commander?: DeckEntries;
  main: DeckEntries;
  sideboard?: DeckEntries;
  /** Format of the deck, when it is not Standard (a Commander deck is validated in Commander). */
  format?: Format;
  /** Precon deck (read-only) or created by the user. */
  builtin?: boolean;
  /**
   * Commander: bracket declared by the source of the list (Wizards announces its precons at bracket 2; an EDHREC or
   * Moxfield list, that of its author). The number of Game Changers (`validateDeck`) only gives a floor.
   */
  bracket?: 1 | 2 | 3 | 4 | 5;
  /**
   * Precon with custom art (`"custom"`): each line that chooses no printing takes the custom printing
   * (`CUSTOM_PRINTING`), whose image comes from the server's local folder, if there is one.
   */
  art?: "custom";
}

/**
 * Welcome decks (40 cards, Foundations), the Final Fantasy Starter Kit, the top five decks of the Standard metagame
 * (survey of 2026-09-29, `docs/meta/`), sideboard included, then the Commander decks (PLAN-E, `docs/commander/decks/`).
 */
export const DECKS: DeckList[] = [
  welcomeWhite,
  welcomeBlue,
  welcomeBlack,
  welcomeRed,
  welcomeGreen,
  finSephiroth,
  finCloud,
  metaIzzetSpellementals,
  metaMonoGreenLandfall,
  metaDimirMidrange,
  metaJundSacrifice,
  meta4cControl,
  cmdEdgarMarkov,
  cmdYshtola,
  cmdUrDragon,
  cmdRakdos,
  cmdMultiverseReforged,
  cmdTurtlePower,
  cmdCounterBlitz,
  cmdFantasticFour,
  cmdMutantMenace,
  cmdVision,
  cmdDarkLeo,
].map((d) => withArt({ ...(d as DeckList), builtin: true }));

function withArt(d: DeckList): DeckList {
  if (d.art !== "custom") return d;
  const custom = (entries: DeckEntries): DeckEntries =>
    entries.map((e) => (e[2] ? e : ([e[0], e[1], CUSTOM_PRINTING] as DeckEntries[number])));
  return { ...d, main: custom(d.main), ...(d.commander ? { commander: custom(d.commander) } : {}) };
}

const deckKey = (main: DeckEntries) => {
  const totals = new Map<string, number>();
  for (const [n, name] of main) totals.set(name, (totals.get(name) ?? 0) + n);
  return [...totals].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).join("|");
};
const PRECON_BY_KEY = new Map(DECKS.map((d) => [deckKey(d.main), d]));

/** Precon whose main deck is identical (whatever the order and splitting of the lines). */
export function preconFor(main: DeckEntries): DeckList | undefined {
  return PRECON_BY_KEY.get(deckKey(main));
}
