/**
 * Commander (pseudo-ensemble EDH, PLAN-E, E9) : tests de règles des sorts communs et des moteurs des decks Commander
 * (texte Oracle). Protection du joueur contre tout et total de PV qui ne peut pas changer (Teferi's Protection, The One
 * Ring), tuteurs, contresorts, destructions de masse, verso terrain d'une carte modale, doublement de jetons, drain.
 */
import { describe, expect, it } from "vitest";
import * as dsl from "../src/dsl";
import { bump, chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { payableLife, playerProtectedFrom } from "../src/statics";
import type { ActionOption, CardDef, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const { fx, ref, target } = dsl;
const SINK = "Sink into Stupor // Soporific Springs";

/** Rituel de test à {0} (cartes du moteur, pas du catalogue). */
const sorcery = (name: string, spell: CardDef["spell"]): CardDef =>
  customCard({ name, typeLine: "Sorcery", types: ["Sorcery"], spell });
const DRAIN = sorcery("Ponction d'essai", dsl.spell([], [fx.loseLife(3, ref.eachOpponent)]));
const BLAST = sorcery("Souffle d'essai", dsl.spell([], [fx.damage(3, ref.eachOpponent)]));
const GIFT = sorcery("Don d'essai", dsl.spell([], [fx.gainLife(3, ref.eachPlayer)]));
const REANIMATE = sorcery(
  "Retour d'essai",
  dsl.spell([target.cardInGraveyard("t", { types: ["Artifact"] })], [fx.toBattlefield(ref.target())]),
);

const castOptions = (s: GameState, player: PlayerId, card: ObjectId) =>
  legalActions(s, player).filter((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activateOption = (s: GameState, player: PlayerId, source: ObjectId) =>
  legalActions(s, player).find(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Active la (première) capacité proposée de cette source. */
function activate(s: GameState, player: PlayerId, source: ObjectId, targets?: Record<string, string[]>): GameState {
  const o = activateOption(s, player, source);
  if (!o) throw new Error("aucune capacité à activer");
  return act(s, player, { type: "activate", source, ability: o.ability, targets });
}
const tokens = (s: GameState, player: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === player && nameOf(s, id) === name);
const handNames = (s: GameState, player: PlayerId) => namesIn(s, s.players[player]?.hand).sort();
/** Choisit le mode dont le libellé est donné (capacité déclenchée modale). */
const modeNamed = (label: string) => (req: ChoiceRequest) =>
  req.type === "pick" && req.intent === "triggerMode"
    ? Object.entries(req.labels ?? {})
        .filter(([, l]) => l === label)
        .map(([k]) => k)
    : undefined;
/** p2 lance un Shock sur p1, puis p1 a la priorité. */
const shockP1 = (s: GameState) => {
  const t = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
  return act(t, "p2", { type: "pass" });
};

describe("Commander (EDH) : sorts communs et moteurs (E9)", () => {
  describe("Teferi's Protection", () => {
    it("jusqu'à votre prochain tour : ni ciblé, ni blessé, ni perte ni gain de PV ; vos permanents sortent de phase ; exilé", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Teferi's Protection"] },
        p2: { battlefield: ["Mountain", "Savannah Lions"], hand: ["Shock", DRAIN, BLAST, GIFT] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "pass" });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teferi's Protection") }));
      expect(exiled(s, "Teferi's Protection")).toHaveLength(1);
      expect(s.objects[bear]?.zone).toBe("phasedOut");
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p1")).toEqual([]);
      // Protection contre tout : pas de cible (même pour ses propres sorts), blessures prévenues.
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(true);
      expect(playerProtectedFrom(s, "p1", "p1")).toBe(true);
      expect(() => act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } })).toThrow();
      for (const name of [DRAIN.name, BLAST.name, GIFT.name])
        s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", name) }));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(23);
      // Les créatures peuvent toujours attaquer ce joueur ; les blessures de combat sont prévenues.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Savannah Lions"), defender: "p1" }],
      });
      s = throughCombat(s);
      expect(s.players.p1?.life).toBe(20);
      // Au prochain tour de p1 : retour en phase (avant le dégagement), fin de la protection.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.objects[bear]?.zone).toBe("battlefield");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(false);
      expect(payableLife(s, "p1")).toBe(20);
    });

    it("« votre total de PV ne peut pas changer » : aucun paiement de PV au-delà de 0 (119.8)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 6)], hand: ["Teferi's Protection", "Toxic Deluge"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      // Le mana des Marais reste dans la réserve quand ils sortent de phase.
      for (const swamp of idsOf(s, "p1", "battlefield", "Swamp"))
        s = act(s, "p1", { type: "tapForMana", source: swamp, ability: 0 });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teferi's Protection") }));
      expect(payableLife(s, "p1")).toBe(0);
      const deluge = idOf(s, "p1", "hand", "Toxic Deluge");
      expect(() => act(s, "p1", { type: "cast", card: deluge, x: 2 })).toThrow(/points de vie/);
      s = settle(act(s, "p1", { type: "cast", card: deluge, x: 0 }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("The One Ring", () => {
    it("lancé : protection contre tout jusqu'à votre prochain tour ; indestructible", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["The One Ring"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The One Ring") }));
      const ring = idOf(s, "p1", "battlefield", "The One Ring");
      expect(chars(s, ring).keywords).toContain("indestructible");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(true);
      // Pas la règle « votre total de PV ne peut pas changer » : payer des PV reste possible.
      expect(payableLife(s, "p1")).toBe(20);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(false);
    });

    it("mis sur le champ de bataille sans être lancé : pas de protection", () => {
      let s = scenario({ p1: { graveyard: ["The One Ring"], hand: [REANIMATE] } });
      const ring = idOf(s, "p1", "graveyard", "The One Ring");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", REANIMATE.name), targets: { t: [ring] } }));
      expect(idsOf(s, "p1", "battlefield", "The One Ring")).toHaveLength(1);
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(false);
    });

    it("{T} : un marqueur de fardeau, puis une carte par marqueur ; à l'entretien, 1 PV perdu par marqueur", () => {
      let s = scenario({ p1: { battlefield: ["The One Ring"], library: lands("Island", 12) } });
      const ring = idOf(s, "p1", "battlefield", "The One Ring");
      s = settle(activate(s, "p1", ring));
      expect(s.objects[ring]?.counters.burden).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.players.p1?.life).toBe(19);
      const before = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", ring));
      expect(s.objects[ring]?.counters.burden).toBe(2);
      expect(s.players.p1?.hand.length).toBe(before + 2);
    });
  });

  describe("tuteurs", () => {
    it("Demonic Tutor : n'importe quelle carte de la bibliothèque en main", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Demonic Tutor"], library: ["Forest", "Forest", "Shock"] },
      });
      const shock = s.players.p1?.library.find((id) => nameOf(s, id) === "Shock") as string;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Demonic Tutor") }), picking([shock]));
      expect(handNames(s, "p1")).toEqual(["Shock"]);
    });

    it("Enlightened Tutor : seulement un artefact ou un enchantement, mis sur le dessus après le mélange", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Enlightened Tutor"], library: ["Bear Cub", "Forest", "Sanguine Bond", "Forest"] },
      });
      let offered: string[] = [];
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Enlightened Tutor") }), (req) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = namesIn(s, req.options) as string[];
        return req.options.filter((id) => nameOf(s, id) === "Sanguine Bond");
      });
      expect(offered).toEqual(["Sanguine Bond"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Sanguine Bond");
      expect(s.players.p1?.hand).toEqual([]);
    });
  });

  describe("contresorts", () => {
    it("Force of Negation : hors de votre tour, une carte bleue exilée de la main ; le sort contrecarré est exilé", () => {
      let s = scenario({
        active: "p2",
        p1: { hand: ["Force of Negation", "Opt"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = shockP1(s);
      const fon = idOf(s, "p1", "hand", "Force of Negation");
      expect(castOptions(s, "p1", fon).some((o) => o.altAvailable)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: fon, alternative: true, targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(exiled(s, "Shock")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toEqual([]);
    });

    it("Force of Negation : pendant votre tour, seulement pour son coût de mana", () => {
      let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Force of Negation", "Opt", "Shock"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
      expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Force of Negation")).some((o) => o.altAvailable)).toBe(false);
    });

    it("Rewind : contrecarre un sort et dégage jusqu'à quatre terrains", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Rewind"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = shockP1(s);
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rewind"), targets: { t: [s.stack[0]?.id as string] } }),
      );
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Unwind : seulement un sort non-créature ; dégage jusqu'à trois terrains", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: ["Unwind"] },
        p2: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Shock", "Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const unwind = idOf(s, "p1", "hand", "Unwind");
      expect(() => act(s, "p1", { type: "cast", card: unwind, targets: { t: [s.stack[0]?.id as string] } })).toThrow();
      s = settle(s);
      s = shockP1(s);
      s = settle(act(s, "p1", { type: "cast", card: unwind, targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });
  });

  describe("destructions", () => {
    it("Snuff Out : 4 PV au lieu du mana si vous contrôlez un Marais ; créature non-noire seulement", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Snuff Out"] },
        p2: { battlefield: ["Bear Cub", "Vampire of the Dire Moon"] },
      });
      const snuff = idOf(s, "p1", "hand", "Snuff Out");
      expect(castOptions(s, "p1", snuff).some((o) => o.altAvailable)).toBe(true);
      const vampire = idOf(s, "p2", "battlefield", "Vampire of the Dire Moon");
      expect(() => act(s, "p1", { type: "cast", card: snuff, alternative: true, targets: { t: [vampire] } })).toThrow();
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: snuff,
          alternative: true,
          targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
        }),
      );
      expect(s.players.p1?.life).toBe(16);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Swamp")]?.tapped).toBe(false);
      // Sans Marais : pas de coût alternatif.
      const t = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Snuff Out"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(castOptions(t, "p1", idOf(t, "p1", "hand", "Snuff Out")).some((o) => o.altAvailable)).toBe(false);
    });

    it("Vindicate : détruit n'importe quel permanent, terrain compris", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Mountain"], hand: ["Vindicate"] },
        p2: { battlefield: ["Forest"] },
      });
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Vindicate"),
          targets: { t: [idOf(s, "p2", "battlefield", "Forest")] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Forest")).toHaveLength(1);
    });

    it("Damn : une créature ciblée pour {B}{B} ; surchargé pour {2}{W}{W}, chaque créature", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Damn"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Damn"),
          mode: 0,
          targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
        }),
      );
      expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Healer's Hawk"], hand: ["Damn"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Damn"), mode: 1 }));
      expect(t.battlefield.filter((id) => chars(t, id).types.includes("Creature"))).toEqual([]);
    });

    it("Toxic Deluge : payer X PV en coût additionnel ; toutes les créatures -X/-X", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Vampire Nighthawk"], hand: ["Toxic Deluge"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Toxic Deluge"), x: 2 }));
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const hawk = idOf(s, "p1", "battlefield", "Vampire Nighthawk");
      expect([chars(s, hawk).power, chars(s, hawk).toughness]).toEqual([0, 1]);
    });

    it("Farewell : un ou plusieurs modes (créatures et cimetières : les artefacts et enchantements restent)", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Farewell"], graveyard: ["Opt"] },
        p2: { battlefield: ["Bear Cub", "Goblin Firebomb", "Sanguine Bond"], graveyard: ["Shock"] },
      });
      const farewell = idOf(s, "p1", "hand", "Farewell");
      const modes = castOptions(s, "p1", farewell).flatMap((o) => o.modes);
      expect(modes).toHaveLength(15);
      const both = modes.find((m) => m.label === "Exilez toutes les créatures + Exilez tous les cimetières");
      s = settle(act(s, "p1", { type: "cast", card: farewell, mode: both?.index }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Shock")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Goblin Firebomb")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Sanguine Bond")).toHaveLength(1);
      // Farewell rejoint le cimetière après avoir exilé les cimetières.
      expect(idsOf(s, "p1", "graveyard", "Farewell")).toHaveLength(1);
    });
  });

  describe("pioche et tempo", () => {
    it("Frantic Search : piochez deux cartes, défaussez-en deux, dégagez jusqu'à trois terrains", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Frantic Search", "Bear Cub", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Frantic Search") }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.graveyard).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Village Rites : une créature sacrifiée en coût additionnel ; piochez deux cartes", () => {
      const none = scenario({ p1: { battlefield: ["Swamp"], hand: ["Village Rites"] } });
      expect(castOptions(none, "p1", idOf(none, "p1", "hand", "Village Rites"))).toEqual([]);
      let s = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Village Rites"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Village Rites"), sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Sink into Stupor : renvoie un sort ou un permanent non-terrain adverse dans la main de son propriétaire", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: [SINK] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = shockP1(s);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", SINK), targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(handNames(s, "p2")).toEqual(["Shock"]);
      let t = scenario({
        p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: [SINK] },
        p2: { battlefield: ["Forest", "Bear Cub"] },
      });
      const sink = idOf(t, "p1", "hand", SINK);
      for (const bad of [idOf(t, "p2", "battlefield", "Forest"), idOf(t, "p1", "battlefield", "Bear Cub")])
        expect(() => act(t, "p1", { type: "cast", card: sink, targets: { t: [bad] } })).toThrow();
      t = settle(act(t, "p1", { type: "cast", card: sink, targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      expect(handNames(t, "p2")).toEqual(["Bear Cub"]);
    });

    it("Soporific Springs : le verso se joue comme terrain ; 3 PV pour qu'il arrive dégagé ; {T} : {U}", () => {
      let s = scenario({ p1: { hand: [SINK] } });
      const card = idOf(s, "p1", "hand", SINK);
      const plays = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === card);
      expect(plays.map((a) => a.type === "playLand" && !!a.payLife)).toEqual([true, false]);
      s = act(s, "p1", { type: "playLand", card, payLife: true });
      const land = s.battlefield.find((id) => s.objects[id]?.controller === "p1") as string;
      expect(chars(s, land).name).toBe("Soporific Springs");
      expect(s.objects[land]?.tapped).toBe(false);
      expect(s.players.p1?.life).toBe(17);
      expect(manaAbilitiesOf(s, land).flatMap((m) => m.produce)).toEqual(["U"]);
      let t = scenario({ p1: { hand: [SINK] } });
      t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", SINK) });
      expect(t.objects[t.battlefield[0] as string]?.tapped).toBe(true);
      expect(t.players.p1?.life).toBe(20);
    });

    it("Black Market Connections : à votre première phase principale, un ou plusieurs modes", () => {
      let s = scenario({ step: "upkeep", p1: { battlefield: ["Black Market Connections"], library: lands("Swamp", 5) } });
      s = advanceUntil(s, (x) => x.pending?.kind === "choice");
      expect(s.turn.step).toBe("main1");
      s = settle(s, modeNamed("Trésor, 1 PV + Piochez, 2 PV + Changelin 3/2, 3 PV"));
      expect(s.players.p1?.life).toBe(14);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      const shifter = tokens(s, "p1", "Shapeshifter")[0] as string;
      expect([chars(s, shifter).power, chars(s, shifter).toughness]).toEqual([3, 2]);
      expect(chars(s, shifter).keywords).toContain("changeling");
      // Une carte de l'étape de pioche, une du mode.
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("artefacts et enchantements", () => {
    it("Skullclamp : +1/-1 ; la créature équipée meurt, piochez deux cartes", () => {
      let s = scenario({ p1: { battlefield: ["Skullclamp", "Llanowar Elves", "Mountain"] } });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Skullclamp"), { t: [elves] }));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Phyrexian Altar : sacrifiez une créature, un mana de n'importe quelle couleur", () => {
      let s = scenario({ p1: { battlefield: ["Phyrexian Altar", "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Phyrexian Altar")));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const pool: Record<string, number> = s.players.p1?.manaPool ?? {};
      expect(Object.values(pool).reduce((a, b) => a + b, 0)).toBe(1);
    });

    it("Herald's Horn : vos sorts de créature du type choisi coûtent {1} de moins ; à l'entretien, la carte du dessus en main", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Herald's Horn"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Herald's Horn") }), () => ["Vampire"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Herald's Horn")]?.chosen).toMatchObject({ creatureType: "Vampire" });
      // Deux Marais suffisent pour Vampire Nighthawk ({1}{B}{B}), pas pour Bear Cub ({1}{G}) qui n'est pas un Vampire.
      let t = scenario({
        p1: {
          battlefield: ["Herald's Horn", ...lands("Swamp", 2)],
          hand: ["Vampire Nighthawk"],
          library: ["Vampire of the Dire Moon", "Forest"],
        },
      });
      const horn = t.objects[idOf(t, "p1", "battlefield", "Herald's Horn")];
      if (horn) horn.chosen = { creatureType: "Vampire" };
      bump(t);
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Vampire Nighthawk") }));
      expect(idsOf(t, "p1", "battlefield", "Vampire Nighthawk")).toHaveLength(1);
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.turn.number > 3);
      t = settle(t, (req) => (req.type === "pick" ? req.options.slice(0, 1) : undefined));
      expect(handNames(t, "p1")).toContain("Vampire of the Dire Moon");
    });

    it("Vanquisher's Banner : vos créatures du type choisi +1/+1 ; un sort de ce type lancé, piochez une carte", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Vampire Nighthawk", "Bear Cub"],
          hand: ["Vanquisher's Banner", "Vampire of the Dire Moon"],
        },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vanquisher's Banner") }), () => ["Vampire"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Vampire Nighthawk")).power).toBe(3);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") }));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Anointed Procession : deux fois plus de jetons créés par un effet sous votre contrôle", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Anointed Procession"], hand: ["Dragon Fodder"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Fodder") }));
      expect(tokens(s, "p1", "Goblin")).toHaveLength(4);
    });

    it("Anointed Procession et l'éminence d'Edgar Markov : deux Vampires par sort de Vampire", () => {
      let s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Swamp", "Anointed Procession"], hand: ["Vampire of the Dire Moon"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") }));
      expect(tokens(s, "p1", "Vampire")).toHaveLength(2);
    });

    it("Exquisite Blood : un adversaire perd des PV, vous en gagnez autant", () => {
      let s = scenario({ p1: { battlefield: ["Exquisite Blood"], hand: [DRAIN] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DRAIN.name) }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Exquisite Blood et Sanguine Bond : la boucle s'arrête quand l'adversaire perd la partie", () => {
      let s = scenario({
        p1: { battlefield: ["Exquisite Blood", "Sanguine Bond", "Forest"], hand: ["Sami's Curiosity"] },
        p2: { life: 7 },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sami's Curiosity") }));
      expect(s.players.p2?.lost).toBe(true);
      expect(s.winner).toBe("p1");
    });

    it("Exquisite Blood et Sanguine Bond à trois : la boucle passe à l'adversaire suivant jusqu'à la victoire", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Exquisite Blood", "Sanguine Bond", "Forest"], hand: ["Sami's Curiosity"] },
        p2: { life: 4 },
        p3: { life: 5 },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sami's Curiosity") }));
      expect(s.players.p2?.lost).toBe(true);
      expect(s.players.p3?.lost).toBe(true);
      expect(s.winner).toBe("p1");
    });

    it("Blade of the Bloodchief : une créature meurt, un marqueur +1/+1 sur la créature équipée, deux sur un Vampire", () => {
      for (const [host, n] of [
        ["Bear Cub", 1],
        ["Vampire Nighthawk", 2],
      ] as const) {
        let s = scenario({
          p1: { battlefield: ["Blade of the Bloodchief", host, ...lands("Mountain", 2)], hand: ["Shock"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const h = idOf(s, "p1", "battlefield", host);
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Blade of the Bloodchief"), { t: [h] }));
        s = settle(
          act(s, "p1", {
            type: "cast",
            card: idOf(s, "p1", "hand", "Shock"),
            targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] },
          }),
        );
        expect(s.objects[h]?.counters["+1/+1"]).toBe(n);
      }
    });
  });
});
