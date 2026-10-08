/** Tarkir: Dragonstorm — blue cards. */
import {
  activated,
  amount,
  BIRD_W,
  type CardScript,
  CREATURE_OPP,
  cond,
  costReducer,
  devotee,
  doesntUntap,
  dragonstorm,
  flurry,
  fx,
  INSTANT_SORCERY,
  modal,
  mode,
  playerStatic,
  ref,
  renew,
  spell,
  staticAbility,
  target,
  triggered,
  when,
  ZOMBIE_DRUID,
} from "./common";

const CREATURE = { filter: { types: ["Creature" as const] }, label: "creature" };

export const BLUE: Record<string, CardScript> = {
  "Aegis Sculptor": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          ...fx.may(
            "exile two cards from your graveyard for a +1/+1 counter?",
            fx.pickFromZone("graveyard", {}, { to: "exile" }, { count: 2, min: 2, store: "x" }),
          ),
          ...fx.when(cond.v("x", 2), fx.addCounters(ref.self, 1)),
        ],
        {
          condition: cond.amountAtLeast(amount.cardsIn("graveyard"), 2),
          label: "Exile two cards from your graveyard: +1/+1 counter",
        },
      ),
    ],
  },
  "Ambling Stormshell": {
    abilities: [
      triggered(when.attacksSelf, [fx.counters(ref.self, "stun", 3), fx.draw(3)], {
        label: "Three stun counters, draw three cards",
      }),
      triggered(when.castSpell("you", { subtype: "Turtle" }), [fx.untap(ref.self)], { label: "Turtle spell: untaps" }),
    ],
  },
  "Bewildering Blizzard": { spell: spell([], [fx.draw(3), fx.pumpAll(CREATURE_OPP, -3, 0)]) },
  Dragonologist: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(6, {
            filter: { anyOf: [{ types: ["Instant", "Sorcery"] }, { subtype: "Dragon" }] },
            count: 1,
            rest: "bottom",
          }),
        ],
        { label: "Look at six cards: an instant, a sorcery or a Dragon to hand" },
      ),
      staticAbility(
        { subtype: "Dragon", controller: "you", tapped: false },
        { addKeywords: ["hexproof"] },
        { label: "Your untapped Dragons have hexproof" },
      ),
    ],
  },
  "Dragonstorm Forecaster": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.search({ anyOf: [{ name: "Dragonstorm Globe" }, { name: "Boulderborn Dragon" }] })],
        label: "Search for Dragonstorm Globe or Boulderborn Dragon",
      }),
    ],
  },
  "Essence Anchor": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveil 1" }),
      activated({
        tap: true,
        activationCondition: cond.all(cond.yourTurn, cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1)),
        effects: [fx.createTokens(ZOMBIE_DRUID)],
        label: "A 2/2 Zombie Druid (a card left your graveyard this turn)",
      }),
    ],
  },
  "Focus the Mind": {
    costReduction: { generic: 2, condition: cond.castThisTurn(1) },
    spell: spell([], [fx.draw(3), fx.discard(1)]),
  },
  "Fresh Start": {
    enchant: CREATURE,
    abilities: [staticAbility("attached", { power: -5, loseAllAbilities: true }, { label: "-5/-0, loses all abilities" })],
  },
  "Highspire Bell-Ringer": {
    abilities: [
      costReducer({}, 1, "The second spell each turn costs {1} less", { condition: cond.castThisTurn(1, false, true) }),
    ],
  },
  "Humbling Elder": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -2, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "An opponent's creature gets -2/-0",
      }),
    ],
  },
  "Iceridge Serpent": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Returns an opponent's creature",
      }),
    ],
  },
  "Kishla Trawlers": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "exile a creature card from your graveyard?",
            fx.pickFromZone("graveyard", { types: ["Creature"] }, { to: "exile" }, { count: 1, min: 1, store: "x" }),
          ),
          ...fx.when(
            cond.v("x"),
            fx.reflexive(
              [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card")],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        { label: "Exile a creature from your graveyard: an instant or a sorcery returns to hand" },
      ),
    ],
  },
  "Ringing Strike Mastery": {
    enchant: CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Taps the enchanted creature" }),
      staticAbility(
        "attached",
        { addAbilities: [activated({ mana: "{5}", effects: [fx.untap(ref.self)], label: "{5}: untap this creature" })] },
        { label: '"{5}: untap this creature"' },
      ),
      doesntUntap("attached"),
    ],
  },
  "Riverwalk Technique": {
    spell: modal(
      mode("On top or on the bottom of the library", [target.nonland()], [fx.topOrBottom(ref.target())]),
      mode(
        "Counter a noncreature spell",
        [target.spell("s", { notTypes: ["Creature"] }, "noncreature spell")],
        [fx.counter(ref.target("s"))],
      ),
    ),
  },
  "Roiling Dragonstorm": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], { label: "Draw two cards, then discard one" }),
      dragonstorm(),
    ],
  },
  "Sibsig Appraiser": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(2, { count: 1, rest: "graveyard", exact: true })], {
        label: "Look at two cards: one to hand, the other to the graveyard",
      }),
    ],
  },
  "Snowmelt Stag": {
    abilities: [
      staticAbility("self", { setPower: 5, setToughness: 2 }, { condition: cond.yourTurn, label: "Base 5/2 during your turn" }),
      activated({
        mana: "{5}{U}{U}",
        effects: [fx.modify(ref.self, { addKeywords: ["unblockable"] })],
        label: "Can't be blocked this turn",
      }),
    ],
  },
  "Spectral Denial": {
    costReduction: { generic: amount.count({ types: ["Creature"], controller: "you", minPower: 4 }) },
    spell: spell(
      [target.spell()],
      [...fx.unlessPays(ref.controllerOf(ref.target()), { genericAmount: amount.x }, fx.counter(ref.target()))],
    ),
  },
  "Stillness in Motion": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.mill(3),
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.cardsIn("library"), 1)),
            fx.exile(ref.self),
            fx.pickFromZone(
              "graveyard",
              {},
              { to: "libraryTop" },
              { count: 5, min: 5, prompt: "Five cards to put back on top of your library" },
            ),
          ),
        ],
        { label: "Mill three cards; empty library: five cards go back on top" },
      ),
    ],
  },
  "Temur Devotee": { abilities: [devotee(["G", "U", "R"])] },
  "Unending Whisper": { spell: spell([], [fx.draw(1)]) },
  "Ureni's Rebuff": { spell: spell([target.creature()], [fx.bounce(ref.target())]) },
  "Veteran Ice Climber": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.attacksSelf, [fx.mill(amount.powerOf(ref.self), ref.target())], {
        targets: [target.optional(target.player())],
        label: "A player mills as many cards as its power",
      }),
    ],
  },
  "Wingspan Stride": {
    enchant: CREATURE,
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["flying"] }, { label: "+1/+1 and flying" }),
      activated({ mana: "{2}{U}", effects: [fx.bounce(ref.self)], label: "Return this Aura to hand" }),
    ],
  },

  // --- Batch B ----------------------------------------------------------------
  "Agent of Kotis": {
    abilities: [renew("{3}{U}", [target.creature()], [fx.addCounters(ref.target(), 2)], "two +1/+1 counters on a creature")],
  },
  "Constrictor Sage": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Taps an opponent's creature, stun counter",
      }),
      renew(
        "{2}{U}",
        [target.creature("t", { controller: "opponent" })],
        [fx.tap(ref.target()), fx.counters(ref.target(), "stun")],
        "tap an opponent's creature, stun counter",
      ),
    ],
  },
  "Skimming Strike": { spell: spell([target.optional(target.creature())], [fx.tap(ref.target()), fx.draw(1)]) },
  "Marang River Regent": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(2, target.nonland("t", { other: true }, "other nonland permanent"))],
        label: "Returns up to two other nonland permanents",
      }),
    ],
  },
  "Coil and Catch": { spell: spell([], [fx.draw(3), fx.discard(1)]) },
  "Naga Fleshcrafter": {
    asEnters: [fx.chooseCopy({ types: ["Creature"] }, { anyController: true })],
    abilities: [
      renew(
        "{2}{U}",
        [target.creature("t", { controller: "you", legendary: false })],
        [
          fx.addCounters(ref.target(), 1),
          fx.becomeCopy(ref.except(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.target()), ref.target()),
        ],
        "+1/+1 counter; your other creatures become copies of it",
      ),
    ],
  },
  "Wingblade Disciple": { abilities: [flurry([fx.createTokens(BIRD_W)], "a 1/1 flying Bird")] },
  "Whirlwing Stormbrood": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { anyOf: [{ types: ["Sorcery"] }, { subtype: "Dragon" }] }, keywords: ["flash"] },
        label: "Your sorceries and Dragon spells have flash",
      }),
    ],
  },
  "Dynamic Soar": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 3)]),
  },
};
