/** Final Fantasy — cartes transformables (dont Sagas au verso) et assemblage (lot C). Scripts par nom de face. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  chocobo,
  cond,
  costReducer,
  doubler,
  entersWith,
  FOOD,
  fx,
  graveyardReplacement,
  KNIGHT_2,
  manaAbility,
  playerStatic,
  ref,
  staticAbility,
  TOWN,
  TREASURE,
  target,
  targetObj,
  triggered,
  WIZARD_0_1,
  when,
} from "./common";

const PERMANENT_CARD = {
  anyOf: (["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"] as const).map((t) => ({ types: [t] })),
};
const YOURS = { types: ["Creature" as const], controller: "you" as const };
const OTHERS = { ...YOURS, other: true };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

/** « Exilez [cette carte], puis renvoyez-la sur le champ de bataille transformée sous le contrôle de son propriétaire. » */
const flipOut = () => [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })];
/** « Exilez [ce verso], puis renvoyez-le sur le champ de bataille » : il revient sur son recto. */
const flipBack = () => [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"))];
/** Capacité « {coût}, {T} : exilez-la, puis renvoyez-la transformée. N'activez qu'en rituel. » */
const transformAbility = (mana: string, label = "Exilez-la, puis renvoyez-la transformée") =>
  activated({ mana, tap: true, sorcerySpeed: true, effects: flipOut(), label });

export const TRANSFORM: Record<string, CardScript> = {
  // --- Blanc ------------------------------------------------------------------
  "Dion, Bahamut's Dominant": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", anyOf: [{ self: true }, { subtype: "Knight" }] },
        { addKeywords: ["flying"] },
        { condition: cond.yourTurn, label: "Plongeon draconique : le vol pendant votre tour" },
      ),
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_2)], { label: "Chevalier 2/2" }),
      transformAbility("{4}{W}{W}"),
    ],
  },
  "Bahamut, Warden of Light": {
    abilities: [
      chapter([1, 2], [fx.addCountersAll(OTHERS, 1), fx.pumpAll(OTHERS, 0, 0, ["flying"])], { label: "Ailes de lumière" }),
      chapter([3], [fx.destroy(ref.target()), ...flipBack()], {
        targets: [targetObj("t", { permanent: true }, "permanent")],
        label: "Gigaflare",
      }),
    ],
  },
  "Sidequest: Catch a Fish": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.lookAtTop(1, {
            filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] },
            count: 1,
            rest: "top",
            store: "fish",
          }),
          fx.when(cond.v("fish"), fx.createTokens(FOOD), fx.transform()),
        ],
        { label: "Carte du dessus : artefact ou créature en main" },
      ),
    ],
  },
  "Cooking Campsite": {
    abilities: [
      manaAbility("W"),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        sorcerySpeed: true,
        effects: [fx.addCountersAll(YOURS, 1)],
        label: "Un marqueur +1/+1 sur chaque créature",
      }),
    ],
  },
  "Venat, Heart of Hydaelyn": {
    abilities: [
      triggered(when.castSpell("you", { legendary: true }), [fx.draw(1)], { oncePerTurn: true, label: "Piochez" }),
      activated({
        mana: "{7}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.nonland("t")],
        effects: [fx.exile(ref.target()), fx.transform()],
        label: "Division du héros",
      }),
    ],
  },
  "Hydaelyn, the Mothercrystal": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.target(), 1),
          fx.modify(ref.target(), { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
          fx.when(cond.targetMatches("t", { legendary: true }), fx.draw(1)),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "Bénédiction de lumière" },
      ),
    ],
  },

  // --- Bleu -------------------------------------------------------------------
  "Jill, Shiva's Dominant": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "Renvoyez un autre permanent non-terrain",
      }),
      transformAbility("{3}{U}{U}"),
    ],
  },
  "Shiva, Warden of Ice": {
    abilities: [
      chapter([1, 2], [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t")],
        label: "Envoûtement : imblocable",
      }),
      chapter([3], [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Land"] })), ...flipBack()], {
        label: "Vague de froid",
      }),
    ],
  },
  "Sidequest: Card Collection": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.discard(2)], { label: "Piochez trois, défaussez deux" }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.amountAtLeast(amount.countIn("graveyard"), 8),
        label: "Transformez (huit cartes au cimetière)",
      }),
    ],
  },
  "Magicked Card": {},

  // --- Noir -------------------------------------------------------------------
  "Cecil, Dark Knight": {
    abilities: [
      triggered(
        when.dealsDamage("self"),
        [fx.loseLife(amount.eventAmount), fx.when(cond.not(cond.lifeAtLeast(11)), fx.untap(ref.self), fx.transform())],
        { label: "Ténèbres : perdez autant de PV" },
      ),
    ],
  },
  "Cecil, Redeemed Paladin": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 0, 0, ["indestructible"])], {
        label: "Protection : les autres attaquants sont indestructibles",
      }),
    ],
  },
  "Jecht, Reluctant Guardian": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.may("Exiler Jecht et le renvoyer transformé ?", ...flipOut())], {
        label: "Transformez",
      }),
    ],
  },
  "Braska's Final Aeon": {
    abilities: [
      chapter([1, 2], [fx.discard(1, ref.eachOpponent), fx.draw(1)], { label: "Rayon de Jecht" }),
      chapter([3], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 2)], { label: "Tir ultime de Jecht" }),
    ],
  },
  "Sidequest: Hunt the Mark": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "Détruisez jusqu'à une créature",
      }),
      triggered(
        when.yourEndStep,
        [fx.createTokens(TREASURE), fx.when(cond.controls({ subtype: "Treasure" }, 3), fx.transform())],
        { condition: cond.creaturesDied(1, true), label: "Trésor, puis transformez (trois Trésors)" },
      ),
    ],
  },
  "Yiazmat, Ultimate Mark": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, engagez-la",
      }),
    ],
  },
  "Vincent Valentine": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent" }),
        [fx.addCounters(ref.self, amount.powerOf(ref.eventObject))],
        {
          label: "Marqueurs égaux à sa force",
        },
      ),
      triggered(when.attacksSelf, [fx.may("Transformer Vincent Valentine ?", fx.transform())], { label: "Transformez" }),
    ],
  },
  "Galian Beast": {
    abilities: [triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], { label: "Revient engagée" })],
  },

  // --- Vert -------------------------------------------------------------------
  "Sidequest: Raise a Chocobo": {
    abilities: [
      triggered(when.entersSelf, [chocobo()], { label: "Chocobo 2/2" }),
      // Approximation : la recherche de Black Chocobo (« quand il se transforme ») est faite par le même effet.
      triggered(when.step("main1"), [fx.transform(), fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        condition: cond.controls({ types: ["Creature"], subtype: "Bird" }, 4),
        label: "Transformez (quatre Oiseaux)",
      }),
    ],
  },
  "Black Chocobo": {
    abilities: [
      triggered(when.landfall, [fx.pumpAll({ ...YOURS, subtype: "Bird" }, 1, 0)], { label: "Landfall : Oiseaux +1/+0" }),
    ],
  },

  // --- Multicolore ------------------------------------------------------------
  "Joshua, Phoenix's Dominant": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d"))], {
        label: "Défaussez jusqu'à deux cartes, piochez-en autant",
      }),
      transformAbility("{3}{R}{W}"),
    ],
  },
  "Phoenix, Warden of Fire": {
    abilities: [
      chapter([1, 2], [fx.damage(2, ref.eachOpponent)], { label: "Flammes ascendantes" }),
      chapter([3], [fx.toBattlefield(ref.target()), ...flipBack()], {
        targets: [
          {
            ...target.upTo(20, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")),
            maxTotalManaValue: 6,
          },
        ],
        label: "Flammes de la renaissance",
      }),
    ],
  },
  "The Emperor of Palamecia": {
    abilities: [
      manaAbility(["U", "R"], 1, { restriction: { spell: { notTypes: ["Creature"] } } }),
      triggered(
        when.castNoncreatureWithMana(4),
        [fx.addCounters(ref.self, 1), fx.when(cond.counterAtLeast("+1/+1", 3), fx.transform())],
        { label: "Marqueur +1/+1, puis transformez (trois)" },
      ),
    ],
  },
  "The Lord Master of Hell": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.damage(amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }), ref.eachOpponent)],
        { label: "Pluie d'étoiles" },
      ),
    ],
  },
  "Exdeath, Void Warlock": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 PV" }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.amountAtLeast(amount.countIn("graveyard", PERMANENT_CARD), 6),
        label: "Transformez (six cartes de permanent au cimetière)",
      }),
    ],
  },
  "Neo Exdeath, Dimension's End": { cdaPower: amount.countIn("graveyard", PERMANENT_CARD) },
  "Garland, Knight of Cornelia": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.surveil(1)], { label: "Surveillance 1" }),
      activated({
        mana: "{3}{B}{B}{R}{R}",
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.self, { transformed: true })],
        label: "Revient transformée du cimetière",
      }),
    ],
  },
  "Chaos, the Endless": {
    abilities: [
      triggered(when.diesSelf, [fx.moveTo(ref.selfCard, { to: "libraryBottom" })], { label: "Au-dessous de la bibliothèque" }),
    ],
  },

  // --- Terrain ----------------------------------------------------------------
  "Clive, Ifrit's Dominant": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.may(
            "Défausser votre main pour piocher selon votre dévotion au rouge ?",
            fx.discard(amount.cardsIn("hand")),
            fx.draw(amount.devotion("R")),
          ),
        ],
        { label: "Défaussez votre main, piochez selon la dévotion" },
      ),
      transformAbility("{4}{R}{R}"),
    ],
  },
  "Ifrit, Warden of Inferno": {
    abilities: [
      chapter([1], [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Assaut : combat",
      }),
      chapter([2, 3], [fx.addMana("R", "R", "R", "R"), fx.when(cond.counterAtLeast("lore", 3), ...flipBack())], {
        label: "Soufre : {R}{R}{R}{R}",
      }),
    ],
  },
  "Ultimecia, Time Sorceress": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) => triggered(t, [fx.surveil(2)], { label: "Surveillance 2" })),
      // Approximation : le tour supplémentaire d'Ultimecia, Omnipotent (« quand elle se transforme ») est donné par le même effet.
      triggered(
        when.yourEndStep,
        fx.mayPay(
          "{4}{U}{U}{B}{B}",
          "Payer {4}{U}{U}{B}{B} et exiler huit cartes de votre cimetière ?",
          fx.pickFromZone("graveyard", {}, { to: "exile" }, { count: 8, min: 8, prompt: "Exilez huit cartes" }),
          fx.transform(),
          fx.extraTurn,
        ),
        { condition: cond.amountAtLeast(amount.countIn("graveyard"), 8), label: "Compression temporelle" },
      ),
    ],
  },
  "Ultimecia, Omnipotent": {},
  "Sephiroth, Fabled SOLDIER": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(
          t,
          [
            fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
            fx.when(cond.v("s"), fx.draw(1)),
          ],
          { label: "Sacrifiez une créature : piochez" },
        ),
      ),
      triggered(
        when.dies({ types: ["Creature"], other: true }),
        [
          ...fx.drain(1, ref.target()),
          fx.countResolution("n"),
          fx.when(
            cond.all(cond.v("n", 4), cond.not(cond.v("n", 5))),
            fx.emblem(
              "Sephiroth, One-Winged Angel",
              "Whenever a creature dies, target opponent loses 1 life and you gain 1 life.",
              [
                triggered(when.dies({ types: ["Creature"] }), fx.drain(1, ref.target()), {
                  targets: [target.player("t", "opponent")],
                  label: "Drain 1",
                }),
              ],
            ),
            fx.transform(),
          ),
        ],
        { targets: [target.player("t", "opponent")], label: "Drain 1 ; quatrième fois : transformez" },
      ),
    ],
  },
  "Sephiroth, One-Winged Angel": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 99, { optional: true, store: "s" }), fx.draw(amount.v("s"))],
        { label: "Sacrifiez des créatures : piochez autant" },
      ),
    ],
  },
  "Kuja, Genome Sorcerer": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.createTappedTokens(WIZARD_0_1, 1),
          fx.when(cond.controls({ types: ["Creature"], subtype: "Wizard" }, 4), fx.transform()),
        ],
        { label: "Sorcier engagé, puis transformez (quatre Sorciers)" },
      ),
    ],
  },
  "Trance Kuja, Fate Defied": {
    abilities: [
      doubler({
        damageFilter: { types: ["Creature"], subtype: "Wizard" },
        label: "Flare Star : blessures de vos Sorciers doublées",
      }),
    ],
  },
  "Kefka, Court Mage": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(t, [fx.discard(1, ref.eachPlayer, { store: "k" }), fx.draw(amount.cardTypesOf(ref.stored("k")))], {
          label: "Chaque joueur défausse ; piochez par type de carte",
        }),
      ),
      activated({
        mana: "{8}",
        sorcerySpeed: true,
        effects: [fx.sacrifice(ref.eachOpponent, { permanent: true }), fx.transform()],
        label: "Chaque adversaire sacrifie un permanent ; transformez",
      }),
    ],
  },
  "Kefka, Ruler of Ruin": {
    abilities: [
      triggered(when.loseLife("opponent"), [fx.draw(amount.eventAmount)], {
        condition: cond.yourTurn,
        label: "Piochez autant de cartes",
      }),
    ],
  },
  "Serah Farron": {
    abilities: [
      costReducer({ types: ["Creature"], legendary: true }, 2, "Premier sort de créature légendaire : {2} de moins", {
        condition: cond.noLegendaryCreatureCastThisTurn,
      }),
      triggered(when.yourCombat, [fx.may("Transformer Serah Farron ?", fx.transform())], {
        condition: cond.controls({ types: ["Creature"], legendary: true, other: true }, 2),
        label: "Transformez (deux autres créatures légendaires)",
      }),
    ],
  },
  "Crystallized Serah": {
    abilities: [
      costReducer({ types: ["Creature"], legendary: true }, 2, "Premier sort de créature légendaire : {2} de moins", {
        condition: cond.noLegendaryCreatureCastThisTurn,
      }),
      staticAbility({ ...YOURS, legendary: true }, { power: 2, toughness: 2 }, { label: "Vos créatures légendaires : +2/+2" }),
    ],
  },
  "Esper Origins": {
    flashback: "{3}{G}",
    spell: {
      modes: [
        {
          targets: [],
          effects: [fx.surveil(2), fx.gainLife(2), ...fx.when(cond.spellCastFromGraveyard, fx.resolveToBattlefieldTransformed)],
        },
      ],
    },
  },
  "Summon: Esper Maduin": {
    abilities: [
      chapter([1], [fx.when(cond.refMatches(ref.libraryTop(ref.you), PERMANENT_CARD), fx.toHand(ref.libraryTop(ref.you)))], {
        label: "Carte du dessus : un permanent en main",
      }),
      chapter([2], [fx.addMana("G", "G")], { label: "Ajoutez {G}{G}" }),
      chapter([3], [fx.pumpAll(OTHERS, 2, 2, ["trample"])], { label: "Vos autres créatures : +2/+2, piétinement" }),
    ],
  },
  "Emet-Selch, Unsundered": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) => triggered(t, fx.loot(1), { label: "Piochez, défaussez" })),
      triggered(when.yourUpkeep, [fx.may("Transformer Emet-Selch ?", fx.transform())], {
        condition: cond.amountAtLeast(amount.countIn("graveyard"), 14),
        label: "Transformez (quatorze cartes au cimetière)",
      }),
    ],
  },
  "Hades, Sorcerer of Eld": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard" },
        condition: cond.yourTurn,
        label: "Écho des disparus : jouez depuis votre cimetière",
      }),
      graveyardReplacement({ graveyardOf: "you", label: "Votre cimetière est exilé" }),
    ],
  },
  "Crystal Fragments": {
    abilities: [staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }), transformAbility("{5}{W}{W}")],
  },
  "Summon: Alexander": {
    abilities: [
      chapter([1, 2], [fx.preventDamageToYourCreatures], { label: "Blessures à vos créatures prévenues ce tour-ci" }),
      chapter([3], [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))], {
        label: "Engagez les créatures adverses",
      }),
    ],
  },
  "Terra, Magical Adept": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(5, ref.you, { name: "t" }),
          fx.pickFromZone("graveyard", { types: ["Enchantment"] }, { to: "hand" }, { pool: ref.stored("t"), min: 0 }),
        ],
        { label: "Meulez cinq, un enchantement en main" },
      ),
      transformAbility("{4}{R}{G}", "Transe : exilez-la, puis renvoyez-la transformée"),
    ],
  },
  "Esper Terra": {
    abilities: [
      chapter(
        [1, 2, 3],
        [
          fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true }),
          // Approximation : jusqu'à trois marqueurs → trois marqueurs si c'est une Saga, au choix (tous ou aucun).
          fx.when(
            cond.targetMatches("t", { subtype: "Saga" }),
            fx.may(
              "Mettre trois marqueurs de savoir sur la copie ?",
              fx.counters(ref.permanentsOf(ref.you, { token: true, enteredThisTurn: true, subtype: "Saga" }), "lore", 3),
            ),
          ),
        ],
        {
          targets: [
            targetObj("t", { types: ["Enchantment"], legendary: false, controller: "you" }, "enchantement non légendaire"),
          ],
          label: "Copie d'un enchantement",
        },
      ),
      chapter([4], [fx.addMana("W", "W", "U", "U", "B", "B", "R", "R", "G", "G"), ...flipBack()], {
        label: "Ajoutez deux mana de chaque couleur",
      }),
    ],
  },
  "Zenos yae Galvus": {
    abilities: [
      // Approximation : la créature « choisie » est une cible.
      triggered(
        when.entersSelf,
        [fx.link(ref.target()), fx.pumpAll({ types: ["Creature"], other: true }, -2, -2), fx.pump(ref.target(), 2, 2)],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Mon premier ami" },
      ),
      triggered(when.linkedLeaves, [fx.transform()], { label: "La créature choisie part : transformez" }),
    ],
  },
  "Shinryu, Transcendent Rival": {
    // Approximation : l'adversaire « choisi » est le premier adversaire qui perd la partie.
    abilities: [triggered(when.opponentLoses, [fx.winGame], { label: "Chaînes ardentes" })],
  },
  "Sidequest: Play Blitzball": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0",
      }),
      triggered(
        when.step("endCombat"),
        [fx.transform(), fx.reflexive([target.creature("c", { controller: "you" })], [fx.attach(ref.target("c"))])],
        { condition: cond.playerCombatDamageAtLeast(6), label: "Six blessures de combat : transformez, attachez" },
      ),
    ],
  },
  "World Champion, Celestial Weapon": {
    abilities: [staticAbility("attached", { power: 2, addKeywords: ["doubleStrike"] }, { label: "+2/+0, double initiative" })],
  },
  "Balamb Garden, SeeD Academy": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["G", "U"]),
      activated({
        mana: "{5}{G}{U}",
        tap: true,
        reduction: { generic: amount.count({ ...TOWN, controller: "you", other: true }) },
        effects: [fx.transform()],
        label: "Transformez",
      }),
    ],
  },
  "Balamb Garden, Airborne": { abilities: [triggered(when.attacksSelf, [fx.draw(1)], { label: "Piochez" })] },

  // --- Assemblage -------------------------------------------------------------
  "Fang, Fearless l'Cie": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.draw(1), fx.loseLife(1)], {
        oncePerTurn: true,
        label: "Piochez, perdez 1 PV",
      }),
    ],
  },
  "Vanille, Cheerful l'Cie": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(2), fx.pickFromZone("graveyard", PERMANENT_CARD, { to: "hand" }, { prompt: "Une carte de permanent en main" })],
        { label: "Meulez deux, une carte de permanent en main" },
      ),
      triggered(
        when.step("main1"),
        fx.mayPay("{3}{B}{G}", "Payer {3}{B}{G} pour assembler Vanille et Fang ?", fx.meld("Fang, Fearless l'Cie")),
        {
          condition: cond.controls({ types: ["Creature"], name: "Fang, Fearless l'Cie" }),
          label: "Assemblez-les en Ragnarok",
        },
      ),
    ],
  },
  "Ragnarok, Divine Deliverance": {
    abilities: [
      triggered(when.diesSelf, [fx.destroy(ref.target("p")), fx.toBattlefield(ref.target("c"))], {
        targets: [
          targetObj("p", { permanent: true }, "permanent"),
          target.cardInGraveyard("c", { ...PERMANENT_CARD, legendary: false }, "you", "carte de permanent non légendaire"),
        ],
        label: "Détruisez un permanent, renvoyez une carte de permanent",
      }),
    ],
  },
};
