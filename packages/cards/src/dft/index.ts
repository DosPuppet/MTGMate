/**
 * Comportement des cartes d'Aetherdrift (DFT), par couleur. Les aides du DSL sont partagées (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RED } from "./red";
import { SPEED } from "./speed";
import { WHITE } from "./white";

export const DFT_SCRIPTS: Record<string, CardScript> = { ...WHITE, ...BLUE, ...BLACK, ...RED, ...GREEN, ...MULTI, ...SPEED };
