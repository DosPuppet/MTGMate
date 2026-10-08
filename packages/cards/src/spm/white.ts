/** Marvel's Spider-Man — white cards (lot A). */
import type { ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  entersWith,
  eventReplacement,
  FOOD,
  fx,
  HUMAN_CITIZEN,
  modal,
  mode,
  ref,
  SPIDER_21,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Flash Thompson: the creature to tap and the one to untap. */
const TO_TAP: TargetSpec = { ...target.creature("a"), label: "creature to tap" };
const TO_UNTAP: TargetSpec = { ...target.creature("b"), label: "creature to untap" };

export const WHITE: Record<string, CardScript> = {
  "Anti-Venom, Horrifying Healer": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        condition: cond.wasCast,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
        label: "If it was cast: a creature card from your graveyard onto the battlefield",
      }),
      eventReplacement({
        event: "damage",
        toFilter: { self: true },
        modify: { prevent: true },
        onPrevent: { counters: "+1/+1" },
        label: "Prevents damage that would be dealt to it and gets that many +1/+1 counters",
      }),
    ],
  },
  "City Pigeon": {
    // Flying: read from the text.
    abilities: [triggered(when.leavesSelf, [fx.createTokens(FOOD)], { label: "Create a Food" })],
  },
  "Costume Closet": {
    abilities: [
      entersWith({ counters: 2, label: "Enters with two +1/+1 counters" }),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.removeCounters(ref.self, 1, "+1/+1", "m"), fx.addCounters(ref.target(), amount.v("m"))],
        label: "Move a +1/+1 counter from this artifact onto a creature you control",
      }),
      triggered(when.leaves({ ...CREATURES_YOU_CONTROL, modified: true }), [fx.addCounters(ref.self, 1)], {
        label: "A modified creature you control leaves: a +1/+1 counter",
      }),
    ],
  },
  "Daily Bugle Reporters": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Puff Piece — a +1/+1 counter on each of up to two creatures",
            [target.upTo(2, target.creature("a"))],
            [fx.addCounters(ref.target("a"), 1)],
          ),
          mode(
            "Investigative Journalism — a creature card with mana value 2 or less from your graveyard to your hand",
            [
              target.cardInGraveyard(
                "g",
                { types: ["Creature"], maxManaValue: 2 },
                "you",
                "creature card with mana value 2 or less",
              ),
            ],
            [fx.toHand(ref.target("g"))],
          ),
        ],
        { label: "Choose a mode" },
      ),
    ],
  },
  "Flash Thompson, Spider-Fan": {
    // Flash: read from the text. "Choose one or both."
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Heckle — tap a creature", [TO_TAP], [fx.tap(ref.target("a"))]),
          mode("Hero Worship — untap a creature", [TO_UNTAP], [fx.untap(ref.target("b"))]),
          mode("Both", [TO_TAP, TO_UNTAP], [fx.tap(ref.target("a")), fx.untap(ref.target("b"))]),
        ],
        { label: "Choose one or both" },
      ),
    ],
  },
  "Friendly Neighborhood": {
    enchant: { filter: { types: ["Land"] }, label: "land" },
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HUMAN_CITIZEN, 3)], { label: "Create three 1/1 Human Citizens" }),
      staticAbility(
        "attached",
        {
          addAbilities: [
            activated({
              mana: "{1}",
              tap: true,
              sorcerySpeed: true,
              targets: [target.creature()],
              effects: [fx.pump(ref.target(), amount.count(CREATURES_YOU_CONTROL), amount.count(CREATURES_YOU_CONTROL))],
              label: "+1/+1 for each creature you control",
            }),
          ],
        },
        { label: 'Enchanted land has "{1}, {T}: +1/+1 for each creature you control"' },
      ),
    ],
  },
  "Origin of Spider-Man": {
    abilities: [
      chapter([1], [fx.createTokens(SPIDER_21)], { label: "Chapter I — a 2/1 Spider with reach" }),
      chapter(
        [2],
        [
          fx.addCounters(ref.target(), 1),
          fx.modify(ref.target(), { addSupertypes: ["Legendary"], addSubtypes: ["Spider", "Hero"] }, "permanent"),
        ],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Chapter II — a +1/+1 counter; it becomes a legendary Spider Hero",
        },
      ),
      chapter([3], [fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Chapter III — double strike until end of turn",
      }),
    ],
  },
  "Rent Is Due": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.tapChosen({ anyOf: [{ types: ["Creature"] }, { subtype: "Treasure" }] }, "tapped", { exactly: 2 }),
          ...fx.when(cond.v("tapped", 2), fx.draw(1)),
          ...fx.when(cond.not(cond.v("tapped", 2)), fx.sacrificeIt(ref.self)),
        ],
        { label: "Tap two creatures and/or Treasures: draw a card; otherwise, sacrifice it" },
      ),
    ],
  },
  "Selfless Police Captain": {
    abilities: [
      entersWith({ counters: 1, label: "Enters with a +1/+1 counter" }),
      triggered(when.leavesSelf, [fx.addCounters(ref.target(), amount.lkiCounters("+1/+1"))], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Its +1/+1 counters onto a creature you control",
      }),
    ],
  },
  "Silver Sable, Mercenary Leader": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { other: true })],
        label: "A +1/+1 counter on another creature",
      }),
      triggered(when.attacksSelf, [fx.modify(ref.target(), { addKeywords: ["lifelink"] })], {
        targets: [target.creature("t", { controller: "you", modified: true })],
        label: "A modified creature you control gains lifelink",
      }),
    ],
  },
  "Spectacular Spider-Man": {
    // Flash: read from the text.
    abilities: [
      activated({
        mana: "{1}",
        effects: [fx.modify(ref.self, { addKeywords: ["flying"] })],
        label: "Gains flying until end of turn",
      }),
      activated({
        mana: "{1}",
        sacrifice: true,
        effects: [fx.modifyAll(CREATURES_YOU_CONTROL, { addKeywords: ["hexproof", "indestructible"] })],
        label: "Creatures you control gain hexproof and indestructible",
      }),
    ],
  },
  "Spectacular Tactics": {
    spell: modal(
      mode(
        "A +1/+1 counter on a creature you control, which gains hexproof",
        [target.creature("t", { controller: "you" })],
        [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["hexproof"] })],
      ),
      mode("Destroy a creature with power 4 or greater", [target.creature("d", { minPower: 4 })], [fx.destroy(ref.target("d"))]),
    ),
  },
  // Web-slinging {W}: read from the text.
  "Spider-Man, Web-Slinger": {},
  "Spider-UK": {
    // Web-slinging {2}{W}: read from the text.
    abilities: [
      triggered(when.yourEndStep, [fx.draw(1), fx.gainLife(2)], {
        condition: cond.amountAtLeast(
          amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }),
          2,
        ),
        label: "Two or more creatures entered under your control: draw a card, gain 2 life",
      }),
    ],
  },
  "Starling, Aerial Ally": {
    // Flying: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["flying"] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature you control gains flying",
      }),
    ],
  },
  "Sudden Strike": {
    spell: spell(
      [
        {
          id: "t",
          label: "attacking or blocking creature",
          filter: { objects: { types: ["Creature"], anyOf: [{ attacking: true }, { blocking: true }] } },
        },
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Thwip!": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 2, 2, ["flying"]), ...fx.when(cond.targetMatches("t", { subtype: "Spider" }), fx.gainLife(2))],
    ),
  },
  "Web Up": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls")],
        label: "Exiles a nonland permanent an opponent controls until it leaves",
      }),
    ],
  },
  "Web-Shooters": {
    // Equip {2}: read from the text.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addKeywords: ["reach"],
          addAbilities: [
            triggered(when.attacksSelf, [fx.tap(ref.target())], {
              targets: [target.creature("t", { controller: "opponent" })],
              label: "Tap a creature an opponent controls",
            }),
          ],
        },
        { label: '+1/+1, reach and "when it attacks, tap a creature an opponent controls"' },
      ),
    ],
  },
  "Wild Pack Squad": {
    abilities: [
      triggered(when.yourCombat, [fx.modify(ref.target(), { addKeywords: ["firstStrike", "vigilance"] })], {
        targets: [target.upTo(1, target.creature())],
        label: "Up to one creature gains first strike and vigilance",
      }),
    ],
  },
};
