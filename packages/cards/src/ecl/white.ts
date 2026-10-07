/** Lorwyn Eclipsed — cartes blanches. */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  beholdOrPay,
  type CardScript,
  champion,
  cond,
  entersWith,
  fx,
  KITHKIN,
  loyalty,
  manaAbility,
  modal,
  mode,
  playerStatic,
  powerFor,
  ref,
  SHAPESHIFTER,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const ENCHANT_CREATURE = { filter: { types: ["Creature" as const] }, label: "créature" };
/** « Un autre Ondin dégagé que vous contrôlez » (Meanders Guide). */
const OTHER_UNTAPPED_MERFOLK: ObjectFilter = { subtype: "Merfolk", controller: "you", other: true, tapped: false };

/**
 * Persistance (702.79) accordée : « quand elle meurt, si elle n'avait pas de marqueur −1/−1, renvoyez-la sur le champ
 * de bataille sous le contrôle de son propriétaire avec un marqueur −1/−1 » (marqueurs lus dans ses dernières
 * informations connues).
 */
const PERSIST = triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { counters: { kind: "-1/-1", n: 1 } })], {
  condition: cond.not(cond.amountAtLeast(amount.lkiCounters("-1/-1"), 1)),
  label: "Persistance",
});

/** « [coût], retirez un marqueur de cette créature : … » : un marqueur de n'importe quelle sorte. */
const removeACounter = (opts: Omit<Parameters<typeof activated>[0], "removeCounters">) => [
  activated({ ...opts, removeCounters: { kind: "any", n: 1 } }),
];

export const WHITE: Record<string, CardScript> = {
  // Convocation lue dans le texte.
  Winnowing: {
    spell: spell([], [fx.keep(ref.eachPlayer, "sharesType", { types: ["Creature"] }, { chooser: "you" })]),
  },
  Kinbinding: {
    abilities: [
      staticAbility(
        YOUR_CREATURES,
        { power: 1, toughness: 1 },
        {
          perTurnEvents: { event: "zone", to: "battlefield", types: ["Creature"], who: "you" },
          label: "Vos créatures : +X/+X, X étant le nombre de créatures arrivées sous votre contrôle ce tour-ci",
        },
      ),
      triggered(when.yourCombat, [fx.createTokens(KITHKIN)], { label: "Un jeton Kithkin 1/1" }),
    ],
  },
  "Adept Watershaper": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, other: true, tapped: true },
        { addKeywords: ["indestructible"] },
        { label: "Vos autres créatures engagées sont indestructibles" },
      ),
    ],
  },
  "Ajani, Outland Chaperone": {
    abilities: [
      loyalty(1, { effects: [fx.createTokens(KITHKIN)], label: "Kithkin 1/1" }),
      loyalty(-2, {
        targets: [target.creature("t", { tapped: true })],
        effects: [fx.damage(4, ref.target())],
        label: "4 blessures à une créature engagée",
      }),
      loyalty(-8, {
        effects: [
          fx.lookAtTop(amount.lifeTotal, {
            filter: { permanent: true, notTypes: ["Land"] },
            maxManaValue: 3,
            count: amount.lifeTotal,
            to: { to: "battlefield" },
          }),
          fx.shuffle(),
        ],
        label: "Permanents non-terrains de VM 3 ou moins parmi les X cartes du dessus",
      }),
    ],
  },
  // Convocation lue dans le texte.
  "Appeal to Eirdu": { spell: spell([target.between(1, 2, target.creature())], [fx.pump(ref.target(), 2, 1)]) },
  "Bark of Doran": {
    // Équiper {1} : lu dans le texte.
    abilities: [
      staticAbility("attached", { toughness: 1 }, { label: "+0/+1" }),
      staticAbility("attached", { addPowerRules: [powerFor.combatToughness] }, { label: powerFor.combatToughness.label }),
    ],
  },
  // Recto-verso : « quand elle arrive ou se transforme en Brigid, Clachan's Heart » (`when.transformsSelf`).
  "Brigid, Clachan's Heart": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) => triggered(w, [fx.createTokens(KITHKIN)], { label: "Kithkin 1/1" })),
      triggered(when.step("main1", "you"), fx.mayPay("{G}", "Payer {G} pour transformer Brigid ?", fx.transform()), {
        label: "Payez {G} : transformez Brigid",
      }),
    ],
  },
  "Brigid, Doun's Mind": {
    abilities: [
      manaAbility(["G", "W"], 1, { per: { ...YOUR_CREATURES, other: true } }),
      triggered(when.step("main1", "you"), fx.mayPay("{W}", "Payer {W} pour transformer Brigid ?", fx.transform()), {
        label: "Payez {W} : transformez Brigid",
      }),
    ],
  },
  "Burdened Stoneback": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      ...removeACounter({
        mana: "{1}{W}",
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
        label: "Une créature gagne l'indestructible",
      }),
    ],
  },
  // Flash lu dans le texte.
  "Champion of the Clachan": champion("Kithkin", [
    staticAbility({ ...YOUR_CREATURES, subtype: "Kithkin", other: true }, { power: 1, toughness: 1 }, { label: "Kithkin +1/+1" }),
  ]),
  "Clachan Festival": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KITHKIN, 2)], { label: "Deux Kithkins 1/1" }),
      activated({ mana: "{4}{W}", effects: [fx.createTokens(KITHKIN)], label: "Kithkin 1/1" }),
    ],
  },
  // Changelin lu dans le texte.
  "Crib Swap": {
    spell: spell([target.creature()], [fx.exile(ref.target()), fx.createTokens(SHAPESHIFTER, 1, ref.controllerOf(ref.target()))]),
  },
  "Curious Colossus": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(
            ref.permanentsOf(ref.target(), { types: ["Creature"] }),
            { loseAllAbilities: true, addSubtypes: ["Coward"], setPower: 1, setToughness: 1 },
            "permanent",
          ),
        ],
        { targets: [target.player("t", "opponent")], label: "Les créatures adverses deviennent des Couards 1/1 sans capacité" },
      ),
    ],
  },
  // Vol et lien de vie lus dans le texte.
  "Eirdu, Carrier of Dawn": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["convoke"] },
        label: "Vos sorts de créature ont la convocation",
      }),
      triggered(when.step("main1", "you"), fx.mayPay("{B}", "Payer {B} pour transformer Eirdu ?", fx.transform()), {
        label: "Payez {B} : transformez Eirdu",
      }),
    ],
  },
  "Isilu, Carrier of Twilight": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, other: true, token: false },
        { addAbilities: [PERSIST] },
        { label: "Vos autres créatures non-jetons ont la persistance" },
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{W}", "Payer {W} pour transformer Isilu ?", fx.transform()), {
        label: "Payez {W} : transformez Isilu",
      }),
    ],
  },
  "Encumbered Reejerey": {
    abilities: [
      entersWith({ counters: 3, counterKind: "-1/-1", label: "Arrive avec trois marqueurs -1/-1" }),
      triggered(when.tapsSelf, [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.counterAtLeast("-1/-1", 1),
        label: "Engagée : retire un marqueur -1/-1",
      }),
    ],
  },
  "Evershrike's Gift": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { power: 1, addKeywords: ["flying"] }, { label: "+1/+0 et le vol" }),
      activated({
        mana: "{1}{W}",
        blight: 2,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Revient du cimetière en main",
      }),
    ],
  },
  "Flock Impostor": {
    // Changelin, flash et vol lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
        label: "Renvoie une autre de vos créatures en main",
      }),
    ],
  },
  "Gallant Fowlknight": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pumpAll(YOUR_CREATURES, 1, 0),
          fx.modifyAll({ ...YOUR_CREATURES, subtype: "Kithkin" }, { addKeywords: ["firstStrike"] }),
        ],
        { label: "Vos créatures +1/+0, vos Kithkins l'initiative" },
      ),
    ],
  },
  "Goldmeadow Nomad": {
    abilities: [
      activated({
        mana: "{W}",
        exileSelf: true,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(KITHKIN)],
        label: "Exilée du cimetière : Kithkin 1/1",
      }),
    ],
  },
  "Keep Out": {
    spell: modal(
      mode("4 blessures à une créature engagée", [target.creature("c", { tapped: true })], [fx.damage(4, ref.target("c"))]),
      mode("Détruisez un enchantement", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
    ),
  },
  "Kinsbaile Aspirant": {
    additionalCost: beholdOrPay("Kithkin", 2),
    abilities: [
      triggered(when.enters({ ...YOUR_CREATURES, other: true }), [fx.pump(ref.self, 1, 1)], {
        label: "Une autre créature arrive : +1/+1",
      }),
    ],
  },
  "Kinscaer Sentry": {
    // Initiative et lien de vie lus dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield", tapped: true, attacking: true },
            {
              min: 0,
              maxManaValue: amount.count({ ...YOUR_CREATURES, attacking: true }),
              prompt: "Créature de votre main à mettre en jeu engagée et attaquante",
            },
          ),
        ],
        { label: "Une créature de votre main arrive engagée et attaquante" },
      ),
    ],
  },
  Kithkeeper: {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KITHKIN, amount.colorsAmong())], {
        label: "Vivid — un Kithkin 1/1 par couleur parmi vos permanents",
      }),
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 3, includeSelf: true },
        effects: [fx.pump(ref.self, 3, 0, ["flying"])],
        label: "+3/+0 et le vol",
      }),
    ],
  },
  "Liminal Hold": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.gainLife(2)], {
        targets: [target.upTo(1, target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse"))],
        label: "Exile un permanent adverse ; vous gagnez 2 PV",
      }),
    ],
  },
  "Meanders Guide": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.when(
          cond.controls(OTHER_UNTAPPED_MERFOLK),
          fx.may(
            "Engager un autre Ondin dégagé pour renvoyer une créature de votre cimetière ?",
            fx.chooseAmong(ref.permanentsOf(ref.you, OTHER_UNTAPPED_MERFOLK), ref.you, "m"),
            fx.tap(ref.stored("m")),
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { types: ["Creature"], maxManaValue: 3 },
                  "you",
                  "carte de créature de VM 3 ou moins",
                ),
              ],
              [fx.toBattlefield(ref.target())],
            ),
          ),
        ),
        { label: "Engagez un Ondin : une créature revient du cimetière" },
      ),
    ],
  },
  "Moonlit Lamenter": {
    abilities: [
      entersWith({ counters: 1, counterKind: "-1/-1", label: "Arrive avec un marqueur -1/-1" }),
      ...removeACounter({ mana: "{1}{W}", sorcerySpeed: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Morningtide's Light": {
    exileOnResolve: true,
    spell: spell(
      [target.upTo(99, target.creature())],
      [
        fx.exileCard(ref.target(), { name: "x" }),
        fx.delayed([fx.toBattlefield(ref.target("x"), { tapped: true })], { x: ref.stored("x") }),
        fx.untilYourNextTurn({ replacement: { event: "damage", to: "you", modify: { prevent: true } } }),
      ],
    ),
  },
  Personify: {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f")), fx.createTokens(SHAPESHIFTER)],
    ),
  },
  // Convocation lue dans le texte.
  "Protective Response": {
    spell: spell([target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })], [fx.destroy(ref.target())]),
  },
  "Reluctant Dounguard": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      triggered(when.enters({ ...YOUR_CREATURES, other: true }), [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.counterAtLeast("-1/-1", 1),
        label: "Une autre créature arrive : retire un marqueur -1/-1",
      }),
    ],
  },
  "Rhys, the Evermore": {
    // Flash lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addAbilities: [PERSIST] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre de vos créatures gagne la persistance",
      }),
      activated({
        mana: "{W}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        // « Retirez n'importe quel nombre de marqueurs » : tous ses marqueurs −1/−1.
        effects: [fx.removeCounters(ref.target(), 99, "-1/-1")],
        label: "Retirez les marqueurs -1/-1 d'une de vos créatures",
      }),
    ],
  },
  "Riverguard's Reflexes": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["firstStrike"]), fx.untap(ref.target())]),
  },
  "Shore Lurker": { abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" })] },
  "Slumbering Walker": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      triggered(
        when.yourEndStep,
        fx.may(
          "Retirer un marqueur de cette créature ?",
          fx.removeCounters(ref.self, 1, undefined, "r"),
          fx.when(
            cond.v("r"),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"], maxPower: 2 }, "you", "carte de créature de force 2 ou moins")],
              [fx.toBattlefield(ref.target())],
            ),
          ),
        ),
        { label: "Retirez un marqueur : une créature revient du cimetière" },
      ),
    ],
  },
  "Spiral into Solitude": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Ne peut ni attaquer ni bloquer" }),
      activated({
        mana: "{1}{W}",
        blight: 1,
        sacrifice: true,
        effects: [fx.exile(ref.attached)],
        label: "Exilez la créature enchantée",
      }),
    ],
  },
  "Thoughtweft Imbuer": {
    abilities: [
      triggered(
        when.attacksAlone(YOUR_CREATURES),
        [
          fx.pump(
            ref.eventObject,
            amount.count({ subtype: "Kithkin", controller: "you" }),
            amount.count({ subtype: "Kithkin", controller: "you" }),
          ),
        ],
        { label: "Attaque seule : +X/+X (Kithkins)" },
      ),
    ],
  },
  "Timid Shieldbearer": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.pumpAll(YOUR_CREATURES, 1, 1)], label: "Vos créatures +1/+1" })],
  },
  "Tributary Vaulter": {
    // Vol lu dans le texte.
    abilities: [
      triggered(when.tapsSelf, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.creature("t", { subtype: "Merfolk", controller: "you", other: true })],
        label: "Engagée : un autre Ondin +2/+0",
      }),
    ],
  },
  "Wanderbrine Preacher": {
    abilities: [triggered(when.tapsSelf, [fx.gainLife(2)], { label: "Engagée : vous gagnez 2 PV" })],
  },
  "Wanderbrine Trapper": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        tapOthers: { filter: { types: ["Creature"] }, count: 1 },
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.tap(ref.target())],
        label: "Engagez une créature adverse",
      }),
    ],
  },
};
