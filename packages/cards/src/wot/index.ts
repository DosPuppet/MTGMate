/**
 * Enchanting Tales (WOT) : enchantements réédités avec Wilds of Eldraine.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const WOT_SCRIPTS: Record<string, CardScript> = { ...CARDS };
