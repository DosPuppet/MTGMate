/**
 * Commander : deck « I Am Ninja, Sneaking in the Shadows » (Dark Leo & Shredder ; blanc et noir ; liste de Fullmoon).
 * Ninjas et ninjutsu, attaquants imblocables ou presque (Whispersilk Cloak, Access Tunnel, Sonic Screwdriver, Shizo,
 * Cover of Darkness, The Black Gate), copies (Helm of the Host, Legion Loyalty, Strionic Resonator), perte de points de
 * vie (Wound Reflection, Astarion). Tainted Field est avec les autres terrains « contaminés » (`edh/lands.ts`).
 */
import type { Amount, CardScript, ModeDef, ObjectFilter, Ref } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  block,
  cond,
  fx,
  manaAbility,
  mode,
  myriadAbility,
  ninjutsu,
  protection,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Points de vie perdus ce tour-ci par le joueur désigné. */
const lifeLostBy = (p: Ref): Amount => ({ kind: "turnEvents", query: { event: "lifeLoss", sum: true }, of: p });
/** « Imblocable ce tour-ci. » */
const unblockable = (r: Ref = ref.target()) => fx.modify(r, { addKeywords: ["unblockable"] });

/** Akroma's Will : les deux modes. */
const AKROMA_FLYING: ModeDef = mode(
  "Vol, vigilance et double initiative",
  [],
  [fx.modifyAll(CREATURE_YOU, { addKeywords: ["flying", "vigilance", "doubleStrike"] })],
);
const AKROMA_LIFELINK: ModeDef = mode(
  "Lien de vie, indestructible et protection contre chaque couleur",
  [],
  [
    fx.modifyAll(CREATURE_YOU, {
      addKeywords: ["lifelink", "indestructible"],
      addProtections: [protection.from({ colors: ["W", "U", "B", "R", "G"] }, "Protection contre chaque couleur")],
    }),
  ],
);

/** « Un joueur qui a le plus de points de vie ou qui est à égalité » (adversaires d'abord : la suggestion). */
const MOST_LIFE = { kind: "mostLife" } as const;
const PLAYERS_WITH_MOST_LIFE: Ref = ref.union(
  ref.playersWhere(ref.eachOpponent, MOST_LIFE),
  ref.playersWhere(ref.you, MOST_LIFE),
);

export const EDH_DARK_LEO: Record<string, CardScript> = {
  // --- Ninjas -------------------------------------------------------------------------------------------------------
  "Ink-Eyes, Servant of Oni": {
    abilities: [
      ninjutsu("{3}{B}{B}"),
      triggered(
        when.combatDamageToPlayer,
        fx.may("Mettre cette carte de créature sur le champ de bataille sous votre contrôle ?", [
          fx.toBattlefield(ref.target("c"), { underYourControl: true }),
        ]),
        {
          targets: [
            target.of(
              ref.eventPlayer,
              target.cardInGraveyard("c", { types: ["Creature"] }, "any", "carte de créature de son cimetière"),
            ),
          ],
          label: "Une carte de créature du cimetière de ce joueur sur le champ de bataille sous votre contrôle",
        },
      ),
      activated({ mana: "{1}{B}", effects: [fx.regenerate(ref.self)], label: "Régénérez Ink-Eyes" }),
    ],
  },
  "Nashi, Moon Sage's Scion": {
    abilities: [
      ninjutsu("{3}{B}"),
      triggered(
        when.combatDamageToPlayer,
        [fx.exileTop(ref.eachPlayer, 1, "nashi"), fx.grantPlay(ref.stored("nashi"), { oneOf: true, payLifeManaValue: true })],
        {
          label:
            "Exilez la carte du dessus de chaque bibliothèque ; vous pouvez jouer l'une d'elles ce tour-ci, un sort en payant des PV égaux à sa valeur de mana",
        },
      ),
    ],
  },
  "Nezumi Prowler": {
    abilities: [
      ninjutsu("{1}{B}"),
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["deathtouch", "lifelink"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une créature que vous contrôlez gagne le contact mortel et le lien de vie",
      }),
    ],
  },
  "Okiba-Gang Shinobi": {
    abilities: [
      ninjutsu("{3}{B}"),
      triggered(when.combatDamageToPlayer, [fx.discard(2, ref.eventPlayer)], { label: "Ce joueur défausse deux cartes" }),
    ],
  },
  "Orochi Soul-Reaver": {
    abilities: [
      ninjutsu("{3}{B}"),
      triggered(
        when.combatDamageBatch(CREATURE_YOU),
        [fx.createTokens(TREASURE), fx.putFaceDown(ref.libraryTop(ref.eventPlayer))],
        { label: "Un Trésor, et manifestez la carte du dessus de la bibliothèque de ce joueur" },
      ),
    ],
  },
  "Throat Slitter": {
    abilities: [
      ninjutsu("{2}{B}"),
      triggered(when.combatDamageToPlayer, [fx.destroy(ref.target())], {
        targets: [
          target.of(ref.eventPlayer, target.creature("t", { not: { colors: ["B"] } }), "créature non noire de ce joueur"),
        ],
        label: "Détruisez une créature non noire de ce joueur",
      }),
    ],
  },
  Throatseeker: {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Ninja", controller: "you", attacking: true, blocked: false },
        { addKeywords: ["lifelink"] },
        { label: "Vos Ninjas attaquants non bloqués ont le lien de vie" },
      ),
    ],
  },

  // --- Autres créatures ---------------------------------------------------------------------------------------------
  "Archetype of Courage": {
    abilities: [
      staticAbility(CREATURE_YOU, { addKeywords: ["firstStrike"] }, { label: "Vos créatures ont l'initiative" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { forbidKeywords: ["firstStrike"] },
        { label: "Les créatures adverses perdent l'initiative et ne peuvent pas l'avoir ni l'acquérir" },
      ),
    ],
  },
  "Astarion, the Decadent": {
    // Contact mortel, lien de vie : lus dans le texte.
    abilities: [
      triggeredModal(
        when.yourEndStep,
        [
          mode(
            "Nourrir — un adversaire perd autant de PV qu'il en a perdu ce tour-ci",
            [target.player("o", "opponent")],
            [fx.loseLife(lifeLostBy(ref.target("o")), ref.target("o"))],
          ),
          mode(
            "Faux amis — gagnez autant de PV que vous en avez gagné ce tour-ci",
            [],
            [fx.gainLife(amount.turnEvents({ event: "lifeGain", who: "you", sum: true }))],
          ),
        ],
        { label: "Nourrir ou Faux amis" },
      ),
    ],
  },
  "Bloodline Pretender": {
    // Changelin : lu dans le texte.
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, subtypeChosen: true }),
        [fx.addCounters(ref.self, 1)],
        { label: "Une autre créature du type choisi arrive : un marqueur +1/+1" },
      ),
    ],
  },
  "Changeling Outcast": {
    // Changelin : lu dans le texte.
    keywords: ["cantBlock", "unblockable"],
  },
  "Leonardo, Worldly Warrior": {
    // Affinité pour les créatures ; double initiative (lue dans le texte).
    costReduction: { generic: amount.count(CREATURE_YOU) },
  },
  "Mirror Entity": {
    // Changelin : lu dans le texte.
    abilities: [
      activated({
        mana: "{X}",
        effects: [fx.setBasePTAll(CREATURE_YOU, amount.x), fx.modifyAll(CREATURE_YOU, { allCreatureTypes: true })],
        label: "Vos créatures ont une force et une endurance de base X/X et tous les types de créature",
      }),
    ],
  },
  "Splinter, Aging Champion": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.optional(target.creature("t", { tapped: true }))],
        label: "Détruisez jusqu'à une créature engagée",
      }),
      triggered(when.leavesSelf, [fx.draw(1), fx.draw(1, ref.target("p"))], {
        targets: [target.player("p", "opponent")],
        label: "Vous et un autre joueur ciblé piochez chacun une carte",
      }),
    ],
  },

  // --- Enchantements ------------------------------------------------------------------------------------------------
  "Cover of Darkness": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { types: ["Creature"], subtypeChosen: true },
        { addBlockRules: [block.fear] },
        { label: "Les créatures du type choisi ont la peur" },
      ),
    ],
  },
  "Legion Loyalty": {
    abilities: [staticAbility(CREATURE_YOU, { addAbilities: [myriadAbility()] }, { label: "Vos créatures ont la myriade" })],
  },
  "No Mercy": {
    abilities: [
      triggered(when.dealsDamage({ types: ["Creature"] }, { to: { players: "you" } }), [fx.destroy(ref.eventObject)], {
        label: "Une créature vous inflige des blessures : détruisez-la",
      }),
    ],
  },
  "Wound Reflection": {
    abilities: [
      triggered(
        when.eachEndStep,
        fx.forEachPlayer(ref.eachOpponent, (p) => [fx.loseLife(lifeLostBy(p), p)]),
        { label: "Chaque adversaire perd autant de PV qu'il en a perdu ce tour-ci" },
      ),
    ],
  },

  // --- Éphémères -------------------------------------------------------------------------------------------------------
  "Akroma's Will": {
    spell: {
      modes: [
        AKROMA_FLYING,
        AKROMA_LIFELINK,
        {
          label: "Les deux (vous contrôlez un commandant)",
          targets: [],
          effects: [...AKROMA_FLYING.effects, ...AKROMA_LIFELINK.effects],
          condition: cond.controls({ commander: true }),
        },
      ],
    },
  },

  // --- Artefacts ----------------------------------------------------------------------------------------------------
  "Helm of the Host": {
    // Équipement {5} : lu dans le texte.
    abilities: [
      triggered(when.yourCombat, [fx.copyToken(ref.attached, { nonlegendary: true, addKeywords: ["haste"] })], {
        label: "Un jeton copie non légendaire de la créature équipée, avec la célérité",
      }),
    ],
  },
  "Sonic Screwdriver": {
    abilities: [
      manaAbility(ANY_COLOR),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { other: true }, "autre artefact")],
        effects: [fx.untap(ref.target())],
        label: "Dégagez un autre artefact",
      }),
      activated({ mana: "{2}", tap: true, effects: [fx.scry(1)], label: "Regard 1" }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [unblockable()],
        label: "Une créature ne peut pas être bloquée ce tour-ci",
      }),
    ],
  },
  "Strionic Resonator": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "capacité déclenchée que vous contrôlez",
            filter: { stackItems: { triggeredOnly: true, controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copiez une capacité déclenchée que vous contrôlez",
      }),
    ],
  },
  "Whispersilk Cloak": {
    // Équipement {2} : lu dans le texte.
    abilities: [staticAbility("attached", { addKeywords: ["unblockable", "shroud"] }, { label: "Imblocable et défense totale" })],
  },

  // --- Terrains -----------------------------------------------------------------------------------------------------
  "Access Tunnel": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature("t", { maxPower: 3 })],
        effects: [unblockable()],
        label: "Une créature de force 3 ou moins ne peut pas être bloquée ce tour-ci",
      }),
    ],
  },
  "Shizo, Death's Storehouse": {
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{B}",
        tap: true,
        targets: [target.creature("t", { legendary: true })],
        effects: [fx.modify(ref.target(), { addBlockRules: [block.fear] })],
        label: "Une créature légendaire gagne la peur",
      }),
    ],
  },
  "The Black Gate": {
    // « Vous pouvez payer 3 PV, sinon elle arrive engagée » : lu dans le texte.
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{1}{B}",
        tap: true,
        targets: [target.creature()],
        effects: [
          fx.chooseAmong(PLAYERS_WITH_MOST_LIFE, ref.you, "gate", {
            prompt: "Choisissez un joueur qui a le plus de points de vie (ou à égalité)",
          }),
          fx.modify(ref.target(), {
            addBlockRules: [block.notByPlayer(ref.stored("gate"), "Ne peut pas être bloquée par les créatures du joueur choisi")],
          }),
        ],
        label: "Une créature ne peut pas être bloquée par les créatures d'un joueur qui a le plus de PV",
      }),
    ],
  },
};
