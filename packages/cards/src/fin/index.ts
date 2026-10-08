/**
 * Final Fantasy (FIN): 305 cards (job select, tiered, Towns, Equipment, "Summon" Saga creatures).
 * Shared helpers and tokens come from Outlaws of Thunder Junction and Foundations (fin/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GEAR } from "./gear";
import { GREEN } from "./green";
import { LANDS } from "./lands";
import { LEGENDS } from "./legends";
import { LEGENDS2 } from "./legends2";
import { LEGENDS3 } from "./legends3";
import { LEGENDS4 } from "./legends4";
import { MULTI } from "./multi";
import { RED } from "./red";
import { STARTER } from "./starter";
import { SUMMONS } from "./summons";
import { TRANSFORM } from "./transform";
import { WHITE } from "./white";

export const FIN_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...LANDS,
  ...ARTIFACTS,
  ...MULTI,
  ...GEAR,
  ...SUMMONS,
  ...TRANSFORM,
  ...STARTER,
  ...LEGENDS,
  ...LEGENDS2,
  ...LEGENDS3,
  ...LEGENDS4,
};
