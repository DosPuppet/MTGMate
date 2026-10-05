/**
 * Table des impressions (`@mtgx/cards/printings`) chargée à la demande : un fichier à part, téléchargé seulement par
 * l'éditeur de deck et l'import d'une decklist.
 */
import { useEffect, useState } from "react";

export type PrintingTable = typeof import("@mtgx/cards/printings");

let table: PrintingTable | undefined;
let loading: Promise<PrintingTable> | undefined;

export function loadPrintings(): Promise<PrintingTable> {
  loading ??= import("@mtgx/cards/printings").then(
    (m) => (table = m),
    (e) => {
      // Hors ligne avant le premier chargement : on réessaiera à la prochaine demande.
      loading = undefined;
      throw e;
    },
  );
  return loading;
}

/** La table, une fois chargée (le composant est redessiné à son arrivée). */
export function usePrintings(): PrintingTable | undefined {
  const [m, setM] = useState(table);
  useEffect(() => {
    if (!m) loadPrintings().then(setM, () => {});
  }, [m]);
  return m;
}
