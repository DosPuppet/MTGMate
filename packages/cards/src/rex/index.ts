/**
 * Jurassic World Collection (REX): cards released with The Lost Caverns of Ixalan.
 * Not Standard-legal, playable in "Unlimited" (PLAN-G); scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const REX_SCRIPTS: Record<string, CardScript> = { ...CARDS };
