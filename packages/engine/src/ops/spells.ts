/** Effets du moteur : pile et permissions de lancer (contresorts, copies, lancer depuis une autre zone). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */
import { loseLife, sacrifice } from "../actions";
import type { OpHandlers } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  evalAmount,
  grantPlay,
  moveWithSpec,
  nameOf,
  resolveRef,
  store,
} from "../effects";
import { bump } from "../layers";
import { availableMana, canPay, costToText, manaValue, payMana } from "../mana";
import { copySpellItem, counterItem, plotCard, stackItemSpecs } from "../stack";
import {
  apnapOrder,
  chars,
  createObject,
  emit,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  rulesEvent,
  setPrepared,
  shuffle,
} from "../state";
import { legalTargets, matchesObjectFilter } from "../targets";
import type { ObjectId } from "../types";

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
    if (!hit || s.objects[hit]?.zone !== "exile") return;
    if (e.store) {
      r.vars[`$ids:${e.store}`] = [hit];
      store(r, e.store, 1);
    }
    const answer = r.vars[key("cast")];
    if (!answer) {
      return {
        ask: {
          player: p,
          key: key("cast"),
          request: {
            type: "yesNo",
            intent: "discover",
            prompt: `Découverte : lancer ${nameOf(s, hit)} sans payer son coût de mana ? (Sinon, elle va dans votre main.)`,
            suggested: [1],
          },
        },
      };
    }
    // Approximation (comme les autres « lancez-la sans payer ») : lançable gratuitement, à tout moment, jusqu'à la fin
    // du tour ; si elle n'a pas été lancée, elle va en main au début du tour suivant.
    if (answer[0] === 1) grantPlay(s, p, [hit], "thisTurn", { free: true, anyTime: true, source: ctx.sourceId, orHand: true });
    else moveObject(s, hit, "hand");
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
  counter(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) counterItem(s, id, ctx.sourceDefId, e.exile);
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
    if (life) loseLife(s, p, life);
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
    const ids = resolveRef(s, ctx, e.what).filter((id) => s.objects[id]?.zone === "graveyard");
    s.turn.mayCastFromGraveyard = [...(s.turn.mayCastFromGraveyard ?? []), ...ids];
    return;
  },
  nextSpellUncounterable(s, _r, _e, ctx) {
    const p = s.players[ctx.controller];
    if (p) p.nextSpellUncounterableTurn = s.turn.number;
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
    const ids = resolveRef(s, ctx, e.what).filter((id) => s.objects[id]?.zone === "graveyard");
    s.turn.flashbackGranted = [...(s.turn.flashbackGranted ?? []), ...ids];
    if (e.free) s.turn.freeFlashbackGranted = [...(s.turn.freeFlashbackGranted ?? []), ...ids];
    return;
  },
  plot(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) plotCard(s, id);
    return;
  },
  copyNextExhaust(s, _r, _e, ctx) {
    const pl = s.players[ctx.controller];
    if (pl) pl.copyNextExhaustTurn = s.turn.number;
    return;
  },
  copySpell(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.count);
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id);
      if (!item) continue;
      for (let i = 0; i < n; i++) {
        if (item.kind === "spell") copySpellItem(s, item, ctx.controller);
        // Copie d'une capacité activée ou déclenchée (Return the Favor, Ertha Jo) : mêmes cibles.
        else
          s.stack.push({ ...item, id: newId(s, "copy"), controller: ctx.controller, copy: true, targets: { ...item.targets } });
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
  exileOnResolve(_s, r) {
    r.item.flashback = true;
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
  nextCreatureSpell(s, _r, e, ctx) {
    s.nextCreatureSpell = [
      ...(s.nextCreatureSpell ?? []),
      { player: ctx.controller, turn: s.turn.number, counters: e.counters, haste: e.haste },
    ];
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
  copyNextSpell(s, _r, _e, ctx) {
    s.nextSpellCopies = [...(s.nextSpellCopies ?? []), { player: ctx.controller, turn: s.turn.number }];
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
        grantPlay(s, owner, [id], e.forever ? "forever" : "thisTurn", {
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
    // totale limitée). Approximation : les copies choisies se lancent gratuitement ce tour-ci, à tout moment.
    const cards = [...new Set(e.what.flatMap((w) => resolveRef(s, ctx, w)))].filter((id) => !!s.objects[id]);
    if (cards.length === 0) return;
    const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
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
    let total = 0;
    const copies: string[] = [];
    for (const id of answer.map(String)) {
      const o = s.objects[id];
      if (!o || !cards.includes(id) || total + mv(id) > e.maxTotalManaValue) continue;
      total += mv(id);
      const copy = createObject(s, o.defId, ctx.controller, "exile");
      copy.cardCopy = true;
      copies.push(copy.id);
    }
    grantPlay(s, ctx.controller, copies, "thisTurn", { free: true, anyTime: true });
    return;
  },
};
