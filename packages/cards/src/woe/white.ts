/**
 * Wilds of Eldraine — cartes blanches (lot A). Les Aventures ont une entrée par face (la créature sous son nom, le sort
 * d'Aventure sous le nom de l'Aventure) ; le Marchandage est lu dans le texte (`cond.kicked`).
 */
import type { ObjectFilter, TargetSpec, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  CELEBRATION,
  CURSED_ROLE,
  chapter,
  cond,
  createRole,
  FOOD,
  fx,
  INSTANT_SORCERY,
  KNIGHT_VIGILANCE,
  modal,
  mode,
  playerStatic,
  ROYAL_ROLE,
  ref,
  SORCERER_ROLE,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
  YOUNG_HERO_ROLE,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const ENCHANT_CREATURE = { filter: { types: ["Creature" as const] }, label: "créature" };
const YOUR_CREATURE = () => target.creature("t", { controller: "you" });
const OPP_CREATURE = () => target.creature("t", { controller: "opponent" });
/** « Chaque fois qu'un enchantement que vous contrôlez est mis dans un cimetière depuis le champ de bataille » */
const YOUR_ENCHANTMENT_TO_GRAVEYARD: TriggerSpec = {
  on: "leaves",
  who: { types: ["Enchantment"], controller: "you" },
  to: "graveyard",
};
/** « Chaque fois qu'un enchantement que vous contrôlez arrive » */
const YOUR_ENCHANTMENT_ENTERS = when.enters({ types: ["Enchantment"], controller: "you" });

/** Oiseau : créature blanche 1/1 avec le vol. */
const BIRD: TokenSpec = {
  name: "Bird",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Bird"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
/** Souris : créature blanche 1/1. */
const MOUSE: TokenSpec = { name: "Mouse", colors: ["W"], types: ["Creature"], subtypes: ["Mouse"], power: 1, toughness: 1 };

const TOKEN_YOU_CONTROL: TargetSpec = {
  id: "t",
  label: "jeton que vous contrôlez",
  filter: { objects: { token: true, controller: "you" } },
};

export const WHITE: Record<string, CardScript> = {
  "Solitary Sanctuary": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature adverse, marqueur d'étourdissement",
      }),
      triggered(
        { on: "taps", who: { types: ["Creature"], controller: "opponent" }, byYou: true },
        [fx.addCounters(ref.target(), 1)],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Vous engagez une créature adverse : un marqueur +1/+1 sur une créature que vous contrôlez",
        },
      ),
    ],
  },
  // Vol lu dans le texte.
  "Archon of the Wild Rose": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true, enchanted: "byYou" },
        { setPower: 4, setToughness: 4, addKeywords: ["flying"] },
        { label: "Vos autres créatures enchantées par vos Auras : 4/4 de base, avec le vol" },
      ),
    ],
  },
  "A Tale for the Ages": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", enchanted: true },
        { power: 2, toughness: 2 },
        { label: "Vos créatures enchantées : +2/+2" },
      ),
    ],
  },
  "Archon's Glory": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 2, 2), ...fx.when(cond.kicked, fx.pump(ref.target(), 0, 0, ["flying", "lifelink"]))],
    ),
  },
  "Armory Mice": {
    abilities: [staticAbility("self", { toughness: 2 }, { condition: CELEBRATION, label: "Célébration : +0/+2" })],
  },
  // Aventure : la créature est vanille.
  "Besotted Knight": {},
  "Betroth the Beast": { spell: spell([YOUR_CREATURE()], [...createRole(ROYAL_ROLE)]) },
  "Break the Spell": {
    spell: spell(
      [target.permanent("t", ["Enchantment"], {}, "enchantement")],
      [
        fx.destroy(ref.target()),
        // « Détruit de cette façon » : la cible n'existe plus (`filtered` ne garde que les objets présents) ; ses
        // dernières informations connues disent si vous la contrôliez ou si c'était un jeton.
        ...fx.when(
          cond.all(
            cond.not(cond.refMatches(ref.filtered(ref.target(), {}), {})),
            cond.refMatches(ref.target(), { anyOf: [{ controller: "you" }, { token: true }] }),
          ),
          fx.draw(1),
        ),
      ],
    ),
  },
  "Charmed Clothier": {
    abilities: [
      triggered(when.entersSelf, createRole(ROYAL_ROLE), {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Un Rôle royal sur une autre de vos créatures",
      }),
    ],
  },
  "Cheeky House-Mouse": {},
  "Squeak By": {
    spell: spell(
      [YOUR_CREATURE()],
      [
        fx.pump(ref.target(), 1, 1),
        fx.modify(ref.target(), {
          addBlockRules: [block.notBy({ minPower: 3 }, "Imblocable par les créatures de force 3 ou plus")],
        }),
      ],
    ),
  },
  "Cooped Up": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Ne peut ni attaquer ni bloquer" }),
      activated({ mana: "{2}{W}", effects: [fx.exile(ref.attached)], label: "Exilez la créature enchantée" }),
    ],
  },
  "Cursed Courtier": {
    abilities: [triggered(when.entersSelf, createRole(CURSED_ROLE, ref.self), { label: "Un Rôle maudit sur elle" })],
  },
  "Discerning Financier": {
    abilities: [
      triggered(when.yourUpkeep, [fx.createTokens(TREASURE)], {
        condition: cond.opponentHasMore("lands"),
        label: "Un adversaire a plus de terrains : un Trésor",
      }),
      // « Choisissez un autre joueur » (sans le cibler) : il gagne le contrôle du Trésor ciblé.
      activated({
        mana: "{2}{W}",
        targets: [target.permanent("t", ["Artifact"], { subtype: "Treasure", controller: "you" }, "Trésor que vous contrôlez")],
        effects: [
          fx.chooseOpponent("p", { prompt: "Choisissez le joueur qui gagne le contrôle du Trésor" }),
          fx.giveControl(ref.target(), ref.stored("p")),
          fx.draw(1),
        ],
        label: "Donnez un Trésor, piochez",
      }),
    ],
  },
  "Dutiful Griffin": {
    abilities: [
      activated({
        mana: "{2}{W}",
        sacrificeOther: { filter: { types: ["Enchantment"] }, count: 2 },
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Revient du cimetière en main",
      }),
    ],
  },
  "Eerie Interference": {
    spell: spell(
      [],
      [
        fx.thisTurn({ replacement: { event: "damage", to: "you", source: { types: ["Creature"] }, modify: { prevent: true } } }),
        fx.thisTurn({
          replacement: {
            event: "damage",
            to: "yourSide",
            toFilter: { types: ["Creature"] },
            source: { types: ["Creature"] },
            modify: { prevent: true },
          },
        }),
      ],
    ),
  },
  // « Choisissez un nombre entre 0 et 10 » : un mode par nombre (choisi au lancement plutôt qu'à la résolution).
  "Expel the Interlopers": {
    spell: modal(
      ...Array.from({ length: 11 }, (_, n) =>
        mode(`Nombre choisi : ${n}`, [], [fx.destroyAll({ types: ["Creature"], minPower: n })]),
      ),
    ),
  },
  "Frostbridge Guard": {
    abilities: [
      activated({
        mana: "{2}{W}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Engagez une créature",
      }),
    ],
  },
  "Gallant Pie-Wielder": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike"] },
        { condition: CELEBRATION, label: "Célébration : double initiative" },
      ),
    ],
  },
  "Glass Casket": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxManaValue: 3 })],
        label: "Exile une créature adverse de VM 3 ou moins",
      }),
    ],
  },
  "Hopeful Vigil": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_VIGILANCE)], { label: "Un Chevalier 2/2 avec la vigilance" }),
      triggered(when.putIntoGraveyardSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({ mana: "{2}{W}", effects: [fx.sacrificeIt(ref.self)], label: "Sacrifiez cet enchantement" }),
    ],
  },
  "Kellan's Lightblades": {
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [...fx.when(cond.kicked, fx.destroy(ref.target())), ...fx.when(cond.not(cond.kicked), fx.damage(3, ref.target()))],
    ),
  },
  "Knight of Doves": {
    abilities: [triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.createTokens(BIRD)], { label: "Un Oiseau 1/1 volant" })],
  },
  "Moment of Valor": {
    spell: modal(
      mode(
        "Dégagez une créature : +1/+0 et l'indestructibilité",
        [target.creature()],
        [fx.untap(ref.target()), fx.pump(ref.target(), 1, 0, ["indestructible"])],
      ),
      mode("Détruisez une créature de force 4 ou plus", [target.creature("t", { minPower: 4 })], [fx.destroy(ref.target())]),
    ),
  },
  "Moonshaker Cavalry": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(YOUR_CREATURES, amount.count(YOUR_CREATURES), amount.count(YOUR_CREATURES), ["flying"])],
        { label: "Vos créatures : le vol et +X/+X" },
      ),
    ],
  },
  "Plunge into Winter": {
    spell: spell([target.upTo(1, target.creature())], [fx.tap(ref.target()), fx.scry(1), fx.draw(1)]),
  },
  "The Princess Takes Flight": {
    abilities: [
      chapter([1], [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.upTo(1, target.creature())],
        label: "Chapitre I — Exilez jusqu'à une créature",
      }),
      chapter([2], [fx.pump(ref.target(), 2, 2, ["flying"])], {
        targets: [YOUR_CREATURE()],
        label: "Chapitre II — +2/+2 et le vol",
      }),
      chapter([3], [fx.toBattlefield(ref.linked)], { label: "Chapitre III — La carte exilée revient" }),
    ],
  },
  "Protective Parents": {
    abilities: [
      triggered(when.diesSelf, createRole(YOUNG_HERO_ROLE), {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Un Rôle de jeune héros",
      }),
    ],
  },
  "Regal Bunnicorn": { cdaPT: amount.count({ notTypes: ["Land"], controller: "you" }) },
  "Return Triumphant": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins")],
      [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "r" }), ...createRole(YOUNG_HERO_ROLE, ref.stored("r"))],
    ),
  },
  "Rimefur Reindeer": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_ENTERS, [fx.tap(ref.target())], {
        targets: [OPP_CREATURE()],
        label: "Engagez une créature adverse",
      }),
    ],
  },
  "Savior of the Sleeping": {
    abilities: [triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.addCounters(ref.self, 1)], { label: "Un marqueur +1/+1" })],
  },
  "Slumbering Keepguard": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_ENTERS, [fx.scry(1)], { label: "Regard 1" }),
      activated({
        mana: "{2}{W}",
        effects: [
          fx.pump(
            ref.self,
            amount.count({ types: ["Enchantment"], controller: "you" }),
            amount.count({ types: ["Enchantment"], controller: "you" }),
          ),
        ],
        label: "+1/+1 par enchantement que vous contrôlez",
      }),
    ],
  },
  "Spellbook Vendor": {
    abilities: [
      triggered(
        when.yourCombat,
        fx.mayPay("{1}", "Payer {1} pour un Rôle de sorcier ?", fx.reflexive([YOUR_CREATURE()], createRole(SORCERER_ROLE))),
        { label: "{1} : un Rôle de sorcier" },
      ),
    ],
  },
  "Stockpiling Celebrant": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(cond.targetChosen("t"), fx.may("Renvoyer ce permanent dans la main ?", fx.bounce(ref.target()), fx.scry(2))),
        {
          targets: [target.optional(target.nonland("t", { controller: "you", other: true }, "autre permanent non-terrain"))],
          label: "Renvoyez un permanent, regard 2",
        },
      ),
    ],
  },
  "Three Blind Mice": {
    abilities: [
      chapter([1], [fx.createTokens(MOUSE)], { label: "Chapitre I — Une Souris 1/1" }),
      chapter([2, 3], [fx.copyToken(ref.target())], {
        targets: [TOKEN_YOU_CONTROL],
        label: "Chapitres II, III — Copiez un de vos jetons",
      }),
      chapter([4], [fx.pumpAll(YOUR_CREATURES, 1, 1, ["vigilance"])], {
        label: "Chapitre IV — Vos créatures : +1/+1 et la vigilance",
      }),
    ],
  },
  "Tuinvale Guide": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["lifelink"] },
        { condition: CELEBRATION, label: "Célébration : +1/+0 et le lien de vie" },
      ),
    ],
  },
  "Unassuming Sage": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{2}", "Payer {2} pour un Rôle de sorcier ?", ...createRole(SORCERER_ROLE, ref.self)),
        { label: "{2} : un Rôle de sorcier" },
      ),
    ],
  },
  "Virtue of Loyalty": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCountersAll(YOUR_CREATURES), fx.untapAll(YOUR_CREATURES)], {
        label: "Un marqueur +1/+1 sur chacune de vos créatures, puis dégagez-les",
      }),
    ],
  },
  "Ardenvale Fealty": { spell: spell([], [fx.createTokens(KNIGHT_VIGILANCE)]) },
  "Werefox Bodyguard": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true, notSubtype: "Fox" }))],
        label: "Exile une autre créature non-Renard",
      }),
      activated({ mana: "{1}{W}", sacrifice: true, effects: [fx.gainLife(2)], label: "Gagnez 2 PV" }),
    ],
  },
  "Heartflame Duelist": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: INSTANT_SORCERY, keywords: ["lifelink"] },
        label: "Vos éphémères et rituels ont le lien de vie",
      }),
    ],
  },
  "Heartflame Slash": { spell: spell([target.any()], [fx.damage(3, ref.target())]) },
  "Pollen-Shield Hare": {
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, controller: "you" },
        { power: 1, toughness: 1 },
        { label: "Vos jetons de créature : +1/+1" },
      ),
    ],
  },
  "Hare Raising": {
    spell: spell(
      [YOUR_CREATURE()],
      [fx.pump(ref.target(), amount.count(YOUR_CREATURES), amount.count(YOUR_CREATURES), ["vigilance"])],
    ),
  },
  "Shrouded Shepherd": {
    abilities: [triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2)], { targets: [YOUR_CREATURE()], label: "+2/+2" })],
  },
  "Cleave Shadows": { spell: spell([], [fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -1, -1)]) },
  "Woodland Acolyte": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Piochez une carte" })] },
  "Mend the Wilds": {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière")],
      [fx.moveTo(ref.target(), { to: "libraryTop" })],
    ),
  },
  "Food Coma": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.createTokens(FOOD)], {
        targets: [OPP_CREATURE()],
        label: "Exile une créature adverse, une Nourriture",
      }),
    ],
  },
  "Lady of Laughter": {
    abilities: [triggered(when.yourEndStep, [fx.draw(1)], { condition: CELEBRATION, label: "Célébration : piochez une carte" })],
  },
  "Pests of Honor": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: CELEBRATION,
        label: "Célébration : un marqueur +1/+1",
      }),
    ],
  },
};
