/** Sauvegarde des parties en ligne : un redémarrage du serveur ne coupe plus les parties (`RoomConfig.dataDir`). */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { card } from "@mtgx/cards";
import { isGameRecord, replayGame } from "@mtgx/engine";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { Client, duel, server } from "./helpers";

const servers: RunningServer[] = [];
const clients: Client[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  for (const s of servers.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "mtgx-rooms-"));
  dirs.push(d);
  return d;
}

async function tokenOf(c: Client): Promise<string> {
  const room = [...c.received].reverse().find((m) => m.type === "room");
  return room?.type === "room" ? room.room.token : "";
}

describe("parties sauvegardées", () => {
  it("après un redémarrage du serveur, les joueurs reprennent la partie avec leur jeton et la finissent", async () => {
    const dataDir = tempDir();
    const first = await server({ dataDir, graceMs: 10_000 });
    servers.push(first);
    const { a, b, code } = await duel(first.port, { bots: false });
    clients.push(a, b);
    // Quelques décisions : les deux joueurs gardent leur main.
    for (let i = 0; i < 4; i++) {
      for (const c of [a, b]) {
        const v = c.lastView;
        if (v?.pending?.player === v?.viewer && v?.pending?.kind === "mulligan")
          c.send({ type: "decision", decision: { type: "keep" } });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const before = { a: a.lastView, b: b.lastView };
    const [ta, tb] = [await tokenOf(a), await tokenOf(b)];
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(true);

    // Arrêt du serveur (pm2 restart) : la sauvegarde reste.
    await Promise.all([a.close(), b.close()]);
    await first.close();
    servers.splice(servers.indexOf(first), 1);
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(true);

    const second = await server({ dataDir, graceMs: 10_000 });
    servers.push(second);
    expect(second.rooms.size).toBe(1);
    const a2 = await Client.connect(second.port);
    const b2 = await Client.connect(second.port);
    clients.push(a2, b2);
    a2.send({ type: "rejoin", token: ta });
    b2.send({ type: "rejoin", token: tb });
    const upA = await a2.next("update");
    const upB = await b2.next("update");
    // La partie reprise est exactement celle d'avant (même main, même tour, mêmes points de vie).
    expect(upA.view.hand.map((c) => c.id)).toEqual(before.a?.hand.map((c) => c.id));
    expect(upB.view.hand.map((c) => c.id)).toEqual(before.b?.hand.map((c) => c.id));
    expect(upA.view.turn).toEqual(before.a?.turn);
    // Pas d'export pendant la partie (il révèle les decks et la graine).
    a2.send({ type: "export" });
    expect((await a2.next("error", (m) => m.code === "state")).message).toMatch(/pas terminée/);
    // Et elle continue : les bots jouent quelques secondes, puis Alice concède (si elle n'est pas déjà finie).
    a2.bot = b2.bot = true;
    a2.play(upA.view);
    b2.play(upB.view);
    await new Promise((r) => setTimeout(r, 2_000));
    a2.bot = false;
    // Les bots jouent sans pause : la partie a pu se terminer d'elle-même.
    if (!a2.lastView?.over) a2.send({ type: "decision", decision: { type: "concede" } });
    const end = await a2.next("update", (m) => m.view.over, 20_000);
    expect(end.view.winner).toBeTruthy();
    expect(end.view.turn.number).toBeGreaterThanOrEqual(upA.view.turn.number);
    // Export de la partie terminée : il se rejoue jusqu'au même vainqueur (décisions d'avant et d'après le redémarrage).
    a2.send({ type: "export" });
    const { record } = await a2.next("record");
    expect(isGameRecord(record)).toBe(true);
    const replayed = replayGame(record, card);
    expect(replayed.state.over).toBe(true);
    expect(replayed.state.winner).toBe(end.view.winner);
  }, 60_000);

  it("un salon fermé efface sa sauvegarde ; un fichier illisible est mis de côté sans bloquer le démarrage", async () => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, "ABCDEF.jsonl"), "pas du JSON\n");
    const srv = await server({ dataDir, cleanupMs: 50 });
    servers.push(srv);
    expect(srv.rooms.size).toBe(0);
    expect(readdirSync(dataDir)).toContain("ABCDEF.jsonl.bad");
    const { a, b, code } = await duel(srv.port, { bots: false });
    clients.push(a, b);
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(true);
    a.send({ type: "leave" });
    b.send({ type: "leave" });
    await Promise.all([a.close(), b.close()]);
    for (let i = 0; i < 40 && existsSync(join(dataDir, `${code}.jsonl`)); i++) await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(false);
  });
});
