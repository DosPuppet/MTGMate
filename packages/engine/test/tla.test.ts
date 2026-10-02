/**
 * Avatar: The Last Airbender (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son
 * texte Oracle (plan R, lot R7). Maîtrise de l'air (Avatar's Wrath, Appa), maîtrise de la terre (Ba Sing Se), Leçons
 * (Combustion Technique, Accumulate Wisdom), kicker, coûts additionnels et contresorts.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import * as dsl from "../src/dsl";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, customCard, idOf, idsOf, scenario } from "./helpers";

type S = GameState;
type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

/** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
const settle = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
    else break;
  }
  return cur;
};
/** Réponse qui choisit les objets voulus quand ils font partie des options. */
const picking =
  (want: string[]): Answer =>
  (req) => {
    if (req.type !== "pick") return undefined;
    const picked = want.filter((w) => req.options.includes(w));
    return picked.length > 0 ? picked : undefined;
  };
const cast = (s: S, player: string, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
};
const castable = (s: S, player: string, card: string) =>
  legalActions(s, player).some((a) => a.type === "cast" && a.card === card);

describe("Avatar: The Last Airbender", () => {
  describe("Avatar's Wrath", () => {
    const setup = () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Shivan Dragon"], hand: ["Avatar's Wrath"] },
        p2: { battlefield: ["Serra Angel", "Fire Elemental", ...lands("Mountain", 5)] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Avatar's Wrath", { targets: { t: [angel] } }));
      return { s, angel };
    };

    it("la créature choisie reste ; toutes les autres sont exilées par la maîtrise de l'air, puis le sort s'exile", () => {
      const { s, angel } = setup();
      expect(s.battlefield).toContain(angel);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
      expect(idsOf(s, "p2", "battlefield", "Fire Elemental")).toHaveLength(0);
      expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
      expect(exiled(s, "Fire Elemental")).toHaveLength(1);
      expect(exiled(s, "Avatar's Wrath")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });

    it("son propriétaire peut relancer une carte exilée par la maîtrise de l'air pour {2}", () => {
      let { s } = setup();
      const dragon = exiled(s, "Shivan Dragon")[0] as string;
      // Il ne reste que deux Plaines dégagées : le Dragon ({4}{R}{R}) se lance pour {2}.
      expect(castable(s, "p1", dragon)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: dragon }));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && !s.objects[id]?.tapped)).toHaveLength(0);
    });

    it("jusqu'à votre prochain tour, les adversaires ne lancent de sorts que depuis leur main", () => {
      let { s } = setup();
      const fire = exiled(s, "Fire Elemental")[0] as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", fire)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", fire)).toBe(true);
    });
  });

  it("Appa : maîtrise de l'air de vos autres permanents non-terrains ; un sort lancé depuis l'exil crée un Allié 1/1", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), "Serra Angel"], hand: ["Appa, Steadfast Guardian"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const plains = idsOf(s, "p1", "battlefield", "Plains");
    let options: string[] = [];
    s = settle(cast(s, "p1", "Appa, Steadfast Guardian"), (req) => {
      if (req.type !== "pick" || !req.options.includes(angel)) return undefined;
      options = req.options.map(String);
      return [angel];
    });
    // Ni un terrain, ni un permanent adverse, ni Appa elle-même.
    expect(options).toContain(angel);
    expect(options).not.toContain(bear);
    expect(options).not.toContain(plains[0]);
    expect(options).not.toContain(idOf(s, "p1", "battlefield", "Appa, Steadfast Guardian"));
    const card = exiled(s, "Serra Angel")[0] as string;
    expect(card).toBeDefined();
    s = settle(act(s, "p1", { type: "cast", card }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    const ally = idOf(s, "p1", "battlefield", "Ally");
    expect([chars(s, ally).power, chars(s, ally).toughness, chars(s, ally).colors]).toEqual([1, 1, ["W"]]);
  });

  describe("Maîtrise de la terre et Heartless Act", () => {
    const setup = () => {
      let s = scenario({
        p1: { battlefield: ["Ba Sing Se", ...lands("Forest", 4), ...lands("Swamp", 2)], hand: ["Heartless Act"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const land = idsOf(s, "p1", "battlefield", "Forest")[3] as string;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Ba Sing Se"), { t: [land] }));
      return { s, land };
    };

    it("la maîtrise de la terre 2 fait du terrain une créature 0/0 avec deux marqueurs +1/+1", () => {
      const { s, land } = setup();
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      const c = chars(s, land);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect([c.power, c.toughness]).toEqual([2, 2]);
    });

    it("Heartless Act ne détruit qu'une créature sans marqueur", () => {
      const { s, land } = setup();
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Heartless Act", { mode: 0, targets: { t: [land] } })).toThrow();
      const t = settle(cast(s, "p1", "Heartless Act", { mode: 0, targets: { t: [bear] } }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Heartless Act retire les marqueurs : le terrain 0/0 meurt et revient engagé, simple terrain", () => {
      const { s: s0, land } = setup();
      const forests = idsOf(s0, "p1", "battlefield", "Forest");
      const s = settle(cast(s0, "p1", "Heartless Act", { mode: 1, targets: { u: [land] } }));
      const now = idsOf(s, "p1", "battlefield", "Forest");
      expect(now).toHaveLength(4);
      const back = now.find((id) => !forests.includes(id)) as string;
      expect(back).toBeDefined();
      expect(s.objects[back]?.tapped).toBe(true);
      expect(chars(s, back).types).toEqual(["Land"]);
    });
  });

  describe("Leçons", () => {
    it("Combustion Technique : 2 blessures plus une par Leçon du cimetière ; la créature qui meurt est exilée", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Combustion Technique"], graveyard },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Combustion Technique", { targets: { t: [angel] } }));
        return { s, angel };
      };
      const none = run(["Opt"]);
      expect(none.s.objects[none.angel]?.damage).toBe(2);
      const two = run(["Shared Roots", "Firebending Lesson", "Opt"]);
      expect(idsOf(two.s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(idsOf(two.s, "p2", "graveyard", "Serra Angel")).toHaveLength(0);
      expect(exiled(two.s, "Serra Angel")).toHaveLength(1);
    });

    it("Firebending Lesson : 2 blessures, ou 5 si elle est kickée", () => {
      const run = (kicked: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Firebending Lesson"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
        s = settle(cast(s, "p1", "Firebending Lesson", { kicked, targets: { t: [fire] } }));
        return { s, fire };
      };
      const plain = run(false);
      expect(plain.s.objects[plain.fire]?.damage).toBe(2);
      const kicked = run(true);
      expect(idsOf(kicked.s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(
        kicked.s.battlefield.filter((id) => nameOf(kicked.s, id) === "Mountain" && kicked.s.objects[id]?.tapped),
      ).toHaveLength(5);
    });

    it("Accumulate Wisdom : une carte sur trois, ou les trois avec trois Leçons au cimetière", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: {
            battlefield: lands("Island", 2),
            hand: ["Accumulate Wisdom"],
            graveyard,
            library: ["Opt", "Bear Cub", "Plains", "Forest"],
          },
        });
        s = settle(cast(s, "p1", "Accumulate Wisdom"));
        return s;
      };
      const one = run(["Shared Roots", "Opt"]);
      expect(one.players.p1?.hand).toHaveLength(1);
      expect(one.players.p1?.library).toHaveLength(3);
      // Les deux autres vont sous la bibliothèque : la Forêt reste au-dessus.
      expect(nameOf(one, one.players.p1?.library[0] ?? "")).toBe("Forest");
      const three = run(["Shared Roots", "Firebending Lesson", "Price of Freedom"]);
      expect(three.players.p1?.hand.map((id) => nameOf(three, id)).sort()).toEqual(["Bear Cub", "Opt", "Plains"]);
      expect(three.players.p1?.library).toHaveLength(1);
    });
  });

  describe("It'll Quench Ya!", () => {
    const setup = (mountains: number) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["It'll Quench Ya!"] },
        p2: { battlefield: lands("Mountain", mountains), hand: ["Burst Lightning"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
      const bolt = s.stack[0]?.id as string;
      s = act(s, "p2", { type: "pass" });
      return cast(s, "p1", "It'll Quench Ya!", { targets: { t: [bolt] } });
    };

    it("contrecarre le sort si son contrôleur ne peut pas payer {2}", () => {
      const s = settle(setup(1));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
    });

    it("le sort se résout si son contrôleur paie {2}", () => {
      let asked = false;
      const s = settle(setup(3), (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      expect(asked).toBe(true);
      expect(s.players.p1?.life).toBe(18);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(3);
    });
  });

  describe("Deadly Precision", () => {
    it("sacrifier une créature en coût additionnel : détruit la créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Deadly Precision"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Deadly Precision", { sacrifice: [bear], targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("sans rien sacrifier, il faut payer {4} de plus", () => {
      const setup = (swamps: number) =>
        scenario({
          p1: { battlefield: lands("Swamp", swamps), hand: ["Deadly Precision"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      const poor = setup(4);
      expect(() =>
        cast(poor, "p1", "Deadly Precision", { targets: { t: [idOf(poor, "p2", "battlefield", "Serra Angel")] } }),
      ).toThrow();
      let s = setup(5);
      s = settle(cast(s, "p1", "Deadly Precision", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
    });
  });

  it("Price of Freedom : détruit un terrain adverse, son contrôleur cherche un terrain de base engagé, vous piochez", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Price of Freedom"], library: ["Opt", "Forest"] },
      p2: { battlefield: ["Island"], library: ["Plains", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Price of Freedom");
    const island = idOf(s, "p2", "battlefield", "Island");
    expect(() =>
      act(s, "p1", { type: "cast", card, targets: { t: [idsOf(s, "p1", "battlefield", "Mountain")[0] as string] } }),
    ).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, targets: { t: [island] } }));
    expect(idsOf(s, "p2", "graveyard", "Island")).toHaveLength(1);
    const plains = idOf(s, "p2", "battlefield", "Plains");
    expect(s.objects[plains]?.tapped).toBe(true);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
  });

  it("Callous Inspector : menace ; en mourant, 1 blessure à son contrôleur et un Indice", () => {
    let s = scenario({ p1: { battlefield: ["Callous Inspector", "Mountain"], hand: ["Burst Lightning"] } });
    const inspector = idOf(s, "p1", "battlefield", "Callous Inspector");
    expect(chars(s, inspector).keywords).toContain("menace");
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [inspector] } }));
    expect(idsOf(s, "p1", "graveyard", "Callous Inspector")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p2?.life).toBe(20);
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
  });

  it("Momo : le premier sort de créature volante du tour coûte {1} de moins ; Momo gagne +1/+1 à son arrivée", () => {
    let s = scenario({
      p1: { battlefield: ["Momo, Friendly Flier", ...lands("Plains", 8)], hand: ["Serra Angel", "Serra Angel"] },
    });
    const momo = idOf(s, "p1", "battlefield", "Momo, Friendly Flier");
    const [first, second] = idsOf(s, "p1", "hand", "Serra Angel") as [string, string];
    s = settle(act(s, "p1", { type: "cast", card: first }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // Le premier Ange ({3}{W}{W}) n'a coûté que quatre Plaines.
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && !s.objects[id]?.tapped)).toHaveLength(4);
    expect([chars(s, momo).power, chars(s, momo).toughness]).toEqual([2, 2]);
    // Plus de réduction pour le second : quatre Plaines ne suffisent pas.
    expect(castable(s, "p1", second)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect([chars(s, momo).power, chars(s, momo).toughness]).toEqual([1, 1]);
  });

  it("Obsessive Pursuit : en arrivant, perdez 1 PV et créez un Indice ; X marqueurs sur un attaquant (permanents sacrifiés)", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Obsessive Pursuit"] } });
    s = settle(cast(s, "p1", "Obsessive Pursuit"));
    expect(s.players.p1?.life).toBe(19);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    s = settle(activate(s, "p1", clue));
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = settle(s, picking([bear]));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bear).keywords).not.toContain("lifelink");
  });
});

describe("Avatar: The Last Airbender, socle : maîtrise de l'eau et du feu", () => {
  /** « Waterbend {3} : piochez une carte » (enchantement de test). */
  const fountain = customCard({
    name: "Test Fountain",
    types: ["Enchantment"],
    typeLine: "Enchantment",
    abilities: [
      dsl.activated({
        mana: "{3}",
        waterbend: true,
        effects: [dsl.fx.draw(1)],
        label: "Maîtrise de l'eau {3} : piochez une carte",
      }),
    ],
  });
  const drawn = (s: S) => s.players.p1?.hand.length ?? 0;
  /** Rituel ordinaire à {1}{U}. */
  const divination = customCard({
    name: "Test Divination",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 1, colored: { U: 1 }, x: 0 },
    manaCostText: "{1}{U}",
    colors: ["U"],
    spell: dsl.spell([], [dsl.fx.draw(1)]),
  });

  it("maîtrise de l'eau : chaque artefact ou créature dégagé paie {1}, après les terrains", () => {
    let s = scenario({ p1: { battlefield: [fountain, "Island", "Bear Cub", "Bear Cub"], library: lands("Island", 3) } });
    const source = idOf(s, "p1", "battlefield", "Test Fountain");
    const hand = drawn(s);
    s = settle(activate(s, "p1", source));
    expect(drawn(s)).toBe(hand + 1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
  });

  it("maîtrise de l'eau : les créatures engagées ne paient rien ; un sort ordinaire ne peut pas s'en servir", () => {
    const s = scenario({
      p1: { battlefield: [fountain, "Island", "Bear Cub", { name: "Bear Cub", tapped: true }], hand: [divination] },
    });
    const source = idOf(s, "p1", "battlefield", "Test Fountain");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === source)).toBe(false);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Divination"))).toBe(false);
  });

  it("maîtrise de l'eau {X} : X peut monter avec les artefacts et créatures dégagés", () => {
    const katara = customCard({
      name: "Test Tide",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [dsl.activated({ mana: "{X}", waterbend: true, effects: [dsl.fx.draw(1)], label: "Maîtrise de l'eau {X}" })],
    });
    const s = scenario({ p1: { battlefield: [katara, "Island", "Bear Cub", "Bear Cub"] } });
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === idOf(s, "p1", "battlefield", "Test Tide"));
    expect(a?.type === "activate" ? a.xMax : null).toBe(3);
  });

  it("maîtrise du feu N lue parmi d'autres mots-clés (« Trample, firebending 4, haste »)", () => {
    const ozai = card("Ozai, the Phoenix King");
    expect(ozai.abilities.some((ab) => ab.kind === "triggered" && ab.label === "Maîtrise du feu 4")).toBe(true);
    expect(card("Ran and Shaw").abilities.some((ab) => ab.kind === "triggered" && ab.label === "Maîtrise du feu 2")).toBe(true);
  });

  it("maîtrise du feu : le mana reste pendant le combat, puis se vide à la fin du combat", () => {
    const firebender = customCard({ name: "Test Firebender", power: 2, toughness: 2, abilities: [dsl.firebending(2)] });
    let s = scenario({ p1: { battlefield: [firebender] } });
    const id = idOf(s, "p1", "battlefield", "Test Firebender");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
    expect(s.players.p1?.manaPool.R).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p1?.manaPool.R).toBe(0);
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Réponse qui choisit les objets voulus quand ils font partie des options. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Choisit le mode `n` d'une capacité déclenchée modale, puis les objets voulus. */
  const modeThen =
    (n: number, want: string[] = []): Answer =>
    (req, p) =>
      req.intent === "triggerMode" ? [String(n)] : picking(want)(req, p);
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  const castable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
  /** Déclare les attaquants de p1 (vers p2) et résout les déclenchements d'attaque. */
  const attackWith = (s: S, ids: string[], answer?: Answer): S => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };

  describe("Avatar: The Last Airbender, lot A — blanc", () => {
    it("Aang, the Last Airbender : maîtrise de l'air en arrivant ; une Leçon lancée lui donne le lien de vie", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Aang, the Last Airbender", "Yip Yip!"] },
        p2: { battlefield: ["Serra Angel", ...lands("Plains", 2)] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Aang, the Last Airbender"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      const card = exiled(s, "Serra Angel")[0] as string;
      expect(card).toBeDefined();
      const aang = idOf(s, "p1", "battlefield", "Aang, the Last Airbender");
      expect(chars(s, aang).keywords).toContain("flying");
      expect(chars(s, aang).keywords).not.toContain("lifelink");
      s = settle(cast(s, "p1", "Yip Yip!", { targets: { t: [aang] } }));
      expect(chars(s, aang).keywords).toContain("lifelink");
      // Son propriétaire peut relancer l'Ange pour {2}.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, aang).keywords).not.toContain("lifelink");
      expect(castable(s, "p2", card)).toBe(true);
    });

    it("Aang's Iceberg : exile un permanent jusqu'à son départ ; maîtrise de l'eau {3} le sacrifie, regard 2", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Bear Cub", "Bear Cub"], hand: ["Aang's Iceberg"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Aang's Iceberg"), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      const iceberg = idOf(s, "p1", "battlefield", "Aang's Iceberg");
      let scried = false;
      s = settle(activate(s, "p1", iceberg), (req) => {
        if (req.intent === "scryBottom" || req.intent === "scryOrder") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Aang's Iceberg")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      // Les terrains étaient engagés : ce sont les trois créatures qui ont payé la maîtrise de l'eau.
      expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    describe("Airbender's Reversal", () => {
      it("détruit une créature attaquante, mais pas une créature qui n'attaque pas", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: lands("Plains", 2), hand: ["Airbender's Reversal"] },
          p2: { battlefield: ["Bear Cub", "Bear Cub"] },
        });
        const [bear, other] = idsOf(s, "p2", "battlefield", "Bear Cub") as [string, string];
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        expect(() => cast(s, "p1", "Airbender's Reversal", { mode: 0, targets: { t: [other] } })).toThrow();
        s = settle(cast(s, "p1", "Airbender's Reversal", { mode: 0, targets: { t: [bear] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      });

      it("maîtrise de l'air d'une de vos créatures : exilée, relançable pour {2}", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Serra Angel"], hand: ["Airbender's Reversal"] } });
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Airbender's Reversal", { mode: 1, targets: { u: [angel] } }));
        const card = exiled(s, "Serra Angel")[0] as string;
        expect(card).toBeDefined();
        expect(castable(s, "p1", card)).toBe(true);
      });
    });

    it("Airbending Lesson : maîtrise de l'air d'un permanent non-terrain, puis piochez", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Airbending Lesson"], library: ["Opt"] },
        p2: { battlefield: ["Aang's Iceberg", "Island"] },
      });
      const island = idOf(s, "p2", "battlefield", "Island");
      expect(() => cast(s, "p1", "Airbending Lesson", { targets: { t: [island] } })).toThrow();
      s = settle(cast(s, "p1", "Airbending Lesson", { targets: { t: [idOf(s, "p2", "battlefield", "Aang's Iceberg")] } }));
      expect(exiled(s, "Aang's Iceberg")).toHaveLength(1);
      expect(handNames(s)).toEqual(["Opt"]);
    });

    it("Appa, Loyal Sky Bison : en arrivant, maîtrise de l'air d'un autre de vos permanents non-terrains", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Appa, Loyal Sky Bison"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Appa, Loyal Sky Bison"), modeThen(1, [bear]));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Appa, Loyal Sky Bison")).toHaveLength(1);
    });

    it("Appa, Loyal Sky Bison : en attaquant, une de vos créatures gagne le vol jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Appa, Loyal Sky Bison", "Bear Cub"] } });
      const appa = idOf(s, "p1", "battlefield", "Appa, Loyal Sky Bison");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackWith(s, [appa], modeThen(0, [bear]));
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Avatar Enthusiasts et Kyoshi Warriors : un marqueur +1/+1 pour chaque autre Allié qui arrive", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Avatar Enthusiasts"], hand: ["Kyoshi Warriors"] } });
      const fan = idOf(s, "p1", "battlefield", "Avatar Enthusiasts");
      s = settle(cast(s, "p1", "Kyoshi Warriors"));
      // Les Guerrières (Alliées) et le jeton Allié créé par elles.
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      expect(s.objects[fan]?.counters["+1/+1"]).toBe(2);
    });

    it("Compassionate Healer : quand elle devient engagée, gagnez 1 PV et regard 1", () => {
      let s = scenario({ p1: { battlefield: ["Compassionate Healer"] } });
      const healer = idOf(s, "p1", "battlefield", "Compassionate Healer");
      s = attackWith(s, [healer]);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Curious Farm Animals : {2}, sacrifice : détruit un enchantement ; en mourant, gagnez 3 PV", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Curious Farm Animals"] },
        p2: { battlefield: ["Aang's Iceberg"] },
      });
      const iceberg = idOf(s, "p2", "battlefield", "Aang's Iceberg");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Curious Farm Animals"), { t: [iceberg] }));
      expect(idsOf(s, "p2", "graveyard", "Aang's Iceberg")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Curious Farm Animals")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Earth Kingdom Jailer : exile un permanent adverse de valeur de mana 3 ou plus jusqu'à son départ", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Mountain", 2)], hand: ["Earth Kingdom Jailer", "Lightning Strike"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Earth Kingdom Jailer"), (req) => {
        if (req.type !== "pick" || !req.options.includes(angel)) return undefined;
        options = req.options.map(String);
        return [angel];
      });
      expect(options).not.toContain(bear);
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      // Le Geôlier quitte le champ de bataille : l'Ange revient.
      const jailer = idOf(s, "p1", "battlefield", "Earth Kingdom Jailer");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [jailer] } }));
      expect(idsOf(s, "p1", "graveyard", "Earth Kingdom Jailer")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Earth Kingdom Protectors : sacrifice : un autre Allié que vous contrôlez gagne l'indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Earth Kingdom Protectors", "Kyoshi Warriors", "Bear Cub"] } });
      const protectors = idOf(s, "p1", "battlefield", "Earth Kingdom Protectors");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const warriors = idOf(s, "p1", "battlefield", "Kyoshi Warriors");
      expect(chars(s, protectors).keywords).toContain("vigilance");
      expect(() => activate(s, "p1", protectors, { t: [bear] })).toThrow();
      s = settle(activate(s, "p1", protectors, { t: [warriors] }));
      expect(idsOf(s, "p1", "graveyard", "Earth Kingdom Protectors")).toHaveLength(1);
      expect(chars(s, warriors).keywords).toContain("indestructible");
    });

    it("Enter the Avatar State : Avatar, vol, initiative, lien de vie et défense talismanique jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Enter the Avatar State"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Enter the Avatar State", { targets: { t: [bear] } }));
      const c = chars(s, bear);
      expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Avatar"]));
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "lifelink", "hexproof"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).subtypes).not.toContain("Avatar");
    });

    it("Fancy Footwork : dégage une ou deux créatures, +2/+2 chacune", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), { name: "Bear Cub", tapped: true }, { name: "Bear Cub", tapped: true }],
          hand: ["Fancy Footwork"],
        },
      });
      const [bear, grizzly] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
      s = settle(cast(s, "p1", "Fancy Footwork", { targets: { t: [bear, grizzly] } }));
      for (const id of [bear, grizzly]) {
        expect(s.objects[id]?.tapped).toBe(false);
        expect(pt(s, id)).toEqual([4, 4]);
      }
    });

    it("Gather the White Lotus : un Allié 1/1 blanc par Plaine que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Gather the White Lotus"] } });
      s = settle(cast(s, "p1", "Gather the White Lotus"));
      const allies = idsOf(s, "p1", "battlefield", "Ally");
      expect(allies).toHaveLength(3);
      expect(chars(s, allies[0] as string).colors).toEqual(["W"]);
    });

    it("Glider Staff : maîtrise de l'air d'une créature en arrivant ; la créature équipée a +1/+1 et le vol", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Glider Staff"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Glider Staff"), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Glider Staff"), { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Hakoda : lancez des sorts d'Allié du dessus de votre bibliothèque ; sacrifice : +0/+5 et indestructible", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 4), "Hakoda, Selfless Commander", "Bear Cub"],
          library: ["Kyoshi Warriors", "Serra Angel"],
        },
      });
      const top = s.players.p1?.library[0] as string;
      expect(nameOf(s, top)).toBe("Kyoshi Warriors");
      expect(castable(s, "p1", top)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: top }));
      expect(idsOf(s, "p1", "battlefield", "Kyoshi Warriors")).toHaveLength(1);
      // L'Ange n'est pas un Allié.
      expect(castable(s, "p1", s.players.p1?.library[0] as string)).toBe(false);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hakoda, Selfless Commander")));
      expect(idsOf(s, "p1", "graveyard", "Hakoda, Selfless Commander")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([2, 7]);
      expect(chars(s, bear).keywords).toContain("indestructible");
    });

    it("Jeong Jeong's Deserters : un marqueur +1/+1 sur une créature ciblée", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Jeong Jeong's Deserters"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Jeong Jeong's Deserters"), picking([bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("The Legend of Yangchen : I exile un permanent adverse de VM 3+, II pioche trois cartes chacun, III se transforme", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 5),
          hand: ["The Legend of Yangchen // Avatar Yangchen"],
          library: lands("Plains", 10),
        },
        p2: { battlefield: ["Serra Angel", "Bear Cub"], library: lands("Island", 10) },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "The Legend of Yangchen // Avatar Yangchen"), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      // Chapitre II, à votre tour suivant.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw" && x.pending?.kind === "priority");
      const before = { p1: s.players.p1?.hand.length ?? 0, p2: s.players.p2?.hand.length ?? 0 };
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length > 0);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.players.p1?.hand.length).toBe(before.p1 + 3);
      expect(s.players.p2?.hand.length).toBe(before.p2 + 3);
      // Chapitre III : la Saga revient transformée en Avatar Yangchen.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > s.turn.number);
      s = settle(s);
      const yangchen = s.battlefield.find((id) => chars(s, id).name === "Avatar Yangchen") as string;
      expect(yangchen).toBeDefined();
      const c = chars(s, yangchen);
      expect(c.name).toBe("Avatar Yangchen");
      expect([c.power, c.toughness]).toEqual([4, 5]);
      expect(c.keywords).toContain("flying");
    });

    it("Avatar Yangchen : votre deuxième sort du tour donne la maîtrise de l'air d'un autre permanent non-terrain", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "The Legend of Yangchen // Avatar Yangchen"], hand: ["Yip Yip!", "Yip Yip!"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      // La carte est mise directement sur son verso (comme après le chapitre III).
      const saga = idOf(s, "p1", "battlefield", "The Legend of Yangchen // Avatar Yangchen");
      const o = s.objects[saga] as NonNullable<S["objects"][string]>;
      o.faceDefId = s.defs[o.defId]?.faceDefs?.[1]?.id;
      bump(s);
      expect(chars(s, saga).name).toBe("Avatar Yangchen");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const [first, second] = idsOf(s, "p1", "hand", "Yip Yip!") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: first, targets: { t: [saga] } }));
      expect(exiled(s, "Serra Angel")).toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: second, targets: { t: [saga] } }), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });

    it("Master Piandao : en attaquant, un Allié, un Équipement ou une Leçon parmi les quatre du dessus", () => {
      let s = scenario({
        p1: { battlefield: ["Master Piandao"], library: ["Bear Cub", "Glider Staff", "Opt", "Plains", "Island"] },
      });
      const piandao = idOf(s, "p1", "battlefield", "Master Piandao");
      let options: string[] = [];
      s = attackWith(s, [piandao], (req) => {
        if (req.intent !== "lookAtTop" || req.type !== "pick") return undefined;
        options = req.options.map((id) => nameOf(s, String(id)) ?? "");
        return req.options.filter((id) => nameOf(s, String(id)) === "Glider Staff");
      });
      expect(options).toEqual(["Glider Staff"]);
      expect(handNames(s)).toEqual(["Glider Staff"]);
      // Les trois autres sont sous la bibliothèque : l'Île reste au-dessus.
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Island");
    });

    it("Momo, Playful Pet : en quittant le champ de bataille, une Nourriture (ou un autre mode)", () => {
      let s = scenario({
        p1: { battlefield: ["Momo, Playful Pet", "Mountain", "Mountain", "Bear Cub"], hand: ["Lightning Strike"] },
      });
      const momo = idOf(s, "p1", "battlefield", "Momo, Playful Pet");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [momo] } }), modeThen(1, [bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      let t = scenario({ p1: { battlefield: ["Momo, Playful Pet", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
      t = settle(
        cast(t, "p1", "Lightning Strike", { targets: { t: [idOf(t, "p1", "battlefield", "Momo, Playful Pet")] } }),
        modeThen(0),
      );
      expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Path to Redemption : la créature enchantée ne peut ni attaquer ni bloquer ; {5}, sacrifice, pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Path to Redemption"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Path to Redemption", { targets: { enchant: [angel] } }));
      expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const aura = idOf(s, "p1", "battlefield", "Path to Redemption");
      // Pas pendant le tour adverse.
      let opp = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      opp = advanceUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(opp, "p1", aura)).toBe(false);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      s = settle(activate(s, "p1", aura));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Path to Redemption")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
    });

    it("Rabaroo Troop : atterrissage, le vol jusqu'à la fin du tour et 1 PV ; cycle de Plaine", () => {
      let s = scenario({ p1: { battlefield: ["Rabaroo Troop"], hand: ["Plains"] } });
      const troop = idOf(s, "p1", "battlefield", "Rabaroo Troop");
      expect(chars(s, troop).keywords).not.toContain("flying");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }));
      expect(chars(s, troop).keywords).toContain("flying");
      expect(s.players.p1?.life).toBe(21);
      const cycler = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Rabaroo Troop"], library: ["Opt", "Plains"] } });
      const t = settle(activate(cycler, "p1", idOf(cycler, "p1", "hand", "Rabaroo Troop")));
      expect(handNames(t)).toEqual(["Plains"]);
    });

    it("Razor Rings : 4 blessures à une créature attaquante, vous gagnez autant de PV que l'excédent", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Razor Rings"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Razor Rings", { targets: { t: [bear] } })).toThrow();
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(cast(s, "p1", "Razor Rings", { targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Sandbenders' Storm : détruit une créature de force 4 ou plus, ou maîtrise de la terre 3", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Plains", 5), hand: ["Sandbenders' Storm"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
      let s = setup();
      expect(() =>
        cast(s, "p1", "Sandbenders' Storm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      s = settle(cast(s, "p1", "Sandbenders' Storm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = setup();
      const land = idsOf(t, "p1", "battlefield", "Plains")[4] as string;
      t = settle(cast(t, "p1", "Sandbenders' Storm", { mode: 1, targets: { u: [land] } }));
      expect(chars(t, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(t, land)).toEqual([3, 3]);
    });

    it("South Pole Voyager : 1 PV par Allié qui arrive ; à la deuxième résolution du tour seulement, piochez", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["South Pole Voyager", "Kyoshi Warriors"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "South Pole Voyager"));
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p1?.hand).toHaveLength(1);
      // Les Guerrières puis leur jeton Allié : deuxième résolution (pioche), puis troisième (pas de pioche).
      s = settle(cast(s, "p1", "Kyoshi Warriors"));
      expect(s.players.p1?.life).toBe(23);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Southern Air Temple : X marqueurs +1/+1 sur chacune de vos créatures (X : vos Sanctuaires)", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Southern Air Temple"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Southern Air Temple"));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Suki : vos autres créatures ont +1/+0 ; un permanent qui part pendant votre tour crée un Allié, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Suki, Courageous Rescuer",
            "Bear Cub",
            "Curious Farm Animals",
            "Curious Farm Animals",
            ...lands("Plains", 4),
          ],
        },
      });
      const suki = idOf(s, "p1", "battlefield", "Suki, Courageous Rescuer");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(pt(s, suki)).toEqual([2, 4]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Curious Farm Animals")));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Ally"))).toEqual([2, 1]);
      // Une seule fois par tour : le second sacrifice ne crée pas d'autre Allié.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Curious Farm Animals")));
      expect(idsOf(s, "p1", "graveyard", "Curious Farm Animals")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
    });

    it("Team Avatar : une créature qui attaque seule gagne +X/+X ; {2}{W}, défaussez-la : X blessures", () => {
      let s = scenario({ p1: { battlefield: ["Team Avatar", "Bear Cub", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackWith(s, [bear]);
      expect(pt(s, bear)).toEqual([4, 4]);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Bear Cub"], hand: ["Team Avatar"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Team Avatar"), { t: [angel] }));
      expect(idsOf(t, "p1", "graveyard", "Team Avatar")).toHaveLength(1);
      expect(t.objects[angel]?.damage).toBe(2);
    });

    it("United Front : X Alliés 1/1, puis un marqueur +1/+1 sur chacune de vos créatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["United Front"] } });
      s = settle(cast(s, "p1", "United Front", { x: 2 }));
      const allies = idsOf(s, "p1", "battlefield", "Ally");
      expect(allies).toHaveLength(2);
      for (const id of [...allies, idOf(s, "p1", "battlefield", "Bear Cub")]) expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
    });

    it("Vengeful Villagers : en attaquant, engage une créature adverse ; en sacrifiant, un marqueur d'étourdissement", () => {
      let s = scenario({ p1: { battlefield: ["Vengeful Villagers", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      const villagers = idOf(s, "p1", "battlefield", "Vengeful Villagers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attackWith(s, [villagers], (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(angel)) return [angel];
        if (req.intent === "sacrifice") return [bear];
        return undefined;
      });
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[angel]?.counters.stun).toBe(1);
    });

    it("Water Tribe Captain : {5} : vos créatures gagnent +1/+1 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Water Tribe Captain", "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Water Tribe Captain")));
      expect(pt(s, idOf(s, "p1", "battlefield", "Water Tribe Captain"))).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
    });

    it("Water Tribe Rallier : maîtrise de l'eau {5}, une créature de force 3 ou moins parmi les quatre du dessus", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Water Tribe Rallier", "Bear Cub", "Bear Cub"],
          library: ["Serra Angel", "Bear Cub", "Opt", "Plains", "Island"],
        },
      });
      let options: string[] = [];
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Water Tribe Rallier")), (req) => {
        if (req.intent !== "lookAtTop" || req.type !== "pick") return undefined;
        options = req.options.map((id) => nameOf(s, String(id)) ?? "");
        return undefined;
      });
      expect(options).toEqual(["Bear Cub"]);
      expect(handNames(s)).toEqual(["Bear Cub"]);
    });

    it("Yip Yip! : +2/+2 ; un Allié gagne aussi le vol", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Plains", "Kyoshi Warriors", "Bear Cub"], hand: ["Yip Yip!", "Yip Yip!"] },
      });
      const warriors = idOf(s, "p1", "battlefield", "Kyoshi Warriors");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const [a, b] = idsOf(s, "p1", "hand", "Yip Yip!") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: a, targets: { t: [warriors] } }));
      s = settle(act(s, "p1", { type: "cast", card: b, targets: { t: [bear] } }));
      expect(pt(s, warriors)).toEqual([5, 5]);
      expect(chars(s, warriors).keywords).toContain("flying");
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).not.toContain("flying");
    });
  });
});
