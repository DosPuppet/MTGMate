/** Tarkir: Dragonstorm — cartes rouges. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  dragonstorm,
  fx,
  GOBLIN,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  WARRIOR_R,
  when,
} from "./common";

const NONCREATURE_ARTIFACT = target.permanent("a", ["Artifact"], { notTypes: ["Creature"] }, "artefact non-créature");

export const RED: Record<string, CardScript> = {
  "Breaching Dragonstorm": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileUntil({ nonland: true }, "x"),
          // Valeur de mana 9 ou plus : en main ; sinon on peut la lancer sans payer, et elle va en main si on refuse.
          fx.toHand(ref.filtered(ref.stored("x"), { minManaValue: 9 })),
          fx.castNow(ref.filtered(ref.stored("x"), { maxManaValue: 8 }), { free: true, storeRest: "r" }),
          fx.toHand(ref.stored("r")),
        ],
        { label: "Exilez jusqu'à une carte non-terrain : lancez-la gratuitement (VM 8 ou moins) ou prenez-la" },
      ),
      dragonstorm(),
    ],
  },
  "Fire-Rim Form": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["firstStrike"] })], {
        label: "La créature enchantée gagne l'initiative",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },
  "Fleeting Effigy": {
    abilities: [
      triggered(when.yourEndStep, [fx.bounce(ref.self)], { label: "Revient dans la main de son propriétaire" }),
      activated({ mana: "{2}{R}", effects: [fx.pump(ref.self, 2, 0)], label: "+2/+0" }),
    ],
  },
  "Iridescent Tiger": {
    abilities: [
      triggered(when.entersSelf, [fx.addMana("W", "U", "B", "R", "G")], {
        condition: cond.wasCast,
        label: "Si vous l'avez lancée : ajoutez {W}{U}{B}{R}{G}",
      }),
    ],
  },
  "Meticulous Artisan": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Un Trésor" })],
  },
  "Molten Exhale": {
    // « Comme s'il avait le flash si vous contemplez un Dragon en coût additionnel. »
    flashIf: cond.behold(DRAGON_CARD),
    spell: spell([target.creatureOrPlaneswalker()], [fx.damage(4, ref.target())]),
  },
  "Narset's Rebuke": {
    spell: spell([target.creature()], [fx.damage(5, ref.target()), fx.addMana("U", "R", "W"), fx.exileIfDies(ref.target())]),
  },
  "Overwhelming Surge": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode("3 blessures à une créature", [target.creature()], [fx.damage(3, ref.target())]),
      mode("Détruisez un artefact non-créature", [NONCREATURE_ARTIFACT], [fx.destroy(ref.target("a"))]),
      mode("Les deux", [target.creature(), NONCREATURE_ARTIFACT], [fx.damage(3, ref.target()), fx.destroy(ref.target("a"))]),
    ),
  },
  "Rescue Leopard": {
    abilities: [
      triggered(when.tapsSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Vous pouvez défausser une carte ; si vous le faites, piochez",
      }),
    ],
  },
  "Reverberating Summons": {
    abilities: [
      triggered(
        when.step("beginCombat", "any"),
        [
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Monk"],
            setPower: 3,
            setToughness: 3,
            addKeywords: ["haste"],
          }),
        ],
        { condition: cond.castThisTurn(2), label: "Deux sorts lancés ce tour-ci : devient un Moine 3/3 avec la célérité" },
      ),
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        // « Défaussez votre main » est un coût : la main est défaussée à la résolution (approximation).
        effects: [fx.discard(amount.cardsIn("hand")), fx.draw(2)],
        label: "Défaussez votre main, sacrifiez-le : piochez deux cartes",
      }),
    ],
  },
  "Seize Opportunity": {
    spell: modal(
      mode(
        "Exilez deux cartes, jouables jusqu'à la fin de votre prochain tour",
        [],
        [fx.exileTop(ref.you, 2, "x"), fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true })],
      ),
      mode("Jusqu'à deux créatures gagnent +2/+1", [target.upTo(2, target.creature("p"))], [fx.pump(ref.target("p"), 2, 1)]),
    ),
  },
  // Mobilisation 1 : lue dans le texte.
  "Shock Brigade": {},
  "Shocking Sharpshooter": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Une autre créature arrive : 1 blessure à un adversaire",
      }),
    ],
  },
  "Stormscale Scion": {
    abilities: [
      staticAbility(
        { subtype: "Dragon", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Vos autres Dragons : +1/+1" },
      ),
      // Déluge (702.40) : une copie pour chaque sort lancé avant lui ce tour-ci.
      triggered(when.castSelf, [fx.copySpell(ref.self, amount.plus(amount.spellsCastThisTurn, -1))], { label: "Déluge" }),
    ],
  },
  "Summit Intimidator": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })], {
        targets: [target.creature()],
        label: "Une créature ne peut pas bloquer ce tour-ci",
      }),
    ],
  },
  "Sunset Strikemaster": {
    abilities: [
      manaAbility("R"),
      activated({
        mana: "{2}{R}",
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { keyword: "flying" })],
        effects: [fx.damage(6, ref.target())],
        label: "6 blessures à une créature avec le vol",
      }),
    ],
  },
  "Twin Bolt": {
    spell: spell([target.between(1, 2, target.any())], [fx.damageDivided(2, ref.target())]),
  },
  "Underfoot Underdogs": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GOBLIN)], { label: "Un Gobelin 1/1" }),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Une de vos créatures de force 2 ou moins ne peut pas être bloquée",
      }),
    ],
  },
  "Unsparing Boltcaster": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t", { controller: "opponent", damaged: true })],
        label: "5 blessures à une créature adverse déjà blessée ce tour-ci",
      }),
    ],
  },
  "War Effort": {
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { power: 1 }, { label: "Vos créatures : +1/+0" }),
      triggered(
        when.attackWith(1),
        [
          fx.createTappedTokens(WARRIOR_R, 1, { attacking: true, store: "w" }),
          fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("w") }),
        ],
        { label: "Un Guerrier 1/1 engagé et attaquant" },
      ),
    ],
  },
  "Wild Ride": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["haste"])]) },
  "Zurgo's Vanguard": {
    // Mobilisation 1 : lue dans le texte.
    cdaPower: amount.count(CREATURE_YOU_CONTROL),
  },
};
