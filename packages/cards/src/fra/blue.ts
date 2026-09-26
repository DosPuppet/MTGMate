/** Reality Fracture — cartes bleues. */
import {
  ANGEL_3,
  activated,
  amount,
  type CardScript,
  cond,
  costReducer,
  entersWith,
  fx,
  modal,
  mode,
  PEER_REVIEW,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Cryotheory Adept": {
    abilities: [
      activated({
        mana: "{3}{U}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)],
        label: "Engager et étourdir",
      }),
    ],
  },
  "Divining Duelist": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Engager une créature", [target.creature("t")], [fx.tap(ref.target())]),
        mode("Dégager une créature", [target.creature("t")], [fx.untap(ref.target())]),
        mode("Piochez puis défaussez", [], fx.loot(1)),
      ]),
    ],
  },
  "Icy Reception": {
    spell: modal(
      mode(
        "Contrecarrer un sort de créature ou légendaire, sauf {3}",
        [target.spell("t", { anyOf: [{ types: ["Creature"] }, { legendary: true }] }, "sort de créature ou légendaire")],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{3}" }, fx.counter(ref.target())),
      ),
      mode("-5/-0", [target.creature("t")], [fx.pump(ref.target(), -5, 0)]),
    ),
  },
  "Perfected Theory": {
    spell: modal(
      mode("F/E de base 1/1", [target.creature("t")], [fx.modify(ref.target(), { setPower: 1, setToughness: 1 })]),
      mode("F/E de base 4/5", [target.creature("t")], [fx.modify(ref.target(), { setPower: 4, setToughness: 5 })]),
    ),
  },
  "Precise Redaction": {
    spell: spell([target.spell("t", { colors: ["W", "B"] }, "sort blanc ou noir")], [fx.counter(ref.target())]),
  },
  "Surveillance Phantasm": {
    abilities: [
      staticAbility(
        "self",
        { removeKeywords: ["defender"] },
        {
          condition: cond.scried,
          label: "Peut attaquer (regard ou surveillance ce tour-ci)",
        },
      ),
      activated({ mana: "{3}{U}", effects: [fx.surveil(1)], label: "Surveillance 1" }),
    ],
  },
  "Arni, Humble Scribe": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, nontoken: true }), [fx.untap(ref.self)], {
        label: "se dégage",
      }),
      activated({ tap: true, effects: fx.loot(1), label: "Piochez puis défaussez" }),
    ],
  },
  "Geist of Saint Thalia": {
    abilities: [costReducer({ notTypes: ["Creature"] }, 1, "Sorts non-créature : {1} de moins")],
  },
  "Hapatra, the Desert Frost": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "engage et étourdit",
      }),
      activated({ mana: "{2}{U}", targets: [target.creature("t")], effects: [fx.untap(ref.target())], label: "Dégager" }),
    ],
  },
  "Lyra, Tolarian Archangel": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(ANGEL_3)], {
        condition: cond.drewAtLeast(3),
        label: "3 cartes piochées : Ange 3/3",
      }),
      activated({
        mana: "{3}{U}{U}",
        effects: [
          fx.modify(ref.self, {
            addAbilities: [triggered(when.combatDamageToPlayer, [fx.draw(2)], { label: "piochez deux cartes" })],
          }),
        ],
        label: "Blessures de combat : piochez deux cartes",
      }),
    ],
  },
  "Proft, Consulting Detective": {
    abilities: [
      triggered(
        when.scryOrSurveil,
        fx.mayPay("{2}", "Payer {2} : marqueur +1/+1 et piochez une carte ?", fx.addCounters(ref.self, 1), fx.draw(1)),
        { label: "regard/surveillance" },
      ),
    ],
  },
  "Ruric Thar, Biomagus": {
    abilities: [
      // « Prouesse, prouesse » : le second exemplaire (le premier est lu dans le texte).
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 1, 1)], { label: "Prouesse" }),
      triggered({ on: "becomesTarget", who: "self", byOpponent: true }, [fx.draw(1)], { label: "ciblée : piochez" }),
    ],
  },
  "Tetsuko Umezawa, Fugitive": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] },
        { addKeywords: ["unblockable"] },
        { label: "Imblocable (force ou endurance 1 ou moins)" },
      ),
    ],
  },
  "Traxos, Academy Guardian": { costReduction: { generic: 2, condition: cond.castThisTurn(1, true) } },
  "Yuriko, Hope from the Shadows": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("-X/-0", [target.creature("t")], [fx.pump(ref.target(), amount.neg(amount.cardsIn("graveyard")), 0)]),
        mode("Surveillance 2", [], [fx.surveil(2)]),
      ]),
    ],
  },
  "Undulating Witness": {
    abilities: [activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, -1)], label: "+1/-1" })],
  },
  "Samut, Tyrant of Naktamun": {
    abilities: [playerStatic({ splitSecondInstantsSorceries: true, label: "Vos éphémères et rituels ont le second partagé" })],
  },
  "Diviner of Victory": {
    prepareSpell: spell(
      [target.creature("t", { controller: "opponent", maxManaValue: 3 })],
      [fx.bounce(ref.target()), fx.surveil(1)],
    ),
    abilities: [entersWith({ prepared: true }), triggered(when.scryOrSurveil, [fx.pump(ref.self, 1, 1)], { label: "+1/+1" })],
  },
  "Infinite Coursework": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached), fx.prepare(ref.attached, false)], {
        label: "engage et dé-prépare la créature",
      }),
      staticAbility(
        "attached",
        { loseAllAbilities: true, addKeywords: ["doesntUntap"] },
        {
          label: "Perd toutes ses capacités, ne se dégage pas",
        },
      ),
    ],
  },
  "Semester Foreseer": {
    prepareSpell: PEER_REVIEW,
    abilities: [entersWith({ prepared: true }), triggered(when.entersSelf, [fx.surveil(1)], { label: "surveillance 1" })],
  },
};
