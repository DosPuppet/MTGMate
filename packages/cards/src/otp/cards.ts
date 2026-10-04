/** Breaking News (OTP) : scripts des cartes (PLAN-G). */
import type { Effect, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCostMode,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  escalate,
  eventReplacement,
  FOOD,
  fx,
  loyalty,
  modal,
  mode,
  ref,
  spell,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

const PEST: TokenSpec = {
  name: "Pest",
  colors: ["B", "G"],
  types: ["Creature"],
  subtypes: ["Pest"],
  power: 1,
  toughness: 1,
  abilities: [triggered(when.diesSelf, [fx.gainLife(1)], { label: "Meurt : 1 PV" })],
};
/** « Choisissez deux — » : chaque paire de modes (identifiants de cibles distincts d'un mode à l'autre). */
function chooseTwo(...choices: { label: string; targets?: TargetSpec[]; effects: Effect[] }[]) {
  return modal(
    ...choices.flatMap((a, i) =>
      choices
        .slice(i + 1)
        .map((b) => mode(`${a.label} ; ${b.label}`, [...(a.targets ?? []), ...(b.targets ?? [])], [...a.effects, ...b.effects])),
    ),
  );
}

export const CARDS: Record<string, CardScript> = {
  "Collective Defiance": {
    spell: escalate(
      "{1}",
      {
        label: "Le joueur ciblé défausse sa main, puis pioche autant",
        targets: [target.player("p")],
        effects: [fx.discard(999, ref.target("p"), { store: "n" }), fx.draw(amount.v("n"), ref.target("p"))],
      },
      { label: "4 blessures à la créature ciblée", targets: [target.creature("c")], effects: [fx.damage(4, ref.target("c"))] },
      {
        label: "3 blessures à l'adversaire ou au planeswalker ciblé",
        targets: [
          { id: "o", label: "adversaire ou planeswalker", filter: { players: "opponent", objects: { types: ["Planeswalker"] } } },
        ],
        effects: [fx.damage(3, ref.target("o"))],
      },
    ),
  },
  "Fierce Retribution": {
    spell: altCostMode(
      "Fendre",
      "{5}{W}",
      { targets: [target.creature("t", { attacking: true })], effects: [fx.destroy(ref.target())] },
      { targets: [target.creature()], effects: [fx.destroy(ref.target())] },
    ),
  },
  "Skewer the Critics": {
    // Spectacle {R} : lu dans le texte.
    spell: spell([target.any()], [fx.damage(3, ref.target())]),
  },
  // — G6 : Breaking News —
  "Journey to Nowhere": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature()],
        label: "Exilez la créature ciblée",
      }),
    ],
  },
  // Flash : lu dans le texte.
  "Leyline Binding": {
    costReduction: { generic: amount.basicLandTypes },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "Exilez un permanent non-terrain adverse jusqu'à son départ",
      }),
    ],
  },
  Pariah: {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      eventReplacement({
        event: "damage",
        to: "you",
        redirectToAttached: true,
        modify: {},
        label: "Les blessures qui vous seraient infligées le sont à la créature enchantée",
      }),
    ],
  },
  "Path to Exile": {
    spell: spell(
      [target.creature()],
      [
        fx.exile(ref.target()),
        ...fx.mayFor(
          ref.controllerOf(ref.target()),
          "chercher un terrain de base",
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        ),
      ],
    ),
  },
  "Archive Trap": {
    altCost: {
      mana: "{0}",
      condition: cond.amountAtLeast(amount.turnEvents({ event: "search", who: "opponent" }), 1),
      label: "Un adversaire a cherché dans sa bibliothèque — {0}",
    },
    spell: spell([target.player("t", "opponent")], [fx.mill(13, ref.target())]),
  },
  "Archmage's Charm": {
    spell: modal(
      mode("Contrecarrez le sort ciblé", [target.spell("s")], [fx.counter(ref.target("s"))]),
      mode("Le joueur ciblé pioche deux cartes", [target.player("p")], [fx.draw(2, ref.target("p"))]),
      mode(
        "Contrôle d'un permanent non-terrain de valeur de mana 1 ou moins",
        [target.nonland("n", { maxManaValue: 1 })],
        [fx.gainControl(ref.target("n"))],
      ),
    ),
  },
  "Essence Capture": {
    spell: spell(
      [
        target.spell("s", { types: ["Creature"] }, "sort de créature"),
        target.optional(target.creature("c", { controller: "you" })),
      ],
      [fx.counter(ref.target("s")), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Mana Drain": {
    spell: spell(
      [target.spell()],
      [
        fx.delayedAt("yourNextMain", [fx.addManaChoice(amount.v("mv"), ["C"])], undefined, {
          mv: amount.manaValueOf(ref.target()),
        }),
        fx.counter(ref.target()),
      ],
    ),
  },
  "Mindbreak Trap": {
    altCost: {
      mana: "{0}",
      condition: cond.amountAtLeast(
        amount.refCount(
          ref.playersWhere(ref.eachOpponent, cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you" }), 3)),
        ),
        1,
      ),
      label: "Un adversaire a lancé trois sorts — {0}",
    },
    spell: spell([target.upTo(99, target.spell())], [fx.exile(ref.target())]),
  },
  Repulse: { spell: spell([target.creature()], [fx.bounce(ref.target()), fx.draw(1)]) },
  "Heartless Pillage": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(2, ref.target()), ...fx.when(cond.raid, fx.createTokens(TREASURE))],
    ),
  },
  "Imp's Mischief": {
    spell: spell(
      [target.stackItemSingleTarget()],
      [fx.loseLife(amount.manaValueOf(ref.target())), fx.changeTarget(ref.target())],
    ),
  },
  "Overwhelming Forces": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.destroy(ref.permanentsOf(ref.target(), { types: ["Creature"] }), "d"), fx.draw(amount.v("d"))],
    ),
  },
  Reanimate: {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")],
      [fx.loseLife(amount.manaValueOf(ref.target())), fx.toBattlefield(ref.target(), { underYourControl: true })],
    ),
  },
  Thoughtseize: {
    spell: spell(
      [target.player()],
      [fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } }), fx.loseLife(2)],
    ),
  },
  "Crackle with Power": {
    spell: spell(
      [{ ...target.any(), countX: "upTo", optional: true }],
      [fx.damage(amount.plus(amount.x, amount.x, amount.x, amount.x, amount.x), ref.target())],
    ),
  },
  Electrodominance: {
    spell: spell(
      [target.any()],
      [fx.damage(amount.x, ref.target()), fx.castNow(ref.handOf(ref.you), { free: true, maxManaValue: amount.x })],
    ),
  },
  Fling: {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([target.any()], [fx.damage(amount.powerOf(ref.costSacrificed), ref.target())]),
  },
  Skullcrack: {
    spell: spell(
      [{ id: "t", label: "joueur ou planeswalker", filter: { players: "any", objects: { types: ["Planeswalker"] } } }],
      [
        fx.thisTurn({ cantGainLife: true }, ref.eachPlayer),
        fx.thisTurn({ damageUnpreventable: true }, ref.eachPlayer),
        fx.damage(3, ref.target()),
      ],
    ),
  },
  "Clear Shot": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 1, 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Pest Infestation": {
    spell: spell(
      [{ ...target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"), countX: "upTo", optional: true }],
      [fx.destroy(ref.target()), fx.createTokens(PEST, amount.plus(amount.x, amount.x))],
    ),
  },
  "Primal Command": {
    spell: chooseTwo(
      { label: "Le joueur ciblé gagne 7 PV", targets: [target.player("g")], effects: [fx.gainLife(7, ref.target("g"))] },
      {
        label: "Un permanent non-créature sur le dessus de la bibliothèque",
        targets: [
          target.permanent("n", ["Artifact", "Enchantment", "Land", "Planeswalker", "Battle"], {}, "permanent non-créature"),
        ],
        effects: [fx.moveTo(ref.target("n"), { to: "libraryTop" })],
      },
      {
        label: "Le joueur ciblé mélange son cimetière dans sa bibliothèque",
        targets: [target.player("m")],
        effects: [fx.moveTo(ref.graveyardOf(ref.target("m")), { to: "libraryTop" }), fx.shuffle(ref.target("m"))],
      },
      { label: "Cherchez une carte de créature", effects: [fx.search({ types: ["Creature"] }, { to: "hand" })] },
    ),
  },
  // Cycle : lu dans le texte.
  Thornado: { spell: spell([target.creature("t", { keyword: "flying" })], [fx.destroy(ref.target())]) },
  "Abrupt Decay": {
    cantBeCountered: true,
    spell: spell(
      [target.nonland("t", { maxManaValue: 3 }, "permanent non-terrain de valeur de mana 3 ou moins")],
      [fx.destroy(ref.target())],
    ),
  },
  "Anguished Unmaking": { spell: spell([target.nonland()], [fx.exile(ref.target()), fx.loseLife(3)]) },
  "Back for More": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
      [
        fx.moveTo(ref.target(), { to: "battlefield" }, { name: "b" }),
        fx.reflexive(
          [target.optional(target.creature("f", { controller: "opponent" }))],
          [fx.fight(ref.target("b"), ref.target("f"))],
          {
            b: ref.stored("b"),
          },
        ),
      ],
    ),
  },
  Bedevil: {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature", "Planeswalker"], {}, "artefact, créature ou planeswalker")],
      [fx.destroy(ref.target())],
    ),
  },
  Crime: {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }] },
          "opponent",
          "carte de créature ou d'enchantement d'un cimetière adverse",
        ),
      ],
      [fx.toBattlefield(ref.target(), { underYourControl: true })],
    ),
  },
  Punishment: {
    spell: spell(
      [],
      [
        fx.destroyAll({
          anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Enchantment"] }],
          manaValueX: true,
        }),
      ],
    ),
  },
  "Cruel Ultimatum": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.sacrifice(ref.target(), { types: ["Creature"] }),
        fx.discard(3, ref.target()),
        fx.loseLife(5, ref.target()),
        fx.pickFromZone("graveyard", { types: ["Creature"] }, { to: "hand" }, { count: 1, min: 1 }),
        fx.draw(3),
        fx.gainLife(5),
      ],
    ),
  },
  Decimate: {
    spell: spell(
      [
        target.permanent("a", ["Artifact"], {}, "artefact"),
        target.creature("c"),
        target.permanent("e", ["Enchantment"], {}, "enchantement"),
        target.permanent("l", ["Land"], {}, "terrain"),
      ],
      [fx.destroy(ref.union(ref.target("a"), ref.target("c"), ref.target("e"), ref.target("l")))],
    ),
  },
  "Decisive Denial": {
    spell: modal(
      mode(
        "Votre créature se bat contre une créature adverse",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.fight(ref.target("a"), ref.target("b"))],
      ),
      mode(
        "Contrecarrez le sort non-créature ciblé à moins que son contrôleur ne paie {3}",
        [target.spell("s", { notTypes: ["Creature"] }, "sort non-créature")],
        [fx.unlessPays(ref.controllerOf(ref.target("s")), { mana: "{3}" }, fx.counter(ref.target("s")))],
      ),
    ),
  },
  "Detention Sphere": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.union(ref.target(), ref.sameNameOnBattlefield(ref.target())))], {
        targets: [target.optional(target.nonland("t", { not: { name: "Detention Sphere" } }))],
        label: "Exilez un permanent non-terrain et ses homonymes jusqu'à son départ",
      }),
    ],
  },
  "Endless Detour": {
    spell: spell(
      [
        {
          id: "t",
          label: "sort, permanent non-terrain ou carte d'un cimetière",
          filter: { spells: {}, objects: { notTypes: ["Land"] }, cards: { filter: {}, whose: "any" } },
        },
      ],
      [fx.topOrBottom(ref.target())],
    ),
  },
  "Hindering Light": {
    spell: spell(
      [{ id: "t", label: "sort qui cible un de vos permanents", filter: { spells: {}, spellsTargeting: { controller: "you" } } }],
      [fx.counter(ref.target()), fx.draw(1)],
    ),
  },
  Humiliate: {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } }),
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "h", {
          prompt: "Une de vos créatures reçoit un marqueur +1/+1",
        }),
        fx.addCounters(ref.stored("h"), 1),
      ],
    ),
  },
  Hypothesizzle: {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.discard(1, ref.you, { optional: true, filter: { notTypes: ["Land"] }, store: "h" }),
        ...fx.when(cond.v("h"), fx.reflexive([target.creature()], [fx.damage(4, ref.target())])),
      ],
    ),
  },
  Ionize: {
    spell: spell([target.spell()], [fx.damage(2, ref.controllerOf(ref.target())), fx.counter(ref.target())]),
  },
  "Oko, Thief of Crowns": {
    abilities: [
      loyalty(2, { effects: [fx.createTokens(FOOD)], label: "Une Nourriture" }),
      loyalty(1, {
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
        effects: [
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], setSubtypes: ["Elk"], setColors: ["G"], loseAllAbilities: true },
            "permanent",
            3,
          ),
        ],
        label: "L'artefact ou la créature ciblé devient un Élan vert 3/3 sans capacités",
      }),
      loyalty(-5, {
        targets: [
          target.permanent("a", ["Artifact", "Creature"], { controller: "you" }, "votre artefact ou créature"),
          target.creature("b", { controller: "opponent", maxPower: 3 }),
        ],
        effects: [fx.exchangeControl(ref.target("a"), ref.target("b"))],
        label: "Échangez le contrôle de votre artefact ou créature et d'une créature adverse de force 3 ou moins",
      }),
    ],
  },
  "Savage Smash": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 2, 2), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  // Flashback {1}{U}{B} : lu dans le texte.
  "Siphon Insight": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.lookAtTop(2, {
          who: ref.target(),
          count: 1,
          exact: true,
          to: { to: "exile", faceDown: "you" },
          rest: "bottom",
          store: "x",
        }),
        fx.grantPlay(ref.stored("x"), { forever: true, anyMana: true }),
      ],
    ),
  },
  "Tyrant's Scorn": {
    spell: modal(
      mode(
        "Détruisez une créature de valeur de mana 3 ou moins",
        [target.creature("d", { maxManaValue: 3 })],
        [fx.destroy(ref.target("d"))],
      ),
      mode("Renvoyez une créature en main", [target.creature("b")], [fx.bounce(ref.target("b"))]),
    ),
  },
  "Vanishing Verse": {
    spell: spell([{ id: "t", label: "permanent monocolore", filter: { objects: { colorCount: 1 } } }], [fx.exile(ref.target())]),
  },
  "Villainous Wealth": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), amount.x, "v"), fx.castNow(ref.stored("v"), { free: true, many: true, maxManaValue: amount.x })],
    ),
  },
  "Void Rend": { cantBeCountered: true, spell: spell([target.nonland()], [fx.destroy(ref.target())]) },
  Voidslime: {
    spell: spell([{ id: "t", label: "sort ou capacité", filter: { stackItems: {} } }], [fx.counter(ref.target())]),
  },
  "Contagion Engine": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.permanentsOf(ref.target(), { types: ["Creature"] }), "-1/-1")], {
        targets: [target.player()],
        label: "Un marqueur −1/−1 sur chaque créature du joueur ciblé",
      }),
      activated({ mana: "{4}", tap: true, effects: [fx.proliferate(2)], label: "Proliférez deux fois" }),
    ],
  },
  Mindslaver: {
    abilities: [
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        targets: [target.player()],
        effects: [fx.controlNextTurn(ref.target())],
        label: "Contrôlez le joueur ciblé pendant son prochain tour",
      }),
    ],
  },
  // — G4e : sous-lot difficile —
  "Force of Vigor": {
    altCost: {
      mana: "{0}",
      condition: cond.not(cond.yourTurn),
      label: "Force of Vigor — exilez une carte verte de votre main",
      pay: { exileFromHand: { filter: { colors: ["G"] }, count: 1 } },
    },
    spell: spell(
      [target.upTo(2, target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))],
      [fx.destroy(ref.target())],
    ),
  },
  "Surgical Extraction": {
    spell: spell(
      [target.cardInGraveyard("t", { basic: false }, "any", "carte d'un cimetière (sauf terrain de base)")],
      [fx.exileCardAndNamesakes(ref.target("t"))],
    ),
  },
};
