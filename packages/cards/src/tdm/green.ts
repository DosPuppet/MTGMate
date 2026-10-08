/** Tarkir: Dragonstorm — green cards. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CREATURE_WITH_COUNTER,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  fx,
  manaAbility,
  modal,
  mode,
  RELIQUARY_DRAGON,
  ref,
  renew,
  spell,
  target,
  triggered,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Ainok Wayfarer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.you, { name: "m", filter: { types: ["Land"] } }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), store: "p" },
          ),
          ...fx.when(cond.not(cond.v("p")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Mill three cards: a land to hand, otherwise a +1/+1 counter" },
      ),
    ],
  },
  "Attuned Hunter": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.addCounters(ref.self, 1)], {
        condition: cond.yourTurn,
        batched: true,
        label: "Cards leave your graveyard during your turn: +1/+1 counter",
      }),
    ],
  },
  "Craterhoof Behemoth": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(CREATURE_YOU_CONTROL, amount.count(CREATURE_YOU_CONTROL), amount.count(CREATURE_YOU_CONTROL), ["trample"])],
        { label: "Your creatures gain trample and +X/+X" },
      ),
    ],
  },
  "Dragonbroods' Relic": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { tapAnother: "creature" }),
      activated({
        mana: "{3}{W}{U}{B}{R}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(RELIQUARY_DRAGON)],
        label: "Reliquary Dragon, a 4/4 Dragon of all colors",
      }),
    ],
  },
  "Encroaching Dragonstorm": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)], {
        label: "Search for two basic lands, put onto the battlefield tapped",
      }),
      dragonstorm(),
    ],
  },
  "Herd Heirloom": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { types: ["Creature"] } } }),
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you", minPower: 4 })],
        effects: [
          fx.modify(ref.target(), {
            addKeywords: ["trample"],
            addAbilities: [triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Damages a player: draw" })],
          }),
        ],
        label: 'Trample and "damages a player: draw"',
      }),
    ],
  },
  "Knockout Maneuver": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.addCounters(ref.target("a"), 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Krotiq Nestguard": {
    abilities: [
      activated({
        mana: "{2}{G}",
        effects: [fx.modify(ref.self, { addKeywords: ["attacksDespiteDefender"] })],
        label: "Can attack this turn despite defender",
      }),
    ],
  },
  "Nature's Rhythm": {
    spell: spell([], [fx.search({ types: ["Creature"], compare: [cmp.manaValue("<=", amount.x)] }, { to: "battlefield" })]),
  },
  "Piercing Exhale": {
    // "As an additional cost to cast this spell, you may behold a Dragon": done on casting, remembered by the spell.
    additionalCost: { behold: { filter: DRAGON_CARD } },
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creatureOrPlaneswalker("b")],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")), ...fx.when(cond.beheld, fx.surveil(2))],
    ),
  },
  "Rainveil Rejuvenator": {
    abilities: [
      triggered(when.entersSelf, fx.may("mill three cards?", fx.mill(3)), { label: "You may mill three cards" }),
      manaAbility("G", 1, { selfPower: true }),
    ],
  },
  "Rite of Renewal": {
    // The shuffled cards come from the target player's graveyard, who shuffles them into their library.
    spell: spell(
      [
        target.upTo(2, target.cardInGraveyard("p", { permanent: true }, "you", "permanent card in your graveyard")),
        target.player("pl"),
        target.of(
          ref.target("pl"),
          target.upTo(4, target.cardInGraveyard("c", {}, "any", "card in the target player's graveyard")),
        ),
      ],
      [fx.toHand(ref.target("p")), fx.moveTo(ref.target("c"), { to: "libraryTop", shuffle: true }), fx.exileOnResolve],
    ),
  },
  "Roamer's Routine": { spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]) },
  "Sarkhan's Resolve": {
    spell: modal(
      mode("+3/+3", [target.creature()], [fx.pump(ref.target(), 3, 3)]),
      mode("Destroy a creature with flying", [target.creature("d", { keyword: "flying" })], [fx.destroy(ref.target("d"))]),
    ),
  },
  "Sultai Devotee": { abilities: [devotee(["B", "G", "U"])] },
  "Synchronized Charge": {
    spell: spell(
      [target.between(1, 2, target.creature("t", { controller: "you" }))],
      [fx.countersDivided(2, ref.target()), fx.modifyAll(CREATURE_WITH_COUNTER, { addKeywords: ["vigilance", "trample"] })],
    ),
  },
  "Trade Route Envoy": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.controls(CREATURE_WITH_COUNTER), fx.draw(1)),
          ...fx.when(cond.not(cond.controls(CREATURE_WITH_COUNTER)), fx.addCounters(ref.self, 1)),
        ],
        { label: "A creature with a counter: draw; otherwise a +1/+1 counter" },
      ),
    ],
  },
  "Traveling Botanist": {
    abilities: [
      triggered(
        when.tapsSelf,
        [
          fx.lookAtTop(1, { filter: { types: ["Land"] }, count: 1, to: { to: "hand" }, rest: "top", store: "h" }),
          ...fx.when(cond.not(cond.v("h")), fx.lookAtTop(1, { count: 1, to: { to: "graveyard" }, rest: "top" })),
        ],
        { label: "Look at the top card: a land to hand, otherwise into the graveyard if you want" },
      ),
    ],
  },
  "Undergrowth Leopard": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy an artifact or an enchantment",
      }),
    ],
  },

  // --- Batch B ----------------------------------------------------------------
  "Bloomvine Regent": {
    abilities: [
      triggered(when.enters({ subtype: "Dragon", controller: "you" }), [fx.gainLife(3)], {
        label: "It or another Dragon of yours enters: gain 3 life",
      }),
    ],
  },
  "Claim Territory": {
    // "Up to two basic Forest cards, reveal them: put one onto the battlefield tapped and the other into your hand":
    // a single search (the cards found go to hand), then the choice of the one that enters the battlefield.
    spell: spell(
      [],
      [
        fx.search({ types: ["Land"], basic: true, subtype: "Forest" }, { to: "hand" }, 2, undefined, "f"),
        fx.chooseAmong(ref.stored("f"), ref.you, "bf", {
          anyZone: true,
          prompt: "Forest to put onto the battlefield tapped",
        }),
        fx.moveTo(ref.stored("bf"), { to: "battlefield", tapped: true }),
      ],
    ),
  },
  "Champion of Dusan": {
    abilities: [
      renew(
        "{1}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), 1), fx.counters(ref.target(), "trample")],
        "+1/+1 counter and trample counter",
      ),
    ],
  },
  "Dusyut Earthcarver": { abilities: [triggered(when.entersSelf, [fx.endure(ref.self, 3)], { label: "Endure 3" })] },
  "Inspirited Vanguard": {
    abilities: [
      triggered(when.entersSelf, [fx.endure(ref.self, 2)], { label: "Endure 2" }),
      triggered(when.attacksSelf, [fx.endure(ref.self, 2)], { label: "Endure 2" }),
    ],
  },
  "Lasyd Prowler": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("mill as many cards as lands you control?", fx.mill(amount.count({ types: ["Land"], controller: "you" }))),
        { label: "You may mill as many cards as lands" },
      ),
      renew(
        "{1}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), amount.countIn("graveyard", { types: ["Land"] }))],
        "X +1/+1 counters (land cards in your graveyard)",
      ),
    ],
  },
  "Sage of the Fang": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "+1/+1 counter on target creature",
      }),
      renew(
        "{3}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), 1), fx.doubleCounters(ref.target())],
        "+1/+1 counter, then double its +1/+1 counters",
      ),
    ],
  },
  "Sagu Pummeler": {
    abilities: [
      renew(
        "{4}{G}",
        [target.creature()],
        [fx.addCounters(ref.target(), 2), fx.counters(ref.target(), "reach")],
        "two +1/+1 counters and a reach counter",
      ),
    ],
  },
  "Sagu Wildling": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "Gain 3 life" })] },
  "Roost Seek": { spell: spell([], [fx.search(BASIC_LAND)]) },
  "Warden of the Grove": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", token: false, other: true }),
        [fx.endure(ref.eventObject, amount.countersOn(ref.self, "any"))],
        { label: "Another nontoken creature of yours enters: it endures X (counters on Warden)" },
      ),
    ],
  },
  "Disruptive Stormbrood": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.optional(target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"))],
        label: "Destroy up to one artifact or one enchantment",
      }),
    ],
  },
  "Petty Revenge": { spell: spell([target.creature("t", { maxPower: 3 })], [fx.destroy(ref.target())]) },
};
