/**
 * The Hobbit — cartes vertes (lot A). Landfall (`when.landfall`), Férocité (`cond.ferocious`), Ours et Elfes. Les
 * Aventures ont une entrée par face (la créature sous son nom, le sort d'Aventure sous le sien).
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  BEAR,
  block,
  blockAbility,
  type CardScript,
  chapter,
  cond,
  costReducer,
  ELF,
  fx,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const YOUR_LANDS: ObjectFilter = { types: ["Land"], controller: "you" };
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t") => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "créature qu'un adversaire contrôle",
});
/** Aucun sort de créature lancé par vous ce tour-ci (Radagast : « le premier sort de créature »). */
const NO_CREATURE_SPELL_YET = cond.not(
  cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Creature"] }), 1),
);

export const GREEN: Record<string, CardScript> = {
  Attercop: {
    abilities: [triggered(when.landfall, [fx.pump(ref.self, 1, 1)], { label: "Landfall — +1/+1 jusqu'à la fin du tour" })],
  },
  "Bejeweled Warg": {
    abilities: [
      triggeredModal(
        when.combatDamageToPlayer,
        [
          mode(
            "Un marqueur +1/+1 sur un Loup",
            [target.creature("t", { subtype: "Wolf", controller: "you" })],
            [fx.addCounters(ref.target(), 1)],
          ),
          mode("Un jeton Trésor", [], [fx.createTokens(TREASURE)]),
        ],
        { label: "Blessures de combat à un joueur : marqueur sur un Loup ou Trésor" },
      ),
    ],
  },
  // Aventure : la créature (piétinement lu dans le texte) et le sort d'Aventure.
  "Beorn, Reluctant Host": {},
  "Till and Tend": { spell: spell([], [fx.extraLandThisTurn]) },
  "Beorn the Fierce": {
    abilities: [
      staticAbility(
        { subtype: "Bear", controller: "you", other: true },
        { power: 2, toughness: 2 },
        { label: "Vos autres Ours ont +2/+2" },
      ),
      triggered(
        when.yourCombat,
        [
          fx.counters(ref.target(), "trample", 1),
          fx.modify(ref.target(), { addSubtypes: ["Bear"] }, "permanent"),
          ...fx.when(cond.controls({ subtype: "Bear" }, 3), fx.draw(2)),
        ],
        {
          targets: [target.upTo(1, YOUR_CREATURE())],
          label: "Marqueur de piétinement, devient un Ours ; trois Ours : piochez deux cartes",
        },
      ),
    ],
  },
  "Beorn's Hospitality": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1)], {
        targets: [YOUR_CREATURE()],
        label: "Landfall — un marqueur +1/+1 sur une créature que vous contrôlez",
      }),
      activated({
        mana: "{5}{G}{G}",
        effects: [
          fx.modify(
            ref.self,
            {
              addTypes: ["Creature"],
              addSubtypes: ["Bear"],
              addAbilities: [
                staticAbility(
                  "self",
                  { setPower: 1, setToughness: 1 },
                  { per: YOUR_LANDS, label: "F/E égales au nombre de terrains que vous contrôlez" },
                ),
              ],
            },
            "permanent",
          ),
        ],
        label: "Devient une créature Ours (F/E : vos terrains)",
      }),
    ],
  },
  "Boughside Wanderers": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(4, { filter: { permanent: true }, count: 1, to: { to: "hand" }, rest: "bottom" })],
        { label: "Une carte de permanent parmi les quatre du dessus" },
      ),
      triggered(when.landfall, [fx.pump(ref.self, 2, 2)], { label: "Landfall — +2/+2 jusqu'à la fin du tour" }),
    ],
  },
  "Cantankerous Keepers": {
    // Affinité pour les Elfes.
    costReduction: { generic: amount.count({ subtype: "Elf", controller: "you" }) },
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m", filter: { subtype: "Elf" } }),
          fx.toHand(ref.filtered(ref.stored("m"), { subtype: "Elf" })),
        ],
        {
          label: "Meulez quatre cartes ; les cartes d'Elfe meulées vont en main",
        },
      ),
    ],
  },
  "Dancing from Dark to Dawn": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.addCounters(ref.target(), amount.manaValueOf(ref.eventObject))],
        {
          targets: [YOUR_CREATURE()],
          label: "Sort de créature : X marqueurs +1/+1 (sa valeur de mana)",
        },
      ),
      triggered(when.landfall, [fx.createTokens(BEAR)], { label: "Landfall — un Ours 2/2" }),
    ],
  },
  "Down in the Valley": {
    abilities: [
      chapter([1], [fx.search(BASIC_LAND, { to: "hand" })], { label: "I — Un terrain de base en main" }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [triggered(when.landfall, [fx.createTokens(ELF)], { label: "Landfall — un Elfe 1/1" })],
            },
            "permanent",
          ),
        ],
        { label: "II — Landfall : un Elfe 1/1" },
      ),
      chapter([3, 4], [fx.pumpAll({ subtype: "Elf", controller: "you" }, 1, 0, ["vigilance"])], {
        label: "III, IV — Vos Elfes ont +1/+0 et la vigilance",
      }),
    ],
  },
  "Galion, Elvenking's Butler": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // F/E de base X/X (X : force de Galion, couche 7b), puis l’écart endurance − force en couche 7c (approximation).
          fx.modify(ref.target(), {}, "endOfTurn", amount.powerOf(ref.self)),
          fx.pump(ref.target(), 0, amount.plus(amount.toughnessOf(ref.self), amount.neg(amount.powerOf(ref.self)))),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Une autre créature prend les F/E de Galion",
        },
      ),
    ],
  },
  "Gigantic Big Bear": { cantBeCountered: true },
  "Guardian of the Halls": {
    abilities: [activated({ mana: "{5}{G}{G}", effects: [fx.addCounters(ref.self, 3)], label: "Trois marqueurs +1/+1" })],
  },
  "Little Bear": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.untap(ref.target()), ...fx.when(cond.targetMatches("t", { subtype: "Bear" }), fx.addCounters(ref.target(), 1))],
        {
          targets: [target.creature("t", { controller: "you", other: true })],
          label: "Dégage une autre créature ; un marqueur +1/+1 si c'est un Ours",
        },
      ),
    ],
  },
  "Mirkwood Pathmaker": { cdaPT: amount.count(YOUR_LANDS) },
  "Nasty Little Rabbit": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: cond.ferocious,
        label: "Férocité — un marqueur +1/+1",
      }),
    ],
  },
  "The Notary Hobbits": {
    abilities: [
      triggered(when.entersSelf, [fx.copyToken(ref.self, { count: 2, nonlegendary: true })], {
        condition: cond.sourceMatches({ token: false }),
        label: "Deux jetons copies non légendaires",
      }),
      manaAbility("C", 1, { per: { subtype: "Halfling", controller: "you" } }),
    ],
  },
  "Old Fat Spider": {
    abilities: [
      blockAbility(block.notBy({ types: ["Creature"], maxPower: 2 }, "Imblocable par les créatures de force 2 ou moins")),
      triggered({ on: "becomesTarget", who: "self", byOpponent: true }, [fx.draw(1)], {
        label: "Ciblée par un adversaire : piochez une carte",
      }),
    ],
  },
  "Part in Friendship": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false }),
        [
          // On repère d'abord la carte de créature, puis on la révèle de nouveau pour la déplacer (le reste au-dessous).
          fx.revealUntilN({ types: ["Creature"] }, 1, undefined, "r"),
          ...fx.when(
            cond.not(cond.amountGreater(amount.manaValueOf(ref.stored("r")), amount.count(YOUR_LANDS))),
            fx.revealUntil({ types: ["Creature"] }, { to: "battlefield" }),
          ),
          ...fx.when(
            cond.amountGreater(amount.manaValueOf(ref.stored("r")), amount.count(YOUR_LANDS)),
            fx.revealUntil({ types: ["Creature"] }, { to: "hand" }),
          ),
        ],
        {
          oncePerTurn: true,
          label: "Révélez jusqu'à une créature : en jeu si sa VM ≤ vos terrains, sinon en main",
        },
      ),
    ],
  },
  Quarrel: {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Radagast of Rhosgobel": {
    abilities: [
      costReducer({ types: ["Creature"] }, 2, "Le premier sort de créature du tour coûte {2} de moins", {
        condition: NO_CREATURE_SPELL_YET,
      }),
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["flash"] },
        condition: NO_CREATURE_SPELL_YET,
        label: "Le premier sort de créature du tour a le flash",
      }),
    ],
  },
  "Through the Forest Gate": {
    spell: spell(
      [],
      [
        fx.lookAtTop(20, {
          filter: { types: ["Land"] },
          count: 20,
          to: { to: "battlefield", tapped: true },
          rest: "top",
        }),
        fx.shuffle(ref.you),
        fx.gainLife(8),
      ],
    ),
  },
  "Troll Negotiations": {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.addCounters(ref.target("a"), 2), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Warg Tactics": {
    spell: modal(
      mode(
        "Détruire une créature avec le vol",
        [{ ...target.creature("t", { keyword: "flying" }), label: "créature avec le vol" }],
        [fx.destroy(ref.target())],
      ),
      mode(
        "Un marqueur +1/+1, piétinement et défense talismanique",
        [YOUR_CREATURE()],
        [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["trample", "hexproof"])],
      ),
    ),
  },
  Wargling: {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 1, 0), fx.pumpAll(YOUR_CREATURES, 0, 0, ["trample"])], {
        condition: cond.ferocious,
        label: "Férocité — +1/+0 ; vos créatures ont le piétinement",
      }),
    ],
  },
  "Wilderland Scrounger": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCountersAll(YOUR_CREATURES, 1)], {
        condition: cond.ferocious,
        label: "Férocité — un marqueur +1/+1 sur chacune de vos créatures",
      }),
    ],
  },
  "Wood Elves": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ subtype: "Forest" }, { to: "battlefield" })], {
        label: "Une carte de Forêt en jeu",
      }),
    ],
  },
  "Woodland Weavemaster": {
    abilities: [
      triggered(when.enters({ subtype: "Elf", controller: "you", other: true }), [fx.pump(ref.self, 1, 1)], {
        label: "Un autre Elfe arrive : +1/+1 jusqu'à la fin du tour",
      }),
      manaAbility([...ANY_COLOR], 1, {
        selfPower: true,
        restriction: { spell: { subtype: "Elf" }, abilityOfSource: { subtype: "Elf" } },
      }),
    ],
  },
};
