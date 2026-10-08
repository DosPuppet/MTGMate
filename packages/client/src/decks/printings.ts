/**
 * Printing table (`@mtgx/cards/printings`) loaded on demand: a separate file, downloaded only by the deck builder and
 * the import of a decklist.
 */
import { useEffect, useState } from "react";

export type PrintingTable = typeof import("@mtgx/cards/printings");

let table: PrintingTable | undefined;
let loading: Promise<PrintingTable> | undefined;

export function loadPrintings(): Promise<PrintingTable> {
  loading ??= import("@mtgx/cards/printings").then(
    (m) => (table = m),
    (e) => {
      // Offline before the first load: try again at the next request.
      loading = undefined;
      throw e;
    },
  );
  return loading;
}

/** The table, once loaded (the component re-renders when it arrives). */
export function usePrintings(): PrintingTable | undefined {
  const [m, setM] = useState(table);
  useEffect(() => {
    if (!m) loadPrintings().then(setM, () => {});
  }, [m]);
  return m;
}
