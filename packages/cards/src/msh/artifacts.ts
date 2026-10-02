/** Marvel Super Heroes — cartes incolores et terrains. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  mode,
  playerStatic,
  ROBOT_VILLAIN,
  ref,
  SOLDIER,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/** Terrains bicolores « arrive engagé ; en arrivant, vous gagnez 1 PV ». */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "Vous gagnez 1 PV" }),
    manaAbility([a, b]),
  ],
});

/** « {T} : ajoutez {C}. {T} : ajoutez {X} ou {Y}, seulement s'il est arrivé ce tour-ci ou si vous contrôlez un terrain de base. » */
const fastLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    manaAbility("C"),
    manaAbility([a, b], 1, {
      condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
    }),
  ],
});

/** Mana de n'importe quelle couleur, seulement pour un sort ou une capacité d'une source du sous-type. */
const tribalMana = (subtype: string) =>
  manaAbility(ANY_COLOR, 1, { restriction: { spell: { subtype }, abilityOfSource: { subtype } } });

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Artefacts ---------------------------------------------------------------
  "A.I.M. Synthoids": {
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })],
  },
  "Captain America's Shield": {
    // Indestructible et Équiper {2} : lus dans le texte.
    abilities: [
      staticAbility("attached", { toughness: 8, addKeywords: ["vigilance"] }, { label: "+0/+8 et la vigilance" }),
      // Approximation (comme Thunder Lasso) : une créature adverse, pas forcément du joueur défenseur en multijoueur.
      triggered(when.attacks({ types: ["Creature"], attachedToSource: true }), [fx.tap(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature du joueur défenseur",
      }),
    ],
  },
  "Cosmic Cube": {
    // Garde {2} : lue dans le texte.
    abilities: [
      triggered(
        when.attackWith(1),
        [
          // On choisit parmi les six cartes du dessus celle à lancer, le reste va au-dessous. Approximation : la carte
          // choisie est exilée le temps de la lancer (elle est donc vue de tous, même si vous renoncez à la lancer).
          fx.lookAtTop(6, {
            filter: { nonland: true },
            maxManaValue: amount.maxPower({ types: ["Creature"], controller: "you", attacking: true }),
            to: { to: "exile" },
            rest: "bottom",
            store: "c",
          }),
          fx.castNow(ref.stored("c"), { free: true, storeRest: "r" }),
          // Sort refusé : la carte va au-dessous de la bibliothèque, sous les autres.
          fx.moveTo(ref.stored("r"), { to: "libraryBottom" }),
        ],
        { label: "Lancez gratuitement un sort parmi les six cartes du dessus" },
      ),
    ],
  },
  "Dependable Quinjet": {
    // Vol et équipage 4 : lus dans le texte.
    abilities: [manaAbility(ANY_COLOR)],
  },
  "H.E.R.B.I.E. Scout Unit": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield", tapped: true },
            {
              count: 1,
              min: 0,
              prompt: "Vous pouvez mettre une carte de terrain de votre main sur le champ de bataille engagée",
            },
          ),
        ],
        { label: "Piochez, puis vous pouvez mettre un terrain engagé" },
      ),
    ],
  },
  "Iron Man Armor": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-la à une de vos créatures",
      }),
      staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["flying"] }, { label: "+2/+1 et le vol" }),
      activated({
        mana: "{2}",
        effects: fx.when(
          cond.not(cond.sourceMatches({ types: ["Creature"] })),
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Construct", "Hero"],
            setPower: 0,
            setToughness: 0,
            addKeywords: ["flying"],
            addAbilities: [
              staticAbility(
                "self",
                { power: 1, toughness: 1 },
                { per: { types: ["Artifact"], controller: "you" }, label: "+1/+1 par artefact que vous contrôlez" },
              ),
            ],
          }),
        ),
        label: "Devient une créature-artefact Construction Héros 0/0 volante",
      }),
    ],
  },
  "S.H.I.E.L.D. Helicarrier": {
    // Vol et équipage 6 : lus dans le texte.
    abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER, 2)], { label: "Deux Soldats 1/1" })],
  },
  "The Ten Rings": {
    abilities: [
      // Approximation : pas de taille de main maximale (au lieu de dix).
      playerStatic({ noMaxHandSize: true, label: "Taille de main maximale : dix (approximation : aucune)" }),
      triggered(when.yourEndStep, [fx.draw(amount.plus(10, amount.neg(amount.cardsIn("hand"))))], {
        condition: cond.handAtMost(ref.you, 9),
        label: "Piochez jusqu'à dix cartes en main",
      }),
    ],
  },
  "Ultron, Artificial Malevolence": {
    abilities: [
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", nontoken: true, other: true }),
        fx.mayPay(
          "{2}",
          "Payer {2} pour créer un jeton copie de cet artefact ?",
          fx.copyToken(ref.eventObject, { store: "tok" }),
          fx.when(
            cond.not(cond.refMatches(ref.stored("tok"), { types: ["Creature"] })),
            fx.modify(
              ref.stored("tok"),
              { addTypes: ["Creature"], addSubtypes: ["Robot", "Villain"], setPower: 2, setToughness: 2 },
              "permanent",
            ),
          ),
        ),
        { label: "Payez {2} : un jeton copie de l'artefact (créature Robot Méchant 2/2 au besoin)" },
      ),
    ],
  },
  "Ultron Drone": {
    abilities: [
      activated({
        mana: "{6}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2), fx.createTokens(ROBOT_VILLAIN)],
        label: "Montée en puissance : deux marqueurs +1/+1 et un Robot Méchant 2/2",
      }),
    ],
  },
  "Vibranium Energy Daggers": {
    // Indestructible et Équiper {3} : lus dans le texte.
    abilities: [staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" })],
  },
  "The Vision": {
    // Vol et vigilance : lus dans le texte.
    abilities: [
      triggeredModal(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [
          mode("Rayon solaire : double initiative", [], [fx.pump(ref.self, 0, 0, ["doubleStrike"])]),
          mode("Contrôle de densité : indestructible", [], [fx.pump(ref.self, 0, 0, ["indestructible"])]),
          mode("Technopathie : piochez une carte", [], [fx.draw(1)]),
        ],
        { uniqueModes: "turn", label: "Un mode pas encore choisi ce tour-ci" },
      ),
    ],
  },
  "Viv Vision, Teen Synthezoid": {
    // Vol : lu dans le texte.
    abilities: [
      triggered(when.attacksSelf, fx.when(cond.sourceMatches({ minPower: 4 }), fx.draw(1)), {
        label: "Sens cybernétiques : piochez si sa force est d'au moins 4",
      }),
      activated({
        mana: "{7}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Montée en puissance : deux marqueurs +1/+1",
      }),
    ],
  },

  // --- Terrains ----------------------------------------------------------------
  "A.I.M. Labs": gainLand("U", "B"),
  "Asgardian Citadel": gainLand("R", "W"),
  "Avengers Hangar": gainLand("W", "U"),
  "Avengers Tower": {
    abilities: [
      manaAbility("C"),
      tribalMana("Hero"),
      activated({
        mana: "{4}",
        tap: true,
        // « Dans l'ordre de votre choix » : le reste va au-dessous dans un ordre aléatoire.
        effects: [fx.lookAtTop(3, { filter: { subtype: "Hero" }, rest: "bottom" })],
        label: "Regardez les trois cartes du dessus : une carte de Héros en main",
      }),
    ],
  },
  "Baxter Building": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        // « Quatre mana en n'importe quelle combinaison de couleurs » : une couleur choisie pour chaque mana.
        effects: [1, 2, 3, 4].map(() => fx.addManaChoice(1)),
        label: "Quatre mana de n'importe quelles couleurs",
      }),
      activated({
        mana: "{4}",
        tap: true,
        activationCondition: cond.controls({ types: ["Creature"], minToughness: 4 }),
        effects: [fx.draw(1)],
        label: "Piochez une carte (créature d'endurance 4 ou plus)",
      }),
    ],
  },
  "Birnin Zana Plaza": gainLand("G", "W"),
  "Dark Fortress": fastLand("B", "R"),
  "Fisk Tower": gainLand("W", "B"),
  "Gathering Place": fastLand("G", "W"),
  "Hell's Kitchen": gainLand("B", "R"),
  "Los Diablos Missile Base": gainLand("R", "G"),
  "Pym Technologies": gainLand("G", "U"),
  "Stark Industries": gainLand("U", "R"),
  "Subterranean Cavern": gainLand("B", "G"),
  "Surveillance Room": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveillance 1" }),
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "Un mana de n'importe quelle couleur" }),
    ],
  },
  "Training Compound": fastLand("R", "G"),
  "Villainous Hideout": {
    abilities: [
      manaAbility("C"),
      tribalMana("Villain"),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", subtype: "Villain" })],
        effects: [fx.connive(ref.target())],
        label: "Un de vos Méchants complote",
      }),
    ],
  },
  // Improvisation : lue dans le texte.
  "Arc Reactor": {
    abilities: [entersWith({ tapped: true }), manaAbility("C", 3)],
  },
};
