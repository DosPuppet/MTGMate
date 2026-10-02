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
import {
  type Answer,
  act,
  advanceUntil,
  cast,
  castable,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  passAccepting,
  picking,
  scenario,
  settle,
  untilCastNow,
} from "./helpers";

type S = GameState;
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
  /** Choisit le mode d'une capacité déclenchée modale, puis les objets voulus. */
  const modeThen =
    (index: number, want: string[] = []): Answer =>
    (req, player, cur) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : picking(want)(req, player, cur);
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
  /** Surveillance : toutes les cartes regardées vont au cimetière. */
  const surveilAll: Answer = (req) => (req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined);
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

describe("lot A, rouge", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  const exiled = (s: S, name: string) => s.exile.find((id) => nameOf(s, id) === name) as string;

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
  const playable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "playLand" && a.card === card);
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
  /** Déclare les attaquants contre p2, puis avance jusqu'à la seconde phase principale. */
  const attack = (s: S, ids: string[], answer?: Answer): S => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    cur = settle(cur, answer);
    return advanceUntil(cur, (x) => x.turn.step === "main2");
  };

  describe("Marvel's Spider-Man, lot A — rouge", () => {
    describe("Angry Rabble", () => {
      it("un sort de valeur de mana 4 ou plus : 1 blessure à chaque adversaire ; pas un sort moins cher", () => {
        let s = scenario({
          p1: { battlefield: ["Angry Rabble", ...lands("Plains", 5), "Mountain"], hand: ["Serra Angel", "Shock"] },
        });
        s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(18);
        s = settle(cast(s, "p1", "Serra Angel"));
        expect(s.players.p2?.life).toBe(17);
      });

      it("{5}{R}, en rituel : deux marqueurs +1/+1", () => {
        let s = scenario({ p1: { battlefield: ["Angry Rabble", ...lands("Mountain", 6)] } });
        const rabble = idOf(s, "p1", "battlefield", "Angry Rabble");
        s = settle(activate(s, "p1", rabble));
        expect(pt(s, rabble)).toEqual([4, 4]);
      });
    });

    describe("Electro, Assaulting Battery", () => {
      it("un éphémère ajoute {R}, et le mana rouge non dépensé ne se vide pas entre les étapes", () => {
        let s = scenario({ p1: { battlefield: ["Electro, Assaulting Battery", "Mountain"], hand: ["Shock"] } });
        s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
        expect(s.players.p1?.manaPool.R).toBe(1);
        s = advanceUntil(s, (x) => x.turn.step === "main2");
        expect(s.players.p1?.manaPool.R).toBe(1);
      });

      it("quand il quitte le champ de bataille, vous pouvez payer {X} : X blessures à un joueur ciblé", () => {
        let s = scenario({
          p1: { battlefield: ["Electro, Assaulting Battery", ...lands("Mountain", 6)], hand: ["Electro's Bolt"] },
        });
        const electro = idOf(s, "p1", "battlefield", "Electro, Assaulting Battery");
        s = settle(cast(s, "p1", "Electro's Bolt", { targets: { t: [electro] } }), (req) =>
          req.type === "number" ? [2] : req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Electro, Assaulting Battery")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
      });
    });

    describe("Electro's Bolt et Romantic Rendezvous", () => {
      it("défaussez une carte puis piochez deux cartes ; le Bolt défaussé se lance depuis le cimetière pour {1}{R} (chaos)", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Romantic Rendezvous", "Electro's Bolt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bolt = idOf(s, "p1", "hand", "Electro's Bolt");
        s = settle(cast(s, "p1", "Romantic Rendezvous"), picking([bolt]));
        expect(s.players.p1?.hand).toHaveLength(2);
        const inGy = idOf(s, "p1", "graveyard", "Electro's Bolt");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(act(s, "p1", { type: "cast", card: inGy, targets: { t: [angel] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        // Deux terrains engagés pour le sort à {1}{R}, deux pour le chaos.
        expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
      });
    });

    describe("Gwen Stacy // Ghost-Spider", () => {
      it("Gwen Stacy : la carte exilée en arrivant est jouable tant que vous la contrôlez", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Gwen Stacy // Ghost-Spider", "Shock"], library: lands("Island", 5) },
        });
        s = settle(cast(s, "p1", "Gwen Stacy // Ghost-Spider"));
        const island = exiled(s, "Island");
        expect(island).toBeDefined();
        expect(playable(s, "p1", island)).toBe(true);
        const gwen = idOf(s, "p1", "battlefield", "Gwen Stacy // Ghost-Spider");
        s = settle(cast(s, "p1", "Shock", { targets: { t: [gwen] } }));
        expect(idsOf(s, "p1", "graveyard", "Gwen Stacy // Ghost-Spider")).toHaveLength(1);
        expect(playable(s, "p1", island)).toBe(false);
      });

      it("se transforme en Ghost-Spider ; un sort lancé ou un terrain joué depuis l'exil lui donne un marqueur +1/+1", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Mountain", 6), "Island", "Plains"],
            hand: ["Gwen Stacy // Ghost-Spider"],
            library: ["Shock", ...lands("Island", 5)],
          },
        });
        s = settle(cast(s, "p1", "Gwen Stacy // Ghost-Spider"));
        const gwen = idOf(s, "p1", "battlefield", "Gwen Stacy // Ghost-Spider");
        s = settle(activate(s, "p1", gwen, {}, /Transformez/));
        expect(chars(s, gwen).name).toBe("Ghost-Spider");
        expect(pt(s, gwen)).toEqual([4, 4]);
        expect(chars(s, gwen).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "haste"]));
        // La permission de Gwen Stacy dure : vous contrôlez toujours cette créature.
        const shock = exiled(s, "Shock");
        expect(castable(s, "p1", shock)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
        expect(s.objects[gwen]?.counters["+1/+1"]).toBe(1);
        // Retirez deux marqueurs : exile la carte du dessus, jouable ce tour-ci (un terrain : un marqueur de plus).
        setCounters(s, gwen, "+1/+1", 2);
        s = settle(activate(s, "p1", gwen, {}, /carte du dessus/));
        expect(s.objects[gwen]?.counters["+1/+1"] ?? 0).toBe(0);
        const island = exiled(s, "Island");
        expect(playable(s, "p1", island)).toBe(true);
        s = settle(act(s, "p1", { type: "playLand", card: island }));
        expect(s.objects[gwen]?.counters["+1/+1"]).toBe(1);
      });

      it("Ghost-Spider : la carte exilée par sa capacité n'est plus jouable au tour suivant", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Mountain", 4), "Island", "Plains", "Gwen Stacy // Ghost-Spider"],
            library: lands("Island", 8),
          },
        });
        const gwen = idOf(s, "p1", "battlefield", "Gwen Stacy // Ghost-Spider");
        s = settle(activate(s, "p1", gwen, {}, /Transformez/));
        setCounters(s, gwen, "+1/+1", 2);
        s = settle(activate(s, "p1", gwen, {}, /carte du dessus/));
        const island = exiled(s, "Island");
        expect(playable(s, "p1", island)).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        expect(s.exile).toContain(island);
        expect(playable(s, "p1", island)).toBe(false);
      });
    });

    describe("Heroes' Hangout", () => {
      it("Rendez-vous : exile deux cartes, une seule jouable, jusqu'à la fin de votre prochain tour", () => {
        let s = scenario({
          p1: { battlefield: ["Mountain"], hand: ["Heroes' Hangout"], library: ["Shock", "Opt", ...lands("Forest", 6)] },
        });
        let shock = "";
        s = settle(cast(s, "p1", "Heroes' Hangout", { mode: 0 }), (req, _p, cur) => {
          shock = exiled(cur, "Shock") ?? "";
          return req.type === "pick" && req.options.includes(shock) ? [shock] : undefined;
        });
        const opt = exiled(s, "Opt");
        expect(castable(s, "p1", opt)).toBe(false);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(castable(s, "p1", shock)).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(castable(s, "p1", shock)).toBe(false);
      });

      it("Patrouille : une ou deux créatures gagnent +1/+0 et l'initiative jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: ["Mountain", "Bear Cub", "Llanowar Elves"], hand: ["Heroes' Hangout"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = settle(cast(s, "p1", "Heroes' Hangout", { mode: 1, targets: { t: [bear, elves] } }));
        expect(pt(s, bear)).toEqual([3, 2]);
        expect(pt(s, elves)).toEqual([2, 1]);
        expect(chars(s, bear).keywords).toContain("firstStrike");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, bear)).toEqual([2, 2]);
      });
    });

    describe("Hobgoblin, Mantled Marauder", () => {
      it("chaque carte défaussée lui donne +2/+0 jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["Hobgoblin, Mantled Marauder", ...lands("Mountain", 2)], hand: ["Romantic Rendezvous", "Opt"] },
        });
        const hob = idOf(s, "p1", "battlefield", "Hobgoblin, Mantled Marauder");
        s = settle(cast(s, "p1", "Romantic Rendezvous"));
        expect(pt(s, hob)).toEqual([3, 2]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, hob)).toEqual([1, 2]);
      });
    });

    describe("J. Jonah Jameson", () => {
      it("suspecte jusqu'à une créature ; une de vos créatures avec la menace qui attaque crée un Trésor", () => {
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["J. Jonah Jameson"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "J. Jonah Jameson"), picking([bear]));
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
        s = attack(s, [bear]);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      });

      it("une créature sans la menace qui attaque ne crée rien", () => {
        let s = scenario({ p1: { battlefield: ["J. Jonah Jameson", "Bear Cub"] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
      });
    });

    describe("Masked Meower", () => {
      it("défaussez une carte, sacrifiez-le : piochez une carte", () => {
        let s = scenario({ p1: { battlefield: ["Masked Meower"], hand: ["Opt"] } });
        const meower = idOf(s, "p1", "battlefield", "Masked Meower");
        s = settle(activate(s, "p1", meower, { discard: [idOf(s, "p1", "hand", "Opt")] }));
        expect(idsOf(s, "p1", "graveyard", "Masked Meower")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Maximum Carnage", () => {
      it("I : jusqu'à votre prochain tour, chaque créature attaque si possible", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Maximum Carnage"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Maximum Carnage"));
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(chars(s, bear).keywords).toContain("mustAttack");
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
        expect(() => act(s, "p2", { type: "declareAttackers", attackers: [] })).toThrow();
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(chars(s, bear).keywords).not.toContain("mustAttack");
      });

      it("II : ajoutez {R}{R}{R} ; III : 5 blessures à chaque adversaire, puis elle est sacrifiée", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Maximum Carnage", counters: { lore: 1 } }] },
          active: "p2",
          step: "end",
        });
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
        expect(s.players.p1?.manaPool.R).toBe(3);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
        s = settle(s);
        expect(s.players.p2?.life).toBe(15);
        expect(idsOf(s, "p1", "graveyard", "Maximum Carnage")).toHaveLength(1);
      });
    });

    describe("Molten Man, Inferno Incarnate", () => {
      it("cherche une Montagne de base (engagée), gagne +1/+1 par Montagne ; en partant, sacrifiez un terrain", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 3),
            hand: ["Molten Man, Inferno Incarnate"],
            library: ["Forest", "Mountain", "Forest"],
          },
          p2: { battlefield: [] },
        });
        s = settle(cast(s, "p1", "Molten Man, Inferno Incarnate"));
        const molten = idOf(s, "p1", "battlefield", "Molten Man, Inferno Incarnate");
        const mountains = idsOf(s, "p1", "battlefield", "Mountain");
        expect(mountains).toHaveLength(4);
        expect(mountains.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
        expect(pt(s, molten)).toEqual([4, 4]);
        expect(s.players.p1?.library.map((id) => nameOf(s, id))).not.toContain("Mountain");
      });

      it("quand il quitte le champ de bataille, vous sacrifiez un terrain", () => {
        // Deux Montagnes : 2/2 ; un troisième terrain pour lancer le Bolt.
        let s = scenario({
          p1: { battlefield: ["Molten Man, Inferno Incarnate", ...lands("Mountain", 2), "Plains"], hand: ["Electro's Bolt"] },
        });
        const molten = idOf(s, "p1", "battlefield", "Molten Man, Inferno Incarnate");
        expect(pt(s, molten)).toEqual([2, 2]);
        s = settle(cast(s, "p1", "Electro's Bolt", { targets: { t: [molten] } }));
        expect(idsOf(s, "p1", "graveyard", "Molten Man, Inferno Incarnate")).toHaveLength(1);
        expect(s.battlefield.filter((id) => chars(s, id).types.includes("Land"))).toHaveLength(2);
      });
    });

    describe("Shadow of the Goblin", () => {
      it("au début de votre première phase principale : défaussez une carte, puis piochez une carte", () => {
        let s = scenario({
          p1: { battlefield: ["Shadow of the Goblin"], hand: ["Opt"] },
          active: "p2",
          step: "end",
        });
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        // L'Opt défaussée remplacée : la pioche du tour et celle de la capacité.
        expect(s.players.p1?.hand).toHaveLength(2);
      });

      it("sans carte en main, rien n'est pioché", () => {
        let s = scenario({ p1: { battlefield: ["Shadow of the Goblin"] }, active: "p2", step: "end" });
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw"));
        // La pioche du tour, défaussée par la capacité : pas de carte en plus.
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("un sort lancé ailleurs que depuis la main : 1 blessure à chaque adversaire ; pas depuis la main", () => {
        let s = scenario({
          p1: { battlefield: ["Shadow of the Goblin", ...lands("Mountain", 6)], hand: ["Romantic Rendezvous", "Electro's Bolt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bolt = idOf(s, "p1", "hand", "Electro's Bolt");
        s = settle(cast(s, "p1", "Romantic Rendezvous"), picking([bolt]));
        expect(s.players.p2?.life).toBe(20);
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Electro's Bolt"), targets: { t: [angel] } }));
        expect(s.players.p2?.life).toBe(19);
      });
    });

    describe("Shocker, Unshakable", () => {
      it("en arrivant, 2 blessures à une créature et 2 à son contrôleur ; l'initiative pendant votre tour seulement", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 6), hand: ["Shocker, Unshakable"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Shocker, Unshakable"), picking([bear]));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
        const shocker = idOf(s, "p1", "battlefield", "Shocker, Unshakable");
        expect(chars(s, shocker).keywords).toContain("firstStrike");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, shocker).keywords).not.toContain("firstStrike");
      });
    });

    describe("Shock", () => {
      it("2 blessures à n'importe quelle cible", () => {
        let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Shock"] }, p2: { battlefield: ["Bear Cub"] } });
        s = settle(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      });
    });

    describe("Spider-Gwen, Free Spirit", () => {
      it("quand elle devient engagée, vous pouvez défausser une carte pour en piocher une", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Gwen, Free Spirit"], hand: ["Opt"] } });
        const gwen = idOf(s, "p1", "battlefield", "Spider-Gwen, Free Spirit");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = attack(s, [gwen], picking([opt]));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(nameOf(s, s.players.p1?.hand[0] ?? "")).toBe("Forest");
      });

      it("sans défausse, pas de pioche", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Gwen, Free Spirit"], hand: ["Opt"] } });
        const gwen = idOf(s, "p1", "battlefield", "Spider-Gwen, Free Spirit");
        s = attack(s, [gwen], (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Spinneret and Spiderling", () => {
      it("attaquer avec deux Araignées : un marqueur +1/+1 ; 4 blessures ou plus : la carte du dessus est jouable", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Spinneret and Spiderling", counters: { "+1/+1": 2 } }, "Spider-Gwen, Free Spirit"],
            library: ["Shock", ...lands("Forest", 5)],
          },
        });
        const spin = idOf(s, "p1", "battlefield", "Spinneret and Spiderling");
        const gwen = idOf(s, "p1", "battlefield", "Spider-Gwen, Free Spirit");
        s = attack(s, [spin, gwen], (req) => (req.type === "pick" ? [] : undefined));
        // 1/2 avec trois marqueurs : 4 blessures.
        expect(s.objects[spin]?.counters["+1/+1"]).toBe(3);
        expect(s.players.p2?.life).toBe(20 - 4 - 2);
        const shock = exiled(s, "Shock");
        expect(s.exile).toContain(shock);
        // Jouable jusqu'à la fin de votre prochain tour (sans mana ici : la permission seule est vérifiée).
        expect(s.playPermissions?.some((p) => p.card === shock && p.player === "p1" && p.until > s.turn.number)).toBe(true);
      });

      it("moins de 4 blessures : rien n'est exilé ; une seule Araignée qui attaque : pas de marqueur", () => {
        let s = scenario({ p1: { battlefield: ["Spinneret and Spiderling"], library: lands("Forest", 5) } });
        const spin = idOf(s, "p1", "battlefield", "Spinneret and Spiderling");
        s = attack(s, [spin]);
        expect(s.objects[spin]?.counters["+1/+1"] ?? 0).toBe(0);
        expect(s.exile).toHaveLength(0);
      });
    });

    describe("Stegron the Dinosaur Man", () => {
      it("{1}{R}, défaussez-le : une de vos créatures gagne +3/+1 et devient un Dinosaure jusqu'à la fin du tour", () => {
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Stegron the Dinosaur Man"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const stegron = idOf(s, "p1", "hand", "Stegron the Dinosaur Man");
        s = settle(activate(s, "p1", stegron, { targets: { t: [bear] } }));
        expect(idsOf(s, "p1", "graveyard", "Stegron the Dinosaur Man")).toHaveLength(1);
        expect(pt(s, bear)).toEqual([5, 3]);
        expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Dinosaur"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, bear)).toEqual([2, 2]);
        expect(chars(s, bear).subtypes).not.toContain("Dinosaur");
      });
    });

    describe("Taxi Driver", () => {
      it("{1}, {T} : une créature gagne la célérité", () => {
        let s = scenario({
          p1: { battlefield: ["Taxi Driver", "Mountain", { name: "Bear Cub", sick: true }] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Taxi Driver"), { targets: { t: [bear] } }));
        expect(chars(s, bear).keywords).toContain("haste");
        s = attack(s, [bear]);
        expect(s.players.p2?.life).toBe(18);
      });
    });

    describe("Wisecrack", () => {
      it("la créature s'inflige des blessures égales à sa force ; non attaquante, son contrôleur ne subit rien", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Wisecrack"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Wisecrack", { targets: { t: [bear] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(20);
      });

      it("sur une créature attaquante, elle meurt et son contrôleur subit 2 blessures", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Wisecrack"] },
          p2: { battlefield: ["Bear Cub"] },
          active: "p2",
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        s = settle(cast(s, "p1", "Wisecrack", { targets: { t: [bear] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
      });
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Joue (passes et réponses aux choix, suggérées par défaut) jusqu'à la condition. */
  const runUntil = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Passe et répond aux choix jusqu'à une pile vide, sans déclenchement en attente. */
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
  /** Réponse qui choisit les cartes de ces noms quand elles font partie des options. */
  const pickingNames =
    (names: string[]): Answer =>
    (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => names.includes(nameOf(cur, String(o)) ?? ""));
      return picked.length > 0 ? picked.slice(0, req.max ?? picked.length) : undefined;
    };
  const triggerMode =
    (index: number): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : undefined;
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  describe("Marvel's Spider-Man, lot A — vert", () => {
    describe("Damage Control Crew", () => {
      it("Réparation : une carte de VM 4 ou plus de votre cimetière revient en main (pas une de VM 2)", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 4), hand: ["Damage Control Crew"], graveyard: ["Shivan Dragon", "Bear Cub"] },
        });
        const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
        const bear = idOf(s, "p1", "graveyard", "Bear Cub");
        let offered: ChoiceValue[] = [];
        s = settle(cast(s, "p1", "Damage Control Crew"), (req, p, cur) => {
          if (req.type === "pick" && req.intent !== "triggerMode") offered = req.options;
          return triggerMode(0)(req, p, cur) ?? picking([dragon])(req, p, cur);
        });
        expect(offered).not.toContain(bear);
        expect(handNames(s)).toEqual(["Shivan Dragon"]);
      });

      it("Fourrière : exile un artefact ou un enchantement", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 4), hand: ["Damage Control Crew"] },
          p2: { battlefield: ["Gleaming Barrier"] },
        });
        s = settle(cast(s, "p1", "Damage Control Crew"), triggerMode(1));
        expect(idsOf(s, "p2", "battlefield", "Gleaming Barrier")).toHaveLength(0);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Gleaming Barrier");
        // Exilée, elle ne meurt pas : pas de Trésor.
        expect(idsOf(s, "p2", "battlefield", "Treasure")).toHaveLength(0);
      });
    });

    it("Ezekiel Sims : au début du combat de votre tour, une Araignée que vous contrôlez gagne +2/+2", () => {
      let s = scenario({ p1: { battlefield: ["Ezekiel Sims, Spider-Totem", "Radioactive Spider", "Bear Cub"] } });
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let offered: ChoiceValue[] = [];
      s = runUntil(
        s,
        (x) => x.pending?.kind === "declareAttackers",
        (req, p, cur) => {
          if (req.type === "pick") offered = req.options;
          return picking([spider])(req, p, cur);
        },
      );
      expect(offered).not.toContain(bear);
      expect(pt(s, spider)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, spider)).toEqual([1, 1]);
    });

    it("Grow Extra Arms : +4/+4 ; coûte {1} de moins s'il cible une Araignée", () => {
      const s = scenario({ p1: { battlefield: ["Forest", "Radioactive Spider", "Bear Cub"], hand: ["Grow Extra Arms"] } });
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Grow Extra Arms", { targets: { t: [bear] } })).toThrow();
      const t = settle(cast(s, "p1", "Grow Extra Arms", { targets: { t: [spider] } }));
      expect(pt(t, spider)).toEqual([5, 5]);
    });

    it("Guy in the Chair : Soutien en ligne met un marqueur +1/+1 sur une Araignée seulement, en rituel", () => {
      let s = scenario({ p1: { battlefield: ["Guy in the Chair", "Radioactive Spider", "Bear Cub", ...lands("Forest", 3)] } });
      const guy = idOf(s, "p1", "battlefield", "Guy in the Chair");
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const web = ability(s, "p1", guy, /Soutien/);
      // Bear Cub n'est pas une Araignée.
      expect(web?.targets[0]?.legal).toEqual([spider]);
      s = settle(activate(s, "p1", guy, { targets: { t: [spider] } }, /Soutien/));
      expect(plusOnes(s, spider)).toBe(1);
      expect(s.objects[guy]?.tapped).toBe(true);
    });

    it("Kapow! : un marqueur +1/+1 sur votre créature, puis elle se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Kapow!"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const other = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Kapow!", { targets: { a: [bear], b: [other] } }));
      // Le marqueur est posé avant le combat : 3/3 contre 2/2, seule la créature adverse meurt.
      expect(plusOnes(s, bear)).toBe(1);
      expect(s.objects[bear]?.damage).toBe(2);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Kraven's Cats : {2}{G} : +2/+2, une seule fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["Kraven's Cats", ...lands("Forest", 6)] } });
      const cats = idOf(s, "p1", "battlefield", "Kraven's Cats");
      s = settle(activate(s, "p1", cats));
      expect(pt(s, cats)).toEqual([4, 4]);
      expect(ability(s, "p1", cats)).toBeUndefined();
    });

    it("Lizard, Connors's Curse : une autre créature perd ses capacités et devient un Lézard vert 4/4 de base", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Lizard, Connors's Curse"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Lizard, Connors's Curse"), picking([angel]));
      const c = chars(s, angel);
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(c.colors).toEqual(["G"]);
      expect(c.subtypes).toEqual(["Lizard"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.keywords).not.toContain("vigilance");
      // L'effet n'a pas de fin.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, angel).subtypes).toEqual(["Lizard"]);
    });

    it("Lurking Lizards : un marqueur +1/+1 pour chaque sort de VM 4 ou plus que vous lancez", () => {
      let s = scenario({
        p1: { battlefield: ["Lurking Lizards", ...lands("Mountain", 6), "Forest"], hand: ["Shivan Dragon", "Llanowar Elves"] },
      });
      const lizards = idOf(s, "p1", "battlefield", "Lurking Lizards");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(plusOnes(s, lizards)).toBe(0);
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(plusOnes(s, lizards)).toBe(1);
    });

    describe("Miles Morales // Ultimate Spider-Man", () => {
      it("en arrivant, un marqueur +1/+1 sur chacune de jusqu'à deux créatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Miles Morales // Ultimate Spider-Man"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Miles Morales // Ultimate Spider-Man"), picking([bear, angel]));
        expect(plusOnes(s, bear)).toBe(1);
        expect(plusOnes(s, angel)).toBe(1);
      });

      it("se transforme en rituel ; en attaquant, double les marqueurs des Araignées et créatures légendaires", () => {
        let s = scenario({
          p1: {
            battlefield: [
              { name: "Miles Morales // Ultimate Spider-Man", counters: { "+1/+1": 1 } },
              { name: "Radioactive Spider", counters: { "+1/+1": 2 } },
              { name: "Bear Cub", counters: { "+1/+1": 1 } },
              "Mountain",
              "Plains",
              ...lands("Forest", 4),
            ],
          },
        });
        const miles = s.battlefield.find((id) => nameOf(s, id) === "Miles Morales // Ultimate Spider-Man") as string;
        const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", miles, {}, /Transform/));
        expect(chars(s, miles).name).toBe("Ultimate Spider-Man");
        expect(chars(s, miles).keywords).toEqual(expect.arrayContaining(["firstStrike", "haste"]));
        expect(pt(s, miles)).toEqual([5, 4]);
        s = runUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
        s = settle(s);
        expect(plusOnes(s, miles)).toBe(2);
        expect(plusOnes(s, spider)).toBe(4);
        expect(plusOnes(s, bear)).toBe(1);
      });

      it("Camouflage : un marqueur +1/+1, défense talismanique et incolore jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["Miles Morales // Ultimate Spider-Man", ...lands("Forest", 6), "Mountain", "Plains"] },
        });
        const miles = s.battlefield.find((id) => nameOf(s, id) === "Miles Morales // Ultimate Spider-Man") as string;
        s = settle(activate(s, "p1", miles, {}, /Transform/));
        s = settle(activate(s, "p1", miles, {}, /Camouflage/));
        expect(plusOnes(s, miles)).toBe(1);
        expect(chars(s, miles).keywords).toContain("hexproof");
        expect(chars(s, miles).colors).toEqual([]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, miles).keywords).not.toContain("hexproof");
        expect([...chars(s, miles).colors].sort()).toEqual(["G", "R", "W"]);
      });
    });

    it("Pictures of Spider-Man : jusqu'à deux cartes de créature parmi les cinq du dessus ; {1}, {T}, sacrifice : un Trésor", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Pictures of Spider-Man"],
          library: ["Bear Cub", "Opt", "Serra Angel", "Llanowar Elves", "Forest", "Shivan Dragon"],
        },
      });
      s = settle(cast(s, "p1", "Pictures of Spider-Man"), pickingNames(["Bear Cub", "Serra Angel"]));
      expect(handNames(s).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      // Le reste va au-dessous : Shivan Dragon (sixième carte) est maintenant sur le dessus.
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Shivan Dragon");
      const pictures = idOf(s, "p1", "battlefield", "Pictures of Spider-Man");
      s = settle(activate(s, "p1", pictures));
      expect(idsOf(s, "p1", "graveyard", "Pictures of Spider-Man")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Professional Wrestler : un Trésor en arrivant ; ne peut pas être bloqué par plus d'une créature", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Professional Wrestler" }] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const wrestler = idOf(s, "p1", "battlefield", "Professional Wrestler");
      s = runUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wrestler, defender: "p2" }] });
      s = runUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: bear, attacker: wrestler },
            { blocker: elves, attacker: wrestler },
          ],
        }),
      ).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: wrestler }] })).not.toThrow();

      let t = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Professional Wrestler"] } });
      t = settle(cast(t, "p1", "Professional Wrestler"));
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Radioactive Spider : {2}, sacrifice, en rituel : cherche une carte d'Araignée Héros (pas une simple Araignée)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Radioactive Spider", ...lands("Forest", 2)],
          library: ["Spider Manifestation", "Bear Cub", "Spider-Man, Brooklyn Visionary", "Forest"],
        },
      });
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      let offered: string[] = [];
      s = settle(activate(s, "p1", spider), (req, _p, cur) => {
        if (req.type === "pick") offered = req.options.map((o) => nameOf(cur, String(o)) ?? "");
        return undefined;
      });
      expect(offered).toEqual(["Spider-Man, Brooklyn Visionary"]);
      expect(handNames(s)).toEqual(["Spider-Man, Brooklyn Visionary"]);
      expect(idsOf(s, "p1", "graveyard", "Radioactive Spider")).toHaveLength(1);
    });

    describe("Scout the City", () => {
      it("Coup d'œil : meulez trois cartes, une carte de permanent parmi elles en main, et 3 PV", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Scout the City"], library: ["Opt", "Bear Cub", "Forest", "Island"] },
        });
        let offered: string[] = [];
        s = settle(cast(s, "p1", "Scout the City", { mode: 0 }), (req, _p, cur) => {
          if (req.type === "pick") offered = req.options.map((o) => nameOf(cur, String(o)) ?? "");
          return pickingNames(["Bear Cub"])(req, _p, cur);
        });
        expect(offered.sort()).toEqual(["Bear Cub", "Forest"]);
        expect(handNames(s)).toEqual(["Bear Cub"]);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(23);
      });

      it("Abattre : détruit une créature avec le vol, pas une autre", () => {
        const s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Scout the City"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Scout the City", { mode: 1, targets: { t: [bear] } })).toThrow();
        const t = settle(cast(s, "p1", "Scout the City", { mode: 1, targets: { t: [angel] } }));
        expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Spider-Ham : une Nourriture en arrivant ; vos autres Araignées, Ours… gagnent +1/+1, pas les Elfes", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), "Bear Cub", "Radioactive Spider", "Llanowar Elves"],
          hand: ["Spider-Ham, Peter Porker"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Spider-Ham, Peter Porker"));
      const ham = idOf(s, "p1", "battlefield", "Spider-Ham, Peter Porker");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      expect(pt(s, ham)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Radioactive Spider"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Spider-Man, Brooklyn Visionary : lancé par web-slinging, il cherche un terrain de base qui arrive engagé", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), { name: "Bear Cub", tapped: true }],
          hand: ["Spider-Man, Brooklyn Visionary"],
          library: ["Opt", "Island", "Serra Angel"],
        },
      });
      s = settle(cast(s, "p1", "Spider-Man, Brooklyn Visionary", { alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Spider-Man, Brooklyn Visionary")).toHaveLength(1);
      expect(handNames(s)).toEqual(["Bear Cub"]);
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
    });

    it("Strength of Will : indestructible, et autant de marqueurs +1/+1 que de blessures subies, jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Mountain", 2), "Bear Cub"],
          hand: ["Strength of Will", "Lightning Strike"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Strength of Will", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(plusOnes(s, bear)).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      expect(plusOnes(s, bear)).toBe(3);
    });

    it("Supportive Parents : engagez deux créatures dégagées que vous contrôlez : un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: ["Supportive Parents", "Bear Cub", "Llanowar Elves"] } });
      const parents = idOf(s, "p1", "battlefield", "Supportive Parents");
      s = activate(s, "p1", parents);
      s = runUntil(s, (x) => x.pending?.kind === "priority");
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
      const pool: number[] = Object.values(s.players.p1?.manaPool ?? {});
      expect(pool.reduce((a, b) => a + b, 0)).toBe(1);
    });

    describe("Terrific Team-Up", () => {
      it("coûte {2} de moins avec un permanent de VM 4 ou plus ; chaque créature gagne +1/+0 et blesse la cible", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 2), "Bear Cub", "Shivan Dragon"], hand: ["Terrific Team-Up"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Terrific Team-Up", { targets: { a: [bear], b: [angel] } }));
        expect(pt(s, bear)).toEqual([3, 2]);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.objects[angel]?.damage).toBe(3);
      });

      it("deux créatures : chacune inflige des blessures égales à sa force ; sans VM 4, pas de réduction", () => {
        const base = { battlefield: [...lands("Forest", 2), "Bear Cub", "Llanowar Elves"], hand: ["Terrific Team-Up"] };
        const s = scenario({ p1: base, p2: { battlefield: ["Serra Angel"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "Terrific Team-Up", { targets: { a: [bear, elves], b: [angel] } })).toThrow();
        let t = scenario({
          p1: { ...base, battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
        const elves2 = idOf(t, "p1", "battlefield", "Llanowar Elves");
        t = settle(
          cast(t, "p1", "Terrific Team-Up", {
            targets: { a: [bear2, elves2], b: [idOf(t, "p2", "battlefield", "Serra Angel")] },
          }),
        );
        // 3 + 2 blessures : Serra Angel (4/4) meurt.
        expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Wall Crawl : une Araignée 2/1, 1 PV par Araignée ; vos Araignées +1/+1 et imblocables par les défenseurs", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Radioactive Spider", "Bear Cub"], hand: ["Wall Crawl"] },
        p2: { battlefield: ["Gleaming Barrier"] },
      });
      s = settle(cast(s, "p1", "Wall Crawl"));
      const token = idOf(s, "p1", "battlefield", "Spider");
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.players.p1?.life).toBe(22);
      expect(pt(s, token)).toEqual([3, 2]);
      expect(pt(s, spider)).toEqual([2, 2]);
      expect(pt(s, bear)).toEqual([2, 2]);
      s = runUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: spider, defender: "p2" },
          { id: bear, defender: "p2" },
        ],
      });
      s = runUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const wall = idOf(s, "p2", "battlefield", "Gleaming Barrier");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: wall, attacker: spider }] })).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: wall, attacker: bear }] })).not.toThrow();
    });

    it("Web of Life and Destiny : au début du combat, une carte de créature parmi les cinq du dessus sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          // Une créature : la déclaration des attaquants a lieu ce tour-ci.
          battlefield: ["Web of Life and Destiny", "Llanowar Elves"],
          library: ["Forest", "Opt", "Serra Angel", "Island", "Forest", "Bear Cub"],
        },
      });
      s = runUntil(s, (x) => x.pending?.kind === "declareAttackers", pickingNames(["Serra Angel"]));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      // Le reste va au-dessous : Bear Cub (sixième carte) est maintenant sur le dessus.
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Bear Cub");
    });

    it("Web of Life and Destiny : la convocation permet de le lancer en engageant des créatures", () => {
      const s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves", "Bear Cub", "Kraven's Cats"],
          hand: ["Web of Life and Destiny"],
        },
      });
      const t = settle(cast(s, "p1", "Web of Life and Destiny"));
      expect(idsOf(t, "p1", "battlefield", "Web of Life and Destiny")).toHaveLength(1);
    });
  });
});

describe("lot A, multicolores", () => {
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
  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x): x is Extract<ActionOption, { type: "activate" }> => x.type === "activate" && x.source === source,
    );
    return act(s, player, { type: "activate", source, ability: a?.ability ?? -1, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plus1 = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const hand = (s: S, p = "p1") => s.players[p]?.hand ?? [];
  /** Déclare les attaquants de p1 (contre p2), puis résout les déclenchements d'attaque. */
  const attack = (s: S, ids: string[], answer?: Answer): S => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };
  const toMain2 = (s: S) => advanceUntil(s, (x) => x.turn.step === "main2");

  const VILLAIN_11 = customCard({
    name: "Test Henchman",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
    subtypes: ["Human", "Villain"],
    power: 1,
    toughness: 1,
  });
  const TRINKET = customCard({
    name: "Test Trinket",
    typeLine: "Artifact",
    types: ["Artifact"],
    manaCost: { generic: 2, colored: {}, x: 0 },
    manaCostText: "{2}",
  });

  describe("Marvel's Spider-Man, lot A — multicolores", () => {
    it("Araña : un marqueur sur une créature attaquante ; une créature modifiée qui blesse un joueur exile le dessus, jouable ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Araña, Heart of the Spider", "Bear Cub"] } });
      const arana = idOf(s, "p1", "battlefield", "Araña, Heart of the Spider");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [arana, cub], picking([cub]));
      expect(plus1(s, cub)).toBe(1);
      expect(plus1(s, arana)).toBe(0);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(20 - 3 - 3);
      // Seul l'ourson (modifié) déclenche : une seule carte exilée, jouable ce tour-ci.
      expect(s.exile).toHaveLength(1);
      const exiled = s.exile[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === exiled)).toBe(true);
    });

    it("Biorganic Carapace : s'attache en arrivant (+2/+2) ; la créature équipée pioche une carte par créature modifiée", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Plains", 2),
            ...lands("Island", 2),
            "Bear Cub",
            { name: "Llanowar Elves", counters: { "+1/+1": 1 } },
            "Gnarlid Colony",
          ],
          hand: ["Biorganic Carapace"],
        },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Biorganic Carapace"), picking([cub]));
      const carapace = idOf(s, "p1", "battlefield", "Biorganic Carapace");
      expect(s.objects[carapace]?.attachedTo).toBe(cub);
      expect(pt(s, cub)).toEqual([4, 4]);
      s = attack(s, [cub]);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(16);
      // L'ourson équipé et les elfes avec un marqueur sont modifiés ; Gnarlid Colony ne l'est pas.
      expect(hand(s)).toHaveLength(2);
    });

    it("Cosmic Spider-Man : au début du combat, vos autres Araignées gagnent ses cinq capacités, pas les autres créatures", () => {
      let s = scenario({ p1: { battlefield: ["Cosmic Spider-Man", "Web-Warriors", "Bear Cub"] } });
      const web = idOf(s, "p1", "battlefield", "Web-Warriors");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      expect(chars(s, web).keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "trample", "lifelink", "haste"]));
      expect(chars(s, cub).keywords).not.toContain("flying");
    });

    it("Doctor Octopus : vos autres Méchants gagnent +2/+2 ; à votre étape de fin, vous piochez jusqu'à huit cartes", () => {
      let s = scenario({
        p1: { battlefield: ["Doctor Octopus, Master Planner", "Prowler, Clawed Thief"], hand: ["Opt", "Opt", "Opt"] },
        p2: { battlefield: ["Mob Lookout"] },
      });
      const ock = idOf(s, "p1", "battlefield", "Doctor Octopus, Master Planner");
      expect(pt(s, ock)).toEqual([4, 8]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Prowler, Clawed Thief"))).toEqual([4, 5]);
      // Les Méchants adverses ne sont pas concernés.
      expect(pt(s, idOf(s, "p2", "battlefield", "Mob Lookout"))).toEqual([0, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(hand(s)).toHaveLength(8);
    });

    it("Gallant Citizen : en arrivant, piochez une carte", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Gallant Citizen"] } });
      s = settle(cast(s, "p1", "Gallant Citizen"));
      expect(hand(s)).toHaveLength(1);
    });

    it("Green Goblin, Revenant : en attaquant, défaussez une carte puis piochez une carte par carte défaussée ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Green Goblin, Revenant", "Swamp"], hand: ["Pumpkin Bombardment", "Opt", "Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // Pumpkin Bombardment : défausse en coût additionnel (une première carte défaussée ce tour-ci).
      s = settle(cast(s, "p1", "Pumpkin Bombardment", { targets: { t: [bear] }, discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(hand(s)).toHaveLength(1);
      const goblin = idOf(s, "p1", "battlefield", "Green Goblin, Revenant");
      s = attack(s, [goblin]);
      // La dernière carte est défaussée, puis deux cartes piochées (deux défaussées ce tour-ci).
      expect(hand(s)).toHaveLength(2);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(
        expect.arrayContaining(["Opt", "Lightning Strike", "Pumpkin Bombardment"]),
      );
    });

    it("Pumpkin Bombardment : sans carte à défausser, on paie {2} de plus ; 3 blessures à la créature ciblée", () => {
      const short = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Pumpkin Bombardment"] } });
      expect(castable(short, "p1", idOf(short, "p1", "hand", "Pumpkin Bombardment"))).toBe(false);
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Pumpkin Bombardment"] },
        p2: { battlefield: ["Gnarlid Colony"] },
      });
      const colony = idOf(s, "p2", "battlefield", "Gnarlid Colony");
      s = settle(cast(s, "p1", "Pumpkin Bombardment", { targets: { t: [colony] }, discard: [] }));
      expect(idsOf(s, "p2", "battlefield", "Gnarlid Colony")).toHaveLength(0);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    });

    it("Kraven, Proud Predator : sa force est la plus grande valeur de mana parmi vos permanents", () => {
      let s = scenario({
        p1: { battlefield: ["Kraven, Proud Predator", ...lands("Plains", 5)], hand: ["Serra Angel"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const kraven = idOf(s, "p1", "battlefield", "Kraven, Proud Predator");
      expect(pt(s, kraven)).toEqual([3, 4]);
      s = settle(cast(s, "p1", "Serra Angel"));
      expect(pt(s, kraven)).toEqual([5, 4]);
    });

    it("Mary Jane Watson : une Araignée qui arrive fait piocher, une seule fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Mary Jane Watson", ...lands("Plains", 4)], hand: ["Skyward Spider", "Skyward Spider"] },
      });
      s = settle(cast(s, "p1", "Skyward Spider"));
      expect(hand(s)).toHaveLength(2);
      s = settle(cast(s, "p1", "Skyward Spider"));
      expect(hand(s)).toHaveLength(1);
    });

    it("Mob Lookout : en arrivant, une créature que vous contrôlez a la connivence", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island", "Swamp"], hand: ["Mob Lookout", "Opt"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Mob Lookout"), picking([cub, opt]));
      // Pioche une carte (Forest), défausse Opt (non-terrain) : un marqueur +1/+1 sur l'ourson.
      expect(plus1(s, cub)).toBe(1);
      expect(hand(s).map((id) => nameOf(s, id))).toEqual(["Forest"]);
    });

    it("Morbius : depuis le cimetière, exilez-le pour garder une des trois cartes du dessus, les autres au-dessous", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Swamp"],
          graveyard: ["Morbius the Living Vampire"],
          library: ["Opt", "Lightning Strike", "Think Twice", "Forest", "Forest"],
        },
      });
      const morbius = idOf(s, "p1", "graveyard", "Morbius the Living Vampire");
      const strike = s.players.p1?.library[1] as string;
      s = settle(activate(s, "p1", morbius), picking([strike]));
      expect(hand(s).map((id) => nameOf(s, id))).toEqual(["Lightning Strike"]);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Morbius the Living Vampire");
      const lib = (s.players.p1?.library ?? []).map((id) => nameOf(s, id));
      expect(lib.slice(0, 2)).toEqual(["Forest", "Forest"]);
      expect(lib.slice(2).sort()).toEqual(["Opt", "Think Twice"]);
    });

    it("Prowler : chaque fois qu'un autre Méchant arrive sous votre contrôle, Prowler a la connivence", () => {
      let s = scenario({
        p1: { battlefield: ["Prowler, Clawed Thief", "Island"], hand: [VILLAIN_11, "Opt"] },
      });
      const prowler = idOf(s, "p1", "battlefield", "Prowler, Clawed Thief");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Test Henchman"), picking([opt]));
      expect(plus1(s, prowler)).toBe(1);
      expect(pt(s, prowler)).toEqual([3, 4]);
    });

    describe("Rhino's Rampage", () => {
      it("+1/+0 puis combat ; des blessures en excès détruisent jusqu'à un artefact non-créature de VM 3 ou moins", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Rhino's Rampage"] },
          p2: { battlefield: ["Llanowar Elves", TRINKET] },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        const trinket = idOf(s, "p2", "battlefield", "Test Trinket");
        s = settle(cast(s, "p1", "Rhino's Rampage", { targets: { a: [cub], b: [elves] } }), picking([trinket]));
        expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
        expect(idsOf(s, "p2", "battlefield", "Test Trinket")).toHaveLength(0);
        expect(s.objects[cub]?.damage).toBe(1);
        expect(pt(s, cub)).toEqual([3, 2]);
      });

      it("sans blessures en excès, l'artefact reste", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Rhino's Rampage"] },
          p2: { battlefield: ["Serra Angel", TRINKET] },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const trinket = idOf(s, "p2", "battlefield", "Test Trinket");
        s = settle(cast(s, "p1", "Rhino's Rampage", { targets: { a: [cub], b: [angel] } }), picking([trinket]));
        expect(s.objects[angel]?.damage).toBe(3);
        expect(idsOf(s, "p2", "battlefield", "Test Trinket")).toHaveLength(1);
      });
    });

    it("Scarlet Spider, Kaine : en arrivant, vous pouvez défausser une carte pour un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Mountain"], hand: ["Scarlet Spider, Kaine", "Opt"] } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Scarlet Spider, Kaine"), picking([opt]));
      const kaine = idOf(s, "p1", "battlefield", "Scarlet Spider, Kaine");
      expect(plus1(s, kaine)).toBe(1);
      expect(pt(s, kaine)).toEqual([3, 2]);
      expect(hand(s)).toHaveLength(0);
    });

    describe("Shriek, Treblemaker", () => {
      it("au début de votre première phase principale, défausser une carte empêche une créature de bloquer", () => {
        let s = scenario({
          p1: { battlefield: ["Shriek, Treblemaker"], hand: ["Opt"] },
          p2: { battlefield: ["Bear Cub"] },
          step: "draw",
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = passAccepting(s, (x) => x.turn.step === "main1");
        s = settle(s, picking([opt, bear]));
        expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toContain("Opt");
        expect(chars(s, bear).keywords).toContain("cantBlock");
      });

      it("chaque fois qu'une créature adverse meurt, 1 blessure à son contrôleur", () => {
        let s = scenario({
          p1: { battlefield: ["Shriek, Treblemaker", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Silk : chaque sort de créature crée un Humain Citoyen ; {3}{G}{W} : +2/+2 et vigilance pour vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Silk, Web Weaver", ...lands("Forest", 4), ...lands("Plains", 2)], hand: ["Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      const citizen = idOf(s, "p1", "battlefield", "Human Citizen");
      expect(chars(s, citizen).colors.sort()).toEqual(["G", "W"]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Silk, Web Weaver")));
      expect(pt(s, citizen)).toEqual([3, 3]);
      expect(chars(s, citizen).keywords).toContain("vigilance");
    });

    it("Skyward Spider : a le vol seulement tant qu'elle est modifiée", () => {
      const plain = scenario({ p1: { battlefield: ["Skyward Spider"] } });
      expect(chars(plain, idOf(plain, "p1", "battlefield", "Skyward Spider")).keywords).not.toContain("flying");
      const pumped = scenario({ p1: { battlefield: [{ name: "Skyward Spider", counters: { "+1/+1": 1 } }] } });
      expect(chars(pumped, idOf(pumped, "p1", "battlefield", "Skyward Spider")).keywords).toContain("flying");
    });

    it("SP//dr : un marqueur en arrivant ; une créature modifiée qui blesse un joueur fait piocher", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Island", 2), "Bear Cub", "Gnarlid Colony"],
          hand: ["SP//dr, Piloted by Peni"],
        },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const colony = idOf(s, "p1", "battlefield", "Gnarlid Colony");
      s = settle(cast(s, "p1", "SP//dr, Piloted by Peni"), picking([cub]));
      expect(plus1(s, cub)).toBe(1);
      s = attack(s, [cub, colony]);
      s = toMain2(s);
      // Seul l'ourson (modifié) fait piocher.
      expect(hand(s)).toHaveLength(1);
    });

    it("Spider-Girl : le vol pendant votre tour seulement ; en partant, un Humain Citoyen", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Girl, Legacy Hero"] },
        p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      });
      const girl = idOf(s, "p1", "battlefield", "Spider-Girl, Legacy Hero");
      expect(chars(s, girl).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, girl).keywords).not.toContain("flying");
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [girl] } }));
      expect(idsOf(s, "p1", "battlefield", "Human Citizen")).toHaveLength(1);
    });

    describe("Spider-Man 2099", () => {
      it("ne peut pas être lancé pendant vos trois premiers tours", () => {
        const early = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Spider-Man 2099"] }, turn: 5 });
        expect(castable(early, "p1", idOf(early, "p1", "hand", "Spider-Man 2099"))).toBe(false);
        const late = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Spider-Man 2099"] }, turn: 7 });
        expect(castable(late, "p1", idOf(late, "p1", "hand", "Spider-Man 2099"))).toBe(true);
      });

      it("à votre étape de fin, s'il a lancé un sort d'ailleurs que de la main, blessures égales à sa force", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-Man 2099", ...lands("Island", 3)], graveyard: ["Think Twice"] },
        });
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Think Twice") }));
        s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
        s = settle(s, picking(["p2"]));
        expect(s.players.p2?.life).toBe(18);
      });

      it("rien si les sorts ont été lancés depuis la main", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Man 2099", "Island"], hand: ["Opt"] } });
        s = settle(cast(s, "p1", "Opt"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p2?.life).toBe(20);
      });
    });

    it("Spider-Man India : chaque sort de créature met un marqueur sur une de vos créatures, qui gagne le vol", () => {
      let s = scenario({ p1: { battlefield: ["Spider-Man India", "Bear Cub", "Forest"], hand: ["Llanowar Elves"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Llanowar Elves"), picking([cub]));
      expect(plus1(s, cub)).toBe(1);
      expect(chars(s, cub).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, cub).keywords).not.toContain("flying");
    });

    it("Spider-Woman : les artefacts et créatures de vos adversaires arrivent engagés, pas les vôtres", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Woman, Stunning Savior", "Forest"], hand: ["Llanowar Elves"] },
        p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(cast(s, "p2", "Llanowar Elves"));
      expect(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
    });

    it("The Spot : exile un permanent et une carte de cimetière ; s'il meurt, il va au-dessous et les cartes reviennent en main", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)], hand: ["The Spot, Living Portal", "Bake into a Pie"] },
        p2: { battlefield: ["Serra Angel"], graveyard: ["Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const cub = idOf(s, "p2", "graveyard", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Spot, Living Portal") });
      s = settle(s, picking([angel, cub]));
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      const spot = idOf(s, "p1", "battlefield", "The Spot, Living Portal");
      // Bake into a Pie : {2}{B}{B}, détruit The Spot.
      for (const id of s.battlefield.filter((x) => nameOf(s, x) === "Plains"))
        (s.objects[id] as { tapped: boolean }).tapped = false;
      s = settle(cast(s, "p1", "Bake into a Pie", { targets: { t: [spot] } }));
      expect(s.exile).toHaveLength(0);
      expect(
        hand(s, "p2")
          .map((id) => nameOf(s, id))
          .sort(),
      ).toEqual(["Bear Cub", "Serra Angel"]);
      const lib = s.players.p1?.library ?? [];
      expect(nameOf(s, lib[lib.length - 1] as string)).toBe("The Spot, Living Portal");
    });

    it("Sun-Spider : le vol pendant votre tour ; en arrivant, cherche une carte d'Aura ou d'Équipement", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Sun-Spider, Nimble Webber"],
          library: ["Forest", "Swiftfoot Boots", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Sun-Spider, Nimble Webber"));
      expect(hand(s).map((id) => nameOf(s, id))).toEqual(["Swiftfoot Boots"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Sun-Spider, Nimble Webber")).keywords).toContain("flying");
    });

    describe("Symbiote Spider-Man", () => {
      it("blessures de combat à un joueur : regardez autant de cartes, une en main, les autres au cimetière", () => {
        let s = scenario({
          p1: { battlefield: ["Symbiote Spider-Man"], library: ["Opt", "Lightning Strike", "Forest", "Forest"] },
        });
        s = attack(s, [idOf(s, "p1", "battlefield", "Symbiote Spider-Man")]);
        s = toMain2(s);
        expect(s.players.p2?.life).toBe(18);
        expect(hand(s)).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("Trouver un nouvel hôte : depuis le cimetière, un marqueur et la capacité de blessures de combat", () => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", ...lands("Island", 3)],
            graveyard: ["Symbiote Spider-Man"],
            library: ["Opt", "Lightning Strike", "Think Twice", "Forest", "Forest"],
          },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Symbiote Spider-Man"), { targets: { t: [cub] } }));
        expect(plus1(s, cub)).toBe(1);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Symbiote Spider-Man");
        s = attack(s, [cub]);
        s = toMain2(s);
        // 3 blessures : trois cartes regardées, une en main, deux au cimetière.
        expect(hand(s)).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(2);
      });
    });

    it("Ultimate Green Goblin : à votre entretien, défaussez une carte, puis créez un Trésor", () => {
      let s = scenario({
        p1: { battlefield: ["Ultimate Green Goblin"], hand: ["Opt"] },
        step: "untap",
      });
      s = passAccepting(s, (x) => x.turn.step === "draw");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Vulture : en attaquant, vos autres Méchants gagnent le vol jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Vulture, Scheming Scavenger", "Prowler, Clawed Thief", "Bear Cub"] },
      });
      const prowler = idOf(s, "p1", "battlefield", "Prowler, Clawed Thief");
      s = attack(s, [idOf(s, "p1", "battlefield", "Vulture, Scheming Scavenger")]);
      expect(chars(s, prowler).keywords).toContain("flying");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, prowler).keywords).not.toContain("flying");
    });

    it("Web-Warriors : en arrivant, un marqueur +1/+1 sur chacune de vos autres créatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Bear Cub", "Llanowar Elves"], hand: ["Web-Warriors"] },
        p2: { battlefield: ["Gnarlid Colony"] },
      });
      s = settle(cast(s, "p1", "Web-Warriors"));
      expect(plus1(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(plus1(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(1);
      expect(plus1(s, idOf(s, "p1", "battlefield", "Web-Warriors"))).toBe(0);
      expect(plus1(s, idOf(s, "p2", "battlefield", "Gnarlid Colony"))).toBe(0);
    });

    it("Wraith : ne peut pas être bloqué", () => {
      let s = scenario({ p1: { battlefield: ["Wraith, Vicious Vigilante"] }, p2: { battlefield: ["Serra Angel"] } });
      const wraith = idOf(s, "p1", "battlefield", "Wraith, Vicious Vigilante");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wraith, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: wraith }] })).toThrow();
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(18);
    });
  });
});

describe("lot A, incolores et terrains", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, s: S) => ChoiceValue[] | undefined;
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
  /** Passe et répond aux choix jusqu'à ce que `until` soit vrai. */
  const run = (s: S, until: (s: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Capacité activable de `source` dont le libellé correspond (la première sinon). */
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const manaColors = (s: S, player: string, source: string) => [
    ...new Set(legalActions(s, player).flatMap((a) => (a.type === "tapForMana" && a.source === source ? (a.colors ?? []) : []))),
  ];

  const SPIDER = customCard({
    name: "Test Spider",
    typeLine: "Creature — Spider",
    subtypes: ["Spider"],
    power: 1,
    toughness: 4,
  });
  const WALL = customCard({ name: "Test Wall", typeLine: "Creature — Wall", subtypes: ["Wall"], power: 1, toughness: 4 });

  describe("Marvel's Spider-Man, lot A — incolores et terrains", () => {
    describe("Bagel and Schmear", () => {
      it("Partage : {W}, {T}, sacrifice : un marqueur +1/+1 sur une créature ciblée et une carte piochée, en rituel seulement", () => {
        let s = scenario({ p1: { battlefield: ["Bagel and Schmear", "Plains", "Bear Cub"] } });
        const bagel = idOf(s, "p1", "battlefield", "Bagel and Schmear");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", bagel, { targets: { t: [bear] } }, /Partage/));
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Bagel and Schmear")).toHaveLength(1);
        // Pendant le tour adverse, Partage n'est pas activable.
        let t = scenario({ p1: { battlefield: ["Bagel and Schmear", "Plains", ...lands("Forest", 2)] }, active: "p2" });
        t = act(t, "p2", { type: "pass" });
        const other = idOf(t, "p1", "battlefield", "Bagel and Schmear");
        expect(ability(t, "p1", other, /Grignotage/)).toBeDefined();
        expect(ability(t, "p1", other, /Partage/)).toBeUndefined();
      });

      it("Grignotage : {2}, {T}, sacrifice : vous gagnez 3 PV et piochez une carte", () => {
        let s = scenario({ p1: { battlefield: ["Bagel and Schmear", ...lands("Forest", 2)] } });
        const bagel = idOf(s, "p1", "battlefield", "Bagel and Schmear");
        s = settle(activate(s, "p1", bagel, {}, /Grignotage/));
        expect(s.players.p1?.life).toBe(23);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(chars(s, idOf(s, "p1", "graveyard", "Bagel and Schmear")).subtypes).toContain("Food");
      });
    });

    describe("Doc Ock's Tentacles", () => {
      it("une créature de VM 5 ou plus qui arrive peut s'équiper ; +4/+4", () => {
        let s = scenario({ p1: { battlefield: ["Doc Ock's Tentacles", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
        s = settle(cast(s, "p1", "Shivan Dragon"), (req) => (req.type === "yesNo" ? [1] : undefined));
        const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
        expect(s.objects[idOf(s, "p1", "battlefield", "Doc Ock's Tentacles")]?.attachedTo).toBe(dragon);
        expect(pt(s, dragon)).toEqual([9, 9]);
      });

      it("une créature de VM 4 ou moins ne déclenche rien", () => {
        let s = scenario({ p1: { battlefield: ["Doc Ock's Tentacles", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
        s = cast(s, "p1", "Bear Cub");
        s = passAccepting(s, (x) => x.stack.length === 0);
        expect(s.triggers).toHaveLength(0);
        expect(s.stack).toHaveLength(0);
        expect(s.objects[idOf(s, "p1", "battlefield", "Doc Ock's Tentacles")]?.attachedTo).toBeFalsy();
      });
    });

    it("Eerie Gravestone : pioche en arrivant ; {1}{B}, sacrifice : meule quatre, une carte de créature meulée en main", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 4)],
          hand: ["Eerie Gravestone"],
          library: ["Island", "Bear Cub", "Island", "Serra Angel", "Island", "Island"],
        },
      });
      s = settle(cast(s, "p1", "Eerie Gravestone"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const stone = idOf(s, "p1", "battlefield", "Eerie Gravestone");
      let options: string[] = [];
      let offered: string[] = [];
      s = settle(activate(s, "p1", stone), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        offered = options.map((id) => nameOf(cur, id) ?? "");
        return req.options.filter((o) => nameOf(cur, String(o)) === "Serra Angel");
      });
      // Seules les cartes de créature meulées sont proposées.
      expect(options).toHaveLength(2);
      expect(offered.sort()).toEqual(["Bear Cub", "Serra Angel"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Island", "Serra Angel"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual([
        "Bear Cub",
        "Eerie Gravestone",
        "Island",
        "Island",
      ]);
    });

    it("Hot Dog Cart : un jeton Nourriture en arrivant ; {T} : un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Hot Dog Cart"] } });
      s = settle(cast(s, "p1", "Hot Dog Cart"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      const cart = idOf(s, "p1", "battlefield", "Hot Dog Cart");
      expect(manaColors(s, "p1", cart).sort()).toEqual(["B", "G", "R", "U", "W"]);
    });

    it("Living Brain : au début du combat, un artefact non-Équipement devient une créature 3/3 et se dégage", () => {
      let s = scenario({
        p1: { battlefield: ["Living Brain, Mechanical Marvel", { name: "Hot Dog Cart", tapped: true }, "Spider-Suit"] },
      });
      const cart = idOf(s, "p1", "battlefield", "Hot Dog Cart");
      const suit = idOf(s, "p1", "battlefield", "Spider-Suit");
      const brain = idOf(s, "p1", "battlefield", "Living Brain, Mechanical Marvel");
      let options: string[] = [];
      s = run(
        s,
        (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0,
        (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options.map(String);
          return [cart];
        },
      );
      expect(options.sort()).toEqual([brain, cart].sort());
      expect(options).not.toContain(suit);
      expect(chars(s, cart).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(pt(s, cart)).toEqual([3, 3]);
      expect(s.objects[cart]?.tapped).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, cart).types).not.toContain("Creature");
    });

    it("Mechanical Mobster : exile jusqu'à une carte d'un cimetière ; une créature ciblée complote", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Mechanical Mobster", "Opt"], library: ["Island", "Island"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = cast(s, "p1", "Mechanical Mobster");
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(bear)) return [bear];
        if (req.options.includes(opt)) return [opt];
        return undefined;
      });
      const mobster = idOf(s, "p1", "battlefield", "Mechanical Mobster");
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      // Complot : piocher (une Île), défausser Opt (non-terrain) : un marqueur +1/+1.
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.objects[mobster]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, mobster)).toEqual([3, 2]);
    });

    it("News Helicopter : un Citoyen humain 1/1 vert et blanc en arrivant", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["News Helicopter"] } });
      s = settle(cast(s, "p1", "News Helicopter"));
      const citizen = idOf(s, "p1", "battlefield", "Human Citizen");
      expect(pt(s, citizen)).toEqual([1, 1]);
      expect(chars(s, citizen).colors.sort()).toEqual(["G", "W"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "News Helicopter")).keywords).toContain("flying");
    });

    it("Passenger Ferry : en attaquant, payez {U} : une autre créature attaquante ciblée ne peut pas être bloquée", () => {
      let s = scenario({
        p1: { battlefield: ["Passenger Ferry", "Bear Cub", "Serra Angel", "Island"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const ferry = idOf(s, "p1", "battlefield", "Passenger Ferry");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      // Équipage 2 avec l'Ours.
      s = settle(activate(s, "p1", ferry, { tap: [bear] }, /quipage/));
      expect(chars(s, ferry).types).toContain("Creature");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: ferry, defender: "p2" },
          { id: angel, defender: "p2" },
        ],
      });
      let asked = false;
      s = run(
        s,
        (x) => x.pending?.kind === "declareBlockers",
        (req) => {
          if (req.type === "yesNo") asked = true;
          return undefined;
        },
      );
      expect(asked).toBe(true);
      // Seule l'autre créature attaquante est une cible légale : elle est choisie d'office.
      expect(chars(s, angel).keywords).toContain("unblockable");
      expect(chars(s, ferry).keywords).not.toContain("unblockable");
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(s, "p2", "battlefield", "Llanowar Elves"), attacker: angel }],
        }),
      ).toThrow();
    });

    it("Passenger Ferry : sans payer {U}, rien ne change", () => {
      let s = scenario({ p1: { battlefield: ["Passenger Ferry", "Bear Cub", "Serra Angel", "Island"] } });
      const ferry = idOf(s, "p1", "battlefield", "Passenger Ferry");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", ferry, { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }, /quipage/));
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: ferry, defender: "p2" },
          { id: angel, defender: "p2" },
        ],
      });
      s = run(
        s,
        (x) =>
          x.turn.step === "declareAttackers" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
        (req) => (req.type === "yesNo" ? [0] : undefined),
      );
      expect(chars(s, angel).keywords).not.toContain("unblockable");
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(false);
    });

    it("Peter Parker's Camera : trois marqueurs de pellicule ; {2}, {T}, retirez-en un : copie d'une capacité déclenchée", () => {
      let s = scenario({ p1: { battlefield: ["Peter Parker's Camera", ...lands("Plains", 5)], hand: ["News Helicopter"] } });
      const camera = idOf(s, "p1", "battlefield", "Peter Parker's Camera");
      // Les marqueurs de pellicule sont posés en arrivant : on le vérifie sur une Camera lancée.
      let c = scenario({ p1: { battlefield: lands("Plains", 1), hand: ["Peter Parker's Camera"] } });
      c = settle(cast(c, "p1", "Peter Parker's Camera"));
      expect(c.objects[idOf(c, "p1", "battlefield", "Peter Parker's Camera")]?.counters.film).toBe(3);
      s.objects[camera] = { ...(s.objects[camera] as NonNullable<S["objects"][string]>), counters: { film: 3 } };
      s.version += 1;
      s = cast(s, "p1", "News Helicopter");
      s = passAccepting(s, (x) => x.stack.some((i) => i.kind === "ability"));
      const trigger = s.stack.find((i) => i.kind === "ability")?.id as string;
      expect(ability(s, "p1", camera)?.targets[0]?.legal).toContain(trigger);
      s = settle(activate(s, "p1", camera, { targets: { t: [trigger] } }));
      expect(idsOf(s, "p1", "battlefield", "Human Citizen")).toHaveLength(2);
      expect(s.objects[camera]?.counters.film).toBe(2);
    });

    describe("Rocket-Powered Goblin Glider", () => {
      it("équipée : +2/+0, le vol et la célérité ; lancée depuis la main, elle ne s'attache pas", () => {
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 5), "Bear Cub"], hand: ["Rocket-Powered Goblin Glider"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Rocket-Powered Goblin Glider"), picking([bear]));
        const glider = idOf(s, "p1", "battlefield", "Rocket-Powered Goblin Glider");
        expect(s.objects[glider]?.attachedTo).toBeFalsy();
        s = settle(activate(s, "p1", glider, { targets: { t: [bear] } }, /quiper/));
        expect(s.objects[glider]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 2]);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      });

      it("chaos : défaussée ce tour-ci, lancée du cimetière pour {2}, elle s'attache à une de vos créatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], graveyard: ["Rocket-Powered Goblin Glider"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const card = idOf(s, "p1", "graveyard", "Rocket-Powered Goblin Glider");
        (s.objects[card] as { discardedTurn?: number }).discardedTurn = s.turn.number;
        s = settle(act(s, "p1", { type: "cast", card }), picking([bear]));
        const glider = idOf(s, "p1", "battlefield", "Rocket-Powered Goblin Glider");
        expect(s.objects[glider]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 2]);
      });
    });

    it("Spider-Bot : vous pouvez mettre une carte de terrain de base au-dessus de votre bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Spider-Bot"], library: ["Bear Cub", "Serra Angel", "Island", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Spider-Bot"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        const island = req.options.find((o) => nameOf(cur, String(o)) === "Island");
        return island ? [island] : undefined;
      });
      const top = s.players.p1?.library[0] as string;
      expect(nameOf(s, top)).toBe("Island");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Spider-Mobile : en attaquant, +1/+1 par Araignée que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Spider-Mobile", SPIDER, SPIDER, "Bear Cub"] } });
      const mobile = idOf(s, "p1", "battlefield", "Spider-Mobile");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Équipage 2 avec l'Ours : les deux Araignées restent dégagées (elles comptent même engagées).
      s = settle(activate(s, "p1", mobile, { tap: [bear] }, /quipage/));
      expect(pt(s, mobile)).toEqual([3, 3]);
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: mobile, defender: "p2" }] });
      s = run(
        s,
        (x) =>
          x.turn.step === "declareAttackers" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.kind === "priority" &&
          x.pending.player === "p2",
      );
      expect(pt(s, mobile)).toEqual([5, 5]);
      expect(chars(s, mobile).keywords).toContain("trample");
    });

    it("Spider-Mobile : en bloquant, +1/+1 par Araignée que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Spider-Mobile", SPIDER, "Serra Angel"] },
      });
      const mobile = idOf(s, "p2", "battlefield", "Spider-Mobile");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      // L'adversaire équipe le Véhicule avec l'Ange pendant votre phase principale.
      s = settle(activate(s, "p2", mobile, { tap: [angel] }, /quipage/));
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: mobile, attacker: bear }] });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step === "declareBlockers");
      expect(pt(s, mobile)).toEqual([4, 4]);
    });

    describe("Spider-Slayer, Hatred Honed", () => {
      it("détruit l'Araignée qu'il blesse, pas une autre créature", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-Slayer, Hatred Honed"] },
          p2: { battlefield: [SPIDER, WALL] },
        });
        const slayer = idOf(s, "p1", "battlefield", "Spider-Slayer, Hatred Honed");
        const spider = idOf(s, "p2", "battlefield", "Test Spider");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: slayer, defender: "p2" }] });
        s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: spider, attacker: slayer }] });
        s = advanceUntil(s, (x) => x.turn.step === "end");
        expect(idsOf(s, "p2", "graveyard", "Test Spider")).toHaveLength(1);

        let t = scenario({ p1: { battlefield: ["Spider-Slayer, Hatred Honed"] }, p2: { battlefield: [WALL] } });
        const slayer2 = idOf(t, "p1", "battlefield", "Spider-Slayer, Hatred Honed");
        const wall = idOf(t, "p2", "battlefield", "Test Wall");
        t = passAccepting(t, (x) => x.pending?.kind === "declareAttackers");
        t = act(t, "p1", { type: "declareAttackers", attackers: [{ id: slayer2, defender: "p2" }] });
        t = passAccepting(t, (x) => x.pending?.kind === "declareBlockers");
        t = act(t, "p2", { type: "declareBlockers", blocks: [{ blocker: wall, attacker: slayer2 }] });
        t = advanceUntil(t, (x) => x.turn.step === "end");
        expect(idsOf(t, "p2", "battlefield", "Test Wall")).toHaveLength(1);
      });

      it("{6}, exilez-le de votre cimetière : deux Robots artefacts 1/1 volants engagés", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 6), graveyard: ["Spider-Slayer, Hatred Honed"] } });
        const card = idOf(s, "p1", "graveyard", "Spider-Slayer, Hatred Honed");
        s = settle(activate(s, "p1", card));
        const robots = idsOf(s, "p1", "battlefield", "Robot");
        expect(robots).toHaveLength(2);
        for (const r of robots) {
          expect(s.objects[r]?.tapped).toBe(true);
          expect(chars(s, r).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
          expect(chars(s, r).keywords).toContain("flying");
        }
        expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Spider-Slayer, Hatred Honed"]);
      });
    });

    it("Spider-Suit : la créature équipée gagne +2/+2 et est une Araignée Héros en plus de ses autres types", () => {
      let s = scenario({ p1: { battlefield: ["Spider-Suit", "Bear Cub", ...lands("Plains", 3)] } });
      const suit = idOf(s, "p1", "battlefield", "Spider-Suit");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", suit, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Spider", "Hero"]));
    });

    describe("Steel Wrecking Ball", () => {
      it("en arrivant, 5 blessures à une créature ciblée", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Steel Wrecking Ball"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Steel Wrecking Ball"), picking([angel]));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("{1}{R}, défaussez-la : détruisez un artefact ciblé", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Steel Wrecking Ball"] },
          p2: { battlefield: ["Hot Dog Cart"] },
        });
        const ball = idOf(s, "p1", "hand", "Steel Wrecking Ball");
        const cart = idOf(s, "p2", "battlefield", "Hot Dog Cart");
        s = settle(activate(s, "p1", ball, { targets: { t: [cart] } }));
        expect(idsOf(s, "p2", "graveyard", "Hot Dog Cart")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Steel Wrecking Ball")).toHaveLength(1);
      });
    });

    it("Subway Train : en arrivant, payez {G} : une carte de terrain de base en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Subway Train"], library: ["Bear Cub", "Island", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Subway Train"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        const island = req.options.find((o) => nameOf(cur, String(o)) === "Island");
        return island ? [island] : undefined;
      });
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped && nameOf(s, id) === "Forest")).toHaveLength(3);
    });

    describe("Daily Bugle Building", () => {
      it("{T} : {C} ; {1}, {T} : un mana de n'importe quelle couleur", () => {
        const s = scenario({ p1: { battlefield: ["Daily Bugle Building", "Forest"] } });
        const bugle = idOf(s, "p1", "battlefield", "Daily Bugle Building");
        expect(manaColors(s, "p1", bugle)).toEqual(["C"]);
        expect(ability(s, "p1", bugle, /n'importe quelle couleur/)).toBeDefined();
      });

      it("Campagne de dénigrement : seulement une créature légendaire, qui gagne la menace jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["Daily Bugle Building", "Forest", "Bear Cub", "Living Brain, Mechanical Marvel"] },
        });
        const bugle = idOf(s, "p1", "battlefield", "Daily Bugle Building");
        const brain = idOf(s, "p1", "battlefield", "Living Brain, Mechanical Marvel");
        expect(ability(s, "p1", bugle, /dénigrement/)?.targets[0]?.legal).toEqual([brain]);
        s = settle(activate(s, "p1", bugle, { targets: { t: [brain] } }, /dénigrement/));
        expect(chars(s, brain).keywords).toContain("menace");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, brain).keywords).not.toContain("menace");
      });
    });

    it("Ominous Asylum : arrive engagé, {B} ou {R} ; {4}, {T} : surveillance 1", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Ominous Asylum" }, ...lands("Swamp", 4)],
          hand: ["Savage Mansion"],
          library: ["Bear Cub", "Island"],
        },
      });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Savage Mansion") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Savage Mansion")]?.tapped).toBe(true);
      const asylum = idOf(s, "p1", "battlefield", "Ominous Asylum");
      expect(manaColors(s, "p1", asylum).sort()).toEqual(["B", "R"]);
      s = settle(activate(s, "p1", asylum, {}, /Surveillance/), (req) =>
        req.type === "pick" ? req.options.filter((o) => nameOf(s, String(o)) === "Bear Cub") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[asylum]?.tapped).toBe(true);
    });

    it("Vibrant Cityscape : {T}, sacrifiez-le : un terrain de base sur le champ de bataille, engagé", () => {
      let s = scenario({ p1: { battlefield: ["Vibrant Cityscape"], library: ["Bear Cub", "Island", "Bear Cub"] } });
      const city = idOf(s, "p1", "battlefield", "Vibrant Cityscape");
      s = settle(activate(s, "p1", city));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Vibrant Cityscape")).toHaveLength(1);
    });
  });
});

describe("lot B1, Web-slinging et chaos", () => {
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const discarded = (s: S, id: string) => {
    (s.objects[id] as { discardedTurn?: number }).discardedTurn = s.turn.number;
  };
  const castOption = (s: S, player: string, card: string) =>
    legalActions(s, player).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);

  describe("Spiders-Man, Heroic Horde", () => {
    it("lancés par Web-slinging : 3 PV et deux Araignées 2/1 avec la portée ; la créature engagée revient en main", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 6), { name: "Bear Cub", tapped: true }], hand: ["Spiders-Man, Heroic Horde"] },
      });
      s = settle(cast(s, "p1", "Spiders-Man, Heroic Horde", { alternative: true }));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(23);
      const spiders = idsOf(s, "p1", "battlefield", "Spider");
      expect(spiders).toHaveLength(2);
      expect(pt(s, spiders[0] as string)).toEqual([2, 1]);
      expect(chars(s, spiders[0] as string).keywords).toContain("reach");
    });

    it("lancés pour leur coût de mana : rien", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Spiders-Man, Heroic Horde"] } });
      s = settle(cast(s, "p1", "Spiders-Man, Heroic Horde"));
      expect(idsOf(s, "p1", "battlefield", "Spiders-Man, Heroic Horde")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
    });
  });

  describe("Scarlet Spider, Ben Reilly", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Mountain", "Forest", { name: "Llanowar Elves", tapped: true }, { name: "Serra Angel", tapped: true }],
          hand: ["Scarlet Spider, Ben Reilly"],
        },
      });

    it("Web-slinging : le joueur choisit la créature renvoyée ; X marqueurs, X étant sa valeur de mana", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Scarlet Spider, Ben Reilly");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      // La moins chère est proposée en premier (choix par défaut).
      expect(castOption(s, "p1", card)?.altBounce).toEqual([idOf(s, "p1", "battlefield", "Llanowar Elves"), angel]);
      s = settle(act(s, "p1", { type: "cast", card, alternative: true, bounce: [angel] }));
      const spider = idOf(s, "p1", "battlefield", "Scarlet Spider, Ben Reilly");
      expect(s.objects[spider]?.counters["+1/+1"]).toBe(5);
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("sans choix, la moins chère revient (un marqueur) ; une créature non engagée ne peut pas être renvoyée", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Scarlet Spider, Ben Reilly");
      expect(() =>
        act(s, "p1", { type: "cast", card, alternative: true, bounce: [idOf(s, "p1", "battlefield", "Mountain")] }),
      ).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Scarlet Spider, Ben Reilly")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
    });

    it("lancé pour son coût de mana : aucun marqueur", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Forest", "Forest"], hand: ["Scarlet Spider, Ben Reilly"] } });
      s = settle(cast(s, "p1", "Scarlet Spider, Ben Reilly"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Scarlet Spider, Ben Reilly")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Sandman's Quicksand", () => {
    it("lancé de la main : toutes les créatures ont -2/-2", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Serra Angel"], hand: ["Sandman's Quicksand"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Sandman's Quicksand"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([2, 2]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("coût de chaos payé : seulement les créatures des adversaires", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], graveyard: ["Sandman's Quicksand"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const card = idOf(s, "p1", "graveyard", "Sandman's Quicksand");
      discarded(s, card);
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([2, 2]);
    });
  });

  describe("Alien Symbiosis", () => {
    it("se lance depuis le cimetière en défaussant une carte en plus ; +1/+1, la menace, Symbiote", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], graveyard: ["Alien Symbiosis"], hand: ["Opt"] },
      });
      const card = idOf(s, "p1", "graveyard", "Alien Symbiosis");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(castOption(s, "p1", card)?.additional?.discard?.count).toBe(1);
      s = settle(act(s, "p1", { type: "cast", card, targets: { enchant: [bear] }, discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("menace");
      expect(chars(s, bear).subtypes).toContain("Symbiote");
    });

    it("sans carte à défausser, pas de lancer depuis le cimetière", () => {
      const s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], graveyard: ["Alien Symbiosis"] } });
      expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Alien Symbiosis"))).toBe(false);
    });
  });

  describe("Oscorp Industries", () => {
    it("défaussé ce tour-ci, il se joue depuis le cimetière ; arrivé d'un cimetière, vous perdez 2 PV", () => {
      let s = scenario({ p1: { graveyard: ["Oscorp Industries"] } });
      const card = idOf(s, "p1", "graveyard", "Oscorp Industries");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === card)).toBe(false);
      discarded(s, card);
      s = act(s, "p1", { type: "playLand", card });
      s = passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0);
      const land = idOf(s, "p1", "battlefield", "Oscorp Industries");
      expect(s.objects[land]?.tapped).toBe(true);
      expect(s.players.p1?.life).toBe(18);
    });

    it("joué de la main : pas de perte de PV", () => {
      let s = scenario({ p1: { hand: ["Oscorp Industries"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Oscorp Industries") });
      s = passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0);
      expect(s.players.p1?.life).toBe(20);
    });
  });

  describe("Norman Osborn // Green Goblin", () => {
    const goblin = () => {
      let s = scenario({
        p1: {
          battlefield: ["Norman Osborn // Green Goblin", "Island", "Swamp", "Mountain", ...lands("Mountain", 3)],
          graveyard: ["Shivan Dragon", "Lightning Strike", "Forest"],
        },
      });
      const norman = idOf(s, "p1", "battlefield", "Norman Osborn // Green Goblin");
      expect(chars(s, norman).keywords).toContain("unblockable");
      s = settle(activate(s, "p1", norman, {}, /Transform/));
      expect(chars(s, norman).name).toBe("Green Goblin");
      return s;
    };

    it("Formule du Gobelin : une carte non-terrain défaussée ce tour-ci se lance du cimetière, {2} de moins", () => {
      let s = goblin();
      const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      const forest = idOf(s, "p1", "graveyard", "Forest");
      expect(castable(s, "p1", strike)).toBe(false);
      discarded(s, strike);
      discarded(s, dragon);
      discarded(s, forest);
      expect(castable(s, "p1", strike)).toBe(true);
      // Un terrain n'a pas le chaos.
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(false);
      // Lightning Strike ({1}{R}) coûte {R} : une seule Montagne dégagée suffit.
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Peter Parker // Amazing Spider-Man", () => {
    it("Peter Parker crée une Araignée ; Amazing Spider-Man donne le Web-slinging {G}{W}{U} à vos sorts légendaires de couleur", () => {
      let s = scenario({
        p1: {
          battlefield: ["Plains", "Island", "Forest", "Forest", "Plains", "Island", "Plains"],
          hand: ["Peter Parker // Amazing Spider-Man", "Kraven, Proud Predator", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Peter Parker // Amazing Spider-Man"));
      expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(1);
      const peter = idOf(s, "p1", "battlefield", "Peter Parker // Amazing Spider-Man");
      s = settle(activate(s, "p1", peter, {}, /Transform/));
      expect(chars(s, peter).name).toBe("Amazing Spider-Man");
      // Toutes les terres sont engagées sauf une : il faut une créature engagée et {G}{W}{U}.
      const kraven = idOf(s, "p1", "hand", "Kraven, Proud Predator");
      expect(castOption(s, "p1", kraven)?.altAvailable).toBeUndefined();
      const spider = idOf(s, "p1", "battlefield", "Spider");
      s.objects[spider]!.tapped = true;
      for (const id of s.battlefield) if (nameOf(s, id) !== "Spider" && s.objects[id]?.tapped) s.objects[id]!.tapped = false;
      expect(castOption(s, "p1", kraven)?.altAvailable).toBe(true);
      // Un sort non légendaire n'a pas le Web-slinging.
      expect(castOption(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))?.altAvailable).toBeUndefined();
      s = settle(act(s, "p1", { type: "cast", card: kraven, alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Kraven, Proud Predator")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(0);
    });
  });

  describe("Urban Retreat", () => {
    it("{2}, renvoyez une créature engagée : le terrain passe de votre main au champ de bataille, en rituel", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), { name: "Bear Cub", tapped: true }], hand: ["Urban Retreat"] },
      });
      const card = idOf(s, "p1", "hand", "Urban Retreat");
      s = settle(activate(s, "p1", card));
      expect(idsOf(s, "p1", "battlefield", "Urban Retreat")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      // Ce n'est pas le terrain joué du tour.
      expect(s.turn.landsPlayed).toBe(0);
    });

    it("sans créature engagée, la capacité n'est pas proposée", () => {
      const s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Urban Retreat"] } });
      expect(ability(s, "p1", idOf(s, "p1", "hand", "Urban Retreat"))).toBeUndefined();
    });
  });
});

describe("lot C1, copies et légendes", () => {
  const LEGEND_SPIDER = customCard({
    name: "Test Legendary Spider",
    supertypes: ["Legendary"],
    subtypes: ["Spider"],
    power: 1,
    toughness: 1,
    manaCost: { generic: 1, colored: {}, x: 0 },
  });
  const LEGEND_HUMAN = customCard({
    name: "Test Legendary Human",
    supertypes: ["Legendary"],
    subtypes: ["Human"],
    power: 1,
    toughness: 1,
  });
  const pickName =
    (name: string): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "chooseOnEnter" ? [name] : undefined;
  const nextMain = (s: S) =>
    advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > s.turn.number);

  describe("Chameleon, Master of Disguise", () => {
    it("arrive comme copie d'une de vos créatures, mais garde son nom (la règle des légendes ne s'applique pas)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Kraven, Proud Predator"], hand: ["Chameleon, Master of Disguise"] },
      });
      const kraven = idOf(s, "p1", "battlefield", "Kraven, Proud Predator");
      s = settle(cast(s, "p1", "Chameleon, Master of Disguise"), picking([kraven]));
      const chameleon = idOf(s, "p1", "battlefield", "Chameleon, Master of Disguise");
      expect(chars(s, chameleon).name).toBe("Chameleon, Master of Disguise");
      expect(pt(s, chameleon)).toEqual([chars(s, kraven).power, chars(s, kraven).toughness]);
      expect(chars(s, chameleon).supertypes).toContain("Legendary");
      expect(idsOf(s, "p1", "battlefield", "Kraven, Proud Predator")).toHaveLength(1);
    });
  });

  describe("The Clone Saga", () => {
    it("II : votre prochain sort de créature ce tour-ci est copié, et la copie n'est pas légendaire", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "The Clone Saga", counters: { lore: 1 } }, "Forest"], hand: [LEGEND_SPIDER] },
      });
      s = settle(nextMain(s));
      expect(s.objects[idOf(s, "p1", "battlefield", "The Clone Saga")]?.counters.lore).toBe(2);
      s = settle(cast(s, "p1", "Test Legendary Spider"));
      const spiders = idsOf(s, "p1", "battlefield", "Test Legendary Spider");
      expect(spiders).toHaveLength(2);
      const token = spiders.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, token).supertypes).not.toContain("Legendary");
    });

    it("III : une créature du nom choisi qui blesse un joueur ce tour-ci vous fait piocher", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "The Clone Saga", counters: { lore: 2 } }, "Bear Cub"], library: lands("Island", 10) },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > s.turn.number && x.pending?.kind === "choice");
      s = settle(s, pickName("Bear Cub"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "endCombat" || x.turn.step === "main2");
      s = settle(s);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });
  });

  describe("Jackal, Genius Geneticist", () => {
    it("un sort de créature de VM égale à sa force est copié (non légendaire), puis Jackal reçoit un marqueur", () => {
      let s = scenario({
        p1: {
          battlefield: ["Jackal, Genius Geneticist", ...lands("Forest", 4)],
          hand: [LEGEND_SPIDER, "Bear Cub", "Llanowar Elves"],
        },
      });
      const jackal = idOf(s, "p1", "battlefield", "Jackal, Genius Geneticist");
      s = settle(cast(s, "p1", "Test Legendary Spider"));
      expect(idsOf(s, "p1", "battlefield", "Test Legendary Spider")).toHaveLength(2);
      expect(pt(s, jackal)).toEqual([2, 2]);
      // Force 2 : un sort de VM 1 ne déclenche plus, un sort de VM 2 si.
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
      expect(pt(s, jackal)).toEqual([3, 3]);
    });
  });

  describe("Spider-Verse", () => {
    it("la règle des légendes ne s'applique pas à vos Araignées, mais toujours aux autres légendes", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Verse", LEGEND_SPIDER, LEGEND_HUMAN, "Forest"], hand: [LEGEND_SPIDER, LEGEND_HUMAN] },
      });
      s = settle(cast(s, "p1", "Test Legendary Spider"));
      expect(idsOf(s, "p1", "battlefield", "Test Legendary Spider")).toHaveLength(2);
      s = settle(cast(s, "p1", "Test Legendary Human"), () => undefined);
      expect(idsOf(s, "p1", "battlefield", "Test Legendary Human")).toHaveLength(1);
    });

    it("un sort lancé d'ailleurs que de la main peut être copié ; une seule fois par tour, mais refuser ne compte pas", () => {
      let s = scenario({
        p1: {
          battlefield: ["Spider-Verse", ...lands("Island", 9)],
          graveyard: ["Think Twice", "Think Twice", "Think Twice"],
          library: lands("Island", 12),
        },
      });
      const decline: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
      const accept: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
      const flashback = (cur: S) => act(cur, "p1", { type: "cast", card: idOf(cur, "p1", "graveyard", "Think Twice") });
      const hand0 = s.players.p1?.hand.length ?? 0;
      s = settle(flashback(s), decline);
      expect(s.players.p1?.hand.length).toBe(hand0 + 1);
      s = settle(flashback(s), accept);
      expect(s.players.p1?.hand.length).toBe(hand0 + 3);
      // Déjà fait ce tour-ci : plus de copie.
      s = settle(flashback(s), accept);
      expect(s.players.p1?.hand.length).toBe(hand0 + 4);
    });
  });

  describe("Behold the Sinister Six!", () => {
    it("renvoie jusqu'à six cartes de créature de noms différents", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 7),
          hand: ["Behold the Sinister Six!"],
          graveyard: ["Bear Cub", "Bear Cub", "Serra Angel"],
        },
      });
      const [b1, b2] = idsOf(s, "p1", "graveyard", "Bear Cub") as [string, string];
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      const card = idOf(s, "p1", "hand", "Behold the Sinister Six!");
      const opt = legalActions(s, "p1").find(
        (a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card,
      );
      expect(opt?.modes[0]?.targets[0]?.group?.kind).toBe("different");
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: [b1, b2] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [b1, angel] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });
});

describe("lot C2, coûts, montants et joueurs", () => {
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1 });
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("The Soul Stone : exilez une créature pour l'exploiter ; ∞ à votre entretien, une créature de votre cimetière revient", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Soul Stone", ...lands("Swamp", 7), "Bear Cub"],
        graveyard: ["Serra Angel"],
        library: lands("Swamp", 5),
      },
    });
    const stone = idOf(s, "p1", "battlefield", "The Soul Stone");
    s = settle(activate(s, "p1", stone, /exploiter/));
    expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
    expect(s.objects[stone]?.harnessed).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > s.turn.number && x.turn.step === "main1");
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("The Soul Stone : sans créature à exiler, pas d'exploitation", () => {
    const s = scenario({ p1: { battlefield: ["The Soul Stone", ...lands("Swamp", 7)] } });
    expect(ability(s, "p1", idOf(s, "p1", "battlefield", "The Soul Stone"), /exploiter/)).toBeUndefined();
  });

  it("Iron Spider : {T} met un marqueur sur vos artefacts-créatures ; {2} retire deux marqueurs répartis pour piocher", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Iron Spider, Stark Upgrade",
          { name: "Spider-Bot", counters: { "+1/+1": 1 } },
          "Bear Cub",
          ...lands("Island", 2),
        ],
        library: lands("Island", 3),
      },
    });
    const iron = idOf(s, "p1", "battlefield", "Iron Spider, Stark Upgrade");
    const bot = idOf(s, "p1", "battlefield", "Spider-Bot");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Un seul marqueur parmi vos artefacts : pas assez.
    expect(ability(s, "p1", iron, /piochez/)).toBeUndefined();
    s = settle(activate(s, "p1", iron, /chacun/));
    expect(s.objects[iron]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[bot]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", iron, /piochez/));
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    expect((s.objects[iron]?.counters["+1/+1"] ?? 0) + (s.objects[bot]?.counters["+1/+1"] ?? 0)).toBe(1);
  });

  it("Cheering Crowd : au début de la première phase principale de chaque joueur, il peut y mettre un marqueur et ajoute {C} par marqueur", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Cheering Crowd", counters: { "+1/+1": 1 } }] }, turn: 1 });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "choice");
    expect(s.pending?.kind === "choice" && s.pending.player).toBe("p2");
    s = act(s, "p2", { type: "choose", values: [1] });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    const crowd = idOf(s, "p1", "battlefield", "Cheering Crowd");
    expect(s.objects[crowd]?.counters["+1/+1"]).toBe(2);
    expect(s.players.p2?.manaPool.C).toBe(2);
    expect(s.players.p1?.manaPool.C ?? 0).toBe(0);
  });

  describe("Mister Negative", () => {
    it("échange les totaux de PV avec un adversaire ciblé ; vous piochez autant que vous en avez perdu", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Swamp"], hand: ["Mister Negative"], library: lands("Plains", 6) },
      });
      s.players.p1!.life = 10;
      s.players.p2!.life = 7;
      const hand = (s.players.p1?.hand.length ?? 0) - 1;
      s = settle(cast(s, "p1", "Mister Negative"), yes);
      expect(s.players.p1?.life).toBe(7);
      expect(s.players.p2?.life).toBe(10);
      expect(s.players.p1?.hand.length).toBe(hand + 3);
    });

    it("si vous gagnez des PV, vous ne piochez pas", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Swamp"], hand: ["Mister Negative"], library: lands("Plains", 6) },
      });
      s.players.p1!.life = 4;
      const hand = (s.players.p1?.hand.length ?? 0) - 1;
      s = settle(cast(s, "p1", "Mister Negative"), yes);
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(4);
      expect(s.players.p1?.hand.length).toBe(hand);
    });
  });

  describe("Rhino, Barreling Brute", () => {
    const attack = (s: S) => {
      let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      cur = act(cur, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(cur, "p1", "battlefield", "Rhino, Barreling Brute"), defender: "p2" }],
      });
      return settle(cur);
    };
    it("s'il attaque après un sort de VM 4 ou plus ce tour-ci : piochez une carte", () => {
      let s = scenario({
        p1: {
          battlefield: ["Rhino, Barreling Brute", ...lands("Mountain", 6)],
          hand: ["Shivan Dragon"],
          library: lands("Mountain", 3),
        },
      });
      s = settle(cast(s, "p1", "Shivan Dragon"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });
    it("après un sort de VM 3 ou moins seulement : rien", () => {
      let s = scenario({
        p1: { battlefield: ["Rhino, Barreling Brute", ...lands("Forest", 2)], hand: ["Bear Cub"], library: lands("Mountain", 3) },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s);
      expect(s.players.p1?.hand.length).toBe(hand);
    });
  });

  it("Kraven's Last Hunt : I meule cinq cartes, puis blessures égales à la plus grande force de votre cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Kraven's Last Hunt"],
        library: ["Bear Cub", "Serra Angel", "Forest", "Forest", "Llanowar Elves", "Shivan Dragon"],
      },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = settle(cast(s, "p1", "Kraven's Last Hunt"), picking([dragon]));
    expect(s.players.p1?.graveyard).toHaveLength(5);
    // Serra Angel (4) est la plus forte des cartes meulées ; le Shivan Dragon resté dans la bibliothèque ne compte pas.
    expect(s.objects[dragon]?.damage).toBe(4);
  });

  describe("Kraven the Hunter", () => {
    it("la créature adverse de plus grande force meurt : piochez une carte et un marqueur ; pas pour une plus petite", () => {
      let s = scenario({
        p1: { battlefield: ["Kraven the Hunter"], library: lands("Swamp", 4) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const kraven = idOf(s, "p1", "battlefield", "Kraven the Hunter");
      const hand = s.players.p1?.hand.length ?? 0;
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      // Le Serra Angel est plus fort : rien ne se déclenche.
      expect(s.triggers).toHaveLength(0);
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = settle(passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0));
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      expect(s.objects[kraven]?.counters["+1/+1"]).toBe(1);
    });

    it("mortes en même temps : seule la plus grande compte (les autres sont vues par leurs dernières informations)", () => {
      let s = scenario({
        p1: { battlefield: ["Kraven the Hunter"], library: lands("Swamp", 4) },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Llanowar Elves"] },
      });
      const hand = s.players.p1?.hand.length ?? 0;
      for (const name of ["Bear Cub", "Serra Angel", "Llanowar Elves"]) destroy(s, idOf(s, "p2", "battlefield", name));
      s = settle(passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0));
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });
  });
});

describe("lot C3, cartes uniques", () => {
  const playable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => (a.type === "cast" || a.type === "playLand") && a.card === card);
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("Arachne : le type choisi en arrivant (pas créature) coûte {1} de plus pour tous les joueurs", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Arachne, Psionic Weaver", "Lightning Strike"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Arachne, Psionic Weaver"), (req) =>
      req.type === "pick" && req.intent === "chooseOnEnter" ? ["Instant"] : undefined,
    );
    const arachne = idOf(s, "p1", "battlefield", "Arachne, Psionic Weaver");
    expect(s.objects[arachne]?.chosen?.mode).toBe("Instant");
    expect(legalActions(s, "p1").some((o) => o.type === "cast" && o.card === idOf(s, "p1", "hand", "Lightning Strike"))).toBe(
      false,
    );
    // Deux Montagnes ne suffisent plus à l'adversaire pour {1}{R} + {1}.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(castable(s, "p2", idOf(s, "p2", "hand", "Lightning Strike"))).toBe(false);
  });

  describe("With Great Power . . .", () => {
    it("+2/+2 pour chaque Aura et Équipement attachés à la créature enchantée", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["With Great Power . . ."] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "With Great Power . . .", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
    });

    it("les blessures qui vous seraient infligées sont infligées à la créature enchantée à la place", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Serra Angel"], hand: ["With Great Power . . ."] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "With Great Power . . .", { targets: { enchant: [angel] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[angel]?.damage).toBe(3);
    });
  });

  describe("Spider-Punk", () => {
    it("vos autres Araignées ont l'émeute : marqueur ou célérité, au choix en résolvant le sort", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Punk", ...lands("Forest", 4)], hand: ["Radioactive Spider", "Radioactive Spider"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Spider-Punk")).keywords).toContain("riot");
      const pick =
        (v: string): Answer =>
        (req) =>
          req.type === "pick" && req.options.includes("haste") ? [v] : undefined;
      s = settle(cast(s, "p1", "Radioactive Spider"), pick("counter"));
      s = settle(cast(s, "p1", "Radioactive Spider"), pick("haste"));
      const [a, b] = idsOf(s, "p1", "battlefield", "Radioactive Spider") as [string, string];
      expect(s.objects[a]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, a).keywords).not.toContain("haste");
      expect(s.objects[b]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, b).keywords).toContain("haste");
    });

    it("les sorts et les capacités ne peuvent pas être contrecarrés, pour tous les joueurs", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Punk", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Island", "Island", "Island"], hand: ["Spider-Sense"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      s = settle(
        act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Spider-Sense"), targets: { t: [s.stack[0]?.id as string] } }),
      );
      expect(s.players.p2?.life).toBe(17);
    });
  });

  it("Superior Foes of Spider-Man : la carte exilée reste jouable jusqu'à ce qu'une autre soit exilée ainsi", () => {
    let s = scenario({
      p1: {
        battlefield: ["Superior Foes of Spider-Man", ...lands("Plains", 10)],
        hand: ["Serra Angel", "Serra Angel"],
        library: ["Forest", "Island", "Swamp"],
      },
    });
    s = settle(cast(s, "p1", "Serra Angel"), yes);
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(playable(s, "p1", forest)).toBe(true);
    s = settle(cast(s, "p1", "Serra Angel"), yes);
    const island = s.exile.find((id) => nameOf(s, id) === "Island") as string;
    expect(playable(s, "p1", island)).toBe(true);
    expect(playable(s, "p1", forest)).toBe(false);
  });

  it("Black Cat : deux des neuf cartes du dessus d'un adversaire exilées, jouables avec du mana de n'importe quel type", () => {
    const lib = [
      "Lightning Strike",
      "Opt",
      "Bear Cub",
      "Mountain",
      "Island",
      "Swamp",
      "Forest",
      "Plains",
      "Island",
      "Shivan Dragon",
    ];
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Plains", "Plains"], hand: ["Black Cat, Cunning Thief"] },
      p2: { library: lib },
    });
    const wanted = (s.players.p2?.library ?? []).filter((id) => ["Lightning Strike", "Opt"].includes(nameOf(s, id) ?? ""));
    s = settle(cast(s, "p1", "Black Cat, Cunning Thief"), (req) =>
      req.type === "pick" && req.intent === "lookAtTop" ? wanted : undefined,
    );
    const strike = s.exile.find((id) => nameOf(s, id) === "Lightning Strike") as string;
    expect(s.exile.some((id) => nameOf(s, id) === "Opt")).toBe(true);
    expect(s.players.p2?.library).toHaveLength(8);
    // Le dixième (Shivan Dragon) reste au-dessus ; les sept autres vont au-dessous.
    expect(nameOf(s, s.players.p2?.library[0] as string)).toBe("Shivan Dragon");
    // Deux Plaines payent {1}{R} : mana de n'importe quel type.
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Gwenom : en attaquant, les cartes du dessus de votre bibliothèque se jouent ; un sort se paie en PV égaux à sa VM", () => {
    let s = scenario({ p1: { battlefield: ["Gwenom, Remorseless"], library: ["Serra Angel", "Forest", "Island"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Gwenom, Remorseless"), defender: "p2" }],
    });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    const angel = s.players.p1?.library[0] as string;
    expect(nameOf(s, angel)).toBe("Serra Angel");
    expect(playable(s, "p1", angel)).toBe(true);
    // Lien de vie : 4 blessures, +4 PV ; le Serra Angel coûte 5 PV.
    const life = s.players.p1?.life ?? 0;
    s = settle(act(s, "p1", { type: "cast", card: angel }));
    expect(s.players.p1?.life).toBe(life - 5);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    const forest = s.players.p1?.library[0] as string;
    s = act(s, "p1", { type: "playLand", card: forest });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
  });
});
