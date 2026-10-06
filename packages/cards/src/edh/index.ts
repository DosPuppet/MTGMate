/**
 * Commander (EDH) : pseudo-ensemble des cartes des decks Commander absentes des autres ensembles, importées par nom
 * (`npm run import-cards -- edh`, PLAN-E). Hors Standard ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { COMMANDER_CARDS } from "./commander";
import { EDH_LANDS } from "./lands";

export const EDH_SCRIPTS: Record<string, CardScript> = { ...COMMANDER_CARDS, ...EDH_LANDS };
