/**
 * Impression d'une carte prise dans la table des impressions du paquet des cartes (`@mtgx/cards/printings`), hors des
 * données de la carte (`CardDef.printings`) : sa clé porte l'identifiant Scryfall de l'impression, d'où se déduisent
 * ses images. Le moteur garde la clé telle quelle ; c'est l'appelant (serveur, éditeur de deck) qui vérifie qu'elle
 * appartient à la carte.
 */
import type { CardPrinting } from "./model/cards";

/** « STA-42@<identifiant Scryfall sans tirets> ». */
const KEY = /^([A-Z0-9]{2,6})-([^@\s]{1,10})@([0-9a-f]{32})$/;

export function printingKey(set: string, number: string, id: string): string {
  return `${set}-${number}@${id}`;
}

/** Ensemble, numéro et images d'une clé de la table, ou `undefined` si la clé n'en est pas une. */
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
