/** Duskmourn — cartes multicolores, artefacts et terrains. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  eerie,
  entersWith,
  fastLand,
  fx,
  GREMLIN,
  glimmer,
  INSECT,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  survival,
  target,
  triggered,
  when,
} from "./common";

/** Verge : « {T} : ajoutez [A] » ; « {T} : ajoutez [B]. N'activez que si vous contrôlez un [type] ou un [type] ». */
const verge = (a: ManaType, b: ManaType, types: [string, string]): CardScript => ({
  abilities: [
    manaAbility(a),
    manaAbility(b, 1, { condition: cond.controls({ anyOf: [{ subtype: types[0] }, { subtype: types[1] }] }) }),
  ],
});

const SMALL_CREATURES = { ...CREATURE_YOU_CONTROL, maxPower: 2 };

export const MULTI: Record<string, CardScript> = {
  "Arabella, Abandoned Doll": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.damage(amount.count(SMALL_CREATURES), ref.eachOpponent), fx.gainLife(amount.count(SMALL_CREATURES))],
        { label: "X blessures à chaque adversaire, +X PV" },
      ),
    ],
  },
  "Baseball Bat": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-la à une créature",
      }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.attacks({ attached: "host" }), [fx.tap(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Engagez une créature",
      }),
    ],
  },
  Broodspinner: {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" }),
      activated({
        mana: "{4}{B}{G}",
        tap: true,
        sacrifice: true,
        effects: [fx.createTokens(INSECT, amount.cardTypesInGraveyard)],
        label: "Insectes 1/1 volants (un par type de carte au cimetière)",
      }),
    ],
  },
  "Drag to the Roots": {
    costReduction: { generic: 2, condition: cond.delirium },
    spell: spell([target.nonland()], [fx.destroy(ref.target())]),
  },
  "Fear of Infinity": {
    keywords: ["cantBlock"],
    abilities: [
      eerie([...fx.may("Renvoyer Fear of Infinity dans votre main ?", fx.toHand(ref.selfCard))], {
        fromGraveyard: true,
        label: "Revient du cimetière en main",
      }),
    ],
  },
  "Gremlin Tamer": {
    abilities: [eerie([fx.createTokens(GREMLIN)], { label: "Jeton Diablotin 1/1" })],
  },
  "Intruding Soulrager": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Room" } },
        effects: [fx.damage(2, ref.eachOpponent), fx.draw(1)],
        label: "Sacrifiez une Salle : 2 blessures à chaque adversaire, piochez",
      }),
    ],
  },
  "The Jolly Balloon Man": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [
          fx.copyToken(ref.target(), {
            pt: 1,
            addColors: ["R"],
            addSubtypes: ["Balloon"],
            addKeywords: ["flying", "haste"],
            sacrificeAtEndStep: true,
          }),
        ],
        label: "Copie Ballon 1/1 volante",
      }),
    ],
  },
  "Midnight Mayhem": {
    spell: spell(
      [],
      [fx.createTokens(GREMLIN, 3), fx.pumpAll({ subtype: "Gremlin", controller: "you" }, 0, 0, ["menace", "lifelink", "haste"])],
    ),
  },
  "Peer Past the Veil": {
    spell: spell([], [fx.discard(amount.cardsIn("hand")), fx.draw(amount.cardTypesInGraveyard)]),
  },
  "Restricted Office": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.destroyAll({ types: ["Creature"], minPower: 3 })], {
        label: "Détruisez les créatures de force 3 ou plus",
      }),
    ],
  },
  "Lecture Hall": {
    abilities: [
      staticAbility(
        { controller: "you", other: true },
        { addKeywords: ["hexproof"] },
        { label: "Vos autres permanents ont la défense talismanique" },
      ),
    ],
  },
  "Rite of the Moth": {
    flashback: "{3}{W}{W}{B}",
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "finality", n: 1 } })],
    ),
  },
  "Roaring Furnace": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.damage(amount.cardsIn("hand"), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Blessures égales au nombre de cartes en main",
      }),
    ],
  },
  "Steaming Sauna": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "Pas de taille de main maximale" }),
      triggered(when.yourEndStep, [fx.draw(1)], { label: "Piochez une carte" }),
    ],
  },
  "Shrewd Storyteller": {
    abilities: [survival([fx.addCounters(ref.target(), 1)], { targets: [target.creature()], label: "Marqueur +1/+1" })],
  },
  Shroudstomper: {
    abilities: [
      triggered(when.entersSelf, [...fx.drain(2), fx.draw(1)], { label: "Drain de 2, piochez" }),
      triggered(when.attacksSelf, [...fx.drain(2), fx.draw(1)], { label: "Drain de 2, piochez" }),
    ],
  },
  "Skullsnap Nuisance": { abilities: [eerie([fx.surveil(1)], { label: "Surveillance 1" })] },
  "The Swarmweaver": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(INSECT, 2)], { label: "Deux Insectes 1/1 volants" }),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, anySubtype: ["Insect", "Spider"] },
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        { condition: cond.delirium, label: "Délire — Insectes et Araignées +1/+1, contact mortel" },
      ),
    ],
  },
  "Wildfire Wickerfolk": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["trample"] },
        {
          condition: cond.delirium,
          label: "Délire — +1/+1 et le piétinement",
        },
      ),
    ],
  },

  // Artefacts
  "Attack-in-the-Box": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.may(
            "+4/+0 (sacrifiée à la prochaine étape de fin) ?",
            fx.pump(ref.self, 4, 0),
            fx.delayed([fx.sacrificeIt(ref.self)]),
          ),
        ],
        { label: "+4/+0, puis sacrifiée" },
      ),
    ],
  },
  "Bear Trap": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(3, ref.target())],
        label: "3 blessures à une créature",
      }),
    ],
  },
  "Friendly Teddy": {
    abilities: [triggered(when.diesSelf, [fx.draw(1, ref.eachPlayer)], { label: "Chaque joueur pioche" })],
  },
  Glimmerlight: {
    abilities: [
      triggered(when.entersSelf, [glimmer()], { label: "Jeton Lueur 1/1" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Malevolent Chandelier": {
    abilities: [
      activated({
        mana: "{2}",
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Une carte d'un cimetière sous sa bibliothèque",
      }),
    ],
  },

  // Terrains
  "Abandoned Campground": fastLand("W", "U"),
  "Bleeding Woods": fastLand("R", "G"),
  "Etched Cornfield": fastLand("G", "W"),
  "Lakeside Shack": fastLand("G", "U"),
  "Murky Sewer": fastLand("U", "B"),
  "Neglected Manor": fastLand("W", "B"),
  "Peculiar Lighthouse": fastLand("U", "R"),
  "Raucous Carnival": fastLand("R", "W"),
  "Razortrap Gorge": fastLand("B", "R"),
  "Strangled Cemetery": fastLand("B", "G"),
  "Blazemire Verge": verge("B", "R", ["Swamp", "Mountain"]),
  "Floodfarm Verge": verge("W", "U", ["Plains", "Island"]),
  "Gloomlake Verge": verge("U", "B", ["Island", "Swamp"]),
  "Hushwood Verge": verge("G", "W", ["Forest", "Plains"]),
  "Thornspire Verge": verge("R", "G", ["Mountain", "Forest"]),
  "Valgavoth's Lair": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [entersWith({ tapped: true }), manaAbility(["W", "U", "B", "R", "G"], 1, { produceChosen: true })],
  },
};
