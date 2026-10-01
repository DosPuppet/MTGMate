/**
 * Murders at Karlov Manor — cartes blanches (lot A). Le déguisement, la garde, l'Équipement et les mots-clés sont lus
 * dans le texte ; « enquêtez » crée un Indice (`investigate`).
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  CLUE,
  cond,
  DETECTIVE,
  DOG,
  eventReplacement,
  fx,
  investigate,
  playerStatic,
  ref,
  SUSPECTED,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** « une autre créature que vous contrôlez de force 2 ou moins ». */
const ANOTHER_SMALL: ObjectFilter = { ...YOUR_CREATURES, other: true, maxPower: 2 };
const YOUR_DETECTIVES: ObjectFilter = { subtype: "Detective", controller: "you" };

export const WHITE: Record<string, CardScript> = {
  "Absolving Lammasu": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.permanentsOf(ref.eachPlayer, SUSPECTED), false)], {
        label: "Les créatures suspectes ne le sont plus",
      }),
      triggered(when.diesSelf, [fx.gainLife(3), fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "Gagnez 3 PV et suspectez une créature adverse",
      }),
    ],
  },
  "Assemble the Players": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Regardez la carte du dessus" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { types: ["Creature"], maxPower: 2 }, what: "spells", oncePerTurn: true },
        label: "Une fois par tour, lancez une créature de force 2 ou moins du dessus de votre bibliothèque",
      }),
    ],
  },
  "Auspicious Arrival": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2), investigate()]),
  },
  "Call a Surprise Witness": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 })],
      [fx.toBattlefield(ref.target(), { counters: { kind: "flying", n: 1 }, addSubtypes: ["Spirit"] })],
    ),
  },
  "Case of the Pilfered Proof": {
    abilities: [
      triggered(when.enters(YOUR_DETECTIVES), [fx.addCounters(ref.eventObject, 1)], {
        label: "Un marqueur +1/+1 sur le Détective",
      }),
      triggered(when.permanentTurnedFaceUp(YOUR_DETECTIVES), [fx.addCounters(ref.eventObject, 1)], {
        label: "Un marqueur +1/+1 sur le Détective retourné",
      }),
    ],
    caseToSolve: cond.controls(YOUR_DETECTIVES, 3),
    caseSolved: [
      eventReplacement({ event: "tokens", to: "you", plus: CLUE, modify: {}, label: "Un Indice en plus de vos jetons" }),
    ],
  },
  "Defenestrated Phantom": {},
  "Delney, Streetwise Lookout": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, maxPower: 2 },
        { addBlockRules: [block.notBy({ minPower: 3 }, "Imblocable par les créatures de force 3 ou plus")] },
        { label: "Vos créatures de force 2 ou moins : imblocables par les créatures de force 3 ou plus" },
      ),
      playerStatic({
        triggerMod: { effect: "again", sources: { ...YOUR_CREATURES, maxPower: 2 } },
        label: "Les capacités de vos créatures de force 2 ou moins se déclenchent une fois de plus",
      }),
    ],
  },
  "Doorkeeper Thrull": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "none", onEnter: true, entering: { types: ["Artifact", "Creature"] }, everyone: true },
        label: "L'arrivée d'artefacts et de créatures ne déclenche rien",
      }),
    ],
  },
  "Due Diligence": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2, ["vigilance"])], {
        targets: [target.creature("t", { controller: "you", notAttachedToSource: true })],
        label: "Une autre de vos créatures gagne +2/+2 et la vigilance",
      }),
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["vigilance"] }, { label: "+2/+2 et vigilance" }),
    ],
  },
  "Essence of Antiquity": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.modifyAll(YOUR_CREATURES, { addKeywords: ["hexproof"] }), fx.untapAll(YOUR_CREATURES)], {
        label: "Vos créatures gagnent la défense talismanique ; dégagez-les",
      }),
    ],
  },
  "Forum Familiar": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.bounce(ref.target()), fx.addCounters(ref.self, 1)], {
        targets: [
          { id: "t", label: "autre permanent que vous contrôlez", filter: { objects: { controller: "you", other: true } } },
        ],
        label: "Renvoyez un autre de vos permanents ; un marqueur +1/+1",
      }),
    ],
  },
  "Griffnaut Tracker": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        label: "Exilez jusqu'à deux cartes d'un même cimetière",
      }),
    ],
  },
  "Haazda Vigilante": {
    abilities: [when.entersSelf, when.attacksSelf].map((trigger) =>
      triggered(trigger, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        label: "Un marqueur +1/+1 sur une de vos créatures de force 2 ou moins",
      }),
    ),
  },
  "Inside Source": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DETECTIVE)], { label: "Un Détective 2/2" }),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", YOUR_DETECTIVES)],
        effects: [fx.pump(ref.target(), 2, 0, ["vigilance"])],
        label: "Un de vos Détectives gagne +2/+0 et la vigilance",
      }),
    ],
  },
  "Krovod Haunch": {
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Gagnez 3 PV" }),
      triggered(
        when.putIntoGraveyardSelf,
        [fx.mayPay("{1}{W}", "Payer {1}{W} pour deux Chiens 1/1 ?", fx.createTokens(DOG, 2))],
        {
          label: "Payez {1}{W} : deux Chiens 1/1",
        },
      ),
    ],
  },
  "Makeshift Binding": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.gainLife(2)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exilez une créature adverse ; gagnez 2 PV",
      }),
    ],
  },
  "Marketwatch Phantom": {
    abilities: [
      triggered(when.enters(ANOTHER_SMALL), [fx.modify(ref.self, { addKeywords: ["flying"] })], {
        label: "Gagne le vol jusqu'à la fin du tour",
      }),
    ],
  },
  "Museum Nightwatch": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(DETECTIVE)], { label: "Un Détective 2/2" })],
  },
  "Neighborhood Guardian": {
    abilities: [
      triggered(when.enters(ANOTHER_SMALL), [fx.pump(ref.target(), 1, 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une de vos créatures gagne +1/+1",
      }),
    ],
  },
  "Not on My Watch": {
    spell: spell([target.creature("t", { attacking: true })], [fx.exile(ref.target())]),
  },
  "Novice Inspector": {
    abilities: [triggered(when.entersSelf, [investigate()], { label: "Enquêtez" })],
  },
  "On the Job": {
    spell: spell([], [fx.pumpAll(YOUR_CREATURES, 2, 1), investigate()]),
  },
  "Perimeter Enforcer": {
    abilities: [
      triggered(when.enters({ ...YOUR_DETECTIVES, other: true }), [fx.pump(ref.self, 1, 1)], { label: "+1/+1" }),
      triggered(when.permanentTurnedFaceUp(YOUR_DETECTIVES), [fx.pump(ref.self, 1, 1)], { label: "+1/+1" }),
    ],
  },
  "Sanctuary Wall": {
    abilities: [
      activated({
        mana: "{2}{W}",
        tap: true,
        targets: [target.creature()],
        effects: [
          fx.tap(ref.target()),
          ...fx.may(
            "Mettre un marqueur d'étourdissement sur elle et sur ce Mur ?",
            fx.counters(ref.target(), "stun"),
            fx.counters(ref.self, "stun"),
          ),
        ],
        label: "Engagez une créature",
      }),
    ],
  },
  "Seasoned Consultant": {
    abilities: [triggered(when.attackWith(3), [fx.pump(ref.self, 2, 0)], { label: "+2/+0" })],
  },
  "Unyielding Gatekeeper": {
    abilities: [
      triggered(
        when.turnedFaceUp,
        [
          fx.exileCard(ref.target(), { name: "gate" }),
          // La condition lit les dernières informations connues de la cible exilée.
          ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.toBattlefield(ref.stored("gate"), { tapped: true })),
          ...fx.when(
            cond.not(cond.targetMatches("t", { controller: "you" })),
            fx.createTokens(DETECTIVE, 1, ref.controllerOf(ref.target())),
          ),
        ],
        {
          targets: [target.nonland("t", { other: true })],
          label: "Exilez un autre permanent non-terrain",
        },
      ),
    ],
  },
  Wrench: {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addKeywords: ["vigilance"],
          addAbilities: [
            activated({
              mana: "{3}",
              tap: true,
              targets: [target.creature()],
              effects: [fx.tap(ref.target())],
              label: "Engagez une créature",
            }),
          ],
        },
        { label: "+1/+1, vigilance et « {3}, {T} : engagez une créature »" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Tenth District Hero": {
    abilities: [
      activated({
        mana: "{1}{W}",
        collectEvidence: 2,
        effects: [fx.modify(ref.self, { setSubtypes: ["Human", "Detective"], addKeywords: ["vigilance"] }, "permanent", 4)],
        label: "Réunissez des preuves 2 : Humain Détective 4/4 avec la vigilance",
      }),
      activated({
        mana: "{2}{W}",
        collectEvidence: 4,
        effects: fx.when(
          cond.sourceMatches({ subtype: "Detective" }),
          fx.modify(
            ref.self,
            {
              setName: "Mileva, the Stalwart",
              addSupertypes: ["Legendary"],
              addAbilities: [
                staticAbility(
                  { types: ["Creature"], controller: "you", other: true },
                  { addKeywords: ["indestructible"] },
                  { label: "Vos autres créatures ont l'indestructible" },
                ),
              ],
            },
            "permanent",
            5,
          ),
        ),
        label: "Réunissez des preuves 4 : devient Mileva, the Stalwart (5/5, vos autres créatures indestructibles)",
      }),
    ],
  },
  "Aurelia's Vindicator": {
    abilities: [
      // « jusqu'à X cibles » : X est celui du coût de déguisement payé (`amount.sourceX`), d'où une capacité réflexive.
      triggered(
        when.turnedFaceUp,
        [
          fx.reflexive(
            [
              {
                id: "t",
                label: "autre créature ou carte de créature d'un cimetière",
                filter: {
                  objects: { types: ["Creature"], other: true },
                  cards: { filter: { types: ["Creature"] }, whose: "any" },
                },
                count: 1,
                optional: true,
                countAmount: amount.sourceX,
              },
            ],
            [fx.exileUntilLeaves(ref.target(), true)],
          ),
        ],
        { label: "Exilez jusqu'à X autres créatures ou cartes de créature (retour en main à son départ)" },
      ),
    ],
  },
  "Karlov Watchdog": {
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn", faceUp: true },
        label: "Pendant votre tour, les permanents adverses ne peuvent pas être retournés face visible",
      }),
      triggered(when.attackWith(3), [fx.pumpAll({ types: ["Creature"], controller: "you" }, 1, 1)], {
        label: "Vous attaquez avec trois créatures ou plus : vos créatures +1/+1",
      }),
    ],
  },
  "Case File Auditor": {
    abilities: [
      ...[when.entersSelf, when.caseSolved].map((w) =>
        triggered(w, [fx.lookAtTop(6, { filter: { types: ["Enchantment"] }, count: 1, rest: "bottom" })], {
          label: "Regardez six cartes : un enchantement en main",
        }),
      ),
      playerStatic({
        spellCost: { filter: { subtype: "Case" }, anyMana: true },
        label: "Mana de n'importe quelle couleur pour les sorts d'Affaire",
      }),
    ],
  },
  "Case of the Gateway Express": {
    abilities: [
      triggered(when.entersSelf, [fx.eachDealsDamage({ types: ["Creature"], controller: "you" }, ref.target(), 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Chacune de vos créatures inflige 1 blessure à la créature ciblée",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.turnEvents({ event: "attack" }), 3),
    caseSolved: [staticAbility({ types: ["Creature"], controller: "you" }, { power: 1 }, { label: "Vos créatures +1/+0" })],
  },
};
