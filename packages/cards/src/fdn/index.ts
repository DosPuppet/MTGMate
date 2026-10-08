/**
 * Behavior of the Foundations (FDN) cards, by color.
 * Characteristics (cost, types, P/T, keywords) come from Scryfall;
 * only what can't be deduced from the keywords is described here.
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { LANDS } from "./lands";
import { MULTI } from "./multi";
import { PLANESWALKERS } from "./planeswalkers";
import { RED } from "./red";
import { WHITE } from "./white";

export const FDN_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...LANDS,
  ...PLANESWALKERS,
};
