/** Edge of Eternities — multicolor and colorless cards, lands. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_SPACECRAFT,
  CREATURE_YOU_CONTROL,
  cond,
  DRONE,
  fx,
  lander,
  manaAbility,
  OTHER_CREATURE_YOU_CONTROL,
  ROBOT,
  ref,
  spell,
  TWO_TAPPED,
  target,
  triggered,
  when,
} from "./common";

/** Shock lands: the "pay 2 life or it enters tapped" rule is read from the text. */
const shock: CardScript = {};

export const MULTI: Record<string, CardScript> = {
  // --- Multicolor ------------------------------------------------------------
  "Biomechan Engineer": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      activated({ mana: "{8}", effects: [fx.draw(2), fx.createTokens(ROBOT)], label: "Draw two cards, 2/2 Robot" }),
    ],
  },
  "Biotech Specialist": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      triggered(when.sacrifice({ types: ["Artifact"] }), [fx.damage(2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "2 damage",
      }),
    ],
  },
  "Genemorph Imago": {
    abilities: [
      triggered(
        when.landfall,
        [
          fx.when(cond.controls({ types: ["Land"] }, 6), fx.modify(ref.target(), { setPower: 6, setToughness: 6 })),
          fx.when(cond.not(cond.controls({ types: ["Land"] }, 6)), fx.modify(ref.target(), { setPower: 3, setToughness: 3 })),
        ],
        { targets: [target.creature("t")], label: "Landfall: base power and toughness 3/3 (6/6)" },
      ),
    ],
  },
  "Haliya, Ascendant Cadet": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter",
      }),
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter",
      }),
      triggered(when.combatDamageBatch({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }), [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Interceptor Mechan": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Artifact", "Creature"] }, "you", "artifact or creature card")],
        label: "Return a card",
      }),
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: cond.void, label: "Void: +1/+1 counter" }),
    ],
  },
  "Mm'menon, Uthros Exile": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t")],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Pinnacle Emissary": {
    abilities: [triggered(when.castSpell("you", { types: ["Artifact"] }), [fx.createTokens(DRONE)], { label: "1/1 Drone" })],
  },
  "Sami, Ship's Engineer": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTappedTokens(ROBOT)], { condition: TWO_TAPPED, label: "Tapped 2/2 Robot" }),
    ],
  },
  "Seedship Broodtender": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "Mill three cards" }),
      activated({
        mana: "{3}{B}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURE_OR_SPACECRAFT, "you", "creature or Spacecraft card")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Return a creature or Spacecraft",
      }),
    ],
  },
  "Space-Time Anomaly": { spell: spell([target.player("t")], [fx.mill(amount.lifeTotal, ref.target())]) },
  "Station Monitor": {
    abilities: [triggered(when.castNthSpell(2), [fx.createTokens(DRONE)], { label: "1/1 Drone" })],
  },
  "Syr Vondam, the Lucent": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 1, 0, ["deathtouch"])], {
        label: "+1/+0 and deathtouch",
      }),
      triggered(when.attacksSelf, [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 1, 0, ["deathtouch"])], {
        label: "+1/+0 and deathtouch",
      }),
    ],
  },

  // --- Colorless -------------------------------------------------------------
  "All-Fates Scroll": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        effects: [fx.draw(amount.distinctNames({ types: ["Land"], controller: "you" }))],
        label: "A card for each land name",
      }),
    ],
  },
  "Bygone Colossus": {},
  "Chrome Companion": {
    abilities: [
      triggered(when.tapsSelf, [fx.gainLife(1)], { label: "+1 life" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "A card from a graveyard on the bottom of its owner's library",
      }),
    ],
  },
  "Dauntless Scrapbot": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.eachOpponent, {}, { to: "exile" }), lander()], {
        label: "Exile opponents' graveyards, Lander",
      }),
    ],
  },
  "Nutrient Block": {
    abilities: [
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 life" }),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Virulent Silencer": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Artifact"], controller: "you", token: false, anyOf: [{ types: ["Creature"] }] }, true),
        [fx.poison(ref.eventPlayer, 2)],
        { label: "Two poison counters" },
      ),
    ],
  },

  // --- Lands -----------------------------------------------------------------
  "Breeding Pool": shock,
  "Godless Shrine": shock,
  "Sacred Foundry": shock,
  "Stomping Ground": shock,
  "Watery Grave": shock,
};
