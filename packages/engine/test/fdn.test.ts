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
import { canBlock } from "../src/turn";
import type { ChoiceRequest, GameEvent, GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  castable,
  counterFrom,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  passUntil,
  picking,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
} from "./helpers";

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

describe("Foundations, lot K8 : mythiques", () => {
  const commandZone = (s: S, p: string) =>
    Object.values(s.objects)
      .filter((o) => o.zone === "command" && o.controller === p)
      .map((o) => o.defId);

  it("Angelic Destiny : +4/+4, vol, initiative et type Ange ; revient dans la main de son propriétaire quand la créature meurt", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 4), hand: ["Angelic Destiny"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elf = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Angelic Destiny", { targets: { enchant: [elf] } }));
    const c = chars(s, elf);
    expect([c.power, c.toughness]).toEqual([5, 5]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "firstStrike"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Elf", "Angel"]));
    destroy(s, elf);
    s = settle(act(s, "p1", { type: "pass" }));
    // La créature enchantée est à l'adversaire, mais l'Aura revient dans la main de son propriétaire.
    expect(idsOf(s, "p1", "hand", "Angelic Destiny")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(0);
  });

  it("Bloodthirsty Conqueror : vous gagnez autant de PV qu'un adversaire en perd, pas quand vous en perdez", () => {
    let s = scenario({
      p1: { battlefield: ["Bloodthirsty Conqueror", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bloodthirsty Conqueror")).keywords).toEqual(
      expect.arrayContaining(["flying", "deathtouch"]),
    );
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Dragonmaster Outcast : Dragon 5/5 volant à votre entretien avec six terrains ou plus, rien avec cinq", () => {
    const run = (n: number) => {
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Dragonmaster Outcast", ...lands("Mountain", n)] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      return s;
    };
    const s = run(6);
    const dragons = idsOf(s, "p1", "battlefield", "Dragon");
    expect(dragons).toHaveLength(1);
    const d = chars(s, dragons[0] as string);
    expect([d.power, d.toughness, d.colors]).toEqual([5, 5, ["R"]]);
    expect(d.keywords).toContain("flying");
    expect(idsOf(run(5), "p1", "battlefield", "Dragon")).toHaveLength(0);
  });

  it("Finale of Revelation : X < 10, piochez X cartes ; le sort est exilé", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Finale of Revelation"], graveyard: ["Opt"] } });
    s = settle(cast(s, "p1", "Finale of Revelation", { x: 2 }));
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.library).toHaveLength(8);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Finale of Revelation");
    expect(commandZone(s, "p1")).toHaveLength(0);
  });

  it("Finale of Revelation : X ≥ 10, le cimetière est mélangé dans la bibliothèque, X cartes piochées, cinq terrains dégagés, pas de taille de main maximale", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 13), hand: ["Finale of Revelation"], graveyard: ["Opt", "Opt"] },
    });
    s = settle(cast(s, "p1", "Finale of Revelation", { x: 10 }));
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(10);
    // Bibliothèque : 10 Forêts + 2 Opt, moins 10 cartes piochées (une seule pioche de X).
    expect(s.players.p1?.library).toHaveLength(2);
    // 12 Îles engagées pour le sort, 1 restée dégagée : jusqu'à cinq sont dégagées, soit 6 au total.
    const untapped = idsOf(s, "p1", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped);
    expect(untapped).toHaveLength(6);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Finale of Revelation");
    expect(commandZone(s, "p1")).toHaveLength(1);
    // À la fin du tour, pas de défausse jusqu'à sept cartes.
    s = advanceUntil(s, (x) => x.turn.active === "p2" || x.pending?.kind === "discard");
    expect(s.pending?.kind).not.toBe("discard");
    expect(s.players.p1?.hand).toHaveLength(10);
  });

  it("Lyra Dawnbringer : les autres Anges que vous contrôlez ont +1/+1 et le lien de vie ; ni elle-même, ni les autres créatures, ni les Anges adverses", () => {
    const s = scenario({
      p1: { battlefield: ["Lyra Dawnbringer", "Serra Angel", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const lyra = chars(s, idOf(s, "p1", "battlefield", "Lyra Dawnbringer"));
    expect([lyra.power, lyra.toughness]).toEqual([5, 5]);
    expect(lyra.keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "lifelink"]));
    const mine = chars(s, idOf(s, "p1", "battlefield", "Serra Angel"));
    expect([mine.power, mine.toughness]).toEqual([5, 5]);
    expect(mine.keywords).toContain("lifelink");
    const elf = chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    expect([elf.power, elf.keywords.includes("lifelink")]).toEqual([1, false]);
    const theirs = chars(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    expect([theirs.power, theirs.keywords.includes("lifelink")]).toEqual([4, false]);
  });

  it("Massacre Wurm : −2/−2 aux créatures adverses jusqu'à la fin du tour ; chaque créature adverse qui meurt fait perdre 2 PV à son contrôleur", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 6), "Llanowar Elves"], hand: ["Massacre Wurm"] },
      p2: { battlefield: ["Llanowar Elves", "Llanowar Elves", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Massacre Wurm"));
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(16);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    // Une créature à vous qui meurt ne fait perdre de PV à personne.
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = settle(act(s, "p1", { type: "pass" }));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 16]);
    // L'effet cesse à la fin du tour.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([4, 4]);
  });

  it("Primeval Bounty : Bête 3/3 pour un sort de créature, trois marqueurs +1/+1 pour un autre sort, 3 PV par terrain qui arrive sous votre contrôle", () => {
    let s = scenario({
      p1: {
        battlefield: ["Primeval Bounty", "Llanowar Elves", ...lands("Forest", 2)],
        hand: ["Llanowar Elves", "Giant Growth", "Forest"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(idsOf(s, "p1", "battlefield", "Beast")).toHaveLength(1);
    const beast = chars(s, idOf(s, "p1", "battlefield", "Beast"));
    expect([beast.power, beast.toughness, beast.colors]).toEqual([3, 3, ["G"]]);
    expect(s.players.p1?.life).toBe(20);
    s = cast(s, "p1", "Giant Growth", { targets: { t: [elf] } });
    // La cible du déclenchement : une créature que vous contrôlez (pas l'Ange adverse).
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
      expect(s.pending.request.options).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    }
    s = settle(s, picking([elf]));
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(3);
    expect(idsOf(s, "p1", "battlefield", "Beast")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(s.players.p1?.life).toBe(23);
  });

  it("Ramos, Dragon Engine : un marqueur +1/+1 par couleur du sort lancé ; retirer cinq marqueurs donne {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, une fois par tour", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ramos, Dragon Engine", counters: { "+1/+1": 3 } }, ...lands("Mountain", 3), ...lands("Forest", 2)],
        hand: ["Shock", "Halana and Alena, Partners"],
      },
    });
    const ramos = idOf(s, "p1", "battlefield", "Ramos, Dragon Engine");
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(counterCount(s.objects[ramos] as never, "+1/+1")).toBe(4);
    s = settle(cast(s, "p1", "Halana and Alena, Partners"));
    expect(counterCount(s.objects[ramos] as never, "+1/+1")).toBe(6);
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ramos);
    expect(opt).toBeDefined();
    if (opt?.type !== "activate") return;
    s = act(s, "p1", { type: "activate", source: ramos, ability: opt.ability });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(counterCount(s.objects[ramos] as never, "+1/+1")).toBe(1);
    expect(s.players.p1?.manaPool).toMatchObject({ W: 2, U: 2, B: 2, R: 2, G: 2 });
    // Une seule fois par tour, même avec de nouveau cinq marqueurs.
    s.objects[ramos]!.counters["+1/+1"] = 5;
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ramos)).toBe(false);
  });

  it("Rise of the Dark Realms : toutes les cartes de créature de tous les cimetières arrivent sous votre contrôle", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 9), hand: ["Rise of the Dark Realms"], graveyard: ["Bear Cub", "Opt"] },
      p2: { graveyard: ["Serra Angel", "Shock"] },
    });
    s = settle(cast(s, "p1", "Rise of the Dark Realms"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.owner).toBe("p2");
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
  });

  it("Rite of the Dragoncaller : un Dragon 5/5 volant pour chacun de vos éphémères et rituels, rien pour une créature ni pour les sorts adverses", () => {
    let s = scenario({
      p1: { battlefield: ["Rite of the Dragoncaller", ...lands("Island", 2), "Forest"], hand: ["Opt", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(1);
    const d = chars(s, idOf(s, "p1", "battlefield", "Dragon"));
    expect([d.power, d.toughness, d.colors, d.keywords.includes("flying")]).toEqual([5, 5, ["R"], true]);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(1);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Dragon")).toHaveLength(0);
  });

  it("Sphinx of the Final Word : ne peut pas être contrecarré, a la défense talismanique ; vos éphémères et rituels ne peuvent pas être contrecarrés", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 8), hand: ["Sphinx of the Final Word", "Opt"] },
      p2: { battlefield: [...lands("Island", 6), "Mountain"], hand: ["Cancel", "Cancel", "Shock"] },
    });
    s = cast(s, "p1", "Sphinx of the Final Word");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Cancel", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    const sphinx = idOf(s, "p1", "battlefield", "Sphinx of the Final Word");
    expect(chars(s, sphinx).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
    // Défense talismanique : Shock adverse ne peut pas le cibler.
    s = cast(s, "p1", "Opt");
    s = act(s, "p1", { type: "pass" });
    const shock = legalActions(s, "p2").find((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
    expect(shock?.type === "cast" && shock.modes[0]?.targets[0]?.legal).not.toContain(sphinx);
    s = cast(s, "p2", "Cancel", { targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    // Opt s'est résolu (une carte piochée), Cancel n'a rien contrecarré.
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Sphinx of the Final Word : vos sorts de créature peuvent encore être contrecarrés", () => {
    let s = scenario({
      p1: { battlefield: ["Sphinx of the Final Word", "Forest"], hand: ["Llanowar Elves"] },
      p2: { battlefield: lands("Island", 3), hand: ["Cancel"] },
    });
    s = cast(s, "p1", "Llanowar Elves");
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Cancel", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Valkyrie's Call : une créature non-jeton non-Ange à vous qui meurt revient avec un marqueur +1/+1, le vol et le type Ange", () => {
    let s = scenario({
      p1: { battlefield: ["Valkyrie's Call", "Llanowar Elves", "Serra Angel"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = settle(act(s, "p1", { type: "pass" }));
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(1);
    const c = chars(s, elf);
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.keywords).toContain("flying");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Elf", "Angel"]));
    // Un Ange ne revient pas, ni une créature adverse.
    destroy(s, idOf(s, "p1", "battlefield", "Serra Angel"));
    destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    s = settle(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    // L'Elfe, désormais Ange, ne revient plus.
    destroy(s, elf);
    s = settle(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Valkyrie's Call : un jeton créature qui meurt ne revient pas", () => {
    let s = scenario({
      p1: { battlefield: ["Valkyrie's Call", ...lands("Mountain", 3)], hand: ["Dragon Fodder"] },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    const goblins = idsOf(s, "p1", "battlefield", "Goblin");
    expect(goblins).toHaveLength(2);
    destroy(s, goblins[0] as string);
    s = settle(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
  });

  it("Zimone, Paradox Sculptor : au début de votre combat, un marqueur +1/+1 sur jusqu'à deux créatures à vous", () => {
    let s = scenario({
      step: "main1",
      p1: { battlefield: ["Zimone, Paradox Sculptor", "Llanowar Elves", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "pass" });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length > 0);
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
      expect(s.pending.request.options).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    }
    s = settle(s, picking([elf, cub]));
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(1);
    expect(counterCount(s.objects[cub] as never, "+1/+1")).toBe(1);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Zimone, Paradox Sculptor")] as never, "+1/+1")).toBe(0);
  });

  it("Zimone, Paradox Sculptor : {G}{U}, {T} double chaque sorte de marqueur sur jusqu'à deux créatures ou artefacts à vous", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Zimone, Paradox Sculptor",
          { name: "Llanowar Elves", counters: { "+1/+1": 2, flying: 1 } },
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          { name: "Fire Elemental", counters: { "+1/+1": 1 } },
          "Forest",
          "Island",
        ],
      },
    });
    const zimone = idOf(s, "p1", "battlefield", "Zimone, Paradox Sculptor");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    s = settle(act(s, "p1", { type: "activate", source: zimone, ability: 1, targets: { t: [elf, cub] } }));
    expect(s.objects[zimone]?.tapped).toBe(true);
    expect(s.objects[elf]?.counters).toMatchObject({ "+1/+1": 4, flying: 2 });
    expect(counterCount(s.objects[cub] as never, "+1/+1")).toBe(2);
    expect(counterCount(s.objects[fire] as never, "+1/+1")).toBe(1);
  });
});

describe("Foundations, lot K8 : rares (1)", () => {
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Active la première capacité activée (hors mana) de `source`. */
  const activate = (s: S, source: string, extra: Record<string, unknown> = {}) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error("capacité introuvable");
    return act(s, "p1", { type: "activate", source, ability: a.ability, ...extra });
  };
  const pendingRequest = (s: S) => (s.pending?.kind === "choice" ? s.pending.request : undefined);
  const untilChoice = (s: S, intent: string) =>
    advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === intent);
  const hand = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  /** Joue jusqu'à `until` : passe, n'attaque ni ne bloque, répond aux choix avec `answer` (sinon la suggestion). */
  const run = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined) => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const activateOption = (s: S, source: string) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
    return a?.type === "activate" ? a : undefined;
  };
  const zombie = customCard({ name: "Zombie de test", subtypes: ["Zombie"], power: 2, toughness: 2 });
  const skeleton = customCard({ name: "Squelette de test", subtypes: ["Skeleton"], power: 1, toughness: 1 });

  it("Adaptive Automaton : a le type choisi et donne +1/+1 aux autres créatures de ce type que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Llanowar Elves", "Bear Cub"], hand: ["Adaptive Automaton"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = passBoth(cast(s, "p1", "Adaptive Automaton"));
    expect(pendingRequest(s)?.intent).toBe("chooseOnEnter");
    s = settle(choose(s, ["Elf"]));
    const auto = idOf(s, "p1", "battlefield", "Adaptive Automaton");
    expect(chars(s, auto).subtypes).toEqual(expect.arrayContaining(["Construct", "Elf"]));
    expect(pt(s, auto)).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
  });

  it("Alesha, Who Laughs at Fate : marqueur en attaquant ; Raid : réanime une créature de valeur de mana ≤ sa force", () => {
    let s = scenario({
      p1: { battlefield: ["Alesha, Who Laughs at Fate"], graveyard: ["Bear Cub", "Savannah Lions", "Shivan Dragon"] },
    });
    const alesha = idOf(s, "p1", "battlefield", "Alesha, Who Laughs at Fate");
    expect(chars(s, alesha).keywords).toContain("firstStrike");
    s = settleNoBlocks(attack(s, [alesha]));
    expect(counterCount(s.objects[alesha] as never, "+1/+1")).toBe(1);
    s = untilChoice(s, "triggerTarget");
    expect(s.players.p2?.life).toBe(17);
    const req = pendingRequest(s);
    // Force 3 : Bear Cub (2) et Savannah Lions (1), pas Shivan Dragon (6).
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Savannah Lions"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Bear Cub")]));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    // Sans attaque, rien ne revient.
    s = scenario({ p1: { battlefield: ["Alesha, Who Laughs at Fate"], graveyard: ["Bear Cub"] } });
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Ancestor Dragon : vous gagnez 1 PV par créature attaquante", () => {
    let s = scenario({ p1: { battlefield: ["Ancestor Dragon", "Bear Cub", "Savannah Lions"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Ancestor Dragon")).keywords).toContain("flying");
    s = settle(attack(s, [idOf(s, "p1", "battlefield", "Ancestor Dragon"), idOf(s, "p1", "battlefield", "Bear Cub")]));
    expect(s.players.p1?.life).toBe(22);
  });

  it("Arahbo, the First Fang : autres Chats +1/+1 ; un Chat non-jeton qui arrive crée un Chat 1/1", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 4), ...lands("Forest", 2), "Savannah Lions"],
        hand: ["Arahbo, the First Fang", "Savannah Lions", "Bear Cub"],
      },
      p2: { battlefield: ["Savannah Lions"] },
    });
    s = settle(cast(s, "p1", "Arahbo, the First Fang"));
    const arahbo = idOf(s, "p1", "battlefield", "Arahbo, the First Fang");
    // Arahbo lui-même crée un Chat ; le jeton (2/2 avec le bonus) ne déclenche rien.
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(1);
    expect(pt(s, idOf(s, "p1", "battlefield", "Cat"))).toEqual([2, 2]);
    expect(pt(s, arahbo)).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toEqual([3, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
    s = settle(cast(s, "p1", "Savannah Lions"));
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(2);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(2);
  });

  it("Archmage of Runes : éphémères et rituels coûtent {1} de moins et font piocher ; pas les créatures", () => {
    let s = scenario({ p1: { battlefield: ["Archmage of Runes", ...lands("Island", 4)], hand: ["Quick Study", "Bear Cub"] } });
    s = settle(cast(s, "p1", "Quick Study"));
    // {2}{U} payé avec deux Îles ; une carte du déclenchement et deux du sort.
    expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped)).toHaveLength(2);
    expect(hand(s)).toBe(1 + 3);
    s = scenario({ p1: { battlefield: ["Archmage of Runes", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(hand(s)).toBe(0);
  });

  it("Ashroot Animist : en attaquant, une autre créature que vous contrôlez gagne +X/+X (X = sa force) et le piétinement", () => {
    let s = scenario({ p1: { battlefield: ["Ashroot Animist", "Bear Cub"] }, p2: { battlefield: ["Savannah Lions"] } });
    const animist = idOf(s, "p1", "battlefield", "Ashroot Animist");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, animist).keywords).toContain("trample");
    s = attack(s, [animist]);
    s = settle(s);
    // Seule cible légale : Bear Cub (ni Animist, ni la créature adverse).
    expect(pt(s, bear)).toEqual([6, 6]);
    expect(chars(s, bear).keywords).toContain("trample");
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Ball Lightning : célérité et piétinement, sacrifiée au début de l'étape de fin", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Ball Lightning"] } });
    s = settle(cast(s, "p1", "Ball Lightning"));
    const ball = idOf(s, "p1", "battlefield", "Ball Lightning");
    expect(chars(s, ball).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
    s = settleNoBlocks(attack(s, [ball]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(14);
    expect(onBattlefield(s, ball)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.number === 4);
    expect(idsOf(s, "p1", "graveyard", "Ball Lightning")).toHaveLength(1);
    // Aussi à l'étape de fin d'un adversaire.
    s = scenario({ active: "p2", p1: { battlefield: ["Ball Lightning"] } });
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(idsOf(s, "p1", "graveyard", "Ball Lightning")).toHaveLength(1);
  });

  it("Basilisk Collar : la créature équipée a le contact mortel et le lien de vie ; équiper {2}", () => {
    let s = scenario({ p1: { battlefield: ["Basilisk Collar", "Bear Cub", ...lands("Plains", 2)] } });
    const collar = idOf(s, "p1", "battlefield", "Basilisk Collar");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, collar, { targets: { t: [bear] } }));
    expect(s.objects[collar]?.attachedTo).toBe(bear);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    s = settleNoBlocks(attack(s, [bear]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Brass's Bounty : un Trésor par terrain que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 7), "Bear Cub"], hand: ["Brass's Bounty"] },
      p2: { battlefield: ["Forest"] },
    });
    s = settle(cast(s, "p1", "Brass's Bounty"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(7);
  });

  it("Celestial Armor : s'attache en arrivant (défense talismanique et indestructible jusqu'à la fin du tour) ; +2/+0 et vol", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Savannah Lions"], hand: ["Celestial Armor"] },
    });
    // Flash : lancée pendant le tour adverse.
    s = cast(act(s, "p2", { type: "pass" }), "p1", "Celestial Armor");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(s, picking([bear]));
    const armor = idOf(s, "p1", "battlefield", "Celestial Armor");
    expect(s.objects[armor]?.attachedTo).toBe(bear);
    expect(pt(s, bear)).toEqual([4, 2]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "hexproof", "indestructible"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).not.toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
    expect(chars(s, bear).keywords).toContain("flying");
    expect(chars(s, bear).keywords).not.toContain("hexproof");
    expect(chars(s, bear).keywords).not.toContain("indestructible");
  });

  it("Charming Prince : regard 2, 3 PV, ou exil d'une autre créature à vous jusqu'à la prochaine étape de fin", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Charming Prince"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
    let s = passBoth(cast(setup(), "p1", "Charming Prince"));
    s = untilChoice(s, "triggerMode");
    const req = pendingRequest(s);
    expect(req?.type === "pick" && req.options).toEqual(["0", "1", "2"]);
    s = settle(choose(s, ["1"]));
    expect(s.players.p1?.life).toBe(23);

    s = untilChoice(passBoth(cast(setup(), "p1", "Charming Prince")), "triggerMode");
    s = choose(s, ["2"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Seule cible : Bear Cub (pas le Prince, pas la créature adverse).
    s = settle(s);
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Bear Cub");
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Bear Cub").length === 1,
    );
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Corsair Captain : un Trésor en arrivant ; les autres Pirates que vous contrôlez ont +1/+1", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Swab Goblin", "Bear Cub"], hand: ["Corsair Captain"] } });
    s = settle(cast(s, "p1", "Corsair Captain"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(pt(s, idOf(s, "p1", "battlefield", "Swab Goblin"))).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Corsair Captain"))).toEqual([2, 2]);
  });

  it("Crawling Barrens : {4} met deux marqueurs +1/+1 ; il peut devenir une créature 0/0 jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Crawling Barrens", ...lands("Wastes", 0), ...lands("Plains", 8)] } });
    const barrens = idOf(s, "p1", "battlefield", "Crawling Barrens");
    s = activate(s, barrens);
    s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(counterCount(s.objects[barrens] as never, "+1/+1")).toBe(2);
    expect(chars(s, barrens).types).not.toContain("Creature");
    s = activate(s, barrens);
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(counterCount(s.objects[barrens] as never, "+1/+1")).toBe(4);
    expect(chars(s, barrens).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(s, barrens).subtypes).toContain("Elemental");
    expect(pt(s, barrens)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(chars(s, barrens).types).not.toContain("Creature");
    expect(counterCount(s.objects[barrens] as never, "+1/+1")).toBe(4);
  });

  it("Crossway Troublemakers : les Vampires attaquants ont contact mortel et lien de vie ; un Vampire meurt : 2 PV pour piocher", () => {
    let s = scenario({
      p1: { battlefield: ["Crossway Troublemakers", "Highborn Vampire"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const troub = idOf(s, "p1", "battlefield", "Crossway Troublemakers");
    const vamp = idOf(s, "p1", "battlefield", "Highborn Vampire");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    expect(chars(s, vamp).keywords).not.toContain("deathtouch");
    s = attack(s, [vamp]);
    expect(chars(s, vamp).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    expect(chars(s, troub).keywords).not.toContain("deathtouch");
    s = run(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: wurm, attacker: vamp }] });
    s = run(s, (x) => x.turn.step === "main2", yes);
    // Contact mortel : le Wurm meurt ; lien de vie : +4 ; le Vampire meurt : 2 PV payés, une carte piochée.
    expect(onBattlefield(s, wurm)).toBe(false);
    expect(onBattlefield(s, vamp)).toBe(false);
    expect(s.players.p1?.life).toBe(22);
    expect(hand(s)).toBe(1);
    // Refuser de payer : pas de pioche.
    s = scenario({ p1: { battlefield: ["Crossway Troublemakers", "Highborn Vampire"] }, p2: { battlefield: ["Pelakka Wurm"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Highborn Vampire")]);
    s = run(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [
        { blocker: idOf(s, "p2", "battlefield", "Pelakka Wurm"), attacker: idOf(s, "p1", "battlefield", "Highborn Vampire") },
      ],
    });
    s = run(
      s,
      (x) => x.turn.step === "main2",
      (req) => (req.type === "yesNo" ? [0] : undefined),
    );
    expect(s.players.p1?.life).toBe(24);
    expect(hand(s)).toBe(0);
  });

  it("Death Baron : vos Squelettes et vos autres Zombies ont +1/+1 et le contact mortel", () => {
    const s = scenario({
      p1: { battlefield: ["Death Baron", skeleton, zombie, "Bear Cub"] },
      p2: { battlefield: [zombie] },
    });
    const baron = idOf(s, "p1", "battlefield", "Death Baron");
    const sk = idOf(s, "p1", "battlefield", "Squelette de test");
    const zb = idOf(s, "p1", "battlefield", "Zombie de test");
    expect(pt(s, baron)).toEqual([2, 2]);
    expect(chars(s, baron).keywords).not.toContain("deathtouch");
    expect(pt(s, sk)).toEqual([2, 2]);
    expect(chars(s, sk).keywords).toContain("deathtouch");
    expect(pt(s, zb)).toEqual([3, 3]);
    expect(chars(s, zb).keywords).toContain("deathtouch");
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Zombie de test"))).toEqual([2, 2]);
  });

  it("Desecration Demon : au début du combat, un adversaire peut sacrifier une créature ; s'il le fait, le Démon s'engage et reçoit un marqueur", () => {
    const setup = () => scenario({ p1: { battlefield: ["Desecration Demon"] }, p2: { battlefield: ["Bear Cub"] } });
    let s = setup();
    const demon = idOf(s, "p1", "battlefield", "Desecration Demon");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = run(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.player).toBe("p2");
    s = run(
      s,
      (x) => x.turn.step === "declareAttackers" || x.turn.step === "main2",
      (req) => (req.type === "pick" ? [bear] : req.type === "yesNo" ? [1] : undefined),
    );
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.objects[demon]?.tapped).toBe(true);
    expect(counterCount(s.objects[demon] as never, "+1/+1")).toBe(1);
    s = setup();
    s = run(
      s,
      (x) => x.turn.step === "declareAttackers" || x.turn.step === "main2",
      (req) => (req.type === "pick" ? [] : req.type === "yesNo" ? [0] : undefined),
    );
    expect(onBattlefield(s, bear)).toBe(true);
    expect(s.objects[demon]?.tapped).toBe(false);
    expect(counterCount(s.objects[demon] as never, "+1/+1")).toBe(0);
  });

  it("Dictate of Kruphix : chaque joueur pioche une carte de plus à son étape de pioche", () => {
    let s = scenario({ p1: { battlefield: ["Dictate of Kruphix"] }, step: "upkeep" });
    expect(chars(s, idOf(s, "p1", "battlefield", "Dictate of Kruphix")).keywords).toContain("flash");
    s = run(s, (x) => x.turn.step === "main1" && x.stack.length === 0);
    expect(hand(s)).toBe(2);
    s = run(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.stack.length === 0);
    expect(hand(s, "p2")).toBe(2);
  });

  it("Drake Hatcher : marqueurs d'incubation égaux aux blessures de combat infligées à un joueur ; en retirer trois crée un Drake 2/2 volant", () => {
    let s = scenario({
      p1: { battlefield: ["Drake Hatcher", ...lands("Island", 3)], hand: ["Quick Study"] },
    });
    const hatcher = idOf(s, "p1", "battlefield", "Drake Hatcher");
    expect(chars(s, hatcher).keywords).toEqual(expect.arrayContaining(["vigilance", "prowess"]));
    // Prouesse : +1/+1 pour un sort non-créature.
    s = settle(cast(s, "p1", "Quick Study"));
    expect(pt(s, hatcher)).toEqual([2, 4]);
    expect(activateOption(s, hatcher)).toBeUndefined();
    s = attack(s, [hatcher]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.objects[hatcher]?.tapped).toBe(false);
    expect(s.players.p2?.life).toBe(18);
    expect(counterCount(s.objects[hatcher] as never, "incubation")).toBe(2);
    (s.objects[hatcher] as { counters: Record<string, number> }).counters.incubation = 4;
    s.version += 1;
    s = settle(activate(s, hatcher));
    expect(counterCount(s.objects[hatcher] as never, "incubation")).toBe(1);
    const drake = idOf(s, "p1", "battlefield", "Drake");
    expect(pt(s, drake)).toEqual([2, 2]);
    expect(chars(s, drake).keywords).toContain("flying");
    expect(activateOption(s, hatcher)).toBeUndefined();
  });

  it("Drakuseth, Maw of Flames : en attaquant, 4 blessures à une cible et 3 à chacune de jusqu'à deux autres cibles", () => {
    let s = scenario({
      p1: { battlefield: ["Drakuseth, Maw of Flames"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const drak = idOf(s, "p1", "battlefield", "Drakuseth, Maw of Flames");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = attack(s, [drak]);
    let otherOptions: string[] = [];
    s = run(
      s,
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      (req, _p, cur) => {
        if (req.intent !== "triggerTarget" || req.type !== "pick") return undefined;
        const spec =
          cur.pending?.kind === "choice" && cur.pending.purpose.kind === "triggerTarget" ? cur.pending.purpose.spec : "";
        if (spec === "a") return ["p2"];
        otherOptions = req.options;
        return [bear, angel];
      },
    );
    // Les « autres cibles » excluent la première.
    expect(otherOptions).not.toContain("p2");
    expect(s.players.p2?.life).toBe(16);
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.objects[angel]?.damage).toBe(3);
  });

  it("Dread Summons : chaque joueur meule X cartes ; un Zombie 2/2 engagé par carte de créature meulée", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Dread Summons"], library: ["Bear Cub", "Forest", "Savannah Lions"] },
      p2: { library: ["Shivan Dragon", "Pelakka Wurm", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Dread Summons", { x: 2 }));
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Dread Summons", "Forest"]);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(3);
    expect(zombies.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(pt(s, zombies[0] as string)).toEqual([2, 2]);
  });

  it("Drogskol Reaver : vol, double initiative, lien de vie ; chaque gain de PV fait piocher", () => {
    let s = scenario({ p1: { battlefield: ["Drogskol Reaver"] } });
    const reaver = idOf(s, "p1", "battlefield", "Drogskol Reaver");
    expect(chars(s, reaver).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike", "lifelink"]));
    s = attack(s, [reaver]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.life).toBe(26);
    // Deux gains de PV (blessures d'initiative, puis normales) : deux cartes.
    expect(hand(s)).toBe(2);
  });

  it("Dropkick Bomber : autres Gobelins +1/+1 ; {R} : un autre Gobelin vole et se sacrifie quand il inflige des blessures de combat", () => {
    let s = scenario({ p1: { battlefield: ["Dropkick Bomber", "Swab Goblin", "Bear Cub", "Mountain"] } });
    const bomber = idOf(s, "p1", "battlefield", "Dropkick Bomber");
    const goblin = idOf(s, "p1", "battlefield", "Swab Goblin");
    expect(pt(s, bomber)).toEqual([2, 3]);
    expect(pt(s, goblin)).toEqual([3, 3]);
    expect(activateOption(s, bomber)?.targets[0]?.legal).toEqual([goblin]);
    s = settle(activate(s, bomber, { targets: { t: [goblin] } }));
    expect(chars(s, goblin).keywords).toContain("flying");
    s = attack(s, [goblin]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(onBattlefield(s, goblin)).toBe(false);
    expect(idsOf(s, "p1", "graveyard", "Swab Goblin")).toHaveLength(1);
  });

  it("Exemplar of Light : chaque gain de PV met un marqueur +1/+1 ; la pioche qui suit ne se déclenche qu'une fois par tour (et Drogskol Reaver ne pioche pas pour un adversaire)", () => {
    let s = scenario({
      p1: { battlefield: ["Exemplar of Light", ...lands("Plains", 4)], hand: ["Charming Prince", "Charming Prince"] },
    });
    const ex = idOf(s, "p1", "battlefield", "Exemplar of Light");
    expect(chars(s, ex).keywords).toContain("flying");
    const gain3: Answer = (req) => (req.intent === "triggerMode" ? ["1"] : undefined);
    s = run(
      cast(s, "p1", "Charming Prince"),
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      gain3,
    );
    expect(s.players.p1?.life).toBe(23);
    expect(counterCount(s.objects[ex] as never, "+1/+1")).toBe(1);
    expect(hand(s)).toBe(2);
    s = run(
      cast(s, "p1", "Charming Prince"),
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      gain3,
    );
    expect(counterCount(s.objects[ex] as never, "+1/+1")).toBe(2);
    expect(hand(s)).toBe(1);
    // Un adversaire qui gagne des PV : rien.
    s = scenario({
      active: "p2",
      p1: { battlefield: ["Exemplar of Light", "Drogskol Reaver"] },
      p2: { battlefield: lands("Plains", 2), hand: ["Charming Prince"] },
    });
    s = run(
      cast(s, "p2", "Charming Prince"),
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      gain3,
    );
    expect(s.players.p2?.life).toBe(23);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Exemplar of Light")] as never, "+1/+1")).toBe(0);
    expect(hand(s)).toBe(0);
  });

  it("Extravagant Replication : à votre entretien, jeton copie d'un autre permanent non-terrain que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: ["Extravagant Replication", "Bear Cub", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
      active: "p2",
      step: "end",
    });
    s = run(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(bears).toHaveLength(2);
    expect(bears.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Extravagant Replication")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Felidar Retreat : quand un terrain arrive, Chat Bête 2/2 ou marqueur +1/+1 et vigilance pour vos créatures", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Felidar Retreat", "Bear Cub"], hand: ["Plains"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
    let s = setup();
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
    s = run(
      s,
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      (req) => (req.intent === "triggerMode" ? ["0"] : undefined),
    );
    const cat = idOf(s, "p1", "battlefield", "Cat Beast");
    expect(pt(s, cat)).toEqual([2, 2]);
    expect(chars(s, cat).subtypes).toEqual(expect.arrayContaining(["Cat", "Beast"]));

    s = setup();
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
    s = run(
      s,
      (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      (req) => (req.intent === "triggerMode" ? ["1"] : undefined),
    );
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    expect(chars(s, bear).keywords).toContain("vigilance");
    expect(counterCount(s.objects[lions] as never, "+1/+1")).toBe(0);
    expect(idsOf(s, "p1", "battlefield", "Cat Beast")).toHaveLength(0);
    s = run(s, (x) => x.turn.number === 4);
    expect(chars(s, bear).keywords).not.toContain("vigilance");
  });

  it("Fumigate : détruit toutes les créatures ; 1 PV par créature détruite", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Fumigate"] },
      p2: { battlefield: ["Savannah Lions", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Fumigate"));
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Genesis Wave : révèle X cartes ; les permanents de valeur de mana X ou moins peuvent arriver, le reste va au cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 6),
        hand: ["Genesis Wave"],
        library: ["Bear Cub", "Shivan Dragon", "Plains", "Quick Study", "Llanowar Elves"],
      },
    });
    let options: (string | undefined)[] = [];
    s = run(
      cast(s, "p1", "Genesis Wave", { x: 3 }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
      (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map((id) => nameOf(cur, id));
        return req.options;
      },
    );
    // Shivan Dragon (6) dépasse X ; le terrain (0) peut arriver.
    expect(options.sort()).toEqual(["Bear Cub", "Plains"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Genesis Wave", "Shivan Dragon"]);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Quick Study", "Llanowar Elves"]);
  });

  it("Halana and Alena, Partners : au début de votre combat, X marqueurs (X = sa force) et la célérité pour une autre créature", () => {
    let s = scenario({
      p1: { battlefield: ["Halana and Alena, Partners", { name: "Bear Cub", sick: true }] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const ha = idOf(s, "p1", "battlefield", "Halana and Alena, Partners");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, ha).keywords).toEqual(expect.arrayContaining(["reach", "firstStrike"]));
    s = run(s, (x) => x.pending?.kind === "declareAttackers");
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(2);
    expect(counterCount(s.objects[ha] as never, "+1/+1")).toBe(0);
    expect(chars(s, bear).keywords).toContain("haste");
    // Arrivé ce tour-ci, il peut attaquer grâce à la célérité.
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = run(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
    // Pas au combat d'un adversaire.
    s = scenario({ active: "p2", p1: { battlefield: ["Halana and Alena, Partners", "Bear Cub"] } });
    s = run(s, (x) => x.turn.step === "main2");
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")] as never, "+1/+1")).toBe(0);
  });

  it("Harmless Offering : l'adversaire ciblé gagne le contrôle d'un permanent que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Harmless Offering"] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
    expect(() => cast(s, "p1", "Harmless Offering", { targets: { a: ["p2"], b: [lions] } })).toThrow();
    expect(() => cast(s, "p1", "Harmless Offering", { targets: { a: ["p1"], b: [bear] } })).toThrow();
    s = settle(cast(s, "p1", "Harmless Offering", { targets: { a: ["p2"], b: [bear] } }));
    expect(s.objects[bear]?.controller).toBe("p2");
  });

  it("Heroes' Bane : arrive avec quatre marqueurs +1/+1 ; {2}{G}{G} : X marqueurs, X étant sa force", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 9), hand: ["Heroes' Bane"] } });
    s = settle(cast(s, "p1", "Heroes' Bane"));
    const bane = idOf(s, "p1", "battlefield", "Heroes' Bane");
    expect(pt(s, bane)).toEqual([4, 4]);
    s = settle(activate(s, bane));
    expect(counterCount(s.objects[bane] as never, "+1/+1")).toBe(8);
    expect(pt(s, bane)).toEqual([8, 8]);
  });

  it("High-Society Hunter : en attaquant, sacrifier une autre créature donne un marqueur ; une autre créature non-jeton qui meurt fait piocher", () => {
    let s = scenario({ p1: { battlefield: ["High-Society Hunter", "Bear Cub"] }, p2: { battlefield: ["Savannah Lions"] } });
    const hunter = idOf(s, "p1", "battlefield", "High-Society Hunter");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, hunter).keywords).toContain("flying");
    s = attack(s, [hunter]);
    s = run(
      s,
      (x) => x.turn.step === "main2",
      (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : req.type === "yesNo" ? [1] : undefined),
    );
    expect(onBattlefield(s, bear)).toBe(false);
    expect(counterCount(s.objects[hunter] as never, "+1/+1")).toBe(1);
    expect(hand(s)).toBe(1);
    expect(s.players.p2?.life).toBe(14);
    // Une créature adverse non-jeton qui meurt : une carte ; un jeton : rien.
    destroy(s, idOf(s, "p2", "battlefield", "Savannah Lions"));
    s = settle(s);
    expect(hand(s)).toBe(2);
    // Refuser le sacrifice : pas de marqueur.
    s = scenario({ p1: { battlefield: ["High-Society Hunter", "Bear Cub"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "High-Society Hunter")]);
    s = run(
      s,
      (x) => x.turn.step === "main2",
      (req) => (req.type === "pick" ? [] : req.type === "yesNo" ? [0] : undefined),
    );
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "High-Society Hunter")] as never, "+1/+1")).toBe(0);
  });

  it("High-Society Hunter : un jeton qui meurt ne fait pas piocher", () => {
    let s = scenario({ p1: { battlefield: ["High-Society Hunter", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    (s.objects[bear] as { isToken: boolean }).isToken = true;
    destroy(s, bear);
    s = settle(s);
    expect(hand(s)).toBe(0);
  });

  it("Homunculus Horde : la deuxième carte piochée de chaque tour crée un jeton copie", () => {
    let s = scenario({ p1: { battlefield: ["Homunculus Horde", ...lands("Island", 3)], hand: ["Quick Study"] } });
    s = settle(cast(s, "p1", "Quick Study"));
    const hordes = idsOf(s, "p1", "battlefield", "Homunculus Horde");
    expect(hordes).toHaveLength(2);
    expect(hordes.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(pt(s, hordes[1] as string)).toEqual([2, 2]);
  });

  it("Immersturm Predator : engagé, il exile jusqu'à une carte d'un cimetière et reçoit un marqueur ; sacrifier une autre créature : indestructible et engagé", () => {
    let s = scenario({
      p1: { battlefield: ["Immersturm Predator", "Bear Cub"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    const pred = idOf(s, "p1", "battlefield", "Immersturm Predator");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = activateOption(s, pred);
    expect(opt?.additional?.sacrifice?.options).toEqual([bear]);
    s = act(s, "p1", { type: "activate", source: pred, ability: opt?.ability ?? -1, sacrifice: [bear] });
    s = settle(s);
    expect(onBattlefield(s, bear)).toBe(false);
    expect(s.objects[pred]?.tapped).toBe(true);
    expect(chars(s, pred).keywords).toContain("indestructible");
    expect(counterCount(s.objects[pred] as never, "+1/+1")).toBe(1);
    // La carte exilée : Shivan Dragon ou Bear Cub (toutes deux dans un cimetière).
    expect(s.exile).toHaveLength(1);
    s = run(s, (x) => x.turn.number === 4);
    expect(chars(s, pred).keywords).not.toContain("indestructible");
  });

  it("Immersturm Predator : se déclenche quand il attaque, même sans carte dans un cimetière", () => {
    let s = scenario({ p1: { battlefield: ["Immersturm Predator"] } });
    const pred = idOf(s, "p1", "battlefield", "Immersturm Predator");
    s = attack(s, [pred]);
    s = run(s, (x) => x.turn.step === "main2");
    expect(counterCount(s.objects[pred] as never, "+1/+1")).toBe(1);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Jazal Goldmane : {3}{W}{W} : vos créatures attaquantes ont +X/+X, X étant le nombre d'attaquants", () => {
    let s = scenario({ p1: { battlefield: ["Jazal Goldmane", "Bear Cub", "Savannah Lions", ...lands("Plains", 5)] } });
    const jazal = idOf(s, "p1", "battlefield", "Jazal Goldmane");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(chars(s, jazal).keywords).toContain("firstStrike");
    s = attack(s, [jazal, bear]);
    s = settle(activate(s, jazal));
    expect(pt(s, jazal)).toEqual([6, 6]);
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, lions)).toEqual([2, 1]);
  });

  it("Kalastria Highborn : quand elle ou un autre de vos Vampires meurt, payer {B} : le joueur ciblé perd 2 PV et vous en gagnez 2", () => {
    let s = scenario({
      p1: { battlefield: ["Kalastria Highborn", "Highborn Vampire", "Bear Cub", ...lands("Swamp", 2)] },
      p2: { battlefield: ["Highborn Vampire"] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Highborn Vampire"));
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : req.intent === "triggerTarget" ? ["p2"] : undefined));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
    // Ni une créature non-Vampire, ni un Vampire adverse.
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    destroy(s, idOf(s, "p2", "battlefield", "Highborn Vampire"));
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(s.players.p2?.life).toBe(18);
    destroy(s, idOf(s, "p1", "battlefield", "Kalastria Highborn"));
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : req.intent === "triggerTarget" ? ["p2"] : undefined));
    expect(s.players.p2?.life).toBe(16);
    expect(s.players.p1?.life).toBe(24);
    expect(idsOf(s, "p1", "battlefield", "Swamp").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
  });

  it("Lathliss, Dragon Queen : un autre Dragon non-jeton qui arrive crée un Dragon 5/5 volant ; {1}{R} : vos Dragons +1/+0", () => {
    let s = scenario({
      p1: { battlefield: ["Lathliss, Dragon Queen", "Bear Cub", ...lands("Mountain", 8)], hand: ["Shivan Dragon"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const lathliss = idOf(s, "p1", "battlefield", "Lathliss, Dragon Queen");
    s = settle(cast(s, "p1", "Shivan Dragon"));
    const tokens = idsOf(s, "p1", "battlefield", "Dragon");
    expect(tokens).toHaveLength(1);
    expect(pt(s, tokens[0] as string)).toEqual([5, 5]);
    expect(chars(s, tokens[0] as string).keywords).toContain("flying");
    s = settle(activate(s, lathliss));
    expect(pt(s, lathliss)).toEqual([7, 6]);
    expect(pt(s, tokens[0] as string)).toEqual([6, 5]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Shivan Dragon"))).toEqual([6, 5]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Shivan Dragon"))).toEqual([5, 5]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Lathril, Blade of the Elves : autant d'Elfes guerriers 1/1 que de blessures de combat infligées à un joueur", () => {
    let s = scenario({ p1: { battlefield: ["Lathril, Blade of the Elves"] } });
    const lathril = idOf(s, "p1", "battlefield", "Lathril, Blade of the Elves");
    expect(chars(s, lathril).keywords).toContain("menace");
    s = attack(s, [lathril]);
    s = run(s, (x) => x.turn.step === "main2");
    const elves = idsOf(s, "p1", "battlefield", "Elf Warrior");
    expect(elves).toHaveLength(2);
    expect(pt(s, elves[0] as string)).toEqual([1, 1]);
    expect(chars(s, elves[0] as string).subtypes).toEqual(expect.arrayContaining(["Elf", "Warrior"]));
  });

  it("Lathril, Blade of the Elves : {T} et engager dix autres Elfes : chaque adversaire perd 10 PV et vous en gagnez 10", () => {
    let s = scenario({ p1: { battlefield: ["Lathril, Blade of the Elves", ...lands("Llanowar Elves", 9)] } });
    const lathril = idOf(s, "p1", "battlefield", "Lathril, Blade of the Elves");
    expect(activateOption(s, lathril)).toBeUndefined();
    s = scenario({ p1: { battlefield: ["Lathril, Blade of the Elves", ...lands("Llanowar Elves", 10)] } });
    s = settle(activate(s, idOf(s, "p1", "battlefield", "Lathril, Blade of the Elves")));
    expect(s.players.p2?.life).toBe(10);
    expect(s.players.p1?.life).toBe(30);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Linden, the Steadfast Queen : 1 PV pour chaque créature blanche attaquante que vous contrôlez", () => {
    let s = scenario({ p1: { battlefield: ["Linden, the Steadfast Queen", "Savannah Lions", "Bear Cub"] } });
    const linden = idOf(s, "p1", "battlefield", "Linden, the Steadfast Queen");
    expect(chars(s, linden).keywords).toContain("vigilance");
    s = settle(attack(s, [linden, idOf(s, "p1", "battlefield", "Savannah Lions"), idOf(s, "p1", "battlefield", "Bear Cub")]));
    expect(s.players.p1?.life).toBe(22);
  });

  it("Lunar Insight : une carte par valeur de mana différente parmi vos permanents non-terrains", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), "Bear Cub", "Swab Goblin", "Llanowar Elves", "Savannah Lions", "Shivan Dragon"],
        hand: ["Lunar Insight"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Lunar Insight"));
    // Valeurs 2, 1 et 6 : trois cartes (les terrains et la créature adverse ne comptent pas).
    expect(hand(s)).toBe(3);
  });
});

describe("Foundations, lot K8 : rares (2)", () => {
  type Answer = (req: ChoiceRequest) => (string | number)[] | undefined;
  /** Joue jusqu'à la condition : passe, n'attaque ni ne bloque, répond aux choix (`answer`, sinon la suggestion). */
  const playUntil = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (!p) break;
      if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handSize = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  it("Temples : arrivent engagés, regard 1 en arrivant, et produisent leurs deux couleurs", () => {
    const temples: [string, string[]][] = [
      ["Temple of Abandon", ["G", "R"]],
      ["Temple of Enlightenment", ["U", "W"]],
      ["Temple of Epiphany", ["R", "U"]],
      ["Temple of Malady", ["B", "G"]],
      ["Temple of Malice", ["B", "R"]],
      ["Temple of Mystery", ["G", "U"]],
      ["Temple of Plenty", ["G", "W"]],
      ["Temple of Silence", ["B", "W"]],
      ["Temple of Triumph", ["R", "W"]],
    ];
    for (const [name, colors] of temples) {
      let s = scenario({ p1: { hand: [name], library: ["Shivan Dragon", "Opt", "Forest"] } });
      let asked = false;
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
      s = settle(s, (req) => {
        if (req.intent !== "scryBottom") return undefined;
        asked = true;
        return req.type === "pick" ? req.options.slice(0, 1) : undefined;
      });
      expect(asked, name).toBe(true);
      const temple = idOf(s, "p1", "battlefield", name);
      expect(s.objects[temple]?.tapped, name).toBe(true);
      expect(nameOf(s, s.players.p1?.library[0] as string), name).toBe("Opt");
      expect(nameOf(s, s.players.p1?.library.at(-1) as string), name).toBe("Shivan Dragon");
      expect(
        manaAbilitiesOf(s, temple)
          .flatMap((m) => m.produce)
          .sort(),
        name,
      ).toEqual(colors);
    }
  });

  it("Mazemind Tome : {T} et un marqueur page : regard 1 ; {2}, {T} et un marqueur : piochez ; au quatrième marqueur, exilé et 4 PV", () => {
    let s = scenario({
      p1: { battlefield: ["Mazemind Tome", ...lands("Forest", 2)], library: ["Shivan Dragon", "Opt", "Forest"] },
    });
    const tome = idOf(s, "p1", "battlefield", "Mazemind Tome");
    let scried = false;
    s = act(s, "p1", { type: "activate", source: tome, ability: 0 });
    expect(s.objects[tome]?.tapped).toBe(true);
    expect(s.objects[tome]?.counters.page).toBe(1);
    s = settle(s, (req) => {
      if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
      scried = true;
      return req.options.slice(0, 1);
    });
    expect(scried).toBe(true);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Opt");
    expect(handSize(s)).toBe(0);
    // Deuxième capacité, avec trois marqueurs déjà posés : le quatrième déclenche l'exil et le gain de 4 PV.
    s = scenario({ p1: { battlefield: [{ name: "Mazemind Tome", counters: { page: 3 } }, ...lands("Forest", 2)] } });
    const tome2 = idOf(s, "p1", "battlefield", "Mazemind Tome");
    expect(legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === tome2)).toHaveLength(2);
    s = act(s, "p1", { type: "activate", source: tome2, ability: 1 });
    s = settle(s);
    expect(handSize(s)).toBe(1);
    expect(exiled(s, "Mazemind Tome")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(24);
  });

  it("Mazemind Tome : avec trois marqueurs page ou moins, il reste en jeu", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Mazemind Tome", counters: { page: 2 } }] } });
    const tome = idOf(s, "p1", "battlefield", "Mazemind Tome");
    s = settle(act(s, "p1", { type: "activate", source: tome, ability: 0 }));
    expect(s.objects[tome]?.counters.page).toBe(3);
    expect(onBattlefield(s, tome)).toBe(true);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Mentor of the Meek : une autre créature de force 2 ou moins arrive, payer {1} pour piocher ; pas pour une force 3 ou plus", () => {
    let s = scenario({ p1: { battlefield: ["Mentor of the Meek", ...lands("Forest", 2)], hand: ["Llanowar Elves"] } });
    s = cast(s, "p1", "Llanowar Elves");
    let asked = false;
    s = settle(s, (req) => {
      if (req.type !== "yesNo") return undefined;
      asked = true;
      return [1];
    });
    expect(asked).toBe(true);
    expect(handSize(s)).toBe(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped)).toHaveLength(2);
    // Refus : pas de pioche.
    s = scenario({ p1: { battlefield: ["Mentor of the Meek", ...lands("Forest", 2)], hand: ["Llanowar Elves"] } });
    s = settle(cast(s, "p1", "Llanowar Elves"), no);
    expect(handSize(s)).toBe(0);
    // Le Mentor lui-même (« une autre créature ») : aucun déclenchement.
    s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Mentor of the Meek"] } });
    s = passBoth(cast(s, "p1", "Mentor of the Meek"));
    expect(idsOf(s, "p1", "battlefield", "Mentor of the Meek")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    expect(s.triggers).toHaveLength(0);
    // Une créature de force 3 : aucun déclenchement.
    s = scenario({ p1: { battlefield: ["Mentor of the Meek", ...lands("Plains", 3)], hand: ["Cathar Commando"] } });
    s = cast(s, "p1", "Cathar Commando");
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Cathar Commando")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    expect(s.pending?.kind).toBe("priority");
  });

  it("Midnight Reaper : une créature non-jeton que vous contrôlez meurt : 1 blessure et une carte ; pas pour un jeton ni une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: ["Midnight Reaper", "Llanowar Elves", ...lands("Swamp", 2)], hand: ["Stab", "Stab"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }));
    expect(s.players.p1?.life).toBe(19);
    expect(handSize(s)).toBe(2);
    // La créature adverse qui meurt ne compte pas.
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
    expect(handSize(s)).toBe(1);
    // Un jeton qui meurt ne compte pas.
    s = scenario({
      p1: { battlefield: ["Midnight Reaper", ...lands("Mountain", 2), "Swamp"], hand: ["Dragon Fodder", "Stab"] },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Goblin")] } }));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
    expect(handSize(s)).toBe(0);
    // Le Reaper voit sa propre mort.
    s = scenario({ p1: { battlefield: ["Midnight Reaper", "Swamp"], hand: ["Stab"] } });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Midnight Reaper")] } }));
    expect(idsOf(s, "p1", "graveyard", "Midnight Reaper")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
    expect(handSize(s)).toBe(1);
  });

  it("Mystic Archaeologist : {3}{U}{U} : piochez deux cartes", () => {
    let s = scenario({ p1: { battlefield: ["Mystic Archaeologist", ...lands("Island", 5)] } });
    const arch = idOf(s, "p1", "battlefield", "Mystic Archaeologist");
    s = settle(act(s, "p1", { type: "activate", source: arch, ability: 0 }));
    expect(handSize(s)).toBe(2);
    expect(s.objects[arch]?.tapped).toBe(false);
  });

  it("Nullpriest of Oblivion : lien de vie et menace ; kické, il réanime une créature de votre cimetière ; sinon rien", () => {
    const setup = (n: number) =>
      scenario({
        p1: { battlefield: lands("Swamp", n), hand: ["Nullpriest of Oblivion"], graveyard: ["Shivan Dragon", "Bear Cub", "Opt"] },
        p2: { graveyard: ["Pelakka Wurm"] },
      });
    const kicked = cast(setup(6), "p1", "Nullpriest of Oblivion", { kicked: true });
    let options: (string | undefined)[] = [];
    let s = settle(kicked, (req) => {
      if (req.type !== "pick" || req.intent !== "triggerTarget") return undefined;
      options = namesIn(kicked, req.options);
      return pickNamed(kicked, req, "Shivan Dragon");
    });
    // Seules les cartes de créature de votre cimetière sont des cibles.
    expect(options.sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    const priest = idOf(s, "p1", "battlefield", "Nullpriest of Oblivion");
    expect(chars(s, priest).keywords).toEqual(expect.arrayContaining(["lifelink", "menace"]));
    s = settle(cast(setup(2), "p1", "Nullpriest of Oblivion"));
    expect(idsOf(s, "p1", "battlefield", "Nullpriest of Oblivion")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Ovika : un sort non-créature crée X Gobelins phyrexians 1/1 avec la célérité (X = sa valeur de mana) ; pas un sort de créature", () => {
    let s = scenario({
      p1: { battlefield: ["Ovika, Enigma Goliath", ...lands("Mountain", 3)], hand: ["Dragon Fodder", "Fire Elemental"] },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    const gobs = idsOf(s, "p1", "battlefield", "Phyrexian Goblin");
    expect(gobs).toHaveLength(2);
    for (const g of gobs) {
      expect(pt(s, g)).toEqual([1, 1]);
      expect(chars(s, g).colors).toEqual(["R"]);
      expect(chars(s, g).keywords).toContain("haste");
    }
    // Les Gobelins de Dragon Fodder n'ont pas la célérité.
    expect(chars(s, idOf(s, "p1", "battlefield", "Goblin")).keywords).not.toContain("haste");
    const ovika = idOf(s, "p1", "battlefield", "Ovika, Enigma Goliath");
    expect(chars(s, ovika).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
    // Un sort de créature : rien.
    s = scenario({ p1: { battlefield: ["Ovika, Enigma Goliath", ...lands("Mountain", 5)], hand: ["Fire Elemental"] } });
    s = settle(cast(s, "p1", "Fire Elemental"));
    expect(idsOf(s, "p1", "battlefield", "Phyrexian Goblin")).toHaveLength(0);
  });

  it("Ovika : garde — {3} et 3 PV ; l'adversaire qui paie perd 3 PV, sinon son sort est contrecarré", () => {
    const setup = (n: number) =>
      scenario({
        active: "p2",
        p1: { battlefield: ["Ovika, Enigma Goliath"] },
        p2: { battlefield: lands("Swamp", n), hand: ["Stab"] },
      });
    let s = setup(1);
    const ovika = idOf(s, "p1", "battlefield", "Ovika, Enigma Goliath");
    s = settle(cast(s, "p2", "Stab", { targets: { t: [ovika] } }));
    expect(idsOf(s, "p2", "graveyard", "Stab")).toHaveLength(1);
    expect(pt(s, ovika)).toEqual([6, 6]);
    s = setup(4);
    s = cast(s, "p2", "Stab", { targets: { t: [ovika] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "unlessPay");
    s = choose(s, [1]);
    expect(s.players.p2?.life).toBe(17);
    s = settle(s);
    expect(pt(s, ovika)).toEqual([4, 4]);
  });

  it("Predator Ooze : indestructible ; un marqueur +1/+1 quand il attaque et quand meurt une créature qu'il a blessée ce tour", () => {
    let s = scenario({ p1: { battlefield: ["Predator Ooze"] }, p2: { battlefield: ["Bear Cub"] } });
    const ooze = idOf(s, "p1", "battlefield", "Predator Ooze");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(chars(s, ooze).keywords).toContain("indestructible");
    s = attack(s, [ooze]);
    s = playUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(plusOnes(s, ooze)).toBe(1);
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: ooze }] });
    s = playUntil(s, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0);
    // L'Ours 2/2 meurt sous les 2 blessures de l'Ooze 2/2 ; l'Ooze, indestructible, survit et gagne un marqueur.
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(onBattlefield(s, ooze)).toBe(true);
    expect(plusOnes(s, ooze)).toBe(2);
    destroy(s, ooze);
    expect(onBattlefield(s, ooze)).toBe(true);
  });

  it("Predator Ooze : une créature qu'il n'a pas blessée qui meurt ne lui donne rien", () => {
    let s = scenario({ p1: { battlefield: ["Predator Ooze", "Swamp"], hand: ["Stab"] }, p2: { battlefield: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Predator Ooze"))).toBe(0);
  });

  it("Preposterous Proportions : vos créatures +10/+10 et la vigilance jusqu'à la fin du tour, pas celles de l'adversaire", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Bear Cub", ...lands("Forest", 7)], hand: ["Preposterous Proportions"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Preposterous Proportions"));
    expect(pt(s, elf)).toEqual([11, 11]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([12, 12]);
    expect(chars(s, elf).keywords).toContain("vigilance");
    expect(pt(s, theirs)).toEqual([2, 2]);
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, elf)).toEqual([1, 1]);
    expect(chars(s, elf).keywords).not.toContain("vigilance");
  });

  it("Prime Speaker Zegana : arrive avec autant de marqueurs que la plus grande force parmi vos autres créatures, puis pioche autant que sa force", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Forest", 4), ...lands("Island", 2)],
        hand: ["Prime Speaker Zegana"],
      },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    s = settle(cast(s, "p1", "Prime Speaker Zegana"));
    const zegana = idOf(s, "p1", "battlefield", "Prime Speaker Zegana");
    // Plus grande force parmi vos autres créatures : 2 (l'Ours) ; le Wurm adverse ne compte pas.
    expect(plusOnes(s, zegana)).toBe(2);
    expect(pt(s, zegana)).toEqual([3, 3]);
    expect(handSize(s)).toBe(3);
  });

  it("Raise the Past : renvoie toutes les cartes de créature de valeur de mana 2 ou moins de votre cimetière", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 4),
        hand: ["Raise the Past"],
        graveyard: ["Llanowar Elves", "Bear Cub", "Shivan Dragon", "Opt", "Savannah Lions"],
      },
      p2: { graveyard: ["Healer's Hawk"] },
    });
    s = settle(cast(s, "p1", "Raise the Past"));
    expect(
      namesIn(
        s,
        s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature")),
      ).sort(),
    ).toEqual(["Bear Cub", "Llanowar Elves", "Savannah Lions"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Raise the Past", "Shivan Dragon"]);
    expect(idsOf(s, "p2", "graveyard", "Healer's Hawk")).toHaveLength(1);
  });

  it("Rampaging Baloths : piétinement ; un terrain arrive sous votre contrôle : une Bête 4/4 verte ; pas pour un terrain adverse", () => {
    let s = scenario({ p1: { battlefield: ["Rampaging Baloths"], hand: ["Forest"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Rampaging Baloths")).keywords).toContain("trample");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const beasts = idsOf(s, "p1", "battlefield", "Beast");
    expect(beasts).toHaveLength(1);
    expect(pt(s, beasts[0] as string)).toEqual([4, 4]);
    expect(chars(s, beasts[0] as string).colors).toEqual(["G"]);
    s = scenario({ active: "p2", p1: { battlefield: ["Rampaging Baloths"] }, p2: { hand: ["Forest"] } });
    s = settle(act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Forest") }));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Beast")).toHaveLength(0);
  });

  it("Redcap Gutter-Dweller : menace ; en arrivant, deux Rats 1/1 noirs qui ne peuvent pas bloquer", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Redcap Gutter-Dweller"] } });
    s = settle(cast(s, "p1", "Redcap Gutter-Dweller"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Redcap Gutter-Dweller")).keywords).toContain("menace");
    const rats = idsOf(s, "p1", "battlefield", "Rat");
    expect(rats).toHaveLength(2);
    for (const r of rats) {
      expect(pt(s, r)).toEqual([1, 1]);
      expect(chars(s, r).colors).toEqual(["B"]);
      expect(chars(s, r).keywords).toContain("cantBlock");
    }
  });

  it("Redcap Gutter-Dweller : à votre entretien, sacrifier une autre créature : un marqueur +1/+1 et la carte du dessus exilée, jouable ce tour", () => {
    const setup = () =>
      scenario({
        active: "p2",
        step: "end",
        p1: {
          battlefield: ["Redcap Gutter-Dweller", "Llanowar Elves", ...lands("Forest", 2)],
          library: ["Bear Cub", ...lands("Forest", 5)],
        },
      });
    let s = setup();
    const redcap = idOf(s, "p1", "battlefield", "Redcap Gutter-Dweller");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    let offered: string[] = [];
    s = playUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.step === "main1",
      (req) => {
        if (req.type !== "pick" || req.intent !== "sacrifice") return undefined;
        offered = req.options;
        return [elf];
      },
    );
    // Le Redcap lui-même n'est pas proposé (« une autre créature »).
    expect(offered).toEqual([elf]);
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(plusOnes(s, redcap)).toBe(1);
    const bear = exiled(s, "Bear Cub")[0] as string;
    expect(bear).toBeDefined();
    expect(castable(s, "p1", bear)).toBe(true);
    // Sans sacrifice : ni marqueur ni exil.
    s = playUntil(
      setup(),
      (x) => x.turn.active === "p1" && x.turn.step === "main1",
      (req) => (req.type === "pick" && req.intent === "sacrifice" ? [] : undefined),
    );
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Redcap Gutter-Dweller"))).toBe(0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.exile).toHaveLength(0);
  });

  it("Regal Caracal : deux Chats 1/1 avec le lien de vie ; vos autres Chats ont +1/+1 et le lien de vie", () => {
    let s = scenario({
      p1: { battlefield: ["Savannah Lions", "Llanowar Elves", ...lands("Plains", 5)], hand: ["Regal Caracal"] },
      p2: { battlefield: ["Leonin Skyhunter"] },
    });
    s = settle(cast(s, "p1", "Regal Caracal"));
    const cats = idsOf(s, "p1", "battlefield", "Cat");
    expect(cats).toHaveLength(2);
    for (const c of cats) {
      expect(pt(s, c)).toEqual([2, 2]);
      expect(chars(s, c).colors).toEqual(["W"]);
      expect(chars(s, c).keywords).toContain("lifelink");
    }
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(pt(s, lions)).toEqual([3, 2]);
    expect(chars(s, lions).keywords).toContain("lifelink");
    // Ni le Caracal lui-même, ni un non-Chat, ni le Chat adverse.
    const caracal = idOf(s, "p1", "battlefield", "Regal Caracal");
    expect(pt(s, caracal)).toEqual([3, 3]);
    expect(chars(s, caracal).keywords).not.toContain("lifelink");
    expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Leonin Skyhunter"))).toEqual([2, 2]);
  });

  it("Rite of Replication : un jeton copie de la créature ciblée ; cinq s'il est kické", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Island", 9), hand: ["Rite of Replication"] }, p2: { battlefield: ["Serra Angel"] } });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Rite of Replication", { targets: { t: [angel] } }));
    const copies = idsOf(s, "p1", "battlefield", "Serra Angel");
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.isToken).toBe(true);
    expect(chars(s, copies[0] as string).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = setup();
    s = settle(cast(s, "p1", "Rite of Replication", { targets: { t: [angel] }, kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(5);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("River's Rebuke : renvoie en main tous les permanents non-terrains du joueur ciblé", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["River's Rebuke"] },
      p2: { battlefield: ["Serra Angel", "Banishing Light", "Mazemind Tome", "Plains"] },
    });
    s = settle(cast(s, "p1", "River's Rebuke", { targets: { t: ["p2"] } }));
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Banishing Light", "Mazemind Tome", "Serra Angel"]);
    expect(idsOf(s, "p2", "battlefield", "Plains")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Rune-Scarred Demon : vol ; en arrivant, cherche n'importe quelle carte de la bibliothèque et la met en main", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 7), hand: ["Rune-Scarred Demon"], library: ["Forest", "Opt", "Forest", "Forest"] },
    });
    s = settle(cast(s, "p1", "Rune-Scarred Demon"), (req) =>
      req.type === "pick" && req.intent === "search" ? req.options.filter((id) => nameOf(s, id) === "Opt") : undefined,
    );
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(s.players.p1?.library).toHaveLength(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Rune-Scarred Demon")).keywords).toContain("flying");
  });

  it("Scrawling Crawler : à votre entretien, chaque joueur pioche ; un adversaire qui pioche perd 1 PV, pas vous", () => {
    let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Scrawling Crawler"] } });
    s = playUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // p1 : une carte à l'entretien, une à l'étape de pioche ; p2 : une carte, 1 PV perdu.
    expect(handSize(s, "p1")).toBe(2);
    expect(handSize(s, "p2")).toBe(1);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(20);
    // L'adversaire perd aussi 1 PV pour sa pioche à son propre tour.
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(handSize(s, "p2")).toBe(2);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Skyknight Squire : un marqueur +1/+1 quand une autre de vos créatures arrive ; à trois marqueurs, vol et Chevalier", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Skyknight Squire", counters: { "+1/+1": 1 } }, ...lands("Forest", 2)],
        hand: ["Llanowar Elves", "Llanowar Elves"],
      },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    const squire = idOf(s, "p1", "battlefield", "Skyknight Squire");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(plusOnes(s, squire)).toBe(2);
    expect(chars(s, squire).keywords).not.toContain("flying");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(plusOnes(s, squire)).toBe(3);
    expect(pt(s, squire)).toEqual([4, 4]);
    expect(chars(s, squire).keywords).toContain("flying");
    expect(chars(s, squire).subtypes).toEqual(expect.arrayContaining(["Cat", "Scout", "Knight"]));
  });

  it("Skyknight Squire : une créature adverse qui arrive ne compte pas", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Skyknight Squire"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p2", "Llanowar Elves"));
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Skyknight Squire"))).toBe(0);
  });

  it("Solemn Simulacrum : en arrivant, peut chercher un terrain de base qui arrive engagé ; en mourant, peut piocher", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 5)],
        hand: ["Solemn Simulacrum", "Stab"],
        library: ["Opt", "Island", "Hallowed Fountain", "Opt"],
      },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Solemn Simulacrum"), (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick" || req.intent !== "search") return undefined;
      offered = namesIn(s, req.options);
      return req.options.filter((id) => nameOf(s, id) === "Island");
    });
    // Seul le terrain de base est proposé.
    expect(offered).toEqual(["Island"]);
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    const solemn = idOf(s, "p1", "battlefield", "Solemn Simulacrum");
    s = settle(cast(s, "p1", "Stab", { targets: { t: [solemn] } }), yes);
    expect(idsOf(s, "p1", "graveyard", "Solemn Simulacrum")).toHaveLength(1);
    expect(handSize(s)).toBe(1);
  });

  it("Solemn Simulacrum : refuser la recherche et la pioche", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5)], hand: ["Solemn Simulacrum", "Stab"], library: ["Island", "Opt"] },
    });
    s = settle(cast(s, "p1", "Solemn Simulacrum"), no);
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(0);
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Solemn Simulacrum")] } }), no);
    expect(handSize(s)).toBe(0);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Spinner of Souls : portée ; une autre créature non-jeton meurt : révèle jusqu'à une créature, en main, le reste dessous", () => {
    let s = scenario({
      p1: {
        battlefield: ["Spinner of Souls", "Llanowar Elves", "Swamp"],
        hand: ["Stab"],
        library: ["Forest", "Opt", "Pelakka Wurm", "Island"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Spinner of Souls")).keywords).toContain("reach");
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }), yes);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Pelakka Wurm"]);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib[0]).toBe("Island");
    expect(lib.slice(1).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Spinner of Souls : rien pour un jeton, ni pour Spinner lui-même", () => {
    let s = scenario({
      p1: {
        battlefield: ["Spinner of Souls", ...lands("Mountain", 2), "Swamp"],
        hand: ["Dragon Fodder", "Stab"],
        library: ["Pelakka Wurm"],
      },
    });
    s = settle(cast(s, "p1", "Dragon Fodder"));
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Goblin")] } }), yes);
    expect(handSize(s)).toBe(0);
    s = scenario({ p1: { battlefield: ["Spinner of Souls", "Swamp"], hand: ["Stab"], library: ["Pelakka Wurm"] } });
    s = settle(cast(s, "p1", "Stab", { targets: { t: [idOf(s, "p1", "battlefield", "Spinner of Souls")] } }), yes);
    expect(handSize(s)).toBe(0);
  });

  it("Surrak : au début du combat, si vos créatures totalisent 8 de force ou plus, une créature ciblée que vous contrôlez gagne la célérité", () => {
    let s = scenario({ p1: { battlefield: ["Surrak, the Hunt Caller", { name: "Fire Elemental", sick: true }] } });
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    expect(chars(s, fire).keywords).not.toContain("haste");
    s = playUntil(
      s,
      (x) => x.pending?.kind === "declareAttackers",
      (req) => (req.type === "pick" && req.intent === "triggerTarget" ? [fire] : undefined),
    );
    expect(chars(s, fire).keywords).toContain("haste");
    // 5 + 2 = 7 : pas de déclenchement.
    s = scenario({ p1: { battlefield: ["Surrak, the Hunt Caller", { name: "Bear Cub", sick: true }] } });
    s = playUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
  });

  it("Sylvan Scavenging : à votre étape de fin, un marqueur +1/+1 sur une de vos créatures, ou un Raton laveur 3/3 si vous contrôlez une force 4 ou plus", () => {
    const toEnd = (battlefield: string[], mode: string) => {
      const s = scenario({
        step: "main2",
        p1: { battlefield: ["Sylvan Scavenging", ...battlefield] },
        p2: { battlefield: ["Pelakka Wurm"] },
      });
      return playUntil(
        s,
        (x) => x.turn.active === "p2",
        (req) => (req.type === "pick" && req.intent === "triggerMode" ? [mode] : undefined),
      );
    };
    let s = toEnd(["Bear Cub"], "0");
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    // Mode 2 sans créature de force 4 (le Wurm adverse ne compte pas) : pas de Raton laveur.
    s = toEnd(["Bear Cub"], "1");
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Raccoon")).toHaveLength(0);
    s = toEnd(["Fire Elemental"], "1");
    const raccoons = idsOf(s, "p1", "battlefield", "Raccoon");
    expect(raccoons).toHaveLength(1);
    expect(pt(s, raccoons[0] as string)).toEqual([3, 3]);
    expect(chars(s, raccoons[0] as string).colors).toEqual(["G"]);
  });

  it("Taurean Mauler : changelin ; quand un adversaire lance un sort, peut prendre un marqueur +1/+1 ; pas pour vos sorts", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Taurean Mauler"] },
      p2: { battlefield: ["Island", "Island"], hand: ["Opt", "Opt"] },
    });
    const mauler = idOf(s, "p1", "battlefield", "Taurean Mauler");
    expect(chars(s, mauler).keywords).toContain("changeling");
    s = settle(cast(s, "p2", "Opt"), yes);
    expect(plusOnes(s, mauler)).toBe(1);
    s = settle(cast(s, "p2", "Opt"), no);
    expect(plusOnes(s, mauler)).toBe(1);
    s = scenario({ p1: { battlefield: ["Taurean Mauler", "Island"], hand: ["Opt"] } });
    s = settle(cast(s, "p1", "Opt"), yes);
    expect(plusOnes(s, idOf(s, "p1", "battlefield", "Taurean Mauler"))).toBe(0);
  });

  it("Tempest Djinn : vol ; +1/+0 pour chaque Île de base que vous contrôlez", () => {
    const s = scenario({
      p1: { battlefield: ["Tempest Djinn", ...lands("Island", 3), "Hallowed Fountain", "Forest"] },
      p2: { battlefield: lands("Island", 2) },
    });
    const djinn = idOf(s, "p1", "battlefield", "Tempest Djinn");
    // Trois Îles de base : l'Île non de base et les Îles adverses ne comptent pas.
    expect(pt(s, djinn)).toEqual([3, 4]);
    expect(chars(s, djinn).keywords).toContain("flying");
  });

  it("Terror of Mount Velus : vol et double initiative ; en arrivant, vos créatures gagnent la double initiative jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 7)], hand: ["Terror of Mount Velus"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Terror of Mount Velus"));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const terror = idOf(s, "p1", "battlefield", "Terror of Mount Velus");
    expect(chars(s, bear).keywords).toContain("doubleStrike");
    expect(chars(s, terror).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike"]));
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("doubleStrike");
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
    expect(chars(s, terror).keywords).toContain("doubleStrike");
  });

  it("Voracious Greatshark : flash ; en arrivant, contrecarre un sort d'artefact ou de créature ciblé", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 7), hand: ["Pelakka Wurm"] },
      p2: { battlefield: lands("Island", 5), hand: ["Voracious Greatshark"] },
    });
    s = cast(s, "p1", "Pelakka Wurm");
    s = act(s, "p1", { type: "pass" });
    const wurm = s.stack[0]?.id as string;
    s = cast(s, "p2", "Voracious Greatshark");
    s = settle(s, (req) => (req.type === "pick" && req.intent === "triggerTarget" ? [wurm] : undefined));
    expect(idsOf(s, "p2", "battlefield", "Voracious Greatshark")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Pelakka Wurm")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Pelakka Wurm")).toHaveLength(0);
  });

  it("Voracious Greatshark : un rituel n'est pas une cible", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Dragon Fodder"] },
      p2: { battlefield: lands("Island", 5), hand: ["Voracious Greatshark"] },
    });
    s = cast(s, "p1", "Dragon Fodder");
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Voracious Greatshark"));
    expect(idsOf(s, "p2", "battlefield", "Voracious Greatshark")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(2);
  });

  it("Wilt-Leaf Liege : vos autres créatures vertes et blanches ont +1/+1 (+2/+2 si elles sont les deux)", () => {
    const s = scenario({
      p1: { battlefield: ["Wilt-Leaf Liege", "Bear Cub", "Savannah Lions", "Fire Elemental"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Wilt-Leaf Liege"))).toEqual([4, 4]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toEqual([3, 2]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Fire Elemental"))).toEqual([5, 4]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
  });

  it("Wilt-Leaf Liege : défaussée par un sort adverse, elle arrive sur le champ de bataille", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Wilt-Leaf Liege", "Opt"] },
      p2: { battlefield: lands("Swamp", 2), hand: ["Pilfer"] },
    });
    s = cast(s, "p2", "Pilfer", { targets: { t: ["p1"] } });
    s = settle(s, (req) => pickNamed(s, req, "Wilt-Leaf Liege"));
    expect(idsOf(s, "p1", "battlefield", "Wilt-Leaf Liege")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Wilt-Leaf Liege")).toHaveLength(0);
  });

  it("Wishclaw Talisman : arrive avec trois marqueurs souhait ; {1}, {T}, un marqueur : cherche une carte, puis un adversaire en prend le contrôle ; seulement pendant votre tour", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Wishclaw Talisman"], library: ["Forest", "Opt", "Forest"] },
      p2: { battlefield: ["Swamp"] },
    });
    s = settle(cast(s, "p1", "Wishclaw Talisman"));
    const claw = idOf(s, "p1", "battlefield", "Wishclaw Talisman");
    expect(s.objects[claw]?.counters.wish).toBe(3);
    // Activation (le talisman est déjà en jeu avec ses trois marqueurs).
    s = scenario({
      p1: { battlefield: [{ name: "Wishclaw Talisman", counters: { wish: 3 } }, "Swamp"], library: ["Forest", "Opt", "Forest"] },
      p2: { battlefield: ["Swamp"] },
    });
    const talisman = idOf(s, "p1", "battlefield", "Wishclaw Talisman");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === talisman);
    if (opt?.type !== "activate") throw new Error("Wishclaw Talisman : capacité indisponible");
    s = act(s, "p1", { type: "activate", source: talisman, ability: opt.ability });
    expect(s.objects[talisman]?.counters.wish).toBe(2);
    s = settle(s, (req) => (req.type === "pick" && req.intent === "search" ? pickNamed(s, req, "Opt") : undefined));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(s.objects[talisman]?.controller).toBe("p2");
    // Pendant le tour de p1, p2 ne peut pas l'activer.
    expect(legalActions(s, "p2").some((a) => a.type === "activate" && a.source === talisman)).toBe(false);
    s = playUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(legalActions(s, "p2").some((a) => a.type === "activate" && a.source === talisman)).toBe(true);
  });

  it("Zetalpa : vol, double initiative, vigilance, piétinement et indestructible", () => {
    const s = scenario({ p1: { battlefield: ["Zetalpa, Primal Dawn"] } });
    const z = idOf(s, "p1", "battlefield", "Zetalpa, Primal Dawn");
    expect(chars(s, z).keywords).toEqual(
      expect.arrayContaining(["flying", "doubleStrike", "vigilance", "trample", "indestructible"]),
    );
    expect(pt(s, z)).toEqual([4, 8]);
  });
});

describe("Foundations, lot K8 : peu communes (1)", () => {
  const lib = (s: S, p: string, name: string) => (s.players[p]?.library ?? []).filter((id) => nameOf(s, id) === name);
  const pickIntent = (intent: string, ids: string[]) => (req: { intent?: string; type: string }) =>
    req.intent === intent ? ids : undefined;
  const pickNamedIn = (s: S, options: string[], name: string) => options.filter((id) => nameOf(s, id) === name).slice(0, 1);

  it("Balmor, Battlemage Captain : quand vous lancez un éphémère ou un rituel, vos créatures ont +1/+0 et le piétinement", () => {
    let s = scenario({
      p1: { battlefield: ["Balmor, Battlemage Captain", "Bear Cub", ...lands("Island", 3)], hand: ["Opt"] },
      p2: { battlefield: ["Ordinary Bear", "Island"], hand: ["Opt"] },
    });
    const balmor = idOf(s, "p1", "battlefield", "Balmor, Battlemage Captain");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const theirs = idOf(s, "p2", "battlefield", "Ordinary Bear");
    expect(chars(s, balmor).keywords).toContain("flying");
    // La capacité se déclenche et se résout avant l'éphémère.
    s = cast(s, "p1", "Opt");
    expect(s.stack).toHaveLength(2);
    s = settle(s);
    expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 2 });
    expect(chars(s, bear).keywords).toContain("trample");
    expect(chars(s, balmor)).toMatchObject({ power: 2, toughness: 3 });
    expect(chars(s, theirs)).toMatchObject({ power: 4, toughness: 5 });
    expect(chars(s, theirs).keywords).not.toContain("trample");
    // Le sort d'un adversaire ne déclenche rien.
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Opt");
    expect(s.stack).toHaveLength(1);
    // Jusqu'à la fin du tour.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Balmor, Battlemage Captain : un sort de créature ne déclenche pas", () => {
    let s = scenario({ p1: { battlefield: ["Balmor, Battlemage Captain", "Plains"], hand: ["Savannah Lions"] } });
    s = cast(s, "p1", "Savannah Lions");
    expect(s.stack).toHaveLength(1);
    expect(s.triggers).toHaveLength(0);
  });

  it("Battle-Rattle Shaman : au début du combat de votre tour, vous pouvez donner +2/+0 à une créature ciblée", () => {
    let s = scenario({ p1: { battlefield: ["Battle-Rattle Shaman", "Bear Cub"] }, p2: { battlefield: ["Ordinary Bear"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    // N'importe quelle créature, et « vous pouvez » : aucune cible possible.
    expect(req?.type === "pick" && req.min).toBe(0);
    expect(req?.type === "pick" && req.options.length).toBe(3);
    s = settle(choose(s, [bear]));
    expect(s.turn.step).toBe("beginCombat");
    expect(chars(s, bear)).toMatchObject({ power: 4, toughness: 2 });
    // Pas au début du combat de l'adversaire.
    let t = scenario({ active: "p2", p1: { battlefield: ["Battle-Rattle Shaman", "Bear Cub"] } });
    t = advanceUntil(t, (x) => x.turn.step === "declareAttackers" || x.turn.active === "p1");
    expect(t.turn.active).toBe("p2");
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("Battlesong Berserker : quand vous attaquez, une créature ciblée que vous contrôlez gagne +1/+0 et la menace", () => {
    let s = scenario({
      p1: { battlefield: ["Battlesong Berserker", "Bear Cub", "Savannah Lions"] },
      p2: { battlefield: ["Ordinary Bear"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    // Le Berserker n'attaque pas lui-même : « quand vous attaquez ».
    s = attack(s, [bear]);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual([
      "Battlesong Berserker",
      "Bear Cub",
      "Savannah Lions",
    ]);
    s = settle(choose(s, [lions]));
    expect(chars(s, lions)).toMatchObject({ power: 3, toughness: 1 });
    expect(chars(s, lions).keywords).toContain("menace");
    expect(chars(s, bear).keywords).not.toContain("menace");
  });

  it("Affectionate Indrik : en arrivant, il peut se battre contre une créature ciblée que vous ne contrôlez pas", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 6), "Savannah Lions"], hand: ["Affectionate Indrik"] },
        p2: { battlefield: ["Bear Cub", "Ordinary Bear"] },
      });
    let s = cast(setup(), "p1", "Affectionate Indrik");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Ordinary Bear"]);
    s = choose(s, [idOf(s, "p2", "battlefield", "Bear Cub")]);
    s = settle(s, (r) => (r.intent === "may" ? [1] : undefined));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Affectionate Indrik")]?.damage).toBe(2);
    // Il refuse : pas de combat.
    let t = cast(setup(), "p1", "Affectionate Indrik");
    t = settle(t, (r) => (r.intent === "may" ? [0] : r.type === "pick" ? pickNamedIn(t, r.options, "Bear Cub") : undefined));
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Affectionate Indrik")]?.damage).toBe(0);
  });

  it("Angel of Finality : vol ; en arrivant, exile le cimetière du joueur ciblé", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 4), hand: ["Angel of Finality"], graveyard: ["Opt"] },
      p2: { graveyard: ["Bear Cub", "Forest"] },
    });
    s = cast(s, "p1", "Angel of Finality");
    s = settle(s, picking(["p2"]));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest"]);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Angel of Finality")).keywords).toContain("flying");
  });

  it("Arcane Epiphany : coûte {1} de moins si vous contrôlez un Sorcier ; piochez trois cartes", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Arcane Epiphany"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Arcane Epiphany"))).toBe(false);
    s = scenario({ p1: { battlefield: [...lands("Island", 4), "Erudite Wizard"], hand: ["Arcane Epiphany"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Arcane Epiphany"))).toBe(true);
    s = settle(cast(s, "p1", "Arcane Epiphany"));
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Archway Angel : vol ; en arrivant, 2 PV par Porte que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), "Azorius Guildgate", "Boros Guildgate"], hand: ["Archway Angel"] },
      p2: { battlefield: ["Dimir Guildgate"] },
    });
    s = settle(cast(s, "p1", "Archway Angel"));
    expect(s.players.p1?.life).toBe(24);
    expect(chars(s, idOf(s, "p1", "battlefield", "Archway Angel")).keywords).toContain("flying");
  });

  it("Aetherize : renvoie toutes les créatures attaquantes dans la main de leur propriétaire", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Savannah Lions"] },
      p2: { battlefield: [...lands("Island", 4), "Ordinary Bear"], hand: ["Aetherize"] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Aetherize"));
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Ordinary Bear")).toHaveLength(1);
  });

  it("Biogenic Upgrade : répartit trois marqueurs +1/+1 entre une à trois cibles, puis double les marqueurs de chacune", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 6), { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Savannah Lions", "Llanowar Elves"],
        hand: ["Biogenic Upgrade"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    // Au moins une cible.
    expect(() => cast(s, "p1", "Biogenic Upgrade", { targets: { t: [] } })).toThrow();
    s = cast(s, "p1", "Biogenic Upgrade", { targets: { t: [bear, lions] } });
    expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("divide");
    // Au moins un marqueur par cible.
    expect(() => choose(s, [3, 0])).toThrow();
    s = choose(s, [2, 1]);
    s = settle(s);
    // Bear Cub : 1 + 2 = 3, doublé à 6 ; Savannah Lions : 1, doublé à 2 ; l'Elfe non ciblé n'en a pas.
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(6);
    expect(counterCount(s.objects[lions] as never, "+1/+1")).toBe(2);
    expect(counterCount(s.objects[elf] as never, "+1/+1")).toBe(0);
  });

  it("Bloodtithe Collector : vol ; en arrivant, si un adversaire a perdu des PV ce tour-ci, chaque adversaire défausse une carte", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Mountain", "Mountain"], hand: ["Bloodtithe Collector", "Burst Lightning"] },
        p2: { hand: ["Opt", "Forest"] },
      });
    let s = settle(cast(setup(), "p1", "Bloodtithe Collector"));
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bloodtithe Collector")).keywords).toContain("flying");
    s = setup();
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = settle(cast(s, "p1", "Bloodtithe Collector"));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(1);
  });

  it("Burnished Hart : {3}, sacrifice : jusqu'à deux cartes de terrain de base, sur le champ de bataille engagées", () => {
    let s = scenario({
      p1: {
        battlefield: ["Burnished Hart", ...lands("Plains", 3)],
        library: ["Forest", "Shivan Dragon", "Azorius Guildgate", "Island", "Plains"],
      },
    });
    s = act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Burnished Hart"), ability: 0 });
    expect(idsOf(s, "p1", "graveyard", "Burnished Hart")).toHaveLength(1);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "search");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.max).toBe(2);
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Island", "Plains"]);
    s = settle(choose(s, [...lib(s, "p1", "Forest"), ...lib(s, "p1", "Island")]));
    for (const name of ["Forest", "Island"]) {
      const id = idOf(s, "p1", "battlefield", name);
      expect(s.objects[id]?.tapped).toBe(true);
    }
    expect(s.players.p1?.library).toHaveLength(3);
  });

  it("Chart a Course : piochez deux cartes, puis défaussez-en une sauf si vous avez attaqué ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Chart a Course"] } });
    s = settle(cast(s, "p1", "Chart a Course"));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    // Après une attaque : pas de défausse.
    s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Chart a Course"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    s = settle(cast(s, "p1", "Chart a Course"));
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });

  it("Circuitous Route : jusqu'à deux cartes de terrain de base et/ou de Porte, sur le champ de bataille engagées", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Circuitous Route"],
        library: ["Azorius Guildgate", "Shivan Dragon", "Plains", "Thornwood Falls"],
      },
    });
    s = cast(s, "p1", "Circuitous Route");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "search");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.max).toBe(2);
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Azorius Guildgate", "Plains"]);
    s = settle(choose(s, [...lib(s, "p1", "Azorius Guildgate"), ...lib(s, "p1", "Plains")]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Azorius Guildgate")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("Claws Out : affinité pour les Chats ; vos créatures ont +2/+2 jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Claws Out"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Claws Out"))).toBe(false);
    s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Savannah Lions", "Savannah Lions"], hand: ["Claws Out"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    // Deux Chats : {1}{W}{W}.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Claws Out"))).toBe(true);
    s = settle(cast(s, "p1", "Claws Out"));
    for (const id of idsOf(s, "p1", "battlefield", "Savannah Lions"))
      expect(chars(s, id)).toMatchObject({ power: 4, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).power).toBe(2);
  });

  it("Clinquant Skymage : vol ; un marqueur +1/+1 chaque fois que vous piochez une carte (pas l'adversaire)", () => {
    let s = scenario({
      p1: { battlefield: ["Clinquant Skymage", ...lands("Island", 3)], hand: ["Chart a Course"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    const mage = idOf(s, "p1", "battlefield", "Clinquant Skymage");
    expect(chars(s, mage).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Chart a Course"));
    expect(counterCount(s.objects[mage] as never, "+1/+1")).toBe(2);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Opt"));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(counterCount(s.objects[mage] as never, "+1/+1")).toBe(2);
  });

  it("Cloudblazer : vol ; en arrivant, vous gagnez 2 PV et piochez deux cartes", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Island"], hand: ["Cloudblazer"] } });
    s = settle(cast(s, "p1", "Cloudblazer"));
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Cloudblazer")).keywords).toContain("flying");
  });

  it("Dauntless Veteran : quand il attaque, les créatures que vous contrôlez ont +1/+1 jusqu'à la fin du tour", () => {
    let s = scenario({ p1: { battlefield: ["Dauntless Veteran", "Bear Cub"] }, p2: { battlefield: ["Savannah Lions"] } });
    const vet = idOf(s, "p1", "battlefield", "Dauntless Veteran");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Une autre créature attaque seule : rien.
    let t = attack(s, [bear]);
    t = settle(t);
    expect(chars(t, bear).power).toBe(2);
    s = attack(s, [vet]);
    s = settle(s);
    expect(chars(s, vet)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toMatchObject({ power: 2, toughness: 1 });
  });

  it("Dawnwing Marshal : vol ; {4}{W} : les créatures que vous contrôlez ont +1/+1 jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Dawnwing Marshal", "Bear Cub", ...lands("Plains", 5)] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const marshal = idOf(s, "p1", "battlefield", "Dawnwing Marshal");
    expect(chars(s, marshal).keywords).toContain("flying");
    s = settle(act(s, "p1", { type: "activate", source: marshal, ability: 0 }));
    expect(chars(s, marshal)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toMatchObject({ power: 2, toughness: 1 });
  });

  it("Deadly Brew : chaque joueur sacrifie une créature ou un planeswalker ; si vous l'avez fait, une autre carte de permanent revient en main", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Bear Cub", "Savannah Lions"],
        hand: ["Deadly Brew"],
        graveyard: ["Ordinary Bear", "Forest", "Opt"],
      },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = cast(s, "p1", "Deadly Brew");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "sacrifice");
    // Le joueur choisit sa créature sacrifiée.
    s = choose(s, [bear]);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "may");
    s = choose(s, [1]);
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    // « Une autre » carte de permanent : ni la créature sacrifiée, ni Opt.
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Ordinary Bear"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Ordinary Bear")]));
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Ordinary Bear"]);
    // Sans créature à sacrifier : rien ne revient.
    let t = scenario({
      p1: { battlefield: ["Swamp", "Forest"], hand: ["Deadly Brew"], graveyard: ["Ordinary Bear"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    t = settle(cast(t, "p1", "Deadly Brew"), (r) => (r.intent === "may" ? [1] : undefined));
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Deadly Plot : détruit une créature ou un planeswalker, ou renvoie engagée une carte de créature Zombie de votre cimetière", () => {
    const s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Deadly Plot"], graveyard: ["Crypt Feaster", "Bear Cub"] },
      p2: { battlefield: ["Shivan Dragon"], graveyard: ["Hungry Ghoul"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const feaster = idOf(s, "p1", "graveyard", "Crypt Feaster");
    // Mode 2 : seul le Zombie de votre cimetière.
    expect(opt?.type === "cast" && opt.modes[1]?.targets[0]?.legal).toEqual([feaster]);
    let t = settle(cast(s, "p1", "Deadly Plot", { mode: 1, targets: { t: [feaster] } }));
    expect(t.objects[idOf(t, "p1", "battlefield", "Crypt Feaster")]?.tapped).toBe(true);
    t = settle(cast(s, "p1", "Deadly Plot", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Devout Decree : exile une créature ou un planeswalker noir ou rouge, puis regard 1", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Devout Decree"] },
      p2: { battlefield: ["Shivan Dragon", "Bear Cub", "Crypt Feaster"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal.map((id) => nameOf(s, id)).sort()).toEqual([
      "Crypt Feaster",
      "Shivan Dragon",
    ]);
    s = cast(s, "p1", "Devout Decree", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("scryBottom");
    s = settle(s);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
  });

  it("Diamond Mare : la couleur choisie en arrivant ; +1 PV pour chaque sort de cette couleur que vous lancez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Forest"], hand: ["Diamond Mare", "Opt", "Giant Growth"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = cast(s, "p1", "Diamond Mare");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "chooseOnEnter");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
    s = choose(s, ["U"]);
    s = settle(cast(s, "p1", "Opt"));
    expect(s.players.p1?.life).toBe(21);
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Dragon Mage : quand il inflige des blessures de combat à un joueur, chaque joueur défausse sa main puis pioche sept cartes", () => {
    let s = scenario({
      p1: { battlefield: ["Dragon Mage"], hand: ["Opt", "Opt"] },
      p2: { hand: ["Bear Cub", "Forest", "Opt"] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Dragon Mage")]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(15);
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.players.p2?.hand).toHaveLength(7);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect(s.players.p2?.graveyard).toHaveLength(3);
  });

  it("Eager Trufflesnout : piétinement ; une Nourriture quand il inflige des blessures de combat à un joueur", () => {
    const s = scenario({ p1: { battlefield: ["Eager Trufflesnout"] }, p2: { battlefield: ["Ordinary Bear"] } });
    const boar = idOf(s, "p1", "battlefield", "Eager Trufflesnout");
    expect(chars(s, boar).keywords).toContain("trample");
    let t = settleNoBlocks(attack(s, [boar]));
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(16);
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    // Bloqué par une 4/5 : aucune blessure au joueur, pas de Nourriture.
    t = attack(s, [boar]);
    t = passAccepting(t, (x) => x.pending?.kind === "declareBlockers");
    t = act(t, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(t, "p2", "battlefield", "Ordinary Bear"), attacker: boar }],
    });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(20);
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(0);
  });

  it("Eaten by Piranhas : flash ; la créature enchantée perd ses capacités et devient un Squelette noir de base 1/1", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Eaten by Piranhas"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p2", { type: "pass" });
    s = settle(cast(s, "p1", "Eaten by Piranhas", { targets: { enchant: [dragon] } }));
    expect(chars(s, dragon)).toMatchObject({
      power: 1,
      toughness: 1,
      colors: ["B"],
      subtypes: ["Skeleton"],
      types: ["Creature"],
    });
    expect(chars(s, dragon).keywords).not.toContain("flying");
    expect(chars(s, dragon).abilities).toHaveLength(0);
  });

  it("Elspeth's Smite : 3 blessures à une créature attaquante ou bloqueuse, exilée si elle devait mourir ce tour-ci", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains"], hand: ["Elspeth's Smite"] },
      p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
    s = act(s, "p2", { type: "pass" });
    // Seule la créature attaquante est une cible.
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([bear]);
    s = settle(cast(s, "p1", "Elspeth's Smite", { targets: { t: [bear] } }));
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });

  it("Elvish Regrower : en arrivant, renvoie en main une carte de permanent ciblée de votre cimetière", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Elvish Regrower"], graveyard: ["Opt", "Azorius Guildgate", "Bear Cub"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    s = cast(s, "p1", "Elvish Regrower");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Azorius Guildgate", "Bear Cub"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Azorius Guildgate")]));
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Azorius Guildgate"]);
  });

  it("Empyrean Eagle : les autres créatures volantes que vous contrôlez ont +1/+1", () => {
    const s = scenario({
      p1: { battlefield: ["Empyrean Eagle", "Leonin Skyhunter", "Bear Cub"] },
      p2: { battlefield: ["Leonin Skyhunter"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Empyrean Eagle"))).toMatchObject({ power: 2, toughness: 3 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Leonin Skyhunter"))).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Leonin Skyhunter"))).toMatchObject({ power: 2, toughness: 2 });
  });

  it("Exclusion Mage : en arrivant, renvoie dans la main de son propriétaire une créature ciblée qu'un adversaire contrôle", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Exclusion Mage"] },
      p2: { battlefield: ["Shivan Dragon", "Savannah Lions"] },
    });
    s = cast(s, "p1", "Exclusion Mage");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Savannah Lions", "Shivan Dragon"]);
    s = settle(choose(s, [idOf(s, "p2", "battlefield", "Shivan Dragon")]));
    expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
  });

  it("Faebloom Trick : deux Faes 1/1 bleues volantes, puis engage une créature ciblée qu'un adversaire contrôle", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Faebloom Trick"] },
      p2: { battlefield: ["Shivan Dragon", "Savannah Lions"] },
    });
    s = cast(s, "p1", "Faebloom Trick");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const faeries = idsOf(s, "p1", "battlefield", "Faerie");
    expect(faeries).toHaveLength(2);
    expect(chars(s, faeries[0] as string)).toMatchObject({ power: 1, toughness: 1, colors: ["U"] });
    expect(chars(s, faeries[0] as string).keywords).toContain("flying");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Savannah Lions", "Shivan Dragon"]);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = settle(choose(s, [dragon]));
    expect(s.objects[dragon]?.tapped).toBe(true);
  });

  it("Felling Blow : un marqueur +1/+1 sur votre créature, puis elle inflige autant de blessures que sa force à une créature adverse", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Felling Blow"] },
      p2: { battlefield: ["Red Tiger Mechan"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const tiger = idOf(s, "p2", "battlefield", "Red Tiger Mechan");
    expect(() => cast(s, "p1", "Felling Blow", { targets: { a: [tiger], b: [bear] } })).toThrow();
    s = settle(cast(s, "p1", "Felling Blow", { targets: { a: [bear], b: [tiger] } }));
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    // 3 blessures (la force après le marqueur) : la 3/3 meurt ; ce n'est pas un combat, l'Ours n'est pas blessé.
    expect(idsOf(s, "p2", "graveyard", "Red Tiger Mechan")).toHaveLength(1);
    expect(s.objects[bear]?.damage).toBe(0);
  });

  it("Billowing Shriekmass : vol, meule 3 en arrivant, +2/+1 avec sept cartes ou plus au cimetière", () => {
    const setup = (graveyard: string[]) =>
      scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Billowing Shriekmass"], graveyard } });
    let s = settle(cast(setup([]), "p1", "Billowing Shriekmass"));
    let id = idOf(s, "p1", "battlefield", "Billowing Shriekmass");
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(s.players.p1?.library).toHaveLength(7);
    expect(chars(s, id)).toMatchObject({ power: 2, toughness: 3 });
    expect(chars(s, id).keywords).toContain("flying");
    // Quatre cartes déjà au cimetière : la meule en fait sept, le seuil est atteint.
    s = settle(cast(setup(lands("Plains", 4)), "p1", "Billowing Shriekmass"));
    id = idOf(s, "p1", "battlefield", "Billowing Shriekmass");
    expect(s.players.p1?.graveyard).toHaveLength(7);
    expect(chars(s, id)).toMatchObject({ power: 4, toughness: 4 });
  });

  it("Cephalid Inkmage : surveillance 3 en arrivant, imblocable avec sept cartes ou plus au cimetière", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Cephalid Inkmage"], graveyard: lands("Plains", 5) },
    });
    s = cast(s, "p1", "Cephalid Inkmage");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "surveilGraveyard");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    // On regarde les trois cartes du dessus.
    expect(req?.type === "pick" && req.options).toHaveLength(3);
    const opts = req?.type === "pick" ? req.options : [];
    // Une seule au cimetière : six cartes, pas de seuil.
    s = settle(choose(s, opts.slice(0, 1)));
    const id = idOf(s, "p1", "battlefield", "Cephalid Inkmage");
    expect(s.players.p1?.graveyard).toHaveLength(6);
    expect(chars(s, id).keywords).not.toContain("unblockable");
    // Deux cartes au cimetière : sept cartes, la créature devient imblocable.
    let t = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Cephalid Inkmage"], graveyard: lands("Plains", 5) },
    });
    t = cast(t, "p1", "Cephalid Inkmage");
    t = settle(t, (r) => (r.intent === "surveilGraveyard" && r.type === "pick" ? r.options.slice(0, 2) : undefined));
    expect(t.players.p1?.graveyard).toHaveLength(7);
    expect(chars(t, idOf(t, "p1", "battlefield", "Cephalid Inkmage")).keywords).toContain("unblockable");
  });

  it("Dreadwing Scavenger : pioche puis défausse en arrivant et en attaquant ; seuil : +1/+1 et contact mortel", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island", "Swamp"], hand: ["Dreadwing Scavenger", "Opt"], graveyard: lands("Plains", 5) },
    });
    s = cast(s, "p1", "Dreadwing Scavenger");
    s = settle(s, pickIntent("discard", [idOf(s, "p1", "hand", "Opt")]));
    const id = idOf(s, "p1", "battlefield", "Dreadwing Scavenger");
    // Pioche une Forêt, défausse Opt : six cartes au cimetière.
    expect(s.players.p1?.hand.map((x) => nameOf(s, x))).toEqual(["Forest"]);
    expect(s.players.p1?.graveyard).toHaveLength(6);
    expect(chars(s, id)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["flying"]));
    expect(chars(s, id).keywords).not.toContain("deathtouch");
    // Elle attaque (le mal d'invocation est levé à la main) : nouvelle pioche, nouvelle défausse, le seuil est atteint.
    (s.objects[id] as { controlledSince: number }).controlledSince = 0;
    s = attack(s, [id]);
    s = settle(s, (r) => (r.intent === "discard" && r.type === "pick" ? r.options.slice(0, 1) : undefined));
    expect(s.players.p1?.graveyard).toHaveLength(7);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(chars(s, id)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, id).keywords).toContain("deathtouch");
  });

  it("Dwynen, Gilt-Leaf Daen : les autres Elfes que vous contrôlez ont +1/+1 ; 1 PV par Elfe attaquant", () => {
    let s = scenario({
      p1: { battlefield: ["Dwynen, Gilt-Leaf Daen", "Llanowar Elves", "Thornweald Archer", "Bear Cub"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const dwynen = idOf(s, "p1", "battlefield", "Dwynen, Gilt-Leaf Daen");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, dwynen)).toMatchObject({ power: 3, toughness: 4 });
    expect(chars(s, dwynen).keywords).toContain("reach");
    expect(chars(s, elf)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toMatchObject({ power: 1, toughness: 1 });
    // Dwynen et un Elfe attaquent (l'Archère reste) : 2 PV, Dwynen compris.
    s = attack(s, [dwynen, elf, idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Cat Collector : une Nourriture en arrivant ; un Chat la première fois que vous gagnez des PV pendant votre tour", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), ...lands("Forest", 4)],
        hand: ["Cat Collector", "Sami's Curiosity", "Sami's Curiosity"],
      },
    });
    s = settle(cast(s, "p1", "Cat Collector"));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(0);
    s = settle(cast(s, "p1", "Sami's Curiosity"));
    const cats = idsOf(s, "p1", "battlefield", "Cat");
    expect(cats).toHaveLength(1);
    expect(chars(s, cats[0] as string)).toMatchObject({ power: 1, toughness: 1, colors: ["W"] });
    // Deuxième gain de PV du tour : pas de second Chat.
    s = settle(cast(s, "p1", "Sami's Curiosity"));
    expect(s.players.p1?.life).toBe(24);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(1);
    // Pendant le tour adverse : la Nourriture fait gagner 3 PV, sans Chat.
    let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Cat Collector"] } });
    t = settle(cast(t, "p1", "Cat Collector"));
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    t = act(t, "p2", { type: "pass" });
    t = act(t, "p1", { type: "activate", source: idOf(t, "p1", "battlefield", "Food"), ability: 0 });
    t = settle(t);
    expect(t.players.p1?.life).toBe(23);
    expect(idsOf(t, "p1", "battlefield", "Cat")).toHaveLength(0);
  });

  it("Fiendish Panda : un marqueur +1/+1 quand vous gagnez des PV ; en mourant, réanime une autre créature non-Ours de valeur de mana au plus sa force", () => {
    let s = scenario({
      p1: {
        battlefield: ["Fiendish Panda", "Forest"],
        hand: ["Sami's Curiosity"],
        graveyard: ["Crypt Feaster", "Shivan Dragon", "Bear Cub", "Savannah Lions"],
      },
    });
    const panda = idOf(s, "p1", "battlefield", "Fiendish Panda");
    s = settle(cast(s, "p1", "Sami's Curiosity"));
    expect(counterCount(s.objects[panda] as never, "+1/+1")).toBe(1);
    expect(chars(s, panda).power).toBe(4);
    // Force 4 à sa mort : Crypt Feaster (VM 4) et Savannah Lions sont des cibles, pas le Dragon (VM 6) ni Bear Cub (Ours).
    destroy(s, panda);
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" && req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Crypt Feaster", "Savannah Lions"]);
    s = settle(choose(s, [idOf(s, "p1", "graveyard", "Crypt Feaster")]));
    expect(idsOf(s, "p1", "battlefield", "Crypt Feaster")).toHaveLength(1);
  });

  it("Fiendish Panda : les PV gagnés par l'adversaire ne posent pas de marqueur", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Fiendish Panda"] },
      p2: { battlefield: ["Forest"], hand: ["Sami's Curiosity"] },
    });
    s = settle(cast(s, "p2", "Sami's Curiosity"));
    expect(s.players.p2?.life).toBe(22);
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Fiendish Panda")] as never, "+1/+1")).toBe(0);
  });
});

describe("Foundations, lot K8 : peu communes (2)", () => {
  /** Réponse qui choisit `id` comme cible d'une capacité déclenchée et répond `yes` aux questions oui/non. */
  const answer =
    (want: string[], yes = true) =>
    (req: Parameters<Parameters<typeof settle>[1] & object>[0]) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = want.filter((w) => req.options.includes(w));
        return picked.length > 0 ? picked : undefined;
      }
      return undefined;
    };
  const declareAttack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const toBlockers = (s: S, ans: ReturnType<typeof answer> = answer([])) => {
    let cur = s;
    for (let i = 0; i < 100 && cur.pending?.kind !== "declareBlockers" && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: ans(p.request) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const block = (s: S, blocks: [string, string][]) =>
    act(s, "p2", { type: "declareBlockers", blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) });
  const handSize = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  /** Active la (première) capacité activée de `source`. */
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error("capacité indisponible");
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };

  it("Fireshrieker : équiper {2} sur une créature que vous contrôlez lui donne la double initiative", () => {
    let s = scenario({
      p1: { battlefield: ["Fireshrieker", "Bear Cub", ...lands("Forest", 2)] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const gear = idOf(s, "p1", "battlefield", "Fireshrieker");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Une créature adverse n'est pas une cible légale.
    expect(() => activate(s, "p1", gear, { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] })).toThrow(/Cible illégale/);
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
    s = settle(activate(s, "p1", gear, { t: [bear] }));
    expect(s.objects[gear]?.attachedTo).toBe(bear);
    expect(chars(s, bear).keywords).toContain("doubleStrike");
    // Elle inflige ses blessures deux fois.
    s = toBlockers(declareAttack(s, [bear]));
    s = advanceUntil(block(s, []), (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
  });

  it("Frenzied Goblin : en attaquant, s'il paie {R}, la créature ciblée ne peut pas bloquer ce tour-ci", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Frenzied Goblin", "Mountain"] }, p2: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
    let s = setup();
    const goblin = idOf(s, "p1", "battlefield", "Frenzied Goblin");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = toBlockers(declareAttack(s, [goblin]), answer([bear]));
    expect(chars(s, bear).keywords).toContain("cantBlock");
    expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(true);
    expect(() => block(s, [[bear, goblin]])).toThrow();
    // L'autre créature peut toujours bloquer.
    expect(() => block(s, [[idOf(s, "p2", "battlefield", "Llanowar Elves"), goblin]])).not.toThrow();
    // Sans payer : rien.
    s = toBlockers(declareAttack(setup(), [goblin]), answer([bear], false));
    expect(chars(s, bear).keywords).not.toContain("cantBlock");
    expect(() => block(s, [[bear, goblin]])).not.toThrow();
  });

  it("Garna, Bloodfist of Keld : une autre de vos créatures meurt : piochez si elle attaquait, sinon 1 blessure à chaque adversaire", () => {
    // Hors combat : 1 blessure à l'adversaire, pas de pioche.
    let s = scenario({
      p1: { battlefield: ["Garna, Bloodfist of Keld", "Llanowar Elves", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] },
    });
    const hand = handSize(s);
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }));
    expect(s.players.p2?.life).toBe(19);
    expect(handSize(s)).toBe(hand - 1);
    // En attaquant : pioche, pas de blessure.
    s = scenario({
      p1: { battlefield: ["Garna, Bloodfist of Keld", "Bear Cub"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = toBlockers(declareAttack(s, [bear]));
    s = advanceUntil(block(s, [[idOf(s, "p2", "battlefield", "Pelakka Wurm"), bear]]), (x) => x.turn.step === "main2");
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(handSize(s)).toBe(1);
    expect(s.players.p2?.life).toBe(20);
    // Une créature adverse qui meurt ne compte pas.
    s = scenario({
      p1: { battlefield: ["Garna, Bloodfist of Keld", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p2?.life).toBe(20);
    expect(handSize(s)).toBe(0);
  });

  it("Garruk's Uprising : pioche à l'arrivée si vous avez une créature de force 4+, piétinement, pioche pour chaque créature de force 4+ qui arrive", () => {
    // Sans créature de force 4 ou plus : pas de pioche.
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Garruk's Uprising"] } });
    s = settle(cast(s, "p1", "Garruk's Uprising"));
    expect(handSize(s)).toBe(0);
    s = scenario({
      p1: { battlefield: ["Gnarlback Rhino", ...lands("Forest", 9)], hand: ["Garruk's Uprising", "Bear Cub", "Gnarlback Rhino"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Garruk's Uprising"));
    expect(handSize(s)).toBe(3);
    // Une créature de force 2 qui arrive : pas de pioche ; elle a le piétinement.
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(handSize(s)).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("trample");
    // Une créature de force 4 qui arrive : piochez une carte.
    s = settle(cast(s, "p1", "Gnarlback Rhino"));
    expect(handSize(s)).toBe(2);
  });

  it("Gate Colossus : affinité pour les Portails, imblocable par les créatures de force 2 ou moins, revient du cimetière quand un Portail arrive", () => {
    // Trois Portails : il coûte {5}.
    let s = scenario({ p1: { battlefield: [...lands("Azorius Guildgate", 3), ...lands("Plains", 2)], hand: ["Gate Colossus"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gate Colossus"))).toBe(true);
    s = scenario({ p1: { battlefield: lands("Plains", 7), hand: ["Gate Colossus"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gate Colossus"))).toBe(false);
    // Blocage.
    s = scenario({ p1: { battlefield: ["Gate Colossus"] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
    const colossus = idOf(s, "p1", "battlefield", "Gate Colossus");
    s = toBlockers(declareAttack(s, [colossus]));
    expect(() => block(s, [[idOf(s, "p2", "battlefield", "Bear Cub"), colossus]])).toThrow();
    expect(() => block(s, [[idOf(s, "p2", "battlefield", "Serra Angel"), colossus]])).not.toThrow();
    // Un Portail arrive : il peut revenir du cimetière au-dessus de la bibliothèque.
    for (const yes of [true, false]) {
      s = scenario({ p1: { hand: ["Azorius Guildgate"], graveyard: ["Gate Colossus"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Azorius Guildgate") });
      s = settle(s, answer([], yes));
      expect(nameOf(s, s.players.p1?.library[0] as string) === "Gate Colossus").toBe(yes);
      expect(idsOf(s, "p1", "graveyard", "Gate Colossus")).toHaveLength(yes ? 0 : 1);
    }
    // Un terrain qui n'est pas un Portail : rien.
    s = scenario({ p1: { hand: ["Plains"], graveyard: ["Gate Colossus"] } });
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }), answer([], true));
    expect(idsOf(s, "p1", "graveyard", "Gate Colossus")).toHaveLength(1);
  });

  it("Gatekeeper of Malakir : kické, le joueur ciblé sacrifie une créature de son choix ; sinon rien", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Gatekeeper of Malakir"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
    let s = settle(cast(setup(), "p1", "Gatekeeper of Malakir"));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    s = cast(setup(), "p1", "Gatekeeper of Malakir", { kicked: true });
    // Le joueur ciblé choisit la créature sacrifiée.
    let chooser: string | undefined;
    s = settle(s, (req, player, cur) => {
      if (req.type === "pick" && req.options.includes("p2")) return ["p2"];
      if (req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Serra Angel")) {
        chooser = player;
        return req.options.filter((id) => nameOf(cur, id) === "Serra Angel");
      }
      return undefined;
    });
    expect(chooser).toBe("p2");
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Gatekeeper of Malakir")).toHaveLength(1);
  });

  it("Gateway Sneak : imblocable ce tour-ci quand un Portail arrive sous votre contrôle ; pioche en blessant un joueur", () => {
    let s = scenario({ p1: { battlefield: ["Gateway Sneak"], hand: ["Dimir Guildgate"] }, p2: { battlefield: ["Bear Cub"] } });
    const sneak = idOf(s, "p1", "battlefield", "Gateway Sneak");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    // Sans Portail, il peut être bloqué.
    let t = toBlockers(declareAttack(s, [sneak]));
    expect(() => block(t, [[bear, sneak]])).not.toThrow();
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Dimir Guildgate") }));
    expect(chars(s, sneak).keywords).toContain("unblockable");
    t = toBlockers(declareAttack(s, [sneak]));
    // Aucun blocage possible (l'étape peut être sautée faute de bloqueur).
    expect(canBlock(t, bear, sneak)).toBe(false);
    if (t.pending?.kind === "declareBlockers") expect(() => block(t, [[bear, sneak]])).toThrow();
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(19);
    expect(handSize(t)).toBe(1);
    // Jusqu'à la fin du tour seulement.
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, sneak).keywords).not.toContain("unblockable");
  });

  it("Gnarlback Rhino : piétinement ; piochez quand vous lancez un sort qui le cible (pas un sort adverse)", () => {
    let s = scenario({
      p1: { battlefield: ["Gnarlback Rhino", "Bear Cub", "Forest", "Forest"], hand: ["Giant Growth", "Giant Growth"] },
      p2: { battlefield: ["Forest"], hand: ["Giant Growth"] },
    });
    const rhino = idOf(s, "p1", "battlefield", "Gnarlback Rhino");
    expect(chars(s, rhino).keywords).toContain("trample");
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [rhino] } }));
    expect(handSize(s)).toBe(2);
    // Un sort qui cible une autre créature : rien.
    s = settle(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
    expect(handSize(s)).toBe(1);
    // Un sort adverse qui le cible : rien.
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Giant Growth", { targets: { t: [rhino] } }));
    expect(handSize(s)).toBe(1);
  });

  it("Good-Fortune Unicorn : un marqueur +1/+1 sur chaque autre créature qui arrive sous votre contrôle", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Plains", "Forest"], hand: ["Good-Fortune Unicorn", "Llanowar Elves"] },
      p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Good-Fortune Unicorn"));
    const unicorn = idOf(s, "p1", "battlefield", "Good-Fortune Unicorn");
    expect(counterCount(s.objects[unicorn] as never, "+1/+1")).toBe(0);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")] as never, "+1/+1")).toBe(1);
    // Une créature adverse : rien.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(cast(s, "p2", "Llanowar Elves"));
    expect(counterCount(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")] as never, "+1/+1")).toBe(0);
  });

  it("Grappling Kraken : quand un terrain arrive sous votre contrôle, engage une créature adverse et y met un marqueur étourdissement", () => {
    let s = scenario({ p1: { battlefield: ["Grappling Kraken"], hand: ["Island"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), answer([bear]));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(counterCount(s.objects[bear] as never, "stun")).toBe(1);
    // Au dégagement suivant, le marqueur est retiré au lieu de la dégager.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(counterCount(s.objects[bear] as never, "stun")).toBe(0);
  });

  it("Guarded Heir : lien de vie ; à l'arrivée, deux jetons Chevalier blancs 3/3", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Guarded Heir"] } });
    s = settle(cast(s, "p1", "Guarded Heir"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Guarded Heir")).keywords).toContain("lifelink");
    const knights = idsOf(s, "p1", "battlefield", "Knight");
    expect(knights).toHaveLength(2);
    for (const k of knights) {
      const c = chars(s, k);
      expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([3, 3, ["W"], ["Knight"]]);
    }
  });

  it("Heartfire Immolator : prouesse ; {R}, sacrifice : blessures égales à sa force à une créature ou un planeswalker", () => {
    let s = scenario({
      p1: { battlefield: ["Heartfire Immolator", "Island", "Mountain"], hand: ["Opt"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const imm = idOf(s, "p1", "battlefield", "Heartfire Immolator");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = settle(cast(s, "p1", "Opt"));
    expect(chars(s, imm).power).toBe(3);
    // Un joueur n'est pas une cible légale.
    expect(() => activate(s, "p1", imm, { t: ["p2"] })).toThrow(/Cible illégale/);
    s = activate(s, "p1", imm, { t: [wurm] });
    expect(idsOf(s, "p1", "graveyard", "Heartfire Immolator")).toHaveLength(1);
    s = settle(s);
    // Sa dernière force connue (3, prouesse comprise).
    expect(s.objects[wurm]?.damage).toBe(3);
    // Un planeswalker est une cible légale.
    s = scenario({ p1: { battlefield: ["Heartfire Immolator", "Mountain"] }, p2: { battlefield: ["Vivien Reid"] } });
    const vivien = idOf(s, "p2", "battlefield", "Vivien Reid");
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Heartfire Immolator"), { t: [vivien] }));
    expect(s.objects[vivien]?.counters.loyalty).toBe(3);
  });

  it("Herald of Faith : vol ; vous gagnez 2 points de vie quand il attaque", () => {
    let s = scenario({ p1: { battlefield: ["Herald of Faith"] } });
    const herald = idOf(s, "p1", "battlefield", "Herald of Faith");
    expect(chars(s, herald).keywords).toContain("flying");
    s = settle(declareAttack(s, [herald]));
    expect(s.players.p1?.life).toBe(22);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
  });

  it("Hero's Downfall détruit une créature ou un planeswalker, pas un autre permanent", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Hero's Downfall", "Hero's Downfall"] },
      p2: { battlefield: ["Vivien Reid", "Bear Cub", "Swiftfoot Boots", "Forest"] },
    });
    for (const n of ["Swiftfoot Boots", "Forest"])
      expect(() => cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", n)] } })).toThrow(
        /Cible illégale/,
      );
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Vivien Reid")] } }));
    expect(idsOf(s, "p2", "graveyard", "Vivien Reid")).toHaveLength(1);
    s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Hero's Downfall"] }, p2: { battlefield: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Heroic Reinforcements : deux Soldats 1/1 blancs, puis vos créatures ont +1/+1 et la célérité jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2), ...lands("Plains", 2)], hand: ["Heroic Reinforcements"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Heroic Reinforcements"));
    const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
    expect(soldiers).toHaveLength(2);
    for (const id of [...soldiers, idOf(s, "p1", "battlefield", "Bear Cub")]) {
      expect(chars(s, id).keywords).toContain("haste");
    }
    expect([chars(s, soldiers[0] as string).power, chars(s, soldiers[0] as string).toughness]).toEqual([2, 2]);
    expect(chars(s, soldiers[0] as string).colors).toEqual(["W"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
    const elf = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect([chars(s, elf).power, chars(s, elf).keywords]).toEqual([1, []]);
    // Les jetons peuvent attaquer ce tour-ci.
    s = advanceUntil(declareAttack(s, soldiers), (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(16);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).power).toBe(2);
  });

  it("Hidetsugu's Second Rite : 10 blessures au joueur ciblé s'il a exactement 10 points de vie", () => {
    for (const life of [10, 11, 9]) {
      let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Hidetsugu's Second Rite"] }, p2: { life } });
      s = settle(cast(s, "p1", "Hidetsugu's Second Rite", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(life === 10 ? 0 : life);
    }
  });

  it("Infernal Vessel : en mourant, s'il n'était pas un Démon, revient avec deux marqueurs +1/+1 et devient un Démon", () => {
    let s = scenario({
      p1: { battlefield: ["Infernal Vessel", ...lands("Swamp", 6)], hand: ["Hero's Downfall", "Hero's Downfall"] },
    });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p1", "battlefield", "Infernal Vessel")] } }));
    const vessel = idOf(s, "p1", "battlefield", "Infernal Vessel");
    const c = chars(s, vessel);
    expect([c.power, c.toughness]).toEqual([4, 3]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Cleric", "Demon"]));
    // Démon, il reste au cimetière la fois suivante.
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [vessel] } }));
    expect(idsOf(s, "p1", "battlefield", "Infernal Vessel")).toHaveLength(0);
    expect(idsOf(s, "p1", "graveyard", "Infernal Vessel")).toHaveLength(1);
  });

  it("Ingenious Leonin : {3}{W} : marqueur +1/+1 sur une autre de vos créatures attaquantes ; l'initiative si c'est un Chat", () => {
    let s = scenario({
      p1: { battlefield: ["Ingenious Leonin", "Savannah Lions", "Bear Cub", "Llanowar Elves", ...lands("Plains", 8)] },
    });
    const leonin = idOf(s, "p1", "battlefield", "Ingenious Leonin");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = declareAttack(s, [leonin, lions, bear]);
    // Ni lui-même ni une créature qui n'attaque pas.
    expect(() => activate(s, "p1", leonin, { t: [leonin] })).toThrow(/Cible illégale/);
    expect(() => activate(s, "p1", leonin, { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] })).toThrow(/Cible illégale/);
    s = settle(activate(s, "p1", leonin, { t: [lions] }));
    expect(counterCount(s.objects[lions] as never, "+1/+1")).toBe(1);
    expect(chars(s, lions).keywords).toContain("firstStrike");
    s = settle(activate(s, "p1", leonin, { t: [bear] }));
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    expect(chars(s, bear).keywords).not.toContain("firstStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, lions).keywords).not.toContain("firstStrike");
  });

  it("Inspiration from Beyond : meule trois cartes puis renvoie un éphémère ou un rituel du cimetière en main ; flashback {5}{U}{U}", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 10),
        hand: ["Inspiration from Beyond"],
        library: ["Opt", "Giant Growth", "Shivan Dragon", "Forest"],
      },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Inspiration from Beyond"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Giant Growth");
    });
    // Seuls les éphémères sont proposés (pas la créature, ni le sort en cours de résolution).
    expect(options).toEqual(["Giant Growth", "Opt"]);
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Giant Growth"]);
    expect(s.players.p1?.library).toHaveLength(1);
    // Flashback depuis le cimetière, puis exil.
    const card0 = idOf(s, "p1", "graveyard", "Inspiration from Beyond");
    expect(castable(s, "p1", card0)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: card0 }));
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Inspiration from Beyond");
  });

  it("Inspiring Call : piochez une carte par créature à vous avec un marqueur +1/+1 ; elles gagnent l'indestructible", () => {
    let s = scenario({
      p1: {
        battlefield: [
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          { name: "Llanowar Elves", counters: { "+1/+1": 2 } },
          "Pelakka Wurm",
          ...lands("Forest", 3),
        ],
        hand: ["Inspiring Call"],
      },
      p2: { battlefield: [{ name: "Savannah Lions", counters: { "+1/+1": 1 } }] },
    });
    s = settle(cast(s, "p1", "Inspiring Call"));
    expect(handSize(s)).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Pelakka Wurm")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("indestructible");
  });

  it("Joust Through : 3 blessures à une créature attaquante ou bloqueuse, et vous gagnez 1 point de vie", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains"], hand: ["Joust Through"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
    s = passAccepting(s, (x) => x.pending?.player === "p1" && x.pending.kind === "priority");
    // Une créature hors combat n'est pas une cible.
    expect(() => cast(s, "p1", "Joust Through", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } })).toThrow(
      /Cible illégale/,
    );
    s = settle(cast(s, "p1", "Joust Through", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.damage).toBe(3);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Knight of Malice : initiative, défense talismanique contre le blanc, +1/+0 tant qu'un joueur contrôle un permanent blanc", () => {
    let s = scenario({
      p1: { battlefield: ["Knight of Malice", "Plains"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Plains"], hand: ["Fleeting Flight", "Savannah Lions"] },
    });
    const knight = idOf(s, "p1", "battlefield", "Knight of Malice");
    expect(chars(s, knight).keywords).toContain("firstStrike");
    expect(chars(s, knight).power).toBe(2);
    // Un sort blanc adverse ne peut pas le cibler ; le vôtre, si.
    s = act(s, "p1", { type: "pass" });
    expect(() => cast(s, "p2", "Fleeting Flight", { targets: { t: [knight] } })).toThrow(/Cible illégale/);
    s = scenario({
      p1: { battlefield: ["Knight of Malice", "Plains"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const k2 = idOf(s, "p1", "battlefield", "Knight of Malice");
    // Un permanent blanc adverse suffit.
    expect([chars(s, k2).power, chars(s, k2).toughness]).toEqual([3, 2]);
    s = settle(cast(s, "p1", "Fleeting Flight", { targets: { t: [k2] } }));
    expect(counterCount(s.objects[k2] as never, "+1/+1")).toBe(1);
  });

  it("Leonin Skyhunter : Chat Chevalier 2/2 avec le vol", () => {
    const s = scenario({ p1: { battlefield: ["Leonin Skyhunter"] } });
    const c = chars(s, idOf(s, "p1", "battlefield", "Leonin Skyhunter"));
    expect([c.power, c.toughness, c.subtypes, c.keywords]).toEqual([2, 2, ["Cat", "Knight"], ["flying"]]);
  });

  it("Leonin Vanguard : au début du combat de votre tour, avec trois créatures ou plus, +1/+1 et vous gagnez 1 point de vie", () => {
    for (const n of [2, 3]) {
      let s = scenario({
        p1: { battlefield: ["Leonin Vanguard", ...Array(n - 1).fill("Bear Cub")] },
        p2: { battlefield: ["Bear Cub", "Bear Cub"] },
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      const c = chars(s, idOf(s, "p1", "battlefield", "Leonin Vanguard"));
      expect([c.power, c.toughness, s.players.p1?.life]).toEqual(n === 3 ? [2, 2, 21] : [1, 1, 20]);
    }
    // Pas au combat du tour adverse.
    let s = scenario({ active: "p2", p1: { battlefield: ["Leonin Vanguard", "Bear Cub", "Bear Cub"] } });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p1?.life).toBe(20);
  });

  it("Maalfeld Twins : en mourant, deux jetons Zombie noirs 2/2", () => {
    let s = scenario({ p1: { battlefield: ["Maalfeld Twins", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] } });
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p1", "battlefield", "Maalfeld Twins")] } }));
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(2);
    const c = chars(s, zombies[0] as string);
    expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([2, 2, ["B"], ["Zombie"]]);
  });

  it("Make a Stand : vos créatures ont +1/+0 et l'indestructible jusqu'à la fin du tour", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Savannah Lions", ...lands("Plains", 3)], hand: ["Make a Stand"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Make a Stand"));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 2]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).toContain("indestructible");
    const elf = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect([chars(s, elf).power, chars(s, elf).keywords]).toEqual([1, []]);
    destroy(s, bear);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect([chars(s, bear).power, chars(s, bear).keywords]).toEqual([2, []]);
  });

  it("Meteor Golem : à l'arrivée, détruit un permanent non-terrain qu'un adversaire contrôle", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 7), "Bear Cub"], hand: ["Meteor Golem"] },
      p2: { battlefield: ["Forest", "Swiftfoot Boots", "Llanowar Elves"] },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Meteor Golem"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Swiftfoot Boots");
    });
    expect(options).toEqual(["Llanowar Elves", "Swiftfoot Boots"]);
    expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
  });

  it("Micromancer : à l'arrivée, vous pouvez chercher un éphémère ou un rituel de valeur de mana 1", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 4),
        hand: ["Micromancer"],
        library: ["Shivan Dragon", "Quick Study", "Opt", "Duress", "Swiftfoot Boots", "Llanowar Elves"],
      },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Micromancer"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Duress");
    });
    expect(options).toEqual(["Duress", "Opt"]);
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Duress"]);
    // Refus : rien.
    s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Micromancer"], library: ["Opt", "Forest"] } });
    s = settle(cast(s, "p1", "Micromancer"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(0);
  });

  it("Midnight Snack : raid, une Nourriture à votre étape de fin si vous avez attaqué ; {2}{B}, sacrifice : l'adversaire perd la vie gagnée ce tour", () => {
    for (const attacked of [true, false]) {
      let s = scenario({ p1: { battlefield: ["Midnight Snack", "Bear Cub"] } });
      if (attacked) s = declareAttack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(attacked ? 1 : 0);
    }
    let s = scenario({
      p1: { battlefield: ["Midnight Snack", ...lands("Forest", 7), ...lands("Swamp", 3)], hand: ["Pelakka Wurm"] },
    });
    s = settle(cast(s, "p1", "Pelakka Wurm"));
    expect(s.players.p1?.life).toBe(27);
    const snack = idOf(s, "p1", "battlefield", "Midnight Snack");
    // Un adversaire seulement.
    expect(() => activate(s, "p1", snack, { t: ["p1"] })).toThrow(/Cible illégale/);
    s = settle(activate(s, "p1", snack, { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(13);
    expect(idsOf(s, "p1", "graveyard", "Midnight Snack")).toHaveLength(1);
  });

  it("Mindsparker : initiative ; 2 blessures à l'adversaire qui lance un éphémère ou un rituel blanc ou bleu", () => {
    let s = scenario({
      active: "p2",
      // Opt sera pioché au tour suivant (hors de portée de Duress).
      p1: { battlefield: ["Mindsparker", "Island"], library: ["Opt", ...lands("Forest", 5)] },
      p2: { battlefield: ["Island", "Plains", "Forest", "Swamp"], hand: ["Opt", "Fleeting Flight", "Giant Growth", "Duress"] },
    });
    const sparker = idOf(s, "p1", "battlefield", "Mindsparker");
    expect(chars(s, sparker).keywords).toContain("firstStrike");
    s = settle(cast(s, "p2", "Opt"));
    expect(s.players.p2?.life).toBe(18);
    s = settle(cast(s, "p2", "Fleeting Flight", { targets: { t: [sparker] } }));
    expect(s.players.p2?.life).toBe(16);
    // Vert ou noir : rien.
    s = settle(cast(s, "p2", "Giant Growth", { targets: { t: [sparker] } }));
    s = settle(cast(s, "p2", "Duress", { targets: { t: ["p1"] } }));
    expect(s.players.p2?.life).toBe(16);
    // Vos propres sorts : rien.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    s = settle(cast(s, "p1", "Opt"));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 16]);
  });

  it("Mischievous Mystic : vol ; un jeton Faerie 1/1 volant quand vous piochez votre deuxième carte du tour", () => {
    let s = scenario({ p1: { battlefield: ["Mischievous Mystic", ...lands("Island", 4)], hand: ["Opt", "Quick Study"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Mischievous Mystic")).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Faerie")).toHaveLength(0);
    // Deuxième et troisième cartes : un seul jeton.
    s = settle(cast(s, "p1", "Quick Study"));
    const faeries = idsOf(s, "p1", "battlefield", "Faerie");
    expect(faeries).toHaveLength(1);
    const c = chars(s, faeries[0] as string);
    expect([c.power, c.toughness, c.colors, c.keywords]).toEqual([1, 1, ["U"], ["flying"]]);
  });

  it("Mischievous Pup : flash ; à l'arrivée, renvoie jusqu'à un autre permanent que vous contrôlez dans la main", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 3)], hand: ["Mischievous Pup"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p2", { type: "pass" });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Mischievous Pup"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "");
      return req.options.filter((id) => nameOf(cur, id) === "Llanowar Elves");
    });
    // Ni lui-même ni un permanent adverse.
    expect(options).not.toContain("Mischievous Pup");
    expect(options).not.toContain("Bear Cub");
    expect(options).toContain("Llanowar Elves");
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Llanowar Elves"]);
    expect(idsOf(s, "p1", "battlefield", "Mischievous Pup")).toHaveLength(1);
  });

  it("Mold Adder : vous pouvez mettre un marqueur +1/+1 quand un adversaire lance un sort bleu ou noir", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Mold Adder"] },
      p2: { battlefield: ["Island", "Swamp", "Forest", "Island"], hand: ["Opt", "Duress", "Giant Growth", "Opt"] },
    });
    const adder = idOf(s, "p1", "battlefield", "Mold Adder");
    const yes = (req: { type: string }) => (req.type === "yesNo" ? [1] : undefined);
    s = settle(cast(s, "p2", "Opt"), yes);
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(1);
    s = settle(cast(s, "p2", "Duress", { targets: { t: ["p1"] } }), yes);
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(2);
    s = settle(cast(s, "p2", "Giant Growth", { targets: { t: [adder] } }), yes);
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(2);
    // Refus.
    s = settle(cast(s, "p2", "Opt"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(counterCount(s.objects[adder] as never, "+1/+1")).toBe(2);
  });

  it("Mortify détruit une créature ou un enchantement, pas un artefact ni un terrain", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", "Swamp"], hand: ["Mortify"] },
      p2: { battlefield: ["Banishing Light", "Bear Cub", "Swiftfoot Boots", "Forest"] },
    });
    for (const n of ["Swiftfoot Boots", "Forest"])
      expect(() => cast(s, "p1", "Mortify", { targets: { t: [idOf(s, "p2", "battlefield", n)] } })).toThrow(/Cible illégale/);
    const t = settle(cast(s, "p1", "Mortify", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(cast(s, "p1", "Mortify", { targets: { t: [idOf(s, "p2", "battlefield", "Banishing Light")] } }));
    expect(idsOf(s, "p2", "graveyard", "Banishing Light")).toHaveLength(1);
  });

  it("Mystical Teachings : cherche un éphémère ou une carte avec le flash ; flashback {5}{B}", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), ...lands("Swamp", 6)],
        hand: ["Mystical Teachings"],
        library: ["Shivan Dragon", "Chart a Course", "Opt", "Mischievous Pup", "Forest"],
      },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Mystical Teachings"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "").sort();
      return req.options.filter((id) => nameOf(cur, id) === "Mischievous Pup");
    });
    expect(options).toEqual(["Mischievous Pup", "Opt"]);
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual(["Mischievous Pup"]);
    const card0 = idOf(s, "p1", "graveyard", "Mystical Teachings");
    expect(castable(s, "p1", card0)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: card0 }));
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Mystical Teachings");
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Needletooth Pack : morbide, à votre étape de fin, deux marqueurs +1/+1 sur une de vos créatures si une créature est morte ce tour", () => {
    let s = scenario({
      p1: { battlefield: ["Needletooth Pack", "Bear Cub", ...lands("Swamp", 3)], hand: ["Hero's Downfall"] },
      p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Sans mort : rien.
    let t = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(counterCount(t.objects[bear] as never, "+1/+1")).toBe(0);
    s = settle(cast(s, "p1", "Hero's Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
    let options: string[] = [];
    t = s;
    for (let i = 0; i < 200 && t.turn.active === "p1"; i++) {
      const p = t.pending;
      if (p?.kind === "priority") t = act(t, p.player, { type: "pass" });
      else if (p?.kind === "declareAttackers") t = act(t, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "choice" && p.request.type === "pick") {
        options = p.request.options.map((id) => nameOf(t, id) ?? "").sort();
        t = act(t, p.player, { type: "choose", values: [bear] });
      } else break;
    }
    // Une créature que vous contrôlez seulement.
    expect(options).toEqual(["Bear Cub", "Needletooth Pack"]);
    expect(counterCount(t.objects[bear] as never, "+1/+1")).toBe(2);
  });

  it("Nessian Hornbeetle : au début du combat de votre tour, un marqueur +1/+1 si vous contrôlez une autre créature de force 4 ou plus", () => {
    for (const [other, n] of [
      ["Pelakka Wurm", 1],
      ["Bear Cub", 0],
    ] as const) {
      let s = scenario({ p1: { battlefield: ["Nessian Hornbeetle", other] }, p2: { battlefield: ["Serra Angel"] } });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(counterCount(s.objects[idOf(s, "p1", "battlefield", "Nessian Hornbeetle")] as never, "+1/+1")).toBe(n);
    }
  });
});

describe("Foundations, lot K8 : peu communes (3)", () => {
  const kw = (s: S, id: string, k: string) => (chars(s, id).keywords as string[]).includes(k);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handSize = (s: S, p: string) => s.players[p]?.hand.length ?? 0;
  const life = (s: S, p: string) => s.players[p]?.life;
  /** Options d'un choix « pick » en attente (cibles d'un déclenchement, etc.). */
  const pickOptions = (s: S) =>
    s.pending?.kind === "choice" && s.pending.request.type === "pick" ? s.pending.request.options : [];
  /** Réponse : « oui » aux questions, sinon la suggestion. */
  const yes = (req: { type: string }) => (req.type === "yesNo" ? [1] : undefined);
  /** p2 passe : p1 reçoit la priorité pendant le tour de p2 (vitesse d'éphémère). */
  const p1Priority = (s: S) => passUntil(s, (x) => x.pending?.player === "p1");
  /** Va jusqu'au prochain choix d'intention `intent` (ou s'arrête). */
  const untilIntent = (s: S, intent: string) =>
    advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === intent);
  /** Joue (choix suggérés, sans attaquer) jusqu'au tour suivant ; renvoie aussi les intentions des choix rencontrés. */
  const toNextTurn = (s: S) => {
    const seen: string[] = [];
    let cur = s;
    for (let i = 0; i < 300 && cur.turn.active === s.turn.active; i++) {
      if (cur.pending?.kind === "choice") seen.push(cur.pending.request.intent);
      cur = advanceUntil(cur, () => false, 1);
    }
    return { s: cur, seen };
  };

  it("Perforating Artist : contact mortel ; raid à votre étape de fin, l'adversaire perd 3 PV, sacrifie un permanent non-terrain ou se défausse", () => {
    const setup = (p2: { battlefield: string[]; hand: string[] }) =>
      scenario({ p1: { battlefield: ["Perforating Artist"] }, p2: { ...p2, library: lands("Forest", 10) } });
    let s = setup({ battlefield: ["Forest"], hand: ["Opt"] });
    const artist = idOf(s, "p1", "battlefield", "Perforating Artist");
    expect(kw(s, artist, "deathtouch")).toBe(true);
    s = attack(s, [artist]);
    s = untilIntent(s, "punisher");
    expect(s.pending?.player).toBe("p2");
    // Pas de permanent non-terrain : seulement la perte de vie ou la défausse.
    expect(pickOptions(s)).toEqual(["life", "discard"]);
    s = choose(s, ["life"]);
    expect(life(s, "p2")).toBe(14);

    let t = setup({ battlefield: ["Forest", "Llanowar Elves"], hand: ["Opt"] });
    t = attack(t, [idOf(t, "p1", "battlefield", "Perforating Artist")]);
    t = untilIntent(t, "punisher");
    expect(pickOptions(t)).toEqual(["life", "discard", "sacrifice"]);
    t = choose(t, ["sacrifice"]);
    // Le seul permanent non-terrain est sacrifié, le terrain reste ; aucune perte de vie en plus du combat.
    expect(idsOf(t, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Forest")).toHaveLength(1);
    expect(life(t, "p2")).toBe(17);

    // Sans attaque : rien à l'étape de fin.
    const u = toNextTurn(setup({ battlefield: ["Llanowar Elves"], hand: ["Opt"] }));
    expect(u.seen).not.toContain("punisher");
    expect(life(u.s, "p2")).toBe(20);
    expect(idsOf(u.s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });
  it("Prayer of Binding : flash ; exile jusqu'à un permanent non-terrain adverse tant qu'il reste, et vous gagnez 2 PV", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Plains", 4), "Llanowar Elves"], hand: ["Prayer of Binding"] },
      p2: { battlefield: ["Shivan Dragon", "Forest"] },
    });
    s = p1Priority(s);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Prayer of Binding");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Seul le permanent non-terrain de l'adversaire est une cible.
    expect(pickOptions(s)).toEqual([dragon]);
    s = settle(s, picking([dragon]));
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    expect(life(s, "p1")).toBe(22);
    destroy(s, idOf(s, "p1", "battlefield", "Prayer of Binding"));
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);

    // « Jusqu'à un » : sans cible, on gagne quand même 2 PV.
    let t = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Prayer of Binding"] } });
    t = settle(cast(t, "p1", "Prayer of Binding"));
    expect(life(t, "p1")).toBe(22);
  });

  it("Ravenous Amulet : sacrifier une créature pioche et met un marqueur d'âme (vitesse de rituel) ; se sacrifier fait perdre 1 PV par marqueur", () => {
    let s = scenario({ p1: { battlefield: ["Ravenous Amulet", "Llanowar Elves", ...lands("Swamp", 6)] } });
    const amulet = idOf(s, "p1", "battlefield", "Ravenous Amulet");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: amulet, ability: 0, sacrifice: [elf] });
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    s = passBoth(s);
    expect(handSize(s, "p1")).toBe(1);
    expect(counterCount(s.objects[amulet] as never, "soul")).toBe(1);

    // Vitesse de rituel : pas pendant le tour adverse (la seconde capacité, elle, reste possible).
    let t = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Ravenous Amulet", counters: { soul: 3 } }, "Llanowar Elves", ...lands("Swamp", 4)] },
    });
    t = p1Priority(t);
    const am2 = idOf(t, "p1", "battlefield", "Ravenous Amulet");
    const abilities = legalActions(t, "p1").filter((a) => a.type === "activate" && a.source === am2);
    expect(abilities.map((a) => a.type === "activate" && a.ability)).toEqual([1]);
    t = act(t, "p1", { type: "activate", source: am2, ability: 1 });
    expect(idsOf(t, "p1", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    t = passBoth(t);
    expect(life(t, "p2")).toBe(17);
    expect(life(t, "p1")).toBe(20);
  });

  it("Ravenous Giant : vous inflige 1 blessure à votre entretien seulement", () => {
    let s = scenario({ active: "p2", step: "main2", p1: { battlefield: ["Ravenous Giant"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(life(s, "p1")).toBe(19);
    // L'entretien de l'adversaire : rien.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(life(s, "p1")).toBe(19);
    expect(life(s, "p2")).toBe(20);
  });

  it("Reclamation Sage : en arrivant, peut détruire un artefact ou un enchantement ciblé", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 3), "Ravenous Amulet"], hand: ["Reclamation Sage"] },
        p2: { battlefield: ["Ravenous Amulet", "Bear Cub", "Forest"] },
      });
    let s = setup();
    const amulet = idOf(s, "p2", "battlefield", "Ravenous Amulet");
    s = cast(s, "p1", "Reclamation Sage");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Ni créature ni terrain : seuls les artefacts (de chaque camp) sont des cibles.
    expect([...pickOptions(s)].sort()).toEqual([amulet, idOf(s, "p1", "battlefield", "Ravenous Amulet")].sort());
    s = choose(s, [amulet]);
    s = settle(s, yes);
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    // « Vous pouvez » : refuser le laisse en place.
    const t = settle(cast(setup(), "p1", "Reclamation Sage"), (req) =>
      req.type === "yesNo" ? [0] : picking([amulet])(req as never),
    );
    expect(idsOf(t, "p2", "battlefield", "Ravenous Amulet")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Ravenous Amulet")).toHaveLength(1);
  });

  it("Release the Dogs : crée quatre jetons Chien blancs 1/1", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Release the Dogs"] } });
    s = settle(cast(s, "p1", "Release the Dogs"));
    const dogs = idsOf(s, "p1", "battlefield", "Dog");
    expect(dogs).toHaveLength(4);
    for (const d of dogs) {
      expect(pt(s, d)).toEqual([1, 1]);
      expect(chars(s, d).colors).toEqual(["W"]);
      expect(chars(s, d).subtypes).toContain("Dog");
    }
  });

  it("Resolute Reinforcements : flash, et crée un jeton Soldat blanc 1/1 en arrivant", () => {
    let s = scenario({ active: "p2", p1: { battlefield: lands("Plains", 2), hand: ["Resolute Reinforcements"] } });
    s = p1Priority(s);
    s = settle(cast(s, "p1", "Resolute Reinforcements"));
    expect(idsOf(s, "p1", "battlefield", "Resolute Reinforcements")).toHaveLength(1);
    const soldier = idOf(s, "p1", "battlefield", "Soldier");
    expect(pt(s, soldier)).toEqual([1, 1]);
    expect(chars(s, soldier).colors).toEqual(["W"]);
  });

  it("Revenge of the Rats : un Rat 1/1 engagé par carte de créature de votre cimetière, puis flashback", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 8),
        hand: ["Revenge of the Rats"],
        graveyard: ["Bear Cub", "Llanowar Elves", "Shivan Dragon", "Opt"],
      },
      p2: { graveyard: ["Pelakka Wurm"] },
    });
    s = settle(cast(s, "p1", "Revenge of the Rats"));
    let rats = idsOf(s, "p1", "battlefield", "Rat");
    // Trois cartes de créature chez vous (ni l'éphémère ni le cimetière adverse).
    expect(rats).toHaveLength(3);
    expect(rats.every((r) => s.objects[r]?.tapped)).toBe(true);
    expect(pt(s, rats[0] as string)).toEqual([1, 1]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Revenge of the Rats") });
    s = settle(s);
    rats = idsOf(s, "p1", "battlefield", "Rat");
    expect(rats).toHaveLength(6);
    expect(exiled(s, "Revenge of the Rats")).toHaveLength(1);
  });

  it("Ruby, Daring Tracker : célérité ; +2/+2 en attaquant si vous contrôlez une créature de force 4 ou plus ; mana {R} ou {G}", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Ruby, Daring Tracker", sick: true }, "Pelakka Wurm"] } });
    const ruby = idOf(s, "p1", "battlefield", "Ruby, Daring Tracker");
    s = attack(s, [ruby]);
    s = settle(s);
    expect(pt(s, ruby)).toEqual([3, 4]);

    let t = scenario({ p1: { battlefield: ["Ruby, Daring Tracker", "Bear Cub"] } });
    const ruby2 = idOf(t, "p1", "battlefield", "Ruby, Daring Tracker");
    t = attack(t, [ruby2]);
    t = settle(t);
    expect(pt(t, ruby2)).toEqual([1, 2]);

    const m = scenario({ p1: { battlefield: ["Ruby, Daring Tracker"] } });
    const r = idOf(m, "p1", "battlefield", "Ruby, Daring Tracker");
    expect(act(m, "p1", { type: "tapForMana", source: r, ability: 0, color: "R" }).players.p1?.manaPool.R).toBe(1);
    expect(act(m, "p1", { type: "tapForMana", source: r, ability: 0, color: "G" }).players.p1?.manaPool.G).toBe(1);
  });

  it("Rune-Sealed Wall : défenseur ; {T} : surveillance 1", () => {
    let s = scenario({ p1: { battlefield: ["Rune-Sealed Wall"], library: ["Opt", ...lands("Island", 5)] } });
    const wall = idOf(s, "p1", "battlefield", "Rune-Sealed Wall");
    const atk = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(atk, "p1", { type: "declareAttackers", attackers: [{ id: wall, defender: "p2" }] })).toThrow();
    s = act(s, "p1", { type: "activate", source: wall, ability: 0 });
    let seen: string[] = [];
    s = settle(s, (req) => {
      if (req.type === "pick" && req.intent.startsWith("surveil")) {
        seen = req.options;
        return req.options;
      }
      return undefined;
    });
    expect(seen).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[wall]?.tapped).toBe(true);
  });

  it("Seismic Rupture : 2 blessures à chaque créature sans le vol, de chaque camp", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub", "Serra Angel"], hand: ["Seismic Rupture"] },
      p2: { battlefield: ["Llanowar Elves", "Fire Elemental", "Shivan Dragon"] },
    });
    s = settle(cast(s, "p1", "Seismic Rupture"));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Fire Elemental")]?.damage).toBe(2);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Shivan Dragon")]?.damage).toBe(0);
    expect(life(s, "p1")).toBe(20);
    expect(life(s, "p2")).toBe(20);
  });

  it("Self-Reflection : crée un jeton copie d'une créature que vous contrôlez ; flashback {3}{U}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 10), "Serra Angel"], hand: ["Self-Reflection"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    expect(() => cast(s, "p1", "Self-Reflection", { targets: { t: [dragon] } })).toThrow();
    s = settle(cast(s, "p1", "Self-Reflection", { targets: { t: [angel] } }));
    let angels = idsOf(s, "p1", "battlefield", "Serra Angel");
    expect(angels).toHaveLength(2);
    expect(angels.filter((a) => s.objects[a]?.isToken)).toHaveLength(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Self-Reflection"), targets: { t: [angel] } });
    s = settle(s);
    angels = idsOf(s, "p1", "battlefield", "Serra Angel");
    expect(angels).toHaveLength(3);
    expect(exiled(s, "Self-Reflection")).toHaveLength(1);
  });

  it("Shipwreck Dowser : en arrivant, rend un éphémère ou un rituel de votre cimetière ; prouesse", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Shipwreck Dowser", "Opt"],
        graveyard: ["Release the Dogs", "Opt", "Bear Cub"],
      },
      p2: { graveyard: ["Giant Growth"] },
    });
    s = cast(s, "p1", "Shipwreck Dowser");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const dogs = idOf(s, "p1", "graveyard", "Release the Dogs");
    // Vos éphémères et rituels seulement (ni la carte de créature ni le cimetière adverse).
    expect([...pickOptions(s)].sort()).toEqual([dogs, idOf(s, "p1", "graveyard", "Opt")].sort());
    s = settle(s, picking([dogs]));
    expect(idsOf(s, "p1", "hand", "Release the Dogs")).toHaveLength(1);
    const dowser = idOf(s, "p1", "battlefield", "Shipwreck Dowser");
    s = cast(s, "p1", "Opt");
    s = passUntil(s, (x) => !x.stack.some((i) => i.kind === "spell"));
    s = settle(s);
    expect(pt(s, dowser)).toEqual([4, 4]);
  });

  it("Skyship Buccaneer et Storm Fleet Spy : raid, piochent une carte en arrivant seulement si vous avez attaqué ce tour-ci", () => {
    for (const [name, mana] of [
      ["Skyship Buccaneer", 5],
      ["Storm Fleet Spy", 3],
    ] as const) {
      let s = scenario({ p1: { battlefield: lands("Island", mana), hand: [name] } });
      s = settle(cast(s, "p1", name));
      expect(handSize(s, "p1")).toBe(0);

      let t = scenario({ p1: { battlefield: [...lands("Island", mana), "Bear Cub"], hand: [name] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
      t = advanceUntil(t, (x) => x.turn.step === "main2");
      t = settle(cast(t, "p1", name));
      expect(handSize(t, "p1")).toBe(1);
    }
    const s = scenario({ p1: { battlefield: ["Skyship Buccaneer"] } });
    expect(kw(s, idOf(s, "p1", "battlefield", "Skyship Buccaneer"), "flying")).toBe(true);
  });

  it("Slumbering Cerberus : ne se dégage pas pendant votre étape de dégagement ; morbide, se dégage à chaque étape de fin si une créature est morte", () => {
    // Tour adverse : une créature meurt, Cerberus se dégage à l'étape de fin de l'adversaire.
    let s = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Slumbering Cerberus", tapped: true }] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cerb = idOf(s, "p1", "battlefield", "Slumbering Cerberus");
    destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p1");
    expect(s.objects[cerb]?.tapped).toBe(false);

    // Sans mort : il reste engagé, y compris pendant votre étape de dégagement.
    let t = scenario({ active: "p2", p1: { battlefield: [{ name: "Slumbering Cerberus", tapped: true }] } });
    const c2 = idOf(t, "p1", "battlefield", "Slumbering Cerberus");
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(t.objects[c2]?.tapped).toBe(true);
  });

  it("Snakeskin Veil : un marqueur +1/+1 et la défense talismanique jusqu'à la fin du tour, sur votre créature", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Snakeskin Veil"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => cast(s, "p1", "Snakeskin Veil", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } })).toThrow();
    s = settle(cast(s, "p1", "Snakeskin Veil", { targets: { t: [bear] } }));
    expect(counterCount(s.objects[bear] as never, "+1/+1")).toBe(1);
    expect(kw(s, bear, "hexproof")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(kw(s, bear, "hexproof")).toBe(false);
    expect(pt(s, bear)).toEqual([3, 3]);
  });

  it("Spectral Sailor : flash, vol ; {3}{U} : piochez une carte", () => {
    let s = scenario({ active: "p2", p1: { battlefield: lands("Island", 5), hand: ["Spectral Sailor"] } });
    s = p1Priority(s);
    s = settle(cast(s, "p1", "Spectral Sailor"));
    const sailor = idOf(s, "p1", "battlefield", "Spectral Sailor");
    expect(kw(s, sailor, "flying")).toBe(true);
    s = p1Priority(s);
    s = act(s, "p1", { type: "activate", source: sailor, ability: 0 });
    s = passBoth(s);
    expect(handSize(s, "p1")).toBe(1);
    // Plus que {3} disponible : pas de seconde activation.
    expect(canActivate(s, "p1", sailor)).toBe(false);
  });

  it("Stasis Snare : flash ; exile une créature adverse ciblée tant qu'il reste sur le champ de bataille", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Stasis Snare"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves", "Forest"] },
    });
    s = p1Priority(s);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Stasis Snare");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Les créatures adverses seulement (ni la vôtre ni un terrain).
    expect([...pickOptions(s)].sort()).toEqual([dragon, idOf(s, "p2", "battlefield", "Llanowar Elves")].sort());
    s = settle(s, picking([dragon]));
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Stasis Snare"));
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Stroke of Midnight : détruit un permanent non-terrain ; son contrôleur crée un Humain blanc 1/1", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Stroke of Midnight"] },
      p2: { battlefield: ["Ravenous Amulet", "Forest"] },
    });
    expect(() => cast(s, "p1", "Stroke of Midnight", { targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = settle(cast(s, "p1", "Stroke of Midnight", { targets: { t: [idOf(s, "p2", "battlefield", "Ravenous Amulet")] } }));
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    const human = idOf(s, "p2", "battlefield", "Human");
    expect(pt(s, human)).toEqual([1, 1]);
    expect(chars(s, human).colors).toEqual(["W"]);
    expect(idsOf(s, "p1", "battlefield", "Human")).toHaveLength(0);
  });

  it("Stromkirk Bloodthief : à votre étape de fin, si un adversaire a perdu des PV, un marqueur +1/+1 sur un de vos Vampires", () => {
    let s = scenario({ p1: { battlefield: ["Stromkirk Bloodthief", "Vampire Nighthawk", "Bear Cub"] } });
    const thief = idOf(s, "p1", "battlefield", "Stromkirk Bloodthief");
    const hawk = idOf(s, "p1", "battlefield", "Vampire Nighthawk");
    s = attack(s, [hawk]);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
    // Seuls vos Vampires sont des cibles.
    expect([...pickOptions(s)].sort()).toEqual([thief, hawk].sort());
    s = settle(s, picking([thief]));
    expect(counterCount(s.objects[thief] as never, "+1/+1")).toBe(1);

    // Aucun adversaire n'a perdu de PV : pas de déclenchement.
    const t = scenario({ step: "main2", p1: { battlefield: ["Stromkirk Bloodthief"] } });
    const th2 = idOf(t, "p1", "battlefield", "Stromkirk Bloodthief");
    const after = toNextTurn(t);
    expect(after.seen).toEqual([]);
    expect(counterCount(after.s.objects[th2] as never, "+1/+1")).toBe(0);
  });

  it("Syr Alin, the Lion's Claw : initiative ; en attaquant, vos autres créatures ont +1/+1", () => {
    let s = scenario({
      p1: { battlefield: ["Syr Alin, the Lion's Claw", "Bear Cub"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const alin = idOf(s, "p1", "battlefield", "Syr Alin, the Lion's Claw");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(kw(s, alin, "firstStrike")).toBe(true);
    s = attack(s, [alin]);
    s = settle(s);
    expect(pt(s, alin)).toEqual([4, 4]);
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
  });

  it("Tatyova, Benthic Druid : quand un terrain arrive sous votre contrôle, vous gagnez 1 PV et piochez", () => {
    let s = scenario({ p1: { battlefield: ["Tatyova, Benthic Druid"], hand: ["Forest"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(s);
    expect(life(s, "p1")).toBe(21);
    expect(handSize(s, "p1")).toBe(1);
    // Un terrain de l'adversaire : rien.
    let t = scenario({ active: "p2", p1: { battlefield: ["Tatyova, Benthic Druid"] }, p2: { hand: ["Forest"] } });
    t = settle(act(t, "p2", { type: "playLand", card: idOf(t, "p2", "hand", "Forest") }));
    expect(life(t, "p1")).toBe(20);
    expect(handSize(t, "p1")).toBe(0);
  });

  it("Thrashing Brontodon : {1}, sacrifiez-le : détruisez un artefact ou un enchantement ciblé", () => {
    let s = scenario({
      p1: { battlefield: ["Thrashing Brontodon", "Forest"] },
      p2: { battlefield: ["Ravenous Amulet", "Bear Cub"] },
    });
    const bronto = idOf(s, "p1", "battlefield", "Thrashing Brontodon");
    expect(() =>
      act(s, "p1", { type: "activate", source: bronto, ability: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
    ).toThrow();
    s = act(s, "p1", {
      type: "activate",
      source: bronto,
      ability: 0,
      targets: { t: [idOf(s, "p2", "battlefield", "Ravenous Amulet")] },
    });
    expect(idsOf(s, "p1", "graveyard", "Thrashing Brontodon")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
  });

  it("Tragic Banshee : -1/-1 à une créature adverse, -13/-13 à la place si une créature est morte ce tour-ci", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Tragic Banshee"] },
        p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] },
      });
    let s = setup();
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = cast(s, "p1", "Tragic Banshee");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    expect([...pickOptions(s)].sort()).toEqual([wurm, idOf(s, "p2", "battlefield", "Llanowar Elves")].sort());
    s = settle(s, picking([wurm]));
    expect(pt(s, wurm)).toEqual([6, 6]);

    let t = setup();
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = settle(cast(t, "p1", "Tragic Banshee"), picking([wurm]));
    expect(idsOf(t, "p2", "graveyard", "Pelakka Wurm")).toHaveLength(1);
  });

  it("Trygon Predator : vol ; blessures de combat à un joueur, peut détruire un artefact ou un enchantement de ce joueur", () => {
    let s = scenario({
      p1: { battlefield: ["Trygon Predator", "Rune-Sealed Wall"] },
      p2: { battlefield: ["Ravenous Amulet"] },
    });
    const trygon = idOf(s, "p1", "battlefield", "Trygon Predator");
    expect(kw(s, trygon, "flying")).toBe(true);
    s = attack(s, [trygon]);
    s = advanceUntil(s, (x) => x.pending?.kind === "choice");
    expect(pickOptions(s)).toEqual([idOf(s, "p2", "battlefield", "Ravenous Amulet")]);
    s = settle(s, yes);
    expect(life(s, "p2")).toBe(18);
    expect(idsOf(s, "p2", "graveyard", "Ravenous Amulet")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Rune-Sealed Wall")).toHaveLength(1);
  });

  it("Twinblade Blessing : flash ; la créature enchantée a la double initiative", () => {
    let s = scenario({ active: "p2", p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Twinblade Blessing"] } });
    s = p1Priority(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Twinblade Blessing", { targets: { enchant: [bear] } }));
    expect(kw(s, bear, "doubleStrike")).toBe(true);
    destroy(s, idOf(s, "p1", "battlefield", "Twinblade Blessing"));
    expect(kw(s, bear, "doubleStrike")).toBe(false);
  });

  it("Twinblade Paladin : un marqueur +1/+1 quand vous gagnez des PV ; double initiative à 25 PV ou plus", () => {
    let s = scenario({
      p1: { life: 23, battlefield: ["Twinblade Paladin", ...lands("Plains", 4)], hand: ["Prayer of Binding"] },
    });
    const paladin = idOf(s, "p1", "battlefield", "Twinblade Paladin");
    expect(kw(s, paladin, "doubleStrike")).toBe(false);
    s = settle(cast(s, "p1", "Prayer of Binding"));
    expect(life(s, "p1")).toBe(25);
    expect(counterCount(s.objects[paladin] as never, "+1/+1")).toBe(1);
    expect(kw(s, paladin, "doubleStrike")).toBe(true);
    const t = scenario({ p1: { life: 24, battlefield: ["Twinblade Paladin"] } });
    expect(kw(t, idOf(t, "p1", "battlefield", "Twinblade Paladin"), "doubleStrike")).toBe(false);
  });

  it("Unflinching Courage : la créature enchantée a +2/+2, le piétinement et le lien de vie", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Plains", "Bear Cub"], hand: ["Unflinching Courage"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Unflinching Courage", { targets: { enchant: [bear] } }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(kw(s, bear, "trample")).toBe(true);
    expect(kw(s, bear, "lifelink")).toBe(true);
    s = attack(s, [bear]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(life(s, "p2")).toBe(16);
    expect(life(s, "p1")).toBe(24);
  });

  it("Valorous Stance : rend une créature indestructible, ou détruit une créature d'endurance 4 ou plus", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Valorous Stance"] },
        p2: { battlefield: ["Fire Elemental", "Llanowar Elves"] },
      });
    let s = setup();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Valorous Stance", { mode: 0, targets: { t: [bear] } }));
    destroy(s, bear);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);

    let t = setup();
    expect(() =>
      cast(t, "p1", "Valorous Stance", { mode: 1, targets: { t: [idOf(t, "p2", "battlefield", "Llanowar Elves")] } }),
    ).toThrow();
    t = settle(cast(t, "p1", "Valorous Stance", { mode: 1, targets: { t: [idOf(t, "p2", "battlefield", "Fire Elemental")] } }));
    expect(idsOf(t, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
  });

  it("Vampire Gourmand : en attaquant, peut sacrifier une autre créature ; si oui, piochez et il ne peut pas être bloqué", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Vampire Gourmand", "Llanowar Elves"] }, p2: { battlefield: ["Bear Cub"] } });
    let s = setup();
    const gourmand = idOf(s, "p1", "battlefield", "Vampire Gourmand");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attack(s, [gourmand]);
    s = passUntil(s, (x) => x.pending?.kind !== "priority");
    // L'autre créature seulement (pas Gourmand lui-même).
    expect(pickOptions(s)).toEqual([elf]);
    s = choose(s, [elf]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(1);
    expect(() =>
      act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: gourmand }],
      }),
    ).toThrow();

    // Sans sacrifice : ni pioche ni évasion.
    let t = setup();
    t = attack(t, [gourmand]);
    t = passUntil(t, (x) => x.pending?.kind !== "priority");
    t = choose(t, []);
    t = passUntil(t, (x) => x.pending?.kind === "declareBlockers");
    expect(handSize(t, "p1")).toBe(0);
    expect(idsOf(t, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(() =>
      act(t, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(t, "p2", "battlefield", "Bear Cub"), attacker: gourmand }],
      }),
    ).not.toThrow();
  });

  it("Vampire Nighthawk : vol, contact mortel et lien de vie", () => {
    let s = scenario({ p1: { battlefield: ["Vampire Nighthawk"] }, p2: { battlefield: ["Serra Angel"] } });
    const hawk = idOf(s, "p1", "battlefield", "Vampire Nighthawk");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = attack(s, [hawk]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: hawk }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(life(s, "p1")).toBe(22);
  });

  it("Vengeful Bloodwitch : quand elle ou une autre de vos créatures meurt, l'adversaire ciblé perd 1 PV et vous gagnez 1 PV", () => {
    let s = scenario({ p1: { battlefield: ["Vengeful Bloodwitch", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
    destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
    s = settle(s);
    expect(life(s, "p2")).toBe(20);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s);
    expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
    destroy(s, idOf(s, "p1", "battlefield", "Vengeful Bloodwitch"));
    s = settle(s);
    expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
  });

  it("Venom Connoisseur : contact mortel pour lui quand une autre de vos créatures arrive ; à la deuxième résolution du tour, pour toutes vos créatures", () => {
    let s = scenario({
      p1: {
        battlefield: ["Venom Connoisseur", "Bear Cub", ...lands("Forest", 3)],
        hand: ["Llanowar Elves", "Llanowar Elves", "Llanowar Elves"],
      },
    });
    const venom = idOf(s, "p1", "battlefield", "Venom Connoisseur");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(kw(s, venom, "deathtouch")).toBe(true);
    expect(kw(s, bear, "deathtouch")).toBe(false);
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(kw(s, bear, "deathtouch")).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves").every((e) => kw(s, e, "deathtouch"))).toBe(true);
    // Troisième résolution : seulement lui ; la nouvelle créature n'a pas le contact mortel.
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves").filter((e) => kw(s, e, "deathtouch"))).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(kw(s, venom, "deathtouch")).toBe(false);
    expect(kw(s, bear, "deathtouch")).toBe(false);
  });

  it("Vile Entomber : contact mortel ; en arrivant, met une carte de votre bibliothèque dans votre cimetière", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Vile Entomber"], library: ["Forest", "Opt", "Forest"] } });
    s = settle(cast(s, "p1", "Vile Entomber"), (req, _p, cur) =>
      req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Opt") : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(2);
    expect(kw(s, idOf(s, "p1", "battlefield", "Vile Entomber"), "deathtouch")).toBe(true);
  });

  it("Volley Veteran : en arrivant, blesse une créature adverse d'autant que le nombre de Gobelins que vous contrôlez", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Goblin Smuggler", "Bear Cub"], hand: ["Volley Veteran"] },
      p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = cast(s, "p1", "Volley Veteran");
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    // Créatures adverses seulement.
    expect([...pickOptions(s)].sort()).toEqual([wurm, idOf(s, "p2", "battlefield", "Llanowar Elves")].sort());
    s = settle(s, picking([wurm]));
    // Volley Veteran et Goblin Smuggler : 2 Gobelins.
    expect(s.objects[wurm]?.damage).toBe(2);
  });

  it("Wardens of the Cycle : morbide, à votre étape de fin, gagnez 2 PV ou piochez et perdez 1 PV", () => {
    const setup = () => scenario({ p1: { battlefield: ["Wardens of the Cycle", "Bear Cub"] } });
    let s = setup();
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = untilIntent(s, "triggerMode");
    s = choose(s, ["0"]);
    s = settle(s);
    expect(life(s, "p1")).toBe(22);

    let t = setup();
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = untilIntent(t, "triggerMode");
    t = choose(t, ["1"]);
    t = settle(t);
    expect(life(t, "p1")).toBe(19);
    expect(handSize(t, "p1")).toBe(1);

    // Sans mort : rien.
    const u = toNextTurn(scenario({ step: "main2", p1: { battlefield: ["Wardens of the Cycle"] } }));
    expect(u.seen).toEqual([]);
    expect(life(u.s, "p1")).toBe(20);
    expect(handSize(u.s, "p1")).toBe(0);
  });

  it("Wildwood Scourge : arrive avec X marqueurs ; un marqueur de plus quand vous en mettez sur une autre de vos créatures non-Hydre", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), ...lands("Plains", 3), "Bear Cub"],
        hand: ["Wildwood Scourge", "Fleeting Flight", "Fleeting Flight", "Fleeting Flight"],
      },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Wildwood Scourge", { x: 3 }));
    const scourge = idOf(s, "p1", "battlefield", "Wildwood Scourge");
    expect(counterCount(s.objects[scourge] as never, "+1/+1")).toBe(3);
    let r = counterFrom(s, "p1", idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(r.s);
    expect(counterCount(s.objects[scourge] as never, "+1/+1")).toBe(4);
    expect(r.triggered).toEqual(["Wildwood Scourge"]);
    // Sur une créature adverse, ou sur lui-même : pas de déclenchement.
    r = counterFrom(s, "p1", idOf(s, "p2", "battlefield", "Llanowar Elves"));
    expect(r.triggered).toEqual([]);
    expect(counterCount(r.s.objects[scourge] as never, "+1/+1")).toBe(4);
    r = counterFrom(r.s, "p1", scourge);
    expect(r.triggered).toEqual([]);
    expect(counterCount(r.s.objects[scourge] as never, "+1/+1")).toBe(5);
    // Sur une autre Hydre : pas de déclenchement non plus.
    const h = scenario({
      p1: {
        battlefield: [
          "Plains",
          { name: "Wildwood Scourge", counters: { "+1/+1": 1 } },
          { name: "Wildwood Scourge", counters: { "+1/+1": 1 } },
        ],
        hand: ["Fleeting Flight"],
      },
    });
    expect(counterFrom(h, "p1", idsOf(h, "p1", "battlefield", "Wildwood Scourge")[0] as string).triggered).toEqual([]);
  });
});
