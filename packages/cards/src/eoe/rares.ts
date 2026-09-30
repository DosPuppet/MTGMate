/**
 * Edge of Eternities, lot C : rares, mythiques et cartes uniques (mana dépensé, coûts d'activation réduits,
 * statiques de joueur, cartes exilées jouables, garde accordée).
 */
import type { Amount, CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  costReducer,
  entersWith,
  fx,
  LANDER,
  lander,
  manaAbility,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  ROBOT,
  ref,
  SLIVER,
  spell,
  staticAbility,
  TWO_TAPPED,
  target,
  triggered,
  triggeredModal,
  WITH_P1P1,
  wardAbility,
  when,
} from "./common";

const FIVE_COLORS = ["W", "U", "B", "R", "G"] as const;
/** Cartes que vous possédez en exil (Cosmogoyf). */
const OWNED_IN_EXILE: Amount = { kind: "count", filter: {}, zone: "exile" };
const KAVU_YOU: ObjectFilter = { subtype: "Kavu", controller: "you" };

export const RARES: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Starport Security": {
    abilities: [
      activated({
        mana: "{3}{W}",
        tap: true,
        targets: [target.creature("t", { other: true })],
        effects: [fx.tap(ref.target())],
        reduction: { generic: 2, condition: cond.controls(WITH_P1P1) },
        label: "Engagez une autre créature",
      }),
    ],
  },
  "Sunstar Chaplain": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: TWO_TAPPED,
        label: "Marqueur +1/+1",
      }),
      activated({
        mana: "{2}",
        removeCounterFrom: { filter: CREATURE_YOU_CONTROL, kind: "+1/+1" },
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
        effects: [fx.tap(ref.target())],
        label: "Engagez un artefact ou une créature",
      }),
    ],
  },
  "Astelli Reclaimer": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, notTypes: ["Creature", "Land"], maxManaValueManaSpent: true },
            "you",
            "carte de permanent non-créature non-terrain",
          ),
        ],
        label: "Renvoyez un permanent (VM ≤ mana dépensé)",
      }),
    ],
  },
  "Hardlight Containment": {
    enchant: { filter: { types: ["Artifact"], controller: "you" }, label: "artefact que vous contrôlez" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exilez une créature adverse",
      }),
      staticAbility("attached", { addAbilities: [wardAbility({ mana: cost("{1}") })] }, { label: "Garde {1}" }),
    ],
  },
  "Lightstall Inquisitor": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileFromOwnHand(ref.eachOpponent, "h"),
          fx.grantPlay(ref.stored("h"), { forever: true, forOwner: true, extraCost: 1, landsTapped: true }),
        ],
        { label: "Chaque adversaire exile une carte de sa main" },
      ),
    ],
  },

  // --- Bleu ------------------------------------------------------------------
  Unravel: {
    spell: spell(
      [target.spell("t")],
      [fx.when(cond.targetMatches("t", { manaSpentBelowValue: true }), fx.draw(1)), fx.counter(ref.target())],
    ),
  },
  "Emissary Escort": {
    // « +X/+0 » : modélisé par une force de base variable (0 + X), les marqueurs s'y ajoutent.
    cdaPower: amount.maxManaValue({ types: ["Artifact"], controller: "you", other: true }),
  },
  "Uthros Psionicist": {
    abilities: [
      costReducer({}, 2, "Le deuxième sort de chaque tour coûte {2} de moins", {
        condition: cond.castThisTurn(1, false, true),
      }),
    ],
  },
  "Starfield Vocalist": {
    abilities: [playerStatic({ triggerMod: { effect: "again", onEnter: true }, label: "Déclencheurs d'arrivée doublés" })],
  },
  "Quantum Riddler": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez" }),
      playerStatic({ drawPlusOneWhenHandSmall: true, label: "Une carte de plus avec une main de 1 carte ou moins" }),
    ],
  },
  "Mm'menon, the Right Hand": {
    abilities: [
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { types: ["Artifact"] }, what: "spells" },
        label: "Sorts d'artefact du dessus de la bibliothèque",
      }),
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        { addAbilities: [manaAbility("U", 1, { restriction: { spellNotFromHand: true } })] },
        { label: "Vos artefacts : « {T} : {U} » (sorts hors de la main)" },
      ),
    ],
  },
  "Steelswarm Operator": {
    abilities: [
      manaAbility("U", 1, { restriction: { spell: { types: ["Artifact"] } } }),
      manaAbility("U", 2, { restriction: { abilityOfSource: { types: ["Artifact"] } } }),
    ],
  },
  Weftwalking: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.moveAll("hand", ref.you, {}, { to: "libraryTop" }),
          fx.moveAll("graveyard", ref.you, {}, { to: "libraryTop" }),
          fx.shuffle(),
          fx.draw(7),
        ],
        { condition: cond.wasCast, label: "Main et cimetière mélangés, piochez sept cartes" },
      ),
      playerStatic({ firstSpellFree: true, label: "Premier sort de chaque tour gratuit" }),
    ],
  },

  // --- Noir ------------------------------------------------------------------
  "Alpharael, Stonechosen": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.loseLife(amount.halfLife(ref.controllerOf(ref.eventPlayer)), ref.controllerOf(ref.eventPlayer))],
        { condition: cond.void, label: "Vide : le défenseur perd la moitié de ses PV" },
      ),
    ],
  },
  "Requiem Monolith": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [
          fx.modify(ref.target(), {
            addAbilities: [
              triggered(when.isDealtDamage, [fx.draw(amount.eventAmount), fx.loseLife(amount.eventAmount)], {
                label: "Blessée : piochez autant, perdez autant de PV",
              }),
            ],
          }),
          fx.mayFor(ref.controllerOf(ref.target()), "1 blessure à la créature ?", fx.damage(1, ref.target())),
        ],
        label: "Blessures = pioche",
      }),
    ],
  },
  "Blade of the Swarm": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Deux marqueurs +1/+1", [], [fx.addCounters(ref.self, 2)]),
        mode(
          "Une carte exilée avec la distorsion au-dessous de la bibliothèque",
          [{ id: "t", label: "carte exilée avec la distorsion", filter: { exiled: { withWarp: true } } }],
          [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        ),
      ]),
    ],
  },

  // --- Rouge -----------------------------------------------------------------
  "Kav Landseeker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(LANDER, 1, undefined, "l"),
          fx.delayedAt("yourNextEndStep", [fx.sacrificeIt(ref.target("l"))], { l: ref.stored("l") }),
        ],
        { label: "Lander (sacrifié à votre prochain tour)" },
      ),
    ],
  },
  "Kavaron Harrier": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{2}",
          "Payer {2} pour un Robot attaquant ?",
          fx.createTappedTokens(ROBOT, 1, { attacking: true, store: "r" }),
          fx.delayedAt("endOfCombat", [fx.sacrificeIt(ref.target("r"))], { r: ref.stored("r") }),
        ),
        { label: "{2} : Robot 2/2 attaquant" },
      ),
    ],
  },
  "Terrapact Intimidator": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mayForStore(ref.target(), "Laisser l'adversaire créer deux Landers ?", "l", lander(2)),
          fx.when(cond.not(cond.v("l")), fx.addCounters(ref.self, 2)),
        ],
        { targets: [target.player("t", "opponent")], label: "Deux Landers ou deux marqueurs +1/+1" },
      ),
    ],
  },
  "Memorial Vault": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [
          fx.exileTop(ref.you, amount.plus(1, amount.manaValueOf(ref.costSacrificed)), "v"),
          fx.grantPlay(ref.stored("v")),
        ],
        label: "Exilez 1 + VM cartes, jouables ce tour-ci",
      }),
    ],
  },
  "Roving Actuator": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 2)], {
        targets: [
          target.upTo(
            1,
            target.cardInGraveyard("t", { types: ["Instant", "Sorcery"], maxManaValue: 2 }, "you", "éphémère ou rituel"),
          ),
        ],
        condition: cond.void,
        label: "Vide : copiez un éphémère ou rituel",
      }),
    ],
  },
  "Possibility Technician": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ self: true }, { ...KAVU_YOU, other: true }] }),
        [fx.exileTop(ref.you, 1, "p"), fx.grantPlay(ref.stored("p"), { forever: true, condition: cond.controls(KAVU_YOU) })],
        { label: "Exilez la carte du dessus (jouable avec un Kavu)" },
      ),
    ],
  },
  "Territorial Bruntar": {
    abilities: [
      triggered(when.landfall, [fx.exileUntil({ nonland: true }, "b"), fx.grantPlay(ref.stored("b"))], {
        label: "Exilez jusqu'à une carte non-terrain, lançable ce tour-ci",
      }),
    ],
  },
  "Tannuk, Steadfast Second": {
    abilities: [
      staticAbility(OTHER_CREATURE_YOU_CONTROL, { addKeywords: ["haste"] }, { label: "Célérité" }),
      playerStatic({
        grantWarp: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"], colors: ["R"] }] }, cost: cost("{2}{R}") },
        label: "Distorsion {2}{R}",
      }),
    ],
  },

  // --- Vert ------------------------------------------------------------------
  "Bioengineered Future": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      entersWith({
        counters: amount.landsEnteredThisTurn,
        affects: CREATURE_YOU_CONTROL,
        label: "Un marqueur +1/+1 par terrain arrivé ce tour-ci",
      }),
    ],
  },
  "Frenzied Baloth": {
    cantBeCountered: true,
    abilities: [
      playerStatic({
        protectCreatureSpells: true,
        combatDamageUnpreventable: true,
        label: "Sorts de créature incontrecarrables, blessures de combat imprévenables",
      }),
    ],
  },
  "Gene Pollinator": { abilities: [manaAbility([...FIVE_COLORS], 1, { tapAnother: true })] },
  "Icetill Explorer": {
    abilities: [
      playerStatic({
        extraLands: 1,
        playFrom: { zone: "graveyard", what: "lands" },
        label: "Terrain supplémentaire, depuis le cimetière",
      }),
      triggered(when.landfall, [fx.mill(1)], { label: "Meulez une carte" }),
    ],
  },
  Skystinger: {
    abilities: [
      triggered(when.blocks("self", { keyword: "flying" }), [fx.pump(ref.self, 5, 0)], {
        label: "Bloque une créature volante : +5/+0",
      }),
    ],
  },
  Terrasymbiosis: {
    abilities: [
      triggered(
        when.countersPut(CREATURE_YOU_CONTROL, "+1/+1"),
        fx.may("Piocher autant de cartes ?", fx.draw(amount.eventAmount)),
        { oncePerTurn: true, label: "Piochez autant de cartes" },
      ),
    ],
  },
  Cosmogoyf: { cdaPower: OWNED_IN_EXILE, cdaToughness: amount.plus(OWNED_IN_EXILE, 1) },

  // --- Multicolores ----------------------------------------------------------
  "Sami, Wildcat Captain": {
    abilities: [
      costReducer({}, 0, "Affinité pour les artefacts", {
        genericAmount: amount.count({ types: ["Artifact"], controller: "you" }),
      }),
    ],
  },
  "Syr Vondam, Sunstar Exemplar": {
    abilities: [
      triggered(when.diesOrExiled(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1), fx.gainLife(1)], {
        label: "Marqueur +1/+1, +1 PV",
      }),
      triggered(when.diesOrExiled("self", 4), [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.nonland("t"))],
        label: "Détruisez un permanent non-terrain",
      }),
    ],
  },
  "Tannuk, Memorial Ensign": {
    abilities: [
      triggered(
        when.landfall,
        [
          fx.damage(1, ref.eachOpponent),
          fx.countResolution("n"),
          fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1)),
        ],
        { label: "1 blessure à chaque adversaire (2e fois : piochez)" },
      ),
    ],
  },

  // --- Incolores et terrains -------------------------------------------------
  "Survey Mechan": {
    abilities: [
      activated({
        mana: "{10}",
        sacrifice: true,
        targets: [target.any("a"), target.player("p")],
        effects: [fx.damage(3, ref.target("a")), fx.draw(3, ref.target("p")), fx.gainLife(3, ref.target("p"))],
        reduction: { generic: amount.distinctNames({ types: ["Land"], controller: "you" }) },
        label: "3 blessures, piochez trois cartes, +3 PV",
      }),
    ],
  },
  "Thaumaton Torpedo": {
    abilities: [
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [target.nonland("t")],
        effects: [fx.destroy(ref.target())],
        reduction: { generic: 3, condition: cond.attackedWith("Spacecraft") },
        label: "Détruisez un permanent non-terrain",
      }),
    ],
  },
  "Thrumming Hivepool": {
    costReduction: { generic: amount.count({ subtype: "Sliver", controller: "you" }) },
    abilities: [
      staticAbility(
        { subtype: "Sliver", controller: "you" },
        { addKeywords: ["doubleStrike", "haste"] },
        { label: "Double initiative et célérité" },
      ),
      triggered(when.yourUpkeep, [fx.createTokens(SLIVER, 2)], { label: "Deux Slivers 1/1" }),
    ],
  },
  "The Endstone": {
    abilities: [
      triggered(when.playLand, [fx.draw(1)], { label: "Piochez" }),
      triggered(when.castSpell("you"), [fx.draw(1)], { label: "Piochez" }),
      triggered(when.yourEndStep, [fx.setLife(10)], { label: "Vos PV deviennent 10" }),
    ],
  },
  "Secluded Starforge": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        tapX: { types: ["Artifact"] },
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), amount.x, 0)],
        label: "+X/+0",
      }),
      activated({ mana: "{5}", tap: true, effects: [fx.createTokens(ROBOT)], label: "Robot 2/2" }),
    ],
  },
  "Command Bridge": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(when.entersSelf, [fx.tapOrSacrifice], { label: "Engagez un permanent ou sacrifiez-le" }),
      manaAbility([...FIVE_COLORS]),
    ],
  },
};
