/**
 * Teenage Mutant Ninja Turtles — cartes noires (lot A). Le vol, le contact mortel, la menace, le lien de vie, le flash,
 * l'initiative, le piétinement, le faufilement, le kicker lu dans le texte, l'équipement et le cycle de Marais sont lus
 * dans le texte.
 */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  equipAbility,
  FOOD_ABILITY,
  fx,
  INSECT_WARRIOR,
  modal,
  mode,
  NINJA,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Disparition : « si un permanent a quitté le champ de bataille sous votre contrôle ce tour-ci ». */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);
/** Insecte Guerrier 1/1 noir avec le vol (Lord Dregg). */
const FLYING_INSECT_WARRIOR: TokenSpec = { ...INSECT_WARRIOR, keywords: ["flying"] };
/** Copie d'une carte « sauf qu'elle n'est pas légendaire et qu'elle est un Mutant en plus de ses autres types ». */
const MUTANT_COPY = { nonlegendary: true, addSubtypes: ["Mutant"] };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

export const BLACK: Record<string, CardScript> = {
  "Anchovy & Banana Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.creature()],
        label: "Détruisez une créature",
      }),
      FOOD_ABILITY,
    ],
  },
  "Armaggon, Future Shark": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(3, target.creature())],
        label: "Détruisez jusqu'à trois créatures",
      }),
    ],
  },
  "Bebop, Warthog Warrior": {
    abilities: [
      staticAbility(
        { subtype: "Rhino", controller: "you" },
        { addKeywords: ["menace"] },
        { label: "Vos Rhinocéros ont la menace" },
      ),
    ],
  },
  "The Cloning of Shredder": {
    abilities: [
      chapter(
        [1],
        [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x")), fx.copyToken(ref.stored("x"), MUTANT_COPY)],
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
          label: "Chapitre I — Exilez une carte de créature de votre cimetière ; jeton copie Mutant non légendaire",
        },
      ),
      chapter([2, 3], [fx.copyToken(ref.linked, MUTANT_COPY)], {
        label: "Jeton copie Mutant non légendaire de la carte exilée",
      }),
    ],
  },
  "Death in the Family": { spell: spell([target.creature("t", { maxManaValue: 3 })], [fx.exile(ref.target())]) },
  "Foot Mystic": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(NINJA)], {
        condition: DISAPPEAR,
        label: "Disparition — un Ninja 1/1",
      }),
    ],
  },
  "Insectoid Exterminator": {
    abilities: [triggered(when.yourEndStep, [fx.scry(1)], { condition: DISAPPEAR, label: "Disparition — regard 1" })],
  },
  "Lord Dregg, Insect Invader": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FLYING_INSECT_WARRIOR)], {
        condition: DISAPPEAR,
        label: "Disparition — un Insecte Guerrier 1/1 volant",
      }),
      activated({
        mana: "{3}{G}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifiez un jeton : piochez une carte",
      }),
    ],
  },
  "Madame Null, Power Broker": {
    abilities: [
      // « Vous pouvez payer des PV égaux à sa force » (119.4 : seulement si vos PV suffisent ; la question n'est pas posée
      // sinon).
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        fx.when(
          cond.not(cond.amountGreater(amount.powerOf(ref.eventObject), amount.lifeTotal)),
          fx.mayPayLife(
            amount.powerOf(ref.eventObject),
            "Payer des PV égaux à sa force pour y mettre autant de marqueurs +1/+1 ?",
            fx.addCounters(ref.eventObject, amount.powerOf(ref.eventObject)),
          ),
        ),
        { label: "Payez des PV égaux à sa force : autant de marqueurs +1/+1" },
      ),
    ],
  },
  "Oroku Saki, Shredder Rising": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(1), fx.loseLife(1)], {
        label: "Piochez une carte et perdez 1 point de vie",
      }),
    ],
  },
  "Pain 101": {
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), {
          addKeywords: ["deathtouch"],
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], {
              label: "Revient engagée sous le contrôle de son propriétaire",
            }),
          ],
        }),
      ],
    ),
  },
  "Paramecia Coloniex": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "Meulez trois cartes" }),
      triggered(
        when.diesSelf,
        fx.may(
          "Exiler Paramecia Coloniex pour mettre une carte de créature de votre cimetière au-dessus de votre bibliothèque ?",
          fx.exileCard(ref.selfCard, { name: "e" }),
          fx.when(
            cond.v("e"),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
              [fx.moveTo(ref.target(), { to: "libraryTop" })],
            ),
          ),
        ),
        { label: "Exilez-la : une carte de créature au-dessus de votre bibliothèque" },
      ),
    ],
  },
  "Savanti Romero, Time's Exile": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.self, 1),
          fx.draw(amount.countersOn(ref.self, "any")),
          fx.loseLife(amount.countersOn(ref.self, "any")),
        ],
        { label: "Un marqueur +1/+1, puis piochez X cartes et perdez X PV (X : ses marqueurs)" },
      ),
    ],
  },
  "Shark Shredder, Killer Clone": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [fx.toBattlefield(ref.target(), { underYourControl: true, tapped: true, attacking: ref.eventPlayer })],
        {
          targets: [
            target.upTo(
              1,
              target.of(
                ref.eventPlayer,
                target.cardInGraveyard("t", { types: ["Creature"] }, "any", "carte de créature du cimetière de ce joueur"),
              ),
            ),
          ],
          label: "Une carte de créature de son cimetière arrive sous votre contrôle, engagée et attaquante",
        },
      ),
    ],
  },
  "Shredder, Unrelenting": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre de vos créatures gagne le contact mortel",
      }),
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Une autre de vos créatures gagne le contact mortel",
      }),
    ],
  },
  "Shredder's Armor": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attachez-le à une de vos créatures",
      }),
      equipAbility({
        sacrificeOther: { filter: { notTypes: ["Land"] } },
        oncePerTurn: true,
        label: "Équiper — sacrifiez un autre permanent non-terrain",
      }),
    ],
  },
  "Shredder's Revenge": {
    spell: modal(
      mode("Le joueur défausse deux cartes", [target.player()], [fx.discard(2, ref.target())]),
      mode(
        "Le joueur pioche deux cartes et perd 2 points de vie",
        [target.player()],
        [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())],
      ),
    ),
  },
  "Shredder's Technique": {
    // Faufilement {B} : lu dans le texte. « Si un enchantement a été détruit de cette façon » : la cible a été détruite
    // (nombre mémorisé) et c'était un enchantement (dernières informations connues).
    spell: spell(
      [target.permanent("t", ["Creature", "Enchantment"], {}, "créature ou enchantement")],
      [
        fx.destroy(ref.target(), "d"),
        ...fx.when(cond.all(cond.v("d"), cond.targetMatches("t", { types: ["Enchantment"] })), fx.loseLife(2)),
      ],
    ),
  },
  "South Wind Avatar": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true }),
        [fx.gainLife(amount.toughnessOf(ref.eventObject))],
        { label: "Gagnez autant de PV que son endurance" },
      ),
      triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "Chaque adversaire perd 1 point de vie" }),
    ],
  },
  "Splinter, Hamato Yoshi": {
    abilities: [
      staticAbility(
        { subtype: "Ninja", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Vos autres Ninjas : +1/+1" },
      ),
    ],
  },
  "Splinter's Technique": {
    // Faufilement {1}{B} : lu dans le texte.
    spell: spell([], [fx.search({})]),
  },
  "Stomped by the Foot": {
    kicker: "{0}",
    kickerCost: { sacrifice: CREATURE_OR_ARTIFACT },
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.kicked(-5, -2), amount.kicked(-5, -2))]),
  },
  "Super Shredder": {
    abilities: [
      triggered(when.leaves({ other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Un autre permanent part : un marqueur +1/+1",
      }),
    ],
  },
  "Tunnel Rats": {
    abilities: [
      activated({
        mana: "{4}{B}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.selfCard, { tapped: true })],
        label: "Revient du cimetière engagée",
      }),
    ],
  },
};
