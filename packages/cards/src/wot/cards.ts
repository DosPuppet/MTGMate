/** Enchanting Tales (WOT) : scripts des cartes (PLAN-G). */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  doesntUntap,
  entersWith,
  eventReplacement,
  fx,
  KNIGHT_VIGILANCE,
  playerStatic,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
  ZOMBIE,
} from "../woe/common";

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

const SOLDIER_LIFELINK = creature("Soldier", ["W"], ["Soldier"], 1, 1, { keywords: ["lifelink"] });
const GRIFFIN = creature("Griffin", ["W"], ["Griffin"], 2, 2, { keywords: ["flying"] });
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
/** Le joueur de l'événement est ce joueur-là (pas un autre) : `ref.except(eventPlayer, who)` est vide. */
const eventPlayerIs = (who: Parameters<typeof ref.except>[1]) =>
  cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, who)), 1));
/** « Les terrains non-base sont des Montagnes » (305.7 : ils perdent leurs capacités). */
const MOUNTAINS = staticAbility(
  { types: ["Land"], basic: false },
  { setSubtypes: ["Mountain"], loseAllAbilities: true },
  {
    label: "Les terrains non-base sont des Montagnes",
  },
);

export const CARDS: Record<string, CardScript> = {
  // Extorsion : lue dans le texte.
  "Blind Obedience": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "opponent" },
        label: "Les artefacts et créatures de vos adversaires arrivent engagés",
      }),
    ],
  },
  // — Blanc —
  "Dawn of Hope": {
    abilities: [
      triggered({ on: "life", change: "gain", whose: "you" }, fx.mayPay("{2}", "payer {2} pour piocher", fx.draw(1)), {
        label: "Vous gagnez des PV : payez {2} pour piocher",
      }),
      activated({ mana: "{3}{W}", effects: [fx.createTokens(SOLDIER_LIFELINK)], label: "Un Soldat 1/1 avec le lien de vie" }),
    ],
  },
  "Grasp of Fate": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        // « Pour chaque adversaire, jusqu'à un permanent non-terrain ciblé que ce joueur contrôle. »
        targets: [
          {
            ...target.upTo(
              1,
              target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse (un par adversaire)"),
            ),
            differentPlayers: true,
            countAmount: amount.refCount(ref.eachOpponent),
          },
        ],
        label: "Exilez jusqu'à un permanent non-terrain de chaque adversaire jusqu'à son départ",
      }),
    ],
  },
  "Greater Auramancy": {
    abilities: [
      staticAbility(
        { types: ["Enchantment"], controller: "you", other: true },
        { addKeywords: ["shroud"] },
        {
          label: "Vos autres enchantements ont la défense totale",
        },
      ),
      staticAbility(
        { ...YOUR_CREATURES, enchanted: true },
        { addKeywords: ["shroud"] },
        {
          label: "Vos créatures enchantées ont la défense totale",
        },
      ),
    ],
  },
  "Griffin Aerie": {
    abilities: [
      triggered(when.step("end"), [fx.createTokens(GRIFFIN)], {
        condition: cond.lifeGainedAtLeast(3),
        label: "3 PV gagnés ce tour-ci : un Griffon 2/2 volant",
      }),
    ],
  },
  "Intangible Virtue": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, token: true },
        { power: 1, toughness: 1, addKeywords: ["vigilance"] },
        {
          label: "Vos jetons de créature : +1/+1 et vigilance",
        },
      ),
    ],
  },
  "Knightly Valor": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_VIGILANCE)], { label: "Un Chevalier 2/2 avec la vigilance" }),
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["vigilance"] }, { label: "+2/+2 et vigilance" }),
    ],
  },
  "Land Tax": {
    abilities: [
      triggered(when.yourUpkeep, [fx.search(BASIC_LAND, { to: "hand" }, 3)], {
        // Un adversaire contrôle plus de terrains : vous n'êtes pas parmi les joueurs qui en contrôlent le plus.
        condition: cond.amountAtLeast(amount.refCount(ref.except(ref.you, ref.playersWithMost({ types: ["Land"] }))), 1),
        label: "Un adversaire a plus de terrains : jusqu'à trois terrains de base en main",
      }),
    ],
  },
  "Leyline of Sanctity": {
    leyline: true,
    abilities: [playerStatic({ hexproof: true, label: "Vous avez la défense talismanique" })],
  },
  "Smothering Tithe": {
    abilities: [
      triggered(when.draw(undefined, "opponent"), [fx.unlessPays(ref.eventPlayer, { mana: "{2}" }, fx.createTokens(TREASURE))], {
        label: "Un adversaire pioche : un Trésor, à moins qu'il ne paie {2}",
      }),
    ],
  },
  // — Bleu —
  Compulsion: {
    abilities: [
      activated({ mana: "{1}{U}", discard: 1, effects: [fx.draw(1)], label: "Défaussez une carte : piochez" }),
      activated({ mana: "{1}{U}", sacrifice: true, effects: [fx.draw(1)], label: "Sacrifiez-le : piochez" }),
    ],
  },
  "Copy Enchantment": { asEnters: [fx.chooseCopy({ types: ["Enchantment"] }, { anyController: true })] },
  Curiosity: {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(
        { on: "dealsDamage", who: { attached: "host" }, to: { players: "opponent" } },
        fx.may("piocher une carte", fx.draw(1)),
        { label: "La créature enchantée blesse un adversaire : vous pouvez piocher" },
      ),
    ],
  },
  "Forced Fruition": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.draw(7, ref.eventPlayer)], {
        label: "Un adversaire lance un sort : il pioche sept cartes",
      }),
    ],
  },
  "Fraying Sanity": {
    enchant: { filter: {}, label: "joueur", player: true },
    abilities: [
      triggered(
        { on: "step", step: "end", whose: "any" },
        // X : les cartes (pas les jetons) mises dans le cimetière du joueur enchanté ce tour-ci, d'où qu'elles viennent.
        [
          fx.mill(
            { kind: "turnEvents", query: { event: "zone", to: "graveyard", byOwner: true, token: false }, of: ref.attached },
            ref.attached,
          ),
        ],
        { label: "Le joueur enchanté meule autant de cartes qu'il en a mis dans son cimetière ce tour-ci" },
      ),
    ],
  },
  "Hatching Plans": {
    abilities: [triggered(when.putIntoGraveyardSelf, [fx.draw(3)], { label: "Mis au cimetière : piochez trois cartes" })],
  },
  "Intruder Alarm": {
    abilities: [
      doesntUntap({ types: ["Creature"] }, { label: "Les créatures ne se dégagent pas" }),
      triggered(when.enters({ types: ["Creature"] }), [fx.untap(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }))], {
        label: "Une créature arrive : dégagez toutes les créatures",
      }),
    ],
  },
  "Kindred Discovery": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(when.enters({ ...YOUR_CREATURES, subtypeChosen: true }), [fx.draw(1)], {
        label: "Une créature du type choisi arrive : piochez",
      }),
      triggered(when.attacks({ ...YOUR_CREATURES, subtypeChosen: true }), [fx.draw(1)], {
        label: "Une créature du type choisi attaque : piochez",
      }),
    ],
  },
  "Leyline of Anticipation": {
    leyline: true,
    abilities: [{ kind: "castPermission", flash: true, label: "Vous pouvez lancer des sorts comme s'ils avaient le flash" }],
  },
  "Rhystic Study": {
    abilities: [
      triggered(
        when.castSpell("opponent"),
        [fx.unlessPays(ref.eventPlayer, { mana: "{1}" }, fx.may("piocher une carte", fx.draw(1)))],
        { label: "Un adversaire lance un sort : vous pouvez piocher, à moins qu'il ne paie {1}" },
      ),
    ],
  },
  "Spreading Seas": {
    enchant: { filter: { types: ["Land"] }, label: "terrain" },
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      staticAbility(
        "attached",
        { setSubtypes: ["Island"], loseAllAbilities: true },
        { label: "Le terrain enchanté est une Île" },
      ),
    ],
  },
  // — Noir —
  "Dark Tutelage": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "d" }), fx.loseLife(amount.manaValueOf(ref.stored("d")))],
        { label: "La carte du dessus en main ; perdez autant de PV que sa valeur de mana" },
      ),
    ],
  },
  "Grave Pact": {
    abilities: [
      triggered(when.dies(YOUR_CREATURES), [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })], {
        label: "Une de vos créatures meurt : chaque autre joueur sacrifie une créature",
      }),
    ],
  },
  Oppression: {
    abilities: [
      triggered(when.castSpell("any"), [fx.discard(1, ref.eventPlayer)], {
        label: "Un joueur lance un sort : il défausse une carte",
      }),
    ],
  },
  "Oversold Cemetery": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toHand(ref.target())], {
        targets: [
          target.optional(target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")),
        ],
        condition: cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 4),
        label: "Quatre cartes de créature au cimetière : renvoyez-en une en main",
      }),
    ],
  },
  "Polluted Bonds": {
    abilities: [
      triggered(
        when.enters({ types: ["Land"], controller: "opponent" }),
        [fx.loseLife(2, ref.controllerOf(ref.eventObject)), fx.gainLife(2)],
        { label: "Un terrain adverse arrive : son contrôleur perd 2 PV, vous en gagnez 2" },
      ),
    ],
  },
  "Sanguine Bond": {
    abilities: [
      triggered({ on: "life", change: "gain", whose: "you" }, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Vous gagnez des PV : l'adversaire ciblé en perd autant",
      }),
    ],
  },
  "Stab Wound": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: -2, toughness: -2 }, { label: "−2/−2" }),
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.loseLife(2, ref.controllerOf(ref.attached))], {
        condition: eventPlayerIs(ref.controllerOf(ref.attached)),
        label: "Entretien du contrôleur de la créature enchantée : il perd 2 PV",
      }),
    ],
  },
  "Waste Not": {
    abilities: [
      triggered(when.discard("opponent"), [fx.createTokens(ZOMBIE)], {
        condition: cond.refMatches(ref.eventObject, { types: ["Creature"] }),
        label: "Un adversaire défausse une créature : un Zombie 2/2",
      }),
      triggered(when.discard("opponent"), [fx.addMana("B", "B")], {
        condition: cond.refMatches(ref.eventObject, { types: ["Land"] }),
        label: "Un adversaire défausse un terrain : {B}{B}",
      }),
      triggered(when.discard("opponent"), [fx.draw(1)], {
        condition: cond.refMatches(ref.eventObject, { notTypes: ["Creature", "Land"] }),
        label: "Un adversaire défausse une autre carte : piochez",
      }),
    ],
  },
  // — Rouge —
  "Aggravated Assault": {
    abilities: [
      activated({
        mana: "{3}{R}{R}",
        sorcerySpeed: true,
        effects: [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombatAfterMain],
        label: "Dégagez vos créatures ; un combat et une phase principale supplémentaires",
      }),
    ],
  },
  "Blood Moon": { abilities: [MOUNTAINS] },
  "Dragon Mantle": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      staticAbility(
        "attached",
        { addAbilities: [activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })] },
        { label: "« {R} : +1/+0 »" },
      ),
    ],
  },
  "Fiery Emancipation": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        modify: { times: 3 },
        label: "Vos sources infligent le triple des blessures",
      }),
    ],
  },
  "Goblin Bombardment": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "Sacrifiez une créature : 1 blessure à n'importe quelle cible",
      }),
    ],
  },
  "Leyline of Lightning": {
    leyline: true,
    abilities: [
      triggered(when.castSpell("you"), fx.mayPay("{1}", "payer {1} pour 1 blessure", fx.damage(1, ref.target())), {
        targets: [{ id: "t", label: "joueur ou planeswalker", filter: { players: "any", objects: { types: ["Planeswalker"] } } }],
        label: "Vous lancez un sort : payez {1} pour 1 blessure",
      }),
    ],
  },
  "Mana Flare": {
    abilities: [
      eventReplacement({
        event: "mana",
        source: { types: ["Land"] },
        modify: { add: 1 },
        label: "Un terrain engagé pour du mana en produit un de plus",
      }),
    ],
  },
  "Raid Bombardment": {
    abilities: [
      // « Le joueur ou planeswalker que cette créature attaque » : celui de l'événement d'attaque.
      triggered(when.attacks({ ...YOUR_CREATURES, maxPower: 2 }), [fx.damage(1, ref.eventPlayer)], {
        label: "Une de vos créatures de force 2 ou moins attaque : 1 blessure à ce qu'elle attaque",
      }),
    ],
  },
  Repercussion: {
    abilities: [
      triggered(when.dealtDamage({ types: ["Creature"] }), [fx.damage(amount.eventAmount, ref.controllerOf(ref.eventObject))], {
        label: "Une créature subit des blessures : autant à son contrôleur",
      }),
    ],
  },
  "Sneak Attack": {
    abilities: [
      activated({
        mana: "{R}",
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield", addKeywords: ["haste"] },
            { count: 1, min: 0, store: "s" },
          ),
          fx.delayed([fx.sacrificeIt(ref.target("s"))], { s: ref.stored("s") }),
        ],
        label: "Mettez une créature de votre main, avec la célérité ; sacrifiée à l'étape de fin",
      }),
    ],
  },
  // — Vert —
  "Defense of the Heart": {
    abilities: [
      triggered(when.yourUpkeep, [fx.sacrificeIt(ref.self), fx.search({ types: ["Creature"] }, { to: "battlefield" }, 2)], {
        condition: cond.amountAtLeast(
          amount.refCount(ref.playersWhere(ref.eachOpponent, cond.controls({ types: ["Creature"] }, 3))),
          1,
        ),
        label: "Un adversaire a trois créatures : sacrifiez-la, deux créatures de votre bibliothèque",
      }),
    ],
  },
  "Hardened Scales": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "Un marqueur +1/+1 de plus sur vos créatures",
      }),
    ],
  },
  "Leyline of Abundance": {
    leyline: true,
    abilities: [
      eventReplacement({
        event: "mana",
        source: { types: ["Creature"], controller: "you" },
        extraMana: "G",
        modify: { add: 1 },
        label: "Une de vos créatures engagée pour du mana : {G} de plus",
      }),
      activated({
        mana: "{6}{G}{G}",
        effects: [fx.addCountersAll(YOUR_CREATURES, 1)],
        label: "Un marqueur +1/+1 sur chacune de vos créatures",
      }),
    ],
  },
  "Nature's Will": {
    abilities: [
      triggered(
        { on: "combatDamageBatch", who: YOUR_CREATURES },
        [
          fx.tap(ref.permanentsOf(ref.eventPlayer, { types: ["Land"] })),
          fx.untap(ref.permanentsOf(ref.you, { types: ["Land"] })),
        ],
        { label: "Vos créatures blessent un joueur : engagez ses terrains, dégagez les vôtres" },
      ),
    ],
  },
  "Parallel Lives": {
    abilities: [eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Vos jetons sont créés en double" })],
  },
  "Primal Vigor": {
    abilities: [
      eventReplacement({ event: "tokens", modify: { times: 2 }, label: "Les jetons sont créés en double" }),
      eventReplacement({
        event: "counters",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { times: 2 },
        label: "Les marqueurs +1/+1 sont doublés",
      }),
    ],
  },
  "Prismatic Omen": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addSubtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] },
        { label: "Vos terrains ont tous les types de terrain de base" },
      ),
    ],
  },
  "Season of Growth": {
    abilities: [
      triggered(when.enters(YOUR_CREATURES), [fx.scry(1)], { label: "Une de vos créatures arrive : regard 1" }),
      triggered(when.castSpell("you", undefined, { objects: YOUR_CREATURES }), [fx.draw(1)], {
        label: "Vous lancez un sort qui cible une de vos créatures : piochez",
      }),
    ],
  },
  "Unnatural Growth": {
    abilities: [
      triggered(
        { on: "step", step: "beginCombat", whose: "any" },
        [fx.doublePT(ref.permanentsOf(ref.you, { types: ["Creature"] }))],
        {
          label: "Début de chaque combat : doublez la force et l'endurance de vos créatures",
        },
      ),
    ],
  },
  "Utopia Sprawl": {
    enchant: { filter: { types: ["Land"], subtype: "Forest" }, label: "Forêt" },
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      eventReplacement({
        event: "mana",
        source: { attached: "host" },
        extraMana: "chosen",
        modify: { add: 1 },
        label: "La Forêt enchantée engagée pour du mana : un mana de plus de la couleur choisie",
      }),
    ],
  },
  "Phyrexian Unlife": {
    abilities: [
      playerStatic({
        cantLose: "life",
        infectDamageAtZeroLife: true,
        label: "Vous ne perdez pas pour 0 PV ou moins ; à 0 PV ou moins, les blessures vous sont infligées comme par l'infection",
      }),
    ],
  },
  "Ground Seal": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Arrivée : piochez une carte" }),
      playerStatic({
        cantTargetGraveyardCards: true,
        affects: "each",
        label: "Les cartes des cimetières ne peuvent pas être ciblées",
      }),
    ],
  },
  "Shared Animosity": {
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], controller: "you" }),
        [
          fx.pump(
            ref.eventObject,
            amount.refCount(
              ref.except(
                ref.zone("battlefield", ref.eachPlayer, {
                  types: ["Creature"],
                  attacking: true,
                  sharesCreatureTypeWith: ref.eventObject,
                }),
                ref.eventObject,
              ),
            ),
            0,
          ),
        ],
        { label: "Une de vos créatures attaque : +1/+0 par autre attaquant qui partage un type de créature avec elle" },
      ),
    ],
  },
  "Karmic Justice": {
    abilities: [
      triggered(
        when.destroyedByOpponent({ notTypes: ["Creature"], controller: "you" }),
        fx.may("Détruire un permanent de cet adversaire ?", fx.destroy(ref.target())),
        {
          targets: [target.of(ref.eventPlayer, { id: "t", filter: { objects: {} } }, "permanent de cet adversaire")],
          label: "Un adversaire détruit un de vos permanents non-créature : vous pouvez détruire un de ses permanents",
        },
      ),
    ],
  },
  "As Foretold": {
    abilities: [
      triggered(when.yourUpkeep, [fx.counters(ref.self, "time", 1)], { label: "Entretien : un marqueur de temps" }),
      {
        kind: "castPermission",
        freeFrom: "any",
        freeOncePerTurn: true,
        freeFilter: { compare: [cmp.manaValue("<=", amount.lkiCounters("time"))] },
        label: "Une fois par tour : {0} au lieu du coût d'un sort de VM au plus égale aux marqueurs de temps",
      },
    ],
  },
  Necropotence: {
    abilities: [
      playerStatic({ skips: "drawStep", label: "Passez votre étape de pioche" }),
      triggered({ on: "discard", whose: "you" }, [fx.exileCard(ref.eventObject)], {
        label: "Vous défaussez une carte : exilez-la de votre cimetière",
      }),
      activated({
        payLife: 1,
        effects: [
          fx.exileTop(ref.you, 1, "n", "you"),
          fx.delayedAt("yourEndStep", [fx.toHand(ref.target("n"))], { n: ref.stored("n") }),
        ],
        label: "Payez 1 PV : exilez la carte du dessus face cachée ; elle va dans votre main à votre prochaine étape de fin",
      }),
    ],
  },
};
