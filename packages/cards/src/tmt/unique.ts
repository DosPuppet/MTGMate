/** Teenage Mutant Ninja Turtles — cartes uniques (lot C). */
import { parseManaCost } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  playerStatic,
  protection,
  RAT,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Disparition : « si un permanent a quitté le champ de bataille sous votre contrôle ce tour-ci ». */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);

export const UNIQUE: Record<string, CardScript> = {
  "April O'Neil, Hacktivist": {
    abilities: [
      triggered(when.yourEndStep, [fx.draw(amount.turnEvents({ event: "cast", who: "you", distinct: "type" }))], {
        label: "Piochez une carte par type de carte parmi les sorts que vous avez lancés ce tour-ci",
      }),
    ],
  },
  "Fugitive Droid": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        {
          condition: cond.amountAtLeast(
            amount.turnEvents({ event: "zone", to: "battlefield", types: ["Artifact"], who: "you" }),
            1,
          ),
          label: "Imblocable si un artefact est arrivé sous votre contrôle ce tour-ci",
        },
      ),
      activated({
        mana: "{U}",
        sacrifice: true,
        targets: [
          {
            id: "t",
            label: "sort qui cible un artefact ou une créature que vous contrôlez",
            filter: { spells: {}, spellsTargeting: { types: ["Artifact", "Creature"], controller: "you" } },
          },
        ],
        effects: [fx.counter(ref.target())],
        label: "Contrecarrez un sort qui cible un de vos artefacts ou créatures",
      }),
    ],
  },
  "Mondo Gecko": {
    abilities: [
      activated({
        mana: "{1}",
        discard: 1,
        effects: [
          fx.chooseForSelf("color"),
          fx.modify(ref.self, {
            setColorsChosen: true,
            addProtections: [protection.hexproofFrom({ colorChosen: true }, "Défense talismanique contre la couleur choisie")],
          }),
        ],
        label: "Devient de la couleur choisie et gagne la défense talismanique contre elle",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(amount.colorsAmong())], {
        label: "Piochez une carte par couleur parmi vos permanents",
      }),
    ],
  },
  "Ninja Teen": {
    abilities: [
      triggered(when.leaves({ types: ["Creature"], controller: "you" }), [fx.loseLife(1, ref.eachOpponent)], {
        label: "Une de vos créatures part : chaque adversaire perd 1 PV",
      }),
    ],
    classLevels: [
      [
        staticAbility(
          { types: ["Creature"], controller: "you" },
          { power: 1, addKeywords: ["menace"] },
          {
            label: "Vos créatures ont +1/+0 et la menace",
          },
        ),
      ],
      [
        playerStatic({
          playFrom: { zone: "graveyard", filter: { types: ["Creature"] }, what: "spells", sneak: parseManaCost("{3}{B}") },
          label: "Les cartes de créature de votre cimetière ont le faufilement {3}{B}",
        }),
      ],
    ],
  },
  "Rat King, Verminister": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(RAT), fx.addCounters(ref.self, 1)], {
        condition: DISAPPEAR,
        label: "Disparition — Un Rat 1/1 et un marqueur +1/+1",
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Rat" }, count: 3, includeSelf: true },
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        effects: [fx.moveTo(ref.sameNameInGraveyard(ref.target()), { to: "battlefield", tapped: true })],
        label: "Sacrifiez trois Rats : la carte ciblée et ses homonymes reviennent engagés",
      }),
    ],
  },
  "Don & Raph, Hard Science": {
    // Menace : lue dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          {
            op: "playerEffect",
            ability: {
              nextSpell: { filter: { notTypes: ["Creature"] }, reduce: amount.count({ types: ["Artifact"], controller: "you" }) },
            },
            once: true,
          },
        ],
        { label: "Votre prochain sort non-créature ce tour-ci a l'affinité pour les artefacts" },
      ),
    ],
  },
  "Mikey & Don, Party Planners": {
    // Garde {2} : lue dans le texte.
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Vous pouvez regarder la carte du dessus de votre bibliothèque" }),
      playerStatic({
        playFrom: {
          zone: "libraryTop",
          filter: { anyOf: [{ types: ["Land"] }, { anySubtype: ["Mutant", "Ninja", "Turtle"] }] },
          counters: 1,
        },
        label: "Jouez des terrains et lancez des sorts de Mutant, Ninja ou Tortue du dessus de votre bibliothèque",
      }),
    ],
  },
  "North Wind Avatar": {
    // Vol : lu dans le texte. Le moteur n'a pas de zone « hors de la partie » : la capacité d'arrivée est sans effet.
    abilities: [
      triggered(when.entersSelf, [], {
        condition: cond.wasCast,
        label: "Si vous l'avez lancé : une carte que vous possédez hors de la partie (aucune ici)",
      }),
    ],
  },
};
