/**
 * Comportement des cartes d'Outlaws of Thunder Junction (OTJ). Les aides du DSL sont partagées (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RED } from "./red";
import { UNIQUE } from "./unique";
import { WHITE } from "./white";

export const OTJ_SCRIPTS: Record<string, CardScript> = { ...WHITE, ...BLUE, ...BLACK, ...RED, ...GREEN, ...MULTI, ...UNIQUE };
