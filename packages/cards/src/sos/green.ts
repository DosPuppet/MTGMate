/** Secrets of Strixhaven — cartes vertes. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  FRACTAL,
  fx,
  INCREMENT,
  INFUSION,
  manaAbility,
  modal,
  mode,
  OPUS,
  PEST,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Une créature ou une carte de terrain. */
const CREATURE_OR_LAND = { anyOf: [{ types: ["Creature" as const] }, { types: ["Land" as const] }] };

export const GREEN: Record<string, CardScript> = {
  "Aberrant Manawurm": {
    abilities: [
      triggered(OPUS, [fx.pump(ref.self, amount.eventManaSpent, 0)], {
        label: "Opus : +X/+0, X étant le mana dépensé pour ce sort",
      }),
    ],
  },
  "Additive Evolution": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), 3)], {
        label: "Une Fractale avec trois marqueurs +1/+1",
      }),
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Un marqueur +1/+1 et la vigilance",
      }),
    ],
  },
  "Ambitious Augmenter": {
    abilities: [
      INCREMENT,
      // « s'il avait un ou plusieurs marqueurs » : ses dernières informations connues.
      triggered(when.diesSelf, [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.lkiCountersTo(ref.stored("f"))], {
        condition: cond.eventObjectMatches({ withCounter: "any" }),
        label: "Une Fractale qui reçoit ses marqueurs",
      }),
    ],
  },
  "Burrog Barrage": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
      [
        // « un autre sort d'éphémère ou de rituel » : celui-ci compte déjà parmi les sorts lancés ce tour-ci.
        ...fx.when(cond.amountAtLeast(amount.instantSorceryCast, 2), fx.pump(ref.target("a"), 1, 0)),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
  "Chelonian Tackle": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), 0, 10), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Comforting Counsel": {
    abilities: [
      triggered(when.gainLife, [fx.counters(ref.self, "growth")], { label: "Un marqueur de croissance" }),
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { power: 3, toughness: 3 },
        { condition: cond.counterAtLeast("growth", 5), label: "Cinq marqueurs de croissance : vos créatures ont +3/+3" },
      ),
    ],
  },
  Efflorescence: {
    spell: spell(
      [target.creature()],
      [
        fx.addCounters(ref.target(), 2),
        ...fx.when(INFUSION, fx.modify(ref.target(), { addKeywords: ["trample", "indestructible"] })),
      ],
    ),
  },
  "Emeritus of Abundance": {
    // Regrowth : renvoie une carte ciblée de votre cimetière dans votre main.
    prepareSpell: spell([target.cardInGraveyard("t", {}, "you")], [fx.toHand(ref.target())]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.attacksSelf, [fx.prepare(ref.self)], {
        condition: cond.controls({ types: ["Land"] }, 8),
        label: "Huit terrains ou plus : devient préparée",
      }),
    ],
  },
  "Emil, Vastlands Roamer": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["trample"] },
        { label: "Vos créatures avec des marqueurs +1/+1 ont le piétinement" },
      ),
      activated({
        mana: "{4}{G}",
        tap: true,
        effects: [
          fx.createTokens(FRACTAL, 1, undefined, "f"),
          fx.addCounters(ref.stored("f"), amount.distinctNames({ types: ["Land"], controller: "you" })),
        ],
        label: "Une Fractale avec un marqueur +1/+1 par nom de terrain différent",
      }),
    ],
  },
  "Environmental Scientist": {
    abilities: [
      triggered(when.entersSelf, fx.may("Chercher une carte de terrain de base ?", fx.search(BASIC_LAND, { to: "hand" })), {
        label: "Cherchez un terrain de base",
      }),
    ],
  },
  "Follow the Lumarets": {
    spell: spell(
      [],
      [
        ...fx.when(cond.not(INFUSION), fx.lookAtTop(4, { filter: CREATURE_OR_LAND, count: 1 })),
        ...fx.when(INFUSION, fx.lookAtTop(4, { filter: CREATURE_OR_LAND, count: 2 })),
      ],
    ),
  },
  "Germination Practicum": {
    // Paradigme : lu dans le texte.
    spell: spell([], [fx.addCountersAll({ types: ["Creature"], controller: "you" }, 2)]),
  },
  "Glorious Decay": {
    spell: modal(
      mode("Détruit un artefact", [target.permanent("t", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target())]),
      mode("4 blessures à une créature avec le vol", [target.creature("t", { keyword: "flying" })], [fx.damage(4, ref.target())]),
      mode(
        "Exile une carte d'un cimetière, piochez une carte",
        [target.cardInGraveyard("t", {}, "any")],
        [fx.exileCard(ref.target()), fx.draw(1)],
      ),
    ),
  },
  "Hungry Graffalon": { abilities: [INCREMENT] },
  "Infirmary Healer": {
    // Stream of Life : un joueur ciblé gagne X PV.
    prepareSpell: spell([target.player()], [fx.gainLife(amount.x, ref.target())]),
    abilities: [entersWith({ prepared: true })],
  },
  "Lumaret's Favor": {
    abilities: [
      triggered(when.castSelf, [fx.copySpell(ref.self, 1)], {
        condition: INFUSION,
        label: "Infusion : copiez ce sort",
      }),
    ],
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 4)]),
  },
  "Mindful Biomancer": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(1)], { label: "Gagnez 1 PV" }),
      activated({ mana: "{2}{G}", oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2 jusqu'à la fin du tour" }),
    ],
  },
  "Noxious Newt": { abilities: [manaAbility("G")] },
  "Oracle's Restoration": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 1, 1), fx.draw(1), fx.gainLife(1)]),
  },
  "Pestbrood Sloth": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(PEST, 2)], { label: "Deux Nuisibles 1/1" })],
  },
  "Planar Engineering": {
    spell: spell(
      [],
      [fx.sacrifice(ref.you, { types: ["Land"] }, 2), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 4)],
    ),
  },
  "Shopkeeper's Bane": {
    abilities: [triggered(when.attacksSelf, [fx.gainLife(2)], { label: "Gagnez 2 PV" })],
  },
  "Slumbering Trudge": {
    abilities: [
      entersWith({
        counters: amount.max(0, amount.plus(3, amount.neg(amount.x))),
        counterKind: "stun",
        label: "Trois marqueurs d'étourdissement moins X",
      }),
      entersWith({ tapped: true, condition: cond.not(cond.xAtLeast(3)), label: "X ≤ 2 : arrive engagée" }),
    ],
  },
  "Snarl Song": {
    // Convergence : X = couleurs de mana dépensées.
    spell: spell(
      [],
      [
        fx.createTokens(FRACTAL, 2, undefined, "f"),
        fx.addCounters(ref.stored("f"), amount.colorsSpent),
        fx.gainLife(amount.colorsSpent),
      ],
    ),
  },
  "Studious First-Year": {
    // Rampant Growth : un terrain de base sur le champ de bataille engagé.
    prepareSpell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]),
    abilities: [entersWith({ prepared: true })],
  },
  "Tenured Concocter": {
    abilities: [
      triggered({ on: "becomesTarget", who: "self", by: "opponent" }, fx.may("Piocher une carte ?", fx.draw(1)), {
        label: "Ciblée par un adversaire : vous pouvez piocher",
      }),
      staticAbility("self", { power: 2 }, { condition: INFUSION, label: "Infusion : +2/+0" }),
    ],
  },
  "Thornfist Striker": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { power: 1, addKeywords: ["trample"] },
        { condition: INFUSION, label: "Infusion : vos créatures ont +1/+0 et le piétinement" },
      ),
    ],
  },
  "Topiary Lecturer": {
    abilities: [INCREMENT, manaAbility("G", 1, { selfPower: true })],
  },
  "Vastlands Scavenger": {
    // Bind to Life : meulez sept cartes, puis une carte de créature meulée arrive sur le champ de bataille.
    prepareSpell: spell(
      [],
      [
        fx.mill(7, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          { count: 1, pool: ref.stored("m"), prompt: "Une carte de créature meulée arrive sur le champ de bataille" },
        ),
      ],
    ),
    abilities: [entersWith({ prepared: true })],
  },
  "Wild Hypothesis": {
    spell: spell([], [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), amount.x), fx.surveil(2)]),
  },
  "Zimone's Experiment": {
    // Les cartes révélées passent par la main ; les terrains en repartent aussitôt, engagés.
    spell: spell(
      [],
      [
        fx.lookAtTop(5, { filter: CREATURE_OR_LAND, count: 2, store: "z" }),
        fx.moveTo(ref.filtered(ref.stored("z"), { types: ["Land"] }), { to: "battlefield", tapped: true }),
      ],
    ),
  },
  "Wildgrowth Archaic": {
    abilities: [
      entersWith({ counters: amount.colorsSpent, label: "Convergence : un marqueur +1/+1 par couleur de mana dépensée" }),
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.spellArrivalCounters(ref.eventObject, amount.eventColorsSpent)],
        { label: "Sort de créature : il arrive avec un marqueur +1/+1 par couleur de mana dépensée" },
      ),
    ],
  },
};
