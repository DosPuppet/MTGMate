/**
 * Marvel's Spider-Man — cartes vertes (lot A). Le web-slinging, la convocation, la portée et les autres mots-clés sont
 * lus dans le texte.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  FOOD,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  SPIDER_21,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const SPIDERS_YOU_CONTROL: ObjectFilter = { types: ["Creature"], subtype: "Spider", controller: "you" };
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t") => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "créature qu'un adversaire contrôle",
});
const YOUR_SPIDER = (id = "t") => ({
  ...target.creature(id, { subtype: "Spider", controller: "you" }),
  label: "Araignée que vous contrôlez",
});

/** Spider-Ham : les types de créature qui reçoivent +1/+1 (« Animal May-Ham »). */
const MAY_HAM_TYPES = [
  "Spider",
  "Boar",
  "Bat",
  "Bear",
  "Bird",
  "Cat",
  "Dog",
  "Frog",
  "Jackal",
  "Lizard",
  "Mouse",
  "Otter",
  "Rabbit",
  "Raccoon",
  "Rat",
  "Squirrel",
  "Turtle",
  "Wolf",
];

export const GREEN: Record<string, CardScript> = {
  "Damage Control Crew": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Réparation : une carte de VM 4 ou plus de votre cimetière en main",
            [target.cardInGraveyard("c", { minManaValue: 4 }, "you", "carte de VM 4 ou plus de votre cimetière")],
            [fx.toHand(ref.target("c"))],
          ),
          mode(
            "Fourrière : exile un artefact ou un enchantement",
            [target.permanent("p", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
            [fx.exile(ref.target("p"))],
          ),
        ],
        { label: "Réparation ou fourrière" },
      ),
    ],
  },
  "Ezekiel Sims, Spider-Totem": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 2)], {
        targets: [YOUR_SPIDER()],
        label: "Une de vos Araignées gagne +2/+2",
      }),
    ],
  },
  "Grow Extra Arms": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { subtype: "Spider" }) },
    spell: spell([target.creature()], [fx.pump(ref.target(), 4, 4)]),
  },
  "Guy in the Chair": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        mana: "{2}{G}",
        tap: true,
        sorcerySpeed: true,
        targets: [{ ...target.creature("t", { subtype: "Spider" }), label: "Araignée" }],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Soutien en ligne : un marqueur +1/+1 sur une Araignée",
      }),
    ],
  },
  "Kapow!": {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.addCounters(ref.target("a"), 1), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Kraven's Cats": {
    abilities: [
      activated({ mana: "{2}{G}", oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2 (une fois par tour)" }),
    ],
  },
  "Lizard, Connors's Curse": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(
            ref.target(),
            { loseAllAbilities: true, setColors: ["G"], setSubtypes: ["Lizard"], setPower: 4, setToughness: 4 },
            "permanent",
          ),
        ],
        {
          targets: [target.upTo(1, { ...target.creature("t", { other: true }), label: "autre créature" })],
          label: "Formule du Lézard : une autre créature devient un Lézard vert 4/4 sans capacités",
        },
      ),
    ],
  },
  "Lurking Lizards": {
    abilities: [
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.addCounters(ref.self, 1)], {
        label: "Sort de VM 4 ou plus : un marqueur +1/+1",
      }),
    ],
  },

  // --- Miles Morales // Ultimate Spider-Man -------------------------------------
  "Miles Morales": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Un marqueur +1/+1 sur chacune de jusqu'à deux créatures",
      }),
      activated({ mana: "{3}{R}{G}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transformez-le" }),
    ],
  },
  "Ultimate Spider-Man": {
    abilities: [
      activated({
        mana: "{2}",
        effects: [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addKeywords: ["hexproof"], setColors: [] })],
        label: "Camouflage : un marqueur +1/+1, défense talismanique et incolore jusqu'à la fin du tour",
      }),
      triggered(
        when.attackWith(1),
        [
          fx.doubleAllCounters(
            ref.permanentsOf(ref.you, { types: ["Creature"], anyOf: [{ subtype: "Spider" }, { legendary: true }] }),
          ),
        ],
        { label: "Doublez les marqueurs de vos Araignées et créatures légendaires" },
      ),
    ],
  },

  "Pictures of Spider-Man": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(5, { filter: { types: ["Creature"] }, count: 2 })], {
        label: "Regardez les cinq cartes du dessus : jusqu'à deux cartes de créature en main",
      }),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        effects: [fx.createTokens(TREASURE)],
        label: "Sacrifiez-le : un jeton Trésor",
      }),
    ],
  },
  "Professional Wrestler": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Un jeton Trésor" }),
      blockAbility(block.atMost(1)),
    ],
  },
  "Radioactive Spider": {
    abilities: [
      activated({
        mana: "{2}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.search({ subtype: "Spider", anySubtype: ["Hero"] })],
        label: "Morsure fatidique : cherchez une carte d'Araignée Héros",
      }),
    ],
  },
  "Scout the City": {
    spell: modal(
      mode(
        "Coup d'œil : meulez trois cartes, une carte de permanent en main, gagnez 3 PV",
        [],
        [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { permanent: true },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), prompt: "Vous pouvez prendre une carte de permanent meulée" },
          ),
          fx.gainLife(3),
        ],
      ),
      mode(
        "Abattre : détruit une créature avec le vol",
        [{ ...target.creature("t", { keyword: "flying" }), label: "créature avec le vol" }],
        [fx.destroy(ref.target("t"))],
      ),
    ),
  },
  "Spider-Ham, Peter Porker": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Un jeton Nourriture" }),
      staticAbility(
        { types: ["Creature"], anySubtype: MAY_HAM_TYPES, controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Animal May-Ham : vos autres animaux gagnent +1/+1" },
      ),
    ],
  },
  "Spider-Man, Brooklyn Visionary": {
    // Web-slinging {2}{G} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        label: "Un terrain de base engagé",
      }),
    ],
  },
  "Strength of Will": {
    spell: spell(
      [YOUR_CREATURE()],
      [
        fx.modify(ref.target(), {
          addKeywords: ["indestructible"],
          addAbilities: [
            triggered(when.isDealtDamage, [fx.addCounters(ref.self, amount.eventAmount)], {
              label: "Blessée : autant de marqueurs +1/+1",
            }),
          ],
        }),
      ],
    ),
  },
  "Supportive Parents": {
    abilities: [
      // Approximation : elle ne peut pas s'engager elle-même pour ce coût (deux autres créatures).
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 2 },
        effects: [fx.addManaChoice(1)],
        label: "Engagez deux créatures : un mana de n'importe quelle couleur",
      }),
    ],
  },
  "Terrific Team-Up": {
    costReduction: { generic: 2, condition: cond.controls({ permanent: true, minManaValue: 4 }) },
    spell: spell(
      [target.between(1, 2, YOUR_CREATURE("a")), OPPONENT_CREATURE("b")],
      [fx.pump(ref.target("a"), 1, 0), fx.eachOfDealsDamage(ref.target("a"), ref.target("b"))],
    ),
  },
  "Wall Crawl": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(SPIDER_21), fx.gainLife(amount.count({ subtype: "Spider", controller: "you" }))],
        { label: "Une Araignée 2/1, puis 1 PV par Araignée que vous contrôlez" },
      ),
      staticAbility(
        SPIDERS_YOU_CONTROL,
        {
          power: 1,
          toughness: 1,
          addBlockRules: [block.notBy({ keyword: "defender" }, "Imblocable par les créatures avec le défenseur")],
        },
        { label: "Vos Araignées gagnent +1/+1 et ne peuvent pas être bloquées par les défenseurs" },
      ),
    ],
  },
  "Web of Life and Destiny": {
    // Convocation : lue dans le texte.
    abilities: [
      triggered(
        when.yourCombat,
        [fx.lookAtTop(5, { filter: { types: ["Creature"] }, to: { to: "battlefield" }, rest: "bottom" })],
        { label: "Regardez les cinq cartes du dessus : une carte de créature sur le champ de bataille" },
      ),
    ],
  },
};
