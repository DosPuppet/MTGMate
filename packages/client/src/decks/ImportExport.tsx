/**
 * Import and export of decklists (MTGA and MTGO formats, English or French names).
 */
import { CARDS, CardIndex, type DeckList, parseDeckList, serializeDeckList } from "@mtgx/cards";
import { useMemo, useState } from "react";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { usePrintings } from "./printings";
import { deckName } from "./store";

/** Place of a JSX element in a translated sentence (split around it). */
const SLOT = "\u0001";

const INDEX = new CardIndex(CARDS);

export function DeckModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop full" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div
        className="modal wide deck-modal"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ImportModal({
  current,
  onClose,
  onCreate,
  onReplace,
}: {
  /** Editable deck currently open (null if it is read only). */
  current: DeckList | null;
  onClose: () => void;
  onCreate: (deck: DeckList) => void;
  onReplace: (deck: DeckList) => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const lang = useGame((s) => s.lang);
  const t = useT();
  // "(STA) 42": printing of the table, once loaded.
  const table = usePrintings();
  const parsed = useMemo(() => parseDeckList(text, INDEX, table?.findPrinting), [text, table]);
  const mainCount = parsed.main.reduce((a, [n]) => a + n, 0);
  const sideCount = parsed.sideboard.reduce((a, [n]) => a + n, 0);
  const blocking = parsed.issues.filter((i) => i.kind === "unknown" || i.kind === "syntax");
  const deck: DeckList = {
    id: "import",
    name: name || parsed.name || t("Imported deck"),
    colors: [],
    main: parsed.main,
    sideboard: parsed.sideboard,
    // "Commander" section (or *CMDR* mark): a Commander deck (PLAN-E).
    ...(parsed.commander?.length ? { commander: parsed.commander, format: "commander" as const } : {}),
  };
  /** Replaces, on the given line, the unknown name with the suggestion. */
  const applySuggestion = (line: number, suggestion: string) => {
    const lines = text.split("\n");
    const l = lines[line - 1];
    if (l === undefined) return;
    const m = /^(\s*(?:SB:\s*)?\d+\s*[xX]?\s+)/.exec(l);
    lines[line - 1] = `${m?.[1] ?? "1 "}${suggestion}`;
    setText(lines.join("\n"));
  };
  const counts = t("Deck: {main} cards · Sideboard: {side}", { main: SLOT, side: SLOT }).split(SLOT);
  return (
    <DeckModal title={t("Import a decklist")} onClose={onClose}>
      <p className="hint">
        {t('Paste a list exported from MTG Arena, MTGO or a deck site ("4 Llanowar Elves (FDN) 227", "4 Elfes de Llanowar"…).')}
      </p>
      <textarea
        className="decklist-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Deck\n4 Llanowar Elves (FDN) 227\n20 Forest\n\nSideboard\n2 Broken Wings"}
        rows={12}
        spellCheck={false}
      />
      <div className="import-report">
        <span>
          {counts[0]}
          <strong>{mainCount}</strong>
          {counts[1]}
          <strong>{sideCount}</strong>
          {counts[2]}
        </span>
        {parsed.issues.map((i) => (
          <div key={`${i.line}-${i.kind}`} className={i.kind === "unimplemented" || i.kind === "ignored" ? "v-warn" : "v-error"}>
            {t("Line {line}: {message}", { line: i.line, message: textIn(lang, i.message) })}
            {i.suggestion && (
              <button type="button" className="btn small" onClick={() => applySuggestion(i.line, i.suggestion as string)}>
                {t('Replace with "{name}"', { name: i.suggestion })}
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="import-name">
        {t("Deck name")}
        <input value={name} placeholder={parsed.name ?? t("Imported deck")} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("Cancel")}
        </button>
        {current && (
          <button type="button" className="btn" disabled={!mainCount || blocking.length > 0} onClick={() => onReplace(deck)}>
            {t('Replace "{name}"', { name: current.name })}
          </button>
        )}
        <button type="button" className="btn primary" disabled={!mainCount || blocking.length > 0} onClick={() => onCreate(deck)}>
          {t("Create a new deck")}
        </button>
      </div>
    </DeckModal>
  );
}

export function ExportModal({ deck, onClose }: { deck: DeckList; onClose: () => void }) {
  const [format, setFormat] = useState<"mtga" | "fr" | "en">("mtga");
  const [copied, setCopied] = useState(false);
  const lang = useGame((s) => s.lang);
  const t = useT();
  // A precon is exported under its name in the interface language.
  const name = deckName(deck, lang);
  const text = serializeDeckList(
    { ...deck, name },
    CARDS,
    format === "mtga" ? { format: "mtga" } : { format: "plain", lang: format },
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: select the text for a manual copy.
      (document.querySelector(".decklist-output") as HTMLTextAreaElement | null)?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <DeckModal title={t('Export "{name}"', { name })} onClose={onClose}>
      <div className="seg export-format">
        <button type="button" className={format === "mtga" ? "on" : ""} onClick={() => setFormat("mtga")}>
          MTG Arena
        </button>
        <button type="button" className={format === "en" ? "on" : ""} onClick={() => setFormat("en")}>
          {t("Text (English)")}
        </button>
        <button type="button" className={format === "fr" ? "on" : ""} onClick={() => setFormat("fr")}>
          {t("Text (French)")}
        </button>
      </div>
      <textarea className="decklist-output" value={text} readOnly rows={14} spellCheck={false} />
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("Close")}
        </button>
        <button type="button" className="btn" onClick={download}>
          {t("Download (.txt)")}
        </button>
        <button type="button" className="btn primary" onClick={copy}>
          {copied ? t("Copied!") : t("Copy")}
        </button>
      </div>
    </DeckModal>
  );
}
