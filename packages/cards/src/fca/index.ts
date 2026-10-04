/**
 * Through the Ages (FCA) : rééditions sorties avec Final Fantasy.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const FCA_SCRIPTS: Record<string, CardScript> = { ...CARDS };
