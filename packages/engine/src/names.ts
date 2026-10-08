/**
 * Names to choose ("choose a card name", "a land card name", "a creature type") without revealing the opponent's
 * decklist: the question (`ChoiceRequest` of type `name`) no longer lists the cards of the game (`s.defs` holds those of
 * all the decks); it highlights public names (`featured`) and accepts any name of the catalog.
 *
 * The catalog of card names is outside the state (the state is copied at each AI simulation): the host registers it
 * once (`registerNameCatalog`: server at startup, interface and browser worker, tests). Without a catalog, the names of
 * the cards of the game remain accepted (engine tests, AI, replayed games); the catalog only changes the accepted
 * answers, never a suggestion nor the course of a game.
 */
import type { CardDef, GameState, NameKind } from "./types";

/** Catalog of names (canonical English names): all the cards (faces included), and the land cards. */
export interface NameCatalog {
  cards: readonly string[];
  lands: readonly string[];
}

/** 205.3m: the official list of creature types (Comprehensive Rules of 2026-09-25). */
// biome-ignore format: official list, kept compact
export const CREATURE_TYPES: readonly string[] = [
  "Advisor", "Aetherborn", "Alien", "Ally", "Angel", "Antelope", "Ape", "Archer", "Archon", "Armadillo", "Army",
  "Artificer", "Assassin", "Assembly-Worker", "Astartes", "Atog", "Aurochs", "Avatar", "Azra", "Badger", "Balloon",
  "Barbarian", "Bard", "Basilisk", "Bat", "Bear", "Beast", "Beaver", "Beeble", "Beholder", "Berserker", "Bird",
  "Bison", "Blinkmoth", "Boar", "Bringer", "Brushwagg", "Camarid", "Camel", "Capybara", "Caribou", "Carrier", "Cat",
  "Centaur", "Child", "Chimera", "Citizen", "Cleric", "Clown", "Cockatrice", "Construct", "Coward", "Coyote", "Crab",
  "Crocodile", "C'tan", "Custodes", "Cyberman", "Cyclops", "Dalek", "Dauthi", "Demigod", "Demon", "Deserter",
  "Detective", "Devil", "Dinosaur", "Djinn", "Doctor", "Dog", "Dragon", "Drake", "Dreadnought", "Drix", "Drone",
  "Druid", "Dryad", "Dwarf", "Echidna", "Efreet", "Egg", "Elder", "Eldrazi", "Elemental", "Elephant", "Elf", "Elk",
  "Employee", "Eternal", "Eye", "Faerie", "Ferret", "Fish", "Flagbearer", "Fox", "Fractal", "Frog", "Fungus",
  "Gamer", "Gamma", "Gargoyle", "Germ", "Giant", "Giraffe", "Gith", "Glimmer", "Gnoll", "Gnome", "Goat", "Goblin",
  "God", "Golem", "Gorgon", "Graveborn", "Gremlin", "Griffin", "Guest", "Hag", "Halfling", "Hamster", "Harpy",
  "Hedgehog", "Hellion", "Hero", "Hippo", "Hippogriff", "Homarid", "Homunculus", "Horror", "Horse", "Human", "Hydra",
  "Hyena", "Illusion", "Imp", "Incarnation", "Inhuman", "Inkling", "Inquisitor", "Insect", "Jackal", "Jellyfish",
  "Juggernaut", "Kangaroo", "Kavu", "Kirin", "Kithkin", "Knight", "Kobold", "Kor", "Kraken", "Kree", "Llama",
  "Lamia", "Lammasu", "Leech", "Lemur", "Leviathan", "Lhurgoyf", "Licid", "Lizard", "Lobster", "Manticore",
  "Masticore", "Mercenary", "Merfolk", "Metathran", "Minion", "Minotaur", "Mite", "Mole", "Monger", "Mongoose",
  "Monk", "Monkey", "Moogle", "Moonfolk", "Mount", "Mouse", "Mutant", "Myr", "Mystic", "Nautilus", "Necron",
  "Nephilim", "Nightmare", "Nightstalker", "Ninja", "Noble", "Noggle", "Nomad", "Nymph", "Octopus", "Ogre", "Ooze",
  "Orb", "Orc", "Orgg", "Otter", "Ouphe", "Ox", "Oyster", "Pangolin", "Peasant", "Pegasus", "Pentavite", "Performer",
  "Pest", "Phelddagrif", "Phoenix", "Phyrexian", "Pilot", "Pincher", "Pirate", "Plant", "Platypus", "Porcupine",
  "Possum", "Praetor", "Primarch", "Prism", "Processor", "Qu", "Rabbit", "Raccoon", "Ranger", "Rat", "Rebel",
  "Reflection", "Rhino", "Rigger", "Robot", "Rogue", "Sable", "Salamander", "Samurai", "Sand", "Saproling", "Satyr",
  "Scarecrow", "Scientist", "Scion", "Scorpion", "Scout", "Sculpture", "Seal", "Serf", "Serpent", "Servo", "Shade",
  "Shaman", "Shapeshifter", "Shark", "Sheep", "Shi'ar", "Siren", "Skeleton", "Skrull", "Skunk", "Slith", "Sliver",
  "Sloth", "Slug", "Snail", "Snake", "Soldier", "Soltari", "Sorcerer", "Spawn", "Specter", "Spellshaper", "Sphinx",
  "Spider", "Spike", "Spirit", "Splinter", "Sponge", "Spy", "Squid", "Squirrel", "Starfish", "Surrakar", "Survivor",
  "Symbiote", "Synth", "Tentacle", "Tetravite", "Thalakos", "Thopter", "Thrull", "Tiefling", "Toy", "Treefolk",
  "Trilobite", "Triskelavite", "Troll", "Turtle", "Tyranid", "Unicorn", "Utrom", "Vampire", "Varmint", "Vedalken",
  "Villain", "Volver", "Wall", "Walrus", "Warlock", "Warrior", "Weasel", "Weird", "Werewolf", "Whale", "Wizard",
  "Wolf", "Wolverine", "Wombat", "Worm", "Wraith", "Wurm", "Yeti", "Zombie", "Zubera", "Time Lord",
];

const CREATURE_TYPE_SET = new Set(CREATURE_TYPES);

/** A creature type of the official list (205.3m). */
export const isCreatureType = (t: string): boolean => CREATURE_TYPE_SET.has(t);

let catalog: { cards: Set<string>; lands: Set<string> } | null = null;

/**
 * Separator of the names of a multi-faced card in `CardDef.name` ("A // B"): "A // B" is not a card name (201.3); each
 * face is one.
 */
const FACE_SEPARATOR = " // ";

/** A name that can be chosen (201.3): not the full name "A // B" of a multi-faced card. */
export const isSingleName = (name: string): boolean => !!name && !name.includes(FACE_SEPARATOR);

/**
 * Name of a card that uses none of its faces (base characteristics, `layers.ts`): a split card (Room included) keeps
 * "A // B", which carries both its names (709.4, read by `nameList`); an adventurer has only its main name (715.4), a
 * double-faced card the name of its front face (712.8a).
 */
export function printedName(d: CardDef): string {
  return d.layout && d.layout !== "split" && d.faceDefs?.[0] ? d.faceDefs[0].name : d.name;
}

/** Names of an object from its computed name (`chars(s, id).name`): both halves of a split card (709.4). */
export function nameList(name: string | undefined): string[] {
  return name ? name.split(FACE_SEPARATOR) : [];
}

/** Whether the object with this computed name has the name `wanted` ("card with the chosen name", `name` filter). */
export function hasName(name: string | undefined, wanted: string | undefined): boolean {
  return !!wanted && nameList(name).includes(wanted);
}

/**
 * "with different names": the items kept one by one, as long as they share no name with an item already kept (an object
 * without a name, face down, shares none).
 */
export function firstOfEachName<T>(items: readonly T[], nameOf: (x: T) => string | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const names = nameList(nameOf(x));
    if (names.some((n) => seen.has(n))) return false;
    for (const n of names) seen.add(n);
    return true;
  });
}

/** Whether two objects share a name ("with the same name", 201.2a). */
export function shareName(a: string | undefined, b: string | undefined): boolean {
  const other = nameList(b);
  return nameList(a).some((n) => other.includes(n));
}

/** Registers the catalog of card names (`null`: none, only the names of the cards of the game are accepted). */
export function registerNameCatalog(c: NameCatalog | null): void {
  catalog = c ? { cards: new Set(c.cards), lands: new Set(c.lands) } : null;
}

/** Subtypes of the creature tokens described by these abilities (`token: { types, subtypes }` in their effects). */
export function tokenCreatureTypes(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) tokenCreatureTypes(x, out);
  else if (v && typeof v === "object") {
    const o = v as { token?: { types?: string[]; subtypes?: string[] } };
    if (o.token?.types?.includes("Creature")) out.push(...(o.token.subtypes ?? []));
    for (const x of Object.values(v)) if (x && typeof x === "object") tokenCreatureTypes(x, out);
  }
  return out;
}

/**
 * Names of the game (cards and each of their faces, not the full name "A // B" nor the tokens; creature types of the
 * cards and of the tokens they create): those the former question offered, always accepted (a game recorded before the
 * catalog replays identically).
 */
export function gameNames(s: GameState, of: NameKind): Set<string> {
  const out = new Set<string>();
  for (const d of Object.values(s.defs)) {
    if (of === "creatureType") {
      if (d.types.includes("Creature")) for (const t of d.subtypes) out.add(t);
      for (const t of tokenCreatureTypes(d.abilities)) out.add(t);
    } else if (!d.isToken && isSingleName(d.name) && (of === "card" || d.types.includes("Land"))) out.add(d.name);
  }
  return out;
}

/** Accepted answer to a "name" question: a name of the catalog (creature types: the official list), or of the game. */
export function isNameAllowed(s: GameState, of: NameKind, name: string): boolean {
  return nameValidator(s, of)(name);
}

/** `isNameAllowed` for several names (the names of the game are walked only once, if needed). */
export function nameValidator(s: GameState, of: NameKind): (name: string) => boolean {
  const known = of === "creatureType" ? CREATURE_TYPE_SET : catalog?.[of === "card" ? "cards" : "lands"];
  let game: Set<string> | undefined;
  return (name) => {
    if (!name) return false;
    if (known?.has(name)) return true;
    game ??= gameNames(s, of);
    return game.has(name);
  };
}
