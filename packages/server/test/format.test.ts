/** Room format: Standard, or unlimited (chosen at creation, imposed on whoever joins). */
import { CARDS, card, type DeckEntries } from "@mtgx/cards";
import { printingOptions } from "@mtgx/cards/printings";
import { keyedPrinting, plainText, printingKey } from "@mtgx/engine";
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

/** A 60-card deck with a card banned in Standard. */
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

describe("room format", () => {
  it("in Standard, a deck with a banned card is refused at creation as at arrival", async () => {
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck: BANNED });
    const refused = await a.next("error");
    expect(refused.code).toBe("deck");
    expect(plainText(refused.message)).toContain("is banned in Standard");
    a.send({ type: "create", name: "Alice", deck: RED });
    const created = await a.next("room");
    expect(created.room.match.format).toBeUndefined();
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: BANNED });
    expect((await b.next("error")).code).toBe("deck");
  });

  it("in unlimited, the banned card is allowed, and the room imposes that format on whoever joins", async () => {
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck: BANNED, format: "unlimited" });
    const created = await a.next("room");
    expect(created.room.match.format).toBe("unlimited");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: BANNED });
    const joined = await b.next("room");
    expect(joined.room.match.format).toBe("unlimited");
  });
});

describe("printings (PLAN-G, G1)", () => {
  it("the sent deck chooses its artwork: its player's view shows it, the opponent does not see its hand", async () => {
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
    // Shape checked: a printing that is not a string is refused.
    const c = await Client.connect(srv?.port ?? 0);
    clients.push(c);
    c.send({ type: "create", name: "Eve", deck: [[60, "Forest", 3]] as unknown as DeckEntries });
    expect((await c.next("error")).code).toBe("deck");
  });

  it("a printing from the table is shown; a key that is not a printing of the card is removed", async () => {
    const forest = printingOptions(card("Forest")).find((p) => p.key)?.key as string;
    const image = keyedPrinting(forest)?.image;
    // Well-formed, but not a printing of the Island: a client cannot impose an image of its choice.
    const forged = printingKey("LEA", "161", "0123456789abcdef0123456789abcdef");
    const deck: DeckEntries = [
      [30, "Forest", forest],
      [30, "Island", forged],
    ];
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck, format: "unlimited" });
    const created = await a.next("room");
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: RED });
    const ua = await a.next("update");
    const hand = ua.view.hand;
    expect(hand.some((v) => v.name === "Forest" || v.name === "Island")).toBe(true);
    for (const v of hand.filter((x) => x.name === "Forest")) expect(v.image).toBe(image);
    for (const v of hand.filter((x) => x.name === "Island")) expect(v.image).toBe(card("Island").image);
    expect(JSON.stringify(ua.view)).not.toContain("0123456789abcdef");
  });
});
