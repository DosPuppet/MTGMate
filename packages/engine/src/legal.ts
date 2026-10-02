/**
 * Énumération exhaustive des actions légales pour le joueur qui a la priorité.
 * L'interface ne met en surbrillance que ces options ; l'IA et l'autopilot s'en servent aussi.
 */
import { availableMana, canPay, costToText, type ManaPurpose, manaAbilitiesOf, manaSources, manaValue, totalCost } from "./mana";
import {
  abilitiesOf,
  abilityMana,
  abilityPurpose,
  abilityReduction,
  abilityZone,
  activatedAbility,
  additionalOptions,
  altCostFor,
  autoAdditional,
  BASIC_LAND_TYPES,
  canCastTiming,
  canPayNonManaCost,
  canPlayLand,
  castableFaces,
  castTerms,
  craftMaterials,
  craftSpec,
  crewCandidates,
  crewPower,
  discardCostOptions,
  equipDiscount,
  evidenceCards,
  FACE_DOWN_SPELL,
  graveyardToExile,
  greatestToughness,
  harmonizeOptions,
  hasConvoke,
  hasImprovise,
  instantLoyalty,
  isWebSlinging,
  kickerCostOptions,
  kickerCostPermanent,
  modesOf,
  sacrificeOptions,
  sorceryTiming,
  spellCost,
  spellView,
  splitSecondOnStack,
  suggestedCrew,
  symbolCards,
  tapOthersOptions,
  warpOf,
  waterbendAmount,
  webSlingingOptions,
} from "./stack";
import { matchesCard, matchesObjectFilter } from "./targets";

/** Winter, Cursed Rider : nombre de cartes exilables pour « exilez X cartes … de votre cimetière ». */
function graveyardXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return (s.players[player]?.graveyard ?? []).filter((id) => id !== source && matchesCard(s, player, id, f, source)).length;
}

/** Radiant Lotus : nombre de permanents sacrifiables pour « sacrifiez un ou plusieurs … ». */
function sacrificeXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source)).length;
}

/** Secluded Starforge : nombre de permanents dégagés engageables pour « engagez X … ». */
function tapXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return s.battlefield.filter(
    (id) =>
      id !== source && obj(s, id).controller === player && !obj(s, id).tapped && matchesObjectFilter(s, player, id, f, source),
  ).length;
}

import { snapshot } from "./layers";
import { chars, isCreature, obj } from "./state";
import { playerStatic } from "./statics";
import { legalTargets } from "./targets";
import { checkCondition } from "./triggers";
import type {
  ActionOption,
  CardDef,
  GameState,
  ManaCost,
  ObjectFilter,
  ObjectId,
  PlayerId,
  TargetOption,
  TargetSpec,
} from "./types";

const GIFT_TEXT = { card: "une carte", food: "une Nourriture", fish: "un Poisson engagé", treasure: "un Trésor" } as const;

/** Libellés de la question du kicker : Progéniture (702.175), Cadeau (702.174), Marchandage (702.166). */
function kickerPrompt(d: CardDef): { title: string; without: string; with: string } | undefined {
  if (d.kickerKind === "offspring" && d.kicker) {
    const c = costToText(d.kicker);
    return { title: `Payer la progéniture ${c} ?`, without: "Sans progéniture", with: `Progéniture ${c}` };
  }
  if (d.kickerKind === "life" && d.kickerCost?.life) {
    const pay = d.kickerOrPay ? costToText(d.kickerOrPay) : "";
    return {
      title: `Payer ${d.kickerCost.life} points de vie plutôt que ${pay} ?`,
      without: `Payer ${pay}`,
      with: `Payer ${d.kickerCost.life} PV`,
    };
  }
  if (d.kickerKind === "waterbend" && d.kicker) {
    const c = costToText(d.kicker);
    return {
      title: `Maîtriser l'eau ${c} (vos artefacts et créatures dégagés peuvent payer {1} chacun) ?`,
      without: "Sans maîtriser l'eau",
      with: `Maîtriser l'eau ${c}`,
    };
  }
  if (d.kickerKind === "blight" && d.kickerCost?.blight) {
    const n = d.kickerCost.blight;
    return {
      title: `Flétrir ${n} : mettre ${n} marqueur(s) -1/-1 sur une de vos créatures ?`,
      without: "Sans flétrir",
      with: `Flétrir ${n}`,
    };
  }
  if (d.kickerKind === "teamwork" && d.kickerCost?.tapPower) {
    const n = d.kickerCost.tapPower;
    return {
      title: `Travail d'équipe ${n} : engager des créatures de force totale ${n} ou plus ?`,
      without: "Sans travail d'équipe",
      with: `Travail d'équipe ${n}`,
    };
  }
  if (d.kickerKind === "exileGraveyard" && d.kickerCost?.exileGraveyard) {
    const n = d.kickerCost.exileGraveyard;
    const pay = d.kickerOrPay ? costToText(d.kickerOrPay) : "";
    return {
      title: `Exiler ${n} carte(s) de votre cimetière plutôt que payer ${pay} ?`,
      without: `Payer ${pay}`,
      with: `Exiler ${n} carte(s)`,
    };
  }
  if (d.kickerKind === "evidence" && d.kickerCost?.collectEvidence) {
    const n = d.kickerCost.collectEvidence;
    return {
      title: `Réunir des preuves ${n} : exiler des cartes de votre cimetière de valeur de mana totale ${n} ou plus ?`,
      without: "Sans preuves",
      with: `Réunir des preuves ${n}`,
    };
  }
  if (d.kickerKind === "bargain") {
    return {
      title: "Marchander : sacrifier un artefact, un enchantement ou un jeton ?",
      without: "Sans marchander",
      with: "Marchander",
    };
  }
  if (d.kickerKind === "gift" && d.gift) {
    return {
      title: "Promettre un cadeau à un adversaire ?",
      without: "Sans cadeau",
      with: `Offrir ${GIFT_TEXT[d.gift]}`,
    };
  }
  return undefined;
}

function targetOptions(s: GameState, player: PlayerId, specs: TargetSpec[], sourceId?: ObjectId): TargetOption[] {
  return specs.map((t) => {
    const legal = legalTargets(s, player, t, sourceId);
    const opt: TargetOption = {
      id: t.id,
      label: t.label,
      optional: !!t.optional,
      legal,
      count: t.count && t.count > 1 ? t.count : undefined,
      min: t.minCount,
      ...(t.countX ? { countX: t.countX } : {}),
      kickedCount: t.kickedCount,
      kickedLegal: t.kickedFilter ? legalTargets(s, player, { ...t, filter: t.kickedFilter }, sourceId) : undefined,
      otherThan: t.otherThan,
      attachedToTarget: t.attachedToTarget,
    };
    if (t.samePlayer || t.differentPlayers) {
      const holders: Record<string, string> = {};
      for (const id of legal) {
        const o = s.objects[id];
        holders[id] = o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
      }
      opt.group = { kind: t.samePlayer ? "same" : "different", holders };
    }
    // Noms différents : même contrainte « différents », le nom tenant lieu de joueur.
    if (t.differentNames) {
      const holders: Record<string, string> = {};
      for (const id of legal) holders[id] = (s.objects[id] ? snapshot(s, id).name : undefined) ?? id;
      opt.group = { kind: "different", holders };
    }
    return opt;
  });
}

function targetsAvailable(opts: TargetOption[]): boolean {
  return opts.every((t) => {
    // « X cibles » : X peut valoir 0.
    if (t.optional || t.countX) return true;
    const need = t.min ?? t.count ?? 1;
    if (t.group?.kind === "different") return new Set(Object.values(t.group.holders)).size >= need;
    return t.legal.length >= need;
  });
}

/** Plus grande valeur de X payable pour un coût qui dépend de X. */
function maxXFor(
  s: GameState,
  player: PlayerId,
  costAt: (x: number) => ManaCost,
  /** À quoi sert le mana pour cette valeur de X (maîtrise de l'eau {X}). */
  purposeAt?: (x: number) => ManaPurpose,
): number {
  const upper = availableMana(s, player, undefined, purposeAt?.(Number.MAX_SAFE_INTEGER)) - manaValue(costAt(0));
  for (let x = upper; x > 0; x--) if (canPay(s, player, costAt(x), undefined, purposeAt?.(x))) return x;
  return 0;
}

/** Plus grande valeur de X payable (null si le coût n'a pas de X). */
function maxX(
  s: GameState,
  player: PlayerId,
  cost: ManaCost | null | undefined,
  exclude?: ReadonlySet<ObjectId>,
  /** À quoi sert le mana (capacité activée : sa source, maîtrise de l'eau). */
  purpose?: ManaPurpose,
): number | null {
  if (!cost?.x) return null;
  const upper = Math.floor((availableMana(s, player, exclude, purpose) - manaValue(cost)) / cost.x);
  for (let x = upper; x > 0; x--) if (canPay(s, player, totalCost(cost, x), exclude, purpose)) return x;
  return 0;
}

/** Choix des créatures d'équipage ou de monture : force totale requise, forces, choix par défaut. */
function crewSpec(s: GameState, player: PlayerId, source: ObjectId, n: number) {
  const options = crewCandidates(s, player, source);
  const suggested = suggestedCrew(s, player, source, n);
  return {
    count: suggested.length,
    options,
    minPower: n,
    powers: Object.fromEntries(options.map((id) => [id, Math.max(0, crewPower(s, id))])),
    suggested,
  };
}

export function legalActions(s: GameState, player: PlayerId): ActionOption[] {
  const p = s.pending;
  if (p?.kind !== "priority" || p.player !== player) return [];
  const out: ActionOption[] = [{ type: "pass" }];
  const hand = s.players[player]?.hand ?? [];

  // Cartes jouables : main, cimetière (flashback, Muldrotha, Zul Ashur…) et exil (impulsion, Etali, Tinybones).
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  const exiled = s.exile.filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  // Dessus de la bibliothèque (Vizier of the Menagerie).
  const top = s.players[player]?.library[0];
  if (top && castTerms(s, player, top)) exiled.push(top);
  for (const card of [...hand, ...graveyard, ...exiled]) {
    const d = s.defs[obj(s, card).defId];
    if (!d) continue;
    if (d.types.includes("Land")) {
      if (canPlayLand(s, player, card)) {
        // Terrain choc : payer les points de vie (dégagé) ou non (engagé).
        // Multiversal Passage : une option par type de terrain de base choisi.
        const types = d.chooseOnEnter === "landType" ? BASIC_LAND_TYPES : [undefined];
        for (const landType of types) {
          const extra = landType ? { landType } : {};
          if (d.shockLand && (s.players[player]?.life ?? 0) >= d.shockLand)
            out.push({ type: "playLand", card, payLife: true, ...extra });
          out.push({ type: "playLand", card, ...extra });
        }
      }
      // Ville à aventure : l'Aventure reste lançable ; un terrain déguisé, face cachée (Branch of Vitu-Ghazi).
      if (d.layout !== "adventure" && !d.disguise) continue;
    }
    const terms = castTerms(s, player, card);
    if (!terms || !d.implemented) continue;
    // Chaque face lançable (la carte, son aventure) donne une option distincte ; le déguisement, face cachée.
    if (!terms.warpOnly) for (const [face, faceDef] of castableFaces(s, card, d)) castOption(card, face, faceDef, terms);
    if (d.disguise) castOption(card, undefined, FACE_DOWN_SPELL, terms, "faceDown");
    // Distorsion (702.185) : depuis la main, ou le cimetière si la carte le permet.
    const warp = warpOf(s, player, card, d);
    const life = s.players[player]?.life ?? 0;
    if (warp && (terms.source === "hand" || terms.warpOnly) && life >= (warp.life ?? 0)) {
      castOption(card, undefined, { ...d, manaCost: warp.cost }, terms, "warp");
    }
  }

  function castOption(
    card: ObjectId,
    face: number | undefined,
    d: CardDef,
    terms: NonNullable<ReturnType<typeof castTerms>>,
    variant?: "faceDown" | "warp",
  ) {
    // Timing : normal, ignoré (Etali), ou flash moyennant un surcoût (Harbinger of the Tides).
    const onTime = terms.anyTime || (terms.sorceryTiming ? sorceryTiming(s, player) : canCastTiming(s, player, d));
    if (!onTime && !d.flashExtraCost) return;
    const timingExtra = onTime ? undefined : d.flashExtraCost;
    const flashback = terms.source === "flashback";
    const modes = modesOf(d)
      .map((m, index) => ({
        index,
        label: m.label,
        targets: targetOptions(s, player, m.targets, card),
        extra: m.extraCost,
        ok: !m.condition || m.condition.kind === "kicked" || checkCondition(s, m.condition, player, card),
        requiresKicker: m.condition?.kind === "kicked" || undefined,
      }))
      .filter((m) => m.ok)
      // Cadeau promis : les cibles propres au cadeau suffisent (Into the Flood Maw sans créature adverse).
      .filter(
        (m) =>
          targetsAvailable(m.targets) ||
          (!!d.kicker && targetsAvailable(m.targets.map((t) => (t.kickedLegal ? { ...t, legal: t.kickedLegal } : t)))),
      )
      // Spree : le coût supplémentaire du mode doit être payable.
      .filter((m) => !m.extra || canPay(s, player, totalCost(spellCost(s, player, d, { free: terms.free }), 0, m.extra)))
      .map(({ extra: _, ok: __, ...m }) => m);
    if (modes.length === 0) return;
    const additional = additionalOptions(s, player, card, d, terms.source === "flashback");
    if (!additional) return;
    // Coûts additionnels choisis automatiquement : ces permanents ne peuvent pas servir à payer le mana.
    const auto = autoAdditional(s, player, card, d, terms.source === "flashback");
    if (!auto) return;
    const spent = [...auto.tap, ...auto.exile, ...auto.bounce];
    const exclude = spent.length ? new Set(spent) : undefined;
    const purpose0: ManaPurpose = {
      spell: spellView(d, player),
      convoke: hasConvoke(s, player, d),
      improvise: hasImprovise(s, player, d) || undefined,
      delve: playerStatic(s, player, "delveSpells"),
      fromHand: terms.source === "hand",
    };
    // Maîtrise de l'eau en coût additionnel : sa part du coût, selon le kicker et X.
    const purposeFor = (kicked: boolean, x: number): ManaPurpose => {
      const w = waterbendAmount(d, kicked, x) + (terms.waterbendOverride ? (terms.costOverride?.generic ?? 0) : 0);
      return w ? { ...purpose0, waterbend: w } : purpose0;
    };
    const purpose = purposeFor(false, 0);
    const base = {
      flashback,
      anyMana: terms.anyMana,
      mayhem: terms.mayhem,
      costOverride: terms.costOverride,
      fromZone: terms.source,
      card,
    };
    // « Sacrifiez une créature ou payez {3}{B} » : sans créature à sacrifier, le mana s'ajoute au coût.
    const sac = additional.sacrifice;
    const mustPayInstead = !!sac?.orPay && sac.options.length < sac.count;
    // Titania : sans carte à défausser, le mana s'ajoute au coût.
    const dis = additional.discard;
    const mustPayDiscard = !!dis?.orPay && dis.options.length < dis.count;
    const withExtra = (c: ManaCost) => {
      const a0 = mustPayInstead && sac?.orPay ? totalCost(c, 0, sac.orPay) : c;
      const a = mustPayDiscard && dis?.orPay ? totalCost(a0, 0, dis.orPay) : a0;
      return timingExtra ? totalCost(a, 0, timingExtra) : a;
    };
    // Harmonie : payable aussi en engageant une créature (qui ne sert alors pas à payer le mana).
    const harmony =
      flashback && (d.harmonize || terms.harmonize)
        ? harmonizeOptions(s, player, card, withExtra(spellCost(s, player, d, base)).generic)
        : undefined;
    const payableWith = (c: ManaCost) =>
      canPay(s, player, c, exclude, purpose) ||
      !!harmony?.options.some((id) =>
        canPay(s, player, totalCost(c, 0, undefined, harmony.powers[id] ?? 0), new Set([...(exclude ?? []), id]), purpose),
      );
    const normal = !terms.free && payableWith(withExtra(spellCost(s, player, d, base)));
    // Sans payer son coût de mana : les taxes (Thalia, the Survivor) et coûts supplémentaires restent à payer.
    const freePayable = () => payableWith(withExtra(spellCost(s, player, d, { ...base, free: true })));
    if (terms.free && !freePayable()) return;
    const freeAvailable = !!terms.freeOptional && freePayable();
    const alt = terms.free ? undefined : altCostFor(s, player, d);
    const altAvailable =
      !!alt &&
      (!alt.collectEvidence || !!evidenceCards(s, player, card, alt.collectEvidence)) &&
      canPay(s, player, withExtra(spellCost(s, player, d, { ...base, alternative: true })), exclude, purpose);
    // Kicker payable (« coûte {2} de moins s'il est marchandé » : Hamlet Glutton peut n'être payable que marchandé).
    const kickerAffordable =
      !!d.kicker &&
      !flashback &&
      (!d.kickerCost ||
        (d.kickerCost.tapPower !== undefined
          ? suggestedCrew(s, player, card, d.kickerCost.tapPower).length > 0
          : d.kickerCost.collectEvidence !== undefined
            ? !!evidenceCards(s, player, card, d.kickerCost.collectEvidence)
            : d.kickerCost.life !== undefined
              ? (s.players[player]?.life ?? 0) >= d.kickerCost.life
              : d.kickerCost.exileGraveyard !== undefined
                ? !!graveyardToExile(s, player, card, d.kickerCost.exileGraveyard)
                : !!kickerCostPermanent(s, player, card, d))) &&
      canPay(
        s,
        player,
        withExtra(spellCost(s, player, d, { ...base, kicked: true, free: terms.free })),
        undefined,
        purposeFor(true, 0),
      );
    if (!terms.free && !normal && !freeAvailable && !altAvailable && !kickerAffordable) return;
    // Le mana à payer à la place du sacrifice est-il disponible ?
    if (dis?.orPay) {
      dis.orPayAffordable = canPay(s, player, totalCost(spellCost(s, player, d, base), 0, dis.orPay), undefined, purpose);
    }
    if (sac?.orPay) {
      sac.orPayAffordable = canPay(s, player, totalCost(spellCost(s, player, d, base), 0, sac.orPay), undefined, purpose);
    }
    const hasX = (!terms.free && !!(flashback ? (d.flashback ?? d.manaCost)?.x : d.manaCost?.x)) || d.xCost === "waterbend";
    // Vicious Rivalry : X se paie en points de vie.
    // Soul Immolation : X flétri, au plus la plus grande endurance parmi vos créatures.
    const lifeX = !normal
      ? null
      : d.xCost === "life"
        ? (s.players[player]?.life ?? 0)
        : d.xCost === "blight"
          ? greatestToughness(s, player)
          : null;
    out.push({
      type: "cast",
      card,
      ...(face !== undefined ? { face, faceName: d.name } : {}),
      ...(variant === "faceDown" ? { faceDown: true, faceName: "Face cachée" } : {}),
      ...(variant === "warp" ? { warp: true } : {}),
      modes,
      xMax:
        lifeX ??
        (hasX && (normal || terms.free)
          ? maxXFor(
              s,
              player,
              (x) => withExtra(spellCost(s, player, d, { ...base, x, free: terms.free })),
              (x) => purposeFor(false, x),
            )
          : null),
      kickerAffordable,
      kickerPrompt: d.kicker ? kickerPrompt(d) : undefined,
      fromGraveyard: terms.source === "graveyard" || terms.source === "flashback" ? true : undefined,
      fromExile: terms.source === "exile" ? true : undefined,
      free: terms.free || undefined,
      freeAvailable: freeAvailable || undefined,
      altAvailable: altAvailable || undefined,
      altLabel: altAvailable ? alt?.label : undefined,
      normalAvailable: normal || undefined,
      additional:
        additional.discard || additional.sacrifice || harmony?.options.length
          ? { ...additional, ...(harmony?.options.length ? { tap: { count: 1, ...harmony, optional: true as const } } : {}) }
          : undefined,
      altBounce: altAvailable && isWebSlinging(s, player, d) ? webSlingingOptions(s, player) : undefined,
      kickerPermanents:
        d.kickerCost && !d.kickerCost.tapPower && !d.kickerCost.collectEvidence && !d.kickerCost.exileGraveyard
          ? kickerCostOptions(s, player, card, d)
          : undefined,
      kickerTap: d.kickerCost?.tapPower ? crewSpec(s, player, card, d.kickerCost.tapPower) : undefined,
    });
  }

  const offField = (zone: "graveyard" | "hand", flag: "fromGraveyard" | "fromHand") =>
    (s.players[player]?.[zone] ?? []).filter((id) =>
      s.defs[obj(s, id).defId]?.abilities.some((ab) => ab.kind === "activated" && ab[flag]),
    );
  for (const id of [...s.battlefield, ...offField("graveyard", "fromGraveyard"), ...offField("hand", "fromHand")]) {
    const o = obj(s, id);
    if (o.zone === "battlefield" ? o.controller !== player : o.owner !== player) continue;
    abilitiesOf(s, id).forEach((_, index) => {
      const ab = activatedAbility(s, id, index);
      if (!ab || abilityZone(ab) !== o.zone || !canPayNonManaCost(s, id, ab, index)) return;
      if (ab.sorcerySpeed && !instantLoyalty(s, player, id, ab) && !sorceryTiming(s, player)) return;
      // Fabrication : la source et les matériaux exilés ne paient pas le mana.
      const exclude = ab.cost.craft
        ? new Set([id, ...(craftMaterials(s, player, id, ab) ?? [])])
        : ab.cost.tap
          ? new Set([id])
          : undefined;
      // Warrior's Blades : au mieux, la créature qui porte le plus de marqueurs +1/+1.
      // Dragonfire Blade : au mieux, la créature qui a le plus de couleurs.
      const byColors = ab.reduceByTargetColors
        ? Math.max(
            0,
            ...s.battlefield
              .filter((c) => obj(s, c).controller === player && isCreature(s, c))
              .map((c) => chars(s, c).colors.length),
          )
        : 0;
      const reduction = ab.reduceByTargetCounters
        ? Math.max(
            0,
            ...s.battlefield.filter((c) => obj(s, c).controller === player).map((c) => obj(s, c).counters["+1/+1"] ?? 0),
          )
        : byColors +
          abilityReduction(s, player, id, ab) +
          Math.max(0, ...s.battlefield.map((c) => equipDiscount(s, player, ab, c)));
      if (ab.cost.exileGraveyardSymbols && !symbolCards(s, player, ab.cost.exileGraveyardSymbols)) return;
      const abCost = totalCost(abilityMana(s, id, ab), 0, undefined, reduction);
      if (ab.cost.mana && !canPay(s, player, abCost, exclude, abilityPurpose(id, ab))) return;
      const targets = targetOptions(s, player, ab.targets, id);
      if (!targetsAvailable(targets)) return;
      const xMax = ab.cost.loyaltyX
        ? (o.counters.loyalty ?? 0)
        : ab.cost.removeCountersX
          ? (o.counters[ab.cost.removeCountersX] ?? 0)
          : ab.cost.tapX
            ? tapXOptions(s, player, id, ab.cost.tapX)
            : ab.cost.exileFromGraveyardX
              ? graveyardXOptions(s, player, id, ab.cost.exileFromGraveyardX)
              : ab.cost.sacrificeX
                ? sacrificeXOptions(s, player, id, ab.cost.sacrificeX)
                : maxX(s, player, ab.cost.mana, exclude, abilityPurpose(id, ab));
      // « X ne peut pas être 0 » : la capacité n'est proposée que si X peut atteindre son minimum.
      if (ab.cost.minX !== undefined && (xMax ?? 0) < ab.cost.minX) return;
      out.push({
        type: "activate",
        source: id,
        ability: index,
        label: ab.label,
        targets,
        xMax,
        ...(ab.cost.minX !== undefined ? { xMin: ab.cost.minX } : {}),
        additional:
          ab.cost.sacrifice || ab.cost.tapOthers || ab.cost.discard || ab.cost.crew !== undefined || ab.cost.craft
            ? {
                ...(ab.cost.sacrifice
                  ? { sacrifice: { count: ab.cost.sacrifice.count, options: sacrificeOptions(s, player, id, ab) } }
                  : {}),
                ...(ab.cost.discard
                  ? { discard: { count: ab.cost.discard, options: discardCostOptions(s, player, id, ab.cost.discardFilter) } }
                  : {}),
                // Station : le joueur choisit la créature à engager.
                ...(ab.cost.tapOthers
                  ? { tap: { count: ab.cost.tapOthers.count, options: tapOthersOptions(s, player, id, ab) } }
                  : {}),
                // Équipage, monture : le joueur choisit les créatures (force totale suffisante).
                ...(ab.cost.crew !== undefined ? { tap: crewSpec(s, player, id, ab.cost.crew) } : {}),
                // Fabrication : le joueur choisit ses matériaux.
                ...(ab.cost.craft ? { materials: craftSpec(s, player, id, ab) ?? undefined } : {}),
              }
            : undefined,
      });
    });
  }

  for (const src of manaSources(s, player)) {
    const ab = manaAbilitiesOf(s, src.id)[src.ability];
    if (ab) out.push({ type: "tapForMana", source: src.id, ability: src.ability, colors: ab.produce });
  }
  // 702.61 : second partagé — ni sorts ni capacités (hors mana) tant que le sort est sur la pile ; les actions spéciales
  // restent possibles (702.61b).
  if (splitSecondOnStack(s))
    return out.filter(
      (a) =>
        a.type === "pass" ||
        a.type === "tapForMana" ||
        (a.type === "activate" && !!activatedAbility(s, a.source, a.ability)?.specialAction),
    );
  // 608.2g : pendant une résolution, seulement les cartes proposées (ou passer pour refuser).
  const now = p.castNow;
  if (now)
    return out.filter((a) => a.type === "pass" || a.type === "tapForMana" || (a.type === "cast" && now.cards.includes(a.card)));
  return out;
}

/** Actions « significatives » : tout sauf passer et produire du mana. */
export function meaningfulActions(s: GameState, player: PlayerId): ActionOption[] {
  return legalActions(s, player).filter((a) => a.type !== "pass" && a.type !== "tapForMana");
}
