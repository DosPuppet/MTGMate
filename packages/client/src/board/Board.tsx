import type { GameView, ObjectView, PlayerView } from "@mtgx/engine";
import { motion } from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { faceName, PHASE_BAR, STEP_LABEL } from "../i18n";
import { useLocalize } from "../localize";
import { boardPick, choiceSource, pickValid, shortPrompt } from "../prompts/boardChoice";
import { myActions, useGame } from "../store";
import { isTouch, justLongPressed } from "../touch";
import { Arrows } from "./Arrows";
import { Card, CardBack, type Glow, ManaCost } from "./Card";
import { Effects } from "./Effects";
import {
  type BattlefieldFit,
  battlefieldRows,
  battlefieldSlots,
  CARD_RATIO,
  fitBattlefield,
  fitHand,
  LAND_SCALE,
  type Slot,
  splitLines,
  TOKEN_SHADOWS,
} from "./layout";
import { StackReveal } from "./StackReveal";

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
  // Un vortex (spirale) pour l'exil.
  exile:
    "M12 3a9 9 0 1 1-9 9h2a7 7 0 1 0 7-7 5 5 0 0 0-5 5 3 3 0 0 0 3 3 1 1 0 0 0 1-1h2a3 3 0 0 1-3 3 5 5 0 0 1-5-5 7 7 0 0 1 7-7z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Points de vie : grossissent et changent de couleur à chaque variation. */
function LifeTotal({ life }: { life: number }) {
  const prev = useRef(life);
  const delta = life - prev.current;
  useEffect(() => {
    prev.current = life;
  }, [life]);
  return (
    <motion.span
      key={life}
      className={`life ${life <= 5 ? "low" : ""}`}
      initial={delta ? { scale: 1.7, color: delta < 0 ? "#ff5a4f" : "#6ee7a0" } : false}
      animate={{ scale: 1, color: life <= 5 ? "#ff7a6b" : "#e9edf2" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {life}
    </motion.span>
  );
}

function PlayerBar({ player, isMe }: { player: PlayerView; isMe: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const clickPlayer = useGame((s) => s.clickPlayer);
  const openGraveyard = useGame((s) => s.openGraveyard);
  const openExile = useGame((s) => s.openExile);
  const lang = useGame((s) => s.lang);
  const aiming = useGame((s) => s.aimingAttacker);
  const selection = useGame((s) => s.selection);
  const p = view.pending;
  const pick = boardPick(view);
  const picked = !!pick && selection.includes(player.id);
  // Ciblage d'un sort, option d'un choix sur le plateau, ou cible possible de l'attaquant en visée.
  const resolvingTargets = useGame((s) => s.resolving?.item.targets);
  const isTarget =
    !!resolvingTargets?.includes(player.id) ||
    (casting?.stage === "target" && casting.spec?.legal.includes(player.id)) ||
    (!!pick && !picked && pick.options.includes(player.id)) ||
    (!!aiming && p?.kind === "declareAttackers" && !!p.defenders?.includes(player.id));
  const thinking = view.pending?.player === player.id && !isMe;
  const active = view.turn.active === player.id;
  const top = player.graveyard[player.graveyard.length - 1];
  return (
    <div className={`player-bar ${isMe ? "me" : "opp"} ${active ? "active-turn" : ""}`}>
      <button
        type="button"
        className={`avatar ${isTarget ? "glow-target" : ""} ${picked ? "glow-picked" : ""} ${active ? "active" : ""}`}
        data-oid={player.id}
        data-tuto={isMe ? "life-me" : "life-opp"}
        onClick={() => clickPlayer(player.id)}
      >
        <span className="avatar-initial">{isMe ? "V" : player.name.slice(0, 3)}</span>
        <LifeTotal life={player.life} />
      </button>
      <div className="player-info">
        <div className="player-name">
          {player.name}
          {active && <span className="turn-chip">{isMe ? "Votre tour" : "Son tour"}</span>}
          {thinking && <span className="thinking">réfléchit…</span>}
        </div>
        <div className="player-counts">
          <span title="Bibliothèque" data-tuto={isMe ? "library-me" : undefined}>
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
            data-tuto={isMe ? "graveyard-me" : undefined}
            title="Cimetière (cliquer pour voir)"
            onClick={() => openGraveyard(player.id)}
          >
            <Icon d={ICONS.grave} /> {player.graveyard.length}
            {top && <span className="gy-top">{faceName(top, lang)}</span>}
          </button>
          <button
            type="button"
            className="gy-button exile-button"
            data-tuto={isMe ? "exile-me" : undefined}
            title="Exil (cliquer pour voir)"
            onClick={() => openExile(player.id)}
          >
            <Icon d={ICONS.exile} /> {view.exile.filter((o) => o.owner === player.id).length}
          </button>
          {!!player.poison && (
            <span className={`poison-chip ${player.poison >= 7 ? "danger" : ""}`} title="Marqueurs poison (10 : le joueur perd)">
              ☠ {player.poison}
            </span>
          )}
          {player.speed !== undefined && (
            <span className={`speed-chip ${player.speed >= 4 ? "max" : ""}`} title="Vitesse (4 : vitesse maximale)">
              ⚡ {player.speed}
            </span>
          )}
          {player.emblems.map((e, i) => (
            <span key={`${e.name}-${i}`} className="emblem-chip" title={e.text}>
              ✦ {e.name}
            </span>
          ))}
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
  const aiming = useGame((s) => s.aimingAttacker);
  const selection = useGame((s) => s.selection);
  const acts = myActions(view);
  const p = view.pending;
  const mine = p?.player === view.viewer;
  const pick = boardPick(view);
  const resolving = useGame((s) => s.resolving);
  return (o) => {
    // Résolution montrée : ses cibles sont mises en évidence.
    if (resolving) return resolving.item.targets.includes(o.id) ? "target" : null;
    if (casting?.stage === "target") {
      if (casting.picked?.includes(o.id)) return "picked";
      return casting.spec?.legal.includes(o.id) ? "target" : null;
    }
    // Choix sur le plateau : options en surbrillance, sélection dorée, le reste éteint.
    if (pick) {
      if (selection.includes(o.id)) return "picked";
      return pick.options.includes(o.id) ? "target" : null;
    }
    // Planeswalker attaquable : en surbrillance quand un attaquant est en visée.
    if (mine && p?.kind === "declareAttackers" && p.defenders?.includes(o.id)) {
      return aiming ? "target" : null;
    }
    if (mine && p?.kind === "declareAttackers") {
      if (aiming === o.id) return "selected";
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

/**
 * Un permanent, avec ses Auras et Équipements empilés derrière lui, puis les cartes qu'il a exilées (Sheltered by Ghosts,
 * cartes liées…) : elles dépassent de la même façon, teintées, et s'agrandissent au survol.
 */
function Permanent({
  o,
  width,
  isMe,
  attached,
  exiled = [],
  glow,
  showStats,
}: {
  o: ObjectView;
  width: string;
  isMe: boolean;
  attached: ObjectView[];
  exiled?: ObjectView[];
  glow: (o: ObjectView) => Glow;
  showStats: boolean;
}) {
  const clickPermanent = useGame((s) => s.clickPermanent);
  const attackers = useGame((s) => s.attackers);
  const attacking = o.attacking || attackers.includes(o.id);
  const n = attached.length + exiled.length;
  return (
    <div
      className={`perm ${attacking ? (isMe ? "advance-up" : "advance-down") : ""} ${n ? "has-attach" : ""}`}
      style={n ? ({ "--attach-n": n } as CSSProperties) : undefined}
    >
      {attached.map((a, i) => (
        <div key={a.uid} className="attachment" style={{ "--attach-i": i } as CSSProperties}>
          <Card
            face={a}
            obj={a}
            width={width}
            layoutId={a.uid}
            tapped={a.tapped}
            glow={glow(a)}
            onClick={() => clickPermanent(a.id)}
            oid={a.id}
          />
        </div>
      ))}
      {exiled.map((a, i) => (
        <div
          key={a.uid}
          className="attachment exiled-under"
          style={{ "--attach-i": attached.length + i } as CSSProperties}
          title="Carte exilée (survolez pour la voir)"
        >
          <Card face={a} obj={a} width={width} />
          <span className="exiled-tag">Exil</span>
        </div>
      ))}
      <Card
        face={o}
        obj={o}
        width={width}
        layoutId={o.uid}
        tapped={o.tapped}
        glow={glow(o)}
        showStats={showStats}
        onClick={() => clickPermanent(o.id)}
        oid={o.id}
      />
    </div>
  );
}

/**
 * Pile de jetons identiques (comme sur MTGA) : la carte du dessus, quelques cartes décalées derrière
 * et le nombre. Un clic agit sur le premier jeton ; comme les jetons dans des états différents ne sont
 * pas regroupés, faire attaquer un jeton le sort de la pile.
 */
function TokenStack({ slot, width, isMe, glow }: { slot: Slot; width: string; isMe: boolean; glow: (o: ObjectView) => Glow }) {
  const top = slot.objs[0] as ObjectView;
  const shadows = Math.min(TOKEN_SHADOWS, slot.objs.length - 1);
  return (
    <div
      className="perm-group token-stack"
      data-oids={slot.objs.map((o) => o.id).join(" ")}
      style={{ "--shadows": shadows } as CSSProperties}
      title={`${slot.objs.length} jetons ${top.name}`}
    >
      {slot.objs.slice(1, 1 + shadows).map((o, i) => (
        <div key={o.uid} className="token-shadow" style={{ "--shadow-i": shadows - i } as CSSProperties}>
          <Card face={o} obj={o} width={width} tapped={o.tapped} hoverable={false} />
        </div>
      ))}
      <Permanent o={top} width={width} isMe={isMe} attached={[]} glow={glow} showStats />
      <span className="token-count">×{slot.objs.length}</span>
    </div>
  );
}

function PermanentLine({
  slots,
  row,
  isMe,
  attachments,
  exiled,
  glow,
}: {
  slots: Slot[];
  row: "front" | "back";
  isMe: boolean;
  /** Auras et Équipements, par permanent hôte. */
  attachments: Map<string, ObjectView[]>;
  /** Cartes exilées par un permanent, par permanent. */
  exiled: Map<string, ObjectView[]>;
  glow: (o: ObjectView) => Glow;
}) {
  const width = row === "back" ? "var(--land-w)" : "var(--card-w)";
  return (
    <div className="perm-line">
      {slots.map((slot, i) => {
        const first = slot.objs[0] as ObjectView;
        // Rangée arrière : espace plus large entre les terrains et les artefacts ou enchantements.
        const blockStart = i > 0 && slot.block !== slots[i - 1]?.block ? "block-start" : "";
        if (slot.kind === "tokens") {
          return (
            <div key={first.uid} className={`slot ${blockStart}`}>
              <TokenStack slot={slot} width={width} isMe={isMe} glow={glow} />
            </div>
          );
        }
        return (
          <div key={first.uid} className={`slot perm-group ${slot.kind === "pile" ? "stacked" : ""} ${blockStart}`}>
            {slot.objs.map((o) => (
              <Permanent
                key={o.uid}
                o={o}
                width={width}
                isMe={isMe}
                attached={attachments.get(o.id) ?? []}
                exiled={exiled.get(o.id)}
                glow={glow}
                showStats={slot.block !== "lands"}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Champ de bataille d'un joueur : la taille des cartes dépend de sa seule zone (comme sur MTGA). */
function Battlefield({ player, isMe }: { player: string; isMe: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const glow = usePermanentGlow();
  const blocks = useGame((s) => s.blocks);
  const attackTargets = useGame((s) => s.attackTargets);
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<BattlefieldFit>({ cardW: 0, frontLines: 1, backLines: 1, walkerStep: 0 });
  // Auras et Équipements s'affichent sous leur hôte (quel que soit leur contrôleur).
  const onField = new Set(view.battlefield.map((o) => o.id));
  const isAttached = (o: ObjectView) => !!o.attachedTo && onField.has(o.attachedTo);
  const attachments = new Map<string, ObjectView[]>();
  for (const o of view.battlefield) {
    if (isAttached(o)) attachments.set(o.attachedTo as string, [...(attachments.get(o.attachedTo as string) ?? []), o]);
  }
  // Cartes exilées par un permanent : affichées sous lui.
  const exileById = new Map(view.exile.map((o) => [o.id, o]));
  const exiled = new Map<string, ObjectView[]>();
  const byId = new Map(view.battlefield.map((o) => [o.id, o]));
  for (const [source, ids] of Object.entries(view.exiledWith ?? {})) {
    const objs = ids.map((id) => exileById.get(id)).filter((o): o is ObjectView => !!o);
    // Une Aura ou un Équipement (Sheltered by Ghosts) est dessiné avec son hôte : ses cartes exilées vont sous l'hôte.
    const src = byId.get(source);
    const holder = src && isAttached(src) ? (src.attachedTo as string) : source;
    if (objs.length) exiled.set(holder, [...(exiled.get(holder) ?? []), ...objs]);
  }
  const perms = view.battlefield.filter((o) => o.controller === player && !isAttached(o));
  // Les jetons dont l'état d'interface diffère (lueur, attaquant bloqué, joueur attaqué) ne sont pas regroupés.
  const blocked = new Set(Object.values(blocks));
  const uiKey = (o: ObjectView) => `${glow(o) ?? ""}|${blocked.has(o.id) ? "b" : ""}|${attackTargets[o.id] ?? ""}`;
  const { front, back, walkers } = battlefieldSlots(
    battlefieldRows(perms),
    new Set([...attachments.keys(), ...exiled.keys()]),
    uiKey,
  );
  const depth = Math.max(0, ...perms.map((o) => (attachments.get(o.id)?.length ?? 0) + (exiled.get(o.id)?.length ?? 0)));
  const layoutKey = (slots: Slot[]) =>
    slots.map((s) => `${s.kind}:${s.objs.map((o) => `${o.id}${o.tapped ? "t" : ""}`).join("+")}`);
  const signature = `${layoutKey(front).join(",")}|${layoutKey(back).join(",")}|${layoutKey(walkers).join(",")}|${depth}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: recalcul quand les permanents changent (signature)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const f = fitBattlefield(el.clientWidth, el.clientHeight, front, back, walkers, depth);
      setFit((cur) =>
        cur.cardW === f.cardW &&
        cur.frontLines === f.frontLines &&
        cur.backLines === f.backLines &&
        cur.walkerStep === f.walkerStep
          ? cur
          : f,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [signature]);

  const { cardW, frontLines, backLines, walkerStep } = fit;
  const lines = (slots: Slot[], n: number, row: "front" | "back") => {
    const ls = splitLines(slots, n);
    return (isMe ? ls : ls.reverse()).map((l, i) => (
      <PermanentLine key={`${row}${i}`} slots={l} row={row} isMe={isMe} attachments={attachments} exiled={exiled} glow={glow} />
    ));
  };
  const rows = [
    <div key="f" className="perm-row front">
      {lines(front, frontLines, "front")}
    </div>,
    <div key="b" className="perm-row back">
      {lines(back, backLines, "back")}
    </div>,
  ];
  const style = cardW ? ({ "--card-w": `${cardW}px`, "--land-w": `${cardW * LAND_SCALE}px` } as CSSProperties) : undefined;
  // Recouvrement des planeswalkers quand ils ne tiennent pas en hauteur (le haut de chaque carte reste visible).
  const overlap = cardW ? Math.min(0, walkerStep - cardW * CARD_RATIO) : 0;
  return (
    <div ref={ref} className={`battlefield ${isMe ? "me" : "opp"}`} data-tuto={isMe ? "field-me" : "field-opp"} style={style}>
      <div className="bf-rows">{isMe ? rows : rows.reverse()}</div>
      {walkers.length > 0 && (
        // Zone des planeswalkers (et batailles), tout à droite comme sur MTGA.
        <div className="walker-zone">
          {walkers.map((slot, i) => {
            const o = slot.objs[0] as ObjectView;
            return (
              <div key={o.uid} className="walker" style={{ marginTop: i ? overlap : 0, "--walker-z": i + 1 } as CSSProperties}>
                <Permanent
                  o={o}
                  width="var(--card-w)"
                  isMe={isMe}
                  attached={attachments.get(o.id) ?? []}
                  exiled={exiled.get(o.id)}
                  glow={glow}
                  showStats
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
    <div className="phase-bar" data-tuto="phase-bar">
      <div className="phase-turn">
        Tour {view.turn.number} · <strong>{myTurn ? "vous" : view.players[view.turn.active]?.name}</strong>
      </div>
      <div className="phases" data-tuto="stops">
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
  const casting = useGame((s) => s.casting);
  const pickTarget = useGame((s) => s.pickTarget);
  const notify = useGame((s) => s.notify);
  if (view.stack.length === 0) return null;
  const targeting = casting?.stage === "target" ? casting.spec : null;
  return (
    <div className="stack" data-tuto="stack">
      <div className="stack-label">Pile</div>
      <div className="stack-items">
        {view.stack.map((item, i) => (
          <motion.div
            key={item.id}
            className={`stack-item ${item.controller === view.viewer ? "me" : "opp"}`}
            style={{ zIndex: i }}
            initial={{ scale: 0.6, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
          >
            <Card
              face={item}
              width="var(--stack-w)"
              layoutId={item.kind === "spell" ? item.uid : undefined}
              oid={item.id}
              glow={
                targeting
                  ? casting?.picked?.includes(item.id)
                    ? "selected"
                    : targeting.legal.includes(item.id)
                      ? "target"
                      : null
                  : i === view.stack.length - 1
                    ? "selected"
                    : null
              }
              onClick={
                targeting
                  ? () => (targeting.legal.includes(item.id) ? pickTarget(item.id) : notify("Cible invalide."))
                  : undefined
              }
            />
            {item.kind === "ability" && !item.effect && <div className="ability-tag">Capacité</div>}
            {item.effect && i === view.stack.length - 1 && (
              <div className="stack-effect" title={item.effect}>
                {item.effect}
              </div>
            )}
            {item.copy && <div className="ability-tag">Copie</div>}
            {item.kicked && <div className="ability-tag">Kické</div>}
            {item.x > 0 && <div className="ability-tag">X = {item.x}</div>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Banner() {
  const view = useGame((s) => s.view) as GameView;
  const loc = useLocalize();
  const casting = useGame((s) => s.casting);
  const cancel = useGame((s) => s.cancel);
  const chooseNoTarget = useGame((s) => s.chooseNoTarget);
  const confirmTargets = useGame((s) => s.confirmTargets);
  const aiming = useGame((s) => s.aimingAttacker);
  const lang = useGame((s) => s.lang);
  const selection = useGame((s) => s.selection);
  const p = view.pending;
  const mine = p?.player === view.viewer;
  const pick = boardPick(view);
  const nameOf = (id: string | undefined) =>
    (id && (view.players[id]?.name ?? faceNameOf(view.battlefield.find((o) => o.id === id)))) || "L'adversaire";
  const faceNameOf = (o: ObjectView | undefined) => (o ? faceName(o, lang) : undefined);

  let text: string;
  let extra: React.ReactNode = null;
  if (casting?.stage === "target" && casting.spec) {
    const max = casting.spec.count ?? 1;
    const n = casting.picked?.length ?? 0;
    text =
      max > 1
        ? `Choisissez ${casting.spec.optional ? "jusqu'à " : ""}${max} cibles : ${casting.spec.label ?? "cible"} (${n}/${max})`
        : `Choisissez une cible : ${casting.spec.label ?? "cible"}`;
    extra = (
      <>
        {max > 1 && (n > 0 || casting.spec.optional) && (
          <button type="button" className="btn small primary" onClick={confirmTargets}>
            Valider ({n})
          </button>
        )}
        {casting.spec.optional && max === 1 && (
          <button type="button" className="btn small" onClick={chooseNoTarget}>
            Aucune cible
          </button>
        )}
        <button type="button" className="btn small ghost" onClick={cancel}>
          Annuler (Échap)
        </button>
      </>
    );
  } else if (pick) {
    const source = choiceSource(view);
    const what = shortPrompt(loc(pick.prompt), source);
    text = `${source ? `${faceName(source.face, lang)} : ${what}` : what} (${selection.length}/${pick.max})`;
  } else if (!p) text = view.over ? "Partie terminée" : "…";
  else if (!mine) {
    const what: Record<string, string> = {
      priority: "joue",
      declareAttackers: "déclare ses attaquants",
      declareBlockers: "déclare ses bloqueurs",
      mulligan: "choisit sa main",
      choice: "fait un choix",
      bottomCards: "choisit sa main",
      discard: "se défausse",
    };
    text = `${nameOf(p.player)} ${what[p.kind] ?? "réfléchit"}…`;
  } else if (p.kind === "declareAttackers") {
    const defenders = p.defenders ?? [];
    text =
      defenders.length <= 1
        ? "Cliquez sur les créatures qui attaquent"
        : aiming
          ? `${nameOf(aiming)} attaque… cliquez sa cible (en surbrillance) — Échap pour annuler`
          : "Cliquez une créature, puis le joueur ou le planeswalker qu'elle attaque";
  } else if (p.kind === "declareBlockers") {
    text = "Bloqueurs : cliquez une de vos créatures, puis l'attaquant à bloquer";
  } else if (p.kind === "priority" && p.castNow) {
    // 608.2g : la carte à lancer brille au bout de la main ; le bouton principal refuse.
    text = loc(p.castNow.prompt);
  } else if (p.kind === "priority" && view.stack.length > 0) {
    const top = view.stack[view.stack.length - 1];
    // « répondre ? » seulement si une réponse est possible (sinon le panneau StackReveal le montre).
    const canRespond = myActions(view).some((a) => a.type !== "pass" && a.type !== "tapForMana");
    text =
      top && top.controller !== view.viewer
        ? `${nameOf(top.controller)} ${top.kind === "ability" ? "active" : "lance"} ${faceName(top, lang)}${canRespond ? " — répondre ?" : ""}`
        : "Votre sort va se résoudre";
  } else {
    text = `${STEP_LABEL[view.turn.step]} — ${view.turn.active === view.viewer ? "à vous" : nameOf(view.turn.active)}`;
  }
  return (
    <div className={`banner ${mine ? "mine" : ""}`}>
      <span>{text}</span>
      {extra}
    </div>
  );
}

/** Temps restant avant `deadline` (Date.now()), rafraîchi plusieurs fois par seconde. */
function useRemaining(deadline: number | null | undefined): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : null;
}

/** Corde (jeu en ligne) : la fin du temps de la décision en cours, comme sur MTGA. */
function Rope() {
  const clock = useGame((s) => s.online?.clock);
  const view = useGame((s) => s.view);
  const remaining = useRemaining(clock?.deadline);
  if (!clock || remaining === null || !view || view.over || remaining > clock.ropeMs) return null;
  const mine = clock.player === view.viewer;
  const who = mine ? "Vous" : (view.players[clock.player]?.name ?? "L'adversaire");
  return (
    <div className={`rope ${mine ? "mine" : ""}`} role="timer" aria-live="polite">
      <div className="rope-bar" style={{ width: `${(remaining / clock.ropeMs) * 100}%` }} />
      <span className="rope-text">
        {who} · {Math.ceil(remaining / 1000)} s
        {clock.timeouts[clock.player] ? ` · temps écoulé ${clock.timeouts[clock.player]}/${clock.maxTimeouts}` : ""}
      </span>
    </div>
  );
}

/** Bandeau réseau (jeu en ligne) : adversaire déconnecté, ou votre connexion perdue. */
function NetBanner() {
  const online = useGame((s) => s.online);
  const view = useGame((s) => s.view);
  const remaining = useRemaining(online?.opponent.deadline);
  if (!online || !view || view.over) return null;
  if (online.reconnecting) return <div className="net-banner">Connexion au serveur perdue — reconnexion…</div>;
  if (online.opponent.connected) return null;
  const opp = view.players[view.opponents[0] ?? ""]?.name ?? "L'adversaire";
  return (
    <div className="net-banner">
      {opp} s'est déconnecté
      {remaining !== null ? ` — victoire par abandon dans ${Math.ceil(remaining / 1000)} s s'il ne revient pas` : ""}
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
      <Rope />
      <NetBanner />
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
  const setHover = useGame((s) => s.setHover);
  const selection = useGame((s) => s.selection);
  const casting = useGame((s) => s.casting);
  const handRef = useRef<HTMLDivElement>(null);
  // Un glisser se termine aussi par un « tap » : on l'ignore pour ne pas envoyer deux décisions.
  const dragged = useRef(false);
  // Écran tactile : carte levée par un premier tap (pas de survol), jouée au second.
  const [lifted, setLifted] = useState<string | null>(null);
  const acts = myActions(view);
  const playable = new Set(
    acts.flatMap((a) => (a.type === "cast" || a.type === "playLand" ? [a.card] : a.type === "activate" ? [a.source] : [])),
  );
  // Cartes exilées jouables ce tour-ci (Chandra) : présentées au bout de la main.
  const cards = [...view.hand, ...view.playableExile];
  const exiled = new Set(view.playableExile.map((c) => c.id));
  const n = cards.length;

  // Pas entre les cartes : elles se resserrent pour tenir dans la largeur de la main (voir fitHand).
  const [box, setBox] = useState({ width: 0, cardW: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: nouvelle mesure quand le nombre de cartes change
  useLayoutEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const measure = () => {
      const cardW = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      setBox((cur) => (cur.width === el.clientWidth && cur.cardW === cardW ? cur : { width: el.clientWidth, cardW }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);
  const step = box.cardW ? fitHand(box.width, box.cardW, n) : null;
  const margin = step === null ? undefined : `0 ${-(box.cardW - step) / 2}px`;
  const selecting =
    view.pending?.player === view.viewer && (view.pending.kind === "discard" || view.pending.kind === "bottomCards");
  const liftedId = lifted && cards.some((c) => c.id === lifted) ? lifted : null;
  // Toucher ailleurs que dans la main repose la carte levée.
  useEffect(() => {
    if (!liftedId) return;
    const drop = (e: globalThis.PointerEvent) => {
      if (!handRef.current?.contains(e.target as Node)) setLifted(null);
    };
    document.addEventListener("pointerdown", drop);
    return () => document.removeEventListener("pointerdown", drop);
  }, [liftedId]);

  return (
    <div className="hand" data-tuto="hand" ref={handRef}>
      {cards.map((c, i) => {
        const angle = n > 1 ? (i - (n - 1) / 2) * Math.min(4, 24 / n) : 0;
        const lift = Math.abs(i - (n - 1) / 2) * Math.min(6, 30 / n);
        const up = liftedId === c.id;
        return (
          <motion.div
            key={c.uid}
            className={`hand-card ${exiled.has(c.id) ? "from-exile" : ""} ${up ? "lifted" : ""}`}
            style={{ zIndex: up ? 40 : i, margin }}
            animate={up ? { rotate: 0, y: "-38%", scale: 1.15 } : { rotate: angle, y: lift, scale: 1 }}
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
              setLifted(null);
            }}
            onTap={(e) => {
              if (dragged.current || justLongPressed()) return;
              // Au doigt : le premier tap lève la carte (et l'affiche dans l'aperçu), le second la joue.
              if ((e as PointerEvent).pointerType !== "mouse" && isTouch() && !selecting && !up) {
                setLifted(c.id);
                setHover({ face: c, obj: c });
                return;
              }
              setLifted(null);
              clickHandCard(c.id);
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
      if (p.castNow) return { label: "Ne pas lancer", run: pass };
      if (v.stack.length > 0) return { label: "Résoudre", run: pass, hot: true };
      if (v.turn.active === v.viewer) {
        if (v.turn.step === "main1" && v.potentialAttackers > 0) return { label: "Combat", run: pass, hot: true };
        if (v.turn.step === "main1" || v.turn.step === "main2") return { label: "Fin du tour", run: s.endTurn, hot: true };
      }
      return { label: "Passer", run: pass, hot: true };
    case "declareAttackers": {
      const n = s.attackers.length;
      // Façon MTGA : sans sélection, le bouton sélectionne toutes les créatures ; un second appui confirme.
      if (!n && (p.candidates?.length ?? 0) > 0) return { label: "Attaquer avec tous", hot: true, run: s.allAttack };
      return {
        label: n ? `Attaquer (${n})` : "Pas d'attaque",
        hot: true,
        run: () =>
          s.decide({
            type: "declareAttackers",
            attackers: s.attackers.map((id) => ({
              id,
              defender: s.attackTargets[id] ?? p.defenders?.[0] ?? (v.opponents[0] as string),
            })),
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
    case "choice": {
      const pick = boardPick(v);
      if (!pick) return { label: "Choisissez…", disabled: true };
      const n = s.selection.length;
      return {
        label: n === 0 && pick.min === 0 ? "Aucun" : `Valider (${n})`,
        hot: true,
        disabled: !pickValid(pick, s.selection),
        run: () => s.decide({ type: "choose", values: s.selection }),
      };
    }
    default:
      return { label: "Choisissez…", disabled: true };
  }
}

function ActionPanel() {
  const view = useGame((s) => s.view) as GameView;
  const endTurn = useGame((s) => s.endTurn);
  const decide = useGame((s) => s.decide);
  const attackers = useGame((s) => s.attackers);
  const action = useMainAction();
  const myTurn = view.turn.active === view.viewer;
  const p = view.pending;
  const mine = p?.player === view.viewer && (p?.kind === "priority" || p?.kind === "declareAttackers");
  return (
    <div className="action-panel">
      {view.controlling && (
        <div className="control-banner">Vous contrôlez {view.players[view.controlling]?.name ?? "l'adversaire"}</div>
      )}
      <button
        type="button"
        className={`main-button ${action.hot ? "hot" : ""}`}
        data-tuto="main-button"
        disabled={action.disabled}
        onClick={action.run}
        title="Espace"
      >
        {action.label}
      </button>
      {p?.kind === "declareAttackers" &&
        p.player === view.viewer &&
        (attackers.length > 0 || (p.candidates?.length ?? 0) > 0) && (
          <button
            type="button"
            className="btn small no-attack"
            onClick={() => decide({ type: "declareAttackers", attackers: [] })}
            title="Ne pas attaquer ce tour-ci"
          >
            Pas d'attaque
          </button>
        )}
      {myTurn && mine && !view.over && (
        <button
          type="button"
          className="btn small ghost"
          data-tuto="end-turn"
          onClick={endTurn}
          title="Entrée : passer jusqu'à la fin du tour"
        >
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
  const opponents = view.opponents.map((id) => view.players[id]).filter((p): p is PlayerView => !!p);
  return (
    <div className="board" id="board">
      <div className={`opp-bars n${opponents.length}`}>
        {opponents.map((opp) => (
          <div key={opp.id} className={`top-row ${opp.lost ? "eliminated" : ""}`}>
            <PlayerBar player={opp} isMe={false} />
            <OpponentHand count={opp.handCount} />
          </div>
        ))}
      </div>
      <div className={`opponents n${opponents.length}`}>
        {opponents.map((opp) => (
          <div key={opp.id} className={`opp-zone ${opp.lost ? "eliminated" : ""}`}>
            <Battlefield player={opp.id} isMe={false} />
          </div>
        ))}
      </div>
      <CenterStrip />
      <Battlefield player={me.id} isMe={true} />
      <div className="bottom-row">
        <PlayerBar player={me} isMe={true} />
        <Hand />
        <ActionPanel />
      </div>
      <Arrows />
      <Effects />
      <StackReveal />
    </div>
  );
}
