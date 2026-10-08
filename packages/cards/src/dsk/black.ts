/** Duskmourn — black cards. */
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

const creatureCard = (id = "t") => target.cardInGraveyard(id, { types: ["Creature"] }, "you", "creature card in your graveyard");

export const BLACK: Record<string, CardScript> = {
  "Appendage Amalgam": {
    abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveil 1" })],
  },
  "Balemurk Leech": {
    abilities: [eerie([fx.loseLife(1, ref.eachOpponent)], { label: "Each opponent loses 1 life" })],
  },
  "Cackling Slasher": {
    abilities: [entersWith({ counters: 1, condition: cond.morbid, label: "+1/+1 counter (a creature died)" })],
  },
  "Commune with Evil": {
    spell: spell([], [fx.lookAtTop(4, { count: 1, rest: "graveyard" }), fx.gainLife(3)]),
  },
  "Cracked Skull": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] }, optional: true })],
        { targets: [target.player()], label: "Look at their hand, they discard a nonland card" },
      ),
      triggered(when.attachedIsDealtDamage, [fx.destroy(ref.attached)], { label: "Destroy the enchanted creature" }),
    ],
  },
  "Dashing Bloodsucker": {
    abilities: [eerie([fx.pump(ref.self, 2, 0, ["lifelink"])], { label: "+2/+0 and lifelink" })],
  },
  "Defiled Crypt": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.createTokens(HORROR_ENCHANTMENT)], {
        oncePerTurn: true,
        batched: true,
        label: "2/2 Horror token",
      }),
    ],
  },
  "Cadaver Lab": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.toHand(ref.target())], { targets: [creatureCard()], label: "Creature into your hand" }),
    ],
  },
  "Demonic Counsel": {
    spell: spell(
      [],
      [...fx.when(cond.delirium, fx.search({})), ...fx.when(cond.not(cond.delirium), fx.search({ subtype: "Demon" }))],
    ),
  },
  "Derelict Attic": {
    abilities: [triggered(when.unlockThisDoor, [fx.draw(2), fx.loseLife(2)], { label: "Draw two cards, lose 2 life" })],
  },
  "Widow's Walk": {
    abilities: [
      triggered(when.attacksAlone({ types: ["Creature"], controller: "you" }), [fx.pump(ref.eventObject, 1, 0, ["deathtouch"])], {
        label: "+1/+0 and deathtouch",
      }),
    ],
  },
  "Fanatic of the Harrowing": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        { label: "Each player discards a card" },
      ),
    ],
  },
  "Fear of Lost Teeth": {
    abilities: [
      triggered(when.diesSelf, [fx.damage(1, ref.target()), fx.gainLife(1)], {
        targets: [target.any()],
        label: "1 damage, +1 life",
      }),
    ],
  },
  "Fear of the Dark": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 0, 0, ["menace", "deathtouch"])], {
        condition: cond.not(cond.amountAtLeast(amount.refCount(ref.permanentsOf(ref.defendingPlayer, GLIMMER_CREATURE)), 1)),
        label: "Menace and deathtouch",
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
        label: "Each opponent loses 1 life, you gain 1 life",
      }),
    ],
  },
  "Awakening Hall": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.moveAll("graveyard", ref.you, { types: ["Creature"] }, { to: "battlefield" })], {
        label: "All creatures from your graveyard return",
      }),
    ],
  },
  "Give In to Violence": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["lifelink"])]),
  },
  "Innocuous Rat": {
    abilities: [triggered(when.diesSelf, [fx.manifestDread], { label: "Manifest dread" })],
  },
  "Live or Die": {
    spell: modal(
      mode("Return a creature to the battlefield", [creatureCard()], [fx.toBattlefield(ref.target())]),
      mode("Destroy a creature", [target.creature("d")], [fx.destroy(ref.target("d"))]),
    ),
  },
  "Popular Egotist": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_ENCHANTMENT, other: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, tap it",
      }),
      triggered(when.sacrifice({}), [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        label: "An opponent loses 1 life, you gain 1 life",
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
        label: "Delirium — Returns with a finality counter",
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
        { label: "Draw; drain 2 with a Demon, otherwise lose 2 life" },
      ),
    ],
  },
  "Ritual Chamber": {
    abilities: [triggered(when.unlockThisDoor, [fx.createTokens(DEMON_6)], { label: "6/6 flying Demon token" })],
  },
  "Unstoppable Slasher": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.loseLife(amount.halfLife(ref.eventPlayer), ref.eventPlayer)], {
        label: "They lose half their life",
      }),
      triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true, counters: { kind: "stun", n: 2 } })], {
        condition: cond.not(cond.amountAtLeast(amount.lkiCounters("any"), 1)),
        label: "Returns tapped with two stun counters",
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
        label: "Creature from your graveyard onto the battlefield",
      }),
    ],
  },
  "Vile Mutilator": {
    additionalCost: { sacrifice: { filter: CREATURE_OR_ENCHANTMENT, count: 1 } },
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.eachOpponent, { types: ["Enchantment"], token: false }),
          fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: false }),
        ],
        { label: "Each opponent sacrifices an enchantment and a creature" },
      ),
    ],
  },
  "Winter's Intervention": {
    spell: spell([target.creature()], [fx.damage(2, ref.target()), fx.gainLife(2)]),
  },
  "Withering Torment": {
    spell: spell(
      [target.permanent("t", ["Creature", "Enchantment"], {}, "creature or enchantment")],
      [fx.destroy(ref.target()), fx.loseLife(2)],
    ),
  },
};
