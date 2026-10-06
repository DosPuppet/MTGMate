/**
 * Partie en ligne contre d'autres joueurs : pseudo, deck, créer un salon de 2 à 4 joueurs (code et lien à partager) ou
 * en rejoindre un. La partie démarre sur le serveur dès que le salon est plein.
 */

import type { AiLevel } from "@mtgx/ai";
import { FORMAT_LABELS, ONLINE_FORMATS } from "@mtgx/cards";
import type { Format } from "@mtgx/engine";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { useAllDecks } from "../decks/store";
import { loadName, useGame } from "../store";
import { FormatChoice, loadFormat, saveFormat } from "./FormatChoice";
import { DeckChoice, deckStatus, LEVELS } from "./Lobby";

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
  const seats = online?.match?.seats ?? 2;
  const missing = Math.max(0, seats - (online?.players.length ?? 1));
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
        {seats > 2
          ? `Donnez ce code (ou le lien) à vos adversaires. La partie commence quand les ${seats} joueurs sont là.`
          : "Donnez ce code (ou le lien) à votre adversaire. La partie commence dès son arrivée."}
        {online?.match?.format === "unlimited" && " Format : sans limite (toutes les cartes du catalogue)."}
        {online?.match?.format === "commander" && " Format : Commander (40 points de vie)."}
      </p>
      {seats > 2 && (
        <ul className="online-seats" data-testid="online-seats">
          {online?.players.map((p) => (
            <li key={p.seat}>
              {p.name}
              {p.ai ? " · IA" : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="lobby-actions">
        <button type="button" className="btn primary" onClick={copy}>
          Copier le lien
        </button>
        <button type="button" className="btn" onClick={leaveRoom}>
          Annuler
        </button>
      </div>
      <div className="waiting-dots">
        {missing > 1
          ? `En attente de ${missing} joueurs`
          : missing === 1 && seats > 2
            ? "En attente d'un joueur"
            : "En attente d'un adversaire"}
      </div>
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
  const [format, setFormat] = useState<Format>(() => {
    const f = loadFormat();
    return ONLINE_FORMATS.includes(f) ? f : "standard";
  });
  const chooseFormat = (f: Format) => {
    setFormat(f);
    saveFormat(f);
  };
  const [deckId, setDeckId] = useState(() => decks.find((d) => deckStatus(d, format).ok)?.id ?? "");
  const [code, setCode] = useState(codeFromUrl);
  const [bo3, setBo3] = useState(false);
  // Nombre de joueurs du salon créé (2 à 4), dont sièges tenus par l'IA du serveur (PLAN-E, E14).
  const [players, setPlayers] = useState<2 | 3 | 4>(2);
  const [aiSeats, setAiSeats] = useState(0);
  const [aiLevel, setAiLevel] = useState<AiLevel>("medium");
  const ai = Math.min(aiSeats, players - 1);
  const commander = format === "commander";
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
        <p className="hint">De 2 à 4 joueurs, au format et au nombre choisis par celui qui crée la partie</p>
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
            <FormatChoice value={format} onChange={chooseFormat} formats={ONLINE_FORMATS} />
            {commander && <p className="hint">Commander : rejoindre un salon Commander demande un deck à commandant.</p>}
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
                <div className="ai-count">
                  <span>Joueurs</span>
                  <div className="seg" role="group" aria-label="Nombre de joueurs">
                    {([2, 3, 4] as const).map((n) => (
                      <button key={n} type="button" className={players === n ? "on" : ""} onClick={() => setPlayers(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ai-count">
                  <span>dont IA</span>
                  <div className="seg" role="group" aria-label="Sièges tenus par l'IA">
                    {Array.from({ length: players }, (_, n) => n).map((n) => (
                      <button key={n} type="button" className={ai === n ? "on" : ""} onClick={() => setAiSeats(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {ai > 0 && (
                  <div className="ai-count">
                    <span>Niveau</span>
                    <div className="seg" role="group" aria-label="Niveau de l'IA">
                      {LEVELS.filter((l) => l.level !== "expert" || players === 2).map((l) => (
                        <button
                          key={l.level}
                          type="button"
                          className={aiLevel === l.level ? "on" : ""}
                          onClick={() => setAiLevel(l.level)}
                          title={l.hint}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {players === 2 && !commander && ai === 0 && (
                  <label className="toggle" title="Au meilleur des trois manches, avec votre réserve entre les manches">
                    <input type="checkbox" checked={bo3} onChange={(e) => setBo3(e.target.checked)} />
                    Match en 3 manches (BO3)
                  </label>
                )}
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy}
                  onClick={() =>
                    deck &&
                    createRoom(name.trim(), deck.main, {
                      sideboard: commander ? [] : deck.sideboard,
                      bestOf: bo3 && players === 2 && !commander && ai === 0 ? 3 : 1,
                      format,
                      players,
                      ...(commander ? { commander: deck.commander ?? [] } : {}),
                      ...(ai > 0 ? { ai: { count: ai, level: players > 2 && aiLevel === "expert" ? "medium" : aiLevel } } : {}),
                    })
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
                  onClick={() =>
                    deck &&
                    joinRoom(
                      code,
                      name.trim(),
                      deck.main,
                      commander ? [] : deck.sideboard,
                      commander ? deck.commander : undefined,
                    )
                  }
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
