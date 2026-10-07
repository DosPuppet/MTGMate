/**
 * Noms à choisir (« choisissez un nom de carte », « un nom de carte de terrain », « un type de créature ») sans révéler
 * la decklist adverse : la question (`ChoiceRequest` de type `name`) ne liste plus les cartes de la partie (`s.defs`
 * contient celles de tous les decks) ; elle met en avant des noms publics (`featured`) et accepte tout nom du catalogue.
 *
 * Le catalogue des noms de cartes est hors de l'état (l'état est copié à chaque simulation de l'IA) : l'hôte
 * l'enregistre une fois (`registerNameCatalog` : serveur au démarrage, interface et worker du navigateur, tests). Sans
 * catalogue, les noms des cartes de la partie restent acceptés (tests du moteur, IA, parties rejouées) ; le catalogue ne
 * change que les réponses acceptées, jamais une suggestion ni le déroulement d'une partie.
 */
import type { CardDef, GameState, NameKind } from "./types";

/** Catalogue des noms (noms anglais canoniques) : toutes les cartes (faces comprises), et les cartes de terrain. */
export interface NameCatalog {
  cards: readonly string[];
  lands: readonly string[];
}

/** 205.3m : la liste officielle des types de créature (Règles complètes du 25/09/2026). */
// biome-ignore format: liste officielle, gardée compacte
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

/** Un type de créature de la liste officielle (205.3m). */
export const isCreatureType = (t: string): boolean => CREATURE_TYPE_SET.has(t);

let catalog: { cards: Set<string>; lands: Set<string> } | null = null;

/**
 * Séparateur des noms d'une carte à plusieurs faces dans `CardDef.name` (« A // B ») : « A // B » n'est pas un nom de
 * carte (201.3) ; chaque face en est un.
 */
const FACE_SEPARATOR = " // ";

/** Un nom qu'on peut choisir (201.3) : pas le nom complet « A // B » d'une carte à plusieurs faces. */
export const isSingleName = (name: string): boolean => !!name && !name.includes(FACE_SEPARATOR);

/**
 * Nom d'une carte qui n'utilise aucune de ses faces (caractéristiques de base, `layers.ts`) : une carte scindée (Salle
 * comprise) garde « A // B », qui porte ses deux noms (709.4, lus par `nameList`) ; un aventurier a seulement son nom
 * principal (715.4), une carte à deux faces le nom de son recto (712.8a).
 */
export function printedName(d: CardDef): string {
  return d.layout && d.layout !== "split" && d.faceDefs?.[0] ? d.faceDefs[0].name : d.name;
}

/** Noms d'un objet d'après son nom calculé (`chars(s, id).name`) : les deux moitiés d'une carte scindée (709.4). */
export function nameList(name: string | undefined): string[] {
  return name ? name.split(FACE_SEPARATOR) : [];
}

/** L'objet de ce nom calculé a-t-il le nom `wanted` (« carte du nom choisi », filtre `name`) ? */
export function hasName(name: string | undefined, wanted: string | undefined): boolean {
  return !!wanted && nameList(name).includes(wanted);
}

/**
 * « de noms différents » : les éléments gardés un à un, tant qu'ils n'ont aucun nom en commun avec un élément déjà gardé
 * (un objet sans nom, face cachée, n'en partage aucun).
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

/** Deux objets ont-ils un nom en commun (« du même nom », 201.2a) ? */
export function shareName(a: string | undefined, b: string | undefined): boolean {
  const other = nameList(b);
  return nameList(a).some((n) => other.includes(n));
}

/** Enregistre le catalogue des noms de cartes (`null` : aucun, seuls les noms des cartes de la partie sont acceptés). */
export function registerNameCatalog(c: NameCatalog | null): void {
  catalog = c ? { cards: new Set(c.cards), lands: new Set(c.lands) } : null;
}

/** Sous-types des jetons de créature que décrivent ces capacités (`token: { types, subtypes }` dans leurs effets). */
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
 * Noms de la partie (cartes et chacune de leurs faces, pas le nom complet « A // B » ni les jetons ; types de créature
 * des cartes et des jetons qu'elles créent) : ceux que proposait l'ancienne question, toujours acceptés (une partie enregistrée avant le catalogue se
 * rejoue à l'identique).
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

/** Réponse acceptée à une question « nom » : un nom du catalogue (types de créature : la liste officielle), ou de la partie. */
export function isNameAllowed(s: GameState, of: NameKind, name: string): boolean {
  return nameValidator(s, of)(name);
}

/** `isNameAllowed` pour plusieurs noms (les noms de la partie ne sont parcourus qu'une fois, au besoin). */
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
