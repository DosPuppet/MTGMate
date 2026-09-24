import type { GameView, ObjectView, PlayerView } from "@mtgx/engine";
import { motion } from "motion/react";
import { useRef } from "react";
import { faceName, PHASE_BAR, STEP_LABEL } from "../i18n";
import { myActions, useGame } from "../store";
import { Arrows } from "./Arrows";
import { Card, CardBack, type Glow, ManaCost } from "./Card";

// ---------------------------------------------------------------------------
// Joueurs
// ---------------------------------------------------------------------------

function ManaPool({ pool }: { pool: PlayerView["manaPool"] }) {
  const cost = Object.entries(pool)
    .flatMap(([m, n]) => Array(n).fill(`{${m}}`))
    .join("");
  if (!cost) return null;
  return (
    <div className="mana-pool" title="Réserve de mana">
      <ManaCost cost={cost} size={18} />
    </div>
  );
}

const ICONS = {
  library: "M4 3h11a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V3zm2 2v12h9V5H6zm13 2h1v14H8v-1h11V7z",
  hand: "M3 6l7-3 3 7-7 3-3-7zm8 2l6-2 3 8-6 2-3-8z",
  grave: "M7 21V9a5 5 0 0 1 10 0v12H7zm4-12v3H9v2h2v4h2v-4h2v-2h-2V9h-2z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function PlayerBar({ player, isMe }: { player: PlayerView; isMe: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const clickPlayer = useGame((s) => s.clickPlayer);
  const openGraveyard = useGame((s) => s.openGraveyard);
  const lang = useGame((s) => s.lang);
  const isTarget = casting?.stage === "target" && casting.spec?.legal.includes(player.id);
  const thinking = view.pending?.player === player.id && !isMe;
  const active = view.turn.active === player.id;
  const top = player.graveyard[player.graveyard.length - 1];
  return (
    <div className={`player-bar ${isMe ? "me" : "opp"}`}>
      <button
        type="button"
        className={`avatar ${isTarget ? "glow-target" : ""} ${active ? "active" : ""}`}
        data-oid={player.id}
        onClick={() => clickPlayer(player.id)}
      >
        <span className="avatar-initial">{isMe ? "V" : "IA"}</span>
        <span className={`life ${player.life <= 5 ? "low" : ""}`}>{player.life}</span>
      </button>
      <div className="player-info">
        <div className="player-name">
          {player.name}
          {thinking && <span className="thinking">réfléchit…</span>}
        </div>
        <div className="player-counts">
          <span title="Bibliothèque">
            <Icon d={ICONS.library} /> {player.libraryCount}
          </span>
          {!isMe && (
            <span title="Main">
              <Icon d={ICONS.hand} /> {player.handCount}
            </span>
          )}
          <button
            type="button"
            className="gy-button"
            title="Cimetière (cliquer pour voir)"
            onClick={() => openGraveyard(player.id)}
          >
            <Icon d={ICONS.grave} /> {player.graveyard.length}
            {top && <span className="gy-top">{faceName(top, lang)}</span>}
          </button>
        </div>
      </div>
      <ManaPool pool={player.manaPool} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champ de bataille
// ---------------------------------------------------------------------------

function usePermanentGlow(): (o: ObjectView) => Glow {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const attackers = useGame((s) => s.attackers);
  const blocks = useGame((s) => s.blocks);
  const selectedBlocker = useGame((s) => s.selectedBlocker);
  const acts = myActions(view);
  const p = view.pending;
  const mine = p?.player === view.viewer;
  return (o) => {
    if (casting?.stage === "target") return casting.spec?.legal.includes(o.id) ? "target" : null;
    if (mine && p?.kind === "declareAttackers") {
      if (attackers.includes(o.id)) return "attacking";
      return p.candidates?.includes(o.id) ? "selectable" : null;
    }
    if (mine && p?.kind === "declareBlockers") {
      if (selectedBlocker === o.id) return "selected";
      if (blocks[o.id]) return "blocking";
      const cand = p.candidates?.find((c) => c.blocker === selectedBlocker);
      if (cand?.attackers.includes(o.id)) return "target";
      return p.candidates?.some((c) => c.blocker === o.id) ? "selectable" : null;
    }
    if (o.attacking) return "attacking";
    if (o.blocking) return "blocking";
    if (acts.some((a) => a.type === "activate" && a.source === o.id)) return "activatable";
    return null;
  };
}

function PermanentRow({ perms, kind, isMe }: { perms: ObjectView[]; kind: "lands" | "others"; isMe: boolean }) {
  const glowOf = usePermanentGlow();
  const clickPermanent = useGame((s) => s.clickPermanent);
  const attackers = useGame((s) => s.attackers);
  const width = kind === "lands" ? "var(--land-w)" : "var(--card-w)";

  // Terrains identiques regroupés (comme sur Arena).
  const groups: ObjectView[][] = [];
  if (kind === "lands") {
    const byKey = new Map<string, ObjectView[]>();
    for (const o of perms) {
      const key = `${o.defId}|${o.tapped}`;
      if (!byKey.has(key)) {
        byKey.set(key, []);
        groups.push(byKey.get(key) as ObjectView[]);
      }
      byKey.get(key)?.push(o);
    }
  } else for (const o of perms) groups.push([o]);

  return (
    <div className={`perm-row ${kind}`}>
      {groups.map((g) => (
        <div key={g[0]?.uid} className={`perm-group ${g.length > 1 ? "stacked" : ""}`}>
          {g.map((o) => {
            const attacking = o.attacking || attackers.includes(o.id);
            return (
              <div key={o.uid} className={`perm ${attacking ? (isMe ? "advance-up" : "advance-down") : ""}`}>
                <Card
                  face={o}
                  obj={o}
                  width={width}
                  layoutId={o.uid}
                  tapped={o.tapped}
                  glow={glowOf(o)}
                  showStats={kind === "others"}
                  onClick={() => clickPermanent(o.id)}
                  oid={o.id}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Battlefield({ player, isMe }: { player: string; isMe: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const perms = view.battlefield.filter((o) => o.controller === player);
  const lands = perms.filter((o) => o.types.includes("Land"));
  const others = perms.filter((o) => !o.types.includes("Land"));
  const rows = [
    <PermanentRow key="o" perms={others} kind="others" isMe={isMe} />,
    <PermanentRow key="l" perms={lands} kind="lands" isMe={isMe} />,
  ];
  return <div className={`battlefield ${isMe ? "me" : "opp"}`}>{isMe ? rows : rows.reverse()}</div>;
}

// ---------------------------------------------------------------------------
// Bande centrale : phases, pile, consignes
// ---------------------------------------------------------------------------

function PhaseBar() {
  const view = useGame((s) => s.view) as GameView;
  const settings = useGame((s) => s.settings);
  const toggleStop = useGame((s) => s.toggleStop);
  const myTurn = view.turn.active === view.viewer;
  return (
    <div className="phase-bar">
      <div className="phase-turn">
        Tour {view.turn.number} · <strong>{myTurn ? "vous" : view.players[view.opponent]?.name}</strong>
      </div>
      <div className="phases">
        {PHASE_BAR.map(({ step, short }) => {
          const current = view.turn.step === step || (step === "combatDamage" && view.turn.step === "firstStrikeDamage");
          return (
            <div
              key={step}
              className={`phase ${current ? (myTurn ? "current me" : "current opp") : ""}`}
              title={STEP_LABEL[step]}
            >
              <span className="phase-label">{short}</span>
              <span className="stops">
                <button
                  type="button"
                  className={`stop me ${settings.stops.own.includes(step) ? "on" : ""}`}
                  title={`Arrêt pendant votre tour : ${STEP_LABEL[step]}`}
                  onClick={() => toggleStop("own", step)}
                />
                <button
                  type="button"
                  className={`stop opp ${settings.stops.opponent.includes(step) ? "on" : ""}`}
                  title={`Arrêt pendant le tour adverse : ${STEP_LABEL[step]}`}
                  onClick={() => toggleStop("opponent", step)}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StackView() {
  const view = useGame((s) => s.view) as GameView;
  if (view.stack.length === 0) return null;
  return (
    <div className="stack">
      <div className="stack-label">Pile</div>
      <div className="stack-items">
        {view.stack.map((item, i) => (
          <div key={item.id} className={`stack-item ${item.controller === view.viewer ? "me" : "opp"}`} style={{ zIndex: i }}>
            <Card
              face={item}
              width="var(--stack-w)"
              layoutId={item.kind === "spell" ? item.uid : undefined}
              oid={item.id}
              glow={i === view.stack.length - 1 ? "selected" : null}
            />
            {item.kind === "ability" && <div className="ability-tag">Capacité</div>}
            {item.kicked && <div className="ability-tag">Kické</div>}
            {item.x > 0 && <div className="ability-tag">X = {item.x}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Banner() {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const cancel = useGame((s) => s.cancel);
  const chooseNoTarget = useGame((s) => s.chooseNoTarget);
  const allAttack = useGame((s) => s.allAttack);
  const lang = useGame((s) => s.lang);
  const p = view.pending;
  const mine = p?.player === view.viewer;
  const opp = view.players[view.opponent]?.name ?? "L'adversaire";

  let text: string;
  let extra: React.ReactNode = null;
  if (casting?.stage === "target" && casting.spec) {
    text = `Choisissez une cible : ${casting.spec.label ?? "cible"}`;
    extra = (
      <>
        {casting.spec.optional && (
          <button type="button" className="btn small" onClick={chooseNoTarget}>
            Aucune cible
          </button>
        )}
        <button type="button" className="btn small ghost" onClick={cancel}>
          Annuler (Échap)
        </button>
      </>
    );
  } else if (!p) text = view.over ? "Partie terminée" : "…";
  else if (!mine) {
    const what: Record<string, string> = {
      priority: "joue",
      declareAttackers: "déclare ses attaquants",
      declareBlockers: "déclare ses bloqueurs",
      mulligan: "choisit sa main",
      bottomCards: "choisit sa main",
      discard: "se défausse",
    };
    text = `${opp} ${what[p.kind] ?? "réfléchit"}…`;
  } else if (p.kind === "declareAttackers") {
    text = "Cliquez sur les créatures qui attaquent";
    extra = (
      <button type="button" className="btn small" onClick={allAttack}>
        Tous attaquent
      </button>
    );
  } else if (p.kind === "declareBlockers") {
    text = "Bloqueurs : cliquez une de vos créatures, puis l'attaquant à bloquer";
  } else if (p.kind === "priority" && view.stack.length > 0) {
    const top = view.stack[view.stack.length - 1];
    text =
      top && top.controller !== view.viewer ? `${opp} lance ${faceName(top, lang)} — répondre ?` : "Votre sort va se résoudre";
  } else {
    text = `${STEP_LABEL[view.turn.step]} — ${view.turn.active === view.viewer ? "à vous" : opp}`;
  }
  return (
    <div className={`banner ${mine ? "mine" : ""}`}>
      <span>{text}</span>
      {extra}
    </div>
  );
}

function CenterStrip() {
  return (
    <div className="center-strip">
      <PhaseBar />
      <div className="center-main">
        <Banner />
        <StackView />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main et actions
// ---------------------------------------------------------------------------

function Hand() {
  const view = useGame((s) => s.view) as GameView;
  const clickHandCard = useGame((s) => s.clickHandCard);
  const dropHandCard = useGame((s) => s.dropHandCard);
  const selection = useGame((s) => s.selection);
  const casting = useGame((s) => s.casting);
  const handRef = useRef<HTMLDivElement>(null);
  // Un glisser se termine aussi par un « tap » : on l'ignore pour ne pas envoyer deux décisions.
  const dragged = useRef(false);
  const acts = myActions(view);
  const playable = new Set(acts.flatMap((a) => (a.type === "cast" || a.type === "playLand" ? [a.card] : [])));
  const n = view.hand.length;
  return (
    <div className="hand" ref={handRef}>
      {view.hand.map((c, i) => {
        const angle = n > 1 ? (i - (n - 1) / 2) * Math.min(4, 24 / n) : 0;
        const lift = Math.abs(i - (n - 1) / 2) * Math.min(6, 30 / n);
        return (
          <motion.div
            key={c.uid}
            className="hand-card"
            style={{ zIndex: i }}
            animate={{ rotate: angle, y: lift }}
            drag
            dragSnapToOrigin
            dragMomentum={false}
            whileHover={{ y: lift - 34, scale: 1.12, zIndex: 40, rotate: 0 }}
            whileDrag={{ scale: 1.05, zIndex: 60, rotate: 0 }}
            onPointerDown={() => {
              dragged.current = false;
            }}
            onDragStart={() => {
              dragged.current = true;
            }}
            onTap={() => {
              if (!dragged.current) clickHandCard(c.id);
            }}
            onDragEnd={(_, info) => {
              const handTop = handRef.current?.getBoundingClientRect().top ?? window.innerHeight;
              if (info.point.y - window.scrollY > handTop - 20) return;
              const target = document
                .elementsFromPoint(info.point.x - window.scrollX, info.point.y - window.scrollY)
                .map((el) => (el as HTMLElement).closest?.("[data-oid]") as HTMLElement | null)
                .find((el) => el && el.dataset.oid !== c.id);
              dropHandCard(c.id, target?.dataset.oid ?? null);
            }}
          >
            <Card
              face={c}
              obj={c}
              width="var(--hand-w)"
              layoutId={c.uid}
              glow={
                selection.includes(c.id)
                  ? "selected"
                  : casting?.sourceId === c.id
                    ? "selected"
                    : playable.has(c.id)
                      ? "playable"
                      : null
              }
              oid={c.id}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

function OpponentHand({ count }: { count: number }) {
  return (
    <div className="opp-hand">
      {Array.from({ length: count }, (_, i) => (
        <CardBack key={i} width="var(--back-w)" />
      ))}
    </div>
  );
}

export function useMainAction(): { label: string; run?: () => void; disabled?: boolean; hot?: boolean } {
  const s = useGame();
  const v = s.view;
  if (!v) return { label: "…", disabled: true };
  const p = v.pending;
  if (!p) return { label: v.over ? "Partie terminée" : "…", disabled: true };
  if (p.player !== v.viewer) return { label: "Adversaire…", disabled: true };
  const pass = () => s.decide({ type: "pass" });
  switch (p.kind) {
    case "priority":
      if (s.casting) return { label: "Annuler", run: s.cancel };
      if (v.stack.length > 0) return { label: "Résoudre", run: pass, hot: true };
      if (v.turn.active === v.viewer) {
        if (v.turn.step === "main1" && v.potentialAttackers > 0) return { label: "Combat", run: pass, hot: true };
        if (v.turn.step === "main1" || v.turn.step === "main2") return { label: "Fin du tour", run: s.endTurn, hot: true };
      }
      return { label: "Passer", run: pass, hot: true };
    case "declareAttackers": {
      const n = s.attackers.length;
      return {
        label: n ? `Attaquer (${n})` : "Pas d'attaque",
        hot: true,
        run: () =>
          s.decide({
            type: "declareAttackers",
            attackers: s.attackers.map((id) => ({ id, defender: p.defender ?? v.opponent })),
          }),
      };
    }
    case "declareBlockers": {
      const entries = Object.entries(s.blocks);
      return {
        label: entries.length ? `Bloquer (${entries.length})` : "Pas de blocage",
        hot: true,
        run: () => s.decide({ type: "declareBlockers", blocks: entries.map(([blocker, attacker]) => ({ blocker, attacker })) }),
      };
    }
    default:
      return { label: "Choisissez…", disabled: true };
  }
}

function ActionPanel() {
  const view = useGame((s) => s.view) as GameView;
  const endTurn = useGame((s) => s.endTurn);
  const action = useMainAction();
  const myTurn = view.turn.active === view.viewer;
  const p = view.pending;
  const mine = p?.player === view.viewer && (p?.kind === "priority" || p?.kind === "declareAttackers");
  return (
    <div className="action-panel">
      <button
        type="button"
        className={`main-button ${action.hot ? "hot" : ""}`}
        disabled={action.disabled}
        onClick={action.run}
        title="Espace"
      >
        {action.label}
      </button>
      {myTurn && mine && !view.over && (
        <button type="button" className="btn small ghost" onClick={endTurn} title="Entrée : passer jusqu'à la fin du tour">
          Passer le tour ⏎
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plateau complet
// ---------------------------------------------------------------------------

export function Board() {
  const view = useGame((s) => s.view);
  if (!view) return <div className="board loading">Mélange des bibliothèques…</div>;
  const me = view.players[view.viewer] as PlayerView;
  const opp = view.players[view.opponent] as PlayerView;
  return (
    <div className="board" id="board">
      <div className="top-row">
        <PlayerBar player={opp} isMe={false} />
        <OpponentHand count={opp.handCount} />
      </div>
      <Battlefield player={opp.id} isMe={false} />
      <CenterStrip />
      <Battlefield player={me.id} isMe={true} />
      <div className="bottom-row">
        <PlayerBar player={me} isMe={true} />
        <Hand />
        <ActionPanel />
      </div>
      <Arrows />
    </div>
  );
}
