/**
 * Jurassic World Collection (REX) : cartes sorties avec The Lost Caverns of Ixalan.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const REX_SCRIPTS: Record<string, CardScript> = { ...CARDS };
