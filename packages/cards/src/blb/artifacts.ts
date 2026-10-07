/** Bloomburrow — artefacts, terrains et cartes spéciales (n° 262 et au-delà). */
import type { ManaAbilityDef } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  cost,
  doesntUntap,
  FISH,
  FOOD,
  fx,
  kin,
  manaAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const ANY: ("W" | "U" | "B" | "R" | "G")[] = ["W", "U", "B", "R", "G"];

/** « {T} : ajoutez {C}. » et « {T} : ajoutez [couleur]. Ne dépensez ce mana que pour lancer un sort de créature. » */
const village = (color: "W" | "U" | "B" | "R" | "G") => [
  manaAbility("C"),
  manaAbility(color, 1, { restriction: { spell: { types: ["Creature"] } } }),
];

/** Capacité de mana avec un coût de mana en plus de {T} (Hidden Grotto, Three Tree City). */
const paidMana = (mana: string, opts: Partial<ManaAbilityDef> = {}): ManaAbilityDef => ({
  ...manaAbility(ANY),
  cost: { tap: true, mana: cost(mana) },
  ...opts,
});

export const ARTIFACTS: Record<string, CardScript> = {
  "Barkform Harvester": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "you", "carte de votre cimetière")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Met une carte du cimetière sous la bibliothèque",
      }),
    ],
  },
  "Bumbleflower's Sharepot": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Nourriture" }),
      activated({
        mana: "{5}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.nonland("t")],
        effects: [fx.destroy(ref.target())],
        label: "Détruit un permanent non-terrain",
      }),
    ],
  },
  "Fountainport Bell": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher un terrain de base (mis au-dessus) ?", fx.search(BASIC_LAND, { to: "libraryTop" })),
        {
          label: "Terrain de base au-dessus de la bibliothèque",
        },
      ),
      activated({ mana: "{1}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Heirloom Epic": {
    abilities: [
      activated({
        mana: "{4}",
        tap: true,
        sorcerySpeed: true,
        // Approximation : les créatures ne peuvent pas aider à payer ce coût.
        effects: [fx.draw(1)],
        label: "Piochez une carte",
      }),
    ],
  },
  "Patchwork Banner": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", subtypeChosen: true },
        { power: 1, toughness: 1 },
        { label: "+1/+1" },
      ),
      manaAbility(ANY),
    ],
  },
  "Short Bow": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["reach", "vigilance"] },
        { label: "+1/+1, portée, vigilance" },
      ),
    ],
  },
  "Starforged Sword": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        condition: cond.gift,
        targets: [target.creature("t", { controller: "you" })],
        label: "S'attache à une créature",
      }),
      staticAbility("attached", { power: 3, toughness: 3, removeKeywords: ["flying"] }, { label: "+3/+3, perd le vol" }),
    ],
  },
  "Tangle Tumbler": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Marqueur +1/+1",
      }),
      activated({
        tapOthers: { filter: { token: true }, count: 2 },
        effects: [fx.animateVehicle()],
        label: "Engagez deux jetons : devient une créature",
      }),
    ],
  },
  "Fabled Passage": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, undefined, "p"),
          ...fx.when(cond.controls({ types: ["Land"] }, 4), fx.untap(ref.stored("p"))),
        ],
        label: "Cherche un terrain de base",
      }),
    ],
  },
  Fountainport: {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un jeton : piochez",
      }),
      activated({ mana: "{3}", tap: true, payLife: 1, effects: [fx.createTokens(FISH)], label: "Poisson 1/1" }),
      activated({ mana: "{4}", tap: true, effects: [fx.createTokens(TREASURE)], label: "Trésor" }),
    ],
  },
  "Hidden Grotto": {
    abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }), manaAbility("C"), paidMana("{1}")],
  },
  "Lilypad Village": {
    abilities: [
      ...village("U"),
      activated({
        mana: "{U}",
        tap: true,
        activationCondition: cond.controls(kin(["Bird", "Frog", "Otter", "Rat"], { enteredThisTurn: true })),
        effects: [fx.surveil(2)],
        label: "Surveillance 2",
      }),
    ],
  },
  "Lupinflower Village": {
    abilities: [
      ...village("W"),
      activated({
        mana: "{1}{W}",
        tap: true,
        sacrifice: true,
        effects: [fx.lookAtTop(6, { filter: { types: ["Creature"], anySubtype: ["Bat", "Bird", "Mouse", "Rabbit"] } })],
        label: "Regarde six cartes : Chauve-souris, Oiseau, Souris ou Lapin",
      }),
    ],
  },
  "Mudflat Village": {
    abilities: [
      ...village("B"),
      activated({
        mana: "{1}{B}",
        tap: true,
        sacrifice: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], anySubtype: ["Bat", "Lizard", "Rat", "Squirrel"] },
            "you",
            "Chauve-souris, Lézard, Rat ou Écureuil",
          ),
        ],
        effects: [fx.toHand(ref.target())],
        label: "Récupère une carte",
      }),
    ],
  },
  "Oakhollow Village": {
    abilities: [
      ...village("G"),
      activated({
        mana: "{G}",
        tap: true,
        effects: [fx.addCountersAll(kin(["Frog", "Rabbit", "Raccoon", "Squirrel"], { enteredThisTurn: true }), 1)],
        label: "Marqueurs +1/+1 sur les nouveaux venus",
      }),
    ],
  },
  "Rockface Village": {
    abilities: [
      ...village("R"),
      activated({
        mana: "{R}",
        tap: true,
        sorcerySpeed: true,
        targets: [targetObj("t", kin(["Lizard", "Mouse", "Otter", "Raccoon"]), "Lézard, Souris, Loutre ou Raton laveur")],
        effects: [fx.pump(ref.target(), 1, 0, ["haste"])],
        label: "+1/+0 et célérité",
      }),
    ],
  },
  "Three Tree City": {
    chooseOnEnter: "creatureType",
    abilities: [
      manaAbility("C"),
      paidMana("{2}", { amountPer: { types: ["Creature"], controller: "you", subtypeChosen: true } }),
    ],
  },
  // Cartes spéciales (hors du set principal).
  "Serra Redeemer": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }),
        [fx.addCounters(ref.eventObject, 2)],
        { label: "Deux marqueurs +1/+1" },
      ),
    ],
  },
  "Charmed Sleep": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engage la créature" }), doesntUntap("attached")],
  },
  "Mind Spring": { spell: spell([], [fx.draw(amount.x)]) },
  "Thieving Otter": {
    abilities: [
      triggered(when.dealsDamage("self", { to: { players: "opponent" } }), [fx.draw(1)], { label: "Piochez une carte" }),
    ],
  },
  "Flame Lash": { spell: spell([target.any()], [fx.damage(4, ref.target())]) },
  Colossification: {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engage la créature" }),
      staticAbility("attached", { power: 20, toughness: 20 }, { label: "+20/+20" }),
    ],
  },
  "Rabid Bite": {
    spell: spell(
      [
        target.creature("t", { controller: "you" }),
        targetObj("u", { types: ["Creature"], controller: "opponent" }, "créature que vous ne contrôlez pas"),
      ],
      [fx.damage(amount.powerOf(ref.target()), ref.target("u"), ref.target())],
    ),
  },
  "Sword of Vengeance": {
    abilities: [
      staticAbility(
        "attached",
        { power: 2, addKeywords: ["firstStrike", "vigilance", "trample", "haste"] },
        { label: "+2/+0, initiative, vigilance, piétinement, célérité" },
      ),
    ],
  },
};
