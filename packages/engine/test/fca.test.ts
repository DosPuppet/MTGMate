/** Through the Ages (FCA) : tests de règles des cartes (PLAN-G). */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy, drawCards, loseLife } from "../src/actions";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, moveObject } from "../src/state";
import { stateBasedActions } from "../src/turn";
import {
  act,
  advanceUntil,
  attack,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = ReturnType<typeof scenario>;
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Through the Ages", () => {
  describe("Ruée (702.109) : Ragavan, Nimble Pilferer", () => {
    it("lancé pour sa ruée : célérité, puis retour en main au début de la prochaine étape de fin", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Ragavan, Nimble Pilferer"] } });
      const card = idOf(s, "p1", "hand", "Ragavan, Nimble Pilferer");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altLabel).toBe("Ruée — {1}{R}");
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      const rag = idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer");
      expect(chars(s, rag).keywords).toContain("haste");
      expect(s.objects[rag]?.cast?.via).toBe("dash");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "hand", "Ragavan, Nimble Pilferer")).toHaveLength(1);
    });

    it("lancé normalement : ni célérité ni retour", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 1), hand: ["Ragavan, Nimble Pilferer"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ragavan, Nimble Pilferer") }));
      const rag = idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer");
      expect(chars(s, rag).keywords).not.toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")).toHaveLength(1);
    });

    it("blessures de combat à un joueur : un Trésor, et sa carte du dessus exilée, lançable ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Ragavan, Nimble Pilferer", ...lands("Forest", 2)] },
        p2: { library: ["Llanowar Elves", "Forest"] },
      });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")]));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const elves = s.exile.find((id) => nameOf(s, id) === "Llanowar Elves") as string;
      expect(elves).toBeDefined();
      expect(castOption(s, elves)).toBeDefined();
    });
  });

  describe("Spectacle (702.137) : Light Up the Stage", () => {
    it("le coût de spectacle n'est proposé que si un adversaire a perdu des points de vie ce tour-ci", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Light Up the Stage"], library: lands("Island", 5) } });
      const card = idOf(s, "p1", "hand", "Light Up the Stage");
      let opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altAvailable).toBeFalsy();
      loseLife(s, "p2", 1);
      opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altLabel).toBe("Spectacle — {R}");
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      // {R} payé : deux Montagnes encore dégagées ; les deux cartes exilées sont jouables.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped)).toHaveLength(2);
      const exiled = s.exile.filter((id) => nameOf(s, id) === "Island");
      expect(exiled).toHaveLength(2);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && exiled.includes(a.card))).toBe(true);
    });
  });

  describe("Mizzix's Mastery", () => {
    it("surchargé : chaque éphémère ou rituel de votre cimetière exilé, copié et lancé gratuitement", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 8),
          hand: ["Mizzix's Mastery"],
          graveyard: ["Shock", "Shock", "Bear Cub"],
        },
      });
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mizzix's Mastery"), mode: 1 }));
      // Deux copies à lancer gratuitement ; la créature reste au cimetière.
      for (let i = 0; i < 2; i++) {
        const copy = castNowOf(s)?.cards[0] as string;
        expect(nameOf(s, copy)).toBe("Shock");
        s = untilCastNow(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
        if (i === 0) expect(castNowOf(s)?.cards).toHaveLength(1);
      }
      s = settle(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Mizzix's Mastery", "Shock", "Shock"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("G7 : Through the Ages", () => {
    const castIt = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const activate = (s: S, source: string, extra: object = {}, pick?: (a: { label?: string }) => boolean) => {
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source && (!pick || pick(a)));
      return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : 0, ...extra });
    };

    it("Adeline : force égale au nombre de vos créatures ; vous attaquez, un Humain 1/1 attaquant", () => {
      let s = scenario({ p1: { battlefield: ["Adeline, Resplendent Cathar", "Bear Cub"] } });
      const adeline = idOf(s, "p1", "battlefield", "Adeline, Resplendent Cathar");
      expect(chars(s, adeline).power).toBe(2);
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      const human = idOf(s, "p1", "battlefield", "Human");
      expect(s.combat?.attackers.some((a) => a.id === human)).toBe(true);
    });

    it("Ranger-Captain of Eos : sacrifié, vos adversaires ne lancent pas de sorts non-créature ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Ranger-Captain of Eos"] },
        p2: { battlefield: ["Mountain", "Forest"], hand: ["Shock", "Llanowar Elves"] },
      });
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Ranger-Captain of Eos")));
      expect(castOption(s, idOf(s, "p2", "hand", "Shock"))).toBeUndefined();
      expect(legalActions(s, "p2").some((a) => a.type === "cast" && a.card === idOf(s, "p2", "hand", "Shock"))).toBe(false);
    });

    it("Urza : engager un artefact donne {U}", () => {
      let s = scenario({ p1: { battlefield: ["Urza, Lord High Artificer", "Mana Crypt"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Urza, Lord High Artificer"), ability: 0 });
      expect([s.players.p1?.manaPool.U, s.objects[idOf(s, "p1", "battlefield", "Mana Crypt")]?.tapped]).toEqual([1, true]);
    });

    it("Venser : renvoie un sort en main", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Venser, Shaper Savant"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const spellId = s.stack[0]?.id as string;
      s = settle(castIt(s, "Venser, Shaper Savant"), (req) =>
        req.type === "pick" && req.options.includes(spellId) ? [spellId] : undefined,
      );
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Fatal Push : valeur de mana 2 ou moins, ou 4 avec la révolte", () => {
      const run = (revolt: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Swamp", "Ghostly Prison"], hand: ["Fatal Push"] },
          p2: { battlefield: ["Kalamax, the Stormsire"] },
        });
        if (revolt) destroy(s, idOf(s, "p1", "battlefield", "Ghostly Prison"));
        s = settle(castIt(s, "Fatal Push", { targets: { t: [idOf(s, "p2", "battlefield", "Kalamax, the Stormsire")] } }));
        return idsOf(s, "p2", "battlefield", "Kalamax, the Stormsire").length;
      };
      expect(run(false)).toBe(1);
      expect(run(true)).toBe(0);
    });

    it("Syr Konrad : une créature meurt, une carte de créature quitte votre cimetière : 1 blessure à chaque adversaire", () => {
      let s = scenario({ p1: { battlefield: ["Syr Konrad, the Grim", "Bear Cub"], graveyard: ["Llanowar Elves"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      moveObject(s, idOf(s, "p1", "graveyard", "Llanowar Elves"), "exile");
      s = settle(s);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Purphoros : n'est une créature qu'avec cinq de dévotion au rouge ; une de vos créatures arrive, 2 blessures", () => {
      let s = scenario({ p1: { battlefield: ["Purphoros, God of the Forge", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const purph = idOf(s, "p1", "battlefield", "Purphoros, God of the Forge");
      expect(chars(s, purph).types.includes("Creature")).toBe(false);
      s = settle(castIt(s, "Bear Cub"));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Azusa : deux terrains de plus par tour", () => {
      let s = scenario({ p1: { battlefield: ["Azusa, Lost but Seeking"], hand: ["Forest", "Forest", "Forest", "Forest"] } });
      for (let i = 0; i < 3; i++) s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(legalActions(s, "p1").some((a) => a.type === "playLand")).toBe(false);
    });

    it("Traxos : se dégage quand vous lancez un sort historique", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Traxos, Scourge of Kroog", tapped: true }], hand: ["Mana Crypt"] } });
      s = settle(castIt(s, "Mana Crypt"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Traxos, Scourge of Kroog")]?.tapped).toBe(false);
    });

    it("Kenrith : {2}{W}, le joueur ciblé gagne 5 PV", () => {
      let s = scenario({ p1: { battlefield: ["Kenrith, the Returned King", ...lands("Plains", 3)] } });
      s = settle(
        activate(
          s,
          idOf(s, "p1", "battlefield", "Kenrith, the Returned King"),
          { targets: { t: ["p1"] } },
          (a) => !!a.label?.includes("5 PV"),
        ),
      );
      expect(s.players.p1?.life).toBe(25);
    });

    it("Brainstorm : piochez trois cartes, puis remettez-en deux sur la bibliothèque", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Brainstorm", "Shock"], library: lands("Forest", 5) } });
      s = settle(castIt(s, "Brainstorm"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Cryptic Command : contrecarrez et piochez", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Cryptic Command"], library: lands("Island", 3) },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const opt = castOption(s, idOf(s, "p1", "hand", "Cryptic Command"));
      const pair =
        opt?.type === "cast"
          ? opt.modes.find((m) => m.label?.startsWith("Contrecarrez") && m.label.includes("Piochez"))
          : undefined;
      s = settle(castIt(s, "Cryptic Command", { mode: pair?.index, targets: { s: [s.stack[0]?.id as string] } }));
      expect([idsOf(s, "p2", "graveyard", "Bear Cub").length, s.players.p1?.hand.length]).toEqual([1, 1]);
    });

    it("Deadly Dispute : sacrifiez un artefact ou une créature ; deux cartes et un Trésor", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Deadly Dispute"], library: lands("Swamp", 3) },
      });
      s = settle(castIt(s, "Deadly Dispute", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect([s.players.p1?.hand.length, idsOf(s, "p1", "battlefield", "Treasure").length]).toEqual([2, 1]);
    });

    it("Isshin : un déclenchement d'attaque se déclenche une fois de plus", () => {
      let s = scenario({ p1: { battlefield: ["Isshin, Two Heavens as One", "Captain Lannery Storm"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Captain Lannery Storm")]));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    it("Kinnan : un permanent non-terrain engagé pour du mana en produit un de plus", () => {
      let s = scenario({ p1: { battlefield: ["Kinnan, Bonder Prodigy", "Llanowar Elves"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Llanowar Elves"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Chromatic Lantern : vos terrains produisent n'importe quelle couleur", () => {
      const s = scenario({ p1: { battlefield: ["Chromatic Lantern", "Forest"] } });
      expect(manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Forest")).some((a) => a.produce.length === 5)).toBe(true);
    });

    it("Strixhaven Stadium : dix marqueurs de point, l'adversaire perd la partie", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Strixhaven Stadium", counters: { point: 9 } }, "Bear Cub"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.over).toBe(true);
      expect(s.winner).toBe("p1");
    });
  });

  describe("G4e : règles de joueur", () => {
    it("Laboratory Maniac : piocher dans une bibliothèque vide fait gagner la partie à la place", () => {
      const s = scenario({ p1: { battlefield: ["Laboratory Maniac"], library: [] } });
      drawCards(s, "p1", 1);
      stateBasedActions(s);
      expect(s.winner).toBe("p1");
      const t = scenario({ p1: { library: [] } });
      drawCards(t, "p1", 1);
      stateBasedActions(t);
      expect(t.winner).toBe("p2");
    });

    it("Nyxbloom Ancient : un permanent engagé pour du mana en produit trois fois autant", () => {
      let s = scenario({ p1: { battlefield: ["Nyxbloom Ancient", "Forest", "Llanowar Elves"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Forest"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(3);
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Llanowar Elves"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(6);
    });

    it("Ancient Copper Dragon : blessures de combat à un joueur, un d20 et autant de Trésors", () => {
      let s = scenario({ p1: { battlefield: ["Ancient Copper Dragon"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Ancient Copper Dragon")]));
      expect(s.players.p2?.life).toBe(14);
      const treasures = idsOf(s, "p1", "battlefield", "Treasure").length;
      expect(treasures).toBeGreaterThanOrEqual(1);
      expect(treasures).toBeLessThanOrEqual(20);
    });
  });
  describe("G4e : lancer autrement", () => {
    it("Teferi, Mage of Zhalfir : vos créatures ont le flash ; les adversaires ne lancent qu'au moment d'un rituel", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Teferi, Mage of Zhalfir", ...lands("Forest", 2)], hand: ["Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const shock = idOf(s, "p2", "hand", "Shock");
      expect(legalActions(s, "p2").some((a) => a.type === "cast" && a.card === shock)).toBe(true);
      s = act(s, "p2", { type: "pass" });
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = act(s, "p1", { type: "pass" });
      expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
      expect(legalActions(s, "p2").some((a) => a.type === "cast" && a.card === shock)).toBe(false);
    });
  });
  describe("G4e : bibliothèque et pioche", () => {
    it("Atraxa, Grand Unifier : dix cartes révélées, une de chaque type de carte dans la main", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 7)],
          hand: [customCard({ name: "Atraxa de test", types: ["Creature"], abilities: card("Atraxa, Grand Unifier").abilities })],
          library: ["Bear Cub", "Shivan Dragon", "Forest", "Shock", "Island", "Mana Crypt", "Llanowar Elves", "Lightning Strike"],
        },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Atraxa de test") }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest", "Mana Crypt", "Shock"]);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Carpet of Flowers : au début de votre phase principale, X mana d'une couleur (Îles de l'adversaire)", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Carpet of Flowers"] }, p2: { battlefield: lands("Island", 3) } });
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      const pool = s.players.p1?.manaPool;
      expect(Object.values(pool ?? {}).reduce((a, b) => a + b, 0)).toBe(3);
    });

    it("Carpet of Flowers : à chacune de vos phases principales, tant que vous n'avez pas ajouté de mana avec elle ce tour-ci", () => {
      const total = (x: ReturnType<typeof scenario>) => Object.values(x.players.p1?.manaPool ?? {}).reduce((a, b) => a + b, 0);
      const atMain2 = (x: ReturnType<typeof scenario>) =>
        x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority";
      const start = () =>
        scenario({ active: "p2", p1: { battlefield: ["Carpet of Flowers"] }, p2: { battlefield: lands("Island", 3) } });
      // Refusé en première phase principale : la capacité se déclenche encore en seconde phase principale.
      let s = advanceUntil(start(), (x) => x.turn.active === "p1" && x.pending?.kind === "choice");
      expect(s.turn.step).toBe("main1");
      s = act(s, "p1", { type: "choose", values: [0] });
      s = advanceUntil(s, atMain2);
      expect(total(s)).toBe(3);
      // Accepté en première phase principale : plus rien en seconde phase principale.
      let t = advanceUntil(start(), (x) => x.turn.active === "p1" && x.pending?.kind === "choice");
      t = advanceUntil(t, (x) => (x.turn.step === "main2" && x.pending?.kind !== "priority") || atMain2(x));
      expect(t.pending?.kind).toBe("priority");
      expect(total(t)).toBe(0);
    });
  });
  describe("G4e : exil et copies", () => {
    it("Winota : une créature non-Humain attaque, un Humain des six cartes du dessus arrive engagé, attaquant et indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Winota, Joiner of Forces", "Bear Cub"], library: ["Shock", "Soul Warden", "Forest"] },
      });
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = settle(s);
      const warden = idOf(s, "p1", "battlefield", "Soul Warden");
      expect(s.combat?.attackers.some((a) => a.id === warden)).toBe(true);
      expect(chars(s, warden).keywords).toContain("indestructible");
    });

    it("Jodah, the Unifier : vos créatures légendaires +X/+X ; un sort légendaire de la main déclenche une cascade légendaire", () => {
      const legend = customCard({
        name: "Légende de test",
        supertypes: ["Legendary"],
        types: ["Creature"],
        manaCost: { generic: 1, colored: {}, x: 0 },
        manaCostText: "{1}",
        power: 1,
        toughness: 1,
      });
      let s = scenario({
        p1: {
          battlefield: ["Jodah, the Unifier", ...lands("Forest", 2), "Plains"],
          hand: ["Mirri, Weatherlight Duelist"],
          library: ["Shock", legend, "Forest"],
        },
      });
      const jodah = idOf(s, "p1", "battlefield", "Jodah, the Unifier");
      expect(chars(s, jodah).power).toBe(6);
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mirri, Weatherlight Duelist") }));
      const hit = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, hit)).toBe("Légende de test");
      s = settle(act(s, "p1", { type: "cast", card: hit, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Légende de test")).toHaveLength(1);
      expect(chars(s, jodah).power).toBe(8);
    });

    it("Bolas's Citadel : sorts du dessus de la bibliothèque pour des PV égaux à leur VM ; terrains aussi", () => {
      let s = scenario({ p1: { battlefield: ["Bolas's Citadel"], library: ["Shock", "Forest", "Island"] } });
      const shock = s.players.p1?.library[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p2?.life).toBe(18);
      const forest = s.players.p1?.library[0] as string;
      s = act(s, "p1", { type: "playLand", card: forest });
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
    });
  });
  describe("G4e : dernières cartes", () => {
    it("Gix, Yawgmoth Praetor : blessures de combat à un adversaire, 1 PV pour piocher ; défaussez X, jouez X cartes adverses", () => {
      let s = scenario({
        p1: {
          battlefield: ["Gix, Yawgmoth Praetor", "Bear Cub", ...lands("Swamp", 7)],
          hand: ["Forest", "Island"],
          library: lands("Plains", 3),
        },
        p2: { library: ["Shock", "Bear Cub", "Forest"] },
      });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(3);
      const gix = idOf(s, "p1", "battlefield", "Gix, Yawgmoth Praetor");
      s = settle(act(s, "p1", { type: "activate", source: gix, ability: 1, x: 2, targets: { t: ["p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      const shock = exiled(s, "Shock")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
    });
  });
});
