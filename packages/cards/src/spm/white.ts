/** Marvel's Spider-Man — cartes blanches (lot A). */
import type { ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  entersWith,
  eventReplacement,
  FOOD,
  fx,
  HUMAN_CITIZEN,
  modal,
  mode,
  ref,
  SPIDER_21,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Flash Thompson : la créature à engager et celle à dégager. */
const TO_TAP: TargetSpec = { ...target.creature("a"), label: "créature à engager" };
const TO_UNTAP: TargetSpec = { ...target.creature("b"), label: "créature à dégager" };

export const WHITE: Record<string, CardScript> = {
  "Anti-Venom, Horrifying Healer": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        condition: cond.wasCast,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        label: "S'il a été lancé : une carte de créature de votre cimetière sur le champ de bataille",
      }),
      eventReplacement({
        event: "damage",
        toFilter: { self: true },
        modify: { prevent: true },
        onPrevent: { counters: "+1/+1" },
        label: "Prévient les blessures qui lui seraient infligées et reçoit autant de marqueurs +1/+1",
      }),
    ],
  },
  "City Pigeon": {
    // Vol : lu dans le texte.
    abilities: [triggered(when.leavesSelf, [fx.createTokens(FOOD)], { label: "Créez une Nourriture" })],
  },
  "Costume Closet": {
    abilities: [
      entersWith({ counters: 2, label: "Arrive avec deux marqueurs +1/+1" }),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.removeCounters(ref.self, 1, "+1/+1", "m"), fx.addCounters(ref.target(), amount.v("m"))],
        label: "Déplacez un marqueur +1/+1 de cet artefact sur une de vos créatures",
      }),
      triggered(when.leaves({ ...CREATURES_YOU_CONTROL, modified: true }), [fx.addCounters(ref.self, 1)], {
        label: "Une de vos créatures modifiées part : un marqueur +1/+1",
      }),
    ],
  },
  "Daily Bugle Reporters": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Article flatteur — un marqueur +1/+1 sur chacune de jusqu'à deux créatures",
            [target.upTo(2, target.creature("a"))],
            [fx.addCounters(ref.target("a"), 1)],
          ),
          mode(
            "Journalisme d'investigation — une carte de créature de VM 2 ou moins de votre cimetière en main",
            [target.cardInGraveyard("g", { types: ["Creature"], maxManaValue: 2 }, "you", "carte de créature de VM 2 ou moins")],
            [fx.toHand(ref.target("g"))],
          ),
        ],
        { label: "Choisissez un mode" },
      ),
    ],
  },
  "Flash Thompson, Spider-Fan": {
    // Flash : lu dans le texte. « Choisissez l'un ou les deux. »
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Chahut — engagez une créature", [TO_TAP], [fx.tap(ref.target("a"))]),
          mode("Admiration — dégagez une créature", [TO_UNTAP], [fx.untap(ref.target("b"))]),
          mode("Les deux", [TO_TAP, TO_UNTAP], [fx.tap(ref.target("a")), fx.untap(ref.target("b"))]),
        ],
        { label: "Choisissez l'un ou les deux" },
      ),
    ],
  },
  "Friendly Neighborhood": {
    enchant: { filter: { types: ["Land"] }, label: "terrain" },
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HUMAN_CITIZEN, 3)], { label: "Créez trois Citoyens humains 1/1" }),
      staticAbility(
        "attached",
        {
          addAbilities: [
            activated({
              mana: "{1}",
              tap: true,
              sorcerySpeed: true,
              targets: [target.creature()],
              effects: [fx.pump(ref.target(), amount.count(CREATURES_YOU_CONTROL), amount.count(CREATURES_YOU_CONTROL))],
              label: "+1/+1 par créature que vous contrôlez",
            }),
          ],
        },
        { label: "Le terrain enchanté a « {1}, {T} : +1/+1 par créature que vous contrôlez »" },
      ),
    ],
  },
  "Origin of Spider-Man": {
    abilities: [
      chapter([1], [fx.createTokens(SPIDER_21)], { label: "Chapitre I — une Araignée 2/1 avec la portée" }),
      chapter(
        [2],
        [
          fx.addCounters(ref.target(), 1),
          fx.modify(ref.target(), { addSupertypes: ["Legendary"], addSubtypes: ["Spider", "Hero"] }, "permanent"),
        ],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Chapitre II — un marqueur +1/+1 ; elle devient une Araignée Héros légendaire",
        },
      ),
      chapter([3], [fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Chapitre III — la double initiative jusqu'à la fin du tour",
      }),
    ],
  },
  "Rent Is Due": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.tapChosen({ anyOf: [{ types: ["Creature"] }, { subtype: "Treasure" }] }, "tapped", { exactly: 2 }),
          ...fx.when(cond.v("tapped", 2), fx.draw(1)),
          ...fx.when(cond.not(cond.v("tapped", 2)), fx.sacrificeIt(ref.self)),
        ],
        { label: "Engagez deux créatures et/ou Trésors : piochez une carte ; sinon, sacrifiez-le" },
      ),
    ],
  },
  "Selfless Police Captain": {
    abilities: [
      entersWith({ counters: 1, label: "Arrive avec un marqueur +1/+1" }),
      triggered(when.leavesSelf, [fx.addCounters(ref.target(), amount.lkiCounters("+1/+1"))], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Ses marqueurs +1/+1 sur une créature que vous contrôlez",
      }),
    ],
  },
  "Silver Sable, Mercenary Leader": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { other: true })],
        label: "Un marqueur +1/+1 sur une autre créature",
      }),
      triggered(when.attacksSelf, [fx.modify(ref.target(), { addKeywords: ["lifelink"] })], {
        targets: [target.creature("t", { controller: "you", modified: true })],
        label: "Une de vos créatures modifiées gagne le lien de vie",
      }),
    ],
  },
  "Spectacular Spider-Man": {
    // Flash : lu dans le texte.
    abilities: [
      activated({
        mana: "{1}",
        effects: [fx.modify(ref.self, { addKeywords: ["flying"] })],
        label: "Gagne le vol jusqu'à la fin du tour",
      }),
      activated({
        mana: "{1}",
        sacrifice: true,
        effects: [fx.modifyAll(CREATURES_YOU_CONTROL, { addKeywords: ["hexproof", "indestructible"] })],
        label: "Vos créatures gagnent la défense talismanique et l'indestructible",
      }),
    ],
  },
  "Spectacular Tactics": {
    spell: modal(
      mode(
        "Un marqueur +1/+1 sur une de vos créatures, qui gagne la défense talismanique",
        [target.creature("t", { controller: "you" })],
        [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["hexproof"] })],
      ),
      mode("Détruisez une créature de force 4 ou plus", [target.creature("d", { minPower: 4 })], [fx.destroy(ref.target("d"))]),
    ),
  },
  // Web-slinging {W} : lu dans le texte.
  "Spider-Man, Web-Slinger": {},
  "Spider-UK": {
    // Web-slinging {2}{W} : lu dans le texte.
    abilities: [
      triggered(when.yourEndStep, [fx.draw(1), fx.gainLife(2)], {
        condition: cond.amountAtLeast(
          amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }),
          2,
        ),
        label: "Deux créatures ou plus sont arrivées sous votre contrôle : piochez une carte, gagnez 2 PV",
      }),
    ],
  },
  "Starling, Aerial Ally": {
    // Vol : lu dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["flying"] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre de vos créatures gagne le vol",
      }),
    ],
  },
  "Sudden Strike": {
    spell: spell(
      [{ id: "t", label: "créature attaquante ou bloqueuse", filter: { objects: { types: ["Creature"], inCombat: true } } }],
      [fx.destroy(ref.target())],
    ),
  },
  "Thwip!": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 2, 2, ["flying"]), ...fx.when(cond.targetMatches("t", { subtype: "Spider" }), fx.gainLife(2))],
    ),
  },
  "Web Up": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse")],
        label: "Exile un permanent non-terrain adverse jusqu'à son départ",
      }),
    ],
  },
  "Web-Shooters": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addKeywords: ["reach"],
          addAbilities: [
            triggered(when.attacksSelf, [fx.tap(ref.target())], {
              targets: [target.creature("t", { controller: "opponent" })],
              label: "Engagez une créature adverse",
            }),
          ],
        },
        { label: "+1/+1, la portée et « quand elle attaque, engagez une créature adverse »" },
      ),
    ],
  },
  "Wild Pack Squad": {
    abilities: [
      triggered(when.yourCombat, [fx.modify(ref.target(), { addKeywords: ["firstStrike", "vigilance"] })], {
        targets: [target.upTo(1, target.creature())],
        label: "Jusqu'à une créature gagne l'initiative et la vigilance",
      }),
    ],
  },
};
