/**
 * Marvel Super Heroes — cartes vertes (lot A). La montée en puissance (Power-up) s'écrit `activated({ powerUp: true })` ;
 * le travail d'équipe (Teamwork) est lu dans le texte (kicker), et `cond.kicked` / `amount.kicked` lisent s'il a été payé.
 */
import type { ModeDef, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  castPermission,
  chapter,
  cond,
  cost,
  eventReplacement,
  FOOD,
  fx,
  HERO,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  SQUIRREL,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t") => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "créature qu'un adversaire contrôle",
});
/** Deux cartes de créature ou plus dans votre cimetière. */
const TWO_CREATURE_CARDS = cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 2);

/** Zabu (Ka-Zar) : Chat 2/2 vert légendaire, « Landfall — un marqueur +1/+1 sur Zabu ». */
const ZABU: TokenSpec = {
  name: "Zabu",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Cat"],
  power: 2,
  toughness: 2,
  legendary: true,
  abilities: [triggered(when.landfall, [fx.addCounters(ref.self, 1)], { label: "Landfall — un marqueur +1/+1 sur Zabu" })],
  text: "Landfall — Whenever a land you control enters, put a +1/+1 counter on Zabu.",
};

/** Moloïde (Mole Man) : Sbire 1/1 vert, « quand ce jeton attaque, vous pouvez meuler une carte ». */
const MOLOID: TokenSpec = {
  name: "Moloid",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Minion"],
  power: 1,
  toughness: 1,
  abilities: [
    triggered(when.attacksSelf, [...fx.may("Meuler une carte ?", fx.mill(1))], { label: "Vous pouvez meuler une carte" }),
  ],
  text: "Whenever this token attacks, you may mill a card.",
};

/** The Tiger God (White Tiger) : Chat Dieu 4/4 vert légendaire, bloqué par une seule créature au plus. */
const TIGER_GOD: TokenSpec = {
  name: "The Tiger God",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Cat", "God"],
  power: 4,
  toughness: 4,
  legendary: true,
  abilities: [blockAbility(block.atMost(1))],
  text: "The Tiger God can't be blocked by more than one creature.",
};

/** « Choisissez jusqu'à deux » : chaque mode seul, puis chaque paire (identifiants de cibles distincts d'un mode à l'autre). */
function upToTwo(...modes: ModeDef[]): ModeDef[] {
  const pairs: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1))
      pairs.push({
        label: `${a.label} + ${b.label}`,
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
  });
  return [...modes, ...pairs];
}

/** Montée en puissance : « mettez N marqueurs +1/+1 sur [cette créature] » et d'autres effets. */
const powerUp = (mana: string, label: string, effects: Parameters<typeof activated>[0]["effects"], extra = {}) =>
  activated({ mana, powerUp: true, effects, label: `Montée en puissance : ${label}`, ...extra });

export const GREEN: Record<string, CardScript> = {
  "Ant-Man's Army": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [mode("Un jeton Nourriture", [], [fx.createTokens(FOOD)]), mode("Un jeton Trésor", [], [fx.createTokens(TREASURE)])],
        { label: "Une Nourriture ou un Trésor" },
      ),
    ],
  },
  "Call Damage Control": {
    spell: modal(
      ...upToTwo(
        mode(
          "Une carte d'artefact",
          [target.cardInGraveyard("a", { types: ["Artifact"] }, "you", "carte d'artefact de votre cimetière")],
          [fx.toHand(ref.target("a"))],
        ),
        mode(
          "Une carte de créature",
          [target.cardInGraveyard("c", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
          [fx.toHand(ref.target("c"))],
        ),
        mode(
          "Une carte d'enchantement",
          [target.cardInGraveyard("e", { types: ["Enchantment"] }, "you", "carte d'enchantement de votre cimetière")],
          [fx.toHand(ref.target("e"))],
        ),
        mode(
          "Une carte de terrain",
          [target.cardInGraveyard("l", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
          [fx.toHand(ref.target("l"))],
        ),
      ),
    ),
  },
  "Claim the Kingdom": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1), fx.counters(ref.self, "plan")], {
        targets: [YOUR_CREATURE()],
        label: "Landfall — un marqueur +1/+1 sur une de vos créatures et un marqueur de plan",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [fx.sacrificeIt(ref.self), fx.reflexive([YOUR_CREATURE("u")], [fx.counters(ref.target("u"), "indestructible")])],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Quatrième marqueur : sacrifiez-le, un marqueur d'indestructible sur une de vos créatures",
        },
      ),
    ],
  },
  "Doc Samson, Super Psychiatrist": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { permanent: true, controller: "you" },
        modify: { add: 1 },
        label: "Un marqueur de plus de chaque sorte sur vos permanents",
      }),
      manaAbility([...ANY_COLOR], 1, { selfPower: true }),
    ],
  },
  "Earth's Mightiest Heroes": {
    // Travail d'équipe 5 : lu dans le texte ; payé, n'importe quel nombre de cartes de créature.
    spell: spell(
      [],
      [
        fx.lookAtTop(8, {
          filter: { types: ["Creature"] },
          count: amount.kicked(8, 1),
          to: { to: "battlefield" },
          rest: "graveyard",
        }),
      ],
    ),
  },
  "Epic Fight": {
    spell: modal(
      mode("Double la force et l'endurance", [target.creature("t")], [fx.doublePT(ref.target("t"))]),
      mode("Combat", [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")], [fx.fight(ref.target("a"), ref.target("b"))]),
      mode(
        "Les deux",
        [target.creature("t"), YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
        [fx.doublePT(ref.target("t")), fx.fight(ref.target("a"), ref.target("b"))],
      ),
    ),
  },
  "Go Nuts!": {
    // Travail d'équipe 3 : lu dans le texte ; payé, on choisit les deux modes.
    spell: modal(
      mode("Un marqueur +1/+1", [target.creature("t")], [fx.addCounters(ref.target("t"), 1)]),
      mode("Combat", [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")], [fx.fight(ref.target("a"), ref.target("b"))]),
      {
        ...mode(
          "Les deux (travail d'équipe payé)",
          [target.creature("t"), YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
          [fx.addCounters(ref.target("t"), 1), fx.fight(ref.target("a"), ref.target("b"))],
        ),
        condition: cond.kicked,
      },
    ),
  },
  "Guerrilla Gorilla": {
    abilities: [
      activated({
        sacrifice: true,
        sorcerySpeed: true,
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { notTypes: ["Creature"] },
            "artefact non-créature ou enchantement non-créature",
          ),
        ],
        effects: [fx.destroy(ref.target())],
        label: "Sacrifiez-le : détruit un artefact ou un enchantement non-créature",
      }),
    ],
  },
  "Hellcat, Undying Vigilante": {
    abilities: [
      triggered(
        when.diesSelf,
        [
          fx.moveTo(ref.selfCard, { to: "battlefield", counters: { kind: "+1/+1", n: 1 } }, { name: "h" }),
          fx.modify(ref.stored("h"), { loseAllAbilities: true, addKeywords: ["haste"] }, "permanent"),
        ],
        { label: "Revient avec un marqueur +1/+1, sans capacités mais avec la célérité" },
      ),
    ],
  },
  "Hercules, Prince of Power": {
    abilities: [
      powerUp("{4}{G}", "un marqueur +1/+1, vigilance, indestructible et célérité", [
        fx.addCounters(ref.self, 1),
        fx.modify(ref.self, { addKeywords: ["vigilance", "indestructible", "haste"] }),
      ]),
    ],
  },
  "Heroic Feast": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" }),
      triggered(
        when.gainLife,
        [
          fx.reflexive(
            [{ ...target.upTo(1, YOUR_CREATURE()), countAmount: amount.eventAmount }],
            [fx.addCounters(ref.target(), 1)],
          ),
        ],
        { label: "Un marqueur +1/+1 sur jusqu'à autant de vos créatures que de PV gagnés" },
      ),
    ],
  },
  "Hulkling, Burgeoning Bruiser": {
    abilities: [
      triggered(when.enters({ ...CREATURES_YOU_CONTROL, other: true }), [fx.addCounters(ref.self, 1)], {
        condition: cond.any(
          cond.amountAtLeast(amount.plus(amount.powerOf(ref.eventObject), amount.neg(amount.powerOf(ref.self))), 1),
          cond.amountAtLeast(amount.plus(amount.toughnessOf(ref.eventObject), amount.neg(amount.toughnessOf(ref.self))), 1),
        ),
        label: "Une créature plus forte ou plus endurante arrive : un marqueur +1/+1",
      }),
    ],
  },
  "Ka-Zar of the Savage Land": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Vous pouvez regarder la carte du dessus" }),
      playerStatic({ playFrom: { zone: "libraryTop", what: "lands" }, label: "Jouez des terrains depuis le dessus" }),
      triggered(when.entersSelf, [fx.createTokens(ZABU)], { label: "Zabu, Chat 2/2 légendaire" }),
    ],
  },
  "Knight of Wundagore": {
    // Approximation : « vous mettez un marqueur +1/+1 sur une autre créature » est lu comme « un marqueur +1/+1 est mis
    // sur une autre créature que vous contrôlez ».
    abilities: [
      triggered(when.countersPut({ ...CREATURES_YOU_CONTROL, other: true }, "+1/+1"), [fx.addCounters(ref.self, 1)], {
        oncePerTurn: true,
        label: "Un marqueur +1/+1 sur une autre créature : un sur celle-ci (une fois par tour)",
      }),
    ],
  },
  "Mister Hyde, Monster Within": {
    abilities: [
      triggeredModal(
        when.yourUpkeep,
        [
          mode("Un marqueur +1/+1 sur Mister Hyde", [], [fx.addCounters(ref.self, 1)]),
          // Approximation : la sorte de marqueur retirée n'est pas choisie (loyauté, puis +1/+1, puis les autres).
          mode(
            "Retirez un marqueur d'une de vos créatures : piochez",
            [],
            [
              fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], withCounter: "any" }), ref.you, "c"),
              fx.removeCounters(ref.stored("c"), 1, undefined, "removed"),
              ...fx.when(cond.v("removed"), fx.draw(1)),
            ],
          ),
        ],
        { label: "Un marqueur +1/+1, ou retirez un marqueur pour piocher" },
      ),
    ],
  },
  "Mole Man, Moloid Master": {
    abilities: [
      playerStatic({ playFrom: { zone: "graveyard", what: "lands" }, label: "Jouez des terrains depuis votre cimetière" }),
      triggered(when.landfall, [fx.createTokens(MOLOID)], { label: "Landfall — un Moloïde 1/1" }),
    ],
  },
  "Pet Avengers": {
    abilities: [powerUp("{6}{G}", "un marqueur +1/+1 et un Héros 3/2", [fx.addCounters(ref.self, 1), fx.createTokens(HERO)])],
  },
  "Punishing Punch": {
    costReduction: { generic: 2, condition: TWO_CREATURE_CARDS },
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [
        fx.damage(
          amount.plus(amount.powerOf(ref.target("a")), amount.powerOf(ref.target("a"))),
          ref.target("b"),
          ref.target("a"),
        ),
      ],
    ),
  },
  "Rapid Rescue": {
    spell: spell(
      [],
      [
        fx.mill(2, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          { count: 1, min: 0, pool: ref.stored("m"), prompt: "Vous pouvez prendre une carte de permanent meulée" },
        ),
        fx.gainLife(2),
      ],
    ),
  },
  "Reptil, Dinomorpher": {
    abilities: [
      activated({
        mana: "{3}",
        effects: [
          fx.modify(ref.self, {
            setSubtypes: ["Dinosaur", "Hero"],
            setPower: 3,
            setToughness: 5,
            addKeywords: ["reach", "vigilance"],
          }),
        ],
        label: "Brontosaure — Dinosaure Héros 3/5 avec la portée et la vigilance",
      }),
      activated({
        mana: "{6}",
        effects: [
          fx.modify(ref.self, { setSubtypes: ["Dinosaur", "Hero"], setPower: 6, setToughness: 6, addKeywords: ["trample"] }),
        ],
        label: "Tyrannosaure — Dinosaure Héros 6/6 avec le piétinement",
      }),
    ],
  },
  "Restorative Technique": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c"))],
      [
        fx.gainLife(2, ref.target("p")),
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.target("p")),
        fx.addCounters(ref.target("c"), 1),
      ],
    ),
  },
  "Rick Jones, Destined Sidekick": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        effects: [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { anyOf: [{ subtype: "Hero" }, { types: ["Enchantment"] }] },
            { to: "hand" },
            {
              count: 1,
              min: 0,
              pool: ref.stored("m"),
              prompt: "Vous pouvez prendre une carte de Héros ou d'enchantement meulée",
            },
          ),
        ],
        label: "Meulez quatre cartes, un Héros ou un enchantement en main",
      }),
    ],
  },
  "Serpent Specialist": {
    abilities: [powerUp("{3}{G}", "deux marqueurs +1/+1", [fx.addCounters(ref.self, 2)])],
  },
  "She-Hulk, Jade Defender": {
    abilities: [
      powerUp(
        "{4}{G}{G}",
        "détruit un artefact ou un enchantement, un marqueur +1/+1",
        [fx.destroy(ref.target()), fx.addCounters(ref.self, 1)],
        { targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))] },
      ),
    ],
  },
  "Super Strength": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 4, toughness: 4, addKeywords: ["trample", "ward"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "+4/+4, piétinement et garde {1}" },
      ),
    ],
  },
  "The Thing, Ben Grimm": {
    // Approximation : « à un joueur » est lu comme « à un adversaire » (des blessures de vos Héros à vous-même ne
    // déclenchent pas).
    abilities: [
      triggered(when.dealsDamage({ subtype: "Hero", controller: "you" }, { toOpponent: true }), [fx.addCounters(ref.self, 2)], {
        batched: true,
        label: "Des Héros blessent un joueur : deux marqueurs +1/+1",
      }),
    ],
  },
  "Tigra, Feline Fury": {
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "Vous gagnez des PV : un marqueur +1/+1" })],
  },
  "Training Regimen": {
    abilities: [
      staticAbility(
        { ...CREATURES_YOU_CONTROL, withCounter: "+1/+1" },
        { addKeywords: ["trample"] },
        { label: "Vos créatures avec un marqueur +1/+1 ont le piétinement" },
      ),
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [YOUR_CREATURE()],
        label: "Un marqueur +1/+1 sur une de vos créatures",
      }),
    ],
  },
  "The Unbeatable Squirrel Girl": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SQUIRREL)], { label: "Un Écureuil 1/1" }),
      triggered(when.attacksSelf, [fx.createTokens(SQUIRREL)], { label: "Un Écureuil 1/1" }),
      activated({
        mana: "{1}{G}{G}{G}",
        effects: [fx.createTokens(SQUIRREL, amount.count({ subtype: "Squirrel", controller: "you" }))],
        label: "Autant d'Écureuils 1/1 que d'Écureuils que vous contrôlez",
      }),
    ],
  },
  "Undercover Skrull": {
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 2, allCreatureTypes: true },
        { condition: TWO_CREATURE_CARDS, label: "+2/+2 et tous les types de créature (deux cartes de créature au cimetière)" },
      ),
      manaAbility([...ANY_COLOR]),
    ],
  },
  "Wakandan Royal Guard": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.targetMatches("t", { subtype: "Hero", other: true }), fx.addCounters(ref.target(), 2)),
          ...fx.when(cond.not(cond.targetMatches("t", { subtype: "Hero", other: true })), fx.addCounters(ref.target(), 1)),
        ],
        { targets: [target.creature()], label: "Un marqueur +1/+1 (deux sur un autre Héros)" },
      ),
    ],
  },
  "White Tiger, Ava Ayala": {
    abilities: [
      powerUp("{5}{G}", "un marqueur +1/+1 et The Tiger God, Chat Dieu 4/4", [
        fx.addCounters(ref.self, 1),
        fx.createTokens(TIGER_GOD),
      ]),
    ],
  },
  "World War Hulk": {
    abilities: [
      // Approximation : seulement depuis la main, et un sort rouge ou vert de créature payé normalement ne consomme pas
      // la permission.
      chapter(
        [1],
        [
          fx.emblem(
            "World War Hulk",
            "The next red or green creature spell you cast this turn can be cast without paying its mana cost.",
            [
              castPermission({
                freeFromHand: true,
                freeFilter: { types: ["Creature"], colors: ["R", "G"] },
                freeOncePerTurn: true,
                label: "Votre prochain sort de créature rouge ou vert ce tour-ci sans payer son coût de mana",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "Le prochain sort de créature rouge ou vert sans payer son coût" },
      ),
      chapter([2], [fx.addCounters(ref.target(), 3)], {
        targets: [YOUR_CREATURE()],
        label: "Trois marqueurs +1/+1 sur une de vos créatures",
      }),
      chapter([3], [fx.doublePT(ref.target(), ["trample"])], {
        targets: [YOUR_CREATURE()],
        label: "Double la force et l'endurance d'une de vos créatures, qui gagne le piétinement",
      }),
    ],
  },
};
