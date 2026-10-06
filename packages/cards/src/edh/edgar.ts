/**
 * Commander (PLAN-E, E10) : les Vampires du deck d'Edgar Markov (créatures, sorts et Sorin). Ascension (702.131) lue dans
 * le texte ; coûts « engagez cinq Vampires dégagés » (`tapOthers`), « engagez un Vampire dégagé » (coût additionnel).
 */
import type { CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  fx,
  loyalty,
  protection,
  protectionAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  VAMPIRE_DEMON,
  VAMPIRE_FLYING,
  VAMPIRE_LIFELINK,
  VAMPIRE_WB_LIFELINK,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };
/** « Les Vampires que vous contrôlez » (permanents). */
const YOUR_VAMPIRES: ObjectFilter = { subtype: "Vampire", controller: "you" };
/** « Les autres créatures Vampires que vous contrôlez ». */
const OTHER_VAMPIRES: ObjectFilter = { types: ["Creature"], subtype: "Vampire", controller: "you", other: true };
const VAMPIRE_COUNT = amount.count(YOUR_VAMPIRES);

/** « Les autres Vampires que vous contrôlez gagnent +N/+N » (et des mots-clés). */
const vampireLord = (n: number, label: string, keywords?: ("firstStrike" | "flying")[]) =>
  staticAbility(OTHER_VAMPIRES, { power: n, toughness: n, ...(keywords ? { addKeywords: keywords } : {}) }, { label });

/** « {T} : créez un jeton de créature Vampire 2/2 noire avec le vol » (Bloodline Keeper, Lord of Lineage). */
const vampireMaker = activated({
  tap: true,
  effects: [fx.createTokens(VAMPIRE_FLYING)],
  label: "Jeton Vampire 2/2 volant",
});

export const EDH_EDGAR: Record<string, CardScript> = {
  "Blood Artist": {
    abilities: [
      triggered(when.dies(CREATURE), [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player()],
        label: "Une créature meurt : le joueur ciblé perd 1 PV, vous en gagnez 1",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Bloodline Keeper": {
    abilities: [
      vampireMaker,
      activated({
        mana: "{B}",
        activationCondition: cond.controls({ subtype: "Vampire" }, 5),
        effects: [fx.transform()],
        label: "Transformez (cinq Vampires ou plus)",
      }),
    ],
  },
  "Lord of Lineage": { abilities: [vampireLord(2, "Les autres Vampires gagnent +2/+2"), vampireMaker] },
  "Captivating Vampire": {
    abilities: [
      vampireLord(1, "Les autres Vampires gagnent +1/+1"),
      activated({
        tapOthers: { filter: YOUR_VAMPIRES, count: 5, includeSelf: true },
        targets: [target.creature()],
        effects: [fx.gainControl(ref.target()), fx.modify(ref.target(), { addSubtypes: ["Vampire"] }, "permanent")],
        label: "Engagez cinq Vampires : contrôlez la créature ciblée, qui devient un Vampire",
      }),
    ],
  },
  "Champion of Dusk": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(VAMPIRE_COUNT), fx.loseLife(VAMPIRE_COUNT)], {
        label: "Piochez X cartes et perdez X PV (X : vos Vampires)",
      }),
    ],
  },
  // « Ils peuvent engager ce permanent. S'ils ne le font pas, vous créez un Vampire 1/1 blanc avec le lien de vie » :
  // la question est posée au contrôleur du permanent arrivé.
  "Charismatic Conqueror": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "opponent", tapped: false }),
        [
          ...fx.mayForStore(
            ref.controllerOf(ref.eventObject),
            "Engager ce permanent ? Sinon, votre adversaire crée un Vampire 1/1 avec le lien de vie",
            "tapped",
            fx.tap(ref.eventObject),
          ),
          ...fx.when(cond.not(cond.v("tapped")), fx.createTokens(VAMPIRE_LIFELINK)),
        ],
        { label: "Un artefact ou une créature adverse arrive dégagé : engagé, ou un Vampire pour vous" },
      ),
    ],
  },
  "Clavileño, First of the Blessed": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.modify(
            ref.target(),
            {
              addSubtypes: ["Demon"],
              addAbilities: [
                triggered(when.diesSelf, [fx.draw(1), fx.createTappedTokens(VAMPIRE_DEMON)], {
                  label: "Meurt : piochez, et un Vampire Démon 4/3 volant engagé",
                }),
              ],
            },
            "permanent",
          ),
        ],
        {
          targets: [
            target.permanent(
              "t",
              ["Creature"],
              { subtype: "Vampire", notSubtype: "Demon", attacking: true },
              "Vampire attaquant qui n'est pas un Démon",
            ),
          ],
          label: "Un Vampire attaquant devient un Démon",
        },
      ),
    ],
  },
  "Cordial Vampire": {
    abilities: [
      triggered(when.dies(CREATURE), [fx.addCountersAll(YOUR_VAMPIRES)], {
        label: "Une créature meurt : +1/+1 sur chaque Vampire",
      }),
    ],
  },
  "Cruel Celebrant": {
    abilities: [
      triggered(when.dies({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], controller: "you" }), fx.drain(1), {
        label: "Une de vos créatures ou un de vos planeswalkers meurt : drain 1",
      }),
    ],
  },
  // Vol et initiative : lus dans le texte.
  "Drana, Liberator of Malakir": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.addCountersAll({ types: ["Creature"], controller: "you", attacking: true })], {
        label: "+1/+1 sur chaque attaquant",
      }),
    ],
  },
  "Edgar, Charmed Groom": {
    abilities: [
      vampireLord(1, "Les autres Vampires gagnent +1/+1"),
      triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { transformed: true })], {
        label: "Revient transformé (Edgar Markov's Coffin)",
      }),
    ],
  },
  "Edgar Markov's Coffin": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.createTokens(VAMPIRE_WB_LIFELINK),
          fx.counters(ref.self, "bloodline"),
          ...fx.when(
            cond.amountAtLeast(amount.countersOn(ref.self, "bloodline"), 3),
            fx.removeCounters(ref.self, amount.countersOn(ref.self, "bloodline"), "bloodline"),
            fx.transform(),
          ),
        ],
        { label: "Vampire 1/1 avec le lien de vie, marqueur de lignée ; à trois, transformez" },
      ),
    ],
  },
  // Lien de vie : lu dans le texte.
  "Elenda, the Dusk Rose": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Une autre créature meurt : +1/+1",
      }),
      triggered(when.diesSelf, [fx.createTokens(VAMPIRE_LIFELINK, amount.lkiPower)], {
        label: "Meurt : X Vampires 1/1 avec le lien de vie (X : sa force)",
      }),
    ],
  },
  "Forerunner of the Legion": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Chercher une carte de Vampire à mettre au-dessus de votre bibliothèque ?",
          fx.search({ subtype: "Vampire" }, { to: "libraryTop" }),
        ),
        { label: "Cherchez un Vampire, au-dessus de la bibliothèque" },
      ),
      triggered(when.enters({ ...OTHER_VAMPIRES }), [fx.pump(ref.target(), 1, 1)], {
        targets: [target.creature()],
        label: "Un autre Vampire arrive : +1/+1 à la créature ciblée",
      }),
    ],
  },
  // Lien de vie : lu dans le texte.
  "Indulgent Aristocrat": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: CREATURE, includeSelf: true },
        effects: [fx.addCountersAll(YOUR_VAMPIRES)],
        label: "Sacrifiez une créature : +1/+1 sur chaque Vampire",
      }),
    ],
  },
  "Knight of the Ebon Legion": {
    abilities: [
      activated({ mana: "{2}{B}", effects: [fx.pump(ref.self, 3, 3, ["deathtouch"])], label: "+3/+3 et contact mortel" }),
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "lifeLoss", sum: true, perPlayer: true }), 4),
        label: "Un joueur a perdu 4 PV ou plus : +1/+1",
      }),
    ],
  },
  "Legion Lieutenant": { abilities: [vampireLord(1, "Les autres Vampires gagnent +1/+1")] },
  // Vol : lu dans le texte.
  "Malakir Bloodwitch": {
    abilities: [
      protectionAbility(protection.from({ colors: ["W"] }, "Protection contre le blanc")),
      triggered(when.entersSelf, [fx.loseLife(VAMPIRE_COUNT, ref.eachOpponent, "lost"), fx.gainLife(amount.v("lost"))], {
        label: "Chaque adversaire perd 1 PV par Vampire ; vous gagnez autant",
      }),
    ],
  },
  // Convocation, lien de vie et folie : lus dans le texte.
  "Markov Baron": { abilities: [vampireLord(1, "Les autres Vampires gagnent +1/+1")] },
  "Master of Dark Rites": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: CREATURE },
        effects: [fx.addManaChoice(3, ["B"], { spell: { anySubtype: ["Vampire", "Cleric", "Demon"] } })],
        label: "{B}{B}{B} pour des sorts de Vampire, de Clerc ou de Démon",
      }),
    ],
  },
  "Mavren Fein, Dusk Apostle": {
    abilities: [
      triggered(when.attackWith(1, { subtype: "Vampire", token: false }), [fx.createTokens(VAMPIRE_LIFELINK)], {
        label: "Des Vampires non-jetons attaquent : Vampire 1/1 avec le lien de vie",
      }),
    ],
  },
  "Sanctum Seeker": {
    abilities: [
      triggered(when.attacks({ subtype: "Vampire", controller: "you" }), fx.drain(1), {
        label: "Un Vampire attaque : drain 1",
      }),
    ],
  },
  // Initiative : lue dans le texte.
  "Stromkirk Captain": { abilities: [vampireLord(1, "Les autres Vampires gagnent +1/+1 et l'initiative", ["firstStrike"])] },
  // Vol et ascension : lus dans le texte.
  "Twilight Prophet": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "c" }), ...fx.drain(amount.manaValueOf(ref.stored("c")))],
        {
          condition: cond.citysBlessing,
          label: "Bénédiction de la cité : la carte du dessus en main, drain de sa valeur de mana",
        },
      ),
    ],
  },
  // Menace : lue dans le texte.
  "Vampire Socialite": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll({ ...YOUR_VAMPIRES, other: true })], {
        condition: cond.opponentLostLife,
        label: "Un adversaire a perdu des PV : +1/+1 sur chaque autre Vampire",
      }),
      entersWith({
        counters: 1,
        affects: { ...YOUR_VAMPIRES, other: true },
        condition: cond.opponentLostLife,
        label: "Les autres Vampires arrivent avec un marqueur +1/+1 de plus",
      }),
    ],
  },
  "Viscera Seer": {
    abilities: [
      activated({
        sacrificeOther: { filter: CREATURE, includeSelf: true },
        effects: [fx.scry(1)],
        label: "Sacrifiez une créature : regard 1",
      }),
    ],
  },
  "Vito, Thorn of the Dusk Rose": {
    abilities: [
      triggered({ on: "life", change: "gain", whose: "you" }, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Vous gagnez des PV : l'adversaire ciblé en perd autant",
      }),
      activated({
        mana: "{3}{B}{B}",
        effects: [fx.pumpAll({ controller: "you" }, 0, 0, ["lifelink"])],
        label: "Vos créatures gagnent le lien de vie",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Welcoming Vampire": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }), [fx.draw(1)], {
        batched: true,
        oncePerTurn: true,
        label: "Des créatures de force 2 ou moins arrivent : piochez (une fois par tour)",
      }),
    ],
  },
  // Célérité : lue dans le texte.
  "Yahenni, Undying Partisan": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.addCounters(ref.self, 1)], {
        label: "Une créature adverse meurt : +1/+1",
      }),
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.modify(ref.self, { addKeywords: ["indestructible"] })],
        label: "Sacrifiez une autre créature : indestructible",
      }),
    ],
  },
  // Approximation : « remplacez toutes les occurrences d'un type de créature par Vampire » (changement de texte, 612)
  // n'est pas fait ; la créature devient un Vampire en plus de ses autres types (docs/approximations.md).
  "New Blood": {
    additionalCost: { tap: { filter: { types: ["Creature"], subtype: "Vampire", controller: "you" }, count: 1 } },
    spell: spell(
      [target.creature()],
      [fx.gainControl(ref.target()), fx.modify(ref.target(), { addSubtypes: ["Vampire"] }, "permanent")],
    ),
  },
  "Olivia's Wrath": {
    spell: spell([], [fx.pumpAll({ notSubtype: "Vampire" }, amount.neg(VAMPIRE_COUNT), amount.neg(VAMPIRE_COUNT))]),
  },
  "Pact of the Serpent": {
    spell: spell(
      [target.player()],
      [
        fx.chooseForSelf("creatureType"),
        fx.draw(amount.refCount(ref.permanentsOf(ref.target(), { types: ["Creature"], subtypeChosen: true })), ref.target()),
        fx.loseLife(amount.refCount(ref.permanentsOf(ref.target(), { types: ["Creature"], subtypeChosen: true })), ref.target()),
      ],
    ),
  },
  "Sorin, Imperious Bloodlord": {
    abilities: [
      loyalty(1, {
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.pump(ref.target(), 0, 0, ["deathtouch", "lifelink"]),
          ...fx.when(cond.refMatches(ref.target(), { subtype: "Vampire" }), fx.addCounters(ref.target(), 1)),
        ],
        label: "Contact mortel et lien de vie ; +1/+1 si c'est un Vampire",
      }),
      loyalty(1, {
        effects: [
          fx.sacrifice(ref.you, { subtype: "Vampire" }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.any()], [fx.damage(3, ref.target()), fx.gainLife(3)])),
        ],
        label: "Sacrifiez un Vampire : 3 blessures à n'importe quelle cible, gagnez 3 PV",
      }),
      loyalty(-3, {
        effects: [fx.pickFromZone("hand", { types: ["Creature"], subtype: "Vampire" }, { to: "battlefield" }, { min: 0 })],
        label: "Mettez une carte de créature Vampire de votre main sur le champ de bataille",
      }),
    ],
  },
};
