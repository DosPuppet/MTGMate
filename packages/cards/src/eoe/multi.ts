/** Edge of Eternities — cartes multicolores, incolores et terrains. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_SPACECRAFT,
  CREATURE_YOU_CONTROL,
  cond,
  DRONE,
  fx,
  lander,
  manaAbility,
  OTHER_CREATURE_YOU_CONTROL,
  ROBOT,
  ref,
  spell,
  TWO_TAPPED,
  target,
  triggered,
  when,
} from "./common";

/** Terrains choc : la règle « payez 2 PV ou il arrive engagé » est lue dans le texte. */
const shock: CardScript = {};

export const MULTI: Record<string, CardScript> = {
  // --- Multicolores ----------------------------------------------------------
  "Biomechan Engineer": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      activated({ mana: "{8}", effects: [fx.draw(2), fx.createTokens(ROBOT)], label: "Piochez deux cartes, Robot 2/2" }),
    ],
  },
  "Biotech Specialist": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      triggered(when.sacrifice({ types: ["Artifact"] }), [fx.damage(2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "2 blessures",
      }),
    ],
  },
  "Genemorph Imago": {
    abilities: [
      triggered(
        when.landfall,
        [
          fx.when(cond.controls({ types: ["Land"] }, 6), fx.modify(ref.target(), { setPower: 6, setToughness: 6 })),
          fx.when(cond.not(cond.controls({ types: ["Land"] }, 6)), fx.modify(ref.target(), { setPower: 3, setToughness: 3 })),
        ],
        { targets: [target.creature("t")], label: "Landfall : F/E de base 3/3 (6/6)" },
      ),
    ],
  },
  "Haliya, Ascendant Cadet": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
      triggered(when.combatDamageBatch({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }), [fx.draw(1)], { label: "Piochez" }),
    ],
  },
  "Interceptor Mechan": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Artifact", "Creature"] }, "you", "carte d'artefact ou de créature")],
        label: "Reprenez une carte",
      }),
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: cond.void, label: "Vide : marqueur +1/+1" }),
    ],
  },
  "Mm'menon, Uthros Exile": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t")],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Pinnacle Emissary": {
    abilities: [triggered(when.castSpell("you", { types: ["Artifact"] }), [fx.createTokens(DRONE)], { label: "Drone 1/1" })],
  },
  "Sami, Ship's Engineer": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTappedTokens(ROBOT)], { condition: TWO_TAPPED, label: "Robot 2/2 engagé" }),
    ],
  },
  "Seedship Broodtender": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "Meulez trois cartes" }),
      activated({
        mana: "{3}{B}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", CREATURE_OR_SPACECRAFT, "you", "carte de créature ou de Vaisseau")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Renvoyez une créature ou un Vaisseau",
      }),
    ],
  },
  "Space-Time Anomaly": { spell: spell([target.player("t")], [fx.mill(amount.lifeTotal, ref.target())]) },
  "Station Monitor": {
    abilities: [triggered(when.castNthSpell(2), [fx.createTokens(DRONE)], { label: "Drone 1/1" })],
  },
  "Syr Vondam, the Lucent": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 1, 0, ["deathtouch"])], {
        label: "+1/+0 et le contact mortel",
      }),
      triggered(when.attacksSelf, [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 1, 0, ["deathtouch"])], {
        label: "+1/+0 et le contact mortel",
      }),
    ],
  },

  // --- Incolores -------------------------------------------------------------
  "All-Fates Scroll": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        effects: [fx.draw(amount.distinctNames({ types: ["Land"], controller: "you" }))],
        label: "Une carte par nom de terrain",
      }),
    ],
  },
  "Bygone Colossus": {},
  "Chrome Companion": {
    abilities: [
      triggered(when.tapsSelf, [fx.gainLife(1)], { label: "+1 PV" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Une carte d'un cimetière au-dessous de la bibliothèque",
      }),
    ],
  },
  "Dauntless Scrapbot": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.eachOpponent, {}, { to: "exile" }), lander()], {
        label: "Exilez les cimetières adverses, Lander",
      }),
    ],
  },
  "Nutrient Block": {
    abilities: [
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" }),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1)], { label: "Piochez" }),
    ],
  },
  "Virulent Silencer": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Artifact"], controller: "you", token: false, anyOf: [{ types: ["Creature"] }] }, true),
        [fx.poison(ref.eventPlayer, 2)],
        { label: "Deux marqueurs poison" },
      ),
    ],
  },

  // --- Terrains --------------------------------------------------------------
  "Breeding Pool": shock,
  "Godless Shrine": shock,
  "Sacred Foundry": shock,
  "Stomping Ground": shock,
  "Watery Grave": shock,
};
