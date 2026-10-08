/**
 * Mystical Archive (SOA): reprints released with Secrets of Strixhaven.
 * Not Standard-legal, playable in "Unlimited" (PLAN-G); scripts added lot by lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const SOA_SCRIPTS: Record<string, CardScript> = { ...CARDS };
