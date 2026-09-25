import { describe, expect, it } from "vitest";
import { fx, ref, spell, target } from "../src/dsl";
import { chars } from "../src/state";
import { act, customCard, idOf, passBoth, passUntil, scenario } from "./helpers";

/** « La créature ciblée devient 0/1 et perd toutes ses capacités jusqu'à la fin du tour. » */
const HEX = customCard({
  name: "Maléfice",
  typeLine: "Instant",
  types: ["Instant"],
  spell: spell([target.creature()], [fx.modify(ref.target(), { setPower: 0, setToughness: 1, loseAllAbilities: true })]),
});

describe("couches (613)", () => {
  it("seigneur : les autres Elfes gagnent +1/+1, pas le seigneur lui-même", () => {
    const s = scenario({ p1: { battlefield: ["Imperious Perfect", "Llanowar Elves", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Imperious Perfect")).power).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("les effets suivent le seigneur : il quitte le jeu, le bonus disparaît", () => {
    let s = scenario({
      p1: { battlefield: ["Imperious Perfect", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      active: "p2",
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "Burst Lightning"),
      targets: { t: [idOf(s, "p1", "battlefield", "Imperious Perfect")] },
    });
    s = passBoth(s);
    expect(chars(s, elves).power).toBe(1);
  });

  it("7b puis 7c : « devient 0/1 » s'applique avant les marqueurs et le seigneur", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Imperious Perfect", "Llanowar Elves"], hand: [HEX] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = {
      ...s,
      objects: { ...s.objects, [elves]: { ...s.objects[elves]!, counters: { p1p1: 1, m1m1: 0 } } },
      version: s.version + 1,
    };
    expect(chars(s, elves).power).toBe(3); // 1 + 1 marqueur + 1 seigneur
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Maléfice"), targets: { t: [elves] } });
    s = passBoth(s);
    // 0/1 (7b) + marqueur (7c) + seigneur (7c) = 2/3 ; la capacité de mana est perdue (couche 6).
    expect(chars(s, elves)).toMatchObject({ power: 2, toughness: 3, abilities: [] });
  });

  it("capacité conditionnelle : Kargan a le vol seulement avec un Dragon", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain").concat("Kargan Dragonrider"), hand: ["Dragon Trainer"] } });
    const kargan = idOf(s, "p1", "battlefield", "Kargan Dragonrider");
    expect(chars(s, kargan).keywords).not.toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Trainer") });
    s = passBoth(s); // le Dresseur arrive
    s = passBoth(s); // son déclenchement crée le Dragon
    expect(chars(s, kargan).keywords).toContain("flying");
  });

  it("« créatures attaquantes » : Goblin Oriflamme ne compte qu'en attaque", () => {
    let s = scenario({ p1: { battlefield: ["Goblin Oriflamme", "Swab Goblin"] } });
    const g = idOf(s, "p1", "battlefield", "Swab Goblin");
    expect(chars(s, g).power).toBe(2);
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: g, defender: "p2" }] });
    expect(chars(s, g).power).toBe(3);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(chars(s, g).power).toBe(2);
  });

  it("donner une capacité aux autres : Aggressive Mammoth donne le piétinement", () => {
    const s = scenario({ p1: { battlefield: ["Aggressive Mammoth", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
  });
});

describe("remplacements et prévention (614–615)", () => {
  it("« exilez-la à la place » : Obliterating Bolt exile la créature qui meurt", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Obliterating Bolt"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    // Pelakka Wurm fait 7/7 : on le blesse d'abord pour que 4 blessures suffisent.
    s = { ...s, objects: { ...s.objects, [wurm]: { ...s.objects[wurm]!, damage: 3 } } };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Obliterating Bolt"), targets: { t: [wurm] } });
    s = passBoth(s);
    expect(s.exile).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    // Exilée, elle n'est pas « morte » : pas de pioche de Pelakka Wurm.
    expect(s.stack).toHaveLength(0);
  });

  it("arrive avec des marqueurs (raid) et « double ses marqueurs » (landfall)", () => {
    let s = scenario({ step: "main2", p1: { battlefield: Array(3).fill("Mountain"), hand: ["Goblin Boarders"] } });
    s = { ...s, turn: { ...s.turn, attacked: true } };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Goblin Boarders") });
    s = passBoth(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Goblin Boarders")).power).toBe(4);

    let t = scenario({ p1: { battlefield: Array(3).fill("Forest"), hand: ["Mossborn Hydra", "Forest"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Mossborn Hydra") });
    t = passBoth(t);
    const hydra = idOf(t, "p1", "battlefield", "Mossborn Hydra");
    expect(chars(t, hydra).power).toBe(1);
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Forest") });
    t = passBoth(t);
    expect(chars(t, hydra).power).toBe(2);
  });

  it("arrive engagé : Diregraf Ghoul", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Diregraf Ghoul"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Diregraf Ghoul") });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Diregraf Ghoul")]?.tapped).toBe(true);
  });

  it("prévention : Fleeting Flight empêche les blessures de combat infligées à la créature", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: fire, defender: "p1" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: fire }] });
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fleeting Flight"), targets: { t: [bear] } });
    s = passBoth(s);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[bear]).toBeDefined();
    expect(s.objects[bear]?.damage).toBe(0);
  });
});
