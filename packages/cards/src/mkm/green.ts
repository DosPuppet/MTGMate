/**
 * Murders at Karlov Manor — cartes vertes (lot A). Le déguisement, la garde, l'Équipement, réunir des preuves (coût
 * additionnel facultatif, lu comme un kicker : `cond.kicked`) et les mots-clés sont lus dans le texte ; « enquêtez »
 * crée un Indice (`investigate`).
 */
import type { ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  DETECTIVE,
  fx,
  GOBLIN,
  HUMAN,
  investigate,
  MERFOLK_U,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** « une carte de créature ou de terrain ». */
const CREATURE_OR_LAND: ObjectFilter = { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] };
/** « une carte de terrain avec un type de terrain de base ». */
const LAND_WITH_BASIC_TYPE: ObjectFilter = {
  types: ["Land"],
  anySubtype: ["Plains", "Island", "Swamp", "Mountain", "Forest"],
};
/** Slime Against Humanity : « des Limons ou des cartes nommées Slime Against Humanity ». */
const OOZE_OR_SLIME: ObjectFilter = { anyOf: [{ subtype: "Ooze" }, { name: "Slime Against Humanity" }] };

/** Plante : créature verte 0/1. */
const PLANT: TokenSpec = { name: "Plant", colors: ["G"], types: ["Creature"], subtypes: ["Plant"], power: 0, toughness: 1 };
/** Limon : créature verte 0/0 avec le piétinement. */
const OOZE: TokenSpec = {
  name: "Ooze",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Ooze"],
  power: 0,
  toughness: 0,
  keywords: ["trample"],
};

export const GREEN: Record<string, CardScript> = {
  "Aftermath Analyst": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "Meulez trois cartes" }),
      activated({
        mana: "{3}{G}",
        sacrifice: true,
        effects: [fx.moveAll("graveyard", ref.you, { types: ["Land"] }, { to: "battlefield", tapped: true })],
        label: "Renvoyez toutes les cartes de terrain de votre cimetière sur le champ de bataille, engagées",
      }),
    ],
  },
  "Analyze the Pollen": {
    // Réunir des preuves 8 (coût additionnel facultatif) : lu dans le texte.
    spell: spell(
      [],
      [...fx.when(cond.not(cond.kicked), fx.search(BASIC_LAND)), ...fx.when(cond.kicked, fx.search(CREATURE_OR_LAND))],
    ),
  },
  "Archdruid's Charm": {
    spell: modal(
      mode(
        "Cherchez une carte de créature ou de terrain",
        [],
        [
          // La carte trouvée passe par la main ; un terrain va ensuite sur le champ de bataille engagé.
          fx.search(CREATURE_OR_LAND, { to: "hand" }, 1, undefined, "found"),
          fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { pool: ref.stored("found") }),
        ],
      ),
      mode(
        "Un marqueur +1/+1, puis elle blesse une créature adverse",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.addCounters(ref.target("a"), 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
      ),
      mode(
        "Exilez un artefact ou un enchantement",
        [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        [fx.exile(ref.target())],
      ),
    ),
  },
  "Audience with Trostani": {
    spell: spell(
      [],
      [fx.createTokens(PLANT), fx.draw(amount.distinctNames({ types: ["Creature"], controller: "you", token: true }))],
    ),
  },
  "Bite Down on Crime": {
    // Réunir des preuves 6 (coût additionnel facultatif) : lu dans le texte ; il coûte alors {2} de moins.
    costReduction: { generic: 2, condition: cond.kicked },
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 2, 0), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Case of the Locked Hothouse": {
    abilities: [playerStatic({ extraLands: 1, label: "Un terrain supplémentaire à chacun de vos tours" })],
    caseToSolve: cond.controls({ types: ["Land"] }, 7),
    caseSolved: [
      playerStatic({ lookAtTopCard: true, label: "Regardez la carte du dessus" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ types: ["Land"] }, { types: ["Creature", "Enchantment"] }] } },
        label: "Terrains, sorts de créature et d'enchantement du dessus de votre bibliothèque",
      }),
    ],
  },
  "Case of the Trampled Garden": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(2, ref.target())], {
        targets: [target.between(1, 2, target.creature("t", { controller: "you" }))],
        label: "Répartissez deux marqueurs +1/+1",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.totalPower(YOUR_CREATURES), 8),
    caseSolved: [
      triggered(when.attackWith(1), [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["trample"] })], {
        targets: [target.creature("t", { attacking: true })],
        label: "Un marqueur +1/+1 et le piétinement pour un attaquant",
      }),
    ],
  },
  "Chalk Outline": {
    abilities: [
      triggered(
        when.zoneChange(["graveyard"], { filter: { types: ["Creature"] }, whose: "you" }),
        [fx.createTokens(DETECTIVE), investigate()],
        { batched: true, label: "Un Détective 2/2, puis enquêtez" },
      ),
    ],
  },
  "Fanatical Strength": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3, ["trample"])]),
  },
  "Flourishing Bloom-Kin": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { subtype: "Forest", controller: "you" }, label: "+1/+1 par Forêt" },
      ),
      triggered(
        when.turnedFaceUp,
        [
          // Les Forêts trouvées passent par la main ; l'une d'elles va ensuite sur le champ de bataille engagée.
          fx.search({ types: ["Land"], subtype: "Forest" }, { to: "hand" }, 2, undefined, "forests"),
          fx.pickFromZone(
            "hand",
            { subtype: "Forest" },
            { to: "battlefield", tapped: true },
            { pool: ref.stored("forests"), prompt: "La Forêt à mettre sur le champ de bataille engagée" },
          ),
        ],
        { label: "Cherchez deux Forêts : l'une sur le champ de bataille, l'autre en main" },
      ),
    ],
  },
  "Get a Leg Up": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), amount.count(YOUR_CREATURES), amount.count(YOUR_CREATURES), ["reach"])],
    ),
  },
  "Glint Weaver": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(3, ref.target()), fx.gainLife(amount.maxToughness(YOUR_CREATURES))], {
        targets: [target.between(1, 3, target.creature())],
        label: "Répartissez trois marqueurs +1/+1, puis gagnez des PV",
      }),
    ],
  },
  "Greenbelt Radical": {
    abilities: [
      triggered(
        when.turnedFaceUp,
        [fx.addCountersAll(YOUR_CREATURES, 1), fx.modifyAll(YOUR_CREATURES, { addKeywords: ["trample"] })],
        { label: "Un marqueur +1/+1 sur chacune de vos créatures, qui gagnent le piétinement" },
      ),
    ],
  },
  "Hard-Hitting Question": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creatureOrPlaneswalker("b", { controller: "opponent" })],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Hide in Plain Sight": {
    spell: spell(
      [],
      [
        fx.lookAtTop(5, { count: 2, exact: true, to: { to: "libraryTop" }, rest: "bottom", store: "cloak" }),
        fx.putFaceDown(ref.stored("cloak"), true),
      ],
    ),
  },
  "Loxodon Eavesdropper": {
    abilities: [
      triggered(when.entersSelf, [investigate()], { label: "Enquêtez" }),
      triggered(when.draw(2), [fx.pump(ref.self, 1, 1, ["vigilance"])], {
        label: "Deuxième carte piochée : +1/+1 et la vigilance",
      }),
    ],
  },
  "Nervous Gardener": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.search(LAND_WITH_BASIC_TYPE)], {
        label: "Cherchez une carte de terrain avec un type de terrain de base",
      }),
    ],
  },
  "Pick Your Poison": {
    spell: modal(
      mode("Chaque adversaire sacrifie un artefact", [], [fx.sacrifice(ref.eachOpponent, { types: ["Artifact"] })]),
      mode("Chaque adversaire sacrifie un enchantement", [], [fx.sacrifice(ref.eachOpponent, { types: ["Enchantment"] })]),
      mode(
        "Chaque adversaire sacrifie une créature avec le vol",
        [],
        [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], keyword: "flying" })],
      ),
    ),
  },
  "Pompous Gadabout": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.yourTurn, label: "Défense talismanique pendant votre tour" },
      ),
      // Seules les créatures face cachée n'ont pas de nom.
      blockAbility(block.notBy({ faceDown: true }, "Imblocable par les créatures sans nom")),
    ],
  },
  "The Pride of Hull Clade": {
    costReduction: { generic: amount.totalToughness(YOUR_CREATURES) },
    abilities: [
      activated({
        mana: "{2}{U}{U}",
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.modify(ref.target(), {
            power: 1,
            addKeywords: ["attacksDespiteDefender"],
            addAbilities: [
              triggered(when.combatDamageToPlayer, [fx.draw(amount.toughnessOf(ref.self))], {
                label: "Piochez autant de cartes que son endurance",
              }),
            ],
          }),
        ],
        label: "+1/+0, pioche en blessant un joueur, attaque malgré le défenseur",
      }),
    ],
  },
  Rope: {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 2, addKeywords: ["reach"], addBlockRules: [block.atMost(1)] },
        { label: "+1/+2, la portée, bloquée par une seule créature au plus" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Piochez une carte" }),
    ],
  },
  "Rubblebelt Maverick": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" }),
      activated({
        mana: "{G}",
        exileSelf: true,
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Depuis le cimetière : un marqueur +1/+1",
      }),
    ],
  },
  "Sharp-Eyed Rookie": {
    abilities: [
      triggered(when.enters(YOUR_CREATURES), [fx.addCounters(ref.self, 1), investigate()], {
        condition: cond.any(
          cond.amountAtLeast(amount.plus(amount.powerOf(ref.eventObject), amount.neg(amount.powerOf(ref.self))), 1),
          cond.amountAtLeast(amount.plus(amount.toughnessOf(ref.eventObject), amount.neg(amount.toughnessOf(ref.self))), 1),
        ),
        label: "Plus forte ou plus endurante : un marqueur +1/+1, puis enquêtez",
      }),
    ],
  },
  "Slime Against Humanity": {
    spell: spell(
      [],
      [
        fx.createTokens(OOZE, 1, undefined, "ooze"),
        fx.addCounters(
          ref.stored("ooze"),
          amount.plus(2, amount.countIn("graveyard", OOZE_OR_SLIME), amount.countExiled(OOZE_OR_SLIME)),
        ),
      ],
    ),
  },
  "They Went This Way": {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }), investigate()]),
  },
  "Undergrowth Recon": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { tapped: true })], {
        targets: [target.cardInGraveyard("t", { types: ["Land"] })],
        label: "Renvoyez une carte de terrain de votre cimetière, engagée",
      }),
    ],
  },
  "Vengeful Creeper": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.destroy(ref.target())], {
        targets: [
          target.permanent("t", ["Artifact", "Enchantment"], { controller: "opponent" }, "artefact ou enchantement adverse"),
        ],
        label: "Détruisez un artefact ou un enchantement adverse",
      }),
    ],
  },
  "Vitu-Ghazi Inspector": {
    // Réunir des preuves 6 (coût additionnel facultatif) et portée : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1), fx.gainLife(2)], {
        condition: cond.kicked,
        targets: [target.creature()],
        label: "Preuves réunies : un marqueur +1/+1 et 2 PV",
      }),
    ],
  },
  "Sample Collector": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayCollectEvidence(
          3,
          {},
          fx.reflexive([target.creature("c", { controller: "you" })], [fx.addCounters(ref.target("c"), 1)]),
        ),
        { label: "Vous pouvez réunir des preuves 3 : un marqueur +1/+1" },
      ),
    ],
  },
  "Tunnel Tipster": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.amountAtLeast(
          amount.turnEvents({ event: "zone", to: "battlefield", who: "you", faceDown: true, types: ["Creature"] }),
          1,
        ),
        label: "Une créature face cachée est arrivée sous votre contrôle : un marqueur +1/+1",
      }),
      manaAbility("G"),
    ],
  },
  "Airtight Alibi": {
    // Flash : lu dans le texte.
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.untap(ref.attached), fx.pump(ref.attached, 0, 0, ["hexproof"]), fx.suspect(ref.attached, false)],
        { label: "Dégagez-la ; défense talismanique ; elle n'est plus suspecte" },
      ),
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addKeywords: ["cantBeSuspected"] },
        {
          label: "+2/+2, ne peut pas devenir suspecte",
        },
      ),
    ],
  },
  "Culvert Ambusher": {
    // Déguisement {4}{G} : lu dans le texte.
    abilities: [
      ...[when.entersSelf, when.turnedFaceUp].map((w) =>
        triggered(
          w,
          [fx.modify(ref.target(), { addBlockRules: [{ mustBlock: true, label: "Bloque si possible" }] }, "endOfTurn")],
          {
            targets: [target.creature()],
            label: "La créature ciblée bloque ce tour-ci si possible",
          },
        ),
      ),
    ],
  },
  "Hedge Whisperer": {
    abilities: [
      staticAbility("self", { addKeywords: ["mayNotUntap"] }, { label: "Vous pouvez choisir de ne pas la dégager" }),
      activated({
        mana: "{3}{G}",
        tap: true,
        collectEvidence: 4,
        sorcerySpeed: true,
        targets: [target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez")],
        effects: [
          fx.modifyWhileTapped(ref.target(), {
            addTypes: ["Creature"],
            addSubtypes: ["Plant", "Boar"],
            setColors: ["G"],
            setPower: 5,
            setToughness: 5,
            addKeywords: ["haste"],
          }),
        ],
        label: "Un terrain devient un Sanglier Plante 5/5 avec la célérité tant qu'elle reste engagée",
      }),
    ],
  },
  "A Killer Among Us": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(HUMAN),
          fx.createTokens(MERFOLK_U),
          fx.createTokens(GOBLIN),
          fx.chooseForSelf("creatureType", { options: ["Human", "Merfolk", "Goblin"], secret: true }),
        ],
        { label: "Un Humain, un Ondin et un Gobelin ; choisissez secrètement l'un de ces types" },
      ),
      activated({
        sacrifice: true,
        targets: [
          {
            id: "t",
            label: "jeton de créature attaquant",
            filter: { objects: { types: ["Creature"], token: true, attacking: true } },
          },
        ],
        effects: fx.when(
          cond.refMatches(ref.target(), { subtypeChosen: true }),
          fx.addCounters(ref.target(), 3),
          fx.pump(ref.target(), 0, 0, ["deathtouch"]),
        ),
        label: "Sacrifiez-le, révélez le type : trois marqueurs +1/+1 et le contact mortel s'il est de ce type",
      }),
    ],
  },
};
