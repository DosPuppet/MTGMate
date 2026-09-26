/**
 * Partie en ligne contre un joueur : pseudo, deck, créer un salon (code et lien à partager) ou en rejoindre un.
 * La partie démarre sur le serveur dès que le second joueur arrive.
 */
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { useAllDecks } from "../decks/store";
import { loadName, useGame } from "../store";
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
      <p className="hint">Donnez ce code (ou le lien) à votre adversaire. La partie commence dès son arrivée.</p>
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
  const [deckId, setDeckId] = useState(() => decks.find((d) => deckStatus(d).ok)?.id ?? "");
  const [code, setCode] = useState(codeFromUrl);
  const deck = decks.find((d) => d.id === deckId);
  const ready = !!deck && deckStatus(deck).ok && name.trim().length > 0;
  const busy = online?.status === "connecting" && !online.error;
  const waiting = online?.status === "waiting";

  return (
    <div className="lobby online">
      <header className="lobby-head">
        <div className="lobby-sound">
          <SoundControl />
        </div>
        <h1>Partie en ligne</h1>
        <p className="hint">Duel au format Standard contre un autre joueur</p>
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
            <DeckChoice label="Votre deck (légal en Standard)" value={deckId} onChange={setDeckId} />
            {online?.error && <div className="v-error online-error">{online.error}</div>}
            <div className="online-actions">
              <div className="online-card">
                <h3>Créer une partie</h3>
                <p className="hint">Vous recevrez un code à partager.</p>
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy}
                  onClick={() => deck && createRoom(name.trim(), deck.main)}
                >
                  Créer
                </button>
              </div>
              <div className="online-card">
                <h3>Rejoindre</h3>
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
                  onClick={() => deck && joinRoom(code, name.trim(), deck.main)}
                >
                  Rejoindre
                </button>
              </div>
            </div>
            {!ready && <p className="hint">Choisissez un pseudo et un deck légal en Standard et jouable.</p>}
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
