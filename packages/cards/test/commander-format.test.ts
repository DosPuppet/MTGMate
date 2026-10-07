/**
 * Format Commander (PLAN-E, E1) : identité de couleur (903.4) comparée à Scryfall, règles de construction (903.5 :
 * 100 cartes dont le commandant, singleton, identité, bannissements), Game Changers et tranche estimée, deck de partie.
 */
import { colorIdentity } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import edhData from "../data/edh.json";
import { buildGameDeck, CARDS, canBeCommander, DECKS, type DeckEntries, legalityIssue, validateDeck } from "../src";

const id = (name: string) => colorIdentity(CARDS[name]!).join("");

describe("identité de couleur (903.4)", () => {
  it("égale celle de Scryfall pour chaque carte du pseudo-ensemble EDH (le catalogue entier : npm run import-printings)", () => {
    for (const raw of edhData) {
      const want = ["W", "U", "B", "R", "G"].filter((c) => (raw.colorIdentity as string[]).includes(c)).join("");
      expect(id(raw.name), raw.name).toBe(want);
    }
  });

  it("coût, texte de règles, hybride, phyrexian, faces ; texte de rappel exclu ; types de terrain de base", () => {
    expect(id("Edgar Markov")).toBe("WBR");
    expect(id("Sol Ring")).toBe("");
    expect(id("Command Tower")).toBe("");
    // {3}{U/B} : hybride.
    expect(id("Helm of the Ghastlord")).toBe("UB");
    // {1}{B/P}{B/P} : phyrexian.
    expect(id("Dismember")).toBe("B");
    // Texte de règles : « {T}: Add {W} or {B}. ».
    expect(id("Caves of Koilos")).toBe("WB");
    // Rappel « ({T}: Add {R}, {W}, or {B}.) » exclu, mais types Mountain Plains Swamp.
    expect(id("Savai Triome")).toBe("WBR");
    // Carte modale : le verso (terrain {U}) compte aussi.
    expect(id("Sink into Stupor // Soporific Springs")).toBe("U");
    // Rappel de convocation et de folie sans symbole coloré hors du coût.
    expect(id("Markov Baron")).toBe("B");
    expect(id("Forest")).toBe("G");
  });
});

describe("règles de construction du Commander (903.5)", () => {
  const edgar = DECKS.find((d) => d.id === "cmd-edgar-markov")!;
  const yshtola = DECKS.find((d) => d.id === "cmd-yshtola")!;
  const urDragon = DECKS.find((d) => d.id === "cmd-ur-dragon")!;
  const rakdos = DECKS.find((d) => d.id === "cmd-rakdos")!;
  const multiverse = DECKS.find((d) => d.id === "cmd-multiverse-reforged")!;
  const turtles = DECKS.find((d) => d.id === "cmd-turtle-power")!;

  it("les préconstruits sont légaux ; Game Changers et tranche estimée", () => {
    for (const d of [edgar, yshtola, urDragon, rakdos, multiverse, turtles]) {
      const v = validateDeck(d, CARDS, "commander");
      expect(v.errors, d.id).toEqual([]);
      expect(v.legal).toBe(true);
      expect(v.mainCount).toBe(100);
      expect(v.minMain).toBe(100);
    }
    const e = validateDeck(edgar, CARDS, "commander");
    expect(e.commanders).toEqual(["Edgar Markov"]);
    expect(e.identity).toEqual(["W", "B", "R"]);
    expect(e.gameChangers?.sort()).toEqual([
      "Bolas's Citadel",
      "Demonic Tutor",
      "Smothering Tithe",
      "Teferi's Protection",
      "Vampiric Tutor",
    ]);
    expect(e.bracket).toBe("4+");
    const y = validateDeck(yshtola, CARDS, "commander");
    expect(y.identity).toEqual(["W", "U", "B"]);
    expect(y.gameChangers).toHaveLength(13);
    const u = validateDeck(urDragon, CARDS, "commander");
    expect(u.commanders).toEqual(["The Ur-Dragon"]);
    expect(u.identity).toEqual(["W", "U", "B", "R", "G"]);
    expect(u.gameChangers?.sort()).toEqual([
      "Chrome Mox",
      "Demonic Tutor",
      "Mana Vault",
      "Mox Diamond",
      "Smothering Tithe",
      "Teferi's Protection",
      "The One Ring",
    ]);
    expect(u.bracket).toBe("4+");
    const r = validateDeck(rakdos, CARDS, "commander");
    expect(r.commanders).toEqual(["Rakdos, Lord of Riots"]);
    expect(r.identity).toEqual(["B", "R"]);
    expect(r.gameChangers?.sort()).toEqual(["Demonic Tutor", "Vampiric Tutor"]);
    expect(r.bracket).toBe("3");
    // Préconstruits officiels : aucun Game Changer.
    const m = validateDeck(multiverse, CARDS, "commander");
    expect(m.commanders).toEqual(["Jace, Multiverse Architect"]);
    expect(m.identity).toEqual(["W", "U", "B", "R"]);
    expect(m.gameChangers).toEqual([]);
    expect(m.bracket).toBe("1–2");
    const t = validateDeck(turtles, CARDS, "commander");
    expect(t.commanders).toEqual(["Heroes in a Half Shell"]);
    expect(t.identity).toEqual(["W", "U", "B", "R", "G"]);
    expect(t.gameChangers).toEqual([]);
  });

  const base = (): { commander: DeckEntries; main: DeckEntries } => ({
    commander: [[1, "Edgar Markov"]],
    main: edgar.main.map((e) => [...e] as typeof e),
  });
  const replace = (main: DeckEntries, from: string, to: string): DeckEntries =>
    main.map(([n, name]) => [n, name === from ? to : name]);

  it("commandant manquant, deux commandants, commandant non légendaire", () => {
    expect(validateDeck({ main: base().main }, CARDS, "commander").errors).toContain("Choisissez un commandant");
    const two = {
      ...base(),
      commander: [
        [1, "Edgar Markov"],
        [1, "Elenda, the Dusk Rose"],
      ] as DeckEntries,
    };
    expect(validateDeck(two, CARDS, "commander").errors[0]).toMatch(/Paire de commandants/);
    const notLegend = { commander: [[1, "Blood Artist"]] as DeckEntries, main: replace(base().main, "Blood Artist", "Swamp") };
    expect(validateDeck(notLegend, CARDS, "commander").errors).toContain(
      "Blood Artist ne peut pas être votre commandant (créature légendaire attendue)",
    );
    expect(canBeCommander(CARDS["Y'shtola, Night's Blessed"]!)).toBe(true);
    expect(canBeCommander(CARDS["Sorin, Imperious Bloodlord"]!)).toBe(false);
  });

  it("exactement 100 cartes ; un seul exemplaire sauf les terrains de base ; pas de réserve", () => {
    const short = { ...base(), main: base().main.filter(([, n]) => n !== "Blood Artist") };
    expect(validateDeck(short, CARDS, "commander").errors).toContain(
      "Le deck contient 99 cartes, commandant compris (il en faut exactement 100)",
    );
    const twice = { ...base(), main: replace(base().main, "Viscera Seer", "Blood Artist") };
    expect(validateDeck(twice, CARDS, "commander").errors).toContain("Blood Artist : 2 exemplaires (un seul en Commander)");
    // Six Marais : des terrains de base, permis.
    expect(validateDeck(base(), CARDS, "commander").errors).toEqual([]);
    const side = { ...base(), sideboard: [[1, "Shivan Dragon"]] as DeckEntries };
    expect(validateDeck(side, CARDS, "commander").errors).toContain("Pas de réserve en Commander");
  });

  it("identité de couleur du commandant ; bannissements de commander.json", () => {
    const blue = { ...base(), main: replace(base().main, "Blood Artist", "Counterspell") };
    expect(validateDeck(blue, CARDS, "commander").errors).toContain(
      "Counterspell est hors de l'identité de couleur du commandant",
    );
    // Un terrain de base hors identité aussi (Island).
    const island = { ...base(), main: replace(base().main, "Blood Artist", "Island") };
    expect(validateDeck(island, CARDS, "commander").errors).toContain("Island est hors de l'identité de couleur du commandant");
    expect(legalityIssue(CARDS["Mana Crypt"]!, "commander")).toBe("Mana Crypt est bannie en Commander");
    expect(legalityIssue(CARDS["Sol Ring"]!, "commander")).toBeUndefined();
    const banned = { ...base(), main: replace(base().main, "Sol Ring", "Mana Crypt") };
    expect(validateDeck(banned, CARDS, "commander").errors).toContain("Mana Crypt est bannie en Commander");
  });

  it("deck de partie : le commandant d'abord, son indice, puis les 99 autres cartes", () => {
    const g = buildGameDeck(edgar);
    expect(g.deck).toHaveLength(100);
    expect(g.commanders).toEqual([0]);
    expect(g.deck[0]?.name).toBe("Edgar Markov");
    expect(buildGameDeck({ main: [[2, "Forest"]] }).commanders).toBeUndefined();
  });
});
