/**
 * Commander : deck « Nissa, Non-Green Animist (Landfall w/ Big Creatures) » (Nissa, Leyline Tamer ; blanc, bleu, noir,
 * rouge). Toucheterre (Retraites, Emeria, Ob Nixilis, Roil Elemental, Ruin Crab, Valakut Exploration), terrains rejoués
 * (Crucible of Worlds, Trade Routes, Walking Atlas, Oboro), dessus de bibliothèque ordonné (Ponder, Portent, Sensei's
 * Divining Top, Scroll Rack) et grandes créatures (Avacyn, Elesh Norn, Hullbreaker Horror, Nezahal, Agent of Treachery).
 */
import type { CardScript, ObjectFilter, Ref } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  BIRD_W,
  cond,
  fx,
  manaAbility,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const LEGENDARY_CREATURES_YOU: ObjectFilter = { types: ["Creature"], legendary: true, controller: "you" };
/** « Regardez les N cartes du dessus, puis remettez-les dans l'ordre de votre choix » (rien n'est pris). */
const reorderTop = (n: number, who?: Ref) => fx.lookAtTop(n, { count: 0, rest: "reorder", ...(who ? { who } : {}) });

export const EDH_NISSA: Record<string, CardScript> = {
  // --- Grandes créatures ---------------------------------------------------------------------------------------------
  "Agent of Treachery": {
    abilities: [
      triggered(when.entersSelf, [fx.gainControl(ref.target())], {
        targets: [target.permanent("t", [], {}, "permanent")],
        label: "Gagnez le contrôle du permanent ciblé",
      }),
      // « S'il … » : vérifié au déclenchement et à la résolution (603.4).
      triggered(when.yourEndStep, [fx.draw(3)], {
        condition: cond.controls({ controller: "you", owner: "opponent" }, 3),
        label: "Trois permanents ou plus que vous ne possédez pas : piochez trois cartes",
      }),
    ],
  },
  // Vol, vigilance, indestructible : lus dans le texte.
  "Avacyn, Angel of Hope": {
    abilities: [
      staticAbility(
        { controller: "you", other: true },
        { addKeywords: ["indestructible"] },
        { label: "Vos autres permanents ont l'indestructible" },
      ),
    ],
  },
  // Émerger d'un artefact : lu dans le texte (sacrifice d'un artefact, coût réduit de sa valeur de mana).
  Crabomination: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileTop(ref.target("p"), 1, "top"),
          fx.pickFromZone("graveyard", {}, { to: "exile" }, { who: ref.target("p"), random: true, store: "gy" }),
          fx.pickFromZone("hand", {}, { to: "exile" }, { who: ref.target("p"), random: true, store: "hd" }),
          fx.castNow(ref.union(ref.stored("top"), ref.stored("gy"), ref.stored("hd")), { free: true }),
        ],
        {
          targets: [target.player("p", "opponent")],
          label: "L'adversaire ciblé exile le dessus de sa bibliothèque, une carte au hasard de son cimetière et de sa main",
        },
      ),
    ],
  },
  // Vigilance : lue dans le texte.
  "Elesh Norn, Mother of Machines": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "enter" },
        label: "Les arrivées font se déclencher vos capacités une fois de plus",
      }),
      playerStatic({
        triggerMod: { effect: "none", on: "enter", sources: { controller: "opponent" } },
        label: "Les arrivées ne déclenchent pas les capacités des permanents de vos adversaires",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Emeria Angel": {
    abilities: [
      triggered(when.landfall, fx.may("Créer un jeton Oiseau 1/1 avec le vol ?", fx.createTokens(BIRD_W)), {
        label: "Toucheterre — jeton Oiseau 1/1 avec le vol",
      }),
    ],
  },
  // Vol : lu dans le texte.
  "Emeria Shepherd": {
    abilities: [
      triggered(
        when.landfall,
        [
          ...fx.when(
            cond.eventObjectMatches({ subtype: "Plains" }),
            fx.yourChoice("Emeria Shepherd : la carte ciblée…", "es", [
              { label: "Sur le champ de bataille", effects: [fx.toBattlefield(ref.target())] },
              { label: "Dans votre main", effects: [fx.toHand(ref.target())] },
              { label: "Reste dans le cimetière", effects: [] },
            ]),
          ),
          ...fx.when(
            cond.not(cond.eventObjectMatches({ subtype: "Plains" })),
            fx.may("Renvoyer la carte ciblée dans votre main ?", fx.toHand(ref.target())),
          ),
        ],
        {
          targets: [
            target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "you", "carte de permanent non-terrain"),
          ],
          label: "Toucheterre — une carte de permanent non-terrain revient (sur le champ de bataille avec une Plaine)",
        },
      ),
    ],
  },
  // Vigilance : lue dans le texte.
  "Gandalf, Shadow's Foe": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"), { tapped: true })],
        {
          targets: [target.upTo(3, target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez"))],
          label: "Exilez jusqu'à trois de vos terrains, puis renvoyez-les engagés",
        },
      ),
      triggered(when.landfall, [fx.draw(1), fx.addCounters(ref.self, 1)], {
        label: "Toucheterre — piochez une carte, un marqueur +1/+1 sur Gandalf",
      }),
    ],
  },
  // Initiative : lue dans le texte.
  "Geode Rager": {
    abilities: [
      triggered(when.landfall, [fx.goad(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }))], {
        targets: [target.player("p")],
        label: "Toucheterre — provoquez chaque créature du joueur ciblé",
      }),
    ],
  },
  // Flash : lu dans le texte. « Choisissez jusqu'à un » : chaque mode a une cible facultative.
  "Hullbreaker Horror": {
    cantBeCountered: true,
    abilities: [
      triggeredModal(
        when.castSpell("you"),
        [
          mode(
            "Renvoyez un sort que vous ne contrôlez pas dans la main de son propriétaire",
            [target.optional(target.spell("t", { controller: "opponent" }, "sort que vous ne contrôlez pas"))],
            [fx.bounce(ref.target())],
          ),
          mode(
            "Renvoyez un permanent non-terrain dans la main de son propriétaire",
            [target.optional(target.nonland("t"))],
            [fx.bounce(ref.target())],
          ),
        ],
        { label: "Vous lancez un sort : renvoyez un sort adverse ou un permanent non-terrain" },
      ),
    ],
  },
  "Nezahal, Primal Tide": {
    cantBeCountered: true,
    abilities: [
      playerStatic({ maxHandSize: "none", label: "Pas de taille maximale de main" }),
      triggered(when.castSpell("opponent", { notTypes: ["Creature"] }), [fx.draw(1)], {
        label: "Un adversaire lance un sort non-créature : piochez une carte",
      }),
      activated({
        discard: 3,
        effects: [
          fx.exileCard(ref.self, { name: "n" }),
          fx.delayed([fx.toBattlefield(ref.target("k"), { tapped: true })], { k: ref.stored("n") }),
        ],
        label: "Défaussez trois cartes : exilez Nezahal, il revient engagé à la prochaine étape de fin",
      }),
    ],
  },
  "Ob Nixilis, the Fallen": {
    abilities: [
      triggered(
        when.landfall,
        fx.may("Le joueur ciblé perd 3 PV et Ob Nixilis reçoit trois marqueurs +1/+1 ?", fx.loseLife(3, ref.target("p")), [
          fx.addCounters(ref.self, 3),
        ]),
        { targets: [target.player("p")], label: "Toucheterre — 3 PV perdus, trois marqueurs +1/+1" },
      ),
    ],
  },
  // Vol : lu dans le texte.
  "Roil Elemental": {
    abilities: [
      triggered(
        when.landfall,
        fx.may(
          "Gagner le contrôle de la créature ciblée tant que vous contrôlez Roil Elemental ?",
          fx.gainControlWhileSource(ref.target()),
        ),
        { targets: [target.creature()], label: "Toucheterre — gagnez le contrôle d'une créature" },
      ),
    ],
  },
  "Ruin Crab": {
    abilities: [
      triggered(when.landfall, [fx.mill(3, ref.eachOpponent)], { label: "Toucheterre — chaque adversaire meule trois cartes" }),
    ],
  },
  "Walking Atlas": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, prompt: "Mettez une carte de terrain de votre main sur le champ de bataille" },
          ),
        ],
        label: "Vous pouvez mettre un terrain de votre main sur le champ de bataille",
      }),
    ],
  },

  // --- Enchantements -------------------------------------------------------------------------------------------------
  "Retreat to Coralhelm": {
    abilities: [
      triggeredModal(
        when.landfall,
        [
          mode(
            "Vous pouvez engager ou dégager la créature ciblée",
            [target.creature()],
            fx.yourChoice("Retreat to Coralhelm : la créature ciblée…", "rc", [
              { label: "Dégager", effects: [fx.untap(ref.target())] },
              { label: "Engager", effects: [fx.tap(ref.target())] },
              { label: "Ne rien faire", effects: [] },
            ]),
          ),
          mode("Regard 1", [], [fx.scry(1)]),
        ],
        { label: "Toucheterre — engager ou dégager une créature, ou regard 1" },
      ),
    ],
  },
  "Retreat to Hagra": {
    abilities: [
      triggeredModal(
        when.landfall,
        [
          mode(
            "La créature ciblée gagne +1/+0 et le contact mortel",
            [target.creature()],
            [fx.pump(ref.target(), 1, 0, ["deathtouch"])],
          ),
          mode("Chaque adversaire perd 1 PV et vous gagnez 1 PV", [], [fx.loseLife(1, ref.eachOpponent), fx.gainLife(1)]),
        ],
        { label: "Toucheterre — +1/+0 et contact mortel, ou drain de 1" },
      ),
    ],
  },
  "Trade Routes": {
    abilities: [
      activated({
        mana: "{1}",
        targets: [target.permanent("t", ["Land"], { controller: "you" }, "terrain que vous contrôlez")],
        effects: [fx.toHand(ref.target())],
        label: "Renvoyez un de vos terrains dans la main de son propriétaire",
      }),
      activated({
        mana: "{1}",
        discard: 1,
        discardFilter: { types: ["Land"] },
        effects: [fx.draw(1)],
        label: "Défaussez une carte de terrain : piochez une carte",
      }),
    ],
  },
  // Les cartes exilées sont liées à l'enchantement (« exilées avec cet enchantement ») et restent jouables tant qu'elles
  // restent exilées, même s'il quitte le champ de bataille.
  "Valakut Exploration": {
    abilities: [
      triggered(
        when.landfall,
        [fx.exileTop(ref.you, 1, "v"), fx.link(ref.stored("v")), fx.grantPlay(ref.stored("v"), { forever: true })],
        {
          label: "Toucheterre — exilez la carte du dessus ; vous pouvez la jouer tant qu'elle reste exilée",
        },
      ),
      triggered(
        when.yourEndStep,
        [fx.moveTo(ref.linked, { to: "graveyard" }, { name: "g" }), fx.damage(amount.v("g"), ref.eachOpponent)],
        {
          condition: cond.amountAtLeast(amount.refCount(ref.linked), 1),
          label: "Les cartes exilées vont au cimetière : autant de blessures à chaque adversaire",
        },
      ),
    ],
  },

  // --- Artefacts -----------------------------------------------------------------------------------------------------
  "Crucible of Worlds": {
    abilities: [
      playerStatic({ playFrom: { zone: "graveyard", what: "lands" }, label: "Jouez des terrains depuis votre cimetière" }),
    ],
  },
  // Les cartes exilées face cachée reviennent au-dessus, puis sont remises dans l'ordre de votre choix.
  "Scroll Rack": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            {},
            { to: "exile", faceDown: "you" },
            {
              count: amount.cardsIn("hand"),
              min: 0,
              store: "r",
              prompt: "Exilez face cachée un nombre quelconque de cartes de votre main",
            },
          ),
          fx.lookAtTop(amount.v("r"), { count: amount.v("r"), exact: true, to: { to: "hand" } }),
          fx.moveTo(ref.stored("r"), { to: "libraryTop" }),
          fx.lookAtTop(amount.v("r"), { count: 0, rest: "reorder" }),
        ],
        label: "Échangez des cartes de votre main contre autant de cartes du dessus de votre bibliothèque",
      }),
    ],
  },
  "Sensei's Divining Top": {
    abilities: [
      activated({ mana: "{1}", effects: [reorderTop(3)], label: "Regardez les trois cartes du dessus et ordonnez-les" }),
      activated({
        tap: true,
        effects: [fx.draw(1), fx.moveTo(ref.self, { to: "libraryTop" })],
        label: "Piochez une carte, puis mettez cet artefact au-dessus de votre bibliothèque",
      }),
    ],
  },
  "Wayfarer's Bauble": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Cherchez une carte de terrain de base, mettez-la sur le champ de bataille engagée",
      }),
    ],
  },

  // --- Rituels -------------------------------------------------------------------------------------------------------
  Ponder: {
    spell: spell([], [reorderTop(3), ...fx.may("Mélanger votre bibliothèque ?", fx.shuffle()), fx.draw(1)]),
  },
  Portent: {
    spell: spell(
      [target.player("p")],
      [
        reorderTop(3, ref.target("p")),
        ...fx.may("Faire mélanger sa bibliothèque à ce joueur ?", fx.shuffle(ref.target("p"))),
        fx.delayedAt("nextUpkeep", [fx.draw(1)]),
      ],
    ),
  },
  "Scheming Symmetry": {
    spell: spell([target.exactly(2, target.player("p"))], [fx.search({}, { to: "libraryTop" }, 1, ref.target("p"))]),
  },

  // --- Terrains ------------------------------------------------------------------------------------------------------
  "Boggart Trawler": {
    abilities: [
      triggered(when.entersSelf, [fx.moveTo(ref.graveyardOf(ref.target("p")), { to: "exile" })], {
        targets: [target.player("p")],
        label: "Exilez le cimetière du joueur ciblé",
      }),
    ],
  },
  // « Vous pouvez payer 3 PV, sinon il arrive engagé » : lu dans le texte.
  "Boggart Bog": { abilities: [manaAbility("B")] },
  "Eiganjo, Seat of the Empire": {
    abilities: [
      manaAbility("W"),
      // Canalisation : depuis la main, en défaussant la carte ; {1} de moins par créature légendaire que vous contrôlez.
      activated({
        mana: "{2}{W}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count(LEGENDARY_CREATURES_YOU) },
        targets: [
          {
            ...target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] }),
            label: "créature attaquante ou bloqueuse",
          },
        ],
        effects: [fx.damage(4, ref.target())],
        label: "Canalisation — 4 blessures à une créature attaquante ou bloqueuse",
      }),
    ],
  },
  "Oboro, Palace in the Clouds": {
    abilities: [
      manaAbility("U"),
      activated({ mana: "{1}", effects: [fx.toHand(ref.self)], label: "Renvoyez Oboro dans la main de son propriétaire" }),
    ],
  },
  "Takenuma, Abandoned Mire": {
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{3}{B}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count(LEGENDARY_CREATURES_YOU) },
        effects: [
          fx.mill(3),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature", "Planeswalker"] },
            { to: "hand" },
            { prompt: "Renvoyez une carte de créature ou de planeswalker de votre cimetière dans votre main" },
          ),
        ],
        label: "Canalisation — meulez trois cartes, puis une créature ou un planeswalker revient en main",
      }),
    ],
  },
  "Talon Gates of Madara": {
    abilities: [
      triggered(when.entersSelf, [fx.phaseOut(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Jusqu'à une créature ciblée est mise hors phase",
      }),
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaChoice(1, ANY_COLOR)],
        label: "Un mana de n'importe quelle couleur",
      }),
      activated({
        mana: "{4}",
        fromHand: true,
        effects: [fx.toBattlefield(ref.selfCard)],
        label: "Mettez cette carte de votre main sur le champ de bataille",
      }),
    ],
  },
};
