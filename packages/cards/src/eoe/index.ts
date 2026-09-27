/**
 * Comportement des cartes d'Edge of Eternities (EOE), par couleur. Les aides du DSL sont partagées (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RARES } from "./rares";
import { RED } from "./red";
import { STATION } from "./station";
import { WHITE } from "./white";

export const EOE_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...STATION,
  ...RARES,
};
