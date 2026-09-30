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
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
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
