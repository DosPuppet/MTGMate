/** Tarkir: Dragonstorm — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_WITH_COUNTER,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  fx,
  modal,
  mode,
  ref,
  renew,
  spell,
  target,
  triggered,
  WARRIOR_R,
  when,
  ZOMBIE_DRUID,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Abzan Devotee": {
    abilities: [
      devotee(["W", "B", "G"]),
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Revient de votre cimetière en main",
      }),
    ],
  },
  "Aggressive Negotiations": {
    spell: spell(
      [target.player("p", "opponent"), target.optional(target.creature("c", { controller: "you" }))],
      [
        fx.discard(1, ref.target("p"), { chooser: "controller", filter: { nonland: true }, exile: true }),
        fx.addCounters(ref.target("c"), 1),
      ],
    ),
  },
  "Alesha's Legacy": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.modify(ref.target(), { addKeywords: ["deathtouch", "indestructible"] })],
    ),
  },
  "Avenger of the Fallen": {
    // Mobilisation X : X est le nombre de cartes de créature de votre cimetière.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.createTappedTokens(WARRIOR_R, amount.countIn("graveyard", { types: ["Creature"] }), {
            attacking: true,
            store: "mob",
          }),
          fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("mob") }),
        ],
        { label: "Mobilisation X (cartes de créature de votre cimetière)" },
      ),
    ],
  },
  "Caustic Exhale": {
    // « Contemplez un Dragon ou payez {1} » : {1} de plus sans Dragon à contempler.
    costReduction: { generic: -1, condition: cond.not(cond.behold(DRAGON_CARD)) },
    spell: spell([target.creature()], [fx.pump(ref.target(), -3, -3)]),
  },
  "Corroding Dragonstorm": {
    abilities: [
      triggered(when.entersSelf, [...fx.drain(2), fx.surveil(2)], {
        label: "Chaque adversaire perd 2 PV, vous en gagnez 2 ; surveillance 2",
      }),
      dragonstorm(),
    ],
  },
  "Cruel Truths": { spell: spell([], [fx.surveil(2), fx.draw(2), fx.loseLife(2)]) },
  "Delta Bloodflies": {
    abilities: [
      triggered(when.attacksSelf, [fx.loseLife(1, ref.eachOpponent)], {
        condition: cond.controls(CREATURE_WITH_COUNTER),
        label: "Une de vos créatures a un marqueur : chaque adversaire perd 1 PV",
      }),
    ],
  },
  "Desperate Measures": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 1, -1),
        fx.emblem(
          "Desperate Measures",
          "When it dies under your control this turn, draw two cards.",
          [triggered(when.dies({ linkedToSource: true, controller: "you" }), [fx.draw(2)], { label: "Piochez deux cartes" })],
          false,
          true,
          "e",
        ),
        fx.link(ref.target(), ref.stored("e")),
      ],
    ),
  },
  "Dragon's Prey": {
    costReduction: { generic: -2, condition: cond.targetMatches("t", { subtype: "Dragon" }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Gurmag Rakshasa": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target("a"), -2, -2), fx.pump(ref.target("b"), 2, 2)], {
        targets: [target.creature("a", { controller: "opponent" }), target.creature("b", { controller: "you" })],
        label: "Une créature adverse gagne -2/-2, une des vôtres +2/+2",
      }),
    ],
  },
  "Nightblade Brigade": { abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" })] },
  "Salt Road Skirmish": {
    spell: spell(
      [target.creature()],
      [
        fx.destroy(ref.target()),
        fx.createTokens(WARRIOR_R, 2, undefined, "w"),
        fx.modify(ref.stored("w"), { addKeywords: ["haste"] }),
        fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("w") }),
      ],
    ),
  },
  "Unburied Earthcarver": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifiez une autre créature : marqueur +1/+1",
      }),
    ],
  },
  "Unrooted Ancestor": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.modify(ref.self, { addKeywords: ["indestructible"] }), fx.tap(ref.self)],
        label: "Sacrifiez une autre créature : indestructible, engagez-la",
      }),
    ],
  },
  "Venerated Stormsinger": {
    // Mobilisation 1 : lue dans le texte.
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1), {
        label: "Une de vos créatures meurt : chaque adversaire perd 1 PV, vous en gagnez 1",
      }),
    ],
  },
  "Wail of War": {
    spell: modal(
      mode(
        "Les créatures d'un adversaire gagnent -1/-1",
        [target.player("p", "opponent")],
        [fx.pump(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), -1, -1)],
      ),
      mode(
        "Jusqu'à deux cartes de créature reviennent en main",
        [target.upTo(2, target.cardInGraveyard("g", { types: ["Creature"] }, "you", "carte de créature de votre cimetière"))],
        [fx.toHand(ref.target("g"))],
      ),
    ),
  },
  "Worthy Cost": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([target.creatureOrPlaneswalker()], [fx.exile(ref.target())]),
  },
  "Yathan Tombguard": {
    abilities: [
      triggered(when.combatDamage(CREATURE_WITH_COUNTER, true), [fx.draw(1), fx.loseLife(1)], {
        label: "Une de vos créatures à marqueur blesse un joueur : piochez, perdez 1 PV",
      }),
    ],
  },

  // --- Lot B ------------------------------------------------------------------
  "Adorned Crocodile": {
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(ZOMBIE_DRUID)], { label: "Un Zombie Druide 2/2" }),
      renew("{B}", [target.creature()], [fx.addCounters(ref.target(), 1)], "marqueur +1/+1 sur une créature"),
    ],
  },
  "Alchemist's Assistant": {
    abilities: [
      renew("{1}{B}", [target.creature()], [fx.counters(ref.target(), "lifelink")], "marqueur de lien de vie sur une créature"),
    ],
  },
  "Feral Deathgorger": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        label: "Exilez jusqu'à deux cartes d'un même cimetière",
      }),
    ],
  },
  "Dusk Sight": {
    spell: spell([target.optional(target.creature())], [fx.addCounters(ref.target(), 1), fx.draw(1)]),
  },
  "Kin-Tree Nurturer": { abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 1)], { label: "Endurance 1" })] },
  "Sandskitter Outrider": { abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 2)], { label: "Endurance 2" })] },
  "Exude Toxin": {
    spell: spell([], [fx.pumpAll({ types: ["Creature"], notSubtype: "Dragon" }, amount.neg(amount.x), amount.neg(amount.x))]),
  },
  "Sinkhole Surveyor": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(1), fx.endure(ref.self, 1)], { label: "Perdez 1 PV ; endurance 1" })],
  },
  "Purging Stormbrood": {
    abilities: [
      triggered(when.entersSelf, [fx.removeCounters(ref.target(), 1000)], {
        targets: [target.optional(target.creature())],
        label: "Retirez tous les marqueurs d'une créature",
      }),
    ],
  },
  "Absorb Essence": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["lifelink", "hexproof"])]),
  },
};
