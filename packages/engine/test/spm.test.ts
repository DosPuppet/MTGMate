/**
 * Marvel's Spider-Man (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Web-slinging (Spider-Sense), Mind Swap (Superior Spider-Man), Hydro-Man, Sandman, Carnage,
 * Aunt May, Spider Manifestation, Interdimensional Web Watch, Multiversal Passage et Spider-Rex.
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, castNowOf, idOf, idsOf, passAccepting, scenario, untilCastNow } from "./helpers";

type S = GameState;
type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
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
const castable = (s: S, player: string, card: string) =>
  legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

describe("Marvel's Spider-Man", () => {
  describe("Hydro-Man, Fluid Felon", () => {
    it("un sort bleu lui donne +1/+1 jusqu'à la fin du tour, pas un sort rouge", () => {
      let s = scenario({
        p1: { battlefield: ["Hydro-Man, Fluid Felon", "Island", "Mountain"], hand: ["Opt", "Burst Lightning"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const hydro = idOf(s, "p1", "battlefield", "Hydro-Man, Fluid Felon");
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(pt(s, hydro)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, hydro)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, hydro).types).toEqual(["Land"]);
    });

    it("à votre étape de fin, il se dégage et devient un terrain qui produit {U} jusqu'à votre prochain tour", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Hydro-Man, Fluid Felon", tapped: true }] } });
      const hydro = idOf(s, "p1", "battlefield", "Hydro-Man, Fluid Felon");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[hydro]?.tapped).toBe(false);
      expect(chars(s, hydro).types).toEqual(["Land"]);
      expect(chars(s, hydro).subtypes).toEqual([]);
      // L'adversaire passe : vous recevez la priorité pendant son tour.
      s = act(s, "p2", { type: "pass" });
      const mana = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === hydro);
      expect(mana.flatMap((a) => (a.type === "tapForMana" ? a.colors : []))).toEqual(["U"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(chars(s, hydro).types).toEqual(["Creature"]);
    });
  });

  describe("Sandman, Shifting Scoundrel", () => {
    it("sa force et son endurance sont égales au nombre de terrains que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Sandman, Shifting Scoundrel", ...lands("Forest", 3)], hand: ["Forest"] } });
      const sandman = idOf(s, "p1", "battlefield", "Sandman, Shifting Scoundrel");
      expect(pt(s, sandman)).toEqual([3, 3]);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(pt(s, sandman)).toEqual([4, 4]);
    });

    it("ne peut pas être bloqué par une créature de force 2 ou moins", () => {
      let s = scenario({
        p1: { battlefield: ["Sandman, Shifting Scoundrel", ...lands("Forest", 3)] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const sandman = idOf(s, "p1", "battlefield", "Sandman, Shifting Scoundrel");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sandman, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: sandman }] })).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: sandman }] })).not.toThrow();
    });
  });

  describe("Superior Spider-Man", () => {
    it("Mind Swap : copie d'une carte de créature de votre cimetière (capacités comprises), 4/4, exilée ensuite", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Swamp", 2)],
          hand: ["Superior Spider-Man"],
          graveyard: ["Doctor Doom"],
        },
      });
      const doom = idOf(s, "p1", "graveyard", "Doctor Doom");
      s = settle(cast(s, "p1", "Superior Spider-Man"), picking([doom]));
      const spidey = s.battlefield.find((id) => chars(s, id).name === "Superior Spider-Man") as string;
      const c = chars(s, spidey);
      expect(pt(s, spidey)).toEqual([4, 4]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Scientist", "Villain", "Spider", "Human", "Hero"]));
      // La capacité d'arrivée de Doctor Doom se déclenche : deux Doombots.
      expect(idsOf(s, "p1", "battlefield", "Doombot")).toHaveLength(2);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Doctor Doom");
    });

    it("sans carte de créature dans les cimetières, il arrive comme une 4/4 sans capacité", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Superior Spider-Man"] } });
      s = settle(cast(s, "p1", "Superior Spider-Man"));
      const spidey = idOf(s, "p1", "battlefield", "Superior Spider-Man");
      expect(pt(s, spidey)).toEqual([4, 4]);
      expect(chars(s, spidey).subtypes).toEqual(expect.arrayContaining(["Spider", "Human", "Hero"]));
    });
  });

  it("Multiversal Passage : sans payer 2 PV, il arrive engagé ; il a le type choisi", () => {
    let s = scenario({ p1: { hand: ["Multiversal Passage"] } });
    s = act(s, "p1", {
      type: "playLand",
      card: idOf(s, "p1", "hand", "Multiversal Passage"),
      payLife: false,
      landType: "Forest",
    });
    const passage = idOf(s, "p1", "battlefield", "Multiversal Passage");
    expect(s.objects[passage]?.tapped).toBe(true);
    expect(s.players.p1?.life).toBe(20);
    expect(chars(s, passage).subtypes).toEqual(["Forest"]);
  });

  it("Aunt May : 1 PV par autre créature arrivée sous votre contrôle ; une Araignée reçoit un marqueur +1/+1", () => {
    let s = scenario({
      p1: { battlefield: ["Aunt May", ...lands("Forest", 4)], hand: ["Spider Manifestation", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Spider Manifestation"));
    expect(s.players.p1?.life).toBe(21);
    const spider = idOf(s, "p1", "battlefield", "Spider Manifestation");
    expect(s.objects[spider]?.counters["+1/+1"]).toBe(1);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(s.players.p1?.life).toBe(22);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    // Une créature adverse ne compte pas.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Aunt May"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = settle(cast(t, "p2", "Bear Cub"));
    expect(t.players.p1?.life).toBe(20);
  });

  describe("Carnage, Crimson Chaos", () => {
    const setup = () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Carnage, Crimson Chaos"],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Carnage, Crimson Chaos"), (req) => {
        if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
        options = req.options.map(String);
        return [bear];
      });
      return { s, options, angel };
    };

    it("renvoie une carte de créature de VM 3 ou moins de votre cimetière (pas plus)", () => {
      const { s, options, angel } = setup();
      expect(options).not.toContain(angel);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Carnage, Crimson Chaos")).keywords).toContain("trample");
    });

    it("la créature renvoyée attaque à chaque combat et se sacrifie après avoir blessé un joueur", () => {
      let { s } = setup();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow();
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      s = settle(s);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  it("Spider Manifestation : {T} donne {R} ou {G} ; un sort de VM 4 ou plus la dégage, pas un sort moins cher", () => {
    let s = scenario({
      p1: { battlefield: ["Spider Manifestation", ...lands("Mountain", 6)], hand: ["Burst Lightning", "Shivan Dragon"] },
    });
    const spider = idOf(s, "p1", "battlefield", "Spider Manifestation");
    expect(chars(s, spider).keywords).toContain("reach");
    const tapSpider = (x: S) => {
      const a = legalActions(x, "p1").find((o) => o.type === "tapForMana" && o.source === spider);
      expect(a?.type === "tapForMana" ? [...a.colors].sort() : []).toEqual(["G", "R"]);
      return act(x, "p1", { type: "tapForMana", source: spider, ability: a?.type === "tapForMana" ? a.ability : -1, color: "R" });
    };
    s = tapSpider(s);
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
    expect(s.objects[spider]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    s = tapSpider(s);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(s.objects[spider]?.tapped).toBe(false);
  });

  it("Interdimensional Web Watch : les deux cartes du dessus exilées sont jouables ; son mana ne paie que des sorts depuis l'exil", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 4),
        hand: ["Interdimensional Web Watch", "Opt"],
        library: ["Bear Cub", "Forest", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "Interdimensional Web Watch"));
    const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(bear).toBeDefined();
    expect(forest).toBeDefined();
    // Opt ({U}) depuis la main : le mana de la Montre ne peut pas servir.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Opt"))).toBe(false);
    expect(castable(s, "p1", bear)).toBe(true);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: bear }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  describe("Spider-Sense", () => {
    const setup = (p1Battlefield: (string | { name: string; tapped: boolean })[], spell: string) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: p1Battlefield, hand: ["Spider-Sense"] },
        p2: { battlefield: lands("Mountain", 5), hand: [spell] },
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", spell),
        ...(spell === "Burst Lightning" ? { targets: { t: ["p1"] } } : {}),
      });
      return act(s, "p2", { type: "pass" });
    };

    it("contrecarre un éphémère ; un sort de créature n'est pas une cible légale", () => {
      let s = setup(lands("Island", 2), "Burst Lightning");
      s = settle(cast(s, "p1", "Spider-Sense", { targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
      const t = setup(lands("Island", 2), "Fire Elemental");
      expect(() => cast(t, "p1", "Spider-Sense", { targets: { t: [t.stack[0]?.id as string] } })).toThrow();
    });

    it("Web-slinging {U} : lancé pour {U} en renvoyant en main une créature engagée que vous contrôlez", () => {
      let s = setup(["Island", { name: "Bear Cub", tapped: true }], "Burst Lightning");
      s = settle(cast(s, "p1", "Spider-Sense", { alternative: true, targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      // Sans créature engagée, pas de web-slinging.
      const t = setup(["Island", "Bear Cub"], "Burst Lightning");
      expect(() => cast(t, "p1", "Spider-Sense", { alternative: true, targets: { t: [t.stack[0]?.id as string] } })).toThrow();
    });
  });

  it("Spider-Rex : portée, piétinement ; garde {2} contrecarre un sort adverse qui le cible sans payer", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Spider-Rex, Daring Dino"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    const rex = idOf(s, "p1", "battlefield", "Spider-Rex, Daring Dino");
    expect(chars(s, rex).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
    s = settle(cast(s, "p2", "Burst Lightning", { targets: { t: [rex] } }));
    expect(s.objects[rex]?.damage ?? 0).toBe(0);
    expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
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
  /** Réponse qui choisit les objets voulus quand ils font partie des options. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Choisit le mode d'une capacité déclenchée modale, puis les objets voulus. */
  const modeThen =
    (index: number, want: string[] = []): Answer =>
    (req, player, cur) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : picking(want)(req, player, cur);
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  /** Lightning Strike de p1 sur la cible. */
  const strike = (s: S, t: string) => settle(cast(s, "p1", "Lightning Strike", { targets: { t: [t] } }));

  describe("Marvel's Spider-Man, lot A — blanc", () => {
    describe("Anti-Venom, Horrifying Healer", () => {
      it("lancé, il renvoie une carte de créature de votre cimetière sur le champ de bataille", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 5), hand: ["Anti-Venom, Horrifying Healer"], graveyard: ["Serra Angel"] },
        });
        const angel = idOf(s, "p1", "graveyard", "Serra Angel");
        s = settle(cast(s, "p1", "Anti-Venom, Horrifying Healer"), picking([angel]));
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(0);
      });

      it("mis sur le champ de bataille sans être lancé, il ne renvoie rien", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Plains", 5),
            hand: ["Anti-Venom, Horrifying Healer"],
            graveyard: ["Anti-Venom, Horrifying Healer", "Bear Cub"],
          },
        });
        const other = idOf(s, "p1", "graveyard", "Anti-Venom, Horrifying Healer");
        // Le premier (lancé) renvoie le second ; le second (non lancé) ne renvoie pas Bear Cub.
        s = settle(cast(s, "p1", "Anti-Venom, Horrifying Healer"), picking([other]));
        // Le second Anti-Venom est bien revenu (la règle des légendes en remet un au cimetière, sous un autre identifiant).
        expect(s.players.p1?.graveyard).not.toContain(other);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      });

      it("les blessures qui lui seraient infligées sont prévenues, et il reçoit autant de marqueurs +1/+1", () => {
        let s = scenario({
          p1: { battlefield: ["Anti-Venom, Horrifying Healer", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        });
        const venom = idOf(s, "p1", "battlefield", "Anti-Venom, Horrifying Healer");
        s = strike(s, venom);
        expect(s.objects[venom]?.damage ?? 0).toBe(0);
        expect(counters(s, venom)).toBe(3);
        expect(pt(s, venom)).toEqual([8, 8]);
      });
    });

    it("City Pigeon : quand il quitte le champ de bataille, créez une Nourriture", () => {
      let s = scenario({ p1: { battlefield: ["City Pigeon", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      s = strike(s, idOf(s, "p1", "battlefield", "City Pigeon"));
      expect(idsOf(s, "p1", "graveyard", "City Pigeon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    describe("Costume Closet", () => {
      it("arrive avec deux marqueurs ; {T} déplace un marqueur sur une de vos créatures", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Costume Closet"] } });
        s = settle(cast(s, "p1", "Costume Closet"));
        const closet = idOf(s, "p1", "battlefield", "Costume Closet");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(counters(s, closet)).toBe(2);
        s = settle(activate(s, "p1", closet, { targets: { t: [bear] } }));
        expect(counters(s, closet)).toBe(1);
        expect(counters(s, bear)).toBe(1);
        expect(s.objects[closet]?.tapped).toBe(true);
      });

      it("une créature modifiée que vous contrôlez qui part lui donne un marqueur, pas une créature non modifiée", () => {
        let s = scenario({
          p1: {
            battlefield: [
              { name: "Costume Closet", counters: { "+1/+1": 2 } },
              { name: "Bear Cub", counters: { "+1/+1": 1 } },
              "Llanowar Elves",
              ...lands("Mountain", 4),
            ],
            hand: ["Lightning Strike", "Lightning Strike"],
          },
        });
        const closet = idOf(s, "p1", "battlefield", "Costume Closet");
        s = strike(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        expect(counters(s, closet)).toBe(2);
        s = strike(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(counters(s, closet)).toBe(3);
      });
    });

    describe("Daily Bugle Reporters", () => {
      it("Article flatteur : un marqueur +1/+1 sur chacune de deux créatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Daily Bugle Reporters"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        s = settle(cast(s, "p1", "Daily Bugle Reporters"), modeThen(0, [bear, elves]));
        expect(counters(s, bear)).toBe(1);
        expect(counters(s, elves)).toBe(1);
      });

      it("Journalisme d'investigation : une carte de créature de VM 2 ou moins de votre cimetière en main", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 4), hand: ["Daily Bugle Reporters"], graveyard: ["Serra Angel", "Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Daily Bugle Reporters"), (req, p, cur) => {
          if (req.type === "pick" && req.intent === "triggerMode") return ["1"];
          if (req.type === "pick") {
            // Seul Bear Cub (VM 2) est une cible légale, pas Serra Angel (VM 5).
            const names = req.options.map((o) => cur.defs[cur.objects[o]?.defId ?? ""]?.name);
            expect(names).not.toContain("Serra Angel");
          }
          return picking([idOf(cur, "p1", "graveyard", "Bear Cub")])(req, p, cur);
        });
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Flash Thompson : les deux modes engagent une créature et en dégagent une autre", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), { name: "Bear Cub", tapped: true }], hand: ["Flash Thompson, Spider-Fan"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Flash Thompson, Spider-Fan"), (req, p, cur) => {
        if (req.type === "pick" && req.intent === "triggerMode") return ["2"];
        if (req.type === "pick" && req.prompt?.includes("à engager")) return [angel];
        if (req.type === "pick" && req.prompt?.includes("à dégager")) return [bear];
        return picking([])(req, p, cur);
      });
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Friendly Neighborhood : trois Citoyens ; le terrain enchanté donne +1/+1 par créature que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Friendly Neighborhood"] } });
      const plains = idsOf(s, "p1", "battlefield", "Plains");
      const land = plains[5] as string;
      s = settle(cast(s, "p1", "Friendly Neighborhood", { targets: { enchant: [land] } }));
      const aura = idOf(s, "p1", "battlefield", "Friendly Neighborhood");
      expect(s.objects[aura]?.attachedTo).toBe(land);
      expect(idsOf(s, "p1", "battlefield", "Human Citizen")).toHaveLength(3);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Le terrain enchanté (resté dégagé) porte la capacité.
      expect(s.objects[land]?.tapped).toBe(false);
      s = settle(activate(s, "p1", land, { targets: { t: [bear] } }, /créature que vous contrôlez/));
      expect(s.objects[land]?.tapped).toBe(true);
      // Quatre créatures : Bear Cub et trois Citoyens.
      expect(pt(s, bear)).toEqual([6, 6]);
    });

    it("Origin of Spider-Man : I une Araignée 2/1 ; II marqueur et Araignée Héros légendaire ; III la double initiative", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Origin of Spider-Man"] } });
      s = settle(cast(s, "p1", "Origin of Spider-Man"));
      const spider = idOf(s, "p1", "battlefield", "Spider");
      expect(pt(s, spider)).toEqual([2, 1]);
      expect(chars(s, spider).keywords).toContain("reach");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3),
        picking([bear]),
      );
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).supertypes).toContain("Legendary");
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Spider", "Hero"]));
      s = settle(
        advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5),
        picking([bear]),
      );
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(idsOf(s, "p1", "graveyard", "Origin of Spider-Man")).toHaveLength(1);
      // Le type ajouté au chapitre II reste.
      expect(chars(s, bear).subtypes).toContain("Spider");
    });

    describe("Rent Is Due", () => {
      const endStep = (s: S, answer: Answer) =>
        settle(
          advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice"),
          answer,
        );

      it("en engageant deux créatures, vous piochez une carte et le gardez", () => {
        let s = scenario({
          p1: { battlefield: ["Rent Is Due", "Bear Cub", "Llanowar Elves"], library: ["Island", "Island"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = endStep(s, picking([bear, elves]));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.objects[bear]?.tapped).toBe(true);
        expect(s.objects[elves]?.tapped).toBe(true);
        expect(idsOf(s, "p1", "battlefield", "Rent Is Due")).toHaveLength(1);
      });

      it("sinon, il est sacrifié", () => {
        let s = scenario({
          p1: { battlefield: ["Rent Is Due", "Bear Cub", "Llanowar Elves"], library: ["Island", "Island"] },
        });
        s = endStep(s, (req) => (req.type === "pick" ? [] : undefined));
        expect(s.players.p1?.hand).toHaveLength(0);
        expect(idsOf(s, "p1", "graveyard", "Rent Is Due")).toHaveLength(1);
      });

      it("avec une seule créature dégagée, il est sacrifié", () => {
        let s = scenario({ p1: { battlefield: ["Rent Is Due", "Bear Cub"], library: ["Island"] } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(idsOf(s, "p1", "graveyard", "Rent Is Due")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
      });
    });

    describe("Selfless Police Captain", () => {
      it("arrive avec un marqueur +1/+1", () => {
        let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Selfless Police Captain"] } });
        s = settle(cast(s, "p1", "Selfless Police Captain"));
        expect(pt(s, idOf(s, "p1", "battlefield", "Selfless Police Captain"))).toEqual([2, 2]);
      });

      it("quand il part, ses marqueurs +1/+1 vont sur une créature que vous contrôlez", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Selfless Police Captain", counters: { "+1/+1": 2 } }, "Bear Cub", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
          },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = strike(s, idOf(s, "p1", "battlefield", "Selfless Police Captain"));
        expect(idsOf(s, "p1", "graveyard", "Selfless Police Captain")).toHaveLength(1);
        expect(counters(s, bear)).toBe(2);
      });
    });

    describe("Silver Sable, Mercenary Leader", () => {
      it("en arrivant, un marqueur +1/+1 sur une autre créature", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 3), hand: ["Silver Sable, Mercenary Leader"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Silver Sable, Mercenary Leader"), picking([bear]));
        expect(counters(s, bear)).toBe(1);
        expect(counters(s, idOf(s, "p1", "battlefield", "Silver Sable, Mercenary Leader"))).toBe(0);
      });

      it("quand elle attaque, une créature modifiée que vous contrôlez gagne le lien de vie", () => {
        let s = scenario({
          p1: {
            battlefield: ["Silver Sable, Mercenary Leader", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"],
          },
        });
        const sable = idOf(s, "p1", "battlefield", "Silver Sable, Mercenary Leader");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sable, defender: "p2" }] });
        let options: string[] = [];
        s = settle(s, (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options.map(String);
          return [bear];
        });
        // Les Elfes (non modifiés) ne sont pas une cible légale.
        expect(options).not.toContain(elves);
        expect(chars(s, bear).keywords).toContain("lifelink");
      });
    });

    describe("Spectacular Spider-Man", () => {
      it("{1} : il gagne le vol jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Spectacular Spider-Man", "Plains"] } });
        const spidey = idOf(s, "p1", "battlefield", "Spectacular Spider-Man");
        s = settle(activate(s, "p1", spidey, {}, /vol/));
        expect(chars(s, spidey).keywords).toContain("flying");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, spidey).keywords).not.toContain("flying");
      });

      it("{1}, sacrifiez-le : vos créatures gagnent la défense talismanique et l'indestructible", () => {
        let s = scenario({
          p1: { battlefield: ["Spectacular Spider-Man", "Plains", "Bear Cub"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const spidey = idOf(s, "p1", "battlefield", "Spectacular Spider-Man");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        s = settle(activate(s, "p1", spidey, {}, /défense talismanique/));
        expect(idsOf(s, "p1", "graveyard", "Spectacular Spider-Man")).toHaveLength(1);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
        expect(chars(s, elves).keywords).not.toContain("indestructible");
      });
    });

    describe("Spectacular Tactics", () => {
      it("un marqueur +1/+1 et la défense talismanique pour une de vos créatures", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Spectacular Tactics"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Spectacular Tactics", { mode: 0, targets: { t: [bear] } }));
        expect(counters(s, bear)).toBe(1);
        expect(chars(s, bear).keywords).toContain("hexproof");
      });

      it("détruit une créature de force 4 ou plus, pas une plus petite", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["Spectacular Tactics"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Spectacular Tactics", { mode: 1, targets: { d: [bear] } })).toThrow();
        s = settle(
          cast(s, "p1", "Spectacular Tactics", { mode: 1, targets: { d: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        );
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    describe("Spider-UK", () => {
      it("Web-slinging {2}{W} : lancé en renvoyant une créature engagée en main", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), { name: "Bear Cub", tapped: true }], hand: ["Spider-UK"] },
        });
        s = settle(cast(s, "p1", "Spider-UK", { alternative: true }));
        expect(idsOf(s, "p1", "battlefield", "Spider-UK")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      });

      it("à votre étape de fin, si deux créatures sont arrivées sous votre contrôle, piochez et gagnez 2 PV", () => {
        let s = scenario({
          p1: {
            battlefield: ["Spider-UK", ...lands("Forest", 2)],
            hand: ["Llanowar Elves", "Llanowar Elves"],
            library: ["Island"],
          },
        });
        s = settle(cast(s, "p1", "Llanowar Elves"));
        s = settle(cast(s, "p1", "Llanowar Elves"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.life).toBe(22);
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("une seule créature arrivée : rien", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-UK", "Forest"], hand: ["Llanowar Elves"], library: ["Island"] },
        });
        s = settle(cast(s, "p1", "Llanowar Elves"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.life).toBe(20);
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Starling : une autre créature que vous contrôlez gagne le vol jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Starling, Aerial Ally"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Starling, Aerial Ally"), picking([bear]));
      expect(chars(s, bear).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("flying");
    });

    it("Sudden Strike : détruit une créature attaquante ; une créature hors combat n'est pas une cible légale", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Sudden Strike"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
        active: "p2",
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(() => cast(s, "p1", "Sudden Strike", { targets: { t: [elves] } })).toThrow();
      s = settle(cast(s, "p1", "Sudden Strike", { targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Thwip!", () => {
      it("+2/+2 et le vol ; sur une Araignée, vous gagnez 2 PV", () => {
        let s = scenario({ p1: { battlefield: ["Plains", "Spider-Man, Web-Slinger"], hand: ["Thwip!"] } });
        const spidey = idOf(s, "p1", "battlefield", "Spider-Man, Web-Slinger");
        s = settle(cast(s, "p1", "Thwip!", { targets: { t: [spidey] } }));
        expect(pt(s, spidey)).toEqual([5, 5]);
        expect(chars(s, spidey).keywords).toContain("flying");
        expect(s.players.p1?.life).toBe(22);
      });

      it("sur une créature qui n'est pas une Araignée, pas de PV", () => {
        let s = scenario({ p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Thwip!"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Thwip!", { targets: { t: [bear] } }));
        expect(pt(s, bear)).toEqual([4, 4]);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Web Up : exile un permanent non-terrain adverse jusqu'à ce qu'il quitte le champ de bataille", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Web Up"] },
        p2: { battlefield: ["Serra Angel", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Web Up"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Serra Angel");
      destroy(s, idOf(s, "p1", "battlefield", "Web Up"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Web-Shooters : +1/+1 et la portée ; quand la créature équipée attaque, engagez une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Web-Shooters", "Bear Cub", ...lands("Plains", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const shooters = idOf(s, "p1", "battlefield", "Web-Shooters");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", shooters, { targets: { t: [bear] } }, /Équiper/));
      expect(s.objects[shooters]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("reach");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = settle(s, picking([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Wild Pack Squad : au début de votre combat, une créature gagne l'initiative et la vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Wild Pack Squad", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
      s = settle(s, picking([bear]));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["firstStrike", "vigilance"]));
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
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
  const castable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
  const ability = (s: S, player: string, source: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
    );
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Déclare les attaquants (vers p2), puis avance jusqu'à la seconde phase principale (aucun blocage). */
  const attackAndFinish = (s: S, attackers: string[], answer: Answer = () => undefined): S => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** L'adversaire (actif) lance Burst Lightning sur p1 et passe : p1 peut répondre. */
  const opponentBolt = (p1: { battlefield: string[]; hand: string[] }, p2Battlefield: string[] = []) => {
    let s = scenario({
      active: "p2",
      p1,
      p2: { battlefield: ["Mountain", ...p2Battlefield], hand: ["Burst Lightning"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
    return act(s, "p2", { type: "pass" });
  };

  describe("Marvel's Spider-Man, lot A — bleu", () => {
    describe("Amazing Acrobatics", () => {
      it("les deux modes : contrecarre le sort et engage deux créatures", () => {
        let s = opponentBolt({ battlefield: lands("Island", 3), hand: ["Amazing Acrobatics"] }, ["Bear Cub", "Serra Angel"]);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(
          cast(s, "p1", "Amazing Acrobatics", { mode: 2, targets: { s: [s.stack[0]?.id as string], c: [bear, angel] } }),
        );
        expect(s.players.p1?.life).toBe(20);
        expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
        expect(s.objects[bear]?.tapped).toBe(true);
        expect(s.objects[angel]?.tapped).toBe(true);
      });

      it("un seul mode : engage une créature, le sort se résout", () => {
        let s = opponentBolt({ battlefield: lands("Island", 3), hand: ["Amazing Acrobatics"] }, ["Bear Cub"]);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Amazing Acrobatics", { mode: 1, targets: { c: [bear] } }));
        expect(s.objects[bear]?.tapped).toBe(true);
        expect(s.players.p1?.life).toBe(18);
      });
    });

    it("Beetle, Legacy Criminal : exilé du cimetière, marqueur +1/+1 et vol jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], graveyard: ["Beetle, Legacy Criminal"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const beetle = idOf(s, "p1", "graveyard", "Beetle, Legacy Criminal");
      s = settle(activate(s, "p1", beetle, { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(idsOf(s, "p1", "graveyard", "Beetle, Legacy Criminal")).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Beetle, Legacy Criminal");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("flying");
    });

    describe("Doc Ock, Sinister Scientist", () => {
      it("F/E de base 8/8 avec huit cartes ou plus dans votre cimetière (les marqueurs s'y ajoutent)", () => {
        const s7 = scenario({ p1: { battlefield: ["Doc Ock, Sinister Scientist"], graveyard: lands("Island", 7) } });
        expect(pt(s7, idOf(s7, "p1", "battlefield", "Doc Ock, Sinister Scientist"))).toEqual([4, 5]);
        const s8 = scenario({
          p1: {
            battlefield: [{ name: "Doc Ock, Sinister Scientist", counters: { "+1/+1": 1 } }],
            graveyard: lands("Island", 8),
          },
        });
        expect(pt(s8, idOf(s8, "p1", "battlefield", "Doc Ock, Sinister Scientist"))).toEqual([9, 9]);
      });

      it("défense talismanique tant que vous contrôlez un autre Méchant", () => {
        const alone = scenario({ p1: { battlefield: ["Doc Ock, Sinister Scientist", "Bear Cub"] } });
        expect(chars(alone, idOf(alone, "p1", "battlefield", "Doc Ock, Sinister Scientist")).keywords).not.toContain("hexproof");
        const s = scenario({
          p1: { battlefield: ["Doc Ock, Sinister Scientist", "Mysterio's Phantasm"] },
          p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
          active: "p2",
        });
        const ock = idOf(s, "p1", "battlefield", "Doc Ock, Sinister Scientist");
        expect(chars(s, ock).keywords).toContain("hexproof");
        expect(() => cast(s, "p2", "Burst Lightning", { targets: { t: [ock] } })).toThrow();
      });
    });

    it("Doc Ock's Henchmen : complote en attaquant (carte non-terrain défaussée : marqueur +1/+1)", () => {
      let s = scenario({ p1: { battlefield: ["Doc Ock's Henchmen"], hand: ["Opt"] } });
      const henchmen = idOf(s, "p1", "battlefield", "Doc Ock's Henchmen");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = attackAndFinish(s, [henchmen], picking([opt]));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
      expect(s.objects[henchmen]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Flying Octobot : un marqueur +1/+1 quand un autre Méchant arrive, une seule fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Flying Octobot", ...lands("Island", 4), ...lands("Forest", 2)],
          hand: ["Mysterio's Phantasm", "Mysterio's Phantasm", "Bear Cub"],
        },
      });
      const octobot = idOf(s, "p1", "battlefield", "Flying Octobot");
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[octobot]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Mysterio's Phantasm"));
      expect(s.objects[octobot]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Mysterio's Phantasm"));
      expect(s.objects[octobot]?.counters["+1/+1"]).toBe(1);
    });

    describe("Hide on the Ceiling", () => {
      it("exile X artefacts ou créatures, qui reviennent sous le contrôle de leur propriétaire à la prochaine étape de fin", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Hide on the Ceiling"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Hide on the Ceiling", { x: 2, targets: { t: [bear, angel] } }));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("exactement X cibles", () => {
        const s = scenario({
          p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Hide on the Ceiling"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "Hide on the Ceiling", { x: 1, targets: { t: [bear, angel] } })).toThrow();
      });
    });

    it("Impostor Syndrome : une créature non-jeton qui blesse un joueur crée un jeton copie non légendaire", () => {
      let s = scenario({ p1: { battlefield: ["Impostor Syndrome", "Beetle, Legacy Criminal"] } });
      const beetle = idOf(s, "p1", "battlefield", "Beetle, Legacy Criminal");
      s = attackAndFinish(s, [beetle]);
      const beetles = idsOf(s, "p1", "battlefield", "Beetle, Legacy Criminal");
      expect(beetles).toHaveLength(2);
      const token = beetles.find((id) => s.objects[id]?.isToken) as string;
      expect(token).toBeDefined();
      expect(chars(s, token).supertypes).not.toContain("Legendary");
      expect(chars(s, beetle).supertypes).toContain("Legendary");
      // Le jeton qui blesse un joueur ne se copie pas.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
      s = attackAndFinish(s, [token]);
      expect(idsOf(s, "p1", "battlefield", "Beetle, Legacy Criminal")).toHaveLength(2);
    });

    describe("Lady Octopus, Inspired Inventor", () => {
      it("un marqueur d'ingéniosité pour la première et la deuxième carte piochées du tour, pas la troisième", () => {
        let s = scenario({
          p1: { battlefield: ["Lady Octopus, Inspired Inventor", ...lands("Island", 3)], hand: ["Opt", "Opt", "Opt"] },
        });
        const lady = idOf(s, "p1", "battlefield", "Lady Octopus, Inspired Inventor");
        for (let i = 0; i < 3; i++) s = settle(cast(s, "p1", "Opt"));
        expect(s.objects[lady]?.counters.ingenuity).toBe(2);
      });

      it("{T} : lancez sans payer un sort d'artefact de VM au plus égale au nombre de marqueurs", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Lady Octopus, Inspired Inventor", counters: { ingenuity: 1 } }],
            hand: ["Expedition Map", "Swiftfoot Boots"],
          },
        });
        const lady = idOf(s, "p1", "battlefield", "Lady Octopus, Inspired Inventor");
        s = untilCastNow(activate(s, "p1", lady));
        const offered = castNowOf(s)?.cards ?? [];
        expect(offered.map((id) => nameOf(s, id))).toEqual(["Expedition Map"]);
        s = settle(act(s, "p1", { type: "cast", card: offered[0] as string, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Expedition Map")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Swiftfoot Boots")).toHaveLength(1);
      });
    });

    describe("Madame Web, Clairvoyant", () => {
      it("lance les sorts non-créature et d'Araignée depuis le dessus de la bibliothèque, pas les autres créatures", () => {
        const top = (card: string) =>
          scenario({ p1: { battlefield: ["Madame Web, Clairvoyant", ...lands("Island", 4)], library: [card, "Island"] } });
        const opt = top("Opt");
        expect(castable(opt, "p1", opt.players.p1?.library[0] as string)).toBe(true);
        const spider = top("Spider-Byte, Web Warden");
        expect(castable(spider, "p1", spider.players.p1?.library[0] as string)).toBe(true);
        const bear = top("Bear Cub");
        expect(castable(bear, "p1", bear.players.p1?.library[0] as string)).toBe(false);
      });

      it("vous attaquez : vous pouvez meuler une carte", () => {
        let s = scenario({ p1: { battlefield: ["Madame Web, Clairvoyant"], library: ["Opt", "Island"] } });
        s = attackAndFinish(s, [idOf(s, "p1", "battlefield", "Madame Web, Clairvoyant")], (req) =>
          req.type === "yesNo" ? [1] : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });
    });

    it("Mysterio, Master of Illusion : une Illusion 3/3 par Méchant non-jeton, exilées quand il part", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 4), ...lands("Mountain", 2), "Doc Ock's Henchmen", "Bear Cub"],
          hand: ["Mysterio, Master of Illusion", "Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Mysterio, Master of Illusion"));
      const illusions = idsOf(s, "p1", "battlefield", "Illusion Villain");
      expect(illusions).toHaveLength(2);
      expect(pt(s, illusions[0] as string)).toEqual([3, 3]);
      const mysterio = idOf(s, "p1", "battlefield", "Mysterio, Master of Illusion");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [mysterio] } }));
      expect(idsOf(s, "p1", "graveyard", "Mysterio, Master of Illusion")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Illusion Villain")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Doc Ock's Henchmen")).toHaveLength(1);
    });

    it("Mysterio's Phantasm : meule une carte en attaquant", () => {
      let s = scenario({ p1: { battlefield: ["Mysterio's Phantasm"], library: ["Opt", "Island"] } });
      s = attackAndFinish(s, [idOf(s, "p1", "battlefield", "Mysterio's Phantasm")]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(19);
    });

    it("Robotics Mastery : deux Robots 1/1 volants en arrivant, la créature enchantée a +2/+2", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Robotics Mastery"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Robotics Mastery", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      const robots = idsOf(s, "p1", "battlefield", "Robot");
      expect(robots).toHaveLength(2);
      expect(chars(s, robots[0] as string).keywords).toContain("flying");
      expect(chars(s, robots[0] as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    });

    describe("School Daze", () => {
      it("Devoirs : piochez trois cartes", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["School Daze"] } });
        s = settle(cast(s, "p1", "School Daze", { mode: 0 }));
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("Combattre le crime : contrecarrez un sort, piochez une carte", () => {
        let s = opponentBolt({ battlefield: lands("Island", 5), hand: ["School Daze"] });
        s = settle(cast(s, "p1", "School Daze", { mode: 1, targets: { t: [s.stack[0]?.id as string] } }));
        expect(s.players.p1?.life).toBe(20);
        expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Secret Identity", () => {
      it("Dissimuler : Citoyen 1/1 de base avec la défense talismanique jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Island", "Serra Angel"], hand: ["Secret Identity"] } });
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Secret Identity", { mode: 0, targets: { t: [angel] } }));
        expect(pt(s, angel)).toEqual([1, 1]);
        expect(chars(s, angel).subtypes).toEqual(["Citizen"]);
        expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["hexproof", "flying", "vigilance"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, angel)).toEqual([4, 4]);
        expect(chars(s, angel).subtypes).toEqual(["Angel"]);
      });

      it("Révéler : Héros 3/4 de base avec le vol et la vigilance", () => {
        let s = scenario({ p1: { battlefield: ["Island", "Bear Cub"], hand: ["Secret Identity"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Secret Identity", { mode: 1, targets: { t: [bear] } }));
        expect(pt(s, bear)).toEqual([3, 4]);
        expect(chars(s, bear).subtypes).toEqual(["Hero"]);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      });

      it("ne cible qu'une créature que vous contrôlez", () => {
        const s = scenario({ p1: { battlefield: ["Island"], hand: ["Secret Identity"] }, p2: { battlefield: ["Bear Cub"] } });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Secret Identity", { mode: 1, targets: { t: [bear] } })).toThrow();
      });
    });

    it("Spider-Byte, Web Warden : en arrivant, renvoie jusqu'à un permanent non-terrain en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Spider-Byte, Web Warden"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spider-Byte, Web Warden"), picking([angel]));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    });

    it("Spider-Man No More : Citoyen 1/1 de base avec le défenseur, sans ses autres capacités", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Spider-Man No More"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spider-Man No More", { targets: { enchant: [angel] } }));
      expect(pt(s, angel)).toEqual([1, 1]);
      expect(chars(s, angel).subtypes).toEqual(["Citizen"]);
      expect(chars(s, angel).keywords).toEqual(["defender"]);
    });

    it("Unstable Experiment : le joueur ciblé pioche, puis votre créature complote", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Unstable Experiment", "Opt"] },
        p2: { library: ["Island", "Island"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Unstable Experiment", { targets: { p: ["p2"], c: [bear] } }), picking([opt]));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    describe("Whoosh!", () => {
      it("renvoie un permanent non-terrain en main ; kické, piochez aussi une carte", () => {
        const setup = () =>
          scenario({ p1: { battlefield: lands("Island", 4), hand: ["Whoosh!"] }, p2: { battlefield: ["Serra Angel"] } });
        let s = setup();
        s = settle(cast(s, "p1", "Whoosh!", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(0);
        let k = setup();
        k = settle(cast(k, "p1", "Whoosh!", { kicked: true, targets: { t: [idOf(k, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(k, "p2", "hand", "Serra Angel")).toHaveLength(1);
        expect(k.players.p1?.hand).toHaveLength(1);
      });
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
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
  /** Avance (sans attaquer) jusqu'à la condition, en répondant aux choix. */
  const advanceAnswering = (s: S, until: (x: S) => boolean, answer: Answer): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else cur = advanceUntil(cur, (x) => until(x) || x.pending?.kind === "choice", 1);
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
  /** Surveillance : toutes les cartes regardées vont au cimetière. */
  const surveilAll: Answer = (req) => (req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined);
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const castable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);
  const ability = (s: S, player: string, source: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
    );
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attackWith = (s: S, ids: string[]) => {
    const at = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(at, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const graveyardIds = (s: S, player: string) => s.players[player]?.graveyard ?? [];

  const EDDIE = "Eddie Brock // Venom, Lethal Protector";
  const SAGA = "The Death of Gwen Stacy";

  describe("Marvel's Spider-Man, lot A — noir", () => {
    it("Agent Venom : une autre de vos créatures non-jetons meurt, piochez et perdez 1 PV ; pas pour une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Agent Venom", "Bear Cub", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(19);
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [elves] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Agent Venom : ni un jeton, ni Agent Venom lui-même", () => {
      let s = scenario({
        p1: { battlefield: ["Agent Venom", "Bear Cub", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { isToken: boolean }).isToken = true;
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      expect(s.objects[bear]).toBeUndefined();
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Agent Venom")] } }));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
    });

    it("Common Crook : quand il meurt, créez un Trésor", () => {
      let s = scenario({ p1: { battlefield: ["Common Crook", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      const crook = idOf(s, "p1", "battlefield", "Common Crook");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [crook] } }));
      expect(idsOf(s, "p1", "graveyard", "Common Crook")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    describe("The Death of Gwen Stacy", () => {
      it("chapitre I : détruit la créature ciblée", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [SAGA] }, p2: { battlefield: ["Serra Angel"] } });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", SAGA), picking([angel]));
        expect(s.objects[idOf(s, "p1", "battlefield", SAGA)]?.counters.lore).toBe(1);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("chapitre II : chaque joueur peut défausser une carte ; celui qui ne le fait pas perd 3 PV", () => {
        let s = scenario({
          p1: { battlefield: [{ name: SAGA, counters: { lore: 1 } }], hand: ["Opt"] },
          p2: { hand: ["Opt"] },
        });
        const saga = idOf(s, "p1", "battlefield", SAGA);
        s = advanceAnswering(
          s,
          (x) => x.objects[saga]?.counters.lore === 2 && x.stack.length === 0 && x.pending?.kind === "priority",
          (req, player) =>
            req.type === "pick" && req.intent === "punisher" ? [player === "p1" ? "discard" : "life"] : undefined,
        );
        expect(s.players.p1?.life).toBe(20);
        expect(graveyardIds(s, "p1")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(17);
        expect(graveyardIds(s, "p2")).toHaveLength(0);
      });

      it("chapitre III : exile les cimetières des joueurs ciblés seulement", () => {
        let s = scenario({
          p1: { battlefield: [{ name: SAGA, counters: { lore: 2 } }], graveyard: ["Opt", "Bear Cub"] },
          p2: { graveyard: ["Serra Angel", "Opt"] },
        });
        s = advanceAnswering(
          s,
          (x) => (x.players.p2?.graveyard.length ?? 0) === 0 && x.pending?.kind === "priority",
          picking(["p2"]),
        );
        expect(graveyardIds(s, "p2")).toHaveLength(0);
        // La Saga est sacrifiée après son dernier chapitre ; le cimetière de p1 n'a pas été exilé.
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      });
    });

    describe("Eddie Brock // Venom, Lethal Protector", () => {
      it("en arrivant, renvoie une carte de créature de VM 1 ou moins de votre cimetière", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [EDDIE], graveyard: ["Llanowar Elves", "Bear Cub"] } });
        s = settle(cast(s, "p1", EDDIE));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      });

      it("une carte de VM 2 ne peut pas être renvoyée", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [EDDIE], graveyard: ["Bear Cub"] } });
        s = settle(cast(s, "p1", EDDIE));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      });

      it("{3}{B}{R}{G} : se transforme en Venom 5/5 ; en attaquant, sacrifie une créature de VM X, pioche X et pose un permanent de VM X ou moins", () => {
        let s = scenario({
          p1: {
            battlefield: [EDDIE, "Bear Cub", ...lands("Swamp", 4), "Mountain", "Forest"],
            hand: ["Serra Angel", "Llanowar Elves"],
            library: lands("Forest", 5),
          },
        });
        const venom = idOf(s, "p1", "battlefield", EDDIE);
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", venom));
        expect(chars(s, venom).name).toBe("Venom, Lethal Protector");
        expect(pt(s, venom)).toEqual([5, 5]);
        expect(chars(s, venom).keywords).toEqual(expect.arrayContaining(["menace", "trample", "haste"]));
        s = attackWith(s, [venom]);
        let offered: string[] = [];
        s = settle(s, (req, _p, cur) => {
          if (req.type !== "pick") return undefined;
          if (req.options.includes(bear)) return [bear];
          offered = req.options.map((o) => nameOf(cur, String(o)) ?? "");
          const elves = req.options.find((o) => nameOf(cur, String(o)) === "Llanowar Elves");
          return elves ? [elves] : undefined;
        });
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        // X = 2 : deux cartes piochées ; Serra Angel (VM 5) n'est pas proposée.
        expect(offered).not.toContain("Serra Angel");
        expect(offered).toContain("Llanowar Elves");
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("Venom : sans sacrifice, rien ne se passe", () => {
        let s = scenario({
          p1: { battlefield: [EDDIE, "Bear Cub", ...lands("Swamp", 4), "Mountain", "Forest"], hand: ["Llanowar Elves"] },
        });
        const venom = idOf(s, "p1", "battlefield", EDDIE);
        s = settle(activate(s, "p1", venom));
        s = settle(attackWith(s, [venom]), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Inner Demons Gangsters et le chaos", () => {
      it("défaussez une carte : +1/+0 et la menace jusqu'à la fin du tour, en rituel seulement", () => {
        let s = scenario({ p1: { battlefield: ["Inner Demons Gangsters"], hand: ["Opt"] } });
        const gang = idOf(s, "p1", "battlefield", "Inner Demons Gangsters");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(activate(s, "p1", gang, { discard: [opt] }));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(pt(s, gang)).toEqual([4, 4]);
        expect(chars(s, gang).keywords).toContain("menace");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, gang)).toEqual([3, 4]);
      });

      it("Swarm, Being of Bees : défaussée ce tour-ci, elle se lance du cimetière pour {B} ; pas sinon", () => {
        let s = scenario({
          p1: { battlefield: ["Inner Demons Gangsters", "Swamp"], hand: ["Swarm, Being of Bees"], graveyard: ["Prison Break"] },
        });
        expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Prison Break"))).toBe(false);
        const gang = idOf(s, "p1", "battlefield", "Inner Demons Gangsters");
        s = settle(activate(s, "p1", gang, { discard: [idOf(s, "p1", "hand", "Swarm, Being of Bees")] }));
        const swarm = idOf(s, "p1", "graveyard", "Swarm, Being of Bees");
        expect(castable(s, "p1", swarm)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: swarm }));
        expect(idsOf(s, "p1", "battlefield", "Swarm, Being of Bees")).toHaveLength(1);
      });

      it("Prison Break : renvoie une créature avec un marqueur +1/+1 en plus ; chaos {3}{B} après une défausse", () => {
        let s = scenario({
          p1: {
            battlefield: ["Inner Demons Gangsters", ...lands("Swamp", 4)],
            hand: ["Prison Break"],
            graveyard: ["Serra Angel"],
          },
        });
        const gang = idOf(s, "p1", "battlefield", "Inner Demons Gangsters");
        s = settle(activate(s, "p1", gang, { discard: [idOf(s, "p1", "hand", "Prison Break")] }));
        const pb = idOf(s, "p1", "graveyard", "Prison Break");
        expect(castable(s, "p1", pb)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: pb, targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
        expect(pt(s, angel)).toEqual([5, 5]);
      });
    });

    it("Merciless Enforcers : {3}{B}, 1 blessure à chaque adversaire", () => {
      let s = scenario({ p1: { battlefield: ["Merciless Enforcers", ...lands("Swamp", 4)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Merciless Enforcers")));
      expect(s.players.p2?.life).toBe(19);
      // Lien de vie : les blessures de sa capacité vous font aussi gagner des PV.
      expect(s.players.p1?.life).toBe(21);
    });

    it("Morlun, Devourer of Spiders : arrive avec X marqueurs +1/+1 et inflige X blessures à un adversaire", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Morlun, Devourer of Spiders"] } });
      s = settle(cast(s, "p1", "Morlun, Devourer of Spiders", { x: 3 }));
      const morlun = idOf(s, "p1", "battlefield", "Morlun, Devourer of Spiders");
      expect(s.objects[morlun]?.counters["+1/+1"]).toBe(3);
      expect(pt(s, morlun)).toEqual([5, 4]);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Parker Luck : deux joueurs révèlent leur carte du dessus, perdent la VM de celle de l'autre, puis la prennent en main", () => {
      let s = scenario({
        p1: { battlefield: ["Parker Luck"], library: ["Shivan Dragon", ...lands("Forest", 5)] },
        p2: { library: ["Bear Cub", ...lands("Forest", 5)] },
      });
      s = advanceUntil(s, (x) => idsOf(x, "p1", "hand", "Shivan Dragon").length > 0 && x.stack.length === 0);
      expect(s.players.p1?.life).toBe(18);
      expect(s.players.p2?.life).toBe(14);
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Risky Research : surveillance 2, puis piochez deux cartes ; perdez 2 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Risky Research"], library: lands("Forest", 6) } });
      s = settle(cast(s, "p1", "Risky Research"), surveilAll);
      expect(graveyardIds(s, "p1")).toHaveLength(3);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.players.p1?.life).toBe(18);
    });

    describe("Scorpion, Seething Striker", () => {
      it("à votre étape de fin, si une créature est morte ce tour-ci, une de vos créatures a la connivence", () => {
        let s = scenario({
          p1: {
            battlefield: ["Scorpion, Seething Striker", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
            library: ["Serra Angel"],
          },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const scorpion = idOf(s, "p1", "battlefield", "Scorpion, Seething Striker");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
        s = advanceUntil(s, (x) => idsOf(x, "p1", "graveyard", "Serra Angel").length > 0);
        // Pioche Serra Angel, la défausse (non-terrain) : un marqueur +1/+1.
        s = settle(s);
        expect(s.objects[scorpion]?.counters["+1/+1"]).toBe(1);
        expect(pt(s, scorpion)).toEqual([4, 4]);
      });

      it("sans créature morte ce tour-ci, rien", () => {
        let s = scenario({ p1: { battlefield: ["Scorpion, Seething Striker"], library: lands("Forest", 3) } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(0);
        expect(s.players.p1?.library).toHaveLength(3);
      });
    });

    it("Scorpion's Sting : -3/-3 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Scorpion's Sting"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Scorpion's Sting", { targets: { t: [angel] } }));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    describe("Spider-Man Noir", () => {
      it("une créature qui attaque seule reçoit un marqueur +1/+1, puis surveillance X (ses marqueurs)", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-Man Noir", { name: "Bear Cub", counters: { "+1/+1": 1 } }], library: lands("Forest", 6) },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(attackWith(s, [bear]), surveilAll);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
        expect(graveyardIds(s, "p1")).toHaveLength(2);
      });

      it("pas de déclenchement si deux créatures attaquent", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Man Noir", "Bear Cub"], library: lands("Forest", 6) } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const noir = idOf(s, "p1", "battlefield", "Spider-Man Noir");
        s = settle(attackWith(s, [bear, noir]), surveilAll);
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
        expect(graveyardIds(s, "p1")).toHaveLength(0);
      });
    });

    describe("The Spot's Portal", () => {
      it("met la créature au-dessous de la bibliothèque de son propriétaire ; vous perdez 2 PV sans Méchant", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["The Spot's Portal"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Spot's Portal", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        const lib = s.players.p2?.library ?? [];
        expect(nameOf(s, lib[lib.length - 1] ?? "")).toBe("Serra Angel");
        expect(s.players.p1?.life).toBe(18);
      });

      it("avec un Méchant, pas de perte de PV", () => {
        let s = scenario({
          p1: { battlefield: ["Common Crook", ...lands("Swamp", 3)], hand: ["The Spot's Portal"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Spot's Portal", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Tombstone, Career Criminal : renvoie un Méchant du cimetière en main ; vos sorts de Méchant coûtent {1} de moins", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Tombstone, Career Criminal"], graveyard: ["Common Crook", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Tombstone, Career Criminal"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const inHand = idOf(s, "p1", "hand", "Common Crook");
      // Un seul Marais dégagé : Common Crook ({1}{B}) coûte {B}.
      expect(castable(s, "p1", inHand)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: inHand }));
      expect(idsOf(s, "p1", "battlefield", "Common Crook")).toHaveLength(1);
    });

    it("Venom, Evil Unleashed : {2}{B}, exilez-la du cimetière : deux marqueurs +1/+1 et le contact mortel", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], graveyard: ["Venom, Evil Unleashed"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const venom = idOf(s, "p1", "graveyard", "Venom, Evil Unleashed");
      s = settle(activate(s, "p1", venom, { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, bear).keywords).toContain("deathtouch");
      expect(s.exile.some((id) => nameOf(s, id) === "Venom, Evil Unleashed")).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("deathtouch");
    });

    it("Venomized Cat : en arrivant, meulez deux cartes", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Venomized Cat"], library: lands("Forest", 5) } });
      s = settle(cast(s, "p1", "Venomized Cat"));
      expect(graveyardIds(s, "p1")).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(3);
    });

    describe("Venom's Hunger", () => {
      it("coûte {2} de moins avec un Méchant ; détruit la créature, vous gagnez 2 PV", () => {
        let s = scenario({
          p1: { battlefield: ["Common Crook", ...lands("Swamp", 3)], hand: ["Venom's Hunger"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Venom's Hunger", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(22);
      });

      it("sans Méchant, trois Marais ne suffisent pas", () => {
        const s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Venom's Hunger"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Venom's Hunger"))).toBe(false);
      });
    });

    it("Villainous Wrath : l'adversaire perd autant de PV que ses créatures, puis toutes les créatures sont détruites", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Villainous Wrath"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Villainous Wrath", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(20);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    });
  });
});
