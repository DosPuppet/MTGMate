/**
 * French catalogs of the cards package (PLAN-I): `core` for the files at the root of `src/`, then one file per set
 * directory (`src/<set>/` → `locales/fr/<set>.json`). Every file of `locales/fr/` is listed here
 * (`cards/test/locales.test.ts` checks it).
 */
import core from "../locales/fr/core.json";

export const FRENCH_CATALOGS: Record<string, Record<string, string>> = { core };
