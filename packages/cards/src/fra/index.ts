/**
 * Comportement des cartes de Reality Fracture (FRA, « Réalité fracturée »), par couleur.
 * Même principe que Foundations : les caractéristiques viennent de Scryfall, on ne décrit ici
 * que ce qui ne se déduit pas des mots-clés. Les aides du DSL sont partagées (fdn/common.ts).
 */
import type { CardScript } from "@mtgx/engine";
import { ARTIFACTS } from "./artifacts";
import { BLACK } from "./black";
import { BLUE } from "./blue";
import { GREEN } from "./green";
import { LANDS } from "./lands";
import { MULTI } from "./multi";
import { RED } from "./red";
import { UNIQUE } from "./unique";
import { WHITE } from "./white";

export const FRA_SCRIPTS: Record<string, CardScript> = {
  ...WHITE,
  ...BLUE,
  ...BLACK,
  ...RED,
  ...GREEN,
  ...MULTI,
  ...ARTIFACTS,
  ...LANDS,
  ...UNIQUE,
};
