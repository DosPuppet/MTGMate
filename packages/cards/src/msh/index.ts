/** Marvel Super Heroes (MSH): power-up, teamwork, harness, Heroes and Villains. */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { CARDS } from "./cards";
import { GREEN } from "./green";
import { LEGENDS } from "./legends";
import { MULTI } from "./multi";
import { RED } from "./red";
import { WHITE } from "./white";

export const MSH_SCRIPTS: Record<string, CardScript> = {
  ...CARDS,
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...LEGENDS,
};
