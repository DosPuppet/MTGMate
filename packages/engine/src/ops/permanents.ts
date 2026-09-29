/** Effets du moteur : modifications de permanents, contrôle, copies et jetons. Chaque clé est un `op` d'`Effect` (voir `runEffect`, effects.ts). */

import { createTokenCopy, createTokens, removeFromCombat } from "../actions";
import type { OpHandlers } from "../effects";
import { addEffect, addPump, attach, evalAmount, exiledUid, nameOf, resolveRef } from "../effects";
import { copiedDefId } from "../layers";
import {
  bump,
  changeCounters,
  chars,
  createObject,
  isCreature,
  isPlayer,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  rulesEvent,
  setController,
  tapObject,
} from "../state";
import { addPlayerEffect, tokenMultiplier } from "../statics";
import { matchesCard, matchesObjectFilter } from "../targets";
import { createDelayed } from "../triggers";
import type { Color } from "../types";

export const HANDLERS: OpHandlers = {
  pump(s, _r, e, ctx) {
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
    return;
  },
  pumpAll(s, _r, e, ctx) {
    const ids = s.battlefield.filter((id) => isCreature(s, id) && matchesObjectFilter(s, ctx.controller, id, e.filter));
    addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
    return;
  },
  modify(s, _r, e, ctx) {
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    if (ids.length === 0) return;
    // 611.2b : un effet « tant que [la source] reste… » ne fait rien si elle est déjà partie.
    if (e.whileSource && !onBattlefield(s, ctx.sourceId)) return;
    bump(s);
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: e.duration,
      ...(e.duration === "untilYourNextTurn" ? { until: ctx.controller } : {}),
      ...(e.untilLeavesExile ? { untilExiledUid: exiledUid(s, ctx, e.untilLeavesExile) } : {}),
      ...(e.whileSource ? { whileSource: ctx.sourceId } : {}),
      ...e.mods,
    });
    return;
  },
  harness(s, _r, _e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.harnessed) return;
    o.harnessed = true;
    bump(s);
    return;
  },
  amass(s, _r, e, ctx) {
    const n = Math.max(0, evalAmount(s, ctx, e.amount));
    for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
      let army = s.battlefield.find((id) => s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Army"));
      if (!army) {
        const spec = {
          name: `${e.subtype} Army`,
          colors: ["B" as const],
          types: ["Creature" as const],
          subtypes: [e.subtype, "Army"],
          power: 0,
          toughness: 0,
        };
        army = createTokens(s, p, spec, 1)[0];
      }
      const o = army ? s.objects[army] : undefined;
      if (!o) continue;
      if (n > 0) changeCounters(s, o, "+1/+1", n);
      // 701.47a : l'Armée devient aussi du sous-type indiqué.
      if (!chars(s, o.id).subtypes.includes(e.subtype)) {
        bump(s);
        s.effects.push({
          id: newId(s, "e"),
          timestamp: nextTimestamp(s),
          affected: [o.id],
          duration: "permanent",
          addSubtypes: [e.subtype],
        });
      }
    }
    return;
  },
  attach(s, _r, e, ctx) {
    // Plusieurs Équipements vers une même créature (Beatrix, Loyal General).
    const to = resolveRef(s, ctx, e.to)[0];
    if (to) for (const what of resolveRef(s, ctx, e.what)) attach(s, what, to);
    return;
  },
  emblem(s, r, e, ctx) {
    const defId = `emblem:${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    s.defs[defId] ??= {
      id: defId,
      name: e.name,
      typeLine: "Emblème",
      manaCost: null,
      manaCostText: "",
      colors: [],
      supertypes: [],
      types: [],
      subtypes: [],
      keywords: [],
      abilities: e.abilities,
      text: e.text,
      implemented: true,
      isToken: true,
    };
    const emblem = createObject(s, defId, ctx.controller, "command", { isToken: true });
    if (e.untilYourNextTurn) emblem.expiresAtTurnOf = ctx.controller;
    if (e.thisTurn) emblem.expiresEndOfTurn = true;
    if (e.store) r.vars[`$ids:${e.store}`] = [emblem.id];
    bump(s);
    return;
  },
  createTokens(s, r, e, ctx) {
    const n = evalAmount(s, ctx, e.count);
    const created: string[] = [];
    const pt = e.pt !== undefined ? evalAmount(s, ctx, e.pt) : undefined;
    const token = pt === undefined ? e.token : { ...e.token, power: pt, toughness: pt };
    for (const p of e.for ? resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x)) : [ctx.controller])
      created.push(...createTokens(s, p, token, n));
    if (e.tapped || e.attacking) {
      for (const id of created) {
        const o = s.objects[id];
        if (o) o.tapped = true;
      }
      bump(s);
    }
    if (e.attacking && s.combat) {
      // 508.4 : ils attaquent sans avoir été déclarés (pas de déclencheur « attaque »).
      const defender = s.combat.attackers.find((a) => a.id === ctx.sourceId)?.defender ?? opponentsOf(s, ctx.controller)[0] ?? "";
      for (const id of created) s.combat.attackers.push({ id, defender, blockers: [], blocked: false });
      bump(s);
    }
    if (e.store) r.vars[`$ids:${e.store}`] = created;
    return;
  },
  modifyAll(s, _r, e, ctx) {
    // « valeur de mana X ou moins » : le X du sort (Day of Black Sun).
    const f = e.filter.maxManaValueX ? { ...e.filter, maxManaValueX: undefined, maxManaValue: ctx.x } : e.filter;
    const ids = s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, f, ctx.sourceId));
    if (ids.length === 0) return;
    bump(s);
    // « … jusqu'à votre prochain tour » (For the Common Good).
    const until = e.duration === "untilYourNextTurn";
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: until ? "untilYourNextTurn" : "endOfTurn",
      ...(until ? { until: ctx.controller } : {}),
      ...e.mods,
    });
    return;
  },
  untapAll(s, _r, e, ctx) {
    for (const id of s.battlefield) {
      const o = s.objects[id];
      if (o?.controller !== ctx.controller || !o.tapped || !matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId))
        continue;
      o.tapped = false;
      bump(s);
      rulesEvent(s, { e: "untap", objectId: id });
    }
    return;
  },
  chooseCardName(s, r, _e, ctx, key) {
    if (r.vars.$name) return;
    const answer = r.vars[key("name")];
    if (!answer) {
      // Pas d'information cachée : les noms sont triés, la suggestion vient des cimetières (publics).
      const names = [
        ...new Set(
          Object.values(s.defs)
            .filter((d) => !d.isToken && !d.meldResult)
            .map((d) => d.name),
        ),
      ].sort();
      const opp = opponentsOf(s, ctx.controller)[0];
      const seen = (opp ? (s.players[opp]?.graveyard ?? []) : []).map((x) => s.defs[s.objects[x]?.defId ?? ""]?.name ?? "");
      const suggested = seen.find((n) => names.includes(n)) ?? names[0] ?? "";
      return {
        ask: {
          player: ctx.controller,
          key: key("name"),
          request: {
            type: "pick",
            intent: "chooseOnEnter",
            prompt: "Choisissez un nom de carte",
            options: names,
            labels: Object.fromEntries(names.map((n) => [n, n])),
            min: 1,
            max: 1,
            suggested: [suggested],
          },
        },
      };
    }
    r.vars.$name = [String(answer[0])];
    return;
  },
  copyToken(s, _r, e, ctx) {
    // Doubling Season s'applique aussi aux jetons copies.
    const base = e.count === undefined ? 1 : evalAmount(s, ctx, e.count);
    for (const id of resolveRef(s, ctx, e.of)) {
      const model = s.objects[id] ?? undefined;
      const defId = model?.defId ?? s.lki[id]?.defId;
      if (!defId) continue;
      const creature =
        model?.zone === "battlefield" ? chars(s, id).types.includes("Creature") : !!s.defs[defId]?.types.includes("Creature");
      const n = base * tokenMultiplier(s, ctx.controller, creature || !!e.addTypes?.includes("Creature"));
      for (let i = 0; i < n; i++) {
        const token = createTokenCopy(s, ctx.controller, defId);
        const tok = s.objects[token];
        if (e.tapped && tok) tapObject(s, tok);
        if (e.addTypes?.length) addEffect(s, [token], { addTypes: e.addTypes }, "permanent");
        if (e.addKeywords?.length) addEffect(s, [token], { addKeywords: e.addKeywords }, "permanent");
        if (e.addSubtypes?.length) addEffect(s, [token], { addSubtypes: e.addSubtypes }, "permanent");
        if (e.legendary) addEffect(s, [token], { addSupertypes: ["Legendary"] }, "permanent");
        if (e.addAbilities?.length) addEffect(s, [token], { addAbilities: e.addAbilities }, "permanent");
        if (e.pt !== undefined) addEffect(s, [token], { setPower: e.pt, setToughness: e.pt }, "permanent");
        // Firion : des capacités d'Équiper moins chères (ajoutées ; la moins chère sera utilisée).
        if (e.equipDiscount) {
          const equips = (s.defs[defId]?.abilities ?? []).flatMap((ab) =>
            ab.kind === "activated" && ab.label?.startsWith("Équiper") && ab.cost.mana
              ? [
                  {
                    ...ab,
                    cost: {
                      ...ab.cost,
                      mana: { ...ab.cost.mana, generic: Math.max(0, ab.cost.mana.generic - (e.equipDiscount ?? 0)) },
                    },
                    label: `${ab.label} (réduit)`,
                  },
                ]
              : [],
          );
          if (equips.length) addEffect(s, [token], { addAbilities: equips }, "permanent");
        }
        if (e.sacrificeAtNextUpkeep) {
          createDelayed(
            s,
            ctx.controller,
            token,
            s.objects[token]?.defId ?? defId,
            { targets: [], effects: [{ op: "sacrificeIt", what: { kind: "target", id: "c" } }], bound: { c: [token] } },
            "nextUpkeep",
          );
        }
        if (e.setColors || e.setSubtypes) {
          addEffect(s, [token], { setColors: e.setColors, setSubtypes: e.setSubtypes }, "permanent");
        }
        if (e.attacking && s.combat) {
          // Calamity : « engagé et attaquant » (il attaque ce qu'attaque une de vos créatures).
          const tok = s.objects[token];
          if (tok) tok.tapped = true;
          const defender =
            s.combat.attackers.find((a) => s.objects[a.id]?.controller === ctx.controller)?.defender ??
            opponentsOf(s, ctx.controller)[0] ??
            "";
          s.combat.attackers.push({ id: token, defender, blockers: [], blocked: false });
          bump(s);
        }
        if (e.sacrificeAtEndStep || e.exileAtEndStep) {
          createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, {
            targets: [],
            effects: [
              e.exileAtEndStep
                ? { op: "exile", what: { kind: "target", id: "copy" } }
                : { op: "sacrificeIt", what: { kind: "target", id: "copy" } },
            ],
            bound: { copy: [token] },
            label: e.exileAtEndStep ? "exiler la copie" : "sacrifier la copie",
          });
        }
      }
    }
    return;
  },
  chooseCopy(s, r, e, ctx, key) {
    if (r.vars.$copyOf) return;
    // Superior Spider-Man : une carte de créature de n'importe quel cimetière.
    const options = e.fromGraveyards
      ? s.playerOrder.flatMap((p) =>
          (s.players[p]?.graveyard ?? []).filter((id) => matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId)),
        )
      : s.battlefield.filter(
          (id) =>
            (e.anyController || s.objects[id]?.controller === ctx.controller) &&
            id !== ctx.sourceId &&
            matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
        );
    const answer = options.length ? r.vars[key("copy")] : [];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("copy"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: e.fromGraveyards
              ? `${nameOf(s, ctx.sourceId)} : vous pouvez le faire arriver comme copie d'une carte de créature d'un cimetière`
              : `${nameOf(s, ctx.sourceId)} : vous pouvez la faire arriver comme copie d'un permanent`,
            options,
            min: 0,
            max: 1,
            suggested: options.slice(0, 1),
          },
        },
      };
    }
    const picked = answer.map(String).find((id) => options.includes(id));
    r.vars.$copyOf = picked ? [e.fromGraveyards ? (s.objects[picked]?.defId ?? "") : copiedDefId(s, picked)] : [];
    // La carte copiée depuis un cimetière est exilée une fois le permanent arrivé.
    if (picked && e.fromGraveyards) r.vars.$copyCard = [picked];
    return;
  },
  becomeCopyKeepAbilities(s, _r, e, ctx) {
    const card = resolveRef(s, ctx, e.what)[0];
    const self = s.objects[ctx.sourceId];
    const d = s.defs[s.objects[card ?? ""]?.defId ?? ""];
    if (!card || !d || self?.zone !== "battlefield") return;
    // « … sauf qu'elle est 0/0 et a cette capacité » : ses capacités activées imprimées sont conservées.
    const own = (s.defs[self.defId]?.abilities ?? []).filter((a) => a.kind === "activated");
    addEffect(s, [self.id], { copyOf: d.id, setPower: 0, setToughness: 0, addAbilities: own }, "permanent");
    return;
  },
  chooseOnEnter(s, r, e, ctx, key) {
    if (r.vars.$chosen) return;
    const answer = r.vars[key("chosen")];
    const kind = e.kind;
    if (!answer) {
      let options: string[];
      if (kind === "color") options = ["W", "U", "B", "R", "G"];
      else if (kind === "parity") options = ["odd", "even"];
      else if (kind === "landName") {
        // Petrified Hamlet : un nom de carte de terrain, ceux des terrains adverses en tête (non de base d'abord).
        const opp = s.battlefield.filter((id) => s.objects[id]?.controller !== ctx.controller);
        const oppLands = opp.map((id) => s.defs[s.objects[id]?.defId ?? ""]).filter((d) => d?.types.includes("Land"));
        const lands = Object.values(s.defs).filter((d) => d.types.includes("Land") && !d.isToken);
        options = [
          ...new Set([
            ...oppLands.filter((d) => !d?.supertypes.includes("Basic")).map((d) => d?.name ?? ""),
            ...oppLands.map((d) => d?.name ?? ""),
            ...lands.map((d) => d.name).sort(),
          ]),
        ].filter(Boolean);
      } else if (kind === "cardName") {
        // Sorcerous Spyglass : on regarde la main d'un adversaire (ses cartes d'abord), puis on nomme une carte.
        const opp = opponentsOf(s, ctx.controller)[0];
        const inHand = (opp ? (s.players[opp]?.hand ?? []) : []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name ?? "");
        const all = Object.values(s.defs)
          .filter((d) => !d.isToken)
          .map((d) => d.name);
        options = [...new Set([...inHand.filter(Boolean), ...s.battlefield.map((id) => chars(s, id).name), ...all.sort()])];
      } else {
        const set = new Set<string>();
        for (const d of Object.values(s.defs))
          if (d.types.includes("Creature") && !d.isToken) for (const t of d.subtypes) set.add(t);
        options = [...set].sort();
      }
      // Suggestion : le type ou la couleur les plus présents chez le contrôleur.
      const tally = new Map<string, number>();
      const pl = s.players[ctx.controller];
      for (const id of [
        ...s.battlefield.filter((x) => s.objects[x]?.controller === ctx.controller),
        ...(pl?.hand ?? []),
        ...(pl?.library ?? []),
      ]) {
        const d = s.defs[s.objects[id]?.defId ?? ""];
        const keys = kind === "color" ? (d?.colors ?? []) : d?.types.includes("Creature") ? d.subtypes : [];
        for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
      }
      const best =
        kind === "cardName" || kind === "landName" || kind === "parity"
          ? options[0]
          : ([...tally.entries()].sort((a, b) => b[1] - a[1]).find(([k]) => options.includes(k))?.[0] ?? options[0]);
      const COLOR: Record<string, string> = { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" };
      return {
        ask: {
          player: ctx.controller,
          key: key("chosen"),
          request: {
            type: "pick",
            intent: "chooseOnEnter",
            prompt:
              kind === "color"
                ? "Choisissez une couleur"
                : kind === "cardName"
                  ? "Choisissez un nom de carte (les cartes de la main adverse sont en tête)"
                  : kind === "landName"
                    ? "Choisissez un nom de carte de terrain (ceux de vos adversaires sont en tête)"
                    : kind === "parity"
                      ? "Choisissez : valeur de mana impaire ou paire"
                      : "Choisissez un type de créature",
            options,
            labels:
              kind === "color"
                ? COLOR
                : kind === "parity"
                  ? { odd: "Impaire", even: "Paire" }
                  : Object.fromEntries(options.map((o) => [o, o])),
            min: 1,
            max: 1,
            suggested: [best as string],
          },
        },
      };
    }
    r.vars.$chosen = [kind, String(answer[0])];
    // Capacité déclenchée d'un permanent déjà en jeu (Petrified Hamlet : « quand ce terrain arrive, choisissez… »).
    const src = s.objects[ctx.sourceId];
    if (src?.zone === "battlefield") {
      const value = String(answer[0]);
      src.chosen = {
        ...src.chosen,
        ...(kind === "color"
          ? { color: value as Color }
          : kind === "creatureType"
            ? { creatureType: value }
            : kind === "parity"
              ? { parity: value === "odd" ? ("odd" as const) : ("even" as const) }
              : { cardName: value }),
      };
      bump(s);
    }
    return;
  },
  exchangeControl(s, _r, e, ctx) {
    const a = resolveRef(s, ctx, e.a)[0];
    const b = resolveRef(s, ctx, e.b)[0];
    const oa = a ? s.objects[a] : undefined;
    const ob = b ? s.objects[b] : undefined;
    // 701.10 : l'échange n'a lieu que si les deux permanents sont encore là.
    if (oa?.zone !== "battlefield" || ob?.zone !== "battlefield" || oa.controller === ob.controller) return;
    const [ca, cb] = [oa.controller, ob.controller];
    removeFromCombat(s, oa.id);
    removeFromCombat(s, ob.id);
    setController(s, oa, cb);
    setController(s, ob, ca);
    bump(s);
    return;
  },
  gainControlWhileSource(s, _r, e, ctx) {
    if (!onBattlefield(s, ctx.sourceId)) return;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || o.controller === ctx.controller) continue;
      s.auraControl = [...(s.auraControl ?? []), { host: id, aura: ctx.sourceId, original: o.controller, by: ctx.controller }];
      removeFromCombat(s, id);
      setController(s, o, ctx.controller);
      if (e.restrict) {
        s.effects.push({
          id: newId(s, "e"),
          timestamp: nextTimestamp(s),
          affected: [id],
          duration: "permanent",
          addKeywords: ["cantAttack", "cantBlock"],
          whileSource: ctx.sourceId,
        });
      }
      bump(s);
    }
    return;
  },
  setBasePTAll(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    const ids = s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
    addEffect(s, ids, e.powerOnly ? { setPower: n } : { setPower: n, setToughness: n }, "endOfTurn");
    return;
  },
  gainControl(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || o.controller === ctx.controller) continue;
      s.controlChanges = [...(s.controlChanges ?? []), { id, original: o.controller }];
      removeFromCombat(s, id);
      setController(s, o, ctx.controller);
      bump(s);
    }
    return;
  },
  giveControl(s, _r, e, ctx) {
    const to = resolveRef(s, ctx, e.to).find((x) => isPlayer(s, x));
    if (!to) return;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || o.controller === to) continue;
      removeFromCombat(s, id);
      setController(s, o, to);
      bump(s);
    }
    return;
  },
  unattach(s, _r, e, ctx) {
    const hosts = e.ifAttachedTo ? resolveRef(s, ctx, e.ifAttachedTo) : undefined;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !o.attachedTo) continue;
      if (hosts && !hosts.includes(o.attachedTo)) continue;
      o.attachedTo = undefined;
      bump(s);
    }
    return;
  },
  link(s, _r, e, ctx) {
    const o = s.objects[(e.to ? resolveRef(s, ctx, e.to)[0] : ctx.sourceId) ?? ""];
    if (o) o.linked = [...(o.linked ?? []), ...resolveRef(s, ctx, e.what)];
    // Territory Forge : les capacités de la source dépendent des cartes liées.
    bump(s);
    return;
  },
  becomeCopy(s, _r, e, ctx) {
    const model = resolveRef(s, ctx, e.of).find((id) => onBattlefield(s, id));
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    if (!model || ids.length === 0) return;
    bump(s);
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: e.duration,
      copyOf: copiedDefId(s, model),
    });
    return;
  },
  saddle(s, _r, e, ctx) {
    for (const id of e.what ? resolveRef(s, ctx, e.what) : [ctx.sourceId]) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      o.saddledTurn = s.turn.number;
      bump(s);
      rulesEvent(s, { e: "saddled", objectId: o.id });
    }
    return;
  },
  noLegendRuleThisTurn(s, _r, _e, ctx) {
    addPlayerEffect(s, ctx.controller, { noLegendRule: true }, s.turn.number);
    return;
  },
};
