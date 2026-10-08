/**
 * Enchanting Tales (WOT): enchantments reprinted with Wilds of Eldraine.
 * Outside Standard, playable in "Unlimited" (PLAN-G); scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const WOT_SCRIPTS: Record<string, CardScript> = { ...CARDS };
