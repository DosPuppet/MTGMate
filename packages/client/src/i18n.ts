/** Libellés français et mise en forme du journal. */
import type { CardFace, GameEvent, GameView, Keyword, Step } from "@mtgx/engine";

export type Lang = "fr" | "en";

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
  indestructible: "Indestructible",
  prowess: "Prouesse",
  ward: "Garde",
  protectionFromEverything: "Protection contre tout",
  hexproofFromInstants: "Défense talismanique contre les éphémères",
  hexproofFromBlack: "Défense talismanique contre le noir",
  hexproofFromWhite: "Défense talismanique contre le blanc",
  changeling: "Changelin",
  cantBeBlockedByHumans: "Imblocable par les Humains",
  cantBeBlockedByPowerLE2: "Imblocable par les créatures de force 2 ou moins",
  mustBeBlocked: "Doit être bloquée",
  cantBlock: "Ne peut pas bloquer",
  cantAttack: "Ne peut pas attaquer",
  unblockable: "Ne peut pas être bloquée",
  mustAttack: "Attaque à chaque combat",
  doesntUntap: "Ne se dégage pas",
  cantBeBlockedByWalls: "Imblocable par les Murs",
  convoke: "Convocation",
};

export function faceName(face: CardFace | undefined, lang: Lang): string {
  if (!face) return "?";
  if (face.isToken) return `jeton ${face.name}`;
  return (lang === "fr" && face.fr?.name) || face.name;
}

export function faceText(face: CardFace, lang: Lang): string {
  return (lang === "fr" && face.fr?.text) || face.text;
}

export function faceType(face: CardFace, lang: Lang): string {
  return (lang === "fr" && face.fr?.typeLine) || face.typeLine;
}

export function faceImage(face: CardFace, lang: Lang): string | undefined {
  return (lang === "fr" && face.fr?.image) || face.image;
}

export interface LogLine {
  id: number;
  text: string;
  kind: "turn" | "me" | "opp" | "info" | "win" | "lose";
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
  const name = (defId?: string) => faceName(defId ? faces[defId] : undefined, lang);
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
    return o ? faceName(o, lang) : "une cible";
  };
  const out: LogLine[] = [];
  const add = (text: string, k: LogLine["kind"]) => out.push({ id: nextLine++, text, kind: k });
  for (const e of events) {
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
      case "attach":
        add(`${name(e.defId)} est attaché à ${name(e.toDefId)}.`, "info");
        break;
      case "countered":
        add(`${name(e.defId)} est contrecarré par ${name(e.by)}.`, "info");
        break;
      case "damage":
        add(`${name(e.sourceDefId)} inflige ${e.amount} à ${e.targetDefId ? name(e.targetDefId) : whom(e.target)}.`, "info");
        break;
      case "life":
        if (e.delta > 0)
          add(`${who(e.player)} ${e.player === me ? "gagnez" : "gagne"} ${e.delta} PV (${e.life}).`, kind(e.player));
        break;
      case "dies":
        add(`${name(e.defId)} va au cimetière.`, "info");
        break;
      case "token":
        add(`${who(e.controller)} ${e.controller === me ? "créez" : "crée"} un ${name(e.defId)}.`, kind(e.controller));
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
      case "lose":
        add(
          `${who(e.player)} ${e.player === me ? "perdez" : "perd"}${e.reason === "concede" ? " (abandon)" : ""}.`,
          kind(e.player),
        );
        break;
      case "moved": {
        const where: Record<string, string> = {
          hand: "retourne dans la main de son propriétaire",
          exile: "est exilé",
          graveyard: "va au cimetière",
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
      case "gameOver":
        add(e.winner === me ? "Victoire !" : e.winner ? "Défaite." : "Match nul.", e.winner === me ? "win" : "lose");
        break;
      default:
        break;
    }
  }
  return out;
}
