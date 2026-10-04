/**
 * Source Material (PZA) : rééditions sorties avec Teenage Mutant Ninja Turtles.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const PZA_SCRIPTS: Record<string, CardScript> = { ...CARDS };
