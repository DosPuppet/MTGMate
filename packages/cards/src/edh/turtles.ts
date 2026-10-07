/**
 * Commander : préconstruit « Turtle Power! » de Teenage Mutant Ninja Turtles (Heroes in a Half Shell, cinq couleurs).
 * Marqueurs +1/+1 (doublés, multipliés, déplacés), jetons Mutagène, attaques à plusieurs adversaires.
 */
import type { CardScript, Effect, ManaType, ModeDef, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { MUTAGEN, NINJA, ROBOT_1 } from "../tmt/common";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  CLUE,
  cond,
  entersWith,
  eventReplacement,
  evolve,
  FOOD,
  fx,
  manaAbility,
  playerStatic,
  RAT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** « une créature que vous contrôlez avec un marqueur » (n'importe quelle sorte). */
const COUNTERED_YOU: ObjectFilter = { ...CREATURE_YOU, withCounter: "any" };
const OOZE: TokenSpec = { name: "Ooze", colors: ["G"], types: ["Creature"], subtypes: ["Ooze"], power: 2, toughness: 2 };
const ALL_COLORS: ManaType[] = ["W", "U", "B", "R", "G"];

/** Partenaire avec (702.124j) : en arrivant, le joueur ciblé peut chercher l'autre carte et la mettre dans sa main. */
const partnerWith = (name: string) =>
  triggered(
    when.entersSelf,
    fx.mayFor(ref.target("p"), `Chercher ${name} ?`, fx.search({ name }, { to: "hand" }, 1, ref.target("p"))),
    { targets: [target.player("p")], label: `Partenaire avec ${name}` },
  );

/** « Choisissez deux — » : chaque paire de modes (cibles et effets dans l'ordre). */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  return {
    modes: modes.flatMap((a, i) =>
      modes.slice(i + 1).map((b) => ({
        label: `${a.label} + ${b.label}`,
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      })),
    ),
  };
}

/** Terrains « Thriving » : engagés ; {T} : la couleur imprimée ou la couleur choisie (autre que celle-là). */
const thriving = (color: ManaType): CardScript => ({
  chooseOnEnter: "color",
  enterModes: ALL_COLORS.filter((c) => c !== color),
  abilities: [entersWith({ tapped: true }), manaAbility(color), manaAbility([color], 1, { produceChosen: true })],
});

/** « [Source] inflige des blessures égales à sa force à [cible] » (morsure). */
const bite = (from: string, to: string): Effect => fx.damage(amount.powerOf(ref.target(from)), ref.target(to), ref.target(from));

export const EDH_TURTLES: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  // Vigilance, menace, piétinement, célérité : lus dans le texte.
  "Heroes in a Half Shell": {
    abilities: [
      triggered(
        when.combatDamageBatch({ types: ["Creature"], controller: "you", anySubtype: ["Mutant", "Ninja", "Turtle"] }),
        [fx.addCounters(ref.eventObjects, 1), fx.draw(1)],
        { label: "Un marqueur +1/+1 sur chacune de ces créatures, et piochez une carte" },
      ),
    ],
  },

  // --- Créatures ----------------------------------------------------------------------------------------------------
  // Contact mortel : lu dans le texte.
  "Acidic Slime": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Enchantment", "Land"], {}, "artefact, enchantement ou terrain")],
        label: "Détruisez un artefact, un enchantement ou un terrain",
      }),
    ],
  },
  // Partenaire — Sélection du personnage : règle de construction seulement.
  "April O'Neil, Live on the Scene": {
    abilities: [
      triggered(when.enters({ controller: "you", anySubtype: ["Mutant", "Ninja", "Turtle"] }), [fx.createTokens(CLUE)], {
        label: "Un Mutant, un Ninja ou une Tortue arrive : enquêtez",
      }),
    ],
  },
  "Baxter, Fly in the Ointment": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(w, [fx.pumpAll(COUNTERED_YOU, 0, 0, ["flying"])], {
          label: "Vos créatures avec un marqueur gagnent le vol jusqu'à la fin du tour",
        }),
      ),
      triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "Vous piochez : un marqueur +1/+1" }),
    ],
  },
  // Contact mortel : lu dans le texte.
  "Bebop, Skull & Crossbones": {
    abilities: [
      partnerWith("Rocksteady, Mutant Marauder"),
      triggered(
        when.combatDamageToPlayer,
        fx.may(
          "Piocher autant de cartes que de marqueurs sur Bebop, et perdre autant de PV ?",
          fx.draw(amount.countersOn(ref.self, "any")),
          fx.loseLife(amount.countersOn(ref.self, "any")),
        ),
        { label: "Piochez X cartes et perdez X PV (X : ses marqueurs)" },
      ),
    ],
  },
  "Big Mother Mouser": {
    abilities: [
      entersWith({ counters: 2, label: "Deux marqueurs +1/+1" }),
      triggered(when.attacksSelf, [fx.doubleCounters(ref.self)], { label: "Double ses marqueurs +1/+1" }),
      triggered(when.diesSelf, [fx.createTokens(ROBOT_1, amount.lkiCounters("+1/+1"))], {
        label: "Autant de Robots 1/1 que de marqueurs +1/+1",
      }),
    ],
  },
  "Biogenic Ooze": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(OOZE)], { label: "Un Limon 2/2" }),
      triggered(when.yourEndStep, [fx.addCountersAll({ subtype: "Ooze", controller: "you" }, 1)], {
        label: "Un marqueur +1/+1 sur chacun de vos Limons",
      }),
      activated({ mana: "{1}{G}{G}{G}", effects: [fx.createTokens(OOZE)], label: "Un Limon 2/2" }),
    ],
  },
  // Menace : lue dans le texte.
  "Casey Jones, Back Alley Brute": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature("t", { attacking: true }), label: "créature attaquante" }],
        label: "Un marqueur +1/+1 sur une créature attaquante",
      }),
      triggered(when.youPutCounters(CREATURE_YOU, "+1/+1"), [fx.damage(amount.eventAmount, ref.target("o"))], {
        targets: [target.player("o", "opponent")],
        label: "Autant de blessures à un adversaire",
      }),
    ],
  },
  "Corpsejack Menace": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { times: 2 },
        label: "Deux fois plus de marqueurs +1/+1 sur vos créatures",
      }),
    ],
  },
  "Dimension X Pizzasaur": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.addCounters(ref.target(), 2),
          fx.reflexive(
            [
              {
                ...target.upTo(1, target.creature("d")),
                maxManaValueAmount: amount.countersAmong({ permanent: true, controller: "you" }, "any"),
                label: "créature de valeur de mana au plus le nombre de marqueurs parmi vos permanents",
              },
            ],
            [fx.destroy(ref.target("d"))],
          ),
        ],
        { targets: [target.creature()], label: "Deux marqueurs +1/+1, puis détruisez une créature" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.loseLife(3, ref.eachOpponent)],
        label: "Vous gagnez 3 PV et chaque adversaire en perd 3",
      }),
    ],
  },
  "Donatello, the Brains": {
    abilities: [
      eventReplacement({ event: "tokens", to: "you", plus: MUTAGEN, modify: {}, label: "Un Mutagène en plus de vos jetons" }),
    ],
  },
  // Défenseur, célérité : lus dans le texte.
  "Electric Seaweed": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.self, {
            addAbilities: [
              triggered(
                when.dies({ types: ["Creature"], other: true }),
                [fx.damageAll(1, { types: ["Creature"], notSubtype: "Wall" })],
                { label: "Une autre créature meurt : 1 blessure à chaque créature non-Mur" },
              ),
            ],
          }),
        ],
        { label: "Jusqu'à la fin du tour, chaque mort d'une autre créature inflige 1 blessure à chaque créature non-Mur" },
      ),
      activated({ tap: true, targets: [target.any()], effects: [fx.damage(1, ref.target())], label: "1 blessure" }),
    ],
  },
  "Irma, Part-Time Mutant": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.becomeCopy(ref.self, ref.target(), "permanent", {
            except: { setName: "Irma, Part-Time Mutant" },
            keepAbilities: [0],
          }),
          fx.addCounters(ref.self, 1),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Devient une copie d'une autre de vos créatures (nom et capacité gardés), puis un marqueur +1/+1",
        },
      ),
    ],
  },
  "Krang, the All-Powerful": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "draw" },
        label: "Les capacités de vos permanents déclenchées par une pioche se déclenchent une fois de plus",
      }),
      triggered(when.draw(2, "any"), [fx.addCounters(ref.self, 1)], {
        label: "Un joueur pioche sa deuxième carte du tour : un marqueur +1/+1",
      }),
    ],
  },
  // Piétinement, célérité : lus dans le texte.
  "Leatherhead, Iron Gator": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCountersAll(CREATURE_YOU, 2)], {
        label: "Deux marqueurs +1/+1 sur chaque créature que vous contrôlez",
      }),
    ],
  },
  "Leonardo, the Balance": {
    abilities: [
      triggered(
        when.enters({ token: true, controller: "you" }),
        [
          ...fx.mayForStore(
            ref.you,
            "Mettre un marqueur +1/+1 sur chaque créature que vous contrôlez ?",
            "m",
            fx.addCountersAll(CREATURE_YOU, 1),
          ),
          ...fx.when(cond.v("m"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "Un jeton arrive : un marqueur +1/+1 sur chacune de vos créatures (une fois par tour)" },
      ),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        effects: [fx.pumpAll(CREATURE_YOU, 0, 0, ["menace", "trample", "lifelink"])],
        label: "Vos créatures gagnent la menace, le piétinement et le lien de vie",
      }),
    ],
  },
  // Piétinement : lu dans le texte.
  "Michelangelo, the Heart": {
    abilities: [
      triggered(when.secondMain, [fx.addCounters(ref.target(), 1), fx.createTokens(FOOD)], {
        condition: cond.raid,
        targets: [target.creature()],
        label: "Raid : un marqueur +1/+1 et une Nourriture",
      }),
    ],
  },
  "Raphael, the Muscle": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: COUNTERED_YOU,
        modify: { times: 2 },
        label: "Vos créatures avec des marqueurs infligent le double de blessures",
      }),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "Un Mutagène" }),
    ],
  },
  // Menace : lue dans le texte.
  "Rat King, Pale Piper": {
    abilities: [
      triggered(when.leaves({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(RAT)], {
        label: "Une de vos créatures non-jetons quitte le champ de bataille : un Rat 1/1",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un jeton : piochez une carte",
      }),
    ],
  },
  // Vol : lu dans le texte. Évolution (702.100) : vérifiée au déclenchement et à la résolution.
  "Ray Fillet, Wave Warrior": {
    abilities: [
      evolve,
      triggered(when.combatDamage(COUNTERED_YOU, true), [fx.draw(1)], {
        label: "Une de vos créatures avec un marqueur blesse un joueur : piochez une carte",
      }),
    ],
  },
  // Escouade : lue dans le texte. Contact mortel : lu dans le texte.
  "Roadkill Rodney": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(MUTAGEN)], { label: "Un Mutagène" })],
  },
  // Piétinement : lu dans le texte.
  "Rocksteady, Mutant Marauder": {
    abilities: [
      partnerWith("Bebop, Skull & Crossbones"),
      triggered(when.enters({ ...CREATURE_YOU, other: true, token: false }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Une autre créature non-jeton arrive : un marqueur +1/+1",
      }),
    ],
  },
  "Shredder, Shadow Master": {
    abilities: [
      triggered(
        when.attacksAPlayer,
        [
          fx.copyToken(ref.self, {
            attackEach: ref.except(ref.eachOpponent, ref.defendingPlayer),
            nonlegendary: true,
            atEndOfCombat: "sacrifice",
          }),
        ],
        { label: "Une copie non légendaire attaque chacun de vos autres adversaires (sacrifiée à la fin du combat)" },
      ),
      triggered(when.combatDamageToPlayer, [fx.loseLife(amount.halfLife(ref.eventPlayer), ref.eventPlayer)], {
        label: "Il perd la moitié de ses PV, arrondie au supérieur",
      }),
    ],
  },
  // Menace : lue dans le texte. Partenaire — Sélection du personnage : règle de construction seulement.
  "Splinter, the Mentor": {
    abilities: [
      triggered(when.leaves({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(MUTAGEN)], {
        label: "Une de vos créatures non-jetons quitte le champ de bataille : un Mutagène",
      }),
    ],
  },
  "Steelbane Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({
        mana: "{2}{G}",
        removeCounters: { kind: "+1/+1", n: 1 },
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        effects: [fx.destroy(ref.target())],
        label: "Retirez un marqueur : détruisez un artefact ou un enchantement",
      }),
    ],
  },
  "Tempestra, Dame of Games": {
    abilities: [
      activated({
        mana: "{2}{R}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.copyToken(ref.target(), { nonlegendary: true, addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "Sacrifiez un artefact : une copie non légendaire avec la célérité, sacrifiée à l'étape de fin",
      }),
    ],
  },
  // Initiative : lue dans le texte.
  "Tokka & Rahzar, Unsupervised": {
    abilities: [
      triggered(
        when.leaves({ ...CREATURE_YOU, token: false, other: true }),
        [fx.addCounters(ref.self, 1), fx.createTokens(TREASURE)],
        { oncePerTurn: true, label: "Une autre de vos créatures non-jetons part : un marqueur +1/+1 et un Trésor" },
      ),
    ],
  },
  // Piétinement : lu dans le texte.
  Vigor: {
    shuffleIntoLibrary: true,
    abilities: [
      eventReplacement({
        event: "damage",
        to: "yourSide",
        toFilter: { types: ["Creature"], other: true },
        modify: { prevent: true },
        onPrevent: { countersOnDamaged: "+1/+1" },
        label: "Blessures à vos autres créatures prévenues : autant de marqueurs +1/+1",
      }),
    ],
  },
  // Piétinement : lu dans le texte.
  "Voracious Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggeredModal(when.entersSelf, [
        { label: "Doublez ses marqueurs +1/+1", targets: [], effects: [fx.doubleCounters(ref.self)] },
        {
          label: "Elle se bat contre une créature que vous ne contrôlez pas",
          targets: [target.creature("f", { controller: "opponent" })],
          effects: [fx.fight(ref.self, ref.target("f"))],
        },
      ]),
    ],
  },

  // --- Artefacts ----------------------------------------------------------------------------------------------------
  "Arcade Cabinet": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(4, target.creature())],
        label: "Un marqueur +1/+1 sur chacune de jusqu'à quatre créatures",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { token: true } },
        targets: [target.creature()],
        effects: [fx.doubleAllCounters(ref.target())],
        label: "Sacrifiez un jeton : doublez chaque sorte de marqueurs sur une créature",
      }),
    ],
  },
  "Coin of Mastery": {
    abilities: [
      entersWith({
        affects: CREATURE_YOU,
        counters: amount.artifactManaSpent,
        label: "Vos créatures arrivent avec un marqueur +1/+1 par mana d'artefact dépensé pour les lancer",
      }),
      activated({ tap: true, effects: [fx.createTokens(TREASURE)], label: "Un Trésor" }),
    ],
  },
  "Exploding Barrel": {
    abilities: [
      manaAbility(ANY_COLOR, 1, { addCounter: "pressure" }),
      activated({
        mana: "{8}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        reduction: { generic: amount.countersOn(ref.self, "pressure") },
        targets: [target.creature()],
        effects: [fx.damage(20, ref.target())],
        label: "20 blessures à une créature ({1} de moins par marqueur de pression)",
      }),
    ],
  },
  // Équiper {2} : lu dans le texte.
  "Foot Chopper": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(NINJA, 1, undefined, "n"), fx.attach(ref.stored("n"))], {
        label: "Un Ninja 1/1, puis attachez-lui cet Équipement",
      }),
      staticAbility("attached", { addKeywords: ["flying"] }, { label: "Vol" }),
      triggered(
        when.attachedDealsCombatDamageToPlayer,
        [
          fx.sacrifice(ref.you, { attachedToSource: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(amount.powerOf(ref.eventObject))),
        ],
        { label: "Vous pouvez la sacrifier : piochez autant de cartes que sa force" },
      ),
    ],
  },
  // Menace, Équipage 2 : lus dans le texte.
  "Mole Module": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { permanent: true },
            { to: "battlefield" },
            { pool: ref.stored("m"), min: 0, prompt: "Carte de permanent à mettre sur le champ de bataille" },
          ),
        ],
        { label: "Meulez quatre cartes ; un permanent parmi elles peut arriver sur le champ de bataille" },
      ),
    ],
  },

  // --- Enchantements ------------------------------------------------------------------------------------------------
  // Escouade : lue dans le texte.
  "Endless Foot Assault": {
    abilities: [
      triggered(
        when.attackWith(),
        fx.forEachPlayer(ref.eachOpponent, (p) => [fx.createTappedTokens(NINJA, 1, { attacking: p })]),
        { label: "Vous attaquez : pour chaque adversaire, un Ninja 1/1 engagé qui l'attaque" },
      ),
    ],
  },
  "High Score": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "Un marqueur +1/+1 de plus sur vos créatures",
      }),
      triggered(when.yourEndStep, [fx.draw(1)], {
        condition: cond.controlsGreatestPower,
        label: "Vous contrôlez la créature de plus grande force : piochez une carte",
      }),
    ],
  },
  "Level Up": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.attached, 1)], { label: "Un marqueur +1/+1 sur la créature enchantée" }),
      staticAbility(
        "attached",
        {
          addAbilities: [
            triggered(
              when.attacksSelf,
              [fx.doubleCounters(ref.self), ...fx.when(cond.amountAtLeast(amount.powerOf(ref.self), 10), fx.draw(1))],
              { label: "Doublez ses marqueurs +1/+1 ; force 10 ou plus : piochez une carte" },
            ),
          ],
        },
        { label: "« Quand elle attaque, doublez ses marqueurs +1/+1, puis piochez si sa force est de 10 ou plus »" },
      ),
    ],
  },
  "Ninja Pizza": {
    abilities: [
      staticAbility(
        { subtype: "Food", controller: "you" },
        { addAbilities: [manaAbility(ANY_COLOR, 1, { sacrifice: true })] },
        { label: "Vos Nourritures ont « {T}, sacrifiez-le : un mana de n'importe quelle couleur »" },
      ),
      triggered(when.secondMain, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
    ],
  },
  "Together Forever": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Soutien 2",
      }),
      activated({
        mana: "{1}",
        targets: [{ ...target.creature("t", { withCounter: "any" }), label: "créature avec un marqueur" }],
        effects: [
          fx.whenThisTurn(when.dies({}), ref.target(), [fx.toHand(ref.eventObject)], {
            label: "Elle meurt : renvoyez la carte dans la main de son propriétaire",
          }),
        ],
        label: "Si elle meurt ce tour-ci, elle revient en main",
      }),
    ],
  },

  // --- Éphémères et rituels -----------------------------------------------------------------------------------------
  "Blasphemous Act": {
    costReduction: { generic: amount.count({ types: ["Creature"] }) },
    spell: spell([], [fx.damageAll(13, { types: ["Creature"] })]),
  },
  "Continue?": {
    spell: spell(
      [
        target.upTo(
          4,
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], fromBattlefieldThisTurn: true },
            "you",
            "carte de créature mise dans votre cimetière depuis le champ de bataille ce tour-ci",
          ),
        ),
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  Cultivate: {
    spell: spell(
      [],
      [
        // Les terrains trouvés passent par la main ; l'un d'eux va ensuite sur le champ de bataille engagé.
        fx.search(BASIC_LAND, { to: "hand" }, 2, undefined, "lands"),
        fx.pickFromZone(
          "hand",
          BASIC_LAND,
          { to: "battlefield", tapped: true },
          { pool: ref.stored("lands"), prompt: "Le terrain à mettre sur le champ de bataille engagé" },
        ),
      ],
    ),
  },
  // Fusion : lue dans le texte (les deux moitiés ont des noms de cibles distincts).
  "Double Jump": {
    spell: spell(
      [target.creature("j", { controller: "you" })],
      [fx.counters(ref.target("j"), "flying"), fx.modify(ref.target("j"), {}, "endOfTurn", 5)],
    ),
  },
  "Flying Kick": {
    spell: spell(
      [target.creature("ka", { controller: "you" }), target.creature("kb", { controller: "opponent" })],
      [bite("ka", "kb")],
    ),
  },
  "Fast Forward": {
    costReduction: { generic: amount.opponentsAttackedThisTurn },
    spell: spell([], [fx.goad(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"], controller: "opponent" }))]),
  },
  "Game Over": {
    costReduction: { generic: 2, condition: cond.someoneAtHalfStartingLife },
    spell: spell([], [fx.destroyAll({ types: ["Creature"] })]),
  },
  Harmonize: { spell: spell([], [fx.draw(3)]) },
  "Here Comes a New Hero!": {
    spell: spell(
      [
        target.player("p"),
        { ...target.upTo(1, target.creature("c")), maxManaValueAmount: amount.x, label: "créature de valeur de mana X ou moins" },
      ],
      [fx.draw(amount.x, ref.target("p")), fx.copyToken(ref.target("c"))],
    ),
  },
  Shellshock: {
    spell: spell(
      [
        {
          ...target.upTo(3, target.creature("t", { controller: "opponent" })),
          differentPlayers: true,
          countAmount: amount.refCount(ref.eachOpponent),
          label: "jusqu'à une créature par adversaire",
        },
      ],
      [fx.damage(amount.x, ref.target()), ...fx.when(cond.xAtLeast(1), fx.createTokens(MUTAGEN, amount.refCount(ref.target())))],
    ),
  },
  "Special Move": {
    spell: chooseTwo(
      {
        label: "Coup de pied sauté : détruisez un artefact",
        targets: [target.permanent("ja", ["Artifact"], {}, "artefact")],
        effects: [fx.destroy(ref.target("ja"))],
      },
      {
        label: "Charge : deux marqueurs +1/+1 sur votre créature attaquante ou bloqueuse",
        targets: [
          {
            ...target.creature("da", { controller: "you", anyOf: [{ attacking: true }, { blocking: true }] }),
            label: "créature attaquante ou bloqueuse à vous",
          },
        ],
        effects: [fx.addCounters(ref.target("da"), 2)],
      },
      {
        label: "Lancer du Foot : votre créature blesse une autre cible, puis sacrifiez-la",
        targets: [target.creature("fa", { controller: "you" }), { ...target.any("fb"), otherThan: ["fa"] }],
        effects: [bite("fa", "fb"), fx.sacrificeIt(ref.target("fa"))],
      },
    ),
  },
  // Réplique : lue dans le texte.
  "Super Combo": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [bite("a", "b")],
    ),
  },
  "Swift Demise": {
    spell: spell(
      [target.creature()],
      [fx.damage(1, ref.target()), fx.destroyAll({ types: ["Creature"], controller: "opponent", dealtDamageThisTurn: true })],
    ),
  },
  "Vanquish the Horde": {
    costReduction: { generic: amount.count({ types: ["Creature"] }) },
    spell: spell([], [fx.destroyAll({ types: ["Creature"] })]),
  },
  "Wave Goodbye": {
    spell: spell(
      [],
      [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], not: { withCounter: "+1/+1" } }, { to: "hand" })],
    ),
  },

  // --- Terrains -----------------------------------------------------------------------------------------------------
  "Big Apple, 3 a.m.": {
    chooseOnEnter: "color",
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["W"], 1, { produceChosen: true }),
      activated({
        mana: "{5}",
        tap: true,
        effects: [fx.createTokens(RAT, amount.refCount(ref.eachOpponent))],
        label: "Un Rat 1/1 par adversaire",
      }),
    ],
  },
  "Grand Coliseum": {
    abilities: [entersWith({ tapped: true }), manaAbility("C"), manaAbility(ANY_COLOR, 1, { drawback: { damageYou: 1 } })],
  },
  "Hidden Hideout": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(ANY_COLOR, 1, { commanderIdentity: true }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          { ...target.creature("t", { controller: "you", withCounter: "any" }), label: "créature à vous avec un marqueur" },
        ],
        effects: [fx.pump(ref.target(), 0, 0, ["lifelink"])],
        label: "Lien de vie jusqu'à la fin du tour",
      }),
    ],
  },
  // Cycle {2} et types de terrain : lus dans le texte.
  "Rain-Slicked Copse": { abilities: [entersWith({ tapped: true })] },
  "Thriving Grove": thriving("G"),
  "Thriving Isle": thriving("U"),
  "Thriving Moor": thriving("B"),
};
