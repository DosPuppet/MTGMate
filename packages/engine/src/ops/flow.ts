/** Engine effects: flow control (if, may, reflexive, delayed). Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */
import { canForage, forage, payLife } from "../actions";
import type { OpHandlers } from "../effects";
import { concreteSpec, evalAmount, evalCondition, nameOf, nextTurnOf, resolveRef, store } from "../effects";
import { RulesError } from "../errors";
import { canPay, manaValue, payMana } from "../mana";
import { beholdOptions, collectEvidence, pickEvidence } from "../stack";
import { emit, isPlayer } from "../state";
import { payableLife } from "../statics";
import { msg } from "../text";
import { createDelayed, pushInline } from "../triggers";
import type { ChoiceValue } from "../types";

export const HANDLERS: OpHandlers = {
  mayPay(s, r, e, ctx, key) {
    if (!canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
    const answer = r.vars[key("pay")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("pay"),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: msg("{card}: {prompt}", { card: nameOf(s, ctx.sourceId), prompt: e.prompt }),
            suggested: [1],
          },
        },
      };
    }
    if (answer[0] !== 1 || !canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
    const life = e.lifeAmount !== undefined ? Math.max(0, evalAmount(s, ctx, e.lifeAmount)) : e.life;
    if (life && payableLife(s, ctx.controller) < life) return { skip: e.skip };
    payMana(s, ctx.controller, e.cost);
    if (life) payLife(s, ctx.controller, life);
    return;
  },
  forage(s, r, e, ctx, key) {
    // "You may forage. If you do, …" (701.61).
    if (!canForage(s, ctx.controller)) return { skip: e.skip };
    const answer = r.vars[key("forage")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("forage"),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: msg("{card}: forage (exile three cards from your graveyard or sacrifice a Food)?", {
              card: nameOf(s, ctx.sourceId),
            }),
            suggested: [1],
          },
        },
      };
    }
    if (answer[0] !== 1 || !forage(s, ctx.controller)) return { skip: e.skip };
    return;
  },
  collectEvidence(s, r, e, ctx, key) {
    const excluded = new Set(e.exclude ? resolveRef(s, ctx, e.exclude) : []);
    const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const pool = (s.players[ctx.controller]?.graveyard ?? []).filter((id) => !excluded.has(id)).sort((a, b) => mv(b) - mv(a));
    const total = pool.reduce((n, id) => n + mv(id), 0);
    let n: number;
    if (e.n === undefined) {
      // Collect evidence X: X is chosen (0: nothing).
      const answer = r.vars[key("x")];
      if (!answer) {
        if (total <= 0) return { skip: e.skip };
        return {
          ask: {
            player: ctx.controller,
            key: key("x"),
            request: {
              type: "number",
              intent: "payX",
              prompt: msg("{card}: collect evidence X (0: no)?", { card: nameOf(s, ctx.sourceId) }),
              min: 0,
              max: total,
              suggested: [total],
            },
          },
        };
      }
      n = Math.min(total, Math.max(0, Number(answer[0])));
      if (n <= 0) return { skip: e.skip };
    } else {
      n = evalAmount(s, ctx, e.n);
      if (total < n) return { skip: e.skip };
      const answer = r.vars[key("may")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("may"),
            request: {
              type: "yesNo",
              intent: "may",
              prompt: msg(
                "{card}: collect evidence {n} (exile cards with total mana value {n} or greater from your graveyard)?",
                { card: nameOf(s, ctx.sourceId), n },
              ),
              suggested: [1],
            },
          },
        };
      }
      if (answer[0] !== 1) return { skip: e.skip };
    }
    // The exiled cards are chosen by the player (by default: the cheapest set that suffices); if their total does not
    // reach N, the engine's choice completes it.
    const suggested = pickEvidence(s, pool, n) ?? [];
    let chosen = suggested;
    if (suggested.length < pool.length) {
      const answer = r.vars[key("evidence")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("evidence"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: msg("{card}: collect evidence {n} — cards in your graveyard to exile (total mana value {n} or greater)", {
                card: nameOf(s, ctx.sourceId),
                n,
              }),
              options: pool,
              min: 1,
              max: pool.length,
              suggested,
            },
          },
        };
      }
      const picked = [...new Set(answer.map(String).filter((id) => pool.includes(id)))];
      const total = picked.reduce((t, id) => t + mv(id), 0);
      chosen =
        total >= n
          ? picked
          : [
              ...picked,
              ...(pickEvidence(
                s,
                pool.filter((id) => !picked.includes(id)),
                n - total,
              ) ?? []),
            ];
    }
    collectEvidence(s, ctx.controller, chosen);
    store(r, e.store, n);
    return;
  },
  if(s, _r, e, ctx) {
    return evalCondition(s, ctx, e.cond) ? undefined : { skip: e.skip };
  },
  delayed(s, _r, e, ctx) {
    const bound: Record<string, string[]> = {};
    for (const [k, ref] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, ref);
    // Values frozen now ("with one fewer counter"), read later with amount.v(name).
    const vars: Record<string, ChoiceValue[]> = {};
    for (const [k, a] of Object.entries(e.vars ?? {})) vars[`$${k}`] = [evalAmount(s, ctx, a)];
    const ability = { targets: e.targets ?? [], effects: e.effects, bound, vars, ...(e.label ? { label: e.label } : {}) };
    // "When [this object] … this turn": the watched objects are designated now.
    const watch = e.watch ? resolveRef(s, ctx, e.watch) : undefined;
    if (watch?.length === 0) return;
    // "Until the end of that player's next turn" (the first watched player).
    const until = e.until === "theirNextTurn" && watch?.[0] && s.players[watch[0]] ? nextTurnOf(s, watch[0]) : undefined;
    const event = e.on
      ? { on: e.on, ...(watch ? { watch } : {}), ...(until !== undefined ? { untilTurn: until } : {}) }
      : undefined;
    createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, ability, e.at, event);
    return;
  },
  reflexive(s, r, e, ctx) {
    // Values evaluated now: "up to X targets" (Miasma Demon), "with mana value equal to the number of coin counters"
    // (Wishing Well), "with total mana value X or less" (Fire Lord Sozin).
    const targets2 = e.targets.map((t) => concreteSpec(s, ctx, t));
    // No possible target (X = 0): nothing happens.
    if (targets2.some((t) => t.count === 0)) return;
    const bound: Record<string, string[]> = {};
    for (const [k, r] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, r);
    const kept = e.keepVars ? Object.fromEntries(e.keepVars.map((k) => [`$${k}`, r.vars[`$${k}`] ?? []])) : undefined;
    // Values frozen now, read later with amount.v(name) (as for a delayed ability).
    const frozen = e.vars
      ? Object.fromEntries(Object.entries(e.vars).map(([k, a]) => [`$${k}`, [evalAmount(s, ctx, a)]]))
      : undefined;
    const vars = kept || frozen ? { ...kept, ...frozen } : undefined;
    pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, {
      targets: targets2,
      effects: e.effects,
      bound,
      ...(vars ? { vars } : {}),
      ...(e.modes ? { modes: e.modes } : {}),
    });
    return;
  },
  behold(s, r, e, ctx, key) {
    const options = beholdOptions(s, ctx.controller, ctx.sourceId, e.filter);
    if (options.length === 0) return { skip: e.skip };
    const answer = r.vars[key("behold")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("behold"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: msg("{card}: you may behold (a permanent, or a revealed card from your hand)", {
              card: nameOf(s, ctx.sourceId),
            }),
            options,
            min: 0,
            max: 1,
            suggested: options.slice(0, 1),
          },
        },
      };
    }
    const chosen = answer.map(String).find((id) => options.includes(id));
    if (!chosen) return { skip: e.skip };
    if (s.objects[chosen]?.zone === "hand")
      emit({ type: "reveal", player: ctx.controller, defIds: [s.objects[chosen]?.defId ?? ""] });
    return;
  },
  chooseOption(s, r, e, ctx, key) {
    const answer = r.vars[key("option")];
    const options = e.labels.map((_, i) => String(i));
    // Expropriate: another player chooses (vote); with no designated player left in the game, nothing is chosen.
    const chooser = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x) && !s.players[x]?.lost) : ctx.controller;
    if (!chooser) return;
    if (!answer) {
      return {
        ask: {
          player: chooser,
          key: key("option"),
          request: {
            type: "pick",
            intent: "other",
            prompt: msg("{card}: {prompt}", { card: nameOf(s, ctx.sourceId), prompt: e.prompt }),
            options,
            labels: Object.fromEntries(e.labels.map((l, i) => [String(i), l])),
            min: 1,
            max: 1,
            suggested: ["0"],
          },
        },
      };
    }
    const i = options.indexOf(String(answer[0]));
    if (i < 0) throw new RulesError(msg("Unknown option"));
    store(r, e.store, i + 1);
    return;
  },
  may(s, r, e, ctx, key) {
    // "[That player] may…": the question is asked to the designated player (an opponent, Terrapact Intimidator).
    const asked = e.who ? (resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) ?? ctx.controller) : ctx.controller;
    const answer = r.vars[key("may")];
    if (!answer) {
      return {
        ask: {
          player: asked,
          key: key("may"),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: msg("{card}: {prompt}", { card: nameOf(s, ctx.sourceId), prompt: e.prompt }),
            suggested: [1],
          },
        },
      };
    }
    if (e.store) store(r, e.store, answer[0] === 1 ? 1 : 0);
    return answer[0] === 1 ? undefined : { skip: e.skip };
  },
};
