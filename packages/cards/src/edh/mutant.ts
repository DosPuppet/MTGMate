/**
 * Commander : préconstruit « Mutant Menace » de Fallout (The Wise Mothman, noir, vert, bleu). Marqueurs de radiation
 * (au début de sa première phase principale, un joueur meule autant de cartes et perd 1 PV par carte non-terrain),
 * cartes meulées, prolifération, Mutants.
 */
import type { CardScript, ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  CLUE,
  chapter,
  cond,
  entersWith,
  escalate,
  eventReplacement,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  wardAbility,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const ZOMBIE_OR_MUTANT_YOU: ObjectFilter = { ...CREATURE_YOU, anySubtype: ["Zombie", "Mutant"] };
const ZOMBIE_MUTANT: TokenSpec = {
  name: "Zombie Mutant",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Zombie", "Mutant"],
  power: 2,
  toughness: 2,
};
const ALIEN: TokenSpec = { name: "Alien", colors: ["U"], types: ["Creature"], subtypes: ["Alien"], power: 0, toughness: 0 };
/** « Chaque fois qu'une ou plusieurs cartes non-terrain sont meulées » (`amount.eventAmount` : leur nombre). */
const NONLAND_MILLED: TriggerSpec = { on: "milled", whose: "any", nonland: true };
/** Évolution, avec un effet en plus quand elle évolue (Watchful Radstag). */
const evolveThen = (...more: Parameters<typeof triggered>[1][]) =>
  triggered(when.enters({ ...CREATURE_YOU, other: true }), [fx.addCounters(ref.self, 1), ...more.flat()], {
    condition: cond.any(
      cond.amountGreater(amount.powerOf(ref.eventObject), amount.powerOf(ref.self)),
      cond.amountGreater(amount.toughnessOf(ref.eventObject), amount.toughnessOf(ref.self)),
    ),
    label: "Évolution",
  });

export const EDH_MUTANT: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  // Vol : lu dans le texte.
  "The Wise Mothman": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(w, [fx.rad(ref.eachPlayer, 1)], { label: "Chaque joueur reçoit un marqueur de radiation" }),
      ),
      triggered(NONLAND_MILLED, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature(), countAmount: amount.eventAmount, minCount: 0, label: "jusqu'à X créatures" }],
        label: "Des cartes non-terrain sont meulées : un marqueur +1/+1 sur jusqu'à X créatures",
      }),
    ],
  },

  // --- Mutants et légendes ------------------------------------------------------------------------------------------
  // Piétinement : lu dans le texte.
  "Agent Frank Horrigan": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["indestructible"] },
        { condition: cond.sourceMatches({ attackedThisTurn: true }), label: "Indestructible s'il a attaqué ce tour-ci" },
      ),
      ...[when.entersSelf, when.attacksSelf].map((w) => triggered(w, [fx.proliferate(2)], { label: "Proliférez deux fois" })),
    ],
  },
  // Menace, piétinement : lus dans le texte. Monstruosité 4 : une seule fois.
  "Alpha Deathclaw": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.permanent("t", [], {}, "permanent")],
        label: "Détruisez un permanent",
      }),
      activated({
        mana: "{5}{B}{G}",
        once: true,
        effects: [
          fx.addCounters(ref.self, 4),
          fx.reflexive([target.permanent("t", [], {}, "permanent")], [fx.destroy(ref.target())]),
        ],
        label: "Monstruosité 4 : devient monstrueuse, détruisez un permanent",
      }),
    ],
  },
  "Hancock, Ghoulish Mayor": {
    abilities: [
      // Approximation : X compte ses marqueurs +1/+1 (pas les autres sortes).
      {
        ...staticAbility(ZOMBIE_OR_MUTANT_YOU, { power: 1, toughness: 1 }, { label: "+X/+X aux Zombies et Mutants" }),
        perCounter: "+1/+1",
      },
      // Persistance du mort-vivant (Undying, 702.93).
      triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { counters: { kind: "+1/+1", n: 1 } })], {
        condition: cond.not(cond.counterAtLeast("+1/+1", 1)),
        label: "Undying : revient avec un marqueur +1/+1",
      }),
    ],
  },
  // Portée, vigilance : lues dans le texte.
  "Harold and Bob, First Numens": {
    abilities: [
      // Approximation : la Forêt gagne la capacité pour toujours ; Harold and Bob reste dans le cimetière (pas d'Aura).
      triggered(
        when.diesSelf,
        [
          fx.modify(
            ref.target(),
            {
              addAbilities: [
                activated({
                  tap: true,
                  effects: [fx.addManaChoice(3, ANY_COLOR, undefined, true), fx.rad(ref.you, 2)],
                  label: "Trois mana d'une couleur ; vous recevez deux marqueurs de radiation",
                }),
              ],
            },
            "permanent",
          ),
        ],
        {
          targets: [target.permanent("t", ["Land"], { controller: "you", subtype: "Forest" }, "Forêt que vous contrôlez")],
          label: "Une de vos Forêts gagne « {T} : trois mana d'une couleur, deux marqueurs de radiation »",
        },
      ),
    ],
  },
  "Jason Bright, Glowing Prophet": {
    abilities: [
      // Approximation : « une force différente de sa force de base » se lit « supérieure ».
      triggered(when.dies({ ...ZOMBIE_OR_MUTANT_YOU, powerAboveBase: true }), [fx.draw(1)], {
        label: "Un Zombie ou un Mutant modifié meurt : piochez une carte",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Creature"] }, includeSelf: true },
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"])],
        label: "Volez avec moi : un marqueur +1/+1 et le vol",
      }),
    ],
  },
  // Vigilance : lue dans le texte.
  "Lily Bowen, Raging Grandma": {
    abilities: [
      entersWith({ counters: 2, label: "Deux marqueurs +1/+1" }),
      triggered(
        when.yourUpkeep,
        [
          ...fx.when(cond.not(cond.amountAtLeast(amount.powerOf(ref.self), 17)), fx.doubleCounters(ref.self)),
          ...fx.when(
            cond.amountAtLeast(amount.powerOf(ref.self), 17),
            fx.removeCounters(ref.self, amount.plus(amount.countersOn(ref.self), -1), "+1/+1", "r"),
            fx.gainLife(amount.v("r")),
          ),
        ],
        { label: "Doublez ses marqueurs (force 16 ou moins), sinon gardez-en un et gagnez des PV" },
      ),
    ],
  },
  // Vigilance, piétinement : lus dans le texte.
  "Marcus, Mutant Mayor": {
    abilities: [
      triggered(
        when.combatDamage(CREATURE_YOU, true),
        [
          ...fx.when(cond.eventObjectMatches({ withCounter: "+1/+1" }), fx.draw(1)),
          ...fx.when(cond.not(cond.eventObjectMatches({ withCounter: "+1/+1" })), fx.addCounters(ref.eventObject, 1)),
        ],
        { label: "Une de vos créatures blesse un joueur : piochez si elle a un marqueur +1/+1, sinon elle en reçoit un" },
      ),
    ],
  },
  "Piper Wright, Publick Reporter": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.createTokens(CLUE, amount.eventAmount)], { label: "Enquêtez autant de fois" }),
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Vous sacrifiez un Indice : un marqueur +1/+1",
      }),
    ],
  },
  "Raul, Trouble Shooter": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { milledThisTurn: true }, what: "spells", oncePerTurn: true },
        condition: cond.yourTurn,
        label: "Une fois par tour : lancez un sort parmi les cartes meulées ce tour-ci",
      }),
      activated({ tap: true, effects: [fx.mill(1, ref.eachPlayer)], label: "Chaque joueur meule une carte" }),
    ],
  },
  "Strong, the Brutish Thespian": {
    // Garde {2} : lue dans le texte.
    abilities: [
      triggered(when.isDealtDamage, [fx.rad(ref.you, 3), fx.addCounters(ref.self, 3)], {
        label: "Rage : trois marqueurs de radiation et trois marqueurs +1/+1",
      }),
      playerStatic({ radiationGains: true, label: "Vous gagnez des PV au lieu d'en perdre à cause de la radiation" }),
    ],
  },
  "The Master, Transcendent": {
    abilities: [
      triggered(when.entersSelf, [fx.rad(ref.target("p"), 2)], {
        targets: [target.player("p")],
        label: "Le joueur ciblé reçoit deux marqueurs de radiation",
      }),
      activated({
        tap: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], milledThisTurn: true },
            "any",
            "carte de créature meulée ce tour-ci",
          ),
        ],
        effects: [
          fx.toBattlefield(ref.target(), { underYourControl: true }),
          fx.modify(ref.target(), { setColors: ["G"], setSubtypes: ["Mutant"], setPower: 3, setToughness: 3 }, "permanent"),
        ],
        label: "Une créature meulée ce tour-ci arrive sous votre contrôle : Mutant vert 3/3",
      }),
    ],
  },

  // --- Autres créatures ---------------------------------------------------------------------------------------------
  // Vol : lu dans le texte.
  "Bloatfly Swarm": {
    abilities: [
      entersWith({ counters: 5, label: "Cinq marqueurs +1/+1" }),
      eventReplacement({
        event: "damage",
        toFilter: { self: true, withCounter: "+1/+1" },
        modify: { prevent: true },
        onPrevent: {
          reflexive: [fx.removeCounters(ref.self, amount.eventAmount, "+1/+1", "r"), fx.rad(ref.eachPlayer, amount.v("r"))],
        },
        label: "Blessures prévenues : autant de marqueurs +1/+1 retirés, et autant de marqueurs de radiation à chaque joueur",
      }),
    ],
  },
  "Cathedral Acolyte": {
    abilities: [
      staticAbility(
        { ...CREATURE_YOU, withCounter: "any" },
        { addAbilities: [wardAbility({ mana: { generic: 1, colored: {}, x: 0 } })] },
        { label: "Vos créatures avec un marqueur ont la garde {1}" },
      ),
      activated({
        tap: true,
        targets: [{ ...target.creature("t", { enteredThisTurn: true }), label: "créature arrivée ce tour-ci" }],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Un marqueur +1/+1 sur une créature arrivée ce tour-ci",
      }),
    ],
  },
  // Menace : lue dans le texte.
  "Feral Ghoul": {
    abilities: [
      triggered(when.dies({ ...CREATURE_YOU, other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Une autre de vos créatures meurt : un marqueur +1/+1",
      }),
      triggered(when.diesSelf, [fx.rad(ref.eachOpponent, amount.powerOf(ref.eventObject))], {
        label: "Chaque adversaire reçoit autant de marqueurs de radiation que sa force",
      }),
    ],
  },
  // Contact mortel : lu dans le texte.
  "Glowing One": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rad(ref.eventPlayer, 4)], { label: "Il reçoit quatre marqueurs de radiation" }),
      triggered(NONLAND_MILLED, [fx.gainLife(amount.eventAmount)], {
        label: "Une carte non-terrain meulée : vous gagnez 1 PV",
      }),
    ],
  },
  // Vol, « ne peut pas bloquer » : lus dans le texte.
  "Infesting Radroach": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rad(ref.eventPlayer, amount.eventAmount)], {
        label: "Il reçoit autant de marqueurs de radiation",
      }),
      triggered(
        { on: "milled", whose: "opponent", nonland: true },
        fx.may("Reprendre Infesting Radroach en main ?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Un adversaire meule une carte non-terrain : elle revient en main" },
      ),
    ],
  },
  // Piétinement : lu dans le texte.
  "Lumbering Megasloth": {
    // Approximation : seuls les marqueurs des permanents comptent (pas ceux des joueurs).
    costReduction: { generic: amount.countersAmong({ permanent: true }, "any") },
    abilities: [entersWith({ tapped: true })],
  },
  // Vigilance : lue dans le texte.
  "Mirelurk Queen": {
    abilities: [
      triggered(when.entersSelf, [fx.rad(ref.target("p"), 2)], {
        targets: [target.player("p")],
        label: "Le joueur ciblé reçoit deux marqueurs de radiation",
      }),
      triggered(NONLAND_MILLED, [fx.draw(1), fx.addCounters(ref.self, 1)], {
        oncePerTurn: true,
        label: "Des cartes non-terrain sont meulées : piochez, puis un marqueur +1/+1",
      }),
    ],
  },
  // Garde {2} : lue dans le texte.
  "Nightkin Ambusher": {
    abilities: [
      triggered(when.entersSelf, [fx.rad(ref.target("p"), 4)], {
        targets: [target.player("p")],
        label: "Le joueur ciblé reçoit quatre marqueurs de radiation",
      }),
      // « Tant que le joueur défenseur a un marqueur de radiation » : celui qu'elle attaque, ou le contrôleur du
      // planeswalker attaqué (506.2) ; hors du combat, il n'y a pas de joueur défenseur.
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        {
          condition: cond.amountAtLeast(amount.maxOverPlayers(ref.defendingPlayer, amount.rad), 1),
          label: "Imblocable tant que le joueur défenseur a un marqueur de radiation",
        },
      ),
    ],
  },
  "Rampaging Yao Guai": {
    // Vigilance, piétinement : lus dans le texte.
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          {
            ...target.permanent(
              "t",
              ["Artifact", "Enchantment"],
              {},
              "artefacts et enchantements de valeur de mana totale X ou moins",
            ),
            count: 10,
            minCount: 0,
            maxTotalManaValueAmount: amount.sourceX,
          },
        ],
        label: "Détruisez des artefacts et enchantements de valeur de mana totale X ou moins",
      }),
    ],
  },
  // Vol, menace : lus dans le texte.
  "Screeching Scorchbeast": {
    abilities: [
      triggered(when.attacksSelf, [fx.rad(ref.eachPlayer, 2)], { label: "Chaque joueur reçoit deux marqueurs de radiation" }),
      triggered(
        NONLAND_MILLED,
        [
          ...fx.mayForStore(
            ref.you,
            "Créer autant de Zombies Mutants 2/2 ?",
            "z",
            fx.createTokens(ZOMBIE_MUTANT, amount.eventAmount),
          ),
          ...fx.when(cond.v("z"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "Des cartes non-terrain sont meulées : autant de Zombies Mutants (une fois par tour)" },
      ),
    ],
  },
  "Tato Farmer": {
    abilities: [
      triggered(when.landfall, fx.may("Recevoir deux marqueurs de radiation ?", fx.rad(ref.you, 2)), {
        label: "Accalmie : vous pouvez recevoir deux marqueurs de radiation",
      }),
      activated({
        tap: true,
        targets: [
          target.cardInGraveyard("t", { types: ["Land"], milledThisTurn: true }, "any", "carte de terrain meulée ce tour-ci"),
        ],
        effects: [fx.toBattlefield(ref.target(), { tapped: true, underYourControl: true })],
        label: "Un terrain meulé ce tour-ci arrive engagé sous votre contrôle",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Vexing Radgull": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.maxOverPlayers(ref.eventPlayer, amount.rad), 1)),
            fx.rad(ref.eventPlayer, 2),
          ),
          ...fx.when(cond.amountAtLeast(amount.maxOverPlayers(ref.eventPlayer, amount.rad), 1), fx.proliferate()),
        ],
        { label: "Deux marqueurs de radiation s'il n'en a pas, sinon proliférez" },
      ),
    ],
  },
  "Watchful Radstag": {
    abilities: [evolveThen([fx.copyToken(ref.self)])],
  },
  "Winding Constrictor": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] },
        modify: { add: 1 },
        label: "Un marqueur de plus sur vos artefacts et créatures",
      }),
    ],
  },
  // Menace : lue dans le texte.
  "Young Deathclaws": {
    abilities: [
      // Approximation : récupération d'une carte de créature de votre cimetière pour {4} (et non pour son coût de mana).
      activated({
        mana: "{4}",
        sorcerySpeed: true,
        exileFromGraveyard: { filter: { types: ["Creature"] } },
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), amount.powerOf(ref.costExiled))],
        label: "Récupération : exilez une carte de créature de votre cimetière, autant de marqueurs que sa force",
      }),
    ],
  },

  // --- Artefacts et enchantements -----------------------------------------------------------------------------------
  "Branching Evolution": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { times: 2 },
        label: "Deux fois plus de marqueurs +1/+1 sur vos créatures",
      }),
    ],
  },
  "Contagion Clasp": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.creature()],
        label: "Un marqueur -1/-1",
      }),
      activated({ mana: "{4}", tap: true, effects: [fx.proliferate()], label: "Proliférez" }),
    ],
  },
  "Guardian Project": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU, token: false }), [fx.draw(1)], {
        condition: cond.all(
          cond.not(
            cond.amountAtLeast(amount.refCount(ref.filtered(ref.sameNameOnBattlefield(ref.eventObject), CREATURE_YOU)), 2),
          ),
          cond.not(cond.amountAtLeast(amount.refCount(ref.sameNameInGraveyard(ref.eventObject)), 1)),
        ),
        label: "Une créature non-jeton au nom nouveau arrive : piochez une carte",
      }),
    ],
  },
  "Nuka-Nuke Launcher": {
    // Équiper {3} : lu dans le texte.
    abilities: [
      // Approximation : l'intimidation se lit « ne peut être bloquée que par des créatures-artefacts » (sans la couleur).
      staticAbility(
        "attached",
        {
          power: 3,
          addBlockRules: [{ cantBeBlockedBy: { notTypes: ["Artifact"] }, label: "Intimidation" }],
        },
        { label: "+3/+0 et l'intimidation" },
      ),
      // Approximation : jusqu'à votre prochain tour, chaque adversaire (pas seulement le joueur défenseur).
      triggered(
        { on: "attacks", who: { attachedToSource: true } },
        [
          fx.emblem(
            "Nuka-Nuke",
            "Whenever an opponent casts a spell, that player gets two rad counters.",
            [triggered(when.castSpell("opponent"), [fx.rad(ref.eventPlayer, 2)], { label: "Deux marqueurs de radiation" })],
            true,
          ),
        ],
        { label: "Jusqu'à votre prochain tour, chaque sort adverse donne deux marqueurs de radiation" },
      ),
    ],
  },
  "Power Fist": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      staticAbility(
        "attached",
        {
          addKeywords: ["trample"],
          addAbilities: [
            triggered(when.combatDamageToPlayer, [fx.addCounters(ref.self, amount.eventAmount)], {
              label: "Autant de marqueurs +1/+1",
            }),
          ],
        },
        { label: "Piétinement ; blesse un joueur : autant de marqueurs +1/+1" },
      ),
    ],
  },
  // Vol, Équipage 2 : lus dans le texte.
  "Recon Craft Theta": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ALIEN, 1, undefined, "a"), fx.addCounters(ref.stored("a"), 1)], {
        label: "Un Extraterrestre 0/0 avec un marqueur +1/+1",
      }),
      triggered(when.attacksSelf, [fx.proliferate()], { label: "Proliférez" }),
    ],
  },
  "Strength Bobblehead": {
    abilities: [
      manaAbility(ANY_COLOR),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), amount.count({ subtype: "Bobblehead", controller: "you" }))],
        label: "X marqueurs +1/+1 (X : vos Figurines)",
      }),
    ],
  },
  "Struggle for Project Purity": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Brotherhood", "Enclave"] })],
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachOpponent), fx.draw(amount.refCount(ref.eachOpponent))], {
        condition: cond.chosenMode("Brotherhood"),
        label: "Confrérie : chaque adversaire pioche ; vous piochez autant",
      }),
      triggered(when.opponentAttacksYouWith(1), [fx.rad(ref.eventPlayer, amount.plus(amount.eventAmount, amount.eventAmount))], {
        condition: cond.chosenMode("Enclave"),
        label: "Enclave : l'attaquant reçoit deux marqueurs de radiation par attaquant",
      }),
    ],
  },
  "Vault 12: The Necropolis": {
    abilities: [
      chapter([1], [fx.rad(ref.eachPlayer, 3)], { label: "Chaque joueur reçoit trois marqueurs de radiation" }),
      chapter([2], [fx.createTokens(ZOMBIE_MUTANT, amount.sumOverPlayers(ref.eachPlayer, amount.rad))], {
        label: "Un Zombie Mutant 2/2 par marqueur de radiation parmi les joueurs",
      }),
      chapter([3], [fx.addCountersAll(ZOMBIE_OR_MUTANT_YOU, 2)], { label: "Deux marqueurs +1/+1 sur vos Zombies et Mutants" }),
    ],
  },
  "Vault 87: Forced Evolution": {
    abilities: [
      chapter([1], [fx.gainControlWhileSource(ref.target())], {
        targets: [{ ...target.creature("t", { notSubtype: "Mutant" }), label: "créature non-Mutant" }],
        label: "Gagnez le contrôle d'une créature non-Mutant tant que vous contrôlez cette Saga",
      }),
      chapter([2], [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addSubtypes: ["Mutant"] }, "permanent")], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Un marqueur +1/+1 ; elle devient un Mutant",
      }),
      chapter([3], [fx.draw(amount.maxPower({ ...CREATURE_YOU, subtype: "Mutant" }))], {
        label: "Piochez autant que la plus grande force parmi vos Mutants",
      }),
    ],
  },

  // --- Éphémères et rituels -----------------------------------------------------------------------------------------
  Atomize: {
    spell: spell([target.nonland()], [fx.destroy(ref.target()), fx.proliferate()]),
  },
  "Biomass Mutation": {
    spell: spell([], [fx.setBasePTAll(CREATURE_YOU, amount.x)]),
  },
  "Casualties of War": {
    spell: escalate(
      "{0}",
      {
        label: "Détruisez un artefact",
        targets: [target.permanent("a", ["Artifact"], {}, "artefact")],
        effects: [fx.destroy(ref.target("a"))],
      },
      { label: "Détruisez une créature", targets: [target.creature("c")], effects: [fx.destroy(ref.target("c"))] },
      {
        label: "Détruisez un enchantement",
        targets: [target.permanent("e", ["Enchantment"], {}, "enchantement")],
        effects: [fx.destroy(ref.target("e"))],
      },
      {
        label: "Détruisez un terrain",
        targets: [target.permanent("l", ["Land"], {}, "terrain")],
        effects: [fx.destroy(ref.target("l"))],
      },
      {
        label: "Détruisez un planeswalker",
        targets: [target.permanent("w", ["Planeswalker"], {}, "planeswalker")],
        effects: [fx.destroy(ref.target("w"))],
      },
    ),
  },
  "Contaminated Drink": {
    spell: spell([], [fx.draw(amount.x), fx.rad(ref.you, { kind: "div", of: amount.plus(amount.x, 1), by: 2 })]),
  },
  Find: {
    spell: spell(
      [
        {
          ...target.cardInGraveyard("f", { types: ["Creature"] }, "you", "cartes de créature de votre cimetière"),
          count: 2,
          minCount: 0,
        },
      ],
      [fx.toHand(ref.target("f"))],
    ),
  },
  // « Vous pouvez mettre deux marqueurs +1/+1 sur une créature que vous contrôlez » : choisie à la résolution, sans cibler.
  Finality: {
    spell: spell(
      [],
      [
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "c", {
          optional: true,
          prompt: "Vous pouvez choisir une créature que vous contrôlez : elle reçoit deux marqueurs +1/+1",
        }),
        fx.addCounters(ref.stored("c"), 2),
        fx.pumpAll({ types: ["Creature"] }, -4, -4),
      ],
    ),
  },
  "Mutational Advantage": {
    spell: spell(
      [],
      [
        // « Ces permanents » : ceux qui ont des marqueurs à la résolution, avec les blessures prévenues jusqu'à la fin du
        // tour (même s'ils perdent leurs marqueurs ; pas ceux qui en reçoivent ensuite). La prévention est un effet sur
        // ces objets (615), pas une capacité accordée : un effet qui fait perdre les capacités ne la retire pas.
        fx.modifyAll({ permanent: true, controller: "you", withCounter: "any" }, { addKeywords: ["hexproof", "indestructible"] }),
        fx.preventDamageThisTurn(ref.permanentsOf(ref.you, { withCounter: "any" })),
        fx.proliferate(),
      ],
    ),
  },
  "Nuclear Fallout": {
    spell: spell(
      [],
      [
        fx.pumpAll(
          { types: ["Creature"] },
          amount.neg(amount.plus(amount.x, amount.x)),
          amount.neg(amount.plus(amount.x, amount.x)),
        ),
        fx.rad(ref.eachPlayer, amount.x),
      ],
    ),
  },
  Putrefy: {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [{ op: "destroy", what: ref.target(), noRegenerate: true }],
    ),
  },
  // Déluge : lu dans le texte.
  Radstorm: { spell: spell([], [fx.proliferate()]) },
  "Rampant Growth": {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]),
  },

  // --- Terrains -----------------------------------------------------------------------------------------------------
  // Approximation : il arrive toujours dégagé, sans marqueurs de radiation.
  "Mariposa Military Base": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        tap: true,
        reduction: { generic: amount.rad },
        effects: [fx.draw(1)],
        label: "Piochez une carte ({1} de moins par marqueur de radiation)",
      }),
    ],
  },
  "Mortuary Mire": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(
        when.entersSelf,
        fx.may(
          "Mettre une carte de créature de votre cimetière au-dessus de votre bibliothèque ?",
          fx.moveTo(ref.target(), { to: "libraryTop" }),
        ),
        {
          targets: [
            target.upTo(1, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")),
          ],
          label: "Une carte de créature de votre cimetière au-dessus de votre bibliothèque",
        },
      ),
      manaAbility("B"),
    ],
  },
};
