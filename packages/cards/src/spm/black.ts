/**
 * Marvel's Spider-Man — cartes noires (lot A). Le flash, la menace, le contact mortel, le lien de vie, le vol, le
 * piétinement, la célérité, l'indestructible et le chaos (Mayhem) sont lus dans le texte.
 */
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  costReducer,
  entersWith,
  fx,
  ref,
  spell,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const VILLAIN_CARD = target.cardInGraveyard("t", { subtype: "Villain" }, "you", "carte de Méchant de votre cimetière");

export const BLACK: Record<string, CardScript> = {
  "Agent Venom": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", other: true, token: false }), [fx.draw(1), fx.loseLife(1)], {
        label: "Piochez une carte et perdez 1 PV",
      }),
    ],
  },
  "Common Crook": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Un jeton Trésor" })],
  },
  "The Death of Gwen Stacy": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], { targets: [target.creature()], label: "I — Détruit une créature" }),
      // « Chaque joueur peut défausser une carte. Chaque joueur qui ne le fait pas perd 3 PV. »
      chapter([2], [fx.punisher(ref.eachPlayer, 3, { discard: true })], {
        label: "II — Chaque joueur défausse une carte ou perd 3 PV",
      }),
      chapter([3], [fx.moveAll("graveyard", ref.target("p"), {}, { to: "exile" })], {
        targets: [target.upTo(4, target.player("p"))],
        label: "III — Exile les cimetières des joueurs ciblés",
      }),
    ],
  },
  "Eddie Brock": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 1 }, "you", "carte de créature de VM 1 ou moins"),
        ],
        label: "Renvoie une créature de VM 1 ou moins de votre cimetière",
      }),
      activated({ mana: "{3}{B}{R}{G}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "Venom, Lethal Protector": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          // X : la valeur de mana de la créature sacrifiée (dernières informations connues).
          ...fx.when(
            cond.v("s"),
            fx.draw(amount.manaValueOf(ref.stored("s"))),
            fx.pickFromZone(
              "hand",
              { permanent: true },
              { to: "battlefield" },
              {
                min: 0,
                maxManaValue: amount.manaValueOf(ref.stored("s")),
                prompt: "Un permanent de VM X ou moins de votre main",
              },
            ),
          ),
        ],
        { label: "Sacrifiez une autre créature : piochez X, puis un permanent de VM X ou moins de votre main" },
      ),
    ],
  },
  "Inner Demons Gangsters": {
    abilities: [
      activated({
        discard: 1,
        sorcerySpeed: true,
        effects: [fx.pump(ref.self, 1, 0, ["menace"])],
        label: "+1/+0 et la menace jusqu'à la fin du tour",
      }),
    ],
  },
  "Merciless Enforcers": {
    abilities: [
      activated({ mana: "{3}{B}", effects: [fx.damage(1, ref.eachOpponent)], label: "1 blessure à chaque adversaire" }),
    ],
  },
  "Morlun, Devourer of Spiders": {
    abilities: [
      entersWith({ counters: amount.x, label: "Arrive avec X marqueurs +1/+1" }),
      triggered(when.entersSelf, [fx.damage(amount.sourceX, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "X blessures à un adversaire",
      }),
    ],
  },
  "Parker Luck": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          // Chacun perd autant de PV que la VM de la carte révélée par l'autre, puis la met dans sa main.
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.target("b"))), ref.target("a")),
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.target("a"))), ref.target("b")),
          fx.toHand(ref.libraryTop(ref.target("a"))),
          fx.toHand(ref.libraryTop(ref.target("b"))),
        ],
        {
          targets: [
            { ...target.player("a"), label: "premier joueur" },
            { ...target.player("b"), label: "second joueur", otherThan: ["a"] },
          ],
          label: "Deux joueurs révèlent leur carte du dessus et perdent la VM de celle de l'autre",
        },
      ),
    ],
  },
  "Prison Break": {
    // Chaos {3}{B} : lu dans le texte.
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },
  "Risky Research": { spell: spell([], [fx.surveil(2), fx.draw(2), fx.loseLife(2)]) },
  "Scorpion, Seething Striker": {
    abilities: [
      triggered(when.yourEndStep, [fx.connive(ref.target())], {
        condition: cond.morbid,
        targets: [target.creature("t", { controller: "you" })],
        label: "Une créature morte ce tour-ci : une de vos créatures a la connivence",
      }),
    ],
  },
  "Scorpion's Sting": { spell: spell([target.creature()], [fx.pump(ref.target(), -3, -3)]) },
  "Spider-Man Noir": {
    abilities: [
      triggered(
        when.attacksAlone({ types: ["Creature"], controller: "you" }),
        [fx.addCounters(ref.eventObject, 1), fx.surveil(amount.countersOn(ref.eventObject, "any"))],
        { label: "Marqueur +1/+1 sur l'attaquant seul, puis surveillance X (ses marqueurs)" },
      ),
    ],
  },
  "The Spot's Portal": {
    spell: spell(
      [target.creature()],
      [
        fx.moveTo(ref.target(), { to: "libraryBottom" }),
        ...fx.when(cond.not(cond.controls({ subtype: "Villain" })), fx.loseLife(2)),
      ],
    ),
  },
  // Flash, vol, chaos {B} : lus dans le texte.
  "Swarm, Being of Bees": {},
  "Tombstone, Career Criminal": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [VILLAIN_CARD],
        label: "Renvoie un Méchant de votre cimetière en main",
      }),
      costReducer({ subtype: "Villain" }, 1, "Sorts de Méchant : {1} de moins"),
    ],
  },
  "Venom, Evil Unleashed": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 2), fx.pump(ref.target(), 0, 0, ["deathtouch"])],
        label: "Depuis le cimetière : deux marqueurs +1/+1 et le contact mortel",
      }),
    ],
  },
  "Venomized Cat": {
    abilities: [triggered(when.entersSelf, [fx.mill(2)], { label: "Meulez deux cartes" })],
  },
  "Venom's Hunger": {
    costReduction: { generic: 2, condition: cond.controls({ subtype: "Villain" }) },
    spell: spell([target.creature()], [fx.destroy(ref.target()), fx.gainLife(2)]),
  },
  "Villainous Wrath": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.loseLife(amount.refCount(ref.permanentsOf(ref.target(), { types: ["Creature"] })), ref.target()),
        fx.destroyAll({ types: ["Creature"] }),
      ],
    ),
  },
};
