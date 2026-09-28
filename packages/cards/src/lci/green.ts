/** The Lost Caverns of Ixalan — cartes vertes. */
import {
  activated,
  amount,
  BASIC_LAND,
  CAVE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  DINOSAUR_3_3,
  DINOSAUR_YOU,
  descend,
  entersWith,
  fx,
  MAP,
  manaAbility,
  modal,
  mode,
  PERMANENT_CARD,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const CREATURE = { types: ["Creature" as const] };
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const explores = triggered(when.entersSelf, [fx.explore()], { label: "Explore" });
const mayMillTwo = triggered(when.entersSelf, [...fx.may("Meuler deux cartes ?", fx.mill(2))], {
  label: "Meulez deux cartes",
});

export const GREEN: Record<string, CardScript> = {
  "Armored Kincaller": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], {
        condition: cond.any(
          cond.controls({ ...DINOSAUR_YOU, other: true }),
          cond.amountAtLeast(amount.countIn("hand", { subtype: "Dinosaur" }), 1),
        ),
        label: "+3 PV (Dinosaure révélé ou contrôlé)",
      }),
    ],
  },
  "Basking Capybara": {
    abilities: [staticAbility("self", { power: 3 }, { condition: descend(4), label: "Descente 4 — +3/+0" })],
  },
  "Bedrock Tortoise": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addKeywords: ["hexproof"] },
        {
          condition: cond.yourTurn,
          label: "Défense talismanique pendant votre tour",
        },
      ),
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addKeywords: ["assignsToughness"] },
        {
          label: "Blessures de combat selon l'endurance",
        },
      ),
    ],
  },
  "Cavern Stomper": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Regard 2" }),
      activated({
        mana: "{3}{G}",
        effects: [fx.pump(ref.self, 0, 0, ["cantBeBlockedByPowerLE2"])],
        label: "Imblocable par force 2 ou moins",
      }),
    ],
  },
  "Cenote Scout": { abilities: [explores] },
  "Coati Scavenger": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", PERMANENT_CARD, "you", "carte de permanent de votre cimetière")],
        condition: descend(4),
        label: "Descente 4 — carte de permanent en main",
      }),
    ],
  },
  "Disturbed Slumber": {
    spell: spell(
      [target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez")],
      [
        fx.modify(ref.target(), {
          addTypes: ["Creature"],
          addSubtypes: ["Dinosaur"],
          setPower: 4,
          setToughness: 4,
          addKeywords: ["reach", "haste", "mustBeBlocked"],
        }),
      ],
    ),
  },
  "Earthshaker Dreadmaw": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ ...DINOSAUR_YOU, other: true }))], {
        label: "Une carte par autre Dinosaure",
      }),
    ],
  },
  "Explorer's Cache": {
    abilities: [
      entersWith({ counters: 2, label: "Arrive avec deux marqueurs +1/+1" }),
      triggered(when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }), [fx.addCounters(ref.self, 1)], {
        label: "Marqueur +1/+1",
      }),
      activated({
        tap: true,
        removeCounters: { kind: "+1/+1", n: 1 },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Déplacez un marqueur +1/+1",
      }),
    ],
  },
  "Ghalta, Stampede Tyrant": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pickFromZone("hand", CREATURE, { to: "battlefield" }, { count: 60, min: 0, prompt: "Créatures à mettre en jeu" })],
        { label: "Créatures de votre main sur le champ de bataille" },
      ),
    ],
  },
  "Glimpse the Core": {
    spell: modal(
      mode(
        "Forêt de base engagée",
        [],
        [fx.search({ types: ["Land"], basic: true, subtype: "Forest" }, { to: "battlefield", tapped: true })],
      ),
      mode(
        "Caverne du cimetière engagée",
        [target.cardInGraveyard("t", { subtype: "Cave" }, "you", "carte de Caverne de votre cimetière")],
        [fx.toBattlefield(ref.target(), { tapped: true })],
      ),
    ),
  },
  "Glowcap Lantern": {
    abilities: [
      staticAbility(
        "attached",
        { addAbilities: [triggered(when.attacksSelf, [fx.explore()], { label: "Explore" })] },
        { label: "Explore en attaquant" },
      ),
      playerStatic({ lookAtTopCard: true, label: "Vous pouvez regarder la carte du dessus" }),
    ],
  },
  "Growing Rites of Itlimoc": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { filter: CREATURE, count: 1, rest: "bottom" })], {
        label: "Carte de créature en main",
      }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.controls(CREATURE_YOU_CONTROL, 4),
        label: "Transformation (quatre créatures)",
      }),
    ],
  },
  "Itlimoc, Cradle of the Sun": {
    abilities: [manaAbility("G"), manaAbility("G", 1, { per: CREATURE_YOU_CONTROL })],
  },
  "Huatli, Poet of Unity": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Terrain de base en main" }),
      activated({
        mana: "{3}{R/W}{R/W}",
        sorcerySpeed: true,
        effects: [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })],
        label: "Exilez-la, puis renvoyez-la transformée",
      }),
    ],
  },
  "Roar of the Fifth People": {
    abilities: [
      chapter([1], [fx.createTokens(DINOSAUR_3_3, 2)], { label: "Deux Dinosaures 3/3" }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [
                staticAbility(
                  CREATURE_YOU_CONTROL,
                  { addAbilities: [manaAbility(["R", "G", "W"])] },
                  {
                    label: "Vos créatures : {T} : {R}, {G} ou {W}",
                  },
                ),
              ],
            },
            "permanent",
          ),
        ],
        { label: "Vos créatures produisent du mana" },
      ),
      chapter([3], [fx.search({ subtype: "Dinosaur" })], { label: "Carte de Dinosaure en main" }),
      chapter([4], [fx.pumpAll(DINOSAUR_YOU, 0, 0, ["doubleStrike", "trample"])], {
        label: "Double initiative et piétinement",
      }),
    ],
  },
  "Huatli's Final Strike": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 1, 0), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Hulking Raptor": {
    abilities: [triggered(when.step("main1"), [fx.addMana("G", "G")], { label: "Ajoutez {G}{G}" })],
  },
  "In the Presence of Ages": {
    spell: spell([], [fx.lookAtTop(4, { filter: { anyOf: [CREATURE, { types: ["Land"] }] }, count: 2, rest: "graveyard" })]),
  },
  "Ixalli's Lorekeeper": {
    abilities: [
      manaAbility([...ANY_COLOR], 1, {
        restriction: { spell: { subtype: "Dinosaur" }, abilityOfSource: { subtype: "Dinosaur" } },
      }),
    ],
  },
  "Jadelight Spelunker": {
    abilities: [triggered(when.entersSelf, [fx.explore(ref.self, amount.sourceX)], { label: "Explore X fois" })],
  },
  "Malamet Battle Glyph": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        ...fx.when(cond.targetMatches("a", { enteredThisTurn: true }), fx.addCounters(ref.target("a"), 1)),
        fx.fight(ref.target("a"), ref.target("b")),
      ],
    ),
  },
  "Malamet Brawler": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["trample"])], {
        targets: [target.creature("t", { attacking: true })],
        label: "Piétinement",
      }),
    ],
  },
  "Malamet Scythe": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-la",
      }),
    ],
  },
  "Malamet Veteran": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        condition: descend(4),
        label: "Descente 4 — marqueur +1/+1",
      }),
    ],
  },
  "Mineshaft Spider": { abilities: [mayMillTwo] },
  "Nurturing Bristleback": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(DINOSAUR_3_3)], { label: "Dinosaure 3/3" })],
  },
  "Over the Edge": {
    spell: modal(
      mode(
        "Détruisez un artefact ou un enchantement",
        [targetObj("t", { types: ["Artifact", "Enchantment"] }, "artefact ou enchantement")],
        [fx.destroy(ref.target())],
      ),
      mode("Une créature explore deux fois", [target.creature("c", { controller: "you" })], [fx.explore(ref.target("c"), 2)]),
    ),
  },
  "Pathfinding Axejaw": { abilities: [explores] },
  "Poison Dart Frog": {
    abilities: [
      manaAbility([...ANY_COLOR]),
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 0, 0, ["deathtouch"])], label: "Contact mortel" }),
    ],
  },
  "Pugnacious Hammerskull": {
    abilities: [
      triggered(when.attacksSelf, [fx.counters(ref.self, "stun", 1)], {
        condition: cond.not(cond.controls({ ...DINOSAUR_YOU, other: true })),
        label: "Marqueur d'étourdissement (aucun autre Dinosaure)",
      }),
    ],
  },
  "River Herald Guide": { abilities: [explores] },
  "Seeker of Sunlight": {
    abilities: [activated({ mana: "{2}{G}", sorcerySpeed: true, effects: [fx.explore()], label: "Explore" })],
  },
  "Sentinel of the Nameless City": {
    abilities: [when.entersSelf, when.attacksSelf].map((t) => triggered(t, [fx.createTokens(MAP)], { label: "Jeton Carte" })),
  },
  Spelunking: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { count: 1, min: 0, store: "l", prompt: "Terrain à mettre en jeu" },
          ),
          ...fx.when(cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("l"), CAVE)), 1), fx.gainLife(4)),
        ],
        { label: "Piochez, puis un terrain de votre main" },
      ),
      playerStatic({ landsEnterUntapped: true, label: "Vos terrains arrivent dégagés" }),
    ],
  },
  "Staggering Size": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3, ["trample"])]) },
  "Tendril of the Mycotyrant": {
    abilities: [
      activated({
        mana: "{5}{G}{G}",
        targets: [
          target.permanent(
            "t",
            ["Land"],
            { controller: "you", notTypes: ["Creature"] },
            "terrain non-créature que vous contrôlez",
          ),
        ],
        effects: [
          fx.counters(ref.target(), "+1/+1", 7),
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Fungus"], setPower: 0, setToughness: 0, addKeywords: ["haste"] },
            "permanent",
          ),
        ],
        label: "Le terrain devient un Champignon 0/0",
      }),
    ],
  },
  "Walk with the Ancestors": {
    spell: spell(
      [target.optional(target.cardInGraveyard("t", PERMANENT_CARD, "you", "carte de permanent de votre cimetière"))],
      [fx.toHand(ref.target()), fx.discover(4)],
    ),
  },
};
