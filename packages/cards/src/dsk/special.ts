/**
 * Duskmourn, lot B : Imminence (Overlords), Enduring, coûts additionnels choisis automatiquement, Équipements qui
 * manifestent l'effroi, portes à déverrouiller ou à verrouiller.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CREATURE_YOU_CONTROL,
  EVERYWHERE,
  eerie,
  fx,
  INSECT_2_1,
  manaAbility,
  ROOM,
  ref,
  SPIRIT_3_1,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

type Abilities = NonNullable<CardScript["abilities"]>;
type Opts = Parameters<typeof triggered>[2];

/** « Chaque fois que ce permanent arrive ou attaque, … » */
const entersOrAttacks = (effects: Parameters<typeof triggered>[1], opts: Opts = {}): Abilities => [
  triggered(when.entersSelf, effects, opts),
  triggered(when.attacksSelf, effects, opts),
];

/** Enduring : « Quand [elle] meurt, si c'était une créature, renvoyez-la ; c'est un enchantement (pas une créature). » */
const enduring = triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { setTypes: ["Enchantment"], setSubtypes: [] })], {
  label: "Revient : c'est un enchantement",
});

/** « Quand cet Équipement arrive, manifestez l'effroi, puis attachez-le à cette créature. » */
const manifestAttach = triggered(when.entersSelf, [fx.manifestDreadBy({ store: "m" }), fx.attach(ref.stored("m"))], {
  label: "Manifestation effroyable, attachez-le",
});

const ROOM_YOU_CONTROL = target.permanent("r", ["Enchantment"], { ...ROOM, controller: "you" }, "Salle que vous contrôlez");

export const SPECIAL: Record<string, CardScript> = {
  // Imminence (le coût et les marqueurs de temps sont lus dans le texte).
  "Overlord of the Mistmoors": {
    abilities: entersOrAttacks([fx.createTokens(INSECT_2_1, 2)], { label: "Deux Insectes 2/1 volants" }),
  },
  "Overlord of the Floodpits": {
    abilities: entersOrAttacks([fx.draw(2), fx.discard(1)], { label: "Piochez deux cartes, défaussez-en une" }),
  },
  "Overlord of the Balemurk": {
    abilities: entersOrAttacks(
      [
        fx.mill(4),
        fx.pickFromZone(
          "graveyard",
          { anyOf: [{ types: ["Creature"], notSubtype: "Avatar" }, { types: ["Planeswalker"] }] },
          { to: "hand" },
          { min: 0, prompt: "Une créature non-Avatar ou un planeswalker" },
        ),
      ],
      { label: "Meulez 4, une créature en main" },
    ),
  },
  "Overlord of the Boilerbilges": {
    abilities: entersOrAttacks([fx.damage(4, ref.target())], { targets: [target.any()], label: "4 blessures" }),
  },
  "Overlord of the Hauntwoods": {
    abilities: entersOrAttacks([fx.createTappedTokens(EVERYWHERE)], { label: "Terrain Everywhere engagé" }),
  },

  // Enduring
  "Enduring Innocence": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true, maxPower: 2 }), [fx.draw(1)], {
        oncePerTurn: true,
        batched: true,
        label: "Piochez une carte",
      }),
      enduring,
    ],
  },
  "Enduring Curiosity": {
    abilities: [triggered(when.combatDamage(CREATURE_YOU_CONTROL, true), [fx.draw(1)], { label: "Piochez une carte" }), enduring],
  },
  "Enduring Tenacity": {
    abilities: [
      triggered(when.gainLife, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Un adversaire perd autant de PV",
      }),
      enduring,
    ],
  },
  "Enduring Courage": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true }), [fx.pump(ref.eventObject, 2, 0, ["haste"])], {
        label: "+2/+0 et la célérité",
      }),
      enduring,
    ],
  },
  "Enduring Vitality": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addAbilities: [manaAbility(["W", "U", "B", "R", "G"])] },
        { label: "Vos créatures : « {T} : un mana de n'importe quelle couleur »" },
      ),
      enduring,
    ],
  },

  // Coûts additionnels (choisis automatiquement)
  "Fear of Abduction": {
    additionalCost: { exile: { filter: { types: ["Creature"] }, count: 1 } },
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exilez une créature adverse",
      }),
      triggered(when.leavesSelf, [fx.toHand(ref.linked)], { label: "Les cartes exilées reviennent en main" }),
    ],
  },
  "Abhorrent Oculus": {
    additionalCost: { exileGraveyard: 6 },
    abilities: [triggered(when.step("upkeep", "opponent"), [fx.manifestDread], { label: "Manifestation effroyable" })],
  },
  "Fear of Isolation": { additionalCost: { bounce: { filter: {}, count: 1 } } },
  "Fear of Exposure": { additionalCost: { tap: { filter: { types: ["Creature", "Land"] }, count: 2 } } },

  // Équipements qui manifestent l'effroi
  "Cursed Windbreaker": {
    abilities: [manifestAttach, staticAbility("attached", { addKeywords: ["flying"] }, { label: "Le vol" })],
  },
  "Killer's Mask": {
    abilities: [manifestAttach, staticAbility("attached", { addKeywords: ["menace"] }, { label: "La menace" })],
  },
  "Conductive Machete": {
    abilities: [manifestAttach, staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" })],
  },
  "Dissection Tools": {
    abilities: [
      manifestAttach,
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addKeywords: ["deathtouch", "lifelink"] },
        {
          label: "+2/+2, contact mortel et lien de vie",
        },
      ),
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.attach(ref.target())],
        label: "Équiper — sacrifiez une créature",
      }),
    ],
  },

  // Salles dont une porte manifeste l'effroi
  "Underwater Tunnel": {
    abilities: [triggered(when.unlockThisDoor, [fx.surveil(2)], { label: "Surveillance 2" })],
  },
  "Slimy Aquarium": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.manifestDreadBy({ store: "m" }), fx.addCounters(ref.stored("m"), 1)], {
        label: "Manifestation effroyable, marqueur +1/+1",
      }),
    ],
  },
  "Moldering Gym": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        label: "Un terrain de base engagé",
      }),
    ],
  },
  "Weight Room": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.manifestDreadBy({ store: "m" }), fx.addCounters(ref.stored("m"), 3)], {
        label: "Manifestation effroyable, trois marqueurs +1/+1",
      }),
    ],
  },

  // Portes
  "Ghostly Dancers": {
    abilities: [
      // « … ou … » : choisi à la résolution (608.2d), pas un mode.
      triggered(
        when.entersSelf,
        fx.yourChoice("Ghostly Dancers…", "k", [
          {
            label: "Un enchantement de votre cimetière en main",
            effects: [
              fx.pickFromZone("graveyard", { types: ["Enchantment"] }, { to: "hand" }, { prompt: "Carte d'enchantement" }),
            ],
          },
          { label: "Déverrouillez une porte", effects: [fx.door(ref.permanentsOf(ref.you, ROOM))] },
        ]),
        { label: "Enchantement en main, ou porte déverrouillée" },
      ),
      eerie([fx.createTokens(SPIRIT_3_1)], { label: "Esprit 3/1 volant" }),
    ],
  },
  "Ghostly Keybearer": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.door(ref.target("r"))], {
        targets: [target.upTo(1, ROOM_YOU_CONTROL)],
        label: "Déverrouillez une porte",
      }),
    ],
  },
  "Keys to the House": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND)],
        label: "Cherchez un terrain de base",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [ROOM_YOU_CONTROL],
        effects: [fx.door(ref.target("r"), "toggle")],
        label: "Verrouillez ou déverrouillez une porte",
      }),
    ],
  },
  "Marina Vendrell": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(7, { filter: { types: ["Enchantment"] }, count: 7, rest: "bottom" })], {
        label: "Les enchantements parmi les sept du dessus en main",
      }),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [ROOM_YOU_CONTROL],
        effects: [fx.door(ref.target("r"), "toggle")],
        label: "Verrouillez ou déverrouillez une porte",
      }),
    ],
  },
};
