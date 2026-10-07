/** Effets du moteur : joueurs (points de vie, pioche, tours et étapes supplémentaires, victoire). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import {
  createTokens,
  dealDamage,
  drawCards,
  gainLife,
  increaseSpeed,
  loseLife,
  sacrifice,
  setMonarch,
  setSpeed,
} from "../actions";
import type { OpHandlers } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  damageSource,
  evalAmount,
  millCards,
  moveDiscarded,
  nameOf,
  nextTurnOf,
  resolveCompare,
  resolveRef,
  store,
} from "../effects";
import {
  apnapOrder,
  bump,
  emit,
  isAlive,
  isPlayer,
  moveObject,
  onBattlefield,
  opponentsOf,
  random,
  rulesEvent,
  shuffle,
} from "../state";
import { addPlayerEffect, cantLose, playerStatic } from "../statics";
import { matchesObjectFilter } from "../targets";
import { eliminate, endTheTurn } from "../turn";
import type { EventReplacement, Step } from "../types";

export const HANDLERS: OpHandlers = {
  playerEffect(s, _r, e0, ctx) {
    // Loki Laufeyson : « de valeur de mana au plus la force de Loki » est figé à la résolution (`resolveCompare`), sans
    // descendre sous 0.
    const f = e0.ability.nextSpell?.filter;
    const frozen = f && e0.ability.nextSpell ? resolveCompare(s, f, ctx.sourceId, ctx) : f;
    const e =
      frozen && frozen !== f && e0.ability.nextSpell
        ? {
            ...e0,
            ability: {
              ...e0.ability,
              nextSpell: {
                ...e0.ability.nextSpell,
                filter: {
                  ...frozen,
                  compare: frozen.compare?.map((c) => (typeof c.to === "number" ? { ...c, to: Math.max(0, c.to) } : c)),
                },
              },
            },
          }
        : e0;
    // « Ne peut pas vous attaquer » (Sandswirl Wanderglyph), « vos Jace » (Jace, Multiverse Architect) : « vous » est
    // le contrôleur de l'effet, qui n'est pas concerné lui-même.
    const ability =
      e.ability.cantAttack?.of === "you"
        ? { ...e.ability, cantAttack: { ...e.ability.cantAttack, of: ctx.controller } }
        : e.ability;
    const who = (e.who ? resolveRef(s, ctx, e.who).filter((p) => isPlayer(s, p)) : [ctx.controller]).filter(
      (p) => p !== ability.cantAttack?.of,
    );
    const until =
      e.duration === "untilYourNextTurn"
        ? nextTurnOf(s, ctx.controller) - 1
        : e.duration === "forever" || (e.times !== undefined && !e.once)
          ? null
          : s.turn.number;
    const times = e.times !== undefined ? evalAmount(s, ctx, e.times) : 1;
    for (const p of who)
      for (let i = 0; i < times; i++)
        addPlayerEffect(
          s,
          p,
          ability,
          e.duration === "untilTheirNextTurn" ? nextTurnOf(s, p) - 1 : until,
          e.times !== undefined || !!e.once,
        );
    return;
  },
  gift(s, r, e, ctx) {
    // 702.174 : l'adversaire choisi en lançant le sort reçoit le cadeau (`CastInfo.giftTo`, sur le sort ou sur le permanent
    // qu'il est devenu) ; avec un seul adversaire, rien n'a été demandé : c'est lui. Parti de la partie : rien.
    // Approximation : un permanent qui a déjà quitté le champ de bataille n'a plus son choix (l'adversaire suivant).
    const cast = r.item.kind === "spell" ? r.item.cast : s.objects[ctx.sourceId]?.cast;
    const to = cast?.giftTo ?? opponentsOf(s, ctx.controller)[0];
    if (!to || !isAlive(s, to)) return;
    if (e.kind === "card") drawCards(s, to, 1);
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
      for (const id of hand) announceDiscard(s, p, moveDiscarded(s, p, id, true));
      announceDiscardBatch(s, p, hand.length);
    }
    for (const p of yes) drawCards(s, p, 7);
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
            announceDiscard(s, p, moveDiscarded(s, p, id, true));
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
      drawCards(s, p, n);
    }
    return;
  },
  gainLife(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) gainLife(s, p, n);
    return;
  },
  loseLife(s, r, e, ctx) {
    const amount = evalAmount(s, ctx, e.amount);
    let lost = 0;
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p)) continue;
      const n = e.half ? Math.floor(Math.max(0, s.players[p]?.life ?? 0) / 2) : amount;
      loseLife(s, p, n);
      lost += n;
    }
    store(r, e.store, lost);
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
  increaseSpeed(s, _r, _e, ctx) {
    increaseSpeed(s, ctx.controller);
    return;
  },
  radiation(s, _r, _e, ctx) {
    const p = ctx.controller;
    const pl = s.players[p];
    const n = pl?.counters?.rad ?? 0;
    if (!pl || pl.lost || n <= 0) return;
    const milled = millCards(s, [[p, pl.library.slice(0, n)]]);
    const nonland = milled.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land")).length;
    if (nonland <= 0) return;
    // Strong, the Brutish Thespian : des PV gagnés au lieu d'en perdre.
    if (playerStatic(s, p, "radiationGains")) gainLife(s, p, nonland);
    else loseLife(s, p, nonland);
    pl.counters ??= {};
    const counters = pl.counters;
    counters.rad = Math.max(0, (counters.rad ?? 0) - nonland);
    emit({ type: "rad", player: p, amount: -nonland, total: counters.rad });
    bump(s); // des statiques en dépendent (Nightkin Ambusher)
    return;
  },
  becomeMonarch(s, _r, e, ctx) {
    const p = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    if (p) setMonarch(s, p);
    return;
  },
  chooseNumbers(s, r, e, ctx, key) {
    const who = resolveRef(s, ctx, e.who);
    for (const p of apnapOrder(s).filter((x) => who.includes(x))) {
      const k = `$num:${e.store}:${p}`;
      if (r.vars[k]) continue;
      const answer = r.vars[key(`num-${p}`)];
      if (!answer)
        return {
          ask: {
            player: p,
            key: key(`num-${p}`),
            request: {
              type: "number",
              intent: "other",
              prompt: `${nameOf(s, ctx.sourceId)} : choisissez secrètement un nombre`,
              min: 0,
              max: e.max,
              suggested: [0],
            },
          },
        };
      r.vars[k] = [Math.min(e.max, Math.max(0, Number(answer[0] ?? 0)))];
    }
    return;
  },
  controlNextTurn(s, _r, e, ctx) {
    const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
    if (p)
      s.turnControl = {
        player: p,
        by: ctx.controller,
        ...(e.combatOnly ? { combatOnly: true } : {}),
        ...(e.thenExtraTurn ? { thenExtraTurn: true } : {}),
      };
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
      drawCards(s, p, e.n);
    }
    return;
  },
  coinFlip(s, r, e, ctx) {
    if (e.sides) {
      const result = 1 + Math.floor(random(s) * e.sides);
      emit({ type: "dieRoll", player: ctx.controller, sides: e.sides, result });
      store(r, e.store, result);
      return;
    }
    const stats = s.players[ctx.controller]?.turnStats;
    // Edgar, King of Figaro : la première fois chaque tour, la pièce tombe sur pile et le lancer est gagné.
    const rigged = !stats?.coinFlips && playerStatic(s, ctx.controller, "winFirstCoinFlips");
    if (stats) stats.coinFlips = (stats.coinFlips ?? 0) + 1;
    const won = rigged || random(s) < 0.5;
    emit({ type: "coinFlip", player: ctx.controller, won });
    store(r, e.store, won ? 1 : 0);
    return;
  },
  noncombatBonusThisTurn(s, _r, e, ctx) {
    // Taii Wakeen : « ce tour-ci, les blessures non de combat de vos sources sont augmentées de X » (X figé maintenant).
    const add = evalAmount(s, ctx, e.amount);
    const replacement: EventReplacement = { event: "damage", source: { controller: "you" }, combat: false, modify: { add } };
    addPlayerEffect(s, ctx.controller, { replacement }, s.turn.number);
    return;
  },
  poison(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.n);
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (!pl || n <= 0) continue;
      pl.counters ??= {};
      const counters = pl.counters;
      if (e.counter === "rad") {
        counters.rad = (counters.rad ?? 0) + n;
        emit({ type: "rad", player: p, amount: n, total: counters.rad });
        bump(s);
        continue;
      }
      counters.poison = (counters.poison ?? 0) + n;
      emit({ type: "poison", player: p, amount: n, total: counters.poison });
      bump(s); // corrompu : des statiques en dépendent
    }
    return;
  },
  winGame(s, _r, _e, ctx) {
    // Herald of Eternal Dawn (`cantLose`) : « vous ne pouvez pas perdre et vos adversaires ne peuvent pas gagner ».
    const opponents = opponentsOf(s, ctx.controller);
    if (opponents.some((p) => cantLose(s, p))) return;
    eliminate(s, opponents);
    return;
  },
  loseGame(s, _r, e, ctx) {
    const who = e.who ? resolveRef(s, ctx, e.who).filter((p) => isPlayer(s, p)) : [ctx.controller];
    eliminate(
      s,
      who.filter((p) => !cantLose(s, p)),
    );
    return;
  },
  extra(s, _r, e, ctx) {
    const n = e.amount !== undefined ? evalAmount(s, ctx, e.amount) : 1;
    const t = s.turn;
    const inMain = t.step === "main1" || t.step === "main2";
    // 500.8 : la phase ajoutée le plus récemment a lieu d'abord (en tête de file) ; de même pour les étapes (500.10).
    const addPhases = (...steps: Step[]) => {
      t.addedPhases = [...steps, ...(t.addedPhases ?? [])];
    };
    const addStep = (step: Step) => {
      t.addedSteps = [step, ...(t.addedSteps ?? [])];
    };
    for (let i = 0; i < n; i++) {
      switch (e.kind) {
        case "upkeep":
          // Obeka : une phase de début de plus après cette phase, sans dégagement ni pioche ; Paradox Haze : après cette étape.
          if (e.after === "step") addStep("upkeep");
          else addPhases("upkeep");
          break;
        case "combat":
          // « Après cette phase principale » (Full Throttle) : rien hors d'une phase principale.
          if (e.after !== "main" || inMain) addPhases("beginCombat");
          break;
        case "combatAfterMain":
          // Relentless Assault : seulement s'il se résout pendant une phase principale.
          if (inMain) addPhases("beginCombat", "main2");
          break;
        case "endStep":
          addStep("end");
          break;
        case "turn":
          s.extraTurns = [...(s.extraTurns ?? []), ctx.controller];
          break;
      }
    }
    return;
  },
  setLife(s, r, e, ctx) {
    const before = s.players[ctx.controller]?.life ?? 0;
    // 701.12b, 118.5 : chaque joueur gagne ou perd la différence (déclencheurs et remplacements compris).
    const change = (p: string, life: number) => {
      const pl = s.players[p];
      if (!pl) return;
      if (life < pl.life) loseLife(s, p, pl.life - life);
      else if (life > pl.life) gainLife(s, p, life - pl.life);
    };
    if (e.exchange) {
      // Échange (Mister Negative) : les deux totaux sont lus avant le changement.
      const a = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
      const b = resolveRef(s, ctx, e.exchange).find((x) => isPlayer(s, x));
      if (!a || !b || a === b) return;
      const la = s.players[a]?.life ?? 0;
      const lb = s.players[b]?.life ?? 0;
      change(a, lb);
      change(b, la);
    } else {
      const n = evalAmount(s, ctx, e.amount ?? 0);
      for (const p of resolveRef(s, ctx, e.who)) change(p, n);
    }
    store(r, e.store, Math.max(0, before - (s.players[ctx.controller]?.life ?? 0)));
    return;
  },
};
