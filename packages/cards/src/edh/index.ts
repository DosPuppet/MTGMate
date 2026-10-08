/**
 * Commander (EDH) : pseudo-ensemble des cartes des decks Commander absentes des autres ensembles, importées par nom
 * (`npm run import-cards -- edh`, PLAN-E). Hors Standard ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { COMMANDER_CARDS } from "./commander";
import { EDH_COUNTER_BLITZ } from "./counterblitz";
import { EDH_EDGAR } from "./edgar";
import { EDH_FANTASTIC } from "./fantastic";
import { EDH_LANDS } from "./lands";
import { EDH_MULTIVERSE } from "./multiverse";
import { EDH_MUTANT } from "./mutant";
import { EDH_NISSA } from "./nissa";
import { EDH_RAKDOS } from "./rakdos";
import { EDH_STAPLES } from "./staples";
import { EDH_TURTLES } from "./turtles";
import { EDH_URDRAGON } from "./urdragon";
import { EDH_VISION } from "./vision";
import { EDH_VISION_LANDS } from "./visionLands";
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
};
