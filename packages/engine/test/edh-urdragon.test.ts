/**
 * Commander (pseudo-ensemble EDH) : tests de règles du deck The Ur-Dragon (Dragons, cinq couleurs). Éminence, Dragons
 * qui arrivent ou attaquent, mana (créatures, artefacts, terrains), contresorts et sorts de masse.
 */
import { describe, expect, it } from "vitest";
import { fx, triggered, when } from "../src/dsl";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  castable,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const life = (s: GameState, p: PlayerId) => s.players[p]?.life ?? 0;
const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const tokens = (s: GameState, player: PlayerId, name?: string) =>
  s.battlefield.filter(
    (id) => s.objects[id]?.isToken && s.objects[id]?.controller === player && (!name || nameOf(s, id) === name),
  );
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const castIt = (s: GameState, p: PlayerId, name: string, targets?: Record<string, string[]>) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...(targets ? { targets } : {}) });
/** Engage une source de mana du champ de bataille de p1. */
const tap = (s: GameState, name: string, ability = 0, color?: string) =>
  act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", name), ability, ...(color ? { color } : {}) } as never);
/** Active la première capacité activée proposée pour la source nommée de p1. */
const activate = (s: GameState, name: string, targets?: Record<string, string[]>) => {
  const source = idOf(s, "p1", "battlefield", name);
  const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
  if (o?.type !== "activate") throw new Error(`pas de capacité pour ${name}`);
  return act(s, "p1", { type: "activate", source, ability: o.ability, ...(targets ? { targets } : {}) });
};
/** Toujours « oui » aux questions « vous pouvez ». */
const yes = (req: { type: string; intent?: string }) => (req.type === "yesNo" ? [1] : undefined);

describe("The Ur-Dragon (EDH)", () => {
  describe("commandant", () => {
    it("éminence : depuis la zone de commandement, vos autres sorts de Dragon coûtent {1} de moins", () => {
      const s = scenario({ p1: { command: ["The Ur-Dragon"], battlefield: lands("Mountain", 5), hand: ["Shivan Dragon"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"))).toBe(true);
      const without = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Shivan Dragon"] } });
      expect(castable(without, "p1", idOf(without, "p1", "hand", "Shivan Dragon"))).toBe(false);
      // Un sort qui n'est pas un Dragon ne profite pas de la réduction.
      const bear = scenario({ p1: { command: ["The Ur-Dragon"], battlefield: lands("Forest", 1), hand: ["Bear Cub"] } });
      expect(castable(bear, "p1", idOf(bear, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("des Dragons attaquent : piochez autant de cartes, puis un permanent de votre main sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: ["The Ur-Dragon", "Shivan Dragon"],
          hand: ["Gigantosaurus"],
          library: ["Opt", "Opt", "Opt"],
        },
      });
      const before = hand(s, "p1");
      s = attack(s, [idOf(s, "p1", "battlefield", "The Ur-Dragon"), idOf(s, "p1", "battlefield", "Shivan Dragon")]);
      s = settle(s, (req, _p, cur) => picking(idsOf(cur, "p1", "hand", "Gigantosaurus"))(req));
      expect(onField(s, "p1", "Gigantosaurus")).toBe(1);
      // Deux cartes piochées, une mise sur le champ de bataille.
      expect(hand(s, "p1")).toBe(before + 2 - 1);
    });
  });

  describe("mana", () => {
    it("Selvala : X mana de la plus grande force ; une créature plus forte que toutes les autres fait piocher son contrôleur", () => {
      let s = scenario({
        p1: { battlefield: ["Selvala, Heart of the Wilds", "Forest", "Gigantosaurus"], library: ["Opt"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"], library: ["Opt"] },
      });
      s = activate(s, "Selvala, Heart of the Wilds");
      // Répartition des couleurs (suggestion) ; la priorité reste à p1.
      while (s.pending?.kind === "choice") s = act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
      const pool = Object.values(s.players.p1?.manaPool ?? {}) as number[];
      expect(pool.reduce((n, v) => n + v, 0)).toBe(10);
      // Bear Cub (2) n'est pas plus forte que Gigantosaurus : pas de pioche.
      const opp = scenario({
        active: "p2",
        p1: { battlefield: ["Selvala, Heart of the Wilds", "Gigantosaurus"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"], library: ["Opt"] },
      });
      const h = hand(opp, "p2");
      const after = settle(castIt(opp, "p2", "Bear Cub"), yes);
      expect(hand(after, "p2")).toBe(h - 1);
      // Gigantosaurus arrive alors que la plus forte est Selvala (2) : son contrôleur peut piocher.
      let big = scenario({
        p1: { battlefield: ["Selvala, Heart of the Wilds", ...lands("Forest", 5)], hand: ["Gigantosaurus"], library: ["Opt"] },
      });
      const h1 = hand(big, "p1");
      big = settle(castIt(big, "p1", "Gigantosaurus"), yes);
      expect(hand(big, "p1")).toBe(h1 - 1 + 1);
    });

    it("Mana Vault : ne se dégage pas ; à l'entretien, {4} pour le dégager ; engagé à l'étape de pioche, 1 blessure", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Mana Vault"] } });
      const vault = idOf(s, "p1", "battlefield", "Mana Vault");
      const v = s.objects[vault];
      if (v) v.tapped = true;
      const before = life(s, "p1");
      // Tour de p1 : pas de dégagement ; « payer {4} ? » : non ; la pioche inflige 1 blessure.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority", 600);
      expect(s.objects[vault]?.tapped).toBe(true);
      expect(life(s, "p1")).toBe(before - 1);
    });

    it("Mana Vault : payer {4} à l'entretien le dégage", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Mana Vault", ...lands("Island", 4)] } });
      const vault = idOf(s, "p1", "battlefield", "Mana Vault");
      const v = s.objects[vault];
      if (v) v.tapped = true;
      const before = life(s, "p1");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.pending?.kind === "choice", 600);
      s = settle(s, yes);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority", 600);
      expect(s.objects[vault]?.tapped).toBe(false);
      expect(life(s, "p1")).toBe(before);
    });

    it("Mox Diamond : défausser une carte de terrain le garde ; sans terrain, il est sacrifié", () => {
      let s = scenario({ p1: { hand: ["Mox Diamond", "Forest"] } });
      s = settle(castIt(s, "p1", "Mox Diamond"), (req, _p, cur) => picking(idsOf(cur, "p1", "hand", "Forest"))(req));
      expect(onField(s, "p1", "Mox Diamond")).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      let none = scenario({ p1: { hand: ["Mox Diamond", "Opt"] } });
      none = settle(castIt(none, "p1", "Mox Diamond"));
      expect(onField(none, "p1", "Mox Diamond")).toBe(0);
      expect(idsOf(none, "p1", "graveyard", "Mox Diamond")).toHaveLength(1);
    });

    it("Mox Diamond (PLAN-H H9) : sans terrain défaussé, il n'arrive jamais (« quand un artefact arrive » ne se déclenche pas)", () => {
      const WATCH = customCard({
        name: "Guetteur d'artefacts",
        types: ["Enchantment"],
        typeLine: "Enchantment",
        abilities: [
          triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.gainLife(1)], { label: "Vous gagnez 1 PV" }),
        ],
      });
      let none = scenario({ p1: { battlefield: [WATCH], hand: ["Mox Diamond", "Opt"] } });
      none = settle(castIt(none, "p1", "Mox Diamond"));
      expect([onField(none, "p1", "Mox Diamond"), life(none, "p1")]).toEqual([0, 20]);
      let kept = scenario({ p1: { battlefield: [WATCH], hand: ["Mox Diamond", "Forest"] } });
      kept = settle(castIt(kept, "p1", "Mox Diamond"), (req, _p, cur) => picking(idsOf(cur, "p1", "hand", "Forest"))(req));
      expect([onField(kept, "p1", "Mox Diamond"), life(kept, "p1")]).toEqual([1, 21]);
    });

    it("Arena of Glory : engagée sans Montagne ; épuisée, {R}{R} qui donne la célérité à une créature", () => {
      let s = scenario({ p1: { hand: ["Arena of Glory"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Arena of Glory") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Arena of Glory")]?.tapped).toBe(true);
      let h = scenario({ p1: { battlefield: ["Arena of Glory", "Mountain", "Mountain"] } });
      const arena = idOf(h, "p1", "battlefield", "Arena of Glory");
      h = act(h, "p1", { type: "tapForMana", source: idOf(h, "p1", "battlefield", "Mountain"), ability: 0 } as never);
      h = activate(h, "Arena of Glory");
      expect(h.objects[arena]?.exerted).toBe(true);
      expect(h.players.p1?.restrictedMana?.map((m) => m.type)).toEqual(["R", "R"]);
      // Le mana de l'Arène lance Axgard Cavalry ({1}{R}) : elle a la célérité.
      let c = scenario({ p1: { battlefield: ["Arena of Glory", "Mountain"], hand: ["Axgard Cavalry"] } });
      c = act(c, "p1", { type: "tapForMana", source: idOf(c, "p1", "battlefield", "Mountain"), ability: 0 } as never);
      c = activate(c, "Arena of Glory");
      c = settle(castIt(c, "p1", "Axgard Cavalry"));
      const cavalry = idOf(c, "p1", "battlefield", "Axgard Cavalry");
      expect(chars(c, cavalry).keywords).toContain("haste");
    });

    it("Klauth : X mana (force totale des attaquants), seulement pour des sorts, gardé jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Klauth, Unrivaled Ancient", "Shivan Dragon"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Klauth, Unrivaled Ancient"), idOf(s, "p1", "battlefield", "Shivan Dragon")]);
      s = throughCombat(s);
      // 4 + 5 = 9 mana, encore là à la seconde phase principale.
      expect(s.turn.step).toBe("main2");
      expect(s.players.p1?.restrictedMana).toHaveLength(9);
      expect(s.players.p1?.restrictedMana?.every((m) => m.keep && m.restriction)).toBe(true);
      // Il disparaît au tour suivant.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "priority", 600);
      expect(s.players.p1?.restrictedMana ?? []).toEqual([]);
    });

    it("Chromatic Orrery : {C}{C}{C}{C}{C}, et ce mana paie des coûts colorés", () => {
      const s = scenario({ p1: { battlefield: ["Chromatic Orrery"], hand: ["Savannah Lions", "Shivan Dragon"] } });
      expect(manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Chromatic Orrery")).some((m) => m.amount === 5)).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(true);
      // Shivan Dragon coûte 6 : l'Orrery seul n'en donne que 5.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"))).toBe(false);
    });

    it("City of Brass : engagée pour du mana, elle vous inflige 1 blessure ; Forbidden Orchard : un Esprit pour un adversaire", () => {
      let s = scenario({ p1: { battlefield: ["City of Brass", "Forbidden Orchard"] } });
      const before = life(s, "p1");
      s = settle(tap(tap(s, "City of Brass", 0, "G"), "Forbidden Orchard", 0, "U"));
      expect(life(s, "p1")).toBe(before - 1);
      expect(tokens(s, "p2", "Spirit")).toHaveLength(1);
    });

    it("Horizon of Progress : 1 PV pour un mana qu'un de vos terrains pourrait produire", () => {
      const s = scenario({ p1: { battlefield: ["Horizon of Progress", "Island", "Swamp"] } });
      const produced = manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Horizon of Progress")).flatMap((m) => m.produce);
      expect([...new Set(produced)].sort()).toEqual(["B", "U"]);
      const before = life(s, "p1");
      const after = tap(s, "Horizon of Progress", 0, "U");
      expect(life(after, "p1")).toBe(before - 1);
    });
  });

  describe("sorts", () => {
    it("Stubborn Denial : contrecarre sauf si {1} est payé ; férocité : contrecarre sans condition", () => {
      const setup = (withBig: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Island", ...(withBig ? ["Gigantosaurus"] : [])], hand: ["Stubborn Denial"] },
          p2: { battlefield: lands("Mountain", 2), hand: ["Shock"] },
        });
        s = castIt(s, "p2", "Shock", { t: ["p1"] });
        s = act(s, "p2", { type: "pass" });
        s = castIt(s, "p1", "Stubborn Denial", { t: [s.stack[0]?.id as string] });
        return settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      };
      // p2 paie {1} avec sa seconde Montagne : Shock se résout.
      expect(life(setup(false), "p1")).toBe(18);
      expect(life(setup(true), "p1")).toBe(20);
    });

    it("Swan Song : contrecarre un éphémère ; son contrôleur crée un Oiseau 2/2 volant", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Island"], hand: ["Swan Song"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      s = castIt(s, "p2", "Shock", { t: ["p1"] });
      s = act(s, "p2", { type: "pass" });
      s = settle(castIt(s, "p1", "Swan Song", { t: [s.stack[0]?.id as string] }));
      expect(life(s, "p1")).toBe(20);
      const bird = tokens(s, "p2", "Bird")[0] ?? "";
      expect(s.objects[bird]?.defId).toBeDefined();
    });

    it("Crux of Fate : détruit les Dragons, ou toutes les créatures non-Dragon", () => {
      const field = { p1: { battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Swamp", 5)], hand: ["Crux of Fate"] } };
      let a = scenario(field);
      a = settle(act(a, "p1", { type: "cast", card: idOf(a, "p1", "hand", "Crux of Fate"), mode: 0 } as never));
      expect([onField(a, "p1", "Shivan Dragon"), onField(a, "p1", "Bear Cub")]).toEqual([0, 1]);
      let b = scenario(field);
      b = settle(act(b, "p1", { type: "cast", card: idOf(b, "p1", "hand", "Crux of Fate"), mode: 1 } as never));
      expect([onField(b, "p1", "Shivan Dragon"), onField(b, "p1", "Bear Cub")]).toEqual([1, 0]);
    });

    it("Majestic Genesis : X cartes du dessus (X : la valeur de mana de votre commandant), les permanents choisis arrivent", () => {
      let s = scenario({
        p1: {
          command: ["Sol Ring"],
          battlefield: lands("Forest", 8),
          hand: ["Majestic Genesis"],
          library: ["Bear Cub", "Opt", "Savannah Lions"],
        },
      });
      // Commandant de test : Sol Ring (valeur de mana 1) : une seule carte révélée.
      s = settle(castIt(s, "p1", "Majestic Genesis"), (req) => (req.type === "pick" ? req.options : undefined));
      expect(onField(s, "p1", "Bear Cub") + onField(s, "p1", "Savannah Lions")).toBe(1);
    });
  });

  describe("Dragons", () => {
    it("Scourge of Valkas : un Dragon arrive, il inflige X blessures (X : vos Dragons)", () => {
      let s = scenario({ p1: { battlefield: ["Scourge of Valkas", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
      s = settle(castIt(s, "p1", "Shivan Dragon"), (req) => picking(["p2"])(req));
      // Deux Dragons : 2 blessures à p2 (de Shivan Dragon, qui arrive).
      expect(life(s, "p2")).toBe(18);
    });

    it("Dragon Tempest : une créature volante arrive avec la célérité", () => {
      let s = scenario({ p1: { battlefield: ["Dragon Tempest", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
      s = settle(castIt(s, "p1", "Shivan Dragon"), (req) => picking(["p2"])(req));
      const shivan = idOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(s.effects.some((e) => e.affected.includes(shivan) && e.addKeywords?.includes("haste"))).toBe(true);
      expect(life(s, "p2")).toBe(19);
    });

    it("Goldspan Dragon : un Trésor quand il attaque ; vos Trésors donnent deux mana d'une même couleur", () => {
      let s = scenario({ p1: { battlefield: ["Goldspan Dragon"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Goldspan Dragon")]);
      s = settle(s);
      const treasure = tokens(s, "p1", "Treasure")[0] ?? "";
      expect(treasure).not.toBe("");
      expect(manaAbilitiesOf(s, treasure).some((m) => m.amount === 2)).toBe(true);
    });

    it("Hellkite Courser : votre commandant arrive de la zone de commandement avec la célérité, puis y retourne", () => {
      let s = scenario({ p1: { command: ["Bear Cub"], battlefield: lands("Mountain", 6), hand: ["Hellkite Courser"] } });
      s = settle(castIt(s, "p1", "Hellkite Courser"), yes);
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.effects.some((e) => e.affected.includes(cub) && e.addKeywords?.includes("haste"))).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "priority", 600);
      expect(onField(s, "p1", "Bear Cub")).toBe(0);
      expect(s.players.p1?.command.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    });

    it("Miirym : un autre Dragon non-jeton arrive, un jeton copie non légendaire", () => {
      let s = scenario({
        p1: { battlefield: ["Miirym, Sentinel Wyrm", ...lands("Mountain", 7)], hand: ["Ganax, Astral Hunter"] },
      });
      s = settle(castIt(s, "p1", "Ganax, Astral Hunter"));
      expect(onField(s, "p1", "Ganax, Astral Hunter")).toBe(2);
      const copy = idsOf(s, "p1", "battlefield", "Ganax, Astral Hunter").find((id) => s.objects[id]?.isToken) ?? "";
      expect(s.objects[copy]).toBeDefined();
      // Ganax : chaque Dragon qui arrive crée un Trésor (lui, puis la copie : deux Ganax voient la copie arriver).
      expect(tokens(s, "p1", "Treasure").length).toBeGreaterThanOrEqual(2);
    });

    it("Korvold : en arrivant, sacrifiez un autre permanent ; chaque sacrifice : marqueur +1/+1 et pioche", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Swamp", "Mountain", "Forest", "Forest", "Forest"],
          hand: ["Korvold, Fae-Cursed King"],
          library: ["Opt"],
        },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Korvold, Fae-Cursed King"), (req, _p, cur) =>
        picking(idsOf(cur, "p1", "battlefield", "Bear Cub"))(req),
      );
      const korvold = idOf(s, "p1", "battlefield", "Korvold, Fae-Cursed King");
      expect(onField(s, "p1", "Bear Cub")).toBe(0);
      expect(s.objects[korvold]?.counters["+1/+1"]).toBe(1);
      expect(hand(s, "p1")).toBe(h - 1 + 1);
    });

    it("Cavern-Hoard Dragon : coûte {X} de moins, X étant le plus grand nombre d'artefacts d'un adversaire", () => {
      const s = scenario({
        players: 3,
        p1: { battlefield: lands("Mountain", 5), hand: ["Cavern-Hoard Dragon"] },
        p2: { battlefield: ["Sol Ring"] },
        p3: { battlefield: ["Sol Ring", "Sol Ring", "Sol Ring", "Sol Ring"] },
      });
      // {7}{R}{R} − 4 = 5 mana.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Cavern-Hoard Dragon"))).toBe(true);
      const two = scenario({
        players: 3,
        p1: { battlefield: lands("Mountain", 5), hand: ["Cavern-Hoard Dragon"] },
        p2: { battlefield: ["Sol Ring", "Sol Ring", "Sol Ring"] },
        p3: { battlefield: ["Sol Ring", "Sol Ring", "Sol Ring"] },
      });
      expect(castable(two, "p1", idOf(two, "p1", "hand", "Cavern-Hoard Dragon"))).toBe(false);
    });

    it("Dragonlord Kolaghan : un adversaire lance une créature du nom d'une carte de son cimetière, il perd 10 PV", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Dragonlord Kolaghan"] },
        p2: { battlefield: lands("Forest", 4), hand: ["Bear Cub", "Llanowar Elves"], graveyard: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p2", "Llanowar Elves"));
      expect(life(s, "p2")).toBe(20);
      s = settle(castIt(s, "p2", "Bear Cub"));
      expect(life(s, "p2")).toBe(10);
    });

    it("Dragonlord Dromoka : vos adversaires ne lancent pas de sorts pendant votre tour", () => {
      const s = scenario({
        p1: { battlefield: ["Dragonlord Dromoka"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Shock"))).toBe(false);
    });

    it("Tiamat : lancée, jusqu'à cinq cartes de Dragon de noms différents, pas Tiamat", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Plains", 1),
            ...lands("Island", 1),
            ...lands("Swamp", 1),
            ...lands("Mountain", 2),
            ...lands("Forest", 2),
          ],
          hand: ["Tiamat"],
          library: ["Shivan Dragon", "Shivan Dragon", "Tiamat", "Goldspan Dragon", "Bear Cub"],
        },
      });
      s = settle(castIt(s, "p1", "Tiamat"), (req) => (req.type === "pick" ? req.options.slice(0, req.max) : undefined));
      const names = s.players.p1?.hand.map((id) => nameOf(s, id)).sort();
      expect(names).toEqual(["Goldspan Dragon", "Shivan Dragon"]);
    });

    it("Goldlust Triad : myriade, une copie attaque chacun des autres adversaires puis est exilée à la fin du combat", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Goldlust Triad"] } });
      const triad = idOf(s, "p1", "battlefield", "Goldlust Triad");
      s = attackPlayer(s, [triad], "p2");
      const attacked = new Set<string>();
      for (let i = 0; i < 50 && s.turn.step !== "main2"; i++) {
        for (const a of s.combat?.attackers ?? []) attacked.add(a.defender);
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: yes(p.request) ?? p.request.suggested });
        else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
        else break;
      }
      expect([...attacked].sort()).toEqual(["p2", "p3"]);
      expect(tokens(s, "p1", "Goldlust Triad")).toEqual([]);
      // Chacune a blessé son joueur : deux Trésors.
      expect(tokens(s, "p1", "Treasure")).toHaveLength(2);
    });

    it("Zurgo and Ojutai : défense talismanique le tour de son arrivée seulement", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 1), ...lands("Mountain", 1), ...lands("Plains", 3)], hand: ["Zurgo and Ojutai"] },
      });
      s = settle(castIt(s, "p1", "Zurgo and Ojutai"));
      const z = idOf(s, "p1", "battlefield", "Zurgo and Ojutai");
      expect(chars(s, z).keywords).toContain("hexproof");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "priority", 600);
      expect(chars(s, z).keywords).not.toContain("hexproof");
    });

    it("Ganax et Draconic Visitor : boucle obligatoire qui accumule des Dragons, la partie est nulle (104.4b)", () => {
      let s = scenario({
        p1: { battlefield: ["Ganax, Astral Hunter", "Draconic Visitor", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] },
      });
      s = settle(castIt(s, "p1", "Shivan Dragon"));
      expect(s.over).toBe(true);
      expect(s.winner ?? null).toBe(null);
      // Arrêtée tôt : quelques Dragons seulement.
      expect(tokens(s, "p1", "Dragon").length).toBeLessThan(40);
    });

    it("chaîne finie (des Faerie Dragons qui déclenchent Ganax un par un) : pas de partie nulle", () => {
      let s = scenario({ p1: { battlefield: ["Ganax, Astral Hunter", "Ancient Gold Dragon"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Ancient Gold Dragon")]));
      expect(s.over).toBe(false);
      const faeries = tokens(s, "p1", "Faerie Dragon").length;
      expect(faeries).toBeGreaterThan(0);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(faeries);
    });

    it("Old Gnawbone : une créature vous fait des blessures de combat, autant de Trésors", () => {
      let s = scenario({ p1: { battlefield: ["Old Gnawbone", "Bear Cub"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(2);
    });

    it("Ureni : en arrivant, huit cartes du dessus ; une carte de créature Dragon sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), "Island", "Mountain"],
          hand: ["Ureni of the Unwritten"],
          library: ["Opt", "Shivan Dragon", "Bear Cub"],
        },
      });
      s = settle(castIt(s, "p1", "Ureni of the Unwritten"), (req, _p, cur) =>
        picking(cur.players.p1?.library.filter((id) => nameOf(cur, id) === "Shivan Dragon") ?? [])(req),
      );
      expect(onField(s, "p1", "Shivan Dragon")).toBe(1);
    });

    it("Steely Resolve : les créatures du type choisi ont la défense totale, celles des adversaires aussi", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Forest", "Bear Cub"], hand: ["Steely Resolve"] },
        p2: { battlefield: ["Bear Cub", "Mountain"], hand: ["Shock"] },
      });
      s = settle(castIt(s, "p1", "Steely Resolve"), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      const cubs = [...idsOf(s, "p1", "battlefield", "Bear Cub"), ...idsOf(s, "p2", "battlefield", "Bear Cub")];
      for (const id of cubs) expect(chars(s, id).keywords).toContain("shroud");
    });

    it("Kiora : une créature de force 4 ou plus arrive, piochez ; −1 : dégagez un permanent", () => {
      let s = scenario({
        p1: { battlefield: ["Kiora, Behemoth Beckoner", ...lands("Forest", 5)], hand: ["Gigantosaurus"], library: ["Opt"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Gigantosaurus"));
      expect(hand(s, "p1")).toBe(h - 1 + 1);
      const forest = idOf(s, "p1", "battlefield", "Forest");
      expect(s.objects[forest]?.tapped).toBe(true);
      s = settle(activate(s, "Kiora, Behemoth Beckoner", { t: [forest] }));
      expect(s.objects[forest]?.tapped).toBe(false);
    });
  });
});

describe("myriade en multijoueur (PLAN-H, lot H5)", () => {
  it("Goldlust Triad : pour chaque autre adversaire, vous pouvez créer une copie qui attaque ce joueur ou un de ses planeswalkers", () => {
    let s = scenario({
      players: 4,
      p1: { battlefield: ["Goldlust Triad"] },
      p3: { battlefield: ["Ajani Resolute"] },
    });
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Goldlust Triad")], "p2");
    const asked: { options: string[]; min: number }[] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick" || req.intent !== "other") return undefined;
      asked.push({ options: [...req.options].sort(), min: req.min });
      // Pour p3 : son planeswalker ; pour p4 : pas de copie.
      return req.options.includes(walker) ? [walker] : [];
    });
    // Une question par adversaire autre que le joueur défenseur, chacune facultative.
    expect(asked).toEqual([
      { options: ["p3", walker].sort(), min: 0 },
      { options: ["p4"], min: 0 },
    ]);
    const copies = tokens(s, "p1", "Goldlust Triad");
    expect(copies.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender)).toEqual([walker]);
  });
});
