/**
 * Foundations, réimpressions : mécaniques ajoutées pour les cartes n° 282 et plus
 * (poison, « doit être bloquée », combat supplémentaire, Équipage, changement de cible, mana à effet…).
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars, onBattlefield } from "../src/state";
import type { ActionOption, GameState } from "../src/types";
import { act, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const choose = (s: S, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const castOption = (s: S, p: string, card: string) =>
  legalActions(s, p).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activation = (s: S, p: string, source: string, label?: string) =>
  legalActions(s, p).find(
    (a): a is Extract<ActionOption, { type: "activate" }> =>
      a.type === "activate" && a.source === source && (!label || !!a.label?.startsWith(label)),
  );
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
/** Avance (passes, suggestions, aucune attaque ni blocage) jusqu'à ce que `until` soit vrai. */
function advance(s: S, until: (x: S) => boolean): S {
  let cur = s;
  for (let i = 0; i < 400 && !until(cur) && !cur.over; i++) {
    const p = cur.pending;
    if (!p) break;
    if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
}
/** Déclare ces attaquants (sur p2) depuis le début du combat. */
function attackWith(s: S, names: string[]): S {
  let cur = advance(s, (x) => x.pending?.kind === "declareAttackers");
  const ids = names.map((n) => idOf(cur, "p1", "battlefield", n));
  cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  return cur;
}

describe("Réimpressions : combat", () => {
  it("Fynn : deux marqueurs poison ; dix marqueurs, le joueur perd", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Fynn, the Fangbearer"] } });
    s.players.p2!.poison = 8;
    s = attackWith(s, ["Fynn, the Fangbearer"]);
    s = advance(s, (x) => x.over || x.turn.step === "main2");
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("Joraga Invocation : les attaquants doivent être bloqués si possible", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 6)], hand: ["Joraga Invocation"] },
      p2: { battlefield: ["Prideful Parent"] },
    });
    s = cast(s, "p1", "Joraga Invocation");
    s = passBoth(s);
    s = attackWith(s, ["Llanowar Elves"]);
    s = advance(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).toThrow(/bloquée/);
    const blocker = idOf(s, "p2", "battlefield", "Prideful Parent");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker, attacker: idOf(s, "p1", "battlefield", "Llanowar Elves") }],
    });
    expect(s.combat?.attackers[0]?.blocked).toBe(true);
  });

  it("Aurelia : une phase de combat supplémentaire", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Aurelia, the Warleader"] } });
    s = attackWith(s, ["Aurelia, the Warleader"]);
    s = advance(s, (x) => x.turn.step === "main2" || (x.pending?.kind === "declareAttackers" && x.players.p2!.life < 20));
    expect(s.pending?.kind).toBe("declareAttackers"); // second combat
    expect(s.players.p2?.life).toBe(17);
  });

  it("Équipage : Cultivator's Caravan devient une créature en engageant de quoi faire 3 de force", () => {
    let s = scenario({ p1: { battlefield: ["Cultivator's Caravan", "Shivan Dragon"] } });
    const caravan = idOf(s, "p1", "battlefield", "Cultivator's Caravan");
    const crew = activation(s, "p1", caravan, "Équipage");
    expect(crew).toBeDefined();
    s = act(s, "p1", { type: "activate", source: caravan, ability: crew!.ability });
    s = passBoth(s);
    expect(chars(s, caravan).types).toContain("Creature");
    expect(s.objects[idOf(s, "p1", "battlefield", "Shivan Dragon")]?.tapped).toBe(true);
  });
});

describe("Réimpressions : pile et mana", () => {
  it("Bolt Bend : change la cible d'un sort à cible unique", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Mountain", 1), "Shivan Dragon", "Llanowar Elves"], hand: ["Bolt Bend"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    s = cast(s, "p2", "Burst Lightning", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } });
    s = act(s, "p2", { type: "pass" });
    s = cast(s, "p1", "Bolt Bend", { targets: { t: [s.stack[0]!.id] } }); // coûte {R} grâce au Dragon (férocité)
    s = passBoth(s);
    s = choose(s, ["p2"]);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(18);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Carnelian Orb : un Dragon payé avec son mana a la célérité", () => {
    let s = scenario({ p1: { battlefield: ["Carnelian Orb of Dragonkind", ...lands("Mountain", 5)], hand: ["Shivan Dragon"] } });
    s = cast(s, "p1", "Shivan Dragon");
    s = passBoth(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Shivan Dragon")).keywords).toContain("haste");
  });

  it("Pyromancer's Goggles : un éphémère rouge payé avec son mana est copié", () => {
    let s = scenario({ p1: { battlefield: ["Pyromancer's Goggles"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    expect(s.stack).toHaveLength(2);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Teach by Example : le prochain éphémère ou rituel est copié", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Teach by Example", "Burst Lightning"] } });
    s = cast(s, "p1", "Teach by Example");
    s = passBoth(s);
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Savage Ventmaw : le mana reste jusqu'à la fin du tour", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Savage Ventmaw"] } });
    s = attackWith(s, ["Savage Ventmaw"]);
    s = advance(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(s.players.p1?.manaPool.R).toBe(3);
    expect(s.players.p1?.manaPool.G).toBe(3);
  });

  it("Harbinger of the Tides : flash moyennant {2} de plus", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Harbinger of the Tides"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const p = advance(s, (x) => x.pending?.player === "p1" && x.pending.kind === "priority");
    expect(castOption(p, "p1", idOf(p, "p1", "hand", "Harbinger of the Tides"))).toBeUndefined(); // 3 terrains : il faut 4
    const t = scenario({ active: "p2", p1: { battlefield: lands("Island", 4), hand: ["Harbinger of the Tides"] } });
    const q = advance(t, (x) => x.pending?.player === "p1" && x.pending.kind === "priority");
    expect(castOption(q, "p1", idOf(q, "p1", "hand", "Harbinger of the Tides"))).toBeDefined();
  });

  it("Vizier of the Menagerie : lancer la créature du dessus de la bibliothèque", () => {
    const s = scenario({
      p1: { battlefield: ["Vizier of the Menagerie", ...lands("Swamp", 6)], library: ["Shivan Dragon", "Forest"] },
    });
    const top = s.players.p1?.library[0] as string;
    expect(castOption(s, "p1", top)).toBeDefined(); // mana de n'importe quel type
  });
});

describe("Réimpressions : vie, contrôle, remplacements", () => {
  it("Angel of Vitality ajoute 1 à chaque gain ; Giant Cindermaw empêche les gains", () => {
    let s = scenario({ p1: { battlefield: ["Angel of Vitality", "Plains"], hand: ["Moment of Triumph"] } });
    s = cast(s, "p1", "Moment of Triumph", { targets: { t: [idOf(s, "p1", "battlefield", "Angel of Vitality")] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(23);
    let t = scenario({ p1: { battlefield: ["Giant Cindermaw", "Plains"], hand: ["Moment of Triumph"] } });
    t = cast(t, "p1", "Moment of Triumph", { targets: { t: [idOf(t, "p1", "battlefield", "Giant Cindermaw")] } });
    t = passBoth(t);
    expect(t.players.p1?.life).toBe(20);
  });

  it("Confiscate : on contrôle le permanent enchanté, qui revient quand l'Aura part", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Confiscate"] }, p2: { battlefield: ["Shivan Dragon"] } });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Confiscate", { targets: { enchant: [dragon] } });
    s = passBoth(s);
    expect(s.objects[dragon]?.controller).toBe("p1");
    destroy(s, idOf(s, "p1", "battlefield", "Confiscate"));
    s = act(s, "p1", { type: "pass" });
    expect(s.objects[dragon]?.controller).toBe("p2");
  });

  it("Dryad Militant : les éphémères et rituels vont en exil au lieu du cimetière", () => {
    let s = scenario({ p1: { battlefield: ["Dryad Militant", "Mountain"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Burst Lightning");
  });

  it("Knight of Grace : défense talismanique contre le noir", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Knight of Grace"] },
      p2: { battlefield: ["Swamp"], hand: ["Stab"] },
    });
    expect(castOption(s, "p2", idOf(s, "p2", "hand", "Stab"))).toBeUndefined();
  });

  it("Gratuitous Violence double les blessures de vos créatures", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Gratuitous Violence", "Llanowar Elves"] } });
    s = attackWith(s, ["Llanowar Elves"]);
    s = advance(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(18);
  });

  it("Fog Bank : les blessures de combat qu'il inflige et reçoit sont prévenues", () => {
    let s = scenario({ step: "beginCombat", p1: { battlefield: ["Shivan Dragon"] }, p2: { battlefield: ["Fog Bank"] } });
    s = attackWith(s, ["Shivan Dragon"]);
    s = advance(s, (x) => x.pending?.kind === "declareBlockers");
    const bank = idOf(s, "p2", "battlefield", "Fog Bank");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: bank, attacker: idOf(s, "p1", "battlefield", "Shivan Dragon") }],
    });
    s = advance(s, (x) => x.turn.step === "main2");
    expect(onBattlefield(s, bank)).toBe(true);
    expect(s.objects[bank]?.damage).toBe(0);
  });
});

describe("Réimpressions : cartes à mémoire", () => {
  it("Demonic Pact : chaque mode une seule fois", () => {
    let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Demonic Pact"], library: lands("Swamp", 10) } });
    s = advance(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toEqual(["0", "1", "2", "3"]);
    s = choose(s, ["2"]); // piochez deux cartes
    s = advance(s, (x) => x.turn.number === 6 && x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    const req2 = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req2?.type === "pick" && req2.options).not.toContain("2");
  });

  it("Myojin of Night's Reach : marqueur de divinité seulement s'il est lancé depuis la main", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 8), hand: ["Myojin of Night's Reach"] } });
    s = cast(s, "p1", "Myojin of Night's Reach");
    s = passBoth(s);
    const myojin = idOf(s, "p1", "battlefield", "Myojin of Night's Reach");
    expect(s.objects[myojin]?.counters.divinity).toBe(1);
    expect(chars(s, myojin).keywords).toContain("indestructible");
  });

  it("Tribute to Hunger : on gagne l'endurance de la créature sacrifiée", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Tribute to Hunger"] }, p2: { battlefield: ["Fog Bank"] } });
    s = cast(s, "p1", "Tribute to Hunger", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Ayli : PV égaux à l'endurance de la créature sacrifiée pour le coût", () => {
    let s = scenario({ p1: { battlefield: ["Ayli, Eternal Pilgrim", "Fog Bank", "Plains"] } });
    const ayli = idOf(s, "p1", "battlefield", "Ayli, Eternal Pilgrim");
    s = act(s, "p1", { type: "activate", source: ayli, ability: 0, sacrifice: [idOf(s, "p1", "battlefield", "Fog Bank")] });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Hoarding Dragon : l'artefact exilé revient en main quand il meurt", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["Hoarding Dragon"], library: ["Forest", "Gilded Lotus", "Forest"] },
    });
    s = cast(s, "p1", "Hoarding Dragon");
    s = advance(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Gilded Lotus"]);
    destroy(s, idOf(s, "p1", "battlefield", "Hoarding Dragon"));
    s = advance(s, (x) => idsOf(x, "p1", "hand", "Gilded Lotus").length === 1 || x.turn.active === "p2");
    expect(idsOf(s, "p1", "hand", "Gilded Lotus")).toHaveLength(1);
  });

  it("Maze's End : dix Portes de noms différents, la partie est gagnée", () => {
    const gates = ["Azorius", "Boros", "Dimir", "Golgari", "Gruul", "Izzet", "Orzhov", "Rakdos", "Selesnya"].map(
      (g) => `${g} Guildgate`,
    );
    let s = scenario({
      p1: { battlefield: ["Maze's End", ...gates, ...lands("Forest", 3)], library: ["Simic Guildgate", "Forest"] },
    });
    const maze = idOf(s, "p1", "battlefield", "Maze's End");
    s = act(s, "p1", { type: "activate", source: maze, ability: activation(s, "p1", maze, "Chercher")!.ability });
    s = advance(s, (x) => x.over || x.stack.length === 0);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("Sorcerous Spyglass : les capacités du nom choisi ne peuvent plus être activées", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Sorcerous Spyglass"] },
      p2: { battlefield: ["Arcanis the Omnipotent"] },
    });
    s = cast(s, "p1", "Sorcerous Spyglass");
    s = passBoth(s);
    s = choose(s, ["Arcanis the Omnipotent"]);
    const arcanis = idOf(s, "p2", "battlefield", "Arcanis the Omnipotent");
    s = advance(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(activation(s, "p2", arcanis)).toBeUndefined();
  });

  it("Crusader of Odric et Enigma Drake : F/E variables", () => {
    const s = scenario({
      p1: { battlefield: ["Crusader of Odric", "Llanowar Elves", "Enigma Drake"], graveyard: ["Opt", "Stab", "Forest"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Crusader of Odric")).power).toBe(3);
    const drake = chars(s, idOf(s, "p1", "battlefield", "Enigma Drake"));
    expect([drake.power, drake.toughness]).toEqual([2, 4]);
  });

  it("Wildborn Preserver : payer X pour X marqueurs", () => {
    let s = scenario({ p1: { battlefield: ["Wildborn Preserver", ...lands("Forest", 4)], hand: ["Llanowar Elves"] } });
    s = cast(s, "p1", "Llanowar Elves");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "payX");
    s = choose(s, [2]);
    const pres = idOf(s, "p1", "battlefield", "Wildborn Preserver");
    expect(s.objects[pres]?.counters["+1/+1"]).toBe(2);
  });

  it("Steel Hellkite : détruit les permanents de valeur X du joueur blessé au combat", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Steel Hellkite", ...lands("Plains", 2)] },
      p2: { battlefield: ["Llanowar Elves", "Prideful Parent"] },
    });
    s = attackWith(s, ["Steel Hellkite"]);
    s = advance(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    const hk = idOf(s, "p1", "battlefield", "Steel Hellkite");
    s = act(s, "p1", { type: "activate", source: hk, ability: activation(s, "p1", hk, "Détruire")!.ability, x: 1 });
    s = passBoth(s);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Prideful Parent")).toHaveLength(1);
  });
});
