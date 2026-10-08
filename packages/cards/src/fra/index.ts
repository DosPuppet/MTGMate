/**
 * Behavior of the Reality Fracture (FRA) cards, by color.
 * Same principle as Foundations: the characteristics come from Scryfall, only what can't be
 * deduced from the keywords is described here. The DSL helpers are shared (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { LANDS } from "./lands";
import { MULTI } from "./multi";
import { RED } from "./red";
import { UNIQUE } from "./unique";
import { WHITE } from "./white";

export const FRA_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...LANDS,
  ...UNIQUE,
};
