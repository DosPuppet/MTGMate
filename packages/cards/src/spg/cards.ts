/** Special Guests (SPG) : scripts des cartes (PLAN-G). */
import type { Effect, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  entersWith,
  fx,
  investigate,
  loyalty,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
  ZOMBIE,
} from "../tdm/common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const RHINO: TokenSpec = {
  name: "Rhino",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Rhino"],
  power: 4,
  toughness: 4,
  keywords: ["trample"],
};
const CAT_WARRIOR: TokenSpec = {
  name: "Cat Warrior",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Cat", "Warrior"],
  power: 2,
  toughness: 2,
  abilities: [blockAbility(block.landwalk("Forest", "Traversée des forêts"))],
};
/** « … valeur de mana inférieure ou égale au nombre de cartes dans le cimetière de son contrôleur » (à la résolution). */
const DROWNABLE = (t: string) =>
  cond.amountAtLeast(
    amount.plus(amount.refCount(ref.graveyardOf(ref.controllerOf(ref.target(t)))), amount.neg(amount.manaValueOf(ref.target(t)))),
    0,
  );
const FIRST_INSTANT = (n: number) => cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Instant"] }), n);

/**
 * Champion (702.72) : « quand cette créature arrive, sacrifiez-la à moins d'exiler un autre [filtre] que vous contrôlez ;
 * quand elle quitte le champ de bataille, la carte revient ». `then` : ce qui suit quand un objet a été championné.
 */
function champion(filter: ObjectFilter, label: string, then: Effect[] = []) {
  const championed = cond.amountAtLeast(amount.refCount(ref.stored("champ")), 1);
  return triggered(
    when.entersSelf,
    [
      fx.chooseAmong(ref.permanentsOf(ref.you, { ...filter, other: true }), ref.you, "champ", {
        optional: true,
        prompt: `Champion : exilez ${label} que vous contrôlez (sinon, sacrifiez cette créature)`,
      }),
      fx.exileUntilLeaves(ref.stored("champ")),
      ...fx.when(cond.not(championed), fx.sacrificeIt(ref.self)),
      ...(then.length ? fx.when(championed, then) : []),
    ],
    { label: `Champion : ${label}` },
  );
}

export const CARDS: Record<string, CardScript> = {
  "Chrome Mox": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.you, { notTypes: ["Artifact", "Land"] }, false, undefined, true)], {
        label: "Empreinte : vous pouvez exiler une carte non-artefact non-terrain de votre main",
      }),
      manaAbility(["W", "U", "B", "R", "G"], 1, { linkedColors: true }),
    ],
  },
  // Affinité pour les artefacts : lue dans le texte.
  Frogmite: {},
  "Galvanic Blast": {
    // Métallurgie : 4 blessures au lieu de 2 si vous contrôlez au moins trois artefacts (à la résolution).
    spell: spell(
      [target.any()],
      [
        ...fx.when(cond.controls({ types: ["Artifact"], controller: "you" }, 3), fx.damage(4, ref.target())),
        ...fx.when(cond.not(cond.controls({ types: ["Artifact"], controller: "you" }, 3)), fx.damage(2, ref.target())),
      ],
    ),
  },
  "Helix Pinnacle": {
    // Défense totale : lue dans le texte.
    abilities: [
      activated({ mana: "{X}", effects: [fx.counters(ref.self, "tower", amount.x)], label: "X marqueurs de tour" }),
      triggered(when.yourUpkeep, [fx.winGame], {
        condition: cond.amountAtLeast(amount.countersOn(ref.self, "tower"), 100),
        label: "100 marqueurs de tour ou plus : vous gagnez la partie",
      }),
    ],
  },
  "Mistbind Clique": {
    abilities: [
      champion({ types: ["Creature"], subtype: "Faerie" }, "une Fée", [
        fx.reflexive([target.player("p")], [fx.tap(ref.permanentsOf(ref.target("p"), { types: ["Land"] }))]),
      ]),
    ],
  },
  // Affinité pour les artefacts : lue dans le texte.
  Thoughtcast: { spell: spell([], [fx.draw(2)]) },
  "Wanderwine Prophets": {
    abilities: [
      champion({ types: ["Creature"], subtype: "Merfolk" }, "un Ondin"),
      triggered(
        when.combatDamageToPlayer,
        [fx.sacrifice(ref.you, { subtype: "Merfolk" }, 1, { optional: true, store: "m" }), ...fx.when(cond.v("m"), fx.extraTurn)],
        { label: "Vous pouvez sacrifier un Ondin : un tour supplémentaire" },
      ),
    ],
  },
  // — G4a : Special Guests de LCI, MKM et OTJ —
  "Lord of Atlantis": {
    abilities: [
      staticAbility(
        { subtype: "Merfolk", other: true },
        { power: 1, toughness: 1, addBlockRules: [block.landwalk("Island", "Traversée des îles")] },
        { label: "Les autres Ondins : +1/+1 et traversée des îles" },
      ),
    ],
  },
  "Bridge from Below": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], token: false, controller: "you" }), [fx.createTokens(ZOMBIE)], {
        fromGraveyard: true,
        label: "Depuis votre cimetière : une créature non-jeton meurt, un Zombie 2/2",
      }),
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.exileCard(ref.selfCard)], {
        fromGraveyard: true,
        label: "Depuis votre cimetière : une créature adverse meurt, exilez cette carte",
      }),
    ],
  },
  "Mephidross Vampire": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you" },
        {
          addSubtypes: ["Vampire"],
          addAbilities: [
            triggered({ on: "dealsDamage", who: "self" }, [fx.addCounters(ref.self, 1)], {
              // Des blessures infligées à une créature (ni à un joueur).
              condition: cond.not(cond.amountAtLeast(amount.refCount(ref.eventPlayer), 1)),
              label: "Blesse une créature : un marqueur +1/+1",
            }),
          ],
        },
        { label: "Vos créatures sont des Vampires qui grandissent en blessant des créatures" },
      ),
    ],
  },
  "Pitiless Plunderer": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", other: true }), [fx.createTokens(TREASURE)], {
        label: "Une autre de vos créatures meurt : un Trésor",
      }),
    ],
  },
  // Menace : lue dans le texte.
  "Rampaging Ferocidon": {
    abilities: [
      playerStatic({ cantGainLife: true, affects: "each", label: "Les joueurs ne peuvent pas gagner de points de vie" }),
      triggered(when.enters({ types: ["Creature"], other: true }), [fx.damage(1, ref.controllerOf(ref.eventObject))], {
        label: "Une autre créature arrive : 1 blessure à son contrôleur",
      }),
    ],
  },
  // Piétinement, défense talismanique : lus dans le texte.
  "Carnage Tyrant": { cantBeCountered: true },
  Polyraptor: {
    abilities: [triggered(when.isDealtDamage, [fx.copyToken(ref.self)], { label: "Rage : un jeton copie" })],
  },
  "Kalamax, the Stormsire": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant"] }), [fx.copySpell(ref.eventObject, 1)], {
        condition: cond.all(cond.sourceMatches({ tapped: true }), FIRST_INSTANT(1), cond.not(FIRST_INSTANT(2))),
        label: "Premier éphémère du tour, Kalamax engagé : copiez-le",
      }),
      triggered(when.copySpell({ types: ["Instant"] }), [fx.addCounters(ref.self, 1)], {
        label: "Vous copiez un éphémère : un marqueur +1/+1",
      }),
    ],
  },
  "Lord Windgrace": {
    abilities: [
      loyalty(2, {
        effects: [
          fx.discard(1, ref.you, { store: "l", storeFilter: { types: ["Land"] } }),
          fx.draw(1),
          ...fx.when(cond.v("l"), fx.draw(1)),
        ],
        label: "Défaussez, piochez (une de plus si c'était un terrain)",
      }),
      loyalty(-3, {
        targets: [target.upTo(2, target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière"))],
        effects: [fx.toBattlefield(ref.target())],
        label: "Jusqu'à deux terrains de votre cimetière sur le champ de bataille",
      }),
      loyalty(-11, {
        targets: [target.upTo(6, target.nonland("t"))],
        effects: [fx.destroy(ref.target()), fx.createTokens(CAT_WARRIOR, 6)],
        label: "Détruisez jusqu'à six permanents non-terrain ; six Chats Guerriers",
      }),
    ],
  },
  "Mana Crypt": {
    abilities: [
      triggered(when.yourUpkeep, [fx.coinFlip("f"), ...fx.when(cond.not(cond.v("f")), fx.damage(3, ref.you))], {
        label: "Pile ou face : perdu, 3 blessures à vous",
      }),
      manaAbility("C", 2),
    ],
  },
  "Star Compass": {
    abilities: [entersWith({ tapped: true, label: "Arrive engagé" }), manaAbility([...ANY], 1, { likeLands: { basic: true } })],
  },
  "Ghostly Prison": {
    abilities: [playerStatic({ attackTax: 2, label: "Payer {2} par créature qui vous attaque" })],
  },
  Fabricate: { spell: spell([], [fx.search({ types: ["Artifact"] }, { to: "hand" })]) },
  "Show and Tell": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "hand",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Enchantment"] }, { types: ["Land"] }] },
          { to: "battlefield" },
          {
            who: ref.eachPlayer,
            count: 1,
            min: 0,
            prompt: "Vous pouvez mettre un artefact, une créature, un enchantement ou un terrain",
          },
        ),
      ],
    ),
  },
  "Tragic Slip": {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(cond.morbid, fx.pump(ref.target(), -13, -13)),
        ...fx.when(cond.not(cond.morbid), fx.pump(ref.target(), -1, -1)),
      ],
    ),
  },
  Victimize: {
    spell: spell(
      [target.exactly(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière"))],
      [
        fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { store: "s" }),
        ...fx.when(cond.v("s"), fx.toBattlefield(ref.target(), { tapped: true })),
      ],
    ),
  },
  Gamble: { spell: spell([], [fx.search({}, { to: "hand" }), fx.discard(1, ref.you, { random: true })]) },
  // Suspension 4 — {G} : lue dans le texte.
  "Crashing Footfalls": { spell: spell([], [fx.createTokens(RHINO, 2)]) },
  "Tireless Tracker": {
    abilities: [
      triggered(when.enters({ types: ["Land"], controller: "you" }), [investigate()], { label: "Atterrissage : enquêtez" }),
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.addCounters(ref.self, 1)], {
        label: "Vous sacrifiez un Indice : un marqueur +1/+1",
      }),
    ],
  },
  "Drown in the Loch": {
    spell: modal(
      mode("Contrecarrez le sort ciblé", [target.spell("s")], [...fx.when(DROWNABLE("s"), fx.counter(ref.target("s")))]),
      mode("Détruisez la créature ciblée", [target.creature("c")], [...fx.when(DROWNABLE("c"), fx.destroy(ref.target("c")))]),
    ),
  },
  "Field of the Dead": {
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      manaAbility("C"),
      triggered(when.enters({ types: ["Land"], controller: "you" }), [fx.createTokens(ZOMBIE)], {
        condition: cond.amountAtLeast(amount.distinctNames({ types: ["Land"], controller: "you" }), 7),
        label: "Sept terrains aux noms différents : un Zombie 2/2",
      }),
    ],
  },
  "Stoneforge Mystic": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Artifact"], subtype: "Equipment" }, { to: "hand" })], {
        label: "Cherchez une carte d'Équipement",
      }),
      activated({
        mana: "{1}{W}",
        tap: true,
        effects: [
          fx.pickFromZone("hand", { types: ["Artifact"], subtype: "Equipment" }, { to: "battlefield" }, { count: 1, min: 0 }),
        ],
        label: "Vous pouvez mettre un Équipement de votre main sur le champ de bataille",
      }),
    ],
  },
  // Flash, vol : lus dans le texte.
  "Brazen Borrower": {
    abilities: [blockAbility(block.onlyBlocks({ keyword: "flying" }, "Ne bloque que les créatures avec le vol"))],
  },
  "Petty Theft": {
    spell: spell([target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")], [fx.bounce(ref.target())]),
  },
  Desertion: {
    spell: spell(
      [target.spell()],
      [
        fx.counter(ref.target(), undefined, "d"),
        fx.toBattlefield(ref.filtered(ref.stored("d"), { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }), {
          underYourControl: true,
        }),
      ],
    ),
  },
  "Morbid Opportunist": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.draw(1)], {
        oncePerTurn: true,
        batched: true,
        label: "Une ou plusieurs autres créatures meurent : piochez (une fois par tour)",
      }),
    ],
  },
  "Port Razer": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombat], {
        label: "Dégagez vos créatures ; une phase de combat supplémentaire",
      }),
      blockAbility(block.notSameDefenderTwice),
    ],
  },
  Scapeshift: {
    spell: spell(
      [],
      [
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"] }), ref.you, "s", {
          anyNumber: true,
          prompt: "Sacrifiez un nombre quelconque de terrains",
        }),
        fx.sacrificeIt(ref.stored("s")),
        fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, amount.refCount(ref.stored("s"))),
      ],
    ),
  },
  // Flash : lu dans le texte.
  "Mystic Snake": {
    abilities: [
      triggered(when.entersSelf, [fx.counter(ref.target())], { targets: [target.spell()], label: "Contrecarrez le sort ciblé" }),
    ],
  },
  Desert: {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        activationCondition: cond.step("endCombat"),
        targets: [target.creature("t", { attacking: true })],
        effects: [fx.damage(1, ref.target())],
        label: "1 blessure à la créature attaquante ciblée (fin du combat)",
      }),
    ],
  },
  "Prismatic Vista": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield" })],
        label: "Cherchez une carte de terrain de base",
      }),
    ],
  },
};
