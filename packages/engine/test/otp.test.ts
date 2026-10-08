/** Breaking News (OTP) : tests de règles des cartes (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, gainLife, loseLife } from "../src/actions";
import { fx, ref, spell, target } from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars, decider } from "../src/state";
import { legalTargets } from "../src/targets";
import { plainText } from "../src/text";
import { logTurnEvent } from "../src/turnlog";
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
  passUntil,
  pickNamed,
  scenario,
  settle,
  steal,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = ReturnType<typeof scenario>;
const castOption = (s: S, card: string, player = "p1") =>
  legalActions(s, player).find((a) => a.type === "cast" && a.card === card);

describe("Breaking News", () => {
  describe("Escalade (702.120) : Collective Defiance", () => {
    it("un mode au coût normal ; chaque mode en plus coûte {1}", () => {
      const s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Collective Defiance"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const opt = castOption(s, idOf(s, "p1", "hand", "Collective Defiance"));
      // Quatre Montagnes : un mode ({1}{R}{R}) ou deux ({1}{R}{R} + {1}) ; pas les trois.
      expect(opt?.type === "cast" && opt.modes.map((m) => m.label?.split(" + ").length)).toEqual([1, 1, 2, 1, 2, 2]);
    });

    it("deux modes : 4 blessures à la créature et 3 à l'adversaire", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Collective Defiance"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Collective Defiance");
      const opt = castOption(s, card);
      const both =
        opt?.type === "cast"
          ? opt.modes.find((m) => plainText(m.label ?? "").includes("4 damage") && plainText(m.label ?? "").includes("3 damage"))
          : undefined;
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card, mode: both?.index, targets: { c: [bear], o: ["p2"] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
    });

    it("le joueur ciblé défausse sa main, puis pioche autant de cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Collective Defiance"] },
        p2: { hand: ["Bear Cub", "Bear Cub", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Collective Defiance"), mode: 0, targets: { p: ["p2"] } }),
      );
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest", "Forest"]);
      expect(s.players.p2?.graveyard).toHaveLength(3);
    });
  });

  describe("Fendre (702.148) : Fierce Retribution", () => {
    it("pour {1}{W}, seulement une créature attaquante ; fendu pour {5}{W}, n'importe quelle créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Fierce Retribution"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Fierce Retribution");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const opt = castOption(s, card);
      // Aucune créature n'attaque : seul le mode fendu a une cible.
      expect(opt?.type === "cast" && opt.modes.map((m) => plainText(m.label ?? ""))).toEqual(["Cleave — {5}{W}"]);
      expect(() => act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [bear] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(6);
    });

    it("pour {1}{W}, détruit la créature qui attaque", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Fierce Retribution"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = attackWith(s, bear);
      const card = idOf(s, "p1", "hand", "Fierce Retribution");
      s = settle(act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Skewer the Critics", () => {
    it("spectacle {R} après une perte de points de vie adverse ; 3 blessures à n'importe quelle cible", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 1), hand: ["Skewer the Critics"] } });
      const card = idOf(s, "p1", "hand", "Skewer the Critics");
      expect(castOption(s, card)).toBeUndefined();
      loseLife(s, "p2", 2);
      s = settle(act(s, "p1", { type: "cast", card, alternative: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(15);
    });
  });

  describe("G6 : Breaking News", () => {
    const castIt = (s: S, name: string, extra: object = {}, player = "p1") =>
      act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
    const spellOn = (s: S) => s.stack[s.stack.length - 1]?.id as string;
    /** p2 lance un sort, puis p1 reçoit la priorité. */
    const opponentCasts = (s: S, name: string, extra: object = {}) => act(castIt(s, name, extra, "p2"), "p2", { type: "pass" });
    const enchantTarget = (s: S, name: string) => {
      const opt = castOption(s, idOf(s, "p1", "hand", name));
      return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
    };

    it("Journey to Nowhere : la créature exilée revient quand l'enchantement part", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Journey to Nowhere"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Journey to Nowhere"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      destroy(s, idOf(s, "p1", "battlefield", "Journey to Nowhere"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Leyline Binding : {1} de moins par type de terrain de base parmi vos terrains", () => {
      const s = scenario({ p1: { battlefield: ["Plains", "Island", "Forest", "Swamp"], hand: ["Leyline Binding"] } });
      expect(castOption(s, idOf(s, "p1", "hand", "Leyline Binding"))).toBeDefined();
    });

    it("Pariah : les blessures qui vous seraient infligées le sont à la créature enchantée", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Pariah"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Pariah", { targets: { [enchantTarget(s, "Pariah")]: [cub] } }));
      dealDamage(s, { defId: "test", controller: "p2", keywords: [] } as never, "p1", 2, false);
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[cub]?.damage).toBe(2);
    });

    it("Path to Exile : la créature est exilée ; son contrôleur peut chercher un terrain de base, engagé", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Path to Exile"] },
        p2: { battlefield: ["Bear Cub"], library: ["Forest", "Bear Cub"] },
      });
      s = settle(castIt(s, "Path to Exile", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Archive Trap : gratuite si un adversaire a cherché dans sa bibliothèque ce tour-ci", () => {
      const s = scenario({ p1: { hand: ["Archive Trap"] }, p2: { library: lands("Forest", 20) } });
      expect(castOption(s, idOf(s, "p1", "hand", "Archive Trap"))).toBeUndefined();
      logTurnEvent(s, { e: "search", player: "p2" });
      s.version += 1;
      let t = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Archive Trap"), alternative: true, targets: { t: ["p2"] } }),
      );
      expect(t.players.p2?.graveyard).toHaveLength(13);
      t = s;
    });

    it("Mana Drain : contrecarre ; {C} autant que la valeur de mana du sort à votre prochaine phase principale", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Mana Drain"], library: lands("Island", 5) },
        p2: { battlefield: lands("Forest", 7), hand: ["Regal Force"] },
      });
      s = opponentCasts(s, "Regal Force");
      s = settle(castIt(s, "Mana Drain", { targets: { t: [spellOn(s)] } }));
      expect(idsOf(s, "p2", "graveyard", "Regal Force")).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.pending?.kind === "priority",
      );
      expect(s.players.p1?.manaPool.C).toBe(7);
    });

    it("Thoughtseize : vous choisissez une carte non-terrain de sa main ; vous perdez 2 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Thoughtseize"] },
        p2: { hand: ["Forest", "Shivan Dragon", "Shock"] },
      });
      s = settle(castIt(s, "Thoughtseize", { targets: { t: ["p2"] } }), (req) => pickNamed(s, req, "Shivan Dragon"));
      expect([idsOf(s, "p2", "graveyard", "Shivan Dragon").length, s.players.p1?.life]).toEqual([1, 18]);
    });

    it("Crackle with Power : 5X blessures à chacune de X cibles au plus", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Crackle with Power"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Crackle with Power", { x: 2, targets: { t: ["p2", idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect([s.players.p2?.life, idsOf(s, "p2", "graveyard", "Bear Cub").length]).toEqual([10, 1]);
    });

    it("Fling : blessures égales à la force de la créature sacrifiée", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Shivan Dragon"], hand: ["Fling"] } });
      s = settle(castIt(s, "Fling", { targets: { t: ["p2"] }, sacrifice: [idOf(s, "p1", "battlefield", "Shivan Dragon")] }));
      expect(s.players.p2?.life).toBe(15);
    });

    it("Skullcrack : personne ne gagne de PV ce tour-ci ; 3 blessures", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Skullcrack"] } });
      s = settle(castIt(s, "Skullcrack", { targets: { t: ["p2"] } }));
      gainLife(s, "p2", 5);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Primal Command : deux modes au choix", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Primal Command"], library: ["Bear Cub", "Forest"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      const opt = castOption(s, idOf(s, "p1", "hand", "Primal Command"));
      expect(opt?.type === "cast" && opt.modes.length).toBe(6);
      const pair =
        opt?.type === "cast"
          ? opt.modes.find(
              (m) => plainText(m.label ?? "").startsWith("Target player gains") && plainText(m.label ?? "").includes("Search"),
            )
          : undefined;
      s = settle(castIt(s, "Primal Command", { mode: pair?.index, targets: { g: ["p1"] } }));
      expect([s.players.p1?.life, idsOf(s, "p1", "hand", "Bear Cub").length]).toEqual([27, 1]);
    });

    it("Back for More : la créature revient, puis se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Swamp"], hand: ["Back for More"], graveyard: ["Shivan Dragon"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Back for More", { targets: { t: [idOf(s, "p1", "graveyard", "Shivan Dragon")] } }), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Crime // Punishment : Punishment détruit les artefacts, créatures et enchantements de valeur de mana X", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Swamp"], hand: ["Crime // Punishment"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Ghostly Prison"] },
      });
      const card = idOf(s, "p1", "hand", "Crime // Punishment");
      const punish = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceName === "Punishment");
      s = settle(act(s, "p1", { type: "cast", card, face: punish?.type === "cast" ? punish.face : 1, x: 2 }));
      expect(
        s.battlefield
          .filter((id) => s.objects[id]?.controller === "p2")
          .map((id) => nameOf(s, id))
          .sort(),
      ).toEqual(["Ghostly Prison", "Llanowar Elves"]);
    });

    it("Decimate : un artefact, une créature, un enchantement et un terrain", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Decimate"] },
        p2: { battlefield: ["Mana Crypt", "Bear Cub", "Ghostly Prison", "Plains"] },
      });
      const t = (n: string) => [idOf(s, "p2", "battlefield", n)];
      s = settle(
        castIt(s, "Decimate", { targets: { a: t("Mana Crypt"), c: t("Bear Cub"), e: t("Ghostly Prison"), l: t("Plains") } }),
      );
      expect(s.players.p2?.graveyard).toHaveLength(4);
    });

    it("Detention Sphere : exile le permanent ciblé et ses homonymes, jusqu'à son départ", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Island"], hand: ["Detention Sphere"] },
        p2: { battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves"] },
      });
      const cub = idsOf(s, "p2", "battlefield", "Bear Cub")[0] as string;
      s = settle(castIt(s, "Detention Sphere"), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub", "Bear Cub"]);
      destroy(s, idOf(s, "p1", "battlefield", "Detention Sphere"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(2);
    });

    it("Ionize : contrecarre et 2 blessures au contrôleur du sort", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Island", 2), "Mountain"], hand: ["Ionize"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = opponentCasts(s, "Bear Cub");
      s = settle(castIt(s, "Ionize", { targets: { t: [spellOn(s)] } }));
      expect([s.players.p2?.life, idsOf(s, "p2", "graveyard", "Bear Cub").length]).toEqual([18, 1]);
    });

    it("Oko : +1, l'artefact ou la créature ciblé devient un Élan vert 3/3 sans capacités", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Oko, Thief of Crowns", counters: { loyalty: 4 } }] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const oko = idOf(s, "p1", "battlefield", "Oko, Thief of Crowns");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      const ab = legalActions(s, "p1").find(
        (a) => a.type === "activate" && a.source === oko && plainText(a.label ?? "").startsWith("+1"),
      );
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: oko,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: [dragon] },
        }),
      );
      const c = chars(s, dragon);
      expect([c.power, c.toughness, c.subtypes, c.colors, c.keywords.includes("flying")]).toEqual([3, 3, ["Elk"], ["G"], false]);
    });

    it("Villainous Wealth : l'adversaire exile X cartes ; vous lancez gratuitement celles de valeur de mana X ou moins", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Island", "Swamp"], hand: ["Villainous Wealth"] },
        p2: { library: ["Bear Cub", "Shivan Dragon", "Forest"] },
      });
      s = untilCastNow(castIt(s, "Villainous Wealth", { x: 2, targets: { t: ["p2"] } }));
      expect(castNowOf(s)?.cards.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(false);
      const cub = castNowOf(s)?.cards.find((id) => nameOf(s, id) === "Bear Cub") as string;
      s = settle(act(s, "p1", { type: "cast", card: cub, free: true }));
      expect(s.battlefield.some((id) => nameOf(s, id) === "Bear Cub" && s.objects[id]?.controller === "p1")).toBe(true);
    });

    it("Voidslime : contrecarre une capacité déclenchée", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Soul Warden", ...lands("Island", 2), "Forest"], hand: ["Voidslime"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = castIt(s, "Bear Cub", {}, "p2");
      s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability") && x.pending?.player === "p1");
      const trig = s.stack.find((i) => i.kind === "ability")?.id as string;
      s = settle(castIt(s, "Voidslime", { targets: { t: [trig] } }));
      expect(s.players.p1?.life).toBe(20);
    });

    it("Mindslaver : vous contrôlez le prochain tour du joueur ciblé", () => {
      let s = scenario({ p1: { battlefield: ["Mindslaver", ...lands("Plains", 4)] } });
      const slaver = idOf(s, "p1", "battlefield", "Mindslaver");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === slaver);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: slaver,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: ["p2"] },
        }),
      );
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(decider(s)).toBe("p1");
    });
  });
  describe("G4e : règles de joueur", () => {
    it("Surgical Extraction : une carte de cimetière (pas un terrain de base) et ses homonymes, exilées", () => {
      let s = scenario({
        p1: { hand: ["Surgical Extraction"] },
        p2: { graveyard: ["Shock", "Forest"], hand: ["Shock"], library: ["Shock", "Mountain"] },
      });
      const forest = idOf(s, "p2", "graveyard", "Forest");
      expect(legalTargets(s, "p1", target.cardInGraveyard("t", { basic: false }, "any"))).not.toContain(forest);
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Surgical Extraction"),
          targets: { t: [idOf(s, "p2", "graveyard", "Shock")] },
        }),
      );
      expect(s.players.p1?.life).toBe(18);
      expect(exiled(s, "Shock")).toHaveLength(3);
      expect(s.players.p2?.hand).toHaveLength(0);
    });
  });
  describe("G4e : combat", () => {
    it("Fell the Mighty : détruit les créatures de force supérieure à celle de la cible", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Llanowar Elves"], hand: ["Fell the Mighty"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fell the Mighty"), targets: { t: [elves] } }));
      expect(s.objects[elves]?.zone).toBe("battlefield");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Ride Down : détruit le bloqueur ; les créatures qu'il bloquait gagnent le piétinement", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Mountain", "Plains"], hand: ["Ride Down"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = attack(s, [cub]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: cub }] });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ride Down"), targets: { t: [elves] } }));
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(chars(s, cub).keywords).toContain("trample");
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Outlaws' Merriment : à votre entretien, un des trois jetons Humain, au hasard", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Outlaws' Merriment"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const humans = s.battlefield.filter((id) =>
        ["Human Warrior", "Human Cleric", "Human Rogue"].includes(nameOf(s, id) as string),
      );
      expect(humans).toHaveLength(1);
      expect(chars(s, humans[0] as string).keywords).toContain("haste");
    });
  });
  describe("G4e : lancer autrement", () => {
    it("Terminal Agony : folie, défaussée elle va en exil et se lance pour son coût de folie", () => {
      const discarder = customCard({
        name: "Défausse de test",
        types: ["Sorcery"],
        typeLine: "Sorcery",
        spell: spell([], [fx.discard(1)]),
      });
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain"], hand: [discarder, "Terminal Agony"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Défausse de test") }));
      const agony = castNowOf(s)?.cards[0] as string;
      expect(s.objects[agony]?.zone).toBe("exile");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: agony, targets: { t: [cub] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Terminal Agony")).toHaveLength(1);
    });

    it("Commandeer : en exilant deux cartes bleues, gagnez le contrôle d'un sort non-créature et changez sa cible", () => {
      const blue = (name: string) => customCard({ name, types: ["Instant"], typeLine: "Instant", colors: ["U"] });
      let s = scenario({
        active: "p2",
        p1: { hand: ["Commandeer", blue("Bleu A"), blue("Bleu B")] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const shock = s.stack[0]?.id as string;
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Commandeer"), alternative: true, targets: { t: [shock] } }),
        (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined),
      );
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });
  describe("G4e : bibliothèque et pioche", () => {
    it("Grindstone : le joueur meule deux cartes, et recommence tant qu'elles partagent une couleur", () => {
      let s = scenario({
        p1: { battlefield: ["Grindstone", ...lands("Mountain", 3)] },
        p2: { library: ["Shock", "Lightning Strike", "Bear Cub", "Shivan Dragon", "Forest"] },
      });
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Grindstone"),
          ability: 0,
          targets: { t: ["p2"] },
        }),
      );
      expect(s.players.p2?.graveyard).toHaveLength(4);
      expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest"]);
    });
  });
  describe("G4e : exil et copies", () => {
    it("Fractured Identity : exile le permanent ; chaque autre joueur en crée une copie", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Fractured Identity"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fractured Identity"), targets: { t: [dragon] } }));
      expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
      const copy = s.battlefield.find((id) => s.objects[id]?.isToken && chars(s, id).name === "Shivan Dragon");
      expect(copy && s.objects[copy]?.controller).toBe("p1");
    });

    it("Unlicensed Hearse : exile jusqu'à deux cartes d'un cimetière ; F/E égales aux cartes exilées avec lui", () => {
      let s = scenario({ p1: { battlefield: ["Unlicensed Hearse"] }, p2: { graveyard: ["Shock", "Bear Cub"] } });
      const hearse = idOf(s, "p1", "battlefield", "Unlicensed Hearse");
      expect(chars(s, hearse).power).toBe(0);
      const gy = s.players.p2?.graveyard ?? [];
      s = settle(act(s, "p1", { type: "activate", source: hearse, ability: 0, targets: { t: [...gy] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(chars(s, hearse).power).toBe(2);
      expect(chars(s, hearse).toughness).toBe(2);
    });

    it("Unlicensed Hearse : les deux cartes viennent d'un même cimetière", () => {
      const s = scenario({
        p1: { battlefield: ["Unlicensed Hearse"], graveyard: ["Opt"] },
        p2: { graveyard: ["Shock"] },
      });
      const hearse = idOf(s, "p1", "battlefield", "Unlicensed Hearse");
      const both = [...(s.players.p1?.graveyard ?? []), ...(s.players.p2?.graveyard ?? [])];
      expect(() => act(s, "p1", { type: "activate", source: hearse, ability: 0, targets: { t: both } })).toThrow();
    });

    it("Indomitable Creativity : détruit X artefacts ou créatures ; leur contrôleur révèle jusqu'à un artefact ou une créature et le met en jeu", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Indomitable Creativity"] },
        p2: { battlefield: ["Bear Cub"], library: ["Forest", "Shivan Dragon", "Island"] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indomitable Creativity"), x: 1, targets: { t: [cub] } }),
      );
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(exiled(s, "Forest")).toHaveLength(1);
    });

    it("Indomitable Creativity : c'est le contrôleur du permanent détruit qui révèle, pas son propriétaire", () => {
      // Votre Bear Cub contrôlé par p2.
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), "Bear Cub"],
          hand: ["Indomitable Creativity"],
          library: ["Forest", "Serra Angel"],
        },
        p2: { library: ["Island", "Shivan Dragon"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      steal(s, cub, "p2");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indomitable Creativity"), x: 1, targets: { t: [cub] } }),
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
});

/** p2 attaque p1 avec la créature, puis p1 reçoit la priorité à la déclaration des attaquants. */
function attackWith(s: S, id: string): S {
  let cur = s;
  for (let i = 0; i < 50 && cur.pending?.kind !== "declareAttackers"; i++) {
    const p = cur.pending;
    if (p?.kind !== "priority") break;
    cur = act(cur, p.player, { type: "pass" });
  }
  cur = act(cur, "p2", { type: "declareAttackers", attackers: [{ id, defender: "p1" }] });
  for (let i = 0; i < 10 && !(cur.pending?.kind === "priority" && cur.pending.player === "p1"); i++) {
    const p = cur.pending;
    if (p?.kind !== "priority") break;
    cur = act(cur, p.player, { type: "pass" });
  }
  return cur;
}

describe("Rééditions, PLAN-A A4a", () => {
  it("Commandeer : « vous pouvez choisir de nouvelles cibles » pour un sort à plusieurs cibles", () => {
    const blue = (name: string) => customCard({ name, types: ["Instant"], typeLine: "Instant", colors: ["U"] });
    const twinBolt = customCard({
      name: "Test Twin Bolt",
      types: ["Instant"],
      typeLine: "Instant",
      spell: spell([target.creature("a"), target.creature("b")], [fx.damage(1, ref.target("a")), fx.damage(1, ref.target("b"))]),
    });
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Llanowar Elves", "Bear Cub"], hand: ["Commandeer", blue("Bleu A"), blue("Bleu B")] },
      p2: { battlefield: ["Shivan Dragon", "Serra Angel"], hand: [twinBolt] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Test Twin Bolt"), targets: { a: [elves], b: [bear] } });
    s = act(s, "p2", { type: "pass" });
    const bolt = s.stack[0]?.id as string;
    const asked: string[][] = [];
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Commandeer"), alternative: true, targets: { t: [bolt] } }),
      (req) => {
        if (req.type !== "pick" || req.intent !== "changeTarget") return undefined;
        asked.push(req.options);
        return asked.length === 1 ? [dragon] : [angel];
      },
    );
    // Une question par mot « cible », la cible d'origine proposée avec les autres.
    expect(asked).toHaveLength(2);
    expect(asked[0]).toEqual(expect.arrayContaining([elves, dragon, angel]));
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[dragon]?.damage).toBe(1);
    expect(s.objects[angel]?.damage).toBe(1);
  });
});
