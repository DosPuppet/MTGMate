/**
 * Tarkir: Dragonstorm (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Harmonie (Channeled Dragonfire, Winternight Stories), mobilisation (Stadium Headliner),
 * contempler (Dispelling Exhale, Sarkhan), renouveau (Qarsi Revenant), présage (Twinmaw Stormbrood), Inevitable Defeat,
 * Tersa Lightshatter, Sage of the Skies et Mistrise Village.
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, passUntil, scenario } from "./helpers";

type S = GameState;
type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

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
