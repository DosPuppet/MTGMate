/**
 * Commander (EDH) : pseudo-ensemble des cartes des decks Commander absentes des autres ensembles, importées par nom
 * (`npm run import-cards -- edh`, PLAN-E). Hors Standard ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";

export const EDH_SCRIPTS: Record<string, CardScript> = {};
