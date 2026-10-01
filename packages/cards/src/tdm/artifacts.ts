/** Tarkir: Dragonstorm — artefacts incolores et terrains. */
import {
  activated,
  amount,
  BASIC_LAND,
  BIRD_W,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_YOU,
  ELEPHANT_5,
  entersTappedUnless,
  entersWith,
  fx,
  manaAbility,
  monumentSearch,
  ref,
  SPIRIT_W,
  target,
  triggered,
  triLand,
  WARRIOR_R,
  when,
  ZOMBIE_DRUID,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;

/** Monuments : la capacité sacrifiée, en rituel. */
const monument = (mana: string, effects: Parameters<typeof activated>[0]["effects"], label: string) =>
  activated({ mana, tap: true, sacrifice: true, sorcerySpeed: true, effects, label });

export const ARTIFACTS: Record<string, CardScript> = {
  "Abzan Monument": {
    abilities: [
      monumentSearch(["Plains", "Swamp", "Forest"]),
      monument(
        "{1}{W}{B}{G}",
        [fx.createXXToken(SPIRIT_W, amount.maxToughness(CREATURE_YOU_CONTROL))],
        "Un Esprit X/X (la plus grande endurance parmi vos créatures)",
      ),
    ],
  },
  "Jeskai Monument": {
    abilities: [
      monumentSearch(["Island", "Mountain", "Plains"]),
      monument("{1}{U}{R}{W}", [fx.createTokens(BIRD_W, 2)], "Deux Oiseaux 1/1 volants"),
    ],
  },
  "Mardu Monument": {
    abilities: [
      monumentSearch(["Mountain", "Plains", "Swamp"]),
      monument(
        "{2}{R}{W}{B}",
        [fx.createTokens(WARRIOR_R, 3, undefined, "w"), fx.modify(ref.stored("w"), { addKeywords: ["menace", "haste"] })],
        "Trois Guerriers 1/1 avec la menace et la célérité",
      ),
    ],
  },
  "Sultai Monument": {
    abilities: [
      monumentSearch(["Swamp", "Forest", "Island"]),
      monument("{2}{B}{G}{U}", [fx.createTokens(ZOMBIE_DRUID, 2)], "Deux Zombies Druides 2/2"),
    ],
  },
  "Temur Monument": {
    abilities: [
      monumentSearch(["Forest", "Island", "Mountain"]),
      monument("{3}{G}{U}{R}", [fx.createTokens(ELEPHANT_5)], "Un Éléphant 5/5"),
    ],
  },
  "Boulderborn Dragon": {
    abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
  },
  "Dragonstorm Globe": {
    abilities: [
      entersWith({
        affects: { subtype: "Dragon", controller: "you" },
        counters: 1,
        label: "Vos Dragons arrivent avec un marqueur +1/+1",
      }),
      manaAbility([...ANY_COLOR]),
    ],
  },
  "Embermouth Sentinel": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "chercher une carte de terrain de base ?",
          fx.when(cond.controls(DRAGON_YOU), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
          fx.when(cond.not(cond.controls(DRAGON_YOU)), fx.search(BASIC_LAND, { to: "libraryTop" })),
        ),
        { label: "Un terrain de base sur la bibliothèque (engagé en jeu si vous contrôlez un Dragon)" },
      ),
    ],
  },
  "Jade-Cast Sentinel": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Une carte d'un cimetière sous la bibliothèque de son propriétaire",
      }),
    ],
  },
  "Mox Jasper": { abilities: [manaAbility([...ANY_COLOR], 1, { condition: cond.controls(DRAGON_YOU) })] },
  "Watcher of the Wayside": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2, ref.target()), fx.gainLife(2)], {
        targets: [target.player()],
        label: "Un joueur meule deux cartes ; vous gagnez 2 PV",
      }),
    ],
  },

  // --- Terrains ---------------------------------------------------------------
  "Cori Mountain Monastery": {
    abilities: [
      entersTappedUnless(["Plains", "Island"]),
      manaAbility("R"),
      activated({
        mana: "{3}{R}",
        tap: true,
        effects: [fx.exileTop(ref.you, 1, "x"), fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true })],
        label: "Exilez la carte du dessus, jouable jusqu'à la fin de votre prochain tour",
      }),
    ],
  },
  "Great Arashin City": {
    abilities: [
      entersTappedUnless(["Forest", "Plains"]),
      manaAbility("B"),
      activated({
        mana: "{1}{B}",
        tap: true,
        exileFromGraveyard: { filter: { types: ["Creature"] } },
        effects: [fx.createTokens(SPIRIT_W)],
        label: "Exilez une carte de créature de votre cimetière : un Esprit 1/1",
      }),
    ],
  },
  "Kishla Village": {
    abilities: [
      entersTappedUnless(["Island", "Swamp"]),
      manaAbility("G"),
      activated({ mana: "{3}{G}", tap: true, effects: [fx.surveil(2)], label: "Surveillance 2" }),
    ],
  },
  "Frontier Bivouac": { abilities: triLand(["G", "U", "R"]) },
  "Mystic Monastery": { abilities: triLand(["U", "R", "W"]) },
  "Nomad Outpost": { abilities: triLand(["R", "W", "B"]) },
  "Opulent Palace": { abilities: triLand(["B", "G", "U"]) },
  "Sandsteppe Citadel": { abilities: triLand(["W", "B", "G"]) },
};
