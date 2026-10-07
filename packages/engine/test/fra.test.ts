/**
 * Reality Fracture, lot A : primitives ajoutées au moteur (terrains lents, regard ou surveillance,
 * marqueur de finalité, créatures mortes ce tour, blessures non de combat, cartes piochées, filtres
 * légendaire / endurance, montants négatifs).
 */

import { describe, expect, it } from "vitest";
import { createTokens, dealDamage, destroy, drawCards, gainLife, sourceFromObject } from "../src/actions";
import { eventReplacement } from "../src/dsl";
import { RulesError } from "../src/errors";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { spellCost } from "../src/stack";
import { chars, setPrepared } from "../src/state";
import { simultaneously } from "../src/triggers";
import { countTurnEvents } from "../src/turnlog";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  castable,
  customCard,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
} from "./helpers";

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
    s = { ...s, turnLog: [...s.turnLog, { e: "scry", player: "p1" }] };
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
    expect(countTurnEvents(s, { event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"] }, "p1")).toBe(2);
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

  it("Codie : la copie du sort préparé peut changer de cible (707.10c)", () => {
    let s = scenario({
      players: 3,
      p1: { hand: ["Stingerquill Voxmancer"], battlefield: ["Codie, Ravenous Codex", ...lands("Swamp", 3)] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stingerquill Voxmancer") });
    s = settle(s);
    const v = idOf(s, "p1", "battlefield", "Stingerquill Voxmancer");
    setPrepared(s, s.objects[v] as NonNullable<S["objects"][string]>, true);
    s = castPrepared(s, "p1", "Vicious Verse", { targets: { t: ["p2"] } });
    // La copie demande sa cible : l'autre adversaire.
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("p3") ? ["p3"] : undefined));
    expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
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
    expect(s.turnLog.filter((e) => e.e === "activate" && e.loyalty && e.player === "p1")).toHaveLength(1);
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
    // Chaque prolifération est un choix (701.34a) ; la suggestion prend vos planeswalkers.
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
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

describe("Prolifération : un choix (701.34a)", () => {
  it("le joueur choisit les permanents qui reçoivent un marqueur de plus", () => {
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
    const ajani = idOf(s, "p1", "battlefield", "Ajani Resolute");
    const jace = idOf(s, "p1", "battlefield", "The Theorist, Jace Beleren");
    s = act(s, "p1", { type: "activate", source: tam, ability: 1 });
    s = passBoth(s);
    // Deux proliférations : seulement Ajani la première fois, rien la seconde.
    for (const values of [[ajani], []]) {
      const p = s.pending;
      if (p?.kind !== "choice" || p.request.intent !== "proliferate") throw new Error("prolifération attendue");
      expect(p.request.type === "pick" && p.request.options).toEqual(expect.arrayContaining([ajani, jace]));
      expect(p.request.autoOk).toBe(true);
      s = act(s, "p1", { type: "choose", values });
    }
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    const jaceLoyalty = s.defs[s.objects[jace]?.defId ?? ""]?.loyalty ?? 0;
    expect(s.objects[ajani]?.counters.loyalty).toBe(3);
    expect(s.objects[jace]?.counters.loyalty).toBe(jaceLoyalty);
  });
});

describe("Liliana the Faultless (lot K4)", () => {
  it("« {1}, {T}, défaussez une carte » : la défausse est un coût ; sans carte en main, la capacité ne s'active pas", () => {
    const setup = (hand: string[]) => scenario({ p1: { battlefield: ["Liliana the Faultless", "Bear Cub", "Plains"], hand } });
    const empty = setup([]);
    const lili0 = idOf(empty, "p1", "battlefield", "Liliana the Faultless");
    expect(legalActions(empty, "p1").some((a) => a.type === "activate" && a.source === lili0)).toBe(false);
    let s = setup(["Island"]);
    const lili = idOf(s, "p1", "battlefield", "Liliana the Faultless");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === lili);
    s = act(s, "p1", {
      type: "activate",
      source: lili,
      ability: opt?.type === "activate" ? opt.ability : -1,
      targets: { t: [bear] },
    });
    // Capacité sur la pile : la carte est déjà défaussée.
    expect(s.stack).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(0);
    s = passBoth(s);
    expect(chars(s, bear).keywords).toContain("hexproof");
  });
});

describe("Reality Fracture, lot K6 : Renforcez Jace avec plusieurs jetons Jace", () => {
  it("le joueur choisit le jeton Jace qui reçoit les marqueurs (choix non ciblé, à la résolution)", () => {
    const s0 = scenario({ p1: { hand: ["No Admittance"], battlefield: lands("Mountain", 2) } });
    const [a, b] = createTokens(s0, "p1", { name: "Jace", colors: ["U"], types: ["Planeswalker"], subtypes: ["Jace"] }, 2) as [
      string,
      string,
    ];
    for (const id of [a, b]) (s0.objects[id] as { counters: Record<string, number> }).counters.loyalty = 2;
    let offered: string[] = [];
    const s = settle(cast(s0, "p1", "No Admittance", { targets: { t: ["p2"] } }), (req) => {
      if (req.type !== "pick" || !req.options.includes(a)) return undefined;
      offered = req.options;
      return [b];
    });
    expect([...offered].sort()).toEqual([a, b].sort());
    expect(s.players.p2?.life).toBe(17);
    expect(s.objects[a]?.counters.loyalty).toBe(2);
    expect(s.objects[b]?.counters.loyalty).toBe(3);
    // Aucun nouveau jeton : vous en contrôlez déjà.
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(2);
  });
});

describe("Jetons décrits engagés (lot K8)", () => {
  it("Tenured Tethermage : en sacrifiant un terrain, deux jetons Heartwood engagés", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Forest", "Island", "Plains"], hand: ["Tenured Tethermage"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tenured Tethermage") });
    for (let i = 0; i < 30 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values:
            p.request.type === "yesNo"
              ? [1]
              : p.request.type === "pick"
                ? p.request.options.slice(0, Math.max(1, p.request.min))
                : p.request.suggested,
        });
      else break;
    }
    const tokens = s.battlefield.filter((id) => s.objects[id]?.isToken);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((id) => s.objects[id]?.tapped)).toBe(true);
  });
});

describe("Reality Fracture, lot K8 : cartes mythiques, rares et peu communes", () => {
  /** Joue en répondant aux choix (réponse suggérée par défaut) jusqu'à `until` ; n'attaque ni ne bloque. */
  const play = (s0: S, answer: Answer, until: (s: S) => boolean): S => {
    let s = s0;
    for (let i = 0; i < 400 && !until(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard") {
        const hand = s.players[p.player]?.hand ?? [];
        s = act(s, p.player, { type: "discard", cards: hand.slice(0, p.count) });
      } else break;
    }
    return s;
  };
  /** Réponse : « oui » (ou « non ») aux questions, `want` quand il fait partie des options d'un choix. */
  const answering =
    (yes: boolean, want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = want.filter((w) => req.options.includes(w));
        if (picked.length > 0) return picked.slice(0, req.max);
      }
      return undefined;
    };
  /** Résout la pile et les déclenchements en attente en répondant aux choix ; sans rien à résoudre, ne passe pas. */
  const resolve = (s: S, answer: Answer = () => undefined) =>
    s.stack.length > 0 || s.triggers.length > 0 || s.pending?.kind === "choice" ? settle(s, answer) : s;
  /** Active la capacité de `source` dont le libellé commence par `label` (la première, sans libellé). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const opt = legalActions(s, player).find(
      (a) => a.type === "activate" && a.source === source && (!label || a.label?.startsWith(label)),
    );
    if (opt?.type !== "activate") throw new Error(`capacité « ${label ?? "?"} » introuvable`);
    return act(s, player, { type: "activate", source, ability: opt.ability, ...extra });
  };
  const canUse = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source && (!label || a.label?.startsWith(label)));
  const life = (s: S, p: string) => s.players[p]?.life;
  const handOf = (s: S, p: string) => namesIn(s, s.players[p]?.hand);
  const graveOf = (s: S, p: string) => namesIn(s, s.players[p]?.graveyard);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string, kind = "+1/+1") => s.objects[id]?.counters[kind] ?? 0;
  const tokensNamed = (s: S, name: string, p = "p1") =>
    s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && chars(s, id).name === name);
  const jaceTokens = (s: S, p = "p1") =>
    s.battlefield.filter(
      (id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Jace"),
    );
  const jaceLoyalty = (s: S, p = "p1") => s.objects[jaceTokens(s, p)[0] ?? ""]?.counters.loyalty ?? 0;
  const prepared = (s: S, id: string) => s.objects[id]?.preparedCopy !== undefined;
  /** Lance la copie du sort préparé de `id`. */
  const castCopy = (s: S, id: string, extra: object = {}) =>
    act(s, s.objects[id]?.controller as string, { type: "cast", card: s.objects[id]?.preparedCopy as string, ...extra });
  /** Joue (sans attaquer ni bloquer) jusqu'à l'étape de fin, déclencheurs résolus, ou jusqu'au tour suivant. */
  const toEndStep = (s: S, answer: Answer = () => undefined) => {
    const turn = s.turn.number;
    return play(
      s,
      answer,
      (x) =>
        x.turn.number > turn ||
        (x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority"),
    );
  };
  /** Déclare les attaquants (vers p2), puis joue sans bloquer jusqu'à la seconde phase principale. */
  const attackThrough = (s: S, attackers: string[], answer: Answer = () => undefined) =>
    play(attack(s, attackers), answer, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority");

  describe("mythiques", () => {
    it("Aerid Konstrari : un Heartwood à l'arrivée et à la mort ; {6} : un Heartwood, puis +X/+0 (X = vos artefacts)", () => {
      let s = scenario({ p1: { hand: ["Aerid Konstrari"], battlefield: ["Mountain", ...lands("Forest", 3)] } });
      s = resolve(cast(s, "p1", "Aerid Konstrari"));
      expect(tokensNamed(s, "Heartwood")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Aerid Konstrari", ...lands("Forest", 6)] } });
      const aerid = idOf(t, "p1", "battlefield", "Aerid Konstrari");
      t = resolve(activate(t, "p1", aerid));
      expect(tokensNamed(t, "Heartwood")).toHaveLength(1);
      expect(pt(t, aerid)).toEqual([6, 4]);
      destroy(t, aerid);
      t = resolve(t);
      expect(tokensNamed(t, "Heartwood")).toHaveLength(2);
    });

    it("Avatar of Burgeoning Echoes : terrain qui arrive sous votre contrôle → renforcez Jace 2 ; vos planeswalkers ont [−10]", () => {
      let s = scenario({ p1: { hand: ["Forest"], battlefield: ["Avatar of Burgeoning Echoes", "Island", "Bear Cub"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(jaceTokens(s)).toHaveLength(1);
      expect(jaceLoyalty(s)).toBe(2);
      const jace = jaceTokens(s)[0] as string;
      expect(canUse(s, "p1", jace, "−10")).toBe(false);
      s.objects[jace]!.counters.loyalty = 10;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", jace, "−10", { targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(2); // Island et Forest
      // Un terrain adverse ne déclenche rien.
      let o = scenario({ active: "p2", p1: { battlefield: ["Avatar of Burgeoning Echoes"] }, p2: { hand: ["Forest"] } });
      o = resolve(act(o, "p2", { type: "playLand", card: idOf(o, "p2", "hand", "Forest") }));
      expect(jaceTokens(o)).toHaveLength(0);
    });

    it("Bloodline Recollector : préparée à l'étape de fin si trois créatures sont mortes ce tour-ci, pas avec deux", () => {
      const run = (deaths: number) => {
        let s = scenario({ p1: { battlefield: ["Bloodline Recollector"] }, p2: { battlefield: lands("Bear Cub", 3) } });
        for (const id of idsOf(s, "p2", "battlefield", "Bear Cub").slice(0, deaths)) destroy(s, id);
        s = toEndStep(s);
        return prepared(s, idOf(s, "p1", "battlefield", "Bloodline Recollector"));
      };
      expect(run(3)).toBe(true);
      expect(run(2)).toBe(false);
    });

    it("Craterclaw Colossus : célérité ; à l'arrivée, vos créatures gagnent le piétinement et +X/+0 (X = vos artefacts)", () => {
      let s = scenario({
        p1: { hand: ["Craterclaw Colossus"], battlefield: [...lands("Mountain", 7), "Bear Cub", "The Echoverse Fulcrum"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      s = resolve(cast(s, "p1", "Craterclaw Colossus"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const colossus = idOf(s, "p1", "battlefield", "Craterclaw Colossus");
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(pt(s, colossus)).toEqual([7, 5]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(chars(s, colossus).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      expect(pt(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
    });

    it("Enlightened Confidant : PV gagnés → surveillance 1 à votre étape de fin ; la carte mise au cimetière revient si sa valeur de mana ≤ PV gagnés", () => {
      const run = (gain: number, top: string) => {
        let s = scenario({ p1: { battlefield: ["Enlightened Confidant"], library: [top, "Forest", "Forest"] } });
        const topId = s.players.p1?.library[0] as string;
        if (gain > 0) gainLife(s, "p1", gain);
        let asked = false;
        s = toEndStep(s, (req) => {
          if (req.intent !== "surveilGraveyard") return undefined;
          asked = true;
          return [topId];
        });
        return { s, asked };
      };
      const cheap = run(2, "Bear Cub");
      expect(cheap.asked).toBe(true);
      expect(handOf(cheap.s, "p1")).toEqual(["Bear Cub"]);
      const dear = run(2, "Serra Angel");
      expect(handOf(dear.s, "p1")).toEqual([]);
      expect(graveOf(dear.s, "p1")).toEqual(["Serra Angel"]);
      const none = run(0, "Bear Cub");
      expect(none.asked).toBe(false);
      expect(graveOf(none.s, "p1")).toEqual([]);
    });

    it("Hexhaven Invigorator : blessée, vous pouvez chercher autant de terrains que de blessures, arrivés engagés", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { hand: ["Shock"], battlefield: ["Hexhaven Invigorator", "Mountain"], library: lands("Forest", 5) },
        });
        return resolve(
          cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Hexhaven Invigorator")] } }),
          answering(yes),
        );
      };
      const yes = run(true);
      const forests = idsOf(yes, "p1", "battlefield", "Forest");
      expect(forests).toHaveLength(2);
      expect(forests.every((id) => yes.objects[id]?.tapped)).toBe(true);
      expect(idsOf(run(false), "p1", "battlefield", "Forest")).toHaveLength(0);
    });

    it("Ingris Stingerquill : chaque attaquant que vous contrôlez inflige 1 blessure à chaque adversaire ; {4} : un Cadet, puis célérité", () => {
      let s = scenario({ p1: { battlefield: ["Ingris Stingerquill", "Bear Cub", "Savannah Lions"] } });
      const attackers = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Savannah Lions")];
      s = settleNoBlocks(attack(s, attackers));
      expect(life(s, "p2")).toBe(18);
      expect(life(s, "p1")).toBe(20);
      let t = scenario({ p1: { battlefield: ["Ingris Stingerquill", "Bear Cub", ...lands("Mountain", 4)] } });
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Ingris Stingerquill")));
      const cadet = tokensNamed(t, "Cadet")[0] as string;
      expect(pt(t, cadet)).toEqual([2, 2]);
      expect(chars(t, cadet).keywords).toContain("haste");
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
    });

    it("Kwia Vigorbloom : vol, vigilance, lien de vie, parade {2} ; un Lotus au premier gain de PV du tour seulement", () => {
      let s = scenario({ p1: { battlefield: ["Kwia Vigorbloom"] } });
      const kwia = idOf(s, "p1", "battlefield", "Kwia Vigorbloom");
      expect(chars(s, kwia).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "lifelink"]));
      gainLife(s, "p1", 1);
      s = resolve(s);
      gainLife(s, "p1", 1);
      s = resolve(s);
      const lotus = tokensNamed(s, "Lotus");
      expect(lotus).toHaveLength(1);
      expect(chars(s, lotus[0] as string).types).toEqual(["Artifact"]);
    });

    it("Overwrite the Multiverse : exile toutes les créatures, puis renforcez Jace du nombre de créatures exilées", () => {
      let s = scenario({
        p1: { hand: ["Overwrite the Multiverse"], battlefield: ["Bear Cub", ...lands("Swamp", 6)] },
        p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
      });
      s = resolve(cast(s, "p1", "Overwrite the Multiverse"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      expect(namesIn(s, s.exile).sort()).toEqual(["Bear Cub", "Savannah Lions", "Serra Angel"]);
      expect(jaceLoyalty(s)).toBe(3);
    });

    it("Return to the Light Realms : renvoie toutes vos cartes de permanent non-terrain de votre cimetière", () => {
      let s = scenario({
        p1: {
          hand: ["Return to the Light Realms"],
          battlefield: lands("Plains", 9),
          graveyard: ["Bear Cub", "Eye of Jace", "Ajani Resolute", "Plains", "Shock"],
        },
        p2: { graveyard: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Return to the Light Realms"));
      for (const n of ["Bear Cub", "Eye of Jace", "Ajani Resolute"]) expect(idsOf(s, "p1", "battlefield", n)).toHaveLength(1);
      expect(graveOf(s, "p1").sort()).toEqual(["Plains", "Return to the Light Realms", "Shock"]);
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
    });

    it("Seasoned Cryomancer : piochez 2, défaussez 2 ; autant de créatures engagées et étourdies que de cartes non-terrain défaussées", () => {
      const run = (library: string[]) => {
        let s = scenario({
          p1: { hand: ["Seasoned Cryomancer"], battlefield: lands("Island", 3), library: [...library, "Forest"] },
          p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
        });
        const foes = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Savannah Lions")];
        s = resolve(cast(s, "p1", "Seasoned Cryomancer"), (req) => {
          if (req.type !== "pick") return undefined;
          if (req.intent === "discard") return req.options.slice(0, 2);
          return foes.filter((f) => req.options.includes(f)).slice(0, req.max);
        });
        return { s, foes };
      };
      const two = run(["Serra Angel", "Shock"]);
      expect(graveOf(two.s, "p1").sort()).toEqual(["Serra Angel", "Shock"]);
      for (const f of two.foes) {
        expect(two.s.objects[f]?.tapped).toBe(true);
        expect(counters(two.s, f, "stun")).toBe(1);
      }
      const one = run(["Serra Angel", "Plains"]);
      expect(one.foes.filter((f) => one.s.objects[f]?.tapped)).toHaveLength(1);
      const none = run(["Plains", "Plains"]);
      expect(none.foes.some((f) => none.s.objects[f]?.tapped)).toBe(false);
    });

    it("Seasoned Cryomancer : {3}{U}{U}, exilez-la de votre cimetière : piochez deux cartes", () => {
      let s = scenario({ p1: { graveyard: ["Seasoned Cryomancer"], battlefield: lands("Island", 5) } });
      const cryo = idOf(s, "p1", "graveyard", "Seasoned Cryomancer");
      s = resolve(activate(s, "p1", cryo));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(namesIn(s, s.exile)).toEqual(["Seasoned Cryomancer"]);
    });

    it("Stingcaster Mage : célérité ; un éphémère ou rituel de votre cimetière gagne un flashback égal à son coût", () => {
      let s = scenario({
        p1: { hand: ["Stingcaster Mage"], battlefield: lands("Mountain", 3), graveyard: ["Shock", "Bear Cub"] },
      });
      const shock = idOf(s, "p1", "graveyard", "Shock");
      expect(castable(s, "p1", shock)).toBe(false);
      s = resolve(cast(s, "p1", "Stingcaster Mage"), answering(true, [shock]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Stingcaster Mage")).keywords).toContain("haste");
      expect(castable(s, "p1", shock)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(18);
      expect(namesIn(s, s.exile)).toEqual(["Shock"]);
    });

    it("The Echoverse Fulcrum : à l'arrivée, piochez puis défaussez ; {5}, {T}, exilez-le : détruisez toutes les créatures, en rituel", () => {
      let s = scenario({ p1: { hand: ["The Echoverse Fulcrum", "Opt"], battlefield: lands("Island", 2) } });
      s = resolve(cast(s, "p1", "The Echoverse Fulcrum"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["The Echoverse Fulcrum", "Bear Cub", ...lands("Island", 5)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const fulcrum = idOf(t, "p1", "battlefield", "The Echoverse Fulcrum");
      t = resolve(activate(t, "p1", fulcrum));
      expect(t.battlefield.filter((id) => chars(t, id).types.includes("Creature"))).toHaveLength(0);
      expect(namesIn(t, t.exile)).toEqual(["The Echoverse Fulcrum"]);
      const o = scenario({ active: "p2", p1: { battlefield: ["The Echoverse Fulcrum", ...lands("Island", 5)] } });
      const passed = act(o, "p2", { type: "pass" });
      expect(canUse(passed, "p1", idOf(passed, "p1", "battlefield", "The Echoverse Fulcrum"))).toBe(false);
    });
  });

  describe("rares", () => {
    it("Ajani's Anguish : à l'arrivée, X blessures à n'importe quelle cible ; vos créatures ont le piétinement", () => {
      let s = scenario({ p1: { hand: ["Ajani's Anguish"], battlefield: [...lands("Mountain", 4), "Bear Cub"] } });
      s = resolve(cast(s, "p1", "Ajani's Anguish", { x: 3 }), answering(true, ["p2"]));
      expect(life(s, "p2")).toBe(17);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
    });

    it("Carnivorous Cultivator : contact mortel, arrive préparée ; blessures de combat à un joueur → une carte de terrain du cimetière en main", () => {
      let s = scenario({ p1: { hand: ["Carnivorous Cultivator"], battlefield: lands("Forest", 2) } });
      s = resolve(cast(s, "p1", "Carnivorous Cultivator"));
      const c = idOf(s, "p1", "battlefield", "Carnivorous Cultivator");
      expect(prepared(s, c)).toBe(true);
      expect(chars(s, c).keywords).toContain("deathtouch");
      let t = scenario({ p1: { battlefield: ["Carnivorous Cultivator"], graveyard: ["Forest", "Shock"] } });
      t = attackThrough(t, [idOf(t, "p1", "battlefield", "Carnivorous Cultivator")]);
      expect(life(t, "p2")).toBe(18);
      expect(handOf(t, "p1")).toEqual(["Forest"]);
    });
  });

  describe("rares (2)", () => {
    it("Cruel Calculations : piochez autant de cartes que de cartes mises de la bibliothèque au cimetière du joueur ciblé ce tour-ci", () => {
      const run = (who: string) => {
        let s = scenario({
          p1: { hand: ["Dark Matter Manipulator", "Cruel Calculations"], battlefield: ["Swamp", ...lands("Island", 3)] },
        });
        s = resolve(cast(s, "p1", "Dark Matter Manipulator")); // meule 3
        s = resolve(cast(s, "p1", "Cruel Calculations", { targets: { t: [who] } }));
        return s.players.p1?.hand.length;
      };
      expect(run("p1")).toBe(3);
      expect(run("p2")).toBe(0);
    });

    it("Curse-Marred Demon : vol, piétinement ; à l'arrivée, cherchez une carte, puis défaussez une carte au hasard", () => {
      let s = scenario({
        p1: {
          hand: ["Curse-Marred Demon", "Opt"],
          battlefield: lands("Mountain", 4),
          library: ["Forest", "Serra Angel", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Curse-Marred Demon"), (req) =>
        req.intent === "search" ? pickNamed(s, req, "Serra Angel") : undefined,
      );
      const demon = idOf(s, "p1", "battlefield", "Curse-Marred Demon");
      expect(chars(s, demon).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect([...handOf(s, "p1"), ...graveOf(s, "p1")].sort()).toEqual(["Opt", "Serra Angel"]);
    });

    it("Dark Matter Manipulator : à l'arrivée, meule 3 ; +2/+0 par tranche de sept cartes dans votre cimetière", () => {
      let s = scenario({ p1: { hand: ["Dark Matter Manipulator"], battlefield: ["Swamp"], graveyard: lands("Plains", 4) } });
      s = resolve(cast(s, "p1", "Dark Matter Manipulator"));
      const dmm = idOf(s, "p1", "battlefield", "Dark Matter Manipulator");
      expect(s.players.p1?.graveyard).toHaveLength(7);
      expect(pt(s, dmm)).toEqual([3, 2]);
      const t = scenario({ p1: { battlefield: ["Dark Matter Manipulator"], graveyard: lands("Plains", 13) } });
      expect(pt(t, idOf(t, "p1", "battlefield", "Dark Matter Manipulator"))).toEqual([3, 2]);
      const u = scenario({ p1: { battlefield: ["Dark Matter Manipulator"], graveyard: lands("Plains", 14) } });
      expect(pt(u, idOf(u, "p1", "battlefield", "Dark Matter Manipulator"))).toEqual([5, 2]);
    });

    it("Diviner of Victory : arrive préparée ; +1/+1 jusqu'à la fin du tour chaque fois que vous regardez ou surveillez", () => {
      let s = scenario({ p1: { hand: ["Diviner of Victory", "Opt"], battlefield: lands("Island", 2) } });
      s = resolve(cast(s, "p1", "Diviner of Victory"));
      const d = idOf(s, "p1", "battlefield", "Diviner of Victory");
      expect(prepared(s, d)).toBe(true);
      expect(pt(s, d)).toEqual([1, 1]);
      s = resolve(cast(s, "p1", "Opt"));
      expect(pt(s, d)).toEqual([2, 2]);
    });

    it("Entrust the Spark : vous pouvez sacrifier un planeswalker ; si vous le faites, un planeswalker de la bibliothèque arrive", () => {
      const run = (yes: boolean, walker = true) => {
        const s = scenario({
          p1: {
            hand: ["Entrust the Spark"],
            battlefield: [...lands("Forest", 4), "Island", ...(walker ? ["Ajani Resolute"] : [])],
            library: ["Forest", "Ajani Unrelenting", "Forest"],
          },
        });
        return resolve(cast(s, "p1", "Entrust the Spark"), (req) => {
          if (req.type === "yesNo") return [yes ? 1 : 0];
          if (req.intent === "sacrifice" && req.type === "pick") return yes ? req.options.slice(0, 1) : [];
          return undefined;
        });
      };
      const yes = run(true);
      expect(graveOf(yes, "p1")).toContain("Ajani Resolute");
      expect(idsOf(yes, "p1", "battlefield", "Ajani Unrelenting")).toHaveLength(1);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Ajani Resolute")).toHaveLength(1);
      expect(idsOf(no, "p1", "battlefield", "Ajani Unrelenting")).toHaveLength(0);
      const none = run(true, false);
      expect(idsOf(none, "p1", "battlefield", "Ajani Unrelenting")).toHaveLength(0);
    });

    it("Face Yourself : une copie avec célérité de chaque créature du joueur ciblé, sacrifiée à l'étape de fin sans planeswalker", () => {
      const run = (walker: boolean) => {
        let s = scenario({
          p1: { hand: ["Face Yourself"], battlefield: [...lands("Mountain", 7), ...(walker ? ["Ajani Resolute"] : [])] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        s = resolve(cast(s, "p1", "Face Yourself", { targets: { p: ["p2"] } }));
        const copies = s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === "p1");
        expect(namesIn(s, copies).sort()).toEqual(["Bear Cub", "Serra Angel"]);
        expect(copies.every((id) => chars(s, id).keywords.includes("haste"))).toBe(true);
        s = toEndStep(s);
        return s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === "p1").length;
      };
      expect(run(false)).toBe(0);
      expect(run(true)).toBe(2);
    });

    it("Flickering Hound : quand vous lancez un sort de créature, une autre de vos créatures fait un aller-retour par l'exil", () => {
      let s = scenario({
        p1: {
          hand: ["Savannah Lions"],
          battlefield: ["Flickering Hound", { name: "Bear Cub", tapped: true, counters: { "+1/+1": 1 } }, "Plains"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const hound = idOf(s, "p1", "battlefield", "Flickering Hound");
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Savannah Lions"), (req) => {
        if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
        offered = req.options;
        return [bear];
      });
      expect(offered).not.toContain(hound);
      expect(s.battlefield).not.toContain(bear);
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[back]?.tapped).toBe(false);
      expect(counters(s, back)).toBe(0);
      // Un sort non-créature ne déclenche rien.
      let t = scenario({ p1: { hand: ["Shock"], battlefield: ["Flickering Hound", "Bear Cub", "Mountain"] } });
      const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(t.battlefield).toContain(bear2);
    });

    it("Frostbite Pyromental : piétinement, célérité ; blessures de combat à un joueur → piochez deux cartes ; sacrifiée à l'étape de fin", () => {
      let s = scenario({ p1: { battlefield: ["Frostbite Pyromental"] } });
      const f = idOf(s, "p1", "battlefield", "Frostbite Pyromental");
      expect(chars(s, f).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
      s = attackThrough(s, [f]);
      expect(life(s, "p2")).toBe(16);
      expect(s.players.p1?.hand).toHaveLength(2);
      s = toEndStep(s);
      expect(graveOf(s, "p1")).toEqual(["Frostbite Pyromental"]);
    });

    it("Gardenize : un marqueur de charge quand une de vos créatures meurt ; {G} par marqueur au début de votre première phase principale", () => {
      let s = scenario({
        p1: { battlefield: ["Gardenize", "Bear Cub", "Savannah Lions"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const g = idOf(s, "p1", "battlefield", "Gardenize");
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p1", "battlefield", "Savannah Lions"));
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = resolve(s);
      expect(counters(s, g, "charge")).toBe(2);
      const turn = s.turn.number;
      s = play(
        s,
        () => undefined,
        (x) =>
          x.turn.number > turn + 1 &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.kind === "priority",
      );
      expect(s.turn.active).toBe("p1");
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Germinate Recruits : autant de Cadets que de PV gagnés ce tour-ci", () => {
      const run = (gain: number) => {
        let s = scenario({ p1: { hand: ["Germinate Recruits"], battlefield: lands("Plains", 3) } });
        if (gain) gainLife(s, "p1", gain);
        s = resolve(cast(s, "p1", "Germinate Recruits"));
        return tokensNamed(s, "Cadet").length;
      };
      expect(run(3)).toBe(3);
      expect(run(0)).toBe(0);
    });

    it("Gideon the Oathless : 1 blessure à l'adversaire dont une créature arrive, et à celui qui active une capacité de loyauté", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Gideon the Oathless"] },
        p2: { hand: ["Bear Cub"], battlefield: [...lands("Forest", 2), "Ajani Resolute"] },
      });
      s = resolve(cast(s, "p2", "Bear Cub"));
      expect(life(s, "p2")).toBe(19);
      s = resolve(activate(s, "p2", idOf(s, "p2", "battlefield", "Ajani Resolute"), "0"));
      expect(life(s, "p2")).toBe(19 - 1 + 1);
      expect(life(s, "p1")).toBe(20);
      // Vos propres créatures et capacités de loyauté ne déclenchent rien.
      let t = scenario({
        p1: { hand: ["Bear Cub"], battlefield: ["Gideon the Oathless", ...lands("Forest", 2), "Ajani Resolute"] },
      });
      t = resolve(cast(t, "p1", "Bear Cub"));
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Ajani Resolute"), "0"));
      expect([life(t, "p1"), life(t, "p2")]).toEqual([21, 20]);
    });

    it("Gideon's Memorial : jetons de créature +1/+0 et vigilance ; son mana ne paie qu'un sort de planeswalker", () => {
      const s = scenario({ p1: { battlefield: ["Gideon's Memorial", "Bear Cub"], hand: ["Savannah Lions", "Ajani Resolute"] } });
      const [tok] = createTokens(
        s,
        "p1",
        { name: "Cadet", colors: [], types: ["Creature"], subtypes: [], power: 2, toughness: 2 },
        1,
      );
      bump(s);
      expect(pt(s, tok as string)).toEqual([3, 2]);
      expect(chars(s, tok as string).keywords).toContain("vigilance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([2, 2]);
      expect(chars(s, bear).keywords).not.toContain("vigilance");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(false);
      const t = scenario({ p1: { battlefield: ["Gideon's Memorial", "Plains"], hand: ["Ajani Resolute"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Ajani Resolute"))).toBe(true);
    });

    it("Gideon's Memorial : {1}{W}, défaussez-le : 4 blessures à une créature attaquante ou bloqueuse", () => {
      let s = scenario({
        active: "p2",
        p1: { hand: ["Gideon's Memorial"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const memorial = idOf(s, "p1", "hand", "Gideon's Memorial");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      s = act(s, "p2", { type: "pass" });
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === memorial);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([angel]);
      s = resolve(activate(s, "p1", memorial, undefined, { targets: { t: [angel] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(graveOf(s, "p1")).toEqual(["Gideon's Memorial"]);
    });

    it("Guiding Hydra : arrive avec X marqueurs ; au début de votre combat, vous pouvez en déplacer un sur chacune de vos autres créatures", () => {
      const run = (yes: boolean) => {
        let s = scenario({ p1: { hand: ["Guiding Hydra"], battlefield: [...lands("Plains", 4), "Bear Cub", "Savannah Lions"] } });
        s = resolve(cast(s, "p1", "Guiding Hydra", { x: 3 }));
        const hydra = idOf(s, "p1", "battlefield", "Guiding Hydra");
        expect(counters(s, hydra)).toBe(3);
        s = play(
          s,
          answering(yes),
          (x) =>
            x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
        );
        return [
          counters(s, hydra),
          counters(s, idOf(s, "p1", "battlefield", "Bear Cub")),
          counters(s, idOf(s, "p1", "battlefield", "Savannah Lions")),
        ];
      };
      expect(run(true)).toEqual([2, 1, 1]);
      expect(run(false)).toEqual([3, 0, 0]);
    });

    it("Identity Echo : {3}{R}, en rituel : exilez une de vos créatures, révélez jusqu'à une carte de créature ou de planeswalker et mettez-la en jeu", () => {
      let s = scenario({
        p1: {
          battlefield: ["Identity Echo", "Bear Cub", ...lands("Mountain", 4)],
          library: ["Forest", "Shock", "Serra Angel", "Plains"],
        },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const echo = idOf(s, "p1", "battlefield", "Identity Echo");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === echo);
      const legal = opt?.type === "activate" ? (opt.targets[0]?.legal ?? []) : [];
      expect(legal).toEqual([idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = resolve(activate(s, "p1", echo, undefined, { targets: { t: legal } }));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      const lib = namesIn(s, s.players.p1?.library);
      expect(lib[0]).toBe("Plains");
      expect(lib.slice(1).sort()).toEqual(["Forest", "Shock"]);
    });

    it("Lich's Relic : à l'arrivée, payer {2} détruit une créature ou un planeswalker adverse ; équipée +2/+1 ; Équiper {2}", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { hand: ["Lich's Relic"], battlefield: lands("Swamp", 3) },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(cast(s, "p1", "Lich's Relic"), answering(yes, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      };
      expect(graveOf(run(true), "p2")).toEqual(["Serra Angel"]);
      expect(graveOf(run(false), "p2")).toEqual([]);
      let t = scenario({ p1: { battlefield: ["Lich's Relic", "Bear Cub", ...lands("Swamp", 2)] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Lich's Relic"), "Équiper", { targets: { t: [bear] } }));
      expect(pt(t, bear)).toEqual([4, 3]);
    });

    it("Loyal Tutor : cherchez une carte de planeswalker et mettez-la sur le dessus de votre bibliothèque", () => {
      let s = scenario({
        p1: { hand: ["Loyal Tutor"], battlefield: ["Plains"], library: ["Forest", "Forest", "Ajani Resolute", "Forest"] },
      });
      s = resolve(cast(s, "p1", "Loyal Tutor"));
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Ajani Resolute");
      expect(s.players.p1?.library).toHaveLength(4);
    });
  });

  describe("sorts préparés", () => {
    it("Bloodline Recollector — Ancestral Craving : le joueur ciblé pioche trois cartes et perd 3 PV", () => {
      let s = scenario({ p1: { battlefield: ["Bloodline Recollector", "Swamp"] } });
      const r = idOf(s, "p1", "battlefield", "Bloodline Recollector");
      setPrepared(s, s.objects[r] as NonNullable<S["objects"][string]>, true);
      s = resolve(castCopy(s, r, { targets: { t: ["p2"] } }));
      expect(s.players.p2?.hand).toHaveLength(3);
      expect(life(s, "p2")).toBe(17);
      expect(prepared(s, r)).toBe(false);
    });

    it("Carnivorous Cultivator — Enroot : cherchez une carte de terrain et mettez-la dans votre cimetière", () => {
      let s = scenario({ p1: { battlefield: ["Carnivorous Cultivator", "Forest"], library: ["Shock", "Plains", "Shock"] } });
      const c = idOf(s, "p1", "battlefield", "Carnivorous Cultivator");
      setPrepared(s, s.objects[c] as NonNullable<S["objects"][string]>, true);
      s = resolve(castCopy(s, c));
      expect(graveOf(s, "p1")).toEqual(["Plains"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Diviner of Victory — Unwind History : renvoie une créature adverse de valeur de mana 3 ou moins, puis surveillance 1", () => {
      let s = scenario({
        p1: { battlefield: ["Diviner of Victory", ...lands("Island", 2)] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const d = idOf(s, "p1", "battlefield", "Diviner of Victory");
      setPrepared(s, s.objects[d] as NonNullable<S["objects"][string]>, true);
      const copy = s.objects[d]?.preparedCopy as string;
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === copy);
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Bear Cub")]);
      let surveilled = false;
      s = resolve(castCopy(s, d, { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(handOf(s, "p2")).toEqual(["Bear Cub"]);
      expect(surveilled).toBe(true);
      expect(pt(s, d)).toEqual([2, 2]); // et la surveillance déclenche sa capacité
    });

    it("Pompous Battlemage : prouesse, arrive préparée ; Improvised Act : vous pouvez défausser une carte, et si vous le faites, piochez", () => {
      let s = scenario({ p1: { hand: ["Pompous Battlemage", "Opt"], battlefield: lands("Mountain", 2) } });
      s = resolve(cast(s, "p1", "Pompous Battlemage"));
      const b = idOf(s, "p1", "battlefield", "Pompous Battlemage");
      expect(prepared(s, b)).toBe(true);
      expect(chars(s, b).keywords).toContain("prowess");
      const run = (discard: boolean) => {
        const t = resolve(castCopy(s, b), (req) =>
          req.intent === "discard" && req.type === "pick" ? (discard ? req.options.slice(0, 1) : []) : undefined,
        );
        return { hand: handOf(t, "p1"), grave: graveOf(t, "p1") };
      };
      expect(run(true)).toEqual({ hand: ["Forest"], grave: ["Opt"] });
      expect(run(false)).toEqual({ hand: ["Opt"], grave: [] });
    });

    it("Pyre Rhymer : prouesse, arrive préparée ; Molten Tide : jusqu'à la fin du tour, une Montagne engagée pour du mana ajoute {R} de plus", () => {
      let s = scenario({ p1: { hand: ["Pyre Rhymer"], battlefield: lands("Mountain", 5) } });
      s = resolve(cast(s, "p1", "Pyre Rhymer"));
      const r = idOf(s, "p1", "battlefield", "Pyre Rhymer");
      expect(prepared(s, r)).toBe(true);
      expect(chars(s, r).keywords).toContain("prowess");
      s = resolve(castCopy(s, r));
      const m = s.battlefield.find((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped) as string;
      s = act(s, "p1", { type: "tapForMana", source: m, ability: 0 });
      expect(s.players.p1?.manaPool.R).toBe(2);
    });
  });

  describe("rares (3)", () => {
    it("Lyra, Archangel of Dawn : vol ; chaque gain de PV met un marqueur +1/+1 sur chacun de vos Anges", () => {
      let s = scenario({
        p1: { battlefield: ["Lyra, Archangel of Dawn", "Serra Angel", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      gainLife(s, "p1", 2);
      s = resolve(s);
      expect(counters(s, idOf(s, "p1", "battlefield", "Lyra, Archangel of Dawn"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
      gainLife(s, "p2", 2);
      s = resolve(s);
      expect(counters(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toBe(1);
    });

    it("Lyra, Tolarian Archangel : à chaque étape de fin, un Ange 3/3 volant si vous avez pioché trois cartes ce tour-ci", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Lyra, Tolarian Archangel"] } });
        drawCards(s, "p1", n);
        s = toEndStep(s);
        return tokensNamed(s, "Angel");
      };
      expect(run(2)).toHaveLength(0);
      const s = scenario({ p1: { battlefield: ["Lyra, Tolarian Archangel"] } });
      drawCards(s, "p1", 3);
      const t = toEndStep(s);
      const angels = t.battlefield.filter((id) => t.objects[id]?.isToken);
      expect(angels).toHaveLength(1);
      expect(pt(t, angels[0] as string)).toEqual([3, 3]);
      expect(chars(t, angels[0] as string).keywords).toContain("flying");
    });

    it("Lyra, Tolarian Archangel : {3}{U}{U} : jusqu'à la fin du tour, ses blessures de combat à un joueur font piocher deux cartes", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { battlefield: ["Lyra, Tolarian Archangel", ...lands("Island", 5)] } });
        const lyra = idOf(s, "p1", "battlefield", "Lyra, Tolarian Archangel");
        if (pay) s = resolve(activate(s, "p1", lyra));
        s = attackThrough(s, [lyra]);
        return [life(s, "p2"), s.players.p1?.hand.length];
      };
      expect(run(true)).toEqual([17, 2]);
      expect(run(false)).toEqual([17, 0]);
    });

    it("Master of Barbs : menace ; quand un adversaire subit des blessures non de combat, vos créatures gagnent +1/+0", () => {
      let s = scenario({
        p1: { hand: ["Shock", "Shock"], battlefield: ["Master of Barbs", "Bear Cub", ...lands("Mountain", 2)] },
      });
      const master = idOf(s, "p1", "battlefield", "Master of Barbs");
      expect(chars(s, master).keywords).toContain("menace");
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(pt(s, master)).toEqual([2, 1]);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(pt(s, master)).toEqual([3, 1]);
    });

    it("Master of Barbs : de toute source (même adverse) ; un déclenchement par lot d'adversaires blessés ; pas au combat", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Master of Barbs"] }, p2: { battlefield: ["Bear Cub"] } });
      const master = idOf(s, "p1", "battlefield", "Master of Barbs");
      const cub = sourceFromObject(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      // Une source de l'adversaire lui inflige des blessures non de combat.
      dealDamage(s, cub, "p2", 1, false);
      s = resolve(s);
      expect(pt(s, master)).toEqual([3, 1]);
      // Deux adversaires blessés en même temps : un seul déclenchement.
      simultaneously(s, () => {
        dealDamage(s, cub, "p2", 1, false);
        dealDamage(s, cub, "p3", 1, false);
      });
      s = resolve(s);
      expect(pt(s, master)).toEqual([4, 1]);
      // Blessures de combat, ou blessures non de combat à vous : rien.
      dealDamage(s, cub, "p2", 1, true);
      dealDamage(s, cub, "p1", 1, false);
      expect(s.triggers).toHaveLength(0);
    });

    it("Null Summoner : lancée, exile une carte non-terrain de la main adverse ; avec le seuil, vous pouvez la lancer avec du mana de tout type", () => {
      const run = (grave: number) => {
        let s = scenario({
          p1: { hand: ["Null Summoner"], battlefield: ["Island", ...lands("Swamp", 8)], graveyard: lands("Plains", grave) },
          p2: { hand: ["Serra Angel", "Forest"] },
        });
        const angel = idOf(s, "p2", "hand", "Serra Angel");
        s = resolve(cast(s, "p1", "Null Summoner"), answering(true, [angel]));
        expect(handOf(s, "p2")).toEqual(["Forest"]);
        expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
        return { s, angel: s.exile[0] as string };
      };
      const without = run(6);
      expect(castable(without.s, "p1", without.angel)).toBe(false);
      const w = run(7);
      expect(castable(w.s, "p1", w.angel)).toBe(true);
      const t = resolve(act(w.s, "p1", { type: "cast", card: w.angel }));
      expect(idsOf(t, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Null Summoner : arrivée sans avoir été lancée (Flickering Hound) : rien n'est exilé", () => {
      let s = scenario({
        p1: { hand: ["Savannah Lions"], battlefield: ["Flickering Hound", "Null Summoner", "Plains"] },
        p2: { hand: ["Serra Angel"] },
      });
      const ns = idOf(s, "p1", "battlefield", "Null Summoner");
      s = resolve(cast(s, "p1", "Savannah Lions"), answering(true, [ns]));
      expect(s.battlefield).not.toContain(ns);
      expect(handOf(s, "p2")).toEqual(["Serra Angel"]);
    });

    it("terrains lents (Overgrown Farmland, Rockfall Vale, Shipwreck Marsh) : engagés avec moins de deux autres terrains ; leurs deux couleurs", () => {
      for (const [land, colors] of [
        ["Overgrown Farmland", ["G", "W"]],
        ["Rockfall Vale", ["R", "G"]],
        ["Shipwreck Marsh", ["U", "B"]],
      ] as const) {
        let s = scenario({ p1: { hand: [land], battlefield: ["Plains"] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", land) });
        expect(s.objects[idOf(s, "p1", "battlefield", land)]?.tapped).toBe(true);
        let t = scenario({ p1: { hand: [land], battlefield: ["Plains", "Island"] } });
        t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", land) });
        const id = idOf(t, "p1", "battlefield", land);
        expect(t.objects[id]?.tapped).toBe(false);
        const offered = legalActions(t, "p1").filter((a) => a.type === "tapForMana" && a.source === id);
        expect(offered.flatMap((a) => (a.type === "tapForMana" ? a.colors : [])).sort()).toEqual([...colors].sort());
      }
    });

    it("Puppet Crafting : l'artefact enchanté devient une créature Construct 5/5 ; {4}{G} : revient du cimetière en main", () => {
      let s = scenario({ p1: { hand: ["Puppet Crafting"], battlefield: ["Eye of Jace", "Bear Cub", ...lands("Forest", 2)] } });
      const eye = idOf(s, "p1", "battlefield", "Eye of Jace");
      expect(() =>
        cast(s, "p1", "Puppet Crafting", { targets: { enchant: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      ).toThrow(RulesError);
      s = resolve(cast(s, "p1", "Puppet Crafting", { targets: { enchant: [eye] } }));
      expect(chars(s, eye).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, eye).subtypes).toContain("Construct");
      expect(pt(s, eye)).toEqual([5, 5]);
      let t = scenario({ p1: { graveyard: ["Puppet Crafting"], battlefield: lands("Forest", 5) } });
      t = resolve(activate(t, "p1", idOf(t, "p1", "graveyard", "Puppet Crafting")));
      expect(handOf(t, "p1")).toEqual(["Puppet Crafting"]);
    });

    it("Repurposed Enforcer : quand il attaque, renforcez Jace X (X = vos créatures)", () => {
      let s = scenario({ p1: { battlefield: ["Repurposed Enforcer", "Bear Cub", "Savannah Lions"] } });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Repurposed Enforcer")]));
      expect(jaceLoyalty(s)).toBe(3);
    });

    it("Rise of the Deathbringer : piochez selon la plus grande force de vos créatures et perdez autant de PV ; ou toutes les créatures −3/−3", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Rise of the Deathbringer"], battlefield: ["Serra Angel", "Bear Cub", ...lands("Swamp", 5)] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
      const draw = resolve(cast(setup(), "p1", "Rise of the Deathbringer", { mode: 0 }));
      expect(draw.players.p1?.hand).toHaveLength(4);
      expect(life(draw, "p1")).toBe(16);
      const shrink = resolve(cast(setup(), "p1", "Rise of the Deathbringer", { mode: 1 }));
      expect(graveOf(shrink, "p1").sort()).toEqual(["Bear Cub", "Rise of the Deathbringer"]);
      expect(pt(shrink, idOf(shrink, "p1", "battlefield", "Serra Angel"))).toEqual([1, 1]);
      expect(pt(shrink, idOf(shrink, "p2", "battlefield", "Shivan Dragon"))).toEqual([2, 2]);
    });

    it("Roiling Canopy : arrive engagé ; une Forêt qui arrive avec au moins cinq autres Forêts donne +3/+3 à une de vos créatures", () => {
      let c = scenario({ p1: { hand: ["Roiling Canopy"] } });
      c = act(c, "p1", { type: "playLand", card: idOf(c, "p1", "hand", "Roiling Canopy") });
      expect(c.objects[idOf(c, "p1", "battlefield", "Roiling Canopy")]?.tapped).toBe(true);
      const run = (forests: number) => {
        let s = scenario({ p1: { hand: ["Forest"], battlefield: ["Roiling Canopy", "Bear Cub", ...lands("Forest", forests)] } });
        s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        return pt(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      };
      expect(run(5)).toEqual([5, 5]);
      expect(run(4)).toEqual([2, 2]);
    });

    it("Samut, Hazoret's Champion : vos créatures ont la célérité", () => {
      const s = scenario({
        p1: { battlefield: ["Samut, Hazoret's Champion", { name: "Bear Cub", sick: true }] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
      expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("haste");
    });

    it("Simulacrum Shaper : à l'arrivée, vous pouvez chercher un terrain de base, mis engagé ; quand elle meurt, piochez", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { hand: ["Simulacrum Shaper"], battlefield: lands("Forest", 3), library: ["Shock", "Plains", "Shock"] },
        });
        return resolve(cast(s, "p1", "Simulacrum Shaper"), answering(yes));
      };
      const yes = run(true);
      const plains = idOf(yes, "p1", "battlefield", "Plains");
      expect(yes.objects[plains]?.tapped).toBe(true);
      expect(idsOf(run(false), "p1", "battlefield", "Plains")).toHaveLength(0);
      destroy(yes, idOf(yes, "p1", "battlefield", "Simulacrum Shaper"));
      const after = resolve(yes);
      expect(after.players.p1?.hand).toHaveLength(1);
    });

    it("Solarium Sentry : +2 PV quand un adversaire lance un sort de valeur de mana 2 ou moins (pas 3, pas vos sorts)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Solarium Sentry"] },
        p2: { hand: ["Bear Cub", "Seasoned Cryomancer"], battlefield: [...lands("Forest", 2), ...lands("Island", 3)] },
      });
      s = resolve(cast(s, "p2", "Bear Cub"));
      expect(life(s, "p1")).toBe(22);
      s = resolve(cast(s, "p2", "Seasoned Cryomancer"));
      expect(life(s, "p1")).toBe(22);
      let t = scenario({ p1: { hand: ["Bear Cub"], battlefield: ["Solarium Sentry", ...lands("Forest", 2)] } });
      t = resolve(cast(t, "p1", "Bear Cub"));
      expect(life(t, "p1")).toBe(20);
    });
  });

  describe("rares (4)", () => {
    it("Solitary Cell : à l'arrivée, exile un permanent non-terrain adverse de valeur de mana 3 ou moins jusqu'à son départ", () => {
      let s = scenario({
        p1: { hand: ["Solitary Cell"], battlefield: ["Mountain", "Plains"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Forest"] },
      });
      // Seule cible légale (l'Ange a une valeur de mana de 5) : choisie d'office.
      s = resolve(cast(s, "p1", "Solitary Cell"));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      destroy(s, idOf(s, "p1", "battlefield", "Solitary Cell"));
      s = resolve(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Solitary Cell : {1}, {T}, défaussez une carte légendaire : piochez une carte", () => {
      const setup = (hand: string[]) => scenario({ p1: { hand, battlefield: ["Solitary Cell", "Mountain"] } });
      const plain = setup(["Bear Cub"]);
      expect(canUse(plain, "p1", idOf(plain, "p1", "battlefield", "Solitary Cell"))).toBe(false);
      let s = setup(["Samut, Hazoret's Champion"]);
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Solitary Cell")));
      expect(graveOf(s, "p1")).toEqual(["Samut, Hazoret's Champion"]);
      expect(handOf(s, "p1")).toEqual(["Forest"]);
    });

    it("Sphinx of False Conclusions : flash, vol ; quand il attaque, piochez puis défaussez ; mort (s'il n'est pas un jeton), un jeton copie", () => {
      let s = scenario({ p1: { battlefield: ["Sphinx of False Conclusions"], hand: ["Opt"] } });
      const sphinx = idOf(s, "p1", "battlefield", "Sphinx of False Conclusions");
      expect(chars(s, sphinx).keywords).toEqual(expect.arrayContaining(["flash", "flying"]));
      s = settleNoBlocks(attack(s, [sphinx]));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sphinx of False Conclusions"] } });
      destroy(t, idOf(t, "p1", "battlefield", "Sphinx of False Conclusions"));
      t = resolve(t);
      const copy = idOf(t, "p1", "battlefield", "Sphinx of False Conclusions");
      expect(t.objects[copy]?.isToken).toBe(true);
      destroy(t, copy);
      t = resolve(t);
      expect(idsOf(t, "p1", "battlefield", "Sphinx of False Conclusions")).toHaveLength(0);
    });

    it("Stinging Vitriol : 2 blessures à l'adversaire ciblé, qui défausse la carte non-terrain de votre choix", () => {
      let s = scenario({
        p1: { hand: ["Stinging Vitriol"], battlefield: ["Swamp", "Mountain"] },
        p2: { hand: ["Serra Angel", "Forest", "Shock"] },
      });
      const shock = idOf(s, "p2", "hand", "Shock");
      let options: (string | undefined)[] = [];
      s = resolve(cast(s, "p1", "Stinging Vitriol", { targets: { t: ["p2"] } }), (req, player, x) => {
        if (req.type !== "pick" || req.intent !== "discard") return undefined;
        expect(player).toBe("p1");
        options = namesIn(x, req.options);
        return [shock];
      });
      expect(options.sort()).toEqual(["Serra Angel", "Shock"]);
      expect(life(s, "p2")).toBe(18);
      expect(graveOf(s, "p2")).toEqual(["Shock"]);
    });

    it("Theorist's Sanctum : Île ; engagé sauf en contemplant un Jace ; {2}{U}, {T} : renforcez Jace 2", () => {
      let s = scenario({ p1: { hand: ["Theorist's Sanctum"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Theorist's Sanctum") });
      const sanctum = idOf(s, "p1", "battlefield", "Theorist's Sanctum");
      expect(s.objects[sanctum]?.tapped).toBe(true);
      expect(chars(s, sanctum).subtypes).toContain("Island");
      let t = scenario({ p1: { hand: ["Theorist's Sanctum", "Jace, Reality Sculptor"] } });
      t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Theorist's Sanctum") });
      expect(t.objects[idOf(t, "p1", "battlefield", "Theorist's Sanctum")]?.tapped).toBe(false);
      let u = scenario({ p1: { battlefield: ["Theorist's Sanctum", ...lands("Island", 3)] } });
      u = resolve(activate(u, "p1", idOf(u, "p1", "battlefield", "Theorist's Sanctum"), "Renforcez"));
      expect(jaceLoyalty(u)).toBe(2);
    });

    it("Variable Chaser : vol, prouesse, arrive préparée ; Arc of Fortune : chaque joueur peut défausser sa main et piocher sept cartes", () => {
      let s = scenario({
        p1: { hand: ["Variable Chaser", "Opt"], battlefield: lands("Island", 6) },
        p2: { hand: ["Shock", "Shock"] },
      });
      s = resolve(cast(s, "p1", "Variable Chaser"));
      const v = idOf(s, "p1", "battlefield", "Variable Chaser");
      expect(prepared(s, v)).toBe(true);
      expect(chars(s, v).keywords).toEqual(expect.arrayContaining(["flying", "prowess"]));
      s = resolve(castCopy(s, v), (req, player) => (req.type === "yesNo" ? [player === "p1" ? 1 : 0] : undefined));
      expect(s.players.p1?.hand).toHaveLength(7);
      expect(graveOf(s, "p1")).toEqual(["Opt"]);
      expect(handOf(s, "p2")).toEqual(["Shock", "Shock"]);
    });

    it("Verdant Kraken : à l'entretien de chaque joueur, vous créez un jeton Forêt Tentacule 3/3 (terrain-créature)", () => {
      let s = scenario({ p1: { battlefield: ["Verdant Kraken"] } });
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2" && x.turn.step === "main1",
      );
      const [tok] = s.battlefield.filter((id) => s.objects[id]?.isToken);
      expect(s.objects[tok as string]?.controller).toBe("p1");
      expect(chars(s, tok as string).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(chars(s, tok as string).subtypes).toContain("Forest");
      expect(pt(s, tok as string)).toEqual([3, 3]);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(2);
    });

    it("Vindictive Triumph : exile une créature ; valeur de mana 3 ou moins, elle revient engagée sous votre contrôle et est exilée à l'étape de fin", () => {
      let s = scenario({
        p1: { hand: ["Vindictive Triumph"], battlefield: ["Plains", "Swamp", "Swamp"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Vindictive Triumph", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
      s = toEndStep(s);
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { hand: ["Vindictive Triumph"], battlefield: ["Plains", "Swamp", "Swamp"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      t = resolve(cast(t, "p1", "Vindictive Triumph", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
      expect(namesIn(t, t.exile)).toEqual(["Serra Angel"]);
      expect(t.battlefield.some((id) => nameOf(t, id) === "Serra Angel")).toBe(false);
    });

    it("Vraska, Soul of Stone : vos créatures-artefacts ont la vigilance ; un sort non-créature lancé crée une Sculpture Trésor 1/1", () => {
      let s = scenario({
        p1: { hand: ["Shock", "Bear Cub"], battlefield: ["Vraska, Soul of Stone", "Mountain", ...lands("Forest", 2)] },
      });
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      const [tok] = s.battlefield.filter((id) => s.objects[id]?.isToken);
      expect(chars(s, tok as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, tok as string).subtypes).toEqual(expect.arrayContaining(["Sculpture", "Treasure"]));
      expect(pt(s, tok as string)).toEqual([1, 1]);
      expect(chars(s, tok as string).keywords).toContain("vigilance");
      expect(chars(s, idOf(s, "p1", "battlefield", "Vraska, Soul of Stone")).keywords).not.toContain("vigilance");
      s = resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    });

    it("Vraska, the Cutting Glare : contact mortel ; à l'arrivée avec six terrains, détruit un permanent adverse, dont le contrôleur crée un Trésor", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { hand: ["Vraska, the Cutting Glare"], battlefield: ["Forest", ...lands("Swamp", n - 1)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(
          cast(s, "p1", "Vraska, the Cutting Glare"),
          answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]),
        );
      };
      const six = run(6);
      expect(graveOf(six, "p2")).toEqual(["Serra Angel"]);
      expect(tokensNamed(six, "Treasure", "p2")).toHaveLength(1);
      expect(chars(six, idOf(six, "p1", "battlefield", "Vraska, the Cutting Glare")).keywords).toContain("deathtouch");
      const five = run(5);
      expect(graveOf(five, "p2")).toEqual([]);
      expect(tokensNamed(five, "Treasure", "p2")).toHaveLength(0);
    });

    it("Vraska's Final Mercy : perdez 2 PV et détruisez une créature ou un planeswalker ; ou perdez 2 PV et renforcez Jace 6", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Vraska's Final Mercy"], battlefield: lands("Swamp", 2) },
          p2: { battlefield: ["Ajani Resolute"] },
        });
      let s = setup();
      s = resolve(
        cast(s, "p1", "Vraska's Final Mercy", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Ajani Resolute")] } }),
      );
      expect(life(s, "p1")).toBe(18);
      expect(graveOf(s, "p2")).toEqual(["Ajani Resolute"]);
      const t = resolve(cast(setup(), "p1", "Vraska's Final Mercy", { mode: 1 }));
      expect(life(t, "p1")).toBe(18);
      expect(jaceLoyalty(t)).toBe(6);
    });

    it("Fblthp, Knows the Way : à l'arrivée, jusqu'à X terrains de base de noms différents en main (X payé)", () => {
      let s = scenario({
        p1: {
          hand: ["Fblthp, Knows the Way"],
          battlefield: lands("Forest", 4),
          library: ["Plains", "Plains", "Island", "Shock"],
        },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Fblthp, Knows the Way", { x: 2 }), (req, _p, x) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = req.options;
        expect(req.max).toBe(2);
        return [...(pickNamed(x, req, "Plains") ?? []), ...(pickNamed(x, req, "Island") ?? [])];
      });
      expect(offered.length).toBeGreaterThan(0);
      expect(handOf(s, "p1").sort()).toEqual(["Island", "Plains"]);
    });
  });

  describe("peu communes (1)", () => {
    /** Réponse : le mode `mode` d'un déclencheur modal, puis `want` dans les choix. */
    const withMode =
      (mode: number, want: string[] = []): Answer =>
      (req) => {
        if (req.intent === "triggerMode") return [String(mode)];
        return answering(true, want)(req, "p1", undefined as never);
      };

    it("Archive Arbiter : vol ; à l'arrivée, détruisez un permanent non-créature non-terrain, ou gagnez 4 PV", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Archive Arbiter"], battlefield: lands("Plains", 6) },
          p2: { battlefield: ["Eye of Jace", "Bear Cub"] },
        });
      let s = setup();
      const eye = idOf(s, "p2", "battlefield", "Eye of Jace");
      s = resolve(cast(s, "p1", "Archive Arbiter"), withMode(0, [eye]));
      expect(graveOf(s, "p2")).toEqual(["Eye of Jace"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Archive Arbiter")).keywords).toContain("flying");
      const t = resolve(cast(setup(), "p1", "Archive Arbiter"), withMode(1));
      expect(life(t, "p1")).toBe(24);
      expect(graveOf(t, "p2")).toEqual([]);
    });

    it("Arni, Humble Scribe : {T} : piochez puis défaussez ; se dégage quand une autre créature non-jeton arrive sous votre contrôle", () => {
      let s = scenario({ p1: { battlefield: ["Arni, Humble Scribe", ...lands("Forest", 2)], hand: ["Bear Cub", "Opt"] } });
      const arni = idOf(s, "p1", "battlefield", "Arni, Humble Scribe");
      s = resolve(activate(s, "p1", arni), (req) => (req.intent === "discard" ? pickNamed(s, req, "Opt") : undefined));
      expect(graveOf(s, "p1")).toEqual(["Opt"]);
      expect(s.objects[arni]?.tapped).toBe(true);
      createTokens(s, "p1", { name: "Cadet", colors: [], types: ["Creature"], subtypes: [], power: 2, toughness: 2 }, 1);
      s = resolve(s);
      expect(s.objects[arni]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(s.objects[arni]?.tapped).toBe(false);
    });

    it("Arni, Renowned Champion : piétinement ; +X/+0 quand une autre de vos créatures arrive (X = sa force)", () => {
      let s = scenario({ p1: { hand: ["Serra Angel"], battlefield: ["Arni, Renowned Champion", ...lands("Plains", 5)] } });
      const arni = idOf(s, "p1", "battlefield", "Arni, Renowned Champion");
      expect(chars(s, arni).keywords).toContain("trample");
      s = resolve(cast(s, "p1", "Serra Angel"));
      expect(pt(s, arni)).toEqual([5, 5]);
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Arni, Renowned Champion"] },
        p2: { hand: ["Bear Cub"], battlefield: lands("Forest", 2) },
      });
      t = resolve(cast(t, "p2", "Bear Cub"));
      expect(pt(t, idOf(t, "p1", "battlefield", "Arni, Renowned Champion"))).toEqual([1, 5]);
    });

    it("Bloombrute : piochez au premier gain de PV du tour ; {4}{G}{W} : piétinement et lien de vie jusqu'à la fin du tour", () => {
      let s = scenario({ p1: { battlefield: ["Bloombrute", "Bear Cub", ...lands("Forest", 5), "Plains"] } });
      gainLife(s, "p1", 1);
      s = resolve(s);
      gainLife(s, "p1", 1);
      s = resolve(s);
      expect(s.players.p1?.hand).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Bloombrute"), undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      s = toEndStep(s);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2",
      );
      expect(chars(s, bear).keywords).not.toContain("lifelink");
    });

    it("Clash of Elements : le propriétaire met le permanent au-dessus (et subit 2 blessures) ou au-dessous de sa bibliothèque", () => {
      const run = (where: "top" | "bottom") => {
        const s = scenario({
          p1: { hand: ["Clash of Elements"], battlefield: ["Island", "Mountain", "Mountain"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        let asked = "";
        const t = resolve(
          cast(s, "p1", "Clash of Elements", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
          (req, player) => {
            if (req.intent !== "topOrBottom") return undefined;
            asked = player;
            return [where];
          },
        );
        expect(asked).toBe("p2");
        const lib = namesIn(t, t.players.p2?.library);
        return { life: life(t, "p2"), pos: lib.indexOf("Serra Angel"), size: lib.length };
      };
      expect(run("top")).toEqual({ life: 18, pos: 0, size: 11 });
      expect(run("bottom")).toEqual({ life: 20, pos: 10, size: 11 });
    });

    it("Command the Stage : un Cadet, puis un marqueur sur chaque autre jeton Sorcier ; revient en main à l'entretien si un adversaire a subi des blessures non de combat au tour précédent", () => {
      let s = scenario({ p1: { hand: ["Command the Stage"], battlefield: lands("Mountain", 3) } });
      const [old] = createTokens(
        s,
        "p1",
        { name: "Cadet", colors: [], types: ["Creature"], subtypes: ["Wizard", "Soldier"], power: 2, toughness: 2 },
        1,
      );
      s = resolve(cast(s, "p1", "Command the Stage"));
      const cadets = tokensNamed(s, "Cadet");
      expect(cadets).toHaveLength(2);
      expect(counters(s, old as string)).toBe(1);
      expect(counters(s, cadets.find((id) => id !== old) as string)).toBe(0);
      const run = (damage: boolean) => {
        let t = scenario({ p1: { hand: ["Shock"], battlefield: ["Mountain"], graveyard: ["Command the Stage"] } });
        if (damage) t = resolve(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
        t = play(
          t,
          () => undefined,
          (x) => x.turn.active === "p2" && x.turn.step === "main1",
        );
        return handOf(t, "p1");
      };
      expect(run(true)).toEqual(["Command the Stage"]);
      expect(run(false)).toEqual(["Shock"]);
    });

    it("Craftwork Crusher : piétinement ; à l'arrivée, deux modes parmi 4 blessures, un Cadet, piocher", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Craftwork Crusher"], battlefield: [...lands("Mountain", 3), ...lands("Forest", 4)] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      s = resolve(cast(s, "p1", "Craftwork Crusher"), withMode(0, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(tokensNamed(s, "Cadet")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(chars(s, idOf(s, "p1", "battlefield", "Craftwork Crusher")).keywords).toContain("trample");
      const t = resolve(cast(setup(), "p1", "Craftwork Crusher"), withMode(2));
      expect(tokensNamed(t, "Cadet")).toHaveLength(1);
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(graveOf(t, "p2")).toEqual([]);
    });

    it("Danitha, Spear of Agony : initiative ; un marqueur quand vous lancez un sort qui cible un adversaire ou une créature adverse", () => {
      let s = scenario({
        p1: {
          hand: ["Shock", "Shock", "Shock"],
          battlefield: ["Danitha, Spear of Agony", "Serra Angel", ...lands("Mountain", 3)],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const d = idOf(s, "p1", "battlefield", "Danitha, Spear of Agony");
      expect(chars(s, d).keywords).toContain("firstStrike");
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Serra Angel")] } }));
      expect(counters(s, d)).toBe(0);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(counters(s, d)).toBe(1);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(counters(s, d)).toBe(2);
    });

    it("Danitha, Sword of Hope : piochez (une fois par tour) en lançant un Équipement ou un sort qui cible une de vos créatures", () => {
      let s = scenario({ p1: { hand: ["Lich's Relic", "Shock"], battlefield: ["Danitha, Sword of Hope", "Swamp", "Mountain"] } });
      s = resolve(cast(s, "p1", "Lich's Relic"), answering(false));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Danitha, Sword of Hope")] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      let t = scenario({ p1: { hand: ["Shock"], battlefield: ["Danitha, Sword of Hope", "Mountain"] } });
      t = resolve(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(t.players.p1?.hand).toHaveLength(0);
    });

    it("Desperate Futurescribe : au début de votre combat, une autre de vos créatures +1/+1 ; un marqueur +1/+1 à la place si vous avez regardé ou surveillé", () => {
      const run = (scry: boolean) => {
        let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Desperate Futurescribe", "Bear Cub", "Island"] } });
        if (scry) s = resolve(cast(s, "p1", "Opt"));
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = play(
          s,
          () => undefined,
          (x) =>
            x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
        );
        return [counters(s, bear), ...pt(s, bear)];
      };
      expect(run(false)).toEqual([0, 3, 3]);
      expect(run(true)).toEqual([1, 3, 3]);
    });

    it("Edgar, Ancient Bloodlord : +1 PV quand une autre de vos créatures meurt ; {2}, sacrifiez-en une autre : marqueur +1/+1 et menace", () => {
      let s = scenario({
        p1: { battlefield: ["Edgar, Ancient Bloodlord", "Bear Cub", "Savannah Lions", ...lands("Plains", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const edgar = idOf(s, "p1", "battlefield", "Edgar, Ancient Bloodlord");
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(s);
      expect(life(s, "p1")).toBe(21);
      s = resolve(activate(s, "p1", edgar));
      expect(graveOf(s, "p1").sort()).toEqual(["Bear Cub", "Savannah Lions"]);
      expect(counters(s, edgar)).toBe(1);
      expect(chars(s, edgar).keywords).toContain("menace");
      expect(life(s, "p1")).toBe(22);
    });

    it("Edgar, Moonlit Sovereign : flash ; deux marqueurs à votre étape de fin sans sort lancé ce tour-ci ; {4}{G} : un marqueur sur chaque créature qui en a", () => {
      const run = (castSpell: boolean) => {
        let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Edgar, Moonlit Sovereign", "Island"] } });
        if (castSpell) s = resolve(cast(s, "p1", "Opt"));
        s = toEndStep(s);
        return counters(s, idOf(s, "p1", "battlefield", "Edgar, Moonlit Sovereign"));
      };
      expect(run(false)).toBe(2);
      expect(run(true)).toBe(0);
      let s = scenario({
        p1: {
          battlefield: [
            "Edgar, Moonlit Sovereign",
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            "Savannah Lions",
            ...lands("Forest", 5),
          ],
        },
      });
      const edgar = idOf(s, "p1", "battlefield", "Edgar, Moonlit Sovereign");
      expect(chars(s, edgar).keywords).toContain("flash");
      s = resolve(activate(s, "p1", edgar));
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(2);
      expect(counters(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(0);
      expect(counters(s, edgar)).toBe(0);
    });

    it("Essence Burn : 5 blessures à une créature ou un planeswalker noir ou vert, exilé s'il devait mourir", () => {
      let s = scenario({
        p1: { hand: ["Essence Burn"], battlefield: lands("Mountain", 2) },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Essence Burn"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Bear Cub")]);
      s = resolve(cast(s, "p1", "Essence Burn", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(graveOf(s, "p2")).toEqual([]);
    });

    it("Eye of Jace : surveillance 1 à votre entretien ; puis, avec sept cartes au cimetière, sacrifiez-le, 2 blessures à chaque adversaire et +2 PV", () => {
      const run = (grave: number) => {
        let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Eye of Jace"], graveyard: lands("Plains", grave) } });
        s = play(
          s,
          (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined),
          (x) => x.turn.active === "p1" && x.turn.step === "main1",
        );
        return { eye: idsOf(s, "p1", "battlefield", "Eye of Jace").length, life: [life(s, "p1"), life(s, "p2")] };
      };
      expect(run(5)).toEqual({ eye: 1, life: [20, 20] });
      expect(run(6)).toEqual({ eye: 0, life: [22, 18] });
    });

    it("Fblthp, Impossibly Lost : blessures de combat à un adversaire pendant votre tour → piochez deux cartes, Fblthp est mélangé dans la bibliothèque", () => {
      let s = scenario({ p1: { battlefield: ["Fblthp, Impossibly Lost", "Bear Cub"] } });
      s = attackThrough(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Fblthp, Impossibly Lost")).toHaveLength(0);
      expect(namesIn(s, s.players.p1?.library)).toContain("Fblthp, Impossibly Lost");
      // Bibliothèque vide après la pioche : vous gagnez.
      let w = scenario({ p1: { battlefield: ["Fblthp, Impossibly Lost", "Bear Cub"], library: ["Forest"] } });
      w = attackThrough(w, [idOf(w, "p1", "battlefield", "Bear Cub")]);
      expect(w.winner).toBe("p1");
    });

    it("Something Worth Saving : meule quatre cartes (une vraie meule), une carte de permanent meulée peut revenir en main, +1 PV", () => {
      // « Si vous deviez meuler, meulez une carte de plus » : seule une vraie meule est modifiée.
      const MILL_MORE = customCard({
        name: "Test Mill More",
        types: ["Enchantment"],
        typeLine: "Enchantment",
        abilities: [eventReplacement({ event: "mill", to: "you", modify: { add: 1 }, label: "Meule +1" })],
      });
      let s = scenario({
        p1: {
          battlefield: [MILL_MORE, ...lands("Forest", 2)],
          hand: ["Something Worth Saving"],
          library: ["Opt", "Shock", "Lightning Strike", "Opt", "Bear Cub", "Island"],
        },
      });
      const cub = s.players.p1?.library[4] as string;
      s = settle(cast(s, "p1", "Something Worth Saving"), (req) =>
        req.type === "pick" && req.options.includes(cub) ? [cub] : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Fblthp, Impossibly Lost : un déclenchement par étape de blessures de combat (pas une fois par tour), un seul pour plusieurs créatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Fblthp, Impossibly Lost", "Brightblade Stoat", "Bear Cub", "Llanowar Elves"],
          library: lands("Island", 8),
        },
      });
      const fblthp = idOf(s, "p1", "battlefield", "Fblthp, Impossibly Lost");
      const onStack = (x: S) => x.stack.filter((i) => i.sourceId === fblthp).length;
      const [stoat, cub, elves] = ["Brightblade Stoat", "Bear Cub", "Llanowar Elves"].map((n) => idOf(s, "p1", "battlefield", n));
      s = play(
        attack(s, [stoat as string, cub as string, elves as string]),
        () => undefined,
        (x) => onStack(x) > 0,
      );
      expect(s.turn.step).toBe("firstStrikeDamage");
      expect(onStack(s)).toBe(1);
      // La capacité de l'étape d'initiative est retirée de la pile (contrecarrée) : Fblthp reste sur le champ de bataille.
      s.stack = s.stack.filter((i) => i.sourceId !== fblthp);
      s = play(
        s,
        () => undefined,
        (x) => onStack(x) > 0 || x.turn.step === "main2",
      );
      expect(s.turn.step).toBe("combatDamage");
      // Bear Cub et Llanowar Elves blessent l'adversaire en même temps : un seul déclenchement.
      expect(onStack(s)).toBe(1);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority",
      );
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.library)).toContain("Fblthp, Impossibly Lost");
    });
  });

  describe("peu communes (2)", () => {
    it("Flourishing Grapple : une créature adverse rouge ou blanche perd ses capacités ; votre créature lui inflige des blessures égales à sa force", () => {
      let s = scenario({
        p1: { hand: ["Flourishing Grapple"], battlefield: ["Bear Cub", "Forest"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Flourishing Grapple"));
      const legalB = opt?.type === "cast" ? opt.modes[0]?.targets.find((t) => t.legal.includes(angel))?.legal : [];
      expect(legalB).toEqual([angel]); // pas les Llanowar Elves (vertes)
      s = resolve(cast(s, "p1", "Flourishing Grapple", { targets: { b: [angel], a: [bear] } }));
      expect(s.objects[angel]?.damage).toBe(2);
      expect(s.objects[bear]?.damage).toBe(0);
      expect(chars(s, angel).keywords).not.toContain("flying");
    });

    it("Fulminous Forte : 1 blessure à chaque créature et planeswalker adverse, ou 5 blessures à une créature ou un planeswalker", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Fulminous Forte"], battlefield: ["Savannah Lions", ...lands("Mountain", 3)] },
          p2: { battlefield: ["Llanowar Elves", "Ajani Resolute", "Serra Angel"] },
        });
      const all = resolve(cast(setup(), "p1", "Fulminous Forte", { mode: 0 }));
      expect(graveOf(all, "p2")).toEqual(["Llanowar Elves"]);
      expect(all.objects[idOf(all, "p2", "battlefield", "Ajani Resolute")]?.counters.loyalty).toBe(1);
      expect(idsOf(all, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
      let s = setup();
      s = resolve(cast(s, "p1", "Fulminous Forte", { mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
    });

    it("Gallia, the Merrymaker : célérité ; vos autres créatures avec un marqueur +1/+1 ont la célérité ; {1}{R}, {T} : marqueur sur une créature arrivée ce tour-ci", () => {
      let s = scenario({
        p1: {
          hand: ["Gallia, the Merrymaker", "Bear Cub"],
          battlefield: [...lands("Mountain", 4), ...lands("Forest", 2), "Savannah Lions"],
        },
      });
      s = resolve(cast(s, "p1", "Gallia, the Merrymaker"));
      s = resolve(cast(s, "p1", "Bear Cub"));
      const gallia = idOf(s, "p1", "battlefield", "Gallia, the Merrymaker");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, gallia).keywords).toContain("haste");
      expect(chars(s, bear).keywords).not.toContain("haste");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === gallia);
      expect(opt?.type === "activate" && [...(opt.targets[0]?.legal ?? [])].sort()).toEqual([gallia, bear].sort());
      s = resolve(activate(s, "p1", gallia, undefined, { targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("haste");
    });

    it("Gallia, Tragic Host : menace ; {4}{B}, exilez une autre carte de créature de votre cimetière : revient engagée avec un marqueur +1/+1", () => {
      const lone = scenario({ p1: { graveyard: ["Gallia, Tragic Host", "Shock"], battlefield: lands("Swamp", 5) } });
      expect(canUse(lone, "p1", idOf(lone, "p1", "graveyard", "Gallia, Tragic Host"))).toBe(false);
      let s = scenario({ p1: { graveyard: ["Gallia, Tragic Host", "Bear Cub"], battlefield: lands("Swamp", 5) } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "graveyard", "Gallia, Tragic Host")));
      const g = idOf(s, "p1", "battlefield", "Gallia, Tragic Host");
      expect(s.objects[g]?.tapped).toBe(true);
      expect(counters(s, g)).toBe(1);
      expect(chars(s, g).keywords).toContain("menace");
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
    });

    it("Geist of Saint Thalia : vol ; vos sorts non-créature coûtent {1} de moins", () => {
      const s = scenario({ p1: { battlefield: ["Geist of Saint Thalia"], hand: ["Clash of Elements", "Bear Cub"] } });
      const d = (n: string) => s.defs[s.objects[idOf(s, "p1", "hand", n)]?.defId ?? ""]!;
      expect(spellCost(s, "p1", d("Clash of Elements"), {}).generic).toBe(0);
      expect(spellCost(s, "p1", d("Bear Cub"), {}).generic).toBe(1);
      expect(spellCost(s, "p2", d("Clash of Elements"), {}).generic).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Geist of Saint Thalia")).keywords).toContain("flying");
    });

    it("Generous Revival : une carte de créature de valeur de mana 3 ou moins revient avec un marqueur +1/+1 ; flashback {4}{W}", () => {
      let s = scenario({
        p1: {
          hand: ["Generous Revival"],
          battlefield: lands("Plains", 8),
          graveyard: ["Bear Cub", "Serra Angel", "Savannah Lions"],
        },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Generous Revival"));
      expect(namesIn(s, opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : []).sort()).toEqual([
        "Bear Cub",
        "Savannah Lions",
      ]);
      s = resolve(cast(s, "p1", "Generous Revival", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      const fb = idOf(s, "p1", "graveyard", "Generous Revival");
      s = resolve(act(s, "p1", { type: "cast", card: fb, targets: { t: [idOf(s, "p1", "graveyard", "Savannah Lions")] } }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(1);
      expect(namesIn(s, s.exile)).toEqual(["Generous Revival"]);
    });

    it("Ghalta the Unstoppable : coûte {X} de moins (X = la plus grande force parmi vos créatures) ; vos autres créatures ont le piétinement", () => {
      const s = scenario({ p1: { hand: ["Ghalta the Unstoppable"], battlefield: ["Serra Angel", "Bear Cub"] } });
      const d = s.defs[s.objects[idOf(s, "p1", "hand", "Ghalta the Unstoppable")]?.defId ?? ""]!;
      expect(spellCost(s, "p1", d, {}).generic).toBe(4);
      const t = scenario({
        p1: { battlefield: ["Ghalta the Unstoppable", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      expect(chars(t, idOf(t, "p1", "battlefield", "Ghalta the Unstoppable")).keywords).toContain("trample");
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
      expect(chars(t, idOf(t, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("trample");
    });

    it("Hapatra, the Desert Fang : à l'arrivée, X marqueurs −1/−1 sur une créature adverse (X = la plus grande valeur de mana de votre cimetière)", () => {
      let s = scenario({
        p1: {
          hand: ["Hapatra, the Desert Fang"],
          battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)],
          graveyard: ["Serra Angel", "Shock"],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = resolve(cast(s, "p1", "Hapatra, the Desert Fang"), answering(true, [dragon]));
      expect(graveOf(s, "p2")).toEqual(["Shivan Dragon"]);
    });

    it("Hapatra, the Desert Fang : en multijoueur, jusqu'à une créature ciblée par adversaire", () => {
      const setup = () =>
        scenario({
          players: 3,
          p1: {
            hand: ["Hapatra, the Desert Fang"],
            battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)],
            graveyard: ["Serra Angel"],
          },
          p2: { battlefield: ["Shivan Dragon", "Bear Cub"] },
          p3: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      const angel = idOf(s, "p3", "battlefield", "Serra Angel");
      let max = 0;
      s = resolve(cast(s, "p1", "Hapatra, the Desert Fang"), (req) => {
        if (req.type === "pick" && req.intent === "triggerTarget") {
          max = req.max;
          return [dragon, angel];
        }
        return undefined;
      });
      expect(max).toBeGreaterThanOrEqual(2);
      // X = 5 (Serra Angel) : chacune reçoit cinq marqueurs −1/−1.
      expect(graveOf(s, "p2")).toEqual(["Shivan Dragon"]);
      expect(graveOf(s, "p3")).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      // Deux créatures du même adversaire : refusé.
      const t = setup();
      const cub = idOf(t, "p2", "battlefield", "Bear Cub");
      const dragon2 = idOf(t, "p2", "battlefield", "Shivan Dragon");
      expect(() =>
        resolve(cast(t, "p1", "Hapatra, the Desert Fang"), (req) =>
          req.type === "pick" && req.intent === "triggerTarget" ? [dragon2, cub] : undefined,
        ),
      ).toThrow(RulesError);
    });

    it("Garruk, Veiled Butcher −3 : chaque adversaire défausse deux cartes ; une carte par adversaire qui n'a pas défaussé deux cartes non-terrain", () => {
      const minusThree = (s: S) => {
        const garruk = idOf(s, "p1", "battlefield", "Garruk, Veiled Butcher");
        const ability = chars(s, garruk).abilities.findIndex(
          (ab) => ab.kind === "activated" && !!ab.label?.includes("Chaque adversaire"),
        );
        return resolve(act(s, "p1", { type: "activate", source: garruk, ability }));
      };
      const run = (p3Hand: string[]) => {
        const s = scenario({
          players: 3,
          p1: { battlefield: ["Garruk, Veiled Butcher"] },
          p2: { hand: ["Shock", "Opt", "Forest"] },
          p3: { hand: p3Hand },
        });
        // Chaque adversaire défausse les deux premières cartes de sa main (réponse suggérée).
        return minusThree(s);
      };
      // p2 défausse Shock et Opt (deux non-terrain) ; p3, un terrain et un Shock : une carte.
      let s = run(["Forest", "Shock"]);
      expect(graveOf(s, "p2")).toEqual(["Shock", "Opt"]);
      expect(graveOf(s, "p3")).toHaveLength(2);
      expect(handOf(s, "p1")).toHaveLength(1);
      // p3 n'a qu'une carte : il n'en défausse qu'une, une carte aussi.
      s = run(["Opt"]);
      expect(handOf(s, "p1")).toHaveLength(1);
      // Les deux défaussent deux cartes non-terrain : aucune carte.
      s = run(["Opt", "Shock"]);
      expect(handOf(s, "p1")).toHaveLength(0);
      // Aucun ne le fait : deux cartes.
      s = scenario({
        players: 3,
        p1: { battlefield: ["Garruk, Veiled Butcher"] },
        p2: { hand: ["Forest"] },
        p3: { hand: [] },
      });
      s = minusThree(s);
      expect(handOf(s, "p1")).toHaveLength(2);
    });

    it("Hapatra, the Desert Frost : à l'arrivée, engage une créature adverse et l'étourdit ; {2}{U} : dégagez une créature", () => {
      let s = scenario({
        p1: { hand: ["Hapatra, the Desert Frost"], battlefield: lands("Island", 7) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Hapatra, the Desert Frost"), answering(true, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(1);
      s = resolve(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Hapatra, the Desert Frost"), undefined, { targets: { t: [angel] } }),
      );
      // Dégager une créature étourdie retire le marqueur à la place (701.29).
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(0);
    });

    it("Hexhaven Dueling Arena : {T} : {C} ; {2}, {T} : une créature qui a attaqué devient préparée (en rituel) ; {4}, {T} : une créature devient préparée", () => {
      let s = scenario({ p1: { battlefield: ["Hexhaven Dueling Arena", "Pompous Battlemage", ...lands("Mountain", 4)] } });
      const arena = idOf(s, "p1", "battlefield", "Hexhaven Dueling Arena");
      const mage = idOf(s, "p1", "battlefield", "Pompous Battlemage");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === arena && a.colors.includes("C"))).toBe(
        true,
      );
      expect(canUse(s, "p1", arena, "Une créature qui a attaqué")).toBe(false);
      s = resolve(activate(s, "p1", arena, "Une créature devient", { targets: { t: [mage] } }));
      expect(prepared(s, mage)).toBe(true);
      let t = scenario({ p1: { battlefield: ["Hexhaven Dueling Arena", "Pompous Battlemage", ...lands("Mountain", 2)] } });
      const mage2 = idOf(t, "p1", "battlefield", "Pompous Battlemage");
      t = attackThrough(t, [mage2]);
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Hexhaven Dueling Arena"), "Une créature qui a attaqué", {
          targets: { t: [mage2] },
        }),
      );
      expect(prepared(t, mage2)).toBe(true);
    });

    it("Hunter's Axe : +2/+0 ; en attaquant, la créature équipée gagne au choix le piétinement ou le contact mortel", () => {
      let s = scenario({ p1: { battlefield: ["Hunter's Axe", "Bear Cub", ...lands("Forest", 2)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Hunter's Axe"), "Équiper", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 2]);
      const run = (trample: boolean) => {
        const t = settleNoBlocks(attack(s, [bear]), answering(trample));
        return chars(t, bear).keywords.filter((k) => k === "trample" || k === "deathtouch");
      };
      expect(run(true)).toEqual(["trample"]);
      expect(run(false)).toEqual(["deathtouch"]);
    });

    it("Jiang Yanggu, Alone : menace ; une de vos créatures attaque seule → défaussez, piochez, puis un marqueur par carte défaussée ce tour-ci", () => {
      let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Jiang Yanggu, Alone", "Bear Cub"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Jiang Yanggu, Alone")).keywords).toContain("menace");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settleNoBlocks(attack(s, [bear]));
      expect(graveOf(s, "p1")).toEqual(["Opt"]);
      expect(handOf(s, "p1")).toEqual(["Forest"]);
      expect(counters(s, bear)).toBe(1);
      let t = scenario({ p1: { hand: ["Opt"], battlefield: ["Jiang Yanggu, Alone", "Bear Cub", "Savannah Lions"] } });
      t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub"), idOf(t, "p1", "battlefield", "Savannah Lions")]));
      expect(handOf(t, "p1")).toEqual(["Opt"]);
    });

    it("Jiang Yanggu, Never Alone : à l'arrivée, Mowu (Chien légendaire 3/3) ; à votre étape de fin, dégagez vos jetons", () => {
      let s = scenario({
        p1: { hand: ["Jiang Yanggu, Never Alone"], battlefield: [...lands("Forest", 4), { name: "Bear Cub", tapped: true }] },
      });
      s = resolve(cast(s, "p1", "Jiang Yanggu, Never Alone"));
      const mowu = tokensNamed(s, "Mowu")[0] as string;
      expect(chars(s, mowu).supertypes).toContain("Legendary");
      expect(chars(s, mowu).subtypes).toEqual(["Dog"]);
      expect(pt(s, mowu)).toEqual([3, 3]);
      s.objects[mowu]!.tapped = true;
      s = toEndStep(s);
      expect(s.objects[mowu]?.tapped).toBe(false);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Kiora of Fire and Ashes : à l'arrivée, un Dragon 5/5 volant ; {8} : un autre", () => {
      let s = scenario({ p1: { hand: ["Kiora of Fire and Ashes"], battlefield: lands("Mountain", 14) } });
      s = resolve(cast(s, "p1", "Kiora of Fire and Ashes"));
      expect(tokensNamed(s, "Dragon")).toHaveLength(1);
      const dragon = tokensNamed(s, "Dragon")[0] as string;
      expect(pt(s, dragon)).toEqual([5, 5]);
      expect(chars(s, dragon).keywords).toContain("flying");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Kiora of Fire and Ashes")));
      expect(tokensNamed(s, "Dragon")).toHaveLength(2);
    });

    it("Kiora of Salt and Sand : en attaquant après une capacité de loyauté, dégage un attaquant, imblocable ; vos planeswalkers ont [−8] Léviathan 8/8", () => {
      const run = (loyaltyFirst: boolean) => {
        let s = scenario({ p1: { battlefield: ["Kiora of Salt and Sand", "Bear Cub", "Ajani Resolute"] } });
        if (loyaltyFirst) s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Ajani Resolute"), "0"));
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settleNoBlocks(attack(s, [bear]), answering(true, [bear]));
        return [s.objects[bear]?.tapped, chars(s, bear).keywords.includes("unblockable")];
      };
      expect(run(true)).toEqual([false, true]);
      expect(run(false)).toEqual([true, false]);
      let w = scenario({ p1: { battlefield: ["Kiora of Salt and Sand", { name: "Ajani Resolute", counters: { loyalty: 8 } }] } });
      w = resolve(activate(w, "p1", idOf(w, "p1", "battlefield", "Ajani Resolute"), "−8"));
      const lev = tokensNamed(w, "Leviathan")[0] as string;
      expect(pt(w, lev)).toEqual([8, 8]);
      expect(chars(w, lev).keywords).toContain("hexproof");
    });
  });

  describe("peu communes (3)", () => {
    const playLand = (s: S, p: string, name: string) => act(s, p, { type: "playLand", card: idOf(s, p, "hand", name) });

    it("Konstrari Charm : 6 blessures à une créature volante ; ou deux marqueurs +1/+1 et le piétinement ; ou {C}{C}{C}", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Konstrari Charm"], battlefield: ["Mountain", "Forest", "Bear Cub"] },
          p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
        });
      let s = setup();
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Konstrari Charm"));
      expect(opt?.type === "cast" && opt.modes.find((m) => m.index === 0)?.targets[0]?.legal).toEqual([
        idOf(s, "p2", "battlefield", "Serra Angel"),
      ]);
      s = resolve(cast(s, "p1", "Konstrari Charm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      let t = setup();
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(cast(t, "p1", "Konstrari Charm", { mode: 1, targets: { t: [bear] } }));
      expect(counters(t, bear)).toBe(2);
      expect(chars(t, bear).keywords).toContain("trample");
      const u = resolve(cast(setup(), "p1", "Konstrari Charm", { mode: 2 }));
      expect(u.players.p1?.manaPool.C).toBe(3);
    });

    it("Koth of the Homestead : +1 PV à chaque terrain qui arrive sous votre contrôle ; une Plaine met aussi un marqueur sur une créature", () => {
      const run = (land: string) => {
        let s = scenario({ p1: { hand: [land], battlefield: ["Koth of the Homestead", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = resolve(playLand(s, "p1", land), answering(true, [bear]));
        return [life(s, "p1"), counters(s, bear)];
      };
      expect(run("Plains")).toEqual([21, 1]);
      expect(run("Forest")).toEqual([21, 0]);
    });

    it("Koth, the Geomancer : portée ; à chaque terrain qui arrive, 1 blessure à chaque adversaire ; une Montagne ajoute {R}", () => {
      const run = (land: string) => {
        let s = scenario({ p1: { hand: [land], battlefield: ["Koth, the Geomancer"] } });
        expect(chars(s, idOf(s, "p1", "battlefield", "Koth, the Geomancer")).keywords).toContain("reach");
        s = resolve(playLand(s, "p1", land));
        return [life(s, "p2"), s.players.p1?.manaPool.R];
      };
      expect(run("Mountain")).toEqual([19, 1]);
      expect(run("Forest")).toEqual([19, 0]);
    });

    it("Loot, the Nexus : {T} : un mana de la couleur choisie par force différente parmi vos créatures", () => {
      let s = scenario({ p1: { battlefield: ["Loot, the Nexus", "Bear Cub", "Serra Angel", "Savannah Lions"] } });
      const loot = idOf(s, "p1", "battlefield", "Loot, the Nexus");
      s = act(s, "p1", { type: "tapForMana", source: loot, ability: 0, color: "U" });
      // Forces : 2 (Loot, Bear Cub, Savannah Lions) et 4 (Serra Angel).
      expect(s.players.p1?.manaPool.U).toBe(2);
    });

    it("Mabel, Valley Hero : quand elle ou une autre de vos créatures arrive, un marqueur sur une créature arrivée ce tour-ci", () => {
      let s = scenario({
        p1: {
          hand: ["Mabel, Valley Hero", "Bear Cub"],
          battlefield: ["Mountain", "Plains", "Forest", "Forest", "Forest", "Savannah Lions"],
        },
      });
      s = resolve(cast(s, "p1", "Mabel, Valley Hero"));
      const mabel = idOf(s, "p1", "battlefield", "Mabel, Valley Hero");
      expect(counters(s, mabel)).toBe(1);
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Bear Cub"), (req, _p, x) => {
        if (req.type !== "pick" || !req.options.includes(mabel)) return undefined;
        offered = req.options;
        return [idOf(x, "p1", "battlefield", "Bear Cub")];
      });
      expect(offered).not.toContain(idOf(s, "p1", "battlefield", "Savannah Lions"));
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Marwyn, the Clearcutter : {2}, {T}, sacrifiez un artefact ou un terrain : piochez une carte", () => {
      const none = scenario({ p1: { battlefield: ["Marwyn, the Clearcutter", "Bear Cub"] } });
      expect(canUse(none, "p1", idOf(none, "p1", "battlefield", "Marwyn, the Clearcutter"))).toBe(false);
      let s = scenario({ p1: { battlefield: ["Marwyn, the Clearcutter", ...lands("Mountain", 3)] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Marwyn, the Clearcutter")));
      expect(graveOf(s, "p1")).toEqual(["Mountain"]);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Marwyn, the Preserver : vos terrains ont la défense talismanique ; {2} : une carte de terrain de votre cimetière en main", () => {
      let s = scenario({
        p1: { battlefield: ["Marwyn, the Preserver", ...lands("Forest", 2)], graveyard: ["Plains", "Bear Cub"] },
        p2: { battlefield: ["Forest"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).keywords).toContain("hexproof");
      expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).keywords).not.toContain("hexproof");
      s = resolve(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Marwyn, the Preserver"), undefined, {
          targets: { t: [idOf(s, "p1", "graveyard", "Plains")] },
        }),
      );
      expect(handOf(s, "p1")).toEqual(["Plains"]);
    });

    it("Massacre Girl, Most Wanted : une autre de vos créatures meurt → 1 blessure à un adversaire et +1 PV ; un marqueur quand un adversaire subit des blessures non de combat", () => {
      let s = scenario({
        p1: { battlefield: ["Massacre Girl, Most Wanted", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const girl = idOf(s, "p1", "battlefield", "Massacre Girl, Most Wanted");
      destroy(s, idOf(s, "p2", "battlefield", "Savannah Lions"));
      s = resolve(s);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([20, 20]);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(s, answering(true, ["p2"]));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
      // La blessure de sa propre capacité est non de combat : un marqueur.
      expect(counters(s, girl)).toBe(1);
    });

    it("Massacre Girl, Most Wanted : un adversaire subit des blessures non de combat de toute source, un marqueur par événement", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Massacre Girl, Most Wanted"] }, p2: { battlefield: ["Bear Cub"] } });
      const girl = idOf(s, "p1", "battlefield", "Massacre Girl, Most Wanted");
      const cub = sourceFromObject(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      // Une source adverse, deux adversaires blessés : deux marqueurs.
      simultaneously(s, () => {
        dealDamage(s, cub, "p2", 1, false);
        dealDamage(s, cub, "p3", 1, false);
      });
      s = resolve(s);
      expect(counters(s, girl)).toBe(2);
      // Blessures de combat à un adversaire, ou blessures non de combat à vous : rien.
      dealDamage(s, cub, "p2", 1, true);
      dealDamage(s, cub, "p1", 1, false);
      expect(s.triggers).toHaveLength(0);
    });

    it("Mind Meanderer : vol ; vigilance tant que vous contrôlez un planeswalker Jace ; à l'arrivée, se bat contre une créature adverse", () => {
      let s = scenario({
        p1: { hand: ["Mind Meanderer"], battlefield: [...lands("Island", 4), ...lands("Forest", 2)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = resolve(cast(s, "p1", "Mind Meanderer"), answering(true, [lions]));
      const mm = idOf(s, "p1", "battlefield", "Mind Meanderer");
      expect(graveOf(s, "p2")).toEqual(["Savannah Lions"]);
      expect(s.objects[mm]?.damage).toBe(2);
      expect(chars(s, mm).keywords).toContain("flying");
      expect(chars(s, mm).keywords).not.toContain("vigilance");
      const t = scenario({ p1: { battlefield: ["Mind Meanderer", "The Theorist, Jace Beleren"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Mind Meanderer")).keywords).toContain("vigilance");
    });

    it("Multiply by Zero : la créature ciblée a une F/E de base 0/0 jusqu'à la fin du tour (les marqueurs comptent)", () => {
      let s = scenario({
        p1: { hand: ["Multiply by Zero", "Multiply by Zero"], battlefield: lands("Swamp", 4) },
        p2: { battlefield: ["Serra Angel", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Multiply by Zero", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      s = resolve(cast(s, "p1", "Multiply by Zero", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([1, 1]);
    });

    it("Paradox Shaper : préparée à votre entretien si elle ne l'est pas ; {2} : une carte de votre cimetière au-dessous de votre bibliothèque", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Paradox Shaper", "Island", "Swamp", "Swamp"], graveyard: ["Shock"] },
      });
      const shaper = idOf(s, "p1", "battlefield", "Paradox Shaper");
      expect(prepared(s, shaper)).toBe(false);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(prepared(s, shaper)).toBe(true);
      s = resolve(activate(s, "p1", shaper, undefined, { targets: { t: [idOf(s, "p1", "graveyard", "Shock")] } }));
      const lib = namesIn(s, s.players.p1?.library);
      expect(lib[lib.length - 1]).toBe("Shock");
      // Omit Variables : meule 3.
      s = resolve(castCopy(s, shaper));
      expect(s.players.p1?.graveyard).toHaveLength(3);
      expect(prepared(s, shaper)).toBe(false);
    });

    it("Perfected Theory : F/E de base 1/1, ou 4/5, jusqu'à la fin du tour", () => {
      const run = (mode: number) => {
        let s = scenario({ p1: { hand: ["Perfected Theory"], battlefield: ["Island", "Serra Angel"] } });
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = resolve(cast(s, "p1", "Perfected Theory", { mode, targets: { t: [angel] } }));
        return pt(s, angel);
      };
      expect(run(0)).toEqual([1, 1]);
      expect(run(1)).toEqual([4, 5]);
    });

    it("Pia, Aether Ascetic : à l'arrivée, vous pouvez défausser une carte ; si vous le faites, cherchez une carte d'enchantement", () => {
      const run = (discard: boolean) => {
        const s = scenario({
          p1: {
            hand: ["Pia, Aether Ascetic", "Opt"],
            battlefield: lands("Forest", 3),
            library: ["Forest", "Gardenize", "Forest"],
          },
        });
        return resolve(cast(s, "p1", "Pia, Aether Ascetic"), (req) =>
          req.intent === "discard" && req.type === "pick" ? (discard ? req.options.slice(0, 1) : []) : undefined,
        );
      };
      const yes = run(true);
      expect(handOf(yes, "p1")).toEqual(["Gardenize"]);
      expect(graveOf(yes, "p1")).toEqual(["Opt"]);
      const no = run(false);
      expect(handOf(no, "p1")).toEqual(["Opt"]);
    });

    it("Pia, Determined Rebuilder : à l'arrivée, un Thopter 1/1 volant ; {5}{R} : +X/+0 (X = vos artefacts)", () => {
      let s = scenario({
        p1: { hand: ["Pia, Determined Rebuilder"], battlefield: [...lands("Mountain", 9), "Eye of Jace", "Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Pia, Determined Rebuilder"));
      const thopter = tokensNamed(s, "Thopter")[0] as string;
      expect(pt(s, thopter)).toEqual([1, 1]);
      expect(chars(s, thopter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, thopter).keywords).toContain("flying");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Pia, Determined Rebuilder"), undefined, { targets: { t: [bear] } }),
      );
      expect(pt(s, bear)).toEqual([4, 2]);
    });

    it("Plan for All Outcomes : à l'arrivée, le propriétaire d'un autre permanent non-terrain le met au-dessus ou au-dessous ; premier sort non-créature du tour → renforcez Jace 1", () => {
      let s = scenario({
        p1: { hand: ["Plan for All Outcomes"], battlefield: lands("Island", 4) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Plan for All Outcomes"), (req, player) => {
        if (req.intent === "topOrBottom") {
          expect(player).toBe("p2");
          return ["bottom"];
        }
        return answering(true, [angel])(req, player, s);
      });
      const lib = namesIn(s, s.players.p2?.library);
      expect(lib[lib.length - 1]).toBe("Serra Angel");
      // Plan for All Outcomes était le premier sort non-créature du tour : pas de Jace.
      expect(jaceTokens(s)).toHaveLength(0);
      let t = scenario({
        p1: {
          hand: ["Opt", "Opt", "Bear Cub"],
          battlefield: ["Plan for All Outcomes", ...lands("Island", 3), ...lands("Forest", 2)],
        },
      });
      t = resolve(cast(t, "p1", "Bear Cub"));
      expect(jaceTokens(t)).toHaveLength(0);
      t = resolve(cast(t, "p1", "Opt"));
      expect(jaceLoyalty(t)).toBe(1);
      t = resolve(cast(t, "p1", "Opt"));
      expect(jaceLoyalty(t)).toBe(1);
    });
  });

  describe("peu communes (4)", () => {
    it("Precise Redaction : contrecarre un sort blanc ou noir (pas un sort vert)", () => {
      const run = (spellName: string, land: string) => {
        let s = scenario({
          active: "p2",
          p1: { hand: ["Precise Redaction"], battlefield: lands("Island", 2) },
          p2: { hand: [spellName], battlefield: lands(land, 2) },
        });
        s = cast(s, "p2", spellName);
        s = act(s, "p2", { type: "pass" });
        const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Precise Redaction"));
        return { s, legal: opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [] };
      };
      const white = run("Savannah Lions", "Plains");
      expect(white.legal).toHaveLength(1);
      const s = resolve(cast(white.s, "p1", "Precise Redaction", { targets: { t: white.legal } }));
      expect(graveOf(s, "p2")).toEqual(["Savannah Lions"]);
      expect(run("Bear Cub", "Forest").legal).toHaveLength(0);
    });

    it("Primal Witchstalker : menace ; à l'arrivée, meule 4, puis une carte de terrain de votre cimetière revient engagée", () => {
      let s = scenario({
        p1: {
          hand: ["Primal Witchstalker"],
          battlefield: ["Swamp", "Forest", "Forest"],
          library: ["Shock", "Plains", "Opt", "Opt", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Primal Witchstalker"));
      const plains = idOf(s, "p1", "battlefield", "Plains");
      expect(s.objects[plains]?.tapped).toBe(true);
      expect(graveOf(s, "p1").sort()).toEqual(["Opt", "Opt", "Shock"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Primal Witchstalker")).keywords).toContain("menace");
    });

    it("Proft, Consulting Detective : quand vous regardez ou surveillez, vous pouvez payer {2} : marqueur +1/+1 et piochez", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Proft, Consulting Detective", ...lands("Island", 3)] } });
        s = resolve(cast(s, "p1", "Opt"), answering(pay));
        return [counters(s, idOf(s, "p1", "battlefield", "Proft, Consulting Detective")), s.players.p1?.hand.length];
      };
      expect(run(true)).toEqual([1, 2]);
      expect(run(false)).toEqual([0, 1]);
    });

    it("Prophesied End : détruit une créature ; si elle n'attaquait pas, son contrôleur pioche", () => {
      let s = scenario({
        p1: { hand: ["Prophesied End"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Prophesied End", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(s.players.p2?.hand).toHaveLength(1);
      let t = scenario({
        active: "p2",
        p1: { hand: ["Prophesied End"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      t = act(t, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      t = act(t, "p2", { type: "pass" });
      t = resolve(cast(t, "p1", "Prophesied End", { targets: { t: [angel] } }));
      expect(graveOf(t, "p2")).toEqual(["Serra Angel"]);
      expect(t.players.p2?.hand).toHaveLength(0);
    });

    it("Prudent Fateseer : arrive préparée ; vos créatures +1/+0 au premier regard ou surveillance du tour ; Peer Review : un Cadet, surveillance 1", () => {
      let s = scenario({ p1: { hand: ["Prudent Fateseer", "Opt", "Opt"], battlefield: lands("Island", 8) } });
      s = resolve(cast(s, "p1", "Prudent Fateseer"));
      const f = idOf(s, "p1", "battlefield", "Prudent Fateseer");
      expect(prepared(s, f)).toBe(true);
      s = resolve(cast(s, "p1", "Opt"));
      s = resolve(cast(s, "p1", "Opt"));
      expect(pt(s, f)).toEqual([2, 4]);
      let surveilled = false;
      s = resolve(castCopy(s, f), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(tokensNamed(s, "Cadet")).toHaveLength(1);
      expect(surveilled).toBe(true);
    });

    it("Recursive Recruitment : deux Cadets ; lancé depuis un cimetière (flashback), un marqueur par tranche de trois cartes du cimetière", () => {
      let s = scenario({
        p1: {
          hand: ["Recursive Recruitment"],
          battlefield: [...lands("Island", 6), ...lands("Swamp", 6)],
          graveyard: lands("Plains", 6),
        },
      });
      s = resolve(cast(s, "p1", "Recursive Recruitment"));
      expect(tokensNamed(s, "Cadet").map((id) => counters(s, id))).toEqual([0, 0]);
      // Flashback : pendant la résolution, le sort est sur la pile ; six cartes au cimetière → deux marqueurs.
      s = resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Recursive Recruitment") }));
      const fresh = tokensNamed(s, "Cadet").slice(2);
      expect(fresh.map((id) => counters(s, id))).toEqual([2, 2]);
      expect(namesIn(s, s.exile)).toEqual(["Recursive Recruitment"]);
    });

    it("Refute Destiny : exile une créature ou un planeswalker vert ou bleu, puis surveillance 1", () => {
      let s = scenario({
        p1: { hand: ["Refute Destiny"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Refute Destiny"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Bear Cub")]);
      let surveilled = false;
      s = resolve(cast(s, "p1", "Refute Destiny", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(surveilled).toBe(true);
    });

    it("Rescue Girl, First Responder : vol ; {T} : un autre de vos permanents retourne en main, seulement pendant votre tour", () => {
      let s = scenario({
        p1: { battlefield: ["Rescue Girl, First Responder", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const girl = idOf(s, "p1", "battlefield", "Rescue Girl, First Responder");
      expect(chars(s, girl).keywords).toContain("flying");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === girl);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = resolve(activate(s, "p1", girl, undefined, { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(handOf(s, "p1")).toEqual(["Bear Cub"]);
      let t = scenario({ active: "p2", p1: { battlefield: ["Rescue Girl, First Responder", "Bear Cub"] } });
      t = act(t, "p2", { type: "pass" });
      expect(canUse(t, "p1", idOf(t, "p1", "battlefield", "Rescue Girl, First Responder"))).toBe(false);
    });

    it("Restore with Empathy : une carte de permanent de votre cimetière en main, et +4 PV", () => {
      let s = scenario({
        p1: { hand: ["Restore with Empathy"], battlefield: lands("Forest", 3), graveyard: ["Serra Angel", "Shock"] },
      });
      const opt = legalActions(s, "p1").find(
        (a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Restore with Empathy"),
      );
      expect(namesIn(s, opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [])).toEqual(["Serra Angel"]);
      s = resolve(cast(s, "p1", "Restore with Empathy", { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
      expect(handOf(s, "p1")).toEqual(["Serra Angel"]);
      expect(life(s, "p1")).toBe(24);
    });

    it("Rewrite Regrets : une carte de créature ou de planeswalker de valeur de mana 6 ou moins revient en jeu ; renforcez Jace 2", () => {
      let s = scenario({
        p1: {
          hand: ["Rewrite Regrets"],
          battlefield: lands("Swamp", 4),
          graveyard: ["Ajani Resolute", "Ghalta the Unstoppable", "Shock"],
        },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Rewrite Regrets"));
      expect(namesIn(s, opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [])).toEqual(["Ajani Resolute"]);
      s = resolve(cast(s, "p1", "Rewrite Regrets", { targets: { t: [idOf(s, "p1", "graveyard", "Ajani Resolute")] } }));
      expect(idsOf(s, "p1", "battlefield", "Ajani Resolute")).toHaveLength(1);
      expect(jaceLoyalty(s)).toBe(2);
    });

    it("Ruric Thar, Biomagus : vol, deux prouesses ; piochez quand il devient la cible d'un sort adverse", () => {
      let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Ruric Thar, Biomagus", "Island"] } });
      const ruric = idOf(s, "p1", "battlefield", "Ruric Thar, Biomagus");
      s = resolve(cast(s, "p1", "Opt"));
      expect(pt(s, ruric)).toEqual([6, 8]);
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Ruric Thar, Biomagus"] },
        p2: { hand: ["Shock", "Shock"], battlefield: lands("Mountain", 2) },
      });
      t = resolve(cast(t, "p2", "Shock", { targets: { t: [idOf(t, "p1", "battlefield", "Ruric Thar, Biomagus")] } }));
      expect(t.players.p1?.hand).toHaveLength(1);
      t = resolve(cast(t, "p2", "Shock", { targets: { t: ["p1"] } }));
      expect(t.players.p1?.hand).toHaveLength(1);
    });

    it("Ruric Thar, Magecrusher : ne peut pas être contrecarré ; portée, vigilance, piétinement ; défense talismanique tant qu'il n'a pas infligé de blessures de combat", () => {
      let s = scenario({ p1: { battlefield: ["Ruric Thar, Magecrusher"] } });
      const ruric = idOf(s, "p1", "battlefield", "Ruric Thar, Magecrusher");
      expect(s.defs[s.objects[ruric]?.defId ?? ""]?.cantBeCountered).toBe(true);
      expect(chars(s, ruric).keywords).toEqual(expect.arrayContaining(["reach", "vigilance", "trample", "hexproof"]));
      s = attackThrough(s, [ruric]);
      expect(life(s, "p2")).toBe(13);
      expect(chars(s, ruric).keywords).not.toContain("hexproof");
    });

    it("Saheeli, Consul of Oversight : vol ; un Thopter au premier regard ou surveillance du tour", () => {
      let s = scenario({ p1: { hand: ["Opt", "Opt"], battlefield: ["Saheeli, Consul of Oversight", ...lands("Island", 2)] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Saheeli, Consul of Oversight")).keywords).toContain("flying");
      s = resolve(cast(s, "p1", "Opt"));
      s = resolve(cast(s, "p1", "Opt"));
      expect(tokensNamed(s, "Thopter")).toHaveLength(1);
    });

    it("Saheeli, Jewel of Avishkar : vos Thopters ont la célérité ; un Thopter à chaque sort non-créature lancé", () => {
      let s = scenario({
        p1: { hand: ["Shock", "Bear Cub"], battlefield: ["Saheeli, Jewel of Avishkar", "Mountain", ...lands("Forest", 2)] },
      });
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      const thopters = tokensNamed(s, "Thopter");
      expect(thopters).toHaveLength(1);
      expect(chars(s, thopters[0] as string).keywords).toEqual(expect.arrayContaining(["haste", "flying"]));
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(tokensNamed(s, "Thopter")).toHaveLength(1);
    });

    it("Stingerquill Charm : 3 blessures à n'importe quelle cible ; ou initiative et contact mortel ; ou un Cadet avec célérité", () => {
      const setup = () => scenario({ p1: { hand: ["Stingerquill Charm"], battlefield: ["Swamp", "Mountain", "Bear Cub"] } });
      const a = resolve(cast(setup(), "p1", "Stingerquill Charm", { mode: 0, targets: { t: ["p2"] } }));
      expect(life(a, "p2")).toBe(17);
      let b = setup();
      const bear = idOf(b, "p1", "battlefield", "Bear Cub");
      b = resolve(cast(b, "p1", "Stingerquill Charm", { mode: 1, targets: { t: [bear] } }));
      expect(chars(b, bear).keywords).toEqual(expect.arrayContaining(["firstStrike", "deathtouch"]));
      const c = resolve(cast(setup(), "p1", "Stingerquill Charm", { mode: 2 }));
      const cadet = tokensNamed(c, "Cadet")[0] as string;
      expect(chars(c, cadet).keywords).toContain("haste");
    });
  });

  describe("peu communes (5)", () => {
    it("Terminal Criticism : détruit une créature ou un planeswalker bleu ou rouge ; +1 PV", () => {
      let s = scenario({
        p1: { hand: ["Terminal Criticism"], battlefield: lands("Swamp", 2) },
        p2: { battlefield: ["Shivan Dragon", "Bear Cub"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Terminal Criticism"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Shivan Dragon")]);
      s = resolve(cast(s, "p1", "Terminal Criticism", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(graveOf(s, "p2")).toEqual(["Shivan Dragon"]);
      expect(life(s, "p1")).toBe(21);
    });

    it("Tetsuko Umezawa, Fugitive : vos créatures de force ou d'endurance 1 ou moins ne peuvent pas être bloquées", () => {
      const s = scenario({
        p1: { battlefield: ["Tetsuko Umezawa, Fugitive", "Savannah Lions", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Tetsuko Umezawa, Fugitive")).keywords).toContain("unblockable");
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).toContain("unblockable");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("unblockable");
      expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("unblockable");
    });

    it("Tetsuko Umezawa, Pursuer : double initiative, prouesse ; 1 blessure au contrôleur d'une créature adverse de force ou d'endurance 1 ou moins qui bloque", () => {
      const run = (blocker: string) => {
        let s = scenario({ p1: { battlefield: ["Tetsuko Umezawa, Pursuer"] }, p2: { battlefield: [blocker] } });
        const t = idOf(s, "p1", "battlefield", "Tetsuko Umezawa, Pursuer");
        expect(chars(s, t).keywords).toEqual(expect.arrayContaining(["doubleStrike", "prowess"]));
        s = attack(s, [t]);
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: idOf(s, "p2", "battlefield", blocker), attacker: t }] });
        s = resolve(s);
        return life(s, "p2");
      };
      expect(run("Savannah Lions")).toBe(19);
      expect(run("Bear Cub")).toBe(20);
    });

    it("Teyo, Diamondblade Mage : flash ; à l'arrivée, un de vos permanents gagne le contact mortel, avec un marqueur +1/+1 (créature) ou de loyauté (planeswalker)", () => {
      const run = (who: string) => {
        let s = scenario({
          p1: { hand: ["Teyo, Diamondblade Mage"], battlefield: [...lands("Swamp", 4), "Bear Cub", "Ajani Resolute"] },
        });
        const t = idOf(s, "p1", "battlefield", who);
        s = resolve(cast(s, "p1", "Teyo, Diamondblade Mage"), answering(true, [t]));
        return { s, t };
      };
      const c = run("Bear Cub");
      expect(chars(c.s, c.t).keywords).toContain("deathtouch");
      expect(counters(c.s, c.t)).toBe(1);
      const w = run("Ajani Resolute");
      expect(w.s.objects[w.t]?.counters.loyalty).toBe(3);
      expect(counters(w.s, w.t)).toBe(0);
      expect(chars(w.s, idOf(w.s, "p1", "battlefield", "Teyo, Diamondblade Mage")).keywords).toContain("flash");
    });

    it("Teyo, Lightshield Expert : flash ; à l'arrivée, un de vos permanents gagne la défense talismanique, avec un marqueur selon son type", () => {
      const run = (who: string) => {
        let s = scenario({
          p1: { hand: ["Teyo, Lightshield Expert"], battlefield: [...lands("Plains", 2), "Bear Cub", "Ajani Resolute"] },
        });
        const t = idOf(s, "p1", "battlefield", who);
        s = resolve(cast(s, "p1", "Teyo, Lightshield Expert"), answering(true, [t]));
        return { s, t };
      };
      const c = run("Bear Cub");
      expect(chars(c.s, c.t).keywords).toContain("hexproof");
      expect(counters(c.s, c.t)).toBe(1);
      const w = run("Ajani Resolute");
      expect(w.s.objects[w.t]?.counters.loyalty).toBe(3);
    });

    it("Theorix Charm : contrecarre un sort non-créature sauf si son contrôleur paie {2} ; ou −2/−2 ; ou meule 3 puis piochez", () => {
      const counterRun = (oppLands: number, pay: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { hand: ["Theorix Charm"], battlefield: ["Island", "Swamp"] },
          p2: { hand: ["Shock"], battlefield: lands("Mountain", oppLands) },
        });
        s = cast(s, "p2", "Shock", { targets: { t: ["p1"] } });
        s = act(s, "p2", { type: "pass" });
        const shock = s.stack[0]?.id as string;
        s = resolve(cast(s, "p1", "Theorix Charm", { mode: 0, targets: { t: [shock] } }), answering(pay));
        return life(s, "p1");
      };
      expect(counterRun(1, true)).toBe(20); // ne peut pas payer
      expect(counterRun(3, true)).toBe(18);
      expect(counterRun(3, false)).toBe(20);
      let s = scenario({ p1: { hand: ["Theorix Charm"], battlefield: ["Island", "Swamp"] }, p2: { battlefield: ["Bear Cub"] } });
      s = resolve(cast(s, "p1", "Theorix Charm", { mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(graveOf(s, "p2")).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { hand: ["Theorix Charm"], battlefield: ["Island", "Swamp"], library: ["Shock", "Shock", "Shock", "Opt"] },
      });
      t = resolve(cast(t, "p1", "Theorix Charm", { mode: 2 }));
      expect(handOf(t, "p1")).toEqual(["Opt"]);
      expect(graveOf(t, "p1").sort()).toEqual(["Shock", "Shock", "Shock", "Theorix Charm"]);
    });

    it("Tinybones, Pocket Nuisance : à l'arrivée, chaque adversaire défausse ; 1 blessure à chaque adversaire quand un joueur défausse (une fois par défausse)", () => {
      let s = scenario({
        p1: {
          hand: ["Tinybones, Pocket Nuisance", "Seasoned Cryomancer"],
          battlefield: [...lands("Swamp", 3), ...lands("Island", 3)],
        },
        p2: { hand: ["Opt"] },
      });
      s = resolve(cast(s, "p1", "Tinybones, Pocket Nuisance"));
      expect(graveOf(s, "p2")).toEqual(["Opt"]);
      expect(life(s, "p2")).toBe(19);
      // Seasoned Cryomancer : deux cartes défaussées d'un coup, une seule blessure.
      s = resolve(cast(s, "p1", "Seasoned Cryomancer"), (req) =>
        req.intent === "discard" && req.type === "pick" ? req.options.slice(0, 2) : undefined,
      );
      expect(graveOf(s, "p1")).toHaveLength(2);
      expect(life(s, "p2")).toBe(18);
      expect(life(s, "p1")).toBe(20);
    });

    it("Traxos, Academy Guardian : coûte {2} de moins si vous avez lancé un sort non-créature ce tour-ci ; vol, vigilance, prouesse", () => {
      let s = scenario({ p1: { hand: ["Traxos, Academy Guardian", "Opt"], battlefield: lands("Island", 3) } });
      const d = s.defs[s.objects[idOf(s, "p1", "hand", "Traxos, Academy Guardian")]?.defId ?? ""]!;
      expect(spellCost(s, "p1", d, {}).generic).toBe(3);
      s = resolve(cast(s, "p1", "Opt"));
      expect(spellCost(s, "p1", d, {}).generic).toBe(1);
      s = resolve(cast(s, "p1", "Traxos, Academy Guardian"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Traxos, Academy Guardian")).keywords).toEqual(
        expect.arrayContaining(["flying", "vigilance", "prowess"]),
      );
    });

    it("Traxos, Scourge Eternal : ne se dégage pas pendant votre étape de dégagement ; se dégage quand vous lancez un sort d'artefact ou de créature", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: {
          hand: ["Bear Cub", "Shock"],
          battlefield: [{ name: "Traxos, Scourge Eternal", tapped: true }, ...lands("Forest", 2), "Mountain"],
        },
      });
      const traxos = idOf(s, "p1", "battlefield", "Traxos, Scourge Eternal");
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(s.objects[traxos]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(s.objects[traxos]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(s.objects[traxos]?.tapped).toBe(false);
      expect(chars(s, traxos).keywords).toContain("trample");
    });

    it("Twisted Fates : détruit un permanent non-terrain ; un marqueur +1/+1 sur chaque créature du joueur ciblé", () => {
      let s = scenario({
        p1: { hand: ["Twisted Fates"], battlefield: [...lands("Plains", 3), ...lands("Swamp", 2), "Bear Cub", "Savannah Lions"] },
        p2: { battlefield: ["Ajani Resolute", "Serra Angel"] },
      });
      s = resolve(
        cast(s, "p1", "Twisted Fates", { targets: { t: [idOf(s, "p2", "battlefield", "Ajani Resolute")], p: ["p1"] } }),
      );
      expect(graveOf(s, "p2")).toEqual(["Ajani Resolute"]);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(1);
      expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
    });

    it("Vigorbloom Charm : défense talismanique et indestructible ; ou piochez et +3 PV ; ou un marqueur +1/+1 puis combat", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Vigorbloom Charm"], battlefield: ["Forest", "Plains", "Bear Cub"] },
          p2: { battlefield: ["Savannah Lions"] },
        });
      let a = setup();
      const bear = idOf(a, "p1", "battlefield", "Bear Cub");
      a = resolve(cast(a, "p1", "Vigorbloom Charm", { mode: 0, targets: { t: [bear] } }));
      expect(chars(a, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
      const b = resolve(cast(setup(), "p1", "Vigorbloom Charm", { mode: 1 }));
      expect([b.players.p1?.hand.length, life(b, "p1")]).toEqual([1, 23]);
      let c = setup();
      c = resolve(
        cast(c, "p1", "Vigorbloom Charm", {
          mode: 2,
          targets: { a: [bear], b: [idOf(c, "p2", "battlefield", "Savannah Lions")] },
        }),
      );
      expect(graveOf(c, "p2")).toEqual(["Savannah Lions"]);
      expect(counters(c, bear)).toBe(1);
      expect(c.objects[bear]?.damage).toBe(2);
    });

    it("Vigorbloom Vanguard : arrive préparée ; vos créatures avec un marqueur +1/+1 ont la vigilance ; Seed Suture : un marqueur +1/+1 et +1 PV", () => {
      let s = scenario({ p1: { hand: ["Vigorbloom Vanguard"], battlefield: [...lands("Forest", 3), "Bear Cub"] } });
      s = resolve(cast(s, "p1", "Vigorbloom Vanguard"));
      const v = idOf(s, "p1", "battlefield", "Vigorbloom Vanguard");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(prepared(s, v)).toBe(true);
      expect(chars(s, bear).keywords).not.toContain("vigilance");
      s = resolve(castCopy(s, v, { targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(life(s, "p1")).toBe(21);
      expect(chars(s, bear).keywords).toContain("vigilance");
      expect(chars(s, v).keywords).not.toContain("vigilance");
    });

    it("Warrior's Blades : à l'arrivée, 3 blessures à n'importe quelle cible et +3 PV ; +2/+1 ; Équiper {3}, {1} de moins par marqueur +1/+1 de la cible", () => {
      let s = scenario({ p1: { hand: ["Warrior's Blades"], battlefield: [...lands("Mountain", 2), ...lands("Plains", 2)] } });
      s = resolve(cast(s, "p1", "Warrior's Blades"), answering(true, ["p2"]));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([23, 17]);
      let t = scenario({
        p1: { battlefield: ["Warrior's Blades", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Plains", "Plains"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Warrior's Blades"), "Équiper", { targets: { t: [bear] } }));
      expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(1);
      expect(pt(t, bear)).toEqual([6, 5]);
    });

    it("Woodwork Prodigy : préparée à votre entretien ; Soul Tether : un jeton Heartwood", () => {
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Woodwork Prodigy", ...lands("Forest", 3)] } });
      const w = idOf(s, "p1", "battlefield", "Woodwork Prodigy");
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(prepared(s, w)).toBe(true);
      s = resolve(castCopy(s, w));
      expect(tokensNamed(s, "Heartwood")).toHaveLength(1);
    });

    it("Yargle, Glutton of Urborg et Yargle, Goliath of Otaria : sans capacité, 9/3 et 3/9", () => {
      const s = scenario({ p1: { battlefield: ["Yargle, Glutton of Urborg", "Yargle, Goliath of Otaria"] } });
      expect(pt(s, idOf(s, "p1", "battlefield", "Yargle, Glutton of Urborg"))).toEqual([9, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Yargle, Goliath of Otaria"))).toEqual([3, 9]);
    });

    it("Yoshimaru, Scrappy Stray : à l'arrivée, une autre de vos créatures se bat contre une créature adverse ; {6} : un marqueur sur une créature non légendaire", () => {
      let s = scenario({
        p1: { hand: ["Yoshimaru, Scrappy Stray"], battlefield: [...lands("Forest", 8), "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Yoshimaru, Scrappy Stray"), answering(true, [angel, bear]));
      expect(graveOf(s, "p2")).toEqual(["Bear Cub"]);
      expect(s.objects[angel]?.damage).toBe(2);
      const yoshi = idOf(s, "p1", "battlefield", "Yoshimaru, Scrappy Stray");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === yoshi);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([angel]);
      s = resolve(activate(s, "p1", yoshi, undefined, { targets: { t: [angel] } }));
      expect(counters(s, angel)).toBe(1);
    });

    it("Your Fate Ends Here : détruit une créature ou un planeswalker de valeur de mana 3 ou plus ; surveillance 1", () => {
      let s = scenario({
        p1: { hand: ["Your Fate Ends Here"], battlefield: lands("Plains", 3) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Your Fate Ends Here"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
      let surveilled = false;
      s = resolve(
        cast(s, "p1", "Your Fate Ends Here", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        (req) => {
          if (req.intent === "surveilGraveyard") surveilled = true;
          return undefined;
        },
      );
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(surveilled).toBe(true);
    });
  });

  describe("peu communes (6) : les Ways", () => {
    /** Lance la Way depuis la main (avec `land` en nombre suffisant) et renvoie l'état et le jeton Jace créé. */
    const castWay = (way: string, land: string, n: number, extra: { battlefield?: string[]; hand?: string[] } = {}) => {
      let s = scenario({
        p1: { hand: [way, ...(extra.hand ?? [])], battlefield: [...lands(land, n), ...(extra.battlefield ?? [])] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", way));
      return { s, jace: jaceTokens(s)[0] as string };
    };

    it("Way of the Cryomancer : renforcez Jace 5 ; [−3] : le prochain éphémère ou rituel lancé ce tour-ci est copié", () => {
      let { s, jace } = castWay("Way of the Cryomancer", "Island", 3, { hand: ["Shock"], battlefield: ["Mountain"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      s = resolve(activate(s, "p1", jace, "−3 : Copier"));
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(16);
    });

    it("Way of the Deathbringer : renforcez Jace 5 ; [−2] : vous pouvez sacrifier une créature pour une Bête 4/4 avec le piétinement", () => {
      const run = (yes: boolean) => {
        let { s, jace } = castWay("Way of the Deathbringer", "Swamp", 3, { battlefield: ["Bear Cub"] });
        expect(s.objects[jace]?.counters.loyalty).toBe(5);
        s = resolve(activate(s, "p1", jace, "−2"), (req) => {
          if (req.type === "yesNo") return [yes ? 1 : 0];
          if (req.intent === "sacrifice" && req.type === "pick") return yes ? req.options.slice(0, 1) : [];
          return undefined;
        });
        return s;
      };
      const yes = run(true);
      const beast = tokensNamed(yes, "Beast")[0] as string;
      expect(pt(yes, beast)).toEqual([4, 4]);
      expect(chars(yes, beast).keywords).toContain("trample");
      expect(graveOf(yes, "p1")).toContain("Bear Cub");
      const no = run(false);
      expect(tokensNamed(no, "Beast")).toHaveLength(0);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Way of the Healer : renforcez Jace 5 ; [−2] : un Cadet, surveillance 1", () => {
      let { s, jace } = castWay("Way of the Healer", "Plains", 4);
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      let surveilled = false;
      s = resolve(activate(s, "p1", jace, "−2"), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(tokensNamed(s, "Cadet")).toHaveLength(1);
      expect(surveilled).toBe(true);
    });

    it("Way of the Mentor : renforcez Jace 5 ; chaque gain de PV met un marqueur de loyauté sur chacun de vos planeswalkers", () => {
      let { s, jace } = castWay("Way of the Mentor", "Plains", 3, { battlefield: ["Ajani Unrelenting"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      gainLife(s, "p1", 2);
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(6);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ajani Unrelenting")]?.counters.loyalty).toBe(6);
      gainLife(s, "p2", 2);
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(6);
    });

    it("Way of the Mind Sculptor : renforcez Jace 5 ; piochez quand vous activez une capacité de loyauté en retirant deux marqueurs ou plus", () => {
      let { s, jace } = castWay("Way of the Mind Sculptor", "Island", 5);
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      s = resolve(activate(s, "p1", jace, "−1"));
      expect(s.players.p1?.hand).toHaveLength(0);
      let t = castWay("Way of the Mind Sculptor", "Island", 5).s;
      t = resolve(activate(t, "p1", jaceTokens(t)[0] as string, "−3"));
      expect(t.players.p1?.hand).toHaveLength(2); // −3 du Jace, et le déclencheur
    });

    it("Way of the Necromancer : renforcez Jace 2 ; chaque créature que vous contrôlez qui meurt met un marqueur de loyauté sur vos planeswalkers", () => {
      let { s, jace } = castWay("Way of the Necromancer", "Swamp", 2, { battlefield: ["Bear Cub"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(3);
    });

    it("Way of the Paradox : renforcez Jace 5 ; chaque capacité de loyauté activée : +1 PV et un terrain de plus ce tour-ci", () => {
      let { s, jace } = castWay("Way of the Paradox", "Forest", 3, { hand: ["Plains", "Island"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      s = resolve(activate(s, "p1", jace, "−1"));
      expect(life(s, "p1")).toBe(21);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
      expect(legalActions(s, "p1").some((a) => a.type === "playLand")).toBe(true);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    });

    it("Way of the Pyromancer : renforcez Jace 2 ; [+1] : ajoutez {R}", () => {
      let { s, jace } = castWay("Way of the Pyromancer", "Mountain", 2);
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      s = resolve(activate(s, "p1", jace, "+1"));
      expect(s.objects[jace]?.counters.loyalty).toBe(3);
      expect(s.players.p1?.manaPool.R).toBe(1);
    });

    it("Way of the Warlord : renforcez Jace 5 ; [−4] : 2 blessures à jusqu'à une créature ou un planeswalker et 2 à un joueur", () => {
      let { s, jace } = castWay("Way of the Warlord", "Mountain", 3, { battlefield: ["Bear Cub"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(activate(s, "p1", jace, "−4", { targets: { c: [angel], p: ["p2"] } }));
      expect(s.objects[angel]?.damage).toBe(2);
      expect(life(s, "p2")).toBe(18);
    });
  });

  describe("parade", () => {
    it("Gideon the Oathless : parade — défaussez une carte ; sans carte à défausser, le sort adverse est contrecarré", () => {
      const run = (extra: string[]) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Gideon the Oathless"] },
          p2: { hand: ["Shock", ...extra], battlefield: ["Mountain"] },
        });
        const gideon = idOf(s, "p1", "battlefield", "Gideon the Oathless");
        s = resolve(cast(s, "p2", "Shock", { targets: { t: [gideon] } }), (req) => {
          if (req.type === "yesNo") return [1];
          if (req.type === "pick" && req.intent === "discard") return req.options.slice(0, 1);
          return undefined;
        });
        return { damage: s.objects[gideon]?.damage, grave: graveOf(s, "p2").sort() };
      };
      expect(run([])).toEqual({ damage: 0, grave: ["Shock"] });
      expect(run(["Opt"])).toEqual({ damage: 2, grave: ["Opt", "Shock"] });
    });

    it("Kwia Vigorbloom : parade {2}", () => {
      const run = (mountains: number) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Kwia Vigorbloom"] },
          p2: { hand: ["Shock"], battlefield: lands("Mountain", mountains) },
        });
        const kwia = idOf(s, "p1", "battlefield", "Kwia Vigorbloom");
        s = resolve(cast(s, "p2", "Shock", { targets: { t: [kwia] } }), answering(true));
        return s.objects[kwia]?.damage;
      };
      expect(run(1)).toBe(0);
      expect(run(3)).toBe(2);
    });
  });
});
