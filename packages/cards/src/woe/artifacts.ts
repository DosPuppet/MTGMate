/** Wilds of Eldraine — cartes incolores et terrains. */
import type { Color, Effect, LayerMods, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  cond,
  entersWith,
  equipAbility,
  fx,
  manaAbility,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

/** « {N}, {T} : ajoutez un mana de n'importe quelle couleur » (capacité de mana à coût, résolue sans la pile). */
const anyColor = (mana: string, opts: { tap?: boolean; oncePerTurn?: boolean } = {}) =>
  activated({ mana, ...opts, effects: [fx.addManaChoice(1)], label: "Ajoutez un mana de n'importe quelle couleur" });

/** Nourriture : « {2}, {T}, sacrifiez [ce permanent] : vous gagnez 3 points de vie. » */
const foodAbility = () =>
  activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Gagnez 3 points de vie" });

/**
 * Terrains « Restless » : arrivent engagés ; {T} : l'une des deux couleurs ; le terrain devient une créature jusqu'à la
 * fin du tour (c'est toujours un terrain) ; capacité quand il attaque.
 */
const restless = (
  colors: [Color, Color],
  animate: { mana: string; subtype: string; power: number; toughness: number; extra?: LayerMods },
  onAttack: { effects: Effect[]; targets?: TargetSpec[]; label: string },
): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Arrive engagé" }),
    manaAbility(colors),
    activated({
      mana: animate.mana,
      effects: [
        fx.modify(ref.self, {
          addTypes: ["Creature"],
          addSubtypes: [animate.subtype],
          setPower: animate.power,
          setToughness: animate.toughness,
          setColors: colors,
          ...animate.extra,
        }),
      ],
      label: `Devient une créature ${animate.power}/${animate.toughness}`,
    }),
    triggered(when.attacksSelf, onAttack.effects, { targets: onAttack.targets, label: onAttack.label }),
  ],
});

/** Everflame, Heroes' Legacy (The Irencrag transformé) : Équiper {3} et « la créature équipée gagne +3/+3 ». */
const EVERFLAME_EQUIP = equipAbility({ mana: "{3}", label: "Équiper {3}" });
/** L'Irencrag n'est pas encore devenu Everflame (ses capacités d'origine ne s'appliquent qu'avant). */
const NOT_EVERFLAME = cond.sourceMatches({ notSubtype: "Equipment" });

export const ARTIFACTS: Record<string, CardScript> = {
  "Collector's Vault": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        effects: [...fx.loot(1), fx.createTokens(TREASURE)],
        label: "Piochez, défaussez, puis un Trésor",
      }),
    ],
  },
  "Eriette's Tempting Apple": {
    abilities: [
      triggered(when.entersSelf, [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"])], {
        targets: [target.creature()],
        label: "Contrôle d'une créature jusqu'à la fin du tour, dégagée, avec la célérité",
      }),
      foodAbility(),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.loseLife(3, ref.target())],
        label: "Un adversaire perd 3 points de vie",
      }),
    ],
  },
  Gingerbrute: {
    abilities: [
      activated({
        mana: "{1}",
        effects: [
          fx.modify(ref.self, {
            addBlockRules: [
              block.notBy({ not: { keyword: "haste" } }, "Ne peut être bloquée que par des créatures avec la célérité"),
            ],
          }),
        ],
        label: "Ne peut être bloquée que par des créatures avec la célérité ce tour-ci",
      }),
      foodAbility(),
    ],
  },
  "Hylda's Crown of Winter": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        reduction: { generic: 1, condition: cond.yourTurn },
        label: "Engagez une créature (coûte {1} de moins pendant votre tour)",
      }),
      activated({
        mana: "{3}",
        sacrifice: true,
        effects: [fx.draw(amount.count({ types: ["Creature"], controller: "opponent", tapped: true }))],
        label: "Piochez une carte par créature adverse engagée",
      }),
    ],
  },
  "The Irencrag": {
    // « … et perd toutes ses autres capacités » : ses deux capacités d'origine ne s'appliquent plus une fois qu'il est
    // devenu un Équipement (équivalent ; un effet « perd toutes ses capacités » retirerait aussi celles qu'il gagne).
    abilities: [
      manaAbility("C", 1, { condition: NOT_EVERFLAME }),
      triggered(
        when.enters({ types: ["Creature"], legendary: true, controller: "you" }),
        fx.may(
          "Faire de The Irencrag l'Équipement légendaire Everflame, Heroes' Legacy ?",
          fx.modify(
            ref.self,
            {
              setName: "Everflame, Heroes' Legacy",
              addSubtypes: ["Equipment"],
              addAbilities: [
                EVERFLAME_EQUIP,
                staticAbility("attached", { power: 3, toughness: 3 }, { label: "La créature équipée gagne +3/+3" }),
              ],
            },
            "permanent",
          ),
        ),
        { condition: NOT_EVERFLAME, label: "Peut devenir Everflame, Heroes' Legacy" },
      ),
    ],
  },
  "Prophetic Prism": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" }), anyColor("{1}", { tap: true })],
  },
  "Scarecrow Guide": { abilities: [anyColor("{1}", { oncePerTurn: true })] },
  "Syr Ginger, the Meal Ender": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["trample", "hexproof", "haste"] },
        {
          condition: cond.battlefieldCount({ types: ["Planeswalker"], controller: "opponent" }, 1),
          label: "Piétinement, défense talismanique et célérité tant qu'un adversaire contrôle un planeswalker",
        },
      ),
      triggered(
        { on: "leaves", who: { types: ["Artifact"], controller: "you", other: true }, to: "graveyard" },
        [fx.addCounters(ref.self, 1), fx.scry(1)],
        { label: "Un autre artefact mis au cimetière : un marqueur +1/+1 et regard 1" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(amount.powerOf(ref.self))],
        label: "Gagnez autant de points de vie que sa force",
      }),
    ],
  },
  "Three Bowls of Porridge": {
    // « Choisissez un mode qui n'a pas déjà été choisi » : chaque mode est une capacité activable une seule fois.
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        once: true,
        targets: [target.creature()],
        effects: [fx.damage(2, ref.target())],
        label: "2 blessures à une créature",
      }),
      activated({
        mana: "{2}",
        tap: true,
        once: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Engagez une créature",
      }),
      activated({
        mana: "{2}",
        tap: true,
        once: true,
        effects: [fx.sacrificeIt(ref.self), fx.gainLife(3)],
        label: "Sacrifiez-le et gagnez 3 points de vie",
      }),
    ],
  },

  // --- Terrains ----------------------------------------------------------------
  "Crystal Grotto": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(1)], { label: "Regard 1" }),
      manaAbility("C"),
      anyColor("{1}", { tap: true }),
    ],
  },
  "Edgewall Inn": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      manaAbility([...ALL_COLORS], 1, { produceChosen: true }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { adventure: true }, "you", "carte avec une Aventure de votre cimetière")],
        effects: [fx.toHand(ref.target())],
        label: "Renvoie en main une carte avec une Aventure",
      }),
    ],
  },
  "Restless Bivouac": restless(
    ["R", "W"],
    { mana: "{1}{R}{W}", subtype: "Ox", power: 2, toughness: 2 },
    {
      effects: [fx.addCounters(ref.target(), 1)],
      targets: [target.creature("t", { controller: "you" })],
      label: "Un marqueur +1/+1 sur une créature que vous contrôlez",
    },
  ),
  "Restless Fortress": restless(
    ["W", "B"],
    { mana: "{2}{W}{B}", subtype: "Nightmare", power: 1, toughness: 4 },
    {
      effects: [fx.loseLife(2, ref.defendingPlayer), fx.gainLife(2)],
      label: "Le joueur défenseur perd 2 points de vie et vous en gagnez 2",
    },
  ),
  "Restless Spire": restless(
    ["U", "R"],
    {
      mana: "{U}{R}",
      subtype: "Elemental",
      power: 2,
      toughness: 1,
      extra: {
        addAbilities: [
          staticAbility(
            "self",
            { addKeywords: ["firstStrike"] },
            { condition: cond.yourTurn, label: "L'initiative pendant votre tour" },
          ),
        ],
      },
    },
    { effects: [fx.scry(1)], label: "Regard 1" },
  ),
  "Restless Vinestalk": restless(
    ["G", "U"],
    { mana: "{3}{G}{U}", subtype: "Plant", power: 5, toughness: 5, extra: { addKeywords: ["trample"] } },
    {
      effects: [fx.modify(ref.target(), { setPower: 3, setToughness: 3 })],
      targets: [target.optional(target.creature("t", { other: true }))],
      label: "Jusqu'à une autre créature a une force et une endurance de base de 3/3",
    },
  ),
};
