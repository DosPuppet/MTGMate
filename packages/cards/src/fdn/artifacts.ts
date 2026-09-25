/** Foundations — artefacts incolores. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  FISH,
  fx,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Équipements (« Équiper {N} » est lu dans le texte) ---
  "Fishing Pole": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        tapAttached: true,
        effects: [fx.counters(ref.self, "bait", 1)],
        label: "Engager la créature équipée : marqueur d'appât",
      }),
      triggered(
        when.attachedUntaps,
        [...fx.when(cond.counterAtLeast("bait", 1), fx.counters(ref.self, "bait", -1), fx.createTokens(FISH))],
        { label: "retire un appât : Poisson 1/1" },
      ),
    ],
  },
  "Leyline Axe": {
    leyline: true,
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["doubleStrike", "trample"] },
        { label: "+1/+1, double initiative, piétinement" },
      ),
    ],
  },
  "Quick-Draw Katana": {
    abilities: [
      staticAbility(
        "attached",
        { power: 2, addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Pendant votre tour : +2/+0, initiative" },
      ),
    ],
  },
  "Adventuring Gear": {
    abilities: [triggered(when.landfall, [fx.pump(ref.attached, 2, 2)], { label: "créature équipée +2/+2" })],
  },
  "Goldvein Pick": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }),
      triggered(when.attachedDealsCombatDamageToPlayer, [fx.createTokens(TREASURE)], { label: "Trésor" }),
    ],
  },
  "Swiftfoot Boots": {
    abilities: [staticAbility("attached", { addKeywords: ["hexproof", "haste"] }, { label: "Défense talismanique et célérité" })],
  },
  "Ravenous Amulet": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        effects: [fx.draw(1), fx.counters(ref.self, "soul", 1)],
        label: "Sacrifier une créature : piochez",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.loseLife(amount.countersOn(ref.self, "soul"), ref.eachOpponent)],
        label: "Chaque adversaire perd 1 PV par marqueur d'âme",
      }),
    ],
  },
  "Scrawling Crawler": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachPlayer)], { label: "chaque joueur pioche" }),
      triggered(when.draw(undefined, "opponent"), [fx.loseLife(1, ref.eventPlayer)], { label: "perd 1 PV" }),
    ],
  },
  "Burnished Hart": {
    abilities: [
      activated({
        mana: "{3}",
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)],
        label: "Deux terrains de base",
      }),
    ],
  },
  "Campus Guide": {
    abilities: [
      triggered(when.entersSelf, fx.may("Chercher un terrain de base ?", fx.search(BASIC_LAND, { to: "libraryTop" })), {
        label: "terrain de base au-dessus",
      }),
    ],
  },
  "Gleaming Barrier": { abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Trésor" })] },
  Juggernaut: { keywords: ["mustAttack", "cantBeBlockedByWalls"] },
  "Meteor Golem": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "détruit un permanent",
      }),
    ],
  },
  "Solemn Simulacrum": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher un terrain de base ?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
        { label: "terrain de base engagé" },
      ),
      triggered(when.diesSelf, fx.may("Piocher une carte ?", fx.draw(1)), { label: "piochez une carte" }),
    ],
  },
};
