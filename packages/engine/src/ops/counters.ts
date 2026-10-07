/** Effets du moteur : marqueurs, niveaux, stations, portes. Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { createTokens } from "../actions";
import { cardRef } from "../choices";
import { counterLabel } from "../counterLabels";
import type { OpHandlers } from "../effects";
import { addEffect, evalAmount, resolveRef, store } from "../effects";
import { RulesError } from "../errors";
import { effectivePower } from "../layers";
import { blightTarget } from "../stack";
import {
  bump,
  changeCounters,
  chars,
  counterCount,
  emit,
  isCreature,
  isRoom,
  onBattlefield,
  P1P1,
  rulesEvent,
  unlockDoor,
} from "../state";
import { matchesObjectFilter } from "../targets";
import type { GameObject, ObjectId, TokenSpec } from "../types";

/** Jeton de l'endurance (701.64) : Esprit blanc N/N. */
const ENDURE_SPIRIT: TokenSpec = {
  name: "Spirit",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Spirit"],
  power: 0,
  toughness: 0,
};

/** Ordre proposé par défaut : loyauté, +1/+1, puis les autres sortes. */
const DEFAULT_ORDER = (kinds: string[]): string[] => [
  ...["loyalty", "+1/+1"].filter((k) => kinds.includes(k)),
  ...kinds.filter((k) => k !== "loyalty" && k !== "+1/+1"),
];

export const HANDLERS: OpHandlers = {
  countersAboveBase(s, _r, e, ctx) {
    // Les écarts sont mesurés d'abord, puis les marqueurs sont posés.
    const gaps = s.battlefield
      .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId))
      .map((id) => {
        const c = chars(s, id);
        return [id, c.power - (c.basePower ?? c.power)] as const;
      });
    for (const [id, n] of gaps) {
      const o = s.objects[id];
      if (o && n > 0) changeCounters(s, o, "+1/+1", n);
    }
    return;
  },
  doubleCounters(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (!e.all) changeCounters(s, o, P1P1, counterCount(o, P1P1));
      else for (const [kind, n] of Object.entries({ ...o.counters })) if (n > 0) changeCounters(s, o, kind, n);
    }
    return;
  },
  counterOnOrCreate(s, _r, e, ctx) {
    // Renforcer Jace (un jeton Jace), amasser (une Armée) : le premier permanent correspondant du joueur, sinon un jeton
    // créé d'abord ; puis les marqueurs, et les sous-types en plus (701.47a).
    const n = Math.max(0, evalAmount(s, ctx, e.amount));
    for (const p of resolveRef(s, ctx, e.who).filter((x) => !!s.players[x])) {
      let id = s.battlefield.find((x) => s.objects[x]?.controller === p && matchesObjectFilter(s, p, x, e.find));
      if (!id) id = createTokens(s, p, e.token, 1)[0];
      const o = id ? s.objects[id] : undefined;
      if (!o) continue;
      if (n > 0) changeCounters(s, o, e.kind, n);
      const missing = (e.addSubtypes ?? []).filter((t) => !chars(s, o.id).subtypes.includes(t));
      if (missing.length) addEffect(s, [o.id], { addSubtypes: missing }, "permanent");
    }
    return;
  },
  proliferate(s, r, e, ctx, key) {
    // 701.34a : choisissez des permanents et/ou joueurs qui ont des marqueurs ; chacun reçoit un marqueur de plus de
    // chaque sorte qu'il a déjà. Suggestion (automatisme, IA) : vos permanents sans marqueur nuisible, et les
    // marqueurs nuisibles (-1/-1, étourdissement, poison) de vos adversaires.
    const times = evalAmount(s, ctx, e.times);
    const bad = new Set(["-1/-1", "stun"]);
    for (let t = 0; t < times; t++) {
      if (r.vars[key(`done${t}`)]) continue;
      const withCounters = s.battlefield.filter((id) => Object.values(s.objects[id]?.counters ?? {}).some((n) => n > 0));
      // Joueurs avec des marqueurs poison ou de radiation (Fallout).
      const poisoned = s.playerOrder.filter(
        (p) => !s.players[p]?.lost && ((s.players[p]?.counters?.poison ?? 0) > 0 || (s.players[p]?.counters?.rad ?? 0) > 0),
      );
      const options = [...withCounters, ...poisoned];
      if (options.length === 0) return;
      // Powerful Broker : « donnez au permanent ou joueur ciblé un marqueur de plus de chaque sorte » (sans choix).
      if (e.what && !r.vars[key(`pick${t}`)])
        r.vars[key(`pick${t}`)] = resolveRef(s, ctx, e.what).filter((x) => options.includes(x));
      const answer = r.vars[key(`pick${t}`)];
      if (!answer) {
        const good = (id: string) => {
          const o = s.objects[id];
          if (!o) return false;
          const kinds = Object.entries(o.counters)
            .filter(([, n]) => n > 0)
            .map(([k]) => k);
          return o.controller === ctx.controller ? kinds.every((k) => !bad.has(k)) : kinds.every((k) => bad.has(k));
        };
        const suggested = [...withCounters.filter(good), ...poisoned.filter((p) => p !== ctx.controller)];
        return {
          ask: {
            player: ctx.controller,
            key: key(`pick${t}`),
            request: {
              type: "pick",
              intent: "proliferate",
              prompt: "Proliférer : choisissez les permanents et joueurs qui reçoivent un marqueur de plus",
              options,
              min: 0,
              max: options.length,
              suggested,
              autoOk: true,
            },
          },
        };
      }
      for (const v of answer.map(String)) {
        const o = s.objects[v];
        if (o?.zone === "battlefield") {
          for (const [kind, n] of Object.entries(o.counters)) if (n > 0) changeCounters(s, o, kind, 1);
        } else {
          const pl = s.players[v];
          const counters = pl?.counters;
          if (counters && (counters.poison ?? 0) > 0) {
            counters.poison = (counters.poison ?? 0) + 1;
            bump(s); // corrompu : des statiques en dépendent
          }
          if (counters && (counters.rad ?? 0) > 0) {
            counters.rad = (counters.rad ?? 0) + 1;
            bump(s); // des statiques en dépendent (Nightkin Ambusher)
            emit({ type: "rad", player: v, amount: 1, total: counters.rad });
          }
        }
      }
      r.vars[key(`done${t}`)] = [1];
    }
    return;
  },
  removeCounters(s, r, e, ctx, key) {
    // « Retirez N marqueurs » sans sorte imposée : le joueur choisit la sorte de chacun (une question par marqueur, tant
    // qu'il reste plusieurs sortes), avant tout retrait ; l'opération est rejouée avec les réponses.
    const plans: [GameObject, string[]][] = [];
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      // Une carte suspendue perd ses marqueurs de temps en exil (702.62).
      if (o?.zone !== "battlefield" && !(o?.zone === "exile" && o.suspended)) continue;
      const n = Math.max(0, evalAmount(s, ctx, e.n));
      const left: Record<string, number> = e.kind
        ? { [e.kind]: o.counters[e.kind] ?? 0 }
        : (Object.fromEntries(Object.entries(o.counters).filter(([, c]) => (c ?? 0) > 0)) as Record<string, number>);
      const plan: string[] = [];
      for (let i = 0; i < n; i++) {
        const kinds = DEFAULT_ORDER(Object.keys(left).filter((k) => (left[k] ?? 0) > 0));
        if (kinds.length === 0) break;
        let kind = kinds[0] as string;
        // Tous les marqueurs restants partent (« retirez tous les marqueurs ») : aucun choix à faire.
        const remaining = Object.values(left).reduce((a, c) => a + Math.max(0, c ?? 0), 0);
        if (kinds.length > 1 && n - i < remaining) {
          const k = key(`rc-${id}-${i}`);
          const answer = r.vars[k];
          if (!answer) {
            return {
              ask: {
                player: ctx.controller,
                key: k,
                request: {
                  type: "pick",
                  intent: "other",
                  prompt: `${cardRef(o.defId)} : quel marqueur retirer${n > 1 ? ` (${i + 1} sur ${n})` : ""} ?`,
                  options: kinds,
                  labels: Object.fromEntries(kinds.map((x) => [x, `${counterLabel(x)} (${left[x]})`])),
                  min: 1,
                  max: 1,
                  suggested: [kind],
                },
              },
            };
          }
          const picked = String(answer[0]);
          if (!kinds.includes(picked)) throw new RulesError("Sorte de marqueur invalide");
          kind = picked;
        }
        plan.push(kind);
        left[kind] = (left[kind] ?? 0) - 1;
      }
      plans.push([o, plan]);
    }
    let removed = 0;
    for (const [o, plan] of plans) {
      const counts: Record<string, number> = {};
      for (const kind of plan) counts[kind] = (counts[kind] ?? 0) + 1;
      for (const [kind, take] of Object.entries(counts)) {
        changeCounters(s, o, kind, -take);
        removed += take;
      }
    }
    // Garnet : « un marqueur +1/+1 pour chaque marqueur de savoir retiré ainsi ».
    store(r, e.store, removed);
    return;
  },
  endure(s, r, e, ctx, key) {
    // 701.64 : « [ce permanent] endure N » : N marqueurs +1/+1 sur lui, ou un jeton Esprit blanc N/N. S'il n'est plus sur
    // le champ de bataille, le jeton est créé ; endurer 0 ne fait rien.
    const n = evalAmount(s, ctx, e.amount);
    if (n <= 0) return;
    const id = resolveRef(s, ctx, e.what).find((x) => s.objects[x]?.zone === "battlefield");
    const o = id ? s.objects[id] : undefined;
    let choice = o ? undefined : "token";
    if (o) {
      const answer = r.vars[key("endure")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("endure"),
            request: {
              type: "pick",
              intent: "other",
              prompt: `Endurance ${n} : ${n} marqueur${n > 1 ? "s" : ""} +1/+1 sur ${cardRef(o.defId)}, ou un Esprit ${n}/${n} ?`,
              options: ["counters", "token"],
              labels: { counters: `${n} marqueur${n > 1 ? "s" : ""} +1/+1`, token: `Un jeton Esprit ${n}/${n}` },
              min: 1,
              max: 1,
              suggested: ["counters"],
            },
          },
        };
      }
      choice = String(answer[0]);
    }
    if (choice === "counters" && o) changeCounters(s, o, P1P1, n);
    else createTokens(s, ctx.controller, { ...ENDURE_SPIRIT, power: n, toughness: n }, 1, true);
    return;
  },
  addCounters(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") changeCounters(s, o, e.kind ?? P1P1, n);
    }
    return;
  },
  blight(s, r, e, ctx, key) {
    // Flétrir N (ECL) : chaque joueur désigné choisit une créature qu'il contrôle et y met N marqueurs −1/−1. Tous les
    // choix sont faits avant les marqueurs (une question en attente reprend l'effet depuis le début). `store` : 1 si
    // c'est fait, et les créatures flétries (`ref.stored`, « la créature flétrie »).
    const n = Math.max(0, evalAmount(s, ctx, e.amount));
    const picks: ObjectId[] = [];
    for (const p of resolveRef(s, ctx, e.who).filter((x) => !!s.players[x] && !s.players[x]?.lost)) {
      const options = s.battlefield.filter((id) => s.objects[id]?.controller === p && isCreature(s, id));
      if (options.length === 0 || n === 0) continue;
      if (options.length === 1) {
        picks.push(options[0] as ObjectId);
        continue;
      }
      const answer = r.vars[key(`blight-${p}`)];
      if (!answer) {
        return {
          ask: {
            player: p,
            key: key(`blight-${p}`),
            request: {
              type: "pick",
              intent: "other",
              prompt: `Flétrir ${n} : choisissez une créature que vous contrôlez (${n} marqueur(s) −1/−1)`,
              options,
              min: 1,
              max: 1,
              suggested: [blightTarget(s, p, n) ?? (options[0] as string)],
            },
          },
        };
      }
      picks.push(String(answer[0]));
    }
    const done: ObjectId[] = [];
    for (const id of picks) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      changeCounters(s, o, "-1/-1", n);
      done.push(id);
    }
    store(r, e.store, done.length ? 1 : 0);
    if (e.store) r.vars[`$ids:${e.store}`] = done;
    return;
  },
  countersDivided(s, r, e, ctx, key) {
    // Répartition annoncée à la mise sur la pile (601.2d) : la part d'une cible devenue illégale est perdue (608.2b).
    const total = evalAmount(s, ctx, e.total);
    const division = e.to.kind === "target" ? r.item.division?.[e.to.id] : undefined;
    if (division && e.to.kind === "target") {
      const legal = new Set(resolveRef(s, ctx, e.to));
      (r.item.targets[e.to.id] ?? []).forEach((id, i) => {
        const o = s.objects[id];
        if (o && legal.has(id) && onBattlefield(s, id)) changeCounters(s, o, e.counter ?? P1P1, division[i] ?? 0);
      });
      return;
    }
    const among = resolveRef(s, ctx, e.to).filter((id) => onBattlefield(s, id));
    if (among.length === 0) return;
    let split: number[];
    if (among.length === 1 && !e.anyNumber) split = [total];
    else {
      const answer = r.vars[key("cdivide")];
      if (!answer) {
        const each = Math.floor(total / among.length);
        return {
          ask: {
            player: ctx.controller,
            key: key("cdivide"),
            request: {
              type: "divide",
              intent: "divideCounters",
              prompt: `Répartissez ${total} marqueurs ${e.counter ?? P1P1} entre ${e.anyNumber ? "ces créatures" : "les cibles"}`,
              among,
              total: total,
              // 601.2d : au moins un marqueur par cible ; avec moins de marqueurs que de cibles (X réduit), sans minimum.
              minEach: !e.anyNumber && total >= among.length ? 1 : 0,
              suggested: among.map((_, i) => each + (i < total - each * among.length ? 1 : 0)),
            },
          },
        };
      }
      split = answer.map(Number);
    }
    among.forEach((id, i) => {
      const o = s.objects[id];
      if (o) changeCounters(s, o, e.counter ?? P1P1, split[i] ?? 0);
    });
    return;
  },
  station(s, _r, _e, ctx) {
    // 702.184a : des marqueurs de charge égaux à la force de la créature engagée (Tapestry Warden : son endurance si
    // elle est plus grande).
    const o = s.objects[ctx.sourceId];
    const tapped = ctx.paid?.tapped?.[0];
    if (o?.zone !== "battlefield" || !tapped) return;
    const c = s.objects[tapped] ? chars(s, tapped) : s.lki[tapped];
    if (!c) return;
    const n = Math.max(0, effectivePower(c as { power: number; toughness: number }, "station"));
    if (n > 0) changeCounters(s, o, "charge", n);
    return;
  },
  setClassLevel(s, _r, e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || (o.classLevel ?? 1) >= e.level) return;
    o.classLevel = e.level;
    bump(s);
    rulesEvent(s, { e: "classLevel", objectId: o.id, level: e.level });
    return;
  },
  solveCase(s, _r, _e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.solved) return;
    o.solved = true;
    bump(s);
    rulesEvent(s, { e: "caseSolved", player: o.controller, objectId: o.id });
    return;
  },
  moveCounter(s, r, e, ctx, key) {
    const from = resolveRef(s, ctx, e.from)
      .map((id) => s.objects[id])
      .find((o) => o?.zone === "battlefield");
    const to = resolveRef(s, ctx, e.to)
      .map((id) => s.objects[id])
      .find((o) => o?.zone === "battlefield");
    if (!from || !to || from === to) return;
    const kinds = Object.keys(from.counters).filter((k) => (from.counters[k] ?? 0) > 0);
    if (kinds.length === 0) return;
    let kind = kinds[0] as string;
    if (kinds.length > 1) {
      const answer = r.vars[key("kind")];
      if (!answer)
        return {
          ask: {
            player: ctx.controller,
            key: key("kind"),
            request: {
              type: "pick",
              intent: "other",
              prompt: "Sorte du marqueur à déplacer",
              options: kinds,
              labels: Object.fromEntries(kinds.map((k) => [k, counterLabel(k)])),
              min: 1,
              max: 1,
              suggested: [kinds.includes("+1/+1") ? "+1/+1" : (kinds[0] as string)],
            },
          },
        };
      const chosen = String(answer[0]);
      if (!kinds.includes(chosen)) throw new RulesError("Sorte de marqueur invalide");
      kind = chosen;
    }
    changeCounters(s, from, kind, -1);
    changeCounters(s, to, kind, 1);
    return;
  },
  lkiCountersTo(s, _r, e, ctx) {
    const from = ctx.event?.objectId;
    const counters = from ? s.lki[from]?.counters : undefined;
    if (!counters) return;
    for (const id of resolveRef(s, ctx, e.to)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      for (const [kind, n] of Object.entries(counters)) if (n > 0) changeCounters(s, o, kind, n);
    }
    return;
  },
  door(s, r, e, ctx, key) {
    if (r.vars[key("doorDone")]) return;
    const options: string[] = [];
    const labels: Record<string, string> = {};
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const faces = s.defs[o?.defId ?? ""]?.faceDefs ?? [];
      if (o?.zone !== "battlefield" || !isRoom(s.defs[o.defId])) continue;
      faces.forEach((f, door) => {
        const open = !!o.unlocked?.includes(door);
        if (e.mode === "unlock" && open) return;
        const opt = `${id}#${door}`;
        options.push(opt);
        labels[opt] = `${open ? "Verrouiller" : "Déverrouiller"} ${f.name}`;
      });
    }
    if (options.length === 0) return;
    let chosen = options[0] as string;
    if (options.length > 1) {
      const answer = r.vars[key("door")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("door"),
            request: {
              type: "pick",
              intent: "other",
              prompt: e.mode === "unlock" ? "Porte à déverrouiller" : "Porte à verrouiller ou à déverrouiller",
              options,
              labels,
              min: 1,
              max: 1,
              suggested: [options.find((o) => labels[o]?.startsWith("Déverrouiller")) ?? chosen],
            },
          },
        };
      }
      chosen = String(answer[0]);
    }
    r.vars[key("doorDone")] = [1];
    const [id = "", door = "0"] = chosen.split("#");
    const o = s.objects[id];
    if (!o) return;
    if (o.unlocked?.includes(Number(door))) {
      // 709.5g : verrouiller une porte ne déclenche rien ; elle pourra être déverrouillée de nouveau.
      o.unlocked = o.unlocked.filter((d) => d !== Number(door));
      bump(s);
    } else unlockDoor(s, id, Number(door));
    return;
  },
  unlockDoor(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) unlockDoor(s, id, e.door);
    return;
  },
};
