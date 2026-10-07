/**
 * Marvel Super Heroes (extension partielle : cartes des decks du méta) : chaque carte gérée est confrontée à son texte
 * Oracle (plan R, lot R7). Équiper digne (Mjölnir), Plans (Political Triumph), Doombots (Doctor Doom, Castle Doom),
 * complot (M.O.D.O.K.), Wolverine, The Wondrous Wasp, Avengers Disassembled, Jennifer Walters et Hidden Lair.
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { fx, manaAbility, ref, spell, target, triggered, when } from "../src/dsl";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { changeCounters, chars } from "../src/state";
import type { ActionOption, ChoiceValue, GameState, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attackPlayer,
  cast,
  castable,
  castNowOf,
  combatTargetsOffered,
  counterFrom,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  passAccepting,
  passUntil,
  picking,
  scenario,
  settle,
  steal,
  untilCastNow,
} from "./helpers";

type S = GameState;
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

describe("Marvel Super Heroes", () => {
  describe("Mjölnir, Hammer of Thor", () => {
    it("en arrivant, 4 blessures à jusqu'à une créature ciblée", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Mjölnir, Hammer of Thor"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Mjölnir, Hammer of Thor"), picking([angel]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Mjölnir, Hammer of Thor")).toHaveLength(1);
    });

    it("{2}{R}, défaussez-le : 2 blessures à chaque créature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Mjölnir, Hammer of Thor"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const hammer = idOf(s, "p1", "hand", "Mjölnir, Hammer of Thor");
      s = settle(activate(s, "p1", hammer));
      expect(idsOf(s, "p1", "graveyard", "Mjölnir, Hammer of Thor")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    });

    it("Équiper digne {1} : seulement une créature légendaire non-Méchant rouge et/ou blanche ; ses blessures sont doublées", () => {
      let s = scenario({
        p1: { battlefield: ["Mjölnir, Hammer of Thor", "Thor Odinson", "Doctor Doom", "Bear Cub", "Mountain"] },
      });
      const hammer = idOf(s, "p1", "battlefield", "Mjölnir, Hammer of Thor");
      const thor = idOf(s, "p1", "battlefield", "Thor Odinson");
      const equip = ability(s, "p1", hammer, /Équiper/);
      const legal = equip?.targets[0]?.legal ?? [];
      expect(legal).toEqual([thor]);
      s = settle(activate(s, "p1", hammer, { targets: { t: [thor] } }, /Équiper/));
      expect(s.objects[hammer]?.attachedTo).toBe(thor);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: thor, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      // Thor Odinson (4/4) inflige 8 blessures.
      expect(s.players.p2?.life).toBe(12);
    });
  });

  describe("Political Triumph", () => {
    it("une créature arrivée sous votre contrôle : regard 1 et un marqueur de plan", () => {
      let s = scenario({
        p1: { battlefield: ["Political Triumph", "Forest"], hand: ["Llanowar Elves"], library: ["Opt", "Forest"] },
      });
      const plan = idOf(s, "p1", "battlefield", "Political Triumph");
      let scried = false;
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => {
        if (req.type === "pick" && req.options.some((id) => nameOf(s, String(id)) === "Opt")) scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(s.objects[plan]?.counters.plan).toBe(1);
    });

    it("au quatrième marqueur : sacrifiez-le, piochez et un marqueur +1/+1 sur chacune de vos créatures", () => {
      let s = scenario({
        p1: { battlefield: ["Political Triumph", "Forest", "Bear Cub"], hand: ["Llanowar Elves"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      setCounters(s, idOf(s, "p1", "battlefield", "Political Triumph"), "plan", 3);
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(idsOf(s, "p1", "graveyard", "Political Triumph")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Doctor Doom", () => {
    it("en arrivant, deux Doombots 3/3 (créatures-artefacts Robot Méchant) ; il est alors indestructible", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Doctor Doom"] } });
      s = settle(cast(s, "p1", "Doctor Doom"));
      const bots = idsOf(s, "p1", "battlefield", "Doombot");
      expect(bots).toHaveLength(2);
      const c = chars(s, bots[0] as string);
      expect([c.power, c.toughness]).toEqual([3, 3]);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Robot", "Villain"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Doctor Doom")).keywords).toContain("indestructible");
    });

    it("indestructible seulement avec une créature-artefact ou un Plan", () => {
      const alone = scenario({ p1: { battlefield: ["Doctor Doom"] } });
      expect(chars(alone, idOf(alone, "p1", "battlefield", "Doctor Doom")).keywords).not.toContain("indestructible");
      const plan = scenario({ p1: { battlefield: ["Doctor Doom", "Political Triumph"] } });
      expect(chars(plan, idOf(plan, "p1", "battlefield", "Doctor Doom")).keywords).toContain("indestructible");
    });

    it("au début de votre étape de fin, piochez une carte et perdez 1 PV", () => {
      let s = scenario({ p1: { battlefield: ["Doctor Doom"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });
  });

  describe("Castle Doom", () => {
    it("son mana de couleur ne paie qu'un sort d'artefact", () => {
      const s = scenario({
        p1: { battlefield: ["Castle Doom", ...lands("Plains", 3)], hand: ["Burst Lightning", "Mjölnir, Hammer of Thor"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Burst Lightning"))).toBe(false);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Mjölnir, Hammer of Thor"))).toBe(true);
    });

    it("{3}, {T}, sacrifiez un artefact : un Doombot 3/3, en rituel seulement", () => {
      let s = scenario({ p1: { battlefield: ["Castle Doom", "The Mind Stone", ...lands("Plains", 3)] } });
      const castle = idOf(s, "p1", "battlefield", "Castle Doom");
      const stone = idOf(s, "p1", "battlefield", "The Mind Stone");
      const doombot = ability(s, "p1", castle, /Doombot/);
      expect(doombot?.additional?.sacrifice?.options).toContain(stone);
      s = settle(activate(s, "p1", castle, { sacrifice: [stone] }, /Doombot/));
      expect(idsOf(s, "p1", "graveyard", "The Mind Stone")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Doombot"))).toEqual([3, 3]);
      // Pendant le tour adverse, la capacité n'est pas proposée.
      let t = scenario({ active: "p2", p1: { battlefield: ["Castle Doom", "The Mind Stone", ...lands("Plains", 3)] } });
      t = act(t, "p2", { type: "pass" });
      expect(ability(t, "p1", idOf(t, "p1", "battlefield", "Castle Doom"), /Doombot/)).toBeUndefined();
    });
  });

  describe("M.O.D.O.K.", () => {
    it("les créatures adverses ont −1/−1, pas les vôtres", () => {
      const s = scenario({ p1: { battlefield: ["M.O.D.O.K.", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "M.O.D.O.K.")).keywords).toEqual(
        expect.arrayContaining(["flying", "lifelink"]),
      );
    });

    it("payez 3 PV : il complote ; une carte non-terrain défaussée lui donne un marqueur +1/+1", () => {
      const run = (discard: string) => {
        let s = scenario({ p1: { battlefield: ["M.O.D.O.K."], hand: ["Forest"], library: ["Opt", "Plains"] } });
        const modok = idOf(s, "p1", "battlefield", "M.O.D.O.K.");
        s = activate(s, "p1", modok);
        s = settle(s, (req, _player, cur) => {
          if (req.type !== "pick") return undefined;
          const id = req.options.find((o) => nameOf(cur, String(o)) === discard);
          return id ? [id] : undefined;
        });
        return { s, modok };
      };
      const opt = run("Opt");
      expect(opt.s.players.p1?.life).toBe(17);
      expect(opt.s.players.p1?.hand.map((id) => nameOf(opt.s, id))).toEqual(["Forest"]);
      expect(opt.s.objects[opt.modok]?.counters["+1/+1"]).toBe(1);
      const land = run("Forest");
      expect(land.s.players.p1?.hand.map((id) => nameOf(land.s, id))).toEqual(["Opt"]);
      expect(land.s.objects[land.modok]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("le complot ne s'active que pendant votre tour", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["M.O.D.O.K."] } });
      s = act(s, "p2", { type: "pass" });
      expect(ability(s, "p1", idOf(s, "p1", "battlefield", "M.O.D.O.K."))).toBeUndefined();
    });
  });

  it("Wolverine : célérité ; se bat contre une autre créature ; de nouvelles blessures guérissent les précédentes", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Forest"], hand: ["Wolverine, Fierce Fighter", "Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Wolverine, Fierce Fighter"), picking([bear]));
    const wolverine = idOf(s, "p1", "battlefield", "Wolverine, Fierce Fighter");
    expect(chars(s, wolverine).keywords).toContain("haste");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[wolverine]?.damage).toBe(2);
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [wolverine] } }));
    expect(s.objects[wolverine]?.damage).toBe(2);
  });

  it("The Wondrous Wasp : engage une créature, qui perd ses capacités tant que la Guêpe reste en jeu", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Mountain"], hand: ["The Wondrous Wasp", "Burst Lightning"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "The Wondrous Wasp"), picking([angel]));
    const wasp = idOf(s, "p1", "battlefield", "The Wondrous Wasp");
    expect(chars(s, wasp).keywords).toEqual(expect.arrayContaining(["flash", "flying"]));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(chars(s, angel).keywords).not.toContain("flying");
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [wasp] } }));
    expect(idsOf(s, "p1", "graveyard", "The Wondrous Wasp")).toHaveLength(1);
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
  });

  it("Avengers Disassembled, les deux modes : 3 blessures à chaque créature, un terrain détruit, son contrôleur cherche un terrain de base", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Avengers Disassembled"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", "Island"], library: ["Plains", "Opt"] },
    });
    const island = idOf(s, "p2", "battlefield", "Island");
    s = settle(cast(s, "p1", "Avengers Disassembled", { mode: 2, targets: { t: [island] } }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    expect(idsOf(s, "p2", "graveyard", "Island")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  describe("Jennifer Walters // The Sensational She-Hulk", () => {
    it("vos adversaires ne peuvent pas lancer de sorts pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: ["Jennifer Walters // The Sensational She-Hulk"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      s = act(s, "p1", { type: "pass" });
      expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Opt"))).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Opt"))).toBe(true);
    });

    it("She-Hulk : une de vos créatures blessée lui fait infliger autant de blessures à une cible, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Jennifer Walters // The Sensational She-Hulk",
            ...lands("Forest", 2),
            ...lands("Plains", 4),
            ...lands("Mountain", 2),
          ],
          hand: ["Burst Lightning", "Burst Lightning"],
        },
      });
      const jen = idOf(s, "p1", "battlefield", "Jennifer Walters // The Sensational She-Hulk");
      s = settle(activate(s, "p1", jen));
      expect(chars(s, jen).name).toBe("The Sensational She-Hulk");
      expect(pt(s, jen)).toEqual([6, 6]);
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [jen] } }), picking(["p2"]));
      expect(s.players.p2?.life).toBe(18);
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [jen] } }), picking(["p2"]));
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[jen]?.damage).toBe(4);
    });
  });

  it("Hidden Lair : {C} toujours ; {U} ou {B} s'il est arrivé ce tour-ci ou avec un terrain de base", () => {
    const colors = (s: S) => {
      const lair = idOf(s, "p1", "battlefield", "Hidden Lair");
      return [
        ...new Set(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === lair ? a.colors : []))),
      ].sort();
    };
    expect(colors(scenario({ p1: { battlefield: ["Hidden Lair"] } }))).toEqual(["C"]);
    expect(colors(scenario({ p1: { battlefield: ["Hidden Lair", "Plains"] } }))).toEqual(["B", "C", "U"]);
    let s = scenario({ p1: { hand: ["Hidden Lair"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Hidden Lair") });
    expect(colors(s)).toEqual(["B", "C", "U"]);
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Une carte de ce nom est en exil. */
  const exiled = (s: S, name: string) =>
    Object.values(s.objects).some((o) => o?.zone === "exile" && s.defs[o.defId]?.name === name);
  /** p1 déclare ces attaquants contre p2. */
  const attack = (s: S, ids: string[]) => {
    const at = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(at, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  describe("Marvel Super Heroes, lot A — blanc", () => {
    it("Agent 13, Sharon Carter : une créature qui attaque seule fait enquêter, pas deux attaquants", () => {
      let s = scenario({ p1: { battlefield: ["Agent 13, Sharon Carter", "Bear Cub", "Savannah Lions"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const alone = settle(attack(s, [bear]));
      expect(idsOf(alone, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = settle(attack(s, [bear, idOf(s, "p1", "battlefield", "Savannah Lions")]));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
    });

    it("Agents of S.H.I.E.L.D. : la créature qui attaque seule gagne +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Agents of S.H.I.E.L.D.", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [bear]));
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Agent Phil Coulson : {T} met un marqueur +1/+1 sur chacun de vos autres Héros seulement", () => {
      let s = scenario({
        p1: { battlefield: ["Agent Phil Coulson", "Agents of S.H.I.E.L.D.", "Bear Cub"] },
        p2: { battlefield: ["Hero in Training"] },
      });
      const coulson = idOf(s, "p1", "battlefield", "Agent Phil Coulson");
      s = settle(activate(s, "p1", coulson));
      expect(s.objects[idOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[coulson]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p2", "battlefield", "Hero in Training")]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Invisible Woman : des marqueurs sur plusieurs autres Héros donnent un seul Mur 0/4 défenseur", () => {
      let s = scenario({
        p1: {
          battlefield: ["Invisible Woman, Sue Storm", "Agent Phil Coulson", "Agents of S.H.I.E.L.D.", "Hero in Training"],
        },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Agent Phil Coulson")), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      const walls = idsOf(s, "p1", "battlefield", "Wall");
      expect(walls).toHaveLength(1);
      expect(pt(s, walls[0] as string)).toEqual([0, 4]);
      expect(chars(s, walls[0] as string).keywords).toContain("defender");
    });

    it("Avengers Assemble! : vos Héros ont +2/+2 ; à l'étape de fin, piochez si un Héros a attaqué", () => {
      let s = scenario({
        p1: { battlefield: ["Avengers Assemble!", "Agents of S.H.I.E.L.D.", "Bear Cub"] },
        p2: { battlefield: ["Agents of S.H.I.E.L.D."] },
      });
      const agents = idOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.");
      expect(pt(s, agents)).toEqual([4, 6]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Agents of S.H.I.E.L.D."))).toEqual([2, 4]);
      const hand = s.players.p1?.hand.length ?? 0;
      const noAttack = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(noAttack.players.p1?.hand.length).toBe(hand);
      s = attack(s, [agents]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Avengers Assemble! : un Héros arrivé sous votre contrôle ce tour-ci suffit", () => {
      let s = scenario({ p1: { battlefield: ["Avengers Assemble!", ...lands("Plains", 3)], hand: ["Hero in Training"] } });
      s = settle(cast(s, "p1", "Hero in Training"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Borough Backup : deux Héros 3/2 blancs avec la vigilance", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Borough Backup"] } });
      s = settle(cast(s, "p1", "Borough Backup"));
      const heroes = idsOf(s, "p1", "battlefield", "Hero");
      expect(heroes).toHaveLength(2);
      const c = chars(s, heroes[0] as string);
      expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([3, 2, ["W"], ["Hero"]]);
      expect(c.keywords).toContain("vigilance");
    });

    it("Brave Brawler : montée en puissance, deux marqueurs +1/+1, une seule fois", () => {
      let s = scenario({ p1: { battlefield: ["Brave Brawler", ...lands("Plains", 10)] } });
      const brawler = idOf(s, "p1", "battlefield", "Brave Brawler");
      s = settle(activate(s, "p1", brawler));
      expect(s.objects[brawler]?.counters["+1/+1"]).toBe(2);
      expect(ability(s, "p1", brawler)).toBeUndefined();
    });

    it("Captain America, Wings of Freedom : en attaquant, vos autres Héros gagnent +X/+X (X : son endurance)", () => {
      let s = scenario({
        p1: { battlefield: ["Captain America, Wings of Freedom", "Hero in Training", "Bear Cub"] },
      });
      const cap = idOf(s, "p1", "battlefield", "Captain America, Wings of Freedom");
      s = settle(attack(s, [cap]));
      expect(pt(s, idOf(s, "p1", "battlefield", "Hero in Training"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, cap)).toEqual([3, 1]);
    });

    it("Captain Mar-Vell : vos sorts ont le flash seulement si un adversaire a lancé un sort ce tour-ci", () => {
      const setup = (marvell: boolean) =>
        scenario({
          p1: { battlefield: [...(marvell ? ["Captain Mar-Vell, Space-Born"] : []), "Forest", "Forest"], hand: ["Bear Cub"] },
          p2: { battlefield: ["Island"], hand: ["Opt"] },
          active: "p2",
        });
      for (const marvell of [true, false]) {
        let s = setup(marvell);
        s = act(cast(s, "p2", "Opt"), "p2", { type: "pass" });
        expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(marvell);
      }
    });

    it("Colleen Wing : un sort qui cible une de vos créatures lui donne un marqueur et un regard 1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Colleen Wing, Street Samurai", "Bear Cub", "Forest", "Forest"],
          hand: ["Giant Growth", "Giant Growth"],
        },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const colleen = idOf(s, "p1", "battlefield", "Colleen Wing, Street Samurai");
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(s.objects[colleen]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
      expect(s.objects[colleen]?.counters["+1/+1"]).toBe(1);
    });

    it("Mockingbird : un sort qui cible une de vos créatures lui donne un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Mockingbird, Ace Agent", "Forest"], hand: ["Giant Growth"] } });
      const bird = idOf(s, "p1", "battlefield", "Mockingbird, Ace Agent");
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [bird] } }));
      expect(s.objects[bird]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, bird)).toEqual([6, 6]);
    });

    it("Crowd of True Believers : la créature qui attaque seule gagne +1/+0, vous gagnez 1 PV", () => {
      let s = scenario({ p1: { battlefield: ["Crowd of True Believers", "Bear Cub", "Savannah Lions"] } });
      const crowd = idOf(s, "p1", "battlefield", "Crowd of True Believers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(ability(s, "p1", crowd)).toBeUndefined();
      const two = attack(s, [bear, idOf(s, "p1", "battlefield", "Savannah Lions")]);
      expect(ability(two, "p1", crowd)).toBeUndefined();
      s = attack(s, [bear]);
      s = settle(activate(s, "p1", crowd, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Helicarrier Strike : 2 blessures à une créature attaquante, 4 avec le travail d'équipe", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Helicarrier Strike"] },
          p2: { battlefield: ["Serra Angel", "Agents of S.H.I.E.L.D."] },
          active: "p2",
        });
      const declare = (s0: S) => {
        const at = advanceUntil(s0, (x) => x.pending?.kind === "declareAttackers");
        const angel = idOf(at, "p2", "battlefield", "Serra Angel");
        const s = act(at, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
        return { s: act(s, "p2", { type: "pass" }), angel };
      };
      let { s, angel } = declare(setup());
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Helicarrier Strike"))).toBe(true);
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Helicarrier Strike"), targets: { t: [angel] } });
      s = act(act(s, "p1", { type: "pass" }), "p2", { type: "pass" });
      expect(s.objects[angel]?.damage).toBe(2);
      ({ s, angel } = declare(setup()));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Helicarrier Strike"),
        targets: { t: [angel] },
        kicked: true,
        tap: [bear],
      });
      expect(s.objects[bear]?.tapped).toBe(true);
      s = act(act(s, "p1", { type: "pass" }), "p2", { type: "pass" });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Hero in Training : piochez une carte, et 2 PV seulement si vous contrôlez un autre Héros", () => {
      for (const other of [true, false]) {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 3), ...(other ? ["Agents of S.H.I.E.L.D."] : ["Bear Cub"])],
            hand: ["Hero in Training"],
          },
        });
        s = settle(cast(s, "p1", "Hero in Training"));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.life).toBe(other ? 22 : 20);
      }
    });

    it("Luke Cage : en attaquant seul, +2/+0 et l'indestructible ; rien s'il n'est pas seul", () => {
      let s = scenario({ p1: { battlefield: ["Luke Cage, Power Man", "Bear Cub"] } });
      const luke = idOf(s, "p1", "battlefield", "Luke Cage, Power Man");
      const both = settle(attack(s, [luke, idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(pt(both, luke)).toEqual([2, 5]);
      s = settle(attack(s, [luke]));
      expect(pt(s, luke)).toEqual([4, 5]);
      expect(chars(s, luke).keywords).toContain("indestructible");
    });

    it("Monica Rambeau : {2}{R}{W}{W} la transforme en Photon, qui renforce vos autres créatures à chaque sort non-créature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Monica Rambeau // Photon, Living Light", "Bear Cub", ...lands("Plains", 4), "Mountain", "Mountain"],
          hand: ["Giant Growth"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const monica = idOf(s, "p1", "battlefield", "Monica Rambeau // Photon, Living Light");
      s = settle(activate(s, "p1", monica, {}, /Transformez/));
      expect(chars(s, monica).name).toBe("Photon, Living Light");
      expect(chars(s, monica).keywords).toContain("hexproof");
      expect(pt(s, monica)).toEqual([4, 4]);
    });

    it("Photon, Living Light : chaque sort non-créature met un marqueur sur chacune de vos autres créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Monica Rambeau // Photon, Living Light", "Bear Cub", ...lands("Plains", 3), ...lands("Mountain", 3)],
          hand: ["Burst Lightning"],
        },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const monica = idOf(s, "p1", "battlefield", "Monica Rambeau // Photon, Living Light");
      s = settle(activate(s, "p1", monica, {}, /Transformez/));
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [elves] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[monica]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Murdock's Crusade : un mode au choix ; les deux seulement avec le travail d'équipe", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Plains", "Plains", "Serra Angel"], hand: ["Murdock's Crusade"] },
          p2: { battlefield: ["Agents of S.H.I.E.L.D.", "Omniscience", "Bear Cub"] },
        });
      let s = setup();
      const agents = idOf(s, "p2", "battlefield", "Agents of S.H.I.E.L.D.");
      const omni = idOf(s, "p2", "battlefield", "Omniscience");
      const card = idOf(s, "p1", "hand", "Murdock's Crusade");
      // Les deux modes sans le travail d'équipe : refusé.
      expect(() => act(s, "p1", { type: "cast", card, mode: 2, targets: { t: [agents], u: [omni] } })).toThrow();
      // Une créature d'endurance 3 ou moins n'est pas une cible.
      expect(() =>
        act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      const one = settle(act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [agents] } }));
      expect(exiled(one, "Agents of S.H.I.E.L.D.")).toBe(true);
      expect(idsOf(one, "p2", "battlefield", "Omniscience")).toHaveLength(1);
      s = setup();
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card, mode: 2, targets: { t: [agents], u: [omni] }, kicked: true, tap: [angel] }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(exiled(s, "Agents of S.H.I.E.L.D.")).toBe(true);
      expect(exiled(s, "Omniscience")).toBe(true);
    });

    it("Nick Fury : montée en puissance, deux marqueurs puis un Héros des sept cartes du dessus sur le champ de bataille", () => {
      let s = scenario({
        p1: {
          battlefield: ["Nick Fury, Agent of S.H.I.E.L.D.", "Plains", "Island", "Swamp", "Mountain", "Forest"],
          library: ["Opt", "Opt", "Agents of S.H.I.E.L.D.", "Opt", "Opt", "Opt", "Opt", "Forest"],
        },
      });
      const fury = idOf(s, "p1", "battlefield", "Nick Fury, Agent of S.H.I.E.L.D.");
      s = settle(activate(s, "p1", fury));
      expect(s.objects[fury]?.counters["+1/+1"]).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      // Le reste au-dessous : la carte du dessus est désormais la Forêt (huitième).
      expect(s.defs[s.objects[s.players.p1?.library[0] as string]?.defId ?? ""]?.name).toBe("Forest");
    });

    it("Night Nurse : renvoie en main une carte de permanent mise dans votre cimetière ce tour-ci, pas une plus ancienne", () => {
      let s = scenario({
        p1: {
          battlefield: ["Plains", "Plains", "Bear Cub"],
          hand: ["Night Nurse, Healer of Heroes"],
          graveyard: ["Llanowar Elves"],
        },
        p2: { battlefield: [...lands("Mountain", 1)], hand: ["Burst Lightning"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Burst Lightning", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const oldElves = idOf(s, "p1", "graveyard", "Llanowar Elves");
      // Mise en scène : les Elfes sont au cimetière depuis un tour précédent.
      (s.objects[oldElves] as { controlledSince: number }).controlledSince = s.turn.number - 1;
      let offered: ChoiceValue[] = [];
      s = settle(cast(s, "p1", "Night Nurse, Healer of Heroes"), (req) => {
        if (req.type === "pick") offered = req.options;
        return undefined;
      });
      expect(offered).not.toContain(oldElves);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Okoye : deux Soldats 1/1 ; vos jetons de créature attaquants ont l'initiative, pas les autres", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Okoye, Dora Milaje Leader"] } });
      s = settle(cast(s, "p1", "Okoye, Dora Milaje Leader"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect(pt(s, soldiers[0] as string)).toEqual([1, 1]);
      expect(chars(s, soldiers[0] as string).keywords).not.toContain("firstStrike");
      // Au tour suivant de p1, un Soldat et l'Ours attaquent.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.pending?.kind === "declareAttackers");
      const [attacker, idle] = soldiers as [string, string];
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", {
          type: "declareAttackers",
          attackers: [
            { id: attacker, defender: "p2" },
            { id: bear, defender: "p2" },
          ],
        }),
      );
      expect(chars(s, attacker).keywords).toContain("firstStrike");
      expect(chars(s, idle).keywords).not.toContain("firstStrike");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("Origin of the Avengers : I regard 2 ; II un Héros de votre main de valeur de mana 3 ou moins, sinon piochez ; III +1/+1 partout", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Origin of the Avengers", counters: { lore: 1 } }, "Bear Cub"],
          hand: ["Agents of S.H.I.E.L.D."],
        },
        active: "p2",
        step: "end",
      });
      s = settle(
        advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"),
        picking([idOf(s, "p1", "hand", "Agents of S.H.I.E.L.D.")]),
      );
      expect(idsOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")).toHaveLength(1);
      // Pas de carte piochée en plus de la pioche du tour.
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
      s = settle(s);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Agents of S.H.I.E.L.D.")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Origin of the Avengers")).toHaveLength(1);
    });

    it("Origin of the Avengers : II sans Héros à mettre en jeu, piochez une carte", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Origin of the Avengers", counters: { lore: 1 } }], hand: ["Serra Angel"] },
        active: "p2",
        step: "end",
      });
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
      // La Serra Angel, la pioche du tour et la carte du chapitre II.
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Panther Pounce : le joueur ciblé enquête ; la créature gagne +1/+0 et le vol, et se dégage", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", { name: "Bear Cub", tapped: true }], hand: ["Panther Pounce"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Panther Pounce", { targets: { p: ["p2"], t: [bear] } }));
      expect(idsOf(s, "p2", "battlefield", "Clue")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Patriot : {2}, {T} : une autre de vos créatures gagne +2/+0 et la défense talismanique", () => {
      let s = scenario({ p1: { battlefield: ["Patriot, Shield Wielder", "Bear Cub", "Plains", "Plains"] } });
      const patriot = idOf(s, "p1", "battlefield", "Patriot, Shield Wielder");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(ability(s, "p1", patriot)?.targets[0]?.legal).toEqual([bear]);
      s = settle(activate(s, "p1", patriot, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(chars(s, bear).keywords).toContain("hexproof");
    });

    it("Quake : chaque sort non-créature engage une créature ou un terrain ciblé", () => {
      let s = scenario({
        p1: { battlefield: ["Quake, Agent of S.H.I.E.L.D.", "Forest", "Forest"], hand: ["Giant Growth", "Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const quake = idOf(s, "p1", "battlefield", "Quake, Agent of S.H.I.E.L.D.");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[angel]?.tapped).toBe(false);
      s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [quake] } }), picking([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Raft Security Officer : {1} pour une créature de force 3 ou moins, {2} sinon", () => {
      let s = scenario({
        p1: { battlefield: ["Raft Security Officer", "Plains"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const officer = idOf(s, "p1", "battlefield", "Raft Security Officer");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Un seul terrain : la Serra Angel (force 4) demande {2}.
      expect(() => activate(s, "p1", officer, { targets: { t: [angel] } }, /^Engage une créature$/)).toThrow();
      const legal = ability(s, "p1", officer, /force 3/)?.targets[0]?.legal ?? [];
      expect(legal).toContain(bear);
      expect(legal).not.toContain(angel);
      s = settle(activate(s, "p1", officer, { targets: { t: [bear] } }, /force 3/));
      expect(s.objects[bear]?.tapped).toBe(true);
    });

    it("Red Guardian : détruit une créature adverse qui a infligé des blessures ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3)], hand: ["Red Guardian, Super-Soldier"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        active: "p2",
      });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.turn.step === "endCombat" && x.pending?.player === "p1");
      expect(s.players.p1?.life).toBe(16);
      s = settle(cast(s, "p1", "Red Guardian, Super-Soldier"), picking([angel]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("The Sentry : l'adversaire ciblé crée The Void, Horreur Méchant légendaire 5/5 qui attaque à chaque combat", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["The Sentry, Golden Guardian"] } });
      s = settle(cast(s, "p1", "The Sentry, Golden Guardian"));
      const voidToken = idOf(s, "p2", "battlefield", "The Void");
      const c = chars(s, voidToken);
      expect([c.power, c.toughness, c.colors]).toEqual([5, 5, ["B"]]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Horror", "Villain"]));
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "indestructible", "mustAttack"]));
    });

    it("S.H.I.E.L.D. Spy Kit : +1/+1 ; la créature équipée qui attaque seule se dégage (et regard 1)", () => {
      let s = scenario({ p1: { battlefield: ["S.H.I.E.L.D. Spy Kit", "Bear Cub", "Plains"] } });
      const kit = idOf(s, "p1", "battlefield", "S.H.I.E.L.D. Spy Kit");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", kit, { targets: { t: [bear] } }, /Équiper/));
      expect(pt(s, bear)).toEqual([3, 3]);
      s = attack(s, [bear]);
      expect(s.objects[bear]?.tapped).toBe(true);
      s = settle(s);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Super Villain Lockup : exile une créature adverse engagée jusqu'à ce qu'il quitte le champ de bataille", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Super Villain Lockup"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
      });
      // Seule cible légale : la Serra Angel engagée (pas l'Ours dégagé).
      s = settle(cast(s, "p1", "Super Villain Lockup"));
      expect(exiled(s, "Serra Angel")).toBe(true);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Super-Soldier Serum : +2/+2, initiative, vigilance, Soldat légendaire ; en attaquant, attache vos Équipements", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Plains", "Bear Cub", "Goldvein Pick", "Swiftfoot Boots"], hand: ["Super-Soldier Serum"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super-Soldier Serum", { targets: { enchant: [bear] } }));
      const c = chars(s, bear);
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect(c.keywords).toEqual(expect.arrayContaining(["firstStrike", "vigilance"]));
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Soldier"]));
      const pick = idOf(s, "p1", "battlefield", "Goldvein Pick");
      const boots = idOf(s, "p1", "battlefield", "Swiftfoot Boots");
      s = settle(attack(s, [bear]), picking([pick, boots]));
      expect(s.objects[pick]?.attachedTo).toBe(bear);
      expect(s.objects[boots]?.attachedTo).toBe(bear);
      expect(chars(s, bear).keywords).toContain("hexproof");
    });

    it("Wakandan Drone Flock : regard 2 en arrivant", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Wakandan Drone Flock"], library: ["Opt", "Opt", "Forest"] },
      });
      let scried = false;
      s = settle(cast(s, "p1", "Wakandan Drone Flock"), (req) => {
        if (req.type === "pick" || req.type === "order") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Wakandan Drone Flock")).toHaveLength(1);
    });

    it("White Widow : un marqueur sur jusqu'à deux créatures, ou une carte d'artefact ou d'enchantement du cimetière en main", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["White Widow, Free Agent"], graveyard: ["Pacifism"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
      let s = setup();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "White Widow, Free Agent"), (req) => {
        if (req.type === "pick" && req.intent === "triggerMode") return ["0"];
        return picking([bear, elves])(req, "p1", s);
      });
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
      s = setup();
      s = settle(cast(s, "p1", "White Widow, Free Agent"), (req) =>
        req.type === "pick" && req.intent === "triggerMode" ? ["1"] : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Pacifism")).toHaveLength(1);
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Réponse qui choisit, parmi les options, les cartes portant ces noms. */
  const pickingNamed =
    (names: string[]): Answer =>
    (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => names.includes(nameOf(cur, String(o)) ?? ""));
      return picked.length > 0 ? picked : undefined;
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
  const plusOne = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  /** Va jusqu'à la déclaration des attaquants de p1 et attaque p2 avec ces créatures. */
  const attackWith = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  describe("Marvel Super Heroes, lot A — bleu", () => {
    describe("Aerial Doombot", () => {
      it("montée en puissance {5}{U} : trois marqueurs +1/+1, une seule fois", () => {
        let s = scenario({ p1: { battlefield: ["Aerial Doombot", ...lands("Island", 12)] } });
        const bot = idOf(s, "p1", "battlefield", "Aerial Doombot");
        s = settle(activate(s, "p1", bot));
        expect(pt(s, bot)).toEqual([4, 4]);
        expect(ability(s, "p1", bot)).toBeUndefined();
      });

      it("arrivé ce tour-ci, la montée en puissance coûte {5}", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Aerial Doombot"] } });
        s = settle(cast(s, "p1", "Aerial Doombot"));
        const bot = idOf(s, "p1", "battlefield", "Aerial Doombot");
        s = settle(activate(s, "p1", bot));
        expect(plusOne(s, bot)).toBe(3);
      });
    });

    it("A.I.M. Scientists : complote en arrivant (marqueur seulement pour une carte non-terrain défaussée)", () => {
      const run = (top: string) => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["A.I.M. Scientists"], library: [top, "Island"] } });
        s = settle(cast(s, "p1", "A.I.M. Scientists"));
        return { s, id: idOf(s, "p1", "battlefield", "A.I.M. Scientists") };
      };
      const opt = run("Opt");
      expect(idsOf(opt.s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(pt(opt.s, opt.id)).toEqual([4, 4]);
      const land = run("Island");
      expect(land.s.players.p1?.graveyard).toHaveLength(1);
      expect(pt(land.s, land.id)).toEqual([3, 3]);
    });

    describe("Thirst for Knowledge et Atlantean Cavalry", () => {
      it("piochez trois cartes, défaussez une carte d'artefact ; la Cavalerie reçoit un marqueur à la deuxième pioche", () => {
        let s = scenario({
          p1: {
            battlefield: ["Atlantean Cavalry", ...lands("Island", 3)],
            hand: ["Thirst for Knowledge"],
            library: ["Futurist Forge", "Opt", "Island", "Island"],
          },
        });
        s = settle(cast(s, "p1", "Thirst for Knowledge"), pickingNamed(["Futurist Forge"]));
        expect(handNames(s).sort()).toEqual(["Island", "Opt"]);
        expect(idsOf(s, "p1", "graveyard", "Futurist Forge")).toHaveLength(1);
        expect(pt(s, idOf(s, "p1", "battlefield", "Atlantean Cavalry"))).toEqual([4, 3]);
      });

      it("sans carte d'artefact défaussée, deux cartes", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Thirst for Knowledge"], library: ["Futurist Forge", "Opt", "Island"] },
        });
        s = settle(cast(s, "p1", "Thirst for Knowledge"), pickingNamed(["Opt"]));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(3);
      });
    });

    describe("Atlantis Attacks", () => {
      it("un mode : le joueur ciblé crée un Léviathan bleu 6/5 avec la défense talismanique", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Atlantis Attacks"] } });
        s = settle(cast(s, "p1", "Atlantis Attacks", { mode: 0, targets: { p: ["p2"] } }));
        const lev = idOf(s, "p2", "battlefield", "Leviathan");
        expect(pt(s, lev)).toEqual([6, 5]);
        expect(chars(s, lev).keywords).toContain("hexproof");
        expect(chars(s, lev).colors).toEqual(["U"]);
      });

      it("les deux modes demandent le travail d'équipe (créatures de force totale 4 engagées)", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 7), "Shivan Dragon"], hand: ["Atlantis Attacks"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
        expect(() => cast(s, "p1", "Atlantis Attacks", { mode: 2, targets: { p: ["p1"], b: [bear] } })).toThrow();
        s = settle(
          cast(s, "p1", "Atlantis Attacks", { mode: 2, kicked: true, tap: [dragon], targets: { p: ["p1"], b: [bear, angel] } }),
        );
        expect(s.objects[dragon]?.tapped).toBe(true);
        expect(idsOf(s, "p1", "battlefield", "Leviathan")).toHaveLength(1);
        expect(handNames(s, "p2").sort()).toEqual(["Bear Cub", "Serra Angel"]);
      });
    });

    it("Attuma : les autres Ondins ont +1/+1 ; des Ondins attaquent, piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Attuma, Atlantean Warlord", "Brineborn Cutthroat"] } });
      const attuma = idOf(s, "p1", "battlefield", "Attuma, Atlantean Warlord");
      const merfolk = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      expect(pt(s, attuma)).toEqual([3, 4]);
      expect(pt(s, merfolk)).toEqual([3, 2]);
      s = attackWith(s, [merfolk]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Bold Biochemist : montée en puissance, un marqueur +1/+1 et deux cartes", () => {
      let s = scenario({ p1: { battlefield: ["Bold Biochemist", ...lands("Island", 6)] } });
      const bio = idOf(s, "p1", "battlefield", "Bold Biochemist");
      s = settle(activate(s, "p1", bio));
      expect(pt(s, bio)).toEqual([2, 4]);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    describe("Bruce Banner // The Incredible Hulk", () => {
      it("{X}{X}, {T} : piochez X cartes", () => {
        let s = scenario({ p1: { battlefield: ["Bruce Banner // The Incredible Hulk", ...lands("Island", 4)] } });
        const bruce = idOf(s, "p1", "battlefield", "Bruce Banner // The Incredible Hulk");
        s = settle(activate(s, "p1", bruce, { x: 2 }, /Piochez/));
        expect(s.players.p1?.hand).toHaveLength(2);
        expect(s.objects[bruce]?.tapped).toBe(true);
      });

      it("Hulk : subit des blessures en attaquant, un marqueur +1/+1, il se dégage et un combat supplémentaire suit", () => {
        let s = scenario({
          p1: {
            battlefield: [
              "Bruce Banner // The Incredible Hulk",
              ...lands("Mountain", 2),
              ...lands("Forest", 2),
              ...lands("Island", 2),
            ],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
        const hulk = idOf(s, "p1", "battlefield", "Bruce Banner // The Incredible Hulk");
        s = settle(activate(s, "p1", hulk, {}, /Transformez/));
        expect(chars(s, hulk).name).toBe("The Incredible Hulk");
        expect(pt(s, hulk)).toEqual([8, 8]);
        expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
        s = attackWith(s, [hulk]);
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: hulk }] });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        expect(plusOne(s, hulk)).toBe(1);
        expect(s.objects[hulk]?.tapped).toBe(false);
        expect(s.turn.step).toBe("declareAttackers");
        // Piétinement : 4 blessures à l'Ange, 4 au joueur.
        expect(s.players.p2?.life).toBe(16);
      });
    });

    describe("Depower", () => {
      it("coûte {2} de moins en ciblant une créature attaquante : -4/-0 et piochez une carte", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Island"], hand: ["Depower"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
        s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        s = settle(cast(s, "p1", "Depower", { targets: { t: [angel] } }));
        expect(chars(s, angel).power).toBe(0);
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("sans attaquant ciblé, il coûte {2}{U}", () => {
        const s = scenario({ p1: { battlefield: ["Island"], hand: ["Depower"] }, p2: { battlefield: ["Serra Angel"] } });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "Depower", { targets: { t: [angel] } })).toThrow();
      });
    });

    it("Echo : {1}, {T} : copie une capacité déclenchée que vous contrôlez", () => {
      let s = scenario({
        p1: { battlefield: ["Echo, Perceptive Prodigy", ...lands("Island", 4)], hand: ["S.H.I.E.L.D. Deployment Drone"] },
      });
      const echo = idOf(s, "p1", "battlefield", "Echo, Perceptive Prodigy");
      s = cast(s, "p1", "S.H.I.E.L.D. Deployment Drone");
      s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability"));
      const trigger = s.stack.find((i) => i.kind === "ability")?.id as string;
      s = settle(activate(s, "p1", echo, { targets: { t: [trigger] } }));
      expect(idsOf(s, "p1", "battlefield", "Soldier")).toHaveLength(2);
    });

    it("Echo : ni la capacité d'un adversaire, ni celle d'une source non-créature ne peut être ciblée", () => {
      // Capacité déclenchée d'un adversaire.
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Echo, Perceptive Prodigy", ...lands("Island", 2)] },
        p2: { battlefield: lands("Island", 3), hand: ["S.H.I.E.L.D. Deployment Drone"] },
      });
      const echo = idOf(s, "p1", "battlefield", "Echo, Perceptive Prodigy");
      s = cast(s, "p2", "S.H.I.E.L.D. Deployment Drone");
      s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability") && x.pending?.player === "p1");
      const theirs = s.stack.find((i) => i.kind === "ability")?.id as string;
      expect(() => act(s, "p1", { type: "activate", source: echo, ability: 0, targets: { t: [theirs] } })).toThrow();
      // Capacité déclenchée que vous contrôlez, d'une source enchantement.
      let t = scenario({
        p1: {
          battlefield: ["Echo, Perceptive Prodigy", "Doom Reigns Supreme", ...lands("Swamp", 3)],
          hand: ["Agents of HYDRA"],
        },
      });
      t = cast(t, "p1", "Agents of HYDRA");
      t = passUntil(t, (x) => x.stack.some((i) => i.kind === "ability"));
      const doom = t.stack.find((i) => i.kind === "ability")?.id as string;
      expect(t.defs[t.stack.find((i) => i.id === doom)?.sourceDefId ?? ""]?.name).toBe("Doom Reigns Supreme");
      const echo2 = idOf(t, "p1", "battlefield", "Echo, Perceptive Prodigy");
      expect(() => act(t, "p1", { type: "activate", source: echo2, ability: 0, targets: { t: [doom] } })).toThrow();
    });

    it("Falcon : crée Redwing, Oiseau Éclaireur légendaire bleu 1/1 volant qui surveille en attaquant", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Falcon, Winged Wonder"] } });
      s = settle(cast(s, "p1", "Falcon, Winged Wonder"));
      const red = idOf(s, "p1", "battlefield", "Redwing");
      const c = chars(s, red);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Bird", "Scout"]));
      expect(c.keywords).toContain("flying");
      expect(c.abilities.some((a) => a.kind === "triggered" && a.trigger.on === "attacks")).toBe(true);
    });

    it("Falcon's Wing Harness : s'attache en arrivant ; +1/+1, vol et garde {1}", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 2)], hand: ["Falcon's Wing Harness"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Falcon's Wing Harness"), picking([bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Falcon's Wing Harness")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    });

    it("Frozen in Ice : engage la créature, qui perd ses capacités et ne se dégage plus", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Frozen in Ice"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Frozen in Ice", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(chars(s, angel).keywords).not.toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Futurist Forge : piochez en arrivant ; {3}{U}, sacrifiez-le : piochez deux cartes", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Futurist Forge"] } });
      s = settle(cast(s, "p1", "Futurist Forge"));
      expect(s.players.p1?.hand).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Futurist Forge")));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(idsOf(s, "p1", "graveyard", "Futurist Forge")).toHaveLength(1);
    });

    it("Giant-Sized Flying Ant : engage ou dégage un permanent non-terrain", () => {
      const run = (mode: number, tapped: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Island", 4), hand: ["Giant-Sized Flying Ant"] },
          p2: { battlefield: [{ name: "Serra Angel", tapped }] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Giant-Sized Flying Ant"), (req) => {
          if (req.type === "pick" && req.options.includes(angel)) return [angel];
          if (req.type === "pick" && req.intent === "triggerMode") return [String(mode)];
          return undefined;
        });
        return s.objects[angel]?.tapped;
      };
      expect(run(0, false)).toBe(true);
      expect(run(1, true)).toBe(false);
    });

    it("Hydraulic Helper : son mana ne paie pas un sort non-artefact", () => {
      const s = scenario({ p1: { battlefield: ["Hydraulic Helper", "Plains"], hand: ["Opt", "Futurist Forge"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Opt"))).toBe(false);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Futurist Forge"))).toBe(true);
    });

    it("I Am Iron Man : un artefact devient une créature-artefact 4/4 volante jusqu'à la fin du tour ; piochez", () => {
      let s = scenario({ p1: { battlefield: ["Futurist Forge", ...lands("Island", 3)], hand: ["I Am Iron Man"] } });
      const forge = idOf(s, "p1", "battlefield", "Futurist Forge");
      s = settle(cast(s, "p1", "I Am Iron Man", { targets: { t: [forge] } }));
      expect(chars(s, forge).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(pt(s, forge)).toEqual([4, 4]);
      expect(chars(s, forge).keywords).toContain("flying");
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, forge).types).not.toContain("Creature");
    });

    it("Iron Lad : {T} : révélez la carte du dessus, piochez si c'est un artefact", () => {
      const run = (top: string) => {
        let s = scenario({ p1: { battlefield: ["Iron Lad, Diverging Destiny"], library: [top, "Island"] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Iron Lad, Diverging Destiny")));
        return handNames(s);
      };
      expect(run("Futurist Forge")).toEqual(["Futurist Forge"]);
      expect(run("Opt")).toEqual([]);
    });

    describe("Justice, Vance Astrovik", () => {
      it("renvoie un de vos permanents : un marqueur +1/+1 sur Justice", () => {
        let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Justice, Vance Astrovik"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Justice, Vance Astrovik"), picking([bear]));
        expect(handNames(s)).toEqual(["Bear Cub"]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Justice, Vance Astrovik"))).toEqual([3, 3]);
      });

      it("un permanent adverse renvoyé ne donne pas de marqueur", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Justice, Vance Astrovik"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Justice, Vance Astrovik"), picking([bear]));
        expect(handNames(s, "p2")).toEqual(["Bear Cub"]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Justice, Vance Astrovik"))).toEqual([2, 2]);
      });
    });

    it("Kang the Conqueror : montée en puissance, un marqueur +1/+1 et un tour supplémentaire", () => {
      let s = scenario({ p1: { battlefield: ["Kang the Conqueror", ...lands("Island", 8)] } });
      const kang = idOf(s, "p1", "battlefield", "Kang the Conqueror");
      s = settle(activate(s, "p1", kang));
      expect(pt(s, kang)).toEqual([5, 6]);
      s = advanceUntil(s, (x) => x.turn.number === 4);
      expect(s.turn.active).toBe("p1");
    });

    it("Mister Fantastic : des jetons arrivent sous votre contrôle, vous pouvez piocher", () => {
      let s = scenario({
        p1: { battlefield: ["Mister Fantastic, Reed Richards", ...lands("Island", 3)], hand: ["S.H.I.E.L.D. Deployment Drone"] },
      });
      s = settle(cast(s, "p1", "S.H.I.E.L.D. Deployment Drone"), (req) =>
        req.type === "pick" && req.options.includes("yes") ? ["yes"] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Soldier")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Ms. Marvel et Pym Particles : un sort qui cible votre créature fait piocher ; force de base = cartes en main", () => {
      let s = scenario({
        p1: { battlefield: ["Ms. Marvel, Kamala Khan", "Island"], hand: ["Pym Particles", "Island", "Island"] },
      });
      const ms = idOf(s, "p1", "battlefield", "Ms. Marvel, Kamala Khan");
      expect(pt(s, ms)).toEqual([1, 4]);
      s = settle(cast(s, "p1", "Pym Particles", { targets: { t: [ms] } }));
      // Deux cartes en main, une piochée par Ms. Marvel, une par Pym Particles.
      expect(s.players.p1?.hand).toHaveLength(4);
      expect(pt(s, ms)).toEqual([4, 4]);
      expect(chars(s, ms).keywords).toEqual(expect.arrayContaining(["unblockable", "vigilance"]));
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
      expect(pt(s, ms)).toEqual([3, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, ms)).toEqual([1, 4]);
    });

    it("Multiversal Incursion : une copie non légendaire de chacune de vos créatures qui ne sont pas des jetons", () => {
      let s = scenario({
        p1: { battlefield: ["Kang the Conqueror", "Bear Cub", ...lands("Island", 7)], hand: ["Multiversal Incursion"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Multiversal Incursion"));
      const kangs = idsOf(s, "p1", "battlefield", "Kang the Conqueror");
      expect(kangs).toHaveLength(2);
      const copy = kangs.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    });

    describe("Rewrite History", () => {
      it("vos créatures deviennent engagées : piochez, défaussez et un marqueur de plan", () => {
        let s = scenario({ p1: { battlefield: ["Rewrite History", "Bear Cub"], library: ["Opt", "Island"] } });
        const plan = idOf(s, "p1", "battlefield", "Rewrite History");
        s = attackWith(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = settle(s);
        expect(s.objects[plan]?.counters.plan).toBe(1);
        expect(s.players.p1?.graveyard).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(0);
      });

      it("au quatrième marqueur : sacrifiez-le, reprenez jusqu'à deux éphémères ou rituels", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Rewrite History", counters: { plan: 3 } }, "Bear Cub"],
            graveyard: ["Opt", "Lightning Strike", "Bear Cub"],
            library: ["Island", "Island"],
          },
        });
        s = attackWith(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = settle(s, pickingNamed(["Opt", "Lightning Strike"]));
        expect(idsOf(s, "p1", "graveyard", "Rewrite History")).toHaveLength(1);
        expect(handNames(s).sort()).toEqual(["Lightning Strike", "Opt"]);
      });
    });

    it("Secret Invasion : exile une autre créature ; la créature enchantée en devient une copie, avec la garde {2}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Secret Invasion"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Secret Invasion", { targets: { enchant: [bear] } }), picking([angel]));
      expect(s.objects[angel]?.zone ?? "exile").not.toBe("battlefield");
      expect(chars(s, bear).name).toBe("Serra Angel");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    });

    it("S.H.I.E.L.D. Flying Car : exile une de vos créatures, qui revient à la prochaine étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["S.H.I.E.L.D. Flying Car"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "S.H.I.E.L.D. Flying Car"), picking([bear]));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    describe("Shuri, Wakandan Inventor", () => {
      it("vos sorts d'artefact coûtent {1} de moins", () => {
        const s = scenario({ p1: { battlefield: ["Shuri, Wakandan Inventor", "Island"], hand: ["Futurist Forge", "Opt"] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Futurist Forge"))).toBe(true);
      });

      it("un artefact devient une copie non légendaire d'un second artefact jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["Shuri, Wakandan Inventor", "Futurist Forge", "Iron Lad, Diverging Destiny", "Island"] },
        });
        const forge = idOf(s, "p1", "battlefield", "Futurist Forge");
        const lad = idOf(s, "p1", "battlefield", "Iron Lad, Diverging Destiny");
        s = settle(
          activate(s, "p1", idOf(s, "p1", "battlefield", "Shuri, Wakandan Inventor"), { targets: { a: [forge], b: [lad] } }),
        );
        expect(chars(s, forge).name).toBe("Iron Lad, Diverging Destiny");
        expect(chars(s, forge).supertypes).not.toContain("Legendary");
        expect(s.objects[lad]?.zone).toBe("battlefield");
        expect(s.objects[forge]?.zone).toBe("battlefield");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, forge).name).toBe("Futurist Forge");
      });
    });

    it("Stature : imblocable avec une force de 1 ou moins ; montée en puissance de X marqueurs", () => {
      let s = scenario({ p1: { battlefield: ["Stature, Size Shifter", ...lands("Island", 4)] } });
      const st = idOf(s, "p1", "battlefield", "Stature, Size Shifter");
      expect(chars(s, st).keywords).toContain("unblockable");
      s = settle(activate(s, "p1", st, { x: 2 }));
      expect(pt(s, st)).toEqual([3, 3]);
      expect(chars(s, st).keywords).not.toContain("unblockable");
    });

    it("Super Intelligence à plusieurs : seulement à l'entretien du contrôleur de la créature, pas des autres adversaires (PLAN-H, H2)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Island"], hand: ["Super Intelligence"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Intelligence", { targets: { enchant: [bear] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.players.p2?.hand).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p3" && x.turn.step === "main1");
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(s.players.p3?.hand).toHaveLength(1);
      // La créature passe sous le contrôle de p3 : c'est désormais à son entretien que p3 pioche.
      steal(s, bear, "p3");
      s = advanceUntil(s, (x) => x.turn.active === "p3" && x.turn.step === "main1" && x.turn.number > 5);
      expect(s.players.p3?.hand).toHaveLength(3);
      expect(s.players.p2?.hand).toHaveLength(3);
    });

    it("Super Intelligence : le contrôleur de la créature enchantée pioche à son entretien", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Super Intelligence"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Intelligence", { targets: { enchant: [bear] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.players.p2?.hand).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Super Suit : s'attache à une de vos créatures et la dégage ; +1/+2", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Island", 2)], hand: ["Super Suit"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Suit"), picking([bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Super Suit")]?.attachedTo).toBe(bear);
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(pt(s, bear)).toEqual([3, 4]);
    });

    describe("Tony Stark // The Invincible Iron Man", () => {
      it("{1}, {T} : une carte d'artefact parmi les quatre du dessus en main, le reste au-dessous", () => {
        let s = scenario({
          p1: {
            battlefield: ["Tony Stark // The Invincible Iron Man", "Island"],
            library: ["Island", "Futurist Forge", "Opt", "Island", "Lightning Strike"],
          },
        });
        s = settle(
          activate(s, "p1", idOf(s, "p1", "battlefield", "Tony Stark // The Invincible Iron Man"), {}, /Regardez/),
          pickingNamed(["Futurist Forge"]),
        );
        expect(handNames(s)).toEqual(["Futurist Forge"]);
        const lib = s.players.p1?.library ?? [];
        expect(nameOf(s, lib[0] as string)).toBe("Lightning Strike");
      });

      it("Iron Man : au début du combat, un artefact de votre main sur le champ de bataille ; un Équipement lui est attaché", () => {
        let s = scenario({
          p1: {
            battlefield: ["Tony Stark // The Invincible Iron Man", ...lands("Island", 5), "Mountain"],
            hand: ["Super Suit"],
          },
        });
        const tony = idOf(s, "p1", "battlefield", "Tony Stark // The Invincible Iron Man");
        s = settle(activate(s, "p1", tony, {}, /Transformez/));
        expect(chars(s, tony).name).toBe("The Invincible Iron Man");
        expect(chars(s, tony).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(chars(s, tony).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers", 200);
        const suit = idOf(s, "p1", "battlefield", "Super Suit");
        expect(s.objects[suit]?.attachedTo).toBe(tony);
        expect(pt(s, tony)).toEqual([6, 7]);
      });
    });

    it("Wiccan : un sort non-créature exile un autre permanent non-terrain, qui revient à l'étape de fin", () => {
      let s = scenario({
        p1: { battlefield: ["Wiccan, Rising Magician", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Opt"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Répond oui aux questions et choisit les objets voulus (par identifiant ou par nom) quand ils sont proposés. */
  const answering =
    (want: string[] = [], yes = true): Answer =>
    (req, _player, cur) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => want.includes(o) || want.includes(nameOf(cur, o) ?? ""));
      return picked.length > 0 ? picked.slice(0, Math.max(1, req.max)) : undefined;
    };
  const castOption = (s: S, player: string, card: string) =>
    legalActions(s, player).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
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
  /** Déclare les attaquants contre p2, puis résout les déclenchements d'attaque. */
  const attackWith = (s: S, ids: string[], answer?: Answer) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };

  describe("Marvel Super Heroes, lot A — noir", () => {
    it("Agents of HYDRA : en mourant, un jeton Méchant 2/1 noir avec la menace", () => {
      let s = scenario({ p1: { battlefield: ["Agents of HYDRA", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      const agents = idOf(s, "p1", "battlefield", "Agents of HYDRA");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [agents] } }));
      expect(idsOf(s, "p1", "graveyard", "Agents of HYDRA")).toHaveLength(1);
      const token = idOf(s, "p1", "battlefield", "Villain");
      const c = chars(s, token);
      expect([c.power, c.toughness]).toEqual([2, 1]);
      expect(c.colors).toEqual(["B"]);
      expect(c.subtypes).toContain("Villain");
      expect(c.keywords).toContain("menace");
    });

    it("Arnim Zola : {3}, {T} : un Méchant engagé, seulement avec deux cartes de créature au cimetière", () => {
      const one = scenario({ p1: { battlefield: ["Arnim Zola, Bio-Fanatic", ...lands("Swamp", 3)], graveyard: ["Bear Cub"] } });
      expect(ability(one, "p1", idOf(one, "p1", "battlefield", "Arnim Zola, Bio-Fanatic"))).toBeUndefined();
      let s = scenario({
        p1: { battlefield: ["Arnim Zola, Bio-Fanatic", ...lands("Swamp", 3)], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Arnim Zola, Bio-Fanatic")));
      expect(s.objects[idOf(s, "p1", "battlefield", "Villain")]?.tapped).toBe(true);
    });

    it("Baron Strucker : les sorts de Méchant coûtent {1} de moins ; un autre Méchant arrivé peut comploter, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Baron Strucker, HYDRA Overlord", ...lands("Swamp", 2)],
          hand: ["Agents of HYDRA", "Agents of HYDRA"],
          library: ["Opt", "Forest", "Forest"],
        },
      });
      let asked = 0;
      const answer: Answer = (req, p, cur) => {
        if (req.type === "yesNo") asked++;
        return answering(["Opt"])(req, p, cur);
      };
      // {1}{B} − {1} : un seul Marais suffit pour chacun.
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      const first = idOf(s, "p1", "battlefield", "Agents of HYDRA");
      expect(s.objects[first]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      expect(idsOf(s, "p1", "battlefield", "Agents of HYDRA")).toHaveLength(2);
      expect(asked).toBe(1);
    });

    it("Baron Strucker : une connivence refusée ne compte pas ; le Méchant suivant peut encore comploter", () => {
      let s = scenario({
        p1: {
          battlefield: ["Baron Strucker, HYDRA Overlord", ...lands("Swamp", 3)],
          hand: ["Agents of HYDRA", "Agents of HYDRA", "Agents of HYDRA"],
          library: ["Opt", "Forest", "Forest", "Forest"],
        },
      });
      let asked = 0;
      // Refusée la première fois, acceptée la deuxième.
      const answer: Answer = (req, p, cur) => {
        if (req.type === "yesNo") return [asked++ === 0 ? 0 : 1];
        return answering(["Opt"])(req, p, cur);
      };
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      expect(asked).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      expect(asked).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      // La connivence a été faite : plus de proposition ce tour-ci.
      s = settle(cast(s, "p1", "Agents of HYDRA"), answer);
      expect(asked).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Agents of HYDRA")).toHaveLength(3);
    });

    it("Construct a Cosmic Cube : deuxième carte piochée, un Méchant et un marqueur de plan ; au septième, vous contrôlez un adversaire", () => {
      let s = scenario({
        p1: {
          battlefield: ["Construct a Cosmic Cube", ...lands("Swamp", 6)],
          hand: ["Visions of Villainy", "Visions of Villainy"],
        },
      });
      const cube = idOf(s, "p1", "battlefield", "Construct a Cosmic Cube");
      s = settle(cast(s, "p1", "Visions of Villainy"));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(1);
      expect(s.objects[cube]?.counters.plan).toBe(1);
      expect(s.turnControl).toBeUndefined();
      setCounters(s, cube, "plan", 6);
      // Le tour suivant : les deux premières cartes piochées (l'étape de pioche, puis Visions).
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(cast(s, "p1", "Visions of Villainy"));
      expect(idsOf(s, "p1", "graveyard", "Construct a Cosmic Cube")).toHaveLength(1);
      expect(s.turnControl).toMatchObject({ player: "p2", by: "p1" });
    });

    it("Construct a Cosmic Cube : s'il n'est plus là pour être sacrifié, « quand vous le faites » ne se déclenche pas", () => {
      let s = scenario({
        p1: { battlefield: ["Construct a Cosmic Cube", ...lands("Swamp", 3)], hand: ["Visions of Villainy"] },
      });
      const cube = idOf(s, "p1", "battlefield", "Construct a Cosmic Cube");
      setCounters(s, cube, "plan", 6);
      // Visions fait piocher la deuxième carte : la capacité du septième marqueur va sur la pile ; le Cube est détruit
      // avant qu'elle se résolve.
      s = cast(s, "p1", "Visions of Villainy");
      s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability" && i.sourceId === cube && i.abilityIndex === 1));
      destroy(s, cube);
      s = settle(s);
      expect(idsOf(s, "p1", "graveyard", "Construct a Cosmic Cube")).toHaveLength(1);
      expect(s.turnControl).toBeUndefined();
    });

    it("Crossbones : un autre Méchant arrivé, un marqueur +1/+1 et 2 blessures à chaque adversaire, une fois par tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Crossbones, Malicious Mercenary", ...lands("Swamp", 4)],
          hand: ["Agents of HYDRA", "Agents of HYDRA"],
        },
      });
      const crossbones = idOf(s, "p1", "battlefield", "Crossbones, Malicious Mercenary");
      expect(chars(s, crossbones).keywords).toContain("deathtouch");
      s = settle(cast(s, "p1", "Agents of HYDRA"));
      expect(s.objects[crossbones]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(18);
      s = settle(cast(s, "p1", "Agents of HYDRA"));
      expect(s.objects[crossbones]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(18);
    });

    describe("Cruel Alliance", () => {
      it("sans travail d'équipe : seulement une créature de VM 3 ou moins ; avec : n'importe laquelle, et 3 PV", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Cruel Alliance"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const theirBear = idOf(s, "p2", "battlefield", "Bear Cub");
        const myBear = idOf(s, "p1", "battlefield", "Bear Cub");
        const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Cruel Alliance"));
        const t = opt?.modes[0]?.targets[0];
        expect(t?.legal).toContain(theirBear);
        expect(t?.legal).not.toContain(angel);
        expect(t?.kickedLegal).toContain(angel);
        s = settle(cast(s, "p1", "Cruel Alliance", { kicked: true, tap: [myBear], targets: { t: [angel] } }));
        expect(exiled(s, "Serra Angel")).toHaveLength(1);
        expect(s.objects[myBear]?.tapped).toBe(true);
        expect(s.players.p1?.life).toBe(23);
      });

      it("sans travail d'équipe, pas de PV", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Cruel Alliance"] }, p2: { battlefield: ["Bear Cub"] } });
        s = settle(cast(s, "p1", "Cruel Alliance", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
        expect(exiled(s, "Bear Cub")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Dark Deed : −4/−4 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Dark Deed", "Dark Deed"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Dark Deed", { targets: { t: [dragon] } }));
      expect(pt(s, dragon)).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, dragon)).toEqual([5, 5]);
    });

    it("Decoy Ploy, les deux modes : un Méchant et un Héros de votre cimetière reviennent en main", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 2),
          hand: ["Decoy Ploy"],
          graveyard: ["Agents of HYDRA", "Ronin, Shadow Stalker", "Bear Cub"],
        },
      });
      const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Decoy Ploy"));
      expect(opt?.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Agents of HYDRA")]);
      expect(opt?.modes[1]?.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Ronin, Shadow Stalker")]);
      s = settle(
        cast(s, "p1", "Decoy Ploy", {
          mode: 2,
          targets: {
            v: [idOf(s, "p1", "graveyard", "Agents of HYDRA")],
            h: [idOf(s, "p1", "graveyard", "Ronin, Shadow Stalker")],
          },
        }),
      );
      expect(handNames(s).sort()).toEqual(["Agents of HYDRA", "Ronin, Shadow Stalker"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Doom Reigns Supreme", () => {
      it("un Méchant arrivé : chaque adversaire perd 1 PV, vous gagnez 1 PV, un marqueur de plan", () => {
        let s = scenario({ p1: { battlefield: ["Doom Reigns Supreme", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] } });
        s = settle(cast(s, "p1", "Agents of HYDRA"));
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(21);
        expect(s.objects[idOf(s, "p1", "battlefield", "Doom Reigns Supreme")]?.counters.plan).toBe(1);
      });

      it("au cinquième marqueur : sacrifiée ; l'adversaire exile cinq cartes, vous en lancez jusqu'à deux gratuitement", () => {
        let s = scenario({
          p1: { battlefield: ["Doom Reigns Supreme", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] },
          p2: { library: ["Bear Cub", "Forest", "Serra Angel", "Island", "Opt", "Plains"] },
        });
        setCounters(s, idOf(s, "p1", "battlefield", "Doom Reigns Supreme"), "plan", 4);
        s = untilCastNow(cast(s, "p1", "Agents of HYDRA"));
        expect(idsOf(s, "p1", "graveyard", "Doom Reigns Supreme")).toHaveLength(1);
        const first = castNowOf(s)?.cards ?? [];
        expect(first.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt", "Serra Angel"]);
        const bear = first.find((id) => nameOf(s, id) === "Bear Cub") as string;
        s = untilCastNow(act(s, "p1", { type: "cast", card: bear, free: true }));
        const second = castNowOf(s)?.cards ?? [];
        expect(second.map((id) => nameOf(s, id)).sort()).toEqual(["Opt", "Serra Angel"]);
        const angel = second.find((id) => nameOf(s, id) === "Serra Angel") as string;
        s = settle(act(s, "p1", { type: "cast", card: angel, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(exiled(s, "Opt")).toHaveLength(1);
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
      });

      it("au cinquième marqueur, si elle n'est plus là pour être sacrifiée, rien n'est exilé", () => {
        let s = scenario({
          p1: { battlefield: ["Doom Reigns Supreme", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] },
          p2: { library: ["Bear Cub", "Forest", "Serra Angel", "Island", "Opt", "Plains"] },
        });
        const doom = idOf(s, "p1", "battlefield", "Doom Reigns Supreme");
        setCounters(s, doom, "plan", 4);
        s = cast(s, "p1", "Agents of HYDRA");
        s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability" && i.sourceId === doom && i.abilityIndex === 1));
        destroy(s, doom);
        s = settle(s);
        expect(idsOf(s, "p1", "graveyard", "Doom Reigns Supreme")).toHaveLength(1);
        expect(castNowOf(s)).toBeUndefined();
        expect(s.players.p2?.library).toHaveLength(6);
      });
    });

    it("Elektra : en arrivant, détruit une créature adverse de force 3 ou moins", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Elektra, Daughter of the Hand"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(chars(s, angel).power).toBe(4);
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Elektra, Daughter of the Hand"), (req) => {
        if (req.type !== "pick") return undefined;
        offered = req.options;
        return req.options.includes(bear) ? [bear] : undefined;
      });
      expect(offered).not.toContain(angel);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Grim Reaper : en attaquant, payez {3}{B} : une créature du cimetière revient engagée et attaquante, avec un marqueur de finalité", () => {
      let s = scenario({
        p1: { battlefield: ["Grim Reaper, Lethal Legionnaire", ...lands("Swamp", 4)], graveyard: ["Serra Angel"] },
      });
      const reaper = idOf(s, "p1", "battlefield", "Grim Reaper, Lethal Legionnaire");
      s = attackWith(s, [reaper], answering(["Serra Angel"]));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.finality).toBe(1);
      expect(s.combat?.attackers.some((a) => a.id === angel)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      // Grim Reaper (3) et Serra Angel (4).
      expect(s.players.p2?.life).toBe(13);
    });

    it("Hour of Defeat : détruit une créature, puis surveillance 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Hour of Defeat"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(
        cast(s, "p1", "Hour of Defeat", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        (req, _p, cur) => (req.intent === "surveilGraveyard" ? answering(["Opt"])(req, _p, cur) : undefined),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    describe("HYDRA Infiltration", () => {
      it("en arrivant, un adversaire défausse deux cartes", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["HYDRA Infiltration"] },
          p2: { hand: ["Opt", "Island", "Forest"] },
        });
        s = settle(cast(s, "p1", "HYDRA Infiltration"));
        expect(s.players.p2?.hand).toHaveLength(1);
        expect(s.players.p2?.graveyard).toHaveLength(2);
      });

      it("une créature qui attaque seule : un adversaire perd 1 PV et vous gagnez 1 PV", () => {
        let s = scenario({ p1: { battlefield: ["HYDRA Infiltration", "Bear Cub", "Bear Cub"] } });
        const [bear] = idsOf(s, "p1", "battlefield", "Bear Cub");
        s = attackWith(s, [bear as string]);
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(21);
        let t = scenario({ p1: { battlefield: ["HYDRA Infiltration", "Bear Cub", "Bear Cub"] } });
        t = attackWith(t, idsOf(t, "p1", "battlefield", "Bear Cub"));
        expect(t.players.p2?.life).toBe(20);
      });
    });

    it("HYDRA Troopers : un Méchant engagé avec deux cartes de créature au cimetière, sinon meulez deux cartes", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["HYDRA Troopers"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "HYDRA Troopers"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Villain")]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["HYDRA Troopers"], graveyard: ["Bear Cub"] } });
      t = settle(cast(t, "p1", "HYDRA Troopers"));
      expect(idsOf(t, "p1", "battlefield", "Villain")).toHaveLength(0);
      expect(t.players.p1?.graveyard).toHaveLength(3);
    });

    it("Kingpin's Enforcers : {2}{B}, sacrifiez un artefact ou une créature : piochez une carte", () => {
      let s = scenario({ p1: { battlefield: ["Kingpin's Enforcers", "Bear Cub", ...lands("Swamp", 3)] } });
      const enforcers = idOf(s, "p1", "battlefield", "Kingpin's Enforcers");
      expect(chars(s, enforcers).keywords).toContain("lifelink");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(ability(s, "p1", enforcers)?.additional?.sacrifice?.options).toContain(bear);
      s = settle(activate(s, "p1", enforcers, { sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    describe("Madame Masque", () => {
      it("en arrivant, elle complote", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Madame Masque"], library: ["Opt", "Forest"] } });
        s = settle(cast(s, "p1", "Madame Masque"), answering(["Opt"]));
        expect(s.objects[idOf(s, "p1", "battlefield", "Madame Masque")]?.counters["+1/+1"]).toBe(1);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });

      it("deuxième carte piochée : un Méchant 2/1", () => {
        let s = scenario({ p1: { battlefield: ["Madame Masque", ...lands("Swamp", 2)], hand: ["Visions of Villainy"] } });
        s = settle(cast(s, "p1", "Visions of Villainy"));
        expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(1);
      });
    });

    describe("The Masters of Evil", () => {
      it("les autres Méchants que vous contrôlez ont +2/+1", () => {
        const s = scenario({ p1: { battlefield: ["The Masters of Evil", "Agents of HYDRA", "Bear Cub"] } });
        expect(pt(s, idOf(s, "p1", "battlefield", "Agents of HYDRA"))).toEqual([3, 2]);
        expect(pt(s, idOf(s, "p1", "battlefield", "The Masters of Evil"))).toEqual([5, 6]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      });

      it("{1}{B}, défaussez-la : cherchez une carte de Plan", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Swamp", 2),
            hand: ["The Masters of Evil"],
            library: ["Forest", "Construct a Cosmic Cube", "Forest"],
          },
        });
        s = settle(activate(s, "p1", idOf(s, "p1", "hand", "The Masters of Evil")));
        expect(handNames(s)).toEqual(["Construct a Cosmic Cube"]);
        expect(idsOf(s, "p1", "graveyard", "The Masters of Evil")).toHaveLength(1);
      });
    });

    it("Moonstone : une carte défaussée peut être exilée et jouée jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: {
          battlefield: ["Moonstone, Harsh Mistress", ...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Red Room Recruit"],
          library: ["Bear Cub", "Forest", "Forest", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Red Room Recruit"), answering(["Bear Cub"]));
      const bear = exiled(s, "Bear Cub")[0] as string;
      expect(bear).toBeDefined();
      expect(castOption(s, "p1", bear)).toBeDefined();
      // Toujours jouable pendant votre prochain tour.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(castOption(s, "p1", bear)).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Ninja of the Hand : montée en puissance, chaque adversaire défausse et un marqueur +1/+1, une seule fois", () => {
      let s = scenario({ p1: { battlefield: ["Ninja of the Hand", ...lands("Swamp", 10)] }, p2: { hand: ["Opt", "Island"] } });
      const ninja = idOf(s, "p1", "battlefield", "Ninja of the Hand");
      expect(chars(s, ninja).keywords).toContain("deathtouch");
      s = settle(activate(s, "p1", ninja));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.objects[ninja]?.counters["+1/+1"]).toBe(1);
      expect(ability(s, "p1", ninja)).toBeUndefined();
    });

    it("Project Deathlok Soldier : {2}{B} : revient du cimetière en main", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), graveyard: ["Project Deathlok Soldier"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Project Deathlok Soldier")));
      expect(handNames(s)).toEqual(["Project Deathlok Soldier"]);
    });

    describe("Robot Domination", () => {
      it("des cartes de créature mises dans votre cimetière : piochez, perdez 1 PV, un marqueur de plan ; au troisième, trois Robots", () => {
        let s = scenario({
          p1: { battlefield: ["Robot Domination", "Bear Cub", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        });
        const plan = idOf(s, "p1", "battlefield", "Robot Domination");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.life).toBe(19);
        expect(s.objects[plan]?.counters.plan).toBe(1);
        // Une carte de créature défaussée compte aussi (« depuis n'importe où ») ; au troisième marqueur, trois Robots.
        let t = scenario({
          p1: {
            battlefield: ["Robot Domination", ...lands("Swamp", 2)],
            hand: ["Red Room Recruit"],
            library: ["Bear Cub", "Forest", "Forest"],
          },
        });
        setCounters(t, idOf(t, "p1", "battlefield", "Robot Domination"), "plan", 2);
        t = settle(cast(t, "p1", "Red Room Recruit"), answering(["Bear Cub"]));
        expect(idsOf(t, "p1", "graveyard", "Robot Domination")).toHaveLength(1);
        const robots = idsOf(t, "p1", "battlefield", "Robot Villain");
        expect(robots).toHaveLength(3);
        expect(pt(t, robots[0] as string)).toEqual([2, 2]);
        expect(chars(t, robots[0] as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      });
    });

    it("Robot Domination : un jeton de créature mort ne compte pas (ce n'est pas une carte)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Robot Domination", "Agents of HYDRA", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const plan = idOf(s, "p1", "battlefield", "Robot Domination");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Agents of HYDRA")] } }));
      expect(s.objects[plan]?.counters.plan).toBe(1);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Villain")] } }));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(0);
      expect(s.objects[plan]?.counters.plan).toBe(1);
    });

    describe("Ronin, Shadow Stalker", () => {
      it("payez 2 PV : deux mana d'une couleur, seulement pour un sort d'Équipement", () => {
        const s = scenario({ p1: { battlefield: ["Ronin, Shadow Stalker"], hand: ["Stolen Stark Tech", "Dark Deed"] } });
        expect(castOption(s, "p1", idOf(s, "p1", "hand", "Stolen Stark Tech"))).toBeDefined();
        expect(castOption(s, "p1", idOf(s, "p1", "hand", "Dark Deed"))).toBeUndefined();
        const ronin = idOf(s, "p1", "battlefield", "Ronin, Shadow Stalker");
        const t = settle(cast(s, "p1", "Stolen Stark Tech"), answering([ronin]));
        expect(t.players.p1?.life).toBe(18);
        expect(t.objects[idOf(t, "p1", "battlefield", "Stolen Stark Tech")]?.attachedTo).toBe(ronin);
      });

      it("son mana paie « Équiper », pas une autre capacité d'un Équipement", () => {
        let s = scenario({ p1: { battlefield: ["Ronin, Shadow Stalker", "Iron Man Armor"] } });
        const ronin = idOf(s, "p1", "battlefield", "Ronin, Shadow Stalker");
        const armor = idOf(s, "p1", "battlefield", "Iron Man Armor");
        // Iron Man Armor : « {2} : … devient une créature » ne se paie pas avec le mana de Ronin.
        const labels = legalActions(s, "p1")
          .filter((a) => a.type === "activate" && a.source === armor)
          .map((a) => (a.type === "activate" ? a.label : ""));
        expect(labels).toEqual([expect.stringMatching(/Équiper/)]);
        s = settle(activate(s, "p1", armor, { targets: { t: [ronin] } }, /Équiper/));
        expect(s.objects[armor]?.attachedTo).toBe(ronin);
        expect(s.players.p1?.life).toBe(18);
      });

      it("{T}, sacrifiez un Équipement attaché à Ronin : une créature ciblée a −4/−4", () => {
        let s = scenario({
          p1: { battlefield: ["Ronin, Shadow Stalker", "Stolen Stark Tech", "Stolen Stark Tech"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const ronin = idOf(s, "p1", "battlefield", "Ronin, Shadow Stalker");
        const [onRonin, loose] = idsOf(s, "p1", "battlefield", "Stolen Stark Tech") as [string, string];
        (s.objects[onRonin] as { attachedTo?: string }).attachedTo = ronin;
        s.version += 1;
        const opt = ability(s, "p1", ronin, /−4/);
        expect(opt?.additional?.sacrifice?.options).toEqual([onRonin]);
        expect(opt?.additional?.sacrifice?.options).not.toContain(loose);
        s = settle(
          activate(s, "p1", ronin, { sacrifice: [onRonin], targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }, /−4/),
        );
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[ronin]?.tapped).toBe(true);
      });
    });

    it("Roxxon Brutes : deuxième carte piochée, un marqueur +1/+1 sur une créature ciblée", () => {
      let s = scenario({ p1: { battlefield: ["Roxxon Brutes", ...lands("Swamp", 2)], hand: ["Visions of Villainy"] } });
      const brutes = idOf(s, "p1", "battlefield", "Roxxon Brutes");
      expect(chars(s, brutes).keywords).toContain("menace");
      s = settle(cast(s, "p1", "Visions of Villainy"), answering([brutes]));
      expect(s.objects[brutes]?.counters["+1/+1"]).toBe(1);
    });

    it("Stolen Stark Tech : flash ; s'attache en arrivant, la créature gagne l'indestructible ce tour-ci ; +1/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Stolen Stark Tech"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Stolen Stark Tech"), answering([bear]));
      const tech = idOf(s, "p1", "battlefield", "Stolen Stark Tech");
      expect(chars(s, tech).keywords).toContain("flash");
      expect(s.objects[tech]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("indestructible");
      expect(ability(s, "p1", tech, /Équiper/)).toBeDefined();
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      expect(pt(s, bear)).toEqual([3, 2]);
    });

    it("Super-Skrull : un Mur 0/4, +4/+4, 4 blessures, un joueur pioche quatre cartes", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Super-Skrull",
            ...lands("Plains", 3),
            ...lands("Forest", 4),
            ...lands("Mountain", 5),
            ...lands("Island", 6),
          ],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const skrull = idOf(s, "p1", "battlefield", "Super-Skrull");
      s = settle(activate(s, "p1", skrull, {}, /Mur/));
      const wall = idOf(s, "p1", "battlefield", "Wall");
      expect(pt(s, wall)).toEqual([0, 4]);
      expect(chars(s, wall).keywords).toContain("defender");
      s = settle(activate(s, "p1", skrull, {}, /\+4/));
      expect(pt(s, skrull)).toEqual([8, 9]);
      s = settle(activate(s, "p1", skrull, { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }, /4 blessures/));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      s = settle(activate(s, "p1", skrull, { targets: { t: ["p1"] } }, /pioche/));
      expect(s.players.p1?.hand).toHaveLength(4);
    });

    it("Swordsman : un autre Méchant arrivé attache un Équipement ; une créature équipée qui attaque complote", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swordsman, Sharp Scoundrel", "Stolen Stark Tech", "Bear Cub", ...lands("Swamp", 2)],
          hand: ["Agents of HYDRA"],
          library: ["Opt", "Forest", "Forest"],
        },
      });
      const tech = idOf(s, "p1", "battlefield", "Stolen Stark Tech");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Agents of HYDRA"), answering([tech, bear]));
      expect(s.objects[tech]?.attachedTo).toBe(bear);
      s = attackWith(s, [bear], answering(["Opt"]));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Thunderbolts Conspiracy : un Méchant mort revient avec un marqueur de finalité, et c'est aussi un Héros", () => {
      let s = scenario({
        p1: {
          battlefield: ["Thunderbolts Conspiracy", "Kingpin's Enforcers", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Kingpin's Enforcers")] } }));
      const back = idOf(s, "p1", "battlefield", "Kingpin's Enforcers");
      expect(s.objects[back]?.counters.finality).toBe(1);
      expect(chars(s, back).subtypes).toEqual(expect.arrayContaining(["Villain", "Hero"]));
      // Le marqueur de finalité : la seconde fois, elle est exilée.
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [back] } }));
      expect(exiled(s, "Kingpin's Enforcers")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Kingpin's Enforcers")).toHaveLength(0);
    });

    it("Too Evil to Stay Dead : VM 4 ou moins, ou n'importe quelle carte de créature avec le travail d'équipe", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Bear Cub", "Bear Cub"],
          hand: ["Too Evil to Stay Dead"],
          graveyard: ["Serra Angel", "Bear Cub"],
        },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      const t = castOption(s, "p1", idOf(s, "p1", "hand", "Too Evil to Stay Dead"))?.modes[0]?.targets[0];
      expect(t?.legal).toEqual([idOf(s, "p1", "graveyard", "Bear Cub")]);
      expect(t?.kickedLegal).toContain(angel);
      s = settle(
        cast(s, "p1", "Too Evil to Stay Dead", {
          kicked: true,
          tap: idsOf(s, "p1", "battlefield", "Bear Cub"),
          targets: { t: [angel] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Unliving Legionnaire : montée en puissance, une carte de créature du cimetière en main et deux marqueurs +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Unliving Legionnaire", ...lands("Swamp", 7)], graveyard: ["Bear Cub"] } });
      const legionnaire = idOf(s, "p1", "battlefield", "Unliving Legionnaire");
      s = settle(activate(s, "p1", legionnaire, { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(handNames(s)).toEqual(["Bear Cub"]);
      expect(pt(s, legionnaire)).toEqual([5, 4]);
    });

    it("Visions of Villainy : {1} de moins avec un Méchant ; piochez deux cartes et perdez 2 PV", () => {
      const without = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Visions of Villainy"] } });
      expect(castOption(without, "p1", idOf(without, "p1", "hand", "Visions of Villainy"))).toBeUndefined();
      let s = scenario({ p1: { battlefield: ["Agents of HYDRA", ...lands("Swamp", 2)], hand: ["Visions of Villainy"] } });
      s = settle(cast(s, "p1", "Visions of Villainy"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(18);
    });

    describe("Whiplash, Vengeful Engineer", () => {
      it("arrive engagé", () => {
        let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Whiplash, Vengeful Engineer"] } });
        s = settle(cast(s, "p1", "Whiplash, Vengeful Engineer"));
        expect(s.objects[idOf(s, "p1", "battlefield", "Whiplash, Vengeful Engineer")]?.tapped).toBe(true);
      });

      it("en attaquant, s'il est équipé : chaque adversaire perd X PV et vous gagnez X PV (X : Équipements attachés)", () => {
        let s = scenario({ p1: { battlefield: ["Whiplash, Vengeful Engineer", "Stolen Stark Tech", "Stolen Stark Tech"] } });
        const whip = idOf(s, "p1", "battlefield", "Whiplash, Vengeful Engineer");
        for (const tech of idsOf(s, "p1", "battlefield", "Stolen Stark Tech"))
          (s.objects[tech] as { attachedTo?: string }).attachedTo = whip;
        s.version += 1;
        s = attackWith(s, [whip]);
        expect(s.players.p2?.life).toBe(18);
        expect(s.players.p1?.life).toBe(22);
        let bare = scenario({ p1: { battlefield: ["Whiplash, Vengeful Engineer"] } });
        bare = attackWith(bare, [idOf(bare, "p1", "battlefield", "Whiplash, Vengeful Engineer")]);
        expect(bare.players.p2?.life).toBe(20);
        expect(bare.players.p1?.life).toBe(20);
      });
    });

    it("Widow's Bite : un mode, ou les deux avec le travail d'équipe 3", () => {
      const base = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub", "Llanowar Elves"], hand: ["Widow's Bite"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(base, "p2", "battlefield", "Serra Angel");
      const theirBear = idOf(base, "p2", "battlefield", "Bear Cub");
      expect(() => cast(base, "p1", "Widow's Bite", { mode: 2, targets: { a: [theirBear], b: [angel] } })).toThrow();
      const tap = [idOf(base, "p1", "battlefield", "Bear Cub"), idOf(base, "p1", "battlefield", "Llanowar Elves")];
      const s = settle(cast(base, "p1", "Widow's Bite", { mode: 2, kicked: true, tap, targets: { a: [theirBear], b: [angel] } }));
      expect(chars(s, theirBear).keywords).toContain("deathtouch");
      expect(pt(s, angel)).toEqual([2, 2]);
    });

    it("Yellowjacket : un autre Méchant arrivé lui donne +1/+0 et le lien de vie jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: ["Yellowjacket, Heartless Marauder", ...lands("Swamp", 2)], hand: ["Agents of HYDRA"] },
      });
      const yj = idOf(s, "p1", "battlefield", "Yellowjacket, Heartless Marauder");
      s = settle(cast(s, "p1", "Agents of HYDRA"));
      expect(pt(s, yj)).toEqual([2, 2]);
      expect(chars(s, yj).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, yj)).toEqual([1, 2]);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

  /** Réponse qui choisit les objets (ou joueurs) voulus quand ils font partie des options. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked.slice(0, req.max ?? picked.length) : undefined;
    };
  /** Réponse qui choisit les cartes de ces noms parmi les options. */
  const pickingNames =
    (names: string[]): Answer =>
    (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      const ids = req.options.filter((o) => names.includes(nameOf(cur, String(o)) ?? ""));
      return ids.length > 0 ? ids.slice(0, 1) : undefined;
    };
  /** Répond « non » aux questions dont l'invite correspond, et délègue le reste. */
  const declining =
    (prompt: RegExp, rest: Answer = () => undefined): Answer =>
    (req, p, cur) =>
      req.type === "yesNo" && prompt.test(req.prompt ?? "") ? [0] : rest(req, p, cur);
  const castable = (s: S, player: string, c: string) => legalActions(s, player).some((a) => a.type === "cast" && a.card === c);
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
  /** Jusqu'à la déclaration des attaquants de p1. */
  const toAttack = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");

  /** Éphémère gratuit « détruisez un artefact ciblé » (pour Fin Fang Foom). */
  const SHATTER = customCard({
    name: "Test Shatter",
    typeLine: "Instant",
    types: ["Instant"],
    spell: spell([target.permanent("t", ["Artifact"])], [fx.destroy(ref.target())]),
  });
  const VEHICLE = customCard({
    name: "Test Vehicle",
    typeLine: "Artifact — Vehicle",
    types: ["Artifact"],
    subtypes: ["Vehicle"],
  });

  describe("Marvel Super Heroes, lot A — rouge", () => {
    it("Crimson Operative : en arrivant, exile la carte du dessus, jouable jusqu'à la fin de votre prochain tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Crimson Operative"], library: ["Lightning Strike", "Forest"] },
      });
      s = settle(cast(s, "p1", "Crimson Operative"));
      const strike = exiled(s, "Lightning Strike")[0] as string;
      expect(strike).toBeDefined();
      expect(castable(s, "p1", strike)).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Crimson Operative")).keywords).toContain("prowess");
    });

    describe("Death to Our Enemies", () => {
      it("un sort non-créature : un Trésor engagé et un marqueur de plan", () => {
        let s = scenario({ p1: { battlefield: ["Death to Our Enemies", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
        const plan = idOf(s, "p1", "battlefield", "Death to Our Enemies");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
        const treasure = idOf(s, "p1", "battlefield", "Treasure");
        expect(s.objects[treasure]?.tapped).toBe(true);
        expect(s.objects[plan]?.counters.plan).toBe(1);
      });

      it("au quatrième marqueur : sacrifiez-le, 7 blessures réparties entre une ou deux cibles", () => {
        let s = scenario({
          p1: { battlefield: ["Death to Our Enemies", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        setCounters(s, idOf(s, "p1", "battlefield", "Death to Our Enemies"), "plan", 3);
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), picking(["p2"]));
        expect(idsOf(s, "p1", "graveyard", "Death to Our Enemies")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(10);
      });
    });

    describe("Fin Fang Foom", () => {
      it("un éphémère qui cible un artefact est copié (nouvelle cible) ; deux marqueurs +1/+1", () => {
        let s = scenario({
          p1: { battlefield: ["Fin Fang Foom"], hand: [SHATTER] },
          p2: { battlefield: ["Hawkeye's Bow", "Hawkeye's Bow"] },
        });
        const [bow1, bow2] = idsOf(s, "p2", "battlefield", "Hawkeye's Bow") as [string, string];
        s = settle(cast(s, "p1", "Test Shatter", { targets: { t: [bow1] } }), picking([bow2]));
        expect(idsOf(s, "p2", "graveyard", "Hawkeye's Bow")).toHaveLength(2);
        expect(s.objects[idOf(s, "p1", "battlefield", "Fin Fang Foom")]?.counters["+1/+1"]).toBe(2);
      });

      it("un sort qui ne cible ni artefact ni terrain n'est pas copié", () => {
        let s = scenario({ p1: { battlefield: ["Fin Fang Foom", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
        expect(s.objects[idOf(s, "p1", "battlefield", "Fin Fang Foom")]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Hawkeye, Master Marksman : engagé, payez {1} par mode (Filet, Explosive, Boomerang)", () => {
      let s = scenario({
        p1: { battlefield: ["Hawkeye, Master Marksman", ...lands("Mountain", 3)], hand: ["Forest"], library: ["Opt", "Plains"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const hawkeye = idOf(s, "p1", "battlefield", "Hawkeye, Master Marksman");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(chars(s, hawkeye).keywords).toEqual(expect.arrayContaining(["reach", "firstStrike"]));
      s = toAttack(s);
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: hawkeye, defender: "p2" }] });
      s = settle(s, picking([bear, "p2"]));
      expect(chars(s, bear).keywords).toContain("cantBlock");
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "battlefield", "Mountain").every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Hawkeye, Master Marksman : sans paiement, aucun mode", () => {
      let s = scenario({
        p1: { battlefield: ["Hawkeye, Master Marksman", ...lands("Mountain", 3)], hand: ["Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const hawkeye = idOf(s, "p1", "battlefield", "Hawkeye, Master Marksman");
      s = toAttack(s);
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: hawkeye, defender: "p2" }] });
      s = settle(s, declining(/Payer \{1\}/));
      expect(s.players.p2?.life).toBe(20);
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("cantBlock");
      expect(idsOf(s, "p1", "battlefield", "Mountain").some((id) => s.objects[id]?.tapped)).toBe(false);
    });

    it("Hawkeye's Bow : +1/+0 et la portée ; la créature équipée engagée inflige 1 blessure à chaque adversaire", () => {
      let s = scenario({ p1: { battlefield: ["Hawkeye's Bow", "Bear Cub", "Mountain"] } });
      const bow = idOf(s, "p1", "battlefield", "Hawkeye's Bow");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", bow, { targets: { t: [bear] } }, /Équiper/));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("reach");
      s = toAttack(s);
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Hex Magic : exile votre main, piochez autant ; les cartes exilées restent jouables", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Hex Magic", "Forest", "Plains"], library: ["Opt", "Island", "Swamp"] },
      });
      s = settle(cast(s, "p1", "Hex Magic"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt", "Island"]);
      const forest = exiled(s, "Forest")[0] as string;
      expect(exiled(s, "Plains")).toHaveLength(1);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    });

    it("Hire a Crew : un Méchant 2/1 noir avec la menace, puis vos créatures gagnent +1/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Hire a Crew"] } });
      s = settle(cast(s, "p1", "Hire a Crew"));
      const villain = idOf(s, "p1", "battlefield", "Villain");
      expect(pt(s, villain)).toEqual([3, 1]);
      expect(chars(s, villain).keywords).toContain("menace");
      expect(chars(s, villain).colors).toEqual(["B"]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 2]);
    });

    describe("HULK SMASH!", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Mountain", 2), "Shivan Dragon"], hand: ["HULK SMASH!"] },
          p2: { battlefield: ["Serra Angel", "Hawkeye's Bow"] },
        });

      it("un seul mode : votre créature inflige des blessures égales à sa force", () => {
        let s = setup();
        const shivan = idOf(s, "p1", "battlefield", "Shivan Dragon");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "HULK SMASH!", { mode: 1, targets: { c: [shivan], o: [angel] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Hawkeye's Bow")).toHaveLength(1);
      });

      it("les deux modes seulement avec le travail d'équipe 4", () => {
        const s0 = setup();
        const shivan = idOf(s0, "p1", "battlefield", "Shivan Dragon");
        const angel = idOf(s0, "p2", "battlefield", "Serra Angel");
        const bow = idOf(s0, "p2", "battlefield", "Hawkeye's Bow");
        const targets = { a: [bow], c: [shivan], o: [angel] };
        expect(() => cast(s0, "p1", "HULK SMASH!", { mode: 2, targets })).toThrow();
        const s = settle(cast(s0, "p1", "HULK SMASH!", { mode: 2, targets, kicked: true, tap: [shivan] }));
        expect(s.objects[shivan]?.tapped).toBe(true);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Hawkeye's Bow")).toHaveLength(1);
      });
    });

    describe("Human Torch, Johnny Storm", () => {
      it("vous piochez avec un autre Héros : 1 blessure à un adversaire ; sans autre Héros, rien", () => {
        const run = (others: string[]) => {
          const s = scenario({ active: "p2", p1: { battlefield: ["Human Torch, Johnny Storm", ...others] } });
          return advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        };
        expect(run(["K'un-Lun Warrior"]).players.p2?.life).toBe(19);
        expect(run(["Bear Cub"]).players.p2?.life).toBe(20);
      });

      it("montée en puissance : trois marqueurs +1/+1, coût réduit de {2}{R} s'il est arrivé ce tour-ci", () => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 7), hand: ["Human Torch, Johnny Storm"] } });
        s = settle(cast(s, "p1", "Human Torch, Johnny Storm"));
        const torch = idOf(s, "p1", "battlefield", "Human Torch, Johnny Storm");
        s = settle(activate(s, "p1", torch, {}, /Montée en puissance/));
        expect(pt(s, torch)).toEqual([5, 5]);
        expect(idsOf(s, "p1", "battlefield", "Mountain").every((id) => s.objects[id]?.tapped)).toBe(true);
      });
    });

    it("HYDRA Assault Robot : un autre Méchant ou artefact arrive sous votre contrôle : 1 blessure à un adversaire", () => {
      let s = scenario({
        p1: { battlefield: ["HYDRA Assault Robot", ...lands("Mountain", 2), "Forest"], hand: ["Hawkeye's Bow", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Hawkeye's Bow"));
      expect(s.players.p2?.life).toBe(19);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p2?.life).toBe(19);
    });

    it("Iron Fist : un sort qui cible votre créature lui donne « {T} : blessures égales à sa force »", () => {
      let s = scenario({ p1: { battlefield: ["Iron Fist, Living Weapon", ...lands("Mountain", 2)], hand: ["Team Tactics"] } });
      const fist = idOf(s, "p1", "battlefield", "Iron Fist, Living Weapon");
      expect(ability(s, "p1", fist)).toBeUndefined();
      s = settle(cast(s, "p1", "Team Tactics", { targets: { t: [fist] } }));
      const tap = ability(s, "p1", fist, /force/);
      expect(tap?.targets[0]?.legal).not.toContain(fist);
      s = settle(activate(s, "p1", fist, { targets: { t: ["p2"] } }, /force/));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Jessica Jones : {T} et un marqueur d'étourdissement : exile les X cartes du dessus, jouables ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Jessica Jones, Private Eye", ...lands("Mountain", 2)],
          library: ["Lightning Strike", "Plains", "Opt"],
        },
      });
      const jessica = idOf(s, "p1", "battlefield", "Jessica Jones, Private Eye");
      s = settle(activate(s, "p1", jessica));
      expect(s.objects[jessica]?.tapped).toBe(true);
      expect(s.objects[jessica]?.counters.stun).toBe(1);
      const strike = exiled(s, "Lightning Strike")[0] as string;
      const plains = exiled(s, "Plains")[0] as string;
      expect(exiled(s, "Opt")).toHaveLength(0);
      expect(castable(s, "p1", strike)).toBe(true);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === plains)).toBe(true);
    });

    describe("K'un-Lun Warrior et Vision of Love", () => {
      it("K'un-Lun Warrior : défaussez une carte en arrivant, piochez une carte", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["K'un-Lun Warrior", "Forest"], library: ["Opt", "Plains"] },
        });
        s = settle(cast(s, "p1", "K'un-Lun Warrior"), pickingNames(["Forest"]));
        expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
        expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      });

      it("K'un-Lun Warrior : rien n'est sacrifié ni défaussé, pas de pioche", () => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["K'un-Lun Warrior", "Forest"] } });
        s = settle(cast(s, "p1", "K'un-Lun Warrior"));
        expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      });

      it("Vision of Love : sacrifiez un artefact, piochez deux cartes", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 2), "Hawkeye's Bow"], hand: ["Vision of Love"], library: ["Opt", "Plains"] },
        });
        s = settle(cast(s, "p1", "Vision of Love"), pickingNames(["Hawkeye's Bow"]));
        expect(idsOf(s, "p1", "graveyard", "Hawkeye's Bow")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(2);
      });
    });

    it("Machinesmith Automaton : un autre artefact arrive sous votre contrôle : un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Machinesmith Automaton", "Mountain"], hand: ["Hawkeye's Bow"] } });
      s = settle(cast(s, "p1", "Hawkeye's Bow"));
      const bot = idOf(s, "p1", "battlefield", "Machinesmith Automaton");
      expect(pt(s, bot)).toEqual([3, 3]);
      expect(chars(s, bot).keywords).toContain("trample");
    });

    it("Misty Knight : piochez une carte pour chaque carte défaussée ce tour-ci (le coût compris)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Misty Knight, Hero for Hire", ...lands("Mountain", 4)],
          hand: ["Vision of Love", "Forest", "Plains"],
          library: ["Opt", "Island", "Swamp", "Mountain", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Vision of Love"), pickingNames(["Forest"]));
      expect(s.players.p1?.hand).toHaveLength(3);
      const misty = idOf(s, "p1", "battlefield", "Misty Knight, Hero for Hire");
      s = settle(activate(s, "p1", misty, { discard: [idOf(s, "p1", "hand", "Plains")] }));
      // Deux cartes défaussées ce tour-ci (Forest, Plains) : deux cartes piochées.
      expect(s.players.p1?.hand).toHaveLength(4);
      expect(s.objects[misty]?.tapped).toBe(true);
    });

    it("Photon Blast Barrage : copié X fois, chaque copie peut viser une nouvelle créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Photon Blast Barrage"] },
        p2: { battlefield: ["Llanowar Elves", "Llanowar Elves", "Llanowar Elves"] },
      });
      const [e1, e2, e3] = idsOf(s, "p2", "battlefield", "Llanowar Elves") as [string, string, string];
      const queue = [e2, e3];
      s = settle(cast(s, "p1", "Photon Blast Barrage", { x: 2, targets: { t: [e1] } }), (req) => {
        const next = queue[0];
        if (req.type !== "pick" || !next || !req.options.includes(next)) return undefined;
        queue.shift();
        return [next];
      });
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(3);
    });

    describe("Quicksilver, Brash Blur", () => {
      it("peut commencer la partie sur le champ de bataille", () => {
        expect(card("Quicksilver, Brash Blur").leyline).toBe(true);
      });

      it("montée en puissance : un marqueur +1/+1 et un marqueur de double initiative, une seule fois", () => {
        let s = scenario({ p1: { battlefield: ["Quicksilver, Brash Blur", ...lands("Mountain", 10)] } });
        const qs = idOf(s, "p1", "battlefield", "Quicksilver, Brash Blur");
        expect(chars(s, qs).keywords).toContain("haste");
        s = settle(activate(s, "p1", qs, {}, /Montée en puissance/));
        expect(pt(s, qs)).toEqual([2, 2]);
        expect(chars(s, qs).keywords).toContain("doubleStrike");
        expect(ability(s, "p1", qs, /Montée en puissance/)).toBeUndefined();
      });
    });

    it("Red Hulk : blessé, il reçoit un marqueur +1/+1 puis inflige autant de blessures que de marqueurs", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Red Hulk", counters: { "+1/+1": 1 } }, ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
        },
      });
      const hulk = idOf(s, "p1", "battlefield", "Red Hulk");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [hulk] } }), picking(["p2"]));
      expect(s.objects[hulk]?.counters["+1/+1"]).toBe(2);
      expect(s.players.p2?.life).toBe(18);
      expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
    });

    it("Repulsor Blast : 5 blessures à une créature ; avec le travail d'équipe, 2 de plus à son contrôleur", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Repulsor Blast"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Repulsor Blast", { targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(20);
      let k = setup();
      const bear = idOf(k, "p1", "battlefield", "Bear Cub");
      k = settle(
        cast(k, "p1", "Repulsor Blast", {
          targets: { t: [idOf(k, "p2", "battlefield", "Serra Angel")] },
          kicked: true,
          tap: [bear],
        }),
      );
      expect(k.players.p2?.life).toBe(18);
      expect(k.objects[bear]?.tapped).toBe(true);
    });

    it("The Scarlet Witch : éphémères et rituels de valeur de mana 4 ou plus coûtent {X} de moins (X : sa force)", () => {
      const without = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Truck Toss"] } });
      expect(castable(without, "p1", idOf(without, "p1", "hand", "Truck Toss"))).toBe(false);
      const s = scenario({
        p1: { battlefield: ["The Scarlet Witch", ...lands("Mountain", 2)], hand: ["Truck Toss", "Hire a Crew"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Truck Toss"))).toBe(true);
      // Valeur de mana 3 : pas de réduction.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Hire a Crew"))).toBe(false);
    });

    it("Speed, Young Avenger : payez {1} : une créature avec la célérité n'est bloquée que par des créatures avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: ["Speed, Young Avenger", ...lands("Mountain", 3)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Bear Cub", "Volcanic Villain"] },
      });
      const speed = idOf(s, "p1", "battlefield", "Speed, Young Avenger");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const villain = idOf(s, "p2", "battlefield", "Volcanic Villain");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), picking([speed]));
      expect(idsOf(s, "p1", "battlefield", "Mountain").every((id) => s.objects[id]?.tapped)).toBe(true);
      s = toAttack(s);
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: speed, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      expect(s.pending?.kind).toBe("declareBlockers");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: speed }] })).toThrow();
      // Une créature avec la célérité peut la bloquer.
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: villain, attacker: speed }] });
      expect(s.combat?.blockers).toEqual([{ id: villain, attacker: speed }]);
    });

    it("Stark Industries Executive : {2}, {T} : un Trésor", () => {
      let s = scenario({ p1: { battlefield: ["Stark Industries Executive", ...lands("Mountain", 2)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Stark Industries Executive")));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Super Speed : +1/+0 et la célérité ; l'initiative jusqu'à la fin du tour en arrivant", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Bear Cub"], hand: ["Super Speed"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Speed", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["haste", "firstStrike"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).toContain("haste");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("Team Tactics : la double initiative ; avec le travail d'équipe, le piétinement en plus", () => {
      const setup = () =>
        scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub", "Llanowar Elves"], hand: ["Team Tactics"] } });
      let s = setup();
      let bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Team Tactics", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(chars(s, bear).keywords).not.toContain("trample");
      s = setup();
      bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Team Tactics", { targets: { t: [bear] }, kicked: true, tap: [elves] }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
    });

    it("Truck Toss : {2} de moins avec un Véhicule ; 4 blessures à n'importe quelle cible", () => {
      const without = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Truck Toss"] } });
      expect(castable(without, "p1", idOf(without, "p1", "hand", "Truck Toss"))).toBe(false);
      let s = scenario({ p1: { battlefield: [VEHICLE, ...lands("Mountain", 2)], hand: ["Truck Toss"] } });
      s = settle(cast(s, "p1", "Truck Toss", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
    });

    it("Volcanic Villain : montée en puissance pour {3} le tour de son arrivée, une seule fois", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 7), hand: ["Volcanic Villain"] } });
      s = settle(cast(s, "p1", "Volcanic Villain"));
      const villain = idOf(s, "p1", "battlefield", "Volcanic Villain");
      s = settle(activate(s, "p1", villain, {}, /Montée en puissance/));
      expect(pt(s, villain)).toEqual([5, 4]);
      expect(idsOf(s, "p1", "battlefield", "Mountain").filter((id) => !s.objects[id]?.tapped)).toHaveLength(1);
      expect(ability(s, "p1", villain, /Montée en puissance/)).toBeUndefined();
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  /** Choisit le mode d'une capacité déclenchée modale. */
  const triggerMode =
    (index: number): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : undefined;
  /** Capacité activable de `source` dont le libellé correspond (la première sinon). */
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const playLand = (s: S, player: string, card: string) => act(s, player, { type: "playLand", card });

  describe("Marvel Super Heroes, lot A — vert", () => {
    it("Ant-Man's Army : en arrivant, un jeton Nourriture ou un jeton Trésor, au choix", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Ant-Man's Army"] } });
      s = settle(cast(s, "p1", "Ant-Man's Army"), triggerMode(1));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    });

    it("Call Damage Control : jusqu'à deux modes, chacun renvoie une carte du type demandé en main", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 2),
          hand: ["Call Damage Control"],
          graveyard: ["The Mind Stone", "Bear Cub", "Island"],
        },
      });
      const stone = idOf(s, "p1", "graveyard", "The Mind Stone");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      // Mode 4 : artefact + créature.
      s = settle(cast(s, "p1", "Call Damage Control", { mode: 4, targets: { a: [stone], c: [bear] } }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "The Mind Stone"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Island", "Call Damage Control"]);
    });

    describe("Claim the Kingdom", () => {
      it("Landfall : un marqueur +1/+1 sur une de vos créatures et un marqueur de plan", () => {
        let s = scenario({ p1: { battlefield: ["Claim the Kingdom", "Bear Cub"], hand: ["Forest"] } });
        const plan = idOf(s, "p1", "battlefield", "Claim the Kingdom");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(playLand(s, "p1", idOf(s, "p1", "hand", "Forest")));
        expect(plusOnes(s, bear)).toBe(1);
        expect(s.objects[plan]?.counters.plan).toBe(1);
      });

      it("au quatrième marqueur de plan : sacrifiez-le, un marqueur d'indestructible sur une de vos créatures", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Claim the Kingdom", counters: { plan: 3 } }, "Bear Cub"], hand: ["Forest"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(playLand(s, "p1", idOf(s, "p1", "hand", "Forest")));
        expect(idsOf(s, "p1", "graveyard", "Claim the Kingdom")).toHaveLength(1);
        expect(s.objects[bear]?.counters.indestructible).toBe(1);
        expect(chars(s, bear).keywords).toContain("indestructible");
      });
    });

    describe("Doc Samson, Super Psychiatrist", () => {
      it("les marqueurs mis sur vos permanents sont augmentés d'un de chaque sorte, pas ceux des adversaires", () => {
        let s = scenario({
          p1: {
            battlefield: ["Doc Samson, Super Psychiatrist", "Serpent Specialist", "Claim the Kingdom", ...lands("Forest", 5)],
            hand: ["Go Nuts!", "Forest"],
          },
          p2: { battlefield: ["Bear Cub"] },
        });
        const snake = idOf(s, "p1", "battlefield", "Serpent Specialist");
        const plan = idOf(s, "p1", "battlefield", "Claim the Kingdom");
        s = settle(activate(s, "p1", snake));
        expect(plusOnes(s, snake)).toBe(3);
        // Landfall de Claim the Kingdom : un marqueur de plan devient deux, un marqueur +1/+1 devient deux.
        s = settle(playLand(s, "p1", idOf(s, "p1", "hand", "Forest")), picking([snake]));
        expect(plusOnes(s, snake)).toBe(5);
        expect(s.objects[plan]?.counters.plan).toBe(2);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Go Nuts!", { mode: 0, targets: { t: [bear] } }));
        expect(plusOnes(s, bear)).toBe(1);
      });

      it("{T} : X mana d'une même couleur, X étant sa force", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Doc Samson, Super Psychiatrist", counters: { "+1/+1": 1 } }] } });
        const doc = idOf(s, "p1", "battlefield", "Doc Samson, Super Psychiatrist");
        const opt = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === doc);
        s = act(s, "p1", { type: "tapForMana", source: doc, ability: opt?.type === "tapForMana" ? opt.ability : 0, color: "R" });
        expect(s.players.p1?.manaPool.R).toBe(4);
      });
    });

    describe("Earth's Mightiest Heroes", () => {
      const library = ["Bear Cub", "Forest", "Serra Angel", "Island", "Opt", "Forest", "Forest", "Forest", "Plains"];
      it("sans travail d'équipe : une seule carte de créature parmi les huit du dessus, le reste au cimetière", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Earth's Mightiest Heroes"], library } });
        s = settle(cast(s, "p1", "Earth's Mightiest Heroes"));
        const creatures = ["Bear Cub", "Serra Angel"].flatMap((n) => idsOf(s, "p1", "battlefield", n));
        expect(creatures).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(8);
        expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
      });

      it("avec le travail d'équipe 5 : toutes les cartes de créature voulues", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Forest", 6), "Shivan Dragon"],
            hand: ["Earth's Mightiest Heroes"],
            library,
          },
        });
        const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
        s = act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Earth's Mightiest Heroes"),
          kicked: true,
          tap: [dragon],
        });
        expect(s.objects[dragon]?.tapped).toBe(true);
        s = settle(s);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(7);
      });
    });

    it("Epic Fight : les deux modes — force et endurance doublées, puis combat", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Epic Fight"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Bear Cub (2/2) devient 4/4 et se bat contre Serra Angel (4/4) : les deux meurent.
      s = settle(cast(s, "p1", "Epic Fight", { mode: 2, targets: { t: [bear], a: [bear], b: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Go Nuts!", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Forest", "Bear Cub", "Serpent Specialist"], hand: ["Go Nuts!"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });

      it("sans travail d'équipe : un seul mode", () => {
        const s = setup();
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        expect(() => cast(s, "p1", "Go Nuts!", { mode: 2, targets: { t: [bear], a: [bear], b: [elves] } })).toThrow();
        const t = settle(cast(s, "p1", "Go Nuts!", { mode: 0, targets: { t: [bear] } }));
        expect(plusOnes(t, bear)).toBe(1);
      });

      it("avec le travail d'équipe 3 : les deux modes", () => {
        let s = setup();
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const snake = idOf(s, "p1", "battlefield", "Serpent Specialist");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        s = cast(s, "p1", "Go Nuts!", {
          mode: 2,
          kicked: true,
          tap: [bear, snake],
          targets: { t: [snake], a: [snake], b: [elves] },
        });
        s = settle(s);
        expect(plusOnes(s, snake)).toBe(1);
        expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      });
    });

    it("Guerrilla Gorilla : sacrifiez-le, détruisez un artefact non-créature (en rituel seulement)", () => {
      let s = scenario({
        p1: { battlefield: ["Guerrilla Gorilla"] },
        p2: { battlefield: ["Mjölnir, Hammer of Thor", "Political Triumph", "Bear Cub"] },
      });
      const gorilla = idOf(s, "p1", "battlefield", "Guerrilla Gorilla");
      const stone = idOf(s, "p2", "battlefield", "Mjölnir, Hammer of Thor");
      const legal = ability(s, "p1", gorilla)?.targets[0]?.legal ?? [];
      expect(legal).toContain(stone);
      expect(legal).toContain(idOf(s, "p2", "battlefield", "Political Triumph"));
      expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Bear Cub"));
      s = settle(activate(s, "p1", gorilla, { targets: { t: [stone] } }));
      expect(idsOf(s, "p1", "graveyard", "Guerrilla Gorilla")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Mjölnir, Hammer of Thor")).toHaveLength(1);
    });

    it("Hellcat : quand elle meurt, elle revient avec un marqueur +1/+1, sans capacités mais avec la célérité", () => {
      let s = scenario({
        p1: { battlefield: ["Hellcat, Undying Vigilante"] },
        p2: { battlefield: lands("Mountain", 6), hand: ["Lightning Strike", "Lightning Strike"] },
        active: "p2",
      });
      const strike = () => {
        const cat = idOf(s, "p1", "battlefield", "Hellcat, Undying Vigilante");
        s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [cat] } }));
      };
      strike();
      const back = idOf(s, "p1", "battlefield", "Hellcat, Undying Vigilante");
      expect(pt(s, back)).toEqual([3, 3]);
      expect(chars(s, back).keywords).toContain("haste");
      expect(chars(s, back).abilities).toHaveLength(0);
      // Sans sa capacité, elle reste au cimetière la fois suivante.
      strike();
      expect(idsOf(s, "p1", "battlefield", "Hellcat, Undying Vigilante")).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Hellcat, Undying Vigilante")).toHaveLength(1);
    });

    it("Hercules : montée en puissance — marqueur +1/+1, vigilance, indestructible et célérité jusqu'à la fin du tour, une seule fois", () => {
      let s = scenario({ p1: { battlefield: ["Hercules, Prince of Power", ...lands("Forest", 10)] } });
      const herc = idOf(s, "p1", "battlefield", "Hercules, Prince of Power");
      s = settle(activate(s, "p1", herc));
      expect(pt(s, herc)).toEqual([4, 4]);
      expect(chars(s, herc).keywords).toEqual(expect.arrayContaining(["vigilance", "indestructible", "haste"]));
      expect(ability(s, "p1", herc)).toBeUndefined();
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, herc).keywords).not.toContain("indestructible");
      expect(pt(s, herc)).toEqual([4, 4]);
    });

    it("Heroic Feast : une Nourriture en arrivant ; des PV gagnés donnent autant de marqueurs +1/+1 à vos créatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 5), "Bear Cub", "Llanowar Elves"], hand: ["Heroic Feast"] } });
      s = settle(cast(s, "p1", "Heroic Feast"));
      const food = idOf(s, "p1", "battlefield", "Food");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(activate(s, "p1", food), picking([bear, elves]));
      expect(s.players.p1?.life).toBe(23);
      expect(plusOnes(s, bear)).toBe(1);
      expect(plusOnes(s, elves)).toBe(1);
    });

    it("Hulkling : un marqueur +1/+1 seulement si la créature arrivée a une force ou une endurance supérieure", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hulkling, Burgeoning Bruiser", ...lands("Forest", 2), ...lands("Plains", 5)],
          hand: ["Bear Cub", "Serra Angel"],
        },
      });
      const hulk = idOf(s, "p1", "battlefield", "Hulkling, Burgeoning Bruiser");
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(plusOnes(s, hulk)).toBe(0);
      s = settle(cast(s, "p1", "Serra Angel"));
      expect(plusOnes(s, hulk)).toBe(1);
    });

    it("Ka-Zar : Zabu en arrivant ; des terrains joués depuis le dessus de la bibliothèque, qui font grandir Zabu", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Ka-Zar of the Savage Land"], library: ["Mountain", "Opt"] },
      });
      s = settle(cast(s, "p1", "Ka-Zar of the Savage Land"));
      const zabu = idOf(s, "p1", "battlefield", "Zabu");
      expect(chars(s, zabu).supertypes).toContain("Legendary");
      expect(pt(s, zabu)).toEqual([2, 2]);
      const top = s.players.p1?.library[0] as string;
      expect(nameOf(s, top)).toBe("Mountain");
      s = settle(playLand(s, "p1", top));
      expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(1);
      expect(plusOnes(s, zabu)).toBe(1);
    });

    it("Knight of Wundagore : un marqueur +1/+1 sur une autre créature lui en donne un, une fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Knight of Wundagore", "Serpent Specialist", "Bear Cub", ...lands("Forest", 5)], hand: ["Go Nuts!"] },
      });
      const knight = idOf(s, "p1", "battlefield", "Knight of Wundagore");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Serpent Specialist")));
      expect(plusOnes(s, knight)).toBe(1);
      s = settle(cast(s, "p1", "Go Nuts!", { mode: 0, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(plusOnes(s, knight)).toBe(1);
    });

    it("Mister Hyde : à votre entretien, retirez un marqueur d'une de vos créatures pour piocher", () => {
      let s = scenario({
        p1: { battlefield: ["Mister Hyde, Monster Within", { name: "Bear Cub", counters: { "+1/+1": 2 } }] },
        active: "p2",
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.triggers.length > 0);
      s = settle(s, (req, p, cur) => triggerMode(1)(req, p, cur) ?? picking([bear])(req, p, cur));
      expect(plusOnes(s, bear)).toBe(1);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Mister Hyde : ou un marqueur +1/+1 sur lui-même", () => {
      let s = scenario({ p1: { battlefield: ["Mister Hyde, Monster Within"] }, active: "p2" });
      const hyde = idOf(s, "p1", "battlefield", "Mister Hyde, Monster Within");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.triggers.length > 0);
      s = settle(s, triggerMode(0));
      expect(plusOnes(s, hyde)).toBe(1);
    });

    it("Mole Man : des terrains joués depuis votre cimetière ; Landfall, un jeton Moloïde 1/1 vert", () => {
      let s = scenario({ p1: { battlefield: ["Mole Man, Moloid Master"], graveyard: ["Forest"] } });
      s = settle(playLand(s, "p1", idOf(s, "p1", "graveyard", "Forest")));
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      const moloid = idOf(s, "p1", "battlefield", "Moloid");
      expect(pt(s, moloid)).toEqual([1, 1]);
      expect(chars(s, moloid).subtypes).toContain("Minion");
      expect(chars(s, moloid).colors).toEqual(["G"]);
    });

    it("Pet Avengers : montée en puissance — un marqueur +1/+1 et un Héros 3/2 avec la vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Pet Avengers", ...lands("Forest", 7)] } });
      const pets = idOf(s, "p1", "battlefield", "Pet Avengers");
      s = settle(activate(s, "p1", pets));
      expect(pt(s, pets)).toEqual([5, 5]);
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([3, 2]);
      expect(chars(s, hero).keywords).toContain("vigilance");
    });

    it("Pet Avengers : arrivée ce tour-ci, la montée en puissance coûte {4}{G} de moins", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 7), hand: ["Pet Avengers"] } });
      s = settle(cast(s, "p1", "Pet Avengers"));
      const pets = idOf(s, "p1", "battlefield", "Pet Avengers");
      // Il reste trois Forêts : {6}{G} − {3}{G} = {3}.
      expect(ability(s, "p1", pets)).toBeDefined();
      s = settle(activate(s, "p1", pets));
      expect(plusOnes(s, pets)).toBe(1);
    });

    describe("Punishing Punch", () => {
      it("votre créature inflige deux fois sa force à une créature adverse", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Punishing Punch"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Punishing Punch", { targets: { a: [bear], b: [angel] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[bear]?.damage).toBe(0);
      });

      it("coûte {2} de moins avec deux cartes de créature ou plus dans votre cimetière", () => {
        const run = (graveyard: string[]) => {
          const s = scenario({
            p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Punishing Punch"], graveyard },
            p2: { battlefield: ["Llanowar Elves"] },
          });
          return castable(s, "p1", idOf(s, "p1", "hand", "Punishing Punch"));
        };
        expect(run(["Bear Cub"])).toBe(false);
        expect(run(["Bear Cub", "Serra Angel"])).toBe(true);
      });
    });

    it("Rapid Rescue : meulez deux cartes, une carte de permanent meulée en main, et 2 PV", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest"],
          hand: ["Rapid Rescue"],
          library: ["Opt", "Bear Cub", "Forest"],
          graveyard: ["Serra Angel"],
        },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      let offered: ChoiceValue[] = [];
      s = settle(cast(s, "p1", "Rapid Rescue"), (req) => {
        if (req.type === "pick") offered = req.options;
        return undefined;
      });
      expect(offered).not.toContain(angel);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Reptil : Brontosaure, puis Tyrannosaure — Dinosaure Héros (plus Humain) avec de nouvelles F/E de base", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Reptil, Dinomorpher", counters: { "+1/+1": 1 } }, ...lands("Forest", 9)] },
      });
      const reptil = idOf(s, "p1", "battlefield", "Reptil, Dinomorpher");
      s = settle(activate(s, "p1", reptil, {}, /Brontosaure/));
      expect(pt(s, reptil)).toEqual([4, 6]);
      expect(chars(s, reptil).subtypes.sort()).toEqual(["Dinosaur", "Hero"]);
      expect(chars(s, reptil).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
      s = settle(activate(s, "p1", reptil, {}, /Tyrannosaure/));
      expect(pt(s, reptil)).toEqual([7, 7]);
      expect(chars(s, reptil).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, reptil)).toEqual([2, 3]);
      expect(chars(s, reptil).subtypes).toContain("Human");
    });

    it("Restorative Technique : le joueur ciblé gagne 2 PV et met un terrain de base engagé ; un marqueur +1/+1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Restorative Technique"], library: ["Opt", "Plains"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Restorative Technique", { targets: { p: ["p1"], c: [bear] } }));
      expect(s.players.p1?.life).toBe(22);
      const plains = idOf(s, "p1", "battlefield", "Plains");
      expect(s.objects[plains]?.tapped).toBe(true);
      expect(plusOnes(s, bear)).toBe(1);
    });

    it("Rick Jones : {3}, {T} : meulez quatre cartes, un Héros ou un enchantement en main", () => {
      let s = scenario({
        p1: {
          battlefield: ["Rick Jones, Destined Sidekick", ...lands("Forest", 3)],
          library: ["Bear Cub", "Guerrilla Gorilla", "Forest", "Opt", "Island"],
        },
      });
      let offered: string[] = [];
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Rick Jones, Destined Sidekick")), (req, _p, cur) => {
        if (req.type === "pick") offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
        return undefined;
      });
      expect(offered).toEqual(["Guerrilla Gorilla"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Guerrilla Gorilla"]);
      expect(s.players.p1?.graveyard).toHaveLength(3);
    });

    it("She-Hulk : montée en puissance — détruit jusqu'à un artefact ou enchantement, un marqueur +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["She-Hulk, Jade Defender", ...lands("Forest", 6)] },
        p2: { battlefield: ["Political Triumph"] },
      });
      const hulk = idOf(s, "p1", "battlefield", "She-Hulk, Jade Defender");
      const plan = idOf(s, "p2", "battlefield", "Political Triumph");
      s = settle(activate(s, "p1", hulk, { targets: { t: [plan] } }));
      expect(idsOf(s, "p2", "graveyard", "Political Triumph")).toHaveLength(1);
      expect(pt(s, hulk)).toEqual([5, 5]);
    });

    it("Super Strength : +4/+4, le piétinement et la garde {1}", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Bear Cub"], hand: ["Super Strength"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Super Strength", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([6, 6]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "ward"]));
      // L'adversaire n'a plus de quoi payer {1} après Lightning Strike : le sort est contrecarré.
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(s.objects[bear]?.damage).toBe(0);
    });

    it("The Thing : des Héros qui blessent un joueur lui donnent deux marqueurs +1/+1 (une fois par lot)", () => {
      let s = scenario({ p1: { battlefield: ["The Thing, Ben Grimm", "Guerrilla Gorilla", "Hercules, Prince of Power"] } });
      const thing = idOf(s, "p1", "battlefield", "The Thing, Ben Grimm");
      const gorilla = idOf(s, "p1", "battlefield", "Guerrilla Gorilla");
      const herc = idOf(s, "p1", "battlefield", "Hercules, Prince of Power");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: gorilla, defender: "p2" },
          { id: herc, defender: "p2" },
        ],
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(15);
      expect(plusOnes(s, thing)).toBe(2);
    });

    it("The Thing : « blessent un joueur » compte aussi des blessures infligées à vous-même, pas à une créature", () => {
      let s = scenario({ p1: { battlefield: ["The Thing, Ben Grimm", "Guerrilla Gorilla", "Bear Cub"] } });
      const thing = idOf(s, "p1", "battlefield", "The Thing, Ben Grimm");
      const gorilla = idOf(s, "p1", "battlefield", "Guerrilla Gorilla");
      dealDamage(s, sourceFromObject(s, gorilla), idOf(s, "p1", "battlefield", "Bear Cub"), 1, false);
      s = settle(s);
      expect(plusOnes(s, thing)).toBe(0);
      dealDamage(s, sourceFromObject(s, gorilla), "p1", 1, false);
      s = settle(s);
      expect(s.players.p1?.life).toBe(19);
      expect(plusOnes(s, thing)).toBe(2);
    });

    it("Tigra : chaque fois que vous gagnez des PV, un marqueur +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Tigra, Feline Fury", "Forest"], hand: ["Rapid Rescue"] } });
      const tigra = idOf(s, "p1", "battlefield", "Tigra, Feline Fury");
      s = settle(cast(s, "p1", "Rapid Rescue"));
      expect(plusOnes(s, tigra)).toBe(1);
    });

    it("Training Regimen : marqueur +1/+1 au début du combat ; vos créatures qui en ont gagnent le piétinement", () => {
      let s = scenario({ p1: { battlefield: ["Training Regimen", "Bear Cub", "Llanowar Elves"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      expect(chars(s, bear).keywords).not.toContain("trample");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.triggers.length > 0);
      s = settle(s, picking([bear]));
      expect(plusOnes(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(chars(s, elves).keywords).not.toContain("trample");
    });

    it("The Unbeatable Squirrel Girl : un Écureuil en arrivant ; {1}{G}{G}{G} : X Écureuils (X : vos Écureuils)", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 8), hand: ["The Unbeatable Squirrel Girl"] } });
      s = settle(cast(s, "p1", "The Unbeatable Squirrel Girl"));
      expect(idsOf(s, "p1", "battlefield", "Squirrel")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "The Unbeatable Squirrel Girl")));
      // Elle et le jeton sont des Écureuils : deux de plus.
      expect(idsOf(s, "p1", "battlefield", "Squirrel")).toHaveLength(3);
    });

    it("Undercover Skrull : +2/+2 et tous les types de créature avec deux cartes de créature au cimetière", () => {
      const without = scenario({ p1: { battlefield: ["Undercover Skrull"], graveyard: ["Bear Cub"] } });
      expect(pt(without, idOf(without, "p1", "battlefield", "Undercover Skrull"))).toEqual([1, 1]);
      // Avec deux cartes de créature, c'est aussi un Héros : Wakandan Royal Guard lui donne deux marqueurs.
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), "Undercover Skrull"],
          hand: ["Wakandan Royal Guard"],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
      });
      const skrull = idOf(s, "p1", "battlefield", "Undercover Skrull");
      expect(pt(s, skrull)).toEqual([3, 3]);
      s = settle(cast(s, "p1", "Wakandan Royal Guard"), picking([skrull]));
      expect(plusOnes(s, skrull)).toBe(2);
    });

    it("Wakandan Royal Guard : un marqueur +1/+1, deux sur un autre Héros", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: [...lands("Forest", 5), other], hand: ["Wakandan Royal Guard"] } });
        const id = idOf(s, "p1", "battlefield", other);
        s = settle(cast(s, "p1", "Wakandan Royal Guard"), picking([id]));
        return plusOnes(s, id);
      };
      expect(run("Bear Cub")).toBe(1);
      expect(run("Guerrilla Gorilla")).toBe(2);
    });

    it("White Tiger : montée en puissance — un marqueur +1/+1 et The Tiger God, Chat Dieu 4/4 légendaire", () => {
      let s = scenario({ p1: { battlefield: ["White Tiger, Ava Ayala", ...lands("Forest", 6)] } });
      const tiger = idOf(s, "p1", "battlefield", "White Tiger, Ava Ayala");
      s = settle(activate(s, "p1", tiger));
      expect(plusOnes(s, tiger)).toBe(1);
      const god = idOf(s, "p1", "battlefield", "The Tiger God");
      expect(pt(s, god)).toEqual([4, 4]);
      expect(chars(s, god).supertypes).toContain("Legendary");
      expect(chars(s, god).subtypes).toEqual(expect.arrayContaining(["Cat", "God"]));
    });

    describe("World War Hulk", () => {
      it("I : le prochain sort de créature rouge ou vert de ce tour-ci se lance sans payer son coût de mana", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["World War Hulk", "Shivan Dragon", "Serra Angel"] } });
        s = settle(cast(s, "p1", "World War Hulk"));
        // Plus aucun terrain dégagé.
        const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Serra Angel"))).toBe(false);
        expect(castable(s, "p1", dragon)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: dragon, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      });

      it("I : un sort de créature rouge ou vert payé normalement consomme l'effet ; de toute zone (cimetière)", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["World War Hulk", "Llanowar Elves", "Bear Cub"] } });
        s = settle(cast(s, "p1", "World War Hulk"));
        s = settle(cast(s, "p1", "Llanowar Elves"));
        // Plus aucun terrain dégagé : Bear Cub n'est plus gratuit.
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
        let t = scenario({
          p1: {
            battlefield: [...lands("Forest", 5), { name: "Bear Cub", counters: { "+1/+1": 6 } }],
            hand: ["World War Hulk"],
            graveyard: ["Quilled Greatwurm"],
          },
        });
        t = settle(cast(t, "p1", "World War Hulk"));
        const wurm = idOf(t, "p1", "graveyard", "Quilled Greatwurm");
        t = settle(act(t, "p1", { type: "cast", card: wurm, free: true }));
        expect(idsOf(t, "p1", "battlefield", "Quilled Greatwurm")).toHaveLength(1);
      });

      it("II : trois marqueurs +1/+1 ; III : force et endurance doublées et le piétinement", () => {
        let s = scenario({ p1: { battlefield: [{ name: "World War Hulk", counters: { lore: 1 } }, "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.turn.step === "main1");
        s = settle(s);
        expect(plusOnes(s, bear)).toBe(3);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 7 && x.turn.step === "main1");
        s = settle(s);
        expect(pt(s, bear)).toEqual([10, 10]);
        expect(chars(s, bear).keywords).toContain("trample");
        expect(idsOf(s, "p1", "graveyard", "World War Hulk")).toHaveLength(1);
      });
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Répond oui (ou non) aux questions et choisit les objets voulus (par identifiant ou par nom) quand ils sont proposés. */
  const answering =
    (want: string[] = [], yes = true): Answer =>
    (req, _player, cur) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => want.includes(o) || want.includes(nameOf(cur, o) ?? ""));
      return picked.length > 0 ? picked.slice(0, Math.max(1, req.max)) : undefined;
    };
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
  /** Déclare les attaquants de p1 contre p2 (sans résoudre les déclenchements). */
  const declare = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  /** Terrain de test qui produit {C}. */
  const WASTES = customCard({ name: "Test Wastes", typeLine: "Land", types: ["Land"], abilities: [manaAbility("C")] });
  /** Créature-artefact de test 1/1 à {2}. */
  const AUTOMATON = customCard({
    name: "Test Automaton",
    typeLine: "Artifact Creature — Construct",
    types: ["Artifact", "Creature"],
    subtypes: ["Construct"],
    manaCost: { generic: 2, colored: {}, x: 0 },
    manaCostText: "{2}",
    power: 1,
    toughness: 1,
  });
  /** Artefact de test à {3}. */
  const RELIC = customCard({
    name: "Test Relic",
    typeLine: "Artifact",
    types: ["Artifact"],
    manaCost: { generic: 3, colored: {}, x: 0 },
    manaCostText: "{3}",
  });
  /** Équipement de test gratuit, sans capacité. */
  const BLADE = customCard({
    name: "Test Blade",
    typeLine: "Artifact — Equipment",
    types: ["Artifact"],
    subtypes: ["Equipment"],
  });
  /** Créature Héros de test 1/1 gratuite. */
  const HERO_ONE = customCard({
    name: "Test Hero",
    typeLine: "Creature — Human Hero",
    subtypes: ["Human", "Hero"],
    power: 1,
    toughness: 1,
  });
  /** Éphémère gratuit « un marqueur +1/+1 sur une créature ciblée ». */
  const GROW = customCard({
    name: "Test Grow",
    typeLine: "Instant",
    types: ["Instant"],
    spell: spell([target.creature()], [fx.addCounters(ref.target(), 1)]),
  });

  describe("Marvel Super Heroes, lot A — multicolores", () => {
    it("Abomination : montée en puissance, un marqueur +1/+1 puis il se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Abomination, Terrifying Titan", ...lands("Mountain", 7)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const abom = idOf(s, "p1", "battlefield", "Abomination, Terrifying Titan");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", abom, { targets: { t: [angel] } }));
      expect(s.objects[abom]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[abom]?.damage).toBe(4);
      // Une seule fois par partie.
      expect(ability(s, "p1", abom)).toBeUndefined();
    });

    it("Alien Invasion : au début du combat, un Alien 1/1 avec la célérité qui doit attaquer, +1/+1 par marqueur d'invasion", () => {
      let s = scenario({ p1: { battlefield: ["Alien Invasion"] } });
      const invasion = idOf(s, "p1", "battlefield", "Alien Invasion");
      setCounters(s, invasion, "invasion", 2);
      s = advanceUntil(
        s,
        (x) =>
          x.turn.step === "beginCombat" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          idsOf(x, "p1", "battlefield", "Alien").length > 0,
      );
      const alien = idOf(s, "p1", "battlefield", "Alien");
      expect(pt(s, alien)).toEqual([3, 3]);
      expect(chars(s, alien).keywords).toEqual(expect.arrayContaining(["haste", "mustAttack"]));
      expect(chars(s, alien).colors).toEqual(["R"]);
      expect(s.objects[invasion]?.counters.invasion).toBe(3);
    });

    it("Ant-Man, Colony Commander : en attaquant, payez {1} pour un marqueur +1/+1 ; un Insecte une seule fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Ant-Man, Colony Commander", "Bear Cub", "Forest"], hand: [GROW] },
      });
      const antman = idOf(s, "p1", "battlefield", "Ant-Man, Colony Commander");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(declare(s, [antman]), answering([bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Insect")).toHaveLength(1);
      // Un deuxième marqueur ce tour-ci : pas de nouvel Insecte.
      s = settle(cast(s, "p1", "Test Grow", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Insect")).toHaveLength(1);
    });

    it("Ant-Man, Colony Commander : un marqueur mis par un adversaire ne crée pas d'Insecte", () => {
      let s = scenario({
        p1: { battlefield: ["Ant-Man, Colony Commander"] },
        p2: { battlefield: ["Bear Cub"], hand: [GROW] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p2");
      s = settle(cast(s, "p2", "Test Grow", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Insect")).toHaveLength(0);
    });

    it("Armor Wars, chapitre I : une carte par artefact que vous contrôlez, et chaque adversaire pioche une carte", () => {
      let s = scenario({
        p1: { battlefield: [RELIC, AUTOMATON, ...lands("Island", 2), ...lands("Mountain", 2)], hand: ["Armor Wars"] },
      });
      s = settle(cast(s, "p1", "Armor Wars"), answering([], true));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p2?.hand).toHaveLength(1);
    });

    it("Armor Wars, chapitre III : X blessures à un adversaire, X étant la plus grande valeur de mana de vos artefacts", () => {
      let s = scenario({ p1: { battlefield: ["Armor Wars", RELIC, AUTOMATON] }, step: "upkeep" });
      setCounters(s, idOf(s, "p1", "battlefield", "Armor Wars"), "lore", 2);
      s = advanceUntil(
        s,
        (x) => x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0 && (x.players.p2?.life ?? 20) < 20,
      );
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "graveyard", "Armor Wars")).toHaveLength(1);
    });

    it("Avengers: Under Siege : deux Méchants, puis 2 blessures à chaque créature non-Méchant et à chaque adversaire, puis des Trésors", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2), "Bear Cub"], hand: ["Avengers: Under Siege"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Avengers: Under Siege"));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(2);
      // Chapitre II, au tour suivant de p1.
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" &&
          x.turn.step === "main1" &&
          x.turn.number > 3 &&
          x.stack.length === 0 &&
          x.triggers.length === 0,
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(2);
      expect(s.players.p2?.life).toBe(18);
      // Chapitre III : un Trésor par Méchant.
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" &&
          x.turn.step === "main1" &&
          x.turn.number > 5 &&
          x.stack.length === 0 &&
          x.triggers.length === 0,
      );
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    it("Beast : il vole tant que vous avez mis un marqueur +1/+1 sur lui ce tour-ci ; blessures de combat à un joueur : piochez", () => {
      let s = scenario({ p1: { battlefield: ["Beast, Erudite Aerialist"], hand: [GROW] } });
      const beast = idOf(s, "p1", "battlefield", "Beast, Erudite Aerialist");
      expect(chars(s, beast).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Test Grow", { targets: { t: [beast] } }));
      expect(chars(s, beast).keywords).toContain("flying");
      s = declare(s, [beast]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p1?.hand).toHaveLength(1);
      // Au tour suivant, plus de vol.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, beast).keywords).not.toContain("flying");
    });

    it("Beast : un marqueur d'une autre sorte ne lui donne pas le vol", () => {
      const oil = customCard({
        name: "Test Oil",
        typeLine: "Instant",
        types: ["Instant"],
        spell: spell([target.creature()], [fx.counters(ref.target(), "oil")]),
      });
      let s = scenario({ p1: { battlefield: ["Beast, Erudite Aerialist"], hand: [oil] } });
      const beast = idOf(s, "p1", "battlefield", "Beast, Erudite Aerialist");
      s = settle(cast(s, "p1", "Test Oil", { targets: { t: [beast] } }));
      expect(s.objects[beast]?.counters.oil).toBe(1);
      expect(chars(s, beast).keywords).not.toContain("flying");
    });

    it("Black Panther, Vanguard : un autre Héros non-jeton arrive — vos créatures gagnent +1/+1 (ou un Soldat)", () => {
      let s = scenario({ p1: { battlefield: ["Black Panther, Vanguard", "Bear Cub"], hand: [HERO_ONE, HERO_ONE] } });
      const panther = idOf(s, "p1", "battlefield", "Black Panther, Vanguard");
      s = settle(cast(s, "p1", "Test Hero"), (req) =>
        req.intent === "triggerMode" && req.type === "pick" ? [req.options[1] as string] : undefined,
      );
      expect(pt(s, panther)).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      s = settle(cast(s, "p1", "Test Hero"), (req) =>
        req.intent === "triggerMode" && req.type === "pick" ? [req.options[0] as string] : undefined,
      );
      const soldier = idOf(s, "p1", "battlefield", "Soldier");
      expect(chars(s, soldier).colors).toEqual(["W"]);
    });

    it("Black Widow : une créature qui attaque seule gagne l'initiative et la menace ; pas si elles sont deux", () => {
      let s = scenario({ p1: { battlefield: ["Black Widow, Double Agent", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const alone = settle(declare(s, [bear]));
      expect(chars(alone, bear).keywords).toEqual(expect.arrayContaining(["firstStrike", "menace"]));
      const widow = idOf(s, "p1", "battlefield", "Black Widow, Double Agent");
      s = settle(declare(s, [bear, widow]));
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("Bullseye : en arrivant, sacrifiez un artefact (ou défaussez une carte non-terrain) : 2 blessures à n'importe quelle cible", () => {
      let s = scenario({
        p1: { battlefield: [RELIC, ...lands("Swamp", 3)], hand: ["Bullseye, Death Dealer"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Bullseye, Death Dealer"), answering([RELIC.name, bear]));
      expect(idsOf(s, "p1", "graveyard", RELIC.name)).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Bullseye : {3}, {T}, défaussez une carte non-terrain : 2 blessures ; une carte de terrain ne paie pas le coût", () => {
      let s = scenario({
        p1: { battlefield: ["Bullseye, Death Dealer", ...lands("Swamp", 3)], hand: ["Forest", "Opt"] },
      });
      const bullseye = idOf(s, "p1", "battlefield", "Bullseye, Death Dealer");
      expect(ability(s, "p1", bullseye, /sacrifiez/)).toBeUndefined();
      s = settle(activate(s, "p1", bullseye, { targets: { t: ["p2"] } }, /défaussez/), answering(["Opt"]));
      expect(s.players.p2?.life).toBe(18);
      expect(handNames(s)).toEqual(["Forest"]);
    });

    it("Cloak and Dagger : exile une carte non-terrain de la main adverse jusqu'à leur départ", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), "Mountain"],
          hand: ["Cloak and Dagger, Entwined", "Lightning Strike"],
        },
        p2: { hand: ["Shivan Dragon", "Forest"], battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Cloak and Dagger, Entwined"), answering(["p2", "Shivan Dragon"]));
      expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      // Ils quittent le champ de bataille : la carte revient dans la main de son propriétaire.
      const cd = idOf(s, "p1", "battlefield", "Cloak and Dagger, Entwined");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [cd] } }));
      expect(handNames(s, "p2")).toContain("Shivan Dragon");
    });

    it("Cloak and Dagger : sans carte non-terrain en main, la créature choisie est exilée jusqu'à leur départ", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Cloak and Dagger, Entwined"] },
        p2: { hand: ["Forest"], battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Cloak and Dagger, Entwined"), answering(["p2", angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(handNames(s, "p2")).toEqual(["Forest"]);
    });

    it("Cloak and Dagger à plusieurs : la créature ciblée est une créature que contrôle l'adversaire ciblé (PLAN-H, H2)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Cloak and Dagger, Entwined"] },
        p2: { hand: ["Forest"], battlefield: ["Bear Cub"] },
        p3: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p3", "battlefield", "Serra Angel");
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Cloak and Dagger, Entwined"), (req, player, cur) => {
        if (req.type === "pick" && req.options.includes(bear)) offered = req.options.map(String);
        return answering(["p2", bear])(req, player, cur);
      });
      // L'Ange de p3 n'est pas proposé une fois p2 ciblé.
      expect(offered).toContain(bear);
      expect(offered).not.toContain(angel);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p3", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Cloak and Dagger : la créature ciblée passée sous votre contrôle en réponse n'est plus une cible légale (608.2b)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Cloak and Dagger, Entwined"] },
        p2: { hand: ["Forest"], battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = cast(s, "p1", "Cloak and Dagger, Entwined");
      // Jusqu'à la capacité déclenchée sur la pile, cibles choisies.
      for (let i = 0; i < 50 && !s.stack.some((x) => x.kind !== "spell"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice")
          s = act(s, p.player, {
            type: "choose",
            values: answering(["p2", bear])(p.request, p.player, s) ?? p.request.suggested,
          });
        else break;
      }
      expect(s.stack.some((x) => x.kind !== "spell")).toBe(true);
      steal(s, bear, "p1");
      s = settle(s);
      expect(exiled(s, "Bear Cub")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("The Coming of Galactus : I détruit un permanent non-terrain ; IV crée Galactus, 16/16 légendaire, vol et piétinement", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["The Coming of Galactus"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "The Coming of Galactus"), answering([idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["The Coming of Galactus"] }, p2: { battlefield: ["Forest"] }, step: "upkeep" });
      setCounters(t, idOf(t, "p1", "battlefield", "The Coming of Galactus"), "lore", 3);
      t = advanceUntil(t, (x) => idsOf(x, "p1", "battlefield", "Galactus").length > 0);
      const galactus = idOf(t, "p1", "battlefield", "Galactus");
      const c = chars(t, galactus);
      expect([c.power, c.toughness]).toEqual([16, 16]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
      expect(c.colors).toEqual(["B"]);
      // Quand Galactus attaque, il détruit un terrain ciblé.
      t = settle(advanceUntil(t, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step === "main1"));
      t = settle(declare(t, [galactus]), answering([idOf(t, "p2", "battlefield", "Forest")]));
      expect(idsOf(t, "p2", "graveyard", "Forest")).toHaveLength(1);
    });

    it("Daredevil : quand vous attaquez, exile le dessus ; un Héros lui donne +2/+1, et la carte est jouable ce tour-ci", () => {
      let s = scenario({
        p1: {
          battlefield: ["Daredevil, Man Without Fear", ...lands("Forest", 3)],
          library: ["Spider-Man, To the Rescue", "Island"],
        },
      });
      const dd = idOf(s, "p1", "battlefield", "Daredevil, Man Without Fear");
      s = settle(declare(s, [dd]), answering([], true));
      expect(exiled(s, "Spider-Man, To the Rescue")).toHaveLength(1);
      expect(pt(s, dd)).toEqual([5, 5]);
      const spidey = exiled(s, "Spider-Man, To the Rescue")[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === spidey)).toBe(true);
    });

    it("Iron Man : +1/+0 par autre artefact ; en attaquant, piochez si un artefact est arrivé sous votre contrôle ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["Iron Man, Master of Machines", RELIC, ...lands("Island", 2)], hand: [AUTOMATON] },
      });
      const iron = idOf(s, "p1", "battlefield", "Iron Man, Master of Machines");
      expect(pt(s, iron)).toEqual([2, 4]);
      const noArtifact = settle(declare(s, [iron]));
      expect(noArtifact.players.p1?.hand).toHaveLength(1);
      s = settle(cast(s, "p1", AUTOMATON.name));
      expect(pt(s, iron)).toEqual([3, 4]);
      s = settle(declare(s, [iron]));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Kang : en attaquant, il complote ; votre deuxième carte piochée ce tour-ci : chaque adversaire perd 1 PV, vous gagnez 1 PV", () => {
      let s = scenario({
        p1: { battlefield: ["Kang, Temporal Tyrant", ...lands("Island", 2)], hand: ["Opt", "Opt"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p2?.life).toBe(20);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Killmonger : sacrifiez une autre créature : détruit un permanent non-terrain adverse ; +2/+1 avec deux créatures au cimetière", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Killmonger, Scourge of Wakanda"],
          graveyard: ["Llanowar Elves"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Killmonger, Scourge of Wakanda"), answering(["Bear Cub", angel]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Killmonger, Scourge of Wakanda"))).toEqual([5, 4]);
    });

    it("King T'Challa : un joueur pioche sa deuxième carte, vous piochez ; transformé, Black Panther prévient toutes les blessures", () => {
      let s = scenario({
        p1: {
          battlefield: ["King T'Challa // Black Panther, Hope Enduring", ...lands("Island", 4), ...lands("Plains", 4)],
          hand: ["Opt", "Opt"],
        },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Opt"));
      // Deux cartes d'Opt, plus une de T'Challa.
      expect(s.players.p1?.hand).toHaveLength(3);
      const king = idOf(s, "p1", "battlefield", "King T'Challa // Black Panther, Hope Enduring");
      s = settle(activate(s, "p1", king, {}, /Transformez/));
      expect(chars(s, king).name).toBe("Black Panther, Hope Enduring");
      expect(chars(s, king).keywords).toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p2");
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [king] } }));
      expect(s.objects[king]?.damage ?? 0).toBe(0);
    });

    it("The Kingpin of Crime : extorsion ; payez 2 PV en attaquant : il blesse selon son endurance", () => {
      let s = scenario({
        p1: { battlefield: ["The Kingpin of Crime", "Plains", "Island"], hand: ["Opt"] },
      });
      s = settle(cast(s, "p1", "Opt"), answering([], true));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
      const kingpin = idOf(s, "p1", "battlefield", "The Kingpin of Crime");
      s = settle(declare(s, [kingpin]), answering([], true));
      expect(s.players.p1?.life).toBe(19);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(14);
    });

    it("Madame Hydra : chaque sort de Méchant lancé crée un Méchant 2/1 avec la menace", () => {
      let s = scenario({
        p1: { battlefield: ["Madame Hydra", ...lands("Island", 4)], hand: ["Ghost, Spectral Saboteur", "Opt"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(0);
      s = settle(cast(s, "p1", "Ghost, Spectral Saboteur"));
      expect(idsOf(s, "p1", "battlefield", "Villain")).toHaveLength(1);
      const ghost = idOf(s, "p1", "battlefield", "Ghost, Spectral Saboteur");
      expect(chars(s, ghost).keywords).toContain("unblockable");
    });

    it("The Mighty Thor : en attaquant, exile une créature non-jeton puis la renvoie engagée ; un Équipement arrive : piochez", () => {
      let s = scenario({
        p1: { battlefield: ["The Mighty Thor, Jane Foster"], hand: [BLADE] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", BLADE.name));
      expect(s.players.p1?.hand).toHaveLength(1);
      const thor = idOf(s, "p1", "battlefield", "The Mighty Thor, Jane Foster");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(declare(s, [thor]), answering([angel]));
      const back = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(back).not.toBe(angel);
      expect(s.objects[back]?.tapped).toBe(true);
      expect(s.objects[back]?.controller).toBe("p2");
    });

    it("Moon Girl and Devil Dinosaur : deuxième carte piochée, 6/6 et piétinement ; un artefact arrive : piochez, une fois par tour", () => {
      let s = scenario({
        p1: { battlefield: ["Moon Girl and Devil Dinosaur", ...lands("Island", 2)], hand: ["Opt", "Opt", BLADE, BLADE] },
      });
      const moon = idOf(s, "p1", "battlefield", "Moon Girl and Devil Dinosaur");
      s = settle(cast(s, "p1", BLADE.name));
      s = settle(cast(s, "p1", BLADE.name));
      // Une seule pioche pour deux artefacts : c'est la première carte du tour.
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(pt(s, moon)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, moon)).toEqual([6, 6]);
      expect(chars(s, moon).keywords).toContain("trample");
    });

    it("Speedball : un sort qui le cible lui donne +2/+2, et vous pouvez en changer la cible", () => {
      let s = scenario({
        p1: { battlefield: ["Speedball, New Warrior"] },
        p2: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Lightning Strike"] },
      });
      const speed = idOf(s, "p1", "battlefield", "Speedball, New Warrior");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p2");
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [speed] } }), answering([bear]));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, speed)).toEqual([4, 4]);
      expect(s.objects[speed]?.damage ?? 0).toBe(0);
    });

    it("Spider-Man, To the Rescue : engagez-le en arrivant : une autre créature non attaquante devient indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Spider-Man, To the Rescue"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Spider-Man, To the Rescue"), answering([bear], true));
      const spidey = idOf(s, "p1", "battlefield", "Spider-Man, To the Rescue");
      expect(s.objects[spidey]?.tapped).toBe(true);
      expect(chars(s, bear).keywords).toContain("indestructible");
    });

    it("Spider-Woman : engage une créature adverse, qui ne se dégage plus tant que Spider-Woman reste", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4)], hand: ["Spider-Woman, Secret Agent"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spider-Woman, Secret Agent"), answering([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("The Super Hero Civil War : I, contrôle de deux créatures de valeur de mana totale 6 ou moins ; III, combat", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["The Super Hero Civil War"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "The Super Hero Civil War"), answering([bear, elves]));
      expect(s.objects[bear]?.controller).toBe("p1");
      expect(s.objects[elves]?.controller).toBe("p1");
      let t = scenario({
        p1: { battlefield: ["The Super Hero Civil War", "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
        step: "upkeep",
      });
      setCounters(t, idOf(t, "p1", "battlefield", "The Super Hero Civil War"), "lore", 2);
      const angel = idOf(t, "p1", "battlefield", "Serra Angel");
      t = settle(
        advanceUntil(t, (x) => x.turn.step === "main1"),
        answering([angel, idOf(t, "p2", "battlefield", "Bear Cub")]),
      );
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(t.objects[angel]?.damage).toBe(2);
    });

    it("Thanos : montée en puissance, deux marqueurs +1/+1 et les autres créatures de la parité choisie sont détruites", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Thanos, the Mad Titan",
            "Bear Cub",
            "Llanowar Elves",
            WASTES,
            "Plains",
            "Island",
            "Swamp",
            "Mountain",
            "Forest",
          ],
        },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const thanos = idOf(s, "p1", "battlefield", "Thanos, the Mad Titan");
      s = settle(activate(s, "p1", thanos), (req) =>
        req.intent === "chooseOnEnter" && req.type === "pick" ? ["odd"] : undefined,
      );
      expect(s.objects[thanos]?.counters["+1/+1"]).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Thanos, the Mad Titan")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("U.S.Agent : en arrivant, un Équipement Sturdy Shield (+1/+2, équiper {2}) attaché à lui", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["U.S.Agent, John Walker"] } });
      s = settle(cast(s, "p1", "U.S.Agent, John Walker"));
      const agent = idOf(s, "p1", "battlefield", "U.S.Agent, John Walker");
      const shield = idOf(s, "p1", "battlefield", "Sturdy Shield");
      expect(s.objects[shield]?.attachedTo).toBe(agent);
      expect(pt(s, agent)).toEqual([4, 4]);
      expect(chars(s, shield).subtypes).toContain("Equipment");
    });

    it("Vision Quest : une créature-artefact de VM X ou moins de votre cimetière, avec X marqueurs +1/+1, célérité si X ≥ 4", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), ...lands("Mountain", 3)], hand: ["Vision Quest"], graveyard: [AUTOMATON] },
      });
      s = settle(cast(s, "p1", "Vision Quest", { x: 4 }), answering([AUTOMATON.name]));
      const auto = idOf(s, "p1", "battlefield", AUTOMATON.name);
      expect(pt(s, auto)).toEqual([5, 5]);
      expect(chars(s, auto).keywords).toContain("haste");
    });

    it("Vision Quest : sinon dans la bibliothèque, sans célérité si X < 4", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Mountain", 2)],
          hand: ["Vision Quest"],
          library: [AUTOMATON, "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Vision Quest", { x: 2 }), answering([AUTOMATON.name]));
      const auto = idOf(s, "p1", "battlefield", AUTOMATON.name);
      expect(pt(s, auto)).toEqual([3, 3]);
      expect(chars(s, auto).keywords).not.toContain("haste");
    });

    it("War Machine : au début du combat, une autre de vos créatures gagne +X/+0, X étant sa force", () => {
      let s = scenario({ p1: { battlefield: ["War Machine, Legacy of Iron", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(
        s,
        (x) => x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && chars(x, bear).power > 2,
      );
      expect(pt(s, bear)).toEqual([3, 2]);
    });

    it("Winter Soldier : revient du cimetière avec un marqueur de finalité et un Équipement attaché ; +2/+0 par Équipement", () => {
      let s = scenario({
        p1: { battlefield: [BLADE, ...lands("Plains", 3), ...lands("Swamp", 2)], graveyard: ["Winter Soldier, Icy Assassin"] },
      });
      const soldierCard = idOf(s, "p1", "graveyard", "Winter Soldier, Icy Assassin");
      s = settle(activate(s, "p1", soldierCard), answering([BLADE.name], true));
      const soldier = idOf(s, "p1", "battlefield", "Winter Soldier, Icy Assassin");
      expect(s.objects[soldier]?.counters.finality).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", BLADE.name)]?.attachedTo).toBe(soldier);
      expect(pt(s, soldier)).toEqual([4, 2]);
    });
  });
});

describe("lot A, incolores et terrains", () => {
  type S = GameState;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const libraryNames = (s: S, p = "p1") => (s.players[p]?.library ?? []).map((id) => nameOf(s, id));

  /** Capacité activable de `source` dont le libellé correspond (la première sinon). */
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  /** Créature blanche de test à {W}, Héros ou Méchant au besoin. */
  const whiteOne = (name: string, subtypes: string[] = []) =>
    customCard({
      name,
      subtypes,
      typeLine: `Creature — ${subtypes.join(" ") || "Human"}`,
      manaCost: { generic: 0, colored: { W: 1 }, x: 0 },
      manaCostText: "{W}",
      colors: ["W"],
      power: 1,
      toughness: 1,
    });
  /** Rituel noir de test à {B}. */
  const blackSorcery = customCard({
    name: "Test Black Sorcery",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 0, colored: { B: 1 }, x: 0 },
    manaCostText: "{B}",
    colors: ["B"],
  });

  describe("Marvel Super Heroes, lot A — incolores et terrains", () => {
    it("A.I.M. Synthoids : en arrivant, surveillance 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["A.I.M. Synthoids"], library: ["Opt", "Bear Cub", "Island"] },
      });
      let offered: string[] = [];
      s = settle(cast(s, "p1", "A.I.M. Synthoids"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
        return req.options;
      });
      expect(offered.sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(libraryNames(s)).toEqual(["Island"]);
    });

    it("Captain America's Shield : +0/+8, vigilance, indestructible ; en attaquant, engage une créature du défenseur", () => {
      let s = scenario({
        p1: { battlefield: ["Captain America's Shield", "Bear Cub", ...lands("Plains", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const shield = idOf(s, "p1", "battlefield", "Captain America's Shield");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(chars(s, shield).keywords).toContain("indestructible");
      s = settle(activate(s, "p1", shield, { targets: { t: [bear] } }, /Équiper/));
      expect(s.objects[shield]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([2, 10]);
      expect(chars(s, bear).keywords).toContain("vigilance");
      s = settle(attack(s, [bear]), picking([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    describe("Cosmic Cube", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: ["Cosmic Cube", "Bear Cub"],
            library: ["Shivan Dragon", "Llanowar Elves", "Forest", "Opt", "Serra Angel", "Forest", "Island"],
          },
        });

      it("vous attaquez : lancez gratuitement un sort de VM au plus la plus grande force attaquante parmi les six du dessus", () => {
        let s = setup();
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        let offered: string[] = [];
        s = untilCastNowPicking(attack(s, [bear]), (req, _p, cur) => {
          if (req.intent !== "lookAtTop" || req.type !== "pick") return undefined;
          offered = req.options.map((id) => nameOf(cur, String(id)) ?? "");
          return req.options.filter((id) => nameOf(cur, String(id)) === "Llanowar Elves");
        });
        // Force 2 : ni Shivan Dragon (6), ni Serra Angel (5), ni les terrains.
        expect(offered.sort()).toEqual(["Llanowar Elves", "Opt"]);
        const elves = castNowOf(s)?.cards[0] as string;
        expect(nameOf(s, elves)).toBe("Llanowar Elves");
        s = act(s, "p1", { type: "cast", card: elves });
        s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        // Les cinq autres vont au-dessous ; la septième carte est maintenant au-dessus.
        expect(libraryNames(s)[0]).toBe("Island");
        expect(libraryNames(s).slice(1).sort()).toEqual(["Forest", "Forest", "Opt", "Serra Angel", "Shivan Dragon"]);
      });

      it("sort refusé : la carte va aussi au-dessous de la bibliothèque", () => {
        let s = setup();
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = untilCastNowPicking(attack(s, [bear]), (req, _p, cur) =>
          req.intent === "lookAtTop" && req.type === "pick"
            ? req.options.filter((id) => nameOf(cur, String(id)) === "Llanowar Elves")
            : undefined,
        );
        s = act(s, "p1", { type: "pass" });
        s = settle(s);
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
        expect(libraryNames(s)[0]).toBe("Island");
        expect(libraryNames(s)).toHaveLength(7);
      });
    });

    it("H.E.R.B.I.E. Scout Unit : piochez, puis vous pouvez mettre un terrain de votre main engagé", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["H.E.R.B.I.E. Scout Unit", "Forest"], library: ["Island", "Opt"] },
      });
      const forest = idOf(s, "p1", "hand", "Forest");
      s = settle(cast(s, "p1", "H.E.R.B.I.E. Scout Unit"), picking([forest]));
      expect(handNames(s)).toEqual(["Island"]);
      const onField = idOf(s, "p1", "battlefield", "Forest");
      expect(s.objects[onField]?.tapped).toBe(true);
      // Ce n'est pas le terrain joué du tour.
      expect(s.turn.landsPlayed).toBe(0);
    });

    describe("Iron Man Armor", () => {
      it("en arrivant, s'attache à une de vos créatures : +2/+1 et le vol", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Iron Man Armor"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Iron Man Armor"), picking([bear]));
        expect(s.objects[idOf(s, "p1", "battlefield", "Iron Man Armor")]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 3]);
        expect(chars(s, bear).keywords).toContain("flying");
      });

      it("{2} : devient une créature-artefact Construction Héros 0/0 volante, +1/+1 par artefact, jusqu'à la fin du tour", () => {
        let s = scenario({
          p1: { battlefield: ["Iron Man Armor", "Vibranium Energy Daggers", "Vibranium Energy Daggers", ...lands("Plains", 4)] },
        });
        const armor = idOf(s, "p1", "battlefield", "Iron Man Armor");
        s = settle(activate(s, "p1", armor, {}, /Devient/));
        const c = chars(s, armor);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toEqual(expect.arrayContaining(["Construct", "Hero"]));
        expect(c.keywords).toContain("flying");
        expect(pt(s, armor)).toEqual([3, 3]);
        // Déjà une créature : la seconde activation est sans effet.
        s = settle(activate(s, "p1", armor, {}, /Devient/));
        expect(pt(s, armor)).toEqual([3, 3]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, armor).types).not.toContain("Creature");
      });
    });

    it("S.H.I.E.L.D. Helicarrier : en arrivant, deux Soldats 1/1 blancs", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["S.H.I.E.L.D. Helicarrier"] } });
      s = settle(cast(s, "p1", "S.H.I.E.L.D. Helicarrier"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect(pt(s, soldiers[0] as string)).toEqual([1, 1]);
      expect(chars(s, soldiers[0] as string).colors).toEqual(["W"]);
    });

    describe("The Ten Rings", () => {
      it("à votre étape de fin, piochez jusqu'à avoir dix cartes en main, et vous les gardez", () => {
        let s = scenario({ p1: { battlefield: ["The Ten Rings"], hand: ["Opt", "Opt", "Opt"], library: lands("Island", 12) } });
        s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(10);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(10);
      });

      it("votre taille de main maximale est de dix : avec douze cartes, défaussez jusqu'à dix au nettoyage", () => {
        let s = scenario({ p1: { battlefield: ["The Ten Rings"], hand: lands("Island", 12), library: lands("Island", 5) } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(10);
        expect(s.players.p1?.graveyard).toHaveLength(2);
      });

      it("dix cartes ou plus en main : rien n'est pioché", () => {
        let s = scenario({ p1: { battlefield: ["The Ten Rings"], hand: lands("Island", 10), library: lands("Island", 5) } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.library).toHaveLength(5);
      });
    });

    describe("Ultron, Artificial Malevolence", () => {
      it("un autre artefact non-jeton arrive : payez {2}, un jeton copie qui devient une créature Robot Méchant 2/2", () => {
        let s = scenario({
          p1: { battlefield: ["Ultron, Artificial Malevolence", ...lands("Plains", 3)], hand: ["Vibranium Energy Daggers"] },
        });
        s = settle(cast(s, "p1", "Vibranium Energy Daggers"), (req) => (req.type === "yesNo" ? [1] : undefined));
        const daggers = idsOf(s, "p1", "battlefield", "Vibranium Energy Daggers");
        expect(daggers).toHaveLength(2);
        const token = daggers.find((id) => s.objects[id]?.isToken) as string;
        const c = chars(s, token);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Robot", "Villain"]));
        expect(pt(s, token)).toEqual([2, 2]);
        expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && s.objects[id]?.tapped)).toHaveLength(3);
      });

      it("une créature-artefact copiée garde ses caractéristiques ; refuser de payer ne crée rien", () => {
        let s = scenario({
          p1: { battlefield: ["Ultron, Artificial Malevolence", ...lands("Plains", 5)], hand: ["Ultron Drone", "Ultron Drone"] },
        });
        s = settle(cast(s, "p1", "Ultron Drone"), (req) => (req.type === "yesNo" ? [1] : undefined));
        const drones = idsOf(s, "p1", "battlefield", "Ultron Drone");
        expect(drones).toHaveLength(2);
        expect(drones.map((id) => pt(s, id))).toEqual([
          [2, 3],
          [2, 3],
        ]);
        let s2 = scenario({
          p1: { battlefield: ["Ultron, Artificial Malevolence", ...lands("Plains", 5)], hand: ["Ultron Drone"] },
        });
        s2 = settle(cast(s2, "p1", "Ultron Drone"), (req) => (req.type === "yesNo" ? [0] : undefined));
        expect(idsOf(s2, "p1", "battlefield", "Ultron Drone")).toHaveLength(1);
      });
    });

    it("Ultron Drone : montée en puissance {6}, deux marqueurs +1/+1 et un Robot Méchant 2/2 incolore", () => {
      let s = scenario({ p1: { battlefield: ["Ultron Drone", ...lands("Plains", 6)] } });
      const drone = idOf(s, "p1", "battlefield", "Ultron Drone");
      s = settle(activate(s, "p1", drone, {}, /Montée/));
      expect(pt(s, drone)).toEqual([4, 5]);
      const robot = idOf(s, "p1", "battlefield", "Robot Villain");
      expect(pt(s, robot)).toEqual([2, 2]);
      expect(chars(s, robot).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, robot).colors).toEqual([]);
      // Une seule fois par partie.
      expect(ability(s, "p1", drone, /Montée/)).toBeUndefined();
    });

    it("Vibranium Energy Daggers : indestructible, Équiper {3} : +2/+2", () => {
      let s = scenario({ p1: { battlefield: ["Vibranium Energy Daggers", "Bear Cub", ...lands("Plains", 3)] } });
      const daggers = idOf(s, "p1", "battlefield", "Vibranium Energy Daggers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, daggers).keywords).toContain("indestructible");
      s = settle(activate(s, "p1", daggers, { targets: { t: [bear] } }, /Équiper/));
      expect(pt(s, bear)).toEqual([4, 4]);
    });

    it("The Vision : un sort non-créature lancé, un mode pas encore choisi ce tour-ci", () => {
      let s = scenario({
        p1: { battlefield: ["The Vision", ...lands("Island", 2)], hand: ["Opt", "Opt"], library: lands("Island", 6) },
      });
      const vision = idOf(s, "p1", "battlefield", "The Vision");
      let modes: string[] = [];
      const chooseFirst: Answer = (req) => {
        if (req.intent !== "triggerMode" || req.type !== "pick") return undefined;
        modes = req.options.map(String);
        return [req.options[0] as string];
      };
      s = settle(cast(s, "p1", "Opt"), chooseFirst);
      expect(modes).toEqual(["0", "1", "2"]);
      expect(chars(s, vision).keywords).toContain("doubleStrike");
      s = settle(cast(s, "p1", "Opt"), chooseFirst);
      expect(modes).toEqual(["1", "2"]);
      expect(chars(s, vision).keywords).toContain("indestructible");
    });

    describe("Viv Vision, Teen Synthezoid", () => {
      it("en attaquant, piochez seulement si sa force est d'au moins 4", () => {
        let s = scenario({ p1: { battlefield: ["Viv Vision, Teen Synthezoid"], library: lands("Island", 5) } });
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Viv Vision, Teen Synthezoid")]));
        expect(s.players.p1?.hand).toHaveLength(0);
        let s2 = scenario({
          p1: { battlefield: [{ name: "Viv Vision, Teen Synthezoid", counters: { "+1/+1": 2 } }], library: lands("Island", 5) },
        });
        s2 = settle(attack(s2, [idOf(s2, "p1", "battlefield", "Viv Vision, Teen Synthezoid")]));
        expect(s2.players.p1?.hand).toHaveLength(1);
      });

      it("montée en puissance {7} : deux marqueurs +1/+1, pour {4} le tour où elle arrive", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Viv Vision, Teen Synthezoid"] } });
        s = settle(cast(s, "p1", "Viv Vision, Teen Synthezoid"));
        const viv = idOf(s, "p1", "battlefield", "Viv Vision, Teen Synthezoid");
        s = settle(activate(s, "p1", viv, {}, /Montée/));
        expect(pt(s, viv)).toEqual([4, 4]);
      });
    });

    it("terrains à gain de vie (Hell's Kitchen) : arrive engagé, vous gagnez 1 PV, {B} ou {R}", () => {
      let s = scenario({ p1: { hand: ["Hell's Kitchen"] } });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Hell's Kitchen") }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Hell's Kitchen")]?.tapped).toBe(true);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Dark Fortress : {B} ou {R} seulement s'il est arrivé ce tour-ci ou si vous contrôlez un terrain de base", () => {
      const without = scenario({ p1: { battlefield: ["Dark Fortress"], hand: [blackSorcery] } });
      expect(castable(without, "p1", idOf(without, "p1", "hand", "Test Black Sorcery"))).toBe(false);
      const withBasic = scenario({
        p1: { battlefield: ["Dark Fortress", { name: "Plains", tapped: true }], hand: [blackSorcery] },
      });
      expect(castable(withBasic, "p1", idOf(withBasic, "p1", "hand", "Test Black Sorcery"))).toBe(true);
      let fresh = scenario({ p1: { hand: ["Dark Fortress", blackSorcery] } });
      fresh = act(fresh, "p1", { type: "playLand", card: idOf(fresh, "p1", "hand", "Dark Fortress") });
      expect(castable(fresh, "p1", idOf(fresh, "p1", "hand", "Test Black Sorcery"))).toBe(true);
    });

    describe("Avengers Tower", () => {
      it("mana de n'importe quelle couleur seulement pour un sort de Héros", () => {
        const hero = whiteOne("Test Hero", ["Human", "Hero"]);
        const other = whiteOne("Test Citizen");
        const s = scenario({ p1: { battlefield: ["Avengers Tower"], hand: [hero, other] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Hero"))).toBe(true);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Citizen"))).toBe(false);
      });

      it("{4}, {T} : une carte de Héros parmi les trois du dessus en main, le reste au-dessous", () => {
        let s = scenario({
          p1: {
            battlefield: ["Avengers Tower", ...lands("Plains", 4)],
            library: ["Opt", "The Vision", "Bear Cub", "Island"],
          },
        });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Avengers Tower"), {}, /trois/));
        expect(handNames(s)).toEqual(["The Vision"]);
        expect(libraryNames(s)[0]).toBe("Island");
      });
    });

    it("Baxter Building : {4}, {T} : piochez, seulement avec une créature d'endurance 4 ou plus", () => {
      const s = scenario({ p1: { battlefield: ["Baxter Building", "Bear Cub", ...lands("Plains", 4)] } });
      const baxter = idOf(s, "p1", "battlefield", "Baxter Building");
      expect(ability(s, "p1", baxter, /Piochez/)).toBeUndefined();
      let s2 = scenario({ p1: { battlefield: ["Baxter Building", "Serra Angel", ...lands("Plains", 4)], library: ["Opt"] } });
      s2 = settle(activate(s2, "p1", idOf(s2, "p1", "battlefield", "Baxter Building"), {}, /Piochez/));
      expect(handNames(s2)).toEqual(["Opt"]);
    });

    it("Surveillance Room : en arrivant, surveillance 1", () => {
      let s = scenario({ p1: { hand: ["Surveillance Room"], library: ["Opt", "Island"] } });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Surveillance Room") }), (req) =>
        req.type === "pick" ? req.options : undefined,
      );
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });

    it("Villainous Hideout : {3}, {T} : un de vos Méchants complote, en rituel", () => {
      let s = scenario({
        p1: { battlefield: ["Villainous Hideout", "Ultron Drone", "Bear Cub", ...lands("Plains", 3)], library: ["Opt"] },
      });
      const hideout = idOf(s, "p1", "battlefield", "Villainous Hideout");
      const drone = idOf(s, "p1", "battlefield", "Ultron Drone");
      const legal = ability(s, "p1", hideout, /complote/)?.targets[0]?.legal ?? [];
      expect(legal).toEqual([drone]);
      s = settle(activate(s, "p1", hideout, { targets: { t: [drone] } }, /complote/));
      // Opt (non-terrain) pioché puis défaussé : un marqueur +1/+1.
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(s.objects[drone]?.counters["+1/+1"]).toBe(1);
    });
  });

  /** Passe et suit les choix (avec `answer`) jusqu'à une priorité « lancer maintenant ». */
  function untilCastNowPicking(s: S, answer: Answer): S {
    let cur = s;
    for (let i = 0; i < 300 && !castNowOf(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  }
});

describe("lot B1 : improvisation", () => {
  const relic = customCard({ name: "Test Relic", types: ["Artifact"], typeLine: "Artifact" });

  it("Arc Reactor : improvisation (vos artefacts dégagés paient {1} chacun) ; arrive engagé ; {T} : {C}{C}{C}", () => {
    const short = scenario({ p1: { battlefield: [...lands("Island", 2), relic, relic], hand: ["Arc Reactor"] } });
    expect(castable(short, "p1", idOf(short, "p1", "hand", "Arc Reactor"))).toBe(false);
    let s = scenario({ p1: { battlefield: [...lands("Island", 2), relic, relic, relic], hand: ["Arc Reactor"] } });
    s = settle(cast(s, "p1", "Arc Reactor"));
    const reactor = idOf(s, "p1", "battlefield", "Arc Reactor");
    expect(s.objects[reactor]?.tapped).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Test Relic").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Ironheart, Clever Champion : vos sorts non-créature ont l'improvisation, pas vos sorts de créature", () => {
    const divination = customCard({
      name: "Test Divination",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 2, colored: { U: 1 }, x: 0 },
      manaCostText: "{2}{U}",
      colors: ["U"],
      spell: spell([], [fx.draw(1)]),
    });
    const golem = customCard({
      name: "Test Golem",
      manaCost: { generic: 3, colored: {}, x: 0 },
      manaCostText: "{3}",
      power: 3,
      toughness: 3,
    });
    const s = scenario({
      p1: { battlefield: ["Ironheart, Clever Champion", "Island", relic, relic], hand: [divination, golem] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Divination"))).toBe(true);
    // Créature à {3} : pas d'improvisation pour un sort de créature (une seule Île).
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Golem"))).toBe(false);
  });
});

describe("lot B2 : marqueurs de bouclier ; B3 : engagements", () => {
  it("Captain America, Super-Soldier : le marqueur de bouclier remplace des blessures, puis une destruction ; défense talismanique tant qu'il en a", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Agent Phil Coulson"], hand: ["Captain America, Super-Soldier"] },
      p2: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Captain America, Super-Soldier"));
    const cap = idOf(s, "p1", "battlefield", "Captain America, Super-Soldier");
    expect(s.objects[cap]?.counters.shield).toBe(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Agent Phil Coulson")).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    // Le joueur 1 a la défense talismanique : la Foudre ne peut pas le cibler ; Captain America, si (il n'est pas un « autre » Héros).
    expect(() => cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } })).toThrow();
    s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [cap] } }));
    expect(s.objects[cap]?.damage).toBe(0);
    expect(s.objects[cap]?.counters.shield ?? 0).toBe(0);
    expect(chars(s, idOf(s, "p1", "battlefield", "Agent Phil Coulson")).keywords).not.toContain("hexproof");
    s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [cap] } }));
    expect(idsOf(s, "p1", "battlefield", "Captain America, Super-Soldier")).toHaveLength(0);
  });

  it("marqueur de bouclier : une destruction est remplacée par le retrait du marqueur (122.1c)", () => {
    const s = scenario({ p1: { battlefield: [{ name: "Bear Cub", counters: { shield: 1 } }] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(destroy(s, bear)).toBe(false);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.objects[bear]?.counters.shield ?? 0).toBe(0);
  });

  it("Agent Maria Hill : engagée pour payer un travail d'équipe, un marqueur +1/+1 et une carte", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 2), "Agent Maria Hill", "Serra Angel"],
        hand: ["Murdock's Crusade"],
        library: lands("Plains", 3),
      },
      p2: { battlefield: ["Serra Angel", "Omniscience"] },
    });
    const hill = idOf(s, "p1", "battlefield", "Agent Maria Hill");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const hand = (s.players.p1?.hand.length ?? 0) - 1;
    // Travail d'équipe payé : les deux modes.
    s = settle(
      cast(s, "p1", "Murdock's Crusade", {
        mode: 2,
        kicked: true,
        tap: [hill, angel],
        targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")], u: [idOf(s, "p2", "battlefield", "Omniscience")] },
      }),
    );
    expect(s.objects[hill]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Captain America, Living Legend : pendant votre tour, une créature engagée pour la première fois ce tour-ci se dégage", () => {
    let s = scenario({ p1: { battlefield: ["Captain America, Living Legend", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = settle(s);
    expect(s.objects[bear]?.tapped).toBe(false);
    expect(s.objects[bear]?.tapsThisTurn).toBe(1);
  });
});

describe("lot B3 : montée en puissance", () => {
  it("Hulk, Gamma Goliath : les montées en puissance de vos autres créatures coûtent {3} de moins (pas la sienne)", () => {
    // Human Torch : montée en puissance {6}{R} ; avec Hulk, {3}{R}.
    const s = scenario({ p1: { battlefield: ["Hulk, Gamma Goliath", "Human Torch, Johnny Storm", ...lands("Mountain", 4)] } });
    const torch = idOf(s, "p1", "battlefield", "Human Torch, Johnny Storm");
    const hulk = idOf(s, "p1", "battlefield", "Hulk, Gamma Goliath");
    expect(ability(s, "p1", torch, /Montée en puissance/)).toBeDefined();
    expect(ability(s, "p1", hulk, /Montée en puissance/)).toBeUndefined();
  });

  it("Wonder Man, Hollywood Hero : chaque montée en puissance peut être activée une fois de plus (deux fois, pas trois)", () => {
    let s = scenario({ p1: { battlefield: ["Wonder Man, Hollywood Hero", ...lands("Mountain", 21)] } });
    const wonder = idOf(s, "p1", "battlefield", "Wonder Man, Hollywood Hero");
    s = settle(activate(s, "p1", wonder, {}, /Montée en puissance/));
    s = settle(activate(s, "p1", wonder, {}, /Montée en puissance/));
    expect(s.objects[wonder]?.counters["+1/+1"]).toBe(4);
    expect(ability(s, "p1", wonder, /Montée en puissance/)).toBeUndefined();
  });
});

describe("lot C1 : caractéristiques, filtres et coûts", () => {
  it("Super-Adaptoid : sa force vaut vos créatures légendaires ; il copie en marqueurs les capacités qu'il n'a pas", () => {
    let s = scenario({
      p1: { battlefield: ["Wonder Man, Hollywood Hero", "Bear Cub", "Mountain", "Mountain"], hand: ["Super-Adaptoid"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Super-Adaptoid"), picking([angel]));
    const robot = idOf(s, "p1", "battlefield", "Super-Adaptoid");
    // Légendaires : Wonder Man et Super-Adaptoid lui-même.
    expect(chars(s, robot).power).toBe(2);
    expect(s.objects[robot]?.counters.flying).toBe(1);
    expect(s.objects[robot]?.counters.vigilance).toBe(1);
    expect(s.objects[robot]?.counters.trample).toBeUndefined();
  });

  it("Ares, God of War : une de vos créatures attaquantes meurt, elle revient en main", () => {
    let s = scenario({ p1: { battlefield: ["Ares, God of War", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const ares = idOf(s, "p1", "battlefield", "Ares, God of War");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: bear, defender: "p2" },
        { id: ares, defender: "p2" },
      ],
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: bear }],
    });
    s = settle(s);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Namor the Sub-Mariner : un Ondin par symbole {U} d'un sort non-créature ; sa force vaut vos Ondins", () => {
    let s = scenario({
      p1: { battlefield: ["Namor the Sub-Mariner", "Island", "Island", "Island"], hand: ["Opt"], library: lands("Island", 3) },
    });
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Merfolk")).toHaveLength(1);
    // Namor est lui-même un Ondin.
    expect(chars(s, idOf(s, "p1", "battlefield", "Namor the Sub-Mariner")).power).toBe(2);
  });

  it("Kid Loki : vos créatures sur lesquelles vous avez mis des marqueurs +1/+1 ce tour-ci ont la défense talismanique", () => {
    const s = scenario({ p1: { battlefield: ["Kid Loki", "Bear Cub", "Serra Angel"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    changeCounters(s, s.objects[bear]!, "+1/+1", 1);
    changeCounters(s, s.objects[angel]!, "-1/-1", 1);
    expect(chars(s, bear).keywords).toContain("hexproof");
    expect(chars(s, angel).keywords).not.toContain("hexproof");
  });

  it("The Astonishing Ant-Man : retirez X marqueurs +1/+1 : X Insectes 1/1", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "The Astonishing Ant-Man", counters: { "+1/+1": 3 } }, ...lands("Forest", 3)] },
    });
    const ant = idOf(s, "p1", "battlefield", "The Astonishing Ant-Man");
    s.objects[ant]!.controlledSince = 0;
    expect(ability(s, "p1", ant)?.xMax).toBe(3);
    s = settle(activate(s, "p1", ant, { x: 2 }));
    expect(idsOf(s, "p1", "battlefield", "Insect")).toHaveLength(2);
    expect(s.objects[ant]?.counters["+1/+1"]).toBe(1);
  });

  it("Hawkeye, Young Avenger : vos blessures non de combat aux adversaires augmentent de sa force", () => {
    let s = scenario({ p1: { battlefield: ["Hawkeye, Young Avenger", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(15);
  });

  it("Shang-Chi, Master of Kung Fu : les capacités {T} de vos créatures s'activent malgré le mal d'invocation", () => {
    const s = scenario({ p1: { battlefield: ["Shang-Chi, Master of Kung Fu", { name: "Llanowar Elves", sick: true }] } });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === elves)).toBe(true);
    const without = scenario({ p1: { battlefield: [{ name: "Llanowar Elves", sick: true }] } });
    const lone = idOf(without, "p1", "battlefield", "Llanowar Elves");
    expect(legalActions(without, "p1").some((a) => a.type === "tapForMana" && a.source === lone)).toBe(false);
  });

  it("Powerful Broker : un marqueur de plus de chaque sorte sur le permanent ciblé", () => {
    let s = scenario({ p1: { battlefield: ["Powerful Broker", { name: "Bear Cub", counters: { "+1/+1": 1, flying: 1 } }] } });
    const broker = idOf(s, "p1", "battlefield", "Powerful Broker");
    s.objects[broker]!.controlledSince = 0;
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", broker, { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters.flying).toBe(2);
  });
});

describe("lot C2 : copies, contrôle et cibles", () => {
  /** Va jusqu'à votre prochaine première phase principale, en répondant aux choix. */
  const nextMain = (s: S, answer: Answer = () => undefined) => {
    const turn = s.turn.number;
    let cur = s;
    for (
      let i = 0;
      i < 400 &&
      !(
        cur.turn.number > turn &&
        cur.turn.active === "p1" &&
        cur.turn.step === "main1" &&
        cur.stack.length === 0 &&
        cur.triggers.length === 0 &&
        cur.pending?.kind === "priority"
      );
      i++
    ) {
      const p = cur.pending;
      if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard")
        cur = act(cur, p.player, { type: "discard", cards: (cur.players[p.player]?.hand ?? []).slice(0, p.count) });
      else if (p) cur = act(cur, p.player, { type: "pass" });
    }
    return cur;
  };

  it("Absorbing Man : à votre première phase principale, copie d'un artefact jusqu'à votre prochain tour, Humain Méchant légendaire 4/4", () => {
    let s = scenario({ p1: { battlefield: ["Absorbing Man", "Arc Reactor"] } });
    const man = idOf(s, "p1", "battlefield", "Absorbing Man");
    const reactor = idOf(s, "p1", "battlefield", "Arc Reactor");
    s = nextMain(s, (req) => (req.type === "pick" && req.options.includes(reactor) ? [reactor] : undefined));
    const c = chars(s, man);
    expect(c.name).toBe("Absorbing Man");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toContain("vigilance");
    expect(manaAbilitiesOf(s, man).length).toBeGreaterThan(0);
  });

  it("Taskmaster, Mercenary Mimic : copie d'une carte de créature d'un cimetière, mais Taskmaster, Humain Mercenaire Méchant", () => {
    let s = scenario({ p1: { battlefield: ["Taskmaster, Mercenary Mimic"] }, p2: { graveyard: ["Serra Angel"] } });
    const task = idOf(s, "p1", "battlefield", "Taskmaster, Mercenary Mimic");
    const angel = idOf(s, "p2", "graveyard", "Serra Angel");
    s = nextMain(s, (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
    const c = chars(s, task);
    expect(c.name).toBe("Taskmaster, Mercenary Mimic");
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    expect(c.subtypes).toEqual(["Human", "Mercenary", "Villain"]);
    expect(c.power).toBe(4);
  });

  it("Evil's Thrall : contrôle jusqu'à la fin du tour, ou de votre prochain tour avec un Méchant de valeur de mana supérieure", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), ...battlefield], hand: ["Evil's Thrall"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Evil's Thrall", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.controller).toBe("p1");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      return s.objects[bear]?.controller;
    };
    expect(run([])).toBe("p2");
    // Crossbones (Méchant, valeur de mana 4) : supérieure à celle de Bear Cub (2).
    expect(run(["Crossbones, Malicious Mercenary"])).toBe("p1");
  });

  it("Loki, God of Mischief : une de vos capacités cible un joueur ou un permanent, piochez une carte (une fois par tour)", () => {
    const pinger = customCard({
      name: "Test Pinger",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [
        {
          kind: "activated",
          cost: {},
          targets: [target.player("t")],
          effects: [fx.damage(1, ref.target())],
          label: "1 blessure",
        },
      ],
    });
    let s = scenario({ p1: { battlefield: ["Loki, God of Mischief", pinger], library: lands("Island", 3) } });
    const ping = idOf(s, "p1", "battlefield", "Test Pinger");
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", ping, { targets: { t: ["p2"] } }));
    s = settle(activate(s, "p1", ping, { targets: { t: ["p2"] } }));
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Loki Laufeyson : le prochain éphémère ou rituel de valeur de mana au plus sa force est copié (pas un plus cher)", () => {
    let s = scenario({ p1: { battlefield: ["Loki Laufeyson", ...lands("Mountain", 4)], hand: ["Lightning Strike"] } });
    const loki = idOf(s, "p1", "battlefield", "Loki Laufeyson");
    s.objects[loki]!.controlledSince = 0;
    s = settle(activate(s, "p1", loki, {}, /prochain/));
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(14);
  });

  it("Scientist Supreme of A.I.M. : payez 2 PV, copiez une capacité d'une source artefact que vous contrôlez", () => {
    const pinger = customCard({
      name: "Test Pinger",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [
        {
          kind: "activated",
          cost: {},
          targets: [target.player("t")],
          effects: [fx.damage(1, ref.target())],
          label: "1 blessure",
        },
      ],
    });
    let s = scenario({ p1: { battlefield: ["Scientist Supreme of A.I.M.", pinger] } });
    const ping = idOf(s, "p1", "battlefield", "Test Pinger");
    const sup = idOf(s, "p1", "battlefield", "Scientist Supreme of A.I.M.");
    s = activate(s, "p1", ping, { targets: { t: ["p2"] } });
    const item = s.stack[0]?.id as string;
    s = settle(activate(s, "p1", sup, { targets: { t: [item] } }));
    expect(s.players.p1?.life).toBe(18);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Storm, Windrider : un sort qui cible des créatures leur donne le vol ; les créatures volantes ne peuvent pas vous attaquer", () => {
    let s = scenario({
      p1: { battlefield: ["Storm, Windrider", "Bear Cub", "Forest"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [bear] } }));
    expect(chars(s, bear).keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] })).toThrow();
  });

  it("Leader, Super-Genius : au début de votre combat, une de vos créatures complote ; vous piochez d'abord une carte", () => {
    let s = scenario({ p1: { battlefield: ["Leader, Super-Genius", "Bear Cub"], hand: [], library: lands("Island", 5) } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, picking([bear]));
    // Deux cartes piochées (une d'abord, une pour la connivence), une défaussée.
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });
});

describe("lot C3 : coûts, main et bibliothèque", () => {
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);
  it("Trickster's Stratagem : la créature adverse va en deuxième position de la bibliothèque (ou au-dessous) ; une des vôtres complote", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4).concat(["Bear Cub"]), hand: ["Trickster's Stratagem"], library: lands("Island", 3) },
      p2: { battlefield: ["Serra Angel"], library: ["Opt", "Opt", "Opt"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(
      cast(s, "p1", "Trickster's Stratagem", { targets: { t: [angel], c: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      (req) => (req.type === "pick" && req.options.includes("top") ? ["top"] : undefined),
    );
    expect(nameOf(s, s.players.p2?.library[1] as string)).toBe("Serra Angel");
    expect(s.players.p1?.graveyard.length).toBeGreaterThan(1);
  });

  it("Baron Helmut Zemo : vantardise après une attaque, en exilant des cartes noires (15 symboles {B}) ; jusqu'à trois copies gratuites", () => {
    const heavy = customCard({
      name: "Test Black Spell",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      colors: ["B"],
      manaCost: { generic: 0, colored: { B: 5 }, x: 0 },
      manaCostText: "{B}{B}{B}{B}{B}",
      spell: spell([], [fx.loseLife(1, ref.eachOpponent)]),
    });
    let s = scenario({ p1: { battlefield: ["Baron Helmut Zemo"], graveyard: [heavy, heavy, heavy] } });
    const zemo = idOf(s, "p1", "battlefield", "Baron Helmut Zemo");
    s.objects[zemo]!.controlledSince = 0;
    expect(ability(s, "p1", zemo)).toBeUndefined();
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: zemo, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    s = activate(s, "p1", zemo);
    for (let i = 0; i < 40 && (s.stack.length || s.pending?.kind !== "priority"); i++) {
      const p = s.pending;
      const now = castNowOf(s);
      if (now) s = act(s, "p1", { type: "cast", card: now.cards[0] as string });
      else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p) s = act(s, p.player, { type: "pass" });
    }
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.players.p2?.life).toBe(20 - 3 - 3);
  });

  it("Black Widow, Super Spy : le joueur blessé exile jusqu'à une carte non-terrain ; sans marqueur, vous pouvez la lancer", () => {
    let s = scenario({
      p1: { battlefield: ["Black Widow, Super Spy", "Mountain", "Mountain"] },
      p2: { library: ["Island", "Lightning Strike", "Island"] },
    });
    const widow = idOf(s, "p1", "battlefield", "Black Widow, Super Spy");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: widow, defender: "p2" }] });
    // Le marqueur est refusé : la carte non-terrain exilée devient lançable (avec du mana de n'importe quel type).
    for (let i = 0; i < 60 && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: p.request.type === "yesNo" ? [0] : p.request.suggested });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p) s = act(s, p.player, { type: "pass" });
    }
    const strike = exiled(s, "Lightning Strike")[0] as string;
    expect(exiled(s, "Island")).toHaveLength(1);
    expect(s.objects[widow]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(castable(s, "p1", strike)).toBe(true);
  });

  it("Klaw, Sonic Subjugator : le joueur révèle 1 + N cartes de son choix, vous choisissez celle qu'il défausse", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Klaw, Sonic Subjugator"], graveyard: ["Bear Cub"] },
      p2: { hand: ["Opt", "Lightning Strike", "Shivan Dragon", "Island"] },
    });
    const dragon = idOf(s, "p2", "hand", "Shivan Dragon");
    const strike = idOf(s, "p2", "hand", "Lightning Strike");
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Klaw, Sonic Subjugator", { targets: { t: ["p2"] } }), (req, p) => {
      if (req.type !== "pick") return undefined;
      if (req.intent === "reveal" && p === "p2") return [dragon, strike];
      if (req.intent !== "discard") return undefined;
      seen.push([...req.options]);
      return [dragon];
    });
    // Deux cartes révélées (1 + une carte de créature au cimetière) ; le joueur 1 choisit parmi elles.
    expect(seen[0]?.sort()).toEqual([dragon, strike].sort());
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(3);
  });

  it("The Ruinous Wrecking Crew : X marqueurs ; jusqu'à X modes", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2).concat(lands("Mountain", 2)), hand: ["The Ruinous Wrecking Crew"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Ruinous Wrecking Crew"), x: 2 });
    let options = 0;
    s = settle(s, (req) => {
      if (req.type === "pick" && req.intent === "triggerMode") {
        options = req.options.length;
        const i = req.options.find(
          (o) => (req.labels?.[o] ?? "").includes("perd 2 PV") && !(req.labels?.[o] ?? "").includes("+"),
        );
        return i ? [i] : undefined;
      }
      return undefined;
    });
    const crew = idOf(s, "p1", "battlefield", "The Ruinous Wrecking Crew");
    expect(s.objects[crew]?.counters["+1/+1"]).toBe(2);
    // X = 2 : les 4 modes seuls, les 6 paires et « Aucun » (les combinaisons sans cible légale sont écartées).
    expect(options).toBeGreaterThanOrEqual(5);
    expect(s.players.p2?.life).toBe(18);
  });

  it("The Serpent Society : la garde coûte cinq marqueurs poison ; une autre de vos créatures avec le contact mortel meurt, chaque adversaire sacrifie une créature non-jeton", () => {
    expect(card("The Serpent Society").ward).toEqual({ poison: 5 });
    const deadly = customCard({ name: "Test Deadly", power: 1, toughness: 1, keywords: ["deathtouch"] });
    let s = scenario({ p1: { battlefield: ["The Serpent Society", deadly] }, p2: { battlefield: ["Bear Cub"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Test Deadly"));
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Titania, Rugged Rumbler : en coût additionnel, défaussez une carte ou payez {2}", () => {
    const run = (lands_: number, hand: string[]) =>
      scenario({ p1: { battlefield: [...lands("Swamp", lands_)], hand: ["Titania, Rugged Rumbler", ...hand] } });
    // Trois terrains et une autre carte : défausse.
    let s = run(3, ["Opt"]);
    s = settle(cast(s, "p1", "Titania, Rugged Rumbler", { discard: [idOf(s, "p1", "hand", "Opt")] }));
    expect(idsOf(s, "p1", "battlefield", "Titania, Rugged Rumbler")).toHaveLength(1);
    // Cinq terrains, rien à défausser : {2} de plus.
    const short = run(4, []);
    expect(castable(short, "p1", idOf(short, "p1", "hand", "Titania, Rugged Rumbler"))).toBe(false);
    s = run(5, []);
    s = settle(cast(s, "p1", "Titania, Rugged Rumbler", { discard: [] }));
    expect(idsOf(s, "p1", "battlefield", "Titania, Rugged Rumbler")).toHaveLength(1);
  });

  it("Worlds Within Worlds : les créatures sont exilées, chaque joueur met des créatures de sa main, puis les exilées reviennent en main", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), ...lands("Island", 3), "Bear Cub"],
        hand: ["Worlds Within Worlds", "Serra Angel"],
      },
      p2: { battlefield: ["Shivan Dragon"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Worlds Within Worlds"));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
    expect(exiled(s, "Worlds Within Worlds")).toHaveLength(1);
  });
});

describe("Kid Loki : une créature sans marqueur mis ce tour-ci n'a pas la défense talismanique", () => {
  it("le filtre « marqueurs mis par vous ce tour-ci » exclut les créatures sans marqueur", () => {
    const s = scenario({ p1: { battlefield: ["Kid Loki", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("hexproof");
  });
});

// Cartes des decks du méta Standard (docs/plans/PLAN-C.md, lot C13).
describe("Marvel Super Heroes : cartes du méta Standard", () => {
  describe("Gleaming Bastion", () => {
    const colored = (s: S, id: string) => manaAbilitiesOf(s, id).findIndex((m) => m.produce.includes("W"));
    const tap = (s: S, id: string, ability: number, color: "C" | "W" | "U") =>
      act(s, "p1", { type: "tapForMana", source: id, ability, color });

    it("{T} : {C}, toujours", () => {
      const s = scenario({ p1: { battlefield: ["Gleaming Bastion"] } });
      const bastion = idOf(s, "p1", "battlefield", "Gleaming Bastion");
      const c = manaAbilitiesOf(s, bastion).findIndex((m) => m.produce.includes("C"));
      expect(tap(s, bastion, c, "C").players.p1?.manaPool.C).toBe(1);
    });

    it("{T} : {W} ou {U}, le tour où il arrive", () => {
      let s = scenario({ p1: { hand: ["Gleaming Bastion"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Gleaming Bastion") });
      const bastion = idOf(s, "p1", "battlefield", "Gleaming Bastion");
      expect(tap(s, bastion, colored(s, bastion), "W").players.p1?.manaPool.W).toBe(1);
      expect(tap(s, bastion, colored(s, bastion), "U").players.p1?.manaPool.U).toBe(1);
    });

    it("{T} : {W} ou {U}, seulement si vous contrôlez un terrain de base, les tours suivants", () => {
      const without = scenario({ p1: { battlefield: ["Gleaming Bastion", "Hallowed Fountain"] } });
      const b1 = idOf(without, "p1", "battlefield", "Gleaming Bastion");
      expect(() => tap(without, b1, colored(without, b1), "W")).toThrow(/indisponible/);
      const withBasic = scenario({ p1: { battlefield: ["Gleaming Bastion", "Island"] } });
      const b2 = idOf(withBasic, "p1", "battlefield", "Gleaming Bastion");
      expect(tap(withBasic, b2, colored(withBasic, b2), "U").players.p1?.manaPool.U).toBe(1);
    });
  });
});

describe("« Vous mettez des marqueurs » (lot K2)", () => {
  it("Invisible Woman : seuls les marqueurs que vous mettez sur vos autres Héros la déclenchent", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: {
          battlefield: ["Plains", "Bear Cub", "Invisible Woman, Sue Storm", "Luke Cage, Power Man"],
          hand: ["Fleeting Flight"],
        },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Luke Cage, Power Man")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "Luke Cage, Power Man")).triggered).toEqual([
      "Invisible Woman, Sue Storm",
    ]);
  });
  it("Knight of Wundagore : un marqueur que vous mettez sur une autre créature, même adverse ; pas ceux d'un adversaire", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Knight of Wundagore"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual(["Knight of Wundagore"]);
  });
  it("Ant-Man, Colony Commander : un marqueur que vous mettez sur une créature, même adverse ; pas ceux d'un adversaire", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Ant-Man, Colony Commander"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual(["Ant-Man, Colony Commander"]);
  });
});

describe("Marvel Super Heroes, PLAN-D D9 : dernières cartes", () => {
  /** Rituel de test d'une couleur, à un mana. */
  const oneOf = (color: "W" | "R" | "G", name = `Test ${color} Sorcery`) =>
    customCard({
      name,
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 0, colored: { [color]: 1 }, x: 0 },
      manaCostText: `{${color}}`,
      colors: [color],
    });
  /** Rituel incolore de test à {1}. */
  const generic = customCard({
    name: "Test Generic Sorcery",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
  });

  /** Terrain rapide de MSH : {C} toujours ; ses deux couleurs s'il est arrivé ce tour-ci ou avec un terrain de base. */
  const checkFastLand = (land: string, colors: ("W" | "R" | "G")[]) => {
    const spells = colors.map((c) => oneOf(c));
    const castableAll = (s: S) => spells.map((sp) => castable(s, "p1", idOf(s, "p1", "hand", sp.name)));
    // Ni arrivé ce tour-ci ni terrain de base (un terrain non-base ne compte pas) : seulement {C}.
    const without = scenario({
      p1: { battlefield: [land, { name: "Dark Fortress", tapped: true }], hand: [...spells, generic] },
    });
    expect(castableAll(without)).toEqual([false, false]);
    expect(castable(without, "p1", idOf(without, "p1", "hand", "Test Generic Sorcery"))).toBe(true);
    // Avec un terrain de base, même engagé : ses deux couleurs.
    const withBasic = scenario({ p1: { battlefield: [land, { name: "Island", tapped: true }], hand: spells } });
    expect(castableAll(withBasic)).toEqual([true, true]);
    // Arrivé ce tour-ci : ses deux couleurs.
    let fresh = scenario({ p1: { hand: [land, ...spells] } });
    fresh = act(fresh, "p1", { type: "playLand", card: idOf(fresh, "p1", "hand", land) });
    expect(castableAll(fresh)).toEqual([true, true]);
    fresh = settle(cast(fresh, "p1", spells[1]?.name as string));
    expect(idsOf(fresh, "p1", "graveyard", spells[1]?.name as string)).toHaveLength(1);
  };

  it("Gathering Place : {C} ; {G} ou {W} seulement s'il est arrivé ce tour-ci ou si vous contrôlez un terrain de base", () => {
    checkFastLand("Gathering Place", ["G", "W"]);
  });

  it("Training Compound : {C} ; {R} ou {G} seulement s'il est arrivé ce tour-ci ou si vous contrôlez un terrain de base", () => {
    checkFastLand("Training Compound", ["R", "G"]);
  });
});

describe("PLAN-A A3 : travail d'équipe, « choisissez-en un ; s'il a été payé, choisissez les deux à la place »", () => {
  const CASES: [string, (ids: { angel: string; bow: string }) => Record<string, string[]>][] = [
    ["Widow's Bite", ({ angel }) => ({ a: [angel] })],
    ["HULK SMASH!", ({ bow }) => ({ a: [bow] })],
    ["Go Nuts!", ({ angel }) => ({ t: [angel] })],
    ["Atlantis Attacks", () => ({ p: ["p2"] })],
    ["Murdock's Crusade", ({ angel }) => ({ t: [angel] })],
  ];
  const LANDS = ["Plains", "Island", "Swamp", "Mountain", "Forest"].flatMap((l) => lands(l, 3));
  for (const [name, targetsOf] of CASES)
    it(`${name} : travail d'équipe payé, un seul mode est refusé ; sans lui, « les deux » aussi`, () => {
      const s = scenario({
        p1: { battlefield: [...LANDS, "Shivan Dragon"], hand: [name] },
        p2: { battlefield: ["Serra Angel", "Hawkeye's Bow", "Omniscience"] },
      });
      const ids = { angel: idOf(s, "p2", "battlefield", "Serra Angel"), bow: idOf(s, "p2", "battlefield", "Hawkeye's Bow") };
      const card = idOf(s, "p1", "hand", name);
      const tap = [idOf(s, "p1", "battlefield", "Shivan Dragon")];
      const targets = targetsOf(ids);
      expect(() => act(s, "p1", { type: "cast", card, mode: 0, targets, kicked: true, tap })).toThrow(/les deux modes/);
      // Sans le travail d'équipe, le mode seul est permis.
      expect(act(s, "p1", { type: "cast", card, mode: 0, targets }).stack).toHaveLength(1);
      // Les options le disent : chaque mode seul exclut le coût additionnel, « les deux » l'exige.
      const option = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      const modes = option?.type === "cast" ? option.modes : [];
      expect(modes.map((m) => [m.index, !!m.requiresKicker, !!m.forbidsKicker])).toEqual([
        [0, false, true],
        [1, false, true],
        [2, true, false],
      ]);
    });
});

describe("PLAN-A A3 : Vision Quest, « avec X marqueurs +1/+1 supplémentaires » posés à l'arrivée (614.1c)", () => {
  /** Témoin : « chaque fois qu'un permanent arrive avec un marqueur +1/+1, vous gagnez 1 PV ». */
  const WATCHER = customCard({
    name: "Témoin des marqueurs",
    typeLine: "Enchantment",
    types: ["Enchantment"],
    abilities: [triggered(when.enters({ withCounter: "+1/+1" }), [fx.gainLife(1)], { label: "Arrive avec un marqueur : 1 PV" })],
  });
  const ROBOT = customCard({
    name: "Test Automaton",
    typeLine: "Artifact Creature — Construct",
    types: ["Artifact", "Creature"],
    subtypes: ["Construct"],
    power: 1,
    toughness: 1,
    manaCost: { generic: 2, colored: {}, x: 0 },
    manaCostText: "{2}",
  });

  for (const from of ["graveyard", "library"] as const)
    it(`depuis ${from === "graveyard" ? "le cimetière" : "la bibliothèque"}, la créature arrive avec ses X marqueurs`, () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Mountain", 2), WATCHER],
          hand: ["Vision Quest"],
          graveyard: from === "graveyard" ? [ROBOT] : [],
          library: from === "library" ? [ROBOT, "Forest"] : ["Forest"],
        },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vision Quest"), x: 3 }), (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === ROBOT.name).slice(0, 1) : undefined,
      );
      const robot = idOf(s, "p1", "battlefield", ROBOT.name);
      expect(s.objects[robot]?.counters["+1/+1"]).toBe(3);
      expect(s.players.p1?.life).toBe(21);
    });
});

describe("Marvel Super Heroes, PLAN-A A4a", () => {
  /** Éphémère à {0} : 1 blessure à chacune de deux créatures ciblées (deux mots « cible »). */
  const twinBolt = customCard({
    name: "Test Twin Bolt",
    types: ["Instant"],
    typeLine: "Instant",
    spell: spell([target.creature("a"), target.creature("b")], [fx.damage(1, ref.target("a")), fx.damage(1, ref.target("b"))]),
  });

  it("Speedball : nouvelles cibles pour un sort à plusieurs cibles (chaque mot « cible », celles d'origine proposées)", () => {
    let s = scenario({
      p1: { battlefield: ["Speedball, New Warrior"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"], hand: [twinBolt] },
    });
    const speed = idOf(s, "p1", "battlefield", "Speedball, New Warrior");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p2");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Test Twin Bolt"), targets: { a: [speed], b: [bear] } });
    const asked: { player: string; options: string[] }[] = [];
    s = settle(s, (req, player) => {
      if (req.type !== "pick" || req.intent !== "changeTarget") return undefined;
      asked.push({ player, options: req.options });
      // Le premier mot « cible » (Speedball) passe sur les Elfes ; le second garde l'Ourson.
      return asked.length === 1 ? [elves] : [bear];
    });
    // Speedball (p1) choisit, pour chacun des deux mots « cible ».
    expect(asked.map((a) => a.player)).toEqual(["p1", "p1"]);
    expect(asked[0]?.options).toEqual(expect.arrayContaining([speed, elves, bear]));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[bear]?.damage).toBe(1);
    expect(s.objects[speed]?.damage ?? 0).toBe(0);
    expect(pt(s, speed)).toEqual([4, 4]);
  });

  it("Captain America's Shield : à plusieurs, la créature engagée est celle du joueur défenseur", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Captain America's Shield", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
      p3: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s.objects[idOf(s, "p1", "battlefield", "Captain America's Shield")]!.attachedTo = bear;
    s.version += 1;
    const run = combatTargetsOffered(attackPlayer(s, [bear], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
    expect(run.s.objects[idOf(run.s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(false);
  });
});
