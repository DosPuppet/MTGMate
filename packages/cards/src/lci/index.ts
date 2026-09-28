/**
 * The Lost Caverns of Ixalan (LCI) : Découverte, Descente, Fabrication, Cavernes, explorer, jetons Carte.
 * Les aides et jetons communs viennent de Bloomburrow et des extensions précédentes (lci/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { CRAFT } from "./craft";
import { GREEN } from "./green";
import { LEGENDS } from "./legends";
import { MULTI } from "./multi";
import { RED } from "./red";
import { WHITE } from "./white";

export const LCI_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...CRAFT,
  ...LEGENDS,
};
