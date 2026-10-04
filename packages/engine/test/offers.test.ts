/**
 * Ce que `legalActions` propose, le moteur l'accepte (docs/plans/PLAN-C.md, lot C2). Écarts trouvés par le fuzz strict
 * (`--offers`) : chaque test rejoue la position et vérifie la règle.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { activated, fx, manaAbility, ref, target } from "../src/dsl";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ActionOption, GameState } from "../src/types";
import { act, customCard, idOf, idsOf, lands, scenario, settle } from "./helpers";

/** Artefact « {T} : ajoutez {C} » (sans se sacrifier). */
const stone = (name: string) => customCard({ name, types: ["Artifact"], typeLine: "Artifact", abilities: [manaAbility("C")] });
/** Artefact sans capacité de mana. */
const trinket = (name: string) => customCard({ name, types: ["Artifact"], typeLine: "Artifact" });
const bear = (name: string, subtypes: string[] = ["Bear"]) =>
  customCard({ name, power: 2, toughness: 2, subtypes, typeLine: `Creature — ${subtypes.join(" ")}` });

const castOption = (s: GameState, player: string, card: string) =>
  legalActions(s, player).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activations = (s: GameState, player: string, source: string) =>
  legalActions(s, player).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );

describe("options proposées, décisions acceptées", () => {
  it("« X cibles » avec X = 0 : aucune cible (601.2c, Hide on the Ceiling)", () => {
    let s = scenario({ p1: { battlefield: ["Island"], hand: ["Hide on the Ceiling"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hide on the Ceiling"), x: 0, targets: { t: [] } });
    expect(s.stack).toHaveLength(1);
  });

  it("flétrir en coût additionnel : la créature ciblée peut payer le coût (601.2h, Cinder Strike)", () => {
    const giant = customCard({ name: "Géant de test", power: 5, toughness: 5 });
    let s = scenario({ p1: { battlefield: ["Mountain", giant], hand: ["Cinder Strike"] } });
    const g = idOf(s, "p1", "battlefield", "Géant de test");
    const option = castOption(s, "p1", idOf(s, "p1", "hand", "Cinder Strike"));
    expect(option?.kickerAffordable).toBe(true);
    expect(option?.kickerPermanents).toEqual([g]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cinder Strike"), targets: { t: [g] }, kicked: true });
    expect(s.objects[g]?.counters["-1/-1"]).toBe(1);
    s = settle(s);
    // 4 blessures sur une 4/4 (5/5 avec un marqueur −1/−1) : elle meurt.
    expect(idsOf(s, "p1", "graveyard", "Géant de test")).toHaveLength(1);
  });

  it("un artefact sacrifié pour le coût peut d'abord produire son mana (601.2g, Hungering Puppetbeast)", () => {
    let s = scenario({ p1: { battlefield: ["Hungering Puppetbeast", stone("Pierre de test")] } });
    const beast = idOf(s, "p1", "battlefield", "Hungering Puppetbeast");
    const option = activations(s, "p1", beast)[0];
    expect(option).toBeDefined();
    s = act(s, "p1", { type: "activate", source: beast, ability: option?.ability ?? -1, targets: {} });
    s = settle(s);
    expect(idsOf(s, "p1", "graveyard", "Pierre de test")).toHaveLength(1);
    expect(s.objects[beast]?.counters["+1/+1"]).toBe(1);
  });

  it("payer 0 PV est toujours possible, même avec un total négatif (119.4, Herald of Eternal Dawn)", () => {
    const squire = customCard({
      name: "Écuyer de test",
      power: 1,
      toughness: 1,
      manaCost: { generic: 0, colored: { W: 1 }, x: 0 },
      manaCostText: "{W}",
      colors: ["W"],
    });
    let s = scenario({ p1: { life: -3, battlefield: ["Plains", "Herald of Eternal Dawn"], hand: [squire] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Écuyer de test"))).toBeDefined();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Écuyer de test") });
    expect(s.stack).toHaveLength(1);
  });

  it("les preuves d'un mana ne prennent pas la carte qui s'exile pour payer sa capacité (Cryptex, Sage of the Fang)", () => {
    const base = { battlefield: ["Cryptex", ...lands("Forest", 3)], graveyard: ["Sage of the Fang"] };
    let s = scenario({ p1: base, p2: { battlefield: ["Forest"] } });
    const sage = idOf(s, "p1", "graveyard", "Sage of the Fang");
    // Seule carte du cimetière : Cryptex ne peut pas réunir de preuves sans exiler Sage of the Fang.
    expect(activations(s, "p1", sage)).toEqual([]);
    expect(() =>
      act(s, "p1", { type: "activate", source: sage, ability: 1, targets: { t: [idOf(s, "p1", "battlefield", "Cryptex")] } }),
    ).toThrow(RulesError);
    // Avec une autre carte de valeur de mana 3 au cimetière, les preuves la prennent.
    s = scenario({
      p1: {
        ...base,
        battlefield: [...base.battlefield, bear("Ours de test")],
        graveyard: ["Sage of the Fang", "Lightning Strike", "Opt", "Opt"],
      },
    });
    const sage2 = idOf(s, "p1", "graveyard", "Sage of the Fang");
    const option = activations(s, "p1", sage2)[0];
    expect(option).toBeDefined();
    const bears = idOf(s, "p1", "battlefield", "Ours de test");
    s = act(s, "p1", { type: "activate", source: sage2, ability: option?.ability ?? -1, targets: { t: [bears] } });
    expect(s.exile.some((id) => s.objects[id]?.defId === card("Sage of the Fang").id)).toBe(true);
  });

  it("« payez X points de vie » : X ne dépasse pas les points de vie (Krumar Initiate)", () => {
    const s = scenario({ p1: { life: 3, battlefield: ["Krumar Initiate", ...lands("Swamp", 8)] } });
    const option = activations(s, "p1", idOf(s, "p1", "battlefield", "Krumar Initiate"))[0];
    expect(option?.xMax).toBe(3);
  });

  it("« sacrifiez un ou plusieurs artefacts » : X vaut au moins 1 (Radiant Lotus)", () => {
    const s = scenario({ p1: { battlefield: ["Radiant Lotus", trinket("Babiole de test")] } });
    const lotus = idOf(s, "p1", "battlefield", "Radiant Lotus");
    const option = activations(s, "p1", lotus)[0];
    expect(option?.xMin).toBe(1);
    expect(() =>
      act(s, "p1", { type: "activate", source: lotus, ability: option?.ability ?? -1, targets: { t: ["p1"] }, x: 0 }),
    ).toThrow(RulesError);
  });

  it("« engagez X artefacts » : ceux qui paient le mana ne comptent pas (Secluded Starforge)", () => {
    // Deux artefacts de mana paient {2} : X vaut 0. Un artefact de plus, sans mana : X vaut 1.
    const base = ["Secluded Starforge", stone("Pierre A"), stone("Pierre B"), bear("Ours de test")];
    let s = scenario({ p1: { battlefield: base } });
    const forge = () => idOf(s, "p1", "battlefield", "Secluded Starforge");
    const pump = () => activations(s, "p1", forge()).find((a) => a.targets.length > 0);
    expect(pump()?.xMax ?? 0).toBe(0);
    s = scenario({ p1: { battlefield: [...base, trinket("Babiole de test")] } });
    expect(pump()?.xMax).toBe(1);
    const bears = idOf(s, "p1", "battlefield", "Ours de test");
    s = act(s, "p1", { type: "activate", source: forge(), ability: pump()?.ability ?? -1, targets: { t: [bears] }, x: 1 });
    expect(s.objects[idOf(s, "p1", "battlefield", "Babiole de test")]?.tapped).toBe(true);
  });

  it("« ce sort coûte {3} de moins s'il cible une créature engagée » : seules les cibles engagées si c'est nécessaire (Luminous Rebuke)", () => {
    const s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Luminous Rebuke"] },
      p2: { battlefield: [{ name: bear("Ours engagé"), tapped: true }, bear("Ours dégagé")] },
    });
    const option = castOption(s, "p1", idOf(s, "p1", "hand", "Luminous Rebuke"));
    expect(option?.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Ours engagé")]);
  });

  it("« {W}{U} de plus par cible au-delà de la première » : pas plus de cibles que le mana n'en permet (Officious Interrogation)", () => {
    const s = scenario({ p1: { battlefield: ["Plains", "Island"], hand: ["Officious Interrogation"] } });
    const option = castOption(s, "p1", idOf(s, "p1", "hand", "Officious Interrogation"));
    expect(option?.modes[0]?.targets[0]?.count ?? 1).toBe(1);
  });

  it("deux cibles qui partagent un type de créature : pas proposé sans une telle paire (Secret Tunnel)", () => {
    const base = ["Secret Tunnel", ...lands("Forest", 4)];
    let s = scenario({ p1: { battlefield: [...base, bear("Ours A"), bear("Loup B", ["Wolf"])] } });
    const tunnel = () => idOf(s, "p1", "battlefield", "Secret Tunnel");
    expect(activations(s, "p1", tunnel()).some((a) => a.targets.length > 0)).toBe(false);
    s = scenario({ p1: { battlefield: [...base, bear("Ours A"), bear("Ours B")] } });
    expect(activations(s, "p1", tunnel()).some((a) => a.targets.length > 0)).toBe(true);
  });

  it("une capacité de mana sans couleur possible n'est pas proposée (106.7, Pit of Offerings)", () => {
    const s = scenario({ p1: { battlefield: ["Pit of Offerings"] } });
    const pit = idOf(s, "p1", "battlefield", "Pit of Offerings");
    const taps = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === pit);
    expect(taps.map((a) => (a.type === "tapForMana" ? a.colors : []))).toEqual([["C"]]);
    expect(chars(s, pit).name).toBe("Pit of Offerings");
  });

  it("deux Springleaf Drum se partagent la créature à engager (paiement)", () => {
    const spell = customCard({
      name: "Sort de test",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 2, colored: { W: 1 }, x: 0 },
      manaCostText: "{2}{W}",
      colors: ["W"],
    });
    const base = ["Plains", "Springleaf Drum", "Springleaf Drum", bear("Ours A")];
    let s = scenario({ p1: { battlefield: base, hand: [spell] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Sort de test"))).toBeUndefined();
    s = scenario({ p1: { battlefield: [...base, bear("Ours B")], hand: [spell] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Sort de test"))).toBeDefined();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sort de test") });
    expect(s.stack).toHaveLength(1);
  });

  it("harmonie : par défaut, une créature sans capacité de mana (la créature-terrain paie le reste)", () => {
    const reef = customCard({
      name: "Récif de test",
      types: ["Land", "Creature"],
      typeLine: "Land Creature",
      power: 4,
      toughness: 4,
      abilities: [manaAbility("U")],
    });
    const giant = customCard({ name: "Géant de test", power: 9, toughness: 9 });
    let s = scenario({ p1: { battlefield: [reef, giant], graveyard: ["Winternight Stories"] } });
    const stories = idOf(s, "p1", "graveyard", "Winternight Stories");
    const option = castOption(s, "p1", stories);
    expect(option?.additional?.tap?.suggested).toEqual([idOf(s, "p1", "battlefield", "Géant de test")]);
    s = act(s, "p1", { type: "cast", card: stories });
    expect(s.stack).toHaveLength(1);
  });

  it("« entre zéro et deux cibles » (`minCount: 0`) : l'activation sans cible est acceptée", () => {
    const hearse = customCard({
      name: "Corbillard de test",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [
        activated({
          tap: true,
          targets: [target.between(0, 2, target.cardInGraveyard("t", {}, "any"))],
          effects: [fx.exileCard(ref.target())],
        }),
      ],
    });
    let s = scenario({ p1: { battlefield: [hearse] } });
    const source = idOf(s, "p1", "battlefield", "Corbillard de test");
    expect(activations(s, "p1", source)).toHaveLength(1);
    s = act(s, "p1", { type: "activate", source, ability: 0, targets: { t: [] } });
    expect(s.stack).toHaveLength(1);
  });

  it("émerger : la créature sacrifiée ne paie pas le mana du coût alternatif (Cresting Mosasaurus)", () => {
    const alt = (s: GameState) => castOption(s, "p1", idOf(s, "p1", "hand", "Cresting Mosasaurus"))?.altAvailable;
    // {6}{U} moins 1 (Llanowar Elves) : six mana, sans celui des Elfes sacrifiés.
    let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Llanowar Elves"], hand: ["Cresting Mosasaurus"] } });
    expect(alt(s)).toBeFalsy();
    s = scenario({ p1: { battlefield: [...lands("Island", 6), "Llanowar Elves"], hand: ["Cresting Mosasaurus"] } });
    expect(alt(s)).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cresting Mosasaurus"), alternative: true });
    expect(s.stack).toHaveLength(1);
  });
});
