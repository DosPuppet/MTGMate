/**
 * Mystical Archive (SOA) : rééditions sorties avec Secrets of Strixhaven.
 * Hors Standard, jouables en « Sans limite » (PLAN-G) ; scripts ajoutés lot par lot.
 */
import type { CardScript } from "@mtgx/engine";
import { CARDS } from "./cards";

export const SOA_SCRIPTS: Record<string, CardScript> = { ...CARDS };
