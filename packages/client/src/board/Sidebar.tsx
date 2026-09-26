import { useEffect, useRef } from "react";
import { SoundControl } from "../audio/SoundControl";
import { faceImage, faceName, faceText, faceType, KEYWORD_LABEL } from "../i18n";
import { useGame } from "../store";
import { ManaCost } from "./Card";

export function Preview() {
  const hover = useGame((s) => s.hover);
  const lang = useGame((s) => s.lang);
  if (!hover) return <div className="preview empty">Survolez une carte pour l'agrandir.</div>;
  const { face, obj } = hover;
  const src = faceImage(face, lang);
  const baseKw = new Set(obj?.keywords ?? []);
  return (
    <div className="preview">
      {src ? (
        <img className="preview-img" src={src} alt={faceName(face, lang)} />
      ) : (
        <div className={`preview-img token frame-${obj?.colors[0] ?? "C"}`}>
          <div className="token-name">{faceName(face, lang)}</div>
          <div className="token-type">{faceType(face, lang)}</div>
          <div className="token-text">{faceText(face, lang)}</div>
          {obj?.power !== undefined && (
            <div className="token-pt">
              {obj.power}/{obj.toughness}
            </div>
          )}
        </div>
      )}
      <div className="preview-info">
        <div className="preview-title">
          <span>{faceName(face, lang)}</span>
          <ManaCost cost={face.manaCost} size={14} />
        </div>
        <div className="preview-type">{faceType(face, lang)}</div>
        {!src && <div className="preview-text">{faceText(face, lang)}</div>}
        {obj?.power !== undefined && (
          <div className="preview-stats">
            Force/Endurance :{" "}
            <strong>
              {obj.power}/{obj.toughness}
            </strong>
            {obj.damage > 0 && <span className="dmg"> · {obj.damage} blessure(s)</span>}
            {Object.entries(obj.counters)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <span key={k}>
                  {" "}
                  · {n} marqueur(s) {k}
                </span>
              ))}
          </div>
        )}
        {baseKw.size > 0 && (
          <div className="preview-kw">
            {[...baseKw].map((k) => (
              <span key={k} className="kw">
                {KEYWORD_LABEL[k]}
              </span>
            ))}
          </div>
        )}
        {obj?.sick && obj.types.includes("Creature") && <div className="preview-note">Mal d'invocation</div>}
        {!face.implemented && <div className="preview-warn">Pas encore gérée par le moteur</div>}
      </div>
    </div>
  );
}

function Log() {
  const log = useGame((s) => s.log);
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: défiler à chaque nouvelle ligne
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log.length]);
  return (
    <div className="log" ref={ref}>
      {log.map((l) => (
        <div key={l.id} className={`log-line ${l.kind}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

function Settings() {
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const settings = useGame((s) => s.settings);
  const setFullControl = useGame((s) => s.setFullControl);
  const decide = useGame((s) => s.decide);
  const backToLobby = useGame((s) => s.backToLobby);
  const over = useGame((s) => s.view?.over);
  return (
    <div className="settings">
      <div className="seg">
        <button type="button" className={lang === "fr" ? "on" : ""} onClick={() => setLang("fr")}>
          FR
        </button>
        <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
          EN
        </button>
      </div>
      <SoundControl />
      <label className="toggle" title="Recevoir la priorité à chaque étape, sans automatisme">
        <input type="checkbox" checked={settings.fullControl} onChange={(e) => setFullControl(e.target.checked)} />
        Contrôle total
      </label>
      {!over && (
        <button type="button" className="btn small ghost" onClick={() => decide({ type: "concede" })}>
          Abandonner
        </button>
      )}
      <button type="button" className="btn small ghost" onClick={backToLobby}>
        Menu
      </button>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Settings />
      <Preview />
      <div className="log-title">Journal</div>
      <Log />
    </aside>
  );
}
