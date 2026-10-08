/** Marvel's Spider-Man (SPM): Web-slinging, Mayhem, Heroes and Villains. */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { CARDS } from "./cards";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RED } from "./red";
import { UNIQUE } from "./unique";
import { WHITE } from "./white";

export const SPM_SCRIPTS: Record<string, CardScript> = {
  ...CARDS,
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...UNIQUE,
};
