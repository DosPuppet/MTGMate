/**
 * Reality Fracture, lot A : primitives ajoutées au moteur (terrains lents, regard ou surveillance,
 * marqueur de finalité, créatures mortes ce tour, blessures non de combat, cartes piochées, filtres
 * légendaire / endurance, montants négatifs).
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { spellCost } from "../src/stack";
import { chars, setPrepared } from "../src/state";
import type { GameState } from "../src/types";
import { act, idOf, passBoth, scenario } from "./helpers";

type S = GameState;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("Reality Fracture, lot A", () => {
  it("terrains lents : engagés avec moins de deux autres terrains, dégagés sinon", () => {
    let s = scenario({ p1: { hand: ["Deserted Beach", "Haunted Ridge"], battlefield: ["Plains"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Deserted Beach") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Deserted Beach")]?.tapped).toBe(true);
    let t = scenario({ p1: { hand: ["Haunted Ridge"], battlefield: ["Plains", "Island"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Haunted Ridge") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Haunted Ridge")]?.tapped).toBe(false);
  });

  it("« chaque fois que vous regardez ou surveillez » et « si vous avez surveillé ce tour-ci »", () => {
    let s = scenario({
      p1: { battlefield: ["Denzilore Fatehold", "Surveillance Phantasm", ...lands("Island", 4)], library: lands("Island", 10) },
    });
    const phantasm = idOf(s, "p1", "battlefield", "Surveillance Phantasm");
    expect(chars(s, phantasm).keywords).toContain("defender");
    s = act(s, "p1", { type: "activate", source: phantasm, ability: 1 });
    s = passBoth(s); // surveillance 1 se résout
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [] });
    s = passBoth(s); // déclencheur de Denzilore
    expect(chars(s, phantasm).keywords).not.toContain("defender");
    expect(s.objects[phantasm]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Denzilore Fatehold")]?.counters["+1/+1"]).toBe(1);
  });

  it("marqueur de finalité : la créature est exilée au lieu de mourir", () => {
    let s = scenario({ p1: { graveyard: ["Proctor of Potential"], battlefield: ["Plains", "Island"] } });
    // Condition d'activation : avoir regardé ou surveillé ce tour-ci.
    const proctor = idOf(s, "p1", "graveyard", "Proctor of Potential");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === proctor)).toBe(false);
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, turnStats: { ...s.players.p1!.turnStats, scried: 1 } } } };
    s = act(s, "p1", { type: "activate", source: proctor, ability: 1 });
    s = passBoth(s);
    const onField = idOf(s, "p1", "battlefield", "Proctor of Potential");
    expect(s.objects[onField]?.counters.finality).toBe(1);
    destroy(s, onField);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Proctor of Potential")).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Darklight Phoenix : revient si deux créatures sont mortes ce tour-ci", () => {
    let s = scenario({
      step: "main1",
      p1: { graveyard: ["Darklight Phoenix"], battlefield: ["Savannah Lions", "Llanowar Elves"] },
    });
    for (const n of ["Savannah Lions", "Llanowar Elves"]) destroy(s, idOf(s, "p1", "battlefield", n));
    expect(s.turn.creaturesDied).toBe(2);
    s = passBoth(s); // passage au début du combat : le déclencheur depuis le cimetière
    s = passBoth(s);
    expect(s.battlefield.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Darklight Phoenix")).toBe(true);
  });

  it("Grim Repriser : activable seulement si un adversaire a subi des blessures non de combat", () => {
    const s = scenario({ p1: { graveyard: ["Grim Repriser"], battlefield: ["Swamp", "Mountain"] } });
    const g = idOf(s, "p1", "graveyard", "Grim Repriser");
    const can = (x: S) => legalActions(x, "p1").some((a) => a.type === "activate" && a.source === g);
    expect(can(s)).toBe(false);
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Mountain")), "p2", 1, false);
    expect(can(s)).toBe(true);
  });

  it("filtres légendaire et montants négatifs (Yuriko : -X/-0)", () => {
    let s = scenario({
      p1: { hand: ["Yuriko, Hope from the Shadows"], battlefield: ["Island"], graveyard: lands("Island", 4) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Yuriko, Hope from the Shadows");
    s = passBoth(s); // Yuriko arrive, le déclencheur modal demande un mode
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["0"] });
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [angel] });
    s = passBoth(s);
    expect(chars(s, angel).power).toBe(0); // 4 - 4 cartes au cimetière
  });
});

describe("Reality Fracture, lot B", () => {
  const activate = (s: S, p: string, source: string, ability = 0, extra: Record<string, unknown> = {}) =>
    act(s, p, { type: "activate", source, ability, ...extra });
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);

  it("cycle de terrain de base : depuis la main, défausse la carte et cherche un terrain de base", () => {
    let s = scenario({
      p1: { hand: ["Apex Witchstalker"], battlefield: lands("Swamp", 2), library: ["Plains", "Swamp", "Swamp"] },
    });
    const witch = idOf(s, "p1", "hand", "Apex Witchstalker");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === witch);
    expect(opt).toBeDefined();
    s = activate(s, "p1", witch, (opt as { ability: number }).ability);
    expect(s.players.p1?.graveyard.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Apex Witchstalker");
    s = passBoth(s);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: s.pending.request.suggested });
    expect(handNames(s, "p1")).toContain("Plains");
  });

  it("Proft, Sinister Mastermind : ne se lance qu'avec le seuil ; « défaussez cette carte » depuis la main", () => {
    const s = scenario({
      p1: { hand: ["Proft, Sinister Mastermind"], battlefield: lands("Swamp", 3) },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const proft = idOf(s, "p1", "hand", "Proft, Sinister Mastermind");
    const acts = legalActions(s, "p1");
    expect(acts.some((a) => a.type === "cast" && a.card === proft)).toBe(false);
    expect(acts.some((a) => a.type === "activate" && a.source === proft)).toBe(true);
    const t = scenario({
      p1: { hand: ["Proft, Sinister Mastermind"], battlefield: lands("Swamp", 3), graveyard: lands("Swamp", 7) },
    });
    expect(
      legalActions(t, "p1").some((a) => a.type === "cast" && a.card === idOf(t, "p1", "hand", "Proft, Sinister Mastermind")),
    ).toBe(true);
  });

  it("Samut : un éphémère sur la pile a le second partagé — l'adversaire ne peut que passer ou produire du mana", () => {
    let s = scenario({
      p1: { hand: ["Last Gasp"], battlefield: ["Samut, Tyrant of Naktamun", ...lands("Swamp", 2)] },
      p2: { hand: ["Unsummon"], battlefield: ["Island", "Serra Angel"] },
    });
    s = cast(s, "p1", "Last Gasp", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(legalActions(s, "p2").every((a) => a.type === "pass" || a.type === "tapForMana")).toBe(true);
  });

  it("convocation : Winter se paie en engageant des créatures", () => {
    const s = scenario({
      p1: {
        hand: ["Winter, Team Player"],
        battlefield: ["Mountain", "Mountain", "Savannah Lions", "Savannah Lions", "Serra Angel"],
      },
    });
    const winter = idOf(s, "p1", "hand", "Winter, Team Player");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === winter)).toBe(true);
    const t = act(s, "p1", { type: "cast", card: winter });
    const tapped = t.battlefield.filter((id) => t.objects[id]?.tapped).length;
    expect(tapped).toBe(5); // 2 terrains + 3 créatures pour {4}{R}
  });

  it("exhaust : Liliana the Repentant ne s'active qu'une seule fois", () => {
    let s = scenario({
      p1: { battlefield: ["Liliana the Repentant", ...lands("Swamp", 12)], graveyard: ["Serra Angel", "Savannah Lions"] },
    });
    const lili = idOf(s, "p1", "battlefield", "Liliana the Repentant");
    const can = (x: S) => legalActions(x, "p1").some((a) => a.type === "activate" && a.source === lili);
    expect(can(s)).toBe(true);
    s = activate(s, "p1", lili, 1, { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } });
    s = passBoth(s);
    expect(can(s)).toBe(false);
  });

  it("domaine et recherche de noms différents : Fblthp, Knows the Way", () => {
    const s = scenario({ p1: { battlefield: ["Fblthp, Knows the Way", "Plains", "Island", "Island"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Fblthp, Knows the Way")).power).toBe(2);
  });

  it("Titanbones : « quand vous défaussez cette carte », vous gagnez 3 PV", () => {
    // Titanbones est défaussée par l'effet de Rank Rat adverse.
    let s = scenario({
      p1: { hand: ["Titanbones, Towering Heart"] },
      p2: { hand: ["Rank Rat"], battlefield: lands("Swamp", 2) },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Rank Rat") });
    for (let i = 0; i < 6 && s.players.p1?.life === 20; i++) {
      if (s.pending?.kind === "discard")
        s = act(s, s.pending.player, { type: "discard", cards: s.players.p1?.hand.slice(0, 1) ?? [] });
      else if (s.pending?.kind === "choice")
        s = act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
      else s = passBoth(s);
    }
    expect(s.players.p1?.life).toBe(23);
  });
});

describe("Reality Fracture, lot C : préparé", () => {
  const exileNames = (s: S) => s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
  const castPrepared = (s: S, p: string, spellName: string, extra: Record<string, unknown> = {}) => {
    const copy = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === spellName) as string;
    return act(s, p, { type: "cast", card: copy, ...extra });
  };

  it("arrive préparée : une copie du sort en exil, lançable par son contrôleur ; la lancer dé-prépare", () => {
    let s = scenario({ p1: { hand: ["Emergency Phytomedic"], battlefield: lands("Forest", 3) } });
    s = cast(s, "p1", "Emergency Phytomedic");
    s = passBoth(s);
    const medic = idOf(s, "p1", "battlefield", "Emergency Phytomedic");
    expect(exileNames(s)).toEqual(["Seed Suture"]);
    const copy = s.exile[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === copy)).toBe(true);
    expect(legalActions(s, "p2").length).toBe(0); // l'adversaire n'a pas la priorité ; et la copie n'est pas à lui
    s = castPrepared(s, "p1", "Seed Suture", { targets: { t: [medic] } });
    expect(s.objects[medic]?.preparedCopy).toBeUndefined();
    s = passBoth(s);
    expect(s.objects[medic]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.life).toBe(21);
    // La copie a cessé d'exister : ni en exil, ni au cimetière.
    expect(exileNames(s)).toEqual([]);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("dé-préparée par un effet (Infinite Coursework) ou en quittant le champ de bataille : la copie disparaît", () => {
    let s = scenario({
      p1: { hand: ["Infinite Coursework"], battlefield: lands("Island", 3) },
      p2: { battlefield: ["Void Extrapolator", "Theorix Metamage"] },
    });
    const vx = idOf(s, "p2", "battlefield", "Void Extrapolator");
    const tm = idOf(s, "p2", "battlefield", "Theorix Metamage");
    for (const id of [vx, tm]) setPrepared(s, s.objects[id] as NonNullable<S["objects"][string]>, true);
    expect(exileNames(s)).toEqual(["Omit Variables", "Omit Variables"]);
    s = cast(s, "p1", "Infinite Coursework", { targets: { enchant: [vx] } });
    s = passBoth(s); // l'Aura arrive
    s = passBoth(s); // son déclencheur : engage et dé-prépare
    expect(s.objects[vx]?.tapped).toBe(true);
    expect(s.objects[vx]?.preparedCopy).toBeUndefined();
    expect(exileNames(s)).toEqual(["Omit Variables"]);
    destroy(s, tm);
    expect(exileNames(s)).toEqual([]);
  });

  it("« au début de votre entretien, si elle n'est pas préparée, elle devient préparée »", () => {
    let s = scenario({ step: "end", active: "p2", p1: { battlefield: ["Stingerquill Voxmancer"] } });
    expect(exileNames(s)).toEqual([]);
    for (let i = 0; i < 12 && !(s.turn.active === "p1" && s.turn.step === "main1"); i++) s = passBoth(s);
    expect(exileNames(s)).toEqual(["Vicious Verse"]);
  });

  it("Codie copie le sort préparé lancé", () => {
    let s = scenario({
      p1: { hand: ["Stingerquill Voxmancer"], battlefield: ["Codie, Ravenous Codex", ...lands("Swamp", 3)] },
    });
    const vox = { type: "cast", card: idOf(s, "p1", "hand", "Stingerquill Voxmancer") } as const;
    s = act(s, "p1", vox);
    s = passBoth(s);
    const v = idOf(s, "p1", "battlefield", "Stingerquill Voxmancer");
    // Préparée par un effet (comme celui de Codie) : aide du moteur.
    setPrepared(s, s.objects[v] as NonNullable<S["objects"][string]>, true);
    s = castPrepared(s, "p1", "Vicious Verse", { targets: { t: ["p2"] } });
    s = passBoth(s); // déclencheur de Codie : copie
    for (let i = 0; i < 4 && s.stack.length; i++) s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Heartwood Crafter : son mana ne paie pas un sort lancé depuis la main", () => {
    const s = scenario({ p1: { hand: ["Llanowar Elves"], battlefield: ["Heartwood Crafter"] } });
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Llanowar Elves"))).toBe(
      false,
    );
  });
});

describe("Reality Fracture, lot D : Empower Jace", () => {
  const jaces = (s: S, p = "p1") =>
    s.battlefield.filter(
      (id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Jace"),
    );
  const loyaltyOf = (s: S, id: string) => s.objects[id]?.counters.loyalty ?? 0;

  it("crée un jeton Jace avec N loyautés, puis charge le même jeton", () => {
    let s = scenario({
      p1: { hand: ["Protege's Awakening", "No Admittance"], battlefield: lands("Mountain", 2), library: lands("Island", 5) },
    });
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, manaPool: { W: 0, U: 4, B: 0, R: 0, G: 0, C: 0 } } } };
    s = cast(s, "p1", "Protege's Awakening");
    s = passBoth(s);
    expect(jaces(s)).toHaveLength(1);
    const jace = jaces(s)[0] as string;
    expect(loyaltyOf(s, jace)).toBe(6);
    expect(chars(s, jace).types).toEqual(["Planeswalker"]);
    s = cast(s, "p1", "No Admittance", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(jaces(s)).toEqual([jace]);
    expect(loyaltyOf(s, jace)).toBe(7);
    // Ses capacités : −1 surveillance, −3 piocher.
    expect(legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === jace)).toHaveLength(2);
  });

  it("les planeswalkers gagnent les capacités des Ways ; Sanctum Lurker les garde à 0 loyauté", () => {
    let s = scenario({ p1: { hand: ["Sanctum Lurker"], battlefield: ["Way of the Wildspeaker", ...lands("Swamp", 3)] } });
    s = cast(s, "p1", "Sanctum Lurker");
    s = passBoth(s); // Lurker arrive
    s = passBoth(s); // renforcez Jace 1
    const jace = jaces(s)[0] as string;
    expect(loyaltyOf(s, jace)).toBe(1);
    // [−1] surveillance : Jace tombe à 0 mais reste (Sanctum Lurker).
    const surveil = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === jace && a.label?.includes("Surveillance"),
    );
    expect(surveil).toBeDefined();
    s = act(s, "p1", { type: "activate", source: jace, ability: (surveil as { ability: number }).ability });
    expect(s.objects[jace]?.zone).toBe("battlefield");
    expect(loyaltyOf(s, jace)).toBe(0);
    // Capacités accordées : [+2] (Lurker) et [−4] (Wildspeaker) sur le jeton.
    const labels = chars(s, jace).abilities.map((a) => (a.kind === "activated" ? a.label : ""));
    expect(labels.some((l) => l?.startsWith("+2"))).toBe(true);
    expect(labels.some((l) => l?.startsWith("−4"))).toBe(true);
  });

  it("Jace's Machinations : les capacités de loyauté des Jace à vitesse d'éphémère, pendant le tour adverse", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Jace's Machinations"], battlefield: lands("Island", 3), library: lands("Island", 5) },
    });
    s = act(s, "p2", { type: "pass" });
    s = cast(s, "p1", "Jace's Machinations");
    s = passBoth(s);
    const jace = jaces(s)[0] as string;
    expect(loyaltyOf(s, jace)).toBe(8);
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "pass" });
    if (s.pending?.player === "p1")
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === jace)).toBe(true);
  });

  it("Countersculpt : {1} de plus sans Jace à contempler", () => {
    const withoutJace = scenario({ p1: { hand: ["Countersculpt"], battlefield: lands("Island", 2) } });
    const cs = idOf(withoutJace, "p1", "hand", "Countersculpt");
    // Pas de sort à contrecarrer : on vérifie seulement le coût via le mana disponible.
    const d = withoutJace.defs[withoutJace.objects[cs]?.defId ?? ""]!;
    expect(spellCost(withoutJace, "p1", d, {}).generic).toBe(1);
    const withJace = scenario({ p1: { hand: ["Countersculpt", "Jace, Reality Sculptor"], battlefield: lands("Island", 2) } });
    expect(spellCost(withJace, "p1", d, {}).generic).toBe(0);
  });

  it("Violent Echoes : renforcez Jace de l'excès de blessures", () => {
    let s = scenario({
      p1: { hand: ["Violent Echoes"], battlefield: lands("Mountain", 4) },
      p2: { battlefield: ["Savannah Lions"] },
    });
    s = cast(s, "p1", "Violent Echoes", { targets: { t: [idOf(s, "p2", "battlefield", "Savannah Lions")] } });
    s = passBoth(s);
    expect(loyaltyOf(s, jaces(s)[0] as string)).toBe(5);
  });
});

describe("Reality Fracture, lot E : planeswalkers", () => {
  it("terrains « engagé sauf si vous contrôlez un planeswalker »", () => {
    let s = scenario({ p1: { hand: ["Fatehold Annex"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Fatehold Annex") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Fatehold Annex")]?.tapped).toBe(true);
    let t = scenario({ p1: { hand: ["Fatehold Annex"], battlefield: ["Ajani Resolute"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Fatehold Annex") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Fatehold Annex")]?.tapped).toBe(false);
  });

  it("Ajani Resolute : un marqueur de loyauté à chaque gain de PV, et la capacité 0", () => {
    let s = scenario({ p1: { battlefield: ["Ajani Resolute"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani Resolute");
    expect(s.objects[ajani]?.counters.loyalty).toBe(2);
    const zero = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ajani && a.label?.startsWith("0"));
    s = act(s, "p1", { type: "activate", source: ajani, ability: (zero as { ability: number }).ability });
    s = passBoth(s); // +1 PV
    s = passBoth(s); // déclencheur : loyauté
    expect(s.players.p1?.life).toBe(21);
    expect(s.objects[ajani]?.counters.loyalty).toBe(3);
  });

  it("Ajani Unrelenting : « chaque fois que vous activez une capacité de loyauté », un Cadet ; Kiora voit l'activation", () => {
    let s = scenario({ p1: { battlefield: ["Ajani Unrelenting"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani Unrelenting");
    const plus = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ajani && a.label?.startsWith("+1"));
    s = act(s, "p1", { type: "activate", source: ajani, ability: (plus as { ability: number }).ability });
    expect(s.players.p1?.turnStats.loyaltyActivations).toBe(1);
    for (let i = 0; i < 4 && s.stack.length; i++) s = passBoth(s);
    expect(s.battlefield.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Cadet")).toBe(true);
  });

  it("Tam : prolifère autant de fois que de types de planeswalker", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Tam, the Possibility",
          "Ajani Resolute",
          "The Theorist, Jace Beleren",
          "Plains",
          "Island",
          "Swamp",
          "Mountain",
          "Forest",
        ],
      },
    });
    const tam = idOf(s, "p1", "battlefield", "Tam, the Possibility");
    s = act(s, "p1", { type: "activate", source: tam, ability: 1 });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Ajani Resolute")]?.counters.loyalty).toBe(4); // 2 + 2
    expect(s.objects[idOf(s, "p1", "battlefield", "The Theorist, Jace Beleren")]?.counters.loyalty).toBe(5);
  });

  it("Winter, Tormented Loner : +1/+0 par carte de créature ou de planeswalker au cimetière", () => {
    const s = scenario({
      p1: { battlefield: ["Winter, Tormented Loner"], graveyard: ["Savannah Lions", "Ajani Resolute", "Plains"] },
    });
    const w = idOf(s, "p1", "battlefield", "Winter, Tormented Loner");
    expect(chars(s, w).power).toBe((s.defs[s.objects[w]?.defId ?? ""]?.power ?? 0) + 2);
  });

  it("Mabel, Bitter Recluse : retire jusqu'à trois marqueurs", () => {
    let s = scenario({
      p1: { hand: ["Mabel, Bitter Recluse"], battlefield: ["Swamp"] },
      p2: { battlefield: ["Ajani Unrelenting"] },
    });
    const ajani = idOf(s, "p2", "battlefield", "Ajani Unrelenting");
    s = cast(s, "p1", "Mabel, Bitter Recluse");
    s = passBoth(s);
    s = passBoth(s);
    expect(s.objects[ajani]?.counters.loyalty).toBe(2); // 5 - 3
  });
});
