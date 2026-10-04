/**
 * Stellar Sights (EOS) : terrains réédités avec Edge of Eternities.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const EOS_SCRIPTS: Record<string, CardScript> = { ...CARDS };
