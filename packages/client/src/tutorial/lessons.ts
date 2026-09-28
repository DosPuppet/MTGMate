/**
 * Les leçons du tutoriel : chacune est un extrait de partie mis en scène (cartes de Foundations), avec un adversaire
 * scripté et une suite d'étapes. Toute modification est rejouée par `client/test/tutorial.test.ts`.
 * Textes en français, au vouvoiement ; les symboles de mana ({G}, {W}…) sont dessinés par la bulle du guide.
 */
import {
  all,
  type Ctx,
  gameOver,
  hovered,
  inGraveyard,
  type Lesson,
  lifeOf,
  myStep,
  onField,
  onStack,
  pendingMine,
  stackEmpty,
} from "./runtime";

const many = (n: number, name: string): string[] => Array.from({ length: n }, () => name);

const powerOf = (c: Ctx, name: string) => c.view.battlefield.find((o) => o.name === name)?.power ?? 0;
/** Le tour a avancé au-delà du tour n (la vue du tour adverse peut être sautée quand l'adversaire n'a rien fait de visible). */
const pastTurn = (n: number) => (c: Ctx) => c.view.turn.number > n;
/** Le joueur doit décider, pendant le tour indiqué (quelle que soit la décision). */
const mineAtTurn = (n: number) => (c: Ctx) => c.view.turn.number === n && c.view.pending?.player === c.view.viewer;

export const LESSONS: Lesson[] = [
  // -------------------------------------------------------------------------
  {
    id: "ecran",
    title: "Le but du jeu et l'écran",
    summary: "Points de vie, champ de bataille, main, bibliothèque, cimetière et phases.",
    scenario: {
      active: "you",
      turn: 3,
      you: {
        library: ["Plains", ...many(10, "Forest")],
        hand: ["Bear Cub", "Giant Growth", "Forest"],
        battlefield: ["Forest", "Plains", "Llanowar Elves", "Savannah Lions"],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: many(4, "Mountain"),
        battlefield: ["Mountain", "Mountain", "Swab Goblin"],
      },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        text: "Bienvenue ! Ce tutoriel vous apprend **Magic: The Gathering** pas à pas, sur de courts extraits de partie. Deux joueurs s'affrontent avec leur paquet de cartes, appelé **deck**.",
      },
      {
        next: true,
        target: "myLife",
        text: "Voici vos **points de vie** : vous commencez à 20. Un joueur qui tombe à 0 perd la partie.",
      },
      {
        next: true,
        target: "oppLife",
        text: "Et voici ceux de votre adversaire, en haut. Votre but : les faire tomber à 0.",
      },
      {
        next: true,
        target: "myField",
        text: "Le **champ de bataille** : en bas, vos cartes en jeu (vos **permanents**) ; en haut, celles de l'adversaire. Vos **terrains** produisent du mana, vos **créatures** combattent.",
      },
      {
        next: true,
        target: "hand",
        text: "Votre **main** : les cartes que vous pouvez jouer. L'adversaire n'en voit que le nombre.",
      },
      {
        next: true,
        target: "library",
        text: "Votre **bibliothèque** : le reste de votre deck, face cachée. Vous piochez une carte au début de chacun de vos tours.",
      },
      {
        next: true,
        target: "graveyard",
        text: "Votre **cimetière** : les créatures détruites et les sorts déjà joués y vont. Cliquez dessus pour le consulter.",
      },
      {
        next: true,
        target: "phaseBar",
        text: "La **barre des phases** : chaque tour suit le même ordre. Début (dégagement, entretien, pioche), première phase principale, combat, seconde phase principale, fin. La phase en cours est en surbrillance.",
      },
      {
        next: true,
        target: "mainButton",
        text: "Le **bouton principal** fait avancer la partie : aller au combat, valider une attaque, finir votre tour… Raccourci : la barre Espace.",
      },
      {
        target: { card: "Savannah Lions", zone: "battlefield" },
        until: hovered("Savannah Lions"),
        text: "Pour lire une carte, survolez-la avec la souris (sur tablette, gardez le doigt appuyé dessus). Essayez avec les **Lions des savanes**.",
        hint: "Survolez les Lions des savanes pour continuer.",
      },
      {
        next: true,
        target: "preview",
        text: "L'**aperçu** montre la carte en grand, avec son texte complet et l'explication de ses mots-clés.",
      },
      {
        next: true,
        target: "log",
        text: "Le **journal** raconte tout ce qui se passe dans la partie. Utile quand l'adversaire joue vite !",
      },
      {
        next: true,
        text: "C'est tout pour l'écran. Dans la leçon suivante, vous jouerez vos premières cartes.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "mana",
    title: "Terrains et mana",
    summary: "Jouer un terrain par tour, payer le coût d'un sort.",
    scenario: {
      active: "you",
      turn: 1,
      you: {
        library: ["Forest", ...many(10, "Plains")],
        hand: ["Forest", "Plains", "Llanowar Elves", "Savannah Lions", "Bear Cub"],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: [...many(4, "Mountain"), "Swab Goblin"],
      },
      opponentPlays: [{ turn: 2, do: "playLand", card: "Mountain" }],
    },
    steps: [
      {
        next: true,
        target: "hand",
        text: "Pour jouer vos cartes, il vous faut du **mana**, produit par vos **terrains**. Vous pouvez jouer **un seul terrain par tour**, pendant une de vos phases principales.",
      },
      {
        target: { card: "Forest", zone: "hand" },
        allow: [{ playLand: "Forest" }],
        until: onField("Forest"),
        text: "Jouez votre **Forêt** : cliquez-la, ou faites-la glisser vers le champ de bataille.",
        hint: "Jouez la Forêt pour continuer.",
      },
      {
        next: true,
        target: { card: "Llanowar Elves", zone: "hand" },
        text: "Le **coût** d'un sort est en haut à droite de la carte. Les **Elfes de Llanowar** coûtent {G} : un mana vert, justement ce que produit une Forêt.",
      },
      {
        target: { card: "Llanowar Elves", zone: "hand" },
        allow: [{ cast: "Llanowar Elves" }],
        until: onField("Llanowar Elves"),
        text: "Lancez les **Elfes de Llanowar**. Le jeu **engage** (incline) la Forêt pour payer.",
        hint: "Lancez les Elfes de Llanowar pour continuer.",
      },
      {
        next: true,
        target: { card: "Forest", zone: "battlefield" },
        text: "La Forêt est engagée : elle a servi ce tour-ci. Elle se **dégagera** au début de votre prochain tour.",
      },
      {
        next: true,
        target: { card: "Savannah Lions", zone: "hand" },
        text: "Les **Lions des savanes** coûtent {W} (blanc) : il faudrait une Plaine, mais vous avez déjà joué un terrain ce tour-ci. Ils attendront.",
      },
      {
        target: "mainButton",
        allow: ["endTurn"],
        until: pastTurn(1),
        text: "Terminez votre tour avec le bouton **Fin du tour**.",
        hint: "Cliquez « Fin du tour » pour continuer.",
      },
      {
        until: myStep("main1"),
        text: "C'est au tour de l'adversaire. Il joue une Montagne…",
      },
      {
        next: true,
        target: "hand",
        text: "De nouveau votre tour : vos permanents se sont dégagés et vous avez **pioché** une carte (une Forêt).",
      },
      {
        target: { card: "Plains", zone: "hand" },
        allow: [{ playLand: "Plains" }],
        until: onField("Plains"),
        text: "Jouez votre **Plaine**, qui produit {W}.",
        hint: "Jouez la Plaine pour continuer.",
      },
      {
        next: true,
        target: "myField",
        text: "Vous disposez maintenant de trois sources de mana : la Forêt ({G}), la Plaine ({W}) et les Elfes, qui produisent aussi {G}.",
      },
      {
        target: { card: "Savannah Lions", zone: "hand" },
        allow: [{ cast: "Savannah Lions" }],
        until: onField("Savannah Lions"),
        text: "Lancez les **Lions des savanes** ({W}).",
        hint: "Lancez les Lions des savanes pour continuer.",
      },
      {
        target: { card: "Bear Cub", zone: "hand" },
        allow: [{ cast: "Bear Cub" }],
        until: onField("Bear Cub"),
        text: "Puis l'**Ourson** ({1}{G}). Le {1} est un coût **générique** : n'importe quel mana convient. Le jeu engage la Forêt et les Elfes.",
        hint: "Lancez l'Ourson pour continuer.",
      },
      {
        next: true,
        text: "Bravo ! Retenez : un terrain par tour, et vos terrains se dégagent à chaque tour pour produire à nouveau du mana.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "creatures",
    title: "Les créatures",
    summary: "Force et endurance, mal d'invocation.",
    scenario: {
      active: "you",
      turn: 3,
      you: {
        library: many(10, "Forest"),
        hand: ["Bear Cub", "Savannah Lions"],
        battlefield: ["Forest", "Forest", "Plains"],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: ["Swab Goblin", ...many(3, "Mountain")],
        battlefield: ["Mountain", "Mountain"],
      },
      opponentPlays: [
        { turn: 4, do: "playLand", card: "Mountain" },
        { turn: 4, do: "cast", card: "Swab Goblin" },
      ],
    },
    steps: [
      {
        next: true,
        target: { card: "Bear Cub", zone: "hand" },
        text: "Les **créatures** sont vos combattants. En bas à droite, l'Ourson indique 2/2 : sa **force** (les dégâts qu'il inflige) puis son **endurance** (les dégâts qu'il peut subir avant d'être détruit).",
      },
      {
        target: { card: "Bear Cub", zone: "hand" },
        allow: [{ cast: "Bear Cub" }],
        until: onField("Bear Cub"),
        text: "Lancez l'**Ourson**.",
        hint: "Lancez l'Ourson pour continuer.",
      },
      {
        next: true,
        target: { card: "Bear Cub", zone: "battlefield" },
        text: "Une créature qui vient d'arriver a le **mal d'invocation** : elle ne peut ni attaquer ni s'engager avant votre prochain tour.",
      },
      {
        target: { card: "Savannah Lions", zone: "hand" },
        allow: [{ cast: "Savannah Lions" }],
        until: onField("Savannah Lions"),
        text: "Lancez aussi les **Lions des savanes**.",
        hint: "Lancez les Lions des savanes pour continuer.",
      },
      {
        next: true,
        target: { card: "Savannah Lions", zone: "battlefield" },
        text: "Les Lions sont 2/1 : ils frappent aussi fort que l'Ourson, mais un seul point de dégât suffit à les détruire.",
      },
      {
        target: "mainButton",
        allow: ["endTurn"],
        until: pastTurn(3),
        text: "Vos créatures ne peuvent pas encore attaquer : cliquez **Fin du tour**.",
        hint: "Cliquez « Fin du tour » pour continuer.",
      },
      {
        until: all(onStack("Swab Goblin"), pendingMine("priority")),
        text: "Au tour de l'adversaire…",
      },
      {
        target: "stack",
        allow: ["pass"],
        until: onField("Swab Goblin", "opponent"),
        text: "L'adversaire lance une créature, le **Mathurin gobelin** (2/2). Un sort lancé passe d'abord par la **pile** : cliquez **OK** pour le laisser se résoudre.",
        hint: "Cliquez « OK » pour continuer.",
      },
      {
        until: mineAtTurn(5),
        text: "Le Mathurin a lui aussi le mal d'invocation : il ne peut pas attaquer ce tour-ci…",
      },
      {
        next: true,
        target: "myField",
        text: "Nouveau tour : l'Ourson et les Lions n'ont plus le mal d'invocation, ils peuvent attaquer. C'est l'objet de la leçon suivante !",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "attaque",
    title: "Attaquer",
    summary: "Le combat : choisir ses attaquants, les dégâts, les blocages adverses.",
    scenario: {
      active: "you",
      turn: 5,
      you: {
        library: many(10, "Plains"),
        hand: ["Forest", "Healer's Hawk"],
        battlefield: ["Plains", "Forest", "Forest", "Bear Cub", "Savannah Lions"],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: many(3, "Mountain"),
        battlefield: ["Mountain", "Mountain", "Swab Goblin"],
      },
      opponentPlays: [{ turn: 5, do: "block", blocks: [["Swab Goblin", "Savannah Lions"]] }],
    },
    steps: [
      {
        target: { card: "Forest", zone: "hand" },
        allow: [{ playLand: "Forest" }],
        until: onField("Forest"),
        text: "Commencez votre tour par votre terrain : jouez la **Forêt**.",
        hint: "Jouez la Forêt pour continuer.",
      },
      {
        next: true,
        target: "phaseBar",
        text: "Place au **combat**, le moyen d'infliger des dégâts à l'adversaire. Une créature qui attaque **s'engage** ; l'adversaire décide ensuite s'il **bloque** avec ses propres créatures.",
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttackers"),
        text: "Cliquez **Combat** pour passer à la phase de combat.",
        hint: "Cliquez « Combat » pour continuer.",
      },
      {
        target: "myField",
        allow: [{ attack: ["Bear Cub", "Savannah Lions"] }],
        until: (c) => (c.view.combat?.attackers.length ?? 0) > 0 || c.view.turn.step === "main2",
        text: "Cliquez l'**Ourson** puis les **Lions des savanes** (ou « Attaquer avec tous »), puis validez avec **Attaquer (2)**.",
        hint: "Attaquez avec l'Ourson et les Lions des savanes.",
      },
      {
        until: myStep("main2"),
        text: "L'adversaire choisit ses bloqueurs…",
      },
      {
        next: true,
        target: "oppLife",
        text: "Le Mathurin gobelin a bloqué les Lions. L'Ourson, lui, n'était pas bloqué : il a infligé 2 dégâts à l'adversaire, qui passe à 18.",
      },
      {
        next: true,
        target: "graveyard",
        text: "Créatures bloquées : chacune inflige des dégâts égaux à sa force à l'autre. Les Lions (2/1) et le Mathurin (2/2) ont reçu 2 dégâts : ils sont détruits et vont au cimetière de leur propriétaire.",
      },
      {
        target: { card: "Healer's Hawk", zone: "hand" },
        allow: [{ cast: "Healer's Hawk" }],
        until: onField("Healer's Hawk"),
        text: "Vous êtes en **seconde phase principale** : vous pouvez encore jouer des cartes. Lancez le **Faucon de guérisseur**.",
        hint: "Lancez le Faucon de guérisseur pour continuer.",
      },
      {
        next: true,
        text: "Bien joué ! Attention : une créature qui a attaqué reste engagée et ne pourra pas bloquer au tour adverse. Il faut parfois garder des défenseurs.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "blocage",
    title: "Bloquer",
    summary: "Se défendre : choisir ses bloqueurs, perdre des points de vie.",
    scenario: {
      active: "opponent",
      turn: 4,
      you: {
        library: many(10, "Plains"),
        hand: [],
        battlefield: ["Forest", "Forest", "Plains", "Bear Cub"],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: many(2, "Mountain"),
        battlefield: ["Mountain", "Mountain", "Mountain", "Swab Goblin", "Goblin Boarders"],
      },
      opponentPlays: [{ turn: 4, do: "attack", with: ["Swab Goblin", "Goblin Boarders"] }],
    },
    steps: [
      {
        next: true,
        target: "oppField",
        text: "C'est le tour de votre adversaire, et ses créatures vont attaquer. À vous de décider comment vous défendre.",
      },
      {
        until: pendingMine("declareBlockers"),
        text: "L'adversaire déclare ses attaquants…",
      },
      {
        next: true,
        target: { card: "Goblin Boarders", zone: "battlefield", owner: "opponent" },
        text: "Il attaque avec le **Mathurin gobelin** (2/2) et les **Abordeurs gobelins** (3/2). Chacune de vos créatures dégagées peut **bloquer** un attaquant : celui-ci inflige alors ses dégâts au bloqueur, pas à vous.",
      },
      {
        target: { card: "Bear Cub", zone: "battlefield" },
        allow: [{ block: [["Bear Cub", "Goblin Boarders"]] }],
        until: (c) => lifeOf(c, "you") < 20,
        text: "Bloquez les **Abordeurs gobelins** avec l'**Ourson** : cliquez l'Ourson, puis les Abordeurs, puis validez avec **Bloquer (1)**.",
        hint: "Bloquez les Abordeurs gobelins avec l'Ourson.",
      },
      {
        next: true,
        target: "myLife",
        text: "Le Mathurin, non bloqué, vous a infligé 2 dégâts : vous passez à 18 points de vie.",
      },
      {
        next: true,
        target: "graveyard",
        text: "L'Ourson (2/2) et les Abordeurs (3/2) se sont infligé assez de dégâts pour se détruire l'un l'autre : un bon échange, puisque les Abordeurs étaient plus forts.",
      },
      {
        next: true,
        text: "Retenez : bloquer protège vos points de vie, mais peut coûter une créature. Comparez la force de l'attaquant à l'endurance de votre bloqueur, et inversement.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "sorts",
    title: "Sorts et cibles",
    summary: "Éphémères et rituels, choisir une cible, gagner une partie.",
    scenario: {
      active: "you",
      turn: 5,
      you: {
        library: many(10, "Forest"),
        hand: ["Burst Lightning", "Burst Lightning"],
        battlefield: ["Mountain", "Mountain", "Forest", "Bear Cub"],
      },
      opponent: {
        life: 4,
        library: many(10, "Mountain"),
        hand: many(2, "Mountain"),
        battlefield: ["Mountain", "Mountain", "Swab Goblin"],
      },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        target: "hand",
        text: "Certains sorts ne restent pas en jeu : ils produisent leur effet puis vont au cimetière. Un **rituel** se lance seulement pendant votre phase principale ; un **éphémère**, à tout moment, même pendant le tour adverse.",
      },
      {
        next: true,
        target: { card: "Burst Lightning", zone: "hand" },
        text: "L'**Éclair explosif** est un éphémère qui inflige 2 dégâts à **n'importe quelle cible** : une créature ou un joueur.",
      },
      {
        target: { card: "Swab Goblin", zone: "battlefield", owner: "opponent" },
        allow: [{ cast: "Burst Lightning", target: "Swab Goblin" }],
        until: inGraveyard("Swab Goblin", "opponent"),
        text: "Détruisez le **Mathurin gobelin** : faites glisser l'Éclair explosif sur lui (ou cliquez l'Éclair, puis le Mathurin).",
        hint: "Visez le Mathurin gobelin avec l'Éclair explosif.",
      },
      {
        next: true,
        target: "oppLife",
        text: "Le Mathurin a subi 2 dégâts, autant que son endurance : il est détruit. Il ne reste que 4 points de vie à l'adversaire, et plus aucun bloqueur…",
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttackers"),
        text: "Cliquez **Combat**.",
        hint: "Cliquez « Combat » pour continuer.",
      },
      {
        target: { card: "Bear Cub", zone: "battlefield" },
        allow: [{ attack: ["Bear Cub"] }, "pass"],
        until: myStep("main2"),
        text: "Attaquez avec l'**Ourson**, puis validez.",
        hint: "Attaquez avec l'Ourson.",
      },
      {
        target: "oppLife",
        allow: [{ cast: "Burst Lightning", target: "opponent" }],
        until: gameOver,
        text: "Plus que 2 points de vie ! Lancez le second **Éclair explosif** sur l'adversaire : faites-le glisser sur son portrait, en haut.",
        hint: "Visez l'adversaire avec l'Éclair explosif.",
      },
      {
        next: true,
        text: "**Victoire !** Vous avez gagné votre première partie. La prochaine leçon montre comment répondre aux sorts de l'adversaire.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "pile",
    title: "Éphémères et la pile",
    summary: "Répondre à un sort, l'ordre de résolution, les tours de combat.",
    scenario: {
      active: "opponent",
      turn: 4,
      you: {
        library: many(10, "Plains"),
        hand: ["Giant Growth", "Divine Resilience"],
        battlefield: ["Forest", "Forest", "Plains", "Plains", "Bear Cub", "Savannah Lions"],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: ["Scorching Dragonfire", "Mountain"],
        battlefield: ["Mountain", "Mountain", "Mountain", "Swab Goblin", "Goblin Boarders"],
      },
      opponentPlays: [
        { turn: 4, do: "cast", card: "Scorching Dragonfire", targets: ["Bear Cub"] },
        { turn: 4, do: "attack", with: ["Goblin Boarders"] },
      ],
    },
    steps: [
      {
        next: true,
        target: "hand",
        text: "Vous avez deux **éphémères** en main. Ils se lancent à tout moment, même pendant le tour adverse, et même **en réponse** à un autre sort.",
      },
      {
        until: all(onStack("Scorching Dragonfire"), pendingMine("priority")),
        text: "Au tour de l'adversaire…",
      },
      {
        next: true,
        target: "stack",
        text: "L'adversaire lance **Feu du dragon dévastateur** sur votre Ourson : 3 dégâts, de quoi le détruire. Le sort attend sur la **pile** : il n'est pas encore résolu, et vous pouvez répondre.",
      },
      {
        target: { card: "Giant Growth", zone: "hand" },
        allow: [{ cast: "Giant Growth", target: "Bear Cub" }],
        until: (c) => powerOf(c, "Bear Cub") >= 5,
        text: "Répondez avec la **Croissance gigantesque** sur l'Ourson (+3/+3 jusqu'à la fin du tour) : faites-la glisser sur lui.",
        hint: "Lancez la Croissance gigantesque sur l'Ourson.",
      },
      {
        target: "stack",
        allow: ["pass"],
        until: all(stackEmpty, (c) => !onStack("Scorching Dragonfire")(c)),
        text: "La pile se résout **de haut en bas** : votre Croissance gigantesque, arrivée en dernier, s'est résolue la première. L'Ourson est 5/5 ! Cliquez **Résoudre** pour laisser le Feu du dragon se résoudre.",
        hint: "Cliquez « Résoudre » pour continuer.",
      },
      {
        next: true,
        target: { card: "Bear Cub", zone: "battlefield" },
        text: "3 dégâts ne suffisent plus à détruire un Ourson 5/5 : il survit.",
      },
      {
        allow: ["pass"],
        until: pendingMine("declareBlockers"),
        text: "L'adversaire passe à l'attaque ! Vous pourriez lancer un éphémère dès maintenant, mais attendez les blocages : cliquez **Passer** si le jeu vous le propose.",
        hint: "Cliquez « Passer » : vous choisirez vos bloqueurs juste après.",
      },
      {
        target: { card: "Savannah Lions", zone: "battlefield" },
        allow: [{ block: [["Savannah Lions", "Goblin Boarders"]] }],
        until: (c) => c.view.turn.step === "declareBlockers" && pendingMine("priority")(c),
        text: "Les **Abordeurs gobelins** (3/2) attaquent. Votre Ourson a déjà subi 3 dégâts ce tour-ci : les blessures ne s'effacent qu'à la fin du tour, et 3 de plus le détruiraient. Bloquez plutôt avec les **Lions des savanes** : cliquez-les, puis validez avec **Bloquer (1)**.",
        hint: "Bloquez les Abordeurs gobelins avec les Lions des savanes.",
      },
      {
        target: { card: "Divine Resilience", zone: "hand" },
        allow: [{ cast: "Divine Resilience", target: "Savannah Lions" }],
        until: inGraveyard("Goblin Boarders", "opponent"),
        text: "Les Lions vont mourir face aux Abordeurs… sauf si vous lancez **Résistance divine** sur eux : ils deviendront **indestructibles**. C'est un **tour de combat** !",
        hint: "Lancez la Résistance divine sur les Lions des savanes.",
      },
      {
        next: true,
        target: "oppField",
        text: "Les Lions, indestructibles, ont survécu et détruit les Abordeurs. Grâce à vos deux éphémères, vous n'avez perdu aucune créature.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "capacites",
    title: "Mots-clés et capacités",
    summary: "Vol, vigilance, lien de vie, capacités déclenchées et activées.",
    scenario: {
      active: "you",
      turn: 5,
      you: {
        library: many(10, "Forest"),
        hand: ["Savannah Lions"],
        battlefield: [
          "Plains",
          "Plains",
          "Plains",
          "Forest",
          "Forest",
          "Serra Angel",
          "Healer's Hawk",
          "Treetop Snarespinner",
          "Dazzling Angel",
        ],
      },
      opponent: {
        library: many(10, "Mountain"),
        hand: many(3, "Mountain"),
        battlefield: ["Mountain", "Mountain", "Swab Goblin"],
      },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        target: "myField",
        text: "Beaucoup de créatures ont des **capacités**. Les plus courantes sont des **mots-clés**, expliqués dans l'aperçu de la carte.",
      },
      {
        target: { card: "Serra Angel", zone: "battlefield" },
        until: hovered("Serra Angel"),
        text: "Survolez l'**Ange de Serra** (ou gardez le doigt appuyé dessus).",
        hint: "Survolez l'Ange de Serra pour continuer.",
      },
      {
        next: true,
        target: "preview",
        text: "**Vol** : l'Ange ne peut être bloqué que par des créatures avec le vol ou la portée. **Vigilance** : attaquer ne l'engage pas, il pourra donc aussi bloquer au tour adverse.",
      },
      {
        next: true,
        target: { card: "Treetop Snarespinner", zone: "battlefield" },
        text: "Le **Faucon de guérisseur** a le vol et le **lien de vie** (ses dégâts vous rendent autant de points de vie). La **Fileuse de collet arboricole** a la **portée** (elle bloque les volants) et le **contact mortel** (le moindre dégât détruit une créature).",
      },
      {
        target: { card: "Savannah Lions", zone: "hand" },
        allow: [{ cast: "Savannah Lions" }],
        until: (c) => lifeOf(c, "you") > 20,
        text: "Une **capacité déclenchée** commence par « quand », « chaque fois que » ou « au début de ». L'**Ange éblouissant** vous fait gagner 1 point de vie chaque fois qu'une autre créature arrive sous votre contrôle. Lancez les **Lions des savanes** pour la voir.",
        hint: "Lancez les Lions des savanes pour continuer.",
      },
      {
        next: true,
        target: "myLife",
        text: "Vous avez gagné 1 point de vie : la capacité s'est déclenchée toute seule.",
      },
      {
        target: { card: "Treetop Snarespinner", zone: "battlefield" },
        allow: [{ activate: "Treetop Snarespinner", target: "Serra Angel" }],
        until: (c) => powerOf(c, "Serra Angel") >= 5,
        text: "Une **capacité activée** s'écrit « coût : effet ». La Fileuse a « {2}{G} : mettez un marqueur +1/+1 sur une créature ciblée que vous contrôlez ». Cliquez la **Fileuse**, puis l'**Ange de Serra**.",
        hint: "Activez la Fileuse en ciblant l'Ange de Serra.",
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttackers"),
        text: "L'Ange est maintenant 5/5. Cliquez **Combat**.",
        hint: "Cliquez « Combat » pour continuer.",
      },
      {
        target: "myField",
        allow: [{ attack: ["Serra Angel", "Healer's Hawk"] }, "pass"],
        until: (c) => lifeOf(c, "opponent") <= 14,
        text: "Attaquez avec l'**Ange de Serra** et le **Faucon de guérisseur** : le Mathurin gobelin n'a ni le vol ni la portée, il ne peut pas les bloquer.",
        hint: "Attaquez avec l'Ange de Serra et le Faucon de guérisseur.",
      },
      {
        next: true,
        target: "myLife",
        text: "6 dégâts pour l'adversaire, et le lien de vie du Faucon vous a rendu 1 point de vie.",
      },
      {
        next: true,
        text: "Il existe bien d'autres mots-clés : piétinement, initiative, défenseur, célérité… Pensez à survoler les cartes : l'aperçu les explique tous.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "partie",
    title: "Une partie complète",
    summary: "Main de départ, arrêts, puis une vraie partie contre l'IA.",
    scenario: {
      active: "you",
      mulligan: true,
      you: {
        library: [
          "Plains",
          "Druid of the Cowl",
          "Forest",
          "Healer's Hawk",
          "Serra Angel",
          "Plains",
          "Dazzling Angel",
          "Forest",
          "Divine Resilience",
          "Treetop Snarespinner",
          "Plains",
          "Forest",
          "Bear Cub",
          "Savannah Lions",
          "Plains",
          "Forest",
          "Giant Growth",
          "Plains",
          "Forest",
          "Serra Angel",
        ],
        hand: ["Forest", "Forest", "Plains", "Llanowar Elves", "Savannah Lions", "Bear Cub", "Giant Growth"],
      },
      opponent: {
        life: 10,
        library: [
          "Mountain",
          "Raging Redcap",
          "Mountain",
          "Swab Goblin",
          "Mountain",
          "Brazen Scourge",
          "Mountain",
          "Scorching Dragonfire",
          "Mountain",
          "Goblin Boarders",
          "Mountain",
          "Swab Goblin",
          "Mountain",
          "Courageous Goblin",
          "Mountain",
          "Mountain",
          "Raging Redcap",
          "Mountain",
          "Mountain",
          "Mountain",
        ],
        hand: ["Mountain", "Mountain", "Mountain", "Swab Goblin", "Goblin Boarders", "Burst Lightning", "Courageous Goblin"],
      },
      opponentPlays: "beginner",
    },
    steps: [
      {
        next: true,
        text: "Dernière leçon : une vraie partie ! Tout commence par la **main de départ** : 7 cartes. Si elle ne vous plaît pas (trop ou pas assez de terrains), vous pouvez prendre un **mulligan** : vous piochez 7 nouvelles cartes, mais vous en remettez une sous votre bibliothèque par mulligan.",
      },
      {
        allow: ["keep"],
        until: (c) => !pendingMine("mulligan")(c),
        text: "Cette main a trois terrains et des sorts peu chers : gardez-la.",
        hint: "Pour ce tutoriel, gardez cette main.",
      },
      {
        next: true,
        target: "stops",
        text: "Les **arrêts** : les petits points sous les phases indiquent où la partie s'arrête pour vous laisser agir (en haut pendant votre tour, en bas pendant celui de l'adversaire). Le jeu passe tout seul les moments où vous n'avez rien à faire.",
      },
      {
        next: true,
        target: "endTurn",
        text: "**Passer le tour** (touche Entrée) passe tout jusqu'à la fin de votre tour. Dans les réglages, le **contrôle total** vous rend la main à chaque étape.",
      },
      {
        free: true,
        until: gameOver,
        text: "À vous de jouer ! L'adversaire n'a que 10 points de vie. Je vous donnerai quelques conseils en chemin.",
        tips: [
          {
            when: (c) => pendingMine("declareBlockers")(c),
            text: "Vous êtes attaqué : cliquez une de vos créatures puis l'attaquant pour bloquer, ou choisissez « Pas de blocage ».",
          },
          {
            when: (c) => pendingMine("priority")(c) && c.view.stack.some((it) => it.controller !== c.view.viewer),
            text: "L'adversaire joue un sort : répondez avec un éphémère, ou laissez-le se résoudre.",
          },
          {
            when: (c) =>
              (myStep("main1")(c) || myStep("main2")(c)) &&
              c.view.turn.landsPlayed === 0 &&
              c.view.hand.some((o) => o.types.includes("Land")),
            text: "Pensez à jouer un terrain : un par tour.",
          },
          {
            when: (c) => myStep("main1")(c) && c.view.potentialAttackers > 0,
            text: "Vos créatures peuvent attaquer : cliquez « Combat » quand vous avez joué vos cartes.",
          },
          {
            when: (c) => pendingMine("declareAttackers")(c),
            text: "Cliquez les créatures qui attaquent, puis validez. Gardez des bloqueurs si l'adversaire menace.",
          },
        ],
      },
      {
        next: true,
        text: (c) =>
          c.view.winner === c.view.viewer
            ? "**Victoire !** Vous connaissez maintenant l'essentiel de Magic. Pour continuer : **Mes decks** pour construire les vôtres, **Jouer contre l'IA**, et **Contre un joueur** pour affronter un ami en ligne."
            : "Perdu cette fois : recommencez la leçon quand vous voulez. Vous connaissez maintenant l'essentiel ; pour continuer : **Mes decks**, **Jouer contre l'IA** et **Contre un joueur**.",
      },
    ],
  },
];

export const lessonById = (id: string | null): Lesson | undefined => LESSONS.find((l) => l.id === id);
