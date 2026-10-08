/**
 * Through the Ages (FCA): reprints released with Final Fantasy.
 * Not Standard-legal, playable in "Unlimited" (PLAN-G); scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const FCA_SCRIPTS: Record<string, CardScript> = { ...CARDS };
