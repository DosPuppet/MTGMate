/**
 * Marvel Super Heroes — black cards (lot A). Flying, deathtouch, menace, lifelink, flash, sneak, teamwork, equip and
 * basic landcycling are read from the text.
 */
import {
  activated,
  amount,
  bothIfKicked,
  type CardScript,
  cond,
  costReducer,
  entersWith,
  fx,
  manaAbility,
  modal,
  mode,
  ROBOT_VILLAIN,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  VILLAIN,
  WALL_C,
  when,
} from "./common";

/** "Whenever another Villain you control enters". */
const ANOTHER_VILLAIN_ENTERS = when.enters({ subtype: "Villain", controller: "you", other: true });
/** "two or more creature cards in your graveyard". */
const TWO_CREATURE_CARDS = cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 2);
const CREATURE_CARD = target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card from your graveyard");

export const BLACK: Record<string, CardScript> = {
  "Agents of HYDRA": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(VILLAIN)], { label: "A 2/1 Villain with menace" })],
  },
  "Arnim Zola, Bio-Fanatic": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: TWO_CREATURE_CARDS,
        effects: [fx.createTappedTokens(VILLAIN)],
        label: "A tapped 2/1 Villain (two creature cards in graveyard)",
      }),
    ],
  },
  "Baron Strucker, HYDRA Overlord": {
    abilities: [
      costReducer({ subtype: "Villain" }, 1, "Villain spells cost {1} less"),
      // "Do this only once each turn": only an accepted connive counts.
      triggered(ANOTHER_VILLAIN_ENTERS, fx.may("Have this Villain connive?", fx.doneOncePerTurn, fx.connive(ref.eventObject)), {
        oncePerTurn: "ifDone",
        label: "The Villain that entered may connive (once each turn)",
      }),
    ],
  },
  "Construct a Cosmic Cube": {
    abilities: [
      triggered(when.draw(2), [fx.createTokens(VILLAIN), fx.counters(ref.self, "plan")], {
        label: "Second card drawn: a 2/1 Villain and a plan counter",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.player("o", "opponent")], [fx.controlNextTurn(ref.target("o"))])),
        ],
        {
          condition: cond.counterAtLeast("plan", 7),
          label: "Seventh counter: sacrifice it; you control an opponent during their next turn",
        },
      ),
    ],
  },
  "Crossbones, Malicious Mercenary": {
    abilities: [
      triggered(ANOTHER_VILLAIN_ENTERS, [fx.addCounters(ref.self, 1), fx.damage(2, ref.eachOpponent)], {
        oncePerTurn: true,
        label: "A +1/+1 counter, 2 damage to each opponent (once each turn)",
      }),
    ],
  },
  "Cruel Alliance": {
    // Teamwork paid: the target can be any creature, and you gain 3 life.
    spell: spell(
      [{ ...target.creature("t", { maxManaValue: 3 }), kickedFilter: { objects: { types: ["Creature"] } } }],
      [fx.exile(ref.target()), ...fx.when(cond.kicked, fx.gainLife(3))],
    ),
  },
  "Dark Deed": { spell: spell([target.creature()], [fx.pump(ref.target(), -4, -4)]) },
  "Decoy Ploy": {
    // "Choose one or both."
    spell: modal(
      mode(
        "A Villain from your graveyard to your hand",
        [target.cardInGraveyard("v", { subtype: "Villain" }, "you", "Villain card from your graveyard")],
        [fx.toHand(ref.target("v"))],
      ),
      mode(
        "A Hero from your graveyard to your hand",
        [target.cardInGraveyard("h", { subtype: "Hero" }, "you", "Hero card from your graveyard")],
        [fx.toHand(ref.target("h"))],
      ),
      mode(
        "Both",
        [
          target.cardInGraveyard("v", { subtype: "Villain" }, "you", "Villain card from your graveyard"),
          target.cardInGraveyard("h", { subtype: "Hero" }, "you", "Hero card from your graveyard"),
        ],
        [fx.toHand(ref.target("v")), fx.toHand(ref.target("h"))],
      ),
    ),
  },
  "Doom Reigns Supreme": {
    abilities: [
      triggered(when.enters({ subtype: "Villain", controller: "you" }), [...fx.drain(1), fx.counters(ref.self, "plan")], {
        label: "Each opponent loses 1 life, you gain 1 life; a plan counter",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
          ...fx.when(
            cond.v("s"),
            fx.reflexive(
              [target.player("o", "opponent")],
              [
                fx.exileTop(ref.target("o"), 5, "d"),
                // "Up to two spells": a first one, then a second one among the remaining cards.
                fx.castNow(ref.stored("d"), { free: true, storeRest: "r" }),
                fx.castNow(ref.stored("r"), { free: true }),
              ],
            ),
          ),
        ],
        {
          condition: cond.counterAtLeast("plan", 5),
          label: "Fifth counter: sacrifice it; an opponent exiles five cards, cast up to two of them for free",
        },
      ),
    ],
  },
  "Elektra, Daughter of the Hand": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxPower: 3 })],
        label: "Destroy a creature an opponent controls with power 3 or less",
      }),
    ],
  },
  "Grim Reaper, Lethal Legionnaire": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{3}{B}",
          "Pay {3}{B} to return a creature from your graveyard?",
          fx.reflexive(
            [CREATURE_CARD],
            [
              fx.toBattlefield(ref.target(), {
                tapped: true,
                attacking: true,
                counters: { kind: "finality", n: 1 },
              }),
            ],
          ),
        ),
        { label: "Pay {3}{B}: a creature from the graveyard returns tapped and attacking (finality counter)" },
      ),
    ],
  },
  "Hour of Defeat": { spell: spell([target.creature()], [fx.destroy(ref.target()), fx.surveil(1)]) },
  "HYDRA Infiltration": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.target("o"))], {
        targets: [target.player("o", "opponent")],
        label: "An opponent discards two cards",
      }),
      triggered(
        when.attacksAlone({ types: ["Creature"], controller: "you" }),
        [fx.loseLife(1, ref.target("o")), fx.gainLife(1)],
        { targets: [target.player("o", "opponent")], label: "Attacks alone: an opponent loses 1 life, you gain 1 life" },
      ),
    ],
  },
  "HYDRA Troopers": {
    abilities: [
      triggered(
        when.entersSelf,
        [...fx.when(TWO_CREATURE_CARDS, fx.createTappedTokens(VILLAIN)), ...fx.when(cond.not(TWO_CREATURE_CARDS), fx.mill(2))],
        { label: "A tapped Villain (two creature cards in graveyard), otherwise mill two cards" },
      ),
    ],
  },
  "Kingpin's Enforcers": {
    abilities: [
      activated({
        mana: "{2}{B}",
        sacrificeOther: { filter: { types: ["Artifact", "Creature"] } },
        effects: [fx.draw(1)],
        label: "Sacrifice an artifact or creature: draw",
      }),
    ],
  },
  "Madame Masque": {
    abilities: [
      triggered(when.entersSelf, [fx.connive(ref.self)], { label: "Connives" }),
      triggered(when.draw(2), [fx.createTokens(VILLAIN)], { label: "Second card drawn: a 2/1 Villain" }),
    ],
  },
  "The Masters of Evil": {
    abilities: [
      staticAbility(
        { subtype: "Villain", controller: "you", other: true },
        { power: 2, toughness: 1 },
        {
          label: "Other Villains you control get +2/+1",
        },
      ),
      activated({
        mana: "{1}{B}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.search({ subtype: "Plan" })],
        label: "Discard it: search for a Plan card",
      }),
    ],
  },
  "Moonstone, Harsh Mistress": {
    abilities: [
      triggered(
        when.discard("you"),
        fx.may(
          "Exile the discarded card (playable until the end of your next turn)?",
          fx.exileCard(ref.eventObject, { name: "m" }),
          fx.grantPlay(ref.stored("m"), { untilYourNextTurn: true }),
        ),
        { label: "Exile the discarded card: playable until the end of your next turn" },
      ),
    ],
  },
  "Ninja of the Hand": {
    abilities: [
      activated({
        mana: "{4}{B}",
        powerUp: true,
        effects: [fx.discard(1, ref.eachOpponent), fx.addCounters(ref.self, 1)],
        label: "Power-up: each opponent discards, a +1/+1 counter",
      }),
    ],
  },
  "Project Deathlok Soldier": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Returns from the graveyard to your hand",
      }),
    ],
  },
  "Red Room Recruit": {
    abilities: [triggered(when.entersSelf, [fx.connive(ref.self)], { label: "Connives" })],
  },
  "Robot Domination": {
    abilities: [
      triggered(
        when.zoneChange(["battlefield", "hand", "library", "exile", "stack"], {
          to: ["graveyard"],
          whose: "you",
          filter: { types: ["Creature"] },
        }),
        [fx.draw(1), fx.loseLife(1), fx.counters(ref.self, "plan")],
        {
          // "creature cards": a token put into the graveyard does not count.
          condition: cond.eventObjectMatches({ token: false }),
          batched: true,
          label: "Draw, lose 1 life, a plan counter",
        },
      ),
      triggered(when.countersPut("self", "plan"), [fx.sacrificeIt(ref.self), fx.createTokens(ROBOT_VILLAIN, 3)], {
        condition: cond.counterAtLeast("plan", 3),
        label: "Third counter: sacrifice it, three 2/2 Robot Villains",
      }),
    ],
  },
  "Ronin, Shadow Stalker": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 2, {
        noTap: true,
        payLife: 2,
        oncePerTurn: true,
        restriction: { spell: { subtype: "Equipment" }, ability: ["equip"] },
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Equipment", attached: "toSource" } },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -4, -4)],
        label: "Sacrifice an attached Equipment: −4/−4",
      }),
    ],
  },
  "Roxxon Brutes": {
    abilities: [
      triggered(when.draw(2), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Second card drawn: a +1/+1 counter",
      }),
    ],
  },
  "Stolen Stark Tech": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attaches to a creature you control, which gains indestructible",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Super-Skrull": {
    abilities: [
      activated({ mana: "{2}{W}", effects: [fx.createTokens(WALL_C)], label: "A 0/4 Wall with defender" }),
      activated({ mana: "{3}{G}", effects: [fx.pump(ref.self, 4, 4)], label: "+4/+4" }),
      activated({
        mana: "{4}{R}",
        targets: [target.creature()],
        effects: [fx.damage(4, ref.target())],
        label: "4 damage to a creature",
      }),
      activated({
        mana: "{5}{U}",
        targets: [target.player()],
        effects: [fx.draw(4, ref.target())],
        label: "A player draws four cards",
      }),
    ],
  },
  "Swordsman, Sharp Scoundrel": {
    abilities: [
      triggered(ANOTHER_VILLAIN_ENTERS, [fx.attach(ref.target("c"), ref.target("e"))], {
        targets: [
          target.upTo(1, target.permanent("e", ["Artifact"], { subtype: "Equipment", controller: "you" }, "Equipment")),
          target.creature("c", { controller: "you" }),
        ],
        label: "Attach an Equipment to a creature you control",
      }),
      triggered(when.attacks({ types: ["Creature"], controller: "you", equipped: true }), [fx.connive(ref.eventObject)], {
        label: "The attacking equipped creature connives",
      }),
    ],
  },
  "Thunderbolts Conspiracy": {
    abilities: [
      triggered(
        when.dies({ subtype: "Villain", controller: "you" }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "finality", n: 1 }, addSubtypes: ["Hero"] })],
        { label: "The Villain returns with a finality counter; it's also a Hero" },
      ),
    ],
  },
  "Too Evil to Stay Dead": {
    // Teamwork paid: any creature card from your graveyard.
    spell: spell(
      [
        {
          ...target.cardInGraveyard(
            "t",
            { types: ["Creature"], maxManaValue: 4 },
            "you",
            "creature card with mana value 4 or less",
          ),
          kickedFilter: { cards: { filter: { types: ["Creature"] }, whose: "you" } },
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Unliving Legionnaire": {
    abilities: [
      activated({
        mana: "{5}{B}{B}",
        powerUp: true,
        targets: [target.upTo(1, CREATURE_CARD)],
        effects: [fx.toHand(ref.target()), fx.addCounters(ref.self, 2)],
        label: "Power-up: a creature from the graveyard to your hand, two +1/+1 counters",
      }),
    ],
  },
  "Visions of Villainy": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Villain" }) },
    spell: spell([], [fx.draw(2), fx.loseLife(2)]),
  },
  "Whiplash, Vengeful Engineer": {
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      triggered(when.attacksSelf, fx.drain(amount.count({ subtype: "Equipment", attached: "toSource" })), {
        condition: cond.sourceMatches({ equipped: true }),
        label: "Equipped: each opponent loses X life, you gain X life (X: attached Equipment)",
      }),
    ],
  },
  "Widow's Bite": {
    // Teamwork 3 (read from the text): paid, both modes; otherwise, only one.
    spell: bothIfKicked(
      mode("Deathtouch", [target.creature("a")], [fx.pump(ref.target("a"), 0, 0, ["deathtouch"])]),
      mode("−2/−2", [target.creature("b")], [fx.pump(ref.target("b"), -2, -2)]),
      "Both (teamwork)",
    ),
  },
  "Yellowjacket, Heartless Marauder": {
    abilities: [
      triggered(ANOTHER_VILLAIN_ENTERS, [fx.pump(ref.self, 1, 0, ["lifelink"])], {
        label: "+1/+0 and lifelink",
      }),
    ],
  },
  "Baron Helmut Zemo": {
    abilities: [
      triggered({ on: "castSpell", by: "you", filter: { colors: ["B"] }, fromHand: true }, [fx.connive(ref.self)], {
        label: "You cast a black spell from your hand: it connives",
      }),
      activated({
        exileGraveyardSymbols: { color: "B", n: 15 },
        oncePerTurn: true,
        activationCondition: cond.sourceMatches({ attackedThisTurn: true }),
        effects: [fx.castCopiesFree([ref.costExiled], 99, { maxCount: 3 })],
        label: "Boast: exile black cards (15 {B} symbols), cast up to three copies for free",
      }),
    ],
  },
  // Menace: read from the text.
  "Black Widow, Super Spy": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          { op: "exileUntil", filter: { notTypes: ["Land"] }, store: "w", who: ref.eventPlayer },
          ...fx.mayForStore(ref.you, "Put a +1/+1 counter on Black Widow?", "bw", fx.addCounters(ref.self, 1)),
          ...fx.when(cond.not(cond.v("bw")), fx.grantPlay(ref.stored("w"), { anyMana: true })),
        ],
        { label: "Combat damage: the player exiles up to one nonland card; a counter, or you may cast it" },
      ),
    ],
  },
  "Klaw, Sonic Subjugator": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.discard(1, ref.target(), {
            chooser: "controller",
            reveal: amount.plus(1, amount.countIn("graveyard", { types: ["Creature"] })),
          }),
        ],
        {
          targets: [target.player("t")],
          label: "The player reveals 1 + your creature cards in graveyard; you choose the one they discard",
        },
      ),
    ],
  },
};
