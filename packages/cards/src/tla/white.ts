/** Avatar: The Last Airbender: white cards (lot A). */
import type { ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  ALLY,
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  FOOD,
  fx,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
const ALLY_YOU_CONTROL: ObjectFilter = { subtype: "Ally", controller: "you" };
/** "up to one other target nonland permanent" */
const OTHER_NONLAND_UP_TO_ONE: TargetSpec = target.upTo(1, target.nonland("t", { other: true }, "other nonland permanent"));

export const WHITE: Record<string, CardScript> = {
  "Aang, the Last Airbender": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [OTHER_NONLAND_UP_TO_ONE],
        label: "Airbend another nonland permanent",
      }),
      triggered(when.castSpell("you", { subtype: "Lesson" }), [fx.modify(ref.self, { addKeywords: ["lifelink"] })], {
        label: "Lifelink until end of turn",
      }),
    ],
  },
  "Aang's Iceberg": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [OTHER_NONLAND_UP_TO_ONE],
        label: "Exiles another nonland permanent until this leaves",
      }),
      activated({
        mana: "{3}",
        waterbend: true,
        effects: [fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }), fx.when(cond.v("s"), fx.scry(2))],
        label: "Waterbend {3}: sacrifice this enchantment, then scry 2",
      }),
    ],
  },
  "Airbender's Reversal": {
    spell: modal(
      mode("Destroys an attacking creature", [target.creature("t", { attacking: true })], [fx.destroy(ref.target())]),
      mode("Airbend a creature you control", [target.creature("u", { controller: "you" })], [fx.airbend(ref.target("u"))]),
    ),
  },
  "Airbending Lesson": {
    spell: spell([target.nonland()], [fx.airbend(ref.target()), fx.draw(1)]),
  },
  "Appa, Loyal Sky Bison": {
    abilities: [when.entersSelf, when.attacksSelf].map((w) =>
      triggeredModal(
        w,
        [
          mode(
            "A creature you control gains flying",
            [target.creature("t", { controller: "you" })],
            [fx.modify(ref.target(), { addKeywords: ["flying"] })],
          ),
          mode(
            "Airbend another nonland permanent you control",
            [target.nonland("u", { controller: "you", other: true }, "other nonland permanent you control")],
            [fx.airbend(ref.target("u"))],
          ),
        ],
        { label: "Flying, or airbend" },
      ),
    ),
  },
  "Avatar Enthusiasts": {
    abilities: [
      triggered(when.enters({ ...ALLY_YOU_CONTROL, other: true }), [fx.addCounters(ref.self, 1)], {
        label: "A +1/+1 counter",
      }),
    ],
  },
  "Compassionate Healer": {
    abilities: [triggered(when.tapsSelf, [fx.gainLife(1), fx.scry(1)], { label: "Gain 1 life, scry 1" })],
  },
  "Curious Farm Animals": {
    abilities: [
      triggered(when.diesSelf, [fx.gainLife(3)], { label: "Gain 3 life" }),
      activated({
        mana: "{2}",
        sacrifice: true,
        targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"))],
        effects: [fx.destroy(ref.target())],
        label: "Destroys an artifact or an enchantment",
      }),
    ],
  },
  "Earth Kingdom Jailer": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [
          target.upTo(
            1,
            target.permanent(
              "t",
              ["Artifact", "Creature", "Enchantment"],
              { controller: "opponent", minManaValue: 3 },
              "artifact, creature or enchantment an opponent controls with mana value 3 or greater",
            ),
          ),
        ],
        label: "Exiles a permanent an opponent controls until this leaves",
      }),
    ],
  },
  "Earth Kingdom Protectors": {
    abilities: [
      activated({
        sacrifice: true,
        targets: [
          {
            id: "t",
            label: "other Ally you control",
            filter: { objects: { ...ALLY_YOU_CONTROL, other: true } },
          },
        ],
        effects: [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
        label: "Another Ally gains indestructible",
      }),
    ],
  },
  "Enter the Avatar State": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.modify(ref.target(), {
          addSubtypes: ["Avatar"],
          addKeywords: ["flying", "firstStrike", "lifelink", "hexproof"],
        }),
      ],
    ),
  },
  "Fancy Footwork": {
    spell: spell([target.between(1, 2, target.creature())], [fx.untap(ref.target()), fx.pump(ref.target(), 2, 2)]),
  },
  "Gather the White Lotus": {
    spell: spell([], [fx.createTokens(ALLY, amount.count({ subtype: "Plains", controller: "you" })), fx.scry(2)]),
  },
  "Glider Kids": {
    abilities: [triggered(when.entersSelf, [fx.scry(1)], { label: "Scry 1" })],
  },
  "Glider Staff": {
    // Equip {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Airbend a creature",
      }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["flying"] }, { label: "+1/+1 and flying" }),
    ],
  },
  "Hakoda, Selfless Commander": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Look at the top card of your library" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { subtype: "Ally" }, what: "spells" },
        label: "Cast Ally spells from the top of your library",
      }),
      activated({
        sacrifice: true,
        effects: [fx.pumpAll(CREATURES_YOU_CONTROL, 0, 5, ["indestructible"])],
        label: "Creatures you control get +0/+5 and gain indestructible",
      }),
    ],
  },
  "Invasion Reinforcements": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "A 1/1 Ally" })],
  },
  "Jeong Jeong's Deserters": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "A +1/+1 counter on a creature",
      }),
    ],
  },
  "Kyoshi Warriors": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "A 1/1 Ally" })],
  },
  "The Legend of Yangchen": {
    abilities: [
      // "Starting with you, each player chooses up to one permanent with mana value 3 or greater from among permanents
      // your opponents control"; the chosen permanents are exiled together, once every choice is made.
      chapter(
        [1],
        [
          ...fx.forEachPlayer(ref.union(ref.you, ref.eachOpponent), (p, n) =>
            // An absent seat (fewer than six players) doesn't choose.
            fx.when(
              cond.amountAtLeast(amount.refCount(p), 1),
              fx.chooseAmong(ref.permanentsOf(ref.eachOpponent, { permanent: true, minManaValue: 3 }), p, `y${n}`, {
                optional: true,
                prompt: "You may choose a permanent with mana value 3 or greater to exile",
              }),
            ),
          ),
          fx.exile(ref.union(...Array.from({ length: 6 }, (_, n) => ref.stored(`y${n}`)))),
        ],
        { label: "Each player chooses up to one permanent an opponent controls with mana value 3 or greater: exile them" },
      ),
      chapter([2], [...fx.may("Have target opponent draw three cards?", fx.draw(3, ref.target()), fx.draw(3))], {
        targets: [target.player("t", "opponent")],
        label: "Target opponent draws three cards, then you do too",
      }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Returns transformed",
      }),
    ],
  },
  "Avatar Yangchen": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.airbend(ref.target())], {
        targets: [OTHER_NONLAND_UP_TO_ONE],
        label: "Airbend another nonland permanent",
      }),
    ],
  },
  "Master Piandao": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.lookAtTop(4, { filter: { anySubtype: ["Ally", "Equipment", "Lesson"] }, count: 1, rest: "bottom" })],
        { label: "An Ally, an Equipment or a Lesson among the top four" },
      ),
    ],
  },
  "Momo, Playful Pet": {
    abilities: [
      triggeredModal(
        when.leavesSelf,
        [
          mode("A Food", [], [fx.createTokens(FOOD)]),
          mode(
            "A +1/+1 counter on a creature you control",
            [target.creature("t", { controller: "you" })],
            [fx.addCounters(ref.target(), 1)],
          ),
          mode("Scry 2", [], [fx.scry(2)]),
        ],
        { label: "Food, +1/+1 counter or scry 2" },
      ),
    ],
  },
  "Path to Redemption": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Can't attack or block" }),
      activated({
        mana: "{5}",
        sacrifice: true,
        activationCondition: cond.yourTurn,
        effects: [fx.exile(ref.attached), fx.createTokens(ALLY)],
        label: "Exiles the enchanted creature, a 1/1 Ally",
      }),
    ],
  },
  "Rabaroo Troop": {
    // Plainscycling {2}: read from the text.
    abilities: [
      triggered(when.landfall, [fx.modify(ref.self, { addKeywords: ["flying"] }), fx.gainLife(1)], {
        label: "Flying until end of turn, gain 1 life",
      }),
    ],
  },
  "Razor Rings": {
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [fx.damageStoringExcess(4, ref.target(), "excess"), fx.gainLife(amount.v("excess"))],
    ),
  },
  "Sandbenders' Storm": {
    spell: modal(
      mode("Destroys a creature with power 4 or greater", [target.creature("t", { minPower: 4 })], [fx.destroy(ref.target())]),
      mode(
        "Earthbend 3",
        [target.permanent("u", ["Land"], { controller: "you" }, "land you control")],
        fx.earthbend(ref.target("u"), 3),
      ),
    ),
  },
  "South Pole Voyager": {
    abilities: [
      triggered(
        when.enters(ALLY_YOU_CONTROL),
        [fx.gainLife(1), fx.countResolution("n"), fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1))],
        { label: "Gain 1 life; on the second resolution this turn, draw" },
      ),
    ],
  },
  "Southern Air Temple": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.addCountersAll(CREATURES_YOU_CONTROL, amount.count({ subtype: "Shrine", controller: "you" }))],
        { label: "X +1/+1 counters on each creature you control (X: your Shrines)" },
      ),
      triggered(
        when.enters({ subtype: "Shrine", controller: "you", other: true }),
        [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)],
        { label: "A +1/+1 counter on each creature you control" },
      ),
    ],
  },
  "Suki, Courageous Rescuer": {
    abilities: [
      staticAbility({ ...CREATURES_YOU_CONTROL, other: true }, { power: 1 }, { label: "Other creatures you control get +1/+0" }),
      triggered(when.leaves({ permanent: true, controller: "you", other: true }), [fx.createTokens(ALLY)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "A 1/1 Ally (once each turn)",
      }),
    ],
  },
  "Team Avatar": {
    abilities: [
      triggered(
        when.attacksAlone(CREATURES_YOU_CONTROL),
        [fx.pump(ref.eventObject, amount.count(CREATURES_YOU_CONTROL), amount.count(CREATURES_YOU_CONTROL))],
        { label: "+X/+X (X: your creatures)" },
      ),
      activated({
        mana: "{2}{W}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature()],
        effects: [fx.damage(amount.count(CREATURES_YOU_CONTROL), ref.target())],
        label: "Damage equal to the number of creatures you control",
      }),
    ],
  },
  "United Front": {
    spell: spell([], [fx.createTokens(ALLY, amount.x), fx.addCountersAll(CREATURES_YOU_CONTROL, 1)]),
  },
  "Vengeful Villagers": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.tap(ref.target()),
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, 1, {
            optional: true,
            store: "s",
          }),
          fx.when(cond.v("s"), fx.counters(ref.target(), "stun")),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Taps a creature an opponent controls; by sacrificing, a stun counter",
        },
      ),
    ],
  },
  "Water Tribe Captain": {
    abilities: [
      activated({
        mana: "{5}",
        effects: [fx.pumpAll(CREATURES_YOU_CONTROL, 1, 1)],
        label: "Creatures you control get +1/+1",
      }),
    ],
  },
  "Water Tribe Rallier": {
    abilities: [
      activated({
        mana: "{5}",
        waterbend: true,
        effects: [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 3 }, count: 1, rest: "bottom" })],
        label: "Waterbend {5}: a creature with power 3 or less among the top four",
      }),
    ],
  },
  "Yip Yip!": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.pump(ref.target(), 2, 2),
        fx.when(cond.targetMatches("t", { subtype: "Ally" }), fx.modify(ref.target(), { addKeywords: ["flying"] })),
      ],
    ),
  },
  "Destined Confrontation": {
    spell: spell([], [fx.keep(ref.eachPlayer, "totalPower", { types: ["Creature"] }, { max: 4 })]),
  },
};
