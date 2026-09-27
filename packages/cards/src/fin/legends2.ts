/** Final Fantasy — légendaires et cartes uniques (lot D2). */
import type { CardScript, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  cond,
  FROG,
  fx,
  HERO,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TOWN,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const PERMANENT_CARD = {
  anyOf: (["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"] as const).map((t) => ({ types: [t] })),
};
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };
const ALL_COLORS_ELEMENTAL: TokenSpec = {
  name: "Elemental",
  colors: ["W", "U", "B", "R", "G"],
  types: ["Creature"],
  subtypes: ["Elemental"],
  power: 2,
  toughness: 2,
};

export const LEGENDS2: Record<string, CardScript> = {
  "Summon: Bahamut": {
    abilities: [
      chapter([1, 2], [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.nonland("t"))],
        label: "Détruisez jusqu'à un permanent non-terrain",
      }),
      chapter([3], [fx.draw(2)], { label: "Piochez deux cartes" }),
      chapter([4], [fx.damage(amount.totalManaValue({ permanent: true, controller: "you", other: true }), ref.eachOpponent)], {
        label: "Mégaflare",
      }),
    ],
  },
  "Cloud, Midgar Mercenary": {
    doubleTriggersWhenEquipped: true,
    abilities: [triggered(when.entersSelf, [fx.search({ subtype: "Equipment" })], { label: "Cherchez un Équipement" })],
  },
  "The Lunar Whale": {
    // Approximation : « vous pouvez regarder la carte du dessus à tout moment » n'est pas affiché.
    abilities: [
      playerStatic({
        playTopCard: true,
        condition: cond.sourceMatches({ attackedThisTurn: true }),
        label: "Jouez la carte du dessus (a attaqué ce tour-ci)",
      }),
    ],
  },
  "Quistis Trepe": {
    abilities: [
      // Approximation : le sort se lance après la résolution, à tout moment ce tour-ci (comme Etali).
      triggered(when.entersSelf, [fx.grantPlay(ref.target(), { anyMana: true, anyTime: true, exileAfter: true })], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "any", "carte d'éphémère ou de rituel")],
        label: "Magie bleue : lancez un sort d'un cimetière",
      }),
    ],
  },
  "Ardyn, the Usurper": {
    abilities: [
      staticAbility(
        { ...YOURS, subtype: "Demon" },
        { addKeywords: ["menace", "lifelink", "haste"] },
        { label: "Vos Démons : menace, lien de vie, célérité" },
      ),
      triggered(
        when.yourCombat,
        [
          fx.exileCard(ref.target(), { name: "a" }),
          fx.copyToken(ref.stored("a"), { pt: 5, setColors: ["B"], setSubtypes: ["Demon"] }),
        ],
        {
          targets: [target.upTo(1, target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature"))],
          label: "Fléau stellaire",
        },
      ),
    ],
  },
  "Zodiark, Umbral God": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachPlayer, { types: ["Creature"], notSubtype: "God" }, 1, { half: true })], {
        label: "Chaque joueur sacrifie la moitié de ses créatures",
      }),
      triggered(when.sacrifice({ types: ["Creature"], other: true }, true), [fx.addCounters(ref.self, 1)], {
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Vayne's Treachery": {
    kicker: "{0}",
    kickerCost: { sacrifice: CREATURE_OR_ARTIFACT },
    spell: spell([target.creature("t")], [fx.pump(ref.target(), amount.kicked(-6, -2), amount.kicked(-6, -2))]),
  },
  "Chocobo Kick": {
    kicker: "{0}",
    kickerCost: { bounce: { types: ["Land"] } },
    spell: spell(
      [target.creature("s", { controller: "you" }), target.creature("t", { controller: "opponent" })],
      [
        fx.when(cond.not(cond.kicked), fx.damage(amount.powerOf(ref.target("s")), ref.target("t"), ref.target("s"))),
        fx.when(
          cond.kicked,
          fx.damage(
            amount.plus(amount.powerOf(ref.target("s")), amount.powerOf(ref.target("s"))),
            ref.target("t"),
            ref.target("s"),
          ),
        ),
      ],
    ),
  },
  "Seifer Almasy": {
    abilities: [
      triggered(when.attacksAlone(YOURS), [fx.pump(ref.eventObject, 0, 0, ["doubleStrike"])], {
        label: "Attaque seule : double initiative",
      }),
      // Approximation : le sort se lance après la résolution, à tout moment ce tour-ci (comme Etali).
      triggered(when.combatDamageToPlayer, [fx.grantPlay(ref.target(), { free: true, anyTime: true, exileAfter: true })], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"], maxManaValue: 3 }, "you", "éphémère ou rituel")],
        label: "Croix de feu",
      }),
    ],
  },
  "Squall, SeeD Mercenary": {
    abilities: [
      triggered(when.attacksAlone(YOURS), [fx.pump(ref.eventObject, 0, 0, ["doubleStrike"])], {
        label: "Attaque seule : double initiative",
      }),
      triggered(when.combatDamageToPlayer, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { ...PERMANENT_CARD, maxManaValue: 3 }, "you", "carte de permanent")],
        label: "Une carte de permanent de VM 3 ou moins",
      }),
    ],
  },
  "Bartz and Boko": {
    costReduction: { generic: amount.count({ subtype: "Bird", controller: "you" }) },
    abilities: [
      triggered(when.entersSelf, [fx.eachDealsDamage({ ...YOURS, subtype: "Bird", other: true }, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Chaque autre Oiseau inflige sa force",
      }),
    ],
  },
  "Diamond Weapon": {
    costReduction: { generic: amount.countIn("graveyard", PERMANENT_CARD) },
    abilities: [staticAbility("self", { addKeywords: ["combatDamageImmune"] }, { label: "Immunité" })],
  },
  "Quina, Qu Gourmet": {
    abilities: [
      playerStatic({ extraToken: FROG, label: "Une Grenouille 1/1 en plus de vos jetons" }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { subtype: "Frog" } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Shantotto, Tactician Magician": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, amount.eventManaSpent, 0)], {
        label: "+X/+0",
      }),
      triggered(when.castNoncreatureWithMana(4), [fx.draw(1)], { label: "Piochez (X ≥ 4)" }),
    ],
  },
  "Tellah, Great Sage": {
    abilities: [
      // Approximation : trois déclenchements séparés (Héros ; puis pioche ; puis sacrifice et blessures).
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(HERO)], { label: "Héros 1/1" }),
      triggered(when.castNoncreatureWithMana(4), [fx.draw(2)], { label: "Piochez deux cartes" }),
      triggered(when.castNoncreatureWithMana(8), [fx.sacrificeIt(ref.self), fx.damage(amount.eventManaSpent, ref.eachOpponent)], {
        label: "Sacrifiez Tellah, blessures à chaque adversaire",
      }),
    ],
  },
  "The Wandering Minstrel": {
    abilities: [
      playerStatic({ landsEnterUntapped: true, label: "Vos terrains arrivent dégagés" }),
      triggered(when.yourCombat, [fx.createTokens(ALL_COLORS_ELEMENTAL)], {
        condition: cond.controls({ ...TOWN }, 5),
        label: "Élémental 2/2 de toutes les couleurs",
      }),
      activated({
        mana: "{3}{W}{U}{B}{R}{G}",
        effects: [
          fx.pumpAll(
            { ...YOURS, other: true },
            amount.count({ ...TOWN, controller: "you" }),
            amount.count({ ...TOWN, controller: "you" }),
          ),
        ],
        label: "+X/+X (Villes)",
      }),
    ],
  },
  "Y'shtola Rhul": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.exileCard(ref.target(), { name: "y" }),
          fx.toBattlefield(ref.stored("y")),
          fx.when(cond.firstEndStep, fx.extraEndStep),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Clignotement, étape de fin supplémentaire" },
      ),
    ],
  },
  "Relentless X-ATM092": {
    abilities: [
      staticAbility("self", { addKeywords: ["minThreeBlockers"] }, { label: "Bloquée par trois créatures ou plus" }),
      activated({
        mana: "{8}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true, counters: { kind: "finality", n: 1 } })],
        label: "Revient du cimetière",
      }),
    ],
  },
  "Gilgamesh, Master-at-Arms": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(
          t,
          [
            fx.lookAtTop(6, {
              filter: { subtype: "Equipment" },
              count: 6,
              to: { to: "battlefield" },
              rest: "bottom",
              store: "e",
            }),
            fx.when(
              cond.v("e"),
              fx.may(
                "Attacher l'un de ces Équipements à un Samouraï ?",
                fx.reflexive(
                  [
                    targetObj("e", { subtype: "Equipment", controller: "you", enteredThisTurn: true }, "Équipement mis en jeu"),
                    target.creature("c", { controller: "you", subtype: "Samurai" }),
                  ],
                  [fx.attach(ref.target("c"), ref.target("e"))],
                ),
              ),
            ),
          ],
          { label: "Équipements parmi les six du dessus" },
        ),
      ),
    ],
  },
};
