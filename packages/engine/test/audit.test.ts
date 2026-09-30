/**
 * Écarts de règles relevés par l'audit du 30/09/2026 (AUDIT.md, § 3.1) et corrigés par PLAN-R.md : un `describe` par
 * écart (numéro de l'audit, ou N… pour ceux trouvés en préparant le plan).
 */
import { type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { fx, ref } from "../src/dsl";
import { addEffect, runEffect } from "../src/effects";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import { FACE_DOWN_ID } from "../src/state";
import type { GameEvent, GameState } from "../src/types";
import { act, idOf, passBoth, passUntil, scenario } from "./helpers";

const raw = (name: string, typeLine: string, oracleText: string, keywords: string[], manaCost = "{3}{W}"): RawCard => ({
  name,
  number: "1",
  rarity: "common",
  manaCost,
  cmc: 4,
  typeLine,
  oracleText,
  power: "3",
  toughness: "3",
  colors: ["W"],
  keywords,
  image: "",
  artCrop: "",
  legalities: { standard: "legal" },
});

const resolution = (controller: string, source?: { id: string; defId: string }) => ({
  item: { id: "x", controller, sourceId: source?.id ?? "none", sourceDefId: source?.defId ?? "none", targets: {} },
  controller,
  targets: {},
  vars: {},
  pc: 0,
});

describe("#8 : 704.5b, seule une pioche impossible depuis la dernière vérification fait perdre", () => {
  it("Herald of Eternal Dawn quitte le jeu longtemps après la pioche impossible : pas de défaite", () => {
    let s = scenario({ p1: { battlefield: ["Herald of Eternal Dawn"], library: [] }, step: "upkeep" });
    s = passUntil(s, (x) => x.turn.step === "main1");
    expect(s.players.p1?.lost).toBe(false);
    destroy(s, idOf(s, "p1", "battlefield", "Herald of Eternal Dawn"));
    s = passUntil(s, (x) => !!x.players.p1?.lost || x.turn.step !== "main1");
    expect(s.players.p1?.lost).toBe(false);
  });

  it("sans Herald, la pioche impossible fait perdre, annoncée comme telle ; le poison est annoncé comme poison", () => {
    const events: GameEvent[] = [];
    let s = scenario({ p1: { library: [] }, step: "upkeep" });
    s = passUntil(s, (x) => x.over);
    expect(s.winner).toBe("p2");
    const poisoned = scenario({});
    const p2 = poisoned.players.p2;
    if (p2) p2.poison = 10;
    const r = submit(poisoned, "p1", { type: "pass" });
    events.push(...r.events);
    expect(events.find((e) => e.type === "lose")).toMatchObject({ player: "p2", reason: "poison" });
  });
});

describe("#9 : le second partagé n'empêche pas les actions spéciales (702.61b)", () => {
  const disguised = toCardDef(
    raw("Espion déguisé", "Creature — Human Rogue", "Flying\nDisguise {1}{W}", ["Flying", "Disguise"]),
    {},
    "TST",
  );
  it("avec un éphémère de Samut sur la pile, on peut retourner une carte face visible, pas lancer de sort", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Plains", "Plains", "Plains"], hand: [disguised, "Giant Growth"] },
      p2: { battlefield: ["Samut, Tyrant of Naktamun", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", disguised.name), faceDown: true });
    s = passBoth(s);
    const hidden = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    const options = legalActions(s, "p1");
    const up = options.find((a) => a.type === "activate" && a.source === hidden);
    expect(up).toBeDefined();
    expect(options.some((a) => a.type === "cast")).toBe(false);
    s = act(s, "p1", { type: "activate", source: hidden, ability: up?.type === "activate" ? up.ability : -1 });
    expect(s.objects[hidden]?.defId).not.toBe(FACE_DOWN_ID);
  });
});

describe("#10 : gagner ou perdre la partie par un effet respecte « ne peut pas perdre »", () => {
  it("un adversaire avec Herald of Eternal Dawn : « vous gagnez la partie » ne fait rien ; « vous perdez » non plus pour lui", () => {
    const s = scenario({ p2: { battlefield: ["Herald of Eternal Dawn"] } });
    runEffect(s, resolution("p1") as never, fx.winGame);
    expect(s.over).toBe(false);
    runEffect(s, resolution("p2") as never, fx.loseGame);
    expect(s.players.p2?.lost).toBe(false);
    runEffect(s, resolution("p1") as never, fx.loseGame);
    expect(s.winner).toBe("p2");
  });
});

describe("#11 : la protection contre tout ne prévient pas des blessures qui ne peuvent pas être prévenues", () => {
  it("Progenitus subit les blessures quand elles ne peuvent pas être prévenues (Sunspine Lynx)", () => {
    const s = scenario({ p1: { battlefield: ["Sunspine Lynx"] }, p2: { battlefield: ["Progenitus"] } });
    const progenitus = idOf(s, "p2", "battlefield", "Progenitus");
    const lynx = idOf(s, "p1", "battlefield", "Sunspine Lynx");
    const source = { id: lynx, defId: s.objects[lynx]?.defId as string };
    const r = { ...resolution("p1", source), targets: { t: [progenitus] } };
    runEffect(s, r as never, fx.damage(3, ref.target()));
    expect(s.objects[progenitus]?.damage).toBe(3);
  });
});

describe("#16 : 506.4, un permanent qui cesse d'être une créature quitte le combat", () => {
  it("un attaquant devenu un simple artefact ne blesse pas le joueur défenseur", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    addEffect(s, [bear], { setTypes: ["Artifact"] }, "endOfTurn");
    s = passUntil(s, (x: GameState) => x.turn.step === "main2");
    expect(s.combat?.attackers.some((a) => a.id === bear) ?? false).toBe(false);
    expect(s.players.p2?.life).toBe(20);
  });
});

describe("N2 : les marqueurs mis comme coût ne sont pas doublés par Doubling Season", () => {
  it("+1 d'Ajani : un marqueur de loyauté de plus (coût), deux +1/+1 sur la créature (effet)", () => {
    let s = scenario({ p1: { battlefield: ["Ajani, Caller of the Pride", "Doubling Season", "Bear Cub"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani, Caller of the Pride");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const before = s.objects[ajani]?.counters.loyalty ?? 0;
    s = act(s, "p1", { type: "activate", source: ajani, ability: 0, targets: { t: [bear] } });
    expect(s.objects[ajani]?.counters.loyalty).toBe(before + 1);
    s = passBoth(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
  });
});
