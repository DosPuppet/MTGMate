/**
 * Reality Fracture, lot F : cartes uniques (F/E variables, taxes, remplacements, durées « jusqu'à votre
 * prochain tour », hybride monocolore, loyauté −X, combat selon l'endurance…).
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, dealDamage, destroy, sourceFromObject } from "../src/actions";
import { legalActions } from "../src/legal";
import { canPay, manaValue, parseManaCost } from "../src/mana";
import { spellCost } from "../src/stack";
import { chars, moveObject } from "../src/state";
import { addPlayerEffect } from "../src/statics";
import { combatPower, declareAttackers } from "../src/turn";
import type { GameState } from "../src/types";
import { objectView } from "../src/view";
import { act, castNowOf, idOf, idsOf, passAccepting, passBoth, scenario, untilCastNow } from "./helpers";

type S = GameState;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const castOption = (s: S, name: string) =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
const walkerAbility = (s: S, id: string, label: string) =>
  chars(s, id).abilities.findIndex((ab) => ab.kind === "activated" && !!ab.label?.includes(label));

describe("Reality Fracture, lot F", () => {
  it("Tarmogoyf : types de cartes dans tous les cimetières (+1 en endurance)", () => {
    const s = scenario({
      p1: { battlefield: ["Tarmogoyf"], graveyard: ["Forest", "Bear Cub"] },
      p2: { graveyard: ["Giant Growth"] },
    });
    const goyf = idOf(s, "p1", "battlefield", "Tarmogoyf");
    expect(chars(s, goyf).power).toBe(3);
    expect(chars(s, goyf).toughness).toBe(4);
  });

  it("Thalia, the Survivor : les sorts non-créature adverses coûtent {1} de plus", () => {
    const s = scenario({ p1: { battlefield: ["Thalia, the Survivor"] } });
    expect(spellCost(s, "p2", card("Giant Growth"), {}).generic).toBe(1);
    expect(spellCost(s, "p2", card("Bear Cub"), {}).generic).toBe(1); // {1}{G} : inchangé
    expect(spellCost(s, "p1", card("Giant Growth"), {}).generic).toBe(0);
  });

  it("Ghalta the Immovable : réduction, attaque malgré le défenseur, blessures selon l'endurance", () => {
    const s = scenario({
      p1: { battlefield: ["Surveillance Phantasm", "Ghalta the Immovable"], hand: [] },
    });
    const phantasm = idOf(s, "p1", "battlefield", "Surveillance Phantasm");
    const ghalta = idOf(s, "p1", "battlefield", "Ghalta the Immovable");
    expect(chars(s, phantasm).keywords).toContain("defender");
    expect(combatPower(s, ghalta)).toBe(7); // 0/7
    expect(combatPower(s, phantasm)).toBe(Math.max(chars(s, phantasm).power, chars(s, phantasm).toughness));
    // Coût : {8}{W} moins la plus grande endurance (7).
    const t = scenario({ p1: { battlefield: ["Ghalta the Immovable"], hand: ["Ghalta the Immovable"] } });
    expect(spellCost(t, "p1", card("Ghalta the Immovable"), {}).generic).toBe(1);
  });

  it("Loot, the Anomaly : une force négative blesse comme si elle était positive", () => {
    const s = scenario({ p1: { battlefield: ["Loot, the Anomaly"] } });
    const loot = idOf(s, "p1", "battlefield", "Loot, the Anomaly");
    expect(chars(s, loot).power).toBe(-2);
    expect(combatPower(s, loot)).toBe(2);
  });

  it("Yoshimaru : un marqueur +1/+1 de plus ; Draconic Visitor : Trésors → Dragons", () => {
    let s = scenario({ p1: { battlefield: ["Yoshimaru, Beloved Companion", "Bear Cub", ...lands("Plains", 6)] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", {
      type: "activate",
      source: idOf(s, "p1", "battlefield", "Yoshimaru, Beloved Companion"),
      ability: 1,
      targets: { t: [idOf(s, "p1", "battlefield", "Yoshimaru, Beloved Companion")] },
    });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Yoshimaru, Beloved Companion")]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
    const t = scenario({ p1: { battlefield: ["Draconic Visitor"] } });
    const [token] = createTokens(t, "p1", { name: "Treasure", colors: [], types: ["Artifact"], subtypes: ["Treasure"] }, 1);
    expect(chars(t, token as string).name).toBe("Dragon");
    expect(chars(t, token as string).power).toBe(5);
  });

  it("Tomik, Izzet Sparkmage : +1 aux blessures non de combat infligées à un adversaire", () => {
    const s = scenario({ p1: { battlefield: ["Tomik, Izzet Sparkmage", "Fanatical Firebrand"] } });
    const src = sourceFromObject(s, idOf(s, "p1", "battlefield", "Fanatical Firebrand"));
    dealDamage(s, src, "p2", 1, false);
    expect(s.players.p2?.life).toBe(18);
    dealDamage(s, src, "p2", 1, true);
    expect(s.players.p2?.life).toBe(17);
  });

  it("Garruk, Veiled Butcher : les créatures adverses sont exilées au lieu de mourir", () => {
    const s = scenario({ p1: { battlefield: ["Garruk, Veiled Butcher", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });

  it("Garruk, Veiled Butcher +2 : -4/-1 jusqu'au prochain tour de son contrôleur", () => {
    let s = scenario({ p1: { battlefield: ["Garruk, Veiled Butcher"] }, p2: { battlefield: ["Serra Angel"] } });
    const garruk = idOf(s, "p1", "battlefield", "Garruk, Veiled Butcher");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "activate", source: garruk, ability: walkerAbility(s, garruk, "-4/-1"), targets: { t: [angel] } });
    s = passBoth(s);
    expect(chars(s, angel).power).toBe(0);
    // Tour de l'adversaire : l'effet dure encore ; il cesse au début du tour suivant de p1.
    s = passUntilTurn(s, "p2");
    expect(chars(s, angel).power).toBe(0);
    s = passUntilTurn(s, "p1");
    expect(chars(s, angel).power).toBe(4);
  });

  it("Jace, Reality Sculptor −3 : emblème temporaire, disparu au prochain tour de son contrôleur", () => {
    let s = scenario({ p1: { battlefield: ["Jace, Reality Sculptor"] } });
    const jace = idOf(s, "p1", "battlefield", "Jace, Reality Sculptor");
    s = act(s, "p1", { type: "activate", source: jace, ability: walkerAbility(s, jace, "-5/-0") });
    s = passBoth(s);
    expect(s.players.p1?.command).toHaveLength(1);
    s = passUntilTurn(s, "p2");
    expect(s.players.p1?.command).toHaveLength(1);
    s = passUntilTurn(s, "p1");
    expect(s.players.p1?.command).toHaveLength(0);
  });

  it("Karn, Argent Defender : l'arrivée des créatures ne déclenche rien", () => {
    let s = scenario({ p1: { battlefield: ["Karn, Argent Defender", ...lands("Mountain", 4)], hand: ["Viashino Pyromancer"] } });
    s = cast(s, "p1", "Viashino Pyromancer");
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Viashino Pyromancer")).toHaveLength(1);
    expect(s.stack).toHaveLength(0);
    expect(s.pending?.kind).toBe("priority");
    expect(s.players.p2?.life).toBe(20);
  });

  it("hybride monocolore : Karn, Gilded Guardian vaut 10 et se paie en génériques", () => {
    const cost = parseManaCost("{2/W}{2/U}{2/B}{2/R}{2/G}");
    expect(manaValue(cost)).toBe(10);
    const s = scenario({ p1: { battlefield: lands("Mountain", 7) } });
    expect(canPay(s, "p1", cost)).toBe(false);
    const t = scenario({ p1: { battlefield: [...lands("Mountain", 8), "Plains"] } });
    expect(canPay(t, "p1", cost)).toBe(true); // {W} + 4 × {2}
  });

  it("Omnipresence : gratuit si la valeur de mana ne dépasse pas le nombre de créatures", () => {
    const s = scenario({
      p1: { battlefield: ["Omnipresence", "Bear Cub", "Llanowar Elves"], hand: ["Serra Angel", "Bear Cub"] },
    });
    const bear = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idsOf(s, "p1", "hand", "Bear Cub")[0]);
    expect(bear?.type === "cast" && bear.freeAvailable).toBe(true);
    expect(castOption(s, "Serra Angel")).toBeUndefined(); // valeur de mana 5, pas de terrain
  });

  it("Break Under Pressure : l'adversaire sacrifie sa créature de plus grande valeur de mana", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Break Under Pressure"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    s = cast(s, "p1", "Break Under Pressure", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Kindred Judgment : détruit les créatures qui ne sont pas du type choisi", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 7), "Llanowar Elves"], hand: ["Kindred Judgment"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    s = cast(s, "p1", "Kindred Judgment");
    s = passBoth(s);
    expect(s.pending?.kind).toBe("choice");
    s = act(s, "p1", { type: "choose", values: ["Elf"] });
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Fatehold Charm : renvoie un sort dans la main de son propriétaire", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] },
      p2: { battlefield: ["Plains", "Island"], hand: ["Fatehold Charm"] },
    });
    s = cast(s, "p1", "Bear Cub");
    const spellId = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Fatehold Charm"), mode: 1, targets: { t: [spellId] } });
    s = passBoth(s);
    expect(s.stack).toHaveLength(0);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Chandra, Chill of Compliance −X : X marqueurs d'étourdissement", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Chill of Compliance"] }, p2: { battlefield: ["Serra Angel"] } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Chill of Compliance");
    const index = walkerAbility(s, chandra, "étourdissement");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === chandra && a.ability === index);
    expect(opt?.type === "activate" && opt.xMax).toBe(3);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "activate", source: chandra, ability: index, x: 2, targets: { t: [angel] } });
    expect(s.objects[chandra]?.counters.loyalty).toBe(1);
    s = passBoth(s);
    expect(s.objects[angel]?.counters.stun).toBe(2);
    expect(s.objects[angel]?.tapped).toBe(true);
  });

  it("Molten Tide : chaque Montagne produit un {R} de plus ce tour-ci", () => {
    let s = scenario({ p1: { battlefield: ["Mountain"] } });
    addPlayerEffect(
      s,
      "p1",
      { replacement: { event: "mana", to: "you", source: { subtype: "Mountain" }, modify: { add: 1 } } },
      s.turn.number,
    );
    s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Mountain"), ability: 0 });
    expect(s.players.p1?.manaPool.R).toBe(2);
  });

  it("Yuriko : pas de sorts pendant le combat ; Tomik, Orzhov Lawmage : un seul attaquant par planeswalker", () => {
    const s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Yuriko, Blade of the Mighty"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Tomik, Orzhov Lawmage", "Garruk, Curse Breaker"] },
      step: "declareAttackers",
    });
    const walker = idOf(s, "p2", "battlefield", "Garruk, Curse Breaker");
    expect(() =>
      declareAttackers(s, "p1", [
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: walker },
        { id: idOf(s, "p1", "battlefield", "Llanowar Elves"), defender: walker },
      ]),
    ).toThrow();
    expect(legalActions(s, "p1").some((a) => a.type === "cast")).toBe(false);
  });
});

/** Passe la priorité (et accepte les choix suggérés, sans attaquer) jusqu'au début du tour de `p`. */
function passUntilTurn(s: S, p: string): S {
  let cur = s;
  const start = cur.turn.number;
  for (let i = 0; i < 400 && !(cur.turn.active === p && cur.turn.number > start); i++) {
    const pend = cur.pending;
    if (!pend) break;
    if (pend.kind === "priority") cur = act(cur, pend.player, { type: "pass" });
    else if (pend.kind === "declareAttackers") cur = act(cur, pend.player, { type: "declareAttackers", attackers: [] });
    else if (pend.kind === "declareBlockers") cur = act(cur, pend.player, { type: "declareBlockers", blocks: [] });
    else if (pend.kind === "discard") {
      const hand = cur.players[pend.player]?.hand ?? [];
      cur = act(cur, pend.player, { type: "discard", cards: hand.slice(0, hand.length - 7) });
    } else if (pend.kind === "choice") cur = act(cur, pend.player, { type: "choose", values: pend.request.suggested });
    else break;
  }
  return cur;
}

describe("Reality Fracture, lot 0.1 (Standard) : Emrakul, Uldaros Theorix, Hall of Echoes", () => {
  it("Emrakul : « quand vous lancez ce sort, dégagez tous vos terrains »", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 10), hand: ["Emrakul, the Exigent Doom"] } });
    s = cast(s, "p1", "Emrakul, the Exigent Doom");
    expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => s.objects[id]?.tapped)).toBe(true);
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "pass" }); // le déclencheur se résout
    expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => !s.objects[id]?.tapped)).toBe(true);
    expect(s.stack).toHaveLength(1);
  });

  it("Emrakul : garde « sacrifiez trois permanents » lue dans le texte", () => {
    expect(card("Emrakul, the Exigent Doom").ward).toEqual({ sacrifice: 3 });
  });

  it("Emrakul depuis la main : le terrain gagne {C}{C} tant que la carte reste exilée, lançable depuis l'exil", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Emrakul, the Exigent Doom"] } });
    const emrakul = idOf(s, "p1", "hand", "Emrakul, the Exigent Doom");
    const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
    const index = card("Emrakul, the Exigent Doom").abilities.findIndex((a) => a.kind === "activated" && a.fromHand);
    s = act(s, "p1", { type: "activate", source: emrakul, ability: index, targets: { t: [land] } });
    s = passBoth(s);
    const exiled = s.exile.find((id) => s.objects[id]?.defId === card("Emrakul, the Exigent Doom").id) as string;
    expect(exiled).toBeDefined();
    expect(chars(s, land).abilities.some((a) => a.kind === "mana" && a.amount === 2)).toBe(true);
    expect(s.playPermissions?.some((p) => p.card === exiled && p.until > 1000)).toBe(true);
    // Quand la carte quitte l'exil sans être lancée, le terrain perd la capacité.
    const moved = structuredClone(s);
    moveObject(moved, exiled, "graveyard");
    expect(chars(moved, land).abilities.some((a) => a.kind === "mana" && a.amount === 2)).toBe(false);
  });

  it("Emrakul lancée depuis l'exil : la capacité du terrain sert à payer, puis cesse une fois le sort lancé (601.2i)", () => {
    // {10} : 8 Forêts plus le {C}{C} du terrain désigné (12 Forêts, dont 3 engagées pour la capacité).
    let s = scenario({ p1: { battlefield: lands("Forest", 12), hand: ["Emrakul, the Exigent Doom"] } });
    const emrakul = idOf(s, "p1", "hand", "Emrakul, the Exigent Doom");
    const land = idsOf(s, "p1", "battlefield", "Forest").at(-1) as string;
    const index = card("Emrakul, the Exigent Doom").abilities.findIndex((a) => a.kind === "activated" && a.fromHand);
    s = act(s, "p1", { type: "activate", source: emrakul, ability: index, targets: { t: [land] } });
    s = passBoth(s);
    const exiled = s.exile.find((id) => s.objects[id]?.defId === card("Emrakul, the Exigent Doom").id) as string;
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === exiled)).toBe(true);
    s = act(s, "p1", { type: "cast", card: exiled });
    expect(s.stack.some((x) => x.kind === "spell" && s.objects[x.id]?.defId === card("Emrakul, the Exigent Doom").id)).toBe(true);
    expect(chars(s, land).abilities.some((a) => a.kind === "mana" && a.amount === 2)).toBe(false);
  });

  it("Uldaros Theorix : exile et copie, les copies se lancent gratuitement et deviennent des jetons", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), ...lands("Swamp", 4)],
        hand: ["Uldaros Theorix"],
        graveyard: ["Bear Cub", "Giant Growth", "Serra Angel"],
      },
    });
    s = cast(s, "p1", "Uldaros Theorix");
    s = passBoth(s); // Uldaros arrive ; son déclencheur demande ses cibles
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const growth = idOf(s, "p1", "graveyard", "Giant Growth");
    while (s.pending?.kind === "choice") {
      const req = s.pending.request;
      if (req.intent === "triggerTarget") {
        const want = (req as { options: string[] }).options.find((o) => o === bear || o === growth);
        s = act(s, "p1", { type: "choose", values: want ? [want] : [] });
      } else break;
    }
    // Valeur de mana totale 3 (≤ 6) : pas de question, les deux cartes sont copiées et proposées pendant la résolution.
    s = untilCastNow(s);
    const copies = s.exile.filter((id) => s.objects[id]?.cardCopy);
    expect(copies).toHaveLength(2);
    expect([...(castNowOf(s)?.cards ?? [])].sort()).toEqual([...copies].sort());
    const bearCopy = copies.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub") as string;
    s = act(s, "p1", { type: "cast", card: bearCopy, free: true });
    // La copie de Giant Growth est encore proposée ; refusée, elle cesse d'exister (707.12).
    expect(castNowOf(s)?.cards).toHaveLength(1);
    s = act(s, "p1", { type: "pass" });
    expect(s.exile.filter((id) => s.objects[id]?.cardCopy)).toHaveLength(0);
    s = passBoth(s);
    const tokens = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(tokens).toHaveLength(1);
    expect(s.objects[tokens[0] as string]?.isToken).toBe(true);
  });

  it("Hall of Echoes : devient une copie jusqu'à la fin du tour ; pas de règle des légendes", () => {
    let s = scenario({ p1: { battlefield: ["Hall of Echoes", ...lands("Plains", 5), "Thalia, the Survivor"] } });
    const hall = idOf(s, "p1", "battlefield", "Hall of Echoes");
    const thalia = idOf(s, "p1", "battlefield", "Thalia, the Survivor");
    s = act(s, "p1", { type: "activate", source: hall, ability: 1, targets: { t: [thalia] } });
    s = passBoth(s);
    expect(chars(s, hall).name).toBe("Thalia, the Survivor");
    expect(chars(s, hall).types).toEqual(["Creature"]);
    expect(chars(s, hall).power).toBe(3);
    expect(chars(s, hall).keywords).toContain("lifelink");
    // Deux Thalia : la règle des légendes ne s'applique pas ce tour-ci.
    expect(s.pending?.kind).toBe("priority");
    expect(idsOf(s, "p1", "battlefield", "Hall of Echoes")).toHaveLength(1);
    // L'interface affiche la face copiée.
    expect(objectView(s, hall).defId).toBe(card("Thalia, the Survivor").id);
  });

  describe("Chandra, Torch of Defiance +1 : lancer la carte exilée pendant la résolution (608.2g)", () => {
    const plusOne = (top: string, castIt: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Chandra, Torch of Defiance", ...lands("Mountain", 1)], library: [top, "Forest"] },
      });
      const chandra = idOf(s, "p1", "battlefield", "Chandra, Torch of Defiance");
      s = act(s, "p1", { type: "activate", source: chandra, ability: 0 });
      s = untilCastNow(s);
      const now = castNowOf(s);
      if (now && castIt) s = act(s, "p1", { type: "cast", card: now.cards[0] as string, targets: { t: ["p2"] } });
      else if (now) s = act(s, "p1", { type: "pass" });
      return { s: passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority"), asked: !!now };
    };

    it("un sort lancé en payant son coût : pas de blessures de Chandra", () => {
      const { s, asked } = plusOne("Burst Lightning", true);
      expect(asked).toBe(true);
      // Burst Lightning (payé avec la Montagne) : 2 blessures ; Chandra n'en inflige pas.
      expect(s.players.p2?.life).toBe(18);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(1);
    });

    it("sort refusé : 2 blessures à chaque adversaire, la carte reste en exil", () => {
      const { s } = plusOne("Burst Lightning", false);
      expect(s.players.p2?.life).toBe(18);
      expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Burst Lightning")).toBe(true);
      expect(s.playPermissions ?? []).toHaveLength(0);
    });

    it("un terrain ne peut pas être lancé : pas de question, 2 blessures", () => {
      const { s, asked } = plusOne("Forest", true);
      expect(asked).toBe(false);
      expect(s.players.p2?.life).toBe(18);
    });
  });
});
