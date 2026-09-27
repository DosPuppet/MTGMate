/** Effets du moteur : contrôle du déroulement (si, peut, réflexif, retardé). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */
import { loseLife } from "../actions";
import type { OpHandlers } from "../effects";
import { evalAmount, evalCondition, nameOf, resolveRef, store } from "../effects";
import { canPay, payMana } from "../mana";
import { isPlayer } from "../state";
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
          request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
        },
      };
    }
    if (answer[0] !== 1 || !canPay(s, ctx.controller, e.cost)) return { skip: e.skip };
    if (e.life && (s.players[ctx.controller]?.life ?? 0) < e.life) return { skip: e.skip };
    payMana(s, ctx.controller, e.cost);
    if (e.life) loseLife(s, ctx.controller, e.life);
    return;
  },
  if(s, _r, e, ctx) {
    return evalCondition(s, ctx, e.cond) ? undefined : { skip: e.skip };
  },
  delayed(s, _r, e, ctx) {
    const bound: Record<string, string[]> = {};
    for (const [k, ref] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, ref);
    // Valeurs figées maintenant (« avec un marqueur de moins »), lues ensuite avec amount.v(nom).
    const vars: Record<string, ChoiceValue[]> = {};
    for (const [k, a] of Object.entries(e.vars ?? {})) vars[`$${k}`] = [evalAmount(s, ctx, a)];
    createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: [], effects: e.effects, bound, vars }, e.at);
    return;
  },
  reflexive(s, _r, e, ctx) {
    pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, { targets: e.targets, effects: e.effects });
    return;
  },
  may(s, r, e, ctx, key) {
    // « [Ce joueur] peut… » : la question est posée au joueur désigné (un adversaire, Terrapact Intimidator).
    const asked = e.who ? (resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) ?? ctx.controller) : ctx.controller;
    const answer = r.vars[key("may")];
    if (!answer) {
      return {
        ask: {
          player: asked,
          key: key("may"),
          request: { type: "yesNo", intent: "may", prompt: `${nameOf(s, ctx.sourceId)} : ${e.prompt}`, suggested: [1] },
        },
      };
    }
    if (e.store) store(r, e.store, answer[0] === 1 ? 1 : 0);
    return answer[0] === 1 ? undefined : { skip: e.skip };
  },
};
