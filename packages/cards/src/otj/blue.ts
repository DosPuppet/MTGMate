/** Outlaws of Thunder Junction — cartes bleues. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  entersWith,
  fx,
  OUTLAW,
  ref,
  SPIRIT_2,
  spell,
  spree,
  staticAbility,
  target,
  triggered,
  when,
  ZOMBIE_ROGUE,
} from "./common";

const NO_HAND_SPELL = cond.not(cond.handSpellThisTurn);

export const BLUE: Record<string, CardScript> = {
  "Canyon Crab": {
    abilities: [
      activated({ mana: "{1}{U}", effects: [fx.pump(ref.self, 2, -2)], label: "+2/-2" }),
      triggered(when.yourEndStep, fx.loot(1), { condition: NO_HAND_SPELL, label: "Piochez, défaussez" }),
    ],
  },
  "Daring Thunder-Thief": { abilities: [entersWith({ tapped: true })] },
  "Deepmuck Desperado": {
    abilities: [
      triggered(when.crime, [fx.mill(3, ref.eachOpponent)], { oncePerTurn: true, label: "Chaque adversaire meule trois cartes" }),
    ],
  },
  "Djinn of Fool's Fall": {},
  "Duelist of the Mind": {
    cdaPower: amount.cardsDrawnThisTurn,
    abilities: [
      triggered(when.crime, fx.may("Piocher puis défausser ?", ...fx.loot(1)), {
        oncePerTurn: true,
        label: "Piochez, défaussez",
      }),
    ],
  },
  "Emergent Haunting": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.modify(
            ref.self,
            { addTypes: ["Creature"], addSubtypes: ["Spirit"], setPower: 3, setToughness: 3, addKeywords: ["flying"] },
            "permanent",
          ),
        ],
        {
          condition: cond.all(NO_HAND_SPELL, cond.not(cond.sourceMatches({ types: ["Creature"] }))),
          label: "Devient un Esprit 3/3 volant",
        },
      ),
      activated({ mana: "{2}{U}", effects: [fx.surveil(1)], label: "Surveillance 1" }),
    ],
  },
  "Failed Fording": {
    spell: spell([target.nonland("t")], [fx.bounce(ref.target()), fx.when(cond.controls({ subtype: "Desert" }), fx.surveil(1))]),
  },
  "Fleeting Reflection": {
    spell: spell(
      [target.creature("t", { controller: "you" }), target.upTo(1, target.creature("c", { other: true }))],
      [fx.pump(ref.target(), 0, 0, ["hexproof"]), fx.untap(ref.target()), fx.becomeCopy(ref.target(), ref.target("c"))],
    ),
  },
  "Geralf, the Fleshwright": {
    abilities: [
      triggered(when.castSpell("you"), [fx.createTokens(ZOMBIE_ROGUE)], {
        condition: cond.all(cond.yourTurn, cond.castThisTurn(2)),
        label: "Zombie Voleur 2/2",
      }),
      triggered(
        when.enters({ subtype: "Zombie", controller: "you" }),
        [
          // Journal du tour : les Zombies arrivés ce tour-ci, même partis depuis, moins celui qui arrive.
          fx.addCounters(
            ref.eventObject,
            amount.plus(amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Zombie", who: "you" }), amount.neg(1)),
          ),
        ],
        { label: "Un marqueur par autre Zombie arrivé ce tour-ci" },
      ),
    ],
  },
  "Geyser Drake": {
    abilities: [costReducer({}, 1, "Pendant les autres tours : sorts {1} de moins", { condition: cond.opponentsTurn })],
  },
  "Harrier Strix": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target())], { targets: [target.nonland("t")], label: "Engagez un permanent" }),
      activated({ mana: "{2}{U}", effects: fx.loot(1), label: "Piochez, défaussez" }),
    ],
  },
  "Jailbreak Scheme": {
    spell: spree(
      {
        cost: "{3}",
        label: "Marqueur +1/+1, imblocable",
        targets: [target.creature("c")],
        effects: [fx.addCounters(ref.target("c"), 1), fx.pump(ref.target("c"), 0, 0, ["unblockable"])],
      },
      {
        cost: "{2}",
        label: "Dessus ou dessous de la bibliothèque",
        targets: [target.permanent("b", ["Artifact", "Creature"], {}, "artefact ou créature")],
        effects: [fx.topOrBottom(ref.target("b"))],
      },
    ),
  },
  "Loan Shark": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: cond.castThisTurn(2), label: "Piochez" })],
  },
  "Marauding Sphinx": {
    abilities: [triggered(when.crime, [fx.surveil(2)], { oncePerTurn: true, label: "Surveillance 2" })],
  },
  "Metamorphic Blast": {
    spell: spree(
      {
        cost: "{1}",
        label: "Devient un Lapin blanc 0/1",
        targets: [target.creature("c")],
        effects: [fx.modify(ref.target("c"), { setColors: ["W"], setSubtypes: ["Rabbit"], setPower: 0, setToughness: 1 })],
      },
      {
        cost: "{3}",
        label: "Un joueur pioche deux cartes",
        targets: [target.player("p")],
        effects: [fx.draw(2, ref.target("p"))],
      },
    ),
  },
  "Nimble Brigand": {
    abilities: [
      staticAbility("self", { addKeywords: ["unblockable"] }, { condition: cond.crime, label: "Imblocable (crime)" }),
      triggered(when.combatDamage("self", true), [fx.draw(1)], { label: "Piochez" }),
    ],
  },
  "Outlaw Stitcher": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(ZOMBIE_ROGUE, 1, undefined, "z"),
          fx.addCounters(ref.stored("z"), amount.plus(amount.spellsCastThisTurn, amount.spellsCastThisTurn, -2)),
        ],
        { label: "Zombie Voleur, deux marqueurs par sort après le premier" },
      ),
    ],
  },
  "Peerless Ropemaster": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { tapped: true }))],
        label: "Renvoyez une créature engagée",
      }),
    ],
  },
  "Phantom Interference": {
    spell: spree(
      { cost: "{3}", label: "Esprit 2/2 volant", effects: [fx.createTokens(SPIRIT_2)] },
      {
        cost: "{1}",
        label: "Contrecarrez sauf {2}",
        targets: [target.spell("s")],
        effects: fx.unlessPays(ref.controllerOf(ref.target("s")), { mana: "{2}" }, fx.counter(ref.target("s"))),
      },
    ),
  },
  "Plan the Heist": {
    spell: spell([], [fx.when(cond.amountAtLeast(amount.neg(amount.cardsIn("hand")), 0), fx.surveil(3)), fx.draw(3)]),
  },
  "Razzle-Dazzler": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["unblockable"])], {
        label: "Marqueur +1/+1, imblocable",
      }),
    ],
  },
  "Seize the Secrets": { costReduction: { generic: 1, condition: cond.crime }, spell: spell([], [fx.draw(2)]) },
  "Shackle Slinger": {
    abilities: [
      triggered(
        when.castNthSpell(2),
        [
          fx.when(cond.targetMatches("t", { tapped: true }), fx.counters(ref.target(), "stun", 1)),
          fx.when(cond.not(cond.targetMatches("t", { tapped: true })), fx.tap(ref.target())),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Engagez-la, ou étourdissez-la" },
      ),
    ],
  },
  "Shifting Grift": {
    spell: spree(
      {
        cost: "{2}",
        label: "Échangez deux créatures",
        targets: [target.creature("c1"), target.creature("c2")],
        effects: [fx.exchangeControl(ref.target("c1"), ref.target("c2"))],
      },
      {
        cost: "{1}",
        label: "Échangez deux artefacts",
        targets: [target.permanent("a1", ["Artifact"]), target.permanent("a2", ["Artifact"])],
        effects: [fx.exchangeControl(ref.target("a1"), ref.target("a2"))],
      },
      {
        cost: "{1}",
        label: "Échangez deux enchantements",
        targets: [target.permanent("e1", ["Enchantment"]), target.permanent("e2", ["Enchantment"])],
        effects: [fx.exchangeControl(ref.target("e1"), ref.target("e2"))],
      },
    ),
  },
  "Slickshot Lockpicker": {
    abilities: [
      triggered(when.entersSelf, [fx.grantFlashback(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "éphémère ou rituel")],
        label: "Flashback accordé",
      }),
    ],
  },
  "Slickshot Vault-Buster": {
    abilities: [staticAbility("self", { power: 2 }, { condition: cond.crime, label: "+2/+0 (crime)" })],
  },
  "Spring Splasher": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), -3, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-3/-0",
      }),
    ],
  },
  "Stoic Sphinx": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.not(cond.castThisTurn(1)), label: "Défense talismanique" },
      ),
    ],
  },
  "Stop Cold": {
    enchant: { filter: { types: ["Artifact", "Creature"] }, label: "artefact ou créature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Engagez le permanent enchanté" }),
      staticAbility(
        "attached",
        { loseAllAbilities: true, addKeywords: ["doesntUntap"] },
        { label: "Sans capacité, ne se dégage pas" },
      ),
    ],
  },
  "Take the Fall": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.controls(OUTLAW), fx.pump(ref.target(), -4, 0)),
        fx.when(cond.not(cond.controls(OUTLAW)), fx.pump(ref.target(), -1, 0)),
        fx.draw(1),
      ],
    ),
  },
  "This Town Ain't Big Enough": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { controller: "you" }) },
    spell: spell([target.upTo(2, target.nonland("t"))], [fx.bounce(ref.target())]),
  },
  "Three Steps Ahead": {
    spell: spree(
      { cost: "{1}{U}", label: "Contrecarrez un sort", targets: [target.spell("s")], effects: [fx.counter(ref.target("s"))] },
      {
        cost: "{3}",
        label: "Jeton copie",
        targets: [
          target.permanent("c", ["Artifact", "Creature"], { controller: "you" }, "artefact ou créature que vous contrôlez"),
        ],
        effects: [fx.copyToken(ref.target("c"))],
      },
      { cost: "{2}", label: "Piochez deux, défaussez une", effects: [fx.draw(2), fx.discard(1)] },
    ),
  },
};
