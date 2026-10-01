/**
 * Tarkir: Dragonstorm (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Harmonie (Channeled Dragonfire, Winternight Stories), mobilisation (Stadium Headliner),
 * contempler (Dispelling Exhale, Sarkhan), renouveau (Qarsi Revenant), présage (Twinmaw Stormbrood), Inevitable Defeat,
 * Tersa Lightshatter, Sage of the Skies et Mistrise Village.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, castNowOf, idOf, idsOf, passAccepting, passUntil, scenario, untilCastNow } from "./helpers";

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
