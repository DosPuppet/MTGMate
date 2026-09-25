/**
 * Cartes de Foundations : vérifie les primitives ajoutées pour le set principal
 * (cibles dans le cimetière, cibles multiples, exil lié, variables de résolution, coûts…).
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { createGame } from "../src/game";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, counterCount, onBattlefield } from "../src/state";
import { act, idOf, idsOf, passAccepting, passBoth, scenario } from "./helpers";

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
