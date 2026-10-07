/** Through the Ages (FCA) : scripts des cartes (PLAN-G). */
import type { Effect, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCostMode,
  amount,
  type CardScript,
  cond,
  doesntUntap,
  entersWith,
  eventReplacement,
  fx,
  HUMAN,
  INSTANT_SORCERY,
  manaAbility,
  modal,
  mode,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
const WARRIOR_W: TokenSpec = {
  name: "Warrior",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Warrior"],
  power: 1,
  toughness: 1,
};
const CONSTRUCT: TokenSpec = {
  name: "Construct",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 0,
  toughness: 0,
  abilities: [
    staticAbility(
      "self",
      { power: 1, toughness: 1 },
      { per: { types: ["Artifact"], controller: "you" }, label: "+1/+1 par artefact" },
    ),
  ],
};
const IN_COMBAT = cond.any(
  cond.step("beginCombat"),
  cond.step("declareAttackers"),
  cond.step("declareBlockers"),
  cond.step("firstStrikeDamage"),
  cond.step("combatDamage"),
  cond.step("endCombat"),
);
/** « Choisissez deux — » : chaque paire de modes. */
function chooseTwo(...choices: { label: string; targets?: TargetSpec[]; effects: Effect[] }[]) {
  return modal(
    ...choices.flatMap((a, i) =>
      choices
        .slice(i + 1)
        .map((b) => mode(`${a.label} ; ${b.label}`, [...(a.targets ?? []), ...(b.targets ?? [])], [...a.effects, ...b.effects])),
    ),
  );
}

export const CARDS: Record<string, CardScript> = {
  "Light Up the Stage": {
    // Spectacle {R} : lu dans le texte.
    spell: spell([], [fx.exileTop(ref.you, 2, "l"), fx.grantPlay(ref.stored("l"), { untilYourNextTurn: true })]),
  },
  "Mizzix's Mastery": {
    spell: altCostMode(
      "Surcharge",
      "{5}{R}{R}{R}",
      {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "carte d'éphémère ou de rituel de votre cimetière")],
        effects: [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 999), fx.exileOnResolve],
      },
      {
        effects: [
          fx.moveTo(ref.zone("graveyard", ref.you, INSTANT_SORCERY), { to: "exile" }, { name: "c" }),
          fx.castCopiesFree([ref.stored("c")], 999),
          fx.exileOnResolve,
        ],
      },
    ),
  },
  "Ragavan, Nimble Pilferer": {
    // Ruée {1}{R} : lue dans le texte.
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.createTokens(TREASURE),
          fx.exileTop(ref.eventPlayer, 1, "r"),
          // « Vous pouvez lancer cette carte » : un terrain ne peut pas être joué ainsi.
          ...fx.when(cond.refMatches(ref.stored("r"), { notTypes: ["Land"] }), fx.grantPlay(ref.stored("r"))),
        ],
        { label: "Un Trésor ; exilez sa carte du dessus, lançable ce tour-ci" },
      ),
    ],
  },
  // — G7 : Through the Ages —
  // Vigilance : lue dans le texte.
  "Adeline, Resplendent Cathar": {
    cdaPower: amount.count(YOUR_CREATURES),
    abilities: [
      triggered(
        when.attackWith(),
        fx.forEachPlayer(ref.eachOpponent, (p) => [fx.createTappedTokens(HUMAN, 1, { attacking: ref.withPlaneswalkers(p) })]),
        {
          label: "Vous attaquez : un Humain 1/1 engagé et attaquant par adversaire",
        },
      ),
    ],
  },
  "Ranger-Captain of Eos": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Creature"], maxManaValue: 1 }, { to: "hand" })], {
        label: "Cherchez une carte de créature de valeur de mana 1 ou moins",
      }),
      activated({
        sacrifice: true,
        effects: [fx.thisTurn({ castLimit: { who: "opponents", maxSpells: 0, spellTypes: { notTypes: ["Creature"] } } })],
        label: "Sacrifiez-la : vos adversaires ne peuvent pas lancer de sorts non-créature ce tour-ci",
      }),
    ],
  },
  "Sram, Senior Edificer": {
    abilities: [
      triggered(when.castSpell("you", { anySubtype: ["Aura", "Equipment", "Vehicle"] }), [fx.draw(1)], {
        label: "Sort d'Aura, d'Équipement ou de Véhicule : piochez",
      }),
    ],
  },
  Counterspell: { spell: spell([target.spell()], [fx.counter(ref.target())]) },
  "Urza, Lord High Artificer": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CONSTRUCT)], { label: "Un Assemblage 0/0 (+1/+1 par artefact)" }),
      manaAbility("U", 1, { noTap: true, tapAnother: "artifact" }),
      activated({
        mana: "{5}",
        effects: [fx.shuffle(ref.you), fx.exileTop(ref.you, 1, "u"), fx.grantPlay(ref.stored("u"), { free: true })],
        label: "Mélangez, exilez la carte du dessus : jouable gratuitement ce tour-ci",
      }),
    ],
  },
  // Flash : lu dans le texte.
  "Venser, Shaper Savant": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [{ id: "t", label: "sort ou permanent", filter: { spells: {}, objects: {} } }],
        label: "Renvoyez le sort ou le permanent ciblé",
      }),
    ],
  },
  "Dark Ritual": { spell: spell([], [fx.addMana("B", "B", "B")]) },
  "Fatal Push": {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(
          cond.any(
            cond.targetMatches("t", { maxManaValue: 2 }),
            cond.all(
              cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1),
              cond.targetMatches("t", { maxManaValue: 4 }),
            ),
          ),
          fx.destroy(ref.target()),
        ),
      ],
    ),
  },
  "Syr Konrad, the Grim": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.damage(1, ref.eachOpponent)], {
        label: "Une autre créature meurt : 1 blessure à chaque adversaire",
      }),
      triggered(
        {
          on: "zoneChange",
          from: ["hand", "library", "exile", "stack"],
          to: ["graveyard"],
          filter: { types: ["Creature"] },
          whose: "any",
        },
        [fx.damage(1, ref.eachOpponent)],
        { label: "Une carte de créature va au cimetière d'ailleurs que du champ de bataille : 1 blessure à chaque adversaire" },
      ),
      triggered(
        { on: "zoneChange", from: ["graveyard"], filter: { types: ["Creature"] }, whose: "you" },
        [fx.damage(1, ref.eachOpponent)],
        {
          label: "Une carte de créature quitte votre cimetière : 1 blessure à chaque adversaire",
        },
      ),
      activated({ mana: "{1}{B}", effects: [fx.mill(1, ref.eachPlayer)], label: "Chaque joueur meule une carte" }),
    ],
  },
  "Yawgmoth, Thran Physician": {
    abilities: [
      protectionAbility(protection.from({ subtype: "Human" }, "Protection contre les Humains")),
      activated({
        payLife: 1,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        targets: [target.optional(target.creature())],
        effects: [fx.counters(ref.target(), "-1/-1"), fx.draw(1)],
        label: "1 PV, sacrifiez une autre créature : un marqueur −1/−1, piochez",
      }),
      activated({ mana: "{B}{B}", discard: 1, effects: [fx.proliferate()], label: "Défaussez une carte : proliférez" }),
    ],
  },
  "Godo, Bandit Warlord": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Artifact"], subtype: "Equipment" }, { to: "battlefield" })], {
        label: "Vous pouvez chercher un Équipement et le mettre sur le champ de bataille",
      }),
      triggered(
        when.attacksSelf,
        [fx.untap(ref.union(ref.self, ref.permanentsOf(ref.you, { subtype: "Samurai" }))), fx.extraCombat],
        { oncePerTurn: true, label: "Première attaque du tour : dégagez-le et vos Samouraïs ; un combat supplémentaire" },
      ),
    ],
  },
  // Indestructible : lu dans le texte.
  "Purphoros, God of the Forge": {
    abilities: [
      staticAbility(
        "self",
        { setTypes: ["Enchantment"] },
        {
          condition: cond.not(cond.amountAtLeast(amount.devotion("R"), 5)),
          label: "N'est pas une créature si votre dévotion au rouge est inférieure à cinq",
        },
      ),
      triggered(when.enters({ ...YOUR_CREATURES, other: true }), [fx.damage(2, ref.eachOpponent)], {
        label: "Une autre de vos créatures arrive : 2 blessures à chaque adversaire",
      }),
      activated({ mana: "{2}{R}", effects: [fx.pumpAll(YOUR_CREATURES, 1, 0)], label: "Vos créatures gagnent +1/+0" }),
    ],
  },
  "Azusa, Lost but Seeking": {
    abilities: [playerStatic({ extraLands: 2, label: "Deux terrains de plus à chacun de vos tours" })],
  },
  // Piétinement : lu dans le texte.
  "Traxos, Scourge of Kroog": {
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      doesntUntap("self", { label: "Ne se dégage pas lors de votre étape de dégagement" }),
      triggered(
        when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] }),
        [fx.untap(ref.self)],
        { label: "Sort historique : dégagez-le" },
      ),
    ],
  },
  // Initiative, vigilance, lien de vie : lus dans le texte.
  "Danitha Capashen, Paragon": {
    abilities: [
      playerStatic({
        spellCost: { filter: { anySubtype: ["Aura", "Equipment"] }, reduce: 1 },
        label: "Vos sorts d'Aura et d'Équipement coûtent {1} de moins",
      }),
    ],
  },
  "Kenrith, the Returned King": {
    abilities: [
      activated({
        mana: "{R}",
        effects: [fx.pumpAll({ types: ["Creature"] }, 0, 0, ["trample", "haste"])],
        label: "Toutes les créatures gagnent le piétinement et la célérité",
      }),
      activated({
        mana: "{1}{G}",
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Un marqueur +1/+1",
      }),
      activated({
        mana: "{2}{W}",
        targets: [target.player()],
        effects: [fx.gainLife(5, ref.target())],
        label: "Le joueur ciblé gagne 5 PV",
      }),
      activated({
        mana: "{3}{U}",
        targets: [target.player()],
        effects: [fx.draw(1, ref.target())],
        label: "Le joueur ciblé pioche",
      }),
      activated({
        mana: "{4}{B}",
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Une carte de créature d'un cimetière sur le champ de bataille",
      }),
    ],
  },
  // Vigilance : lue dans le texte.
  "Loran of the Third Path": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.optional(target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))],
        label: "Détruisez jusqu'à un artefact ou enchantement",
      }),
      activated({
        tap: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.draw(1), fx.draw(1, ref.target())],
        label: "Vous et l'adversaire ciblé piochez une carte",
      }),
    ],
  },
  // Lien de vie : lu dans le texte.
  "Mangara, the Diplomat": {
    abilities: [
      // « … si deux de ces créatures ou plus vous attaquent, vous et/ou vos planeswalkers ».
      triggered(when.opponentAttacksYouWith(2, true), [fx.draw(1)], {
        label: "Un adversaire vous attaque avec deux créatures ou plus : piochez",
      }),
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.draw(1)], { label: "Deuxième sort d'un adversaire : piochez" }),
    ],
  },
  // Défenseur : lu dans le texte.
  "Wall of Omens": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })] },
  Brainstorm: {
    spell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryTop" },
          { count: 2, min: 2, prompt: "Deux cartes à remettre sur votre bibliothèque" },
        ),
      ],
    ),
  },
  "Cryptic Command": {
    spell: chooseTwo(
      { label: "Contrecarrez le sort ciblé", targets: [target.spell("s")], effects: [fx.counter(ref.target("s"))] },
      {
        label: "Renvoyez le permanent ciblé",
        targets: [
          target.permanent("p", ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"], {}, "permanent"),
        ],
        effects: [fx.bounce(ref.target("p"))],
      },
      { label: "Engagez les créatures adverses", effects: [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))] },
      { label: "Piochez une carte", effects: [fx.draw(1)] },
    ),
  },
  "Deadly Dispute": {
    additionalCost: { sacrifice: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, count: 1 } },
    spell: spell([], [fx.draw(2), fx.createTokens(TREASURE)]),
  },
  "Diabolic Intent": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.search({}, { to: "hand" })]),
  },
  // Contact mortel : lu dans le texte.
  "Varragoth, Bloodsky Sire": {
    abilities: [
      activated({
        mana: "{1}{B}",
        oncePerTurn: true,
        activationCondition: cond.sourceMatches({ attackedThisTurn: true }),
        targets: [target.player()],
        effects: [fx.search({}, { to: "libraryTop" }, 1, ref.target())],
        label: "Vantardise : le joueur ciblé met une carte de sa bibliothèque sur le dessus",
      }),
    ],
  },
  // Célérité : lue dans le texte.
  "Captain Lannery Storm": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Attaque : un Trésor" }),
      triggered(when.sacrifice({ subtype: "Treasure" }), [fx.pump(ref.self, 1, 0)], {
        label: "Vous sacrifiez un Trésor : +1/+0",
      }),
    ],
  },
  "Lightning Bolt": { spell: spell([target.any()], [fx.damage(3, ref.target())]) },
  "Najeela, the Blade-Blossom": {
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], subtype: "Warrior" }),
        fx.may("créer un Guerrier 1/1 engagé et attaquant", {
          ...fx.createTokens(WARRIOR_W, 1, ref.controllerOf(ref.eventObject)),
          tapped: true,
          attacking: true,
        } as Effect),
        { label: "Un Guerrier attaque : son contrôleur peut créer un Guerrier 1/1 attaquant" },
      ),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        activationCondition: IN_COMBAT,
        effects: [
          fx.untap(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"], attacking: true })),
          fx.pumpAll({ attacking: true }, 0, 0, ["trample", "lifelink", "haste"]),
          fx.extraCombat,
        ],
        label: "Dégagez les attaquants ; piétinement, lien de vie, célérité ; un combat supplémentaire",
      }),
    ],
  },
  Farseek: {
    spell: spell(
      [],
      [
        fx.search(
          { types: ["Land"], anySubtype: ["Plains", "Island", "Swamp", "Mountain"] },
          { to: "battlefield", tapped: true },
        ),
      ],
    ),
  },
  "Nature's Claim": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
      [fx.gainLife(4, ref.controllerOf(ref.target())), fx.destroy(ref.target())],
    ),
  },
  // Piétinement : lu dans le texte.
  "Primeval Titan": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, 2)], {
        label: "Jusqu'à deux cartes de terrain, engagées",
      }),
      triggered(when.attacksSelf, [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, 2)], {
        label: "Jusqu'à deux cartes de terrain, engagées",
      }),
    ],
  },
  "Dovin's Veto": {
    cantBeCountered: true,
    spell: spell([target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")], [fx.counter(ref.target())]),
  },
  "Isshin, Two Heavens as One": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "attack" },
        label: "Les déclenchements dus à une créature qui attaque se déclenchent une fois de plus",
      }),
    ],
  },
  "Kinnan, Bonder Prodigy": {
    abilities: [
      eventReplacement({
        event: "mana",
        source: { notTypes: ["Land"], controller: "you" },
        modify: { add: 1 },
        label: "Un permanent non-terrain engagé pour du mana : un mana de plus du même type",
      }),
      activated({
        mana: "{5}{G}{U}",
        effects: [
          fx.lookAtTop(5, {
            filter: { types: ["Creature"], notSubtype: "Human" },
            count: 1,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        label: "Parmi les cinq du dessus, une créature non-Humain sur le champ de bataille",
      }),
    ],
  },
  "Chromatic Lantern": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addAbilities: [manaAbility([...ANY])] },
        {
          label: "Vos terrains produisent un mana de n'importe quelle couleur",
        },
      ),
      manaAbility([...ANY]),
    ],
  },
  // Vol, équipage 1 : lus dans le texte.
  "Smuggler's Copter": {
    abilities: [
      triggered(when.attacksSelf, fx.may("piocher puis défausser", ...fx.loot()), {
        label: "Attaque : vous pouvez piocher et défausser",
      }),
      triggered({ on: "blocks", who: "self" }, fx.may("piocher puis défausser", ...fx.loot()), {
        label: "Bloque : vous pouvez piocher et défausser",
      }),
    ],
  },
  "Strixhaven Stadium": {
    abilities: [
      manaAbility("C", 1, { addCounter: "point" }),
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"] }, to: { players: "any" } },
        [fx.removeCounters(ref.self, 1, "point")],
        {
          condition: cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.you)), 1)),
          label: "Une créature vous blesse au combat : retirez un marqueur de point",
        },
      ),
      triggered(
        when.combatDamage(YOUR_CREATURES, true),
        [
          fx.counters(ref.self, "point"),
          ...fx.when(cond.amountAtLeast(amount.countersOn(ref.self, "point"), 10), [
            fx.removeCounters(ref.self, 99, "point"),
            fx.playerLoses(ref.eventPlayer),
          ]),
        ],
        { label: "Une de vos créatures blesse un adversaire : un marqueur de point ; dix : il perd la partie" },
      ),
    ],
  },
  // — G4e : sous-lot difficile —
  // Lien de vie : lu dans le texte.
  "K'rrik, Son of Yawgmoth": {
    abilities: [
      playerStatic({ phyrexianMana: "B", label: "Chaque {B} de vos coûts peut se payer avec 2 PV" }),
      triggered(when.castSpell("you", { colors: ["B"] }), [fx.addCounters(ref.self, 1)], {
        label: "Sort noir : un marqueur +1/+1",
      }),
    ],
  },
  "Laboratory Maniac": {
    abilities: [
      playerStatic({
        winOnEmptyDraw: true,
        label: "Si vous deviez piocher dans une bibliothèque vide, vous gagnez la partie à la place",
      }),
    ],
  },
  "Nyxbloom Ancient": {
    abilities: [
      eventReplacement({
        event: "mana",
        to: "you",
        modify: { times: 3 },
        label: "Un permanent que vous engagez pour du mana en produit trois fois autant",
      }),
    ],
  },
  "Ancient Copper Dragon": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rollDie(20, "d20"), fx.createTokens(TREASURE, amount.v("d20"))], {
        label: "Blessures de combat à un joueur : lancez un d20, autant de Trésors",
      }),
    ],
  },
  "Teferi, Mage of Zhalfir": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["flash"] },
        label: "Vos cartes de créature ont le flash",
      }),
      playerStatic({
        castLimit: { who: "opponents", sorceryTiming: true },
        label: "Vos adversaires ne lancent des sorts qu'au moment d'un rituel",
      }),
    ],
  },
  "Atraxa, Grand Unifier": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(10, { count: 8, onePerType: true, rest: "bottom" })], {
        label: "Arrivée : révélez dix cartes ; une de chaque type de carte dans votre main",
      }),
    ],
  },
  "Carpet of Flowers": {
    abilities: [
      // « Si vous n'avez pas ajouté de mana avec cette capacité ce tour-ci » : un refus ne compte pas.
      triggered(
        when.eachMain,
        fx.may(
          "Ajouter du mana (autant que d'Îles de l'adversaire) ?",
          fx.addManaChoice(amount.refCount(ref.permanentsOf(ref.target(), { subtype: "Island" }))),
          fx.doneOncePerTurn,
        ),
        {
          targets: [target.player("t", "opponent")],
          oncePerTurn: "ifDone",
          label:
            "Début de chacune de vos phases principales : X mana d'une couleur, X étant le nombre d'Îles de l'adversaire ciblé",
        },
      ),
    ],
  },
  "Winota, Joiner of Forces": {
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], controller: "you", notSubtype: "Human" }),
        [
          fx.lookAtTop(6, {
            filter: { types: ["Creature"], subtype: "Human" },
            count: 1,
            to: { to: "battlefield", tapped: true, attacking: true },
            rest: "bottom",
            store: "w",
          }),
          fx.pump(ref.stored("w"), 0, 0, ["indestructible"]),
        ],
        { label: "Une créature non-Humain attaque : un Humain des six cartes du dessus arrive engagé et attaquant" },
      ),
    ],
  },
  "Jodah, the Unifier": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", legendary: true },
        { power: 1, toughness: 1 },
        {
          perAmount: amount.count({ types: ["Creature"], controller: "you", legendary: true }),
          label: "Vos créatures légendaires : +X/+X (X : vos créatures légendaires)",
        },
      ),
      triggered(
        { on: "castSpell", by: "you", filter: { legendary: true }, fromHand: true },
        [fx.cascade(amount.manaValueOf(ref.eventObject), { legendary: true })],
        { label: "Vous lancez un sort légendaire de votre main : cascade légendaire" },
      ),
    ],
  },
  "Bolas's Citadel": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Vous pouvez regarder la carte du dessus de votre bibliothèque" }),
      playerStatic({
        playFrom: { zone: "libraryTop", what: "lands" },
        label: "Vous pouvez jouer des terrains du dessus de votre bibliothèque",
      }),
      playerStatic({
        playFrom: { zone: "libraryTop", what: "spells", payLifeManaValue: true },
        label: "Sorts du dessus de votre bibliothèque : des PV égaux à leur VM au lieu de leur coût",
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { notTypes: ["Land"] }, count: 10, includeSelf: true },
        effects: [fx.loseLife(10, ref.eachOpponent)],
        label: "{T}, sacrifiez dix permanents non-terrain : chaque adversaire perd 10 PV",
      }),
    ],
  },
  "Gix, Yawgmoth Praetor": {
    abilities: [
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"] }, to: { players: "opponent" } },
        fx.mayFor(
          ref.controllerOf(ref.eventObject),
          "Payer 1 PV pour piocher une carte ?",
          fx.loseLife(1, ref.controllerOf(ref.eventObject)),
          fx.draw(1, ref.controllerOf(ref.eventObject)),
        ),
        { label: "Une créature blesse un de vos adversaires : son contrôleur peut payer 1 PV et piocher" },
      ),
      activated({
        mana: "{4}{B}{B}{B}",
        discardX: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.exileTop(ref.target(), amount.x, "g"), fx.grantPlay(ref.stored("g"), { free: true, forever: true })],
        label: "{4}{B}{B}{B}, défaussez X cartes : exilez les X cartes du dessus de l'adversaire ; jouez-les sans payer",
      }),
    ],
  },
};
