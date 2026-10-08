/**
 * Commander : deck « Weight of the World » (The Vision ; incolore ; liste du jeu de proxys Nier: Automata, d'abord
 * reprise de « Nier Automata Deck » de DoomMeat). Artefacts et Équipements (Épées,
 * Excalibur, Nettlecyst, Commander's Plate), clés et Monolithes qui se dégagent, Eldrazi incolores (All Is Dust,
 * Kozilek's Command, Eldrazi Confluence, Echoes of Eternity), trois Ugin et Karn, Living Legacy. Terrains :
 * `edh/visionLands.ts`. En fin de fichier, les cartes de réserve du jeu de proxys (hors du deck).
 */
import type { AbilityDef, CardScript, Effect, ModeDef, ObjectFilter, ProtectionRule, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  altCostMode,
  amount,
  castPermission,
  cmp,
  cond,
  costReducer,
  doesntUntap,
  entersWith,
  eventReplacement,
  flashForAll,
  fx,
  loyalty,
  loyaltyX,
  manaAbility,
  modal,
  mode,
  POWERSTONE,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

/** Incolore (« sort incolore », « permanent incolore ») : aucune couleur. */
const COLORLESS: ObjectFilter = { colorCount: 0 };
/** « D'une ou plusieurs couleurs ». */
const COLORED: ObjectFilter = { not: { colorCount: 0 } };
/** Historique (700.6) : artefact, légendaire ou Saga. */
const HISTORIC: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] };
const ARTIFACTS_YOU: ObjectFilter = { types: ["Artifact"], controller: "you" };
const ALL_COLORS: ProtectionRule = protection.from({ colors: ["W", "U", "B", "R", "G"] }, "Protection contre chaque couleur");

/** Rejeton Eldrazi 0/1 incolore : « sacrifiez ce jeton : ajoutez {C} ». */
const ELDRAZI_SPAWN: TokenSpec = {
  name: "Eldrazi Spawn",
  colors: [],
  types: ["Creature"],
  subtypes: ["Eldrazi", "Spawn"],
  power: 0,
  toughness: 1,
  abilities: [manaAbility("C", 1, { sacrifice: true, noTap: true })],
  text: "Sacrifice this token: Add {C}.",
};
/** Engeance Eldrazi 1/1 incolore : « sacrifiez ce jeton : ajoutez {C} ». */
const ELDRAZI_SCION: TokenSpec = {
  ...ELDRAZI_SPAWN,
  name: "Eldrazi Scion",
  subtypes: ["Eldrazi", "Scion"],
  power: 1,
  toughness: 1,
};
/** Germe phyrexian 0/0 noir (arme vivante). */
const GERM: TokenSpec = {
  name: "Phyrexian Germ",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Phyrexian", "Germ"],
  power: 0,
  toughness: 0,
};
/** Esprit 2/2 incolore (Ugin, the Ineffable). */
const SPIRIT_2: TokenSpec = { name: "Spirit", colors: [], types: ["Creature"], subtypes: ["Spirit"], power: 2, toughness: 2 };

/** Arme vivante (702.92) : « quand cet Équipement arrive, créez un Germe phyrexian 0/0 noir, puis attachez-le à lui ». */
const livingWeapon = (): AbilityDef =>
  triggered(when.entersSelf, [fx.createTokens(GERM, 1, undefined, "germ"), fx.attach(ref.stored("germ"))], {
    label: "Arme vivante — un Germe phyrexian 0/0, puis attachez-lui cet Équipement",
  });

/**
 * Épées des « Swords of X and Y » : +2/+2, protection contre deux couleurs, et un déclenchement quand la créature équipée
 * inflige des blessures de combat à un joueur.
 */
const sword = (
  colors: ["W" | "U" | "B" | "R" | "G", "W" | "U" | "B" | "R" | "G"],
  names: [string, string],
  trigger: { effects: Effect[]; label: string; targets?: TargetSpec[] },
): CardScript => ({
  abilities: [
    staticAbility(
      "attached",
      {
        power: 2,
        toughness: 2,
        addProtections: colors.map((c, i) => protection.from({ colors: [c] }, `Protection contre le ${names[i]}`)),
      },
      { label: `+2/+2, protection contre le ${names[0]} et le ${names[1]}` },
    ),
    triggered(when.attachedDealsCombatDamageToPlayer, trigger.effects, {
      targets: trigger.targets,
      label: trigger.label,
    }),
  ],
});

/** « Choisissez deux — » : chaque paire de modes devient un mode (identifiants de cibles distincts d'un mode à l'autre). */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1))
      out.push({
        label: `${a.label} + ${b.label}`,
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
  });
  return { modes: out };
}

/**
 * « Choisissez trois. Vous pouvez choisir le même mode plusieurs fois » (Eldrazi Confluence) : toutes les combinaisons ;
 * chaque exemplaire d'un mode a ses propres mots « cible » (`i` : son rang).
 */
function chooseThreeRepeat(
  ...modes: { label: string; targets: (i: number) => TargetSpec[]; effects: (i: number) => Effect[] }[]
): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  for (let a = 0; a <= 3; a++)
    for (let b = 0; a + b <= 3; b++) {
      const counts = [a, b, 3 - a - b];
      const picks = counts.flatMap((n, k) => Array.from({ length: n }, (_, i) => ({ m: modes[k] as (typeof modes)[number], i })));
      out.push(
        mode(
          picks.map((p) => p.m.label).join(" + "),
          picks.flatMap((p) => p.m.targets(p.i)),
          picks.flatMap((p) => p.m.effects(p.i)),
        ),
      );
    }
  return { modes: out };
}

export const EDH_VISION: Record<string, CardScript> = {
  // --- Artefacts ------------------------------------------------------------------------------------------------------
  "Basalt Monolith": {
    abilities: [
      doesntUntap("self", { label: "Ne se dégage pas lors de votre étape de dégagement" }),
      manaAbility("C", 3),
      activated({ mana: "{3}", effects: [fx.untap(ref.self)], label: "Dégagez cet artefact" }),
    ],
  },
  // « Choisissez artefact, créature, enchantement, éphémère ou rituel » : un mode d'arrivée (comme Arachne).
  "Cloud Key": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Artifact", "Creature", "Enchantment", "Instant", "Sorcery"] })],
    abilities: [costReducer({ typeChosen: true }, 1, "Vos sorts du type choisi coûtent {1} de moins")],
  },
  "Darksteel Forge": {
    abilities: [
      staticAbility(ARTIFACTS_YOU, { addKeywords: ["indestructible"] }, { label: "Vos artefacts ont l'indestructible" }),
    ],
  },
  // Indestructible : lu dans le texte.
  "Darksteel Monolith": {
    abilities: [
      castPermission({
        freeFrom: "hand",
        freeFilter: COLORLESS,
        freeOncePerTurn: true,
        label: "Une fois par tour : un sort incolore de votre main sans payer son coût de mana",
      }),
    ],
  },
  "Forsaken Monument": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", ...COLORLESS },
        { power: 2, toughness: 2 },
        { label: "Vos créatures incolores gagnent +2/+2" },
      ),
      // « Chaque fois que vous engagez un permanent pour {C}, ajoutez un {C} supplémentaire » : capacité de mana déclenchée
      // (605.1b), comme Mana Flare et Ultima.
      eventReplacement({
        event: "mana",
        to: "you",
        manaProduced: "C",
        modify: { add: 1 },
        label: "Un permanent engagé pour {C} : un {C} de plus",
      }),
      triggered(when.castSpell("you", COLORLESS), [fx.gainLife(2)], { label: "Sort incolore : gagnez 2 PV" }),
    ],
  },
  // Hors d'une partie de Planechase, le dé planaire n'a aucun effet (901.9) : on le lance, rien ne se passe.
  "Fractured Powerstone": {
    abilities: [
      manaAbility("C"),
      activated({ tap: true, sorcerySpeed: true, effects: [fx.rollDie(6, "planar")], label: "Lancez le dé planaire" }),
    ],
  },
  // Flash : lu dans le texte.
  "Gerrard's Hourglass Pendant": {
    abilities: [
      playerStatic({ skips: "extraTurns", affects: "each", label: "Les tours supplémentaires sont passés" }),
      activated({
        mana: "{4}",
        tap: true,
        exileSelf: true,
        effects: [
          fx.moveAll(
            "graveyard",
            ref.you,
            { types: ["Artifact", "Creature", "Enchantment", "Land"], fromBattlefieldThisTurn: true },
            { to: "battlefield", tapped: true },
          ),
        ],
        label: "Renvoyez engagées les cartes mises dans votre cimetière depuis le champ de bataille ce tour-ci",
      }),
    ],
  },
  "Liquimetal Torque": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        targets: [target.nonland("t")],
        effects: [fx.modify(ref.target(), { addTypes: ["Artifact"] })],
        label: "Le permanent non-terrain ciblé devient un artefact jusqu'à la fin du tour",
      }),
    ],
  },
  "Manifold Key": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { other: true }, "autre artefact")],
        effects: [fx.untap(ref.target())],
        label: "Dégagez un autre artefact ciblé",
      }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "La créature ciblée ne peut pas être bloquée ce tour-ci",
      }),
    ],
  },
  "Moonsilver Key": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(
            {
              anyOf: [
                { types: ["Artifact"], withActivatedAbility: "mana" },
                { types: ["Land"], basic: true },
              ],
            },
            { to: "hand" },
          ),
        ],
        label: "Cherchez un artefact avec une capacité de mana ou un terrain de base",
      }),
    ],
  },
  // Métallurgie : vous contrôlez trois artefacts ou plus (lui compris).
  "Mox Opal": {
    abilities: [manaAbility(ANY_COLOR, 1, { condition: cond.controls({ types: ["Artifact"] }, 3) })],
  },
  "Mystic Forge": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Vous pouvez regarder la carte du dessus de votre bibliothèque" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ types: ["Artifact"] }, COLORLESS] }, what: "spells" },
        label: "Lancez des sorts d'artefact et des sorts incolores du dessus de votre bibliothèque",
      }),
      activated({ tap: true, payLife: 1, effects: [fx.exileTop(ref.you, 1, "x")], label: "Exilez la carte du dessus" }),
    ],
  },
  "Nevinyrral's Disk": {
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.destroyAll({ types: ["Artifact", "Creature", "Enchantment"] })],
        label: "Détruisez tous les artefacts, toutes les créatures et tous les enchantements",
      }),
    ],
  },
  // L'assemblage avec Urza, Lord Protector est lu dans le texte (verso Urza, Planeswalker).
  "The Mightstone and Weakstone": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Piochez deux cartes", [], [fx.draw(2)]),
          mode("La créature ciblée gagne −5/−5", [target.creature()], [fx.pump(ref.target(), -5, -5)]),
        ],
        { label: "Piochez deux cartes, ou une créature gagne −5/−5" },
      ),
      manaAbility("C", 2, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } }),
    ],
  },
  "Unwinding Clock": {
    abilities: [
      playerStatic({
        untapOnOthersUntap: { types: ["Artifact"] },
        label: "Vos artefacts se dégagent pendant l'étape de dégagement de chaque autre joueur",
      }),
    ],
  },
  "Vedalken Orrery": { abilities: [flashForAll("Vous pouvez lancer des sorts comme s'ils avaient le flash")] },
  "Voltaic Key": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Artifact"], {}, "artefact")],
        effects: [fx.untap(ref.target())],
        label: "Dégagez l'artefact ciblé",
      }),
    ],
  },

  // --- Équipements (Équiper lu dans le texte) ---------------------------------------------------------------------------
  "Adaptive Omnitool": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: ARTIFACTS_YOU, label: "+1/+1 par artefact que vous contrôlez" },
      ),
      triggered(
        when.attacks({ attached: "host" }),
        [fx.lookAtTop(6, { filter: { types: ["Artifact"] }, count: 1, rest: "bottom" })],
        { label: "La créature équipée attaque : un artefact parmi les six cartes du dessus" },
      ),
    ],
  },
  "Brotherhood Regalia": {
    abilities: [
      staticAbility(
        "attached",
        {
          addAbilities: [wardAbility({ mana: { generic: 2, colored: {}, x: 0 } })],
          addSubtypes: ["Assassin"],
          addKeywords: ["unblockable"],
        },
        { label: "Garde {2}, Assassin, ne peut pas être bloquée" },
      ),
    ],
  },
  "Champion's Helm": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
      staticAbility(
        { attached: "host", legendary: true },
        { addKeywords: ["hexproof"] },
        { label: "Défense talismanique tant que la créature équipée est légendaire" },
      ),
    ],
  },
  // Équiper un commandant {3} : lu dans le texte.
  "Commander's Plate": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 3,
          toughness: 3,
          addProtections: [
            { from: {}, outsideIdentity: true, label: "Protection contre chaque couleur hors de l'identité de votre commandant" },
          ],
        },
        { label: "+3/+3, protection contre chaque couleur hors de l'identité de couleur de votre commandant" },
      ),
    ],
  },
  // Équiper une créature légendaire {2} : lu dans le texte.
  "Excalibur, Sword of Eden": {
    costReduction: { generic: amount.totalManaValue({ ...HISTORIC, controller: "you" }) },
    abilities: [staticAbility("attached", { power: 10, addKeywords: ["vigilance"] }, { label: "+10/+0 et vigilance" })],
  },
  "Hammer of Nazahn": {
    abilities: [
      triggered(
        when.enters({ subtype: "Equipment", controller: "you" }),
        fx.may("Attacher cet Équipement à la créature ciblée ?", fx.attach(ref.target(), ref.eventObject)),
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Un Équipement arrive : vous pouvez l'attacher à une de vos créatures",
        },
      ),
      staticAbility("attached", { power: 2, addKeywords: ["indestructible"] }, { label: "+2/+0 et indestructible" }),
    ],
  },
  // Flash, indestructible : lus dans le texte.
  "Mithril Coat": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you", legendary: true })],
        label: "Attachez-la à une créature légendaire que vous contrôlez",
      }),
      staticAbility("attached", { addKeywords: ["indestructible"] }, { label: "Indestructible" }),
    ],
  },
  Nettlecyst: {
    abilities: [
      livingWeapon(),
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: { types: ["Artifact", "Enchantment"], controller: "you" }, label: "+1/+1 par artefact et/ou enchantement" },
      ),
    ],
  },
  // Flash : lu dans le texte.
  "Silver Shroud Costume": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["shroud"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le à une de vos créatures ; elle a la défense totale jusqu'à la fin du tour",
      }),
      staticAbility("attached", { addKeywords: ["unblockable"] }, { label: "Ne peut pas être bloquée" }),
    ],
  },
  "Sword of Feast and Famine": sword(["B", "G"], ["noir", "vert"], {
    effects: [fx.discard(1, ref.eventPlayer), fx.untapAll({ types: ["Land"] })],
    label: "Ce joueur défausse une carte ; dégagez vos terrains",
  }),
  "Sword of Truth and Justice": sword(["W", "U"], ["blanc", "bleu"], {
    effects: [
      fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "c", {
        prompt: "Créature qui reçoit un marqueur +1/+1",
      }),
      fx.addCounters(ref.stored("c"), 1),
      fx.proliferate(),
    ],
    label: "Un marqueur +1/+1 sur une de vos créatures, puis proliférez",
  }),

  // --- Planeswalkers -----------------------------------------------------------------------------------------------------
  "Karn, Living Legacy": {
    abilities: [
      loyalty(1, { effects: [fx.createTappedTokens(POWERSTONE)], label: "Un jeton Powerstone engagé" }),
      loyalty(-1, {
        effects: [
          fx.payX("Payez autant de mana que vous voulez : vous regardez autant de cartes du dessus", "x"),
          fx.lookAtTop(amount.v("x"), { count: 1, exact: true, rest: "bottom" }),
        ],
        label: "Payez X : regardez X cartes, une en main",
      }),
      loyalty(-7, {
        effects: [
          fx.emblem(
            "Emblème de Karn",
            "Engagez un artefact dégagé que vous contrôlez : cet emblème inflige 1 blessure à n'importe quelle cible.",
            [
              activated({
                tapOthers: { filter: { types: ["Artifact"] }, count: 1 },
                targets: [target.any()],
                effects: [fx.damage(1, ref.target())],
                label: "Engagez un artefact : 1 blessure à n'importe quelle cible",
              }),
            ],
          ),
        ],
        label: "Emblème : engagez un artefact pour 1 blessure",
      }),
    ],
  },
  "Ugin, the Ineffable": {
    abilities: [
      costReducer(COLORLESS, 2, "Vos sorts incolores coûtent {2} de moins"),
      loyalty(1, {
        effects: [
          fx.exileTop(ref.you, 1, "ugin", "you"),
          fx.createTokens(SPIRIT_2, 1, undefined, "spirit"),
          fx.whenNext(when.leaves({}), ref.stored("spirit"), [fx.toHand(ref.target("c"))], {
            bind: { c: ref.stored("ugin") },
            label: "Le jeton Esprit quitte le champ de bataille : la carte exilée va dans votre main",
          }),
        ],
        label: "Exilez la carte du dessus face cachée ; un Esprit 2/2",
      }),
      loyalty(-3, {
        targets: [target.permanent("t", [], COLORED, "permanent d'une ou plusieurs couleurs")],
        effects: [fx.destroy(ref.target())],
        label: "Détruisez un permanent coloré",
      }),
    ],
  },
  "Ugin, the Spirit Dragon": {
    abilities: [
      loyalty(2, {
        targets: [target.any()],
        effects: [fx.damage(3, ref.target())],
        label: "3 blessures à n'importe quelle cible",
      }),
      loyaltyX({
        effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { ...COLORED, compare: [cmp.manaValue("<=", amount.x)] }))],
        label: "Exilez chaque permanent coloré de valeur de mana X ou moins",
      }),
      loyalty(-10, {
        effects: [
          fx.gainLife(7),
          fx.draw(7),
          fx.pickFromZone(
            "hand",
            { permanent: true },
            { to: "battlefield" },
            { count: 7, min: 0, prompt: "Mettez jusqu'à sept cartes de permanent de votre main sur le champ de bataille" },
          ),
        ],
        label: "Gagnez 7 PV, piochez sept cartes, puis jusqu'à sept permanents de votre main",
      }),
    ],
  },

  // --- Créatures -------------------------------------------------------------------------------------------------------
  "Glaring Fleshraker": {
    abilities: [
      triggered(when.castSpell("you", COLORLESS), [fx.createTokens(ELDRAZI_SPAWN)], {
        label: "Sort incolore : un Rejeton Eldrazi 0/1",
      }),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, ...COLORLESS }),
        [fx.damage(1, ref.eachOpponent)],
        { label: "Une autre créature incolore arrive : 1 blessure à chaque adversaire" },
      ),
    ],
  },
  // Flash, vol : lus dans le texte.
  "Liberator, Urza's Battlethopter": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { anyOf: [COLORLESS, { types: ["Artifact"] }] }, keywords: ["flash"] },
        label: "Vos sorts incolores et d'artefact ont le flash",
      }),
      // « Si le mana dépensé est supérieur à la force de Liberator » : vérifié au déclenchement et à la résolution.
      triggered(when.castSpell("you"), [fx.addCounters(ref.self, 1)], {
        condition: cond.amountGreater(amount.eventManaSpent, amount.powerOf(ref.self)),
        label: "Plus de mana dépensé que sa force : un marqueur +1/+1",
      }),
    ],
  },
  // « Quand cette créature meurt ou qu'un autre de vos artefacts va au cimetière » : un seul déclencheur (c'est un artefact).
  "Scrap Trawler": {
    abilities: [
      triggered(when.zoneChange(["battlefield"], { to: ["graveyard"], filter: ARTIFACTS_YOU }), [fx.toHand(ref.target())], {
        targets: [
          {
            ...target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact de valeur de mana inférieure"),
            // « de valeur de mana inférieure » à celle de l'artefact parti, évaluée au ciblage puis à la résolution.
            maxManaValueAmount: amount.plus(amount.manaValueOf(ref.eventObject), -1),
          },
        ],
        label: "Un de vos artefacts va au cimetière : une carte d'artefact de valeur de mana inférieure revient en main",
      }),
    ],
  },
  // Flash : lu dans le texte.
  "Shimmer Myr": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Artifact"] }, keywords: ["flash"] },
        label: "Vos sorts d'artefact ont le flash",
      }),
    ],
  },
  // Flash : lu dans le texte.
  "Skittering Cicada": {
    abilities: [
      playerStatic({ spellKeywords: { filter: COLORLESS, keywords: ["flash"] }, label: "Vos sorts incolores ont le flash" }),
      triggered(
        when.castSpell("you", COLORLESS),
        [fx.pump(ref.self, amount.manaValueOf(ref.eventObject), amount.manaValueOf(ref.eventObject), ["trample"])],
        { label: "Sort incolore : piétinement et +X/+X (X : sa valeur de mana)" },
      ),
    ],
  },
  "Wandering Archaic": {
    abilities: [
      triggered(
        when.castSpell("opponent", { types: ["Instant", "Sorcery"] }),
        fx.unlessPays(ref.eventPlayer, { mana: "{2}" }, fx.may("Copier ce sort ?", fx.copySpell(ref.eventObject, 1))),
        { label: "Un adversaire lance un éphémère ou un rituel : il paie {2}, sinon vous pouvez le copier" },
      ),
    ],
  },
  // « … une carte de terrain et/ou une carte d'éphémère ou de rituel » : un regard pour le terrain (le reste reste au-dessus,
  // dans le même ordre), puis un regard sur les cartes restantes des cinq pour l'éphémère ou le rituel.
  "Explore the Vastlands": {
    spell: spell(
      [],
      [
        ...fx.forEachPlayer(ref.eachPlayer, (p, n) => [
          fx.lookAtTop(5, { who: p, chooser: "owner", filter: { types: ["Land"] }, count: 1, rest: "top", store: `land${n}` }),
          fx.lookAtTop(amount.plus(5, amount.neg(amount.v(`land${n}`))), {
            who: p,
            chooser: "owner",
            filter: { types: ["Instant", "Sorcery"] },
            count: 1,
            rest: "bottom",
          }),
        ]),
        fx.gainLife(3, ref.eachPlayer),
      ],
    ),
  },

  // --- Sorts -----------------------------------------------------------------------------------------------------------
  "All Is Dust": {
    spell: spell([], [fx.sacrificeIt(ref.permanentsOf(ref.eachPlayer, COLORED))]),
  },
  "Desecrate Reality": {
    spell: spell(
      [
        // « Pour chaque adversaire, jusqu'à un … que ce joueur contrôle » : des adversaires différents (cinq au plus).
        {
          ...target.upTo(
            5,
            target.permanent(
              "t",
              [],
              { controller: "opponent", compare: [cmp.parity("even")] },
              "permanent de valeur de mana paire (un par adversaire)",
            ),
          ),
          differentPlayers: true,
        },
      ],
      [
        fx.exile(ref.target()),
        // Adamant : au moins trois mana incolore dépensé.
        ...fx.when(
          cond.spent("C", 3),
          fx.pickFromZone(
            "graveyard",
            { permanent: true, compare: [cmp.parity("odd")] },
            { to: "battlefield" },
            { count: 1, min: 1, prompt: "Carte de permanent de valeur de mana impaire à renvoyer sur le champ de bataille" },
          ),
        ),
      ],
    ),
  },
  "Echoes of Eternity": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { controller: "you", other: true, ...COLORLESS } },
        label: "Les capacités déclenchées de vos autres sorts et permanents incolores se déclenchent une fois de plus",
      }),
      triggered(when.castSpell("you", COLORLESS), [fx.copySpell(ref.eventObject, 1)], {
        label: "Sort incolore : copiez-le",
      }),
    ],
  },
  "Eldrazi Confluence": {
    spell: chooseThreeRepeat(
      {
        label: "Une créature gagne +3/−3",
        targets: (i) => [target.creature(`p${i}`)],
        effects: (i) => [fx.pump(ref.target(`p${i}`), 3, -3)],
      },
      {
        label: "Exilez un permanent non-terrain, puis renvoyez-le engagé",
        targets: (i) => [target.nonland(`e${i}`)],
        effects: (i) => [
          fx.exileCard(ref.target(`e${i}`), { name: `x${i}` }),
          fx.toBattlefield(ref.stored(`x${i}`), { tapped: true }),
        ],
      },
      {
        label: "Une Engeance Eldrazi 1/1",
        targets: () => [],
        effects: () => [fx.createTokens(ELDRAZI_SCION)],
      },
    ),
  },
  "Eldritch Immunity": {
    spell: altCostMode(
      "Surcharge",
      "{4}{C}",
      {
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.modify(ref.target(), { addProtections: [ALL_COLORS] })],
      },
      { effects: [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addProtections: [ALL_COLORS] })] },
    ),
  },
  "Kozilek's Command": {
    spell: chooseTwo(
      mode(
        "Un joueur crée X Rejetons Eldrazi 0/1",
        [target.player("p1")],
        [fx.createTokens(ELDRAZI_SPAWN, amount.x, ref.target("p1"))],
      ),
      mode(
        "Un joueur regarde X cartes, puis pioche une carte",
        [target.player("p2")],
        [fx.scry(amount.x, ref.target("p2")), fx.draw(1, ref.target("p2"))],
      ),
      mode(
        "Exilez une créature de valeur de mana X ou moins",
        [{ ...target.creature("c3"), maxManaValueAmount: amount.x, label: "créature de valeur de mana X ou moins" }],
        [fx.exile(ref.target("c3"))],
      ),
      mode(
        "Exilez jusqu'à X cartes de cimetières",
        [{ ...target.cardInGraveyard("g4", {}, "any"), count: 99, optional: true, countX: "upTo" }],
        [fx.exileCard(ref.target("g4"))],
      ),
    ),
  },
  "Null Elemental Blast": {
    spell: modal(
      mode(
        "Contrecarrez un sort multicolore",
        [target.spell("s", { multicolored: true }, "sort multicolore")],
        [fx.counter(ref.target("s"))],
      ),
      mode(
        "Détruisez un permanent multicolore",
        [target.permanent("p", [], { multicolored: true }, "permanent multicolore")],
        [fx.destroy(ref.target("p"))],
      ),
    ),
  },
  "Candelabra of Tawnos": {
    abilities: [
      activated({
        mana: "{X}",
        tap: true,
        targets: [{ id: "t", label: "terrain", filter: { objects: { types: ["Land"] } }, count: 99, countX: true }],
        effects: [fx.untap(ref.target())],
        label: "Dégagez X terrains ciblés",
      }),
    ],
  },
  "Null Brooch": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        discardHand: true,
        targets: [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
        effects: [fx.counter(ref.target())],
        label: "Défaussez votre main : contrecarrez le sort non-créature ciblé",
      }),
    ],
  },

  // --- Réserve : extras du jeu de proxys (hors du deck, pour les decks des joueurs) -----------------------------------
  "Eldrazi Conscription": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        {
          power: 10,
          toughness: 10,
          addKeywords: ["trample"],
          addAbilities: [
            triggered(when.attacksSelf, [fx.sacrifice(ref.defendingPlayer, { permanent: true }, 2)], {
              label: "Annihilateur 2 : le joueur défenseur sacrifie 2 permanents",
            }),
          ],
        },
        { label: "+10/+10, piétinement et annihilateur 2" },
      ),
    ],
  },
  "Foundry Inspector": {
    abilities: [costReducer({ types: ["Artifact"] }, 1, "Vos sorts d'artefact coûtent {1} de moins")],
  },
  "Palladium Myr": { abilities: [manaAbility("C", 2)] },
  "Portal to Phyrexia": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 3)], {
        label: "Chaque adversaire sacrifie trois créatures",
      }),
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { underYourControl: true, addSubtypes: ["Phyrexian"] })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")],
        label: "Une carte de créature d'un cimetière arrive sous votre contrôle ; c'est un Phyrexian en plus",
      }),
    ],
  },
  "Super State": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        { setPower: 9, setToughness: 9, addKeywords: ["flying", "firstStrike", "trample", "haste"] },
        { label: "Force et endurance de base 9/9, vol, initiative, piétinement et célérité" },
      ),
      triggered(
        { on: "dealsCombatDamage", who: { attached: "host" }, to: { players: "opponent" } },
        [fx.damage(amount.eventAmount, ref.except(ref.eachOpponent, ref.eventPlayer), ref.eventObject)],
        { label: "Elle inflige autant de blessures à chaque autre adversaire" },
      ),
    ],
  },
};
