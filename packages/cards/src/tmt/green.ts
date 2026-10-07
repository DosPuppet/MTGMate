/**
 * Teenage Mutant Ninja Turtles — cartes vertes (lot A). Faufilement (Sneak) et cycle de type (Forestcycling) sont lus
 * dans le texte ; Disparition (Disappear) est une condition sur le journal du tour.
 */
import type { ObjectFilter, TargetSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  eventReplacement,
  FOOD,
  FOOD_ABILITY,
  fx,
  MUTAGEN,
  manaAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t"): TargetSpec => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "créature qu'un adversaire contrôle",
});
/** Disparition : un permanent a quitté le champ de bataille sous votre contrôle ce tour-ci. */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);
/** « Chaque fois qu'un artefact qu'un adversaire contrôle est mis dans un cimetière depuis le champ de bataille. » */
const OPPONENT_ARTIFACT_TO_GRAVEYARD: TriggerSpec = {
  on: "leaves",
  who: { types: ["Artifact"], controller: "opponent" },
  to: "graveyard",
};
const MUTAGEN_LABEL = "Un jeton Mutagène";

export const GREEN: Record<string, CardScript> = {
  "Courier of Comestibles": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "Chercher une carte de Nourriture dans votre bibliothèque ?",
            fx.search({ subtype: "Food" }, { to: "hand" }, 1, undefined, "found"),
          ),
          ...fx.when(cond.not(cond.amountAtLeast(amount.refCount(ref.stored("found")), 1)), fx.createTokens(FOOD)),
        ],
        { label: "Cherchez une Nourriture ; sinon, créez un jeton Nourriture" },
      ),
    ],
  },
  "Cowabunga!": {
    spell: spell(
      [],
      [
        fx.lookAtTop(4, {
          filter: { anyOf: [{ anySubtype: ["Mutant", "Ninja", "Turtle"] }, { types: ["Land"] }] },
          rest: "bottom",
        }),
      ],
    ),
  },
  // Contact mortel : lu dans le texte.
  "Frog Butler": {
    abilities: [
      manaAbility([...ANY_COLOR]),
      activated({
        mana: "{2}",
        effects: [fx.pump(ref.self, 0, 0, ["reach"])],
        label: "Gagne la portée jusqu'à la fin du tour",
      }),
    ],
  },
  // Piétinement : lu dans le texte.
  "Groundchuck & Dirtbag": {
    abilities: [
      // Capacité de mana déclenchée (605.1b) : un remplacement de mana (R1, famille I), comme Badgermole Cub.
      eventReplacement({
        event: "mana",
        source: { types: ["Land"] },
        to: "you",
        extraMana: "G",
        modify: { add: 1 },
        label: "Un terrain engagé pour du mana : {G} de plus",
      }),
    ],
  },
  // Flash : lu dans le texte.
  "Guac & Marshmallow Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2), fx.untap(ref.target())], {
        targets: [target.creature()],
        label: "+2/+2 jusqu'à la fin du tour, puis dégagez-la",
      }),
      FOOD_ABILITY,
    ],
  },
  "Michelangelo, Game Master": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: DISAPPEAR,
        label: "Disparition — un marqueur +1/+1 sur Michelangelo",
      }),
    ],
  },
  // Faufilement {2}{G}{G} : lu dans le texte.
  "Michelangelo, Improviser": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield" },
            { min: 0, prompt: "Vous pouvez mettre une carte de créature de votre main sur le champ de bataille" },
          ),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, prompt: "Vous pouvez mettre une carte de terrain de votre main sur le champ de bataille" },
          ),
        ],
        { label: "Une créature et/ou un terrain de votre main sur le champ de bataille" },
      ),
    ],
  },
  "Michelangelo, Mutant BFF": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "any" },
        { addBlockRules: [block.atMost(1)] },
        { label: "Vos créatures avec un marqueur ne peuvent pas être bloquées par plus d'une créature" },
      ),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL }),
      triggered(when.attacksSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL }),
    ],
  },
  "Michelangelo, Weirdness to 11": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL }),
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "Un marqueur +1/+1 de plus sur vos créatures",
      }),
    ],
  },
  // Portée : lue dans le texte.
  "Mona Lisa, Science Geek": {
    abilities: [manaAbility([...ANY_COLOR], 1, { selfPower: true })],
  },
  "Mutant Chain Reaction": {
    spell: spell(
      [
        target.upTo(1, {
          id: "t",
          label: "artefact, enchantement ou créature avec le vol",
          filter: {
            objects: { anyOf: [{ types: ["Artifact", "Enchantment"] }, { types: ["Creature"], keyword: "flying" }] },
          },
        }),
      ],
      [fx.destroy(ref.target()), fx.createTokens(MUTAGEN)],
    ),
  },
  // Faufilement {2}{G} : lu dans le texte.
  "New Generation's Technique": {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)]),
  },
  // Équiper {3} : lu dans le texte.
  "Novel Nunchaku": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.attach(ref.target("c")),
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.attached), 1),
            fx.reflexive([target.upTo(1, OPPONENT_CREATURE("d"))], [fx.fight(ref.attached, ref.target("d"))]),
          ),
        ],
        {
          targets: [YOUR_CREATURE("c")],
          label: "S'attache à une de vos créatures, qui se bat contre une créature adverse",
        },
      ),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["trample"] }, { label: "+1/+1 et piétinement" }),
    ],
  },
  "Party Dude": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD, 1, ref.eachPlayer)], {
        label: "Chaque joueur crée un jeton Nourriture",
      }),
    ],
    classLevels: [
      [
        triggered(OPPONENT_ARTIFACT_TO_GRAVEYARD, [fx.draw(1)], {
          label: "Un artefact adverse va au cimetière : piochez",
        }),
      ],
      [
        // « Chaque fois qu'un ou plusieurs de vos adversaires sont attaqués » : par n'importe quel joueur, et un joueur
        // (pas un planeswalker).
        triggered(
          when.attackWith(1, { attacking: "opponent" }, true),
          [fx.pump(ref.target(), amount.cardsIn("hand"), amount.cardsIn("hand"))],
          {
            targets: [target.upTo(1, target.creature("t", { attacking: true }))],
            label: "Une créature attaquante gagne +X/+X (cartes en main)",
          },
        ),
      ],
    ],
  },
  // Portée, piétinement : lus dans le texte.
  "Primordial Pachyderm": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "Gagnez 2 PV" })],
  },
  "Ragamuffin Raptor": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.upTo(
            1,
            target.cardInGraveyard(
              "t",
              { anyOf: [{ types: ["Creature"] }, { subtype: "Food" }] },
              "you",
              "carte de créature ou de Nourriture de votre cimetière",
            ),
          ),
        ],
        label: "Renvoie une carte de créature ou de Nourriture de votre cimetière en main",
      }),
    ],
  },
  // Cycle de Forêt {2} : lu dans le texte.
  "Rocksteady, Crash Courser": {
    abilities: [
      blockAbility(block.atMost(1)),
      staticAbility(
        { types: ["Creature"], subtype: "Boar", controller: "you" } satisfies ObjectFilter,
        { addBlockRules: [block.atMost(1)] },
        { label: "Vos Sangliers ne peuvent pas être bloqués par plus d'une créature" },
      ),
    ],
  },
  "Saved by the Shell": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Turtle" }) },
    spell: spell(
      [YOUR_CREATURE()],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["trample", "hexproof", "indestructible"])],
    ),
  },
  Tenderize: {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  // Vol : lu dans le texte.
  "Transdimensional Bovine": {
    abilities: [manaAbility([...ANY_COLOR], 2)],
  },
  // Flash : lu dans le texte.
  "Turtle Power!": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Turtle", controller: "you" },
        { power: 2, toughness: 2 },
        {
          label: "Vos Tortues gagnent +2/+2",
        },
      ),
    ],
  },
  "Venus, Torn Between Worlds": {
    abilities: [
      triggered(when.isDealtDamage, [fx.addCounters(ref.self, amount.eventAmount)], {
        label: "Autant de marqueurs +1/+1 que de blessures subies",
      }),
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you", withCounter: "any" }, true),
        fx.mayPay("{U}", "Payer {U} pour piocher une carte ?", fx.draw(1)),
        { label: "Une de vos créatures avec un marqueur blesse un joueur : payez {U}, piochez" },
      ),
    ],
  },
  // Piétinement : lu dans le texte.
  "West Wind Avatar": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(
          trigger,
          [
            fx.sacrifice(ref.you, { anyOf: [{ token: true }, { types: ["Land"] }] }, 1, { optional: true, store: "s" }),
            ...fx.when(cond.v("s"), fx.gainLife(3)),
          ],
          { label: "Vous pouvez sacrifier un jeton ou un terrain : gagnez 3 PV" },
        ),
      ),
      triggered(when.yourEndStep, [fx.draw(1)], { condition: DISAPPEAR, label: "Disparition — piochez une carte" }),
    ],
  },
  "Zoo Escapees": {
    abilities: [triggered(when.leavesSelf, [fx.createTokens(MUTAGEN)], { label: MUTAGEN_LABEL })],
  },
};
