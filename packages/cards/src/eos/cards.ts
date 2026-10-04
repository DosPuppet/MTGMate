/** Stellar Sights (EOS) : scripts des cartes (PLAN-G). Que des terrains. */
import type { AbilityDef, Color, Keyword } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
  target,
  triggered,
  when,
} from "../tdm/common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const TAPPED = entersWith({ tapped: true, label: "Arrive engagé" });
const ARTIFACTS_3 = cond.controls({ types: ["Artifact"], controller: "you" }, 3);
const LUCK = cond.amountAtLeast(amount.countersOn(ref.self, "luck"), 1);

/**
 * Terrains-créatures de Worldwake et d'Oath of the Gatewatch : engagés, bicolores ; « jusqu'à la fin du tour, ce terrain
 * devient une créature Élémental X/Y [de ses couleurs] avec … ; c'est toujours un terrain ».
 */
function manland(
  colors: [Color, Color],
  mana: string,
  pt: [number, number],
  extra: { keywords?: Keyword[]; abilities?: AbilityDef[]; label?: string } = {},
): CardScript {
  return {
    abilities: [
      TAPPED,
      manaAbility(colors),
      activated({
        mana,
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Elemental"],
            setPower: pt[0],
            setToughness: pt[1],
            setColors: colors,
            ...(extra.keywords ? { addKeywords: extra.keywords } : {}),
            ...(extra.abilities ? { addAbilities: extra.abilities } : {}),
          }),
        ],
        label: extra.label ?? `Devient une créature ${pt[0]}/${pt[1]}`,
      }),
    ],
  };
}

export const CARDS: Record<string, CardScript> = {
  "Ancient Tomb": { abilities: [manaAbility("C", 2, { drawback: { damageYou: 2 } })] },
  "Blinkmoth Nexus": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Artifact", "Creature"],
            addSubtypes: ["Blinkmoth"],
            setPower: 1,
            setToughness: 1,
            addKeywords: ["flying"],
          }),
        ],
        label: "Devient une créature-artefact 1/1 volante",
      }),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { subtype: "Blinkmoth" })],
        effects: [fx.pump(ref.target(), 1, 1)],
        label: "Le Phalène ciblé gagne +1/+1",
      }),
    ],
  },
  "Bonders' Enclave": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.controls({ types: ["Creature"], controller: "you", minPower: 4 }),
        effects: [fx.draw(1)],
        label: "Piochez (créature de force 4 ou plus)",
      }),
    ],
  },
  // Indestructible : lu dans le texte.
  "Cascading Cataracts": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        tap: true,
        effects: [fx.addManaCombination(5)],
        label: "Cinq mana en n'importe quelle combinaison",
      }),
    ],
  },
  // Exaltation : lue dans le texte.
  "Cathedral of War": { abilities: [TAPPED, manaAbility("C")] },
  "Celestial Colonnade": manland(["W", "U"], "{3}{W}{U}", [4, 4], { keywords: ["flying", "vigilance"] }),
  "Contested War Zone": {
    abilities: [
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"] }, to: { players: "any" } },
        [fx.giveControl(ref.self, ref.controllerOf(ref.eventObject))],
        {
          // Les blessures vous sont infligées : le joueur blessé n'est pas un adversaire.
          condition: cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.eachOpponent)), 1),
          label: "Le contrôleur de la créature qui vous blesse en prend le contrôle",
        },
      ),
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.pumpAll({ attacking: true }, 1, 0)],
        label: "Les créatures attaquantes gagnent +1/+0",
      }),
    ],
  },
  "Creeping Tar Pit": manland(["U", "B"], "{1}{U}{B}", [3, 2], { keywords: ["unblockable"] }),
  "Crystal Quarry": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{5}", tap: true, effects: [fx.addMana("W", "U", "B", "R", "G")], label: "Ajoutez {W}{U}{B}{R}{G}" }),
    ],
  },
  "Deserted Temple": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Land"], {}, "terrain")],
        effects: [fx.untap(ref.target())],
        label: "Dégagez le terrain ciblé",
      }),
    ],
  },
  "Dust Bowl": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Land"] }, includeSelf: true },
        targets: [target.permanent("t", ["Land"], { basic: false }, "terrain non-base")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez le terrain non-base ciblé",
      }),
    ],
  },
  "Eldrazi Temple": {
    abilities: [
      manaAbility("C"),
      manaAbility("C", 2, {
        // « Eldrazi incolores » : sorts et sources sans couleur.
        restriction: { spell: { subtype: "Eldrazi", colorCount: 0 }, abilityOfSource: { subtype: "Eldrazi", colorCount: 0 } },
      }),
    ],
  },
  "Endless Sands": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.moveTo(ref.target(), { to: "exile" }, { name: "e" }), fx.link(ref.stored("e"))],
        label: "Exilez une de vos créatures",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.toBattlefield(ref.filtered(ref.linked, { types: ["Creature"] }))],
        label: "Les cartes de créature exilées avec ce terrain reviennent",
      }),
    ],
  },
  "Grove of the Burnwillows": {
    abilities: [manaAbility("C"), manaAbility(["R", "G"], 1, { drawback: { opponentsGainLife: 1 } })],
  },
  "High Market": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.gainLife(1)],
        label: "Sacrifiez une créature : 1 PV",
      }),
    ],
  },
  "Hissing Quagmire": manland(["B", "G"], "{1}{B}{G}", [2, 2], { keywords: ["deathtouch"] }),
  "Inventors' Fair": {
    abilities: [
      triggered(when.yourUpkeep, [fx.gainLife(1)], { condition: ARTIFACTS_3, label: "Trois artefacts : 1 PV" }),
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        activationCondition: ARTIFACTS_3,
        effects: [fx.search({ types: ["Artifact"] }, { to: "hand" })],
        label: "Cherchez une carte d'artefact",
      }),
    ],
  },
  "Lavaclaw Reaches": manland(["B", "R"], "{1}{B}{R}", [2, 2], {
    abilities: [activated({ mana: "{X}", effects: [fx.pump(ref.self, amount.x, 0)], label: "+X/+0" })],
  }),
  // Défense talismanique : lue dans le texte.
  "Lotus Field": {
    abilities: [
      TAPPED,
      triggered(when.entersSelf, [fx.sacrifice(ref.you, { types: ["Land"] }, 2)], { label: "Sacrifiez deux terrains" }),
      manaAbility([...ANY], 3),
    ],
  },
  "Lumbering Falls": manland(["G", "U"], "{2}{G}{U}", [3, 3], { keywords: ["hexproof"] }),
  "Mana Confluence": { abilities: [manaAbility([...ANY], 1, { payLife: 1 })] },
  Mirrorpool: {
    abilities: [
      TAPPED,
      manaAbility("C"),
      activated({
        mana: "{2}{C}",
        tap: true,
        sacrifice: true,
        targets: [target.spell("t", { types: ["Instant", "Sorcery"], controller: "you" }, "votre sort d'éphémère ou de rituel")],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copiez votre éphémère ou rituel ciblé",
      }),
      activated({
        mana: "{4}{C}",
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.copyToken(ref.target())],
        label: "Un jeton copie de votre créature ciblée",
      }),
    ],
  },
  Mutavault: {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        effects: [fx.modify(ref.self, { addTypes: ["Creature"], setPower: 2, setToughness: 2, addKeywords: ["changeling"] })],
        label: "Devient une créature 2/2 de tous les types",
      }),
    ],
  },
  "Mystifying Maze": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        targets: [target.creature("t", { attacking: true, controller: "opponent" })],
        effects: [
          fx.moveTo(ref.target(), { to: "exile" }, { name: "m" }),
          fx.delayed([fx.toBattlefield(ref.target("m"), { tapped: true })], { m: ref.stored("m") }),
        ],
        label: "Exilez l'attaquant ; il revient engagé à l'étape de fin",
      }),
    ],
  },
  "Needle Spires": manland(["R", "W"], "{2}{R}{W}", [2, 1], { keywords: ["doubleStrike"] }),
  "Petrified Field": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")],
        effects: [fx.toHand(ref.target())],
        label: "Renvoyez une carte de terrain de votre cimetière",
      }),
    ],
  },
  // Modulaire 1 : lu dans le texte.
  "Power Depot": {
    abilities: [
      TAPPED,
      manaAbility("C"),
      manaAbility([...ANY], 1, {
        restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } },
      }),
    ],
  },
  "Raging Ravine": manland(["R", "G"], "{2}{R}{G}", [3, 3], {
    abilities: [triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "Attaque : un marqueur +1/+1" })],
  }),
  "Scavenger Grounds": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { subtype: "Desert" }, includeSelf: true },
        effects: [fx.moveTo(ref.zone("graveyard", ref.eachPlayer), { to: "exile" })],
        label: "Exilez tous les cimetières",
      }),
    ],
  },
  "Shambling Vent": manland(["W", "B"], "{1}{W}{B}", [2, 3], { keywords: ["lifelink"] }),
  "Stirring Wildwood": manland(["G", "W"], "{1}{G}{W}", [3, 4], { keywords: ["reach"] }),
  "Strip Mine": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.permanent("t", ["Land"], {}, "terrain")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez le terrain ciblé",
      }),
    ],
  },
  "Terrain Generator": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.pickFromZone("hand", BASIC_LAND, { to: "battlefield", tapped: true }, { count: 1, min: 0 })],
        label: "Vous pouvez mettre un terrain de base de votre main, engagé",
      }),
    ],
  },
  "Thespian's Stage": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.permanent("t", ["Land"], {}, "terrain")],
        // « … sauf qu'il a cette capacité » : la capacité d'indice 1 (celle-ci) est gardée.
        effects: [fx.becomeCopy(ref.self, ref.target(), "permanent", { keepAbilities: [1] })],
        label: "Devient une copie du terrain ciblé",
      }),
    ],
  },
  "Wandering Fumarole": manland(["U", "R"], "{2}{U}{R}", [1, 4], {
    abilities: [
      activated({
        mana: "{0}",
        effects: [fx.modify(ref.self, { switchPT: true })],
        label: "Échangez sa force et son endurance",
      }),
    ],
  }),
  "Blast Zone": {
    abilities: [
      entersWith({ counters: 1, counterKind: "charge", label: "Arrive avec un marqueur de charge" }),
      manaAbility("C"),
      activated({
        mana: "{X}{X}",
        tap: true,
        effects: [fx.counters(ref.self, "charge", amount.x)],
        label: "X marqueurs de charge",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        effects: [fx.destroyAll({ notTypes: ["Land"], manaValueSourceCounters: "charge" })],
        label: "Détruisez chaque permanent non-terrain de valeur de mana égale à ses marqueurs de charge",
      }),
    ],
  },
  "Gemstone Caverns": {
    leyline: { notStartingPlayer: true, counter: "luck", exileFromHand: true },
    abilities: [manaAbility("C", 1, { condition: cond.not(LUCK) }), manaAbility([...ANY], 1, { condition: LUCK })],
  },
  "Inkmoth Nexus": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Artifact", "Creature"],
            addSubtypes: ["Phyrexian", "Blinkmoth"],
            setPower: 1,
            setToughness: 1,
            addKeywords: ["flying", "infect"],
          }),
        ],
        label: "Devient une créature-artefact 1/1 volante avec l'infection",
      }),
    ],
  },
  "Meteor Crater": { abilities: [manaAbility([...ANY], 1, { colorsOf: {} })] },
  "Nesting Grounds": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          { id: "a", label: "permanent que vous contrôlez", filter: { objects: { controller: "you" } } },
          { id: "b", label: "second permanent", filter: { objects: {} } },
        ],
        effects: [fx.moveCounter(ref.target("a"), ref.target("b"))],
        label: "Déplacez un marqueur d'un de vos permanents sur un autre",
      }),
    ],
  },
  "Plaza of Heroes": {
    abilities: [
      manaAbility("C"),
      manaAbility([...ANY], 1, { restriction: { spell: { legendary: true } } }),
      manaAbility([...ANY], 1, { colorsOf: { legendary: true } }),
      activated({
        mana: "{3}",
        tap: true,
        exileSelf: true,
        targets: [target.creature("t", { legendary: true })],
        effects: [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])],
        label: "La créature légendaire ciblée gagne la défense talismanique et l'indestructible",
      }),
    ],
  },
  "Reflecting Pool": { abilities: [manaAbility([...ANY, "C"], 1, { likeLands: {} })] },
  Swarmyard: {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        targets: [target.creature("t", { anySubtype: ["Insect", "Rat", "Spider", "Squirrel"] })],
        effects: [fx.regenerate(ref.target())],
        label: "Régénérez l'Insecte, le Rat, l'Araignée ou l'Écureuil ciblé",
      }),
    ],
  },
};
