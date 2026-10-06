/**
 * Lancer des sorts (601), activer des capacités (602), résoudre la pile (608).
 * Côté moteur, un lancement est atomique : le client envoie d'un coup mode, cibles, X et kicker,
 * et le paiement du mana est résolu automatiquement (réserve d'abord, puis solveur).
 */

import {
  canForage,
  createTokenCopy,
  forage,
  payLife as payLife_,
  removeFromCombat,
  sacrifice as sacrificePermanent,
} from "./actions";
import { ask } from "./choices";
import { counterLabel } from "./counterLabels";
import {
  announceDiscard,
  announceDiscardBatch,
  concreteSpec,
  evalAmount,
  GRANTOR_KEY,
  moveDiscarded,
  moveWithSpec,
  permissionActive,
  runEffect,
  staticContext,
  withX,
} from "./effects";
import { RulesError, rethrowAsRules } from "./errors";
import { copiableExceptions, copiedDefId, effectivePower, hasKeyword } from "./layers";
import { canPay, costToText, type ManaPurpose, manaAbilitiesOf, manaValue, payMana, totalCost } from "./mana";
import { enterChoiceRequest } from "./ops/permanents";
import { copyStackItem } from "./stackChoices";
import {
  bent,
  bump,
  changeCounters,
  chars,
  commanderOf,
  createObject,
  emit,
  FACE_DOWN_DEF,
  FACE_DOWN_ID,
  isCreature,
  moveObject,
  newId,
  nextTimestamp,
  obj,
  onBattlefield,
  removeFromGame,
  rulesEvent,
  shuffle,
  sickForActivation,
  snapshot,
  tapObject,
  turnFaceUp,
  unlockDoor,
} from "./state";
import {
  consumePlayerEffect,
  controlledAbilitiesWithSource,
  payableLife,
  playerStatic,
  playerStatics,
  playerStaticTotal,
} from "./statics";
import {
  isLegalTarget,
  legalTargets,
  matchesCard,
  matchesExiled,
  matchesObjectFilter,
  matchesView,
  resolveFilter,
  validateTargets,
  withChosen,
} from "./targets";
import { checkCondition, checkCrime, createDelayed, onceKey, pushInline, simultaneously } from "./triggers";
import { countTurnEvents, logTurnEvent } from "./turnlog";
import type {
  AbilityCostMod,
  AbilityKind,
  ActivatedAbilityDef,
  AltCostPay,
  CardDef,
  CastChoices,
  CastLimit,
  CastVia,
  ChoiceValue,
  Color,
  Condition,
  CostPick,
  CostSlot,
  Effect,
  ExiledFilter,
  GameObject,
  GameState,
  Keyword,
  LkiSnapshot,
  ManaAbilityDef,
  ManaCost,
  ManaType,
  ModeDef,
  NextSpell,
  ObjectFilter,
  ObjectId,
  PlayerId,
  PlayFromZone,
  StackItem,
  TargetSpec,
} from "./types";
import { BASIC_LAND_TYPES, PERMANENT_TYPES } from "./types";

export { RulesError };

/** Coût alternatif disponible : celui de la carte (si sa condition est remplie), sinon celui accordé à vos sorts (`altCostAll`). */
export function altCostFor(
  s: GameState,
  player: PlayerId,
  d: CardDef,
):
  | {
      mana: ManaCost;
      label: string;
      forage?: boolean;
      collectEvidence?: number;
      webSlinging?: boolean;
      via?: CastVia;
      pay?: AltCostPay;
    }
  | undefined {
  if (d.altCost && checkCondition(s, d.altCost.condition, player)) return d.altCost;
  for (const { id, ab } of playerStatics(s, player, "altCostAll")) {
    const a = ab.altCostAll;
    if (!a || (a.filter && !matchesView(spellView(d, player), a.filter, player))) continue;
    // Web-slinging donné (Amazing Spider-Man) : il faut une créature engagée à renvoyer.
    if (a.webSlinging && a.mana) {
      if (webSlingingOptions(s, player).length === 0) continue;
      return { mana: a.mana, label: `Web-slinging — ${costToText(a.mana)}`, webSlinging: true };
    }
    // Conspiracy Unraveler : réunir des preuves N plutôt que payer le coût de mana.
    if (a.collectEvidence)
      return {
        mana: { generic: 0, colored: {}, x: 0 },
        collectEvidence: a.collectEvidence,
        label: `Réunir des preuves ${a.collectEvidence}`,
      };
    // Libellé : le nom de la carte qui accorde le coût (Leyline of Mutation : « Leyline of Mutation — {W}{U}{B}{R}{G} »).
    const giver = id ? (s.defs[s.objects[id]?.defId ?? ""]?.name ?? "") : "";
    if (a.mana) return { mana: a.mana, label: `${giver || "Coût alternatif"} — ${costToText(a.mana)}` };
  }
  return undefined;
}

/** Convocation : le sort l'a, ou Dazzling Theater la donne à vos sorts de créature. */
/** Improvisation (702.126) : imprimée, ou donnée aux sorts du joueur (Ironheart : « vos sorts non-créature »). */
/**
 * Le sort a-t-il ce mot-clé, imprimé ou accordé aux sorts par une statique du joueur (`spellKeywords` : « vos sorts de
 * créature ont la convocation », « vos rituels ont le flash »…) ? Seule lecture des mots-clés d'un sort hors du champ de
 * bataille (PLAN-C, lot C11).
 */
export function spellHasKeyword(s: GameState, player: PlayerId, d: CardDef, kw: Keyword): boolean {
  if (d.keywords.includes(kw)) return true;
  return playerStatics(s, player, "spellKeywords").some(
    ({ ab }) => !!ab.spellKeywords?.keywords.includes(kw) && matchesView(spellView(d, player), ab.spellKeywords.filter, player),
  );
}

/** Mots-clés accordés à ce sort par les statiques de son contrôleur (`spellKeywords`), sans ceux qu'il a déjà. */
export function grantedSpellKeywords(s: GameState, player: PlayerId, d: CardDef): Keyword[] {
  const out = new Set<Keyword>();
  for (const { ab } of playerStatics(s, player, "spellKeywords"))
    if (ab.spellKeywords && matchesView(spellView(d, player), ab.spellKeywords.filter, player))
      for (const k of ab.spellKeywords.keywords) if (!d.keywords.includes(k)) out.add(k);
  return [...out];
}

export function hasImprovise(s: GameState, player: PlayerId, d: CardDef): boolean {
  return spellHasKeyword(s, player, d, "improvise");
}

export function hasConvoke(s: GameState, player: PlayerId, d: CardDef): boolean {
  return spellHasKeyword(s, player, d, "convoke");
}

export function isPermanentCard(d: CardDef): boolean {
  return !d.types.includes("Instant") && !d.types.includes("Sorcery");
}

/**
 * Condition d'un mode à l'annonce du sort (601.2b) : « kické » (coût additionnel payé, travail d'équipe, flétrir…) se lit
 * dans les choix du lancement, et non sur l'objet ; `not`, `all` et `any` le composent (« choisissez-en un ; si le coût
 * additionnel a été payé, choisissez les deux à la place » : chaque mode seul exige qu'il ne l'ait pas été). Les autres
 * sortes se lisent hors résolution (`checkCondition`). Commune à `legalActions` et à `castSpell`.
 */
export function modeConditionHolds(s: GameState, player: PlayerId, card: ObjectId, c: Condition, kicked: boolean): boolean {
  switch (c.kind) {
    case "kicked":
      return kicked;
    case "not":
      return !modeConditionHolds(s, player, card, c.cond, kicked);
    case "all":
      return c.of.every((x) => modeConditionHolds(s, player, card, x, kicked));
    case "any":
      return c.of.some((x) => modeConditionHolds(s, player, card, x, kicked));
    default:
      return checkCondition(s, c, player, card);
  }
}

/** Mot « cible » d'un sort d'Aura (303.4a). */
export const ENCHANT_SPEC = "enchant";

/** Modes d'un sort ; un permanent sans cible a un unique mode vide, une Aura cible ce qu'elle enchantera. */
export function modesOf(d: CardDef): ModeDef[] {
  if (d.spell) return d.spell.modes;
  if (d.enchant) {
    const filter = d.enchant.player ? { players: "any" as const } : { objects: d.enchant.filter };
    return [{ targets: [{ id: ENCHANT_SPEC, label: d.enchant.label, filter }], effects: [] }];
  }
  return [{ targets: [], effects: [] }];
}

export function sorceryTiming(s: GameState, player: PlayerId): boolean {
  return s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0;
}

export function canCastTiming(s: GameState, player: PlayerId, d: CardDef): boolean {
  if (d.types.includes("Instant") || d.keywords.includes("flash")) return true;
  if (d.flashIf && checkCondition(s, d.flashIf, player)) return true;
  if (sorceryTiming(s, player)) return true;
  // Valley Floodcaller : « vous pouvez lancer des sorts non-créature comme s'ils avaient le flash ».
  if (spellHasKeyword(s, player, d, "flash")) return true;
  // « Vous pouvez lancer des sorts comme s'ils avaient le flash. »
  return s.battlefield.some(
    (id) => obj(s, id).controller === player && chars(s, id).abilities.some((ab) => ab.kind === "castPermission" && ab.flash),
  );
}

/** Faufilement (702.190a) : le sort se lance pour son coût de faufilement pendant l'étape de déclaration des bloqueurs. */
export function sneakTiming(s: GameState, player: PlayerId, d: CardDef): boolean {
  return !!d.sneak && sneakOptions(s, player).length > 0 && checkCondition(s, { kind: "sneakWindow" }, player);
}

/** Faufilement : les attaquants non bloqués que vous pouvez renvoyer, le plus faible en premier (le choix par défaut). */
export function sneakOptions(s: GameState, player: PlayerId): ObjectId[] {
  return [...unblockedAttackers(s, player)].sort((a, b) => chars(s, a).power - chars(s, b).power);
}

/** Capacités (sur le champ de bataille) des permanents que ce joueur contrôle. */
function controlledAbilities(s: GameState, player: PlayerId): CardDef["abilities"] {
  return controlledAbilitiesWithSource(s, player).map((e) => e.ab);
}

/** Nombre de terrains que le joueur peut jouer ce tour-ci (305.2 : 1, plus les effets comme Loot). */
export function landsAllowed(s: GameState, player: PlayerId): number {
  return 1 + playerStaticTotal(s, player, "extraLands");
}

/** Permission de jouer une carte exilée (impulsion, Etali…) encore valable. */
function exilePermission(s: GameState, player: PlayerId, card: ObjectId) {
  return s.playPermissions?.find(
    (p) =>
      p.card === card &&
      p.player === player &&
      permissionActive(s, p) &&
      // Possibility Technician : « tant que vous contrôlez un Kavu ».
      (!p.condition || checkCondition(s, p.condition, player, p.source)),
  );
}

/** Valgavoth, Terror Eater : carte exilée liée à un permanent de ce joueur qui permet de la jouer (pendant son tour). */
function valgavothLinked(s: GameState, player: PlayerId, card: ObjectId): boolean {
  if (s.turn.active !== player) return false;
  return s.battlefield.some((id) => {
    const src = s.objects[id];
    return (
      src?.controller === player &&
      !!src.linked?.includes(card) &&
      chars(s, id).abilities.some((ab) => ab.kind === "playerStatic" && ab.playLinkedPayLife)
    );
  });
}

/** Muldrotha : type de permanent encore disponible pour jouer cette carte depuis le cimetière ce tour-ci. */
function graveyardTypeAvailable(s: GameState, player: PlayerId, card: ObjectId): string | null {
  if (s.turn.active !== player) return null;
  if (!controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.graveyardPermanentTypes)) return null;
  const d = s.defs[obj(s, card).defId];
  const used = s.turn.graveyardTypesUsed ?? [];
  return d?.types.find((t) => PERMANENT_TYPES.includes(t) && !used.includes(t)) ?? null;
}

export function canPlayLand(s: GameState, player: PlayerId, card: ObjectId): boolean {
  return landPermitted(s, player, card) && sorceryTiming(s, player) && s.turn.landsPlayed < landsAllowed(s, player);
}

/**
 * Le joueur a-t-il le droit de jouer ce terrain depuis sa zone (main, exil, cimetière, dessus de la bibliothèque), sans
 * tenir compte du moment ni des terrains déjà joués ? (L'interface présente ces cartes au bout de la main.)
 */
/** Tinybones, Bauble Burglar : pendant votre tour, les cartes exilées avec un marqueur de butin que vous ne possédez pas. */
function stashPlayable(s: GameState, player: PlayerId, o: GameObject): boolean {
  return (
    o.zone === "exile" &&
    o.owner !== player &&
    (o.counters.stash ?? 0) > 0 &&
    s.turn.active === player &&
    controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.stash)
  );
}

/**
 * Face qui se joue comme terrain : la carte si c'est un terrain, sinon le verso terrain d'une carte modale recto-verso
 * (712.12 : Sink into Stupor // Soporific Springs).
 */
export function landFace(d: CardDef | undefined): CardDef | undefined {
  if (!d) return undefined;
  if (d.types.includes("Land")) return d;
  const back = d.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
  return back?.types.includes("Land") ? back : undefined;
}

/** Verso terrain d'une carte modale dont le recto est aussi un terrain (Pathways : on choisit la face jouée). */
export function landBackFace(d: CardDef | undefined): CardDef | undefined {
  const back = d?.layout === "modal_dfc" && d.types.includes("Land") ? d.faceDefs?.[1] : undefined;
  return back?.types.includes("Land") ? back : undefined;
}

export function landPermitted(s: GameState, player: PlayerId, card: ObjectId): boolean {
  const o = s.objects[card];
  if (!o) return false;
  const d = s.defs[o.defId];
  if (!d || !landFace(d)) return false;
  return (
    (o.zone === "hand" && o.owner === player) ||
    (o.zone === "exile" && !!exilePermission(s, player, card) && !exilePermission(s, player, card)?.anyTime) ||
    (o.zone === "exile" && valgavothLinked(s, player, card)) ||
    // Tinybones : « jouer » les cartes de butin, terrains compris.
    stashPlayable(s, player, o) ||
    (o.zone === "library" &&
      o.owner === player &&
      s.players[player]?.library[0] === card &&
      playFromRules(s, player, card, "libraryTop", "lands").length > 0) ||
    // Ville à aventure (FIN) : la carte « en aventure » se joue comme terrain depuis l'exil (715.4).
    (o.zone === "exile" && !!o.onAdventure && o.owner === player) ||
    // « Vous pouvez jouer cette carte ce tour-ci » (Tablet of Discovery : la carte meulée, terrain compris).
    (o.zone === "graveyard" && !!exilePermission(s, player, card) && !exilePermission(s, player, card)?.anyTime) ||
    (o.zone === "graveyard" &&
      o.owner === player &&
      (graveyardTypeAvailable(s, player, card) === "Land" ||
        playFromRules(s, player, card, "graveyard", "lands").length > 0 ||
        // Chaos d'un terrain (Oscorp Industries) : défaussé ce tour-ci, il se joue depuis le cimetière.
        (!!d.mayhem && o.discardedTurn === s.turn.number)))
  );
}

/** Types de terrain de base (205.3i). */

/** Le coût alternatif du sort est un Web-slinging : imprimé, ou donné (Amazing Spider-Man). */
export function isWebSlinging(s: GameState, player: PlayerId, d: CardDef): boolean {
  return !!d.webSlinging || !!altCostFor(s, player, d)?.webSlinging;
}

/** Le sort de créature aura-t-il l'émeute en arrivant : imprimée, ou donnée par un de vos permanents (Spider-Punk) ? */
export function willHaveRiot(s: GameState, player: PlayerId, d: CardDef): boolean {
  if (d.keywords.includes("riot")) return true;
  if (!d.types.includes("Creature")) return false;
  const view = spellView(d, player);
  return s.battlefield.some(
    (id) =>
      s.objects[id]?.controller === player &&
      chars(s, id).abilities.some(
        (ab) =>
          ab.kind === "static" &&
          typeof ab.affects === "object" &&
          !!ab.mods.addKeywords?.includes("riot") &&
          matchesView(view, { ...ab.affects, other: undefined }, player, id),
      ),
  );
}

/** Web-slinging : les créatures engagées que vous contrôlez, la moins chère en premier (le choix par défaut). */
export function webSlingingOptions(s: GameState, player: PlayerId): ObjectId[] {
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost);
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && obj(s, id).tapped && isCreature(s, id))
    .sort((a, b) => mv(a) - mv(b));
}

export function playLand(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  payLife = false,
  landType?: string,
  chosen?: string,
  back = false,
): void {
  if (!canPlayLand(s, player, card)) throw new RulesError("Vous ne pouvez pas jouer ce terrain maintenant");
  const o = obj(s, card);
  // La face jouée : la carte, ou le verso terrain d'une carte modale (qui arrive alors verso visible) ; Pathways : le
  // verso si le joueur le choisit.
  const backLand = back ? landBackFace(s.defs[o.defId]) : undefined;
  if (back && !backLand) throw new RulesError("Cette carte n'a pas de verso terrain à jouer");
  const face = backLand ?? landFace(s.defs[o.defId]);
  const backFace = !!face && face.id !== o.defId;
  // Multiversal Passage : « en arrivant, choisissez un type de terrain de base » (choisi avec la décision).
  const choosesType = face?.chooseOnEnter === "landType";
  if (landType !== undefined && (!choosesType || !BASIC_LAND_TYPES.includes(landType)))
    throw new RulesError("Type de terrain de base invalide");
  // 614.12 : « en arrivant, choisissez… » (Cavern of Souls) : le choix du joueur, parmi les options ; sans choix, le
  // choix par défaut (`defaultChoice`).
  const kind = face?.chooseOnEnter;
  let enterChosen: GameObject["chosen"] | undefined;
  if (chosen !== undefined) {
    if (!kind || kind === "landType" || !face) throw new RulesError("Ce terrain ne demande pas de choix");
    const request = enterChoiceRequest(s, player, face.id, kind);
    if (request.type !== "pick" || !request.options.includes(chosen)) throw new RulesError("Choix invalide");
    enterChosen = chosenValue(kind, chosen);
  }
  // Terrains choc : « vous pouvez payer 2 points de vie ; sinon, il arrive engagé ».
  const shock = face?.shockLand;
  if (payLife && !shock) throw new RulesError("Ce terrain ne demande pas de points de vie");
  if (payLife && shock) {
    if (payableLife(s, player) < shock) throw new RulesError("Pas assez de points de vie");
    payLife_(s, player, shock);
  }
  if (o.zone === "graveyard") s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), "Land"];
  const defId = o.defId;
  const fromZone = o.zone;
  const fromExile = o.zone === "exile" ? exilePermission(s, player, card) : undefined;
  const id = moveObject(s, card, "battlefield", {
    controller: player,
    enters: { shockPaid: payLife, chosen: landType ? { landType } : enterChosen },
    ...(backFace ? { modalBack: true } : {}),
  });
  s.turn.landsPlayed += 1;
  emit({ type: "playLand", player, objectId: id as string, defId });
  if (id) rulesEvent(s, { e: "playLand", player, objectId: id, from: fromZone });
  const land = face;
  logTurnEvent(s, { e: "playLand", player, fromZone, types: land?.types ?? [], subtypes: land?.subtypes ?? [] });
  // Lightstall Inquisitor : un terrain joué depuis l'exil ainsi arrive engagé.
  const landed = id ? s.objects[id] : undefined;
  if (landed && fromExile?.landsTapped) {
    landed.tapped = true;
    bump(s);
  }
}

function flatTargets(t: Record<string, string[]>): string[] {
  return Object.values(t).flat();
}

/** Le sort vu comme un objet, pour les filtres (« les sorts de Dragon que vous lancez… »). */
export function spellView(d: CardDef, player: PlayerId): LkiSnapshot {
  return {
    id: "",
    defId: d.id,
    owner: player,
    controller: player,
    types: d.types,
    subtypes: d.subtypes,
    supertypes: d.supertypes,
    colors: d.colors,
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: d.keywords,
    isToken: false,
    // « un sort de valeur de mana 4 ou plus » (mana restreint d'Ashling, réductions de coût), « nommé … ».
    name: d.name,
    manaValue: manaValue(d.manaCost),
    ...(d.layout === "adventure" || d.subtypes.includes("Adventure") ? { adventure: true } : {}),
    ...((d.manaCost?.x ?? 0) > 0 ? { hasX: true } : {}),
    // Un sort lancé face cachée (déguisement) : « les sorts face cachée » (Goblin Maskmaker).
    ...(d.id === FACE_DOWN_ID ? { faceDown: true } : {}),
  };
}

/** La réduction propre au sort (« ce sort coûte {N} de moins si… ») s'applique-t-elle ? */
function ownReductionApplies(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  targets?: Record<string, string[]>,
  card?: ObjectId,
  kicked?: boolean,
): boolean {
  const cond = d.costReduction?.condition;
  if (!cond) return true;
  if (cond.kind === "targetMatches") {
    // « Ce sort coûte {3} de moins s'il cible une créature engagée » (Luminous Rebuke) ; un sort ciblé sur la pile
    // (Brush Off : « s'il cible un sort d'éphémère ou de rituel »).
    const spec = modesOf(d)[0]?.targets.find((t) => t.id === cond.spec);
    const ids = targets ? (targets[cond.spec] ?? []) : spec ? legalTargets(s, player, spec) : [];
    return ids.some((id) =>
      s.stack.some((x) => x.id === id && x.kind === "spell")
        ? matchesView(snapshot(s, id), cond.filter, player)
        : matchesObjectFilter(s, player, id, cond.filter),
    );
  }
  // « Ce sort coûte {2} de moins s'il est marchandé » (Hamlet Glutton) : le choix du lanceur.
  if (cond.kind === "kicked") return !!kicked;
  // La carte lancée est la source : « contemplez un Gobelin » ne la compte pas elle-même (601.2a).
  return checkCondition(s, cond, player, card);
}

/** Réduction de coût générique applicable à ce sort (601.2f). */
export function spellReduction(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  targets?: Record<string, string[]>,
  fromZone?: CastTerms["source"],
  card?: ObjectId,
  kicked?: boolean,
): number {
  let r = 0;
  const own = d.costReduction;
  const ok = ownReductionApplies(s, player, d, targets, card, kicked);
  if (own && ok) {
    r += evalAmount(s, staticContext(s, player, "", { sourceDefId: d.id }), own.generic);
  }
  const view = spellView(d, player);
  // Réductions accordées au joueur (effets « ce tour-ci » : Goblin Maskmaker).
  for (const { ab } of playerStatics(s, player, "spellCost")) {
    if (ab.spellCost && matchesView(view, ab.spellCost.filter, player)) r += ab.spellCost.reduce ?? 0;
  }
  // « Le prochain sort non-créature que vous lancez ce tour-ci a l'affinité pour les artefacts » (Don & Raph).
  for (const e of s.playerEffects) {
    const n = e.player === player && e.once ? e.ability.nextSpell : undefined;
    if (n?.reduce !== undefined && (!n.filter || matchesView(view, n.filter, player)))
      r += evalAmount(s, reductionContext(s, player, "", d.id), n.reduce);
  }
  for (const id of s.battlefield) {
    const o = obj(s, id);
    for (const ab of chars(s, id).abilities) {
      if (ab.kind !== "costReduction") continue;
      // Réductions de vos permanents ; taxes des permanents adverses sur vos sorts (Thalia, the Survivor).
      const applies = ab.everyone || (ab.opponents ? o.controller !== player : o.controller === player);
      // Gathering Stone : « les sorts du type choisi ».
      if (!applies || !matchesView(view, withChosen(ab.filter, o), player)) continue;
      if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) continue;
      // « Les sorts lancés depuis un cimetière ou depuis l'exil » (Aven Interrupter, Doc Aurlock).
      const zone = fromZone === "flashback" ? "graveyard" : fromZone;
      if (ab.fromZones && !(zone === "graveyard" || zone === "exile" ? ab.fromZones.includes(zone) : false)) continue;
      r += ab.generic;
      if (ab.genericAmount !== undefined) r += evalAmount(s, reductionContext(s, o.controller, id, o.defId), ab.genericAmount);
    }
  }
  return r;
}

/** Modifications à l'arrivée d'un sort (Noctis ; prochain sort de créature : Summon: Fenrir, Summon: Brynhildr). */
function arrivalFor(terms: CastTerms, next: NextSpell[]): StackItem["arrival"] {
  const counters: { kind: string; n: number }[] = terms.finality ? [{ kind: "finality", n: 1 }] : [];
  // Mikey & Don : « si vous lancez ainsi un sort de créature, elle arrive avec un marqueur +1/+1 de plus ».
  if (terms.playFrom?.counters) counters.push({ kind: "+1/+1", n: terms.playFrom.counters });
  for (const n of next) if (n.counters) counters.push({ kind: "+1/+1", n: n.counters });
  const haste = next.some((n) => n.haste) || undefined;
  // The Tomb of Aclazotz : « c'est un Vampire en plus de ses autres types ».
  const subtypes = terms.playFrom?.addSubtypes;
  return counters.length || haste || subtypes ? { counters, haste, ...(subtypes ? { subtypes } : {}) } : undefined;
}

/**
 * « Le prochain sort que vous lancez ce tour-ci… » (famille N) : les effets à usage unique qui correspondent à ce sort
 * sont retirés et renvoyés (Teach by Example : copié ; Theorist's Proxy : incontrecarrable ; Summon: Fenrir : marqueur).
 */
function consumeNextSpells(s: GameState, player: PlayerId, d: CardDef): NextSpell[] {
  const view = spellView(d, player);
  const used = s.playerEffects.filter(
    (e) =>
      e.player === player &&
      e.once &&
      !!e.ability.nextSpell &&
      (!e.ability.nextSpell.filter || matchesView(view, e.ability.nextSpell.filter, player)),
  );
  if (used.length) s.playerEffects = s.playerEffects.filter((e) => !used.includes(e));
  return used.map((e) => e.ability.nextSpell as NextSpell);
}

/** Cloud, Planet's Champion : réduction d'une capacité d'Équiper qui cible la créature. */
export function equipDiscount(s: GameState, player: PlayerId, ab: ActivatedAbilityDef, target: ObjectId | undefined): number {
  if (!target || !ab.label?.startsWith("Équiper") || s.objects[target]?.controller !== player) return 0;
  return s.defs[copiedDefId(s, target)]?.equipDiscountWhenTargeted ?? 0;
}

/**
 * Permissions « jouer depuis une zone » (famille C) qui s'appliquent à cette carte, sans coût ni effet en plus d'abord
 * (Case of the Uneaten Feast avant Noctis), puis celles qui laissent dépenser du mana de n'importe quel type.
 */
export function playFromRules(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  zone: PlayFromZone["zone"],
  what: "lands" | "spells",
): PlayFromZone[] {
  const weight = (r: PlayFromZone) =>
    (r.payLife ? 2 : 0) +
    (r.forage || r.exileOthers ? 2 : 0) +
    (r.finality ? 1 : 0) +
    (r.addSubtypes ? 1 : 0) -
    (r.anyMana ? 0.5 : 0);
  return playerStatics(s, player, "playFrom")
    .flatMap(({ id, ab }) => {
      const r = ab.playFrom;
      if (!r || r.zone !== zone || (r.what && r.what !== what)) return [];
      if (r.filter && !matchesCard(s, player, card, { ...r.filter, controller: undefined }, id)) return [];
      if (r.payLife && payableLife(s, player) < r.payLife) return [];
      if (r.forage && !canForage(s, player, card)) return [];
      if (r.exileOthers && !graveyardToExile(s, player, card, r.exileOthers)) return [];
      // Faufilement donné : seulement pendant la fenêtre de faufilement, avec un attaquant à renvoyer.
      if (r.sneak && !(sneakOptions(s, player).length > 0 && checkCondition(s, { kind: "sneakWindow" }, player))) return [];
      // Johann : « une fois par tour » (la clé de cette permission, notée au lancement).
      const onceKey = r.oncePerTurn ? `playFrom:${id}` : undefined;
      if (onceKey && s.turn.onceFired.includes(onceKey)) return [];
      return [onceKey ? { ...r, onceKey } : r];
    })
    .sort((a, b) => weight(a) - weight(b));
}

/** Conditions de lancement données par une permission « jouer depuis une zone ». */
function playFromTerms(r: PlayFromZone, source: "graveyard" | "library"): CastTerms {
  return {
    // Iroh, Grand Lotus : la carte a le flashback (exilée ensuite), pour son coût de mana ou le coût donné.
    source: r.flashback && source === "graveyard" ? "flashback" : source,
    ...(r.mayhem ? { mayhem: true } : {}),
    // Faufilement donné : son coût, à l'étape des bloqueurs (le moment est déjà vérifié par `playFromRules`).
    ...(r.sneak ? { costOverride: r.sneak, sneakGranted: true, anyTime: true } : {}),
    ...(r.cost ? { costOverride: r.cost } : {}),
    playFrom: r,
    ...(r.payLife ? { payLife: r.payLife } : {}),
    ...(r.forage ? { forage: true } : {}),
    ...(r.finality ? { finality: true } : {}),
    ...(r.anyMana ? { anyMana: true } : {}),
    ...(r.onceKey ? { onceKey: r.onceKey } : {}),
  };
}

/**
 * Kicker sans mana (FIN, Marchandage de WOE) : les permanents qui peuvent le payer, le moins précieux d'abord (jetons,
 * puis valeur de mana croissante). Le joueur choisit (`CastChoices.sacrifice`) ; sans choix, le premier.
 */
export function kickerCostOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  targeted: ObjectId[] = [],
): ObjectId[] {
  const f =
    d.kickerCost?.sacrifice ??
    d.kickerCost?.bounce ??
    (d.kickerCost?.blight ? ({ types: ["Creature"] } as ObjectFilter) : undefined);
  if (!f) return [];
  // Un coût se paie après le choix des cibles (601.2h) : une cible peut le payer. Les cibles viennent en dernier (choix par
  // défaut), puis le moins cher, jeton d'abord.
  const mv = (id: ObjectId) => (s.objects[id]?.isToken ? -1 : manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost));
  // Flétrir : comme `blightTarget`, d'abord une créature qui survit (la plus résistante), sinon la moins précieuse.
  const n = d.kickerCost?.blight ?? 0;
  const left = (id: ObjectId) => chars(s, id).toughness - (s.objects[id]?.damage ?? 0) - n;
  const value = (id: ObjectId) => (n > 0 ? (left(id) > 0 ? -left(id) - 100 : mv(id)) : mv(id));
  const rank = (id: ObjectId) => (targeted.includes(id) ? 1000 : 0) + value(id);
  return s.battlefield
    .filter((id) => id !== card && s.objects[id]?.controller === player && matchesObjectFilter(s, player, id, f, card))
    .sort((a, b) => rank(a) - rank(b));
}

/**
 * Réunir des preuves N (701.59, Meurtres au manoir Karlov) : cartes de votre cimetière de valeur de mana totale N ou
 * plus, choisies automatiquement ; null si impossible.
 */
export function evidenceCards(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  n: number,
  keep: readonly ObjectId[] = [],
): ObjectId[] | null {
  return pickEvidence(
    s,
    (s.players[player]?.graveyard ?? []).filter((id) => id !== card && !keep.includes(id)),
    n,
  );
}

/**
 * Choix automatique des preuves parmi `pool` : à chaque étape, la carte la moins chère qui suffit à atteindre N, sinon
 * la plus chère (peu de cartes exilées, sans gâcher une carte chère pour un petit N) ; null si le total n'y suffit pas.
 */
export function pickEvidence(s: GameState, pool: ObjectId[], n: number): ObjectId[] | null {
  const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
  const left = [...pool].sort((a, b) => mv(a) - mv(b));
  if (left.reduce((t, id) => t + mv(id), 0) < n) return null;
  const out: ObjectId[] = [];
  let total = 0;
  while (total < n && left.length) {
    const i = left.findIndex((id) => total + mv(id) >= n);
    const id = (i >= 0 ? left.splice(i, 1) : left.splice(left.length - 1, 1))[0] as ObjectId;
    out.push(id);
    total += mv(id);
  }
  return total >= n ? out : null;
}

/**
 * « Exilez N cartes de votre cimetière » (kicker de Soaring Stoneglider) : choisies automatiquement, terrains d'abord puis
 * les moins chères ; null s'il n'y en a pas assez.
 */
export function graveyardToExile(s: GameState, player: PlayerId, card: ObjectId, n: number): ObjectId[] | null {
  const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
  const land = (id: ObjectId) => (s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land") ? 0 : 1);
  const pool = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
  if (pool.length < n) return null;
  return [...pool].sort((a, b) => land(a) - land(b) || mv(a) - mv(b)).slice(0, n);
}

/** Réunit des preuves (701.59) : les cartes sont exilées, et « chaque fois que vous réunissez des preuves » se déclenche. */
export function collectEvidence(s: GameState, player: PlayerId, cards: ObjectId[]): ObjectId[] {
  const exiled = cards.map((id) => moveObject(s, id, "exile")).filter((id): id is ObjectId => !!id);
  rulesEvent(s, { e: "collectEvidence", player });
  return exiled;
}

/** Le permanent qui paie le kicker sans mana par défaut, s'il y en a un. */
export function kickerCostPermanent(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  exclude: ObjectId[] = [],
): ObjectId | undefined {
  return kickerCostOptions(s, player, card, d, exclude)[0];
}

/**
 * Harmonie (702.180) : créatures dégagées que le joueur peut engager pour réduire de sa force le coût d'harmonie, et le
 * choix par défaut pour un coût générique `generic` : la plus petite force qui couvre tout le générique, sinon la plus
 * grande (aucune si le coût n'a pas de générique).
 */
export function harmonizeOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  generic: number,
): { options: ObjectId[]; powers: Record<ObjectId, number>; suggested: ObjectId[] } {
  const options = s.battlefield.filter((id) => {
    const o = obj(s, id);
    return id !== card && o.controller === player && !o.tapped && isCreature(s, id) && chars(s, id).power > 0;
  });
  const powers = Object.fromEntries(options.map((id) => [id, chars(s, id).power]));
  const byPower = [...options].sort((a, b) => (powers[a] ?? 0) - (powers[b] ?? 0));
  // Par défaut : la plus faible qui suffit, d'abord parmi les créatures sans capacité de mana (une créature-terrain
  // engagée pour l'harmonie ne paierait plus le reste du coût, Restless Reef).
  const pick = (ids: ObjectId[]) => ids.find((id) => (powers[id] ?? 0) >= generic) ?? ids[ids.length - 1];
  const plain = byPower.filter((id) => manaAbilitiesOf(s, id).length === 0);
  const best = plain.find((id) => (powers[id] ?? 0) >= generic) ?? pick(byPower);
  return { options, powers, suggested: generic > 0 && best ? [best] : [] };
}

/** Coût total d'un sort : coût de base, de flashback ou alternatif (ou rien), X, kicker, réductions. */
/**
 * Ce que paie en plus un coût alternatif (Force of Will, Daze) : les cartes de la main exilées (les moins chères d'abord)
 * et le permanent renvoyé (un engagé d'abord), choisis automatiquement ; `null` si c'est impossible.
 */
export function altCostPayment(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  pay: AltCostPay,
): { exile: ObjectId[]; bounce?: ObjectId; sacrifice?: ObjectId } | null {
  const pl = s.players[player];
  if (!pl || (pay.life !== undefined && payableLife(s, player) < pay.life)) return null;
  let exile: ObjectId[] = [];
  if (pay.exileFromHand) {
    const f = pay.exileFromHand;
    const cards = pl.hand
      .filter((id) => id !== card && matchesCard(s, player, id, f.filter))
      .sort((a, b) => manaValue(s.defs[obj(s, a).defId]?.manaCost) - manaValue(s.defs[obj(s, b).defId]?.manaCost));
    if (cards.length < f.count) return null;
    exile = cards.slice(0, f.count);
  }
  let bounce: ObjectId | undefined;
  if (pay.bounce) {
    const options = s.battlefield
      .filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, pay.bounce as ObjectFilter))
      .sort((a, b) => Number(obj(s, b).tapped) - Number(obj(s, a).tapped));
    if (options.length === 0) return null;
    bounce = options[0];
  }
  const sacrifice = pay.sacrificeReduce ? emergeVictim(s, player, pay.sacrificeReduce) : undefined;
  if (pay.sacrificeReduce && !sacrifice) return null;
  return { exile, ...(bounce ? { bounce } : {}), ...(sacrifice ? { sacrifice } : {}) };
}

/** Émerger (702.119) : le permanent sacrifié, choisi automatiquement (la plus grande valeur de mana, donc la plus forte réduction). */
function emergeVictim(s: GameState, player: PlayerId, f: ObjectFilter): ObjectId | undefined {
  const mv = (id: ObjectId) => snapshot(s, id).manaValue ?? 0;
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f))
    .sort((a, b) => mv(b) - mv(a))[0];
}

/** Un coût de mana payé N fois (réplique, entretien cumulatif). */
export function timesCost(c: ManaCost, n: number): ManaCost {
  const colored: ManaCost["colored"] = {};
  for (const [k, v] of Object.entries(c.colored)) colored[k as ManaType] = (v ?? 0) * n;
  return { ...c, generic: c.generic * n, colored, ...(c.hybrid ? { hybrid: Array(n).fill(c.hybrid).flat() } : {}) };
}

/** K'rrik, Son of Yawgmoth : « pour chaque {B} d'un coût, vous pouvez payer 2 PV à la place » (mana phyrexian). */
function asPhyrexian(s: GameState, player: PlayerId, cost: ManaCost): ManaCost {
  let out = cost;
  for (const { ab } of playerStatics(s, player, "phyrexianMana")) {
    const m = ab.phyrexianMana;
    const n = m ? (out.colored[m] ?? 0) : 0;
    if (!m || !n) continue;
    out = { ...out, colored: { ...out.colored, [m]: 0 }, phyrexian: [...(out.phyrexian ?? []), ...Array<ManaType>(n).fill(m)] };
  }
  return out;
}

export function spellCost(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  opts: {
    x?: number;
    kicked?: boolean;
    flashback?: boolean;
    /** Sans payer le coût de mana (118.9) : X vaut 0, le kicker reste payable. */
    free?: boolean;
    /** Coût alternatif de la carte (Blasphemous Edict). */
    alternative?: boolean;
    /** Du mana de n'importe quel type peut être dépensé : les symboles colorés deviennent génériques. */
    anyMana?: boolean;
    /** Lancée pour son coût de chaos (Mayhem). */
    mayhem?: boolean;
    /** Coût remplaçant le coût de mana (maîtrise de l'air : {2}). */
    costOverride?: ManaCost;
    /** Cibles choisies (réduction « si ce sort cible… ») ; absentes : on suppose la cible la plus favorable. */
    targets?: Record<string, string[]>;
    /** Zone d'où le sort est lancé (réductions et taxes « depuis un cimetière ou l'exil »). */
    fromZone?: CastTerms["source"];
    /** La carte lancée (conditions de réduction qui l'excluent : contempler). */
    card?: ObjectId;
    /** Contemplation faite (coût additionnel `behold`) ; absente : faite si possible. */
    beheld?: boolean;
  },
): ManaCost {
  const empty: ManaCost = { generic: 0, colored: {}, x: 0 };
  const alt = opts.alternative ? altCostFor(s, player, d) : undefined;
  // Émerger : le coût alternatif est réduit de la valeur de mana du permanent sacrifié.
  const victim = alt?.pay?.sacrificeReduce ? emergeVictim(s, player, alt.pay.sacrificeReduce) : undefined;
  const altMana =
    alt && victim ? { ...alt.mana, generic: Math.max(0, alt.mana.generic - (snapshot(s, victim).manaValue ?? 0)) } : alt?.mana;
  const base = opts.free
    ? empty
    : alt
      ? (altMana as ManaCost)
      : opts.flashback
        ? (opts.costOverride ?? d.flashback ?? d.manaCost)
        : opts.mayhem
          ? (d.mayhem ?? d.manaCost)
          : (opts.costOverride ?? d.manaCost);
  // « Ce sort coûte {1}{U} de moins » (Brush Off) : les symboles colorés retirés du coût de base.
  const ownColored = d.costReduction?.colored;
  const base1 =
    base && ownColored && !opts.free && ownReductionApplies(s, player, d, opts.targets, opts.card, opts.kicked)
      ? withoutColored(base, ownColored)
      : base;
  // Maîtrise de l'eau en coût additionnel (Avatar) : {N} ou {X} de plus, à payer même sans payer le coût de mana.
  const bend = (d.waterbend ?? 0) + (d.xCost === "waterbend" ? Math.max(0, opts.x ?? 0) : 0);
  const bendCost: ManaCost | undefined = bend ? { generic: bend, colored: {}, x: 0 } : undefined;
  // Réplique (702.56) : le coût de réplique payé X fois.
  const replicated = d.kickerKind === "replicate" && d.kicker && (opts.x ?? 0) > 0 ? timesCost(d.kicker, opts.x ?? 0) : undefined;
  const kick = replicated ?? (opts.kicked && d.kicker ? d.kicker : undefined);
  const extra = kick ? (bendCost ? totalCost(kick, 0, bendCost) : kick) : bendCost;
  let cost0 = totalCost(
    base1,
    opts.free ? 0 : (opts.x ?? 0),
    extra,
    // 601.2f / 118.9d : un sort lancé sans payer son coût de mana paie quand même les augmentations (Thalia, the
    // Survivor) ; une réduction ne descend pas sous zéro.
    spellReduction(s, player, d, opts.targets, opts.fromZone, opts.card, opts.kicked),
  );
  // Officious Interrogation : « coûte {W}{U} de plus pour chaque cible au-delà de la première ».
  const extraTargets = d.costPerExtraTarget && opts.targets ? Math.max(0, flatTargets(opts.targets).length - 1) : 0;
  for (let i = 0; i < extraTargets && d.costPerExtraTarget; i++) cost0 = totalCost(cost0, 0, d.costPerExtraTarget);
  // Feed the Cycle : « fourragez ou payez {B} » — le mana s'ajoute sauf si l'on fourrage (coût alternatif).
  const cost1 = d.forageOrPay && !alt?.forage ? totalCost(cost0, 0, d.forageOrPay) : cost0;
  // Wild Unraveling : « flétrissez 2 ou payez {1} » — le mana s'ajoute sauf si l'on flétrit (kicker).
  const cost1b = d.kickerOrPay && !opts.kicked ? totalCost(cost1, 0, d.kickerOrPay) : cost1;
  // « Contemplez un Dragon ou payez {1} » : le mana s'ajoute sans contemplation (par défaut : contempler si possible).
  const behold = d.additionalCost?.behold;
  const beheld = opts.beheld ?? (!!behold && beholdOptions(s, player, opts.card ?? "", behold.filter, behold.exiled).length > 0);
  const cost2 = behold?.orPay && !beheld ? totalCost(cost1b, 0, behold.orPay) : cost1b;
  // Aang, Master of Elements : « {W}{U}{B}{R}{G} de moins » ; un symbole sans pendant dans le coût réduit le générique.
  const symbols = playerStatics(s, player, "spellCost").filter(
    ({ ab }) => ab.spellCost?.reduceSymbols && matchesView(spellView(d, player), ab.spellCost.filter, player),
  );
  const cost = symbols.length ? { ...cost2, colored: { ...cost2.colored } } : cost2;
  for (const { ab } of symbols) {
    for (const [m, n] of Object.entries(ab.spellCost?.reduceSymbols ?? {}) as [ManaType, number][]) {
      for (let i = 0; i < n; i++) {
        const left = cost.colored[m] ?? 0;
        if (left > 1) cost.colored[m] = left - 1;
        else if (left === 1) delete cost.colored[m];
        else if (cost.generic > 0) cost.generic -= 1;
      }
    }
  }
  // Case File Auditor : « comme s'il était de n'importe quelle couleur » pour les sorts correspondants.
  const anyMana =
    opts.anyMana ||
    playerStatics(s, player, "spellCost").some(
      ({ ab }) => ab.spellCost?.anyMana && matchesView(spellView(d, player), ab.spellCost.filter, player),
    );
  if (!anyMana) return asPhyrexian(s, player, cost);
  const colored =
    Object.values(cost.colored).reduce<number>((n, k) => n + (k ?? 0), 0) +
    (cost.hybrid?.length ?? 0) +
    (cost.twoHybrid?.length ?? 0);
  return { generic: cost.generic + colored, colored: {}, x: 0 };
}

/** Conditions de lancement d'une carte depuis sa zone actuelle. */
export interface CastTerms {
  /** Seulement l'Aventure de la carte (permission « lancez-la en Aventure », Mosswood Dreadknight). */
  adventureOnly?: boolean;
  /** Lancée pour un faufilement donné (Ninja Teen) : un attaquant non bloqué est renvoyé, le permanent arrive attaquant. */
  sneakGranted?: boolean;
  /** {N} de plus (Lightstall Inquisitor). */
  extraCost?: number;
  /** Lançable d'ici seulement avec la distorsion (Timeline Culler, depuis le cimetière). */
  warpOnly?: boolean;
  /** Chaos (Mayhem) : lancée depuis le cimetière pour son coût de chaos, défaussée ce tour-ci. */
  mayhem?: boolean;
  /** Maîtrise de l'air : lancée pour ce coût plutôt que pour son coût de mana. */
  costOverride?: ManaCost;
  /** Le coût de remplacement est un coût de maîtrise de l'eau (Hama, the Bloodbender). */
  waterbendOverride?: boolean;
  source: "hand" | "graveyard" | "exile" | "flashback" | "library" | "command";
  /** Doit être lancée sans payer son coût de mana (Etali). */
  free?: boolean;
  /** Peut être lancée sans payer son coût de mana, au choix (Omniscience). */
  freeOptional?: boolean;
  /** La gratuité vient de Warped Space (une fois par tour). */
  warpedSpace?: boolean;
  /** Ignore les restrictions de timing (Etali : lancée pendant la résolution, approximation). */
  anyTime?: boolean;
  /** Du mana de n'importe quel type peut être dépensé (Tinybones). */
  anyMana?: boolean;
  /** Muldrotha : type de permanent utilisé. */
  graveyardType?: string;
  /** Quilled Greatwurm : marqueurs à retirer parmi vos créatures. */
  removeCounters?: number;
  /** Permission utilisable une fois par tour (Maralen) : clé notée dans `turn.onceFired` au lancement. */
  onceKey?: string;
  /** Permission gratuite une fois par tour (Zaffai) : consommée seulement si le sort est lancé sans payer. */
  freeOnceKey?: string;
  /** Points de vie payés en plus (Wickerfolk Indomitable, depuis le cimetière). */
  payLife?: number;
  /** Seulement au moment où l'on pourrait lancer un rituel (carte complotée). */
  sorceryTiming?: boolean;
  /** Exilé au lieu d'aller au cimetière (Quistis Trepe). */
  exileAfter?: boolean;
  /** Au-dessous de la bibliothèque au lieu du cimetière (Kylox's Voltstrider). */
  bottomAfter?: boolean;
  /** Le permanent arrive avec un marqueur de finalité (Noctis). */
  finality?: boolean;
  /** Il faut fourrager en plus (Osteomancer Adept). */
  forage?: boolean;
  /** Permission « jouer depuis une zone » utilisée (famille C) : sous-types à l'arrivée, usage unique consommé. */
  playFrom?: PlayFromZone;
  /** Harmonie accordée (Songcrafter Mage) à une carte lancée depuis le cimetière. */
  harmonize?: boolean;
}

/** 702.170 : la carte (depuis la main ou la pile) est exilée face visible et devient complotée. */
export function plotCard(s: GameState, id: ObjectId): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  const player = o.owner;
  const onStack = s.stack.findIndex((x) => x.id === id);
  if (onStack >= 0) s.stack.splice(onStack, 1);
  // Déjà exilée (Kellan Joins Up : « exilez une carte de votre main ; elle devient complotée ») : elle reste là.
  const exiled = o.zone === "exile" ? id : moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (!card) return null;
  card.plottedTurn = s.turn.number;
  emit({ type: "plotted", player, defId: card.defId });
  rulesEvent(s, { e: "plotted", card: card.id });
  // « Quand cette carte devient complotée » : la carte est en exil, la capacité se déclenche de là.
  for (const ab of s.defs[card.defId]?.abilities ?? []) {
    if (ab.kind === "triggered" && ab.trigger.on === "plottedSelf") {
      pushInline(s, player, card.id, card.defId, { targets: ab.targets, effects: ab.effects, label: ab.label });
    }
  }
  return card.id;
}

/** Suspendre (702.62) : la carte (en main, ou le sort sur la pile) est exilée avec N marqueurs de temps. */
export function suspendCard(s: GameState, id: ObjectId, time: number): void {
  const o = s.objects[id];
  if (!o) return;
  if (o.zone === "stack") {
    // Le sort quitte la pile sans être contrecarré (une copie cesse simplement d'exister).
    const i = s.stack.findIndex((x) => x.id === id && x.kind === "spell");
    const item = s.stack[i];
    if (!item || item.copy) return;
    s.stack.splice(i, 1);
  } else if (o.zone !== "hand") return;
  emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to: "exile" });
  const exiled = moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (card?.zone !== "exile") return;
  card.suspended = true;
  changeCounters(s, card, "time", time);
}

/** Présage (702.143a) : la carte est exilée de la main ; son propriétaire peut la lancer à un tour ultérieur. */
export function foretellCard(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (o?.zone !== "hand") return;
  const exiled = moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (!card) return;
  card.foretoldTurn = s.turn.number;
  // Exilée face cachée : seul son propriétaire peut la regarder (702.143a).
  card.exiledFaceDown = [card.owner];
  emit({ type: "foretold", player: card.owner, defId: card.defId });
}

/** D'où, et à quelles conditions, ce joueur peut-il lancer cette carte ? */
/** 702.61 : un sort avec le second partagé est sur la pile — seules les capacités de mana restent possibles. */
export function splitSecondOnStack(s: GameState): boolean {
  // Yuriko, Blade of the Mighty : « pendant le combat, les joueurs ne peuvent ni lancer de sorts ni activer de capacités
  // (hors mana) » : comme le second partagé, pour tous.
  if (
    inCombat(s) &&
    s.playerOrder.some((p) =>
      playerStatics(s, p, "castLimit").some(
        ({ ab }) => ab.castLimit?.who === "each" && ab.castLimit.during === "combat" && ab.castLimit.abilities === "all",
      ),
    )
  )
    return true;
  return s.stack.some((item) => {
    if (item.kind !== "spell") return false;
    const d = s.defs[item.sourceDefId];
    return !!d && spellHasKeyword(s, item.controller, d, "splitSecond");
  });
}

/** Contexte minimal pour évaluer un montant hors résolution (réductions de coût). */
function reductionContext(s: GameState, controller: PlayerId, sourceId: string, sourceDefId: string) {
  return staticContext(s, controller, sourceId, { sourceDefId });
}

/**
 * Modificateurs de coût des capacités activées (famille A) : Boom Scholar (exhaust de vos autres permanents), Mutagen
 * Man (vos jetons d'artefact), Kíli the Resourceful (premier Équiper du tour gratuit), Inquisitive Glimmer
 * (déverrouiller), Doc Aurlock (comploter).
 */
function abilityCostReduction(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): number {
  const kind = (m: AbilityCostMod) => !m.ability || isAbilityKind(ab, m.ability);
  let n = 0;
  for (const { id, ab: x } of playerStatics(s, player, "abilityCost")) {
    const m = x.abilityCost;
    if (!m || !kind(m) || (m.notSelf && id === source)) continue;
    if (m.source && !matchesObjectFilter(s, player, source, m.source)) continue;
    if (m.firstThisTurnFree) {
      if (m.ability !== "equip" || countTurnEvents(s, { event: "activate", who: "you", equip: true }, player) > 0) continue;
      n += 99;
    } else {
      const by = id ?? source;
      let k =
        (m.reduce ?? 0) +
        (m.reduceAmount ? evalAmount(s, reductionContext(s, player, by, s.objects[by]?.defId ?? ""), m.reduceAmount) : 0);
      // « Ne peut pas réduire le mana de ce coût à moins d'un mana » : au plus la valeur de mana moins un.
      if (m.minOneMana) k = Math.min(k, Math.max(0, manaValue(ab.cost.mana ?? null) - 1));
      n += Math.max(0, k);
    }
  }
  return n;
}

/**
 * Coût de mana d'une capacité activée : celui qui est imprimé, ou, pour une montée en puissance d'une source arrivée ce
 * tour-ci, ce coût diminué du coût de mana de la source (générique et symboles colorés).
 */
/**
 * Part d'un sort payable par la maîtrise de l'eau : son coût additionnel « waterbend {N} » ou « {X} », et son kicker s'il
 * en est un (« you may waterbend {N} »).
 */
export function waterbendAmount(d: CardDef, kicked: boolean, x: number): number {
  return (
    (d.waterbend ?? 0) +
    (d.xCost === "waterbend" ? Math.max(0, x) : 0) +
    (kicked && d.kickerKind === "waterbend" && d.kicker ? d.kicker.generic : 0)
  );
}

const ABILITY_KINDS: readonly AbilityKind[] = ["exhaust", "equip", "unlock", "plot", "powerUp", "turnFaceUp"];

/** La capacité activée (ou l'action spéciale) est-elle de cette sorte ? */
export function isAbilityKind(ab: ActivatedAbilityDef, kind: AbilityKind): boolean {
  switch (kind) {
    case "exhaust":
      return !!ab.exhaust;
    case "equip":
      return !!ab.equip;
    case "unlock":
      return !!ab.specialAction && ab.effects.some((e) => e.op === "unlockDoor");
    case "turnFaceUp":
      return !!ab.specialAction && ab.effects.some((e) => e.op === "turnFaceUp");
    case "plot":
      return ab.effects.some((e) => e.op === "plot");
    case "powerUp":
      return !!ab.powerUp;
  }
}

/**
 * À quoi sert le mana d'une capacité activée : sa source, ses sortes (mana restreint : « activer une capacité
 * d'équipement »), et la maîtrise de l'eau (tout le coût en est une, X compris).
 */
export function abilityPurpose(source: ObjectId, ab: ActivatedAbilityDef): ManaPurpose {
  const kinds = ABILITY_KINDS.filter((k) => isAbilityKind(ab, k));
  return {
    abilitySource: source,
    ...(kinds.length ? { abilityKinds: kinds } : {}),
    ...(ab.cost.waterbend ? { waterbend: Number.POSITIVE_INFINITY } : {}),
  };
}

export function abilityMana(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ManaCost | undefined {
  const m = printedAbilityMana(s, source, ab);
  const o = s.objects[source];
  if (!m || !o) return m;
  // Agatha's Soul Cauldron : le mana se dépense comme s'il était de n'importe quel type (les symboles colorés deviennent
  // génériques).
  const any = playerStatics(s, o.controller, "abilityCost").some(
    ({ ab: x }) =>
      x.abilityCost?.anyMana && (!x.abilityCost.source || matchesObjectFilter(s, o.controller, source, x.abilityCost.source)),
  );
  if (!any) return m;
  // « De n'importe quelle couleur » : {C} reste dû en mana incolore.
  const colored =
    Object.entries(m.colored).reduce<number>((n, [k, v]) => (k === "C" ? n : n + (v ?? 0)), 0) +
    (m.hybrid?.length ?? 0) +
    (m.twoHybrid?.length ?? 0);
  return { generic: m.generic + colored, colored: m.colored.C ? { C: m.colored.C } : {}, x: m.x };
}

function printedAbilityMana(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ManaCost | undefined {
  const m = ab.cost.mana;
  const o = s.objects[source];
  if (!m || !ab.powerUp || !o || o.controlledSince !== s.turn.number) return m;
  const own = s.defs[o.defId]?.manaCost;
  if (!own) return m;
  const colored: ManaCost["colored"] = {};
  for (const [k, n] of Object.entries(m.colored)) {
    const left = (n ?? 0) - (own.colored[k as ManaType] ?? 0);
    if (left > 0) colored[k as ManaType] = left;
  }
  return { ...m, generic: Math.max(0, m.generic - own.generic), colored };
}

/** Réduction propre à la cible d'une capacité (Warrior's Blades, Dragonfire Blade, Équiper réduit par la créature ciblée). */
function targetReduction(s: GameState, player: PlayerId, ab: ActivatedAbilityDef, target: ObjectId | undefined): number {
  if (!target || !s.objects[target]) return 0;
  return (
    (ab.reduceByTargetColors ? chars(s, target).colors.length : 0) +
    (ab.reduceByTargetCounters ? (s.objects[target]?.counters["+1/+1"] ?? 0) : 0) +
    equipDiscount(s, player, ab, target)
  );
}

/** La capacité a-t-elle un coût qui dépend de sa cible ? */
export function costDependsOnTarget(ab: ActivatedAbilityDef): boolean {
  return !!ab.reduceByTargetColors || !!ab.reduceByTargetCounters || !!ab.label?.startsWith("Équiper");
}

/**
 * Coût de mana d'une capacité activée, réductions comprises (seul calcul, partagé par `legal.ts` et `activateAbility`) :
 * pour une cible donnée, ou `"best"` (la cible la plus favorable, pour savoir si la capacité peut être proposée).
 */
export function abilityManaCost(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  target: ObjectId | undefined | "best",
  x = 0,
): ManaCost {
  const byTarget =
    target === "best"
      ? costDependsOnTarget(ab)
        ? Math.max(0, ...s.battlefield.map((c) => targetReduction(s, player, ab, c)))
        : 0
      : targetReduction(s, player, ab, target);
  // Une action spéciale (retourner face visible, comploter, déverrouiller) n'est pas une capacité activée : Agatha's Soul
  // Cauldron (« pour activer des capacités ») ne s'y applique pas.
  const mana = ab.specialAction ? ab.cost.mana : abilityMana(s, source, ab);
  return asPhyrexian(s, player, totalCost(mana, x, undefined, byTarget + abilityReduction(s, player, source, ab)));
}

export function abilityReduction(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): number {
  const mods = abilityCostReduction(s, player, source, ab);
  const red = ab.reduction;
  const tax = chosenNameTax(s, source) - mods;
  if (!red) return -tax;
  // « Cette capacité coûte {N} de moins à activer » (Starport Security, Survey Mechan, The Dominion Bracelet).
  if (red.condition && !checkCondition(s, red.condition, player, source)) return 0;
  return -tax + Math.max(0, evalAmount(s, reductionContext(s, player, source, s.objects[source]?.defId ?? ""), red.generic));
}

/**
 * Capacité à usage unique encore disponible : pas encore activée, ou moins de fois que permis (Wonder Man, Hollywood
 * Hero : « chaque montée en puissance des permanents que vous contrôlez peut être activée une fois de plus »).
 */
function onceAvailable(s: GameState, o: GameObject, ab: ActivatedAbilityDef, index: number): boolean {
  const uses = (o.used ?? []).filter((i) => i === index).length;
  const extra = ab.powerUp
    ? playerStatics(s, o.controller, "powerUpExtraUses").reduce((n, { ab: x }) => n + (x.powerUpExtraUses ?? 0), 0)
    : 0;
  return uses < 1 + extra;
}

/**
 * Baron Helmut Zemo : les cartes de la couleur au cimetière à exiler pour totaliser N symboles de cette couleur (les plus
 * riches d'abord), ou null si c'est impossible.
 */
export function symbolCards(s: GameState, player: PlayerId, req: { color: ManaType; n: number }): ObjectId[] | null {
  const symbols = (id: ObjectId) => {
    const c = s.defs[s.objects[id]?.defId ?? ""]?.manaCost;
    return c ? (c.colored[req.color] ?? 0) + (c.hybrid ?? []).filter((h) => h.includes(req.color)).length : 0;
  };
  const pool = (s.players[player]?.graveyard ?? [])
    .filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.colors.includes(req.color as Color))
    .sort((a, b) => symbols(b) - symbols(a));
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of pool) {
    if (total >= req.n) break;
    out.push(id);
    total += symbols(id);
  }
  return total >= req.n ? out : null;
}

/** Elvish Refueler : pendant votre tour, tant qu'aucune capacité d'exhaust n'a été activée ce tour-ci. */
function exhaustReusable(s: GameState, player: PlayerId, ab: ActivatedAbilityDef): boolean {
  return (
    !!ab.exhaust &&
    s.turn.active === player &&
    !(s.players[player]?.turnStats.exhaustActivated ?? 0) &&
    playerStatic(s, player, "exhaustReuse")
  );
}

/**
 * Distorsion d'une carte : la sienne, ou celle qu'accorde Tannuk, Steadfast Second aux cartes de votre main
 * (« les cartes d'artefact et de créature rouges de votre main ont la distorsion {2}{R} »).
 */
export function warpOf(s: GameState, player: PlayerId, card: ObjectId, d: CardDef): CardDef["warp"] {
  if (d.warp) return d.warp;
  const o = s.objects[card];
  if (o?.zone !== "hand") return undefined;
  for (const { ab } of playerStatics(s, player, "grantWarp")) {
    if (ab.grantWarp && matchesView(spellView(d, player), ab.grantWarp.filter, player)) {
      return { cost: ab.grantWarp.cost };
    }
  }
  return undefined;
}

/** Sort face cachée (déguisement) : la définition « face cachée », au coût de {3} (702.168a). */
export const FACE_DOWN_SPELL: CardDef = { ...FACE_DOWN_DEF, manaCost: { generic: 3, colored: {}, x: 0 }, manaCostText: "{3}" };

/**
 * Faces lançables d'une carte : la carte elle-même (recto) et, pour une aventure, l'aventure (face 1), sauf si la
 * carte est déjà « en aventure » (on ne peut alors lancer que la créature).
 */
export function castableFaces(s: GameState, card: ObjectId, d: CardDef): [number | undefined, CardDef][] {
  const o = s.objects[card];
  const adventure = d.layout === "adventure" ? d.faceDefs?.[1] : undefined;
  // Carte de terrain à aventure (Villes de FIN) : seule l'Aventure se lance.
  if (d.types.includes("Land")) return adventure && !o?.onAdventure ? [[1, adventure]] : [];
  if (adventure && !o?.onAdventure)
    return [
      [undefined, d],
      [1, adventure],
    ];
  // Carte scindée (709.3) : l'une ou l'autre moitié se lance (portes d'une Salle comprises).
  if (d.layout === "split" && d.faceDefs?.length === 2)
    return [
      [0, d.faceDefs[0] as CardDef],
      [1, d.faceDefs[1] as CardDef],
    ];
  // Carte recto-verso modale (712.12) : l'une ou l'autre face se lance.
  const back = d.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
  if (back && !back.types.includes("Land"))
    return [
      [undefined, d],
      [1, back],
    ];
  return [[undefined, d]];
}

const COMBAT_STEPS: readonly string[] = [
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
];
const inCombat = (s: GameState) => COMBAT_STEPS.includes(s.turn.step);

/**
 * Restrictions de lancer (famille D) qui pèsent en ce moment sur ce joueur, d'où qu'elles viennent : Bilbo's Gambit,
 * Avatar's Wrath, Kutzil, Grand Abolisher, Sandswirl Wanderglyph, High Noon, Yuriko.
 */
function castLimits(s: GameState, player: PlayerId): CastLimit[] {
  const out: CastLimit[] = [];
  for (const q of s.playerOrder) {
    for (const { ab } of playerStatics(s, q, "castLimit")) {
      const l = ab.castLimit;
      if (!l) continue;
      if (l.who === "you" ? q !== player : l.who === "opponents" ? q === player : false) continue;
      if (l.during === "yourTurn" && s.turn.active !== q) continue;
      if (l.during === "combat" && !inCombat(s)) continue;
      if (l.attackedYou && countTurnEvents(s, { event: "attack", againstYou: true }, q, player) === 0) continue;
      out.push(l);
    }
  }
  return out;
}

/** Karlov Watchdog : ce joueur peut-il retourner ses permanents face visible ? */
export function faceUpLocked(s: GameState, player: PlayerId): boolean {
  return castLimits(s, player).some((l) => l.faceUp);
}

/** Grand Abolisher, Yuriko : les capacités activées (hors mana) de cette source sont-elles bloquées ? */
function abilitiesLocked(s: GameState, player: PlayerId, source: ObjectId): boolean {
  return castLimits(s, player).some(
    (l) =>
      l.abilities === "all" ||
      (l.abilities === "artifactsCreaturesEnchantments" &&
        chars(s, source).types.some((t) => t === "Artifact" || t === "Creature" || t === "Enchantment")),
  );
}

export function castTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  const spells = s.players[player]?.turnStats.spellsCast ?? 0;
  const fromHand = s.objects[card]?.zone === "hand";
  for (const l of castLimits(s, player)) {
    if (l.faceUp) continue;
    if (l.sorceryTiming) {
      if (!sorceryTiming(s, player)) return null;
      continue;
    }
    if (l.spellTypes) {
      const types = s.defs[s.objects[card]?.defId ?? ""]?.types ?? [];
      const { types: only, notTypes } = l.spellTypes;
      if ((only && !only.some((t) => types.includes(t))) || notTypes?.some((t) => types.includes(t))) continue;
      if (countTurnEvents(s, { event: "cast", who: "you", ...l.spellTypes }, player) >= (l.maxSpells ?? 0)) return null;
      continue;
    }
    if (l.maxSpells !== undefined ? spells >= l.maxSpells : !l.exceptFromHand || !fromHand) return null;
  }
  const base = baseCastTerms(s, player, card);
  const terms = base && freeCastTerms(s, player, card, base);
  // Weftwalking : « le premier sort que chaque joueur lance pendant chacun de ses tours peut être lancé sans payer ».
  if (
    terms &&
    !terms.free &&
    s.turn.active === player &&
    (s.players[player]?.turnStats.spellsCast ?? 0) === 0 &&
    s.playerOrder.some((p) => playerStatic(s, p, "firstSpellFree"))
  ) {
    return { ...terms, freeOptional: true };
  }
  // Warped Space : « une fois par tour, vous pouvez payer {0} plutôt que le coût de mana d'un sort lancé depuis l'exil ».
  if (
    terms?.source === "exile" &&
    !terms.free &&
    !terms.freeOptional &&
    (s.players[player]?.turnStats.freeFromExile ?? 0) === 0 &&
    playerStatic(s, player, "freeFromExileOncePerTurn")
  ) {
    return { ...terms, freeOptional: true, warpedSpace: true };
  }
  return terms;
}

/**
 * « Vous pouvez lancer des sorts sans payer leur coût de mana » : permissions `freeFrom` (de la main : Omniscience ; de
 * toute zone : Dracogenesis, As Foretold), et « le prochain sort … peut être lancé sans payer son coût de mana »
 * (`NextSpell.free` : World War Hulk). Une permission « une fois par tour » n'est consommée que si elle sert
 * (`freeOnceKey`) ; le prochain sort, lui, consomme l'effet qu'il soit payé ou non. Jamais avec un autre coût alternatif
 * (118.9a : flashback, chaos, distorsion seule, coût de remplacement).
 */
function freeCastTerms(s: GameState, player: PlayerId, card: ObjectId, terms: CastTerms): CastTerms {
  if (terms.free || terms.freeOptional || terms.source === "flashback" || terms.mayhem || terms.warpOnly || terms.costOverride)
    return terms;
  const d = s.defs[s.objects[card]?.defId ?? ""];
  if (!d) return terms;
  const view = spellView(d, player);
  const next = s.playerEffects.some((e) => {
    const n = e.player === player && e.once ? e.ability.nextSpell : undefined;
    return !!n?.free && (!n.filter || matchesView(view, n.filter, player));
  });
  if (next) return { ...terms, freeOptional: true };
  // Omnipresence : seulement si la valeur de mana ne dépasse pas le nombre de créatures que vous contrôlez.
  const creatures = () => s.battlefield.filter((id) => obj(s, id).controller === player && isCreature(s, id)).length;
  const perms = controlledAbilitiesWithSource(s, player).filter(
    ({ id, ab }) =>
      ab.kind === "castPermission" &&
      (ab.freeFrom === "any" || (ab.freeFrom === "hand" && terms.source === "hand")) &&
      (!ab.freeMaxManaValueCreatures || manaValue(d.manaCost) <= creatures()) &&
      // Dracogenesis : seulement les sorts de Dragon.
      (!ab.freeFilter || matchesView(view, resolveFilter(s, ab.freeFilter, id), player)) &&
      (!ab.condition || checkCondition(s, ab.condition, player, id)) &&
      // Zaffai and the Tempests : une fois par tour (la permission est consommée par un sort lancé gratuitement).
      !(ab.freeOncePerTurn && s.turn.onceFired.includes(`freeCast:${id}`)),
  );
  if (perms.length === 0) return terms;
  const unlimited = perms.some(({ ab }) => ab.kind === "castPermission" && !ab.freeOncePerTurn);
  const once = unlimited ? undefined : perms[0];
  return { ...terms, freeOptional: true, ...(once ? { freeOnceKey: `freeCast:${once.id}` } : {}) };
}

function baseCastTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  const o = s.objects[card];
  if (!o) return null;
  const d = s.defs[o.defId];
  if (!d) return null;
  if (d.castCondition && !checkCondition(s, d.castCondition, player, card)) return null;
  if (o.zone === "hand") {
    if (o.owner !== player) return null;
    // Buster Sword : un sort de votre main sans payer son coût de mana, ce tour-ci.
    const handPerm = exilePermission(s, player, card);
    if (handPerm) return { source: "hand", free: handPerm.free, anyTime: handPerm.anyTime, costOverride: handPerm.cost };
    return { source: "hand" };
  }
  // 903.8 : son propriétaire peut lancer son commandant depuis la zone de commandement, pour {2} de plus par lancer
  // précédent depuis cette zone (taxe de commandant, payée même si le sort est gratuit).
  if (o.zone === "command") {
    const rec = o.owner === player ? commanderOf(s, o) : undefined;
    if (!rec) return null;
    return { source: "command", ...(rec.casts ? { extraCost: 2 * rec.casts } : {}) };
  }
  if (o.zone === "graveyard") {
    // Tinybones, the Pickpocket : une carte d'un autre cimetière, lançable avec du mana de n'importe quel type.
    const gyPerm = exilePermission(s, player, card);
    if (gyPerm?.flashback) return { source: "flashback", free: gyPerm.free, harmonize: gyPerm.harmonize };
    if (gyPerm)
      return {
        source: "graveyard",
        anyMana: gyPerm.anyMana,
        free: gyPerm.free,
        // « Vous pouvez lancer [la carte] » pendant une résolution (608.2g) : le moment de lancement est ignoré.
        anyTime: gyPerm.anyTime,
        exileAfter: gyPerm.exileAfter,
        ...(gyPerm.adventureOnly ? { adventureOnly: true } : {}),
      };
    if (o.owner !== player) return null;
    // Timeline Culler : « vous pouvez lancer cette carte depuis votre cimetière avec sa distorsion ».
    if (d.warp?.fromGraveyard) return { source: "graveyard", warpOnly: true };
    // Chaos (Mayhem) : défaussée ce tour-ci, elle se lance depuis le cimetière pour son coût de chaos.
    if (d.mayhem && o.discardedTurn === s.turn.number) return { source: "graveyard", mayhem: true };
    if (d.flashback) return { source: "flashback" };
    // Permissions « jouer depuis le cimetière » (famille C) : Case of the Uneaten Feast, Hades, The Tomb of Aclazotz,
    // Noctis (PV et finalité), Festival of Embers (PV), Osteomancer Adept (fourrager et finalité)…
    const rules = playFromRules(s, player, card, "graveyard", "spells");
    const free = rules.find((r) => !r.payLife && !r.forage && !r.exileOthers && !r.finality && !r.addSubtypes);
    if (free) return playFromTerms(free, "graveyard");
    const t = graveyardTypeAvailable(s, player, card);
    if (t && t !== "Land") return { source: "graveyard", graveyardType: t };
    if (rules[0]) return playFromTerms(rules[0], "graveyard");
    const fromGy = d.castFromGraveyard;
    if (fromGy && (!fromGy.condition || checkCondition(s, fromGy.condition, player, card))) {
      // Wickerfolk Indomitable : « en payant 2 PV et en sacrifiant un artefact ou une créature en plus ».
      if (fromGy.payLife && payableLife(s, player) < fromGy.payLife) return null;
      // Hundred-Battle Veteran : « si vous le faites, il arrive avec un marqueur de finalité ».
      return { source: "graveyard", payLife: fromGy.payLife, finality: fromGy.finality };
    }
    if (d.graveyardCastRemoveCounters && countersAmongCreatures(s, player) >= d.graveyardCastRemoveCounters) {
      return { source: "graveyard", removeCounters: d.graveyardCastRemoveCounters };
    }
    return null;
  }
  if (o.zone === "library") {
    // Vizier of the Menagerie (créatures, mana de n'importe quel type), The Lunar Whale, Mm'menon (artefacts)…
    const top = s.players[o.owner]?.library[0];
    if (o.owner !== player || top !== card) return null;
    // Planetarium of Wan Shi Tong : « vous pouvez lancer cette carte sans payer son coût » (permission, `castNow`).
    const libPerm = exilePermission(s, player, card);
    if (libPerm)
      return {
        source: "library",
        anyMana: libPerm.anyMana,
        free: libPerm.free,
        exileAfter: libPerm.exileAfter,
        anyTime: libPerm.anyTime,
      };
    const rule = playFromRules(s, player, card, "libraryTop", "spells")[0];
    // Gwenom : des PV égaux à sa valeur de mana plutôt que son coût de mana (comme Valgavoth).
    if (rule?.payLifeManaValue) {
      const life = manaValue(d.manaCost);
      if (life > 0 && payableLife(s, player) < life) return null;
      return { source: "library", free: true, payLife: life || undefined, playFrom: rule };
    }
    return rule ? playFromTerms(rule, "library") : null;
  }
  if (o.zone === "exile") {
    // 702.143a : une carte présagée se lance à un tour ultérieur pour son coût de présage.
    if (o.foretoldTurn !== undefined) {
      return o.owner === player && o.foretoldTurn < s.turn.number && d.foretell
        ? { source: "exile", costOverride: d.foretell }
        : null;
    }
    // 702.170d : une carte complotée se lance sans payer son coût, à un tour ultérieur, au moment d'un rituel.
    if (o.plottedTurn !== undefined) {
      return o.owner === player && o.plottedTurn < s.turn.number ? { source: "exile", free: true, sorceryTiming: true } : null;
    }
    // Reality Fracture : la copie du sort d'un permanent préparé, lançable par le contrôleur actuel de ce permanent.
    if (o.preparedFor) {
      const perm = s.objects[o.preparedFor];
      return perm?.zone === "battlefield" && perm.controller === player && perm.preparedCopy === card
        ? { source: "exile" }
        : null;
    }
    // Null Summoner : la carte exilée et liée, lançable sous condition, avec du mana de n'importe quel type.
    for (const id of s.battlefield) {
      const src = obj(s, id);
      if (src.controller !== player || !src.linked?.includes(card)) continue;
      const ab = chars(s, id).abilities.find((a) => a.kind === "castPermission" && a.linkedCards);
      if (ab?.kind === "castPermission" && (!ab.condition || checkCondition(s, ab.condition, player, id))) {
        if (ab.linkedWaterbend) {
          const generic = manaValue(d.manaCost);
          return { source: "exile", costOverride: { generic, colored: {}, x: 0 }, waterbendOverride: true };
        }
        if (!ab.linkedFilter) return { source: "exile", anyMana: true };
        const onceKey = ab.linkedOncePerTurn ? `linkedCast:${id}` : undefined;
        if (onceKey && s.turn.onceFired.includes(onceKey)) continue;
        if (ab.linkedThisTurn && o.controlledSince !== s.turn.number) continue;
        if (ab.linkedRemoveCounters && countersAmongCreatures(s, player) < ab.linkedRemoveCounters) continue;
        const maxMv =
          ab.linkedMaxManaValue !== undefined
            ? evalAmount(s, reductionContext(s, player, id, src.defId), ab.linkedMaxManaValue)
            : undefined;
        if (maxMv !== undefined && manaValue(d.manaCost) > maxMv) continue;
        if (
          (ab.linkedAnyOwner || o.owner === player) &&
          matchesCard(s, player, card, { ...ab.linkedFilter, controller: undefined }, id)
        )
          return {
            source: "exile",
            finality: ab.linkedFinality,
            free: ab.linkedFree,
            anyMana: ab.linkedAnyMana,
            removeCounters: ab.linkedRemoveCounters,
            onceKey,
          };
      }
    }
    // Valgavoth : pendant votre tour, les cartes liées ; un sort ainsi lancé coûte des PV égaux à sa valeur de mana.
    if (valgavothLinked(s, player, card)) {
      const life = manaValue(d.manaCost);
      if (life > 0 && payableLife(s, player) < life) return null;
      return { source: "exile", free: true, payLife: life || undefined };
    }
    // 715.4 : la carte « en aventure » : son propriétaire peut lancer la créature.
    if (o.onAdventure && o.owner === player) return { source: "exile" };
    // 702.185a : exilée par la distorsion, lançable depuis l'exil à partir du tour suivant.
    if (o.warpExiledTurn !== undefined && o.owner === player && s.turn.number > o.warpExiledTurn) return { source: "exile" };
    const perm = exilePermission(s, player, card);
    // Inside Information : des PV égaux à sa valeur de mana plutôt que son coût de mana (comme Valgavoth).
    if (perm?.payLifeManaValue && !d.types.includes("Land")) {
      const life = manaValue(d.manaCost);
      if (life > 0 && payableLife(s, player) < life) return null;
      return { source: "exile", free: true, payLife: life || undefined };
    }
    if (perm)
      return {
        source: "exile",
        free: perm.free,
        anyTime: perm.anyTime,
        extraCost: perm.extraCost,
        anyMana: perm.anyMana,
        costOverride: perm.cost,
        // « … puis exilez-la » (Nita, Forum Conciliator), comme depuis le cimetière.
        exileAfter: perm.exileAfter,
        bottomAfter: perm.bottomAfter,
      };
    // Tinybones : cartes d'adversaires exilées avec un marqueur de butin, pendant votre tour.
    if (stashPlayable(s, player, o)) return { source: "exile", anyMana: true };
  }
  return null;
}

/** D'où ce sort peut-il être lancé par ce joueur ? */
export function castSource(s: GameState, player: PlayerId, card: ObjectId): CastTerms["source"] | null {
  return castTerms(s, player, card)?.source ?? null;
}

/** Marqueurs (tous types) sur les créatures que ce joueur contrôle. */
function countersAmongCreatures(s: GameState, player: PlayerId): number {
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && isCreature(s, id))
    .reduce((n, id) => n + Object.values(obj(s, id).counters).reduce((a, b) => a + Math.max(0, b), 0), 0);
}

/**
 * « Retirez N marqueurs parmi les créatures que vous contrôlez » (Quilled Greatwurm, Dawnhand Dissident) : le joueur
 * répartit les retraits entre ses créatures, un objet par marqueur (`repeat`) ; suggestion : les plus chargées d'abord.
 */
function countersAmongPick(s: GameState, player: PlayerId, n: number): CostPick {
  const options = s.battlefield
    .filter((id) => obj(s, id).controller === player && isCreature(s, id) && countersOf(s, id) > 0)
    .sort((a, b) => countersOf(s, b) - countersOf(s, a));
  return {
    slot: "counterFrom",
    label: `Retirez ${n} marqueur(s) parmi les créatures que vous contrôlez`,
    count: n,
    options,
    suggested: options.flatMap((id) => Array<ObjectId>(countersOf(s, id)).fill(id)).slice(0, n),
    repeat: Object.fromEntries(options.map((id) => [id, countersOf(s, id)])),
  };
}

/** Retire un marqueur par occurrence de chaque créature choisie ; sa sorte : les −1/−1 d'abord, les +1/+1 en dernier. */
function removeCountersFromEach(s: GameState, from: ObjectId[]): void {
  const times = new Map<ObjectId, number>();
  for (const id of from) times.set(id, (times.get(id) ?? 0) + 1);
  for (const [id, n] of times) {
    const o = obj(s, id);
    const kinds = anyCountersDefault(o, n);
    for (const kind of new Set(kinds)) changeCounters(s, o, kind, -kinds.filter((k) => k === kind).length);
  }
}

function countersOf(s: GameState, id: ObjectId): number {
  return Object.values(obj(s, id).counters).reduce((a, b) => a + Math.max(0, b), 0);
}

/** Options des coûts additionnels (cartes à défausser, permanents à sacrifier), ou null s'ils sont impayables. */
export function additionalOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  flashback = false,
): {
  discard?: {
    count: number;
    options: ObjectId[];
    orLife?: number;
    orSacrifice?: boolean;
    orPay?: ManaCost;
    orPayAffordable?: boolean;
  };
  sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
} | null {
  let add = additionalCostOf(d, flashback);
  // Wickerfolk Indomitable : sacrifice supplémentaire quand elle est lancée depuis le cimetière.
  const gy = s.objects[card]?.zone === "graveyard" ? d.castFromGraveyard : undefined;
  if (gy?.sacrifice) add = { ...add, sacrifice: { filter: gy.sacrifice, count: 1 } };
  // Alien Symbiosis : « en défaussant une carte en plus de ses autres coûts ».
  if (gy?.discard) add = { ...add, discard: gy.discard, ...(gy.discardFilter ? { discardFilter: gy.discardFilter } : {}) };
  if (!add) return {};
  // Contemplation obligatoire (Monstrous Emergence) : il faut un permanent ou une carte à choisir.
  if (add.behold?.required && beholdOptions(s, player, card, add.behold.filter, add.behold.exiled).length === 0) return null;
  const out: ReturnType<typeof additionalOptions> = {};
  if (add.discard) {
    const df = add.discardFilter;
    const hand = (s.players[player]?.hand ?? []).filter(
      (id) => id !== card && (!df || matchesCard(s, player, id, { ...df, controller: undefined })),
    );
    // Souls of the Lost : « … ou sacrifiez un permanent ».
    const sf = typeof add.discardOrSacrifice === "object" ? add.discardOrSacrifice : undefined;
    const perms = add.discardOrSacrifice
      ? s.battlefield.filter((id) => obj(s, id).controller === player && (!sf || matchesObjectFilter(s, player, id, sf)))
      : [];
    const options = [...hand, ...perms];
    // Bitter Triumph : « … ou payez 3 points de vie » (il faut en avoir au moins autant, 119.4).
    const orLife = add.discardOrLife !== undefined && payableLife(s, player) >= add.discardOrLife ? add.discardOrLife : undefined;
    if (options.length < add.discard && orLife === undefined && !add.discardOrPay) return null;
    out.discard = {
      count: add.discard,
      options,
      ...(orLife !== undefined ? { orLife } : {}),
      ...(add.discardOrPay ? { orPay: add.discardOrPay } : {}),
      ...(add.discardOrSacrifice ? { orSacrifice: true } : {}),
    };
  }
  if (add.sacrifice) {
    const f = add.sacrifice.filter;
    const options = s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
    // « Sacrifiez une créature ou payez {3}{B} » : sans créature, il reste l'option de payer.
    if (options.length < add.sacrifice.count && !add.sacrifice.orPay) return null;
    out.sacrifice = { count: add.sacrifice.count, options, orPay: add.sacrifice.orPay };
  }
  return out;
}

/**
 * Coûts additionnels choisis automatiquement (Duskmourn) : exiler ou renvoyer des permanents que vous contrôlez, engager
 * des permanents dégagés, exiler des cartes de votre cimetière. On paie avec ce qui vaut le moins : jetons et petits
 * permanents d'abord ; pour engager, les créatures avant les terrains. `null` : le coût ne peut pas être payé.
 */
/** Coûts additionnels du sort, et ceux du flashback quand il est lancé ainsi (Twinned Vision, Group Project). */
function additionalCostOf(d: CardDef, flashback: boolean): CardDef["additionalCost"] {
  return flashback && d.flashbackCost ? { ...d.additionalCost, ...d.flashbackCost } : d.additionalCost;
}

export function autoAdditional(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  flashback = false,
): { exile: ObjectId[]; bounce: ObjectId[]; tap: ObjectId[]; graveyard: ObjectId[] } | null {
  const out = { exile: [] as ObjectId[], bounce: [] as ObjectId[], tap: [] as ObjectId[], graveyard: [] as ObjectId[] };
  const add = additionalCostOf(d, flashback);
  if (!add) return out;
  const used = new Set<ObjectId>();
  const mine = (f: ObjectFilter) =>
    s.battlefield.filter((id) => !used.has(id) && obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost ?? null);
  const pick = (ids: ObjectId[], n: number, score: (id: ObjectId) => number): ObjectId[] | null => {
    if (ids.length < n) return null;
    const chosen = [...ids].sort((a, b) => score(a) - score(b)).slice(0, n);
    for (const id of chosen) used.add(id);
    return chosen;
  };
  const isLand = (id: ObjectId) => chars(s, id).types.includes("Land");
  if (add.exile) {
    const f = add.exile.filter;
    // Contempler : une carte de la main (autre que celle qu'on lance) convient aussi ; on exile d'abord un jeton, puis une
    // carte de la main, puis un permanent, chaque fois le moins cher.
    const hand = add.exile.fromHand
      ? (s.players[player]?.hand ?? []).filter((id) => id !== card && matchesCard(s, player, id, f, card))
      : [];
    const where = (id: ObjectId) => (obj(s, id).isToken ? -100 : obj(s, id).zone === "hand" ? 0 : 50);
    const c = pick([...mine(f), ...hand], add.exile.count, (id) => where(id) + mv(id));
    if (!c) return null;
    out.exile = c;
  }
  if (add.bounce) {
    const c = pick(mine(add.bounce.filter), add.bounce.count, (id) =>
      obj(s, id).isToken ? 100 : isLand(id) ? 50 + (obj(s, id).tapped ? 0 : 1) : mv(id),
    );
    if (!c) return null;
    out.bounce = c;
  }
  if (add.tap) {
    const options = mine({ ...add.tap.filter, tapped: false });
    const score = (id: ObjectId) => (isLand(id) ? 100 : chars(s, id).power);
    let c = pick(options, add.tap.count, score);
    if (!c) return null;
    // Guardian of the Great Door : si les permanents engagés par défaut ne laissent pas de quoi payer le mana du sort, on
    // les choisit un par un en gardant les sources nécessaires (quand c'est possible).
    const cost = spellCost(s, player, d, { flashback, card });
    const others = [...used].filter((id) => !c?.includes(id));
    if (!canPay(s, player, cost, new Set(used))) {
      for (const id of c) used.delete(id);
      const chosen: ObjectId[] = [];
      for (let i = 0; i < add.tap.count; i++) {
        const rest = [...options].filter((id) => !chosen.includes(id)).sort((a, b) => score(a) - score(b));
        const keep = rest.find((id) => canPay(s, player, cost, new Set([...others, ...chosen, id]))) ?? rest[0];
        if (keep) chosen.push(keep);
      }
      for (const id of chosen) used.add(id);
      c = chosen;
    }
    out.tap = c;
  }
  if (add.exileGraveyard) {
    const gy = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
    if (gy.length < add.exileGraveyard) return null;
    out.graveyard = [...gy]
      .sort(
        (a, b) =>
          Number(!s.defs[obj(s, a).defId]?.types.includes("Land")) - Number(!s.defs[obj(s, b).defId]?.types.includes("Land")),
      )
      .slice(0, add.exileGraveyard);
  }
  return out;
}

/**
 * Contempler (701.65) : les permanents correspondants que vous contrôlez, puis les cartes correspondantes de votre main
 * (autres que la carte lancée). Un permanent d'abord : il n'y a rien à révéler.
 */
export function beholdOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  filter: ObjectFilter,
  exiled?: ExiledFilter,
): ObjectId[] {
  const mine = s.battlefield.filter(
    (id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, { ...filter, controller: "you" }, card),
  );
  // Close Encounter : une carte exilée correspondante au lieu d'une carte de la main.
  const others = exiled
    ? s.exile.filter((id) => matchesExiled(s, player, id, exiled, card))
    : (s.players[player]?.hand ?? []).filter((id) => id !== card && matchesCard(s, player, id, filter, card));
  return [...mine, ...others];
}

/**
 * Contemplation suggérée : un permanent d'abord (rien à révéler) ; obligatoire (Monstrous Emergence, Close Encounter : des
 * blessures égales à sa force), la plus grande force, un permanent à force égale.
 */
function beholdSuggestion(s: GameState, options: ObjectId[], required?: boolean): ObjectId | null {
  if (!required) return options[0] ?? null;
  let best: ObjectId | null = null;
  let max = Number.NEGATIVE_INFINITY;
  for (const id of options) {
    const p = chars(s, id).power;
    if (p > max) [best, max] = [id, p];
  }
  return best;
}

/**
 * Le permanent ou la carte contemplé au lancement : celui choisi (vérifié ; liste vide : aucun, sauf contemplation
 * obligatoire), sinon la suggestion.
 */
function beholdChoice(s: GameState, player: PlayerId, card: ObjectId, d: CardDef, chosen: ObjectId[] | undefined) {
  const behold = d.additionalCost?.behold;
  if (!behold) {
    if (chosen?.length) throw new RulesError("Ce sort ne demande pas de contempler");
    return null;
  }
  const options = beholdOptions(s, player, card, behold.filter, behold.exiled);
  const id = chosen === undefined ? beholdSuggestion(s, options, behold.required) : (chosen[0] ?? null);
  if (chosen && chosen.length > 1) throw new RulesError("Contemplation invalide");
  if (id === null) {
    if (behold.required) throw new RulesError("Choisissez ce que le coût additionnel demande");
    return null;
  }
  if (!options.includes(id)) throw new RulesError("Contemplation invalide");
  return id;
}

/** Emplacement de chaque coût additionnel choisi par le joueur. */
const ADDITIONAL_SLOTS = { exile: "costExile", bounce: "costBounce", tap: "costTap", graveyard: "costGraveyard" } as const;

/**
 * Coûts additionnels payés avec des objets (exiler, renvoyer ou engager des permanents, exiler des cartes du cimetière) :
 * le joueur les choisit ; la suggestion est le choix automatique (`autoAdditional`).
 */
export function additionalPicks(s: GameState, player: PlayerId, card: ObjectId, d: CardDef, flashback = false): CostPick[] {
  const add = additionalCostOf(d, flashback);
  const auto = add ? autoAdditional(s, player, card, d, flashback) : null;
  if (!add || !auto) return [];
  const mine = (f: ObjectFilter) =>
    s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
  const out: CostPick[] = [];
  if (add.exile) {
    const f = add.exile.filter;
    const hand = add.exile.fromHand
      ? (s.players[player]?.hand ?? []).filter((id) => id !== card && matchesCard(s, player, id, f, card))
      : [];
    out.push({
      slot: "costExile",
      label: add.exile.fromHand
        ? `Contemplez et exilez ${add.exile.count} carte(s) (en jeu ou de votre main)`
        : `Exilez ${add.exile.count} permanent(s) que vous contrôlez`,
      count: add.exile.count,
      options: [...mine(f), ...hand],
      suggested: auto.exile,
    });
  }
  if (add.bounce)
    out.push({
      slot: "costBounce",
      label: `Renvoyez ${add.bounce.count} permanent(s) que vous contrôlez en main`,
      count: add.bounce.count,
      options: mine(add.bounce.filter),
      suggested: auto.bounce,
    });
  if (add.tap)
    out.push({
      slot: "costTap",
      label: `Engagez ${add.tap.count} permanent(s) dégagé(s) que vous contrôlez`,
      count: add.tap.count,
      options: mine({ ...add.tap.filter, tapped: false }),
      suggested: auto.tap,
    });
  if (add.exileGraveyard)
    out.push({
      slot: "costGraveyard",
      label: `Exilez ${add.exileGraveyard} carte(s) de votre cimetière`,
      count: add.exileGraveyard,
      options: (s.players[player]?.graveyard ?? []).filter((id) => id !== card),
      suggested: auto.graveyard,
    });
  return out;
}

/** Les objets des coûts additionnels : ceux choisis par le joueur (vérifiés, sans doublon d'un coût à l'autre), sinon le choix automatique. */
function chosenAdditional(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  flashback: boolean,
  auto: NonNullable<ReturnType<typeof autoAdditional>>,
  picks: CastChoices["picks"],
): NonNullable<ReturnType<typeof autoAdditional>> {
  const out = { ...auto };
  const offered = additionalPicks(s, player, card, d, flashback);
  for (const slot of Object.values(ADDITIONAL_SLOTS))
    if (picks?.[slot] && !offered.some((p) => p.slot === slot)) throw new RulesError("Ce sort n'a pas ce coût additionnel");
  const used = new Set<ObjectId>();
  for (const [key, slot] of Object.entries(ADDITIONAL_SLOTS) as [keyof typeof ADDITIONAL_SLOTS, CostSlot][]) {
    const p = offered.find((x) => x.slot === slot);
    if (!p) continue;
    const chosen = resolvePick(s, p, picks?.[slot]);
    if (new Set(chosen).size !== chosen.length || chosen.some((id) => used.has(id)))
      throw new RulesError("Un même objet ne paie pas deux coûts");
    for (const id of chosen) used.add(id);
    out[key] = chosen;
  }
  return out;
}

/**
 * Couleurs proposées pour le mana hybride d'un sort, seulement si une de ses capacités lit les couleurs dépensées (`spentColor`) :
 * sinon le paiement automatique choisit sans que le résultat change.
 */
export function hybridColors(d: CardDef): ManaType[] {
  const pairs = [...(d.manaCost?.hybrid ?? []), ...((d.evoke ?? d.altCost?.mana)?.hybrid ?? [])];
  if (!pairs.length || !JSON.stringify(d.abilities).includes('"kind":"spentColor"')) return [];
  return [...new Set(pairs.flat())];
}

/** Le coût, chaque symbole hybride qui contient cette couleur payé de cette couleur. */
export function hybridPaidAs(cost: ManaCost, color: ManaType): ManaCost {
  const keep = (cost.hybrid ?? []).filter((h) => !h.includes(color));
  const n = (cost.hybrid ?? []).length - keep.length;
  return { ...cost, colored: { ...cost.colored, [color]: (cost.colored[color] ?? 0) + n }, hybrid: keep };
}

export function castSpell(s: GameState, player: PlayerId, card: ObjectId, choices: CastChoices): void {
  const terms = castTerms(s, player, card);
  if (!terms) throw new RulesError("Vous ne pouvez pas lancer cette carte d'ici");
  const o = obj(s, card);
  const cardDef = s.defs[o.defId];
  // Un terrain avec le déguisement (Branch of Vitu-Ghazi) se lance face cachée.
  const landFaceDown = !!cardDef?.types.includes("Land") && !!choices.faceDown && !!cardDef.disguise;
  if (!cardDef || (cardDef.types.includes("Land") && cardDef.layout !== "adventure" && !landFaceDown))
    throw new RulesError("Ce n'est pas un sort");
  if (!cardDef.implemented) throw new RulesError(`${cardDef.name} n'est pas encore géré par le moteur`);
  // Face lancée : la carte elle-même, ou son aventure (715.3).
  const face = landFaceDown
    ? ([undefined, cardDef] as [number | undefined, CardDef])
    : castableFaces(s, card, cardDef).find(([f]) => f === choices.face);
  if (!face) throw new RulesError("Cette face ne peut pas être lancée");
  if (terms.adventureOnly && !(face[0] === 1 && face[1].subtypes.includes("Adventure")))
    throw new RulesError("Cette carte ne se lance d'ici qu'en Aventure");
  // Déguisement (702.168a) : lancée face cachée comme une créature 2/2 sans nom pour {3}.
  if (choices.faceDown && !cardDef.disguise) throw new RulesError("Cette carte ne peut pas être lancée face cachée");
  // Distorsion (702.185) : depuis la main (ou le cimetière si la carte le permet), pour son coût de distorsion.
  const warp = choices.warp ? warpOf(s, player, card, cardDef) : undefined;
  if (choices.warp && (!warp || (terms.source !== "hand" && !(terms.source === "graveyard" && warp.fromGraveyard)))) {
    throw new RulesError("Cette carte ne peut pas être lancée avec la distorsion");
  }
  if (terms.warpOnly && !choices.warp) throw new RulesError("Cette carte ne se lance d'ici qu'avec la distorsion");
  if (warp?.life && payableLife(s, player) < warp.life) throw new RulesError("Pas assez de points de vie");
  const d = choices.faceDown ? FACE_DOWN_SPELL : warp ? { ...face[1], manaCost: warp.cost } : face[1];
  if (splitSecondOnStack(s)) throw new RulesError("Aucun sort ni capacité maintenant (second partagé ou combat)");
  // Harbinger of the Tides : « comme s'il avait le flash si vous payez {2} de plus ».
  const flashExtra = !terms.anyTime && !canCastTiming(s, player, d) ? d.flashExtraCost : undefined;
  // Faufilement (702.190a) : à l'étape de déclaration des bloqueurs, quand vous avez la priorité.
  const sneakNow = !!choices.alternative && sneakTiming(s, player, d);
  if (!terms.anyTime && !canCastTiming(s, player, d) && !flashExtra && !sneakNow)
    throw new RulesError("Vous ne pouvez pas lancer ce sort maintenant");
  if (terms.sorceryTiming && !sorceryTiming(s, player)) throw new RulesError("Seulement au moment d'un rituel");
  const flashback = terms.source === "flashback";
  const free = !!terms.free || (!!choices.free && !!terms.freeOptional);
  if (free && terms.warpedSpace) {
    const stats = s.players[player]?.turnStats;
    if (stats) stats.freeFromExile = (stats.freeFromExile ?? 0) + 1;
  }
  if (choices.free && !free) throw new RulesError("Ce sort ne peut pas être lancé sans payer son coût");
  const alternative = !!choices.alternative && !free;
  if (alternative && !altCostFor(s, player, d)) {
    throw new RulesError("Coût alternatif indisponible");
  }
  const modes = modesOf(d);
  const modeIndex = choices.mode ?? 0;
  const mode = modes[modeIndex];
  if (!mode) throw new RulesError("Mode invalide");
  // Surcharge, fendre : le mode se lance pour son propre coût, ni gratuitement ni avec un autre coût alternatif (118.9a).
  if (mode.cost && (free || alternative)) throw new RulesError("Ce mode se lance seulement pour son propre coût");
  const dc = mode.cost ? { ...d, manaCost: mode.cost } : d;
  // « Si le coût additionnel a été payé, choisissez les deux à la place » : le mode exige (ou exclut) le kicker choisi
  // avec la décision.
  if (mode.condition && !modeConditionHolds(s, player, card, mode.condition, !!choices.kicked)) {
    if (modeConditionHolds(s, player, card, mode.condition, !choices.kicked))
      throw new RulesError(
        choices.kicked ? "Coût additionnel payé : choisissez les deux modes" : "Ce mode demande de payer le coût additionnel",
      );
    throw new RulesError("Ce mode n'est pas disponible");
  }
  const targets = validateTargets(s, player, mode.targets, choices.targets, {
    kicked: !!choices.kicked,
    sourceId: card,
    x: choices.x,
  });
  const hasX =
    (!free && !!(flashback ? (dc.flashback ?? dc.manaCost)?.x : dc.manaCost?.x)) || !!d.xCost || d.kickerKind === "replicate";
  const x = hasX ? Math.max(0, Math.floor(choices.x ?? 0)) : 0;
  // Vicious Rivalry : « en coût additionnel, payez X points de vie ».
  if (d.xCost === "life" && x > payableLife(s, player)) throw new RulesError("Pas assez de points de vie");
  // Soul Immolation : « flétrissez X ; X ne peut pas dépasser la plus grande endurance parmi vos créatures ».
  if (d.xCost === "blight" && x > greatestToughness(s, player)) throw new RulesError("X dépasse la plus grande endurance");
  const kicked = !!choices.kicked && !!d.kicker && d.kickerKind !== "replicate";
  // Part du coût payable par la maîtrise de l'eau : coût additionnel, kicker, ou coût de remplacement (Hama).
  const bendPaid =
    waterbendAmount(d, kicked, x) +
    (terms.waterbendOverride && terms.costOverride && !free && !alternative ? terms.costOverride.generic : 0);
  // Coûts additionnels : vérifiés avant tout changement d'état.
  const opts = additionalOptions(s, player, card, d, flashback);
  if (!opts) throw new RulesError("Impossible de payer le coût additionnel");
  // Kicker sans mana (Marchandage) : le permanent à sacrifier ou à renvoyer, choisi par le joueur (`sacrifice`, quand le
  // sort n'a pas d'autre sacrifice en coût) ; sans choix, le moins cher, jeton d'abord.
  const kickerOptions =
    kicked && d.kickerCost && d.kickerCost.life === undefined ? kickerCostOptions(s, player, card, d, flatTargets(targets)) : [];
  const kickerChoice = kicked && d.kickerCost && !opts.sacrifice && choices.sacrifice?.length ? choices.sacrifice : undefined;
  if (kickerChoice && (kickerChoice.length !== 1 || !kickerOptions.includes(kickerChoice[0] as ObjectId)))
    throw new RulesError("Permanent invalide pour ce coût");
  const kickerPermanent = kickerChoice?.[0] ?? kickerOptions[0];
  const teamwork = kicked ? d.kickerCost?.tapPower : undefined;
  const evidence =
    kicked && d.kickerCost?.collectEvidence ? spellPickNow(s, player, card, d, x, "evidence", "kicked", choices) : undefined;
  if (evidence === null) throw new RulesError("Pas assez de preuves à réunir dans votre cimetière");
  // Urgent Necropsy : « réunissez des preuves X, X étant la valeur de mana totale des permanents ciblés ».
  const targetEvidenceX = d.additionalCost?.collectEvidenceTargetsManaValue
    ? flatTargets(targets).reduce(
        (n, id) => n + (s.objects[id]?.zone === "battlefield" ? (snapshot(s, id).manaValue ?? 0) : 0),
        0,
      )
    : 0;
  const targetEvidence = targetEvidenceX > 0 ? evidenceCards(s, player, card, targetEvidenceX) : undefined;
  if (targetEvidence === null) throw new RulesError("Pas assez de preuves à réunir dans votre cimetière");
  const gyExile =
    kicked && d.kickerCost?.exileGraveyard ? spellPickNow(s, player, card, d, x, "graveyardExile", "kicked", choices) : undefined;
  if (gyExile === null) throw new RulesError("Pas assez de cartes dans votre cimetière");
  // Redirect Lightning : « payez 5 PV ou payez {2} » (le kicker est le paiement en PV).
  const kickerLife = kicked ? d.kickerCost?.life : undefined;
  if (kickerLife !== undefined && payableLife(s, player) < kickerLife) throw new RulesError("Pas assez de points de vie");
  if (kicked && d.kickerCost && kickerLife === undefined && !teamwork && !evidence && !gyExile && !kickerPermanent)
    throw new RulesError("Impossible de payer le kicker");
  // Travail d'équipe : les créatures engagées (choisies par `tap`, sinon les plus faibles suffisantes).
  const teamTap = teamwork !== undefined ? chosenCrew(s, player, card, teamwork, choices.tap) : [];
  if (teamwork !== undefined && teamTap.length === 0) throw new RulesError("Force totale insuffisante pour le travail d'équipe");
  const discard = choices.discard ?? [];
  const sacrifice = kickerChoice ? [] : (choices.sacrifice ?? []);
  const check = (chosen: ObjectId[], spec?: { count: number; options: ObjectId[]; orPay?: ManaCost; orLife?: number }) => {
    const need = spec?.count ?? 0;
    if (spec?.orPay && chosen.length === 0) return; // on paiera le mana à la place
    if (spec?.orLife !== undefined && chosen.length === 0) return; // on paiera les points de vie à la place
    if (chosen.length !== need || new Set(chosen).size !== need || chosen.some((id) => !spec?.options.includes(id))) {
      throw new RulesError("Choix du coût additionnel invalide");
    }
  };
  check(discard, opts.discard);
  check(sacrifice, opts.sacrifice);
  const autoPaid = autoAdditional(s, player, card, d, flashback);
  if (!autoPaid) throw new RulesError("Impossible de payer le coût additionnel");
  const auto = chosenAdditional(s, player, card, d, flashback, autoPaid, choices.picks);
  const beheldId = beholdChoice(s, player, card, d, choices.picks?.behold);
  // « … si vous contrôliez une Fée en lançant ce sort » : évaluée maintenant (601.2), avant le paiement.
  const metWhenCast = d.whenCast ? checkCondition(s, d.whenCast, player, card) : undefined;
  // Molten Exhale : « comme s'il avait le flash si vous contemplez » : lancé ainsi, il faut contempler.
  if (d.additionalCost?.behold && d.flashIf && !beheldId && !canCastTiming(s, player, { ...d, flashIf: undefined }))
    throw new RulesError("Sans contempler, ce sort ne se lance qu'au moment d'un rituel");
  let cost = spellCost(s, player, dc, {
    beheld: !!beheldId,
    x,
    kicked,
    flashback,
    free,
    alternative,
    anyMana: terms.anyMana,
    mayhem: terms.mayhem,
    costOverride: terms.costOverride,
    targets,
    fromZone: terms.source,
    card,
  });
  // Terror of the Peaks : « les sorts de vos adversaires qui ciblent cette créature coûtent 3 PV de plus ».
  const lifeTax = flatTargets(targets).reduce((n, id) => {
    const t = s.objects[id];
    if (t?.zone !== "battlefield" || t.controller === player) return n;
    return n + chars(s, id).abilities.reduce((m, ab) => m + (ab.kind === "playerStatic" ? (ab.targetLifeTax ?? 0) : 0), 0);
  }, 0);
  // Payer 0 PV est toujours possible (119.4), même avec un total négatif (Herald of Eternal Dawn).
  if (lifeTax > 0 && lifeTax > payableLife(s, player)) throw new RulesError("Pas assez de points de vie");
  // Spree : les coûts supplémentaires des modes choisis (payés même si le sort est gratuit).
  if (mode.extraCost) cost = addCosts(cost, mode.extraCost);
  if (opts.sacrifice?.orPay && sacrifice.length === 0) cost = addCosts(cost, opts.sacrifice.orPay);
  // Titania : « défaussez une carte ou payez {2} ».
  if (opts.discard?.orPay && discard.length === 0) cost = addCosts(cost, opts.discard.orPay);
  if (flashExtra) cost = addCosts(cost, flashExtra);
  if (terms.extraCost) cost = addCosts(cost, { generic: terms.extraCost, colored: {}, x: 0 });
  // Harmonie : une créature engagée réduit le coût de sa force (`tap` absent : le choix par défaut ; [] : aucune).
  const harmonize = flashback && (!!d.harmonize || !!terms.harmonize);
  if (choices.tap?.length && !harmonize && teamwork === undefined) throw new RulesError("Aucune créature à engager pour ce sort");
  const harmony = harmonize ? harmonizeOptions(s, player, card, cost.generic) : undefined;
  const harmonyTap = harmony ? (choices.tap ?? harmony.suggested) : [];
  if (harmonyTap.length > 1 || harmonyTap.some((id) => !harmony?.options.includes(id)))
    throw new RulesError("Créature invalide pour l'harmonie");
  for (const id of harmonyTap) cost = totalCost(cost, 0, undefined, harmony?.powers[id] ?? 0);
  // Mana hybride payé d'une couleur choisie (Deceit : « si {U}{U} a été dépensé »).
  if (choices.hybridAs) {
    if (!hybridColors(d).includes(choices.hybridAs)) throw new RulesError("Ce mana hybride ne se paie pas de cette couleur");
    cost = hybridPaidAs(cost, choices.hybridAs);
  }

  // Marqueurs retirés parmi vos créatures : répartis par le joueur (`counterFrom`), sinon la suggestion.
  const countersFrom = terms.removeCounters
    ? resolvePick(s, countersAmongPick(s, player, terms.removeCounters), choices.picks?.counterFrom)
    : undefined;
  // 601.2a : le sort passe sur la pile (nouvel objet), puis on paie les coûts (601.2g–h).
  if (terms.graveyardType) s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), terms.graveyardType];
  // The Tomb of Aclazotz : la permission à usage unique est consommée.
  const once = terms.playFrom && s.playerEffects.find((e) => e.once && e.ability.playFrom === terms.playFrom);
  if (once) s.playerEffects = s.playerEffects.filter((e) => e !== once);
  if (countersFrom) removeCountersFromEach(s, countersFrom);
  if (terms.onceKey) s.turn.onceFired.push(terms.onceKey);
  if (free && terms.freeOnceKey) s.turn.onceFired.push(terms.freeOnceKey);
  const view = spellView(d, player);
  // Lancer la copie d'un sort préparé dé-prépare son permanent (même si le sort est ensuite contrecarré).
  const preparedFor = o.preparedFor ? s.objects[o.preparedFor] : undefined;
  if (preparedFor?.preparedCopy === card) delete preparedFor.preparedCopy;
  // Permission à usage unique (Buster Sword) : les autres cartes du groupe la perdent.
  const group = exilePermission(s, player, card)?.group;
  if (group) s.playPermissions = (s.playPermissions ?? []).filter((p) => p.group !== group);
  const stackId = moveObject(s, card, "stack", { controller: player }) as string;
  // Fourrager en coût (Osteomancer Adept, ou le coût alternatif de Feed the Cycle) : la carte a quitté le cimetière.
  if ((terms.forage || (alternative && altCostFor(s, player, d)?.forage)) && !forage(s, player))
    throw new RulesError("Impossible de fourrager");
  // Évasion donnée (Underworld Breach) : N autres cartes du cimetière exilées en plus.
  const escapeN = terms.playFrom?.exileOthers;
  if (escapeN) {
    const cards = graveyardToExile(s, player, stackId, escapeN);
    if (!cards) throw new RulesError(`Il faut exiler ${escapeN} autres cartes de votre cimetière`);
    for (const id of cards) moveObject(s, id, "exile");
  }
  // Force of Will, Daze : PV, cartes de la main exilées, permanent renvoyé, payés avec le coût alternatif.
  const altPay = alternative ? altCostFor(s, player, d)?.pay : undefined;
  if (altPay) {
    const paid = altCostPayment(s, player, stackId, altPay);
    if (!paid) throw new RulesError("Impossible de payer ce coût alternatif");
    if (altPay.life) payLife_(s, player, altPay.life);
    for (const id of paid.exile) moveObject(s, id, "exile");
    if (paid.bounce) moveObject(s, paid.bounce, "hand");
    if (paid.sacrifice) sacrificePermanent(s, paid.sacrifice);
  }
  // Conspiracy Unraveler : « réunir des preuves 10 plutôt que payer le coût de mana ».
  const altEvidence = alternative ? altCostFor(s, player, d)?.collectEvidence : undefined;
  if (altEvidence) {
    const cards = spellPickNow(s, player, stackId, d, x, "evidence", "alternative", choices);
    if (!cards) throw new RulesError("Pas assez de preuves à réunir dans votre cimetière");
    collectEvidence(s, player, cards);
  }
  // Coûts additionnels, choisis par le joueur ou automatiquement (avant le mana : ces permanents ne produisent plus de mana).
  for (const id of [...auto.tap, ...harmonyTap]) tapObject(s, obj(s, id));
  // Agent Maria Hill : « engagée pour payer un coût de travail d'équipe ».
  for (const id of teamTap) tapObject(s, obj(s, id), "teamwork");
  for (const id of auto.bounce) moveObject(s, id, "hand");
  for (const id of auto.graveyard) moveObject(s, id, "exile");
  const costExiled = auto.exile.map((id) => moveObject(s, id, "exile")).filter((id): id is string => !!id);
  // Faufilement : l'attaquant non bloqué le plus faible retourne dans la main de son propriétaire.
  // Web-slinging : une créature engagée que vous contrôlez retourne en main (au choix, la moins chère par défaut).
  const bounced: ObjectId[] = [];
  const webSlinging = alternative && isWebSlinging(s, player, d);
  if (webSlinging) {
    const options = webSlingingOptions(s, player);
    const tapped = choices.bounce?.length ? choices.bounce[0] : options[0];
    if (!tapped || !options.includes(tapped) || (choices.bounce?.length ?? 1) !== 1)
      throw new RulesError("Aucune créature engagée à renvoyer");
    removeFromCombat(s, tapped);
    const back = moveObject(s, tapped, "hand");
    if (back) bounced.push(back);
  }
  const sneaked = (alternative && !!d.sneak) || !!terms.sneakGranted;
  let sneakDefender: string | undefined;
  if (sneaked) {
    // L'attaquant non bloqué renvoyé : au choix (`bounce`), le plus faible par défaut.
    const options = sneakOptions(s, player);
    const back = choices.bounce?.length ? choices.bounce[0] : options[0];
    if (!back || !options.includes(back) || (choices.bounce?.length ?? 1) !== 1)
      throw new RulesError("Aucun attaquant non bloqué");
    sneakDefender = s.combat?.attackers.find((a) => a.id === back)?.defender;
    removeFromCombat(s, back);
    moveObject(s, back, "hand");
  }
  // Réunir des preuves : les cartes du cimetière sont exilées en payant le coût.
  if (evidence) collectEvidence(s, player, evidence);
  if (targetEvidence) collectEvidence(s, player, targetEvidence);
  for (const id of gyExile ?? []) moveObject(s, id, "exile");
  // Seule une Aventure part « en aventure » ; un présage (même disposition Scryfall) est mélangé dans la bibliothèque.
  const adventure = choices.face !== undefined && cardDef.layout === "adventure" && d.subtypes.includes("Adventure");
  if (choices.face !== undefined) obj(s, stackId).faceDefId = d.id;
  if (choices.faceDown && cardDef.disguise) {
    const spellObj = obj(s, stackId);
    s.defs[FACE_DOWN_ID] ??= FACE_DOWN_DEF;
    spellObj.faceDown = { card: spellObj.defId, ward: !cardDef.morph, upCosts: [cardDef.disguise] };
    spellObj.defId = FACE_DOWN_ID;
  }
  // Le prochain sort : incontrecarrable (Theorist's Proxy), marqueurs ou célérité (Summon: Fenrir), copié (plus bas).
  const next = consumeNextSpells(s, player, d);
  const uncounterable = next.some((n) => n.uncounterable);
  // Coût alternatif payé (601.2b : un seul), lu par les règles et les conditions « s'il a été lancé ainsi ».
  const castVia: CastVia | undefined = webSlinging
    ? "webSlinging"
    : terms.mayhem
      ? "mayhem"
      : sneaked
        ? "sneak"
        : warp
          ? "warp"
          : alternative && cardDef.impending
            ? "impending"
            : alternative && cardDef.evoke
              ? "evoke"
              : alternative
                ? altCostFor(s, player, d)?.via
                : undefined;
  const item: StackItem = {
    id: stackId,
    kind: "spell",
    controller: player,
    sourceId: stackId,
    sourceDefId: d.id,
    abilityIndex: -1,
    mode: modeIndex,
    targets,
    x,
    kicked,
    sourceSnapshot: { keywords: d.keywords, power: d.power ?? 0, controller: player },
    // Quistis Trepe : exilé en quittant la pile, comme un flashback.
    flashback: flashback || !!terms.exileAfter,
    ...(terms.bottomAfter ? { bottomInstead: true } : {}),
    arrival: arrivalFor(terms, next),
    adventure: adventure || undefined,
    cast: {
      from: terms.source === "flashback" ? "graveyard" : terms.source,
      via: castVia,
      ...(sneaked ? { sneakDefender } : {}),
      costBounced: bounced.length ? bounced : undefined,
      manaSpent: free ? 0 : manaValue(cost),
      beheld: beheldId ? true : undefined,
      metWhenCast: metWhenCast || undefined,
    },
    // Permanents sacrifiés comme coût additionnel (« si le permanent sacrifié était un Véhicule »).
    paid: {
      sacrificed: sacrifice.length ? [...sacrifice] : undefined,
      exiled: costExiled.length ? costExiled : undefined,
      beheld: beheldId ? [beheldId] : undefined,
    },
    uncounterable: uncounterable || undefined,
  };
  s.stack.push(item);
  // Contempler une carte de la main : elle est révélée.
  if (beheldId && s.objects[beheldId]?.zone === "hand")
    emit({ type: "reveal", player, defIds: [s.objects[beheldId]?.defId ?? ""] });
  try {
    const taps: { id: ObjectId; ab?: ManaAbilityDef; amount: number; chosen?: GameObject["chosen"] }[] = [];
    const spent: Partial<Record<ManaType, number>> = {};
    payMana(
      s,
      player,
      cost,
      undefined,
      {
        spell: view,
        convoke: hasConvoke(s, player, d),
        improvise: hasImprovise(s, player, d) || undefined,
        delve: spellHasKeyword(s, player, d, "delve"),
        sacrificeToPay: d.additionalCost?.sacrificeToPay,
        fromHand: terms.source === "hand",
        ...(bendPaid ? { waterbend: bendPaid } : {}),
        ...(onlyChosen(validHelperPicks(s, player, stackId, d, choices)) ? { only: onlyChosen(choices.picks) } : {}),
      },
      taps,
      spent,
    );
    if (Object.keys(spent).length && item.cast) item.cast.spentColors = spent;
    // Un coût de maîtrise de l'eau a été payé (« chaque fois que vous maîtrisez l'eau »).
    if (
      d.waterbend !== undefined ||
      d.xCost === "waterbend" ||
      (kicked && d.kickerKind === "waterbend") ||
      (terms.waterbendOverride && !free && !alternative)
    )
      bent(s, player, "water");
    // Mana des Cavernes (Bat Colony) et sources utilisées (Tecutlan, Barracks of the Thousand).
    if (taps.length) {
      item.manaSources = taps.flatMap((t) => Array(t.amount).fill(t.id) as ObjectId[]);
      // Une source sacrifiée pour son mana (Trésor) est connue par ses dernières informations.
      const subtypes = (id: ObjectId) => (s.objects[id] ? chars(s, id).subtypes : (s.lki[id]?.subtypes ?? []));
      const caves = taps.filter((t) => subtypes(t.id).includes("Cave")).reduce((n, t) => n + t.amount, 0);
      if (caves && item.cast) item.cast.caveMana = caves;
    }
    // Effets associés au mana dépensé, si ce sort correspond (Carnelian Orb, Pyromancer's Goggles ; Cavern of Souls :
    // « du type choisi » se lit sur la source ; Path of Ancestry : « qui partage un type de créature avec votre
    // commandant », capacité déclenchée de la source).
    const riders = taps.flatMap(({ id, ab, chosen }) => {
      const rider = ab?.rider;
      if (!rider) return [];
      // Mana marqué de la réserve : le choix de sa source, figé à la production (Cavern of Souls).
      const src = chosen ? { chosen } : s.objects[id];
      const filter = withX(s, src ? withChosen(rider.spell, src) : rider.spell, staticContext(s, player, id));
      if (!matchesView(view, filter, player, id)) return [];
      const defId = s.objects[id]?.defId ?? s.lki[id]?.defId;
      if (rider.effects && defId) pushInline(s, player, id, defId, { targets: [], effects: rider.effects });
      return rider.effect ? [rider.effect] : [];
    });
    if (riders.length) item.riders = riders;
    if (riders.includes("uncounterable")) item.uncounterable = true;
  } catch (e) {
    rethrowAsRules(e, "Mana insuffisant");
  }
  // Distorsion « Warp—{B}, Pay 2 life » : les points de vie font partie du coût.
  if (warp?.life) payLife_(s, player, warp.life);
  if (terms.payLife) payLife_(s, player, terms.payLife);
  if (d.xCost === "life" && x > 0) payLife_(s, player, x);
  if (kickerLife) payLife_(s, player, kickerLife);
  if (d.xCost === "blight" && x > 0) {
    const blighted = spellPickNow(s, player, item.id, d, x, "blight", undefined, choices)?.[0];
    if (blighted) changeCounters(s, obj(s, blighted), "-1/-1", x, true);
  }
  if (lifeTax) payLife_(s, player, lifeTax);
  // Emrakul, the Exigent Doom : « jusqu'à ce que cette carte soit lancée depuis l'exil » — les coûts sont payés, le sort
  // est lancé (601.2i) ; la capacité accordée au terrain a pu servir à les payer.
  const uid = s.objects[item.id]?.uid;
  if (uid && s.effects.some((e) => e.untilExiledUid === uid)) {
    s.effects = s.effects.filter((e) => e.untilExiledUid !== uid);
    bump(s);
  }
  // Pyromancer's Goggles : « copiez ce sort ».
  for (const r of item.riders ?? []) if (r === "copy") copyStackItem(s, item, player);
  // Teach by Example : « la prochaine fois que vous lancez un éphémère ou un rituel ce tour-ci, copiez-le ».
  for (const n of next) {
    if (!n.copy) continue;
    const id = copyStackItem(s, item, player);
    const copy = n.copyNonlegendary && id ? s.stack.find((x) => x.id === id) : undefined;
    if (copy) copy.arrival = { ...copy.arrival, nonlegendary: true };
  }
  // Bitter Triumph : sans carte défaussée, les points de vie sont payés.
  if (opts.discard?.orLife !== undefined && discard.length === 0) payLife_(s, player, opts.discard.orLife);
  // Souls of the Lost : un permanent choisi à la place d'une carte est sacrifié.
  const sacrificedInstead = discard.filter((id) => obj(s, id).zone === "battlefield");
  const handDiscard = discard.filter((id) => !sacrificedInstead.includes(id));
  for (const id of sacrificedInstead) sacrificePermanent(s, id);
  if (handDiscard.length) {
    emit({ type: "discard", player, defIds: handDiscard.map((id) => obj(s, id).defId) });
    const discarded = handDiscard.map((id) => moveDiscarded(s, player, id));
    for (const id of discarded) announceDiscard(s, player, id);
    announceDiscardBatch(s, player, handDiscard.length);
    // Grab the Prize : « si la carte défaussée n'était pas une carte de terrain ».
    item.paid = { ...item.paid, discarded: discarded.filter((id): id is string => !!id) };
  }
  for (const id of sacrifice) sacrificePermanent(s, id);
  if (kicked && kickerPermanent && d.kickerCost?.sacrifice) sacrificePermanent(s, kickerPermanent);
  else if (kicked && kickerPermanent && d.kickerCost?.blight)
    changeCounters(s, obj(s, kickerPermanent), "-1/-1", d.kickerCost.blight, true);
  else if (kicked && kickerPermanent && d.kickerCost?.bounce) moveObject(s, kickerPermanent, "hand");
  s.priority.passes = 0;
  emit({ type: "cast", player, stackId, defId: d.id, targets: flatTargets(targets) });
  // 903.8 : un lancer de plus depuis la zone de commandement (la taxe du suivant augmente de {2}).
  if (terms.source === "command") {
    const rec = commanderOf(s, s.objects[stackId]);
    if (rec) rec.casts += 1;
  }
  const caster = s.players[player];
  const instantOrSorcery = d.types.includes("Instant") || d.types.includes("Sorcery");
  // Thousand-Year Storm : éphémères et rituels lancés avant celui-ci ce tour-ci (lu avant d'inscrire ce sort au journal).
  const before = countTurnEvents(s, { event: "cast", who: "you", types: ["Instant", "Sorcery"] }, player);
  // Déluge (702.40a) : sorts lancés avant celui-ci ce tour-ci, par tous les joueurs.
  const spellsBefore = countTurnEvents(s, { event: "cast" }, player);
  if (caster) {
    caster.turnStats.spellsCast += 1;
    // Journal du tour : « sort de créature légendaire lancé ce tour-ci », « sort lancé depuis votre main ».
    logTurnEvent(s, {
      e: "cast",
      player,
      types: d.types,
      subtypes: d.subtypes,
      supertypes: d.supertypes,
      fromZone: terms.source === "flashback" ? "graveyard" : terms.source,
      manaValue: manaValue(d.manaCost) + (x && d.manaCost?.x ? x * d.manaCost.x : 0),
      warped: warp ? true : undefined,
      keywords: chars(s, stackId).keywords,
      colors: chars(s, stackId).colors,
    });
    bump(s); // des capacités statiques en dépendent (« si vous avez lancé deux sorts ce tour-ci »)
  }
  rulesEvent(s, { e: "cast", player, stackId, instantSorceryBefore: instantOrSorcery ? before : undefined, spellsBefore });
  // Codie, Vociferous Codex : « quand vous lancerez votre prochain sort ce tour-ci, … » (le sort : `ref.target("s")`).
  for (const n of next)
    if (n.trigger)
      pushInline(s, player, stackId, d.id, { targets: [], effects: n.trigger, bound: { s: [stackId] }, label: "Prochain sort" });
  // Dépense N (Bloomburrow) : le N-ième mana total dépensé pour lancer des sorts ce tour-ci.
  const spent = item.cast?.manaSpent ?? 0;
  if (caster && spent > 0) {
    const was = caster.turnStats.manaSpentOnSpells ?? 0;
    caster.turnStats.manaSpentOnSpells = was + spent;
    for (const n of [4, 8]) if (was < n && was + spent >= n) rulesEvent(s, { e: "expend", player, n });
  }
  announceTargets(s, stackId, player, targets);
}

/** Retire des symboles colorés d'un coût (sans descendre sous zéro). */
function withoutColored(cost: ManaCost, colored: ManaCost["colored"]): ManaCost {
  const out = { ...cost.colored };
  for (const [k, n] of Object.entries(colored)) {
    const left = (out[k as ManaType] ?? 0) - (n ?? 0);
    if (left > 0) out[k as ManaType] = left;
    else delete out[k as ManaType];
  }
  return { ...cost, colored: out };
}

/** Somme de deux coûts de mana. */
function addCosts(a: ManaCost, b: ManaCost): ManaCost {
  const colored = { ...a.colored };
  for (const [k, n] of Object.entries(b.colored)) colored[k as ManaType] = (colored[k as ManaType] ?? 0) + (n ?? 0);
  return {
    generic: a.generic + b.generic,
    colored,
    x: a.x,
    hybrid: [...(a.hybrid ?? []), ...(b.hybrid ?? [])],
    twoHybrid: [...(a.twoHybrid ?? []), ...(b.twoHybrid ?? [])],
  };
}

/** Choix « en arrivant » fait pendant la résolution (voir l'effet chooseOnEnter). */
function chosenFrom(vars: Record<string, ChoiceValue[]>): GameObject["chosen"] {
  const [kind, value] = (vars.$chosen ?? []).map(String);
  if (!kind || !value) return undefined;
  return chosenValue(kind, value);
}

/** Le choix « en arrivant » noté sur le permanent, d'après sa sorte et la réponse. */
export function chosenValue(kind: string, value: string): GameObject["chosen"] {
  if (kind === "cardName" || kind === "landName") return { cardName: value };
  if (kind === "parity") return { parity: value === "odd" ? "odd" : "even" };
  if (kind === "mode") return { mode: value };
  if (kind === "number") return { number: Number(value) };
  if (kind === "landType") return { landType: value };
  return kind === "color" ? { color: value as Color } : { creatureType: value };
}

/** Signale les cibles d'un élément mis sur la pile (garde, « devient la cible »). */
export function announceTargets(s: GameState, stackId: string, controller: PlayerId, targets: Record<string, string[]>): void {
  const all = flatTargets(targets);
  if (all.length) rulesEvent(s, { e: "targeted", stackId, controller, targets: all });
  checkCrime(s, controller, all);
}

/**
 * Statiques « ne peut pas être contrecarré » : les sorts du contrôleur (Sphinx of the Final Word, Frenzied Baloth,
 * Chimil), ou les sorts et capacités de tous (Spider-Punk).
 */
function protectedFromCounter(s: GameState, item: StackItem): boolean {
  const d = s.defs[item.sourceDefId];
  for (const p of s.playerOrder) {
    for (const { ab } of playerStatics(s, p, "uncounterable")) {
      const u = ab.uncounterable;
      if (!u || (!u.everyone && p !== item.controller)) continue;
      if (item.kind === "ability" ? u.abilities : !u.filter || (!!d && matchesView(spellView(d, item.controller), u.filter, p)))
        return true;
    }
  }
  return false;
}

/** 701.5 : contrecarre l'élément de pile ; un sort contrecarré va au cimetière (exil s'il a été lancé en flashback). */
export function counterItem(s: GameState, id: string, by: string, exile = false): boolean {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (!item || s.resolving?.item.id === id) return false;
  if (item.kind === "spell" && (s.defs[item.sourceDefId]?.cantBeCountered || item.uncounterable)) return false;
  if (protectedFromCounter(s, item)) return false;
  s.stack.splice(i, 1);
  emit({ type: "countered", stackId: item.id, defId: item.sourceDefId, by });
  // Dernières informations connues (« son contrôleur crée… »).
  if (item.kind === "spell" && s.objects[item.sourceId]) s.lki[item.id] = snapshot(s, item.sourceId);
  if (item.kind === "spell" && s.objects[item.sourceId]) spellToRest(s, item, exile);
  return true;
}

/** « Exilez le sort » (maîtrise de l'air) : il quitte la pile sans être contrecarré ; une copie cesse d'exister. */
export function exileSpell(s: GameState, id: string): ObjectId | undefined {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (item?.kind !== "spell" || s.resolving?.item.id === id) return undefined;
  s.stack.splice(i, 1);
  const moved = s.objects[item.sourceId] ? moveObject(s, item.sourceId, "exile") : undefined;
  bump(s);
  return moved ?? undefined;
}

/** « Renvoyez le sort ciblé dans la main de son propriétaire » : une copie cesse d'exister. */
export function bounceSpell(s: GameState, id: string): void {
  spellToZone(s, id, "hand");
}

/** Retire un sort de la pile vers la main ou la bibliothèque de son propriétaire (Swat Away : dessus ou dessous). */
export function spellToZone(s: GameState, id: string, to: "hand" | "libraryTop" | "libraryBottom"): void {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (item?.kind !== "spell" || s.resolving?.item.id === id) return;
  s.stack.splice(i, 1);
  if (s.objects[item.sourceId]) {
    if (to === "hand") moveObject(s, item.sourceId, "hand");
    else moveObject(s, item.sourceId, "library", { position: to === "libraryTop" ? "top" : "bottom" });
  }
  bump(s);
}

/** Capacités d'un objet : calculées par les couches sur le champ de bataille (accordées, perdues), imprimées ailleurs. */
export function abilitiesOf(s: GameState, id: ObjectId): CardDef["abilities"] {
  const o = s.objects[id];
  if (!o) return [];
  return o.zone === "battlefield" ? chars(s, id).abilities : (s.defs[o.defId]?.abilities ?? []);
}

/** Le permanent qui accorde à `source` sa capacité de rang `index` (« la créature équipée a "…" »), s'il est en jeu. */
export function grantorOf(s: GameState, source: ObjectId, index: number): ObjectId | undefined {
  if (s.objects[source]?.zone !== "battlefield") return undefined;
  const g = chars(s, source).grantors?.[index];
  return g && onBattlefield(s, g) ? g : undefined;
}

export function activatedAbility(s: GameState, source: ObjectId, index: number): ActivatedAbilityDef | null {
  const ab = abilitiesOf(s, source)[index];
  return ab?.kind === "activated" ? ab : null;
}

/** Permanents qui peuvent être sacrifiés pour le coût de la capacité (hors source). */
export function sacrificeOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.sacrifice?.filter;
  if (!f) return [];
  const self = !!ab.cost.sacrifice?.includeSelf;
  const ids = s.battlefield.filter(
    (id) =>
      (self || id !== source) &&
      obj(s, id).controller === player &&
      matchesObjectFilter(s, player, id, f, source) &&
      !hasKeyword(s, id, "cantBeSacrificed"),
  );
  // Choix par défaut (les premiers) : d'abord ce qui ne produit pas de mana (un Trésor peut encore payer le coût).
  const makesMana = (id: ObjectId) => manaAbilitiesOf(s, id).length > 0;
  const ordered = [...ids.filter((id) => !makesMana(id)), ...ids.filter(makesMana)];
  if (!ab.cost.sacrifice?.differentNames) return ordered;
  // « de noms différents » (Transmutation Font) : un permanent par nom d'abord, pour que le choix par défaut soit permis.
  const first = ordered.filter((id, i) => ordered.findIndex((x) => chars(s, x).name === chars(s, id).name) === i);
  return [...first, ...ordered.filter((id) => !first.includes(id))];
}

/** Nombre de noms différents parmi des permanents (coût « de noms différents »). */
function distinctNames(s: GameState, ids: readonly ObjectId[]): number {
  return new Set(ids.map((id) => chars(s, id).name)).size;
}

/**
 * « Engagez X [permanents] dégagés » (Secluded Starforge) : les candidats, d'abord ceux qui ne produisent pas de mana (les
 * X premiers sont le choix par défaut ; ils ne paient pas le mana de la capacité).
 */
export function tapXCandidates(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): ObjectId[] {
  const ids = s.battlefield.filter(
    (id) =>
      id !== source && obj(s, id).controller === player && !obj(s, id).tapped && matchesObjectFilter(s, player, id, f, source),
  );
  const makesMana = (id: ObjectId) => manaAbilitiesOf(s, id).length > 0;
  return [...ids.filter((id) => !makesMana(id)), ...ids.filter(makesMana)];
}

export function tapOthersOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.tapOthers?.filter;
  if (!f) return [];
  const self = !!ab.cost.tapOthers?.includeSelf;
  return s.battlefield.filter(
    (id) =>
      (id !== source || self) &&
      obj(s, id).controller === player &&
      !obj(s, id).tapped &&
      matchesObjectFilter(s, player, id, f, source),
  );
}

/** Équipage N : créatures dégagées (autres que la source) de force totale N ou plus, les plus faibles d'abord. */
function crewOptions(s: GameState, player: PlayerId, source: ObjectId, n: number): ObjectId[] | null {
  const ids = crewCandidates(s, player, source).sort((a, b) => crewPower(s, a) - crewPower(s, b));
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of ids) {
    if (total >= n) break;
    out.push(id);
    total += Math.max(0, crewPower(s, id));
  }
  return total >= n ? out : null;
}

/** Créatures qui peuvent monter ou équiper la source. */
export function crewCandidates(s: GameState, player: PlayerId, source: ObjectId): ObjectId[] {
  return s.battlefield.filter(
    (id) => id !== source && obj(s, id).controller === player && !obj(s, id).tapped && isCreature(s, id),
  );
}

/** Choix par défaut de l'équipage (les plus faibles d'abord), pour l'interface et l'IA. */
export function suggestedCrew(s: GameState, player: PlayerId, source: ObjectId, n: number): ObjectId[] {
  return crewOptions(s, player, source, n) ?? [];
}

function chosenCrew(s: GameState, player: PlayerId, source: ObjectId, n: number, picked: ObjectId[] | undefined): ObjectId[] {
  if (!picked?.length) return crewOptions(s, player, source, n) ?? [];
  const legal = crewCandidates(s, player, source);
  if (new Set(picked).size !== picked.length || picked.some((id) => !legal.includes(id)))
    throw new RulesError("Créatures d'équipage invalides");
  if (picked.reduce((t, id) => t + Math.max(0, crewPower(s, id)), 0) < n)
    throw new RulesError(`Force totale insuffisante (${n} requise)`);
  return picked;
}

/** Force comptée pour monter et équiper : endurance (Interface Ace), +2 pour les pilotes. */
export function crewPower(s: GameState, id: ObjectId): number {
  return effectivePower(chars(s, id), "crew");
}

/** Une source dont le nom a été choisi par un Sorcerous Spyglass (ou un Petrified Hamlet). */
function spyglassed(s: GameState, source: ObjectId): boolean {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.some((id) => {
    const o = obj(s, id);
    const d = s.defs[o.defId];
    return (
      o.chosen?.cardName === name && (d?.chooseOnEnter === "cardName" || d?.chooseOnEnter === "landName") && !d.chosenNameTax
    );
  });
}

/** Skyseer's Chariot : {N} de plus pour les capacités activées des sources du nom choisi. */
function chosenNameTax(s: GameState, source: ObjectId): number {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.reduce((n, id) => {
    const o = obj(s, id);
    const tax = s.defs[o.defId]?.chosenNameTax ?? 0;
    return n + (tax && o.chosen?.cardName === name ? tax : 0);
  }, 0);
}

/** Jace's Machinations : capacité de loyauté d'un Jace activable à vitesse d'éphémère ce tour-ci. */
export function instantLoyalty(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): boolean {
  return (
    ab.cost.loyalty !== undefined && playerStatic(s, player, "jaceLoyaltyInstant") && chars(s, source).subtypes.includes("Jace")
  );
}

/** Cartes de votre cimetière exilables pour le coût (« exilez une autre carte de créature de votre cimetière ») : les moins chères d'abord. */
function graveyardExileOptions(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.exileFromGraveyard;
  const o = s.objects[source];
  if (!f || !o) return [];
  return (s.players[o.owner]?.graveyard ?? [])
    .filter((id) => id !== source && matchesCard(s, o.owner, id, { ...f.filter, controller: undefined }))
    .sort((a, b) => manaValue(s.defs[obj(s, a).defId]?.manaCost) - manaValue(s.defs[obj(s, b).defId]?.manaCost));
}

/**
 * Fabrication (702.167) : matériaux choisis automatiquement parmi les cartes du cimetière du joueur (d'abord), puis ses
 * jetons, puis ses autres permanents (les moins chers d'abord, sauf `preferHighManaValue`). « Un ou plusieurs » : toutes les
 * cartes correspondantes du cimetière, sinon un permanent. `null` si le coût ne peut pas être payé.
 */
/** Matériaux possibles d'une fabrication : cartes du cimetière puis jetons puis autres permanents correspondants. */
function craftPool(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef) {
  const c = ab.cost.craft;
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost);
  const order = (ids: ObjectId[]) => [...ids].sort((a, b) => (c?.preferHighManaValue ? mv(b) - mv(a) : mv(a) - mv(b)));
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => id !== source);
  const permanents = s.battlefield.filter((id) => id !== source && obj(s, id).controller === player);
  const matches = (id: ObjectId, f: ObjectFilter) =>
    obj(s, id).zone === "battlefield"
      ? matchesObjectFilter(s, player, id, f, source)
      : matchesCard(s, player, id, { ...f, controller: undefined }, source);
  const candidates = (f: ObjectFilter) => [
    ...order(graveyard.filter((id) => matches(id, f))),
    ...order(permanents.filter((id) => obj(s, id).isToken && matches(id, f))),
    ...order(permanents.filter((id) => !obj(s, id).isToken && matches(id, f))),
  ];
  return { matches, candidates };
}

/** Choix des matériaux d'une fabrication proposé au joueur : options, nombre, choix par défaut. */
export function craftSpec(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
): { min: number; max: number; options: ObjectId[]; suggested: ObjectId[] } | null {
  const c = ab.cost.craft;
  const suggested = craftMaterials(s, player, source, ab);
  if (!c || !suggested) return null;
  const { candidates } = craftPool(s, player, source, ab);
  const options = [...new Set(c.each ? c.each.flatMap((f) => candidates(f)) : candidates(c.filter ?? {}))];
  const n = c.each ? c.each.length : c.count;
  return { min: c.orMore ? 1 : n, max: c.orMore ? options.length : n, options, suggested };
}

/** Matériaux choisis par le joueur, vérifiés (702.167) ; sans choix, ceux par défaut. */
export function chosenCraftMaterials(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  picked: ObjectId[] | undefined,
): ObjectId[] | null {
  const c = ab.cost.craft;
  if (!c) return [];
  if (!picked?.length) return craftMaterials(s, player, source, ab);
  const spec = craftSpec(s, player, source, ab);
  if (!spec) return null;
  const bad = () => new RulesError("Matériaux de fabrication invalides");
  if (new Set(picked).size !== picked.length || picked.some((id) => !spec.options.includes(id))) throw bad();
  if (picked.length < spec.min || picked.length > spec.max) throw bad();
  if (c.each) {
    // Un matériau distinct par filtre : il faut une affectation complète.
    const { matches } = craftPool(s, player, source, ab);
    const assign = (i: number, used: Set<ObjectId>): boolean => {
      const f = c.each?.[i];
      if (!f) return true;
      return picked.some((id) => !used.has(id) && matches(id, f) && assign(i + 1, new Set([...used, id])));
    };
    if (!assign(0, new Set())) throw bad();
  }
  return picked;
}

export function craftMaterials(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] | null {
  const c = ab.cost.craft;
  if (!c) return [];
  const { candidates } = craftPool(s, player, source, ab);
  if (c.each) {
    // Un matériau distinct par filtre (affectation par retour arrière, les listes sont courtes).
    const pick = (i: number, used: ObjectId[]): ObjectId[] | null => {
      const f = c.each?.[i];
      if (!f) return used;
      for (const id of candidates(f)) {
        if (used.includes(id)) continue;
        const rest = pick(i + 1, [...used, id]);
        if (rest) return rest;
      }
      return null;
    };
    return pick(0, []);
  }
  const all = candidates(c.filter ?? {});
  if (c.orMore && c.distinctColors) {
    const seen = new Set<string>();
    const picked = all.filter((id) => {
      const fresh = (s.defs[obj(s, id).defId]?.colors ?? []).filter((col) => !seen.has(col));
      for (const col of fresh) seen.add(col);
      return fresh.length > 0;
    });
    return picked.length ? picked : all.length ? all.slice(0, 1) : null;
  }
  if (c.orMore) {
    const fromGraveyard = all.filter((id) => obj(s, id).zone === "graveyard");
    return fromGraveyard.length ? fromGraveyard : all.length ? all.slice(0, 1) : null;
  }
  return all.length >= c.count ? all.slice(0, c.count) : null;
}

/**
 * Permanents dont on retire les marqueurs du coût, un identifiant par marqueur (ceux qui en portent le plus d'abord) ;
 * `null` s'il n'y en a pas assez.
 */
function counterSources(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] | null {
  const c = ab.cost.removeCounterFrom;
  if (!c) return null;
  const ids = s.battlefield
    .filter(
      (id) =>
        obj(s, id).controller === player &&
        (obj(s, id).counters[c.kind] ?? 0) > 0 &&
        matchesObjectFilter(s, player, id, c.filter, source),
    )
    .sort((a, b) => (obj(s, b).counters[c.kind] ?? 0) - (obj(s, a).counters[c.kind] ?? 0));
  const out = ids.flatMap((id) => Array<ObjectId>(obj(s, id).counters[c.kind] ?? 0).fill(id));
  const n = c.n ?? 1;
  return out.length >= n ? out.slice(0, n) : null;
}

/** Zone d'où s'active une capacité : champ de bataille, cimetière ou main. */
export function abilityZone(ab: ActivatedAbilityDef): "battlefield" | "graveyard" | "hand" {
  return ab.fromGraveyard ? "graveyard" : ab.fromHand ? "hand" : "battlefield";
}

/** Marqueurs d'une sorte sur un objet (`any` : tous). */
function countersFor(o: GameObject, kind: string): number {
  return kind === "any" ? Object.values(o.counters).reduce<number>((n, k) => n + (k ?? 0), 0) : (o.counters[kind] ?? 0);
}

/** N marqueurs de n'importe quelle sorte, choix par défaut : les −1/−1 d'abord, les +1/+1 en dernier (une sorte par marqueur). */
function anyCountersDefault(o: GameObject, n: number): string[] {
  const kinds = Object.keys(o.counters).sort(
    (a, b) => Number(b === "-1/-1") - Number(a === "-1/-1") || Number(a === "+1/+1") - Number(b === "+1/+1"),
  );
  const out: string[] = [];
  for (const k of kinds) for (let i = 0; i < (o.counters[k] ?? 0) && out.length < n; i++) out.push(k);
  return out;
}

/** Plus grande endurance parmi les créatures d'un joueur (0 s'il n'en a pas). */
export function greatestToughness(s: GameState, player: PlayerId): number {
  let best = 0;
  for (const id of s.battlefield) {
    if (obj(s, id).controller === player && isCreature(s, id)) best = Math.max(best, chars(s, id).toughness);
  }
  return best;
}

/**
 * Créature que `player` flétrit (ECL) quand le choix est fait pour lui : d'abord une qui survit aux N marqueurs −1/−1
 * (la plus résistante), sinon la moins précieuse (jeton, puis plus petite valeur de mana). Null s'il n'a pas de créature.
 */
export function blightTarget(s: GameState, player: PlayerId, n: number): ObjectId | null {
  const mine = s.battlefield.filter((id) => obj(s, id).controller === player && isCreature(s, id));
  if (mine.length === 0) return null;
  const left = (id: ObjectId) => chars(s, id).toughness - (s.objects[id]?.damage ?? 0) - n;
  const value = (id: ObjectId) => (s.objects[id]?.isToken ? -1 : manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost));
  const survivors = mine.filter((id) => left(id) > 0).sort((a, b) => left(b) - left(a));
  return survivors[0] ?? [...mine].sort((a, b) => value(a) - value(b))[0] ?? null;
}

/** Les coûts non-mana de la capacité peuvent-ils être payés ? */
export function canPayNonManaCost(s: GameState, source: ObjectId, ab: ActivatedAbilityDef, index = -1): boolean {
  const o = s.objects[source];
  if (!o || o.zone !== abilityZone(ab)) return false;
  if (o.zone === "battlefield" && !ab.specialAction && chars(s, source).keywords.includes("noActivatedAbilities")) return false;
  if (ab.once && !onceAvailable(s, o, ab, index) && !exhaustReusable(s, o.controller, ab)) return false;
  if (o.zone === "battlefield" && abilitiesLocked(s, o.controller, source)) return false;
  if (ab.oncePerTurn && o.activatedTurn?.[index] === s.turn.number) return false;
  const who = abilityZone(ab) !== "battlefield" ? o.owner : o.controller;
  if (ab.activationCondition && !checkCondition(s, ab.activationCondition, who, source)) return false;
  // Sorcerous Spyglass : les capacités (non de mana) des sources du nom choisi ne peuvent pas être activées.
  if (spyglassed(s, source)) return false;
  // Karlov Watchdog : « les permanents de vos adversaires ne peuvent pas être retournés face visible pendant votre tour ».
  if (ab.effects.some((e) => e.op === "turnFaceUp") && faceUpLocked(s, who)) return false;
  if (ab.cost.crew !== undefined && crewOptions(s, who, source, ab.cost.crew) === null) return false;
  if (ab.cost.tap && (o.tapped || sickForActivation(s, source))) return false;
  // 606.3 : une seule capacité de loyauté par planeswalker et par tour ; on ne peut pas retirer plus que sa loyauté.
  if (ab.cost.loyalty !== undefined) {
    if (o.loyaltyTurn === s.turn.number) return false;
    if (ab.cost.loyalty < 0 && (o.counters.loyalty ?? 0) < -ab.cost.loyalty) return false;
  }
  if (ab.cost.exileFromGraveyard && graveyardExileOptions(s, source, ab).length < ab.cost.exileFromGraveyard.count) return false;
  if (ab.cost.removeCounterFrom && !counterSources(s, who, source, ab)) return false;
  if (ab.cost.blight && !blightTarget(s, o.controller, ab.cost.blight)) return false;
  if (ab.cost.collectEvidence && !evidenceCards(s, who, source, ab.cost.collectEvidence)) return false;
  // « Engagez / exilez / sacrifiez [le permanent qui accorde la capacité] » (Fishing Pole, The Dominion Bracelet).
  if (ab.cost.grantor) {
    const g = grantorOf(s, source, index);
    if (!g || (ab.cost.grantor === "tap" && obj(s, g).tapped)) return false;
    if (ab.cost.grantor === "sacrifice" && hasKeyword(s, g, "cantBeSacrificed")) return false;
  }
  const player = abilityZone(ab) !== "battlefield" ? o.owner : o.controller;
  if (ab.cost.removeCounters && countersFor(o, ab.cost.removeCounters.kind) < ab.cost.removeCounters.n) return false;
  if (ab.cost.payLife && payableLife(s, player) < ab.cost.payLife) return false;
  if (ab.cost.sacrifice) {
    const options = sacrificeOptions(s, player, source, ab);
    const n = ab.cost.sacrifice.differentNames ? distinctNames(s, options) : options.length;
    if (n < ab.cost.sacrifice.count) return false;
  }
  if (ab.cost.tapOthers && tapOthersOptions(s, player, source, ab).length < ab.cost.tapOthers.count) return false;
  if (ab.cost.discard && discardCostOptions(s, player, source, ab.cost.discardFilter).length < ab.cost.discard) return false;
  if (ab.cost.returnUnblockedAttacker && unblockedAttackers(s, player).length === 0) return false;
  if (ab.cost.bounceOther && bounceCostOptions(s, player, source, ab.cost.bounceOther).length === 0) return false;
  if (ab.cost.exileOther && bounceCostOptions(s, player, source, ab.cost.exileOther).length === 0) return false;
  if (ab.cost.forage && !canForage(s, player)) return false;
  if (ab.cost.craft && !craftMaterials(s, player, source, ab)) return false;
  return true;
}

/** Permanents que le joueur peut renvoyer en main pour un coût (`bounceOther`), le moins cher en premier. */
export function bounceCostOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): ObjectId[] {
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost);
  return s.battlefield
    .filter((id) => id !== source && obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source))
    .sort((a, b) => mv(a) - mv(b));
}

/** Ninjutsu (702.49) : attaquants non bloqués du joueur, une fois les bloqueurs déclarés. */
export function unblockedAttackers(s: GameState, player: PlayerId): ObjectId[] {
  const afterBlocks = ["declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.turn.step);
  if (!s.combat || !afterBlocks || s.turn.active !== player) return [];
  if (s.turn.step === "declareBlockers" && s.pending?.kind === "declareBlockers") return [];
  return s.combat.attackers.filter((a) => !a.blocked && s.objects[a.id]?.controller === player).map((a) => a.id);
}

/** Cartes de la main qui peuvent être défaussées pour un coût d'activation (pas la source elle-même). */
export function discardCostOptions(s: GameState, player: PlayerId, source: ObjectId, filter?: ObjectFilter): ObjectId[] {
  return (s.players[player]?.hand ?? []).filter(
    (id) => id !== source && (!filter || matchesCard(s, player, id, { ...filter, controller: undefined }, source)),
  );
}

// ---------------------------------------------------------------------------
// Objets payés en coût, choisis par le joueur (PLAN-C, lots C7 et C8)
// ---------------------------------------------------------------------------

const manaValueOf = (s: GameState, id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);

/**
 * Coûts d'une capacité payés avec des objets à choisir, avec la suggestion du moteur (son choix quand le joueur ne choisit
 * pas). `x` : le X de l'activation ; absent (`legalActions`), les coûts « X » valent `countIsX`. Calculé au moment du
 * paiement de chaque coût : la suggestion est celle qu'appliquait le moteur à cet instant.
 */
export function activationPicks(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  x?: number,
): CostPick[] {
  const c = ab.cost;
  const out: CostPick[] = [];
  const mine = (id: ObjectId) => s.objects[id]?.controller === player;
  if (c.blight) {
    const best = blightTarget(s, player, c.blight);
    const options = s.battlefield.filter((id) => mine(id) && isCreature(s, id));
    if (best)
      out.push({
        slot: "blight",
        label: `Flétrir ${c.blight} : la créature qui reçoit ${c.blight > 1 ? `${c.blight} marqueurs` : "le marqueur"} −1/−1`,
        count: 1,
        options: [best, ...options.filter((id) => id !== best)],
        suggested: [best],
      });
  }
  // « Retirez un marqueur de cette créature » : la sorte, quand la source en porte plusieurs.
  const self = s.objects[source];
  if (c.removeCounters?.kind === "any" && self) {
    const kinds = Object.keys(self.counters).filter((k) => (self.counters[k] ?? 0) > 0);
    if (kinds.length > 1)
      out.push({
        slot: "counterKind",
        label: `Retirez ${c.removeCounters.n} marqueur(s) de cette créature`,
        count: c.removeCounters.n,
        options: kinds,
        labels: Object.fromEntries(kinds.map((k) => [k, `Marqueur ${counterLabel(k)} (${self.counters[k]})`])),
        suggested: anyCountersDefault(self, c.removeCounters.n),
        repeat: Object.fromEntries(kinds.map((k) => [k, self.counters[k] ?? 0])),
      });
  }
  if (c.removeCounterFrom) {
    const r = c.removeCounterFrom;
    const options = s.battlefield.filter(
      (id) => mine(id) && (obj(s, id).counters[r.kind] ?? 0) > 0 && matchesObjectFilter(s, player, id, r.filter, source),
    );
    const suggested = counterSources(s, player, source, ab);
    if (suggested)
      out.push({
        slot: "counterFrom",
        label: `Retirez ${r.n ?? 1} marqueur(s) ${r.kind}`,
        count: r.n ?? 1,
        options,
        suggested,
        repeat: Object.fromEntries(options.map((id) => [id, obj(s, id).counters[r.kind] ?? 0])),
      });
  }
  if (c.exileFromGraveyard) {
    const options = graveyardExileOptions(s, source, ab);
    const n = c.exileFromGraveyard.count;
    if (options.length >= n)
      out.push({
        slot: "graveyardExile",
        label: `Exilez ${n} carte(s) de votre cimetière`,
        count: n,
        options,
        suggested: options.slice(0, n),
      });
  }
  if (c.exileFromGraveyardX) {
    const f = c.exileFromGraveyardX;
    const options = (s.players[player]?.graveyard ?? []).filter((id) => id !== source && matchesCard(s, player, id, f, source));
    out.push({
      slot: "graveyardExileX",
      label: "Exilez X cartes de votre cimetière",
      count: x ?? 0,
      countIsX: x === undefined,
      options,
      suggested: options.slice(0, x ?? 0),
    });
  }
  if (c.sacrificeX) {
    const f = c.sacrificeX;
    // Les autres d'abord, la source en dernier (Radiant Lotus).
    const options = s.battlefield
      .filter((id) => mine(id) && matchesObjectFilter(s, player, id, f, source))
      .sort((a, b) => (a === source ? 1 : 0) - (b === source ? 1 : 0));
    out.push({
      slot: "sacrificeX",
      label: "Sacrifiez X permanents",
      count: x ?? 0,
      countIsX: x === undefined,
      options,
      suggested: options.slice(0, x ?? 0),
    });
  }
  if (c.exileOther) {
    const options = bounceCostOptions(s, player, source, c.exileOther);
    if (options.length)
      out.push({ slot: "exileOther", label: "Exilez un permanent", count: 1, options, suggested: options.slice(0, 1) });
  }
  if (c.returnUnblockedAttacker) {
    const options = [...unblockedAttackers(s, player)].sort((a, b) => chars(s, a).power - chars(s, b).power);
    if (options.length)
      out.push({
        slot: "returnAttacker",
        label: "Renvoyez un attaquant non bloqué dans la main de son propriétaire",
        count: 1,
        options,
        suggested: options.slice(0, 1),
      });
  }
  if (c.waterbend) out.push(...manaHelperPicks(s, player, source, { waterbend: true }));
  if (c.collectEvidence) {
    const options = (s.players[player]?.graveyard ?? []).filter((id) => id !== source);
    const suggested = evidenceCards(s, player, source, c.collectEvidence);
    if (suggested)
      out.push({
        slot: "evidence",
        label: `Réunissez des preuves ${c.collectEvidence} (valeur de mana totale ${c.collectEvidence} ou plus)`,
        count: suggested.length,
        options,
        suggested,
        minTotal: { n: c.collectEvidence, values: Object.fromEntries(options.map((id) => [id, manaValueOf(s, id)])) },
      });
  }
  return out;
}

/**
 * Coûts d'un sort payés avec des objets à choisir : preuves (kicker, coût alternatif), exil de cartes du cimetière
 * (kicker), flétrir X. `x` absent (`legalActions`) : la suggestion de flétrir X suppose X = 1.
 */
export function spellPicks(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  x?: number,
  flashback = false,
  /** Marqueurs à retirer parmi vos créatures pour la lancer d'ici (`CastTerms.removeCounters`). */
  removeCounters?: number,
): CostPick[] {
  const out: CostPick[] = additionalPicks(s, player, card, d, flashback);
  if (removeCounters) out.push(countersAmongPick(s, player, removeCounters));
  // Contempler : un permanent ou une carte de la main, ou rien (« vous pouvez », ou payer le supplément).
  const behold = d.additionalCost?.behold;
  if (behold) {
    const options = beholdOptions(s, player, card, behold.filter, behold.exiled);
    const suggested = beholdSuggestion(s, options, behold.required);
    if (options.length)
      out.push({
        slot: "behold",
        label: behold.required
          ? behold.exiled
            ? "Choisissez un permanent que vous contrôlez ou une carte exilée"
            : "Choisissez un permanent que vous contrôlez ou révélez une carte de votre main"
          : behold.orPay
            ? "Contemplez (ou ne choisissez rien et payez le supplément)"
            : "Vous pouvez contempler (un permanent ou une carte de votre main, révélée)",
        count: 1,
        options,
        suggested: suggested ? [suggested] : [],
        ...(behold.required ? {} : { optional: true }),
      });
  }
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
  const evidencePick = (n: number, when: CostPick["when"]): CostPick | null => {
    const suggested = evidenceCards(s, player, card, n);
    if (!suggested) return null;
    return {
      slot: "evidence",
      label: `Réunissez des preuves ${n} (valeur de mana totale ${n} ou plus)`,
      count: suggested.length,
      options: graveyard,
      suggested,
      minTotal: { n, values: Object.fromEntries(graveyard.map((id) => [id, manaValueOf(s, id)])) },
      when,
    };
  };
  const altEvidence = altCostFor(s, player, d)?.collectEvidence;
  if (altEvidence) {
    const p = evidencePick(altEvidence, "alternative");
    if (p) out.push(p);
  }
  if (d.kickerCost?.collectEvidence) {
    const p = evidencePick(d.kickerCost.collectEvidence, "kicked");
    if (p) out.push(p);
  }
  if (d.kickerCost?.exileGraveyard) {
    const n = d.kickerCost.exileGraveyard;
    const suggested = graveyardToExile(s, player, card, n);
    if (suggested)
      out.push({
        slot: "graveyardExile",
        label: `Exilez ${n} carte(s) de votre cimetière`,
        count: n,
        options: graveyard,
        suggested,
        when: "kicked",
      });
  }
  out.push(
    ...manaHelperPicks(s, player, card, {
      convoke: hasConvoke(s, player, d),
      improvise: hasImprovise(s, player, d),
      waterbend: d.waterbend !== undefined || d.xCost === "waterbend",
      delve: spellHasKeyword(s, player, d, "delve"),
      sacrificeToPay: d.additionalCost?.sacrificeToPay,
    }),
  );
  if (d.xCost === "blight") {
    const best = blightTarget(s, player, Math.max(1, x ?? 1));
    const options = s.battlefield.filter((id) => s.objects[id]?.controller === player && isCreature(s, id));
    if (best)
      out.push({
        slot: "blight",
        label: "Flétrir X : la créature qui reçoit les X marqueurs −1/−1",
        count: 1,
        options: [best, ...options.filter((id) => id !== best)],
        suggested: [best],
      });
  }
  return out;
}

/**
 * Objets qui peuvent aider à payer le mana (convocation, improvisation, maîtrise de l'eau, cave) : au choix du joueur,
 * sinon du paiement automatique (`atMost`, suggestion vide).
 */
function manaHelperPicks(
  s: GameState,
  player: PlayerId,
  except: ObjectId,
  kinds: { convoke?: boolean; improvise?: boolean; waterbend?: boolean; delve?: boolean; sacrificeToPay?: ObjectFilter },
): CostPick[] {
  const out: CostPick[] = [];
  const untapped = (id: ObjectId) =>
    id !== except && s.objects[id]?.controller === player && !s.objects[id]?.tapped && s.objects[id]?.zone === "battlefield";
  const add = (slot: CostSlot, label: string, options: ObjectId[]) => {
    if (options.length) out.push({ slot, label, count: options.length, options, suggested: [], atMost: true });
  };
  if (kinds.convoke)
    add(
      "convoke",
      "Convocation : les créatures à engager (chacune paie {1} ou un mana de sa couleur)",
      s.battlefield.filter((id) => untapped(id) && isCreature(s, id) && manaAbilitiesOf(s, id).length === 0),
    );
  if (kinds.improvise)
    add(
      "improvise",
      "Improvisation : les artefacts à engager (chacun paie {1})",
      s.battlefield.filter((id) => untapped(id) && chars(s, id).types.includes("Artifact")),
    );
  if (kinds.waterbend)
    add(
      "waterbend",
      "Maîtrise de l'eau : les artefacts et créatures à engager (chacun paie {1})",
      s.battlefield.filter((id) => untapped(id) && (chars(s, id).types.includes("Artifact") || isCreature(s, id))),
    );
  if (kinds.sacrificeToPay) {
    const f = kinds.sacrificeToPay;
    add(
      "sacrificeToPay",
      "Coût additionnel : les permanents à sacrifier (chacun réduit le coût de {1})",
      s.battlefield.filter(
        (id) => id !== except && s.objects[id]?.controller === player && matchesObjectFilter(s, player, id, f),
      ),
    );
  }
  if (kinds.delve)
    add(
      "delve",
      "Cave : les cartes de votre cimetière à exiler (chacune paie {1})",
      (s.players[player]?.graveyard ?? []).filter((id) => id !== except),
    );
  return out;
}

/** Les choix de convocation, d'improvisation, de maîtrise de l'eau et de cave d'un sort, vérifiés (sinon `RulesError`). */
function validHelperPicks(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  choices: CastChoices,
): CastChoices["picks"] {
  for (const p of spellPicks(s, player, card, d).filter((x) => x.atMost)) {
    const chosen = choices.picks?.[p.slot];
    if (chosen) resolvePick(s, p, chosen);
  }
  for (const k of ["convoke", "improvise", "waterbend", "delve", "sacrificeToPay"] as const)
    if (choices.picks?.[k] && !spellPicks(s, player, card, d).some((p) => p.slot === k))
      throw new RulesError("Ce sort ne se paie pas ainsi");
  return choices.picks;
}

/** Contrainte de paiement : les objets choisis par le joueur pour la convocation, l'improvisation, la cave… */
function onlyChosen(picks: CastChoices["picks"]): ManaPurpose["only"] | undefined {
  const only: NonNullable<ManaPurpose["only"]> = {};
  for (const k of ["convoke", "improvise", "waterbend", "delve", "sacrificeToPay"] as const) if (picks?.[k]) only[k] = picks[k];
  return Object.keys(only).length ? only : undefined;
}

/** Les objets d'un emplacement de coût d'un sort, choisis au moment de payer ce coût. */
function spellPickNow(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  x: number,
  slot: CostSlot,
  when: CostPick["when"],
  choices: CastChoices,
): ObjectId[] | null {
  const pick = spellPicks(s, player, card, d, x).find((p) => p.slot === slot && p.when === when);
  if (!pick) return null;
  return resolvePick(s, pick, choices.picks?.[slot]);
}

/** Objets choisis pour un coût : ceux du joueur s'ils sont valides (sinon `RulesError`), à défaut la suggestion. */
export function resolvePick(s: GameState, pick: CostPick, chosen: ObjectId[] | undefined): ObjectId[] {
  if (chosen === undefined) return pick.suggested;
  if (chosen.some((id) => !pick.options.includes(id))) throw new RulesError(`Choix invalide : ${pick.label}`);
  if (pick.atMost) {
    if (new Set(chosen).size !== chosen.length || chosen.length > pick.count)
      throw new RulesError(`Choix invalide : ${pick.label}`);
    return chosen;
  }
  if (pick.minTotal) {
    const total = chosen.reduce((n, id) => n + (pick.minTotal?.values[id] ?? 0), 0);
    if (new Set(chosen).size !== chosen.length || total < pick.minTotal.n)
      throw new RulesError(`Valeur de mana totale insuffisante : ${pick.label}`);
    return chosen;
  }
  if (chosen.length !== pick.count) throw new RulesError(`${pick.count} objet(s) à choisir : ${pick.label}`);
  const times = new Map<ObjectId, number>();
  for (const id of chosen) times.set(id, (times.get(id) ?? 0) + 1);
  for (const [id, n] of times) if (n > (pick.repeat?.[id] ?? 1)) throw new RulesError(`Choix invalide : ${pick.label}`);
  void s;
  return chosen;
}

/** Les objets d'un emplacement de coût d'une capacité, choisis au moment de payer ce coût. */
function pickNow(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  x: number,
  slot: CostSlot,
  choices: CastChoices,
): ObjectId[] {
  const pick = activationPicks(s, player, source, ab, x).find((p) => p.slot === slot);
  if (!pick) {
    if (choices.picks?.[slot]?.length) throw new RulesError("Ce coût ne demande pas ce choix");
    return [];
  }
  return resolvePick(s, pick, choices.picks?.[slot]);
}

export function activateAbility(s: GameState, player: PlayerId, source: ObjectId, index: number, choices: CastChoices): void {
  const o = s.objects[source];
  const ab = activatedAbility(s, source, index);
  if (!ab || !o) throw new RulesError("Capacité inconnue");
  const zone = abilityZone(ab);
  if (o.zone !== zone || (zone === "battlefield" ? o.controller : o.owner) !== player) {
    throw new RulesError("Vous ne contrôlez pas ce permanent");
  }
  if (
    ab.sorcerySpeed &&
    !instantLoyalty(s, player, source, ab) &&
    !(s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0)
  ) {
    throw new RulesError("Cette capacité s'active seulement en rituel");
  }
  if (!canPayNonManaCost(s, source, ab, index)) throw new RulesError("Impossible de payer le coût");
  // 702.61b : le second partagé n'empêche pas les actions spéciales (retourner une carte face visible).
  if (!ab.specialAction && splitSecondOnStack(s))
    throw new RulesError("Aucun sort ni capacité maintenant (second partagé ou combat)");
  let sacrificed: ObjectId[] = [];
  if (ab.cost.sacrifice) {
    const options = sacrificeOptions(s, player, source, ab);
    sacrificed = choices.sacrifice ?? options.slice(0, ab.cost.sacrifice.count);
    if (sacrificed.length !== ab.cost.sacrifice.count || sacrificed.some((id) => !options.includes(id))) {
      throw new RulesError("Sacrifice invalide");
    }
    if (ab.cost.sacrifice.differentNames && distinctNames(s, sacrificed) !== sacrificed.length)
      throw new RulesError("Les permanents sacrifiés doivent avoir des noms différents");
  }
  const x =
    ab.cost.mana?.x ||
    ab.cost.loyaltyX ||
    ab.cost.tapX ||
    ab.cost.exileFromGraveyardX ||
    ab.cost.sacrificeX ||
    ab.cost.discardX ||
    ab.cost.removeCountersX
      ? Math.max(0, Math.floor(choices.x ?? 0))
      : 0;
  const targets = validateTargets(s, player, ab.targets, choices.targets, { sourceId: source, x });
  // Krumar Initiate : « payez X points de vie ».
  if (ab.cost.payLifeX && x > 0 && payableLife(s, player) < x) throw new RulesError("Pas assez de points de vie");
  if (ab.cost.sacrificeX && x < 1) throw new RulesError("Sacrifiez au moins un permanent");
  if (ab.cost.minX !== undefined && x < ab.cost.minX) throw new RulesError(`X doit valoir au moins ${ab.cost.minX}`);
  if (ab.cost.loyaltyX && x > (o.counters.loyalty ?? 0)) throw new RulesError("Pas assez de marqueurs de loyauté");
  if (ab.cost.removeCountersX && x > (o.counters[ab.cost.removeCountersX] ?? 0)) throw new RulesError("Pas assez de marqueurs");
  // « Engagez X artefacts dégagés » : choisis maintenant, ils ne paient pas le mana de la capacité.
  const tapXOptions = ab.cost.tapX ? tapXCandidates(s, player, source, ab.cost.tapX) : [];
  const tapXChosen = ab.cost.tapX ? (choices.tap?.length === x ? choices.tap : tapXOptions.slice(0, x)) : [];
  if (tapXChosen.length < (ab.cost.tapX ? x : 0) || tapXChosen.some((id) => !tapXOptions.includes(id)))
    throw new RulesError("Pas assez de permanents à engager");
  const c = chars(s, source);
  const grantor = grantorOf(s, source, index);
  // Action spéciale (116.2, déverrouiller une porte) : les coûts sont payés, les effets s'appliquent sans la pile.
  if (ab.specialAction) {
    if (ab.cost.mana) {
      // Doc Aurlock (comploter), Inquisitive Glimmer (déverrouiller) : moins cher.
      try {
        // Le X d'un coût de déguisement (Aurelia's Vindicator) ; la réduction propre à la capacité (Fugitive Codebreaker).
        payMana(s, player, abilityManaCost(s, player, source, ab, undefined, x), undefined, abilityPurpose(source, ab));
      } catch (e) {
        rethrowAsRules(e, "Mana insuffisant");
      }
    }
    for (const e of ab.effects) {
      if (e.op === "unlockDoor") unlockDoor(s, source, e.door);
      if (e.op === "turnFaceUp") {
        // « jusqu'à X cibles » au retournement : le X payé (`amount.sourceX`).
        if (ab.cost.mana?.x) o.x = x;
        turnFaceUp(s, source);
      }
      if (e.op === "plot") plotCard(s, source);
      if (e.op === "foretell") foretellCard(s, source);
      // Suspension (702.62a) : une action spéciale depuis la main.
      if (e.op === "suspend") suspendCard(s, source, e.time);
    }
    s.priority.passes = 0;
    return;
  }
  const item: StackItem = {
    id: newId(s, "a"),
    kind: "ability",
    controller: player,
    sourceId: source,
    sourceDefId: o.defId,
    abilityIndex: index,
    mode: 0,
    targets,
    x,
    kicked: false,
    sourceSnapshot: { keywords: c.keywords, power: c.power, controller: player },
    // Capacité accordée (pas dans la définition imprimée) : ses effets voyagent avec elle, et le permanent qui l'accorde
    // (`ref.grantor`).
    inline:
      s.defs[o.defId]?.abilities[index] === ab
        ? undefined
        : {
            targets: ab.targets,
            effects: ab.effects,
            label: ab.label,
            ...(grantor ? { bound: { [GRANTOR_KEY]: [grantor] } } : {}),
          },
  };
  s.stack.push(item);
  // Coûts : mana (sans engager la source si elle doit s'engager pour le coût), puis {T}, puis sacrifice.
  // Les permanents choisis pour d'autres coûts (sacrifier, engager, équipage) ne servent pas à payer le mana.
  // Permanents à engager : choisis par le joueur (station), sinon automatiquement.
  const tapOptions = ab.cost.tapOthers ? tapOthersOptions(s, player, source, ab) : [];
  const tapOthers = ab.cost.tapOthers
    ? choices.tap?.length
      ? choices.tap
      : [...tapOptions]
          // La source (« engagez N créatures », elle comprise) en dernier recours.
          .sort((a, b) => Number(a === source) - Number(b === source) || chars(s, b).power - chars(s, a).power)
          .slice(0, ab.cost.tapOthers.count)
    : [];
  if (
    ab.cost.tapOthers &&
    (tapOthers.length !== ab.cost.tapOthers.count ||
      new Set(tapOthers).size !== tapOthers.length ||
      tapOthers.some((id) => !tapOptions.includes(id)))
  ) {
    throw new RulesError("Permanents à engager invalides");
  }
  // Équipage et monture (702.122, 702.171) : les créatures choisies par le joueur (force totale suffisante), sinon le
  // choix par défaut (les plus faibles d'abord).
  const crew = ab.cost.crew !== undefined ? chosenCrew(s, player, source, ab.cost.crew, choices.tap) : [];
  // Fabrication : les matériaux choisis par le joueur, sinon ceux par défaut (cartes du cimetière d'abord).
  const materials = ab.cost.craft ? chosenCraftMaterials(s, player, source, ab, choices.materials) : [];
  if (!materials) throw new RulesError("Matériaux de fabrication insuffisants");
  if (ab.cost.mana) {
    const reserved = new Set([
      ...tapOthers,
      ...tapXChosen,
      ...crew,
      ...materials,
      ...(ab.cost.tap || ab.cost.craft ? [source] : []),
      ...(ab.cost.grantor && grantor ? [grantor] : []),
    ]);
    try {
      // Warrior's Blades, Dragonfire Blade : le coût dépend de la créature ciblée.
      const cost = abilityManaCost(s, player, source, ab, targets.t?.[0], x);
      const purpose0 = abilityPurpose(source, ab);
      // Maîtrise de l'eau : les objets choisis par le joueur (vérifiés), sinon le paiement automatique.
      const only =
        ab.cost.waterbend && choices.picks?.waterbend
          ? { waterbend: pickNow(s, player, source, ab, x, "waterbend", choices) }
          : undefined;
      const purpose = { ...purpose0, ...(only ? { only } : {}) };
      payMana(s, player, cost, reserved, sacrificed.length ? { ...purpose, sacrificedForCost: new Set(sacrificed) } : purpose);
      if (ab.cost.waterbend) bent(s, player, "water");
    } catch (e) {
      rethrowAsRules(e, "Mana insuffisant");
    }
  }
  if (ab.cost.tap) tapObject(s, o);
  if (ab.cost.removeCountersX && x > 0) changeCounters(s, o, ab.cost.removeCountersX, -x);
  if (ab.cost.grantor === "tap" && grantor) tapObject(s, obj(s, grantor));
  if (ab.cost.loyalty !== undefined) {
    o.loyaltyTurn = s.turn.number;
    const cost = ab.cost.loyaltyX ? -x : ab.cost.loyalty;
    if (cost !== 0) changeCounters(s, o, "loyalty", cost, true);
    rulesEvent(s, { e: "loyalty", player, sourceId: source, cost });
  }
  // Une entrée par activation : Wonder Man permet une activation de plus des montées en puissance.
  if (ab.once) o.used = [...(o.used ?? []), index];
  if (ab.exhaust) {
    const pl = s.players[player];
    const stats = pl?.turnStats;
    if (stats) stats.exhaustActivated = (stats.exhaustActivated ?? 0) + 1;
    rulesEvent(s, { e: "exhaust", player, source });
    // Pit Automaton : la prochaine capacité d'exhaust de ce tour est copiée (nouvelles cibles au choix).
    if (consumePlayerEffect(s, player, "copyNextExhaust")) copyStackItem(s, item, player);
  }
  if (ab.oncePerTurn) o.activatedTurn = { ...(o.activatedTurn ?? {}), [index]: s.turn.number };
  if (ab.cost.addCounters) changeCounters(s, o, ab.cost.addCounters.kind, ab.cost.addCounters.n, true);
  for (const id of crew) tapObject(s, obj(s, id));
  if (crew.length) {
    // « Les créatures qui l'ont pilotée / montée ce tour-ci » (702.122, 702.171) : toutes celles des activations du tour.
    const before = o.crewedBy?.turn === s.turn.number ? o.crewedBy.ids : [];
    o.crewedBy = { turn: s.turn.number, ids: [...before, ...crew.filter((id) => !before.includes(id))] };
    rulesEvent(s, { e: "crewed", vehicle: source, crew: [...crew] });
  }
  if (ab.cost.self === "exert") o.exerted = true;
  // « Retirez un marqueur de cette créature » : les sortes choisies (`counterKind`), sinon le choix par défaut.
  if (ab.cost.removeCounters?.kind === "any") {
    const n = ab.cost.removeCounters.n;
    const kinds = pickNow(s, player, source, ab, x, "counterKind", choices);
    const byKind = new Map<string, number>();
    for (const k of kinds.length ? kinds : anyCountersDefault(o, n)) byKind.set(k, (byKind.get(k) ?? 0) + 1);
    for (const [k, m] of byKind) changeCounters(s, o, k, -m);
  } else if (ab.cost.removeCounters) changeCounters(s, o, ab.cost.removeCounters.kind, -ab.cost.removeCounters.n);
  if (ab.cost.payLife) payLife_(s, player, ab.cost.payLife);
  if (ab.cost.payLifeX && x > 0) payLife_(s, player, x);
  for (const id of tapOthers) tapObject(s, obj(s, id));
  // Les permanents sacrifiés restent consultables (dernières informations connues : « sa endurance »).
  item.paid = {
    sacrificed: sacrificed.length ? [...sacrificed] : undefined,
    tapped: tapOthers.length ? [...tapOthers] : undefined,
  };
  for (const id of sacrificed) sacrificePermanent(s, id);
  if (ab.cost.self === "sacrifice") sacrificePermanent(s, source);
  if (ab.cost.grantor === "sacrifice" && grantor) sacrificePermanent(s, grantor);
  if (ab.cost.grantor === "exile" && grantor) {
    s.lki[grantor] ??= snapshot(s, grantor);
    moveObject(s, grantor, "exile");
  }
  // La source quitte sa zone pour payer le coût : on garde ses dernières informations (« cette carte », où qu'elle soit).
  if (ab.cost.self === "exile" || ab.cost.self === "discard" || ab.cost.self === "bounce") s.lki[source] ??= snapshot(s, source);
  // Coûts payés avec des objets choisis par le joueur (sinon la suggestion du moteur) : `activationPicks`.
  const pick = (slot: CostSlot) => pickNow(s, player, source, ab, x, slot, choices);
  if (ab.cost.exileFromGraveyard) for (const id of pick("graveyardExile")) moveObject(s, id, "exile");
  // Flétrir N comme coût (ECL) : par défaut, `blightTarget`.
  const blighted = ab.cost.blight ? pick("blight")[0] : undefined;
  if (blighted && ab.cost.blight) changeCounters(s, obj(s, blighted), "-1/-1", ab.cost.blight, true);
  // « Retirez un marqueur d'une créature que vous contrôlez » : par défaut, celle qui en porte le plus.
  if (ab.cost.removeCounterFrom)
    for (const id of pick("counterFrom")) changeCounters(s, obj(s, id), ab.cost.removeCounterFrom.kind, -1, true);
  // Réunir des preuves N comme coût (Forensic Researcher, Polygraph Orb).
  if (ab.cost.collectEvidence) {
    const exiled = collectEvidence(s, player, pick("evidence"));
    if (ab.cost.linkEvidence) o.linked = [...(o.linked ?? []), ...exiled];
  }
  // « Engagez X artefacts dégagés » : X choisi à l'activation (permanents choisis avant le paiement du mana).
  for (const id of tapXChosen) tapObject(s, obj(s, id));
  // Winter, Cursed Rider : « exilez X cartes d'artefact de votre cimetière ».
  if (ab.cost.exileFromGraveyardX) {
    const chosen = pick("graveyardExileX");
    if (chosen.length < x) throw new RulesError("Pas assez de cartes à exiler");
    for (const id of chosen) moveObject(s, id, "exile");
  }
  // Radiant Lotus : « sacrifiez un ou plusieurs artefacts » (par défaut, les autres d'abord, la source en dernier).
  if (ab.cost.sacrificeX) {
    const chosen = pick("sacrificeX");
    if (chosen.length < x) throw new RulesError("Pas assez de permanents à sacrifier");
    item.paid = { ...item.paid, sacrificed: chosen };
    for (const id of chosen) sacrificePermanent(s, id);
  }
  // Fourrager (701.61) : trois cartes du cimetière ou une Nourriture (choix automatique).
  if (ab.cost.forage && !forage(s, player)) throw new RulesError("Impossible de fourrager");
  // Ninjutsu : un attaquant non bloqué retourne dans la main de son propriétaire (par défaut, le plus faible).
  if (ab.cost.returnUnblockedAttacker) {
    const weakest = pick("returnAttacker")[0];
    if (!weakest) throw new RulesError("Aucun attaquant non bloqué");
    removeFromCombat(s, weakest);
    moveObject(s, weakest, "hand");
  }
  // Urban Retreat : « renvoyez une créature engagée que vous contrôlez dans la main de son propriétaire ».
  if (ab.cost.bounceOther) {
    const options = bounceCostOptions(s, player, source, ab.cost.bounceOther);
    const back = choices.bounce?.length ? choices.bounce[0] : options[0];
    if (!back || !options.includes(back) || (choices.bounce?.length ?? 1) !== 1)
      throw new RulesError("Aucun permanent à renvoyer");
    removeFromCombat(s, back);
    moveObject(s, back, "hand");
  }
  // The Soul Stone : « exilez une créature que vous contrôlez ».
  if (ab.cost.exileOther) {
    const gone = pick("exileOther")[0];
    if (!gone) throw new RulesError("Aucun permanent à exiler");
    removeFromCombat(s, gone);
    moveObject(s, gone, "exile");
  }
  // « Défaussez une carte » : choisie par le joueur (sinon la première de la main).
  if (ab.cost.discard) {
    const options = discardCostOptions(s, player, source, ab.cost.discardFilter);
    const chosen = choices.discard?.length ? choices.discard : options.slice(0, ab.cost.discard);
    if (chosen.length !== ab.cost.discard || chosen.some((id) => !options.includes(id)))
      throw new RulesError("Défausse invalide");
    emit({ type: "discard", player, defIds: chosen.map((id) => obj(s, id).defId) });
    for (const id of chosen) announceDiscard(s, player, moveDiscarded(s, player, id));
    announceDiscardBatch(s, player, chosen.length);
  }
  // Gix, Yawgmoth Praetor : « défaussez X cartes » (les cartes choisies, sinon les premières proposées).
  if (ab.cost.discardX && x > 0) {
    const options = discardCostOptions(s, player, source, undefined);
    const chosen = choices.discard?.length ? choices.discard : options.slice(0, x);
    if (chosen.length !== x || chosen.some((id) => !options.includes(id))) throw new RulesError("Défausse invalide");
    emit({ type: "discard", player, defIds: chosen.map((id) => obj(s, id).defId) });
    for (const id of chosen) announceDiscard(s, player, moveDiscarded(s, player, id));
    announceDiscardBatch(s, player, chosen.length);
  }
  // « Défaussez votre main » : toute la main, en payant le coût (601.2h).
  if (ab.cost.discardHand) {
    const hand = [...(s.players[player]?.hand ?? [])];
    if (hand.length) {
      emit({ type: "discard", player, defIds: hand.map((id) => obj(s, id).defId) });
      for (const id of hand) announceDiscard(s, player, moveDiscarded(s, player, id));
      announceDiscardBatch(s, player, hand.length);
    }
  }
  // Fabrication : les matériaux sont exilés (et liés au verso à la résolution), puis la source.
  if (materials.length) {
    s.turn.crafting = true;
    const exiled = materials.map((id) => moveObject(s, id, "exile")).filter((id): id is string => !!id);
    delete s.turn.crafting;
    item.paid = { ...item.paid, exiled };
  }
  // Baron Helmut Zemo : les cartes exilées du cimetière, notées pour l'effet (« copiez ces cartes »).
  if (ab.cost.exileGraveyardSymbols) {
    const cards = symbolCards(s, player, ab.cost.exileGraveyardSymbols);
    if (!cards) throw new RulesError("Pas assez de symboles de mana dans votre cimetière");
    item.paid = { ...item.paid, exiled: cards.map((id) => moveObject(s, id, "exile")).filter((id): id is string => !!id) };
  }
  if (ab.cost.self === "exile") moveObject(s, source, "exile");
  if (ab.cost.self === "discard") {
    const card = moveDiscarded(s, player, source);
    announceDiscard(s, player, card);
    announceDiscardBatch(s, player, 1);
    if (ab.cycling && card) rulesEvent(s, { e: "cycled", player, card, x });
  }
  if (ab.cost.self === "bounce") moveObject(s, source, "hand");
  s.priority.passes = 0;
  emit({ type: "activate", player, stackId: item.id, defId: o.defId, targets: flatTargets(targets) });
  logTurnEvent(s, {
    e: "activate",
    player,
    equip: ab.equip || undefined,
    loyalty: ab.cost.loyalty !== undefined || undefined,
  });
  rulesEvent(s, { e: "activated", player, stackId: item.id });
  announceTargets(s, item.id, player, targets);
  // 605.1a / 605.3b : une capacité de mana ne va pas sur la pile ; elle se résout aussitôt.
  if (isManaAbility(ab)) resolveManaAbilityNow(s, item);
}

const MANA_OPS = new Set<Effect["op"]>(["addMana", "addManaChoice", "addManaColorsAmong", "addManaUntilEndOfTurn"]);

/** Un effet (ou un effet imbriqué : « si… », « vous pouvez… ») ajoute-t-il du mana ? */
function addsMana(effects: readonly Effect[]): boolean {
  return effects.some(
    (e) =>
      MANA_OPS.has(e.op) ||
      Object.values(e).some((v) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && addsMana(v as Effect[])),
  );
}

/**
 * 605.1a : une capacité activée sans cible, qui n'est pas une capacité de loyauté et qui peut ajouter du mana, est une
 * capacité de mana (Ramos, Capital City, Loot, the Pathfinder…).
 */
export function isManaAbility(ab: ActivatedAbilityDef): boolean {
  return ab.targets.length === 0 && ab.cost.loyalty === undefined && !ab.cost.loyaltyX && addsMana(ab.effects);
}

/** 605.3b : résout une capacité de mana sans passer par la pile ; le joueur garde la priorité. */
function resolveManaAbilityNow(s: GameState, item: StackItem): void {
  const i = s.stack.findIndex((x) => x.id === item.id);
  if (i >= 0) s.stack.splice(i, 1);
  const { effects } = specsAndEffects(s, item);
  s.resolving = {
    item,
    effects,
    pc: 0,
    controller: item.controller,
    targets: { ...(item.inline?.bound ?? {}) },
    vars: { ...(item.inline?.vars ?? {}) },
    awaiting: null,
    returnPriority: { ...s.priority },
  };
  // Un choix (couleur du mana) suspend la résolution ; la réponse rendra la priorité (`game.ts`).
  if (continueResolution(s)) s.flow = "priority";
}

/** Mots « cible » d'un élément de pile (Bolt Bend). */
/**
 * Mots « cible » d'un élément de la pile, rendus concrets dans son contexte (608.2b : valeurs évaluées de nouveau, Moseo ;
 * joueur qui tient les cibles, Fear of Falling).
 */
export function stackItemSpecs(s: GameState, item: StackItem, specs = specsAndEffects(s, item).specs): TargetSpec[] {
  // Le nombre de cibles et les autres valeurs, figés au ciblage, ne sont pas évalués de nouveau.
  const again = (x: TargetSpec) => x.maxManaValueAmount !== undefined || (x.of !== undefined && x.of.kind !== "target");
  if (!specs.some(again)) return specs;
  const ctx = {
    ...staticContext(s, item.controller, item.sourceId, { sourceDefId: item.sourceDefId, event: item.event }),
    x: item.x,
  };
  return specs.map((x) => (again(x) ? concreteSpec(s, ctx, x, true) : x));
}

export function specsAndEffects(s: GameState, item: StackItem): { specs: TargetSpec[]; effects: Effect[] } {
  const d = s.defs[item.sourceDefId];
  if (!d) return { specs: [], effects: [] };
  if (item.kind === "spell") {
    const mode = modesOf(d)[item.mode];
    // 702.136 : émeute — le choix (marqueur ou célérité) se fait en résolvant le sort de créature.
    const riot: Effect[] = isPermanentCard(d) && willHaveRiot(s, item.controller, d) ? [{ op: "chooseRiot" }] : [];
    const effects = [...(mode?.effects ?? []), ...riot];
    // 614.12 : « en arrivant, choisissez… » — le choix se fait pendant la résolution du sort de permanent.
    // Une copie d'un sort de permanent fait aussi ces choix : elle devient un jeton qui arrive de la même façon (707.10).
    if (d.chooseOnEnter && isPermanentCard(d)) {
      return { specs: mode?.targets ?? [], effects: [...effects, { op: "chooseOnEnter", kind: d.chooseOnEnter }] };
    }
    if (d.devour && isPermanentCard(d)) {
      const op: Effect = { op: "devour", filter: d.devour.filter, graveyardUpToX: d.devour.graveyardUpToX };
      return { specs: mode?.targets ?? [], effects: [...effects, op] };
    }
    if (d.entersAsCopyOf && isPermanentCard(d)) {
      return {
        specs: mode?.targets ?? [],
        effects: [...effects, { op: "chooseCopy", filter: d.entersAsCopyOf, anyController: d.entersAsCopyAnyController }],
      };
    }
    if (d.entersAsCopyOfGraveyard && isPermanentCard(d)) {
      return {
        specs: mode?.targets ?? [],
        effects: [...effects, { op: "chooseCopy", filter: d.entersAsCopyOfGraveyard.filter, fromGraveyards: true }],
      };
    }
    return { specs: mode?.targets ?? [], effects };
  }
  // Capacité retardée, réflexive ou accordée : ses effets voyagent avec elle ; la condition d'une capacité accordée « si… »
  // aussi (603.4).
  if (item.inline) {
    const c = item.inline.condition;
    if (c && !checkCondition(s, c, item.controller, item.sourceId, item.event?.objectId, item.event))
      return { specs: [], effects: [] };
    const m = item.inline.modes?.[item.mode];
    return m ? { specs: m.targets, effects: m.effects } : { specs: item.inline.targets, effects: item.inline.effects };
  }
  const ab = d.abilities[item.abilityIndex];
  if (ab?.kind === "triggered") {
    // 603.4 : la condition d'une capacité « si… » est vérifiée à nouveau à la résolution.
    if (ab.condition && !checkCondition(s, ab.condition, item.controller, item.sourceId, item.event?.objectId, item.event))
      return { specs: [], effects: [] };
    // « Faites ceci une seule fois par tour » : déjà fait par un autre déclenchement de la même capacité (deux sur la pile).
    if (ab.oncePerTurn === "ifDone" && s.turn.onceFired.includes(onceKey(item.sourceDefId, item.sourceId, item.abilityIndex)))
      return { specs: [], effects: [] };
    if (ab.modes) {
      const mode = ab.modes[item.mode];
      return { specs: mode?.targets ?? [], effects: mode?.effects ?? [] };
    }
    return { specs: ab.targets, effects: ab.effects };
  }
  return ab?.kind === "activated" ? { specs: ab.targets, effects: ab.effects } : { specs: [], effects: [] };
}

/**
 * Commence la résolution de l'objet au sommet de la pile (608).
 * Renvoie true si la résolution est terminée, false si elle attend un choix (s.flow = "resolving").
 */
export function resolveTop(s: GameState): boolean {
  // L'objet reste sur la pile pendant toute sa résolution (608.2) ; il n'en sort qu'à la fin.
  const item = s.stack[s.stack.length - 1];
  if (!item) return true;
  const { specs: specs0, effects } = specsAndEffects(s, item);
  // Valeurs de cible évaluées de nouveau à la résolution (Moseo : les PV gagnés ce tour-ci ; Fear of Falling : le joueur
  // défenseur).
  const specs = stackItemSpecs(s, item, specs0);

  // 608.2b : on revérifie les cibles. Si toutes sont devenues illégales, le sort ne se résout pas.
  // Références figées d'une capacité retardée (`bind`) : conservées telles quelles, ce ne sont pas des cibles.
  const legal: Record<string, string[]> = { ...(item.inline?.bound ?? {}) };
  let chosen = 0;
  let stillLegal = 0;
  for (const spec of specs) {
    const ids = item.targets[spec.id] ?? [];
    chosen += ids.length;
    // Cadeau promis ou kicker : le filtre propre (« à la place, un permanent non-terrain ciblé »).
    const legalSpec = item.kicked && spec.kickedFilter ? { ...spec, filter: spec.kickedFilter } : spec;
    legal[spec.id] = ids.filter((id) => isLegalTarget(s, item.controller, legalSpec, id, item.sourceId));
    stillLegal += legal[spec.id]?.length ?? 0;
  }
  if (chosen > 0 && stillLegal === 0) {
    s.stack.pop();
    emit({ type: "fizzle", stackId: item.id, defId: item.sourceDefId });
    if (item.kind === "spell" && s.objects[item.sourceId]) spellToRest(s, item);
    return true;
  }

  emit({ type: "resolve", stackId: item.id, defId: item.sourceDefId });
  s.resolving = {
    item,
    effects,
    pc: 0,
    controller: item.controller,
    targets: legal,
    // Capacité retardée : valeurs figées à sa création.
    vars: { ...(item.inline?.vars ?? {}) },
    awaiting: null,
  };
  return continueResolution(s);
}

/** Exécute les effets restants ; s'arrête sur le premier choix à poser. */
export function continueResolution(s: GameState): boolean {
  const r = s.resolving;
  if (!r) return true;
  while (r.pc < r.effects.length && !s.over) {
    // Chaque effet est un ensemble d'événements simultanés (regard en arrière des déclencheurs).
    const result = simultaneously(s, () => runEffect(s, r, r.effects[r.pc] as Effect));
    if (result && "ask" in result) {
      r.awaiting = result.ask.key;
      ask(s, result.ask.player, result.ask.request, { kind: "effect" });
      s.flow = "resolving";
      return false;
    }
    if (result && "castNow" in result) {
      r.awaiting = result.castNow.key;
      s.pending = {
        kind: "priority",
        player: result.castNow.player,
        castNow: { cards: result.castNow.cards, prompt: result.castNow.prompt },
      };
      s.flow = "resolving";
      return false;
    }
    if (result && "skip" in result) r.pc += result.skip;
    r.pc += 1;
  }
  finishResolution(s, r.item, r.targets, r.vars);
  s.resolving = null;
  return true;
}

/** Réponse à un choix posé pendant la résolution. */
export function answerResolutionChoice(s: GameState, values: ChoiceValue[]): boolean {
  const r = s.resolving;
  if (!r?.awaiting) throw new RulesError("Aucune résolution en attente");
  r.vars[r.awaiting] = values;
  r.awaiting = null;
  return continueResolution(s);
}

/**
 * Réponse à une priorité « lancer maintenant » (608.2g) : `card` est la carte lancée (déjà mise sur la pile par
 * l'appelant), ou `null` pour un refus. La résolution reprend.
 */
export function answerCastNow(s: GameState, card: ObjectId | null): boolean {
  const r = s.resolving;
  if (!r?.awaiting) throw new RulesError("Aucune résolution en attente");
  r.vars[r.awaiting] = card ? [card] : [];
  r.awaiting = null;
  return continueResolution(s);
}

/** Retire les permissions d'un « lancez-la » pendant une résolution (elles ne valent que pour la réponse). */
export function dropNowPermissions(s: GameState): void {
  if (s.playPermissions?.some((p) => p.now)) s.playPermissions = s.playPermissions.filter((p) => !p.now);
}

function finishResolution(
  s: GameState,
  item: StackItem,
  targets: Record<string, string[]>,
  vars: Record<string, ChoiceValue[]> = {},
): void {
  const i = s.stack.findIndex((x) => x.id === item.id);
  if (i >= 0) s.stack.splice(i, 1);
  // 707.10 : une copie de sort cesse d'exister en quittant la pile ; celle d'un sort de permanent devient un jeton en se
  // résolvant (Double Down).
  if (item.kind === "spell" && item.copy) {
    if (s.objects[item.sourceId]) removeFromGame(s, item.sourceId);
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) {
      const token = createTokenCopy(s, item.controller, d.id, {
        x: item.x,
        kicked: item.kicked,
        chosen: chosenFrom(vars),
        riot: vars.$riot?.[0] === "haste" ? "haste" : vars.$riot?.[0] === "counter" ? "counter" : undefined,
        copyOf: vars.$copyOf?.[0] !== undefined ? String(vars.$copyOf[0]) : undefined,
        copyMods: copiableExceptions(s, vars.$copyOf?.[1] !== undefined ? String(vars.$copyOf[1]) : undefined),
        copyChosen: vars.$copyOf !== undefined,
        // Choreographed Sparks : « la copie gagne la célérité ».
        counters: item.arrival?.counters,
        ...(item.arrival?.loyalty !== undefined ? { loyalty: item.arrival.loyalty } : {}),
        haste: item.arrival?.haste,
        ...(item.arrival?.nonlegendary ? { mods: { removeSupertypes: ["Legendary"] }, modsCopiable: true } : {}),
      });
      // « … et "au début de l'étape de fin, sacrifiez ce jeton" ».
      if (item.arrival?.sacrificeAtEnd && s.objects[token]?.zone === "battlefield")
        createDelayed(s, item.controller, token, s.objects[token]?.defId ?? d.id, {
          targets: [],
          effects: [{ op: "sacrificeIt", what: { kind: "target", id: "c" } }],
          bound: { c: [token] },
          label: "sacrifier la copie",
        });
    }
    return;
  }
  if (item.kind === "spell" && s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    if (d && isPermanentCard(d)) {
      // Verso d'une carte recto-verso modale lancé : le permanent arrive avec cette face.
      const face = s.objects[item.sourceId]?.faceDefId;
      // 303.4f : une Aura arrive attachée à l'objet qu'elle ciblait.
      const enteredId = moveObject(s, item.sourceId, "battlefield", {
        controller: item.controller,
        enters: {
          x: item.x,
          kicked: item.kicked,
          cast: item.cast,
          attachTo: d.enchant ? targets[ENCHANT_SPEC]?.[0] : undefined,
          chosen: chosenFrom(vars),
          riot: vars.$riot?.[0] === "haste" ? "haste" : vars.$riot?.[0] === "counter" ? "counter" : undefined,
          devoured: Number(vars.$devoured?.[0] ?? 0),
          copyOf: vars.$copyOf?.[0] !== undefined ? String(vars.$copyOf[0]) : undefined,
          copyMods: copiableExceptions(s, vars.$copyOf?.[1] !== undefined ? String(vars.$copyOf[1]) : undefined),
          copyChosen: vars.$copyOf !== undefined,
          // Faufilement : il arrive engagé et attaquant ce qu'attaquait la créature renvoyée.
          ...(item.cast?.sneakDefender ? { tapped: true, attacking: item.cast.sneakDefender } : {}),
          // Marqueurs, célérité et sous-types d'arrivée (Torgal, Summon: Fenrir, Noctis), Imminence : avant l'événement.
          counters: item.arrival?.counters,
          ...(item.arrival?.loyalty !== undefined ? { loyalty: item.arrival.loyalty } : {}),
          haste: item.arrival?.haste,
          mods: item.arrival?.subtypes ? { addSubtypes: item.arrival.subtypes } : undefined,
          impending: item.cast?.via === "impending" ? (d.impending ?? 0) : undefined,
        },
      });
      const arrived = enteredId ? s.objects[enteredId] : undefined;
      if (arrived && item.x) arrived.x = item.x;
      // Mimeoplasm : les cartes exilées en arrivant sont liées au permanent.
      if (arrived && vars["$ids:devoured"]?.length)
        arrived.linked = [...(arrived.linked ?? []), ...vars["$ids:devoured"].map(String)];
      // Fear of Abduction : les cartes exilées pour payer le coût additionnel sont liées au permanent.
      const exiled = item.paid?.exiled ?? [];
      if (arrived && exiled.length) arrived.linked = [...(arrived.linked ?? []), ...exiled];
      // Superior Spider-Man : « quand vous le faites, exilez cette carte » : une capacité réflexive (603.12).
      const copied = vars.$copyCard?.[0];
      if (arrived && copied !== undefined && s.objects[String(copied)]?.zone === "graveyard")
        pushInline(s, item.controller, arrived.id, arrived.defId, {
          targets: [],
          effects: [{ op: "moveTo", what: { kind: "target", id: "c" }, spec: { to: "exile" } }],
          bound: { c: [String(copied)] },
          label: "Exilez la carte copiée",
        });
      // Distorsion : exilé au début de la prochaine étape de fin.
      if (item.cast?.via === "warp" && arrived) {
        createDelayed(s, item.controller, arrived.id, arrived.defId, {
          targets: [],
          effects: [{ op: "moveTo", what: { kind: "target", id: "w" }, spec: { to: "exile", warp: true } }],
          bound: { w: [arrived.id] },
          label: "Distorsion : exilez-le",
        });
      }
      const card = arrived ? s.defs[arrived.defId] : undefined;
      if (face && arrived && card?.layout === "split") {
        // Salle (709.5d) : la porte lancée est déverrouillée à l'arrivée.
        const door = card.faceDefs?.findIndex((f) => f.id === face) ?? -1;
        if (door >= 0) unlockDoor(s, arrived.id, door);
      } else if (face && arrived) {
        arrived.faceDefId = face;
        bump(s);
      }
      // Carnelian Orb : « il acquiert la célérité jusqu'à la fin du tour ».
      const entered = s.battlefield[s.battlefield.length - 1];
      if (item.riders?.includes("haste") && entered) {
        bump(s);
        s.effects.push({
          id: newId(s, "e"),
          timestamp: nextTimestamp(s),
          affected: [entered],
          addKeywords: ["haste"],
          duration: "endOfTurn",
        });
      }
    } else resolvedSpellAway(s, item, d);
  }
}

/**
 * Destination d'un éphémère ou d'un rituel qui a fini de se résoudre : cimetière ; exil pour un flashback ;
 * exil « en aventure » pour une aventure (715.4) ; bibliothèque mélangée pour un présage.
 */
function resolvedSpellAway(s: GameState, item: StackItem, d: CardDef | undefined): void {
  // Esper Origins : exilé, puis sur le champ de bataille transformé avec un marqueur de finalité.
  if (item.toBattlefieldTransformed) {
    const exiled = moveObject(s, item.sourceId, "exile");
    if (exiled)
      moveWithSpec(s, item.controller, exiled, { to: "battlefield", transformed: true, counters: { kind: "finality", n: 1 } });
    return;
  }
  // Lilah : exilé et comploté au lieu d'aller au cimetière.
  if (item.plotOnResolve && !item.flashback) {
    plotCard(s, item.sourceId);
    return;
  }
  // Paradigme : exilé ; après la première résolution, un emblème propose d'en lancer une copie gratuite au début de chacune
  // de vos premières phases principales.
  if (d?.paradigm && !item.copy) {
    const exiled = moveObject(s, item.sourceId, "exile");
    const defId = `emblem:paradigm-${d.id}`;
    const already = Object.values(s.objects).some((o) => o.defId === defId && o.controller === item.controller);
    if (exiled && !already) {
      s.defs[defId] ??= {
        id: defId,
        name: `Paradigme : ${d.name}`,
        typeLine: "Emblème",
        manaCost: null,
        manaCostText: "",
        colors: [],
        supertypes: [],
        types: [],
        subtypes: [],
        keywords: [],
        abilities: [
          {
            kind: "triggered",
            trigger: { on: "step", step: "main1", whose: "you" },
            targets: [],
            effects: [{ op: "castCopiesFree", what: [{ kind: "linked" }], maxTotalManaValue: 99 }],
            label: `Paradigme : lancer une copie de ${d.name}`,
          },
        ],
        text: `At the beginning of your first main phase, you may cast a copy of ${d.name} from exile without paying its mana cost.`,
        implemented: true,
        isToken: true,
      };
      const emblem = createObject(s, defId, item.controller, "command", { isToken: true });
      emblem.linked = [exiled];
      bump(s);
    }
    return;
  }
  // Goliath Daydreamer : exilé avec un marqueur de rêve au lieu d'aller au cimetière (une copie cesse d'exister).
  if (item.exileWithCounter !== undefined && !item.copy) {
    const exiled = moveObject(s, item.sourceId, "exile");
    const o = exiled ? s.objects[exiled] : undefined;
    if (o && item.exileWithCounter) changeCounters(s, o, item.exileWithCounter, 1);
    return;
  }
  // « Exilez [ce sort] » (Step Between Worlds).
  if (d?.exileOnResolve) {
    moveObject(s, item.sourceId, "exile");
    return;
  }
  if (item.adventure && !item.flashback) {
    const id = moveObject(s, item.sourceId, "exile");
    const o = id ? s.objects[id] : undefined;
    if (o) o.onAdventure = true;
    return;
  }
  // Rebond (702.88) : un sort lancé depuis la main est exilé ; au début de votre prochain entretien, vous pouvez le lancer
  // depuis l'exil sans payer son coût de mana (pendant la résolution de la capacité retardée, 608.2g). Mot-clé imprimé
  // (Quantum Misalignment) ou accordé au sort (Ojer Pakpatiq : `item.rebound`).
  const rebound = item.rebound || (!!d && spellHasKeyword(s, item.controller, d, "rebound"));
  if (rebound && item.cast?.from === "hand" && !item.flashback && !item.copy) {
    const exiled = moveObject(s, item.sourceId, "exile");
    if (exiled) {
      const grant: Effect = { op: "castNow", what: { kind: "target", id: "rb" }, free: true };
      createDelayed(
        s,
        item.controller,
        exiled,
        item.sourceDefId,
        { targets: [], effects: [grant], bound: { rb: [exiled] } },
        "yourNextUpkeep",
      );
    }
    return;
  }
  if (!item.flashback && d?.subtypes.includes("Omen")) {
    const id = moveObject(s, item.sourceId, "library");
    const owner = id ? s.objects[id]?.owner : undefined;
    if (owner) shuffle(s, s.players[owner]?.library ?? []);
    return;
  }
  spellToRest(s, item);
}

/** Un sort qui quitte la pile : en exil (flashback, « exilez-la »), au-dessous de la bibliothèque, sinon au cimetière. */
function spellToRest(s: GameState, item: StackItem, exile = false): void {
  if (item.flashback || exile) moveObject(s, item.sourceId, "exile");
  else if (item.bottomInstead) moveObject(s, item.sourceId, "library", { position: "bottom" });
  else moveObject(s, item.sourceId, "graveyard");
}
