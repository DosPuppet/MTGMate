/** Menu du tutoriel : tout dérouler, reprendre là où vous vous êtes arrêté, ou choisir une leçon. */
import { useGame } from "../store";
import { LESSONS, lessonById } from "./lessons";
import { useTutorial } from "./store";

export function TutorialMenu() {
  const progress = useTutorial((t) => t.progress);
  const start = useTutorial((t) => t.start);
  const resetProgress = useTutorial((t) => t.resetProgress);
  const backToLobby = useGame((s) => s.backToLobby);
  const resume = lessonById(progress.current);
  const allDone = LESSONS.every((l) => progress.done.includes(l.id));
  return (
    <div className="lobby tutorial-menu">
      <header className="lobby-head">
        <h1>Apprendre à jouer</h1>
      </header>
      <div className="lobby-body">
        <p className="tutorial-intro">
          Des leçons courtes, sur de vrais extraits de partie, pour découvrir Magic: The Gathering et l'interface de Planecircle.
          Votre progression est conservée : vous pouvez vous arrêter et reprendre plus tard.
        </p>
        <div className="lobby-actions">
          {resume && (
            <button type="button" className="btn primary big" onClick={() => start(resume.id, true)}>
              Reprendre : {resume.title}
            </button>
          )}
          <button
            type="button"
            className={`btn big ${resume ? "" : "primary"}`}
            onClick={() => start(LESSONS[0]?.id ?? "", true)}
          >
            {progress.done.length > 0 || resume ? "Tout reprendre depuis le début" : "Tout dérouler"}
          </button>
          <button type="button" className="btn big" onClick={backToLobby}>
            Retour
          </button>
        </div>
        {allDone && <p className="hint">Toutes les leçons sont terminées. Bravo !</p>}
        <ol className="lesson-list">
          {LESSONS.map((l, i) => {
            const done = progress.done.includes(l.id);
            const current = progress.current === l.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`lesson-tile ${done ? "done" : ""} ${current ? "current" : ""}`}
                  onClick={() => start(l.id)}
                >
                  <span className="lesson-num">{done ? "✓" : i + 1}</span>
                  <span className="lesson-body">
                    <span className="lesson-title">
                      {l.title}
                      {current && <span className="lesson-badge">à reprendre</span>}
                    </span>
                    <span className="lesson-summary">{l.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {(progress.done.length > 0 || resume) && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => window.confirm("Effacer votre progression dans le tutoriel ?") && resetProgress()}
          >
            Remettre à zéro
          </button>
        )}
      </div>
    </div>
  );
}
