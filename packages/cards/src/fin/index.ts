/**
 * Final Fantasy (FIN) : 305 cartes (job select, tiered, Villes, Équipements, créatures-Sagas « Summon »).
 * Les aides et jetons communs viennent d'Outlaws of Thunder Junction et de Foundations (fin/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GEAR } from "./gear";
import { GREEN } from "./green";
import { LANDS } from "./lands";
import { LEGENDS } from "./legends";
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
};
