/** Tarkir: Dragonstorm — cartes multicolores (sauf légendaires et cartes uniques, dans legends.ts). */
import type { Effect } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  DRAGON,
  ELEPHANT_5,
  entersWith,
  flurry,
  fx,
  GOBLIN,
  mode,
  playerStatic,
  ref,
  renew,
  SPIRIT_W,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** « Copiez le prochain sort que vous lancez ce tour-ci quand vous le lancez » (Flamehold Grappler). */
const COPY_NEXT_SPELL: Effect = { op: "playerEffect", ability: { nextSpell: { copy: true } }, once: true };

export const MULTI: Record<string, CardScript> = {
  "Auroral Procession": { spell: spell([target.cardInGraveyard()], [fx.toHand(ref.target())]) },
  "Awaken the Honored Dead": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], { targets: [target.nonland()], label: "Détruisez un permanent non-terrain" }),
      chapter([2], [fx.mill(3)], { label: "Meulez trois cartes" }),
      chapter(
        [3],
        [
          fx.discard(1, ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
                  "you",
                  "carte de créature ou de terrain de votre cimetière",
                ),
              ],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        { label: "Défaussez une carte : une créature ou un terrain revient en main" },
      ),
    ],
  },
  "Bone-Cairn Butcher": {
    // Mobilisation 2 : lue dans le texte.
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, attacking: true, controller: "you" },
        { addKeywords: ["deathtouch"] },
        { label: "Vos jetons attaquants ont le contact mortel" },
      ),
    ],
  },
  "Death Begets Life": {
    spell: spell(
      [],
      [fx.destroyAll({ anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }] }, "d"), fx.draw(amount.v("d"))],
    ),
  },
  "Defibrillating Current": {
    spell: spell([target.creatureOrPlaneswalker()], [fx.damage(4, ref.target()), fx.gainLife(2)]),
  },
  "Dragonback Assault": {
    abilities: [
      triggered(when.entersSelf, [fx.damageAll(3, { types: ["Creature", "Planeswalker"] })], {
        label: "3 blessures à chaque créature et chaque planeswalker",
      }),
      triggered(when.landfall, [fx.createTokens(DRAGON)], { label: "Toucheterre : un Dragon 4/4 volant" }),
    ],
  },
  "Dragonclaw Strike": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.optional(target.creature("b", { controller: "opponent" }))],
      [fx.doublePT(ref.target("a")), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Effortless Master": {
    abilities: [
      entersWith({
        counters: 2,
        condition: cond.castThisTurn(2),
        label: "Deux sorts lancés ce tour-ci : arrive avec deux marqueurs +1/+1",
      }),
    ],
  },
  "Fangkeeper's Familiar": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Gagnez 3 PV, surveillance 3", [], [fx.gainLife(3), fx.surveil(3)]),
        mode("Détruisez un enchantement", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
        mode(
          "Contrecarrez un sort de créature",
          [target.spell("s", { types: ["Creature"] }, "sort de créature")],
          [fx.counter(ref.target("s"))],
        ),
      ]),
    ],
  },
  "Flamehold Grappler": {
    abilities: [triggered(when.entersSelf, [COPY_NEXT_SPELL], { label: "Copiez le prochain sort lancé ce tour-ci" })],
  },
  "Glacial Dragonhunt": {
    spell: spell(
      [],
      [
        fx.draw(1),
        fx.discard(1, ref.you, { optional: true, store: "d", storeFilter: { notTypes: ["Land"] } }),
        ...fx.when(cond.v("d"), fx.reflexive([target.creature()], [fx.damage(3, ref.target())])),
      ],
    ),
  },
  "Gurmag Nightwatch": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(3, { count: 1, to: { to: "libraryTop" }, rest: "graveyard" })], {
        label: "Regardez trois cartes : une peut rester dessus, le reste au cimetière",
      }),
    ],
  },
  "Hardened Tactician": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un jeton : piochez une carte",
      }),
    ],
  },
  "Host of the Hereafter": {
    abilities: [
      entersWith({ counters: 2, label: "Arrive avec deux marqueurs +1/+1" }),
      // « s'il avait des marqueurs » : dans le filtre (dernières informations connues).
      triggered(when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "any" }), [fx.lkiCountersTo(ref.target())], {
        targets: [target.optional(target.creature("t", { controller: "you" }))],
        label: "Une de vos créatures à marqueurs meurt : ses marqueurs vont sur une de vos créatures",
      }),
    ],
  },
  "Jeskai Shrinekeeper": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.gainLife(1), fx.draw(1)], { label: "Gagnez 1 PV, piochez une carte" })],
  },
  "Karakyk Guardian": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.not(cond.sourceDealtDamage), label: "Défense talismanique tant qu'il n'a pas infligé de blessures" },
      ),
    ],
  },
  "Kin-Tree Severance": {
    spell: spell([targetObj("t", { minManaValue: 3 }, "permanent de valeur de mana 3 ou plus")], [fx.exile(ref.target())]),
  },
  "Kishla Skimmer": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.draw(1)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Une carte quitte votre cimetière pendant votre tour : piochez (une fois par tour)",
      }),
    ],
  },
  "Lie in Wait": {
    // Les blessures (égales à la force de la carte) sont infligées avant le retour en main : même résultat.
    spell: spell(
      [target.cardInGraveyard("c", { types: ["Creature"] }, "you", "carte de créature de votre cimetière"), target.creature("d")],
      [fx.damage(amount.powerOf(ref.target("c")), ref.target("d")), fx.toHand(ref.target("c"))],
    ),
  },
  "Lotuslight Dancers": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search({ colors: ["B"] }, { to: "graveyard" }),
          fx.search({ colors: ["G"] }, { to: "graveyard" }),
          fx.search({ colors: ["U"] }, { to: "graveyard" }),
        ],
        { label: "Une carte noire, une verte et une bleue au cimetière" },
      ),
    ],
  },
  "Mammoth Bellow": { spell: spell([], [fx.createTokens(ELEPHANT_5)]) },
  "Marshal of the Lost": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.pump(
            ref.target(),
            amount.count({ types: ["Creature"], attacking: true }),
            amount.count({ types: ["Creature"], attacking: true }),
          ),
        ],
        { targets: [target.creature()], label: "Une créature gagne +X/+X (X : les attaquants)" },
      ),
    ],
  },
  "Monastery Messenger": {
    abilities: [
      triggered(when.entersSelf, [fx.moveTo(ref.target(), { to: "libraryTop" })], {
        targets: [
          target.optional(
            target.cardInGraveyard("t", { notTypes: ["Land", "Creature"] }, "you", "carte non-créature non-terrain"),
          ),
        ],
        label: "Une carte non-créature non-terrain de votre cimetière sur votre bibliothèque",
      }),
    ],
  },
  Perennation: {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière")],
      [
        fx.moveTo(ref.target(), { to: "battlefield", counters: { kind: "hexproof", n: 1 } }, { name: "b" }),
        fx.counters(ref.stored("b"), "indestructible"),
      ],
    ),
  },
  "Rakshasa's Bargain": { spell: spell([], [fx.lookAtTop(4, { count: 2, rest: "graveyard", exact: true })]) },
  "Rediscover the Way": {
    abilities: [
      chapter([1, 2], [fx.lookAtTop(3, { count: 1, rest: "bottom", exact: true })], {
        label: "Regardez trois cartes : une en main",
      }),
      chapter(
        [3],
        [
          fx.emblem(
            "Rediscover the Way",
            "Whenever you cast a noncreature spell this turn, target creature you control gains double strike until end of turn.",
            [
              triggered(
                when.castSpell("you", { notTypes: ["Creature"] }),
                [fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })],
                {
                  targets: [target.creature("t", { controller: "you" })],
                  label: "Une de vos créatures gagne la double initiative",
                },
              ),
            ],
            false,
            true,
          ),
        ],
        { label: "Ce tour-ci, vos sorts non-créature donnent la double initiative" },
      ),
    ],
  },
  "Reigning Victor": {
    // Mobilisation 1 : lue dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 1, 0, ["indestructible"])], {
        targets: [target.creature()],
        label: "Une créature gagne +1/+0 et l'indestructibilité",
      }),
    ],
  },
  "Reputable Merchant": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1 sur une de vos créatures",
      }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1 sur une de vos créatures",
      }),
    ],
  },
  "Revival of the Ancestors": {
    abilities: [
      chapter([1], [fx.createTokens(SPIRIT_W, 3)], { label: "Trois Esprits 1/1" }),
      chapter([2], [fx.countersDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.creature("t", { controller: "you" }))],
        label: "Répartissez trois marqueurs +1/+1",
      }),
      chapter([3], [fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["trample", "lifelink"] })], {
        label: "Vos créatures gagnent le piétinement et le lien de vie",
      }),
    ],
  },
  "Riverwheel Sweep": {
    spell: spell(
      [target.creature()],
      [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 3), fx.impulse(2, "yourNextTurn")],
    ),
  },
  "Severance Priest": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.target(), { notTypes: ["Land"] }, false, undefined, true)], {
        targets: [target.player("t", "opponent")],
        label: "Exilez une carte non-terrain de la main d'un adversaire",
      }),
      triggered(
        when.leavesSelf,
        [
          {
            op: "createTokens",
            token: SPIRIT_W,
            count: 1,
            pt: amount.manaValueOf(ref.linked),
            for: ref.ownerOf(ref.linked),
          },
        ],
        { label: "Le propriétaire de la carte exilée crée un Esprit X/X" },
      ),
    ],
  },
  "Skirmish Rhino": {
    abilities: [triggered(when.entersSelf, fx.drain(2), { label: "Chaque adversaire perd 2 PV, vous en gagnez 2" })],
  },
  "Sonic Shrieker": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target()), fx.gainLife(2), fx.discard(1, ref.target())], {
        targets: [target.any()],
        label: "2 blessures, gagnez 2 PV ; un joueur blessé défausse une carte",
      }),
    ],
  },
  "Temur Battlecrier": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 0,
        genericAmount: amount.count({ types: ["Creature"], controller: "you", minPower: 4 }),
        condition: cond.yourTurn,
        label: "Pendant votre tour, vos sorts coûtent {1} de moins par créature de force 4 ou plus",
      },
    ],
  },
  "Temur Tawnyback": { abilities: [triggered(when.entersSelf, fx.loot(1), { label: "Piochez, puis défaussez" })] },
  "Thunder of Unity": {
    abilities: [
      chapter([1], [fx.draw(2), fx.loseLife(2)], { label: "Piochez deux cartes, perdez 2 PV" }),
      chapter(
        [2, 3],
        [
          fx.emblem(
            "Thunder of Unity",
            "Whenever a creature you control enters this turn, each opponent loses 1 life and you gain 1 life.",
            [
              triggered(when.enters(CREATURE_YOU_CONTROL), fx.drain(1), {
                label: "Chaque adversaire perd 1 PV, vous en gagnez 1",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "Ce tour-ci, vos créatures qui arrivent drainent 1 PV" },
      ),
    ],
  },
  "Yathan Roadwatcher": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4),
          fx.reflexive(
            [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins")],
            [fx.toBattlefield(ref.target())],
          ),
        ],
        { condition: cond.wasCast, label: "Meulez quatre cartes : une créature de VM 3 ou moins revient" },
      ),
    ],
  },

  // --- Lot B ------------------------------------------------------------------
  "Armament Dragon": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.creature("t", { controller: "you" }))],
        label: "Répartissez trois marqueurs +1/+1 entre vos créatures",
      }),
    ],
  },
  "Barrensteppe Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Abzan", "Mardu"] })],
    abilities: [
      triggered(when.yourEndStep, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)], {
        condition: cond.chosenMode("Abzan"),
        label: "Abzan — un marqueur +1/+1 sur chacune de vos créatures",
      }),
      triggered(when.yourEndStep, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })], {
        condition: cond.all(cond.chosenMode("Mardu"), cond.amountAtLeast(amount.yourCreaturesDiedThisTurn, 1)),
        label: "Mardu — une de vos créatures est morte ce tour-ci : chaque adversaire sacrifie une créature",
      }),
    ],
  },
  "Frostcliff Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Jeskai", "Temur"] })],
    abilities: [
      triggered(when.combatDamageBatch(CREATURE_YOU_CONTROL), [fx.draw(1)], {
        condition: cond.chosenMode("Jeskai"),
        label: "Jeskai — vos créatures blessent un joueur : piochez une carte",
      }),
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 1, addKeywords: ["trample", "haste"] },
        { condition: cond.chosenMode("Temur"), label: "Temur — vos créatures : +1/+0, piétinement et célérité" },
      ),
    ],
  },
  "Glacierwood Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Temur", "Sultai"] })],
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.mill(4, ref.target())], {
        targets: [target.player()],
        condition: cond.chosenMode("Temur"),
        label: "Temur — éphémère ou rituel : un joueur meule quatre cartes",
      }),
      playerStatic({
        playFrom: { zone: "graveyard", what: "lands" },
        condition: cond.chosenMode("Sultai"),
        label: "Sultai — vous pouvez jouer des terrains depuis votre cimetière",
      }),
    ],
  },
  "Hollowmurk Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Sultai", "Abzan"] })],
    abilities: [
      triggered(when.countersPut(CREATURE_YOU_CONTROL), [fx.draw(1)], {
        condition: cond.chosenMode("Sultai"),
        oncePerTurn: true,
        label: "Sultai — un marqueur est mis sur une de vos créatures : piochez (une fois par tour)",
      }),
      triggered(when.attackWith(1), [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["menace"] })], {
        targets: [target.creature("t", { attacking: true })],
        condition: cond.chosenMode("Abzan"),
        label: "Abzan — marqueur +1/+1 et menace sur une créature attaquante",
      }),
    ],
  },
  "Windcrag Siege": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Mardu", "Jeskai"] })],
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "attack" },
        condition: cond.chosenMode("Mardu"),
        label: "Mardu — une créature qui attaque déclenche vos capacités une fois de plus",
      }),
      triggered(
        when.yourUpkeep,
        [fx.createTokens(GOBLIN, 1, undefined, "g"), fx.modify(ref.stored("g"), { addKeywords: ["lifelink", "haste"] })],
        { condition: cond.chosenMode("Jeskai"), label: "Jeskai — un Gobelin 1/1 avec le lien de vie et la célérité ce tour-ci" },
      ),
    ],
  },
  "Cori Mountain Stalwart": {
    abilities: [flurry([fx.damage(2, ref.eachOpponent), fx.gainLife(2)], "2 blessures à chaque adversaire, gagnez 2 PV")],
  },
  "Kheru Goldkeeper": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.createTokens(TREASURE)], {
        condition: cond.yourTurn,
        batched: true,
        label: "Des cartes quittent votre cimetière pendant votre tour : un Trésor",
      }),
      renew(
        "{2}{B}{G}{U}",
        [target.creature()],
        [fx.addCounters(ref.target(), 2), fx.counters(ref.target(), "flying")],
        "deux marqueurs +1/+1 et un marqueur de vol",
      ),
    ],
  },
};
