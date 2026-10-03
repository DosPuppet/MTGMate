/** Teenage Mutant Ninja Turtles — cartes rouges (lot A). */
import {
  activated,
  amount,
  type CardScript,
  cond,
  FOOD_ABILITY,
  fx,
  MUTANT,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ROBOT_1,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Alliance : « chaque fois qu'une autre créature arrive sous votre contrôle ». */
const ALLIANCE = when.enters(OTHER_CREATURE_YOU_CONTROL);

/** Les artefacts que contrôlent vos adversaires (Broadcast Takeover). */
const OPPONENT_ARTIFACTS = ref.permanentsOf(ref.eachOpponent, { types: ["Artifact"] });

export const RED: Record<string, CardScript> = {
  "Bot Bashing Time": {
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(6, ref.target())]),
  },
  "Broadcast Takeover": {
    // Dégagés et dotés de la célérité avant le changement de contrôle : le résultat est le même que dans l'ordre imprimé.
    spell: spell(
      [],
      [
        fx.untap(OPPONENT_ARTIFACTS),
        fx.modify(OPPONENT_ARTIFACTS, { addKeywords: ["haste"] }),
        fx.gainControl(OPPONENT_ARTIFACTS),
      ],
    ),
  },
  // Célérité : lue dans le texte.
  "Casey Jones, Jury-Rig Justiciar": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { filter: { types: ["Artifact"] }, rest: "bottom" })], {
        label: "Regardez les quatre cartes du dessus : un artefact en main",
      }),
    ],
  },
  // Piétinement : lu dans le texte.
  "General Traag, Heart of Stone": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Artifact"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.creature()], [fx.damage(4, ref.target())])),
        ],
        { label: "Sacrifiez un autre artefact : 4 blessures à une créature" },
      ),
    ],
  },
  // Équiper {2} : lu dans le texte.
  "Hard-Won Jitte": {
    abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double initiative" })],
  },
  // Équiper {R} : lu dans le texte.
  "Improvised Arsenal": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1 },
        { per: { types: ["Artifact"], controller: "you" }, label: "+1/+0 par artefact que vous contrôlez" },
      ),
      activated({ mana: "{4}{R}", effects: [fx.copyToken(ref.self)], label: "Un jeton copie de cet Équipement" }),
    ],
  },
  // Faufilement {R} : lu dans le texte.
  "Jennika's Technique": {
    spell: spell([], [fx.damageAll(2, { types: ["Creature"] })]),
  },
  "Manhole Missile": {
    spell: spell(
      [target.creature()],
      [
        fx.damage(3, ref.target()),
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryBottom" },
          { min: 0, store: "b", prompt: "Une carte de votre main au-dessous de votre bibliothèque (puis piochez)" },
        ),
        ...fx.when(cond.v("b"), fx.draw(1)),
      ],
    ),
  },
  "Mouser Attack!": {
    spell: modal(
      mode("Un jeton Robot 1/1", [], [fx.createTokens(ROBOT_1)]),
      mode("+3/+0 et l'initiative", [target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"])]),
    ),
  },
  "Mouser Foundry": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT_1)], { label: "Un jeton Robot 1/1" }),
      triggered(when.leavesSelf, [fx.createTokens(ROBOT_1)], { label: "Un jeton Robot 1/1" }),
      activated({
        mana: "{4}{R}",
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(3, ref.target())],
        label: "3 blessures à une créature",
      }),
    ],
  },
  // Piétinement : lu dans le texte.
  "Mutant Town Musicians": {
    abilities: [triggered(ALLIANCE, [fx.pump(ref.self, 1, 0)], { label: "Alliance : +1/+0" })],
  },
  "Null Group Biological Assets": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "L'initiative pendant votre tour" },
      ),
      triggered(when.attacksSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Défausse facultative : piochez",
      }),
    ],
  },
  "Old Hob, Alleycat Blues": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.createTokens(MUTANT, 1, undefined, "m"),
          fx.modify(ref.stored("m"), { addKeywords: ["haste"] }),
          fx.delayed([fx.destroy(ref.target("m"))], { m: ref.stored("m") }),
        ],
        { label: "Un Mutant 2/2 avec la célérité, détruit à l'étape de fin" },
      ),
      activated({
        mana: "{1}{W}",
        targets: [target.creature("t", { attacking: true, token: true })],
        effects: [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
        label: "Un jeton attaquant gagne l'indestructible",
      }),
    ],
  },
  "Purple Dragon Punks": {
    abilities: [manaAbility("R", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  },
  // Menace : lue dans le texte.
  "Raphael, Most Attitude": {
    abilities: [
      triggered(
        ALLIANCE,
        fx.may("Exiler la carte du dessus de votre bibliothèque ?", fx.exileTop(ref.you, 1, "r"), fx.link(ref.stored("r"))),
        { label: "Alliance : exilez la carte du dessus" },
      ),
      triggered(when.attacksSelf, [fx.grantPlay(ref.linked, { oneOf: true })], {
        label: "Vous pouvez jouer une carte exilée avec Raphael ce tour-ci",
      }),
    ],
  },
  "Raphael, Ninja Destroyer": {
    keywords: ["mustBeBlocked"],
    abilities: [
      triggered(when.isDealtDamage, [{ op: "addManaUntilEndOfTurn", mana: ["R"], times: amount.eventAmount }], {
        label: "Rage : autant de {R}, gardé jusqu'à la fin du tour",
      }),
    ],
  },
  // Faufilement {1}{R}{R} : lu dans le texte.
  "Raphael, the Nightwatcher": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", attacking: true },
        { addKeywords: ["doubleStrike"] },
        { label: "Vos créatures attaquantes ont la double initiative" },
      ),
    ],
  },
  "Raphael, Tough Turtle": {
    abilities: [
      triggered(ALLIANCE, [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Alliance : 1 blessure à un adversaire",
      }),
    ],
  },
  // Faufilement {2}{R} : lu dans le texte.
  "Raphael's Technique": {
    spell: spell([], [fx.mayWheel]),
  },
  "Ravenous Robots": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Artifact"] }), [fx.createTokens(ROBOT_1)], {
        label: "Un jeton Robot 1/1",
      }),
      activated({
        mana: "{R}",
        tap: true,
        effects: [fx.modifyAll({ types: ["Creature"], token: true, controller: "you" }, { addKeywords: ["haste"] })],
        label: "Vos jetons de créature gagnent la célérité",
      }),
    ],
  },
  "Rock Soldiers": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          target.optional(target.permanent("t", ["Artifact"], { notTypes: ["Creature"] }, "artefact non-créature (jusqu'à un)")),
        ],
        label: "Détruit jusqu'à un artefact non-créature",
      }),
    ],
  },
  "Slash, Reptile Rampager": {
    abilities: [
      triggered(ALLIANCE, [fx.damage(2, ref.eachOpponent)], { label: "Alliance : 2 blessures à chaque adversaire" }),
      triggered(when.attacksSelf, [fx.createTokens(MUTANT)], { label: "Un jeton Mutant 2/2" }),
    ],
  },
  "Spicy Oatmeal Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(4, ref.target()), fx.damage(3, ref.you)], {
        targets: [target.any()],
        label: "4 blessures à n'importe quelle cible et 3 à vous",
      }),
      FOOD_ABILITY,
    ],
  },
  "Wingnut, Bat on the Belfry": {
    abilities: [
      // « Au choix » : choisi à la résolution (608.2d).
      triggered(
        ALLIANCE,
        fx.yourChoice("Wingnut gagne…", "k", [
          { label: "Le vol", effects: [fx.pump(ref.self, 0, 0, ["flying"])] },
          { label: "La menace", effects: [fx.pump(ref.self, 0, 0, ["menace"])] },
          { label: "La célérité", effects: [fx.pump(ref.self, 0, 0, ["haste"])] },
        ]),
        { label: "Alliance : le vol, la menace ou la célérité" },
      ),
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 1, 0)], {
        label: "Les autres attaquants gagnent +1/+0",
      }),
    ],
  },
  // Portée, piétinement et cycle de Montagne {2} : lus dans le texte.
  "Zog, Triceraton Castaway": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })], {
        targets: [target.creature()],
        label: "Une créature ne peut pas bloquer ce tour-ci",
      }),
    ],
  },
};
