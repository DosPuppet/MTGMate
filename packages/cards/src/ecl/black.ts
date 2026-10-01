/** Lorwyn Eclipsed — cartes noires. */
import {
  activated,
  amount,
  type CardScript,
  cond,
  ELF_BG,
  entersWith,
  FAERIE_UB,
  fx,
  GOBLIN_BR,
  modal,
  mode,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

/** « Vous pouvez flétrir N. Si vous le faites, … » */
const mayBlight = (n: number, ...then: Parameters<typeof fx.when>[1][]) => [
  ...fx.may(`Flétrir ${n} ?`, fx.blight(n, ref.you, "blighted")),
  ...fx.when(cond.v("blighted"), ...then),
];

/** « une carte d'Elfe dans votre cimetière » */
const ELF_IN_GRAVEYARD = cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Elf" }), 1);

/** « votre phase principale » */
const YOUR_MAIN_PHASE = cond.all(cond.yourTurn, cond.any(cond.step("main1"), cond.step("main2")));

export const BLACK: Record<string, CardScript> = {
  "Auntie's Sentence": {
    spell: modal(
      mode(
        "L'adversaire révèle sa main ; il se défausse de la carte de permanent non-terrain choisie",
        [target.player("p", "opponent")],
        [fx.discard(1, ref.target("p"), { chooser: "controller", filter: { permanent: true, nonland: true } })],
      ),
      mode("Une créature gagne -2/-2", [target.creature("c")], [fx.pump(ref.target("c"), -2, -2)]),
    ),
  },
  "Bile-Vial Boggart": {
    abilities: [
      triggered(when.diesSelf, [fx.counters(ref.target(), "-1/-1", 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "Un marqueur -1/-1 sur une créature",
      }),
    ],
  },
  "Bitterbloom Bearer": {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(FAERIE_UB)], {
        label: "Vous perdez 1 PV ; jeton Faerie 1/1 avec le vol",
      }),
    ],
  },
  "Blight Rot": { spell: spell([target.creature()], [fx.counters(ref.target(), "-1/-1", 4)]) },
  "Blighted Blackthorn": {
    abilities: [
      triggered(when.entersSelf, mayBlight(2, fx.draw(1), fx.loseLife(1)), {
        label: "Flétrir 2 : piochez une carte, perdez 1 PV",
      }),
      triggered(when.attacksSelf, mayBlight(2, fx.draw(1), fx.loseLife(1)), {
        label: "Flétrir 2 : piochez une carte, perdez 1 PV",
      }),
    ],
  },
  "Boggart Mischief": {
    abilities: [
      triggered(when.entersSelf, mayBlight(1, fx.createTokens(GOBLIN_BR, 2)), {
        label: "Flétrir 1 : deux jetons Gobelin 1/1",
      }),
      triggered(when.dies({ types: ["Creature"], subtype: "Goblin", controller: "you" }), fx.drain(1), {
        label: "Un Gobelin meurt : chaque adversaire perd 1 PV, vous en gagnez 1",
      }),
    ],
  },
  "Boggart Prankster": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 1, 0)], {
        targets: [target.creature("t", { controller: "you", attacking: true, subtype: "Goblin" })],
        label: "Un Gobelin attaquant gagne +1/+0",
      }),
    ],
  },
  "Creakwood Safewright": {
    abilities: [
      entersWith({ counters: 3, counterKind: "-1/-1", label: "Arrive avec trois marqueurs -1/-1" }),
      triggered(when.yourEndStep, [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.all(ELF_IN_GRAVEYARD, cond.counterAtLeast("-1/-1", 1)),
        label: "Elfe au cimetière : retire un marqueur -1/-1",
      }),
    ],
  },
  "Darkness Descends": { spell: spell([], [fx.addCountersAll({ types: ["Creature"] }, 2, "-1/-1")]) },
  "Dawnhand Eulogist": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3), ...fx.when(ELF_IN_GRAVEYARD, fx.drain(2))], {
        label: "Meule 3 ; Elfe au cimetière : chaque adversaire perd 2 PV, vous en gagnez 2",
      }),
    ],
  },
  "Dose of Dawnglow": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
      [fx.toBattlefield(ref.target()), ...fx.when(cond.not(YOUR_MAIN_PHASE), fx.blight(2))],
    ),
  },
  "Dream Seizer": {
    abilities: [
      triggered(when.entersSelf, mayBlight(1, fx.discard(1, ref.eachOpponent)), {
        label: "Flétrir 1 : chaque adversaire se défausse d'une carte",
      }),
    ],
  },
  "Gloom Ripper": {
    abilities: (() => {
      // X : les Elfes que vous contrôlez plus les cartes d'Elfe de votre cimetière.
      const x = amount.plus(amount.count({ subtype: "Elf", controller: "you" }), amount.countIn("graveyard", { subtype: "Elf" }));
      return [
        triggered(when.entersSelf, [fx.pump(ref.target("a"), x, 0), fx.pump(ref.target("b"), 0, amount.neg(x))], {
          targets: [
            target.creature("a", { controller: "you" }),
            target.upTo(1, target.creature("b", { controller: "opponent" })),
          ],
          label: "+X/+0 à votre créature, -0/-X à une créature adverse",
        }),
      ];
    })(),
  },
  "Gnarlbark Elm": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      // « Retirez deux marqueurs de cette créature » : seulement des marqueurs -1/-1 (approximation).
      activated({
        mana: "{2}{B}",
        removeCounters: { kind: "-1/-1", n: 2 },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -2, -2)],
        label: "Une créature gagne -2/-2",
      }),
    ],
  },
  Graveshifter: {
    abilities: [
      triggered(when.entersSelf, fx.may("Renvoyer la carte de créature en main ?", fx.toHand(ref.target())), {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        label: "Renvoie une carte de créature de votre cimetière en main",
      }),
    ],
  },
  "Gutsplitter Gang": {
    abilities: [
      triggered(
        when.step("main1", "you"),
        [
          ...fx.may("Flétrir 2 ? (sinon, vous perdez 3 PV)", fx.blight(2, ref.you, "blighted")),
          ...fx.when(cond.not(cond.v("blighted")), fx.loseLife(3)),
        ],
        { label: "Flétrir 2, sinon vous perdez 3 PV" },
      ),
    ],
  },
  "Heirloom Auntie": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true }),
        [fx.surveil(1), fx.removeCounters(ref.self, 1, "-1/-1")],
        { label: "Surveillance 1, puis retire un marqueur -1/-1" },
      ),
    ],
  },
  "Moonglove Extractor": {
    abilities: [triggered(when.attacksSelf, [fx.draw(1), fx.loseLife(1)], { label: "Piochez une carte, perdez 1 PV" })],
  },
  "Mudbutton Cursetosser": {
    // « Contemplez un Gobelin ou payez {2} » : {2} de plus sans Gobelin à contempler (vérifié au lancement, comme
    // Caustic Exhale). La carte lancée ne peut pas se contempler elle-même : la réduction est évaluée sans source,
    // d'où l'exclusion par le nom (une autre Mudbutton Cursetosser ne compte donc pas non plus).
    costReduction: {
      generic: -2,
      condition: cond.not(cond.behold({ subtype: "Goblin", not: { name: "Mudbutton Cursetosser" } })),
    },
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.diesSelf, [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxPower: 2 })],
        label: "Détruit une créature adverse de force 2 ou moins",
      }),
    ],
  },
  "Nameless Inversion": {
    // « Perd tous ses types de créature » : sous-types retirés ; le changelin aussi, sans quoi elle les garderait.
    spell: spell(
      [target.creature()],
      [fx.modify(ref.target(), { power: 3, toughness: -3, setSubtypes: [], removeKeywords: ["changeling"] })],
    ),
  },
  "Nightmare Sower": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.counters(ref.target(), "-1/-1", 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "Sort lancé pendant le tour d'un adversaire : un marqueur -1/-1",
      }),
    ],
  },
  "Perfect Intimidation": {
    spell: (() => {
      const exileTwo = fx.discard(2, ref.target("p"), { exile: true });
      const removeAll = fx.removeCounters(ref.target("c"), 999);
      return modal(
        mode("L'adversaire exile deux cartes de sa main", [target.player("p", "opponent")], [exileTwo]),
        mode("Retire tous les marqueurs d'une créature", [target.creature("c")], [removeAll]),
        mode("Les deux", [target.player("p", "opponent"), target.creature("c")], [exileTwo, removeAll]),
      );
    })(),
  },
  "Retched Wretch": {
    abilities: [
      triggered(
        when.diesSelf,
        [
          fx.moveTo(ref.selfCard, { to: "battlefield" }, { name: "back" }),
          fx.modify(ref.stored("back"), { loseAllAbilities: true }, "permanent"),
        ],
        {
          condition: cond.amountAtLeast(amount.lkiCounters("-1/-1"), 1),
          label: "Avait un marqueur -1/-1 : revient sur le champ de bataille sans capacités",
        },
      ),
    ],
  },
  "Scarblade Scout": {
    abilities: [triggered(when.entersSelf, [fx.mill(2)], { label: "Meule 2" })],
  },
  "Scarblade's Malice": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.modify(ref.target(), { addKeywords: ["deathtouch", "lifelink"] }),
        fx.emblem(
          "Scarblade's Malice",
          "When that creature dies this turn, create a 2/2 black and green Elf creature token.",
          [triggered(when.dies({ linkedToSource: true }), [fx.createTokens(ELF_BG)], { label: "Jeton Elfe 2/2" })],
          false,
          true,
          "e",
        ),
        fx.link(ref.target(), ref.stored("e")),
      ],
    ),
  },
  Shimmercreep: {
    abilities: [
      triggered(when.entersSelf, fx.drain(amount.colorsAmong()), {
        label: "Vivid : chaque adversaire perd X PV, vous en gagnez X",
      }),
    ],
  },
};
