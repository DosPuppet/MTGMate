/** Secrets of Strixhaven — cartes multicolores. */
import type { Effect, ModeDef, ObjectFilter, TargetSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  castPermission,
  cmp,
  cond,
  costReducer,
  ELEMENTAL_UR,
  entersWith,
  FRACTAL,
  fx,
  INCREMENT,
  INFUSION,
  INSTANT_SORCERY,
  manaAbility,
  modal,
  mode,
  OPUS,
  OPUS_BIG,
  opusInstead,
  PEST,
  REPARTEE,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURES_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const ARTIFACT_OR_CREATURE: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] };
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
/** « Ce mana ne peut servir qu'à lancer des sorts d'éphémère et de rituel. » */
const INSTANT_SORCERY_MANA = { spell: INSTANT_SORCERY };

/** « Chaque fois qu'une ou plusieurs cartes quittent votre cimetière » (avec `batched`). */
const LEAVE_YOUR_GRAVEYARD: TriggerSpec = when.zoneChange(["graveyard"], { whose: "you" });

/**
 * Moment of Reckoning : « choisissez jusqu'à quatre ; vous pouvez choisir le même mode plus d'une fois ». Toutes les
 * combinaisons (de un à quatre modes) sont générées, chaque exemplaire d'un mode avec sa propre cible.
 */
function reckoningModes(): ModeDef[] {
  const out: ModeDef[] = [];
  for (let d = 0; d <= 4; d++) {
    for (let g = 0; g <= 4 - d; g++) {
      if (d + g === 0) continue;
      const targets: TargetSpec[] = [];
      const effects: Effect[] = [];
      for (let i = 0; i < d; i++) {
        targets.push(target.nonland(`d${i}`));
        effects.push(fx.destroy(ref.target(`d${i}`)));
      }
      for (let i = 0; i < g; i++) {
        targets.push(
          target.cardInGraveyard(
            `g${i}`,
            { permanent: true, notTypes: ["Land"] },
            "you",
            "carte de permanent non-terrain de votre cimetière",
          ),
        );
        effects.push(fx.toBattlefield(ref.target(`g${i}`)));
      }
      const label = [d ? `Détruisez ${d} permanent(s) non-terrain` : "", g ? `renvoyez ${g} carte(s) de permanent` : ""]
        .filter(Boolean)
        .join(", ");
      out.push(mode(label, targets, effects));
    }
  }
  return out;
}

export const MULTI: Record<string, CardScript> = {
  // --- Silverquill (blanc et noir) -------------------------------------------
  // Vol lu dans le texte.
  "Abigale, Poet Laureate": {
    prepareSpell: spell([target.creature()], [fx.addCounters(ref.target(), 1)]),
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [fx.prepare(ref.self)], {
        label: "Sort de créature lancé : Abigale devient préparée",
      }),
    ],
  },
  "Conciliator's Duelist": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), fx.loseLife(1, ref.eachPlayer)], {
        label: "Piochez une carte ; chaque joueur perd 1 PV",
      }),
      triggered(
        REPARTEE,
        [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        {
          targets: [target.upTo(1, target.creature())],
          label: "Repartee : exilez une créature jusqu'à la prochaine étape de fin",
        },
      ),
    ],
  },
  "Fix What's Broken": {
    // « Payez X points de vie » en coût additionnel : lu dans le texte.
    spell: spell(
      [],
      [
        fx.moveAll(
          "graveyard",
          ref.you,
          { ...ARTIFACT_OR_CREATURE, compare: [cmp.manaValue("=", amount.x)] },
          { to: "battlefield" },
        ),
      ],
    ),
  },
  // Vigilance lue dans le texte.
  "Imperious Inkmage": {
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveillance 2" })],
  },
  "Inkling Mascot": {
    abilities: [
      triggered(REPARTEE, [fx.modify(ref.self, { addKeywords: ["flying"] }), fx.surveil(1)], {
        label: "Repartee : vol jusqu'à la fin du tour, surveillance 1",
      }),
    ],
  },
  "Killian's Confidence": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 1), fx.draw(1)]),
    abilities: [
      triggered(
        when.combatDamageBatch(CREATURES_YOU),
        fx.mayPay("{W/B}", "Payer {W/B} pour renvoyer Killian's Confidence dans votre main ?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Blessures de combat à un joueur : payez {W/B} pour la reprendre en main" },
      ),
    ],
  },
  "Moment of Reckoning": { spell: { modes: reckoningModes() } },
  "Render Speechless": {
    spell: spell(
      [target.player("p", "opponent"), target.upTo(1, target.creature("c"))],
      [
        fx.discard(1, ref.target("p"), { filter: { notTypes: ["Land"] }, chooser: "controller" }),
        fx.addCounters(ref.target("c"), 2),
      ],
    ),
  },
  // Menace lue dans le texte.
  "Scolding Administrator": {
    abilities: [
      triggered(REPARTEE, [fx.addCounters(ref.self, 1)], { label: "Repartee : un marqueur +1/+1" }),
      // « si elle avait des marqueurs » (603.4) : ses marqueurs au moment de mourir (dernières informations connues).
      triggered(when.diesSelf, [fx.lkiCountersTo(ref.target())], {
        condition: cond.amountAtLeast(amount.countersOn(ref.eventObject, "any"), 1),
        targets: [target.upTo(1, target.creature())],
        label: "Ses marqueurs sur une créature",
      }),
    ],
  },
  "Silverquill Charm": {
    spell: modal(
      mode("Deux marqueurs +1/+1", [target.creature()], [fx.addCounters(ref.target(), 2)]),
      mode("Exilez une créature de force 2 ou moins", [target.creature("t", { maxPower: 2 })], [fx.exile(ref.target())]),
      mode("Chaque adversaire perd 3 PV, vous gagnez 3 PV", [], fx.drain(3)),
    ),
  },
  /**
   * Vol et vigilance lus dans le texte. Approximation de la victime (casualty 1) accordée : une capacité déclenchée au
   * lancer (« vous pouvez sacrifier une créature de force 1 ou plus ; si vous le faites, copiez le sort »), et non un
   * coût additionnel payé pendant le lancer.
   */
  "Silverquill, the Disputant": {
    abilities: [
      triggered(
        OPUS,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], minPower: 1 }, 1, { optional: true, store: "c" }),
          ...fx.when(cond.v("c"), fx.copySpell(ref.eventObject, 1)),
        ],
        { label: "Victime 1 : sacrifiez une créature de force 1 ou plus pour copier le sort" },
      ),
    ],
  },
  "Snooping Page": {
    abilities: [
      triggered(REPARTEE, [fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "Repartee : ne peut pas être bloquée ce tour-ci",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(1), fx.loseLife(1)], { label: "Piochez une carte, perdez 1 PV" }),
    ],
  },
  "Social Snub": {
    spell: spell([], [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }), ...fx.drain(1)]),
    abilities: [
      triggered(when.castSelf, fx.may("Copier Social Snub ?", fx.copySpell(ref.self, 1)), {
        // « en contrôlant une créature » : au déclenchement seulement (pas un « si » revérifié à la résolution).
        triggerCondition: cond.controls({ types: ["Creature"] }),
        label: "Lancé en contrôlant une créature : vous pouvez le copier",
      }),
    ],
  },

  // --- Lorehold (rouge et blanc) ---------------------------------------------
  "Ark of Hunger": {
    abilities: [
      triggered(LEAVE_YOUR_GRAVEYARD, [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], {
        batched: true,
        label: "Des cartes quittent votre cimetière : 1 blessure à chaque adversaire, +1 PV",
      }),
      activated({
        tap: true,
        effects: [fx.mill(1, ref.you, { name: "m" }), fx.grantPlay(ref.stored("m"))],
        label: "Meulez une carte, jouable ce tour-ci",
      }),
    ],
  },
  "Aziza, Mage Tower Captain": {
    abilities: [
      triggered(
        OPUS,
        [
          fx.tapChosen({ types: ["Creature"] }, "a", { exactly: 3 }),
          ...fx.when(cond.v("a", 3), fx.copySpell(ref.eventObject, 1)),
        ],
        { label: "Engagez trois créatures pour copier le sort" },
      ),
    ],
  },
  "Borrowed Knowledge": {
    spell: modal(
      mode(
        "Défaussez votre main, piochez autant que la main de l'adversaire",
        [target.player("p", "opponent")],
        [fx.discard(amount.cardsIn("hand")), fx.draw(amount.refCount(ref.handOf(ref.target("p"))))],
      ),
      mode(
        "Défaussez votre main, piochez autant de cartes",
        [],
        [fx.discard(amount.cardsIn("hand"), ref.you, { store: "d" }), fx.draw(amount.v("d"))],
      ),
    ),
  },
  "Colossus of the Blood Age": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.eachOpponent), fx.gainLife(3)], {
        label: "3 blessures à chaque adversaire, +3 PV",
      }),
      triggered(
        when.diesSelf,
        [fx.discard(amount.cardsIn("hand"), ref.you, { optional: true, store: "d" }), fx.draw(amount.plus(amount.v("d"), 1))],
        { label: "Défaussez autant de cartes que voulu, piochez-en autant plus une" },
      ),
    ],
  },
  "Kirol, History Buff": {
    prepareSpell: spell(
      [target.creature()],
      [fx.mill(1), fx.addCounters(ref.target(), 2), fx.modify(ref.target(), { addKeywords: ["trample"] })],
    ),
    abilities: [
      triggered(LEAVE_YOUR_GRAVEYARD, [fx.prepare(ref.self)], {
        batched: true,
        label: "Des cartes quittent votre cimetière : Kirol devient préparé",
      }),
    ],
  },
  "Lorehold Charm": {
    spell: modal(
      mode(
        "Chaque adversaire sacrifie un artefact non-jeton",
        [],
        [fx.sacrifice(ref.eachOpponent, { types: ["Artifact"], token: false })],
      ),
      mode(
        "Renvoyez un artefact ou une créature de VM 2 ou moins",
        [
          target.cardInGraveyard(
            "t",
            { ...ARTIFACT_OR_CREATURE, maxManaValue: 2 },
            "you",
            "carte d'artefact ou de créature de VM 2 ou moins",
          ),
        ],
        [fx.toBattlefield(ref.target())],
      ),
      mode("Vos créatures : +1/+1 et piétinement", [], [fx.pumpAll(CREATURES_YOU, 1, 1, ["trample"])]),
    ),
  },
  // Initiative lue dans le texte.
  "Practiced Scrollsmith": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "e" }), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })],
        {
          targets: [
            target.cardInGraveyard(
              "t",
              { notTypes: ["Creature", "Land"] },
              "you",
              "carte non-créature et non-terrain de votre cimetière",
            ),
          ],
          label: "Exilez une carte non-créature et non-terrain : lançable jusqu'à la fin de votre prochain tour",
        },
      ),
    ],
  },
  "Pursue the Past": {
    flashback: "{2}{R}{W}",
    spell: spell(
      [],
      [fx.gainLife(2), fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))],
    ),
  },
  "Spirit Mascot": {
    abilities: [
      triggered(LEAVE_YOUR_GRAVEYARD, [fx.addCounters(ref.self, 1)], {
        batched: true,
        label: "Des cartes quittent votre cimetière : un marqueur +1/+1",
      }),
    ],
  },
  // Piétinement et lien de vie lus dans le texte.
  "Startled Relic Sloth": {
    abilities: [
      triggered(when.yourCombat, [fx.exileCard(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "Exilez jusqu'à une carte d'un cimetière",
      }),
    ],
  },
  "Wilt in the Heat": {
    costReduction: { generic: 2, condition: cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1) },
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())]),
  },

  // --- Prismari (bleu et rouge) ----------------------------------------------
  "Abstract Paintmage": {
    abilities: [
      triggered(
        when.step("main1", "you"),
        [fx.addManaChoice(1, ["U"], INSTANT_SORCERY_MANA), fx.addManaChoice(1, ["R"], INSTANT_SORCERY_MANA)],
        { label: "Ajoutez {U}{R} (éphémères et rituels seulement)" },
      ),
    ],
  },
  // Vol et vigilance lus dans le texte.
  "Elemental Mascot": {
    abilities: [
      triggered(
        OPUS,
        [
          fx.pump(ref.self, 1, 0),
          ...fx.when(OPUS_BIG, fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })),
        ],
        { label: "Opus : +1/+0 ; cinq mana ou plus : exilez la carte du dessus, jouable jusqu'à votre prochain tour" },
      ),
    ],
  },
  /**
   * Vol et garde (payer 5 PV) lus dans le texte. Approximation de la tempête accordée : la capacité copie le sort autant
   * de fois que de sorts lancés ce tour-ci avant sa résolution, moins lui-même (un sort lancé en réponse à la capacité
   * est compté).
   */
  "Prismari, the Inspiration": {
    abilities: [
      triggered(OPUS, [fx.copySpell(ref.eventObject, amount.plus(amount.turnEvents({ event: "cast" }), -1))], {
        label: "Tempête : une copie par sort lancé avant lui ce tour-ci",
      }),
    ],
  },
  "Rapturous Moment": {
    spell: spell([], [fx.draw(3), fx.discard(2), fx.addMana("U", "U", "R", "R", "R")]),
  },
  "Resonating Lute": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addAbilities: [manaAbility([...ANY_COLOR], 2, { restriction: INSTANT_SORCERY_MANA })] },
        { label: "Vos terrains : {T} : deux mana d'une même couleur (éphémères et rituels)" },
      ),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 7),
        effects: [fx.draw(1)],
        label: "Piochez une carte (sept cartes ou plus en main)",
      }),
    ],
  },
  "Sanar, Unfinished Genius": {
    prepareSpell: spell([], [fx.search(INSTANT_SORCERY)]),
    abilities: [
      entersWith({ prepared: true }),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.instantSorceryCast, 1),
        effects: [fx.createTokens(TREASURE)],
        label: "Un Trésor (éphémère ou rituel lancé ce tour-ci)",
      }),
    ],
  },
  // Vol lu dans le texte.
  "Spectacular Skywhale": {
    abilities: [
      triggered(OPUS, opusInstead([fx.pump(ref.self, 3, 0)], [fx.addCounters(ref.self, 3)]), {
        label: "Opus : +3/+0 ; cinq mana ou plus : trois marqueurs +1/+1 à la place",
      }),
    ],
  },
  "Splatter Technique": {
    spell: modal(
      mode("Piochez quatre cartes", [], [fx.draw(4)]),
      mode("4 blessures à chaque créature et planeswalker", [], [fx.damageAll(4, { types: ["Creature", "Planeswalker"] })]),
    ),
  },
  "Stadium Tidalmage": {
    abilities: [
      triggered(when.entersSelf, fx.may("Piocher une carte, puis en défausser une ?", fx.draw(1), fx.discard(1)), {
        label: "Vous pouvez piocher, puis défausser",
      }),
      triggered(when.attacksSelf, fx.may("Piocher une carte, puis en défausser une ?", fx.draw(1), fx.discard(1)), {
        label: "Vous pouvez piocher, puis défausser",
      }),
    ],
  },
  "Stress Dream": {
    spell: spell(
      [target.upTo(1, target.creature())],
      [fx.damage(5, ref.target()), fx.lookAtTop(2, { count: 1, exact: true, rest: "bottom" })],
    ),
  },
  "Visionary's Dance": {
    spell: spell([], [fx.createTokens(ELEMENTAL_UR, 2)]),
    abilities: [
      activated({
        mana: "{2}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.lookAtTop(2, { count: 1, exact: true, rest: "graveyard" })],
        label: "Regardez les deux cartes du dessus : une en main, l'autre au cimetière",
      }),
    ],
  },

  // --- Quandrix (vert et bleu) -----------------------------------------------
  "Applied Geometry": {
    spell: spell(
      [
        {
          id: "t",
          label: "permanent non-Aura que vous contrôlez",
          filter: { objects: { permanent: true, controller: "you", notSubtype: "Aura" } },
        },
      ],
      [
        fx.copyToken(ref.target(), { addTypes: ["Creature"], addSubtypes: ["Fractal"], pt: 0, store: "c" }),
        fx.addCounters(ref.stored("c"), 6),
      ],
    ),
  },
  "Berta, Wise Extrapolator": {
    abilities: [
      INCREMENT,
      triggered(when.countersPut("self", "+1/+1"), [fx.addManaChoice(1)], {
        label: "Marqueurs +1/+1 sur Berta : un mana de n'importe quelle couleur",
      }),
      activated({
        mana: "{X}",
        tap: true,
        effects: [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), amount.x)],
        label: "Une Fractale 0/0 avec X marqueurs +1/+1",
      }),
    ],
  },
  // Flash, vol et piétinement lus dans le texte.
  "Cuboid Colony": { abilities: [INCREMENT] },
  "Embrace the Paradox": {
    spell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          {
            min: 0,
            prompt: "Vous pouvez mettre une carte de terrain de votre main sur le champ de bataille engagée",
          },
        ),
      ],
    ),
  },
  // Piétinement lu dans le texte.
  "Fractal Mascot": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature adverse, un marqueur d'étourdissement",
      }),
    ],
  },
  "Growth Curve": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.addCounters(ref.target(), 1), fx.doubleCounters(ref.target())],
    ),
  },
  "Mind into Matter": {
    spell: spell(
      [],
      [
        fx.draw(amount.x),
        fx.pickFromZone(
          "hand",
          { permanent: true },
          { to: "battlefield", tapped: true },
          {
            min: 0,
            maxManaValue: amount.x,
            prompt: "Vous pouvez mettre une carte de permanent de VM X ou moins sur le champ de bataille engagée",
          },
        ),
      ],
    ),
  },
  "Proctor's Gaze": {
    spell: spell(
      [target.upTo(1, target.nonland())],
      [fx.bounce(ref.target()), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
    ),
  },
  // Vol lu dans le texte.
  Pterafractyl: {
    abilities: [
      entersWith({ counters: amount.x, label: "Arrive avec X marqueurs +1/+1" }),
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "Gagnez 2 PV" }),
    ],
  },
  "Quandrix Charm": {
    spell: modal(
      mode(
        "Contrecarrez un sort à moins que son contrôleur ne paie {2}",
        [target.spell()],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
      ),
      mode("Détruisez un enchantement", [target.permanent("t", ["Enchantment"], {}, "enchantement")], [fx.destroy(ref.target())]),
      mode(
        "Une créature a une force et une endurance de base de 5/5",
        [target.creature()],
        [fx.modify(ref.target(), { setPower: 5, setToughness: 5 })],
      ),
    ),
  },
  "Tam, Observant Sequencer": {
    prepareSpell: spell([], [fx.draw(1), fx.gainLife(1)]),
    abilities: [triggered(when.landfall, [fx.prepare(ref.self)], { label: "Atterrissage : Tam devient préparé" })],
  },

  // --- Witherbloom (noir et vert) --------------------------------------------
  "Blech, Loafing Pest": {
    abilities: [
      triggered(
        when.gainLife,
        [fx.addCountersAll({ controller: "you", anySubtype: ["Pest", "Bat", "Insect", "Snake", "Spider"] }, 1)],
        { label: "Un marqueur +1/+1 sur chacun de vos Nuisibles, Chauves-souris, Insectes, Serpents et Araignées" },
      ),
    ],
  },
  "Bogwater Lumaret": {
    abilities: [triggered(when.enters(CREATURES_YOU), [fx.gainLife(1)], { label: "Une créature arrive : gagnez 1 PV" })],
  },
  "Cauldron of Essence": {
    abilities: [
      triggered(when.dies(CREATURES_YOU), fx.drain(1), { label: "Une de vos créatures meurt : drain de 1" }),
      activated({
        mana: "{1}{B}{G}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "carte de créature de votre cimetière")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Renvoyez une carte de créature de votre cimetière sur le champ de bataille",
      }),
    ],
  },
  "Dina's Guidance": {
    // La carte trouvée va dans votre main, puis vous pouvez la mettre au cimetière à la place.
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"] }, { to: "hand" }, 1, undefined, "c"),
        ...fx.may(
          "Mettre la carte trouvée dans votre cimetière plutôt que dans votre main ?",
          fx.moveTo(ref.stored("c"), { to: "graveyard" }),
        ),
      ],
    ),
  },
  "Essenceknit Scholar": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(PEST)], { label: "Un Nuisible 1/1" }),
      triggered(when.yourEndStep, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.yourCreaturesDiedThisTurn, 1),
        label: "Une de vos créatures est morte ce tour-ci : piochez une carte",
      }),
    ],
  },
  "Grapple with Death": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artefact ou créature")],
      [fx.destroy(ref.target()), fx.gainLife(1)],
    ),
  },
  "Lluwen, Exchange Student": {
    prepareSpell: spell([], [fx.createTokens(PEST)]),
    abilities: [
      entersWith({ prepared: true }),
      activated({
        exileFromGraveyard: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        effects: [fx.prepare(ref.self)],
        label: "Exilez une carte de créature de votre cimetière : Lluwen devient préparée",
      }),
    ],
  },
  "Mind Roots": {
    spell: spell(
      [target.player("p")],
      [
        fx.discard(2, ref.target("p"), { store: "d" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Land"] },
          { to: "battlefield", tapped: true, underYourControl: true },
          { min: 0, pool: ref.stored("d"), prompt: "Vous pouvez mettre une carte de terrain défaussée sur le champ de bataille" },
        ),
      ],
    ),
  },
  // Portée et vigilance lues dans le texte.
  "Old-Growth Educator": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, 2)], {
        condition: INFUSION,
        label: "Infusion : deux marqueurs +1/+1",
      }),
    ],
  },
  // Piétinement lu dans le texte.
  "Pest Mascot": {
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "Vous gagnez des PV : un marqueur +1/+1" })],
  },
  "Root Manipulation": {
    spell: spell(
      [],
      [
        fx.modifyAll(CREATURES_YOU, {
          power: 2,
          toughness: 2,
          addKeywords: ["menace"],
          addAbilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gagnez 1 PV" })],
        }),
      ],
    ),
  },
  // Menace lue dans le texte.
  "Teacher's Pest": {
    abilities: [
      triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gagnez 1 PV" }),
      activated({
        mana: "{B}{G}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true })],
        label: "Revient du cimetière engagé",
      }),
    ],
  },
  // Vol et contact mortel lus dans le texte. Affinité pour les créatures : réduction de coût.
  "Witherbloom, the Balancer": {
    costReduction: { generic: amount.count(CREATURES_YOU) },
    abilities: [
      costReducer(INSTANT_SORCERY, 0, "Vos éphémères et rituels ont l'affinité pour les créatures", {
        genericAmount: amount.count(CREATURES_YOU),
      }),
    ],
  },

  // --- Autres paires -----------------------------------------------------------
  "Stirring Honormancer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(amount.count(CREATURES_YOU), { count: 1, exact: true, rest: "graveyard" })], {
        label: "Regardez X cartes : une en main, les autres au cimetière",
      }),
    ],
  },
  "Nita, Forum Conciliator": {
    abilities: [
      triggered({ on: "castSpell", by: "you", notOwned: true }, [fx.addCountersAll(CREATURES_YOU, 1)], {
        label: "Sort que vous ne possédez pas : un marqueur +1/+1 sur chacune de vos créatures",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard("t", INSTANT_SORCERY, "opponent", "carte d'éphémère ou de rituel d'un cimetière adverse"),
        ],
        effects: [fx.exileCard(ref.target(), { name: "e" }), fx.grantPlay(ref.stored("e"), { anyMana: true, after: "exile" })],
        label: "Exilez un éphémère ou un rituel adverse : vous pouvez le lancer ce tour-ci",
      }),
    ],
  },
  "Molten Note": {
    flashback: "{6}{R}{W}",
    spell: spell(
      [target.creature()],
      [fx.damage(amount.manaSpent, ref.target()), fx.untapAll({ types: ["Creature"], controller: "you" })],
    ),
  },
  "Geometer's Arthropod": {
    abilities: [
      triggered(when.castSpell("you", { hasX: true }), [fx.lookAtTop(amount.eventX, { count: 1, exact: true, rest: "bottom" })], {
        label: "Sort avec {X} : regardez les X cartes du dessus, une en main",
      }),
    ],
  },
  "Paradox Surveyor": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(5, { filter: { anyOf: [{ types: ["Land"] }, { hasX: true }] }, count: 1, rest: "bottom" })],
        { label: "Regardez cinq cartes : un terrain ou une carte avec {X} en main" },
      ),
    ],
  },
  "Suspend Aggression": {
    spell: spell(
      [target.nonland()],
      [
        fx.exileCard(ref.target(), { name: "a" }),
        fx.exileTop(ref.you, 1, "b"),
        fx.grantPlay(ref.stored("a"), { for: "owner", untilOwnersNextTurn: true }),
        fx.grantPlay(ref.stored("b"), { for: "owner", untilOwnersNextTurn: true }),
      ],
    ),
  },
  "Fractal Tender": {
    abilities: [
      INCREMENT,
      triggered(when.eachEndStep, [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), 3)], {
        condition: cond.sourceMatches({ countersPutByYouThisTurn: true }),
        label: "Vous avez mis un marqueur sur elle ce tour-ci : une Fractale avec trois marqueurs +1/+1",
      }),
    ],
  },
  "Zaffai and the Tempests": {
    abilities: [
      castPermission({
        freeFrom: "hand",
        freeFilter: INSTANT_SORCERY,
        freeOncePerTurn: true,
        condition: cond.yourTurn,
        label: "Une fois pendant chacun de vos tours : un éphémère ou un rituel de votre main sans payer son coût",
      }),
    ],
  },
  "Lorehold, the Historian": {
    abilities: [
      // Miracle {2} (702.94) accordé aux éphémères et rituels de votre main : la première carte piochée du tour peut être
      // lancée pour {2} en la piochant.
      triggered(when.draw(1), [fx.castNow(ref.eventObject, { cost: "{2}" })], {
        condition: cond.eventObjectMatches(INSTANT_SORCERY),
        label: "Miracle {2} : lancez l'éphémère ou le rituel pioché pour {2}",
      }),
      triggered(
        { on: "step", step: "upkeep", whose: "opponent" },
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        { label: "Entretien adverse : vous pouvez défausser une carte pour en piocher une" },
      ),
    ],
  },
  "Quandrix, the Proof": {
    abilities: [
      triggered(when.castSelf, [fx.cascade(6)], { label: "Cascade" }),
      // « Les sorts d'éphémère et de rituel que vous lancez depuis votre main ont la cascade. »
      triggered(
        { on: "castSpell", by: "you", filter: INSTANT_SORCERY, fromHand: true },
        [fx.cascade(amount.manaValueOf(ref.eventObject))],
        { label: "Cascade du sort d'éphémère ou de rituel lancé depuis votre main" },
      ),
    ],
  },
};
