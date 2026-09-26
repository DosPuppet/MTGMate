/** Reality Fracture — cartes rouges. */
import {
  activated,
  amount,
  CADET,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_5,
  empower,
  entersWith,
  fx,
  loyalty,
  ref,
  spell,
  staticAbility,
  THOPTER,
  target,
  triggered,
  VICIOUS_VERSE,
  walkersHave,
  when,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Ajani's Anguish": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.x, ref.target())], { targets: [target.any()], label: "X blessures" }),
      staticAbility(CREATURE_YOU_CONTROL, { addKeywords: ["trample"] }, { label: "Piétinement" }),
    ],
  },
  "Artifist Acumen": {
    spell: spell([], [fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["firstStrike"]), fx.draw(1)]),
  },
  "Blazing Crescendo": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 3, 1), fx.impulse(1, "yourNextTurn")]),
  },
  "Chandra's Emberling": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.self, 1)], { label: "marqueur +1/+1" }),
    ],
  },
  "Craterclaw Colossus": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(CREATURE_YOU_CONTROL, amount.count({ types: ["Artifact"], controller: "you" }), 0, ["trample"])],
        { label: "+X/+0 et piétinement" },
      ),
    ],
  },
  "Eardrum Rattler": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true, maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Imblocable ce tour-ci",
      }),
    ],
  },
  "Heartstring Puller": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(CADET)], { label: "Cadet" })],
  },
  "Master of Barbs": {
    abilities: [
      // Approximation : les blessures non de combat infligées par vos sources (sorts compris).
      triggered(
        when.dealsDamage("self", { noncombatOnly: true, toOpponent: true, anySourceYouControl: true }),
        [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0)],
        { label: "+1/+0 à vos créatures" },
      ),
    ],
  },
  "Skilled Battlecarver": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Initiative pendant votre tour" },
      ),
      activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
    ],
  },
  "Stingcaster Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.grantFlashback(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "éphémère ou rituel de votre cimetière")],
        label: "flashback ce tour-ci",
      }),
    ],
  },
  "Tether Technician": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.discard(1, ref.you, { optional: true, store: "d" }),
          ...fx.when(cond.v("d"), fx.reflexive([target.any()], [fx.damage(2, ref.target())])),
        ],
        { label: "défausser : 2 blessures" },
      ),
    ],
  },
  "Kiora of Fire and Ashes": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DRAGON_5)], { label: "Dragon 5/5" }),
      activated({ mana: "{8}", effects: [fx.createTokens(DRAGON_5)], label: "Dragon 5/5" }),
    ],
  },
  "Koth, the Geomancer": {
    abilities: [
      triggered(
        when.landfall,
        [fx.damage(1, ref.eachOpponent), ...fx.when(cond.eventObjectMatches({ subtype: "Mountain" }), fx.addMana("R"))],
        { label: "Landfall : 1 blessure" },
      ),
    ],
  },
  "Marwyn, the Clearcutter": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }], controller: "you" } },
        effects: [fx.draw(1)],
        label: "Piochez une carte",
      }),
    ],
  },
  "Pia, Determined Rebuilder": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(THOPTER)], { label: "Thopter" }),
      activated({
        mana: "{5}{R}",
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), amount.count({ types: ["Artifact"], controller: "you" }), 0)],
        label: "+X/+0",
      }),
    ],
  },
  "Samut, Hazoret's Champion": {
    abilities: [staticAbility(CREATURE_YOU_CONTROL, { addKeywords: ["haste"] }, { label: "Célérité" })],
  },
  "Gallia, the Merrymaker": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true, withCounter: "+1/+1" },
        { addKeywords: ["haste"] },
        { label: "Célérité (avec un marqueur +1/+1)" },
      ),
      activated({
        mana: "{1}{R}",
        tap: true,
        targets: [target.creature("t", { enteredThisTurn: true })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Arni, Renowned Champion": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.pump(ref.self, amount.powerOf(ref.eventObject), 0)],
        { label: "+X/+0" },
      ),
    ],
  },
  "Awaken the Inferno": {
    spell: spell(
      [
        target.creatureOrPlaneswalker("t", { controller: "opponent" }),
        target.upTo(1, target.creature("c", { controller: "you" })),
      ],
      [fx.damage(6, ref.target()), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Winter, Team Player": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0)], {
        label: "vos créatures +1/+0",
      }),
    ],
  },
  "Hallway Heckler": {
    prepareSpell: VICIOUS_VERSE,
    abilities: [
      entersWith({ prepared: true }),
      // Approximation : la défausse est faite à la résolution (pas comme coût).
      activated({
        tap: true,
        effects: [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        label: "Défaussez puis piochez",
      }),
    ],
  },
  "Pompous Battlemage": {
    prepareSpell: spell([], [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))]),
    abilities: [entersWith({ prepared: true })],
  },
  "No Admittance": { spell: spell([target.any()], [fx.damage(3, ref.target()), empower(1)]) },
  "Violent Echoes": {
    spell: spell(
      [target.creatureOrPlaneswalker("t")],
      [fx.damageStoringExcess(6, ref.target(), "excess"), empower(amount.v("excess"))],
    ),
  },
  "Way of the Pyromancer": {
    abilities: [
      triggered(when.entersSelf, [empower(2)], { label: "Renforcez Jace 2" }),
      walkersHave(loyalty(1, { effects: [fx.addMana("R")], label: "Ajoutez {R}" }), "Planeswalkers : [+1] {R}"),
    ],
  },
  "Way of the Warlord": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Renforcez Jace 5" }),
      walkersHave(
        loyalty(-4, {
          targets: [target.upTo(1, target.creatureOrPlaneswalker("c")), target.player("p")],
          effects: [fx.damage(2, ref.target("c")), fx.damage(2, ref.target("p"))],
          label: "2 blessures à une créature ou un planeswalker et 2 à un joueur",
        }),
        "Planeswalkers : [−4]",
      ),
    ],
  },
};
