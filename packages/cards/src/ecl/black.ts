/** Lorwyn Eclipsed: black cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  beholdOrPay,
  type CardScript,
  champion,
  cond,
  ELF_BG,
  entersWith,
  eventReplacement,
  FAERIE_UB,
  fx,
  GOBLIN_BR,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** "You may blight N. If you do, …" */
const mayBlight = (n: number, ...then: Parameters<typeof fx.when>[1][]) => [
  ...fx.may(msg("Blight {n}?", { n }), fx.blight(n, ref.you, "blighted")),
  ...fx.when(cond.v("blighted"), ...then),
];

/** "an Elf card in your graveyard" */
const ELF_IN_GRAVEYARD = cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Elf" }), 1);

/** "your main phase" */
const YOUR_MAIN_PHASE = cond.all(cond.yourTurn, cond.any(cond.step("main1"), cond.step("main2")));

export const BLACK: Record<string, CardScript> = {
  "Mornsong Aria": {
    abilities: [
      eventReplacement({ event: "draw", modify: { prevent: true }, label: "Players can't draw cards" }),
      eventReplacement({
        event: "lifeGain",
        modify: { prevent: true },
        label: "Players can't gain life",
      }),
      triggered(when.step("draw", "any"), [fx.loseLife(3, ref.eventPlayer), fx.search({}, { to: "hand" }, 1, ref.eventPlayer)], {
        label: "That player loses 3 life and searches their library for a card",
      }),
    ],
  },
  "Twilight Diviner": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" }),
      // "One or more other creatures" (those that entered or were cast from a graveyard): only once each turn, a copy of
      // one of them, of your choice.
      triggered(
        { on: "enters", who: { types: ["Creature"], controller: "you", other: true }, fromZone: "graveyard" },
        [
          fx.chooseAmong(ref.eventObjects, ref.you, "c", { prompt: "Choose the creature to copy" }),
          fx.copyToken(ref.stored("c")),
        ],
        {
          oncePerTurn: true,
          batched: true,
          label: "Creatures back from the graveyard: token copy of one of them (once each turn)",
        },
      ),
    ],
  },
  "Taster of Wares": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileFromHandLinked(ref.target(), {}, false, amount.count({ subtype: "Goblin", controller: "you" }))],
        {
          targets: [target.player("t", "opponent")],
          label: "The opponent reveals X cards from their hand; you choose one, which they exile",
        },
      ),
      playerStatic({
        playFrom: { zone: "linked", what: "spells", filter: { types: ["Instant", "Sorcery"] }, anyMana: true },
        label: "While you control it: cast the exiled instant or sorcery (mana of any type)",
      }),
    ],
  },
  "Dawnhand Dissident": {
    abilities: [
      activated({ tap: true, blight: 1, effects: [fx.surveil(1)], label: "Blight 1: surveil 1" }),
      activated({
        tap: true,
        blight: 2,
        targets: [target.cardInGraveyard("t", {}, "any", "card in a graveyard")],
        effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
        label: "Blight 2: exile a card from a graveyard",
      }),
      playerStatic({
        playFrom: { zone: "linked", what: "spells", filter: { types: ["Creature"], owner: "you" }, removeCountersAmong: 3 },
        condition: cond.yourTurn,
        label: "During your turn: cast a creature exiled with it by removing three counters from among your creatures",
      }),
    ],
  },
  Unbury: {
    spell: modal(
      mode(
        "Return a creature card from your graveyard to your hand",
        [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")],
        [fx.toHand(ref.target())],
      ),
      mode(
        "Return two creature cards that share a creature type",
        [
          {
            ...target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature cards that share a type"),
            count: 2,
            shareCreatureType: true,
          },
        ],
        [fx.toHand(ref.target())],
      ),
    ),
  },
  // Flash and equip read from the text.
  "Barbed Bloodletter": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.modify(ref.target(), { addKeywords: ["wither"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it to a creature you control, which gains wither",
      }),
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    ],
  },
  // Convoke read from the text.
  "Bloodline Bidding": {
    spell: spell(
      [],
      [
        fx.chooseForSelf("creatureType"),
        fx.moveAll("graveyard", ref.you, { types: ["Creature"], subtypeChosen: true }, { to: "battlefield" }),
      ],
    ),
  },
  // "As an additional cost, blight 1 or pay {3}": read from the text (`kickerOrPay`).
  "Bogslither's Embrace": { spell: spell([target.creature()], [fx.exile(ref.target())]) },
  "Champion of the Weird": champion("Goblin", [
    activated({
      payLife: 1,
      blight: 2,
      sorcerySpeed: true,
      targets: [target.player("t", "opponent")],
      effects: [fx.blight(2, ref.target())],
      label: "Pay 1 life, blight 2: target opponent blights 2",
    }),
  ]),
  // --- Grub (double-faced) ---------------------------------------------------
  "Grub, Storied Matriarch": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) =>
        triggered(w, [fx.toHand(ref.target())], {
          targets: [target.upTo(1, target.cardInGraveyard("t", { subtype: "Goblin" }, "you", "Goblin card"))],
          label: "Return a Goblin card from your graveyard to your hand",
        }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{R}", "Pay {R} to transform Grub?", fx.transform()), {
        label: "You may pay {R}: transform Grub",
      }),
    ],
  },
  "Grub, Notorious Auntie": {
    abilities: [
      // "Create a token that's tapped and attacking, a copy of the blighted creature, sacrificed at the beginning of the end step."
      triggered(
        when.attacksSelf,
        mayBlight(1, fx.copyToken(ref.stored("blighted"), { tapped: true, attacking: true, sacrificeAtEndStep: true })),
        { label: "Blight 1: attacking token copy of the blighted creature" },
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{B}", "Pay {B} to transform Grub?", fx.transform()), {
        label: "You may pay {B}: transform Grub",
      }),
    ],
  },
  "Auntie's Sentence": {
    spell: modal(
      mode(
        "The opponent reveals their hand; they discard the chosen nonland permanent card",
        [target.player("p", "opponent")],
        [fx.discard(1, ref.target("p"), { chooser: "controller", filter: { permanent: true, notTypes: ["Land"] } })],
      ),
      mode("A creature gets -2/-2", [target.creature("c")], [fx.pump(ref.target("c"), -2, -2)]),
    ),
  },
  "Bile-Vial Boggart": {
    abilities: [
      triggered(when.diesSelf, [fx.counters(ref.target(), "-1/-1", 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "A -1/-1 counter on a creature",
      }),
    ],
  },
  "Bitterbloom Bearer": {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(FAERIE_UB)], {
        label: "You lose 1 life; 1/1 Faerie token with flying",
      }),
    ],
  },
  "Blight Rot": { spell: spell([target.creature()], [fx.counters(ref.target(), "-1/-1", 4)]) },
  "Blighted Blackthorn": {
    abilities: [
      triggered(when.entersSelf, mayBlight(2, fx.draw(1), fx.loseLife(1)), {
        label: "Blight 2: draw a card, lose 1 life",
      }),
      triggered(when.attacksSelf, mayBlight(2, fx.draw(1), fx.loseLife(1)), {
        label: "Blight 2: draw a card, lose 1 life",
      }),
    ],
  },
  "Boggart Mischief": {
    abilities: [
      triggered(when.entersSelf, mayBlight(1, fx.createTokens(GOBLIN_BR, 2)), {
        label: "Blight 1: two 1/1 Goblin tokens",
      }),
      triggered(when.dies({ types: ["Creature"], subtype: "Goblin", controller: "you" }), fx.drain(1), {
        label: "A Goblin dies: each opponent loses 1 life, you gain 1",
      }),
    ],
  },
  "Boggart Prankster": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 1, 0)], {
        targets: [target.creature("t", { controller: "you", attacking: true, subtype: "Goblin" })],
        label: "An attacking Goblin gets +1/+0",
      }),
    ],
  },
  "Creakwood Safewright": {
    abilities: [
      entersWith({ counters: 3, counterKind: "-1/-1", label: "Enters with three -1/-1 counters" }),
      triggered(when.yourEndStep, [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.all(ELF_IN_GRAVEYARD, cond.counterAtLeast("-1/-1", 1)),
        label: "Elf in graveyard: remove a -1/-1 counter",
      }),
    ],
  },
  "Darkness Descends": { spell: spell([], [fx.addCountersAll({ types: ["Creature"] }, 2, "-1/-1")]) },
  "Dawnhand Eulogist": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3), ...fx.when(ELF_IN_GRAVEYARD, fx.drain(2))], {
        label: "Mill 3; Elf in graveyard: each opponent loses 2 life, you gain 2",
      }),
    ],
  },
  "Dose of Dawnglow": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
      [fx.toBattlefield(ref.target()), ...fx.when(cond.not(YOUR_MAIN_PHASE), fx.blight(2))],
    ),
  },
  "Dream Seizer": {
    abilities: [
      triggered(when.entersSelf, mayBlight(1, fx.discard(1, ref.eachOpponent)), {
        label: "Blight 1: each opponent discards a card",
      }),
    ],
  },
  "Gloom Ripper": {
    abilities: (() => {
      // X: the Elves you control plus the Elf cards in your graveyard.
      const x = amount.plus(amount.count({ subtype: "Elf", controller: "you" }), amount.countIn("graveyard", { subtype: "Elf" }));
      return [
        triggered(when.entersSelf, [fx.pump(ref.target("a"), x, 0), fx.pump(ref.target("b"), 0, amount.neg(x))], {
          targets: [
            target.creature("a", { controller: "you" }),
            target.upTo(1, target.creature("b", { controller: "opponent" })),
          ],
          label: "+X/+0 to your creature, -0/-X to an opposing creature",
        }),
      ];
    })(),
  },
  "Gnarlbark Elm": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      activated({
        mana: "{2}{B}",
        removeCounters: { kind: "any", n: 2 },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -2, -2)],
        label: "A creature gets -2/-2",
      }),
    ],
  },
  Graveshifter: {
    abilities: [
      triggered(when.entersSelf, fx.may("Return the creature card to your hand?", fx.toHand(ref.target())), {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
        label: "Returns a creature card from your graveyard to your hand",
      }),
    ],
  },
  "Gutsplitter Gang": {
    abilities: [
      triggered(
        when.step("main1", "you"),
        [
          ...fx.may("Blight 2? (otherwise, you lose 3 life)", fx.blight(2, ref.you, "blighted")),
          ...fx.when(cond.not(cond.v("blighted")), fx.loseLife(3)),
        ],
        { label: "Blight 2, otherwise you lose 3 life" },
      ),
    ],
  },
  "Heirloom Auntie": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true }),
        [fx.surveil(1), fx.removeCounters(ref.self, 1, "-1/-1")],
        { label: "Surveil 1, then remove a -1/-1 counter" },
      ),
    ],
  },
  "Moonglove Extractor": {
    abilities: [triggered(when.attacksSelf, [fx.draw(1), fx.loseLife(1)], { label: "Draw a card, lose 1 life" })],
  },
  "Mudbutton Cursetosser": {
    additionalCost: beholdOrPay("Goblin", 2),
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.diesSelf, [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxPower: 2 })],
        label: "Destroy an opposing creature with power 2 or less",
      }),
    ],
  },
  "Nameless Inversion": {
    // "Loses all creature types": subtypes removed; changeling too, otherwise it would keep them.
    spell: spell(
      [target.creature()],
      [fx.modify(ref.target(), { power: 3, toughness: -3, setSubtypes: [], removeKeywords: ["changeling"] })],
    ),
  },
  "Nightmare Sower": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.counters(ref.target(), "-1/-1", 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "Spell cast during an opponent's turn: a -1/-1 counter",
      }),
    ],
  },
  "Perfect Intimidation": {
    spell: (() => {
      const exileTwo = fx.discard(2, ref.target("p"), { exile: true });
      const removeAll = fx.removeCounters(ref.target("c"), 999);
      return modal(
        mode("The opponent exiles two cards from their hand", [target.player("p", "opponent")], [exileTwo]),
        mode("Remove all counters from a creature", [target.creature("c")], [removeAll]),
        mode("Both", [target.player("p", "opponent"), target.creature("c")], [exileTwo, removeAll]),
      );
    })(),
  },
  "Retched Wretch": {
    abilities: [
      triggered(
        when.diesSelf,
        [
          fx.moveTo(ref.selfCard, { to: "battlefield" }, { name: "back" }),
          fx.modify(ref.stored("back"), { loseAllAbilities: true }, "permanent"),
        ],
        {
          condition: cond.amountAtLeast(amount.lkiCounters("-1/-1"), 1),
          label: "Had a -1/-1 counter: returns to the battlefield with no abilities",
        },
      ),
    ],
  },
  "Scarblade Scout": {
    abilities: [triggered(when.entersSelf, [fx.mill(2)], { label: "Mill 2" })],
  },
  "Scarblade's Malice": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.modify(ref.target(), { addKeywords: ["deathtouch", "lifelink"] }),
        fx.whenThisTurn(when.dies({}), ref.target(), [fx.createTokens(ELF_BG)], { label: "2/2 Elf token" }),
      ],
    ),
  },
  Shimmercreep: {
    abilities: [
      triggered(when.entersSelf, fx.drain(amount.colorsAmong()), {
        label: "Vivid: each opponent loses X life, you gain X",
      }),
    ],
  },
};
