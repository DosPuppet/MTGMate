/** Murders at Karlov Manor — cartes bleues. */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cond,
  costReducer,
  doesntUntap,
  eventReplacement,
  fx,
  INSTANT_SORCERY,
  investigate,
  playerStatic,
  ref,
  SUSPECTED,
  spell,
  staticAbility,
  THOPTER,
  target,
  triggered,
  when,
} from "./common";

/** « Vous pouvez piocher une carte. Si vous le faites, défaussez une carte. » */
const mayLoot = fx.may("Piocher une carte, puis en défausser une ?", fx.draw(1), fx.discard(1));

/** Benthic Criminologists : « vous pouvez sacrifier un artefact ; si vous le faites, piochez une carte ». */
const sacrificeArtifactToDraw = [
  fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
  ...fx.when(cond.v("s"), fx.draw(1)),
];

/**
 * Agency Outfitter : chaque carte nommée est cherchée dans le cimetière, puis dans la main, puis dans la bibliothèque
 * (une seule de chaque nom en tout).
 */
const fetchNamed = (name: string, key: string) => [
  fx.pickFromZone("graveyard", { name }, { to: "battlefield" }, { min: 0, store: `${key}g`, prompt: `${name} (cimetière)` }),
  ...fx.when(
    cond.not(cond.v(`${key}g`)),
    fx.pickFromZone("hand", { name }, { to: "battlefield" }, { min: 0, store: `${key}h`, prompt: `${name} (main)` }),
  ),
  ...fx.when(cond.not(cond.any(cond.v(`${key}g`), cond.v(`${key}h`))), fx.search({ name }, { to: "battlefield" })),
];

/** « Enchanter : créature ». */
const ENCHANT_CREATURE: CardScript["enchant"] = { filter: { types: ["Creature"] }, label: "créature" };

/** Burden of Proof : la créature enchantée est un Détective que vous contrôlez. */
const ENCHANTS_YOUR_DETECTIVE = cond.controls({ attachedToSource: true, subtype: "Detective" });

/** Bibliothèque vide (Living Conundrum). */
const LIBRARY_EMPTY = cond.not(cond.amountAtLeast(amount.cardsIn("library"), 1));

/** Thopter : créature-artefact incolore 0/0 avec le vol (Intrude on the Mind). */
const THOPTER_0: TokenSpec = {
  name: "Thopter",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Thopter"],
  power: 0,
  toughness: 0,
  keywords: ["flying"],
};

export const BLUE: Record<string, CardScript> = {
  "Agency Outfitter": {
    abilities: [
      triggered(when.entersSelf, [...fetchNamed("Magnifying Glass", "mg"), ...fetchNamed("Thinking Cap", "tc")], {
        label: "Cherchez une Magnifying Glass et un Thinking Cap",
      }),
    ],
  },
  "Behind the Mask": {
    // Réunir des preuves 6 (coût additionnel facultatif) : lu dans le texte.
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [
        ...fx.when(
          cond.not(cond.kicked),
          fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 3 }),
        ),
        ...fx.when(cond.kicked, fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 1, setToughness: 1 })),
      ],
    ),
  },
  "Benthic Criminologists": {
    abilities: [
      triggered(when.entersSelf, sacrificeArtifactToDraw, { label: "Sacrifiez un artefact : piochez une carte" }),
      triggered(when.attacksSelf, sacrificeArtifactToDraw, { label: "Sacrifiez un artefact : piochez une carte" }),
    ],
  },
  "Bubble Smuggler": {
    // Déguisement : lu dans le texte. « En étant retournée » : approché par une capacité déclenchée.
    abilities: [triggered(when.turnedFaceUp, [fx.addCounters(ref.self, 4)], { label: "Retournée : quatre marqueurs +1/+1" })],
  },
  "Burden of Proof": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { condition: ENCHANTS_YOUR_DETECTIVE, label: "+2/+2 (Détective)" }),
      staticAbility(
        "attached",
        {
          setPower: 1,
          setToughness: 1,
          addBlockRules: [block.onlyBlocks({ not: { subtype: "Detective" } }, "Ne peut pas bloquer les Détectives")],
        },
        { condition: cond.not(ENCHANTS_YOUR_DETECTIVE), label: "1/1 de base, ne peut pas bloquer les Détectives" },
      ),
    ],
  },
  Candlestick: {
    // Équiper {2} : lu dans le texte.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(when.attacksSelf, [fx.surveil(2)], { label: "Surveillance 2" })],
        },
        { label: "+1/+1 et surveillance 2 en attaquant" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Case of the Filched Falcon": {
    abilities: [triggered(when.entersSelf, [investigate()], { label: "Enquêtez" })],
    caseToSolve: cond.controls({ types: ["Artifact"] }, 3),
    caseSolved: [
      activated({
        mana: "{2}{U}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact"], { notTypes: ["Creature"] }, "artefact non-créature")],
        effects: [
          fx.addCounters(ref.target(), 4),
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Bird"], setPower: 0, setToughness: 0, addKeywords: ["flying"] },
            "permanent",
          ),
        ],
        label: "L'artefact devient un Oiseau 0/0 volant avec quatre marqueurs +1/+1",
      }),
    ],
  },
  "Case of the Ransacked Lab": {
    abilities: [costReducer(INSTANT_SORCERY, 1, "Vos éphémères et rituels coûtent {1} de moins")],
    caseToSolve: cond.amountAtLeast(amount.instantSorceryCast, 4),
    caseSolved: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.draw(1)], { label: "Éphémère ou rituel : piochez une carte" }),
    ],
  },
  "Cold Case Cracker": {
    abilities: [triggered(when.diesSelf, [investigate()], { label: "Enquêtez" })],
  },
  "Coveted Falcon": {
    // Déguisement : lu dans le texte.
    abilities: [
      triggered(when.attacksSelf, [fx.gainControl(ref.target())], {
        targets: [
          {
            id: "t",
            label: "permanent que vous possédez sans le contrôler",
            filter: { objects: { permanent: true, owner: "you", controller: "opponent" } },
          },
        ],
        label: "Reprenez un permanent que vous possédez",
      }),
      triggered(
        when.turnedFaceUp,
        [fx.giveControl(ref.target("p"), ref.target("o")), fx.draw(amount.refCount(ref.target("p")))],
        {
          targets: [
            target.player("o", "opponent"),
            target.upTo(99, {
              id: "p",
              label: "permanents que vous contrôlez",
              filter: { objects: { permanent: true, controller: "you" } },
            }),
          ],
          label: "Donnez des permanents à un adversaire ; piochez autant de cartes",
        },
      ),
    ],
  },
  "Crimestopper Sprite": {
    // Réunir des preuves 6 (coût additionnel facultatif) : lu dans le texte. Dans les effets d'une capacité déclenchée,
    // `cond.kicked` lit la capacité et non le permanent : deux versions exclusives, choisies par la condition.
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target())], {
        targets: [target.creature()],
        condition: cond.not(cond.kicked),
        label: "Engagez une créature",
      }),
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature()],
        condition: cond.kicked,
        label: "Preuves réunies : engagez une créature, marqueur d'étourdissement",
      }),
    ],
  },
  "Curious Inquiry": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(when.combatDamageToPlayer, [investigate()], { label: "Enquêtez" })],
        },
        { label: "+1/+1 ; blessures de combat à un joueur : enquêtez" },
      ),
    ],
  },
  Deduce: {
    spell: spell([], [fx.draw(1), investigate()]),
  },
  "Dramatic Accusation": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez la créature enchantée" }),
      doesntUntap("attached"),
      activated({
        mana: "{U}{U}",
        effects: [fx.moveTo(ref.attached, { to: "libraryTop", shuffle: true })],
        label: "Mélangez la créature enchantée dans la bibliothèque de son propriétaire",
      }),
    ],
  },
  "Eliminate the Impossible": {
    spell: spell(
      [],
      [
        investigate(),
        fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -2, 0),
        fx.suspect(ref.permanentsOf(ref.eachOpponent, SUSPECTED), false),
      ],
    ),
  },
  "Exit Specialist": {
    // Déguisement : lu dans le texte.
    abilities: [
      blockAbility(block.notBy({ minPower: 3 }, "Imblocable par les créatures de force 3 ou plus")),
      triggered(when.turnedFaceUp, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { other: true })],
        label: "Renvoyez une autre créature dans la main de son propriétaire",
      }),
    ],
  },
  "Fae Flight": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.attached, 0, 0, ["hexproof"])], {
        label: "La créature enchantée a la défense talismanique ce tour-ci",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["flying"] }, { label: "+1/+0 et le vol" }),
    ],
  },
  "Forensic Gadgeteer": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Artifact"] }), [investigate()], { label: "Sort d'artefact : enquêtez" }),
      playerStatic({
        abilityCost: { source: { types: ["Artifact"], controller: "you" }, reduce: 1, minOneMana: true },
        label: "Les capacités activées de vos artefacts coûtent {1} de moins",
      }),
    ],
  },
  "Furtive Courier": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        {
          condition: cond.amountAtLeast(amount.turnEvents({ event: "sacrifice", who: "you", types: ["Artifact"] }), 1),
          label: "Imblocable si vous avez sacrifié un artefact ce tour-ci",
        },
      ),
      triggered(when.attacksSelf, fx.loot(1), { label: "Piochez une carte, puis défaussez-en une" }),
    ],
  },
  "Hotshot Investigators": {
    abilities: [
      triggered(
        when.entersSelf,
        // « Si vous la contrôliez » : lu avant de la renvoyer.
        [...fx.when(cond.targetMatches("t", { controller: "you" }), investigate()), fx.bounce(ref.target())],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Renvoyez une autre créature ; enquêtez si vous la contrôliez",
        },
      ),
    ],
  },
  "Jaded Analyst": {
    abilities: [
      triggered(when.draw(2), [fx.modify(ref.self, { removeKeywords: ["defender"], addKeywords: ["vigilance"] })], {
        label: "Deuxième carte piochée : perd le défenseur, gagne la vigilance",
      }),
    ],
  },
  "Living Conundrum": {
    abilities: [
      eventReplacement({
        event: "draw",
        to: "you",
        modify: { prevent: true },
        condition: LIBRARY_EMPTY,
        label: "Bibliothèque vide : passez la pioche",
      }),
      staticAbility(
        "self",
        { setPower: 10, setToughness: 10, addKeywords: ["flying", "vigilance"] },
        { condition: LIBRARY_EMPTY, label: "Bibliothèque vide : 10/10, vol et vigilance" },
      ),
    ],
  },
  "Lost in the Maze": {
    abilities: [
      // « X créatures ciblées » : le X du sort, évalué au ciblage (`countAmount`).
      triggered(
        when.entersSelf,
        [fx.tap(ref.target()), fx.counters(ref.except(ref.target(), ref.permanentsOf(ref.you, { types: ["Creature"] })), "stun")],
        {
          targets: [{ ...target.creature(), count: 1, countAmount: amount.sourceX }],
          label: "Engagez X créatures ; marqueur d'étourdissement sur celles des adversaires",
        },
      ),
      staticAbility(
        { types: ["Creature"], controller: "you", tapped: true },
        { addKeywords: ["hexproof"] },
        {
          label: "Vos créatures engagées ont la défense talismanique",
        },
      ),
    ],
  },
  "Mistway Spy": {
    // Déguisement : lu dans le texte.
    abilities: [
      triggered(
        when.turnedFaceUp,
        [
          fx.emblem(
            "Mistway Spy",
            "Until end of turn, whenever a creature you control deals combat damage to a player, investigate.",
            [
              triggered(when.combatDamage({ types: ["Creature"], controller: "you" }, true), [investigate()], {
                label: "Enquêtez",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "Ce tour-ci, vos créatures qui blessent un joueur en combat font enquêter" },
      ),
    ],
  },
  "Out Cold": {
    cantBeCountered: true,
    spell: spell([target.upTo(2, target.creature())], [fx.tap(ref.target()), fx.counters(ref.target(), "stun"), investigate()]),
  },
  "Proft's Eidetic Memory": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      playerStatic({ maxHandSize: "none", label: "Pas de taille de main maximale" }),
      triggered(when.yourCombat, [fx.addCounters(ref.target(), amount.plus(amount.cardsDrawnThisTurn, -1))], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.drewAtLeast(2),
        label: "X marqueurs +1/+1 (cartes piochées ce tour-ci moins une)",
      }),
    ],
  },
  "Projektor Inspector": {
    abilities: [
      // « Cette créature ou un autre Détective » : elle est elle-même un Détective.
      triggered(when.enters({ subtype: "Detective", controller: "you" }), mayLoot, {
        label: "Un Détective arrive : piochez, puis défaussez",
      }),
      triggered(when.permanentTurnedFaceUp({ subtype: "Detective", controller: "you" }), mayLoot, {
        label: "Un Détective est retourné : piochez, puis défaussez",
      }),
    ],
  },
  "Reasonable Doubt": {
    spell: spell(
      [target.spell("s"), target.upTo(1, target.creature("c"))],
      [
        ...fx.unlessPays(ref.controllerOf(ref.target("s")), { mana: "{2}" }, fx.counter(ref.target("s"))),
        fx.suspect(ref.target("c")),
      ],
    ),
  },
  "Reenact the Crime": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { notTypes: ["Land"], enteredThisTurn: true },
          "any",
          "carte non-terrain mise dans un cimetière ce tour-ci",
        ),
      ],
      [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 99)],
    ),
  },
  "Sudden Setback": {
    spell: spell(
      [{ id: "t", label: "sort ou permanent non-terrain", filter: { spells: {}, objects: { notTypes: ["Land"] } } }],
      [fx.topOrBottom(ref.target())],
    ),
  },
  "Unauthorized Exit": {
    spell: spell([target.nonland()], [fx.bounce(ref.target()), fx.surveil(1)]),
  },
  "Surveillance Monitor": {
    abilities: [
      triggered(when.entersSelf, fx.mayCollectEvidence(4, {}), { label: "Vous pouvez réunir des preuves 4" }),
      triggered(when.collectEvidence, [fx.createTokens(THOPTER)], {
        label: "Vous réunissez des preuves : un Thopter 1/1 volant",
      }),
    ],
  },
  "Forensic Researcher": {
    abilities: [
      activated({
        tap: true,
        targets: [
          { id: "t", label: "autre permanent que vous contrôlez", filter: { objects: { controller: "you", other: true } } },
        ],
        effects: [fx.untap(ref.target())],
        label: "Dégagez un autre permanent que vous contrôlez",
      }),
      activated({
        tap: true,
        collectEvidence: 3,
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.tap(ref.target())],
        label: "Réunissez des preuves 3 : engagez une créature que vous ne contrôlez pas",
      }),
    ],
  },
  "Cryptic Coat": {
    abilities: [
      triggered(when.entersSelf, [fx.cloak(ref.libraryTop(ref.you), "c"), fx.attach(ref.stored("c"))], {
        label: "Enveloppez d'une cape la carte du dessus, puis attachez-y cet Équipement",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["unblockable"] }, { label: "+1/+0, ne peut pas être bloquée" }),
      activated({ mana: "{1}{U}", effects: [fx.bounce(ref.self)], label: "Renvoyez cet Équipement dans votre main" }),
    ],
  },
  "Conspiracy Unraveler": {
    abilities: [
      playerStatic({
        altCostAll: { collectEvidence: 10 },
        label: "Vous pouvez réunir des preuves 10 plutôt que payer le coût de mana de vos sorts",
      }),
    ],
  },
  "Intrude on the Mind": {
    spell: spell(
      [],
      [
        fx.piles(5, { revealed: true, storeGraveyard: "g" }),
        fx.createTokens(THOPTER_0, 1, undefined, "t"),
        fx.addCounters(ref.stored("t"), amount.v("g")),
      ],
    ),
  },
};
