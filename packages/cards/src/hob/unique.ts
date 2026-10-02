/** The Hobbit — cartes uniques (lot C). */
import {
  activated,
  amount,
  type CardScript,
  FOOD,
  fx,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

export const UNIQUE: Record<string, CardScript> = {
  "Elrond, Moon-Reader": {
    abilities: [
      triggered({ on: "activateAbility", source: { types: ["Creature"] } }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "Vous activez une capacité d'une créature : piochez une carte (une fois par tour)",
      }),
      activated({
        mana: "{5}{U}{U}",
        targets: [target.upTo(2, target.nonland("t", { controller: "you", other: true }, "autre permanent non-terrain à vous"))],
        effects: [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
        ],
        label: "Exilez jusqu'à deux de vos autres permanents non-terrain ; ils reviennent à la prochaine étape de fin",
      }),
    ],
  },
  "Master's Councillors": {
    // Vigilance : lue dans le texte.
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        {
          perAmount: amount.graveyardsWithAtLeast(7),
          label: "+2/+0 pour chaque cimetière de sept cartes ou plus",
        },
      ),
      triggered(when.draw(2), [fx.mill(3, ref.target())], {
        targets: [target.player("t")],
        label: "Votre deuxième carte piochée du tour : le joueur ciblé meule trois cartes",
      }),
    ],
  },
  "Thranduil's Decree": {
    spell: spell(
      [target.spell("t", {}, "sort")],
      [
        { op: "counter", what: ref.target(), exilePermanents: true, storeMoved: "d" },
        fx.grantPlay(ref.stored("d"), { free: true, forever: true }),
      ],
    ),
  },
  "Inside Information": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), amount.x, "e"), fx.grantPlay(ref.stored("e"), { payLifeManaValue: true })],
    ),
  },
  "The Master of Lake-town": {
    // Contact mortel : lu dans le texte.
    abilities: [
      triggered(when.loseLife("any"), [fx.mill(amount.eventAmount, ref.eventPlayer)], {
        label: "Un joueur perd des PV : il meule autant de cartes",
      }),
      triggered(when.diesSelf, [fx.draw(amount.graveyardsWithAtLeast(7))], {
        label: "Piochez une carte par cimetière de sept cartes ou plus",
      }),
    ],
  },
  "Supper for Spiders": {
    spell: spell(
      [],
      [
        fx.moveAll(
          "graveyard",
          ref.eachOpponent,
          { types: ["Creature"], fromBattlefieldThisTurn: true },
          { to: "battlefield", underYourControl: true, setTypes: ["Artifact"], setSubtypes: ["Food"] },
          "f",
        ),
        fx.modify(ref.stored("f"), { addAbilities: FOOD.abilities }, "permanent"),
      ],
    ),
  },
  "Getaway Barrel": {
    abilities: [
      triggered(
        when.putIntoGraveyardSelf,
        [
          fx.lookAtTop(13, {
            filter: { types: ["Creature"] },
            count: 1,
            exact: true,
            random: true,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "Révélez les treize cartes du dessus : une carte de créature au hasard sur le champ de bataille" },
      ),
    ],
  },
  "Dwalin, Weaponmaster": {
    // Initiative : lue dans le texte.
    abilities: [when.entersSelf, when.attacksSelf].map((trigger) =>
      triggered(trigger, [fx.addCountersAll({ subtype: "Equipment", controller: "you" }, 1, "hone")], {
        label: "Un marqueur d'affûtage sur chacun de vos Équipements",
      }),
    ),
  },
  "Smaug, Wicked Worm": {
    // Vol : lu dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTappedTokens(TREASURE, amount.count({ types: ["Artifact"], controller: "opponent" }))],
        {
          label: "Un Trésor engagé par artefact adverse",
        },
      ),
      triggered({ on: "castSpell", by: "you", usingManaFrom: { subtype: "Treasure" } }, [fx.draw(1), fx.loseLife(1)], {
        label: "Sort payé avec le mana d'un Trésor : piochez une carte et perdez 1 PV",
      }),
    ],
  },
  "Thranduil, the Elvenking": {
    abilities: [
      staticAbility(
        "self",
        { gainActivatedFromGraveyard: { subtype: "Elf" } },
        {
          label: "Les capacités activées des cartes d'Elfe de votre cimetière",
        },
      ),
      triggered(when.enters({ subtype: "Elf", legendary: true, controller: "you", other: true }), [fx.draw(2), fx.discard(1)], {
        label: "Un autre Elfe légendaire arrive : piochez deux cartes, puis défaussez-en une",
      }),
    ],
  },
  "Key to the Side-Door": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Une créature ne peut pas être bloquée ce tour-ci",
      }),
      activated({
        mana: "{1}",
        tap: true,
        discard: 1,
        discardFilter: { legendary: true, sameNameAs: { legendary: true, controller: "you" } },
        effects: [fx.draw(2)],
        label: "Défaussez une carte légendaire homonyme d'une de vos légendes : piochez deux cartes",
      }),
    ],
  },
};
