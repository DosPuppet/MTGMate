/**
 * Secrets of Strixhaven — cartes blanches (lot A). La préparation est lue dans le texte (le sort préparé va dans
 * `prepareSpell`) ; le flashback à coût de mana est écrit dans le script ; la garde et les mots-clés sont lus dans le texte.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  INKLING,
  REPARTEE,
  ref,
  SPIRIT_RW,
  spell,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const YOUR_CREATURE = () => target.creature("t", { controller: "you" });
/** « Cette créature arrive préparée. » */
const ENTERS_PREPARED = entersWith({ prepared: true, label: "Arrive préparée" });

export const WHITE: Record<string, CardScript> = {
  "Ajani's Response": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Antiquities on the Loose": {
    flashback: "{4}{W}{W}",
    spell: spell(
      [],
      [
        fx.createTokens(SPIRIT_RW, 2),
        // « Puis, si ce sort a été lancé d'ailleurs que de votre main » (flashback…).
        ...fx.when(cond.not(cond.spellCastFromHand), fx.addCountersAll({ subtype: "Spirit", controller: "you" }, 1)),
      ],
    ),
  },
  "Ascendant Dustspeaker": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Un marqueur +1/+1 sur une autre créature",
      }),
      triggered(when.yourCombat, [fx.exileCard(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "Exilez jusqu'à une carte d'un cimetière",
      }),
    ],
  },
  "Dig Site Inventory": {
    flashback: "{W}",
    spell: spell([YOUR_CREATURE()], [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance"] })]),
  },
  "Eager Glyphmage": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(INKLING)], { label: "Un Inkling 1/1 volant" })],
  },
  "Elite Interceptor": {
    // Rejoinder : « Vous pouvez engager ou dégager la créature ciblée. Piochez une carte. »
    prepareSpell: spell(
      [target.creature()],
      [
        // Une seule des deux questions : la réponse « engager » est mémorisée pour ne pas dégager ensuite.
        ...fx.when(
          cond.not(cond.targetMatches("t", { tapped: true })),
          fx.mayForStore(ref.you, "Engager la créature ciblée ?", "tapped", fx.tap(ref.target())),
        ),
        ...fx.when(
          cond.all(cond.targetMatches("t", { tapped: true }), cond.not(cond.v("tapped"))),
          fx.may("Dégager la créature ciblée ?", fx.untap(ref.target())),
        ),
        fx.draw(1),
      ],
    ),
    abilities: [ENTERS_PREPARED],
  },
  "Emeritus of Truce": {
    // Swords to Plowshares : la force est lue d'après les dernières informations connues.
    prepareSpell: spell(
      [target.creature()],
      [fx.exile(ref.target()), fx.gainLife(amount.powerOf(ref.target()), ref.controllerOf(ref.target()))],
    ),
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(INKLING, 1, ref.target()), ...fx.when(cond.opponentHasMore("creatures"), fx.prepare(ref.self))],
        {
          targets: [target.player()],
          label: "Le joueur ciblé crée un Inkling ; devient préparée si un adversaire a plus de créatures",
        },
      ),
    ],
  },
  "Ennis, Debate Moderator": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Exilez une autre créature (elle revient à la prochaine étape de fin)",
        },
      ),
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "exile", token: false }), 1),
        label: "Des cartes exilées ce tour-ci : un marqueur +1/+1",
      }),
    ],
  },
  "Graduation Day": {
    abilities: [
      triggered(REPARTEE, [fx.addCounters(ref.target(), 1)], {
        targets: [YOUR_CREATURE()],
        label: "Repartee : un marqueur +1/+1",
      }),
    ],
  },
  "Harsh Annotation": {
    spell: spell([target.creature()], [fx.destroy(ref.target()), fx.createTokens(INKLING, 1, ref.controllerOf(ref.target()))]),
  },
  "Honorbound Page": {
    // Forum's Favor : « La créature ciblée gagne +1/+0 et le vol jusqu'à la fin du tour. »
    prepareSpell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["flying"])]),
    abilities: [ENTERS_PREPARED],
  },
  "Informed Inkwright": {
    abilities: [triggered(REPARTEE, [fx.createTokens(INKLING)], { label: "Repartee : un Inkling 1/1 volant" })],
  },
  "Inkshape Demonstrator": {
    abilities: [triggered(REPARTEE, [fx.pump(ref.self, 1, 0, ["lifelink"])], { label: "Repartee : +1/+0 et le lien de vie" })],
  },
  Interjection: {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["firstStrike"])]),
  },
  "Joined Researchers": {
    // Secret Rendezvous : « Vous et l'adversaire ciblé piochez chacun trois cartes. »
    prepareSpell: spell([target.player("t", "opponent")], [fx.draw(3), fx.draw(3, ref.target())]),
    abilities: [
      triggered(when.eachEndStep, [fx.prepare(ref.self)], {
        condition: cond.opponentHasMore("hand"),
        label: "Un adversaire a plus de cartes en main : devient préparée",
      }),
    ],
  },
  "Owlin Historian": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.pump(ref.self, 1, 1)], {
        batched: true,
        label: "Des cartes quittent votre cimetière : +1/+1",
      }),
    ],
  },
  "Primary Research": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, notTypes: ["Land"], maxManaValue: 3 },
            "you",
            "carte de permanent non-terrain de VM 3 ou moins",
          ),
        ],
        label: "Renvoie un permanent de VM 3 ou moins",
      }),
      triggered(when.yourEndStep, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1),
        label: "Une carte a quitté votre cimetière : piochez",
      }),
    ],
  },
  "Quill-Blade Laureate": {
    // Twofold Intent : « La créature ciblée gagne +1/+0 et la double initiative jusqu'à la fin du tour. »
    prepareSpell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["doubleStrike"])]),
    abilities: [ENTERS_PREPARED],
  },
  "Rapier Wit": {
    spell: spell(
      [target.creature()],
      [fx.tap(ref.target()), ...fx.when(cond.yourTurn, fx.counters(ref.target(), "stun", 1)), fx.draw(1)],
    ),
  },
  "Rehearsed Debater": {
    abilities: [triggered(REPARTEE, [fx.pump(ref.self, 1, 1)], { label: "Repartee : +1/+1" })],
  },
  "Restoration Seminar": {
    // Paradigme : lu dans le texte.
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "you", "carte de permanent non-terrain")],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Shattered Acolyte": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Détruit un artefact ou un enchantement",
      }),
    ],
  },
  "Spiritcall Enthusiast": {
    // Scrollboost : « Une ou deux créatures ciblées gagnent chacune +2/+2 jusqu'à la fin du tour. »
    prepareSpell: spell([target.between(1, 2, target.creature())], [fx.pump(ref.target(), 2, 2)]),
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), [fx.prepare(ref.self)], {
        batched: true,
        label: "Des jetons arrivent : devient préparée",
      }),
    ],
  },
  "Stand Up for Yourself": {
    spell: spell([target.creature("t", { minPower: 3 })], [fx.destroy(ref.target())]),
  },
  "Stirring Hopesinger": {
    abilities: [
      triggered(REPARTEE, [fx.addCountersAll(YOUR_CREATURES, 1)], {
        label: "Repartee : un marqueur +1/+1 sur chacune de vos créatures",
      }),
    ],
  },
  "Stone Docent": {
    abilities: [
      activated({
        mana: "{W}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.gainLife(2), fx.surveil(1)],
        label: "Gagnez 2 PV, surveillance 1",
      }),
    ],
  },
  "Summoned Dromedary": {
    abilities: [
      activated({
        mana: "{1}{W}",
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toHand(ref.self)],
        label: "Revient du cimetière dans la main",
      }),
    ],
  },
  "Group Project": {
    // « Flashback—Engagez trois créatures dégagées que vous contrôlez » : flashback sans mana, avec ce coût en plus.
    flashback: "{0}",
    flashbackCost: { tap: { filter: { types: ["Creature"], controller: "you" }, count: 3 } },
    spell: spell([], [fx.createTokens(SPIRIT_RW)]),
  },
  // « Exilez deux cartes de votre cimetière ou payez {1}{W} » : lu dans le texte (kicker sans mana ou mana en plus).
  "Soaring Stoneglider": {},
};
