/**
 * Écarts de règles relevés par l'audit du 30/09/2026 (AUDIT.md, § 3.1) et corrigés par PLAN-R.md : un `describe` par
 * écart (numéro de l'audit, ou N… pour ceux trouvés en préparant le plan).
 */
import { card, type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { fx, ref, triggered, when } from "../src/dsl";
import { addEffect, runEffect } from "../src/effects";
import { submit } from "../src/game";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { spellCost } from "../src/stack";
import { changeCounters, FACE_DOWN_ID } from "../src/state";
import { forcedAttacks } from "../src/turn";
import type { CardDef, GameEvent, GameState } from "../src/types";
import { act, advanceUntil, customCard, idOf, idsOf, passBoth, passUntil, scenario } from "./helpers";

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

describe("#3 : une obligation d'attaquer n'impose pas de payer une taxe d'attaque (508.1d)", () => {
  it("Juggernaut face à Archangel of Tithes : ne pas attaquer est accepté, avec ou sans mana ; l'automatisme n'attaque pas", () => {
    for (const lands of [[], ["Plains"]]) {
      let s = scenario({ p1: { battlefield: ["Juggernaut", ...lands] }, p2: { battlefield: ["Archangel of Tithes"] } });
      s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(forcedAttacks(s, "p1")).toEqual([]);
      s = act(s, "p1", { type: "declareAttackers", attackers: [] });
      expect(s.combat?.attackers ?? []).toEqual([]);
    }
  });

  it("sans taxe, Juggernaut doit toujours attaquer", () => {
    let s = scenario({ p1: { battlefield: ["Juggernaut"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow(/doit attaquer/);
    expect(forcedAttacks(s, "p1")).toEqual([{ id: idOf(s, "p1", "battlefield", "Juggernaut"), defender: "p2" }]);
  });
});

describe("N3 : les taxes d'attaque se cumulent", () => {
  it("deux Archangel of Tithes : {2} par attaquant", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Forest", "Forest"] },
      p2: { battlefield: ["Archangel of Tithes", "Archangel of Tithes"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    expect(
      s.battlefield.filter((id) => s.objects[id]?.tapped && s.defs[s.objects[id]?.defId ?? ""]?.name === "Forest"),
    ).toHaveLength(2);
  });
});

describe("#5 : un sort lancé sans payer son coût paie quand même les augmentations (601.2f, 118.9d)", () => {
  it("Lightning Strike gratuit face à Thalia, the Survivor coûte {1}", () => {
    const s = scenario({ p2: { battlefield: ["Thalia, the Survivor"] } });
    const cost = spellCost(s, "p1", card("Lightning Strike"), { free: true });
    expect(cost.generic).toBe(1);
    expect(Object.values(cost.colored).every((n) => !n)).toBe(true);
  });
});

describe("#1 : étape de nettoyage, actions basées sur l'état et priorité (514.3a)", () => {
  /** Une créature 2/2 avec deux marqueurs −1/−1, tenue en vie par Giant Growth jusqu'à la fin du tour. */
  function pumped(extra: (string | CardDef)[] = []) {
    let s = scenario({ p1: { battlefield: ["Forest", ...extra], hand: ["Giant Growth"] } });
    const first = extra[0];
    const bear = first ? idOf(s, "p1", "battlefield", typeof first === "string" ? first : first.name) : "";
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giant Growth"), targets: { t: [bear] } });
    s = passBoth(s);
    const o = s.objects[bear];
    if (o) changeCounters(s, o, "-1/-1", 2);
    bump(s);
    return { s, bear };
  }

  it("la créature meurt pendant le nettoyage du même tour, pas à l'entretien suivant", () => {
    const { s: s0, bear } = pumped(["Bear Cub"]);
    let s = s0;
    let diedAt: [number, string] | null = null;
    for (let i = 0; i < 300 && !diedAt; i++) {
      const next = advanceUntil(s, (x) => x !== s, 1);
      if (next === s) break;
      s = next;
      if (!s.battlefield.includes(bear)) diedAt = [s.turn.number, s.turn.step];
    }
    expect(diedAt).toEqual([3, "cleanup"]);
  });

  it("son déclencheur « quand elle meurt » se résout pendant le nettoyage, suivi d'un nouveau nettoyage", () => {
    const mourner = customCard({
      name: "Pleureur",
      power: 2,
      toughness: 2,
      abilities: [triggered(when.dies({ self: true }), [fx.gainLife(3)], { label: "3 PV" })],
    });
    const { s: s0 } = pumped([mourner]);
    const s = advanceUntil(s0, (x) => x.turn.number === 4 || x.players.p1?.life === 23);
    expect(s.players.p1?.life).toBe(23);
    expect(s.turn).toMatchObject({ number: 3, step: "cleanup" });
    const next = advanceUntil(s, (x) => x.turn.number === 4);
    expect(next.turn.number).toBe(4);
    expect(next.turn.cleanupAgain).toBeFalsy();
  });

  it("sans rien à faire, pas de priorité pendant le nettoyage", () => {
    let s = scenario({ step: "end" });
    s = advanceUntil(s, (x) => x.turn.number === 4 || (x.turn.step === "cleanup" && x.pending?.kind === "priority"));
    expect(s.turn.number).toBe(4);
  });
});

describe("#2 : lien de vie, un gain de points de vie par source et par lot de blessures (119.9, 120.3f)", () => {
  const lifelinker = (name: string, keywords: CardDef["keywords"]) =>
    customCard({ name, power: 5, toughness: 5, keywords: ["lifelink", ...keywords] });

  function combat(attackers: CardDef[], blockers: string[]) {
    let s = scenario({ p1: { battlefield: ["Ajani's Pridemate", ...attackers] }, p2: { battlefield: blockers } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const ids = attackers.map((a) => idOf(s, "p1", "battlefield", a.name));
    s = act(s, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    if (blockers.length) {
      s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const blocker = idsOf(s, "p2", "battlefield", blockers[0] as string)[0] as string;
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker, attacker: ids[0] as string }] });
    }
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    return { s, pridemate: idOf(s, "p1", "battlefield", "Ajani's Pridemate") };
  }

  it("un piétineur 5/5 bloqué par un 2/2 : 5 PV en un seul gain", () => {
    const { s, pridemate } = combat([lifelinker("Piétineur", ["trample"])], ["Bear Cub"]);
    expect(s.players.p1?.life).toBe(25);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(1);
  });

  it("deux attaquants avec le lien de vie : deux gains", () => {
    const { s, pridemate } = combat([lifelinker("Lien A", []), lifelinker("Lien B", [])], []);
    expect(s.players.p1?.life).toBe(30);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(2);
  });

  it("double initiative : un gain par étape de blessures", () => {
    const { s, pridemate } = combat([lifelinker("Double", ["doubleStrike"])], []);
    expect(s.players.p1?.life).toBe(30);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(2);
  });
});
