/** Avatar: The Last Airbender — cartes rouges. */
import {
  ALLY,
  activated,
  amount,
  type CardScript,
  CLUE,
  chapter,
  cond,
  entersWith,
  exhaust,
  firebending,
  fx,
  MONK_R,
  modal,
  mode,
  ref,
  SOLDIER_FIRE,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez");
const LESSON_IN_GRAVEYARD = cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Lesson" }), 1);

export const RED: Record<string, CardScript> = {
  "Boar-q-pine": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.self, 1)], {
        label: "Un marqueur +1/+1",
      }),
    ],
  },
  "Bumi Bash": {
    spell: modal(
      mode(
        "Blessures égales au nombre de vos terrains",
        [target.creature()],
        [fx.damage(amount.count({ types: ["Land"], controller: "you" }), ref.target())],
      ),
      mode(
        "Détruit une créature-terrain ou un terrain non de base",
        [
          target.permanent(
            "u",
            ["Land"],
            { anyOf: [{ types: ["Creature"] }, { nonbasic: true }] },
            "créature-terrain ou terrain non de base",
          ),
        ],
        [fx.destroy(ref.target("u"))],
      ),
    ),
  },
  "The Cave of Two Lovers": {
    abilities: [
      chapter([1], [fx.createTokens(ALLY, 2)], { label: "Deux Alliés 1/1" }),
      chapter([2], [fx.search({ anySubtype: ["Mountain", "Cave"] })], { label: "Une carte de Montagne ou de Caverne" }),
      chapter([3], fx.earthbend(ref.target(), 3), { targets: [LAND_YOU_CONTROL], label: "Maîtrise de la terre 3" }),
    ],
  },
  "Combustion Man": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.mayForStore(
            ref.controllerOf(ref.target()),
            "Subir des blessures égales à la force de Combustion Man pour sauver ce permanent ?",
            "hurt",
            fx.damage(amount.powerOf(ref.self), ref.controllerOf(ref.target())),
          ),
          ...fx.when(cond.not(cond.v("hurt")), fx.destroy(ref.target())),
        ],
        {
          targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
          label: "Détruit le permanent, sauf si son contrôleur subit des blessures",
        },
      ),
    ],
  },
  "Crescent Island Temple": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MONK_R, amount.count({ subtype: "Shrine", controller: "you" }))], {
        label: "Un Moine 1/1 par Sanctuaire",
      }),
      triggered(when.enters({ subtype: "Shrine", controller: "you", other: true }), [fx.createTokens(MONK_R)], {
        label: "Un Moine 1/1",
      }),
    ],
  },
  "Cunning Maneuver": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 1), fx.createTokens(CLUE)]),
  },
  "Deserter's Disciple": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true, maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Une autre de vos créatures de force 2 ou moins est imblocable",
      }),
    ],
  },
  "Fire Nation Attacks": {
    flashback: "{8}{R}",
    spell: spell([], [fx.createTokens(SOLDIER_FIRE, 2)]),
  },
  "Fire Nation Cadets": {
    abilities: [
      staticAbility(
        "self",
        { addAbilities: [firebending(2)] },
        { condition: LESSON_IN_GRAVEYARD, label: "Maîtrise du feu 2 avec une Leçon dans votre cimetière" },
      ),
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0 jusqu'à la fin du tour" }),
    ],
  },
  "Fire Nation Raider": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(CLUE)], { condition: cond.raid, label: "Raid : un Indice" })],
  },
  "Fire Sages": {
    // Maîtrise du feu 1 : lue dans le texte.
    abilities: [activated({ mana: "{1}{R}{R}", effects: [fx.addCounters(ref.self, 1)], label: "Un marqueur +1/+1" })],
  },
  "Firebending Student": {
    // Prouesse : lue dans le texte ; « maîtrise du feu X, X étant sa force » : écrite ici.
    abilities: [firebending(amount.powerOf(ref.self))],
  },
  "How to Start a Riot": {
    spell: spell(
      [target.creature(), target.player("p")],
      [
        fx.modify(ref.target(), { addKeywords: ["menace"] }),
        fx.pump(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 2, 0),
      ],
    ),
  },
  "Jeong Jeong, the Deserter": {
    // Maîtrise du feu 1 : lue dans le texte.
    abilities: [
      exhaust({
        mana: "{3}",
        effects: [
          fx.addCounters(ref.self, 1),
          { op: "playerEffect", ability: { nextSpell: { filter: { subtype: "Lesson" }, copy: true } }, once: true },
        ],
        label: "Un marqueur +1/+1 ; votre prochain sort de Leçon de ce tour-ci est copié",
      }),
    ],
  },
  "Jet's Brainwashing": {
    kicker: "{3}",
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), { addKeywords: ["cantBlock"] }),
        ...fx.when(
          cond.kicked,
          fx.gainControl(ref.target()),
          fx.untap(ref.target()),
          fx.modify(ref.target(), { addKeywords: ["haste"] }),
        ),
        fx.createTokens(CLUE),
      ],
    ),
  },
  "Mai, Jaded Edge": {
    // Prouesse : lue dans le texte.
    abilities: [
      exhaust({ mana: "{3}", effects: [fx.counters(ref.self, "doubleStrike")], label: "Un marqueur double initiative" }),
    ],
  },
  "Mongoose Lizard": {
    // Menace et cycle de Montagne : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target())], {
        targets: [target.any()],
        label: "1 blessure à n'importe quelle cible",
      }),
    ],
  },
  "Ran and Shaw": {
    // Vol et maîtrise du feu 2 : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.copyToken(ref.self, { nonlegendary: true })], {
        condition: cond.all(
          cond.wasCast,
          cond.amountAtLeast(amount.countIn("graveyard", { anyOf: [{ subtype: "Dragon" }, { subtype: "Lesson" }] }), 3),
        ),
        label: "Un jeton copie non légendaire",
      }),
      activated({
        mana: "{3}{R}",
        effects: [fx.pumpAll({ types: ["Creature"], subtype: "Dragon", controller: "you" }, 2, 0)],
        label: "Vos Dragons gagnent +2/+0",
      }),
    ],
  },
  "Rough Rhino Cavalry": {
    // Maîtrise du feu 2 : lue dans le texte.
    abilities: [
      exhaust({
        mana: "{8}",
        effects: [fx.addCounters(ref.self, 2), fx.modify(ref.self, { addKeywords: ["trample"] })],
        label: "Deux marqueurs +1/+1 et le piétinement",
      }),
    ],
  },
  "Solstice Revelations": {
    flashback: "{6}{R}",
    spell: spell(
      [],
      [
        fx.exileUntil({ nonland: true }, "x"),
        // Lancée sans payer si sa VM est inférieure au nombre de vos Montagnes ; sinon (ou si vous refusez), en main.
        fx.castNow(ref.stored("x"), {
          free: true,
          maxManaValue: amount.plus(amount.count({ subtype: "Mountain", controller: "you" }), -1),
        }),
        fx.toHand(ref.stored("x")),
      ],
    ),
  },
  "Tiger-Dillo": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.controls({ types: ["Creature"], minPower: 4, other: true })),
          label: "Ni attaque ni blocage sans une autre créature de force 4 ou plus",
        },
      ),
    ],
  },
  "Treetop Freedom Fighters": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "Un Allié 1/1" })],
  },
  "Twin Blades": {
    // Flash et équipement {2} : lus dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "S'attache à une de vos créatures, qui gagne la double initiative",
      }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Ty Lee, Artful Acrobat": {
    // Prouesse : lue dans le texte.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.mayPay(
            "{1}",
            "Payer {1} pour qu'une créature ne puisse pas bloquer ?",
            fx.reflexive([target.creature()], [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })]),
          ),
        ],
        { label: "Payez {1} : une créature ne peut pas bloquer ce tour-ci" },
      ),
    ],
  },
  "War Balloon": {
    // Vol et équipage 3 : lus dans le texte.
    abilities: [
      activated({ mana: "{1}", effects: [fx.counters(ref.self, "fire")], label: "Un marqueur de feu" }),
      staticAbility(
        "self",
        { addTypes: ["Artifact", "Creature"] },
        { condition: cond.counterAtLeast("fire", 3), label: "Créature-artefact avec trois marqueurs de feu ou plus" },
      ),
    ],
  },
  "Wartime Protestors": {
    // Célérité : lue dans le texte.
    abilities: [
      triggered(
        when.enters({ subtype: "Ally", controller: "you", other: true }),
        [fx.addCounters(ref.eventObject, 1), fx.modify(ref.eventObject, { addKeywords: ["haste"] })],
        { label: "Un marqueur +1/+1 et la célérité à l'Allié" },
      ),
    ],
  },
  "Yuyan Archers": {
    // Portée : lue dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Vous pouvez défausser une carte pour en piocher une",
      }),
    ],
  },
  "Zhao, the Moon Slayer": {
    // Menace : lue dans le texte.
    abilities: [
      entersWith({
        tapped: true,
        affects: { types: ["Land"], nonbasic: true },
        label: "Les terrains non de base arrivent engagés",
      }),
      activated({ mana: "{7}", effects: [fx.counters(ref.self, "conqueror")], label: "Un marqueur de conquérant" }),
      // Le type Montagne donne « {T} : ajoutez {R} » (305.6).
      staticAbility(
        { types: ["Land"], nonbasic: true },
        { setSubtypes: ["Mountain"], loseAllAbilities: true },
        { condition: cond.counterAtLeast("conqueror", 1), label: "Les terrains non de base sont des Montagnes" },
      ),
    ],
  },
  "Zuko, Exiled Prince": {
    // Maîtrise du feu 3 : lue dans le texte.
    abilities: [
      activated({
        mana: "{3}",
        effects: [fx.exileTop(ref.you, 1, "z"), fx.grantPlay(ref.stored("z"))],
        label: "Exilez la carte du dessus, jouable ce tour-ci",
      }),
    ],
  },
  // « Payez 5 points de vie ou payez {2} » : lu dans le texte.
  "Redirect Lightning": {
    spell: spell([target.stackItemSingleTarget()], [fx.changeTarget(ref.target())]),
  },
  // Présage {2}{R} : lu dans le texte.
  "Sozin's Comet": {
    spell: spell([], [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addAbilities: [firebending(5)] })]),
  },
  "The Last Agni Kai": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.fight(ref.target("a"), ref.target("b"), "excess"),
        { op: "addManaUntilEndOfTurn", mana: ["R"], times: amount.v("excess") },
        fx.thisTurn({ keepUnspentMana: { types: ["R"] }, label: "Vous ne perdez pas votre mana rouge non dépensé" }),
      ],
    ),
  },
};
