/**
 * Marvel Super Heroes — cartes noires (lot A). Le vol, le contact mortel, la menace, le lien de vie, le flash, le
 * faufilement, le travail d'équipe, l'équipement et le cycle de terrain de base sont lus dans le texte.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  costReducer,
  entersWith,
  fx,
  manaAbility,
  modal,
  mode,
  ROBOT_VILLAIN,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  VILLAIN,
  WALL_C,
  when,
} from "./common";

/** « Chaque fois qu'un autre Méchant que vous contrôlez arrive ». */
const ANOTHER_VILLAIN_ENTERS = when.enters({ subtype: "Villain", controller: "you", other: true });
/** « deux cartes de créature ou plus dans votre cimetière ». */
const TWO_CREATURE_CARDS = cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 2);
const CREATURE_CARD = target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière");

export const BLACK: Record<string, CardScript> = {
  "Agents of HYDRA": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(VILLAIN)], { label: "Un Méchant 2/1 avec la menace" })],
  },
  "Arnim Zola, Bio-Fanatic": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: TWO_CREATURE_CARDS,
        effects: [fx.createTappedTokens(VILLAIN)],
        label: "Un Méchant 2/1 engagé (deux cartes de créature au cimetière)",
      }),
    ],
  },
  "Baron Strucker, HYDRA Overlord": {
    abilities: [
      costReducer({ subtype: "Villain" }, 1, "Sorts de Méchant : {1} de moins"),
      // Approximation : « une seule fois par tour » consomme le déclenchement même si vous refusez la connivence.
      triggered(ANOTHER_VILLAIN_ENTERS, fx.may("Faire comploter ce Méchant ?", fx.connive(ref.eventObject)), {
        oncePerTurn: true,
        label: "Le Méchant arrivé peut comploter (une fois par tour)",
      }),
    ],
  },
  "Construct a Cosmic Cube": {
    abilities: [
      triggered(when.draw(2), [fx.createTokens(VILLAIN), fx.counters(ref.self, "plan")], {
        label: "Deuxième carte piochée : un Méchant 2/1 et un marqueur de plan",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [fx.sacrificeIt(ref.self), fx.reflexive([target.player("o", "opponent")], [fx.controlNextTurn(ref.target("o"))])],
        {
          condition: cond.counterAtLeast("plan", 7),
          label: "Septième marqueur : sacrifiez-le ; vous contrôlez un adversaire pendant son prochain tour",
        },
      ),
    ],
  },
  "Crossbones, Malicious Mercenary": {
    abilities: [
      triggered(ANOTHER_VILLAIN_ENTERS, [fx.addCounters(ref.self, 1), fx.damage(2, ref.eachOpponent)], {
        oncePerTurn: true,
        label: "Un marqueur +1/+1, 2 blessures à chaque adversaire (une fois par tour)",
      }),
    ],
  },
  "Cruel Alliance": {
    // Travail d'équipe payé : la cible peut être n'importe quelle créature, et vous gagnez 3 PV.
    spell: spell(
      [{ ...target.creature("t", { maxManaValue: 3 }), kickedFilter: { objects: { types: ["Creature"] } } }],
      [fx.exile(ref.target()), ...fx.when(cond.kicked, fx.gainLife(3))],
    ),
  },
  "Dark Deed": { spell: spell([target.creature()], [fx.pump(ref.target(), -4, -4)]) },
  "Decoy Ploy": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode(
        "Un Méchant de votre cimetière en main",
        [target.cardInGraveyard("v", { subtype: "Villain" }, "you", "carte de Méchant de votre cimetière")],
        [fx.toHand(ref.target("v"))],
      ),
      mode(
        "Un Héros de votre cimetière en main",
        [target.cardInGraveyard("h", { subtype: "Hero" }, "you", "carte de Héros de votre cimetière")],
        [fx.toHand(ref.target("h"))],
      ),
      mode(
        "Les deux",
        [
          target.cardInGraveyard("v", { subtype: "Villain" }, "you", "carte de Méchant de votre cimetière"),
          target.cardInGraveyard("h", { subtype: "Hero" }, "you", "carte de Héros de votre cimetière"),
        ],
        [fx.toHand(ref.target("v")), fx.toHand(ref.target("h"))],
      ),
    ),
  },
  "Doom Reigns Supreme": {
    abilities: [
      triggered(when.enters({ subtype: "Villain", controller: "you" }), [...fx.drain(1), fx.counters(ref.self, "plan")], {
        label: "Chaque adversaire perd 1 PV, vous gagnez 1 PV ; un marqueur de plan",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrificeIt(ref.self),
          fx.reflexive(
            [target.player("o", "opponent")],
            [
              fx.exileTop(ref.target("o"), 5, "d"),
              // « Jusqu'à deux sorts » : un premier, puis un second parmi les cartes restantes.
              fx.castNow(ref.stored("d"), { free: true, storeRest: "r" }),
              fx.castNow(ref.stored("r"), { free: true }),
            ],
          ),
        ],
        {
          condition: cond.counterAtLeast("plan", 5),
          label: "Cinquième marqueur : sacrifiez-le ; un adversaire exile cinq cartes, lancez-en jusqu'à deux gratuitement",
        },
      ),
    ],
  },
  "Elektra, Daughter of the Hand": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxPower: 3 })],
        label: "Détruit une créature adverse de force 3 ou moins",
      }),
    ],
  },
  "Grim Reaper, Lethal Legionnaire": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{3}{B}",
          "Payer {3}{B} pour renvoyer une créature de votre cimetière ?",
          fx.reflexive(
            [CREATURE_CARD],
            [
              fx.toBattlefield(ref.target(), {
                tapped: true,
                attacking: true,
                counters: { kind: "finality", n: 1 },
              }),
            ],
          ),
        ),
        { label: "Payez {3}{B} : une créature du cimetière revient engagée et attaquante (marqueur de finalité)" },
      ),
    ],
  },
  "Hour of Defeat": { spell: spell([target.creature()], [fx.destroy(ref.target()), fx.surveil(1)]) },
  "HYDRA Infiltration": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.target("o"))], {
        targets: [target.player("o", "opponent")],
        label: "Un adversaire défausse deux cartes",
      }),
      triggered(
        when.attacksAlone({ types: ["Creature"], controller: "you" }),
        [fx.loseLife(1, ref.target("o")), fx.gainLife(1)],
        { targets: [target.player("o", "opponent")], label: "Attaque seule : un adversaire perd 1 PV, vous gagnez 1 PV" },
      ),
    ],
  },
  "HYDRA Troopers": {
    abilities: [
      triggered(
        when.entersSelf,
        [...fx.when(TWO_CREATURE_CARDS, fx.createTappedTokens(VILLAIN)), ...fx.when(cond.not(TWO_CREATURE_CARDS), fx.mill(2))],
        { label: "Un Méchant engagé (deux cartes de créature au cimetière), sinon meulez deux cartes" },
      ),
    ],
  },
  "Kingpin's Enforcers": {
    abilities: [
      activated({
        mana: "{2}{B}",
        sacrificeOther: { filter: { types: ["Artifact", "Creature"] } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un artefact ou une créature : piochez",
      }),
    ],
  },
  "Madame Masque": {
    abilities: [
      triggered(when.entersSelf, [fx.connive(ref.self)], { label: "Complote" }),
      triggered(when.draw(2), [fx.createTokens(VILLAIN)], { label: "Deuxième carte piochée : un Méchant 2/1" }),
    ],
  },
  "The Masters of Evil": {
    abilities: [
      staticAbility(
        { subtype: "Villain", controller: "you", other: true },
        { power: 2, toughness: 1 },
        {
          label: "Les autres Méchants que vous contrôlez ont +2/+1",
        },
      ),
      activated({
        mana: "{1}{B}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.search({ subtype: "Plan" })],
        label: "Défaussez-la : cherchez une carte de Plan",
      }),
    ],
  },
  "Moonstone, Harsh Mistress": {
    abilities: [
      triggered(
        when.discard("you"),
        fx.may(
          "Exiler la carte défaussée (jouable jusqu'à la fin de votre prochain tour) ?",
          fx.exileCard(ref.eventObject, { name: "m" }),
          fx.grantPlay(ref.stored("m"), { untilYourNextTurn: true }),
        ),
        { label: "Exile la carte défaussée : jouable jusqu'à la fin de votre prochain tour" },
      ),
    ],
  },
  "Ninja of the Hand": {
    abilities: [
      activated({
        mana: "{4}{B}",
        powerUp: true,
        effects: [fx.discard(1, ref.eachOpponent), fx.addCounters(ref.self, 1)],
        label: "Montée en puissance : chaque adversaire défausse, un marqueur +1/+1",
      }),
    ],
  },
  "Project Deathlok Soldier": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Revient du cimetière en main",
      }),
    ],
  },
  "Red Room Recruit": {
    abilities: [triggered(when.entersSelf, [fx.connive(ref.self)], { label: "Complote" })],
  },
  "Robot Domination": {
    abilities: [
      triggered(
        when.zoneChange(["battlefield", "hand", "library", "exile", "stack"], {
          to: ["graveyard"],
          whose: "you",
          filter: { types: ["Creature"] },
        }),
        [fx.draw(1), fx.loseLife(1), fx.counters(ref.self, "plan")],
        {
          // « cartes de créature » : un jeton mis au cimetière ne compte pas.
          condition: cond.eventObjectMatches({ nontoken: true }),
          batched: true,
          label: "Piochez, perdez 1 PV, un marqueur de plan",
        },
      ),
      triggered(when.countersPut("self", "plan"), [fx.sacrificeIt(ref.self), fx.createTokens(ROBOT_VILLAIN, 3)], {
        condition: cond.counterAtLeast("plan", 3),
        label: "Troisième marqueur : sacrifiez-le, trois Robots Méchants 2/2",
      }),
    ],
  },
  "Ronin, Shadow Stalker": {
    abilities: [
      // Approximation : le mana paie aussi les autres capacités des Équipements, pas seulement « Équiper ».
      manaAbility(["W", "U", "B", "R", "G"], 2, {
        noTap: true,
        payLife: 2,
        oncePerTurn: true,
        restriction: { spell: { subtype: "Equipment" }, abilityOfSource: { subtype: "Equipment" } },
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Equipment", attachedToSelf: true } },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -4, -4)],
        label: "Sacrifiez un Équipement attaché : −4/−4",
      }),
    ],
  },
  "Roxxon Brutes": {
    abilities: [
      triggered(when.draw(2), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Deuxième carte piochée : un marqueur +1/+1",
      }),
    ],
  },
  "Stolen Stark Tech": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "S'attache à une de vos créatures, qui gagne l'indestructible",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Super-Skrull": {
    abilities: [
      activated({ mana: "{2}{W}", effects: [fx.createTokens(WALL_C)], label: "Un Mur 0/4 avec le défenseur" }),
      activated({ mana: "{3}{G}", effects: [fx.pump(ref.self, 4, 4)], label: "+4/+4" }),
      activated({
        mana: "{4}{R}",
        targets: [target.creature()],
        effects: [fx.damage(4, ref.target())],
        label: "4 blessures à une créature",
      }),
      activated({
        mana: "{5}{U}",
        targets: [target.player()],
        effects: [fx.draw(4, ref.target())],
        label: "Un joueur pioche quatre cartes",
      }),
    ],
  },
  "Swordsman, Sharp Scoundrel": {
    abilities: [
      triggered(ANOTHER_VILLAIN_ENTERS, [fx.attach(ref.target("c"), ref.target("e"))], {
        targets: [
          target.upTo(1, target.permanent("e", ["Artifact"], { subtype: "Equipment", controller: "you" }, "Équipement")),
          target.creature("c", { controller: "you" }),
        ],
        label: "Attache un Équipement à une de vos créatures",
      }),
      triggered(when.attacks({ types: ["Creature"], controller: "you", equipped: true }), [fx.connive(ref.eventObject)], {
        label: "La créature équipée qui attaque complote",
      }),
    ],
  },
  "Thunderbolts Conspiracy": {
    abilities: [
      triggered(
        when.dies({ subtype: "Villain", controller: "you" }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "finality", n: 1 }, addSubtypes: ["Hero"] })],
        { label: "Le Méchant revient avec un marqueur de finalité ; c'est aussi un Héros" },
      ),
    ],
  },
  "Too Evil to Stay Dead": {
    // Travail d'équipe payé : n'importe quelle carte de créature de votre cimetière.
    spell: spell(
      [
        {
          ...target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 4 }, "you", "carte de créature de VM 4 ou moins"),
          kickedFilter: { cards: { filter: { types: ["Creature"] }, whose: "you" } },
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Unliving Legionnaire": {
    abilities: [
      activated({
        mana: "{5}{B}{B}",
        powerUp: true,
        targets: [target.upTo(1, CREATURE_CARD)],
        effects: [fx.toHand(ref.target()), fx.addCounters(ref.self, 2)],
        label: "Montée en puissance : une créature du cimetière en main, deux marqueurs +1/+1",
      }),
    ],
  },
  "Visions of Villainy": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Villain" }) },
    spell: spell([], [fx.draw(2), fx.loseLife(2)]),
  },
  "Whiplash, Vengeful Engineer": {
    abilities: [
      entersWith({ tapped: true, label: "Arrive engagé" }),
      triggered(when.attacksSelf, fx.drain(amount.count({ subtype: "Equipment", attachedToSelf: true })), {
        condition: cond.sourceMatches({ equipped: true }),
        label: "Équipé : chaque adversaire perd X PV, vous gagnez X PV (X : Équipements attachés)",
      }),
    ],
  },
  "Widow's Bite": {
    // Travail d'équipe 3 payé : les deux modes. Approximation : avec le travail d'équipe, un seul mode reste permis.
    spell: modal(
      mode("Contact mortel", [target.creature("a")], [fx.pump(ref.target("a"), 0, 0, ["deathtouch"])]),
      mode("−2/−2", [target.creature("b")], [fx.pump(ref.target("b"), -2, -2)]),
      {
        ...mode(
          "Les deux (travail d'équipe)",
          [target.creature("a"), target.creature("b")],
          [fx.pump(ref.target("a"), 0, 0, ["deathtouch"]), fx.pump(ref.target("b"), -2, -2)],
        ),
        condition: cond.kicked,
      },
    ),
  },
  "Yellowjacket, Heartless Marauder": {
    abilities: [
      triggered(ANOTHER_VILLAIN_ENTERS, [fx.pump(ref.self, 1, 0, ["lifelink"])], {
        label: "+1/+0 et le lien de vie",
      }),
    ],
  },
};
