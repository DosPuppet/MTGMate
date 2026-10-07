/**
 * Marvel's Spider-Man — cartes bleues (lot A). Flash, vol, vigilance et chaos (Mayhem) sont lus dans le texte ; le kicker
 * est écrit dans le script.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  ILLUSION_VILLAIN,
  modal,
  mode,
  playerStatic,
  ROBOT_FLYER,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** « Jusqu'à la fin du tour, la créature ciblée que vous contrôlez devient un [type] de base F/E … et gagne … » (Secret Identity). */
const becomes = (subtype: string, power: number, toughness: number, keywords: ("hexproof" | "flying" | "vigilance")[]) => [
  fx.modify(
    ref.target(),
    { setSubtypes: [subtype], setPower: power, setToughness: toughness, addKeywords: keywords },
    "endOfTurn",
  ),
];

export const BLUE: Record<string, CardScript> = {
  "Amazing Acrobatics": {
    // « Choisissez l'un ou les deux. »
    spell: modal(
      mode("Contrecarrez un sort", [target.spell("s")], [fx.counter(ref.target("s"))]),
      mode("Engagez une ou deux créatures", [target.between(1, 2, target.creature("c"))], [fx.tap(ref.target("c"))]),
      mode(
        "Les deux",
        [target.spell("s"), target.between(1, 2, target.creature("c"))],
        [fx.counter(ref.target("s")), fx.tap(ref.target("c"))],
      ),
    ),
  },
  "Beetle, Legacy Criminal": {
    abilities: [
      activated({
        mana: "{1}{U}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"])],
        label: "Exilez-le de votre cimetière : marqueur +1/+1 et vol jusqu'à la fin du tour",
      }),
    ],
  },
  "Doc Ock, Sinister Scientist": {
    abilities: [
      staticAbility(
        "self",
        { setPower: 8, setToughness: 8 },
        { condition: cond.amountAtLeast(amount.cardsIn("graveyard"), 8), label: "8/8 de base avec huit cartes au cimetière" },
      ),
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.controls({ subtype: "Villain", other: true }), label: "Défense talismanique avec un autre Méchant" },
      ),
    ],
  },
  "Doc Ock's Henchmen": {
    abilities: [triggered(when.attacksSelf, [fx.connive(ref.self)], { label: "Complote en attaquant" })],
  },
  "Flying Octobot": {
    abilities: [
      triggered(when.enters({ subtype: "Villain", controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        oncePerTurn: true,
        label: "Un autre Méchant arrive : un marqueur +1/+1 (une fois par tour)",
      }),
    ],
  },
  "Hide on the Ceiling": {
    spell: spell(
      [
        {
          id: "t",
          label: "artefact ou créature",
          filter: { objects: { types: ["Artifact", "Creature"] } },
          count: 99,
          countX: true,
        },
      ],
      [
        fx.exileCard(ref.target(), { name: "k" }),
        // Les cartes reviennent sous le contrôle de leur propriétaire (les jetons exilés cessent d'exister).
        fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
      ],
    ),
  },
  "Impostor Syndrome": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you", token: false }, true),
        [fx.copyToken(ref.eventObject, { nonlegendary: true })],
        { label: "Créez un jeton copie non légendaire de la créature" },
      ),
    ],
  },
  "Lady Octopus, Inspired Inventor": {
    abilities: [
      triggered(when.draw(1), [fx.counters(ref.self, "ingenuity")], { label: "Première carte piochée : marqueur d'ingéniosité" }),
      triggered(when.draw(2), [fx.counters(ref.self, "ingenuity")], { label: "Deuxième carte piochée : marqueur d'ingéniosité" }),
      activated({
        tap: true,
        effects: [
          fx.castNow(ref.handOf(ref.you, { types: ["Artifact"] }, amount.countersOn(ref.self, "ingenuity")), { free: true }),
        ],
        label: "Lancez gratuitement un sort d'artefact de VM au plus égale aux marqueurs d'ingéniosité",
      }),
    ],
  },
  "Madame Web, Clairvoyant": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Vous pouvez regarder la carte du dessus de votre bibliothèque" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ subtype: "Spider" }, { notTypes: ["Creature"] }] }, what: "spells" },
        label: "Lancez des sorts d'Araignée et des sorts non-créature depuis le dessus de votre bibliothèque",
      }),
      triggered(when.attackWith(), [...fx.may("Meuler une carte ?", fx.mill(1))], {
        label: "Vous attaquez : vous pouvez meuler une carte",
      }),
    ],
  },
  "Mysterio, Master of Illusion": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(
            ILLUSION_VILLAIN,
            amount.count({ types: ["Creature"], subtype: "Villain", controller: "you", token: false }),
            undefined,
            "illusions",
          ),
          fx.link(ref.stored("illusions")),
        ],
        { label: "Un jeton Illusion Méchant 3/3 par Méchant non-jeton que vous contrôlez" },
      ),
      triggered(when.leavesSelf, [fx.exile(ref.linked)], { label: "Exilez ces jetons" }),
    ],
  },
  "Mysterio's Phantasm": {
    abilities: [triggered(when.attacksSelf, [fx.mill(1)], { label: "Meulez une carte" })],
  },
  "Oscorp Research Team": {
    abilities: [activated({ mana: "{6}{U}", effects: [fx.draw(2)], label: "Piochez deux cartes" })],
  },
  "Robotics Mastery": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT_FLYER, 2)], { label: "Deux jetons Robot 1/1 volants" }),
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
    ],
  },
  "School Daze": {
    spell: modal(
      mode("Devoirs — Piochez trois cartes", [], [fx.draw(3)]),
      mode(
        "Combattre le crime — Contrecarrez un sort, piochez une carte",
        [target.spell()],
        [fx.counter(ref.target()), fx.draw(1)],
      ),
    ),
  },
  "Secret Identity": {
    spell: modal(
      mode(
        "Dissimuler — Citoyen 1/1 de base avec la défense talismanique",
        [target.creature("t", { controller: "you" })],
        becomes("Citizen", 1, 1, ["hexproof"]),
      ),
      mode(
        "Révéler — Héros 3/4 de base avec le vol et la vigilance",
        [target.creature("t", { controller: "you" })],
        becomes("Hero", 3, 4, ["flying", "vigilance"]),
      ),
    ),
  },
  "Spider-Byte, Web Warden": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland())],
        label: "Renvoyez jusqu'à un permanent non-terrain en main",
      }),
    ],
  },
  "Spider-Man No More": {
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility(
        "attached",
        {
          setSubtypes: ["Citizen"],
          setPower: 1,
          setToughness: 1,
          loseAllAbilities: true,
          addKeywords: ["defender"],
        },
        { label: "Citoyen 1/1 de base avec le défenseur, sans ses autres capacités" },
      ),
    ],
  },
  "Unstable Experiment": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c", { controller: "you" }))],
      [fx.draw(1, ref.target("p")), fx.connive(ref.target("c"))],
    ),
  },
  "Whoosh!": {
    kicker: "{1}{U}",
    spell: spell([target.nonland()], [fx.bounce(ref.target()), ...fx.when(cond.kicked, fx.draw(1))]),
  },
};
