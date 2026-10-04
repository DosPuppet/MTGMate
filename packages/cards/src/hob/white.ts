/** The Hobbit — cartes blanches (lot A). */
import type { ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  AXE,
  activated,
  amount,
  BASIC_LAND,
  BIRD_SOLDIER,
  type CardScript,
  chapter,
  cond,
  DWARF,
  fx,
  modal,
  mode,
  playerStatic,
  recruit,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };

/** « Pour chaque adversaire, jusqu'à un permanent non-terrain ciblé que ce joueur contrôle » : au plus un par joueur. */
const ONE_NONLAND_PER_OPPONENT: TargetSpec = {
  ...target.upTo(5, target.nonland("t", { controller: "opponent" }, "permanent non-terrain adverse (un par adversaire)")),
  differentPlayers: true,
};

/** « créature ciblée que vous possédez » (qui la contrôle). */
const CREATURE_YOU_OWN: ObjectFilter = { owner: "you" };

/** Les créatures attaquantes que contrôle le joueur ciblé (Settle the Wreckage). */
const ATTACKERS_OF_TARGET = ref.permanentsOf(ref.target(), { types: ["Creature"], attacking: true });

export const WHITE: Record<string, CardScript> = {
  "Celebrate the Mountain-king": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [ONE_NONLAND_PER_OPPONENT],
        label: "Exile un permanent non-terrain de chaque adversaire jusqu'à son départ",
      }),
      triggered(when.entersSelf, recruit(), { label: "Recrutez" }),
    ],
  },
  "Dáin, Lord of the Iron Hills": {
    // Vigilance et Storied : lus dans le texte.
    abilities: [
      playerStatic({
        attackTax: 1,
        condition: cond.enduringStory,
        label: "Récit durable : attaquer vous coûte {1} par créature",
      }),
    ],
  },
  "Dwarven Provisioner": {
    abilities: [
      activated({ mana: "{3}{W}", effects: [fx.pumpAll(CREATURES_YOU_CONTROL, 1, 1)], label: "Vos créatures gagnent +1/+1" }),
    ],
  },
  "Dwarven Shortsword": {
    // Équiper {2} : lu dans le texte.
    abilities: [
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
      triggered(when.entersSelf, [fx.createTokens(DWARF, 1, undefined, "d"), fx.attach(ref.stored("d"))], {
        label: "Un Nain 2/2, puis attachez-lui cet Équipement",
      }),
    ],
  },
  "Eagle of the Great Shelf": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.pump(
            ref.self,
            amount.count({ ...CREATURES_YOU_CONTROL, other: true }),
            amount.count({ ...CREATURES_YOU_CONTROL, other: true }),
          ),
        ],
        { label: "+1/+1 pour chacune de vos autres créatures" },
      ),
    ],
  },
  "The Eagles Are Coming!": {
    kicker: "{2}{W}{W}",
    spell: spell(
      [{ ...target.creature("t", CREATURE_YOU_OWN), label: "créature que vous possédez", kickedCount: 99 }],
      [
        fx.moveTo(ref.target(), { to: "hand" }, { name: "returned" }),
        fx.delayedAt("nextUpkeep", [fx.createTokens(BIRD_SOLDIER, amount.v("n"))], undefined, { n: amount.v("returned") }),
      ],
    ),
  },
  "Esgaroth Garrison": {
    cdaPower: amount.count(CREATURES_YOU_CONTROL),
    abilities: [triggered(when.entersSelf, recruit(), { label: "Recrutez" })],
  },
  "Fíli the Pathfinder": {
    // Storied : lu dans le texte.
    abilities: [
      staticAbility(
        CREATURES_YOU_CONTROL,
        { power: 1, toughness: 1 },
        {
          condition: cond.enduringStory,
          label: "Récit durable : vos créatures ont +1/+1",
        },
      ),
      // « Fíli ou un autre Nain non-jeton que vous contrôlez » : Fíli est elle-même un Nain non-jeton.
      triggered(when.enters({ subtype: "Dwarf", token: false, controller: "you" }), [fx.createTokens(DWARF)], {
        label: "Un Nain 2/2",
      }),
    ],
  },
  "Gleaming Splendor": {
    abilities: [
      triggered(when.draw(2, "opponent"), [fx.createTokens(TREASURE)], {
        label: "Un adversaire pioche sa deuxième carte du tour : un Trésor",
      }),
      activated({
        mana: "{2}{W}",
        targets: [target.exactly(2, target.player("t"))],
        effects: [fx.draw(1, ref.target())],
        label: "Deux joueurs ciblés piochent chacun une carte",
      }),
    ],
  },
  "Iron Hills Blacksmith": {
    // Double initiative : lue dans le texte.
    abilities: [triggered(when.entersSelf, [fx.createTokens(AXE)], { label: "Un Équipement Axe" })],
  },
  "Lake-town Lookout": {
    abilities: [triggered(when.diesSelf, recruit(), { label: "Recrutez" })],
  },
  "Lake-town Toymaker": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 3, 0, ["firstStrike"])], {
        condition: cond.drewAtLeast(2),
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Deux cartes piochées ce tour-ci : +3/+0 et l'initiative",
      }),
    ],
  },
  "Magnificent End": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.damage(5, ref.target())]),
  },
  "Moment of Glory": {
    flashback: "{4}{W}",
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.addCounters(ref.target(), 1),
        ...fx.when(
          cond.spellCastFromGraveyard,
          fx.addCounters(ref.except(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.target()), 1),
        ),
      ],
    ),
  },
  "The Mountain-king's Return": {
    abilities: [
      chapter([1], recruit(), { label: "Recrutez" }),
      chapter([2], [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], maxManaValue: 3 },
            "you",
            "carte de créature de valeur de mana 3 ou moins de votre cimetière",
          ),
        ],
        label: "Une créature de valeur de mana 3 ou moins de votre cimetière revient sur le champ de bataille",
      }),
      chapter([3], [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "Un marqueur +1/+1 sur jusqu'à une créature",
      }),
    ],
  },
  "Ori, Keeper of Songs": {
    // Storied : lu dans le texte.
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["vigilance"] },
        { condition: cond.enduringStory, label: "Récit durable : +1/+0 et la vigilance" },
      ),
    ],
  },
  "The Queen of Dale": {
    abilities: [
      // « Leur premier sort non-créature de chaque tour » : le journal du tour n'en compte qu'un pour ce joueur ; condition
      // du déclencheur (vérifiée au lancement seulement), pas un « si » revérifié à la résolution.
      triggered(when.castSpell("opponent", { notTypes: ["Creature"] }), recruit(), {
        triggerCondition: cond.not(cond.amountAtLeast(amount.noncreatureCastBy(ref.eventPlayer), 2)),
        label: "Premier sort non-créature d'un adversaire ce tour-ci : recrutez",
      }),
    ],
  },
  "Roads Go Ever, Ever On": {
    abilities: [
      chapter(
        [1],
        [
          fx.search({ ...BASIC_LAND, subtype: "Plains" }, { to: "exile" }, 2, undefined, "plains"),
          fx.link(ref.stored("plains")),
          fx.gainLife(2),
        ],
        { label: "Exilez jusqu'à deux Plaines de base de votre bibliothèque ; vous gagnez 2 PV" },
      ),
      chapter([2, 3], [fx.chooseAmong(ref.linked, ref.you, "c", { anyZone: true }), fx.toHand(ref.stored("c"))], {
        label: "Une carte exilée avec cette Saga dans la main de son propriétaire",
      }),
      chapter(
        [4],
        [
          fx.emblem(
            "Roads Go Ever, Ever On",
            "Chaque fois que vous attaquez ce tour-ci, une créature ciblée que vous contrôlez gagne +1/+1 jusqu'à la fin du tour pour chaque Plaine que vous contrôlez.",
            [
              triggered(
                when.attackWith(1),
                [
                  fx.pump(
                    ref.target(),
                    amount.count({ subtype: "Plains", controller: "you" }),
                    amount.count({ subtype: "Plains", controller: "you" }),
                  ),
                ],
                {
                  targets: [target.creature("t", { controller: "you" })],
                  label: "+1/+1 par Plaine que vous contrôlez",
                },
              ),
            ],
            false,
            true,
          ),
        ],
        { label: "Ce tour-ci, chaque attaque renforce une de vos créatures" },
      ),
    ],
  },
  "Settle the Wreckage": {
    spell: spell(
      [target.player("t")],
      [
        // « Ce joueur peut chercher autant de cartes de terrain de base » (de zéro à autant) : le nombre est celui des
        // créatures attaquantes exilées, jetons compris. Il est compté avant l'exil (un jeton exilé cesse d'exister),
        // d'où la recherche faite d'abord ; les terrains arrivent engagés et n'attaquent pas, l'ordre ne change rien.
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, amount.refCount(ATTACKERS_OF_TARGET), ref.target()),
        fx.exile(ATTACKERS_OF_TARGET),
      ],
    ),
  },
  "Stone by Sunlight": {
    spell: modal(
      mode(
        "Détruisez une créature de force 4 ou plus",
        [{ ...target.creature("t", { minPower: 4 }), label: "créature de force 4 ou plus" }],
        [fx.destroy(ref.target())],
      ),
      mode(
        "La créature devient un artefact et gagne l'indestructible",
        [target.creature("c")],
        [fx.modify(ref.target("c"), { addTypes: ["Artifact"], addKeywords: ["indestructible"] })],
      ),
    ),
  },
  "Thorin's Last Stand": {
    spell: modal(
      mode("Vos créatures gagnent +2/+1", [], [fx.pumpAll(CREATURES_YOU_CONTROL, 2, 1)]),
      mode(
        "Détruisez un artefact ou un enchantement ; vous gagnez 2 PV",
        [target.permanent("t", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
        [fx.destroy(ref.target()), fx.gainLife(2)],
      ),
    ),
  },
  // Aventure : An Unexpected Party // At the Door.
  "An Unexpected Party": {
    chooseOnEnter: "creatureType",
    abilities: [
      staticAbility(
        { ...CREATURES_YOU_CONTROL, subtypeChosen: true },
        { power: 2, toughness: 2 },
        { label: "Vos créatures du type choisi ont +2/+2" },
      ),
    ],
  },
  "At the Door": { spell: spell([], [fx.createTokens(DWARF, amount.x)]) },
  // Aventure : la créature n'a que le vol.
  "Velvetwing Butterflies": {},
  "Gaze in Wonder": {
    spell: spell([{ ...target.between(1, 2, target.creature()), label: "une ou deux créatures" }], [fx.tap(ref.target())]),
  },
  "Vow to Erebor": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.untap(ref.target()),
        fx.pump(ref.target(), 2, 2),
        ...fx.when(
          cond.targetMatches("t", { subtype: "Dwarf" }),
          fx.may(
            "Attacher un Équipement que vous contrôlez à ce Nain ?",
            fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Equipment" }), ref.you, "e"),
            fx.attach(ref.target(), ref.stored("e")),
          ),
        ),
      ],
    ),
  },
};
