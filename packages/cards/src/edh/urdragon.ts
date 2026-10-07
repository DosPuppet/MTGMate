/**
 * Commander : deck The Ur-Dragon (Dragons, cinq couleurs ; « How to Train Ur-Dragon [Primer!] », Moxfield). Le
 * commandant, ses Dragons, la base de mana (créatures et artefacts de mana, terrains) et les sorts.
 */
import type { CardScript, Effect, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  cond,
  doesntUntap,
  entersWith,
  fx,
  loyalty,
  manaAbility,
  modal,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const DRAGON_YOU: ObjectFilter = { subtype: "Dragon", controller: "you" };
const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Vos commandants sur le champ de bataille ou dans la zone de commandement (Majestic Genesis). */
const COMMANDERS_OUT = ref.union(
  ref.zone("battlefield", ref.eachPlayer, { commander: true, owner: "you" }),
  ref.zone("command", ref.you, { commander: true }),
);

/** Faerie Dragon bleu 1/1 avec le vol (Ancient Gold Dragon). */
const FAERIE_DRAGON: TokenSpec = {
  name: "Faerie Dragon",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Faerie", "Dragon"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
/** Esprit incolore 1/1 (Forbidden Orchard). */
const SPIRIT_COLORLESS: TokenSpec = {
  name: "Spirit",
  colors: [],
  types: ["Creature"],
  subtypes: ["Spirit"],
  power: 1,
  toughness: 1,
};
/** Oiseau bleu 2/2 avec le vol (Swan Song). */
const BIRD_BLUE: TokenSpec = {
  name: "Bird",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Bird"],
  power: 2,
  toughness: 2,
  keywords: ["flying"],
};

/** « Chaque fois que [ce Dragon] ou un autre Dragon que vous contrôlez arrive, il inflige X blessures à n'importe quelle
 * cible, X étant le nombre de Dragons que vous contrôlez » (Scourge of Valkas, Dragon Tempest). */
const dragonEntersDamage = (label: string) =>
  triggered(when.enters(DRAGON_YOU), [fx.damage(amount.count(DRAGON_YOU), ref.target(), ref.eventObject)], {
    targets: [target.any()],
    label,
  });

export const EDH_URDRAGON: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  "The Ur-Dragon": {
    abilities: [
      // Éminence : depuis la zone de commandement aussi. « Autres » : pas The Ur-Dragon lui-même.
      playerStatic({
        spellCost: { filter: { subtype: "Dragon", not: { name: "The Ur-Dragon" } }, reduce: 1 },
        fromCommand: true,
        label: "Éminence — vos autres sorts de Dragon coûtent {1} de moins",
      }),
      triggered(
        when.attackWith(1, DRAGON_YOU),
        [
          fx.draw(amount.eventAmount),
          fx.pickFromZone("hand", { permanent: true }, { to: "battlefield" }, { min: 0, prompt: "Un permanent de votre main" }),
        ],
        { label: "Des Dragons attaquent : piochez autant de cartes, puis un permanent de votre main sur le champ de bataille" },
      ),
    ],
  },

  // --- Mana : créatures et artefacts --------------------------------------------------------------------------------
  "Birds of Paradise": { abilities: [manaAbility(ANY_COLOR)] },
  "Noble Hierarch": { abilities: [manaAbility(["G", "W", "U"])] },
  "Ignoble Hierarch": { abilities: [manaAbility(["B", "R", "G"])] },
  "Delighted Halfling": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, {
        restriction: { spell: { legendary: true } },
        rider: { spell: { legendary: true }, effect: "uncounterable" },
      }),
    ],
  },
  "Selvala, Heart of the Wilds": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], other: true }),
        fx.when(
          cond.eventObjectStrictlyGreatestPower,
          fx.mayFor(ref.controllerOf(ref.eventObject), "Piocher une carte ?", fx.draw(1, ref.controllerOf(ref.eventObject))),
        ),
        { label: "Une créature plus forte que toutes les autres arrive : son contrôleur peut piocher" },
      ),
      activated({
        mana: "{G}",
        tap: true,
        effects: [fx.addManaCombination(amount.maxPower(CREATURE_YOU))],
        label: "X mana en n'importe quelle combinaison (X : la plus grande force parmi vos créatures)",
      }),
    ],
  },
  "Mana Vault": {
    abilities: [
      manaAbility("C", 3),
      triggered(when.yourUpkeep, fx.mayPay("{4}", "Payer {4} pour dégager Mana Vault ?", fx.untap(ref.self)), {
        condition: cond.sourceMatches({ tapped: true }),
        label: "Payez {4} : dégagez-le",
      }),
      triggered(when.step("draw"), [fx.damage(1, ref.you)], {
        condition: cond.sourceMatches({ tapped: true }),
        label: "Engagé : 1 blessure à vous",
      }),
      doesntUntap("self", { label: "Ne se dégage pas lors de votre étape de dégagement" }),
    ],
  },
  // Approximation : « si cet artefact devait arriver, vous pouvez défausser une carte de terrain à la place » est une
  // capacité d'arrivée (il arrive, puis il est sacrifié si aucun terrain n'est défaussé ; docs/approximations.md).
  "Mox Diamond": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.discard(1, ref.you, { filter: { types: ["Land"] }, optional: true, store: "land" }),
          fx.when(cond.not(cond.v("land")), fx.sacrificeIt(ref.self)),
        ],
        { label: "Défaussez une carte de terrain, sinon sacrifiez-le" },
      ),
      manaAbility(ANY_COLOR),
    ],
  },
  "Chromatic Orrery": {
    abilities: [
      playerStatic({
        spellCost: { filter: {}, anyMana: true },
        label: "Vous pouvez dépenser du mana comme s'il était de n'importe quelle couleur",
      }),
      manaAbility("C", 5),
      activated({
        mana: "{5}",
        tap: true,
        effects: [fx.draw(amount.colorsAmong())],
        label: "Piochez une carte par couleur parmi vos permanents",
      }),
    ],
  },

  // --- Terrains -----------------------------------------------------------------------------------------------------
  "City of Brass": {
    abilities: [
      manaAbility(ANY_COLOR),
      triggered(when.tapsSelf, [fx.damage(1, ref.you)], { label: "Devient engagée : 1 blessure à vous" }),
    ],
  },
  // Approximation : « quand vous engagez ce terrain pour du mana » se lit « quand il devient engagé ».
  "Forbidden Orchard": {
    abilities: [
      manaAbility(ANY_COLOR),
      triggered(when.tapsSelf, [fx.createTokens(SPIRIT_COLORLESS, 1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire ciblé crée un Esprit 1/1 incolore",
      }),
    ],
  },
  "Arena of Glory": {
    abilities: [
      entersWith({ tapped: true, condition: cond.not(cond.controls({ subtype: "Mountain" })), label: "Engagée sans Montagne" }),
      manaAbility("R"),
      activated({
        mana: "{R}",
        tap: true,
        exert: true,
        effects: [fx.addManaWithRider({ spell: { types: ["Creature"] }, effect: "haste" }, "R", "R")],
        label: "Épuisez-la : {R}{R} ; une créature lancée avec ce mana a la célérité",
      }),
    ],
  },
  "Boseiju, Who Endures": {
    abilities: [
      manaAbility("G"),
      activated({
        mana: "{1}{G}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count({ types: ["Creature"], legendary: true, controller: "you" }) },
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment", "Land"],
            { controller: "opponent", not: { types: ["Land"], basic: true } },
            "artefact, enchantement ou terrain non-base d'un adversaire",
          ),
        ],
        effects: [
          fx.destroy(ref.target()),
          ...fx.mayFor(
            ref.controllerOf(ref.target()),
            "chercher un terrain avec un type de terrain de base",
            fx.search(
              { types: ["Land"], anySubtype: ["Plains", "Island", "Swamp", "Mountain", "Forest"] },
              { to: "battlefield" },
              1,
              ref.controllerOf(ref.target()),
            ),
          ),
        ],
        label: "Canalisation — détruisez un artefact, un enchantement ou un terrain non-base d'un adversaire",
      }),
    ],
  },
  "Horizon of Progress": {
    abilities: [
      manaAbility([...ANY_COLOR, "C"], 1, { likeLands: {}, payLife: 1 }),
      activated({
        mana: "{3}",
        tap: true,
        effects: [
          fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { min: 0, prompt: "Un terrain" }),
        ],
        label: "Mettez une carte de terrain de votre main sur le champ de bataille engagée",
      }),
      activated({ mana: "{1}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Sacrifiez-le : piochez" }),
    ],
  },

  // --- Enchantements et artefacts -----------------------------------------------------------------------------------
  "Dragon Tempest": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU, keyword: "flying" }), [fx.pump(ref.eventObject, 0, 0, ["haste"])], {
        label: "Une créature volante arrive : elle a la célérité",
      }),
      dragonEntersDamage("Un Dragon arrive : il inflige X blessures (X : vos Dragons)"),
    ],
  },
  "Temur Ascendancy": {
    abilities: [
      staticAbility(CREATURE_YOU, { addKeywords: ["haste"] }, { label: "Vos créatures ont la célérité" }),
      triggered(when.enters({ ...CREATURE_YOU, minPower: 4 }), fx.may("Piocher une carte ?", fx.draw(1)), {
        label: "Une créature de force 4 ou plus arrive : vous pouvez piocher",
      }),
    ],
  },
  "Steely Resolve": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility(
        { types: ["Creature"], subtypeChosen: true },
        { addKeywords: ["shroud"] },
        { label: "Les créatures du type choisi ont la défense totale" },
      ),
    ],
  },

  // --- Planeswalker ---------------------------------------------------------------------------------------------------
  "Kiora, Behemoth Beckoner": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU, minPower: 4 }), [fx.draw(1)], {
        label: "Une créature de force 4 ou plus arrive : piochez une carte",
      }),
      loyalty(-1, {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        effects: [fx.untap(ref.target())],
        label: "Dégagez le permanent ciblé",
      }),
    ],
  },

  // --- Sorts ----------------------------------------------------------------------------------------------------------
  "Stubborn Denial": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
      [
        fx.when(cond.ferocious, fx.counter(ref.target())),
        fx.when(
          cond.not(cond.ferocious),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{1}" }, fx.counter(ref.target())),
        ),
      ],
    ),
  },
  "Swan Song": {
    spell: spell(
      [target.spell("t", { types: ["Enchantment", "Instant", "Sorcery"] }, "sort d'enchantement, d'éphémère ou de rituel")],
      [fx.counter(ref.target()), fx.createTokens(BIRD_BLUE, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Crux of Fate": {
    spell: modal(
      {
        label: "Détruisez toutes les créatures Dragon",
        targets: [],
        effects: [fx.destroyAll({ types: ["Creature"], subtype: "Dragon" })],
      },
      {
        label: "Détruisez toutes les créatures non-Dragon",
        targets: [],
        effects: [fx.destroyAll({ types: ["Creature"], notSubtype: "Dragon" })],
      },
    ),
  },
  "Majestic Genesis": {
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.greatestManaValueOf(COMMANDERS_OUT), {
          filter: { permanent: true },
          count: amount.greatestManaValueOf(COMMANDERS_OUT),
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },

  // --- Dragons --------------------------------------------------------------------------------------------------------
  "Ancient Gold Dragon": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rollDie(20, "d20"), fx.createTokens(FAERIE_DRAGON, amount.v("d20"))], {
        label: "Blessures de combat à un joueur : lancez un d20, autant de Faerie Dragons 1/1 volants",
      }),
    ],
  },
  "Cavern-Hoard Dragon": {
    costReduction: { generic: amount.maxOverPlayers(ref.eachOpponent, amount.count({ types: ["Artifact"], controller: "you" })) },
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [fx.createTokens(TREASURE, amount.refCount(ref.zone("battlefield", ref.eventPlayer, { types: ["Artifact"] })))],
        { label: "Blessures de combat à un joueur : un Trésor par artefact qu'il contrôle" },
      ),
    ],
  },
  "Dragonlord Dromoka": {
    cantBeCountered: true,
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn" },
        label: "Vos adversaires ne peuvent pas lancer de sorts pendant votre tour",
      }),
    ],
  },
  "Dragonlord Kolaghan": {
    abilities: [
      staticAbility(
        { ...CREATURE_YOU, other: true },
        { addKeywords: ["haste"] },
        { label: "Vos autres créatures ont la célérité" },
      ),
      triggered(when.castSpell("opponent", { types: ["Creature", "Planeswalker"] }), [fx.loseLife(10, ref.eventPlayer)], {
        condition: cond.amountAtLeast(amount.refCount(ref.zone("graveyard", ref.eventPlayer, { nameOf: ref.eventObject })), 1),
        label: "Un adversaire lance un sort du nom d'une carte de son cimetière : il perd 10 PV",
      }),
    ],
  },
  "Ganax, Astral Hunter": {
    abilities: [triggered(when.enters(DRAGON_YOU), [fx.createTokens(TREASURE)], { label: "Un Dragon arrive : un Trésor" })],
  },
  "Goldlust Triad": {
    // Myriade : lue dans le texte.
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(TREASURE)], { label: "Un Trésor" })],
  },
  "Goldspan Dragon": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Il attaque : un Trésor" }),
      triggered({ on: "becomesTarget", who: "self", spells: true }, [fx.createTokens(TREASURE)], {
        label: "Ciblé par un sort : un Trésor",
      }),
      staticAbility(
        { subtype: "Treasure", controller: "you" },
        { addAbilities: [manaAbility(ANY_COLOR, 2, { sacrifice: true })] },
        { label: "Vos Trésors : « {T}, sacrifiez : deux mana d'une même couleur »" },
      ),
    ],
  },
  "Hellkite Courser": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Mettre votre commandant sur le champ de bataille ?",
          fx.moveTo(ref.zone("command", ref.you, { commander: true }), { to: "battlefield" }, { name: "cmd" }),
          fx.pump(ref.stored("cmd"), 0, 0, ["haste"]),
          fx.delayed([fx.moveTo(ref.target("cmd"), { to: "command" })], { cmd: ref.stored("cmd") }),
        ),
        { label: "Votre commandant arrive avec la célérité ; il retourne dans la zone de commandement à l'étape de fin" },
      ),
    ],
  },
  "Klauth, Unrivaled Ancient": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.addManaCombination(amount.totalPower({ attacking: true, controller: "you" }), undefined, { spell: {} }, true)],
        { label: "X mana (force totale des attaquants), pour des sorts, gardé jusqu'à la fin du tour" },
      ),
    ],
  },
  "Korvold, Fae-Cursed King": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(w, [fx.sacrifice(ref.you, { permanent: true, other: true })], { label: "Sacrifiez un autre permanent" }),
      ),
      triggered(when.sacrifice({}), [fx.addCounters(ref.self, 1), fx.draw(1)], {
        label: "Vous sacrifiez un permanent : marqueur +1/+1 et piochez",
      }),
    ],
  },
  "Miirym, Sentinel Wyrm": {
    abilities: [
      triggered(
        when.enters({ ...DRAGON_YOU, token: false, other: true }),
        [fx.copyToken(ref.eventObject, { nonlegendary: true })],
        { label: "Un autre Dragon non-jeton arrive : un jeton copie non légendaire" },
      ),
    ],
  },
  "Old Gnawbone": {
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU, true), [fx.createTokens(TREASURE, amount.eventAmount)], {
        label: "Blessures de combat à un joueur : autant de Trésors",
      }),
    ],
  },
  "Scourge of Valkas": {
    abilities: [
      dragonEntersDamage("Lui ou un autre Dragon arrive : X blessures (X : vos Dragons)"),
      activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
    ],
  },
  Tiamat: {
    abilities: [
      triggered(
        when.entersSelf,
        [{ ...fx.search({ subtype: "Dragon", not: { name: "Tiamat" } }, { to: "hand" }, 5), distinctNames: true } as Effect],
        { condition: cond.wasCast, label: "Cherchez jusqu'à cinq cartes de Dragon de noms différents" },
      ),
    ],
  },
  "Ureni of the Unwritten": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [fx.lookAtTop(8, { filter: { types: ["Creature"], subtype: "Dragon" }, count: 1, to: { to: "battlefield" } })],
          { label: "Huit cartes : une carte de créature Dragon sur le champ de bataille" },
        ),
      ),
    ],
  },
  "Zurgo and Ojutai": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        {
          condition: cond.sourceMatches({ enteredThisTurn: true }),
          label: "Défense talismanique tant qu'il est arrivé ce tour-ci",
        },
      ),
      triggered(
        when.combatDamageBatch(DRAGON_YOU),
        [
          fx.lookAtTop(3, { count: 1, exact: true, rest: "bottom" }),
          fx.pickFromZone(
            "hand",
            {},
            { to: "hand" },
            { min: 0, pool: ref.eventObjects, prompt: "Vous pouvez renvoyer un de ces Dragons dans la main de son propriétaire" },
          ),
        ],
        { label: "Des Dragons blessent un joueur : une des trois cartes du dessus en main ; un de ces Dragons peut revenir" },
      ),
    ],
  },
};
