/**
 * Duskmourn: House of Horror (DSK) : Salles, manifestation effroyable, Sinistre, Survie, Délire, Imminence.
 * Les aides et jetons communs viennent de Final Fantasy, Outlaws of Thunder Junction et Foundations (dsk/common.ts).
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
