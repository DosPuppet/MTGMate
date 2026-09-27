/** Final Fantasy — cartes noires. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  fx,
  HORROR,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  tiered,
  triggered,
  triggeredModal,
  when,
  wizard,
} from "./common";

const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

/** Vincent's Limit Break : « quand cette créature meurt, renvoyez-la engagée » et une F/E de base choisie. */
const limitBreak = (power: number, toughness: number) => [
  fx.modify(ref.target(), {
    setPower: power,
    setToughness: toughness,
    addAbilities: [triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], { label: "Revient engagée" })],
  }),
];

export const BLACK: Record<string, CardScript> = {
  Ahriman: {
    abilities: [
      activated({
        mana: "{3}",
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.draw(1)],
        label: "Piochez",
      }),
    ],
  },
  "Al Bhed Salvagers": {
    abilities: [
      triggered(when.dies({ ...CREATURE_OR_ARTIFACT, controller: "you" }), fx.drain(1, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "Drain 1",
      }),
    ],
  },
  "Black Mage's Rod": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          addSubtypes: ["Wizard"],
          addAbilities: [
            triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(1, ref.eachOpponent)], {
              label: "1 blessure à chaque adversaire",
            }),
          ],
        },
        { label: "+1/+0, Sorcier" },
      ),
    ],
  },
  "Circle of Power": {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.loseLife(2),
        wizard(),
        fx.pumpAll({ types: ["Creature"], subtype: "Wizard", controller: "you" }, 1, 0, ["lifelink"]),
      ],
    ),
  },
  "Cornered by Black Mages": {
    spell: spell([target.player("t", "opponent")], [fx.sacrifice(ref.target(), { types: ["Creature"] }), wizard()]),
  },
  "Dark Confidant": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "c" }), fx.loseLife(amount.manaValueOf(ref.stored("c")))],
        { label: "Carte du dessus en main, perdez sa VM en PV" },
      ),
    ],
  },
  "Demon Wall": {
    abilities: [
      // Approximation : « un marqueur » est lu comme un marqueur +1/+1 (les seuls qu'elle se donne).
      staticAbility(
        "self",
        { removeKeywords: ["defender"] },
        { condition: cond.counterAtLeast("+1/+1", 1), label: "Peut attaquer (marqueur)" },
      ),
      activated({ mana: "{5}{B}", effects: [fx.addCounters(ref.self, 2)], label: "Deux marqueurs +1/+1" }),
    ],
  },
  "Evil Reawakened": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 2 } })],
    ),
  },
  "Fight On!": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature"))],
      [fx.toHand(ref.target())],
    ),
  },
  "The Final Days": {
    flashback: "{4}{B}{B}",
    spell: spell(
      [],
      [
        fx.when(cond.not(cond.spellCastFromGraveyard), fx.createTappedTokens(HORROR, 2)),
        fx.when(cond.spellCastFromGraveyard, fx.createTappedTokens(HORROR, amount.countIn("graveyard", { types: ["Creature"] }))),
      ],
    ),
  },
  "Gaius van Baelsar": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Chaque joueur sacrifie un jeton de créature",
            [],
            [fx.sacrifice(ref.eachPlayer, { types: ["Creature"], token: true })],
          ),
          mode(
            "Chaque joueur sacrifie une créature non-jeton",
            [],
            [fx.sacrifice(ref.eachPlayer, { types: ["Creature"], nontoken: true })],
          ),
          mode("Chaque joueur sacrifie un enchantement", [], [fx.sacrifice(ref.eachPlayer, { types: ["Enchantment"] })]),
        ],
        { label: "Chaque joueur sacrifie" },
      ),
    ],
  },
  Hecteyes: {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Chaque adversaire défausse" })],
  },
  Malboro: {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent), fx.exileTop(ref.eachOpponent, 3, "m")],
        { label: "Mauvaise haleine" },
      ),
    ],
  },
  "Namazu Trader": {
    abilities: [
      triggered(when.entersSelf, [fx.loseLife(1), fx.createTokens(TREASURE)], { label: "Perdez 1 PV, Trésor" }),
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { ...CREATURE_OR_ARTIFACT, other: true }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.surveil(2)),
        ],
        { label: "Sacrifiez, surveillance 2" },
      ),
    ],
  },
  Overkill: { spell: spell([target.creature("t")], [fx.pump(ref.target(), 0, -9999)]) },
  "Phantom Train": {
    abilities: [
      activated({
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.addCounters(ref.self, 1), fx.animateVehicle(), fx.modify(ref.self, { addSubtypes: ["Spirit"] })],
        label: "Marqueur +1/+1, devient une créature Esprit",
      }),
    ],
  },
  "Poison the Waters": {
    spell: modal(
      mode("Toutes les créatures -1/-1", [], [fx.pumpAll({ types: ["Creature"] }, -1, -1)]),
      mode(
        "Défausse d'un artefact ou d'une créature",
        [target.player("t")],
        [fx.discard(1, ref.target(), { filter: CREATURE_OR_ARTIFACT, chooser: "controller" })],
      ),
    ),
  },
  "Qutrub Forayer": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Détruisez une créature blessée ce tour-ci",
            [target.creature("t", { damaged: true })],
            [fx.destroy(ref.target())],
          ),
          mode(
            "Exilez jusqu'à deux cartes d'un cimetière",
            [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any", "carte")), samePlayer: true }],
            [fx.exile(ref.target())],
          ),
        ],
        { label: "Choisissez un" },
      ),
    ],
  },
  "Resentful Revelation": { flashback: "{6}{B}", spell: spell([], [fx.lookAtTop(3, { count: 1, rest: "graveyard" })]) },
  "Sephiroth's Intervention": { spell: spell([target.creature("t")], [fx.destroy(ref.target()), fx.gainLife(2)]) },
  "Shambling Cie'th": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        fx.mayPay("{B}", "Payer {B} pour le renvoyer en main ?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Revient en main" },
      ),
    ],
  },
  "Shinra Reinforcements": {
    abilities: [triggered(when.entersSelf, [fx.mill(3), fx.gainLife(3)], { label: "Meulez 3, +3 PV" })],
  },
  Tonberry: {
    abilities: [
      entersWith({ tapped: true, counters: 1, counterKind: "stun" }),
      staticAbility(
        "self",
        { addKeywords: ["firstStrike", "deathtouch"] },
        { condition: cond.yourTurn, label: "Couteau du chef" },
      ),
    ],
  },
  "Undercity Dire Rat": { abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Trésor" })] },
  "Vincent's Limit Break": {
    spell: tiered(
      {
        cost: "{0}",
        label: "Galian Beast (3/2)",
        targets: [target.creature("t", { controller: "you" })],
        effects: limitBreak(3, 2),
      },
      {
        cost: "{1}",
        label: "Death Gigas (5/2)",
        targets: [target.creature("t", { controller: "you" })],
        effects: limitBreak(5, 2),
      },
      {
        cost: "{3}",
        label: "Hellmasker (7/2)",
        targets: [target.creature("t", { controller: "you" })],
        effects: limitBreak(7, 2),
      },
    ),
  },
};
