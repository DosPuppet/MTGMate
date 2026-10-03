/**
 * The Hobbit — cartes multicolores (lot A). Le vol, la portée, la vigilance, la menace, l'initiative et Équiper sont lus
 * dans le texte, ainsi que Storied (récit durable). Recruter (« piochez une carte, puis défaussez une carte ; si vous avez
 * défaussé une carte non-terrain, créez un jeton Humain Soldat 1/1 blanc ») est dans hob/common.ts.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cond,
  ELF,
  eventReplacement,
  fx,
  playerStatic,
  recruit,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** « un Gobelin, un Orque ou une Armée que vous contrôlez » */
const GOBLIN_ORC_ARMY: ObjectFilter = { anySubtype: ["Goblin", "Orc", "Army"], controller: "you" };

export const MULTI: Record<string, CardScript> = {
  "Bard, King of Dale": {
    // Approximation : « la première carte que vous piochez pendant chacune de vos étapes de pioche » est lue comme « une
    // pioche pendant votre étape de pioche, si vous n'avez encore pioché aucune carte ce tour-ci » (une carte piochée
    // pendant votre entretien fait doubler la pioche de l'étape).
    abilities: [
      eventReplacement({
        event: "draw",
        to: "you",
        modify: { times: 2 },
        condition: cond.not(cond.all(cond.yourTurn, cond.step("draw"), cond.not(cond.drewAtLeast(1)))),
        label: "Piochez deux cartes au lieu d'une (sauf la première de votre étape de pioche)",
      }),
      eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Deux fois plus de jetons" }),
    ],
  },
  "Bard the Bowman": {
    abilities: [
      triggered(when.draw(2), [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["lifelink"] })], {
        targets: [target.creature()],
        label: "Deuxième carte piochée : un marqueur +1/+1 et le lien de vie",
      }),
    ],
  },
  "Bard's Company": {
    flashIf: cond.controls({ subtype: "Human" }),
    abilities: [
      staticAbility({ ...YOUR_CREATURES, other: true }, { power: 1, toughness: 1 }, { label: "Vos autres créatures : +1/+1" }),
      ...[when.entersSelf, when.attacksSelf].map((trigger) => triggered(trigger, recruit(), { label: "Recruter" })),
    ],
  },
  "Bifur, Melodic Rider": {
    // Storied : lu dans le texte.
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(trigger, [fx.addCounters(ref.target(), 1)], {
          targets: [target.creature()],
          label: "Un marqueur +1/+1 sur une créature",
        }),
      ),
      playerStatic({
        triggerMod: { effect: "again", sources: { subtype: "Dwarf", controller: "you" } },
        condition: cond.enduringStory,
        label: "Récit durable : les capacités déclenchées de vos Nains se déclenchent une fois de plus",
      }),
    ],
  },
  "Bolg of the North": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(
            cond.v("s"),
            fx.reflexive(
              [target.creature("t", { other: true })],
              [
                fx.damageStoringExcess(amount.powerOf(ref.target("sac")), ref.target(), "x"),
                ...fx.when(cond.v("x"), fx.amass(ref.you, "Goblin", amount.v("x"))),
              ],
              { sac: ref.stored("s") },
            ),
          ),
        ],
        { label: "Sacrifice facultatif : blessures égales à sa force ; l'excès amasse des Gobelins" },
      ),
    ],
  },
  "Bolg's Company": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["haste"] },
        { condition: cond.controls({ subtype: "Goblin", other: true }), label: "Célérité avec un autre Gobelin" },
      ),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Goblin" } },
        effects: [fx.addMana("B", "R")],
        label: "Sacrifiez un autre Gobelin : ajoutez {B}{R}",
      }),
    ],
  },
  "The Chief Warg": {
    // Menace : lue dans le texte.
    abilities: [
      triggered(when.attackWith(1), [fx.draw(1), fx.loseLife(1)], {
        condition: cond.ferocious,
        label: "Férocité : piochez une carte et perdez 1 PV",
      }),
    ],
  },
  "Duskwatch Hunter": {
    abilities: [
      blockAbility(block.notBy({ token: true }, "Ne peut pas être bloquée par des jetons")),
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Un marqueur +1/+1 sur une créature",
      }),
    ],
  },
  "Eagle's Rescue": {
    // Approximation : l'Aura revient d'abord attachée à un hôte choisi comme pour toute Aura mise sur le champ de
    // bataille (303.4f, une question de plus s'il y en a plusieurs), puis elle est attachée à la créature ciblée.
    enchant: { filter: { types: ["Creature"] }, label: "créature" },
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["flying"] }, { label: "+2/+2 et le vol" }),
      activated({
        mana: "{2}{W/U}{W/U}",
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", maxPower: 1 })],
        effects: [fx.moveTo(ref.selfCard, { to: "battlefield" }, { name: "a" }), fx.attach(ref.target(), ref.stored("a"))],
        label: "Revient du cimetière attachée à une de vos créatures de force 1 ou moins",
      }),
    ],
  },
  "Fearsome Goblin Pair": {
    abilities: [triggered(when.diesSelf, [fx.amass(ref.you, "Goblin", 4)], { label: "Amassez des Gobelins 4" })],
  },
  "Goblin Plate Mail": {
    // Équiper {4} : lu dans le texte.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.amass(ref.you, "Goblin", 1),
          // L'Armée qui vient de recevoir le marqueur : la première que vous contrôlez, comme pour amasser.
          fx.attach(ref.permanentsOf(ref.you, { subtype: "Army" })),
        ],
        { label: "Amassez des Gobelins 1, puis attachez-le à l'Armée" },
      ),
      staticAbility("attached", { power: 1, addKeywords: ["menace"] }, { label: "+1/+0 et la menace" }),
    ],
  },
  "The Great Goblin": {
    abilities: [
      triggered(when.youPutCounters(GOBLIN_ORC_ARMY), [fx.damage(2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Marqueurs sur un Gobelin, un Orque ou une Armée : 2 blessures à un adversaire",
      }),
      triggered(
        when.dies({ ...GOBLIN_ORC_ARMY, other: true }),
        [fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })],
        { label: "Exilez la carte du dessus, jouable jusqu'à la fin de votre prochain tour" },
      ),
    ],
  },
  "Mirkwood Nurturer": {
    abilities: [
      triggered(when.entersSelf, [...fx.when(cond.targetChosen("t"), fx.bounce(ref.target()), fx.addCounters(ref.self, 1))], {
        targets: [
          target.upTo(
            1,
            targetObj("t", { permanent: true, controller: "you", other: true }, "autre permanent que vous contrôlez"),
          ),
        ],
        label: "Renvoie un autre de vos permanents ; un marqueur +1/+1",
      }),
    ],
  },
  "Nori, Teller of Tales": {
    abilities: [
      triggered(when.attacksSelf, [fx.modify(ref.target(), { addKeywords: ["firstStrike"] })], {
        targets: [target.creature("t", { attacking: true })],
        label: "Une créature attaquante gagne l'initiative",
      }),
    ],
  },
  "Patient Instructor": {
    // Vigilance : lue dans le texte.
    abilities: [triggered(when.entersSelf, recruit(), { label: "Recruter" })],
  },
  "Silvan Reveler": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "l", storeFilter: { types: ["Land"] } }),
          ...fx.when(cond.v("l"), fx.toBattlefield(ref.stored("l"), { tapped: true })),
        ],
        { label: "Piochez puis défaussez ; un terrain défaussé arrive engagé" },
      ),
      triggered(
        when.landfall,
        fx.mayPay("{1}{G}{U}", "Payer {1}{G}{U} pour reprendre Silvan Reveler en main ?", fx.toHand(ref.selfCard)),
        { fromGraveyard: true, label: "Landfall : revient du cimetière dans la main" },
      ),
    ],
  },

  // --- Thranduil, Sindarin Liege // Silvan Rally --------------------------------
  "Thranduil, Sindarin Liege": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, subtype: "Elf", other: true },
        { power: 1, toughness: 1 },
        { label: "Vos autres Elfes : +1/+1" },
      ),
      triggered(when.landfall, [fx.createTokens(ELF)], { label: "Landfall : un Elfe 1/1" }),
    ],
  },
  "Silvan Rally": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Land"] },
          { to: "hand" },
          { count: 2, min: 0, pool: ref.stored("m"), prompt: "Jusqu'à deux cartes de terrain meulées dans votre main" },
        ),
      ],
    ),
  },

  "Thranduil's Company": {
    abilities: [
      playerStatic({
        extraLands: 1,
        condition: cond.controls({ subtype: "Elf", other: true }),
        label: "Avec un autre Elfe : un terrain supplémentaire à chacun de vos tours",
      }),
      triggered(when.landfall, [fx.addCounters(ref.target(), 2), fx.modify(ref.target(), { addKeywords: ["vigilance"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Landfall : deux marqueurs +1/+1 et la vigilance",
      }),
    ],
  },
  "Tom, Bert, and William": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.draw(amount.powerOf(ref.costSacrificed)), fx.discard(1)],
        label: "Piochez autant que la force de la créature sacrifiée, puis défaussez",
      }),
      // « S'ils étaient une créature » : la mort (en tant que créature) l'assure ; revenus en artefact, ils ne
      // reviennent plus.
      triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { setTypes: ["Artifact"], setSubtypes: [] })], {
        label: "Reviennent sur le champ de bataille en artefact",
      }),
    ],
  },
};
