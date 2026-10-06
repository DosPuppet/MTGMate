# Commander : pseudo-ensemble EDH (PLAN-E)

Cartes des decks Commander absentes des extensions et des rééditions de l'appli, importées par nom depuis les decklists
de `docs/commander/decks/` (`npm run import-cards -- edh`, puis `npm run import-printings`). Chaque carte garde
l'impression retenue par l'import (`CardDef.origin` : ensemble d'origine, `number` : son numéro) et l'identité de
couleur donnée par Scryfall (données seulement, comparée à l'identité calculée par le moteur). Hors Standard. Plan :
`docs/plans/PLAN-E.md`.

Les scripts sont dans `packages/cards/src/edh/` ; les tests de règles dans `packages/engine/test/edh.test.ts` ; la fumée
dans `packages/ai/test/smoke/edh.test.ts`. Couverture par deck : `npm run coverage -- --deck <id|all> [--text]`.

| Deck | Commandant | Cartes EDH |
|---|---|---|
| `edgar-markov` | Edgar Markov (Mardu, vampires) | 61 à faire au 06/10/2026 |
| `yshtola` | Y'shtola, Night's Blessed (Esper, drain et contrôle) | 66 à faire (10 en commun avec Edgar) |

## E0 — import ✅

117 cartes, de 36 ensembles (Commander surtout : FRC, LCC, MSC, FIC, FDC, CMM…). Aucune n'est encore scriptée ; les
cartes faites seulement de mots-clés sont déjà jouables (Vampire of the Dire Moon…).

## E6 — mécaniques qui citent le commandant ✅ (14 / 117)

| Mécanique | Forme | Cartes |
|---|---|---|
| Mana de l'identité du commandant (903.4, rien sans commandant) | `manaAbility(…, { commanderIdentity: true })` (`ManaAbilityDef.produceIdentity`) | Command Tower, Arcane Signet, Path of Ancestry |
| Mana des terrains d'un adversaire | `likeLands: { controller: "opponent" }` (le filtre dit le contrôleur ; parmi `produce`) | Exotic Orchard, Fellwar Stone |
| « Si vous contrôlez un commandant, sans payer son coût de mana » | `altCost` `{0}` avec `cond.controls({ commander: true })` (`ObjectFilter.commander`, `LkiSnapshot.commander`) | Fierce Guardianship, Deadly Rollick, Flawless Maneuver |
| « Arrive engagé sauf si vous avez deux adversaires ou plus » | `entersWith` avec `amount.refCount(ref.eachOpponent)` | Luxury Suite, Vault of Champions, Morphic Pool, Sea of Clouds |
| Éminence (113.6) | `triggered(…, { fromCommand: true })` : la capacité fonctionne aussi depuis la zone de commandement (`commandZoneAbilities`, `detectTriggers`) | Edgar Markov |

- **Tests :** `engine/test/edh.test.ts` (11).
- **Approximation :** Path of Ancestry (regard 1 non fait).
- **Dette :** `fromCommand` propre à Edgar Markov pour l'instant (famille des commandants à éminence) ; plafond ObjectFilter 86 → 87.

## E8 — base de mana ✅ (44 / 117)

**Cartes (30, `edh/lands.ts`) :** terrains douloureux et talismans (Adarkar Wastes, Caves of Koilos, Underground River, Talisman of Dominance, Hierarchy, Progress), terrains à contrôle (Dragonskull Summit, Drowned Catacomb, Glacial Fortress, Isolated Chapel), « deux terrains de base » (Prairie Stream, Sunken Hollow), tricolores (Savai Triome, Raffine's Tower, Arcane Sanctum), fetchs (Bloodstained Mire, Flooded Strand, Polluted Delta), Bojuka Bog, Otawara, Soaring City (canalisation), Phyrexian Tower, Sunken Ruins, Unclaimed Territory, Urborg, Tomb of Yawgmoth, Voldaren Estate (jeton Sang, défausse en coût), Reliquary Tower, Thought Vessel, Decanter of Endless Water, Sol Ring, Relic of Legends.

- **Moteur :** `tapAnother` d'une capacité de mana accepte un `ObjectFilter` (Relic of Legends : une créature légendaire dégagée), lu par `otherToTap` et le solveur de paiement.
- **Tests :** `engine/test/edh-mana.test.ts` (17).
- **Approximations :** Relic of Legends (créature engagée choisie par le moteur) ; Phyrexian Tower et Sunken Ruins s'activent à la main.
- Fait par un agent dans une copie isolée, intégré par cherry-pick.
