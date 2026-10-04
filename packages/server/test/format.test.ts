/** Format du salon : Standard, ou sans limite (choisi à la création, imposé à celui qui rejoint). */
import { CARDS, type DeckEntries } from "@mtgx/cards";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { Client, RED, server } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
});

/** Un deck de 60 cartes avec une carte bannie en Standard. */
const BANNED: DeckEntries = [
  [4, "Up the Beanstalk"],
  [56, "Forest"],
];

async function two() {
  srv = await server();
  const a = await Client.connect(srv.port);
  const b = await Client.connect(srv.port);
  clients.push(a, b);
  return { a, b };
}

describe("format du salon", () => {
  it("en Standard, un deck avec une carte bannie est refusé à la création comme à l'arrivée", async () => {
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck: BANNED });
    const refused = await a.next("error");
    expect(refused.code).toBe("deck");
    expect(refused.message).toContain("bannie en Standard");
    a.send({ type: "create", name: "Alice", deck: RED });
    const created = await a.next("room");
    expect(created.room.match.format).toBeUndefined();
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: BANNED });
    expect((await b.next("error")).code).toBe("deck");
  });

  it("sans limite, la carte bannie est permise, et le salon impose ce format à celui qui rejoint", async () => {
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck: BANNED, format: "unlimited" });
    const created = await a.next("room");
    expect(created.room.match.format).toBe("unlimited");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: BANNED });
    const joined = await b.next("room");
    expect(joined.room.match.format).toBe("unlimited");
  });
});

describe("impressions (PLAN-G, G1)", () => {
  it("le deck envoyé choisit ses illustrations : la vue de son joueur les montre, l'adversaire ne voit pas sa main", async () => {
    const printed = [
      "Ghalta, Primal Hunger",
      "Bloom Tender",
      "Giant Growth",
      "Murder",
      "Burst Lightning",
      "Spell Pierce",
      "Sleight of Hand",
      "Pick Your Poison",
      "Stock Up",
      "Deduce",
      "Abrade",
    ];
    const deck: DeckEntries = [
      ...printed.map((name): DeckEntries[number] => [4, name, CARDS[name]?.printings?.[0]?.key]),
      [16, "Forest"],
    ];
    const images = new Set(printed.map((name) => CARDS[name]?.printings?.[0]?.image));
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck, format: "unlimited" });
    const created = await a.next("room");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
    const ua = await a.next("update");
    const ub = await b.next("update");
    const mine = ua.view.hand.filter((v) => printed.includes(v.name));
    expect(mine.length).toBeGreaterThan(0);
    for (const v of mine) expect(images.has(v.image)).toBe(true);
    const seen = JSON.stringify(ub.view);
    for (const img of images) expect(seen).not.toContain(img);
    // Forme vérifiée : une impression qui n'est pas une chaîne est refusée.
    const c = await Client.connect(srv?.port ?? 0);
    clients.push(c);
    c.send({ type: "create", name: "Eve", deck: [[60, "Forest", 3]] as unknown as DeckEntries });
    expect((await c.next("error")).code).toBe("deck");
  });
});
