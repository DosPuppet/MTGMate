/** Reality Fracture — cartes noires. */
import {
  activated,
  amount,
  BEAST_TRAMPLE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  empower,
  entersWith,
  fx,
  loyalty,
  modal,
  mode,
  OMIT_VARIABLES,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  walkersHave,
  when,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Cast Away Doubt": { spell: spell([], [fx.draw(2), fx.damage(2, ref.eachPlayer)]) },
  "Darklight Phoenix": {
    abilities: [
      triggered(when.yourCombat, [fx.toBattlefield(ref.self)], {
        condition: cond.creaturesDied(2),
        fromGraveyard: true,
        label: "Deux créatures mortes : revient du cimetière",
      }),
    ],
  },
  "Last Gasp": { spell: spell([target.creature("t")], [fx.pump(ref.target(), -3, -3)]) },
  "Multiply by Zero": {
    spell: spell([target.creature("t")], [fx.modify(ref.target(), { setPower: 0, setToughness: 0 })]),
  },
  "Rampart Hunter": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2, ["deathtouch"])], {
        targets: [target.creature("t")],
        label: "+2/+2 et contact mortel",
      }),
    ],
  },
  "Rank Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" })],
  },
  "Rise of the Deathbringer": {
    spell: modal(
      mode(
        "Piocher selon la plus grande force, perdre autant de PV",
        [],
        [fx.draw(amount.maxPower(CREATURE_YOU_CONTROL)), fx.loseLife(amount.maxPower(CREATURE_YOU_CONTROL))],
      ),
      mode("Toutes les créatures -3/-3", [], [fx.pumpAll({ types: ["Creature"] }, -3, -3)]),
    ),
  },
  "Screeching Soulbreaker": {
    abilities: [triggered(when.attacksSelf, [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], { label: "1 blessure, +1 PV" })],
  },
  "Theoretical Necromancer": {
    abilities: [
      activated({
        mana: "{3}{B}",
        fromGraveyard: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], other: true }, "you", "autre carte de créature")],
        effects: [fx.toHand(ref.target())],
        label: "Récupérer une créature",
      }),
    ],
  },
  "Tinybones, Pocket Nuisance": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "chaque adversaire défausse" }),
      triggered(when.discard("any"), [fx.damage(1, ref.eachOpponent)], { label: "défausse : 1 blessure" }),
    ],
  },
  "Apex Witchstalker": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 PV" }),
      triggered(when.diesSelf, [fx.gainLife(2)], { label: "+2 PV" }),
    ],
  },
  "Proft, Sinister Mastermind": {
    castCondition: cond.threshold,
    abilities: [
      activated({
        mana: "{B}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), -3, -1)],
        label: "Défaussez : -3/-1",
      }),
    ],
  },
  "Liliana the Repentant": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], controller: "you", other: true }),
        [fx.mill(2)],
        { label: "meule 2" },
      ),
      // Exhaust : une seule activation.
      activated({
        mana: "{5}{B}",
        once: true,
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] },
            "you",
            "carte de créature ou de planeswalker de votre cimetière",
          ),
        ],
        effects: [fx.toBattlefield(ref.target()), fx.addCounters(ref.self, 1)],
        label: "Épuisement : réanimer",
      }),
    ],
  },
  "Bloodline Recollector": {
    prepareSpell: spell([target.player("t")], [fx.draw(3, ref.target()), fx.loseLife(3, ref.target())]),
    abilities: [
      triggered(when.eachEndStep, [fx.prepare(ref.self)], {
        condition: cond.creaturesDied(3),
        label: "trois créatures mortes : préparée",
      }),
    ],
  },
  "Void Extrapolator": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility("self", { power: 1, toughness: 1 }, { condition: cond.threshold, label: "Seuil : +1/+1" }),
    ],
  },
  "Overwrite the Multiverse": {
    // X est compté avant l'exil (même nombre : l'exil ne peut pas échouer).
    spell: spell(
      [],
      [
        empower(amount.count({ types: ["Creature"] })),
        fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"] }, { to: "exile" }),
      ],
    ),
  },
  "Rewrite Regrets": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], maxManaValue: 6 },
          "you",
          "carte de créature ou de planeswalker (VM 6 ou moins)",
        ),
      ],
      [fx.toBattlefield(ref.target()), empower(2)],
    ),
  },
  "Sanctum Lurker": {
    abilities: [
      triggered(when.entersSelf, [empower(1)], { label: "Renforcez Jace 1" }),
      playerStatic({ walkersSurviveZeroLoyalty: true, label: "Vos planeswalkers survivent à 0 loyauté" }),
      walkersHave(
        loyalty(2, { effects: [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], label: "1 blessure à chaque adversaire, +1 PV" }),
        "Planeswalkers : [+2]",
      ),
    ],
  },
  "Solve for Disappointment": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { permanent: true, nonland: true }, chooser: "controller" }), empower(1)],
    ),
  },
  "Vraska's Final Mercy": {
    spell: modal(
      mode(
        "Perdez 2 PV, détruisez une créature ou un planeswalker",
        [target.creatureOrPlaneswalker("t")],
        [fx.loseLife(2), fx.destroy(ref.target())],
      ),
      mode("Perdez 2 PV, renforcez Jace 6", [], [fx.loseLife(2), empower(6)]),
    ),
  },
  "Way of the Deathbringer": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Renforcez Jace 5" }),
      walkersHave(
        loyalty(-2, {
          effects: [
            fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "s" }),
            ...fx.when(cond.v("s"), fx.createTokens(BEAST_TRAMPLE)),
          ],
          label: "Sacrifier une créature : Bête 4/4",
        }),
        "Planeswalkers : [−2] Bête",
      ),
    ],
  },
  "Way of the Necromancer": {
    abilities: [
      triggered(when.entersSelf, [empower(2)], { label: "Renforcez Jace 2" }),
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        [fx.addCountersAll({ types: ["Planeswalker"], controller: "you" }, 1, "loyalty")],
        {
          label: "loyauté sur chaque planeswalker",
        },
      ),
    ],
  },
  "Extended Absence": {
    spell: spell(
      [target.creatureOrPlaneswalker("t")],
      [fx.exileCard(ref.target()), fx.damage(1, ref.eachOpponent), fx.gainLife(1)],
    ),
  },
  "Lich's Relic": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{2}", "Payer {2} pour détruire une créature ou un planeswalker adverse ?", [
          fx.reflexive(
            [target.upTo(1, target.creatureOrPlaneswalker("t", { controller: "opponent" }))],
            [fx.destroy(ref.target())],
          ),
        ]),
        { label: "payer {2} : détruire" },
      ),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Silence the Echo": {
    additionalCost: {
      sacrifice: { filter: { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, count: 1, orPay: cost("{3}") },
    },
    spell: spell([target.creatureOrPlaneswalker("t")], [fx.destroy(ref.target())]),
  },
  "Terminal Criticism": {
    spell: spell([target.creatureOrPlaneswalker("t", { colors: ["U", "R"] })], [fx.destroy(ref.target()), fx.gainLife(1)]),
  },
  "Mabel, Bitter Recluse": {
    abilities: [
      triggered(when.entersSelf, [fx.removeCounters(ref.target(), 3)], {
        targets: [target.creatureOrPlaneswalker("t", { other: true })],
        label: "retire jusqu'à trois marqueurs",
      }),
    ],
  },
  "Massacre Girl, Most Wanted": {
    abilities: [
      triggered(
        when.dies({ ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true }),
        [fx.damage(1, ref.target()), fx.gainLife(1)],
        {
          targets: [target.player("t", "opponent")],
          label: "1 blessure, +1 PV",
        },
      ),
      // Approximation : les blessures non de combat infligées par vos sources.
      triggered(
        when.dealsDamage("self", { noncombatOnly: true, toOpponent: true, anySourceYouControl: true }),
        [fx.addCounters(ref.self, 1)],
        { label: "marqueur +1/+1" },
      ),
    ],
  },
  "Teyo, Diamondblade Mage": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), { addKeywords: ["deathtouch"] }),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Creature"] }), fx.addCounters(ref.target(), 1)),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Planeswalker"] }), fx.counters(ref.target(), "loyalty", 1)),
        ],
        {
          targets: [targetObj("t", { permanent: true, controller: "you" }, "permanent que vous contrôlez")],
          label: "contact mortel",
        },
      ),
    ],
  },
  "Winter, Tormented Loner": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, 1, {
            optional: true,
            store: "s",
          }),
          ...fx.when(cond.v("s"), fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })),
        ],
        { label: "sacrifier : chaque adversaire sacrifie une créature" },
      ),
      staticAbility(
        "self",
        { power: 1 },
        {
          perGraveyard: { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] },
          label: "+1/+0 par créature ou planeswalker au cimetière",
        },
      ),
    ],
  },
  "Dark Matter Manipulator": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "meule 3" }),
      staticAbility(
        "self",
        { power: 2 },
        { perGraveyard: {}, perDivisor: 7, label: "+2/+0 par tranche de sept cartes au cimetière" },
      ),
    ],
  },
};
