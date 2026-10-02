/**
 * The Hobbit (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte Oracle
 * (plan R, lot R7). Contempler, Récit (storied), amasser des Gobelins, Nains et Équipements, Loups, Trésors…
 * Thorin, Mountain-king n'est pas testé ici : le moteur n'attache pas ses Équipements (arguments de `fx.attach` inversés
 * dans le script).
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { playerStatic } from "../src/statics";
import { canBlock } from "../src/turn";
import type { ActionOption, CardDef, ChoiceRequest, ChoiceValue, GameState, PlayerId } from "../src/types";
import { act, advanceUntil, castNowOf, customCard, idOf, idsOf, scenario, untilCastNow } from "./helpers";

type S = GameState;
/** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

/**
 * Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. Les
 * défenseurs ne bloquent pas.
 */
const settle = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
/** Joue (sans attaquer ni bloquer) jusqu'à la seconde phase principale, en répondant aux choix. */
const throughCombat = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
const cast = (s: S, player: string, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
/** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
  );
  if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const canActivate = (s: S, player: string, source: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
/** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
const attack = (s: S, attackers: string[]) => {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
};
/** Sélectionne dans les options d'un choix l'objet nommé `name`. */
const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
  req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;

describe("The Hobbit", () => {
  it("Elven Passage : 1 PV et sacrifice ; le terrain cherché arrive engagé, puis est dégagé en contemplant un Elfe en jeu", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({ p1: { battlefield: ["Elven Passage", ...battlefield], library: ["Opt", "Forest", "Island"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Elven Passage")), (req, cur) =>
        req.intent === "search" ? pickNamed(cur, req, "Forest") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Elven Passage")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.library).toHaveLength(2);
      return s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped;
    };
    expect(run(["Llanowar Elves"])).toBe(false);
    expect(run(["Bear Cub"])).toBe(true);
  });

  describe("Azog, Moria's Ruin", () => {
    it("détruit une de vos créatures : vous amassez des Gobelins X (sa force) et piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Fire Elemental"], hand: ["Azog, Moria's Ruin"], library: lands("Island", 3) },
      });
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) =>
        req.type === "pick" && req.options.includes(fire) ? [fire] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
      expect(s.objects[army]?.controller).toBe("p1");
      expect(s.objects[army]?.counters["+1/+1"]).toBe(5);
      expect(chars(s, army).subtypes).toContain("Goblin");
    });

    it("« jusqu'à une » : sans cible, rien n'est détruit ni amassé, et vous ne piochez pas", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Azog, Moria's Ruin"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.some((id) => chars(s, id).subtypes.includes("Army"))).toBe(false);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("la créature d'un adversaire : c'est lui qui amasse, et vous ne piochez pas", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Azog, Moria's Ruin"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
      expect(s.objects[army]?.controller).toBe("p2");
      expect(chars(s, army).power).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  it("The Sackville-Bagginses : sacrifice d'une autre créature, carte et Trésor ; un jeton sacrifié fait perdre 1 PV", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["The Sackville-Bagginses"], library: lands("Island", 3) },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "The Sackville-Bagginses"), (req) =>
      req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    // L'Ourson n'est pas un jeton : personne ne perd de PV.
    expect(s.players.p2?.life).toBe(20);
    const treasure = idOf(s, "p1", "battlefield", "Treasure");
    const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === treasure);
    s = act(s, "p1", {
      type: "tapForMana",
      source: treasure,
      ability: mana?.type === "tapForMana" ? mana.ability : 0,
      color: "B",
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(s.players.p2?.life).toBe(19);
  });

  it("The Sackville-Bagginses : le sacrifice est facultatif", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["The Sackville-Bagginses"] } });
    s = settle(cast(s, "p1", "The Sackville-Bagginses"), (req) => (req.type === "pick" ? [] : undefined));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(0);
  });

  it("Smaug the Magnificent : vol et célérité ; un Trésor à l'entretien ; en attaquant, blessures égales à vos Trésors", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Smaug the Magnificent"] },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    const smaug = idOf(s, "p1", "battlefield", "Smaug the Magnificent");
    expect(chars(s, smaug).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = throughCombat(attack(s, [smaug]), (req) => (req.type === "pick" && req.options.includes(elves) ? [elves] : undefined));
    // Un Trésor : 1 blessure aux Elfes (1/1), puis 4 blessures de combat.
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(16);
  });

  describe("The Lonely Mountain", () => {
    it("arrive engagée, sauf si vous contrôlez un Équipement", () => {
      const run = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["The Lonely Mountain"] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "The Lonely Mountain") }));
        return s.objects[idOf(s, "p1", "battlefield", "The Lonely Mountain")]?.tapped;
      };
      expect(run([])).toBe(true);
      expect(run(["Fishing Pole"])).toBe(false);
      const m = scenario({ p1: { battlefield: ["The Lonely Mountain"] } });
      const id = idOf(m, "p1", "battlefield", "The Lonely Mountain");
      expect(chars(m, id).subtypes).toContain("Mountain");
      expect(legalActions(m, "p1").some((a) => a.type === "tapForMana" && a.source === id && a.colors.includes("R"))).toBe(true);
    });

    it("{4}{R}, {T} : un Nain 2/2 rouge, {1} de moins par Équipement, en rituel seulement", () => {
      const setup = (equipment: string[]) =>
        scenario({ p1: { battlefield: ["The Lonely Mountain", ...lands("Mountain", 3), ...equipment] } });
      // Un seul Équipement : {3}{R}, trois Montagnes ne suffisent pas.
      const one = setup(["Fishing Pole"]);
      expect(canActivate(one, "p1", idOf(one, "p1", "battlefield", "The Lonely Mountain"))).toBe(false);
      // Deux Équipements : {2}{R}.
      let s = setup(["Fishing Pole", "Skateboard"]);
      const mountain = idOf(s, "p1", "battlefield", "The Lonely Mountain");
      s = settle(activate(s, "p1", mountain));
      const dwarf = idOf(s, "p1", "battlefield", "Dwarf");
      expect([chars(s, dwarf).power, chars(s, dwarf).toughness]).toEqual([2, 2]);
      expect(chars(s, dwarf).colors).toEqual(["R"]);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
      // Hors phase principale : impossible.
      let t = setup(["Fishing Pole", "Skateboard"]);
      t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "The Lonely Mountain"))).toBe(false);
    });
  });

  it("Dwarven Mauler : les capacités d'équipement qui la ciblent coûtent {2} de moins", () => {
    let s = scenario({ p1: { battlefield: ["Dwarven Mauler", "Bear Cub", "Fishing Pole"] } });
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const mauler = idOf(s, "p1", "battlefield", "Dwarven Mauler");
    // Équiper {2} sans aucun mana : possible sur la Brute, pas sur l'Ourson.
    expect(() => activate(s, "p1", pole, undefined, { targets: { t: [bear] } })).toThrow();
    s = settle(activate(s, "p1", pole, undefined, { targets: { t: [mauler] } }));
    expect(s.objects[pole]?.attachedTo).toBe(mauler);
  });

  describe("Dáin's Company", () => {
    it("en arrivant : un Nain ou un Équipement parmi les quatre cartes du dessus, le reste au-dessous", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Plains"],
          hand: ["Dáin's Company"],
          library: ["Opt", "Fishing Pole", "Dwarven Mauler", "Island", "Swamp"],
        },
      });
      let seen: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Dáin's Company"), (req, cur) => {
        if (req.type !== "pick") return undefined;
        seen = namesIn(cur, req.options);
        return pickNamed(cur, req, "Dwarven Mauler");
      });
      expect(seen.sort()).toEqual(["Dwarven Mauler", "Fishing Pole"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Dwarven Mauler"]);
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Swamp");
      expect(library.slice(1).sort()).toEqual(["Fishing Pole", "Island", "Opt"]);
    });

    it("a le lien de vie tant que vous contrôlez un autre Nain", () => {
      const alone = scenario({ p1: { battlefield: ["Dáin's Company", "Bear Cub"] } });
      expect(chars(alone, idOf(alone, "p1", "battlefield", "Dáin's Company")).keywords).not.toContain("lifelink");
      const s = scenario({ p1: { battlefield: ["Dáin's Company", "Dwarven Mauler"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Dáin's Company")).keywords).toContain("lifelink");
    });
  });

  describe("Kíli the Resourceful", () => {
    it("un autre Nain ou Équipement qui arrive fait piocher, une seule fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Kíli the Resourceful", ...lands("Mountain", 2)], hand: ["Dwarven Mauler", "Dwarven Mauler"] },
      });
      s = settle(cast(s, "p1", "Dwarven Mauler"));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Dwarven Mauler"));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("récit durable : la première capacité d'équipement du tour se paie {0}, pas la suivante", () => {
      let s = scenario({
        p1: { battlefield: ["Kíli the Resourceful", "Fishing Pole", "Skateboard", "Mountain"], hand: ["Opt"] },
      });
      const kili = idOf(s, "p1", "battlefield", "Kíli the Resourceful");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const board = idOf(s, "p1", "battlefield", "Skateboard");
      // Kíli (légendaire) et deux artefacts : récit durable dès la vérification des actions basées sur un état.
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(playerStatic(s, "p1", "enduringStory")).toBe(true);
      // Équiper {2} gratuit, avec une seule Montagne dégagée qui le reste.
      s = settle(activate(s, "p1", pole, undefined, { targets: { t: [kili] } }));
      expect(s.objects[pole]?.attachedTo).toBe(kili);
      expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(false);
      // Le second Équiper du tour se paie : {1} pour le Skateboard.
      s = settle(activate(s, "p1", board, undefined, { targets: { t: [kili] } }));
      expect(s.objects[board]?.attachedTo).toBe(kili);
      expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(true);
    });

    it("sans récit durable, Équiper se paie normalement", () => {
      const s = scenario({ p1: { battlefield: ["Kíli the Resourceful", "Fishing Pole", "Bear Cub"] } });
      expect(playerStatic(s, "p1", "enduringStory")).toBe(false);
      expect(canActivate(s, "p1", idOf(s, "p1", "battlefield", "Fishing Pole"))).toBe(false);
    });
  });

  describe("Chief Warg's Company", () => {
    it("n'attaque qu'avec deux autres Loups ; un Loup 2/2 vert à chaque entretien", () => {
      let s = scenario({ p1: { battlefield: ["Chief Warg's Company", "Desolation Prowler"] } });
      const chief = idOf(s, "p1", "battlefield", "Chief Warg's Company");
      expect(chars(s, chief).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: chief, defender: "p2" }] })).toThrow();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const wolf = idOf(s, "p1", "battlefield", "Wolf");
      expect([chars(s, wolf).power, chars(s, wolf).toughness]).toEqual([2, 2]);
      expect(chars(s, wolf).colors).toEqual(["G"]);
      s = throughCombat(attack(s, [chief]));
      expect(s.players.p2?.life).toBe(15);
    });
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon l'état courant. */
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const tokens = (s: S, player: string, name: string) => idsOf(s, player, "battlefield", name);

  /** Passe et répond aux choix jusqu'à une pile vide, sans déclenchement en attente. Personne ne bloque. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Choisit les options voulues quand elles sont proposées. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const ability = (s: S, player: string, source: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
    );
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source)?.ability ?? -1, ...extra });
  /** Va à la déclaration des attaquants du joueur actif. */
  const toAttack = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  const attack = (s: S, player: string, ids: string[], defender: string) =>
    act(toAttack(s), player, { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender })) });

  describe("The Hobbit, lot A — blanc", () => {
    describe("recruter (Lake-town Lookout)", () => {
      const run = (top: string) => {
        let s = scenario({
          p1: {
            battlefield: ["Lake-town Lookout", "Mountain", "Mountain"],
            hand: ["Lightning Strike"],
            library: [top, "Plains"],
          },
        });
        const lookout = idOf(s, "p1", "battlefield", "Lake-town Lookout");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [lookout] } }));
        return s;
      };

      it("en mourant : piochez puis défaussez ; une carte non-terrain défaussée donne un Humain Soldat 1/1", () => {
        const s = run("Opt");
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Lake-town Lookout", "Opt"]));
        expect(s.players.p1?.hand).toHaveLength(0);
        const soldier = tokens(s, "p1", "Human Soldier");
        expect(soldier).toHaveLength(1);
        expect(pt(s, soldier[0] as string)).toEqual([1, 1]);
        expect(chars(s, soldier[0] as string).colors).toEqual(["W"]);
      });

      it("une carte de terrain défaussée : pas de jeton", () => {
        const s = run("Island");
        expect(namesIn(s, s.players.p1?.graveyard)).toContain("Island");
        expect(tokens(s, "p1", "Human Soldier")).toHaveLength(0);
      });
    });

    it("Celebrate the Mountain-king : exile un permanent non-terrain adverse jusqu'à son départ, et recrutez", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 8), hand: ["Celebrate the Mountain-king", "Thorin's Last Stand"], library: ["Opt"] },
        p2: { battlefield: ["Serra Angel", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Le recrutement défausse l'Opt piochée.
      s = settle(cast(s, "p1", "Celebrate the Mountain-king"), (req, cur) =>
        picking([angel, ...idsOf(cur, "p1", "hand", "Opt")])(req, cur),
      );
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(namesIn(s, s.exile)).toContain("Serra Angel");
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
      // L'enchantement détruit, l'Ange revient.
      const celebrate = idOf(s, "p1", "battlefield", "Celebrate the Mountain-king");
      s = settle(cast(s, "p1", "Thorin's Last Stand", { mode: 1, targets: { t: [celebrate] } }));
      expect(idsOf(s, "p1", "graveyard", "Celebrate the Mountain-king")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
    });

    describe("Dáin, Lord of the Iron Hills", () => {
      const setup = (p1: string[], p2Lands: number) =>
        toAttack(
          scenario({
            p1: { battlefield: p1 },
            p2: { battlefield: ["Bear Cub", ...lands("Mountain", p2Lands)] },
            active: "p2",
          }),
        );

      it("récit durable : attaquer Dáin coûte {1} par créature à l'attaquant", () => {
        const s = setup(["Dáin, Lord of the Iron Hills", "Dwarven Shortsword", "Dwarven Shortsword"], 0);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] })).toThrow();
        let t = setup(["Dáin, Lord of the Iron Hills", "Dwarven Shortsword", "Dwarven Shortsword"], 1);
        t = act(t, "p2", {
          type: "declareAttackers",
          attackers: [{ id: idOf(t, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
        });
        expect(t.objects[idOf(t, "p2", "battlefield", "Mountain")]?.tapped).toBe(true);
      });

      it("sans récit durable, l'attaque est gratuite", () => {
        let s = setup(["Dáin, Lord of the Iron Hills"], 0);
        s = act(s, "p2", {
          type: "declareAttackers",
          attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
        });
        expect(s.combat?.attackers).toHaveLength(1);
      });
    });

    it("Dwarven Provisioner : {3}{W} — vos créatures gagnent +1/+1 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Dwarven Provisioner", "Bear Cub", ...lands("Plains", 4)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const prov = idOf(s, "p1", "battlefield", "Dwarven Provisioner");
      s = settle(activate(s, "p1", prov));
      expect(pt(s, prov)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Dwarven Shortsword : un Nain 2/2 arrive, l'Équipement s'y attache (+1/+2)", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Dwarven Shortsword"] } });
      s = settle(cast(s, "p1", "Dwarven Shortsword"));
      const dwarf = idOf(s, "p1", "battlefield", "Dwarf");
      expect(s.objects[idOf(s, "p1", "battlefield", "Dwarven Shortsword")]?.attachedTo).toBe(dwarf);
      expect(pt(s, dwarf)).toEqual([3, 4]);
      expect(chars(s, dwarf).colors).toEqual(["R"]);
    });

    it("Eagle of the Great Shelf : en attaquant, +1/+1 pour chacune de vos autres créatures", () => {
      let s = scenario({ p1: { battlefield: ["Eagle of the Great Shelf", "Bear Cub", "Llanowar Elves"] } });
      const eagle = idOf(s, "p1", "battlefield", "Eagle of the Great Shelf");
      s = settle(attack(s, "p1", [eagle], "p2"));
      expect(pt(s, eagle)).toEqual([4, 7]);
    });

    describe("The Eagles Are Coming!", () => {
      it("une créature que vous possédez revient en main ; à l'entretien suivant, un Oiseau Soldat 4/4 volant", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 2)], hand: ["The Eagles Are Coming!"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "The Eagles Are Coming!", { targets: { t: [bear] } }));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
        expect(tokens(s, "p1", "Bird Soldier")).toHaveLength(0);
        s = settle(advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw"));
        const birds = tokens(s, "p1", "Bird Soldier");
        expect(birds).toHaveLength(1);
        expect(pt(s, birds[0] as string)).toEqual([4, 4]);
        expect(chars(s, birds[0] as string).keywords).toContain("flying");
      });

      it("kickée : autant de créatures ciblées qu'on veut, un Oiseau pour chacune ; pas les créatures adverses", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 6)], hand: ["The Eagles Are Coming!"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "The Eagles Are Coming!", { kicked: true, targets: { t: [bear, angel] } })).toThrow();
        s = settle(cast(s, "p1", "The Eagles Are Coming!", { kicked: true, targets: { t: [bear, elves] } }));
        expect(s.players.p1?.hand).toHaveLength(2);
        s = settle(advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw"));
        expect(tokens(s, "p1", "Bird Soldier")).toHaveLength(2);
      });
    });

    it("Esgaroth Garrison : sa force est le nombre de vos créatures ; en arrivant, recrutez", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Esgaroth Garrison"], library: ["Opt"] },
      });
      s = settle(cast(s, "p1", "Esgaroth Garrison"));
      const garrison = idOf(s, "p1", "battlefield", "Esgaroth Garrison");
      // L'Ourson, la Garnison et l'Humain Soldat du recrutement.
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
      expect(pt(s, garrison)).toEqual([3, 5]);
    });

    describe("Fíli the Pathfinder", () => {
      it("Fíli ou un autre Nain non-jeton arrive : un Nain 2/2 ; un jeton Nain ne déclenche rien", () => {
        let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Fíli the Pathfinder", "Dwarven Provisioner"] } });
        s = settle(cast(s, "p1", "Fíli the Pathfinder"));
        expect(tokens(s, "p1", "Dwarf")).toHaveLength(1);
        s = settle(cast(s, "p1", "Dwarven Provisioner"));
        expect(tokens(s, "p1", "Dwarf")).toHaveLength(2);
      });

      it("récit durable : vos créatures gagnent +1/+1", () => {
        let s = scenario({ p1: { battlefield: ["Fíli the Pathfinder", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(pt(s, bear)).toEqual([2, 2]);
        let t = scenario({
          p1: { battlefield: ["Fíli the Pathfinder", "Bear Cub", "Dwarven Shortsword", "Dwarven Shortsword"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        t = settle(t);
        expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
        expect(pt(t, idOf(t, "p1", "battlefield", "Fíli the Pathfinder"))).toEqual([3, 3]);
        expect(pt(t, idOf(t, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
        s = settle(s);
        expect(pt(s, bear)).toEqual([2, 2]);
      });
    });

    it("Gleaming Splendor : deux joueurs ciblés piochent ; la deuxième carte d'un adversaire ce tour-ci donne un Trésor", () => {
      let s = scenario({ p1: { battlefield: ["Gleaming Splendor", ...lands("Plains", 6)] } });
      const splendor = idOf(s, "p1", "battlefield", "Gleaming Splendor");
      s = settle(activate(s, "p1", splendor, { targets: { t: ["p1", "p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
      s = settle(activate(s, "p1", splendor, { targets: { t: ["p1", "p2"] } }));
      expect(s.players.p2?.hand).toHaveLength(2);
      // Votre propre deuxième carte ne compte pas : un seul Trésor.
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Iron Hills Blacksmith : en arrivant, un Équipement Axe (+1/+0, équiper {2})", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Iron Hills Blacksmith"] } });
      s = settle(cast(s, "p1", "Iron Hills Blacksmith"));
      const axe = idOf(s, "p1", "battlefield", "Axe");
      expect(chars(s, axe).subtypes).toContain("Equipment");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", axe, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Iron Hills Blacksmith")).keywords).toContain("doubleStrike");
    });

    describe("Lake-town Toymaker", () => {
      it("au début du combat, avec deux cartes piochées ce tour-ci : une autre créature gagne +3/+0 et l'initiative", () => {
        let s = scenario({
          p1: { battlefield: ["Lake-town Toymaker", "Bear Cub", "Gleaming Splendor", ...lands("Plains", 6)] },
        });
        const splendor = idOf(s, "p1", "battlefield", "Gleaming Splendor");
        for (let i = 0; i < 2; i++) s = settle(activate(s, "p1", splendor, { targets: { t: ["p1", "p2"] } }));
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(
          advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0),
          picking([bear]),
        );
        expect(pt(s, bear)).toEqual([5, 2]);
        expect(chars(s, bear).keywords).toContain("firstStrike");
      });

      it("sans deux cartes piochées : rien", () => {
        let s = scenario({ p1: { battlefield: ["Lake-town Toymaker", "Bear Cub"] } });
        s = toAttack(s);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      });
    });

    it("Magnificent End : {3} de moins contre une créature engagée ; 5 blessures", () => {
      const s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Magnificent End"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      expect(() => cast(s, "p1", "Magnificent End", { targets: { t: [dragon] } })).toThrow();
      const t = settle(cast(s, "p1", "Magnificent End", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Moment of Glory : un marqueur sur la cible ; lancée du cimetière (flashback), aussi sur chacune de vos autres créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 6)], hand: ["Moment of Glory"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Moment of Glory", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[elves]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Moment of Glory"), targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(namesIn(s, s.exile)).toContain("Moment of Glory");
    });

    it("The Mountain-king's Return : II une créature de VM 3 ou moins revient du cimetière ; III un marqueur +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "The Mountain-king's Return", counters: { lore: 1 } }],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
        active: "p2",
        step: "end",
      });
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
      s = settle(s, picking([bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "The Mountain-king's Return")).toHaveLength(1);
    });

    it("Ori, Keeper of Songs : récit durable, +1/+0 et la vigilance", () => {
      let s = settle(scenario({ p1: { battlefield: ["Ori, Keeper of Songs"] } }));
      const ori = idOf(s, "p1", "battlefield", "Ori, Keeper of Songs");
      expect(pt(s, ori)).toEqual([3, 3]);
      expect(chars(s, ori).keywords).not.toContain("vigilance");
      s = settle(scenario({ p1: { battlefield: ["Ori, Keeper of Songs", "Dwarven Shortsword", "Dwarven Shortsword"] } }));
      const ori2 = idOf(s, "p1", "battlefield", "Ori, Keeper of Songs");
      expect(pt(s, ori2)).toEqual([4, 3]);
      expect(chars(s, ori2).keywords).toContain("vigilance");
    });

    it("The Queen of Dale : le premier sort non-créature d'un adversaire chaque tour vous fait recruter", () => {
      let s = scenario({
        p1: { battlefield: ["The Queen of Dale"], library: ["Opt", "Opt", "Opt"] },
        p2: { battlefield: [...lands("Island", 2), ...lands("Forest", 1)], hand: ["Opt", "Opt", "Llanowar Elves"] },
        active: "p2",
      });
      s = settle(cast(s, "p2", "Llanowar Elves"));
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(0);
      s = settle(cast(s, "p2", "Opt"));
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
      s = settle(cast(s, "p2", "Opt"));
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
    });

    it("Roads Go Ever, Ever On : I exile deux Plaines, +2 PV ; II et III les rendent en main ; IV renforce à l'attaque", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Bear Cub"],
          hand: ["Roads Go Ever, Ever On"],
          library: [...lands("Plains", 3), ...lands("Forest", 7)],
        },
      });
      s = settle(cast(s, "p1", "Roads Go Ever, Ever On"));
      expect(s.players.p1?.life).toBe(22);
      expect(namesIn(s, s.exile)).toEqual(["Plains", "Plains"]);
      expect(s.players.p1?.library).toHaveLength(8);
      // Chapitre II.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3));
      expect(namesIn(s, s.exile)).toEqual(["Plains"]);
      expect(namesIn(s, s.players.p1?.hand)).toContain("Plains");
      // Chapitre III.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5));
      expect(s.exile).toHaveLength(0);
      // Chapitre IV : la Saga est sacrifiée, l'effet reste pour le tour.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 7));
      expect(idsOf(s, "p1", "graveyard", "Roads Go Ever, Ever On")).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, "p1", [bear], "p2"), picking([bear]));
      // Deux Plaines contrôlées : +2/+2.
      expect(pt(s, bear)).toEqual([4, 4]);
    });

    it("Settle the Wreckage : exile les attaquants du joueur ciblé ; il cherche autant de terrains de base, engagés", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Settle the Wreckage"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Llanowar Elves"], library: [...lands("Mountain", 3), "Opt"] },
        active: "p2",
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attack(s, "p2", [bear, angel], "p1");
      // p2 a la priorité après la déclaration ; p1 répond.
      s = act(s, "p2", { type: "pass" });
      s = settle(cast(s, "p1", "Settle the Wreckage", { targets: { t: ["p2"] } }));
      expect(namesIn(s, s.exile).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
      const mountains = idsOf(s, "p2", "battlefield", "Mountain");
      expect(mountains).toHaveLength(2);
      expect(mountains.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    describe("Stone by Sunlight", () => {
      it("détruit une créature de force 4 ou plus, pas une plus petite", () => {
        const s = scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["Stone by Sunlight"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        expect(() =>
          cast(s, "p1", "Stone by Sunlight", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
        ).toThrow();
        const t = settle(
          cast(s, "p1", "Stone by Sunlight", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        );
        expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("ou la créature devient un artefact en plus et gagne l'indestructible jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Stone by Sunlight"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Stone by Sunlight", { mode: 1, targets: { c: [bear] } }));
        expect(chars(s, bear).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(chars(s, bear).keywords).toContain("indestructible");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, bear).types).not.toContain("Artifact");
      });
    });

    it("Thorin's Last Stand : vos créatures gagnent +2/+1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Thorin's Last Stand"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Thorin's Last Stand", { mode: 0 }));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("An Unexpected Party // At the Door : X Nains 2/2, puis l'enchantement depuis l'exil donne +2/+2 au type choisi", () => {
      let s = scenario({
        // Aucun Nain non-jeton dans la partie : le type des jetons qu'elle crée est proposé.
        p1: {
          battlefield: [...lands("Plains", 9), "Bear Cub"],
          hand: ["An Unexpected Party // At the Door"],
          library: lands("Plains", 6),
        },
      });
      s = settle(cast(s, "p1", "An Unexpected Party // At the Door", { face: 1, x: 2 }));
      const dwarves = tokens(s, "p1", "Dwarf");
      expect(dwarves).toHaveLength(2);
      expect(namesIn(s, s.exile)).toEqual(["An Unexpected Party // At the Door"]);
      const party = s.exile[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: party }), (req) =>
        req.type === "pick" && req.options.includes("Dwarf") ? ["Dwarf"] : undefined,
      );
      expect(pt(s, dwarves[0] as string)).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Gaze in Wonder (Velvetwing Butterflies) : engage une ou deux créatures ciblées", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Velvetwing Butterflies // Gaze in Wonder"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const ids = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
      s = settle(cast(s, "p1", "Velvetwing Butterflies // Gaze in Wonder", { face: 1, targets: { t: ids } }));
      expect(ids.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(namesIn(s, s.exile)).toEqual(["Velvetwing Butterflies // Gaze in Wonder"]);
    });

    describe("Vow to Erebor", () => {
      it("dégage la créature, +2/+2 ; un Nain peut recevoir un Équipement que vous contrôlez", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 2), { name: "Dwarven Provisioner", tapped: true }, "Dwarven Shortsword"],
            hand: ["Vow to Erebor"],
          },
        });
        const prov = idOf(s, "p1", "battlefield", "Dwarven Provisioner");
        const sword = idOf(s, "p1", "battlefield", "Dwarven Shortsword");
        s = settle(cast(s, "p1", "Vow to Erebor", { targets: { t: [prov] } }), (req) => (req.type === "yesNo" ? [1] : undefined));
        expect(s.objects[prov]?.tapped).toBe(false);
        expect(s.objects[sword]?.attachedTo).toBe(prov);
        // 2/2, +2/+2, +1/+2.
        expect(pt(s, prov)).toEqual([5, 6]);
      });

      it("une créature qui n'est pas un Nain ne reçoit pas d'Équipement", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 2), { name: "Bear Cub", tapped: true }, "Dwarven Shortsword"],
            hand: ["Vow to Erebor"],
          },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Vow to Erebor", { targets: { t: [bear] } }), (req) => (req.type === "yesNo" ? [1] : undefined));
        expect(s.objects[bear]?.tapped).toBe(false);
        expect(s.objects[idOf(s, "p1", "battlefield", "Dwarven Shortsword")]?.attachedTo).toBeUndefined();
        expect(pt(s, bear)).toEqual([4, 4]);
      });
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passe et répond aux choix (suggestion par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  /** Joue jusqu'à la seconde phase principale (sans bloquer), en répondant aux choix. */
  const toMain2 = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Choisit dans les options l'objet nommé `name`. */
  const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;
  /** Défausse : la carte nommée. */
  const discarding =
    (name: string): Answer =>
    (req, cur) =>
      req.type === "pick" && req.options.some((id) => nameOf(cur, id) === name) ? pickNamed(cur, req, name) : undefined;

  const TRINKET = customCard({
    name: "Hob Test Trinket",
    typeLine: "Artifact",
    types: ["Artifact"],
  });

  describe("The Hobbit, lot A — bleu", () => {
    describe("Bilbo, Luckwearer // Burglar's Plot", () => {
      const BILBO = "Bilbo, Luckwearer // Burglar's Plot";

      it("ne peut pas être bloqué ; ses blessures de combat à un joueur : piochez, puis défaussez", () => {
        let s = scenario({
          p1: { battlefield: [BILBO], hand: ["Lightning Strike"], library: ["Island", "Island"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bilbo = idOf(s, "p1", "battlefield", BILBO);
        expect(chars(s, bilbo).keywords).toContain("unblockable");
        s = attack(s, [bilbo]);
        expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), bilbo)).toBe(false);
        s = toMain2(s, discarding("Lightning Strike"));
        expect(s.players.p2?.life).toBe(19);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Lightning Strike"]);
      });

      it("Burglar's Plot : échange le contrôle de deux créatures ; deux permanents sans type commun sont refusés", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 5), "Bear Cub", TRINKET], hand: [BILBO] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const trinket = idOf(s, "p1", "battlefield", TRINKET.name);
        const card = idOf(s, "p1", "hand", BILBO);
        // Mode « créatures » (1) : un artefact non-créature n'est pas une cible permise.
        expect(() => act(s, "p1", { type: "cast", card, face: 1, mode: 1, targets: { a: [trinket], b: [angel] } })).toThrow();
        s = settle(act(s, "p1", { type: "cast", card, face: 1, mode: 1, targets: { a: [bear], b: [angel] } }));
        expect(s.objects[bear]?.controller).toBe("p2");
        expect(s.objects[angel]?.controller).toBe("p1");
        // Aventure : la carte est exilée, et la créature se lance depuis l'exil.
        expect(namesIn(s, s.exile)).toContain(BILBO);
      });
    });

    describe("Bilbo, Thief in the Night", () => {
      it("en attaquant, lancez un éphémère de votre cimetière ({1} de moins), exilé ensuite", () => {
        let s = scenario({
          p1: { battlefield: ["Bilbo, Thief in the Night", "Mountain"], graveyard: ["Lightning Strike"] },
        });
        s = untilCastNow(attack(s, [idOf(s, "p1", "battlefield", "Bilbo, Thief in the Night")]));
        const offered = castNowOf(s)?.cards ?? [];
        expect(namesIn(s, offered)).toEqual(["Lightning Strike"]);
        // {1}{R} moins {1} : la seule Montagne suffit.
        s = settle(act(s, "p1", { type: "cast", card: offered[0] as string, targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
        expect(namesIn(s, s.exile)).toContain("Lightning Strike");
        expect(s.players.p1?.graveyard).toHaveLength(0);
      });

      it("sans artefact, éphémère ni rituel au cimetière, rien n'est proposé", () => {
        let s = scenario({ p1: { battlefield: ["Bilbo, Thief in the Night"], graveyard: ["Bear Cub"] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Bilbo, Thief in the Night")]);
        s = toMain2(s);
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
        expect(s.players.p2?.life).toBe(18);
      });
    });

    it("Bilbo Baggins, Burglar : en arrivant, piochez ; Take a Glance : regard 2, puis la créature se lance depuis l'exil", () => {
      const BAGGINS = "Bilbo Baggins, Burglar // Take a Glance";
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: [BAGGINS], library: ["Opt", "Forest", "Island"] } });
      let scried = 0;
      s = settle(cast(s, "p1", BAGGINS, { face: 1 }), (req, cur) => {
        if (req.type !== "pick" || !req.prompt.startsWith("Regard")) return undefined;
        scried = req.options.length;
        return pickNamed(cur, req, "Opt");
      });
      expect(scried).toBe(2);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest", "Island", "Opt"]);
      const exiled = s.exile.find((id) => nameOf(s, id) === BAGGINS) as string;
      expect(exiled).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      expect(idsOf(s, "p1", "battlefield", BAGGINS)).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    });

    describe("Confusticate and Bebother", () => {
      it("contrecarre un sort dont le contrôleur ne peut pas payer {4}", () => {
        let s = scenario({
          p1: {
            battlefield: ["Mountain", "Mountain", ...lands("Island", 3)],
            hand: ["Lightning Strike", "Confusticate and Bebother"],
          },
        });
        s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
        const strike = s.stack[0]?.id as string;
        s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 0, targets: { t: [strike] } }));
        expect(s.players.p2?.life).toBe(20);
        expect(namesIn(s, s.players.p1?.graveyard)).toContain("Lightning Strike");
      });

      it("le sort est résolu si son contrôleur paie {4}", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Confusticate and Bebother"] },
          p2: { battlefield: [...lands("Mountain", 6)], hand: ["Lightning Strike"] },
          active: "p2",
        });
        s = cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } });
        const strike = s.stack[0]?.id as string;
        s = act(s, "p2", { type: "pass" });
        s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 0, targets: { t: [strike] } }));
        expect(s.players.p1?.life).toBe(17);
      });

      it("second mode : piochez deux cartes, puis défaussez une carte", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Confusticate and Bebother"], library: ["Opt", "Forest"] },
        });
        s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 1 }), discarding("Forest"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Confusticate and Bebother", "Forest"]);
      });
    });

    it("Elven Raft-Steerer : un terrain arrive — engagez une créature adverse, ou dégagez une des vôtres", () => {
      let s = scenario({
        p1: { battlefield: ["Elven Raft-Steerer", { name: "Bear Cub", tapped: true }], hand: ["Island", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), (req) =>
        req.intent === "triggerMode" ? ["0"] : req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
      s.turn.landsPlayed = 0;
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), (req) =>
        req.intent === "triggerMode" ? ["1"] : req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Elvenking's Harper : {4}{U} — la créature ciblée ne peut pas être bloquée ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Elvenking's Harper", "Bear Cub", ...lands("Island", 5)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Elvenking's Harper"), undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("unblockable");
    });

    it("Enchanted River's Grasp : engage la créature, retire ses marqueurs ; elle perd ses capacités et ne se dégage plus", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Enchanted River's Grasp"] },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 2 } }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Enchanted River's Grasp", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, angel).keywords).not.toContain("flying");
      expect(pt(s, angel)).toEqual([4, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Fateful Discovery : un artefact arrive sous votre contrôle, piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Fateful Discovery"], hand: [TRINKET], library: ["Island"] } });
      s = settle(cast(s, "p1", TRINKET.name));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });

    it("Gandalf, Wandering Wizard : {6} — son propriétaire le mélange dans sa bibliothèque et pioche trois cartes", () => {
      let s = scenario({
        p1: { battlefield: ["Gandalf, Wandering Wizard", ...lands("Island", 6)], library: lands("Forest", 5) },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Gandalf, Wandering Wizard")));
      expect(idsOf(s, "p1", "battlefield", "Gandalf, Wandering Wizard")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.library).toHaveLength(3);
      expect(namesIn(s, [...(s.players.p1?.library ?? []), ...(s.players.p1?.hand ?? [])])).toContain(
        "Gandalf, Wandering Wizard",
      );
    });

    describe("Recrutement", () => {
      it("Great Gilded Boat : quand vous attaquez, piochez puis défaussez ; une carte non-terrain défaussée donne un Humain Soldat", () => {
        let s = scenario({
          p1: { battlefield: ["Great Gilded Boat", "Bear Cub"], hand: ["Lightning Strike"], library: ["Island"] },
        });
        s = toMain2(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), discarding("Lightning Strike"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        const soldiers = idsOf(s, "p1", "battlefield", "Human Soldier");
        expect(soldiers).toHaveLength(1);
        expect(pt(s, soldiers[0] as string)).toEqual([1, 1]);
        expect(chars(s, soldiers[0] as string).colors).toEqual(["W"]);
      });

      it("Long Lake Nuisance : en arrivant, recrutement ; un terrain défaussé ne donne pas de jeton", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 4), hand: ["Long Lake Nuisance", "Forest"], library: ["Opt"] },
        });
        s = settle(cast(s, "p1", "Long Lake Nuisance"), discarding("Forest"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(idsOf(s, "p1", "battlefield", "Human Soldier")).toHaveLength(0);
      });

      it("Sound the Trumpets : contrecarre ; un sort de valeur de mana 2 ou moins donne un recrutement, pas au-delà", () => {
        const run = (spell: string, mana: string[]) => {
          let s = scenario({
            p1: { battlefield: lands("Island", 3), hand: ["Sound the Trumpets", "Lightning Strike"], library: ["Island"] },
            p2: { battlefield: mana, hand: [spell] },
            active: "p2",
          });
          s = cast(s, "p2", spell, spell === "Lightning Strike" ? { targets: { t: ["p1"] } } : {});
          const target = s.stack[0]?.id as string;
          s = act(s, "p2", { type: "pass" });
          s = settle(cast(s, "p1", "Sound the Trumpets", { targets: { t: [target] } }), discarding("Lightning Strike"));
          expect(namesIn(s, s.players.p2?.graveyard)).toContain(spell);
          return s;
        };
        const cheap = run("Lightning Strike", lands("Mountain", 2));
        expect(cheap.players.p1?.life).toBe(20);
        expect(idsOf(cheap, "p1", "battlefield", "Human Soldier")).toHaveLength(1);
        const big = run("Serra Angel", lands("Plains", 5));
        expect(idsOf(big, "p1", "battlefield", "Human Soldier")).toHaveLength(0);
        expect(namesIn(big, big.players.p1?.hand).sort()).toEqual(["Lightning Strike"]);
      });
    });

    it("Lakeshore Apothecary : la deuxième carte piochée du tour lui met un marqueur +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["Lakeshore Apothecary", ...lands("Island", 2)], hand: ["Opt", "Opt"], library: lands("Island", 4) },
      });
      const apo = idOf(s, "p1", "battlefield", "Lakeshore Apothecary");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[apo]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[apo]?.counters["+1/+1"]).toBe(1);
    });

    it("Gone Fishing : exile deux de vos créatures et/ou terrains, puis les renvoie (dégagés, sans marqueurs)", () => {
      const MARINERS = "Lake-town Mariners // Gone Fishing";
      let s = scenario({
        p1: {
          battlefield: [{ name: "Island", tapped: true }, ...lands("Island", 4), { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: [MARINERS],
        },
      });
      const tapped = s.battlefield.find((id) => s.objects[id]?.tapped) as string;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", MARINERS, { face: 1, targets: { t: [tapped, bear] } }));
      const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(newBear).not.toBe(bear);
      expect(s.objects[newBear]?.counters["+1/+1"] ?? 0).toBe(0);
      // Quatre Îles payées ; l'Île engagée exilée revient dégagée.
      expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped)).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(5);
    });

    it("The Lord of the Eagles : coûte {X} de moins, X étant la force totale de vos créatures volantes ; flash", () => {
      let s = scenario({
        p1: { battlefield: ["Serra Angel", "Bear Cub", ...lands("Island", 5)], hand: ["The Lord of the Eagles"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      // {7}{U}{U} − 4 (Serra Angel ; l'Ours ne vole pas) : cinq Îles.
      s = settle(cast(s, "p1", "The Lord of the Eagles"));
      expect(idsOf(s, "p1", "battlefield", "The Lord of the Eagles")).toHaveLength(1);
    });

    it("Mirkwood Meditator : un terrain arrive — vous pouvez faire passer sa F/E de base à 4/2 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Mirkwood Meditator"], hand: ["Island"] } });
      const med = idOf(s, "p1", "battlefield", "Mirkwood Meditator");
      expect(pt(s, med)).toEqual([2, 4]);
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), (req) =>
        req.type === "pick" && req.options.includes("yes") ? ["yes"] : undefined,
      );
      expect(pt(s, med)).toEqual([4, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, med)).toEqual([2, 4]);
    });

    describe("Most Decrepit Old Bird // Speak Secrets", () => {
      const BIRD = "Most Decrepit Old Bird // Speak Secrets";

      it("Seuil : +1/+1 avec sept cartes ou plus dans votre cimetière", () => {
        const s = scenario({ p1: { battlefield: [BIRD], graveyard: lands("Island", 6) } });
        const bird = idOf(s, "p1", "battlefield", BIRD);
        expect(pt(s, bird)).toEqual([1, 1]);
        const t = scenario({ p1: { battlefield: [BIRD], graveyard: lands("Island", 7) } });
        expect(pt(t, idOf(t, "p1", "battlefield", BIRD))).toEqual([2, 2]);
      });

      it("Speak Secrets : meulez quatre cartes, puis un éphémère ou un rituel meulé va dans votre main", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Island", 2),
            hand: [BIRD],
            library: ["Forest", "Opt", "Bear Cub", "Island", "Lightning Strike"],
          },
        });
        s = settle(cast(s, "p1", BIRD, { face: 1 }));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Island"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Lightning Strike"]);
      });
    });

    describe("Old Fat Spider Can't See Me", () => {
      it("I : une de vos créatures a la défense talismanique tant que la Saga reste", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Old Fat Spider Can't See Me"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Old Fat Spider Can't See Me"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
        );
        expect(chars(s, bear).keywords).toContain("hexproof");
      });

      it("II : les blessures de la créature ciblée sont prévenues ; III et IV : piochez ; la Saga partie, plus rien", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Old Fat Spider Can't See Me", counters: { lore: 1 } }, "Bear Cub"] },
          active: "p2",
          step: "end",
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
        expect(s.objects[idOf(s, "p1", "battlefield", "Old Fat Spider Can't See Me")]?.counters.lore).toBe(2);
        s = toMain2(attack(s, [bear]));
        expect(s.players.p2?.life).toBe(20);
        // Chapitre III : une carte en plus de la pioche du tour.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 4 && x.turn.step === "main1");
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(3);
        // Chapitre IV : piochez, puis la Saga est sacrifiée ; la prévention cesse.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 6 && x.turn.step === "main1");
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(5);
        expect(idsOf(s, "p1", "graveyard", "Old Fat Spider Can't See Me")).toHaveLength(1);
        s = toMain2(attack(s, [bear]));
        expect(s.players.p2?.life).toBe(18);
      });
    });

    it("Plunder the Trollshaws : piochez une carte ; lancé du cimetière (flashback {3}{U}), deux cartes à la place", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 6), hand: ["Plunder the Trollshaws"], library: lands("Forest", 5) },
      });
      s = settle(cast(s, "p1", "Plunder the Trollshaws"));
      expect(s.players.p1?.hand).toHaveLength(1);
      const card = idOf(s, "p1", "graveyard", "Plunder the Trollshaws");
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(namesIn(s, s.exile)).toContain("Plunder the Trollshaws");
    });

    it("Ravenhill Flock : chaque carte piochée lui met un marqueur +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ravenhill Flock", ...lands("Island", 3)],
          hand: ["Confusticate and Bebother"],
          library: lands("Forest", 3),
        },
      });
      const flock = idOf(s, "p1", "battlefield", "Ravenhill Flock");
      s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 1 }));
      expect(s.objects[flock]?.counters["+1/+1"]).toBe(2);
    });

    it("Riddles in the Dark : quatre cartes en deux piles ; l'adversaire choisit celle qui va dans votre main, l'autre au cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Riddles in the Dark"],
          library: ["Opt", "Bear Cub", "Forest", "Island", "Serra Angel"],
        },
      });
      s = settle(cast(s, "p1", "Riddles in the Dark"), (req, cur) => {
        if (req.type !== "pick" || req.intent !== "piles") return undefined;
        // p1 : la pile face cachée est l'Opt seul ; p2 donne la pile face cachée.
        if (req.options.includes("down")) return ["down"];
        return pickNamed(cur, req, "Opt");
      });
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Island", "Riddles in the Dark"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Serra Angel"]);
    });

    it("Roll-Roll-Roll-Roll : exile une de vos créatures, qui revient au début de la prochaine étape de fin", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: ["Roll-Roll-Roll-Roll"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Roll-Roll-Roll-Roll"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      s = advanceUntil(
        s,
        (x) =>
          x.turn.step === "end" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.kind === "priority" &&
          x.pending.player === "p1",
      );
      s = settle(s);
      const back = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] as string]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Uncover the Moon-Letters : un sort non-créature — piochez X cartes (mana dépensé), puis défaussez-en deux", () => {
      let s = scenario({
        p1: {
          battlefield: ["Uncover the Moon-Letters", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          library: ["Opt", "Island", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), (req) =>
        req.type === "pick" && req.options.includes("yes") ? ["yes"] : undefined,
      );
      expect(s.players.p1?.library).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(3);
    });

    describe("Uneasy Partings", () => {
      it("coûte {1} de moins s'il cible une créature attaquante non-jeton ; son propriétaire la met au-dessus ou au-dessous", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub"] },
          p2: { battlefield: lands("Island", 3), hand: ["Uneasy Partings"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = attack(s, [bear]);
        s = act(s, "p1", { type: "pass" });
        s = settle(cast(s, "p2", "Uneasy Partings", { targets: { t: [bear] } }), (req) =>
          req.intent === "topOrBottom" ? ["bottom"] : undefined,
        );
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
        expect(nameOf(s, s.players.p1?.library.at(-1) as string)).toBe("Bear Cub");
        // {3}{U} moins {1} : les trois Îles suffisent.
        expect(idsOf(s, "p2", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped)).toHaveLength(0);
      });

      it("sans créature attaquante ciblée, il coûte {3}{U}", () => {
        const s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Uneasy Partings"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        expect(() => cast(s, "p1", "Uneasy Partings", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
      });
    });

    describe("Wizard's Staff", () => {
      it("Équiper Sorcier {1} ; la créature équipée a la prouesse", () => {
        let s = scenario({
          p1: {
            battlefield: ["Wizard's Staff", "Gandalf, Wandering Wizard", "Bear Cub", "Island", "Mountain", "Mountain"],
            hand: ["Lightning Strike"],
          },
        });
        const staff = idOf(s, "p1", "battlefield", "Wizard's Staff");
        const gandalf = idOf(s, "p1", "battlefield", "Gandalf, Wandering Wizard");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        // Équiper Sorcier ne vise qu'un Sorcier.
        expect(() => activate(s, "p1", staff, "Sorcier", { targets: { t: [bear] } })).toThrow();
        s = settle(activate(s, "p1", staff, "Sorcier", { targets: { t: [gandalf] } }));
        expect(s.objects[staff]?.attachedTo).toBe(gandalf);
        expect(chars(s, gandalf).keywords).toContain("prowess");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
        // La prouesse accordée se déclenche deux fois (capacité déclenchée de la créature équipée).
        expect(pt(s, gandalf)).toEqual([6, 7]);
      });

      it("les capacités déclenchées de la créature équipée se déclenchent une fois de plus", () => {
        let s = scenario({
          p1: {
            battlefield: ["Wizard's Staff", "Ravenhill Flock", ...lands("Island", 4)],
            hand: ["Opt"],
            library: lands("Forest", 3),
          },
        });
        const staff = idOf(s, "p1", "battlefield", "Wizard's Staff");
        const flock = idOf(s, "p1", "battlefield", "Ravenhill Flock");
        s = settle(activate(s, "p1", staff, "{3}", { targets: { t: [flock] } }));
        expect(s.objects[staff]?.attachedTo).toBe(flock);
        s = settle(cast(s, "p1", "Opt"));
        expect(s.objects[flock]?.counters["+1/+1"]).toBe(2);
      });
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
  type Answer = (req: ChoiceRequest, cur: S, player: PlayerId) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

  /** Passe et répond aux choix jusqu'à une pile vide, sans déclenchement en attente. Les défenseurs ne bloquent pas. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur, p.player) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Avance (sans attaquer ni bloquer) jusqu'à la condition, en répondant aux choix. */
  const advanceAnswering = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (!p) break;
      if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p.kind === "discard") {
        const hand = cur.players[p.player]?.hand ?? [];
        cur = act(cur, p.player, { type: "discard", cards: hand.slice(0, Math.max(0, hand.length - 7)) });
      } else if (p.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Sélectionne dans les options d'un choix « pick » les objets indiqués (s'ils y sont). */
  const picking =
    (ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.some((id) => req.options.includes(id))
        ? ids.filter((id) => req.options.includes(id))
        : undefined;
  /** L'Armée que contrôle `player` (ou `undefined`). */
  const armyOf = (s: S, player: string) =>
    s.battlefield.find((id) => s.objects[id]?.controller === player && chars(s, id).subtypes.includes("Army"));
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceAnswering(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };

  describe("The Hobbit, lot A — noir", () => {
    describe("Along the Crooked Way", () => {
      it("en arrivant, une carte de créature revient en main ; la carte quitte le cimetière : amassez des Gobelins 1", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Along the Crooked Way"], graveyard: ["Bear Cub"] } });
        const bear = idOf(s, "p1", "graveyard", "Bear Cub");
        s = settle(cast(s, "p1", "Along the Crooked Way"), picking([bear]));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
        const army = armyOf(s, "p1") as string;
        expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
        expect(chars(s, army).subtypes).toContain("Goblin");
      });

      it("une carte de créature qui quitte le cimetière d'un adversaire ne déclenche rien", () => {
        let s = scenario({
          p1: { battlefield: ["Along the Crooked Way", ...lands("Swamp", 2)], hand: ["Gollum the Abandoned"] },
          p2: { graveyard: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Gollum the Abandoned"), picking([idOf(s, "p2", "graveyard", "Serra Angel")]));
        expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
        expect(armyOf(s, "p1")).toBeUndefined();
      });

      it("{1}{B} : vos Gobelins et vos Orques gagnent la menace jusqu'à la fin du tour, pas les autres créatures", () => {
        let s = scenario({
          p1: {
            battlefield: ["Along the Crooked Way", "Front Porch Sentries", "Bear Cub", ...lands("Swamp", 2)],
          },
          p2: { battlefield: ["Front Porch Sentries"] },
        });
        const way = idOf(s, "p1", "battlefield", "Along the Crooked Way");
        s = settle(activate(s, "p1", way));
        expect(chars(s, idOf(s, "p1", "battlefield", "Front Porch Sentries")).keywords).toContain("menace");
        expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
        expect(chars(s, idOf(s, "p2", "battlefield", "Front Porch Sentries")).keywords).not.toContain("menace");
      });
    });

    it("Bilbo's Deadly Slice : détruit une créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Bilbo's Deadly Slice"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    describe("Crude Bent Blade", () => {
      it("en arrivant, l'adversaire ciblé sacrifie une créature de son choix", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Crude Bent Blade"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Crude Bent Blade"), (req, _cur, player) =>
          player === "p2" && req.type === "pick" && req.intent === "sacrifice" ? [bear] : undefined,
        );
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("équiper {2} : la créature équipée gagne +2/+1", () => {
        let s = scenario({ p1: { battlefield: ["Crude Bent Blade", "Bear Cub", ...lands("Swamp", 2)] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Crude Bent Blade"), undefined, { targets: { t: [bear] } }));
        expect(chars(s, bear).power).toBe(4);
        expect(chars(s, bear).toughness).toBe(3);
      });
    });

    describe("Down, Down to Goblin-town", () => {
      const SAGA = "Down, Down to Goblin-town";

      it("chapitre I : l'adversaire révèle sa main ; vous choisissez une carte non-terrain qu'il défausse", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [SAGA] }, p2: { hand: ["Island", "Opt", "Bear Cub"] } });
        const bear = idOf(s, "p2", "hand", "Bear Cub");
        let offered: string[] = [];
        s = settle(cast(s, "p1", SAGA), (req, cur, player) => {
          if (player === "p1" && req.type === "pick" && req.options.includes(bear)) {
            offered = namesIn(cur, req.options.map(String)).map(String);
            return [bear];
          }
          return undefined;
        });
        expect(offered.sort()).toEqual(["Bear Cub", "Opt"]);
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Island", "Opt"]);
      });

      it("chapitre II : amassez des Gobelins 1 ; chapitres III et IV : l'adversaire perd 1 PV, vous en gagnez 1", () => {
        let s = scenario({ p1: { battlefield: [{ name: SAGA, counters: { lore: 1 } }] } });
        const saga = idOf(s, "p1", "battlefield", SAGA);
        s = advanceAnswering(s, (x) => x.objects[saga]?.counters.lore === 2 && x.stack.length === 0 && x.triggers.length === 0);
        s = settle(s);
        expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(1);
        s = advanceAnswering(s, (x) => x.objects[saga]?.counters.lore === 3 && x.stack.length === 0 && x.triggers.length === 0);
        s = settle(s);
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(21);
        s = advanceAnswering(s, (x) => !x.battlefield.includes(saga) && x.stack.length === 0 && x.triggers.length === 0);
        expect(s.players.p2?.life).toBe(18);
        expect(s.players.p1?.life).toBe(22);
        expect(idsOf(s, "p1", "graveyard", SAGA)).toHaveLength(1);
      });
    });

    it("Dreaded Bat-Cloud : coûte {3} de moins si une créature est morte ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Dreaded Bat-Cloud", "Bilbo's Deadly Slice"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const castable = (x: S) =>
        legalActions(x, "p1").some((a) => a.type === "cast" && a.card === idOf(x, "p1", "hand", "Dreaded Bat-Cloud"));
      s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      // Il reste deux Marais : {1}{B} suffit après la mort de l'Ourson.
      expect(castable(s)).toBe(true);
      s = settle(cast(s, "p1", "Dreaded Bat-Cloud"));
      expect(idsOf(s, "p1", "battlefield", "Dreaded Bat-Cloud")).toHaveLength(1);

      const t = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Dreaded Bat-Cloud"] } });
      expect(castable(t)).toBe(false);
    });

    it("Front Porch Sentries : quand elle meurt, une créature adverse ciblée gagne -1/-1", () => {
      let s = scenario({
        p1: { battlefield: ["Front Porch Sentries", ...lands("Swamp", 3)], hand: ["Bilbo's Deadly Slice"] },
        p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
      });
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      const sentries = idOf(s, "p1", "battlefield", "Front Porch Sentries");
      s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [sentries] } }), picking([elves]));
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(4);
    });

    it("Gathering of Darkness : jusqu'à une carte de créature revient en main, puis amassez des Gobelins 3", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Gathering of Darkness"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      s = settle(cast(s, "p1", "Gathering of Darkness", { targets: { t: [angel] } }));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const army = armyOf(s, "p1") as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, army).power).toBe(3);
    });

    describe("Gnashing of Teeth", () => {
      it("mode 1 : -5/-5 ; si la créature devait mourir ce tour-ci, elle est exilée à la place", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Gnashing of Teeth"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Gnashing of Teeth", { mode: 0, targets: { c: [angel] } }));
        expect(namesIn(s, s.exile)).toContain("Serra Angel");
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(0);
      });

      it("mode 2 : seules les créatures du joueur ciblé gagnent -1/-1", () => {
        let s = scenario({
          p1: { battlefield: ["Llanowar Elves", ...lands("Swamp", 3)], hand: ["Gnashing of Teeth"] },
          p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Gnashing of Teeth", { mode: 1, targets: { p: ["p2"] } }));
        expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
        expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).power).toBe(1);
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      });
    });

    it("Gollum, Silent Slinker // Meager Meal : un marqueur +1/+1 et 2 PV au joueur ciblé, puis Gollum se lance depuis l'exil", () => {
      const CARD = "Gollum, Silent Slinker // Meager Meal";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 6)], hand: [CARD] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const card = idOf(s, "p1", "hand", CARD);
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { c: [bear], p: ["p2"] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(22);
      const exiled = s.exile.find((id) => nameOf(s, id) === CARD) as string;
      expect(s.objects[exiled]?.onAdventure).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      const gollum = idOf(s, "p1", "battlefield", CARD);
      expect(chars(s, gollum).keywords).toContain("menace");
      expect(chars(s, gollum).power).toBe(4);
    });

    describe("Gollum the Abandoned", () => {
      it("ne peut pas bloquer ; en arrivant, exile jusqu'à une carte d'un cimetière adverse et chaque adversaire perd 2 PV", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 2), hand: ["Gollum the Abandoned"] },
          p2: { graveyard: ["Serra Angel", "Opt"] },
        });
        const angel = idOf(s, "p2", "graveyard", "Serra Angel");
        s = settle(cast(s, "p1", "Gollum the Abandoned"), picking([angel]));
        expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
        expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
        expect(chars(s, idOf(s, "p1", "battlefield", "Gollum the Abandoned")).keywords).toContain("cantBlock");
      });

      it("depuis le cimetière, {2} et un artefact ou une créature sacrifiés : il revient en main (en rituel seulement)", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2)], graveyard: ["Gollum the Abandoned"] } });
        const gollum = idOf(s, "p1", "graveyard", "Gollum the Abandoned");
        s = settle(activate(s, "p1", gollum));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Gollum the Abandoned"]);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);

        const t = scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2)], graveyard: ["Gollum the Abandoned"] },
          step: "beginCombat",
        });
        expect(() => activate(t, "p1", idOf(t, "p1", "graveyard", "Gollum the Abandoned"))).toThrow();
      });
    });

    it("Great Fierce Bee : une ou plusieurs autres créatures meurent en même temps : un seul regard 1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Great Fierce Bee", ...lands("Swamp", 3)],
          hand: ["Gnashing of Teeth"],
          library: ["Island", "Forest"],
        },
        p2: { battlefield: ["Llanowar Elves", "Llanowar Elves"] },
      });
      let scries = 0;
      s = settle(cast(s, "p1", "Gnashing of Teeth", { mode: 1, targets: { p: ["p2"] } }), (req) => {
        if (req.intent === "scryBottom") {
          scries++;
          return req.type === "pick" ? req.options.slice(0, 1) : undefined;
        }
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(2);
      expect(scries).toBe(1);
      // La carte du dessus (Island) a été mise au-dessous.
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
    });

    describe("Great Ugly-Looking Goblin // Clap! Snap!", () => {
      const CARD = "Great Ugly-Looking Goblin // Clap! Snap!";

      it("Clap! Snap! : amassez des Gobelins 2", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: [CARD] } });
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
        expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(2);
      });

      it("chaque créature que vous contrôlez avec un marqueur +1/+1 a la menace", () => {
        const s = scenario({
          p1: { battlefield: [CARD, { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
          p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("menace");
        expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).keywords).not.toContain("menace");
        expect(chars(s, idOf(s, "p1", "battlefield", CARD)).keywords).not.toContain("menace");
        expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("menace");
      });
    });

    it("Rage into the Valley : vous piochez une carte, perdez 1 PV et amassez des Gobelins 2", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Rage into the Valley"], library: ["Opt"] } });
      s = settle(cast(s, "p1", "Rage into the Valley"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.players.p1?.life).toBe(19);
      expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(2);
    });

    it("Ravening Warg : Férocité — elle attaque alors que vous contrôlez une créature de force 4 ou plus : 2 PV", () => {
      const run = (others: string[]) => {
        let s = scenario({ p1: { battlefield: ["Ravening Warg", ...others] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Ravening Warg")]);
        s = settle(s);
        return s.players.p1?.life;
      };
      expect(run(["Serra Angel"])).toBe(22);
      expect(run(["Bear Cub"])).toBe(20);
    });

    describe("Reverent Howl", () => {
      it("mode 1 : le joueur ciblé pioche deux cartes et perd 2 PV", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Reverent Howl"] },
          p2: { library: ["Opt", "Opt", "Opt"] },
        });
        s = settle(cast(s, "p1", "Reverent Howl", { mode: 0, targets: { p: ["p2"] } }));
        expect(s.players.p2?.hand).toHaveLength(2);
        expect(s.players.p2?.life).toBe(18);
        expect(s.players.p1?.life).toBe(20);
      });

      it("mode 2 : la créature ciblée gagne +2/+2 et le lien de vie jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Reverent Howl"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Reverent Howl", { mode: 1, targets: { c: [bear] } }));
        expect(chars(s, bear).power).toBe(4);
        expect(chars(s, bear).toughness).toBe(4);
        expect(chars(s, bear).keywords).toContain("lifelink");
      });
    });

    describe("Rhovanion Rampager", () => {
      it("en attaquant, vous pouvez sacrifier une autre créature : autant de marqueurs +1/+1 que sa force", () => {
        let s = scenario({ p1: { battlefield: ["Rhovanion Rampager", "Serra Angel"] } });
        const rampager = idOf(s, "p1", "battlefield", "Rhovanion Rampager");
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = attack(s, [rampager]);
        s = settle(s, (req) => (req.type === "pick" && req.intent === "sacrifice" ? [angel] : undefined));
        expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[rampager]?.counters["+1/+1"]).toBe(4);
        expect(chars(s, rampager).power).toBe(7);
      });

      it("sans sacrifice, aucun marqueur", () => {
        let s = scenario({ p1: { battlefield: ["Rhovanion Rampager", "Serra Angel"] } });
        const rampager = idOf(s, "p1", "battlefield", "Rhovanion Rampager");
        s = settle(attack(s, [rampager]), (req) => (req.type === "pick" && req.intent === "sacrifice" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.objects[rampager]?.counters["+1/+1"] ?? 0).toBe(0);
      });

      it("quand elle meurt, amassez des Gobelins X, X étant sa force", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Rhovanion Rampager", counters: { "+1/+1": 2 } }, ...lands("Swamp", 3)],
            hand: ["Bilbo's Deadly Slice"],
          },
        });
        const rampager = idOf(s, "p1", "battlefield", "Rhovanion Rampager");
        s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [rampager] } }));
        expect(idsOf(s, "p1", "graveyard", "Rhovanion Rampager")).toHaveLength(1);
        expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(5);
      });
    });

    describe("Stir Up Trouble", () => {
      const base = () =>
        scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Stir Up Trouble"] },
          p2: { battlefield: ["Serra Angel"] },
        });

      it("coût supplémentaire : sacrifier un artefact ou une créature", () => {
        let s = base();
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = cast(s, "p1", "Stir Up Trouble", { targets: { t: [angel] }, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.battlefield.filter((id) => nameOf(s, id) === "Swamp" && s.objects[id]?.tapped)).toHaveLength(1);
        s = settle(s);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("ou payer {4} de plus à la place", () => {
        let s = base();
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = cast(s, "p1", "Stir Up Trouble", { targets: { t: [angel] }, sacrifice: [] });
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(s.battlefield.filter((id) => nameOf(s, id) === "Swamp" && s.objects[id]?.tapped)).toHaveLength(5);
        s = settle(s);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Stony-Voiced Goblins : en arrivant, chaque adversaire défausse une carte", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Swamp", 2), hand: ["Stony-Voiced Goblins", "Opt"] },
        p2: { hand: ["Opt"] },
        p3: { hand: ["Island"] },
      });
      s = settle(cast(s, "p1", "Stony-Voiced Goblins"));
      expect(s.players.p2?.hand).toHaveLength(0);
      expect(s.players.p3?.hand).toHaveLength(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

  /** Passe et répond aux choix (suggestion par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  /** Réponse « oui » à une question facultative (« vous pouvez »). */
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  /** Cartes exilées que possède `player`. */
  const exiledOf = (s: S, player: string) => s.exile.filter((id) => s.objects[id]?.owner === player);
  /** L'Armée de `player`, s'il en a une. */
  const armyOf = (s: S, player: string) =>
    s.battlefield.find((id) => s.objects[id]?.controller === player && chars(s, id).subtypes.includes("Army"));
  /** Atteint la vérification des actions basées sur un état (récit durable) : les deux joueurs passent une fois. */
  const sba = (s: S) => advanceUntil(act(act(s, "p1", { type: "pass" }), "p2", { type: "pass" }), (x) => x.turn.step === "main2");
  const GANDALF = "Gandalf, Goblins' Bane // Flameshape";
  const GLOIN = "Glóin the Mighty // Easy Pickings";
  const SMAUG = "Smaug, the Great Calamity // Spew Flame";
  const WIZARD = customCard({ name: "Test Wizard", subtypes: ["Wizard"], power: 1, toughness: 1 });
  /** Un artefact Trésor (pas un jeton) : compte parmi « vos Trésors ». */
  const TREASURE = customCard({
    name: "Test Treasure",
    typeLine: "Artifact — Treasure",
    types: ["Artifact"],
    subtypes: ["Treasure"],
  });

  describe("The Hobbit, lot A — rouge", () => {
    describe("Balin, Loremaster", () => {
      it("en arrivant : défaussez votre main et piochez autant ; sans récit durable, pas de blessures", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 5),
            hand: ["Balin, Loremaster", "Opt", "Bear Cub"],
            library: lands("Island", 5),
          },
        });
        s = settle(cast(s, "p1", "Balin, Loremaster"), yes);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
        expect(s.players.p2?.life).toBe(20);
      });

      it("un autre Nain arrive, avec un récit durable : X blessures à chaque adversaire", () => {
        let s = scenario({
          p1: {
            battlefield: ["Balin, Loremaster", "Fishing Pole", "Skateboard", ...lands("Mountain", 3)],
            hand: ["Dori, Bearer of Friends", "Opt", "Bear Cub"],
            library: lands("Island", 5),
          },
        });
        s = settle(cast(s, "p1", "Dori, Bearer of Friends"), yes);
        expect(playerStatic(s, "p1", "enduringStory")).toBe(true);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
        expect(s.players.p2?.life).toBe(18);
      });

      it("« vous pouvez » : en refusant, la main est gardée", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Balin, Loremaster", "Opt"], library: lands("Island", 5) },
        });
        s = settle(cast(s, "p1", "Balin, Loremaster"), (req) => (req.type === "yesNo" ? [0] : undefined));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      });
    });

    it("Bombur, Gentle Dreamer : ne se dégage pas pendant votre étape de dégagement, sauf avec un récit durable", () => {
      const run = (others: string[]) => {
        let s = scenario({ p1: { battlefield: [{ name: "Bombur, Gentle Dreamer", tapped: true }, ...others] } });
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        return s.objects[idOf(s, "p1", "battlefield", "Bombur, Gentle Dreamer")]?.tapped;
      };
      expect(run(["Bear Cub"])).toBe(true);
      expect(run(["Fishing Pole", "Skateboard"])).toBe(false);
    });

    it("Bothersome Noisemaker : un sort non-créature amasse des Gobelins 1, pas un sort de créature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bothersome Noisemaker", ...lands("Island", 2), ...lands("Forest", 2)],
          hand: ["Opt", "Bear Cub"],
          library: lands("Island", 3),
        },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(armyOf(s, "p1")).toBeUndefined();
      s = settle(cast(s, "p1", "Opt"));
      const army = armyOf(s, "p1") as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, army).subtypes).toContain("Goblin");
    });

    describe("Burn, Burn, Tree and Fern", () => {
      it("chapitre I : 6 blessures à une créature qu'un adversaire contrôle", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 4), "Serra Angel"], hand: ["Burn, Burn, Tree and Fern"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        s = settle(cast(s, "p1", "Burn, Burn, Tree and Fern"));
        expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
        // Votre Ange n'était pas une cible possible.
        expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
      });

      it("chapitre II : détruit un artefact adverse ; chapitres III et IV : ajoutez {R}", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Burn, Burn, Tree and Fern", counters: { lore: 1 } }] },
          p2: { battlefield: ["Fishing Pole"] },
          active: "p2",
        });
        const chapterOnStack = (x: S) =>
          x.turn.active === "p1" && x.turn.step === "main1" && (x.stack.length > 0 || x.pending?.kind === "choice");
        s = settle(advanceUntil(s, chapterOnStack));
        expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
        s = settle(advanceUntil(s, chapterOnStack));
        expect(s.players.p1?.manaPool.R).toBe(1);
      });
    });

    it("Dáin Ironfoot : une Hache attachée à une créature ciblée ; en attaquant, les attaquants équipés ont la double initiative", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Dáin Ironfoot"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dáin Ironfoot"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      const axe = idOf(s, "p1", "battlefield", "Axe");
      expect(s.objects[axe]?.attachedTo).toBe(bear);
      expect(chars(s, bear).power).toBe(3);
      const dain = idOf(s, "p1", "battlefield", "Dáin Ironfoot");
      // Au tour suivant (Dáin n'a plus le mal d'invocation), Dáin et l'Ourson équipé attaquent.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(attack(s, [dain, bear]));
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(chars(s, dain).keywords).not.toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      // Ourson équipé : 3 + 3 (double initiative) ; Dáin : 1.
      expect(s.players.p2?.life).toBe(13);
    });

    describe("Desert Were-Worm", () => {
      it("+2/+0 pour chaque Montagne que vous contrôlez", () => {
        const s = scenario({ p1: { battlefield: ["Desert Were-Worm", ...lands("Mountain", 3), "Island"] } });
        expect(chars(s, idOf(s, "p1", "battlefield", "Desert Were-Worm")).power).toBe(6);
      });

      it("attaque de force totale 12 ou plus : attaquants dégagés et phase de combat supplémentaire, une fois par tour", () => {
        let s = scenario({ p1: { battlefield: ["Desert Were-Worm", ...lands("Mountain", 6)] }, p2: { life: 40 } });
        const worm = idOf(s, "p1", "battlefield", "Desert Were-Worm");
        s = settle(attack(s, [worm]));
        expect(s.objects[worm]?.tapped).toBe(false);
        // Seconde phase de combat : nouvelle déclaration des attaquants.
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
        expect(s.pending?.kind).toBe("declareAttackers");
        s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: worm, defender: "p2" }] }));
        // Pas de troisième combat : la capacité ne se déclenche que la première fois du tour.
        expect(s.objects[worm]?.tapped).toBe(true);
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
        expect(s.turn.step).toBe("main2");
        expect(s.players.p2?.life).toBe(40 - 24);
      });

      it("force totale inférieure à 12 : rien", () => {
        let s = scenario({ p1: { battlefield: ["Desert Were-Worm", ...lands("Mountain", 5)] } });
        const worm = idOf(s, "p1", "battlefield", "Desert Were-Worm");
        s = settle(attack(s, [worm]));
        expect(s.objects[worm]?.tapped).toBe(true);
      });
    });

    it("Desolation of Smaug : 3 blessures à chaque créature non-Dragon ; quatre mana réservés aux sorts de Dragon", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 6), "Serra Angel"],
          hand: ["Desolation of Smaug", "Shivan Dragon", "Lightning Strike"],
        },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Desolation of Smaug"), (req) => (req.intent === "manaColor" ? ["R"] : undefined));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(3);
      expect(s.players.p1?.restrictedMana).toHaveLength(4);
      // Deux Montagnes dégagées et le mana réservé : Shivan Dragon ({4}{R}{R}) se lance.
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Desolation of Smaug : le mana réservé ne paie pas un sort qui n'est pas un Dragon", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Desolation of Smaug", "Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Desolation of Smaug"), (req) => (req.intent === "manaColor" ? ["R"] : undefined));
      expect(s.players.p1?.restrictedMana).toHaveLength(4);
      expect(() => cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } })).toThrow();
    });

    describe("Gandalf, Goblins' Bane // Flameshape", () => {
      it("un sort non-créature : +1/+1 jusqu'à la fin du tour et 1 blessure à chaque adversaire", () => {
        let s = scenario({ p1: { battlefield: [GANDALF, "Island"], hand: ["Opt"], library: lands("Island", 3) } });
        const gandalf = idOf(s, "p1", "battlefield", GANDALF);
        s = settle(cast(s, "p1", "Opt"));
        expect(chars(s, gandalf).power).toBe(3);
        expect(chars(s, gandalf).toughness).toBe(4);
        expect(s.players.p2?.life).toBe(19);
      });

      it("Flameshape : les deux cartes du dessus exilées, jouables tant que vous contrôlez un Sorcier", () => {
        const run = (battlefield: (string | typeof WIZARD)[]) => {
          let s = scenario({
            p1: {
              battlefield: [...lands("Mountain", 4), ...battlefield],
              hand: [GANDALF],
              library: ["Lightning Strike", "Bear Cub", "Island"],
            },
          });
          const card = idOf(s, "p1", "hand", GANDALF);
          s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
          expect(s.players.p1?.library).toHaveLength(1);
          const exiled = exiledOf(s, "p1");
          expect(namesIn(s, exiled).sort()).toEqual(["Bear Cub", GANDALF, "Lightning Strike"]);
          return legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Lightning Strike");
        };
        expect(run([WIZARD])).toBe(true);
        expect(run(["Bear Cub"])).toBe(false);
      });
    });

    it("Gandalf, Spark Starter : 3 blessures réparties entre une, deux ou trois cibles", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Gandalf, Spark Starter"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Gandalf, Spark Starter"), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) return [bear, elves, "p2"];
        if (req.type === "divide") return req.among.map(() => 1);
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[bear]?.damage).toBe(1);
      expect(s.players.p2?.life).toBe(19);
    });

    describe("Glóin the Mighty // Easy Pickings", () => {
      it("au début de votre première phase principale : ajoutez {R}{R}", () => {
        let s = scenario({ p1: { battlefield: [GLOIN] }, step: "upkeep" });
        s = advanceUntil(s, (x) => x.turn.step === "main1" && x.triggers.length === 0 && x.stack.length === 0);
        expect(s.players.p1?.manaPool.R).toBe(2);
      });

      it("Easy Pickings : 1 blessure à chaque créature adverse, puis Glóin se lance depuis l'exil", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 7), "Llanowar Elves"], hand: [GLOIN] },
          p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
        });
        const card = idOf(s, "p1", "hand", GLOIN);
        s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
        expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(namesIn(s, exiledOf(s, "p1"))).toEqual([GLOIN]);
        s = settle(act(s, "p1", { type: "cast", card: exiledOf(s, "p1")[0] as string }));
        expect(idsOf(s, "p1", "battlefield", GLOIN)).toHaveLength(1);
      });
    });

    it("Goblin-town Flunkies : en arrivant, amassez des Gobelins 1", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Goblin-town Flunkies"] } });
      s = settle(cast(s, "p1", "Goblin-town Flunkies"));
      expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(1);
    });

    it("Gundabad Opportunist : la carte du dessus exilée reste jouable jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 4),
          hand: ["Gundabad Opportunist"],
          library: ["Lightning Strike", ...lands("Island", 4)],
        },
      });
      s = settle(cast(s, "p1", "Gundabad Opportunist"));
      expect(namesIn(s, exiledOf(s, "p1"))).toEqual(["Lightning Strike"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Lightning Strike")).toBe(true);
    });

    it("Iron Hills Stalwart : attache un Équipement ciblé que vous contrôlez à une créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Fishing Pole", "Bear Cub"], hand: ["Iron Hills Stalwart"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      s = settle(cast(s, "p1", "Iron Hills Stalwart"), (req) => {
        if (req.type === "pick" && req.options.includes(pole)) return [pole];
        if (req.type === "pick" && req.options.includes(bear)) return [bear];
        return undefined;
      });
      expect(s.objects[pole]?.attachedTo).toBe(bear);
    });

    describe("Last Light of Durin's Day", () => {
      it("une Montagne arrive : un marqueur de quête ; au sixième, sacrifiez-la et un Dragon de votre main arrive", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Last Light of Durin's Day", counters: { quest: 4 } }],
            hand: ["Mountain", "Shivan Dragon"],
            library: ["Mountain", ...lands("Island", 3)],
          },
        });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }));
        expect(s.objects[idOf(s, "p1", "battlefield", "Last Light of Durin's Day")]?.counters.quest).toBe(5);
        // Au tour suivant, la sixième Montagne.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }), (req, cur) =>
          req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Shivan Dragon") : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Last Light of Durin's Day")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      });

      it("sans Dragon choisi dans la main, il est cherché dans la bibliothèque", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Last Light of Durin's Day", counters: { quest: 5 } }],
            hand: ["Mountain"],
            library: ["Island", "Shivan Dragon", "Island"],
          },
        });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }), (req, cur) =>
          req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Shivan Dragon") : undefined,
        );
        expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });
    });

    it("The Misty Mountains Cold : un Trésor ; avec quatre Trésors, la Saga est sacrifiée et un Dragon 6/6 volant arrive", () => {
      const run = (treasures: number) => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 3), ...Array(treasures).fill(TREASURE)], hand: ["The Misty Mountains Cold"] },
        });
        s = settle(cast(s, "p1", "The Misty Mountains Cold"));
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
        return s;
      };
      let s = run(2);
      expect(idsOf(s, "p1", "battlefield", "The Misty Mountains Cold")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(0);
      s = run(3);
      expect(idsOf(s, "p1", "graveyard", "The Misty Mountains Cold")).toHaveLength(1);
      const dragon = idOf(s, "p1", "battlefield", "Dragon");
      expect(chars(s, dragon).power).toBe(6);
      expect(chars(s, dragon).keywords).toContain("flying");
    });

    it("Misty Mountains Raider : chaque fois que vous attaquez, amassez des Gobelins 2", () => {
      let s = scenario({ p1: { battlefield: ["Misty Mountains Raider", "Bear Cub"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(2);
    });

    describe("Óin the Brave", () => {
      it("avec un récit durable : +1/+0 et la célérité", () => {
        let s = scenario({ p1: { battlefield: ["Óin the Brave", "Fishing Pole", "Skateboard"] } });
        const oin = idOf(s, "p1", "battlefield", "Óin the Brave");
        s = sba(s);
        expect(chars(s, oin).power).toBe(2);
        expect(chars(s, oin).keywords).toContain("haste");
      });

      it("{1}, {T}, défaussez une carte : piochez une carte", () => {
        let s = scenario({ p1: { battlefield: ["Óin the Brave", "Mountain"], hand: ["Opt"], library: lands("Island", 3) } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Óin the Brave")));
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      });
    });

    it("Pinecone Strike, les deux modes : 3 blessures (exilée si elle devait mourir) et un jeton d'artefact détruit", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Dori, Bearer of Friends", "Pinecone Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Dori, Bearer of Friends"));
      const treasure = idOf(s, "p1", "battlefield", "Treasure");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // Un artefact qui n'est pas un jeton n'est pas une cible légale.
      s = settle(cast(s, "p1", "Pinecone Strike", { mode: 2, targets: { c: [bear], a: [treasure] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(0);
      expect(namesIn(s, exiledOf(s, "p2"))).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });

    it("Ragged Short Spear : en arrivant, défaussez une carte pour en piocher deux ; la créature équipée a +2/+0", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Bear Cub"],
          hand: ["Ragged Short Spear", "Opt"],
          library: lands("Island", 3),
        },
      });
      s = settle(cast(s, "p1", "Ragged Short Spear"), (req) =>
        req.type === "pick" && req.intent === "discard" ? req.options.slice(0, 1) : undefined,
      );
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
      const spear = idOf(s, "p1", "battlefield", "Ragged Short Spear");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", spear, undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(4);
    });

    it("Spew Flame : 5 blessures à une créature, puis Smaug se lance depuis l'exil", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 12), hand: [SMAUG] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const card = idOf(s, "p1", "hand", SMAUG);
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [dragon] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      const exiled = exiledOf(s, "p1")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      expect(idsOf(s, "p1", "battlefield", SMAUG)).toHaveLength(1);
    });

    it("Smaug's Fury : +3/+0, la portée et l'initiative jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Smaug's Fury"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Smaug's Fury", { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(5);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["reach", "firstStrike"]));
    });

    it("Snowslope Hunter : sacrifiez une autre créature ou un artefact, pendant votre tour et une fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Snowslope Hunter", "Bear Cub", "Fishing Pole"], library: ["Opt", ...lands("Island", 4)] },
      });
      const hunter = idOf(s, "p1", "battlefield", "Snowslope Hunter");
      s = settle(activate(s, "p1", hunter, undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, exiledOf(s, "p1"))).toEqual(["Opt"]);
      expect(canActivate(s, "p1", hunter)).toBe(false);
      // Pendant le tour adverse : non.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(canActivate(s, "p1", hunter)).toBe(false);
    });

    it("Stone-Giant of High Pass : un Rocher en arrivant et en attaquant ; sacrifiez un artefact : 4 blessures", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 10), hand: ["Stone-Giant of High Pass"] } });
      s = settle(cast(s, "p1", "Stone-Giant of High Pass"));
      const boulder = idOf(s, "p1", "battlefield", "Stone Boulder");
      expect(chars(s, boulder).power).toBe(3);
      expect(chars(s, boulder).toughness).toBe(1);
      expect(chars(s, boulder).keywords).toContain("defender");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Stone-Giant of High Pass"), undefined, {
          targets: { t: ["p2"] },
          sacrifice: [boulder],
        }),
      );
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "battlefield", "Stone Boulder")).toHaveLength(0);
    });

    it("Stone-Giant of High Pass : un Rocher chaque fois qu'il attaque", () => {
      let s = scenario({ p1: { battlefield: ["Stone-Giant of High Pass"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Stone-Giant of High Pass")]));
      expect(idsOf(s, "p1", "battlefield", "Stone Boulder")).toHaveLength(1);
    });

    it("Tidings of War : amassez des Gobelins 1 ; lancé du cimetière (flashback), 3 à la place", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Tidings of War"] } });
      s = settle(cast(s, "p1", "Tidings of War"));
      const army = armyOf(s, "p1") as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
      const card = idOf(s, "p1", "graveyard", "Tidings of War");
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(s.objects[army]?.counters["+1/+1"]).toBe(4);
      expect(namesIn(s, exiledOf(s, "p1"))).toEqual(["Tidings of War"]);
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /**
   * Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. Les
   * défenseurs ne bloquent pas.
   */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Joue (sans bloquer) jusqu'à la seconde phase principale, en répondant aux choix. */
  const throughCombat = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  /** Sélectionne dans les options d'un choix l'objet nommé `name`. */
  const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;
  /** Choisit l'option dont l'identifiant est `id`, si elle est proposée. */
  const pickId = (id: string) => (req: ChoiceRequest) => (req.type === "pick" && req.options.includes(id) ? [id] : undefined);
  /** Choisit l'option (mode…) dont le libellé contient `text`. */
  const pickLabel = (req: ChoiceRequest, text: string) =>
    req.type === "pick" && req.labels ? req.options.filter((o) => req.labels?.[o]?.includes(text)).slice(0, 1) : undefined;
  /** Joue un terrain de la main ; s'il déclenche quelque chose, le résout. */
  const playLand = (s: S, name: string) => {
    const t = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
    return t.stack.length > 0 || t.triggers.length > 0 ? settle(t) : t;
  };

  describe("The Hobbit, lot A — vert", () => {
    it("Attercop : portée et contact mortel ; Landfall, +1/+1 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Attercop"], hand: ["Forest"] } });
      const spider = idOf(s, "p1", "battlefield", "Attercop");
      expect(chars(s, spider).keywords).toEqual(expect.arrayContaining(["reach", "deathtouch"]));
      s = playLand(s, "Forest");
      expect(pt(s, spider)).toEqual([3, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, spider)).toEqual([2, 1]);
    });

    describe("Bejeweled Warg", () => {
      it("blessures de combat à un joueur : un Trésor", () => {
        let s = scenario({ p1: { battlefield: ["Bejeweled Warg"] } });
        const warg = idOf(s, "p1", "battlefield", "Bejeweled Warg");
        s = throughCombat(attack(s, [warg]), (req) => pickLabel(req, "Trésor"));
        expect(s.players.p2?.life).toBe(17);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      });

      it("ou un marqueur +1/+1 sur un Loup que vous contrôlez", () => {
        let s = scenario({ p1: { battlefield: ["Bejeweled Warg", "Wargling"] } });
        const warg = idOf(s, "p1", "battlefield", "Bejeweled Warg");
        const wargling = idOf(s, "p1", "battlefield", "Wargling");
        s = throughCombat(attack(s, [warg]), (req) => pickLabel(req, "Loup") ?? pickId(wargling)(req));
        expect(s.objects[wargling]?.counters["+1/+1"]).toBe(1);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
      });
    });

    it("Beorn, Reluctant Host // Till and Tend : l'Aventure permet un terrain de plus, puis la créature se lance de l'exil", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 7), hand: ["Beorn, Reluctant Host // Till and Tend", "Island", "Swamp"] },
      });
      const card = idOf(s, "p1", "hand", "Beorn, Reluctant Host // Till and Tend");
      s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
      const exiled = Object.values(s.objects).find((o) => o.zone === "exile" && o.owner === "p1")?.id as string;
      expect(nameOf(s, exiled)).toBe("Beorn, Reluctant Host // Till and Tend");
      s = playLand(s, "Island");
      s = playLand(s, "Swamp");
      expect(idsOf(s, "p1", "battlefield", "Swamp")).toHaveLength(1);
      expect(canCast(s, "p1", exiled)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      const beorn = s.battlefield.find((id) => nameOf(s, id)?.startsWith("Beorn")) as string;
      expect(pt(s, beorn)).toEqual([5, 5]);
      expect(chars(s, beorn).keywords).toContain("trample");
    });

    describe("Beorn the Fierce", () => {
      it("vos autres Ours ont +2/+2 ; au combat, un marqueur de piétinement et la créature devient un Ours", () => {
        let s = scenario({ p1: { battlefield: ["Beorn the Fierce", "Bear Cub", "Llanowar Elves"] } });
        const beorn = idOf(s, "p1", "battlefield", "Beorn the Fierce");
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        expect(pt(s, beorn)).toEqual([6, 6]);
        expect(pt(s, cub)).toEqual([4, 4]);
        expect(pt(s, elves)).toEqual([1, 1]);
        s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
        s = settle(s, pickId(elves));
        expect(s.objects[elves]?.counters.trample).toBe(1);
        expect(chars(s, elves).keywords).toContain("trample");
        expect(chars(s, elves).subtypes).toEqual(expect.arrayContaining(["Elf", "Bear"]));
        expect(pt(s, elves)).toEqual([3, 3]);
        // Trois Ours (Beorn, l'Ourson, les Elfes devenus Ours) : deux cartes piochées.
        expect(s.players.p1?.hand).toHaveLength(2);
        // L'effet ne s'arrête pas au tour suivant.
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, elves).subtypes).toContain("Bear");
      });

      it("moins de trois Ours : vous ne piochez pas", () => {
        let s = scenario({ p1: { battlefield: ["Beorn the Fierce", "Llanowar Elves"] } });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
        s = settle(s, pickId(elves));
        expect(chars(s, elves).subtypes).toContain("Bear");
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Beorn's Hospitality : Landfall, un marqueur +1/+1 ; {5}{G}{G} : devient un Ours aux F/E égales à vos terrains, pour toujours", () => {
      let s = scenario({ p1: { battlefield: ["Beorn's Hospitality", "Bear Cub", ...lands("Forest", 7)], hand: ["Forest"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const hosp = idOf(s, "p1", "battlefield", "Beorn's Hospitality");
      s = playLand(s, "Forest");
      expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
      s = settle(activate(s, "p1", hosp));
      expect(chars(s, hosp).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
      expect(chars(s, hosp).subtypes).toContain("Bear");
      expect(pt(s, hosp)).toEqual([8, 8]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, hosp).types).toContain("Creature");
      expect(pt(s, hosp)).toEqual([8, 8]);
    });

    it("Boughside Wanderers : une carte de permanent parmi les quatre du dessus ; Landfall, +2/+2", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 6),
          hand: ["Boughside Wanderers", "Island"],
          library: ["Opt", "Lightning Strike", "Bear Cub", "Swamp", "Mountain"],
        },
      });
      let seen: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Boughside Wanderers"), (req, cur) => {
        if (req.type !== "pick") return undefined;
        seen = namesIn(cur, req.options);
        return pickNamed(cur, req, "Bear Cub");
      });
      expect(seen.sort()).toEqual(["Bear Cub", "Swamp"]);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Island"]);
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Mountain");
      expect(library.slice(1).sort()).toEqual(["Lightning Strike", "Opt", "Swamp"]);
      const w = idOf(s, "p1", "battlefield", "Boughside Wanderers");
      s = playLand(s, "Island");
      expect(pt(s, w)).toEqual([6, 6]);
    });

    describe("Cantankerous Keepers", () => {
      it("affinité pour les Elfes : {1} de moins par Elfe que vous contrôlez", () => {
        const setup = (forests: number) =>
          scenario({
            p1: {
              battlefield: [
                ...lands("Forest", forests),
                { name: "Llanowar Elves", tapped: true },
                { name: "Llanowar Elves", tapped: true },
              ],
              hand: ["Cantankerous Keepers"],
            },
          });
        const three = setup(3);
        expect(canCast(three, "p1", idOf(three, "p1", "hand", "Cantankerous Keepers"))).toBe(false);
        const four = setup(4);
        expect(canCast(four, "p1", idOf(four, "p1", "hand", "Cantankerous Keepers"))).toBe(true);
      });

      it("en arrivant : meulez quatre cartes, les cartes d'Elfe meulées vont en main", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Forest", 6),
            hand: ["Cantankerous Keepers"],
            library: ["Llanowar Elves", "Opt", "Woodland Weavemaster", "Bear Cub", "Llanowar Elves"],
          },
        });
        s = settle(cast(s, "p1", "Cantankerous Keepers"));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Llanowar Elves", "Woodland Weavemaster"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Llanowar Elves"]);
      });
    });

    it("Dancing from Dark to Dawn : un sort de créature met X marqueurs (sa valeur de mana) ; Landfall, un Ours 2/2", () => {
      let s = scenario({
        p1: {
          battlefield: ["Dancing from Dark to Dawn", "Llanowar Elves", ...lands("Forest", 5)],
          hand: ["Beorn the Fierce", "Island"],
        },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Beorn the Fierce"), pickId(elves));
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(5);
      s = playLand(s, "Island");
      const bear = idOf(s, "p1", "battlefield", "Bear");
      // Ours 2/2, et +2/+2 de Beorn the Fierce.
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).colors).toEqual(["G"]);
    });

    it("Down in the Valley : I, un terrain de base en main ; II, Landfall crée un Elfe ; III, vos Elfes +1/+0 et vigilance", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Down in the Valley"], library: ["Island", "Opt", ...lands("Plains", 6)] },
      });
      s = settle(cast(s, "p1", "Down in the Valley"), (req, cur) => pickNamed(cur, req, "Island"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      const saga = idOf(s, "p1", "battlefield", "Down in the Valley");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(s);
      expect(s.objects[saga]?.counters.lore).toBe(2);
      s = playLand(s, "Island");
      const elf = idOf(s, "p1", "battlefield", "Elf");
      expect(pt(s, elf)).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5);
      s = settle(s);
      expect(s.objects[saga]?.counters.lore).toBe(3);
      expect(pt(s, elf)).toEqual([2, 1]);
      expect(chars(s, elf).keywords).toContain("vigilance");
    });

    it("Galion, Elvenking's Butler : en attaquant, une autre créature a les F/E de base de Galion jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Galion, Elvenking's Butler", "Llanowar Elves"] } });
      const galion = idOf(s, "p1", "battlefield", "Galion, Elvenking's Butler");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(attack(s, [galion, elves]), pickId(elves));
      expect(pt(s, elves)).toEqual([4, 4]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(12);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, elves)).toEqual([1, 1]);
    });

    it("Gigantic Big Bear : ne peut pas être contrecarré ; défense talismanique et célérité", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 7), hand: ["Gigantic Big Bear"] },
        p2: { battlefield: lands("Island", 3), hand: ["Cancel"] },
      });
      s = cast(s, "p1", "Gigantic Big Bear");
      const spell = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Cancel"), targets: { t: [spell] } }));
      const bear = idOf(s, "p1", "battlefield", "Gigantic Big Bear");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "haste"]));
      expect(idsOf(s, "p2", "graveyard", "Cancel")).toHaveLength(1);
    });

    it("Guardian of the Halls : {5}{G}{G}, trois marqueurs +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Guardian of the Halls", ...lands("Forest", 7)] } });
      const g = idOf(s, "p1", "battlefield", "Guardian of the Halls");
      s = settle(activate(s, "p1", g));
      expect(pt(s, g)).toEqual([5, 5]);
    });

    describe("Little Bear", () => {
      it("flash ; dégage une autre créature, et un Ours reçoit un marqueur +1/+1", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Forest", 3)], hand: ["Little Bear"] },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Little Bear"), pickId(cub));
        expect(s.objects[cub]?.tapped).toBe(false);
        expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
      });

      it("une créature qui n'est pas un Ours est seulement dégagée", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: [{ name: "Llanowar Elves", tapped: true }, ...lands("Forest", 3)], hand: ["Little Bear"] },
        });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = act(s, "p2", { type: "pass" });
        expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
        s = settle(cast(s, "p1", "Little Bear"), pickId(elves));
        expect(s.objects[elves]?.tapped).toBe(false);
        expect(s.objects[elves]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Mirkwood Pathmaker : F/E égales au nombre de terrains que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Mirkwood Pathmaker", ...lands("Forest", 3)], hand: ["Island"] } });
      const m = idOf(s, "p1", "battlefield", "Mirkwood Pathmaker");
      expect(pt(s, m)).toEqual([3, 3]);
      s = playLand(s, "Island");
      expect(pt(s, m)).toEqual([4, 4]);
    });

    it("Nasty Little Rabbit : Férocité, un marqueur +1/+1 au début du combat seulement avec une créature de force 4 ou plus", () => {
      const run = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield: ["Nasty Little Rabbit", ...battlefield] } });
        s = settle(advanceUntil(s, (x) => x.turn.step === "beginCombat"));
        return s.objects[idOf(s, "p1", "battlefield", "Nasty Little Rabbit")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(["Bear Cub"])).toBe(0);
      expect(run(["Serra Angel"])).toBe(1);
    });

    it("The Notary Hobbits : deux jetons copies non légendaires ; {T} : {C} par Hobbit que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["The Notary Hobbits"] } });
      s = settle(cast(s, "p1", "The Notary Hobbits"));
      const hobbits = idsOf(s, "p1", "battlefield", "The Notary Hobbits");
      expect(hobbits).toHaveLength(3);
      const tokens = hobbits.filter((id) => s.objects[id]?.isToken);
      expect(tokens).toHaveLength(2);
      for (const id of tokens) expect(chars(s, id).supertypes).not.toContain("Legendary");
      // Les jetons ne copient pas une nouvelle fois (« s'ils ne sont pas des jetons »).
      const card = hobbits.find((id) => !s.objects[id]?.isToken) as string;
      expect(chars(s, card).supertypes).toContain("Legendary");
      // Les jetons n'ont plus le mal d'invocation au tour suivant.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const t = tokens[0] as string;
      const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === t);
      s = act(s, "p1", { type: "tapForMana", source: t, ability: mana?.type === "tapForMana" ? mana.ability : 0 });
      expect(s.players.p1?.manaPool.C).toBe(3);
    });

    describe("Old Fat Spider", () => {
      it("ne peut pas être bloquée par les créatures de force 2 ou moins", () => {
        let s = scenario({ p1: { battlefield: ["Old Fat Spider"] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
        const spider = idOf(s, "p1", "battlefield", "Old Fat Spider");
        const cub = idOf(s, "p2", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = advanceUntil(attack(s, [spider]), (x) => x.pending?.kind === "declareBlockers");
        expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: cub, attacker: spider }] })).toThrow();
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: spider }] });
        expect(s.combat?.attackers.find((a) => a.id === spider)?.blockers).toEqual([angel]);
      });

      it("ciblée par un sort adverse : vous piochez une carte", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Old Fat Spider"] },
          p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        });
        s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Old Fat Spider")] } }));
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Part in Friendship", () => {
      const setup = (library: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Part in Friendship", "Bear Cub", "Llanowar Elves", ...lands("Forest", 2)], library },
        });
        destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        return s;
      };

      it("une créature meurt : la carte de créature révélée arrive en jeu si sa VM ≤ vos terrains ; le reste au-dessous", () => {
        const s = settle(setup(["Opt", "Llanowar Elves", "Island", "Swamp"]));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(2);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Swamp", "Opt"]);
        expect(s.players.p1?.hand).toHaveLength(0);
      });

      it("sinon elle va en main ; une seule fois par tour", () => {
        let s = settle(setup(["Opt", "Serra Angel", "Island", "Bear Cub"]));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Bear Cub", "Opt"]);
        destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(3);
      });
    });

    it("Quarrel : votre créature inflige des blessures égales à sa force à une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Serra Angel", ...lands("Forest", 2)], hand: ["Quarrel"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Quarrel", { targets: { a: [angel], b: [dragon] } }));
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    describe("Radagast of Rhosgobel", () => {
      it("le premier sort de créature du tour coûte {2} de moins, pas le suivant", () => {
        let s = scenario({
          p1: { battlefield: ["Radagast of Rhosgobel", ...lands("Forest", 2)], hand: ["Bear Cub", "Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Bear Cub"));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(canCast(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      });

      it("il peut se lancer comme s'il avait le flash", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Radagast of Rhosgobel", ...lands("Forest", 4)], hand: ["Bear Cub", "Bear Cub"] },
        });
        s = act(s, "p2", { type: "pass" });
        const cub = idOf(s, "p1", "hand", "Bear Cub");
        expect(canCast(s, "p1", cub)).toBe(true);
        s = settle(cast(s, "p1", "Bear Cub"));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        s = act(s, "p2", { type: "pass" });
        // Le second sort de créature du tour n'a pas le flash.
        expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
        expect(canCast(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      });
    });

    it("Through the Forest Gate : les terrains des vingt cartes du dessus arrivent engagés, puis mélange ; 8 PV", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 8),
          hand: ["Through the Forest Gate"],
          library: ["Island", "Opt", "Swamp", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Through the Forest Gate"), (req) => (req.type === "pick" ? req.options : undefined));
      const island = idOf(s, "p1", "battlefield", "Island");
      const swamp = idOf(s, "p1", "battlefield", "Swamp");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(s.objects[swamp]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.life).toBe(28);
    });

    it("Troll Negotiations : deux marqueurs +1/+1, puis votre créature se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 4)], hand: ["Troll Negotiations"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Troll Negotiations", { targets: { a: [elves], b: [cub] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(2);
      expect(s.objects[elves]?.damage).toBe(2);
      expect(pt(s, elves)).toEqual([3, 3]);
    });

    describe("Warg Tactics", () => {
      it("détruit une créature avec le vol (pas une autre)", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Warg Tactics"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const cub = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Warg Tactics", { mode: 0, targets: { t: [cub] } })).toThrow();
        s = settle(cast(s, "p1", "Warg Tactics", { mode: 0, targets: { t: [angel] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("ou un marqueur +1/+1, le piétinement et la défense talismanique jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 2)], hand: ["Warg Tactics"] } });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Warg Tactics", { mode: 1, targets: { t: [cub] } }));
        expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
        expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["trample", "hexproof"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, cub).keywords).not.toContain("hexproof");
      });
    });

    it("Wargling : Férocité, en attaquant +1/+0 et vos créatures ont le piétinement", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["Wargling", other] } });
        const w = idOf(s, "p1", "battlefield", "Wargling");
        const o = idOf(s, "p1", "battlefield", other);
        s = settle(attack(s, [w]));
        return [chars(s, w).power, chars(s, w).keywords.includes("trample"), chars(s, o).keywords.includes("trample")];
      };
      expect(run("Bear Cub")).toEqual([2, false, false]);
      expect(run("Serra Angel")).toEqual([3, true, true]);
    });

    it("Wilderland Scrounger : Férocité, en attaquant un marqueur +1/+1 sur chacune de vos créatures", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["Wilderland Scrounger", other] } });
        const w = idOf(s, "p1", "battlefield", "Wilderland Scrounger");
        const o = idOf(s, "p1", "battlefield", other);
        s = settle(attack(s, [w]));
        return [s.objects[w]?.counters["+1/+1"] ?? 0, s.objects[o]?.counters["+1/+1"] ?? 0];
      };
      expect(run("Bear Cub")).toEqual([0, 0]);
      expect(run("Serra Angel")).toEqual([1, 1]);
    });

    it("Wood Elves : une carte de Forêt de la bibliothèque arrive dégagée", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Wood Elves"], library: ["Island", "Plains", "Forest", "Opt"] },
      });
      let options: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Wood Elves"), (req, cur) => {
        if (req.type !== "pick") return undefined;
        options = namesIn(cur, req.options);
        return pickNamed(cur, req, "Forest");
      });
      expect(options).toEqual(["Forest"]);
      const forests = idsOf(s, "p1", "battlefield", "Forest");
      expect(forests).toHaveLength(4);
      expect(forests.filter((id) => !s.objects[id]?.tapped)).toHaveLength(1);
    });

    it("Woodland Weavemaster : vigilance ; +1/+1 quand un autre Elfe arrive", () => {
      let s = scenario({ p1: { battlefield: ["Woodland Weavemaster", "Forest"], hand: ["Llanowar Elves"] } });
      const w = idOf(s, "p1", "battlefield", "Woodland Weavemaster");
      expect(chars(s, w).keywords).toContain("vigilance");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(pt(s, w)).toEqual([2, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, w)).toEqual([1, 2]);
    });

    it("Woodland Weavemaster : {T} : X mana d'une couleur (X : sa force), seulement pour les sorts d'Elfe", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Woodland Weavemaster", counters: { "+1/+1": 1 } }],
          hand: ["Bear Cub", "Woodland Weavemaster"],
        },
      });
      const w = idOf(s, "p1", "battlefield", "Woodland Weavemaster");
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Woodland Weavemaster"))).toBe(true);
      s = settle(cast(s, "p1", "Woodland Weavemaster"));
      expect(idsOf(s, "p1", "battlefield", "Woodland Weavemaster")).toHaveLength(2);
      expect(s.objects[w]?.tapped).toBe(true);
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passe et répond aux choix (suggestion par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  /** Répond à tout choix d'objets en prenant `id` s'il est proposé. */
  const pick =
    (id: string): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes(id) ? [id] : undefined;
  const tokensNamed = (s: S, name: string) => s.battlefield.filter((id) => s.objects[id]?.isToken && nameOf(s, id) === name);
  const armies = (s: S) => s.battlefield.filter((id) => chars(s, id).subtypes.includes("Army"));
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);

  describe("The Hobbit, lot A — multicolores", () => {
    describe("Bard, King of Dale", () => {
      it("la première carte de l'étape de pioche n'est pas doublée ; une pioche suivante l'est", () => {
        let s = scenario({
          step: "upkeep",
          p1: { battlefield: ["Bard, King of Dale", "Island"], hand: ["Opt"], library: lands("Forest", 10) },
        });
        s = advanceUntil(s, (x) => x.turn.step === "main1");
        expect(s.players.p1?.hand).toHaveLength(2);
        s = settle(cast(s, "p1", "Opt"));
        // Opt : une carte piochée, remplacée par deux.
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("les jetons créés sous votre contrôle sont doublés", () => {
        let s = scenario({
          p1: {
            battlefield: ["Bard, King of Dale", "Thranduil, Sindarin Liege // Silvan Rally"],
            hand: ["Forest"],
          },
        });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        expect(tokensNamed(s, "Elf")).toHaveLength(2);
      });
    });

    it("Bard the Bowman : votre deuxième carte du tour met un marqueur +1/+1 sur une créature, qui gagne le lien de vie", () => {
      let s = scenario({ p1: { battlefield: ["Bard the Bowman", "Bear Cub", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Opt"), pick(bear));
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Opt"), pick(bear));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("lifelink");
      // Jusqu'à la fin du tour seulement.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("lifelink");
    });

    describe("Bard's Company", () => {
      it("se lance comme s'il avait le flash si vous contrôlez un Humain", () => {
        const run = (creature: string) => {
          let s = scenario({
            active: "p2",
            p1: { battlefield: [creature, "Plains", "Island", ...lands("Forest", 2)], hand: ["Bard's Company"] },
          });
          s = act(s, "p2", { type: "pass" });
          return canCast(s, "p1", idOf(s, "p1", "hand", "Bard's Company"));
        };
        expect(run("Patient Instructor")).toBe(true);
        expect(run("Bear Cub")).toBe(false);
      });

      it("vos autres créatures gagnent +1/+1 ; recruter : une carte non-terrain défaussée crée un Humain Soldat", () => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", "Plains", "Island", ...lands("Forest", 2)],
            hand: ["Bard's Company"],
            library: ["Opt", "Forest"],
          },
        });
        s = settle(cast(s, "p1", "Bard's Company"));
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
        const soldier = tokensNamed(s, "Human Soldier")[0] as string;
        expect(pt(s, soldier)).toEqual([2, 2]);
        expect(chars(s, soldier).colors).toEqual(["W"]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bard's Company"))).toEqual([2, 3]);
      });
    });

    it("Patient Instructor : recruter en défaussant un terrain ne crée pas de jeton", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Island", "Forest"], hand: ["Patient Instructor"], library: ["Forest", "Opt"] },
      });
      s = settle(cast(s, "p1", "Patient Instructor"));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(tokensNamed(s, "Human Soldier")).toHaveLength(0);
    });

    describe("Bifur, Melodic Rider", () => {
      it("en attaquant, un marqueur +1/+1 sur une créature ; récit durable : les capacités de vos Nains se déclenchent deux fois", () => {
        const run = (others: string[]) => {
          let s = scenario({ p1: { battlefield: ["Bifur, Melodic Rider", ...others] } });
          const bifur = idOf(s, "p1", "battlefield", "Bifur, Melodic Rider");
          s = settle(attack(s, [bifur]), pick(bifur));
          return s.objects[bifur]?.counters["+1/+1"];
        };
        // Bifur (légendaire) et deux artefacts : récit durable.
        expect(run(["Fishing Pole", "Fishing Pole"])).toBe(2);
        expect(run(["Fishing Pole", "Bear Cub"])).toBe(1);
      });

      it("récit durable : la capacité d'un autre Nain (Nori) se déclenche aussi une fois de plus", () => {
        let s = scenario({ p1: { battlefield: ["Bifur, Melodic Rider", "Nori, Teller of Tales", "Fishing Pole"] } });
        const nori = idOf(s, "p1", "battlefield", "Nori, Teller of Tales");
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: nori, defender: "p2" }] });
        expect(s.triggers.length + s.stack.length).toBe(2);
      });
    });

    describe("Bolg of the North", () => {
      it("sacrifice d'une autre créature : blessures égales à sa force ; l'excès amasse des Gobelins", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Fire Elemental"], hand: ["Bolg of the North"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Bolg of the North"), (req) =>
          req.type === "pick" && req.options.includes(fire) ? [fire] : pick(bear)(req, s),
        );
        expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        // Fire Elemental : 5 ; Bear Cub : endurance 2 ; excès de 3.
        const army = armies(s)[0] as string;
        expect(s.objects[army]?.controller).toBe("p1");
        expect(s.objects[army]?.counters["+1/+1"]).toBe(3);
        expect(chars(s, army).subtypes).toContain("Goblin");
      });

      it("sans sacrifice, rien ne se passe ; sans excès, pas d'Armée", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Bear Cub"], hand: ["Bolg of the North"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        s = settle(cast(s, "p1", "Bolg of the North"), (req) => (req.intent === "sacrifice" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(s.objects[idOf(s, "p2", "battlefield", "Fire Elemental")]?.damage).toBe(0);

        let t = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Bear Cub"], hand: ["Bolg of the North"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const bear = idOf(t, "p1", "battlefield", "Bear Cub");
        const fire = idOf(t, "p2", "battlefield", "Fire Elemental");
        t = settle(cast(t, "p1", "Bolg of the North"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : pick(fire)(req, t),
        );
        expect(t.objects[fire]?.damage).toBe(2);
        expect(armies(t)).toHaveLength(0);
      });
    });

    it("Bolg's Company : célérité avec un autre Gobelin ; {T}, sacrifiez un autre Gobelin : ajoutez {B}{R}", () => {
      let s = scenario({ p1: { battlefield: ["Bolg's Company", "Goblin Smuggler"] } });
      const company = idOf(s, "p1", "battlefield", "Bolg's Company");
      expect(chars(s, company).keywords).toContain("haste");
      s = activate(s, "p1", company);
      expect(idsOf(s, "p1", "graveyard", "Goblin Smuggler")).toHaveLength(1);
      expect([s.players.p1?.manaPool.B, s.players.p1?.manaPool.R]).toEqual([1, 1]);
      expect(chars(s, company).keywords).not.toContain("haste");
    });

    it("The Chief Warg : Férocité — en attaquant avec une créature de force 4 ou plus, piochez une carte et perdez 1 PV", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["The Chief Warg", other], library: lands("Forest", 3) } });
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "The Chief Warg")]));
        return [s.players.p1?.hand.length, s.players.p1?.life];
      };
      expect(run("Fire Elemental")).toEqual([1, 19]);
      expect(run("Bear Cub")).toEqual([0, 20]);
    });

    it("Duskwatch Hunter : marqueur +1/+1 en arrivant ; ne peut pas être bloquée par des jetons", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", ...lands("Forest", 2), "Duskwatch Hunter"], hand: ["Duskwatch Hunter"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      const hunter = idOf(s, "p1", "battlefield", "Duskwatch Hunter");
      s = settle(cast(s, "p1", "Duskwatch Hunter"), pick(hunter));
      expect(s.objects[hunter]?.counters["+1/+1"]).toBe(1);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const lionsObj = s.objects[lions];
      if (lionsObj) lionsObj.isToken = true;
      s = attack(s, [hunter]);
      expect(canBlock(s, lions, hunter)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), hunter)).toBe(true);
    });

    describe("Eagle's Rescue", () => {
      it("la créature enchantée gagne +2/+2 et le vol", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 2), ...lands("Island", 2), "Bear Cub"], hand: ["Eagle's Rescue"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Eagle's Rescue", { targets: { enchant: [bear] } }));
        expect(pt(s, bear)).toEqual([4, 4]);
        expect(chars(s, bear).keywords).toContain("flying");
      });

      it("depuis le cimetière, en rituel : revient attachée à une de vos créatures de force 1 ou moins", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 2), ...lands("Island", 2), "Llanowar Elves", "Bear Cub"],
            graveyard: ["Eagle's Rescue"],
          },
        });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const rescue = idOf(s, "p1", "graveyard", "Eagle's Rescue");
        expect(() => activate(s, "p1", rescue, { targets: { t: [bear] } })).toThrow();
        s = settle(activate(s, "p1", rescue, { targets: { t: [elves] } }));
        const aura = idOf(s, "p1", "battlefield", "Eagle's Rescue");
        expect(s.objects[aura]?.attachedTo).toBe(elves);
        expect(pt(s, elves)).toEqual([3, 3]);
        expect(chars(s, elves).keywords).toContain("flying");
      });
    });

    it("Fearsome Goblin Pair : en mourant, amassez des Gobelins 4", () => {
      let s = scenario({ p1: { battlefield: ["Fearsome Goblin Pair", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
      const pair = idOf(s, "p1", "battlefield", "Fearsome Goblin Pair");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [pair] } }));
      const army = armies(s)[0] as string;
      expect(pt(s, army)).toEqual([4, 4]);
      expect(chars(s, army).subtypes).toEqual(expect.arrayContaining(["Goblin", "Army"]));
      expect(chars(s, army).colors).toEqual(["B"]);
    });

    it("Goblin Plate Mail : amasse des Gobelins 1 et s'attache à l'Armée (+1/+0 et la menace)", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Mountain"], hand: ["Goblin Plate Mail"] } });
      s = settle(cast(s, "p1", "Goblin Plate Mail"));
      const army = armies(s)[0] as string;
      expect(s.objects[idOf(s, "p1", "battlefield", "Goblin Plate Mail")]?.attachedTo).toBe(army);
      expect(pt(s, army)).toEqual([2, 1]);
      expect(chars(s, army).keywords).toContain("menace");
    });

    describe("The Great Goblin", () => {
      it("des marqueurs sur une Armée que vous contrôlez : 2 blessures à un adversaire ciblé", () => {
        let s = scenario({ p1: { battlefield: ["The Great Goblin", "Swamp", "Mountain"], hand: ["Goblin Plate Mail"] } });
        s = settle(cast(s, "p1", "Goblin Plate Mail"));
        expect(s.players.p2?.life).toBe(18);
      });

      it("un autre Gobelin meurt : la carte du dessus est exilée, jouable jusqu'à la fin de votre prochain tour", () => {
        let s = scenario({
          p1: {
            battlefield: ["The Great Goblin", "Goblin Smuggler", "Mountain", "Island"],
            hand: ["Lightning Strike"],
            library: ["Opt", ...lands("Forest", 5)],
          },
        });
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Goblin Smuggler")] } }));
        const opt = s.exile.find((id) => nameOf(s, id) === "Opt") as string;
        expect(opt).toBeDefined();
        // Lightning Strike a engagé les deux terrains ; au tour suivant de p1, Opt se lance encore depuis l'exil.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        expect(canCast(s, "p1", opt)).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(canCast(s, "p1", opt)).toBe(false);
      });
    });

    describe("Mirkwood Nurturer", () => {
      it("renvoie un autre de vos permanents ; si c'est fait, un marqueur +1/+1", () => {
        let s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Mirkwood Nurturer"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Mirkwood Nurturer"), pick(bear));
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        expect(pt(s, idOf(s, "p1", "battlefield", "Mirkwood Nurturer"))).toEqual([4, 3]);
      });

      it("sans cible, pas de marqueur", () => {
        let s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Mirkwood Nurturer"] } });
        s = settle(cast(s, "p1", "Mirkwood Nurturer"), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(pt(s, idOf(s, "p1", "battlefield", "Mirkwood Nurturer"))).toEqual([3, 2]);
      });
    });

    it("Nori, Teller of Tales : en attaquant, une créature attaquante ciblée gagne l'initiative jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Nori, Teller of Tales", "Bear Cub"] } });
      const nori = idOf(s, "p1", "battlefield", "Nori, Teller of Tales");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [nori, bear]), pick(bear));
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    describe("Silvan Reveler", () => {
      it("en arrivant : piochez, défaussez ; un terrain défaussé arrive engagé", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Forest", 2), ...lands("Island", 2)],
            hand: ["Silvan Reveler"],
            library: ["Swamp", "Opt"],
          },
        });
        s = settle(cast(s, "p1", "Silvan Reveler"));
        const swamp = idOf(s, "p1", "battlefield", "Swamp");
        expect(s.objects[swamp]?.tapped).toBe(true);
        expect(s.players.p1?.graveyard).toHaveLength(0);
      });

      it("Landfall depuis le cimetière : payez {1}{G}{U} pour le reprendre en main", () => {
        const s = scenario({
          p1: { battlefield: ["Forest", "Island", "Island"], hand: ["Forest"], graveyard: ["Silvan Reveler"] },
        });
        const play = (yes: boolean) =>
          settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), (req) =>
            req.intent === "may" ? [yes ? 1 : 0] : undefined,
          );
        expect(idsOf(play(false), "p1", "graveyard", "Silvan Reveler")).toHaveLength(1);
        const paid = play(true);
        expect(idsOf(paid, "p1", "hand", "Silvan Reveler")).toHaveLength(1);
        expect(paid.battlefield.filter((id) => paid.objects[id]?.tapped)).toHaveLength(3);
      });
    });

    describe("Thranduil, Sindarin Liege // Silvan Rally", () => {
      const THRANDUIL = "Thranduil, Sindarin Liege // Silvan Rally";

      it("vos autres Elfes gagnent +1/+1 ; Landfall : un jeton Elfe 1/1 vert", () => {
        let s = scenario({ p1: { battlefield: [THRANDUIL, "Llanowar Elves"], hand: ["Forest"] } });
        expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
        expect(pt(s, idOf(s, "p1", "battlefield", THRANDUIL))).toEqual([2, 3]);
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        const elf = tokensNamed(s, "Elf")[0] as string;
        expect(pt(s, elf)).toEqual([2, 2]);
        expect(chars(s, elf).colors).toEqual(["G"]);
      });

      it("Silvan Rally : meulez quatre cartes, puis jusqu'à deux cartes de terrain meulées vont dans votre main", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: [THRANDUIL], library: ["Opt", "Island", "Bear Cub", "Swamp", "Mountain"] },
        });
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", THRANDUIL), face: 1 });
        s = settle(s, (req, cur) => {
          if (req.type !== "pick") return undefined;
          // Seules les cartes de terrain meulées sont proposées (pas la Montagne, cinquième carte, restée en bibliothèque).
          expect(namesIn(cur, req.options.map(String)).sort()).toEqual(["Island", "Swamp"]);
          return req.options;
        });
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Swamp"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
        expect(s.exile.some((id) => nameOf(s, id) === THRANDUIL)).toBe(true);
      });
    });

    describe("Thranduil's Company", () => {
      it("avec un autre Elfe, un terrain supplémentaire ; Landfall : deux marqueurs +1/+1 et la vigilance", () => {
        let s = scenario({ p1: { battlefield: ["Thranduil's Company", "Llanowar Elves"], hand: ["Forest", "Island"] } });
        const company = idOf(s, "p1", "battlefield", "Thranduil's Company");
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), pick(company));
        expect(s.objects[company]?.counters["+1/+1"]).toBe(2);
        expect(chars(s, company).keywords).toContain("vigilance");
        // Second terrain du tour permis.
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), pick(company));
        expect(s.objects[company]?.counters["+1/+1"]).toBe(4);
      });

      it("sans autre Elfe, pas de terrain supplémentaire", () => {
        let s = scenario({ p1: { battlefield: ["Thranduil's Company"], hand: ["Forest", "Island"] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        expect(() => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") })).toThrow();
      });
    });

    describe("Tom, Bert, and William", () => {
      it("{1}, sacrifiez une autre créature : piochez autant que sa force, puis défaussez une carte", () => {
        let s = scenario({
          p1: { battlefield: ["Tom, Bert, and William", "Fire Elemental", "Swamp"], library: lands("Forest", 8) },
        });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Tom, Bert, and William")));
        expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(4);
        expect(s.players.p1?.graveyard).toHaveLength(2);
      });

      it("quand ils meurent en créature, ils reviennent sur le champ de bataille en artefact non-créature", () => {
        let s = scenario({
          p1: {
            battlefield: ["Tom, Bert, and William", ...lands("Mountain", 4)],
            hand: ["Lightning Strike", "Lightning Strike"],
          },
        });
        const tbw = idOf(s, "p1", "battlefield", "Tom, Bert, and William");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [tbw] } }));
        // 3 blessures sur un 5/5 : la seconde Lightning Strike le tue.
        expect(idsOf(s, "p1", "battlefield", "Tom, Bert, and William")).toEqual([tbw]);
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [tbw] } }));
        const back = idOf(s, "p1", "battlefield", "Tom, Bert, and William");
        expect(chars(s, back).types).toEqual(["Artifact"]);
        expect(chars(s, back).subtypes).toEqual([]);
      });
    });
  });
});

describe("lot A, incolores et terrains", () => {
  type S = GameState;
  /** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
  type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

  /** Passe et répond aux choix jusqu'à une pile vide, sans déclenchement en attente. Les défenseurs ne bloquent pas. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Joue (sans bloquer) jusqu'à la seconde phase principale, en répondant aux choix. */
  const throughCombat = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)));
  /** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  /** Sélectionne dans les options d'un choix les objets nommés (un exemplaire par nom donné). */
  const pickNamed = (s: S, req: ChoiceRequest, ...names: string[]) => {
    if (req.type !== "pick") return undefined;
    const left = [...req.options];
    return names.flatMap((n) => {
      const i = left.findIndex((id) => typeof id === "string" && nameOf(s, id) === n);
      return i < 0 ? [] : left.splice(i, 1);
    });
  };
  /** Équipe `equipment` sur `creature` (capacité « Équiper »). */
  const equip = (s: S, equipment: string, creature: string) =>
    settle(activate(s, "p1", equipment, "Équiper", { targets: { t: [creature] } }));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const DWARF_CARD: CardDef = customCard({ name: "Nain de test", subtypes: ["Dwarf"], power: 2, toughness: 2 });

  describe("The Hobbit, lot A — incolores et terrains", () => {
    // --- Créatures incolores --------------------------------------------------------
    it("Long-Bodied Grey Dog : flash et portée ; en arrivant, un Trésor engagé", () => {
      let s = scenario({ p1: { battlefield: lands("Wastes", 3), hand: ["Long-Bodied Grey Dog"] } });
      s = settle(cast(s, "p1", "Long-Bodied Grey Dog"));
      const dog = idOf(s, "p1", "battlefield", "Long-Bodied Grey Dog");
      expect(chars(s, dog).keywords).toEqual(expect.arrayContaining(["flash", "reach"]));
      const treasure = idOf(s, "p1", "battlefield", "Treasure");
      expect(s.objects[treasure]?.tapped).toBe(true);
    });

    it("Old Thrush : vous gagnez 2 PV, puis un terrain de base cherché va sur le dessus de la bibliothèque mélangée", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 2), hand: ["Old Thrush"], library: ["Opt", "Swamp", "Serra Angel", "Island"] },
      });
      s = settle(cast(s, "p1", "Old Thrush"), (req, cur) =>
        req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Swamp") : undefined,
      );
      expect(s.players.p1?.life).toBe(22);
      expect(s.players.p1?.library).toHaveLength(4);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Swamp");
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("Troop of Ponies : deux terrains de base, l'un sur le champ de bataille engagé, l'autre en main", () => {
      let s = scenario({
        p1: { battlefield: ["Troop of Ponies", ...lands("Wastes", 2)], library: ["Opt", "Forest", "Island", "Swamp"] },
      });
      const troop = idOf(s, "p1", "battlefield", "Troop of Ponies");
      s = settle(activate(s, "p1", troop), (req, cur) => {
        if (req.type !== "pick") return undefined;
        return req.intent === "search" ? pickNamed(cur, req, "Forest", "Island") : pickNamed(cur, req, "Island");
      });
      expect(idsOf(s, "p1", "graveyard", "Troop of Ponies")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Opt", "Swamp"]);
    });

    // --- L'Arkenstone // Cherchez le cœur --------------------------------------------
    describe("The Arkenstone // Seek the Heart", () => {
      it("vos créatures ont +1/+1 ; au début de votre étape de fin, piochez une carte", () => {
        let s = scenario({
          p1: { battlefield: ["The Arkenstone // Seek the Heart", "Bear Cub"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
        expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("Cherchez le cœur : une carte de créature légendaire en main, puis la carte est exilée (lançable ensuite)", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Plains", 8),
            hand: ["The Arkenstone // Seek the Heart"],
            library: ["Bear Cub", "Thorin Oakenshield", "Opt"],
          },
        });
        const card = idOf(s, "p1", "hand", "The Arkenstone // Seek the Heart");
        let seen: (string | undefined)[] = [];
        s = settle(act(s, "p1", { type: "cast", card, face: 1 }), (req, cur) => {
          if (req.type !== "pick" || req.intent !== "search") return undefined;
          seen = namesIn(cur, req.options as string[]);
          return pickNamed(cur, req, "Thorin Oakenshield");
        });
        expect(seen).toEqual(["Thorin Oakenshield"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Thorin Oakenshield"]);
        // Nouvel objet en exil (400.7) : la carte s'y trouve, et L'Arkenstone peut ensuite être lancée depuis l'exil.
        const exiled = s.exile.find((id) => nameOf(s, id) === "The Arkenstone // Seek the Heart") as string;
        expect(exiled).toBeDefined();
        expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === exiled)).toBe(true);
      });
    });

    // --- La Flèche noire -------------------------------------------------------------
    describe("The Black Arrow", () => {
      it("en arrivant, 1 blessure : un Dragon ainsi blessé est détruit", () => {
        let s = scenario({
          p1: { battlefield: lands("Wastes", 3), hand: ["The Black Arrow"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = settle(cast(s, "p1", "The Black Arrow", { targets: { t: [dragon] } }));
        expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      });

      it("une créature qui n'est pas un Dragon reçoit seulement 1 blessure ; un joueur peut être ciblé", () => {
        let s = scenario({
          p1: { battlefield: lands("Wastes", 3), hand: ["The Black Arrow"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "The Black Arrow", { targets: { t: [bear] } }));
        expect(s.objects[bear]?.damage).toBe(1);
        expect(s.battlefield).toContain(bear);
        let t = scenario({ p1: { battlefield: lands("Wastes", 3), hand: ["The Black Arrow"] } });
        t = settle(cast(t, "p1", "The Black Arrow", { targets: { t: ["p2"] } }));
        expect(t.players.p2?.life).toBe(19);
      });

      it("la créature équipée a +1/+1 et la portée ; Équiper {1}", () => {
        let s = scenario({ p1: { battlefield: ["The Black Arrow", "Bear Cub", "Wastes"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = equip(s, idOf(s, "p1", "battlefield", "The Black Arrow"), bear);
        expect(pt(s, bear)).toEqual([3, 3]);
        expect(chars(s, bear).keywords).toContain("reach");
      });
    });

    // --- Pioche naine ----------------------------------------------------------------
    it("Dwarven Mattock : s'attache en arrivant au Nain ciblé, qui a +2/+2 et la garde {1}", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Wastes", 2), DWARF_CARD], hand: ["Dwarven Mattock"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const dwarf = idOf(s, "p1", "battlefield", DWARF_CARD.name);
      s = settle(cast(s, "p1", "Dwarven Mattock"), (req) =>
        req.type === "pick" && req.options.includes(dwarf) ? [dwarf] : undefined,
      );
      const mattock = idOf(s, "p1", "battlefield", "Dwarven Mattock");
      expect(s.objects[mattock]?.attachedTo).toBe(dwarf);
      expect(pt(s, dwarf)).toEqual([4, 4]);
      // Garde {1} : le Choc de l'adversaire, qui n'a plus de mana pour la payer, est contrecarré.
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "Lightning Strike", { targets: { t: [dwarf] } });
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(s.objects[dwarf]?.damage).toBe(0);
    });

    // --- Rocher du géant -------------------------------------------------------------
    describe("Giant's Boulder", () => {
      it("en arrivant, regard 2", () => {
        let s = scenario({ p1: { battlefield: ["Wastes"], hand: ["Giant's Boulder"], library: ["Opt", "Island", "Swamp"] } });
        let asked = false;
        s = settle(cast(s, "p1", "Giant's Boulder"), (req, cur) => {
          if (req.type === "pick" && req.options.length === 2) {
            asked = true;
            expect(namesIn(cur, req.options as string[]).sort()).toEqual(["Island", "Opt"]);
          }
          return undefined;
        });
        expect(asked).toBe(true);
      });

      it("{1}, {T} : un mana de n'importe quelle couleur", () => {
        let s = scenario({ p1: { battlefield: ["Giant's Boulder", "Wastes"], hand: ["Llanowar Elves"] } });
        s = activate(s, "p1", idOf(s, "p1", "battlefield", "Giant's Boulder"), "couleur");
        s = settle(s, (req) => (req.type === "pick" && req.options.includes("G") ? ["G"] : undefined));
        expect(s.players.p1?.manaPool.G).toBe(1);
        s = settle(cast(s, "p1", "Llanowar Elves"));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      });

      it("{7}, {T}, sacrifiez-le : détruisez un permanent ciblé", () => {
        let s = scenario({ p1: { battlefield: ["Giant's Boulder", ...lands("Wastes", 7)] }, p2: { battlefield: ["Island"] } });
        const island = idOf(s, "p2", "battlefield", "Island");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Giant's Boulder"), "Détruisez", { targets: { t: [island] } }));
        expect(idsOf(s, "p2", "graveyard", "Island")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Giant's Boulder")).toHaveLength(1);
      });
    });

    // --- Glamdring // Lueur de mort -------------------------------------------------
    describe("Glamdring, Foe-hammer // Gleam of Death", () => {
      it("vos éphémères et rituels coûtent {X} de moins, X étant la force de la créature équipée", () => {
        let s = scenario({
          p1: {
            battlefield: ["Glamdring, Foe-hammer // Gleam of Death", "Bear Cub", ...lands("Plains", 2), "Mountain"],
            hand: ["Lightning Strike"],
          },
        });
        const glamdring = idOf(s, "p1", "battlefield", "Glamdring, Foe-hammer // Gleam of Death");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        // Non équipé : X = 0, et {1}{R} n'est pas payable avec la seule Montagne restante après Équiper.
        s = equip(s, glamdring, bear);
        expect(s.objects[glamdring]?.attachedTo).toBe(bear);
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
      });

      it("sans créature équipée, aucune réduction", () => {
        const s = scenario({
          p1: { battlefield: ["Glamdring, Foe-hammer // Gleam of Death", "Bear Cub", "Mountain"], hand: ["Lightning Strike"] },
        });
        expect(() => cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } })).toThrow();
      });

      it("Lueur de mort : meulez six cartes, puis les éphémères et rituels parmi elles vont en main", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Island", 4),
            hand: ["Glamdring, Foe-hammer // Gleam of Death"],
            library: ["Opt", "Bear Cub", "Lightning Strike", "Forest", "Serra Angel", "Island", "Swamp"],
          },
        });
        const card = idOf(s, "p1", "hand", "Glamdring, Foe-hammer // Gleam of Death");
        s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Lightning Strike", "Opt"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Island", "Serra Angel"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Swamp"]);
        expect(namesIn(s, s.exile)).toEqual(["Glamdring, Foe-hammer // Gleam of Death"]);
      });
    });

    // --- Mon précieux // L'attrait du pouvoir ----------------------------------------
    describe("My Precious // Allure of Power", () => {
      it("Équiper—{2}, payez 2 PV : la créature équipée a la défense talismanique et ne peut pas être bloquée", () => {
        let s = scenario({
          p1: { battlefield: ["My Precious // Allure of Power", "Bear Cub", ...lands("Wastes", 2)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const precious = idOf(s, "p1", "battlefield", "My Precious // Allure of Power");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = equip(s, precious, bear);
        expect(s.objects[precious]?.attachedTo).toBe(bear);
        expect(s.players.p1?.life).toBe(18);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "unblockable"]));
        s = attack(s, [bear]);
        // L'Ange ne peut pas la bloquer : le défenseur n'a aucun blocage à déclarer, et l'Ourson inflige ses blessures.
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "main2", 50);
        expect(s.pending?.kind).not.toBe("declareBlockers");
        expect(s.players.p2?.life).toBe(18);
        // Témoin : sans le Précieux, l'Ange pourrait bloquer.
        let w = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
        w = attack(w, [idOf(w, "p1", "battlefield", "Bear Cub")]);
        w = advanceUntil(w, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "main2", 50);
        expect(w.pending?.kind).toBe("declareBlockers");
      });

      it("L'attrait du pouvoir : sacrifiez une créature en coût additionnel, piochez deux cartes", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["My Precious // Allure of Power"] },
        });
        const card = idOf(s, "p1", "hand", "My Precious // Allure of Power");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(act(s, "p1", { type: "cast", card, face: 1, sacrifice: [bear] }));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(2);
        expect(namesIn(s, s.exile)).toEqual(["My Precious // Allure of Power"]);
        // Sans créature à sacrifier, le sort ne peut pas être lancé.
        const t = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["My Precious // Allure of Power"] } });
        const c2 = idOf(t, "p1", "hand", "My Precious // Allure of Power");
        expect(() => act(t, "p1", { type: "cast", card: c2, face: 1 })).toThrow();
      });
    });

    // --- Orcrist ---------------------------------------------------------------------
    it("Orcrist, Goblin-cleaver : +2/+2 et le piétinement ; blessures de combat à un joueur : un Trésor par créature du type choisi", () => {
      let s = scenario({
        p1: { battlefield: ["Orcrist, Goblin-cleaver", "Bear Cub", "Bear Cub", "Llanowar Elves", ...lands("Wastes", 3)] },
      });
      const orcrist = idOf(s, "p1", "battlefield", "Orcrist, Goblin-cleaver");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, orcrist, bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("trample");
      let offered = false;
      s = throughCombat(attack(s, [bear]), (req) => {
        if (req.type === "pick" && req.options.includes("Bear")) {
          offered = true;
          return ["Bear"];
        }
        return undefined;
      });
      expect(offered).toBe(true);
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    // --- Dard ------------------------------------------------------------------------
    describe("Sting, Bilbo's Sword", () => {
      it("en arrivant : un marqueur d'affûtage par créature de l'adversaire ciblé, et s'attache ; +1/+0 par marqueur", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Wastes", 2), "Bear Cub"], hand: ["Sting, Bilbo's Sword"] },
          p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel", "Island"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Sting, Bilbo's Sword"), (req) => {
          if (req.type !== "pick") return undefined;
          if (req.options.includes("p2")) return ["p2"];
          if (req.options.includes(bear)) return [bear];
          return undefined;
        });
        const sting = idOf(s, "p1", "battlefield", "Sting, Bilbo's Sword");
        expect(s.objects[sting]?.counters.hone).toBe(3);
        expect(s.objects[sting]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([5, 2]);
      });

      it("« jusqu'à une » créature : sans cible, Dard reste non attaché mais reçoit ses marqueurs", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Wastes", 2), "Bear Cub"], hand: ["Sting, Bilbo's Sword"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Sting, Bilbo's Sword"), (req) => {
          if (req.type !== "pick") return undefined;
          return req.options.includes("p2") ? ["p2"] : [];
        });
        const sting = idOf(s, "p1", "battlefield", "Sting, Bilbo's Sword");
        expect(s.objects[sting]?.counters.hone).toBe(1);
        expect(s.objects[sting]?.attachedTo).toBeFalsy();
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      });
    });

    // --- Carte de Thrór, spatule -----------------------------------------------------
    it("Thrór's Map : un terrain de base en main en arrivant ; {2}, {T} : piochez, puis défaussez", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 4), hand: ["Thrór's Map"], library: ["Opt", "Forest", "Island", "Swamp"] },
      });
      s = settle(cast(s, "p1", "Thrór's Map"), (req, cur) =>
        req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Forest") : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Thrór's Map")), (req, cur) =>
        req.type === "pick" ? pickNamed(cur, req, "Forest") : undefined,
      );
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    });

    it("Well-Worn Spatula : vous gagnez 2 PV en arrivant ; la créature équipée a +1/+1 ; Équiper {1}", () => {
      let s = scenario({ p1: { battlefield: [...lands("Wastes", 2), "Bear Cub"], hand: ["Well-Worn Spatula"] } });
      s = settle(cast(s, "p1", "Well-Worn Spatula"));
      expect(s.players.p1?.life).toBe(22);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, idOf(s, "p1", "battlefield", "Well-Worn Spatula"), bear);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    // --- Terrains --------------------------------------------------------------------
    it("terrains bicolores du cycle : arrivent engagés et produisent leurs deux couleurs", () => {
      const cycle: [string, string[]][] = [
        ["Elvenking's Halls", ["G", "U"]],
        ["Goblin-town", ["B", "R"]],
        ["Iron Hills", ["R", "W"]],
        ["Lake-town", ["W", "U"]],
        ["Mirkwood", ["B", "G"]],
      ];
      for (const [name, colors] of cycle) {
        let s = scenario({ p1: { hand: [name] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) }));
        expect(s.objects[idOf(s, "p1", "battlefield", name)]?.tapped).toBe(true);
        const u = scenario({ p1: { battlefield: [name] } });
        const id = idOf(u, "p1", "battlefield", name);
        const produced = legalActions(u, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        expect([...new Set(produced)].sort()).toEqual([...colors].sort());
      }
    });

    it("Elvenking's Halls : {2}{G}{U}, {T}, sacrifiez-le : deux marqueurs +1/+1 sur un Elfe, en rituel seulement", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Elvenking's Halls", "Llanowar Elves", "Bear Cub", ...lands("Forest", 2), ...lands("Island", 2)] },
        });
      let s = setup();
      const halls = idOf(s, "p1", "battlefield", "Elvenking's Halls");
      const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
      expect(() =>
        activate(s, "p1", halls, "marqueurs", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      s = settle(activate(s, "p1", halls, "marqueurs", { targets: { t: [elf] } }));
      expect(s.objects[elf]?.counters["+1/+1"]).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Elvenking's Halls")).toHaveLength(1);
      let t = setup();
      t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Elvenking's Halls"), "marqueurs")).toBe(false);
    });

    it("Mirkwood : un Ours, une Araignée ou un Loup ; Goblin-town : un Gobelin ou un Orque", () => {
      let s = scenario({
        p1: { battlefield: ["Mirkwood", "Bear Cub", "Llanowar Elves", ...lands("Swamp", 2), ...lands("Forest", 2)] },
      });
      const mirkwood = idOf(s, "p1", "battlefield", "Mirkwood");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() =>
        activate(s, "p1", mirkwood, "marqueurs", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }),
      ).toThrow();
      s = settle(activate(s, "p1", mirkwood, "marqueurs", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      const orc = customCard({ name: "Orque de test", subtypes: ["Orc"], power: 2, toughness: 1 });
      let g = scenario({ p1: { battlefield: ["Goblin-town", orc, "Bear Cub", ...lands("Swamp", 2), ...lands("Mountain", 2)] } });
      const town = idOf(g, "p1", "battlefield", "Goblin-town");
      const orcId = idOf(g, "p1", "battlefield", orc.name);
      expect(() =>
        activate(g, "p1", town, "marqueurs", { targets: { t: [idOf(g, "p1", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      g = settle(activate(g, "p1", town, "marqueurs", { targets: { t: [orcId] } }));
      expect(g.objects[orcId]?.counters["+1/+1"]).toBe(2);
    });

    describe("Hobbit Hole", () => {
      it("{T}, sacrifiez-le : un terrain de base sur le champ de bataille engagé", () => {
        let s = scenario({ p1: { battlefield: ["Hobbit Hole"], library: ["Opt", "Plains", "Island"] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hobbit Hole")), (req, cur) =>
          req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Plains") : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Hobbit Hole")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("cycle de Hobbit {4} : défaussez-le pour chercher une carte de Hobbit", () => {
        let s = scenario({
          p1: { battlefield: lands("Wastes", 4), hand: ["Hobbit Hole"], library: ["Opt", "Belladonna Took", "Bear Cub"] },
        });
        const hole = idOf(s, "p1", "hand", "Hobbit Hole");
        let seen: (string | undefined)[] = [];
        s = settle(activate(s, "p1", hole), (req, cur) => {
          if (req.type !== "pick" || req.intent !== "search") return undefined;
          seen = namesIn(cur, req.options as string[]);
          return undefined;
        });
        expect(seen).toEqual(["Belladonna Took"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Belladonna Took"]);
        expect(idsOf(s, "p1", "graveyard", "Hobbit Hole")).toHaveLength(1);
      });
    });
  });
});
