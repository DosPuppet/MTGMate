/** The Lost Caverns of Ixalan — cartes blanches. */
import {
  ANGEL_4,
  ARTIFACT_OR_CREATURE,
  ARTIFACT_OR_CREATURE_YOURS,
  activated,
  amount,
  BAT_1,
  CAVE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  fx,
  GNOME,
  MAP,
  modal,
  mode,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Abuelo's Awakening": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"], notSubtype: "Aura" }] },
          "you",
          "carte d'artefact ou d'enchantement non-Aura de votre cimetière",
        ),
      ],
      [
        // Les X marqueurs, le type Créature Esprit et le vol sont en place à l'arrivée (614.1c : « une créature arrive » la
        // voit). Approximation : ses F/E de base deviennent 1/1 juste après son arrivée.
        fx.moveTo(
          ref.target(),
          {
            to: "battlefield",
            counters: { kind: "+1/+1", n: amount.x },
            addTypes: ["Creature"],
            addSubtypes: ["Spirit"],
            addKeywords: ["flying"],
          },
          { name: "back" },
        ),
        fx.modify(ref.stored("back"), { setPower: 1, setToughness: 1 }, "permanent"),
      ],
    ),
  },
  "Acrobatic Leap": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["flying"]), fx.untap(ref.target())]),
  },
  "Adaptive Gemguard": {
    abilities: [
      activated({
        tapOthers: { filter: ARTIFACT_OR_CREATURE, count: 2, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.addCounters(ref.self, 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Attentive Sunscribe": { abilities: [triggered(when.tapsSelf, [fx.scry(1)], { label: "Regard 1" })] },
  "Cosmium Blast": {
    spell: spell([target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })], [fx.damage(4, ref.target())]),
  },
  "Deconstruction Hammer": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            activated({
              mana: "{3}",
              tap: true,
              grantor: "sacrifice",
              targets: [targetObj("t", { types: ["Artifact", "Enchantment"] }, "artefact ou enchantement")],
              effects: [fx.destroy(ref.target())],
              label: "Sacrifiez Deconstruction Hammer : détruisez un artefact ou un enchantement",
            }),
          ],
        },
        { label: "+1/+1 et « {3}, {T}, sacrifiez Deconstruction Hammer : détruisez un artefact ou un enchantement »" },
      ),
    ],
  },
  "Dusk Rose Reliquary": {
    additionalCost: { sacrifice: { filter: ARTIFACT_OR_CREATURE, count: 1 } },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [targetObj("t", { ...ARTIFACT_OR_CREATURE, controller: "opponent" }, "artefact ou créature adverse")],
        label: "Exil jusqu'à son départ",
      }),
    ],
  },
  "Envoy of Okinec Ahau": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.createTokens(GNOME)], label: "Gnome 1/1" })],
  },
  "Family Reunion": {
    spell: modal(
      mode("+1/+1", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)]),
      mode("Défense talismanique", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["hexproof"])]),
    ),
  },
  "Get Lost": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment", "Planeswalker"] }, "créature, enchantement ou planeswalker")],
      [fx.createTokens(MAP, 2, ref.controllerOf(ref.target())), fx.destroy(ref.target())],
    ),
  },
  "Glorifier of Suffering": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { ...ARTIFACT_OR_CREATURE, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.upTo(2, target.creature())], [fx.addCounters(ref.target(), 1)])),
        ],
        { label: "Sacrifiez : marqueurs +1/+1" },
      ),
    ],
  },
  "Guardian of the Great Door": {
    additionalCost: {
      tap: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Land"] }] }, count: 4 },
    },
  },
  "Helping Hand": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins")],
      [fx.toBattlefield(ref.target(), { tapped: true })],
    ),
  },
  "Ironpaw Aspirant": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Kinjalli's Dawnrunner": { abilities: [triggered(when.entersSelf, [fx.explore()], { label: "Explore" })] },
  "Malamet War Scribe": {
    abilities: [triggered(when.entersSelf, [fx.pumpAll(CREATURE_YOU_CONTROL, 2, 1)], { label: "+2/+1" })],
  },
  "Might of the Ancestors": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0, ["vigilance"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0 et vigilance",
      }),
    ],
  },
  "Miner's Guidewing": {
    abilities: [
      triggered(when.diesSelf, [fx.explore(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une créature explore",
      }),
    ],
  },
  "Oltec Archaeologists": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Carte d'artefact en main",
            [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact de votre cimetière")],
            [fx.toHand(ref.target())],
          ),
          mode("Regard 3", [], [fx.scry(3)]),
        ],
        { label: "Archéologues" },
      ),
    ],
  },
  "Oltec Cloud Guard": { abilities: [triggered(when.entersSelf, [fx.createTokens(GNOME)], { label: "Gnome 1/1" })] },
  Petrify: {
    enchant: { filter: ARTIFACT_OR_CREATURE, label: "artefact ou créature" },
    abilities: [
      staticAbility(
        "attached",
        { addKeywords: ["cantAttack", "cantBlock", "noActivatedAbilities"] },
        { label: "Ne peut ni attaquer ni bloquer, capacités activées bloquées" },
      ),
    ],
  },
  "Quicksand Whirlpool": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Resplendent Angel": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(ANGEL_4)], {
        condition: cond.lifeGainedAtLeast(5),
        label: "Ange 4/4",
      }),
      activated({
        mana: "{3}{W}{W}{W}",
        effects: [fx.pump(ref.self, 2, 2, ["lifelink"])],
        label: "+2/+2 et lien de vie",
      }),
    ],
  },
  "Sanguine Evangelist": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 1, 0)], {
        label: "Cri de guerre",
      }),
      triggered(when.entersSelf, [fx.createTokens(BAT_1)], { label: "Chauve-souris 1/1" }),
      triggered(when.diesSelf, [fx.createTokens(BAT_1)], { label: "Chauve-souris 1/1" }),
    ],
  },
  "Soaring Sandwing": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 PV" })] },
  "Thousand Moons Crackshot": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.mayPay(
            "{2}{W}",
            "Payer {2}{W} pour engager une créature ?",
            fx.reflexive([target.creature()], [fx.tap(ref.target())]),
          ),
        ],
        { label: "Engagez une créature" },
      ),
    ],
  },
  "Tinker's Tote": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GNOME, 2)], { label: "Deux Gnomes 1/1" }),
      activated({ mana: "{W}", sacrifice: true, effects: [fx.gainLife(3)], label: "+3 PV" }),
    ],
  },
  "Vanguard of the Rose": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible",
      }),
    ],
  },
  "Warden of the Inner Sky": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying", "vigilance"] },
        // Trois marqueurs ou plus, de toutes sortes.
        { condition: cond.amountAtLeast(amount.countersOn(ref.self, "any"), 3), label: "Vol et vigilance (trois marqueurs)" },
      ),
      activated({
        tapOthers: { filter: ARTIFACT_OR_CREATURE_YOURS, count: 3, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.addCounters(ref.self, 1), fx.scry(1)],
        label: "Marqueur +1/+1, regard 1",
      }),
    ],
  },
  "Bat Colony": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(BAT_1, amount.caveManaSpent)], {
        label: "Une Chauve-souris par mana de Caverne",
      }),
      triggered(when.enters({ ...CAVE, controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Ruin-Lurker Bat": {
    abilities: [triggered(when.yourEndStep, [fx.scry(1)], { condition: cond.descended, label: "Descente — regard 1" })],
  },
};
