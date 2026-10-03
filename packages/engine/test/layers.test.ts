import { CARDS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { cond, fx, ref, spell, staticAbility, target, triggered, when } from "../src/dsl";
import { chars, obj, tapObject, untapObject } from "../src/state";
import type { LayerMods } from "../src/types";
import { act, customCard, idOf, idsOf, passBoth, passUntil, scenario } from "./helpers";

/** « La créature ciblée devient 0/1 et perd toutes ses capacités jusqu'à la fin du tour. » */
const HEX = customCard({
  name: "Maléfice",
  typeLine: "Instant",
  types: ["Instant"],
  spell: spell([target.creature()], [fx.modify(ref.target(), { setPower: 0, setToughness: 1, loseAllAbilities: true })]),
});

describe("couches (613)", () => {
  it("seigneur : les autres Elfes gagnent +1/+1, pas le seigneur lui-même", () => {
    const s = scenario({ p1: { battlefield: ["Imperious Perfect", "Llanowar Elves", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Imperious Perfect")).power).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("les effets suivent le seigneur : il quitte le jeu, le bonus disparaît", () => {
    let s = scenario({
      p1: { battlefield: ["Imperious Perfect", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      active: "p2",
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "Burst Lightning"),
      targets: { t: [idOf(s, "p1", "battlefield", "Imperious Perfect")] },
    });
    s = passBoth(s);
    expect(chars(s, elves).power).toBe(1);
  });

  it("7b puis 7c : « devient 0/1 » s'applique avant les marqueurs et le seigneur", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Imperious Perfect", "Llanowar Elves"], hand: [HEX] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = {
      ...s,
      objects: { ...s.objects, [elves]: { ...s.objects[elves]!, counters: { "+1/+1": 1 } } },
      version: s.version + 1,
    };
    expect(chars(s, elves).power).toBe(3); // 1 + 1 marqueur + 1 seigneur
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Maléfice"), targets: { t: [elves] } });
    s = passBoth(s);
    // 0/1 (7b) + marqueur (7c) + seigneur (7c) = 2/3 ; la capacité de mana est perdue (couche 6).
    expect(chars(s, elves)).toMatchObject({ power: 2, toughness: 3, abilities: [] });
  });

  it("capacité conditionnelle : Kargan a le vol seulement avec un Dragon", () => {
    let s = scenario({ p1: { battlefield: Array(5).fill("Mountain").concat("Kargan Dragonrider"), hand: ["Dragon Trainer"] } });
    const kargan = idOf(s, "p1", "battlefield", "Kargan Dragonrider");
    expect(chars(s, kargan).keywords).not.toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Trainer") });
    s = passBoth(s); // le Dresseur arrive
    s = passBoth(s); // son déclenchement crée le Dragon
    expect(chars(s, kargan).keywords).toContain("flying");
  });

  it("« créatures attaquantes » : Goblin Oriflamme ne compte qu'en attaque", () => {
    let s = scenario({ p1: { battlefield: ["Goblin Oriflamme", "Swab Goblin"] } });
    const g = idOf(s, "p1", "battlefield", "Swab Goblin");
    expect(chars(s, g).power).toBe(2);
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: g, defender: "p2" }] });
    expect(chars(s, g).power).toBe(3);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(chars(s, g).power).toBe(2);
  });

  it("donner une capacité aux autres : Aggressive Mammoth donne le piétinement", () => {
    const s = scenario({ p1: { battlefield: ["Aggressive Mammoth", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
  });
});

describe("remplacements et prévention (614–615)", () => {
  it("« exilez-la à la place » : Obliterating Bolt exile la créature qui meurt", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Mountain"], hand: ["Obliterating Bolt"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    // Pelakka Wurm fait 7/7 : on le blesse d'abord pour que 4 blessures suffisent.
    s = { ...s, objects: { ...s.objects, [wurm]: { ...s.objects[wurm]!, damage: 3 } } };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Obliterating Bolt"), targets: { t: [wurm] } });
    s = passBoth(s);
    expect(s.exile).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    // Exilée, elle n'est pas « morte » : pas de pioche de Pelakka Wurm.
    expect(s.stack).toHaveLength(0);
  });

  it("arrive avec des marqueurs (raid) et « double ses marqueurs » (landfall)", () => {
    let s = scenario({ step: "main2", p1: { battlefield: Array(3).fill("Mountain"), hand: ["Goblin Boarders"] } });
    // Raid : une attaque ce tour-ci (journal du tour).
    s = {
      ...s,
      turnLog: [...s.turnLog, { e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: [] }],
      version: s.version + 1,
    };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Goblin Boarders") });
    s = passBoth(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Goblin Boarders")).power).toBe(4);

    let t = scenario({ p1: { battlefield: Array(3).fill("Forest"), hand: ["Mossborn Hydra", "Forest"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Mossborn Hydra") });
    t = passBoth(t);
    const hydra = idOf(t, "p1", "battlefield", "Mossborn Hydra");
    expect(chars(t, hydra).power).toBe(1);
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Forest") });
    t = passBoth(t);
    expect(chars(t, hydra).power).toBe(2);
  });

  it("arrive engagé : Diregraf Ghoul", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Diregraf Ghoul"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Diregraf Ghoul") });
    s = passBoth(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Diregraf Ghoul")]?.tapped).toBe(true);
  });

  it("prévention : Fleeting Flight empêche les blessures de combat infligées à la créature", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: fire, defender: "p1" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: fire }] });
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fleeting Flight"), targets: { t: [bear] } });
    s = passBoth(s);
    s = passUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[bear]).toBeDefined();
    expect(s.objects[bear]?.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Interactions synthétiques : cartes fabriquées, effets continus posés directement, horodatages maîtrisés.
// ---------------------------------------------------------------------------

type State = ReturnType<typeof scenario>;

/** Effet continu issu d'une résolution (ensemble verrouillé, 611.2c), avec l'horodatage voulu. */
function withEffect(s: State, affected: string[], mods: LayerMods, timestamp = s.timestamp + 1): State {
  return {
    ...s,
    timestamp: Math.max(s.timestamp, timestamp),
    version: s.version + 1,
    effects: [...s.effects, { id: `e${timestamp}`, timestamp, affected, duration: "permanent", ...mods }],
  };
}

const ARTIFACT = customCard({ name: "Rouage", typeLine: "Artifact", types: ["Artifact"] });
/** « Les artefacts que vous contrôlez sont des créatures-artefacts 2/2. » (couches 4 et 7b) */
const ANIMATOR = customCard({
  name: "Animateur",
  typeLine: "Enchantment",
  types: ["Enchantment"],
  abilities: [
    staticAbility({ types: ["Artifact"], controller: "you" }, { addTypes: ["Creature"], setPower: 2, setToughness: 2 }),
  ],
});
/** « Les créatures que vous contrôlez gagnent +1/+1 et ont le vol. » (couches 6 et 7c) */
const ANTHEM = customCard({
  name: "Hymne",
  typeLine: "Enchantment",
  types: ["Enchantment"],
  abilities: [staticAbility({ types: ["Creature"], controller: "you" }, { power: 1, toughness: 1, addKeywords: ["flying"] })],
});
/** « Les créatures rouges ont la célérité. » (couche 6, filtre de couleur) */
const RED_HASTE = customCard({
  name: "Fanion rouge",
  typeLine: "Enchantment",
  types: ["Enchantment"],
  abilities: [staticAbility({ types: ["Creature"], colors: ["R"] }, { addKeywords: ["haste"] })],
});

describe("couches : interactions synthétiques", () => {
  it("un type ajouté en couche 4 rend l'objet concerné par les couches suivantes (6, 7b, 7c)", () => {
    const s = scenario({ p1: { battlefield: [ARTIFACT, ANIMATOR, ANTHEM] } });
    // Artefact → créature 2/2 (4, 7b), puis +1/+1 et vol de l'Hymne, dont l'ensemble est fixé à ses couches (613.6).
    expect(chars(s, idOf(s, "p1", "battlefield", "Rouage"))).toMatchObject({
      types: ["Artifact", "Creature"],
      power: 3,
      toughness: 3,
      keywords: ["flying"],
    });
  });

  it("une couleur changée en couche 5 compte pour un filtre de couleur en couche 6", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", RED_HASTE] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).not.toContain("haste");
    s = withEffect(s, [bear], { setColors: ["R"] });
    expect(chars(s, bear).keywords).toContain("haste");
  });

  it("611.2c : l'ensemble d'un effet de résolution est verrouillé, un nouveau venu n'en profite pas", () => {
    // « Les créatures que vous contrôlez gagnent +2/+0 » résolu quand seul l'Ours était là ; les Elfes arrivent après.
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = withEffect(s, [bear], { power: 2 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(1);
    expect(chars(s, bear).power).toBe(4);
  });

  it("perte de toutes les capacités : l'ordre des horodatages décide (613.7)", () => {
    const base = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(base, "p1", "battlefield", "Bear Cub");
    const t = base.timestamp;
    // Vol puis perte : plus de vol.
    const lostLast = withEffect(
      withEffect(base, [bear], { addKeywords: ["flying"] }, t + 1),
      [bear],
      { loseAllAbilities: true },
      t + 2,
    );
    expect(chars(lostLast, bear).keywords).not.toContain("flying");
    // Perte puis vol : le vol reste.
    const gainedLast = withEffect(
      withEffect(base, [bear], { loseAllAbilities: true }, t + 1),
      [bear],
      { addKeywords: ["flying"] },
      t + 2,
    );
    expect(chars(gainedLast, bear).keywords).toContain("flying");
  });

  it("une source qui perd ses capacités n'applique plus ses statiques", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ANTHEM] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(3);
    s = withEffect(s, [idOf(s, "p1", "battlefield", "Hymne")], { loseAllAbilities: true });
    expect(chars(s, bear)).toMatchObject({ power: 2, keywords: [] });
  });

  it("7b, 7c puis 7d : F/E fixées, modification, marqueur, puis échange", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = withEffect(s, [bear], { switchPT: true }); // le plus ancien, mais la couche 7d vient en dernier
    s = withEffect(s, [bear], { setPower: 1, setToughness: 4 });
    s = withEffect(s, [bear], { power: 2 });
    s = { ...s, objects: { ...s.objects, [bear]: { ...s.objects[bear]!, counters: { "+1/+1": 1 } } }, version: s.version + 1 };
    // 1/4 → +2/+0 → +1/+1 = 4/5 → échange = 5/4.
    expect(chars(s, bear)).toMatchObject({ power: 5, toughness: 4, basePower: 1 });
  });

  it("copie (couche 1) puis modification : les valeurs copiables, puis le bonus", () => {
    let s = scenario({ p1: { battlefield: ["Llanowar Elves", "Bear Cub"] } });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const bearDef = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]!.defId;
    s = withEffect(s, [elves], { power: 1 });
    s = withEffect(s, [elves], { copyOf: bearDef });
    // La copie (plus récente) ne balaie pas le bonus : les couches s'appliquent dans l'ordre, pas par horodatage.
    expect(chars(s, elves)).toMatchObject({ name: "Bear Cub", power: 3, toughness: 2 });
  });

  it("une statique accordée par un effet s'applique (Roar of the Fifth People, chapitre II)", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ARTIFACT] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const grant = staticAbility({ types: ["Creature"], controller: "you" }, { addKeywords: ["vigilance"] });
    expect(chars(s, bear).keywords).not.toContain("vigilance");
    s = withEffect(s, [idOf(s, "p1", "battlefield", "Rouage")], { addAbilities: [grant] });
    expect(chars(s, bear).keywords).toContain("vigilance");
  });

  it("603.4 : une capacité déclenchée accordée « si… » revérifie sa condition à la résolution", () => {
    const run = (removeInResponse: boolean) => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ARTIFACT, "Island"], hand: ["Opt"] } });
      const grant = triggered(when.castSpell("you"), [fx.gainLife(3)], { condition: cond.controls({ types: ["Artifact"] }) });
      s = withEffect(s, [idOf(s, "p1", "battlefield", "Bear Cub")], { addAbilities: [grant] });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
      s = passUntil(s, (x) => x.stack.length === 2);
      expect(s.stack.length).toBe(2);
      if (removeInResponse) destroy(s, idOf(s, "p1", "battlefield", "Rouage"));
      s = passUntil(s, (x) => x.stack.length === 1);
      return s.players.p1?.life;
    };
    expect(run(false)).toBe(23);
    expect(run(true)).toBe(20);
  });

  it("613.8 : la condition d'une statique voit les types ajoutés par un effet", () => {
    // Kargan a le vol « tant que vous contrôlez un Dragon » : un Ours devenu Dragon par un effet suffit.
    let s = scenario({ p1: { battlefield: ["Kargan Dragonrider", "Bear Cub"] } });
    const kargan = idOf(s, "p1", "battlefield", "Kargan Dragonrider");
    expect(chars(s, kargan).keywords).not.toContain("flying");
    s = withEffect(s, [idOf(s, "p1", "battlefield", "Bear Cub")], { addSubtypes: ["Dragon"] });
    expect(chars(s, kargan).keywords).toContain("flying");
  });

  it("dernières informations connues : une créature renforcée qui meurt garde sa force modifiée", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      active: "p2",
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = withEffect(s, [bear], { power: 3 });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: [bear] } });
    s = passBoth(s);
    expect(s.objects[bear]).toBeUndefined();
    expect(s.lki[bear]).toMatchObject({ power: 5, toughness: 2 });
  });
});

describe("limites connues du moteur, gardées par un test", () => {
  it("aucune statique n'accorde de capacité statique (dépendance non gérée par les couches)", () => {
    const offenders: string[] = [];
    const walk = (v: unknown, name: string): void => {
      if (Array.isArray(v)) for (const x of v) walk(x, name);
      else if (v && typeof v === "object") {
        const ab = v as { kind?: string; mods?: LayerMods };
        if (ab.kind === "static" && ab.mods?.addAbilities?.some((a) => a.kind === "static")) offenders.push(name);
        for (const x of Object.values(v)) walk(x, name);
      }
    };
    for (const def of Object.values(CARDS)) walk(def, def.name);
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("cache des couches : invalidation ciblée (PLAN-C, lot C15)", () => {
  const tappedAnthem = customCard({
    name: "Hymne des engagés",
    typeLine: "Enchantment",
    types: ["Enchantment"],
    abilities: [staticAbility({ types: ["Creature"], controller: "you", tapped: true }, { power: 1, toughness: 1 })],
  });
  const poolLord = customCard({
    name: "Seigneur de la réserve",
    power: 1,
    toughness: 1,
    abilities: [staticAbility("self", { power: 5, toughness: 0 }, { condition: cond.manaPoolAtLeast(2) })],
  });

  it("engager ou dégager une créature met à jour une statique qui lit l'état engagé", () => {
    const s = scenario({ p1: { battlefield: [tappedAnthem, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    tapObject(s, obj(s, bear));
    expect(chars(s, bear).power).toBe(3);
    untapObject(s, obj(s, bear));
    expect(chars(s, bear).power).toBe(2);
  });

  it("sans statique qui le lit, engager ne recalcule pas les caractéristiques", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Forest"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    chars(s, bear);
    const v = s.version;
    tapObject(s, obj(s, bear));
    expect(s.version).toBe(v);
  });

  it("produire du mana met à jour une statique qui lit la réserve", () => {
    let s = scenario({ p1: { battlefield: [poolLord, "Forest", "Forest"] } });
    const lord = idOf(s, "p1", "battlefield", "Seigneur de la réserve");
    expect(chars(s, lord).power).toBe(1);
    for (const land of idsOf(s, "p1", "battlefield", "Forest"))
      s = act(s, "p1", { type: "tapForMana", source: land, ability: 0 });
    expect(chars(s, lord).power).toBe(6);
  });
});
