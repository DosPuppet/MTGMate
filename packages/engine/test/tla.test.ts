/**
 * Avatar: The Last Airbender (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son
 * texte Oracle (plan R, lot R7). Maîtrise de l'air (Avatar's Wrath, Appa), maîtrise de la terre (Ba Sing Se), Leçons
 * (Combustion Technique, Accumulate Wisdom), kicker, coûts additionnels et contresorts.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import * as dsl from "../src/dsl";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, decider } from "../src/state";
import { canBlock } from "../src/turn";
import type { CardDef, ChoiceRequest, ChoiceValue, GameState, ManaType } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  cast,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  picking,
  scenario,
  settle,
  untilCastNow,
} from "./helpers";

type S = GameState;
const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
};
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

  it("Momo : un sort de créature sans le vol lancé d'abord ne consomme pas la réduction (premier non-Lémurien avec le vol)", () => {
    let s = scenario({
      p1: { battlefield: ["Momo, Friendly Flier", ...lands("Plains", 6)], hand: ["Savannah Lions", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Savannah Lions"));
    // Cinq Plaines restantes : l'Ange ({3}{W}{W}) coûte {1} de moins et en laisse une dégagée.
    s = settle(cast(s, "p1", "Serra Angel"));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && !s.objects[id]?.tapped)).toHaveLength(1);
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
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Choisit le mode `n` d'une capacité déclenchée modale, puis les objets voulus. */
  const modeThen =
    (n: number, want: string[] = []): Answer =>
    (req, p) =>
      req.intent === "triggerMode" ? [String(n)] : picking(want)(req, p);
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
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

describe("lot A, bleu", () => {
  type S = GameState;
  const activations = (s: S, player: string, source: string) =>
    legalActions(s, player).filter((x) => x.type === "activate" && x.source === source);
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, which = 0) => {
    const a = activations(s, player, source)[which];
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const tappedCount = (s: S, name: string) =>
    s.battlefield.filter((id) => nameOf(s, id) === name && s.objects[id]?.tapped).length;
  const attack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  /** Rituel à {0} : « piochez deux cartes ». */
  const drawTwo = customCard({
    name: "Test Double Draw",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: dsl.spell([], [dsl.fx.draw(2)]),
  });
  /** Rituel à {1}{U} : « piochez une carte ». */
  const divination = customCard({
    name: "Test Divination",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 1, colored: { U: 1 }, x: 0 },
    manaCostText: "{1}{U}",
    colors: ["U"],
    spell: dsl.spell([], [dsl.fx.draw(1)]),
  });
  const LESSONS = ["Boomerang Basics", "Octopus Form", "Lost Days"];

  describe("Avatar: The Last Airbender, lot A — bleu", () => {
    describe("Boomerang Basics", () => {
      const run = (whose: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: whose === "p1" ? ["Island", "Bear Cub"] : ["Island"], hand: ["Boomerang Basics"] },
          p2: { battlefield: whose === "p2" ? ["Bear Cub"] : [] },
        });
        const bear = idOf(s, whose, "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Boomerang Basics", { targets: { t: [bear] } }));
        return s;
      };

      it("renvoie votre permanent dans votre main et vous fait piocher", () => {
        const s = run("p1");
        expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest"]);
      });

      it("renvoie un permanent adverse sans pioche", () => {
        const s = run("p2");
        expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Ember Island Production : copie non légendaire 4/4 Héros d'une de vos créatures, ou 2/2 Lâche d'une adverse", () => {
      const base = () =>
        scenario({
          p1: { battlefield: [...lands("Island", 5), "Gran-Gran"], hand: ["Ember Island Production"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = base();
      const gran = idOf(s, "p1", "battlefield", "Gran-Gran");
      s = settle(cast(s, "p1", "Ember Island Production", { mode: 0, targets: { t: [gran] } }));
      const copies = idsOf(s, "p1", "battlefield", "Gran-Gran");
      expect(copies).toHaveLength(2);
      const token = copies.find((id) => id !== gran) as string;
      const c = chars(s, token);
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect(c.supertypes).not.toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Peasant", "Ally", "Hero"]));

      let t = base();
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = settle(cast(t, "p1", "Ember Island Production", { mode: 1, targets: { u: [angel] } }));
      const copy = idOf(t, "p1", "battlefield", "Serra Angel");
      expect(pt(t, copy)).toEqual([2, 2]);
      expect(chars(t, copy).subtypes).toEqual(expect.arrayContaining(["Angel", "Coward"]));
      expect(chars(t, copy).keywords).toContain("flying");
    });

    it("First-Time Flyer : +1/+1 tant qu'une carte de Leçon est dans votre cimetière", () => {
      const without = scenario({ p1: { battlefield: ["First-Time Flyer"], graveyard: ["Opt"] } });
      expect(pt(without, idOf(without, "p1", "battlefield", "First-Time Flyer"))).toEqual([1, 2]);
      const withLesson = scenario({ p1: { battlefield: ["First-Time Flyer"], graveyard: ["Octopus Form"] } });
      expect(pt(withLesson, idOf(withLesson, "p1", "battlefield", "First-Time Flyer"))).toEqual([2, 3]);
    });

    it("Flexible Waterbender : maîtrise de l'eau {3}, F/E de base 5/2 jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Flexible Waterbender", "Island", "Bear Cub"] } });
      const w = idOf(s, "p1", "battlefield", "Flexible Waterbender");
      s = settle(activate(s, "p1", w));
      expect(pt(s, w)).toEqual([5, 2]);
      // Payée par l'Île, l'Ours et la créature elle-même (chacun paie {1}) ; la vigilance reste.
      expect(s.battlefield.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(chars(s, w).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, w)).toEqual([2, 5]);
    });

    it("Geyser Leaper : maîtrise de l'eau {4}, piochez une carte puis défaussez-en une", () => {
      let s = scenario({
        p1: { battlefield: ["Geyser Leaper", ...lands("Island", 4)], hand: ["Opt"], library: ["Bear Cub", "Forest"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Geyser Leaper")), picking([opt]));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Giant Koi : maîtrise de l'eau {3}, imblocable ce tour-ci ; cycle d'Île {2}", () => {
      let s = scenario({ p1: { battlefield: ["Giant Koi", ...lands("Island", 3)] } });
      const koi = idOf(s, "p1", "battlefield", "Giant Koi");
      expect(chars(s, koi).keywords).not.toContain("unblockable");
      s = settle(activate(s, "p1", koi));
      expect(chars(s, koi).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, koi).keywords).not.toContain("unblockable");

      let h = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Giant Koi"], library: ["Forest", "Island"] } });
      const card = idOf(h, "p1", "hand", "Giant Koi");
      h = settle(activate(h, "p1", card));
      expect(idsOf(h, "p1", "graveyard", "Giant Koi")).toHaveLength(1);
      expect(h.players.p1?.hand.map((id) => nameOf(h, id))).toEqual(["Island"]);
    });

    describe("Gran-Gran", () => {
      it("quand elle devient engagée, piochez puis défaussez", () => {
        let s = scenario({ p1: { battlefield: ["Gran-Gran"], hand: ["Opt"], library: ["Bear Cub", "Forest"] } });
        const gran = idOf(s, "p1", "battlefield", "Gran-Gran");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(attack(s, [gran]), picking([opt]));
        expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });

      it("sorts non-créatures à {1} de moins avec trois Leçons ou plus au cimetière", () => {
        const run = (graveyard: string[]) => {
          const s = scenario({ p1: { battlefield: ["Gran-Gran", "Island"], hand: [divination, "Bear Cub"], graveyard } });
          return castable(s, "p1", idOf(s, "p1", "hand", "Test Divination"));
        };
        expect(run(LESSONS.slice(0, 2))).toBe(false);
        expect(run(LESSONS)).toBe(true);
      });
    });

    it("Honest Work : engage, retire les marqueurs ; Citoyen 1/1 sans capacités, « {T} : ajoutez {C} », nommé Humble Merchant", () => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Honest Work"] },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 2 } }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Honest Work", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
      const c = chars(s, angel);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.name).toBe("Humble Merchant");
      expect(c.subtypes).toEqual(["Citizen"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.abilities.filter((a) => a.kind === "mana")).toHaveLength(1);
      expect(c.abilities.some((a) => a.kind === "mana" && a.produce.includes("C"))).toBe(true);
    });

    it("Invasion Submersible : renvoie un permanent ; exhaust, maîtrise de l'eau {3} : créature-artefact avec trois marqueurs", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6)], hand: ["Invasion Submersible"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Invasion Submersible"), picking([bear]));
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      const sub = idOf(s, "p1", "battlefield", "Invasion Submersible");
      expect(chars(s, sub).types).not.toContain("Creature");
      s = settle(activate(s, "p1", sub));
      expect(s.objects[sub]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, sub).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      // L'effet dure : toujours une créature 3/3 au tour suivant ; exhaust ne s'active qu'une fois.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, sub)).toEqual([3, 3]);
      expect(activations(s, "p1", sub)).toHaveLength(0);
    });

    describe("Katara, Bending Prodigy", () => {
      it("au début de votre étape de fin, un marqueur +1/+1 seulement si elle est engagée", () => {
        const run = (tapped: boolean) => {
          let s = scenario({ p1: { battlefield: [{ name: "Katara, Bending Prodigy", tapped }] } });
          const k = idOf(s, "p1", "battlefield", "Katara, Bending Prodigy");
          s = advanceUntil(s, (x) => x.turn.active === "p2");
          return s.objects[k]?.counters["+1/+1"] ?? 0;
        };
        expect(run(true)).toBe(1);
        expect(run(false)).toBe(0);
      });

      it("maîtrise de l'eau {6} : piochez une carte", () => {
        let s = scenario({ p1: { battlefield: ["Katara, Bending Prodigy", ...lands("Island", 3), "Bear Cub", "Bear Cub"] } });
        const k = idOf(s, "p1", "battlefield", "Katara, Bending Prodigy");
        s = settle(activate(s, "p1", k));
        expect(s.players.p1?.hand).toHaveLength(1);
        // Les trois Îles, les deux Ours et Katara elle-même ont payé.
        expect(s.objects[k]?.tapped).toBe(true);
      });
    });

    it("Knowledge Seeker : un marqueur +1/+1 à la deuxième carte piochée de chaque tour", () => {
      let s = scenario({ p1: { battlefield: ["Knowledge Seeker"], hand: [drawTwo, drawTwo] } });
      const seeker = idOf(s, "p1", "battlefield", "Knowledge Seeker");
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(s.objects[seeker]?.counters["+1/+1"]).toBe(1);
      // Une seule fois par tour : les troisième et quatrième cartes ne comptent pas.
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(pt(s, seeker)).toEqual([3, 2]);
    });

    it("Knowledge Seeker : quand elle meurt, créez un Indice", () => {
      let s = scenario({ p1: { battlefield: ["Knowledge Seeker", "Mountain"], hand: ["Burst Lightning"] } });
      const seeker = idOf(s, "p1", "battlefield", "Knowledge Seeker");
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [seeker] } }));
      expect(idsOf(s, "p1", "graveyard", "Knowledge Seeker")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    describe("The Legend of Kuruk // Avatar Kuruk", () => {
      const KURUK = "The Legend of Kuruk // Avatar Kuruk";

      it("chapitre I : regard 2, puis piochez une carte", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: [KURUK], library: ["Bear Cub", "Opt", "Forest"] } });
        s = settle(cast(s, "p1", KURUK));
        const saga = idOf(s, "p1", "battlefield", KURUK);
        expect(s.objects[saga]?.counters.lore).toBe(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("chapitre III : Avatar Kuruk 4/3 ; un Esprit à chaque sort ; exhaust, maîtrise de l'eau {20} : un tour en plus", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: KURUK, counters: { lore: 2 } }, ...lands("Island", 19)],
            hand: ["Opt"],
            library: lands("Island", 10),
          },
        });
        s = advanceUntil(
          s,
          (x) =>
            x.battlefield.some((id) => chars(x, id).name === "Avatar Kuruk") &&
            x.stack.length === 0 &&
            x.triggers.length === 0 &&
            x.pending?.kind === "priority" &&
            x.pending.player === "p1",
        );
        expect([s.turn.active, s.turn.step]).toEqual(["p1", "main1"]);
        const avatar = idOf(s, "p1", "battlefield", KURUK);
        expect(chars(s, avatar).name).toBe("Avatar Kuruk");
        expect(pt(s, avatar)).toEqual([4, 3]);
        s = settle(cast(s, "p1", "Opt"));
        const spirit = idOf(s, "p1", "battlefield", "Spirit");
        expect(pt(s, spirit)).toEqual([1, 1]);
        expect(chars(s, spirit).colors).toEqual([]);
        // Les 18 Îles restantes, l'Esprit et Avatar Kuruk paient les 20.
        expect(s.extraTurns ?? []).toHaveLength(0);
        s = settle(activate(s, "p1", avatar));
        expect(s.extraTurns).toEqual(["p1"]);
        expect(s.objects[avatar]?.tapped).toBe(true);
        expect(s.objects[spirit]?.tapped).toBe(true);
      });
    });

    describe("Lost Days", () => {
      const run = (bottom: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Island", 5), hand: ["Lost Days"] },
          p2: { battlefield: ["Bear Cub"], library: ["Forest", "Forest", "Forest"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        let asked = "";
        s = settle(cast(s, "p1", "Lost Days", { targets: { t: [bear] } }), (req, player) => {
          if (req.intent !== "may") return undefined;
          asked = player;
          return [bottom ? 1 : 0];
        });
        return { s, asked };
      };

      it("le propriétaire la met en deuxième position depuis le dessus ; vous créez un Indice", () => {
        const { s, asked } = run(false);
        expect(asked).toBe("p2");
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Bear Cub", "Forest", "Forest"]);
        expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      });

      it("ou au-dessous de sa bibliothèque", () => {
        const { s } = run(true);
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest", "Forest", "Bear Cub"]);
        expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      });
    });

    it("Master Pakku : quand il devient engagé, le joueur ciblé meule autant de cartes que vous avez de Leçons au cimetière", () => {
      let s = scenario({
        p1: { battlefield: ["Master Pakku"], graveyard: [...LESSONS.slice(0, 2), "Opt"] },
        p2: { library: lands("Forest", 5) },
      });
      const pakku = idOf(s, "p1", "battlefield", "Master Pakku");
      s = settle(attack(s, [pakku]), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(s.players.p2?.library).toHaveLength(3);
    });

    it("The Mechanist : un Indice par sort non-créature ; {T} : un jeton artefact devient une Construction 3/1 volante", () => {
      let s = scenario({
        p1: { battlefield: ["The Mechanist, Aerial Artisan", "Island", "Forest", "Forest"], hand: ["Opt", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      // Un sort de créature ne crée pas d'Indice.
      const clue = idOf(s, "p1", "battlefield", "Clue");
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "The Mechanist, Aerial Artisan"), { t: [clue] }));
      const c = chars(s, clue);
      expect([c.power, c.toughness]).toEqual([3, 1]);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Clue", "Construct"]));
      expect(c.keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, clue).types).not.toContain("Creature");
    });

    it("North Pole Patrol : {T} dégage un autre de vos permanents ; maîtrise de l'eau {3}, {T} : engage une créature adverse", () => {
      const s = scenario({
        p1: { battlefield: ["North Pole Patrol", { name: "Island", tapped: true }, ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const patrol = idOf(s, "p1", "battlefield", "North Pole Patrol");
      const tapped = s.battlefield.find((id) => s.objects[id]?.tapped) as string;
      expect(() => activate(s, "p1", patrol, { t: [patrol] })).toThrow();
      let u = settle(activate(s, "p1", patrol, { t: [tapped] }));
      expect(u.objects[tapped]?.tapped).toBe(false);
      expect(u.objects[patrol]?.tapped).toBe(true);

      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      u = settle(activate(s, "p1", patrol, { t: [bear] }, 1));
      expect(u.objects[bear]?.tapped).toBe(true);
      expect(tappedCount(u, "Island")).toBe(4);
    });

    it("Octopus Form : +1/+1 et la défense talismanique jusqu'à la fin du tour, et dégage la créature", () => {
      let s = scenario({ p1: { battlefield: ["Island", { name: "Bear Cub", tapped: true }], hand: ["Octopus Form"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Octopus Form", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("hexproof");
    });

    it("Otter-Penguin : à la deuxième carte piochée, +1/+2 et imblocable ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Otter-Penguin"], hand: [drawTwo] } });
      const otter = idOf(s, "p1", "battlefield", "Otter-Penguin");
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(pt(s, otter)).toEqual([3, 3]);
      expect(chars(s, otter).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, otter)).toEqual([2, 1]);
    });

    it("Rowdy Snowballers : engage une créature adverse et y met un marqueur d'étourdissement", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Rowdy Snowballers"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Rowdy Snowballers"), picking([bear]));
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun).toBe(1);
      // L'étourdissement remplace son dégagement suivant.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun ?? 0).toBe(0);
    });

    describe("Serpent of the Pass", () => {
      it("coûte {1} de moins par carte non-créature non-terrain de votre cimetière", () => {
        const run = (islands: number) => {
          const s = scenario({
            p1: {
              battlefield: lands("Island", islands),
              hand: ["Serpent of the Pass"],
              graveyard: ["Opt", "Think Twice", "Cancel", "Forest", "Bear Cub"],
            },
          });
          return castable(s, "p1", idOf(s, "p1", "hand", "Serpent of the Pass"));
        };
        expect(run(3)).toBe(false);
        expect(run(4)).toBe(true);
      });

      it("se lance comme s'il avait le flash avec trois Leçons ou plus au cimetière", () => {
        const run = (graveyard: string[]) => {
          let s = scenario({ active: "p2", p1: { battlefield: lands("Island", 7), hand: ["Serpent of the Pass"], graveyard } });
          s = act(s, "p2", { type: "pass" });
          return castable(s, "p1", idOf(s, "p1", "hand", "Serpent of the Pass"));
        };
        expect(run(LESSONS.slice(0, 2))).toBe(false);
        expect(run(LESSONS)).toBe(true);
      });
    });

    it("Sokka's Haiku : contrecarre un sort, piochez, meulez trois cartes, dégagez un terrain", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 5), hand: ["Sokka's Haiku"], library: lands("Forest", 6) },
        p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
      const bolt = s.stack[0]?.id as string;
      s = act(s, "p2", { type: "pass" });
      const island = idsOf(s, "p1", "battlefield", "Island")[0] as string;
      s = settle(cast(s, "p1", "Sokka's Haiku", { targets: { s: [bolt], l: [island] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Forest", "Forest", "Sokka's Haiku"]);
      expect(tappedCount(s, "Island")).toBe(4);
    });

    it("The Spirit Oasis : piochez une carte par Sanctuaire en arrivant", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["The Spirit Oasis"] } });
      s = settle(cast(s, "p1", "The Spirit Oasis"));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    describe("Teo, Spirited Glider", () => {
      const run = (discard: string) => {
        let s = scenario({
          p1: { battlefield: ["Teo, Spirited Glider", "Bear Cub"], hand: ["Opt"], library: ["Forest", "Island"] },
        });
        const teo = idOf(s, "p1", "battlefield", "Teo, Spirited Glider");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = attack(s, [teo]);
        s = settle(s, (req) => {
          if (req.type !== "pick") return undefined;
          // Défausse : l'Opt, ou l'autre carte (la Forêt piochée).
          if (req.options.includes(opt)) return discard === "Opt" ? [opt] : req.options.filter((o) => o !== opt).slice(0, 1);
          return req.options.includes(bear) ? [bear] : undefined;
        });
        return { s, bear };
      };

      it("une créature volante attaque : piochez, défaussez ; une carte non-terrain donne un marqueur +1/+1", () => {
        const { s, bear } = run("Opt");
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      });

      it("défausser un terrain ne donne rien", () => {
        const { s, bear } = run("Forest");
        expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Forest"]);
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Tiger-Seal : engagé au début de votre entretien, dégagé à la deuxième carte piochée", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Tiger-Seal"], hand: [drawTwo] } });
      const seal = idOf(s, "p1", "battlefield", "Tiger-Seal");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0);
      expect(s.objects[seal]?.tapped).toBe(true);
      // La carte de l'étape de pioche est la première ; le sort en pioche deux autres.
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(s.objects[seal]?.tapped).toBe(false);
    });

    it("Ty Lee : engage une créature, qui ne se dégage plus tant que Ty Lee reste", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: ["Ty Lee, Chi Blocker", "Into the Roil"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ty Lee, Chi Blocker"), picking([bear]));
      expect(s.objects[bear]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Ty Lee, Chi Blocker")).keywords).toContain("prowess");
    });

    describe("Waterbender Ascension", () => {
      it("chaque blessure de combat à un joueur : un marqueur de quête ; à quatre ou plus, piochez", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Waterbender Ascension", counters: { quest: 2 } }, "Bear Cub", "Bear Cub"],
          },
        });
        const asc = idOf(s, "p1", "battlefield", "Waterbender Ascension");
        s = attack(s, idsOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.step === "main2");
        expect(s.objects[asc]?.counters.quest).toBe(4);
        // Le troisième marqueur ne fait pas piocher ; le quatrième, si.
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("maîtrise de l'eau {4} : une créature ciblée est imblocable ce tour-ci", () => {
        let s = scenario({ p1: { battlefield: ["Waterbender Ascension", ...lands("Island", 4), "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Waterbender Ascension"), { t: [bear] }));
        expect(chars(s, bear).keywords).toContain("unblockable");
      });
    });

    it("Waterbending Scroll : {6}, {T} : piochez ; {1} de moins par Île", () => {
      const run = (lands0: string[]) => {
        const s = scenario({ p1: { battlefield: ["Waterbending Scroll", ...lands0] } });
        return activations(s, "p1", idOf(s, "p1", "battlefield", "Waterbending Scroll")).length > 0;
      };
      expect(run(lands("Mountain", 5))).toBe(false);
      expect(run([...lands("Island", 2), "Mountain"])).toBe(false);
      expect(run(lands("Island", 3))).toBe(true);
      let s = scenario({ p1: { battlefield: ["Waterbending Scroll", ...lands("Island", 3)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Waterbending Scroll")));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(tappedCount(s, "Island")).toBe(3);
    });

    it("Watery Grasp : la créature enchantée ne se dégage pas ; maîtrise de l'eau {5} : elle est mélangée dans la bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 6), hand: ["Watery Grasp"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }], library: lands("Forest", 3) },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Watery Grasp", { targets: { enchant: [bear] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Watery Grasp")));
      expect(s.objects[bear]).toBeUndefined();
      expect(s.players.p2?.library.map((id) => nameOf(s, id))).toContain("Bear Cub");
      expect(idsOf(s, "p1", "graveyard", "Watery Grasp")).toHaveLength(1);
    });

    it("Yue : maîtrise de l'eau {5}, {T} : lancez un sort non-créature de votre main sans payer son coût", () => {
      let s = scenario({
        p1: { battlefield: ["Yue, the Moon Spirit", ...lands("Island", 5)], hand: ["Think Twice", "Bear Cub", "Forest"] },
      });
      const think = idOf(s, "p1", "hand", "Think Twice");
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Yue, the Moon Spirit"));
      s = untilCastNow(s);
      expect(castNowOf(s)?.cards).toEqual([think]);
      s = act(s, "p1", { type: "cast", card: think });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      expect(idsOf(s, "p1", "graveyard", "Think Twice")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(3);
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Répond « non » à toutes les questions « vous pouvez ». */
  const refusing: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  /** Active la capacité de la source dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const abilities = s.defs[s.objects[source]?.defId ?? ""]?.abilities ?? [];
    const ability = abilities.findIndex((a) => "label" in a && !!a.label?.includes(label));
    expect(ability).toBeGreaterThanOrEqual(0);
    return act(s, player, { type: "activate", source, ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** Rituel à {0} : « piochez une carte ». */
  const DRAW_ONE = customCard({
    name: "Test Draw One",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: dsl.spell([], [dsl.fx.draw(1)]),
  });
  const attack = (s: S, ids: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return cur;
  };

  describe("Avatar: The Last Airbender, lot A — noir", () => {
    it("Azula Always Lies : l'un ou les deux modes (−1/−1 jusqu'à la fin du tour, un marqueur +1/+1)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Azula Always Lies"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Azula Always Lies", { mode: 2, targets: { a: [theirs], b: [mine] } }));
      expect(pt(s, theirs)).toEqual([1, 1]);
      expect(s.objects[mine]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, mine)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, theirs)).toEqual([2, 2]);
    });

    it("Azula, On the Hunt : en attaquant, {R}{R} (maîtrise du feu 2), vous perdez 1 PV et créez un Indice", () => {
      let s = scenario({ p1: { battlefield: ["Azula, On the Hunt"] } });
      const azula = idOf(s, "p1", "battlefield", "Azula, On the Hunt");
      s = settle(attack(s, [azula]));
      expect(s.players.p1?.life).toBe(19);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      expect(s.players.p1?.manaPool.R).toBe(2);
    });

    it("Beetle-Headed Merchants : en attaquant, sacrifier une autre créature fait piocher et donne un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Beetle-Headed Merchants", "Bear Cub"], library: ["Opt", "Forest"] } });
      const beetle = idOf(s, "p1", "battlefield", "Beetle-Headed Merchants");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const hand = s.players.p1?.hand.length ?? 0;
      const no = settle(attack(s, [beetle]), refusing);
      expect(no.players.p1?.hand.length).toBe(hand);
      expect(no.objects[beetle]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(attack(s, [beetle]), picking([bear]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      expect(s.objects[beetle]?.counters["+1/+1"]).toBe(1);
    });
    it("Boiling Rock Rioter : engager un autre Allié exile une carte d'un cimetière ; en attaquant, vous pouvez lancer un Allié ainsi exilé", () => {
      let s = scenario({
        p1: {
          battlefield: ["Boiling Rock Rioter", "Merchant of Many Hats", ...lands("Swamp", 2)],
          graveyard: ["Merchant of Many Hats"],
        },
        p2: { graveyard: ["Bear Cub"] },
      });
      const rioter = idOf(s, "p1", "battlefield", "Boiling Rock Rioter");
      const ally = idOf(s, "p1", "battlefield", "Merchant of Many Hats");
      const card = idOf(s, "p1", "graveyard", "Merchant of Many Hats");
      s = settle(activate(s, "p1", rioter, "autre Allié", { targets: { t: [card] } }));
      expect(s.objects[ally]?.tapped).toBe(true);
      expect(s.objects[rioter]?.tapped).toBe(false);
      const exiledCard = exiled(s, "Merchant of Many Hats")[0] as string;
      expect(exiledCard).toBeDefined();
      s = untilCastNow(attack(s, [rioter]));
      expect(castNowOf(s)?.cards).toEqual([exiledCard]);
      s = settle(act(s, "p1", { type: "cast", card: exiledCard }));
      expect(idsOf(s, "p1", "battlefield", "Merchant of Many Hats")).toHaveLength(2);
    });

    it("Boiling Rock Rioter : une carte exilée qui n'est pas un Allié, ou qui ne vous appartient pas, ne peut pas être lancée", () => {
      let s = scenario({
        p1: { battlefield: ["Boiling Rock Rioter", "Merchant of Many Hats", ...lands("Swamp", 2)] },
        p2: { graveyard: ["Merchant of Many Hats"] },
      });
      const rioter = idOf(s, "p1", "battlefield", "Boiling Rock Rioter");
      const theirs = s.players.p2?.graveyard[0] as string;
      s = settle(activate(s, "p1", rioter, "autre Allié", { targets: { t: [theirs] } }));
      expect(exiled(s, "Merchant of Many Hats")).toHaveLength(1);
      s = settle(attack(s, [rioter]));
      expect(castNowOf(s)).toBeUndefined();
      expect(idsOf(s, "p1", "battlefield", "Merchant of Many Hats")).toHaveLength(1);
    });

    it("Buzzard-Wasp Colony : en arrivant, sacrifier un artefact ou une créature fait piocher", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Buzzard-Wasp Colony"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Buzzard-Wasp Colony"), picking([bear]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Buzzard-Wasp Colony : une autre de vos créatures meurt avec des marqueurs : ils vont sur la colonie", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Buzzard-Wasp Colony",
            { name: "Bear Cub", counters: { "+1/+1": 2 } },
            "Savannah Lions",
            ...lands("Swamp", 6),
          ],
          hand: ["Murder", "Murder"],
        },
      });
      const colony = idOf(s, "p1", "battlefield", "Buzzard-Wasp Colony");
      const [m1, m2] = idsOf(s, "p1", "hand", "Murder") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: m1, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(s.objects[colony]?.counters["+1/+1"]).toBe(2);
      expect(pt(s, colony)).toEqual([4, 4]);
      // Sans marqueur : rien.
      s = settle(act(s, "p1", { type: "cast", card: m2, targets: { t: [idOf(s, "p1", "battlefield", "Savannah Lions")] } }));
      expect(s.objects[colony]?.counters["+1/+1"]).toBe(2);
    });

    it("Canyon Crawler : en arrivant, une Nourriture ; cycle de Marais {2}", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Canyon Crawler"] } });
      s = settle(cast(s, "p1", "Canyon Crawler"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Canyon Crawler"], library: ["Forest", "Swamp", "Forest"] },
      });
      const crawler = idOf(t, "p1", "hand", "Canyon Crawler");
      const cycling = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === crawler);
      expect(cycling).toBeDefined();
      t = settle(
        act(t, "p1", { type: "activate", source: crawler, ability: cycling?.type === "activate" ? cycling.ability : -1 }),
      );
      expect(handNames(t)).toEqual(["Swamp"]);
      expect(idsOf(t, "p1", "graveyard", "Canyon Crawler")).toHaveLength(1);
    });

    it("Cat-Gator : en arrivant, inflige autant de blessures que vous contrôlez de Marais (lien de vie)", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), ...lands("Plains", 2)], hand: ["Cat-Gator"], life: 10 } });
      s = settle(cast(s, "p1", "Cat-Gator"), picking(["p2"]));
      expect(s.players.p2?.life).toBe(15);
      expect(s.players.p1?.life).toBe(15);
    });

    it("Corrupt Court Official : en arrivant, l'adversaire ciblé défausse une carte", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Corrupt Court Official"] }, p2: { hand: ["Opt"] } });
      s = settle(cast(s, "p1", "Corrupt Court Official"));
      expect(s.players.p2?.hand).toHaveLength(0);
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Dai Li Indoctrination : vous choisissez une carte de permanent non-terrain de la main révélée ; ou maîtrise de la terre 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Dai Li Indoctrination"] },
        p2: { hand: ["Opt", "Forest", "Bear Cub"] },
      });
      const bear = idOf(s, "p2", "hand", "Bear Cub");
      let options: string[] = [];
      let chooser = "";
      s = settle(cast(s, "p1", "Dai Li Indoctrination", { mode: 0, targets: { p: ["p2"] } }), (req, player) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        chooser = player;
        return undefined;
      });
      expect(chooser).toBe("p1");
      expect(options).toEqual([bear]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(handNames(s, "p2").sort()).toEqual(["Forest", "Opt"]);

      let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Dai Li Indoctrination"] } });
      const land = idsOf(t, "p1", "battlefield", "Swamp")[2] as string;
      t = settle(cast(t, "p1", "Dai Li Indoctrination", { mode: 1, targets: { t: [land] } }));
      expect(chars(t, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(t, land)).toEqual([2, 2]);
    });

    it("Epic Downfall : exile une créature de valeur de mana 3 ou plus, pas moins", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Epic Downfall"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Epic Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
      const t = settle(cast(s, "p1", "Epic Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(exiled(t, "Serra Angel")).toHaveLength(1);
    });

    it("Fatal Fissure : quand la créature choisie meurt ce tour-ci, vous maîtrisez la terre 4", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Forest"], hand: ["Fatal Fissure", "Murder"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(cast(s, "p1", "Fatal Fissure", { targets: { t: [angel] } }));
      expect(s.objects[forest]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Murder", { targets: { t: [angel] } }), picking([forest]));
      expect(s.objects[forest]?.counters["+1/+1"]).toBe(4);
      expect(pt(s, forest)).toEqual([4, 4]);
      expect(chars(s, forest).keywords).toContain("haste");
    });

    describe("The Fire Nation Drill", () => {
      it("en arrivant, vous pouvez l'engager : détruisez une créature de force 4 ou moins", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["The Fire Nation Drill"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub", "Gigantosaurus"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const giant = idOf(s, "p2", "battlefield", "Gigantosaurus");
        let options: string[] = [];
        s = settle(cast(s, "p1", "The Fire Nation Drill"), (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options.map(String);
          return [angel];
        });
        expect(options).toEqual(expect.arrayContaining([angel, idOf(s, "p2", "battlefield", "Bear Cub")]));
        expect(options).not.toContain(giant);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "The Fire Nation Drill")]?.tapped).toBe(true);
      });

      it("sans l'engager, rien n'est détruit et il reste dégagé", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["The Fire Nation Drill"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Fire Nation Drill"), refusing);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "The Fire Nation Drill")]?.tapped).toBe(false);
      });

      it("{1} : les permanents adverses perdent l'indestructibilité jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["The Fire Nation Drill", ...lands("Swamp", 4)], hand: ["Murder"] },
          p2: { battlefield: ["Darksteel Colossus"] },
        });
        const colossus = idOf(s, "p2", "battlefield", "Darksteel Colossus");
        expect(chars(s, colossus).keywords).toContain("indestructible");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "The Fire Nation Drill"), "perdent"));
        expect(chars(s, colossus).keywords).not.toContain("indestructible");
        s = settle(cast(s, "p1", "Murder", { targets: { t: [colossus] } }));
        expect(idsOf(s, "p2", "battlefield", "Darksteel Colossus")).toHaveLength(0);
      });
    });

    it("Fire Nation Engineer : raid — à votre étape de fin, un marqueur +1/+1 sur une autre créature, seulement si vous avez attaqué", () => {
      const base = scenario({ p1: { battlefield: ["Fire Nation Engineer", "Bear Cub"] } });
      const bear = idOf(base, "p1", "battlefield", "Bear Cub");
      const engineer = idOf(base, "p1", "battlefield", "Fire Nation Engineer");
      const quiet = advanceUntil(base, (x) => x.turn.active === "p2");
      expect(quiet.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      let s = settle(attack(base, [bear]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[engineer]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Fire Navy Trebuchet : quand vous attaquez, un Ballistic Boulder 2/1 volant engagé et attaquant, sacrifié à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Fire Navy Trebuchet", "Bear Cub"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      const boulder = idOf(s, "p1", "battlefield", "Ballistic Boulder");
      expect(pt(s, boulder)).toEqual([2, 1]);
      expect(chars(s, boulder).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, boulder).keywords).toContain("flying");
      expect(s.objects[boulder]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === boulder)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Ballistic Boulder")).toHaveLength(0);
    });

    it("Foggy Swamp Hunters : lien de vie et menace dès la deuxième carte piochée du tour", () => {
      let s = scenario({ p1: { battlefield: ["Foggy Swamp Hunters"], hand: [DRAW_ONE, DRAW_ONE] } });
      const hunters = idOf(s, "p1", "battlefield", "Foggy Swamp Hunters");
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(chars(s, hunters).keywords).not.toContain("lifelink");
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(chars(s, hunters).keywords).toEqual(expect.arrayContaining(["lifelink", "menace"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      // Au tour suivant, une seule carte piochée (par l'adversaire, pas par vous) : plus rien.
      expect(chars(s, hunters).keywords).not.toContain("lifelink");
    });
    it("Hog-Monkey : au début de votre combat, une de vos créatures avec un marqueur +1/+1 gagne la menace ; exhaust {5}", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hog-Monkey", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Savannah Lions", ...lands("Swamp", 5)],
        },
      });
      const hog = idOf(s, "p1", "battlefield", "Hog-Monkey");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", hog, "Exhaust"));
      expect(s.objects[hog]?.counters["+1/+1"]).toBe(2);
      expect(pt(s, hog)).toEqual([5, 4]);
      expect(canActivate(s, "p1", hog)).toBe(false);
      let options: string[] = [];
      s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.type === "pick");
      expect(s.turn.step).toBe("beginCombat");
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        return [bear];
      });
      expect(options.sort()).toEqual([bear, hog].sort());
      expect(chars(s, bear).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).not.toContain("menace");
    });

    it("Joo Dee, One of Many : surveillance 1, un jeton copie, puis vous sacrifiez un artefact ou une créature ; en rituel", () => {
      let s = scenario({ p1: { battlefield: ["Joo Dee, One of Many", "Swamp", "Bear Cub"], library: ["Opt", "Forest"] } });
      const joo = idOf(s, "p1", "battlefield", "Joo Dee, One of Many");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", joo, "Surveillance"), (req) =>
        req.intent === "surveilGraveyard" ? (req.type === "pick" ? req.options : undefined) : picking([bear])(req, "p1"),
      );
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Joo Dee, One of Many")).toHaveLength(2);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const t = scenario({
        active: "p2",
        p1: { battlefield: ["Joo Dee, One of Many", "Swamp"] },
      });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Joo Dee, One of Many"))).toBe(false);
    });

    it("June, Bounty Hunter : imblocable dès deux cartes piochées ; sacrifier une autre créature crée un Indice, pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: ["June, Bounty Hunter", "Bear Cub", "Swamp"], hand: [DRAW_ONE, DRAW_ONE] },
      });
      const june = idOf(s, "p1", "battlefield", "June, Bounty Hunter");
      expect(chars(s, june).keywords).not.toContain("unblockable");
      s = settle(cast(s, "p1", "Test Draw One"));
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(chars(s, june).keywords).toContain("unblockable");
      s = settle(activate(s, "p1", june, "Indice"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      const t = scenario({ active: "p2", p1: { battlefield: ["June, Bounty Hunter", "Bear Cub", "Swamp"] } });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "June, Bounty Hunter"))).toBe(false);
    });

    it("Mai, Scornful Striker : le joueur qui lance un sort non-créature perd 2 PV (vous compris), pas pour une créature", () => {
      let s = scenario({
        p1: { battlefield: ["Mai, Scornful Striker", "Island", "Forest"], hand: ["Opt", "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.life).toBe(18);
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.players.p1?.life).toBe(18);
      expect(s.players.p2?.life).toBe(20);
      let o = scenario({
        active: "p2",
        p1: { battlefield: ["Mai, Scornful Striker"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      o = settle(cast(o, "p2", "Opt"));
      expect(o.players.p2?.life).toBe(18);
      expect(o.players.p1?.life).toBe(20);
    });

    it("Merchant of Many Hats : {2}{B} : revient de votre cimetière dans votre main", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), graveyard: ["Merchant of Many Hats"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Merchant of Many Hats"), "cimetière"));
      expect(handNames(s)).toEqual(["Merchant of Many Hats"]);
    });

    it("Northern Air Temple : en arrivant, drain de X (vos Sanctuaires) ; chaque autre Sanctuaire qui arrive draine 1", () => {
      const shrine = customCard({
        name: "Test Shrine",
        types: ["Enchantment"],
        typeLine: "Enchantment — Shrine",
        subtypes: ["Shrine"],
      });
      let s = scenario({ p1: { battlefield: [shrine, "Swamp"], hand: ["Northern Air Temple", shrine] } });
      s = settle(cast(s, "p1", "Northern Air Temple"));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(22);
      s = settle(cast(s, "p1", "Test Shrine"));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Ozai's Cruelty : 2 blessures au joueur ciblé, qui défausse deux cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Ozai's Cruelty"] },
        p2: { hand: ["Opt", "Forest", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Ozai's Cruelty", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    describe("Phoenix Fleet Airship", () => {
      it("à votre étape de fin, si vous avez sacrifié un permanent ce tour-ci, un jeton copie", () => {
        const quiet = advanceUntil(scenario({ p1: { battlefield: ["Phoenix Fleet Airship"] } }), (x) => x.turn.active === "p2");
        expect(idsOf(quiet, "p1", "battlefield", "Phoenix Fleet Airship")).toHaveLength(1);
        let s = scenario({ p1: { battlefield: ["Phoenix Fleet Airship", "June, Bounty Hunter", "Bear Cub", "Swamp"] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "June, Bounty Hunter"), "Indice"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        const ships = idsOf(s, "p1", "battlefield", "Phoenix Fleet Airship");
        expect(ships).toHaveLength(2);
        expect(ships.some((id) => s.objects[id]?.isToken)).toBe(true);
      });

      it("avec huit Phoenix Fleet Airship ou plus, c'est une créature-artefact", () => {
        const seven = scenario({ p1: { battlefield: lands("Phoenix Fleet Airship", 7) } });
        expect(chars(seven, idOf(seven, "p1", "battlefield", "Phoenix Fleet Airship")).types).not.toContain("Creature");
        const eight = scenario({ p1: { battlefield: lands("Phoenix Fleet Airship", 8) } });
        const ship = idOf(eight, "p1", "battlefield", "Phoenix Fleet Airship");
        expect(chars(eight, ship).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(pt(eight, ship)).toEqual([4, 4]);
      });
    });

    it("Pirate Peddlers : chaque fois que vous sacrifiez un autre permanent, un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Pirate Peddlers", "Joo Dee, One of Many", "Swamp"] } });
      const peddlers = idOf(s, "p1", "battlefield", "Pirate Peddlers");
      const joo = idOf(s, "p1", "battlefield", "Joo Dee, One of Many");
      s = settle(activate(s, "p1", joo, "Surveillance"), picking([joo]));
      expect(s.objects[peddlers]?.counters["+1/+1"]).toBe(1);
    });

    it("Sold Out : exile la créature ; un Indice seulement si elle a subi des blessures ce tour-ci", () => {
      const run = (damage: number) => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["Sold Out"] },
          p2: { battlefield: [{ name: "Serra Angel", damage }] },
        });
        s = settle(cast(s, "p1", "Sold Out", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        return s;
      };
      const hurt = run(1);
      expect(exiled(hurt, "Serra Angel")).toHaveLength(1);
      expect(idsOf(hurt, "p1", "battlefield", "Clue")).toHaveLength(1);
      const fresh = run(0);
      expect(exiled(fresh, "Serra Angel")).toHaveLength(1);
      expect(idsOf(fresh, "p1", "battlefield", "Clue")).toHaveLength(0);
    });

    it("Swampsnare Trap : {1} de moins s'il cible une créature volante ; la créature enchantée prend −5/−3", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Swampsnare Trap"] },
        p2: { battlefield: ["Serra Angel", "Gigantosaurus"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const giant = idOf(s, "p2", "battlefield", "Gigantosaurus");
      expect(() => cast(s, "p1", "Swampsnare Trap", { targets: { enchant: [giant] } })).toThrow();
      const t = settle(cast(s, "p1", "Swampsnare Trap", { targets: { enchant: [angel] } }));
      expect(idsOf(t, "p1", "battlefield", "Swampsnare Trap")).toHaveLength(1);
      expect(pt(t, angel)).toEqual([-1, 1]);
      const u = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Swampsnare Trap"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      const v = settle(cast(u, "p1", "Swampsnare Trap", { targets: { enchant: [giant] } }));
      expect(pt(v, giant)).toEqual([5, 7]);
    });

    it("Tundra Tank : en arrivant, une de vos créatures gagne l'indestructibilité jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Tundra Tank"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Tundra Tank"));
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
    });

    it("Wolfbat : à votre deuxième carte piochée, payer {B} le renvoie du cimetière avec un marqueur de finalité", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], graveyard: ["Wolfbat"], hand: [DRAW_ONE, DRAW_ONE] } });
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(idsOf(s, "p1", "graveyard", "Wolfbat")).toHaveLength(1);
      s = settle(cast(s, "p1", "Test Draw One"));
      const bat = idOf(s, "p1", "battlefield", "Wolfbat");
      expect(s.objects[bat]?.counters.finality).toBe(1);
      // Marqueur de finalité : s'il devait mourir, il est exilé à la place.
      let t = scenario({ p1: { battlefield: ["Swamp"], graveyard: ["Wolfbat"], hand: [DRAW_ONE, DRAW_ONE] } });
      t = settle(cast(t, "p1", "Test Draw One"));
      t = settle(cast(t, "p1", "Test Draw One"), refusing);
      expect(idsOf(t, "p1", "graveyard", "Wolfbat")).toHaveLength(1);
    });

    it("Zuko's Conviction : renvoie une carte de créature en main, ou sur le champ de bataille engagée si elle est kickée", () => {
      const run = (kicked: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Zuko's Conviction"], graveyard: ["Serra Angel"] } });
        const angel = idOf(s, "p1", "graveyard", "Serra Angel");
        s = settle(cast(s, "p1", "Zuko's Conviction", { kicked, targets: { t: [angel] } }));
        return s;
      };
      const plain = run(false);
      expect(handNames(plain)).toEqual(["Serra Angel"]);
      const kicked = run(true);
      const angel = idOf(kicked, "p1", "battlefield", "Serra Angel");
      expect(kicked.objects[angel]?.tapped).toBe(true);
      expect(kicked.players.p1?.hand).toHaveLength(0);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** Avance jusqu'à la déclaration des attaquants de p1, puis attaque p2 avec ces créatures. */
  const attack = (s: S, ids: string[]) => {
    const t = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(t, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  /** Sanctuaire de test (enchantement à {0}). */
  const shrine = (name: string) =>
    customCard({ name, types: ["Enchantment"], typeLine: "Enchantment — Shrine", subtypes: ["Shrine"] });

  describe("Avatar: The Last Airbender, lot A — rouge", () => {
    it("Boar-q-pine : un marqueur +1/+1 à chaque sort non-créature que vous lancez", () => {
      let s = scenario({ p1: { battlefield: ["Boar-q-pine", "Island", ...lands("Forest", 2)], hand: ["Opt", "Bear Cub"] } });
      const boar = idOf(s, "p1", "battlefield", "Boar-q-pine");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[boar]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[boar]?.counters["+1/+1"]).toBe(1);
    });

    describe("Bumi Bash", () => {
      it("inflige autant de blessures que vous contrôlez de terrains", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Bumi Bash"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = settle(cast(s, "p1", "Bumi Bash", { mode: 0, targets: { t: [dragon] } }));
        expect(s.objects[dragon]?.damage).toBe(4);
      });

      it("détruit un terrain non de base, mais pas un terrain de base qui n'est pas une créature", () => {
        const s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Bumi Bash"] },
          p2: { battlefield: ["Ba Sing Se", "Forest"] },
        });
        const forest = idOf(s, "p2", "battlefield", "Forest");
        expect(() => cast(s, "p1", "Bumi Bash", { mode: 1, targets: { u: [forest] } })).toThrow();
        const t = settle(cast(s, "p1", "Bumi Bash", { mode: 1, targets: { u: [idOf(s, "p2", "battlefield", "Ba Sing Se")] } }));
        expect(idsOf(t, "p2", "graveyard", "Ba Sing Se")).toHaveLength(1);
      });
    });

    it("The Cave of Two Lovers : deux Alliés, puis une Montagne en main, puis maîtrise de la terre 3", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 4),
          hand: ["The Cave of Two Lovers"],
          library: ["Opt", "Mountain", ...lands("Plains", 8)],
        },
      });
      s = settle(cast(s, "p1", "The Cave of Two Lovers"));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      expect(handNames(s).filter((n) => n === "Mountain")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      const animated = s.battlefield.filter((id) => s.objects[id]?.counters["+1/+1"] === 3);
      expect(animated).toHaveLength(1);
      const land = animated[0] as string;
      expect(chars(s, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(s, land)).toEqual([3, 3]);
      expect(idsOf(s, "p1", "graveyard", "The Cave of Two Lovers")).toHaveLength(1);
    });

    describe("Combustion Man", () => {
      const run = (accept: boolean) => {
        let s = scenario({ p1: { battlefield: ["Combustion Man"] }, p2: { battlefield: ["Serra Angel"] } });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = attack(s, [idOf(s, "p1", "battlefield", "Combustion Man")]);
        let asked = "";
        s = settle(s, (req, player) => {
          if (req.type === "pick" && req.options.includes(angel)) return [angel];
          if (req.type === "yesNo") {
            asked = player;
            return [accept ? 1 : 0];
          }
          return undefined;
        });
        return { s, angel, asked };
      };

      it("le contrôleur du permanent qui refuse les blessures le voit détruit", () => {
        const { s, asked } = run(false);
        expect(asked).toBe("p2");
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(20);
      });

      it("s'il accepte, il subit des blessures égales à la force de Combustion Man et le permanent reste", () => {
        const { s, angel } = run(true);
        expect(s.battlefield).toContain(angel);
        expect(s.players.p2?.life).toBe(16);
      });
    });

    it("Crescent Island Temple : un Moine par Sanctuaire en arrivant, puis un par autre Sanctuaire qui arrive", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), shrine("Test Shrine A")],
          hand: ["Crescent Island Temple", shrine("Test Shrine B")],
        },
      });
      s = settle(cast(s, "p1", "Crescent Island Temple"));
      const monks = idsOf(s, "p1", "battlefield", "Monk");
      expect(monks).toHaveLength(2);
      expect(chars(s, monks[0] as string).keywords).toContain("prowess");
      expect(chars(s, monks[0] as string).colors).toEqual(["R"]);
      s = settle(cast(s, "p1", "Test Shrine B"));
      expect(idsOf(s, "p1", "battlefield", "Monk")).toHaveLength(3);
    });

    it("Cunning Maneuver : +3/+1 jusqu'à la fin du tour et un Indice", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Cunning Maneuver"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Cunning Maneuver", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 3]);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Deserter's Disciple : une autre de vos créatures de force 2 ou moins ne peut pas être bloquée ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Deserter's Disciple", "Bear Cub", "Serra Angel"] } });
      const disciple = idOf(s, "p1", "battlefield", "Deserter's Disciple");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => activate(s, "p1", disciple, { t: [idOf(s, "p1", "battlefield", "Serra Angel")] })).toThrow();
      expect(() => activate(s, "p1", disciple, { t: [disciple] })).toThrow();
      s = settle(activate(s, "p1", disciple, { t: [bear] }));
      expect(chars(s, bear).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("unblockable");
    });

    it("Fire Nation Attacks : deux Soldats 2/2 avec la maîtrise du feu 1 ; flashback {8}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 9), hand: ["Fire Nation Attacks"] } });
      s = settle(cast(s, "p1", "Fire Nation Attacks"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect(pt(s, soldiers[0] as string)).toEqual([2, 2]);
      expect(chars(s, soldiers[0] as string).abilities.some((a) => "label" in a && a.label === "Maîtrise du feu 1")).toBe(true);
      // Il reste quatre Montagnes : pas assez pour le flashback.
      const card = idOf(s, "p1", "graveyard", "Fire Nation Attacks");
      expect(castable(s, "p1", card)).toBe(false);
      let t = scenario({ p1: { battlefield: lands("Mountain", 9), graveyard: ["Fire Nation Attacks"] } });
      const fromGraveyard = idOf(t, "p1", "graveyard", "Fire Nation Attacks");
      expect(castable(t, "p1", fromGraveyard)).toBe(true);
      t = settle(act(t, "p1", { type: "cast", card: fromGraveyard }));
      expect(idsOf(t, "p1", "battlefield", "Soldier")).toHaveLength(2);
      expect(exiled(t, "Fire Nation Attacks")).toHaveLength(1);
    });

    describe("Fire Nation Cadets", () => {
      it("a la maîtrise du feu 2 seulement avec une Leçon dans votre cimetière", () => {
        const without = scenario({ p1: { battlefield: ["Fire Nation Cadets"], graveyard: ["Opt"] } });
        const a = idOf(without, "p1", "battlefield", "Fire Nation Cadets");
        expect(chars(without, a).abilities.some((x) => "label" in x && x.label === "Maîtrise du feu 2")).toBe(false);
        let s = scenario({ p1: { battlefield: ["Fire Nation Cadets"], graveyard: ["Firebending Lesson"] } });
        const cadets = idOf(s, "p1", "battlefield", "Fire Nation Cadets");
        s = attack(s, [cadets]);
        s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
        expect(s.players.p1?.manaPool.R).toBe(2);
      });

      it("{2} : +1/+0 jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Fire Nation Cadets", ...lands("Mountain", 2)] } });
        const cadets = idOf(s, "p1", "battlefield", "Fire Nation Cadets");
        s = settle(activate(s, "p1", cadets));
        expect(pt(s, cadets)).toEqual([2, 2]);
      });
    });

    it("Fire Nation Raider : un Indice seulement si vous avez attaqué ce tour-ci (raid)", () => {
      const calm = settle(
        cast(scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Fire Nation Raider"] } }), "p1", "Fire Nation Raider"),
      );
      expect(idsOf(calm, "p1", "battlefield", "Clue")).toHaveLength(0);
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Fire Nation Raider"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
      s = settle(cast(s, "p1", "Fire Nation Raider"));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    it("Fire Sages : {1}{R}{R} met un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Fire Sages", ...lands("Mountain", 3)] } });
      const sages = idOf(s, "p1", "battlefield", "Fire Sages");
      s = settle(activate(s, "p1", sages));
      expect(s.objects[sages]?.counters["+1/+1"]).toBe(1);
    });

    it("Firebending Student : maîtrise du feu X, X étant sa force", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Firebending Student", counters: { "+1/+1": 2 } }] } });
      const student = idOf(s, "p1", "battlefield", "Firebending Student");
      expect(chars(s, student).keywords).toContain("prowess");
      s = attack(s, [student]);
      s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
      expect(s.players.p1?.manaPool.R).toBe(3);
    });

    it("How to Start a Riot : la menace à une créature, +2/+0 aux créatures du joueur ciblé", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["How to Start a Riot"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const [angel, theirs] = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")];
      s = settle(cast(s, "p1", "How to Start a Riot", { targets: { t: [mine], p: ["p2"] } }));
      expect(chars(s, mine).keywords).toContain("menace");
      expect(pt(s, mine)).toEqual([2, 2]);
      expect(pt(s, angel)).toEqual([6, 4]);
      expect(pt(s, theirs)).toEqual([4, 2]);
    });

    it("Jeong Jeong : exhaust {3}, un marqueur +1/+1 et le prochain sort de Leçon de ce tour-ci est copié", () => {
      let s = scenario({
        p1: { battlefield: ["Jeong Jeong, the Deserter", ...lands("Mountain", 4)], hand: ["Firebending Lesson"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const jeong = idOf(s, "p1", "battlefield", "Jeong Jeong, the Deserter");
      s = settle(activate(s, "p1", jeong));
      expect(s.objects[jeong]?.counters["+1/+1"]).toBe(1);
      expect(canActivate(s, "p1", jeong)).toBe(false);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Firebending Lesson", { targets: { t: [angel] } }));
      // 2 blessures par l'original, 2 par la copie : l'Ange 4/4 meurt.
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    describe("Jet's Brainwashing", () => {
      it("sans kicker : la créature ne peut pas bloquer ce tour-ci, et un Indice", () => {
        let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Jet's Brainwashing"] }, p2: { battlefield: ["Bear Cub"] } });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Jet's Brainwashing", { targets: { t: [bear] } }));
        expect(chars(s, bear).keywords).toContain("cantBlock");
        expect(s.objects[bear]?.controller).toBe("p2");
        expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      });

      it("kickée : vous en prenez le contrôle jusqu'à la fin du tour, dégagée et avec la célérité", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Jet's Brainwashing"] },
          p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Jet's Brainwashing", { kicked: true, targets: { t: [bear] } }));
        expect(s.objects[bear]?.controller).toBe("p1");
        expect(s.objects[bear]?.tapped).toBe(false);
        expect(chars(s, bear).keywords).toContain("haste");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.objects[bear]?.controller).toBe("p2");
      });
    });

    it("Mai : exhaust {3}, un marqueur de double initiative (une seule fois)", () => {
      let s = scenario({ p1: { battlefield: ["Mai, Jaded Edge", ...lands("Mountain", 6)] } });
      const mai = idOf(s, "p1", "battlefield", "Mai, Jaded Edge");
      s = settle(activate(s, "p1", mai));
      expect(s.objects[mai]?.counters.doubleStrike).toBe(1);
      expect(chars(s, mai).keywords).toContain("doubleStrike");
      expect(canActivate(s, "p1", mai)).toBe(false);
    });

    describe("Mongoose Lizard", () => {
      it("en arrivant, 1 blessure à n'importe quelle cible", () => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Mongoose Lizard"] } });
        s = settle(cast(s, "p1", "Mongoose Lizard"), picking(["p2"]));
        expect(s.players.p2?.life).toBe(19);
        expect(chars(s, idOf(s, "p1", "battlefield", "Mongoose Lizard")).keywords).toContain("menace");
      });

      it("cycle de Montagne {2} : une Montagne de la bibliothèque en main", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 2), hand: ["Mongoose Lizard"], library: ["Opt", "Mountain", "Forest"] },
        });
        const lizard = idOf(s, "p1", "hand", "Mongoose Lizard");
        s = settle(activate(s, "p1", lizard));
        expect(idsOf(s, "p1", "graveyard", "Mongoose Lizard")).toHaveLength(1);
        expect(handNames(s)).toEqual(["Mountain"]);
      });
    });

    describe("Ran and Shaw", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Ran and Shaw"], graveyard } });
        return settle(cast(s, "p1", "Ran and Shaw"));
      };

      it("lancée avec trois cartes de Dragon ou de Leçon au cimetière : un jeton copie non légendaire", () => {
        const s = run(["Shivan Dragon", "Firebending Lesson", "Combustion Technique"]);
        const both = idsOf(s, "p1", "battlefield", "Ran and Shaw");
        expect(both).toHaveLength(2);
        const token = both.find((id) => s.objects[id]?.isToken) as string;
        expect(token).toBeDefined();
        expect(chars(s, token).supertypes).not.toContain("Legendary");
      });

      it("avec deux seulement, pas de copie ; {3}{R} : vos Dragons gagnent +2/+0", () => {
        expect(idsOf(run(["Shivan Dragon", "Firebending Lesson", "Opt"]), "p1", "battlefield", "Ran and Shaw")).toHaveLength(1);
        let s = scenario({ p1: { battlefield: ["Ran and Shaw", "Shivan Dragon", "Bear Cub", ...lands("Mountain", 4)] } });
        const [r, dragon, bear] = [
          idOf(s, "p1", "battlefield", "Ran and Shaw"),
          idOf(s, "p1", "battlefield", "Shivan Dragon"),
          idOf(s, "p1", "battlefield", "Bear Cub"),
        ];
        s = settle(activate(s, "p1", r));
        expect(pt(s, r)).toEqual([6, 4]);
        expect(pt(s, dragon)).toEqual([7, 5]);
        expect(pt(s, bear)).toEqual([2, 2]);
      });
    });

    it("Rough Rhino Cavalry : exhaust {8}, deux marqueurs +1/+1 et le piétinement jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Rough Rhino Cavalry", ...lands("Mountain", 8)] } });
      const rhino = idOf(s, "p1", "battlefield", "Rough Rhino Cavalry");
      s = settle(activate(s, "p1", rhino));
      expect(pt(s, rhino)).toEqual([7, 7]);
      expect(chars(s, rhino).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, rhino).keywords).not.toContain("trample");
      expect(pt(s, rhino)).toEqual([7, 7]);
    });

    describe("Solstice Revelations", () => {
      it("lance gratuitement la carte non-terrain si sa VM est inférieure au nombre de vos Montagnes", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Solstice Revelations"], library: ["Plains", "Bear Cub"] },
        });
        s = untilCastNow(cast(s, "p1", "Solstice Revelations"));
        const req = castNowOf(s);
        const bear = req?.cards[0] as string;
        expect(nameOf(s, bear)).toBe("Bear Cub");
        s = settle(act(s, "p1", { type: "cast", card: bear, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        // La carte de terrain exilée reste en exil.
        expect(exiled(s, "Plains")).toHaveLength(1);
      });

      it("sinon, la carte va dans votre main", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Solstice Revelations"], library: ["Serra Angel", "Opt"] },
        });
        s = settle(cast(s, "p1", "Solstice Revelations"));
        expect(handNames(s)).toEqual(["Serra Angel"]);
      });
    });

    it("Tiger-Dillo : n'attaque ni ne bloque sans une autre créature de force 4 ou plus", () => {
      const alone = scenario({ p1: { battlefield: ["Tiger-Dillo", "Bear Cub"] } });
      const t = idOf(alone, "p1", "battlefield", "Tiger-Dillo");
      expect(chars(alone, t).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const backed = scenario({ p1: { battlefield: ["Tiger-Dillo", "Serra Angel"] } });
      const u = idOf(backed, "p1", "battlefield", "Tiger-Dillo");
      expect(chars(backed, u).keywords).not.toContain("cantAttack");
      expect(chars(backed, u).keywords).not.toContain("cantBlock");
    });

    it("Treetop Freedom Fighters : célérité, et un Allié 1/1 en arrivant", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Treetop Freedom Fighters"] } });
      s = settle(cast(s, "p1", "Treetop Freedom Fighters"));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Treetop Freedom Fighters")).keywords).toContain("haste");
    });

    it("Twin Blades : s'attache en arrivant ; double initiative jusqu'à la fin du tour, +1/+1 tant qu'équipée", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Twin Blades"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Twin Blades"), picking([bear]));
      const blades = idOf(s, "p1", "battlefield", "Twin Blades");
      expect(s.objects[blades]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("doubleStrike");
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Ty Lee : en attaquant, payez {1} pour qu'une créature ne puisse pas bloquer ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Ty Lee, Artful Acrobat", "Mountain"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attack(s, [idOf(s, "p1", "battlefield", "Ty Lee, Artful Acrobat")]);
      s = settle(s, picking([angel]));
      expect(chars(s, angel).keywords).toContain("cantBlock");
      expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(true);
    });

    it("War Balloon : {1} met un marqueur de feu ; à trois, c'est une créature-artefact", () => {
      let s = scenario({ p1: { battlefield: ["War Balloon", ...lands("Mountain", 3)] } });
      const balloon = idOf(s, "p1", "battlefield", "War Balloon");
      expect(chars(s, balloon).types).not.toContain("Creature");
      s = settle(activate(s, "p1", balloon));
      s = settle(activate(s, "p1", balloon));
      expect(chars(s, balloon).types).not.toContain("Creature");
      s = settle(activate(s, "p1", balloon));
      expect(s.objects[balloon]?.counters.fire).toBe(3);
      expect(chars(s, balloon).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, balloon).keywords).toContain("flying");
    });

    it("Wartime Protestors : chaque autre Allié qui arrive reçoit un marqueur +1/+1 et la célérité", () => {
      let s = scenario({
        p1: { battlefield: ["Wartime Protestors", ...lands("Mountain", 3)], hand: ["Treetop Freedom Fighters"] },
      });
      s = settle(cast(s, "p1", "Treetop Freedom Fighters"));
      const fighters = idOf(s, "p1", "battlefield", "Treetop Freedom Fighters");
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(s.objects[fighters]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[ally]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, ally).keywords).toContain("haste");
      expect(s.objects[idOf(s, "p1", "battlefield", "Wartime Protestors")]?.counters["+1/+1"]).toBeUndefined();
    });

    it("Yuyan Archers : vous pouvez défausser une carte en arrivant ; si vous le faites, piochez", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Yuyan Archers", "Opt"], library: ["Bear Cub"] } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Yuyan Archers"), picking([opt]));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(handNames(s)).toEqual(["Bear Cub"]);
    });

    describe("Zhao, the Moon Slayer", () => {
      const vista = customCard({
        name: "Test Vista",
        types: ["Land"],
        typeLine: "Land",
        abilities: [dsl.manaAbility(["G", "U"])],
      });

      it("les terrains non de base arrivent engagés, même ceux des adversaires", () => {
        let s = scenario({ active: "p2", p1: { battlefield: ["Zhao, the Moon Slayer"] }, p2: { hand: [vista, "Forest"] } });
        s = act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Test Vista") });
        expect(s.objects[idOf(s, "p2", "battlefield", "Test Vista")]?.tapped).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.number > 3 && x.turn.step === "main1");
        s = act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Forest") });
        expect(s.objects[idOf(s, "p2", "battlefield", "Forest")]?.tapped).toBe(false);
      });

      it("avec un marqueur de conquérant, les terrains non de base sont des Montagnes sans autre capacité", () => {
        let s = scenario({
          p1: { battlefield: ["Zhao, the Moon Slayer", ...lands("Mountain", 7)] },
          p2: { battlefield: [vista] },
        });
        const zhao = idOf(s, "p1", "battlefield", "Zhao, the Moon Slayer");
        const land = idOf(s, "p2", "battlefield", "Test Vista");
        expect(manaAbilitiesOf(s, land).flatMap((a) => a.produce)).toEqual(["G", "U"]);
        s = settle(activate(s, "p1", zhao));
        expect(s.objects[zhao]?.counters.conqueror).toBe(1);
        expect(chars(s, land).subtypes).toEqual(["Mountain"]);
        expect(manaAbilitiesOf(s, land).flatMap((a) => a.produce)).toEqual(["R"]);
        // Les terrains de base ne changent pas.
        expect(manaAbilitiesOf(s, idsOf(s, "p1", "battlefield", "Mountain")[0] as string).flatMap((a) => a.produce)).toEqual([
          "R",
        ]);
      });
    });

    it("Zuko, Exiled Prince : {3} exile la carte du dessus, jouable ce tour-ci seulement", () => {
      let s = scenario({
        p1: { battlefield: ["Zuko, Exiled Prince", ...lands("Mountain", 5)], library: ["Lightning Strike", "Opt"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Zuko, Exiled Prince")));
      const strike = exiled(s, "Lightning Strike")[0] as string;
      expect(strike).toBeDefined();
      expect(castable(s, "p1", strike)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(castable(s, "p1", strike)).toBe(false);
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
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
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
  /** Engage une source pour du mana de cette couleur (la capacité de mana qui la produit). */
  const tapFor = (s: S, player: string, source: string, color: ManaType) => {
    const a = legalActions(s, player).find((x) => x.type === "tapForMana" && x.source === source && x.colors.includes(color));
    if (a?.type !== "tapForMana") throw new Error(`${nameOf(s, source)} ne produit pas ${color}`);
    return act(s, player, { type: "tapForMana", source, ability: a.ability, color });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const toBlockers = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
  /** Allié bicolore (blanc et bleu) de test. */
  const wuAlly = customCard({
    name: "Test Ally",
    subtypes: ["Ally"],
    typeLine: "Creature — Human Ally",
    colors: ["W", "U"],
    power: 1,
    toughness: 1,
  });
  /** Sanctuaire de test (enchantement). */
  const shrine = customCard({
    name: "Test Shrine",
    types: ["Enchantment"],
    subtypes: ["Shrine"],
    typeLine: "Enchantment — Shrine",
  });

  describe("Avatar: The Last Airbender, lot A — vert", () => {
    it("Allies at Last : {1} de moins par Allié ; jusqu'à deux de vos créatures blessent selon leur force", () => {
      let s = scenario({
        p1: { battlefield: ["Earth Kingdom General", "Earth Kingdom General", "Forest"], hand: ["Allies at Last"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const generals = idsOf(s, "p1", "battlefield", "Earth Kingdom General");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // {2}{G} moins deux Alliés : une seule Forêt suffit.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Allies at Last"))).toBe(true);
      s = settle(cast(s, "p1", "Allies at Last", { targets: { a: generals, t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(generals.every((id) => (s.objects[id]?.damage ?? 0) === 0)).toBe(true);
    });

    it("Badgermole : maîtrise de la terre 2 ; vos créatures avec un marqueur +1/+1 ont le piétinement", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Badgermole"] } });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(cast(s, "p1", "Badgermole"), picking([land]));
      const mole = idOf(s, "p1", "battlefield", "Badgermole");
      expect(pt(s, land)).toEqual([2, 2]);
      expect(chars(s, land).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      expect(chars(s, mole).keywords).not.toContain("trample");
    });

    it("Badgermole Cub : une créature engagée pour du mana ajoute {G} de plus, pas un terrain", () => {
      let s = scenario({ p1: { battlefield: ["Badgermole Cub", "Llanowar Elves", "Forest"] } });
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Llanowar Elves"), "G");
      expect(s.players.p1?.manaPool.G).toBe(2);
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Forest"), "G");
      expect(s.players.p1?.manaPool.G).toBe(3);
    });

    it("The Boulder : en attaquant, maîtrise de la terre X (créatures de force 4 ou plus)", () => {
      let s = scenario({ p1: { battlefield: ["The Boulder, Ready to Rumble", "Serra Angel", "Bear Cub", "Forest"] } });
      const land = idOf(s, "p1", "battlefield", "Forest");
      s = attack(s, [idOf(s, "p1", "battlefield", "The Boulder, Ready to Rumble")]);
      s = settle(s, picking([land]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, land).types).toContain("Creature");
    });

    it("Cycle of Renewal : sacrifiez un terrain, jusqu'à deux terrains de base engagés", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Cycle of Renewal"], library: ["Bear Cub", "Island", "Plains"] },
      });
      s = settle(cast(s, "p1", "Cycle of Renewal"));
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      const found = [idOf(s, "p1", "battlefield", "Island"), idOf(s, "p1", "battlefield", "Plains")];
      expect(found.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    });

    it("The Earth King : un Ours 4/4 ; des attaquants de force 4 ou plus : autant de terrains de base engagés", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Serra Angel", "Fire Elemental", "Bear Cub"],
          hand: ["The Earth King"],
          library: ["Island", "Plains", "Swamp", "Opt"],
        },
      });
      s = settle(cast(s, "p1", "The Earth King"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear"))).toEqual([4, 4]);
      s = attack(s, [
        idOf(s, "p1", "battlefield", "Serra Angel"),
        idOf(s, "p1", "battlefield", "Fire Elemental"),
        idOf(s, "p1", "battlefield", "Bear Cub"),
      ]);
      s = settle(s);
      const basics = ["Island", "Plains", "Swamp"].flatMap((n) => idsOf(s, "p1", "battlefield", n));
      expect(basics).toHaveLength(2);
      expect(basics.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Earth Kingdom General : maîtrise de la terre 2 ; vous gagnez autant de PV, une seule fois par tour", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Earth Kingdom General", "Origin of Metalbending"] } });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(cast(s, "p1", "Earth Kingdom General"), picking([land]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(s.players.p1?.life).toBe(22);
      // Un autre marqueur le même tour : plus de points de vie.
      const general = idOf(s, "p1", "battlefield", "Earth Kingdom General");
      s = settle(cast(s, "p1", "Origin of Metalbending", { mode: 1, targets: { u: [general] } }));
      expect(s.objects[general]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Earth Rumble : maîtrise de la terre 2, puis une de vos créatures se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Serra Angel"], hand: ["Earth Rumble"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Earth Rumble", { targets: { t: [land] } }), picking([angel, fire]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      // L'Ange (4/4) et l'Élémental (5/4) s'infligent leurs blessures : les deux meurent.
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    it("Elemental Teachings : jusqu'à quatre terrains de noms différents ; l'adversaire en envoie deux au cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Elemental Teachings"],
          library: ["Forest", "Forest", "Island", "Mountain", "Plains", "Opt"],
        },
      });
      const lib = s.players.p1?.library ?? [];
      const want = lib.filter((_, i) => i !== 1 && i !== 5);
      let asked = 0;
      s = settle(cast(s, "p1", "Elemental Teachings"), (req, player, cur) => {
        if (req.type !== "pick") return undefined;
        if (player === "p1") return want.filter((id) => req.options.includes(id));
        // L'adversaire choisit l'Île, puis la Montagne (les cartes révélées ont changé de zone).
        asked++;
        return req.options.filter((id) => ["Island", "Mountain"].includes(nameOf(cur, id) ?? "")).slice(0, 1);
      });
      expect(asked).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Mountain")).toHaveLength(1);
      const placed = [...idsOf(s, "p1", "battlefield", "Plains"), ...idsOf(s, "p1", "battlefield", "Forest")].filter(
        (id) => s.objects[id]?.tapped,
      );
      // La Forêt et les Plaines trouvées arrivent engagées (les cinq Forêts du départ ont payé le sort).
      expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(6);
      expect(placed).toHaveLength(7);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Opt"]);
    });

    it("Flopsie : un marqueur +1/+1 sur chacune de vos créatures ; force 4 ou plus : un seul bloqueur", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: ["Flopsie, Bumi's Buddy"] } });
      s = settle(cast(s, "p1", "Flopsie, Bumi's Buddy"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Flopsie, Bumi's Buddy"))).toEqual([5, 5]);

      let c = scenario({
        p1: { battlefield: ["Flopsie, Bumi's Buddy", "Serra Angel", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Serra Angel"] },
      });
      const angel = idOf(c, "p1", "battlefield", "Serra Angel");
      const bear = idOf(c, "p1", "battlefield", "Bear Cub");
      const [b1, b2] = idsOf(c, "p2", "battlefield", "Serra Angel") as [string, string];
      c = toBlockers(attack(c, [angel, bear]));
      expect(() =>
        act(c, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: b1, attacker: angel },
            { blocker: b2, attacker: angel },
          ],
        }),
      ).toThrow();
      // La créature de force 2 peut être bloquée par deux créatures.
      expect(() =>
        act(c, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: b1, attacker: bear },
            { blocker: b2, attacker: bear },
          ],
        }),
      ).not.toThrow();
    });

    it("Foggy Swamp Vinebender : imblocable par la force 2 ou moins ; maîtrise de l'eau {5} pendant votre tour seulement", () => {
      let s = scenario({
        p1: { battlefield: ["Foggy Swamp Vinebender", ...lands("Forest", 3), "Bear Cub", "Bear Cub"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const vine = idOf(s, "p1", "battlefield", "Foggy Swamp Vinebender");
      s = settle(activate(s, "p1", vine));
      expect(s.objects[vine]?.counters["+1/+1"]).toBe(1);
      // Trois Forêts et deux créatures engagées (chacune paie {1}) : {5}.
      expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => s.objects[id]?.tapped)).toBe(true);
      const creatures = [vine, ...idsOf(s, "p1", "battlefield", "Bear Cub")];
      expect(creatures.filter((id) => s.objects[id]?.tapped)).toHaveLength(2);

      let c = scenario({
        p1: { battlefield: ["Foggy Swamp Vinebender"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Forest", 5)] },
      });
      const v = idOf(c, "p1", "battlefield", "Foggy Swamp Vinebender");
      c = toBlockers(attack(c, [v]));
      expect(() =>
        act(c, "p2", { type: "declareBlockers", blocks: [{ blocker: idOf(c, "p2", "battlefield", "Bear Cub"), attacker: v }] }),
      ).toThrow();
      expect(() =>
        act(c, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(c, "p2", "battlefield", "Serra Angel"), attacker: v }],
        }),
      ).not.toThrow();
      const theirs = scenario({ active: "p2", p1: { battlefield: ["Foggy Swamp Vinebender", ...lands("Forest", 5)] } });
      expect(canActivate(theirs, "p1", idOf(theirs, "p1", "battlefield", "Foggy Swamp Vinebender"))).toBe(false);
    });

    it("Great Divide Guide : vos terrains et vos Alliés produisent un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: ["Great Divide Guide", "Forest", { name: wuAlly, sick: true }, "Llanowar Elves"] } });
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Forest"), "U");
      expect(s.players.p1?.manaPool.U).toBe(1);
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Great Divide Guide"), "R");
      expect(s.players.p1?.manaPool.R).toBe(1);
      // L'Elfe n'est pas un Allié : seulement {G}.
      expect(() => tapFor(s, "p1", idOf(s, "p1", "battlefield", "Llanowar Elves"), "B")).toThrow();
    });

    it("Haru : chaque fois qu'un autre Allié arrive sous votre contrôle, maîtrise de la terre 1", () => {
      let s = scenario({ p1: { battlefield: ["Haru, Hidden Talent", ...lands("Forest", 4)], hand: ["Earth Kingdom General"] } });
      const [l1, l2] = idsOf(s, "p1", "battlefield", "Forest") as [string, string];
      // Deux déclenchements (Haru et la maîtrise de la terre 2 du Général) : un terrain différent pour chacun.
      const order = [l1, l2];
      s = settle(cast(s, "p1", "Earth Kingdom General"), (req) =>
        req.type === "pick" && req.intent === "triggerTarget" ? [order.shift() as string] : undefined,
      );
      const counters = [l1, l2].map((id) => s.objects[id]?.counters["+1/+1"] ?? 0).sort();
      expect(counters).toEqual([1, 2]);
    });

    it("Invasion Tactics : vos créatures +2/+2 ; des Alliés blessent un joueur : piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Earth Kingdom General", "Bear Cub"], hand: ["Invasion Tactics"] },
      });
      s = settle(cast(s, "p1", "Invasion Tactics"));
      const general = idOf(s, "p1", "battlefield", "Earth Kingdom General");
      expect(pt(s, general)).toEqual([4, 4]);
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s, [general, idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(12);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Kyoshi Island Plaza : X terrains de base (X : vos Sanctuaires) ; un autre Sanctuaire : un terrain de plus", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), shrine],
          hand: ["Kyoshi Island Plaza"],
          library: ["Island", "Plains", "Swamp", "Mountain"],
        },
      });
      s = settle(cast(s, "p1", "Kyoshi Island Plaza"));
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.battlefield.filter((id) => ["Island", "Plains", "Swamp", "Mountain"].includes(nameOf(s, id) ?? ""))).toHaveLength(
        2,
      );
    });

    it("Leaves from the Vine : I meule trois cartes et crée une Nourriture ; II un marqueur sur deux de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), "Bear Cub", "Llanowar Elves"],
          hand: ["Leaves from the Vine"],
          library: lands("Island", 8),
        },
      });
      s = settle(cast(s, "p1", "Leaves from the Vine"));
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0);
      s = settle(s);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
    });

    it("Leaves from the Vine : III ne pioche que s'il y a une carte de créature ou de Leçon au cimetière", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: { battlefield: [{ name: "Leaves from the Vine", counters: { lore: 2 } }], graveyard, library: lands("Island", 5) },
        });
        s = advanceUntil(
          s,
          (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0,
        );
        return settle(s).players.p1?.hand.length ?? 0;
      };
      // La pioche du tour, plus une carte avec une Leçon.
      expect(run(["Opt"])).toBe(1);
      expect(run(["Shared Roots"])).toBe(2);
      expect(run(["Bear Cub"])).toBe(2);
    });

    describe("The Legend of Kyoshi // Avatar Kyoshi", () => {
      const KYOSHI = "The Legend of Kyoshi // Avatar Kyoshi";
      const nextMain = (s: S) =>
        settle(
          advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0),
        );

      it("I : piochez autant que la plus grande force parmi vos créatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 6), "Serra Angel"], hand: [KYOSHI], library: lands("Island", 8) },
        });
        s = settle(cast(s, "p1", KYOSHI));
        expect(s.players.p1?.hand).toHaveLength(4);
      });

      it("II : maîtrise de la terre X (cartes en main) ; le terrain devient aussi une Île", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: KYOSHI, counters: { lore: 1 } }, "Forest"],
            hand: ["Opt", "Opt"],
            library: lands("Plains", 5),
          },
        });
        const forest = idOf(s, "p1", "battlefield", "Forest");
        s = nextMain(s);
        // Deux cartes, plus la pioche du tour.
        expect(s.objects[forest]?.counters["+1/+1"]).toBe(3);
        expect(chars(s, forest).subtypes).toEqual(expect.arrayContaining(["Forest", "Island"]));
        expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      });

      it("III : Avatar Kyoshi 5/4 ; vos terrains ont le piétinement et la défense talismanique ; {T} : X mana d'une couleur", () => {
        let s = scenario({
          p1: { battlefield: [{ name: KYOSHI, counters: { lore: 2 } }, "Forest", "Bear Cub"], library: lands("Plains", 5) },
        });
        s = nextMain(s);
        const avatar = idOf(s, "p1", "battlefield", KYOSHI);
        expect(chars(s, avatar).name).toBe("Avatar Kyoshi");
        expect(pt(s, avatar)).toEqual([5, 4]);
        const forest = idOf(s, "p1", "battlefield", "Forest");
        expect(chars(s, forest).keywords).toEqual(expect.arrayContaining(["trample", "hexproof"]));
        // Revenue ce tour-ci : mal d'invocation ; au tour suivant, {T} : cinq mana d'une couleur (sa force, 5).
        s = advanceUntil(
          s,
          (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 6 && x.pending?.kind === "priority",
        );
        s = settle(activate(s, "p1", avatar), (req) => (req.type === "pick" && req.options.includes("U") ? ["U"] : undefined));
        expect(s.players.p1?.manaPool.U).toBe(5);
      });
    });

    it("Origin of Metalbending : un marqueur +1/+1 et l'indestructible jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Forest", "Bear Cub"], hand: ["Origin of Metalbending"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Origin of Metalbending", { mode: 1, targets: { u: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Ostrich-Horse : meule trois cartes ; un terrain meulé en main, sinon un marqueur +1/+1", () => {
      const run = (library: string[]) => {
        const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Ostrich-Horse"], library } });
        return settle(cast(s, "p1", "Ostrich-Horse"));
      };
      const land = run(["Opt", "Island", "Bear Cub", "Plains"]);
      expect(idsOf(land, "p1", "hand", "Island")).toHaveLength(1);
      expect(land.players.p1?.graveyard).toHaveLength(2);
      expect(land.objects[idOf(land, "p1", "battlefield", "Ostrich-Horse")]?.counters["+1/+1"] ?? 0).toBe(0);
      const none = run(["Opt", "Bear Cub", "Opt", "Plains"]);
      expect(none.players.p1?.graveyard).toHaveLength(3);
      expect(pt(none, idOf(none, "p1", "battlefield", "Ostrich-Horse"))).toEqual([4, 2]);
    });

    it("Pillar Launch : +2/+2 et portée jusqu'à la fin du tour, puis dégagez-la", () => {
      let s = scenario({ p1: { battlefield: ["Forest", { name: "Bear Cub", tapped: true }], hand: ["Pillar Launch"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Pillar Launch", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("reach");
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Raucous Audience : {G}, ou {G}{G} si vous contrôlez une créature de force 4 ou plus", () => {
      let s = scenario({ p1: { battlefield: ["Raucous Audience"] } });
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Raucous Audience"), "G");
      expect(s.players.p1?.manaPool.G).toBe(1);
      let big = scenario({ p1: { battlefield: ["Raucous Audience", "Serra Angel"] } });
      big = tapFor(big, "p1", idOf(big, "p1", "battlefield", "Raucous Audience"), "G");
      expect(big.players.p1?.manaPool.G).toBe(2);
    });

    it("Rebellious Captives : exhaust {6} : deux marqueurs sur elle, puis maîtrise de la terre 2, une seule fois", () => {
      let s = scenario({ p1: { battlefield: ["Rebellious Captives", ...lands("Forest", 13)] } });
      const captives = idOf(s, "p1", "battlefield", "Rebellious Captives");
      const land = idsOf(s, "p1", "battlefield", "Forest")[12] as string;
      s = settle(activate(s, "p1", captives, { t: [land] }));
      expect(pt(s, captives)).toEqual([4, 4]);
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(canActivate(s, "p1", captives)).toBe(false);
    });

    it("Rockalanche : maîtrise de la terre X (vos Forêts) ; flashback {5}{G}", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 3), ...lands("Plains", 3)], hand: ["Rockalanche"] } });
      const plains = idOf(s, "p1", "battlefield", "Plains");
      s = settle(cast(s, "p1", "Rockalanche", { targets: { t: [plains] } }));
      expect(s.objects[plains]?.counters["+1/+1"]).toBe(3);
      const fb = scenario({ p1: { battlefield: lands("Forest", 6), graveyard: ["Rockalanche"] } });
      expect(castable(fb, "p1", idOf(fb, "p1", "graveyard", "Rockalanche"))).toBe(true);
    });

    it("Rocky Rebuke : votre créature inflige des blessures égales à sa force à une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Forest", "Serra Angel"], hand: ["Rocky Rebuke"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Rocky Rebuke", { targets: { a: [angel], b: [fire] } }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    it("Seismic Sense : regardez X cartes (X : vos terrains), une créature ou un terrain en main, le reste dessous", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Seismic Sense"], library: ["Opt", "Opt", "Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "Seismic Sense"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Island");
    });

    it("Sparring Dummy : meulez une carte ; un terrain revient en main ; 2 PV si c'est une Leçon", () => {
      let s = scenario({ p1: { battlefield: ["Sparring Dummy"], library: ["Shared Roots", "Island", "Opt"] } });
      const dummy = idOf(s, "p1", "battlefield", "Sparring Dummy");
      s = settle(activate(s, "p1", dummy));
      expect(s.players.p1?.life).toBe(22);
      expect(idsOf(s, "p1", "graveyard", "Shared Roots")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sparring Dummy"], library: ["Island", "Opt"] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Sparring Dummy")));
      expect(idsOf(t, "p1", "hand", "Island")).toHaveLength(1);
      expect(t.players.p1?.life).toBe(20);
    });

    it("True Ancestry : une carte de permanent de votre cimetière en main, et un Indice", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["True Ancestry"], graveyard: ["Bear Cub", "Opt"] } });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const opt = idOf(s, "p1", "graveyard", "Opt");
      expect(() => cast(s, "p1", "True Ancestry", { targets: { t: [opt] } })).toThrow();
      s = settle(cast(s, "p1", "True Ancestry", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    it("Turtle-Duck : {3} : force de base 4 et piétinement jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Turtle-Duck", ...lands("Forest", 3)] } });
      const duck = idOf(s, "p1", "battlefield", "Turtle-Duck");
      s = settle(activate(s, "p1", duck));
      expect(pt(s, duck)).toEqual([4, 4]);
      expect(chars(s, duck).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, duck)).toEqual([0, 4]);
    });

    it("Unlucky Cabbage Merchant : une Nourriture ; en sacrifiant une Nourriture, un terrain de base et le marchand part", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Unlucky Cabbage Merchant"], library: ["Opt", "Island"] },
      });
      s = settle(cast(s, "p1", "Unlucky Cabbage Merchant"));
      const food = idOf(s, "p1", "battlefield", "Food");
      s = settle(activate(s, "p1", food));
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Unlucky Cabbage Merchant")).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id)).sort()).toEqual(["Opt", "Unlucky Cabbage Merchant"]);
    });

    it("Walltop Sentries : en mourant, 2 PV seulement s'il y a une Leçon dans votre cimetière", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Walltop Sentries", "Mountain", "Mountain"], hand: ["Lightning Strike"], graveyard },
        });
        return settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Walltop Sentries")] } }));
      };
      expect(run(["Opt"]).players.p1?.life).toBe(20);
      const lesson = run(["Shared Roots"]);
      expect(idsOf(lesson, "p1", "graveyard", "Walltop Sentries")).toHaveLength(1);
      expect(lesson.players.p1?.life).toBe(22);
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plus = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Va jusqu'à la déclaration des attaquants de p1 et déclare ces attaquants contre p2. */
  const attack = (s: S, ids: string[]): S => {
    const at = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(at, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  /** Éphémère de test : « Détruisez la créature ciblée. » */
  const murder = customCard({
    name: "Test Murder",
    types: ["Instant"],
    typeLine: "Instant",
    spell: dsl.spell([dsl.target.creature()], [dsl.fx.destroy(dsl.ref.target())]),
  });

  /** Artefact de test : « Sacrifiez une créature : rien. » (un autre permanent sacrifié). */
  const altar = customCard({
    name: "Test Altar",
    types: ["Artifact"],
    typeLine: "Artifact",
    abilities: [
      dsl.activated({ sacrificeOther: { filter: { types: ["Creature"] } }, effects: [], label: "Sacrifiez une créature" }),
    ],
  });

  describe("Avatar: The Last Airbender, lot A — multicolores", () => {
    it("Air Nomad Legacy : un Indice en arrivant ; vos créatures volantes gagnent +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Island", "Serra Angel", "Bear Cub"], hand: ["Air Nomad Legacy"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Air Nomad Legacy"));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
    });

    it("Azula, Cunning Usurper : l'adversaire exile une créature non-jeton et une carte non-terrain de son cimetière, lançables pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Island", "Swamp"], hand: ["Azula, Cunning Usurper"] },
        p2: { battlefield: ["Bear Cub"], graveyard: ["Opt", "Forest"] },
      });
      s = settle(cast(s, "p1", "Azula, Cunning Usurper"));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      const bear = exiled(s, "Bear Cub")[0] as string;
      const opt = exiled(s, "Opt")[0] as string;
      expect(bear).toBeDefined();
      expect(opt).toBeDefined();
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      // Il reste un Marais dégagé : Opt ({U}) se lance avec du mana de n'importe quel type.
      expect(castable(s, "p1", opt)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: opt }));
      expect(exiled(s, "Opt")).toHaveLength(0);
      // Pas pendant le tour adverse.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p1", bear)).toBe(false);
    });

    it("Beifong's Bounty Hunters : une de vos créatures non-terrains meurt, maîtrise de la terre X (sa force)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Beifong's Bounty Hunters", "Bear Cub", "Forest", "Mountain"],
          hand: ["Lightning Strike"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }), picking([forest]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(plus(s, forest)).toBe(2);
      expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    });

    describe("Bitter Work", () => {
      it("attaquer avec une créature de force 4 ou plus fait piocher ; pas avec une petite créature", () => {
        const run = (attacker: string) => {
          let s = scenario({ p1: { battlefield: ["Bitter Work", attacker] } });
          const hand = s.players.p1?.hand.length ?? 0;
          s = settle(attack(s, [idOf(s, "p1", "battlefield", attacker)]));
          return (s.players.p1?.hand.length ?? 0) - hand;
        };
        expect(run("Serra Angel")).toBe(1);
        expect(run("Bear Cub")).toBe(0);
      });

      it("exhaust — {4} : maîtrise de la terre 4, seulement pendant votre tour", () => {
        let s = scenario({ p1: { battlefield: ["Bitter Work", ...lands("Forest", 5)] } });
        const work = idOf(s, "p1", "battlefield", "Bitter Work");
        const land = idsOf(s, "p1", "battlefield", "Forest")[4] as string;
        s = settle(activate(s, "p1", work, { targets: { t: [land] } }));
        expect(plus(s, land)).toBe(4);
        expect(pt(s, land)).toEqual([4, 4]);
        // Une seule activation.
        expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === work)).toBe(false);
        const theirs = scenario({ active: "p2", p1: { battlefield: ["Bitter Work", ...lands("Forest", 5)] } });
        const w = idOf(theirs, "p1", "battlefield", "Bitter Work");
        expect(legalActions(theirs, "p1").some((a) => a.type === "activate" && a.source === w)).toBe(false);
      });
    });

    it("Bumi, Unleashed : blessures de combat à un joueur, vos terrains se dégagent et un combat supplémentaire suit, sans créatures non-terrains", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bumi, Unleashed", "Bear Cub", { name: "Forest", tapped: true }, { name: "Mountain", tapped: true }],
        },
      });
      const bumi = idOf(s, "p1", "battlefield", "Bumi, Unleashed");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bumi]);
      s = advanceUntil(s, (x) => x.turn.step === "endCombat");
      expect(s.players.p2?.life).toBe(15);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Land")).every((id) => !s.objects[id]?.tapped)).toBe(true);
      // Le combat supplémentaire : l'Ours (non-terrain) ne peut pas y attaquer.
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" || x.turn.step === "main2");
      expect(s.turn.step).toBe("beginCombat");
      expect(chars(s, bear).keywords).toContain("cantAttack");
    });

    it("Cat-Owl : en attaquant, dégage un artefact ou une créature ciblé", () => {
      let s = scenario({ p1: { battlefield: ["Cat-Owl", { name: "Bear Cub", tapped: true }] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Cat-Owl")]), picking([bear]));
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Cruel Administrator : raid, un marqueur +1/+1 ; en attaquant, un Soldat 2/2 avec la maîtrise du feu 1", () => {
      const run = (attackFirst: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Bear Cub"], hand: ["Cruel Administrator"] },
        });
        if (attackFirst) {
          s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
          s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
        }
        s = settle(cast(s, "p1", "Cruel Administrator"));
        return { s, id: idOf(s, "p1", "battlefield", "Cruel Administrator") };
      };
      expect(plus(run(false).s, run(false).id)).toBe(0);
      const raid = run(true);
      expect(plus(raid.s, raid.id)).toBe(1);
      let s = scenario({ p1: { battlefield: ["Cruel Administrator"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Cruel Administrator")]));
      const soldier = idOf(s, "p1", "battlefield", "Soldier");
      expect([...pt(s, soldier), chars(s, soldier).colors]).toEqual([2, 2, ["R"]]);
      expect(chars(s, soldier).abilities.some((a) => a.kind === "triggered" && a.label === "Maîtrise du feu 1")).toBe(true);
    });

    it("Dai Li Agents : deux maîtrises de la terre 1 en arrivant ; en attaquant, drain égal à vos créatures avec un marqueur +1/+1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 4)], hand: ["Dai Li Agents"] },
      });
      const [a, b] = idsOf(s, "p1", "battlefield", "Forest").slice(2) as [string, string];
      let asked = 0;
      s = settle(cast(s, "p1", "Dai Li Agents"), (req) => {
        if (req.type !== "pick") return undefined;
        asked++;
        return [asked === 1 ? a : b].filter((x) => req.options.includes(x));
      });
      expect([plus(s, a), plus(s, b)]).toEqual([1, 1]);
      // Au tour suivant de p1, les Agents attaquent : deux créatures avec un marqueur.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Dai Li Agents")]));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Dragonfly Swarm : force égale aux cartes non-créatures non-terrains de votre cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: ["Dragonfly Swarm", "Mountain"],
          hand: ["Firebending Lesson"],
          graveyard: ["Opt", "Bear Cub", "Forest"],
        },
      });
      const swarm = idOf(s, "p1", "battlefield", "Dragonfly Swarm");
      expect(pt(s, swarm)).toEqual([1, 3]);
      s = settle(cast(s, "p1", "Firebending Lesson", { kicked: false, targets: { t: [swarm] } }));
      // La Leçon, une fois au cimetière, compte aussi ; ses 2 blessures ne la tuent pas.
      expect(idsOf(s, "p1", "battlefield", "Dragonfly Swarm")).toHaveLength(1);
      expect(pt(s, swarm)).toEqual([2, 3]);
    });

    it("Dragonfly Swarm : meurt avec une Leçon au cimetière, piochez ; sans Leçon, rien", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Dragonfly Swarm", ...lands("Mountain", 2)], hand: ["Lightning Strike"], graveyard },
        });
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Dragonfly Swarm")] } }));
        expect(idsOf(s, "p1", "graveyard", "Dragonfly Swarm")).toHaveLength(1);
        return (s.players.p1?.hand.length ?? 0) - (hand - 1);
      };
      expect(run(["Shared Roots"])).toBe(1);
      expect(run(["Bear Cub"])).toBe(0);
    });

    it("Earth King's Lieutenant : un marqueur sur chacun de vos autres Alliés ; chaque autre Allié qui arrive lui en donne un", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest", "Plains", ...lands("Plains", 2), "Pretending Poxbearers", "Bear Cub"],
          hand: ["Earth King's Lieutenant", "Pretending Poxbearers"],
        },
      });
      const ally = idOf(s, "p1", "battlefield", "Pretending Poxbearers");
      s = settle(cast(s, "p1", "Earth King's Lieutenant"));
      const lieutenant = idOf(s, "p1", "battlefield", "Earth King's Lieutenant");
      expect(plus(s, ally)).toBe(1);
      expect(plus(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(plus(s, lieutenant)).toBe(0);
      s = settle(cast(s, "p1", "Pretending Poxbearers"));
      expect(plus(s, lieutenant)).toBe(1);
    });

    it("Earth Rumble Wrestlers : +1/+0 et piétinement quand un terrain est arrivé sous votre contrôle ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Earth Rumble Wrestlers"], hand: ["Forest"] } });
      const w = idOf(s, "p1", "battlefield", "Earth Rumble Wrestlers");
      expect(pt(s, w)).toEqual([3, 4]);
      expect(chars(s, w).keywords).not.toContain("trample");
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(pt(s, w)).toEqual([4, 4]);
      expect(chars(s, w).keywords).toContain("trample");
      expect(chars(s, w).keywords).toContain("reach");
    });

    it("Fire Lord Azula : un sort lancé pendant qu'elle attaque est copié", () => {
      let s = scenario({ p1: { battlefield: ["Fire Lord Azula", "Mountain"], hand: ["Lightning Strike"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Fire Lord Azula")]);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      // Maîtrise du feu 2 : {R}{R} pendant le combat, plus la Montagne.
      expect(s.players.p1?.manaPool.R).toBe(2);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Fire Lord Azula : pas de copie hors de l'attaque", () => {
      let s = scenario({ p1: { battlefield: ["Fire Lord Azula", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    describe("Fire Lord Zuko", () => {
      /** Éphémère de test : « Exilez la créature ciblée, puis renvoyez-la sur le champ de bataille. » */
      const flicker = customCard({
        name: "Test Flicker",
        types: ["Instant"],
        typeLine: "Instant",
        spell: dsl.spell(
          [dsl.target.creature()],
          [dsl.fx.exileCard(dsl.ref.target(), { name: "f" }), dsl.fx.toBattlefield(dsl.ref.stored("f"))],
        ),
      });
      /** Éphémère de test : « Maîtrise de l'air de la créature ciblée. » */
      const gust = customCard({
        name: "Test Gust",
        types: ["Instant"],
        typeLine: "Instant",
        spell: dsl.spell([dsl.target.creature()], [dsl.fx.airbend(dsl.ref.target())]),
      });

      it("maîtrise du feu X, X étant sa force", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Fire Lord Zuko", counters: { "+1/+1": 1 } }] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Fire Lord Zuko")]);
        s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
        expect(s.players.p1?.manaPool.R).toBe(3);
      });

      it("un permanent que vous contrôlez arrive depuis l'exil : un marqueur +1/+1 sur chacune de vos créatures", () => {
        let s = scenario({ p1: { battlefield: ["Fire Lord Zuko", "Bear Cub"], hand: [flicker] } });
        const zuko = idOf(s, "p1", "battlefield", "Fire Lord Zuko");
        s = settle(cast(s, "p1", "Test Flicker", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(plus(s, zuko)).toBe(1);
        expect(plus(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      });

      it("un sort lancé depuis l'exil déclenche une seule fois (le permanent arrive depuis la pile)", () => {
        let s = scenario({ p1: { battlefield: ["Fire Lord Zuko", "Bear Cub", ...lands("Forest", 2)], hand: [gust] } });
        const zuko = idOf(s, "p1", "battlefield", "Fire Lord Zuko");
        s = settle(cast(s, "p1", "Test Gust", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(plus(s, zuko)).toBe(0);
        s = settle(act(s, "p1", { type: "cast", card: exiled(s, "Bear Cub")[0] as string }));
        expect(plus(s, zuko)).toBe(1);
        // La capacité se résout avant le sort : l'Ours, arrivé ensuite (depuis la pile), n'a rien.
        expect(plus(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      });
    });

    it("Foggy Swamp Spirit Keeper : votre deuxième carte piochée du tour crée un Esprit 1/1", () => {
      let s = scenario({ p1: { battlefield: ["Foggy Swamp Spirit Keeper", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const [a, b] = idsOf(s, "p1", "hand", "Opt") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: a }));
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: b }));
      const spirit = idOf(s, "p1", "battlefield", "Spirit");
      expect([...pt(s, spirit), chars(s, spirit).colors]).toEqual([1, 1, []]);
    });

    it("Guru Pathik : une Leçon parmi les cinq du dessus ; chaque sort de Leçon met un marqueur sur une autre de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Mountain", "Bear Cub"],
          hand: ["Guru Pathik"],
          library: ["Opt", "Firebending Lesson", "Bear Cub", "Forest", "Island", "Plains"],
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      s = settle(cast(s, "p1", "Guru Pathik"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Firebending Lesson"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Plains");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const guru = idOf(s, "p1", "battlefield", "Guru Pathik");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Firebending Lesson", { kicked: false, targets: { t: [fire] } }), picking([bear]));
      expect(plus(s, bear)).toBe(1);
      expect(plus(s, guru)).toBe(0);
    });

    it("Hei Bai : en arrivant, sacrifiez une autre créature pour deux marqueurs ; en partant, ses marqueurs vont sur une de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub", "Serra Angel"], hand: ["Hei Bai, Spirit of Balance", murder] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Hei Bai, Spirit of Balance"), picking([bear]));
      const hei = idOf(s, "p1", "battlefield", "Hei Bai, Spirit of Balance");
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(plus(s, hei)).toBe(2);
      expect(pt(s, hei)).toEqual([5, 5]);
      s = settle(cast(s, "p1", "Test Murder", { targets: { t: [hei] } }), picking([angel]));
      expect(idsOf(s, "p1", "graveyard", "Hei Bai, Spirit of Balance")).toHaveLength(1);
      expect(plus(s, angel)).toBe(2);
    });

    it("Hei Bai : le sacrifice est facultatif", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Hei Bai, Spirit of Balance"] } });
      s = settle(cast(s, "p1", "Hei Bai, Spirit of Balance"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(plus(s, idOf(s, "p1", "battlefield", "Hei Bai, Spirit of Balance"))).toBe(0);
    });

    it("Iroh, Tea Master : au combat, donnez un permanent à un adversaire et créez un Allié avec un marqueur par permanent à vous chez eux", () => {
      let s = scenario({ p1: { battlefield: ["Iroh, Tea Master", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0));
      s = settle(s, picking([bear]));
      expect(s.objects[bear]?.controller).toBe("p2");
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(plus(s, ally)).toBe(1);
      expect(pt(s, ally)).toEqual([2, 2]);
    });

    it("Jet, Freedom Fighter : en arrivant, blessures égales au nombre de vos créatures à une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Bear Cub", "Bear Cub"], hand: ["Jet, Freedom Fighter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Jet, Freedom Fighter"), picking([angel]));
      expect(s.objects[angel]?.damage).toBe(3);
    });

    it("Katara, the Fearless : les capacités déclenchées de vos Alliés se déclenchent une fois de plus", () => {
      let s = scenario({
        p1: {
          battlefield: ["Katara, the Fearless", "Pretending Poxbearers", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Pretending Poxbearers")] } }));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(2);
    });

    it("Katara, Water Tribe's Hope : maîtrise de l'eau {X}, vos créatures ont une F/E de base X/X jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Katara, Water Tribe's Hope", "Serra Angel", ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const katara = idOf(s, "p1", "battlefield", "Katara, Water Tribe's Hope");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      // « X ne peut pas être 0 » : X va de 1 à 5 (trois Îles, Katara et l'Ange engagés pour la maîtrise de l'eau).
      const option = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === katara);
      expect(option?.type === "activate" ? [option.xMin, option.xMax] : null).toEqual([1, 5]);
      expect(() => activate(s, "p1", katara, { x: 0 })).toThrow(/au moins 1/);
      s = settle(activate(s, "p1", katara, { x: 3 }));
      expect(pt(s, katara)).toEqual([3, 3]);
      expect(pt(s, angel)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === katara)).toBe(false);
    });

    it("The Lion-Turtle : ne peut ni attaquer ni bloquer sans trois Leçons au cimetière", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: ["The Lion-Turtle"], graveyard } });
        return chars(s, idOf(s, "p1", "battlefield", "The Lion-Turtle")).keywords;
      };
      expect(run(["Shared Roots", "Firebending Lesson"])).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      expect(run(["Shared Roots", "Firebending Lesson", "Combustion Technique"])).not.toContain("cantAttack");
    });

    it("Long Feng : une autre de vos créatures ou un de vos terrains mis au cimetière, un marqueur sur une de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Long Feng, Grand Secretariat", "Bear Cub", "Serra Angel", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
        },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(
        cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
        picking([angel]),
      );
      expect(plus(s, angel)).toBe(1);
    });

    it("Messenger Hawk : un Indice ; +2/+0 après deux cartes piochées ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 6)], hand: ["Messenger Hawk", "Opt"] } });
      s = settle(cast(s, "p1", "Messenger Hawk"));
      const hawk = idOf(s, "p1", "battlefield", "Messenger Hawk");
      expect(pt(s, hawk)).toEqual([1, 2]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, hawk)).toEqual([1, 2]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Clue")));
      expect(pt(s, hawk)).toEqual([3, 2]);
    });

    it("Platypus-Bear : meule deux cartes ; attaque malgré le défenseur avec une Leçon au cimetière", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2)], hand: ["Platypus-Bear"], library: ["Bear Cub", "Shared Roots", "Opt"] },
      });
      s = settle(cast(s, "p1", "Platypus-Bear"));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Shared Roots"]);
      const bear = idOf(s, "p1", "battlefield", "Platypus-Bear");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["defender", "attacksDespiteDefender"]));
      const none = scenario({ p1: { battlefield: ["Platypus-Bear"] } });
      expect(chars(none, idOf(none, "p1", "battlefield", "Platypus-Bear")).keywords).not.toContain("attacksDespiteDefender");
    });

    it("Professor Zei : {1}, {T}, sacrifice : un éphémère ou un rituel de votre cimetière revient en main, pendant votre tour", () => {
      let s = scenario({ p1: { battlefield: ["Professor Zei, Anthropologist", "Island"], graveyard: ["Opt", "Bear Cub"] } });
      const zei = idOf(s, "p1", "battlefield", "Professor Zei, Anthropologist");
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const a = legalActions(s, "p1").filter((x) => x.type === "activate" && x.source === zei);
      const ability = a.map((x) => (x.type === "activate" ? x.ability : -1)).find((i) => i > 0) as number;
      s = settle(act(s, "p1", { type: "activate", source: zei, ability, targets: { t: [opt] } }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "graveyard", "Professor Zei, Anthropologist")).toHaveLength(1);
    });

    it("Sandbender Scavengers : un marqueur par autre permanent sacrifié ; en mourant, exilez-la pour ramener une créature de VM au plus sa force", () => {
      let s = scenario({
        p1: {
          battlefield: ["Sandbender Scavengers", "Bear Cub", altar, ...lands("Mountain", 4)],
          hand: ["Lightning Strike"],
          graveyard: ["Serra Angel", "Fire Elemental"],
        },
      });
      const scav = idOf(s, "p1", "battlefield", "Sandbender Scavengers");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Test Altar"), { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }),
      );
      expect(plus(s, scav)).toBe(1);
      expect(pt(s, scav)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [scav] } }), (req) => {
        if (req.type === "yesNo") return [1];
        return undefined;
      });
      expect(exiled(s, "Sandbender Scavengers")).toHaveLength(1);
      // Sa dernière force connue (2) : l'Ours (VM 2) revient, pas l'Ange (VM 5).
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    });

    it("Sokka, Bold Boomeranger : défaussez jusqu'à deux cartes, piochez-en autant ; un sort d'artefact ou de Leçon lui donne un marqueur", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Mountain", "Mountain"],
          hand: ["Sokka, Bold Boomeranger", "Bear Cub", "Forest", "Firebending Lesson"],
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const keep = idOf(s, "p1", "hand", "Firebending Lesson");
      s = settle(cast(s, "p1", "Sokka, Bold Boomeranger"), (req) =>
        req.type === "pick" && req.intent === "discard" ? req.options.filter((o) => o !== keep) : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(3);
      const sokka = idOf(s, "p1", "battlefield", "Sokka, Bold Boomeranger");
      s = settle(act(s, "p1", { type: "cast", card: keep, targets: { t: [idOf(s, "p2", "battlefield", "Fire Elemental")] } }));
      expect(plus(s, sokka)).toBe(1);
    });

    it("Sokka, Lateral Strategist : pioche quand il attaque avec une autre créature, pas seul", () => {
      const run = (names: string[]) => {
        let s = scenario({ p1: { battlefield: ["Sokka, Lateral Strategist", "Bear Cub"] } });
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(
          attack(
            s,
            names.map((n) => idOf(s, "p1", "battlefield", n)),
          ),
        );
        return (s.players.p1?.hand.length ?? 0) - hand;
      };
      expect(run(["Sokka, Lateral Strategist", "Bear Cub"])).toBe(1);
      expect(run(["Sokka, Lateral Strategist"])).toBe(0);
    });

    it("Sokka, Tenacious Tactician : vos autres Alliés ont la menace et la prouesse ; un sort non-créature crée un Allié", () => {
      let s = scenario({
        p1: { battlefield: ["Sokka, Tenacious Tactician", "Pretending Poxbearers", "Bear Cub", "Island"], hand: ["Opt"] },
      });
      const pox = idOf(s, "p1", "battlefield", "Pretending Poxbearers");
      expect(chars(s, pox).keywords).toEqual(expect.arrayContaining(["menace", "prowess"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, pox)).toEqual([3, 2]);
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(chars(s, ally).keywords).toEqual(expect.arrayContaining(["menace", "prowess"]));
    });

    it("Suki, Kyoshi Warrior : force égale à vos créatures ; en attaquant, un Allié engagé et attaquant", () => {
      let s = scenario({ p1: { battlefield: ["Suki, Kyoshi Warrior", "Bear Cub"] } });
      const suki = idOf(s, "p1", "battlefield", "Suki, Kyoshi Warrior");
      expect(pt(s, suki)).toEqual([2, 4]);
      s = settle(attack(s, [suki]));
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(s.objects[ally]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === ally)).toBe(true);
      expect(pt(s, suki)).toEqual([3, 4]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Sun Warriors : maîtrise du feu X, X étant le nombre de vos créatures ; {5} : un Allié", () => {
      let s = scenario({ p1: { battlefield: ["Sun Warriors", "Bear Cub", "Bear Cub", ...lands("Mountain", 5)] } });
      const sun = idOf(s, "p1", "battlefield", "Sun Warriors");
      s = settle(activate(s, "p1", sun));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      s = attack(s, [sun]);
      s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
      expect(s.players.p1?.manaPool.R).toBe(4);
    });

    it("Tolls of War : un Indice ; sacrifier un permanent pendant votre tour crée un Allié, une fois par tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Swamp"], hand: ["Tolls of War"] } });
      s = settle(cast(s, "p1", "Tolls of War"));
      const clue = idOf(s, "p1", "battlefield", "Clue");
      s = settle(activate(s, "p1", clue));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
    });

    it("Toph, Hardheaded Teacher : chaque sort lancé fait une maîtrise de la terre 1, avec un marqueur de plus pour une Leçon", () => {
      let s = scenario({
        p1: { battlefield: ["Toph, Hardheaded Teacher", ...lands("Mountain", 2), "Island"], hand: ["Firebending Lesson", "Opt"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const [m1, m2] = idsOf(s, "p1", "battlefield", "Mountain") as [string, string];
      const island = idOf(s, "p1", "battlefield", "Island");
      s = settle(cast(s, "p1", "Opt"), picking([m1]));
      expect(plus(s, m1)).toBe(1);
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Firebending Lesson", { kicked: false, targets: { t: [fire] } }), picking([island]));
      expect(plus(s, island)).toBe(2);
      expect(m2).toBeDefined();
    });

    it("Toph, Hardheaded Teacher : en arrivant, défaussez une carte pour reprendre un éphémère ou un rituel", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)],
          hand: ["Toph, Hardheaded Teacher", "Bear Cub"],
          graveyard: ["Opt"],
        },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      s = settle(cast(s, "p1", "Toph, Hardheaded Teacher"), (req) =>
        req.type === "pick" && req.options.includes(opt)
          ? [opt]
          : req.type === "pick" && req.intent === "discard"
            ? req.options
            : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Toph, the First Metalbender : vos artefacts non-jetons sont aussi des terrains ; maîtrise de la terre 2 à votre étape de fin", () => {
      const artifact = customCard({
        name: "Test Relic",
        types: ["Artifact"],
        typeLine: "Artifact",
        abilities: [
          dsl.activated({
            effects: [dsl.fx.createTokens({ name: "Clue", colors: [], types: ["Artifact"], subtypes: ["Clue"] })],
            label: "Un Indice",
          }),
        ],
      });
      let s = scenario({ p1: { battlefield: ["Toph, the First Metalbender", artifact] } });
      const relic = idOf(s, "p1", "battlefield", "Test Relic");
      expect(chars(s, relic).types).toEqual(expect.arrayContaining(["Artifact", "Land"]));
      s = settle(activate(s, "p1", relic));
      expect(chars(s, idOf(s, "p1", "battlefield", "Clue")).types).toEqual(["Artifact"]);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s, picking([relic]));
      expect(plus(s, relic)).toBe(2);
      expect(chars(s, relic).types).toEqual(expect.arrayContaining(["Artifact", "Land", "Creature"]));
    });

    it("Uncle Iroh : les sorts de Leçon coûtent {1} de moins", () => {
      const s = scenario({ p1: { battlefield: ["Uncle Iroh", "Forest"], hand: ["Shared Roots", "Bear Cub"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shared Roots"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Zuko, Conflicted : au début de votre première phase principale, un mode pas encore choisi, et vous perdez 2 PV", () => {
      let s = scenario({ step: "upkeep", p1: { battlefield: ["Zuko, Conflicted"] } });
      let zuko = idOf(s, "p1", "battlefield", "Zuko, Conflicted");
      let offered: string[] = [];
      const pickMode =
        (m: string): Answer =>
        (req) => {
          if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
          offered = req.options.map(String);
          return [m];
        };
      s = advanceUntil(s, (x) => x.turn.step === "main1" && x.pending?.kind === "choice");
      s = settle(s, pickMode("1"));
      expect(offered).toEqual(["0", "1", "2", "3"]);
      expect(plus(s, zuko)).toBe(1);
      expect(s.players.p1?.life).toBe(18);
      // Au tour suivant de p1, le marqueur n'est plus proposé ; il passe chez l'adversaire.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "choice");
      s = settle(s, pickMode("3"));
      expect(offered).toEqual(["0", "2", "3"]);
      expect(s.players.p1?.life).toBe(16);
      zuko = idOf(s, "p2", "battlefield", "Zuko, Conflicted");
      expect(s.objects[zuko]?.owner).toBe("p1");
      expect(plus(s, zuko)).toBe(0);
    });
  });
});

describe("lot A, incolores et terrains", () => {
  type S = GameState;
  const BASIC_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

  /** Index de la capacité de l'objet portant ce libellé. */
  const abilityIndex = (s: S, id: string, label: string) => {
    const i = chars(s, id).abilities.findIndex((ab) => "label" in ab && ab.label === label);
    if (i < 0) throw new Error(`Capacité « ${label} » introuvable`);
    return i;
  };
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  const canActivate = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).some(
      (a) => a.type === "activate" && a.source === source && a.ability === abilityIndex(s, source, label),
    );
  /** Choisit le bleu quand on demande une couleur de mana. */
  const blueMana: Answer = (req) => (req.type === "pick" && req.options.includes("U") ? ["U"] : undefined);
  const handSize = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  const graveyardNames = (s: S, p: string) => (s.players[p]?.graveyard ?? []).map((id) => nameOf(s, id));
  const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });

  /** Sanctuaire de test (« Enchantment — Shrine »). */
  const shrine = customCard({
    name: "Test Shrine",
    types: ["Enchantment"],
    typeLine: "Enchantment — Shrine",
    subtypes: ["Shrine"],
  });
  /** « Détruisez l'artefact ciblé » pour {0}. */
  const shatter = customCard({
    name: "Test Shatter",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: dsl.spell([dsl.target.permanent("t", ["Artifact"], {}, "artefact")], [dsl.fx.destroy(dsl.ref.target())]),
  });
  /** Créature à {W}, Alliée ou non. */
  const whiteCreature = (name: string, subtypes: string[]) =>
    customCard({
      name,
      typeLine: `Creature — ${subtypes.join(" ")}`,
      subtypes,
      manaCost: { generic: 0, colored: { W: 1 }, x: 0 },
      manaCostText: "{W}",
      colors: ["W"],
      power: 1,
      toughness: 1,
    });
  /** Rituel à {U}, Leçon ou non. */
  const blueSorcery = (name: string, subtypes: string[]) =>
    customCard({
      name,
      types: ["Sorcery"],
      typeLine: subtypes.length ? `Sorcery — ${subtypes.join(" ")}` : "Sorcery",
      subtypes,
      manaCost: { generic: 0, colored: { U: 1 }, x: 0 },
      manaCostText: "{U}",
      colors: ["U"],
      spell: dsl.spell([], [dsl.fx.gainLife(1)]),
    });

  describe("Avatar: The Last Airbender, lot A — incolores et terrains", () => {
    describe("Aang's Journey", () => {
      const run = (kicked: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 4), hand: ["Aang's Journey"], library: ["Opt", shrine, "Island", "Opt"] },
        });
        s = settle(cast(s, "p1", "Aang's Journey", { kicked }));
        return s;
      };

      it("sans kicker : un terrain de base dans la main, et 2 PV", () => {
        const s = run(false);
        expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Test Shrine")).toHaveLength(0);
        expect(s.players.p1?.life).toBe(22);
      });

      it("kické : un terrain de base et une carte de Sanctuaire", () => {
        const s = run(true);
        expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Test Shrine")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(22);
        expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(4);
      });
    });

    it("Energybending : vos terrains ont tous les types de terrain de base jusqu'à la fin du tour ; piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: ["Cryptic Caves", ...lands("Island", 2)], hand: ["Energybending"] },
        p2: { battlefield: ["Forest"] },
      });
      const caves = idOf(s, "p1", "battlefield", "Cryptic Caves");
      const hand = handSize(s);
      s = settle(cast(s, "p1", "Energybending"));
      expect(handSize(s)).toBe(hand);
      expect(chars(s, caves).subtypes).toEqual(expect.arrayContaining(BASIC_TYPES));
      // 305.6 : un terrain de chaque type de terrain de base a la capacité de mana correspondante.
      expect(manaAbilitiesOf(s, caves).flatMap((ab) => ab.produce)).toEqual(
        expect.arrayContaining(["W", "U", "B", "R", "G", "C"]),
      );
      // Les terrains adverses ne sont pas concernés.
      expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).subtypes).toEqual(["Forest"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, caves).subtypes).toEqual([]);
    });

    it("Zuko's Exile : exile un artefact, une créature ou un enchantement ; son contrôleur crée un Indice", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Zuko's Exile"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Zuko's Exile", { targets: { t: [bear] } }));
      expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
      expect(idsOf(s, "p2", "battlefield", "Clue")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
    });

    describe("Barrels of Blasting Jelly", () => {
      it("{1} : un mana de n'importe quelle couleur, une seule fois par tour", () => {
        let s = scenario({ p1: { battlefield: ["Barrels of Blasting Jelly", ...lands("Mountain", 2)] } });
        const barrels = idOf(s, "p1", "battlefield", "Barrels of Blasting Jelly");
        const label = "Un mana de n'importe quelle couleur";
        expect(canActivate(s, "p1", barrels, label)).toBe(true);
        s = settle(activate(s, "p1", barrels, label), (req) =>
          req.type === "pick" && req.options.includes("U") ? ["U"] : undefined,
        );
        expect(s.players.p1?.manaPool.U).toBe(1);
        expect(canActivate(s, "p1", barrels, label)).toBe(false);
      });

      it("{5}, {T}, sacrifiez-le : 5 blessures à une créature", () => {
        let s = scenario({
          p1: { battlefield: ["Barrels of Blasting Jelly", ...lands("Mountain", 5)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const barrels = idOf(s, "p1", "battlefield", "Barrels of Blasting Jelly");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(activate(s, "p1", barrels, "5 blessures à une créature", { targets: { t: [angel] } }));
        expect(graveyardNames(s, "p2")).toContain("Serra Angel");
        expect(graveyardNames(s, "p1")).toContain("Barrels of Blasting Jelly");
      });
    });

    it("Bender's Waterskin : se dégage pendant le tour de l'adversaire et produit un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Bender's Waterskin", tapped: true }] } });
      const skin = idOf(s, "p1", "battlefield", "Bender's Waterskin");
      expect(manaAbilitiesOf(s, skin).flatMap((ab) => ab.produce)).toEqual(["W", "U", "B", "R", "G"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[skin]?.tapped).toBe(false);
    });

    it("Fire Nation Warship : un Indice quand il meurt, même sans avoir été équipé (pas une créature)", () => {
      let s = scenario({ p1: { battlefield: ["Fire Nation Warship"] }, p2: { hand: [shatter] }, active: "p2" });
      const ship = idOf(s, "p1", "battlefield", "Fire Nation Warship");
      expect(chars(s, ship).keywords).toContain("reach");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Test Shatter"), targets: { t: [ship] } }));
      expect(graveyardNames(s, "p1")).toContain("Fire Nation Warship");
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    it("Kyoshi Battle Fan : crée un Allié 1/1 et s'y attache (+1/+0)", () => {
      const s = settle(
        cast(scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Kyoshi Battle Fan"] } }), "p1", "Kyoshi Battle Fan"),
      );
      const ally = idOf(s, "p1", "battlefield", "Ally");
      const fan = idOf(s, "p1", "battlefield", "Kyoshi Battle Fan");
      expect(s.objects[fan]?.attachedTo).toBe(ally);
      expect([chars(s, ally).power, chars(s, ally).toughness, chars(s, ally).colors]).toEqual([2, 1, ["W"]]);
    });

    it("Meteor Sword : détruit un permanent en arrivant ; la créature équipée gagne +3/+3", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 10), "Bear Cub"], hand: ["Meteor Sword"] },
        p2: { battlefield: ["Forest"] },
      });
      const forest = idOf(s, "p2", "battlefield", "Forest");
      s = settle(cast(s, "p1", "Meteor Sword"), picking([forest]));
      expect(graveyardNames(s, "p2")).toEqual(["Forest"]);
      const sword = idOf(s, "p1", "battlefield", "Meteor Sword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sword);
      expect(equip).toBeDefined();
      const targetId = equip?.type === "activate" ? (equip.targets?.[0]?.id ?? "t") : "t";
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: sword,
          ability: equip?.type === "activate" ? equip.ability : -1,
          targets: { [targetId]: [bear] },
        }),
      );
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
    });

    it("Trusty Boomerang : la créature équipée s'engage pour engager une créature, puis le Boomerang revient en main", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub", "Trusty Boomerang"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const boomerang = idOf(s, "p1", "battlefield", "Trusty Boomerang");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const label = "Engagez une créature, puis Trusty Boomerang revient dans la main";
      // Non équipé : rien à engager.
      expect(canActivate(s, "p1", boomerang, label)).toBe(false);
      const equip = legalActions(s, "p1").find(
        (a) => a.type === "activate" && a.source === boomerang && a.ability !== abilityIndex(s, boomerang, label),
      );
      const targetId = equip?.type === "activate" ? (equip.targets?.[0]?.id ?? "t") : "t";
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: boomerang,
          ability: equip?.type === "activate" ? equip.ability : -1,
          targets: { [targetId]: [bear] },
        }),
      );
      expect(s.objects[boomerang]?.attachedTo).toBe(bear);
      s = settle(activate(s, "p1", boomerang, label, { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "hand", "Trusty Boomerang")).toHaveLength(1);
    });

    it("The Walls of Ba Sing Se : vos autres permanents sont indestructibles, pas ceux des adversaires", () => {
      const s = scenario({
        p1: { battlefield: ["The Walls of Ba Sing Se", "Bear Cub", "Island"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const walls = idOf(s, "p1", "battlefield", "The Walls of Ba Sing Se");
      expect(chars(s, walls).keywords).toContain("defender");
      expect(chars(s, walls).keywords).not.toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Island")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("indestructible");
    });

    describe("Terrains", () => {
      it("Agna Qel'a : engagé sans terrain de base, dégagé avec ; {2}{U}, {T} : piochez, puis défaussez", () => {
        let s = scenario({ p1: { hand: ["Agna Qel'a"] } });
        s = playLand(s, "Agna Qel'a");
        expect(s.objects[idOf(s, "p1", "battlefield", "Agna Qel'a")]?.tapped).toBe(true);
        s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Agna Qel'a", "Opt"] } });
        s = playLand(s, "Agna Qel'a");
        const agna = idOf(s, "p1", "battlefield", "Agna Qel'a");
        expect(s.objects[agna]?.tapped).toBe(false);
        const hand = handSize(s);
        s = settle(activate(s, "p1", agna, "Piochez, puis défaussez une carte"));
        expect(handSize(s)).toBe(hand);
        expect(s.players.p1?.graveyard).toHaveLength(1);
        expect(s.objects[agna]?.tapped).toBe(true);
      });

      it("terrains bicolores : arrivent engagés ; {4}, {T}, sacrifiez-les : piochez une carte", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Airship Engine Room"] } });
        s = playLand(s, "Airship Engine Room");
        const room = idOf(s, "p1", "battlefield", "Airship Engine Room");
        expect(s.objects[room]?.tapped).toBe(true);
        expect(manaAbilitiesOf(s, room).flatMap((ab) => ab.produce)).toEqual(["U", "R"]);
        expect(canActivate(s, "p1", room, "Piochez une carte")).toBe(false);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        const hand = handSize(s);
        s = settle(activate(s, "p1", room, "Piochez une carte"));
        expect(handSize(s)).toBe(hand + 1);
        expect(graveyardNames(s, "p1")).toContain("Airship Engine Room");
      });

      it("Fire Nation Palace : une créature gagne la maîtrise du feu 4 jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Fire Nation Palace", "Mountain", "Mountain", "Bear Cub"] } });
        const palace = idOf(s, "p1", "battlefield", "Fire Nation Palace");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", palace, "Maîtrise du feu 4 jusqu'à la fin du tour", { targets: { t: [bear] } }));
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
        s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
        expect(s.players.p1?.manaPool.R).toBe(4);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, bear).abilities.some((ab) => "label" in ab && ab.label === "Maîtrise du feu 4")).toBe(false);
      });

      it("Jasmine Dragon Tea Shop : son mana coloré ne sert qu'aux Alliés ; {5}, {T} : un Allié 1/1", () => {
        const ally = whiteCreature("Test Ally", ["Human", "Ally"]);
        const other = whiteCreature("Test Squire", ["Human"]);
        let s = scenario({ p1: { battlefield: ["Jasmine Dragon Tea Shop"], hand: [ally, other] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ally"))).toBe(true);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Squire"))).toBe(false);
        s = scenario({ p1: { battlefield: ["Jasmine Dragon Tea Shop", ...lands("Island", 5)] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Jasmine Dragon Tea Shop"), "Un Allié 1/1"));
        const token = idOf(s, "p1", "battlefield", "Ally");
        expect([chars(s, token).power, chars(s, token).toughness, chars(s, token).colors]).toEqual([1, 1, ["W"]]);
      });

      it("White Lotus Hideout : son mana coloré ne sert qu'aux Leçons et Sanctuaires ; {1}, {T} : n'importe quelle couleur", () => {
        const lesson = blueSorcery("Test Lesson", ["Lesson"]);
        const plain = blueSorcery("Test Ponder", []);
        let s = scenario({ p1: { battlefield: ["White Lotus Hideout"], hand: [lesson, plain] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Lesson"))).toBe(true);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(false);
        // {1}, {T} : la Forêt paie {1} ; ce mana bleu-là sert à n'importe quel sort.
        s = scenario({ p1: { battlefield: ["White Lotus Hideout", "Forest"], hand: [plain] } });
        const hideout = idOf(s, "p1", "battlefield", "White Lotus Hideout");
        s = settle(activate(s, "p1", hideout, "Un mana de n'importe quelle couleur"), blueMana);
        expect(s.players.p1?.manaPool.U).toBe(1);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(true);
      });

      it("Rumble Arena : regard 1 en arrivant ; {1}, {T} : un mana de n'importe quelle couleur", () => {
        let s = scenario({
          p1: { battlefield: ["Forest"], hand: ["Rumble Arena", blueSorcery("Test Ponder", [])], library: lands("Forest", 3) },
        });
        s = playLand(s, "Rumble Arena");
        expect(s.triggers.length + s.stack.length).toBeGreaterThan(0);
        let scried = false;
        s = settle(s, (req) => {
          scried = true;
          return req.suggested;
        });
        expect(scried).toBe(true);
        const arena = idOf(s, "p1", "battlefield", "Rumble Arena");
        expect(chars(s, arena).keywords).toContain("vigilance");
        expect(manaAbilitiesOf(s, arena).flatMap((ab) => ab.produce)).toEqual(["C"]);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(false);
        // La Forêt paie {1}, l'Arène donne {U}.
        s = settle(activate(s, "p1", arena, "Un mana de n'importe quelle couleur"), blueMana);
        expect(s.players.p1?.manaPool.U).toBe(1);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(true);
      });

      it("Secret Tunnel : imblocable ; deux de vos créatures qui partagent un type deviennent imblocables ce tour-ci", () => {
        let s = scenario({
          p1: { battlefield: ["Secret Tunnel", ...lands("Forest", 4), "Bear Cub", "Bear Cub", "Serra Angel"] },
        });
        const tunnel = idOf(s, "p1", "battlefield", "Secret Tunnel");
        expect(chars(s, tunnel).keywords).toContain("unblockable");
        const [b1, b2] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        const label = "Deux créatures imblocables ce tour-ci";
        // Un Ours et un Ange ne partagent aucun type : cibles refusées.
        expect(() => activate(s, "p1", tunnel, label, { targets: { t: [b1, angel] } })).toThrow();
        s = settle(activate(s, "p1", tunnel, label, { targets: { t: [b1, b2] } }));
        expect(chars(s, b1).keywords).toContain("unblockable");
        expect(chars(s, b2).keywords).toContain("unblockable");
        expect(chars(s, angel).keywords).not.toContain("unblockable");
      });
    });
  });
});

describe("lot B1 : maîtrise de l'eau en coût de sort", () => {
  const yesTo =
    (intent: string, value = 1): Answer =>
    (req) =>
      req.type === "yesNo" && req.intent === intent ? [value] : undefined;

  it("Benevolent River Spirit : maîtrise de l'eau {5} en plus de {U}{U}, payable en engageant ses créatures", () => {
    const run = (bears: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...Array(bears).fill("Bear Cub")],
          hand: ["Benevolent River Spirit"],
          library: lands("Island", 3),
        },
      });
    const short = run(4);
    expect(castable(short, "p1", idOf(short, "p1", "hand", "Benevolent River Spirit"))).toBe(false);
    let s = run(5);
    s = settle(cast(s, "p1", "Benevolent River Spirit"));
    expect(idsOf(s, "p1", "battlefield", "Benevolent River Spirit")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Crashing Wave : maîtrise de l'eau {X}, engage X créatures ciblées, puis trois marqueurs d'étourdissement répartis", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub", "Bear Cub"], hand: ["Crashing Wave"] },
      p2: { battlefield: ["Serra Angel", "Fire Elemental"] },
    });
    const foes = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Fire Elemental")];
    s = settle(cast(s, "p1", "Crashing Wave", { x: 2, targets: { t: foes } }));
    expect(foes.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(foes.reduce((n, id) => n + (s.objects[id]?.counters.stun ?? 0), 0)).toBe(3);
  });

  it("Spirit Water Revival : sans maîtrise, piochez deux cartes ; avec maîtrise de l'eau {6}, cimetière mélangé, sept cartes, pas de main maximale", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...Array(6).fill("Bear Cub")],
          hand: ["Spirit Water Revival"],
          graveyard: ["Opt", "Opt"],
          library: lands("Island", 10),
        },
      });
    let s = settle(cast(setup(), "p1", "Spirit Water Revival"));
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(exiled(s, "Spirit Water Revival")).toHaveLength(1);
    s = settle(cast(setup(), "p1", "Spirit Water Revival", { kicked: true }));
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.players.p1?.graveyard.filter((id) => nameOf(s, id) === "Opt")).toHaveLength(0);
    expect(s.players.p1?.library).toHaveLength(5);
    expect(s.players.p1?.command.some((id) => nameOf(s, id) === "Spirit Water Revival")).toBe(true);
  });

  it("Secret of Bloodbending : vous contrôlez l'adversaire seulement pendant sa prochaine phase de combat", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Secret of Bloodbending"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Secret of Bloodbending", { targets: { t: ["p2"] } }));
    expect(s.turnControl).toMatchObject({ player: "p2", by: "p1", combatOnly: true });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(decider(s)).toBe("p2");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
    expect(decider(s)).toBe("p1");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(decider(s)).toBe("p2");
    expect(s.turnControl).toBeUndefined();
  });

  it("The Unagi of Kyoshi Island : la garde se paie en maîtrisant l'eau {4} (artefacts et créatures de l'adversaire engagés)", () => {
    let s = scenario({
      p1: { battlefield: ["The Unagi of Kyoshi Island"], library: lands("Island", 4) },
      p2: { battlefield: ["Mountain", "Mountain", ...Array(4).fill("Bear Cub")], hand: ["Lightning Strike"] },
      active: "p2",
    });
    const unagi = idOf(s, "p1", "battlefield", "The Unagi of Kyoshi Island");
    s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [unagi] } }), yesTo("unlessPay"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub").filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
    expect(s.objects[unagi]?.damage).toBe(3);
  });

  it("Waterbending Lesson : piochez trois cartes, puis défaussez-en une à moins de maîtriser l'eau {2}", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 4), "Bear Cub", "Bear Cub"],
          hand: ["Waterbending Lesson"],
          library: lands("Island", 5),
        },
      });
    let s = settle(cast(setup(), "p1", "Waterbending Lesson"), yesTo("unlessPay"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    s = settle(cast(setup(), "p1", "Waterbending Lesson"), yesTo("unlessPay", 0));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Foggy Swamp Visions : exilez X cartes de créature des cimetières, un jeton copie de chacune, sacrifié à votre prochaine étape de fin", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Foggy Swamp Visions"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "graveyard", "Serra Angel");
    s = settle(cast(s, "p1", "Foggy Swamp Visions", { x: 1, targets: { t: [angel] } }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup");
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Ruinous Waterbending : toutes les créatures -2/-2 ; maîtrise de l'eau {4} payée : 1 PV par créature qui meurt ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), ...Array(4).fill("Bear Cub")], hand: ["Ruinous Waterbending"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Ruinous Waterbending", { kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(2);
    expect(s.players.p1?.life).toBe(25);
  });

  it("Hama, the Bloodbender : l'adversaire meule trois cartes ; la carte non-créature exilée se lance pendant votre tour en maîtrisant l'eau {X}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Bear Cub", "Bear Cub"], hand: ["Hama, the Bloodbender"] },
      p2: { library: ["Lightning Strike", "Bear Cub", "Mountain", "Island"] },
    });
    s = settle(cast(s, "p1", "Hama, the Bloodbender", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.library).toHaveLength(1);
    const strike = exiled(s, "Lightning Strike")[0] as string;
    expect(strike).toBeDefined();
    // Lightning Strike (valeur de mana 2) : maîtrise de l'eau {2}, payée en engageant les deux Ours.
    expect(castable(s, "p1", strike)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
  });
});

describe("lot B2 : « chaque fois que vous maîtrisez » (Avatar Aang)", () => {
  const AANG = "Avatar Aang // Aang, Master of Elements";
  /** Une capacité par élément : maîtrise de l'eau {1}, de la terre 1 et de l'air (sur un permanent ciblé). */
  const benders = customCard({
    name: "Test Benders",
    types: ["Enchantment"],
    typeLine: "Enchantment",
    abilities: [
      dsl.activated({ mana: "{1}", waterbend: true, effects: [], label: "eau" }),
      dsl.activated({
        targets: [dsl.target.permanent("t", ["Land"], { controller: "you" }, "terrain")],
        effects: [...dsl.fx.earthbend(dsl.ref.target(), 1)],
        label: "terre",
      }),
      dsl.activated({ targets: [dsl.target.nonland("t")], effects: [dsl.fx.airbend(dsl.ref.target())], label: "air" }),
    ],
  });
  /** Face visible : le verso a sa propre définition (`faceDefId`). */
  const back = (s: S, id: string) => s.defs[s.objects[id]?.faceDefId ?? ""]?.name === "Aang, Master of Elements";
  const use = (s: S, label: string, targets?: Record<string, string[]>) => {
    const src = idOf(s, "p1", "battlefield", "Test Benders");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === src && x.label === label);
    return settle(act(s, "p1", { type: "activate", source: src, ability: a?.type === "activate" ? a.ability : -1, targets }));
  };

  it("chaque maîtrise (eau, terre, air, puis feu en attaquant) fait piocher ; les quatre ce tour-ci transforment Aang", () => {
    let s = scenario({
      p1: { battlefield: [AANG, benders, "Island", "Forest", "Bear Cub"], library: lands("Island", 8) },
      p2: { battlefield: ["Bear Cub"] },
    });
    const aang = idOf(s, "p1", "battlefield", AANG);
    const hand = () => s.players.p1?.hand.length ?? 0;
    const h0 = hand();
    s = use(s, "eau");
    s = use(s, "terre", { t: [idOf(s, "p1", "battlefield", "Forest")] });
    s = use(s, "air", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] });
    expect(hand()).toBe(h0 + 3);
    expect(back(s, aang)).toBe(false);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: aang, defender: "p2" }] });
    s = settle(s);
    expect(hand()).toBe(h0 + 4);
    expect(back(s, aang)).toBe(true);
  });

  it("Aang, Master of Elements : vos sorts coûtent {W}{U}{B}{R}{G} de moins (le reste réduit le générique)", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: [AANG, "Shivan Dragon"] } });
    moveWithSpec(s, "p1", idOf(s, "p1", "hand", AANG), { to: "battlefield", transformed: true });
    // Shivan Dragon {4}{R}{R} : {R} retiré par le {R}, {4} par {W}{U}{B}{G} : reste {R}.
    const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
    expect(castable(s, "p1", dragon)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: dragon }));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Aang, Master of Elements : à l'entretien, transformé, 4 PV, quatre cartes, quatre marqueurs, 4 blessures à chaque adversaire", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({ p1: { hand: [AANG], library: lands("Island", 8) }, active: "p2", step: "untap" });
    const aang = moveWithSpec(s, "p1", idOf(s, "p1", "hand", AANG), { to: "battlefield", transformed: true }) as string;
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep" && x.pending?.kind === "choice");
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(back(s, aang)).toBe(false);
    expect(s.players.p1?.life).toBe(24);
    expect(s.players.p1?.hand).toHaveLength(4);
    expect(s.objects[aang]?.counters["+1/+1"]).toBe(4);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("lot C1 : caractéristiques et montants", () => {
  it("Toph, the Blind Bandit : maîtrise de la terre 2 en arrivant ; sa force vaut les marqueurs +1/+1 de vos terrains", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), { name: "Plains", counters: { "+1/+1": 1 } }],
        hand: ["Toph, the Blind Bandit"],
      },
    });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = settle(cast(s, "p1", "Toph, the Blind Bandit"), picking([forest]));
    const toph = idOf(s, "p1", "battlefield", "Toph, the Blind Bandit");
    expect(s.objects[forest]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, toph).power).toBe(3);
  });

  it("Earthen Ally : +1/+0 pour chaque couleur parmi les Alliés que vous contrôlez", () => {
    const s = scenario({ p1: { battlefield: ["Earthen Ally", "Kyoshi Warriors", "Llanowar Elves", "Shivan Dragon"] } });
    // Alliés : Earthen Ally (vert) et Kyoshi Warriors (blanc) ; ni l'Elfe ni le Dragon ne comptent.
    expect(chars(s, idOf(s, "p1", "battlefield", "Earthen Ally")).power).toBe(2);
  });

  it("Diligent Zookeeper : vos créatures non-Humains ont +1/+1 par type de créature (un changelin est Humain)", () => {
    const s = scenario({ p1: { battlefield: ["Diligent Zookeeper", "Bear Cub", "Llanowar Elves", "Changeling Wayfinder"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(3);
    // Un changelin a tous les types de créature, Humain compris : il n'est pas concerné.
    expect(chars(s, idOf(s, "p1", "battlefield", "Changeling Wayfinder")).power).toBe(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Diligent Zookeeper")).power).toBe(4);
  });

  it("Avatar Destiny : +1/+1 par carte de créature au cimetière ; morte, meulez sa force, l'Aura revient, une créature meulée arrive", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Bear Cub"],
        hand: ["Avatar Destiny"],
        graveyard: ["Serra Angel", "Llanowar Elves"],
        library: ["Shivan Dragon", "Island", "Island", "Island", "Island", "Island"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Avatar Destiny", { targets: { enchant: [bear] } }));
    expect(chars(s, bear).power).toBe(4);
    expect(chars(s, bear).subtypes).toContain("Avatar");
    destroy(s, bear);
    s = settle(s);
    // Force 4 au moment de mourir : quatre cartes meulées, dont Shivan Dragon, qui arrive sous votre contrôle.
    expect(s.players.p1?.library).toHaveLength(2);
    expect(idsOf(s, "p1", "hand", "Avatar Destiny")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("White Lotus Tile : arrive engagé ; {T} : X mana d'une couleur, X le plus de créatures partageant un type", () => {
    let s = scenario({
      p1: { hand: ["White Lotus Tile"], battlefield: [...lands("Plains", 4), "Kyoshi Warriors", "Kyoshi Warriors", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "White Lotus Tile"));
    const tile = idOf(s, "p1", "battlefield", "White Lotus Tile");
    expect(s.objects[tile]?.tapped).toBe(true);
    s.objects[tile]!.tapped = false;
    s = settle(activate(s, "p1", tile), (req) => (req.type === "pick" && req.options.includes("G") ? ["G"] : undefined));
    // Deux Kyoshi Warriors (Humains Guerriers Alliés) partagent un type : deux mana vert.
    expect(s.players.p1?.manaPool.G).toBe(2);
  });

  it("Bumi, King of Three Trials : jusqu'à X modes, X étant le nombre de Leçons dans votre cimetière", () => {
    const modes = (graveyard: string[]) => {
      const s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Bumi, King of Three Trials"], graveyard } });
      const after = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bumi, King of Three Trials") });
      const resolved = passAccepting(after, (x) => x.pending?.kind === "choice" || x.stack.length + x.triggers.length === 0);
      const p = resolved.pending;
      return p?.kind === "choice" && p.request.type === "pick" ? p.request.options.length : 0;
    };
    // Sans Leçon : le seul mode « Aucun » (pas de question).
    expect(modes([])).toBe(0);
    // Une Leçon : chaque mode seul, ou aucun.
    expect(modes(["Shared Roots"])).toBe(4);
    // Trois Leçons : toutes les combinaisons.
    expect(modes(["Shared Roots", "Firebending Lesson", "Combustion Technique"])).toBe(8);
  });
});

describe("lot C2 : lancement et mana", () => {
  it("Redirect Lightning : payez 5 PV (ou {2}) et changez la cible d'un sort à cible unique", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Redirect Lightning"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      active: "p2",
    });
    s = cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    const strike = s.stack[0]?.id as string;
    // Une seule Montagne : {2} est impossible, il faut payer 5 PV (le « kicker »).
    expect(() => cast(s, "p1", "Redirect Lightning", { targets: { t: [strike] } })).toThrow();
    s = settle(cast(s, "p1", "Redirect Lightning", { kicked: true, targets: { t: [strike] } }), picking(["p2"]));
    expect(s.players.p1?.life).toBe(15);
    expect(s.players.p2?.life).toBe(17);
  });

  it("Sozin's Comet : présage {2} pendant votre tour, puis lancé à un tour ultérieur pour {2}{R} ; vos créatures ont la maîtrise du feu 5", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Sozin's Comet"] } });
    const comet = idOf(s, "p1", "hand", "Sozin's Comet");
    const foretell = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === comet && a.label === "Présage");
    expect(foretell).toBeDefined();
    s = settle(act(s, "p1", { type: "activate", source: comet, ability: foretell?.type === "activate" ? foretell.ability : -1 }));
    const exiledComet = exiled(s, "Sozin's Comet")[0] as string;
    expect(exiledComet).toBeDefined();
    expect(castable(s, "p1", exiledComet)).toBe(false);
    const turn = s.turn.number;
    s = advanceUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.number > turn && x.turn.step === "main1" && x.pending?.kind === "priority",
    );
    s = settle(act(s, "p1", { type: "cast", card: exiledComet }));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
    expect(s.players.p1?.manaPool.R).toBe(5);
  });

  it("The Last Agni Kai : combat ; l'excès de blessures donne autant de {R}, et le mana rouge ne se vide pas ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Serra Angel"], hand: ["The Last Agni Kai"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "The Last Agni Kai", { targets: { a: [angel], b: [bear] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.players.p1?.manaPool.R).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p1?.manaPool.R).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.manaPool.R).toBe(0);
  });

  it("Lo and Li, Twin Tutors : cherchez une Leçon ; vos sorts de Leçon ont le lien de vie", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 5).concat(lands("Mountain", 1)),
        hand: ["Lo and Li, Twin Tutors"],
        library: ["Island", "Firebending Lesson", "Island"],
        life: 10,
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Lo and Li, Twin Tutors"), picking([]));
    const lesson = idOf(s, "p1", "hand", "Firebending Lesson");
    s = settle(act(s, "p1", { type: "cast", card: lesson, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p1?.life).toBe(12);
  });

  it("Iroh, Grand Lotus : pendant votre tour, vos éphémères et rituels ont le flashback (les Leçons pour {1})", () => {
    let s = scenario({
      p1: { battlefield: ["Iroh, Grand Lotus", ...lands("Mountain", 3)], graveyard: ["Lightning Strike", "Firebending Lesson"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    // Il reste une Montagne : Firebending Lesson pour {1} (son flashback de Leçon).
    const lesson = idOf(s, "p1", "graveyard", "Firebending Lesson");
    s = settle(act(s, "p1", { type: "cast", card: lesson, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Firebending Lesson")).toHaveLength(1);
  });

  it("Iroh, Grand Lotus : pas de flashback pendant le tour adverse", () => {
    const s = scenario({
      p1: { battlefield: ["Iroh, Grand Lotus", ...lands("Mountain", 3)], graveyard: ["Lightning Strike"] },
      active: "p2",
    });
    expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Lightning Strike"))).toBe(false);
  });

  it("Ozai, the Phoenix King : le mana non dépensé devient rouge ; six ou plus : vol et indestructible", () => {
    let s = scenario({ p1: { battlefield: ["Ozai, the Phoenix King", ...lands("Island", 6)] } });
    const ozai = idOf(s, "p1", "battlefield", "Ozai, the Phoenix King");
    for (const id of idsOf(s, "p1", "battlefield", "Island")) {
      const m = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === id);
      s = act(s, "p1", { type: "tapForMana", source: id, ability: m?.type === "tapForMana" ? m.ability : 0, color: "U" });
    }
    expect(chars(s, ozai).keywords).toEqual(expect.arrayContaining(["flying", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.step !== "main1");
    expect(s.players.p1?.manaPool.R).toBe(6);
    expect(s.players.p1?.manaPool.U).toBe(0);
  });

  it("Planetarium of Wan Shi Tong : après un regard, lancez gratuitement la carte du dessus (une fois par tour)", () => {
    let s = scenario({
      p1: { battlefield: ["Planetarium of Wan Shi Tong", "Island"], library: ["Lightning Strike", "Opt", "Island"] },
    });
    const planetarium = idOf(s, "p1", "battlefield", "Planetarium of Wan Shi Tong");
    s = act(s, "p1", { type: "activate", source: planetarium, ability: 0 });
    for (let i = 0; i < 40 && !castNowOf(s); i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: p.request.type === "pick" ? [] : p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
    }
    const now = castNowOf(s);
    expect(now?.cards).toHaveLength(1);
    s = settle(act(s, "p1", { type: "cast", card: now?.cards[0] as string, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });
});

describe("lot C3 : cartes uniques", () => {
  it("Destined Confrontation : chaque joueur garde des créatures de force totale 4 ou moins et sacrifie les autres", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Serra Angel", "Bear Cub", "Llanowar Elves"], hand: ["Destined Confrontation"] },
      p2: { battlefield: ["Shivan Dragon", "Bear Cub"] },
    });
    const keep = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")];
    const tooMuch = [idOf(s, "p1", "battlefield", "Serra Angel"), ...keep];
    const cast1 = cast(s, "p1", "Destined Confrontation");
    expect(() => settle(cast1, (req, p) => (req.type === "pick" && p === "p1" ? tooMuch : undefined))).toThrow(/Force totale/);
    s = settle(cast1, (req, p) => (req.type === "pick" && p === "p1" ? keep : undefined));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    // Suggestion de l'adversaire : le Dragon (force 5) ne tient pas dans la limite.
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Fated Firepower : X marqueurs de feu ; vos sources infligent autant de blessures en plus aux adversaires et à leurs permanents", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 7), hand: ["Fated Firepower", "Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Fated Firepower", { x: 2 }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Fated Firepower")]?.counters.fire).toBe(2);
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(15);
  });

  it("Firebender Ascension : la capacité d'une créature qui attaque ajoute un marqueur de quête ; à quatre, elle est copiée", () => {
    const firebender = customCard({ name: "Test Firebender", power: 2, toughness: 2, abilities: [dsl.firebending(1)] });
    let s = scenario({ p1: { battlefield: [{ name: "Firebender Ascension", counters: { quest: 3 } }, firebender] } });
    const asc = idOf(s, "p1", "battlefield", "Firebender Ascension");
    const attacker = idOf(s, "p1", "battlefield", "Test Firebender");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: attacker, defender: "p2" }] });
    // L'Ascension se résout d'abord (au-dessus de la maîtrise du feu) : la capacité est copiée.
    s = settle(s, (req) => {
      if (req.type === "order") {
        const first = (id: string) => (/quête/.test(req.labels?.[id] ?? "") ? 0 : 1);
        return [...req.items].sort((a, b) => first(a) - first(b));
      }
      return req.type === "yesNo" ? [1] : undefined;
    });
    expect(s.objects[asc]?.counters.quest).toBe(4);
    expect(s.players.p1?.manaPool.R).toBe(2);
  });

  it("Koh, the Face Stealer : exile une créature ; payez 1 PV, choisissez-la : Koh a ses capacités activées", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Koh, the Face Stealer"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Koh, the Face Stealer"), picking([elves]));
    expect(exiled(s, "Llanowar Elves")).toHaveLength(1);
    const koh = idOf(s, "p1", "battlefield", "Koh, the Face Stealer");
    expect(manaAbilitiesOf(s, koh)).toHaveLength(0);
    s = settle(activate(s, "p1", koh));
    expect(s.players.p1?.life).toBe(19);
    expect(s.objects[koh]?.chosen?.cardName).toBe("Llanowar Elves");
    expect(manaAbilitiesOf(s, koh)).toHaveLength(1);
  });

  it("The Rise of Sozin : I détruit toutes les créatures ; II exile jusqu'à quatre cartes du nom choisi chez l'adversaire", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["The Rise of Sozin // Fire Lord Sozin"] },
      p2: {
        battlefield: ["Bear Cub"],
        hand: ["Lightning Strike"],
        library: ["Lightning Strike", "Island"],
        graveyard: ["Lightning Strike"],
      },
    });
    s = settle(cast(s, "p1", "The Rise of Sozin // Fire Lord Sozin"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0);
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("Lightning Strike") ? ["Lightning Strike"] : undefined));
    expect(exiled(s, "Lightning Strike")).toHaveLength(3);
  });

  it("Fire Lord Sozin : blessures de combat à un joueur, payez X : des créatures de son cimetière, de valeur de mana totale X ou moins", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["The Rise of Sozin // Fire Lord Sozin"] },
      p2: { graveyard: ["Bear Cub", "Serra Angel"] },
    });
    const sozin = moveWithSpec(s, "p1", idOf(s, "p1", "hand", "The Rise of Sozin // Fire Lord Sozin"), {
      to: "battlefield",
      transformed: true,
    }) as string;
    s.objects[sozin]!.controlledSince = 0;
    const bear = idOf(s, "p2", "graveyard", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sozin, defender: "p2" }] });
    // Jusqu'à la seconde phase principale : X = 2, l'Ours (valeur de mana 2) revient ; l'Ange (5) non.
    for (let i = 0; i < 60 && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "choice") {
        const req = p.request;
        const v = req.type === "number" ? [2] : req.type === "pick" && req.options.includes(bear) ? [bear] : req.suggested;
        s = act(s, p.player, { type: "choose", values: v });
      } else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p) s = act(s, p.player, { type: "pass" });
    }
    expect(s.players.p2?.life).toBe(15);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.graveyard.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
  });
});

describe("Avatar: The Last Airbender : cartes du méta (PLAN-C, lot C13)", () => {
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activateLabel = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability });
  };
  const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const spirit = customCard({ name: "Test Spirit", typeLine: "Creature — Spirit", subtypes: ["Spirit"], power: 1, toughness: 1 });

  describe("Abandon Attachments", () => {
    it("vous pouvez défausser une carte ; si vous le faites, piochez deux cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Abandon Attachments", "Forest"], library: ["Opt", "Plains", "Swamp"] },
      });
      s = settle(cast(s, "p1", "Abandon Attachments"), (req, _p, cur) =>
        req.type === "pick" && req.intent === "discard" ? req.options.filter((id) => nameOf(cur, id) === "Forest") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Opt", "Plains"]);
      expect(idsOf(s, "p1", "graveyard", "Abandon Attachments")).toHaveLength(1);
    });

    it("sans défausse, pas de pioche", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Abandon Attachments", "Forest"], library: ["Opt", "Plains"] },
      });
      s = settle(cast(s, "p1", "Abandon Attachments"), (req) =>
        req.type === "pick" && req.intent === "discard" ? [] : req.type === "yesNo" ? [0] : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("main vide : rien à défausser, donc pas de pioche", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Abandon Attachments"], library: ["Opt", "Plains"] } });
      s = settle(cast(s, "p1", "Abandon Attachments"));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });

  describe("Abandoned Air Temple", () => {
    it("arrive engagé sauf si vous contrôlez un terrain de base ; {T} : {W}", () => {
      const run = (battlefield: string[]) => {
        const s = playLand(scenario({ p1: { battlefield, hand: ["Abandoned Air Temple"] } }), "Abandoned Air Temple");
        return s.objects[idOf(s, "p1", "battlefield", "Abandoned Air Temple")]?.tapped;
      };
      expect(run([])).toBe(true);
      expect(run(["Realm of Koh"])).toBe(true);
      expect(run(["Island"])).toBe(false);
      let s = scenario({ p1: { battlefield: ["Abandoned Air Temple"], hand: ["Healer's Hawk"] } });
      s = settle(cast(s, "p1", "Healer's Hawk"));
      expect(idsOf(s, "p1", "battlefield", "Healer's Hawk")).toHaveLength(1);
    });

    it("{3}{W}, {T} : un marqueur +1/+1 sur chaque créature que vous contrôlez (pas celles de l'adversaire)", () => {
      let s = scenario({
        p1: { battlefield: ["Abandoned Air Temple", ...lands("Plains", 4), "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Abandoned Air Temple"), "marqueur"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p1", "battlefield", "Abandoned Air Temple")]?.tapped).toBe(true);
    });
  });

  describe("Realm of Koh", () => {
    /** Crée l'Esprit de p1 au tour 3, puis va à la déclaration des attaquants du tour 5 de p1. */
    const spiritAttacks = (p2: (string | CardDef)[]) => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] }, p2: { battlefield: p2 } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Esprit"));
      const token = s.battlefield.find((id) => chars(s, id).name === "Spirit") as string;
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: token, defender: "p2" }] });
      return { s, token };
    };

    it("arrive engagé sauf si vous contrôlez un terrain de base ; {T} : {B}", () => {
      const run = (battlefield: string[]) => {
        const s = playLand(scenario({ p1: { battlefield, hand: ["Realm of Koh"] } }), "Realm of Koh");
        return s.objects[idOf(s, "p1", "battlefield", "Realm of Koh")]?.tapped;
      };
      expect(run([])).toBe(true);
      expect(run(["Swamp"])).toBe(false);
      let s = scenario({ p1: { battlefield: ["Realm of Koh"], hand: ["Vampiric Rites"] } });
      s = settle(cast(s, "p1", "Vampiric Rites"));
      expect(idsOf(s, "p1", "battlefield", "Vampiric Rites")).toHaveLength(1);
    });

    it("{3}{B}, {T} : un jeton Esprit 1/1 incolore", () => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Esprit"));
      const tokens = s.battlefield.filter((id) => chars(s, id).name === "Spirit");
      expect(tokens).toHaveLength(1);
      const token = tokens[0] as string;
      expect(s.objects[token]?.isToken).toBe(true);
      expect(chars(s, token).colors).toEqual([]);
      expect(chars(s, token).subtypes).toContain("Spirit");
      expect(pt(s, token)).toEqual([1, 1]);
    });

    it("le jeton ne peut pas être bloqué par une créature non-Esprit, mais un Esprit peut le bloquer", () => {
      const { s, token } = spiritAttacks(["Bear Cub", spirit]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), token)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Test Spirit"), token)).toBe(true);
    });

    it("le jeton ne peut pas bloquer une créature non-Esprit", () => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Esprit"));
      const token = s.battlefield.find((id) => chars(s, id).name === "Spirit") as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      expect(canBlock(s, token, bear)).toBe(false);
    });

    it("le jeton peut bloquer une créature Esprit", () => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] }, p2: { battlefield: [spirit] } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Esprit"));
      const token = s.battlefield.find((id) => chars(s, id).name === "Spirit") as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const other = idOf(s, "p2", "battlefield", "Test Spirit");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: other, defender: "p1" }] });
      expect(canBlock(s, token, other)).toBe(true);
    });
  });

  describe("Aang, at the Crossroads // Aang, Destined Savior", () => {
    const AANG = "Aang, at the Crossroads // Aang, Destined Savior";
    const back = (s: S, id: string) => s.defs[s.objects[id]?.faceDefId ?? ""]?.name === "Aang, Destined Savior";

    it("vol ; en arrivant, parmi les cinq du dessus, une créature de VM 4 ou moins peut arriver ; le reste va dessous", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Plains", "Island"],
          hand: [AANG],
          library: ["Shivan Dragon", "Bear Cub", "Serra Angel", "Forest", "Llanowar Elves", "Opt"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", AANG), (req, _p, cur) => {
        if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
        offered = req.options.map((id) => nameOf(cur, id));
        return req.options.filter((id) => nameOf(cur, id) === "Bear Cub");
      });
      expect(chars(s, idOf(s, "p1", "battlefield", AANG)).keywords).toContain("flying");
      expect(offered.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      const lib = s.players.p1?.library ?? [];
      expect(nameOf(s, lib[0] as string)).toBe("Opt");
      expect(namesIn(s, lib.slice(1)).sort()).toEqual(["Forest", "Llanowar Elves", "Serra Angel", "Shivan Dragon"]);
    });

    it("« vous pouvez » : aucune créature n'est obligée d'arriver", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Plains", "Island"], hand: [AANG], library: ["Bear Cub", "Forest"] },
      });
      s = settle(cast(s, "p1", AANG), (req) => (req.type === "pick" && req.intent === "lookAtTop" ? [] : undefined));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("quand une autre de vos créatures quitte le champ de bataille, Aang se transforme au début du prochain entretien", () => {
      let s = scenario({ p1: { battlefield: [AANG, "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
      const aang = idOf(s, "p1", "battlefield", AANG);
      // Une créature adverse qui meurt ne compte pas.
      destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
      s = settle(s);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(back(s, aang)).toBe(false);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      // Pas tout de suite : au début du prochain entretien (celui de p1).
      expect(back(s, aang)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect(back(s, aang)).toBe(true);
      expect(chars(s, aang).name).toBe("Aang, Destined Savior");
      expect(chars(s, aang).keywords).toContain("flying");
    });

    it("Aang, Destined Savior : au début du combat, maîtrise de la terre 2 ; vos créatures-terrains ont la vigilance", async () => {
      const { moveWithSpec } = await import("../src/effects");
      let s = scenario({ p1: { battlefield: ["Forest"], hand: [AANG] }, p2: { battlefield: ["Forest"] } });
      moveWithSpec(s, "p1", idOf(s, "p1", "hand", AANG), { to: "battlefield", transformed: true });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers", 600);
      expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(s, forest)).toEqual([2, 2]);
      expect(chars(s, forest).keywords).toEqual(expect.arrayContaining(["haste", "vigilance"]));
      // Un terrain non-créature ou adverse n'a pas la vigilance.
      expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).keywords).not.toContain("vigilance");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: forest, defender: "p2" }] });
      expect(s.objects[forest]?.tapped).toBe(false);
    });
  });

  describe("Airbender Ascension", () => {
    it("en arrivant, maîtrise de l'air sur jusqu'à une créature ciblée : exilée, son propriétaire peut la relancer pour {2}", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Airbender Ascension"] },
        p2: { battlefield: ["Serra Angel", ...lands("Plains", 2)] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Airbender Ascension"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      const card = exiled(s, "Serra Angel")[0] as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", card)).toBe(true);
    });

    it("chaque créature qui arrive sous votre contrôle ajoute un marqueur de quête (pas celles de l'adversaire)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Airbender Ascension"], hand: ["Llanowar Elves", "Llanowar Elves"] },
      });
      const asc = idOf(s, "p1", "battlefield", "Airbender Ascension");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[asc]?.counters.quest).toBe(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[asc]?.counters.quest).toBe(2);
    });

    it("à votre étape de fin, avec quatre marqueurs de quête ou plus : exile une de vos créatures puis la renvoie", () => {
      let s = scenario({
        p1: {
          battlefield: [
            { name: "Airbender Ascension", counters: { quest: 4 } },
            { name: "Bear Cub", damage: 1 },
          ],
        },
      });
      const asc = idOf(s, "p1", "battlefield", "Airbender Ascension");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 200);
      s = settle(s, picking([bear]));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).not.toBe(bear);
      expect(s.objects[back]?.damage).toBe(0);
      expect(s.objects[back]?.controller).toBe("p1");
      // La créature revenue arrive sous votre contrôle : un marqueur de plus.
      expect(s.objects[asc]?.counters.quest).toBe(5);
    });

    it("avec trois marqueurs de quête, rien ne se passe à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Airbender Ascension", counters: { quest: 3 } }, "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idOf(s, "p1", "battlefield", "Bear Cub")).toBe(bear);
    });
  });

  describe("Raven Eagle", () => {
    it("vol ; en arrivant, exile une carte d'un cimetière : une carte de créature donne un Indice", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Raven Eagle"] }, p2: { graveyard: ["Bear Cub", "Opt"] } });
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      s = settle(cast(s, "p1", "Raven Eagle"), picking([bear]));
      const eagle = idOf(s, "p1", "battlefield", "Raven Eagle");
      expect(chars(s, eagle).keywords).toContain("flying");
      expect(pt(s, eagle)).toEqual([2, 3]);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Clue" && s.objects[id]?.controller === "p1")).toHaveLength(1);
    });

    it("une carte non-créature exilée ne donne pas d'Indice ; « jusqu'à une » : la cible est facultative", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Raven Eagle"], graveyard: ["Opt"] } });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      s = settle(cast(s, "p1", "Raven Eagle"), picking([opt]));
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Clue")).toHaveLength(0);
      s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Raven Eagle"] }, p2: { graveyard: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Raven Eagle"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("en attaquant, exile aussi une carte d'un cimetière (Indice pour une créature)", () => {
      let s = scenario({ p1: { battlefield: ["Raven Eagle"] }, p2: { graveyard: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      s = attack(s, [idOf(s, "p1", "battlefield", "Raven Eagle")]);
      s = settle(s, picking([bear]));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Clue")).toHaveLength(1);
    });

    it("quand vous piochez votre deuxième carte du tour, chaque adversaire perd 1 PV et vous en gagnez 1 (une fois)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Raven Eagle", ...lands("Island", 4)], hand: ["Quick Study", "Opt"], library: lands("Island", 6) },
      });
      s = settle(cast(s, "p1", "Quick Study"));
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p3?.life).toBe(19);
      // La troisième carte ne déclenche rien.
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p2?.life).toBe(19);
    });
  });

  describe("Iroh's Demonstration", () => {
    it("premier mode : 1 blessure à chaque créature de vos adversaires (pas aux vôtres)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Llanowar Elves"], hand: ["Iroh's Demonstration"] },
        p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Iroh's Demonstration", { mode: 0 }));
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.damage).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Iroh's Demonstration")).toHaveLength(1);
    });

    it("second mode : 4 blessures à une créature ciblée (y compris une des vôtres)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Serra Angel"], hand: ["Iroh's Demonstration"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Iroh's Demonstration", { mode: 1, targets: { t: [dragon] } }));
      expect(s.objects[dragon]?.damage).toBe(4);
      s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Serra Angel"], hand: ["Iroh's Demonstration"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Iroh's Demonstration", { mode: 1, targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });
});
