/**
 * Final Fantasy (FIN) : 305 cartes (job select, tiered, Villes, Équipements, créatures-Sagas « Summon »).
 * Les aides et jetons communs viennent d'Outlaws of Thunder Junction et de Foundations (fin/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { LANDS } from "./lands";
import { MULTI } from "./multi";
import { RED } from "./red";
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
};
