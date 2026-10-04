/**
 * Partie en ligne contre un joueur : pseudo, deck, créer un salon (code et lien à partager) ou en rejoindre un.
 * La partie démarre sur le serveur dès que le second joueur arrive.
 */
import { FORMAT_LABELS } from "@mtgx/cards";
import type { Format } from "@mtgx/engine";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { useAllDecks } from "../decks/store";
import { loadName, useGame } from "../store";
import { FormatChoice, loadFormat, saveFormat } from "./FormatChoice";
import { DeckChoice, deckStatus } from "./Lobby";

/** Code pré-rempli par un lien d'invitation (?room=CODE). */
function codeFromUrl(): string {
  try {
    return (new URLSearchParams(location.search).get("room") ?? "").toUpperCase();
  } catch {
    return "";
  }
}

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function Waiting() {
  const online = useGame((s) => s.online);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const notify = useGame((s) => s.notify);
  const code = online?.code ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      notify("Lien copié : envoyez-le à votre adversaire.");
    } catch {
      notify(`Lien : ${inviteLink(code)}`);
    }
  };
  return (
    <div className="online-waiting">
      <div className="hint">Code du salon</div>
      <div className="room-code" data-testid="room-code">
        {code}
      </div>
      <p className="hint">
        Donnez ce code (ou le lien) à votre adversaire. La partie commence dès son arrivée.
        {online?.match?.format === "unlimited" && " Format : sans limite (toutes les cartes du catalogue)."}
      </p>
      <div className="lobby-actions">
        <button type="button" className="btn primary" onClick={copy}>
          Copier le lien
        </button>
        <button type="button" className="btn" onClick={leaveRoom}>
          Annuler
        </button>
      </div>
      <div className="waiting-dots">En attente d'un adversaire</div>
    </div>
  );
}

export function Online() {
  const online = useGame((s) => s.online);
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const backToLobby = useGame((s) => s.backToLobby);
  const decks = useAllDecks();
  const [name, setName] = useState(loadName);
  const [format, setFormat] = useState<Format>(loadFormat);
  const chooseFormat = (f: Format) => {
    setFormat(f);
    saveFormat(f);
  };
  const [deckId, setDeckId] = useState(() => decks.find((d) => deckStatus(d, format).ok)?.id ?? "");
  const [code, setCode] = useState(codeFromUrl);
  const [bo3, setBo3] = useState(false);
  const deck = decks.find((d) => d.id === deckId);
  const ready = !!deck && deckStatus(deck, format).ok && name.trim().length > 0;
  const busy = online?.status === "connecting" && !online.error;
  const waiting = online?.status === "waiting";

  return (
    <div className="lobby online">
      <header className="lobby-head">
        <div className="lobby-sound">
          <SoundControl />
        </div>
        <h1>Partie en ligne</h1>
        <p className="hint">Duel contre un autre joueur, au format choisi par celui qui crée la partie</p>
      </header>
      <div className="lobby-body">
        {waiting ? (
          <Waiting />
        ) : (
          <>
            <label className="online-field">
              <span className="deck-choice-label">Votre pseudo</span>
              <input
                className="search"
                value={name}
                maxLength={20}
                placeholder="Pseudo visible par votre adversaire"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <FormatChoice value={format} onChange={chooseFormat} />
            <DeckChoice
              label={format === "unlimited" ? "Votre deck (sans limite)" : `Votre deck (légal en ${FORMAT_LABELS[format]})`}
              value={deckId}
              onChange={setDeckId}
              format={format}
            />
            {online?.error && <div className="v-error online-error">{online.error}</div>}
            <div className="online-actions">
              <div className="online-card">
                <h3>Créer une partie</h3>
                <p className="hint">Vous recevrez un code à partager.</p>
                <label className="toggle" title="Au meilleur des trois manches, avec votre réserve entre les manches">
                  <input type="checkbox" checked={bo3} onChange={(e) => setBo3(e.target.checked)} />
                  Match en 3 manches (BO3)
                </label>
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy}
                  onClick={() =>
                    deck && createRoom(name.trim(), deck.main, { sideboard: deck.sideboard, bestOf: bo3 ? 3 : 1, format })
                  }
                >
                  Créer
                </button>
              </div>
              <div className="online-card">
                <h3>Rejoindre</h3>
                <p className="hint">Le salon impose son format : votre deck doit y être légal.</p>
                <input
                  className="search code-input"
                  value={code}
                  maxLength={6}
                  placeholder="CODE"
                  aria-label="Code du salon"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy || code.length !== 6}
                  onClick={() => deck && joinRoom(code, name.trim(), deck.main, deck.sideboard)}
                >
                  Rejoindre
                </button>
              </div>
            </div>
            {!ready && (
              <p className="hint">
                Choisissez un pseudo et un deck {format === "unlimited" ? "" : `légal en ${FORMAT_LABELS[format]} et `}jouable.
              </p>
            )}
          </>
        )}
        <div className="lobby-actions">
          <button type="button" className="btn ghost" onClick={backToLobby}>
            ← Accueil
          </button>
        </div>
      </div>
    </div>
  );
}
