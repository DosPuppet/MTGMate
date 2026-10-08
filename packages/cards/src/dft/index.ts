/**
 * Behavior of the Aetherdrift (DFT) cards, by color. The DSL helpers are shared (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RED } from "./red";
import { SPEED } from "./speed";
import { UNIQUE } from "./unique";
import { WHITE } from "./white";

export const DFT_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...SPEED,
  ...UNIQUE,
};
