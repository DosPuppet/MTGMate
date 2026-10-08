/** Tarkir: Dragonstorm — colorless artifacts and lands. */
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

/** Monuments: the sacrifice ability, as a sorcery. */
const monument = (mana: string, effects: Parameters<typeof activated>[0]["effects"], label: string) =>
  activated({ mana, tap: true, sacrifice: true, sorcerySpeed: true, effects, label });

export const ARTIFACTS: Record<string, CardScript> = {
  "Abzan Monument": {
    abilities: [
      monumentSearch(["Plains", "Swamp", "Forest"]),
      monument(
        "{1}{W}{B}{G}",
        [fx.createXXToken(SPIRIT_W, amount.maxToughness(CREATURE_YOU_CONTROL))],
        "An X/X Spirit (the greatest toughness among your creatures)",
      ),
    ],
  },
  "Jeskai Monument": {
    abilities: [
      monumentSearch(["Island", "Mountain", "Plains"]),
      monument("{1}{U}{R}{W}", [fx.createTokens(BIRD_W, 2)], "Two 1/1 flying Birds"),
    ],
  },
  "Mardu Monument": {
    abilities: [
      monumentSearch(["Mountain", "Plains", "Swamp"]),
      monument(
        "{2}{R}{W}{B}",
        [fx.createTokens(WARRIOR_R, 3, undefined, "w"), fx.modify(ref.stored("w"), { addKeywords: ["menace", "haste"] })],
        "Three 1/1 Warriors with menace and haste",
      ),
    ],
  },
  "Sultai Monument": {
    abilities: [
      monumentSearch(["Swamp", "Forest", "Island"]),
      monument("{2}{B}{G}{U}", [fx.createTokens(ZOMBIE_DRUID, 2)], "Two 2/2 Zombie Druids"),
    ],
  },
  "Temur Monument": {
    abilities: [
      monumentSearch(["Forest", "Island", "Mountain"]),
      monument("{3}{G}{U}{R}", [fx.createTokens(ELEPHANT_5)], "A 5/5 Elephant"),
    ],
  },
  "Boulderborn Dragon": {
    abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveil 1" })],
  },
  "Dragonstorm Globe": {
    abilities: [
      entersWith({
        affects: { subtype: "Dragon", controller: "you" },
        counters: 1,
        label: "Your Dragons enter with a +1/+1 counter",
      }),
      manaAbility([...ANY_COLOR]),
    ],
  },
  "Embermouth Sentinel": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "search for a basic land card?",
          fx.when(cond.controls(DRAGON_YOU), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
          fx.when(cond.not(cond.controls(DRAGON_YOU)), fx.search(BASIC_LAND, { to: "libraryTop" })),
        ),
        { label: "A basic land on top of your library (onto the battlefield tapped if you control a Dragon)" },
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
        label: "A card from a graveyard on the bottom of its owner's library",
      }),
    ],
  },
  "Mox Jasper": { abilities: [manaAbility([...ANY_COLOR], 1, { condition: cond.controls(DRAGON_YOU) })] },
  "Watcher of the Wayside": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2, ref.target()), fx.gainLife(2)], {
        targets: [target.player()],
        label: "A player mills two cards; you gain 2 life",
      }),
    ],
  },

  // --- Lands ------------------------------------------------------------------
  "Cori Mountain Monastery": {
    abilities: [
      entersTappedUnless(["Plains", "Island"]),
      manaAbility("R"),
      activated({
        mana: "{3}{R}",
        tap: true,
        effects: [fx.exileTop(ref.you, 1, "x"), fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true })],
        label: "Exile the top card, playable until the end of your next turn",
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
        label: "Exile a creature card from your graveyard: a 1/1 Spirit",
      }),
    ],
  },
  "Kishla Village": {
    abilities: [
      entersTappedUnless(["Island", "Swamp"]),
      manaAbility("G"),
      activated({ mana: "{3}{G}", tap: true, effects: [fx.surveil(2)], label: "Surveil 2" }),
    ],
  },
  "Frontier Bivouac": { abilities: triLand(["G", "U", "R"]) },
  "Mystic Monastery": { abilities: triLand(["U", "R", "W"]) },
  "Nomad Outpost": { abilities: triLand(["R", "W", "B"]) },
  "Opulent Palace": { abilities: triLand(["B", "G", "U"]) },
  "Sandsteppe Citadel": { abilities: triLand(["W", "B", "G"]) },
};
