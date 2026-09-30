import { CARDS } from "@mtgx/cards";
import type { CardDef } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { searchFilter } from "../src/decks/search";

const card = (name: string) => CARDS[name] as CardDef;
const hit = (query: string, name: string) => searchFilter(query)(card(name));

describe("recherche du deckbuilder", () => {
  it("mots libres : nom, en anglais ou en français, sans accents", () => {
    expect(hit("llanowar", "Llanowar Elves")).toBe(true);
    expect(hit("shivan", "Llanowar Elves")).toBe(false);
  });

  it("t:, o:, c:, mv et négation", () => {
    expect(hit("t:creature", "Llanowar Elves")).toBe(true);
    expect(hit("t:instant", "Llanowar Elves")).toBe(false);
    expect(hit('o:"add {g}"', "Llanowar Elves")).toBe(true);
    expect(hit("c:g mv<=1", "Llanowar Elves")).toBe(true);
    expect(hit("c:r", "Llanowar Elves")).toBe(false);
    expect(hit("mv>=2", "Llanowar Elves")).toBe(false);
    expect(hit("-t:creature", "Llanowar Elves")).toBe(false);
    expect(hit("pow=1 tou:1", "Llanowar Elves")).toBe(true);
  });

  it("requête vide : tout passe", () => {
    expect(hit("", "Llanowar Elves")).toBe(true);
  });
});
