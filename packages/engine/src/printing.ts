/**
 * Printing of a card taken from the printings table of the cards package (`@mtgx/cards/printings`), outside the card
 * data (`CardDef.printings`): its key carries the Scryfall id of the printing, from which its images are derived. The
 * engine keeps the key as is; it is the caller (server, deck builder) that checks that it belongs to the card.
 */
import type { CardPrinting } from "./model/cards";

/**
 * "Custom" printing: the card's custom art (local images served on /art/ by the server, `tools/custom-art.ts`), if there
 * is one; otherwise, the card's own. The engine does not know the image: the view marks the face (`CardFace.customArt`)
 * and the interface looks it up by the card name.
 */
export const CUSTOM_PRINTING = "custom";

/** "STA-42@<Scryfall id without dashes>". */
const KEY = /^([A-Z0-9]{2,6})-([^@\s]{1,10})@([0-9a-f]{32})$/;

export function printingKey(set: string, number: string, id: string): string {
  return `${set}-${number}@${id}`;
}

/** Set, number and images of a table key, or `undefined` if the key is not one. */
export function keyedPrinting(key: string): (CardPrinting & { image: string; artCrop: string }) | undefined {
  const m = KEY.exec(key);
  if (!m) return undefined;
  const id = m[3] as string;
  const path = `front/${id[0]}/${id[1]}/${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}.jpg`;
  return {
    key,
    set: m[1] as string,
    number: m[2] as string,
    image: `https://cards.scryfall.io/normal/${path}`,
    artCrop: `https://cards.scryfall.io/art_crop/${path}`,
  };
}
