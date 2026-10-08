/** Reality Fracture — red cards. */
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
  modal,
  mode,
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
      triggered(when.entersSelf, [fx.damage(amount.sourceX, ref.target())], { targets: [target.any()], label: "X damage" }),
      staticAbility(CREATURE_YOU_CONTROL, { addKeywords: ["trample"] }, { label: "Trample" }),
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
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.self, 1)], {
        label: "put a +1/+1 counter",
      }),
    ],
  },
  "Craterclaw Colossus": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(CREATURE_YOU_CONTROL, amount.count({ types: ["Artifact"], controller: "you" }), 0, ["trample"])],
        { label: "+X/+0 and trample" },
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
        label: "Unblockable this turn",
      }),
    ],
  },
  "Heartstring Puller": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(CADET)], { label: "Cadet" })],
  },
  "Master of Barbs": {
    abilities: [
      // "One or more opponents": one trigger per batch of noncombat damage, from any source.
      triggered(when.playerDealtDamage("opponent", false), [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0)], {
        batched: true,
        label: "+1/+0 to your creatures",
      }),
    ],
  },
  "Skilled Battlecarver": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "First strike during your turn" },
      ),
      activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
    ],
  },
  "Stingcaster Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.grantFlashback(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "instant or sorcery in your graveyard")],
        label: "flashback this turn",
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
        { label: "discard: 2 damage" },
      ),
    ],
  },
  "Kiora of Fire and Ashes": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DRAGON_5)], { label: "5/5 Dragon" }),
      activated({ mana: "{8}", effects: [fx.createTokens(DRAGON_5)], label: "5/5 Dragon" }),
    ],
  },
  "Koth, the Geomancer": {
    abilities: [
      triggered(
        when.landfall,
        [fx.damage(1, ref.eachOpponent), ...fx.when(cond.eventObjectMatches({ subtype: "Mountain" }), fx.addMana("R"))],
        { label: "Landfall: 1 damage" },
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
        label: "Draw a card",
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
    abilities: [staticAbility(CREATURE_YOU_CONTROL, { addKeywords: ["haste"] }, { label: "Haste" })],
  },
  "Gallia, the Merrymaker": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true, withCounter: "+1/+1" },
        { addKeywords: ["haste"] },
        { label: "Haste (with a +1/+1 counter)" },
      ),
      activated({
        mana: "{1}{R}",
        tap: true,
        targets: [target.creature("t", { enteredThisTurn: true })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "+1/+1 counter",
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
        label: "your creatures +1/+0",
      }),
    ],
  },
  "Hallway Heckler": {
    prepareSpell: VICIOUS_VERSE,
    abilities: [
      entersWith({ prepared: true }),
      activated({ tap: true, discard: 1, effects: [fx.draw(1)], label: "Discard a card: draw" }),
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
      triggered(when.entersSelf, [empower(2)], { label: "Empower Jace 2" }),
      walkersHave(loyalty(1, { effects: [fx.addMana("R")], label: "Add {R}" }), "Planeswalkers: [+1] {R}"),
    ],
  },
  "Way of the Warlord": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      walkersHave(
        loyalty(-4, {
          targets: [target.upTo(1, target.creatureOrPlaneswalker("c")), target.player("p")],
          effects: [fx.damage(2, ref.target("c")), fx.damage(2, ref.target("p"))],
          label: "2 damage to a creature or planeswalker and 2 to a player",
        }),
        "Planeswalkers: [−4]",
      ),
    ],
  },
  "Essence Burn": {
    spell: spell(
      [target.creatureOrPlaneswalker("t", { colors: ["B", "G"] })],
      [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())],
    ),
  },
  "Fulminous Forte": {
    spell: modal(
      mode(
        "1 damage to each creature and planeswalker your opponents control",
        [],
        // `damageAll` only hits creatures: the opponents' planeswalkers are designated by a reference.
        [fx.damage(1, ref.permanentsOf(ref.eachOpponent, { types: ["Creature", "Planeswalker"] }))],
      ),
      mode("5 damage to a creature or planeswalker", [target.creatureOrPlaneswalker("t")], [fx.damage(5, ref.target())]),
    ),
  },
  "Wrath of the Bloodmane": {
    costReduction: { generic: 1, condition: cond.controls({ types: ["Creature"], legendary: true }) },
    spell: spell([target.creatureOrPlaneswalker("t")], [fx.damage(4, ref.target())]),
  },
  "Ajani Unrelenting": {
    abilities: [
      triggered(when.loyaltyActivated(), [fx.createTokens(CADET)], { label: "Cadet" }),
      loyalty(1, { effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0, ["haste"])], label: "Your creatures +1/+0 and haste" }),
      loyalty(-2, {
        effects: [fx.discard(amount.cardsIn("hand")), fx.draw(amount.count(CREATURE_YOU_CONTROL))],
        label: "Discard your hand, draw for each creature",
      }),
      loyalty(-3, {
        effects: [fx.damageAll(4, { types: ["Creature"], anyOf: [{ controller: "opponent" }, { token: false }] })],
        label: "4 damage to each creature, except your tokens",
      }),
    ],
  },
};
