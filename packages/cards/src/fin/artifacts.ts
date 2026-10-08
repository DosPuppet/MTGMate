/** Final Fantasy — colorless artifacts. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  fx,
  jobGear,
  manaAbility,
  ref,
  staticAbility,
  TOWN,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const ARTIFACTS: Record<string, CardScript> = {
  "Adventurer's Airship": { abilities: [triggered(when.attacksSelf, fx.loot(1), { label: "Draw, then discard" })] },
  "Instant Ramen": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw" }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 life" }),
    ],
  },
  "Lion Heart": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 damage" }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Lunatic Pandora": {
    abilities: [
      activated({ mana: "{2}", tap: true, effects: [fx.surveil(1)], label: "Surveil 1" }),
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [target.nonland("t")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy a nonland permanent",
      }),
    ],
  },
  "Magic Pot": {
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Treasure" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any", "card")],
        effects: [fx.exileCard(ref.target())],
        label: "Exile a card from a graveyard",
      }),
    ],
  },
  "Monk's Fist": { abilities: jobGear("Monk", 1, 0) },
  "PuPu UFO": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, prompt: "Put a land onto the battlefield" },
          ),
        ],
        label: "A land from your hand",
      }),
      activated({
        mana: "{3}",
        effects: [fx.setBasePTAll({ self: true }, amount.count({ ...TOWN, controller: "you" }), true)],
        label: "Base power = number of Towns",
      }),
    ],
  },
  "The Regalia": {
    abilities: [
      triggered(when.attacksSelf, [fx.revealUntil({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Reveal until a land",
      }),
    ],
  },
  "Ring of the Lucii": {
    abilities: [
      manaAbility("C", 2),
      activated({
        mana: "{2}",
        tap: true,
        payLife: 1,
        targets: [target.nonland("t")],
        effects: [fx.tap(ref.target())],
        label: "Tap a nonland permanent",
      }),
    ],
  },
  "World Map": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"], basic: true })],
        label: "Search for a basic land",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"] })],
        label: "Search for a land",
      }),
    ],
  },
};
