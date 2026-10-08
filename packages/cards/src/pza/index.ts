/**
 * Source Material (PZA): reprints released with Teenage Mutant Ninja Turtles.
 * Not Standard-legal, playable in "Unlimited" (PLAN-G); scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const PZA_SCRIPTS: Record<string, CardScript> = { ...CARDS };
