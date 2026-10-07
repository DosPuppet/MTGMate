/** Murders at Karlov Manor — cartes noires. */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BAT_1,
  type CardScript,
  cond,
  DOG,
  entersWith,
  fx,
  investigate,
  modal,
  mode,
  ref,
  SKELETON_B,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };
const CREATURE_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Une carte de créature mise dans votre cimetière depuis n'importe où ce tour-ci. */
const CREATURE_CARD_TO_YOUR_GRAVEYARD = amount.turnEvents({
  event: "zone",
  to: "graveyard",
  types: ["Creature"],
  token: false,
  byOwner: true,
  who: "you",
});
/** « Chaque fois qu'une ou plusieurs cartes de créature quittent votre cimetière » (avec `batched`). */
const CREATURE_CARDS_LEAVE_YOUR_GRAVEYARD = when.zoneChange(["graveyard"], { filter: CREATURE, whose: "you" });

export const BLACK: Record<string, CardScript> = {
  "Agency Coroner": {
    abilities: [
      activated({
        mana: "{2}{B}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [
          fx.when(cond.refMatches(ref.costSacrificed, { suspected: true }), fx.draw(2)),
          fx.when(cond.not(cond.refMatches(ref.costSacrificed, { suspected: true })), fx.draw(1)),
        ],
        label: "Piochez une carte (deux si la créature sacrifiée était suspecte)",
      }),
    ],
  },
  "Alley Assailant": {
    // Déguisement {4}{B}{B} : lu dans le texte.
    abilities: [
      entersWith({ tapped: true }),
      triggered(when.turnedFaceUp, fx.drain(3, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "Retournée : un adversaire perd 3 PV, vous gagnez 3 PV",
      }),
    ],
  },
  "Barbed Servitor": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.self)], { label: "Suspectez-la" }),
      triggered(when.combatDamageToPlayer, [fx.draw(1), fx.loseLife(1)], {
        label: "Piochez une carte, perdez 1 PV",
      }),
      triggered(when.isDealtDamage, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire perd autant de PV que les blessures subies",
      }),
    ],
  },
  "Basilica Stalker": {
    // Déguisement {4}{B} : lu dans le texte.
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.gainLife(1), fx.surveil(1)], {
        label: "Gagnez 1 PV, surveillance 1",
      }),
    ],
  },
  "Case of the Gorgon's Kiss": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { damaged: true }))],
        label: "Détruisez une créature blessée ce tour-ci",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "graveyard", types: ["Creature"], token: false }), 3),
    caseSolved: [
      staticAbility(
        "self",
        {
          addTypes: ["Creature"],
          addSubtypes: ["Gorgon"],
          setPower: 4,
          setToughness: 4,
          addKeywords: ["deathtouch", "lifelink"],
        },
        { label: "Gorgone 4/4 avec le contact mortel et le lien de vie" },
      ),
    ],
  },
  "Case of the Stashed Skeleton": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SKELETON_B, 1, undefined, "sk"), fx.suspect(ref.stored("sk"))], {
        label: "Squelette 2/1 suspect",
      }),
    ],
    caseToSolve: cond.not(cond.controls({ subtype: "Skeleton", suspected: true })),
    caseSolved: [
      activated({
        mana: "{1}{B}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.search({})],
        label: "Cherchez une carte dans votre bibliothèque",
      }),
    ],
  },
  "Cerebral Confiscation": {
    spell: modal(
      mode("Un adversaire défausse deux cartes", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
      mode(
        "Un adversaire révèle sa main ; vous choisissez une carte non-terrain qu'il défausse",
        [target.player("t", "opponent")],
        [fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller" })],
      ),
    ),
  },
  "Clandestine Meddler": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
        label: "Suspectez une autre créature que vous contrôlez",
      }),
      triggered(when.attackWith(1, { types: ["Creature"], suspected: true }), [fx.surveil(1)], {
        label: "Des créatures suspectes attaquent : surveillance 1",
      }),
    ],
  },
  "Extract a Confession": {
    // Réunir des preuves 6 (coût additionnel facultatif) : lu dans le texte.
    spell: spell(
      [],
      [
        fx.when(cond.not(cond.kicked), fx.sacrifice(ref.eachOpponent, CREATURE)),
        fx.when(cond.kicked, fx.sacrifice(ref.eachOpponent, CREATURE, 1, { greatestPower: true })),
      ],
    ),
  },
  Festerleech: {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.mill(2)], { label: "Meulez deux cartes" }),
      activated({ mana: "{1}{B}", oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2 jusqu'à la fin du tour" }),
    ],
  },
  "Homicide Investigator": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false }), [investigate(1)], {
        batched: true,
        oncePerTurn: true,
        label: "Enquêtez",
      }),
    ],
  },
  "Hunted Bonebrute": {
    // Menace et déguisement {1}{B} : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DOG, 2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire crée deux Chiens 1/1",
      }),
      triggered(when.diesSelf, [fx.loseLife(3, ref.eachOpponent)], { label: "Chaque adversaire perd 3 PV" }),
    ],
  },
  "Illicit Masquerade": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1, "impostor")], {
        label: "Un marqueur imposteur sur chacune de vos créatures",
      }),
      triggered(
        when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "impostor" }),
        [fx.exileCard(ref.eventObject), fx.toBattlefield(ref.target())],
        {
          targets: [
            target.upTo(1, {
              ...target.cardInGraveyard("t", CREATURE, "you", "autre carte de créature de votre cimetière"),
              notEventObject: true,
            }),
          ],
          label: "Exilez-la ; renvoyez une autre créature de votre cimetière sur le champ de bataille",
        },
      ),
    ],
  },
  "It Doesn't Add Up": {
    spell: spell(
      [target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière")],
      [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "back" }), fx.suspect(ref.stored("back"))],
    ),
  },
  "Lead Pipe": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      triggered(when.dies({ attached: "host" }), [fx.loseLife(1, ref.eachOpponent)], {
        label: "Chaque adversaire perd 1 PV",
      }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Leering Onlooker": {
    abilities: [
      activated({
        mana: "{2}{B}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.createTappedTokens(BAT_1, 2)],
        label: "Depuis le cimetière : deux Chauves-souris 1/1 volantes engagées",
      }),
    ],
  },
  "Long Goodbye": {
    cantBeCountered: true,
    spell: spell([target.creatureOrPlaneswalker("t", { maxManaValue: 3 })], [fx.destroy(ref.target())]),
  },
  "Macabre Reconstruction": {
    costReduction: { generic: 2, condition: cond.amountAtLeast(CREATURE_CARD_TO_YOUR_GRAVEYARD, 1) },
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", CREATURE, "you", "carte de créature de votre cimetière"))],
      [fx.toHand(ref.target())],
    ),
  },
  "Massacre Girl, Known Killer": {
    // Menace : lue dans le texte.
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { addKeywords: ["wither"] }, { label: "Vos créatures ont l'infection" }),
      // « si son endurance était inférieure à 1 » : lue dans ses dernières informations connues.
      triggered(when.dies({ types: ["Creature"], controller: "opponent", maxToughness: 0 }), [fx.draw(1)], {
        label: "Une créature adverse d'endurance inférieure à 1 meurt : piochez une carte",
      }),
    ],
  },
  Murder: { spell: spell([target.creature()], [fx.destroy(ref.target())]) },
  "Nightdrinker Moroii": {
    // Déguisement {B}{B} : lu dans le texte.
    abilities: [triggered(when.entersSelf, [fx.loseLife(3)], { label: "Vous perdez 3 PV" })],
  },
  "Outrageous Robbery": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), amount.x, "r", "you"), fx.grantPlay(ref.stored("r"), { forever: true, anyMana: true })],
    ),
  },
  "Persuasive Interrogators": {
    abilities: [
      triggered(when.entersSelf, [investigate(1)], { label: "Enquêtez" }),
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.poison(ref.target(), 2)], {
        targets: [target.player("t", "opponent")],
        label: "Vous sacrifiez un Indice : un adversaire reçoit deux marqueurs poison",
      }),
    ],
  },
  "Presumed Dead": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 2, 0),
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(
              when.diesSelf,
              [fx.moveTo(ref.selfCard, { to: "battlefield" }, { name: "back" }), fx.suspect(ref.stored("back"))],
              { label: "Revient sur le champ de bataille, suspecte" },
            ),
          ],
        }),
      ],
    ),
  },
  "Repeat Offender": {
    abilities: [
      activated({
        mana: "{2}{B}",
        // Le marqueur d'abord : si elle n'était pas suspecte, elle ne fait que le devenir.
        effects: [
          fx.when(cond.sourceMatches({ suspected: true }), fx.addCounters(ref.self, 1)),
          fx.when(cond.not(cond.sourceMatches({ suspected: true })), fx.suspect(ref.self)),
        ],
        label: "Marqueur +1/+1 si elle est suspecte, sinon suspectez-la",
      }),
    ],
  },
  "Rot Farm Mortipede": {
    abilities: [
      triggered(CREATURE_CARDS_LEAVE_YOUR_GRAVEYARD, [fx.pump(ref.self, 1, 0, ["menace", "lifelink"])], {
        batched: true,
        label: "+1/+0, menace et lien de vie jusqu'à la fin du tour",
      }),
    ],
  },
  "Slice from the Shadows": {
    cantBeCountered: true,
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.neg(amount.x), amount.neg(amount.x))]),
  },
  "Slimy Dualleech": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        label: "+1/+0 et contact mortel à une créature de force 2 ou moins",
      }),
    ],
  },
  "Snarling Gorehound": {
    // Menace : lue dans le texte.
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true, maxPower: 2 }), [fx.surveil(1)], {
        label: "Surveillance 1",
      }),
    ],
  },
  "Soul Enervation": {
    // Flash : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -4, -4)], {
        targets: [target.creature()],
        label: "-4/-4 jusqu'à la fin du tour",
      }),
      triggered(CREATURE_CARDS_LEAVE_YOUR_GRAVEYARD, fx.drain(1), {
        batched: true,
        label: "Chaque adversaire perd 1 PV, vous gagnez 1 PV",
      }),
    ],
  },
  "Toxin Analysis": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["deathtouch", "lifelink"]), investigate(1)]),
  },
  "Undercity Eliminator": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Artifact", "Creature"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.creature("t", { controller: "opponent" })], [fx.exile(ref.target())])),
        ],
        { label: "Sacrifiez un artefact ou une créature : exilez une créature adverse" },
      ),
    ],
  },
  "Unscrupulous Agent": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromOwnHand(ref.target(), "x")], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire exile une carte de sa main",
      }),
    ],
  },
  "Polygraph Orb": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { count: 2, exact: true, rest: "graveyard" }), fx.loseLife(2)], {
        label: "Deux des quatre cartes du dessus en main, le reste au cimetière ; perdez 2 PV",
      }),
      activated({
        mana: "{2}",
        tap: true,
        collectEvidence: 3,
        effects: [fx.punisher(ref.eachOpponent, 3, { discard: true, sacrifice: { types: ["Creature"] } })],
        label: "Chaque adversaire perd 3 PV, sauf s'il défausse une carte ou sacrifie une créature",
      }),
    ],
  },
  "Vein Ripper": {
    abilities: [
      // Garde — sacrifiez une créature : lue dans le texte.
      triggered(when.dies({ types: ["Creature"] }), [fx.loseLife(2, ref.target()), fx.gainLife(2)], {
        targets: [target.player("t", "opponent")],
        label: "Une créature meurt : l'adversaire ciblé perd 2 PV, vous en gagnez 2",
      }),
    ],
  },
};
