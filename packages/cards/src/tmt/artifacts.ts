/** Teenage Mutant Ninja Turtles — cartes incolores et terrains (lot A). */
import type { ManaType, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  MUTANT,
  manaAbility,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/** Autres créatures-artefacts que vous contrôlez. */
const OTHER_ARTIFACT_CREATURES: ObjectFilter = {
  types: ["Artifact"],
  anyOf: [{ types: ["Creature"] }],
  controller: "you",
  other: true,
};

/** Ninja ou Tortue. */
const NINJA_OR_TURTLE: ObjectFilter = { anySubtype: ["Ninja", "Turtle"] };

/** Terrains bicolores « arrive engagé ; en arrivant, vous gagnez 1 PV ». */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "Vous gagnez 1 PV" }),
    manaAbility([a, b]),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Artefacts ---------------------------------------------------------------
  "Chrome Dome": {
    abilities: [
      staticAbility(OTHER_ARTIFACT_CREATURES, { power: 1 }, { label: "Vos autres créatures-artefacts : +1/+0" }),
      activated({
        mana: "{5}",
        targets: [target.permanent("t", ["Artifact"], { controller: "you", other: true }, "autre artefact que vous contrôlez")],
        effects: [fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "Un jeton copie d'un autre de vos artefacts, avec la célérité, sacrifié à la fin du tour",
      }),
    ],
  },
  "Everything Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Cherchez une carte de terrain de base" }),
      activated({
        mana: "{2}{W}{U}{B}{R}{G}",
        tap: true,
        sacrifice: true,
        targets: [target.player("p"), target.any("d"), target.upTo(1, target.creature("c"))],
        effects: [
          fx.gainLife(3, ref.target("p")),
          fx.draw(1, ref.target("p")),
          fx.discard(1, ref.eachOpponent),
          fx.damage(3, ref.target("d")),
          fx.addCounters(ref.target("c"), 3),
        ],
        label: "3 PV et une carte, défausse adverse, 3 blessures, trois marqueurs +1/+1",
      }),
    ],
  },
  Henchbots: {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", tapped: true })],
        label: "Exilez une créature adverse engagée jusqu'à ce que les Henchbots partent",
      }),
    ],
  },
  "Krang, Utrom Warlord": {
    // Vol, piétinement, indestructible et célérité : lus dans le texte.
    abilities: [
      staticAbility(
        OTHER_ARTIFACT_CREATURES,
        { addKeywords: ["flying", "trample", "indestructible", "haste"] },
        { label: "Vos autres créatures-artefacts : vol, piétinement, indestructible, célérité" },
      ),
    ],
  },
  "Omni-Cheese Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      // Capacité de mana (605.3b) : sans cible, elle ajoute du mana.
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.addManaChoice(1)],
        label: "Un mana de n'importe quelle couleur",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Vous gagnez 3 PV" }),
    ],
  },
  Technodrome: {
    // Portée et piétinement : lus dans le texte.
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        { condition: cond.not(cond.sourceMatches({ minPower: 6 })), label: "N'attaque ni ne bloque sous 6 de force" },
      ),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.draw(1), fx.addCounters(ref.self, 1)],
        label: "Piochez une carte et un marqueur +1/+1",
      }),
    ],
  },
  "Turtle Blimp": {
    // Vol et équipage 2 : lus dans le texte.
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTANT)], { label: "Un Mutant 2/2" })],
  },
  "Turtle Van": {
    // Équipage 1 : lu dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCounters(ref.target(), 1),
          fx.when(cond.refMatches(ref.target(), { anySubtype: ["Mutant", "Ninja", "Turtle"] }), fx.doubleCounters(ref.target())),
        ],
        {
          targets: [{ ...target.creature("t", { crewedSource: true }), label: "créature qui l'a pilotée ce tour-ci" }],
          label: "Un marqueur +1/+1 sur une créature qui l'a pilotée (doublés si Mutant, Ninja ou Tortue)",
        },
      ),
    ],
  },
  "Weather Maker": {
    abilities: [
      triggered(when.landfall, [fx.counters(ref.self, "charge")], { label: "Champ de bataille : un marqueur charge" }),
      manaAbility(ANY_COLOR),
      activated({
        tap: true,
        removeCounters: { kind: "charge", n: 2 },
        effects: [fx.addMana("C", "C")],
        label: "Retirez deux marqueurs charge : {C}{C}",
      }),
      activated({
        tap: true,
        removeCounters: { kind: "charge", n: 3 },
        targets: [target.any()],
        effects: [fx.damage(3, ref.target())],
        label: "Retirez trois marqueurs charge : 3 blessures",
      }),
    ],
  },

  // --- Terrains ----------------------------------------------------------------
  "Dimension X": gainLand("R", "W"),
  "Foot Headquarters": gainLand("W", "B"),
  "Illegitimate Business": gainLand("B", "G"),
  "Mutant Town": gainLand("G", "U"),
  "Northampton Farm": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { owner: "you" })],
        effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
        label: "Exilez une créature que vous possédez",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [
          fx.chooseAmong(ref.filtered(ref.linked, { types: ["Creature"] }), ref.you, "c", { anyZone: true }),
          fx.toBattlefield(ref.stored("c"), { underYourControl: true }),
          // Les autres cartes exilées avec ce terrain (la créature choisie a déjà changé de zone).
          fx.toHand(ref.linked),
        ],
        label: "Une créature exilée revient sous votre contrôle, les autres cartes en main",
      }),
    ],
  },
  "TCRI Building": gainLand("U", "R"),
  "Turtle Lair": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: NINJA_OR_TURTLE } }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature("t", NINJA_OR_TURTLE)],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Un Ninja ou une Tortue ne peut pas être bloqué ce tour-ci",
      }),
    ],
  },
};
