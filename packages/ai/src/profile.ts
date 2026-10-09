/**
 * Play profile of an AI level: what sets the beginner, the medium and the expert apart in the heuristic decisions.
 */

export interface Profile {
  /** Seeded randomness (beginner noise). */
  rand: () => number;
  /** Probability of taking a correct option at random rather than the best one (beginner). */
  sloppiness: number;
  /** Probability of casting nothing while a spell is possible (beginner). */
  forgetfulness: number;
  /** Responds to opposing spells, plays combat tricks, plays at the end of the opponent's turn. */
  responds: boolean;
  /** On its own main phase, keeps the mana for a counterspell in hand (PLAN-L L1). */
  holdsCounters: boolean;
  /** Attacks: naive, by rules, or by simulation of the opposing blocks. */
  attack: "naive" | "rules" | "search";
  /** Blocks: naive, greedy by simulation, or by search (double blocks, improvements). */
  block: "naive" | "greedy" | "search";
  /** The evaluation takes the opposing counterattack into account. */
  exposure: boolean;
  /** Mulligans: loose (keeps 1 to 6 lands) or normal. */
  mulligan: "loose" | "normal";
  /** Budget elapsed (time-bounded searches): we keep the best option found. */
  outOfTime: () => boolean;
}

const never = () => false;

export const MEDIUM_PROFILE: Profile = {
  rand: Math.random,
  sloppiness: 0,
  forgetfulness: 0,
  responds: true,
  holdsCounters: true,
  attack: "rules",
  block: "greedy",
  exposure: false,
  mulligan: "normal",
  outOfTime: never,
};
