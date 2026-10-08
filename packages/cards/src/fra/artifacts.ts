/** Reality Fracture — artifacts and colorless cards. */
import {
  activated,
  type CardScript,
  cond,
  doesntUntap,
  empower,
  fx,
  manaAbility,
  mode,
  ref,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const ARTIFACTS: Record<string, CardScript> = {
  "Afterthought Sentry": {
    abilities: [
      activated({ mana: "{2}", effects: [fx.modify(ref.self, { addKeywords: ["flying"] })], label: "Flying" }),
      triggered(when.attacksSelf, [fx.exileCard(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "exiles a card from a graveyard",
      }),
    ],
  },
  "Archive Arbiter": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode(
          "Destroy a noncreature, nonland permanent",
          [targetObj("t", { permanent: true, notTypes: ["Creature", "Land"] }, "noncreature, nonland permanent")],
          [fx.destroy(ref.target())],
        ),
        mode("You gain 4 life", [], [fx.gainLife(4)]),
      ]),
    ],
  },
  "The Echoverse Fulcrum": {
    abilities: [
      triggered(when.entersSelf, fx.loot(1), { label: "draw, then discard" }),
      activated({
        mana: "{5}",
        tap: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.destroyAll({ types: ["Creature"] })],
        label: "Destroy every creature",
      }),
    ],
  },
  "Eye of Jace": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.surveil(1), ...fx.when(cond.threshold, fx.sacrificeIt(ref.self), fx.damage(2, ref.eachOpponent), fx.gainLife(2))],
        { label: "surveil 1" },
      ),
    ],
  },
  "Medic's Kitesail": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          addKeywords: ["flying"],
          addAbilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "+1 life" })],
        },
        { label: "+1/+0, flying, +1 life when attacking" },
      ),
    ],
  },
  "Murmuring Volume": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({ mana: "{2}", tap: true, discard: 1, effects: [fx.draw(1)], label: "Discard a card: draw" }),
    ],
  },
  "Traxos, Scourge Eternal": {
    abilities: [
      triggered(when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }), [fx.untap(ref.self)], {
        label: "untaps",
      }),
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
    ],
  },
  "Codie, Ravenous Codex": {
    abilities: [
      triggered(when.castSpell("you", { preparedSpell: true }), [fx.copySpell(ref.eventObject, 1)], {
        label: "copies the prepared spell",
      }),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        tap: true,
        effects: [fx.prepareAll({ types: ["Creature"], controller: "you" })],
        label: "Your creatures become prepared",
      }),
    ],
  },
  "Keeper of the Quiet Hour": { abilities: [triggered(when.entersSelf, [empower(2)], { label: "Empower Jace 2" })] },
  "Living Library": {
    abilities: [
      activated({
        mana: "{6}",
        sacrifice: true,
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        effects: [fx.moveTo(ref.target(), { to: "libraryTop" }), fx.shuffle(ref.eachOpponent)],
        label: "Shuffle into the library",
      }),
    ],
  },
};
