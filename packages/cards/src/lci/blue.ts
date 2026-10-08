/** The Lost Caverns of Ixalan — blue cards. */
import {
  ARTIFACT_ENTERED,
  ARTIFACT_OR_CREATURE,
  activated,
  amount,
  CAVES,
  type CardScript,
  cond,
  descend,
  equipAbility,
  fx,
  MAP,
  MERFOLK_HEXPROOF,
  manaAbility,
  modal,
  mode,
  PERMANENT_CARD,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const ARTIFACT_MANA = manaAbility("U", 1, {
  restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } },
});
const mapOnEnter = triggered(when.entersSelf, [fx.createTokens(MAP)], { label: "Map token" });

export const BLUE: Record<string, CardScript> = {
  "Akal Pakal, First Among Equals": {
    abilities: [
      triggered(when.eachEndStep, [fx.lookAtTop(2, { count: 1, rest: "graveyard" })], {
        condition: ARTIFACT_ENTERED,
        label: "One card into your hand, the other into the graveyard",
      }),
    ],
  },
  "Ancestral Reminiscence": { spell: spell([], [fx.draw(3), fx.discard(1)]) },
  "Brackish Blunder": {
    spell: spell(
      [target.creature()],
      [...fx.when(cond.targetMatches("t", { tapped: true }), fx.createTokens(MAP)), fx.bounce(ref.target())],
    ),
  },
  "Cogwork Wrestler": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -2, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "−2/−0",
      }),
    ],
  },
  "Confounding Riddle": {
    spell: modal(
      mode("One of the top four cards into your hand", [], [fx.lookAtTop(4, { count: 1, rest: "graveyard" })]),
      mode(
        "Counter a spell unless {4} is paid",
        [target.spell()],
        [...fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target()))],
      ),
    ),
  },
  "Council of Echoes": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.optional(target.nonland("t", { other: true }))],
        condition: descend(4),
        label: "Descend 4 — return a nonland permanent",
      }),
    ],
  },
  "Deeproot Pilgrimage": {
    abilities: [
      triggered(
        { on: "taps", who: { types: ["Creature"], subtype: "Merfolk", token: false, controller: "you" } },
        [fx.createTokens(MERFOLK_HEXPROOF)],
        { batched: true, label: "1/1 Merfolk with hexproof" },
      ),
    ],
  },
  "Didact Echo": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      staticAbility("self", { addKeywords: ["flying"] }, { condition: descend(4), label: "Descend 4 — flying" }),
    ],
  },
  "Frilled Cave-Wurm": {
    abilities: [staticAbility("self", { power: 2 }, { condition: descend(4), label: "Descend 4 — +2/+0" })],
  },
  "Hermitic Nautilus": {
    abilities: [activated({ mana: "{1}{U}", effects: [fx.pump(ref.self, 3, -3)], label: "+3/−3" })],
  },
  "Merfolk Cave-Diver": {
    abilities: [
      triggered(when.explores({ types: ["Creature"], controller: "you" }), [fx.pump(ref.self, 1, 0, ["unblockable"])], {
        label: "+1/+0 and can't be blocked",
      }),
    ],
  },
  "Oaken Siren": { abilities: [ARTIFACT_MANA] },
  "Orazca Puzzle-Door": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.lookAtTop(2, { count: 1, rest: "graveyard" })],
        label: "One card into your hand, the other into the graveyard",
      }),
    ],
  },
  "Out of Air": {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { types: ["Creature"] }) },
    spell: spell([target.spell()], [fx.counter(ref.target())]),
  },
  "Pirate Hat": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(when.attacksSelf, [...fx.loot()], { label: "Draw, and then discard" })],
        },
        { label: "+1/+1 and loots when attacking" },
      ),
      equipAbility({ mana: "{1}", filter: { subtype: "Pirate" }, label: "Equip Pirate {1}" }),
    ],
  },
  "Relic's Roar": {
    spell: spell(
      [targetObj("t", ARTIFACT_OR_CREATURE, "artifact or creature")],
      [
        fx.modify(ref.target(), {
          addTypes: ["Artifact", "Creature"],
          addSubtypes: ["Dinosaur"],
          setPower: 4,
          setToughness: 3,
        }),
      ],
    ),
  },
  "River Herald Scout": { abilities: [triggered(when.entersSelf, [fx.explore()], { label: "Explore" })] },
  "Sage of Days": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(3, { count: 1, to: { to: "libraryTop" }, rest: "graveyard" })], {
        label: "One card on top, the rest into the graveyard",
      }),
    ],
  },
  "Shipwreck Sentry": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["attacksDespiteDefender"] },
        { condition: ARTIFACT_ENTERED, label: "Can attack (an artifact entered)" },
      ),
    ],
  },
  "Sinuous Benthisaur": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(CAVES, { count: 2, rest: "bottom" })], {
        label: "Two cards into your hand out of X (Caves)",
      }),
    ],
  },
  "Song of Stupefaction": {
    enchant: {
      filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] },
      label: "creature or Vehicle",
    },
    abilities: [
      triggered(when.entersSelf, [...fx.may("Mill two cards?", fx.mill(2))], { label: "Mill two cards" }),
      staticAbility("attached", { power: -1 }, { perGraveyard: PERMANENT_CARD, label: "Fathomless descent — −X/−0" }),
    ],
  },
  "Spyglass Siren": { abilities: [mapOnEnter] },
  "Staunch Crewmate": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(4, { filter: { anyOf: [{ types: ["Artifact"] }, { subtype: "Pirate" }] }, count: 1, rest: "bottom" })],
        { label: "Artifact or Pirate into your hand" },
      ),
    ],
  },
  "Subterranean Schooner": {
    abilities: [
      triggered(when.attacksSelf, [fx.explore(ref.target())], {
        targets: [{ ...target.creature("t", { crew: "source" }), label: "creature that crewed it this turn" }],
        label: "Its crew explores",
      }),
    ],
  },
  "Unlucky Drop": {
    spell: spell([targetObj("t", ARTIFACT_OR_CREATURE, "artifact or creature")], [fx.topOrBottom(ref.target())]),
  },
  "Waterwind Scout": { abilities: [mapOnEnter] },
  "Waylaying Pirates": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [targetObj("t", { ...ARTIFACT_OR_CREATURE, controller: "opponent" }, "opponent's artifact or creature")],
        condition: cond.controls({ types: ["Artifact"] }),
        label: "Tap it, stun counter",
      }),
    ],
  },
  "Hurl into History": {
    spell: spell(
      [target.spell("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, "artifact or creature spell")],
      [fx.counter(ref.target()), fx.discover(amount.manaValueOf(ref.target()))],
    ),
  },
  "Zoetic Glyph": {
    enchant: { filter: { types: ["Artifact"] }, label: "artifact" },
    abilities: [
      staticAbility(
        "attached",
        { addTypes: ["Creature"], addSubtypes: ["Golem"], setPower: 5, setToughness: 4 },
        { label: "5/4 Golem" },
      ),
      triggered(when.putIntoGraveyardSelf, [fx.discover(3)], { label: "Discover 3" }),
    ],
  },
  "The Everflowing Well": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2), fx.draw(2)], { label: "Mill two cards, draw two" }),
      triggered(when.yourUpkeep, [fx.transform()], { condition: descend(8), label: "Descend 8 — transform" }),
    ],
  },
  "The Myriad Pools": {
    abilities: [
      manaAbility("U"),
      triggered(
        { on: "castSpell", by: "you", filter: { permanent: true }, usingManaFromSelf: true },
        [fx.becomeCopy(ref.target(), ref.eventObject)],
        {
          targets: [target.optional(targetObj("t", { controller: "you", other: true }, "other permanent you control"))],
          label: "A permanent becomes a copy of the spell",
        },
      ),
    ],
  },
};
