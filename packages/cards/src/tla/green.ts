/** Avatar: The Last Airbender — cartes vertes (lot A). */
import type { Effect, ModeDef, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  BEAR_4,
  block,
  blockAbility,
  type CardScript,
  CLUE,
  chapter,
  cond,
  eventReplacement,
  exhaust,
  FOOD,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez");
const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Nombre de cartes de Leçon dans votre cimetière. */
const LESSONS = amount.countIn("graveyard", { subtype: "Lesson" });
/** Force la plus élevée parmi les créatures que vous contrôlez. */
const GREATEST_POWER = amount.maxPower(CREATURES_YOU_CONTROL);
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;

export const GREEN: Record<string, CardScript> = {
  "Allies at Last": {
    // Affinité pour les Alliés : {1} de moins par Allié que vous contrôlez.
    costReduction: { generic: amount.count({ subtype: "Ally", controller: "you" }) },
    spell: spell(
      [
        target.upTo(2, target.creature("a", { controller: "you" })),
        { ...target.creature("t", { controller: "opponent" }), label: "créature qu'un adversaire contrôle" },
      ],
      [fx.eachOfDealsDamage(ref.target("a"), ref.target("t"))],
    ),
  },
  Badgermole: {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 2), { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 2" }),
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["trample"] },
        { label: "Vos créatures avec un marqueur +1/+1 ont le piétinement" },
      ),
    ],
  },
  "Badgermole Cub": {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 1), { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 1" }),
      // Capacité de mana déclenchée (605.1b) : un remplacement de mana (R1, famille I), comme Lavaleaper.
      eventReplacement({
        event: "mana",
        source: { types: ["Creature"] },
        to: "you",
        extraMana: "G",
        modify: { add: 1 },
        label: "Une créature engagée pour du mana : {G} de plus",
      }),
    ],
  },
  "The Boulder, Ready to Rumble": {
    abilities: [
      triggered(when.attacksSelf, fx.earthbend(ref.target(), amount.count({ ...CREATURES_YOU_CONTROL, minPower: 4 })), {
        targets: [LAND_YOU_CONTROL],
        label: "Maîtrise de la terre X (vos créatures de force 4 ou plus)",
      }),
    ],
  },
  "Cycle of Renewal": {
    spell: spell([], [fx.sacrifice(ref.you, { types: ["Land"] }), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)]),
  },
  "The Earth King": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(BEAR_4)], { label: "Un Ours 4/4" }),
      triggered(
        when.attackWith(1, { types: ["Creature"], minPower: 4 }),
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, amount.eventAmount)],
        { label: "Autant de terrains de base engagés que d'attaquants de force 4 ou plus" },
      ),
    ],
  },
  "Earth Kingdom General": {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 2), { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 2" }),
      // « Ne le faites qu'une fois par tour » : la limite n'est consommée que si vous gagnez les PV.
      triggered(
        when.youPutCounters({ types: ["Creature"] }, "+1/+1"),
        fx.may("Gagner autant de points de vie ?", fx.gainLife(amount.eventAmount), fx.doneOncePerTurn),
        { oncePerTurn: "ifDone", label: "Vous pouvez gagner autant de points de vie (une fois par tour)" },
      ),
    ],
  },
  "Earth Rumble": {
    spell: spell(
      [LAND_YOU_CONTROL],
      [
        ...fx.earthbend(ref.target(), 2),
        fx.reflexive(
          [
            target.upTo(1, target.creature("a", { controller: "you" })),
            { ...target.creature("b", { controller: "opponent" }), label: "créature qu'un adversaire contrôle" },
          ],
          [fx.fight(ref.target("a"), ref.target("b"))],
        ),
      ],
    ),
  },
  "Earthbending Lesson": { spell: spell([LAND_YOU_CONTROL], fx.earthbend(ref.target(), 4)) },
  "Elemental Teachings": {
    // Les cartes trouvées sont révélées en passant par la main, puis un adversaire en choisit deux pour le cimetière.
    spell: spell(
      [],
      [
        { ...fx.search({ types: ["Land"] }, { to: "hand" }, 4, undefined, "f"), distinctNames: true } as Effect,
        fx.chooseAmong(ref.stored("f"), ref.eachOpponent, "g1", { anyZone: true }),
        fx.chooseAmong(ref.stored("g1Rest"), ref.eachOpponent, "g2", { anyZone: true }),
        fx.moveTo(ref.union(ref.stored("g1"), ref.stored("g2")), { to: "graveyard" }),
        fx.toBattlefield(ref.stored("g2Rest"), { tapped: true }),
      ],
    ),
  },
  "Flopsie, Bumi's Buddy": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], {
        label: "Un marqueur +1/+1 sur chacune de vos créatures",
      }),
      staticAbility(
        { ...CREATURES_YOU_CONTROL, minPower: 4 },
        { addBlockRules: [block.atMost(1)] },
        { label: "Vos créatures de force 4 ou plus ne peuvent pas être bloquées par plus d'une créature" },
      ),
    ],
  },
  "Foggy Swamp Vinebender": {
    abilities: [
      blockAbility(block.notByPowerLE2),
      activated({
        mana: "{5}",
        waterbend: true,
        activationCondition: cond.yourTurn,
        effects: [fx.addCounters(ref.self, 1)],
        label: "Maîtrise de l'eau {5} : un marqueur +1/+1 (pendant votre tour)",
      }),
    ],
  },
  "Great Divide Guide": {
    abilities: [
      staticAbility(
        { controller: "you", anyOf: [{ types: ["Land"] }, { subtype: "Ally" }] },
        { addAbilities: [manaAbility([...ANY_COLOR])] },
        { label: "Vos terrains et Alliés : « {T} : un mana de n'importe quelle couleur »" },
      ),
    ],
  },
  "Haru, Hidden Talent": {
    abilities: [
      triggered(when.enters({ subtype: "Ally", controller: "you", other: true }), fx.earthbend(ref.target(), 1), {
        targets: [LAND_YOU_CONTROL],
        label: "Maîtrise de la terre 1",
      }),
    ],
  },
  "Invasion Tactics": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURES_YOU_CONTROL, 2, 2)], { label: "Vos créatures gagnent +2/+2" }),
      triggered(when.combatDamageBatch({ subtype: "Ally", controller: "you" }), [fx.draw(1)], {
        label: "Des Alliés blessent un joueur : piochez une carte",
      }),
    ],
  },
  "Kyoshi Island Plaza": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, amount.count({ subtype: "Shrine", controller: "you" }))],
        { label: "Jusqu'à X terrains de base engagés (X : vos Sanctuaires)" },
      ),
      triggered(
        when.enters({ subtype: "Shrine", controller: "you", other: true }),
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        { label: "Un terrain de base engagé" },
      ),
    ],
  },
  "Leaves from the Vine": {
    abilities: [
      chapter([1], [fx.mill(3), fx.createTokens(FOOD)], { label: "Meulez trois cartes, une Nourriture" }),
      chapter([2], [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "Un marqueur +1/+1 sur jusqu'à deux de vos créatures",
      }),
      chapter(
        [3],
        fx.when(
          cond.amountAtLeast(amount.countIn("graveyard", { anyOf: [{ types: ["Creature"] }, { subtype: "Lesson" }] }), 1),
          fx.draw(1),
        ),
        { label: "Piochez s'il y a une carte de créature ou de Leçon dans votre cimetière" },
      ),
    ],
  },
  "The Legend of Kyoshi": {
    abilities: [
      chapter([1], [fx.draw(GREATEST_POWER)], { label: "Piochez autant que la plus grande force parmi vos créatures" }),
      chapter(
        [2],
        [
          ...fx.earthbend(ref.target(), amount.cardsIn("hand")),
          fx.modify(ref.target(), { addSubtypes: ["Island"] }, "permanent"),
        ],
        { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre X (cartes en main) ; le terrain devient une Île" },
      ),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Revient transformée",
      }),
    ],
  },
  "Avatar Kyoshi": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addKeywords: ["trample", "hexproof"] },
        { label: "Vos terrains ont le piétinement et la défense talismanique" },
      ),
      activated({
        tap: true,
        effects: [fx.addManaChoice(GREATEST_POWER)],
        label: "X mana d'une couleur (la plus grande force parmi vos créatures)",
      }),
    ],
  },
  "Origin of Metalbending": {
    spell: modal(
      mode(
        "Détruit un artefact ou un enchantement",
        [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        [fx.destroy(ref.target())],
      ),
      mode(
        "Marqueur +1/+1 et indestructible",
        [target.creature("u", { controller: "you" })],
        [fx.addCounters(ref.target("u"), 1), fx.modify(ref.target("u"), { addKeywords: ["indestructible"] })],
      ),
    ),
  },
  "Ostrich-Horse": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), store: "land", prompt: "Vous pouvez prendre une carte de terrain meulée" },
          ),
          ...fx.when(cond.not(cond.v("land")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Meulez trois cartes : un terrain en main, sinon un marqueur +1/+1" },
      ),
    ],
  },
  "Pillar Launch": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["reach"]), fx.untap(ref.target())]),
  },
  "Raucous Audience": {
    abilities: [manaAbility("G", 1, { condition: cond.not(cond.ferocious) }), manaAbility("G", 2, { condition: cond.ferocious })],
  },
  "Rebellious Captives": {
    abilities: [
      exhaust({
        mana: "{6}",
        targets: [LAND_YOU_CONTROL],
        effects: [fx.addCounters(ref.self, 2), ...fx.earthbend(ref.target(), 2)],
        label: "deux marqueurs +1/+1, puis maîtrise de la terre 2",
      }),
    ],
  },
  Rockalanche: {
    flashback: "{5}{G}",
    spell: spell([LAND_YOU_CONTROL], fx.earthbend(ref.target(), amount.count({ subtype: "Forest", controller: "you" }))),
  },
  "Rocky Rebuke": {
    spell: spell(
      [
        target.creature("a", { controller: "you" }),
        { ...target.creature("b", { controller: "opponent" }), label: "créature qu'un adversaire contrôle" },
      ],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Seismic Sense": {
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.count({ types: ["Land"], controller: "you" }), {
          filter: { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
          count: 1,
          to: { to: "hand" },
          rest: "bottom",
        }),
      ],
    ),
  },
  "Sparring Dummy": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.mill(1, ref.you, { name: "m", filter: { subtype: "Lesson" } }),
          ...fx.when(cond.v("m"), fx.gainLife(2)),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), prompt: "Vous pouvez prendre la carte de terrain meulée" },
          ),
        ],
        label: "Meulez une carte : un terrain en main ; 2 PV si c'est une Leçon",
      }),
    ],
  },
  "True Ancestry": {
    spell: spell(
      [target.upTo(1, target.cardInGraveyard("t", { permanent: true }, "you", "carte de permanent de votre cimetière"))],
      [fx.toHand(ref.target()), fx.createTokens(CLUE)],
    ),
  },
  "Turtle-Duck": {
    abilities: [
      activated({
        mana: "{3}",
        effects: [fx.modify(ref.self, { setPower: 4, addKeywords: ["trample"] })],
        label: "Force de base 4 et piétinement jusqu'à la fin du tour",
      }),
    ],
  },
  "Unlucky Cabbage Merchant": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      triggered(
        when.sacrifice({ subtype: "Food" }),
        [
          ...fx.may(
            "Chercher un terrain de base (le marchand est mélangé dans la bibliothèque) ?",
            fx.search(BASIC_LAND, { to: "battlefield", tapped: true }),
            fx.moveTo(ref.self, { to: "libraryTop", shuffle: true }),
          ),
        ],
        { label: "Un terrain de base engagé ; le marchand retourne dans la bibliothèque" },
      ),
    ],
  },
  "Walltop Sentries": {
    abilities: [
      triggered(when.diesSelf, [fx.gainLife(2)], {
        condition: cond.amountAtLeast(LESSONS, 1),
        label: "Une Leçon au cimetière : vous gagnez 2 points de vie",
      }),
    ],
  },
  "Toph, the Blind Bandit": {
    cdaPower: amount.countersAmong({ types: ["Land"], controller: "you" }, "+1/+1"),
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 2)], {
        targets: [LAND_YOU_CONTROL],
        label: "Maîtrise de la terre 2",
      }),
    ],
  },
  "Earthen Ally": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        {
          perAmount: amount.colorsAmong({ subtype: "Ally", controller: "you" }),
          label: "+1/+0 pour chaque couleur parmi vos Alliés",
        },
      ),
      activated({
        mana: "{2}{W}{U}{B}{R}{G}",
        targets: [LAND_YOU_CONTROL],
        effects: [...fx.earthbend(ref.target(), 5)],
        label: "Maîtrise de la terre 5",
      }),
    ],
  },
  "Diligent Zookeeper": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", notSubtype: "Human" },
        { power: 1, toughness: 1, perOwnCreatureTypes: 10 },
        { label: "Vos créatures non-Humains : +1/+1 par type de créature (au plus 10)" },
      ),
    ],
  },
  "Avatar Destiny": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "créature que vous contrôlez" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addSubtypes: ["Avatar"] },
        { perGraveyard: { types: ["Creature"] }, label: "+1/+1 par carte de créature de votre cimetière ; Avatar" },
      ),
      triggered(
        when.dies({ attachedToSource: true }),
        [
          fx.mill(amount.powerOf(ref.eventObject), ref.you, { name: "m" }),
          fx.toHand(ref.selfCard),
          // « Jusqu'à une carte de créature meulée » : la question n'est posée que s'il y en a une.
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("m"), { types: ["Creature"] })), 1),
            ...fx.may(
              "Mettre une carte de créature meulée sur le champ de bataille ?",
              fx.chooseAmong(ref.filtered(ref.stored("m"), { types: ["Creature"] }), ref.you, "c", {
                anyZone: true,
                prompt: "Choisissez la carte de créature meulée à mettre sur le champ de bataille",
              }),
              fx.toBattlefield(ref.stored("c")),
            ),
          ),
        ],
        { label: "Meulez autant que sa force ; l'Aura revient en main, une créature meulée sur le champ de bataille" },
      ),
    ],
  },
  "Bumi, King of Three Trials": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        // « Choisissez jusqu'à X » (X : Leçons dans votre cimetière) : chaque combinaison sous condition.
        [
          { counters: true, scry: false, earth: false },
          { counters: false, scry: true, earth: false },
          { counters: false, scry: false, earth: true },
          { counters: true, scry: true, earth: false },
          { counters: true, scry: false, earth: true },
          { counters: false, scry: true, earth: true },
          { counters: true, scry: true, earth: true },
        ]
          .map((c): ModeDef => {
            const n = Number(c.counters) + Number(c.scry) + Number(c.earth);
            const labels = [c.counters && "trois marqueurs", c.scry && "regard 3", c.earth && "terre 3"].filter(Boolean);
            return {
              ...mode(
                labels.join(" + "),
                [...(c.scry ? [target.player("p")] : []), ...(c.earth ? [LAND_YOU_CONTROL] : [])],
                [
                  ...(c.counters ? [fx.addCounters(ref.self, 3)] : []),
                  ...(c.scry ? [fx.scry(3, ref.target("p"))] : []),
                  ...(c.earth ? fx.earthbend(ref.target(), 3) : []),
                ],
              ),
              condition: cond.amountAtLeast(LESSONS, n),
            };
          })
          .concat([mode("Aucun", [], [])]) as ModeDef[],
        { label: "Jusqu'à X modes (X : Leçons dans votre cimetière)" },
      ),
    ],
  },
};
