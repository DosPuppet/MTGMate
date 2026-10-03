/**
 * Wilds of Eldraine — cartes rouges (lot A). Les Aventures ont une entrée par face (la créature sous son nom, le sort
 * d'Aventure sous le nom de l'Aventure) ; le Marchandage est lu dans le texte (`cond.kicked`).
 */
import {
  activated,
  amount,
  type CardScript,
  CELEBRATION,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  costReducer,
  createRole,
  fx,
  INSTANT_SORCERY,
  KNIGHT_VIGILANCE,
  MONSTER_ROLE,
  mode,
  RAT_NO_BLOCK,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  WICKED_ROLE,
  when,
  YOUNG_HERO_ROLE,
} from "./common";

/** « Créature ciblée que vous contrôlez » */
const yourCreature = (id = "t") => target.creature(id, { controller: "you" });

/** « Vous pouvez défausser une carte. Si vous le faites, piochez N cartes. » */
const mayRummage = (n: number) => [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(n))];

/** Cartes d'éphémère, de rituel et/ou avec une Aventure dans votre cimetière (Hearth Elemental, Frantic Firebolt). */
const SPELLY_CARDS = amount.plus(
  amount.countIn("graveyard", INSTANT_SORCERY),
  amount.countIn("graveyard", { notTypes: ["Instant", "Sorcery"], adventure: true }),
);

/** Ogre Chitterlord : deux Rats, puis +2/+0 à chaque Rat si vous en contrôlez cinq ou plus. */
const chitterlordEffects = [
  fx.createTokens(RAT_NO_BLOCK, 2),
  ...fx.when(cond.controls({ subtype: "Rat" }, 5), fx.pumpAll({ subtype: "Rat", controller: "you" }, 2, 0)),
];

export const RED: Record<string, CardScript> = {
  "Imodane, the Pyrohammer": {
    abilities: [
      triggered(
        { on: "dealsDamage", who: { types: ["Instant", "Sorcery"], controller: "you" }, spellToSoleTarget: true },
        [fx.damage(amount.eventAmount, ref.eachOpponent)],
        { label: "Votre sort à cible unique blesse sa créature : autant de blessures à chaque adversaire" },
      ),
    ],
  },
  // Portée lue dans le texte.
  "Skewer Slinger": {
    abilities: [
      triggered({ on: "blocks", who: "self", eventObject: "attacker" }, [fx.damage(1, ref.eventObject, ref.self)], {
        label: "Elle bloque : 1 blessure à cette créature",
      }),
      triggered(
        { on: "blocks", who: { types: ["Creature"] }, attacker: { self: true } },
        [fx.damage(1, ref.eventObject, ref.self)],
        {
          label: "Elle est bloquée : 1 blessure à cette créature",
        },
      ),
    ],
  },
  // Double initiative lue dans le texte.
  "Kellan, the Fae-Blooded": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { power: 1 },
        {
          per: { attachedToSelf: true, anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] },
          label: "Vos autres créatures : +1/+0 par Aura et Équipement attaché à Kellan",
        },
      ),
    ],
  },
  "Birthright Boon": {
    spell: spell([], [fx.search({ anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] }, { to: "hand" })]),
  },
  "Belligerent of the Ball": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0, ["menace"])], {
        condition: CELEBRATION,
        targets: [yourCreature()],
        label: "Célébration : +1/+0 et la menace à une de vos créatures",
      }),
    ],
  },
  "Bellowing Bruiser": {},
  "Beat a Path": {
    spell: spell([target.upTo(2, target.creature())], [fx.pump(ref.target(), 0, 0, ["cantBlock"])]),
  },
  "Bespoke Battlegarb": {
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "La créature équipée gagne +2/+0" }),
      triggered(when.yourCombat, [fx.attach(ref.target())], {
        condition: CELEBRATION,
        targets: [target.upTo(1, yourCreature())],
        label: "Célébration : attachez-le à une de vos créatures",
      }),
    ],
  },
  "Boundary Lands Ranger": {
    abilities: [
      triggered(when.yourCombat, mayRummage(1), {
        condition: cond.ferocious,
        label: "Force 4 ou plus : défaussez une carte pour en piocher une",
      }),
    ],
  },
  "Charming Scoundrel": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Défaussez une carte, puis piochez une carte", [], [fx.discard(1), fx.draw(1)]),
          mode("Un jeton Trésor", [], [fx.createTokens(TREASURE)]),
          mode("Un Rôle Malveillant sur une de vos créatures", [yourCreature()], createRole(WICKED_ROLE)),
        ],
        { label: "Choisissez un mode" },
      ),
    ],
  },
  "Cut In": {
    spell: spell(
      [target.creature("t"), target.upTo(1, yourCreature("r"))],
      [fx.damage(4, ref.target("t")), ...createRole(YOUNG_HERO_ROLE, ref.target("r"))],
    ),
  },
  "Edgewall Pack": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(RAT_NO_BLOCK)], { label: "Un Rat 1/1 qui ne peut pas bloquer" })],
  },
  "Embereth Veteran": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.creature("t", { other: true })],
        effects: createRole(YOUNG_HERO_ROLE),
        label: "Un Rôle Jeune héros sur une autre créature",
      }),
    ],
  },
  "Flick a Coin": {
    spell: spell([target.any()], [fx.damage(1, ref.target()), fx.createTokens(TREASURE), fx.draw(1)]),
  },
  "Food Fight": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        {
          addAbilities: [
            activated({
              mana: "{2}",
              sacrifice: true,
              targets: [target.any()],
              // L'artefact sacrifié inflige les blessures (dernières informations connues).
              effects: [fx.damage(amount.plus(1, amount.count({ name: "Food Fight", controller: "you" })), ref.target())],
              label: "Blessures égales à 1 plus le nombre de Food Fight",
            }),
          ],
        },
        { label: "Vos artefacts : {2}, sacrifice : blessures à n'importe quelle cible" },
      ),
    ],
  },
  "Frantic Firebolt": {
    spell: spell([target.creature()], [fx.damage(amount.plus(2, SPELLY_CARDS), ref.target())]),
  },
  "Gnawing Crescendo": {
    spell: spell(
      [],
      [
        fx.pumpAll(CREATURE_YOU_CONTROL, 2, 0),
        // « Chaque fois qu'une créature non-jeton que vous contrôlez meurt ce tour-ci » : emblème du tour.
        fx.emblem(
          "Gnawing Crescendo",
          'Whenever a nontoken creature you control dies this turn, create a 1/1 black Rat creature token with "This token can\'t block."',
          [
            triggered(when.dies({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(RAT_NO_BLOCK)], {
              label: "Un Rat 1/1 qui ne peut pas bloquer",
            }),
          ],
          false,
          true,
        ),
      ],
    ),
  },
  "Goddric, Cloaked Reveler": {
    abilities: [
      // Le vol, cité dans la phrase, n'est pas un mot-clé imprimé (l'import ne le lit pas) : seulement avec la Célébration.
      staticAbility(
        "self",
        {
          setSubtypes: ["Dragon"],
          setPower: 4,
          setToughness: 4,
          addKeywords: ["flying"],
          addAbilities: [
            activated({
              mana: "{R}",
              effects: [fx.pumpAll({ types: ["Creature"], subtype: "Dragon", controller: "you" }, 1, 0)],
              label: "Vos Dragons gagnent +1/+0",
            }),
          ],
        },
        { condition: CELEBRATION, label: "Célébration : Dragon 4/4 avec le vol" },
      ),
    ],
  },
  "Grabby Giant": {
    abilities: [
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }] } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un artefact ou un terrain : piochez une carte",
      }),
    ],
  },
  "That's Mine": { spell: spell([], [fx.createTokens(TREASURE)]) },
  "Grand Ball Guest": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["trample"] },
        { condition: CELEBRATION, label: "Célébration : +1/+1 et le piétinement" },
      ),
    ],
  },
  "Harried Spearguard": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(RAT_NO_BLOCK)], { label: "Un Rat 1/1 qui ne peut pas bloquer" })],
  },
  "Kindled Heroism": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["firstStrike"]), fx.scry(1)]),
  },
  "Korvold and the Noble Thief": {
    abilities: [
      chapter([1, 2], [fx.createTokens(TREASURE)], { label: "Un jeton Trésor" }),
      chapter([3], [fx.exileTop(ref.target(), 3, "k"), fx.grantPlay(ref.stored("k"))], {
        targets: [target.player("t", "opponent")],
        label: "Exilez les trois cartes du dessus d'un adversaire ; jouables ce tour-ci",
      }),
    ],
  },
  "Merry Bards": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{1}", "Payer {1} pour un Rôle Jeune héros ?", fx.reflexive([yourCreature()], createRole(YOUNG_HERO_ROLE))),
        { label: "Payez {1} : un Rôle Jeune héros sur une de vos créatures" },
      ),
    ],
  },
  "Minecart Daredevil": {},
  "Ride the Rails": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 1)]) },
  "Monstrous Rage": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 0), ...createRole(MONSTER_ROLE)]),
  },
  "Raging Battle Mouse": {
    abilities: [
      costReducer({}, 1, "Le deuxième sort de chaque tour coûte {1} de moins", { condition: cond.castThisTurn(1, false, true) }),
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 1)], {
        condition: CELEBRATION,
        targets: [yourCreature()],
        label: "Célébration : +1/+1 à une de vos créatures",
      }),
    ],
  },
  "Ratcatcher Trainee": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "L'initiative pendant votre tour" },
      ),
    ],
  },
  "Pest Problem": { spell: spell([], [fx.createTokens(RAT_NO_BLOCK, 2)]) },
  "Realm-Scorcher Hellkite": {
    abilities: [
      // « Quatre mana en n'importe quelle combinaison de couleurs » : une couleur choisie pour chaque mana.
      triggered(
        when.entersSelf,
        [1, 2, 3, 4].map(() => fx.addManaChoice(1)),
        {
          condition: cond.kicked,
          label: "Marchandée : quatre mana de n'importe quelles couleurs",
        },
      ),
      activated({
        mana: "{1}{R}",
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "1 blessure à n'importe quelle cible",
      }),
    ],
  },
  "Redcap Thief": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Un jeton Trésor" })],
  },
  "Rotisserie Elemental": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.counters(ref.self, "skewer"),
          fx.sacrifice(ref.you, { self: true }, 1, { optional: true, store: "s" }),
          // X : les marqueurs brochette qu'elle avait en quittant le champ de bataille.
          ...fx.when(cond.v("s"), fx.exileTop(ref.you, amount.lkiCounters("skewer"), "e"), fx.grantPlay(ref.stored("e"))),
        ],
        { label: "Marqueur brochette ; sacrifiez-la pour exiler X cartes jouables ce tour-ci" },
      ),
    ],
  },
  "Stonesplitter Bolt": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [
        ...fx.when(cond.kicked, fx.damage(amount.plus(amount.x, amount.x), ref.target())),
        ...fx.when(cond.not(cond.kicked), fx.damage(amount.x, ref.target())),
      ],
    ),
  },
  "Tattered Ratter": {
    abilities: [
      triggered(when.becomesBlocked({ subtype: "Rat", controller: "you" }), [fx.pump(ref.eventObject, 2, 0)], {
        label: "Le Rat bloqué gagne +2/+0",
      }),
    ],
  },
  "Twisted Fealty": {
    spell: spell(
      [target.creature("t"), target.upTo(1, target.creature("r"))],
      [
        fx.gainControl(ref.target("t")),
        fx.untap(ref.target("t")),
        fx.pump(ref.target("t"), 0, 0, ["haste"]),
        ...createRole(WICKED_ROLE, ref.target("r")),
      ],
    ),
  },
  "Two-Headed Hunter": {},
  "Twice the Rage": { spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["doubleStrike"])]) },
  "Unruly Catapult": {
    abilities: [
      activated({ tap: true, effects: [fx.damage(1, ref.eachOpponent)], label: "1 blessure à chaque adversaire" }),
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.untap(ref.self)], { label: "Se dégage" }),
    ],
  },
  "Virtue of Courage": {
    abilities: [
      triggered(
        when.dealsDamage({}, { noncombatOnly: true, toOpponent: true, anySourceYouControl: true }),
        fx.may(
          "Exiler autant de cartes du dessus de votre bibliothèque ?",
          fx.exileTop(ref.you, amount.eventAmount, "v"),
          fx.grantPlay(ref.stored("v")),
        ),
        { label: "Exilez autant de cartes ; jouables ce tour-ci" },
      ),
    ],
  },
  "Embereth Blaze": { spell: spell([target.any()], [fx.damage(2, ref.target())]) },
  "Witch's Mark": {
    spell: spell([target.upTo(1, yourCreature())], [...mayRummage(2), ...createRole(WICKED_ROLE)]),
  },
  "Witchstalker Frenzy": {
    // {1} de moins pour chaque créature qui a attaqué ce tour-ci (journal du tour).
    costReduction: { generic: amount.turnEvents({ event: "attack" }) },
    spell: spell([target.creature()], [fx.damage(5, ref.target())]),
  },
  "Decadent Dragon": {
    abilities: [triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Un jeton Trésor" })],
  },
  "Expensive Taste": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), 2, "e", "you"), fx.grantPlay(ref.stored("e"), { forever: true })],
    ),
  },
  "Imodane's Recruiter": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0, ["haste"])], {
        label: "Vos créatures gagnent +1/+0 et la célérité",
      }),
    ],
  },
  "Train Troops": { spell: spell([], [fx.createTokens(KNIGHT_VIGILANCE, 2)]) },
  "Picnic Ruiner": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 0, 0, ["doubleStrike"])], {
        condition: cond.ferocious,
        label: "Force 4 ou plus : la double initiative",
      }),
    ],
  },
  "Stolen Goodies": {
    spell: spell([target.between(1, 3, yourCreature())], [fx.countersDivided(3, ref.target())]),
  },
  "Become Brutes": {
    // « Une ou deux créatures ciblées » : deux mots « cible », le second facultatif et distinct du premier.
    spell: spell(
      [target.creature("a"), { ...target.optional(target.creature("b")), otherThan: ["a"] }],
      [
        fx.pump(ref.target("a"), 0, 0, ["haste"]),
        fx.pump(ref.target("b"), 0, 0, ["haste"]),
        ...createRole(MONSTER_ROLE, ref.target("a")),
        ...createRole(MONSTER_ROLE, ref.target("b")),
      ],
    ),
  },
  "Charging Hooligan": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.pump(ref.self, amount.count({ types: ["Creature"], attacking: true }), 0),
          ...fx.when(cond.battlefieldCount({ subtype: "Rat", attacking: true }, 1), fx.pump(ref.self, 0, 0, ["trample"])),
        ],
        { label: "+1/+0 par créature attaquante ; le piétinement si un Rat attaque" },
      ),
    ],
  },
  "Ogre Chitterlord": {
    abilities: [
      triggered(when.entersSelf, chitterlordEffects, { label: "Deux Rats ; cinq Rats ou plus : +2/+0 à vos Rats" }),
      triggered(when.attacksSelf, chitterlordEffects, { label: "Deux Rats ; cinq Rats ou plus : +2/+0 à vos Rats" }),
    ],
  },
};
