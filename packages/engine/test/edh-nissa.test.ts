/**
 * Commander (pseudo-ensemble EDH) : tests de règles du deck « Nissa, Non-Green Animist » (Nissa, Leyline Tamer).
 * Toucheterre, terrains rejoués, dessus de bibliothèque remis dans l'ordre choisi, arrivées doublées ou muettes (Elesh
 * Norn), canalisation, contrôle volé.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  canActivate,
  castable,
  castNowOf,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  picking,
  scenario,
  settle,
  steal,
  untilCastNow,
} from "./helpers";

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const handNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const libraryNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.library);
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const playLand = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "playLand", card: idOf(s, p, "hand", name), ...extra } as never);
const activations = (s: GameState, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Active la capacité de rang `index` (dans la définition) de cette source. */
const activate = (s: GameState, p: PlayerId, source: ObjectId, index?: number, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => index === undefined || a.ability === index);
  if (!o) throw new Error(`pas de capacité ${index ?? ""} pour ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const plusOne = (s: GameState, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
/** Répond aux questions d'ordre par les cartes nommées (la première sera piochée en premier). */
const ordering =
  (names: string[]) =>
  (req: ChoiceRequest, _p: PlayerId, s: GameState): (string | number)[] | undefined => {
    if (req.type !== "order") return undefined;
    const left = [...req.items];
    return names.map((n) => {
      const i = left.findIndex((id) => nameOf(s, id) === n);
      return left.splice(i, 1)[0] as string;
    });
  };
/** Choisit le mode dont le libellé est donné (capacité déclenchée modale). */
const modeNamed = (label: string) => (req: ChoiceRequest) =>
  req.type === "pick" && req.intent === "triggerMode"
    ? Object.entries(req.labels ?? {})
        .filter(([, l]) => l === label)
        .map(([k]) => k)
    : undefined;

describe("Nissa, Leyline Tamer (EDH)", () => {
  describe("toucheterre", () => {
    it("Emeria Angel : vous pouvez créer un Oiseau 1/1 avec le vol à chaque terrain", () => {
      let s = scenario({ p1: { battlefield: ["Emeria Angel"], hand: ["Plains"] } });
      s = settle(playLand(s, "p1", "Plains"));
      const birds = s.battlefield.filter((id) => s.objects[id]?.isToken && nameOf(s, id) === "Bird");
      expect(birds).toHaveLength(1);
      expect(chars(s, birds[0] ?? "").keywords).toContain("flying");
      // « Vous pouvez » : refusé, pas d'Oiseau.
      let t = scenario({ p1: { battlefield: ["Emeria Angel"], hand: ["Plains"] } });
      t = settle(playLand(t, "p1", "Plains"), (req) => (req.type === "yesNo" ? [0] : undefined));
      expect(t.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(0);
    });

    it("Emeria Shepherd : une carte de permanent non-terrain revient en main, ou sur le champ de bataille avec une Plaine", () => {
      const start = () =>
        scenario({ p1: { battlefield: ["Emeria Shepherd"], hand: ["Plains", "Island"], graveyard: ["Bear Cub", "Shock"] } });
      // Une Île : en main seulement (un éphémère n'est pas une carte de permanent).
      let s = start();
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const shock = idOf(s, "p1", "graveyard", "Shock");
      s = playLand(s, "p1", "Island");
      // Seule cible possible : Bear Cub (un éphémère n'est pas une carte de permanent).
      expect(s.stack[0]?.targets).toEqual({ t: [bear] });
      expect(s.stack[0]?.targets.t).not.toContain(shock);
      s = settle(s);
      expect(handNames(s, "p1")).toEqual(["Bear Cub", "Plains"]);
      // Une Plaine : au choix, sur le champ de bataille.
      let t = start();
      t = settle(playLand(t, "p1", "Plains"));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      // Ou dans la main.
      let u = start();
      u = settle(playLand(u, "p1", "Plains"), (r) => (r.type === "pick" && r.intent !== "triggerTarget" ? ["1"] : undefined));
      expect(idsOf(u, "p1", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Gandalf, Shadow's Foe : jusqu'à trois terrains exilés reviennent engagés ; chaque arrivée pioche et met un marqueur", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 7), "Plains"],
          hand: ["Gandalf, Shadow's Foe"],
          library: lands("Forest", 10),
        },
      });
      const isles = idsOf(s, "p1", "battlefield", "Island").slice(0, 3);
      s = castIt(s, "p1", "Gandalf, Shadow's Foe");
      s = settle(s, picking(isles));
      const gandalf = idOf(s, "p1", "battlefield", "Gandalf, Shadow's Foe");
      // Trois Îles reviennent engagées (de nouveaux objets) : trois toucheterres.
      expect(plusOne(s, gandalf)).toBe(3);
      expect(hand(s, "p1")).toBe(3);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(7);
      expect(idsOf(s, "p1", "battlefield", "Plains").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Geode Rager : chaque créature du joueur ciblé est provoquée", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Geode Rager"], hand: ["Mountain"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
        p3: { battlefield: ["Bear Cub"] },
      });
      s = settle(playLand(s, "p1", "Mountain"), picking(["p2"]));
      const goaded = (p: PlayerId) =>
        s.battlefield.filter((id) => s.objects[id]?.controller === p && chars(s, id).blockRules?.some((b) => b.goadedBy));
      expect(goaded("p2")).toHaveLength(2);
      expect(goaded("p3")).toHaveLength(0);
    });

    it("Ob Nixilis, the Fallen : le joueur ciblé perd 3 PV et Ob Nixilis reçoit trois marqueurs +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Ob Nixilis, the Fallen"], hand: ["Swamp"] } });
      s = settle(playLand(s, "p1", "Swamp"), picking(["p2"]));
      expect(s.players.p2?.life).toBe(17);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Ob Nixilis, the Fallen"))).toBe(3);
      // « Si vous le faites » : refusé, ni perte ni marqueur.
      let t = scenario({ p1: { battlefield: ["Ob Nixilis, the Fallen"], hand: ["Swamp"] } });
      t = settle(playLand(t, "p1", "Swamp"), (req) => (req.type === "yesNo" ? [0] : picking(["p2"])(req)));
      expect([t.players.p2?.life, plusOne(t, idOf(t, "p1", "battlefield", "Ob Nixilis, the Fallen"))]).toEqual([20, 0]);
    });

    it("Roil Elemental : la créature volée revient quand vous ne contrôlez plus Roil Elemental", () => {
      let s = scenario({
        p1: { battlefield: ["Roil Elemental", "Mountain"], hand: ["Island", "Shock"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(playLand(s, "p1", "Island"), picking([bear]));
      expect(s.objects[bear]?.controller).toBe("p1");
      // Roil Elemental meurt : l'effet prend fin.
      const roil = idOf(s, "p1", "battlefield", "Roil Elemental");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [roil] } }));
      expect(idsOf(s, "p1", "graveyard", "Roil Elemental")).toHaveLength(1);
      expect(s.objects[bear]?.controller).toBe("p2");
    });

    it("Ruin Crab : chaque adversaire meule trois cartes", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Ruin Crab"], hand: ["Island"] } });
      s = settle(playLand(s, "p1", "Island"));
      expect([s.players.p1?.graveyard.length, s.players.p2?.graveyard.length, s.players.p3?.graveyard.length]).toEqual([0, 3, 3]);
    });

    it("Retreat to Coralhelm : dégager une créature ciblée, ou regard 1", () => {
      let s = scenario({
        p1: { battlefield: ["Retreat to Coralhelm", { name: "Bear Cub", tapped: true }], hand: ["Island", "Plains"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        playLand(s, "p1", "Island"),
        (req) => modeNamed("You may tap or untap target creature")(req) ?? picking([bear])(req),
      );
      expect(s.objects[bear]?.tapped).toBe(false);
      // Regard 1 : la carte du dessus va au-dessous.
      const top = s.players.p1?.library[0];
      s.turn.landsPlayed = 0;
      s = settle(
        act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }),
        (req) => modeNamed("Scry 1")(req) ?? (req.type === "pick" && req.intent === "scryBottom" ? req.options : undefined),
      );
      expect(s.players.p1?.library.at(-1)).toBe(top);
    });

    it("Retreat to Hagra : chaque adversaire perd 1 PV et vous en gagnez 1 ; ou +1/+0 et le contact mortel", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Retreat to Hagra", "Bear Cub"], hand: ["Swamp", "Plains"] } });
      s = settle(playLand(s, "p1", "Swamp"), modeNamed("Each opponent loses 1 life; you gain 1 life"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([21, 19, 19]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.turn.landsPlayed = 0;
      s = settle(
        playLand(s, "p1", "Plains"),
        (req) => modeNamed("Target creature gets +1/+0 and gains deathtouch")(req) ?? picking([bear])(req),
      );
      expect([chars(s, bear).power, chars(s, bear).keywords.includes("deathtouch")]).toEqual([3, true]);
    });

    it("Valakut Exploration : la carte exilée se joue tant qu'elle reste exilée ; à l'étape de fin, au cimetière et blessures", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Valakut Exploration"], hand: ["Mountain"], library: ["Shock", "Forest", "Island", "Island"] },
      });
      s = settle(playLand(s, "p1", "Mountain"));
      const shock = s.exile.find((id) => nameOf(s, id) === "Shock") ?? "";
      expect(shock).not.toBe("");
      expect(castable(s, "p1", shock)).toBe(true);
      // Le Shock reste exilé jusqu'à l'étape de fin : au cimetière, 1 blessure à chaque adversaire.
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s);
      expect(idsOf(s, "p1", "graveyard", "Shock")).toHaveLength(1);
      expect([s.players.p2?.life, s.players.p3?.life, s.players.p1?.life]).toEqual([19, 19, 20]);
    });

    it("Valakut Exploration : un terrain exilé se joue comme terrain du tour (nouveau toucheterre) ; le reste va au cimetière", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: ["Valakut Exploration", "Wayfarer's Bauble", "Island", "Island"],
          library: ["Forest", "Plains", "Shock", "Opt", "Island"],
        },
      });
      // Wayfarer's Bauble : une Plaine arrive (toucheterre), la carte du dessus (après mélange) est exilée.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Wayfarer's Bauble")));
      const first = s.exile.filter((id) => s.objects[id]?.owner === "p1");
      expect(first).toHaveLength(1);
      const land = s.exile.find(
        (id) => s.objects[id]?.owner === "p1" && (s.defs[s.objects[id]?.defId ?? ""]?.types ?? []).includes("Land"),
      );
      if (land) {
        // Un terrain exilé ainsi se joue (terrain du tour) : un nouveau toucheterre exile une autre carte.
        expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === land)).toBe(true);
        s = settle(act(s, "p1", { type: "playLand", card: land } as never));
        expect(s.exile.filter((id) => s.objects[id]?.owner === "p1")).toHaveLength(1);
      }
      // À l'étape de fin, chaque carte encore exilée va au cimetière : 1 blessure par carte à chaque adversaire.
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s);
      expect(s.exile.filter((id) => s.objects[id]?.owner === "p1")).toHaveLength(0);
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
    });
  });

  describe("arrivées : Elesh Norn, Mother of Machines", () => {
    it("vos capacités déclenchées par une arrivée se déclenchent une fois de plus (toucheterre compris)", () => {
      let s = scenario({ p1: { battlefield: ["Elesh Norn, Mother of Machines", "Ruin Crab"], hand: ["Island"] } });
      s = settle(playLand(s, "p1", "Island"));
      expect(s.players.p2?.graveyard.length).toBe(6);
    });

    it("les arrivées ne déclenchent pas les capacités des permanents adverses (arrivée et toucheterre)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Elesh Norn, Mother of Machines"] },
        p2: { battlefield: ["Ruin Crab", ...lands("Plains", 4)], hand: ["Plains", "Emeria Angel"] },
      });
      s = settle(playLand(s, "p2", "Plains"));
      expect(s.players.p1?.graveyard.length).toBe(0);
      // Sans Elesh Norn, le Ruin Crab se déclenche.
      let t = scenario({ active: "p2", p2: { battlefield: ["Ruin Crab"], hand: ["Plains"] } });
      t = settle(playLand(t, "p2", "Plains"));
      expect(t.players.p1?.graveyard.length).toBe(3);
    });

    it("la capacité « quand ce permanent arrive » d'un adversaire ne se déclenche pas ; la vôtre deux fois", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Elesh Norn, Mother of Machines"] },
        p2: { battlefield: lands("Swamp", 3), hand: ["Boggart Trawler // Boggart Bog"] },
      });
      s = settle(castIt(s, "p2", "Boggart Trawler // Boggart Bog"));
      expect(s.stack).toEqual([]);
      expect(idsOf(s, "p2", "battlefield", "Boggart Trawler // Boggart Bog")).toHaveLength(1);
      // La vôtre se déclenche deux fois.
      let t = scenario({
        p1: { battlefield: ["Elesh Norn, Mother of Machines", ...lands("Swamp", 3)], hand: ["Boggart Trawler // Boggart Bog"] },
        p2: { graveyard: ["Shock"] },
      });
      t = passAccepting(
        castIt(t, "p1", "Boggart Trawler // Boggart Bog"),
        (x) => x.triggers.length === 0 && x.stack.some((i) => i.kind === "ability"),
      );
      expect(t.stack.filter((x) => x.kind === "ability")).toHaveLength(2);
    });
  });

  describe("grandes créatures", () => {
    it("Agent of Treachery : gagne le contrôle d'un permanent ; trois permanents qui ne sont pas à vous : piochez trois cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 7), hand: ["Agent of Treachery"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions", "Plains"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Agent of Treachery"), picking([bear]));
      expect(s.objects[bear]?.controller).toBe("p1");
      // Un seul permanent volé : pas de pioche à l'étape de fin.
      const before = hand(s, "p1");
      let t = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority");
      expect(t.stack).toEqual([]);
      // Trois permanents qui ne sont pas à vous : trois cartes.
      for (const name of ["Savannah Lions", "Plains"]) s = steal(s, idOf(s, "p2", "battlefield", name), "p1");
      t = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      expect(t.turn.number).toBe(s.turn.number);
      t = settle(t);
      expect(hand(t, "p1")).toBe(before + 3);
    });

    it("Avacyn, Angel of Hope : vos autres permanents ont l'indestructible, pas ceux des adversaires", () => {
      const s = scenario({
        p1: { battlefield: ["Avacyn, Angel of Hope", "Bear Cub", "Plains"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Plains")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Avacyn, Angel of Hope")).keywords).toContain("indestructible");
    });

    it("Crabomination : l'adversaire exile trois cartes ; vous pouvez lancer un sort parmi elles sans payer son coût", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Crabomination"] },
        p2: { hand: ["Bear Cub"], graveyard: ["Forest"], library: ["Shock", "Island"] },
      });
      s = untilCastNow(castIt(s, "p1", "Crabomination"));
      // Le dessus de la bibliothèque, une carte au hasard du cimetière et de la main : les sorts sont proposés, pas le terrain.
      expect(namesIn(s, s.exile).sort()).toEqual(["Bear Cub", "Forest", "Shock"]);
      expect(namesIn(s, castNowOf(s)?.cards).sort()).toEqual(["Bear Cub", "Shock"]);
      const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") ?? "";
      expect(legalActions(s, "p1").find((a) => a.type === "cast" && a.card === bear)).toMatchObject({ free: true });
      s = settle(act(s, "p1", { type: "cast", card: bear, free: true } as never));
      // Un seul sort : le Bear Cub, sous votre contrôle ; le Shock reste exilé.
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, s.exile).sort()).toEqual(["Forest", "Shock"]);
    });

    it("Crabomination : émerger d'un artefact (sacrifié, coût réduit de sa valeur de mana)", () => {
      const s = scenario({ p1: { battlefield: ["Sol Ring", ...lands("Swamp", 6)], hand: ["Crabomination"] } });
      const crab = idOf(s, "p1", "hand", "Crabomination");
      const opts = legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === crab);
      expect(opts.some((a) => a.type === "cast" && a.altAvailable)).toBe(true);
      const t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 6)], hand: ["Crabomination"] } });
      const crab2 = idOf(t, "p1", "hand", "Crabomination");
      // Une créature ne suffit pas : « émerger d'un artefact ».
      expect(legalActions(t, "p1").some((a) => a.type === "cast" && a.card === crab2 && a.altAvailable)).toBe(false);
    });

    it("Hullbreaker Horror : ne peut pas être contrecarré ; vous lancez un sort : renvoyez un sort adverse dans la main", () => {
      // Contresort : la cible est permise, mais le sort n'est pas contrecarré.
      let c = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 7), hand: ["Hullbreaker Horror"] },
        p2: { battlefield: lands("Island", 2), hand: ["Counterspell"] },
      });
      c = advanceUntil(c, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      c = castIt(c, "p1", "Hullbreaker Horror");
      c = act(c, "p1", { type: "pass" });
      const horror = c.stack[0]?.id ?? "";
      c = settle(act(c, "p2", { type: "cast", card: idOf(c, "p2", "hand", "Counterspell"), targets: { t: [horror] } } as never));
      expect(idsOf(c, "p1", "battlefield", "Hullbreaker Horror")).toHaveLength(1);
      // Un sort adverse sur la pile, puis vous lancez un sort : celui de l'adversaire retourne dans sa main.
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Hullbreaker Horror", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never);
      s = act(s, "p2", { type: "pass" } as never);
      const theirs = s.stack[0]?.id ?? "";
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } } as never);
      s = settle(s, (req) => modeNamed("Return a spell you don't control to its owner's hand")(req) ?? picking([theirs])(req));
      expect(handNames(s, "p2")).toEqual(["Shock"]);
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Hullbreaker Horror : ou renvoyez un permanent non-terrain dans la main de son propriétaire", () => {
      let s = scenario({
        p1: { battlefield: ["Hullbreaker Horror", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } } as never);
      s = settle(s, (req) => modeNamed("Return a nonland permanent to its owner's hand")(req) ?? picking([bear])(req));
      expect(handNames(s, "p2")).toEqual(["Bear Cub"]);
    });

    it("Nezahal, Primal Tide : un adversaire lance un sort non-créature, vous piochez ; défaussez trois cartes : il revient engagé", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Nezahal, Primal Tide"], hand: ["Island", "Island", "Island", "Plains"] },
        p2: { battlefield: ["Mountain", "Forest", "Forest"], hand: ["Shock", "Bear Cub"] },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never));
      expect(hand(s, "p1")).toBe(5);
      s = settle(castIt(s, "p2", "Bear Cub"));
      expect(hand(s, "p1")).toBe(5);
      // Défaussez trois cartes : exilé, il revient engagé au début de la prochaine étape de fin.
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      const nez = idOf(s, "p1", "battlefield", "Nezahal, Primal Tide");
      s = activate(s, "p1", nez);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Nezahal, Primal Tide")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s);
      const back = idOf(s, "p1", "battlefield", "Nezahal, Primal Tide");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard.length).toBe(3);
    });

    it("Walking Atlas : {T} : vous pouvez mettre une carte de terrain de votre main sur le champ de bataille (toucheterre)", () => {
      let s = scenario({ p1: { battlefield: ["Walking Atlas", "Ruin Crab"], hand: ["Island", "Bear Cub"] } });
      s.turn.landsPlayed = 1;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Walking Atlas")));
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
      expect(s.players.p2?.graveyard.length).toBe(3);
    });
  });

  describe("dessus de bibliothèque", () => {
    it("Ponder : les trois cartes du dessus remises dans l'ordre choisi, puis pioche", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Ponder"], library: ["Shock", "Opt", "Bear Cub", "Forest"] } });
      s = settle(
        castIt(s, "p1", "Ponder"),
        (req, p, st) => ordering(["Bear Cub", "Shock", "Opt"])(req, p, st) ?? (req.type === "yesNo" ? [0] : undefined),
      );
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(libraryNames(s, "p1")).toEqual(["Shock", "Opt", "Forest"]);
    });

    it("Portent : vous ordonnez le dessus de la bibliothèque du joueur ciblé ; pioche au début du prochain entretien", () => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Portent"] },
        p2: { library: ["Shock", "Opt", "Bear Cub", "Forest"] },
      });
      s = castIt(s, "p1", "Portent", { targets: { p: ["p2"] } });
      s = settle(s, (req, p, st) => {
        if (req.type === "order") expect(p).toBe("p1");
        return ordering(["Opt", "Bear Cub", "Shock"])(req, p, st) ?? (req.type === "yesNo" ? [0] : undefined);
      });
      expect(libraryNames(s, "p2")).toEqual(["Opt", "Bear Cub", "Shock", "Forest"]);
      const before = hand(s, "p1");
      expect(before).toBe(0);
      // Pioche retardée : au début de l'entretien suivant (celui de p2).
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep" && x.stack.length > 0);
      s = settle(s);
      expect(hand(s, "p1")).toBe(1);
    });

    it("Sensei's Divining Top : {1} : ordonner les trois du dessus ; {T} : piochez, puis il va au-dessus de la bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: ["Sensei's Divining Top", "Island"], library: ["Shock", "Opt", "Bear Cub", "Forest"] },
      });
      const top = idOf(s, "p1", "battlefield", "Sensei's Divining Top");
      s = settle(activate(s, "p1", top, 0), ordering(["Bear Cub", "Opt", "Shock"]));
      expect(libraryNames(s, "p1")).toEqual(["Bear Cub", "Opt", "Shock", "Forest"]);
      s = settle(activate(s, "p1", top, 1));
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(libraryNames(s, "p1")[0]).toBe("Sensei's Divining Top");
    });

    it("Scroll Rack : les cartes exilées de la main sont échangées contre autant de cartes du dessus, remises dans l'ordre choisi", () => {
      let s = scenario({
        p1: {
          battlefield: ["Scroll Rack", "Island"],
          hand: ["Plains", "Swamp", "Bear Cub"],
          library: ["Shock", "Opt", "Forest"],
        },
      });
      const keep = idOf(s, "p1", "hand", "Bear Cub");
      const away = (s.players.p1?.hand ?? []).filter((id) => id !== keep);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Scroll Rack")), (req, p, st) =>
        req.type === "pick" && req.intent === "pickCards" ? away : ordering(["Swamp", "Plains"])(req, p, st),
      );
      expect(handNames(s, "p1")).toEqual(["Bear Cub", "Opt", "Shock"]);
      expect(libraryNames(s, "p1")).toEqual(["Swamp", "Plains", "Forest"]);
      // Aucun « piochez » : la pioche du tour n'est pas comptée.
      expect(s.turnLog?.some((e) => e.e === "draw")).toBeFalsy();
    });

    it("Scheming Symmetry : deux joueurs ciblés cherchent chacun une carte, mélangent et la mettent au-dessus", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Scheming Symmetry"], library: ["Forest", "Forest", "Shock", "Forest"] },
        p2: { library: ["Island", "Bear Cub", "Island"] },
      });
      s = castIt(s, "p1", "Scheming Symmetry", { targets: { p: ["p1", "p2"] } });
      s = settle(s, (req, p, st) =>
        req.type === "pick" && req.intent === "search"
          ? req.options.filter((id) => nameOf(st, id) === (p === "p1" ? "Shock" : "Bear Cub")).slice(0, 1)
          : undefined,
      );
      expect(libraryNames(s, "p1")[0]).toBe("Shock");
      expect(libraryNames(s, "p2")[0]).toBe("Bear Cub");
    });
  });

  describe("terrains et artefacts", () => {
    it("Crucible of Worlds : jouer des terrains depuis votre cimetière", () => {
      const s = scenario({ p1: { battlefield: ["Crucible of Worlds"], graveyard: ["Island", "Shock"] } });
      const island = idOf(s, "p1", "graveyard", "Island");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === island)).toBe(true);
      const shock = idOf(s, "p1", "graveyard", "Shock");
      expect(castable(s, "p1", shock)).toBe(false);
    });

    it("Trade Routes : renvoyer un de vos terrains ; défausser une carte de terrain pour piocher", () => {
      let s = scenario({ p1: { battlefield: ["Trade Routes", "Island", "Island", "Plains"], hand: ["Swamp", "Shock"] } });
      const routes = idOf(s, "p1", "battlefield", "Trade Routes");
      const plains = idOf(s, "p1", "battlefield", "Plains");
      s = settle(activate(s, "p1", routes, 0, { targets: { t: [plains] } }));
      expect(handNames(s, "p1")).toEqual(["Plains", "Shock", "Swamp"]);
      s = settle(activate(s, "p1", routes, 1));
      // Une carte de terrain défaussée (pas le Shock), une carte piochée.
      expect(idsOf(s, "p1", "hand", "Shock")).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Shock");
      expect(hand(s, "p1")).toBe(3);
    });

    it("Training Center : engagé en duel, dégagé avec deux adversaires ; Raugrin Triome : engagé, cycle {3}", () => {
      let duel = scenario({ p1: { hand: ["Training Center"] } });
      duel = playLand(duel, "p1", "Training Center");
      expect(duel.objects[idOf(duel, "p1", "battlefield", "Training Center")]?.tapped).toBe(true);
      let multi = scenario({ players: 3, p1: { hand: ["Training Center"] } });
      multi = playLand(multi, "p1", "Training Center");
      expect(multi.objects[idOf(multi, "p1", "battlefield", "Training Center")]?.tapped).toBe(false);
      let tri = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Raugrin Triome", "Xander's Lounge"] } });
      const lounge = idOf(tri, "p1", "hand", "Xander's Lounge");
      expect(activations(tri, "p1", lounge)).toHaveLength(1);
      tri = playLand(tri, "p1", "Raugrin Triome");
      const triome = idOf(tri, "p1", "battlefield", "Raugrin Triome");
      expect(tri.objects[triome]?.tapped).toBe(true);
      expect(chars(tri, triome).subtypes).toEqual(["Island", "Mountain", "Plains"]);
    });

    it("Oboro, Palace in the Clouds : {1} : renvoyez Oboro dans la main", () => {
      let s = scenario({ p1: { battlefield: ["Oboro, Palace in the Clouds", "Island"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Oboro, Palace in the Clouds")));
      expect(handNames(s, "p1")).toEqual(["Oboro, Palace in the Clouds"]);
    });

    it("Wayfarer's Bauble : un terrain de base de la bibliothèque arrive engagé", () => {
      let s = scenario({
        p1: { battlefield: ["Wayfarer's Bauble", "Island", "Island"], library: ["Shock", "Plains", "Command Tower"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Wayfarer's Bauble")));
      const plains = idOf(s, "p1", "battlefield", "Plains");
      expect(s.objects[plains]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Wayfarer's Bauble")).toHaveLength(1);
    });

    it("Eiganjo, Seat of the Empire : canalisation, 4 blessures à une créature attaquante, {1} de moins par créature légendaire", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Avacyn, Angel of Hope", "Plains", "Plains"], hand: ["Eiganjo, Seat of the Empire"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const eiganjo = idOf(s, "p1", "hand", "Eiganjo, Seat of the Empire");
      // Pas de créature attaquante : rien à cibler.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: lions, defender: "p1" }] } as never);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(s, "p1", eiganjo)).toBe(true);
      s = settle(activate(s, "p1", eiganjo, undefined, { targets: { t: [lions] } }));
      expect(idsOf(s, "p2", "graveyard", "Savannah Lions")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Eiganjo, Seat of the Empire")).toHaveLength(1);
    });

    it("Takenuma, Abandoned Mire : canalisation, meulez trois cartes puis une créature revient en main", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 4)],
          hand: ["Takenuma, Abandoned Mire"],
          library: ["Forest", "Bear Cub", "Shock", "Island"],
        },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "hand", "Takenuma, Abandoned Mire")));
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Shock", "Takenuma, Abandoned Mire"]);
    });

    it("Talon Gates of Madara : {4} : de la main sur le champ de bataille ; en arrivant, une créature sort de phase", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Talon Gates of Madara"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(activate(s, "p1", idOf(s, "p1", "hand", "Talon Gates of Madara")), picking([bear]));
      expect(idsOf(s, "p1", "battlefield", "Talon Gates of Madara")).toHaveLength(1);
      expect(s.objects[bear]?.zone).toBe("phasedOut");
    });

    it("Command Beacon : sacrifié, il met votre commandant dans votre main depuis la zone de commandement", () => {
      let s = scenario({ p1: { battlefield: ["Command Beacon"], command: ["Nissa, Leyline Tamer"] } });
      let proposed: unknown;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Command Beacon"), 1), (req) => {
        if (req.intent !== "commanderZone") return undefined;
        proposed = req.suggested;
        return [0];
      });
      // En main, le garder est la réponse proposée (il se relance sans taxe).
      expect(proposed).toEqual([0]);
      expect(handNames(s, "p1")).toEqual(["Nissa, Leyline Tamer"]);
      expect(idsOf(s, "p1", "graveyard", "Command Beacon")).toHaveLength(1);
    });

    it("Boggart Bog : vous pouvez payer 3 PV, sinon il arrive engagé ; Boggart Trawler exile le cimetière du joueur ciblé", () => {
      let s = scenario({ p1: { hand: ["Boggart Trawler // Boggart Bog"] } });
      s = act(s, "p1", {
        type: "playLand",
        card: idOf(s, "p1", "hand", "Boggart Trawler // Boggart Bog"),
        payLife: true,
      } as never);
      const bog = s.battlefield.find((id) => s.objects[id]?.controller === "p1") ?? "";
      expect([s.objects[bog]?.tapped, s.players.p1?.life]).toEqual([false, 17]);
      let t = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Boggart Trawler // Boggart Bog"] },
        p2: { graveyard: ["Shock", "Forest"] },
      });
      t = settle(castIt(t, "p1", "Boggart Trawler // Boggart Bog"), picking(["p2"]));
      expect(t.players.p2?.graveyard).toEqual([]);
    });
  });
});
