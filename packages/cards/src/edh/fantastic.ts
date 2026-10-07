/**
 * Commander : préconstruit « The Fantastic Four » de Marvel Super Heroes (Invisible Woman, quatre couleurs sans noir).
 * Sorts non-créature (« si vous avez lancé un sort non-créature ce tour-ci »), rebond, payer {R}{G}{W}{U} en attaquant.
 */
import type { Amount, CardScript, ModeDef, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  cond,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const NONCREATURE: ObjectFilter = { notTypes: ["Creature"] };
/** « Si vous avez lancé un sort non-créature ce tour-ci » */
const CAST_NONCREATURE = cond.castThisTurn(1, true);
/** « Au début du combat de votre tour, si vous avez lancé un sort non-créature ce tour-ci, … » */
const heroCombat = (effects: Parameters<typeof triggered>[1], label: string, extra: object = {}) =>
  triggered(when.yourCombat, effects, { condition: CAST_NONCREATURE, label, ...extra });
const WALL: TokenSpec = {
  name: "Wall",
  colors: [],
  types: ["Creature"],
  subtypes: ["Wall"],
  power: 0,
  toughness: 3,
  keywords: ["defender", "reach"],
};
const MERFOLK: TokenSpec = { name: "Merfolk", colors: ["U"], types: ["Creature"], subtypes: ["Merfolk"], power: 1, toughness: 1 };
const CONSTRUCT: TokenSpec = {
  name: "Construct",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 4,
  toughness: 4,
  keywords: ["flying", "haste"],
};
const mode = (label: string, targets: ModeDef["targets"], effects: ModeDef["effects"]): ModeDef => ({ label, targets, effects });
/** « Vous pouvez payer {R}{G}{W}{U}. Quand vous le faites, … » */
const payRGWU = (prompt: string, ...effects: Parameters<typeof fx.mayPay>[2][]) => fx.mayPay("{R}{G}{W}{U}", prompt, ...effects);
/** Valeur de mana la plus grande parmi les cartes non-créature de votre cimetière (Dragon Man). */
const MAX_NONCREATURE_GRAVEYARD: Amount = {
  kind: "aggregate",
  fn: "max",
  property: "manaValue",
  zone: "graveyard",
  filter: NONCREATURE,
} as Amount;

export const EDH_FANTASTIC: Record<string, CardScript> = {
  // --- Commandant ---------------------------------------------------------------------------------------------------
  "Invisible Woman": {
    abilities: [
      heroCombat([fx.createTokens(WALL)], "Un Mur 0/3 avec le défenseur et la portée"),
      triggered(
        when.attackWith(),
        payRGWU(
          "Payer {R}{G}{W}{U} pour renforcer une créature et la rendre imblocable ?",
          fx.reflexive([target.creature()], [fx.pump(ref.target(), amount.count(CREATURE_YOU), 0, ["unblockable"])]),
        ),
        { label: "Payez {R}{G}{W}{U} : +1/+0 par créature et imblocable" },
      ),
    ],
  },

  // --- Héros ----------------------------------------------------------------------------------------------------------
  "Alicia Masters, Skilled Sculptor": {
    abilities: [
      heroCombat([fx.createTokens(TREASURE)], "Un Trésor"),
      triggered(when.yourEndStep, [fx.returnControlToOwners(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"] }))], {
        label: "Pressentir le bien : chaque joueur reprend ses créatures",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Black Bolt, Inhuman King": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.pump(ref.self, 2, 2)], {
        label: "Sort non-créature : +2/+2 jusqu'à la fin du tour",
      }),
      // « Ce joueur » : le contrôleur du sort ou de la capacité qui le cible (le joueur de l'événement).
      triggered(when.targetedByOpponent({ self: true }), [fx.destroy(ref.target())], {
        targets: [target.of(ref.eventPlayer, target.nonland("t"), "permanent non-terrain de ce joueur")],
        label: "Voix fatale : détruisez un permanent non-terrain de ce joueur",
      }),
    ],
  },
  "Council of Reeds": {
    abilities: [
      playerStatic({ noLegendRule: { types: ["Creature"] }, label: "La règle des légendes ne s'applique pas à vos créatures" }),
      heroCombat([fx.copyToken(ref.self)], "Un jeton copie de Council of Reeds"),
    ],
  },
  // Vol : lu dans le texte.
  "Crystal, Inhuman Princess": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.damage(amount.colorsOf(ref.eventObject), ref.eachOpponent)], {
        label: "Sort non-créature : autant de blessures à chaque adversaire que de couleurs",
      }),
      manaAbility(["R", "G", "W", "U"]),
    ],
  },
  // Vol : lu dans le texte.
  "Dragon Man, Reformed Robot": {
    cdaPower: amount.max(amount.maxManaValue({ ...NONCREATURE, permanent: true, controller: "you" }), MAX_NONCREATURE_GRAVEYARD),
    castFromGraveyard: { discard: 1 },
  },
  "Franklin Richards, Ascendant": {
    abilities: [heroCombat([fx.discover(6)], "Découverte 6")],
  },
  // Vol, piétinement, indestructible : lus dans le texte.
  "Galactus, Devourer of Worlds": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [target.permanent("t", [], {}, "permanent")],
        label: "Exilez un permanent",
      }),
      staticAbility(
        "self",
        {
          addBlockRules: [
            {
              mustAttackPlayer: "mostLifeOpponent",
              label: "Faim insatiable : attaque un adversaire qui a le plus de points de vie à chaque combat si possible",
            },
          ],
        },
        { condition: cond.not(cond.controls({ name: "Silver Surfer, Galactus's Herald" })), label: "Faim insatiable" },
      ),
    ],
  },
  // Vol : lu dans le texte.
  "H.E.R.B.I.E., Lovable Robot": {
    abilities: [
      heroCombat([fx.surveil(1)], "Surveillez 1"),
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaChoice(1, ANY_COLOR)],
        label: "Un mana de n'importe quelle couleur",
      }),
    ],
  },
  "Human Torch": {
    abilities: [
      heroCombat([fx.pump(ref.self, 0, 0, ["flying", "doubleStrike", "haste"])], "Vol, double initiative et célérité"),
      triggered(
        when.attacksSelf,
        payRGWU(
          "Payer {R}{G}{W}{U} pour que ses blessures à un adversaire touchent aussi les autres ?",
          fx.modify(ref.self, {
            addAbilities: [
              triggered(
                when.combatDamageToOpponent("self"),
                [fx.damage(amount.eventAmount, ref.except(ref.eachOpponent, ref.eventPlayer))],
                { label: "Autant de blessures à chaque autre adversaire" },
              ),
            ],
          }),
        ),
        { label: "Payez {R}{G}{W}{U} : ses blessures à un adversaire touchent aussi les autres" },
      ),
    ],
  },
  // Vigilance : lue dans le texte.
  "Lockjaw, Slobbering Teleporter": {
    abilities: [
      heroCombat(
        [
          fx.addCounters(ref.self, 1),
          fx.reflexive(
            [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
            [fx.pump(ref.self, 0, 0, ["unblockable"]), fx.pump(ref.target(), 0, 0, ["unblockable"])],
          ),
        ],
        "Un marqueur +1/+1 ; Lockjaw et une autre de vos créatures sont imblocables",
      ),
    ],
  },
  // Portée, vigilance : lues dans le texte.
  "Medusa, Inhuman Queen": {
    abilities: [
      triggered(when.castSpell("any", NONCREATURE), [fx.addCounters(ref.self, 1)], {
        label: "Un joueur lance un sort non-créature : un marqueur +1/+1",
      }),
    ],
  },
  // Portée, vigilance : lues dans le texte.
  "Mister Fantastic": {
    abilities: [
      heroCombat([fx.draw(1)], "Piochez une carte"),
      activated({
        mana: "{R}{G}{W}{U}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "capacité déclenchée que vous contrôlez",
            filter: { stackItems: { triggeredOnly: true, controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 2)],
        label: "Copiez deux fois une de vos capacités déclenchées",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Namor, Atlantean King": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.createTokens(MERFOLK)], { label: "Sort non-créature : un Ondin 1/1" }),
      // « Attaque un joueur qui a plus de PV que vous » : le joueur défenseur, comparé au déclenchement.
      // Approximation : toutes vos autres créatures attaquantes gagnent +2/+0 (pas seulement celles qui attaquent ce
      // joueur), et l'attaque d'un planeswalker compte comme celle de son contrôleur.
      triggered(when.attacksSelf, [fx.pumpAll({ ...CREATURE_YOU, attacking: true, other: true }, 2, 0)], {
        triggerCondition: cond.amountGreater({ kind: "lifeTotal", who: ref.defendingPlayer }, amount.lifeTotal),
        label: "Vos autres créatures attaquantes gagnent +2/+0",
      }),
    ],
  },
  // Vol, vigilance, piétinement, célérité : lus dans le texte.
  "Power Pack": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.pickFromZone("graveyard", { types: ["Instant", "Sorcery"] }, { to: "exile" }, { random: true, store: "p" }),
          fx.delayedAt("yourNextUpkeep", [fx.castNow(ref.target("p"), { free: true, after: "exile" })], { p: ref.stored("p") }),
        ],
        { label: "Exilez un éphémère ou un rituel au hasard ; lancez-le gratuitement à votre prochain entretien" },
      ),
    ],
  },
  // Vol : lu dans le texte.
  "Silver Surfer, Galactus's Herald": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Chercher Galactus, Devourer of Worlds ?", fx.search({ name: "Galactus, Devourer of Worlds" }, { to: "hand" })),
        { label: "Cherchez Galactus" },
      ),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.modify(
            ref.target(),
            { addBlockRules: [{ mustAttackPlayer: "eventPlayer", label: "Attaque ce joueur à chaque combat si possible" }] },
            "endOfYourNextTurn",
          ),
        ],
        { targets: [target.creature()], label: "Une créature attaque ce joueur à chaque combat si possible" },
      ),
    ],
  },
  // Piétinement : lu dans le texte.
  "The Thing": {
    abilities: [
      heroCombat([fx.addCounters(ref.self, 4)], "Quatre marqueurs +1/+1"),
      triggered(
        when.attacksSelf,
        payRGWU(
          "Payer {R}{G}{W}{U} pour doubler les marqueurs de vos permanents ?",
          fx.reflexive(
            [target.upTo(10, target.permanent("t", [], { controller: "you" }, "permanent que vous contrôlez"))],
            [fx.doubleAllCounters(ref.target())],
          ),
        ),
        { label: "Payez {R}{G}{W}{U} : doublez chaque sorte de marqueurs sur vos permanents ciblés" },
      ),
    ],
  },
  "Valeria Richards, Precocious": {
    abilities: [
      { kind: "costReduction", filter: NONCREATURE, generic: 1, label: "Vos sorts non-créature coûtent {1} de moins" },
      triggered(when.castSpell("you", NONCREATURE), [fx.draw(1)], {
        condition: cond.castThisTurn(1, true, true),
        label: "Premier sort non-créature du tour : piochez une carte",
      }),
    ],
  },
  // « Ne peut pas être bloqué » : lu dans le texte.
  "Willie Lumpkin, Postman": {
    abilities: [
      triggered(
        when.combatDamageToOpponent("self"),
        [
          fx.draw(1),
          ...fx.mayForStore(
            ref.eventPlayer,
            "Piocher une carte (vous ne pourrez pas attaquer son contrôleur à votre prochain tour) ?",
            "d",
            fx.draw(1, ref.eventPlayer),
          ),
          // « pendant son prochain tour » : jusqu'au prochain tour du contrôleur de Willie (son tour à lui passe avant).
          ...fx.when(cond.v("d"), fx.untilYourNextTurn({ cantAttackPlayer: "you" }, ref.eventPlayer)),
        ],
        { label: "Vous piochez ; ce joueur peut piocher, il ne pourra alors pas vous attaquer" },
      ),
    ],
  },

  // --- Artefacts et enchantements -----------------------------------------------------------------------------------
  "Cosmic Crucible": {
    abilities: [
      triggered(when.step("main1", "you"), [fx.addManaCombination(4, ANY_COLOR)], {
        label: "Première phase principale : quatre mana de n'importe quelles couleurs",
      }),
      triggered(
        when.castSpell("you", NONCREATURE),
        [
          ...fx.mayForStore(ref.you, "Copier ce sort ?", "c", fx.copySpell(ref.eventObject, 1)),
          ...fx.when(cond.v("c"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "Vous pouvez copier un sort non-créature (une fois par tour)" },
      ),
    ],
  },
  "Mind's Dilation": {
    abilities: [
      triggered(
        { on: "castSpell", by: "opponent", nth: 1 },
        [fx.exileTop(ref.eventPlayer, 1, "m"), fx.castNow(ref.stored("m"), { free: true })],
        { label: "Premier sort d'un adversaire : il exile la carte du dessus, vous pouvez la lancer gratuitement" },
      ),
    ],
  },
  "Mirage Mirror": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Creature", "Enchantment", "Land"],
            {},
            "artefact, créature, enchantement ou terrain",
          ),
        ],
        effects: [fx.becomeCopy(ref.self, ref.target(), "endOfTurn")],
        label: "Devient une copie jusqu'à la fin du tour",
      }),
    ],
  },
  "Monologue Tax": {
    abilities: [
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.createTokens(TREASURE)], {
        label: "Deuxième sort d'un adversaire : un Trésor",
      }),
    ],
  },
  "Negative Zone Portal": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "opponent", "carte du cimetière d'un adversaire")],
        effects: [
          fx.exileCard(ref.target(), { name: "z" }),
          fx.link(ref.stored("z")),
          ...fx.when(cond.targetMatches("t", { types: ["Creature"] }), fx.draw(1)),
        ],
        label: "Exilez une carte du cimetière d'un adversaire (une créature : piochez)",
      }),
      // « Une carte exilée avec lui, au hasard » : tirée parmi les cartes liées encore en exil.
      triggered(
        when.yourUpkeep,
        [
          fx.coinFlip("w"),
          ...fx.when(
            cond.not(cond.v("w")),
            fx.sacrificeIt(ref.self),
            fx.pickFromZone("graveyard", {}, { to: "hand" }, { pool: ref.linked, random: true }),
          ),
        ],
        {
          condition: cond.amountAtLeast(amount.refCount(ref.filtered(ref.linked, { types: ["Creature"] })), 4),
          label: "Quatre créatures exilées : pile ou face ; perdu, sacrifiez-le",
        },
      ),
    ],
  },
  // Vol : lu dans le texte ; Équipage absent (elle devient une créature quand vous lancez un sort non-créature).
  "The Fantasticar": {
    abilities: [
      triggered(
        when.castSpell("you", NONCREATURE),
        fx.may("The Fantasticar devient-elle une créature-artefact jusqu'à la fin du tour ?", fx.animateVehicle(ref.self)),
        { label: "Sort non-créature : elle peut devenir une créature-artefact" },
      ),
      triggered(
        { on: "castSpell", by: "you", nth: 4, filter: NONCREATURE },
        [
          fx.sacrifice(ref.you, { self: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.createTokens(CONSTRUCT, 4)),
        ],
        { label: "Quatrième sort non-créature : sacrifiez-la pour quatre Constructions 4/4" },
      ),
    ],
  },
  "Unstable Molecule Suit": {
    // Équiper {4} et « Equip commander {2} » : lus dans le texte.
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["indestructible"] }, { label: "+2/+2, indestructible" }),
    ],
  },

  // --- Éphémères et rituels (rebond, flashback et convocation lus dans le texte) -----------------------------------
  "Cleansing Nova": {
    spell: {
      modes: [
        mode("Détruisez toutes les créatures", [], [fx.destroyAll({ types: ["Creature"] })]),
        mode(
          "Détruisez tous les artefacts et enchantements",
          [],
          [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] })],
        ),
      ],
    },
  },
  "Clever Concealment": {
    spell: spell(
      [target.upTo(30, target.nonland("t", { controller: "you" }, "permanent non-terrain à vous"))],
      [fx.phaseOut(ref.target())],
    ),
  },
  "Cut a Deal": {
    // Approximation : chaque adversaire pioche (même si sa bibliothèque est vide).
    spell: spell([], [fx.draw(1, ref.eachOpponent), fx.draw(amount.refCount(ref.eachOpponent))]),
  },
  "Deep Analysis": {
    // Approximation : le flashback coûte {1}{U} sans les 3 points de vie.
    flashback: "{1}{U}",
    spell: spell([target.player("p")], [fx.draw(2, ref.target("p"))]),
  },
  "Fantastic Elasticity": {
    spell: {
      modes: [
        mode("Renvoyez un permanent non-terrain", [target.nonland("n")], [fx.bounce(ref.target("n"))]),
        mode(
          "Reprenez un éphémère ou un rituel",
          [
            target.cardInGraveyard(
              "g",
              { types: ["Instant", "Sorcery"] },
              "you",
              "carte d'éphémère ou de rituel de votre cimetière",
            ),
          ],
          [fx.toHand(ref.target("g"))],
        ),
      ],
    },
  },
  // Approximation : les couleurs des permanents que vous contrôlez seulement (pas celles des sorts lancés ce tour-ci).
  "First Family": {
    spell: spell([], [fx.draw(amount.colorsAmong()), fx.gainLife(amount.colorsAmong())]),
  },
  "Flame On!": {
    spell: spell(
      [target.creature()],
      [
        fx.addCounters(ref.target(), amount.countIn("graveyard", { notTypes: ["Creature", "Land"] })),
        fx.pump(ref.target(), 0, 0, ["flying"]),
      ],
    ),
  },
  "Galvanic Iteration": {
    flashback: "{1}{U}{R}",
    spell: spell([], [fx.copyNextSpell]),
  },
  "Hull Breach": {
    spell: {
      modes: [
        mode("Détruisez un artefact", [target.permanent("a", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target("a"))]),
        mode(
          "Détruisez un enchantement",
          [target.permanent("e", ["Enchantment"], {}, "enchantement")],
          [fx.destroy(ref.target("e"))],
        ),
        mode(
          "Détruisez un artefact et un enchantement",
          [target.permanent("a2", ["Artifact"], {}, "artefact"), target.permanent("e2", ["Enchantment"], {}, "enchantement")],
          [fx.destroy(ref.target("a2")), fx.destroy(ref.target("e2"))],
        ),
      ],
    },
  },
  "Into the Time Vortex": {
    abilities: [triggered(when.castSelf, [fx.cascade(5)], { label: "Cascade" })],
    spell: spell([], []),
  },
  "Invisible Force Field": {
    spell: spell(
      [target.upTo(4, target.permanent("t", [], { controller: "you" }, "permanent que vous contrôlez"))],
      [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
    ),
  },
  "It's Clobberin' Time!": {
    spell: {
      modes: [
        mode(
          "Votre créature blesse une créature adverse",
          [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
          [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
        ),
        mode(
          "Détruisez un artefact ou un enchantement",
          [target.permanent("d", ["Artifact", "Enchantment"], {}, "artefact ou enchantement")],
          [fx.destroy(ref.target("d"))],
        ),
      ],
    },
  },
  "Nova Flame": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.addCounters(ref.target(), amount.x),
        fx.damage(
          amount.powerOf(ref.target()),
          ref.except(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"] }), ref.target()),
          ref.target(),
        ),
      ],
    ),
  },
  "Recurring Insight": {
    spell: spell([target.player("p", "opponent")], [fx.draw(amount.refCount(ref.handOf(ref.target("p"))))]),
  },
  "Seize the Day": {
    flashback: "{2}{R}",
    spell: spell([target.creature()], [fx.untap(ref.target()), fx.extraCombatAfterMain]),
  },
  "Taunt from the Rampart": {
    spell: spell(
      [],
      [
        fx.goad(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"], controller: "opponent" }), "untilYourNextTurn", {
          addKeywords: ["cantBlock"],
        }),
      ],
    ),
  },
  Terramorph: {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield" })]),
  },
  // Approximation : chaque joueur choisit lui-même ce qu'il garde (et non vous).
  "Tragic Arrogance": {
    spell: spell([], [fx.keepOnePerType(ref.eachPlayer, true)]),
  },
  "Ultimate Nullification": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], legendary: true }, count: 1 } },
    spell: spell(
      [],
      [
        fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"] }, { to: "exile" }),
        fx.exileCard(ref.allGraveyards),
        fx.bottomOnResolve,
      ],
    ),
  },
};
