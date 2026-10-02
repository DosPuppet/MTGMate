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
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

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
