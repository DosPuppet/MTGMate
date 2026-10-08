/**
 * The tutorial lessons: each one is a staged game excerpt (Foundations cards), with a scripted opponent and a
 * sequence of steps. Every change is replayed by `client/test/tutorial.test.ts`.
 * Texts are English `msg` literals, translated on display (French catalog, vouvoiement); mana symbols ({G}, {W}…) are
 * drawn by the guide's bubble.
 */
import { msg } from "@mtgx/engine";
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
/** The game has moved past turn n (the view of the opponent's turn can be skipped when the opponent did nothing visible). */
const pastTurn = (n: number) => (c: Ctx) => c.view.turn.number > n;
/** The player must decide, during the given turn (whatever the decision). */
const mineAtTurn = (n: number) => (c: Ctx) => c.view.turn.number === n && c.view.pending?.player === c.view.viewer;

export const LESSONS: Lesson[] = [
  // -------------------------------------------------------------------------
  {
    id: "screen",
    title: msg("The goal of the game and the screen"),
    summary: msg("Life, battlefield, hand, library, graveyard and phases."),
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
        text: msg(
          "Welcome! This tutorial teaches you **Magic: The Gathering** step by step, through short game excerpts. Two players face off, each with their own pile of cards, called a **deck**.",
        ),
      },
      {
        next: true,
        target: "myLife",
        text: msg("This is your **life total**: you start at 20. A player who drops to 0 loses the game."),
      },
      {
        next: true,
        target: "oppLife",
        text: msg("And this is your opponent's, at the top. Your goal: bring it down to 0."),
      },
      {
        next: true,
        target: "myField",
        text: msg(
          "The **battlefield**: at the bottom, your cards in play (your **permanents**); at the top, your opponent's. Your **lands** produce mana, your **creatures** fight.",
        ),
      },
      {
        next: true,
        target: "hand",
        text: msg("Your **hand**: the cards you can play. Your opponent only sees how many there are."),
      },
      {
        next: true,
        target: "library",
        text: msg("Your **library**: the rest of your deck, face down. You draw a card at the beginning of each of your turns."),
      },
      {
        next: true,
        target: "graveyard",
        text: msg(
          "Your **graveyard**: destroyed creatures and spells that have been cast go there. Click it to look through it.",
        ),
      },
      {
        next: true,
        target: "phaseBar",
        text: msg(
          "The **phase bar**: every turn follows the same order. Beginning (untap, upkeep, draw), first main phase, combat, second main phase, end. The current phase is highlighted.",
        ),
      },
      {
        next: true,
        target: "mainButton",
        text: msg(
          "The **main button** moves the game forward: go to combat, confirm an attack, end your turn… Shortcut: the space bar.",
        ),
      },
      {
        target: { card: "Savannah Lions", zone: "battlefield" },
        until: hovered("Savannah Lions"),
        text: msg(
          "To read a card, hover over it with the mouse (on a tablet, press and hold it). Try it with the **Savannah Lions**.",
        ),
        hint: msg("Hover over the Savannah Lions to continue."),
      },
      {
        next: true,
        target: "preview",
        text: msg("The **preview** shows the card enlarged, with its full text and an explanation of its keywords."),
      },
      {
        next: true,
        target: "log",
        text: msg("The **log** records everything that happens in the game. Handy when your opponent plays fast!"),
      },
      {
        next: true,
        text: msg("That's all for the screen. In the next lesson, you'll play your first cards."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "mana",
    title: msg("Lands and mana"),
    summary: msg("Play one land per turn, pay a spell's cost."),
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
        text: msg(
          "To play your cards, you need **mana**, produced by your **lands**. You can play **only one land per turn**, during one of your main phases.",
        ),
      },
      {
        target: { card: "Forest", zone: "hand" },
        allow: [{ playLand: "Forest" }],
        until: onField("Forest"),
        text: msg("Play your **Forest**: click it, or drag it onto the battlefield."),
        hint: msg("Play the Forest to continue."),
      },
      {
        next: true,
        target: { card: "Llanowar Elves", zone: "hand" },
        text: msg(
          "A spell's **cost** is in the top right corner of the card. **Llanowar Elves** cost {G}: one green mana, exactly what a Forest produces.",
        ),
      },
      {
        target: { card: "Llanowar Elves", zone: "hand" },
        allow: [{ cast: "Llanowar Elves" }],
        until: onField("Llanowar Elves"),
        text: msg("Cast the **Llanowar Elves**. The game **taps** (turns sideways) the Forest to pay."),
        hint: msg("Cast the Llanowar Elves to continue."),
      },
      {
        next: true,
        target: { card: "Forest", zone: "battlefield" },
        text: msg("The Forest is tapped: it has been used this turn. It will **untap** at the beginning of your next turn."),
      },
      {
        next: true,
        target: { card: "Savannah Lions", zone: "hand" },
        text: msg(
          "**Savannah Lions** cost {W} (white): you would need a Plains, but you have already played a land this turn. They will have to wait.",
        ),
      },
      {
        target: "mainButton",
        allow: ["endTurn"],
        until: pastTurn(1),
        text: msg("End your turn with the **End turn** button."),
        hint: msg('Click "End turn" to continue.'),
      },
      {
        until: myStep("main1"),
        text: msg("It's your opponent's turn. They play a Mountain…"),
      },
      {
        next: true,
        target: "hand",
        text: msg("Your turn again: your permanents have untapped and you **drew** a card (a Forest)."),
      },
      {
        target: { card: "Plains", zone: "hand" },
        allow: [{ playLand: "Plains" }],
        until: onField("Plains"),
        text: msg("Play your **Plains**, which produces {W}."),
        hint: msg("Play the Plains to continue."),
      },
      {
        next: true,
        target: "myField",
        text: msg(
          "You now have three sources of mana: the Forest ({G}), the Plains ({W}) and the Elves, which also produce {G}.",
        ),
      },
      {
        target: { card: "Savannah Lions", zone: "hand" },
        allow: [{ cast: "Savannah Lions" }],
        until: onField("Savannah Lions"),
        text: msg("Cast the **Savannah Lions** ({W})."),
        hint: msg("Cast the Savannah Lions to continue."),
      },
      {
        target: { card: "Bear Cub", zone: "hand" },
        allow: [{ cast: "Bear Cub" }],
        until: onField("Bear Cub"),
        text: msg(
          "Then the **Bear Cub** ({1}{G}). The {1} is a **generic** cost: any mana will do. The game taps the Forest and the Elves.",
        ),
        hint: msg("Cast the Bear Cub to continue."),
      },
      {
        next: true,
        text: msg("Well done! Remember: one land per turn, and your lands untap every turn to produce mana again."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "creatures",
    title: msg("Creatures"),
    summary: msg("Power and toughness, summoning sickness."),
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
        text: msg(
          "**Creatures** are your fighters. In the bottom right corner, the Bear Cub shows 2/2: its **power** (the damage it deals) then its **toughness** (the damage it can take before it is destroyed).",
        ),
      },
      {
        target: { card: "Bear Cub", zone: "hand" },
        allow: [{ cast: "Bear Cub" }],
        until: onField("Bear Cub"),
        text: msg("Cast the **Bear Cub**."),
        hint: msg("Cast the Bear Cub to continue."),
      },
      {
        next: true,
        target: { card: "Bear Cub", zone: "battlefield" },
        text: msg(
          "A creature that has just entered has **summoning sickness**: it can neither attack nor tap until your next turn.",
        ),
      },
      {
        target: { card: "Savannah Lions", zone: "hand" },
        allow: [{ cast: "Savannah Lions" }],
        until: onField("Savannah Lions"),
        text: msg("Cast the **Savannah Lions** too."),
        hint: msg("Cast the Savannah Lions to continue."),
      },
      {
        next: true,
        target: { card: "Savannah Lions", zone: "battlefield" },
        text: msg("The Lions are 2/1: they hit as hard as the Bear Cub, but a single point of damage is enough to destroy them."),
      },
      {
        target: "mainButton",
        allow: ["endTurn"],
        until: pastTurn(3),
        text: msg("Your creatures can't attack yet: click **End turn**."),
        hint: msg('Click "End turn" to continue.'),
      },
      {
        until: all(onStack("Swab Goblin"), pendingMine("priority")),
        text: msg("Your opponent's turn…"),
      },
      {
        target: "stack",
        allow: ["pass"],
        until: onField("Swab Goblin", "opponent"),
        text: msg(
          "Your opponent casts a creature, the **Swab Goblin** (2/2). A spell that is cast first goes on the **stack**: click **OK** to let it resolve.",
        ),
        hint: msg('Click "OK" to continue.'),
      },
      {
        until: mineAtTurn(5),
        text: msg("The Swab Goblin has summoning sickness too: it can't attack this turn…"),
      },
      {
        next: true,
        target: "myField",
        text: msg(
          "A new turn: the Bear Cub and the Lions no longer have summoning sickness, so they can attack. That's the subject of the next lesson!",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "attack",
    title: msg("Attacking"),
    summary: msg("Combat: choosing your attackers, damage, your opponent's blocks."),
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
        text: msg("Start your turn with your land: play the **Forest**."),
        hint: msg("Play the Forest to continue."),
      },
      {
        next: true,
        target: "phaseBar",
        text: msg(
          "Time for **combat**, the way to deal damage to your opponent. A creature that attacks **taps**; your opponent then decides whether to **block** with their own creatures.",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttackers"),
        text: msg("Click **Combat** to move to the combat phase."),
        hint: msg('Click "Combat" to continue.'),
      },
      {
        target: "myField",
        allow: [{ attack: ["Bear Cub", "Savannah Lions"] }],
        until: (c) => (c.view.combat?.attackers.length ?? 0) > 0 || c.view.turn.step === "main2",
        text: msg('Click the **Bear Cub** then the **Savannah Lions** (or "Attack with all"), then confirm with **Attack (2)**.'),
        hint: msg("Attack with the Bear Cub and the Savannah Lions."),
      },
      {
        until: myStep("main2"),
        text: msg("Your opponent chooses their blockers…"),
      },
      {
        next: true,
        target: "oppLife",
        text: msg(
          "The Swab Goblin blocked the Lions. The Bear Cub, however, wasn't blocked: it dealt 2 damage to your opponent, who goes down to 18.",
        ),
      },
      {
        next: true,
        target: "graveyard",
        text: msg(
          "Blocked creatures: each one deals damage equal to its power to the other. The Lions (2/1) and the Swab Goblin (2/2) were each dealt 2 damage: they are destroyed and go to their owner's graveyard.",
        ),
      },
      {
        target: { card: "Healer's Hawk", zone: "hand" },
        allow: [{ cast: "Healer's Hawk" }],
        until: onField("Healer's Hawk"),
        text: msg("You are in your **second main phase**: you can still play cards. Cast the **Healer's Hawk**."),
        hint: msg("Cast the Healer's Hawk to continue."),
      },
      {
        next: true,
        text: msg(
          "Nicely played! Careful: a creature that attacked stays tapped and won't be able to block during your opponent's turn. Sometimes you need to keep defenders back.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "block",
    title: msg("Blocking"),
    summary: msg("Defending yourself: choosing your blockers, losing life."),
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
        text: msg(
          "It's your opponent's turn, and their creatures are about to attack. It's up to you to decide how to defend yourself.",
        ),
      },
      {
        until: pendingMine("declareBlockers"),
        text: msg("Your opponent declares their attackers…"),
      },
      {
        next: true,
        target: { card: "Goblin Boarders", zone: "battlefield", owner: "opponent" },
        text: msg(
          "They attack with the **Swab Goblin** (2/2) and the **Goblin Boarders** (3/2). Each of your untapped creatures can **block** an attacker: that attacker then deals its damage to the blocker, not to you.",
        ),
      },
      {
        target: { card: "Bear Cub", zone: "battlefield" },
        allow: [{ block: [["Bear Cub", "Goblin Boarders"]] }],
        until: (c) => lifeOf(c, "you") < 20,
        text: msg(
          "Block the **Goblin Boarders** with the **Bear Cub**: click the Bear Cub, then the Boarders, then confirm with **Block (1)**.",
        ),
        hint: msg("Block the Goblin Boarders with the Bear Cub."),
      },
      {
        next: true,
        target: "myLife",
        text: msg("The Swab Goblin, unblocked, dealt 2 damage to you: you go down to 18 life."),
      },
      {
        next: true,
        target: "graveyard",
        text: msg(
          "The Bear Cub (2/2) and the Boarders (3/2) dealt each other enough damage to destroy each other: a good trade, since the Boarders were stronger.",
        ),
      },
      {
        next: true,
        text: msg(
          "Remember: blocking protects your life total, but it can cost you a creature. Compare the attacker's power to your blocker's toughness, and the other way around.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "spells",
    title: msg("Spells and targets"),
    summary: msg("Instants and sorceries, choosing a target, winning a game."),
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
        text: msg(
          "Some spells don't stay in play: they produce their effect, then go to the graveyard. A **sorcery** can only be cast during your main phase; an **instant**, at any time, even during your opponent's turn.",
        ),
      },
      {
        next: true,
        target: { card: "Burst Lightning", zone: "hand" },
        text: msg("**Burst Lightning** is an instant that deals 2 damage to **any target**: a creature or a player."),
      },
      {
        target: { card: "Swab Goblin", zone: "battlefield", owner: "opponent" },
        allow: [{ cast: "Burst Lightning", target: "Swab Goblin" }],
        until: inGraveyard("Swab Goblin", "opponent"),
        text: msg("Destroy the **Swab Goblin**: drag Burst Lightning onto it (or click Burst Lightning, then the Swab Goblin)."),
        hint: msg("Target the Swab Goblin with Burst Lightning."),
      },
      {
        next: true,
        target: "oppLife",
        text: msg(
          "The Swab Goblin was dealt 2 damage, as much as its toughness: it is destroyed. Your opponent has only 4 life left, and no more blockers…",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttackers"),
        text: msg("Click **Combat**."),
        hint: msg('Click "Combat" to continue.'),
      },
      {
        target: { card: "Bear Cub", zone: "battlefield" },
        allow: [{ attack: ["Bear Cub"] }, "pass"],
        until: myStep("main2"),
        text: msg("Attack with the **Bear Cub**, then confirm."),
        hint: msg("Attack with the Bear Cub."),
      },
      {
        target: "oppLife",
        allow: [{ cast: "Burst Lightning", target: "opponent" }],
        until: gameOver,
        text: msg(
          "Only 2 life left! Cast the second **Burst Lightning** at your opponent: drag it onto their portrait, at the top.",
        ),
        hint: msg("Target your opponent with Burst Lightning."),
      },
      {
        next: true,
        text: msg("**Victory!** You've won your first game. The next lesson shows how to respond to your opponent's spells."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "stack",
    title: msg("Instants and the stack"),
    summary: msg("Responding to a spell, the order of resolution, combat tricks."),
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
        text: msg(
          "You have two **instants** in hand. They can be cast at any time, even during your opponent's turn, and even **in response** to another spell.",
        ),
      },
      {
        until: all(onStack("Scorching Dragonfire"), pendingMine("priority")),
        text: msg("Your opponent's turn…"),
      },
      {
        next: true,
        target: "stack",
        text: msg(
          "Your opponent casts **Scorching Dragonfire** on your Bear Cub: 3 damage, enough to destroy it. The spell is waiting on the **stack**: it hasn't resolved yet, and you can respond.",
        ),
      },
      {
        target: { card: "Giant Growth", zone: "hand" },
        allow: [{ cast: "Giant Growth", target: "Bear Cub" }],
        until: (c) => powerOf(c, "Bear Cub") >= 5,
        text: msg("Respond with **Giant Growth** on the Bear Cub (+3/+3 until end of turn): drag it onto the Bear Cub."),
        hint: msg("Cast Giant Growth on the Bear Cub."),
      },
      {
        target: "stack",
        allow: ["pass"],
        until: all(stackEmpty, (c) => !onStack("Scorching Dragonfire")(c)),
        text: msg(
          "The stack resolves **from top to bottom**: your Giant Growth, added last, resolved first. The Bear Cub is 5/5! Click **Resolve** to let the Dragonfire resolve.",
        ),
        hint: msg('Click "Resolve" to continue.'),
      },
      {
        next: true,
        target: { card: "Bear Cub", zone: "battlefield" },
        text: msg("3 damage is no longer enough to destroy a 5/5 Bear Cub: it survives."),
      },
      {
        allow: ["pass"],
        until: pendingMine("declareBlockers"),
        text: msg(
          "Your opponent attacks! You could cast an instant right now, but wait for blocks: click **Pass** if the game offers it.",
        ),
        hint: msg('Click "Pass": you will choose your blockers right after.'),
      },
      {
        target: { card: "Savannah Lions", zone: "battlefield" },
        allow: [{ block: [["Savannah Lions", "Goblin Boarders"]] }],
        until: (c) => c.view.turn.step === "declareBlockers" && pendingMine("priority")(c),
        text: msg(
          "The **Goblin Boarders** (3/2) are attacking. Your Bear Cub has already been dealt 3 damage this turn: damage only wears off at end of turn, and 3 more would destroy it. Block with the **Savannah Lions** instead: click them, then confirm with **Block (1)**.",
        ),
        hint: msg("Block the Goblin Boarders with the Savannah Lions."),
      },
      {
        target: { card: "Divine Resilience", zone: "hand" },
        allow: [{ cast: "Divine Resilience", target: "Savannah Lions" }],
        until: inGraveyard("Goblin Boarders", "opponent"),
        text: msg(
          "The Lions are going to die against the Boarders… unless you cast **Divine Resilience** on them: they will gain **indestructible**. That's a **combat trick**!",
        ),
        hint: msg("Cast Divine Resilience on the Savannah Lions."),
      },
      {
        next: true,
        target: "oppField",
        text: msg(
          "The Lions, indestructible, survived and destroyed the Boarders. Thanks to your two instants, you didn't lose a single creature.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "abilities",
    title: msg("Keywords and abilities"),
    summary: msg("Flying, vigilance, lifelink, triggered and activated abilities."),
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
        text: msg("Many creatures have **abilities**. The most common ones are **keywords**, explained in the card's preview."),
      },
      {
        target: { card: "Serra Angel", zone: "battlefield" },
        until: hovered("Serra Angel"),
        text: msg("Hover over the **Serra Angel** (or press and hold it)."),
        hint: msg("Hover over the Serra Angel to continue."),
      },
      {
        next: true,
        target: "preview",
        text: msg(
          "**Flying**: the Angel can only be blocked by creatures with flying or reach. **Vigilance**: attacking doesn't cause it to tap, so it can also block during your opponent's turn.",
        ),
      },
      {
        next: true,
        target: { card: "Treetop Snarespinner", zone: "battlefield" },
        text: msg(
          "The **Healer's Hawk** has flying and **lifelink** (its damage gives you that much life). The **Treetop Snarespinner** has **reach** (it can block fliers) and **deathtouch** (any amount of damage destroys a creature).",
        ),
      },
      {
        target: { card: "Savannah Lions", zone: "hand" },
        allow: [{ cast: "Savannah Lions" }],
        until: (c) => lifeOf(c, "you") > 20,
        text: msg(
          'A **triggered ability** starts with "when", "whenever" or "at the beginning of". The **Dazzling Angel** makes you gain 1 life whenever another creature you control enters. Cast the **Savannah Lions** to see it.',
        ),
        hint: msg("Cast the Savannah Lions to continue."),
      },
      {
        next: true,
        target: "myLife",
        text: msg("You gained 1 life: the ability triggered all by itself."),
      },
      {
        target: { card: "Treetop Snarespinner", zone: "battlefield" },
        allow: [{ activate: "Treetop Snarespinner", target: "Serra Angel" }],
        until: (c) => powerOf(c, "Serra Angel") >= 5,
        text: msg(
          'An **activated ability** is written "cost: effect". The Snarespinner has "{2}{G}: Put a +1/+1 counter on target creature you control". Click the **Snarespinner**, then the **Serra Angel**.',
        ),
        hint: msg("Activate the Snarespinner targeting the Serra Angel."),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttackers"),
        text: msg("The Angel is now 5/5. Click **Combat**."),
        hint: msg('Click "Combat" to continue.'),
      },
      {
        target: "myField",
        allow: [{ attack: ["Serra Angel", "Healer's Hawk"] }, "pass"],
        until: (c) => lifeOf(c, "opponent") <= 14,
        text: msg(
          "Attack with the **Serra Angel** and the **Healer's Hawk**: the Swab Goblin has neither flying nor reach, so it can't block them.",
        ),
        hint: msg("Attack with the Serra Angel and the Healer's Hawk."),
      },
      {
        next: true,
        target: "myLife",
        text: msg("6 damage to your opponent, and the Hawk's lifelink gave you 1 life."),
      },
      {
        next: true,
        text: msg(
          "There are many other keywords: trample, first strike, defender, haste… Remember to hover over cards: the preview explains them all.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "game",
    title: msg("A complete game"),
    summary: msg("Opening hand, stops, then a real game against the AI."),
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
        text: msg(
          "Last lesson: a real game! Everything starts with the **opening hand**: 7 cards. If you don't like it (too many or too few lands), you can take a **mulligan**: you draw 7 new cards, but you put one on the bottom of your library for each mulligan.",
        ),
      },
      {
        allow: ["keep"],
        until: (c) => !pendingMine("mulligan")(c),
        text: msg("This hand has three lands and cheap spells: keep it."),
        hint: msg("For this tutorial, keep this hand."),
      },
      {
        next: true,
        target: "stops",
        text: msg(
          "**Stops**: the small dots under the phases show where the game stops to let you act (at the top during your turn, at the bottom during your opponent's). The game skips by itself the moments when you have nothing to do.",
        ),
      },
      {
        next: true,
        target: "endTurn",
        text: msg(
          "**Pass the turn** (Enter key) passes everything until the end of your turn. In the settings, **full control** gives you back control at every step.",
        ),
      },
      {
        free: true,
        until: gameOver,
        text: msg("Your turn to play! Your opponent has only 10 life. I'll give you a few tips along the way."),
        tips: [
          {
            when: (c) => pendingMine("declareBlockers")(c),
            text: msg('You are being attacked: click one of your creatures then the attacker to block, or choose "No block".'),
          },
          {
            when: (c) => pendingMine("priority")(c) && c.view.stack.some((it) => it.controller !== c.view.viewer),
            text: msg("Your opponent is casting a spell: respond with an instant, or let it resolve."),
          },
          {
            when: (c) =>
              (myStep("main1")(c) || myStep("main2")(c)) &&
              c.view.turn.landsPlayed === 0 &&
              c.view.hand.some((o) => o.types.includes("Land")),
            text: msg("Remember to play a land: one per turn."),
          },
          {
            when: (c) => myStep("main1")(c) && c.view.potentialAttackers > 0,
            text: msg('Your creatures can attack: click "Combat" once you have played your cards.'),
          },
          {
            when: (c) => pendingMine("declareAttackers")(c),
            text: msg("Click the creatures that attack, then confirm. Keep blockers back if your opponent is threatening."),
          },
        ],
      },
      {
        next: true,
        text: (c) =>
          c.view.winner === c.view.viewer
            ? msg(
                "**Victory!** You now know the essentials of Magic. To go further: **My decks** to build your own, **Play against the AI**, and **Against a player** to face a friend online.",
              )
            : msg(
                "You lost this time: restart the lesson whenever you like. You now know the essentials; to go further: **My decks**, **Play against the AI** and **Against a player**.",
              ),
      },
    ],
  },
];

export const lessonById = (id: string | null): Lesson | undefined => LESSONS.find((l) => l.id === id);
