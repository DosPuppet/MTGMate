/**
 * Commander (EDH) : pseudo-ensemble des cartes des decks Commander absentes des autres ensembles, importées par nom
 * (`npm run import-cards -- edh`, PLAN-E). Hors Standard ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { COMMANDER_CARDS } from "./commander";
import { EDH_EDGAR } from "./edgar";
import { EDH_LANDS } from "./lands";
import { EDH_STAPLES } from "./staples";
import { EDH_URDRAGON } from "./urdragon";
import { EDH_YSHTOLA } from "./yshtola";

export const EDH_SCRIPTS: Record<string, CardScript> = {
  ...COMMANDER_CARDS,
  ...EDH_LANDS,
  ...EDH_STAPLES,
  ...EDH_EDGAR,
  ...EDH_YSHTOLA,
  ...EDH_URDRAGON,
};
