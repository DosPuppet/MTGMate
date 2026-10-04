/** The Lost Caverns of Ixalan — cartes bleues. */
import {
  ARTIFACT_ENTERED,
  ARTIFACT_OR_CREATURE,
  activated,
  amount,
  CAVES,
  type CardScript,
  cond,
  descend,
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
const mapOnEnter = triggered(when.entersSelf, [fx.createTokens(MAP)], { label: "Jeton Carte" });

export const BLUE: Record<string, CardScript> = {
  "Akal Pakal, First Among Equals": {
    abilities: [
      triggered(when.eachEndStep, [fx.lookAtTop(2, { count: 1, rest: "graveyard" })], {
        condition: ARTIFACT_ENTERED,
        label: "Une carte en main, l'autre au cimetière",
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
      mode("Une des quatre cartes du dessus en main", [], [fx.lookAtTop(4, { count: 1, rest: "graveyard" })]),
      mode(
        "Contrecarrez un sort à moins que {4} ne soit payé",
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
        label: "Descente 4 — renvoyez un permanent non-terrain",
      }),
    ],
  },
  "Deeproot Pilgrimage": {
    abilities: [
      triggered(
        { on: "taps", who: { types: ["Creature"], subtype: "Merfolk", token: false, controller: "you" } },
        [fx.createTokens(MERFOLK_HEXPROOF)],
        { batched: true, label: "Ondin 1/1 avec la défense talismanique" },
      ),
    ],
  },
  "Didact Echo": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      staticAbility("self", { addKeywords: ["flying"] }, { condition: descend(4), label: "Descente 4 — vol" }),
    ],
  },
  "Frilled Cave-Wurm": {
    abilities: [staticAbility("self", { power: 2 }, { condition: descend(4), label: "Descente 4 — +2/+0" })],
  },
  "Hermitic Nautilus": {
    abilities: [activated({ mana: "{1}{U}", effects: [fx.pump(ref.self, 3, -3)], label: "+3/−3" })],
  },
  "Merfolk Cave-Diver": {
    abilities: [
      triggered(when.explores({ types: ["Creature"], controller: "you" }), [fx.pump(ref.self, 1, 0, ["unblockable"])], {
        label: "+1/+0 et imblocable",
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
        label: "Une carte en main, l'autre au cimetière",
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
          addAbilities: [triggered(when.attacksSelf, [...fx.loot()], { label: "Piochez, puis défaussez" })],
        },
        { label: "+1/+1 et pillage en attaquant" },
      ),
      activated({
        mana: "{1}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", subtype: "Pirate" })],
        effects: [fx.attach(ref.target())],
        label: "Équiper un Pirate {1}",
      }),
    ],
  },
  "Relic's Roar": {
    spell: spell(
      [targetObj("t", ARTIFACT_OR_CREATURE, "artefact ou créature")],
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
        label: "Une carte sur le dessus, le reste au cimetière",
      }),
    ],
  },
  "Shipwreck Sentry": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["attacksDespiteDefender"] },
        { condition: ARTIFACT_ENTERED, label: "Peut attaquer (un artefact est arrivé)" },
      ),
    ],
  },
  "Sinuous Benthisaur": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(CAVES, { count: 2, rest: "bottom" })], {
        label: "Deux cartes en main parmi X (Cavernes)",
      }),
    ],
  },
  "Song of Stupefaction": {
    enchant: {
      filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] },
      label: "créature ou Véhicule",
    },
    abilities: [
      triggered(when.entersSelf, [...fx.may("Meuler deux cartes ?", fx.mill(2))], { label: "Meulez deux cartes" }),
      staticAbility("attached", { power: -1 }, { perGraveyard: PERMANENT_CARD, label: "Descente profonde — −X/−0" }),
    ],
  },
  "Spyglass Siren": { abilities: [mapOnEnter] },
  "Staunch Crewmate": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(4, { filter: { anyOf: [{ types: ["Artifact"] }, { subtype: "Pirate" }] }, count: 1, rest: "bottom" })],
        { label: "Artefact ou Pirate en main" },
      ),
    ],
  },
  "Subterranean Schooner": {
    abilities: [
      triggered(when.attacksSelf, [fx.explore(ref.target())], {
        targets: [{ ...target.creature("t", { crewedSource: true }), label: "créature qui l'a piloté ce tour-ci" }],
        label: "Son équipage explore",
      }),
    ],
  },
  "Unlucky Drop": {
    spell: spell([targetObj("t", ARTIFACT_OR_CREATURE, "artefact ou créature")], [fx.topOrBottom(ref.target())]),
  },
  "Waterwind Scout": { abilities: [mapOnEnter] },
  "Waylaying Pirates": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [targetObj("t", { ...ARTIFACT_OR_CREATURE, controller: "opponent" }, "artefact ou créature adverse")],
        condition: cond.controls({ types: ["Artifact"] }),
        label: "Engagez-le, marqueur d'étourdissement",
      }),
    ],
  },
  "Hurl into History": {
    spell: spell(
      [target.spell("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, "sort d'artefact ou de créature")],
      [fx.counter(ref.target()), fx.discover(amount.manaValueOf(ref.target()))],
    ),
  },
  "Zoetic Glyph": {
    enchant: { filter: { types: ["Artifact"] }, label: "artefact" },
    abilities: [
      staticAbility(
        "attached",
        { addTypes: ["Creature"], addSubtypes: ["Golem"], setPower: 5, setToughness: 4 },
        { label: "Golem 5/4" },
      ),
      triggered(when.putIntoGraveyardSelf, [fx.discover(3)], { label: "Découverte 3" }),
    ],
  },
  "The Everflowing Well": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2), fx.draw(2)], { label: "Meulez deux cartes, piochez-en deux" }),
      triggered(when.yourUpkeep, [fx.transform()], { condition: descend(8), label: "Descente 8 — transformation" }),
    ],
  },
  "The Myriad Pools": {
    abilities: [
      manaAbility("U"),
      triggered(
        { on: "castSpell", by: "you", filter: { permanent: true }, usingManaFromSelf: true },
        [fx.becomeCopy(ref.target(), ref.eventObject)],
        {
          targets: [target.optional(targetObj("t", { controller: "you", other: true }, "autre permanent que vous contrôlez"))],
          label: "Un permanent devient une copie du sort",
        },
      ),
    ],
  },
};
