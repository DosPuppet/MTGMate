/** Lorwyn Eclipsed — cartes bleues. */
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  FAERIE_UB,
  fx,
  MERFOLK_WU,
  mode,
  protection,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURE = { filter: { types: ["Creature" as const] }, label: "créature" };

/** « Chaque fois que vous lancez un sort de valeur de mana 4 ou plus » (Kulrath Mystic, Tanufel Rimespeaker). */
const CAST_MV4 = when.castSpell("you", { minManaValue: 4 });

/**
 * « Retirez un marqueur (deux marqueurs) de cette créature » : ces créatures arrivent avec des marqueurs −1/−1 et le coût
 * est écrit avec cette sorte de marqueur (approximation : une autre sorte de marqueur ne peut pas servir à le payer).
 */
const removeMinus = (n: number) => ({ kind: "-1/-1", n });

/** « Jusqu'à la fin du tour, [la créature ciblée] a “chaque fois qu'elle inflige des blessures de combat à un joueur, piochez une carte” ». */
const grantCombatDraw = fx.modify(ref.target(), {
  addAbilities: [
    triggered(when.combatDamage("self", true), [fx.draw(1)], {
      label: "Blessures de combat à un joueur : piochez une carte",
    }),
  ],
});

/** « … gagne la protection contre chaque couleur jusqu'à votre prochain tour ». */
const protectionFromColors = fx.modify(
  ref.target(),
  {
    addProtections: [protection.from({ colors: ["W", "U", "B", "R", "G"] }, "Protection contre chaque couleur")],
  },
  "untilYourNextTurn",
);

/** « un Ondin que vous contrôlez » */
const MERFOLK_YOU = { subtype: "Merfolk", controller: "you" as const };

export const BLUE: Record<string, CardScript> = {
  // --- Auras -------------------------------------------------------------------
  "Aquitect's Defenses": {
    // Flash lu dans le texte.
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["hexproof"] })], {
        label: "La créature enchantée gagne la défense talismanique jusqu'à la fin du tour",
      }),
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    ],
  },
  "Lofty Dreams": {
    // Convocation lue dans le texte.
    enchant: CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["flying"] }, { label: "+2/+2 et le vol" }),
    ],
  },
  "Noggle the Mind": {
    enchant: CREATURE,
    abilities: [
      staticAbility(
        "attached",
        { loseAllAbilities: true, setColors: [], setSubtypes: ["Noggle"], setPower: 1, setToughness: 1 },
        { label: "Perd toutes ses capacités ; Noggle incolore 1/1" },
      ),
    ],
  },

  // --- Créatures ---------------------------------------------------------------
  "Champions of the Shoal": {
    // « En coût additionnel, contemplez un Ondin et exilez-le » : l'Ondin exilé est choisi automatiquement parmi ceux
    // que vous contrôlez (approximation : pas depuis la main), et lié à la créature (comme Fear of Abduction).
    additionalCost: { exile: { filter: { subtype: "Merfolk" }, count: 1 } },
    abilities: [
      ...[when.entersSelf, when.tapsSelf].map((trigger) =>
        triggered(trigger, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
          targets: [target.upTo(1, target.creature())],
          label: "Engagez jusqu'à une créature ; marqueur d'étourdissement",
        }),
      ),
      triggered(when.leavesSelf, [fx.toHand(ref.linked)], { label: "La carte exilée revient dans la main de son propriétaire" }),
    ],
  },
  "Disruptor of Currents": {
    // Flash et convocation lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }, "autre permanent non-terrain"))],
        label: "Renvoie jusqu'à un autre permanent non-terrain",
      }),
    ],
  },
  "Flitterwing Nuisance": {
    abilities: [
      entersWith({ counters: 1, counterKind: "-1/-1", label: "Arrive avec un marqueur -1/-1" }),
      activated({
        mana: "{2}{U}",
        removeCounters: removeMinus(1),
        effects: [
          // Capacité déclenchée retardée « ce tour-ci » : un emblème qui disparaît à la fin du tour.
          fx.emblem(
            "Flitterwing Nuisance",
            "Ce tour-ci, chaque fois qu'une créature que vous contrôlez inflige des blessures de combat à un joueur, piochez une carte.",
            [
              triggered(when.combatDamage({ types: ["Creature"], controller: "you" }, true), [fx.draw(1)], {
                label: "Blessures de combat à un joueur : piochez une carte",
              }),
            ],
            false,
            true,
          ),
        ],
        label: "Ce tour-ci, vos créatures qui blessent un joueur vous font piocher",
      }),
    ],
  },
  "Glamer Gifter": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { setPower: 4, setToughness: 4, allCreatureTypes: true })], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Une autre créature devient 4/4 de base et a tous les types de créature",
      }),
    ],
  },
  Glamermite: {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Engagez une créature", [target.creature()], [fx.tap(ref.target())]),
          mode("Dégagez une créature", [target.creature()], [fx.untap(ref.target())]),
        ],
        { label: "Engagez ou dégagez une créature" },
      ),
    ],
  },
  "Glen Elendra Guardian": {
    abilities: [
      entersWith({ counters: 1, counterKind: "-1/-1", label: "Arrive avec un marqueur -1/-1" }),
      activated({
        mana: "{1}{U}",
        removeCounters: removeMinus(1),
        targets: [target.spell("t", { notTypes: ["Creature"] }, "sort non-créature")],
        effects: [fx.counter(ref.target()), fx.draw(1, ref.controllerOf(ref.target()))],
        label: "Contrecarrez un sort non-créature ; son contrôleur pioche",
      }),
    ],
  },
  "Gravelgill Scoundrel": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.may(
            "engager une autre créature dégagée que vous contrôlez pour que cette créature ne puisse pas être bloquée ?",
            fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true, tapped: false }), ref.you, "tapped"),
            fx.tap(ref.stored("tapped")),
            ...fx.when(
              cond.amountAtLeast(amount.refCount(ref.stored("tapped")), 1),
              fx.modify(ref.self, { addKeywords: ["unblockable"] }),
            ),
          ),
        ],
        { label: "Engagez une autre créature : imblocable ce tour-ci" },
      ),
    ],
  },
  "Illusion Spinners": {
    flashIf: cond.controls({ subtype: "Faerie" }),
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.sourceMatches({ tapped: false }), label: "Défense talismanique tant qu'elle est dégagée" },
      ),
    ],
  },
  "Kulrath Mystic": {
    abilities: [
      triggered(CAST_MV4, [fx.pump(ref.self, 2, 0, ["vigilance"])], {
        label: "Sort de VM 4 ou plus : +2/+0 et la vigilance",
      }),
    ],
  },
  "Loch Mare": {
    abilities: [
      entersWith({ counters: 3, counterKind: "-1/-1", label: "Arrive avec trois marqueurs -1/-1" }),
      activated({ mana: "{1}{U}", removeCounters: removeMinus(1), effects: [fx.draw(1)], label: "Piochez une carte" }),
      activated({
        mana: "{2}{U}",
        removeCounters: removeMinus(2),
        targets: [target.creature()],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun")],
        label: "Engagez une créature ; marqueur d'étourdissement",
      }),
    ],
  },
  "Omni-Changeling": {
    // Changelin et convocation lus dans le texte.
    entersAsCopyOf: { types: ["Creature"] },
    entersAsCopyAnyController: true,
    entersAsCopyAddKeywords: ["changeling"],
  },
  "Pestered Wellguard": {
    abilities: [triggered(when.tapsSelf, [fx.createTokens(FAERIE_UB)], { label: "Engagée : jeton Faerie 1/1 avec le vol" })],
  },
  "Rimekin Recluse": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Renvoie jusqu'à une autre créature",
      }),
    ],
  },
  Shinestriker: {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.colorsAmong())], {
        label: "Vivid — piochez une carte par couleur parmi vos permanents",
      }),
    ],
  },
  "Silvergill Mentor": {
    // « Contemplez un Ondin ou payez {2} » : {2} de plus sans Ondin à contempler. La carte elle-même (un Ondin) est encore
    // dans la main quand le coût est calculé : il faut un Ondin en jeu, ou un autre Ondin en main.
    costReduction: {
      generic: -2,
      condition: cond.not(
        cond.any(cond.controls(MERFOLK_YOU), cond.amountAtLeast(amount.countIn("hand", { subtype: "Merfolk" }), 2)),
      ),
    },
    abilities: [triggered(when.entersSelf, [fx.createTokens(MERFOLK_WU)], { label: "Jeton Ondin 1/1" })],
  },
  "Silvergill Peddler": {
    abilities: [triggered(when.tapsSelf, fx.loot(1), { label: "Engagée : piochez une carte, puis défaussez-en une" })],
  },
  Stratosoarer: {
    // Recyclage de terrain de base lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["flying"] })], {
        targets: [target.creature()],
        label: "Une créature gagne le vol jusqu'à la fin du tour",
      }),
    ],
  },
  "Summit Sentinel": {
    abilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Piochez une carte" })],
  },
  "Tanufel Rimespeaker": {
    abilities: [triggered(CAST_MV4, [fx.draw(1)], { label: "Sort de VM 4 ou plus : piochez une carte" })],
  },
  "Unwelcome Sprite": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.surveil(2)], {
        label: "Sort pendant le tour d'un adversaire : surveillance 2",
      }),
    ],
  },
  "Wanderwine Distracter": {
    abilities: [
      triggered(when.tapsSelf, [fx.pump(ref.target(), -3, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagée : une créature adverse gagne -3/-0",
      }),
    ],
  },

  // --- Sygg (recto-verso) ----------------------------------------------------
  // « Chaque fois que cette créature se transforme en … » : écrit comme une capacité réflexe de la transformation
  // qu'elle déclenche elle-même (approximation : une transformation par un autre effet ne la déclenche pas).
  "Sygg, Wanderwine Wisdom": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.entersSelf, [grantCombatDraw], {
        targets: [target.creature()],
        label: "Une créature fait piocher quand elle blesse un joueur",
      }),
      triggered(
        when.step("main1", "you"),
        [
          ...fx.mayPay(
            "{W}",
            "payer {W} pour transformer Sygg ?",
            fx.transform(),
            fx.reflexive([target.creature("t", { controller: "you" })], [protectionFromColors]),
          ),
        ],
        { label: "Payez {W} : transformez Sygg" },
      ),
    ],
  },
  "Sygg, Wanderbrine Shield": {
    keywords: ["unblockable"],
    abilities: [
      triggered(
        when.step("main1", "you"),
        [
          ...fx.mayPay(
            "{U}",
            "payer {U} pour transformer Sygg ?",
            fx.transform(),
            fx.reflexive([target.creature()], [grantCombatDraw]),
          ),
        ],
        { label: "Payez {U} : transformez Sygg" },
      ),
    ],
  },

  // --- Éphémères et rituels ----------------------------------------------------
  Mirrorform: {
    spell: spell(
      [targetObj("t", { permanent: true, notSubtype: "Aura" }, "permanent non-Aura")],
      [fx.becomeCopy(ref.permanentsOf(ref.you, { nonland: true }), ref.target(), "permanent")],
    ),
  },
  "Rime Chill": {
    // Vivid : {1} de moins par couleur parmi vos permanents.
    costReduction: { generic: amount.colorsAmong() },
    spell: spell([target.upTo(2, target.creature())], [fx.tap(ref.target()), fx.counters(ref.target(), "stun"), fx.draw(1)]),
  },
  "Temporal Cleansing": {
    // Convocation lue dans le texte. Le choix est posé au contrôleur du permanent (approximation : son propriétaire).
    spell: spell(
      [target.nonland()],
      [
        ...fx.mayForStore(
          ref.controllerOf(ref.target()),
          "mettre ce permanent au-dessous de votre bibliothèque (sinon, en deuxième position depuis le dessus) ?",
          "bottom",
          fx.moveTo(ref.target(), { to: "libraryBottom" }),
        ),
        ...fx.when(cond.not(cond.v("bottom")), fx.moveTo(ref.target(), { to: "libraryTop", fromTop: 2 })),
      ],
    ),
  },
  "Thirst for Identity": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Creature"] } })]),
  },
  "Unexpected Assistance": { spell: spell([], [fx.draw(3), fx.discard(1)]) },
  "Wanderwine Farewell": {
    // Convocation lue dans le texte.
    spell: spell(
      [target.between(1, 2, target.nonland("t", {}, "permanent non-terrain"))],
      [
        fx.moveTo(ref.target(), { to: "hand" }, { name: "returned" }),
        ...fx.when(cond.controls(MERFOLK_YOU), fx.createTokens(MERFOLK_WU, amount.v("returned"))),
      ],
    ),
  },
};
