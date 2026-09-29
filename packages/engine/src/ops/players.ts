/** Effets du moteur : joueurs (points de vie, pioche, tours et étapes supplémentaires, victoire). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { createTokens, dealDamage, drawCard, gainLife, loseLife, sacrifice, setSpeed } from "../actions";
import type { OpHandlers } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  damageSource,
  drawBonus,
  evalAmount,
  nameOf,
  resolveRef,
  store,
} from "../effects";
import { apnapOrder, emit, isPlayer, moveObject, onBattlefield, opponentsOf, random, rulesEvent, shuffle } from "../state";
import { addPlayerEffect, playerStatic } from "../statics";
import { matchesObjectFilter } from "../targets";
import { eliminate, endTheTurn } from "../turn";

export const HANDLERS: OpHandlers = {
  playerEffect(s, _r, e, ctx) {
    const who = e.who ? resolveRef(s, ctx, e.who).filter((p) => isPlayer(s, p)) : [ctx.controller];
    for (const p of who) addPlayerEffect(s, p, e.ability, s.turn.number);
    return;
  },
  cantAttackYouThisTurn(s, _r, e, ctx) {
    for (const p of resolveRef(s, ctx, e.who)) {
      if (isPlayer(s, p) && p !== ctx.controller) addPlayerEffect(s, p, { cantAttackPlayer: ctx.controller }, s.turn.number);
    }
    return;
  },
  gift(s, _r, e, ctx) {
    // 702.174 : l'adversaire choisi reçoit le cadeau (approximation : le prochain adversaire dans l'ordre du tour).
    const to = opponentsOf(s, ctx.controller)[0];
    if (!to) return;
    if (e.kind === "card") drawCard(s, to);
    else if (e.token) {
      const created = createTokens(s, to, e.token, 1);
      for (const id of created) {
        const o = s.objects[id];
        if (o && e.kind === "fish") o.tapped = true;
      }
    }
    emit({ type: "gift", player: ctx.controller, to, kind: e.kind });
    rulesEvent(s, { e: "gift", player: ctx.controller });
    return;
  },
  damageEachPlayerPer(s, _r, e, ctx) {
    // Sunspine Lynx : chaque joueur, autant de blessures que de permanents correspondants qu'il contrôle.
    const src = damageSource(s, ctx);
    if (!src) return;
    for (const p of s.playerOrder.filter((q) => !s.players[q]?.lost)) {
      const n = s.battlefield.filter(
        (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, { ...e.filter, controller: undefined }),
      ).length;
      dealDamage(s, src, p, n, false);
    }
    return;
  },
  cantGainLife(s, _r, e, ctx) {
    for (const p of resolveRef(s, ctx, e.who)) if (s.players[p]) addPlayerEffect(s, p, { cantGainLife: true }, null);
    return;
  },
  mayWheel(s, r, _e, ctx, key) {
    // « Chaque joueur peut défausser sa main et piocher sept cartes » : choix dans l'ordre APNAP, puis tout se fait ensemble.
    const order = apnapOrder(s);
    for (const p of order) {
      if (r.vars[key(`wheel-${p}`)]) continue;
      const hand = s.players[p]?.hand.length ?? 0;
      return {
        ask: {
          player: p,
          key: key(`wheel-${p}`),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: `${nameOf(s, ctx.sourceId)} : défausser votre main (${hand} carte(s)) et piocher sept cartes ?`,
            suggested: [hand < 4 ? 1 : 0],
          },
        },
      };
    }
    const yes = order.filter((p) => r.vars[key(`wheel-${p}`)]?.[0] === 1);
    for (const p of yes) {
      const hand = [...(s.players[p]?.hand ?? [])];
      if (hand.length === 0) continue;
      emit({ type: "discard", player: p, defIds: hand.map((id) => s.objects[id]?.defId ?? "") });
      for (const id of hand) announceDiscard(s, p, moveObject(s, id, "graveyard"));
      announceDiscardBatch(s, p, hand.length);
    }
    for (const p of yes) for (let i = 0; i < 7; i++) drawCard(s, p);
    return;
  },
  punisher(s, r, e, ctx, key) {
    // Rottenmouth Viper : « pour chaque marqueur de fléau » (la vie à perdre est redemandée à chaque fois).
    const times = e.times === undefined ? 1 : Math.max(0, evalAmount(s, ctx, e.times));
    for (let i = 0; i < times; i++)
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p) || r.vars[key(`pdone-${i}-${p}`)]) continue;
        const hand = s.players[p]?.hand ?? [];
        const f = e.sacrifice;
        const perms = f ? s.battlefield.filter((id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, f)) : [];
        const options = ["life", ...(e.discard && hand.length ? ["discard"] : []), ...(perms.length ? ["sacrifice"] : [])];
        let choice = options.length === 1 ? "life" : r.vars[key(`punish-${i}-${p}`)]?.[0];
        if (choice === undefined) {
          return {
            ask: {
              player: p,
              key: key(`punish-${i}-${p}`),
              request: {
                type: "pick",
                intent: "punisher",
                prompt: `${nameOf(s, ctx.sourceId)} : choisissez`,
                options,
                labels: {
                  life: e.damage !== undefined ? `Subir ${evalAmount(s, ctx, e.damage)} blessures` : `Perdre ${e.loseLife} PV`,
                  discard: "Défausser une carte",
                  sacrifice: "Sacrifier un permanent",
                },
                min: 1,
                max: 1,
                suggested: [options[options.length - 1] as string],
              },
            },
          };
        }
        choice = String(choice);
        if (choice === "life") {
          if (e.damage !== undefined) {
            const src = damageSource(s, ctx);
            if (src) dealDamage(s, src, p, Math.max(0, evalAmount(s, ctx, e.damage)), false);
          } else loseLife(s, p, e.loseLife);
          r.vars[key(`pdone-${i}-${p}`)] = [1];
          continue;
        }
        const pool = choice === "discard" ? hand : perms;
        const picked = pool.length === 1 ? [pool[0] as string] : r.vars[key(`punishPick-${i}-${p}`)]?.map(String);
        if (!picked) {
          return {
            ask: {
              player: p,
              key: key(`punishPick-${i}-${p}`),
              request: {
                type: "pick",
                intent: choice === "discard" ? "discard" : "sacrifice",
                prompt: choice === "discard" ? "Défaussez une carte" : "Sacrifiez un permanent",
                options: [...pool],
                min: 1,
                max: 1,
                suggested: [pool[0] as string],
              },
            },
          };
        }
        r.vars[key(`pdone-${i}-${p}`)] = [1];
        for (const id of picked) {
          if (choice === "discard") {
            emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
            announceDiscard(s, p, moveObject(s, id, "graveyard"));
          } else if (onBattlefield(s, id)) sacrifice(s, id);
        }
        if (choice === "discard") announceDiscardBatch(s, p, picked.length);
      }
    return;
  },
  draw(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p)) continue;
      for (let i = 0; i < n + drawBonus(s, p, n); i++) drawCard(s, p);
    }
    return;
  },
  gainLife(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) gainLife(s, p, n);
    return;
  },
  loseLife(s, r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    let lost = 0;
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p)) continue;
      loseLife(s, p, n);
      lost += n;
    }
    store(r, e.store, lost);
    return;
  },
  extraLandThisTurn(s, _r, _e, ctx) {
    addPlayerEffect(s, ctx.controller, { extraLands: 1 }, s.turn.number);
    return;
  },
  reduceSpeed(s, _r, e, ctx) {
    for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
      const speed = s.players[p]?.speed ?? 0;
      const others = s.playerOrder.filter((q) => q !== p && !s.players[q]?.lost).map((q) => s.players[q]?.speed ?? 0);
      if (speed > 1 && others.every((o) => speed > o)) setSpeed(s, p, speed - 1);
    }
    return;
  },
  controlNextTurn(s, _r, e, ctx) {
    const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
    if (p) s.turnControl = { player: p, by: ctx.controller };
    return;
  },
  endTurn(s, r) {
    endTheTurn(s, r);
    return;
  },
  mayShuffleHandGraveyardDraw(s, r, e, ctx, key) {
    for (const p of apnapOrder(s)) {
      if (r.vars[key(`shuf-${p}`)] === undefined) {
        const answer = r.vars[key(`shufq-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: p,
              key: key(`shufq-${p}`),
              request: {
                type: "yesNo",
                intent: "may",
                prompt: `${nameOf(s, ctx.sourceId)} : mélanger main et cimetière dans la bibliothèque et piocher ${e.n} cartes ?`,
                suggested: [(s.players[p]?.hand.length ?? 0) < 4 ? 1 : 0],
              },
            },
          };
        }
        r.vars[key(`shuf-${p}`)] = [answer[0] === 1 ? 1 : 0];
      }
    }
    for (const p of apnapOrder(s)) {
      if (r.vars[key(`shuf-${p}`)]?.[0] !== 1) continue;
      const pl = s.players[p];
      if (!pl) continue;
      for (const id of [...pl.hand, ...pl.graveyard]) moveObject(s, id, "library");
      shuffle(s, pl.library);
      for (let i = 0; i < e.n; i++) drawCard(s, p);
    }
    return;
  },
  coinFlip(s, r, e, ctx) {
    const stats = s.players[ctx.controller]?.turnStats;
    // Edgar, King of Figaro : la première fois chaque tour, la pièce tombe sur pile et le lancer est gagné.
    const rigged = !stats?.coinFlips && playerStatic(s, ctx.controller, "winFirstCoinFlips");
    if (stats) stats.coinFlips = (stats.coinFlips ?? 0) + 1;
    const won = rigged || random(s) < 0.5;
    emit({ type: "coinFlip", player: ctx.controller, won });
    store(r, e.store, won ? 1 : 0);
    return;
  },
  extraUpkeeps(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (let i = 0; i < n; i++) rulesEvent(s, { e: "step", step: "upkeep", active: s.turn.active });
    return;
  },
  noncombatBonusThisTurn(s, _r, e, ctx) {
    addPlayerEffect(s, ctx.controller, { noncombatDamageBonusAll: evalAmount(s, ctx, e.amount) }, s.turn.number);
    return;
  },
  poison(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.n);
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (!pl || n <= 0) continue;
      pl.poison = (pl.poison ?? 0) + n;
      emit({ type: "poison", player: p, amount: n, total: pl.poison });
    }
    return;
  },
  extraCombat(s) {
    s.turn.extraCombats = (s.turn.extraCombats ?? 0) + 1;
    return;
  },
  extraTurn(s, _r, _e, ctx) {
    s.extraTurns = [...(s.extraTurns ?? []), ctx.controller];
    return;
  },
  extraEndStep(s) {
    s.turn.extraEndSteps = (s.turn.extraEndSteps ?? 0) + 1;
    return;
  },
  winGame(s, _r, _e, ctx) {
    eliminate(s, opponentsOf(s, ctx.controller));
    return;
  },
  loseGame(s, _r, e, ctx) {
    eliminate(s, e.who ? resolveRef(s, ctx, e.who).filter((p) => isPlayer(s, p)) : [ctx.controller]);
    return;
  },
  setLife(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (!pl) continue;
      if (n < pl.life) loseLife(s, p, pl.life - n);
      else if (n > pl.life) gainLife(s, p, n - pl.life);
    }
    return;
  },
};
