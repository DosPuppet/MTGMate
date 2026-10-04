/**
 * Aetherdrift, lot C : cartes uniques (contrôle lié, échange de contrôle, copies, nom choisi, planeswalker-Équipement,
 * coûts « X », déclencheurs groupés…).
 */
import type { CardScript, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_VEHICLE,
  CREATURE_YOU_CONTROL,
  cond,
  ELEPHANT,
  entersWith,
  exhaust,
  fx,
  loyalty,
  MOUNT_OR_VEHICLE,
  manaAbility,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  PILOT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VEHICLE,
  wardAbility,
  when,
} from "./common";

const AFFINITY_ARTIFACTS = { generic: amount.count({ types: ["Artifact"], controller: "you" }) };
const ARTIFACT_OR_CREATURE_YOU = { ...CREATURE_OR_ARTIFACT, controller: "you" as const };
const MAX_PLAYERS = 4;

/** « Pour chaque adversaire / joueur, jusqu'à une cible que ce joueur contrôle ». */
const onePerPlayer = (t: TargetSpec): TargetSpec => ({ ...target.upTo(MAX_PLAYERS, t), differentPlayers: true });

export const UNIQUE: Record<string, CardScript> = {
  // --- Blanc -----------------------------------------------------------------
  "Skyseer's Chariot": { chooseOnEnter: "cardName", chosenNameTax: 2 },

  // --- Bleu ------------------------------------------------------------------
  "Possession Engine": {
    abilities: [
      triggered(when.entersSelf, fx.gainControlWhileSource(ref.target(), true), {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Prenez le contrôle d'une créature (tant que vous contrôlez ce Véhicule)",
      }),
    ],
  },
  "Repurposing Bay": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [
          fx.search(
            { types: ["Artifact"] },
            { to: "battlefield" },
            1,
            undefined,
            undefined,
            amount.plus(1, amount.manaValueOf(ref.costSacrificed)),
          ),
        ],
        label: "Un artefact de VM 1 + celle de l'artefact sacrifié",
      }),
    ],
  },
  "Trade the Helm": {
    spell: spell(
      [
        target.permanent("a", ["Artifact", "Creature"], { controller: "you" }, "artefact ou créature que vous contrôlez"),
        target.permanent("b", ["Artifact", "Creature"], { controller: "opponent" }, "artefact ou créature adverse"),
      ],
      [fx.exchangeControl(ref.target("a"), ref.target("b"))],
    ),
  },
  "Waxen Shapethief": { entersAsCopyOf: ARTIFACT_OR_CREATURE_YOU },

  // --- Noir ------------------------------------------------------------------
  "Ancient Vendetta": {
    spell: spell([target.player("t", "opponent")], [fx.chooseCardName, fx.exileNamed(ref.target(), 4)]),
  },
  "Cursecloth Wrappings": {
    abilities: [
      staticAbility({ subtype: "Zombie", controller: "you" }, { power: 1, toughness: 1 }, { label: "Zombies +1/+1" }),
      // Approximation de l'embaumement accordé : payé tout de suite, en rituel ; le jeton garde ses couleurs.
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature")],
        effects: [
          fx.payCostOf(ref.target(), "p", "Payer son coût de mana (embaumement) ?"),
          fx.when(
            cond.v("p"),
            fx.exileCard(ref.target(), { name: "e" }),
            fx.copyToken(ref.stored("e"), { addSubtypes: ["Zombie"] }),
          ),
        ],
        label: "Embaumement",
      }),
    ],
  },
  "Demonic Junker": {
    costReduction: AFFINITY_ARTIFACTS,
    abilities: [
      triggered(
        when.entersSelf,
        // « Si une créature que vous contrôliez a été détruite de cette façon » : la carte mise au cimetière.
        [
          fx.destroy(ref.target(), "d"),
          fx.when(cond.refMatches(ref.stored("d"), { controller: "you" }), fx.addCounters(ref.self, 2)),
        ],
        { targets: [onePerPlayer(target.creature("t"))], label: "Une créature par joueur détruite" },
      ),
    ],
  },
  "Gonti, Night Minister": {
    abilities: [
      triggered(when.castSpellNotOwned, [fx.createTokens(TREASURE, 1, ref.eventPlayer)], { label: "Trésor" }),
      // Exilée face cachée (visible pour vous) ; jouable tant qu'elle reste exilée, avec du mana de n'importe quel type.
      triggered(
        when.combatDamageToOpponent({ types: ["Creature"] }),
        [fx.exileTop(ref.eventPlayer, 1, "g", "you"), fx.grantPlay(ref.stored("g"), { forever: true, anyMana: true })],
        { label: "Exilez la carte du dessus de sa bibliothèque, jouable" },
      ),
    ],
  },
  "Intimidation Tactics": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { types: ["Artifact", "Creature"] }, chooser: "controller", exile: true })],
    ),
  },
  "The Last Ride": {
    abilities: [
      staticAbility("self", { power: -1, toughness: -1 }, { perLife: true, label: "-X/-X (vos PV)" }),
      activated({ mana: "{2}{B}", payLife: 2, effects: [fx.draw(1)], label: "Piochez" }),
    ],
  },
  "Wickerfolk Indomitable": { castFromGraveyard: { payLife: 2, sacrifice: CREATURE_OR_ARTIFACT } },

  // --- Rouge -----------------------------------------------------------------
  "Chandra, Spark Hunter": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.animateVehicle(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"])], {
        targets: [target.upTo(1, targetObj("t", { subtype: "Vehicle", controller: "you" }, "Véhicule que vous contrôlez"))],
        label: "Un Véhicule devient une créature avec la célérité",
      }),
      loyalty(2, {
        effects: [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { optional: true, store: "d" })),
          fx.when(cond.not(cond.all(cond.not(cond.v("s")), cond.not(cond.v("d")))), fx.draw(1)),
        ],
        label: "Sacrifiez un artefact ou défaussez : piochez",
      }),
      loyalty(0, { effects: [fx.createTokens(VEHICLE)], label: "Véhicule 3/2" }),
      loyalty(-7, {
        effects: [
          fx.emblem("Chandra", "Whenever an artifact you control enters, this emblem deals 3 damage to any target.", [
            triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.damage(3, ref.target())], {
              targets: [target.any("t")],
              label: "3 blessures",
            }),
          ]),
        ],
        label: "Emblème",
      }),
    ],
  },
  "Daretti, Rocketeer Engineer": {
    cdaPower: amount.maxManaValue({ types: ["Artifact"], controller: "you" }),
    abilities: [
      ...(["entersSelf", "attacksSelf"] as const).map((w) =>
        triggered(
          when[w],
          [
            fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
            fx.when(cond.v("s"), fx.toBattlefield(ref.target())),
          ],
          {
            targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "carte d'artefact")],
            label: "Sacrifiez un artefact : renvoyez la carte choisie",
          },
        ),
      ),
    ],
  },
  "Full Throttle": {
    spell: spell(
      [],
      [
        fx.extraCombatsAfterMain(2),
        fx.emblem(
          "Full Throttle",
          "At the beginning of each combat this turn, untap all creatures that attacked this turn.",
          [
            triggered(
              when.step("beginCombat"),
              [fx.untap(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"], attackedThisTurn: true }))],
              { label: "Dégagez les créatures qui ont attaqué" },
            ),
          ],
          true,
        ),
      ],
    ),
  },
  "Gastal Thrillroller": {
    abilities: [
      triggered(when.entersSelf, [fx.animateVehicle()], { label: "Créature-artefact jusqu'à la fin du tour" }),
      activated({
        mana: "{2}{R}",
        discard: 1,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
        label: "Revenir avec un marqueur de finalité",
      }),
    ],
  },
  "Push the Limit": {
    spell: spell(
      [],
      [
        fx.moveAll("graveyard", ref.you, MOUNT_OR_VEHICLE, { to: "battlefield" }, "p"),
        fx.delayed([fx.sacrificeIt(ref.target("p"))], { p: ref.stored("p") }),
        fx.modifyAll({ subtype: "Vehicle", controller: "you" }, { addTypes: ["Artifact", "Creature"] }),
        fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["haste"]),
      ],
    ),
  },

  // --- Vert ------------------------------------------------------------------
  "Dredger's Insight": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { filter: CREATURE_OR_ARTIFACT, whose: "you" }), [fx.gainLife(1)], {
        batched: true,
        label: "+1 PV",
      }),
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Artifact", "Creature", "Land"] },
            { to: "hand" },
            {
              min: 0,
              pool: ref.stored("m"),
              prompt: "Vous pouvez reprendre une carte d'artefact, de créature ou de terrain meulée",
            },
          ),
        ],
        { label: "Meulez quatre cartes, reprenez-en une" },
      ),
    ],
  },
  "Fang-Druid Summoner": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"], noAbilities: true },
            { to: "hand" },
            {
              min: 0,
              store: "g",
              prompt: "Vous pouvez reprendre une carte de créature sans capacité",
            },
          ),
          fx.when(cond.not(cond.v("g")), fx.search({ types: ["Creature"], noAbilities: true })),
        ],
        { label: "Une carte de créature sans capacité" },
      ),
    ],
  },
  "March of the World Ooze": {
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { setPower: 6, setToughness: 6, addSubtypes: ["Ooze"] }, { label: "6/6, Limons" }),
      triggered(when.castSpellOffTurn("opponent"), [fx.createTokens(ELEPHANT)], { label: "Éléphant 3/3" }),
    ],
  },
  "Oviya, Automech Artisan": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", attacking: true },
        { addKeywords: ["trample"] },
        { label: "Piétinement" },
      ),
      activated({
        mana: "{G}",
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            CREATURE_OR_VEHICLE,
            { to: "battlefield" },
            { min: 0, store: "o", prompt: "Créature ou Véhicule" },
          ),
          fx.when(cond.refMatches(ref.stored("o"), { types: ["Artifact"] }), fx.addCounters(ref.stored("o"), 2)),
        ],
        label: "Une créature ou un Véhicule de votre main",
      }),
    ],
  },
  "Rise from the Wreck": {
    spell: spell(
      [
        target.upTo(1, target.cardInGraveyard("a", { types: ["Creature"] }, "you", "carte de créature")),
        { ...target.upTo(1, target.cardInGraveyard("b", { subtype: "Mount" }, "you", "carte de Monture")), otherThan: ["a"] },
        {
          ...target.upTo(1, target.cardInGraveyard("c", { subtype: "Vehicle" }, "you", "carte de Véhicule")),
          otherThan: ["a", "b"],
        },
        {
          ...target.upTo(
            1,
            target.cardInGraveyard("d", { types: ["Creature"], noAbilities: true }, "you", "créature sans capacité"),
          ),
          otherThan: ["a", "b", "c"],
        },
      ],
      [fx.toHand(ref.target("a")), fx.toHand(ref.target("b")), fx.toHand(ref.target("c")), fx.toHand(ref.target("d"))],
    ),
  },
  "Thunderous Velocipede": {
    abilities: [
      entersWith({ counters: 1, affects: { ...CREATURE_OR_VEHICLE, controller: "you", maxManaValue: 4 }, label: "+1 marqueur" }),
      entersWith({ counters: 3, affects: { ...CREATURE_OR_VEHICLE, controller: "you", minManaValue: 5 }, label: "+3 marqueurs" }),
    ],
  },

  // --- Multicolores ----------------------------------------------------------
  "Captain Howler, Sea Scourge": {
    abilities: [
      triggered(
        when.discardBatch(),
        [
          fx.pump(ref.target(), amount.plus(amount.eventAmount, amount.eventAmount), 0),
          fx.modify(ref.target(), {
            addAbilities: [triggered(when.combatDamage("self", true), [fx.draw(1)], { label: "Piochez" })],
          }),
        ],
        { targets: [target.creature("t")], label: "+2/+0 par carte défaussée" },
      ),
    ],
  },
  "Cloudspire Coordinator": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({
        tap: true,
        // Journal du tour : celles qui sont reparties comptent aussi (une Monture-Véhicule n'est comptée qu'une fois).
        effects: [
          fx.createTokens(
            PILOT,
            amount.plus(
              amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Mount", who: "you" }),
              amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Vehicle", notSubtype: "Mount", who: "you" }),
            ),
          ),
        ],
        label: "Un Pilote par Monture ou Véhicule arrivé ce tour-ci",
      }),
    ],
  },
  "Coalstoke Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.moveTo(
            ref.target(),
            { to: "battlefield", underYourControl: true, counters: { kind: "finality", n: 1 } },
            { name: "c" },
          ),
          fx.modify(ref.stored("c"), { addKeywords: ["menace", "deathtouch", "haste"] }, "permanent"),
          fx.delayedAt("yourEndStep", [fx.exile(ref.target("c"))], { c: ref.stored("c") }),
        ],
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 4 }, "any", "carte de créature")],
          label: "Une créature d'un cimetière, exilée à votre étape de fin",
        },
      ),
    ],
  },
  "Dune Drifter": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { ...CREATURE_OR_ARTIFACT, maxManaValueX: true }, "you", "carte d'artefact ou de créature"),
        ],
        label: "Renvoyez un artefact ou une créature de VM X ou moins",
      }),
    ],
  },
  "Fearless Swashbuckler": {
    abilities: [
      staticAbility(
        { subtype: "Vehicle", controller: "you" },
        { addKeywords: ["haste"] },
        { label: "Vos Véhicules ont la célérité" },
      ),
      triggered(when.attackWith(1), [fx.draw(3), fx.discard(2)], {
        condition: cond.all(
          cond.controls({ subtype: "Pirate", attacking: true }),
          cond.controls({ subtype: "Vehicle", attacking: true }),
        ),
        label: "Un Pirate et un Véhicule attaquent : piochez trois, défaussez deux",
      }),
    ],
  },
  "Guidelight Pathmaker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search({ types: ["Artifact"] }, { to: "hand" }, 1, undefined, "a"),
          fx.when(cond.refMatches(ref.stored("a"), { maxManaValue: 2 }), fx.toBattlefield(ref.stored("a"))),
        ],
        { label: "Un artefact (sur le champ de bataille si VM 2 ou moins)" },
      ),
    ],
  },
  "Ketramose, the New Dawn": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.exileAtLeast(7)),
          label: "Moins de sept cartes en exil : n'attaque ni ne bloque",
        },
      ),
      triggered(when.zoneChange(["graveyard", "battlefield"], { to: ["exile"] }), [fx.draw(1), fx.loseLife(1)], {
        condition: cond.yourTurn,
        batched: true,
        label: "Piochez, perdez 1 PV",
      }),
    ],
  },
  "Mimeoplasm, Revered One": {
    devour: { filter: { types: ["Creature"] }, n: 3, graveyardUpToX: true },
    abilities: [
      activated({
        mana: "{2}",
        targets: [
          {
            id: "t",
            label: "carte de créature exilée avec elle",
            filter: { exiled: { linked: true, filter: { types: ["Creature"] } } },
          },
        ],
        effects: [fx.becomeCopyKeepAbilities(ref.target())],
        label: "Devient une copie (0/0)",
      }),
    ],
  },
  "Redshift, Rocketeer Chief": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { selfPower: true, restriction: { abilityOfSource: {} } }),
      exhaust({
        mana: "{10}{R}{G}",
        effects: [
          fx.pickFromZone(
            "hand",
            { permanent: true },
            { to: "battlefield" },
            { count: 60, min: 0, prompt: "Cartes de permanent" },
          ),
        ],
        label: "des permanents de votre main",
      }),
    ],
  },
  "Riptide Gearhulk": {
    abilities: [
      triggered(when.entersSelf, [fx.moveTo(ref.target(), { to: "libraryTop", fromTop: 3 })], {
        targets: [onePerPlayer(target.nonland("t", { controller: "opponent" }))],
        label: "Troisième depuis le dessus de la bibliothèque",
      }),
    ],
  },
  "Sab-Sunen, Luxa Embodied": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.evenCounters),
          label: "Nombre impair de marqueurs : n'attaque ni ne bloque",
        },
      ),
      triggered(when.step("main1"), [fx.addCounters(ref.self, 1), fx.when(cond.not(cond.evenCounters), fx.draw(2))], {
        label: "Marqueur +1/+1 ; impair : piochez deux cartes",
      }),
    ],
  },
  "Sita Varma, Masked Racer": {
    abilities: [
      exhaust({
        mana: "{X}{G}{G}{U}",
        effects: [
          fx.addCounters(ref.self, amount.x),
          ...fx.may(
            "Les autres créatures prennent la force de Sita Varma ?",
            fx.setBasePTAll(OTHER_CREATURE_YOU_CONTROL, amount.powerOf(ref.self)),
          ),
        ],
        label: "X marqueurs, F/E de base des autres créatures",
      }),
    ],
  },
  "Skyserpent Seeker": {
    abilities: [
      exhaust({
        mana: "{4}",
        effects: [fx.revealUntilN({ types: ["Land"] }, 2, { to: "battlefield", tapped: true }), fx.addCounters(ref.self, 1)],
        label: "deux terrains, marqueur +1/+1",
      }),
    ],
  },
  "Winter, Cursed Rider": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        { addAbilities: [wardAbility({ life: 2 })] },
        {
          label: "Vos artefacts : garde (2 PV)",
        },
      ),
      exhaust({
        mana: "{2}{U}{B}",
        tap: true,
        exileFromGraveyardX: { types: ["Artifact"] },
        effects: [
          fx.pumpAll({ types: ["Creature"], notTypes: ["Artifact"], other: true }, amount.neg(amount.x), amount.neg(amount.x)),
        ],
        label: "les autres créatures non-artefacts -X/-X",
      }),
    ],
  },

  // --- Incolores -------------------------------------------------------------
  "The Aetherspark": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], attachedToSource: true }),
        [fx.counters(ref.self, "loyalty", amount.eventAmount)],
        { condition: cond.yourTurn, label: "Autant de marqueurs de loyauté" },
      ),
      loyalty(1, {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        effects: [fx.attach(ref.target()), fx.addCounters(ref.target(), 1)],
        label: "Attachez-le, marqueur +1/+1",
      }),
      loyalty(-5, { effects: [fx.draw(2)], label: "Piochez deux cartes" }),
      loyalty(-10, { effects: [fx.addManaChoice(10)], label: "Dix mana d'une couleur" }),
    ],
  },
  "Lifecraft Engine": {
    chooseOnEnter: "creatureType",
    abilities: [
      // Approximation : tous vos Véhicules (créatures ou non) ont le type choisi ; un filtre « créature » serait figé
      // avant l'équipage, plus récent (dépendance 613.8a non gérée pour l'ensemble affecté en couche 4).
      staticAbility(
        { subtype: "Vehicle", controller: "you" },
        { addChosenSubtype: true },
        {
          label: "Vos Véhicules créatures ont le type choisi",
        },
      ),
      staticAbility(
        { types: ["Creature"], controller: "you", subtypeChosen: true, other: true },
        { power: 1, toughness: 1 },
        {
          label: "+1/+1",
        },
      ),
    ],
  },
  "Monument to Endurance": {
    abilities: [
      triggeredModal(
        when.discard("you"),
        [
          mode("Piochez", [], [fx.draw(1)]),
          mode("Trésor", [], [fx.createTokens(TREASURE)]),
          mode("Chaque adversaire perd 3 PV", [], [fx.loseLife(3, ref.eachOpponent)]),
        ],
        { uniqueModes: "turn", label: "Un mode pas encore choisi ce tour-ci" },
      ),
    ],
  },
  "Pit Automaton": {
    abilities: [
      manaAbility("C", 2, { restriction: { abilityOfSource: {} } }),
      activated({ mana: "{2}", tap: true, effects: [fx.copyNextExhaust], label: "Copiez la prochaine capacité d'exhaust" }),
    ],
  },
  "Radiant Lotus": {
    abilities: [
      // Approximation : c'est vous qui ajoutez le mana (pas de joueur ciblé).
      activated({
        tap: true,
        sacrificeX: { types: ["Artifact"] },
        effects: [fx.addManaChoice(amount.plus(amount.x, amount.x, amount.x))],
        label: "Trois mana d'une couleur par artefact sacrifié",
      }),
    ],
  },
};
