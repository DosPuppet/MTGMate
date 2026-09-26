/** Reality Fracture — artefacts et cartes incolores. */
import {
  activated,
  type CardScript,
  cond,
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
      activated({ mana: "{2}", effects: [fx.modify(ref.self, { addKeywords: ["flying"] })], label: "Vol" }),
      triggered(when.attacksSelf, [fx.exileCard(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "exile une carte d'un cimetière",
      }),
    ],
  },
  "Archive Arbiter": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode(
          "Détruire un permanent non-créature non-terrain",
          [targetObj("t", { permanent: true, notTypes: ["Creature", "Land"] }, "permanent non-créature, non-terrain")],
          [fx.destroy(ref.target())],
        ),
        mode("Vous gagnez 4 PV", [], [fx.gainLife(4)]),
      ]),
    ],
  },
  "The Echoverse Fulcrum": {
    abilities: [
      triggered(when.entersSelf, fx.loot(1), { label: "piochez puis défaussez" }),
      activated({
        mana: "{5}",
        tap: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.destroyAll({ types: ["Creature"] })],
        label: "Détruire toutes les créatures",
      }),
    ],
  },
  "Eye of Jace": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.surveil(1), ...fx.when(cond.threshold, fx.sacrificeIt(ref.self), fx.damage(2, ref.eachOpponent), fx.gainLife(2))],
        { label: "surveillance 1" },
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
          addAbilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "+1 PV" })],
        },
        { label: "+1/+0, vol, +1 PV en attaquant" },
      ),
    ],
  },
  "Murmuring Volume": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      // Approximation : la défausse est faite à la résolution (pas comme coût).
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        label: "Défaussez puis piochez",
      }),
    ],
  },
  "Traxos, Scourge Eternal": {
    keywords: ["doesntUntap"],
    abilities: [
      triggered(when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }), [fx.untap(ref.self)], {
        label: "se dégage",
      }),
    ],
  },
};
