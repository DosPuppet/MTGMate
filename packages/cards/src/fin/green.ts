/** Final Fantasy — cartes vertes. */
import type { CardScript, Effect } from "@mtgx/engine";
import {
  activated,
  amount,
  chocobo,
  cond,
  fx,
  jobGear,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TOWN,
  target,
  targetObj,
  tiered,
  triggered,
  triggeredModal,
  when,
} from "./common";

const PERMANENT_CARD = { permanent: true };
const BASIC_OR_TOWN = { types: ["Land" as const], anyOf: [{ basic: true }, TOWN] };

export const GREEN: Record<string, CardScript> = {
  "Airship Crash": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], keyword: "flying" }] },
          "artefact, enchantement ou créature avec le vol",
        ),
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Balamb T-Rexaur": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 PV" })] },
  "Bard's Bow": { abilities: jobGear("Bard", 2, 2, ["reach"]) },
  "Blitzball Shot": { spell: spell([target.creature("t")], [fx.pump(ref.target(), 3, 3, ["trample"])]) },
  Cactuar: {
    abilities: [
      triggered(when.yourEndStep, [fx.bounce(ref.self)], {
        condition: cond.not(cond.sourceMatches({ enteredThisTurn: true })),
        label: "Retourne en main",
      }),
    ],
  },
  "Chocobo Racetrack": { abilities: [triggered(when.landfall, [chocobo()], { label: "Chocobo 2/2" })] },
  "Coliseum Behemoth": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Détruisez un artefact ou un enchantement",
            [targetObj("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, "artefact ou enchantement")],
            [fx.destroy(ref.target())],
          ),
          mode("Piochez une carte", [], [fx.draw(1)]),
        ],
        { label: "Choisissez un" },
      ),
    ],
  },
  "Commune with Beavers": {
    spell: spell(
      [],
      [
        fx.lookAtTop(3, {
          filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Land"] }] },
          count: 1,
          rest: "bottom",
        }),
      ],
    ),
  },
  "Galuf's Final Act": {
    spell: spell(
      [target.creature("t")],
      [
        fx.modify(ref.target(), {
          power: 1,
          addAbilities: [
            triggered(when.diesSelf, [fx.addCounters(ref.target(), amount.powerOf(ref.self))], {
              targets: [target.upTo(1, target.creature("t"))],
              label: "Marqueurs égaux à sa force",
            }),
          ],
        }),
      ],
    ),
  },
  Gigantoad: {
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 2 },
        { condition: cond.controls({ types: ["Land"] }, 7), label: "+2/+2 (sept terrains)" },
      ),
    ],
  },
  "Goobbue Gardener": { abilities: [manaAbility("G")] },
  "Gran Pulse Ochu": {
    abilities: [
      activated({
        mana: "{8}",
        effects: [fx.pump(ref.self, amount.countIn("graveyard", PERMANENT_CARD), amount.countIn("graveyard", PERMANENT_CARD))],
        label: "+1/+1 par carte de permanent au cimetière",
      }),
    ],
  },
  "Gysahl Greens": { flashback: "{6}{G}", spell: spell([], [chocobo()]) },
  "Jumbo Cactuar": { abilities: [triggered(when.attacksSelf, [fx.pump(ref.self, 9999, 0)], { label: "+9999/+0" })] },
  "Loporrit Scout": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.pump(ref.self, 1, 1)], {
        label: "+1/+1",
      }),
    ],
  },
  "Prishe's Wanderings": {
    spell: spell(
      [],
      [
        fx.search(BASIC_OR_TOWN, { to: "battlefield", tapped: true }),
        fx.reflexive([target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
      ],
    ),
  },
  "Reach the Horizon": {
    spell: spell([], [{ ...fx.search(BASIC_OR_TOWN, { to: "battlefield", tapped: true }, 2), distinctNames: true } as Effect]),
  },
  "Ride the Shoopuf": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Marqueur +1/+1",
      }),
      activated({
        mana: "{5}{G}{G}",
        effects: [
          fx.modify(ref.self, { addTypes: ["Creature"], addSubtypes: ["Beast"], setPower: 7, setToughness: 7 }, "permanent"),
        ],
        label: "Devient une créature 7/7",
      }),
    ],
  },
  "Rydia's Return": {
    spell: modal(
      mode("Vos créatures gagnent +3/+3", [], [fx.pumpAll({ types: ["Creature"], controller: "you" }, 3, 3)]),
      mode(
        "Renvoyez jusqu'à deux cartes de permanent",
        [target.upTo(2, target.cardInGraveyard("t", PERMANENT_CARD, "you", "carte de permanent"))],
        [fx.toHand(ref.target())],
      ),
    ),
  },
  "Sazh Katzroy": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search({
            anyOf: [
              { types: ["Creature"], subtype: "Bird" },
              { types: ["Land"], basic: true },
            ],
          }),
        ],
        { label: "Cherchez un Oiseau ou un terrain de base" },
      ),
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1), fx.doubleCounters(ref.target())], {
        targets: [target.creature("t")],
        label: "Marqueur, puis doublez",
      }),
    ],
  },
  "Sazh's Chocobo": { abilities: [triggered(when.landfall, [fx.addCounters(ref.self, 1)], { label: "Marqueur +1/+1" })] },
  "Tifa Lockhart": {
    abilities: [triggered(when.landfall, [fx.pump(ref.self, amount.powerOf(ref.self), 0)], { label: "Double sa force" })],
  },
  "Tifa's Limit Break": {
    spell: tiered(
      { cost: "{0}", label: "Saut périlleux (+2/+2)", targets: [target.creature("t")], effects: [fx.pump(ref.target(), 2, 2)] },
      {
        cost: "{2}",
        label: "Frappe météore (double)",
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), amount.powerOf(ref.target()), amount.toughnessOf(ref.target()))],
      },
      {
        cost: "{6}{G}",
        label: "Paradis final (triple)",
        targets: [target.creature("t")],
        effects: [
          fx.pump(
            ref.target(),
            amount.plus(amount.powerOf(ref.target()), amount.powerOf(ref.target())),
            amount.plus(amount.toughnessOf(ref.target()), amount.toughnessOf(ref.target())),
          ),
        ],
      },
    ),
  },
  "Town Greeter": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone("graveyard", { types: ["Land"] }, { to: "hand" }, { min: 0, pool: ref.stored("m"), store: "l" }),
          fx.when(cond.refMatches(ref.stored("l"), TOWN), fx.gainLife(2)),
        ],
        { label: "Meulez 4, un terrain en main" },
      ),
    ],
  },
};
