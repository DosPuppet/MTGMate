/**
 * Behavior of the Edge of Eternities (EOE) cards, by color. The DSL helpers are shared (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RARES } from "./rares";
import { RED } from "./red";
import { STATION } from "./station";
import { UNIQUE } from "./unique";
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
  ...UNIQUE,
};
