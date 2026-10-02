/** Teenage Mutant Ninja Turtles (TMT) : faufilement, Mutagène, Alliance, Disparition. */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { CARDS } from "./cards";
import { GREEN } from "./green";
import { MULTI } from "./multi";
import { RED } from "./red";
import { WHITE } from "./white";

export const TMT_SCRIPTS: Record<string, CardScript> = {
  ...CARDS,
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
};
