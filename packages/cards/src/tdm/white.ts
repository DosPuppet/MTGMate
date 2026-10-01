/** Tarkir: Dragonstorm — cartes blanches. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  flurry,
  fx,
  MONK,
  modal,
  mode,
  ref,
  SOLDIER_2,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Arashin Sunshield": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        label: "Exilez jusqu'à deux cartes d'un même cimetière",
      }),
      activated({
        mana: "{W}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Engagez une créature",
      }),
    ],
  },
  "Bearer of Glory": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Initiative pendant votre tour" },
      ),
      activated({ mana: "{4}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Vos créatures gagnent +1/+1" }),
    ],
  },
  "Coordinated Maneuver": {
    spell: modal(
      mode(
        "Blessures égales au nombre de vos créatures",
        [target.creatureOrPlaneswalker()],
        [fx.damage(amount.count(CREATURE_YOU_CONTROL), ref.target())],
      ),
      mode("Détruisez un enchantement", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
    ),
  },
  // Mobilisation 3 et 1 : lues dans le texte.
  "Dalkovan Packbeasts": {},
  "Dragonback Lancer": {},
  "Duty Beyond Death": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell(
      [],
      [fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["indestructible"] }), fx.addCountersAll(CREATURE_YOU_CONTROL, 1)],
    ),
  },
  "Furious Forebear": {
    abilities: [
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        fx.mayPay(
          "{1}{W}",
          "payer {1}{W} pour renvoyer cette carte de votre cimetière dans votre main ?",
          fx.toHand(ref.selfCard),
        ),
        { fromGraveyard: true, label: "Une de vos créatures meurt : {1}{W}, revient en main" },
      ),
    ],
  },
  "Lightfoot Technique": {
    spell: spell(
      [target.creature()],
      [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["flying", "indestructible"] })],
    ),
  },
  "Loxodon Battle Priest": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Marqueur +1/+1 sur une autre de vos créatures",
      }),
    ],
  },
  "Mardu Devotee": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }), devotee(["R", "W", "B"])],
  },
  "Osseous Exhale": {
    // « Vous pouvez contempler un Dragon » en coût additionnel : vérifié à la résolution.
    spell: spell(
      [target.creature("t", { inCombat: true })],
      [fx.damage(5, ref.target()), ...fx.when(cond.behold(DRAGON_CARD), fx.gainLife(2))],
    ),
  },
  "Rally the Monastery": {
    costReduction: { generic: 2, condition: cond.castThisTurn(1) },
    spell: modal(
      mode("Deux Moines 1/1 avec la prouesse", [], [fx.createTokens(MONK, 2)]),
      mode(
        "Jusqu'à deux de vos créatures gagnent +2/+2",
        [target.upTo(2, target.creature("p", { controller: "you" }))],
        [fx.pump(ref.target("p"), 2, 2)],
      ),
      mode("Détruisez une créature de force 4 ou plus", [target.creature("d", { minPower: 4 })], [fx.destroy(ref.target("d"))]),
    ),
  },
  "Rebellious Strike": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0), fx.draw(1)]) },
  "Salt Road Packbeast": {
    // Affinité pour les créatures.
    costReduction: { generic: amount.count(CREATURE_YOU_CONTROL) },
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Smile at Death": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })], {
        targets: [
          target.upTo(
            2,
            target.cardInGraveyard("t", { types: ["Creature"], maxPower: 2 }, "you", "carte de créature de force 2 ou moins"),
          ),
        ],
        label: "Renvoie jusqu'à deux créatures de force 2 ou moins, avec un marqueur +1/+1",
      }),
    ],
  },
  "Starry-Eyed Skyrider": {
    abilities: [
      triggered(when.attacksSelf, [fx.modify(ref.target(), { addKeywords: ["flying"] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre de vos créatures gagne le vol",
      }),
      staticAbility(
        { types: ["Creature"], token: true, attacking: true, controller: "you" },
        { addKeywords: ["flying"] },
        { label: "Vos jetons attaquants ont le vol" },
      ),
    ],
  },
  "Static Snare": {
    costReduction: { generic: amount.count({ types: ["Creature"], attacking: true }) },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [targetObj("t", { types: ["Artifact", "Creature"], controller: "opponent" }, "artefact ou créature adverse")],
        label: "Exile un artefact ou une créature adverse tant qu'il reste",
      }),
    ],
  },
  "Stormbeacon Blade": {
    abilities: [
      staticAbility("attached", { power: 3 }, { label: "+3/+0" }),
      triggered(
        when.attacks({ attachedToSource: true }),
        fx.when(cond.controls({ types: ["Creature"], attacking: true, controller: "you" }, 3), fx.draw(1)),
        { label: "Trois attaquants ou plus : piochez une carte" },
      ),
    ],
  },
  "Stormplain Detainment": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "Exile un permanent non-terrain adverse tant qu'il reste",
      }),
    ],
  },
  "Sunpearl Kirin": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // « Si c'était un jeton, piochez » : vérifié avant le renvoi (le jeton cesse d'exister).
          ...fx.when(cond.refMatches(ref.target(), { token: true }), fx.bounce(ref.target()), fx.draw(1)),
          ...fx.when(cond.not(cond.refMatches(ref.target(), { token: true })), fx.bounce(ref.target())),
        ],
        {
          targets: [
            target.optional(target.nonland("t", { controller: "you", other: true }, "autre permanent non-terrain à vous")),
          ],
          label: "Renvoie un autre de vos permanents ; un jeton : piochez",
        },
      ),
    ],
  },
  "Teeming Dragonstorm": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER_2, 2)], { label: "Deux Soldats 2/2" }), dragonstorm()],
  },
  "Tempest Hawk": {
    // « Un deck peut contenir n'importe quel nombre de cartes nommées Tempest Hawk » : lu par validateDeck.
    abilities: [
      triggered(when.combatDamageToPlayer, fx.may("chercher un Tempest Hawk ?", fx.search({ name: "Tempest Hawk" })), {
        label: "Cherchez un Tempest Hawk",
      }),
    ],
  },

  // --- Lot B ------------------------------------------------------------------
  "Anafenza, Unyielding Lineage": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", nontoken: true, other: true }), [fx.endure(ref.self, 2)], {
        label: "Une autre de vos créatures non-jeton meurt : endurance 2",
      }),
    ],
  },
  "Descendant of Storms": {
    abilities: [
      triggered(when.attacksSelf, fx.mayPay("{1}{W}", "payer {1}{W} pour l'endurance 1 ?", fx.endure(ref.self, 1)), {
        label: "{1}{W} : endurance 1",
      }),
    ],
  },
  "Fortress Kin-Guard": {
    abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 1)], { label: "Endurance 1" })],
  },
  "Poised Practitioner": {
    abilities: [flurry([fx.addCounters(ref.self, 1), fx.scry(1)], "marqueur +1/+1, regard 1")],
  },
  "Riling Dawnbreaker": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre de vos créatures gagne +1/+0",
      }),
    ],
  },
  "Signaling Roar": { spell: spell([], [fx.createTokens(SOLDIER_2)]) },
  "Wayspeaker Bodyguard": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, nonland: true, maxManaValue: 2 },
            "you",
            "carte de permanent non-terrain de VM 2 ou moins",
          ),
        ],
        label: "Un permanent non-terrain de VM 2 ou moins revient en main",
      }),
      flurry([fx.tap(ref.target())], "engagez une créature adverse", [target.creature("t", { controller: "opponent" })]),
    ],
  },
};
