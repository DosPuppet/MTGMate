/** Effets du moteur : déplacements entre zones (détruire, exiler, sacrifier, chercher, meuler, défausser…). Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { dealDamage, destroy, drawCards, sacrifice } from "../actions";
import { cardRef } from "../choices";
import type { EffectContext, OpHandlers, OpResult } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  damageSource,
  evalAmount,
  evalMoveSpec,
  grantPlay,
  millCards,
  moveAndLog,
  moveDiscarded,
  moveWithSpec,
  nameOf,
  putFaceDown,
  readVar,
  resolveRef,
  store,
  viewOf,
  withX,
  zoneCards,
} from "../effects";
import { RulesError } from "../errors";
import { hasKeyword } from "../layers";
import { manaValue } from "../mana";
import { chooseReplacementOrder } from "../modifiers";
import { asEntersChoices, auraHosts, type EntersContext } from "../replacement";
import { bounceSpell, exileSpell, spellToZone } from "../stack";
import {
  apnapOrder,
  bent,
  bump,
  changeCounters,
  chars,
  createObject,
  emit,
  isCreature,
  isPlayer,
  moveObject,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  P1P1,
  random,
  registerDef,
  removeFromGame,
  rulesEvent,
  shuffle,
  tapObject,
  turnFaceUp,
  untapObject,
} from "../state";
import { payableLife, playerStatic, quantityMods, recipientMatches } from "../statics";
import { holderOf, matchesCard, matchesObjectFilter, shareCreatureType } from "../targets";
import { logTurnEvent } from "../turnlog";
import type { CardType, Effect, GameState, MoveSpec, ObjectFilter, ObjectId, PlayerId, Resolution } from "../types";
import { PERMANENT_TYPES } from "../types";
import { chooseAttacked } from "./permanents";

/** Noms français des types de permanent (questions de `keep`). */
const TYPE_LABEL: Partial<Record<CardType, string>> = {
  Artifact: "artefact",
  Creature: "créature",
  Enchantment: "enchantement",
  Land: "terrain",
  Planeswalker: "planeswalker",
  Battle: "bataille",
};

/** Le joueur qui contrôlera l'objet mis sur le champ de bataille : vous, ou son propriétaire. */
const ownerOr =
  (s: GameState, spec: MoveSpec, you: PlayerId) =>
  (id: ObjectId): PlayerId =>
    spec.underYourControl ? you : (s.objects[id]?.owner ?? you);

/** Choix d'arrivée d'un objet mis sur le champ de bataille par un effet (terrain choc, défenseur, effets « en arrivant »). */
type Arrival = Partial<EntersContext>;

/**
 * Choix d'arrivée des objets mis sur le champ de bataille par un effet, demandés au joueur qui les contrôlera avant tout
 * déplacement (l'opération est rejouée avec la réponse) : terrains choc (« en arrivant, vous pouvez payer 2 points de vie ;
 * sinon, il arrive engagé ») ; effets « en arrivant » (614.1c, 614.12 : `asEntersChoices`, comme pour un sort de permanent
 * qui se résout ; aucun pour un permanent mis face cachée, 708.2) ; ce qu'attaque un permanent mis sur le champ de bataille
 * attaquant (508.4). `random` : après un tirage au hasard, qui ne serait pas rejoué, aucune question (pas de points de vie
 * payés, les réponses suggérées). Renvoie la question à poser, sinon les choix de chaque objet.
 */
function arrivalChoices(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  ids: readonly ObjectId[],
  spec: MoveSpec,
  controllerOf: (id: ObjectId) => PlayerId,
  key: (k: string) => string,
  random = false,
): Extract<OpResult, { ask: unknown }> | Map<ObjectId, Arrival> {
  const out = new Map<ObjectId, Arrival>();
  if (spec.to !== "battlefield") return out;
  const designated = typeof spec.attacking === "object" ? resolveRef(s, ctx, spec.attacking) : undefined;
  for (const id of ids) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    const who = controllerOf(id);
    const n = d?.shockLand;
    if (d && n && !random && !spec.tapped && spec.as !== "cloak" && payableLife(s, who) >= n) {
      const k = key(`shock-${id}`);
      const answer = r.vars[k];
      if (!answer) {
        return {
          ask: {
            player: who,
            key: k,
            request: {
              type: "yesNo",
              intent: "may",
              prompt: `${cardRef(d.id)} : payer ${n} points de vie pour qu'il arrive dégagé ?`,
              suggested: [payableLife(s, who) > 2 * n + 4 ? 1 : 0],
            },
          },
        };
      }
      if (answer[0] === 1) out.set(id, { shockPaid: true });
    }
    if (d && !spec.as) {
      // La face qui arrive : le verso d'une carte transformable mise sur le champ de bataille transformée (712.14).
      const face = spec.transformed && d.layout === "transform" ? (d.faceDefs?.[1] ?? d) : d;
      const entering = { id, defId: face.id, controller: who };
      const res = asEntersChoices(s, r.vars, entering, key(`enter-${id}:`), random ? "auto" : "ask");
      if ("ask" in res) return res;
      out.set(id, { ...out.get(id), ...res });
    }
    if (d && spec.attacking && !spec.as) {
      const prompt = `${cardRef(d.id)} : que doit-il attaquer ?`;
      const c = chooseAttacked(s, r, ctx, key(`attack-${id}`), who, designated, prompt, { ask: !random });
      if ("ask" in c) return c;
      out.set(id, { ...out.get(id), attacking: c.defender });
    }
  }
  return out;
}

/** Chaque carte reçoit un type de carte qu'elle a, tous différents (couplage, au plus dix cartes) : possible ? */
function assignTypes(s: GameState, ids: ObjectId[]): boolean {
  const types = (id: ObjectId) => s.defs[s.objects[id]?.defId ?? ""]?.types ?? [];
  const used = new Map<string, ObjectId>();
  const place = (id: ObjectId, seen: Set<string>): boolean => {
    for (const t of types(id)) {
      if (seen.has(t)) continue;
      seen.add(t);
      const holder = used.get(t);
      if (!holder || place(holder, seen)) {
        used.set(t, id);
        return true;
      }
    }
    return false;
  };
  return ids.every((id) => place(id, new Set()));
}

/** Suggestion « une carte par type » : les cartes dans l'ordre, tant qu'elles prennent un type encore libre. */
function greedyOnePerType(s: GameState, ids: ObjectId[]): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of ids) if (assignTypes(s, [...out, id])) out.push(id);
  return out;
}

/**
 * « Un adversaire … » sans le cibler, au milieu d'un effet (piles : celui qui sépare ou qui choisit) : le contrôleur le
 * choisit par `chooseAmong` (aucune question avec un seul adversaire ; suggestion : l'adversaire suivant).
 */
function opponentChoice(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: (k: string) => string,
  separates?: boolean,
): Extract<OpResult, { ask: unknown }> | { player: PlayerId | undefined } {
  const store = key("opponent");
  const res = HANDLERS.chooseAmong?.(
    s,
    r,
    {
      op: "chooseAmong",
      what: { kind: "eachOpponent" },
      chooser: { kind: "you" },
      store,
      prompt: `${nameOf(s, ctx.sourceId)} : choisissez l'adversaire qui ${separates ? "sépare les cartes en deux piles" : "choisit une des piles"}`,
    },
    ctx,
    (x) => key(`opponent-${x}`),
  );
  if (res && "ask" in res) return res;
  return { player: r.vars[`$ids:${store}`]?.map(String)[0] };
}

export const HANDLERS: OpHandlers = {
  destroy(s, r, e, ctx) {
    const stored: string[] = [];
    let destroyed = 0;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (destroy(s, id, e.noRegenerate, ctx.controller)) destroyed++;
      // Come Back Wrong, Zero Point Ballad : les cartes mises au cimetière de cette façon.
      const card = o && (s.players[o.owner]?.graveyard ?? []).find((x) => s.objects[x]?.uid === o.uid);
      if (card) stored.push(card);
    }
    store(r, e.store, destroyed);
    if (e.store) r.vars[`$ids:${e.store}`] = stored;
    return;
  },
  chooseAmong(s, r, e, ctx, key) {
    // Des objets, ou des joueurs (« choisissez un adversaire », sans le cibler : `fx.chooseOpponent`).
    const ids = resolveRef(s, ctx, e.what).filter((id) =>
      isPlayer(s, id) ? !s.players[id]?.lost : e.anyZone ? !!s.objects[id] : onBattlefield(s, id),
    );
    if (ids.length === 0) return;
    const players = ids.every((id) => isPlayer(s, id));
    const chooser = resolveRef(s, ctx, e.chooser).find((x) => isPlayer(s, x)) ?? ctx.controller;
    // « Un nombre quelconque » (Expose the Culprit) : de zéro à toutes.
    if (e.anyNumber) {
      const answer = r.vars[key("among")];
      if (!answer) {
        return {
          ask: {
            player: chooser,
            key: key("among"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: e.prompt ?? "Choisissez un nombre quelconque de ces créatures",
              options: ids,
              min: 0,
              max: ids.length,
              suggested: ids,
            },
          },
        };
      }
      const chosen = answer.map(String).filter((id) => ids.includes(id));
      r.vars[`$ids:${e.store}`] = chosen;
      r.vars[`$ids:${e.store}Rest`] = ids.filter((x) => !chosen.includes(x));
      return;
    }
    // « Jusqu'à un » : la question est posée même pour un seul objet, et peut rester sans réponse.
    if (e.optional) {
      const answer = r.vars[key("among")];
      if (!answer) {
        // Suggestion : d'abord un objet d'un autre joueur (Light of Judgment, The Legend of Yangchen) ; parmi les siens
        // seulement, le premier quand le joueur choisit pour son propre effet (champion, Deepfathom Echo), rien quand il
        // choisit pour l'effet d'un autre (un adversaire de The Legend of Yangchen n'exile pas l'un des siens).
        const others = ids.filter((id) => holderOf(s, id) !== chooser);
        const suggested = others.length > 0 ? others.slice(0, 1) : chooser === ctx.controller ? ids.slice(0, 1) : [];
        return {
          ask: {
            player: chooser,
            key: key("among"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: e.prompt ?? "Choisissez jusqu'à une de ces créatures",
              options: ids,
              min: 0,
              max: 1,
              suggested,
            },
          },
        };
      }
      const chosen = answer
        .map(String)
        .filter((id) => ids.includes(id))
        .slice(0, 1);
      r.vars[`$ids:${e.store}`] = chosen;
      r.vars[`$ids:${e.store}Rest`] = ids.filter((x) => !chosen.includes(x));
      return;
    }
    let picked = ids.length === 1 ? ids[0] : r.vars[key("among")]?.map(String)[0];
    // « … au hasard » (Indoraptor) : le tirage est gardé avec les réponses (la résolution reprise ne le refait pas) ; aucun
    // tirage pour une seule option.
    if (picked === undefined && e.random) {
      picked = ids[Math.floor(random(s) * ids.length)] as string;
      r.vars[key("among")] = [picked];
    }
    if (picked === undefined) {
      // Suggestion : un joueur, le premier désigné (l'adversaire suivant dans l'ordre du tour) ; un objet, celui qui a la
      // plus grande endurance.
      const suggested = players
        ? (ids[0] as string)
        : ([...ids].sort((a, b) => chars(s, b).toughness - chars(s, a).toughness)[0] as string);
      return {
        ask: {
          player: chooser,
          key: key("among"),
          request: {
            type: "pick",
            intent: players ? "other" : "pickCards",
            prompt: e.prompt ?? (players ? "Choisissez un joueur" : "Choisissez l'une de ces créatures"),
            options: ids,
            min: 1,
            max: 1,
            suggested: [suggested],
          },
        },
      };
    }
    picked = String(picked);
    r.vars[`$ids:${e.store}`] = [picked];
    r.vars[`$ids:${e.store}Rest`] = ids.filter((x) => x !== picked);
    return;
  },
  tapChosen(s, r, e, ctx, key) {
    const shared = e.sharesColorWith ? resolveRef(s, ctx, e.sharesColorWith).flatMap((id) => viewOf(s, id)?.colors ?? []) : null;
    const options = s.battlefield.filter(
      (id) =>
        s.objects[id]?.controller === ctx.controller &&
        !s.objects[id]?.tapped &&
        matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId) &&
        (!shared || chars(s, id).colors.some((c) => shared.includes(c))),
    );
    let chosen: string[] = [];
    if (e.exactly !== undefined && options.length < e.exactly) {
      store(r, e.store, 0);
      return;
    }
    if (options.length) {
      const answer = r.vars[key("tapChosen")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("tapChosen"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt:
                e.exactly !== undefined
                  ? `Vous pouvez engager ${e.exactly} permanents`
                  : "Permanents à engager (autant que vous voulez)",
              options,
              min: 0,
              max: e.exactly ?? options.length,
              suggested: e.exactly !== undefined ? options.slice(0, e.exactly) : options,
            },
          },
        };
      }
      chosen = answer.map(String).filter((id) => options.includes(id));
      if (e.exactly !== undefined && chosen.length !== 0 && chosen.length !== e.exactly)
        throw new RulesError(`Engagez exactement ${e.exactly} permanents, ou aucun`);
    }
    for (const id of chosen) {
      const o = s.objects[id];
      if (o) tapObject(s, o);
    }
    store(r, e.store, chosen.length);
    return;
  },
  millWhileShared(s, _r, e, ctx) {
    // On recommence tant que les deux cartes meulées partagent un type de carte ou une couleur (la bibliothèque, qui perd
    // deux cartes à chaque tour de boucle, la borne).
    const def = (id: ObjectId) => s.defs[s.objects[id]?.defId ?? ""];
    const traits = (id: ObjectId): string[] =>
      e.nonland && def(id)?.types.includes("Land") ? [] : e.share === "color" ? (def(id)?.colors ?? []) : (def(id)?.types ?? []);
    for (const p of e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller]) {
      for (;;) {
        const top = (s.players[p]?.library ?? []).slice(0, 2);
        if (top.length === 0) break;
        const [a, b] = top.map(traits);
        millCards(s, [[p, top]]);
        if (top.length < 2 || !a?.some((t) => b?.includes(t))) break;
        if (e.draw) drawCards(s, p, 1);
      }
    }
    return;
  },
  exileFromHandLinked(s, r, e, ctx, key) {
    const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
    if (!p) return;
    const fullHand = s.players[p]?.hand ?? [];
    // Taster of Wares : « révèle X cartes de sa main » ; le joueur choisit lesquelles (les moins chères suggérées).
    const n = e.reveal !== undefined ? Math.max(0, evalAmount(s, ctx, e.reveal)) : fullHand.length;
    let hand = fullHand;
    if (n < fullHand.length) {
      const shown = r.vars[key("reveal")];
      if (!shown) {
        if (n === 0) return;
        const cheap = [...fullHand].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
        );
        return {
          ask: {
            player: p,
            key: key("reveal"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: `Révélez ${n} carte(s) de votre main`,
              options: fullHand,
              min: n,
              max: n,
              suggested: cheap.slice(0, n),
            },
          },
        };
      }
      hand = shown.map(String).filter((id) => fullHand.includes(id));
      if (hand.length !== n) throw new RulesError(`Révélez exactement ${n} carte(s)`);
    }
    const options = hand.filter((id) => matchesCard(s, p, id, { ...e.filter, controller: undefined }));
    if (options.length === 0) return;
    const answer = r.vars[key("pick")];
    if (!answer) {
      const best = [...options].sort(
        (a, b) => manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost),
      );
      return {
        ask: {
          player: ctx.controller,
          key: key("pick"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: e.untilLeaves || e.optional ? "Vous pouvez exiler une carte" : "Choisissez la carte à exiler",
            options,
            min: e.untilLeaves || e.optional ? 0 : 1,
            max: 1,
            suggested: best.slice(0, 1),
          },
        },
      };
    }
    if (answer.length === 0) return;
    const id = String(answer[0]);
    if (!options.includes(id)) return;
    // Deep-Cavern Bat : « jusqu'à ce que cette créature quitte le champ de bataille » (rien si elle est déjà partie).
    if (e.untilLeaves) {
      if (s.objects[ctx.sourceId]?.zone !== "battlefield") return;
      const moved = moveObject(s, id, "exile");
      if (moved) s.linkedExile.push({ sourceId: ctx.sourceId, cards: [moved], toHand: true });
      return;
    }
    const moved = moveObject(s, id, "exile");
    const src = s.objects[ctx.sourceId];
    if (moved && src) src.linked = [...(src.linked ?? []), moved];
    return;
  },
  keep(s, r, e, ctx, key) {
    // « Gardez les permanents choisis » : tous les choix d'abord, joueur par joueur dans l'ordre APNAP (101.4), par chacun
    // ou par le contrôleur de l'effet ; rien ne bouge avant la fin des choix. Puis le sort tombe en même temps sur tous
    // les autres permanents du filtre des joueurs désignés.
    const who = resolveRef(s, ctx, e.who);
    const players = apnapOrder(s).filter((p) => who.includes(p) && !s.players[p]?.lost);
    const among = e.among ?? e.filter;
    const max = e.max !== undefined ? evalAmount(s, ctx, e.max) : 0;
    const power = (id: ObjectId) => Math.max(0, chars(s, id).power);
    const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const noun = among.types?.length === 1 && among.types[0] === "Creature" ? "créature" : "permanent";
    const fem = noun === "créature" ? "e" : "";
    const fate = `${e.fate === "destroy" ? "détruit" : "sacrifié"}${fem}s`;
    const kept = new Set<ObjectId>();
    for (const p of players) {
      const chooser = e.chooser === "you" ? ctx.controller : p;
      // Suggestion : le meilleur pour soi, le moins bon pour un autre joueur.
      const forSelf = chooser === p;
      const whose = forSelf ? "" : ` de ${s.players[p]?.name ?? p}`;
      const candidates = s.battlefield.filter(
        (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, ctx.controller, id, among, ctx.sourceId),
      );
      const ask = (k: string, prompt: string, options: ObjectId[], min: number, most: number, suggested: ObjectId[]) => ({
        ask: {
          player: chooser,
          key: key(k),
          request: {
            type: "pick" as const,
            intent:
              e.pick === "onePerType"
                ? ("keepPerType" as const)
                : e.pick === "totalPower"
                  ? ("keepWithinPower" as const)
                  : ("pickCards" as const),
            prompt,
            options,
            min,
            max: most,
            suggested,
          },
        },
      });
      // Un seul permanent parmi `options` : sans question s'il n'y en a qu'un.
      const pickOne = (k: string, options: ObjectId[], prompt: string, best: (a: ObjectId, b: ObjectId) => number) => {
        if (options.length <= 1) return options[0];
        const answer = r.vars[key(k)];
        if (!answer) {
          const sorted = [...options].sort(best);
          return ask(k, prompt, options, 1, 1, [(forSelf ? sorted[0] : sorted[sorted.length - 1]) as string]);
        }
        const id = String(answer[0]);
        if (answer.length !== 1 || !options.includes(id)) throw new RulesError("Choisissez un des permanents proposés");
        return id;
      };
      if (e.pick === "onePerType") {
        for (const t of PERMANENT_TYPES) {
          if (among.types && !among.types.includes(t)) continue;
          const ofType = candidates.filter((id) => chars(s, id).types.includes(t));
          const label = TYPE_LABEL[t] ?? t;
          const got = pickOne(
            `keep-${p}-${t}`,
            ofType,
            forSelf
              ? `Choisissez le permanent de type ${label} que vous gardez (les autres seront ${fate})`
              : `Choisissez le permanent de type ${label}${whose} qui sera gardé`,
            (a, b) => mv(b) - mv(a),
          );
          if (typeof got === "object") return got;
          if (got) kept.add(got);
        }
      } else if (e.pick === "totalPower") {
        if (candidates.length === 0) continue;
        const answer = r.vars[key(`keep-${p}`)];
        if (!answer) {
          // Suggestion : les plus fortes qui tiennent dans la limite.
          const suggested: ObjectId[] = [];
          let total = 0;
          for (const id of forSelf ? [...candidates].sort((a, b) => power(b) - power(a)) : []) {
            if (total + power(id) > max) continue;
            suggested.push(id);
            total += power(id);
          }
          return ask(
            `keep-${p}`,
            `Choisissez les ${noun}s${whose} gardé${fem}s (force totale ${max} ou moins) ; les autres seront ${fate}`,
            candidates,
            0,
            candidates.length,
            suggested,
          );
        }
        const chosen = answer.map(String);
        if (chosen.some((id) => !candidates.includes(id)) || new Set(chosen).size !== chosen.length)
          throw new RulesError("Choisissez parmi les permanents proposés");
        if (chosen.reduce((n, id) => n + power(id), 0) > max) throw new RulesError(`Force totale supérieure à ${max}`);
        for (const id of chosen) kept.add(id);
      } else if (e.pick === "sharesType") {
        // Créatures qui partagent un type avec `id` (elle comprise) : on en garde le plus chez soi, le moins ailleurs.
        const keptWith = (id: ObjectId) => candidates.filter((x) => x === id || shareCreatureType(s, [id, x])).length;
        const got = pickOne(
          `keep-${p}`,
          candidates,
          forSelf
            ? `Choisissez une de vos ${noun}s : vos autres ${noun}s sans type en commun avec elle seront ${fate}`
            : `Choisissez une ${noun}${whose} : ses autres ${noun}s sans type en commun avec elle seront ${fate}`,
          (a, b) => keptWith(b) - keptWith(a),
        );
        if (typeof got === "object") return got;
        if (got) {
          kept.add(got);
          for (const id of candidates) if (shareCreatureType(s, [got, id])) kept.add(id);
        }
      } else {
        const got = pickOne(
          `keep-${p}`,
          candidates,
          forSelf
            ? `Choisissez ${noun === "créature" ? "la créature" : "le permanent"} que vous gardez (les autres seront ${fate})`
            : `${noun === "créature" ? "Créature épargnée" : "Permanent épargné"} chez ${s.players[p]?.name ?? p}`,
          (a, b) => power(b) - power(a),
        );
        if (typeof got === "object") return got;
        if (got) kept.add(got);
      }
    }
    const doomed = s.battlefield.filter((id) => {
      const c = s.objects[id]?.controller;
      return !!c && players.includes(c) && !kept.has(id) && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId);
    });
    for (const id of doomed) {
      if (!onBattlefield(s, id)) continue;
      if (e.fate === "destroy") destroy(s, id, false, ctx.controller);
      else sacrifice(s, id);
    }
    return;
  },
  craftReturn(s, _r, _e, ctx) {
    // « Renvoyez cette carte transformée sous le contrôle de son propriétaire » : la carte exilée pour le coût.
    const card = resolveRef(s, ctx, { kind: "selfCard" }).find((id) => s.objects[id]?.zone === "exile");
    if (!card) return;
    const back = moveWithSpec(s, s.objects[card]?.owner ?? ctx.controller, card, { to: "battlefield", transformed: true });
    const o = back ? s.objects[back] : undefined;
    // Les matériaux sont liés au verso (Mastercraft Raptor, Sunbird Effigy, The Grim Captain…).
    const exiled = ctx.paid?.exiled ?? [];
    if (o && exiled.length) {
      o.linked = [...(o.linked ?? []), ...exiled];
      bump(s);
    }
    return;
  },
  exileUntilLeaves(s, _r, e, ctx) {
    // 610.3c : si la source a déjà quitté le champ de bataille, rien n'est exilé.
    if (!onBattlefield(s, ctx.sourceId)) return;
    const cards: string[] = [];
    for (const id of resolveRef(s, ctx, e.what)) {
      // Aurelia's Vindicator : des cartes de créature des cimetières aussi (elles reviendront en main).
      if (!onBattlefield(s, id) && !(e.toHand && s.objects[id]?.zone === "graveyard")) continue;
      const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
      if (n) cards.push(n);
    }
    if (cards.length) s.linkedExile.push({ sourceId: ctx.sourceId, cards, ...(e.toHand ? { toHand: true } : {}) });
    return;
  },
  pickFromZone(s, r, e, ctx, key) {
    // Worlds Within Worlds : chaque joueur, dans l'ordre APNAP, choisit dans sa propre zone (pour lui-même).
    if (e.who) {
      for (const p of apnapOrder(s).filter((x) => resolveRef(s, ctx, e.who as NonNullable<typeof e.who>).includes(x))) {
        if (r.vars[key(`pz-${p}-done`)]) continue;
        const res = HANDLERS.pickFromZone?.(s, r, { ...e, who: undefined }, { ...ctx, controller: p }, (x) => key(`${p}-${x}`));
        if (res && "ask" in res) return res;
        r.vars[key(`pz-${p}-done`)] = [1];
      }
      return;
    }
    // « une autre carte » : les objets mémorisés, reconnus par leur identité physique (ils ont changé de zone).
    const stored = (e.excludeStored ? r.vars[`$ids:${e.excludeStored}`] : undefined)?.map(String) ?? [];
    const excludedUids = new Set(stored.map((id) => s.objects[id]?.uid ?? s.lki[id]?.uid).filter(Boolean));
    const maxMv = e.maxManaValue !== undefined ? evalAmount(s, ctx, e.maxManaValue) : undefined;
    // Sanar : les couleurs permises (celles des permanents correspondants), une carte au plus par couleur.
    const allowed = e.onePerColorOf
      ? new Set(
          s.battlefield
            .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.onePerColorOf as ObjectFilter, ctx.sourceId))
            .flatMap((id) => chars(s, id).colors),
        )
      : null;
    const colorsOf = (id: string) => (s.defs[s.objects[id]?.defId ?? ""]?.colors ?? []).filter((c) => !allowed || allowed.has(c));
    const pool = (e.pool ? resolveRef(s, ctx, e.pool) : (s.players[ctx.controller]?.[e.zone] ?? [])).filter(
      (id) =>
        !!s.objects[id] &&
        !excludedUids.has(s.objects[id]?.uid) &&
        (!allowed || colorsOf(id).length > 0) &&
        matchesCard(
          s,
          ctx.controller,
          id,
          { ...e.filter, controller: undefined, maxManaValue: maxMv ?? e.filter.maxManaValue },
          ctx.sourceId,
        ),
    );
    // Eerie Ultimatum : « de noms différents » (au plus une carte par nom).
    const cardName = (id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? id;
    const onePerName =
      e.distinct === "name" ? pool.filter((id, i) => pool.findIndex((x) => cardName(x) === cardName(id)) === i) : pool;
    const count = Math.min(
      allowed ? Math.min(evalAmount(s, ctx, e.count), allowed.size) : evalAmount(s, ctx, e.count),
      onePerName.length,
    );
    if (count <= 0) return;
    const min = Math.min(e.min ?? count, count);
    let picked = onePerName.length === count && min === count ? onePerName : null;
    if (!picked && e.random) {
      const shuffled = [...pool];
      shuffle(s, shuffled);
      picked = shuffled.slice(0, count);
    }
    if (!picked) {
      const answer = r.vars[key("pickZone")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("pickZone"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: e.prompt ?? `Choisissez ${count} carte(s)`,
              options: pool,
              min,
              max: count,
              suggested: allowed ? onePerColor(pool, colorsOf).slice(0, count) : onePerName.slice(0, count),
            },
          },
        };
      }
      picked = answer.map(String);
    }
    if (allowed && !distinctColors(picked.map(colorsOf))) throw new RulesError("Une carte au plus par couleur");
    if (e.distinct === "name" && new Set(picked.map(cardName)).size !== picked.length)
      throw new RulesError("Des cartes de noms différents");
    // Un tirage au hasard n'est pas rejoué : pas de question après lui.
    const arrival = arrivalChoices(s, r, ctx, picked, e.to, ownerOr(s, e.to, ctx.controller), key, !!e.random);
    if (!(arrival instanceof Map)) return arrival;
    const moved = picked
      .map((id) => moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.to), arrival.get(id)))
      .filter((x): x is string => !!x);
    if (e.store) r.vars[`$ids:${e.store}`] = moved;
    store(r, e.store, moved.length);
    return;
  },
  libraryTopOrBottom(s, r, e, ctx, key) {
    for (const id of resolveRef(s, ctx, e.what)) {
      // Swat Away : un sort ciblé va aussi dans la bibliothèque de son propriétaire.
      const spell = s.stack.find((x) => x.id === id && x.kind === "spell");
      const o = s.objects[spell ? spell.sourceId : id];
      if (!o || (!spell && o.zone !== "battlefield")) continue;
      const answer = r.vars[key(`tb-${id}`)];
      if (!answer) {
        return {
          ask: {
            player: o.owner,
            key: key(`tb-${id}`),
            request: {
              type: "pick",
              intent: "topOrBottom",
              prompt: e.fromTop
                ? `${nameOf(s, o.id)} : en position ${e.fromTop} depuis le dessus ou au-dessous de votre bibliothèque ?`
                : `${nameOf(s, o.id)} : au-dessus ou au-dessous de votre bibliothèque ?`,
              options: ["top", "bottom"],
              labels: { top: e.fromTop ? `${e.fromTop}e depuis le dessus` : "Au-dessus", bottom: "Au-dessous" },
              min: 1,
              max: 1,
              suggested: [o.controller === ctx.controller ? "top" : "bottom"],
            },
          },
        };
      }
      const owner = o.owner;
      if (spell) spellToZone(s, id, answer[0] === "top" ? "libraryTop" : "libraryBottom");
      else
        moveWithSpec(s, ctx.controller, id, {
          to: answer[0] === "top" ? "libraryTop" : "libraryBottom",
          ...(answer[0] === "top" && e.fromTop ? { fromTop: e.fromTop } : {}),
        });
      // Clash of Elements : « si il le fait, [la source] lui inflige 2 blessures ».
      const src = e.topDamage && answer[0] === "top" ? damageSource(s, ctx) : null;
      if (src && e.topDamage) dealDamage(s, src, owner, e.topDamage, false);
    }
    return;
  },
  airbend(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const exiled = onBattlefield(s, id)
        ? moveAndLog(s, id, "exile")
        : s.stack.some((x) => x.id === id && x.kind === "spell")
          ? exileSpell(s, id)
          : undefined;
      const card = exiled ? s.objects[exiled] : undefined;
      // Un jeton ou une copie cesse d'exister en exil : rien à lancer.
      if (!card || card.isToken) continue;
      grantPlay(s, card.owner, [card.id], "forever", { cost: { generic: 2, colored: {}, x: 0 }, source: ctx.sourceId });
    }
    bent(s, ctx.controller, "air");
    return;
  },
  bent(s, _r, e, ctx) {
    bent(s, ctx.controller, e.kind);
    return;
  },
  bounce(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      if (onBattlefield(s, id)) moveAndLog(s, id, "hand");
      else if (s.stack.some((x) => x.id === id && x.kind === "spell")) bounceSpell(s, id);
    }
    return;
  },
  exile(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) moveAndLog(s, id, "exile");
    return;
  },
  mill(s, r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    let matching = 0;
    const f = e.store?.filter;
    const batch: [PlayerId, ObjectId[]][] = [];
    for (const p of resolveRef(s, ctx, e.who)) {
      const library = s.players[p]?.library ?? [];
      const base = e.halfLibrary
        ? (e.halfLibrary === "up" ? Math.ceil : Math.floor)(library.length / 2)
        : e.graveyardSize
          ? (s.players[p]?.graveyard.length ?? 0)
          : n;
      // Remplacements de la meule (R1, famille I) : The Water Crystal (« il en meule autant plus quatre »).
      const q = quantityMods(s, "mill", (a) => recipientMatches(s, a, p));
      const count = base > 0 && !q.prevented ? chooseReplacementOrder(base, q.mods, "min") : 0;
      const cards = library.slice(0, count);
      for (const id of cards) if (f && matchesCard(s, ctx.controller, id, { ...f, controller: undefined })) matching++;
      batch.push([p, cards]);
    }
    // Les cartes meulées sont mémorisées (Dredger's Insight : « parmi les cartes meulées »).
    const milled = millCards(s, batch);
    if (e.store) r.vars[`$ids:${e.store.name}`] = [...(r.vars[`$ids:${e.store.name}`] ?? []), ...milled];
    if (e.store) store(r, e.store.name, f ? matching : n);
    return;
  },
  scry(s, r, e, ctx, key) {
    // « Le joueur ciblé regarde N » : le regard est fait par ce joueur.
    const who = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    return who ? scryOrSurveil(s, r, e, who === ctx.controller ? ctx : { ...ctx, controller: who }, key) : undefined;
  },
  surveil: scryOrSurveil,
  discard(s, r, e, ctx, key) {
    const amount = evalAmount(s, ctx, e.amount);
    const f = e.filter;
    for (const p of resolveRef(s, ctx, e.who)) {
      if (r.vars[key(`done-${p}`)]) continue;
      const hand = (s.players[p]?.hand ?? []).filter((id) => !f || matchesCard(s, p, id, { ...f, controller: undefined }));
      // Pox Plague : « la moitié des cartes de sa main, arrondie à l'inférieur ».
      const n = e.half ? Math.floor(hand.length / 2) : amount;
      if (e.half && n <= 0) {
        r.vars[key(`done-${p}`)] = [1];
        continue;
      }
      const chooser = e.chooser === "controller" ? ctx.controller : p;
      let chosen: string[];
      const unless = e.unlessFilter;
      const exempt = unless ? hand.filter((id) => matchesCard(s, p, id, { ...unless, controller: undefined })) : [];
      if (unless && exempt.length > 0) {
        // « Défaussez deux cartes à moins de défausser une carte d'artefact » : une carte d'artefact, ou deux cartes.
        const answer = r.vars[key(`discard-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: p,
              key: key(`discard-${p}`),
              request: {
                type: "pick",
                intent: "discard",
                prompt: `Défaussez ${n} cartes, ou une seule carte correspondante`,
                options: [...hand],
                min: 1,
                max: Math.min(n, hand.length),
                suggested: [exempt[0] as string],
              },
            },
          };
        }
        chosen = answer.map(String);
        // Une seule carte qui ne correspond pas : il faut en défausser une autre.
        if (chosen.length < n && !chosen.some((id) => exempt.includes(id))) {
          chosen = [...chosen, ...hand.filter((id) => !chosen.includes(id)).slice(0, n - chosen.length)];
        }
      } else if (hand.length <= n && !e.optional && !e.chooser) chosen = [...hand];
      else if (hand.length === 0) chosen = [];
      else if (e.random) {
        // « … au hasard »
        const pool = [...hand];
        shuffle(s, pool);
        chosen = pool.slice(0, n);
      } else {
        // Klaw, Sonic Subjugator : le joueur révèle d'abord N cartes de son choix ; le choix se fait parmi elles.
        let pool = hand;
        if (e.reveal !== undefined) {
          const k = Math.min(Math.max(0, evalAmount(s, ctx, e.reveal)), hand.length);
          if (k < hand.length) {
            const shown = r.vars[key(`reveal-${p}`)];
            if (!shown) {
              return {
                ask: {
                  player: p,
                  key: key(`reveal-${p}`),
                  request: {
                    type: "pick",
                    intent: "reveal",
                    prompt: `Révélez ${k} carte(s) de votre main`,
                    options: [...hand],
                    min: k,
                    max: k,
                    suggested: hand.slice(0, k),
                  },
                },
              };
            }
            pool = shown.map(String).filter((id) => hand.includes(id));
          }
          emit({ type: "reveal", player: p, defIds: pool.map((id) => s.objects[id]?.defId ?? "") });
        }
        const answer = r.vars[key(`discard-${p}`)];
        if (!answer) {
          const max = Math.min(n, pool.length);
          return {
            ask: {
              player: chooser,
              key: key(`discard-${p}`),
              request: {
                type: "pick",
                intent: "discard",
                prompt:
                  chooser === p
                    ? `${e.optional ? "Vous pouvez défausser" : "Défaussez"} ${n} carte(s)`
                    : `Choisissez ${max} carte(s) que ce joueur défausse`,
                options: [...pool],
                min: e.optional ? 0 : max,
                max,
                suggested: e.optional ? [] : pool.slice(0, max),
              },
            },
          };
        }
        chosen = answer.map(String);
      }
      r.vars[key(`done-${p}`)] = [1];
      const sf = e.storeFilter;
      const counted = sf ? chosen.filter((id) => matchesCard(s, p, id, { ...sf, controller: undefined })).length : chosen.length;
      store(r, e.store, readVar(ctx, e.store ?? "") + counted);
      if (chosen.length === 0) continue;
      if (e.exile) {
        // Intimidation Tactics : la carte choisie est exilée (ce n'est pas une défausse).
        for (const id of chosen) {
          const moved = moveObject(s, id, "exile");
          // Cruelclaw's Heist : « vous pouvez lancer cette carte tant qu'elle reste exilée ».
          if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
        }
        continue;
      }
      emit({ type: "discard", player: p, defIds: chosen.map((id) => s.objects[id]?.defId ?? "") });
      for (const id of chosen) {
        // Wilt-Leaf Liege : défaussée par un effet adverse, elle va sur le champ de bataille.
        const toField = p !== ctx.controller && !!s.defs[s.objects[id]?.defId ?? ""]?.opponentDiscardToBattlefield;
        const moved = toField ? moveObject(s, id, "battlefield") : moveDiscarded(s, p, id, true);
        if (!toField) announceDiscard(s, p, moved);
        // Les cartes défaussées, pour `ref.stored` (Ninja's Blades : « la valeur de mana de la carte défaussée »).
        if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
      }
      announceDiscardBatch(s, p, chosen.length);
    }
    return;
  },
  sacrifice(s, r, e, ctx, key) {
    const all = evalAmount(s, ctx, e.amount);
    for (const p of resolveRef(s, ctx, e.who)) {
      if (r.vars[key(`done-${p}`)]) continue;
      let candidates = s.battlefield.filter(
        (id) =>
          s.objects[id]?.controller === p &&
          matchesObjectFilter(s, p, id, e.filter, ctx.sourceId) &&
          !hasKeyword(s, id, "cantBeSacrificed"),
      );
      // Zodiark : « la moitié des créatures qu'il contrôle, arrondie à l'inférieur ».
      const n = e.half ? Math.floor(candidates.length / 2) : all;
      if (n <= 0) {
        r.vars[key(`done-${p}`)] = [1];
        continue;
      }
      if (e.greatestPower && candidates.length) {
        const max = Math.max(...candidates.map((id) => chars(s, id).power));
        candidates = candidates.filter((id) => chars(s, id).power === max);
      }
      if (e.greatestManaValue && candidates.length) {
        const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
        const max = Math.max(...candidates.map(mv));
        candidates = candidates.filter((id) => mv(id) === max);
      }
      let chosen: string[];
      if (candidates.length <= n && !e.optional) chosen = candidates;
      else if (candidates.length === 0) chosen = [];
      else {
        const answer = r.vars[key(`sac-${p}`)];
        if (!answer) {
          const max = Math.min(n, candidates.length);
          return {
            ask: {
              player: p,
              key: key(`sac-${p}`),
              request: {
                type: "pick",
                intent: "sacrifice",
                prompt:
                  e.to === "hand"
                    ? `Renvoyez ${n} permanent(s) dans la main de leur propriétaire`
                    : e.to === "exile"
                      ? `Exilez ${n} permanent(s)`
                      : `${e.optional ? "Vous pouvez sacrifier" : "Sacrifiez"} ${n} permanent(s)`,
                options: candidates,
                min: e.optional ? 0 : max,
                max,
                suggested: e.optional ? [] : candidates.slice(0, max),
              },
            },
          };
        }
        chosen = answer.map(String);
      }
      r.vars[key(`done-${p}`)] = [1];
      store(r, e.store, readVar(ctx, e.store ?? "") + chosen.length);
      if (e.to) {
        // « … l'exile » : les cartes exilées sont mémorisées (pour les lier à la source) ; « … la renvoie en main ».
        const exiled = chosen
          .filter((id) => onBattlefield(s, id))
          .map((id) => moveWithSpec(s, ctx.controller, id, { to: e.to ?? "exile" }))
          .filter((x): x is string => !!x);
        if (e.store) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), ...exiled];
        continue;
      }
      if (e.store) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), ...chosen];
      for (const id of chosen) if (onBattlefield(s, id)) sacrifice(s, id);
    }
    return;
  },
  tap(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (e.untap) untapObject(s, o);
      else tapObject(s, o);
    }
    return;
  },
  exileForManaValue(s, r, e, ctx) {
    const need = evalAmount(s, ctx, e.atLeast);
    const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const options = s.battlefield
      .filter(
        (id) =>
          s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
      )
      .sort((a, b) => mv(a) - mv(b));
    const chosen: ObjectId[] = [];
    let total = 0;
    for (const id of options) {
      if (total >= need && chosen.length > 0) break;
      chosen.push(id);
      total += mv(id);
    }
    if (chosen.length === 0 || total < need) {
      store(r, e.store, 0);
      return;
    }
    for (const id of chosen) moveObject(s, id, "exile");
    store(r, e.store, 1);
    return;
  },
  sacrificeIt(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) sacrifice(s, id);
    return;
  },
  moveTo(s, r, e, ctx, key) {
    const ids = resolveRef(s, ctx, e.what);
    const f = e.store?.filter;
    if (e.store)
      store(
        r,
        e.store.name,
        ids.filter((id) => !f || matchesCard(s, ctx.controller, id, { ...f, controller: undefined })).length,
      );
    // Choix d'arrivée d'un permanent qui n'est pas lancé, demandés avant tout déplacement (la résolution reprend l'effet
    // depuis le début une fois la réponse donnée) : ce qu'enchante une Aura (303.4f) ; puis `arrivalChoices` (effets « en
    // arrivant », terrains choc, défenseur).
    const choices: Record<string, Partial<EntersContext>> = {};
    if (e.spec.to === "battlefield") {
      const host = e.attachTo ? resolveRef(s, ctx, e.attachTo).find((x) => onBattlefield(s, x)) : undefined;
      for (const id of ids) {
        const o = s.objects[id];
        const d = s.defs[o?.defId ?? ""];
        if (!o || !d) continue;
        const who = e.spec.underYourControl ? ctx.controller : o.owner;
        // « … attachée à [une créature] » : l'Aura ou l'Équipement arrive attaché, s'il peut l'être.
        if (
          host &&
          (d.enchant
            ? !d.enchant.player && auraHosts(s, who, id).includes(host)
            : d.subtypes.includes("Equipment") && isCreature(s, host))
        ) {
          choices[id] = { attachTo: host };
          continue;
        }
        if (d.enchant && !d.enchant.player) {
          const options = auraHosts(s, who, id);
          const k = key(`host-${id}`);
          if (options.length > 1 && !r.vars[k]) {
            return {
              ask: {
                player: who,
                key: k,
                request: {
                  type: "pick",
                  intent: "pickCards",
                  prompt: `${cardRef(d.id)} : choisissez ce qu'elle enchante`,
                  options,
                  min: 1,
                  max: 1,
                  suggested: options.slice(0, 1),
                },
              },
            };
          }
          const picked = (r.vars[k] ?? []).map(String).find((x) => options.includes(x)) ?? options[0];
          if (picked) choices[id] = { ...choices[id], attachTo: picked };
        }
      }
    }
    const arrival = arrivalChoices(s, r, ctx, ids, e.spec, ownerOr(s, e.spec, ctx.controller), key);
    if (!(arrival instanceof Map)) return arrival;
    for (const [id, a] of arrival) choices[id] = { ...choices[id], ...a };
    const moved: string[] = [];
    for (const id of ids) {
      const n = moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.spec), choices[id]);
      if (n) moved.push(n);
    }
    if (e.store) r.vars[`$ids:${e.store.name}`] = moved;
    return;
  },
  exileNamesakes(s, r, e, ctx, key) {
    // The End : le permanent ciblé, exilé, puis ses homonymes chez son contrôleur (qui pioche autant que de cartes
    // exilées de sa main). Surgical Extraction : la carte de cimetière ciblée et ses homonymes chez son propriétaire.
    if (e.of) {
      const target = resolveRef(s, ctx, e.of).find((id) => onBattlefield(s, id) || s.objects[id]?.zone === "graveyard");
      if (!target) return;
      const o = s.objects[target];
      if (!o) return;
      const who = onBattlefield(s, target) ? o.controller : o.owner;
      const name = onBattlefield(s, target) ? chars(s, target).name : s.defs[o.defId]?.name;
      moveAndLog(s, target, "exile");
      const pl = s.players[who];
      if (!pl) return;
      const same = (id: ObjectId) => s.defs[s.objects[id]?.defId ?? ""]?.name === name;
      const fromHand = pl.hand.filter(same);
      for (const id of [...pl.graveyard.filter(same), ...fromHand, ...pl.library.filter(same)]) moveObject(s, id, "exile");
      shuffle(s, pl.library);
      if (e.draw) drawCards(s, who, fromHand.length);
      return;
    }
    const options = opponentsOf(s, ctx.controller).flatMap((p) => s.players[p]?.graveyard ?? []);
    if (options.length === 0) return;
    const answer = r.vars[key("pick")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("pick"),
          request: {
            type: "pick",
            intent: "other",
            prompt: "Exilez une carte du cimetière d'un adversaire (et toutes celles du même nom)",
            options,
            min: 1,
            max: 1,
            suggested: options.slice(0, 1),
          },
        },
      };
    }
    const picked = String(answer[0]);
    const card = s.objects[picked];
    const owner = card?.owner;
    const name = s.defs[card?.defId ?? ""]?.name;
    const pl = owner ? s.players[owner] : undefined;
    if (!card || !pl || !name || !options.includes(picked)) return;
    moveObject(s, picked, "exile");
    const same = (id: ObjectId) => s.defs[s.objects[id]?.defId ?? ""]?.name === name;
    const fromHand = pl.hand.filter(same);
    for (const id of [...pl.graveyard.filter(same), ...fromHand, ...pl.library.filter(same)]) moveObject(s, id, "exile");
    shuffle(s, pl.library);
    drawCards(s, owner as string, fromHand.length);
    return;
  },
  exileNamed(s, r, e, ctx) {
    const name = String(r.vars.$name?.[0] ?? "");
    if (!name) return;
    for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
      const pl = s.players[p];
      if (!pl) continue;
      const named = [...pl.graveyard, ...pl.hand, ...pl.library].filter((x) => s.defs[s.objects[x]?.defId ?? ""]?.name === name);
      for (const x of named.slice(0, e.max)) moveObject(s, x, "exile");
      shuffle(s, pl.library);
    }
    return;
  },
  moveAll(s, r, e, ctx, key) {
    const players = resolveRef(s, ctx, e.whose).filter((p) => isPlayer(s, p));
    // « de valeur de mana X » (Fix What's Broken) : le X du sort ou de la capacité.
    const filter = withX(s, e.filter, ctx);
    const ids =
      e.from === "battlefield"
        ? s.battlefield.filter(
            (id) =>
              players.includes(s.objects[id]?.controller ?? "") &&
              matchesObjectFilter(s, ctx.controller, id, { ...filter, controller: undefined }, ctx.sourceId),
          )
        : zoneCards(s, players, e.from).filter((id) =>
            matchesCard(s, ctx.controller, id, { ...filter, controller: undefined }, ctx.sourceId),
          );
    const arrival = arrivalChoices(s, r, ctx, ids, e.spec, ownerOr(s, e.spec, ctx.controller), key);
    if (!(arrival instanceof Map)) return arrival;
    const moved = ids
      .map((id) => moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.spec), arrival.get(id)))
      .filter((x): x is string => !!x);
    if (e.store) r.vars[`$ids:${e.store}`] = moved;
    return;
  },
  shuffle(s, _r, e, ctx) {
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (pl) shuffle(s, pl.library);
    }
    return;
  },
  lookAtTop(s, r, e, ctx, key) {
    const whose = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    const player = whose ? s.players[whose] : undefined;
    if (!player) return;
    const top = player.library.slice(0, evalAmount(s, ctx, e.n));
    if (top.length === 0) return;
    const maxMv = e.maxManaValue === undefined ? undefined : evalAmount(s, ctx, e.maxManaValue);
    const filter = maxMv === undefined ? e.filter : { ...e.filter, maxManaValue: maxMv };
    const options = top.filter((id) => !filter || matchesCard(s, ctx.controller, id, filter, ctx.sourceId));
    const count = evalAmount(s, ctx, e.count);
    // Suggestion qui respecte la limite de valeur de mana totale (les premières cartes qui tiennent).
    const withinTotal = (ids: string[]) => {
      if (e.onePerType) return greedyOnePerType(s, options).slice(0, count);
      if (e.maxTotalManaValue === undefined) return ids;
      let total = 0;
      return ids.filter((id) => {
        const mv = manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
        if (total + mv > (e.maxTotalManaValue ?? 0)) return false;
        total += mv;
        return true;
      });
    };
    let picked: string[] = [];
    if (e.random && options.length > 0 && count > 0) {
      const pool = [...options];
      shuffle(s, pool);
      picked = pool.slice(0, count);
    } else if (options.length > 0 && count > 0) {
      const answer = r.vars[key("look")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("look"),
            request: {
              type: "pick",
              intent: "lookAtTop",
              prompt: e.exact
                ? `Vous regardez les ${top.length} cartes du dessus : choisissez-en ${Math.min(count, options.length)}`
                : `Vous regardez les ${top.length} cartes du dessus : choisissez-en jusqu'à ${count}`,
              options,
              min: e.exact ? Math.min(count, options.length) : 0,
              max: Math.min(count, options.length),
              suggested: withinTotal(options.slice(0, Math.min(count, options.length))),
            },
          },
        };
      }
      picked = answer.map(String);
      // Atraxa, Grand Unifier : « pour chaque type de carte, une carte de ce type » (chaque carte prise pour un type différent).
      if (e.onePerType && !assignTypes(s, picked)) throw new RulesError("Une seule carte par type de carte");
      // « de valeur de mana totale N ou moins » : un choix qui dépasse est refusé.
      if (e.maxTotalManaValue !== undefined) {
        const total = picked.reduce((n, id) => n + manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost), 0);
        if (total > e.maxTotalManaValue) throw new RulesError(`Valeur de mana totale supérieure à ${e.maxTotalManaValue}`);
      }
    }
    const rest = top.filter((id) => !picked.includes(id));
    const arrival = arrivalChoices(s, r, ctx, picked, e.to, ownerOr(s, e.to, ctx.controller), key, !!e.random);
    if (!(arrival instanceof Map)) return arrival;
    store(r, e.store, picked.length);
    const taken = picked
      .map((id) => moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.to), arrival.get(id)))
      .filter((x): x is string => !!x);
    if (e.store) r.vars[`$ids:${e.store}`] = taken;
    if (e.rest === "graveyard") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "graveyard" });
    else if (e.rest === "hand") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "hand" });
    else if (e.rest === "bottom") {
      // Ordre aléatoire (« dans un ordre aléatoire »).
      const lib = player.library.filter((id) => !rest.includes(id));
      const shuffled = [...rest];
      shuffle(s, shuffled);
      player.library = [...lib, ...shuffled];
    }
    return;
  },
  search(s, r, e, ctx, key) {
    // Chaque joueur désigné cherche dans SA bibliothèque (Demolition Field) ; par défaut, le contrôleur.
    for (const p of e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller]) {
      if (r.vars[key(`sdone-${p}`)]) continue;
      const player = s.players[p];
      if (!player) continue;
      // Le nombre se lit du point de vue de celui qui cherche (Winds of Abandon : autant que de ses créatures exilées).
      const count = evalAmount(s, e.who ? { ...ctx, controller: p } : ctx, e.count);
      const exactMv = e.manaValue !== undefined ? evalAmount(s, ctx, e.manaValue) : undefined;
      // Grim Servant : « valeur de mana au plus égale à votre dévotion au noir ».
      const maxMv = e.maxManaValue !== undefined ? evalAmount(s, ctx, e.maxManaValue) : undefined;
      // « valeur de mana X ou moins » : le X du sort qui se résout (Nature's Rhythm).
      const base = withX(s, e.filter, ctx);
      const options = player.library.filter((id) =>
        matchesCard(
          s,
          p,
          id,
          {
            ...base,
            ...(exactMv === undefined ? {} : { manaValue: exactMv }),
            ...(maxMv === undefined ? {} : { maxManaValue: maxMv }),
          },
          ctx.sourceId,
        ),
      );
      let picked: string[] = [];
      if (options.length > 0 && count > 0) {
        const answer = r.vars[key(`search-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: p,
              key: key(`search-${p}`),
              request: {
                type: "pick",
                intent: "search",
                prompt: `Cherchez dans votre bibliothèque : jusqu'à ${count} carte(s)`,
                options,
                min: 0,
                max: Math.min(count, options.length),
                suggested: options.slice(0, Math.min(count, options.length)),
              },
            },
          };
        }
        picked = answer.map(String);
        // « avec des noms différents » : un seul exemplaire de chaque nom.
        if (e.distinctNames) {
          const names = new Set<string>();
          picked = picked.filter((id) => {
            const n = s.defs[s.objects[id]?.defId ?? ""]?.name ?? id;
            if (names.has(n)) return false;
            names.add(n);
            return true;
          });
        }
      }
      const arrival = arrivalChoices(s, r, ctx, picked, e.to, ownerOr(s, e.to, p), (x) => key(`${p}-${x}`));
      if (!(arrival instanceof Map)) return arrival;
      r.vars[key(`sdone-${p}`)] = [1];
      rulesEvent(s, { e: "search", player: p });
      logTurnEvent(s, { e: "search", player: p });
      // 701.23 : on mélange après la recherche ; « sur le dessus » s'applique après le mélange.
      const toTop = e.to.to === "libraryTop";
      for (const id of picked) {
        if (toTop) continue;
        const moved = moveWithSpec(s, p, id, evalMoveSpec(s, ctx, e.to), arrival.get(id));
        if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
      }
      shuffle(s, player.library);
      if (toTop) for (const id of picked) player.library = [id, ...player.library.filter((x) => x !== id)];
    }
    return;
  },
  devour(s, r, e, ctx, key) {
    if (r.vars.$devoured) return;
    const fromGy = !!e.graveyardUpToX;
    const options = fromGy
      ? (s.players[ctx.controller]?.graveyard ?? []).filter((id) => matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId))
      : s.battlefield.filter(
          (id) =>
            s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
        );
    const max = fromGy ? Math.min(ctx.x, options.length) : options.length;
    const answer = options.length ? r.vars[key("devour")] : [];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("devour"),
          request: {
            type: "pick",
            intent: "sacrifice",
            prompt: fromGy
              ? `${nameOf(s, ctx.sourceId)} : exilez jusqu'à ${max} carte(s) de votre cimetière`
              : `${nameOf(s, ctx.sourceId)} : dévorer (sacrifiez autant de permanents que vous voulez)`,
            options,
            min: 0,
            max,
            suggested: fromGy ? options.slice(0, max) : [],
          },
        },
      };
    }
    const chosen = answer
      .map(String)
      .filter((id) => options.includes(id))
      .slice(0, max);
    if (fromGy) {
      r.vars["$ids:devoured"] = chosen.map((id) => moveObject(s, id, "exile")).filter((x): x is string => !!x);
    } else for (const id of chosen) sacrifice(s, id);
    r.vars.$devoured = [chosen.length];
    return;
  },
  revealUntilN(s, r, e, ctx, key) {
    // La bibliothèque d'un autre joueur (Jhoira, Weatherlight Corsair : un adversaire ciblé).
    const owner = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    const player = owner ? s.players[owner] : undefined;
    if (!player || !owner) return;
    const found: string[] = [];
    const n = evalAmount(s, ctx, e.n);
    let i = 0;
    for (; i < player.library.length && found.length < n; i++) {
      const id = player.library[i] as string;
      if (matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined })) found.push(id);
    }
    const revealed = player.library.slice(0, i);
    const arrival = e.to
      ? arrivalChoices(s, r, ctx, found, e.to, ownerOr(s, e.to, ctx.controller), key)
      : new Map<ObjectId, Arrival>();
    if (!(arrival instanceof Map)) return arrival;
    emit({ type: "reveal", player: owner, defIds: revealed.map((id) => s.objects[id]?.defId ?? "") });
    if (!e.to) {
      if (e.store) r.vars[`$ids:${e.store}`] = found;
      return;
    }
    const rest = revealed.filter((id) => !found.includes(id));
    const moved: string[] = [];
    for (const id of found) {
      const m = moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.to), arrival.get(id));
      if (m) moved.push(m);
    }
    // Les cartes déplacées (Jhoira : « perdez autant de PV que sa valeur de mana »).
    if (e.store) r.vars[`$ids:${e.store}`] = moved;
    const lib = player.library.filter((id) => !rest.includes(id));
    shuffle(s, rest);
    player.library = [...lib, ...rest];
    return;
  },
  piles(s, r, e, ctx, key) {
    const player = s.players[ctx.controller];
    if (!player) return;
    const top = player.library.slice(0, e.n);
    if (top.length === 0) return;
    // Fact or Fiction : un adversaire sépare les cartes révélées, le contrôleur choisit sa pile.
    if (e.opponentSeparates && !r.vars[key("revealed")]) {
      r.vars[key("revealed")] = [1];
      emit({ type: "reveal", player: ctx.controller, defIds: top.map((id) => s.objects[id]?.defId ?? "") });
    }
    // « Un adversaire sépare » (après la révélation) ou « un adversaire choisit » (après la séparation) : le contrôleur
    // choisit lequel, sans le cibler (aucune question s'il n'y en a qu'un).
    const asked = r.vars[key("down")] || e.opponentSeparates ? opponentChoice(s, r, ctx, key, e.opponentSeparates) : null;
    if (asked && "ask" in asked) return asked;
    const opp = asked?.player;
    const separator = e.opponentSeparates && opp ? opp : ctx.controller;
    const chooser = e.opponentSeparates ? ctx.controller : opp;
    const down = r.vars[key("down")];
    if (!down) {
      return {
        ask: {
          player: separator,
          key: key("down"),
          request: {
            type: "pick",
            intent: "piles",
            prompt: e.revealed
              ? "Séparez les cartes révélées en deux piles : choisissez celles de la première pile"
              : "Choisissez les cartes de la pile face cachée (les autres forment la pile face visible)",
            options: top,
            min: 0,
            max: top.length,
            suggested: top.slice(0, Math.ceil(top.length / 2)),
          },
        },
      };
    }
    const faceDown = down.map(String);
    const faceUp = top.filter((id) => !faceDown.includes(id));
    let pick = r.vars[key("pile")]?.[0];
    if (pick === undefined && chooser) {
      const names = faceUp.map((id) => nameOf(s, id)).join(", ") || "aucune carte";
      const downNames = faceDown.map((id) => nameOf(s, id)).join(", ") || "aucune carte";
      if (e.revealed && !e.opponentSeparates)
        emit({ type: "reveal", player: ctx.controller, defIds: top.map((id) => s.objects[id]?.defId ?? "") });
      return {
        ask: {
          player: chooser,
          key: key("pile"),
          request: {
            type: "pick",
            intent: "piles",
            prompt: e.opponentSeparates
              ? `${nameOf(s, ctx.sourceId)} : choisissez la pile à mettre dans votre main (l'autre va au cimetière)`
              : `${nameOf(s, ctx.sourceId)} : choisissez la pile que l'adversaire met dans sa main (l'autre va au cimetière)`,
            options: ["down", "up"],
            labels: e.revealed
              ? { down: `Première pile : ${downNames}`, up: `Seconde pile : ${names}` }
              : { down: `Pile face cachée (${faceDown.length} carte(s))`, up: `Pile face visible : ${names}` },
            min: 1,
            max: 1,
            suggested: [faceDown.length >= faceUp.length !== !!e.opponentSeparates ? "up" : "down"],
          },
        },
      };
    }
    pick ??= "down";
    const toHand = pick === "down" ? faceDown : faceUp;
    for (const id of top) moveWithSpec(s, ctx.controller, id, { to: toHand.includes(id) ? "hand" : "graveyard" });
    store(r, e.storeGraveyard, top.length - toHand.length);
    return;
  },
  flickerChosen(s, r, e, ctx, key) {
    const options = s.battlefield.filter(
      (id) => s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
    );
    const answer = options.length ? r.vars[key("flicker")] : [];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("flicker"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: `${nameOf(s, ctx.sourceId)} : choisissez les permanents à exiler puis renvoyer`,
            options,
            min: 0,
            max: options.length,
            suggested: options,
          },
        },
      };
    }
    let ids = answer.map(String).filter((id) => options.includes(id));
    const times = Math.max(1, evalAmount(s, ctx, e.times));
    for (let t = 0; t < times; t++) {
      const exiled = ids.map((id) => moveObject(s, id, "exile")).filter((x): x is string => !!x);
      ids = exiled
        .map((id) => moveObject(s, id, "battlefield", { controller: s.objects[id]?.owner }))
        .filter((x): x is string => !!x);
    }
    return;
  },
  millUntil(s, _r, e, ctx) {
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (!pl) continue;
      const i = pl.library.findIndex((id) => matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined }));
      const cards = i < 0 ? [...pl.library] : pl.library.slice(0, i + 1);
      millCards(s, [[p, cards]]);
    }
    return;
  },
  portent(s, r, _e, ctx) {
    const pl = s.players[ctx.controller];
    if (!pl) return;
    const revealed = pl.library.slice(0, Math.max(0, ctx.x));
    const typesOf = (id: string) => s.defs[s.objects[id]?.defId ?? ""]?.types ?? [];
    // Une carte par type de carte : on attribue d'abord les cartes qui ont le moins de types.
    const order: CardType[] = ["Battle", "Planeswalker", "Enchantment", "Artifact", "Sorcery", "Instant", "Creature", "Land"];
    const picked: string[] = [];
    for (const t of order) {
      const c = revealed
        .filter((id) => !picked.includes(id) && typesOf(id).includes(t))
        .sort((a, b) => typesOf(a).length - typesOf(b).length)[0];
      if (c) picked.push(c);
    }
    emit({ type: "reveal", player: ctx.controller, defIds: revealed.map((id) => s.objects[id]?.defId ?? "") });
    const exiled = picked.map((id) => moveWithSpec(s, ctx.controller, id, { to: "exile" })).filter((x): x is string => !!x);
    for (const id of revealed) if (!picked.includes(id) && s.objects[id]) moveAndLog(s, id, "graveyard");
    // Quatre cartes ou plus : un sort parmi elles peut être lancé gratuitement (au choix, pendant la résolution) ;
    // le reste va ensuite en main.
    r.vars["$ids:free"] = exiled.length >= 4 ? exiled.filter((id) => !typesOf(id).includes("Land")) : [];
    r.vars["$ids:rest"] = exiled;
    return;
  },
  exileTop(s, r, e, ctx) {
    const exiled: string[] = [];
    for (const p of resolveRef(s, ctx, e.who)) {
      const lib = s.players[p]?.library ?? [];
      const n = e.allBut !== undefined ? lib.length - evalAmount(s, ctx, e.allBut) : evalAmount(s, ctx, e.n ?? 0);
      for (const id of lib.slice(0, Math.max(0, n))) {
        const n = moveWithSpec(s, ctx.controller, id, { to: "exile", ...(e.faceDown ? { faceDown: e.faceDown } : {}) });
        if (n) exiled.push(n);
      }
    }
    if (e.store) r.vars[`$ids:${e.store}`] = exiled;
    return;
  },
  untapUpTo(s, _r, e, ctx) {
    const ids = s.battlefield.filter(
      (id) =>
        s.objects[id]?.controller === ctx.controller &&
        s.objects[id]?.tapped &&
        matchesObjectFilter(s, ctx.controller, id, e.filter),
    );
    for (const id of ids.slice(0, e.n)) {
      const o = s.objects[id];
      if (o) untapObject(s, o);
    }
    return;
  },
  exileUntil(s, r, e, ctx) {
    if (e.untilTotalManaValue !== undefined) {
      const all: string[] = [];
      for (const p of resolveRef(s, ctx, e.who ?? { kind: "you" }).filter((x) => isPlayer(s, x))) {
        const lib = s.players[p]?.library ?? [];
        let total = 0;
        while (lib.length && total < e.untilTotalManaValue) {
          const top = lib[0] as string;
          total += manaValue(s.defs[s.objects[top]?.defId ?? ""]?.manaCost);
          const moved = moveWithSpec(s, ctx.controller, top, { to: "exile" });
          if (moved) all.push(moved);
        }
      }
      r.vars[`$ids:${e.store}`] = all;
      return;
    }
    // Exiler depuis le dessus jusqu'à une carte correspondante ; seule cette dernière est mémorisée. Black Widow, Super
    // Spy : la bibliothèque du joueur désigné.
    // Krang & Shredder : « chaque adversaire exile… » : chacun, les cartes trouvées réunies.
    const players = e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller];
    const all: string[] = [];
    for (const whose of players) {
      const lib = s.players[whose]?.library ?? [];
      let found: string | null = null;
      while (lib.length && !found) {
        const top = lib[0] as string;
        const match = matchesCard(s, ctx.controller, top, { ...e.filter, controller: undefined });
        const moved = moveWithSpec(s, ctx.controller, top, { to: "exile" });
        if (match) found = moved;
      }
      if (found) all.push(found);
    }
    r.vars[`$ids:${e.store}`] = all;
    return;
  },
  exileFromOwnHand(s, r, e, ctx, key) {
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p) || r.vars[key(`xh-${p}-done`)]) continue;
      const hand = s.players[p]?.hand ?? [];
      if (hand.length === 0) continue;
      const answer = r.vars[key(`xh-${p}`)];
      if (!answer) {
        return {
          ask: {
            player: p,
            key: key(`xh-${p}`),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: "Exilez une carte de votre main",
              options: [...hand],
              min: 1,
              max: 1,
              suggested: hand.slice(0, 1),
            },
          },
        };
      }
      r.vars[key(`xh-${p}-done`)] = [1];
      const id = String(answer[0]);
      if (!hand.includes(id)) continue;
      const moved = moveWithSpec(s, p, id, { to: "exile" });
      if (moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
    }
    return;
  },
  transform(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const d = o ? s.defs[o.defId] : undefined;
      // Marvel Super Heroes : des cartes modales recto-verso se transforment aussi (Jennifer Walters).
      const back = d?.layout === "transform" || d?.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
      if (o?.zone !== "battlefield" || !back) continue;
      o.faceDefId = o.faceDefId === back.id ? undefined : back.id;
      bump(s);
      emit({ type: "transform", objectId: id, defId: o.faceDefId ?? o.defId });
      rulesEvent(s, { e: "transformed", objectId: id });
    }
    return;
  },
  meld(s, _r, e, ctx) {
    // 701.42a : il faut posséder et contrôler les deux permanents.
    const src = s.objects[ctx.sourceId];
    const result = src ? s.defs[src.defId]?.meldResultDef : undefined;
    const partner = s.battlefield.find(
      (id) =>
        id !== ctx.sourceId &&
        s.objects[id]?.owner === ctx.controller &&
        s.objects[id]?.controller === ctx.controller &&
        chars(s, id).name === e.with,
    );
    if (src?.zone !== "battlefield" || src.owner !== ctx.controller || !partner || !result) return;
    registerDef(s, result);
    const parts = [src, s.objects[partner]].map((o) => ({ defId: o?.defId ?? "", uid: o?.uid ?? "" }));
    const exiled = [ctx.sourceId, partner].map((id) => moveObject(s, id, "exile"));
    for (const id of exiled) if (id) removeFromGame(s, id);
    const melded = createObject(s, result.id, ctx.controller, "battlefield");
    melded.melded = parts;
    melded.timestamp = nextTimestamp(s);
    bump(s);
    emit({ type: "token", objectId: melded.id, defId: result.id, controller: ctx.controller });
    rulesEvent(s, { e: "zone", oldId: exiled[0] ?? null, newId: melded.id, from: "exile", to: "battlefield", lki: null });
    return;
  },
  explore(s, r, e, ctx, key) {
    // 701.44a : révéler la carte du dessus ; un terrain va en main ; sinon, un marqueur +1/+1 sur la créature et
    // son contrôleur peut mettre la carte au cimetière.
    const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    for (const id of ids) {
      for (let n = 0; n < times; n++) {
        const k = `explore-${id}-${n}`;
        if (r.vars[key(`${k}-done`)]) continue;
        const o = s.objects[id];
        const p = o?.controller;
        // Twists and Turns : « à la place, regardez 1, puis cette créature explore ».
        if (p && playerStatic(s, p, "scryBeforeExplore") && !r.vars[key(`${k}-scried`)]) {
          const asked = scryOrSurveil(s, r, { op: "scry", amount: 1 }, { ...ctx, controller: p }, (x) => key(`${k}-scry-${x}`));
          if (asked) return asked;
          r.vars[key(`${k}-scried`)] = [1];
        }
        const lib = p ? (s.players[p]?.library ?? []) : [];
        const top = lib[0];
        if (!o || !p || !top) {
          r.vars[key(`${k}-done`)] = [1];
          if (o) rulesEvent(s, { e: "explore", objectId: id, land: false });
          continue;
        }
        const land = !!s.defs[s.objects[top]?.defId ?? ""]?.types.includes("Land");
        if (!land) {
          const answer = r.vars[key(k)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(k),
                request: {
                  type: "yesNo",
                  intent: "may",
                  prompt: `Exploration : mettre ${nameOf(s, top)} dans votre cimetière ?`,
                  suggested: [0],
                },
              },
            };
          }
          r.vars[key(`${k}-done`)] = [1];
          emit({ type: "reveal", player: p, defIds: [s.objects[top]?.defId ?? ""] });
          changeCounters(s, o, P1P1, 1);
          if (answer[0] === 1) moveAndLog(s, top, "graveyard");
        } else {
          r.vars[key(`${k}-done`)] = [1];
          emit({ type: "reveal", player: p, defIds: [s.objects[top]?.defId ?? ""] });
          moveAndLog(s, top, "hand");
        }
        rulesEvent(s, { e: "explore", objectId: id, land });
      }
    }
    return;
  },
  connive(s, r, e, ctx, key) {
    // 701.50a : piocher, défausser ; si une carte non-terrain est défaussée, un marqueur +1/+1 sur la créature.
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const p = o?.controller;
      if (!o || !p || r.vars[key(`connive-${id}-done`)]) continue;
      if (!r.vars[key(`connive-${id}-drew`)]) {
        // Leader, Super-Genius : « si une créature que vous contrôlez devait comploter, piochez d'abord une carte ».
        const first = quantityMods(s, "connive", (a) => recipientMatches(s, a, id)).mods.reduce(
          (n, m) => n + ("add" in m ? (m.add ?? 0) : 0),
          0,
        );
        if (first > 0) drawCards(s, p, first);
        drawCards(s, p, 1);
        r.vars[key(`connive-${id}-drew`)] = [1];
      }
      const hand = s.players[p]?.hand ?? [];
      if (hand.length === 0) {
        r.vars[key(`connive-${id}-done`)] = [1];
        continue;
      }
      const answer = r.vars[key(`connive-${id}`)];
      if (!answer) {
        const cheapest = [...hand].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
        );
        return {
          ask: {
            player: p,
            key: key(`connive-${id}`),
            request: {
              type: "pick",
              intent: "discard",
              prompt: "Connivence : choisissez la carte à défausser",
              options: [...hand],
              min: 1,
              max: 1,
              suggested: cheapest.slice(0, 1),
            },
          },
        };
      }
      r.vars[key(`connive-${id}-done`)] = [1];
      const card = String(answer[0]);
      if (!hand.includes(card)) continue;
      const nonland = !s.defs[s.objects[card]?.defId ?? ""]?.types.includes("Land");
      emit({ type: "discard", player: p, defIds: [s.objects[card]?.defId ?? ""] });
      announceDiscard(s, p, moveDiscarded(s, p, card, true));
      announceDiscardBatch(s, p, 1);
      if (nonland && onBattlefield(s, id)) changeCounters(s, o, P1P1, 1);
    }
    return;
  },
  putFaceDown(s, r, e, ctx) {
    // Manifester (701.34) / cape (701.58) : face cachée, sous le contrôle du contrôleur de l'effet (ou du propriétaire).
    const made: string[] = [];
    for (const id of resolveRef(s, ctx, e.what)) {
      const owner = s.objects[id]?.owner ?? ctx.controller;
      const n = putFaceDown(s, e.ownerControl ? owner : ctx.controller, id, e.ward);
      if (n) made.push(n);
    }
    if (e.store) r.vars[`$ids:${e.store}`] = made;
    return;
  },
  manifestDread(s, r, e, ctx, key) {
    const players = e.who ? resolveRef(s, ctx, e.who) : [ctx.controller];
    const times = e.times === undefined ? 1 : Math.max(0, evalAmount(s, ctx, e.times));
    const made = (r.vars[key("dreadMade")] ?? []).map(String);
    let step = Number(r.vars[key("dreadStep")]?.[0] ?? 0);
    for (; step < players.length * times; step++) {
      const player = players[Math.floor(step / times)] as string;
      const library = s.players[player]?.library ?? [];
      const top = library.slice(0, 2);
      if (top.length === 0) continue;
      let chosen = top[0] as string;
      if (top.length === 2) {
        const answer = r.vars[key(`dread${step}`)];
        if (!answer) {
          const creature = top.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Creature"));
          r.vars[key("dreadStep")] = [step];
          r.vars[key("dreadMade")] = made;
          return {
            ask: {
              player,
              key: key(`dread${step}`),
              request: {
                type: "pick",
                intent: "pickCards",
                prompt: "Manifestation effroyable : la carte à manifester (l'autre va au cimetière)",
                options: top,
                min: 1,
                max: 1,
                suggested: [creature ?? (top[0] as string)],
              },
            },
          };
        }
        chosen = String(answer[0]);
      }
      const rest = top.filter((id) => id !== chosen);
      const id = putFaceDown(s, player, chosen, false);
      if (id) made.push(id);
      const graveyard = rest.map((c) => moveAndLog(s, c, "graveyard")).filter((c): c is string => !!c);
      rulesEvent(s, { e: "manifestDread", player, graveyard });
    }
    r.vars[key("dreadStep")] = [step];
    if (e.store) r.vars[`$ids:${e.store}`] = made;
    return;
  },
  revealFaceDown(s, r, e, ctx, key) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !o.faceDown) continue;
      const card = s.defs[o.faceDown.card];
      if (!r.vars[key(`revealed-${id}`)]) {
        emit({ type: "reveal", player: o.controller, defIds: [o.faceDown.card] });
        r.vars[key(`revealed-${id}`)] = [1];
      }
      if (!card?.types.includes("Creature")) continue;
      const answer = r.vars[key(`up-${id}`)];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key(`up-${id}`),
            request: { type: "yesNo", intent: "may", prompt: `Retourner ${cardRef(card.id)} face visible ?`, suggested: [1] },
          },
        };
      }
      if (answer[0] === 1) turnFaceUp(s, id);
    }
    return;
  },
  turnFaceUp(s, r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const card = s.objects[id]?.faceDown ? s.defs[s.objects[id]?.faceDown?.card ?? ""] : undefined;
      // Une carte d'éphémère ou de rituel ne peut pas être retournée face visible : Etrata l'exile (`store`), pour la
      // lancer ensuite sans payer.
      if (e.orExileCast && card && (card.types.includes("Instant") || card.types.includes("Sorcery"))) {
        const exiled = moveObject(s, id, "exile");
        if (exiled && e.store) r.vars[`$ids:${e.store}`] = [exiled];
        continue;
      }
      turnFaceUp(s, id);
    }
    return;
  },
};

/** « Regard » et « surveillance » (même traitement, selon `e.op`). */
function scryOrSurveil(
  s: GameState,
  r: Resolution,
  e: Extract<Effect, { op: "scry" | "surveil" }>,
  ctx: EffectContext,
  key: (suffix: string) => string,
): OpResult {
  const library = s.players[ctx.controller]?.library ?? [];
  const top = library.slice(0, evalAmount(s, ctx, e.amount));
  if (top.length === 0) return;
  const scry = e.op === "scry";
  const picked = r.vars[key("pick")];
  if (!picked) {
    return {
      ask: {
        player: ctx.controller,
        key: key("pick"),
        request: {
          type: "pick",
          intent: scry ? "scryBottom" : "surveilGraveyard",
          prompt: scry
            ? `Regard ${top.length} : choisissez les cartes à mettre au-dessous de votre bibliothèque`
            : `Surveillance ${top.length} : choisissez les cartes à mettre dans votre cimetière`,
          options: top,
          min: 0,
          max: top.length,
          suggested: [],
        },
      },
    };
  }
  const keep = top.filter((id) => !picked.includes(id));
  let order = keep;
  if (keep.length > 1) {
    const answer = r.vars[key("order")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("order"),
          request: {
            type: "order",
            intent: "scryOrder",
            prompt: "Ordre des cartes remises au-dessus (la première sera piochée en premier)",
            items: keep,
            suggested: keep,
          },
        },
      };
    }
    order = answer.map(String);
  }
  const player = s.players[ctx.controller];
  if (!player) return;
  const rest = player.library.slice(top.length);
  // « Chaque fois que vous regardez ou surveillez » (Reality Fracture).
  logTurnEvent(s, { e: "scry", player: ctx.controller });
  rulesEvent(s, { e: "scry", player: ctx.controller });
  if (scry) {
    player.library = [...order, ...rest, ...picked.map(String)];
    emit({ type: "scry", player: ctx.controller, top: order.length, bottom: picked.length });
  } else {
    player.library = [...order, ...rest];
    if (e.op === "surveil") store(r, e.store, order.length);
    // Enlightened Confidant, Chandra : certaines des cartes ainsi mises au cimetière vont ensuite en main.
    const toHand = e.op === "surveil" ? e.toHand : undefined;
    const maxMv = toHand?.maxManaValue !== undefined ? evalAmount(s, ctx, toHand.maxManaValue) : Number.POSITIVE_INFINITY;
    for (const id of picked.map(String)) {
      const back =
        !!toHand &&
        manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= maxMv &&
        (!toHand.filter || matchesCard(s, ctx.controller, id, { ...toHand.filter, controller: undefined }));
      const uid = s.objects[id]?.uid;
      player.library.push(id); // temporaire : moveAndLog le retire de la bibliothèque
      moveAndLog(s, id, "graveyard");
      const now = back ? player.graveyard.find((g) => s.objects[g]?.uid === uid) : undefined;
      if (now) moveAndLog(s, now, "hand");
    }
  }
  return;
}

/** Peut-on attribuer à chaque carte une couleur distincte parmi les siennes ? (petits ensembles : recherche exhaustive) */
function distinctColors(options: string[][], used = new Set<string>()): boolean {
  const [first, ...rest] = options;
  if (!first) return true;
  return first.some((c) => {
    if (used.has(c)) return false;
    used.add(c);
    const ok = distinctColors(rest, used);
    used.delete(c);
    return ok;
  });
}

/** Suggestion « une carte par couleur » : chaque carte prend une couleur pas encore prise (dans l'ordre). */
function onePerColor(pool: string[], colorsOf: (id: string) => string[]): string[] {
  const used = new Set<string>();
  return pool.filter((id) => {
    const c = colorsOf(id).find((x) => !used.has(x));
    if (c) used.add(c);
    return !!c;
  });
}
