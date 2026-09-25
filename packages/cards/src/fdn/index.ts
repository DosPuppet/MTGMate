/**
 * Comportement des cartes de Foundations (FDN), par couleur.
 * Les caractéristiques (coût, types, F/E, mots-clés) viennent de Scryfall ;
 * on ne décrit ici que ce qui ne se déduit pas des mots-clés.
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

export const FDN_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...LANDS,
};
