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
  protection,
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
const GOLEM_3: TokenSpec = {
  name: "Golem",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Golem"],
  power: 3,
  toughness: 3,
};
const SPIRIT_CLERIC: TokenSpec = {
  name: "Spirit Cleric",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Spirit", "Cleric"],
  power: 0,
  toughness: 0,
  cdaPT: amount.count({ subtype: "Spirit", controller: "you" }),
};
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
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
  // — G4b : Special Guests de BLB, DSK, FDN et DFT —
  "Swords to Plowshares": {
    spell: spell(
      [target.creature()],
      [fx.gainLife(amount.powerOf(ref.target()), ref.controllerOf(ref.target())), fx.exile(ref.target())],
    ),
  },
  // Vol : lu dans le texte.
  "Ledger Shredder": {
    abilities: [
      triggered({ on: "castSpell", by: "any", nth: 2 }, [fx.connive(ref.self)], {
        label: "Un joueur lance son deuxième sort du tour : complote",
      }),
    ],
  },
  "Rat Colony": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { subtype: "Rat", controller: "you", other: true }, label: "+1/+0 par autre Rat" },
      ),
    ],
  },
  "Relentless Rats": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { name: "Relentless Rats", other: true }, label: "+1/+1 par autre Relentless Rats" },
      ),
    ],
  },
  "Kindred Charge": {
    spell: spell(
      [],
      [
        fx.chooseForSelf("creatureType"),
        fx.copyToken(ref.permanentsOf(ref.you, { types: ["Creature"], subtypeChosen: true }), {
          addKeywords: ["haste"],
          exileAtEndStep: true,
        }),
      ],
    ),
  },
  "Sylvan Tutor": { spell: spell([], [fx.search({ types: ["Creature"] }, { to: "libraryTop" })]) },
  // Indestructible : lu dans le texte.
  "Toski, Bearer of Secrets": {
    cantBeCountered: true,
    abilities: [
      staticAbility("self", { addKeywords: ["mustAttack"] }, { label: "Attaque à chaque combat si possible" }),
      triggered(when.combatDamage(YOUR_CREATURES, true), [fx.draw(1)], {
        label: "Une de vos créatures blesse un joueur : piochez",
      }),
    ],
  },
  // Équiper {2} : lu dans le texte.
  "Sword of Fire and Ice": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [
            protection.from({ colors: ["R"] }, "Protection contre le rouge"),
            protection.from({ colors: ["U"] }, "Protection contre le bleu"),
          ],
        },
        { label: "+2/+2, protection contre le rouge et le bleu" },
      ),
      triggered(
        when.combatDamage({ types: ["Creature"], attachedToSource: true }, true),
        [fx.damage(2, ref.target()), fx.draw(1)],
        {
          targets: [target.any()],
          label: "2 blessures à n'importe quelle cible et piochez",
        },
      ),
    ],
  },
  "Hallowed Haunting": {
    abilities: [
      staticAbility(
        YOUR_CREATURES,
        { addKeywords: ["flying", "vigilance"] },
        {
          condition: cond.controls({ types: ["Enchantment"], controller: "you" }, 7),
          label: "Sept enchantements : vos créatures ont le vol et la vigilance",
        },
      ),
      triggered(when.castSpell("you", { types: ["Enchantment"] }), [fx.createTokens(SPIRIT_CLERIC)], {
        label: "Sort d'enchantement : un Esprit Clerc",
      }),
    ],
  },
  "Soul Warden": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], other: true }), [fx.gainLife(1)], {
        label: "Une autre créature arrive : 1 PV",
      }),
    ],
  },
  Damnation: { spell: spell([], [fx.destroyAll({ types: ["Creature"] }, undefined, true)]) },
  Sacrifice: {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.addManaChoice(amount.manaValueOf(ref.costSacrificed), ["B"])]),
  },
  "Unholy Heat": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [...fx.when(cond.delirium, fx.damage(6, ref.target())), ...fx.when(cond.not(cond.delirium), fx.damage(2, ref.target()))],
    ),
  },
  "Collected Company": {
    spell: spell(
      [],
      [
        fx.lookAtTop(6, {
          filter: { types: ["Creature"], maxManaValue: 3 },
          count: 2,
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },
  Condemn: {
    spell: spell(
      [target.creature("t", { attacking: true })],
      [
        fx.gainLife(amount.toughnessOf(ref.target()), ref.controllerOf(ref.target())),
        fx.moveTo(ref.target(), { to: "libraryBottom" }),
      ],
    ),
  },
  "Grim Tutor": { spell: spell([], [fx.search({}, { to: "hand" }), fx.loseLife(3)]) },
  // Flash, équiper {3} : lus dans le texte.
  Embercleave: {
    costReduction: { generic: amount.count({ types: ["Creature"], controller: "you", attacking: true }) },
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-la à une de vos créatures",
      }),
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["doubleStrike", "trample"] },
        {
          label: "+1/+1, double initiative et piétinement",
        },
      ),
    ],
  },
  "Goblin Bushwhacker": {
    kicker: "{R}",
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(YOUR_CREATURES, 1, 0, ["haste"])], {
        condition: cond.kicked,
        label: "Kické : vos créatures gagnent +1/+0 et la célérité",
      }),
    ],
  },
  "Paradise Druid": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        {
          condition: cond.sourceMatches({ tapped: false }),
          label: "Défense talismanique tant qu'elle est dégagée",
        },
      ),
      manaAbility([...ANY]),
    ],
  },
  "Akroma's Memorial": {
    abilities: [
      staticAbility(
        YOUR_CREATURES,
        {
          addKeywords: ["flying", "firstStrike", "vigilance", "trample", "haste"],
          addProtections: [
            protection.from({ colors: ["B"] }, "Protection contre le noir"),
            protection.from({ colors: ["R"] }, "Protection contre le rouge"),
          ],
        },
        { label: "Vos créatures : vol, initiative, vigilance, piétinement, célérité, protection contre le noir et le rouge" },
      ),
    ],
  },
  "Temporal Manipulation": { spell: spell([], [fx.extraTurn]) },
  "Fiend Artisan": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { perGraveyard: { types: ["Creature"] }, label: "+1/+1 par carte de créature de votre cimetière" },
      ),
      activated({
        mana: "{X}{B/G}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        sorcerySpeed: true,
        effects: [fx.search({ types: ["Creature"], maxManaValueX: true }, { to: "battlefield" })],
        label: "Cherchez une créature de valeur de mana X ou moins",
      }),
    ],
  },
  // Vigilance : lue dans le texte.
  "Cavalier of Dawn": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target()), fx.createTokens(GOLEM_3, 1, ref.controllerOf(ref.target()))], {
        targets: [target.optional(target.nonland("t"))],
        label: "Détruisez jusqu'à un permanent non-terrain ; son contrôleur crée un Golem 3/3",
      }),
      triggered(when.diesSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] },
            "you",
            "carte d'artefact ou d'enchantement de votre cimetière",
          ),
        ],
        label: "Renvoyez une carte d'artefact ou d'enchantement de votre cimetière",
      }),
    ],
  },
  // Improvisation : lue dans le texte.
  "Whir of Invention": {
    spell: spell([], [fx.search({ types: ["Artifact"], maxManaValueX: true }, { to: "battlefield" })]),
  },
  "Bone Miser": {
    abilities: [
      triggered(when.discard("you"), [fx.createTokens(ZOMBIE)], {
        condition: cond.refMatches(ref.eventObject, { types: ["Creature"] }),
        label: "Vous défaussez une carte de créature : un Zombie 2/2",
      }),
      triggered(when.discard("you"), [fx.addMana("B", "B")], {
        condition: cond.refMatches(ref.eventObject, { types: ["Land"] }),
        label: "Vous défaussez une carte de terrain : {B}{B}",
      }),
      triggered(when.discard("you"), [fx.draw(1)], {
        condition: cond.refMatches(ref.eventObject, { notTypes: ["Creature", "Land"] }),
        label: "Vous défaussez une autre carte : piochez",
      }),
    ],
  },
  "Lord of the Undead": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Zombie", other: true },
        { power: 1, toughness: 1 },
        { label: "Les autres Zombies : +1/+1" },
      ),
      activated({
        mana: "{1}{B}",
        tap: true,
        targets: [target.cardInGraveyard("t", { subtype: "Zombie" }, "you", "carte de Zombie de votre cimetière")],
        effects: [fx.toHand(ref.target())],
        label: "Renvoyez une carte de Zombie de votre cimetière",
      }),
    ],
  },
  "Chandra's Ignition": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.damage(
          amount.powerOf(ref.target()),
          ref.union(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.target()), ref.eachOpponent),
          ref.target(),
        ),
      ],
    ),
  },
  "Pathbreaker Ibex": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.pumpAll(YOUR_CREATURES, amount.maxPower(YOUR_CREATURES), amount.maxPower(YOUR_CREATURES), ["trample"])],
        { label: "Vos créatures gagnent le piétinement et +X/+X (X : la plus grande force)" },
      ),
    ],
  },
  // Vol, équipage 3 : lus dans le texte.
  "Skysovereign, Consul Flagship": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        label: "3 blessures à une créature ou un planeswalker adverse",
      }),
      triggered(when.attacksSelf, [fx.damage(3, ref.target())], {
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        label: "3 blessures à une créature ou un planeswalker adverse",
      }),
    ],
  },
};
