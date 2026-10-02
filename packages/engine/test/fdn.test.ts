/**
 * Cartes de Foundations : vérifie les primitives ajoutées pour le set principal
 * (cibles dans le cimetière, cibles multiples, exil lié, variables de résolution, coûts…).
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { createGame, submit } from "../src/game";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, counterCount, onBattlefield } from "../src/state";
import type { GameEvent, GameState } from "../src/types";
import { act, advanceUntil, castable, idOf, idsOf, nameOf, passAccepting, passBoth, picking, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const choose = (s: S, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("Foundations : cimetière", () => {
  it("Zombify renvoie la créature ciblée du cimetière sur le champ de bataille", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Pelakka Wurm", "Opt"] } });
    const cast0 = legalActions(s, "p1").find((a) => a.type === "cast");
    const wurm = idOf(s, "p1", "graveyard", "Pelakka Wurm");
    // Seule la carte de créature est une cible légale.
    expect(cast0?.type === "cast" && cast0.modes[0]?.targets[0]?.legal).toEqual([wurm]);
    s = cast(s, "p1", "Zombify", { targets: { t: [wurm] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Pelakka Wurm").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });

  it("Macabre Waltz : jusqu'à deux cibles, puis défausse", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Macabre Waltz", "Forest"], graveyard: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const ids = [idOf(s, "p1", "graveyard", "Pelakka Wurm"), idOf(s, "p1", "graveyard", "Llanowar Elves")];
    s = cast(s, "p1", "Macabre Waltz", { targets: { t: ids } });
    s = passBoth(s);
    // Trois cartes en main (Forest + deux créatures) : il faut en défausser une.
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("discard");
    s = choose(s, [idOf(s, "p1", "hand", "Forest")]);
    expect(s.players.p1?.hand.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name).sort()).toEqual([
      "Llanowar Elves",
      "Pelakka Wurm",
    ]);
  });

  it("Reassembling Skeleton s'active depuis le cimetière", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Reassembling Skeleton"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "activate");
    expect(opt).toBeDefined();
    if (opt?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: opt.source, ability: opt.ability });
    s = passBoth(s);
    const skel = idOf(s, "p1", "battlefield", "Reassembling Skeleton");
    expect(s.objects[skel]?.tapped).toBe(true);
  });

  it("Scavenging Ooze : +1/+1 et 1 PV seulement pour une carte de créature", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenging Ooze", ...lands("Forest", 2)] },
      p2: { graveyard: ["Pelakka Wurm", "Opt"] },
    });
    const ooze = idOf(s, "p1", "battlefield", "Scavenging Ooze");
    s = act(s, "p1", { type: "activate", source: ooze, ability: 0, targets: { t: [idOf(s, "p2", "graveyard", "Opt")] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(20);
    s = act(s, "p1", {
      type: "activate",
      source: ooze,
      ability: 0,
      targets: { t: [idOf(s, "p2", "graveyard", "Pelakka Wurm")] },
    });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(21);
    expect(counterCount(s.objects[ooze] as never, "+1/+1")).toBe(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });
});

describe("Foundations : cibles multiples et contraintes", () => {
  it("Run Away Together exige deux créatures de joueurs différents", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Prideful Parent", ...lands("Island", 2)], hand: ["Run Away Together"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const mine = idsOf(s, "p1", "battlefield", "Llanowar Elves").concat(idsOf(s, "p1", "battlefield", "Prideful Parent"));
    expect(() => cast(s, "p1", "Run Away Together", { targets: { t: mine } })).toThrow();
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Run Away Together", { targets: { t: [mine[0] as string, dragon] } });
    s = passBoth(s);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Divine Resilience kické accepte plusieurs cibles, sinon une seule", () => {
    const base = () =>
      scenario({
        p1: { battlefield: ["Llanowar Elves", "Prideful Parent", ...lands("Plains", 4)], hand: ["Divine Resilience"] },
      });
    let s = base();
    const two = [idOf(s, "p1", "battlefield", "Llanowar Elves"), idOf(s, "p1", "battlefield", "Prideful Parent")];
    expect(() => cast(s, "p1", "Divine Resilience", { targets: { t: two } })).toThrow();
    s = cast(s, "p1", "Divine Resilience", { targets: { t: two }, kicked: true });
    s = passBoth(s);
    expect(s.effects.some((e) => e.addKeywords?.includes("indestructible") && e.affected.length === 2)).toBe(true);
  });
});

describe("Foundations : effets liés et variables", () => {
  it("Banishing Light : la carte revient quand l'enchantement part", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Banishing Light"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = cast(s, "p1", "Banishing Light");
    s = passAccepting(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(s.exile).toHaveLength(1);
    // Le départ de l'enchantement rend la créature (sous le contrôle de son propriétaire).
    const light = idOf(s, "p1", "battlefield", "Banishing Light");
    destroy(s, light);
    expect(s.exile).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Goblin Negotiation : un Gobelin par blessure en excès", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 7), hand: ["Goblin Negotiation"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = cast(s, "p1", "Goblin Negotiation", { x: 5, targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
  });

  it("Exsanguinate : vous gagnez la vie perdue par tous les adversaires", () => {
    let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 5), hand: ["Exsanguinate"] } });
    s = cast(s, "p1", "Exsanguinate", { x: 3 });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p3?.life).toBe(17);
    expect(s.players.p1?.life).toBe(26);
  });

  it("Hare Apparent compte les autres Hare Apparent", () => {
    let s = scenario({ p1: { battlefield: ["Hare Apparent", "Hare Apparent", ...lands("Plains", 2)], hand: ["Hare Apparent"] } });
    s = cast(s, "p1", "Hare Apparent");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Hare Apparent").length === 3);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(2);
  });

  it("Authority of the Consuls : les créatures adverses arrivent engagées", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Authority of the Consuls"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = cast(s, "p2", "Llanowar Elves");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p2", "battlefield", "Llanowar Elves").length === 1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Sun-Blessed Healer ne réanime que s'il a été kické", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Sun-Blessed Healer"], graveyard: ["Llanowar Elves"] } });
    let s = cast(setup(), "p1", "Sun-Blessed Healer");
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    s = cast(setup(), "p1", "Sun-Blessed Healer", { kicked: true });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Llanowar Elves").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Pilfer : le lanceur choisit la carte non-terrain défaussée", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Pilfer"] },
      p2: { hand: ["Forest", "Opt", "Shivan Dragon"] },
    });
    s = cast(s, "p1", "Pilfer", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toHaveLength(2);
    s = choose(s, [idOf(s, "p2", "hand", "Shivan Dragon")]);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Painful Quandary : l'adversaire choisit entre 5 PV et une défausse", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Painful Quandary"] },
      p2: { battlefield: ["Island"], hand: ["Opt", "Forest"] },
    });
    s = cast(s, "p2", "Opt");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "punisher");
    expect(s.pending?.player).toBe("p2");
    s = choose(s, ["life"]);
    expect(s.players.p2?.life).toBe(15);
  });
});

describe("Foundations : coûts et mana", () => {
  it("Elvish Archdruid produit {G} pour chaque Elfe", () => {
    const s = scenario({ p1: { battlefield: ["Elvish Archdruid", "Llanowar Elves", "Llanowar Elves"] } });
    const archdruid = idOf(s, "p1", "battlefield", "Elvish Archdruid");
    const after = act(s, "p1", { type: "tapForMana", source: archdruid, ability: 0, color: "G" });
    expect(after.players.p1?.manaPool.G).toBe(3);
  });

  it("Hungry Ghoul sacrifie une autre créature pour son coût", () => {
    let s = scenario({ p1: { battlefield: ["Hungry Ghoul", "Llanowar Elves", "Swamp"] } });
    const ghoul = idOf(s, "p1", "battlefield", "Hungry Ghoul");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: ghoul, ability: 0, sacrifice: [elf] });
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    s = passBoth(s);
    expect(counterCount(s.objects[ghoul] as never, "+1/+1")).toBe(1);
  });

  it("High Fae Trickster donne le flash à vos sorts", () => {
    const s = scenario({
      active: "p2",
      step: "upkeep",
      p1: { battlefield: ["High Fae Trickster", ...lands("Forest", 4)], hand: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const p = passAccepting(s, (x) => x.pending?.player === "p1");
    expect(legalActions(p, "p1").some((a) => a.type === "cast")).toBe(true);
  });

  it("Mild-Mannered Librarian ne s'active qu'une fois", () => {
    let s = scenario({ p1: { battlefield: ["Mild-Mannered Librarian", ...lands("Forest", 8)] } });
    const lib = idOf(s, "p1", "battlefield", "Mild-Mannered Librarian");
    s = act(s, "p1", { type: "activate", source: lib, ability: 0 });
    s = passBoth(s);
    expect(s.defs[s.objects[lib]?.defId ?? ""]).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === lib)).toBe(false);
  });
});

describe("Foundations : la pile (contresorts et garde)", () => {
  /** p1 lance un sort ; p2 reçoit la priorité avec le sort sur la pile. */
  const withSpellOnStack = (p1Hand: string, p2Hand: string[], p2Lands = lands("Island", 3), p1Lands = lands("Forest", 7)) => {
    let s = scenario({ p1: { battlefield: p1Lands, hand: [p1Hand] }, p2: { battlefield: p2Lands, hand: p2Hand } });
    s = cast(s, "p1", p1Hand);
    s = act(s, "p1", { type: "pass" });
    return s;
  };

  it("Essence Scatter contrecarre un sort de créature, pas un autre sort", () => {
    let s = withSpellOnStack("Pelakka Wurm", ["Essence Scatter"]);
    const spell = s.stack[0]?.id as string;
    const opt = legalActions(s, "p2").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([spell]);
    s = cast(s, "p2", "Essence Scatter", { targets: { t: [spell] } });
    s = passBoth(s);
    expect(s.stack).toHaveLength(0);
    expect(idsOf(s, "p1", "graveyard", "Pelakka Wurm")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(0);

    const s2 = withSpellOnStack("Dragon Fodder", ["Essence Scatter"], lands("Island", 3), lands("Mountain", 3));
    expect(legalActions(s2, "p2").some((a) => a.type === "cast")).toBe(false);
  });

  it("An Offer You Can't Refuse : le lanceur du sort contrecarré reçoit deux Trésors", () => {
    let s = withSpellOnStack("Overrun", ["An Offer You Can't Refuse"]);
    s = cast(s, "p2", "An Offer You Can't Refuse", { targets: { t: [s.stack[0]?.id as string] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "graveyard", "Overrun")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
  });

  it("un sort lancé en flashback et contrecarré est exilé", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), graveyard: ["Think Twice"] },
      p2: { battlefield: lands("Island", 3), hand: ["Refute"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Think Twice") });
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Refute", { targets: { t: [s.stack[0]?.id as string] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Think Twice");
  });

  it("Koma ne peut pas être contrecarré", () => {
    let s = withSpellOnStack("Koma, World-Eater", ["Refute"], lands("Island", 3), [...lands("Forest", 4), ...lands("Island", 3)]);
    s = cast(s, "p2", "Refute", { targets: { t: [s.stack[0]?.id as string] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Koma, World-Eater").length === 1);
    expect(idsOf(s, "p1", "battlefield", "Koma, World-Eater")).toHaveLength(1);
  });

  it("garde {2} : le sort adverse est contrecarré si son contrôleur ne paie pas", () => {
    const setup = (extraLands: number) =>
      scenario({
        p1: { battlefield: ["Cackling Prowler"] },
        p2: { battlefield: lands("Swamp", 1 + extraLands), hand: ["Stab"] },
        active: "p2",
      });
    // Sans mana pour payer : Stab est contrecarré.
    let s = setup(0);
    const prowler = idOf(s, "p1", "battlefield", "Cackling Prowler");
    s = cast(s, "p2", "Stab", { targets: { t: [prowler] } });
    expect(s.stack).toHaveLength(2); // Stab + déclenchement de garde
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p2", "graveyard", "Stab")).toHaveLength(1);
    expect(s.effects.some((e) => e.affected.includes(prowler))).toBe(false);
    // Avec de quoi payer : le joueur paie {2} et Stab se résout.
    s = setup(2);
    s = cast(s, "p2", "Stab", { targets: { t: [prowler] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "unlessPay");
    expect(s.pending?.player).toBe("p2");
    s = choose(s, [1]);
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.effects.some((e) => e.affected.includes(prowler) && e.power === -2)).toBe(true);
  });

  it("garde — payer 7 PV (Sire of Seven Deaths)", () => {
    let s = scenario({
      p1: { battlefield: ["Sire of Seven Deaths"] },
      p2: { battlefield: ["Swamp"], hand: ["Stab"] },
      active: "p2",
    });
    s = cast(s, "p2", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Sire of Seven Deaths")] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "unlessPay");
    s = choose(s, [1]);
    expect(s.players.p2?.life).toBe(13);
  });

  it("la garde ne se déclenche pas pour les sorts de son contrôleur", () => {
    let s = scenario({ p1: { battlefield: ["Cackling Prowler", "Forest"], hand: ["Giant Growth"] } });
    s = cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Cackling Prowler")] } });
    expect(s.stack).toHaveLength(1);
  });

  it("Zul Ashur permet de lancer un Zombie du cimetière ce tour-ci", () => {
    let s = scenario({
      p1: { battlefield: ["Zul Ashur, Lich Lord", ...lands("Swamp", 3)], graveyard: ["Diregraf Ghoul", "Pelakka Wurm"] },
    });
    const ghoul = idOf(s, "p1", "graveyard", "Diregraf Ghoul");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === ghoul)).toBe(false);
    s = act(s, "p1", {
      type: "activate",
      source: idOf(s, "p1", "battlefield", "Zul Ashur, Lich Lord"),
      ability: 0,
      targets: { t: [ghoul] },
    });
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === ghoul)).toBe(true);
    s = act(s, "p1", { type: "cast", card: ghoul });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Diregraf Ghoul")).toHaveLength(1);
  });
});

describe("Foundations : Auras et Équipements", () => {
  it("une Aura cible au lancement et arrive attachée ; elle va au cimetière si l'hôte part", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 3)], hand: ["Blanchwood Armor"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = cast(s, "p1", "Blanchwood Armor", { targets: { enchant: [elf] } });
    s = passBoth(s);
    const armor = idOf(s, "p1", "battlefield", "Blanchwood Armor");
    expect(s.objects[armor]?.attachedTo).toBe(elf);
    // +1/+1 par Forêt (3) : l'Elfe 1/1 devient 4/4.
    expect(chars(s, elf).power).toBe(4);
    destroy(s, elf);
    s = act(s, "p1", { type: "pass" }); // les actions basées sur l'état sont vérifiées
    expect(idsOf(s, "p1", "graveyard", "Blanchwood Armor")).toHaveLength(1);
  });

  it("Équiper : en rituel, attache l'Équipement ; il reste en jeu quand la créature part", () => {
    let s = scenario({ p1: { battlefield: ["Swiftfoot Boots", "Llanowar Elves", "Forest"] } });
    const boots = idOf(s, "p1", "battlefield", "Swiftfoot Boots");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === boots);
    expect(equip?.type === "activate" && equip.label).toBe("Équiper {1}");
    if (equip?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: boots, ability: equip.ability, targets: { t: [elf] } });
    s = passBoth(s);
    expect(s.objects[boots]?.attachedTo).toBe(elf);
    expect(chars(s, elf).keywords).toEqual(expect.arrayContaining(["hexproof", "haste"]));
    destroy(s, elf);
    s = act(s, "p1", { type: "pass" }); // les actions basées sur l'état sont vérifiées
    expect(onBattlefield(s, boots)).toBe(true);
    expect(s.objects[boots]?.attachedTo).toBeUndefined();
  });

  it("Imprisoned in the Moon : la créature devient un terrain incolore qui produit {C}", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Imprisoned in the Moon"] },
      p2: { battlefield: ["Elvish Archdruid"] },
    });
    const druid = idOf(s, "p2", "battlefield", "Elvish Archdruid");
    s = cast(s, "p1", "Imprisoned in the Moon", { targets: { enchant: [druid] } });
    s = passBoth(s);
    const c = chars(s, druid);
    expect(c.types).toEqual(["Land"]);
    expect(c.colors).toEqual([]);
    expect(c.subtypes).toEqual([]);
    const mana = manaAbilitiesOf(s, druid);
    expect(mana.map((m) => m.produce)).toEqual([["C"]]);
  });

  it("Witness Protection : Citoyen 1/1 sans capacités nommé Legitimate Businessperson", () => {
    let s = scenario({
      p1: { battlefield: ["Island"], hand: ["Witness Protection"] },
      p2: { battlefield: ["Shivan Dragon", "Anthem of Champions"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Witness Protection", { targets: { enchant: [dragon] } });
    s = passBoth(s);
    const c = chars(s, dragon);
    expect(c.name).toBe("Legitimate Businessperson");
    expect(c.keywords).toEqual([]);
    expect(c.subtypes).toEqual(["Citizen"]);
    // 1/1 de base, +1/+1 de l'Anthem adverse.
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(legalActions(s, "p2").some((a) => a.type === "activate")).toBe(false);
  });

  it("Fiery Annihilation n'exile qu'un Équipement attaché à la créature ciblée", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Fiery Annihilation"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves", "Goldvein Pick", "Swiftfoot Boots"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const pick = idOf(s, "p2", "battlefield", "Goldvein Pick");
    const boots = idOf(s, "p2", "battlefield", "Swiftfoot Boots");
    (s.objects[pick] as { attachedTo?: string }).attachedTo = dragon;
    (s.objects[boots] as { attachedTo?: string }).attachedTo = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect(() => cast(s, "p1", "Fiery Annihilation", { targets: { t: [dragon], e: [boots] } })).toThrow();
    s = cast(s, "p1", "Fiery Annihilation", { targets: { t: [dragon], e: [pick] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name).sort()).toEqual(["Goldvein Pick", "Shivan Dragon"]);
  });

  it("Fishing Pole : appât en engageant la créature, Poisson quand elle se dégage", () => {
    let s = scenario({ p1: { battlefield: ["Fishing Pole", "Llanowar Elves", "Forest"] } });
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    (s.objects[pole] as { attachedTo?: string }).attachedTo = elf;
    s = act(s, "p1", { type: "activate", source: pole, ability: 0 });
    s = passBoth(s);
    expect(s.objects[pole]?.counters.bait).toBe(1);
    expect(s.objects[elf]?.tapped).toBe(true);
    // Tour suivant de p1 : l'Elfe se dégage, un Poisson est créé.
    s = passAccepting(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(1);
    expect(s.objects[pole]?.counters.bait ?? 0).toBe(0);
  });

  it("Leyline Axe : proposée en début de partie depuis la main de départ", () => {
    const deck = (extra: string) => [extra, ...Array(59).fill("Forest")].map((n) => card(n));
    // Une graine où la Hache est dans la main de départ de p1.
    let s!: S;
    for (let seed = 1; seed < 200; seed++) {
      s = createGame({
        seed,
        startingPlayer: "p1",
        players: [
          { id: "p1", name: "A", deck: deck("Leyline Axe") },
          { id: "p2", name: "B", deck: deck("Forest") },
        ],
      }).state;
      if (idsOf(s, "p1", "hand", "Leyline Axe").length) break;
    }
    for (let i = 0; i < 4 && s.pending?.kind === "mulligan"; i++) s = act(s, s.pending.player, { type: "keep" });
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("leyline");
    s = choose(s, idsOf(s, "p1", "hand", "Leyline Axe"));
    expect(idsOf(s, "p1", "battlefield", "Leyline Axe")).toHaveLength(1);
    expect(s.turn.number).toBe(1);
  });
});

describe("Foundations : planeswalkers", () => {
  const walker = (s: S, name: string, p = "p1") => idOf(s, p, "battlefield", name);
  const loyaltyOf = (s: S, id: string) => s.objects[id]?.counters.loyalty ?? 0;
  const activate = (s: S, source: string, label: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && x.label?.startsWith(label));
    if (a?.type !== "activate") throw new Error(`capacité ${label} indisponible`);
    return act(s, "p1", { type: "activate", source, ability: a.ability, targets });
  };

  it("arrive avec sa loyauté ; une capacité de loyauté par tour ; −N impossible sans assez de loyauté", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Llanowar Elves"], hand: ["Ajani, Caller of the Pride"] } });
    s = cast(s, "p1", "Ajani, Caller of the Pride");
    s = passBoth(s);
    const ajani = walker(s, "Ajani, Caller of the Pride");
    expect(loyaltyOf(s, ajani)).toBe(4);
    const labels = legalActions(s, "p1").flatMap((a) => (a.type === "activate" && a.source === ajani ? [a.label] : []));
    expect(labels.map((l) => l?.split(" ")[0])).toEqual(["+1", "−3"]); // −8 : pas assez de loyauté
    s = activate(s, ajani, "+1", { t: [] });
    expect(loyaltyOf(s, ajani)).toBe(5);
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ajani)).toBe(false);
  });

  it("les blessures retirent de la loyauté ; à 0, le planeswalker va au cimetière", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Vivien Reid"] },
      p2: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
    });
    const vivien = walker(s, "Vivien Reid");
    (s.objects[vivien] as { counters: Record<string, number> }).counters.loyalty = 5;
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [vivien] } });
    s = passBoth(s);
    expect(loyaltyOf(s, vivien)).toBe(3);
    (s.objects[vivien] as { counters: Record<string, number> }).counters.loyalty = 0;
    s = act(s, s.pending?.player ?? "p2", { type: "pass" });
    expect(idsOf(s, "p1", "graveyard", "Vivien Reid")).toHaveLength(1);
  });

  it("attaquer un planeswalker : bloqué par son contrôleur, sinon blessures en loyauté", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
      p2: { battlefield: ["Liliana, Dreadhorde General", "Prideful Parent"] },
    });
    const lili = walker(s, "Liliana, Dreadhorde General", "p2");
    (s.objects[lili] as { counters: Record<string, number> }).counters.loyalty = 6;
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    const view = legalActions; // (legalActions ne sert qu'à la priorité)
    void view;
    const dragon = walker(s, "Shivan Dragon");
    const elf = walker(s, "Llanowar Elves");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: dragon, defender: lili },
        { id: elf, defender: lili },
      ],
    });
    s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
    expect(s.pending?.player).toBe("p2");
    // Le Chat bloque l'Elfe ; le Dragon (5) touche Liliana.
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Prideful Parent"), attacker: elf }],
    });
    s = passAccepting(s, (x) => x.turn.step === "main2");
    expect(loyaltyOf(s, lili)).toBe(1);
    expect(s.players.p2?.life).toBe(20);
  });

  it("Kaito : marqueur quand une créature blesse un joueur ; emblème qui crée des Ninjas", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Kaito, Cunning Infiltrator", "Llanowar Elves"] },
    });
    const kaito = walker(s, "Kaito, Cunning Infiltrator");
    (s.objects[kaito] as { counters: Record<string, number> }).counters.loyalty = 9;
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: walker(s, "Llanowar Elves"), defender: "p2" }] });
    s = passAccepting(s, (x) => x.turn.step === "main2");
    expect(loyaltyOf(s, kaito)).toBe(10);
    s = activate(s, kaito, "−9");
    s = passBoth(s);
    expect(s.players.p1?.command).toHaveLength(1);
    expect(onBattlefield(s, kaito)).toBe(true); // 10 − 9 = 1

    // L'emblème : chaque sort lancé, par n'importe quel joueur, crée un Ninja 2/1.
    let t = scenario({ p1: { battlefield: ["Kaito, Cunning Infiltrator", "Island"], hand: ["Opt"] } });
    const k = walker(t, "Kaito, Cunning Infiltrator");
    (t.objects[k] as { counters: Record<string, number> }).counters.loyalty = 9;
    t = activate(t, k, "−9");
    t = passBoth(t);
    t = cast(t, "p1", "Opt");
    t = passAccepting(t, (x) => x.stack.length === 0);
    expect(idsOf(t, "p1", "battlefield", "Ninja")).toHaveLength(1);
  });

  it("emblème de Vivien : +2/+2, vigilance, piétinement, indestructible", () => {
    let s = scenario({ p1: { battlefield: ["Vivien Reid", "Llanowar Elves"] } });
    const vivien = walker(s, "Vivien Reid");
    (s.objects[vivien] as { counters: Record<string, number> }).counters.loyalty = 8;
    s = activate(s, vivien, "−8");
    s = passBoth(s);
    const elf = walker(s, "Llanowar Elves");
    expect([chars(s, elf).power, chars(s, elf).toughness]).toEqual([3, 3]);
    expect(chars(s, elf).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "indestructible"]));
    expect(onBattlefield(s, vivien)).toBe(false); // 0 loyauté
  });

  it("Chandra +2 : {R}{R}{R} et une carte exilée jouable ce tour-ci ; −4 : 8 blessures réparties", () => {
    let s = scenario({
      p1: {
        battlefield: ["Chandra, Flameshaper", ...lands("Mountain", 3)],
        library: ["Shivan Dragon", "Forest", "Opt", "Forest"],
      },
      p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const chandra = walker(s, "Chandra, Flameshaper");
    (s.objects[chandra] as { counters: Record<string, number> }).counters.loyalty = 6;
    s = activate(s, chandra, "+2");
    s = passBoth(s);
    expect(s.players.p1?.manaPool.R).toBe(3);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("impulse");
    const dragon = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Shivan Dragon") as string;
    s = choose(s, [dragon]);
    const cast0 = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dragon);
    expect(cast0?.type === "cast" && cast0.fromExile).toBe(true);

    // −4 l'autre tour : 8 blessures réparties entre deux créatures.
    s = scenario({ p1: { battlefield: ["Chandra, Flameshaper"] }, p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] } });
    const ch = walker(s, "Chandra, Flameshaper");
    (s.objects[ch] as { counters: Record<string, number> }).counters.loyalty = 6;
    const wurm = walker(s, "Pelakka Wurm", "p2");
    const elf = walker(s, "Llanowar Elves", "p2");
    s = activate(s, ch, "−4", { t: [wurm, elf] });
    // La répartition s'annonce à l'activation (601.2d, 602.2b), avant la priorité.
    expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("divide");
    expect(() => choose(s, [8, 0])).toThrow(); // au moins 1 par cible
    s = choose(s, [7, 1]);
    expect(s.stack[0]?.division).toEqual({ t: [7, 1] });
    s = passBoth(s);
    expect(idsOf(s, "p2", "graveyard", "Pelakka Wurm")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Liliana −9 : l'adversaire garde un permanent de chaque type", () => {
    let s = scenario({
      p1: { battlefield: ["Liliana, Dreadhorde General"] },
      p2: { battlefield: ["Forest", "Island", "Llanowar Elves", "Shivan Dragon", "Anthem of Champions"] },
    });
    const lili = walker(s, "Liliana, Dreadhorde General");
    (s.objects[lili] as { counters: Record<string, number> }).counters.loyalty = 9;
    s = activate(s, lili, "−9");
    s = passBoth(s);
    // Créature : garder le Dragon ; terrain : garder l'Île.
    for (let i = 0; i < 3 && s.pending?.kind === "choice"; i++) {
      const req = s.pending.request;
      if (req.type !== "pick") break;
      const want = req.options.find((id) => ["Shivan Dragon", "Island"].includes(s.defs[s.objects[id]?.defId ?? ""]?.name ?? ""));
      s = choose(s, [want ?? (req.options[0] as string)]);
    }
    const names = s.battlefield
      .filter((id) => s.objects[id]?.controller === "p2")
      .map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names.sort()).toEqual(["Anthem of Champions", "Island", "Shivan Dragon"]);
  });
});

describe("Foundations : destination réelle d'une créature qui meurt", () => {
  /** Lance un sort puis laisse tout le monde passer jusqu'à sa résolution ; renvoie les événements. */
  function castAndResolve(s: GameState, player: string, spell: string, target: string): { s: GameState; events: GameEvent[] } {
    const events: GameEvent[] = [];
    let r = submit(s, player, { type: "cast", card: idOf(s, player, "hand", spell), mode: 0, targets: { t: [target] } });
    events.push(...r.events);
    for (let i = 0; i < 10 && r.state.stack.length > 0 && r.state.pending?.kind === "priority"; i++) {
      r = submit(r.state, r.state.pending.player, { type: "pass" });
      events.push(...r.events);
    }
    return { s: r.state, events };
  }

  it("Feu du dragon dévastateur : l'événement de mort annonce l'exil", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Scorching Dragonfire"] },
    });
    const { s: after, events } = castAndResolve(s, "p2", "Scorching Dragonfire", idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(events.find((e) => e.type === "dies")).toMatchObject({ type: "dies", to: "exile" });
    expect(after.exile.some((id) => after.defs[after.objects[id]?.defId ?? ""]?.name === "Bear Cub")).toBe(true);
  });

  it("sans remplacement, elle va au cimetière", () => {
    const s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const { events } = castAndResolve(s, "p1", "Burst Lightning", idOf(s, "p2", "battlefield", "Bear Cub"));
    expect(events.find((e) => e.type === "dies")).toMatchObject({ type: "dies", to: "graveyard" });
  });
});

// ---------------------------------------------------------------------------
// Cartes des decks du méta Standard (docs/plans/PLAN-C.md, lot C13) : chaque carte fait ce que dit son texte Oracle.
// ---------------------------------------------------------------------------

describe("Foundations : cartes du méta Standard", () => {
  /** Active la capacité de `source` dont l'intitulé commence par `label` (ou la première, sans intitulé). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.startsWith(label)),
    );
    if (a?.type !== "activate") throw new Error(`capacité ${label ?? ""} indisponible`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id)).sort();
  const yardNames = (s: S, p: string) => (s.players[p]?.graveyard ?? []).map((id) => nameOf(s, id)).sort();
  /** p1 lance `spell` ; p2 reçoit la priorité avec le sort sur la pile. */
  const onStack = (spell: string, p1Lands: string[], p2Hand: string[]) => {
    let s = scenario({ p1: { battlefield: p1Lands, hand: [spell] }, p2: { battlefield: lands("Island", 2), hand: p2Hand } });
    s = cast(s, "p1", spell);
    return act(s, "p1", { type: "pass" });
  };
  const legalSpellTargets = (s: S, player: string, card: string) => {
    const opt = legalActions(s, player).find((a) => a.type === "cast" && a.card === card);
    return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
  };

  it("Duress : l'adversaire révèle sa main ; vous choisissez une carte non-créature non-terrain, qu'il défausse", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Duress"] },
      p2: { hand: ["Forest", "Llanowar Elves", "Opt", "Giant Growth"] },
    });
    s = cast(s, "p1", "Duress", { targets: { t: ["p2"] } });
    s = passBoth(s);
    // C'est le lanceur qui choisit, parmi les seules cartes non-créatures non-terrains.
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Giant Growth", "Opt"]);
    s = choose(s, [idOf(s, "p2", "hand", "Giant Growth")]);
    expect(yardNames(s, "p2")).toEqual(["Giant Growth"]);
    expect(handNames(s, "p2")).toEqual(["Forest", "Llanowar Elves", "Opt"]);
  });

  it("Duress : rien à défausser si la main ne contient que des créatures et des terrains", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Duress"] }, p2: { hand: ["Forest", "Llanowar Elves"] } });
    s = settle(cast(s, "p1", "Duress", { targets: { t: ["p2"] } }));
    expect(handNames(s, "p2")).toEqual(["Forest", "Llanowar Elves"]);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });

  it("Flashfreeze contrecarre un sort rouge ou vert, pas un sort bleu", () => {
    let s = onStack("Overrun", lands("Forest", 5), ["Flashfreeze"]);
    const spell = s.stack[0]?.id as string;
    expect(legalSpellTargets(s, "p2", idOf(s, "p2", "hand", "Flashfreeze"))).toEqual([spell]);
    s = settle(cast(s, "p2", "Flashfreeze", { targets: { t: [spell] } }));
    expect(idsOf(s, "p1", "graveyard", "Overrun")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    // Un sort bleu n'est pas une cible légale.
    const blue = onStack("Opt", ["Island"], ["Flashfreeze"]);
    expect(castable(blue, "p2", idOf(blue, "p2", "hand", "Flashfreeze"))).toBe(false);
  });

  it("Negate contrecarre un sort non-créature, pas un sort de créature", () => {
    let s = onStack("Overrun", lands("Forest", 5), ["Negate"]);
    s = settle(cast(s, "p2", "Negate", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(idsOf(s, "p1", "graveyard", "Overrun")).toHaveLength(1);
    const creature = onStack("Llanowar Elves", ["Forest"], ["Negate"]);
    expect(castable(creature, "p2", idOf(creature, "p2", "hand", "Negate"))).toBe(false);
  });

  it("Day of Judgment détruit toutes les créatures, des deux camps, et rien d'autre", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Serra Angel", "Swiftfoot Boots"], hand: ["Day of Judgment"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves", "Vivien Reid"] },
    });
    s = settle(cast(s, "p1", "Day of Judgment"));
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    expect(yardNames(s, "p1")).toEqual(["Day of Judgment", "Serra Angel"]);
    expect(yardNames(s, "p2")).toEqual(["Llanowar Elves", "Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Swiftfoot Boots")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Vivien Reid")).toHaveLength(1);
  });

  it("Demolition Field : {C} ; {2}, {T}, sacrifice : détruit un terrain non de base adverse, chacun cherche un terrain de base", () => {
    let s = scenario({
      p1: { battlefield: ["Demolition Field", "Forest", "Forest"], library: ["Plains", "Opt", "Opt"] },
      p2: { battlefield: ["Breeding Pool", "Forest"], library: ["Island", "Opt", "Opt"] },
    });
    const field = idOf(s, "p1", "battlefield", "Demolition Field");
    expect(manaAbilitiesOf(s, field).map((m) => m.produce)).toEqual([["C"]]);
    // Seul le terrain non de base adverse est une cible.
    const pool = idOf(s, "p2", "battlefield", "Breeding Pool");
    expect(() => activate(s, "p1", field, "Détruire", { t: [idOf(s, "p2", "battlefield", "Forest")] })).toThrow();
    s = activate(s, "p1", field, "Détruire", { t: [pool] });
    expect(idsOf(s, "p1", "graveyard", "Demolition Field")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Breeding Pool")).toHaveLength(1);
    // Le contrôleur du terrain détruit puis l'activateur ont chacun mis un terrain de base sur le champ de bataille.
    expect(idsOf(s, "p2", "battlefield", "Island")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
  });

  it("Soul-Guide Lantern : à l'arrivée, exile une carte d'un cimetière ; sacrifice : exile les cimetières adverses", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest"], hand: ["Soul-Guide Lantern"], graveyard: ["Opt"] },
      p2: { graveyard: ["Shivan Dragon", "Llanowar Elves", "Giant Growth"] },
    });
    const dragon = idOf(s, "p2", "graveyard", "Shivan Dragon");
    s = settle(cast(s, "p1", "Soul-Guide Lantern"), picking([dragon]));
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    const lantern = idOf(s, "p1", "battlefield", "Soul-Guide Lantern");
    s = settle(activate(s, "p1", lantern, "Exiler"));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(3);
    // Votre propre cimetière n'est pas touché ; la Lanterne sacrifiée y est allée.
    expect(yardNames(s, "p1")).toEqual(["Opt", "Soul-Guide Lantern"]);
  });

  it("Soul-Guide Lantern : {1}, {T}, sacrifice : piochez une carte", () => {
    let s = scenario({ p1: { battlefield: ["Soul-Guide Lantern", "Forest"] } });
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Soul-Guide Lantern"), "Piochez"));
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
    expect(idsOf(s, "p1", "graveyard", "Soul-Guide Lantern")).toHaveLength(1);
  });

  it("Hinterland Sanctifier : 1 PV quand une autre créature arrive sous votre contrôle (pas lui, pas l'adversaire)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Hinterland Sanctifier", "Savannah Lions"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Hinterland Sanctifier"));
    expect(s.players.p1?.life).toBe(20);
    s = settle(cast(s, "p1", "Savannah Lions"));
    expect(s.players.p1?.life).toBe(21);
    // Une créature adverse ne compte pas.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(cast(s, "p2", "Llanowar Elves"));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Cathar Commando : flash ; {1}, sacrifice : détruit un artefact ou un enchantement", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Plains", 3), hand: ["Cathar Commando"] },
      p2: { battlefield: ["Swiftfoot Boots", "Banishing Light", "Llanowar Elves"] },
    });
    s = act(s, "p2", { type: "pass" });
    // Pendant le tour adverse : le flash.
    expect(s.pending?.player).toBe("p1");
    s = settle(cast(s, "p1", "Cathar Commando"));
    s = act(s, "p2", { type: "pass" });
    expect(s.pending?.player).toBe("p1");
    const commando = idOf(s, "p1", "battlefield", "Cathar Commando");
    const sac = { type: "activate", source: commando, ability: 0 } as const;
    // Une créature n'est pas une cible légale.
    expect(() => act(s, "p1", { ...sac, targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } })).toThrow();
    s = act(s, "p1", { ...sac, targets: { t: [idOf(s, "p2", "battlefield", "Swiftfoot Boots")] } });
    expect(idsOf(s, "p1", "graveyard", "Cathar Commando")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
    // Un enchantement est aussi une cible légale.
    let t = scenario({ p1: { battlefield: ["Cathar Commando", "Plains"] }, p2: { battlefield: ["Banishing Light"] } });
    t = settle(
      activate(t, "p1", idOf(t, "p1", "battlefield", "Cathar Commando"), undefined, {
        t: [idOf(t, "p2", "battlefield", "Banishing Light")],
      }),
    );
    expect(idsOf(t, "p2", "graveyard", "Banishing Light")).toHaveLength(1);
  });

  describe("Boros Charm", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Mountain", "Plains", "Serra Angel", "Swiftfoot Boots"], hand: ["Boros Charm"] },
        p2: { battlefield: ["Vivien Reid"] },
      });

    it("mode 1 : 4 blessures à un joueur ou à un planeswalker", () => {
      let s = settle(cast(setup(), "p1", "Boros Charm", { mode: 0, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      s = setup();
      const vivien = idOf(s, "p2", "battlefield", "Vivien Reid");
      s = settle(cast(s, "p1", "Boros Charm", { mode: 0, targets: { t: [vivien] } }));
      expect(s.objects[vivien]?.counters.loyalty).toBe(1); // 5 − 4
    });

    it("mode 2 : vos permanents gagnent l'indestructible jusqu'à la fin du tour", () => {
      let s = settle(cast(setup(), "p1", "Boros Charm", { mode: 1 }));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(chars(s, angel).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Swiftfoot Boots")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Vivien Reid")).keywords).not.toContain("indestructible");
      destroy(s, angel);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, angel).keywords).not.toContain("indestructible");
    });

    it("mode 3 : une créature gagne la double initiative jusqu'à la fin du tour", () => {
      let s = setup();
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Boros Charm", { mode: 2, targets: { t: [angel] } }));
      expect(chars(s, angel).keywords).toContain("doubleStrike");
    });
  });

  it("Deathmark détruit une créature verte ou blanche, pas une rouge", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Deathmark"] },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel", "Shivan Dragon"] },
    });
    const legal = legalSpellTargets(s, "p1", idOf(s, "p1", "hand", "Deathmark"))
      .map((id) => nameOf(s, id))
      .sort();
    expect(legal).toEqual(["Llanowar Elves", "Serra Angel"]);
    s = settle(cast(s, "p1", "Deathmark", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Temple of Deceit arrive engagé, regard 1, et produit {U} ou {B}", () => {
    let s = scenario({ p1: { hand: ["Temple of Deceit"], library: ["Shivan Dragon", "Opt", "Forest"] } });
    let asked = false;
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Temple of Deceit") });
    s = settle(s, (req) => {
      if (req.intent !== "scryBottom") return undefined;
      asked = true;
      return req.type === "pick" ? req.options.slice(0, 1) : undefined;
    });
    expect(asked).toBe(true);
    const temple = idOf(s, "p1", "battlefield", "Temple of Deceit");
    expect(s.objects[temple]?.tapped).toBe(true);
    // Le Dragon est passé sous la bibliothèque.
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Opt");
    expect(
      manaAbilitiesOf(s, temple)
        .flatMap((m) => m.produce)
        .sort(),
    ).toEqual(["B", "U"]);
  });

  it("Maelstrom Pulse détruit le permanent ciblé et tous les autres du même nom, quel que soit leur contrôleur", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Forest", "Llanowar Elves"], hand: ["Maelstrom Pulse"] },
      p2: { battlefield: ["Llanowar Elves", "Llanowar Elves", "Pelakka Wurm", "Forest"] },
    });
    // Un terrain n'est pas une cible.
    expect(() => cast(s, "p1", "Maelstrom Pulse", { targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = settle(cast(s, "p1", "Maelstrom Pulse", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(2);
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });

  describe("Slagstorm", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Llanowar Elves"], hand: ["Slagstorm"] },
        p2: { battlefield: ["Pelakka Wurm", "Vivien Reid"] },
      });

    it("mode 1 : 3 blessures à chaque créature (pas aux planeswalkers ni aux joueurs)", () => {
      const s = settle(cast(setup(), "p1", "Slagstorm", { mode: 0 }));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Pelakka Wurm")]?.damage).toBe(3);
      expect(s.objects[idOf(s, "p2", "battlefield", "Vivien Reid")]?.counters.loyalty).toBe(5);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
    });

    it("mode 2 : 3 blessures à chaque joueur", () => {
      const s = settle(cast(setup(), "p1", "Slagstorm", { mode: 1 }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([17, 17]);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Pelakka Wurm")]?.damage).toBe(0);
    });
  });

  describe("Bushwhack", () => {
    it("mode 1 : cherche une carte de terrain de base et la met en main", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Bushwhack"], library: ["Opt", "Shivan Dragon", "Mountain"] } });
      s = settle(cast(s, "p1", "Bushwhack", { mode: 0 }));
      expect(handNames(s, "p1")).toEqual(["Mountain"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("mode 2 : votre créature se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Pelakka Wurm"], hand: ["Bushwhack"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      // La première cible doit être à vous, la seconde à l'adversaire.
      expect(() => cast(s, "p1", "Bushwhack", { mode: 1, targets: { a: [dragon], b: [wurm] } })).toThrow();
      s = settle(cast(s, "p1", "Bushwhack", { mode: 1, targets: { a: [wurm], b: [dragon] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(s.objects[wurm]?.damage).toBe(5);
    });
  });
});
