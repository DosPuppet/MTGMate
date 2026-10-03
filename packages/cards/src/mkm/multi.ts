/** Murders at Karlov Manor — cartes multicolores. */
import type { ManaRestriction, ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import { BASIC_LAND_TYPES } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  costReducer,
  DETECTIVE,
  DOG,
  entersWith,
  eventReplacement,
  fx,
  IMP,
  INSTANT_SORCERY,
  investigate,
  loyalty,
  manaAbility,
  modal,
  mode,
  protection,
  protectionAbility,
  ref,
  SPIDER_BG,
  SPIRIT_WB,
  SUSPECTED,
  spell,
  staticAbility,
  THOPTER,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };

/** Niv-Mizzet, Guildpact : paires de couleurs différentes parmi vos permanents exactement bicolores. */
const NIV_X = amount.colorPairsAmong({ permanent: true, controller: "you" });

/** Tin Street Gossip : « dépensez ce mana seulement pour lancer des sorts face cachée ou retourner des créatures face visible ». */
const FACE_DOWN_MANA: ManaRestriction = { spell: { faceDown: true }, abilityOfCreature: { faceDown: true } };

/** Voja Fenstalker : Loup légendaire 5/5 vert et blanc avec le piétinement (Tolsimir, Midnight's Light). */
const VOJA_FENSTALKER: TokenSpec = {
  name: "Voja Fenstalker",
  colors: ["G", "W"],
  types: ["Creature"],
  subtypes: ["Wolf"],
  legendary: true,
  power: 5,
  toughness: 5,
  keywords: ["trample"],
};
const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

/** Plante : créature verte 0/1 (Insidious Roots). */
const PLANT: TokenSpec = { name: "Plant", colors: ["G"], types: ["Creature"], subtypes: ["Plant"], power: 0, toughness: 1 };

/** « Chaque fois qu'un Indice que vous contrôlez est mis dans un cimetière depuis le champ de bataille » (Teysa). */
const CLUE_TO_GRAVEYARD: TriggerSpec = { on: "leaves", who: { subtype: "Clue", controller: "you" }, to: "graveyard" };

/** « Choisissez jusqu'à une créature ciblée. Si elle est suspecte, exilez-la. Sinon, suspectez-la. » (Agrus Kos) */
const agrusKos = (trigger: TriggerSpec) =>
  triggered(
    trigger,
    [
      ...fx.when(cond.refMatches(ref.target(), { suspected: true }), fx.exile(ref.target())),
      ...fx.when(cond.refMatches(ref.target(), { suspected: false }), fx.suspect(ref.target())),
    ],
    { targets: [target.upTo(1, target.creature())], label: "Exilez la créature suspecte, sinon suspectez-la" },
  );

/** Ezrim : « [effets] {1}, sacrifiez un artefact : Ezrim gagne au choix … » (une capacité par choix). */
const ezrimBoost = (kw: "vigilance" | "lifelink" | "hexproof", label: string) =>
  activated({
    mana: "{1}",
    sacrificeOther: { filter: { types: ["Artifact"], controller: "you" } },
    effects: [fx.modify(ref.self, { addKeywords: [kw] })],
    label: `Ezrim gagne ${label} jusqu'à la fin du tour`,
  });

/** Trostani : « [coût] : la créature ciblée gagne [mot-clé] jusqu'à la fin du tour ». */
const trostaniGrant = (mana: string, kw: "deathtouch" | "vigilance" | "doubleStrike", label: string) =>
  activated({
    mana,
    targets: [target.creature()],
    effects: [fx.modify(ref.target(), { addKeywords: [kw] })],
    label: `La créature ciblée gagne ${label}`,
  });

/** « La créature ciblée gagne l'indestructible jusqu'à la fin du tour » (Rakish Scoundrel). */
const indestructibleUntilEot = (trigger: TriggerSpec) =>
  triggered(trigger, [fx.modify(ref.target(), { addKeywords: ["indestructible"] })], {
    targets: [target.creature()],
    label: "La créature ciblée gagne l'indestructible",
  });

/** Gadget Technician : « crée un jeton Thopter » en arrivant ou retourné face visible. */
const thopterOn = (trigger: TriggerSpec) => triggered(trigger, [fx.createTokens(THOPTER)], { label: "Jeton Thopter" });

/** Relive the Past : la carte ciblée revient sur le champ de bataille et devient une créature Élémental 5/5. */
const reliveAs5_5 = (id: string) => [
  fx.moveTo(ref.target(id), { to: "battlefield" }, { name: id }),
  fx.modify(ref.stored(id), { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 5, setToughness: 5 }, "permanent"),
];

const DESTROY_CREATURE = target.creature("d");
const SUSPECT_YOU = target.creature("s", { controller: "you", suspected: true });
const complicationCounter = [
  fx.addCounters(ref.target("s"), 1),
  ...fx.may("Elle n'est plus suspecte ?", fx.suspect(ref.target("s"), false)),
];

export const MULTI: Record<string, CardScript> = {
  // --- Azorius (blanc et bleu) -----------------------------------------------
  // Vigilance lue dans le texte.
  "Alquist Proft, Master Sleuth": {
    abilities: [
      triggered(when.entersSelf, [investigate()], { label: "Enquêtez" }),
      activated({
        mana: "{X}{W}{U}{U}",
        tap: true,
        sacrificeOther: { filter: { subtype: "Clue", controller: "you" } },
        effects: [fx.draw(amount.x), fx.gainLife(amount.x)],
        label: "Piochez X cartes et gagnez X PV",
      }),
    ],
  },
  // Vol lu dans le texte.
  "Ezrim, Agency Chief": {
    // « Au choix » : une capacité par mot-clé (le choix se fait à l'activation, comme Hungering Puppetbeast).
    abilities: [
      triggered(when.entersSelf, [investigate(2)], { label: "Enquêtez deux fois" }),
      ezrimBoost("vigilance", "la vigilance"),
      ezrimBoost("lifelink", "le lien de vie"),
      ezrimBoost("hexproof", "la défense talismanique"),
    ],
  },
  // Vol, vigilance et déguisement lus dans le texte.
  "Granite Witness": {
    abilities: [
      triggeredModal(
        when.turnedFaceUp,
        [
          mode("Engagez la créature ciblée", [target.creature()], [fx.tap(ref.target())]),
          mode("Dégagez la créature ciblée", [target.creature()], [fx.untap(ref.target())]),
          mode("Ne rien faire", [], []),
        ],
        { label: "Retournée face visible : engagez ou dégagez une créature" },
      ),
    ],
  },
  "Private Eye": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Detective", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Les autres Détectives que vous contrôlez gagnent +1/+1",
        },
      ),
      triggered(when.draw(2), [fx.modify(ref.target(), { addKeywords: ["unblockable"] })], {
        targets: [target.creature("t", { subtype: "Detective" })],
        label: "Deuxième carte piochée : le Détective ciblé ne peut pas être bloqué",
      }),
    ],
  },

  // --- Dimir (bleu et noir) ----------------------------------------------------
  "Coerced to Kill": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    controlsEnchanted: true,
    abilities: [
      staticAbility(
        "attached",
        { setPower: 1, setToughness: 1, addKeywords: ["deathtouch"], addSubtypes: ["Assassin"] },
        { label: "1/1 de base, contact mortel, Assassin" },
      ),
    ],
  },
  // Vol lu dans le texte.
  "Curious Cadaver": {
    abilities: [
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.toHand(ref.selfCard)], {
        fromGraveyard: true,
        label: "Indice sacrifié : renvoyez cette carte de votre cimetière dans votre main",
      }),
    ],
  },
  "Drag the Canal": {
    spell: spell([], [fx.createTokens(DETECTIVE), ...fx.when(cond.morbid, fx.gainLife(2), fx.surveil(2), investigate())]),
  },
  // Vol et déguisement lus dans le texte.
  "Faerie Snoop": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.lookAtTop(2, { count: 1, exact: true, rest: "graveyard" })], {
        label: "Retournée face visible : une des deux cartes du dessus en main, l'autre au cimetière",
      }),
    ],
  },

  // --- Rakdos (noir et rouge) --------------------------------------------------
  "Blood Spatter Analysis": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "3 blessures à une créature adverse",
      }),
      triggered(
        when.dies({ types: ["Creature"] }),
        [
          fx.mill(1),
          fx.counters(ref.self, "bloodstain", 1),
          ...fx.when(
            cond.counterAtLeast("bloodstain", 5),
            fx.sacrificeIt(ref.self),
            fx.reflexive(
              [target.cardInGraveyard("g", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
              [fx.toHand(ref.target("g"))],
            ),
          ),
        ],
        { batched: true, label: "Meulez une carte, marqueur de sang ; à cinq, sacrifiez-le et récupérez une créature" },
      ),
    ],
  },
  "Deadly Complication": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode("Détruisez une créature", [DESTROY_CREATURE], [fx.destroy(ref.target("d"))]),
      mode("Marqueur +1/+1 sur votre créature suspecte", [SUSPECT_YOU], complicationCounter),
      mode("Les deux", [DESTROY_CREATURE, SUSPECT_YOU], [fx.destroy(ref.target("d")), ...complicationCounter]),
    ),
  },
  // Vol et piétinement lus dans le texte.
  "Rakdos, Patron of Chaos": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          ...fx.mayFor(
            ref.target(),
            "Sacrifier deux permanents non-terrain qui ne sont pas des jetons (sinon, l'adversaire pioche deux cartes) ?",
            fx.sacrifice(ref.target(), { nonland: true, nontoken: true }, 2, { store: "sac" }),
          ),
          // « S'il ne le fait pas » : deux permanents n'ont pas été sacrifiés.
          ...fx.when(cond.not(cond.amountAtLeast(amount.refCount(ref.stored("sac")), 2)), fx.draw(2)),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "L'adversaire ciblé sacrifie deux permanents, sinon piochez deux cartes",
        },
      ),
    ],
  },
  "Rune-Brand Juggler": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Suspectez une créature que vous contrôlez",
      }),
      activated({
        mana: "{3}{B}{R}",
        sacrificeOther: { filter: SUSPECTED },
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -5, -5)],
        label: "La créature ciblée gagne -5/-5",
      }),
    ],
  },
  // Déguisement lu dans le texte.
  "Shady Informant": {
    abilities: [triggered(when.diesSelf, [fx.damage(2, ref.target())], { targets: [target.any()], label: "2 blessures" })],
  },

  // --- Gruul (rouge et vert) ---------------------------------------------------
  "Anzrag, the Quake-Mole": {
    abilities: [
      triggered(
        when.becomesBlocked({ self: true }),
        [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombat],
        { label: "Bloquée : dégagez vos créatures, combat supplémentaire" },
      ),
      activated({
        mana: "{3}{R}{R}{G}{G}",
        effects: [fx.modify(ref.self, { addKeywords: ["mustBeBlocked"] })],
        label: "Doit être bloquée ce tour-ci si possible",
      }),
    ],
  },
  "Break Out": {
    // La carte de créature révélée est d'abord remise sur le dessus (le reste va dessous dans un ordre aléatoire), puis
    // mise sur le champ de bataille si sa valeur de mana est 2 ou moins et que vous le voulez, sinon dans votre main.
    spell: spell(
      [],
      [
        fx.lookAtTop(6, { filter: { types: ["Creature"] }, count: 1, to: { to: "libraryTop" }, store: "c" }),
        ...fx.when(
          cond.refMatches(ref.stored("c"), { maxManaValue: 2 }),
          fx.may(
            "Mettre cette créature sur le champ de bataille (avec la célérité) ?",
            fx.moveTo(ref.stored("c"), { to: "battlefield" }, { name: "b" }),
            fx.modify(ref.stored("b"), { addKeywords: ["haste"] }),
          ),
        ),
        fx.toHand(ref.filtered(ref.stored("c"), {})),
      ],
    ),
  },
  "Worldsoul's Rage": {
    spell: spell(
      [target.any()],
      [
        fx.damage(amount.x, ref.target()),
        // Jusqu'à X cartes de terrain au total : d'abord de la main, puis du cimetière pour le reste.
        fx.pickFromZone(
          "hand",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          { count: amount.x, min: 0, store: "h", prompt: "Cartes de terrain de votre main à mettre sur le champ de bataille" },
        ),
        fx.pickFromZone(
          "graveyard",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          {
            count: amount.plus(amount.x, amount.neg(amount.refCount(ref.stored("h")))),
            min: 0,
            prompt: "Cartes de terrain de votre cimetière à mettre sur le champ de bataille",
          },
        ),
      ],
    ),
  },
  // Portée et déguisement lus dans le texte.
  "Riftburst Hellion": {},

  // --- Selesnya (vert et blanc) ------------------------------------------------
  "Crowd-Control Warden": {
    // « En arrivant ou en étant retournée face visible » : à l'arrivée, un remplacement ; retournée face visible, une
    // capacité déclenchée (approximation : les marqueurs arrivent à la résolution).
    abilities: [
      entersWith({
        counters: amount.count({ types: ["Creature"], controller: "you", other: true }),
        label: "Arrive avec un marqueur +1/+1 par autre créature",
      }),
      triggered(when.turnedFaceUp, [fx.addCounters(ref.self, amount.count({ ...CREATURES_YOU, other: true }))], {
        label: "Retournée face visible : un marqueur +1/+1 par autre créature",
      }),
    ],
  },
  "Relive the Past": {
    spell: spell(
      [
        target.upTo(1, target.cardInGraveyard("a", { types: ["Artifact"] }, "you", "carte d'artefact de votre cimetière")),
        target.upTo(1, target.cardInGraveyard("l", { types: ["Land"] }, "you", "carte de terrain de votre cimetière")),
        target.upTo(
          1,
          target.cardInGraveyard(
            "e",
            { types: ["Enchantment"], notSubtype: "Aura" },
            "you",
            "carte d'enchantement non-Aura de votre cimetière",
          ),
        ),
      ],
      [...reliveAs5_5("a"), ...reliveAs5_5("l"), ...reliveAs5_5("e")],
    ),
  },
  // Portée lue dans le texte.
  "Sumala Sentry": {
    abilities: [
      triggered(
        when.permanentTurnedFaceUp({ controller: "you" }),
        [fx.addCounters(ref.eventObject, 1), fx.addCounters(ref.self, 1)],
        { label: "Permanent retourné face visible : un marqueur +1/+1 sur lui et sur cette créature" },
      ),
    ],
  },
  "Trostani, Three Whispers": {
    abilities: [
      trostaniGrant("{1}{G}", "deathtouch", "le contact mortel"),
      trostaniGrant("{G/W}", "vigilance", "la vigilance"),
      trostaniGrant("{2}{W}", "doubleStrike", "la double initiative"),
    ],
  },

  // --- Orzhov (blanc et noir) --------------------------------------------------
  // Vol, lien de vie et déguisement lus dans le texte.
  "Sanguine Savior": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.modify(ref.target(), { addKeywords: ["lifelink"] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Retournée face visible : une autre créature que vous contrôlez gagne le lien de vie",
      }),
    ],
  },
  "Soul Search": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { chooser: "controller", filter: { nonland: true }, exile: true, store: "e" }),
        ...fx.when(cond.refMatches(ref.stored("e"), { maxManaValue: 1 }), fx.createTokens(SPIRIT_WB)),
      ],
    ),
  },
  // Contact mortel lu dans le texte.
  "Teysa, Opulent Oligarch": {
    abilities: [
      triggered(when.yourEndStep, [investigate(amount.opponentsLostLife)], {
        label: "Enquêtez pour chaque adversaire qui a perdu des PV ce tour-ci",
      }),
      triggered(CLUE_TO_GRAVEYARD, [fx.createTokens(SPIRIT_WB)], {
        oncePerTurn: true,
        label: "Un Indice va au cimetière : jeton Esprit (une fois par tour)",
      }),
    ],
  },
  // Vol lu dans le texte.
  "Wispdrinker Vampire": {
    abilities: [
      triggered(when.enters({ ...CREATURES_YOU, other: true, maxPower: 2 }), fx.drain(1), {
        label: "Chaque adversaire perd 1 PV et vous gagnez 1 PV",
      }),
      activated({
        mana: "{5}{W}{B}",
        effects: [fx.modifyAll({ ...CREATURES_YOU, maxPower: 2 }, { addKeywords: ["deathtouch", "lifelink"] })],
        label: "Vos créatures de force 2 ou moins gagnent le contact mortel et le lien de vie",
      }),
    ],
  },

  // --- Izzet (bleu et rouge) ---------------------------------------------------
  "Detective's Satchel": {
    abilities: [
      triggered(when.entersSelf, [investigate(2)], { label: "Enquêtez deux fois" }),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.turnEvents({ event: "sacrifice", who: "you", types: ["Artifact"] }), 1),
        effects: [fx.createTokens(THOPTER)],
        label: "Jeton Thopter (si vous avez sacrifié un artefact ce tour-ci)",
      }),
    ],
  },
  // Déguisement lu dans le texte.
  "Gadget Technician": { abilities: [thopterOn(when.entersSelf), thopterOn(when.turnedFaceUp)] },
  // Vol lu dans le texte.
  "Gleaming Geardrake": {
    abilities: [
      triggered(when.entersSelf, [investigate()], { label: "Enquêtez" }),
      triggered(when.sacrifice({ types: ["Artifact"] }), [fx.addCounters(ref.self, 1)], {
        label: "Artefact sacrifié : marqueur +1/+1",
      }),
    ],
  },

  // --- Golgari (noir et vert) --------------------------------------------------
  "Assassin's Trophy": {
    spell: spell(
      [{ id: "t", label: "permanent adverse", filter: { objects: { controller: "opponent" } } }],
      [fx.destroy(ref.target()), fx.search(BASIC_LAND, { to: "battlefield" }, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Insidious Roots": {
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, controller: "you" },
        { addAbilities: [manaAbility([...ALL_COLORS])] },
        { label: "Vos jetons de créature ont « {T} : ajoutez un mana de n'importe quelle couleur »" },
      ),
      triggered(
        when.zoneChange(["graveyard"], { whose: "you", filter: { types: ["Creature"] } }),
        [fx.createTokens(PLANT), fx.addCountersAll({ subtype: "Plant", controller: "you" }, 1)],
        { batched: true, label: "Jeton Plante, puis un marqueur +1/+1 sur chaque Plante" },
      ),
    ],
  },
  // Portée lue dans le texte.
  "Kraul Whipcracker": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [{ id: "t", label: "jeton adverse", filter: { objects: { token: true, controller: "opponent" } } }],
        label: "Détruisez un jeton adverse",
      }),
    ],
  },
  // Contact mortel et déguisement lus dans le texte.
  "Rakish Scoundrel": { abilities: [indestructibleUntilEot(when.entersSelf), indestructibleUntilEot(when.turnedFaceUp)] },

  // --- Boros (rouge et blanc) --------------------------------------------------
  // Double initiative et vigilance lues dans le texte.
  "Agrus Kos, Spirit of Justice": { abilities: [agrusKos(when.entersSelf), agrusKos(when.attacksSelf)] },
  // Vigilance et déguisement lus dans le texte.
  "Dog Walker": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.createTappedTokens(DOG, 2)], { label: "Retournée face visible : deux Chiens engagés" }),
    ],
  },
  "Lightning Helix": { spell: spell([target.any()], [fx.damage(3, ref.target()), fx.gainLife(3)]) },
  // Célérité lue dans le texte.
  "Meddling Youths": {
    abilities: [triggered(when.attackWith(3), [investigate()], { label: "Attaque avec trois créatures ou plus : enquêtez" })],
  },

  // --- Simic (vert et bleu) ----------------------------------------------------
  Doppelgang: {
    spell: spell(
      [{ id: "t", label: "permanent", filter: { objects: { permanent: true } }, count: 99, countX: true }],
      [fx.copyToken(ref.target(), { count: amount.x })],
    ),
  },
  // Vol et vigilance lus dans le texte.
  "Kellan, Inquisitive Prodigy": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // « Si vous contrôliez ce permanent » : vu avant la destruction.
          ...fx.when(cond.refMatches(ref.target(), { controller: "you" }), fx.destroy(ref.target()), fx.draw(1)),
          ...fx.when(cond.refMatches(ref.target(), { controller: "opponent" }), fx.destroy(ref.target())),
        ],
        {
          targets: [target.upTo(1, target.permanent("t", ["Artifact"], {}, "artefact"))],
          label: "Détruisez un artefact ; si c'était le vôtre, piochez une carte",
        },
      ),
    ],
  },
  "Tail the Suspect": { spell: spell([], [investigate(), fx.extraLandThisTurn]) },
  "Repulsive Mutation": {
    spell: spell(
      [target.creature("c", { controller: "you" }), target.upTo(1, target.spell("s"))],
      [
        fx.addCounters(ref.target("c"), amount.x),
        ...fx.unlessPays(
          ref.controllerOf(ref.target("s")),
          { genericAmount: amount.maxPower(CREATURES_YOU) },
          fx.counter(ref.target("s")),
        ),
      ],
    ),
  },
  // Déguisement lu dans le texte.
  "Undercover Crocodelf": {
    abilities: [triggered(when.combatDamageToPlayer, [investigate()], { label: "Blessures de combat à un joueur : enquêtez" })],
  },

  // --- Cinq couleurs -----------------------------------------------------------
  "Leyline of the Guildpact": {
    leyline: true,
    abilities: [
      staticAbility(
        { nonland: true, controller: "you" },
        { setColors: [...ALL_COLORS] },
        {
          label: "Vos permanents non-terrains sont de toutes les couleurs",
        },
      ),
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addSubtypes: [...BASIC_LAND_TYPES] },
        { label: "Vos terrains ont tous les types de terrain de base" },
      ),
    ],
  },

  // --- Cartes scindées -----------------------------------------------------------
  Cease: {
    spell: spell(
      [
        { ...target.upTo(2, target.cardInGraveyard("c", {}, "any", "carte d'un cimetière")), samePlayer: true },
        target.player("p"),
      ],
      [fx.exileCard(ref.target("c")), fx.gainLife(2, ref.target("p")), fx.draw(1, ref.target("p"))],
    ),
  },
  Desist: { spell: spell([], [fx.destroyAll({ types: ["Artifact", "Enchantment"] })]) },
  Fuss: { spell: spell([], [fx.addCountersAll({ ...CREATURES_YOU, attacking: true }, 1)]) },
  Bother: { spell: spell([], [fx.createTokens(THOPTER, 3), fx.surveil(2)]) },
  Push: { spell: spell([target.creature("t", { tapped: true })], [fx.destroy(ref.target())]) },
  Pull: {
    spell: spell(
      [
        {
          ...target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière")),
          samePlayer: true,
        },
      ],
      [
        fx.moveTo(ref.target(), { to: "battlefield", underYourControl: true }, { name: "p" }),
        fx.modify(ref.stored("p"), { addKeywords: ["haste"] }),
        fx.delayed([fx.sacrificeIt(ref.target("p"))], { p: ref.stored("p") }),
      ],
    ),
  },
  "Evidence Examiner": {
    abilities: [
      triggered(when.yourCombat, fx.mayCollectEvidence(4, {}), { label: "Vous pouvez réunir des preuves 4" }),
      triggered(when.collectEvidence, [investigate()], { label: "Vous réunissez des preuves : enquêtez" }),
    ],
  },
  "Izoni, Center of the Web": {
    abilities: [
      ...([when.entersSelf, when.attacksSelf] as const).map((w) =>
        triggered(w, fx.mayCollectEvidence(4, {}, fx.createTokens(SPIDER_BG, 2)), {
          label: "Réunissez des preuves 4 : deux Araignées 2/1",
        }),
      ),
      activated({
        sacrificeOther: { filter: { token: true }, count: 4 },
        effects: [fx.surveil(2), fx.draw(2), fx.gainLife(2)],
        label: "Sacrifiez quatre jetons : surveillance 2, piochez deux cartes, gagnez 2 PV",
      }),
    ],
  },
  "Yarus, Roar of the Old Gods": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { addKeywords: ["haste"] },
        {
          label: "Vos autres créatures ont la célérité",
        },
      ),
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you", faceDown: true }), [fx.draw(1)], {
        label: "Vos créatures face cachée infligent des blessures de combat à un joueur : piochez une carte",
      }),
      triggered(
        when.dies({ types: ["Creature"], controller: "you", faceDown: true }),
        fx.when(
          cond.refMatches(ref.eventObject, { permanent: true }),
          fx.putFaceDown(ref.eventObject, false, { store: "y", ownerControl: true }),
          fx.turnFaceUp(ref.stored("y")),
        ),
        { label: "Une créature face cachée meurt : elle revient face cachée, puis est retournée face visible" },
      ),
    ],
  },
  "Etrata, Deadly Fugitive": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", faceDown: true },
        {
          addAbilities: [
            activated({
              mana: "{2}{U}{B}",
              effects: [fx.turnFaceUp(ref.self, "e"), fx.castNow(ref.stored("e"), { free: true })],
              label: "Retournez-la face visible (sinon, exilez-la et lancez-la gratuitement)",
            }),
          ],
        },
        { label: "Vos créatures face cachée : « {2}{U}{B} : retournez-la face visible »" },
      ),
      triggered(
        when.combatDamage({ subtype: "Assassin", controller: "you" }, true),
        [fx.cloak(ref.libraryTop(ref.eventPlayer))],
        {
          label: "Un Assassin blesse un adversaire : enveloppez d'une cape la carte du dessus de sa bibliothèque",
        },
      ),
    ],
  },
  "Vannifar, Evolved Enigma": {
    abilities: [
      triggeredModal(
        when.yourCombat,
        [
          mode(
            "Enveloppez d'une cape une carte de votre main",
            [],
            [
              fx.pickFromZone(
                "hand",
                {},
                { to: "battlefield", cloak: true },
                { count: 1, min: 1, prompt: "La carte à envelopper d'une cape" },
              ),
            ],
          ),
          mode(
            "Un marqueur +1/+1 sur chaque créature incolore que vous contrôlez",
            [],
            [fx.addCountersAll({ types: ["Creature"], controller: "you", colorCount: 0 }, 1)],
          ),
        ],
        { label: "Au début de votre combat : cape ou marqueurs" },
      ),
    ],
  },
  "Lazav, Wearer of Faces": {
    abilities: [
      triggered(when.attacksSelf, [fx.exileCard(ref.target(), { name: "l" }), fx.link(ref.stored("l")), investigate()], {
        targets: [target.cardInGraveyard("t", {}, "any")],
        label: "Exilez une carte d'un cimetière, puis enquêtez",
      }),
      triggered(
        when.sacrifice({ subtype: "Clue" }),
        fx.may(
          "Lazav devient-il une copie d'une carte de créature exilée avec lui ?",
          fx.chooseAmong(ref.filtered(ref.linked, { types: ["Creature"] }), ref.you, "m", { anyZone: true }),
          fx.becomeCopy(ref.self, ref.stored("m"), "endOfTurn"),
        ),
        { label: "Vous sacrifiez un Indice : Lazav peut devenir une copie d'une créature exilée avec lui" },
      ),
    ],
  },
  "Tolsimir, Midnight's Light": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(VOJA_FENSTALKER)], { label: "Voja Fenstalker, Loup 5/5 légendaire" }),
      triggered(
        when.attacks({ subtype: "Wolf", controller: "you" }),
        [
          fx.modify(
            ref.target(),
            { addBlockRules: [{ mustBlockEventObject: true, label: "Bloque ce Loup si possible" }] },
            "endOfTurn",
          ),
        ],
        {
          condition: cond.sourceMatches({ attacking: true }),
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Tolsimir attaque : une créature adverse bloque ce Loup si possible",
        },
      ),
    ],
  },
  Hustle: {
    spell: spell(
      [target.creature()],
      [
        fx.modify(
          ref.target(),
          { addKeywords: ["mustAttack"], addBlockRules: [{ mustBlock: true, label: "Bloque si possible" }] },
          "endOfTurn",
        ),
      ],
    ),
  },
  Bustle: {
    spell: spell(
      [],
      [
        fx.pumpAll(CREATURES_YOU, 2, 2, ["trample"]),
        ...fx.may(
          "Retourner face visible une créature que vous contrôlez ?",
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], faceDown: true }), ref.you, "f"),
          fx.turnFaceUp(ref.stored("f")),
        ),
      ],
    ),
  },
  "Ill-Timed Explosion": {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.discard(2, ref.you, { optional: true, store: "d" }),
        ...fx.when(cond.v("d", 2), fx.damageAll(amount.greatestManaValueOf(ref.stored("d")), { types: ["Creature"] })),
      ],
    ),
  },
  "Officious Interrogation": {
    costPerExtraTarget: "{W}{U}",
    spell: spell(
      [{ ...target.player("p"), label: "joueur", count: 8, optional: true }],
      [investigate(amount.refCount(ref.permanentsOf(ref.target("p"), { types: ["Creature"] })))],
    ),
  },
  "Treacherous Greed": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], dealtDamageThisTurn: true }, count: 1 } },
    spell: spell([], [fx.draw(3), fx.loseLife(3, ref.eachOpponent), fx.gainLife(3)]),
  },
  "Urgent Necropsy": {
    additionalCost: { collectEvidenceTargetsManaValue: true },
    spell: spell(
      [
        target.upTo(1, target.permanent("a", ["Artifact"], {}, "artefact")),
        target.upTo(1, target.creature("c")),
        target.upTo(1, target.permanent("e", ["Enchantment"], {}, "enchantement")),
        target.upTo(1, target.permanent("w", ["Planeswalker"], {}, "planeswalker")),
      ],
      [fx.destroy(ref.target("a")), fx.destroy(ref.target("c")), fx.destroy(ref.target("e")), fx.destroy(ref.target("w"))],
    ),
  },
  "Niv-Mizzet, Guildpact": {
    abilities: [
      protectionAbility(protection.hexproofFrom({ multicolored: true }, "Défense talismanique contre le multicolore")),
      triggered(
        when.combatDamageToPlayer,
        [fx.damage(NIV_X, ref.target("a")), fx.draw(NIV_X, ref.target("p")), fx.gainLife(NIV_X)],
        {
          targets: [target.any("a"), target.player("p")],
          label: "X blessures, X cartes, X PV (X : paires de couleurs parmi vos permanents bicolores)",
        },
      ),
    ],
  },
  "Aurelia, the Law Above": {
    abilities: [
      triggered(when.attackWith(3, undefined, true), [fx.draw(1)], {
        label: "Un joueur attaque avec trois créatures ou plus : piochez une carte",
      }),
      triggered(when.attackWith(5, undefined, true), [fx.damage(3, ref.eachOpponent), fx.gainLife(3)], {
        label: "Un joueur attaque avec cinq créatures ou plus : 3 blessures à chaque adversaire, gagnez 3 PV",
      }),
    ],
  },
  "Tin Street Gossip": {
    abilities: [
      // {R}{G} restreint : une capacité activée (avec la pile) qui ajoute les deux mana, comme Troyan.
      activated({
        tap: true,
        effects: [fx.addManaChoice(1, ["R"], FACE_DOWN_MANA), fx.addManaChoice(1, ["G"], FACE_DOWN_MANA)],
        label: "Ajoutez {R}{G} (sorts face cachée, retournements)",
      }),
    ],
  },
  "Kylox's Voltstrider": {
    // Équipage 2 : lu dans le texte.
    abilities: [
      activated({
        collectEvidence: 6,
        linkEvidence: true,
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "endOfTurn")],
        label: "Réunissez des preuves 6 : devient une créature-artefact jusqu'à la fin du tour",
      }),
      triggered(when.attacksSelf, [fx.castNow(ref.filtered(ref.linked, INSTANT_SORCERY), { bottomAfter: true })], {
        label: "Vous pouvez lancer un éphémère ou un rituel parmi les cartes exilées avec lui",
      }),
    ],
  },
  "Judith, Carnage Connoisseur": {
    abilities: [
      triggeredModal(
        when.castSpell("you", INSTANT_SORCERY),
        [
          mode(
            "Le sort gagne le contact mortel et le lien de vie",
            [],
            [fx.modify(ref.eventObject, { addKeywords: ["deathtouch", "lifelink"] })],
          ),
          mode("Un Diablotin 2/2", [], [fx.createTokens(IMP)]),
        ],
        { label: "Éphémère ou rituel : contact mortel et lien de vie, ou un Diablotin" },
      ),
    ],
  },
  "Kaya, Spirits' Justice": {
    abilities: [
      ...[
        { on: "leaves" as const, who: { types: ["Creature" as const], controller: "you" as const }, to: "exile" as const },
        {
          on: "leaves" as const,
          who: { types: ["Creature" as const], controller: "you" as const },
          from: "graveyard" as const,
          to: "exile" as const,
        },
      ].map((w) =>
        triggered(
          w,
          fx.may(
            "Un jeton devient-il une copie de cette carte de créature (avec le vol) ?",
            fx.becomeCopy(ref.target(), ref.eventObject, "endOfTurn", { addKeywords: ["flying"] }),
          ),
          {
            targets: [{ id: "t", label: "jeton que vous contrôlez", filter: { objects: { token: true, controller: "you" } } }],
            label: "Une créature exilée : un jeton devient une copie, avec le vol",
          },
        ),
      ),
      loyalty(2, {
        effects: [
          fx.surveil(2),
          fx.chooseAmong(ref.allGraveyards, ref.you, "k", { anyZone: true }),
          fx.exileCard(ref.stored("k")),
        ],
        label: "Surveillance 2, puis exilez une carte d'un cimetière",
      }),
      loyalty(1, { effects: [fx.createTokens(SPIRIT_WB)], label: "Un Esprit 1/1 volant" }),
      loyalty(-2, {
        targets: [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
        effects: [fx.exile(ref.target("a")), fx.exile(ref.target("b"))],
        label: "Exilez une de vos créatures et jusqu'à une créature adverse",
      }),
    ],
  },
  "Kylox, Visionary Inventor": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true }), ref.you, "k", { anyNumber: true }),
          fx.exileTop(ref.you, amount.totalPowerOf(ref.stored("k")), "e"),
          fx.sacrificeIt(ref.stored("k")),
          fx.castNow(ref.filtered(ref.stored("e"), INSTANT_SORCERY), { free: true, many: true }),
        ],
        { label: "Sacrifiez des créatures, exilez X cartes, lancez-en les éphémères et rituels gratuitement" },
      ),
    ],
  },
  Flotsam: { spell: spell([], [fx.mill(3), investigate()]) },
  Jetsam: {
    spell: spell(
      [],
      [
        fx.mill(3, ref.eachOpponent),
        fx.castNow(ref.filtered(ref.graveyardOf(ref.eachOpponent), { nonland: true }), { free: true, exileAfter: true }),
      ],
    ),
  },
  "Buried in the Garden": {
    enchant: { filter: { types: ["Land"] }, label: "terrain" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain que vous ne contrôlez pas")],
        label: "Exilez un permanent non-terrain adverse jusqu'à ce que cette Aura parte",
      }),
      eventReplacement({
        event: "mana",
        source: { attachedToSource: true },
        extraMana: "any",
        modify: { add: 1 },
        label: "Le terrain enchanté engagé pour du mana : un mana de plus",
      }),
    ],
  },
  // --- Promotions de MKM légales en Standard (importées au lot C19 du PLAN-C) ---------------------------------------
  "Melek, Reforged Researcher": {
    // F/E : deux fois le nombre de cartes d'éphémère et de rituel de votre cimetière.
    cdaPT: amount.plus(amount.countIn("graveyard", INSTANT_SORCERY), amount.countIn("graveyard", INSTANT_SORCERY)),
    abilities: [
      costReducer(INSTANT_SORCERY, 3, "Le premier éphémère ou rituel du tour coûte {3} de moins", {
        condition: cond.not(cond.amountAtLeast(amount.instantSorceryCast, 1)),
      }),
    ],
  },
  "Tomik, Wielder of Law": {
    // Affinité pour les planeswalkers : {1} de moins par planeswalker que vous contrôlez. Vol, vigilance : lus dans le texte.
    costReduction: { generic: amount.count({ types: ["Planeswalker"], controller: "you" }) },
    abilities: [
      triggered(when.opponentAttacksYouWith(2), [fx.loseLife(3, ref.eventPlayer), fx.draw(1)], {
        label: "L'adversaire perd 3 PV, vous piochez",
      }),
    ],
  },
  "Voja, Jaws of the Conclave": {
    // Vigilance, piétinement, garde {3} : lus dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCountersAll(CREATURES_YOU, amount.count({ subtype: "Elf", controller: "you" }), "+1/+1"),
          fx.draw(amount.count({ subtype: "Wolf", controller: "you" })),
        ],
        { label: "Marqueurs par Elfe ; une carte par Loup" },
      ),
    ],
  },
};
