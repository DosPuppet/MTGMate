/**
 * Special Guests (SPG): reprints released with the sets of the app.
 * Outside Standard, playable in "Unlimited" (PLAN-G); scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const SPG_SCRIPTS: Record<string, CardScript> = { ...CARDS };
