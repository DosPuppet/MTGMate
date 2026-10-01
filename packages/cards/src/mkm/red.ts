/**
 * Murders at Karlov Manor — cartes rouges (lot A). Le déguisement, la garde, la prouesse et les autres mots-clés sont
 * lus dans le texte ; « enquêtez » crée un Indice (`investigate`), « suspectez » passe par `fx.suspect`.
 */
import type { TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  DETECTIVE,
  fx,
  GOBLIN,
  investigate,
  mode,
  ref,
  spell,
  staticAbility,
  THOPTER,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ARTIFACT = { types: ["Artifact" as const] };

/** « {2}, sacrifiez [cet Indice] : piochez une carte. » */
const clueAbility = activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" });

/** « Pour chaque joueur, … jusqu'à un [permanent] que ce joueur contrôle » : au plus un par joueur. */
const onePerPlayer = (t: TargetSpec): TargetSpec => ({ ...target.upTo(4, t), differentPlayers: true });

export const RED: Record<string, CardScript> = {
  "Anzrag's Rampage": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Artifact"], controller: "opponent" }),
        // X : les artefacts mis dans un cimetière depuis le champ de bataille ce tour-ci (ceux qui viennent d'être détruits compris).
        fx.exileTop(
          ref.you,
          amount.turnEvents({ event: "zone", from: "battlefield", to: "graveyard", types: ["Artifact"] }),
          "x",
        ),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          {
            pool: ref.stored("x"),
            count: 1,
            min: 0,
            store: "c",
            prompt: "Une carte de créature exilée à mettre sur le champ de bataille",
          },
        ),
        fx.modify(ref.stored("c"), { addKeywords: ["haste"] }, "permanent"),
        fx.delayed([fx.toHand(ref.target("c"))], { c: ref.stored("c") }),
      ],
    ),
  },
  "Bolrac-Clan Basher": {},
  "Case of the Crimson Pulse": {
    abilities: [triggered(when.entersSelf, [fx.discard(1), fx.draw(2)], { label: "Défaussez une carte, puis piochez-en deux" })],
    // « Vous n'avez aucune carte en main » (`handAtMost` n'est lu qu'à la résolution d'un effet).
    caseToSolve: cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 1)),
    caseSolved: [
      triggered(when.yourUpkeep, [fx.discard(amount.cardsIn("hand")), fx.draw(2)], {
        label: "Défaussez votre main, puis piochez deux cartes",
      }),
    ],
  },
  "Caught Red-Handed": {
    cantBeCountered: true,
    spell: spell(
      [target.creature()],
      [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"]), fx.suspect(ref.target())],
    ),
  },
  "The Chase Is On": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"]), investigate()]),
  },
  "Concealed Weapon": {
    abilities: [
      staticAbility("attached", { power: 3 }, { label: "+3/+0" }),
      triggered(when.turnedFaceUp, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le à une créature que vous contrôlez",
      }),
    ],
  },
  "Connecting the Dots": {
    abilities: [
      // Approximation : la carte est exilée face visible.
      triggered(
        when.attacks({ types: ["Creature"], controller: "you" }),
        [fx.exileTop(ref.you, 1, "x"), fx.link(ref.stored("x"))],
        { label: "Exilez la carte du dessus de votre bibliothèque" },
      ),
      // Approximation : la main est défaussée à la résolution (et non en payant le coût).
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        effects: [fx.discard(amount.cardsIn("hand")), fx.toHand(ref.linked)],
        label: "Défaussez votre main : les cartes exilées avec cet enchantement vont dans la main de leur propriétaire",
      }),
    ],
  },
  "Convenient Target": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.attached)], { label: "Suspectez la créature enchantée" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      activated({
        mana: "{2}{R}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.self)],
        label: "Revient du cimetière dans la main",
      }),
    ],
  },
  "Cornered Crook": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, ARTIFACT, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.any()], [fx.damage(3, ref.target())])),
        ],
        { label: "Vous pouvez sacrifier un artefact : 3 blessures à n'importe quelle cible" },
      ),
    ],
  },
  "Crime Novelist": {
    abilities: [
      triggered(when.sacrifice(ARTIFACT), [fx.addCounters(ref.self, 1), fx.addMana("R")], {
        label: "Marqueur +1/+1 et {R}",
      }),
    ],
  },
  "Expedited Inheritance": {
    abilities: [
      triggered(
        when.dealtDamage({ types: ["Creature"] }),
        fx.mayFor(
          ref.controllerOf(ref.eventObject),
          "Exiler autant de cartes du dessus de votre bibliothèque (jouables jusqu'à la fin de votre prochain tour) ?",
          fx.exileTop(ref.controllerOf(ref.eventObject), amount.eventAmount, "x"),
          fx.grantPlay(ref.stored("x"), { forOwner: true, untilOwnersNextTurn: true }),
        ),
        { label: "Son contrôleur peut exiler autant de cartes du dessus de sa bibliothèque" },
      ),
    ],
  },
  "Felonious Rage": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.pump(ref.target(), 2, 0, ["haste"]),
        fx.emblem(
          "Felonious Rage",
          "When that creature dies this turn, create a 2/2 white and blue Detective creature token.",
          [triggered(when.dies({ linkedToSource: true }), [fx.createTokens(DETECTIVE)], { label: "Détective 2/2" })],
          false,
          true,
          "e",
        ),
        fx.link(ref.target(), ref.stored("e")),
      ],
    ),
  },
  "Frantic Scapegoat": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.self)], { label: "Suspectez-la" }),
      // « Une ou plusieurs » : un déclenchement par créature ; la condition, vérifiée de nouveau à la résolution (603.4),
      // fait qu'une seule d'entre elles peut devenir suspecte.
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        fx.may("Suspecter cette créature à la place ?", fx.suspect(ref.eventObject), fx.suspect(ref.self, false)),
        { condition: cond.sourceMatches({ suspected: true }), label: "Transférez la suspicion" },
      ),
    ],
  },
  Galvanize: {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(cond.drewAtLeast(2), fx.damage(5, ref.target())),
        ...fx.when(cond.not(cond.drewAtLeast(2)), fx.damage(3, ref.target())),
      ],
    ),
  },
  "Gearbane Orangutan": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Détruisez jusqu'à un artefact ciblé",
            [target.upTo(1, target.permanent("t", ["Artifact"], {}, "artefact"))],
            [fx.destroy(ref.target())],
          ),
          mode(
            "Sacrifiez un artefact : deux marqueurs +1/+1",
            [],
            [fx.sacrifice(ref.you, ARTIFACT, 1, { store: "s" }), ...fx.when(cond.v("s"), fx.addCounters(ref.self, 2))],
          ),
        ],
        { label: "Choisissez un mode" },
      ),
    ],
  },
  "Harried Dronesmith": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.createTokens(THOPTER, 1, undefined, "t"),
          fx.pump(ref.stored("t"), 0, 0, ["haste"]),
          fx.delayedAt("yourEndStep", [fx.sacrificeIt(ref.target("t"))], { t: ref.stored("t") }),
        ],
        { label: "Thopter 1/1 volant avec la célérité, sacrifié à votre étape de fin" },
      ),
    ],
  },
  "Innocent Bystander": {
    abilities: [
      triggered(when.isDealtDamage, [investigate()], {
        condition: cond.amountAtLeast(amount.eventAmount, 3),
        label: "3 blessures ou plus : enquêtez",
      }),
    ],
  },
  Knife: {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Pendant votre tour : +1/+0 et l'initiative" },
      ),
      clueAbility,
    ],
  },
  "Krenko, Baron of Tin Street": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: ARTIFACT },
        effects: [fx.addCountersAll({ subtype: "Goblin", controller: "you" }, 1)],
        label: "Un marqueur +1/+1 sur chaque Gobelin que vous contrôlez",
      }),
      triggered(
        when.zoneChange(["battlefield"], { to: ["graveyard"], filter: ARTIFACT }),
        fx.mayPay(
          "{R}",
          "Payer {R} pour créer un Gobelin 1/1 avec la célérité ?",
          fx.createTokens(GOBLIN, 1, undefined, "g"),
          fx.pump(ref.stored("g"), 0, 0, ["haste"]),
        ),
        { label: "Payez {R} : Gobelin 1/1 avec la célérité" },
      ),
    ],
  },
  "Krenko's Buzzcrusher": {
    abilities: [
      // Approximation : les terrains sont ciblés (un par joueur au plus) ; l'Oracle ne cible pas.
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target(), "d"),
          fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.stored("d"))),
        ],
        {
          targets: [onePerPlayer(target.permanent("t", ["Land"], { nonbasic: true }, "terrain non-base"))],
          label: "Détruisez jusqu'à un terrain non-base par joueur ; son contrôleur cherche un terrain de base",
        },
      ),
    ],
  },
  "Offender at Large": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.upTo(1, target.creature())],
        label: "+2/+0 à jusqu'à une créature",
      }),
      triggered(when.turnedFaceUp, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.upTo(1, target.creature())],
        label: "+2/+0 à jusqu'à une créature",
      }),
    ],
  },
  "Person of Interest": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.self), fx.createTokens(DETECTIVE)], {
        label: "Suspectez-la ; Détective 2/2",
      }),
    ],
  },
  "Pyrotechnic Performer": {
    abilities: [
      triggered(
        when.permanentTurnedFaceUp({ types: ["Creature"], controller: "you" }),
        [fx.damage(amount.powerOf(ref.eventObject), ref.eachOpponent, ref.eventObject)],
        { label: "Elle inflige autant de blessures que sa force à chaque adversaire" },
      ),
    ],
  },
  "Reckless Detective": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ARTIFACT, 1, { optional: true, store: "s" }),
          ...fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { optional: true, store: "d" })),
          ...fx.when(cond.any(cond.v("s"), cond.v("d")), fx.draw(1), fx.pump(ref.self, 2, 0)),
        ],
        { label: "Sacrifiez un artefact ou défaussez une carte : piochez, +2/+0" },
      ),
    ],
  },
  "Red Herring": {
    keywords: ["mustAttack"],
    abilities: [clueAbility],
  },
  "Rubblebelt Braggart": {
    abilities: [
      triggered(when.attacksSelf, fx.may("Suspecter cette créature ?", fx.suspect(ref.self)), {
        condition: cond.not(cond.sourceMatches({ suspected: true })),
        label: "Vous pouvez la suspecter",
      }),
    ],
  },
  "Suspicious Detonation": {
    cantBeCountered: true,
    costReduction: { generic: 3, condition: cond.sacrificedThisTurn },
    spell: spell([target.creature()], [fx.damage(4, ref.target())]),
  },
  "Torch the Witness": {
    spell: spell(
      [target.creature()],
      [fx.damageStoringExcess(amount.plus(amount.x, amount.x), ref.target(), "e"), ...fx.when(cond.v("e"), investigate())],
    ),
  },
};
