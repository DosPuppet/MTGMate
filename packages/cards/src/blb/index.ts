/**
 * Bloomburrow (BLB): offspring, gift, forage, expend, valiant, Seasons ("paw" modes), Classes, threshold.
 * The shared helpers and tokens come from Duskmourn, Final Fantasy and Foundations (blb/common.ts).
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
