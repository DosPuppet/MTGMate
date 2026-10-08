/**
 * Common tokens, without the card data: a light module, importable by the game worker.
 */
import type { TokenSpec } from "@mtgx/engine";
import { DINOSAUR_DRAGON, ELEPHANT, PILOT, SERVO, VEHICLE } from "./dft/common";
import { EVERYWHERE, GLIMMER } from "./dsk/common";
import { DRONE, LANDER, MUNITIONS, ROBOT } from "./eoe/common";
import { CAT, CLUE, DOG, FOOD, GOBLIN, MAP, RABBIT, SOLDIER, SPIRIT, TREASURE } from "./fdn/common";
import { THOPTER } from "./fra/common";

/** Common tokens, by name: interface sandbox (dev mode) and tests. */
export const TOKEN_SPECS: Record<string, TokenSpec> = {
  Cat: CAT,
  Dog: DOG,
  Clue: CLUE,
  Drone: DRONE,
  Food: FOOD,
  Lander: LANDER,
  Map: MAP,
  Munitions: MUNITIONS,
  Pilot: PILOT,
  Servo: SERVO,
  Elephant: ELEPHANT,
  Vehicle: VEHICLE,
  Thopter: THOPTER,
  "Dinosaur Dragon": DINOSAUR_DRAGON,
  Everywhere: EVERYWHERE,
  Glimmer: GLIMMER,
  Goblin: GOBLIN,
  Rabbit: RABBIT,
  Robot: ROBOT,
  Soldier: SOLDIER,
  Spirit: SPIRIT,
  Treasure: TREASURE,
};
