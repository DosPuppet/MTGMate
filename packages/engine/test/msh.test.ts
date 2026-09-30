/**
 * Marvel Super Heroes (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Équiper digne (Mjölnir), Plans (Political Triumph), Doombots (Doctor Doom, Castle Doom),
 * complot (M.O.D.O.K.), Wolverine, The Wondrous Wasp, Avengers Disassembled, Jennifer Walters et Hidden Lair.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, scenario } from "./helpers";

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
