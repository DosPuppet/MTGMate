/**
 * Commander (EDH): pseudo-set of the cards of the Commander decks missing from the other sets, imported by name
 * (`npm run import-cards -- edh`, PLAN-E). Outside Standard; scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { COMMANDER_CARDS } from "./commander";
import { EDH_COUNTER_BLITZ } from "./counterblitz";
import { EDH_DARK_LEO } from "./darkleo";
import { EDH_EDGAR } from "./edgar";
import { EDH_FANTASTIC } from "./fantastic";
import { EDH_LANDS } from "./lands";
import { EDH_MARIO_LUIGI } from "./marioluigi";
import { EDH_MULTIVERSE } from "./multiverse";
import { EDH_MUTANT } from "./mutant";
import { EDH_NISSA } from "./nissa";
import { EDH_PARTNERS } from "./partners";
import { EDH_RAKDOS } from "./rakdos";
import { EDH_SEPHIROTH } from "./sephiroth";
import { EDH_STAPLES } from "./staples";
import { EDH_TEVESH_JESKA } from "./teveshjeska";
import { EDH_TURTLES } from "./turtles";
import { EDH_URDRAGON } from "./urdragon";
import { EDH_UR_SPHINX } from "./ursphinx";
import { EDH_VISION } from "./vision";
import { EDH_VISION_LANDS } from "./visionLands";
import { EDH_VIVI } from "./vivi";
import { EDH_YSHTOLA } from "./yshtola";

export const EDH_SCRIPTS: Record<string, CardScript> = {
  ...COMMANDER_CARDS,
  ...EDH_LANDS,
  ...EDH_STAPLES,
  ...EDH_EDGAR,
  ...EDH_YSHTOLA,
  ...EDH_URDRAGON,
  ...EDH_RAKDOS,
  ...EDH_MULTIVERSE,
  ...EDH_TURTLES,
  ...EDH_COUNTER_BLITZ,
  ...EDH_FANTASTIC,
  ...EDH_MUTANT,
  ...EDH_NISSA,
  ...EDH_VISION,
  ...EDH_VISION_LANDS,
  ...EDH_DARK_LEO,
  ...EDH_UR_SPHINX,
  ...EDH_VIVI,
  ...EDH_SEPHIROTH,
  ...EDH_MARIO_LUIGI,
  ...EDH_PARTNERS,
  ...EDH_TEVESH_JESKA,
};
