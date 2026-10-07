/**
 * Commander : préconstruit « Multiverse Reforged » de Reality Fracture (Jace, Multiverse Architect, quatre couleurs sans
 * vert). Planeswalkers et grandes créatures remises sur le champ de bataille, jetons, monarque, contrôle.
 */
import type { CardScript, Effect, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  eventReplacement,
  fx,
  loyalty,
  manaAbility,
  playerStatic,
  protection,
  ref,
  SOLDIER,
  SPIRIT,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
  whenCycled,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };

const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  p: number,
  t: number,
  extra: Partial<TokenSpec> = {},
) => ({ name, colors, types: ["Creature"], subtypes, power: p, toughness: t, ...extra }) as TokenSpec;
const CITIZEN: TokenSpec = creature("Citizen", ["G", "W"], ["Citizen"], 1, 1);
const WARRIOR: TokenSpec = creature("Warrior", ["W"], ["Warrior"], 1, 1);
const ANGEL_4_4: TokenSpec = creature("Angel", ["W"], ["Angel"], 4, 4, { keywords: ["flying"] });
const ROGUE: TokenSpec = creature("Rogue", ["B"], ["Rogue"], 2, 2);
const KOBOLDS: TokenSpec = creature("Kobolds of Kher Keep", ["R"], ["Kobold"], 0, 1);
const SHARK: TokenSpec = creature("Shark", ["U"], ["Shark"], 0, 0, { keywords: ["flying"] });
/** Mite phyrexian 1/1 incolore, artefact, toxique 1, « ne peut pas bloquer ». */
const MITE: TokenSpec = {
  name: "Phyrexian Mite",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Phyrexian", "Mite"],
  power: 1,
  toughness: 1,
  keywords: ["cantBlock"],
  toxic: 1,
  text: "Toxic 1. This token can't block.",
};
const MYR: TokenSpec = { name: "Myr", colors: [], types: ["Artifact", "Creature"], subtypes: ["Myr"], power: 1, toughness: 1 };
/** Gingerbrute : Golem Nourriture 1/1 avec la célérité. */
const GINGERBRUTE: TokenSpec = {
  name: "Gingerbrute",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Food", "Golem"],
  power: 1,
  toughness: 1,
  keywords: ["haste"],
  abilities: [
    activated({
      mana: "{1}",
      effects: [
        fx.modify(ref.self, {
          addBlockRules: [{ cantBeBlockedBy: { not: { keyword: "haste" } }, label: "Imblocable sauf par la célérité" }],
        }),
      ],
      label: "Ne peut être bloqué ce tour-ci que par des créatures avec la célérité",
    }),
    activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Vous gagnez 3 PV" }),
  ],
  text: "Haste. {1}: This token can't be blocked this turn except by creatures with haste. {2}, {T}, Sacrifice this token: You gain 3 life.",
};
/** Incubateur (701.53) : « {2} : transformez ce jeton » ; il devient une créature-artefact Phyrexian 0/0. */
const INCUBATOR: TokenSpec = {
  name: "Incubator",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Incubator"],
  abilities: [
    activated({
      mana: "{2}",
      effects: [fx.modify(ref.self, { addTypes: ["Creature"], setSubtypes: ["Phyrexian"] }, "permanent", 0)],
      label: "Transformez-le : créature-artefact Phyrexian 0/0",
    }),
  ],
  text: "{2}: Transform this token.",
};
/** Incuber X (701.53) : un Incubateur avec X marqueurs +1/+1. */
const incubate = (x: Parameters<typeof amount.plus>[0]): Effect[] => [
  fx.createTokens(INCUBATOR, 1, undefined, "incubator"),
  fx.addCounters(ref.stored("incubator"), x),
];

/** « Les sorts de [type] coûtent {1} de moins » depuis la zone de commandement aussi (éminence : The Ur-Sphinx). */
const eminenceReduction = (subtype: string, label: string) =>
  playerStatic({ spellCost: { filter: { subtype, not: { name: "The Ur-Sphinx" } }, reduce: 1 }, fromCommand: true, label });

export const EDH_MULTIVERSE: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  "Jace, Multiverse Architect": {
    abilities: [
      triggered(
        { on: "step", step: "beginCombat", whose: "opponent" },
        fx.unlessPays(
          ref.eventPlayer,
          { mana: "{2}" },
          fx.thisTurn({ cantAttack: { of: "you", subtype: "Jace" } }, ref.eventPlayer),
        ),
        { label: "L'adversaire paie {2}, sinon ses créatures ne peuvent pas attaquer vos Jace ce tour-ci" },
      ),
      loyalty(1, {
        effects: [
          fx.draw(2),
          fx.pickFromZone(
            "hand",
            {},
            { to: "libraryBottom" },
            { count: 1, prompt: "Une carte au-dessous de votre bibliothèque" },
          ),
        ],
        label: "Piochez deux cartes, puis une carte de votre main au-dessous de votre bibliothèque",
      }),
      loyalty(-3, {
        targets: [
          target.permanent(
            "t",
            ["Planeswalker", "Creature"],
            { controller: "you", other: true },
            "autre planeswalker ou créature",
          ),
        ],
        effects: [
          fx.exile(ref.target()),
          fx.revealUntilN({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, 1, { to: "battlefield" }),
        ],
        label: "Exilez un autre de vos planeswalkers ou créatures ; un planeswalker ou une créature de votre bibliothèque arrive",
      }),
    ],
  },

  // --- Mana ---------------------------------------------------------------------------------------------------------
  "Azorius Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("W", "U")], label: "{W}{U}" })] },
  "Dimir Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("U", "B")], label: "{U}{B}" })] },
  "Izzet Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("U", "R")], label: "{U}{R}" })] },
  "Fetid Heath": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{W/B}", tap: true, effects: [fx.addManaCombination(2, ["W", "B"])], label: "{W}{W}, {W}{B} ou {B}{B}" }),
    ],
  },
  "Mystic Gate": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{W/U}", tap: true, effects: [fx.addManaCombination(2, ["W", "U"])], label: "{W}{W}, {W}{U} ou {U}{U}" }),
    ],
  },
  "Kher Keep": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{1}{R}", tap: true, effects: [fx.createTokens(KOBOLDS)], label: "Kobolds of Kher Keep 0/1" }),
    ],
  },
  "Cursed Mirror": {
    asEnters: [
      fx.chooseCopy({ types: ["Creature"] }, { anyController: true, duration: "endOfTurn", except: { addKeywords: ["haste"] } }),
    ],
    abilities: [manaAbility("R")],
  },
  "Omnath, Locus of the Void": {
    // « +1/+1 pour chaque mana inutilisé que vous avez » : force et endurance de base 6 plus ce mana.
    cdaPower: amount.plus(6, amount.manaInPool),
    cdaToughness: amount.plus(6, amount.manaInPool),
    abilities: [
      playerStatic({ keepUnspentMana: { types: [], becomes: "C" }, label: "Le mana inutilisé devient incolore" }),
      triggered(when.landfall, [fx.addMana("C", "C")], { label: "Accalmie : {C}{C}" }),
    ],
  },
  "Contaminated Landscape": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(
            { types: ["Land"], basic: true, anySubtype: ["Plains", "Island", "Swamp"] },
            { to: "battlefield", tapped: true },
          ),
        ],
        label: "Cherchez une Plaine, une Île ou un Marais de base",
      }),
    ],
  },
  "Perilous Landscape": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(
            { types: ["Land"], basic: true, anySubtype: ["Island", "Mountain", "Plains"] },
            { to: "battlefield", tapped: true },
          ),
        ],
        label: "Cherchez une Île, une Montagne ou une Plaine de base",
      }),
    ],
  },
  "Turbulent Crater": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.count({ types: ["Land"], controller: "opponent" }), 8)),
        label: "Engagé, sauf si vos adversaires contrôlent huit terrains ou plus",
      }),
    ],
  },
  "Turbulent Shore": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.count({ types: ["Land"], controller: "opponent" }), 8)),
        label: "Engagé, sauf si vos adversaires contrôlent huit terrains ou plus",
      }),
    ],
  },
  "Turbulent Wetlands": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.count({ types: ["Land"], controller: "opponent" }), 8)),
        label: "Engagé, sauf si vos adversaires contrôlent huit terrains ou plus",
      }),
    ],
  },

  // --- Créatures ----------------------------------------------------------------------------------------------------
  "Akroma, Angel of Fury": {
    cantBeCountered: true,
    abilities: [activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })],
  },
  "Archfiend of Despair": {
    abilities: [
      playerStatic({ cantGainLife: true, affects: "opponents", label: "Vos adversaires ne peuvent pas gagner de PV" }),
      triggered(
        when.eachEndStep,
        fx.forEachPlayer(ref.eachOpponent, (p) => [
          fx.loseLife({ kind: "turnEvents", query: { event: "lifeLoss", sum: true }, of: p }, p),
        ]),
        { label: "Chaque adversaire perd autant de PV qu'il en a perdu ce tour-ci" },
      ),
    ],
  },
  "Archon of Cruelty": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.sacrifice(ref.target(), { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }),
            fx.discard(1, ref.target()),
            fx.loseLife(3, ref.target()),
            fx.draw(1),
            fx.gainLife(3),
          ],
          {
            targets: [target.player("t", "opponent")],
            label: "L'adversaire sacrifie une créature ou un planeswalker, défausse, perd 3 PV ; vous piochez et gagnez 3 PV",
          },
        ),
      ),
    ],
  },
  "Avacyn, Angel of Horror": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false }),
        [fx.delayed([fx.toBattlefield(ref.target("c"), { underYourControl: true })], { c: ref.eventObject })],
        { label: "Une de vos créatures non-jetons meurt : elle revient au début de la prochaine étape de fin" },
      ),
    ],
  },
  "Dack Fayden, Helping Hand": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.revealUntilN({ types: ["Creature"] }, amount.refCount(ref.eachOpponent), { to: "battlefield" }, "dack"),
          fx.goad(ref.stored("dack"), "permanent"),
          ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [fx.giveControl(ref.nth(ref.stored("dack"), n), p)]),
        ],
        { label: "Une créature par adversaire arrive, provoquée, et chaque adversaire en prend une" },
      ),
    ],
  },
  "Darksteel Angel": {
    abilities: [
      playerStatic({ cantLose: true, label: "Vous ne pouvez pas perdre et vos adversaires ne peuvent pas gagner" }),
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "-1/-1",
        modify: { prevent: true },
        label: "Vos créatures ne peuvent pas recevoir de marqueurs -1/-1",
      }),
    ],
  },
  "Ginger, Queen of Sweets": {
    abilities: [
      triggered(when.entersSelf, [fx.becomeMonarch()], { label: "Vous devenez le monarque" }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(6)], label: "Sacrifiez-la : vous gagnez 6 PV" }),
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.createTokens(GINGERBRUTE)], {
        condition: cond.monarch,
        label: "Vous êtes le monarque : un Gingerbrute",
      }),
    ],
  },
  "Jhoira, Weatherlight Corsair": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.revealUntilN(
              { permanent: true, anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] },
              1,
              { to: "battlefield", underYourControl: true },
              "jhoira",
              ref.target(),
            ),
            fx.loseLife(amount.greatestManaValueOf(ref.stored("jhoira"))),
          ],
          {
            targets: [target.player("t", "opponent")],
            label:
              "L'adversaire révèle jusqu'à un permanent historique : il arrive sous votre contrôle ; vous perdez sa valeur de mana",
          },
        ),
      ),
    ],
  },
  "Memnarch, the Warden": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MYR, 2)], { label: "Deux Myr 1/1" }),
      triggered(when.attacksSelf, [fx.draw(amount.count({ types: ["Artifact"], controller: "you" }))], {
        label: "Piochez une carte par artefact que vous contrôlez",
      }),
    ],
  },
  "Nissa, Leyline Tamer": {
    abilities: [
      triggered(
        when.landfall,
        [
          fx.draw(1),
          fx.countResolution("nissa"),
          ...fx.when(cond.not(cond.v("nissa", 2)), fx.revealUntilN({ types: ["Creature"] }, 1, { to: "battlefield" })),
        ],
        { label: "Accalmie : piochez ; la première fois ce tour-ci, une créature de votre bibliothèque arrive" },
      ),
    ],
  },
  "Niv-Mizzet, Ghost Counsel": {
    abilities: [
      triggered(
        when.gainLife,
        fx.mayPayLife(amount.eventAmount, "Payer autant de PV pour piocher autant de cartes ?", fx.draw(amount.eventAmount)),
        { label: "Vous gagnez des PV : vous pouvez payer autant de PV et piocher autant" },
      ),
      activated({ tap: true, effects: [fx.loseLife(1, ref.eachOpponent), fx.gainLife(1)], label: "Chaque adversaire perd 1 PV" }),
    ],
  },
  "Ob Nixilis, the Ascended": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.destroyAll({ types: ["Creature"], controller: "opponent", tapped: true }, "obd"), fx.gainLife(amount.v("obd"))],
        { label: "Détruisez les créatures engagées de vos adversaires ; 1 PV par créature détruite" },
      ),
      triggered(when.eachEndStep, [fx.createTokens(ANGEL_4_4)], {
        condition: cond.lifeGainedAtLeast(1),
        label: "Vous avez gagné des PV ce tour-ci : un Ange 4/4 volant",
      }),
    ],
  },
  "Serra's Emissary": {
    // Le type de carte est choisi comme un mode d'arrivée (comme Arachne, Psionic Weaver).
    asEnters: [
      fx.chooseForSelf("mode", {
        options: ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle", "Kindred"],
      }),
    ],
    abilities: [
      staticAbility(
        CREATURE_YOU,
        { addProtections: [protection.from({ typeChosen: true }, "Protection contre le type choisi")] },
        {
          label: "Vos créatures ont la protection contre le type choisi",
        },
      ),
      playerStatic({ protection: { typeChosen: true }, label: "Vous avez la protection contre le type choisi" }),
    ],
  },
  "Tamiyo, Upriser Crowned": {
    abilities: [
      triggered(when.entersSelf, [fx.becomeMonarch()], { label: "Vous devenez le monarque" }),
      triggered(
        when.combatDamageBatch({ types: ["Creature"] }, true),
        [fx.tap(ref.eventObjects), fx.counters(ref.eventObjects, "stun", 1)],
        {
          triggerCondition: cond.monarch,
          label: "Des créatures vous blessent alors que vous êtes le monarque : engagées, un marqueur d'étourdissement",
        },
      ),
    ],
  },
  "The Ur-Sphinx": {
    abilities: [
      eminenceReduction("Sphinx", "Éminence — vos autres sorts de Sphinx coûtent {1} de moins"),
      triggered(
        when.attackWith(1, { subtype: "Sphinx", controller: "you" }),
        fx.forEachPlayer(ref.eachPlayer, (p, n) => [
          fx.mill(amount.eventAmount, p, { name: `sphinx${n}` }),
          fx.castNow(ref.stored(`sphinx${n}`), { free: true }),
        ]),
        { label: "Chaque joueur meule autant de cartes ; une carte meulée par joueur, lancée gratuitement" },
      ),
    ],
  },
  "Venser, Fervent Forger": {
    abilities: [
      triggeredModal(when.entersSelf, [
        {
          label: "Copiez deux fois un éphémère ou un rituel adverse",
          targets: [target.spell("s", { types: ["Instant", "Sorcery"], controller: "opponent" }, "éphémère ou rituel adverse")],
          effects: [fx.copySpell(ref.target("s"), 2)],
        },
        {
          label: "Deux jetons copies d'un permanent adverse, avec la célérité, sacrifiés à l'étape de fin",
          targets: [{ id: "p", label: "permanent adverse", filter: { objects: { permanent: true, controller: "opponent" } } }],
          effects: [fx.copyToken(ref.target("p"), { count: 2, addKeywords: ["haste"], sacrificeAtEndStep: true })],
        },
      ]),
    ],
  },

  // --- Artefacts et enchantements -----------------------------------------------------------------------------------
  "Currency Converter": {
    abilities: [
      triggered(
        when.discard("you"),
        fx.may("Exiler la carte défaussée ?", fx.exileCard(ref.eventObject, { name: "cc" }), fx.link(ref.stored("cc"))),
        {
          label: "Vous défaussez : vous pouvez exiler cette carte",
        },
      ),
      activated({ mana: "{2}", tap: true, effects: [fx.draw(1), fx.discard(1)], label: "Piochez, puis défaussez" }),
      activated({
        tap: true,
        effects: [
          fx.pickFromZone("graveyard", {}, { to: "graveyard" }, { pool: ref.linked, count: 1, store: "cc" }),
          ...fx.when(cond.refMatches(ref.stored("cc"), { types: ["Land"] }), fx.createTokens(TREASURE)),
          ...fx.when(cond.refMatches(ref.stored("cc"), { notTypes: ["Land"] }), fx.createTokens(ROGUE)),
        ],
        label: "Une carte exilée au cimetière : terrain, un Trésor ; sinon, un Voleur 2/2",
      }),
    ],
  },
  "Dreadhorde Invasion": {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.amass(ref.you, "Zombie", 1)], {
        label: "Perdez 1 PV et amassez des Zombies 1",
      }),
      triggered(
        when.attacks({ subtype: "Zombie", token: true, controller: "you", minPower: 6 }),
        [fx.pump(ref.eventObject, 0, 0, ["lifelink"])],
        {
          label: "Un jeton Zombie de force 6 ou plus attaque : lien de vie",
        },
      ),
    ],
  },
  "Proteus Staff": {
    abilities: [
      activated({
        mana: "{2}{U}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [
          fx.moveTo(ref.target(), { to: "libraryBottom" }),
          fx.revealUntilN({ types: ["Creature"] }, 1, { to: "battlefield" }, undefined, ref.controllerOf(ref.target())),
        ],
        label: "La créature au-dessous de la bibliothèque ; son contrôleur révèle jusqu'à une créature et la met en jeu",
      }),
    ],
  },
  "Shark Typhoon": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [{ ...fx.createTokens(SHARK), pt: amount.manaValueOf(ref.eventObject) } as Effect],
        {
          label: "Sort non-créature : un Requin X/X volant",
        },
      ),
      whenCycled([{ ...fx.createTokens(SHARK), pt: amount.eventAmount } as Effect], { label: "Cyclée : un Requin X/X volant" }),
    ],
  },
  "Skrelv's Hive": {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(MITE)], { label: "Perdez 1 PV ; un Mite phyrexian" }),
      staticAbility(
        { ...CREATURE_YOU, keyword: "toxic" },
        { addKeywords: ["lifelink"] },
        {
          condition: cond.amountAtLeast(amount.maxOverPlayers(ref.eachOpponent, amount.poison), 3),
          label: "Corrompu : vos créatures avec la toxicité ont le lien de vie",
        },
      ),
    ],
  },
  "Staff of the Storyteller": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SPIRIT)], { label: "Un Esprit 1/1 volant" }),
      triggered(when.enters({ types: ["Creature"], token: true, controller: "you" }), [fx.counters(ref.self, "story", 1)], {
        batched: true,
        label: "Vous créez des jetons de créature : un marqueur d'histoire",
      }),
      activated({
        mana: "{W}",
        tap: true,
        removeCounters: { kind: "story", n: 1 },
        effects: [fx.draw(1)],
        label: "Retirez un marqueur d'histoire : piochez",
      }),
    ],
  },
  "Whirlwind of Thought": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.draw(1)], { label: "Sort non-créature : piochez" }),
    ],
  },

  // --- Sorts ----------------------------------------------------------------------------------------------------------
  Brainsurge: {
    spell: spell(
      [],
      [
        fx.draw(4),
        fx.pickFromZone("hand", {}, { to: "libraryTop" }, { count: 2, prompt: "Deux cartes au-dessus de votre bibliothèque" }),
      ],
    ),
  },
  Despark: {
    spell: spell(
      [{ id: "t", label: "permanent de valeur de mana 4 ou plus", filter: { objects: { permanent: true, minManaValue: 4 } } }],
      [fx.exile(ref.target())],
    ),
  },
  "Fact or Fiction": { spell: spell([], [fx.piles(5, { revealed: true, opponentSeparates: true })]) },
  "Grand Crescendo": {
    spell: spell([], [fx.createTokens(CITIZEN, amount.x), fx.pumpAll(CREATURE_YOU, 0, 0, ["indestructible"])]),
  },
  "Lingering Souls": { spell: spell([], [fx.createTokens(SPIRIT, 2)]) },
  "Martial Coup": {
    spell: spell(
      [],
      [
        fx.createTokens(SOLDIER, amount.x, undefined, "coup"),
        ...fx.when(
          cond.xAtLeast(5),
          fx.destroy(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.stored("coup"))),
        ),
      ],
    ),
  },
  "White Sun's Twilight": {
    spell: spell(
      [],
      [
        fx.gainLife(amount.x),
        fx.createTokens(MITE, amount.x, undefined, "twilight"),
        ...fx.when(
          cond.xAtLeast(5),
          fx.destroy(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.stored("twilight"))),
        ),
      ],
    ),
  },
  "Mass Polymorph": {
    spell: spell(
      [],
      [
        fx.exileCard(ref.permanentsOf(ref.you, { types: ["Creature"] }), { name: "poly" }),
        fx.revealUntilN({ types: ["Creature"] }, amount.refCount(ref.stored("poly")), { to: "battlefield" }),
      ],
    ),
  },
  "Synthetic Destiny": {
    spell: spell(
      [],
      [
        fx.exileCard(ref.permanentsOf(ref.you, { types: ["Creature"] }), { name: "synth" }),
        fx.delayed([fx.revealUntilN({ types: ["Creature"] }, amount.v("n"), { to: "battlefield" })], undefined, {
          n: amount.refCount(ref.stored("synth")),
        }),
      ],
    ),
  },
  "Occult Epiphany": {
    spell: spell(
      [],
      [
        fx.draw(amount.x),
        fx.discard(amount.x, ref.you, { store: "occult" }),
        fx.createTokens(SPIRIT, { kind: "aggregate", fn: "distinct", property: "cardType", of: ref.stored("occult") } as never),
      ],
    ),
  },
  "Secure the Wastes": { spell: spell([], [fx.createTokens(WARRIOR, amount.x)]) },
  Sunfall: {
    spell: spell(
      [],
      [
        fx.exileCard(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), { name: "sunfall" }),
        ...incubate(amount.refCount(ref.stored("sunfall"))),
      ],
    ),
  },
  "Teferi's Reproach": {
    exileOnResolve: true,
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.untilTheirNextTurn({ protection: "everything" }, ref.target()),
        ...(["lifeGain", "lifeLoss"] as const).map((event) =>
          fx.untilTheirNextTurn({ replacement: { event, to: "you", modify: { prevent: true } } }, ref.target()),
        ),
        fx.phaseOut(ref.permanentsOf(ref.target(), { notTypes: ["Land"] })),
      ],
    ),
  },
  "Elspeth, Sun's Champion": {
    abilities: [
      loyalty(1, { effects: [fx.createTokens(SOLDIER, 3)], label: "Trois Soldats 1/1" }),
      loyalty(-3, {
        effects: [fx.destroyAll({ types: ["Creature"], minPower: 4 })],
        label: "Détruisez les créatures de force 4 ou plus",
      }),
      loyalty(-7, {
        effects: [
          fx.emblem("Emblème d'Elspeth", "Les créatures que vous contrôlez gagnent +2/+2 et ont le vol.", [
            staticAbility(CREATURE_YOU, { power: 2, toughness: 2, addKeywords: ["flying"] }, { label: "+2/+2 et le vol" }),
          ]),
        ],
        label: "Emblème : vos créatures +2/+2 et le vol",
      }),
    ],
  },
};
