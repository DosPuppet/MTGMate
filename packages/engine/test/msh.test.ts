/**
 * Marvel Super Heroes (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Équiper digne (Mjölnir), Plans (Political Triumph), Doombots (Doctor Doom, Castle Doom),
 * complot (M.O.D.O.K.), Wolverine, The Wondrous Wasp, Avengers Disassembled, Jennifer Walters et Hidden Lair.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, castNowOf, idOf, idsOf, passUntil, scenario, untilCastNow } from "./helpers";

type S = GameState;
/** Réponse à un choix, avec l'état courant (les cartes changent d'identifiant en changeant de zone). */
type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;

/** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
const settle = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    else break;
  }
  return cur;
};
/** Réponse qui choisit les objets (ou joueurs) voulus quand ils font partie des options. */
const picking =
  (want: string[]): Answer =>
  (req) => {
    if (req.type !== "pick") return undefined;
    const picked = want.filter((w) => req.options.includes(w));
    return picked.length > 0 ? picked : undefined;
  };
const cast = (s: S, player: string, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
const castable = (s: S, player: string, card: string) =>
  legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
/** Capacité activable de `source` dont le libellé correspond (la première sinon). */
const ability = (s: S, player: string, source: string, label?: RegExp) =>
  legalActions(s, player).find(
    (a): a is Extract<ActionOption, { type: "activate" }> =>
      a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
  );
const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
  act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
const setCounters = (s: S, id: string, kind: string, n: number) => {
  (s.objects[id] as { counters: Record<string, number> }).counters[kind] = n;
  s.version += 1;
};

describe("Marvel Super Heroes", () => {
  describe("Mjölnir, Hammer of Thor", () => {
    it("en arrivant, 4 blessures à jusqu'à une créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Mjölnir, Hammer of Thor"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Mjölnir, Hammer of Thor"), picking([angel]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Mjölnir, Hammer of Thor")).toHaveLength(1);
    });

    it("{2}{R}, défaussez-le : 2 blessures à chaque créature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Mjölnir, Hammer of Thor"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const hammer = idOf(s, "p1", "hand", "Mjölnir, Hammer of Thor");
      s = settle(activate(s, "p1", hammer));
      expect(idsOf(s, "p1", "graveyard", "Mjölnir, Hammer of Thor")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    });

    it("Équiper digne {1} : seulement une créature légendaire non-Méchant rouge et/ou blanche ; ses blessures sont doublées", () => {
      let s = scenario({
        p1: { battlefield: ["Mjölnir, Hammer of Thor", "Thor Odinson", "Doctor Doom", "Bear Cub", "Mountain"] },
      });
      const hammer = idOf(s, "p1", "battlefield", "Mjölnir, Hammer of Thor");
      const thor = idOf(s, "p1", "battlefield", "Thor Odinson");
      const equip = ability(s, "p1", hammer, /Équiper/);
      const legal = equip?.targets[0]?.legal ?? [];
      expect(legal).toEqual([thor]);
      s = settle(activate(s, "p1", hammer, { targets: { t: [thor] } }, /Équiper/));
      expect(s.objects[hammer]?.attachedTo).toBe(thor);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: thor, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      // Thor Odinson (4/4) inflige 8 blessures.
      expect(s.players.p2?.life).toBe(12);
    });
  });

  describe("Political Triumph", () => {
    it("une créature arrivée sous votre contrôle : regard 1 et un marqueur de plan", () => {
      let s = scenario({
        p1: { battlefield: ["Political Triumph", "Forest"], hand: ["Llanowar Elves"], library: ["Opt", "Forest"] },
      });
      const plan = idOf(s, "p1", "battlefield", "Political Triumph");
      let scried = false;
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => {
        if (req.type === "pick" && req.options.some((id) => nameOf(s, String(id)) === "Opt")) scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(s.objects[plan]?.counters.plan).toBe(1);
    });

    it("au quatrième marqueur : sacrifiez-le, piochez et un marqueur +1/+1 sur chacune de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Political Triumph", "Forest", "Bear Cub"], hand: ["Llanowar Elves"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      setCounters(s, idOf(s, "p1", "battlefield", "Political Triumph"), "plan", 3);
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(idsOf(s, "p1", "graveyard", "Political Triumph")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Doctor Doom", () => {
    it("en arrivant, deux Doombots 3/3 (créatures-artefacts Robot Méchant) ; il est alors indestructible", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Doctor Doom"] } });
      s = settle(cast(s, "p1", "Doctor Doom"));
      const bots = idsOf(s, "p1", "battlefield", "Doombot");
      expect(bots).toHaveLength(2);
      const c = chars(s, bots[0] as string);
      expect([c.power, c.toughness]).toEqual([3, 3]);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Robot", "Villain"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Doctor Doom")).keywords).toContain("indestructible");
    });

    it("indestructible seulement avec une créature-artefact ou un Plan", () => {
      const alone = scenario({ p1: { battlefield: ["Doctor Doom"] } });
      expect(chars(alone, idOf(alone, "p1", "battlefield", "Doctor Doom")).keywords).not.toContain("indestructible");
      const plan = scenario({ p1: { battlefield: ["Doctor Doom", "Political Triumph"] } });
      expect(chars(plan, idOf(plan, "p1", "battlefield", "Doctor Doom")).keywords).toContain("indestructible");
    });

    it("au début de votre étape de fin, piochez une carte et perdez 1 PV", () => {
      let s = scenario({ p1: { battlefield: ["Doctor Doom"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });
  });

  describe("Castle Doom", () => {
    it("son mana de couleur ne paie qu'un sort d'artefact", () => {
      const s = scenario({
        p1: { battlefield: ["Castle Doom", ...lands("Plains", 3)], hand: ["Burst Lightning", "Mjölnir, Hammer of Thor"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Burst Lightning"))).toBe(false);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Mjölnir, Hammer of Thor"))).toBe(true);
    });

    it("{3}, {T}, sacrifiez un artefact : un Doombot 3/3, en rituel seulement", () => {
      let s = scenario({ p1: { battlefield: ["Castle Doom", "The Mind Stone", ...lands("Plains", 3)] } });
      const castle = idOf(s, "p1", "battlefield", "Castle Doom");
      const stone = idOf(s, "p1", "battlefield", "The Mind Stone");
      const doombot = ability(s, "p1", castle, /Doombot/);
      expect(doombot?.additional?.sacrifice?.options).toContain(stone);
      s = settle(activate(s, "p1", castle, { sacrifice: [stone] }, /Doombot/));
      expect(idsOf(s, "p1", "graveyard", "The Mind Stone")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Doombot"))).toEqual([3, 3]);
      // Pendant le tour adverse, la capacité n'est pas proposée.
      let t = scenario({ active: "p2", p1: { battlefield: ["Castle Doom", "The Mind Stone", ...lands("Plains", 3)] } });
      t = act(t, "p2", { type: "pass" });
      expect(ability(t, "p1", idOf(t, "p1", "battlefield", "Castle Doom"), /Doombot/)).toBeUndefined();
    });
  });

  describe("M.O.D.O.K.", () => {
    it("les créatures adverses ont −1/−1, pas les vôtres", () => {
      const s = scenario({ p1: { battlefield: ["M.O.D.O.K.", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "M.O.D.O.K.")).keywords).toEqual(
        expect.arrayContaining(["flying", "lifelink"]),
      );
    });

    it("payez 3 PV : il complote ; une carte non-terrain défaussée lui donne un marqueur +1/+1", () => {
      const run = (discard: string) => {
        let s = scenario({ p1: { battlefield: ["M.O.D.O.K."], hand: ["Forest"], library: ["Opt", "Plains"] } });
        const modok = idOf(s, "p1", "battlefield", "M.O.D.O.K.");
        s = activate(s, "p1", modok);
        s = settle(s, (req, _player, cur) => {
          if (req.type !== "pick") return undefined;
          const id = req.options.find((o) => nameOf(cur, String(o)) === discard);
          return id ? [id] : undefined;
        });
        return { s, modok };
      };
      const opt = run("Opt");
      expect(opt.s.players.p1?.life).toBe(17);
      expect(opt.s.players.p1?.hand.map((id) => nameOf(opt.s, id))).toEqual(["Forest"]);
      expect(opt.s.objects[opt.modok]?.counters["+1/+1"]).toBe(1);
      const land = run("Forest");
      expect(land.s.players.p1?.hand.map((id) => nameOf(land.s, id))).toEqual(["Opt"]);
      expect(land.s.objects[land.modok]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("le complot ne s'active que pendant votre tour", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["M.O.D.O.K."] } });
      s = act(s, "p2", { type: "pass" });
      expect(ability(s, "p1", idOf(s, "p1", "battlefield", "M.O.D.O.K."))).toBeUndefined();
    });
  });

  it("Wolverine : célérité ; se bat contre une autre créature ; de nouvelles blessures guérissent les précédentes", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Forest"], hand: ["Wolverine, Fierce Fighter", "Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Wolverine, Fierce Fighter"), picking([bear]));
    const wolverine = idOf(s, "p1", "battlefield", "Wolverine, Fierce Fighter");
    expect(chars(s, wolverine).keywords).toContain("haste");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[wolverine]?.damage).toBe(2);
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [wolverine] } }));
    expect(s.objects[wolverine]?.damage).toBe(2);
  });

  it("The Wondrous Wasp : engage une créature, qui perd ses capacités tant que la Guêpe reste en jeu", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Mountain"], hand: ["The Wondrous Wasp", "Burst Lightning"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "The Wondrous Wasp"), picking([angel]));
    const wasp = idOf(s, "p1", "battlefield", "The Wondrous Wasp");
    expect(chars(s, wasp).keywords).toEqual(expect.arrayContaining(["flash", "flying"]));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(chars(s, angel).keywords).not.toContain("flying");
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [wasp] } }));
    expect(idsOf(s, "p1", "graveyard", "The Wondrous Wasp")).toHaveLength(1);
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
  });

  it("Avengers Disassembled, les deux modes : 3 blessures à chaque créature, un terrain détruit, son contrôleur cherche un terrain de base", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Avengers Disassembled"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", "Island"], library: ["Plains", "Opt"] },
    });
    const island = idOf(s, "p2", "battlefield", "Island");
    s = settle(cast(s, "p1", "Avengers Disassembled", { mode: 2, targets: { t: [island] } }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    expect(idsOf(s, "p2", "graveyard", "Island")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  describe("Jennifer Walters // The Sensational She-Hulk", () => {
    it("vos adversaires ne peuvent pas lancer de sorts pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: ["Jennifer Walters // The Sensational She-Hulk"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      s = act(s, "p1", { type: "pass" });
      expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Opt"))).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Opt"))).toBe(true);
    });

    it("She-Hulk : une de vos créatures blessée lui fait infliger autant de blessures à une cible, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Jennifer Walters // The Sensational She-Hulk",
            ...lands("Forest", 2),
            ...lands("Plains", 4),
            ...lands("Mountain", 2),
          ],
          hand: ["Burst Lightning", "Burst Lightning"],
        },
      });
      const jen = idOf(s, "p1", "battlefield", "Jennifer Walters // The Sensational She-Hulk");
      s = settle(activate(s, "p1", jen));
      expect(chars(s, jen).name).toBe("The Sensational She-Hulk");
      expect(pt(s, jen)).toEqual([6, 6]);
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [jen] } }), picking(["p2"]));
      expect(s.players.p2?.life).toBe(18);
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [jen] } }), picking(["p2"]));
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[jen]?.damage).toBe(4);
    });
  });

  it("Hidden Lair : {C} toujours ; {U} ou {B} s'il est arrivé ce tour-ci ou avec un terrain de base", () => {
    const colors = (s: S) => {
      const lair = idOf(s, "p1", "battlefield", "Hidden Lair");
      return [
        ...new Set(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === lair ? a.colors : []))),
      ].sort();
    };
    expect(colors(scenario({ p1: { battlefield: ["Hidden Lair"] } }))).toEqual(["C"]);
    expect(colors(scenario({ p1: { battlefield: ["Hidden Lair", "Plains"] } }))).toEqual(["B", "C", "U"]);
    let s = scenario({ p1: { hand: ["Hidden Lair"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Hidden Lair") });
    expect(colors(s)).toEqual(["B", "C", "U"]);
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Réponse qui choisit les objets (ou joueurs) voulus quand ils font partie des options. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const castable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Une carte de ce nom est en exil. */
  const exiled = (s: S, name: string) =>
    Object.values(s.objects).some((o) => o?.zone === "exile" && s.defs[o.defId]?.name === name);
  /** p1 déclare ces attaquants contre p2. */
  const attack = (s: S, ids: string[]) => {
    const at = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(at, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  describe("Marvel Super Heroes, lot A — blanc", () => {
    it("Agent 13, Sharon Carter : une créature qui attaque seule fait enquêter, pas deux attaquants", () => {
      let s = scenario({ p1: { battlefield: ["Agent 13, Sharon Carter", "Bear Cub", "Savannah Lions"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const alone = settle(attack(s, [bear]));
      expect(idsOf(alone, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = settle(attack(s, [bear, idOf(s, "p1", "battlefield", "Savannah Lions")]));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
    });

    it("Agents of S.H.I.E.L.D. : la créature qui attaque seule gagne +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Agents of S.H.I.E.L.D.", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [bear]));
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Agent Phil Coulson : {T} met un marqueur +1/+1 sur chacun de vos autres Héros seulement", () => {
      let s = scenario({
        p1: { battlefield: ["Agent Phil Coulson", "Agents of S.H.I.E.L.D.", "Bear Cub"] },
        p2: { battlefield: ["Hero in Training"] },
      });
      const coulson = idOf(s, "p1", "battlefield", "Agent Phil Coulson");
      s = settle(activate(s, "p1", coulson));
      expect(s.objects[idOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[coulson]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p2", "battlefield", "Hero in Training")]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Invisible Woman : des marqueurs sur plusieurs autres Héros donnent un seul Mur 0/4 défenseur", () => {
      let s = scenario({
        p1: {
          battlefield: ["Invisible Woman, Sue Storm", "Agent Phil Coulson", "Agents of S.H.I.E.L.D.", "Hero in Training"],
        },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Agent Phil Coulson")), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      const walls = idsOf(s, "p1", "battlefield", "Wall");
      expect(walls).toHaveLength(1);
      expect(pt(s, walls[0] as string)).toEqual([0, 4]);
      expect(chars(s, walls[0] as string).keywords).toContain("defender");
    });

    it("Avengers Assemble! : vos Héros ont +2/+2 ; à l'étape de fin, piochez si un Héros a attaqué", () => {
      let s = scenario({
        p1: { battlefield: ["Avengers Assemble!", "Agents of S.H.I.E.L.D.", "Bear Cub"] },
        p2: { battlefield: ["Agents of S.H.I.E.L.D."] },
      });
      const agents = idOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.");
      expect(pt(s, agents)).toEqual([4, 6]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Agents of S.H.I.E.L.D."))).toEqual([2, 4]);
      const hand = s.players.p1?.hand.length ?? 0;
      const noAttack = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(noAttack.players.p1?.hand.length).toBe(hand);
      s = attack(s, [agents]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Avengers Assemble! : un Héros arrivé sous votre contrôle ce tour-ci suffit", () => {
      let s = scenario({ p1: { battlefield: ["Avengers Assemble!", ...lands("Plains", 3)], hand: ["Hero in Training"] } });
      s = settle(cast(s, "p1", "Hero in Training"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Borough Backup : deux Héros 3/2 blancs avec la vigilance", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Borough Backup"] } });
      s = settle(cast(s, "p1", "Borough Backup"));
      const heroes = idsOf(s, "p1", "battlefield", "Hero");
      expect(heroes).toHaveLength(2);
      const c = chars(s, heroes[0] as string);
      expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([3, 2, ["W"], ["Hero"]]);
      expect(c.keywords).toContain("vigilance");
    });

    it("Brave Brawler : montée en puissance, deux marqueurs +1/+1, une seule fois", () => {
      let s = scenario({ p1: { battlefield: ["Brave Brawler", ...lands("Plains", 10)] } });
      const brawler = idOf(s, "p1", "battlefield", "Brave Brawler");
      s = settle(activate(s, "p1", brawler));
      expect(s.objects[brawler]?.counters["+1/+1"]).toBe(2);
      expect(ability(s, "p1", brawler)).toBeUndefined();
    });

    it("Captain America, Wings of Freedom : en attaquant, vos autres Héros gagnent +X/+X (X : son endurance)", () => {
      let s = scenario({
        p1: { battlefield: ["Captain America, Wings of Freedom", "Hero in Training", "Bear Cub"] },
      });
      const cap = idOf(s, "p1", "battlefield", "Captain America, Wings of Freedom");
      s = settle(attack(s, [cap]));
      expect(pt(s, idOf(s, "p1", "battlefield", "Hero in Training"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, cap)).toEqual([3, 1]);
    });

    it("Captain Mar-Vell : vos sorts ont le flash seulement si un adversaire a lancé un sort ce tour-ci", () => {
      const setup = (marvell: boolean) =>
        scenario({
          p1: { battlefield: [...(marvell ? ["Captain Mar-Vell, Space-Born"] : []), "Forest", "Forest"], hand: ["Bear Cub"] },
          p2: { battlefield: ["Island"], hand: ["Opt"] },
          active: "p2",
        });
      for (const marvell of [true, false]) {
        let s = setup(marvell);
        s = act(cast(s, "p2", "Opt"), "p2", { type: "pass" });
        expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(marvell);
      }
    });

    it("Colleen Wing : un sort qui cible une de vos créatures lui donne un marqueur et un regard 1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Colleen Wing, Street Samurai", "Bear Cub", "Forest", "Forest"],
          hand: ["Giant Growth", "Giant Growth"],
        },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const colleen = idOf(s, "p1", "battlefield", "Colleen Wing, Street Samurai");
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(s.objects[colleen]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
      expect(s.objects[colleen]?.counters["+1/+1"]).toBe(1);
    });

    it("Mockingbird : un sort qui cible une de vos créatures lui donne un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Mockingbird, Ace Agent", "Forest"], hand: ["Giant Growth"] } });
      const bird = idOf(s, "p1", "battlefield", "Mockingbird, Ace Agent");
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [bird] } }));
      expect(s.objects[bird]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, bird)).toEqual([6, 6]);
    });

    it("Crowd of True Believers : la créature qui attaque seule gagne +1/+0, vous gagnez 1 PV", () => {
      let s = scenario({ p1: { battlefield: ["Crowd of True Believers", "Bear Cub", "Savannah Lions"] } });
      const crowd = idOf(s, "p1", "battlefield", "Crowd of True Believers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(ability(s, "p1", crowd)).toBeUndefined();
      const two = attack(s, [bear, idOf(s, "p1", "battlefield", "Savannah Lions")]);
      expect(ability(two, "p1", crowd)).toBeUndefined();
      s = attack(s, [bear]);
      s = settle(activate(s, "p1", crowd, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Helicarrier Strike : 2 blessures à une créature attaquante, 4 avec le travail d'équipe", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Helicarrier Strike"] },
          p2: { battlefield: ["Serra Angel", "Agents of S.H.I.E.L.D."] },
          active: "p2",
        });
      const declare = (s0: S) => {
        const at = advanceUntil(s0, (x) => x.pending?.kind === "declareAttackers");
        const angel = idOf(at, "p2", "battlefield", "Serra Angel");
        const s = act(at, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
        return { s: act(s, "p2", { type: "pass" }), angel };
      };
      let { s, angel } = declare(setup());
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Helicarrier Strike"))).toBe(true);
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Helicarrier Strike"), targets: { t: [angel] } });
      s = act(act(s, "p1", { type: "pass" }), "p2", { type: "pass" });
      expect(s.objects[angel]?.damage).toBe(2);
      ({ s, angel } = declare(setup()));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Helicarrier Strike"),
        targets: { t: [angel] },
        kicked: true,
        tap: [bear],
      });
      expect(s.objects[bear]?.tapped).toBe(true);
      s = act(act(s, "p1", { type: "pass" }), "p2", { type: "pass" });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Hero in Training : piochez une carte, et 2 PV seulement si vous contrôlez un autre Héros", () => {
      for (const other of [true, false]) {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 3), ...(other ? ["Agents of S.H.I.E.L.D."] : ["Bear Cub"])],
            hand: ["Hero in Training"],
          },
        });
        s = settle(cast(s, "p1", "Hero in Training"));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.life).toBe(other ? 22 : 20);
      }
    });

    it("Luke Cage : en attaquant seul, +2/+0 et l'indestructible ; rien s'il n'est pas seul", () => {
      let s = scenario({ p1: { battlefield: ["Luke Cage, Power Man", "Bear Cub"] } });
      const luke = idOf(s, "p1", "battlefield", "Luke Cage, Power Man");
      const both = settle(attack(s, [luke, idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(pt(both, luke)).toEqual([2, 5]);
      s = settle(attack(s, [luke]));
      expect(pt(s, luke)).toEqual([4, 5]);
      expect(chars(s, luke).keywords).toContain("indestructible");
    });

    it("Monica Rambeau : {2}{R}{W}{W} la transforme en Photon, qui renforce vos autres créatures à chaque sort non-créature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Monica Rambeau // Photon, Living Light", "Bear Cub", ...lands("Plains", 4), "Mountain", "Mountain"],
          hand: ["Giant Growth"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const monica = idOf(s, "p1", "battlefield", "Monica Rambeau // Photon, Living Light");
      s = settle(activate(s, "p1", monica, {}, /Transformez/));
      expect(chars(s, monica).name).toBe("Photon, Living Light");
      expect(chars(s, monica).keywords).toContain("hexproof");
      expect(pt(s, monica)).toEqual([4, 4]);
    });

    it("Photon, Living Light : chaque sort non-créature met un marqueur sur chacune de vos autres créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Monica Rambeau // Photon, Living Light", "Bear Cub", ...lands("Plains", 3), ...lands("Mountain", 3)],
          hand: ["Burst Lightning"],
        },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const monica = idOf(s, "p1", "battlefield", "Monica Rambeau // Photon, Living Light");
      s = settle(activate(s, "p1", monica, {}, /Transformez/));
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [elves] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[monica]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Murdock's Crusade : un mode au choix ; les deux seulement avec le travail d'équipe", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Plains", "Plains", "Serra Angel"], hand: ["Murdock's Crusade"] },
          p2: { battlefield: ["Agents of S.H.I.E.L.D.", "Omniscience", "Bear Cub"] },
        });
      let s = setup();
      const agents = idOf(s, "p2", "battlefield", "Agents of S.H.I.E.L.D.");
      const omni = idOf(s, "p2", "battlefield", "Omniscience");
      const card = idOf(s, "p1", "hand", "Murdock's Crusade");
      // Les deux modes sans le travail d'équipe : refusé.
      expect(() => act(s, "p1", { type: "cast", card, mode: 2, targets: { t: [agents], u: [omni] } })).toThrow();
      // Une créature d'endurance 3 ou moins n'est pas une cible.
      expect(() =>
        act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      const one = settle(act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [agents] } }));
      expect(exiled(one, "Agents of S.H.I.E.L.D.")).toBe(true);
      expect(idsOf(one, "p2", "battlefield", "Omniscience")).toHaveLength(1);
      s = setup();
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card, mode: 2, targets: { t: [agents], u: [omni] }, kicked: true, tap: [angel] }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(exiled(s, "Agents of S.H.I.E.L.D.")).toBe(true);
      expect(exiled(s, "Omniscience")).toBe(true);
    });

    it("Nick Fury : montée en puissance, deux marqueurs puis un Héros des sept cartes du dessus sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: ["Nick Fury, Agent of S.H.I.E.L.D.", "Plains", "Island", "Swamp", "Mountain", "Forest"],
          library: ["Opt", "Opt", "Agents of S.H.I.E.L.D.", "Opt", "Opt", "Opt", "Opt", "Forest"],
        },
      });
      const fury = idOf(s, "p1", "battlefield", "Nick Fury, Agent of S.H.I.E.L.D.");
      s = settle(activate(s, "p1", fury));
      expect(s.objects[fury]?.counters["+1/+1"]).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      // Le reste au-dessous : la carte du dessus est désormais la Forêt (huitième).
      expect(s.defs[s.objects[s.players.p1?.library[0] as string]?.defId ?? ""]?.name).toBe("Forest");
    });

    it("Night Nurse : renvoie en main une carte de permanent mise dans votre cimetière ce tour-ci, pas une plus ancienne", () => {
      let s = scenario({
        p1: {
          battlefield: ["Plains", "Plains", "Bear Cub"],
          hand: ["Night Nurse, Healer of Heroes"],
          graveyard: ["Llanowar Elves"],
        },
        p2: { battlefield: [...lands("Mountain", 1)], hand: ["Burst Lightning"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Burst Lightning", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const oldElves = idOf(s, "p1", "graveyard", "Llanowar Elves");
      // Mise en scène : les Elfes sont au cimetière depuis un tour précédent.
      (s.objects[oldElves] as { controlledSince: number }).controlledSince = s.turn.number - 1;
      let offered: ChoiceValue[] = [];
      s = settle(cast(s, "p1", "Night Nurse, Healer of Heroes"), (req) => {
        if (req.type === "pick") offered = req.options;
        return undefined;
      });
      expect(offered).not.toContain(oldElves);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Okoye : deux Soldats 1/1 ; vos jetons de créature attaquants ont l'initiative, pas les autres", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Okoye, Dora Milaje Leader"] } });
      s = settle(cast(s, "p1", "Okoye, Dora Milaje Leader"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect(pt(s, soldiers[0] as string)).toEqual([1, 1]);
      expect(chars(s, soldiers[0] as string).keywords).not.toContain("firstStrike");
      // Au tour suivant de p1, un Soldat et l'Ours attaquent.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.pending?.kind === "declareAttackers");
      const [attacker, idle] = soldiers as [string, string];
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", {
          type: "declareAttackers",
          attackers: [
            { id: attacker, defender: "p2" },
            { id: bear, defender: "p2" },
          ],
        }),
      );
      expect(chars(s, attacker).keywords).toContain("firstStrike");
      expect(chars(s, idle).keywords).not.toContain("firstStrike");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("Origin of the Avengers : I regard 2 ; II un Héros de votre main de valeur de mana 3 ou moins, sinon piochez ; III +1/+1 partout", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Origin of the Avengers", counters: { lore: 1 } }, "Bear Cub"],
          hand: ["Agents of S.H.I.E.L.D."],
        },
        active: "p2",
        step: "end",
      });
      s = settle(
        advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"),
        picking([idOf(s, "p1", "hand", "Agents of S.H.I.E.L.D.")]),
      );
      expect(idsOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")).toHaveLength(1);
      // Pas de carte piochée en plus de la pioche du tour.
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
      s = settle(s);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Origin of the Avengers")).toHaveLength(1);
    });

    it("Origin of the Avengers : II sans Héros à mettre en jeu, piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Origin of the Avengers", counters: { lore: 1 } }], hand: ["Serra Angel"] },
        active: "p2",
        step: "end",
      });
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
      // La Serra Angel, la pioche du tour et la carte du chapitre II.
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Panther Pounce : le joueur ciblé enquête ; la créature gagne +1/+0 et le vol, et se dégage", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", { name: "Bear Cub", tapped: true }], hand: ["Panther Pounce"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Panther Pounce", { targets: { p: ["p2"], t: [bear] } }));
      expect(idsOf(s, "p2", "battlefield", "Clue")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Patriot : {2}, {T} : une autre de vos créatures gagne +2/+0 et la défense talismanique", () => {
      let s = scenario({ p1: { battlefield: ["Patriot, Shield Wielder", "Bear Cub", "Plains", "Plains"] } });
      const patriot = idOf(s, "p1", "battlefield", "Patriot, Shield Wielder");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(ability(s, "p1", patriot)?.targets[0]?.legal).toEqual([bear]);
      s = settle(activate(s, "p1", patriot, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(chars(s, bear).keywords).toContain("hexproof");
    });

    it("Quake : chaque sort non-créature engage une créature ou un terrain ciblé", () => {
      let s = scenario({
        p1: { battlefield: ["Quake, Agent of S.H.I.E.L.D.", "Forest", "Forest"], hand: ["Giant Growth", "Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const quake = idOf(s, "p1", "battlefield", "Quake, Agent of S.H.I.E.L.D.");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[angel]?.tapped).toBe(false);
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [quake] } }), picking([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Raft Security Officer : {1} pour une créature de force 3 ou moins, {2} sinon", () => {
      let s = scenario({
        p1: { battlefield: ["Raft Security Officer", "Plains"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const officer = idOf(s, "p1", "battlefield", "Raft Security Officer");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Un seul terrain : la Serra Angel (force 4) demande {2}.
      expect(() => activate(s, "p1", officer, { targets: { t: [angel] } }, /^Engage une créature$/)).toThrow();
      const legal = ability(s, "p1", officer, /force 3/)?.targets[0]?.legal ?? [];
      expect(legal).toContain(bear);
      expect(legal).not.toContain(angel);
      s = settle(activate(s, "p1", officer, { targets: { t: [bear] } }, /force 3/));
      expect(s.objects[bear]?.tapped).toBe(true);
    });

    it("Red Guardian : détruit une créature adverse qui a infligé des blessures ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3)], hand: ["Red Guardian, Super-Soldier"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        active: "p2",
      });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.turn.step === "endCombat" && x.pending?.player === "p1");
      expect(s.players.p1?.life).toBe(16);
      s = settle(cast(s, "p1", "Red Guardian, Super-Soldier"), picking([angel]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("The Sentry : l'adversaire ciblé crée The Void, Horreur Méchant légendaire 5/5 qui attaque à chaque combat", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["The Sentry, Golden Guardian"] } });
      s = settle(cast(s, "p1", "The Sentry, Golden Guardian"));
      const voidToken = idOf(s, "p2", "battlefield", "The Void");
      const c = chars(s, voidToken);
      expect([c.power, c.toughness, c.colors]).toEqual([5, 5, ["B"]]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Horror", "Villain"]));
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "indestructible", "mustAttack"]));
    });

    it("S.H.I.E.L.D. Spy Kit : +1/+1 ; la créature équipée qui attaque seule se dégage (et regard 1)", () => {
      let s = scenario({ p1: { battlefield: ["S.H.I.E.L.D. Spy Kit", "Bear Cub", "Plains"] } });
      const kit = idOf(s, "p1", "battlefield", "S.H.I.E.L.D. Spy Kit");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", kit, { targets: { t: [bear] } }, /Équiper/));
      expect(pt(s, bear)).toEqual([3, 3]);
      s = attack(s, [bear]);
      expect(s.objects[bear]?.tapped).toBe(true);
      s = settle(s);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Super Villain Lockup : exile une créature adverse engagée jusqu'à ce qu'il quitte le champ de bataille", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Super Villain Lockup"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
      });
      // Seule cible légale : la Serra Angel engagée (pas l'Ours dégagé).
      s = settle(cast(s, "p1", "Super Villain Lockup"));
      expect(exiled(s, "Serra Angel")).toBe(true);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Super-Soldier Serum : +2/+2, initiative, vigilance, Soldat légendaire ; en attaquant, attache vos Équipements", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Plains", "Bear Cub", "Goldvein Pick", "Swiftfoot Boots"], hand: ["Super-Soldier Serum"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super-Soldier Serum", { targets: { enchant: [bear] } }));
      const c = chars(s, bear);
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect(c.keywords).toEqual(expect.arrayContaining(["firstStrike", "vigilance"]));
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Soldier"]));
      const pick = idOf(s, "p1", "battlefield", "Goldvein Pick");
      const boots = idOf(s, "p1", "battlefield", "Swiftfoot Boots");
      s = settle(attack(s, [bear]), picking([pick, boots]));
      expect(s.objects[pick]?.attachedTo).toBe(bear);
      expect(s.objects[boots]?.attachedTo).toBe(bear);
      expect(chars(s, bear).keywords).toContain("hexproof");
    });

    it("Wakandan Drone Flock : regard 2 en arrivant", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Wakandan Drone Flock"], library: ["Opt", "Opt", "Forest"] },
      });
      let scried = false;
      s = settle(cast(s, "p1", "Wakandan Drone Flock"), (req) => {
        if (req.type === "pick" || req.type === "order") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Wakandan Drone Flock")).toHaveLength(1);
    });

    it("White Widow : un marqueur sur jusqu'à deux créatures, ou une carte d'artefact ou d'enchantement du cimetière en main", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["White Widow, Free Agent"], graveyard: ["Pacifism"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
      let s = setup();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "White Widow, Free Agent"), (req) => {
        if (req.type === "pick" && req.intent === "triggerMode") return ["0"];
        return picking([bear, elves])(req, "p1", s);
      });
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
      s = setup();
      s = settle(cast(s, "p1", "White Widow, Free Agent"), (req) =>
        req.type === "pick" && req.intent === "triggerMode" ? ["1"] : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Pacifism")).toHaveLength(1);
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
  /** Réponse à un choix, avec l'état courant (les cartes changent d'identifiant en changeant de zone). */
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Réponse qui choisit les objets (ou joueurs) voulus quand ils font partie des options. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Réponse qui choisit, parmi les options, les cartes portant ces noms. */
  const pickingNamed =
    (names: string[]): Answer =>
    (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => names.includes(nameOf(cur, String(o)) ?? ""));
      return picked.length > 0 ? picked : undefined;
    };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const castable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
  /** Capacité activable de `source` dont le libellé correspond (la première sinon). */
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plusOne = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  /** Va jusqu'à la déclaration des attaquants de p1 et attaque p2 avec ces créatures. */
  const attackWith = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  describe("Marvel Super Heroes, lot A — bleu", () => {
    describe("Aerial Doombot", () => {
      it("montée en puissance {5}{U} : trois marqueurs +1/+1, une seule fois", () => {
        let s = scenario({ p1: { battlefield: ["Aerial Doombot", ...lands("Island", 12)] } });
        const bot = idOf(s, "p1", "battlefield", "Aerial Doombot");
        s = settle(activate(s, "p1", bot));
        expect(pt(s, bot)).toEqual([4, 4]);
        expect(ability(s, "p1", bot)).toBeUndefined();
      });

      it("arrivé ce tour-ci, la montée en puissance coûte {5}", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Aerial Doombot"] } });
        s = settle(cast(s, "p1", "Aerial Doombot"));
        const bot = idOf(s, "p1", "battlefield", "Aerial Doombot");
        s = settle(activate(s, "p1", bot));
        expect(plusOne(s, bot)).toBe(3);
      });
    });

    it("A.I.M. Scientists : complote en arrivant (marqueur seulement pour une carte non-terrain défaussée)", () => {
      const run = (top: string) => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["A.I.M. Scientists"], library: [top, "Island"] } });
        s = settle(cast(s, "p1", "A.I.M. Scientists"));
        return { s, id: idOf(s, "p1", "battlefield", "A.I.M. Scientists") };
      };
      const opt = run("Opt");
      expect(idsOf(opt.s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(pt(opt.s, opt.id)).toEqual([4, 4]);
      const land = run("Island");
      expect(land.s.players.p1?.graveyard).toHaveLength(1);
      expect(pt(land.s, land.id)).toEqual([3, 3]);
    });

    describe("Thirst for Knowledge et Atlantean Cavalry", () => {
      it("piochez trois cartes, défaussez une carte d'artefact ; la Cavalerie reçoit un marqueur à la deuxième pioche", () => {
        let s = scenario({
          p1: {
            battlefield: ["Atlantean Cavalry", ...lands("Island", 3)],
            hand: ["Thirst for Knowledge"],
            library: ["Futurist Forge", "Opt", "Island", "Island"],
          },
        });
        s = settle(cast(s, "p1", "Thirst for Knowledge"), pickingNamed(["Futurist Forge"]));
        expect(handNames(s).sort()).toEqual(["Island", "Opt"]);
        expect(idsOf(s, "p1", "graveyard", "Futurist Forge")).toHaveLength(1);
        expect(pt(s, idOf(s, "p1", "battlefield", "Atlantean Cavalry"))).toEqual([4, 3]);
      });

      it("sans carte d'artefact défaussée, deux cartes", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Thirst for Knowledge"], library: ["Futurist Forge", "Opt", "Island"] },
        });
        s = settle(cast(s, "p1", "Thirst for Knowledge"), pickingNamed(["Opt"]));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(3);
      });
    });

    describe("Atlantis Attacks", () => {
      it("un mode : le joueur ciblé crée un Léviathan bleu 6/5 avec la défense talismanique", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Atlantis Attacks"] } });
        s = settle(cast(s, "p1", "Atlantis Attacks", { mode: 0, targets: { p: ["p2"] } }));
        const lev = idOf(s, "p2", "battlefield", "Leviathan");
        expect(pt(s, lev)).toEqual([6, 5]);
        expect(chars(s, lev).keywords).toContain("hexproof");
        expect(chars(s, lev).colors).toEqual(["U"]);
      });

      it("les deux modes demandent le travail d'équipe (créatures de force totale 4 engagées)", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 7), "Shivan Dragon"], hand: ["Atlantis Attacks"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
        expect(() => cast(s, "p1", "Atlantis Attacks", { mode: 2, targets: { p: ["p1"], b: [bear] } })).toThrow();
        s = settle(
          cast(s, "p1", "Atlantis Attacks", { mode: 2, kicked: true, tap: [dragon], targets: { p: ["p1"], b: [bear, angel] } }),
        );
        expect(s.objects[dragon]?.tapped).toBe(true);
        expect(idsOf(s, "p1", "battlefield", "Leviathan")).toHaveLength(1);
        expect(handNames(s, "p2").sort()).toEqual(["Bear Cub", "Serra Angel"]);
      });
    });

    it("Attuma : les autres Ondins ont +1/+1 ; des Ondins attaquent, piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Attuma, Atlantean Warlord", "Brineborn Cutthroat"] } });
      const attuma = idOf(s, "p1", "battlefield", "Attuma, Atlantean Warlord");
      const merfolk = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      expect(pt(s, attuma)).toEqual([3, 4]);
      expect(pt(s, merfolk)).toEqual([3, 2]);
      s = attackWith(s, [merfolk]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Bold Biochemist : montée en puissance, un marqueur +1/+1 et deux cartes", () => {
      let s = scenario({ p1: { battlefield: ["Bold Biochemist", ...lands("Island", 6)] } });
      const bio = idOf(s, "p1", "battlefield", "Bold Biochemist");
      s = settle(activate(s, "p1", bio));
      expect(pt(s, bio)).toEqual([2, 4]);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    describe("Bruce Banner // The Incredible Hulk", () => {
      it("{X}{X}, {T} : piochez X cartes", () => {
        let s = scenario({ p1: { battlefield: ["Bruce Banner // The Incredible Hulk", ...lands("Island", 4)] } });
        const bruce = idOf(s, "p1", "battlefield", "Bruce Banner // The Incredible Hulk");
        s = settle(activate(s, "p1", bruce, { x: 2 }, /Piochez/));
        expect(s.players.p1?.hand).toHaveLength(2);
        expect(s.objects[bruce]?.tapped).toBe(true);
      });

      it("Hulk : subit des blessures en attaquant, un marqueur +1/+1, il se dégage et un combat supplémentaire suit", () => {
        let s = scenario({
          p1: {
            battlefield: [
              "Bruce Banner // The Incredible Hulk",
              ...lands("Mountain", 2),
              ...lands("Forest", 2),
              ...lands("Island", 2),
            ],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
        const hulk = idOf(s, "p1", "battlefield", "Bruce Banner // The Incredible Hulk");
        s = settle(activate(s, "p1", hulk, {}, /Transformez/));
        expect(chars(s, hulk).name).toBe("The Incredible Hulk");
        expect(pt(s, hulk)).toEqual([8, 8]);
        expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
        s = attackWith(s, [hulk]);
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: hulk }] });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        expect(plusOne(s, hulk)).toBe(1);
        expect(s.objects[hulk]?.tapped).toBe(false);
        expect(s.turn.step).toBe("declareAttackers");
        // Piétinement : 4 blessures à l'Ange, 4 au joueur.
        expect(s.players.p2?.life).toBe(16);
      });
    });

    describe("Depower", () => {
      it("coûte {2} de moins en ciblant une créature attaquante : -4/-0 et piochez une carte", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Island"], hand: ["Depower"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
        s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        s = settle(cast(s, "p1", "Depower", { targets: { t: [angel] } }));
        expect(chars(s, angel).power).toBe(0);
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("sans attaquant ciblé, il coûte {2}{U}", () => {
        const s = scenario({ p1: { battlefield: ["Island"], hand: ["Depower"] }, p2: { battlefield: ["Serra Angel"] } });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "Depower", { targets: { t: [angel] } })).toThrow();
      });
    });

    it("Echo : {1}, {T} : copie une capacité déclenchée que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Echo, Perceptive Prodigy", ...lands("Island", 4)], hand: ["S.H.I.E.L.D. Deployment Drone"] },
      });
      const echo = idOf(s, "p1", "battlefield", "Echo, Perceptive Prodigy");
      s = cast(s, "p1", "S.H.I.E.L.D. Deployment Drone");
      s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability"));
      const trigger = s.stack.find((i) => i.kind === "ability")?.id as string;
      s = settle(activate(s, "p1", echo, { targets: { t: [trigger] } }));
      expect(idsOf(s, "p1", "battlefield", "Soldier")).toHaveLength(2);
    });

    it("Falcon : crée Redwing, Oiseau Éclaireur légendaire bleu 1/1 volant qui surveille en attaquant", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Falcon, Winged Wonder"] } });
      s = settle(cast(s, "p1", "Falcon, Winged Wonder"));
      const red = idOf(s, "p1", "battlefield", "Redwing");
      const c = chars(s, red);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Bird", "Scout"]));
      expect(c.keywords).toContain("flying");
      expect(c.abilities.some((a) => a.kind === "triggered" && a.trigger.on === "attacks")).toBe(true);
    });

    it("Falcon's Wing Harness : s'attache en arrivant ; +1/+1, vol et garde {1}", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 2)], hand: ["Falcon's Wing Harness"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Falcon's Wing Harness"), picking([bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Falcon's Wing Harness")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    });

    it("Frozen in Ice : engage la créature, qui perd ses capacités et ne se dégage plus", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Frozen in Ice"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Frozen in Ice", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(chars(s, angel).keywords).not.toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Futurist Forge : piochez en arrivant ; {3}{U}, sacrifiez-le : piochez deux cartes", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Futurist Forge"] } });
      s = settle(cast(s, "p1", "Futurist Forge"));
      expect(s.players.p1?.hand).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Futurist Forge")));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(idsOf(s, "p1", "graveyard", "Futurist Forge")).toHaveLength(1);
    });

    it("Giant-Sized Flying Ant : engage ou dégage un permanent non-terrain", () => {
      const run = (mode: number, tapped: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Island", 4), hand: ["Giant-Sized Flying Ant"] },
          p2: { battlefield: [{ name: "Serra Angel", tapped }] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Giant-Sized Flying Ant"), (req) => {
          if (req.type === "pick" && req.options.includes(angel)) return [angel];
          if (req.type === "pick" && req.intent === "triggerMode") return [String(mode)];
          return undefined;
        });
        return s.objects[angel]?.tapped;
      };
      expect(run(0, false)).toBe(true);
      expect(run(1, true)).toBe(false);
    });

    it("Hydraulic Helper : son mana ne paie pas un sort non-artefact", () => {
      const s = scenario({ p1: { battlefield: ["Hydraulic Helper", "Plains"], hand: ["Opt", "Futurist Forge"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Opt"))).toBe(false);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Futurist Forge"))).toBe(true);
    });

    it("I Am Iron Man : un artefact devient une créature-artefact 4/4 volante jusqu'à la fin du tour ; piochez", () => {
      let s = scenario({ p1: { battlefield: ["Futurist Forge", ...lands("Island", 3)], hand: ["I Am Iron Man"] } });
      const forge = idOf(s, "p1", "battlefield", "Futurist Forge");
      s = settle(cast(s, "p1", "I Am Iron Man", { targets: { t: [forge] } }));
      expect(chars(s, forge).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(pt(s, forge)).toEqual([4, 4]);
      expect(chars(s, forge).keywords).toContain("flying");
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, forge).types).not.toContain("Creature");
    });

    it("Iron Lad : {T} : révélez la carte du dessus, piochez si c'est un artefact", () => {
      const run = (top: string) => {
        let s = scenario({ p1: { battlefield: ["Iron Lad, Diverging Destiny"], library: [top, "Island"] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Iron Lad, Diverging Destiny")));
        return handNames(s);
      };
      expect(run("Futurist Forge")).toEqual(["Futurist Forge"]);
      expect(run("Opt")).toEqual([]);
    });

    describe("Justice, Vance Astrovik", () => {
      it("renvoie un de vos permanents : un marqueur +1/+1 sur Justice", () => {
        let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Justice, Vance Astrovik"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Justice, Vance Astrovik"), picking([bear]));
        expect(handNames(s)).toEqual(["Bear Cub"]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Justice, Vance Astrovik"))).toEqual([3, 3]);
      });

      it("un permanent adverse renvoyé ne donne pas de marqueur", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Justice, Vance Astrovik"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Justice, Vance Astrovik"), picking([bear]));
        expect(handNames(s, "p2")).toEqual(["Bear Cub"]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Justice, Vance Astrovik"))).toEqual([2, 2]);
      });
    });

    it("Kang the Conqueror : montée en puissance, un marqueur +1/+1 et un tour supplémentaire", () => {
      let s = scenario({ p1: { battlefield: ["Kang the Conqueror", ...lands("Island", 8)] } });
      const kang = idOf(s, "p1", "battlefield", "Kang the Conqueror");
      s = settle(activate(s, "p1", kang));
      expect(pt(s, kang)).toEqual([5, 6]);
      s = advanceUntil(s, (x) => x.turn.number === 4);
      expect(s.turn.active).toBe("p1");
    });

    it("Mister Fantastic : des jetons arrivent sous votre contrôle, vous pouvez piocher", () => {
      let s = scenario({
        p1: { battlefield: ["Mister Fantastic, Reed Richards", ...lands("Island", 3)], hand: ["S.H.I.E.L.D. Deployment Drone"] },
      });
      s = settle(cast(s, "p1", "S.H.I.E.L.D. Deployment Drone"), (req) =>
        req.type === "pick" && req.options.includes("yes") ? ["yes"] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Soldier")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Ms. Marvel et Pym Particles : un sort qui cible votre créature fait piocher ; force de base = cartes en main", () => {
      let s = scenario({
        p1: { battlefield: ["Ms. Marvel, Kamala Khan", "Island"], hand: ["Pym Particles", "Island", "Island"] },
      });
      const ms = idOf(s, "p1", "battlefield", "Ms. Marvel, Kamala Khan");
      expect(pt(s, ms)).toEqual([1, 4]);
      s = settle(cast(s, "p1", "Pym Particles", { targets: { t: [ms] } }));
      // Deux cartes en main, une piochée par Ms. Marvel, une par Pym Particles.
      expect(s.players.p1?.hand).toHaveLength(4);
      expect(pt(s, ms)).toEqual([4, 4]);
      expect(chars(s, ms).keywords).toEqual(expect.arrayContaining(["unblockable", "vigilance"]));
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
      expect(pt(s, ms)).toEqual([3, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, ms)).toEqual([1, 4]);
    });

    it("Multiversal Incursion : une copie non légendaire de chacune de vos créatures qui ne sont pas des jetons", () => {
      let s = scenario({
        p1: { battlefield: ["Kang the Conqueror", "Bear Cub", ...lands("Island", 7)], hand: ["Multiversal Incursion"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Multiversal Incursion"));
      const kangs = idsOf(s, "p1", "battlefield", "Kang the Conqueror");
      expect(kangs).toHaveLength(2);
      const copy = kangs.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    });

    describe("Rewrite History", () => {
      it("vos créatures deviennent engagées : piochez, défaussez et un marqueur de plan", () => {
        let s = scenario({ p1: { battlefield: ["Rewrite History", "Bear Cub"], library: ["Opt", "Island"] } });
        const plan = idOf(s, "p1", "battlefield", "Rewrite History");
        s = attackWith(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = settle(s);
        expect(s.objects[plan]?.counters.plan).toBe(1);
        expect(s.players.p1?.graveyard).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(0);
      });

      it("au quatrième marqueur : sacrifiez-le, reprenez jusqu'à deux éphémères ou rituels", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Rewrite History", counters: { plan: 3 } }, "Bear Cub"],
            graveyard: ["Opt", "Lightning Strike", "Bear Cub"],
            library: ["Island", "Island"],
          },
        });
        s = attackWith(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = settle(s, pickingNamed(["Opt", "Lightning Strike"]));
        expect(idsOf(s, "p1", "graveyard", "Rewrite History")).toHaveLength(1);
        expect(handNames(s).sort()).toEqual(["Lightning Strike", "Opt"]);
      });
    });

    it("Secret Invasion : exile une autre créature ; la créature enchantée en devient une copie, avec la garde {2}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Secret Invasion"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Secret Invasion", { targets: { enchant: [bear] } }), picking([angel]));
      expect(s.objects[angel]?.zone ?? "exile").not.toBe("battlefield");
      expect(chars(s, bear).name).toBe("Serra Angel");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    });

    it("S.H.I.E.L.D. Flying Car : exile une de vos créatures, qui revient à la prochaine étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["S.H.I.E.L.D. Flying Car"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "S.H.I.E.L.D. Flying Car"), picking([bear]));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    describe("Shuri, Wakandan Inventor", () => {
      it("vos sorts d'artefact coûtent {1} de moins", () => {
        const s = scenario({ p1: { battlefield: ["Shuri, Wakandan Inventor", "Island"], hand: ["Futurist Forge", "Opt"] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Futurist Forge"))).toBe(true);
      });

      it("un artefact devient une copie non légendaire d'un second artefact jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["Shuri, Wakandan Inventor", "Futurist Forge", "Iron Lad, Diverging Destiny", "Island"] },
        });
        const forge = idOf(s, "p1", "battlefield", "Futurist Forge");
        const lad = idOf(s, "p1", "battlefield", "Iron Lad, Diverging Destiny");
        s = settle(
          activate(s, "p1", idOf(s, "p1", "battlefield", "Shuri, Wakandan Inventor"), { targets: { a: [forge], b: [lad] } }),
        );
        expect(chars(s, forge).name).toBe("Iron Lad, Diverging Destiny");
        expect(chars(s, forge).supertypes).not.toContain("Legendary");
        expect(s.objects[lad]?.zone).toBe("battlefield");
        expect(s.objects[forge]?.zone).toBe("battlefield");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, forge).name).toBe("Futurist Forge");
      });
    });

    it("Stature : imblocable avec une force de 1 ou moins ; montée en puissance de X marqueurs", () => {
      let s = scenario({ p1: { battlefield: ["Stature, Size Shifter", ...lands("Island", 4)] } });
      const st = idOf(s, "p1", "battlefield", "Stature, Size Shifter");
      expect(chars(s, st).keywords).toContain("unblockable");
      s = settle(activate(s, "p1", st, { x: 2 }));
      expect(pt(s, st)).toEqual([3, 3]);
      expect(chars(s, st).keywords).not.toContain("unblockable");
    });

    it("Super Intelligence : le contrôleur de la créature enchantée pioche à son entretien", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Super Intelligence"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Intelligence", { targets: { enchant: [bear] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.players.p2?.hand).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Super Suit : s'attache à une de vos créatures et la dégage ; +1/+2", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Island", 2)], hand: ["Super Suit"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Suit"), picking([bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Super Suit")]?.attachedTo).toBe(bear);
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(pt(s, bear)).toEqual([3, 4]);
    });

    describe("Tony Stark // The Invincible Iron Man", () => {
      it("{1}, {T} : une carte d'artefact parmi les quatre du dessus en main, le reste au-dessous", () => {
        let s = scenario({
          p1: {
            battlefield: ["Tony Stark // The Invincible Iron Man", "Island"],
            library: ["Island", "Futurist Forge", "Opt", "Island", "Lightning Strike"],
          },
        });
        s = settle(
          activate(s, "p1", idOf(s, "p1", "battlefield", "Tony Stark // The Invincible Iron Man"), {}, /Regardez/),
          pickingNamed(["Futurist Forge"]),
        );
        expect(handNames(s)).toEqual(["Futurist Forge"]);
        const lib = s.players.p1?.library ?? [];
        expect(nameOf(s, lib[0] as string)).toBe("Lightning Strike");
      });

      it("Iron Man : au début du combat, un artefact de votre main sur le champ de bataille ; un Équipement lui est attaché", () => {
        let s = scenario({
          p1: {
            battlefield: ["Tony Stark // The Invincible Iron Man", ...lands("Island", 5), "Mountain"],
            hand: ["Super Suit"],
          },
        });
        const tony = idOf(s, "p1", "battlefield", "Tony Stark // The Invincible Iron Man");
        s = settle(activate(s, "p1", tony, {}, /Transformez/));
        expect(chars(s, tony).name).toBe("The Invincible Iron Man");
        expect(chars(s, tony).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(chars(s, tony).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers", 200);
        const suit = idOf(s, "p1", "battlefield", "Super Suit");
        expect(s.objects[suit]?.attachedTo).toBe(tony);
        expect(pt(s, tony)).toEqual([6, 7]);
      });
    });

    it("Wiccan : un sort non-créature exile un autre permanent non-terrain, qui revient à l'étape de fin", () => {
      let s = scenario({
        p1: { battlefield: ["Wiccan, Rising Magician", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Opt"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Répond oui aux questions et choisit les objets voulus (par identifiant ou par nom) quand ils sont proposés. */
  const answering =
    (want: string[] = [], yes = true): Answer =>
    (req, _player, cur) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => want.includes(o) || want.includes(nameOf(cur, o) ?? ""));
      return picked.length > 0 ? picked.slice(0, Math.max(1, req.max)) : undefined;
    };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const castOption = (s: S, player: string, card: string) =>
    legalActions(s, player).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const setCounters = (s: S, id: string, kind: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters[kind] = n;
    s.version += 1;
  };
  /** Déclare les attaquants contre p2, puis résout les déclenchements d'attaque. */
  const attackWith = (s: S, ids: string[], answer?: Answer) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };

  describe("Marvel Super Heroes, lot A — noir", () => {
    it("Agents of HYDRA : en mourant, un jeton Méchant 2/1 noir avec la menace", () => {
      let s = scenario({ p1: { battlefield: ["Agents of HYDRA", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      const agents = idOf(s, "p1", "battlefield", "Agents of HYDRA");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [agents] } }));
      expect(idsOf(s, "p1", "graveyard", "Agents of HYDRA")).toHaveLength(1);
      const token = idOf(s, "p1", "battlefield", "Villain");
      const c = chars(s, token);
      expect([c.power, c.toughness]).toEqual([2, 1]);
      expect(c.colors).toEqual(["B"]);
      expect(c.subtypes).toContain("Villain");
      expect(c.keywords).toContain("menace");
    });

    it("Arnim Zola : {3}, {T} : un Méchant engagé, seulement avec deux cartes de créature au cimetière", () => {
      const one = scenario({ p1: { battlefield: ["Arnim Zola, Bio-Fanatic", ...lands("Swamp", 3)], graveyard: ["Bear Cub"] } });
      expect(ability(one, "p1", idOf(one, "p1", "battlefield", "Arnim Zola, Bio-Fanatic"))).toBeUndefined();
      let s = scenario({
        p1: { battlefield: ["Arnim Zola, Bio-Fanatic", ...lands("Swamp", 3)], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Arnim Zola, Bio-Fanatic")));
      expect(s.objects[idOf(s, "p1", "battlefield", "Villain")]?.tapped).toBe(true);
    });

    it("Baron Strucker : les sorts de Méchant coûtent {1} de moins ; un autre Méchant arrivé peut comploter, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Baron Strucker, HYDRA Overlord", ...lands("Swamp", 2)],
          hand: ["Agents of HYDRA", "Agents of HYDRA"],
          library: ["Opt", "Forest", "Forest"],
        },
      });
      let asked = 0;
      const answer: Answer = (req, p, cur) => {
        if (req.type === "yesNo") asked++;
        return answering(["Opt"])(req, p, cur);
      };
      // {1}{B} − {1} : un seul Marais suffit pour chacun.
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      const first = idOf(s, "p1", "battlefield", "Agents of HYDRA");
      expect(s.objects[first]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      expect(idsOf(s, "p1", "battlefield", "Agents of HYDRA")).toHaveLength(2);
      expect(asked).toBe(1);
    });

    it("Construct a Cosmic Cube : deuxième carte piochée, un Méchant et un marqueur de plan ; au septième, vous contrôlez un adversaire", () => {
      let s = scenario({
        p1: {
          battlefield: ["Construct a Cosmic Cube", ...lands("Swamp", 6)],
          hand: ["Visions of Villainy", "Visions of Villainy"],
        },
      });
      const cube = idOf(s, "p1", "battlefield", "Construct a Cosmic Cube");
      s = settle(cast(s, "p1", "Visions of Villainy"));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(1);
      expect(s.objects[cube]?.counters.plan).toBe(1);
      expect(s.turnControl).toBeUndefined();
      setCounters(s, cube, "plan", 6);
      // Le tour suivant : les deux premières cartes piochées (l'étape de pioche, puis Visions).
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(cast(s, "p1", "Visions of Villainy"));
      expect(idsOf(s, "p1", "graveyard", "Construct a Cosmic Cube")).toHaveLength(1);
      expect(s.turnControl).toMatchObject({ player: "p2", by: "p1" });
    });

    it("Crossbones : un autre Méchant arrivé, un marqueur +1/+1 et 2 blessures à chaque adversaire, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Crossbones, Malicious Mercenary", ...lands("Swamp", 4)],
          hand: ["Agents of HYDRA", "Agents of HYDRA"],
        },
      });
      const crossbones = idOf(s, "p1", "battlefield", "Crossbones, Malicious Mercenary");
      expect(chars(s, crossbones).keywords).toContain("deathtouch");
      s = settle(cast(s, "p1", "Agents of HYDRA"));
      expect(s.objects[crossbones]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(18);
      s = settle(cast(s, "p1", "Agents of HYDRA"));
      expect(s.objects[crossbones]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(18);
    });

    describe("Cruel Alliance", () => {
      it("sans travail d'équipe : seulement une créature de VM 3 ou moins ; avec : n'importe laquelle, et 3 PV", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Cruel Alliance"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const theirBear = idOf(s, "p2", "battlefield", "Bear Cub");
        const myBear = idOf(s, "p1", "battlefield", "Bear Cub");
        const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Cruel Alliance"));
        const t = opt?.modes[0]?.targets[0];
        expect(t?.legal).toContain(theirBear);
        expect(t?.legal).not.toContain(angel);
        expect(t?.kickedLegal).toContain(angel);
        s = settle(cast(s, "p1", "Cruel Alliance", { kicked: true, tap: [myBear], targets: { t: [angel] } }));
        expect(exiled(s, "Serra Angel")).toHaveLength(1);
        expect(s.objects[myBear]?.tapped).toBe(true);
        expect(s.players.p1?.life).toBe(23);
      });

      it("sans travail d'équipe, pas de PV", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Cruel Alliance"] }, p2: { battlefield: ["Bear Cub"] } });
        s = settle(cast(s, "p1", "Cruel Alliance", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
        expect(exiled(s, "Bear Cub")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Dark Deed : −4/−4 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Dark Deed", "Dark Deed"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Dark Deed", { targets: { t: [dragon] } }));
      expect(pt(s, dragon)).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, dragon)).toEqual([5, 5]);
    });

    it("Decoy Ploy, les deux modes : un Méchant et un Héros de votre cimetière reviennent en main", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 2),
          hand: ["Decoy Ploy"],
          graveyard: ["Agents of HYDRA", "Ronin, Shadow Stalker", "Bear Cub"],
        },
      });
      const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Decoy Ploy"));
      expect(opt?.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Agents of HYDRA")]);
      expect(opt?.modes[1]?.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Ronin, Shadow Stalker")]);
      s = settle(
        cast(s, "p1", "Decoy Ploy", {
          mode: 2,
          targets: {
            v: [idOf(s, "p1", "graveyard", "Agents of HYDRA")],
            h: [idOf(s, "p1", "graveyard", "Ronin, Shadow Stalker")],
          },
        }),
      );
      expect(handNames(s).sort()).toEqual(["Agents of HYDRA", "Ronin, Shadow Stalker"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Doom Reigns Supreme", () => {
      it("un Méchant arrivé : chaque adversaire perd 1 PV, vous gagnez 1 PV, un marqueur de plan", () => {
        let s = scenario({ p1: { battlefield: ["Doom Reigns Supreme", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] } });
        s = settle(cast(s, "p1", "Agents of HYDRA"));
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(21);
        expect(s.objects[idOf(s, "p1", "battlefield", "Doom Reigns Supreme")]?.counters.plan).toBe(1);
      });

      it("au cinquième marqueur : sacrifiée ; l'adversaire exile cinq cartes, vous en lancez jusqu'à deux gratuitement", () => {
        let s = scenario({
          p1: { battlefield: ["Doom Reigns Supreme", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] },
          p2: { library: ["Bear Cub", "Forest", "Serra Angel", "Island", "Opt", "Plains"] },
        });
        setCounters(s, idOf(s, "p1", "battlefield", "Doom Reigns Supreme"), "plan", 4);
        s = untilCastNow(cast(s, "p1", "Agents of HYDRA"));
        expect(idsOf(s, "p1", "graveyard", "Doom Reigns Supreme")).toHaveLength(1);
        const first = castNowOf(s)?.cards ?? [];
        expect(first.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt", "Serra Angel"]);
        const bear = first.find((id) => nameOf(s, id) === "Bear Cub") as string;
        s = untilCastNow(act(s, "p1", { type: "cast", card: bear, free: true }));
        const second = castNowOf(s)?.cards ?? [];
        expect(second.map((id) => nameOf(s, id)).sort()).toEqual(["Opt", "Serra Angel"]);
        const angel = second.find((id) => nameOf(s, id) === "Serra Angel") as string;
        s = settle(act(s, "p1", { type: "cast", card: angel, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(exiled(s, "Opt")).toHaveLength(1);
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
      });
    });

    it("Elektra : en arrivant, détruit une créature adverse de force 3 ou moins", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Elektra, Daughter of the Hand"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(chars(s, angel).power).toBe(4);
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Elektra, Daughter of the Hand"), (req) => {
        if (req.type !== "pick") return undefined;
        offered = req.options;
        return req.options.includes(bear) ? [bear] : undefined;
      });
      expect(offered).not.toContain(angel);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Grim Reaper : en attaquant, payez {3}{B} : une créature du cimetière revient engagée et attaquante, avec un marqueur de finalité", () => {
      let s = scenario({
        p1: { battlefield: ["Grim Reaper, Lethal Legionnaire", ...lands("Swamp", 4)], graveyard: ["Serra Angel"] },
      });
      const reaper = idOf(s, "p1", "battlefield", "Grim Reaper, Lethal Legionnaire");
      s = attackWith(s, [reaper], answering(["Serra Angel"]));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.finality).toBe(1);
      expect(s.combat?.attackers.some((a) => a.id === angel)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      // Grim Reaper (3) et Serra Angel (4).
      expect(s.players.p2?.life).toBe(13);
    });

    it("Hour of Defeat : détruit une créature, puis surveillance 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Hour of Defeat"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(
        cast(s, "p1", "Hour of Defeat", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        (req, _p, cur) => (req.intent === "surveilGraveyard" ? answering(["Opt"])(req, _p, cur) : undefined),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    describe("HYDRA Infiltration", () => {
      it("en arrivant, un adversaire défausse deux cartes", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["HYDRA Infiltration"] },
          p2: { hand: ["Opt", "Island", "Forest"] },
        });
        s = settle(cast(s, "p1", "HYDRA Infiltration"));
        expect(s.players.p2?.hand).toHaveLength(1);
        expect(s.players.p2?.graveyard).toHaveLength(2);
      });

      it("une créature qui attaque seule : un adversaire perd 1 PV et vous gagnez 1 PV", () => {
        let s = scenario({ p1: { battlefield: ["HYDRA Infiltration", "Bear Cub", "Bear Cub"] } });
        const [bear] = idsOf(s, "p1", "battlefield", "Bear Cub");
        s = attackWith(s, [bear as string]);
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(21);
        let t = scenario({ p1: { battlefield: ["HYDRA Infiltration", "Bear Cub", "Bear Cub"] } });
        t = attackWith(t, idsOf(t, "p1", "battlefield", "Bear Cub"));
        expect(t.players.p2?.life).toBe(20);
      });
    });

    it("HYDRA Troopers : un Méchant engagé avec deux cartes de créature au cimetière, sinon meulez deux cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["HYDRA Troopers"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "HYDRA Troopers"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Villain")]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["HYDRA Troopers"], graveyard: ["Bear Cub"] } });
      t = settle(cast(t, "p1", "HYDRA Troopers"));
      expect(idsOf(t, "p1", "battlefield", "Villain")).toHaveLength(0);
      expect(t.players.p1?.graveyard).toHaveLength(3);
    });

    it("Kingpin's Enforcers : {2}{B}, sacrifiez un artefact ou une créature : piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Kingpin's Enforcers", "Bear Cub", ...lands("Swamp", 3)] } });
      const enforcers = idOf(s, "p1", "battlefield", "Kingpin's Enforcers");
      expect(chars(s, enforcers).keywords).toContain("lifelink");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(ability(s, "p1", enforcers)?.additional?.sacrifice?.options).toContain(bear);
      s = settle(activate(s, "p1", enforcers, { sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    describe("Madame Masque", () => {
      it("en arrivant, elle complote", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Madame Masque"], library: ["Opt", "Forest"] } });
        s = settle(cast(s, "p1", "Madame Masque"), answering(["Opt"]));
        expect(s.objects[idOf(s, "p1", "battlefield", "Madame Masque")]?.counters["+1/+1"]).toBe(1);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });

      it("deuxième carte piochée : un Méchant 2/1", () => {
        let s = scenario({ p1: { battlefield: ["Madame Masque", ...lands("Swamp", 2)], hand: ["Visions of Villainy"] } });
        s = settle(cast(s, "p1", "Visions of Villainy"));
        expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(1);
      });
    });

    describe("The Masters of Evil", () => {
      it("les autres Méchants que vous contrôlez ont +2/+1", () => {
        const s = scenario({ p1: { battlefield: ["The Masters of Evil", "Agents of HYDRA", "Bear Cub"] } });
        expect(pt(s, idOf(s, "p1", "battlefield", "Agents of HYDRA"))).toEqual([3, 2]);
        expect(pt(s, idOf(s, "p1", "battlefield", "The Masters of Evil"))).toEqual([5, 6]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      });

      it("{1}{B}, défaussez-la : cherchez une carte de Plan", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Swamp", 2),
            hand: ["The Masters of Evil"],
            library: ["Forest", "Construct a Cosmic Cube", "Forest"],
          },
        });
        s = settle(activate(s, "p1", idOf(s, "p1", "hand", "The Masters of Evil")));
        expect(handNames(s)).toEqual(["Construct a Cosmic Cube"]);
        expect(idsOf(s, "p1", "graveyard", "The Masters of Evil")).toHaveLength(1);
      });
    });

    it("Moonstone : une carte défaussée peut être exilée et jouée jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Moonstone, Harsh Mistress", ...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Red Room Recruit"],
          library: ["Bear Cub", "Forest", "Forest", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Red Room Recruit"), answering(["Bear Cub"]));
      const bear = exiled(s, "Bear Cub")[0] as string;
      expect(bear).toBeDefined();
      expect(castOption(s, "p1", bear)).toBeDefined();
      // Toujours jouable pendant votre prochain tour.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(castOption(s, "p1", bear)).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Ninja of the Hand : montée en puissance, chaque adversaire défausse et un marqueur +1/+1, une seule fois", () => {
      let s = scenario({ p1: { battlefield: ["Ninja of the Hand", ...lands("Swamp", 10)] }, p2: { hand: ["Opt", "Island"] } });
      const ninja = idOf(s, "p1", "battlefield", "Ninja of the Hand");
      expect(chars(s, ninja).keywords).toContain("deathtouch");
      s = settle(activate(s, "p1", ninja));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.objects[ninja]?.counters["+1/+1"]).toBe(1);
      expect(ability(s, "p1", ninja)).toBeUndefined();
    });

    it("Project Deathlok Soldier : {2}{B} : revient du cimetière en main", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), graveyard: ["Project Deathlok Soldier"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Project Deathlok Soldier")));
      expect(handNames(s)).toEqual(["Project Deathlok Soldier"]);
    });

    describe("Robot Domination", () => {
      it("des cartes de créature mises dans votre cimetière : piochez, perdez 1 PV, un marqueur de plan ; au troisième, trois Robots", () => {
        let s = scenario({
          p1: { battlefield: ["Robot Domination", "Bear Cub", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        });
        const plan = idOf(s, "p1", "battlefield", "Robot Domination");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.life).toBe(19);
        expect(s.objects[plan]?.counters.plan).toBe(1);
        // Une carte de créature défaussée compte aussi (« depuis n'importe où ») ; au troisième marqueur, trois Robots.
        let t = scenario({
          p1: {
            battlefield: ["Robot Domination", ...lands("Swamp", 2)],
            hand: ["Red Room Recruit"],
            library: ["Bear Cub", "Forest", "Forest"],
          },
        });
        setCounters(t, idOf(t, "p1", "battlefield", "Robot Domination"), "plan", 2);
        t = settle(cast(t, "p1", "Red Room Recruit"), answering(["Bear Cub"]));
        expect(idsOf(t, "p1", "graveyard", "Robot Domination")).toHaveLength(1);
        const robots = idsOf(t, "p1", "battlefield", "Robot Villain");
        expect(robots).toHaveLength(3);
        expect(pt(t, robots[0] as string)).toEqual([2, 2]);
        expect(chars(t, robots[0] as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      });
    });

    it("Robot Domination : un jeton de créature mort ne compte pas (ce n'est pas une carte)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Robot Domination", "Agents of HYDRA", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const plan = idOf(s, "p1", "battlefield", "Robot Domination");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Agents of HYDRA")] } }));
      expect(s.objects[plan]?.counters.plan).toBe(1);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Villain")] } }));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(0);
      expect(s.objects[plan]?.counters.plan).toBe(1);
    });

    describe("Ronin, Shadow Stalker", () => {
      it("payez 2 PV : deux mana d'une couleur, seulement pour un sort d'Équipement", () => {
        const s = scenario({ p1: { battlefield: ["Ronin, Shadow Stalker"], hand: ["Stolen Stark Tech", "Dark Deed"] } });
        expect(castOption(s, "p1", idOf(s, "p1", "hand", "Stolen Stark Tech"))).toBeDefined();
        expect(castOption(s, "p1", idOf(s, "p1", "hand", "Dark Deed"))).toBeUndefined();
        const ronin = idOf(s, "p1", "battlefield", "Ronin, Shadow Stalker");
        const t = settle(cast(s, "p1", "Stolen Stark Tech"), answering([ronin]));
        expect(t.players.p1?.life).toBe(18);
        expect(t.objects[idOf(t, "p1", "battlefield", "Stolen Stark Tech")]?.attachedTo).toBe(ronin);
      });

      it("{T}, sacrifiez un Équipement attaché à Ronin : une créature ciblée a −4/−4", () => {
        let s = scenario({
          p1: { battlefield: ["Ronin, Shadow Stalker", "Stolen Stark Tech", "Stolen Stark Tech"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const ronin = idOf(s, "p1", "battlefield", "Ronin, Shadow Stalker");
        const [onRonin, loose] = idsOf(s, "p1", "battlefield", "Stolen Stark Tech") as [string, string];
        (s.objects[onRonin] as { attachedTo?: string }).attachedTo = ronin;
        s.version += 1;
        const opt = ability(s, "p1", ronin, /−4/);
        expect(opt?.additional?.sacrifice?.options).toEqual([onRonin]);
        expect(opt?.additional?.sacrifice?.options).not.toContain(loose);
        s = settle(
          activate(s, "p1", ronin, { sacrifice: [onRonin], targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }, /−4/),
        );
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[ronin]?.tapped).toBe(true);
      });
    });

    it("Roxxon Brutes : deuxième carte piochée, un marqueur +1/+1 sur une créature ciblée", () => {
      let s = scenario({ p1: { battlefield: ["Roxxon Brutes", ...lands("Swamp", 2)], hand: ["Visions of Villainy"] } });
      const brutes = idOf(s, "p1", "battlefield", "Roxxon Brutes");
      expect(chars(s, brutes).keywords).toContain("menace");
      s = settle(cast(s, "p1", "Visions of Villainy"), answering([brutes]));
      expect(s.objects[brutes]?.counters["+1/+1"]).toBe(1);
    });

    it("Stolen Stark Tech : flash ; s'attache en arrivant, la créature gagne l'indestructible ce tour-ci ; +1/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Stolen Stark Tech"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Stolen Stark Tech"), answering([bear]));
      const tech = idOf(s, "p1", "battlefield", "Stolen Stark Tech");
      expect(chars(s, tech).keywords).toContain("flash");
      expect(s.objects[tech]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("indestructible");
      expect(ability(s, "p1", tech, /Équiper/)).toBeDefined();
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      expect(pt(s, bear)).toEqual([3, 2]);
    });

    it("Super-Skrull : un Mur 0/4, +4/+4, 4 blessures, un joueur pioche quatre cartes", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Super-Skrull",
            ...lands("Plains", 3),
            ...lands("Forest", 4),
            ...lands("Mountain", 5),
            ...lands("Island", 6),
          ],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const skrull = idOf(s, "p1", "battlefield", "Super-Skrull");
      s = settle(activate(s, "p1", skrull, {}, /Mur/));
      const wall = idOf(s, "p1", "battlefield", "Wall");
      expect(pt(s, wall)).toEqual([0, 4]);
      expect(chars(s, wall).keywords).toContain("defender");
      s = settle(activate(s, "p1", skrull, {}, /\+4/));
      expect(pt(s, skrull)).toEqual([8, 9]);
      s = settle(activate(s, "p1", skrull, { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }, /4 blessures/));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      s = settle(activate(s, "p1", skrull, { targets: { t: ["p1"] } }, /pioche/));
      expect(s.players.p1?.hand).toHaveLength(4);
    });

    it("Swordsman : un autre Méchant arrivé attache un Équipement ; une créature équipée qui attaque complote", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swordsman, Sharp Scoundrel", "Stolen Stark Tech", "Bear Cub", ...lands("Swamp", 2)],
          hand: ["Agents of HYDRA"],
          library: ["Opt", "Forest", "Forest"],
        },
      });
      const tech = idOf(s, "p1", "battlefield", "Stolen Stark Tech");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Agents of HYDRA"), answering([tech, bear]));
      expect(s.objects[tech]?.attachedTo).toBe(bear);
      s = attackWith(s, [bear], answering(["Opt"]));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Thunderbolts Conspiracy : un Méchant mort revient avec un marqueur de finalité, et c'est aussi un Héros", () => {
      let s = scenario({
        p1: {
          battlefield: ["Thunderbolts Conspiracy", "Kingpin's Enforcers", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Kingpin's Enforcers")] } }));
      const back = idOf(s, "p1", "battlefield", "Kingpin's Enforcers");
      expect(s.objects[back]?.counters.finality).toBe(1);
      expect(chars(s, back).subtypes).toEqual(expect.arrayContaining(["Villain", "Hero"]));
      // Le marqueur de finalité : la seconde fois, elle est exilée.
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [back] } }));
      expect(exiled(s, "Kingpin's Enforcers")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Kingpin's Enforcers")).toHaveLength(0);
    });

    it("Too Evil to Stay Dead : VM 4 ou moins, ou n'importe quelle carte de créature avec le travail d'équipe", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Bear Cub", "Bear Cub"],
          hand: ["Too Evil to Stay Dead"],
          graveyard: ["Serra Angel", "Bear Cub"],
        },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      const t = castOption(s, "p1", idOf(s, "p1", "hand", "Too Evil to Stay Dead"))?.modes[0]?.targets[0];
      expect(t?.legal).toEqual([idOf(s, "p1", "graveyard", "Bear Cub")]);
      expect(t?.kickedLegal).toContain(angel);
      s = settle(
        cast(s, "p1", "Too Evil to Stay Dead", {
          kicked: true,
          tap: idsOf(s, "p1", "battlefield", "Bear Cub"),
          targets: { t: [angel] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Unliving Legionnaire : montée en puissance, une carte de créature du cimetière en main et deux marqueurs +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Unliving Legionnaire", ...lands("Swamp", 7)], graveyard: ["Bear Cub"] } });
      const legionnaire = idOf(s, "p1", "battlefield", "Unliving Legionnaire");
      s = settle(activate(s, "p1", legionnaire, { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(handNames(s)).toEqual(["Bear Cub"]);
      expect(pt(s, legionnaire)).toEqual([5, 4]);
    });

    it("Visions of Villainy : {1} de moins avec un Méchant ; piochez deux cartes et perdez 2 PV", () => {
      const without = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Visions of Villainy"] } });
      expect(castOption(without, "p1", idOf(without, "p1", "hand", "Visions of Villainy"))).toBeUndefined();
      let s = scenario({ p1: { battlefield: ["Agents of HYDRA", ...lands("Swamp", 2)], hand: ["Visions of Villainy"] } });
      s = settle(cast(s, "p1", "Visions of Villainy"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(18);
    });

    describe("Whiplash, Vengeful Engineer", () => {
      it("arrive engagé", () => {
        let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Whiplash, Vengeful Engineer"] } });
        s = settle(cast(s, "p1", "Whiplash, Vengeful Engineer"));
        expect(s.objects[idOf(s, "p1", "battlefield", "Whiplash, Vengeful Engineer")]?.tapped).toBe(true);
      });

      it("en attaquant, s'il est équipé : chaque adversaire perd X PV et vous gagnez X PV (X : Équipements attachés)", () => {
        let s = scenario({ p1: { battlefield: ["Whiplash, Vengeful Engineer", "Stolen Stark Tech", "Stolen Stark Tech"] } });
        const whip = idOf(s, "p1", "battlefield", "Whiplash, Vengeful Engineer");
        for (const tech of idsOf(s, "p1", "battlefield", "Stolen Stark Tech"))
          (s.objects[tech] as { attachedTo?: string }).attachedTo = whip;
        s.version += 1;
        s = attackWith(s, [whip]);
        expect(s.players.p2?.life).toBe(18);
        expect(s.players.p1?.life).toBe(22);
        let bare = scenario({ p1: { battlefield: ["Whiplash, Vengeful Engineer"] } });
        bare = attackWith(bare, [idOf(bare, "p1", "battlefield", "Whiplash, Vengeful Engineer")]);
        expect(bare.players.p2?.life).toBe(20);
        expect(bare.players.p1?.life).toBe(20);
      });
    });

    it("Widow's Bite : un mode, ou les deux avec le travail d'équipe 3", () => {
      const base = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub", "Llanowar Elves"], hand: ["Widow's Bite"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(base, "p2", "battlefield", "Serra Angel");
      const theirBear = idOf(base, "p2", "battlefield", "Bear Cub");
      expect(() => cast(base, "p1", "Widow's Bite", { mode: 2, targets: { a: [theirBear], b: [angel] } })).toThrow();
      const tap = [idOf(base, "p1", "battlefield", "Bear Cub"), idOf(base, "p1", "battlefield", "Llanowar Elves")];
      const s = settle(cast(base, "p1", "Widow's Bite", { mode: 2, kicked: true, tap, targets: { a: [theirBear], b: [angel] } }));
      expect(chars(s, theirBear).keywords).toContain("deathtouch");
      expect(pt(s, angel)).toEqual([2, 2]);
    });

    it("Yellowjacket : un autre Méchant arrivé lui donne +1/+0 et le lien de vie jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Yellowjacket, Heartless Marauder", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] },
      });
      const yj = idOf(s, "p1", "battlefield", "Yellowjacket, Heartless Marauder");
      s = settle(cast(s, "p1", "Agents of HYDRA"));
      expect(pt(s, yj)).toEqual([2, 2]);
      expect(chars(s, yj).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, yj)).toEqual([1, 2]);
    });
  });
});
