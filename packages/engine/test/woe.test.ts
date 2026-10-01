/**
 * Wilds of Eldraine (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Aventures (Bramble Familiar, Mosswood Dreadknight, Scalding Viper, Hearth Elemental),
 * Marchandage (Torch the Tower), Song of Totentanz, The End, Restless Cottage, Candy Trail, Sleight of Hand et
 * Disdainful Stroke.
 */

import { describe, expect, it } from "vitest";
import { CELEBRATION, CURSED_ROLE, createRole, MONSTER_ROLE, WICKED_ROLE, YOUNG_HERO_ROLE } from "../../cards/src/woe/common";
import { destroy } from "../src/actions";
import * as dsl from "../src/dsl";
import { runEffect } from "../src/effects";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { checkCondition } from "../src/triggers";
import { stateBasedActions } from "../src/turn";
import type { ChoiceRequest, ChoiceValue, GameState, TokenSpec } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passAccepting, scenario } from "./helpers";

type S = GameState;
type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
/** La carte partie en aventure (715.4) : nouvel objet en exil. */
const onAdventure = (s: S, name: string) => {
  const id = exiled(s, name)[0] as string;
  expect(s.objects[id]?.onAdventure).toBe(true);
  return id;
};
const castOptions = (s: S, player: string, card: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

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
const cast = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });
const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
};

describe("Wilds of Eldraine", () => {
  describe("Aventure : Bramble Familiar // Fetch Quest", () => {
    const BRAMBLE = "Bramble Familiar // Fetch Quest";

    it("Fetch Quest : meulez sept cartes, une carte de créature meulée arrive ; puis la créature se lance depuis l'exil", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 9),
          hand: [BRAMBLE],
          library: ["Opt", "Bear Cub", "Opt", "Opt", "Opt", "Opt", "Opt", "Serra Angel"],
        },
      });
      const card = idOf(s, "p1", "hand", BRAMBLE);
      s = act(s, "p1", { type: "cast", card, face: 1 });
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
        // La huitième carte (non meulée) n'est pas proposée.
        expect(req.options.some((id) => nameOf(s, id) === "Serra Angel")).toBe(false);
        return bear ? [bear] : undefined;
      });
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(6);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Serra Angel"]);
      // En aventure : seule la créature se lance depuis l'exil.
      const adv = onAdventure(s, BRAMBLE);
      const opts = castOptions(s, "p1", adv);
      expect(opts).toHaveLength(1);
      expect(opts[0]?.type === "cast" && opts[0].face).toBeUndefined();
      s = settle(act(s, "p1", { type: "cast", card: adv }));
      expect(idsOf(s, "p1", "battlefield", BRAMBLE)).toHaveLength(1);
    });

    it("Bramble Familiar : {T} ajoute {G} ; {1}{G}, {T}, défaussez une carte : il revient dans la main de son propriétaire", () => {
      let s = scenario({ p1: { battlefield: [BRAMBLE, ...lands("Forest", 2)], hand: ["Opt"] } });
      const familiar = idOf(s, "p1", "battlefield", BRAMBLE);
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === familiar && a.colors.includes("G"))).toBe(
        true,
      );
      s = settle(activate(s, "p1", familiar, undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p1", "hand", BRAMBLE)).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });
  });

  describe("Aventure : Mosswood Dreadknight // Dread Whispers", () => {
    const KNIGHT = "Mosswood Dreadknight // Dread Whispers";

    it("quand il meurt, il peut être lancé depuis le cimetière comme aventure : piochez une carte, perdez 1 PV, puis exil", () => {
      let s = scenario({
        p1: {
          battlefield: [KNIGHT, ...lands("Mountain", 2), ...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", KNIGHT)] }));
      const card = idOf(s, "p1", "graveyard", KNIGHT);
      // L'aventure se lance depuis le cimetière (la créature aussi : approximation documentée).
      expect(castOptions(s, "p1", card).some((o) => o.type === "cast" && o.face === 1)).toBe(true);
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(s.players.p1?.life).toBe(19);
      s = settle(act(s, "p1", { type: "cast", card: onAdventure(s, KNIGHT) }));
      expect(idsOf(s, "p1", "battlefield", KNIGHT)).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", KNIGHT)).keywords).toContain("trample");
    });

    it("la permission dure jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: { battlefield: [KNIGHT, ...lands("Mountain", 2), ...lands("Swamp", 2)], hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", KNIGHT)] }));
      const card = idOf(s, "p1", "graveyard", KNIGHT);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(castOptions(s, "p1", card)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(castOptions(s, "p1", card)).toHaveLength(0);
    });
  });

  describe("Aventure : Scalding Viper // Steam Clean", () => {
    const VIPER = "Scalding Viper // Steam Clean";

    it("un adversaire qui lance un sort de VM 3 ou moins subit 1 blessure ; VM 4 ou plus, ou vos propres sorts : rien", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [VIPER] },
        p2: { battlefield: [...lands("Island", 1), ...lands("Mountain", 6)], hand: ["Opt", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p2", "Opt"));
      expect(s.players.p2?.life).toBe(19);
      s = settle(cast(s, "p2", "Shivan Dragon"));
      expect(s.players.p2?.life).toBe(19);
      let t = scenario({ p1: { battlefield: [VIPER, "Island"], hand: ["Opt"] } });
      t = settle(cast(t, "p1", "Opt"));
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
    });

    it("Steam Clean : renvoie un permanent non-terrain ciblé dans la main de son propriétaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: [VIPER] },
        p2: { battlefield: ["Serra Angel", "Plains"] },
      });
      const card = idOf(s, "p1", "hand", VIPER);
      expect(() =>
        act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Plains")] } }),
      ).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      onAdventure(s, VIPER);
    });
  });

  describe("Aventure : Hearth Elemental // Stoke Genius", () => {
    it("Stoke Genius : défaussez votre main, piochez deux cartes ; l'Élémental coûte ensuite {1} de moins par éphémère au cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 7),
          hand: ["Hearth Elemental // Stoke Genius", "Opt", "Forest"],
          library: lands("Island", 3),
        },
      });
      const card = idOf(s, "p1", "hand", "Hearth Elemental // Stoke Genius");
      s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Opt"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island", "Island"]);
      // {5}{R} moins {1} (Opt) : les cinq Montagnes restantes suffisent.
      s = settle(act(s, "p1", { type: "cast", card: onAdventure(s, "Hearth Elemental // Stoke Genius") }));
      expect(idsOf(s, "p1", "battlefield", "Hearth Elemental // Stoke Genius")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(7);
    });
  });

  describe("Marchandage : Torch the Tower", () => {
    it("seuls un artefact, un enchantement ou un jeton peuvent être sacrifiés ; marchandé : 3 blessures, regard 1, la créature tuée est exilée", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Candy Trail", "Bear Cub"], hand: ["Torch the Tower"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Brazen Scourge"] },
      });
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      const scourge = idOf(s, "p2", "battlefield", "Brazen Scourge");
      const opt = castOptions(s, "p1", card)[0];
      expect(opt?.type === "cast" && opt.kickerPermanents).toEqual([candy]);
      let scried = false;
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [scourge] }, kicked: true, sacrifice: [candy] }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Brazen Scourge")).toHaveLength(0);
      expect(exiled(s, "Brazen Scourge")).toHaveLength(1);
    });
  });

  describe("Song of Totentanz", () => {
    it("X Rats 1/1 noirs qui ne peuvent pas bloquer ; vos créatures gagnent la célérité jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), { name: "Bear Cub", sick: true }], hand: ["Song of Totentanz"] },
      });
      s = settle(cast(s, "p1", "Song of Totentanz", undefined, { x: 2 }));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(2);
      for (const r of rats) {
        const c = chars(s, r);
        expect([c.power, c.toughness, c.colors]).toEqual([1, 1, ["B"]]);
        expect(c.keywords).toContain("haste");
      }
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [bear, ...rats].map((id) => ({ id, defender: "p2" })) });
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      expect(s.players.p2?.life).toBe(16);
      expect(chars(s, bear).keywords).not.toContain("haste");
    });

    it("un Rat ne peut pas bloquer", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Song of Totentanz"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Song of Totentanz", undefined, { x: 1 }));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() => act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: rat, attacker: bear }] })).toThrow();
    });
  });

  describe("The End", () => {
    it("coûte {2} de moins si vous avez 5 PV ou moins", () => {
      const setup = (life: number) =>
        scenario({ p1: { life, battlefield: lands("Swamp", 2), hand: ["The End"] }, p2: { battlefield: ["Bear Cub"] } });
      const target = (s: S) => ({ t: [idOf(s, "p2", "battlefield", "Bear Cub")] });
      const high = setup(6);
      expect(() => cast(high, "p1", "The End", target(high))).toThrow();
      const low = settle(cast(setup(5), "p1", "The End", target(setup(5))));
      expect(exiled(low, "Bear Cub")).toHaveLength(1);
    });

    it("exile la cible et les cartes du même nom de son cimetière, sa main et sa bibliothèque ; il pioche une carte par carte de sa main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["The End"] },
        p2: {
          battlefield: ["Bear Cub"],
          hand: ["Bear Cub", "Opt"],
          library: ["Bear Cub", "Island", "Island"],
          graveyard: ["Bear Cub", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "The End", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }), (req) =>
        req.type === "pick" ? req.options.slice(0, req.max) : undefined,
      );
      expect(exiled(s, "Bear Cub")).toHaveLength(4);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Island", "Opt"]);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(s.players.p2?.library).toHaveLength(1);
    });
  });

  describe("Restless Cottage", () => {
    it("arrive engagé ; {T} : ajoute {B} ou {G}", () => {
      let s = scenario({ p1: { hand: ["Restless Cottage"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Restless Cottage") });
      const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
      expect(s.objects[cottage]?.tapped).toBe(true);
      const t = scenario({ p1: { battlefield: ["Restless Cottage"] } });
      const colors = legalActions(t, "p1").flatMap((a) =>
        a.type === "tapForMana" && a.source === idOf(t, "p1", "battlefield", "Restless Cottage") ? a.colors : [],
      );
      expect(colors.sort()).toEqual(["B", "G"]);
    });

    it("{2}{B}{G} : Horreur 4/4 noire et verte (toujours un terrain) ; en attaquant : une Nourriture et une carte d'un cimetière exilée", () => {
      let s = scenario({
        p1: { battlefield: ["Restless Cottage", ...lands("Swamp", 2), ...lands("Forest", 2)] },
        p2: { graveyard: ["Opt", "Bear Cub"] },
      });
      const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
      s = settle(activate(s, "p1", cottage));
      const c = chars(s, cottage);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toContain("Horror");
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect([...c.colors].sort()).toEqual(["B", "G"]);
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: cottage, defender: "p2" }] });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, cottage).types).not.toContain("Creature");
    });
  });

  describe("Candy Trail", () => {
    it("Artefact — Nourriture Indice ; en arrivant, regard 2 ; {2}, {T}, sacrifice : 3 PV et une carte", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Candy Trail"], library: ["Opt", "Forest", "Island"] } });
      let seen: string[] = [];
      s = settle(cast(s, "p1", "Candy Trail"), (req) => {
        if (req.intent === "scryBottom" && req.type === "pick") seen = req.options.map((id) => nameOf(s, id) ?? "");
        return undefined;
      });
      expect(seen.sort()).toEqual(["Forest", "Opt"]);
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      expect(chars(s, candy).subtypes).toEqual(expect.arrayContaining(["Food", "Clue"]));
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", candy));
      expect(s.players.p1?.life).toBe(23);
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });
  });

  describe("Sleight of Hand", () => {
    it("regardez les deux cartes du dessus : l'une dans la main, l'autre au-dessous de la bibliothèque", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Sleight of Hand"], library: ["Opt", "Bear Cub", "Forest"] } });
      s = settle(cast(s, "p1", "Sleight of Hand"), (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
        return bear ? [bear] : undefined;
      });
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Opt"]);
    });
  });

  describe("Disdainful Stroke", () => {
    it("contrecarre un sort de VM 4 ou plus ; un sort de VM 3 ou moins n'est pas une cible légale", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Shivan Dragon", "Lightning Strike"] },
        p2: { battlefield: lands("Island", 2), hand: ["Disdainful Stroke"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      expect(() => cast(s, "p2", "Disdainful Stroke", { t: [strike] })).toThrow();
      s = settle(s);
      s = cast(s, "p1", "Shivan Dragon");
      const dragon = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Disdainful Stroke", { t: [dragon] }));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });
  });
});

describe("Wilds of Eldraine : socle (Rôles, Célébration)", () => {
  /** Actions basées sur l'état, puis on passe jusqu'à ce que la pile et les déclenchements soient vides. */
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const resolutionOf = (s: S, controller: string, sourceId: string, targets: Record<string, string[]> = {}) =>
    ({
      item: { id: "x", controller, sourceId, sourceDefId: s.objects[sourceId]?.defId, targets },
      controller,
      targets,
      vars: {},
      pc: 0,
    }) as never as Parameters<typeof runEffect>[1];
  /** Exécute « créez un Rôle attaché à [la cible] » dans une même résolution (la cible existe : le « si » est vrai). */
  const giveRole = (s: S, token: TokenSpec, to: string, controller = "p1") => {
    const r = resolutionOf(s, controller, to, { t: [to] });
    for (const e of createRole(token).flat()) if (e.op !== "if") runEffect(s, r, e);
  };
  const roles = (s: S, host: string) => s.battlefield.filter((id) => s.objects[id]?.attachedTo === host);

  it("Monster Role : +1/+1 et le piétinement ; un nouveau Rôle du même joueur remplace l'ancien (704.5y)", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, MONSTER_ROLE, bear);
    s = settleAll(s);
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toContain("trample");
    giveRole(s, CURSED_ROLE, bear);
    s = settleAll(s);
    expect(roles(s, bear)).toHaveLength(1);
    expect(chars(s, bear).power).toBe(1);
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("deux joueurs peuvent chacun attacher un Rôle à la même créature", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, MONSTER_ROLE, bear, "p1");
    giveRole(s, CURSED_ROLE, bear, "p2");
    s = settleAll(s);
    expect(roles(s, bear)).toHaveLength(2);
  });

  it("Wicked Role : mis au cimetière, chaque adversaire perd 1 point de vie", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, WICKED_ROLE, bear);
    s = settleAll(s);
    expect(chars(s, bear).power).toBe(3);
    destroy(s, bear);
    s = settleAll(s);
    expect(s.players.p2?.life).toBe(19);
  });

  it("Young Hero Role : en attaquant avec une endurance de 3 ou moins, un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, YOUNG_HERO_ROLE, bear);
    s = settleAll(s);
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = settleAll(act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Célébration : deux permanents non-terrain arrivés sous votre contrôle ce tour-ci (jetons compris)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const r = resolutionOf(s, "p1", idOf(s, "p1", "battlefield", "Bear Cub"));
    const food = { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"] } as TokenSpec;
    runEffect(s, r, dsl.fx.createTokens({ name: "Forest", colors: [], types: ["Land"], subtypes: ["Forest"] }));
    runEffect(s, r, dsl.fx.createTokens(food));
    expect(checkCondition(s, CELEBRATION, "p1")).toBe(false);
    runEffect(s, r, dsl.fx.createTokens(food));
    expect(checkCondition(s, CELEBRATION, "p1")).toBe(true);
    expect(checkCondition(s, CELEBRATION, "p2")).toBe(false);
  });
});
