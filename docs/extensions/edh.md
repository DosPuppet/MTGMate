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
- **Approximation :** Path of Ancestry (regard 1 non fait) ; levée après le bilan (règles 142) : « quand ce mana est dépensé pour lancer [un sort correspondant], [effets] » (`rider.effects`, capacité déclenchée de la source) et « qui partage un type de créature avec votre commandant » (`sharesCreatureTypeWith: ref.commanders()`, référence `commanders` : les commandants des joueurs désignés, où qu'ils soient) ; 4 tests dans `edh.test.ts`.
- **Dette :** `fromCommand` propre à Edgar Markov pour l'instant (famille des commandants à éminence) ; plafond ObjectFilter 86 → 87.

## E8 — base de mana ✅ (44 / 117)

**Cartes (30, `edh/lands.ts`) :** terrains douloureux et talismans (Adarkar Wastes, Caves of Koilos, Underground River, Talisman of Dominance, Hierarchy, Progress), terrains à contrôle (Dragonskull Summit, Drowned Catacomb, Glacial Fortress, Isolated Chapel), « deux terrains de base » (Prairie Stream, Sunken Hollow), tricolores (Savai Triome, Raffine's Tower, Arcane Sanctum), fetchs (Bloodstained Mire, Flooded Strand, Polluted Delta), Bojuka Bog, Otawara, Soaring City (canalisation), Phyrexian Tower, Sunken Ruins, Unclaimed Territory, Urborg, Tomb of Yawgmoth, Voldaren Estate (jeton Sang, défausse en coût), Reliquary Tower, Thought Vessel, Decanter of Endless Water, Sol Ring, Relic of Legends.

- **Moteur :** `tapAnother` d'une capacité de mana accepte un `ObjectFilter` (Relic of Legends : une créature légendaire dégagée), lu par `otherToTap` et le solveur de paiement.
- **Tests :** `engine/test/edh-mana.test.ts` (17).
- **Approximations :** Relic of Legends (créature engagée choisie par le moteur) ; Phyrexian Tower et Sunken Ruins s'activent à la main.
- Fait par un agent dans une copie isolée, intégré par cherry-pick.

## E10 — Edgar Markov : vampires ✅ (75 / 117)

**Cartes (31, `edh/edgar.ts`) :** Blood Artist, Bloodline Keeper, Captivating Vampire, Champion of Dusk, Charismatic Conqueror, Clavileño, Cordial Vampire, Cruel Celebrant, Drana, Edgar, Charmed Groom, Elenda, Forerunner of the Legion, Indulgent Aristocrat, Knight of the Ebon Legion, Legion Lieutenant, Malakir Bloodwitch, Markov Baron, Master of Dark Rites, Mavren Fein, Sanctum Seeker, Stromkirk Captain, Twilight Prophet, Vampire Socialite, Viscera Seer, Vito, Welcoming Vampire, Yahenni, New Blood, Olivia's Wrath, Pact of the Serpent, Sorin, Imperious Bloodlord ; jetons `VAMPIRE_FLYING`, `VAMPIRE_WB_LIFELINK`.

- **Moteur :** ascension (mot-clé lu dans le texte, `PlayerState.citysBlessing` acquise par une action basée sur l'état, `cond.citysBlessing` ; montrée dans l'interface par une icône dans le coin du champ de bataille du joueur, avec une infobulle : `PlayerView.citysBlessing`, `CitysBlessing` dans `Board.tsx`) ; la condition d'un `entersWith({ affects, condition })` est vérifiée du point de vue du contrôleur de la source.
- **Formes existantes réutilisées :** `tapOthers` (Captivating Vampire), coût additionnel `tap` (New Blood), `fx.chooseForSelf("creatureType")` (Pact of the Serpent), `addManaChoice` restreint (Master of Dark Rites), `fx.mayForStore` posé au contrôleur adverse (Charismatic Conqueror).
- **Tests :** `engine/test/edh-edgar.test.ts` (38).
- **Approximations :** New Blood (pas de changement de texte), ascension d'un permanent seulement.
- **Dette :** PlayerState 22 → 23, Condition 52 → 53 ; `perPlayer` n'est plus propre à une carte.

## E12 — Y'shtola : drain et contrôle ✅ (94 / 117)

**Cartes (19, `edh/yshtola.ts`) :** Y'shtola, Night's Blessed, Emet-Selch of the Third Seat, Esper Sentinel, Kambal, Lotho, Lyse Hext, Orcish Bowmasters, Papalymo Totolymo, Sheoldred, the Apocalypse, Tataru Taru, Irenicus's Vile Duplication, Quantum Misalignment, Mindcrank, Bloodchief Ascension, Helm of the Ghastlord, Mystic Remora, Ophidian Eye, Propaganda, Teferi, Time Raveler.

- **Moteur :** entretien cumulatif (702.24, lu dans le texte : marqueur d'âge puis coût payé une fois par marqueur, `unlessPay.times`, `cumulativeUpkeepAbility`) ; rebond imprimé (mot-clé `rebound`) ; pioche « sauf la première de son étape de pioche » (`turnDraw` de l'événement, `when.drawExceptTurnDraw`) ; changement de zone « d'un adversaire » (`whose: "opponent"`).
- **Tests :** `engine/test/edh-yshtola.test.ts` (31), dont la boucle Mindcrank + Bloodchief Ascension jusqu'à la défaite.
- **Approximations :** Propaganda (taxe aussi pour les planeswalkers), Orcish Bowmasters (pioche de l'étape).
- **Dette :** Effect (champs) 635, TriggerSpec (champs) 160 ; `perPlayer` et `sorceryTiming` ne sont plus propres à une carte.

## E9 — sorts communs et moteurs ✅ (117 / 117)

**Cartes (23, `edh/staples.ts`) :** Teferi's Protection, The One Ring, Demonic Tutor, Enlightened Tutor, Force of Negation, Snuff Out, Vindicate, Toxic Deluge, Farewell, Damn, Rewind, Unwind, Frantic Search, Sink into Stupor // Soporific Springs, Village Rites, Black Market Connections, Skullclamp, Phyrexian Altar, Herald's Horn, Vanquisher's Banner, Anointed Procession, Exquisite Blood, Blade of the Bloodchief.

- **Moteur :** protection d'un joueur (`PlayerStaticAbilityDef.protection` : `"opponents"` ou `"everything"`, à la place de `protectionFromOpponents` ; `playerProtectedFrom` pour les cibles et les blessures) ; « votre total de PV ne peut pas changer » (remplacement `lifeLoss` qui prévient, 119.8 : `payableLife`, aucun paiement de PV au-delà de 0) ; verso terrain d'une carte modale joué comme terrain (712.12, `landFace`, `moveObject(…, { modalBack })`) ; « choisissez un ou plus » (`oneOrMore`).
- **Tests :** `engine/test/edh-staples.test.ts` (31), dont la boucle Exquisite Blood + Sanguine Bond (victoire à deux, joueur suivant à trois) et Anointed Procession avec l'éminence d'Edgar.
- **Approximations :** Enlightened Tutor et Herald's Horn (pas de révélation), « dégagez jusqu'à N terrains », Phyrexian Altar, Teferi's Protection (Aura sur le joueur).

**Les deux decks sont jouables :** `cmd-edgar-markov` (88 / 88 hors terrains de base) et `cmd-yshtola` (91 / 91).
