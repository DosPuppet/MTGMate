/**
 * Bloomburrow (BLB) : Progéniture, Cadeau, Fourrager, Dépense, Vaillance, Saisons (modes « patte »), Classes, Seuil.
 * Les aides et jetons communs viennent de Duskmourn, Final Fantasy et Foundations (blb/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RED } from "./red";
import { WHITE } from "./white";

export const BLB_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
};
