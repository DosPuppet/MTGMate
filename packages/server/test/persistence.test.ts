/** Sauvegarde des parties en ligne : un redémarrage du serveur ne coupe plus les parties (`RoomConfig.dataDir`). */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { card } from "@mtgx/cards";
import { isGameRecord, RULES_VERSION, replayGame } from "@mtgx/engine";
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

  /** Une partie en cours (les deux joueurs gardent leur main), puis l'arrêt du serveur : le fichier et les jetons. */
  async function savedGame(dataDir: string): Promise<{ file: string; tokens: string[] }> {
    const first = await server({ dataDir, graceMs: 10_000 });
    const { a, b, code } = await duel(first.port, { bots: false });
    for (let i = 0; i < 4; i++) {
      for (const c of [a, b]) {
        const v = c.lastView;
        if (v?.pending?.player === v?.viewer && v?.pending?.kind === "mulligan")
          c.send({ type: "decision", decision: { type: "keep" } });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const tokens = [await tokenOf(a), await tokenOf(b)];
    await Promise.all([a.close(), b.close()]);
    await first.close();
    return { file: join(dataDir, `${code}.jsonl`), tokens };
  }

  it("chaque décision sauvegardée porte l'empreinte de l'état ; autre version des règles sans empreinte : partie interrompue", async () => {
    const dataDir = tempDir();
    const { file, tokens } = await savedGame(dataDir);
    const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(JSON.parse(head as string).record.rules).toBe(RULES_VERSION);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(typeof JSON.parse(l)[2]).toBe("string");
    // Sauvegarde d'une version antérieure des règles, sans empreintes (version 0).
    const old = JSON.parse(head as string);
    delete old.record.rules;
    const oldLines = lines.map((l) => JSON.stringify(JSON.parse(l).slice(0, 2)));
    writeFileSync(file, `${[JSON.stringify(old), ...oldLines].join("\n")}\n`);

    const srv = await server({ dataDir });
    servers.push(srv);
    expect(srv.rooms.size).toBe(0);
    expect(readdirSync(dataDir)).toContain(`${file.split("/").at(-1)}.rules0`);
    const c = await Client.connect(srv.port);
    clients.push(c);
    c.send({ type: "rejoin", token: tokens[0] as string });
    expect((await c.next("error", (m) => m.code === "token")).message).toMatch(/interrompue par une mise à jour du moteur/);
  }, 30_000);

  it("même version des règles mais empreinte différente : le fichier est mis de côté (moteur non déterministe)", async () => {
    const dataDir = tempDir();
    const { file } = await savedGame(dataDir);
    const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
    const last = JSON.parse(lines.at(-1) as string);
    last[2] = "0";
    writeFileSync(file, `${[head, ...lines.slice(0, -1), JSON.stringify(last)].join("\n")}\n`);
    const srv = await server({ dataDir });
    servers.push(srv);
    expect(srv.rooms.size).toBe(0);
    expect(readdirSync(dataDir)).toContain(`${file.split("/").at(-1)}.bad`);
  }, 30_000);

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
