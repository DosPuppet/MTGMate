/**
 * Événements du moteur → effets sonores (fonction pure, testée) : quel son, et quand.
 * Les délais suivent ceux des effets visuels de playEffects (store.ts) : un pas de 0,22 s par blessure,
 * gain de PV ou mort, pour que le coup s'entende au moment où le flash s'affiche.
 */
import type { CardFace, GameEvent, GameView } from "@mtgx/engine";
import type { SoundKey } from "./sounds";

export interface Cue {
  key: SoundKey;
  /** Secondes après la réception de la mise à jour. */
  delay: number;
  /** Multiplicateur de volume (piles de sons regroupées : un peu plus fort). */
  gain: number;
}

const STEP = 0.22;
const MAX_DELAY = 2.2;
/** Au-delà, une série du même son (12 jetons qui meurent) est jouée une seule fois, plus fort. */
const MAX_REPEAT = 3;

const PERMANENT_TYPES = /\b(Creature|Artifact|Enchantment|Planeswalker|Battle|Land)\b/;

export function soundsFor(events: GameEvent[], view: GameView, prev: GameView | null, faces: Record<string, CardFace>): Cue[] {
  const cues: Cue[] = [];
  let step = 0;
  const at = () => Math.min(step * STEP, MAX_DELAY);
  const add = (key: SoundKey) => cues.push({ key, delay: at(), gain: 1 });
  // Les sons liés à un effet visuel avancent d'un pas, comme playEffects.
  const addStep = (key: SoundKey) => {
    add(key);
    step += 1;
  };
  const me = view.viewer;

  for (const e of events) {
    switch (e.type) {
      case "gameStart":
        add("shuffle");
        break;
      case "mulligan":
        if (e.player === me) add("shuffle");
        break;
      case "turnStart":
        if (e.player === me) add("turn");
        break;
      case "draw":
        if (e.player === me) add("draw");
        break;
      case "playLand":
        add("land");
        break;
      case "cast":
      case "copy":
        add("cast");
        break;
      case "activate":
      case "trigger":
        add("ability");
        break;
      case "resolve": {
        // Seul un sort de permanent « se pose » : les autres sorts s'entendent par leurs effets.
        const item = prev?.stack.find((i) => i.id === e.stackId);
        const face = faces[e.defId];
        const permanent = face && PERMANENT_TYPES.test(face.typeLine) && !/\b(Instant|Sorcery)\b/.test(face.typeLine);
        if (item?.kind === "spell" && permanent) add("resolve");
        break;
      }
      case "countered":
      case "fizzle":
        add("counter");
        break;
      case "attack":
        if (e.attackers.length) add("attack");
        break;
      case "block":
        if (e.blocks.length) add("block");
        break;
      case "damage":
        // Blessures aux joueurs : entendues par l'événement « life » qui suit.
        if (e.targetDefId && e.amount > 0) addStep(e.amount >= 5 ? "hitHeavy" : "hit");
        break;
      case "life":
        if (e.delta < 0) addStep("hitHeavy");
        else if (e.delta > 0) addStep("heal");
        break;
      case "dies":
        addStep("dies");
        break;
      case "token":
        add("token");
        break;
      case "attach":
        add("attach");
        break;
      case "poison":
        add("poison");
        break;
      case "gameOver":
        add(e.winner === me ? "win" : "lose");
        break;
    }
  }

  // Vos terrains qui viennent d'être engagés (paiement du mana) : aucun événement moteur, on compare les vues.
  if (prev) {
    const wasUntapped = new Set(prev.battlefield.filter((o) => !o.tapped).map((o) => o.id));
    const tapped = view.battlefield.filter(
      (o) => o.controller === me && o.tapped && o.types.includes("Land") && wasUntapped.has(o.id),
    );
    if (tapped.length) cues.unshift({ key: "tap", delay: 0, gain: 1 });
  }

  return collapse(cues);
}

/** Une série de plus de MAX_REPEAT sons identiques devient un seul son, un peu plus fort. */
function collapse(cues: Cue[]): Cue[] {
  const counts = new Map<SoundKey, number>();
  for (const c of cues) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  const seen = new Set<SoundKey>();
  const out: Cue[] = [];
  for (const c of cues) {
    if ((counts.get(c.key) ?? 0) <= MAX_REPEAT) out.push(c);
    else if (!seen.has(c.key)) {
      seen.add(c.key);
      out.push({ ...c, gain: 1.3 });
    }
  }
  return out;
}
