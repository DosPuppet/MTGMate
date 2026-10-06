/**
 * Vue d'un joueur : tout ce qui est public + sa propre main + les options de sa décision.
 * Les informations cachées (main adverse, bibliothèques) ne sortent jamais du moteur.
 */

import { copiedDefId } from "./layers";
import { legalActions } from "./legal";
import { costToText, manaValue, totalCost } from "./mana";
import { keyedPrinting } from "./printing";
import { abilitiesOf, castTerms, landPermitted, modesOf, spellCost } from "./stack";
import { chars, commanderOf, decider, HIDDEN_CARD_ID, isCreature, isSummoningSick, obj } from "./state";
import { playerStatic, playerStatics } from "./statics";
import { pendingTriggerSource } from "./triggers";
import { attackableDefenders, attackCandidates, blockCandidates } from "./turn";
import type {
  ActionOption,
  CardDef,
  CardType,
  CastNowRequest,
  ChoicePurpose,
  ChoiceRequest,
  Color,
  GameEvent,
  GameObject,
  GameState,
  Keyword,
  ManaType,
  ObjectId,
  PlayerId,
  Step,
  Zone,
} from "./types";

export interface CardFace {
  defId: string;
  name: string;
  typeLine: string;
  manaCost: string;
  text: string;
  image?: string;
  fr?: CardDef["fr"];
  basePower?: number;
  baseToughness?: number;
  implemented: boolean;
  isToken: boolean;
  /** Jeton : ses couleurs (image correspondante, `tokenImage` du paquet des cartes). */
  colors?: Color[];
  /** Sort attaché d'une carte « à préparer » (affiché dans l'aperçu). */
  prepareFace?: CardDef["prepareFace"];
  /** Carte à plusieurs faces : sa disposition et ses autres faces (verso, aventure, autre moitié). */
  layout?: CardDef["layout"];
  otherFaces?: CardDef["prepareFace"][];
}

export interface ObjectView extends CardFace {
  id: ObjectId;
  uid: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  types: CardType[];
  subtypes: string[];
  colors: Color[];
  tapped: boolean;
  damage: number;
  counters: Record<string, number>;
  power?: number;
  toughness?: number;
  keywords: Keyword[];
  /** Règles de blocage (« imblocable par les Humains »…) : leurs libellés. */
  blockRules?: string[];
  /** Protections et défenses talismaniques « contre [filtre] » : leurs libellés. */
  protections?: string[];
  /** Règles « utilise son endurance pour » : leurs libellés. */
  powerRules?: string[];
  /** Engagé pour son mana, encore annulable par son contrôleur (décision `undoMana`). Seulement dans sa propre vue. */
  undoMana?: boolean;
  sick: boolean;
  attacking: boolean;
  blocking: ObjectId | null;
  /** Aura ou Équipement : le permanent auquel il est attaché. */
  attachedTo: ObjectId | null;
  /** Choix fait en arrivant (type de créature, couleur, mode d'un Siège). */
  chosen: {
    creatureType?: string;
    color?: Color;
    mode?: string;
    number?: number;
  } | null;
  /** Reality Fracture : permanent préparé (son sort peut être lancé depuis l'exil). */
  prepared?: boolean;
  /** Murders at Karlov Manor : créature suspecte (menace, ne peut pas bloquer). */
  suspected?: boolean;
  /** Classe : niveau atteint (au-delà de 1) ; Affaire : résolue. */
  classLevel?: number;
  solved?: boolean;
  /** Permanent (ou sort) face cachée du spectateur : la vraie carte, que lui seul connaît (708.5). */
  faceDownCard?: CardFace;
  /** Coût de sa garde (imprimée ou accordée), pour l'affichage : « {2} », « 3 PV »… */
  ward?: string;
  /**
   * Capacités activées d'un permanent (hors capacités de mana), activables ou non : l'interface montre celles qui ne le
   * sont pas en ce moment (coût impayable, cible absente, timing) au lieu de les taire. `index` : celui de `activate`.
   */
  activated?: { index: number; label: string; cost: string }[];
  /**
   * Carte jouable de la main du spectateur (ou hors de sa main) dont le coût de mana à payer diffère du coût imprimé :
   * réductions et taxes, flashback, coût alternatif imposé… `delta` : écart de valeur de mana (négatif : moins cher).
   */
  castCost?: { text: string; delta: number };
}

export interface StackItemView extends CardFace {
  id: string;
  uid: string;
  kind: "spell" | "ability";
  controller: PlayerId;
  sourceId: ObjectId;
  targets: string[];
  x: number;
  kicked: boolean;
  mode: number;
  /** Copie d'un sort (Thousand-Year Storm). */
  copy: boolean;
  /** L'effet joué, quand la carte en a plusieurs : mode choisi d'un sort modal, ou capacité (activée, déclenchée). */
  effect?: string;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  life: number;
  libraryCount: number;
  handCount: number;
  graveyard: ObjectView[];
  manaPool: Record<ManaType, number>;
  /** Mana restreint de la réserve (« ne dépensez ce mana que pour… »), par type ; absent s'il n'y en a pas. */
  restrictedMana?: ManaType[];
  lost: boolean;
  /** Emblèmes (zone de commandement). */
  emblems: { name: string; text: string }[];
  /**
   * Commander (PLAN-E) : les commandants de ce joueur (information publique), leur zone, leur objet quand il est dans
   * une zone publique, et la taxe de leur prochain lancer depuis la zone de commandement (903.8).
   */
  commanders?: { defId: string; zone: Zone; id?: ObjectId; tax: number }[];
  /** Commander : blessures de combat reçues de chaque commandant (903.10a ; 21 d'un même commandant, le joueur perd). */
  commanderDamage?: { defId: string; owner: PlayerId; amount: number }[];
  /** Vitesse (702.179), absente tant qu'elle n'a pas démarré. */
  speed?: number;
  /** Marqueurs poison (104.3d : 10 ou plus, le joueur perd), absents s'il n'en a aucun. */
  poison?: number;
}

export type PendingView =
  | { kind: "mulligan"; player: PlayerId; mulligans: number; bottom: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  /** `castNow` : lancer une carte pendant une résolution (608.2g), seulement pour le joueur qui décide. */
  | { kind: "priority"; player: PlayerId; actions?: ActionOption[]; castNow?: CastNowRequest }
  /** `defenders` : adversaires et planeswalkers adverses attaquables. */
  | { kind: "declareAttackers"; player: PlayerId; candidates?: ObjectId[]; defenders?: string[] }
  | { kind: "declareBlockers"; player: PlayerId; candidates?: { blocker: ObjectId; attackers: ObjectId[] }[] }
  | { kind: "discard"; player: PlayerId; count: number }
  | {
      kind: "choice";
      player: PlayerId;
      /** Présents seulement pour le joueur qui choisit. */
      request?: ChoiceRequest;
      purpose?: ChoicePurpose;
      /** Objets mentionnés par la demande (y compris cachés, ex. dessus de bibliothèque pour un regard). */
      objects?: ObjectView[];
      /** Déclenchement dont on choisit les cibles ou le mode : sa carte et sa capacité (pas encore sur la pile). */
      source?: { face: CardFace; effect?: string };
    };

export interface GameView {
  viewer: PlayerId;
  /** Tous les autres joueurs (y compris éliminés), dans l'ordre du tour à partir du suivant. */
  opponents: PlayerId[];
  turn: { number: number; active: PlayerId; step: Step; landsPlayed: number };
  /** 722 : joueur dont le contrôleur prend la décision en cours (sa main remplace alors `hand`). */
  controlling?: PlayerId;
  players: Record<PlayerId, PlayerView>;
  hand: ObjectView[];
  battlefield: ObjectView[];
  stack: StackItemView[];
  exile: ObjectView[];
  /**
   * Cartes exilées « par » un permanent encore sur le champ de bataille (Sheltered by Ghosts, Deep-Cavern Bat, cartes
   * liées, matériaux d'une fabrication) : identifiant du permanent → cartes exilées. Information publique.
   */
  exiledWith: Record<ObjectId, ObjectId[]>;
  /**
   * Cartes hors de la main que le spectateur peut jouer (présentées au bout de sa main, `zone` dit d'où elles viennent) :
   * exilées jouables (Chandra, sorts préparés), du cimetière (flashback, Icetill Explorer, capacités activables depuis le
   * cimetière), dessus de la bibliothèque (Vizier of the Menagerie).
   */
  playableElsewhere: ObjectView[];
  combat: { attackers: { id: ObjectId; defender: string; blockers: ObjectId[] }[] } | null;
  pending: PendingView | null;
  /** Nombre de créatures du spectateur qui pourraient attaquer ce tour-ci (pour l'interface). */
  potentialAttackers: number;
  over: boolean;
  winner: PlayerId | null;
}

/** Cartes en exil rattachées au permanent qui les a exilées (exil lié « jusqu'à ce que… » et cartes liées). */
function exiledWith(s: GameState): Record<ObjectId, ObjectId[]> {
  const out: Record<ObjectId, ObjectId[]> = {};
  const add = (source: ObjectId, cards: ObjectId[]) => {
    if (s.objects[source]?.zone !== "battlefield") return;
    const exiled = cards.filter((id) => s.objects[id]?.zone === "exile" && !out[source]?.includes(id));
    if (exiled.length) out[source] = [...(out[source] ?? []), ...exiled];
  };
  for (const l of s.linkedExile) add(l.sourceId, l.cards);
  for (const id of s.battlefield) add(id, s.objects[id]?.linked ?? []);
  return out;
}

/** Libellé de l'effet joué : mode d'un sort modal (spree, tiered…), ou capacité d'un permanent. */
function playedEffect(s: GameState, item: GameState["stack"][number]): string | undefined {
  const d = s.defs[item.sourceDefId];
  if (!d) return undefined;
  if (item.kind === "spell") {
    const modes = modesOf(d);
    return modes.length > 1 ? modes[item.mode]?.label : undefined;
  }
  if (item.inline) {
    const mode = item.inline.modes?.[item.mode]?.label;
    return [item.inline.label, mode].filter(Boolean).join(" — ") || "Capacité";
  }
  const ab = d.abilities[item.abilityIndex];
  if (ab?.kind === "triggered" && ab.modes) {
    const mode = ab.modes[item.mode]?.label;
    return [ab.label, mode].filter(Boolean).join(" — ") || "Capacité déclenchée";
  }
  if (ab?.kind === "triggered") return ab.label ?? "Capacité déclenchée";
  if (ab?.kind === "activated") return ab.label ?? "Capacité activée";
  return "Capacité";
}

export function cardFace(d: CardDef): CardFace {
  return {
    defId: d.id,
    name: d.name,
    typeLine: d.typeLine,
    manaCost: d.manaCostText || costToText(d.manaCost),
    text: d.text,
    image: d.image,
    fr: d.fr,
    basePower: d.power,
    baseToughness: d.toughness,
    implemented: d.implemented,
    isToken: !!d.isToken,
    ...(d.isToken ? { colors: d.colors } : {}),
    ...(d.prepareFace ? { prepareFace: d.prepareFace } : {}),
    ...(d.layout ? { layout: d.layout, otherFaces: otherFaces(d) } : {}),
  };
}

/**
 * Les faces autres que celle affichée (pour l'aperçu) : le verso, l'aventure, ou les deux moitiés d'une carte
 * scindée. Une face n'a sa propre image que si elle est imprimée à part (verso d'une carte recto-verso).
 */
function otherFaces(d: CardDef): NonNullable<CardFace["otherFaces"]> {
  const faces = d.faceDefs ?? [];
  return (d.layout === "split" ? faces : faces.slice(1)).map((f) => ({
    name: f.name,
    manaCost: f.manaCostText,
    typeLine: f.typeLine,
    text: f.text,
    image: f.image !== d.image ? f.image : undefined,
    fr: f.fr
      ? { name: f.fr.name, typeLine: f.fr.typeLine, text: f.fr.text, image: f.fr.image !== d.fr?.image ? f.fr.image : undefined }
      : undefined,
  }));
}

/**
 * L'illustration de l'impression choisie par le deck (PLAN-G : une réédition), pour la face imprimée de la carte
 * elle-même ; une copie ou un autre côté gardent la leur.
 */
function printedFace(s: GameState, uid: string, defId: string, d: CardDef): CardFace {
  const face = cardFace(d);
  const key = s.printings?.[uid];
  const p = key && d.id === defId ? (d.printings?.find((x) => x.key === key) ?? keyedPrinting(key)) : undefined;
  if (!p?.image) return face;
  return { ...face, image: p.image, ...(face.fr ? { fr: { ...face.fr, image: p.frImage ?? p.image } } : {}) };
}

export function objectView(s: GameState, id: ObjectId): ObjectView {
  const o = obj(s, id);
  // Une copie (couche 1) s'affiche avec la face de ce qu'elle copie.
  const d = s.defs[o.zone === "battlefield" ? copiedDefId(s, id) : (o.faceDefId ?? o.defId)] as CardDef;
  const c = chars(s, id);
  const isCreature = c.types.includes("Creature");
  const attacking = !!s.combat?.attackers.some((a) => a.id === id);
  const blocking = s.combat?.blockers.find((b) => b.id === id)?.attacker ?? null;
  return {
    ...printedFace(s, o.uid, o.defId, d),
    id,
    uid: o.uid,
    owner: o.owner,
    controller: o.controller,
    zone: o.zone,
    types: c.types,
    subtypes: c.subtypes,
    colors: c.colors,
    tapped: o.tapped,
    damage: o.damage,
    counters: { ...o.counters },
    power: isCreature ? c.power : undefined,
    toughness: isCreature ? c.toughness : undefined,
    keywords: c.keywords,
    ...(c.blockRules.length ? { blockRules: c.blockRules.map((r) => r.label) } : {}),
    ...(c.protections.length ? { protections: c.protections.map((r) => r.label) } : {}),
    ...(c.powerRules.length ? { powerRules: c.powerRules.map((r) => r.label) } : {}),
    sick: o.zone === "battlefield" && isSummoningSick(s, id),
    attacking,
    blocking,
    attachedTo: o.attachedTo ?? null,
    chosen: o.chosen ?? null,
    name: c.name,
    ...(o.preparedCopy && s.objects[o.preparedCopy] ? { prepared: true } : {}),
    ...(o.suspected && o.zone === "battlefield" ? { suspected: true } : {}),
    ...(o.classLevel && o.classLevel > 1 ? { classLevel: o.classLevel } : {}),
    ...(o.solved ? { solved: true } : {}),
    ...(c.keywords.includes("ward") ? { ward: wardCost(c.abilities) } : {}),
    ...activatedView(o.zone === "battlefield" ? c.abilities : []),
  };
}

/** Capacités activées depuis le champ de bataille, avec un libellé et leur coût (mana et {T}). */
function activatedView(abilities: CardDef["abilities"]): Pick<ObjectView, "activated"> {
  const out: NonNullable<ObjectView["activated"]> = [];
  abilities.forEach((ab, index) => {
    if (ab.kind !== "activated" || ab.fromGraveyard || ab.fromHand) return;
    const cost = [ab.cost.mana ? costToText(ab.cost.mana) : "", ab.cost.tap ? "{T}" : ""].filter(Boolean).join(", ");
    out.push({ index, label: ab.label ?? "Capacité activée", cost });
  });
  return out.length ? { activated: out } : {};
}

/** Coût de la garde (702.21) lu dans sa capacité déclenchée : « à moins de payer … ». */
function wardCost(abilities: CardDef["abilities"]): string | undefined {
  const costs = abilities.flatMap((ab) => {
    if (ab.kind !== "triggered" || ab.trigger.on !== "becomesTarget" || ab.label !== "Garde") return [];
    const pay = ab.effects[0];
    if (pay?.op !== "unlessPay") return [];
    const parts = [
      pay.mana ? costToText(pay.mana) : "",
      pay.life ? `${pay.life} PV` : "",
      pay.lifeAmount ? "PV égaux à sa force" : "",
      pay.discard ? (pay.discardRandom ? "une carte au hasard" : "défausser une carte") : "",
      pay.sacrifice
        ? `sacrifier ${pay.sacrifice} ${pay.sacrificeFilter?.types?.includes("Creature") ? "créature(s)" : pay.sacrificeFilter?.notTypes?.includes("Land") ? "permanents non-terrains" : "permanents"}`
        : "",
      pay.collectEvidence ? `réunir des preuves ${pay.collectEvidence}` : "",
    ].filter(Boolean);
    return parts.length ? [parts.join(" et ")] : [];
  });
  return costs.length ? costs.join(", ") : undefined;
}

/** 708.5 : le contrôleur d'un permanent face cachée peut le regarder ; les autres joueurs non. */
function withFaceDownCard(s: GameState, v: ObjectView, viewer: PlayerId): ObjectView {
  const o = s.objects[v.id];
  // Found Footage : « vous pouvez regarder les créatures face cachée de vos adversaires à tout moment ».
  const sees = o?.controller === viewer || (!!o && playerStatic(s, viewer, "seeFaceDown") && isCreature(s, o.id));
  const card = o?.faceDown && sees ? s.defs[o.faceDown.card] : undefined;
  return card ? { ...v, faceDownCard: cardFace(card) } : v;
}

/** Une carte exilée face cachée que le spectateur ne peut pas regarder : son dos seulement (406.3). */
function hiddenTo(s: GameState, id: ObjectId, viewer: PlayerId): boolean {
  const seen = s.objects[id]?.exiledFaceDown;
  return !!seen && !seen.includes(viewer);
}

function exiledView(s: GameState, id: ObjectId, viewer: PlayerId): ObjectView {
  const v = objectView(s, id);
  if (!hiddenTo(s, id, viewer)) return v;
  // Rien que l'objet lui-même : ni nom, ni types, ni capacités ; ses marqueurs restent visibles.
  return {
    defId: HIDDEN_CARD_ID,
    name: "",
    typeLine: "Carte face cachée",
    manaCost: "",
    text: "",
    implemented: true,
    isToken: false,
    id: v.id,
    uid: v.uid,
    owner: v.owner,
    controller: v.controller,
    zone: v.zone,
    types: [],
    subtypes: [],
    colors: [],
    tapped: false,
    damage: 0,
    counters: v.counters,
    keywords: [],
    sick: false,
    attacking: false,
    blocking: null,
    attachedTo: null,
    chosen: null,
  };
}

/** Zones publiques où l'objet d'un commandant est montré (sa zone seule ailleurs : main, bibliothèque). */
const PUBLIC_ZONES: readonly Zone[] = ["command", "battlefield", "stack", "graveyard", "exile"];

/** Commander (PLAN-E) : les commandants d'un joueur et les blessures de commandant qu'il a reçues. */
function commanderViews(s: GameState, p: PlayerId): Pick<PlayerView, "commanders" | "commanderDamage"> {
  // Un joueur éliminé a quitté la partie avec ses cartes (800.4a) : plus rien à montrer.
  if (s.players[p]?.lost) return {};
  const cards = s.commander?.cards ?? {};
  const where = new Map<string, GameObject>();
  for (const o of Object.values(s.objects)) if (cards[o.uid] && commanderOf(s, o)) where.set(o.uid, o);
  const commanders: NonNullable<PlayerView["commanders"]> = [];
  const commanderDamage: NonNullable<PlayerView["commanderDamage"]> = [];
  for (const [uid, rec] of Object.entries(cards)) {
    if (rec.owner === p) {
      const o = where.get(uid);
      const shown = o && PUBLIC_ZONES.includes(o.zone) && !o.faceDown;
      commanders.push({ defId: rec.defId, zone: o?.zone ?? "exile", ...(shown ? { id: o.id } : {}), tax: 2 * rec.casts });
    }
    const amount = rec.damage[p] ?? 0;
    if (amount > 0) commanderDamage.push({ defId: rec.defId, owner: rec.owner, amount });
  }
  return { commanders, ...(commanderDamage.length ? { commanderDamage } : {}) };
}

export function projectView(s: GameState, viewer: PlayerId): GameView {
  const players: Record<PlayerId, PlayerView> = {};
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    players[p] = {
      id: p,
      name: pl.name,
      life: pl.life,
      libraryCount: pl.library.length,
      handCount: pl.hand.length,
      speed: pl.speed,
      ...(pl.poison ? { poison: pl.poison } : {}),
      graveyard: pl.graveyard.map((id) => objectView(s, id)),
      manaPool: { ...pl.manaPool },
      ...(pl.restrictedMana?.length ? { restrictedMana: pl.restrictedMana.map((m) => m.type) } : {}),
      lost: pl.lost,
      emblems: pl.command
        .filter((id) => obj(s, id).isToken)
        .map((id) => {
          const d = s.defs[obj(s, id).defId];
          return { name: d?.name ?? "Emblème", text: d?.text ?? "" };
        }),
      ...(s.commander ? commanderViews(s, p) : {}),
    };
  }

  const stack: StackItemView[] = s.stack.map((item) => {
    const d = s.defs[item.sourceDefId] as CardDef;
    const src = item.kind === "spell" ? s.objects[item.sourceId] : undefined;
    return {
      ...(src ? printedFace(s, src.uid, src.defId, d) : cardFace(d)),
      id: item.id,
      uid: s.objects[item.sourceId]?.uid ?? item.id,
      kind: item.kind,
      controller: item.controller,
      sourceId: item.sourceId,
      targets: Object.values(item.targets).flat(),
      x: item.x,
      kicked: item.kicked,
      mode: item.mode,
      copy: item.copy ?? false,
      ...(playedEffect(s, item) ? { effect: playedEffect(s, item) } : {}),
    };
  });

  let pending: PendingView | null = null;
  // 722 : le joueur qui contrôle le tour voit la décision comme la sienne (options du joueur contrôlé).
  const actor = decider(s);
  const p = s.pending ? { ...s.pending, player: actor ?? s.pending.player } : null;
  const who = s.pending?.player ?? viewer;
  if (p) {
    const mine = p.player === viewer;
    switch (p.kind) {
      case "priority":
        pending = mine ? { ...p, actions: legalActions(s, who) } : { kind: "priority", player: p.player };
        break;
      case "declareAttackers":
        pending = mine ? { ...p, candidates: attackCandidates(s, who), defenders: attackableDefenders(s, who) } : { ...p };
        break;
      case "declareBlockers":
        pending = mine ? { ...p, candidates: blockCandidates(s, who) } : { ...p };
        break;
      case "choice": {
        if (!mine) {
          pending = { kind: "choice", player: p.player };
          break;
        }
        const r = p.request;
        const ids = r.type === "pick" ? r.options : r.type === "order" ? r.items : r.type === "divide" ? r.among : [];
        pending = { ...p, objects: ids.filter((id) => s.objects[id]).map((id) => objectView(s, id)) };
        const trig =
          p.purpose.kind === "triggerTarget" || p.purpose.kind === "triggerMode"
            ? pendingTriggerSource(s, p.purpose.trigger)
            : null;
        const def = trig ? s.defs[trig.defId] : undefined;
        if (trig && def) pending.source = { face: cardFace(def), ...(trig.label ? { effect: trig.label } : {}) };
        // Nouvelles cibles d'une copie, répartition : l'élément de pile concerné.
        const purpose = p.purpose;
        const onStack = purpose.kind === "stackChoice" ? stack.find((x) => x.id === purpose.stackId) : undefined;
        if (onStack) pending.source = { face: onStack, ...(onStack.effect ? { effect: onStack.effect } : {}) };
        break;
      }
      default:
        pending = { ...p };
    }
  }

  // Pendant un tour contrôlé, le contrôleur voit et joue la main du joueur contrôlé quand il décide pour lui.
  const handOwner = actor === viewer && who !== viewer ? who : viewer;
  return {
    viewer,
    opponents: (() => {
      const i = s.playerOrder.indexOf(viewer);
      return [...s.playerOrder.slice(i + 1), ...s.playerOrder.slice(0, Math.max(0, i))];
    })(),
    turn: { number: s.turn.number, active: s.turn.active, step: s.turn.step, landsPlayed: s.turn.landsPlayed },
    players,
    hand: (s.players[handOwner]?.hand ?? []).map((id) => withCastCost(s, handOwner, objectView(s, id))),
    controlling: actor === viewer && who !== viewer ? who : undefined,
    battlefield: s.battlefield.map((id) => {
      const o0 = withFaceDownCard(s, objectView(s, id), viewer);
      // A Killer Among Us : un choix secret n'est montré qu'à son contrôleur.
      const o = s.objects[id]?.chosen?.secret && s.objects[id]?.controller !== viewer ? { ...o0, chosen: null } : o0;
      return s.manaUndo?.some((u) => u.player === viewer && u.source === id) ? { ...o, undoMana: true } : o;
    }),
    stack,
    exile: s.exile.map((id) => exiledView(s, id, viewer)),
    exiledWith: exiledWith(s),
    playableElsewhere: [
      // Son commandant dans la zone de commandement (903.8), toujours montré : la pastille donne sa taxe.
      ...(s.players[viewer]?.command ?? []).filter((id) => commanderOf(s, s.objects[id])),
      ...s.exile.filter((id) => castTerms(s, viewer, id) || landPermitted(s, viewer, id)),
      // Cimetières (le sien, et ceux des autres avec une permission : Tinybones).
      ...s.playerOrder.flatMap((p) =>
        (s.players[p]?.graveyard ?? []).filter(
          (id) =>
            castTerms(s, viewer, id) ||
            landPermitted(s, viewer, id) ||
            (s.objects[id]?.owner === viewer && abilitiesOf(s, id).some((ab) => ab.kind === "activated" && ab.fromGraveyard)),
        ),
      ),
      // « Vous pouvez regarder la carte du dessus de votre bibliothèque à tout moment » : Vizier of the Menagerie, et
      // toute permission de jouer depuis le dessus de la bibliothèque (famille C).
      ...((playerStatics(s, viewer, "playFrom").some(({ ab }) => ab.playFrom?.zone === "libraryTop") ||
        playerStatic(s, viewer, "lookAtTopCard")) &&
      s.players[viewer]?.library[0]
        ? [s.players[viewer]?.library[0] as string]
        : []),
    ].map((id) => withCastCost(s, viewer, objectView(s, id))),
    combat: s.combat
      ? { attackers: s.combat.attackers.map((a) => ({ id: a.id, defender: a.defender, blockers: [...a.blockers] })) }
      : null,
    pending,
    potentialAttackers: s.turn.active === viewer ? attackCandidates(s, viewer).length : 0,
    over: s.over,
    winner: s.winner,
  };
}

const HIDDEN_ZONES: ReadonlySet<Zone> = new Set(["hand", "library"]);

/**
 * Retire des événements les informations cachées au spectateur : cartes piochées par un autre joueur,
 * cartes d'un autre joueur déplacées d'une zone cachée à une autre (recherche vers la main, remise
 * dans la bibliothèque…).
 */
export function filterEvents(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    if (e.type === "draw" && e.player !== viewer) return { type: "draw", player: e.player };
    if (e.type === "moved" && e.owner !== viewer && HIDDEN_ZONES.has(e.from) && HIDDEN_ZONES.has(e.to)) {
      return { type: "moved", owner: e.owner, from: e.from, to: e.to };
    }
    // Exilée face cachée (406.3) : seuls les joueurs qui peuvent la regarder la voient passer.
    if (e.type === "moved" && e.faceDown && !e.faceDown.includes(viewer)) {
      return { type: "moved", owner: e.owner, objectId: e.objectId, from: e.from, to: e.to };
    }
    // Présage : la carte exilée n'est connue que de son propriétaire.
    if (e.type === "foretold" && e.player !== viewer) return { type: "foretold", player: e.player, defId: HIDDEN_CARD_ID };
    return e;
  });
}

const DEF_KEYS = new Set(["defId", "sourceDefId", "targetDefId", "attackerDefId", "blockerDefId", "toDefId"]);

/** Identifiants de définitions cités dans une valeur JSON (vue, événements). */
function collectDefIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectDefIds(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (DEF_KEYS.has(k) && typeof v === "string") {
        out.add(v);
      } else if (k === "defIds" && Array.isArray(v)) {
        for (const d of v) if (typeof d === "string") out.add(d);
      } else {
        collectDefIds(v, out);
      }
    }
  }
}

/**
 * Faces des cartes que le spectateur a le droit de connaître : celles citées par sa vue et ses
 * événements filtrés (jamais la decklist adverse entière).
 */
export function visibleFaces(s: GameState, view: GameView, events: GameEvent[]): Record<string, CardFace> {
  const ids = new Set<string>();
  collectDefIds(view, ids);
  collectDefIds(events, ids);
  const out: Record<string, CardFace> = {};
  for (const id of ids) {
    const d = s.defs[id];
    if (d) out[id] = cardFace(d);
    else if (id === HIDDEN_CARD_ID)
      out[id] = { defId: id, name: "", typeLine: "Carte face cachée", manaCost: "", text: "", implemented: true, isToken: false };
  }
  return out;
}

/** Coût à payer pour lancer cette carte, s'il diffère du coût imprimé (affiché sur la carte dans la main). */
function withCastCost(s: GameState, player: PlayerId, v: ObjectView): ObjectView {
  const o = s.objects[v.id];
  const d = o ? s.defs[o.defId] : undefined;
  if (!o || !d?.manaCost || d.types.includes("Land")) return v;
  const terms = castTerms(s, player, v.id);
  if (!terms) return v;
  const flashback = terms.source === "flashback";
  let cost = spellCost(s, player, d, {
    flashback,
    mayhem: terms.mayhem,
    costOverride: terms.costOverride,
    fromZone: terms.source,
    free: terms.free,
    card: v.id,
  });
  if (terms.extraCost) cost = totalCost(cost, 0, { generic: terms.extraCost, colored: {}, x: 0 });
  // Le X reste à choisir : il est affiché tel quel.
  const shown = { ...cost, x: terms.free ? 0 : ((flashback ? d.flashback : d.manaCost)?.x ?? 0) };
  const text = costToText(shown);
  if (text === costToText(d.manaCost)) return v;
  return { ...v, castCost: { text, delta: manaValue(shown) - manaValue(d.manaCost) } };
}
