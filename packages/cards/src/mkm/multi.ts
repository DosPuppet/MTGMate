/** Murders at Karlov Manor — cartes multicolores. */
import type { ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  DETECTIVE,
  DOG,
  entersWith,
  fx,
  investigate,
  manaAbility,
  modal,
  mode,
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
        { addSubtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] },
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
};
