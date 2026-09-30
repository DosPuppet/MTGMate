/** Final Fantasy — les dernières cartes uniques (lot D4). */
import type { CardScript, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  entersWith,
  fx,
  graveyardReplacement,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const EQUIPMENT_YOU = { subtype: "Equipment", controller: "you" as const };
const LANDS_AND_BIRDS = { anyOf: [{ types: ["Land" as const] }, { types: ["Creature" as const], subtype: "Bird" }] };

export const LEGENDS4: Record<string, CardScript> = {
  "Ultima, Origin of Oblivion": {
    abilities: [
      triggered(when.attacksSelf, [fx.counters(ref.target(), "blight", 1)], {
        targets: [targetObj("t", { types: ["Land"] }, "terrain")],
        label: "Marqueur de fléau sur un terrain",
      }),
      // Approximation : l'effet sur les terrains avec un marqueur de fléau cesse si Ultima quitte le champ de bataille.
      staticAbility(
        { types: ["Land"], withCounter: "blight" },
        { setSubtypes: [], loseAllAbilities: true, addAbilities: [manaAbility("C")] },
        { label: "Terrains flétris : « {T} : Ajoutez {C} »" },
      ),
      playerStatic({ extraColorlessFromLands: true, label: "Un terrain engagé pour {C} ajoute {C}" }),
    ],
  },
  "Zack Fair": {
    abilities: [
      entersWith({ counters: 1 }),
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.pump(ref.target(), 0, 0, ["indestructible"]),
          fx.addCounters(ref.target(), amount.lkiCounters("+1/+1")),
          // Approximation : tous les Équipements qui étaient attachés à Zack (et non un seul).
          fx.attach(ref.target(), ref.permanentsOf(ref.you, { ...EQUIPMENT_YOU, wasAttachedToSource: true })),
        ],
        label: "Indestructible, ses marqueurs et son Équipement",
      }),
    ],
  },
  "Gogo, Master of Mimicry": {
    abilities: [
      activated({
        mana: "{X}{X}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "capacité activée ou déclenchée que vous contrôlez",
            filter: { stackItems: { abilitiesOnly: true } },
          } satisfies TargetSpec,
        ],
        effects: [fx.when(cond.xAtLeast(1), fx.copySpell(ref.target(), amount.x))],
        label: "Copiez une capacité X fois",
      }),
    ],
  },
  "Stolen Uniform": {
    spell: spell(
      [target.creature("c", { controller: "you" }), targetObj("e", { subtype: "Equipment" }, "Équipement")],
      [
        fx.gainControl(ref.target("e")),
        fx.attach(ref.target("c"), ref.target("e")),
        // Approximation : l'Équipement est détaché à l'étape de fin (le contrôle revient au nettoyage).
        fx.delayed([fx.unattach(ref.target("e"), ref.target("c"))], { e: ref.target("e"), c: ref.target("c") }),
      ],
    ),
  },
  "The Darkness Crystal": {
    abilities: [
      costReducer({ colors: ["B"] }, 1, "Sorts noirs : {1} de moins"),
      graveyardReplacement({
        fromBattlefield: true,
        filter: { types: ["Creature"], controller: "opponent", nontoken: true },
        link: "uid",
        gainLife: 2,
        label: "Créatures adverses exilées au lieu de mourir, +2 PV",
      }),
      activated({
        mana: "{4}{B}{B}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "carte de créature exilée avec The Darkness Crystal",
            filter: { exiled: { linked: true, filter: { types: ["Creature"] } } },
          } satisfies TargetSpec,
        ],
        effects: [
          fx.moveTo(ref.target(), {
            to: "battlefield",
            tapped: true,
            underYourControl: true,
            counters: { kind: "+1/+1", n: 2 },
          }),
        ],
        label: "Une créature exilée revient sous votre contrôle",
      }),
    ],
  },
  "Firion, Wild Rose Warrior": {
    abilities: [
      staticAbility({ ...YOURS, equipped: true }, { addKeywords: ["haste"] }, { label: "Créatures équipées : célérité" }),
      triggered(
        when.enters({ ...EQUIPMENT_YOU, nontoken: true }),
        [fx.copyToken(ref.eventObject, { equipDiscount: 2, sacrificeAtNextUpkeep: true })],
        { label: "Copie de l'Équipement (Équiper {2} de moins)" },
      ),
    ],
  },
  "Raubahn, Bull of Ala Mhigo": {
    abilities: [
      wardAbility({ lifePower: true }),
      triggered(when.attacksSelf, [fx.attach(ref.target("c"), ref.target("e"))], {
        targets: [
          target.upTo(1, targetObj("e", EQUIPMENT_YOU, "Équipement que vous contrôlez")),
          target.creature("c", { attacking: true }),
        ],
        label: "Attachez un Équipement à une créature attaquante",
      }),
    ],
  },
  "Triple Triad": {
    abilities: [triggered(when.yourUpkeep, [fx.tripleTriad], { label: "Triple Triad" })],
  },
  "Unexpected Request": {
    // Approximation : l'Équipement est ciblé au lancement (et non choisi à la résolution).
    spell: spell(
      [target.creature("t"), target.upTo(1, targetObj("e", EQUIPMENT_YOU, "Équipement que vous contrôlez"))],
      [
        fx.gainControl(ref.target("t")),
        fx.untap(ref.target("t")),
        fx.pump(ref.target("t"), 0, 0, ["haste"]),
        fx.attach(ref.target("t"), ref.target("e")),
        fx.delayed([fx.unattach(ref.target("e"))], { e: ref.target("e") }),
      ],
    ),
  },
  "Vaan, Street Thief": {
    abilities: [
      triggered(
        when.combatDamageBatch({
          ...YOURS,
          anyOf: [{ subtype: "Scout" }, { subtype: "Pirate" }, { subtype: "Rogue" }],
        }),
        [
          fx.exileTop(ref.eventPlayer, 1, "v"),
          fx.castNow(ref.stored("v"), { storeCast: "cast" }),
          fx.when(cond.not(cond.v("cast")), fx.createTokens(TREASURE)),
        ],
        { label: "Exilez sa carte du dessus ; lancez-la ou Trésor" },
      ),
      triggered(
        when.castSpellNotOwned,
        [fx.addCountersAll({ ...YOURS, anyOf: [{ subtype: "Scout" }, { subtype: "Pirate" }, { subtype: "Rogue" }] }, 1)],
        { label: "Un marqueur sur chaque Éclaireur, Pirate et Voleur" },
      ),
    ],
  },
  "Ancient Adamantoise": {
    abilities: [
      staticAbility("self", { addKeywords: ["keepsDamage", "absorbsDamage"] }, { label: "Encaisse les blessures" }),
      triggered(when.diesSelf, [fx.exileCard(ref.selfCard), fx.createTappedTokens(TREASURE, 10)], {
        label: "Exilez-la, dix Trésors engagés",
      }),
    ],
  },
  "Traveling Chocobo": {
    abilities: [
      playerStatic({
        playFrom: { zone: "libraryTop", filter: LANDS_AND_BIRDS },
        triggerMod: { effect: "again", onEnter: true, entering: { ...LANDS_AND_BIRDS, controller: "you" } },
        label: "Terrains et Oiseaux du dessus ; déclencheurs d'arrivée doublés",
      }),
    ],
  },
  "Absolute Virtue": {
    cantBeCountered: true,
    abilities: [playerStatic({ protectionFromOpponents: true, label: "Protection contre vos adversaires" })],
  },
  "Zidane, Tantalus Thief": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["lifelink", "haste"])],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Prenez le contrôle d'une créature" },
      ),
      triggered(when.opponentGainsControl, [fx.createTokens(TREASURE)], { label: "Trésor" }),
    ],
  },
  "Buster Sword": {
    abilities: [
      staticAbility("attached", { power: 3, toughness: 2 }, { label: "+3/+2" }),
      triggered(
        when.attachedDealsCombatDamageToPlayer,
        [fx.draw(1), fx.castNow(ref.handOf(ref.you, { notTypes: ["Land"] }, amount.eventAmount), { free: true })],
        { label: "Piochez, lancez gratuitement un sort de VM ≤ blessures" },
      ),
    ],
  },
  "The Masamune": {
    doubleDeathTriggersForEquipped: true,
    abilities: [
      staticAbility(
        "attached",
        { addKeywords: ["firstStrike", "mustBeBlocked"] },
        { condition: cond.refMatches(ref.attached, { attacking: true }), label: "En attaque : initiative, doit être bloquée" },
      ),
    ],
  },
  "Clive's Hideaway": {
    abilities: [
      // Hideaway 4 (approximation : la carte est exilée face visible, comme Collector's Cage).
      triggered(
        when.entersSelf,
        [fx.lookAtTop(4, { count: 1, to: { to: "exile" }, rest: "bottom", store: "h" }), fx.link(ref.stored("h"))],
        { label: "Hideaway 4" },
      ),
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        effects: [
          fx.when(
            cond.controls({ types: ["Creature"], legendary: true }, 4),
            fx.grantPlay(ref.linked, { free: true, anyTime: true }),
          ),
        ],
        label: "Jouez la carte cachée (quatre créatures légendaires)",
      }),
    ],
  },
};
