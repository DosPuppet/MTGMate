/**
 * Tarkir: Dragonstorm (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Harmonie (Channeled Dragonfire, Winternight Stories), mobilisation (Stadium Headliner),
 * contempler (Dispelling Exhale, Sarkhan), renouveau (Qarsi Revenant), présage (Twinmaw Stormbrood), Inevitable Defeat,
 * Tersa Lightshatter, Sage of the Skies et Mistrise Village.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  castTargets as cast,
  castNowOf,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  passUntil,
  picking,
  scenario,
  settle,
  settleNoBlocks,
  untilCastNow,
} from "./helpers";

type S = GameState;
const activation = (s: S, player: string, source: string) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return a?.type === "activate" ? a.ability : undefined;
};

describe("Tarkir: Dragonstorm", () => {
  describe("Harmonie : Channeled Dragonfire", () => {
    it("depuis la main pour {R} : 2 blessures à n'importe quelle cible, puis la carte va au cimetière", () => {
      let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Channeled Dragonfire"] } });
      s = settle(cast(s, "p1", "Channeled Dragonfire", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Channeled Dragonfire")).toHaveLength(1);
    });

    it("depuis le cimetière pour {5}{R}{R} : une créature engagée de force 5 le réduit à {R}{R}, puis le sort est exilé", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Shivan Dragon"], graveyard: ["Channeled Dragonfire"] },
      });
      const card = idOf(s, "p1", "graveyard", "Channeled Dragonfire");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      // Sans créature engagée, deux terrains ne paient pas {5}{R}{R}.
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: ["p2"] }, tap: [] })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] }, tap: [dragon] }));
      expect(s.objects[dragon]?.tapped).toBe(true);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(exiled(s, "Channeled Dragonfire")).toHaveLength(1);
    });
  });

  describe("Winternight Stories", () => {
    it("piochez trois cartes, puis défaussez une seule carte de créature au lieu de deux cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Winternight Stories"], library: ["Bear Cub", "Forest", "Forest"] },
      });
      s = settle(cast(s, "p1", "Winternight Stories"), (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
        return bear ? [bear] : undefined;
      });
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Winternight Stories"]);
    });

    it("sans carte de créature, deux cartes sont défaussées", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Winternight Stories"], library: lands("Forest", 3) } });
      s = settle(cast(s, "p1", "Winternight Stories"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
    });
  });

  describe("Stadium Headliner", () => {
    it("Mobilisation 1 : un Guerrier 1/1 rouge engagé et attaquant, sacrifié au début de l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Stadium Headliner"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const headliner = idOf(s, "p1", "battlefield", "Stadium Headliner");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: headliner, defender: "p2" }] });
      s = settle(s);
      const warriors = idsOf(s, "p1", "battlefield", "Warrior");
      expect(warriors).toHaveLength(1);
      const w = warriors[0] as string;
      expect(s.objects[w]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === w)).toBe(true);
      expect(chars(s, w).colors).toEqual(["R"]);
      expect([chars(s, w).power, chars(s, w).toughness]).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Stadium Headliner")).toHaveLength(1);
    });

    it("{1}{R}, sacrifice : blessures égales au nombre de créatures contrôlées à la résolution (lui non compris)", () => {
      let s = scenario({
        p1: { battlefield: ["Stadium Headliner", "Bear Cub", "Bear Cub", ...lands("Mountain", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const headliner = idOf(s, "p1", "battlefield", "Stadium Headliner");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", {
        type: "activate",
        source: headliner,
        ability: activation(s, "p1", headliner) ?? -1,
        targets: { t: [angel] },
      });
      expect(idsOf(s, "p1", "graveyard", "Stadium Headliner")).toHaveLength(1);
      s = settle(s);
      expect(s.objects[angel]?.damage).toBe(2);
    });
  });

  describe("Contempler : Dispelling Exhale", () => {
    const setup = (p2Hand: string[]) =>
      scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike"] },
        p2: { battlefield: lands("Island", 2), hand: ["Dispelling Exhale", ...p2Hand] },
      });
    const run = (p2Hand: string[]) => {
      let s = setup(p2Hand);
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "Dispelling Exhale", { t: [strike] });
      let asked = false;
      s = settle(s, (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      return { s, asked };
    };

    it("sans Dragon : contrecarre le sort sauf si son contrôleur paie {2}", () => {
      const { s, asked } = run([]);
      expect(asked).toBe(true);
      expect(s.players.p2?.life).toBe(17);
    });

    it("en contemplant un Dragon (carte révélée de la main) : il faut payer {4}", () => {
      const { s } = run(["Shivan Dragon"]);
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      // Le Dragon révélé reste dans la main.
      expect(idsOf(s, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
    });
  });

  describe("Sarkhan, Dragon Ascendant", () => {
    it("en arrivant, contempler un Dragon crée un Trésor ; sans Dragon, rien", () => {
      const run = (hand: string[]) => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Sarkhan, Dragon Ascendant", ...hand] } });
        s = settle(cast(s, "p1", "Sarkhan, Dragon Ascendant"));
        return idsOf(s, "p1", "battlefield", "Treasure").length;
      };
      expect(run(["Shivan Dragon"])).toBe(1);
      expect(run(["Bear Cub"])).toBe(0);
    });

    it("un Dragon arrive sous votre contrôle : un marqueur +1/+1, et Sarkhan est un Dragon volant jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Sarkhan, Dragon Ascendant", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
      const sarkhan = idOf(s, "p1", "battlefield", "Sarkhan, Dragon Ascendant");
      expect(chars(s, sarkhan).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(s.objects[sarkhan]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, sarkhan).subtypes).toEqual(expect.arrayContaining(["Human", "Druid", "Dragon"]));
      expect(chars(s, sarkhan).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, sarkhan).subtypes).not.toContain("Dragon");
      expect(chars(s, sarkhan).keywords).not.toContain("flying");
      expect(s.objects[sarkhan]?.counters["+1/+1"]).toBe(1);
    });

    it("un Dragon adverse qui arrive ne déclenche rien", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Sarkhan, Dragon Ascendant"] },
        p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
      });
      s = settle(cast(s, "p2", "Shivan Dragon"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Sarkhan, Dragon Ascendant")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Renouveau : Qarsi Revenant", () => {
    it("vol, contact mortel et lien de vie", () => {
      const s = scenario({ p1: { battlefield: ["Qarsi Revenant"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Qarsi Revenant")).keywords).toEqual(
        expect.arrayContaining(["flying", "deathtouch", "lifelink"]),
      );
    });

    it("{2}{B}, exilée du cimetière : marqueurs vol, contact mortel et lien de vie sur une créature ciblée", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], graveyard: ["Qarsi Revenant"] } });
      const card = idOf(s, "p1", "graveyard", "Qarsi Revenant");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "activate", source: card, ability: activation(s, "p1", card) ?? -1, targets: { t: [bear] } }),
      );
      expect(exiled(s, "Qarsi Revenant")).toHaveLength(1);
      const c = s.objects[bear]?.counters ?? {};
      expect([c.flying, c.deathtouch, c.lifelink]).toEqual([1, 1, 1]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch", "lifelink"]));
    });

    it("seulement en rituel : ni pendant le tour adverse, ni avec un sort sur la pile", () => {
      const s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], graveyard: ["Qarsi Revenant"] },
      });
      const t = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(activation(t, "p1", idOf(t, "p1", "graveyard", "Qarsi Revenant"))).toBeUndefined();
    });
  });

  describe("Inevitable Defeat", () => {
    it("exile un permanent non-terrain ; son contrôleur perd 3 PV et vous en gagnez 3 ; il ne peut pas être contrecarré", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Plains", "Swamp"], hand: ["Inevitable Defeat"] },
        p2: { battlefield: ["Serra Angel", ...lands("Island", 2)], hand: ["Disdainful Stroke"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = cast(s, "p1", "Inevitable Defeat", { t: [angel] });
      const spell = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      // Le sort est une cible légale ; le contresort ne fait rien.
      s = cast(s, "p2", "Disdainful Stroke", { t: [spell] });
      s = settle(s);
      expect(s.objects[angel]).toBeUndefined();
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("un terrain n'est pas une cible légale", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Plains", "Swamp"], hand: ["Inevitable Defeat"] },
        p2: { battlefield: ["Island"] },
      });
      expect(() => cast(s, "p1", "Inevitable Defeat", { t: [idOf(s, "p2", "battlefield", "Island")] })).toThrow();
    });
  });

  describe("Tersa Lightshatter", () => {
    it("en arrivant : défaussez jusqu'à deux cartes, puis piochez-en autant", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Tersa Lightshatter", "Opt", "Forest"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "Tersa Lightshatter"), (req) => (req.type === "pick" ? req.options.slice(0, 2) : undefined));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Opt"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island", "Island"]);
    });

    it("en attaquant avec sept cartes au cimetière : une carte au hasard est exilée et jouable ce tour-ci", () => {
      const run = (graveyard: number) => {
        let s = scenario({ p1: { battlefield: ["Tersa Lightshatter"], graveyard: lands("Mountain", graveyard) } });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const tersa = idOf(s, "p1", "battlefield", "Tersa Lightshatter");
        s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: tersa, defender: "p2" }] }));
        return s;
      };
      let s = run(7);
      const ex = exiled(s, "Mountain");
      expect(ex).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(6);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === ex[0])).toBe(true);
      s = act(s, "p1", { type: "playLand", card: ex[0] as string });
      expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(1);
      const t = run(6);
      expect(exiled(t, "Mountain")).toHaveLength(0);
      expect(t.players.p1?.graveyard).toHaveLength(6);
    });
  });

  describe("Sage of the Skies", () => {
    it("lancée après un autre sort ce tour-ci : elle est copiée (la copie devient un jeton)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Island"], hand: ["Opt", "Sage of the Skies"], library: lands("Forest", 3) },
      });
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Sage of the Skies"));
      const sages = idsOf(s, "p1", "battlefield", "Sage of the Skies");
      expect(sages).toHaveLength(2);
      expect(sages.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      for (const id of sages) expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
    });

    it("premier sort du tour : pas de copie", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Sage of the Skies"] } });
      s = settle(cast(s, "p1", "Sage of the Skies"));
      expect(idsOf(s, "p1", "battlefield", "Sage of the Skies")).toHaveLength(1);
    });
  });

  describe("Présage : Twinmaw Stormbrood // Charring Bite", () => {
    it("Charring Bite : 5 blessures à une créature sans le vol, puis la carte est mélangée dans la bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Twinmaw Stormbrood // Charring Bite"], library: lands("Plains", 3) },
        p2: { battlefield: ["Serra Angel", "Fire Elemental"] },
      });
      const card = idOf(s, "p1", "hand", "Twinmaw Stormbrood // Charring Bite");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      // Une créature avec le vol n'est pas une cible légale.
      expect(() => act(s, "p1", { type: "cast", card, face: 1, targets: { t: [angel] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [fire] } }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Twinmaw Stormbrood // Charring Bite");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Twinmaw Stormbrood : Dragon 5/4 volant ; en arrivant, vous gagnez 5 PV", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Twinmaw Stormbrood // Charring Bite"] } });
      s = settle(cast(s, "p1", "Twinmaw Stormbrood // Charring Bite"));
      const dragon = idOf(s, "p1", "battlefield", "Twinmaw Stormbrood // Charring Bite");
      const c = chars(s, dragon);
      expect([c.power, c.toughness]).toEqual([5, 4]);
      expect(c.subtypes).toContain("Dragon");
      expect(c.keywords).toContain("flying");
      expect(s.players.p1?.life).toBe(25);
    });
  });

  describe("Mistrise Village", () => {
    it("arrive engagé, sauf si vous contrôlez une Montagne ou une Forêt", () => {
      const play = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["Mistrise Village"] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mistrise Village") }));
        return s.objects[idOf(s, "p1", "battlefield", "Mistrise Village")]?.tapped;
      };
      expect(play(["Island"])).toBe(true);
      expect(play(["Forest"])).toBe(false);
      expect(play(["Mountain"])).toBe(false);
    });

    it("{U}, {T} : le prochain sort lancé ce tour-ci ne peut pas être contrecarré", () => {
      let s = scenario({
        p1: { battlefield: ["Mistrise Village", "Island", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] },
        p2: { battlefield: lands("Island", 2), hand: ["Disdainful Stroke"] },
      });
      const village = idOf(s, "p1", "battlefield", "Mistrise Village");
      const ability = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === village);
      s = settle(
        act(s, "p1", { type: "activate", source: village, ability: ability?.type === "activate" ? ability.ability : -1 }),
      );
      expect(s.objects[village]?.tapped).toBe(true);
      s = cast(s, "p1", "Shivan Dragon");
      const spell = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      // Le sort est une cible légale ; le contresort ne fait rien.
      s = cast(s, "p2", "Disdainful Stroke", { t: [spell] });
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Disdainful Stroke")).toHaveLength(1);
    });
  });
});

describe("Tarkir: Dragonstorm, lot A", () => {
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) =>
    act(s, player, { type: "activate", source, ability: activation(s, player, source) ?? -1, targets });

  describe("Devotees", () => {
    it("Mardu Devotee : {1} donne {R}, {W} ou {B} au choix, une seule fois par tour", () => {
      let s = scenario({ p1: { battlefield: ["Mardu Devotee", "Forest", "Forest"] } });
      const devotee = idOf(s, "p1", "battlefield", "Mardu Devotee");
      let options: string[] = [];
      s = settle(activate(s, "p1", devotee), (req) => {
        if (req.intent !== "manaColor" || req.type !== "pick") return undefined;
        options = req.options;
        return ["B"];
      });
      expect(options).toEqual(["R", "W", "B"]);
      expect(s.players.p1?.manaPool.B).toBe(1);
      expect(activation(s, "p1", devotee)).toBeUndefined();
    });
  });

  describe("Dragonstorms", () => {
    it("Teeming Dragonstorm : deux Soldats 2/2 ; un Dragon qui arrive sous votre contrôle le renvoie en main", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Teeming Dragonstorm"] } });
      s = settle(cast(s, "p1", "Teeming Dragonstorm"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect([chars(s, soldiers[0] as string).power, chars(s, soldiers[0] as string).toughness]).toEqual([2, 2]);
      let t = scenario({ p1: { battlefield: ["Teeming Dragonstorm", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
      t = settle(cast(t, "p1", "Shivan Dragon"));
      expect(idsOf(t, "p1", "hand", "Teeming Dragonstorm")).toHaveLength(1);
    });

    it("Breaching Dragonstorm : exile jusqu'à une carte non-terrain et la lance sans payer (un Dragon le renvoie)", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 5),
          hand: ["Breaching Dragonstorm"],
          library: ["Forest", "Shivan Dragon", "Island"],
        },
      });
      s = untilCastNow(cast(s, "p1", "Breaching Dragonstorm"));
      const dragon = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, dragon)).toBe("Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: dragon, free: true }));
      expect(exiled(s, "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Breaching Dragonstorm")).toHaveLength(1);
    });

    it("Breaching Dragonstorm : si on refuse de la lancer, la carte va en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Breaching Dragonstorm"], library: ["Shivan Dragon", "Island"] },
      });
      s = untilCastNow(cast(s, "p1", "Breaching Dragonstorm"));
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Breaching Dragonstorm")).toHaveLength(1);
    });
  });

  describe("Coûts", () => {
    it("Caustic Exhale : {1} de plus sans Dragon à contempler", () => {
      const base = (hand: string[]) =>
        scenario({ p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale", ...hand] }, p2: { battlefield: ["Bear Cub"] } });
      const s = base([]);
      expect(() => cast(s, "p1", "Caustic Exhale", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
      let t = base(["Shivan Dragon"]);
      t = settle(cast(t, "p1", "Caustic Exhale", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Dragon's Prey : {2} de plus s'il cible un Dragon", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Dragon's Prey"] },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Dragon's Prey", { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] })).toThrow();
      const t = settle(cast(s, "p1", "Dragon's Prey", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Spectral Denial : {1} de moins par créature de force 4 ou plus ; contrecarre à moins de payer X", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Island", "Serra Angel"], hand: ["Spectral Denial"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      // X = 1 : {1}{U} moins {1} (Serra Angel), payé avec une seule Île.
      s = cast(s, "p2", "Spectral Denial", { t: [strike] }, { x: 1 });
      s = settle(s);
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Sunpearl Kirin", () => {
    it("renvoie un autre de vos permanents non-terrain ; si c'était un jeton, piochez une carte", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Mountain", 2)],
          hand: ["Dragon Fodder", "Sunpearl Kirin"],
          library: lands("Island", 3),
        },
      });
      s = settle(cast(s, "p1", "Dragon Fodder"));
      const goblin = idsOf(s, "p1", "battlefield", "Goblin")[0] as string;
      s = settle(cast(s, "p1", "Sunpearl Kirin"), (req) =>
        req.type === "pick" && req.options.includes(goblin) ? [goblin] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    });
  });

  describe("Furious Forebear", () => {
    it("depuis votre cimetière : une de vos créatures meurt, {1}{W} la renvoie en main", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Mountain", 2), "Bear Cub"],
          hand: ["Lightning Strike"],
          graveyard: ["Furious Forebear"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Furious Forebear")).toHaveLength(1);
    });

    it("sa propre mort ne la déclenche pas (elle n'était pas encore au cimetière)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Plains", 2), "Furious Forebear"], hand: ["Lightning Strike"] },
      });
      let asked = false;
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Furious Forebear")] }), (req) => {
        if (req.type === "yesNo") asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
      expect(idsOf(s, "p1", "graveyard", "Furious Forebear")).toHaveLength(1);
    });
  });

  describe("Karakyk Guardian", () => {
    it("défense talismanique tant qu'il n'a pas infligé de blessures", () => {
      let s = scenario({ p1: { battlefield: ["Karakyk Guardian"] } });
      const g = idOf(s, "p1", "battlefield", "Karakyk Guardian");
      expect(chars(s, g).keywords).toContain("hexproof");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: g, defender: "p2" }] }));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(14);
      expect(chars(s, g).keywords).not.toContain("hexproof");
    });
  });

  describe("Stormscale Scion", () => {
    it("Déluge : une copie par sort lancé avant lui ce tour-ci ; vos autres Dragons gagnent +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 6), "Island", "Shivan Dragon"],
          hand: ["Opt", "Stormscale Scion"],
          library: lands("Forest", 3),
        },
      });
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Stormscale Scion"));
      const scions = idsOf(s, "p1", "battlefield", "Stormscale Scion");
      expect(scions).toHaveLength(2);
      expect(scions.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      // Chaque Scion donne +1/+1 à l'autre et au Shivan Dragon.
      expect(chars(s, idOf(s, "p1", "battlefield", "Shivan Dragon")).power).toBe(7);
      expect(chars(s, scions[0] as string).power).toBe(5);
    });
  });

  describe("Venerated Stormsinger", () => {
    it("elle-même ou une autre de vos créatures meurt : chaque adversaire perd 1 PV, vous en gagnez 1", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), "Venerated Stormsinger", "Bear Cub"],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const strikes = idsOf(s, "p1", "hand", "Lightning Strike");
      s = settle(
        act(s, "p1", { type: "cast", card: strikes[0] as string, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      );
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes[1] as string,
          targets: { t: [idOf(s, "p1", "battlefield", "Venerated Stormsinger")] },
        }),
      );
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });
  });

  describe("Death Begets Life", () => {
    it("détruit créatures et enchantements ; piochez une carte par permanent détruit, jetons compris", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Forest", "Island", ...lands("Mountain", 2), "Teeming Dragonstorm"],
          hand: ["Dragon Fodder", "Death Begets Life"],
          library: lands("Plains", 8),
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Dragon Fodder"));
      // Teeming Dragonstorm, deux Gobelins et Serra Angel.
      s = settle(cast(s, "p1", "Death Begets Life"));
      expect(idsOf(s, "p1", "hand", "Plains")).toHaveLength(4);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    });
  });

  describe("Host of the Hereafter", () => {
    it("arrive avec deux marqueurs ; quand une de vos créatures à marqueurs meurt, ses marqueurs vont sur une de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), ...lands("Forest", 2), "Bear Cub"],
          hand: ["Host of the Hereafter", "Bake into a Pie"],
        },
      });
      s = settle(cast(s, "p1", "Host of the Hereafter"));
      const host = idOf(s, "p1", "battlefield", "Host of the Hereafter");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[host]?.counters["+1/+1"]).toBe(2);
      s = settle(cast(s, "p1", "Bake into a Pie", { t: [host] }), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Host of the Hereafter")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    });
  });

  describe("Effortless Master", () => {
    it("arrive avec deux marqueurs +1/+1 si vous avez lancé deux sorts ou plus ce tour-ci (lui compris)", () => {
      const run = (first: boolean) => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 3), ...lands("Mountain", 2)],
            hand: ["Opt", "Effortless Master"],
            library: lands("Forest", 3),
          },
        });
        if (first) s = settle(cast(s, "p1", "Opt"));
        s = settle(cast(s, "p1", "Effortless Master"));
        return s.objects[idOf(s, "p1", "battlefield", "Effortless Master")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(2);
      expect(run(false)).toBe(0);
    });
  });

  describe("Sibsig Appraiser", () => {
    it("regardez deux cartes : exactement une en main, l'autre au cimetière", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Sibsig Appraiser"], library: ["Opt", "Forest", "Island"] },
      });
      s = cast(s, "p1", "Sibsig Appraiser");
      let min = -1;
      s = settle(s, (req) => {
        if (req.intent === "lookAtTop" && req.type === "pick") min = req.min;
        return undefined;
      });
      expect(min).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
    });
  });

  describe("Monuments", () => {
    it("Abzan Monument : cherche une Plaine, un Marais ou une Forêt de base ; sacrifié, un Esprit X/X (plus grande endurance)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 4), "Swamp", "Forest", "Serra Angel"],
          hand: ["Abzan Monument"],
          library: ["Island", "Swamp"],
        },
      });
      s = settle(cast(s, "p1", "Abzan Monument"));
      expect(idsOf(s, "p1", "hand", "Swamp")).toHaveLength(1);
      const monument = idOf(s, "p1", "battlefield", "Abzan Monument");
      s = settle(activate(s, "p1", monument));
      const spirit = idsOf(s, "p1", "battlefield", "Spirit")[0] as string;
      expect([chars(s, spirit).power, chars(s, spirit).toughness]).toEqual([4, 4]);
      expect(chars(s, spirit).colors).toEqual(["W"]);
    });
  });

  describe("Embermouth Sentinel", () => {
    it("sans Dragon, le terrain de base trouvé est mis sur la bibliothèque après le mélange ; avec un Dragon, en jeu engagé", () => {
      const run = (battlefield: string[]) => {
        let s = scenario({
          p1: {
            battlefield: ["Island", "Island", ...battlefield],
            hand: ["Embermouth Sentinel"],
            library: [...lands("Island", 6), "Mountain"],
          },
        });
        s = settle(cast(s, "p1", "Embermouth Sentinel"), (req, _p) =>
          req.type === "yesNo"
            ? [1]
            : req.intent === "search" && req.type === "pick"
              ? [req.options.find((o) => nameOf(s, o) === "Mountain") as string]
              : undefined,
        );
        return s;
      };
      const s = run([]);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Mountain");
      const t = run(["Shivan Dragon"]);
      const m = idsOf(t, "p1", "battlefield", "Mountain");
      expect(m).toHaveLength(1);
      expect(t.objects[m[0] as string]?.tapped).toBe(true);
    });
  });

  describe("Nature's Rhythm", () => {
    it("X = 2 : une carte de créature de valeur de mana 2 ou moins mise en jeu", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Nature's Rhythm"], library: ["Serra Angel", "Bear Cub", "Forest"] },
      });
      let options: string[] = [];
      s = settle(cast(s, "p1", "Nature's Rhythm", {}, { x: 2 }), (req) => {
        if (req.intent === "search" && req.type === "pick") options = req.options.map((o) => nameOf(s, o) as string);
        return undefined;
      });
      expect(options).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Severance Priest", () => {
    it("exile une carte non-terrain de la main adverse ; quand il part, l'adversaire crée un Esprit X/X (X : sa valeur de mana)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), "Forest", ...lands("Mountain", 2)],
          hand: ["Severance Priest", "Lightning Strike"],
        },
        p2: { hand: ["Serra Angel", "Forest"] },
      });
      s = settle(cast(s, "p1", "Severance Priest", { t: ["p2"] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Severance Priest")] }));
      const spirit = idsOf(s, "p2", "battlefield", "Spirit")[0] as string;
      expect([chars(s, spirit).power, chars(s, spirit).toughness]).toEqual([5, 5]);
    });
  });

  describe("Flamehold Grappler", () => {
    it("le prochain sort lancé ce tour-ci est copié", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", ...lands("Mountain", 2), ...lands("Plains", 2)],
          hand: ["Flamehold Grappler", "Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Flamehold Grappler"));
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(14);
    });
  });

  describe("Ainok Wayfarer", () => {
    it("meulez trois cartes : un terrain en main ; sans terrain pris, un marqueur +1/+1", () => {
      const run = (library: string[], take: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Ainok Wayfarer"], library } });
        s = settle(cast(s, "p1", "Ainok Wayfarer"), (req) =>
          req.type === "pick" && req.intent === "pickCards" && !take ? [] : undefined,
        );
        return s;
      };
      const s = run(["Opt", "Forest", "Bear Cub"], true);
      expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ainok Wayfarer")]?.counters["+1/+1"] ?? 0).toBe(0);
      const t = run(["Opt", "Opt", "Bear Cub"], true);
      expect(t.objects[idOf(t, "p1", "battlefield", "Ainok Wayfarer")]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Dragonologist", () => {
    it("vos Dragons dégagés ont la défense talismanique", () => {
      const s = scenario({ p1: { battlefield: ["Dragonologist", "Shivan Dragon", { name: "Shivan Dragon", tapped: true }] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(chars(s, a as string).keywords).toContain("hexproof");
      expect(chars(s, b as string).keywords).not.toContain("hexproof");
    });
  });
});

describe("Tarkir: Dragonstorm, lot B", () => {
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) =>
    act(s, player, { type: "activate", source, ability: activation(s, player, source) ?? -1, targets });
  const endureAnswer =
    (choice: "counters" | "token"): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes("counters") ? [choice] : undefined;

  describe("Endurance (701.64)", () => {
    it("Fortress Kin-Guard : un marqueur +1/+1 sur elle, ou un jeton Esprit blanc 1/1, au choix", () => {
      const run = (choice: "counters" | "token") => {
        let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Fortress Kin-Guard"] } });
        s = settle(cast(s, "p1", "Fortress Kin-Guard"), endureAnswer(choice));
        return s;
      };
      const s = run("counters");
      expect(s.objects[idOf(s, "p1", "battlefield", "Fortress Kin-Guard")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(0);
      const t = run("token");
      const spirit = idsOf(t, "p1", "battlefield", "Spirit")[0] as string;
      expect([chars(t, spirit).power, chars(t, spirit).toughness]).toEqual([1, 1]);
      expect(chars(t, spirit).colors).toEqual(["W"]);
      expect(t.objects[idOf(t, "p1", "battlefield", "Fortress Kin-Guard")]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("un permanent qui n'est plus sur le champ de bataille crée le jeton (Anafenza morte en même temps)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 3), ...lands("Swamp", 4), "Anafenza, Unyielding Lineage", "Bear Cub"],
          hand: ["Bake into a Pie"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Bear Cub meurt : Anafenza endure 2 ; on choisit les marqueurs.
      s = settle(cast(s, "p1", "Bake into a Pie", { t: [bear] }), endureAnswer("counters"));
      const anafenza = idOf(s, "p1", "battlefield", "Anafenza, Unyielding Lineage");
      expect(s.objects[anafenza]?.counters["+1/+1"]).toBe(2);
    });

    it("Warden of the Grove : une autre créature non-jeton arrive, elle endure X (marqueurs sur Warden)", () => {
      let s = scenario({ p1: { battlefield: ["Warden of the Grove", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const warden = idOf(s, "p1", "battlefield", "Warden of the Grove");
      (s.objects[warden] as { counters: Record<string, number> }).counters["+1/+1"] = 2;
      s = settle(cast(s, "p1", "Bear Cub"), endureAnswer("counters"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(2);
    });

    it("Sinkhole Surveyor : en attaquant, vous perdez 1 PV et elle endure 1", () => {
      let s = scenario({ p1: { battlefield: ["Sinkhole Surveyor"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const sv = idOf(s, "p1", "battlefield", "Sinkhole Surveyor");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: sv, defender: "p2" }] }), endureAnswer("token"));
      expect(s.players.p1?.life).toBe(19);
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
    });
  });

  describe("Rafale (Flurry)", () => {
    it("Devoted Duelist : seulement au deuxième sort du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Devoted Duelist", ...lands("Island", 3)], hand: ["Opt", "Opt", "Opt"], library: lands("Forest", 5) },
      });
      const opts = idsOf(s, "p1", "hand", "Opt");
      s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
      expect(s.players.p2?.life).toBe(20);
      s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
      expect(s.players.p2?.life).toBe(19);
      s = settle(act(s, "p1", { type: "cast", card: opts[2] as string }));
      expect(s.players.p2?.life).toBe(19);
    });
  });

  describe("Renouveau", () => {
    it("Sage of the Fang : un marqueur +1/+1, puis doublez les marqueurs +1/+1 de la créature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], graveyard: ["Sage of the Fang"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { counters: Record<string, number> }).counters["+1/+1"] = 2;
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Sage of the Fang"), { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(6);
      expect(exiled(s, "Sage of the Fang")).toHaveLength(1);
    });
  });

  describe("Présages", () => {
    it("Exude Toxin : chaque créature non-Dragon gagne -X/-X ; la carte retourne dans la bibliothèque", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Scavenger Regent // Exude Toxin"], library: lands("Plains", 2) },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      const card = idOf(s, "p1", "hand", "Scavenger Regent // Exude Toxin");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, x: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Scavenger Regent // Exude Toxin");
    });

    it("Bloomvine Regent : lui ou un autre de vos Dragons arrive, vous gagnez 3 PV", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), ...lands("Mountain", 6)],
          hand: ["Bloomvine Regent // Claim Territory", "Shivan Dragon"],
        },
      });
      s = settle(cast(s, "p1", "Bloomvine Regent // Claim Territory"));
      expect(s.players.p1?.life).toBe(23);
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(s.players.p1?.life).toBe(26);
    });
  });

  describe("Sièges", () => {
    const enterSiege = (
      name: string,
      mode: string,
      battlefield: string[],
      extra: Partial<Parameters<typeof scenario>[0]> = {},
    ) => {
      let s = scenario({ ...extra, p1: { battlefield, hand: [name], ...(extra.p1 ?? {}) } });
      let options: string[] = [];
      s = settle(cast(s, "p1", name), (req) => {
        if (req.intent !== "chooseOnEnter" || req.type !== "pick") return undefined;
        options = req.options;
        return [mode];
      });
      return { s, options };
    };

    it("Barrensteppe Siege : choix entre Abzan et Mardu ; Abzan met un marqueur +1/+1 sur vos créatures à votre étape de fin", () => {
      const { s, options } = enterSiege("Barrensteppe Siege", "Abzan", [...lands("Plains", 2), ...lands("Swamp", 2), "Bear Cub"]);
      expect(options).toEqual(["Abzan", "Mardu"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Barrensteppe Siege")]?.chosen?.mode).toBe("Abzan");
      const t = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    });

    it("Barrensteppe Siege, Mardu : une de vos créatures est morte ce tour-ci, chaque adversaire sacrifie une créature", () => {
      let { s } = enterSiege(
        "Barrensteppe Siege",
        "Mardu",
        [...lands("Plains", 2), ...lands("Swamp", 2), ...lands("Mountain", 2), "Bear Cub"],
        {
          p2: { battlefield: ["Serra Angel"] },
        },
      );
      const t0 = advanceUntil(s, (x) => x.turn.active === "p2");
      // Sans mort ce tour-ci : rien.
      expect(idsOf(t0, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Bear Cub", "Barrensteppe Siege"], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const siege = idOf(s, "p1", "battlefield", "Barrensteppe Siege");
      (s.objects[siege] as { chosen?: { mode?: string } }).chosen = { mode: "Mardu" };
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Glacierwood Siege, Sultai : vous pouvez jouer des terrains depuis votre cimetière", () => {
      const { s } = enterSiege("Glacierwood Siege", "Sultai", [...lands("Forest", 2), "Island"], {
        p1: { graveyard: ["Swamp"] },
      });
      const swamp = idOf(s, "p1", "graveyard", "Swamp");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === swamp)).toBe(true);
    });

    it("Windcrag Siege, Mardu : une créature qui attaque fait déclencher deux fois (mobilisation)", () => {
      let s = scenario({ p1: { battlefield: ["Windcrag Siege", "Shock Brigade"] } });
      const siege = idOf(s, "p1", "battlefield", "Windcrag Siege");
      (s.objects[siege] as { chosen?: { mode?: string } }).chosen = { mode: "Mardu" };
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const brigade = idOf(s, "p1", "battlefield", "Shock Brigade");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: brigade, defender: "p2" }] }));
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
    });
  });

  describe("Whirlwing Stormbrood", () => {
    it("vos rituels et vos sorts de Dragon se lancent comme s'ils avaient le flash", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Whirlwing Stormbrood // Dynamic Soar", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] },
      });
      s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Shivan Dragon")).toBe(true);
    });
  });
});

describe("Tarkir: Dragonstorm, lot C", () => {
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: activation(s, player, source) ?? -1, ...extra });
  const loyaltyAbility = (s: S, source: string, n: number) => {
    const acts = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === source);
    return acts[n]?.type === "activate" ? acts[n].ability : -1;
  };

  describe("Ugin, Eye of the Storms", () => {
    it("quand on le lance, exile jusqu'à un permanent coloré ; un sort incolore lancé ensuite en exile un autre", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 9), hand: ["Ugin, Eye of the Storms", "Mox Jasper"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub", "Mox Jasper"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Ugin, Eye of the Storms"), (req) =>
        req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      // L'artefact incolore n'est pas une cible.
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Mox Jasper"), (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Mox Jasper")).toHaveLength(1);
    });
  });

  describe("Elspeth, Storm Slayer", () => {
    it("+1 : deux Soldats (jetons doublés) ; 0 : un marqueur +1/+1 et le vol jusqu'à votre prochain tour", () => {
      let s = scenario({ p1: { battlefield: ["Elspeth, Storm Slayer", "Bear Cub"] } });
      const elspeth = idOf(s, "p1", "battlefield", "Elspeth, Storm Slayer");
      s = settle(act(s, "p1", { type: "activate", source: elspeth, ability: loyaltyAbility(s, elspeth, 0) }));
      expect(idsOf(s, "p1", "battlefield", "Soldier")).toHaveLength(2);
      let t = scenario({ p1: { battlefield: ["Elspeth, Storm Slayer", "Bear Cub"] } });
      const e2 = idOf(t, "p1", "battlefield", "Elspeth, Storm Slayer");
      t = settle(act(t, "p1", { type: "activate", source: e2, ability: loyaltyAbility(t, e2, 1) }));
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(t.objects[bear]?.counters["+1/+1"]).toBe(1);
      t = advanceUntil(t, (x) => x.turn.active === "p2");
      expect(chars(t, bear).keywords).toContain("flying");
      t = advanceUntil(t, (x) => x.turn.active === "p1");
      expect(chars(t, bear).keywords).not.toContain("flying");
    });
  });

  describe("Taigam, Master Opportunist (suspension)", () => {
    it("le deuxième sort est copié, puis exilé avec quatre marqueurs de temps ; au dernier, on le lance sans payer", () => {
      let s = scenario({
        p1: {
          battlefield: ["Taigam, Master Opportunist", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const strikes = idsOf(s, "p1", "hand", "Lightning Strike");
      s = settle(act(s, "p1", { type: "cast", card: strikes[0] as string, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      s = settle(act(s, "p1", { type: "cast", card: strikes[1] as string, targets: { t: ["p2"] } }));
      // La copie se résout ; l'original est exilé, suspendu.
      expect(s.players.p2?.life).toBe(14);
      const susp = exiled(s, "Lightning Strike");
      expect(susp).toHaveLength(1);
      expect(s.objects[susp[0] as string]?.counters.time).toBe(4);
      // Trois entretiens : un marqueur de moins à chacun.
      for (let k = 3; k >= 1; k--) {
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(s.objects[exiled(s, "Lightning Strike")[0] as string]?.counters.time).toBe(k);
      }
      // Quatrième entretien : le dernier marqueur est retiré, la carte peut être lancée gratuitement.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = untilCastNow(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep"));
      const card = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, card)).toBe("Lightning Strike");
      s = settle(act(s, "p1", { type: "cast", card, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(11);
    });
  });

  describe("Hundred-Battle Veteran", () => {
    it("+2/+4 avec trois sortes de marqueurs parmi vos créatures ; lancée depuis le cimetière avec un marqueur de finalité", () => {
      const s = scenario({ p1: { battlefield: ["Hundred-Battle Veteran", "Bear Cub"] } });
      const vet = idOf(s, "p1", "battlefield", "Hundred-Battle Veteran");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, vet).power).toBe(4);
      const c = (s.objects[bear] as { counters: Record<string, number> }).counters;
      c["+1/+1"] = 1;
      c.flying = 1;
      c.stun = 1;
      s.version += 1;
      expect([chars(s, vet).power, chars(s, vet).toughness]).toEqual([6, 6]);
      let t = scenario({ p1: { battlefield: lands("Swamp", 4), graveyard: ["Hundred-Battle Veteran"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "Hundred-Battle Veteran") }));
      expect(t.objects[idOf(t, "p1", "battlefield", "Hundred-Battle Veteran")]?.counters.finality).toBe(1);
    });
  });

  describe("Krumar Initiate", () => {
    it("{X}{B}, {T}, payez X PV : endurance X", () => {
      let s = scenario({ p1: { battlefield: ["Krumar Initiate", ...lands("Swamp", 3)] } });
      const k = idOf(s, "p1", "battlefield", "Krumar Initiate");
      s = settle(activate(s, "p1", k, { x: 2 }), (req) =>
        req.type === "pick" && req.options.includes("counters") ? ["counters"] : undefined,
      );
      expect(s.players.p1?.life).toBe(18);
      expect(s.objects[k]?.counters["+1/+1"]).toBe(2);
    });
  });

  describe("Rot-Curse Rakshasa (décomposition)", () => {
    it("renouveau : un marqueur de décomposition sur exactement X créatures ; elles ne bloquent plus", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), graveyard: ["Rot-Curse Rakshasa"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const card = idOf(s, "p1", "graveyard", "Rot-Curse Rakshasa");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // X = 2 avec une seule cible : refusé.
      expect(() => activate(s, "p1", card, { x: 2, targets: { t: [bear] } })).toThrow();
      s = settle(activate(s, "p1", card, { x: 2, targets: { t: [bear, angel] } }));
      expect(s.objects[bear]?.counters.decayed).toBe(1);
      expect(chars(s, angel).keywords).toContain("decayed");
    });

    it("décomposition : la créature attaque, puis elle est sacrifiée à la fin du combat", () => {
      let s = scenario({ p1: { battlefield: ["Rot-Curse Rakshasa"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const r = idOf(s, "p1", "battlefield", "Rot-Curse Rakshasa");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: r, defender: "p2" }] }));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(15);
      expect(idsOf(s, "p1", "graveyard", "Rot-Curse Rakshasa")).toHaveLength(1);
    });
  });

  describe("The Sibsig Ceremony", () => {
    it("vos sorts de créature coûtent {2} de moins ; une créature lancée qui arrive est détruite et remplacée par un Zombie Druide", () => {
      let s = scenario({ p1: { battlefield: ["The Sibsig Ceremony", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] } });
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Zombie Druid")).toHaveLength(1);
    });
  });

  describe("Sidisi, Regent of the Mire", () => {
    it("sacrifiez une créature de VM X : une carte de créature de VM X + 1 revient du cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: ["Sidisi, Regent of the Mire", "Bear Cub"],
          graveyard: ["Serra Angel", "Dragonologist", "Fortress Kin-Guard"],
        },
      });
      const sidisi = idOf(s, "p1", "battlefield", "Sidisi, Regent of the Mire");
      // Seule cible possible (VM 3) : choisie d'office.
      s = settle(activate(s, "p1", sidisi));
      expect(idsOf(s, "p1", "battlefield", "Dragonologist")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Dracogenesis", () => {
    it("vos sorts de Dragon se lancent sans payer leur coût de mana", () => {
      const s = scenario({ p1: { battlefield: ["Dracogenesis"], hand: ["Shivan Dragon", "Serra Angel"] } });
      const t = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shivan Dragon"), free: true }));
      expect(idsOf(t, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(() => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Serra Angel"), free: true })).toThrow();
    });
  });

  describe("Formation Breaker", () => {
    it("les créatures de force inférieure à la sienne ne peuvent pas la bloquer", () => {
      let s = scenario({ p1: { battlefield: ["Formation Breaker"] }, p2: { battlefield: ["Llanowar Elves", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const fb = idOf(s, "p1", "battlefield", "Formation Breaker");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: fb, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(s, "p2", "battlefield", "Llanowar Elves"), attacker: fb }],
        }),
      ).toThrow();
      const t = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: fb }],
      });
      expect(t.combat?.blockers).toHaveLength(1);
    });
  });

  describe("All-Out Assault", () => {
    it("lancé en phase principale 1 : un combat et une phase principale supplémentaires, puis le combat normal", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Plains", ...lands("Swamp", 2), "Bear Cub"], hand: ["All-Out Assault"] },
      });
      s = settle(cast(s, "p1", "All-Out Assault"));
      const steps: string[] = [];
      for (let i = 0; i < 400 && s.turn.active === "p1"; i++) {
        if (steps[steps.length - 1] !== s.turn.step) steps.push(s.turn.step);
        const p = s.pending;
        if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
        else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
        else break;
      }
      expect(steps.filter((x) => x === "beginCombat")).toHaveLength(2);
      expect(steps.indexOf("main1")).toBeLessThan(steps.indexOf("beginCombat"));
      expect(steps.filter((x) => x === "main1").length + steps.filter((x) => x === "main2").length).toBe(3);
    });
  });

  describe("Call the Spirit Dragons", () => {
    it("un marqueur +1/+1 sur un Dragon de chaque couleur ; cinq Dragons différents : vous gagnez", () => {
      let s = scenario({
        active: "p2",
        p1: {
          battlefield: [
            "Call the Spirit Dragons",
            "Riling Dawnbreaker // Signaling Roar",
            "Dirgur Island Dragon // Skimming Strike",
            "Scavenger Regent // Exude Toxin",
            "Shivan Dragon",
            "Sagu Wildling // Roost Seek",
          ],
        },
      });
      s = advanceUntil(s, (x) => x.over || (x.turn.active === "p1" && x.turn.step === "main1"));
      expect(s.over).toBe(true);
      expect(s.winner).toBe("p1");
    });
  });

  describe("Felothar, Dawn of the Abzan", () => {
    it("en arrivant, vous pouvez sacrifier un permanent non-terrain : un marqueur +1/+1 sur chacune de vos créatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 1), ...lands("Swamp", 1), "Forest", "Bear Cub", "Dragonstorm Globe"],
          hand: ["Felothar, Dawn of the Abzan"],
        },
      });
      const globe = idOf(s, "p1", "battlefield", "Dragonstorm Globe");
      s = settle(cast(s, "p1", "Felothar, Dawn of the Abzan"), (req) =>
        req.type === "pick" && req.options.includes(globe) ? [globe] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Dragonstorm Globe")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Kotis, the Fangkeeper", () => {
    it("blesse un joueur : exile X cartes de sa bibliothèque, on lance gratuitement celles de VM X ou moins", () => {
      let s = scenario({ p1: { battlefield: ["Kotis, the Fangkeeper"] }, p2: { library: ["Serra Angel", "Opt", "Forest"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const k = idOf(s, "p1", "battlefield", "Kotis, the Fangkeeper");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: k, defender: "p2" }] });
      s = untilCastNow(s);
      const req = castNowOf(s);
      expect(req?.cards.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Narset, Jeskai Waymaster", () => {
    it("à votre étape de fin, défaussez votre main pour piocher une carte par sort lancé ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Narset, Jeskai Waymaster", ...lands("Island", 2)],
          hand: ["Opt", "Opt", "Forest"],
          library: lands("Plains", 6),
        },
      });
      for (const id of idsOf(s, "p1", "hand", "Opt")) s = settle(act(s, "p1", { type: "cast", card: id }));
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 200);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      expect(s.players.p1?.hand.filter((id) => nameOf(s, id) === "Plains")).toHaveLength(2);
    });
  });

  describe("Roar of Endless Song", () => {
    it("chapitre III : la force et l'endurance de chacune de vos créatures sont doublées", () => {
      let s = scenario({ p1: { battlefield: ["Roar of Endless Song", "Bear Cub", "Serra Angel"] } });
      const roar = idOf(s, "p1", "battlefield", "Roar of Endless Song");
      (s.objects[roar] as { counters: Record<string, number> }).counters.lore = 2;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([8, 8]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(4);
    });
  });

  describe("Shiko, Paragon of the Way", () => {
    it("exile une carte non-terrain de VM 3 ou moins de votre cimetière et lance une copie sans payer", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), "Mountain", "Plains"],
          hand: ["Shiko, Paragon of the Way"],
          graveyard: ["Lightning Strike"],
        },
      });
      s = untilCastNow(cast(s, "p1", "Shiko, Paragon of the Way"));
      const copy = castNowOf(s)?.cards[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
    });
  });

  describe("Songcrafter Mage", () => {
    it("un éphémère de votre cimetière gagne l'harmonie : lançable pour son coût de mana, réduit par une créature engagée", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest", "Island", "Mountain", "Mountain", "Bear Cub"],
          hand: ["Songcrafter Mage"],
          graveyard: ["Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Songcrafter Mage"));
      // {1}{R} : la dernière Montagne paie {R}, Bear Cub engagé paie le {1}.
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] }, tap: [bear] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Stalwart Successor", () => {
    it("les premiers marqueurs du tour sur une de vos créatures en ajoutent un ; pas les suivants", () => {
      let s = scenario({
        p1: {
          battlefield: ["Stalwart Successor", "Bear Cub", ...lands("Plains", 4)],
          hand: ["Lightfoot Technique", "Lightfoot Technique"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lt = idsOf(s, "p1", "hand", "Lightfoot Technique");
      s = settle(act(s, "p1", { type: "cast", card: lt[0] as string, targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      s = settle(act(s, "p1", { type: "cast", card: lt[1] as string, targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
    });
  });

  describe("Teval, Arbiter of Virtue", () => {
    it("vos sorts ont la cave ; chaque sort lancé vous fait perdre autant de PV que sa valeur de mana", () => {
      let s = scenario({
        p1: { battlefield: ["Teval, Arbiter of Virtue", "Mountain"], hand: ["Lightning Strike"], graveyard: ["Opt", "Forest"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(18);
      // Une carte du cimetière a payé le {1}.
      expect(s.players.p1?.graveyard.filter((id) => nameOf(s, id) !== "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Ureni, the Song Unending", () => {
    it("protection contre le blanc et le noir ; X blessures (X : vos terrains) réparties entre les créatures adverses", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 6), "Island", "Mountain"], hand: ["Ureni, the Song Unending"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ureni, the Song Unending"), (req) => {
        if (req.type === "pick" && req.options.includes(angel)) return [angel, bear];
        if (req.type === "divide") return req.among.map((id) => (id === angel ? 6 : 2));
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const u = idOf(s, "p1", "battlefield", "Ureni, the Song Unending");
      expect(chars(s, u).protections.map((p) => p.label)).toContain("Protection contre le blanc et contre le noir");
    });
  });

  describe("Zurgo, Thunder's Decree", () => {
    it("pendant votre étape de fin, vos jetons Guerrier ne peuvent pas être sacrifiés (ceux de la mobilisation restent)", () => {
      let s = scenario({ p1: { battlefield: ["Zurgo, Thunder's Decree"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const z = idOf(s, "p1", "battlefield", "Zurgo, Thunder's Decree");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: z, defender: "p2" }] }));
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
    });
  });
});

describe("Tarkir: Dragonstorm, lot D (remplacements de blessures, R1)", () => {
  describe("Neriv, Heart of the Storm", () => {
    it("une de vos créatures arrivée ce tour-ci inflige le double de blessures ; les autres, non", () => {
      const s = scenario({ p1: { battlefield: ["Neriv, Heart of the Storm", "Bear Cub", { name: "Serra Angel", sick: true }] } });
      dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Serra Angel")), "p2", 4, false);
      expect(s.players.p2?.life).toBe(12);
      dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub")), "p2", 2, false);
      expect(s.players.p2?.life).toBe(10);
    });
  });

  describe("New Way Forward (bouclier, 615.7)", () => {
    const setup = () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Mountain", "Plains", ...lands("Island", 2)],
          hand: ["New Way Forward"],
          library: lands("Forest", 8),
        },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "New Way Forward"), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      return { s, dragon };
    };

    it("la prochaine fois que la source choisie devrait vous blesser ce tour-ci, c'est prévenu : elle blesse son contrôleur et vous piochez autant", () => {
      let { s, dragon } = setup();
      const hand = s.players.p1?.hand.length ?? 0;
      dealDamage(s, sourceFromObject(s, dragon), "p1", 5, true);
      expect(s.players.p1?.life).toBe(20);
      s = settle(s);
      expect(s.players.p2?.life).toBe(15);
      expect(s.players.p1?.hand.length).toBe(hand + 5);
      // Le bouclier ne sert qu'une fois.
      dealDamage(s, sourceFromObject(s, dragon), "p1", 5, true);
      expect(s.players.p1?.life).toBe(15);
    });

    it("une autre source n'est pas concernée, et le bouclier disparaît à la fin du tour", () => {
      let { s, dragon } = setup();
      dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Serra Angel")), "p1", 4, true);
      expect(s.players.p1?.life).toBe(16);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      dealDamage(s, sourceFromObject(s, dragon), "p1", 5, true);
      expect(s.players.p1?.life).toBe(11);
    });
  });
});

describe("Tarkir: Dragonstorm : cibles « une à trois » d'une capacité déclenchée", () => {
  it("Armament Dragon : seul sur le champ de bataille, il reçoit les trois marqueurs (une cible suffit)", () => {
    let s = scenario({
      p1: {
        battlefield: [...Array(2).fill("Plains"), ...Array(2).fill("Swamp"), ...Array(2).fill("Forest")],
        hand: ["Armament Dragon"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Armament Dragon") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    const dragon = idOf(s, "p1", "battlefield", "Armament Dragon");
    expect(s.objects[dragon]?.counters["+1/+1"]).toBe(3);
  });
});

describe("Tarkir: Dragonstorm : cartes du méta (PLAN-C, lot C13)", () => {
  /** Active la capacité de `source` dont le libellé contient `label`. */
  const activate = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability });
  };
  const castOk = (s: S, name: string) =>
    legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

  describe("Maelstrom of the Spirit Dragon", () => {
    it("{T} : {C} ; le mana de n'importe quelle couleur ne sert qu'à un sort de Dragon (ou de présage)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Maelstrom of the Spirit Dragon", "Plains", "Plains"],
          hand: ["Firespitter Whelp", "Goblin Oriflamme"],
        },
      });
      // Goblin Oriflamme {1}{R} : le {R} ne peut venir que du Maelstrom, réservé aux Dragons.
      expect(castOk(s, "Goblin Oriflamme")).toBe(false);
      expect(() => cast(s, "p1", "Goblin Oriflamme")).toThrow();
      // Firespitter Whelp {2}{R}, un Dragon : le Maelstrom donne le {R}.
      expect(castOk(s, "Firespitter Whelp")).toBe(true);
      s = settle(cast(s, "p1", "Firespitter Whelp"));
      expect(idsOf(s, "p1", "battlefield", "Firespitter Whelp")).toHaveLength(1);
    });

    it("le mana de couleur paie aussi un sort de présage (Charring Bite)", () => {
      let s = scenario({
        p1: { battlefield: ["Maelstrom of the Spirit Dragon", "Plains"], hand: ["Twinmaw Stormbrood // Charring Bite"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Twinmaw Stormbrood // Charring Bite", { t: [bear] }, { face: 1 }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("{T} : {C} paie le générique de n'importe quel sort", () => {
      let s = scenario({ p1: { battlefield: ["Maelstrom of the Spirit Dragon", "Mountain"], hand: ["Goblin Oriflamme"] } });
      s = settle(cast(s, "p1", "Goblin Oriflamme"));
      expect(idsOf(s, "p1", "battlefield", "Goblin Oriflamme")).toHaveLength(1);
    });

    it("{4}, {T}, sacrifice : cherche une carte de Dragon (et seulement une), la met en main, puis mélange", () => {
      let s = scenario({
        p1: {
          battlefield: ["Maelstrom of the Spirit Dragon", ...lands("Mountain", 4)],
          library: ["Forest", "Shivan Dragon", "Bear Cub", "Island"],
        },
      });
      const maelstrom = idOf(s, "p1", "battlefield", "Maelstrom of the Spirit Dragon");
      let offered: (string | undefined)[] = [];
      s = settle(activate(s, "p1", maelstrom, "Dragon"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(cur, id));
        return req.options.filter((id) => nameOf(cur, id) === "Shivan Dragon").slice(0, 1);
      });
      expect(offered).toEqual(["Shivan Dragon"]);
      expect(idsOf(s, "p1", "graveyard", "Maelstrom of the Spirit Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(3);
    });
  });

  describe("Frontline Rush", () => {
    it("premier mode : deux jetons Gobelin rouges 1/1", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Plains"], hand: ["Frontline Rush"] } });
      s = settle(cast(s, "p1", "Frontline Rush", undefined, { mode: 0 }));
      const goblins = s.battlefield.filter((id) => chars(s, id).name === "Goblin");
      expect(goblins).toHaveLength(2);
      for (const g of goblins) {
        expect(s.objects[g]?.controller).toBe("p1");
        expect(chars(s, g).colors).toEqual(["R"]);
        expect(chars(s, g).subtypes).toContain("Goblin");
        expect([chars(s, g).power, chars(s, g).toughness]).toEqual([1, 1]);
      }
      expect(idsOf(s, "p1", "graveyard", "Frontline Rush")).toHaveLength(1);
    });

    it("second mode : +X/+X à une créature ciblée, X = le nombre de créatures que vous contrôlez (pas celles de l'adversaire)", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Plains", "Bear Cub", "Llanowar Elves", "Serra Angel"], hand: ["Frontline Rush"] },
        p2: { battlefield: ["Bear Cub", "Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Frontline Rush", { t: [bear] }, { mode: 1 }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
      // Jusqu'à la fin du tour.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([2, 2]);
    });

    it("second mode : peut cibler une créature adverse ; X compte toujours vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Plains", "Llanowar Elves"], hand: ["Frontline Rush"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Frontline Rush", { t: [bear] }, { mode: 1 }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
    });
  });

  describe("United Battlefront", () => {
    it("parmi les sept du dessus, jusqu'à deux permanents non-créatures non-terrains de VM 3 ou moins arrivent ; le reste va dessous", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["United Battlefront"],
          library: [
            "Goblin Oriflamme",
            "Hedron Archive",
            "Shivan Dragon",
            "Forest",
            "Opt",
            "Phyrexian Arena",
            "Bear Trap",
            "Feldon's Cane",
          ],
        },
      });
      let offered: (string | undefined)[] = [];
      let max = 0;
      s = settle(cast(s, "p1", "United Battlefront"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(cur, id));
        max = req.max;
        return req.options.filter((id) => ["Goblin Oriflamme", "Phyrexian Arena"].includes(nameOf(cur, id) ?? ""));
      });
      // Ni créature, ni terrain, ni éphémère, ni VM 4, ni la huitième carte.
      expect(offered.sort()).toEqual(["Bear Trap", "Goblin Oriflamme", "Phyrexian Arena"]);
      expect(max).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Goblin Oriflamme")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Phyrexian Arena")).toHaveLength(1);
      // Les cinq autres sont sous la huitième, désormais au-dessus.
      const lib = s.players.p1?.library ?? [];
      expect(lib).toHaveLength(6);
      expect(nameOf(s, lib[0] as string)).toBe("Feldon's Cane");
      expect(namesIn(s, lib.slice(1)).sort()).toEqual(["Bear Trap", "Forest", "Hedron Archive", "Opt", "Shivan Dragon"]);
    });
  });

  describe("Dalkovan Encampment", () => {
    it("arrive engagé sauf si vous contrôlez un Marais ou une Montagne ; {T} : {W}", () => {
      const play = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["Dalkovan Encampment"] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Dalkovan Encampment") });
        return s.objects[idOf(s, "p1", "battlefield", "Dalkovan Encampment")]?.tapped;
      };
      expect(play(["Plains"])).toBe(true);
      expect(play(["Mountain"])).toBe(false);
      expect(play(["Swamp"])).toBe(false);
      // Le {W} paie un sort blanc.
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment"], hand: ["Healer's Hawk"] } });
      s = settle(cast(s, "p1", "Healer's Hawk"));
      expect(idsOf(s, "p1", "battlefield", "Healer's Hawk")).toHaveLength(1);
    });

    it("{2}{W}, {T} : quand vous attaquez ce tour-ci, deux Guerriers 1/1 rouges engagés et attaquants, sacrifiés à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment", ...lands("Plains", 3), "Bear Cub"] } });
      const camp = idOf(s, "p1", "battlefield", "Dalkovan Encampment");
      s = settle(activate(s, "p1", camp, "Guerriers"));
      expect(s.objects[camp]?.tapped).toBe(true);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = settle(s);
      const warriors = s.battlefield.filter((id) => chars(s, id).name === "Warrior");
      expect(warriors).toHaveLength(2);
      for (const w of warriors) {
        expect(s.objects[w]?.tapped).toBe(true);
        expect(s.combat?.attackers.some((a) => a.id === w && a.defender === "p2")).toBe(true);
        expect(chars(s, w).colors).toEqual(["R"]);
        expect([chars(s, w).power, chars(s, w).toughness]).toEqual([1, 1]);
      }
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("sans attaque ce tour-ci, aucun Guerrier ; l'effet ne dure pas jusqu'au tour suivant", () => {
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment", ...lands("Plains", 3), "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Dalkovan Encampment"), "Guerriers"));
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = settle(s);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(0);
    });

    it("603.7 : capacité retardée, indépendante du terrain ; détruit après l'activation, l'attaque crée quand même les Guerriers", () => {
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment", ...lands("Plains", 3), "Bear Cub"] } });
      const camp = idOf(s, "p1", "battlefield", "Dalkovan Encampment");
      s = settle(activate(s, "p1", camp, "Guerriers"));
      s = structuredClone(s);
      destroy(s, camp);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Dalkovan Encampment")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = settle(s);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(2);
    });
  });
});

describe("« Défaussez votre main » en coût (lot K3)", () => {
  it("Reverberating Summons : la main est défaussée en activant (avant toute réponse), même vide ; puis piochez deux cartes", () => {
    const run = (hand: string[]) => {
      let s = scenario({
        p1: { battlefield: ["Reverberating Summons", ...lands("Mountain", 2)], hand, library: lands("Island", 5) },
      });
      const summons = idOf(s, "p1", "battlefield", "Reverberating Summons");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === summons);
      expect(opt).toBeDefined();
      s = act(s, "p1", { type: "activate", source: summons, ability: opt?.type === "activate" ? opt.ability : -1 });
      // La capacité est sur la pile : la main est déjà au cimetière.
      expect(s.stack).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(hand));
      s = settle(s);
      return s;
    };
    expect(run(["Bear Cub", "Shock"]).players.p1?.hand).toHaveLength(2);
    expect(run([]).players.p1?.hand).toHaveLength(2);
  });
});

describe("Severance Priest (lot K6)", () => {
  it("« vous pouvez choisir une carte non-terrain » : le joueur peut n'en choisir aucune", () => {
    const run = (take: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Forest"], hand: ["Severance Priest"] },
        p2: { hand: ["Shivan Dragon", "Forest"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Severance Priest") });
      let min: number | undefined;
      for (let i = 0; i < 30 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "pickCards") {
          min = p.request.min;
          s = act(s, p.player, { type: "choose", values: take ? p.request.suggested : [] });
        } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
        else break;
      }
      return { s, min };
    };
    const no = run(false);
    expect(no.min).toBe(0);
    expect(namesIn(no.s, no.s.players.p2?.hand)).toContain("Shivan Dragon");
    const yes = run(true);
    expect(namesIn(yes.s, yes.s.players.p2?.hand)).not.toContain("Shivan Dragon");
  });
});

// ---------------------------------------------------------------------------
// Lot K8 (docs/audits/2026-10-03-cartes.md) : cartes mythiques, rares et peu communes sans test de règles.
// ---------------------------------------------------------------------------

/** Active la capacité de `source` dont le libellé contient `label`. */
const activateNamed = (s: S, source: string, label: string, extra: object = {}, player: PlayerId = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
  if (a?.type !== "activate") throw new Error(`capacité « ${label} » introuvable`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const hasActivation = (s: S, source: string, label: string, player: PlayerId = "p1") =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
/** Répond oui/non aux questions, choisit le mode d'un déclenchement, le choix d'endurance et les objets voulus. */
const answering =
  (opts: { yes?: boolean; pick?: string[]; mode?: number; endure?: "counters" | "token" }) =>
  (req: ChoiceRequest): ChoiceValue[] | undefined => {
    if (req.type === "yesNo" && opts.yes !== undefined) return [opts.yes ? 1 : 0];
    if (req.type === "pick" && req.intent === "triggerMode" && opts.mode !== undefined) return [String(opts.mode)];
    if (req.type === "pick" && opts.endure && req.options.includes("counters")) return [opts.endure];
    return opts.pick ? picking(opts.pick)(req) : undefined;
  };
const tokensOf = (s: S, player: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.controller === player && s.objects[id]?.isToken && nameOf(s, id) === name);
const lifeOf = (s: S, p: PlayerId) => s.players[p]?.life;
const handSize = (s: S, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
/** Jusqu'à la phase principale précombat du prochain tour de p1 (sans résoudre ce qui s'y déclenche). */
const nextMain = (s: S) =>
  advanceUntil(
    advanceUntil(s, (x) => x.turn.active === "p2"),
    (x) => x.turn.active === "p1" && x.turn.step === "main1",
  );
/** Jusqu'à l'entretien du prochain tour de p1. */
const nextUpkeep = (s: S) =>
  advanceUntil(
    advanceUntil(s, (x) => x.turn.active === "p2"),
    (x) => x.turn.active === "p1" && x.turn.step === "upkeep",
  );
const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
/** Le terrain joué arrive-t-il engagé ? */
const landEntersTapped = (name: string, battlefield: string[]) => {
  const s = settle(playLand(scenario({ p1: { battlefield, hand: [name] } }), name));
  return s.objects[idOf(s, "p1", "battlefield", name)]?.tapped;
};

describe("Tarkir: Dragonstorm, lot K8 : mythiques", () => {
  it("Betor, Kin to All : endurance totale 10 : piochez ; 20 : dégagez vos créatures ; 40 : chaque adversaire perd la moitié de ses PV", () => {
    const run = (battlefield: (string | { name: string; tapped?: boolean; counters?: Record<string, number> })[]) => {
      let s = scenario({ p1: { battlefield }, p2: { life: 15 } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      return s;
    };
    // Betor seul (endurance 7) : rien.
    let s = run(["Betor, Kin to All"]);
    expect(handSize(s, "p1")).toBe(0);
    // 7 + 4 = 11 : une carte, mais pas de dégagement.
    s = run(["Betor, Kin to All", { name: "Serra Angel", tapped: true }]);
    expect(handSize(s, "p1")).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.tapped).toBe(true);
    expect(lifeOf(s, "p2")).toBe(15);
    // 7 + 9 + 4 = 20 : une carte et vos créatures se dégagent.
    s = run([{ name: "Betor, Kin to All", tapped: true }, "Ambling Stormshell", { name: "Serra Angel", tapped: true }]);
    expect(handSize(s, "p1")).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Betor, Kin to All")]?.tapped).toBe(false);
    expect(lifeOf(s, "p2")).toBe(15);
    // 7 + 33 = 40 : l'adversaire perd la moitié de ses PV, arrondie au supérieur (15 → 7).
    s = run([{ name: "Betor, Kin to All", counters: { "+1/+1": 33 } }]);
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p2")).toBe(7);
  });

  it("Craterhoof Behemoth : célérité ; vos créatures gagnent le piétinement et +X/+X (X : vos créatures) jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 8), "Bear Cub"], hand: ["Craterhoof Behemoth"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Craterhoof Behemoth"));
    const hoof = idOf(s, "p1", "battlefield", "Craterhoof Behemoth");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, hoof).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, hoof)).toEqual([7, 7]);
    expect(chars(s, bear).keywords).toContain("trample");
    // Les créatures adverses ne sont pas concernées.
    expect(pt(s, angel)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Dragonback Assault : 3 blessures à chaque créature et chaque planeswalker ; toucheterre : un Dragon 4/4 rouge volant", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest", "Island", "Mountain", ...lands("Forest", 3), "Bear Cub"],
        hand: ["Dragonback Assault", "Forest"],
      },
      p2: { battlefield: ["Serra Angel", "Elspeth, Storm Slayer"] },
    });
    const elspeth = idOf(s, "p2", "battlefield", "Elspeth, Storm Slayer");
    const loyalty = s.objects[elspeth]?.counters.loyalty ?? 0;
    s = settle(cast(s, "p1", "Dragonback Assault"));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    expect(s.objects[elspeth]?.counters.loyalty).toBe(loyalty - 3);
    expect(tokensOf(s, "p1", "Dragon")).toHaveLength(0);
    s = settle(playLand(s, "Forest"));
    const dragons = tokensOf(s, "p1", "Dragon");
    expect(dragons).toHaveLength(1);
    const d = dragons[0] as string;
    expect(pt(s, d)).toEqual([4, 4]);
    expect(chars(s, d).colors).toEqual(["R"]);
    expect(chars(s, d).keywords).toContain("flying");
  });

  it("Perennation : une carte de permanent de votre cimetière revient avec un marqueur de défense talismanique et un d'indestructible", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", ...lands("Forest", 4)], hand: ["Perennation"], graveyard: ["Serra Angel"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    // Une carte du cimetière adverse n'est pas une cible légale.
    expect(() => cast(s, "p1", "Perennation", { t: [s.players.p2?.graveyard[0] as string] })).toThrow();
    s = settle(cast(s, "p1", "Perennation", { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters.hexproof).toBe(1);
    expect(s.objects[angel]?.counters.indestructible).toBe(1);
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
  });

  it("Smile at Death : à votre entretien, jusqu'à deux cartes de créature de force 2 ou moins reviennent, avec un marqueur +1/+1", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Smile at Death"], graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    let options: (string | undefined)[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = namesIn(cur, req.options);
      return undefined;
    });
    // Serra Angel (force 4) n'est pas une cible légale.
    expect(options.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });
});

/** Surveillance : toutes les cartes regardées vont au cimetière. */
const surveilAll = (req: ChoiceRequest): ChoiceValue[] | undefined =>
  req.type === "pick" && req.intent.startsWith("surveil") ? req.options : undefined;

describe("Tarkir: Dragonstorm, lot K8 : rares (1)", () => {
  it("Ambling Stormshell : en attaquant, trois marqueurs d'étourdissement et piochez trois cartes", () => {
    let s = scenario({ p1: { battlefield: ["Ambling Stormshell"] } });
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    s = settleNoBlocks(attack(s, [shell]));
    expect(handSize(s, "p1")).toBe(3);
    expect(s.objects[shell]?.counters.stun).toBe(3);
    // Étourdie : elle ne se dégage pas au tour suivant (un marqueur est retiré à la place).
    s = nextMain(s);
    expect(s.objects[shell]?.tapped).toBe(true);
    expect(s.objects[shell]?.counters.stun).toBe(2);
  });

  it("Ambling Stormshell : un sort de Tortue la dégage ; un autre sort, non", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ambling Stormshell", tapped: true }, ...lands("Island", 6)],
        hand: ["Opt", "Ambling Stormshell"],
      },
    });
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[shell]?.tapped).toBe(true);
    s = settle(cast(s, "p1", "Ambling Stormshell"));
    expect(s.objects[shell]?.tapped).toBe(false);
  });

  it("Avenger of the Fallen : contact mortel ; mobilisation X, X étant le nombre de cartes de créature de votre cimetière", () => {
    let s = scenario({ p1: { battlefield: ["Avenger of the Fallen"], graveyard: ["Bear Cub", "Serra Angel", "Forest"] } });
    const avenger = idOf(s, "p1", "battlefield", "Avenger of the Fallen");
    expect(chars(s, avenger).keywords).toContain("deathtouch");
    s = settleNoBlocks(attack(s, [avenger]));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) {
      expect(s.objects[w]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === w)).toBe(true);
    }
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(0);
    expect(lifeOf(s, "p2")).toBe(16);
  });

  it("Awaken the Honored Dead : I — détruisez un permanent non-terrain ; II — meulez trois cartes", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Island"], hand: ["Awaken the Honored Dead"] },
      p2: { battlefield: ["Serra Angel", "Forest"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let options: string[] = [];
    s = settle(cast(s, "p1", "Awaken the Honored Dead"), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = req.options;
      return picking([angel])(req);
    });
    // Le terrain adverse n'est pas une cible.
    expect(options).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    s = settle(nextMain(s));
    // Pioche du tour (1) puis trois cartes meulées.
    expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(3);
    expect(s.players.p1?.library).toHaveLength(6);
  });

  it("Awaken the Honored Dead : III — en défaussant une carte, une carte de créature ou de terrain de votre cimetière revient en main", () => {
    const run = (discard: boolean) => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Awaken the Honored Dead", counters: { lore: 2 } }],
          hand: ["Opt"],
          graveyard: ["Bear Cub", "Shock"],
        },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(nextMain(s), (req, _p, cur) => {
        if (req.type === "yesNo") return [discard ? 1 : 0];
        if (req.type !== "pick") return undefined;
        if (req.options.includes(opt)) return discard ? [opt] : [];
        // La carte d'éphémère (Shock) n'est pas proposée.
        expect(namesIn(cur, req.options)).not.toContain("Shock");
        return req.options.filter((id) => nameOf(cur, id) === "Bear Cub");
      });
      return s;
    };
    const yes = run(true);
    expect(idsOf(yes, "p1", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(yes, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(yes, "p1", "graveyard", "Awaken the Honored Dead")).toHaveLength(1);
    const no = run(false);
    expect(idsOf(no, "p1", "hand", "Bear Cub")).toHaveLength(0);
    expect(idsOf(no, "p1", "hand", "Opt")).toHaveLength(1);
  });

  it("Cori Mountain Monastery : arrive engagé sauf avec une Plaine ou une Île ; {T} : {R}", () => {
    expect(landEntersTapped("Cori Mountain Monastery", ["Forest"])).toBe(true);
    expect(landEntersTapped("Cori Mountain Monastery", ["Plains"])).toBe(false);
    expect(landEntersTapped("Cori Mountain Monastery", ["Island"])).toBe(false);
  });

  it("Cori Mountain Monastery : {3}{R}, {T} : exile la carte du dessus, jouable jusqu'à la fin de votre prochain tour", () => {
    let s = scenario({
      p1: { battlefield: ["Cori Mountain Monastery", ...lands("Mountain", 4)], library: ["Plains", ...lands("Forest", 6)] },
    });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Cori Mountain Monastery"), "Exilez"));
    const plains = exiled(s, "Plains")[0] as string;
    expect(plains).toBeDefined();
    const playable = (x: S) => legalActions(x, "p1").some((a) => a.type === "playLand" && a.card === plains);
    expect(playable(s)).toBe(true);
    s = nextMain(s);
    expect(playable(s)).toBe(true);
    s = nextMain(s);
    expect(playable(s)).toBe(false);
  });

  it("Cori-Steel Cutter : rafale — un Moine 1/1 avec la prouesse, auquel l'Équipement peut être attaché (+1/+1, piétinement, célérité)", () => {
    const run = (attach: boolean) => {
      let s = scenario({ p1: { battlefield: ["Cori-Steel Cutter", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const opts = idsOf(s, "p1", "hand", "Opt");
      s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
      expect(tokensOf(s, "p1", "Monk")).toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }), answering({ yes: attach }));
      return s;
    };
    const s = run(true);
    const monk = tokensOf(s, "p1", "Monk")[0] as string;
    expect(s.objects[idOf(s, "p1", "battlefield", "Cori-Steel Cutter")]?.attachedTo).toBe(monk);
    expect(pt(s, monk)).toEqual([2, 2]);
    expect(chars(s, monk).keywords).toEqual(expect.arrayContaining(["prowess", "trample", "haste"]));
    expect(chars(s, monk).colors).toEqual(["W"]);
    const t = run(false);
    const monk2 = tokensOf(t, "p1", "Monk")[0] as string;
    expect(t.objects[idOf(t, "p1", "battlefield", "Cori-Steel Cutter")]?.attachedTo).toBeUndefined();
    expect(pt(t, monk2)).toEqual([1, 1]);
  });

  it("Eshki Dragonclaw : au début du combat, après un sort de créature et un sort non-créature ce tour-ci : piochez, deux marqueurs +1/+1", () => {
    const run = (spells: string[]) => {
      let s = scenario({ p1: { battlefield: ["Eshki Dragonclaw", ...lands("Forest", 2), "Island"], hand: ["Bear Cub", "Opt"] } });
      for (const name of spells) s = settle(cast(s, "p1", name));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      return s;
    };
    const s = run(["Bear Cub", "Opt"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Eshki Dragonclaw")]?.counters["+1/+1"]).toBe(2);
    expect(handSize(s, "p1")).toBe(2);
    const t = run(["Bear Cub"]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Eshki Dragonclaw")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(handSize(t, "p1")).toBe(1);
    const k = chars(t, idOf(t, "p1", "battlefield", "Eshki Dragonclaw")).keywords;
    expect(k).toEqual(expect.arrayContaining(["vigilance", "trample"]));
  });

  it("Fangkeeper's Familiar : flash ; en arrivant, contrecarre un sort de créature", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Swamp", "Forest", "Island", "Island"], hand: ["Fangkeeper's Familiar"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = cast(s, "p2", "Bear Cub");
    s = act(s, "p2", { type: "pass" });
    s = settle(cast(s, "p1", "Fangkeeper's Familiar"), answering({ mode: 2 }));
    expect(idsOf(s, "p1", "battlefield", "Fangkeeper's Familiar")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Fangkeeper's Familiar : ou gagnez 3 PV et surveillance 3 ; ou détruisez un enchantement", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Swamp", "Forest", "Island", "Island"], hand: ["Fangkeeper's Familiar"] },
        p2: { battlefield: ["Goblin Oriflamme"] },
      });
    let s = settle(cast(setup(), "p1", "Fangkeeper's Familiar"), (req) => answering({ mode: 0 })(req) ?? surveilAll(req));
    expect(lifeOf(s, "p1")).toBe(23);
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(idsOf(s, "p2", "battlefield", "Goblin Oriflamme")).toHaveLength(1);
    s = settle(cast(setup(), "p1", "Fangkeeper's Familiar"), answering({ mode: 1 }));
    expect(idsOf(s, "p2", "graveyard", "Goblin Oriflamme")).toHaveLength(1);
    expect(lifeOf(s, "p1")).toBe(20);
  });

  it("Frostcliff Siege, Temur : vos créatures ont +1/+0, le piétinement et la célérité (pas celles de l'adversaire)", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Mountain", "Mountain", "Bear Cub"], hand: ["Frostcliff Siege"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Frostcliff Siege"), (req) => {
      if (req.intent !== "chooseOnEnter" || req.type !== "pick") return undefined;
      options = req.options;
      return ["Temur"];
    });
    expect(options).toEqual(["Jeskai", "Temur"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Frostcliff Siege, Jeskai : une ou plusieurs de vos créatures blessent un joueur : piochez une seule carte", () => {
    let s = scenario({ p1: { battlefield: ["Frostcliff Siege", "Bear Cub", "Llanowar Elves"] } });
    (s.objects[idOf(s, "p1", "battlefield", "Frostcliff Siege")] as { chosen?: { mode?: string } }).chosen = { mode: "Jeskai" };
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(17);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Great Arashin City : arrive engagée sauf avec une Forêt ou une Plaine ; {1}{B}, {T}, exilez une carte de créature : un Esprit 1/1", () => {
    expect(landEntersTapped("Great Arashin City", ["Island"])).toBe(true);
    expect(landEntersTapped("Great Arashin City", ["Forest"])).toBe(false);
    expect(landEntersTapped("Great Arashin City", ["Plains"])).toBe(false);
    const setup = (graveyard: string[]) => scenario({ p1: { battlefield: ["Great Arashin City", "Swamp", "Swamp"], graveyard } });
    const none = setup(["Forest", "Shock"]);
    expect(hasActivation(none, idOf(none, "p1", "battlefield", "Great Arashin City"), "Esprit")).toBe(false);
    let s = setup(["Bear Cub"]);
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Great Arashin City"), "Esprit"));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    const spirit = tokensOf(s, "p1", "Spirit")[0] as string;
    expect(pt(s, spirit)).toEqual([1, 1]);
    expect(chars(s, spirit).colors).toEqual(["W"]);
  });

  it("Herd Heirloom : son mana de n'importe quelle couleur ne sert qu'à lancer un sort de créature", () => {
    const s = scenario({ p1: { battlefield: ["Herd Heirloom", "Forest"], hand: ["Bear Cub", "Shock"] } });
    const castOk = (name: string) =>
      legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
    expect(castOk("Shock")).toBe(false);
    expect(castOk("Bear Cub")).toBe(true);
    const t = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Herd Heirloom : {T} : une de vos créatures de force 4 ou plus gagne le piétinement et « blesse un joueur : piochez »", () => {
    let s = scenario({ p1: { battlefield: ["Herd Heirloom", "Serra Angel", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    const heirloom = idOf(s, "p1", "battlefield", "Herd Heirloom");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(() =>
      activateNamed(s, heirloom, "Piétinement", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
    ).toThrow();
    expect(() =>
      activateNamed(s, heirloom, "Piétinement", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
    ).toThrow();
    s = settle(activateNamed(s, heirloom, "Piétinement", { targets: { t: [angel] } }));
    expect(chars(s, angel).keywords).toContain("trample");
    s = settleNoBlocks(attack(s, [angel]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(16);
    expect(handSize(s, "p1")).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, angel).keywords).not.toContain("trample");
  });

  it("Hollowmurk Siege, Sultai : un marqueur mis sur une de vos créatures : piochez une carte, une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Hollowmurk Siege", "Bear Cub", ...lands("Plains", 3)],
        hand: ["Fleeting Flight", "Fleeting Flight", "Fleeting Flight"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    (s.objects[idOf(s, "p1", "battlefield", "Hollowmurk Siege")] as { chosen?: { mode?: string } }).chosen = { mode: "Sultai" };
    const flights = idsOf(s, "p1", "hand", "Fleeting Flight");
    // Sur une créature adverse : rien.
    s = settle(
      act(s, "p1", { type: "cast", card: flights[0] as string, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
    );
    expect(handSize(s, "p1")).toBe(2);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: flights[1] as string, targets: { t: [bear] } }));
    expect(handSize(s, "p1")).toBe(2);
    s = settle(act(s, "p1", { type: "cast", card: flights[2] as string, targets: { t: [bear] } }));
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Hollowmurk Siege, Abzan : quand vous attaquez, un marqueur +1/+1 et la menace sur une créature attaquante", () => {
    let s = scenario({ p1: { battlefield: ["Hollowmurk Siege", "Bear Cub", "Llanowar Elves"] } });
    (s.objects[idOf(s, "p1", "battlefield", "Hollowmurk Siege")] as { chosen?: { mode?: string } }).chosen = { mode: "Abzan" };
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    let options: string[] = [];
    s = settleNoBlocks(attack(s, [bear]), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = req.options;
      return undefined;
    });
    // Une seule créature attaquante : elle est la cible (Llanowar Elves n'attaque pas).
    expect(options).toEqual([]);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bear).keywords).toContain("menace");
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("menace");
  });

  it("Kishla Village : arrive engagé sauf avec une Île ou un Marais ; {3}{G}, {T} : surveillance 2", () => {
    expect(landEntersTapped("Kishla Village", ["Plains"])).toBe(true);
    expect(landEntersTapped("Kishla Village", ["Island"])).toBe(false);
    expect(landEntersTapped("Kishla Village", ["Swamp"])).toBe(false);
    let s = scenario({ p1: { battlefield: ["Kishla Village", ...lands("Forest", 4)], library: ["Opt", "Shock", "Island"] } });
    let seen: (string | undefined)[] = [];
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Kishla Village"), "Surveillance"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent.startsWith("surveil")) seen = namesIn(cur, req.options);
      return surveilAll(req);
    });
    expect(seen).toEqual(["Opt", "Shock"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Shock"]);
  });
});

describe("Tarkir: Dragonstorm, lot K8 : rares (2)", () => {
  it("Lasyd Prowler : en arrivant, vous pouvez meuler autant de cartes que vous contrôlez de terrains", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Island"], hand: ["Lasyd Prowler"] } });
      s = settle(cast(s, "p1", "Lasyd Prowler"), answering({ yes }));
      return s;
    };
    expect(run(true).players.p1?.graveyard).toHaveLength(5);
    expect(run(false).players.p1?.graveyard).toHaveLength(0);
  });

  it("Lasyd Prowler : renouveau — X marqueurs +1/+1, X étant le nombre de cartes de terrain de votre cimetière", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], graveyard: ["Lasyd Prowler", "Forest", "Island", "Shock"] },
      p2: { graveyard: ["Plains", "Plains"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Lasyd Prowler"), "Renouveau", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(exiled(s, "Lasyd Prowler")).toHaveLength(1);
  });

  it("Lotuslight Dancers : lien de vie ; en arrivant, une carte noire, une verte et une bleue de la bibliothèque vont au cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Island", ...lands("Forest", 2)],
        hand: ["Lotuslight Dancers"],
        library: ["Shock", "Bake into a Pie", "Forest", "Bear Cub", "Opt", "Island"],
      },
    });
    s = settle(cast(s, "p1", "Lotuslight Dancers"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Lotuslight Dancers")).keywords).toContain("lifelink");
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bake into a Pie", "Bear Cub", "Opt"]);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Forest", "Island", "Shock"]);
  });

  it("Marang River Regent : vol ; en arrivant, renvoie jusqu'à deux autres permanents non-terrain dans la main de leur propriétaire", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Marang River Regent // Coil and Catch"] },
      p2: { battlefield: ["Serra Angel", "Goblin Oriflamme", "Forest"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const orif = idOf(s, "p2", "battlefield", "Goblin Oriflamme");
    let options: string[] = [];
    let max = 0;
    s = settle(cast(s, "p1", "Marang River Regent // Coil and Catch"), (req) => {
      if (req.type !== "pick" || req.intent !== "triggerTarget") return undefined;
      options = req.options;
      max = req.max;
      return [angel, orif];
    });
    const regent = idOf(s, "p1", "battlefield", "Marang River Regent // Coil and Catch");
    expect(chars(s, regent).keywords).toContain("flying");
    expect(max).toBe(2);
    expect(options).not.toContain(regent);
    expect(options).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Goblin Oriflamme", "Serra Angel"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Coil and Catch : piochez trois cartes, puis défaussez-en une ; la carte est mélangée dans la bibliothèque", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Marang River Regent // Coil and Catch"], library: lands("Plains", 5) },
    });
    const card = idOf(s, "p1", "hand", "Marang River Regent // Coil and Catch");
    s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
    expect(handSize(s, "p1")).toBe(2);
    expect(idsOf(s, "p1", "graveyard", "Plains")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toContain("Marang River Regent // Coil and Catch");
    expect(s.players.p1?.library).toHaveLength(3);
  });

  it("Mardu Siegebreaker : exile une autre de vos créatures tant qu'il reste ; en attaquant, un jeton copie engagé et attaquant, sacrifié à l'étape de fin", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Plains", "Swamp", "Swamp", "Bear Cub"], hand: ["Mardu Siegebreaker"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    let options: string[] = [];
    s = settle(cast(s, "p1", "Mardu Siegebreaker"), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = req.options;
      return picking([bear])(req);
    });
    // La créature adverse n'est pas une cible.
    expect(options).toEqual([bear]);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    const breaker = idOf(s, "p1", "battlefield", "Mardu Siegebreaker");
    expect(chars(s, breaker).keywords).toEqual(expect.arrayContaining(["deathtouch", "haste"]));
    s = settleNoBlocks(attack(s, [breaker]));
    const copies = tokensOf(s, "p1", "Bear Cub");
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.tapped).toBe(true);
    expect(s.combat?.attackers.find((a) => a.id === copies[0])?.defender).toBe("p2");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(lifeOf(s, "p2")).toBe(14);
    expect(tokensOf(s, "p1", "Bear Cub")).toHaveLength(0);
    // Quand il quitte le champ de bataille, la carte exilée revient.
    destroy(s, breaker);
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Naga Fleshcrafter : peut arriver comme une copie de n'importe quelle créature, même adverse", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Naga Fleshcrafter"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Naga Fleshcrafter"), picking([angel]));
    const mine = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
    expect(mine).toHaveLength(1);
    expect(chars(s, mine[0] as string).name).toBe("Serra Angel");
    expect(pt(s, mine[0] as string)).toEqual([4, 4]);
  });

  it("Naga Fleshcrafter : renouveau — marqueur +1/+1 sur une de vos créatures non légendaires ; vos autres créatures en deviennent des copies jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), "Bear Cub", "Llanowar Elves", "Eshki Dragonclaw"],
        graveyard: ["Naga Fleshcrafter"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const naga = idOf(s, "p1", "graveyard", "Naga Fleshcrafter");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const eshki = idOf(s, "p1", "battlefield", "Eshki Dragonclaw");
    expect(() => activateNamed(s, naga, "Renouveau", { targets: { t: [eshki] } })).toThrow();
    expect(() =>
      activateNamed(s, naga, "Renouveau", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
    ).toThrow();
    s = settle(activateNamed(s, naga, "Renouveau", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, elves).name).toBe("Bear Cub");
    expect(chars(s, eshki).name).toBe("Bear Cub");
    expect(pt(s, eshki)).toEqual([2, 2]);
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).name).toBe("Serra Angel");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, elves).name).toBe("Llanowar Elves");
    expect(chars(s, eshki).name).toBe("Eshki Dragonclaw");
  });

  it("Rediscover the Way : I — regardez trois cartes, une en main, les autres au-dessous de la bibliothèque", () => {
    let s = scenario({
      p1: {
        battlefield: ["Island", "Mountain", "Plains"],
        hand: ["Rediscover the Way"],
        library: ["Opt", "Shock", "Plains", ...lands("Island", 5)],
      },
    });
    let min = -1;
    s = settle(cast(s, "p1", "Rediscover the Way"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      min = req.min;
      return req.options.filter((id) => nameOf(cur, id) === "Shock");
    });
    expect(min).toBe(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Shock"]);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib).toHaveLength(7);
    expect(lib[0]).toBe("Island");
    expect(lib.slice(5).sort()).toEqual(["Opt", "Plains"]);
  });

  it("Rediscover the Way : III — ce tour-ci, chaque sort non-créature donne la double initiative à une de vos créatures", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Rediscover the Way", counters: { lore: 2 } }, "Bear Cub", "Mountain", "Forest"],
        hand: ["Shock", "Llanowar Elves"],
      },
    });
    s = settle(nextMain(s));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
    s = settle(cast(s, "p1", "Shock", { t: ["p2"] }), picking([bear]));
    expect(chars(s, bear).keywords).toContain("doubleStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
  });

  it("Revival of the Ancestors : I — trois Esprits 1/1 ; II — trois marqueurs +1/+1 répartis ; III — piétinement et lien de vie", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Swamp", "Forest", "Forest"], hand: ["Revival of the Ancestors"] } });
    s = settle(cast(s, "p1", "Revival of the Ancestors"));
    const spirits = tokensOf(s, "p1", "Spirit");
    expect(spirits).toHaveLength(3);
    expect(pt(s, spirits[0] as string)).toEqual([1, 1]);
    let t = scenario({
      p1: { battlefield: [{ name: "Revival of the Ancestors", counters: { lore: 1 } }, "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    const elves = idOf(t, "p1", "battlefield", "Llanowar Elves");
    let options: string[] = [];
    t = settle(nextMain(t), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") {
        options = req.options;
        return [bear, elves];
      }
      return undefined;
    });
    expect(options).not.toContain(idOf(t, "p2", "battlefield", "Serra Angel"));
    const b = t.objects[bear]?.counters["+1/+1"] ?? 0;
    const e = t.objects[elves]?.counters["+1/+1"] ?? 0;
    expect(b + e).toBe(3);
    expect(Math.min(b, e)).toBeGreaterThanOrEqual(1);
    t = settle(nextMain(t));
    expect(chars(t, bear).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
    expect(idsOf(t, "p1", "graveyard", "Revival of the Ancestors")).toHaveLength(1);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, bear).keywords).not.toContain("lifelink");
  });

  it("Stillness in Motion : à votre entretien, meulez trois cartes", () => {
    let s = scenario({ p1: { battlefield: ["Stillness in Motion"] } });
    s = advanceUntil(nextUpkeep(s), (x) => x.turn.step === "draw");
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(idsOf(s, "p1", "battlefield", "Stillness in Motion")).toHaveLength(1);
  });

  it("Stillness in Motion : bibliothèque vide après le meulage : exilez-le et remettez cinq cartes du cimetière sur la bibliothèque", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Stillness in Motion"], library: lands("Forest", 3), graveyard: lands("Plains", 3) },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    s = settle(s);
    expect(exiled(s, "Stillness in Motion")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(5);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });

  it("Stillness in Motion : moins de cinq cartes au cimetière : elles reviennent toutes sur la bibliothèque", () => {
    let s = scenario({ active: "p2", p1: { battlefield: ["Stillness in Motion"], library: ["Forest", "Island"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    s = settle(s);
    expect(exiled(s, "Stillness in Motion")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Forest", "Island"]);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Temur Battlecrier : pendant votre tour, vos sorts coûtent {1} de moins par créature de force 4 ou plus que vous contrôlez", () => {
    const castOk = (s: S, player: PlayerId, name: string) =>
      legalActions(s, player).some((a) => a.type === "cast" && a.card === idOf(s, player, "hand", name));
    // Battlecrier (4/3) et Serra Angel : Shivan Dragon {4}{R}{R} coûte {2}{R}{R} ; Bear Cub (2/2) ne compte pas.
    let s = scenario({
      p1: { battlefield: ["Temur Battlecrier", "Serra Angel", "Bear Cub", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] },
    });
    expect(castOk(s, "p1", "Shivan Dragon")).toBe(true);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    const few = scenario({
      p1: { battlefield: ["Temur Battlecrier", "Bear Cub", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] },
    });
    expect(castOk(few, "p1", "Shivan Dragon")).toBe(false);
    // Pendant le tour adverse : pas de réduction.
    let opp = scenario({
      active: "p2",
      p1: { battlefield: ["Temur Battlecrier", "Mountain"], hand: ["Lightning Strike"] },
    });
    opp = passUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castOk(opp, "p1", "Lightning Strike")).toBe(false);
    const mine = scenario({ p1: { battlefield: ["Temur Battlecrier", "Mountain"], hand: ["Lightning Strike"] } });
    expect(castOk(mine, "p1", "Lightning Strike")).toBe(true);
  });

  it("Thunder of Unity : I — piochez deux cartes, perdez 2 PV ; II — ce tour-ci, vos créatures qui arrivent drainent 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Plains", "Swamp"], hand: ["Thunder of Unity"] } });
    s = settle(cast(s, "p1", "Thunder of Unity"));
    expect(handSize(s, "p1")).toBe(2);
    expect(lifeOf(s, "p1")).toBe(18);
    let t = scenario({
      p1: {
        battlefield: [{ name: "Thunder of Unity", counters: { lore: 1 } }, ...lands("Forest", 4)],
        hand: ["Bear Cub", "Llanowar Elves"],
      },
    });
    t = settle(nextMain(t));
    t = settle(cast(t, "p1", "Bear Cub"));
    expect([lifeOf(t, "p1"), lifeOf(t, "p2")]).toEqual([21, 19]);
    t = settle(cast(t, "p1", "Llanowar Elves"));
    expect([lifeOf(t, "p1"), lifeOf(t, "p2")]).toEqual([22, 18]);
  });

  it("Yathan Roadwatcher : lancée, meulez quatre cartes, puis une carte de créature de VM 3 ou moins revient sur le champ de bataille", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Swamp", "Forest", "Forest"],
        hand: ["Yathan Roadwatcher"],
        library: ["Serra Angel", "Bear Cub", "Forest", "Forest", "Island"],
      },
    });
    // Serra Angel (VM 5) n'est pas une cible légale : Bear Cub est la seule.
    s = settle(cast(s, "p1", "Yathan Roadwatcher"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(1);
  });

  it("Yathan Roadwatcher : mise sur le champ de bataille sans être lancée, rien n'est meulé", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", ...lands("Forest", 4)], hand: ["Perennation"], graveyard: ["Yathan Roadwatcher"] },
    });
    s = settle(cast(s, "p1", "Perennation", { t: [idOf(s, "p1", "graveyard", "Yathan Roadwatcher")] }));
    expect(idsOf(s, "p1", "battlefield", "Yathan Roadwatcher")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(10);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });
});

describe("Tarkir: Dragonstorm, lot K8 : peu communes à plusieurs capacités (1)", () => {
  it("Aegis Sculptor : à votre entretien, vous pouvez exiler deux cartes de votre cimetière ; si vous le faites, un marqueur +1/+1", () => {
    const run = (graveyard: string[], yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Aegis Sculptor"], graveyard } });
      s = settle(nextUpkeep(s), answering({ yes }));
      return s;
    };
    const s = run(lands("Plains", 3), true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Aegis Sculptor")]?.counters["+1/+1"]).toBe(1);
    expect(exiled(s, "Plains")).toHaveLength(2);
    const no = run(lands("Plains", 3), false);
    expect(no.objects[idOf(no, "p1", "battlefield", "Aegis Sculptor")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(no.players.p1?.graveyard).toHaveLength(3);
    // Une seule carte : impossible d'en exiler deux.
    const one = run(["Plains"], true);
    expect(one.objects[idOf(one, "p1", "battlefield", "Aegis Sculptor")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(one.players.p1?.graveyard).toHaveLength(1);
  });

  it("Aegis Sculptor : vol ; garde {2} (un sort adverse qui la cible est contrecarré faute de paiement)", () => {
    let s = scenario({ p1: { battlefield: ["Aegis Sculptor"] }, p2: { battlefield: ["Mountain"], hand: ["Shock"] } });
    const sculptor = idOf(s, "p1", "battlefield", "Aegis Sculptor");
    expect(chars(s, sculptor).keywords).toContain("flying");
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { t: [sculptor] }));
    expect(s.objects[sculptor]?.damage).toBe(0);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
  });

  it("Alchemist's Assistant : lien de vie ; renouveau — un marqueur de lien de vie sur une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp", "Bear Cub", "Alchemist's Assistant"], graveyard: ["Alchemist's Assistant"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Alchemist's Assistant")).keywords).toContain("lifelink");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renouveau", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters.lifelink).toBe(1);
    expect(chars(s, bear).keywords).toContain("lifelink");
    expect(exiled(s, "Alchemist's Assistant")).toHaveLength(1);
  });

  it("Bone-Cairn Butcher : mobilisation 2 ; vos jetons attaquants ont le contact mortel (pas le Démon)", () => {
    let s = scenario({ p1: { battlefield: ["Bone-Cairn Butcher"] } });
    const butcher = idOf(s, "p1", "battlefield", "Bone-Cairn Butcher");
    s = settleNoBlocks(attack(s, [butcher]));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) expect(chars(s, w).keywords).toContain("deathtouch");
    expect(chars(s, butcher).keywords).not.toContain("deathtouch");
  });

  it("Constrictor Sage : en arrivant, engage une créature adverse et y met un marqueur d'étourdissement", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Constrictor Sage"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Constrictor Sage"));
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
  });

  it("Constrictor Sage : renouveau — engagez une créature adverse, marqueur d'étourdissement (pas une des vôtres)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], graveyard: ["Constrictor Sage"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const sage = idOf(s, "p1", "graveyard", "Constrictor Sage");
    expect(() => activateNamed(s, sage, "Renouveau", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } })).toThrow();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activateNamed(s, sage, "Renouveau", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(1);
  });

  it("Corroding Dragonstorm : chaque adversaire perd 2 PV, vous en gagnez 2, surveillance 2 ; un Dragon le renvoie en main", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Corroding Dragonstorm"], library: ["Opt", "Shock", "Forest"] },
    });
    s = settle(cast(s, "p1", "Corroding Dragonstorm"), surveilAll);
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Shock"]);
    let t = scenario({ p1: { battlefield: ["Corroding Dragonstorm", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
    t = settle(cast(t, "p1", "Shivan Dragon"));
    expect(idsOf(t, "p1", "hand", "Corroding Dragonstorm")).toHaveLength(1);
  });

  it("Encroaching Dragonstorm : jusqu'à deux cartes de terrain de base, mises engagées ; un Dragon le renvoie en main", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Encroaching Dragonstorm"], library: ["Island", "Shock", "Mountain", "Opt"] },
    });
    s = settle(cast(s, "p1", "Encroaching Dragonstorm"));
    const fetched = ["Island", "Mountain"].map((n) => idOf(s, "p1", "battlefield", n));
    for (const id of fetched) expect(s.objects[id]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Opt", "Shock"]);
    let t = scenario({ p1: { battlefield: ["Encroaching Dragonstorm", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
    t = settle(cast(t, "p1", "Shivan Dragon"));
    expect(idsOf(t, "p1", "hand", "Encroaching Dragonstorm")).toHaveLength(1);
  });

  it("Roiling Dragonstorm : piochez deux cartes, puis défaussez-en une ; un Dragon adverse ne le renvoie pas", () => {
    let s = scenario({ p1: { battlefield: ["Island", "Island"], hand: ["Roiling Dragonstorm"] } });
    s = settle(cast(s, "p1", "Roiling Dragonstorm"));
    expect(handSize(s, "p1")).toBe(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Roiling Dragonstorm"] },
      p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
    });
    t = settle(cast(t, "p2", "Shivan Dragon"));
    expect(idsOf(t, "p1", "battlefield", "Roiling Dragonstorm")).toHaveLength(1);
  });

  it("Dragonbroods' Relic : {T}, engagez une de vos créatures dégagées : un mana de n'importe quelle couleur", () => {
    const castOk = (s: S) => legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
    expect(castOk(scenario({ p1: { battlefield: ["Dragonbroods' Relic"], hand: ["Shock"] } }))).toBe(false);
    expect(
      castOk(scenario({ p1: { battlefield: ["Dragonbroods' Relic", { name: "Bear Cub", tapped: true }], hand: ["Shock"] } })),
    ).toBe(false);
    let s = scenario({ p1: { battlefield: ["Dragonbroods' Relic", "Bear Cub"], hand: ["Shock"] } });
    expect(castOk(s)).toBe(true);
    s = settle(cast(s, "p1", "Shock", { t: ["p2"] }));
    expect(lifeOf(s, "p2")).toBe(18);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
  });

  it("Dragonbroods' Relic : {3}{W}{U}{B}{R}{G}, sacrifice (rituel) : Reliquary Dragon 4/4 de toutes les couleurs, 3 blessures en arrivant", () => {
    let s = scenario({
      p1: { battlefield: ["Dragonbroods' Relic", "Plains", "Island", "Swamp", "Mountain", "Forest", ...lands("Forest", 3)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Dragonbroods' Relic"), "Reliquary"), picking([angel]));
    expect(idsOf(s, "p1", "graveyard", "Dragonbroods' Relic")).toHaveLength(1);
    const dragon = tokensOf(s, "p1", "Reliquary Dragon")[0] as string;
    expect(pt(s, dragon)).toEqual([4, 4]);
    expect(chars(s, dragon).colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(chars(s, dragon).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
    expect(s.objects[angel]?.damage).toBe(3);
  });

  it("Equilibrium Adept : en arrivant, exile la carte du dessus, jouable jusqu'à la fin de votre prochain tour ; rafale : double initiative", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Equilibrium Adept"], library: ["Plains", ...lands("Forest", 5)] },
    });
    s = settle(cast(s, "p1", "Equilibrium Adept"));
    const plains = exiled(s, "Plains")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === plains)).toBe(true);
    let t = scenario({ p1: { battlefield: ["Equilibrium Adept", "Island", "Island"], hand: ["Opt", "Opt"] } });
    const adept = idOf(t, "p1", "battlefield", "Equilibrium Adept");
    const opts = idsOf(t, "p1", "hand", "Opt");
    t = settle(act(t, "p1", { type: "cast", card: opts[0] as string }));
    expect(chars(t, adept).keywords).not.toContain("doubleStrike");
    t = settle(act(t, "p1", { type: "cast", card: opts[1] as string }));
    expect(chars(t, adept).keywords).toContain("doubleStrike");
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, adept).keywords).not.toContain("doubleStrike");
  });

  it("Essence Anchor : à votre entretien, surveillance 1", () => {
    let s = scenario({ p1: { battlefield: ["Essence Anchor"], library: ["Opt", ...lands("Forest", 5)] } });
    s = settle(nextUpkeep(s), surveilAll);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Essence Anchor : {T} : un Zombie Druide 2/2 noir, seulement pendant votre tour et si une carte a quitté votre cimetière ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Essence Anchor", "Swamp", "Swamp", "Bear Cub"], graveyard: ["Alchemist's Assistant"] },
    });
    const anchor = idOf(s, "p1", "battlefield", "Essence Anchor");
    expect(hasActivation(s, anchor, "Zombie")).toBe(false);
    s = settle(
      activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renouveau", {
        targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
      }),
    );
    expect(hasActivation(s, anchor, "Zombie")).toBe(true);
    s = settle(activateNamed(s, anchor, "Zombie"));
    const zombie = tokensOf(s, "p1", "Zombie Druid")[0] as string;
    expect(pt(s, zombie)).toEqual([2, 2]);
    expect(chars(s, zombie).colors).toEqual(["B"]);
    // Au tour suivant, sans carte sortie du cimetière : plus d'activation.
    s = nextMain(s);
    expect(hasActivation(s, anchor, "Zombie")).toBe(false);
  });

  it("Fleeting Effigy : célérité ; {2}{R} : +2/+0 ; au début de votre étape de fin, elle revient dans la main de son propriétaire", () => {
    let s = scenario({ p1: { battlefield: ["Fleeting Effigy", ...lands("Mountain", 3)] } });
    const effigy = idOf(s, "p1", "battlefield", "Fleeting Effigy");
    expect(chars(s, effigy).keywords).toContain("haste");
    s = settle(activateNamed(s, effigy, "+2/+0"));
    expect(pt(s, effigy)).toEqual([4, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "hand", "Fleeting Effigy")).toHaveLength(1);
  });

  it("Fresh Start : flash ; la créature enchantée gagne -5/-0 et perd toutes ses capacités", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Island", "Island"], hand: ["Fresh Start"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Fresh Start", { enchant: [angel] }));
    expect(chars(s, angel).power).toBe(-1);
    expect(chars(s, angel).toughness).toBe(4);
    expect(chars(s, angel).keywords).not.toContain("flying");
    expect(chars(s, angel).keywords).not.toContain("vigilance");
  });

  it("Glacial Dragonhunt : piochez, puis vous pouvez défausser ; une carte non-terrain défaussée : 3 blessures à une créature", () => {
    const run = (discard: string | null) => {
      let s = scenario({
        p1: { battlefield: ["Island", "Mountain"], hand: ["Glacial Dragonhunt", "Opt", "Plains"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Glacial Dragonhunt"), (req, _p, cur) => {
        if (req.type === "yesNo") return [discard ? 1 : 0];
        if (req.type === "pick" && req.intent !== "triggerTarget" && req.options.some((id) => nameOf(cur, id) === "Opt"))
          return discard ? req.options.filter((id) => nameOf(cur, id) === discard).slice(0, 1) : [];
        return undefined;
      });
      return s;
    };
    const s = run("Opt");
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    expect(handSize(s, "p1")).toBe(2);
    const land = run("Plains");
    expect(land.objects[idOf(land, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(idsOf(land, "p1", "graveyard", "Plains")).toHaveLength(1);
    const none = run(null);
    expect(none.objects[idOf(none, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(handSize(none, "p1")).toBe(3);
  });

  it("Kheru Goldkeeper : vol ; des cartes quittent votre cimetière pendant votre tour : un Trésor", () => {
    let s = scenario({
      p1: { battlefield: ["Kheru Goldkeeper", "Swamp", "Swamp", "Bear Cub"], graveyard: ["Alchemist's Assistant"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Kheru Goldkeeper")).keywords).toContain("flying");
    s = settle(
      activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renouveau", {
        targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
      }),
    );
    expect(tokensOf(s, "p1", "Treasure")).toHaveLength(1);
  });

  it("Kheru Goldkeeper : renouveau — deux marqueurs +1/+1 et un marqueur de vol sur une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Island", ...lands("Swamp", 2), "Bear Cub"], graveyard: ["Kheru Goldkeeper"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Kheru Goldkeeper"), "Renouveau", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters.flying).toBe(1);
    expect(chars(s, bear).keywords).toContain("flying");
  });

  it("Mammoth Bellow : un Éléphant 5/5 vert ; harmonie depuis le cimetière, puis exilé", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Island", "Mountain", "Forest", "Forest"], hand: ["Mammoth Bellow"] } });
    s = settle(cast(s, "p1", "Mammoth Bellow"));
    const elephant = tokensOf(s, "p1", "Elephant")[0] as string;
    expect(pt(s, elephant)).toEqual([5, 5]);
    expect(chars(s, elephant).colors).toEqual(["G"]);
    let t = scenario({
      p1: { battlefield: ["Forest", "Island", "Mountain", "Plains", "Serra Angel"], graveyard: ["Mammoth Bellow"] },
    });
    const card = idOf(t, "p1", "graveyard", "Mammoth Bellow");
    const angel = idOf(t, "p1", "battlefield", "Serra Angel");
    // {5}{G}{U}{R} moins 4 (Serra Angel engagée) : quatre terrains suffisent.
    t = settle(act(t, "p1", { type: "cast", card, tap: [angel] }));
    expect(tokensOf(t, "p1", "Elephant")).toHaveLength(1);
    expect(exiled(t, "Mammoth Bellow")).toHaveLength(1);
  });
});

describe("Tarkir: Dragonstorm, lot K8 : peu communes à plusieurs capacités (2)", () => {
  /** Lance le Monument : renvoie l'état et les noms des cartes proposées par la recherche. */
  const monumentSearch = (name: string, library: string[]) => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: [name], library } });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", name), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
      return undefined;
    });
    return { s, offered };
  };

  it("Jeskai Monument : cherche une Île, une Montagne ou une Plaine de base ; {1}{U}{R}{W}, {T}, sacrifice (rituel) : deux Oiseaux 1/1 volants", () => {
    const { s: found, offered } = monumentSearch("Jeskai Monument", ["Forest", "Swamp", "Mountain", "Opt"]);
    expect(offered).toEqual(["Mountain"]);
    expect(idsOf(found, "p1", "hand", "Mountain")).toHaveLength(1);
    let s = scenario({
      p1: { battlefield: ["Jeskai Monument", "Island", "Mountain", "Plains", "Plains", "Island"], hand: ["Opt"] },
    });
    const monument = idOf(s, "p1", "battlefield", "Jeskai Monument");
    // Seulement en rituel.
    const busy = cast(s, "p1", "Opt");
    expect(hasActivation(busy, monument, "Oiseaux")).toBe(false);
    s = settle(activateNamed(s, monument, "Oiseaux"));
    const birds = tokensOf(s, "p1", "Bird");
    expect(birds).toHaveLength(2);
    expect(pt(s, birds[0] as string)).toEqual([1, 1]);
    expect(chars(s, birds[0] as string).keywords).toContain("flying");
    expect(chars(s, birds[0] as string).colors).toEqual(["W"]);
    expect(idsOf(s, "p1", "graveyard", "Jeskai Monument")).toHaveLength(1);
  });

  it("Mardu Monument : cherche une Montagne, une Plaine ou un Marais ; trois Guerriers 1/1 avec la menace et la célérité ce tour-ci", () => {
    const { offered } = monumentSearch("Mardu Monument", ["Forest", "Island", "Swamp"]);
    expect(offered).toEqual(["Swamp"]);
    let s = scenario({ p1: { battlefield: ["Mardu Monument", "Mountain", "Plains", "Swamp", "Swamp", "Swamp"] } });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Mardu Monument"), "Guerriers"));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(3);
    for (const w of warriors) {
      expect(chars(s, w).colors).toEqual(["R"]);
      expect(chars(s, w).keywords).toEqual(expect.arrayContaining(["menace", "haste"]));
    }
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, warriors[0] as string).keywords).not.toContain("menace");
  });

  it("Sultai Monument : cherche un Marais, une Forêt ou une Île ; deux Zombies Druides 2/2 noirs", () => {
    const { offered } = monumentSearch("Sultai Monument", ["Plains", "Mountain", "Island"]);
    expect(offered).toEqual(["Island"]);
    let s = scenario({ p1: { battlefield: ["Sultai Monument", "Swamp", "Forest", "Island", "Swamp", "Swamp"] } });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Sultai Monument"), "Zombies"));
    const zombies = tokensOf(s, "p1", "Zombie Druid");
    expect(zombies).toHaveLength(2);
    expect(pt(s, zombies[0] as string)).toEqual([2, 2]);
    expect(chars(s, zombies[0] as string).colors).toEqual(["B"]);
  });

  it("Temur Monument : cherche une Forêt, une Île ou une Montagne ; un Éléphant 5/5 vert", () => {
    const { offered } = monumentSearch("Temur Monument", ["Plains", "Swamp", "Forest"]);
    expect(offered).toEqual(["Forest"]);
    let s = scenario({ p1: { battlefield: ["Temur Monument", "Forest", "Island", "Mountain", ...lands("Forest", 3)] } });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Temur Monument"), "Éléphant"));
    const elephant = tokensOf(s, "p1", "Elephant")[0] as string;
    expect(pt(s, elephant)).toEqual([5, 5]);
    expect(chars(s, elephant).colors).toEqual(["G"]);
  });

  it("Purging Stormbrood : vol ; en arrivant, retire tous les marqueurs de jusqu'à une créature", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Purging Stormbrood // Absorb Essence"] },
      p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 2, flying: 1 } }] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Purging Stormbrood // Absorb Essence"), picking([bear]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Purging Stormbrood // Absorb Essence")).keywords).toContain("flying");
    expect(Object.values(s.objects[bear]?.counters ?? {}).filter((n) => n > 0)).toHaveLength(0);
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Purging Stormbrood : garde — payer 2 PV, sinon le sort adverse qui le cible est contrecarré", () => {
    const run = (pay: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Purging Stormbrood // Absorb Essence"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const brood = idOf(s, "p1", "battlefield", "Purging Stormbrood // Absorb Essence");
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Shock", { t: [brood] }), (req) => (req.intent === "unlessPay" ? [pay ? 1 : 0] : undefined));
      return { s, brood };
    };
    const paid = run(true);
    expect(lifeOf(paid.s, "p2")).toBe(18);
    expect(paid.s.objects[paid.brood]?.damage).toBe(2);
    const refused = run(false);
    expect(lifeOf(refused.s, "p2")).toBe(20);
    expect(refused.s.objects[refused.brood]?.damage).toBe(0);
  });

  it("Absorb Essence : +2/+2, lien de vie et défense talismanique jusqu'à la fin du tour ; la carte retourne dans la bibliothèque", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Bear Cub"], hand: ["Purging Stormbrood // Absorb Essence"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Purging Stormbrood // Absorb Essence"),
        face: 1,
        targets: { t: [bear] },
      }),
    );
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["lifelink", "hexproof"]));
    expect(namesIn(s, s.players.p1?.library)).toContain("Purging Stormbrood // Absorb Essence");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Rainveil Rejuvenator : en arrivant, vous pouvez meuler trois cartes ; {T} : autant de {G} que sa force", () => {
    const run = (yes: boolean) =>
      settle(
        cast(scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Rainveil Rejuvenator"] } }), "p1", "Rainveil Rejuvenator"),
        answering({ yes }),
      );
    expect(run(true).players.p1?.graveyard).toHaveLength(3);
    expect(run(false).players.p1?.graveyard).toHaveLength(0);
    // Force 2 : de quoi lancer Bear Cub ({1}{G}).
    let s = scenario({ p1: { battlefield: ["Rainveil Rejuvenator"], hand: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Rainveil Rejuvenator")]?.tapped).toBe(true);
    const big = scenario({
      p1: { battlefield: [{ name: "Rainveil Rejuvenator", counters: { "+1/+1": 3 } }], hand: ["Gnarlid Colony"] },
    });
    // Force 5 : {1}{G} plus le kicker {2}{G}.
    const k = settle(cast(big, "p1", "Gnarlid Colony", undefined, { kicked: true }));
    expect(idsOf(k, "p1", "battlefield", "Gnarlid Colony")).toHaveLength(1);
  });

  it("Rally the Monastery : coûte {2} de moins si vous avez lancé un autre sort ce tour-ci", () => {
    const castOk = (s: S) => legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Rally the Monastery");
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Island"], hand: ["Opt", "Rally the Monastery"] } });
    expect(castOk(s)).toBe(false);
    s = settle(cast(s, "p1", "Opt"));
    expect(castOk(s)).toBe(true);
    s = settle(cast(s, "p1", "Rally the Monastery", undefined, { mode: 0 }));
    const monks = tokensOf(s, "p1", "Monk");
    expect(monks).toHaveLength(2);
    expect(chars(s, monks[0] as string).keywords).toContain("prowess");
  });

  it("Rally the Monastery : jusqu'à deux de vos créatures +2/+2, ou détruisez une créature de force 4 ou plus", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub", "Llanowar Elves"], hand: ["Rally the Monastery"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
    let s = setup();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(() => cast(s, "p1", "Rally the Monastery", { p: [idOf(s, "p2", "battlefield", "Bear Cub")] }, { mode: 1 })).toThrow();
    s = settle(cast(s, "p1", "Rally the Monastery", { p: [bear, elves] }, { mode: 1 }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, elves)).toEqual([3, 3]);
    let t = setup();
    expect(() => cast(t, "p1", "Rally the Monastery", { d: [idOf(t, "p2", "battlefield", "Bear Cub")] }, { mode: 2 })).toThrow();
    t = settle(cast(t, "p1", "Rally the Monastery", { d: [idOf(t, "p2", "battlefield", "Serra Angel")] }, { mode: 2 }));
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Runescale Stormbrood : un sort non-créature ou de Dragon que vous lancez lui donne +2/+0 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Runescale Stormbrood // Chilling Screech", "Island", ...lands("Mountain", 6), ...lands("Forest", 2)],
        hand: ["Opt", "Bear Cub", "Shivan Dragon"],
      },
    });
    const brood = idOf(s, "p1", "battlefield", "Runescale Stormbrood // Chilling Screech");
    expect(chars(s, brood).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, brood)).toEqual([4, 4]);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(pt(s, brood)).toEqual([4, 4]);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(pt(s, brood)).toEqual([6, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, brood)).toEqual([2, 4]);
  });

  it("Chilling Screech : contrecarre un sort de valeur de mana 2 ou moins", () => {
    const setup = (spell: string, landsP2: string[]) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Island", "Island"], hand: ["Runescale Stormbrood // Chilling Screech"] },
        p2: { battlefield: landsP2, hand: [spell] },
      });
      s = cast(s, "p2", spell, spell === "Lightning Strike" ? { t: ["p1"] } : undefined);
      s = act(s, "p2", { type: "pass" });
      return s;
    };
    let s = setup("Lightning Strike", lands("Mountain", 2));
    const card = idOf(s, "p1", "hand", "Runescale Stormbrood // Chilling Screech");
    s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [s.stack[0]?.id as string] } }));
    expect(lifeOf(s, "p1")).toBe(20);
    expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    const big = setup("Shivan Dragon", lands("Mountain", 6));
    const card2 = idOf(big, "p1", "hand", "Runescale Stormbrood // Chilling Screech");
    expect(() => act(big, "p1", { type: "cast", card: card2, face: 1, targets: { t: [big.stack[0]?.id as string] } })).toThrow();
  });

  it("Disruptive Stormbrood : vol ; en arrivant, détruit jusqu'à un artefact ou un enchantement", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Disruptive Stormbrood // Petty Revenge"] },
      p2: { battlefield: ["Goblin Oriflamme", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Disruptive Stormbrood // Petty Revenge"));
    expect(idsOf(s, "p2", "graveyard", "Goblin Oriflamme")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Disruptive Stormbrood // Petty Revenge")).keywords).toContain("flying");
  });

  it("Petty Revenge : détruit une créature de force 3 ou moins ; la carte retourne dans la bibliothèque", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Disruptive Stormbrood // Petty Revenge"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Disruptive Stormbrood // Petty Revenge");
    expect(() =>
      act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
    ).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toContain("Disruptive Stormbrood // Petty Revenge");
  });

  it("Starry-Eyed Skyrider : en attaquant, une autre de vos créatures gagne le vol ; vos jetons attaquants ont le vol", () => {
    let s = scenario({ p1: { battlefield: ["Starry-Eyed Skyrider", "Dalkovan Packbeasts", "Bear Cub"] } });
    const sky = idOf(s, "p1", "battlefield", "Starry-Eyed Skyrider");
    const beasts = idOf(s, "p1", "battlefield", "Dalkovan Packbeasts");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, sky).keywords).toContain("flying");
    let options: string[] = [];
    s = settleNoBlocks(attack(s, [sky, beasts]), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget" && req.options.includes(bear)) {
        options = req.options;
        return [bear];
      }
      return undefined;
    });
    expect(options).not.toContain(sky);
    expect(chars(s, bear).keywords).toContain("flying");
    expect(chars(s, beasts).keywords).not.toContain("flying");
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(3);
    for (const w of warriors) expect(chars(s, w).keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("flying");
  });

  it("Static Snare : flash, {1} de moins par créature attaquante ; exile un artefact ou une créature adverse tant qu'il reste", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Plains", 3), hand: ["Static Snare"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const castOk = (x: S) => legalActions(x, "p1").some((a) => a.type === "cast" && nameOf(x, a.card) === "Static Snare");
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castOk(s)).toBe(false);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p2", {
      type: "declareAttackers",
      attackers: [
        { id: angel, defender: "p1" },
        { id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" },
      ],
    });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castOk(s)).toBe(true);
    s = settle(cast(s, "p1", "Static Snare"), picking([angel]));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    const snare = idOf(s, "p1", "battlefield", "Static Snare");
    destroy(s, snare);
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Stormbeacon Blade : +3/+0 ; quand la créature équipée attaque, piochez si vous contrôlez trois attaquants ou plus", () => {
    const run = (attackers: string[]) => {
      let s = scenario({
        p1: { battlefield: ["Stormbeacon Blade", "Bear Cub", "Llanowar Elves", "Serra Angel", "Plains", "Plains"] },
      });
      const blade = idOf(s, "p1", "battlefield", "Stormbeacon Blade");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activateNamed(s, blade, "Équiper", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 2]);
      s = settleNoBlocks(
        attack(
          s,
          attackers.map((n) => idOf(s, "p1", "battlefield", n)),
        ),
      );
      return handSize(s, "p1");
    };
    expect(run(["Bear Cub", "Llanowar Elves", "Serra Angel"])).toBe(1);
    expect(run(["Bear Cub", "Llanowar Elves"])).toBe(0);
    // La créature équipée n'attaque pas : rien.
    expect(run(["Llanowar Elves", "Serra Angel"])).toBe(0);
  });

  it("Sunset Strikemaster : {T} : {R} ; {2}{R}, {T}, sacrifice : 6 blessures à une créature avec le vol", () => {
    let s = scenario({
      p1: { battlefield: ["Sunset Strikemaster", ...lands("Mountain", 3)] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const sm = idOf(s, "p1", "battlefield", "Sunset Strikemaster");
    expect(() => activateNamed(s, sm, "6 blessures", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
    s = settle(activateNamed(s, sm, "6 blessures", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Sunset Strikemaster")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Sunset Strikemaster"], hand: ["Shock"] } });
    t = settle(cast(t, "p1", "Shock", { t: ["p2"] }));
    expect(lifeOf(t, "p2")).toBe(18);
  });

  it("Synchronized Charge : deux marqueurs +1/+1 répartis entre une ou deux de vos créatures ; vos créatures à marqueurs gagnent vigilance et piétinement", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest", "Forest", "Bear Cub", "Llanowar Elves", { name: "Ambling Stormshell", counters: { "+1/+1": 1 } }],
        hand: ["Synchronized Charge"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    expect(() => cast(s, "p1", "Synchronized Charge", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] })).toThrow();
    s = settle(cast(s, "p1", "Synchronized Charge", { t: [bear] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    expect(chars(s, shell).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    expect(chars(s, elves).keywords).not.toContain("trample");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Unrooted Ancestor : flash ; {1}, sacrifiez une autre créature : indestructible jusqu'à la fin du tour, et elle s'engage", () => {
    const alone = scenario({ p1: { battlefield: ["Unrooted Ancestor", "Swamp"] } });
    expect(hasActivation(alone, idOf(alone, "p1", "battlefield", "Unrooted Ancestor"), "Sacrifiez")).toBe(false);
    let s = scenario({ p1: { battlefield: ["Unrooted Ancestor", "Swamp", "Bear Cub"] } });
    const ancestor = idOf(s, "p1", "battlefield", "Unrooted Ancestor");
    s = settle(activateNamed(s, ancestor, "Sacrifiez", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[ancestor]?.tapped).toBe(true);
    expect(chars(s, ancestor).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, ancestor).keywords).not.toContain("indestructible");
  });
});

describe("Tarkir: Dragonstorm, lot K8 : peu communes à plusieurs capacités (3)", () => {
  it("Ureni's Rebuff : renvoie une créature dans la main de son propriétaire ; harmonie {5}{U} depuis le cimetière", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island"], hand: ["Ureni's Rebuff"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Ureni's Rebuff", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Ureni's Rebuff")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: [...lands("Island", 4), "Bear Cub"], graveyard: ["Ureni's Rebuff"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    // {5}{U} moins 2 (Bear Cub engagé) : quatre Îles.
    t = settle(
      act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "graveyard", "Ureni's Rebuff"),
        targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] },
        tap: [idOf(t, "p1", "battlefield", "Bear Cub")],
      }),
    );
    expect(idsOf(t, "p2", "hand", "Serra Angel")).toHaveLength(1);
    expect(exiled(t, "Ureni's Rebuff")).toHaveLength(1);
  });

  it("Veteran Ice Climber : vigilance, imblocable ; en attaquant, jusqu'à un joueur ciblé meule autant de cartes que sa force", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Veteran Ice Climber", counters: { "+1/+1": 2 } }] } });
    const climber = idOf(s, "p1", "battlefield", "Veteran Ice Climber");
    expect(chars(s, climber).keywords).toEqual(expect.arrayContaining(["vigilance", "unblockable"]));
    s = settleNoBlocks(attack(s, [climber]), picking(["p2"]));
    expect(s.players.p2?.graveyard).toHaveLength(3);
    expect(s.objects[climber]?.tapped).toBe(false);
  });

  it("War Effort : vos créatures ont +1/+0 ; quand vous attaquez, un Guerrier 1/1 engagé et attaquant, sacrifié à l'étape de fin", () => {
    let s = scenario({ p1: { battlefield: ["War Effort", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = settleNoBlocks(attack(s, [bear]));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(1);
    expect(s.objects[warriors[0] as string]?.tapped).toBe(true);
    expect(pt(s, warriors[0] as string)).toEqual([2, 1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(lifeOf(s, "p2")).toBe(15);
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(0);
  });

  it("Wayspeaker Bodyguard : en arrivant, une carte de permanent non-terrain de VM 2 ou moins de votre cimetière revient en main", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 4),
        hand: ["Wayspeaker Bodyguard"],
        graveyard: ["Serra Angel", "Forest", "Shock", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Wayspeaker Bodyguard"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Serra Angel", "Shock"]);
  });

  it("Wayspeaker Bodyguard : rafale — engagez une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Wayspeaker Bodyguard", "Island", "Island", "Bear Cub"], hand: ["Opt", "Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const opts = idsOf(s, "p1", "hand", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
    expect(s.objects[angel]?.tapped).toBe(false);
    s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
  });

  it("Zurgo's Vanguard : sa force est égale au nombre de créatures que vous contrôlez ; mobilisation 1", () => {
    let s = scenario({ p1: { battlefield: ["Zurgo's Vanguard", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const vanguard = idOf(s, "p1", "battlefield", "Zurgo's Vanguard");
    expect(pt(s, vanguard)).toEqual([2, 3]);
    s = settleNoBlocks(attack(s, [vanguard]));
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(1);
    expect(pt(s, vanguard)).toEqual([3, 3]);
  });

  it("Riverwheel Sweep : engage une créature, trois marqueurs d'étourdissement ; exile deux cartes, l'une jouable jusqu'à la fin de votre prochain tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Island", "Mountain", "Plains"],
        hand: ["Riverwheel Sweep"],
        library: ["Plains", "Island", ...lands("Forest", 4)],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Riverwheel Sweep", { t: [angel] }), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "impulse") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((id) => nameOf(cur, id) === "Island");
    });
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(3);
    expect(offered.sort()).toEqual(["Island", "Plains"]);
    const playable = (x: S, name: string) =>
      legalActions(x, "p1").some((a) => a.type === "playLand" && a.card === exiled(x, name)[0]);
    expect(playable(s, "Island")).toBe(true);
    expect(playable(s, "Plains")).toBe(false);
    s = nextMain(s);
    expect(playable(s, "Island")).toBe(true);
  });

  it("Duty Beyond Death : sacrifiez une créature en coût ; vos créatures gagnent l'indestructibilité et un marqueur +1/+1", () => {
    const none = scenario({ p1: { battlefield: ["Plains", "Plains"], hand: ["Duty Beyond Death"] } });
    expect(legalActions(none, "p1").some((a) => a.type === "cast" && nameOf(none, a.card) === "Duty Beyond Death")).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Bear Cub", "Llanowar Elves"], hand: ["Duty Beyond Death"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Duty Beyond Death", undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, elves).keywords).toContain("indestructible");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, elves).keywords).not.toContain("indestructible");
  });

  it("Desperate Measures : +1/-1 ; quand elle meurt sous votre contrôle ce tour-ci, piochez deux cartes", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Llanowar Elves"], hand: ["Desperate Measures"] } });
    s = settle(cast(s, "p1", "Desperate Measures", { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(2);
    // Une créature adverse qui meurt : pas sous votre contrôle.
    let t = scenario({ p1: { battlefield: ["Swamp"], hand: ["Desperate Measures"] }, p2: { battlefield: ["Llanowar Elves"] } });
    t = settle(cast(t, "p1", "Desperate Measures", { t: [idOf(t, "p2", "battlefield", "Llanowar Elves")] }));
    expect(idsOf(t, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(handSize(t, "p1")).toBe(0);
    // Elle survit, puis meurt plus tard dans le tour : piochez deux cartes.
    let u = scenario({ p1: { battlefield: ["Swamp", "Mountain", "Bear Cub"], hand: ["Desperate Measures", "Shock"] } });
    const bear = idOf(u, "p1", "battlefield", "Bear Cub");
    u = settle(cast(u, "p1", "Desperate Measures", { t: [bear] }));
    expect(pt(u, bear)).toEqual([3, 1]);
    expect(handSize(u, "p1")).toBe(1);
    u = settle(cast(u, "p1", "Shock", { t: [bear] }));
    expect(handSize(u, "p1")).toBe(2);
  });

  it("Salt Road Skirmish : détruit une créature ; deux Guerriers 1/1 avec la célérité, sacrifiés à l'étape de fin", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Salt Road Skirmish"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Salt Road Skirmish", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) expect(chars(s, w).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(0);
  });

  it("Sonic Shrieker : vol ; 2 blessures à n'importe quelle cible et vous gagnez 2 PV ; un joueur blessé défausse une carte", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Mountain", "Plains", "Swamp", ...lands("Swamp", 3)], hand: ["Sonic Shrieker"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Forest", "Island"] },
      });
    const s = settle(cast(setup(), "p1", "Sonic Shrieker"), picking(["p2"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Sonic Shrieker")).keywords).toContain("flying");
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
    expect(handSize(s, "p2")).toBe(1);
    let t = setup();
    t = settle(cast(t, "p1", "Sonic Shrieker"), picking([idOf(t, "p2", "battlefield", "Bear Cub")]));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(lifeOf(t, "p1")).toBe(22);
    expect(handSize(t, "p2")).toBe(2);
  });

  it("Shocking Sharpshooter : portée ; une autre de vos créatures arrive : 1 blessure à un adversaire ciblé", () => {
    let s = scenario({ p1: { battlefield: ["Shocking Sharpshooter", "Forest", "Forest"], hand: ["Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Shocking Sharpshooter")).keywords).toContain("reach");
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(lifeOf(s, "p2")).toBe(19);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Shocking Sharpshooter"] },
      p2: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] },
    });
    t = settle(cast(t, "p2", "Bear Cub"));
    expect(lifeOf(t, "p2")).toBe(20);
    expect(lifeOf(t, "p1")).toBe(20);
  });

  it("Wingblade Disciple : vol ; rafale — un Oiseau 1/1 blanc volant", () => {
    let s = scenario({ p1: { battlefield: ["Wingblade Disciple", "Island", "Island", "Island"], hand: ["Opt", "Opt", "Opt"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Wingblade Disciple")).keywords).toContain("flying");
    const opts = idsOf(s, "p1", "hand", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
    expect(tokensOf(s, "p1", "Bird")).toHaveLength(0);
    s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
    s = settle(act(s, "p1", { type: "cast", card: opts[2] as string }));
    const birds = tokensOf(s, "p1", "Bird");
    expect(birds).toHaveLength(1);
    expect(chars(s, birds[0] as string).keywords).toContain("flying");
    expect(chars(s, birds[0] as string).colors).toEqual(["W"]);
  });

  it("Overwhelming Surge : l'un ou les deux — 3 blessures à une créature ; détruisez un artefact non-créature", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Overwhelming Surge"] },
        p2: { battlefield: ["Serra Angel", "Hedron Archive"] },
      });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const archive = idOf(s, "p2", "battlefield", "Hedron Archive");
    s = settle(cast(s, "p1", "Overwhelming Surge", { t: [angel], a: [archive] }, { mode: 2 }));
    expect(s.objects[angel]?.damage).toBe(3);
    expect(idsOf(s, "p2", "graveyard", "Hedron Archive")).toHaveLength(1);
    let t = setup();
    t = settle(cast(t, "p1", "Overwhelming Surge", { a: [idOf(t, "p2", "battlefield", "Hedron Archive")] }, { mode: 1 }));
    expect(idsOf(t, "p2", "graveyard", "Hedron Archive")).toHaveLength(1);
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    const u = setup();
    // Une créature n'est pas un artefact non-créature.
    expect(() =>
      cast(u, "p1", "Overwhelming Surge", { a: [idOf(u, "p2", "battlefield", "Serra Angel")] }, { mode: 1 }),
    ).toThrow();
  });

  it("Jeskai Brushmaster : double initiative et prouesse", () => {
    let s = scenario({ p1: { battlefield: ["Jeskai Brushmaster", "Island"], hand: ["Opt"] } });
    const bm = idOf(s, "p1", "battlefield", "Jeskai Brushmaster");
    expect(chars(s, bm).keywords).toEqual(expect.arrayContaining(["doubleStrike", "prowess"]));
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, bm)).toEqual([3, 5]);
  });

  it("Jeskai Shrinekeeper : vol, célérité ; blesse un joueur en combat : vous gagnez 1 PV et piochez une carte", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Jeskai Shrinekeeper", sick: true }] } });
    const keeper = idOf(s, "p1", "battlefield", "Jeskai Shrinekeeper");
    expect(chars(s, keeper).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    s = settleNoBlocks(attack(s, [keeper]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(17);
    expect(lifeOf(s, "p1")).toBe(21);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Dragon Sniper : portée, vigilance, contact mortel", () => {
    const s = scenario({ p1: { battlefield: ["Dragon Sniper"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Dragon Sniper")).keywords).toEqual(
      expect.arrayContaining(["reach", "vigilance", "deathtouch"]),
    );
  });

  it("Kishla Skimmer : vol ; une carte quitte votre cimetière pendant votre tour : piochez, une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kishla Skimmer", ...lands("Swamp", 4), "Bear Cub"],
        graveyard: ["Alchemist's Assistant", "Alchemist's Assistant"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Kishla Skimmer")).keywords).toContain("flying");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const renewOne = (x: S) =>
      settle(activateNamed(x, idOf(x, "p1", "graveyard", "Alchemist's Assistant"), "Renouveau", { targets: { t: [bear] } }));
    s = renewOne(s);
    expect(handSize(s, "p1")).toBe(1);
    s = renewOne(s);
    expect(handSize(s, "p1")).toBe(1);
  });
});

describe("Tarkir: Dragonstorm, lot K8 : peu communes (4)", () => {
  /** Peut-on lancer la carte nommée de la main de p1 ? */
  const castOk = (s: S, name: string) =>
    legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

  it("Attuned Hunter : piétinement ; une ou plusieurs cartes quittent votre cimetière pendant votre tour : un marqueur +1/+1", () => {
    let s = scenario({ p1: { battlefield: ["Attuned Hunter", "Swamp", "Swamp"], graveyard: ["Alchemist's Assistant"] } });
    const hunter = idOf(s, "p1", "battlefield", "Attuned Hunter");
    expect(chars(s, hunter).keywords).toContain("trample");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renouveau", { targets: { t: [hunter] } }));
    expect(s.objects[hunter]?.counters["+1/+1"]).toBe(1);
  });

  it("Bewildering Blizzard : piochez trois cartes ; les créatures adverses gagnent -3/-0 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Bewildering Blizzard"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Bewildering Blizzard"));
    expect(handSize(s, "p1")).toBe(3);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(pt(s, angel)).toEqual([1, 4]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Cori Mountain Stalwart : rafale — 2 blessures à chaque adversaire et vous gagnez 2 PV", () => {
    let s = scenario({ p1: { battlefield: ["Cori Mountain Stalwart", "Island", "Island"], hand: ["Opt", "Opt"] } });
    const opts = idsOf(s, "p1", "hand", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
    expect(lifeOf(s, "p2")).toBe(20);
    s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
  });

  it("Dalkovan Packbeasts : 0/4, vigilance ; mobilisation 3", () => {
    let s = scenario({ p1: { battlefield: ["Dalkovan Packbeasts"] } });
    const beasts = idOf(s, "p1", "battlefield", "Dalkovan Packbeasts");
    expect(pt(s, beasts)).toEqual([0, 4]);
    expect(chars(s, beasts).keywords).toContain("vigilance");
    s = settleNoBlocks(attack(s, [beasts]));
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(3);
    expect(s.objects[beasts]?.tapped).toBe(false);
  });

  it("Defibrillating Current : 4 blessures à une créature ou un planeswalker, et vous gagnez 2 PV", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Plains", "Swamp"], hand: ["Defibrillating Current"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(() => cast(s, "p1", "Defibrillating Current", { t: ["p2"] })).toThrow();
    s = settle(cast(s, "p1", "Defibrillating Current", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(lifeOf(s, "p1")).toBe(22);
  });

  it("Descendant of Storms : en attaquant, vous pouvez payer {1}{W} ; si vous le faites, elle endure 1", () => {
    const run = (pay: boolean) => {
      let s = scenario({ p1: { battlefield: ["Descendant of Storms", "Plains", "Plains"] } });
      const d = idOf(s, "p1", "battlefield", "Descendant of Storms");
      s = settleNoBlocks(attack(s, [d]), answering({ yes: pay, endure: "counters" }));
      return { s, d };
    };
    const yes = run(true);
    expect(yes.s.objects[yes.d]?.counters["+1/+1"]).toBe(1);
    const no = run(false);
    expect(no.s.objects[no.d]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(tokensOf(no.s, "p1", "Spirit")).toHaveLength(0);
  });

  it("Dragonclaw Strike : double la force et l'endurance d'une de vos créatures, puis elle se bat contre jusqu'à une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Island", "Mountain", "Ambling Stormshell"], hand: ["Dragonclaw Strike"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => cast(s, "p1", "Dragonclaw Strike", { a: [angel] })).toThrow();
    s = settle(cast(s, "p1", "Dragonclaw Strike", { a: [shell], b: [angel] }));
    expect(pt(s, shell)).toEqual([10, 18]);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[shell]?.damage).toBe(4);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, shell)).toEqual([5, 9]);
    // Sans créature adverse : la créature est seulement doublée.
    let t = scenario({ p1: { battlefield: ["Forest", "Island", "Mountain", "Bear Cub"], hand: ["Dragonclaw Strike"] } });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(cast(t, "p1", "Dragonclaw Strike", { a: [bear] }));
    expect(pt(t, bear)).toEqual([4, 4]);
  });

  it("Dragonstorm Forecaster : {2}, {T} : cherche une carte nommée Dragonstorm Globe ou Boulderborn Dragon", () => {
    let s = scenario({
      p1: {
        battlefield: ["Dragonstorm Forecaster", "Island", "Island"],
        library: ["Shivan Dragon", "Boulderborn Dragon", "Dragonstorm Globe"],
      },
    });
    let offered: (string | undefined)[] = [];
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Dragonstorm Forecaster"), "Cherchez"), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "search") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((id) => nameOf(cur, id) === "Dragonstorm Globe");
    });
    expect(offered.sort()).toEqual(["Boulderborn Dragon", "Dragonstorm Globe"]);
    expect(idsOf(s, "p1", "hand", "Dragonstorm Globe")).toHaveLength(1);
  });

  it("Gurmag Rakshasa : menace ; en arrivant, une créature adverse gagne -2/-2 et une des vôtres +2/+2 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 6), "Bear Cub"], hand: ["Gurmag Rakshasa"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Gurmag Rakshasa"), picking([bear]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Gurmag Rakshasa")).keywords).toContain("menace");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(pt(s, bear)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Hardened Tactician : {1}, sacrifiez un jeton : piochez une carte", () => {
    let s = scenario({
      p1: { battlefield: ["Hardened Tactician", "Mountain", "Mountain", "Plains", "Bear Cub"], hand: ["Dragon Fodder"] },
    });
    const tactician = idOf(s, "p1", "battlefield", "Hardened Tactician");
    // Une créature non-jeton ne paie pas le coût.
    expect(hasActivation(s, tactician, "Sacrifiez")).toBe(false);
    s = settle(cast(s, "p1", "Dragon Fodder"));
    const goblin = tokensOf(s, "p1", "Goblin")[0] as string;
    s = settle(activateNamed(s, tactician, "Sacrifiez", { sacrifice: [goblin] }));
    expect(tokensOf(s, "p1", "Goblin")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Inspirited Vanguard : en arrivant ou en attaquant, elle endure 2", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Inspirited Vanguard"] } });
    s = settle(cast(s, "p1", "Inspirited Vanguard"), answering({ endure: "counters" }));
    const v = idOf(s, "p1", "battlefield", "Inspirited Vanguard");
    expect(s.objects[v]?.counters["+1/+1"]).toBe(2);
    let t = scenario({ p1: { battlefield: ["Inspirited Vanguard"] } });
    t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Inspirited Vanguard")]), answering({ endure: "token" }));
    const spirit = tokensOf(t, "p1", "Spirit")[0] as string;
    expect(pt(t, spirit)).toEqual([2, 2]);
  });

  it("Iridescent Tiger : en arrivant, si vous l'avez lancé, ajoutez {W}{U}{B}{R}{G}", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Iridescent Tiger"] } });
    s = settle(cast(s, "p1", "Iridescent Tiger"));
    const pool = s.players.p1?.manaPool;
    expect([pool?.W, pool?.U, pool?.B, pool?.R, pool?.G]).toEqual([1, 1, 1, 1, 1]);
    let t = scenario({
      p1: { battlefield: ["Plains", "Swamp", ...lands("Forest", 4)], hand: ["Perennation"], graveyard: ["Iridescent Tiger"] },
    });
    t = settle(cast(t, "p1", "Perennation", { t: [idOf(t, "p1", "graveyard", "Iridescent Tiger")] }));
    expect(idsOf(t, "p1", "battlefield", "Iridescent Tiger")).toHaveLength(1);
    expect(t.players.p1?.manaPool.W ?? 0).toBe(0);
  });

  it("Kin-Tree Severance : exile un permanent de valeur de mana 3 ou plus", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", "Forest"], hand: ["Kin-Tree Severance"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    expect(() => cast(s, "p1", "Kin-Tree Severance", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(cast(s, "p1", "Kin-Tree Severance", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
  });

  it("Kishla Trawlers : vous pouvez exiler une carte de créature de votre cimetière ; si vous le faites, un éphémère ou un rituel revient en main", () => {
    const run = (graveyard: string[], yes: boolean) =>
      settle(
        cast(
          scenario({ p1: { battlefield: lands("Island", 3), hand: ["Kishla Trawlers"], graveyard } }),
          "p1",
          "Kishla Trawlers",
        ),
        answering({ yes }),
      );
    const s = run(["Bear Cub", "Shock"], true);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Shock")).toHaveLength(1);
    const no = run(["Bear Cub", "Shock"], false);
    expect(idsOf(no, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(no, "p1", "hand", "Shock")).toHaveLength(0);
    const noCreature = run(["Forest", "Shock"], true);
    expect(idsOf(noCreature, "p1", "hand", "Shock")).toHaveLength(0);
  });

  it("Knockout Maneuver : un marqueur +1/+1 sur une de vos créatures, puis elle inflige autant de blessures que sa force à une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Knockout Maneuver"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Knockout Maneuver", { a: [bear], b: [angel] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[angel]?.damage).toBe(3);
    // Blessures à sens unique.
    expect(s.objects[bear]?.damage).toBe(0);
  });

  it("Lie in Wait : une carte de créature de votre cimetière revient en main ; blessures égales à sa force à une créature", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Island"], hand: ["Lie in Wait"], graveyard: ["Serra Angel"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(
      cast(s, "p1", "Lie in Wait", {
        c: [idOf(s, "p1", "graveyard", "Serra Angel")],
        d: [idOf(s, "p2", "battlefield", "Serra Angel")],
      }),
    );
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Loxodon Battle Priest : au début du combat de votre tour, un marqueur +1/+1 sur une autre de vos créatures", () => {
    let s = scenario({ p1: { battlefield: ["Loxodon Battle Priest", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Loxodon Battle Priest")]?.counters["+1/+1"] ?? 0).toBe(0);
    // Pendant le tour adverse : rien.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main2");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });

  it("Marshal of the Lost : contact mortel ; quand vous attaquez, une créature gagne +X/+X (X : les créatures attaquantes)", () => {
    let s = scenario({ p1: { battlefield: ["Marshal of the Lost", "Bear Cub"] } });
    const marshal = idOf(s, "p1", "battlefield", "Marshal of the Lost");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, marshal).keywords).toContain("deathtouch");
    s = settleNoBlocks(attack(s, [marshal, bear]), picking([bear]));
    expect(pt(s, bear)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Tri-terrains : arrivent engagés ; {T} : l'une de leurs trois couleurs", () => {
    const colorSpells: Record<string, string> = { W: "Fleeting Flight", U: "Opt", B: "Duress", R: "Shock", G: "Llanowar Elves" };
    const cases: [string, string[]][] = [
      ["Frontier Bivouac", ["G", "U", "R"]],
      ["Mystic Monastery", ["U", "R", "W"]],
      ["Nomad Outpost", ["R", "W", "B"]],
      ["Opulent Palace", ["B", "G", "U"]],
      ["Sandsteppe Citadel", ["W", "B", "G"]],
    ];
    for (const [land, colors] of cases) {
      expect(landEntersTapped(land, [])).toBe(true);
      const s = scenario({ p1: { battlefield: [land, "Bear Cub"], hand: Object.values(colorSpells) } });
      for (const [c, spell] of Object.entries(colorSpells))
        expect([land, c, castOk(s, spell)]).toEqual([land, c, colors.includes(c)]);
    }
  });

  it("Rakshasa's Bargain : regardez quatre cartes, deux en main, le reste au cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Island"],
        hand: ["Rakshasa's Bargain"],
        library: ["Opt", "Shock", "Bear Cub", "Plains", "Island"],
      },
    });
    let min = -1;
    s = settle(cast(s, "p1", "Rakshasa's Bargain"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      min = req.min;
      return req.options.filter((id) => ["Shock", "Bear Cub"].includes(nameOf(cur, id) ?? ""));
    });
    expect(min).toBe(2);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Shock"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Plains", "Rakshasa's Bargain"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
  });

  it("Rite of Renewal : jusqu'à deux cartes de permanent reviennent en main ; un joueur mélange jusqu'à quatre cartes de son cimetière ; exilé", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Rite of Renewal"], graveyard: ["Bear Cub", "Serra Angel", "Shock"] },
      p2: { graveyard: lands("Plains", 3), library: lands("Island", 5) },
    });
    const shock = idOf(s, "p1", "graveyard", "Shock");
    const plains = s.players.p2?.graveyard.slice(0, 2) as string[];
    // Une carte d'éphémère n'est pas une carte de permanent.
    expect(() => cast(s, "p1", "Rite of Renewal", { p: [shock], pl: ["p2"], c: plains })).toThrow();
    s = settle(
      cast(s, "p1", "Rite of Renewal", {
        p: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Serra Angel")],
        pl: ["p2"],
        c: plains,
      }),
    );
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    expect(s.players.p2?.library).toHaveLength(7);
    expect(exiled(s, "Rite of Renewal")).toHaveLength(1);
  });

  it("Skirmish Rhino : piétinement ; en arrivant, chaque adversaire perd 2 PV et vous en gagnez 2", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Swamp", "Forest"], hand: ["Skirmish Rhino"] } });
    s = settle(cast(s, "p1", "Skirmish Rhino"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Skirmish Rhino")).keywords).toContain("trample");
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
  });

  it("Traveling Botanist : engagée, regardez la carte du dessus ; un terrain peut aller en main, sinon la carte peut aller au cimetière", () => {
    const run = (top: string, yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Traveling Botanist"], library: [top, ...lands("Island", 4)] } });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Traveling Botanist")]), (req) => {
        if (req.type === "yesNo") return [yes ? 1 : 0];
        if (req.type === "pick") return yes ? req.options.slice(0, 1) : [];
        return undefined;
      });
      return s;
    };
    const land = run("Forest", true);
    expect(idsOf(land, "p1", "hand", "Forest")).toHaveLength(1);
    const keep = run("Forest", false);
    expect(nameOf(keep, keep.players.p1?.library[0] as string)).toBe("Forest");
    const mill = run("Opt", true);
    expect(idsOf(mill, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(mill, "p1", "hand", "Opt")).toHaveLength(0);
    const stay = run("Opt", false);
    expect(nameOf(stay, stay.players.p1?.library[0] as string)).toBe("Opt");
  });

  it("Unsparing Boltcaster : en arrivant, 5 blessures à une créature adverse qui a reçu des blessures ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Shock", "Unsparing Boltcaster"] },
      p2: { battlefield: ["Serra Angel", "Ambling Stormshell"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Shock", { t: [angel] }));
    s = settle(cast(s, "p1", "Unsparing Boltcaster"));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Ambling Stormshell")]?.damage).toBe(0);
    // Sans créature blessée : aucune cible.
    let t = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Unsparing Boltcaster"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Unsparing Boltcaster"));
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
  });

  it("Wail of War : les créatures d'un adversaire ciblé gagnent -1/-1, ou jusqu'à deux cartes de créature reviennent en main", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Wail of War"] },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Wail of War", { p: ["p2"] }, { mode: 0 }));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([1, 1]);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Wail of War"], graveyard: ["Bear Cub", "Serra Angel", "Forest"] },
    });
    t = settle(
      cast(
        t,
        "p1",
        "Wail of War",
        { g: [idOf(t, "p1", "graveyard", "Bear Cub"), idOf(t, "p1", "graveyard", "Serra Angel")] },
        { mode: 1 },
      ),
    );
    expect(namesIn(t, t.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  it("Yathan Tombguard : menace ; une de vos créatures à marqueur blesse un joueur en combat : piochez une carte, perdez 1 PV", () => {
    let s = scenario({
      p1: { battlefield: ["Yathan Tombguard", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Yathan Tombguard")).keywords).toContain("menace");
    s = settleNoBlocks(
      attack(s, [
        idOf(s, "p1", "battlefield", "Bear Cub"),
        idOf(s, "p1", "battlefield", "Llanowar Elves"),
        idOf(s, "p1", "battlefield", "Yathan Tombguard"),
      ]),
    );
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(14);
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p1")).toBe(19);
  });
});

describe("Tarkir: Dragonstorm, lot K8 : « votre cimetière »", () => {
  it("une carte qui quitte le cimetière adverse ne compte pas (Essence Anchor, Kheru Goldkeeper, Attuned Hunter, Kishla Skimmer)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Essence Anchor", "Kheru Goldkeeper", "Attuned Hunter", "Kishla Skimmer", "Forest", "Forest"],
        hand: ["Heritage Reclamation"],
      },
      p2: { graveyard: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Heritage Reclamation", { g: [idOf(s, "p2", "graveyard", "Bear Cub")] }, { mode: 2 }));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    // La seule carte piochée est celle de Heritage Reclamation.
    expect(handSize(s, "p1")).toBe(1);
    expect(tokensOf(s, "p1", "Treasure")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Attuned Hunter")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(hasActivation(s, idOf(s, "p1", "battlefield", "Essence Anchor"), "Zombie")).toBe(false);
  });

  it("pendant le tour adverse, une carte qui quitte votre cimetière ne déclenche rien (Kheru Goldkeeper, Attuned Hunter, Kishla Skimmer)", () => {
    let s = scenario({
      active: "p2",
      p1: {
        battlefield: ["Kheru Goldkeeper", "Attuned Hunter", "Kishla Skimmer", "Forest", "Forest"],
        hand: ["Heritage Reclamation"],
        graveyard: ["Bear Cub"],
      },
    });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(cast(s, "p1", "Heritage Reclamation", { g: [idOf(s, "p1", "graveyard", "Bear Cub")] }, { mode: 2 }));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(1);
    expect(tokensOf(s, "p1", "Treasure")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Attuned Hunter")]?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Contempler (PLAN-D, D2)", () => {
  const castWith = (s: GameState, name: string, extra: Record<string, unknown>) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
  const beholdPick = (s: GameState, name: string) => {
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
    return opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "behold") : undefined;
  };

  it("Caustic Exhale : contempler un Dragon de la main (révélé) ou payer {1} ; sans Dragon, {1} de plus", () => {
    // Un Dragon en main : proposé, révélé ; le sort coûte {B}.
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale", "Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const pick = beholdPick(s, "Caustic Exhale");
    expect(pick?.optional).toBe(true);
    expect(pick?.options).toEqual([idOf(s, "p1", "hand", "Shivan Dragon")]);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(castWith(s, "Caustic Exhale", { targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // Refuser de contempler : {1} de plus, impossible avec un seul Marais.
    const t = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale", "Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(() =>
      castWith(t, "Caustic Exhale", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }, picks: { behold: [] } }),
    ).toThrow(RulesError);
    // Sans Dragon : pas proposé, {1}{B}.
    const u = scenario({ p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale"] }, p2: { battlefield: ["Bear Cub"] } });
    expect(legalActions(u, "p1").some((a) => a.type === "cast" && a.card === idOf(u, "p1", "hand", "Caustic Exhale"))).toBe(
      false,
    );
  });

  it("Dispelling Exhale : contempler se fait au lancement ; le Dragon parti ensuite, le sort reste « contemplé » ({4})", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Island", 2), "Shivan Dragon"], hand: ["Dispelling Exhale"] },
      p2: { battlefield: lands("Mountain", 6), hand: ["Shock"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
    const shock = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dispelling Exhale"), targets: { t: [shock] } });
    expect(s.stack.at(-1)?.cast?.beheld).toBe(true);
    // Le Dragon quitte le champ de bataille avant la résolution : le sort a quand même été lancé en contemplant.
    destroy(s, idOf(s, "p1", "battlefield", "Shivan Dragon"));
    let asked = "";
    for (let i = 0; i < 20 && s.stack.length > 0; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        asked = p.request.prompt;
        s = act(s, p.player, { type: "choose", values: p.request.type === "yesNo" ? [0] : p.request.suggested });
      } else break;
    }
    expect(asked).toContain("{4}");
    expect(s.players.p1?.life).toBe(20);
  });

  it("Molten Exhale : comme s'il avait le flash seulement en contemplant un Dragon", () => {
    const setup = () =>
      scenario({
        active: "p2",
        p1: { battlefield: lands("Mountain", 2), hand: ["Molten Exhale", "Shivan Dragon"] },
        p2: { battlefield: ["Bear Cub"] },
      });
    let s = act(setup(), "p2", { type: "pass" });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => castWith(s, "Molten Exhale", { targets: { t: [bear] }, picks: { behold: [] } })).toThrow(RulesError);
    s = settle(castWith(s, "Molten Exhale", { targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Sarkhan, Dragon Ascendant : en arrivant, vous pouvez contempler un Dragon ; si vous le faites, un Trésor", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Sarkhan, Dragon Ascendant", "Shivan Dragon"] } });
      s = castWith(s, "Sarkhan, Dragon Ascendant", {});
      let asked = false;
      for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice" && p.request.type === "pick") {
          asked = true;
          s = act(s, p.player, { type: "choose", values: yes ? p.request.suggested : [] });
        } else break;
      }
      return { asked, treasures: idsOf(s, "p1", "battlefield", "Treasure").length };
    };
    expect(run(true)).toEqual({ asked: true, treasures: 1 });
    expect(run(false)).toEqual({ asked: true, treasures: 0 });
  });
});
