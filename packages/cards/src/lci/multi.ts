/** The Lost Caverns of Ixalan — cartes multicolores (légendaires compris). */
import {
  activated,
  amount,
  block,
  type CardScript,
  cond,
  DINOSAUR_3_3,
  DINOSAUR_EGG,
  DINOSAUR_YOU,
  descend,
  FUNGUS,
  fx,
  GNOME,
  loyalty,
  MAP,
  mode,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  PERMANENT_CARDS,
  ref,
  SPIRIT_3_2,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  VAMPIRE_DEMON,
  when,
} from "./common";

/** Wail of the Forgotten : les trois modes, et toutes leurs combinaisons sous Descente 8. */
const WAIL_MODES = [
  {
    label: "Renvoyez un permanent non-terrain",
    targets: [target.nonland("a")],
    effects: [fx.bounce(ref.target("a"))],
  },
  {
    label: "Un adversaire défausse une carte",
    targets: [target.player("b", "opponent")],
    effects: [fx.discard(1, ref.target("b"))],
  },
  { label: "Une carte en main, le reste au cimetière", targets: [], effects: [fx.lookAtTop(3, { count: 1, rest: "graveyard" })] },
];
const wailModes = () => {
  const out = [];
  for (let mask = 1; mask < 8; mask++) {
    const chosen = WAIL_MODES.filter((_, i) => mask & (1 << i));
    const m = mode(
      chosen.map((c) => c.label).join(" + "),
      chosen.flatMap((c) => c.targets),
      chosen.flatMap((c) => c.effects),
    );
    out.push(chosen.length > 1 ? { ...m, condition: descend(8) } : m);
  }
  return out;
};

export const MULTI: Record<string, CardScript> = {
  "Abuelo, Ancestral Echo": {
    abilities: [
      activated({
        mana: "{1}{W}{U}",
        targets: [targetObj("t", { ...OTHER_ARTIFACT_OR_CREATURE_YOURS }, "autre créature ou artefact que vous contrôlez")],
        effects: [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
        ],
        label: "Exilez-le jusqu'à l'étape de fin",
      }),
    ],
  },
  "Akawalli, the Seething Tower": {
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 2, addKeywords: ["trample"] },
        {
          condition: descend(4),
          label: "Descente 4 — +2/+2 et piétinement",
        },
      ),
      staticAbility(
        "self",
        { power: 2, toughness: 2, addBlockRules: [block.atMost(1)] },
        {
          condition: descend(8),
          label: "Descente 8 — +2/+2, un seul bloqueur",
        },
      ),
    ],
  },
  "Amalia Benavides Aguirre": {
    abilities: [
      triggered(
        when.gainLife,
        [
          fx.explore(),
          ...fx.when(
            cond.all(
              cond.amountAtLeast(amount.powerOf(ref.self), 20),
              cond.not(cond.amountAtLeast(amount.powerOf(ref.self), 21)),
            ),
            fx.destroyAll({ types: ["Creature"], other: true }),
          ),
        ],
        { label: "Explore ; force 20 : détruisez les autres créatures" },
      ),
    ],
  },
  "The Ancient One": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(descend(8)),
          label: "Descente 8 — ne peut ni attaquer ni bloquer sinon",
        },
      ),
      activated({
        mana: "{2}{U}{B}",
        effects: [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "d" }),
          fx.reflexive([target.player()], [fx.mill(amount.manaValueOf(ref.target("d")), ref.target())], { d: ref.stored("d") }),
        ],
        label: "Pillage ; un joueur meule",
      }),
    ],
  },
  "Anim Pakal, Thousandth Moon": {
    abilities: [
      triggered(
        when.attackWith(1, { types: ["Creature"], controller: "you", notSubtype: "Gnome" }),
        [fx.addCounters(ref.self, 1), fx.createTappedTokens(GNOME, amount.countersOn(ref.self), { attacking: true })],
        { label: "Marqueur +1/+1, Gnomes attaquants" },
      ),
    ],
  },
  "Bartolomé del Presidio": {
    abilities: [
      activated({
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Captain Storm, Cosmium Raider": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", subtype: "Pirate" })],
        label: "Marqueur +1/+1 sur un Pirate",
      }),
    ],
  },
  "Deepfathom Echo": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.explore(),
          // La créature à copier est choisie après l'exploration, sans cibler.
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true }), ref.you, "c", {
            optional: true,
            prompt: "Devenir jusqu'à la fin du tour une copie de l'une de vos autres créatures ?",
          }),
          fx.becomeCopy(ref.self, ref.stored("c")),
        ],
        { label: "Explore, puis copie" },
      ),
    ],
  },
  "Gishath, Sun's Avatar": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.lookAtTop(amount.eventAmount, {
            filter: { types: ["Creature"], subtype: "Dinosaur" },
            count: amount.eventAmount,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "Dinosaures révélés sur le champ de bataille" },
      ),
    ],
  },
  "Itzquinth, Firstborn of Gishath": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.mayPay(
            "{2}",
            "Payer {2} ?",
            fx.reflexive(
              [target.creature("a", DINOSAUR_YOU), { ...target.creature("b"), otherThan: ["a"] }],
              [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
            ),
          ),
        ],
        { label: "Un Dinosaure inflige ses blessures" },
      ),
    ],
  },
  "Kellan, Daring Traveler": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // Une carte de créature de VM 3 ou moins va en main ; sinon, elle peut aller au cimetière.
          fx.lookAtTop(1, { filter: { types: ["Creature"], maxManaValue: 3 }, count: 1, exact: true, rest: "top", store: "k" }),
          ...fx.when(
            cond.all(cond.not(cond.v("k")), cond.amountAtLeast(amount.refCount(ref.libraryTop(ref.you)), 1)),
            ...fx.may("Mettre la carte révélée dans votre cimetière ?", fx.moveTo(ref.libraryTop(ref.you), { to: "graveyard" })),
          ),
        ],
        { label: "Créature de VM 3 ou moins en main" },
      ),
    ],
  },
  "Journey On": {
    spell: spell(
      [],
      // X : un plus le nombre d'adversaires qui contrôlent un artefact.
      [
        fx.createTokens(
          MAP,
          amount.plus(amount.refCount(ref.playersWhere(ref.eachOpponent, cond.controls({ types: ["Artifact"] }))), 1),
        ),
      ],
    ),
  },
  "Nicanzil, Current Conductor": {
    abilities: [
      triggered(
        when.explores({ types: ["Creature"], controller: "you" }, true),
        [fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { count: 1, min: 0 })],
        { label: "Terrain de votre main, engagé" },
      ),
      triggered(when.explores({ types: ["Creature"], controller: "you" }, false), [fx.addCounters(ref.self, 1)], {
        label: "Marqueur +1/+1",
      }),
    ],
  },
  "Palani's Hatcher": {
    abilities: [
      staticAbility({ ...DINOSAUR_YOU, other: true }, { addKeywords: ["haste"] }, { label: "Autres Dinosaures : célérité" }),
      triggered(when.entersSelf, [fx.createTokens(DINOSAUR_EGG, 2)], { label: "Deux Œufs 0/1" }),
      triggered(when.yourCombat, [fx.sacrifice(ref.you, { subtype: "Egg" }), fx.createTokens(DINOSAUR_3_3)], {
        condition: cond.controls({ subtype: "Egg" }),
        label: "Sacrifiez un Œuf : Dinosaure 3/3",
      }),
    ],
  },
  "Saheeli, the Sun's Brilliance": {
    abilities: [
      activated({
        mana: "{U}{R}",
        tap: true,
        targets: [targetObj("t", { ...OTHER_ARTIFACT_OR_CREATURE_YOURS }, "autre créature ou artefact que vous contrôlez")],
        effects: [fx.copyToken(ref.target(), { addTypes: ["Artifact"], addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "Copie-jeton (artefact, célérité)",
      }),
    ],
  },
  "Squirming Emergence": {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "you", "carte de permanent non-terrain")],
      [
        ...fx.when(
          cond.amountAtLeast(amount.plus(PERMANENT_CARDS, amount.neg(amount.manaValueOf(ref.target()))), 0),
          fx.toBattlefield(ref.target()),
        ),
      ],
    ),
  },
  "Uchbenbak, the Great Mistake": {
    abilities: [
      activated({
        mana: "{4}{U}{B}",
        fromGraveyard: true,
        sorcerySpeed: true,
        activationCondition: descend(8),
        effects: [fx.toBattlefield(ref.selfCard, { counters: { kind: "finality", n: 1 } })],
        label: "Descente 8 — revient (finalité)",
      }),
    ],
  },
  "Vito, Fanatic of Aclazotz": {
    abilities: [
      triggered(
        when.sacrifice({ other: true }),
        [
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), fx.gainLife(2)),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.loseLife(2, ref.eachOpponent)),
          ...fx.when(cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))), fx.createTokens(VAMPIRE_DEMON)),
        ],
        { label: "Sacrifice : PV, perte de PV, Vampire Démon" },
      ),
    ],
  },
  "Wail of the Forgotten": { spell: { modes: wailModes() } },
  "Caparocti Sunborn": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.may(
            "Engager deux artefacts et/ou créatures pour découvrir 3 ?",
            fx.tapChosen({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, "c"),
            ...fx.when(cond.v("c", 2), fx.discover(3)),
          ),
        ],
        { label: "Engagez deux permanents : découverte 3" },
      ),
    ],
  },
  "Molten Collapse": {
    spell: {
      modes: [
        mode("Détruisez une créature ou un planeswalker", [target.creatureOrPlaneswalker("a")], [fx.destroy(ref.target("a"))]),
        mode(
          "Détruisez un permanent non-créature non-terrain de VM 1 ou moins",
          [
            targetObj(
              "b",
              { notTypes: ["Land", "Creature"], maxManaValue: 1 },
              "permanent non-créature non-terrain de VM 1 ou moins",
            ),
          ],
          [fx.destroy(ref.target("b"))],
        ),
        {
          ...mode(
            "Les deux (descente)",
            [
              target.creatureOrPlaneswalker("a"),
              targetObj(
                "b",
                { notTypes: ["Land", "Creature"], maxManaValue: 1 },
                "permanent non-créature non-terrain de VM 1 ou moins",
              ),
            ],
            [fx.destroy(ref.target("a")), fx.destroy(ref.target("b"))],
          ),
          condition: cond.descended,
        },
      ],
    },
  },
  "The Mycotyrant": {
    cdaPT: amount.count({ types: ["Creature"], controller: "you", anySubtype: ["Fungus", "Saproling"] }),
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FUNGUS, amount.descendedThisTurn)], {
        label: "Un Champignon par descente",
      }),
    ],
  },
  "Quintorius Kand": {
    abilities: [
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.damage(2, ref.eachOpponent), fx.gainLife(2)], {
        label: "Sort lancé depuis l'exil : 2 blessures, +2 PV",
      }),
      loyalty(1, { effects: [fx.createTokens(SPIRIT_3_2)], label: "Esprit 3/2" }),
      loyalty(-3, { effects: [fx.discover(4)], label: "Découverte 4" }),
      loyalty(-6, {
        targets: [target.upTo(40, target.cardInGraveyard("t", {}, "you"))],
        effects: [
          fx.exileCard(ref.target(), { name: "q" }),
          fx.addManaTimes(amount.refCount(ref.stored("q")), "R"),
          fx.grantPlay(ref.stored("q")),
        ],
        label: "Exilez des cartes de votre cimetière : {R} chacune, jouables ce tour-ci",
      }),
    ],
  },
  "Zoyowa Lava-Tongue": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.eachOpponent, 0, { discard: true, sacrifice: {}, damage: 3 })], {
        condition: cond.descended,
        label: "Descente — défausse, sacrifice ou 3 blessures",
      }),
    ],
  },
};
