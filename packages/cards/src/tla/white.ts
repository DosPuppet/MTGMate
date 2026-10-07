/** Avatar: The Last Airbender — cartes blanches (lot A). */
import type { ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  ALLY,
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  FOOD,
  fx,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
const ALLY_YOU_CONTROL: ObjectFilter = { subtype: "Ally", controller: "you" };
/** « jusqu'à un autre permanent non-terrain ciblé » */
const OTHER_NONLAND_UP_TO_ONE: TargetSpec = target.upTo(1, target.nonland("t", { other: true }, "autre permanent non-terrain"));

export const WHITE: Record<string, CardScript> = {
  "Aang, the Last Airbender": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [OTHER_NONLAND_UP_TO_ONE],
        label: "Maîtrise de l'air d'un autre permanent non-terrain",
      }),
      triggered(when.castSpell("you", { subtype: "Lesson" }), [fx.modify(ref.self, { addKeywords: ["lifelink"] })], {
        label: "Lien de vie jusqu'à la fin du tour",
      }),
    ],
  },
  "Aang's Iceberg": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [OTHER_NONLAND_UP_TO_ONE],
        label: "Exile un autre permanent non-terrain jusqu'à son départ",
      }),
      activated({
        mana: "{3}",
        waterbend: true,
        effects: [fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }), fx.when(cond.v("s"), fx.scry(2))],
        label: "Maîtrise de l'eau {3} : sacrifiez cet enchantement, puis regard 2",
      }),
    ],
  },
  "Airbender's Reversal": {
    spell: modal(
      mode("Détruit une créature attaquante", [target.creature("t", { attacking: true })], [fx.destroy(ref.target())]),
      mode(
        "Maîtrise de l'air d'une de vos créatures",
        [target.creature("u", { controller: "you" })],
        [fx.airbend(ref.target("u"))],
      ),
    ),
  },
  "Airbending Lesson": {
    spell: spell([target.nonland()], [fx.airbend(ref.target()), fx.draw(1)]),
  },
  "Appa, Loyal Sky Bison": {
    abilities: [when.entersSelf, when.attacksSelf].map((w) =>
      triggeredModal(
        w,
        [
          mode(
            "Une de vos créatures gagne le vol",
            [target.creature("t", { controller: "you" })],
            [fx.modify(ref.target(), { addKeywords: ["flying"] })],
          ),
          mode(
            "Maîtrise de l'air d'un autre de vos permanents non-terrains",
            [target.nonland("u", { controller: "you", other: true }, "autre permanent non-terrain que vous contrôlez")],
            [fx.airbend(ref.target("u"))],
          ),
        ],
        { label: "Vol, ou maîtrise de l'air" },
      ),
    ),
  },
  "Avatar Enthusiasts": {
    abilities: [
      triggered(when.enters({ ...ALLY_YOU_CONTROL, other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Un marqueur +1/+1",
      }),
    ],
  },
  "Compassionate Healer": {
    abilities: [triggered(when.tapsSelf, [fx.gainLife(1), fx.scry(1)], { label: "Gagnez 1 PV, regard 1" })],
  },
  "Curious Farm Animals": {
    abilities: [
      triggered(when.diesSelf, [fx.gainLife(3)], { label: "Gagnez 3 PV" }),
      activated({
        mana: "{2}",
        sacrifice: true,
        targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement"))],
        effects: [fx.destroy(ref.target())],
        label: "Détruit un artefact ou un enchantement",
      }),
    ],
  },
  "Earth Kingdom Jailer": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [
          target.upTo(
            1,
            target.permanent(
              "t",
              ["Artifact", "Creature", "Enchantment"],
              { controller: "opponent", minManaValue: 3 },
              "artefact, créature ou enchantement adverse de valeur de mana 3 ou plus",
            ),
          ),
        ],
        label: "Exile un permanent adverse jusqu'à son départ",
      }),
    ],
  },
  "Earth Kingdom Protectors": {
    abilities: [
      activated({
        sacrifice: true,
        targets: [
          {
            id: "t",
            label: "autre Allié que vous contrôlez",
            filter: { objects: { ...ALLY_YOU_CONTROL, other: true } },
          },
        ],
        effects: [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
        label: "Un autre Allié gagne l'indestructible",
      }),
    ],
  },
  "Enter the Avatar State": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.modify(ref.target(), {
          addSubtypes: ["Avatar"],
          addKeywords: ["flying", "firstStrike", "lifelink", "hexproof"],
        }),
      ],
    ),
  },
  "Fancy Footwork": {
    spell: spell([target.between(1, 2, target.creature())], [fx.untap(ref.target()), fx.pump(ref.target(), 2, 2)]),
  },
  "Gather the White Lotus": {
    spell: spell([], [fx.createTokens(ALLY, amount.count({ subtype: "Plains", controller: "you" })), fx.scry(2)]),
  },
  "Glider Kids": {
    abilities: [triggered(when.entersSelf, [fx.scry(1)], { label: "Regard 1" })],
  },
  "Glider Staff": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Maîtrise de l'air d'une créature",
      }),
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["flying"] }, { label: "+1/+1 et le vol" }),
    ],
  },
  "Hakoda, Selfless Commander": {
    abilities: [
      playerStatic({ lookAtTopCard: true, label: "Regardez la carte du dessus de votre bibliothèque" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { subtype: "Ally" }, what: "spells" },
        label: "Lancez des sorts d'Allié du dessus de votre bibliothèque",
      }),
      activated({
        sacrifice: true,
        effects: [fx.pumpAll(CREATURES_YOU_CONTROL, 0, 5, ["indestructible"])],
        label: "Vos créatures gagnent +0/+5 et l'indestructible",
      }),
    ],
  },
  "Invasion Reinforcements": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "Un Allié 1/1" })],
  },
  "Jeong Jeong's Deserters": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Un marqueur +1/+1 sur une créature",
      }),
    ],
  },
  "Kyoshi Warriors": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "Un Allié 1/1" })],
  },
  "The Legend of Yangchen": {
    abilities: [
      // « En commençant par vous, chaque joueur choisit jusqu'à un permanent de valeur de mana 3 ou plus parmi ceux de
      // vos adversaires » ; les permanents choisis sont exilés ensemble, une fois tous les choix faits.
      chapter(
        [1],
        [
          ...fx.forEachPlayer(ref.union(ref.you, ref.eachOpponent), (p, n) =>
            // Un siège absent (moins de six joueurs) ne choisit pas.
            fx.when(
              cond.amountAtLeast(amount.refCount(p), 1),
              fx.chooseAmong(ref.permanentsOf(ref.eachOpponent, { permanent: true, minManaValue: 3 }), p, `y${n}`, {
                optional: true,
                prompt: "Vous pouvez choisir un permanent de valeur de mana 3 ou plus à exiler",
              }),
            ),
          ),
          fx.exile(ref.union(...Array.from({ length: 6 }, (_, n) => ref.stored(`y${n}`)))),
        ],
        { label: "Chaque joueur choisit jusqu'à un permanent adverse de valeur de mana 3 ou plus : exilez-les" },
      ),
      chapter([2], [...fx.may("Faire piocher trois cartes à l'adversaire ciblé ?", fx.draw(3, ref.target()), fx.draw(3))], {
        targets: [target.player("t", "opponent")],
        label: "L'adversaire ciblé pioche trois cartes, puis vous aussi",
      }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Revient transformée",
      }),
    ],
  },
  "Avatar Yangchen": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.airbend(ref.target())], {
        targets: [OTHER_NONLAND_UP_TO_ONE],
        label: "Maîtrise de l'air d'un autre permanent non-terrain",
      }),
    ],
  },
  "Master Piandao": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.lookAtTop(4, { filter: { anySubtype: ["Ally", "Equipment", "Lesson"] }, count: 1, rest: "bottom" })],
        { label: "Un Allié, un Équipement ou une Leçon parmi les quatre du dessus" },
      ),
    ],
  },
  "Momo, Playful Pet": {
    abilities: [
      triggeredModal(
        when.leavesSelf,
        [
          mode("Une Nourriture", [], [fx.createTokens(FOOD)]),
          mode(
            "Un marqueur +1/+1 sur une de vos créatures",
            [target.creature("t", { controller: "you" })],
            [fx.addCounters(ref.target(), 1)],
          ),
          mode("Regard 2", [], [fx.scry(2)]),
        ],
        { label: "Nourriture, marqueur +1/+1 ou regard 2" },
      ),
    ],
  },
  "Path to Redemption": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Ne peut ni attaquer ni bloquer" }),
      activated({
        mana: "{5}",
        sacrifice: true,
        activationCondition: cond.yourTurn,
        effects: [fx.exile(ref.attached), fx.createTokens(ALLY)],
        label: "Exile la créature enchantée, un Allié 1/1",
      }),
    ],
  },
  "Rabaroo Troop": {
    // Cycle de Plaine {2} : lu dans le texte.
    abilities: [
      triggered(when.landfall, [fx.modify(ref.self, { addKeywords: ["flying"] }), fx.gainLife(1)], {
        label: "Le vol jusqu'à la fin du tour, gagnez 1 PV",
      }),
    ],
  },
  "Razor Rings": {
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [fx.damageStoringExcess(4, ref.target(), "excess"), fx.gainLife(amount.v("excess"))],
    ),
  },
  "Sandbenders' Storm": {
    spell: modal(
      mode("Détruit une créature de force 4 ou plus", [target.creature("t", { minPower: 4 })], [fx.destroy(ref.target())]),
      mode(
        "Maîtrise de la terre 3",
        [target.permanent("u", ["Land"], { controller: "you" }, "terrain que vous contrôlez")],
        fx.earthbend(ref.target("u"), 3),
      ),
    ),
  },
  "South Pole Voyager": {
    abilities: [
      triggered(
        when.enters(ALLY_YOU_CONTROL),
        [fx.gainLife(1), fx.countResolution("n"), fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1))],
        { label: "Gagnez 1 PV ; à la deuxième résolution du tour, piochez" },
      ),
    ],
  },
  "Southern Air Temple": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.addCountersAll(CREATURES_YOU_CONTROL, amount.count({ subtype: "Shrine", controller: "you" }))],
        { label: "X marqueurs +1/+1 sur chacune de vos créatures (X : vos Sanctuaires)" },
      ),
      triggered(
        when.enters({ subtype: "Shrine", controller: "you", other: true }),
        [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)],
        { label: "Un marqueur +1/+1 sur chacune de vos créatures" },
      ),
    ],
  },
  "Suki, Courageous Rescuer": {
    abilities: [
      staticAbility({ ...CREATURES_YOU_CONTROL, other: true }, { power: 1 }, { label: "Vos autres créatures ont +1/+0" }),
      triggered(when.leaves({ permanent: true, controller: "you", other: true }), [fx.createTokens(ALLY)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Un Allié 1/1 (une fois par tour)",
      }),
    ],
  },
  "Team Avatar": {
    abilities: [
      triggered(
        when.attacksAlone(CREATURES_YOU_CONTROL),
        [fx.pump(ref.eventObject, amount.count(CREATURES_YOU_CONTROL), amount.count(CREATURES_YOU_CONTROL))],
        { label: "+X/+X (X : vos créatures)" },
      ),
      activated({
        mana: "{2}{W}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature()],
        effects: [fx.damage(amount.count(CREATURES_YOU_CONTROL), ref.target())],
        label: "Blessures égales au nombre de vos créatures",
      }),
    ],
  },
  "United Front": {
    spell: spell([], [fx.createTokens(ALLY, amount.x), fx.addCountersAll(CREATURES_YOU_CONTROL, 1)]),
  },
  "Vengeful Villagers": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.tap(ref.target()),
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, 1, {
            optional: true,
            store: "s",
          }),
          fx.when(cond.v("s"), fx.counters(ref.target(), "stun")),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Engage une créature adverse ; en sacrifiant, un marqueur d'étourdissement",
        },
      ),
    ],
  },
  "Water Tribe Captain": {
    abilities: [
      activated({
        mana: "{5}",
        effects: [fx.pumpAll(CREATURES_YOU_CONTROL, 1, 1)],
        label: "Vos créatures gagnent +1/+1",
      }),
    ],
  },
  "Water Tribe Rallier": {
    abilities: [
      activated({
        mana: "{5}",
        waterbend: true,
        effects: [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 3 }, count: 1, rest: "bottom" })],
        label: "Maîtrise de l'eau {5} : une créature de force 3 ou moins parmi les quatre du dessus",
      }),
    ],
  },
  "Yip Yip!": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.pump(ref.target(), 2, 2),
        fx.when(cond.targetMatches("t", { subtype: "Ally" }), fx.modify(ref.target(), { addKeywords: ["flying"] })),
      ],
    ),
  },
  "Destined Confrontation": {
    spell: spell([], [fx.keep(ref.eachPlayer, "totalPower", { types: ["Creature"] }, { max: 4 })]),
  },
};
