/**
 * Wilds of Eldraine (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Aventures (Bramble Familiar, Mosswood Dreadknight, Scalding Viper, Hearth Elemental),
 * Marchandage (Torch the Tower), Song of Totentanz, The End, Restless Cottage, Candy Trail, Sleight of Hand et
 * Disdainful Stroke.
 */

import { describe, expect, it } from "vitest";
import { CELEBRATION, CURSED_ROLE, createRole, MONSTER_ROLE, WICKED_ROLE, YOUNG_HERO_ROLE } from "../../cards/src/woe/common";
import { dealDamage, destroy, payLife } from "../src/actions";
import * as dsl from "../src/dsl";
import { runEffect } from "../src/effects";
import { legalActions } from "../src/legal";
import { chars, moveObject } from "../src/state";
import { legalTargets as legalTargetsOf } from "../src/targets";
import { checkCondition } from "../src/triggers";
import { canBlock, stateBasedActions } from "../src/turn";
import { countTurnEvents } from "../src/turnlog";
import type { CardDef, ChoiceRequest, ChoiceValue, GameState, TokenSpec } from "../src/types";
import { projectView } from "../src/view";
import {
  type Answer,
  act,
  advanceUntil,
  castTargets as cast,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  passAccepting,
  passUntil,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

type S = GameState;
/** La carte partie en aventure (715.4) : nouvel objet en exil. */
const onAdventure = (s: S, name: string) => {
  const id = exiled(s, name)[0] as string;
  expect(s.objects[id]?.onAdventure).toBe(true);
  return id;
};
const castOptions = (s: S, player: string, card: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

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
      // Seule l'Aventure se lance depuis le cimetière : la créature, non.
      expect(castOptions(s, "p1", card).map((o) => o.type === "cast" && o.face)).toEqual([1]);
      expect(() => act(s, "p1", { type: "cast", card })).toThrow(/qu'en Aventure/);
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

describe("Wilds of Eldraine, lot A — blanc", () => {
  /**
   * Wilds of Eldraine, lot A — cartes blanches : chaque test confronte une carte à son texte Oracle (plan R, lot R7) :
   * Rôles, Célébration, Marchandage, Aventures, Sagas et exils « jusqu'à ce que ».
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Rôles (et autres Auras) attachés à un permanent. */
  const attachedTo = (s: S, host: string) =>
    s.battlefield.filter((id) => s.objects[id]?.attachedTo === host).map((id) => nameOf(s, id));

  /** Répond aux cibles de déclenchement par `want` (s'il fait partie des options). */
  const targetWith =
    (...want: string[]): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerTarget" ? want.filter((w) => req.options.includes(w)) : undefined;
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Jusqu'à la déclaration des attaquants du joueur actif. */
  const toAttack = (s: S) => passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
  const attack = (s: S, player: string, ids: string[], defender = "p2") =>
    act(s, player, { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender })) });

  describe("Rôles", () => {
    it("Betroth the Beast : un Rôle royal (+1/+1, garde {1}) sur votre créature ; le Chevalier se lance ensuite depuis l'exil", () => {
      const KNIGHT = "Besotted Knight // Betroth the Beast";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: [KNIGHT] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", KNIGHT, { face: 1, targets: { t: [bear] } }));
      expect(attachedTo(s, bear)).toEqual(["Royal Role"]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
      const adv = exiled(s, KNIGHT)[0] as string;
      expect(s.objects[adv]?.onAdventure).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: adv }));
      expect(pt(s, idOf(s, "p1", "battlefield", KNIGHT))).toEqual([3, 3]);
    });

    it("Charmed Clothier : un Rôle royal sur une autre créature que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Charmed Clothier"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Charmed Clothier"));
      const clothier = idOf(s, "p1", "battlefield", "Charmed Clothier");
      expect(attachedTo(s, bear)).toEqual(["Royal Role"]);
      expect(attachedTo(s, clothier)).toEqual([]);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Cursed Courtier : arrive avec un Rôle maudit, une 1/1 avec le lien de vie", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Cursed Courtier"] } });
      s = settle(cast(s, "p1", "Cursed Courtier"));
      const courtier = idOf(s, "p1", "battlefield", "Cursed Courtier");
      expect(attachedTo(s, courtier)).toEqual(["Cursed Role"]);
      expect(pt(s, courtier)).toEqual([1, 1]);
      expect(chars(s, courtier).keywords).toContain("lifelink");
    });

    it("Unassuming Sage : en payant {2}, un Rôle de sorcier sur lui (3/3) ; sans payer, rien", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Unassuming Sage"] } });
        s = settle(cast(s, "p1", "Unassuming Sage"), (req) => (req.intent === "may" ? [pay ? 1 : 0] : undefined));
        return s;
      };
      const paid = run(true);
      const sage = idOf(paid, "p1", "battlefield", "Unassuming Sage");
      expect(attachedTo(paid, sage)).toEqual(["Sorcerer Role"]);
      expect(pt(paid, sage)).toEqual([3, 3]);
      const unpaid = run(false);
      expect(attachedTo(unpaid, idOf(unpaid, "p1", "battlefield", "Unassuming Sage"))).toEqual([]);
    });

    it("Spellbook Vendor : au début de votre combat, {1} pour un Rôle de sorcier sur la créature ciblée", () => {
      let s = scenario({ p1: { battlefield: ["Spellbook Vendor", "Bear Cub", "Plains"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
      s = settle(s, (req) =>
        req.intent === "may" ? [1] : req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(attachedTo(s, bear)).toEqual(["Sorcerer Role"]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    });

    it("Protective Parents : en mourant, un Rôle de jeune héros sur une de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Protective Parents", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        active: "p2",
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p2", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Protective Parents")] } });
      s = settle(s, targetWith(bear));
      expect(idsOf(s, "p1", "graveyard", "Protective Parents")).toHaveLength(1);
      expect(attachedTo(s, bear)).toEqual(["Young Hero Role"]);
    });

    it("Return Triumphant : une carte de créature de VM 3 ou moins revient avec un Rôle de jeune héros", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Return Triumphant"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(() => cast(s, "p1", "Return Triumphant", { targets: { t: [angel] } })).toThrow();
      s = settle(cast(s, "p1", "Return Triumphant", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(attachedTo(s, bear)).toEqual(["Young Hero Role"]);
    });
  });

  describe("Célébration", () => {
    it("Armory Mice, Gallant Pie-Wielder, Tuinvale Guide : bonus dès que deux permanents non-terrain sont arrivés ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Armory Mice", "Gallant Pie-Wielder", "Tuinvale Guide", ...lands("Plains", 2)],
          hand: ["Hopeful Vigil"],
        },
      });
      const mice = idOf(s, "p1", "battlefield", "Armory Mice");
      const pie = idOf(s, "p1", "battlefield", "Gallant Pie-Wielder");
      const guide = idOf(s, "p1", "battlefield", "Tuinvale Guide");
      expect(pt(s, mice)).toEqual([3, 1]);
      expect(chars(s, pie).keywords).not.toContain("doubleStrike");
      expect(chars(s, guide).keywords).not.toContain("lifelink");
      // L'enchantement et son jeton Chevalier : deux permanents non-terrain.
      s = settle(cast(s, "p1", "Hopeful Vigil"));
      expect(pt(s, mice)).toEqual([3, 3]);
      expect(chars(s, pie).keywords).toContain("doubleStrike");
      expect(pt(s, guide)).toEqual([3, 3]);
      expect(chars(s, guide).keywords).toContain("lifelink");
    });

    it("Pests of Honor et Lady of Laughter : un marqueur au début du combat, une carte à l'étape de fin", () => {
      const run = (celebrate: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Pests of Honor", "Lady of Laughter", ...lands("Plains", 2)], hand: ["Hopeful Vigil"] },
        });
        if (celebrate) s = settle(cast(s, "p1", "Hopeful Vigil"));
        const hand = s.players.p1?.hand.length ?? 0;
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return [
          s.objects[idOf(s, "p1", "battlefield", "Pests of Honor")]?.counters["+1/+1"] ?? 0,
          (s.players.p1?.hand.length ?? 0) - hand,
        ];
      };
      expect(run(true)).toEqual([1, 1]);
      expect(run(false)).toEqual([0, 0]);
    });
  });

  describe("Marchandage", () => {
    it("Archon's Glory : +2/+2 ; marchandé, aussi le vol et le lien de vie", () => {
      const run = (bargain: boolean) => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains", "Candy Trail"], hand: ["Archon's Glory"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = settle(cast(s, "p1", "Archon's Glory", { targets: { t: [bear] }, ...extra }));
        return { s, bear };
      };
      const plain = run(false);
      expect(pt(plain.s, plain.bear)).toEqual([4, 4]);
      expect(chars(plain.s, plain.bear).keywords).not.toContain("flying");
      const bargained = run(true);
      expect(pt(bargained.s, bargained.bear)).toEqual([4, 4]);
      expect(chars(bargained.s, bargained.bear).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      expect(idsOf(bargained.s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Kellan's Lightblades : 3 blessures à une créature attaquante ; marchandé, elle est détruite", () => {
      const run = (bargain: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Plains", "Plains", "Candy Trail"], hand: ["Kellan's Lightblades"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        // Une créature qui n'attaque pas n'est pas une cible légale.
        expect(() => cast(s, "p1", "Kellan's Lightblades", { targets: { t: [bear] } })).toThrow();
        s = attack(toAttack(s), "p2", [angel], "p1");
        s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = settle(cast(s, "p1", "Kellan's Lightblades", { targets: { t: [angel] }, ...extra }));
        return { s, angel };
      };
      const plain = run(false);
      expect(plain.s.objects[plain.angel]?.damage).toBe(3);
      expect(idsOf(plain.s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      const bargained = run(true);
      expect(idsOf(bargained.s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Aventures", () => {
    it("Squeak By : +1/+1 ; ne peut pas être bloquée par une créature de force 3 ou plus", () => {
      const MOUSE = "Cheeky House-Mouse // Squeak By";
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Plains"], hand: [MOUSE] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", MOUSE, { face: 1, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      s = settle(attack(toAttack(s), "p1", [bear]));
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: bear }] })).toThrow();
      const small = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: small, attacker: bear }] });
      expect(s.combat?.blockers.map((b) => b.id)).toEqual([small]);
    });

    it("Heartflame Slash : 3 blessures ; Heartflame Duelist donne le lien de vie à vos éphémères et rituels", () => {
      const DUELIST = "Heartflame Duelist // Heartflame Slash";
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: [DUELIST] } });
      s = settle(cast(s, "p1", DUELIST, { face: 1, targets: { t: ["p2"] } }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 17]);
      let t = scenario({ p1: { battlefield: [DUELIST, ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      t = settle(cast(t, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([23, 17]);
    });

    it("Pollen-Shield Hare : vos jetons de créature +1/+1 ; Hare Raising : la vigilance et +X/+X (X = vos créatures)", () => {
      const HARE = "Pollen-Shield Hare // Hare Raising";
      let s = scenario({
        p1: { battlefield: [HARE, "Bear Cub", ...lands("Plains", 3)], hand: ["Virtue of Loyalty // Ardenvale Fealty"] },
      });
      s = settle(cast(s, "p1", "Virtue of Loyalty // Ardenvale Fealty", { face: 1 }));
      const knight = idOf(s, "p1", "battlefield", "Knight");
      expect(pt(s, knight)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      let t = scenario({ p1: { battlefield: ["Bear Cub", "Serra Angel", "Forest"], hand: [HARE] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(cast(t, "p1", HARE, { face: 1, targets: { t: [bear] } }));
      expect(pt(t, bear)).toEqual([4, 4]);
      expect(chars(t, bear).keywords).toContain("vigilance");
    });

    it("Shrouded Shepherd : +2/+2 à l'arrivée ; Cleave Shadows : −1/−1 aux créatures adverses", () => {
      const SHEPHERD = "Shrouded Shepherd // Cleave Shadows";
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Swamp", ...lands("Plains", 3)], hand: [SHEPHERD] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", SHEPHERD, { face: 1 }));
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([1, 1]);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      s = settle(
        act(s, "p1", { type: "cast", card: exiled(s, SHEPHERD)[0] as string }),
        targetWith(idOf(s, "p1", "battlefield", "Bear Cub")),
      );
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 4]);
    });

    it("Mend the Wilds : une carte de permanent de votre cimetière sur le dessus de votre bibliothèque ; Woodland Acolyte pioche", () => {
      const ACOLYTE = "Woodland Acolyte // Mend the Wilds";
      let s = scenario({
        p1: { battlefield: ["Forest", ...lands("Plains", 3)], hand: [ACOLYTE], graveyard: ["Serra Angel", "Opt"] },
      });
      expect(() => cast(s, "p1", ACOLYTE, { face: 1, targets: { t: [idOf(s, "p1", "graveyard", "Opt")] } })).toThrow();
      s = settle(cast(s, "p1", ACOLYTE, { face: 1, targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, ACOLYTE)[0] as string }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Serra Angel"]);
    });

    it("Virtue of Loyalty : à votre étape de fin, un marqueur +1/+1 sur chacune de vos créatures, qui se dégagent", () => {
      let s = scenario({ p1: { battlefield: ["Virtue of Loyalty // Ardenvale Fealty", { name: "Bear Cub", tapped: true }] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.tapped).toBe(false);
    });
  });

  describe("Retirer et neutraliser", () => {
    it("Break the Spell : vous piochez seulement si l'enchantement détruit était à vous ou un jeton", () => {
      const run = (owner: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: owner === "p1" ? ["Plains", "Hopeful Vigil"] : ["Plains"], hand: ["Break the Spell"] },
          p2: { battlefield: owner === "p2" ? ["Hopeful Vigil"] : [] },
        });
        const vigil = idOf(s, owner, "battlefield", "Hopeful Vigil");
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Break the Spell", { targets: { t: [vigil] } }));
        expect(idsOf(s, owner, "graveyard", "Hopeful Vigil")).toHaveLength(1);
        return (s.players.p1?.hand.length ?? 0) - hand;
      };
      // La carte quitte la main (−1), puis une pioche (+1) seulement pour votre enchantement.
      expect(run("p1")).toBe(0);
      expect(run("p2")).toBe(-1);
    });

    it("Break the Spell : un jeton d'enchantement adverse (Rôle) détruit fait piocher", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Break the Spell"] },
        p2: { battlefield: lands("Plains", 3), hand: ["Cursed Courtier"] },
        active: "p2",
      });
      s = settle(cast(s, "p2", "Cursed Courtier"));
      s = act(s, "p2", { type: "pass" });
      const role = idOf(s, "p2", "battlefield", "Cursed Role");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(cast(s, "p1", "Break the Spell", { targets: { t: [role] } }));
      expect(s.players.p1?.hand.length).toBe(hand);
      expect(pt(s, idOf(s, "p2", "battlefield", "Cursed Courtier"))).toEqual([3, 3]);
    });

    it("Cooped Up : la créature enchantée ne peut ni attaquer ni bloquer ; {2}{W} l'exile", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Cooped Up"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Cooped Up", { targets: { enchant: [angel] } }));
      expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Cooped Up")));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Cooped Up")).toHaveLength(1);
    });

    it("Glass Casket : exile une créature adverse de VM 3 ou moins jusqu'à ce que l'artefact parte", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Glass Casket"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Forest", 1)], hand: [] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Glass Casket"));
      // Serra Angel (VM 5) n'est pas une cible : seul l'Ourson est exilé.
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.objects[bear]).toBeUndefined();
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      // L'artefact détruit : la créature revient.
      destroy(s, idOf(s, "p1", "battlefield", "Glass Casket"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Food Coma : exile une créature adverse et crée une Nourriture ; l'enchantement détruit, elle revient", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Food Coma"] },
        p2: { battlefield: ["Serra Angel", "Plains"], hand: ["Break the Spell"] },
      });
      s = settle(cast(s, "p1", "Food Coma"));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Break the Spell", { targets: { t: [idOf(s, "p1", "battlefield", "Food Coma")] } }));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Werefox Bodyguard : exile une autre créature non-Renard jusqu'à son départ ; {1}{W}, sacrifice : 2 PV", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Werefox Bodyguard"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Werefox Bodyguard"));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Werefox Bodyguard")));
      expect(s.players.p1?.life).toBe(22);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Moment of Valor : dégagez une créature (+1/+0, indestructible) ou détruisez une créature de force 4 ou plus", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Plains", 6)],
          hand: ["Moment of Valor", "Moment of Valor"],
        },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Moment of Valor", { mode: 0, targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("indestructible");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(() => cast(s, "p1", "Moment of Valor", { mode: 1, targets: { t: [elves] } })).toThrow();
      s = settle(cast(s, "p1", "Moment of Valor", { mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Expel the Interlopers : détruit chaque créature de force supérieure ou égale au nombre choisi", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Expel the Interlopers"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Expel the Interlopers", { mode: 2 }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Eerie Interference : prévient les blessures des créatures à vous et à vos créatures, pas celles d'un sort", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 3)], hand: ["Eerie Interference"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } }));
      s = attack(
        toAttack(s),
        "p2",
        [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")],
        "p1",
      );
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(cast(s, "p1", "Eerie Interference"));
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p1", {
        type: "declareBlockers",
        blocks: [{ blocker: elves, attacker: idOf(s, "p2", "battlefield", "Bear Cub") }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p1?.life).toBe(17);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[elves]?.damage).toBe(0);
    });
  });

  describe("Enchantements et déclencheurs", () => {
    it("Hopeful Vigil : un Chevalier 2/2 vigilant ; {2}{W} : sacrifié, regard 2", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Hopeful Vigil"] } });
      s = settle(cast(s, "p1", "Hopeful Vigil"));
      const knight = idOf(s, "p1", "battlefield", "Knight");
      expect(pt(s, knight)).toEqual([2, 2]);
      expect(chars(s, knight).keywords).toContain("vigilance");
      let scried = 0;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hopeful Vigil")), (req) => {
        if (req.intent === "scryBottom" && req.type === "pick") scried = req.options.length;
        return undefined;
      });
      expect(idsOf(s, "p1", "graveyard", "Hopeful Vigil")).toHaveLength(1);
      expect(scried).toBe(2);
    });

    it("Knight of Doves et Savior of the Sleeping : un enchantement à vous mis au cimetière donne un Oiseau et un marqueur", () => {
      let s = scenario({
        p1: { battlefield: ["Knight of Doves", "Savior of the Sleeping", "Hopeful Vigil", ...lands("Plains", 3)] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hopeful Vigil")));
      const bird = idOf(s, "p1", "battlefield", "Bird");
      expect(pt(s, bird)).toEqual([1, 1]);
      expect(chars(s, bird).keywords).toContain("flying");
      expect(chars(s, bird).colors).toEqual(["W"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Savior of the Sleeping")]?.counters["+1/+1"]).toBe(1);
    });

    it("Rimefur Reindeer et Slumbering Keepguard : un enchantement arrive, une créature adverse s'engage et regard 1", () => {
      let s = scenario({
        p1: { battlefield: ["Rimefur Reindeer", "Slumbering Keepguard", ...lands("Plains", 5)], hand: ["Hopeful Vigil"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      let scried = false;
      s = settle(cast(s, "p1", "Hopeful Vigil"), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
      expect(scried).toBe(true);
      // {2}{W} : +1/+1 par enchantement que vous contrôlez (un seul : Hopeful Vigil).
      const keep = idOf(s, "p1", "battlefield", "Slumbering Keepguard");
      s = settle(activate(s, "p1", keep));
      expect(pt(s, keep)).toEqual([2, 2]);
    });

    it("Stockpiling Celebrant : renvoie un autre de vos permanents non-terrain, puis regard 2", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Stockpiling Celebrant"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = 0;
      s = settle(cast(s, "p1", "Stockpiling Celebrant"), (req) => {
        if (req.intent === "triggerTarget" && req.type === "pick") return [bear];
        if (req.intent === "scryBottom" && req.type === "pick") scried = req.options.length;
        return undefined;
      });
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(scried).toBe(2);
    });

    it("Discerning Financier : un Trésor à l'entretien si un adversaire a plus de terrains ; {2}{W} le donne et pioche", () => {
      let s = scenario({
        p1: { battlefield: ["Discerning Financier", ...lands("Plains", 3)] },
        p2: { battlefield: lands("Forest", 5) },
      });
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0);
      const treasure = idOf(s, "p1", "battlefield", "Treasure");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Discerning Financier"), { targets: { t: [treasure] } }));
      expect(s.objects[treasure]?.controller).toBe("p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      // Autant de terrains de chaque côté : pas de Trésor.
      let t = scenario({ p1: { battlefield: ["Discerning Financier", "Plains"] }, p2: { battlefield: ["Forest"] } });
      t = advanceUntil(t, (x) => x.turn.number === 5 && x.turn.step === "main1");
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });

    it("Dutiful Griffin : {2}{W}, sacrifiez deux enchantements : il revient du cimetière dans votre main", () => {
      let s = scenario({
        p1: { battlefield: ["Hopeful Vigil", "Hopeful Vigil", ...lands("Plains", 3)], graveyard: ["Dutiful Griffin"] },
      });
      const griffin = idOf(s, "p1", "graveyard", "Dutiful Griffin");
      s = settle(activate(s, "p1", griffin, { sacrifice: idsOf(s, "p1", "battlefield", "Hopeful Vigil") }));
      expect(idsOf(s, "p1", "hand", "Dutiful Griffin")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Hopeful Vigil")).toHaveLength(2);
    });

    it("Frostbridge Guard : {2}{W}, {T} : engagez la créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: ["Frostbridge Guard", ...lands("Plains", 3)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Frostbridge Guard"), { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Plunge into Winter : engagez jusqu'à une créature, regard 1, piochez", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Plunge into Winter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Plunge into Winter", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("Créatures", () => {
    it("Regal Bunnicorn : F/E égales au nombre de vos permanents non-terrain", () => {
      const s = scenario({ p1: { battlefield: ["Regal Bunnicorn", "Bear Cub", "Candy Trail", "Plains"] } });
      expect(pt(s, idOf(s, "p1", "battlefield", "Regal Bunnicorn"))).toEqual([3, 3]);
    });

    it("Moonshaker Cavalry : vos créatures gagnent le vol et +X/+X, X étant le nombre de vos créatures", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 8)], hand: ["Moonshaker Cavalry"] } });
      s = settle(cast(s, "p1", "Moonshaker Cavalry"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(pt(s, idOf(s, "p1", "battlefield", "Moonshaker Cavalry"))).toEqual([8, 8]);
    });
  });

  describe("Sagas", () => {
    it("The Princess Takes Flight : I exile une créature, II +2/+2 et le vol, III la carte revient", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["The Princess Takes Flight"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "The Princess Takes Flight"), targetWith(angel));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(
        s,
        (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("flying");
      s = advanceUntil(
        s,
        (x) => x.turn.number === 7 && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "The Princess Takes Flight")).toHaveLength(1);
    });

    it("Three Blind Mice : I une Souris, II et III une copie d'un de vos jetons, IV +1/+1 et la vigilance", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Three Blind Mice"] } });
      s = settle(cast(s, "p1", "Three Blind Mice"));
      const mouse = idOf(s, "p1", "battlefield", "Mouse");
      expect(pt(s, mouse)).toEqual([1, 1]);
      expect(chars(s, mouse).colors).toEqual(["W"]);
      const done = (n: number) => (x: S) =>
        x.turn.number === n && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0;
      s = advanceUntil(s, done(7));
      expect(idsOf(s, "p1", "battlefield", "Mouse")).toHaveLength(3);
      s = advanceUntil(s, done(9));
      for (const id of idsOf(s, "p1", "battlefield", "Mouse")) {
        expect(pt(s, id)).toEqual([2, 2]);
        expect(chars(s, id).keywords).toContain("vigilance");
      }
      expect(idsOf(s, "p1", "graveyard", "Three Blind Mice")).toHaveLength(1);
    });
  });
});

describe("Wilds of Eldraine, lot A — bleu", () => {
  /**
   * Wilds of Eldraine, lot A — cartes bleues : chaque carte au comportement non trivial est confrontée à son texte
   * Oracle (R7), en jouant par des décisions.
   */
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, s: S) => ChoiceValue[] | undefined;
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

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
  /** Réponse « choisissez cet objet » quand il est proposé. */
  const pickIf =
    (...ids: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const wanted = ids.filter((id) => req.options.includes(id));
      return wanted.length ? wanted : undefined;
    };
  /** Lance l'Aventure (face 1) d'une carte de la main. */
  const castAdventure = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    cast(s, player, name, targets, { face: 1, ...extra });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const attackWith = (s: S, player: string, ...ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const defender = player === "p1" ? "p2" : "p1";
    return act(cur, player, { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender })) });
  };

  it("Aquatic Alchemist : +2/+0 pour le premier éphémère ou rituel du tour seulement ; Bubble Up remet un éphémère au-dessus de la bibliothèque", () => {
    const ALCHEMIST = "Aquatic Alchemist // Bubble Up";
    let s = scenario({ p1: { battlefield: [ALCHEMIST, ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    const alch = idOf(s, "p1", "battlefield", ALCHEMIST);
    s = cast(s, "p1", "Opt");
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(1);
    s = settle(s);
    expect(pt(s, alch)).toEqual([3, 3]);
    // Le deuxième éphémère du tour ne déclenche rien (aucune capacité sur la pile).
    s = cast(s, "p1", "Opt");
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(0);
    s = settle(s);
    expect(pt(s, alch)).toEqual([3, 3]);

    let t = scenario({ p1: { battlefield: lands("Island", 3), hand: [ALCHEMIST], graveyard: ["Opt", "Bear Cub"] } });
    const opt = idOf(t, "p1", "graveyard", "Opt");
    expect(() => castAdventure(t, "p1", ALCHEMIST, { t: [idOf(t, "p1", "graveyard", "Bear Cub")] })).toThrow();
    t = settle(castAdventure(t, "p1", ALCHEMIST, { t: [opt] }));
    expect(nameOf(t, t.players.p1?.library[0] as string)).toBe("Opt");
    expect(exiled(t, ALCHEMIST)).toHaveLength(1);
  });

  it("Entry Denied : renvoie une créature adverse de VM 3 ou moins ; pas une de VM 4, ni la vôtre", () => {
    const GATE = "Beluna's Gatekeeper // Entry Denied";
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: [GATE] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    expect(() => castAdventure(s, "p1", GATE, { t: [idOf(s, "p2", "battlefield", "Serra Angel")] })).toThrow();
    expect(() => castAdventure(s, "p1", GATE, { t: [idOf(s, "p1", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(castAdventure(s, "p1", GATE, { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    expect(handNames(s, "p2")).toEqual(["Bear Cub"]);
  });

  it("Bitter Chill : engage la créature, qui ne se dégage plus ; mise au cimetière, payez {1} : regard 1 puis piochez", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Bitter Chill"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Bitter Chill", { enchant: [bear] }));
    expect(s.objects[bear]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
    // Retour au tour de p1 : l'Aura est détruite, {1} payé.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
    const chill = idOf(s, "p1", "battlefield", "Bitter Chill");
    const hand = s.players.p1?.hand.length ?? 0;
    destroy(s, chill);
    let scried = false;
    s = settle(s, (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(scried).toBe(true);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Chancellor of Tales : un sort d'Aventure peut être copié ; un autre sort, ou la créature lancée, non", () => {
    const FAMILIAR = "Frolicking Familiar // Blow Off Steam";
    let s = scenario({
      p1: {
        battlefield: ["Chancellor of Tales", ...lands("Mountain", 3), ...lands("Island", 3)],
        hand: [FAMILIAR, FAMILIAR, "Lightning Strike"],
      },
    });
    s = settle(castAdventure(s, "p1", FAMILIAR, { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(18);
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(15);
    const before = s.stack.length;
    s = cast(s, "p1", FAMILIAR);
    expect(s.stack).toHaveLength(before + 1);
  });

  it("Storyteller Pixie : piochez quand vous lancez un sort d'Aventure, pas la créature", () => {
    const FAMILIAR = "Frolicking Familiar // Blow Off Steam";
    let s = scenario({
      p1: { battlefield: ["Storyteller Pixie", ...lands("Mountain", 2), ...lands("Island", 2)], hand: [FAMILIAR, FAMILIAR] },
    });
    s = settle(castAdventure(s, "p1", FAMILIAR, { t: ["p2"] }));
    expect(handNames(s, "p1").filter((n) => n === "Forest")).toHaveLength(1);
    s = settle(cast(s, "p1", FAMILIAR));
    expect(handNames(s, "p1").filter((n) => n === "Forest")).toHaveLength(1);
  });

  it("Diminisher Witch : marchandée, un Rôle Maudit sur une créature adverse (1/1) ; sinon rien", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Candy Trail"], hand: ["Diminisher Witch"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(
      cast(s, "p1", "Diminisher Witch", undefined, { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] }),
    );
    expect(pt(s, angel)).toEqual([1, 1]);
    expect(idsOf(s, "p1", "battlefield", "Cursed Role")).toHaveLength(1);

    let t = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Diminisher Witch"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Diminisher Witch"));
    expect(pt(t, idOf(t, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
  });

  it("Farsight Ritual : regardez quatre cartes (huit si marchandé), deux en main, le reste au-dessous", () => {
    const library = ["Opt", "Bear Cub", "Island", "Island", "Serra Angel", "Island", "Island", "Lightning Strike", "Forest"];
    const run = (bargain: boolean) => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Candy Trail"], hand: ["Farsight Ritual"], library },
      });
      let seen = 0;
      const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
      s = settle(cast(s, "p1", "Farsight Ritual", undefined, extra), (req) => {
        if (req.type !== "pick") return undefined;
        seen = req.options.length;
        expect([req.min, req.max]).toEqual([2, 2]);
        return undefined;
      });
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe(bargain ? "Forest" : "Serra Angel");
      return seen;
    };
    expect(run(false)).toBe(4);
    expect(run(true)).toBe(8);
  });

  it("Freeze in Place : engage la créature adverse avec trois marqueurs d'étourdissement, puis regard 2", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Freeze in Place"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    let scried = false;
    s = settle(cast(s, "p1", "Freeze in Place", { t: [bear] }), (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(scried).toBe(true);
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(3);
    // À son étape de dégagement, un marqueur est retiré au lieu de la dégager.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(2);
  });

  it("Gadwick's First Duel : I un Rôle Maudit ; II regard 2 ; III copie votre prochain éphémère ou rituel de VM 3 ou moins", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Mountain", 4)],
        hand: ["Gadwick's First Duel", "Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Gadwick's First Duel"), pickIf(angel));
    expect(pt(s, angel)).toEqual([1, 1]);
    s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Gadwick's First Duel")).toHaveLength(0);
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(14);
    // Une seule fois.
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(11);
  });

  it("Galvanic Giant : un sort de VM 5 ou plus engage une créature adverse avec un marqueur d'étourdissement ; Storm Reading pioche quatre, défausse deux", () => {
    const GIANT = "Galvanic Giant // Storm Reading";
    let s = scenario({
      p1: { battlefield: [GIANT, ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.objects[bear]?.tapped).toBe(false);
    s = settle(cast(s, "p1", "Shivan Dragon"), pickIf(bear));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(1);

    let t = scenario({ p1: { battlefield: lands("Island", 7), hand: [GIANT] } });
    t = settle(castAdventure(t, "p1", GIANT));
    expect(t.players.p1?.hand).toHaveLength(2);
    expect(t.players.p1?.graveyard).toHaveLength(2);
  });

  it("Horned Loch-Whale : arrive engagée hors de votre tour ; Lagoon Breach met un attaquant adverse au-dessus ou au-dessous", () => {
    const WHALE = "Horned Loch-Whale // Lagoon Breach";
    let s = scenario({ active: "p2", p1: { battlefield: lands("Island", 6), hand: [WHALE] } });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(cast(s, "p1", WHALE));
    expect(s.objects[idOf(s, "p1", "battlefield", WHALE)]?.tapped).toBe(true);
    let mine = scenario({ p1: { battlefield: lands("Island", 6), hand: [WHALE] } });
    mine = settle(cast(mine, "p1", WHALE));
    expect(mine.objects[idOf(mine, "p1", "battlefield", WHALE)]?.tapped).toBe(false);

    let t = scenario({ active: "p2", p1: { battlefield: lands("Island", 2), hand: [WHALE] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(t, "p2", "battlefield", "Bear Cub");
    t = attackWith(t, "p2", bear);
    t = passUntil(t, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    let asked = "";
    t = settle(castAdventure(t, "p1", WHALE, { t: [bear] }), (req, player) => {
      if (req.intent === "topOrBottom") asked = player;
      return req.intent === "topOrBottom" ? ["top"] : undefined;
    });
    expect(asked).toBe("p2");
    expect(nameOf(t, t.players.p2?.library[0] as string)).toBe("Bear Cub");
  });

  it("Icewrought Sentry : en attaquant, payez {1}{U} pour engager une créature adverse ; elle gagne alors +2/+1", () => {
    let s = scenario({ p1: { battlefield: ["Icewrought Sentry", ...lands("Island", 2)] }, p2: { battlefield: ["Bear Cub"] } });
    const sentry = idOf(s, "p1", "battlefield", "Icewrought Sentry");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(attackWith(s, "p1", sentry), pickIf(bear));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(pt(s, sentry)).toEqual([4, 4]);
    expect(s.objects[sentry]?.tapped).toBe(false);
  });

  it("Into the Fae Court : piochez trois cartes ; une Faerie 1/1 volante qui ne bloque que les créatures volantes", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Into the Fae Court"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Into the Fae Court"));
    expect(s.players.p1?.hand).toHaveLength(3);
    const faerie = idOf(s, "p1", "battlefield", "Faerie");
    expect(pt(s, faerie)).toEqual([1, 1]);
    expect(chars(s, faerie).colors).toEqual(["U"]);
    expect(chars(s, faerie).keywords).toContain("flying");

    // Elle ne peut pas bloquer une créature sans le vol.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }] });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const blocks = [{ blocker: faerie, attacker: idOf(s, "p2", "battlefield", "Bear Cub") }];
    expect(() => act(s, "p1", { type: "declareBlockers", blocks })).toThrow();
  });

  it("Living Lectern : {1}, sacrifiez-le, en rituel : piochez, un Rôle Sorcier sur une autre créature", () => {
    let s = scenario({ p1: { battlefield: ["Living Lectern", "Bear Cub", "Island"] } });
    const lectern = idOf(s, "p1", "battlefield", "Living Lectern");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", lectern, { t: [bear] }));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Living Lectern")).toHaveLength(1);
    expect(pt(s, bear)).toEqual([3, 3]);
    let t = scenario({ active: "p2", p1: { battlefield: ["Living Lectern", "Island"] } });
    t = passUntil(t, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(legalActions(t, "p1").some((a) => a.type === "activate")).toBe(false);
  });

  it("Merfolk Coralsmith : {1} : +1/-1 ; quand il meurt, regard 2", () => {
    let s = scenario({ p1: { battlefield: ["Merfolk Coralsmith", ...lands("Island", 3)] } });
    const smith = idOf(s, "p1", "battlefield", "Merfolk Coralsmith");
    s = settle(activate(s, "p1", smith));
    expect(pt(s, smith)).toEqual([3, 2]);
    s = settle(activate(s, "p1", smith));
    let scried = false;
    s = settle(activate(s, "p1", smith), (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(idsOf(s, "p1", "graveyard", "Merfolk Coralsmith")).toHaveLength(1);
    expect(scried).toBe(true);
  });

  it("Misleading Motes : le propriétaire met la créature ciblée au-dessus ou au-dessous de sa bibliothèque", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Misleading Motes"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Misleading Motes", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    const lib = s.players.p2?.library ?? [];
    expect(nameOf(s, lib[lib.length - 1] as string)).toBe("Serra Angel");
  });

  it("Desperate Parry : la créature ciblée gagne -4/-0 jusqu'à la fin du tour", () => {
    const ATT = "Obyra's Attendants // Desperate Parry";
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: [ATT] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(castAdventure(s, "p1", ATT, { t: [angel] }));
    expect(pt(s, angel)).toEqual([0, 4]);
  });

  it("Free the Fae : meulez quatre cartes, puis une carte d'éphémère, de rituel ou de Faerie meulée en main", () => {
    const PRANK = "Picklock Prankster // Free the Fae";
    let s = scenario({
      p1: {
        battlefield: lands("Island", 2),
        hand: [PRANK],
        library: ["Bear Cub", "Talion's Messenger", "Forest", "Opt", "Lightning Strike"],
      },
    });
    let options: string[] = [];
    s = settle(castAdventure(s, "p1", PRANK), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "");
      const m = req.options.find((id) => nameOf(cur, id) === "Talion's Messenger");
      return m ? [m] : undefined;
    });
    expect(options.sort()).toEqual(["Opt", "Talion's Messenger"]);
    expect(handNames(s, "p1")).toEqual(["Talion's Messenger"]);
    expect(s.players.p1?.graveyard).toHaveLength(3);
  });

  it("Sleep-Cursed Faerie : arrive engagée avec trois marqueurs d'étourdissement ; {1}{U} : dégagez-la (un marqueur retiré à la place)", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Sleep-Cursed Faerie"] } });
    s = settle(cast(s, "p1", "Sleep-Cursed Faerie"));
    const f = idOf(s, "p1", "battlefield", "Sleep-Cursed Faerie");
    expect(s.objects[f]?.tapped).toBe(true);
    expect(s.objects[f]?.counters.stun).toBe(3);
    s = settle(activate(s, "p1", f));
    expect(s.objects[f]?.tapped).toBe(true);
    expect(s.objects[f]?.counters.stun).toBe(2);
  });

  it("Snaremaster Sprite : en arrivant, payez {2} : engagez une créature adverse avec un marqueur d'étourdissement", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Snaremaster Sprite"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Snaremaster Sprite"), pickIf(bear));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(3);
  });

  it("Spell Stutter : contrecarre à moins que son contrôleur ne paie {2} plus {1} par Faerie que vous contrôlez", () => {
    const run = (spare: number) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2 + spare), hand: ["Lightning Strike"] },
        p2: { battlefield: [...lands("Island", 2), "Talion's Messenger"], hand: ["Spell Stutter"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Spell Stutter", { t: [strike] }));
      return s.players.p2?.life;
    };
    // {2} + {1} (une Faerie) : deux terrains libres ne suffisent pas, trois oui.
    expect(run(2)).toBe(20);
    expect(run(3)).toBe(17);
  });

  it("Splashy Spellcaster : chaque éphémère ou rituel met un Rôle Sorcier sur jusqu'à une autre créature", () => {
    let s = scenario({ p1: { battlefield: ["Splashy Spellcaster", "Bear Cub", "Island"], hand: ["Opt"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Opt"), pickIf(bear));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Splashy Spellcaster"))).toEqual([2, 4]);
  });

  it("Stormkeld Prowler : deux marqueurs +1/+1 par sort de VM 5 ou plus", () => {
    let s = scenario({
      p1: { battlefield: ["Stormkeld Prowler", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Lightning Strike"] },
    });
    const prowler = idOf(s, "p1", "battlefield", "Stormkeld Prowler");
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.objects[prowler]?.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(s.objects[prowler]?.counters["+1/+1"]).toBe(2);
  });

  it("Succumb to the Cold : une ou deux créatures adverses engagées, un marqueur d'étourdissement sur chacune", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Succumb to the Cold"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const ids = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
    s = settle(cast(s, "p1", "Succumb to the Cold", { t: ids }));
    for (const id of ids) {
      expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[id]?.counters.stun).toBe(1);
    }
  });

  it("Talion's Messenger : en attaquant avec une Faerie, piochez puis défaussez ; un marqueur +1/+1 sur une Faerie", () => {
    let s = scenario({ p1: { battlefield: ["Talion's Messenger"], hand: ["Opt"] } });
    const messenger = idOf(s, "p1", "battlefield", "Talion's Messenger");
    s = settle(attackWith(s, "p1", messenger), pickIf(idOf(s, "p1", "hand", "Opt"), messenger));
    expect(handNames(s, "p1")).toEqual(["Forest"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[messenger]?.counters["+1/+1"]).toBe(1);
    // Sans Faerie qui attaque : rien.
    let t = scenario({ p1: { battlefield: ["Talion's Messenger", "Bear Cub"] } });
    t = settle(attackWith(t, "p1", idOf(t, "p1", "battlefield", "Bear Cub")));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Tenacious Tomeseeker : marchandé, un éphémère ou un rituel de votre cimetière revient en main", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Candy Trail"], hand: ["Tenacious Tomeseeker"], graveyard: ["Opt"] },
    });
    const opt = idOf(s, "p1", "graveyard", "Opt");
    s = settle(
      cast(s, "p1", "Tenacious Tomeseeker", undefined, {
        kicked: true,
        sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")],
      }),
      pickIf(opt),
    );
    expect(handNames(s, "p1")).toEqual(["Opt"]);
  });

  it("Croaking Curse : engage la créature ciblée et y attache un Rôle Maudit", () => {
    const TRANS = "Vantress Transmuter // Croaking Curse";
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: [TRANS] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(castAdventure(s, "p1", TRANS, { t: [angel] }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(pt(s, angel)).toEqual([1, 1]);
  });

  it("Virtue of Knowledge : les déclenchements d'arrivée de vos permanents se déclenchent une fois de plus ; Vantress Visions copie une capacité", () => {
    const VIRTUE = "Virtue of Knowledge // Vantress Visions";
    let s = scenario({ p1: { battlefield: [VIRTUE, ...lands("Island", 6)], hand: ["Archive Dragon"] } });
    let scries = 0;
    s = settle(cast(s, "p1", "Archive Dragon"), (req) => {
      if (req.intent === "scryBottom") scries += 1;
      return undefined;
    });
    expect(scries).toBe(2);

    let t = scenario({ p1: { battlefield: ["Merfolk Coralsmith", ...lands("Island", 3)], hand: [VIRTUE] } });
    const smith = idOf(t, "p1", "battlefield", "Merfolk Coralsmith");
    t = activate(t, "p1", smith);
    const ability = t.stack[0]?.id as string;
    t = settle(castAdventure(t, "p1", VIRTUE, { t: [ability] }));
    expect(pt(t, smith)).toEqual([4, 1]);

    // « que vous contrôlez » : la capacité d'un adversaire ne peut pas être ciblée.
    let u = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: [VIRTUE] },
      p2: { battlefield: ["Merfolk Coralsmith", ...lands("Island", 1)] },
    });
    u = activate(u, "p2", idOf(u, "p2", "battlefield", "Merfolk Coralsmith"));
    const theirs = u.stack[0]?.id as string;
    u = act(u, "p2", { type: "pass" });
    expect(u.pending?.kind === "priority" && u.pending.player).toBe("p1");
    expect(() => castAdventure(u, "p1", VIRTUE, { t: [theirs] })).toThrow();
  });

  it("Water Wings : F/E de base 4/4, le vol et la défense talismanique jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 2)], hand: ["Water Wings"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Water Wings", { t: [bear] }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Frolicking Familiar : +1/+1 par éphémère ou rituel ; Blow Off Steam inflige 1 blessure", () => {
    const FAMILIAR = "Frolicking Familiar // Blow Off Steam";
    let s = scenario({ p1: { battlefield: [FAMILIAR, ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    const fam = idOf(s, "p1", "battlefield", FAMILIAR);
    s = settle(cast(s, "p1", "Opt"));
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, fam)).toEqual([4, 4]);
  });

  it("Rip the Seams : détruit une créature engagée seulement", () => {
    const CLIQUE = "Threadbind Clique // Rip the Seams";
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: [CLIQUE] },
      p2: { battlefield: ["Bear Cub", { name: "Serra Angel", tapped: true }] },
    });
    expect(() => castAdventure(s, "p1", CLIQUE, { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(castAdventure(s, "p1", CLIQUE, { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Swift Spiral : exile une créature non-jeton, qui revient sous le contrôle de son propriétaire à la prochaine étape de fin", () => {
    const TWINS = "Twining Twins // Swift Spiral";
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: [TWINS] }, p2: { battlefield: ["Serra Angel"] } });
    s = settle(castAdventure(s, "p1", TWINS, { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Faerie Slumber Party : toutes les créatures en main ; deux Faeries par adversaire qui en contrôlait une", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Faerie Slumber Party"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Faerie Slumber Party"));
    expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
    expect(handNames(s, "p2").sort()).toEqual(["Bear Cub", "Serra Angel"]);
    expect(idsOf(s, "p1", "battlefield", "Faerie")).toHaveLength(2);

    let t = scenario({ p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Faerie Slumber Party"] } });
    t = settle(cast(t, "p1", "Faerie Slumber Party"));
    expect(idsOf(t, "p1", "battlefield", "Faerie")).toHaveLength(0);
  });

  it("Rowdy Research : coûte {1} de moins par créature qui a attaqué ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Island", 5)], hand: ["Rowdy Research"] } });
    const card = idOf(s, "p1", "hand", "Rowdy Research");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card)).toBe(false);
    s = attackWith(s, "p1", ...idsOf(s, "p1", "battlefield", "Bear Cub"));
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(cast(s, "p1", "Rowdy Research"));
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Rowdy Research, Witchstalker Frenzy : une créature qui attaque lors de deux combats ne compte qu'une fois", () => {
    // Serra Angel (vigilance) attaque lors du combat et du combat supplémentaire : une seule créature a attaqué.
    const twoCombats = (battlefield: string[], hand: string[]) => {
      let s = scenario({ p1: { battlefield: ["Serra Angel", ...battlefield], hand } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s.turn.addedPhases = ["beginCombat"];
      s = throughCombat(attackWith(s, "p1", angel));
      expect(s.pending?.kind).toBe("declareAttackers");
      s = throughCombat(attackWith(s, "p1", angel));
      expect(s.players.p2?.life).toBe(12);
      expect(countTurnEvents(s, { event: "attack" }, "p1")).toBe(2);
      expect(countTurnEvents(s, { event: "attack", distinct: "object" }, "p1")).toBe(1);
      return s;
    };
    // {6}{U} moins {1} : six mana, cinq Îles ne suffisent pas, six oui.
    let s = twoCombats(lands("Island", 5), ["Rowdy Research"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Rowdy Research"))).toBe(false);
    s = twoCombats(lands("Island", 6), ["Rowdy Research"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Rowdy Research"))).toBe(true);
    // {3}{R} moins {1} : trois mana.
    s = twoCombats(lands("Mountain", 2), ["Witchstalker Frenzy"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Witchstalker Frenzy"))).toBe(false);
    s = twoCombats(lands("Mountain", 3), ["Witchstalker Frenzy"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Witchstalker Frenzy"))).toBe(true);
  });
});

describe("Wilds of Eldraine, lot A — noir", () => {
  /**
   * Wilds of Eldraine, lot A — cartes noires : chaque carte au comportement non trivial est confrontée à son texte Oracle
   * (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] = []) => ids.map((id) => nameOf(s, id)).sort();
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Après une modification directe (destruction) : actions basées sur l'état, puis déclenchements résolus. */
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  /** Répond aux choix jusqu'à une priorité « lancer maintenant » (608.2g). */
  const toCastNow = (s: S, answer: Answer): S => {
    let cur = s;
    for (let i = 0; i < 100 && !castNowOf(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Réponse : choisit, parmi les options d'un choix, celles qui sont dans `want`. */
  const pickIds =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length ? picked : undefined;
    };
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };

  describe("Enchantements mis au cimetière : Hopeless Nightmare, Ashiok's Reaper, Wicked Visitor, Warehouse Tabby", () => {
    it("Hopeless Nightmare : en arrivant, chaque adversaire défausse une carte et perd 2 PV", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Hopeless Nightmare"] }, p2: { hand: ["Opt"] } });
      s = settle(cast(s, "p1", "Hopeless Nightmare"));
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(18);
    });

    it("{2}{B} : sacrifiée, regard 2 ; le Reaper pioche, le Visitor fait perdre 1 PV, le Tabby crée un Rat", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hopeless Nightmare", "Ashiok's Reaper", "Wicked Visitor", "Warehouse Tabby", ...lands("Swamp", 3)],
          library: ["Opt", "Island", "Forest", "Plains"],
        },
      });
      let scried = false;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hopeless Nightmare")), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Hopeless Nightmare")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p2?.life).toBe(19);
      const rat = idOf(s, "p1", "battlefield", "Rat");
      expect([...pt(s, rat), chars(s, rat).colors]).toEqual([1, 1, ["B"]]);
    });

    it("un enchantement adverse mis au cimetière ne déclenche rien", () => {
      let s = scenario({
        p1: { battlefield: ["Ashiok's Reaper", "Wicked Visitor"] },
        p2: { battlefield: ["Hopeless Nightmare", ...lands("Swamp", 3)] },
        active: "p2",
      });
      s = settle(activate(s, "p2", idOf(s, "p2", "battlefield", "Hopeless Nightmare")));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p2?.life).toBe(20);
    });

    it("Warehouse Tabby : {1}{B} lui donne le contact mortel jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Warehouse Tabby", ...lands("Swamp", 2)] } });
      const tabby = idOf(s, "p1", "battlefield", "Warehouse Tabby");
      s = settle(activate(s, "p1", tabby));
      expect(chars(s, tabby).keywords).toContain("deathtouch");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, tabby).keywords).not.toContain("deathtouch");
    });
  });

  describe("Marchandage", () => {
    it("Back for Seconds : deux cartes de créature reviennent en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Back for Seconds"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      const ids = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Serra Angel")];
      s = settle(cast(s, "p1", "Back for Seconds", { t: ids }));
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub", "Serra Angel"]);
    });

    it("Back for Seconds marchandé : l'une d'elles de VM 4 ou moins arrive sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Candy Trail"],
          hand: ["Back for Seconds"],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      let offered: string[] = [];
      s = settle(
        cast(
          s,
          "p1",
          "Back for Seconds",
          { t: [bear, angel] },
          { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] },
        ),
        (req) => {
          if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
          offered = req.options.map(String);
          return [bear];
        },
      );
      // L'Ange (VM 5) n'est pas proposé.
      expect(offered).toEqual([bear]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(names(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Beseech the Mirror marchandé : la carte cherchée (VM 4 ou moins) se lance sans payer son coût", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 4), "Candy Trail"],
          hand: ["Beseech the Mirror"],
          library: ["Island", "Bear Cub", "Island"],
        },
      });
      s = cast(s, "p1", "Beseech the Mirror", undefined, {
        kicked: true,
        sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")],
      });
      s = toCastNow(s, (req) => {
        if (req.intent !== "search" || req.type !== "pick") return undefined;
        return req.options.filter((id) => nameOf(s, String(id)) === "Bear Cub").slice(0, 1);
      });
      const bear = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, bear)).toBe("Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: bear, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("Beseech the Mirror non marchandé : la carte cherchée va dans la main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Beseech the Mirror"], library: ["Island", "Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "Beseech the Mirror"), (req) => {
        if (req.intent !== "search" || req.type !== "pick") return undefined;
        return req.options.filter((id) => nameOf(s, String(id)) === "Bear Cub").slice(0, 1);
      });
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Candy Grapple : -3/-3, ou -5/-5 si marchandé", () => {
      const run = (bargain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 2), "Candy Trail"], hand: ["Candy Grapple"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Candy Grapple"), targets: { t: [angel] }, ...extra });
        s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
        return s.objects[angel]?.zone === "battlefield" ? pt(s, angel) : "mort";
      };
      expect(run(false)).toEqual([1, 1]);
      expect(run(true)).toBe("mort");
    });

    it("High Fae Negotiator marchandée : chaque adversaire perd 3 PV et vous gagnez 3 PV ; sinon rien", () => {
      const run = (bargain: boolean) => {
        let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Candy Trail"], hand: ["High Fae Negotiator"] } });
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = settle(cast(s, "p1", "High Fae Negotiator", undefined, extra));
        expect(idsOf(s, "p1", "battlefield", "High Fae Negotiator")).toHaveLength(1);
        return [s.players.p1?.life, s.players.p2?.life];
      };
      expect(run(true)).toEqual([23, 17]);
      expect(run(false)).toEqual([20, 20]);
    });

    it("Rowan's Grim Search marchandé : deux cartes gardées sur le dessus, deux au cimetière, puis piochez deux et perdez 2 PV", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Candy Trail"],
          hand: ["Rowan's Grim Search"],
          library: ["Opt", "Bear Cub", "Serra Angel", "Shivan Dragon", "Plains"],
        },
      });
      s = settle(
        cast(s, "p1", "Rowan's Grim Search", undefined, {
          kicked: true,
          sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")],
        }),
        (req) => {
          if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
          return req.options.filter((id) => ["Bear Cub", "Shivan Dragon"].includes(nameOf(s, String(id)) ?? ""));
        },
      );
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub", "Shivan Dragon"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Candy Trail", "Opt", "Rowan's Grim Search", "Serra Angel"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
      expect(s.players.p1?.life).toBe(18);
    });
  });

  describe("Rôles", () => {
    it("Price of Beauty : un Rôle Méchant (+1/+1) sur votre créature ; la Sorcière se lance ensuite depuis l'exil", () => {
      const WITCH = "Conceited Witch // Price of Beauty";
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: [WITCH] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", WITCH), face: 1, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      const adv = exiled(s, WITCH)[0] as string;
      expect(s.objects[adv]?.onAdventure).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: adv }));
      expect(chars(s, idOf(s, "p1", "battlefield", WITCH)).keywords).toContain("menace");
    });

    it("Eriette's Whisper : l'adversaire défausse deux cartes ; un Rôle Méchant sur jusqu'à une de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Eriette's Whisper"] },
        p2: { hand: ["Opt", "Island", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Eriette's Whisper", { p: ["p2"], c: [bear] }));
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(pt(s, bear)).toEqual([3, 3]);
      let t = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Eriette's Whisper"] }, p2: { hand: ["Opt"] } });
      t = settle(cast(t, "p1", "Eriette's Whisper", { p: ["p2"] }));
      expect(t.players.p2?.graveyard).toHaveLength(1);
    });

    it("Spiteful Hexmage : un Rôle Maudit (1/1) sur une créature que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Serra Angel"], hand: ["Spiteful Hexmage"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spiteful Hexmage"), pickIds([angel]));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Shatter the Oath : détruit une créature ou un enchantement ; Rôle Méchant sur votre créature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Shatter the Oath"] },
        p2: { battlefield: ["Hopeless Nightmare"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Shatter the Oath", { t: [idOf(s, "p2", "battlefield", "Hopeless Nightmare")], c: [bear] }));
      expect(idsOf(s, "p2", "graveyard", "Hopeless Nightmare")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Not Dead After All : la créature qui meurt revient engagée avec un Rôle Méchant", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Not Dead After All"] } });
      s = settle(cast(s, "p1", "Not Dead After All", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settleAll(s);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(idsOf(s, "p1", "battlefield", "Wicked Role")).toHaveLength(1);
    });

    it("The Witch's Vanity : I détruit une créature adverse de VM 2 ou moins, II une Nourriture, III un Rôle Méchant", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Serra Angel"], hand: ["The Witch's Vanity"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "The Witch's Vanity"));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settleAll(s);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settleAll(s);
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([5, 5]);
      expect(idsOf(s, "p1", "graveyard", "The Witch's Vanity")).toHaveLength(1);
    });
  });

  describe("Fées", () => {
    it("Barrow Naughty : le lien de vie seulement avec une autre Fée ; {2}{B} : +1/+0", () => {
      let s = scenario({ p1: { battlefield: ["Barrow Naughty", ...lands("Swamp", 3)] } });
      const naughty = idOf(s, "p1", "battlefield", "Barrow Naughty");
      expect(chars(s, naughty).keywords).not.toContain("lifelink");
      s = settle(activate(s, "p1", naughty));
      expect(pt(s, naughty)).toEqual([2, 3]);
      const t = scenario({ p1: { battlefield: ["Barrow Naughty", "Faerie Dreamthief"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Barrow Naughty")).keywords).toContain("lifelink");
    });

    it("Dream Spoilers : un sort lancé pendant le tour d'un adversaire donne -1/-1 à une créature adverse ; pas pendant votre tour", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Dream Spoilers", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Opt"), pickIds([bear]));
      expect(pt(s, bear)).toEqual([1, 1]);
      let t = scenario({ p1: { battlefield: ["Dream Spoilers", "Island"], hand: ["Opt"] }, p2: { battlefield: ["Bear Cub"] } });
      t = settle(cast(t, "p1", "Opt"));
      expect(pt(t, idOf(t, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Ego Drain : vous choisissez une carte non-terrain qu'il défausse ; sans Fée, vous exilez une carte de votre main", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Ego Drain", "Opt"] },
        p2: { hand: ["Forest", "Bear Cub", "Serra Angel"] },
      });
      let options: string[] = [];
      s = settle(cast(s, "p1", "Ego Drain", { t: ["p2"] }), (req, player) => {
        if (req.type !== "pick" || player !== "p1" || req.intent === undefined) return undefined;
        if (req.options.every((id) => s.players.p2?.hand.includes(String(id)))) {
          options = names(s, req.options.map(String)) as string[];
          return req.options.filter((id) => nameOf(s, String(id)) === "Serra Angel");
        }
        return undefined;
      });
      expect(options).toEqual(["Bear Cub", "Serra Angel"]);
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
      expect(exiled(s, "Opt")).toHaveLength(1);
      // Avec une Fée : rien n'est exilé.
      let t = scenario({
        p1: { battlefield: ["Swamp", "Faerie Dreamthief"], hand: ["Ego Drain", "Opt"] },
        p2: { hand: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Ego Drain", { t: ["p2"] }));
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Faerie Dreamthief : surveillance 1 en arrivant ; {2}{B}, exilée du cimetière : piochez, perdez 1 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Faerie Dreamthief"], library: ["Opt", "Forest"] } });
      s = settle(cast(s, "p1", "Faerie Dreamthief"), (req) => (req.type === "pick" ? req.options : undefined));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      destroy(s, idOf(s, "p1", "battlefield", "Faerie Dreamthief"));
      s = settleAll(s);
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Faerie Dreamthief")));
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.players.p1?.life).toBe(19);
      expect(exiled(s, "Faerie Dreamthief")).toHaveLength(1);
    });

    it("Faerie Fencing : -X/-X, et -3/-3 de plus si vous contrôlez une Fée", () => {
      const run = (faerie: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 2), ...(faerie ? ["Faerie Dreamthief"] : [])], hand: ["Faerie Fencing"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = settle(cast(s, "p1", "Faerie Fencing", { t: [dragon] }, { x: 1 }));
        return pt(s, dragon);
      };
      expect(run(false)).toEqual([4, 4]);
      expect(run(true)).toEqual([1, 1]);
    });

    it("Stingblade Assassin : détruit une créature adverse blessée ce tour-ci ; une créature intacte n'est pas une cible", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Stingblade Assassin"] },
        p2: { battlefield: ["Serra Angel", { name: "Shivan Dragon", damage: 1 }] },
      });
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Stingblade Assassin"), (req) => {
        if (req.type === "pick") offered = names(s, req.options.map(String)) as string[];
        return undefined;
      });
      expect(offered).not.toContain("Serra Angel");
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Spellscorn Coven : chaque adversaire défausse ; Take It Back renvoie un sort dans la main de son propriétaire", () => {
      const COVEN = "Spellscorn Coven // Take It Back";
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        p2: { battlefield: [...lands("Swamp", 4), "Island"], hand: [COVEN, "Opt"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", COVEN), face: 1, targets: { t: [strike] } }));
      expect(idsOf(s, "p1", "hand", "Lightning Strike")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(20);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(act(s, "p2", { type: "cast", card: exiled(s, COVEN)[0] as string }));
      expect(s.players.p1?.hand).toHaveLength(hand - 1);
    });
  });

  describe("Rats", () => {
    it("Lord Skitter, Sewer King : un Rat au début de votre combat ; un autre Rat arrive : une carte d'un cimetière adverse exilée", () => {
      let s = scenario({ p1: { battlefield: ["Lord Skitter, Sewer King"] }, p2: { graveyard: ["Opt"] } });
      const opt = idOf(s, "p2", "graveyard", "Opt");
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      s = settle(s, pickIds([opt]));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
    });

    it("Rat Out : jusqu'à une créature prend -1/-1 ; vous créez un Rat qui ne peut pas bloquer", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Rat Out"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Rat Out", { t: [bear] }));
      expect(pt(s, bear)).toEqual([1, 1]);
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
    });

    it("Voracious Vermin : un Rat en arrivant ; une autre de vos créatures meurt : un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Voracious Vermin"] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Voracious Vermin"));
      const vermin = idOf(s, "p1", "battlefield", "Voracious Vermin");
      destroy(s, idOf(s, "p1", "battlefield", "Rat"));
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      s = settleAll(s);
      expect(s.objects[vermin]?.counters["+1/+1"]).toBe(1);
    });

    it("Lord Skitter's Butcher : sacrifiez une autre créature, regard 2, puis piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Lord Skitter's Butcher"], library: ["Opt", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lord Skitter's Butcher"), (req) => {
        if (req.intent === "triggerMode") return ["1"];
        if (req.type === "pick" && req.intent === "sacrifice") return [bear];
        return undefined;
      });
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Lord Skitter's Butcher : vos créatures gagnent la menace jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Lord Skitter's Butcher"] } });
      s = settle(cast(s, "p1", "Lord Skitter's Butcher"), (req) => (req.intent === "triggerMode" ? ["2"] : undefined));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Lord Skitter's Butcher")).keywords).toContain("menace");
    });
  });

  describe("Nourriture", () => {
    it("Sweettooth Witch et Experimental Confectioner : sacrifier une Nourriture fait perdre 2 PV et crée un Rat", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Experimental Confectioner"], hand: ["Sweettooth Witch"] },
      });
      s = settle(cast(s, "p1", "Sweettooth Witch"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Sweettooth Witch"), { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
    });

    it("Feed the Cauldron : détruit une créature de VM 3 ou moins ; une Nourriture seulement pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Feed the Cauldron"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Feed the Cauldron", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] })).toThrow();
      s = settle(cast(s, "p1", "Feed the Cauldron", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      let t = scenario({
        active: "p2",
        p1: { battlefield: lands("Swamp", 3), hand: ["Feed the Cauldron"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = act(t, "p2", { type: "pass" });
      t = settle(cast(t, "p1", "Feed the Cauldron", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(0);
    });

    it("Gumdrop Poisoner : -X/-X, X étant les points de vie gagnés ce tour-ci (Tempt with Treats : une Nourriture)", () => {
      const POISONER = "Gumdrop Poisoner // Tempt with Treats";
      let s = scenario({ p1: { battlefield: lands("Swamp", 7), hand: [POISONER] }, p2: { battlefield: ["Serra Angel"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", POISONER), face: 1 }));
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Food")));
      expect(s.players.p1?.life).toBe(23);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, POISONER)[0] as string }), pickIds([angel]));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Old Flitterfang : une Nourriture à l'étape de fin si une créature est morte ; {2}{B}, sacrifice : +2/+2", () => {
      let s = scenario({ p1: { battlefield: ["Old Flitterfang", "Bear Cub", ...lands("Swamp", 3)] } });
      const fang = idOf(s, "p1", "battlefield", "Old Flitterfang");
      s = settle(activate(s, "p1", fang, undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(pt(s, fang)).toEqual([5, 6]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      // Aucune créature morte ce tour-ci : rien.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Devouring Sugarmaw : à votre entretien, sans sacrifice elle s'engage ; Have for Dinner : un Humain et une Nourriture", () => {
      const MAW = "Devouring Sugarmaw // Have for Dinner";
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Plains"], hand: [MAW] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", MAW), face: 1 }));
      expect(idsOf(s, "p1", "battlefield", "Human")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, MAW)[0] as string }));
      const maw = idOf(s, "p1", "battlefield", MAW);
      // Premier entretien : on sacrifie la Nourriture ; second : rien à sacrifier pour garder la créature dégagée.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.pending?.kind === "choice");
      const food = idOf(s, "p1", "battlefield", "Food");
      s = settle(s, pickIds([food]));
      expect(s.objects[maw]?.tapped).toBe(false);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1");
      // Le jeton Humain peut encore être sacrifié : on refuse.
      expect(s.objects[maw]?.tapped).toBe(true);
    });

    it("Malevolent Witchkite : sacrifiez des artefacts, enchantements et/ou jetons, puis piochez autant", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Candy Trail", "Hopeless Nightmare", "Bear Cub"],
          hand: ["Malevolent Witchkite"],
        },
      });
      const sac = [idOf(s, "p1", "battlefield", "Candy Trail"), idOf(s, "p1", "battlefield", "Hopeless Nightmare")];
      let options: string[] = [];
      s = settle(cast(s, "p1", "Malevolent Witchkite"), (req) => {
        if (req.type !== "pick" || req.intent !== "sacrifice") return undefined;
        options = req.options.map(String);
        return sac;
      });
      expect(options.sort()).toEqual([...sac].sort());
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("Cimetière", () => {
    it("Lich-Knights' Conquest : autant de cartes de créature reviennent que de permanents sacrifiés", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 5), "Candy Trail", "Hopeless Nightmare"],
          hand: ["Lich-Knights' Conquest"],
          graveyard: ["Bear Cub", "Serra Angel", "Shivan Dragon"],
        },
      });
      const sac = [idOf(s, "p1", "battlefield", "Candy Trail"), idOf(s, "p1", "battlefield", "Hopeless Nightmare")];
      const back = [idOf(s, "p1", "graveyard", "Serra Angel"), idOf(s, "p1", "graveyard", "Shivan Dragon")];
      s = settle(cast(s, "p1", "Lich-Knights' Conquest"), pickIds([...sac, ...back]));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Fell Horseman : quand il meurt, il va au-dessous de la bibliothèque ; Deathly Ride rend une carte de créature", () => {
      const HORSEMAN = "Fell Horseman // Deathly Ride";
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: [HORSEMAN], graveyard: ["Bear Cub"], library: ["Opt"] },
      });
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", HORSEMAN),
          face: 1,
          targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] },
        }),
      );
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, HORSEMAN)[0] as string }));
      destroy(s, idOf(s, "p1", "battlefield", HORSEMAN));
      s = settleAll(s);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Opt", HORSEMAN]);
    });

    it("Specter of Mortality : exilez deux cartes de créature : chaque autre créature prend -2/-2", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 5), "Bear Cub"],
          hand: ["Specter of Mortality"],
          graveyard: ["Opt", "Serra Angel", "Shivan Dragon"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Specter of Mortality"), (req) => {
        if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
        offered = names(s, req.options.map(String)) as string[];
        return req.options;
      });
      expect(offered).toEqual(["Serra Angel", "Shivan Dragon"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Specter of Mortality"))).toEqual([3, 3]);
    });

    it("Virtue of Persistence : à votre entretien, une carte de créature d'un cimetière arrive sous votre contrôle", () => {
      let s = scenario({ p1: { battlefield: ["Virtue of Persistence // Locthwain Scorn"] }, p2: { graveyard: ["Serra Angel"] } });
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.owner).toBe("p2");
    });

    it("Locthwain Scorn : -3/-3 et vous gagnez 2 PV", () => {
      const VIRTUE = "Virtue of Persistence // Locthwain Scorn";
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: [VIRTUE] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", VIRTUE), face: 1, targets: { t: [angel] } }));
      expect(pt(s, angel)).toEqual([1, 1]);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Cruel Somnophage : F/E égales aux cartes de créature de tous les cimetières ; Can't Wake Up : meule quatre", () => {
      const SOMNO = "Cruel Somnophage // Can't Wake Up";
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Island"], hand: [SOMNO], graveyard: ["Bear Cub", "Opt"] },
        p2: { library: ["Serra Angel", "Shivan Dragon", "Island", "Opt", "Forest"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", SOMNO), face: 1, targets: { t: ["p2"] } }));
      expect(s.players.p2?.graveyard).toHaveLength(4);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, SOMNO)[0] as string }));
      expect(pt(s, idOf(s, "p1", "battlefield", SOMNO))).toEqual([3, 3]);
    });
  });

  describe("Autres", () => {
    it("Rankle's Prank : les trois modes ensemble (défausse, perte de PV, sacrifice)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Rankle's Prank", "Opt", "Island"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon", "Bear Cub"], hand: ["Opt", "Forest", "Island"] },
      });
      const card = idOf(s, "p1", "hand", "Rankle's Prank");
      // Le septième mode : les trois ensemble.
      s = settle(act(s, "p1", { type: "cast", card, mode: 6 }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([16, 16]);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
    });

    it("Taken by Nightmares : exile une créature ; regard 2 si vous contrôlez un enchantement", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Hopeless Nightmare"], hand: ["Taken by Nightmares"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      let scried = false;
      s = settle(cast(s, "p1", "Taken by Nightmares", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(scried).toBe(true);
    });

    it("Sugar Rush : +3/+0 et piochez une carte", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Sugar Rush"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Sugar Rush", { t: [bear] }));
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Callous Sell-Sword : un marqueur par créature morte sous votre contrôle ce tour-ci ; Burn Together", () => {
      const SWORD = "Callous Sell-Sword // Burn Together";
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2), "Serra Angel", "Bear Cub"], hand: [SWORD] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const card = idOf(s, "p1", "hand", SWORD);
      // « une autre cible » : la créature elle-même n'est pas une cible légale.
      expect(() => act(s, "p1", { type: "cast", card, face: 1, targets: { c: [angel], t: [angel] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { c: [angel], t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settleAll(s);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, SWORD)[0] as string }));
      const sword = idOf(s, "p1", "battlefield", SWORD);
      expect(s.objects[sword]?.counters["+1/+1"]).toBe(2);
    });
  });
});

describe("Wilds of Eldraine, lot A — rouge", () => {
  /**
   * Wilds of Eldraine, lot A — cartes rouges : chaque carte au comportement non trivial est confrontée à son texte Oracle
   * (plan R, lot R7) en jouant par des décisions. La Célébration est obtenue en lançant Redcap Thief (une créature et un
   * jeton Trésor : deux permanents non-terrain).
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Répond aux choix avec les valeurs voulues quand elles sont proposées (sinon la suggestion). */
  const want =
    (...values: ChoiceValue[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return values.includes("no") ? [0] : [1];
      if (req.type !== "pick") return undefined;
      const picked = values.filter((v) => req.options.includes(String(v))).slice(0, req.max);
      return picked.length > 0 ? picked : undefined;
    };

  /** Passe et répond aux choix jusqu'à `until` (ou un état sans décision). */
  const drive = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const stable = (x: S) => x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0;
  /** Passe une fois, puis jusqu'à une pile vide sans déclenchement en attente. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    return drive(cur, stable, answer);
  };
  /** Jusqu'au début du combat du joueur actif, déclenchements résolus. */
  const toCombat = (s: S, answer: Answer = () => undefined) =>
    drive(s, (x) => x.turn.step === "beginCombat" && stable(x), answer);
  /** Jusqu'à la déclaration des attaquants, puis attaque le joueur 2 avec ces créatures. */
  const attack = (s: S, ids: string[], answer: Answer = () => undefined) => {
    const cur = drive(s, (x) => x.pending?.kind === "declareAttackers", answer);
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: string) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Célébration : Redcap Thief arrive avec un jeton Trésor (trois Montagnes nécessaires). */
  const celebrate = (s: S) => settle(cast(s, "p1", "Redcap Thief"));
  const castOptions = (s: S, card: string) => legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === card);

  describe("Célébration", () => {
    it("Belligerent of the Ball : au début du combat, avec la Célébration, une de vos créatures gagne +1/+0 et la menace", () => {
      let s = scenario({
        p1: { battlefield: ["Belligerent of the Ball", "Bear Cub", ...lands("Mountain", 3)], hand: ["Redcap Thief"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = celebrate(s);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      s = toCombat(s, want(bear));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("menace");
    });

    it("Belligerent of the Ball : sans Célébration, rien ne se déclenche", () => {
      let s = scenario({ p1: { battlefield: ["Belligerent of the Ball", "Bear Cub"] } });
      s = toCombat(s);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([2, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Belligerent of the Ball")).keywords).not.toContain("menace");
    });

    it("Grand Ball Guest : +1/+1 et le piétinement tant que la Célébration est remplie", () => {
      let s = scenario({ p1: { battlefield: ["Grand Ball Guest", ...lands("Mountain", 3)], hand: ["Redcap Thief"] } });
      const guest = idOf(s, "p1", "battlefield", "Grand Ball Guest");
      expect(pt(s, guest)).toEqual([2, 2]);
      s = celebrate(s);
      expect(pt(s, guest)).toEqual([3, 3]);
      expect(chars(s, guest).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, guest)).toEqual([2, 2]);
    });

    it("Bespoke Battlegarb : la créature équipée gagne +2/+0 ; Célébration : il s'attache à une de vos créatures au début du combat", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bespoke Battlegarb", "Bear Cub", "Grand Ball Guest", ...lands("Mountain", 5)],
          hand: ["Redcap Thief"],
        },
      });
      const garb = idOf(s, "p1", "battlefield", "Bespoke Battlegarb");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const guest = idOf(s, "p1", "battlefield", "Grand Ball Guest");
      s = settle(activate(s, "p1", garb, { targets: { t: [bear] } }));
      expect(s.objects[garb]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([4, 2]);
      s = celebrate(s);
      s = toCombat(s, want(guest));
      expect(s.objects[garb]?.attachedTo).toBe(guest);
      expect(pt(s, bear)).toEqual([2, 2]);
      // Grand Ball Guest : 2/2, +1/+1 (Célébration), +2/+0 (équipée).
      expect(pt(s, guest)).toEqual([5, 3]);
    });

    it("Goddric : sans Célébration, Humain 3/3 sans vol ; avec, Dragon 4/4 volant dont {R} donne +1/+0 aux Dragons", () => {
      let s = scenario({ p1: { battlefield: ["Goddric, Cloaked Reveler", ...lands("Mountain", 4)], hand: ["Redcap Thief"] } });
      const god = idOf(s, "p1", "battlefield", "Goddric, Cloaked Reveler");
      expect(pt(s, god)).toEqual([3, 3]);
      expect(chars(s, god).keywords).not.toContain("flying");
      expect(chars(s, god).keywords).toContain("haste");
      expect(chars(s, god).subtypes).toEqual(expect.arrayContaining(["Human", "Noble"]));
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === god)).toBe(false);
      s = celebrate(s);
      expect(pt(s, god)).toEqual([4, 4]);
      expect(chars(s, god).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      expect(chars(s, god).subtypes).toEqual(["Dragon"]);
      s = settle(activate(s, "p1", god));
      expect(pt(s, god)).toEqual([5, 4]);
    });

    it("Raging Battle Mouse : le deuxième sort du tour coûte {1} de moins ; Célébration : +1/+1 à une de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raging Battle Mouse", "Bear Cub", ...lands("Mountain", 5)],
          hand: ["Redcap Thief", "Harried Spearguard"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Premier sort : {2}{R} payé en entier.
      s = celebrate(s);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(3);
      // Deuxième sort : Harried Spearguard ({R}) coûte toujours {R} (la réduction ne touche que le générique).
      s = settle(cast(s, "p1", "Harried Spearguard"));
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
      s = toCombat(s, want(bear));
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Raging Battle Mouse : le deuxième sort coûte {1} de moins (Redcap Thief pour {1}{R})", () => {
      let s = scenario({
        p1: { battlefield: ["Raging Battle Mouse", ...lands("Mountain", 3)], hand: ["Harried Spearguard", "Redcap Thief"] },
      });
      s = settle(cast(s, "p1", "Harried Spearguard"));
      // Il reste deux Montagnes : Redcap Thief ({2}{R}) n'est lançable que grâce à la réduction.
      s = settle(cast(s, "p1", "Redcap Thief"));
      expect(idsOf(s, "p1", "battlefield", "Redcap Thief")).toHaveLength(1);
    });
  });

  describe("Rôles", () => {
    it("Charming Scoundrel : en arrivant, mode « Rôle Malveillant » sur une de vos créatures (+1/+1)", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Charming Scoundrel"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Charming Scoundrel"), want("2", bear));
      expect(idsOf(s, "p1", "battlefield", "Wicked Role")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Charming Scoundrel")).keywords).toContain("haste");
    });

    it("Charming Scoundrel : mode « défaussez une carte, puis piochez une carte » et mode Trésor", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Charming Scoundrel", "Opt"], library: ["Island", "Forest"] },
      });
      s = settle(cast(s, "p1", "Charming Scoundrel"), want("0"));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      let t = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Charming Scoundrel"] } });
      t = settle(cast(t, "p1", "Charming Scoundrel"), want("1"));
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Cut In : 4 blessures à une créature et un Rôle Jeune héros sur jusqu'à une de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Cut In"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Cut In", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")], r: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Young Hero Role")]?.attachedTo).toBe(bear);
      // Le Rôle : en attaquant avec une endurance de 3 ou moins, un marqueur +1/+1.
      s = settle(attack(s, [bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Embereth Veteran : {1}, sacrifiez-le : un Rôle Jeune héros sur une autre créature ciblée (pas lui-même)", () => {
      let s = scenario({ p1: { battlefield: ["Embereth Veteran", "Bear Cub", "Mountain"] } });
      const vet = idOf(s, "p1", "battlefield", "Embereth Veteran");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => activate(s, "p1", vet, { targets: { t: [vet] } })).toThrow();
      s = settle(activate(s, "p1", vet, { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Embereth Veteran")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Young Hero Role")]?.attachedTo).toBe(bear);
    });

    it("Merry Bards : en payant {1}, un Rôle Jeune héros sur une créature ciblée que vous contrôlez ; sans payer, rien", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Merry Bards"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Merry Bards"), want(bear));
      expect(s.objects[idOf(s, "p1", "battlefield", "Young Hero Role")]?.attachedTo).toBe(bear);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Merry Bards"] } });
      t = settle(cast(t, "p1", "Merry Bards"), want("no"));
      expect(idsOf(t, "p1", "battlefield", "Young Hero Role")).toHaveLength(0);
    });

    it("Monstrous Rage : +2/+0 jusqu'à la fin du tour et un Rôle Monstre (+1/+1, piétinement) qui reste", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Monstrous Rage"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Monstrous Rage", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Twisted Fealty : vous gagnez le contrôle de la créature jusqu'à la fin du tour, dégagée et avec la célérité ; Rôle Malveillant", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Twisted Fealty"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true, sick: true }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Twisted Fealty", { targets: { t: [angel], r: [bear] } }));
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(chars(s, angel).keywords).toContain("haste");
      expect(pt(s, bear)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Witch's Mark : défaussez une carte pour en piocher deux ; un Rôle Malveillant sur une de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 2)],
          hand: ["Witch's Mark", "Opt"],
          library: ["Island", "Forest", "Plains"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Witch's Mark", { targets: { t: [bear] } }), want(opt));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Island"]);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Become Brutes : une ou deux créatures gagnent la célérité, chacune avec un Rôle Monstre", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", sick: true }, { name: "Grand Ball Guest", sick: true }, ...lands("Mountain", 2)],
          hand: ["Become Brutes"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const guest = idOf(s, "p1", "battlefield", "Grand Ball Guest");
      expect(() => cast(s, "p1", "Become Brutes", { targets: { a: [bear], b: [bear] } })).toThrow();
      s = settle(cast(s, "p1", "Become Brutes", { targets: { a: [bear], b: [guest] } }));
      expect(idsOf(s, "p1", "battlefield", "Monster Role")).toHaveLength(2);
      for (const id of [bear, guest]) expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      expect(pt(s, bear)).toEqual([3, 3]);
      // Les deux Rôles sont deux permanents non-terrain arrivés : Célébration pour Grand Ball Guest (+1/+1 de plus).
      expect(pt(s, guest)).toEqual([4, 4]);
    });
  });

  describe("Blessures", () => {
    it("Flick a Coin : 1 blessure à n'importe quelle cible, un Trésor et une carte piochée", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Flick a Coin"], library: ["Island"] } });
      s = settle(cast(s, "p1", "Flick a Coin", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(19);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
    });

    it("Frantic Firebolt : 2 plus les éphémères, rituels et cartes avec une Aventure de votre cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Frantic Firebolt"],
          graveyard: ["Opt", "Grabby Giant // That's Mine", "Bear Cub", "Forest"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Frantic Firebolt", { targets: { t: [angel] } }));
      // Opt et l'Aventure : 2 + 2 = 4 blessures, l'Ange (4/4) meurt.
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Frantic Firebolt"], graveyard: ["Opt", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      t = settle(cast(t, "p1", "Frantic Firebolt", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
      expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    });

    it("Stonesplitter Bolt : X blessures ; marchandé, deux fois X", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Candy Trail", ...lands("Mountain", 3)], hand: ["Stonesplitter Bolt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Stonesplitter Bolt", { targets: { t: [angel] }, x: 2 }));
      expect(s.objects[angel]?.damage).toBe(2);
      let t = setup();
      const candy = idOf(t, "p1", "battlefield", "Candy Trail");
      t = settle(
        cast(t, "p1", "Stonesplitter Bolt", {
          targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] },
          x: 2,
          kicked: true,
          sacrifice: [candy],
        }),
      );
      expect(idsOf(t, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Witchstalker Frenzy : coûte {1} de moins pour chaque créature qui a attaqué ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Grand Ball Guest", ...lands("Mountain", 2)], hand: ["Witchstalker Frenzy"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const card = idOf(s, "p1", "hand", "Witchstalker Frenzy");
      expect(castOptions(s, card)).toHaveLength(0);
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Grand Ball Guest")]);
      s = drive(s, (x) => x.pending?.kind === "priority");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Food Fight : vos artefacts ont « {2}, sacrifiez : 1 plus le nombre de Food Fight blessures à n'importe quelle cible »", () => {
      let s = scenario({ p1: { battlefield: ["Food Fight", "Food Fight", "Candy Trail", ...lands("Mountain", 2)] } });
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      const ff = idOf(s, "p1", "battlefield", "Food Fight");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ff)).toBe(false);
      s = settle(activate(s, "p1", candy, { targets: { t: ["p2"] } }, "Food Fight"));
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Unruly Catapult : {T} : 1 blessure à chaque adversaire ; se dégage quand vous lancez un éphémère ou un rituel", () => {
      let s = scenario({ p1: { battlefield: ["Unruly Catapult", "Island"], hand: ["Opt"] } });
      const cat = idOf(s, "p1", "battlefield", "Unruly Catapult");
      s = settle(activate(s, "p1", cat));
      expect(s.players.p2?.life).toBe(19);
      expect(s.objects[cat]?.tapped).toBe(true);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[cat]?.tapped).toBe(false);
      s = settle(activate(s, "p1", cat));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Realm-Scorcher Hellkite : marchandé, quatre mana de couleurs au choix ; {1}{R} : 1 blessure à n'importe quelle cible", () => {
      let s = scenario({ p1: { battlefield: ["Candy Trail", ...lands("Mountain", 6)], hand: ["Realm-Scorcher Hellkite"] } });
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      const colors = ["U", "G", "G", "B"];
      let k = 0;
      s = settle(cast(s, "p1", "Realm-Scorcher Hellkite", { kicked: true, sacrifice: [candy] }), (req) =>
        req.intent === "manaColor" ? [colors[k++] as string] : undefined,
      );
      expect(k).toBe(4);
      const pool = s.players.p1?.manaPool;
      expect([pool?.U, pool?.G, pool?.B]).toEqual([1, 2, 1]);
      const hk = idOf(s, "p1", "battlefield", "Realm-Scorcher Hellkite");
      let t = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Realm-Scorcher Hellkite"] } });
      t = settle(cast(t, "p1", "Realm-Scorcher Hellkite"));
      expect(Object.values(t.players.p1?.manaPool ?? {}).reduce((a, b) => a + b, 0)).toBe(0);
      expect(chars(s, hk).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      let u = scenario({ p1: { battlefield: ["Realm-Scorcher Hellkite", ...lands("Mountain", 2)] } });
      u = settle(activate(u, "p1", idOf(u, "p1", "battlefield", "Realm-Scorcher Hellkite"), { targets: { t: ["p2"] } }));
      expect(u.players.p2?.life).toBe(19);
    });
  });

  describe("Rats", () => {
    it("Gnawing Crescendo : +2/+0 ; ce tour-ci, une créature non-jeton que vous contrôlez qui meurt donne un Rat", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 7)],
          hand: ["Gnawing Crescendo", "Lightning Strike", "Lightning Strike"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Gnawing Crescendo"));
      expect(pt(s, bear)).toEqual([4, 2]);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(1);
      expect(chars(s, rats[0] as string).keywords).toContain("cantBlock");
      // Le Rat (un jeton) qui meurt ne donne rien.
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [rats[0] as string] } }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(0);
    });

    it("Harried Spearguard et Edgewall Pack : un Rat 1/1 noir qui ne peut pas bloquer (en mourant / en arrivant)", () => {
      let s = scenario({
        p1: { battlefield: ["Harried Spearguard", ...lands("Mountain", 6)], hand: ["Lightning Strike", "Edgewall Pack"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Harried Spearguard")] } }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
      s = settle(cast(s, "p1", "Edgewall Pack"));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(2);
      expect(pt(s, rats[1] as string)).toEqual([1, 1]);
      expect(chars(s, rats[1] as string).colors).toEqual(["B"]);
    });

    it("Tattered Ratter : un Rat que vous contrôlez qui devient bloqué gagne +2/+0", () => {
      let s = scenario({
        p1: { battlefield: ["Tattered Ratter", ...lands("Mountain", 4)], hand: ["Edgewall Pack"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Edgewall Pack"));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = attack(s, [rat]);
      s = drive(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: rat }],
      });
      s = drive(s, (x) => x.turn.step === "declareBlockers" && stable(x));
      expect(pt(s, rat)).toEqual([3, 1]);
    });

    it("Ogre Chitterlord : en arrivant et en attaquant, deux Rats ; puis avec cinq Rats ou plus, vos Rats gagnent +2/+0", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 10), hand: ["Edgewall Pack", "Ogre Chitterlord"] } });
      s = settle(cast(s, "p1", "Edgewall Pack"));
      s = settle(cast(s, "p1", "Ogre Chitterlord"));
      let rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(3);
      for (const r of rats) expect(pt(s, r)).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Ogre Chitterlord")]));
      rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(5);
      for (const r of rats) expect(pt(s, r)).toEqual([3, 1]);
    });

    it("Charging Hooligan : en attaquant, +1/+0 par créature attaquante ; le piétinement si un Rat attaque", () => {
      let s = scenario({
        p1: { battlefield: ["Charging Hooligan", "Bear Cub", "Edgewall Pack", ...lands("Mountain", 4)], hand: ["Edgewall Pack"] },
      });
      s = settle(cast(s, "p1", "Edgewall Pack"));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      const hool = idOf(s, "p1", "battlefield", "Charging Hooligan");
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(attack(s, [hool, idOf(s, "p1", "battlefield", "Bear Cub"), rat]));
      expect(pt(s, hool)).toEqual([6, 3]);
      expect(chars(s, hool).keywords).toContain("trample");
      let t = scenario({ p1: { battlefield: ["Charging Hooligan", "Bear Cub"] } });
      const h2 = idOf(t, "p1", "battlefield", "Charging Hooligan");
      t = settle(attack(t, [h2, idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(pt(t, h2)).toEqual([5, 3]);
      expect(chars(t, h2).keywords).not.toContain("trample");
    });
  });

  describe("Combat et autres", () => {
    it("Boundary Lands Ranger : au début du combat, avec une créature de force 4 ou plus, défaussez une carte pour en piocher une", () => {
      let s = scenario({
        p1: { battlefield: ["Boundary Lands Ranger", "Bellowing Bruiser // Beat a Path"], hand: ["Opt"], library: ["Island"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = toCombat(s, want(opt));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      let t = scenario({ p1: { battlefield: ["Boundary Lands Ranger", "Bear Cub"], hand: ["Opt"], library: ["Island"] } });
      t = toCombat(t, want(idOf(t, "p1", "hand", "Opt")));
      expect(t.players.p1?.hand.map((id) => nameOf(t, id))).toEqual(["Opt"]);
    });

    it("Kindled Heroism : +1/+0 et l'initiative jusqu'à la fin du tour, puis regard 1", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Kindled Heroism"], library: ["Island", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = false;
      s = settle(cast(s, "p1", "Kindled Heroism", { targets: { t: [bear] } }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
    });

    it("Ratcatcher Trainee : l'initiative pendant votre tour seulement ; Pest Problem : deux Rats", () => {
      let s = scenario({ p1: { battlefield: ["Ratcatcher Trainee // Pest Problem"] } });
      const trainee = idOf(s, "p1", "battlefield", "Ratcatcher Trainee // Pest Problem");
      expect(chars(s, trainee).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "priority");
      expect(chars(s, trainee).keywords).not.toContain("firstStrike");
      let t = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Ratcatcher Trainee // Pest Problem"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Ratcatcher Trainee // Pest Problem"), face: 1 }));
      expect(idsOf(t, "p1", "battlefield", "Rat")).toHaveLength(2);
      expect(exiled(t, "Ratcatcher Trainee // Pest Problem")).toHaveLength(1);
    });

    it("Beat a Path : jusqu'à deux créatures ciblées ne peuvent pas bloquer ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Bellowing Bruiser // Beat a Path"] },
        p2: { battlefield: ["Serra Angel", "Grand Ball Guest"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const guest = idOf(s, "p2", "battlefield", "Grand Ball Guest");
      const card = idOf(s, "p1", "hand", "Bellowing Bruiser // Beat a Path");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [angel, guest] } }));
      expect(chars(s, angel).keywords).toContain("cantBlock");
      expect(chars(s, guest).keywords).toContain("cantBlock");
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = drive(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: angel, attacker: idOf(s, "p1", "battlefield", "Bear Cub") }],
        }),
      ).toThrow();
    });

    it("Grabby Giant : {2}{R}, sacrifiez un artefact ou un terrain : piochez ; That's Mine : un Trésor", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Grabby Giant // That's Mine"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grabby Giant // That's Mine"), face: 1 }));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Grabby Giant // That's Mine", "Candy Trail", ...lands("Mountain", 3)], library: ["Island"] },
      });
      const giant = idOf(t, "p1", "battlefield", "Grabby Giant // That's Mine");
      t = settle(activate(t, "p1", giant, { sacrifice: [idOf(t, "p1", "battlefield", "Candy Trail")] }));
      expect(t.players.p1?.hand.map((id) => nameOf(t, id))).toEqual(["Island"]);
      expect(idsOf(t, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Korvold and the Noble Thief : I et II, un Trésor ; III, les trois cartes du dessus d'un adversaire exilées, jouables ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Korvold and the Noble Thief"] },
        p2: { library: ["Plains", "Plains", "Bear Cub", "Forest", "Opt", "Island"] },
      });
      s = settle(cast(s, "p1", "Korvold and the Noble Thief"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      // Le marqueur de savoir arrive au début de la phase principale : on résout le chapitre.
      s = drive(
        advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1"),
        stable,
      );
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
      s = drive(
        advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1"),
        stable,
      );
      expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const forest = exiled(s, "Forest")[0] as string;
      const bear = exiled(s, "Bear Cub")[0] as string;
      s = act(s, "p1", { type: "playLand", card: forest });
      s = settle(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Korvold and the Noble Thief")).toHaveLength(0);
    });

    it("Rotisserie Elemental : blessures de combat à un joueur, un marqueur brochette ; sacrifiée, exilez X cartes jouables ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: ["Rotisserie Elemental"], library: ["Bear Cub", "Forest", "Island"] } });
      const el = idOf(s, "p1", "battlefield", "Rotisserie Elemental");
      const keep: Answer = (req) => (req.intent === "sacrifice" && req.type === "pick" ? [] : undefined);
      const sacrifice: Answer = (req) => (req.intent === "sacrifice" && req.type === "pick" ? [el] : undefined);
      s = attack(s, [el]);
      s = drive(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority", keep);
      expect(s.players.p2?.life).toBe(19);
      expect(s.objects[el]?.counters.skewer).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Rotisserie Elemental")).toHaveLength(1);
      // Deuxième attaque : deux marqueurs, on la sacrifie.
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = attack(s, [el]);
      s = drive(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority", sacrifice);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Rotisserie Elemental")).toHaveLength(1);
      // Deux marqueurs brochette : les deux cartes du dessus sont exilées.
      expect(s.exile).toHaveLength(2);
      const playable = s.exile.filter((id) =>
        legalActions(s, "p1").some((a) => (a.type === "playLand" || a.type === "cast") && a.card === id),
      );
      expect(playable.length).toBeGreaterThan(0);
    });

    it("Virtue of Courage : une source que vous contrôlez inflige des blessures non de combat à un adversaire : exilez autant de cartes, jouables ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Virtue of Courage // Embereth Blaze", ...lands("Mountain", 2)],
          hand: ["Virtue of Courage // Embereth Blaze"],
          library: ["Bear Cub", "Forest", "Island"],
        },
      });
      const card = idOf(s, "p1", "hand", "Virtue of Courage // Embereth Blaze");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      // Deux blessures : deux cartes exilées.
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Forest")).toHaveLength(1);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const forest = exiled(s, "Forest")[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    });

    it("Virtue of Courage : les blessures de combat ne la déclenchent pas", () => {
      let s = scenario({
        p1: { battlefield: ["Virtue of Courage // Embereth Blaze", "Bear Cub"], library: ["Forest", "Island"] },
      });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      s = drive(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
      expect(s.players.p2?.life).toBe(18);
      expect(s.exile).toHaveLength(0);
    });

    it("Decadent Dragon : un Trésor en attaquant ; Expensive Taste : deux cartes d'un adversaire exilées, jouables tant qu'elles restent exilées", () => {
      let s = scenario({ p1: { battlefield: ["Decadent Dragon // Expensive Taste"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Decadent Dragon // Expensive Taste")]));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)], hand: ["Decadent Dragon // Expensive Taste"] },
        p2: { library: ["Bear Cub", "Forest", "Island"] },
      });
      const card = idOf(t, "p1", "hand", "Decadent Dragon // Expensive Taste");
      t = settle(act(t, "p1", { type: "cast", card, face: 1, targets: { t: ["p2"] } }));
      const bear = exiled(t, "Bear Cub")[0] as string;
      expect(bear).toBeTruthy();
      t = advanceUntil(t, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      t = settle(act(t, "p1", { type: "cast", card: bear }));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Imodane's Recruiter : en arrivant, vos créatures gagnent +1/+0 et la célérité ; Train Troops : deux Chevaliers 2/2 avec la vigilance", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Imodane's Recruiter // Train Troops"] },
      });
      s = settle(cast(s, "p1", "Imodane's Recruiter // Train Troops"));
      const rec = idOf(s, "p1", "battlefield", "Imodane's Recruiter // Train Troops");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(pt(s, rec)).toEqual([3, 2]);
      expect(chars(s, rec).keywords).toContain("haste");
      let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Imodane's Recruiter // Train Troops"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Imodane's Recruiter // Train Troops"), face: 1 }));
      const knights = idsOf(t, "p1", "battlefield", "Knight");
      expect(knights).toHaveLength(2);
      expect(chars(t, knights[0] as string).keywords).toContain("vigilance");
    });

    it("Picnic Ruiner : la double initiative en attaquant si vous contrôlez une créature de force 4 ou plus ; Stolen Goodies : trois marqueurs répartis", () => {
      let s = scenario({ p1: { battlefield: ["Picnic Ruiner // Stolen Goodies", "Bellowing Bruiser // Beat a Path"] } });
      const ruiner = idOf(s, "p1", "battlefield", "Picnic Ruiner // Stolen Goodies");
      s = settle(attack(s, [ruiner]));
      expect(chars(s, ruiner).keywords).toContain("doubleStrike");
      let t = scenario({ p1: { battlefield: ["Picnic Ruiner // Stolen Goodies", "Bear Cub"] } });
      const r2 = idOf(t, "p1", "battlefield", "Picnic Ruiner // Stolen Goodies");
      t = settle(attack(t, [r2]));
      expect(chars(t, r2).keywords).not.toContain("doubleStrike");
      let u = scenario({
        p1: { battlefield: ["Bear Cub", "Grand Ball Guest", ...lands("Forest", 4)], hand: ["Picnic Ruiner // Stolen Goodies"] },
      });
      const bear = idOf(u, "p1", "battlefield", "Bear Cub");
      const guest = idOf(u, "p1", "battlefield", "Grand Ball Guest");
      const card = idOf(u, "p1", "hand", "Picnic Ruiner // Stolen Goodies");
      u = settle(act(u, "p1", { type: "cast", card, face: 1, targets: { t: [bear, guest] } }));
      expect((u.objects[bear]?.counters["+1/+1"] ?? 0) + (u.objects[guest]?.counters["+1/+1"] ?? 0)).toBe(3);
      expect(u.objects[bear]?.counters["+1/+1"]).toBeGreaterThan(0);
      expect(u.objects[guest]?.counters["+1/+1"]).toBeGreaterThan(0);
    });

    it("Twice the Rage : la double initiative ; Ride the Rails : +2/+1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 4)],
          hand: ["Two-Headed Hunter // Twice the Rage", "Minecart Daredevil // Ride the Rails"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Two-Headed Hunter // Twice the Rage"),
          face: 1,
          targets: { t: [bear] },
        }),
      );
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Minecart Daredevil // Ride the Rails"),
          face: 1,
          targets: { t: [bear] },
        }),
      );
      expect(pt(s, bear)).toEqual([4, 3]);
    });
  });
});

describe("Wilds of Eldraine, lot A — vert", () => {
  /**
   * Wilds of Eldraine, lot A — cartes vertes : chaque carte au comportement non trivial est confrontée à son texte Oracle
   * (plan R, lot R7) en jouant par des décisions.
   */
  type S = GameState;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  /** Actions basées sur l'état, puis résolution de la pile et des déclenchements. */
  const settleAll = (s: S, answer?: Answer) => {
    while (stateBasedActions(s)) {}
    return settle(s, answer);
  };
  /** Choix « pick » : les options portant ces noms (dans l'ordre), sinon la suggestion ; « oui » aux questions. */
  const pickNames =
    (s: () => S, ...names: string[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const out: string[] = [];
      for (const n of names) {
        const id = req.options.find((o) => nameOf(s(), o) === n && !out.includes(o));
        if (id && out.length < req.max) out.push(id);
      }
      return out.length > 0 ? out : undefined;
    };
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attack = (s: S, ids: string[]) =>
    act(
      advanceUntil(s, (x) => x.pending?.kind === "declareAttackers"),
      "p1",
      {
        type: "declareAttackers",
        attackers: ids.map((id) => ({ id, defender: "p2" })),
      },
    );

  it("Agatha's Champion : marchandée, elle se bat contre une créature adverse ; sinon, aucun combat", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 5), "Candy Trail"], hand: ["Agatha's Champion"] },
        p2: { battlefield: ["Bear Cub"] },
      });
    let s = setup();
    const candy = idOf(s, "p1", "battlefield", "Candy Trail");
    s = settle(cast(s, "p1", "Agatha's Champion", undefined, { kicked: true, sacrifice: [candy] }));
    const champion = idOf(s, "p1", "battlefield", "Agatha's Champion");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[champion]?.damage).toBe(2);
    expect(chars(s, champion).keywords).toContain("trample");
    let t = setup();
    t = settle(cast(t, "p1", "Agatha's Champion"));
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Candy Trail")).toHaveLength(1);
  });

  it("Plant Beans : un terrain supplémentaire ce tour-ci ; Beanstalk Wurm se lance ensuite depuis l'exil", () => {
    const CARD = "Beanstalk Wurm // Plant Beans";
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: [CARD, "Forest", "Island"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    const adv = exiled(s, CARD)[0] as string;
    expect(castOptions(s, "p1", adv)).toHaveLength(1);
  });

  it("Bestial Bloodline : la créature enchantée gagne +2/+2 ; {4}{G} la renvoie du cimetière dans la main", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Bestial Bloodline"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Bestial Bloodline", { enchant: [bear] }));
    expect(pt(s, bear)).toEqual([4, 4]);
    let t = scenario({ p1: { battlefield: lands("Forest", 5), graveyard: ["Bestial Bloodline"] } });
    t = settle(activate(t, "p1", idOf(t, "p1", "graveyard", "Bestial Bloodline")));
    expect(handNames(t)).toEqual(["Bestial Bloodline"]);
  });

  describe("Blossoming Tortoise", () => {
    it("en arrivant : meulez trois cartes, puis une carte de terrain de votre cimetière revient engagée", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Blossoming Tortoise"], library: ["Opt", "Island", "Bear Cub", "Plains"] },
      });
      s = settle(cast(s, "p1", "Blossoming Tortoise"));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
    });

    it("les capacités activées de vos terrains coûtent {1} de moins ; vos créatures-terrains gagnent +1/+1", () => {
      const setup = (tortoise: boolean) =>
        scenario({ p1: { battlefield: [...(tortoise ? ["Blossoming Tortoise"] : []), "Restless Cottage", "Swamp", "Forest"] } });
      const without = setup(false);
      const cottage0 = idOf(without, "p1", "battlefield", "Restless Cottage");
      expect(legalActions(without, "p1").some((a) => a.type === "activate" && a.source === cottage0)).toBe(false);
      let s = setup(true);
      const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
      s = settle(activate(s, "p1", cottage));
      expect(pt(s, cottage)).toEqual([5, 5]);
      // Un terrain qui n'est pas une créature n'est pas concerné ; la Tortue non plus.
      expect(pt(s, idOf(s, "p1", "battlefield", "Blossoming Tortoise"))).toEqual([3, 3]);
    });
  });

  it("Brave the Wilds : marchandé, le terrain ciblé devient une créature Élémental 3/3 avec la célérité ; un terrain de base en main", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Candy Trail"], hand: ["Brave the Wilds"], library: ["Opt", "Plains"] },
    });
    const [, land] = idsOf(s, "p1", "battlefield", "Forest") as [string, string];
    const candy = idOf(s, "p1", "battlefield", "Candy Trail");
    s = settle(
      cast(s, "p1", "Brave the Wilds", { t: [land] }, { kicked: true, sacrifice: [candy] }),
      pickNames(() => s, "Plains"),
    );
    const c = chars(s, land);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Elemental"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toContain("haste");
    expect(handNames(s)).toEqual(["Plains"]);
    // Sans marchandage : seulement la recherche.
    let t = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Brave the Wilds"], library: ["Opt", "Plains"] } });
    const other = idsOf(t, "p1", "battlefield", "Forest")[1] as string;
    t = settle(
      cast(t, "p1", "Brave the Wilds", { t: [other] }),
      pickNames(() => t, "Plains"),
    );
    expect(chars(t, other).types).not.toContain("Creature");
    expect(handNames(t)).toEqual(["Plains"]);
  });

  it("Commune with Nature : une carte de créature parmi les cinq du dessus en main, le reste au-dessous", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest"],
        hand: ["Commune with Nature"],
        library: ["Opt", "Bear Cub", "Forest", "Serra Angel", "Island", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "Commune with Nature"), (req) => {
      if (req.type !== "pick") return undefined;
      expect(req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      return req.options.filter((id) => nameOf(s, id) === "Serra Angel");
    });
    expect(handNames(s)).toEqual(["Serra Angel"]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Plains");
    expect(s.players.p1?.library).toHaveLength(5);
  });

  it("Curse of the Werefox : un Rôle Monstre sur votre créature, puis elle se bat contre une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Curse of the Werefox"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Curse of the Werefox", { t: [mine] }));
    expect(pt(s, mine)).toEqual([3, 3]);
    expect(chars(s, mine).keywords).toContain("trample");
    expect(idsOf(s, "p1", "battlefield", "Monster Role")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[mine]?.damage).toBe(2);
  });

  it("Elvish Archivist : un ou plusieurs artefacts — deux marqueurs, une fois par tour ; un enchantement — une carte", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Elvish Archivist"],
        hand: ["Candy Trail", "Candy Trail", "Bestial Bloodline"],
      },
    });
    const elf = idOf(s, "p1", "battlefield", "Elvish Archivist");
    s = settle(cast(s, "p1", "Candy Trail"));
    s = settle(cast(s, "p1", "Candy Trail"));
    expect(s.objects[elf]?.counters["+1/+1"]).toBe(2);
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(cast(s, "p1", "Bestial Bloodline", { enchant: [elf] }));
    expect(s.players.p1?.hand).toHaveLength(hand);
  });

  it("Feral Encounter : une créature exilée parmi les cinq du dessus, lançable ce tour-ci ; au début du combat, votre créature blesse une créature adverse", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Shivan Dragon"],
        hand: ["Feral Encounter"],
        library: ["Opt", "Bear Cub", "Forest", "Island", "Plains", "Swamp"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(
      cast(s, "p1", "Feral Encounter"),
      pickNames(() => s, "Bear Cub"),
    );
    const cub = exiled(s, "Bear Cub")[0] as string;
    expect(cub).toBeDefined();
    expect(
      s.players.p1?.library
        .slice(-4)
        .map((id) => nameOf(s, id))
        .sort(),
    ).toEqual(["Forest", "Island", "Opt", "Plains"]);
    expect(castOptions(s, "p1", cub)).toHaveLength(1);
    s = settle(act(s, "p1", { type: "cast", card: cub }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(dragon)) return [dragon];
      return req.options.includes(angel) ? [angel] : undefined;
    });
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // Une seule fois : la capacité ne revient pas au combat d'un autre tour.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "beginCombat");
    expect(s.stack).toHaveLength(0);
  });

  it("Guard Change : un Rôle Monstre (+1/+1 et le piétinement) sur votre créature ; Ferocious Werefox se lance ensuite", () => {
    const CARD = "Ferocious Werefox // Guard Change";
    let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: [CARD] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1, targets: { t: [bear] } }));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(chars(s, bear).keywords).toContain("trample");
    s = settle(act(s, "p1", { type: "cast", card: exiled(s, CARD)[0] as string }));
    expect(chars(s, idOf(s, "p1", "battlefield", CARD)).keywords).toContain("trample");
  });

  it("Gruff Triplets : deux jetons copies (qui n'en créent pas) ; quand l'une meurt, les autres reçoivent autant de marqueurs que sa force", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Gruff Triplets"] } });
    s = settle(cast(s, "p1", "Gruff Triplets"));
    const triplets = idsOf(s, "p1", "battlefield", "Gruff Triplets");
    expect(triplets).toHaveLength(3);
    expect(triplets.filter((id) => s.objects[id]?.isToken)).toHaveLength(2);
    const [card, ...tokens] = [...triplets].sort((a, b) => Number(!!s.objects[a]?.isToken) - Number(!!s.objects[b]?.isToken));
    destroy(s, card as string);
    s = settleAll(s);
    for (const t of tokens) expect(pt(s, t)).toEqual([6, 6]);
  });

  it("Hollow Scavenger : {1}, sacrifiez une Nourriture : +2/+2, une seule fois par tour ; Bakery Raid crée une Nourriture", () => {
    let s = scenario({
      p1: { battlefield: ["Hollow Scavenger // Bakery Raid", "Candy Trail", "Candy Trail", ...lands("Forest", 2)] },
    });
    const wolf = idOf(s, "p1", "battlefield", "Hollow Scavenger // Bakery Raid");
    const [food] = idsOf(s, "p1", "battlefield", "Candy Trail") as [string];
    s = settle(activate(s, "p1", wolf, undefined, { sacrifice: [food] }));
    expect(pt(s, wolf)).toEqual([5, 4]);
    expect(idsOf(s, "p1", "battlefield", "Candy Trail")).toHaveLength(1);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === wolf)).toBe(false);
    let t = scenario({ p1: { battlefield: ["Forest"], hand: ["Hollow Scavenger // Bakery Raid"] } });
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Hollow Scavenger // Bakery Raid"), face: 1 }));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Howling Galefang : la célérité tant que vous possédez en exil une carte avec une Aventure", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Howling Galefang", sick: true }, "Forest"], hand: ["Hollow Scavenger // Bakery Raid"] },
    });
    const galefang = idOf(s, "p1", "battlefield", "Howling Galefang");
    expect(chars(s, galefang).keywords).not.toContain("haste");
    expect(chars(s, galefang).keywords).toContain("vigilance");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hollow Scavenger // Bakery Raid"), face: 1 }));
    expect(chars(s, galefang).keywords).toContain("haste");
  });

  it("The Huntsman's Redemption : I — une Bête 3/3 ; II — sacrifiez une créature pour chercher une créature ou un terrain de base", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["The Huntsman's Redemption"],
        library: ["Forest", "Island", "Bear Cub", "Opt", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "The Huntsman's Redemption"));
    const beast = idOf(s, "p1", "battlefield", "Beast");
    expect([pt(s, beast), chars(s, beast).colors]).toEqual([[3, 3], ["G"]]);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(
      s,
      pickNames(() => s, "Beast", "Bear Cub"),
    );
    expect(idsOf(s, "p1", "battlefield", "Beast")).toHaveLength(0);
    expect(handNames(s)).toContain("Bear Cub");
  });

  it("Leaping Ambush : +1/+3 et la portée jusqu'à la fin du tour, et la créature se dégage", () => {
    let s = scenario({ p1: { battlefield: ["Forest", { name: "Bear Cub", tapped: true }], hand: ["Leaping Ambush"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Leaping Ambush", { t: [bear] }));
    expect(pt(s, bear)).toEqual([3, 5]);
    expect(chars(s, bear).keywords).toContain("reach");
    expect(s.objects[bear]?.tapped).toBe(false);
  });

  describe("Night of the Sweets' Revenge", () => {
    it("en arrivant, une Nourriture ; vos Nourritures ont « {T} : ajoutez {G} »", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Night of the Sweets' Revenge"] } });
      s = settle(cast(s, "p1", "Night of the Sweets' Revenge"));
      const food = idOf(s, "p1", "battlefield", "Food");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === food && a.colors.includes("G"))).toBe(
        true,
      );
    });

    it("{5}{G}{G}, sacrifiez-le : vos créatures gagnent +X/+X, X étant le nombre de vos Nourritures", () => {
      let s = scenario({
        p1: { battlefield: ["Night of the Sweets' Revenge", "Candy Trail", "Candy Trail", "Bear Cub", ...lands("Forest", 7)] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Night of the Sweets' Revenge")));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(idsOf(s, "p1", "graveyard", "Night of the Sweets' Revenge")).toHaveLength(1);
    });
  });

  it("Redtooth Genealogist : un Rôle Royal (+1/+1 et la garde {1}) attaché à une autre de vos créatures", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Redtooth Genealogist"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Redtooth Genealogist"));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    expect(pt(s, idOf(s, "p1", "battlefield", "Redtooth Genealogist"))).toEqual([2, 3]);
  });

  it("Redtooth Vanguard : un enchantement arrive sous votre contrôle — payez {2} : elle revient du cimetière dans votre main", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Bestial Bloodline"], graveyard: ["Redtooth Vanguard"] },
    });
    s = settle(
      cast(s, "p1", "Bestial Bloodline", { enchant: [idOf(s, "p1", "battlefield", "Bear Cub")] }),
      pickNames(() => s),
    );
    expect(handNames(s)).toEqual(["Redtooth Vanguard"]);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped)).toHaveLength(4);
  });

  it("Return from the Wilds : deux modes au choix (un Humain 1/1 blanc et une Nourriture)", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Return from the Wilds"] } });
    const modes = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Return from the Wilds");
    expect(modes?.type === "cast" && modes.modes?.length).toBe(3);
    s = settle(cast(s, "p1", "Return from the Wilds", undefined, { mode: 2 }));
    const human = idOf(s, "p1", "battlefield", "Human");
    expect([pt(s, human), chars(s, human).colors]).toEqual([[1, 1], ["W"]]);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Rootrider Faun : {T} ajoute {G} ; {1}, {T} ajoute un mana de n'importe quelle couleur", () => {
    let s = scenario({ p1: { battlefield: ["Rootrider Faun", "Forest"] } });
    const faun = idOf(s, "p1", "battlefield", "Rootrider Faun");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === faun && a.colors.includes("G"))).toBe(true);
    s = activate(s, "p1", faun);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["B"] });
    expect(s.players.p1?.manaPool.B).toBe(1);
    expect(s.objects[faun]?.tapped).toBe(true);
  });

  it("Royal Treatment : la défense talismanique jusqu'à la fin du tour et un Rôle Royal", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Royal Treatment"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Royal Treatment", { t: [bear] }));
    expect(chars(s, bear).keywords).toContain("hexproof");
    expect(pt(s, bear)).toEqual([3, 3]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).keywords).not.toContain("hexproof");
    expect(pt(s, bear)).toEqual([3, 3]);
  });

  it("Skybeast Tracker, Up the Beanstalk, Tempest Hart : un sort de VM 5 ou plus donne une Nourriture, une carte et un marqueur", () => {
    let s = scenario({
      p1: {
        battlefield: ["Skybeast Tracker", "Tempest Hart // Scan the Clouds", "Up the Beanstalk", ...lands("Mountain", 8)],
        hand: ["Lightning Strike", "Shivan Dragon"],
      },
    });
    const hart = idOf(s, "p1", "battlefield", "Tempest Hart // Scan the Clouds");
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(1);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.objects[hart]?.counters["+1/+1"]).toBe(1);
  });

  it("Up the Beanstalk : en arrivant, piochez une carte", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Up the Beanstalk"] } });
    s = settle(cast(s, "p1", "Up the Beanstalk"));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Spider Food : détruit un artefact, un enchantement ou une créature avec le vol, et crée une Nourriture", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Spider Food"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    expect(() => cast(s, "p1", "Spider Food", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(cast(s, "p1", "Spider Food", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Stormkeld Vanguard : ne peut pas être bloquée par une créature de force 2 ou moins ; Bear Down détruit un artefact", () => {
    const CARD = "Stormkeld Vanguard // Bear Down";
    let s = scenario({ p1: { battlefield: [CARD] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
    const giant = idOf(s, "p1", "battlefield", CARD);
    s = attack(s, [giant]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: giant }] })).toThrow();
    act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: giant }],
    });
    let t = scenario({ p1: { battlefield: lands("Forest", 2), hand: [CARD] }, p2: { battlefield: ["Candy Trail"] } });
    const candy = idOf(t, "p2", "battlefield", "Candy Trail");
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", CARD), face: 1, targets: { t: [candy] } }));
    expect(idsOf(t, "p2", "graveyard", "Candy Trail")).toHaveLength(1);
  });

  it("Tanglespan Lookout : une Aura arrive sous votre contrôle — piochez une carte", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Tanglespan Lookout"], hand: ["Bestial Bloodline"] } });
    s = settle(cast(s, "p1", "Bestial Bloodline", { enchant: [idOf(s, "p1", "battlefield", "Tanglespan Lookout")] }));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Territorial Witchstalker : avec une créature de force 4 ou plus, +1/+0 et elle peut attaquer malgré le défenseur", () => {
    const setup = (big: boolean) =>
      scenario({ p1: { battlefield: ["Territorial Witchstalker", ...(big ? ["Serra Angel"] : ["Bear Cub"])] } });
    let s = advanceUntil(setup(true), (x) => x.pending?.kind === "declareAttackers");
    const wolf = idOf(s, "p1", "battlefield", "Territorial Witchstalker");
    expect(pt(s, wolf)).toEqual([3, 3]);
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wolf, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p2?.life).toBe(17);
    const t = advanceUntil(setup(false), (x) => x.pending?.kind === "declareAttackers");
    const wolf2 = idOf(t, "p1", "battlefield", "Territorial Witchstalker");
    expect(pt(t, wolf2)).toEqual([2, 3]);
    expect(() => act(t, "p1", { type: "declareAttackers", attackers: [{ id: wolf2, defender: "p2" }] })).toThrow();
  });

  it("Thunderous Debut : parmi les vingt cartes du dessus, jusqu'à deux créatures — sur le champ de bataille si marchandé, sinon en main", () => {
    const library = [
      ...lands("Island", 5),
      "Bear Cub",
      ...lands("Island", 10),
      "Serra Angel",
      ...lands("Island", 3),
      "Shivan Dragon",
    ];
    const setup = () =>
      scenario({ p1: { battlefield: [...lands("Forest", 8), "Candy Trail"], hand: ["Thunderous Debut"], library } });
    const answer =
      (s: () => S): Answer =>
      (req) => {
        if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
        expect(req.options.map((id) => nameOf(s(), id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
        return req.options;
      };
    let s = setup();
    const candy = idOf(s, "p1", "battlefield", "Candy Trail");
    s = settle(
      cast(s, "p1", "Thunderous Debut", undefined, { kicked: true, sacrifice: [candy] }),
      answer(() => s),
    );
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(19);
    let t = setup();
    t = settle(
      cast(t, "p1", "Thunderous Debut"),
      answer(() => t),
    );
    expect(handNames(t).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  it("Tough Cookie : une Nourriture en arrivant ; {2}{G} : un artefact non-créature devient une créature-artefact 4/4", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Tough Cookie"] } });
    s = settle(cast(s, "p1", "Tough Cookie"));
    const food = idOf(s, "p1", "battlefield", "Food");
    const cookie = idOf(s, "p1", "battlefield", "Tough Cookie");
    expect(() => activate(s, "p1", cookie, { t: [cookie] })).toThrow();
    s = settle(activate(s, "p1", cookie, { t: [food] }));
    const c = chars(s, food);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Food");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, food).types).not.toContain("Creature");
  });

  it("Troublemaker Ouphe : marchandé, exile un artefact ou un enchantement qu'un adversaire contrôle", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 2), "Candy Trail"], hand: ["Troublemaker Ouphe"] },
        p2: { battlefield: ["Candy Trail"] },
      });
    let s = setup();
    s = settle(
      cast(s, "p1", "Troublemaker Ouphe", undefined, { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] }),
    );
    expect(exiled(s, "Candy Trail")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Candy Trail")).toHaveLength(0);
    let t = setup();
    t = settle(cast(t, "p1", "Troublemaker Ouphe"));
    expect(idsOf(t, "p2", "battlefield", "Candy Trail")).toHaveLength(1);
  });

  it("Verdant Outrider : {1}{G} — ne peut pas être bloquée par une créature de force 2 ou moins ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Verdant Outrider", ...lands("Forest", 2)] }, p2: { battlefield: ["Bear Cub"] } });
    const knight = idOf(s, "p1", "battlefield", "Verdant Outrider");
    s = settle(activate(s, "p1", knight));
    s = attack(s, [knight]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: knight }] })).toThrow();
  });

  it("Virtue of Strength : un terrain de base engagé pour du mana en produit trois fois plus ; Garenbrig Growth renvoie une carte de créature", () => {
    let s = scenario({ p1: { battlefield: ["Virtue of Strength // Garenbrig Growth", "Forest", "Restless Cottage"] } });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    const a = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === forest);
    s = act(s, "p1", { type: "tapForMana", source: forest, ability: a?.type === "tapForMana" ? a.ability : 0, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(3);
    const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
    const b = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === cottage);
    s = act(s, "p1", { type: "tapForMana", source: cottage, ability: b?.type === "tapForMana" ? b.ability : 0, color: "B" });
    expect(s.players.p1?.manaPool.B).toBe(1);
    let t = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Virtue of Strength // Garenbrig Growth"], graveyard: ["Bear Cub", "Opt"] },
    });
    const card = idOf(t, "p1", "hand", "Virtue of Strength // Garenbrig Growth");
    const opt = idOf(t, "p1", "graveyard", "Opt");
    expect(() => act(t, "p1", { type: "cast", card, face: 1, targets: { t: [opt] } })).toThrow();
    t = settle(act(t, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(t, "p1", "graveyard", "Bear Cub")] } }));
    expect(handNames(t)).toEqual(["Bear Cub"]);
    expect(exiled(t, "Virtue of Strength // Garenbrig Growth")).toHaveLength(1);
  });

  it("Welcome to Sweettooth : I — un Humain ; II — une Nourriture ; III — 1 + (vos Nourritures) marqueurs +1/+1", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Welcome to Sweettooth"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Welcome to Sweettooth"));
    expect(idsOf(s, "p1", "battlefield", "Human")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(idsOf(s, "p1", "graveyard", "Welcome to Sweettooth")).toHaveLength(1);
  });

  describe("Questing Druid // Seek the Beast", () => {
    const CARD = "Questing Druid // Seek the Beast";

    it("un sort blanc, bleu, noir ou rouge que vous lancez : un marqueur +1/+1 ; un sort vert, rien", () => {
      let s = scenario({
        p1: { battlefield: [CARD, ...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Lightning Strike", "Titanic Growth"] },
      });
      const druid = idOf(s, "p1", "battlefield", CARD);
      s = settle(cast(s, "p1", "Titanic Growth", { t: [druid] }));
      expect(s.objects[druid]?.counters["+1/+1"]).toBeUndefined();
      expect(pt(s, druid)).toEqual([5, 5]);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.objects[druid]?.counters["+1/+1"]).toBe(1);
    });

    it("Seek the Beast : exile les deux cartes du dessus, jouables jusqu'à votre prochaine étape de fin", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: [CARD], library: ["Forest", "Bear Cub", "Island"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
      const forest = exiled(s, "Forest")[0] as string;
      const cub = exiled(s, "Bear Cub")[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
      s = act(s, "p1", { type: "playLand", card: forest });
      expect(castOptions(s, "p1", cub)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(s.exile).toContain(cub);
      expect(castOptions(s, "p1", cub)).toHaveLength(0);
    });

    it("Seek the Beast lancé pendant votre tour : plus jouables dès votre étape de fin (lot K7)", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: [CARD], library: ["Shock", "Opt", "Island"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
      const shock = exiled(s, "Shock")[0] as string;
      expect(castOptions(s, "p1", shock)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(s.turn.number).toBe(3);
      expect(castOptions(s, "p1", shock)).toHaveLength(0);
    });
  });

  it("Scan the Clouds : piochez deux cartes, puis défaussez-en deux", () => {
    const CARD = "Tempest Hart // Scan the Clouds";
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: [CARD, "Opt"], library: ["Bear Cub", "Forest", "Plains"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Intrepid Trufflesnout : en attaquant seule, une Nourriture ; avec une autre créature, rien", () => {
    const CARD = "Intrepid Trufflesnout // Go Hog Wild";
    let s = scenario({ p1: { battlefield: [CARD, "Bear Cub"] } });
    const boar = idOf(s, "p1", "battlefield", CARD);
    s = settle(attack(s, [boar]));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: [CARD, "Bear Cub"] } });
    t = settle(attack(t, [idOf(t, "p1", "battlefield", CARD), idOf(t, "p1", "battlefield", "Bear Cub")]));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(0);
  });

  it("Provisions Merchant : en attaquant, sacrifiez une Nourriture — les créatures attaquantes gagnent +1/+1 et le piétinement", () => {
    let s = scenario({ p1: { battlefield: ["Provisions Merchant", "Bear Cub", "Candy Trail"] } });
    const merchant = idOf(s, "p1", "battlefield", "Provisions Merchant");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(
      attack(s, [merchant, bear]),
      pickNames(() => s, "Candy Trail"),
    );
    expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(chars(s, bear).keywords).toContain("trample");
    expect(pt(s, merchant)).toEqual([4, 4]);
  });

  it("Wildwood Mentor : un jeton arrive — un marqueur +1/+1 ; en attaquant, une autre attaquante gagne +X/+X (sa force)", () => {
    let s = scenario({
      p1: { battlefield: ["Wildwood Mentor", "Bear Cub", "Forest"], hand: ["Hollow Scavenger // Bakery Raid"] },
    });
    const mentor = idOf(s, "p1", "battlefield", "Wildwood Mentor");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hollow Scavenger // Bakery Raid"), face: 1 }));
    expect(pt(s, mentor)).toEqual([2, 2]);
    s = settle(attack(s, [mentor, bear]));
    expect(pt(s, bear)).toEqual([4, 4]);
  });
});

describe("Wilds of Eldraine, lot A — multicolores, incolores et terrains", () => {
  /**
   * Wilds of Eldraine, lot A : cartes multicolores, incolores et terrains, confrontées à leur texte Oracle (R7).
   */
  type S = GameState;
  /** Options d'activation de la source (une par capacité activable). */
  const activations = (s: S, player: string, source: string) =>
    legalActions(s, player).flatMap((a) => (a.type === "activate" && a.source === source ? [a] : []));
  /** Active la capacité de la source dont le libellé contient `label` (la première sinon). */
  const activate = (
    s: S,
    player: string,
    source: string,
    opts: { label?: string; targets?: Record<string, string[]>; extra?: object } = {},
  ) => {
    const a = activations(s, player, source).find((x) => !opts.label || x.label?.includes(opts.label));
    if (!a) throw new Error(`aucune capacité « ${opts.label ?? ""} » activable`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets: opts.targets, ...opts.extra });
  };
  /** Va jusqu'à la déclaration des attaquants de p1, déclare ces attaquants (contre p2) et résout les déclenchements. */
  const attack = (s: S, ids: string[], answer?: Answer) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const FAERIE: CardDef = customCard({ name: "Test Faerie", subtypes: ["Faerie"], power: 1, toughness: 1 });
  const LEGEND: CardDef = customCard({ name: "Test Legend", supertypes: ["Legendary"], power: 2, toughness: 2 });
  const ENCHANTMENT: CardDef = customCard({ name: "Test Enchantment", types: ["Enchantment"], typeLine: "Enchantment" });
  const WALKER: CardDef = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 3 });
  const HASTY: CardDef = customCard({ name: "Test Hasty", keywords: ["haste"], power: 1, toughness: 1 });

  describe("Multicolores", () => {
    it("Ash, Party Crasher : en attaquant, un marqueur +1/+1 seulement avec la Célébration", () => {
      let s = scenario({
        p1: { battlefield: ["Ash, Party Crasher", ...lands("Mountain", 2)], hand: ["Gingerbrute", "Gingerbrute"] },
      });
      const ash = idOf(s, "p1", "battlefield", "Ash, Party Crasher");
      expect(counters(attack(s, [ash]), ash)).toBe(0);
      s = settle(cast(s, "p1", "Gingerbrute"));
      s = settle(cast(s, "p1", "Gingerbrute"));
      expect(counters(attack(s, [ash]), ash)).toBe(1);
    });

    it("The Goose Mother : X marqueurs +1/+1 et la moitié de X Nourritures arrondie au supérieur", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 3), ...lands("Island", 2)], hand: ["The Goose Mother"] } });
      s = settle(cast(s, "p1", "The Goose Mother", undefined, { x: 3 }));
      const goose = idOf(s, "p1", "battlefield", "The Goose Mother");
      expect(counters(s, goose)).toBe(3);
      expect(pt(s, goose)).toEqual([5, 5]);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(2);
    });

    it("The Goose Mother : en attaquant, vous pouvez sacrifier une Nourriture pour piocher une carte", () => {
      const run = (sacrifice: boolean) => {
        let s = scenario({ p1: { battlefield: ["The Goose Mother", "Candy Trail"] } });
        const candy = idOf(s, "p1", "battlefield", "Candy Trail");
        const hand = s.players.p1?.hand.length ?? 0;
        s = attack(s, [idOf(s, "p1", "battlefield", "The Goose Mother")], (req) =>
          req.type === "pick" && req.options.includes(candy) ? (sacrifice ? [candy] : []) : undefined,
        );
        return { drawn: (s.players.p1?.hand.length ?? 0) - hand, sacrificed: idsOf(s, "p1", "graveyard", "Candy Trail").length };
      };
      expect(run(true)).toEqual({ drawn: 1, sacrificed: 1 });
      expect(run(false)).toEqual({ drawn: 0, sacrificed: 0 });
    });

    it("Greta : une Nourriture en arrivant ; {G} + Nourriture : marqueur +1/+1 ; {1}{B} + Nourriture : piochez et perdez 1 PV", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), ...lands("Swamp", 3), "Bear Cub"],
          hand: ["Greta, Sweettooth Scourge"],
          library: lands("Island", 5),
        },
      });
      s = settle(cast(s, "p1", "Greta, Sweettooth Scourge"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      const greta = idOf(s, "p1", "battlefield", "Greta, Sweettooth Scourge");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", greta, { label: "marqueur", targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      // Plus de Nourriture : la capacité ne peut plus être activée.
      expect(activations(s, "p1", greta)).toHaveLength(0);
      const t = scenario({ p1: { battlefield: ["Greta, Sweettooth Scourge", "Candy Trail", ...lands("Swamp", 2)] } });
      const hand = t.players.p1?.hand.length ?? 0;
      const u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Greta, Sweettooth Scourge"), { label: "Piochez" }));
      expect(u.players.p1?.hand).toHaveLength(hand + 1);
      expect(u.players.p1?.life).toBe(19);
      expect(idsOf(u, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Neva : en arrivant, une carte de créature ou d'enchantement revient en main ; un enchantement mis au cimetière : marqueur et regard 1", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), ENCHANTMENT],
          hand: ["Neva, Stalked by Nightmares"],
          graveyard: ["Bear Cub", "Opt"],
        },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const bearCard = idOf(s, "p1", "graveyard", "Bear Cub");
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Neva, Stalked by Nightmares"), (req) => {
        if (req.type !== "pick" || !req.options.includes(bearCard)) return undefined;
        offered = req.options.map(String);
        return [bearCard];
      });
      // Un éphémère n'est pas une cible légale.
      expect(offered).not.toContain(opt);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      const neva = idOf(s, "p1", "battlefield", "Neva, Stalked by Nightmares");
      expect(chars(s, neva).keywords).toContain("menace");
      let scried = false;
      destroy(s, idOf(s, "p1", "battlefield", "Test Enchantment"));
      s = settle(act(s, "p1", { type: "pass" }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(counters(s, neva)).toBe(1);
      expect(scried).toBe(true);
    });

    it("Obyra : une autre Fée qui arrive sous votre contrôle fait perdre 1 PV à chaque adversaire", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Swamp", "Forest", "Forest"], hand: ["Obyra, Dreaming Duelist", FAERIE, "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Obyra, Dreaming Duelist"));
      expect(s.players.p2?.life).toBe(20);
      s = settle(cast(s, "p1", "Test Faerie"));
      expect(s.players.p2?.life).toBe(19);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p2?.life).toBe(19);
    });

    it("Totentanz : elle-même ou une autre créature non-jeton qui meurt crée un Rat ; un jeton qui meurt, non", () => {
      let s = scenario({ p1: { battlefield: ["Totentanz, Swarm Piper", "Bear Cub"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(act(s, "p1", { type: "pass" }));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(1);
      destroy(s, rats[0] as string);
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(0);
      destroy(s, idOf(s, "p1", "battlefield", "Totentanz, Swarm Piper"));
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
    });

    it("Totentanz : {1}{B} : un Rat attaquant que vous contrôlez gagne le contact mortel", () => {
      let s = scenario({ p1: { battlefield: ["Totentanz, Swarm Piper", "Bear Cub", ...lands("Swamp", 2)] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(act(s, "p1", { type: "pass" }));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      // Hors combat, aucun Rat attaquant : la capacité n'a pas de cible légale.
      expect(activations(s, "p1", idOf(s, "p1", "battlefield", "Totentanz, Swarm Piper"))).toHaveLength(0);
      (s.objects[rat] as { controlledSince: number }).controlledSince = 0;
      s.version += 1;
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: rat, defender: "p2" }] });
      const totentanz = idOf(s, "p1", "battlefield", "Totentanz, Swarm Piper");
      s = settle(activate(s, "p1", totentanz, { targets: { t: [rat] } }));
      expect(chars(s, rat).keywords).toContain("deathtouch");
    });

    it("Troyan : {G}{U} seulement pour un sort de VM 5 ou plus ; {U}, {T} : piochez, puis défaussez", () => {
      let s = scenario({ p1: { battlefield: ["Troyan, Gutsy Explorer"], hand: ["Bear Cub"] } });
      const troyan = idOf(s, "p1", "battlefield", "Troyan, Gutsy Explorer");
      s = settle(activate(s, "p1", troyan, { label: "Ajoutez" }));
      const restricted = s.players.p1?.restrictedMana?.map((m) => m.type).sort();
      expect(restricted).toEqual(["G", "U"]);
      // Bear Cub ({1}{G}, VM 2) ne peut pas être payé avec ce mana.
      expect(() => cast(s, "p1", "Bear Cub")).toThrow();
      const t = scenario({ p1: { battlefield: ["Troyan, Gutsy Explorer", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] } });
      let u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Troyan, Gutsy Explorer"), { label: "Ajoutez" }));
      // Shivan Dragon ({4}{R}{R}) : 4 Montagnes + {G}{U} restreints = 6 mana.
      u = settle(cast(u, "p1", "Shivan Dragon"));
      expect(idsOf(u, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      const v = scenario({
        p1: { battlefield: ["Troyan, Gutsy Explorer", "Island"], hand: ["Opt"], library: lands("Forest", 3) },
      });
      const w = settle(activate(v, "p1", idOf(v, "p1", "battlefield", "Troyan, Gutsy Explorer"), { label: "Piochez" }));
      expect(w.players.p1?.hand).toHaveLength(1);
      expect(w.players.p1?.graveyard).toHaveLength(1);
    });

    it("Will : {T} : vos sorts blancs et/ou bleus coûtent {X} de moins ce tour-ci, X étant les PV gagnés ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Will, Scion of Peace", "Gingerbrute", ...lands("Plains", 4), "Forest"],
          hand: ["Serra Angel", "Bear Cub"],
        },
      });
      const will = idOf(s, "p1", "battlefield", "Will, Scion of Peace");
      expect(chars(s, will).keywords).toContain("vigilance");
      // Gingerbrute : {2}, {T}, sacrifice : 3 PV (payés avec deux Plaines).
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Gingerbrute"), { label: "3 points de vie" }));
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(false);
      s = settle(activate(s, "p1", will));
      // Serra Angel ({3}{W}{W}) ne coûte plus que {W}{W} ; Bear Cub (vert) n'est pas réduit : {1}{G} avec la seule Forêt.
      s = settle(cast(s, "p1", "Serra Angel"));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(() => cast(s, "p1", "Bear Cub")).toThrow();
    });
  });

  describe("Incolores", () => {
    it("Collector's Vault : {2}, {T} : piochez, défaussez, puis un Trésor", () => {
      let s = scenario({ p1: { battlefield: ["Collector's Vault", ...lands("Island", 2)], library: lands("Forest", 3) } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Collector's Vault")));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Eriette's Tempting Apple : contrôle d'une créature jusqu'à la fin du tour, dégagée, avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Eriette's Tempting Apple"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Eriette's Tempting Apple"), (req) =>
        req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(chars(s, angel).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Eriette's Tempting Apple : {2}, {T}, sacrifice : 3 PV, ou un adversaire ciblé perd 3 PV", () => {
      const t = scenario({ p1: { battlefield: ["Eriette's Tempting Apple", ...lands("Swamp", 2)] } });
      const apple = idOf(t, "p1", "battlefield", "Eriette's Tempting Apple");
      expect(chars(t, apple).subtypes).toContain("Food");
      const u = settle(activate(t, "p1", apple, { label: "Gagnez" }));
      expect([u.players.p1?.life, u.players.p2?.life]).toEqual([23, 20]);
      const v = settle(activate(t, "p1", apple, { label: "perd 3", targets: { t: ["p2"] } }));
      expect([v.players.p1?.life, v.players.p2?.life]).toEqual([20, 17]);
      expect(idsOf(v, "p1", "graveyard", "Eriette's Tempting Apple")).toHaveLength(1);
    });

    it("Gingerbrute : {1} : ne peut être bloquée que par des créatures avec la célérité", () => {
      let s = scenario({ p1: { battlefield: ["Gingerbrute", "Mountain"] }, p2: { battlefield: ["Bear Cub", HASTY] } });
      const ginger = idOf(s, "p1", "battlefield", "Gingerbrute");
      expect(chars(s, ginger).keywords).toContain("haste");
      s = settle(activate(s, "p1", ginger, { label: "célérité" }));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: ginger, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const hasty = idOf(s, "p2", "battlefield", "Test Hasty");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: ginger }] })).toThrow();
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: hasty, attacker: ginger }] });
      expect(s.combat?.attackers[0]?.blocked).toBe(true);
    });

    it("Hylda's Crown of Winter : {1}, {T} : engagez une créature, {1} de moins pendant votre tour ; {3}, sacrifice : une carte par créature adverse engagée", () => {
      let s = scenario({
        p1: { battlefield: ["Hylda's Crown of Winter"] },
        p2: { battlefield: ["Bear Cub", { name: "Serra Angel", tapped: true }] },
      });
      const crown = idOf(s, "p1", "battlefield", "Hylda's Crown of Winter");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // Pendant votre tour, la capacité ne coûte que {T}.
      s = settle(activate(s, "p1", crown, { label: "Engagez", targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(true);
      const opp = scenario({ active: "p2", p1: { battlefield: ["Hylda's Crown of Winter"] }, p2: { battlefield: ["Bear Cub"] } });
      const passed = act(opp, "p2", { type: "pass" });
      expect(activations(passed, "p1", idOf(passed, "p1", "battlefield", "Hylda's Crown of Winter"))).toHaveLength(0);
      const t = scenario({
        p1: { battlefield: ["Hylda's Crown of Winter", ...lands("Island", 3)], library: lands("Forest", 4) },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, { name: "Serra Angel", tapped: true }, "Bear Cub"] },
      });
      const u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Hylda's Crown of Winter"), { label: "Piochez" }));
      expect(u.players.p1?.hand).toHaveLength(2);
    });

    it("The Irencrag : {T} : {C} ; une créature légendaire arrive : il peut devenir Everflame (Équiper {3}, +3/+3) et perd ses autres capacités", () => {
      let s = scenario({
        p1: {
          battlefield: ["The Irencrag", "Bear Cub", ...lands("Plains", 3)],
          hand: [LEGEND, { ...LEGEND, id: "test-legend-2", name: "Test Legend Two" }],
        },
      });
      const crag = idOf(s, "p1", "battlefield", "The Irencrag");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === crag)).toBe(true);
      // Une créature non légendaire ne déclenche rien ; une légendaire, si.
      s = settle(cast(s, "p1", "Test Legend"), (req) => (req.intent === "may" ? [1] : undefined));
      const c = chars(s, crag);
      expect(c.name).toBe("Everflame, Heroes' Legacy");
      expect(c.subtypes).toContain("Equipment");
      expect(c.supertypes).toContain("Legendary");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === crag)).toBe(false);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", crag, { label: "Équiper", targets: { t: [bear] } }));
      expect(s.objects[crag]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([5, 5]);
    });

    it("The Irencrag : vous pouvez refuser ; il reste un artefact qui produit {C}", () => {
      let s = scenario({ p1: { battlefield: ["The Irencrag", ...lands("Plains", 2)], hand: [LEGEND] } });
      const crag = idOf(s, "p1", "battlefield", "The Irencrag");
      s = settle(cast(s, "p1", "Test Legend"), (req) => (req.intent === "may" ? [0] : undefined));
      expect(chars(s, crag).name).toBe("The Irencrag");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === crag)).toBe(true);
    });

    it("Prophetic Prism : piochez en arrivant ; {1}, {T} : un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Prophetic Prism"], library: lands("Island", 3) } });
      s = settle(cast(s, "p1", "Prophetic Prism"));
      expect(s.players.p1?.hand).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Prophetic Prism")), (req) =>
        req.intent === "manaColor" ? ["B"] : undefined,
      );
      expect(s.players.p1?.manaPool.B).toBe(1);
    });

    it("Scarecrow Guide : {1} : un mana de n'importe quelle couleur, une seule fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["Scarecrow Guide", ...lands("Forest", 2)] } });
      const guide = idOf(s, "p1", "battlefield", "Scarecrow Guide");
      expect(chars(s, guide).keywords).toContain("reach");
      s = settle(activate(s, "p1", guide), (req) => (req.intent === "manaColor" ? ["R"] : undefined));
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(activations(s, "p1", guide)).toHaveLength(0);
    });

    it("Syr Ginger : piétinement, défense talismanique et célérité seulement si un adversaire contrôle un planeswalker", () => {
      const s = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender"] } });
      const ginger = idOf(s, "p1", "battlefield", "Syr Ginger, the Meal Ender");
      expect(chars(s, ginger).keywords).not.toContain("hexproof");
      const t = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender", WALKER] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Syr Ginger, the Meal Ender")).keywords).not.toContain("hexproof");
      const u = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender"] }, p2: { battlefield: [WALKER] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Syr Ginger, the Meal Ender")).keywords).toEqual(
        expect.arrayContaining(["trample", "hexproof", "haste"]),
      );
    });

    it("Syr Ginger : un autre artefact mis au cimetière : marqueur et regard 1 ; {2}, {T}, sacrifice : PV égaux à sa force", () => {
      let s = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender", "Candy Trail", ...lands("Plains", 2)] } });
      const ginger = idOf(s, "p1", "battlefield", "Syr Ginger, the Meal Ender");
      let scried = false;
      destroy(s, idOf(s, "p1", "battlefield", "Candy Trail"));
      s = settle(act(s, "p1", { type: "pass" }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(counters(s, ginger)).toBe(1);
      expect(scried).toBe(true);
      expect(pt(s, ginger)).toEqual([4, 2]);
      s = settle(activate(s, "p1", ginger));
      expect(s.players.p1?.life).toBe(24);
      expect(idsOf(s, "p1", "graveyard", "Syr Ginger, the Meal Ender")).toHaveLength(1);
    });

    it("Three Bowls of Porridge : chaque mode une seule fois (2 blessures, engager, sacrifice et 3 PV)", () => {
      let s = scenario({
        p1: { battlefield: ["Three Bowls of Porridge", ...lands("Plains", 6)] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const bowls = idOf(s, "p1", "battlefield", "Three Bowls of Porridge");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", bowls, { label: "2 blessures", targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      (s.objects[bowls] as { tapped: boolean }).tapped = false;
      expect(activations(s, "p1", bowls).map((a) => a.label)).not.toContain("2 blessures à une créature");
      s = settle(activate(s, "p1", bowls, { label: "Engagez", targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      (s.objects[bowls] as { tapped: boolean }).tapped = false;
      expect(activations(s, "p1", bowls).map((a) => a.label)).toEqual(["Sacrifiez-le et gagnez 3 points de vie"]);
      s = settle(activate(s, "p1", bowls, { label: "Sacrifiez" }));
      expect(s.players.p1?.life).toBe(23);
      expect(idsOf(s, "p1", "graveyard", "Three Bowls of Porridge")).toHaveLength(1);
    });
  });

  describe("Terrains", () => {
    it("Crystal Grotto : regard 1 en arrivant ; {T} : {C} ; {1}, {T} : un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Crystal Grotto"] } });
      let scried = false;
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Crystal Grotto") }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      const grotto = idOf(s, "p1", "battlefield", "Crystal Grotto");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === grotto && a.colors.includes("C"))).toBe(
        true,
      );
      s = settle(activate(s, "p1", grotto), (req) => (req.intent === "manaColor" ? ["W"] : undefined));
      expect(s.players.p1?.manaPool.W).toBe(1);
    });

    it("Edgewall Inn : arrive engagée, produit la couleur choisie ; {3}, {T}, sacrifice : une carte avec une Aventure revient en main", () => {
      let s = scenario({ p1: { hand: ["Edgewall Inn"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Edgewall Inn") });
      const inn = idOf(s, "p1", "battlefield", "Edgewall Inn");
      expect(s.objects[inn]?.tapped).toBe(true);
      // Un terrain joué prend le choix par défaut (approximation générale « choix auto ») : seule cette couleur est produite.
      const chosen = s.objects[inn]?.chosen?.color;
      expect(chosen).toBeDefined();
      (s.objects[inn] as { tapped: boolean }).tapped = false;
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === inn ? a.colors : []));
      expect(colors).toEqual([chosen]);
      const t = scenario({
        p1: { battlefield: ["Edgewall Inn", ...lands("Forest", 3)], graveyard: ["Bramble Familiar // Fetch Quest", "Bear Cub"] },
      });
      const inn2 = idOf(t, "p1", "battlefield", "Edgewall Inn");
      const bear = idOf(t, "p1", "graveyard", "Bear Cub");
      expect(() => activate(t, "p1", inn2, { label: "Aventure", targets: { t: [bear] } })).toThrow();
      const card = idOf(t, "p1", "graveyard", "Bramble Familiar // Fetch Quest");
      const u = settle(activate(t, "p1", inn2, { label: "Aventure", targets: { t: [card] } }));
      expect(idsOf(u, "p1", "hand", "Bramble Familiar // Fetch Quest")).toHaveLength(1);
      expect(idsOf(u, "p1", "graveyard", "Edgewall Inn")).toHaveLength(1);
    });

    it("Restless Vinestalk : Plante 5/5 avec le piétinement ; en attaquant, une autre créature a une F/E de base de 3/3", () => {
      let s = scenario({
        p1: { battlefield: ["Restless Vinestalk", ...lands("Forest", 4), "Island"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const vine = idOf(s, "p1", "battlefield", "Restless Vinestalk");
      expect(
        legalActions(s, "p1")
          .flatMap((a) => (a.type === "tapForMana" && a.source === vine ? a.colors : []))
          .sort(),
      ).toEqual(["G", "U"]);
      s = settle(activate(s, "p1", vine));
      const c = chars(s, vine);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toContain("Plant");
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([5, 5, ["G", "U"]]);
      expect(c.keywords).toContain("trample");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: vine, defender: "p2" }] });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
      if (s.pending?.kind === "choice") throw new Error("choix inattendu");
      expect(pt(s, angel)).toEqual([3, 3]);
    });

    it("Restless Fortress : Cauchemar 1/4 ; en attaquant, le joueur défenseur perd 2 PV et vous en gagnez 2", () => {
      let s = scenario({ p1: { battlefield: ["Restless Fortress", ...lands("Plains", 2), ...lands("Swamp", 2)] } });
      const fortress = idOf(s, "p1", "battlefield", "Restless Fortress");
      s = settle(activate(s, "p1", fortress));
      expect(pt(s, fortress)).toEqual([1, 4]);
      expect(chars(s, fortress).subtypes).toContain("Nightmare");
      s = attack(s, [fortress]);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });

    it("Restless Spire : Élémental 2/1 avec l'initiative pendant votre tour ; en attaquant, regard 1", () => {
      let s = scenario({ p1: { battlefield: ["Restless Spire", "Island", "Mountain"] } });
      const spire = idOf(s, "p1", "battlefield", "Restless Spire");
      s = settle(activate(s, "p1", spire));
      expect(pt(s, spire)).toEqual([2, 1]);
      expect(chars(s, spire).keywords).toContain("firstStrike");
      let scried = false;
      s = attack(s, [spire], (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      // Pendant le tour adverse, l'initiative ne s'applique pas.
      const t = scenario({ active: "p2", p1: { battlefield: ["Restless Spire", "Island", "Mountain"] } });
      let u = act(t, "p2", { type: "pass" });
      u = settle(activate(u, "p1", idOf(u, "p1", "battlefield", "Restless Spire")));
      expect(chars(u, idOf(u, "p1", "battlefield", "Restless Spire")).keywords).not.toContain("firstStrike");
    });

    it("Restless Bivouac : Bœuf 2/2 ; en attaquant, un marqueur +1/+1 sur une créature que vous contrôlez", () => {
      let s = scenario({ p1: { battlefield: ["Restless Bivouac", "Bear Cub", "Plains", ...lands("Mountain", 2)] } });
      const bivouac = idOf(s, "p1", "battlefield", "Restless Bivouac");
      s = settle(activate(s, "p1", bivouac));
      expect(pt(s, bivouac)).toEqual([2, 2]);
      expect(chars(s, bivouac).subtypes).toContain("Ox");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bivouac], (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(counters(s, bear)).toBe(1);
    });
  });
});

describe("Wilds of Eldraine, lot B1 : créatures enchantées", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  /** Attache directement un Rôle (jeton Aura) d'un joueur à une créature. */
  const giveRole = (s: S, token: TokenSpec, to: string, controller = "p1") => {
    const r = {
      item: { id: "x", controller, sourceId: to, sourceDefId: s.objects[to]?.defId, targets: { t: [to] } },
      controller,
      targets: { t: [to] },
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    for (const e of createRole(token).flat()) if (e.op !== "if") runEffect(s, r, e);
  };

  it("Archon of the Wild Rose : vos autres créatures enchantées par vos Auras sont 4/4 avec le vol", () => {
    const s = scenario({ p1: { battlefield: ["Archon of the Wild Rose", "Bear Cub", "Llanowar Elves"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    giveRole(s, MONSTER_ROLE, bear, "p1");
    giveRole(s, MONSTER_ROLE, elves, "p2");
    // 4/4 de base, plus le Rôle Monstre : 5/5 volante.
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
    expect(chars(s, bear).keywords).toContain("flying");
    // L'Aura de l'adversaire ne compte pas.
    expect(chars(s, elves).power).toBe(2);
  });

  it("A Tale for the Ages et Syr Armont : vos créatures enchantées, par n'importe quelle Aura, ont le bonus", () => {
    const s = scenario({ p1: { battlefield: ["A Tale for the Ages", "Syr Armont, the Redeemer", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    giveRole(s, MONSTER_ROLE, bear, "p2");
    expect(chars(s, bear).power).toBe(2 + 1 + 2 + 1);
  });

  it("Lord Skitter's Blessing : avec une créature enchantée, une carte de plus et 1 PV à votre pioche", () => {
    let s = scenario({ p1: { battlefield: ["Lord Skitter's Blessing", "Bear Cub"], library: lands("Swamp", 5) }, step: "end" });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, WICKED_ROLE, bear);
    const hand = s.players.p1?.hand.length ?? 0;
    s = passAccepting(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(2);
    expect(s.players.p1?.life).toBe(19);
  });

  it("Graceful Takedown : chaque créature ciblée inflige des blessures égales à sa force à la cible adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Bear Cub", "Llanowar Elves"], hand: ["Graceful Takedown"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    giveRole(s, MONSTER_ROLE, bear);
    s = settleAll(s);
    const card = idOf(s, "p1", "hand", "Graceful Takedown");
    s = settleAll(act(s, "p1", { type: "cast", card, targets: { e: [bear], o: [elves], t: [wurm] } }));
    expect(s.objects[wurm]?.damage).toBe(3 + 1);
  });

  it("Eriette of the Charmed Apple : une créature enchantée par votre Aura ne peut pas vous attaquer ; drain de X", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Eriette of the Charmed Apple"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, CURSED_ROLE, bear, "p2");
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] })).toThrow();
    // À l'étape de fin de p2 : une Aura (le Rôle) → p1 perd 1, p2 gagne 1.
    s = act(s, "p1", { type: "declareAttackers", attackers: [] });
    s = advanceUntil(s, (x) => x.turn.number === 5);
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p2?.life).toBe(21);
  });
});

describe("Wilds of Eldraine, lot B2 : « vous engagez une créature adverse »", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  /** Un effet de `controller` qui engage la créature (comme le ferait un sort ou une capacité). */
  const tapBy = (s: S, controller: string, id: string) => {
    const r = {
      item: { id: "x", controller, sourceId: id, sourceDefId: s.objects[id]?.defId, targets: { t: [id] } },
      controller,
      targets: { t: [id] },
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    s.resolving = r as never;
    runEffect(s, r, dsl.fx.tap(dsl.ref.target()));
    s.resolving = null;
  };

  it("Solitary Sanctuary : en arrivant, engage et étourdit ; un marqueur +1/+1 quand vous engagez une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Solitary Sanctuary"] },
      p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Solitary Sanctuary") });
    s = settleAll(s);
    expect(s.objects[wurm]?.tapped).toBe(true);
    expect(s.objects[wurm]?.counters.stun).toBe(1);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    // L'adversaire qui engage sa propre créature ne déclenche rien.
    tapBy(s, "p2", idOf(s, "p2", "battlefield", "Shivan Dragon"));
    s = settleAll(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Sharae of Numbing Depths : piochez une carte la première fois du tour seulement", () => {
    let s = scenario({
      p1: { battlefield: ["Sharae of Numbing Depths"], library: lands("Island", 3) },
      p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    tapBy(s, "p1", idOf(s, "p2", "battlefield", "Pelakka Wurm"));
    s = settleAll(s);
    tapBy(s, "p1", idOf(s, "p2", "battlefield", "Shivan Dragon"));
    s = settleAll(s);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(1);
  });

  it("Icewrought Sentry : +2/+1 quand vous engagez une créature adverse, pas quand l'adversaire l'engage", () => {
    let s = scenario({ p1: { battlefield: ["Icewrought Sentry"] }, p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] } });
    const sentry = idOf(s, "p1", "battlefield", "Icewrought Sentry");
    tapBy(s, "p2", idOf(s, "p2", "battlefield", "Pelakka Wurm"));
    s = settleAll(s);
    expect(chars(s, sentry).power).toBe(2);
    tapBy(s, "p1", idOf(s, "p2", "battlefield", "Shivan Dragon"));
    s = settleAll(s);
    expect(chars(s, sentry).power).toBe(4);
  });

  it("Hylda of the Icy Crown : vous pouvez payer {1} ; quand vous le faites, choisissez un mode (PLAN-D, D6)", () => {
    const start = () => {
      const s = scenario({ p1: { battlefield: ["Hylda of the Icy Crown", "Plains"] }, p2: { battlefield: ["Pelakka Wurm"] } });
      tapBy(s, "p1", idOf(s, "p2", "battlefield", "Pelakka Wurm"));
      return s;
    };
    // {1} d'abord, puis le mode, choisi à la mise sur la pile de la capacité réflexive.
    const asked: string[] = [];
    let s = settle(start(), (req) => {
      asked.push(req.intent);
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "triggerMode") {
        expect(req.options).toEqual(["0", "1", "2"]);
        return ["1"];
      }
      return undefined;
    });
    expect(asked).toEqual(["may", "triggerMode"]);
    const hylda = idOf(s, "p1", "battlefield", "Hylda of the Icy Crown");
    expect(s.objects[hylda]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    // Sans payer : aucun mode n'est demandé.
    const asked2: string[] = [];
    s = settle(start(), (req) => {
      asked2.push(req.intent);
      return req.type === "yesNo" ? [0] : undefined;
    });
    expect(asked2).toEqual(["may"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hylda of the Icy Crown")]?.counters["+1/+1"]).toBeUndefined();
    // Mode par défaut : l'Élémental 4/4.
    s = settle(start());
    expect(s.battlefield.filter((id) => chars(s, id).name === "Elemental")).toHaveLength(1);
  });

  it("Une capacité déclenchée modale accordée garde ses modes (PLAN-D, D6)", () => {
    const banner = customCard({
      name: "Bannière modale",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [
        dsl.staticAbility(
          { types: ["Creature"], controller: "you" },
          {
            addAbilities: [
              dsl.triggeredModal(dsl.when.attacksSelf, [
                dsl.mode("Gagnez 2 PV", [], [dsl.fx.gainLife(2)]),
                dsl.mode("Piochez une carte", [], [dsl.fx.draw(1)]),
              ]),
            ],
          },
        ),
      ],
    });
    let s = scenario({ p1: { battlefield: [banner, "Bear Cub"], library: lands("Island", 3) } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }] });
    const asked: string[] = [];
    s = settle(s, (req) => {
      asked.push(req.intent);
      return req.intent === "triggerMode" ? ["1"] : undefined;
    });
    expect(asked[0]).toBe("triggerMode");
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
  });
});

describe("Wilds of Eldraine, lot B3 : un Rôle pour chaque créature", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const roleOn = (s: S, host: string) =>
    s.battlefield.filter((id) => s.objects[id]?.attachedTo === host).map((id) => chars(s, id).name);

  it("Asinine Antics : un Rôle Maudit sur chaque créature adverse ; lançable en flash pour {2} de plus", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Asinine Antics"] },
      p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "pass" });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Asinine Antics") }));
    for (const name of ["Pelakka Wurm", "Shivan Dragon"]) {
      const id = idOf(s, "p2", "battlefield", name);
      expect(roleOn(s, id)).toEqual(["Cursed Role"]);
      expect(chars(s, id).power).toBe(1);
    }
    expect(s.players.p1?.manaPool.U ?? 0).toBe(0);
  });

  it("Twisted Sewer-Witch : un Rat, puis un Rôle Méchant attaché à chaque Rat", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 5)], hand: ["Twisted Sewer-Witch"] } });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Twisted Sewer-Witch") }));
    const rats = s.battlefield.filter((id) => chars(s, id).name === "Rat");
    expect(rats).toHaveLength(1);
    expect(roleOn(s, rats[0] as string)).toEqual(["Wicked Role"]);
    expect(chars(s, rats[0] as string).power).toBe(2);
  });
});

describe("Wilds of Eldraine, lot B4 : « coûte moins s'il est marchandé »", () => {
  it("Hamlet Glutton : {2} de moins en marchandant (un jeton sacrifié), prix plein sinon", () => {
    const s = scenario({ p1: { battlefield: [...lands("Forest", 5)], hand: ["Hamlet Glutton"] } });
    const card = idOf(s, "p1", "hand", "Hamlet Glutton");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    // Cinq terrains et pas de quoi marchander : {5}{G}{G} est hors d'atteinte.
    expect(opt).toBeUndefined();
    const food = { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"] } as TokenSpec;
    const t = scenario({ p1: { battlefield: [...lands("Forest", 5)], hand: ["Hamlet Glutton"] } });
    const r = {
      item: { id: "x", controller: "p1", sourceId: "none", sourceDefId: "none", targets: {} },
      controller: "p1",
      targets: {},
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    runEffect(t, r, dsl.fx.createTokens(food));
    const glutton = idOf(t, "p1", "hand", "Hamlet Glutton");
    const kick = legalActions(t, "p1").find((a) => a.type === "cast" && a.card === glutton);
    expect(kick?.type === "cast" && kick.kickerAffordable).toBe(true);
    const after = passAccepting(
      act(t, "p1", { type: "cast", card: glutton, kicked: true }),
      (x) => x.stack.length === 0 && x.triggers.length === 0,
    );
    expect(idsOf(after, "p1", "battlefield", "Hamlet Glutton")).toHaveLength(1);
    expect(after.players.p1?.life).toBe(23);
  });
});

describe("Wilds of Eldraine, lot C1 : furtivité, X marqueurs répartis, Auras attachées, PV perdus", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const giveRole = (s: S, token: TokenSpec, to: string, controller = "p1") => {
    const r = {
      item: { id: "x", controller, sourceId: to, sourceDefId: s.objects[to]?.defId, targets: { t: [to] } },
      controller,
      targets: { t: [to] },
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    for (const e of createRole(token, dsl.ref.target()).flat()) runEffect(s, r, e);
  };

  it("Ingenious Prodigy : X marqueurs ; furtivité ; à l'entretien, un marqueur retiré pour une carte", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Ingenious Prodigy"], library: lands("Island", 3) } });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ingenious Prodigy"), x: 2 }));
    const prodigy = idOf(s, "p1", "battlefield", "Ingenious Prodigy");
    expect(s.objects[prodigy]?.counters["+1/+1"]).toBe(2);
    // 2/3 : bloquée par une 2/2, pas par une 5/5.
    const t = scenario({ p1: { battlefield: ["Ingenious Prodigy"] }, p2: { battlefield: ["Bear Cub", "Shivan Dragon"] } });
    const p = idOf(t, "p1", "battlefield", "Ingenious Prodigy");
    const pr = t.objects[p];
    if (pr) pr.counters["+1/+1"] = 2;
    let u = passAccepting(t, (x) => x.pending?.kind === "declareAttackers");
    u = act(u, "p1", { type: "declareAttackers", attackers: [{ id: p, defender: "p2" }] });
    expect(canBlock(u, idOf(u, "p2", "battlefield", "Shivan Dragon"), p)).toBe(false);
    expect(canBlock(u, idOf(u, "p2", "battlefield", "Bear Cub"), p)).toBe(true);
    // Entretien suivant : on retire un marqueur et on pioche.
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(s.objects[prodigy]?.counters["+1/+1"]).toBe(1);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(2);
  });

  it("Grove's Bounty : X marqueurs +1/+1 répartis entre vos créatures", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves"], hand: ["Elusive Otter // Grove's Bounty"] },
    });
    const card = idOf(s, "p1", "hand", "Elusive Otter // Grove's Bounty");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceName === "Grove's Bounty");
    const face = opt?.type === "cast" ? opt.face : undefined;
    s = act(s, "p1", { type: "cast", card, face, x: 3, targets: { t: [bear, elves] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [2, 1] });
    s = settleAll(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
  });

  it("Kellan, the Fae-Blooded : vos autres créatures +1/+0 par Aura et Équipement attaché à Kellan", () => {
    const s = scenario({ p1: { battlefield: ["Kellan, the Fae-Blooded // Birthright Boon", "Bear Cub"] } });
    const kellan = idOf(s, "p1", "battlefield", "Kellan, the Fae-Blooded // Birthright Boon");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    giveRole(s, MONSTER_ROLE, kellan);
    expect(chars(s, bear).power).toBe(3);
    giveRole(s, MONSTER_ROLE, bear);
    // Le Rôle sur l'Ours n'est pas attaché à Kellan.
    expect(chars(s, bear).power).toBe(3 + 1);
  });

  it("Faunsbane Troll : sacrifiez une Aura attachée à lui pour qu'il se batte ; la créature tuée est exilée", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Swamp"], hand: ["Faunsbane Troll"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Faunsbane Troll") }));
    const troll = idOf(s, "p1", "battlefield", "Faunsbane Troll");
    expect(chars(s, troll).power).toBe(5);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settleAll(act(s, "p1", { type: "activate", source: troll, ability: 1, targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub")).toBe(true);
    expect(chars(s, troll).power).toBe(4);
  });

  it("Rowan, Scion of War : vos sorts noirs et/ou rouges coûtent {X} de moins, X étant les PV perdus ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Rowan, Scion of War"], hand: ["Lightning Strike"] } });
    const rowan = idOf(s, "p1", "battlefield", "Rowan, Scion of War");
    s.turnLog.push({ e: "lifeLoss", player: "p1", amount: 1 });
    s = settleAll(act(s, "p1", { type: "activate", source: rowan, ability: 0 }));
    const strike = idOf(s, "p1", "hand", "Lightning Strike");
    // {1}{R} moins {1} : {R}, impayable sans terrain mais coût affiché d'une valeur de mana 1.
    expect(projectView(s, "p1").hand.find((c) => c.id === strike)?.castCost).toEqual({ text: "{R}", delta: -1 });
  });
});

describe("Wilds of Eldraine, lot C2 : blessures d'un sort ciblé, blocages, blessures subies", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };

  it("Imodane : un sort à cible unique qui blesse sa créature blesse autant chaque adversaire ; pas un sort qui vise un joueur", () => {
    let s = scenario({
      p1: {
        battlefield: ["Imodane, the Pyrohammer", "Mountain", "Mountain", "Mountain", "Mountain"],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    s = settleAll(act(s, "p1", { type: "cast", card: a as string, targets: { t: [wurm] } }));
    expect(s.players.p2?.life).toBe(17);
    s = settleAll(act(s, "p1", { type: "cast", card: b as string, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(14);
  });

  it("Skewer Slinger : 1 blessure à la créature qu'elle bloque, et à celle qui la bloque", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Skewer Slinger"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const slinger = idOf(s, "p2", "battlefield", "Skewer Slinger");
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: slinger, attacker: bear }] });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step !== "declareBlockers");
    // 1 blessure du déclencheur, puis 1 de combat : l'Ours (2/2) meurt.
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Tangled Colony : en mourant, un Rat par blessure subie ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Tangled Colony"] } });
    const colony = idOf(s, "p1", "battlefield", "Tangled Colony");
    dealDamage(s, { defId: "test", controller: "p2", keywords: [] }, colony, 5, false);
    s = settleAll(s);
    expect(s.battlefield.filter((id) => chars(s, id).name === "Rat")).toHaveLength(5);
  });
});

describe("Wilds of Eldraine, lot C3 : copies non légendaires, copie d'une carte du cimetière", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const legend = customCard({ name: "Héros d'essai", supertypes: ["Legendary"], power: 3, toughness: 3 });

  it("The Apprentice's Folly : copie non légendaire, Reflet avec la célérité ; pas de cible du nom d'un de vos jetons", () => {
    let s = scenario({
      p1: { battlefield: [legend, "Island", "Island", "Mountain", "Mountain"], hand: ["The Apprentice's Folly"] },
    });
    const hero = idOf(s, "p1", "battlefield", legend.name);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Apprentice's Folly") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    const copies = s.battlefield.filter((id) => s.objects[id]?.isToken && chars(s, id).name === legend.name);
    expect(copies).toHaveLength(1);
    const copy = copies[0] as string;
    expect(chars(s, copy).supertypes).not.toContain("Legendary");
    expect(chars(s, copy).subtypes).toContain("Reflection");
    expect(chars(s, copy).keywords).toContain("haste");
    // Un jeton du même nom : le héros n'est plus une cible légale pour le chapitre II.
    const spec = {
      id: "t",
      filter: {
        objects: { types: ["Creature"], controller: "you", token: false, notSameNameAs: { token: true, controller: "you" } },
      },
    } as const;
    expect(legalTargetsOf(s, "p1", spec as never)).not.toContain(hero);
  });

  it("Yenna, Redtooth Regent : copie non légendaire d'un enchantement ; ce n'est pas une Aura : Yenna reste engagée", () => {
    let s = scenario({
      p1: { battlefield: ["Yenna, Redtooth Regent", "Forest", "Forest", "Bear Cub", "A Tale for the Ages"] },
    });
    const yenna = idOf(s, "p1", "battlefield", "Yenna, Redtooth Regent");
    const tale = idOf(s, "p1", "battlefield", "A Tale for the Ages");
    s = settleAll(act(s, "p1", { type: "activate", source: yenna, ability: 0, targets: { t: [tale] } }));
    expect(s.battlefield.filter((id) => chars(s, id).name === "A Tale for the Ages")).toHaveLength(2);
    expect(s.objects[yenna]?.tapped).toBe(true);
  });

  it("Likeness Looter : devient une copie de la carte de VM X, avec le vol et sa capacité ; rien si la VM diffère", () => {
    let s = scenario({
      p1: { battlefield: ["Likeness Looter", ...lands("Island", 2)], graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    const looter = idOf(s, "p1", "battlefield", "Likeness Looter");
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
    s = settleAll(act(s, "p1", { type: "activate", source: looter, ability: 1, x: 2, targets: { t: [dragon] } }));
    expect(chars(s, looter).name).toBe("Likeness Looter");
    s = scenario({ p1: { battlefield: ["Likeness Looter", ...lands("Island", 2)], graveyard: ["Bear Cub"] } });
    const l2 = idOf(s, "p1", "battlefield", "Likeness Looter");
    s = settleAll(
      act(s, "p1", { type: "activate", source: l2, ability: 1, x: 2, targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }),
    );
    expect(chars(s, l2).name).toBe("Bear Cub");
    expect(chars(s, l2).keywords).toContain("flying");
    expect(chars(s, l2).abilities.some((a) => a.kind === "activated" && a.label?.startsWith("Devient une copie"))).toBe(true);
    void bear;
  });
});

describe("Wilds of Eldraine, lot C4 : dessus de la bibliothèque, coûts des capacités, Aventures, exil", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return settle(s);
  };
  const tapped = (s: S, player: string) =>
    s.battlefield.filter((id) => s.objects[id]?.controller === player && s.objects[id]?.tapped);
  const drawer = (name: string, mana: string) =>
    customCard({
      name,
      power: 1,
      toughness: 1,
      abilities: [dsl.activated({ mana, effects: [dsl.fx.draw(1)], label: "Piochez une carte" })],
    });

  it("Johann : un éphémère ou rituel du dessus de la bibliothèque, une seule fois par tour ; pas une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Johann, Apprentice Sorcerer", ...lands("Island", 4)], library: ["Opt", "Opt", "Opt", "Bear Cub"] },
    });
    const top = s.players.p1?.library[0] as string;
    expect(castOptions(s, "p1", top)).toHaveLength(1);
    s = settleAll(act(s, "p1", { type: "cast", card: top }));
    // Opt (regard 1, puis pioche) : le nouveau dessus n'est plus lançable ce tour-ci.
    const next = s.players.p1?.library[0] as string;
    expect(nameOf(s, next)).toBe("Opt");
    expect(castOptions(s, "p1", next)).toHaveLength(0);
    const t = scenario({ p1: { battlefield: ["Johann, Apprentice Sorcerer", ...lands("Forest", 2)], library: ["Bear Cub"] } });
    expect(castOptions(t, "p1", t.players.p1?.library[0] as string)).toHaveLength(0);
  });

  it("Agatha of the Vile Cauldron : capacités de vos créatures {X} de moins (X = sa force), jamais sous un mana", () => {
    const three = drawer("Sage à trois", "{3}");
    const one = drawer("Sage à un", "{1}");
    let s = scenario({
      p1: { battlefield: ["Agatha of the Vile Cauldron", three, one, ...lands("Island", 2)], library: lands("Island", 3) },
    });
    const sage = idOf(s, "p1", "battlefield", three.name);
    const small = idOf(s, "p1", "battlefield", one.name);
    s = settleAll(activate(s, "p1", sage));
    // {3} - 1 = {2} : les deux Îles.
    expect(tapped(s, "p1")).toHaveLength(2);
    s = scenario({ p1: { battlefield: ["Agatha of the Vile Cauldron", one], library: lands("Island", 3) } });
    // {1} ne descend pas à {0}.
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === idOf(s, "p1", "battlefield", one.name))).toBe(
      false,
    );
    void small;
  });

  it("Agatha of the Vile Cauldron : {4}{R}{G} (réduit par sa propre force) : vos autres créatures +1/+1, piétinement, célérité", () => {
    let s = scenario({
      p1: { battlefield: ["Agatha of the Vile Cauldron", "Bear Cub", ...lands("Mountain", 2), ...lands("Forest", 3)] },
    });
    const agatha = idOf(s, "p1", "battlefield", "Agatha of the Vile Cauldron");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settleAll(activate(s, "p1", agatha));
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    expect(chars(s, agatha).power).toBe(1);
  });

  it("Agatha's Soul Cauldron : carte de créature exilée, marqueur +1/+1 ; ses capacités pour vos créatures à marqueur, mana de n'importe quelle couleur", () => {
    const mage = drawer("Mage d'essai", "{U}");
    let s = scenario({
      p1: { battlefield: ["Agatha's Soul Cauldron", "Bear Cub", "Forest"], library: lands("Forest", 3) },
      p2: { graveyard: [mage, "Opt"] },
    });
    const cauldron = idOf(s, "p1", "battlefield", "Agatha's Soul Cauldron");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).abilities.some((a) => a.kind === "activated")).toBe(false);
    s = settleAll(activate(s, "p1", cauldron, { t: [idOf(s, "p2", "graveyard", mage.name)] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bear).abilities.some((a) => a.kind === "activated" && a.label === "Piochez une carte")).toBe(true);
    // {U} payé avec une Forêt.
    const hand = s.players.p1?.hand.length ?? 0;
    s = settleAll(activate(s, "p1", bear));
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Agatha's Soul Cauldron : une carte non-créature exilée ne donne ni marqueur ni capacité", () => {
    let s = scenario({ p1: { battlefield: ["Agatha's Soul Cauldron", "Bear Cub"] }, p2: { graveyard: ["Opt"] } });
    const cauldron = idOf(s, "p1", "battlefield", "Agatha's Soul Cauldron");
    s = settleAll(activate(s, "p1", cauldron, { t: [idOf(s, "p2", "graveyard", "Opt")] }));
    expect(exiled(s, "Opt")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[cauldron]?.linked ?? []).toHaveLength(0);
  });

  it("Beluna Grandsquall : sorts de permanent avec une Aventure {1} de moins ; pas l'Aventure, ni un autre sort", () => {
    const s = scenario({
      p1: { battlefield: ["Beluna Grandsquall // Seek Thrills"], hand: ["Bramble Familiar // Fetch Quest", "Bear Cub"] },
    });
    const v = projectView(s, "p1");
    const familiar = idOf(s, "p1", "hand", "Bramble Familiar // Fetch Quest");
    expect(v.hand.find((c) => c.id === familiar)?.castCost).toEqual({ text: "{G}", delta: -1 });
    expect(v.hand.find((c) => c.id === idOf(s, "p1", "hand", "Bear Cub"))?.castCost).toBeUndefined();
  });

  it("Seek Thrills : meulez sept cartes, les cartes avec une Aventure meulées vont dans votre main", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), "Island", "Mountain"],
        hand: ["Beluna Grandsquall // Seek Thrills"],
        library: [
          "Opt",
          "Bramble Familiar // Fetch Quest",
          "Opt",
          "Opt",
          "Bear Cub",
          "Opt",
          "Opt",
          "Bramble Familiar // Fetch Quest",
        ],
      },
    });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Beluna Grandsquall // Seek Thrills"), face: 1 }));
    expect(idsOf(s, "p1", "hand", "Bramble Familiar // Fetch Quest")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(5);
    expect(s.players.p1?.library).toHaveLength(1);
  });

  it("Extraordinary Journey : jusqu'à X créatures exilées, jouables par leur propriétaire ; une créature arrivée de l'exil fait piocher", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Extraordinary Journey"], library: lands("Island", 3) },
      p2: { battlefield: ["Bear Cub", ...lands("Forest", 2)] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Extraordinary Journey"), x: 1 });
    s = settleAll(s);
    const card = exiled(s, "Bear Cub")[0] as string;
    expect(card).toBeDefined();
    void bear;
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(castOptions(s, "p2", card)).toHaveLength(1);
    s = settleAll(act(s, "p2", { type: "cast", card }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });
});

describe("Wilds of Eldraine, lot C5 : payer des PV, nombre choisi, cartes à Aventure en exil", () => {
  const settleAll = (s: S, answer?: Answer) => {
    while (stateBasedActions(s)) {}
    return settle(s, answer);
  };
  const toExile = (s: S, id: string) => moveObject(s, id, "exile");

  it("Ashiok : payer des PV exile autant de cartes du dessus de votre bibliothèque ; PV payés si elle est trop courte ; pas pour l'adversaire", () => {
    const s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator"], library: lands("Swamp", 3) } });
    payLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.library).toHaveLength(1);
    expect(exiled(s, "Swamp")).toHaveLength(2);
    // Une seule carte pour 2 PV : on paie les PV (pas de paiement partagé).
    payLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(18);
    expect(s.players.p1?.library).toHaveLength(1);
    payLife(s, "p2", 3);
    expect(s.players.p2?.life).toBe(17);
  });

  it("Ashiok : un coût en PV d'une capacité est payé en exilant des cartes", () => {
    const pricey = customCard({
      name: "Prêtre d'essai",
      power: 1,
      toughness: 1,
      abilities: [dsl.activated({ payLife: 3, effects: [dsl.fx.gainLife(1)], label: "Gagnez 1 PV" })],
    });
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator", pricey], library: lands("Swamp", 5) } });
    s = settleAll(activate(s, "p1", idOf(s, "p1", "battlefield", pricey.name)));
    expect(s.players.p1?.life).toBe(21);
    expect(exiled(s, "Swamp")).toHaveLength(3);
  });

  it("Ashiok +1 : deux cartes regardées, l'une exilée, l'autre en main", () => {
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator"], library: ["Opt", "Bear Cub", "Swamp"] } });
    const ashiok = idOf(s, "p1", "battlefield", "Ashiok, Wicked Manipulator");
    s = settleAll(act(s, "p1", { type: "activate", source: ashiok, ability: 1 }));
    const names = [...exiled(s, "Opt"), ...exiled(s, "Bear Cub")].map((id) => nameOf(s, id));
    expect(names).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", names[0] === "Opt" ? "Bear Cub" : "Opt")).toHaveLength(1);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Swamp"]);
    expect(s.objects[ashiok]?.counters.loyalty).toBe(6);
  });

  it("Ashiok −2 : deux Cauchemars, qui grandissent au début de votre combat si une carte a été exilée ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator"], library: lands("Swamp", 5) } });
    const ashiok = idOf(s, "p1", "battlefield", "Ashiok, Wicked Manipulator");
    s = settleAll(act(s, "p1", { type: "activate", source: ashiok, ability: 2 }));
    const nightmares = () => s.battlefield.filter((id) => chars(s, id).name === "Nightmare");
    expect(nightmares()).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0);
    expect(nightmares().map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([0, 0]);
    // Tour suivant : une carte exilée (PV payés), puis le combat.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    payLife(s, "p1", 1);
    s = advanceUntil(
      s,
      (x) => x.turn.number === 5 && x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0,
    );
    expect(nightmares().map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([1, 1]);
  });

  it("Ashiok −7 : le joueur ciblé exile X cartes, X étant la valeur de mana totale des cartes que vous possédez en exil", () => {
    let s = scenario({
      p1: { battlefield: ["Ashiok, Wicked Manipulator"], graveyard: ["Shivan Dragon", "Opt"] },
      p2: { graveyard: ["Serra Angel"], library: lands("Island", 10) },
    });
    const ashiok = idOf(s, "p1", "battlefield", "Ashiok, Wicked Manipulator");
    toExile(s, idOf(s, "p1", "graveyard", "Shivan Dragon"));
    toExile(s, idOf(s, "p1", "graveyard", "Opt"));
    // La carte de l'adversaire en exil ne compte pas.
    toExile(s, idOf(s, "p2", "graveyard", "Serra Angel"));
    const a = s.objects[ashiok];
    if (a) a.counters.loyalty = 7;
    s = settleAll(act(s, "p1", { type: "activate", source: ashiok, ability: 3, targets: { t: ["p2"] } }));
    // Shivan Dragon (6) + Opt (1) = 7.
    expect(exiled(s, "Island")).toHaveLength(7);
    expect(s.players.p2?.library).toHaveLength(3);
  });

  it("Talion : un nombre choisi en arrivant ; un sort adverse de cette valeur de mana, force ou endurance : il perd 2 PV, vous piochez", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Talion, the Kindly Lord"] } });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Talion, the Kindly Lord") }), (req) =>
      req.type === "pick" && req.options.includes("3") ? ["3"] : undefined,
    );
    expect(s.objects[idOf(s, "p1", "battlefield", "Talion, the Kindly Lord")]?.chosen?.number).toBe(3);

    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Talion, the Kindly Lord"], library: lands("Island", 5) },
      p2: { battlefield: [...lands("Mountain", 2), "Island"], hand: ["Lightning Strike", "Opt"] },
    });
    const talion = idOf(t, "p1", "battlefield", "Talion, the Kindly Lord");
    const tal = t.objects[talion];
    if (tal) tal.chosen = { number: 2 };
    const hand = t.players.p1?.hand.length ?? 0;
    // Lightning Strike : valeur de mana 2.
    t = settleAll(act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } }));
    expect(t.players.p2?.life).toBe(18);
    expect(t.players.p1?.hand).toHaveLength(hand + 1);
    // Opt : valeur de mana 1, rien.
    t = settleAll(act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Opt") }));
    expect(t.players.p2?.life).toBe(18);
  });

  it("Sentinel of Lost Lore : reprend votre carte à Aventure exilée, met celle d'un adversaire sous sa bibliothèque, exile un cimetière", () => {
    const BRAMBLE = "Bramble Familiar // Fetch Quest";
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Sentinel of Lost Lore"], graveyard: [BRAMBLE] },
      p2: { graveyard: [BRAMBLE, "Opt"], library: lands("Island", 3) },
    });
    const mine = idOf(s, "p1", "graveyard", BRAMBLE);
    const theirs = idOf(s, "p2", "graveyard", BRAMBLE);
    toExile(s, mine);
    toExile(s, theirs);
    const [myExiled, theirExiled] = s.exile;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sentinel of Lost Lore") });
    // Cibles du déclencheur : les suggestions retiennent les trois modes ; on vérifie qu'elles sont les bonnes.
    s = settleAll(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(myExiled as string) && !req.options.includes(theirExiled as string)) return [myExiled as string];
      if (req.options.includes(theirExiled as string) && !req.options.includes(myExiled as string))
        return [theirExiled as string];
      if (req.options.includes("p2")) return ["p2"];
      return undefined;
    });
    expect(idsOf(s, "p1", "hand", BRAMBLE)).toHaveLength(1);
    expect(nameOf(s, s.players.p2?.library.at(-1) as string)).toBe(BRAMBLE);
    expect(exiled(s, "Opt")).toHaveLength(1);
  });
});

describe("Faerie Fencing (PLAN-D, D5)", () => {
  it("le -3/-3 en plus dépend de la Fée contrôlée en lançant le sort, même si elle part avant la résolution", () => {
    const faerie = customCard({
      name: "Fée d'essai",
      typeLine: "Creature — Faerie",
      subtypes: ["Faerie"],
      power: 1,
      toughness: 1,
    });
    const run = (withFaerie: boolean) => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...(withFaerie ? [faerie] : [])], hand: ["Faerie Fencing"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Faerie Fencing"), x: 1, targets: { t: [angel] } });
      // La Fée quitte le champ de bataille avant la résolution.
      if (withFaerie) destroy(s, idOf(s, "p1", "battlefield", faerie.name));
      s = settle(s);
      return idsOf(s, "p2", "graveyard", "Serra Angel").length;
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });
});

describe("Wilds of Eldraine, PLAN-D D9 : dernières cartes", () => {
  it("Gingerbread Hunter : Puny Snack donne -2/-2 jusqu'à la fin du tour puis part à l'aventure ; le Géant 5/5 lancé de l'exil crée une Nourriture", () => {
    const HUNTER = "Gingerbread Hunter // Puny Snack";
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 5)], hand: [HUNTER] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // Puny Snack : éphémère ({2}{B}), une créature ciblée gagne -2/-2.
    s = settle(cast(s, "p1", HUNTER, { t: [angel] }, { face: 1 }));
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    const adv = onAdventure(s, HUNTER);
    // Jusqu'à la fin du tour seulement.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([4, 4]);
    // -2/-2 tue une créature 2/2.
    let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [HUNTER] }, p2: { battlefield: ["Bear Cub"] } });
    t = settle(cast(t, "p1", HUNTER, { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }, { face: 1 }));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // Retour au tour de p1 : la créature se lance depuis l'exil ({4}{G}), 5/5, et crée une Nourriture en arrivant.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(act(s, "p1", { type: "cast", card: adv }));
    const hunter = idOf(s, "p1", "battlefield", HUNTER);
    expect([chars(s, hunter).power, chars(s, hunter).toughness]).toEqual([5, 5]);
    expect(chars(s, hunter).subtypes).toContain("Giant");
    const food = idOf(s, "p1", "battlefield", "Food");
    expect(chars(s, food).types).toContain("Artifact");
    // Nourriture : {2}, {T}, sacrifiez-la : 3 PV.
    s = settle(activate(s, "p1", food));
    expect(s.players.p1?.life).toBe(23);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
  });
});
