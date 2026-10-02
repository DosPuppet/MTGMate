/** Avatar: The Last Airbender — cartes bleues (lot A). */
import {
  activated,
  amount,
  type CardScript,
  CLUE,
  chapter,
  cond,
  costReducer,
  exhaust,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  SPIRIT_KOH,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Nombre de cartes de Leçon dans votre cimetière. */
const LESSONS = amount.countIn("graveyard", { subtype: "Lesson" });
/** « tant qu'il y a trois cartes de Leçon ou plus dans votre cimetière » */
const THREE_LESSONS = cond.amountAtLeast(LESSONS, 3);

export const BLUE: Record<string, CardScript> = {
  "Boomerang Basics": {
    // Le contrôleur est lu dans les dernières informations connues du permanent renvoyé.
    spell: spell(
      [target.nonland()],
      [fx.bounce(ref.target()), ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.draw(1))],
    ),
  },
  "Ember Island Production": {
    spell: modal(
      mode(
        "Copie 4/4 Héros d'une de vos créatures",
        [target.creature("t", { controller: "you" })],
        [fx.copyToken(ref.target(), { nonlegendary: true, pt: 4, addSubtypes: ["Hero"] })],
      ),
      mode(
        "Copie 2/2 Lâche d'une créature adverse",
        [target.creature("u", { controller: "opponent" })],
        [fx.copyToken(ref.target("u"), { nonlegendary: true, pt: 2, addSubtypes: ["Coward"] })],
      ),
    ),
  },
  "First-Time Flyer": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { condition: cond.amountAtLeast(LESSONS, 1), label: "+1/+1 tant qu'une Leçon est dans votre cimetière" },
      ),
    ],
  },
  "Flexible Waterbender": {
    abilities: [
      activated({
        mana: "{3}",
        waterbend: true,
        effects: [fx.modify(ref.self, { setPower: 5, setToughness: 2 })],
        label: "Maîtrise de l'eau {3} : F/E de base 5/2 jusqu'à la fin du tour",
      }),
    ],
  },
  "Forecasting Fortune Teller": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "Un Indice" })],
  },
  "Geyser Leaper": {
    abilities: [
      activated({
        mana: "{4}",
        waterbend: true,
        effects: fx.loot(1),
        label: "Maîtrise de l'eau {4} : piochez une carte, puis défaussez-en une",
      }),
    ],
  },
  "Giant Koi": {
    // Cycle d'Île lu dans le texte.
    abilities: [
      activated({
        mana: "{3}",
        waterbend: true,
        effects: [fx.modify(ref.self, { addKeywords: ["unblockable"] })],
        label: "Maîtrise de l'eau {3} : imblocable ce tour-ci",
      }),
    ],
  },
  "Gran-Gran": {
    abilities: [
      triggered(when.tapsSelf, fx.loot(1), { label: "Piochez une carte, puis défaussez-en une" }),
      costReducer({ notTypes: ["Creature"] }, 1, "Sorts non-créatures : {1} de moins (trois Leçons au cimetière)", {
        condition: THREE_LESSONS,
      }),
    ],
  },
  "Honest Work": {
    enchant: { filter: { types: ["Creature"], controller: "opponent" }, label: "créature adverse" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.tap(ref.attached), fx.removeCounters(ref.attached, amount.countersOn(ref.attached, "any"))],
        { label: "Engagez la créature enchantée et retirez-en tous les marqueurs" },
      ),
      staticAbility(
        "attached",
        {
          loseAllAbilities: true,
          setSubtypes: ["Citizen"],
          setPower: 1,
          setToughness: 1,
          setName: "Humble Merchant",
          addAbilities: [manaAbility("C")],
        },
        { label: "Citoyen 1/1 « {T} : ajoutez {C} » nommé Humble Merchant" },
      ),
    ],
  },
  "Invasion Submersible": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "Renvoie un autre permanent non-terrain",
      }),
      exhaust({
        mana: "{3}",
        waterbend: true,
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "permanent"), fx.addCounters(ref.self, 3)],
        label: "Maîtrise de l'eau {3} : devient une créature-artefact avec trois marqueurs +1/+1",
      }),
    ],
  },
  "Katara, Bending Prodigy": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.sourceMatches({ tapped: true }),
        label: "Engagée : un marqueur +1/+1",
      }),
      activated({ mana: "{6}", waterbend: true, effects: [fx.draw(1)], label: "Maîtrise de l'eau {6} : piochez une carte" }),
    ],
  },
  "Knowledge Seeker": {
    abilities: [
      triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Deuxième carte piochée : un marqueur +1/+1" }),
      triggered(when.diesSelf, [fx.createTokens(CLUE)], { label: "Un Indice" }),
    ],
  },
  "The Legend of Kuruk": {
    abilities: [
      chapter([1, 2], [fx.scry(2), fx.draw(1)], { label: "Regard 2, puis piochez une carte" }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Revient transformée",
      }),
    ],
  },
  "Avatar Kuruk": {
    abilities: [
      triggered(when.castSpell("you"), [fx.createTokens(SPIRIT_KOH)], { label: "Un Esprit 1/1" }),
      exhaust({
        mana: "{20}",
        waterbend: true,
        effects: [fx.extraTurn],
        label: "Maîtrise de l'eau {20} : un tour supplémentaire",
      }),
    ],
  },
  "Lost Days": {
    // Le choix est posé au contrôleur du permanent (approximation : son propriétaire, comme Temporal Cleansing).
    spell: spell(
      [{ id: "t", label: "créature ou enchantement", filter: { objects: { types: ["Creature", "Enchantment"] } } }],
      [
        ...fx.mayForStore(
          ref.controllerOf(ref.target()),
          "mettre ce permanent au-dessous de votre bibliothèque (sinon, en deuxième position depuis le dessus) ?",
          "bottom",
          fx.moveTo(ref.target(), { to: "libraryBottom" }),
        ),
        ...fx.when(cond.not(cond.v("bottom")), fx.moveTo(ref.target(), { to: "libraryTop", fromTop: 2 })),
        fx.createTokens(CLUE),
      ],
    ),
  },
  "Master Pakku": {
    // Prouesse lue dans le texte.
    abilities: [
      triggered(when.tapsSelf, [fx.mill(LESSONS, ref.target())], {
        targets: [target.player()],
        label: "Le joueur ciblé meule X cartes (Leçons de votre cimetière)",
      }),
    ],
  },
  "The Mechanist, Aerial Artisan": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(CLUE)], { label: "Un Indice" }),
      activated({
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { controller: "you", token: true }, "jeton artefact que vous contrôlez")],
        effects: [
          fx.modify(ref.target(), {
            addTypes: ["Artifact", "Creature"],
            addSubtypes: ["Construct"],
            setPower: 3,
            setToughness: 1,
            addKeywords: ["flying"],
          }),
        ],
        label: "Le jeton devient une Construction 3/1 volante jusqu'à la fin du tour",
      }),
    ],
  },
  "North Pole Patrol": {
    abilities: [
      activated({
        tap: true,
        targets: [
          { id: "t", label: "autre permanent que vous contrôlez", filter: { objects: { controller: "you", other: true } } },
        ],
        effects: [fx.untap(ref.target())],
        label: "Dégagez un autre de vos permanents",
      }),
      activated({
        mana: "{3}",
        waterbend: true,
        tap: true,
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.tap(ref.target())],
        label: "Maîtrise de l'eau {3} : engagez une créature adverse",
      }),
    ],
  },
  "Octopus Form": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 1, 1, ["hexproof"]), fx.untap(ref.target())],
    ),
  },
  "Otter-Penguin": {
    abilities: [
      triggered(when.draw(2), [fx.pump(ref.self, 1, 2), fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "Deuxième carte piochée : +1/+2 et imblocable ce tour-ci",
      }),
    ],
  },
  "Rowdy Snowballers": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Engagez une créature adverse, un marqueur d'étourdissement",
      }),
    ],
  },
  "Serpent of the Pass": {
    flashIf: THREE_LESSONS,
    costReduction: { generic: amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }) },
  },
  "Sokka's Haiku": {
    spell: spell(
      [target.spell("s"), target.permanent("l", ["Land"], {}, "terrain")],
      [fx.counter(ref.target("s")), fx.draw(1), fx.mill(3), fx.untap(ref.target("l"))],
    ),
  },
  "The Spirit Oasis": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ subtype: "Shrine", controller: "you" }))], {
        label: "Piochez une carte par Sanctuaire",
      }),
      triggered(when.enters({ subtype: "Shrine", controller: "you", other: true }), [fx.draw(1)], {
        label: "Un autre Sanctuaire : piochez une carte",
      }),
    ],
  },
  "Teo, Spirited Glider": {
    abilities: [
      triggered(
        when.attackWith(1, { keyword: "flying" }),
        [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "nl", storeFilter: { notTypes: ["Land"] } }),
          ...fx.when(
            cond.v("nl"),
            fx.reflexive([target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
          ),
        ],
        { label: "Piochez puis défaussez ; carte non-terrain : un marqueur +1/+1" },
      ),
    ],
  },
  "Tiger-Seal": {
    abilities: [
      triggered(when.yourUpkeep, [fx.tap(ref.self)], { label: "Engagez cette créature" }),
      triggered(when.draw(2), [fx.untap(ref.self)], { label: "Deuxième carte piochée : dégagez cette créature" }),
    ],
  },
  "Ty Lee, Chi Blocker": {
    // Flash et prouesse lus dans le texte. L'effet cesse quand Ty Lee quitte le champ de bataille.
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.modifyWhileSource(ref.target(), { addKeywords: ["doesntUntap"] })], {
        targets: [target.upTo(1, target.creature())],
        label: "Engagez une créature ; elle ne se dégage plus tant que vous contrôlez Ty Lee",
      }),
    ],
  },
  "Waterbender Ascension": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you" }, true),
        [fx.counters(ref.self, "quest"), ...fx.when(cond.counterAtLeast("quest", 4), fx.draw(1))],
        { label: "Un marqueur de quête ; à 4 ou plus, piochez une carte" },
      ),
      activated({
        mana: "{4}",
        waterbend: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Maîtrise de l'eau {4} : une créature est imblocable ce tour-ci",
      }),
    ],
  },
  "Waterbending Scroll": {
    abilities: [
      activated({
        mana: "{6}",
        tap: true,
        reduction: { generic: amount.count({ subtype: "Island", controller: "you" }) },
        effects: [fx.draw(1)],
        label: "Piochez une carte ({1} de moins par Île)",
      }),
    ],
  },
  "Watery Grasp": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { addKeywords: ["doesntUntap"] }, { label: "Ne se dégage pas" }),
      activated({
        mana: "{5}",
        waterbend: true,
        effects: [fx.moveTo(ref.attached, { to: "libraryTop", shuffle: true })],
        label: "Maîtrise de l'eau {5} : mélangez la créature enchantée dans la bibliothèque de son propriétaire",
      }),
    ],
  },
  "Yue, the Moon Spirit": {
    abilities: [
      activated({
        mana: "{5}",
        waterbend: true,
        tap: true,
        effects: [fx.castNow(ref.handOf(ref.you, { notTypes: ["Creature", "Land"] }), { free: true })],
        label: "Maîtrise de l'eau {5} : lancez gratuitement un sort non-créature de votre main",
      }),
    ],
  },
};
