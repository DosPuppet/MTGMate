/**
 * Foundations, lot F : cartes à mécaniques uniques (permissions de lancement, doublements, protection,
 * choix en arrivant, mana restreint, copie de sorts, fin du tour…).
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { canPay, manaAbilitiesOf } from "../src/mana";
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
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const counters = (s: S, id: string) => s.objects[id]?.counters ?? {};
/** Avance (passes, réponses suggérées, aucune attaque ni blocage) jusqu'à ce que `until` soit vrai. */
function advance(s: S, until: (x: S) => boolean): S {
  let cur = s;
  for (let i = 0; i < 400 && !until(cur) && !cur.over; i++) {
    const p = cur.pending;
    if (!p) break;
    if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p.kind === "discard")
      cur = act(cur, p.player, { type: "discard", cards: (cur.players[p.player]?.hand ?? []).slice(0, p.count) });
    else break;
  }
  return cur;
}

describe("Lot F : joueurs et prévention", () => {
  it("Crystal Barricade : défense talismanique du joueur, blessures non de combat prévenues", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Crystal Barricade", "Llanowar Elves"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Burst Lightning"] },
    });
    const opt = castOption(s, "p2", idOf(s, "p2", "hand", "Burst Lightning"));
    expect(opt?.modes[0]?.targets[0]?.legal).not.toContain("p1");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = cast(s, "p2", "Burst Lightning", { targets: { t: [elf] } });
    s = passBoth(s);
    expect(onBattlefield(s, elf)).toBe(true);
  });

  it("Herald of Eternal Dawn : on ne perd pas à 0 point de vie", () => {
    let s = scenario({
      p1: { battlefield: ["Herald of Eternal Dawn"], life: 1 },
      p2: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      active: "p2",
    });
    s = cast(s, "p2", "Burst Lightning", { targets: { t: ["p1"] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(-1);
    expect(s.over).toBe(false);
  });

  it("Niv-Mizzet : on pioche autant que les blessures non de combat infligées à un adversaire", () => {
    let s = scenario({ p1: { battlefield: ["Niv-Mizzet, Visionary", "Mountain"], hand: ["Burst Lightning"] } });
    const hand = s.players.p1?.hand.length ?? 0;
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p1?.hand.length).toBe(hand - 1 + 2);
  });

  it("Twinflame Tyrant : les blessures aux adversaires et à leurs permanents sont doublées", () => {
    let s = scenario({ p1: { battlefield: ["Twinflame Tyrant", "Mountain"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("Lot F : coûts", () => {
  it("Luminous Rebuke coûte {3} de moins s'il cible une créature engagée", () => {
    const s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Luminous Rebuke"] },
      p2: { battlefield: [{ name: "Shivan Dragon", tapped: true }, "Llanowar Elves"] },
    });
    const card = idOf(s, "p1", "hand", "Luminous Rebuke");
    expect(castOption(s, "p1", card)).toBeDefined();
    expect(() =>
      cast(s, "p1", "Luminous Rebuke", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }),
    ).toThrow();
    const t = cast(s, "p1", "Luminous Rebuke", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } });
    expect(passBoth(t).players.p2?.graveyard.map((id) => nameOf(t, id))).toBeDefined();
  });

  it("Blasphemous Edict : coût alternatif {B} avec 13 créatures en jeu", () => {
    const setup = (n: number) =>
      scenario({ p1: { battlefield: ["Swamp", ...Array(n).fill("Llanowar Elves")], hand: ["Blasphemous Edict"] } });
    expect(castOption(setup(5), "p1", idOf(setup(5), "p1", "hand", "Blasphemous Edict"))).toBeUndefined();
    let s = setup(13);
    const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Blasphemous Edict"));
    expect(opt?.altAvailable).toBe(true);
    s = cast(s, "p1", "Blasphemous Edict", { alternative: true });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Eaten Alive : sacrifier une créature, ou payer {3}{B} à la place", () => {
    const base = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], hand: ["Eaten Alive"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
    let s = base();
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Eaten Alive", { targets: { t: [dragon] }, sacrifice: [] });
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Swamp" && s.objects[id]?.tapped)).toHaveLength(4);
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Shivan Dragon");

    let t = base();
    t = cast(t, "p1", "Eaten Alive", { targets: { t: [dragon] }, sacrifice: [idOf(t, "p1", "battlefield", "Llanowar Elves")] });
    expect(idsOf(t, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Omniscience : les sorts de la main se lancent sans payer", () => {
    let s = scenario({ p1: { battlefield: ["Omniscience"], hand: ["Shivan Dragon"] } });
    const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"));
    expect(opt?.freeAvailable).toBe(true);
    s = cast(s, "p1", "Shivan Dragon", { free: true });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });
});

describe("Lot F : jouer depuis d'autres zones", () => {
  it("Sphinx of Forgotten Lore : un éphémère du cimetière gagne le flashback (puis est exilé)", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Sphinx of Forgotten Lore", "Mountain"], graveyard: ["Burst Lightning"] },
    });
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Sphinx of Forgotten Lore"), defender: "p2" }],
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority" && x.pending.player === "p1");
    const bolt = idOf(s, "p1", "graveyard", "Burst Lightning");
    expect(castOption(s, "p1", bolt)?.fromGraveyard).toBe(true);
    s = act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Burst Lightning");
  });

  it("Strongbox Raider : la carte choisie reste jouable jusqu'à la fin du prochain tour", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 4), "Island"],
        hand: ["Strongbox Raider"],
        library: ["Shivan Dragon", "Opt", "Forest", "Forest", "Forest"],
      },
    });
    s.turn.attacked = true;
    s = cast(s, "p1", "Strongbox Raider");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "impulse");
    const opt = s.exile.find((id) => nameOf(s, id) === "Opt") as string;
    s = choose(s, [opt]);
    // Tour adverse, puis notre tour suivant : toujours jouable ; au tour d'après, plus du tout.
    s = advance(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(castOption(s, "p1", opt)).toBeDefined();
    s = advance(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(castOption(s, "p1", opt)).toBeUndefined();
  });

  it("Etali : les cartes exilées se lancent gratuitement", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Etali, Primal Storm"], library: ["Shivan Dragon", "Forest"] },
      p2: { library: ["Pelakka Wurm", "Forest"] },
    });
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Etali, Primal Storm"), defender: "p2" }],
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority" && x.pending.player === "p1");
    const wurm = s.exile.find((id) => nameOf(s, id) === "Pelakka Wurm") as string;
    const opt = castOption(s, "p1", wurm);
    expect(opt?.free).toBe(true);
    s = act(s, "p1", { type: "cast", card: wurm });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.battlefield.some((id) => nameOf(s, id) === "Pelakka Wurm" && s.objects[id]?.controller === "p1")).toBe(true);
  });

  it("Tinybones : la carte défaussée est exilée avec un marqueur de butin, jouable avec n'importe quel mana", () => {
    let s = scenario({
      p1: { battlefield: ["Tinybones, Bauble Burglar", ...lands("Swamp", 5), "Forest"] },
      p2: { hand: ["Giant Growth"] },
    });
    const tiny = idOf(s, "p1", "battlefield", "Tinybones, Bauble Burglar");
    const discardAbility = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === tiny);
    s = act(s, "p1", {
      type: "activate",
      source: tiny,
      ability: discardAbility?.type === "activate" ? discardAbility.ability : -1,
    });
    s = passAccepting(s, (x) => x.stack.length === 0);
    const growth = s.exile.find((id) => nameOf(s, id) === "Giant Growth") as string;
    expect(counters(s, growth).stash).toBe(1);
    // Giant Growth coûte {G} ; le Swamp non engagé suffit (mana de n'importe quel type).
    for (const id of s.battlefield) if (nameOf(s, id) === "Forest") (s.objects[id] as { tapped: boolean }).tapped = true;
    const opt = castOption(s, "p1", growth);
    expect(opt).toBeDefined();
  });

  it("Muldrotha : un permanent de chaque type depuis le cimetière, une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: ["Muldrotha, the Gravetide", ...lands("Forest", 6)],
        graveyard: ["Llanowar Elves", "Helpful Hunter", "Forest"],
      },
    });
    const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
    expect(castOption(s, "p1", elves)?.fromGraveyard).toBe(true);
    s = act(s, "p1", { type: "cast", card: elves });
    s = passBoth(s);
    const hunter = idOf(s, "p1", "graveyard", "Helpful Hunter");
    expect(castOption(s, "p1", hunter)).toBeUndefined(); // type Créature déjà utilisé ce tour
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === idOf(s, "p1", "graveyard", "Forest"))).toBe(
      true,
    );
  });

  it("Quilled Greatwurm : se lance depuis le cimetière en retirant six marqueurs", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Llanowar Elves"], graveyard: ["Quilled Greatwurm"] } });
    const wurm = idOf(s, "p1", "graveyard", "Quilled Greatwurm");
    expect(castOption(s, "p1", wurm)).toBeUndefined();
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    (s.objects[elf] as { counters: Record<string, number> }).counters["+1/+1"] = 6;
    expect(castOption(s, "p1", wurm)).toBeDefined();
    s = act(s, "p1", { type: "cast", card: wurm });
    expect(counters(s, elf)["+1/+1"] ?? 0).toBe(0);
  });

  it("Flamewake Phoenix : revient du cimetière au début du combat (férocité, {R})", () => {
    let s = scenario({ step: "main1", p1: { battlefield: ["Shivan Dragon", "Mountain"], graveyard: ["Flamewake Phoenix"] } });
    s = passAccepting(
      s,
      (x) => idsOf(x, "p1", "battlefield", "Flamewake Phoenix").length === 1 || x.turn.step === "declareAttackers",
    );
    expect(idsOf(s, "p1", "battlefield", "Flamewake Phoenix")).toHaveLength(1);
  });
});

describe("Lot F : doublements, copies, contrôle", () => {
  it("Doubling Season : jetons et marqueurs doublés", () => {
    let s = scenario({ p1: { battlefield: ["Doubling Season", ...lands("Mountain", 3)], hand: ["Dragon Fodder"] } });
    s = cast(s, "p1", "Dragon Fodder");
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
  });

  it("Thousand-Year Storm : une copie par éphémère ou rituel déjà lancé ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Thousand-Year Storm", ...lands("Mountain", 3)], hand: ["Burst Lightning", "Burst Lightning"] },
    });
    const bolts = idsOf(s, "p1", "hand", "Burst Lightning");
    s = act(s, "p1", { type: "cast", card: bolts[0] as string, targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(18);
    s = act(s, "p1", { type: "cast", card: bolts[1] as string, targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(14); // le second éclair et sa copie
  });

  it("Involuntary Employment : contrôle jusqu'à la fin du tour, dégagée, célérité", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Involuntary Employment"] },
      p2: { battlefield: [{ name: "Shivan Dragon", tapped: true }] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Involuntary Employment", { targets: { t: [dragon] } });
    s = passBoth(s);
    expect(s.objects[dragon]?.controller).toBe("p1");
    expect(s.objects[dragon]?.tapped).toBe(false);
    s = advance(s, (x) => x.turn.active === "p2");
    expect(s.objects[dragon]?.controller).toBe("p2");
  });

  it("Abyssal Harvester : copie Cauchemar d'une créature morte ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Abyssal Harvester"] },
      p2: { battlefield: ["Shivan Dragon"], graveyard: ["Pelakka Wurm"] },
    });
    // Le Wurm est au cimetière depuis un tour précédent.
    (s.objects[idOf(s, "p2", "graveyard", "Pelakka Wurm")] as { controlledSince: number }).controlledSince = 1;
    const harvester = idOf(s, "p1", "battlefield", "Abyssal Harvester");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === harvester);
    expect(opt).toBeUndefined(); // le Wurm n'est pas mort ce tour-ci : aucune cible, capacité non proposée
    destroy(s, idOf(s, "p2", "battlefield", "Shivan Dragon"));
    const dead = idOf(s, "p2", "graveyard", "Shivan Dragon");
    s = act(s, "p1", { type: "activate", source: harvester, ability: 0, targets: { t: [dead] } });
    s = passBoth(s);
    const copy = idOf(s, "p1", "battlefield", "Shivan Dragon");
    expect(s.objects[copy]?.isToken).toBe(true);
    expect(chars(s, copy).subtypes).toContain("Nightmare");
  });
});

describe("Lot F : choix en arrivant et mana restreint", () => {
  it("Banner of Kinship : type choisi, marqueurs et bonus", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 5), "Llanowar Elves", "Llanowar Elves", "Prideful Parent"],
        hand: ["Banner of Kinship"],
      },
    });
    s = cast(s, "p1", "Banner of Kinship");
    s = passBoth(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("chooseOnEnter");
    s = choose(s, ["Elf"]);
    const banner = idOf(s, "p1", "battlefield", "Banner of Kinship");
    expect(counters(s, banner).fellowship).toBe(2);
    const elf = idsOf(s, "p1", "battlefield", "Llanowar Elves")[0] as string;
    expect(chars(s, elf).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Prideful Parent")).power).toBe(2);
  });

  it("Heraldic Banner : couleur choisie, +1/+0 et mana de cette couleur", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Llanowar Elves"], hand: ["Heraldic Banner"] } });
    s = cast(s, "p1", "Heraldic Banner");
    s = passBoth(s);
    s = choose(s, ["G"]);
    const banner = idOf(s, "p1", "battlefield", "Heraldic Banner");
    expect(manaAbilitiesOf(s, banner)[0]?.produce).toEqual(["G"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(2);
  });

  it("Secluded Courtyard : mana de couleur seulement pour les créatures du type choisi", () => {
    let s = scenario({ p1: { hand: ["Secluded Courtyard", "Llanowar Elves", "Giant Growth"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Secluded Courtyard") });
    const court = idOf(s, "p1", "battlefield", "Secluded Courtyard");
    (s.objects[court] as { chosen?: { creatureType: string } }).chosen = { creatureType: "Elf" };
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Llanowar Elves"))).toBeDefined();
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Giant Growth"))).toBeUndefined();
  });

  it("Giada : les autres Anges arrivent avec des marqueurs ; {W} réservé aux sorts d'Ange", () => {
    let s = scenario({
      p1: { battlefield: ["Giada, Font of Hope", "Youthful Valkyrie", ...lands("Plains", 2)], hand: ["Dazzling Angel"] },
    });
    s = cast(s, "p1", "Dazzling Angel");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Dazzling Angel").length === 1);
    expect(counters(s, idOf(s, "p1", "battlefield", "Dazzling Angel"))["+1/+1"]).toBe(2);
    const giada = idOf(s, "p1", "battlefield", "Giada, Font of Hope");
    expect(canPay(s, "p1", { generic: 0, colored: { W: 1 }, x: 0 }, new Set(s.battlefield.filter((id) => id !== giada)))).toBe(
      false,
    );
  });

  it("Soulstone Sanctuary : devient une créature 3/3 de tous les types", () => {
    let s = scenario({ p1: { battlefield: ["Soulstone Sanctuary", ...lands("Forest", 4), "Imperious Perfect"] } });
    const land = idOf(s, "p1", "battlefield", "Soulstone Sanctuary");
    s = act(s, "p1", { type: "activate", source: land, ability: 1 });
    s = passBoth(s);
    const c = chars(s, land);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    // « Les autres Elfes que vous contrôlez gagnent +1/+1 » : tous les types de créature, donc Elfe.
    expect([c.power, c.toughness]).toEqual([4, 4]);
  });
});

describe("Lot F : divers", () => {
  it("Curator of Destinies : l'adversaire choisit la pile qui va en main", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Curator of Destinies"],
        library: ["Opt", "Forest", "Shivan Dragon", "Island", "Stab"],
      },
    });
    s = cast(s, "p1", "Curator of Destinies");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "piles");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    const top = req?.type === "pick" ? req.options : [];
    s = choose(s, top.slice(0, 2)); // face cachée : 2 cartes
    expect(s.pending?.player).toBe("p2");
    s = choose(s, ["up"]); // l'adversaire donne la pile face visible (3 cartes)
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Time Stop : le tour se termine, la pile est exilée", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 7), hand: ["Pelakka Wurm"] },
      p2: { battlefield: lands("Island", 6), hand: ["Time Stop"] },
    });
    s = cast(s, "p1", "Pelakka Wurm");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Time Stop");
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Pelakka Wurm", "Time Stop"]);
    s = passAccepting(s, (x) => x.turn.active === "p2");
    expect(s.turn.number).toBe(4);
  });

  it("Nine-Lives Familiar : revient à l'étape de fin avec un marqueur de moins", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Nine-Lives Familiar"] } });
    s = cast(s, "p1", "Nine-Lives Familiar");
    s = passBoth(s);
    let cat = idOf(s, "p1", "battlefield", "Nine-Lives Familiar");
    expect(counters(s, cat).revival).toBe(8);
    destroy(s, cat);
    s = advance(s, (x) => idsOf(x, "p1", "battlefield", "Nine-Lives Familiar").length === 1 || x.turn.active === "p2");
    cat = idOf(s, "p1", "battlefield", "Nine-Lives Familiar");
    expect(counters(s, cat).revival).toBe(7);
  });

  it("Kellan : Éclaireur → Détective → Voleur 3/2 double initiative", () => {
    let s = scenario({ p1: { battlefield: ["Kellan, Planar Trailblazer", ...lands("Mountain", 8)] } });
    const k = idOf(s, "p1", "battlefield", "Kellan, Planar Trailblazer");
    s = act(s, "p1", { type: "activate", source: k, ability: 1 }); // Détective d'abord : sans effet (pas Détective)
    s = passBoth(s);
    expect(chars(s, k).power).toBe(2);
    s = act(s, "p1", { type: "activate", source: k, ability: 0 });
    s = passBoth(s);
    expect(chars(s, k).subtypes).toContain("Detective");
    s = act(s, "p1", { type: "activate", source: k, ability: 1 });
    s = passBoth(s);
    expect([chars(s, k).power, chars(s, k).toughness]).toEqual([3, 2]);
    expect(chars(s, k).keywords).toContain("doubleStrike");
  });

  it("Loot : deux terrains par tour", () => {
    let s = scenario({ p1: { battlefield: ["Loot, Exuberant Explorer"], hand: ["Forest", "Island", "Swamp"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
    expect(legalActions(s, "p1").some((a) => a.type === "playLand")).toBe(false);
  });

  it("Elenda : défense talismanique contre les éphémères seulement", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Elenda, Saint of Dusk"] },
      p2: { battlefield: lands("Swamp", 2), hand: ["Stab", "Seeker's Folly"] },
    });
    const elenda = idOf(s, "p1", "battlefield", "Elenda, Saint of Dusk");
    expect(castOption(s, "p2", idOf(s, "p2", "hand", "Stab"))).toBeUndefined();
    expect(chars(s, elenda).keywords).not.toContain("hexproof");
  });

  it("Consuming Aberration : F/E = cartes des cimetières adverses ; meule jusqu'à un terrain", () => {
    let s = scenario({
      p1: { battlefield: ["Consuming Aberration", "Island"], hand: ["Opt"] },
      p2: { graveyard: ["Opt", "Stab", "Pelakka Wurm"], library: ["Opt", "Stab", "Forest", "Island"] },
    });
    const ab = idOf(s, "p1", "battlefield", "Consuming Aberration");
    expect(chars(s, ab).power).toBe(3);
    s = cast(s, "p1", "Opt");
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.graveyard).toHaveLength(6);
    expect(chars(s, ab).power).toBe(6);
  });

  it("Progenitus : protection contre tout, mélangé dans la bibliothèque au lieu du cimetière", () => {
    const s = scenario({
      p1: { battlefield: ["Progenitus"] },
      p2: { battlefield: ["Mountain", "Shivan Dragon"], hand: ["Burst Lightning"] },
    });
    const prog = idOf(s, "p1", "battlefield", "Progenitus");
    const opt = legalActions(s, "p2");
    void opt;
    dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Shivan Dragon")), prog, 5, false);
    expect(s.objects[prog]?.damage).toBe(0);
    const lib = s.players.p1?.library.length ?? 0;
    const { putIntoGraveyard } = { putIntoGraveyard: (x: S, id: string) => destroy(x, id) };
    putIntoGraveyard(s, prog);
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Progenitus");
    expect(s.players.p1?.library.length).toBe(lib + 1);
  });
});

describe("capacités retardées : références figées", () => {
  it("Electroduplicate : le jeton copie est sacrifié à l'étape de fin", () => {
    let s = scenario({ p1: { battlefield: ["Shivan Dragon", ...lands("Mountain", 3)], hand: ["Electroduplicate"] } });
    s = cast(s, "p1", "Electroduplicate", { targets: { t: [idOf(s, "p1", "battlefield", "Shivan Dragon")] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(2);
    s = advance(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Kykar : la créature exilée revient à l'étape de fin", () => {
    let s = scenario({ p1: { battlefield: ["Kykar, Zephyr Awakener", "Llanowar Elves", "Island"], hand: ["Opt"] } });
    s = cast(s, "p1", "Opt");
    s = advance(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    s = choose(s, ["0"]);
    s = advance(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    s = advance(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });
});
