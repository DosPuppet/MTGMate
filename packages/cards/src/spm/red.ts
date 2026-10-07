/** Marvel's Spider-Man — cartes rouges (lot A). */
import type { TriggerSpec, Zone } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  fx,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

/** « Exilez la carte du dessus de votre bibliothèque. Vous pouvez jouer cette carte ce tour-ci. » */
const exileTopPlayThisTurn = [fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"))];

/** « Chaque fois que vous jouez un terrain depuis [ces zones] ». */
const landFrom = (...from: Zone[]): TriggerSpec => ({ on: "playLand", from });

export const RED: Record<string, CardScript> = {
  // Piétinement : lu dans le texte.
  "Angry Rabble": {
    abilities: [
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 blessure à chaque adversaire",
      }),
      activated({
        mana: "{5}{R}",
        sorcerySpeed: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Deux marqueurs +1/+1",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Electro, Assaulting Battery": {
    abilities: [
      playerStatic({ keepUnspentMana: { types: ["R"] }, label: "Vous ne perdez pas votre mana rouge non dépensé" }),
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.addMana("R")], { label: "Ajoutez {R}" }),
      triggered(
        when.leavesSelf,
        [
          fx.payX("payer {X} pour infliger X blessures à un joueur ciblé ?", "x"),
          ...fx.when(cond.v("x"), fx.reflexive([target.player()], [fx.damage(amount.v("x"), ref.target())], undefined, ["x"])),
        ],
        { label: "Payez {X} : X blessures à un joueur ciblé" },
      ),
    ],
  },
  // Chaos {1}{R} : lu dans le texte.
  "Electro's Bolt": { spell: spell([target.creature()], [fx.damage(4, ref.target())]) },
  // Recto-verso modal : chaque face a son script.
  "Gwen Stacy": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileTop(ref.you, 1, "g"),
          fx.grantPlay(ref.stored("g"), { forever: true, condition: cond.controls({ self: true }) }),
        ],
        { label: "Exile la carte du dessus, jouable tant que vous contrôlez cette créature" },
      ),
      activated({ mana: "{2}{U}{R}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-la" }),
    ],
  },
  // Vol, vigilance, célérité : lus dans le texte.
  "Ghost-Spider": {
    abilities: [
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.addCounters(ref.self, 1)], {
        label: "Sort lancé depuis l'exil : un marqueur +1/+1",
      }),
      triggered(landFrom("exile"), [fx.addCounters(ref.self, 1)], {
        label: "Terrain joué depuis l'exil : un marqueur +1/+1",
      }),
      activated({
        removeCounters: { kind: "any", n: 2 },
        effects: exileTopPlayThisTurn,
        label: "Exile la carte du dessus, jouable ce tour-ci",
      }),
    ],
  },
  "Heroes' Hangout": {
    spell: modal(
      mode(
        "Rendez-vous — exile les deux cartes du dessus, l'une jouable jusqu'à la fin de votre prochain tour",
        [],
        [fx.impulse(2, "yourNextTurn")],
      ),
      mode(
        "Patrouille — une ou deux créatures gagnent +1/+0 et l'initiative",
        [target.between(1, 2, target.creature())],
        [fx.pump(ref.target(), 1, 0, ["firstStrike"])],
      ),
    ),
  },
  // Vol, célérité : lus dans le texte.
  "Hobgoblin, Mantled Marauder": {
    abilities: [triggered(when.discard("you"), [fx.pump(ref.self, 2, 0)], { label: "+2/+0 jusqu'à la fin du tour" })],
  },
  "J. Jonah Jameson": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Suspectez jusqu'à une créature",
      }),
      triggered(when.attacks({ types: ["Creature"], controller: "you", keyword: "menace" }), [fx.createTokens(TREASURE)], {
        label: "Une créature avec la menace attaque : un Trésor",
      }),
    ],
  },
  // Célérité : lue dans le texte.
  "Masked Meower": {
    abilities: [activated({ discard: 1, sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" })],
  },
  "Maximum Carnage": {
    abilities: [
      // Approximation : seules les créatures présentes à la résolution sont concernées. Les exigences sont celles d'une
      // provocation par vous (`goadedBy`), sans le mot.
      chapter(
        [1],
        [
          fx.modifyAll(
            { types: ["Creature"] },
            {
              addBlockRules: [
                {
                  goadedBy: "you",
                  label:
                    "Maximum Carnage : attaque à chaque combat si possible, et un joueur autre que son contrôleur si possible",
                },
              ],
            },
            "untilYourNextTurn",
          ),
        ],
        { label: "Chapitre I — jusqu'à votre prochain tour, chaque créature attaque si possible, et un autre joueur que vous" },
      ),
      chapter([2], [fx.addMana("R", "R", "R")], { label: "Chapitre II — ajoutez {R}{R}{R}" }),
      chapter([3], [fx.damage(5, ref.eachOpponent)], { label: "Chapitre III — 5 blessures à chaque adversaire" }),
    ],
  },
  "Molten Man, Inferno Incarnate": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.search({ types: ["Land"], subtype: "Mountain", basic: true }, { to: "battlefield", tapped: true })],
        { label: "Une carte de Montagne de base, engagée" },
      ),
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { subtype: "Mountain", controller: "you" }, label: "+1/+1 par Montagne que vous contrôlez" },
      ),
      triggered(when.leavesSelf, [fx.sacrifice(ref.you, { types: ["Land"] })], { label: "Sacrifiez un terrain" }),
    ],
  },
  // Célérité, chaos {2}{R} : lus dans le texte.
  "Raging Goblinoids": {},
  "Romantic Rendezvous": { spell: spell([], [fx.discard(1), fx.draw(2)]) },
  "Shadow of the Goblin": {
    abilities: [
      triggered(when.step("main1", "you"), [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Visions trompeuses — défaussez une carte ; si vous le faites, piochez une carte",
      }),
      triggered({ on: "castSpell", by: "you", notFromHand: true }, [fx.damage(1, ref.eachOpponent)], {
        label: "Vengeance immortelle — sort lancé hors de votre main : 1 blessure à chaque adversaire",
      }),
      triggered(landFrom("graveyard", "exile", "library"), [fx.damage(1, ref.eachOpponent)], {
        label: "Vengeance immortelle — terrain joué hors de votre main : 1 blessure à chaque adversaire",
      }),
    ],
  },
  Shock: { spell: spell([target.any()], [fx.damage(2, ref.target())]) },
  "Shocker, Unshakable": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "L'initiative pendant votre tour" },
      ),
      triggered(when.entersSelf, [fx.damage(2, ref.target()), fx.damage(2, ref.controllerOf(ref.target()))], {
        targets: [target.creature()],
        label: "Gantelets vibrants — 2 blessures à une créature et 2 à son contrôleur",
      }),
    ],
  },
  // Portée : lue dans le texte.
  "Spider-Gwen, Free Spirit": {
    abilities: [
      triggered(when.tapsSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Vous pouvez défausser une carte ; si vous le faites, piochez une carte",
      }),
    ],
  },
  // Chaos {1}{R} : lu dans le texte.
  "Spider-Islanders": {},
  "Spinneret and Spiderling": {
    abilities: [
      triggered(when.attackWith(2, { subtype: "Spider" }), [fx.addCounters(ref.self, 1)], {
        label: "Attaque avec deux Araignées ou plus : un marqueur +1/+1",
      }),
      triggered(
        when.dealsDamage("self"),
        [fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })],
        {
          condition: cond.amountAtLeast(amount.eventAmount, 4),
          label: "4 blessures ou plus : exile la carte du dessus, jouable jusqu'à la fin de votre prochain tour",
        },
      ),
    ],
  },
  // Menace : lue dans le texte.
  "Stegron the Dinosaur Man": {
    abilities: [
      activated({
        mana: "{1}{R}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 3, 1), fx.modify(ref.target(), { addSubtypes: ["Dinosaur"] })],
        label: "Formule dinosaure — +3/+1 et devient un Dinosaure",
      }),
    ],
  },
  "Taxi Driver": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Une créature gagne la célérité",
      }),
    ],
  },
  Wisecrack: {
    spell: spell(
      [target.creature()],
      [
        fx.damage(amount.powerOf(ref.target()), ref.target(), ref.target()),
        ...fx.when(cond.refMatches(ref.target(), { attacking: true }), fx.damage(2, ref.controllerOf(ref.target()))),
      ],
    ),
  },
};
