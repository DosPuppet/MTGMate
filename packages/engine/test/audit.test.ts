/**
 * Écarts de règles relevés par l'audit du 30/09/2026 (AUDIT.md, § 3.1) et corrigés par PLAN-R.md : un `describe` par
 * écart (numéro de l'audit, ou N… pour ceux trouvés en préparant le plan).
 */
import { card, type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy, gainLife } from "../src/actions";
import { syncControl } from "../src/control";
import { cond, doubler, fx, playerStatic, ref, triggered, when } from "../src/dsl";
import { addEffect, runEffect } from "../src/effects";
import { submit } from "../src/game";
import { bump, snapshot } from "../src/layers";
import { legalActions } from "../src/legal";
import { chooseReplacementOrder } from "../src/modifiers";
import { spellCost } from "../src/stack";
import { changeCounters, chars, FACE_DOWN_ID, moveObject } from "../src/state";
import { simultaneously } from "../src/triggers";
import { canBlock, eliminate, forcedAttacks } from "../src/turn";
import type { CardDef, Effect, GameEvent, GameState, TokenSpec } from "../src/types";
import { act, advanceUntil, customCard, idOf, idsOf, passAccepting, passBoth, passUntil, scenario } from "./helpers";

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

describe("#6 : des permanents qui arrivent en même temps se voient arriver (603.6a)", () => {
  const WATCHER: TokenSpec = {
    name: "Guetteur",
    colors: ["W"],
    types: ["Creature"],
    subtypes: ["Spirit"],
    power: 1,
    toughness: 1,
    abilities: [triggered(when.enters({ types: ["Creature"], other: true }), [fx.gainLife(1)], { label: "1 PV" })],
  };

  it("deux jetons créés ensemble : chacun voit l'autre arriver (deux déclenchements)", () => {
    const s = scenario({});
    simultaneously(s, () => runEffect(s, resolution("p1") as never, fx.createTokens(WATCHER, 2)));
    expect(s.triggers.map((t) => t.sourceId).sort()).toEqual(s.battlefield.filter((id) => s.objects[id]?.isToken).sort());
  });

  it("un jeton qui arrive seul ne se voit pas lui-même", () => {
    const s = scenario({});
    simultaneously(s, () => runEffect(s, resolution("p1") as never, fx.createTokens(WATCHER, 1)));
    expect(s.triggers).toHaveLength(0);
  });
});

describe("N6 : une seule façon de lire les statiques de joueur (condition vérifiée, effets sur le joueur compris)", () => {
  const withAbility = (name: string, ab: CardDef["abilities"][number]) =>
    customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });

  it("un effet « ce tour-ci » qui augmente les gains de PV s'applique", () => {
    const s = scenario({});
    runEffect(s, resolution("p1") as never, fx.thisTurn({ lifeGainBonus: 1 }));
    gainLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(23);
  });

  it("une statique de joueur sous condition non remplie ne s'applique pas (délire)", () => {
    const aura = withAbility("Bonus sous délire", playerStatic({ lifeGainBonus: 5, condition: cond.delirium }));
    const s = scenario({ p1: { battlefield: [aura] } });
    gainLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(22);
  });

  it("un doubleur de marqueurs sous condition non remplie ne double pas", () => {
    const season = withAbility("Saison sous délire", doubler({ counters: true, condition: cond.delirium }));
    const s = scenario({ p1: { battlefield: [season, "Bear Cub"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")];
    if (bear) changeCounters(s, bear, "+1/+1", 1);
    expect(bear?.counters["+1/+1"]).toBe(1);
  });
});

describe("#14 et #17 : ce qui accompagne une arrivée est en place avant l'événement d'arrivée (614.1c, 614.12, 508.4)", () => {
  const zombieWatcher = customCard({
    name: "Guetteur de Zombies",
    power: 1,
    toughness: 1,
    abilities: [triggered(when.enters({ subtype: "Zombie" }), [fx.gainLife(2)], { label: "2 PV" })],
  });

  it("une créature remise en jeu « en tant que Zombie en plus » déclenche « chaque fois qu'un Zombie arrive »", () => {
    const s = scenario({ p1: { battlefield: [zombieWatcher], graveyard: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const r = { ...resolution("p1"), targets: { t: [bear] } };
    simultaneously(s, () =>
      runEffect(
        s,
        r as never,
        fx.moveTo(ref.target(), { to: "battlefield", addSubtypes: ["Zombie"], counters: { kind: "+1/+1", n: 1 } }),
      ),
    );
    expect(s.triggers.map((t) => s.defs[t.sourceDefId]?.name)).toContain("Guetteur de Zombies");
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[back]?.counters["+1/+1"]).toBe(1);
  });

  it("un jeton créé engagé ne « devient » pas engagé", () => {
    const tapWatcher: TokenSpec = {
      name: "Sentinelle",
      colors: ["W"],
      types: ["Creature"],
      subtypes: ["Soldier"],
      power: 1,
      toughness: 1,
      abilities: [triggered(when.tapsSelf, [fx.gainLife(1)], { label: "1 PV" })],
    };
    const s = scenario({});
    simultaneously(s, () =>
      runEffect(s, resolution("p1") as never, { op: "createTokens", token: tapWatcher, count: 1, tapped: true }),
    );
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(s.objects[token]?.tapped).toBe(true);
    expect(s.triggers).toHaveLength(0);
  });

  it("à plusieurs adversaires, le contrôleur choisit ce qu'attaquent les jetons « engagés et attaquants »", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Bear Cub"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    const soldier: TokenSpec = {
      name: "Soldat",
      colors: ["W"],
      types: ["Creature"],
      subtypes: ["Soldier"],
      power: 1,
      toughness: 1,
    };
    const r = { ...resolution("p1", { id: bear, defId: s.objects[bear]?.defId as string }), vars: {} as Record<string, unknown> };
    const effect = { op: "createTokens", token: soldier, count: 1, tapped: true, attacking: true } as const;
    const asked = runEffect(s, r as never, effect as never) as {
      ask?: { key: string; request: { options: string[]; suggested: string[] } };
    };
    expect(asked?.ask?.request.options.sort()).toEqual(["p2", "p3"]);
    expect(asked?.ask?.request.suggested).toEqual(["p2"]);
    r.vars[asked?.ask?.key ?? ""] = ["p3"];
    runEffect(s, r as never, effect as never);
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(s.combat?.attackers.find((a) => a.id === token)?.defender).toBe("p3");
  });
});

describe("N7, N8, N9, #13 : copies de permanents", () => {
  const CLONE = customCard({ name: "Clone de test", power: 0, toughness: 0, entersAsCopyOf: {} });

  /** Un Clone qui arrive copie d'Ajani, Caller of the Pride (planeswalker à 4 marqueurs de loyauté, valeur de mana 3). */
  function cloneOfAjani() {
    const s = scenario({ p1: { hand: [CLONE] }, p2: { battlefield: ["Ajani, Caller of the Pride"] } });
    const ajani = idOf(s, "p2", "battlefield", "Ajani, Caller of the Pride");
    const inHand = idOf(s, "p1", "hand", CLONE.name);
    const clone = moveObject(s, inHand, "battlefield", { enters: { copyOf: s.objects[ajani]?.defId } }) as string;
    return { s, ajani, clone };
  }

  it("N7 : un Clone qui copie un planeswalker arrive avec sa loyauté", () => {
    const { s, ajani, clone } = cloneOfAjani();
    expect(s.objects[clone]?.counters.loyalty).toBe(s.defs[s.objects[ajani]?.defId ?? ""]?.loyalty);
    expect(chars(s, clone).types).toContain("Planeswalker");
  });

  it("#13 : la valeur de mana vue par les filtres est celle de ce qui est copié", () => {
    const { s, ajani, clone } = cloneOfAjani();
    expect(snapshot(s, clone).manaValue).toBe(snapshot(s, ajani).manaValue);
    expect(snapshot(s, clone).manaValue).toBeGreaterThan(0);
  });

  it("N8 : la copie en jeton d'un Clone copie ce qu'il copie, et un jeton créé engagé ne « devient » pas engagé", () => {
    const { s, clone } = cloneOfAjani();
    const r = { ...resolution("p1"), targets: { t: [clone] } };
    runEffect(s, r as never, fx.copyToken(ref.target()));
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).name).toBe("Ajani, Caller of the Pride");
  });

  it("N9 : Assimilation Aegis, la créature équipée devient une copie de la carte exilée", () => {
    const s = scenario({ p1: { battlefield: ["Assimilation Aegis", "Bear Cub"] }, p2: { graveyard: ["Shivan Dragon"] } });
    const aegis = idOf(s, "p1", "battlefield", "Assimilation Aegis");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const dragon = moveObject(s, idOf(s, "p2", "graveyard", "Shivan Dragon"), "exile") as string;
    s.linkedExile.push({ sourceId: aegis, cards: [dragon] });
    const o = s.objects[aegis];
    if (o) o.attachedTo = bear;
    bump(s);
    expect(chars(s, bear).name).toBe("Shivan Dragon");
    expect(chars(s, bear).power).toBe(5);
  });
});

describe("#7 et 303.4f : choix d'un permanent qui arrive sans être lancé", () => {
  const CLONE = customCard({
    name: "Clone réanimé",
    power: 0,
    toughness: 0,
    entersAsCopyOf: { types: ["Creature"] },
    entersAsCopyAnyController: true,
  });
  type Asked = { ask?: { key: string; request: { options: string[] } } };

  it("#7 : un Clone réanimé pendant une résolution demande ce qu'il copie, puis arrive comme cette copie", () => {
    const s = scenario({ p1: { graveyard: [CLONE] }, p2: { battlefield: ["Bear Cub", "Shivan Dragon"] } });
    const clone = idOf(s, "p1", "graveyard", CLONE.name);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const r = { ...resolution("p1"), targets: { t: [clone] }, vars: {} as Record<string, unknown> };
    const effect = fx.moveTo(ref.target(), { to: "battlefield" });
    const asked = runEffect(s, r as never, effect) as Asked;
    expect(asked.ask?.request.options).toContain(dragon);
    r.vars[asked.ask?.key ?? ""] = [dragon];
    runEffect(s, r as never, effect);
    const back = idOf(s, "p1", "battlefield", CLONE.name);
    expect(chars(s, back).name).toBe("Shivan Dragon");
  });

  it("#7 : hors résolution, il copie automatiquement le premier permanent possible", () => {
    const s = scenario({ p1: { graveyard: [CLONE] }, p2: { battlefield: ["Shivan Dragon"] } });
    const id = moveObject(s, idOf(s, "p1", "graveyard", CLONE.name), "battlefield") as string;
    expect(chars(s, id).name).toBe("Shivan Dragon");
  });

  it("303.4f : une Aura réanimée demande ce qu'elle enchante", () => {
    const s = scenario({ p1: { graveyard: ["Pacifism"] }, p2: { battlefield: ["Bear Cub", "Shivan Dragon"] } });
    const aura = idOf(s, "p1", "graveyard", "Pacifism");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const r = { ...resolution("p1"), targets: { t: [aura] }, vars: {} as Record<string, unknown> };
    const effect = fx.moveTo(ref.target(), { to: "battlefield" });
    const asked = runEffect(s, r as never, effect) as Asked;
    expect(asked.ask?.request.options).toHaveLength(2);
    r.vars[asked.ask?.key ?? ""] = [dragon];
    runEffect(s, r as never, effect);
    const placed = idOf(s, "p1", "battlefield", "Pacifism");
    expect(s.objects[placed]?.attachedTo).toBe(dragon);
  });

  it("303.4g : sans rien à enchanter, l'Aura reste au cimetière", () => {
    const s = scenario({ p1: { graveyard: ["Pacifism"] } });
    const aura = idOf(s, "p1", "graveyard", "Pacifism");
    expect(moveObject(s, aura, "battlefield")).toBeNull();
    expect(s.objects[aura]?.zone).toBe("graveyard");
  });
});

describe("R1 : ordre des remplacements qui modifient un nombre (616.1)", () => {
  const ench = (name: string, ab: CardDef["abilities"][number]) =>
    customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });

  it("chooseReplacementOrder : le joueur affecté obtient l'ordre le plus favorable", () => {
    expect(chooseReplacementOrder(3, [{ add: 2 }, { times: 2 }], "min")).toBe(8);
    expect(chooseReplacementOrder(3, [{ add: 2 }, { times: 2 }], "max")).toBe(10);
    expect(chooseReplacementOrder(0, [{ add: 2 }], "max")).toBe(0);
    expect(chooseReplacementOrder(1, [{ atLeast: 4 }, { times: 2 }], "min")).toBe(4);
  });

  it("Artist's Talent (+2) et Twinflame Tyrant (×2) : 3 blessures à l'adversaire en font 8, pas 10", () => {
    const talent = ench("Talent", playerStatic({ noncombatDamageBonusAmount: 2 }));
    const tyrant = ench("Tyran", doubler({ damageToOpponents: true }));
    const s = scenario({ p1: { battlefield: [talent, tyrant, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const r = { ...resolution("p1", { id: bear, defId: s.objects[bear]?.defId as string }), targets: { t: ["p2"] } };
    runEffect(s, r as never, fx.damage(3, ref.target()));
    expect(s.players.p2?.life).toBe(12);
  });

  it("Yoshimaru (+1) et Doubling Season (×2) : un marqueur +1/+1 en devient quatre", () => {
    const yoshimaru = ench("Yoshimaru", playerStatic({ plusOneCounterBonus: true }));
    const season = ench("Saison", doubler({ counters: true }));
    const s = scenario({ p1: { battlefield: [yoshimaru, season, "Bear Cub"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")];
    if (bear) changeCounters(s, bear, "+1/+1", 1);
    expect(bear?.counters["+1/+1"]).toBe(4);
  });

  it("gain de PV : « autant plus 1 » puis le double", () => {
    const angel = ench("Ange", playerStatic({ lifeGainBonus: 1 }));
    const crystal = ench("Cristal", doubler({ lifeGain: true }));
    const s = scenario({ p1: { battlefield: [angel, crystal] } });
    gainLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(26);
  });

  it("N12 : la pioche d'un cadeau passe aussi par les remplacements ; deux Vnwxt se cumulent", () => {
    const vnwxt = ench("Vnwxt", playerStatic({ drawDouble: true }));
    const s = scenario({ p2: { battlefield: [vnwxt, vnwxt], hand: ["Forest", "Forest", "Forest"] } });
    const before = s.players.p2?.hand.length ?? 0;
    runEffect(s, resolution("p1") as never, { op: "gift", kind: "card" } as never);
    expect((s.players.p2?.hand.length ?? 0) - before).toBe(4);
  });
});

describe("#4 et N11 : copies de sorts, nouvelles cibles et objet sur la pile (707.10, 707.10c)", () => {
  const choose = (s: GameState, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
  const strike = (s: GameState, target: string) =>
    act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Lightning Strike")[0] as string, targets: { t: [target] } });

  /** Thousand-Year Storm : le second Lightning Strike du tour est copié une fois. */
  function stormCopy(p2: string[]) {
    let s = scenario({
      p1: {
        battlefield: ["Thousand-Year Storm", "Mountain", "Mountain", "Mountain", "Mountain"],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: p2 },
    });
    s = passBoth(strike(s, "p2"));
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = strike(s, elves);
    // Le déclenchement de Thousand-Year Storm se résout : la copie est mise sur la pile, ses cibles sont à choisir.
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    return { s, elves };
  }

  it("la copie propose les cibles d'origine et accepte une nouvelle cible", () => {
    const { s: s0, elves } = stormCopy(["Llanowar Elves", "Pelakka Wurm"]);
    const req = s0.pending?.kind === "choice" ? s0.pending.request : undefined;
    expect(req?.intent).toBe("changeTarget");
    expect(req?.suggested).toEqual([elves]);
    const copy = s0.stack[s0.stack.length - 1];
    expect(copy?.copy).toBe(true);
    // N11 : la copie est un objet sur la pile (sans carte), qu'un « contrecarrez le sort ciblé » peut viser.
    expect(s0.objects[copy?.id ?? ""]?.zone).toBe("stack");
    let s = choose(s0, ["p2"]);
    expect(s.stack[s.stack.length - 1]?.targets.t).toEqual(["p2"]);
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(20 - 3 - 3);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    // La copie a cessé d'exister en quittant la pile.
    expect(s.objects[copy?.id ?? ""]).toBeUndefined();
  });

  it("la cible choisie pour la copie devient sa cible : la garde se déclenche", () => {
    const { s: s0 } = stormCopy(["Llanowar Elves", "Zul Ashur, Lich Lord"]);
    const zul = idOf(s0, "p2", "battlefield", "Zul Ashur, Lich Lord");
    const s = choose(s0, [zul]);
    const top = s.stack[s.stack.length - 1];
    expect(top?.kind).toBe("ability");
    expect(s.defs[top?.sourceDefId ?? ""]?.name).toBe("Zul Ashur, Lich Lord");
  });

  it("une copie n'est pas lancée : « chaque fois que vous lancez un sort qui cible » ne se déclenche pas pour elle", () => {
    const heroic = customCard({
      name: "Héros de test",
      power: 1,
      toughness: 1,
      abilities: [triggered(when.targetedBySpellYouCast, [fx.draw(1)], { label: "piochez" })],
    });
    let s = scenario({
      p1: {
        battlefield: ["Thousand-Year Storm", heroic, "Mountain", "Forest", "Forest", "Forest"],
        hand: ["Giant Growth", "Giant Growth"],
        library: ["Forest", "Forest", "Forest", "Forest"],
      },
    });
    const hero = idOf(s, "p1", "battlefield", heroic.name);
    const growth = () => idsOf(s, "p1", "hand", "Giant Growth")[0] as string;
    const empty = (x: GameState) => x.stack.length === 0 && x.pending?.kind === "priority";
    s = passAccepting(act(s, "p1", { type: "cast", card: growth(), targets: { t: [hero] } }), empty);
    s = passAccepting(act(s, "p1", { type: "cast", card: growth(), targets: { t: [hero] } }), empty);
    // Deux sorts lancés qui ciblent le héros : deux pioches ; la copie n'en donne pas.
    expect(s.players.p1?.library).toHaveLength(2);
    // Deux Giant Growth et la copie : +9.
    expect(chars(s, hero).power).toBe(10);
  });
});

describe("#15 : répartition annoncée à la mise sur la pile ; la part d'une cible devenue illégale est perdue (601.2d, 608.2b)", () => {
  it("Chandra, Flameshaper −4 : 4 et 4 ; l'une des cibles disparaît, l'autre ne reçoit que ses 4", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Flameshaper"] }, p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Flameshaper");
    (s.objects[chandra] as { counters: Record<string, number> }).counters.loyalty = 6;
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === chandra && x.label?.startsWith("−4"));
    if (a?.type !== "activate") throw new Error("capacité −4 indisponible");
    s = act(s, "p1", { type: "activate", source: chandra, ability: a.ability, targets: { t: [wurm, elves] } });
    expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("divide");
    s = act(s, "p1", { type: "choose", values: [4, 4] });
    destroy(s, elves);
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.objects[wurm]?.damage).toBe(4);
    expect(idsOf(s, "p2", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });
});

describe("#12, N10 et 800.4a : le contrôle est une couche (613.1b, 613.7)", () => {
  const steal = (s: GameState, id: string, to: string, e: Effect) =>
    runEffect(s, { ...resolution(to), targets: { t: [id] } } as never, e);

  it("N10 : volé puis repris dans le même tour, le permanent revient à son contrôleur de base à la fin du tour", () => {
    let s = scenario({ p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    steal(s, wurm, "p1", fx.gainControl(ref.target()));
    expect(s.objects[wurm]?.controller).toBe("p1");
    steal(s, wurm, "p2", fx.gainControl(ref.target()));
    expect(s.objects[wurm]?.controller).toBe("p2");
    s = passUntil(s, (x) => x.turn.number === 4);
    expect(s.objects[wurm]?.controller).toBe("p2");
  });

  it("#12 : un don permanent plus récent survit à la fin d'un vol « jusqu'à la fin du tour »", () => {
    let s = scenario({ p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    steal(s, wurm, "p1", fx.gainControl(ref.target()));
    runEffect(s, { ...resolution("p2"), targets: { t: [wurm] } } as never, fx.giveControl(ref.target(), ref.you));
    runEffect(s, { ...resolution("p2"), targets: { t: [wurm] } } as never, fx.giveControl(ref.target(), ref.eachOpponent));
    expect(s.objects[wurm]?.controller).toBe("p1");
    s = passUntil(s, (x) => x.turn.number === 4);
    // L'ancien code rendait le permanent au contrôleur mémorisé au moment du vol (p2).
    expect(s.objects[wurm]?.controller).toBe("p1");
  });

  it("Confiscate : le contrôle suit l'Aura et revient quand elle part", () => {
    const s = scenario({ p1: { hand: ["Confiscate"] }, p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    const aura = moveObject(s, idOf(s, "p1", "hand", "Confiscate"), "battlefield", { enters: { attachTo: wurm } }) as string;
    syncControl(s);
    expect(s.objects[wurm]?.controller).toBe("p1");
    destroy(s, aura);
    syncControl(s);
    expect(s.objects[wurm]?.controller).toBe("p2");
    expect(syncControl(s)).toBe(false);
  });

  it("800.4a : quand le voleur quitte la partie, le permanent revient à son contrôleur au lieu d'être exilé", () => {
    const s = scenario({ players: 3, p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    runEffect(s, { ...resolution("p3"), targets: { t: [wurm] } } as never, fx.giveControl(ref.target(), ref.you));
    expect(s.objects[wurm]?.controller).toBe("p3");
    eliminate(s, ["p3"]);
    expect(s.objects[wurm]?.zone).toBe("battlefield");
    expect(s.objects[wurm]?.controller).toBe("p2");
  });
});

describe("R2.5 : couches, exceptions de copie, couleurs ajoutées et dépendances (707.9b, 105.3, 613.8)", () => {
  it("707.9b : la copie d'un jeton « sauf que c'est un 1/1 Ballon rouge » reprend ces exceptions", () => {
    const s = scenario({ p1: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const balloon = fx.copyToken(ref.target(), { pt: 1, addColors: ["R"], addSubtypes: ["Balloon"], addKeywords: ["flying"] });
    runEffect(s, { ...resolution("p1"), targets: { t: [wurm] } } as never, balloon);
    const first = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, first)).toMatchObject({ power: 1, toughness: 1 });
    // 105.3 : rouge en plus de ses autres couleurs.
    expect(chars(s, first).colors).toEqual(expect.arrayContaining(["G", "R"]));
    runEffect(s, { ...resolution("p1"), targets: { t: [first] } } as never, fx.copyToken(ref.target()));
    const second = s.battlefield.find((id) => s.objects[id]?.isToken && id !== first) as string;
    expect(chars(s, second)).toMatchObject({ name: "Pelakka Wurm", power: 1, toughness: 1 });
    expect(chars(s, second).subtypes).toContain("Balloon");
    expect(chars(s, second).keywords).toContain("flying");
    expect(chars(s, second).colors).toContain("R");
  });

  it("613.8 : « pour chaque » compte un permanent qui a reçu le type par un effet", () => {
    const counter = customCard({
      name: "Compteur de Dragons",
      power: 0,
      toughness: 1,
      abilities: [
        {
          kind: "static",
          affects: "self",
          mods: { power: 1 },
          per: { types: ["Creature"], subtype: "Dragon", controller: "you" },
        } as CardDef["abilities"][number],
      ],
    });
    const s = scenario({ p1: { battlefield: [counter, "Bear Cub"] } });
    const id = idOf(s, "p1", "battlefield", counter.name);
    expect(chars(s, id).power).toBe(0);
    runEffect(
      s,
      { ...resolution("p1"), targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } } as never,
      fx.modify(ref.target(), { addSubtypes: ["Dragon"] }, "permanent"),
    );
    expect(chars(s, id).power).toBe(1);
  });
});

describe("R4.1 : règles de blocage paramétrées par un filtre", () => {
  it("Stromkirk Noble ne peut pas être bloquée par une créature devenue Humain par un effet", () => {
    const s = scenario({ p1: { battlefield: ["Stromkirk Noble"] }, p2: { battlefield: ["Bear Cub"] }, step: "declareBlockers" });
    const noble = idOf(s, "p1", "battlefield", "Stromkirk Noble");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s.combat = {
      attackers: [{ id: noble, defender: "p2", blockers: [], blocked: false }],
      blockers: [],
      blockQueue: [],
    } as never;
    bump(s);
    expect(canBlock(s, bear, noble)).toBe(true);
    runEffect(s, { ...resolution("p2"), targets: { t: [bear] } } as never, fx.modify(ref.target(), { addSubtypes: ["Human"] }));
    expect(canBlock(s, bear, noble)).toBe(false);
  });
});
