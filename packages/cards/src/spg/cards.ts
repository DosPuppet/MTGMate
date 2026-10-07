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
  doesntUntap,
  entersWith,
  escalate,
  eventReplacement,
  fx,
  graveyardReplacement,
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
  TO_CREATURE,
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
const ELDRAZI_SCION: TokenSpec = {
  name: "Eldrazi Scion",
  colors: [],
  types: ["Creature"],
  subtypes: ["Eldrazi", "Scion"],
  power: 1,
  toughness: 1,
  abilities: [manaAbility("C", 1, { sacrifice: true, noTap: true })],
};
const FAERIE_ROGUE: TokenSpec = {
  name: "Faerie Rogue",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Faerie", "Rogue"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
/** Terrains « fetch » de Zendikar : {T}, 1 PV, sacrifice : une carte de [type] ou [type] sur le champ de bataille. */
const fetchland = (a: string, b: string): CardScript => ({
  abilities: [
    activated({
      tap: true,
      payLife: 1,
      sacrifice: true,
      effects: [fx.search({ types: ["Land"], anySubtype: [a, b] }, { to: "battlefield" })],
      label: `Cherchez une carte de ${a} ou de ${b}`,
    }),
  ],
});
const BIRD_ILLUSION: TokenSpec = {
  name: "Bird Illusion",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Bird", "Illusion"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
const INSTANT_OR_SORCERY = { types: ["Instant" as const, "Sorcery" as const] };
/** Expropriate : les deux options du vote (leurs effets viennent après tous les votes). */
const VOTES = [
  { label: "Le temps (un tour supplémentaire pour le lanceur)", effects: [] },
  { label: "L'argent (le lanceur prend un permanent du votant)", effects: [] },
];
const VOTE_PROMPT = "Votez : le temps ou l'argent";
/** Le joueur a voté pour l'option de rang `i` (1 : le temps, 2 : l'argent). */
const votedFor = (store: string, i: number) => cond.all(cond.v(store, i), cond.not(cond.v(store, i + 1)));
/** « N'activez que si vous avez exactement sept cartes en main » (Library of Alexandria). */
const SEVEN_IN_HAND = cond.all(
  cond.amountAtLeast(amount.countIn("hand", {}), 7),
  cond.not(cond.amountAtLeast(amount.countIn("hand", {}), 8)),
);
const sevenCardsDraw = (): CardScript => ({
  abilities: [
    manaAbility("C"),
    activated({
      tap: true,
      activationCondition: SEVEN_IN_HAND,
      effects: [fx.draw(1)],
      label: "Piochez (exactement sept cartes en main)",
    }),
  ],
});
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
      triggered(when.dies({ types: ["Creature"], token: false, owner: "you" }), [fx.createTokens(ZOMBIE)], {
        fromGraveyard: true,
        label: "Depuis votre cimetière : une créature non-jeton est mise dans votre cimetière, un Zombie 2/2",
      }),
      triggered(when.dies({ types: ["Creature"], owner: "opponent" }), [fx.exileCard(ref.selfCard)], {
        fromGraveyard: true,
        label: "Depuis votre cimetière : une créature est mise dans le cimetière d'un adversaire, exilez cette carte",
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
            triggered(when.dealsDamage("self", { to: TO_CREATURE }), [fx.addCounters(ref.self, 1)], {
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
  // — G4c : Special Guests de TDM, EOE et ECL —
  "Eerie Ultimatum": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "battlefield" },
          {
            count: 99,
            min: 0,
            differentNames: true,
            prompt: "Cartes de permanent aux noms différents à remettre sur le champ de bataille",
          },
        ),
      ],
    ),
  },
  "Emergent Ultimatum": {
    spell: spell(
      [],
      [
        { op: "search", filter: { colorCount: 1 }, count: 3, to: { to: "exile" }, store: "e", distinctNames: true },
        fx.chooseAmong(ref.stored("e"), ref.eachOpponent, "o", {
          prompt: "Choisissez la carte qui retourne dans sa bibliothèque",
        }),
        fx.moveTo(ref.stored("o"), { to: "libraryTop" }),
        fx.shuffle(ref.you),
        fx.castNow(ref.except(ref.stored("e"), ref.stored("o")), { free: true, many: true }),
        fx.exileOnResolve,
      ],
    ),
  },
  "Genesis Ultimatum": {
    spell: spell(
      [],
      [fx.lookAtTop(5, { filter: { permanent: true }, count: 5, to: { to: "battlefield" }, rest: "hand" }), fx.exileOnResolve],
    ),
  },
  "Inspired Ultimatum": {
    spell: spell(
      [target.player("p"), { ...target.any("t") }],
      [fx.gainLife(5, ref.target("p")), fx.damage(5, ref.target("t")), fx.draw(5)],
    ),
  },
  "Ruinous Ultimatum": {
    spell: spell([], [fx.destroy(ref.permanentsOf(ref.eachOpponent, { notTypes: ["Land"] }))]),
  },
  "Arid Mesa": fetchland("Mountain", "Plains"),
  "Marsh Flats": fetchland("Plains", "Swamp"),
  "Misty Rainforest": fetchland("Forest", "Island"),
  "Scalding Tarn": fetchland("Island", "Mountain"),
  "Verdant Catacombs": fetchland("Swamp", "Forest"),
  "Warping Wail": {
    spell: modal(
      mode(
        "Exilez une créature de force ou d'endurance 1 ou moins",
        [target.creature("c", { anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] })],
        [fx.exile(ref.target("c"))],
      ),
      mode(
        "Contrecarrez le sort de rituel ciblé",
        [target.spell("s", { types: ["Sorcery"] }, "sort de rituel")],
        [fx.counter(ref.target("s"))],
      ),
      mode("Un Engeance Eldrazi 1/1", [], [fx.createTokens(ELDRAZI_SCION)]),
    ),
  },
  "Deafening Silence": {
    abilities: [
      playerStatic({
        castLimit: { who: "each", maxSpells: 1, spellTypes: { notTypes: ["Creature"] } },
        label: "Chaque joueur : un seul sort non-créature par tour",
      }),
    ],
  },
  "Nexus of Fate": { shuffleIntoLibrary: true, spell: spell([], [fx.extraTurn]) },
  "Paradox Haze": {
    enchant: { filter: {}, label: "joueur", player: true },
    abilities: [
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.extraUpkeeps(1, true)], {
        condition: cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.attached)), 1)),
        oncePerTurn: true,
        label: "Première étape d'entretien du joueur enchanté : une étape d'entretien supplémentaire",
      }),
    ],
  },
  Darkness: { spell: spell([], [fx.thisTurn({ replacement: { event: "damage", combat: true, modify: { prevent: true } } })]) },
  "Magus of the Moon": {
    abilities: [
      staticAbility(
        { types: ["Land"], basic: false },
        { setSubtypes: ["Mountain"], loseAllAbilities: true },
        {
          label: "Les terrains non-base sont des Montagnes",
        },
      ),
    ],
  },
  Burgeoning: {
    abilities: [
      triggered(
        { on: "playLand", whose: "opponent" },
        [fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield" }, { count: 1, min: 0 })],
        { label: "Un adversaire joue un terrain : vous pouvez mettre un terrain de votre main" },
      ),
    ],
  },
  "Green Sun's Zenith": {
    // « Mélangez-la dans la bibliothèque de son propriétaire » : comme une carte qui retourne dans la bibliothèque au
    // lieu du cimetière.
    shuffleIntoLibrary: true,
    spell: spell([], [fx.search({ types: ["Creature"], colors: ["G"], maxManaValueX: true }, { to: "battlefield" })]),
  },
  "Sliver Overlord": {
    abilities: [
      activated({
        mana: "{3}",
        effects: [fx.search({ subtype: "Sliver" }, { to: "hand" })],
        label: "Cherchez une carte de Slivoïde",
      }),
      activated({
        mana: "{3}",
        targets: [target.creature("t", { subtype: "Sliver" })],
        effects: [fx.gainControl(ref.target())],
        label: "Contrôle du Slivoïde ciblé",
      }),
    ],
  },
  "Idyllic Tutor": { spell: spell([], [fx.search({ types: ["Enchantment"] }, { to: "hand" })]) },
  "Kinsbaile Cavalier": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Knight", controller: "you" },
        { addKeywords: ["doubleStrike"] },
        {
          label: "Vos Chevaliers ont la double initiative",
        },
      ),
    ],
  },
  Bitterblossom: {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(FAERIE_ROGUE)], {
        label: "Perdez 1 PV, une Fée Gredine 1/1 volante",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Faerie Macabre": {
    abilities: [
      activated({
        fromHand: true,
        discardSelf: true,
        targets: [target.upTo(2, target.cardInGraveyard("t", {}, "any"))],
        effects: [fx.exile(ref.target())],
        label: "Défaussez cette carte : exilez jusqu'à deux cartes des cimetières",
      }),
    ],
  },
  // Célérité : lue dans le texte.
  "Goblin Chieftain": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Goblin", controller: "you", other: true },
        { power: 1, toughness: 1, addKeywords: ["haste"] },
        {
          label: "Vos autres Gobelins : +1/+1 et célérité",
        },
      ),
    ],
  },
  "Goblin Sharpshooter": {
    abilities: [
      doesntUntap("self", { label: "Ne se dégage pas lors de votre étape de dégagement" }),
      triggered(when.dies({ types: ["Creature"] }), [fx.untap(ref.self)], { label: "Une créature meurt : dégagez-la" }),
      activated({
        tap: true,
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "1 blessure à n'importe quelle cible",
      }),
    ],
  },
  "Heat Shimmer": {
    spell: spell([target.creature()], [fx.copyToken(ref.target(), { addKeywords: ["haste"], exileAtEndStep: true })]),
  },
  "Devoted Druid": {
    abilities: [
      manaAbility("G"),
      activated({ addCounters: { kind: "-1/-1", n: 1 }, effects: [fx.untap(ref.self)], label: "Un marqueur −1/−1 : dégagez-la" }),
    ],
  },
  "Leaf-Crowned Visionary": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Elf", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Vos autres Elfes : +1/+1",
        },
      ),
      triggered(when.castSpell("you", { subtype: "Elf" }), fx.mayPay("{G}", "payer {G} pour piocher", fx.draw(1)), {
        label: "Sort d'Elfe : payez {G} pour piocher",
      }),
    ],
  },
  "Regal Force": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ types: ["Creature"], colors: ["G"], controller: "you" }))], {
        label: "Piochez une carte par créature verte que vous contrôlez",
      }),
    ],
  },
  Manamorphose: { spell: spell([], [fx.addManaCombination(2), fx.draw(1)]) },
  "Risen Reef": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Elemental", controller: "you" }),
        [fx.lookAtTop(1, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "hand" })],
        { label: "Un Élémental arrive : la carte du dessus, terrain sur le champ de bataille engagé, sinon en main" },
      ),
    ],
  },
  // — G4d : Special Guests de SOS et FRA —
  "Dolmen Gate": {
    abilities: [
      eventReplacement({
        event: "damage",
        combat: true,
        toFilter: { types: ["Creature"], attacking: true, controller: "you" },
        modify: { prevent: true },
        label: "Prévenez les blessures de combat infligées à vos créatures attaquantes",
      }),
    ],
  },
  "Door of Destinies": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(when.castSpell("you", { subtypeChosen: true }), [fx.counters(ref.self, "charge")], {
        label: "Sort du type choisi : un marqueur de charge",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", subtypeChosen: true },
        { power: 1, toughness: 1 },
        {
          perCounter: "charge",
          label: "Vos créatures du type choisi : +1/+1 par marqueur de charge",
        },
      ),
    ],
  },
  Archaeomancer: {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_OR_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
        label: "Renvoyez un éphémère ou un rituel de votre cimetière",
      }),
    ],
  },
  "Archmage Emeritus": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_OR_SORCERY), [fx.draw(1)], { label: "Magecraft : piochez" }),
      triggered(when.copySpell(INSTANT_OR_SORCERY), [fx.draw(1)], { label: "Magecraft : piochez" }),
    ],
  },
  "Murmuring Mystic": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_OR_SORCERY), [fx.createTokens(BIRD_ILLUSION)], {
        label: "Éphémère ou rituel : un Oiseau Illusion 1/1 volant",
      }),
    ],
  },
  // Flash : lu dans le texte.
  "Dualcaster Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.copySpell(ref.target(), 1)], {
        targets: [target.spell("t", INSTANT_OR_SORCERY, "sort d'éphémère ou de rituel")],
        label: "Copiez le sort d'éphémère ou de rituel ciblé",
      }),
    ],
  },
  "Magus of the Library": sevenCardsDraw(),
  "Library of Alexandria": sevenCardsDraw(),
  // Garde {2} : lue dans le texte.
  "Adrix and Nev, Twincasters": {
    abilities: [eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Vos jetons sont créés en double" })],
  },
  "Eye of Ugin": {
    abilities: [
      playerStatic({
        spellCost: { filter: { subtype: "Eldrazi", colorCount: 0 }, reduce: 2 },
        label: "Vos sorts d'Eldrazi incolores coûtent {2} de moins",
      }),
      activated({
        mana: "{7}",
        tap: true,
        effects: [fx.search({ types: ["Creature"], colorCount: 0 }, { to: "hand" })],
        label: "Cherchez une carte de créature incolore",
      }),
    ],
  },
  "Austere Command": {
    spell: modal(
      ...(() => {
        const choices = [
          { label: "Détruisez les artefacts", effects: [fx.destroyAll({ types: ["Artifact"] })] },
          { label: "Détruisez les enchantements", effects: [fx.destroyAll({ types: ["Enchantment"] })] },
          {
            label: "Détruisez les créatures de VM 3 ou moins",
            effects: [fx.destroyAll({ types: ["Creature"], maxManaValue: 3 })],
          },
          {
            label: "Détruisez les créatures de VM 4 ou plus",
            effects: [fx.destroyAll({ types: ["Creature"], minManaValue: 4 })],
          },
        ];
        // « Choisissez deux — » : chaque paire, les destructions de la paire en même temps.
        return choices.flatMap((a, i) =>
          choices.slice(i + 1).map((b) => mode(`${a.label} ; ${b.label}`, [], [...a.effects, ...b.effects])),
        );
      })(),
    ),
  },
  "Sublime Epiphany": {
    spell: escalate(
      "{0}",
      { label: "Contrecarrez le sort ciblé", targets: [target.spell("s")], effects: [fx.counter(ref.target("s"))] },
      {
        label: "Contrecarrez la capacité activée ou déclenchée ciblée",
        targets: [{ id: "a", label: "capacité activée ou déclenchée", filter: { stackItems: { abilitiesOnly: true } } }],
        effects: [fx.counter(ref.target("a"))],
      },
      { label: "Renvoyez un permanent non-terrain", targets: [target.nonland("n")], effects: [fx.bounce(ref.target("n"))] },
      {
        label: "Un jeton copie de votre créature ciblée",
        targets: [target.creature("c", { controller: "you" })],
        effects: [fx.copyToken(ref.target("c"))],
      },
      { label: "Le joueur ciblé pioche", targets: [target.player("p")], effects: [fx.draw(1, ref.target("p"))] },
    ),
  },
  Consider: { spell: spell([], [fx.surveil(1), fx.draw(1)]) },
  "Mind Twist": { spell: spell([target.player()], [fx.discard(amount.x, ref.target(), { random: true })]) },
  "Splinter Twin": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        {
          addAbilities: [
            activated({
              tap: true,
              effects: [fx.copyToken(ref.self, { addKeywords: ["haste"], exileAtEndStep: true })],
              label: "Un jeton copie avec la célérité, exilé à l'étape de fin",
            }),
          ],
        },
        { label: "La créature enchantée peut se copier" },
      ),
    ],
  },
  "Root Maze": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }] },
        label: "Les artefacts et les terrains arrivent engagés",
      }),
    ],
  },
  // — G4e : sous-lot difficile —
  "Noxious Revival": {
    spell: spell(
      [target.cardInGraveyard("t", {}, "any", "carte d'un cimetière")],
      [fx.moveTo(ref.target(), { to: "libraryTop" })],
    ),
  },
  "Thousand-Year Elixir": {
    abilities: [
      playerStatic({
        activateAsThoughHaste: { types: ["Creature"] },
        label: "Les capacités de vos créatures s'activent comme si elles avaient la célérité",
      }),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.untap(ref.target("t"))],
        label: "{1}, {T} : dégagez la créature ciblée",
      }),
    ],
  },
  "Grim Haruspex": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false, other: true }), [fx.draw(1)], {
        label: "Une autre créature non-jeton que vous contrôlez meurt : piochez une carte",
      }),
    ],
  },
  "Mirri, Weatherlight Duelist": {
    abilities: [
      triggered(when.attacksSelf, [fx.thisTurn({ maxBlockingCreatures: 1 }, ref.eachOpponent)], {
        label: "Attaque : chaque adversaire bloque avec une seule créature au plus ce combat",
      }),
      playerStatic({
        maxOneAttacker: "you",
        condition: cond.sourceMatches({ tapped: true }),
        label: "Engagée : une seule créature peut vous attaquer à chaque combat",
      }),
    ],
  },
  "Consign to Memory": {
    spell: spell(
      [
        {
          id: "t",
          label: "capacité déclenchée ou sort incolore",
          filter: { stackItems: { triggeredOnly: true }, spells: { colorCount: 0 } },
        },
      ],
      [fx.counter(ref.target())],
    ),
  },
  "Underworld Breach": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { notTypes: ["Land"] }, what: "spells", exileOthers: 3 },
        label: "Les cartes non-terrain de votre cimetière ont l'évasion (leur coût et trois autres cartes exilées)",
      }),
      triggered(when.step("end", "any"), [fx.sacrificeIt(ref.self)], {
        label: "Au début de l'étape de fin : sacrifiez cet enchantement",
      }),
    ],
  },
  "Phantasmal Image": {
    asEnters: [
      fx.chooseCopy(
        { types: ["Creature"] },
        {
          anyController: true,
          except: {
            addSubtypes: ["Illusion"],
            addAbilities: [
              triggered({ on: "becomesTarget", who: "self" }, [fx.sacrificeIt(ref.self)], {
                label: "Devient la cible d'un sort ou d'une capacité : sacrifiez-la",
              }),
            ],
          },
        },
      ),
    ],
  },
  "Flesh Duplicate": {
    // Disparition 3 (702.63) : elle arrive avec trois marqueurs de temps (en arrivant), et la capacité d'entretien est
    // une exception de la copie. Approximation : donnée même si la créature copiée a déjà la disparition.
    asEnters: [
      fx.chooseCopy(
        { types: ["Creature"] },
        {
          anyController: true,
          counters: { kind: "time", n: 3 },
          except: {
            addAbilities: [
              triggered(
                when.yourUpkeep,
                [
                  fx.removeCounters(ref.self, 1, "time"),
                  ...fx.when(cond.not(cond.amountAtLeast(amount.countersOn(ref.self, "time"), 1)), fx.sacrificeIt(ref.self)),
                ],
                { label: "Disparition : retirez un marqueur de temps ; le dernier retiré, sacrifiez-la" },
              ),
            ],
          },
        },
      ),
    ],
  },
  Necrodominance: {
    abilities: [
      playerStatic({ skips: "drawStep", label: "Passez votre étape de pioche" }),
      triggered(
        when.step("end"),
        [fx.payLifeX("payez autant de points de vie que vous voulez (et piochez autant)", "x"), fx.draw(amount.v("x"))],
        { label: "Votre étape de fin : payez X PV, piochez X cartes" },
      ),
      playerStatic({ maxHandSize: 5, label: "Taille de main maximale : cinq" }),
      graveyardReplacement({ graveyardOf: "you", label: "Ce qui devrait aller dans votre cimetière est exilé à la place" }),
    ],
  },
  "Sphinx's Tutelage": {
    abilities: [
      triggered({ on: "draw", whose: "you" }, [fx.millWhileSharingColor(ref.target(), true)], {
        targets: [target.player("t", "opponent")],
        label: "Vous piochez : l'adversaire meule deux cartes (et recommence si deux non-terrain partagent une couleur)",
      }),
      activated({ mana: "{5}{U}", effects: fx.loot(1), label: "{5}{U} : piochez, puis défaussez une carte" }),
    ],
  },
  "Library of Leng": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "Pas de taille de main maximale" }),
      playerStatic({
        discardToLibraryTop: true,
        label: "Une carte défaussée par un effet peut aller au-dessus de votre bibliothèque",
      }),
    ],
  },
  "Notion Thief": {
    abilities: [
      playerStatic({
        stealsOpponentDraws: true,
        label: "Un adversaire qui pioche (sauf la première carte de son étape de pioche) : vous piochez à sa place",
      }),
    ],
  },
  "Maddening Hex": {
    enchant: { filter: {}, label: "joueur", player: true },
    abilities: [
      triggered(
        { on: "castSpell", by: "any", filter: { notTypes: ["Creature"] } },
        [
          fx.rollDie(6, "d"),
          fx.damage(amount.v("d"), ref.eventPlayer, ref.self),
          fx.attachRandom(ref.except(ref.eachOpponent, ref.attached)),
        ],
        {
          condition: cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.attached)), 1)),
          label:
            "Le joueur enchanté lance un sort non-créature : un d6, autant de blessures ; l'Aura passe à un autre adversaire",
        },
      ),
    ],
  },
  "Painter's Servant": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [staticAbility({}, { setColorsChosen: "add" }, { label: "Les permanents sont aussi de la couleur choisie" })],
  },
  // « Deux cartes de votre main piochées ce tour-ci ».
  // Approximation : toute carte mise dans votre main ce tour-ci convient (pas seulement une carte piochée).
  "Sylvan Library": {
    abilities: [
      triggered(
        when.step("draw"),
        fx.may(
          "Piocher deux cartes de plus ?",
          fx.draw(2),
          ...fx.unlessPays(
            ref.you,
            { life: 4 },
            fx.pickFromZone(
              "hand",
              { enteredThisTurn: true },
              { to: "libraryTop" },
              { count: 1, min: 1, prompt: "Remettez une carte piochée ce tour-ci au-dessus de votre bibliothèque" },
            ),
          ),
          ...fx.unlessPays(
            ref.you,
            { life: 4 },
            fx.pickFromZone(
              "hand",
              { enteredThisTurn: true },
              { to: "libraryTop" },
              { count: 1, min: 1, prompt: "Remettez une carte piochée ce tour-ci au-dessus de votre bibliothèque" },
            ),
          ),
        ),
        { label: "Votre étape de pioche : deux cartes de plus ; pour deux cartes, payez 4 PV ou remettez-la au-dessus" },
      ),
    ],
  },
  "Codie, Vociferous Codex": {
    abilities: [
      playerStatic({
        castLimit: {
          who: "you",
          spellTypes: { types: ["Artifact", "Creature", "Enchantment", "Planeswalker", "Battle"] },
          maxSpells: 0,
        },
        label: "Vous ne pouvez pas lancer de sorts de permanent",
      }),
      activated({
        mana: "{4}",
        tap: true,
        effects: [
          fx.addMana("W", "U", "B", "R", "G"),
          fx.whenNextSpellThisTurn([fx.cascade(amount.manaValueOf(ref.target("s")), { types: ["Instant", "Sorcery"] })]),
        ],
        label: "{4}, {T} : {W}{U}{B}{R}{G} ; votre prochain sort ce tour-ci cascade vers un éphémère ou un rituel",
      }),
    ],
  },
  // Dilemme du conseil : chacun vote, en commençant par vous et dans l'ordre du tour ; puis un tour supplémentaire par vote
  // pour le temps, et un permanent du votant par vote pour l'argent.
  // Approximation : pour le vote d'un adversaire, le permanent est choisi parmi ceux qu'il contrôle et que possède un de
  // vos adversaires (et non parmi ceux qu'il possède, quel que soit leur contrôleur).
  Expropriate: {
    exileOnResolve: true,
    spell: spell(
      [],
      [
        ...fx.yourChoice(VOTE_PROMPT, "v", VOTES),
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) => fx.yourChoice(VOTE_PROMPT, `v${n}`, VOTES, p)),
        ...fx.when(votedFor("v", 1), fx.extraTurn),
        ...fx.forEachPlayer(ref.eachOpponent, (_p, n) => fx.when(votedFor(`v${n}`, 1), fx.extraTurn)),
        ...fx.when(
          votedFor("v", 2),
          fx.chooseAmong(ref.permanentsOf(ref.eachPlayer, { owner: "you" }), ref.you, "m"),
          fx.giveControl(ref.stored("m"), ref.you),
        ),
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) =>
          fx.when(
            votedFor(`v${n}`, 2),
            fx.chooseAmong(ref.permanentsOf(p, { owner: "opponent" }), ref.you, `m${n}`),
            fx.giveControl(ref.stored(`m${n}`), ref.you),
          ),
        ),
      ],
    ),
  },
  "Robe of Stars": {
    abilities: [
      staticAbility("attached", { toughness: 3 }, { label: "La créature équipée a +0/+3" }),
      activated({
        mana: "{1}{W}",
        effects: [fx.phaseOut(ref.attached)],
        label: "Projection astrale — {1}{W} : la créature équipée sort de phase",
      }),
    ],
  },
};
