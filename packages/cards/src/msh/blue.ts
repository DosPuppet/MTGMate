/**
 * Marvel Super Heroes — cartes bleues (lot A). Montée en puissance : `activated({ powerUp: true })` ; Travail d'équipe :
 * lu dans le texte (kicker), lu par `cond.kicked`.
 */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  cost,
  costReducer,
  eventReplacement,
  fx,
  MERFOLK_BLUE,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

/** Léviathan (Atlantis Attacks) : créature bleue 6/5 avec la défense talismanique. */
const LEVIATHAN: TokenSpec = {
  name: "Leviathan",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Leviathan"],
  power: 6,
  toughness: 5,
  keywords: ["hexproof"],
};

/** Redwing (Falcon, Winged Wonder) : Oiseau Éclaireur légendaire bleu 1/1 volant qui surveille 1 en attaquant. */
const REDWING: TokenSpec = {
  name: "Redwing",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Bird", "Scout"],
  power: 1,
  toughness: 1,
  legendary: true,
  keywords: ["flying"],
  abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
  text: "Flying\nWhenever Redwing attacks, surveil 1.",
};

/** « Exilez [la cible], puis renvoyez-la sur le champ de bataille au début de la prochaine étape de fin. » */
const FLICKER_UNTIL_END_STEP = [
  fx.exileCard(ref.target(), { name: "k" }),
  fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
];

/** Aura ou Équipement : « attachez-le à la créature ciblée que vous contrôlez » en arrivant. */
const ATTACH_ON_ENTER_TARGET = [target.creature("t", { controller: "you" })];

export const BLUE: Record<string, CardScript> = {
  "Aerial Doombot": {
    abilities: [
      activated({
        mana: "{5}{U}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 3)],
        label: "Montée en puissance : trois marqueurs +1/+1",
      }),
    ],
  },
  "A.I.M. Scientists": {
    // Cycle de terrain de base {2} : lu dans le texte.
    abilities: [triggered(when.entersSelf, [fx.connive(ref.self)], { label: "Complote" })],
  },
  "Atlantean Cavalry": {
    abilities: [triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Deuxième carte piochée : un marqueur +1/+1" })],
  },
  "Atlantis Attacks": {
    // Travail d'équipe 4 : lu dans le texte. Payé, les deux modes sont choisis (le mode « les deux » l'exige).
    spell: modal(
      mode("Le joueur ciblé crée un Léviathan 6/5", [target.player("p")], [fx.createTokens(LEVIATHAN, 1, ref.target("p"))]),
      mode(
        "Renvoie un ou deux permanents non-terrains",
        [target.between(1, 2, target.nonland("b"))],
        [fx.bounce(ref.target("b"))],
      ),
      {
        ...mode(
          "Les deux (travail d'équipe)",
          [target.player("p"), target.between(1, 2, target.nonland("b"))],
          [fx.createTokens(LEVIATHAN, 1, ref.target("p")), fx.bounce(ref.target("b"))],
        ),
        condition: cond.kicked,
      },
    ),
  },
  "Attuma, Atlantean Warlord": {
    abilities: [
      staticAbility(
        { subtype: "Merfolk", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Les autres Ondins que vous contrôlez ont +1/+1" },
      ),
      triggered(when.attackWith(1, { subtype: "Merfolk" }), [fx.draw(1)], { label: "Des Ondins attaquent : piochez" }),
    ],
  },
  "Bold Biochemist": {
    abilities: [
      activated({
        mana: "{5}{U}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.draw(2)],
        label: "Montée en puissance : un marqueur +1/+1, piochez deux cartes",
      }),
    ],
  },

  // --- Bruce Banner // The Incredible Hulk -------------------------------------
  "Bruce Banner": {
    abilities: [
      activated({ mana: "{X}{X}", tap: true, sorcerySpeed: true, effects: [fx.draw(amount.x)], label: "Piochez X cartes" }),
      activated({ mana: "{2}{R}{R}{G}{G}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "The Incredible Hulk": {
    abilities: [
      triggered(
        when.isDealtDamage,
        [fx.addCounters(ref.self, 1), ...fx.when(cond.sourceMatches({ attacking: true }), fx.untap(ref.self), fx.extraCombat)],
        { label: "Rage : un marqueur +1/+1 ; s'il attaque, il se dégage et un combat supplémentaire suit" },
      ),
    ],
  },

  Depower: {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { attacking: true }) },
    spell: spell([target.creature()], [fx.pump(ref.target(), -4, 0), fx.draw(1)]),
  },
  "Echo, Perceptive Prodigy": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "capacité activée ou déclenchée que vous contrôlez",
            filter: { stackItems: { abilitiesOnly: true } },
          },
        ],
        // Approximation : la source n'est pas vérifiée (créature) ; la capacité d'un adversaire n'est pas copiée.
        effects: [fx.copySpell(ref.except(ref.target(), ref.stackItemsOf(ref.eachOpponent)), 1)],
        label: "Copiez une capacité que vous contrôlez",
      }),
    ],
  },
  "Falcon, Winged Wonder": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(REDWING)], { label: "Télépathie aviaire : Redwing" })],
  },
  "Falcon's Wing Harness": {
    // Équiper {2}{U} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: ATTACH_ON_ENTER_TARGET,
        label: "Attachez-le à une créature que vous contrôlez",
      }),
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["flying"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "+1/+1, vol et garde {1}" },
      ),
    ],
  },
  "Frozen in Ice": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez la créature enchantée" }),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Perd toutes ses capacités" }),
      eventReplacement({
        event: "untap",
        toFilter: { attachedToSource: true },
        modify: { prevent: true },
        label: "La créature enchantée ne peut pas être dégagée",
      }),
    ],
  },
  "Futurist Forge": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      activated({ mana: "{3}{U}", sacrifice: true, effects: [fx.draw(2)], label: "Piochez deux cartes" }),
    ],
  },
  "Giant-Sized Flying Ant": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Engagez un permanent non-terrain", [target.nonland()], [fx.tap(ref.target())]),
          mode("Dégagez un permanent non-terrain", [target.nonland()], [fx.untap(ref.target())]),
        ],
        { label: "Engagez ou dégagez un permanent non-terrain" },
      ),
    ],
  },
  "Hydraulic Helper": {
    // « Ce mana ne peut pas servir à lancer un sort non-artefact » : sorts d'artefact et capacités.
    abilities: [manaAbility("U", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  },
  "I Am Iron Man": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [
        fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 4, addKeywords: ["flying"] }),
        fx.draw(1),
      ],
    ),
  },
  "Iron Lad, Diverging Destiny": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Regardez la carte du dessus" }),
      activated({
        tap: true,
        effects: [fx.when(cond.refMatches(ref.libraryTop(ref.you), { types: ["Artifact"] }), fx.draw(1))],
        label: "Révélez la carte du dessus : piochez si c'est un artefact",
      }),
    ],
  },
  "Justice, Vance Astrovik": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { token: false }, "permanent non-terrain qui n'est pas un jeton"))],
        label: "Renvoyez un permanent non-terrain",
      }),
      triggered(
        { on: "leaves", who: { notTypes: ["Land"], controller: "you", other: true }, to: "hand" },
        [fx.addCounters(ref.self, 1)],
        { label: "Un permanent renvoyé en main : un marqueur +1/+1" },
      ),
    ],
  },
  "Kang the Conqueror": {
    abilities: [
      activated({
        mana: "{5}{U}{U}{U}",
        powerUp: true,
        // Approximation : la restriction « pendant ce tour, les montées en puissance ne peuvent pas être activées » manque.
        effects: [fx.addCounters(ref.self, 1), fx.extraTurn],
        label: "Montée en puissance : un marqueur +1/+1 et un tour supplémentaire",
      }),
    ],
  },
  "Mister Fantastic, Reed Richards": {
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), fx.may("Piocher une carte ?", fx.draw(1)), {
        batched: true,
        label: "Des jetons arrivent : vous pouvez piocher",
      }),
    ],
  },
  "Ms. Marvel, Kamala Khan": {
    abilities: [
      playerStatic({ noMaxHandSize: true, label: "Pas de taille de main maximale" }),
      triggered(
        when.castSpell("you", undefined, { objects: { types: ["Creature"], controller: "you" } }),
        [
          fx.draw(1),
          fx.modify(ref.self, {
            addAbilities: [
              staticAbility("self", { setPower: 1 }, { perHand: true, label: "Force de base égale aux cartes en main" }),
            ],
          }),
        ],
        { label: "Poing embiggeni : piochez ; force de base égale aux cartes en main" },
      ),
    ],
  },
  "Multiversal Incursion": {
    spell: spell([], [fx.copyToken(ref.permanentsOf(ref.you, { types: ["Creature"], token: false }), { nonlegendary: true })]),
  },
  "Pym Particles": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["vigilance", "unblockable"]), fx.draw(1)]),
  },
  "Rewrite History": {
    abilities: [
      triggered({ on: "taps", who: { types: ["Creature"], controller: "you" } }, [...fx.loot(1), fx.counters(ref.self, "plan")], {
        batched: true,
        label: "Piochez, défaussez, un marqueur de plan",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrificeIt(ref.self),
          fx.reflexive(
            [
              target.upTo(
                2,
                target.cardInGraveyard(
                  "g",
                  { types: ["Instant", "Sorcery"] },
                  "you",
                  "carte d'éphémère ou de rituel de votre cimetière",
                ),
              ),
            ],
            [fx.toHand(ref.target("g"))],
          ),
        ],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Quatrième marqueur : sacrifiez-le, reprenez deux éphémères ou rituels",
        },
      ),
    ],
  },
  "Secret Invasion": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { notAttachedToSource: true }))],
        label: "Exilez une autre créature",
      }),
      staticAbility("attached", { copyLinkedExile: true }, { label: "Copie de la créature exilée" }),
      staticAbility("attached", { addAbilities: [wardAbility({ mana: cost("{2}") })] }, { label: "Garde {2}" }),
    ],
  },
  "S.H.I.E.L.D. Deployment Drone": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER)], { label: "Un Soldat 1/1" })],
  },
  "S.H.I.E.L.D. Flying Car": {
    // Flash, vol et Équipage 1 : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, FLICKER_UNTIL_END_STEP, {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Exilez une de vos créatures jusqu'à l'étape de fin",
      }),
    ],
  },
  "Shuri, Wakandan Inventor": {
    abilities: [
      costReducer({ types: ["Artifact"] }, 1, "Vos sorts d'artefact coûtent {1} de moins"),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          target.permanent("a", ["Artifact"], { controller: "you" }, "artefact que vous contrôlez"),
          target.permanent("b", ["Artifact"], { controller: "you" }, "second artefact que vous contrôlez"),
        ],
        // « Sauf qu'il n'est pas légendaire » : le surtype est retiré après la copie (couche 4).
        effects: [
          fx.becomeCopy(ref.target("a"), ref.target("b"), "endOfTurn"),
          fx.modify(ref.target("a"), { removeSupertypes: ["Legendary"] }),
        ],
        label: "Un artefact devient une copie d'un autre",
      }),
    ],
  },
  "Stature, Size Shifter": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        { condition: cond.sourceMatches({ maxPower: 1 }), label: "Imblocable tant que sa force est de 1 ou moins" },
      ),
      activated({
        mana: "{X}{U}{U}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, amount.x)],
        label: "Montée en puissance : X marqueurs +1/+1",
      }),
    ],
  },
  "Super Intelligence": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      // L'entretien du contrôleur de la créature enchantée (approché à plus de deux joueurs : celui de chaque adversaire
      // quand elle est chez un adversaire).
      triggered(when.step("upkeep", "any"), [fx.draw(1, ref.controllerOf(ref.attached))], {
        condition: cond.any(
          cond.all(cond.yourTurn, cond.controls({ attachedToSource: true })),
          cond.all(cond.opponentsTurn, cond.battlefieldCount({ attachedToSource: true, controller: "opponent" }, 1)),
        ),
        label: "Son contrôleur pioche une carte",
      }),
    ],
  },
  "Super Suit": {
    // Flash et Équiper {2} : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.untap(ref.target())], {
        targets: ATTACH_ON_ENTER_TARGET,
        label: "Attachez-le à une créature que vous contrôlez et dégagez-la",
      }),
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    ],
  },
  "Thirst for Knowledge": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Artifact"] } })]),
  },

  // --- Tony Stark // The Invincible Iron Man ------------------------------------
  "Tony Stark": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        // Le reste va au-dessous de la bibliothèque (ordre non aléatoire).
        effects: [fx.lookAtTop(4, { filter: { types: ["Artifact"] }, rest: "bottom" })],
        label: "Regardez quatre cartes : un artefact en main",
      }),
      activated({ mana: "{4}{U}{R}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "The Invincible Iron Man": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.pickFromZone(
            "hand",
            { types: ["Artifact"] },
            { to: "battlefield" },
            { min: 0, store: "a", prompt: "Une carte d'artefact de votre main" },
          ),
          ...fx.when(cond.refMatches(ref.stored("a"), { subtype: "Equipment" }), fx.attach(ref.self, ref.stored("a"))),
        ],
        { label: "Un artefact de votre main sur le champ de bataille" },
      ),
    ],
  },

  "Wiccan, Rising Magician": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), FLICKER_UNTIL_END_STEP, {
        targets: [target.nonland("t", { other: true, token: false }, "autre permanent non-terrain qui n'est pas un jeton")],
        label: "Exilez un autre permanent jusqu'à l'étape de fin",
      }),
    ],
  },
  // Improvisation et vol : lus dans le texte.
  "Ironheart, Clever Champion": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { notTypes: ["Creature"] }, keywords: ["improvise"] },
        label: "Vos sorts non-créature ont l'improvisation",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Namor the Sub-Mariner": {
    cdaPower: amount.count({ subtype: "Merfolk", controller: "you" }),
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.createTokens(MERFOLK_BLUE, amount.manaSymbolsOf(ref.eventObject, "U"))],
        { label: "Sort non-créature : un Ondin 1/1 par symbole {U} de son coût" },
      ),
    ],
  },
  "Kid Loki": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", countersPutByYouThisTurn: "+1/+1" },
        { addKeywords: ["hexproof"] },
        { label: "Vos créatures sur lesquelles vous avez mis des marqueurs +1/+1 ce tour-ci ont la défense talismanique" },
      ),
      triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Deuxième carte piochée : un marqueur +1/+1" }),
    ],
  },
  "Loki, God of Mischief": {
    abilities: [
      triggered({ on: "becomesTarget", who: {}, players: true, abilitiesOnly: true, byYou: true }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "Un joueur ou un permanent devient la cible d'une de vos capacités : piochez (une fois par tour)",
      }),
    ],
  },
  "Leader, Super-Genius": {
    abilities: [
      eventReplacement({
        event: "connive",
        toFilter: { types: ["Creature"], controller: "you" },
        modify: { add: 1 },
        label: "Une de vos créatures complote : piochez d'abord une carte",
      }),
      triggered({ on: "step", step: "beginCombat", whose: "you" }, [fx.connive(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Au début de votre combat, une de vos créatures complote",
      }),
    ],
  },
  "Trickster's Stratagem": {
    spell: spell(
      [target.creature("t", { controller: "opponent" }), target.upTo(1, target.creature("c", { controller: "you" }))],
      [fx.topOrBottom(ref.target("t"), undefined, 2), fx.connive(ref.target("c"))],
    ),
  },
};
