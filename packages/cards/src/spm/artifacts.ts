/** Marvel's Spider-Man — cartes incolores et terrains (lot A). */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  FOOD,
  fx,
  HUMAN_CITIZEN,
  manaAbility,
  ROBOT_FLYER,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Terrains bicolores « arrive engagé ; {T} : ajoutez {X} ou {Y} ; {4}, {T} : surveillance 1 ». */
const surveilLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    manaAbility([a, b]),
    activated({ mana: "{4}", tap: true, effects: [fx.surveil(1)], label: "Surveillance 1" }),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Artefacts ---------------------------------------------------------------
  "Bagel and Schmear": {
    abilities: [
      activated({
        mana: "{W}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.upTo(1, target.creature("t"))],
        effects: [fx.addCounters(ref.target(), 1), fx.draw(1)],
        label: "Partage : un marqueur +1/+1 sur jusqu'à une créature, piochez une carte",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.draw(1)],
        label: "Grignotage : vous gagnez 3 PV et piochez une carte",
      }),
    ],
  },
  "Doc Ock's Tentacles": {
    // Équiper {5} : lu dans le texte.
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", minManaValue: 5 }),
        fx.may("Attacher Doc Ock's Tentacles à cette créature ?", fx.attach(ref.eventObject)),
        { label: "Vous pouvez l'attacher à la créature de VM 5 ou plus" },
      ),
      staticAbility("attached", { power: 4, toughness: 4 }, { label: "+4/+4" }),
    ],
  },
  "Eerie Gravestone": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }),
      activated({
        mana: "{1}{B}",
        sacrifice: true,
        effects: [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), prompt: "Vous pouvez mettre en main une carte de créature meulée" },
          ),
        ],
        label: "Meulez quatre cartes, une carte de créature en main",
      }),
    ],
  },
  "Hot Dog Cart": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" }),
      manaAbility(["W", "U", "B", "R", "G"]),
    ],
  },
  "Living Brain, Mechanical Marvel": {
    abilities: [
      triggered(
        when.yourCombat,
        [fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 3, setToughness: 3 }), fx.untap(ref.target())],
        {
          targets: [
            target.permanent("t", ["Artifact"], { controller: "you", notSubtype: "Equipment" }, "artefact non-Équipement"),
          ],
          label: "Un de vos artefacts non-Équipement devient une créature 3/3 et se dégage",
        },
      ),
    ],
  },
  "Mechanical Mobster": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target("g")), fx.connive(ref.target("c"))], {
        targets: [target.upTo(1, target.cardInGraveyard("g", {}, "any")), target.creature("c", { controller: "you" })],
        label: "Exile jusqu'à une carte d'un cimetière ; une de vos créatures complote",
      }),
    ],
  },
  "News Helicopter": {
    // Vol : lu dans le texte.
    abilities: [triggered(when.entersSelf, [fx.createTokens(HUMAN_CITIZEN)], { label: "Un Citoyen humain 1/1" })],
  },
  "Passenger Ferry": {
    // Équipage 2 : lu dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{U}",
          "Payer {U} pour qu'une autre créature attaquante ciblée ne puisse pas être bloquée ce tour-ci ?",
          fx.reflexive(
            [{ ...target.creature("t", { attacking: true, other: true }), label: "autre créature attaquante" }],
            [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
          ),
        ),
        { label: "Payez {U} : une autre créature attaquante ne peut pas être bloquée" },
      ),
    ],
  },
  "Peter Parker's Camera": {
    abilities: [
      entersWith({ counters: 3, counterKind: "film", label: "Arrive avec trois marqueurs de pellicule" }),
      activated({
        mana: "{2}",
        tap: true,
        removeCounters: { kind: "film", n: 1 },
        targets: [
          {
            id: "t",
            label: "capacité activée ou déclenchée que vous contrôlez",
            filter: { stackItems: { abilitiesOnly: true, controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copiez une capacité activée ou déclenchée que vous contrôlez",
      }),
    ],
  },
  "Rocket-Powered Goblin Glider": {
    // Équiper {2} et chaos {2} : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        condition: cond.castFromGraveyard,
        targets: [target.creature("t", { controller: "you" })],
        label: "Lancé depuis le cimetière : attachez-le à une de vos créatures",
      }),
      staticAbility("attached", { power: 2, addKeywords: ["flying", "haste"] }, { label: "+2/+0, le vol et la célérité" }),
    ],
  },
  "Spider-Bot": {
    // Portée : lue dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher une carte de terrain de base à mettre au-dessus ?", fx.search(BASIC_LAND, { to: "libraryTop" })),
        { label: "Vous pouvez mettre un terrain de base au-dessus de votre bibliothèque" },
      ),
    ],
  },
  "Spider-Mobile": {
    // Piétinement et équipage 2 : lus dans le texte.
    abilities: [when.attacksSelf, when.blocks("self")].map((w) =>
      triggered(
        w,
        [
          fx.pump(
            ref.self,
            amount.count({ subtype: "Spider", controller: "you" }),
            amount.count({ subtype: "Spider", controller: "you" }),
          ),
        ],
        { label: "+1/+1 par Araignée que vous contrôlez" },
      ),
    ),
  },
  "Spider-Slayer, Hatred Honed": {
    abilities: [
      // Approximation : se déclenche quand une Araignée qu'il a déjà blessée ce tour-ci subit des blessures (le
      // déclencheur « inflige des blessures » ne désigne pas l'objet blessé).
      triggered(
        when.dealtDamage({ types: ["Creature"], subtype: "Spider", damagedBySource: true }),
        [fx.destroy(ref.eventObject)],
        { label: "Détruit l'Araignée qu'il a blessée" },
      ),
      activated({
        mana: "{6}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.createTappedTokens(ROBOT_FLYER, 2)],
        label: "Deux Robots volants 1/1 engagés",
      }),
    ],
  },
  "Spider-Suit": {
    // Équiper {3} : lu dans le texte.
    abilities: [
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addSubtypes: ["Spider", "Hero"] },
        { label: "+2/+2, Araignée Héros en plus de ses autres types" },
      ),
    ],
  },
  "Steel Wrecking Ball": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t")],
        label: "5 blessures à une créature",
      }),
      activated({
        mana: "{1}{R}",
        fromHand: true,
        discardSelf: true,
        targets: [target.permanent("t", ["Artifact"], {}, "artefact")],
        effects: [fx.destroy(ref.target())],
        label: "Défaussez-la : détruisez un artefact",
      }),
    ],
  },
  "Subway Train": {
    // Équipage 2 : lu dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{G}", "Payer {G} pour chercher une carte de terrain de base ?", fx.search(BASIC_LAND)),
        { label: "Payez {G} : un terrain de base en main" },
      ),
    ],
  },

  // --- Terrains ----------------------------------------------------------------
  "Daily Bugle Building": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [{ ...target.creature("t", { legendary: true }), label: "créature légendaire" }],
        effects: [fx.modify(ref.target(), { addKeywords: ["menace"] })],
        label: "Campagne de dénigrement : une créature légendaire gagne la menace",
      }),
    ],
  },
  "Ominous Asylum": surveilLand("B", "R"),
  "Savage Mansion": surveilLand("R", "G"),
  "Sinister Hideout": surveilLand("U", "B"),
  "Suburban Sanctuary": surveilLand("G", "W"),
  "University Campus": surveilLand("W", "U"),
  "Vibrant Cityscape": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Cherchez un terrain de base",
      }),
    ],
  },
};
