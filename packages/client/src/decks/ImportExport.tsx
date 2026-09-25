/**
 * Import et export de decklists (formats MTGA et MTGO, noms anglais ou français).
 */
import { CARDS, CardIndex, type DeckList, parseDeckList, serializeDeckList } from "@mtgx/cards";
import { useMemo, useState } from "react";

const INDEX = new CardIndex(CARDS);

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop full" onClick={onClose}>
      <div className="modal wide deck-modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
  /** Deck modifiable actuellement ouvert (null s'il est en lecture seule). */
  current: DeckList | null;
  onClose: () => void;
  onCreate: (deck: DeckList) => void;
  onReplace: (deck: DeckList) => void;
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const parsed = useMemo(() => parseDeckList(text, INDEX), [text]);
  const mainCount = parsed.main.reduce((a, [n]) => a + n, 0);
  const sideCount = parsed.sideboard.reduce((a, [n]) => a + n, 0);
  const blocking = parsed.issues.filter((i) => i.kind === "unknown" || i.kind === "syntax");
  const deck: DeckList = {
    id: "import",
    name: name || parsed.name || "Deck importé",
    colors: [],
    main: parsed.main,
    sideboard: parsed.sideboard,
  };
  /** Remplace, à la ligne indiquée, le nom inconnu par la suggestion. */
  const applySuggestion = (line: number, suggestion: string) => {
    const lines = text.split("\n");
    const l = lines[line - 1];
    if (l === undefined) return;
    const m = /^(\s*(?:SB:\s*)?\d+\s*[xX]?\s+)/.exec(l);
    lines[line - 1] = `${m?.[1] ?? "1 "}${suggestion}`;
    setText(lines.join("\n"));
  };
  return (
    <Modal title="Importer une decklist" onClose={onClose}>
      <p className="hint">
        Collez une liste exportée de MTG Arena, MTGO ou d'un site de decks (« 4 Llanowar Elves (FDN) 227 », « 4 Elfes de Llanowar
        »…).
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
          Deck : <strong>{mainCount}</strong> cartes · Réserve : <strong>{sideCount}</strong>
        </span>
        {parsed.issues.map((i) => (
          <div key={`${i.line}-${i.kind}`} className={i.kind === "unimplemented" || i.kind === "ignored" ? "v-warn" : "v-error"}>
            Ligne {i.line} : {i.message}
            {i.suggestion && (
              <button type="button" className="btn small" onClick={() => applySuggestion(i.line, i.suggestion as string)}>
                Remplacer par « {i.suggestion} »
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="import-name">
        Nom du deck
        <input value={name} placeholder={parsed.name ?? "Deck importé"} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Annuler
        </button>
        {current && (
          <button type="button" className="btn" disabled={!mainCount || blocking.length > 0} onClick={() => onReplace(deck)}>
            Remplacer « {current.name} »
          </button>
        )}
        <button type="button" className="btn primary" disabled={!mainCount || blocking.length > 0} onClick={() => onCreate(deck)}>
          Créer un nouveau deck
        </button>
      </div>
    </Modal>
  );
}

export function ExportModal({ deck, onClose }: { deck: DeckList; onClose: () => void }) {
  const [format, setFormat] = useState<"mtga" | "fr" | "en">("mtga");
  const [copied, setCopied] = useState(false);
  const text = serializeDeckList(deck, CARDS, format === "mtga" ? { format: "mtga" } : { format: "plain", lang: format });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Repli : sélectionner le texte pour une copie manuelle.
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
    a.download = `${deck.name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal title={`Exporter « ${deck.name} »`} onClose={onClose}>
      <div className="seg export-format">
        <button type="button" className={format === "mtga" ? "on" : ""} onClick={() => setFormat("mtga")}>
          MTG Arena
        </button>
        <button type="button" className={format === "en" ? "on" : ""} onClick={() => setFormat("en")}>
          Texte (anglais)
        </button>
        <button type="button" className={format === "fr" ? "on" : ""} onClick={() => setFormat("fr")}>
          Texte (français)
        </button>
      </div>
      <textarea className="decklist-output" value={text} readOnly rows={14} spellCheck={false} />
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Fermer
        </button>
        <button type="button" className="btn" onClick={download}>
          Télécharger (.txt)
        </button>
        <button type="button" className="btn primary" onClick={copy}>
          {copied ? "Copié !" : "Copier"}
        </button>
      </div>
    </Modal>
  );
}
