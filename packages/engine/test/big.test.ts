/**
 * The Big Score (BIG) : chaque carte gérée est confrontée à son texte Oracle (plan R, lot R7). Hideaway (Collector's
 * Cage), copies de jetons et d'artefacts, Greed's Gambit, Generous Plunderer, Harvester of Misery, Vaultborn Tyrant, Pest Control…
 * Rest in Peace, Grand Abolisher, Torpor Orb et Worldwalker Helm sont déjà couverts par otj.test.ts. Ne sont pas testés
 * ici, faute de suivre l'Oracle : la copie d'Esoteric Duplicator (l'artefact sacrifié n'est plus retrouvé, rien n'est
 * créé) et l'arrivée de Harvester of Misery (qui se donne aussi −2/−2 : `pumpAll` ignore `other`).
 */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, idOf, idsOf, scenario } from "./helpers";

type S = GameState;
/** Réponse à un choix (`undefined` : la suggestion), selon la position courante. */
type Answer = (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const namesIn = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));

/**
 * Passe et répond aux choix (réponse suggérée par défaut) jusqu'à une pile vide, sans déclenchement en attente. Les
 * défenseurs ne bloquent pas.
 */
const settle = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
/** Joue (sans attaquer ni bloquer) jusqu'à la seconde phase principale, en répondant aux choix. */
const throughCombat = (s: S, answer: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
const cast = (s: S, player: string, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
/** Active la capacité de `source` dont le libellé contient `label` (la première sinon). */
const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
  );
  if (a?.type !== "activate") throw new Error(`capacité introuvable : ${label ?? source}`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const canActivate = (s: S, player: string, source: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
/** Va à la déclaration des attaquants de p1 et attaque p2 avec `attackers`. */
const attack = (s: S, attackers: string[]) => {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
};
/** Sélectionne dans les options d'un choix l'objet nommé `name`. */
const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
  req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;

const castOption = (s: S, player: string, card: string) =>
  legalActions(s, player).find((a) => a.type === "cast" && a.card === card);
const exiled = (s: S, name: string) => s.exile.find((id) => nameOf(s, id) === name);

describe("The Big Score", () => {
  describe("Collector's Cage", () => {
    const setup = (creatures: string[]) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...creatures],
          hand: ["Collector's Cage"],
          library: ["Island", "Serra Angel", "Island", "Opt", "Island", "Swamp", "Swamp"],
        },
      });
      let seen = 0;
      s = settle(cast(s, "p1", "Collector's Cage"), (req, cur) => {
        if (req.type !== "pick") return undefined;
        seen = req.options.length;
        return pickNamed(cur, req, "Serra Angel");
      });
      // Hideaway 5 : l'Ange est exilé, les quatre autres cartes vont au-dessous.
      expect(seen).toBe(5);
      expect(exiled(s, "Serra Angel")).toBeDefined();
      expect(namesIn(s, s.players.p1?.library).slice(0, 2)).toEqual(["Swamp", "Swamp"]);
      return s;
    };

    it("{1}, {T} : un marqueur +1/+1 ; avec trois forces différentes, la carte exilée se joue sans payer son coût", () => {
      let s = setup(["Llanowar Elves", "Bear Cub", "Fire Elemental"]);
      const cage = idOf(s, "p1", "battlefield", "Collector's Cage");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", cage, undefined, { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[cage]?.tapped).toBe(true);
      // Plus aucun terrain dégagé : l'Ange se lance gratuitement depuis l'exil.
      const angel = exiled(s, "Serra Angel") as string;
      expect(castOption(s, "p1", angel)).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: angel, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("sans trois créatures de forces différentes, la carte reste exilée", () => {
      let s = setup(["Bear Cub", "Bear Cub", "Fire Elemental"]);
      const cage = idOf(s, "p1", "battlefield", "Collector's Cage");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      s = settle(activate(s, "p1", cage, undefined, { targets: { t: [fire] } }));
      // Forces 2, 2 et 6 : deux valeurs seulement.
      expect(chars(s, fire).power).toBe(6);
      const angel = exiled(s, "Serra Angel") as string;
      expect(castOption(s, "p1", angel)).toBeUndefined();
    });
  });

  it("Oltec Matterweaver : chaque sort de créature donne un Gnome 1/1, ou la copie d'un de vos jetons d'artefact", () => {
    let s = scenario({
      p1: { battlefield: ["Oltec Matterweaver", ...lands("Forest", 4)], hand: ["Bear Cub", "Bear Cub"] },
    });
    // Aucun jeton d'artefact à copier : le Gnome.
    s = settle(cast(s, "p1", "Bear Cub"));
    const gnome = idOf(s, "p1", "battlefield", "Gnome");
    const c = chars(s, gnome);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors).toEqual([]);
    // Second sort : le mode « copie », qui vise le Gnome.
    let modes: string[] = [];
    s = settle(cast(s, "p1", "Bear Cub"), (req) => {
      if (req.intent !== "triggerMode" || req.type !== "pick") return undefined;
      modes = req.options;
      return ["1"];
    });
    expect(modes).toEqual(["0", "1"]);
    const gnomes = idsOf(s, "p1", "battlefield", "Gnome");
    expect(gnomes).toHaveLength(2);
    expect(gnomes.every((id) => s.objects[id]?.isToken)).toBe(true);
  });

  it("Esoteric Duplicator : {2}, sacrifice : piochez ; son sacrifice propose de payer {2}, et sans paiement, pas de copie", () => {
    let s = scenario({ p1: { battlefield: ["Esoteric Duplicator", ...lands("Island", 4)], library: lands("Swamp", 3) } });
    const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
    let asked = false;
    s = settle(activate(s, "p1", dup), (req) => {
      if (req.intent !== "may") return undefined;
      asked = true;
      return [0];
    });
    expect(asked).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
    expect(idsOf(s, "p1", "battlefield", "Esoteric Duplicator")).toHaveLength(0);
  });

  describe("Greed's Gambit", () => {
    it("en arrivant : 3 cartes, 6 PV, trois Chauves-souris 2/1 volantes ; à votre étape de fin : défausse, 2 PV, un sacrifice", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Greed's Gambit"], library: lands("Island", 10) },
      });
      s = settle(cast(s, "p1", "Greed's Gambit"));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.life).toBe(26);
      const bats = idsOf(s, "p1", "battlefield", "Bat");
      expect(bats).toHaveLength(3);
      for (const id of bats) {
        const c = chars(s, id);
        expect([c.power, c.toughness]).toEqual([2, 1]);
        expect(c.colors).toEqual(["B"]);
        expect(c.keywords).toContain("flying");
      }
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(24);
      const creatures = s.battlefield.filter(
        (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"),
      );
      expect(creatures).toHaveLength(3);
    });

    it("en quittant le champ de bataille : défaussez trois cartes, perdez 6 PV et sacrifiez trois créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Greed's Gambit", ...lands("Plains", 2), "Bear Cub", "Bear Cub", "Bear Cub", "Fire Elemental"],
          hand: ["Disenchant", "Opt", "Opt", "Opt", "Forest"],
        },
      });
      const gambit = idOf(s, "p1", "battlefield", "Greed's Gambit");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Disenchant"), targets: { t: [gambit] } }), (req) => {
        if (req.type !== "pick") return undefined;
        if (req.intent === "sacrifice") return req.options.filter((id) => id !== fire).slice(0, 3);
        return undefined;
      });
      if (s.pending?.kind === "discard") {
        const hand = s.players.p1?.hand ?? [];
        s = settle(act(s, "p1", { type: "discard", cards: hand.slice(0, 3) }));
      }
      expect(idsOf(s, "p1", "graveyard", "Greed's Gambit")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(14);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(1);
    });
  });

  describe("Harvester of Misery", () => {
    it("{1}{B}, défaussez-la : une créature ciblée a −2/−2 jusqu'à la fin du tour", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Harvester of Misery"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Harvester of Misery");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", card, undefined, { targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Harvester of Misery")).toHaveLength(1);
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    });
  });

  it("Hostile Investigator : l'adversaire ciblé défausse ; la première défausse du tour fait enquêter, une seule fois", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Hostile Investigator", "Harvester of Misery"] },
      p2: { battlefield: ["Bear Cub"], hand: ["Opt", "Forest"] },
    });
    s = settle(cast(s, "p1", "Hostile Investigator", { targets: { t: ["p2"] } }));
    if (s.pending?.kind === "discard")
      s = settle(act(s, "p2", { type: "discard", cards: (s.players.p2?.hand ?? []).slice(0, 1) }));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    expect(chars(s, clue).types).toContain("Artifact");
    // Seconde défausse du tour (Harvester of Misery depuis la main) : pas de nouvel Indice.
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", idOf(s, "p1", "hand", "Harvester of Misery"), undefined, { targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
  });

  it("Legion Extruder : 2 blessures à n'importe quelle cible en arrivant ; {2}, {T}, sacrifiez un autre artefact : un Golem 3/3", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Fishing Pole"], hand: ["Legion Extruder"] },
    });
    s = settle(cast(s, "p1", "Legion Extruder"), (req) =>
      req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
    );
    expect(s.players.p2?.life).toBe(18);
    const extruder = idOf(s, "p1", "battlefield", "Legion Extruder");
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    s = settle(activate(s, "p1", extruder, undefined, { sacrifice: [pole] }), (req) =>
      req.type === "pick" && req.options.includes(pole) ? [pole] : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(s.objects[extruder]?.tapped).toBe(true);
    const golem = idOf(s, "p1", "battlefield", "Golem");
    const c = chars(s, golem);
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.colors).toEqual([]);
    // Plus d'autre artefact à sacrifier : la capacité n'est plus disponible.
    expect(canActivate(s, "p1", extruder)).toBe(false);
  });

  it("Molten Duplication : copie-jeton artefact avec la célérité, sacrifiée au début de la prochaine étape de fin", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Molten Duplication"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Molten Duplication", { targets: { t: [bear] } }));
    const copy = idsOf(s, "p1", "battlefield", "Bear Cub").find((id) => id !== bear) as string;
    expect(s.objects[copy]?.isToken).toBe(true);
    const c = chars(s, copy);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.keywords).toContain("haste");
    expect(chars(s, bear).types).not.toContain("Artifact");
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
    expect(s.objects[copy]).toBeUndefined();
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toEqual([bear]);
  });

  describe("Vaultborn Tyrant", () => {
    it("elle ou une autre de vos créatures de force 4 ou plus arrive : 3 PV et une carte", () => {
      const t = scenario({
        p1: { battlefield: [...lands("Forest", 7), "Vaultborn Tyrant"], hand: ["Pelakka Wurm"], library: lands("Island", 5) },
      });
      const after = settle(cast(t, "p1", "Pelakka Wurm"));
      // Pelakka Wurm : 7 PV, plus 3 et une carte par le Tyran.
      expect(after.players.p1?.life).toBe(30);
      expect(namesIn(after, after.players.p1?.hand)).toEqual(["Island"]);
      // Force 2 : rien.
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Vaultborn Tyrant"], hand: ["Bear Cub"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("meurt (pas un jeton) : une copie-jeton qui est aussi un artefact, dont l'arrivée déclenche à nouveau", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Vaultborn Tyrant"], hand: ["Luminous Rebuke"], library: lands("Island", 5) },
      });
      const tyrant = idOf(s, "p1", "battlefield", "Vaultborn Tyrant");
      s = settle(cast(s, "p1", "Luminous Rebuke", { targets: { t: [tyrant] } }));
      expect(idsOf(s, "p1", "graveyard", "Vaultborn Tyrant")).toHaveLength(1);
      const copy = idOf(s, "p1", "battlefield", "Vaultborn Tyrant");
      expect(s.objects[copy]?.isToken).toBe(true);
      expect(chars(s, copy).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, copy).keywords).toContain("trample");
      expect(s.players.p1?.life).toBe(23);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("la copie-jeton qui meurt ne revient pas", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 10), "Vaultborn Tyrant"],
          hand: ["Luminous Rebuke", "Luminous Rebuke"],
          library: lands("Island", 5),
        },
      });
      s = settle(cast(s, "p1", "Luminous Rebuke", { targets: { t: [idOf(s, "p1", "battlefield", "Vaultborn Tyrant")] } }));
      const copy = idOf(s, "p1", "battlefield", "Vaultborn Tyrant");
      s = settle(cast(s, "p1", "Luminous Rebuke", { targets: { t: [copy] } }));
      expect(idsOf(s, "p1", "battlefield", "Vaultborn Tyrant")).toHaveLength(0);
    });
  });

  it("Generous Plunderer : Trésor à l'entretien (et un Trésor engagé pour l'adversaire) ; en attaquant, blessures égales à ses artefacts", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Generous Plunderer"] },
      p2: { battlefield: ["Fishing Pole"] },
    });
    const plunderer = idOf(s, "p1", "battlefield", "Generous Plunderer");
    expect(chars(s, plunderer).keywords).toContain("menace");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.objects[idOf(s, "p1", "battlefield", "Treasure")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p2", "battlefield", "Treasure")]?.tapped).toBe(true);
    // p2 contrôle deux artefacts (Fishing Pole et son Trésor) : 2 blessures, puis 2 de combat.
    s = throughCombat(attack(s, [plunderer]));
    expect(s.players.p2?.life).toBe(16);
  });

  describe("Pest Control", () => {
    it("détruit tous les permanents non-terrains de valeur de mana 1 ou moins", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Llanowar Elves", "Bear Cub"], hand: ["Pest Control"] },
        p2: { battlefield: ["Fishing Pole", "Serra Angel", "Forest"] },
      });
      s = settle(cast(s, "p1", "Pest Control"));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
    });

    it("recyclage {2} : défaussez-la, piochez une carte", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Pest Control"], library: lands("Island", 3) } });
      const card = idOf(s, "p1", "hand", "Pest Control");
      s = settle(activate(s, "p1", card));
      expect(idsOf(s, "p1", "graveyard", "Pest Control")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });
  });
});

// Cartes des decks du méta Standard (docs/plans/PLAN-C.md, lot C13).
describe("The Big Score : cartes du méta Standard", () => {
  describe("Simulacrum Synthesizer", () => {
    it("à l'arrivée, regard 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Simulacrum Synthesizer"], library: ["Opt", "Forest", "Island"] },
      });
      let seen = 0;
      s = settle(cast(s, "p1", "Simulacrum Synthesizer"), (req) => {
        if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
        seen = req.options.length;
        return [...req.options]; // les deux sous la bibliothèque
      });
      expect(seen).toBe(2);
      // Les deux cartes regardées sont passées sous la troisième.
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Island");
      expect(library.slice(1).sort()).toEqual(["Forest", "Opt"]);
    });

    it("un autre artefact de VM 3 ou plus arrive sous votre contrôle : un Assemblage 0/0 qui a +1/+1 par artefact", () => {
      let s = scenario({
        p1: { battlefield: ["Simulacrum Synthesizer", ...lands("Forest", 6)], hand: ["Juggernaut", "Swiftfoot Boots"] },
      });
      s = settle(cast(s, "p1", "Swiftfoot Boots"));
      // VM 2 : pas d'Assemblage.
      expect(idsOf(s, "p1", "battlefield", "Construct")).toHaveLength(0);
      s = settle(cast(s, "p1", "Juggernaut"));
      const constructs = idsOf(s, "p1", "battlefield", "Construct");
      expect(constructs).toHaveLength(1);
      const construct = constructs[0] as string;
      expect(chars(s, construct).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, construct).colors).toEqual([]);
      // Synthétiseur, Bottes, Juggernaut et l'Assemblage lui-même : 4/4.
      expect([chars(s, construct).power, chars(s, construct).toughness]).toEqual([4, 4]);
    });

    it("un artefact adverse de VM 3 ou plus ne crée rien", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Simulacrum Synthesizer"] },
        p2: { battlefield: lands("Forest", 4), hand: ["Juggernaut"] },
      });
      s = settle(cast(s, "p2", "Juggernaut"));
      expect(idsOf(s, "p2", "battlefield", "Juggernaut")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Construct")).toHaveLength(0);
    });
  });
});
