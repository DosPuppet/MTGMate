/** Final Fantasy — job Equipment and other Equipment (lot B). */
import type { CardScript } from "@mtgx/engine";
import { amount, cond, equipAbility, fx, jobGear, ref, staticAbility, target, triggered, wardAbility, when } from "./common";

/** Equipment: "equipped creature has '[ability]'". */
const grants = (label: string, ...abilities: Parameters<typeof staticAbility>[1]["addAbilities"] & object) =>
  staticAbility("attached", { addAbilities: abilities }, { label });

const ENCHANTMENT = { types: ["Enchantment" as const] };

export const GEAR: Record<string, CardScript> = {
  "Astrologian's Planisphere": {
    abilities: [
      staticAbility("attached", { addSubtypes: ["Wizard"] }, { label: "Wizard" }),
      grants(
        "+1/+1 counter (noncreature spell, third card drawn)",
        triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
        triggered(when.draw(3), [fx.addCounters(ref.self, 1)], { label: "Third card: +1/+1 counter" }),
      ),
    ],
  },
  "Dark Knight's Greatsword": {
    abilities: [...(jobGear("Knight", 3, 0) ?? []), equipAbility({ payLife: 3, oncePerTurn: true, label: "Equip—Pay 3 life" })],
  },
  "Dragoon's Lance": {
    abilities: [
      ...(jobGear("Knight", 1, 0) ?? []),
      staticAbility("attached", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Flying during your turn" }),
    ],
  },
  "Machinist's Arsenal": {
    abilities: [
      staticAbility("attached", { addSubtypes: ["Artificer"] }, { label: "Artificer" }),
      staticAbility(
        "attached",
        { power: 2, toughness: 2 },
        { per: { types: ["Artifact"], controller: "you" }, label: "+2/+2 for each artifact" },
      ),
    ],
  },
  "Ninja's Blades": {
    abilities: [
      ...(jobGear("Ninja", 1, 1) ?? []),
      grants(
        "Combat damage: draw, discard, life loss",
        triggered(
          when.combatDamageToPlayer,
          [fx.draw(1), fx.discard(1, ref.you, { store: "d" }), fx.loseLife(amount.manaValueOf(ref.stored("d")), ref.eventPlayer)],
          { label: "Draw, discard, they lose life equal to its mana value" },
        ),
      ),
    ],
  },
  "Paladin's Arms": {
    abilities: [
      ...(jobGear("Knight", 2, 1) ?? []),
      staticAbility(
        "attached",
        { addAbilities: [wardAbility({ mana: { generic: 1, colored: {}, x: 0 } })] },
        { label: "Ward {1}" },
      ),
    ],
  },
  "Sage's Nouliths": {
    abilities: [
      ...(jobGear("Cleric", 1, 0) ?? []),
      grants(
        "Attacks: untap an attacking creature",
        triggered(when.attacksSelf, [fx.untap(ref.target())], {
          targets: [target.creature("t", { attacking: true })],
          label: "Untap an attacking creature",
        }),
      ),
    ],
  },
  "Thief's Knife": {
    abilities: [
      ...(jobGear("Rogue", 1, 1) ?? []),
      grants("Combat damage: draw", triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Draw" })),
    ],
  },
  "White Mage's Staff": {
    abilities: [
      ...(jobGear("Cleric", 1, 1) ?? []),
      grants("Attacks: +1 life", triggered(when.attacksSelf, [fx.gainLife(1)], { label: "+1 life" })),
    ],
  },
  "Summoner's Grimoire": {
    abilities: [
      staticAbility("attached", { addSubtypes: ["Shaman"] }, { label: "Shaman" }),
      grants(
        "Attacks: a creature from your hand",
        triggered(
          when.attacksSelf,
          [
            fx.chooseAmong(ref.handOf(ref.you, { types: ["Creature"] }), ref.you, "c", {
              anyZone: true,
              optional: true,
              prompt: "You may put a creature card from your hand onto the battlefield",
            }),
            // An enchantment card enters tapped and attacking.
            ...fx.when(
              cond.refMatches(ref.stored("c"), ENCHANTMENT),
              fx.toBattlefield(ref.stored("c"), { tapped: true, attacking: true }),
            ),
            ...fx.when(cond.not(cond.refMatches(ref.stored("c"), ENCHANTMENT)), fx.toBattlefield(ref.stored("c"))),
          ],
          { label: "Put a creature from your hand onto the battlefield" },
        ),
      ),
    ],
  },
  "Excalibur II": {
    abilities: [
      triggered(when.gainLife, [fx.counters(ref.self, "charge", 1)], { label: "Charge counter" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { perCounter: "charge", label: "+1/+1 for each charge counter" }),
    ],
  },
};
