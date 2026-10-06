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

## Deck The Ur-Dragon : Dragons, cinq couleurs ✅ (168 / 168)

Ajouté le 06/10/2026 avec la recette « Ajouter un deck Commander » (CLAUDE.md). Liste : « How to Train Ur-Dragon [Primer!] » de Shiny_Latios sur Moxfield (bracket 4, mise à jour le 27/09/2026), dans `docs/commander/decks/ur-dragon.txt` ; préconstruit `cmd-ur-dragon` (7 Game Changers : Chrome Mox, Demonic Tutor, Mana Vault, Mox Diamond, Smothering Tithe, Teferi's Protection, The One Ring).

**Import :** 51 cartes absentes du catalogue ajoutées à EDH ; 48 cartes du deck étaient déjà jouables (Standard, rééditions, decks précédents). L'import par nom prend désormais l'impression française la plus récente d'une autre extension (image comprise) quand l'impression d'origine n'en a pas, et ignore les impressions françaises dont le texte est en anglais (EOC chez Scryfall) : toutes les cartes EDH ont une image française, 16 cartes des decks précédents en ont gagné une ; Korvold, Mox Diamond et les dix terrains doubles d'origine (impressions françaises sans texte chez Scryfall, ou au texte anglais) ont leur texte français complété à la main dans `cards/data/french-overrides.json`, appliqué par l'import par nom.

**Cartes (41, `edh/urdragon.ts` et `edh/lands.ts`) :** The Ur-Dragon ; mana : Birds of Paradise, Noble Hierarch, Ignoble Hierarch, Delighted Halfling, Selvala, Heart of the Wilds, Mana Vault, Mox Diamond, Chromatic Orrery ; terrains : City of Brass, Forbidden Orchard, Arena of Glory, Boseiju, Who Endures, Horizon of Progress, Windswept Heath, Wooded Foothills, Ketria Triome ; enchantements et planeswalker : Dragon Tempest, Temur Ascendancy, Steely Resolve, Kiora, Behemoth Beckoner ; sorts : Stubborn Denial, Swan Song, Crux of Fate, Majestic Genesis ; Dragons : Ancient Gold Dragon, Cavern-Hoard Dragon, Dragonlord Dromoka, Dragonlord Kolaghan, Ganax, Astral Hunter, Goldlust Triad, Goldspan Dragon, Hellkite Courser, Klauth, Unrivaled Ancient, Korvold, Fae-Cursed King, Miirym, Sentinel Wyrm, Old Gnawbone, Scourge of Valkas, Tiamat, Ureni of the Unwritten, Zurgo and Ojutai.

- **Moteur :**
  - éminence d'une statique de joueur (`PlayerStaticAbilityDef.fromCommand` : The Ur-Dragon, réduction du coût depuis la zone de commandement) ;
  - zone de commandement dans les références (`ref.zone("command", …)`, cartes seulement, pas les emblèmes) et dans les déplacements (`MoveSpec.to: "command"`) : Hellkite Courser, Majestic Genesis ;
  - myriade (702.116, lue dans le texte) : `copyToken` avec `attackEach` (une copie attaque chacun des joueurs désignés) et `exileAtEndOfCombat` ;
  - mana marqué gardé jusqu'à la fin du tour (`TaggedMana.keep`, `addManaCombination(…, keep)` : Klauth) ; mana produit par un effet porteur d'un effet associé (`fx.addManaWithRider` : Arena of Glory, célérité) ;
  - « du même nom que [l'objet désigné] » (`ObjectFilter.nameOf`, résolu par `withX` : Dragonlord Kolaghan) ; plus grand montant parmi des joueurs (`amount.maxOverPlayers` : Cavern-Hoard Dragon) ; force supérieure à celle de chaque autre créature (`cond.eventObjectStrictlyGreatestPower` : Selvala) ;
  - correction : une condition lue à la résolution (`fx.when`) voit l'objet et l'événement déclencheurs ;
  - boucle obligatoire qui accumule (104.4b) : Ganax et Draconic Visitor (un Dragon arrive → un Trésor → un Dragon 5/5 à la place) se relancent sans fin ; le moteur ne la voyait pas (l'empreinte change à chaque jeton, l'ordre des déclenchements remettait le compteur à zéro) et une partie à quatre durait des heures ; elle est désormais nulle (empreinte où jetons et objets de la pile ne comptent qu'une fois, `outcomeHash(s, true)`) ; test dans `edh-urdragon.test.ts` ;
  - IA : avec plus de 12 objets sur la pile ou 150 permanents, les choix ne sont plus simulés (`docs/ia.md`) ;
  - correction trouvée par le fuzz strict : le paiement n'utilise pas plus de sources qui coûtent des PV (Mana Confluence, Horizon of Progress) que le joueur ne peut en payer (119.4) ; test dans `offers.test.ts`.
- **Outils :** `npm run arena -- … --by-deck --deck cmd-<id>` mesure un préconstruit Commander contre chacun des autres.
- **Tests :** `engine/test/edh-urdragon.test.ts` (32) ; fumée EDH (168 cartes) ; fuzz Commander à 2, 3 et 4 joueurs, strict (`--offers 4`) et « chaos » propres.
- **Approximations :** Mox Diamond (capacité d'arrivée), Forbidden Orchard (« devient engagé »), Chromatic Orrery (sorts seulement), myriade (une question, joueurs seulement), Hellkite Courser (deux commandants), Zurgo and Ojutai (ordre au-dessous).
- **Dette :** `fromCommand` (statique de joueur), `nameOf`, `attackEach`, `exileAtEndOfCombat` justifiés dans `debt-baseline.json` ; ObjectFilter 87 → 88, Amount 31 → 32, Condition (champs) 97 → 98, Effect (champs) 635 → 638, Amount (champs) 67 → 70 ; `fromCommand` n'est plus propre à Edgar Markov.
- **Équilibre** (IA moyenne des deux côtés, `--by-deck --deck cmd-ur-dragon`, contre Edgar et Y'shtola à tour de rôle) : en duel, The Ur-Dragon gagne 54,9 % ± 4,0 (597 parties décidées, 3 nulles, 17 tours en moyenne) ; à quatre (sièges Ur-Dragon, autre, Ur-Dragon, autre), 41,2 % ± 5,7 (291 parties décidées, 9 nulles, 37 tours). Dans la cible de 45 à 55 % en duel, un peu en dessous à quatre ; la liste n'est pas retouchée.

## Deck Rakdos, Lord of Riots : gros sorts gratuits ✅ (225 / 225)

Ajouté le 06/10/2026 avec la recette « Ajouter un deck Commander ». Liste : « Rakdos, Lord of Big Free Stuff » de wachelreeks sur Moxfield (mise à jour le 24/09/2026), dans `docs/commander/decks/rakdos.txt` ; préconstruit `cmd-rakdos` (2 Game Changers : Demonic Tutor, Vampiric Tutor ; tranche estimée 3).

**Import :** 57 cartes absentes du catalogue ajoutées à EDH, toutes avec une image française ; texte français de Lim-Dûl's Hex complété à la main (`french-overrides.json`).

**Cartes (57, `edh/rakdos.ts` et `edh/lands.ts`) :** Rakdos, Lord of Riots ; Eldrazi : Emrakul, the Promised End, Emrakul, the World Anew, It That Betrays, Kozilek, Butcher of Truth, Kozilek, the Broken Reality, Ulamog, the Ceaseless Hunger, Ulamog, the Defiler, Ulamog, the Infinite Gyre ; Blightsteel Colossus, Cityscape Leveler, Razaketh, the Foulblooded, Ancient Cellarspawn, Exocrine, Screamer-Killer, Knollspine Dragon, Shivan Devastator, Walking Ballista, Sandstone Oracle ; blessures et pertes de PV : Creeping Bloodsucker, Fanatic of Mogis, Gray Merchant of Asphodel, Grim Servant, Keen Duelist, Plague Spitter, Shepherd of Rot, Spear Spewer, Stormfist Crusader, Thermo-Alchemist, Florian, Voldaren Scion, Imperial Recruiter, Priest of Gix, Tuktuk Rubblefort ; enchantements : Descent into Avernus, Lim-Dûl's Hex, Pandemonium, Phyrexian Reclamation, Protection Racket, Sanctum of Stone Fangs ; sorts : Agadeem's Awakening, Bloodsoaked Insight, Shatterskull Smashing, Valakut Awakening (versos terrains), Deflecting Swat, Rakdos Charm, Wheel of Misfortune ; Ob Nixilis, the Adversary ; mana : Rakdos Signet, Talisman of Indulgence, Cryptolith Fragment, Lightning Greaves ; terrains : Blackcleave Cliffs, Blightstep Pathway, Foreboding Ruins, Graven Cairns, Smoldering Marsh, Sulfurous Springs.

- **Moteur :**
  - « pour chaque joueur, … » : `fx.forEachPlayer(of, (p, n) => …)`, déroulé pour six sièges avec la référence `nth` (Lim-Dûl's Hex, Protection Racket, Gray Merchant, Kozilek, the Broken Reality, Ob Nixilis) ;
  - nombres choisis secrètement : `fx.chooseNumbers`, `ref.numberChoosers`, `amount.numberChosen` (Wheel of Misfortune) ;
  - « à moins qu'il ne paie {B} ou {3} » : `unlessPays(…, { mana, orMana })` sans défausse ;
  - annihilateur N et exhumation lus dans le texte (`scryfall.ts`) ; exhumé : `MoveSpec.exileIfLeaves`, `GameObject.exileIfLeaves` (exilé s'il devait quitter le champ de bataille) ; folie écrite en toutes lettres (« Madness—Pay six {C} ») ;
  - manifester depuis la main : `MoveSpec.manifest`, avec le choix de chaque joueur dans sa main (`pickFromZone` et `who`) ;
  - copie de sort avec loyauté de départ (`copySpell(…, { loyalty })`, victime X d'Ob Nixilis) ; tour contrôlé suivi d'un tour supplémentaire (`controlNextTurn(…, thenExtraTurn)`, Emrakul, the Promised End) ;
  - cibles de valeurs de mana différentes (`TargetSpec.differentManaValues`) ; recherche bornée par un montant (`search` et `maxManaValue`, Grim Servant) ;
  - jeton Powerstone (mana réservé aux sorts d'artefact et aux capacités) ;
  - correction : les déclenchements d'un sacrifice suivent la carte sacrifiée dans sa nouvelle zone (It That Betrays) ;
  - correction trouvée par le fuzz strict : un sort ne propose plus comme cible une créature à taxe de PV impayable (Terror of the Peaks, à 2 PV) ; test dans `offers.test.ts`.
- **Tests :** `engine/test/edh-rakdos.test.ts` (29) ; fumée EDH (225 cartes) ; fuzz Commander à 2, 3 et 4 joueurs, strict et « chaos » propres (quelques parties nulles par défaite simultanée : blessures à chaque joueur).
- **Approximations :** Foreboding Ruins, Pandemonium, Sandstone Oracle, Emrakul, the World Anew (protection contre les sorts), Cryptolith Fragment, Wheel of Misfortune, Gray Merchant et Creeping Bloodsucker, Ob Nixilis (force imprimée), Keen Duelist.
- **Dette :** `chooseNumbers`, `differentManaValues`, `exileIfLeaves`, `manifest` justifiés ; `cast` n'est plus propre à une carte ; plafonds relevés (GameObject 62, Effect 153, Ref 34, Amount 33…).
- **Équilibre** (IA moyenne des deux côtés, `--by-deck --deck cmd-rakdos`, contre les trois autres préconstruits à tour de rôle) : en duel, Rakdos gagne 33,2 % ± 3,8 (599 parties décidées, 18 tours) ; à quatre, 26,6 % ± 5,0 (297 parties décidées, 35 tours). Nettement sous la cible de 45 à 55 % ; à étudier dans l'IA d'abord (lancer Rakdos et les Eldrazi au bon moment, garder les pertes de PV pour la réduction), la liste n'est pas retouchée. Deux décisions de plus de 20 s sur un plateau de 270 permanents (limite connue du niveau moyen, `docs/ia.md`).

