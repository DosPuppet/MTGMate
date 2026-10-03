/** Lorwyn Eclipsed — cartes multicolores et hybrides. */
import type { Amount, ModeDef, ObjectFilter, Ref } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  castPermission,
  cond,
  costReducer,
  ELF_BG,
  entersWith,
  fx,
  KITHKIN,
  MERFOLK_WU,
  mode,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  WORM_BG,
  when,
} from "./common";

/**
 * « Choisissez deux — » : chaque paire de modes devient un mode (comme le Spree). Les identifiants de cibles doivent
 * être distincts d'un mode à l'autre.
 */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1)) {
      out.push({
        label: `${a.label} + ${b.label}`,
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
    }
  });
  return { modes: out };
}

/** Créatures que contrôle le joueur désigné. */
const creaturesOf = (player: Ref): Ref => ref.permanentsOf(player, { types: ["Creature"] });

/** Ordres de Lorwyn : « Créez un jeton qui est une copie de [créature de la tribu] ciblée que vous contrôlez. » */
const copyKin = (subtype: string, label: string): ModeDef =>
  mode(
    `Copie d'un ${label} que vous contrôlez`,
    [{ id: "kin", label: `${label} que vous contrôlez`, filter: { objects: { subtype, controller: "you" } } }],
    [fx.copyToken(ref.target("kin"))],
  );

/** Cartes « Eclipsed » : regardez les quatre cartes du dessus, révélez-en une de la tribu ou d'un des deux types de terrain. */
const eclipsed = (kin: string, land1: string, land2: string, label: string): CardScript => ({
  abilities: [
    triggered(
      when.entersSelf,
      [
        fx.lookAtTop(4, {
          filter: { anyOf: [{ subtype: kin }, { subtype: land1 }, { subtype: land2 }] },
          count: 1,
          rest: "bottom",
        }),
      ],
      { label },
    ),
  ],
});

/** « X est la différence entre sa force et son endurance » (Doran). */
const ptGap = (r: Ref): Amount =>
  amount.max(
    amount.plus(amount.powerOf(r), amount.neg(amount.toughnessOf(r))),
    amount.plus(amount.toughnessOf(r), amount.neg(amount.powerOf(r))),
  );

/** Défense talismanique contre chacune de ses couleurs (Tam) : une statique par couleur. */
const COLOR_NAMES = { W: "blanc", U: "bleu", B: "noir", R: "rouge", G: "vert" } as const;
const tamHexproof = (Object.keys(COLOR_NAMES) as (keyof typeof COLOR_NAMES)[]).map((c) =>
  staticAbility(
    { types: ["Creature"], controller: "you", other: true, colors: [c] },
    { addProtections: [protection.hexproofFrom({ colors: [c] }, `Défense talismanique contre le ${COLOR_NAMES[c]}`)] },
    { label: `Vos autres créatures ${COLOR_NAMES[c]}s ont la défense talismanique contre le ${COLOR_NAMES[c]}` },
  ),
);

const MERFOLK_YOU: ObjectFilter = { subtype: "Merfolk", controller: "you" };

export const MULTI: Record<string, CardScript> = {
  "Sanar, Innovative First-Year": {
    abilities: [
      triggered(
        when.step("main1", "you"),
        [
          fx.revealUntilN({ nonland: true }, amount.colorsAmong(), undefined, "r"),
          fx.pickFromZone(
            "graveyard",
            {},
            { to: "exile" },
            {
              pool: ref.stored("r"),
              count: 5,
              min: 0,
              onePerColorOf: { permanent: true, controller: "you" },
              store: "e",
              prompt: "Pour chaque couleur parmi vos permanents, vous pouvez exiler une carte révélée de cette couleur",
            },
          ),
          fx.shuffle(ref.you),
          fx.grantPlay(ref.stored("e")),
        ],
        { label: "Éclatant — révélez jusqu'à X cartes non-terrain ; exilez-en une par couleur, jouables ce tour-ci" },
      ),
    ],
  },
  "Raiding Schemes": {
    // Conspiration (702.78) accordée : les deux créatures sont engagées quand la capacité se résout, pas en lançant.
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [
          fx.tapChosen({ types: ["Creature"] }, "c", { exactly: 2, sharesColorWith: ref.eventObject }),
          ...fx.when(cond.v("c", 2), fx.copySpell(ref.eventObject, 1)),
        ],
        { label: "Conspiration : engagez deux créatures qui partagent une couleur avec le sort pour le copier" },
      ),
    ],
  },
  "Lluwen, Imperfect Naturalist": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
            { to: "libraryTop" },
            {
              pool: ref.stored("m"),
              min: 0,
              prompt: "Vous pouvez mettre une carte de créature ou de terrain sur votre bibliothèque",
            },
          ),
        ],
        { label: "Meulez quatre cartes ; une créature ou un terrain parmi elles sur votre bibliothèque" },
      ),
      activated({
        mana: "{2}{B/G}{B/G}{B/G}",
        tap: true,
        discard: 1,
        discardFilter: { types: ["Land"] },
        effects: [fx.createTokens(WORM_BG, amount.countIn("graveyard", { types: ["Land"] }))],
        label: "Défaussez une carte de terrain : un Ver 1/1 par carte de terrain dans votre cimetière",
      }),
    ],
  },
  "Dream Harvest": {
    spell: spell([], [fx.exileUntilTotalManaValue(ref.eachOpponent, 5, "h"), fx.grantPlay(ref.stored("h"), { free: true })]),
  },
  // Vol lu dans le texte.
  "Maralen, Fae Ascendant": {
    abilities: [
      triggered(
        when.enters({ controller: "you", anyOf: [{ subtype: "Elf" }, { subtype: "Faerie" }] }),
        [fx.exileTop(ref.target(), 2, "m"), fx.link(ref.stored("m"))],
        {
          targets: [target.player("t", "opponent")],
          label: "Exilez les deux cartes du dessus de la bibliothèque de l'adversaire ciblé",
        },
      ),
      castPermission({
        linkedCards: true,
        linkedFilter: {},
        linkedAnyOwner: true,
        linkedFree: true,
        linkedOncePerTurn: true,
        linkedThisTurn: true,
        linkedMaxManaValue: amount.count({ controller: "you", anyOf: [{ subtype: "Elf" }, { subtype: "Faerie" }] }),
        label: "Une fois par tour : lancez gratuitement un sort exilé avec Maralen ce tour-ci (VM ≤ Elfes et Faeries)",
      }),
    ],
  },
  "Shadow Urchin": {
    abilities: [
      triggered(when.attacksSelf, [fx.blight(1)], { label: "Flétrir 1" }),
      // « Jusqu'à votre prochaine étape de fin » : ce tour-ci si c'est le vôtre, sinon jusqu'à la fin de votre prochain tour.
      triggered(
        when.dies({ types: ["Creature"], controller: "you", withCounter: "any" }),
        [
          fx.exileTop(ref.you, amount.countersOn(ref.eventObject, "any"), "u"),
          ...fx.when(cond.yourTurn, fx.grantPlay(ref.stored("u"))),
          ...fx.when(cond.not(cond.yourTurn), fx.grantPlay(ref.stored("u"), { untilYourNextTurn: true })),
        ],
        { label: "Exilez autant de cartes que de marqueurs ; jouables jusqu'à votre prochaine étape de fin" },
      ),
    ],
  },
  // --- Changelins et mots-clés seuls (tout est lu dans le texte) ----------------
  "Chitinous Graspling": {},
  "Gangly Stompling": {},
  "Mischievous Sneakling": {},
  "Prideful Feastling": {},

  // --- Blanc-noir ---------------------------------------------------------------
  "Abigale, Eloquent First-Year": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), { loseAllAbilities: true }, "permanent"),
          // Marqueurs de capacité (122.1b) : posés après la perte des capacités, ils s'appliquent.
          fx.counters(ref.target(), "flying"),
          fx.counters(ref.target(), "firstStrike"),
          fx.counters(ref.target(), "lifelink"),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Perd toutes ses capacités ; marqueurs vol, initiative et lien de vie",
        },
      ),
    ],
  },
  "Reaping Willow": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      activated({
        mana: "{1}{W/B}",
        removeCounters: { kind: "any", n: 2 },
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "carte de créature de VM 3 ou moins"),
        ],
        effects: [fx.toBattlefield(ref.target())],
        label: "Renvoie une créature de VM 3 ou moins sur le champ de bataille",
      }),
    ],
  },

  // --- Blanc-bleu ---------------------------------------------------------------
  "Deepchannel Duelist": {
    abilities: [
      triggered(when.yourEndStep, [fx.untap(ref.target())], {
        targets: [target.creature("t", MERFOLK_YOU)],
        label: "Dégagez un Ondin que vous contrôlez",
      }),
      staticAbility(
        { ...MERFOLK_YOU, types: ["Creature"], other: true },
        { power: 1, toughness: 1 },
        {
          label: "Vos autres Ondins ont +1/+1",
        },
      ),
    ],
  },
  "Deepway Navigator": {
    abilities: [
      triggered(when.entersSelf, [fx.untapAll({ ...MERFOLK_YOU, other: true })], { label: "Dégagez vos autres Ondins" }),
      staticAbility(
        { ...MERFOLK_YOU, types: ["Creature"] },
        { power: 1 },
        {
          condition: cond.amountAtLeast(amount.turnEvents({ event: "attack", who: "you", subtype: "Merfolk" }), 3),
          label: "Trois Ondins ou plus ont attaqué : vos Ondins ont +1/+0",
        },
      ),
    ],
  },
  "Eclipsed Merrow": eclipsed("Merfolk", "Plains", "Island", "Révélez un Ondin, une Plaine ou une Île"),
  "Merrow Skyswimmer": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MERFOLK_WU)], { label: "Jeton Ondin 1/1" })],
  },
  "Sygg's Command": {
    spell: chooseTwo(
      copyKin("Merfolk", "Ondin"),
      mode(
        "Les créatures d'un joueur gagnent le lien de vie",
        [target.player("ll")],
        [fx.modify(creaturesOf(ref.target("ll")), { addKeywords: ["lifelink"] })],
      ),
      mode("Un joueur pioche une carte", [target.player("dr")], [fx.draw(1, ref.target("dr"))]),
      mode(
        "Engagez une créature ; marqueur d'étourdissement",
        [target.creature("st")],
        [fx.tap(ref.target("st")), fx.counters(ref.target("st"), "stun", 1)],
      ),
    ),
  },

  // --- Bleu-noir ----------------------------------------------------------------
  "Voracious Tome-Skimmer": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.mayPayLife(1, "Payer 1 point de vie pour piocher une carte ?", fx.draw(1))], {
        label: "Payez 1 PV : piochez une carte",
      }),
    ],
  },

  // --- Bleu-rouge ---------------------------------------------------------------
  "Ashling's Command": {
    spell: chooseTwo(
      copyKin("Elemental", "Élémental"),
      mode("Un joueur pioche deux cartes", [target.player("dr")], [fx.draw(2, ref.target("dr"))]),
      mode("2 blessures à chaque créature d'un joueur", [target.player("dm")], [fx.damage(2, creaturesOf(ref.target("dm")))]),
      mode("Un joueur crée deux Trésors", [target.player("tr")], [fx.createTokens(TREASURE, 2, ref.target("tr"))]),
    ),
  },
  "Eclipsed Flamekin": eclipsed("Elemental", "Island", "Mountain", "Révélez un Élémental, une Île ou une Montagne"),
  "Flaring Cinder": {
    abilities: [when.entersSelf, when.castSpell("you", { minManaValue: 4 })].map((trigger) =>
      triggered(
        trigger,
        fx.may(
          "Défausser une carte pour piocher une carte ?",
          fx.discard(1, ref.you, { store: "d" }),
          fx.when(cond.v("d"), fx.draw(1)),
        ),
        { label: "Défaussez une carte : piochez une carte" },
      ),
    ),
  },
  "Twinflame Travelers": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { subtype: "Elemental", controller: "you", other: true } },
        label: "Les capacités déclenchées de vos autres Élémentaux se déclenchent une fois de plus",
      }),
    ],
  },

  // --- Noir-rouge ---------------------------------------------------------------
  "Boggart Cursecrafter": {
    abilities: [
      triggered(when.dies({ subtype: "Goblin", controller: "you", other: true }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 blessure à chaque adversaire",
      }),
    ],
  },
  "Chaos Spewer": {
    abilities: [
      triggered(when.entersSelf, [fx.unlessPays(ref.you, { mana: "{2}" }, fx.blight(2))], {
        label: "Payez {2} ou flétrissez 2",
      }),
    ],
  },
  "Eclipsed Boggart": eclipsed("Goblin", "Swamp", "Mountain", "Révélez un Gobelin, un Marais ou une Montagne"),
  "Grub's Command": {
    spell: chooseTwo(
      copyKin("Goblin", "Gobelin"),
      mode(
        "Les créatures d'un joueur gagnent +1/+1 et la célérité",
        [target.player("pu")],
        [fx.pump(creaturesOf(ref.target("pu")), 1, 1, ["haste"])],
      ),
      mode(
        "Détruisez un artefact ou une créature",
        [target.permanent("de", ["Artifact", "Creature"], {}, "artefact ou créature")],
        [fx.destroy(ref.target("de"))],
      ),
      mode(
        "Un joueur meule cinq cartes et prend les Gobelins",
        [target.player("mi")],
        [fx.mill(5, ref.target("mi"), { name: "g" }), fx.toHand(ref.filtered(ref.stored("g"), { subtype: "Goblin" }))],
      ),
    ),
  },

  // --- Noir-vert ----------------------------------------------------------------
  "Eclipsed Elf": eclipsed("Elf", "Swamp", "Forest", "Révélez un Elfe, un Marais ou une Forêt"),
  "High Perfect Morcant": {
    abilities: [
      triggered(when.enters({ subtype: "Elf", controller: "you" }), [fx.blight(1, ref.eachOpponent)], {
        label: "Chaque adversaire flétrit 1",
      }),
      activated({
        tapOthers: { filter: { subtype: "Elf" }, count: 3, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.proliferate()],
        label: "Engagez trois Elfes : proliférez",
      }),
    ],
  },
  "Morcant's Loyalist": {
    abilities: [
      staticAbility(
        { subtype: "Elf", types: ["Creature"], controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Vos autres Elfes ont +1/+1",
        },
      ),
      triggered(when.diesSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { subtype: "Elf", other: true }, "you", "autre carte d'Elfe de votre cimetière")],
        label: "Renvoie un autre Elfe de votre cimetière en main",
      }),
    ],
  },
  "Stoic Grove-Guide": {
    abilities: [
      activated({
        mana: "{1}{B/G}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(ELF_BG)],
        label: "Exilez-la de votre cimetière : jeton Elfe 2/2",
      }),
    ],
  },
  "Trystan's Command": {
    spell: chooseTwo(
      copyKin("Elf", "Elfe"),
      mode(
        "Une ou deux cartes de permanent reviennent en main",
        [target.between(1, 2, target.cardInGraveyard("gy", { permanent: true }, "you", "carte de permanent de votre cimetière"))],
        [fx.toHand(ref.target("gy"))],
      ),
      mode(
        "Détruisez une créature ou un enchantement",
        [target.permanent("de", ["Creature", "Enchantment"], {}, "créature ou enchantement")],
        [fx.destroy(ref.target("de"))],
      ),
      mode(
        "Les créatures d'un joueur gagnent +3/+3 et se dégagent",
        [target.player("pu")],
        [fx.pump(creaturesOf(ref.target("pu")), 3, 3), fx.untap(creaturesOf(ref.target("pu")))],
      ),
    ),
  },

  // --- Rouge-blanc --------------------------------------------------------------
  "Bre of Clan Stoutarm": {
    abilities: [
      activated({
        mana: "{1}{W}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.modify(ref.target(), { addKeywords: ["flying", "lifelink"] })],
        label: "Une autre créature gagne le vol et le lien de vie",
      }),
      triggered(
        when.yourEndStep,
        [
          fx.exileUntil({ nonland: true }, "x"),
          // Lancée gratuitement si sa VM ne dépasse pas les PV gagnés ce tour-ci ; sinon (ou refusée), en main.
          fx.castNow(ref.stored("x"), { free: true, maxManaValue: amount.lifeGainedThisTurn }),
          fx.toHand(ref.stored("x")),
        ],
        {
          condition: cond.lifeGainedAtLeast(1),
          label: "Exilez jusqu'à une carte non-terrain : lancez-la gratuitement ou prenez-la",
        },
      ),
    ],
  },
  Catharsis: {
    // Évocation lue dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KITHKIN, 2)], {
        condition: cond.spent("W", 2),
        label: "{W}{W} dépensé : deux jetons Kithkin 1/1",
      }),
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], controller: "you" }, 1, 1, ["haste"])], {
        condition: cond.spent("R", 2),
        label: "{R}{R} dépensé : vos créatures gagnent +1/+1 et la célérité",
      }),
    ],
  },
  "Feisty Spikeling": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Initiative pendant votre tour" },
      ),
    ],
  },
  "Hovel Hurler": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Arrive avec deux marqueurs -1/-1" }),
      activated({
        mana: "{R/W}{R/W}",
        removeCounters: { kind: "any", n: 1 },
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.pump(ref.target(), 1, 0, ["flying"])],
        label: "Une autre créature gagne +1/+0 et le vol",
      }),
    ],
  },
  "Kirol, Attentive First-Year": {
    abilities: [
      // Approximation : la cible n'est pas limitée aux capacités que vous contrôlez (le moteur ne filtre pas les éléments
      // de pile par contrôleur).
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 2, includeSelf: true },
        oncePerTurn: true,
        targets: [
          {
            id: "t",
            label: "capacité déclenchée que vous contrôlez",
            filter: { stackItems: { triggeredOnly: true } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copiez une capacité déclenchée",
      }),
    ],
  },

  // --- Vert-blanc ---------------------------------------------------------------
  "Brigid's Command": {
    spell: chooseTwo(
      copyKin("Kithkin", "Kithkin"),
      mode("Un joueur crée un jeton Kithkin 1/1", [target.player("kt")], [fx.createTokens(KITHKIN, 1, ref.target("kt"))]),
      mode("Une créature gagne +3/+3", [target.creature("pu", { controller: "you" })], [fx.pump(ref.target("pu"), 3, 3)]),
      mode(
        "Une de vos créatures se bat contre une créature adverse",
        [target.creature("fa", { controller: "you" }), target.creature("fb", { controller: "opponent" })],
        [fx.fight(ref.target("fa"), ref.target("fb"))],
      ),
    ),
  },
  "Eclipsed Kithkin": eclipsed("Kithkin", "Forest", "Plains", "Révélez un Kithkin, une Forêt ou une Plaine"),
  "Figure of Fable": {
    abilities: [
      activated({
        mana: "{G/W}",
        effects: [fx.modify(ref.self, { setSubtypes: ["Kithkin", "Scout"], setPower: 2, setToughness: 3 }, "permanent")],
        label: "Devient un Kithkin Éclaireur 2/3",
      }),
      activated({
        mana: "{1}{G/W}{G/W}",
        effects: [
          fx.when(
            cond.sourceMatches({ subtype: "Scout" }),
            fx.modify(ref.self, { setSubtypes: ["Kithkin", "Soldier"], setPower: 4, setToughness: 5 }, "permanent"),
          ),
        ],
        label: "Éclaireur : devient un Kithkin Soldat 4/5",
      }),
      activated({
        mana: "{3}{G/W}{G/W}{G/W}",
        effects: [
          fx.when(
            cond.sourceMatches({ subtype: "Soldier" }),
            fx.modify(
              ref.self,
              {
                setSubtypes: ["Kithkin", "Avatar"],
                setPower: 7,
                setToughness: 8,
                addProtections: [protection.from({ controller: "opponent" }, "Protection contre chacun de vos adversaires")],
              },
              "permanent",
            ),
          ),
        ],
        label: "Soldat : devient un Kithkin Avatar 7/8 avec la protection contre vos adversaires",
      }),
    ],
  },
  "Thoughtweft Lieutenant": {
    abilities: [
      triggered(when.enters({ subtype: "Kithkin", controller: "you" }), [fx.pump(ref.target(), 1, 1, ["trample"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Une de vos créatures gagne +1/+1 et le piétinement",
      }),
    ],
  },
  "Wary Farmer": {
    abilities: [
      triggered(when.yourEndStep, [fx.surveil(1)], {
        // « une autre créature est arrivée sous votre contrôle ce tour-ci » : sans compter le Fermier lui-même.
        condition: cond.any(
          cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }), 2),
          cond.all(
            cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }), 1),
            cond.not(cond.sourceMatches({ enteredThisTurn: true })),
          ),
        ),
        label: "Surveillez 1",
      }),
    ],
  },

  // --- Vert-bleu ----------------------------------------------------------------
  "Glister Bairn": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), amount.colorsAmong(), amount.colorsAmong())], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Vivid : +X/+X, X étant le nombre de couleurs parmi vos permanents",
      }),
    ],
  },
  "Tam, Mindful First-Year": {
    abilities: [
      ...tamHexproof,
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.modify(ref.target(), { setColors: ["W", "U", "B", "R", "G"] })],
        label: "Une de vos créatures devient de toutes les couleurs",
      }),
    ],
  },
  Wistfulness: {
    // Évocation lue dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.exile(ref.target())], {
        condition: cond.spent("G", 2),
        targets: [
          target.permanent("t", ["Artifact", "Enchantment"], { controller: "opponent" }, "artefact ou enchantement adverse"),
        ],
        label: "{G}{G} dépensé : exilez un artefact ou un enchantement adverse",
      }),
      triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], {
        condition: cond.spent("U", 2),
        label: "{U}{U} dépensé : piochez deux cartes, puis défaussez-en une",
      }),
    ],
  },

  // --- Rouge-vert ---------------------------------------------------------------
  "Noggle Robber": {
    abilities: [when.entersSelf, when.diesSelf].map((trigger) =>
      triggered(trigger, [fx.createTokens(TREASURE)], { label: "Jeton Trésor" }),
    ),
  },
  Vibrance: {
    // Évocation lue dans le texte.
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        condition: cond.spent("R", 2),
        targets: [target.any()],
        label: "{R}{R} dépensé : 3 blessures à n'importe quelle cible",
      }),
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }), fx.gainLife(2)], {
        condition: cond.spent("G", 2),
        label: "{G}{G} dépensé : cherchez un terrain, gagnez 2 PV",
      }),
    ],
  },

  // --- Trois couleurs -----------------------------------------------------------
  "Doran, Besieged by Time": {
    abilities: [
      costReducer(
        { types: ["Creature"], toughnessAbovePower: true },
        1,
        "Vos sorts de créature d'endurance supérieure à leur force coûtent {1} de moins",
      ),
      ...[when.attacks({ types: ["Creature"], controller: "you" }), when.blocks({ types: ["Creature"], controller: "you" })].map(
        (trigger) =>
          triggered(trigger, [fx.pump(ref.eventObject, ptGap(ref.eventObject), ptGap(ref.eventObject))], {
            label: "+X/+X, X étant l'écart entre sa force et son endurance",
          }),
      ),
    ],
  },
};
