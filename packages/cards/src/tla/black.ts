/**
 * Avatar: The Last Airbender — cartes noires (lot A). La maîtrise du feu, le vol, le contact mortel, la menace,
 * l'équipage et le cycle de terrain sont lus dans le texte.
 */
import type { TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CLUE,
  cond,
  exhaust,
  FOOD,
  fx,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez");
const ARTIFACT_OR_CREATURE = { anyOf: [{ types: ["Artifact" as const] }, { types: ["Creature" as const] }] };

/** Jeton de Fire Navy Trebuchet : « Ballistic Boulder », créature-artefact Assemblage 2/1 incolore volante. */
const BALLISTIC_BOULDER: TokenSpec = {
  name: "Ballistic Boulder",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 2,
  toughness: 1,
  keywords: ["flying"],
  text: "Flying",
};

/** « une autre créature ou un Véhicule ciblé que vous contrôlez » (Fire Nation Engineer). */
const CREATURE_OR_VEHICLE_YOU: TargetSpec = {
  id: "t",
  label: "autre créature ou Véhicule que vous contrôlez",
  filter: { objects: { controller: "you", other: true, anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] } },
};

/** Boiling Rock Rioter : « exilez une carte ciblée d'un cimetière », liée à la créature. */
const rioterExile = {
  targets: [target.cardInGraveyard("t", {}, "any")],
  effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
};

export const BLACK: Record<string, CardScript> = {
  "Azula Always Lies": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode("−1/−1 jusqu'à la fin du tour", [target.creature("a")], [fx.pump(ref.target("a"), -1, -1)]),
      mode("Un marqueur +1/+1", [target.creature("b")], [fx.addCounters(ref.target("b"), 1)]),
      mode(
        "Les deux",
        [target.creature("a"), target.creature("b")],
        [fx.pump(ref.target("a"), -1, -1), fx.addCounters(ref.target("b"), 1)],
      ),
    ),
  },
  "Azula, On the Hunt": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Perdez 1 PV, un Indice" })],
  },
  "Beetle-Headed Merchants": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { ...ARTIFACT_OR_CREATURE, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(1), fx.addCounters(ref.self, 1)),
        ],
        { label: "Vous pouvez sacrifier une autre créature ou un artefact : piochez, marqueur +1/+1" },
      ),
    ],
  },
  "Boiling Rock Rioter": {
    abilities: [
      // « Engagez un Allié dégagé que vous contrôlez » : un autre Allié, ou le Rioter lui-même (sans mal d'invocation,
      // approximation : le moteur le traite comme un {T}).
      activated({
        tapOthers: { filter: { subtype: "Ally" }, count: 1 },
        ...rioterExile,
        label: "Engagez un autre Allié : exilez une carte d'un cimetière",
      }),
      activated({ tap: true, ...rioterExile, label: "Engagez-le : exilez une carte d'un cimetière" }),
      triggered(when.attacksSelf, [fx.castNow(ref.filtered(ref.linked, { subtype: "Ally", controller: "you" }))], {
        label: "Vous pouvez lancer un sort d'Allié exilé avec lui",
      }),
    ],
  },
  "Buzzard-Wasp Colony": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.sacrifice(ref.you, ARTIFACT_OR_CREATURE, 1, { optional: true, store: "s" }), ...fx.when(cond.v("s"), fx.draw(1))],
        { label: "Vous pouvez sacrifier un artefact ou une créature : piochez" },
      ),
      // « s'il avait des marqueurs » : dans le filtre (dernières informations connues).
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true, withCounter: "any" }),
        [fx.lkiCountersTo(ref.self)],
        { label: "Ses marqueurs vont sur la colonie" },
      ),
    ],
  },
  "Canyon Crawler": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" })],
  },
  "Cat-Gator": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count({ subtype: "Swamp", controller: "you" }), ref.target())], {
        targets: [target.any()],
        label: "Blessures égales au nombre de vos Marais",
      }),
    ],
  },
  "Corrupt Court Official": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "L'adversaire défausse une carte",
      }),
    ],
  },
  "Dai Li Indoctrination": {
    spell: modal(
      mode(
        "Main révélée : défausse d'une carte de permanent non-terrain",
        [target.player("p", "opponent")],
        [fx.discard(1, ref.target("p"), { filter: { permanent: true, nonland: true }, chooser: "controller" })],
      ),
      mode("Maîtrise de la terre 2", [LAND_YOU_CONTROL], fx.earthbend(ref.target(), 2)),
    ),
  },
  "Epic Downfall": {
    spell: spell([target.creature("t", { minManaValue: 3 })], [fx.exile(ref.target())]),
  },
  "Fatal Fissure": {
    spell: spell(
      [target.creature()],
      [
        fx.emblem(
          "Fatal Fissure",
          "When that creature dies this turn, you earthbend 4.",
          [
            triggered(when.dies({ linkedToSource: true }), fx.earthbend(ref.target(), 4), {
              targets: [LAND_YOU_CONTROL],
              label: "Maîtrise de la terre 4",
            }),
          ],
          false,
          true,
          "e",
        ),
        fx.link(ref.target(), ref.stored("e")),
      ],
    ),
  },
  "The Fire Nation Drill": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(
          cond.not(cond.sourceMatches({ tapped: true })),
          fx.may(
            "Engager The Fire Nation Drill pour détruire une créature de force 4 ou moins ?",
            fx.tap(ref.self),
            fx.reflexive([target.creature("t", { maxPower: 4 })], [fx.destroy(ref.target())]),
          ),
        ),
        { label: "Vous pouvez l'engager : détruisez une créature de force 4 ou moins" },
      ),
      activated({
        mana: "{1}",
        effects: [
          fx.modifyAll(
            { permanent: true, controller: "opponent" },
            { removeKeywords: ["hexproof", "indestructible"] },
            "endOfTurn",
          ),
        ],
        label: "Les permanents adverses perdent la défense talismanique et l'indestructibilité",
      }),
    ],
  },
  "Fire Nation Engineer": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        condition: cond.raid,
        targets: [CREATURE_OR_VEHICLE_YOU],
        label: "Raid — un marqueur +1/+1 sur une autre créature ou un Véhicule",
      }),
    ],
  },
  "Fire Navy Trebuchet": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.createTappedTokens(BALLISTIC_BOULDER, 1, { attacking: true, store: "b" }),
          fx.delayed([fx.sacrificeIt(ref.target("b"))], { b: ref.stored("b") }),
        ],
        { label: "Un Ballistic Boulder 2/1 volant, engagé et attaquant" },
      ),
    ],
  },
  "Foggy Swamp Hunters": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["lifelink", "menace"] },
        { condition: cond.drewAtLeast(2), label: "Lien de vie et menace (deux cartes piochées ce tour-ci)" },
      ),
    ],
  },
  "Hog-Monkey": {
    abilities: [
      triggered(when.yourCombat, [fx.modify(ref.target(), { addKeywords: ["menace"] })], {
        targets: [target.creature("t", { controller: "you", withCounter: "+1/+1" })],
        label: "Une de vos créatures avec un marqueur +1/+1 gagne la menace",
      }),
      exhaust({ mana: "{5}", effects: [fx.addCounters(ref.self, 2)], label: "{5} : deux marqueurs +1/+1" }),
    ],
  },
  "Joo Dee, One of Many": {
    abilities: [
      activated({
        mana: "{B}",
        tap: true,
        sorcerySpeed: true,
        effects: [fx.surveil(1), fx.copyToken(ref.self), fx.sacrifice(ref.you, ARTIFACT_OR_CREATURE)],
        label: "Surveillance 1, un jeton copie, puis sacrifiez un artefact ou une créature",
      }),
    ],
  },
  "June, Bounty Hunter": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        { condition: cond.drewAtLeast(2), label: "Imblocable (deux cartes piochées ce tour-ci)" },
      ),
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        activationCondition: cond.yourTurn,
        effects: [fx.createTokens(CLUE)],
        label: "Sacrifiez une autre créature : un Indice",
      }),
    ],
  },
  "Mai, Scornful Striker": {
    abilities: [
      triggered(when.castSpell("any", { notTypes: ["Creature"] }), [fx.loseLife(2, ref.eventPlayer)], {
        label: "Le lanceur d'un sort non-créature perd 2 PV",
      }),
    ],
  },
  "Merchant of Many Hats": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Revient du cimetière en main",
      }),
    ],
  },
  "Northern Air Temple": {
    abilities: [
      triggered(when.entersSelf, fx.drain(amount.count({ subtype: "Shrine", controller: "you" })), {
        label: "Chaque adversaire perd X PV, vous gagnez X PV (X : vos Sanctuaires)",
      }),
      triggered(when.enters({ subtype: "Shrine", controller: "you", other: true }), fx.drain(1), {
        label: "Chaque adversaire perd 1 PV, vous gagnez 1 PV",
      }),
    ],
  },
  "Ozai's Cruelty": {
    spell: spell([target.player()], [fx.damage(2, ref.target()), fx.discard(2, ref.target())]),
  },
  "Phoenix Fleet Airship": {
    abilities: [
      triggered(when.yourEndStep, [fx.copyToken(ref.self)], {
        condition: cond.sacrificedThisTurn,
        label: "Un jeton copie (permanent sacrifié ce tour-ci)",
      }),
      staticAbility(
        "self",
        { addTypes: ["Artifact", "Creature"] },
        {
          condition: cond.controls({ name: "Phoenix Fleet Airship" }, 8),
          label: "Créature-artefact (huit Phoenix Fleet Airship ou plus)",
        },
      ),
    ],
  },
  "Pirate Peddlers": {
    abilities: [
      triggered(when.sacrifice({ other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Un autre permanent sacrifié : un marqueur +1/+1",
      }),
    ],
  },
  "Sold Out": {
    spell: spell(
      [target.creature()],
      [fx.exileCard(ref.target(), { name: "d", filter: { damaged: true } }), ...fx.when(cond.v("d"), fx.createTokens(CLUE))],
    ),
  },
  "Swampsnare Trap": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    costReduction: { generic: 1, condition: cond.targetMatches("enchant", { keyword: "flying" }) },
    abilities: [staticAbility("attached", { power: -5, toughness: -3 }, { label: "−5/−3" })],
  },
  "Tundra Tank": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["indestructible"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une de vos créatures gagne l'indestructibilité",
      }),
    ],
  },
  Wolfbat: {
    abilities: [
      triggered(
        when.draw(2),
        fx.mayPay(
          "{B}",
          "Payer {B} pour renvoyer Wolfbat sur le champ de bataille ?",
          fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } }),
        ),
        { fromGraveyard: true, label: "Revient du cimetière avec un marqueur de finalité" },
      ),
    ],
  },
  "Zuko's Conviction": {
    kicker: "{4}",
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
      [
        ...fx.when(cond.not(cond.kicked), fx.toHand(ref.target())),
        ...fx.when(cond.kicked, fx.toBattlefield(ref.target(), { tapped: true })),
      ],
    ),
  },
  // Maîtrise de l'eau {X} en coût additionnel : lue dans le texte.
  "Foggy Swamp Visions": {
    spell: spell(
      [
        {
          ...target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature d'un cimetière"),
          count: 99,
          countX: true,
        },
      ],
      [fx.exileCard(ref.target(), { name: "v" }), fx.copyToken(ref.stored("v"), { sacrificeAtEndStep: true })],
    ),
  },
  // « vous pouvez maîtriser l'eau {4} » : un kicker lu dans le texte.
  "Ruinous Waterbending": {
    spell: spell(
      [],
      [
        fx.pumpAll({ types: ["Creature"] }, -2, -2),
        ...fx.when(
          cond.kicked,
          fx.emblem(
            "Ruinous Waterbending",
            "Chaque fois qu'une créature meurt ce tour-ci, vous gagnez 1 point de vie.",
            [triggered(when.dies({ types: ["Creature"] }), [fx.gainLife(1)], { label: "Une créature meurt : gagnez 1 PV" })],
            false,
            true,
          ),
        ),
      ],
    ),
  },
  "Lo and Li, Twin Tutors": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ anyOf: [{ subtype: "Lesson" }, { subtype: "Noble" }] }, { to: "hand" })], {
        label: "Cherchez une carte de Leçon ou de Noble",
      }),
      staticAbility(
        { types: ["Creature"], subtype: "Noble", controller: "you" },
        { addKeywords: ["lifelink"] },
        { label: "Vos créatures Nobles ont le lien de vie" },
      ),
      playerStatic({
        spellKeywords: { filter: { subtype: "Lesson" }, keywords: ["lifelink"] },
        label: "Vos sorts de Leçon ont le lien de vie",
      }),
    ],
  },
};
