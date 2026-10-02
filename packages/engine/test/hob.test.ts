/**
 * The Hobbit (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte Oracle
 * (plan R, lot R7). Contempler, Récit (storied), amasser des Gobelins, Nains et Équipements, Loups, Trésors…
 * Thorin, Mountain-king n'est pas testé ici : le moteur n'attache pas ses Équipements (arguments de `fx.attach` inversés
 * dans le script).
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { playerStatic } from "../src/statics";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, scenario } from "./helpers";

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
