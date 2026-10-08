/** Libellés français et mise en forme du journal. */

import { tokenImage } from "@mtgx/cards";
import { type CardFace, type GameEvent, type GameView, HIDDEN_CARD_ID, type Keyword, type Step } from "@mtgx/engine";
import { customImage, imageUrl } from "./images";
import { type Lang, localize } from "./translate";

export type { Lang } from "./translate";

export const STEP_LABEL: Record<Step, string> = {
  untap: "Dégagement",
  upkeep: "Entretien",
  draw: "Pioche",
  main1: "Phase principale 1",
  beginCombat: "Début du combat",
  declareAttackers: "Déclaration des attaquants",
  declareBlockers: "Déclaration des bloqueurs",
  firstStrikeDamage: "Blessures d'initiative",
  combatDamage: "Blessures de combat",
  endCombat: "Fin du combat",
  main2: "Phase principale 2",
  end: "Étape de fin",
  cleanup: "Nettoyage",
};

/** Étapes affichées dans la barre des phases (libellé court). */
export const PHASE_BAR: { step: Step; short: string }[] = [
  { step: "upkeep", short: "Entretien" },
  { step: "draw", short: "Pioche" },
  { step: "main1", short: "Princ. 1" },
  { step: "beginCombat", short: "Combat" },
  { step: "declareAttackers", short: "Attaque" },
  { step: "declareBlockers", short: "Blocage" },
  { step: "combatDamage", short: "Dégâts" },
  { step: "endCombat", short: "Fin comb." },
  { step: "main2", short: "Princ. 2" },
  { step: "end", short: "Fin" },
];

/** Raison d'une défaite, ajoutée au journal (« Bob perd (10 marqueurs poison). »). */
/** Plafonds de sécurité du moteur (`engine/src/limits.ts`). */
const CAPS: Record<"tokens" | "amount" | "permutations" | "layers", string> = {
  tokens: "jetons",
  amount: "montant",
  permutations: "ordre des remplacements",
  layers: "dépendances de couches",
};

const LOSS_REASON: Record<"life" | "draw" | "poison" | "concede" | "commander", string> = {
  life: "",
  draw: " (bibliothèque vide)",
  poison: " (10 marqueurs poison)",
  concede: " (abandon)",
  commander: " (21 blessures d'un même commandant)",
};

export const KEYWORD_LABEL: Record<Keyword, string> = {
  flying: "Vol",
  reach: "Portée",
  firstStrike: "Initiative",
  doubleStrike: "Double initiative",
  deathtouch: "Contact mortel",
  lifelink: "Lien de vie",
  trample: "Piétinement",
  vigilance: "Vigilance",
  haste: "Célérité",
  menace: "Menace",
  defender: "Défenseur",
  flash: "Flash",
  hexproof: "Défense talismanique",
  shroud: "Défense totale",
  infect: "Infection",
  toxic: "Toxique",
  indestructible: "Indestructible",
  prowess: "Prouesse",
  ward: "Garde",
  changeling: "Changelin",
  wither: "Flétrissure",
  mustBeBlocked: "Doit être bloquée",
  damageHealsFirst: "Chaque blessure guérit les précédentes",
  cantBlock: "Ne peut pas bloquer",
  startYourEngines: "Start your engines!",
  decayed: "Décomposition",
  ascend: "Ascension",
  cantBeSacrificed: "Ne peut pas être sacrifié",
  cantBeSuspected: "Ne peut pas devenir suspecte",
  cantAttack: "Ne peut pas attaquer",
  unblockable: "Ne peut pas être bloquée",
  mustAttack: "Attaque à chaque combat",
  noActivatedAbilities: "Capacités activées bloquées",
  keepsDamage: "Blessures conservées",
  absorbsDamage: "Encaisse les blessures",
  convoke: "Convocation",
  improvise: "Improvisation",
  delve: "Cave",
  splitSecond: "Second partagé",
  rebound: "Rebond",
  riot: "Émeute",
  attacksDespiteDefender: "Attaque malgré le défenseur",
};

/**
 * An engine text (`msg`, `cardRef`) in the chosen language: template and values from the catalogs, cards by their name
 * in that language.
 */
export function localizeText(text: string, faces: Record<string, CardFace>, lang: Lang): string {
  return localize(text, lang, (id) => (faces[id] ? faceName(faces[id], lang) : lang === "fr" ? "cette carte" : "this card"));
}

export function faceName(face: CardFace | undefined, lang: Lang): string {
  if (!face) return "?";
  if (face.defId === "face-down") return lang === "fr" ? "Carte face cachée" : "Face-down card";
  if (face.isToken) return `jeton ${face.name}`;
  return (lang === "fr" && face.fr?.name) || face.name;
}

export function faceText(face: CardFace, lang: Lang): string {
  return (lang === "fr" && face.fr?.text) || face.text;
}

export function faceType(face: CardFace, lang: Lang): string {
  return (lang === "fr" && face.fr?.typeLine) || face.typeLine;
}

/**
 * Image d'une face : l'illustration personnelle si la face la demande (impression personnelle, jeton d'un deck qui en
 * utilise) et qu'il y en a une ; sinon celle de Scryfall (relayée si Scryfall est bloqué, voir images.ts).
 */
export function faceImage(face: CardFace, lang: Lang): string | undefined {
  const custom = face.customArt && face.defId !== HIDDEN_CARD_ID ? customImage(face.name, face.isToken) : undefined;
  if (custom) return custom;
  // Jeton : l'image d'un jeton Scryfall correspondant (data/tokens.json), sinon le cadre texte.
  return imageUrl((lang === "fr" && face.fr?.image) || face.image || (face.isToken ? tokenImage(face) : undefined));
}

export interface LogLine {
  id: number;
  text: string;
  kind: "turn" | "me" | "opp" | "info" | "win" | "lose";
  /** Cartes nommées dans la ligne : leur nom y est survolable (aperçu). */
  cards?: CardFace[];
}

let nextLine = 1;

/** Transforme les événements du moteur en lignes de journal lisibles. */
export function describeEvents(
  events: GameEvent[],
  view: GameView,
  faces: Record<string, CardFace>,
  lang: Lang,
  /** Vue précédente : permet de nommer les cibles mortes entre-temps. */
  previous?: GameView | null,
): LogLine[] {
  const me = view.viewer;
  const who = (p: string) => (p === me ? "Vous" : (view.players[p]?.name ?? "L'adversaire"));
  const whom = (p: string) => (p === me ? "vous" : (view.players[p]?.name ?? "l'adversaire"));
  const kind = (p: string): LogLine["kind"] => (p === me ? "me" : "opp");
  // Cartes citées par la ligne en cours (noms survolables dans le journal).
  let cited: CardFace[] = [];
  const cite = (f: CardFace | undefined) => {
    if (f && f.defId !== "face-down" && f.defId !== HIDDEN_CARD_ID && !cited.some((c) => c.defId === f.defId)) cited.push(f);
    return f;
  };
  const name = (defId?: string) => faceName(cite(defId ? faces[defId] : undefined), lang);
  const targetName = (id: string) => {
    if (view.players[id]) return whom(id);
    const o =
      view.battlefield.find((x) => x.id === id) ??
      previous?.battlefield.find((x) => x.id === id) ??
      view.stack.find((x) => x.id === id) ??
      previous?.stack.find((x) => x.id === id) ??
      Object.values(view.players)
        .flatMap((p) => p.graveyard)
        .find((x) => x.id === id);
    return o ? faceName(cite(faces[o.defId] ?? o), lang) : "une cible";
  };
  const out: LogLine[] = [];
  const add = (text: string, k: LogLine["kind"]) => {
    out.push({ id: nextLine++, text, kind: k, ...(cited.length ? { cards: cited } : {}) });
    cited = [];
  };
  // Blessures à un joueur : la perte de PV qui suit est la même (déjà dite par la ligne des blessures).
  let hurt: { player: string; amount: number } | null = null;
  for (const e of events) {
    cited = [];
    switch (e.type) {
      case "gameStart":
        add(`${who(e.startingPlayer)} commence${e.startingPlayer === me ? "z" : ""}.`, "info");
        break;
      case "mulligan":
        add(`${who(e.player)} ${e.player === me ? "faites" : "fait"} un mulligan (${e.count}).`, kind(e.player));
        break;
      case "keep":
        add(`${who(e.player)} ${e.player === me ? "gardez" : "garde"} ${e.handSize} cartes.`, kind(e.player));
        break;
      case "turnStart":
        add(`Tour ${e.turn} — ${e.player === me ? "à vous" : `${who(e.player)}`}`, "turn");
        break;
      case "draw":
        if (view.turn.number === 0) break; // mains de départ : pas de bruit dans le journal
        if (e.player === me && e.defId) add(`Vous piochez ${name(e.defId)}.`, "me");
        else if (e.player !== me) add(`${who(e.player)} pioche une carte.`, "opp");
        break;
      case "monarch":
        add(`${who(e.player)} ${e.player === me ? "devenez" : "devient"} le monarque.`, kind(e.player));
        break;
      case "playLand":
        add(`${who(e.player)} ${e.player === me ? "jouez" : "joue"} ${name(e.defId)}.`, kind(e.player));
        break;
      case "cast":
      case "activate": {
        const verb = e.type === "cast" ? (e.player === me ? "lancez" : "lance") : e.player === me ? "activez" : "active";
        const t = e.targets.length ? ` → ${e.targets.map(targetName).join(", ")}` : "";
        add(`${who(e.player)} ${verb} ${name(e.defId)}${t}.`, kind(e.player));
        break;
      }
      case "trigger": {
        const t = e.targets.length ? ` → ${e.targets.map(targetName).join(", ")}` : "";
        add(`Capacité déclenchée : ${name(e.defId)}${t}.`, kind(e.player));
        break;
      }
      case "fizzle":
        add(`${name(e.defId)} ne se résout pas : cibles illégales.`, "info");
        break;
      case "copy":
        add(`${name(e.defId)} est copié.`, kind(e.player));
        break;
      case "endTurn":
        add("Le tour se termine.", "info");
        break;
      case "plotted":
        add(`${who(e.player)} ${e.player === me ? "complotez" : "complote"} ${name(e.defId)}.`, kind(e.player));
        break;
      case "foretold":
        // La carte présagée d'un adversaire est cachée (exilée face cachée).
        add(
          `${who(e.player)} ${e.player === me ? "présagez" : "présage"} ${e.defId === HIDDEN_CARD_ID ? "une carte" : name(e.defId)}.`,
          kind(e.player),
        );
        break;
      case "speed":
        add(
          `${who(e.player)} ${e.player === me ? "passez" : "passe"} à la vitesse ${e.speed}${e.speed >= 4 ? " (maximale)" : ""}.`,
          kind(e.player),
        );
        break;
      case "turnControl":
        add(
          `${who(e.by)} ${e.by === me ? "contrôlez" : "contrôle"} ${e.combatOnly ? "la prochaine phase de combat" : "le tour"} de ${whom(e.player)}.`,
          "info",
        );
        break;
      case "attach":
        add(`${name(e.defId)} est attaché à ${name(e.toDefId)}.`, "info");
        break;
      case "countered":
        add(`${name(e.defId)} est contrecarré par ${name(e.by)}.`, "info");
        break;
      case "damage":
        add(`${name(e.sourceDefId)} inflige ${e.amount} à ${e.targetDefId ? name(e.targetDefId) : whom(e.target)}.`, "info");
        if (!e.targetDefId) hurt = { player: e.target, amount: e.amount };
        break;
      case "life":
        if (e.delta > 0)
          add(`${who(e.player)} ${e.player === me ? "gagnez" : "gagne"} ${e.delta} PV (${e.life}).`, kind(e.player));
        else if (e.delta < 0) {
          if (hurt && hurt.player === e.player && hurt.amount === -e.delta) hurt = null;
          else add(`${who(e.player)} ${e.player === me ? "perdez" : "perd"} ${-e.delta} PV (${e.life}).`, kind(e.player));
        }
        break;
      case "dies":
        // Un remplacement peut changer la destination : exilée au lieu de mourir, mélangée dans la bibliothèque.
        add(
          `${name(e.defId)} ${e.to === "exile" ? "est exilé à la place" : e.to === "library" ? "est mélangé dans la bibliothèque de son propriétaire" : "va au cimetière"}.`,
          "info",
        );
        break;
      case "token":
        add(`${who(e.controller)} ${e.controller === me ? "créez" : "crée"} un ${name(e.defId)}.`, kind(e.controller));
        break;
      case "transform":
        add(`Transformation : ${name(e.defId)}.`, "info");
        break;
      case "attack":
        add(
          `${who(e.player)} ${e.player === me ? "attaquez" : "attaque"} avec ${e.attackers.map((a) => name(a.defId)).join(", ")}.`,
          kind(e.player),
        );
        break;
      case "block":
        for (const b of e.blocks) add(`${name(b.blockerDefId)} bloque ${name(b.attackerDefId)}.`, kind(e.player));
        break;
      case "discard":
        add(`${who(e.player)} ${e.player === me ? "défaussez" : "défausse"} ${e.defIds.map(name).join(", ")}.`, kind(e.player));
        break;
      case "reveal":
        if (e.defIds.length)
          add(`${who(e.player)} ${e.player === me ? "révélez" : "révèle"} ${e.defIds.map(name).join(", ")}.`, kind(e.player));
        break;
      case "rad":
        add(
          e.amount > 0
            ? `${who(e.player)} ${e.player === me ? "recevez" : "reçoit"} ${e.amount} marqueur${e.amount > 1 ? "s" : ""} de radiation (${e.total}).`
            : `Radiation : ${who(e.player)} ${e.player === me ? "perdez" : "perd"} ${-e.amount} marqueur${e.amount < -1 ? "s" : ""} de radiation (${e.total}).`,
          kind(e.player),
        );
        break;
      case "poison":
        add(
          `${who(e.player)} ${e.player === me ? "recevez" : "reçoit"} ${e.amount} marqueur${e.amount > 1 ? "s" : ""} poison (${e.total}).`,
          kind(e.player),
        );
        break;
      case "dieRoll":
        add(`${who(e.player)} ${e.player === me ? "obtenez" : "obtient"} ${e.result} au dé à ${e.sides} faces.`, kind(e.player));
        break;
      case "lose":
        add(`${who(e.player)} ${e.player === me ? "perdez" : "perd"}${LOSS_REASON[e.reason]}.`, kind(e.player));
        break;
      case "moved": {
        // 702.26 : la sortie de phase et le retour en phase ne sont pas des changements de zone.
        if (e.to === "phasedOut" || e.from === "phasedOut") {
          add(`${name(e.defId)} ${e.to === "phasedOut" ? "sort de phase" : "revient en phase"}.`, "info");
          break;
        }
        const where: Record<string, string> = {
          hand: "retourne dans la main de son propriétaire",
          exile: "est exilé",
          graveyard: "va au cimetière",
          battlefield: "arrive sur le champ de bataille",
          library: "est mis dans la bibliothèque de son propriétaire",
          command: "retourne dans la zone de commandement",
        };
        if (!e.defId) {
          // Carte cachée d'un autre joueur (recherche vers la main, remise dans la bibliothèque…).
          add(`${who(e.owner)} met une carte ${e.to === "hand" ? "dans sa main" : "dans sa bibliothèque"}.`, "opp");
          break;
        }
        add(`${name(e.defId)} ${where[e.to] ?? `va en ${e.to}`}.`, "info");
        break;
      }
      case "scry":
        add(
          `${who(e.player)} ${e.player === me ? "regardez" : "regarde"} : ${e.top} au-dessus, ${e.bottom} au-dessous.`,
          kind(e.player),
        );
        break;
      case "capReached":
        add(`Plafond de sécurité atteint (${CAPS[e.cap]}) : le résultat est approché.`, "info");
        break;
      case "gameOver":
        add(e.winner === me ? "Victoire !" : e.winner ? "Défaite." : "Match nul.", e.winner === me ? "win" : "lose");
        break;
      default:
        break;
    }
  }
  return out;
}
