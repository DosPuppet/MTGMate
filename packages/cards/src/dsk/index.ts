/**
 * Duskmourn: House of Horror (DSK): Rooms, manifest dread, Eerie, Survival, Delirium, Impending.
 * The common helpers and tokens come from Final Fantasy, Outlaws of Thunder Junction and Foundations (dsk/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { LEGENDS } from "./legends";
import { LEGENDS2 } from "./legends2";
import { MULTI } from "./multi";
import { RED } from "./red";
import { SPECIAL } from "./special";
import { WHITE } from "./white";

export const DSK_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...SPECIAL,
  ...LEGENDS,
  ...LEGENDS2,
};
