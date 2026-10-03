/**
 * Teenage Mutant Ninja Turtles — cartes multicolores (lot A). Le faufilement (Sneak), le vol, le piétinement, la
 * vigilance, la menace, le contact mortel, la célérité et la garde sont lus dans le texte. Alliance et Disparition sont
 * des mots de capacité : déclencheurs et conditions ordinaires.
 */
import type { Effect, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  entersWith,
  FOOD,
  fx,
  MUTAGEN,
  modal,
  mode,
  NINJA,
  playerStatic,
  ROBOT_1,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };

/** Disparition : un permanent a quitté le champ de bataille sous votre contrôle ce tour-ci. */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);

/** Alliance : « chaque fois qu'une autre créature arrive sous votre contrôle ». */
const ALLIANCE = when.enters({ ...YOUR_CREATURES, other: true });

/** « Sacrifiez un permanent à moins de défausser une carte » : la défausse est proposée d'abord. */
const SACRIFICE_UNLESS_DISCARD: Effect[] = [
  fx.discard(1, ref.you, { optional: true, store: "d" }),
  ...fx.when(cond.not(cond.v("d")), fx.sacrifice(ref.you, {})),
];

/** « Exilez [la cible], puis renvoyez-la sur le champ de bataille sous le contrôle de son propriétaire. » */
const flicker = (id: string): Effect[] => [
  fx.exileCard(ref.target(id), { name: `${id}Exiled` }),
  fx.toBattlefield(ref.stored(`${id}Exiled`)),
];

/** Brilliance Unleashed : une carte d'artefact de votre cimetière revient ; si ce n'est pas une créature, Robot 3/3 volant. */
const REANIMATE_ARTIFACT: Effect[] = [
  ...fx.when(
    cond.not(cond.refMatches(ref.target("a"), { types: ["Creature"] })),
    fx.moveTo(
      ref.target("a"),
      { to: "battlefield", setTypes: ["Artifact", "Creature"], setSubtypes: ["Robot"], addKeywords: ["flying"] },
      { name: "robot" },
    ),
    fx.modify(ref.stored("robot"), { setPower: 3, setToughness: 3 }, "permanent"),
  ),
  // Déjà revenue si ce n'était pas une créature : l'identifiant du cimetière ne désigne plus rien.
  ...fx.when(cond.refMatches(ref.target("a"), { types: ["Creature"] }), fx.toBattlefield(ref.target("a"))),
];
const BRILLIANCE_DAMAGE = target.creature("d");
const BRILLIANCE_ARTIFACT = target.cardInGraveyard("a", { types: ["Artifact"] }, "you", "carte d'artefact de votre cimetière");

/** Go Ninja Go. */
const GO_FLICKER = target.creature("f", { controller: "you" });
const GO_DAMAGE = target.creature("d", { controller: "opponent" });
const GREATEST_POWER = amount.maxPower(YOUR_CREATURES);

/** Krang & Shredder : chaque adversaire exile jusqu'à une carte non-terrain, liée à Krang & Shredder. */
const KRANG_EXILE: Effect[] = [
  { op: "exileUntil", filter: { notTypes: ["Land"] }, store: "k", who: ref.eachOpponent },
  fx.link(ref.stored("k")),
];

export const MULTI: Record<string, CardScript> = {
  "Baxter Stockman": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT_1)], { label: "Un Robot 1/1" }),
      triggered(when.yourCombat, [fx.pump(ref.target(), 3, 0, ["firstStrike", "vigilance"])], {
        targets: [
          target.permanent("t", ["Creature"], { controller: "you", anyOf: [{ types: ["Artifact"] }] }, "créature-artefact"),
        ],
        label: "+3/+0, l'initiative et la vigilance à une créature-artefact",
      }),
    ],
  },
  "Bebop & Rocksteady": {
    abilities: [
      triggered(when.attacksSelf, SACRIFICE_UNLESS_DISCARD, { label: "Sacrifiez un permanent à moins de défausser" }),
      triggered(when.blocks("self"), SACRIFICE_UNLESS_DISCARD, { label: "Sacrifiez un permanent à moins de défausser" }),
    ],
  },
  "Brilliance Unleashed": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode("5 blessures à une créature", [BRILLIANCE_DAMAGE], [fx.damage(5, ref.target("d"))]),
      mode("Un artefact de votre cimetière revient", [BRILLIANCE_ARTIFACT], REANIMATE_ARTIFACT),
      mode("Les deux", [BRILLIANCE_DAMAGE, BRILLIANCE_ARTIFACT], [fx.damage(5, ref.target("d")), ...REANIMATE_ARTIFACT]),
    ),
  },
  "Dark Leo & Shredder": {
    // Faufilement {W}{B} : lu dans le texte.
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Ninja", attacking: true, controller: "you" },
        { addKeywords: ["deathtouch"] },
        { label: "Vos Ninjas attaquants ont le contact mortel" },
      ),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.createTokens(NINJA),
          ...fx.when(cond.controls({ subtype: "Ninja" }, 5), fx.loseLife(amount.halfLife(ref.eventPlayer), ref.eventPlayer)),
        ],
        { label: "Un Ninja 1/1 ; cinq Ninjas : ce joueur perd la moitié de ses PV" },
      ),
    ],
  },
  "Don & Leo, Problem Solvers": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.exileCard(ref.target("a"), { name: "xa" }),
          fx.exileCard(ref.target("c"), { name: "xc" }),
          fx.toBattlefield(ref.union(ref.stored("xa"), ref.stored("xc"))),
        ],
        {
          targets: [
            target.upTo(1, target.permanent("a", ["Artifact"], { controller: "you" }, "artefact que vous contrôlez")),
            target.upTo(1, target.creature("c", { controller: "you" })),
          ],
          label: "Exile puis renvoie un artefact et une créature",
        },
      ),
    ],
  },
  "EPF Point Squad": {
    abilities: [triggered(ALLIANCE, [fx.addCounters(ref.self, 1)], { label: "Alliance — un marqueur +1/+1" })],
  },
  "Foot Elite": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 1, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+0 et l'indestructible à une autre créature",
      }),
    ],
  },
  "Foot Ninjas": {
    // Faufilement {3}{W/B} : lu dans le texte.
    abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "Vous gagnez 3 PV" })],
  },
  "Genghis Frog": {
    abilities: [
      triggered(when.enters({ controller: "you", anyOf: [{ self: true }, { subtype: "Mutant" }] }), [fx.createTokens(MUTAGEN)], {
        label: "Un Mutagène",
      }),
    ],
  },
  "Go Ninja Go": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode("Exile puis renvoie une de vos créatures", [GO_FLICKER], flicker("f")),
      mode("Blessures égales à votre plus grande force", [GO_DAMAGE], [fx.damage(GREATEST_POWER, ref.target("d"))]),
      mode("Les deux", [GO_FLICKER, GO_DAMAGE], [...flicker("f"), fx.damage(GREATEST_POWER, ref.target("d"))]),
    ),
  },
  "Ice Cream Kitty": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { other: true, anyOf: [{ types: ["Creature"] }, { token: true }] } },
        sorcerySpeed: true,
        effects: [fx.draw(1)],
        label: "Sacrifiez une autre créature ou un jeton : piochez",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Vous gagnez 3 PV" }),
    ],
  },
  "Karai, Future of the Foot": {
    // Faufilement {2}{W}{B} : lu dans le texte. « Si son coût de faufilement a été payé ce tour-ci » : lancée ainsi et
    // arrivée ce tour-ci.
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          ...fx.when(
            cond.all(cond.castVia("sneak"), cond.sourceMatches({ enteredThisTurn: true })),
            fx.toBattlefield(ref.target()),
          ),
          ...fx.when(
            cond.not(cond.all(cond.castVia("sneak"), cond.sourceMatches({ enteredThisTurn: true }))),
            fx.toHand(ref.target()),
          ),
        ],
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
          label: "Une créature de votre cimetière en main (sur le champ de bataille si faufilée)",
        },
      ),
    ],
  },
  "Karai's Technique": {
    // Faufilement {W}{B} : lu dans le texte. « Choisissez l'un ou les deux. »
    spell: modal(
      mode("+3/+3", [target.creature("p")], [fx.pump(ref.target("p"), 3, 3)]),
      mode("-3/-3", [target.creature("m")], [fx.pump(ref.target("m"), -3, -3)]),
      mode(
        "Les deux",
        [target.creature("p"), target.creature("m")],
        [fx.pump(ref.target("p"), 3, 3), fx.pump(ref.target("m"), -3, -3)],
      ),
    ),
  },
  "Krang & Shredder": {
    abilities: [
      triggered(when.entersSelf, KRANG_EXILE, { label: "Chaque adversaire exile jusqu'à une carte non-terrain" }),
      triggered(when.attacksSelf, KRANG_EXILE, { label: "Chaque adversaire exile jusqu'à une carte non-terrain" }),
      triggered(when.yourEndStep, [fx.castNow(ref.linked, { free: true })], {
        condition: DISAPPEAR,
        label: "Disparition — lancez sans payer une carte exilée avec Krang & Shredder",
      }),
    ],
  },
  "The Last Ronin": {
    abilities: [
      chapter([1], [fx.destroyAll({ types: ["Creature"] })], { label: "Chapitre I — Détruisez toutes les créatures" }),
      chapter(
        [2],
        [
          fx.mill(4, ref.you, { name: "m" }),
          ...fx.when(
            cond.v("m"),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        { label: "Chapitre II — Meulez quatre cartes, puis une créature de votre cimetière en main" },
      ),
      chapter(
        [3],
        [
          // Capacité déclenchée « ce tour-ci » : un emblème qui disparaît à la fin du tour.
          fx.emblem(
            "The Last Ronin",
            "Ce tour-ci, chaque fois qu'une créature que vous contrôlez attaque seule, mettez trois marqueurs +1/+1 sur elle ; elle gagne le piétinement, le lien de vie et l'indestructible jusqu'à la fin du tour.",
            [
              triggered(
                when.attacksAlone(YOUR_CREATURES),
                [fx.addCounters(ref.eventObject, 3), fx.pump(ref.eventObject, 0, 0, ["trample", "lifelink", "indestructible"])],
                { label: "Trois marqueurs +1/+1, piétinement, lien de vie et indestructible" },
              ),
            ],
            false,
            true,
          ),
        ],
        { label: "Chapitre III — Ce tour-ci, une créature qui attaque seule grandit" },
      ),
    ],
  },
  "Lessons from Life": {
    spell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          { count: 1, min: 0, prompt: "Vous pouvez mettre un terrain de votre main sur le champ de bataille, engagé" },
        ),
      ],
    ),
  },
  "Mechanized Ninja Cavalry": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ROBOT_1)], { label: "Un Robot 1/1" })],
  },
  "Mikey & Leo, Chaos & Order": {
    abilities: [
      triggered(when.youPutCounters(YOUR_CREATURES), [fx.draw(1)], {
        oncePerTurn: true,
        label: "Piochez une carte (une fois par tour)",
      }),
    ],
  },
  "Mouser Mark III": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack"] },
        {
          condition: cond.not(cond.controls({ types: ["Artifact"], other: true })),
          label: "N'attaque que si vous contrôlez un autre artefact",
        },
      ),
    ],
  },
  "The Neutrinos": {
    abilities: [
      triggered(ALLIANCE, [fx.pump(ref.self, 1, 0)], { label: "Alliance — +1/+0 jusqu'à la fin du tour" }),
      // « Une créature que vous possédez » : approchée par une créature que vous contrôlez et possédez.
      triggered(
        when.attacksSelf,
        [
          fx.exileCard(ref.target(), { name: "n" }),
          fx.toBattlefield(ref.stored("n"), { underYourControl: true, tapped: true, attacking: true }),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", not: { notOwned: true } }))],
          label: "Exile puis renvoie une de vos créatures, engagée et attaquante",
        },
      ),
    ],
  },
  Nobody: {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target()), fx.scry(1)], {
        targets: [
          target.upTo(
            1,
            target.permanent("t", ["Artifact"], { controller: "you", other: true }, "autre artefact que vous contrôlez"),
          ),
        ],
        label: "Renvoie un autre de vos artefacts en main, regard 1",
      }),
    ],
  },
  "Pizza Face, Gastromancer": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Une Nourriture" }),
      triggered(
        when.yourEndStep,
        [
          fx.addCounters(ref.target(), 3),
          ...fx.when(
            cond.not(cond.refMatches(ref.target(), { types: ["Creature"] })),
            fx.modify(
              ref.target(),
              { addTypes: ["Creature"], addSubtypes: ["Mutant"], setPower: 0, setToughness: 0 },
              "permanent",
            ),
          ),
        ],
        {
          condition: DISAPPEAR,
          targets: [
            target.upTo(1, target.permanent("t", ["Artifact", "Creature"], { other: true }, "autre artefact ou créature")),
          ],
          label: "Disparition — trois marqueurs +1/+1 ; un artefact devient un Mutant 0/0",
        },
      ),
      activated({ mana: "{10}", tap: true, sacrifice: true, effects: [fx.gainLife(15)], label: "Vous gagnez 15 PV" }),
    ],
  },
  "Putrid Pals": {
    abilities: [entersWith({ counters: 2, condition: DISAPPEAR, label: "Disparition — arrive avec deux marqueurs +1/+1" })],
  },
  "Raph & Leo, Sibling Rivals": {
    abilities: [
      triggered(when.attacksSelf, [fx.untap(ref.target()), fx.extraCombat], {
        condition: cond.firstCombat,
        targets: [target.between(1, 2, target.creature("t", { attacking: true }))],
        label: "Dégage une ou deux créatures attaquantes ; une phase de combat supplémentaire",
      }),
    ],
  },
  "Raph & Mikey, Troublemakers": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.revealUntil({ types: ["Creature"] }, { to: "battlefield", tapped: true, attacking: true })],
        { label: "Révélez jusqu'à une créature : elle arrive engagée et attaquante" },
      ),
    ],
  },
  "Slithering Cryptid": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "Un Mutagène" })],
  },
  "Splinter, Radical Rat": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { types: ["Creature"], subtype: "Ninja", controller: "you" } },
        label: "Les capacités déclenchées de vos Ninjas se déclenchent une fois de plus",
      }),
      activated({
        mana: "{1}{U}",
        targets: [target.permanent("t", ["Creature"], { subtype: "Ninja" }, "Ninja")],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Un Ninja ne peut pas être bloqué ce tour-ci",
      }),
    ],
  },
  "Tainted Treats": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [
        fx.destroy(ref.target()),
        // Valeur de mana d'après ses dernières informations connues.
        ...fx.when(cond.refMatches(ref.target(), { maxManaValue: 4 }), fx.createTokens(FOOD)),
      ],
    ),
  },
  "Tokka & Rahzar, Terrible Twos": {
    cantBeCountered: true,
    abilities: [
      triggered(when.castSpell("any", { manaSpentBelowValue: true }), [fx.damage(3, ref.eventPlayer)], {
        label: "3 blessures au joueur qui a dépensé moins que la valeur de mana",
      }),
    ],
  },
};
