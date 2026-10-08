/**
 * The Lost Caverns of Ixalan (LCI): discover, descend, craft, Caves, explore, Map tokens.
 * The shared helpers and tokens come from Bloomburrow and the earlier sets (lci/common.ts).
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
