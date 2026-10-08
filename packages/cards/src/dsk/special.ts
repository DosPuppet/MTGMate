/**
 * Duskmourn, lot B: Impending (Overlords), Enduring, additional costs (chosen by the player, with a
 * suggestion), Equipment that manifests dread, doors to unlock or lock.
 */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CREATURE_YOU_CONTROL,
  EVERYWHERE,
  eerie,
  equipAbility,
  fx,
  INSECT_2_1,
  manaAbility,
  ROOM,
  ref,
  SPIRIT_3_1,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

type Abilities = NonNullable<CardScript["abilities"]>;
type Opts = Parameters<typeof triggered>[2];

/** "Whenever this permanent enters or attacks, …" */
const entersOrAttacks = (effects: Parameters<typeof triggered>[1], opts: Opts = {}): Abilities => [
  triggered(when.entersSelf, effects, opts),
  triggered(when.attacksSelf, effects, opts),
];

/** Enduring: "When [it] dies, if it was a creature, return it; it's an enchantment (not a creature)." */
const enduring = triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { setTypes: ["Enchantment"], setSubtypes: [] })], {
  label: "Returns: it's an enchantment",
});

/** "When this Equipment enters, manifest dread, then attach this Equipment to that creature." */
const manifestAttach = triggered(when.entersSelf, [fx.manifestDreadBy({ store: "m" }), fx.attach(ref.stored("m"))], {
  label: "Manifest dread, attach it",
});

const ROOM_YOU_CONTROL = target.permanent("r", ["Enchantment"], { ...ROOM, controller: "you" }, "Room you control");

export const SPECIAL: Record<string, CardScript> = {
  // Impending (the cost and the time counters are read from the text).
  "Overlord of the Mistmoors": {
    abilities: entersOrAttacks([fx.createTokens(INSECT_2_1, 2)], { label: "Two 2/1 flying Insects" }),
  },
  "Overlord of the Floodpits": {
    abilities: entersOrAttacks([fx.draw(2), fx.discard(1)], { label: "Draw two cards, discard one" }),
  },
  "Overlord of the Balemurk": {
    abilities: entersOrAttacks(
      [
        fx.mill(4),
        fx.pickFromZone(
          "graveyard",
          { anyOf: [{ types: ["Creature"], notSubtype: "Avatar" }, { types: ["Planeswalker"] }] },
          { to: "hand" },
          { min: 0, prompt: "A non-Avatar creature or a planeswalker" },
        ),
      ],
      { label: "Mill 4, a creature into your hand" },
    ),
  },
  "Overlord of the Boilerbilges": {
    abilities: entersOrAttacks([fx.damage(4, ref.target())], { targets: [target.any()], label: "4 damage" }),
  },
  "Overlord of the Hauntwoods": {
    abilities: entersOrAttacks([fx.createTappedTokens(EVERYWHERE)], { label: "Tapped Everywhere land" }),
  },

  // Enduring
  "Enduring Innocence": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true, maxPower: 2 }), [fx.draw(1)], {
        oncePerTurn: true,
        batched: true,
        label: "Draw a card",
      }),
      enduring,
    ],
  },
  "Enduring Curiosity": {
    abilities: [triggered(when.combatDamage(CREATURE_YOU_CONTROL, true), [fx.draw(1)], { label: "Draw a card" }), enduring],
  },
  "Enduring Tenacity": {
    abilities: [
      triggered(when.gainLife, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "An opponent loses that much life",
      }),
      enduring,
    ],
  },
  "Enduring Courage": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true }), [fx.pump(ref.eventObject, 2, 0, ["haste"])], {
        label: "+2/+0 and haste",
      }),
      enduring,
    ],
  },
  "Enduring Vitality": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addAbilities: [manaAbility(["W", "U", "B", "R", "G"])] },
        { label: 'Your creatures: "{T}: one mana of any color"' },
      ),
      enduring,
    ],
  },

  // Additional costs (chosen by the player, with a suggestion)
  "Fear of Abduction": {
    additionalCost: { exile: { filter: { types: ["Creature"] }, count: 1 } },
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exile a creature an opponent controls",
      }),
      triggered(when.leavesSelf, [fx.toHand(ref.linked)], { label: "The exiled cards return to hand" }),
    ],
  },
  "Abhorrent Oculus": {
    additionalCost: { exileGraveyard: 6 },
    abilities: [triggered(when.step("upkeep", "opponent"), [fx.manifestDread], { label: "Manifest dread" })],
  },
  "Fear of Isolation": { additionalCost: { bounce: { filter: {}, count: 1 } } },
  "Fear of Exposure": { additionalCost: { tap: { filter: { types: ["Creature", "Land"] }, count: 2 } } },

  // Equipment that manifests dread
  "Cursed Windbreaker": {
    abilities: [
      manifestAttach,
      staticAbility("attached", { addKeywords: ["flying"] }, { label: "Equipped creature has flying" }),
    ],
  },
  "Killer's Mask": {
    abilities: [
      manifestAttach,
      staticAbility("attached", { addKeywords: ["menace"] }, { label: "Equipped creature has menace" }),
    ],
  },
  "Conductive Machete": {
    abilities: [manifestAttach, staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" })],
  },
  "Dissection Tools": {
    abilities: [
      manifestAttach,
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addKeywords: ["deathtouch", "lifelink"] },
        {
          label: "+2/+2, deathtouch and lifelink",
        },
      ),
      equipAbility({ sacrificeOther: { filter: { types: ["Creature"] } }, label: "Equip—Sacrifice a creature" }),
    ],
  },

  // Rooms with a door that manifests dread
  "Underwater Tunnel": {
    abilities: [triggered(when.unlockThisDoor, [fx.surveil(2)], { label: "Surveil 2" })],
  },
  "Slimy Aquarium": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.manifestDreadBy({ store: "m" }), fx.addCounters(ref.stored("m"), 1)], {
        label: "Manifest dread, +1/+1 counter",
      }),
    ],
  },
  "Moldering Gym": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        label: "A tapped basic land",
      }),
    ],
  },
  "Weight Room": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.manifestDreadBy({ store: "m" }), fx.addCounters(ref.stored("m"), 3)], {
        label: "Manifest dread, three +1/+1 counters",
      }),
    ],
  },

  // Doors
  "Ghostly Dancers": {
    abilities: [
      // "… or …": chosen on resolution (608.2d), not a mode.
      triggered(
        when.entersSelf,
        fx.yourChoice("Ghostly Dancers…", "k", [
          {
            // Option labels (an array) are not walked by the catalog test: `msg` marks them.
            label: msg("An enchantment from your graveyard into your hand"),
            effects: [fx.pickFromZone("graveyard", { types: ["Enchantment"] }, { to: "hand" }, { prompt: "Enchantment card" })],
          },
          { label: msg("Unlock a door"), effects: [fx.door(ref.permanentsOf(ref.you, ROOM))] },
        ]),
        { label: "Enchantment into your hand, or door unlocked" },
      ),
      eerie([fx.createTokens(SPIRIT_3_1)], { label: "3/1 flying Spirit" }),
    ],
  },
  "Ghostly Keybearer": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.door(ref.target("r"))], {
        targets: [target.upTo(1, ROOM_YOU_CONTROL)],
        label: "Unlock a door",
      }),
    ],
  },
  "Keys to the House": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND)],
        label: "Search for a basic land",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [ROOM_YOU_CONTROL],
        effects: [fx.door(ref.target("r"), "toggle")],
        label: "Lock or unlock a door",
      }),
    ],
  },
  "Marina Vendrell": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(7, { filter: { types: ["Enchantment"] }, count: 7, rest: "bottom" })], {
        label: "The enchantments among the top seven into your hand",
      }),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [ROOM_YOU_CONTROL],
        effects: [fx.door(ref.target("r"), "toggle")],
        label: "Lock or unlock a door",
      }),
    ],
  },
};
