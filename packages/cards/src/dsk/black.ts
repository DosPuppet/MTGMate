/** Duskmourn — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_OR_ENCHANTMENT,
  cond,
  DEMON_6,
  eerie,
  entersWith,
  fx,
  GLIMMER_CREATURE,
  HORROR_ENCHANTMENT,
  modal,
  mode,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

const creatureCard = (id = "t") =>
  target.cardInGraveyard(id, { types: ["Creature"] }, "you", "carte de créature de votre cimetière");

export const BLACK: Record<string, CardScript> = {
  "Appendage Amalgam": {
    abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveillance 1" })],
  },
  "Balemurk Leech": {
    abilities: [eerie([fx.loseLife(1, ref.eachOpponent)], { label: "Chaque adversaire perd 1 PV" })],
  },
  "Cackling Slasher": {
    abilities: [entersWith({ counters: 1, condition: cond.morbid, label: "Marqueur +1/+1 (une créature est morte)" })],
  },
  "Commune with Evil": {
    spell: spell([], [fx.lookAtTop(4, { count: 1, rest: "graveyard" }), fx.gainLife(3)]),
  },
  "Cracked Skull": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.target(), { chooser: "controller", filter: { nonland: true }, optional: true })],
        { targets: [target.player()], label: "Regardez sa main, il défausse une carte non-terrain" },
      ),
      triggered(when.attachedIsDealtDamage, [fx.destroy(ref.attached)], { label: "Détruisez la créature enchantée" }),
    ],
  },
  "Dashing Bloodsucker": {
    abilities: [eerie([fx.pump(ref.self, 2, 0, ["lifelink"])], { label: "+2/+0 et le lien de vie" })],
  },
  "Defiled Crypt": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.createTokens(HORROR_ENCHANTMENT)], {
        oncePerTurn: true,
        batched: true,
        label: "Jeton Horreur 2/2",
      }),
    ],
  },
  "Cadaver Lab": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.toHand(ref.target())], { targets: [creatureCard()], label: "Créature en main" }),
    ],
  },
  "Demonic Counsel": {
    spell: spell(
      [],
      [...fx.when(cond.delirium, fx.search({})), ...fx.when(cond.not(cond.delirium), fx.search({ subtype: "Demon" }))],
    ),
  },
  "Derelict Attic": {
    abilities: [triggered(when.unlockThisDoor, [fx.draw(2), fx.loseLife(2)], { label: "Piochez deux cartes, perdez 2 PV" })],
  },
  "Widow's Walk": {
    abilities: [
      triggered(when.attacksAlone({ types: ["Creature"], controller: "you" }), [fx.pump(ref.eventObject, 1, 0, ["deathtouch"])], {
        label: "+1/+0 et le contact mortel",
      }),
    ],
  },
  "Fanatic of the Harrowing": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        { label: "Chaque joueur défausse une carte" },
      ),
    ],
  },
  "Fear of Lost Teeth": {
    abilities: [
      triggered(when.diesSelf, [fx.damage(1, ref.target()), fx.gainLife(1)], {
        targets: [target.any()],
        label: "1 blessure, +1 PV",
      }),
    ],
  },
  "Fear of the Dark": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 0, 0, ["menace", "deathtouch"])], {
        condition: cond.not(cond.battlefieldCount({ ...GLIMMER_CREATURE, controller: "opponent" }, 1)),
        label: "La menace et le contact mortel",
      }),
    ],
  },
  "Final Vengeance": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ENCHANTMENT, count: 1 } },
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Funeral Room": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you" }), fx.drain(1), {
        label: "Chaque adversaire perd 1 PV, vous gagnez 1 PV",
      }),
    ],
  },
  "Awakening Hall": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.moveAll("graveyard", ref.you, { types: ["Creature"] }, { to: "battlefield" })], {
        label: "Toutes vos créatures du cimetière reviennent",
      }),
    ],
  },
  "Give In to Violence": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["lifelink"])]),
  },
  "Innocuous Rat": {
    abilities: [triggered(when.diesSelf, [fx.manifestDread], { label: "Manifestation effroyable" })],
  },
  "Live or Die": {
    spell: modal(
      mode("Renvoyez une créature sur le champ de bataille", [creatureCard()], [fx.toBattlefield(ref.target())]),
      mode("Détruisez une créature", [target.creature("d")], [fx.destroy(ref.target("d"))]),
    ),
  },
  "Popular Egotist": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_ENCHANTMENT, other: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, engagez-la",
      }),
      triggered(when.sacrifice({}), [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire perd 1 PV, vous gagnez 1 PV",
      }),
    ],
  },
  "Resurrected Cultist": {
    abilities: [
      activated({
        mana: "{2}{B}{B}",
        fromGraveyard: true,
        sorcerySpeed: true,
        activationCondition: cond.delirium,
        effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
        label: "Délire — Revient avec un marqueur de finalité",
      }),
    ],
  },
  "Unholy Annex": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.draw(1),
          ...fx.when(cond.controls({ subtype: "Demon" }), fx.drain(2)),
          ...fx.when(cond.not(cond.controls({ subtype: "Demon" })), fx.loseLife(2)),
        ],
        { label: "Piochez ; drain de 2 avec un Démon, sinon perdez 2 PV" },
      ),
    ],
  },
  "Ritual Chamber": {
    abilities: [triggered(when.unlockThisDoor, [fx.createTokens(DEMON_6)], { label: "Jeton Démon 6/6 volant" })],
  },
  "Unstoppable Slasher": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.loseLife(amount.halfLife(ref.eventPlayer), ref.eventPlayer)], {
        label: "Il perd la moitié de ses PV",
      }),
      triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true, counters: { kind: "stun", n: 2 } })], {
        condition: cond.not(
          cond.amountAtLeast(
            amount.plus(amount.lkiCounters("+1/+1"), amount.lkiCounters("-1/-1"), amount.lkiCounters("stun")),
            1,
          ),
        ),
        label: "Revient engagée avec deux marqueurs d'étourdissement",
      }),
    ],
  },
  "Valgavoth's Faithful": {
    abilities: [
      activated({
        mana: "{3}{B}",
        sacrifice: true,
        sorcerySpeed: true,
        targets: [creatureCard()],
        effects: [fx.toBattlefield(ref.target())],
        label: "Créature de votre cimetière sur le champ de bataille",
      }),
    ],
  },
  "Vile Mutilator": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ENCHANTMENT, count: 1 } },
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.eachOpponent, { types: ["Enchantment"], nontoken: true }),
          fx.sacrifice(ref.eachOpponent, { types: ["Creature"], nontoken: true }),
        ],
        { label: "Chaque adversaire sacrifie un enchantement et une créature" },
      ),
    ],
  },
  "Winter's Intervention": {
    spell: spell([target.creature()], [fx.damage(2, ref.target()), fx.gainLife(2)]),
  },
  "Withering Torment": {
    spell: spell(
      [target.permanent("t", ["Creature", "Enchantment"], {}, "créature ou enchantement")],
      [fx.destroy(ref.target()), fx.loseLife(2)],
    ),
  },
};
