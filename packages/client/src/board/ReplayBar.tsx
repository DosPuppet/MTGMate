/** Barre de lecture d'un replay : position, lecture automatique, point de vue. */
import { useGame } from "../store";

export function ReplayBar() {
  const replay = useGame((s) => s.replay);
  const seek = useGame((s) => s.replaySeek);
  const play = useGame((s) => s.replayPlay);
  const setViewer = useGame((s) => s.replayViewer);
  const backToLobby = useGame((s) => s.backToLobby);
  if (!replay) return null;
  const { index, total, viewer, players, playing, warning } = replay;
  return (
    <div className="replay-bar" role="toolbar" aria-label="Replay">
      <strong className="replay-title">Replay</strong>
      <button type="button" className="btn small" onClick={() => seek(0)} disabled={index === 0} title="Revenir au début">
        Début
      </button>
      <button type="button" className="btn small" onClick={() => seek(index - 1)} disabled={index === 0} title="Étape précédente">
        ◀
      </button>
      <button type="button" className="btn small primary" onClick={() => play(!playing)} disabled={index >= total}>
        {playing ? "Pause" : "Lecture"}
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(index + 1)}
        disabled={index >= total}
        title="Étape suivante"
      >
        ▶
      </button>
      <button type="button" className="btn small" onClick={() => seek(total)} disabled={index >= total} title="Aller à la fin">
        Fin
      </button>
      <input
        type="range"
        className="replay-slider"
        min={0}
        max={total}
        value={index}
        aria-label="Position dans la partie"
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="replay-pos">
        {index} / {total}
      </span>
      <label className="replay-viewer">
        Point de vue{" "}
        <select value={viewer} onChange={(e) => setViewer(e.target.value)}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn small ghost" onClick={backToLobby}>
        Quitter
      </button>
      {warning && (
        <p className="replay-warning" role="status">
          {warning}
        </p>
      )}
    </div>
  );
}
