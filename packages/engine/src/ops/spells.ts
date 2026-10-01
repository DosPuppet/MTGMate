/** Effets du moteur : pile et permissions de lancer (contresorts, copies, lancer depuis une autre zone). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { payLife, sacrifice } from "../actions";
import type { OpHandlers, OpResult } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  evalAmount,
  grantPlay,
  moveWithSpec,
  nameOf,
  nextTurnOf,
  resolveRef,
  store,
} from "../effects";
import { bump } from "../layers";
import { availableMana, canPay, costToText, manaValue, payMana } from "../mana";
import { castTerms, counterItem, dropNowPermissions, plotCard, stackItemSpecs } from "../stack";
import { copyStackItem } from "../stackChoices";
import {
  apnapOrder,
  changeCounters,
  chars,
  createObject,
  emit,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  removeFromGame,
  rulesEvent,
  setPrepared,
  shuffle,
} from "../state";
import { addPlayerEffect } from "../statics";
import { legalTargets, matchesObjectFilter } from "../targets";
import type { ChoiceValue, GameState, ObjectId, PlayerId, Resolution } from "../types";

export const HANDLERS: OpHandlers = {
  discover(s, r, e, ctx, key) {
    const p = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    if (!p) return;
    // La résolution peut reprendre après la question : l'exil n'a lieu qu'une fois.
    if (!r.vars[key("done")]) {
      const n = evalAmount(s, ctx, e.n);
      const lib = s.players[p]?.library ?? [];
      const rest: ObjectId[] = [];
      let hit: ObjectId | undefined;
      while (lib.length && !hit) {
        const d = s.defs[s.objects[lib[0] as string]?.defId ?? ""];
        const id = moveObject(s, lib[0] as string, "exile");
        if (!id) break;
        if (d && !d.types.includes("Land") && manaValue(d.manaCost) <= n) hit = id;
        else rest.push(id);
      }
      emit({ type: "reveal", player: p, defIds: [...rest, ...(hit ? [hit] : [])].map((id) => s.objects[id]?.defId ?? "") });
      shuffle(s, rest);
      for (const id of rest) moveObject(s, id, "library", { position: "bottom" });
      r.vars[key("done")] = [1];
      r.vars[key("hit")] = hit ? [hit] : [];
      rulesEvent(s, { e: "discover", player: p, n });
    }
    const hit = r.vars[key("hit")]?.[0] as ObjectId | undefined;
    const storeHit = (id: ObjectId) => {
      if (!e.store) return;
      r.vars[`$ids:${e.store}`] = [id];
      store(r, e.store, 1);
    };
    const answer = r.vars[key("cast")];
    // Carte lancée : le sort sur la pile (Hit the Mother Lode lit sa valeur de mana).
    if (answer?.length) {
      dropNowPermissions(s);
      storeHit(String(answer[0]));
      return;
    }
    if (!hit || s.objects[hit]?.zone !== "exile") {
      dropNowPermissions(s);
      return;
    }
    // 701.57a : « vous pouvez la lancer sans payer son coût de mana ; sinon, mettez-la dans votre main », pendant
    // la résolution (608.2g).
    if (!answer) {
      grantPlay(s, p, [hit], "thisTurn", { free: true, anyTime: true, source: ctx.sourceId, now: true });
      if (castTerms(s, p, hit)) {
        return {
          castNow: {
            player: p,
            key: key("cast"),
            cards: [hit],
            prompt: `Découverte : lancer ${nameOf(s, hit)} gratuitement ? (sinon, en main)`,
          },
        };
      }
    }
    dropNowPermissions(s);
    const inHand = moveObject(s, hit, "hand");
    storeHit(inHand ?? hit);
    return;
  },
  suspend(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (!o) continue;
      if (o.zone === "stack") {
        // Le sort quitte la pile sans être contrecarré (une copie cesse simplement d'exister).
        const i = s.stack.findIndex((x) => x.id === id && x.kind === "spell");
        const item = s.stack[i];
        if (!item || item.copy) continue;
        s.stack.splice(i, 1);
      } else if (o.zone !== "hand") continue;
      emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to: "exile" });
      const exiled = moveObject(s, id, "exile");
      const card = exiled ? s.objects[exiled] : undefined;
      if (card?.zone !== "exile") continue;
      card.suspended = true;
      changeCounters(s, card, "time", e.time);
    }
    return;
  },
  castNow(s, r, e, ctx, key) {
    // Kotis : « des sorts de valeur de mana X ou moins parmi elles ».
    const max = e.maxManaValue === undefined ? undefined : evalAmount(s, ctx, e.maxManaValue);
    const cards = resolveRef(s, ctx, e.what).filter(
      (id) => max === undefined || manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= max,
    );
    const step = castNowLoop(s, r, key, ctx.controller, ctx.sourceId, cards, e);
    if (step.ask) return step.ask;
    if (e.storeCast) {
      r.vars[`$ids:${e.storeCast}`] = step.cast;
      store(r, e.storeCast, step.cast.length);
    }
    if (e.storeRest) {
      r.vars[`$ids:${e.storeRest}`] = step.rest;
      store(r, e.storeRest, step.rest.length);
    }
    return;
  },
  counterAbilitySilence(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "ability");
      if (!item) continue;
      const host = item.sourceId;
      counterItem(s, id, ctx.sourceDefId);
      const o = s.objects[host];
      if (o?.zone !== "battlefield" || s.objects[ctx.sourceId]?.zone !== "battlefield") continue;
      if (!chars(s, host).types.some((t) => t === "Artifact" || t === "Creature" || t === "Planeswalker")) continue;
      s.effects.push({
        id: newId(s, "e"),
        timestamp: nextTimestamp(s),
        affected: [host],
        duration: "permanent",
        whileSource: ctx.sourceId,
        loseAllAbilities: true,
      });
      bump(s);
    }
    return;
  },
  grantRebound(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item) item.rebound = true;
    }
    return;
  },
  counter(s, r, e, ctx) {
    let n = 0;
    for (const id of resolveRef(s, ctx, e.what)) if (counterItem(s, id, ctx.sourceDefId, e.exile)) n++;
    store(r, e.store, n);
    return;
  },
  unlessPay(s, r, e, ctx, key) {
    const isLand = (id: string) => chars(s, id).types.includes("Land");
    const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
    if (!p) return;
    // « à moins que son contrôleur ne paie {X} » (Syncopate) : X est celui du sort.
    const extra = e.genericAmount ? evalAmount(s, ctx, e.genericAmount) : 0;
    const base = e.mana ?? (e.genericAmount ? { generic: 0, colored: {}, x: 0 } : undefined);
    const mana = base ? { ...base, x: 0, generic: base.generic + (base.x ?? 0) * ctx.x + extra } : undefined;
    // Raubahn : « Garde — payez des PV égaux à sa force ».
    const life = e.lifeAmount ? evalAmount(s, ctx, e.lifeAmount) : e.life;
    // Garde à coût composé (Ovika : {3} et 3 PV) : les deux parties doivent être payables.
    const hand = s.players[p]?.hand ?? [];
    const canDo =
      (!mana || canPay(s, p, mana)) &&
      (s.players[p]?.life ?? 0) >= (life ?? 0) &&
      (!e.discard || hand.length > 0) &&
      s.battlefield.filter((id) => s.objects[id]?.controller === p && !(e.sacrificeNonland && isLand(id))).length >=
        (e.sacrifice ?? 0);
    if (!canDo) return;
    const answer = r.vars[key("unless")];
    if (!answer) {
      const what = [
        mana ? costToText(mana) : "",
        life ? `${life} points de vie` : "",
        e.discard ? "défausser une carte" : "",
        e.sacrifice ? `sacrifier ${e.sacrifice} permanents${e.sacrificeNonland ? " non-terrains" : ""}` : "",
      ]
        .filter(Boolean)
        .join(" et ");
      return {
        ask: {
          player: p,
          key: key("unless"),
          request: {
            type: "yesNo",
            intent: "unlessPay",
            prompt: `${nameOf(s, ctx.sourceId)} : payer ${what} pour l'éviter ?`,
            suggested: [1],
          },
        },
      };
    }
    if (answer[0] !== 1) return;
    // Garde « défaussez une carte » (Gideon the Oathless) : le joueur choisit la carte.
    if (e.discard) {
      // Garde « défaussez une carte au hasard » (Alpharael, Stonechosen).
      if (e.discardRandom && !r.vars[key("unlessCard")]) {
        const pool = [...hand];
        shuffle(s, pool);
        r.vars[key("unlessCard")] = pool.slice(0, 1);
      }
      const card = r.vars[key("unlessCard")];
      if (!card) {
        const cheapest = [...hand].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
        );
        return {
          ask: {
            player: p,
            key: key("unlessCard"),
            request: {
              type: "pick",
              intent: "discard",
              prompt: "Choisissez la carte à défausser",
              options: [...hand],
              min: 1,
              max: 1,
              suggested: cheapest.slice(0, 1),
            },
          },
        };
      }
      const id = String(card[0]);
      if (!hand.includes(id)) return;
      emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
      announceDiscard(s, p, moveObject(s, id, "graveyard"));
      announceDiscardBatch(s, p, 1);
    }
    // Garde « sacrifiez trois permanents » (Emrakul, the Exigent Doom).
    if (e.sacrifice) {
      const perms = s.battlefield.filter((id) => s.objects[id]?.controller === p && !(e.sacrificeNonland && isLand(id)));
      const chosen = r.vars[key("unlessSac")];
      if (!chosen) {
        const cheapest = [...perms].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
        );
        return {
          ask: {
            player: p,
            key: key("unlessSac"),
            request: {
              type: "pick",
              intent: "sacrifice",
              prompt: `Sacrifiez ${e.sacrifice} permanents`,
              options: perms,
              min: e.sacrifice,
              max: e.sacrifice,
              suggested: cheapest.slice(0, e.sacrifice),
            },
          },
        };
      }
      const ids = chosen.map(String).filter((id) => perms.includes(id));
      if (ids.length < e.sacrifice) return;
      for (const id of ids) sacrifice(s, id);
    }
    if (mana) {
      if (!canPay(s, p, mana)) return;
      payMana(s, p, mana);
    }
    if (life) payLife(s, p, life);
    // « S'il le fait, … » (Divert Disaster).
    store(r, e.paidStore, 1);
    return { skip: e.skip };
  },
  impulse(s, r, e, ctx, key) {
    const player = s.players[ctx.controller];
    if (!player) return;
    let exiled = r.vars[key("impulse")]?.map(String);
    if (!exiled) {
      exiled = [];
      for (const id of player.library.slice(0, e.n)) {
        const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
        if (n) exiled.push(n);
      }
      r.vars[key("impulse")] = exiled;
    }
    if (exiled.length === 0) return;
    const chosen = exiled.length === 1 ? exiled : r.vars[key("impulsePick")]?.map(String);
    if (!chosen) {
      return {
        ask: {
          player: ctx.controller,
          key: key("impulsePick"),
          request: {
            type: "pick",
            intent: "impulse",
            prompt: "Choisissez la carte exilée que vous pourrez jouer ce tour-ci",
            options: exiled,
            min: 1,
            max: 1,
            suggested: [exiled[0] as string],
          },
        },
      };
    }
    grantPlay(s, ctx.controller, chosen, e.until === "yourNextTurn" ? "yourNextTurn" : "thisTurn", {});
    return;
  },
  allowCastFromGraveyard(s, _r, e, ctx) {
    // Zul Ashur : ces cartes de votre cimetière sont lançables ce tour-ci (permission ordinaire).
    const ids = resolveRef(s, ctx, e.what).filter((id) => s.objects[id]?.zone === "graveyard");
    grantPlay(s, ctx.controller, ids, "thisTurn", { source: ctx.sourceId });
    return;
  },
  prepare(s, _r, e, ctx) {
    const f = e.filter;
    const ids = f
      ? s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, f, ctx.sourceId))
      : e.what
        ? resolveRef(s, ctx, e.what)
        : [];
    for (const id of ids) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") setPrepared(s, o, e.value);
    }
    return;
  },
  payCostOf(s, r, e, ctx, key) {
    const id = resolveRef(s, ctx, e.what)[0];
    const cost = s.defs[s.objects[id ?? ""]?.defId ?? ""]?.manaCost;
    store(r, e.store, 0);
    if (!id || !cost || !canPay(s, ctx.controller, cost)) return;
    const answer = r.vars[key("paycost")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("paycost"),
          request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
        },
      };
    }
    if (answer[0] !== 1 || !canPay(s, ctx.controller, cost)) return;
    payMana(s, ctx.controller, cost);
    store(r, e.store, 1);
    return;
  },
  grantFlashback(s, _r, e, ctx) {
    // Flashback accordé jusqu'à la fin du tour (et {0} pour Archmage's Newt) : une permission marquée `flashback`.
    const ids = resolveRef(s, ctx, e.what).filter((id) => s.objects[id]?.zone === "graveyard");
    grantPlay(s, ctx.controller, ids, "thisTurn", {
      source: ctx.sourceId,
      flashback: true,
      free: e.free || undefined,
      harmonize: e.harmonize || undefined,
    });
    return;
  },
  plot(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) plotCard(s, id);
    return;
  },
  copyNextExhaust(s, _r, _e, ctx) {
    addPlayerEffect(s, ctx.controller, { copyNextExhaust: true }, s.turn.number, true);
    return;
  },
  copySpell(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.count);
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id);
      if (!item) continue;
      // Sort, capacité activée ou déclenchée (Return the Favor, Ertha Jo) : nouvelles cibles au choix avant la priorité.
      for (let i = 0; i < n; i++) {
        const id = copyStackItem(s, item, ctx.controller);
        const copy = id ? s.stack.find((x) => x.id === id) : undefined;
        if (copy && (e.haste || e.sacrificeAtEnd))
          copy.arrival = {
            ...copy.arrival,
            ...(e.haste ? { haste: true } : {}),
            ...(e.sacrificeAtEnd ? { sacrificeAtEnd: true } : {}),
          };
      }
    }
    return;
  },
  plotOnResolve(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item) item.plotOnResolve = true;
    }
    return;
  },
  exileOnResolve(s, r, e, ctx) {
    if (!e.what) {
      r.item.flashback = true;
      return;
    }
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item) item.exileWithCounter = e.counter ?? "";
    }
    return;
  },
  resolveToBattlefieldTransformed(_s, r) {
    r.item.toBattlefieldTransformed = true;
    return;
  },
  payX(s, r, e, ctx, key) {
    if (r.vars[`$${e.store}`]) return;
    const max = availableMana(s, ctx.controller);
    const answer = r.vars[key("payx")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("payx"),
          request: {
            type: "number",
            intent: "payX",
            prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`,
            min: 0,
            max,
            suggested: [max],
          },
        },
      };
    }
    const x = Math.min(Number(answer[0]), max);
    if (x > 0 && canPay(s, ctx.controller, { generic: x, colored: {}, x: 0 })) {
      payMana(s, ctx.controller, { generic: x, colored: {}, x: 0 });
      store(r, e.store, x);
    } else store(r, e.store, 0);
    return;
  },
  changeTarget(s, r, e, ctx, key) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id);
      if (!item) continue;
      const entries = Object.entries(item.targets).filter(([, ids]) => ids.length > 0);
      const [specId, current] = entries[0] ?? [];
      if (entries.length !== 1 || !specId || current?.length !== 1) continue;
      const spec = stackItemSpecs(s, item).find((x) => x.id === specId);
      if (!spec) continue;
      const options = legalTargets(s, item.controller, spec, item.sourceId).filter((x) => x !== current[0] && x !== item.id);
      if (options.length === 0) continue;
      const answer = r.vars[key(`ct-${id}`)];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key(`ct-${id}`),
            request: {
              type: "pick",
              intent: "changeTarget",
              prompt: "Choisissez la nouvelle cible",
              options,
              min: 0,
              max: 1,
              suggested: [options[0] as string],
            },
          },
        };
      }
      if (answer[0] !== undefined) item.targets = { ...item.targets, [specId]: [String(answer[0])] };
    }
    return;
  },
  spellArrivalCounters(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item && n > 0) item.arrival = { ...item.arrival, counters: [...(item.arrival?.counters ?? []), { kind: "+1/+1", n }] };
    }
    return;
  },
  tripleTriad(s, _r, _e, ctx) {
    const exiled: ObjectId[] = [];
    for (const p of apnapOrder(s)) {
      const top = s.players[p]?.library[0];
      if (!top) continue;
      const id = moveObject(s, top, "exile");
      if (id) exiled.push(id);
    }
    emit({ type: "reveal", player: ctx.controller, defIds: exiled.map((id) => s.objects[id]?.defId ?? "") });
    const mine = exiled.find((id) => s.objects[id]?.owner === ctx.controller);
    if (!mine) return;
    const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const playable = [mine, ...exiled.filter((id) => id !== mine && mv(id) < mv(mine))];
    grantPlay(s, ctx.controller, playable, "thisTurn", { free: true });
    return;
  },
  countResolution(s, r, e, ctx) {
    const k = `${ctx.sourceId}:${ctx.sourceDefId}`;
    s.turn.resolutionCounts = { ...(s.turn.resolutionCounts ?? {}), [k]: (s.turn.resolutionCounts?.[k] ?? 0) + 1 };
    store(r, e.store, s.turn.resolutionCounts[k] ?? 0);
    return;
  },
  grantPlay(s, _r, e, ctx) {
    const ids = resolveRef(s, ctx, e.what).filter(
      (id) => s.objects[id]?.zone === "exile" || s.objects[id]?.zone === "graveyard" || s.objects[id]?.zone === "hand",
    );
    if (e.forOwner) {
      for (const id of ids) {
        const owner = s.objects[id]?.owner ?? ctx.controller;
        // « jusqu'à votre prochain tour » : le tour qui précède le prochain tour du contrôleur de l'effet.
        const until = e.forever
          ? "forever"
          : e.untilOwnersNextTurn
            ? "yourNextTurn"
            : e.untilYourNextTurn
              ? nextTurnOf(s, ctx.controller) - 1
              : "thisTurn";
        grantPlay(s, owner, [id], until, {
          free: e.free,
          anyTime: e.anyTime,
          extraCost: e.extraCost,
          landsTapped: e.landsTapped,
        });
      }
      return;
    }
    grantPlay(s, ctx.controller, ids, e.forever ? "forever" : e.untilYourNextTurn ? "yourNextTurn" : "thisTurn", {
      free: e.free,
      anyTime: e.anyTime,
      anyMana: e.anyMana,
      condition: e.condition,
      source: ctx.sourceId,
      exileAfter: e.exileAfter,
      group: e.oneOf ? newId(s, "g") : undefined,
    });
    return;
  },
  castCopiesFree(s, r, e, ctx, key) {
    // Uldaros Theorix : les cartes exilées sont copiées ; le joueur choisit lesquelles lancer (valeur de mana
    // totale limitée), puis les lance pendant la résolution.
    const cards = [...new Set(e.what.flatMap((w) => resolveRef(s, ctx, w)))].filter((id) => !!s.objects[id]);
    const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    // Sans limite effective (toutes les cartes tiennent), pas de question : toutes sont copiées.
    if (!r.vars[key("copies")] && cards.reduce((n, id) => n + mv(id), 0) <= e.maxTotalManaValue) r.vars[key("copies")] = cards;
    const answer = r.vars[key("copies")];
    if (!answer) {
      const suggested: string[] = [];
      let total = 0;
      for (const id of [...cards].sort((a, b) => mv(b) - mv(a))) {
        if (total + mv(id) > e.maxTotalManaValue) continue;
        suggested.push(id);
        total += mv(id);
      }
      return {
        ask: {
          player: ctx.controller,
          key: key("copies"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: `Copies à lancer gratuitement (valeur de mana totale ${e.maxTotalManaValue} ou moins)`,
            options: cards,
            min: 0,
            max: cards.length,
            suggested,
          },
        },
      };
    }
    // Les copies ne sont créées qu'une fois (la résolution reprend après chaque sort lancé).
    if (!r.vars[key("made")]) {
      let total = 0;
      const made: string[] = [];
      for (const id of answer.map(String)) {
        const o = s.objects[id];
        if (!o || !cards.includes(id) || total + mv(id) > e.maxTotalManaValue) continue;
        total += mv(id);
        const copy = createObject(s, o.defId, ctx.controller, "exile");
        copy.cardCopy = true;
        made.push(copy.id);
      }
      r.vars[key("made")] = made;
    }
    // 608.2g : les copies se lancent pendant la résolution ; celles qui ne sont pas lancées cessent d'exister (707.12).
    const copies = (r.vars[key("made")] ?? []).map(String);
    const step = castNowLoop(s, r, key, ctx.controller, ctx.sourceId, copies, { free: !e.paid, many: true });
    if (step.ask) return step.ask;
    for (const id of step.rest) removeFromGame(s, id);
    store(r, e.storeCast, step.cast.length);
    return;
  },
};

/**
 * 608.2g : « vous pouvez lancer [ces cartes] » pendant une résolution. Pose une priorité restreinte à ces cartes
 * (clés `cast0`, `cast1`… : la carte lancée, ou vide pour un refus) jusqu'à un refus, ou après un sort si `many` est
 * faux. Renvoie la question à poser, ou, une fois fini, les sorts lancés et les cartes restées dans leur zone.
 */
function castNowLoop(
  s: GameState,
  r: Resolution,
  key: (suffix: string) => string,
  player: PlayerId,
  source: ObjectId,
  cards: ObjectId[],
  opts: { free?: boolean; many?: boolean; exileAfter?: boolean; anyMana?: boolean },
): { ask?: OpResult; cast: ObjectId[]; rest: ObjectId[] } {
  const cast: ObjectId[] = [];
  let declined = false;
  let i = 0;
  for (; r.vars[key(`cast${i}`)]; i++) {
    const answer = r.vars[key(`cast${i}`)] as ChoiceValue[];
    if (!answer.length) {
      declined = true;
      break;
    }
    cast.push(String(answer[0]));
  }
  // Une carte lancée a changé d'identifiant (400.7) : il ne reste que les cartes encore dans leur zone.
  const rest = cards.filter((id) => !!s.objects[id] && s.objects[id]?.zone !== "stack");
  dropNowPermissions(s);
  if (!declined && (opts.many || cast.length === 0)) {
    const open = rest.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land"));
    grantPlay(s, player, open, "thisTurn", {
      free: opts.free,
      anyTime: true,
      anyMana: opts.anyMana,
      exileAfter: opts.exileAfter,
      source,
      now: true,
    });
    // Seules les cartes qu'on peut vraiment lancer (cibles, coûts additionnels) sont proposées.
    const castable = open.filter((id) => castTerms(s, player, id));
    if (castable.length) {
      const names = castable.map((id) => nameOf(s, id)).join(", ");
      return {
        ask: {
          castNow: {
            player,
            key: key(`cast${i}`),
            cards: castable,
            // Court : le bandeau de la partie l'affiche sur une ligne.
            prompt: `${nameOf(s, source)} : lancer ${castable.length > 1 ? "un sort" : names}${opts.free ? " gratuitement" : ""} ?`,
          },
        },
        cast,
        rest,
      };
    }
    dropNowPermissions(s);
  }
  return { cast, rest };
}
