/**
 * Jetons courants, sans les données des cartes : module léger, importable par le worker de partie.
 */
import type { TokenSpec } from "@mtgx/engine";
import { CAT, CLUE, DOG, FOOD, GOBLIN, MAP, RABBIT, SOLDIER, SPIRIT, TREASURE } from "./fdn/common";

/** Jetons courants, par nom : bac à sable de l'interface (mode dev) et tests. */
export const TOKEN_SPECS: Record<string, TokenSpec> = {
  Cat: CAT,
  Dog: DOG,
  Clue: CLUE,
  Food: FOOD,
  Map: MAP,
  Goblin: GOBLIN,
  Rabbit: RABBIT,
  Soldier: SOLDIER,
  Spirit: SPIRIT,
  Treasure: TREASURE,
};
