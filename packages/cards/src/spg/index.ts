/**
 * Special Guests (SPG) : rééditions sorties avec les extensions de l'appli.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const SPG_SCRIPTS: Record<string, CardScript> = { ...CARDS };
