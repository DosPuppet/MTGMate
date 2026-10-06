/**
 * Commander (903, PLAN-E, E2) : mise en place (40 PV, commandant dans la zone de commandement), lancer depuis la zone de
 * commandement et taxe (903.8), aucune capacité active dans cette zone (113.6), retour dans la zone de commandement
 * depuis le cimetière ou l'exil (903.9a) et à la place de la bibliothèque (903.9b), 21 blessures de combat d'un même
 * commandant (903.10a, 704.6c), vue et enregistrement.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { outcomeHash } from "../src/fingerprint";
import { createGame } from "../src/game";
import { legalActions } from "../src/legal";
import { createRecordedGame, recordDecision, replayGame } from "../src/record";
import { castTerms } from "../src/stack";
import { chars, moveObject } from "../src/state";
import { advance } from "../src/turn";
import type { Decision, GameState, ObjectId, PlayerId } from "../src/types";
import { projectView } from "../src/view";
import { act, attack, idOf, passAccepting, passBoth, scenario, throughCombat } from "./helpers";

const ARAHBO = "Arahbo, the First Fang"; // {2}{W}, « les autres Chats que vous contrôlez gagnent +1/+1 »
const LIONS = "Savannah Lions"; // Chat 2/1

/** L'objet du commandant de `player` (où qu'il soit). */
function commanderId(s: GameState, player: PlayerId): ObjectId {
  const entry = Object.entries(s.commander?.cards ?? {}).find(([, c]) => c.owner === player);
  const o = Object.values(s.objects).find((x) => x.uid === entry?.[0] && !x.isToken);
  if (!o) throw new Error(`commandant de ${player} introuvable`);
  return o.id;
}
const rec = (s: GameState, player: PlayerId) =>
  Object.values(s.commander?.cards ?? {}).find((c) => c.owner === player) as NonNullable<GameState["commander"]>["cards"][string];

/** Fait de l'objet un commandant (commandant déjà sur le champ de bataille, dans un cimetière…). */
function makeCommander(s: GameState, id: ObjectId): GameState {
  const o = s.objects[id];
  if (!o) throw new Error("objet introuvable");
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  return s;
}

/** Actions basées sur l'état vérifiées à nouveau (après un déplacement fait directement par le test). */
function recheck(s: GameState): GameState {
  s.pending = null;
  s.flow = "priority";
  s.priority = { holder: s.turn.active, passes: 0 };
  advance(s);
  return s;
}

const answer = (s: GameState, yes: boolean) => act(s, s.pending?.player as PlayerId, { type: "choose", values: [yes ? 1 : 0] });

describe("Commander : mise en place (903.6, 903.7)", () => {
  const deck = [card(ARAHBO), ...Array.from({ length: 99 }, () => card("Plains"))];

  it("40 points de vie ; le commandant commence dans la zone de commandement, les 99 autres cartes dans la bibliothèque", () => {
    const { state } = createGame({
      seed: 7,
      variant: "commander",
      players: [
        { id: "p1", name: "A", deck, commanders: [0] },
        { id: "p2", name: "B", deck, commanders: [0] },
      ],
    });
    for (const p of ["p1", "p2"]) {
      const pl = state.players[p];
      expect(pl?.life).toBe(40);
      expect(pl?.startingLife).toBe(40);
      expect(pl?.command.map((id) => state.objects[id]?.defId)).toEqual([card(ARAHBO).id]);
      expect((pl?.library.length ?? 0) + (pl?.hand.length ?? 0)).toBe(99);
    }
    expect(Object.values(state.commander?.cards ?? {}).map((c) => c.owner)).toEqual(["p1", "p2"]);
  });

  it("hors Commander, rien ne change : 20 PV, pas d'état Commander, toutes les cartes dans la bibliothèque", () => {
    const { state } = createGame({
      seed: 7,
      players: [
        { id: "p1", name: "A", deck },
        { id: "p2", name: "B", deck },
      ],
    });
    expect(state.players.p1?.life).toBe(20);
    expect(state.commander).toBeUndefined();
    expect(state.players.p1?.command).toEqual([]);
  });

  it("l'enregistrement garde la variante et les commandants ; le rejeu redonne le même état", () => {
    const opts = {
      seed: 11,
      variant: "commander" as const,
      players: [
        { id: "p1", name: "A", deck, commanders: [0] },
        { id: "p2", name: "B", deck, commanders: [0] },
      ],
    };
    let { state, record } = createRecordedGame(opts);
    expect(record.variant).toBe("commander");
    expect(record.players[0]?.commanders).toEqual([0]);
    for (let i = 0; i < 6 && state.pending; i++) {
      const p = state.pending.player;
      const d: Decision = state.pending.kind === "mulligan" ? { type: "keep" } : { type: "pass" };
      state = act(state, p, d);
      recordDecision(record, p, d, state);
    }
    const replayed = replayGame(record, (name) => card(name)).state;
    expect(outcomeHash(replayed)).toBe(outcomeHash(state));
  });
});

describe("Commander : lancer depuis la zone de commandement (903.8)", () => {
  const base = () => scenario({ p1: { command: [ARAHBO], battlefield: ["Plains", "Plains", "Plains", LIONS], hand: [] } });

  it("le commandant se lance depuis la zone de commandement ; il n'y a aucune capacité active (113.6)", () => {
    let s = base();
    const lions = idOf(s, "p1", "battlefield", LIONS);
    // Arahbo dans la zone de commandement : les Chats ne gagnent rien.
    expect(chars(s, lions).power).toBe(2);
    const id = commanderId(s, "p1");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === id)).toBe(true);
    // Un adversaire ne peut pas le lancer.
    expect(castTerms(s, "p2", id)).toBeNull();
    s = act(s, "p1", { type: "cast", card: id });
    expect(rec(s, "p1").casts).toBe(1);
    s = passBoth(s);
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    expect(s.objects[arahbo]?.zone).toBe("battlefield");
    // Sur le champ de bataille, sa statique s'applique.
    expect(chars(s, lions).power).toBe(3);
  });

  it("taxe : {2} de plus par lancer précédent depuis la zone de commandement, montrée par la vue", () => {
    let s = base();
    rec(s, "p1").casts = 1;
    const id = commanderId(s, "p1");
    expect(castTerms(s, "p1", id)?.extraCost).toBe(2);
    // Trois Plaines pour un coût de {4}{W} : impossible.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === id)).toBe(false);
    const shown = projectView(s, "p1").playableElsewhere.find((o) => o.id === id);
    expect(shown?.castCost?.text).toBe("{4}{W}");
    expect(projectView(s, "p2").players.p1?.commanders).toEqual([{ defId: card(ARAHBO).id, zone: "command", id, tax: 2 }]);
    s = scenario({ p1: { command: [ARAHBO], battlefield: Array(5).fill("Plains") } });
    rec(s, "p1").casts = 1;
    s = act(s, "p1", { type: "cast", card: commanderId(s, "p1") });
    expect(s.battlefield.filter((x) => s.objects[x]?.tapped)).toHaveLength(5);
    expect(rec(s, "p1").casts).toBe(2);
  });
});

describe("Commander : retour dans la zone de commandement (903.9)", () => {
  /** p1 a son commandant sur le champ de bataille. */
  const onBattlefield = () => {
    const s = scenario({ p1: { battlefield: [ARAHBO] } });
    return makeCommander(s, idOf(s, "p1", "battlefield", ARAHBO));
  };

  it("903.9a : au cimetière, son propriétaire choisit de le remettre dans la zone de commandement ; les déclencheurs « meurt » le voient mourir", () => {
    // Vengeful Bloodwitch : « chaque fois que cette créature ou une autre créature que vous contrôlez meurt, l'adversaire
    // ciblé perd 1 point de vie et vous en gagnez 1 ».
    let s = scenario({ p1: { battlefield: [ARAHBO, "Vengeful Bloodwitch"] } });
    makeCommander(s, idOf(s, "p1", "battlefield", ARAHBO));
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "graveyard");
    s = recheck(s);
    expect(s.pending?.kind).toBe("choice");
    if (s.pending?.kind !== "choice") return;
    expect(s.pending.player).toBe("p1");
    expect(s.pending.request.intent).toBe("commanderZone");
    s = answer(s, true);
    expect(s.players.p1?.command.map((x) => s.objects[x]?.defId)).toEqual([card(ARAHBO).id]);
    expect(s.players.p1?.graveyard).toEqual([]);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.life).toBe(19);
  });

  it("903.9a : un refus le laisse au cimetière, sans nouvelle question ; une nouvelle zone (exil) repose la question", () => {
    let s = onBattlefield();
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "graveyard");
    s = answer(recheck(s), false);
    expect(s.pending?.kind).toBe("priority");
    const inGraveyard = idOf(s, "p1", "graveyard", ARAHBO);
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.kind).not.toBe("choice");
    moveObject(s, inGraveyard, "exile");
    s = recheck(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
    s = answer(s, true);
    expect(s.exile).toEqual([]);
    expect(s.players.p1?.command).toHaveLength(1);
  });

  it("903.9b : vers la bibliothèque ou la main, le propriétaire choisit ; un refus le laisse où il est", () => {
    // Vers la bibliothèque : la question est posée ; oui, il va dans la zone de commandement.
    let s = onBattlefield();
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "library");
    s = recheck(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
    expect(s.pending?.kind === "choice" && s.pending.request.autoOk).toBeFalsy();
    s = answer(s, true);
    expect(s.players.p1?.command.map((x) => s.objects[x]?.defId)).toEqual([card(ARAHBO).id]);
    expect(s.players.p1?.library.some((x) => s.objects[x]?.defId === card(ARAHBO).id)).toBe(false);
    // Vers la main : non, il reste en main et se relance sans taxe.
    let s2 = onBattlefield();
    moveObject(s2, idOf(s2, "p1", "battlefield", ARAHBO), "hand");
    s2 = answer(recheck(s2), false);
    const inHand = idOf(s2, "p1", "hand", ARAHBO);
    expect(s2.pending?.kind).toBe("priority");
    expect(castTerms(s2, "p1", inHand)).toMatchObject({ source: "hand" });
    expect(castTerms(s2, "p1", inHand)?.extraCost).toBeUndefined();
    // Vers la main : oui, il va dans la zone de commandement.
    let s3 = onBattlefield();
    moveObject(s3, idOf(s3, "p1", "battlefield", ARAHBO), "hand");
    s3 = answer(recheck(s3), true);
    expect(s3.players.p1?.hand).toEqual([]);
    expect(s3.players.p1?.command).toHaveLength(1);
  });

  it("903.9b : laissé dans la bibliothèque puis pioché, la question est posée de nouveau (vers la main)", () => {
    let s = onBattlefield();
    moveObject(s, idOf(s, "p1", "battlefield", ARAHBO), "library", { position: "top" });
    s = answer(recheck(s), false);
    moveObject(s, s.players.p1?.library[0] as string, "hand");
    s = recheck(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("commanderZone");
  });
});

describe("Commander : blessures de commandant (903.10a, 704.6c)", () => {
  it("21 blessures de combat d'un même commandant au cours de la partie : le joueur perd, même avec des PV", () => {
    let s = scenario({ p1: { battlefield: [ARAHBO] }, p2: { life: 40 } });
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    makeCommander(s, arahbo);
    rec(s, "p1").damage.p2 = 19;
    s = throughCombat(attack(s, [arahbo]));
    expect(s.players.p2?.life).toBe(38);
    expect(s.players.p2?.lost).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("les blessures se cumulent par joueur ; la vue les montre ; celles d'une autre créature ne comptent pas", () => {
    let s = scenario({ players: 3, p1: { battlefield: [ARAHBO, LIONS] } });
    const arahbo = idOf(s, "p1", "battlefield", ARAHBO);
    makeCommander(s, arahbo);
    s = throughCombat(attack(s, [arahbo, idOf(s, "p1", "battlefield", LIONS)]));
    // Arahbo (2/2) et les Lions (2/1 +1/+1) attaquent p2 : seules les blessures d'Arahbo comptent.
    expect(rec(s, "p1").damage).toEqual({ p2: 2 });
    expect(projectView(s, "p3").players.p2?.commanderDamage).toEqual([{ defId: card(ARAHBO).id, owner: "p1", amount: 2 }]);
  });
});
