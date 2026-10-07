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
| `ur-dragon` | The Ur-Dragon (Dragons, cinq couleurs) | 51 |
| `rakdos` | Rakdos, Lord of Riots (gros sorts gratuits) | 57 |
| `multiverse-reforged` | Jace, Multiverse Architect (préconstruit officiel de Réalité fracturée) | 57 |
| `turtle-power` | Heroes in a Half Shell (préconstruit officiel des Tortues Ninja) | 68 |
| `counter-blitz` | Tidus, Yuna's Guardian (préconstruit officiel de Final Fantasy X) | 67 |
| `fantastic-four` | Invisible Woman (préconstruit officiel des Quatre Fantastiques) | 47 (6 en commun avec Counter Blitz) |
| `mutant-menace` | The Wise Mothman (préconstruit officiel de Fallout) | 57 (3 en commun avec Counter Blitz) |

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
  - cartes modales dont le recto et le verso sont des terrains (Blightstep Pathway // Searstep Pathway) : le joueur choisit la face jouée (`playLand` et `back`, une option par face ; règles 147) ;
  - correction : les déclenchements d'un sacrifice suivent la carte sacrifiée dans sa nouvelle zone (It That Betrays) ;
  - correction trouvée par le fuzz strict : un sort ne propose plus comme cible une créature à taxe de PV impayable (Terror of the Peaks, à 2 PV) ; test dans `offers.test.ts`.
- **Tests :** `engine/test/edh-rakdos.test.ts` (30, dont la victime X d'Ob Nixilis avec une force modifiée : la loyauté de la copie est la force de la créature au moment du sacrifice) ; fumée EDH (225 cartes) ; fuzz Commander à 2, 3 et 4 joueurs, strict et « chaos » propres (quelques parties nulles par défaite simultanée : blessures à chaque joueur).
- **Approximations :** Foreboding Ruins, Pandemonium, Sandstone Oracle (levée par PLAN-H H4), Emrakul, the World Anew (protection contre les sorts), Cryptolith Fragment, Wheel of Misfortune, Gray Merchant et Creeping Bloodsucker, Keen Duelist.
- **Dette :** `chooseNumbers`, `differentManaValues`, `exileIfLeaves`, `manifest` justifiés ; `cast` n'est plus propre à une carte ; plafonds relevés (GameObject 62, Effect 153, Ref 34, Amount 33…).
- **Équilibre** (IA moyenne des deux côtés, `--by-deck --deck cmd-rakdos`, contre les trois autres préconstruits à tour de rôle) : en duel, Rakdos gagne 33,2 % ± 3,8 (599 parties décidées, 18 tours) ; à quatre, 26,6 % ± 5,0 (297 parties décidées, 35 tours). Nettement sous la cible de 45 à 55 % ; à étudier dans l'IA d'abord (lancer Rakdos et les Eldrazi au bon moment, garder les pertes de PV pour la réduction), la liste n'est pas retouchée. Deux décisions de plus de 20 s sur un plateau de 270 permanents (limite connue du niveau moyen, `docs/ia.md`).


## Préconstruit Multiverse Reforged (Réalité fracturée) : Jace, architecte du multivers ✅ (282 / 282)

Ajouté le 06/10/2026 à la demande de l'utilisateur. Liste officielle du préconstruit « Multiverse Reforged » de Reality Fracture (MTGJSON, relevée le 06/10/2026), dans `docs/commander/decks/multiverse-reforged.txt` ; préconstruit `cmd-multiverse-reforged` (blanc, bleu, noir, rouge ; aucun Game Changer, tranche estimée 1–2).

**Import :** 57 cartes absentes du catalogue ajoutées à EDH, toutes avec leur texte français.

**Cartes (57, `edh/multiverse.ts` et `edh/lands.ts`) :** Jace, Multiverse Architect ; créatures : Akroma, Angel of Fury, Archfiend of Despair, Archon of Cruelty, Avacyn, Angel of Horror, Dack Fayden, Helping Hand, Darksteel Angel, Ginger, Queen of Sweets, Jhoira, Weatherlight Corsair, Memnarch, the Warden, Nissa, Leyline Tamer, Niv-Mizzet, Ghost Counsel, Ob Nixilis, the Ascended, Omnath, Locus of the Void, Serra's Emissary, Tamiyo, Upriser Crowned, The Ur-Sphinx, Venser, Fervent Forger ; Elspeth, Sun's Champion ; artefacts et enchantements : Azorius, Dimir et Izzet Signet, Talisman of Creativity, Currency Converter, Cursed Mirror, Proteus Staff, Staff of the Storyteller, Dreadhorde Invasion, Shark Typhoon, Skrelv's Hive, Whirlwind of Thought ; sorts : Brainsurge, Despark, Fact or Fiction, Grand Crescendo, Lingering Souls, Martial Coup, Mass Polymorph, Occult Epiphany, Secure the Wastes, Sunfall, Synthetic Destiny, Teferi's Reproach, White Sun's Twilight ; terrains : Battlefield Forge, Clifftop Retreat, Contaminated Landscape, Fetid Heath, Kher Keep, Mystic Gate, Perilous Landscape, Radiant Summit, Shivan Reef, Sulfur Falls, Turbulent Crater, Turbulent Shore, Turbulent Wetlands.

- **Moteur :**
  - monarque (724) : `GameState.monarch`, `fx.becomeMonarch`, `cond.monarch` ; pioche au début de l'étape de fin du monarque, transfert à un joueur dont une créature lui inflige des blessures de combat, monarchie transmise quand le monarque quitte la partie ; couronne sur le plateau, avec une bulle d'aide ;
  - toxique (702.164) : `CardDef.toxic` et `TokenSpec.toxic`, marqueurs poison en plus des blessures de combat à un joueur ; corrompu par `amount.poison` ;
  - piles séparées par un adversaire (`piles` et `opponentSeparates`, Fact or Fiction) ; révélation dans la bibliothèque d'un autre joueur (`revealUntilN` et `who`, Dack Fayden) ;
  - « ses créatures ne peuvent pas attaquer vos Jace » (`cantAttackPlaneswalkers`) ; protection d'un joueur contre un filtre (Serra's Emissary : le type de carte choisi) ;
  - effets « jusqu'au prochain tour de ce joueur » (`fx.untilTheirNextTurn`, Teferi's Reproach) ; PV payés en montant variable (`fx.mayPayLife`, Niv-Mizzet) ;
  - mana inutilisé comme montant (`amount.manaInPool`, Omnath) ; incuber (701.53) ;
  - le déclencheur des blessures de combat groupées transmet toutes les créatures concernées (`ref.eventObjects`), et peut se limiter à celles qui vous blessent (`toYou`, Tamiyo).
  - correction trouvée par le fuzz strict : une F/E définie par le mana inutilisé (Omnath) fait dépendre le cache des caractéristiques de la réserve de mana.
- **Tests :** `engine/test/edh-multiverse.test.ts` (21) ; fuzz Commander strict à 2 et 4 joueurs propre.
- **Approximations :** Dack Fayden (provocation), Cursed Mirror, monarque (pioche et transfert au combat sans la pile, levés par PLAN-H H6), Incubateur, The Ur-Sphinx.
- **Équilibre** (IA moyenne des deux côtés, `--by-deck --deck cmd-multiverse-reforged`, contre les cinq autres préconstruits à tour de rôle) : en duel, 52,3 % ± 4,0 (596 parties décidées, 19 tours) ; à quatre (sièges A, B, A, B), 48,3 % ± 5,7 (294 parties décidées, 45 tours). Dans la cible. Une partie à quatre ne finissait jamais : Dack Fayden avait distribué des Darksteel Angel, et chaque joueur, à PV négatifs, ne pouvait pas perdre (conforme aux règles) ; l'arène compte désormais inachevée une partie de Commander de plus de 150 tours (`maxTurns`). Des décisions de l'IA moyenne de plus de 3 minutes sur un plateau de 160 permanents (limite connue, `docs/ia.md`).

## Préconstruit Turtle Power! (Tortues Ninja) : Heroes in a Half Shell ✅ (350 / 350)

Ajouté le 06/10/2026 à la demande de l'utilisateur. Liste officielle du préconstruit « Turtle Power! » de Teenage Mutant Ninja Turtles (MTGJSON, relevée le 06/10/2026), dans `docs/commander/decks/turtle-power.txt` ; préconstruit `cmd-turtle-power` (cinq couleurs ; aucun Game Changer, tranche estimée 1–2). Les 20 cartes de Teenage Mutant Ninja Turtles (TMT) du deck étaient déjà jouables.

**Import :** 68 cartes absentes du catalogue ajoutées à EDH ; Double Jump // Flying Kick n'a jamais été imprimée en français : texte traduit à la main (« Double saut // Coup de pied volant », `french-overrides.json`, qui accepte désormais le texte de chaque face).

**Cartes (68, `edh/turtles.ts`, `edh/lands.ts` et `edh/commander.ts`) :** Heroes in a Half Shell ; personnages : April O'Neil, Live on the Scene, Baxter, Fly in the Ointment, Bebop, Skull & Crossbones, Casey Jones, Back Alley Brute, Donatello, the Brains, Irma, Part-Time Mutant, Krang, the All-Powerful, Leatherhead, Iron Gator, Leonardo, the Balance, Michelangelo, the Heart, Raphael, the Muscle, Rat King, Pale Piper, Ray Fillet, Wave Warrior, Rocksteady, Mutant Marauder, Shredder, Shadow Master, Splinter, the Mentor, Tempestra, Dame of Games, Tokka & Rahzar, Unsupervised ; autres créatures : Acidic Slime, Big Mother Mouser, Biogenic Ooze, Corpsejack Menace, Dimension X Pizzasaur, Electric Seaweed, Roadkill Rodney, Steelbane Hydra, Vigor, Voracious Hydra ; artefacts : Arcade Cabinet, Coin of Mastery, Exploding Barrel, Foot Chopper, Mole Module ; enchantements : Endless Foot Assault, High Score, Level Up, Ninja Pizza, Together Forever ; sorts : Blasphemous Act, Continue?, Cultivate, Double Jump // Flying Kick, Fast Forward, Game Over, Harmonize, Here Comes a New Hero!, Shellshock, Special Move, Super Combo, Swift Demise, Vanquish the Horde, Wave Goodbye ; terrains : Ash Barrens, Big Apple, 3 a.m., Cinder Glade, Grand Coliseum, Hidden Hideout, Hinterland Harbor, Rain-Slicked Copse, Rootbound Crag, Sodden Verdure, Spire Garden, Thriving Grove, Thriving Isle, Thriving Moor, Undergrowth Stadium, Vernal Fen.

- **Moteur :**
  - escouade (702.157), lue dans le texte : le coût d'escouade est un kicker payé X fois, comme la réplique (`kickerKind: "squad"`, `kickerPaidTimes`) ; en arrivant, autant de jetons copies ;
  - fusion (702.102), lue dans le texte : une troisième face des cartes scindées (cibles et effets des deux moitiés, coût total), lançable depuis la main seulement ;
  - évolution (Ray Fillet) : la comparaison de montants (`cond.amountGreater`) est évaluée au déclenchement ; le X d'un permanent est connu dès son arrivée ;
  - mana d'artefact dépensé pour lancer un sort (`amount.artifactManaSpent`, Coin of Mastery ; le mana produit en trop n'est pas compté) ;
  - jetons qui attaquent un joueur désigné (`createTappedTokens(…, { attacking: p })`, Endless Foot Assault) ; copies sacrifiées à la fin du combat (`atEndOfCombat: "sacrifice"`, Shredder ; la myriade les exile) ;
  - adversaires attaqués ce tour-ci (`amount.opponentsAttackedThisTurn`, Fast Forward) ; PV de départ (`amount.startingLife`, `cond.someoneAtHalfStartingLife`, Game Over) ; marqueurs de toutes sortes parmi des permanents (`countersAmong(…, "any")`) ;
  - déclenchements dus à une pioche doublés (`TriggerMod.on: "draw"`, Krang) ; blessures prévenues changées en marqueurs sur le permanent protégé (`onPrevent.countersOnDamaged`, Vigor) ;
  - couleur exclue d'un choix en arrivant (`chooseOnEnter: "color"` et `enterModes`, terrains Thriving).
- **Tests :** `engine/test/edh-turtles.test.ts` (18) ; menu de lancement de la fusion vérifié dans le navigateur (`test-results/fuse/`).
- **Approximations :** Fast Forward (provocation), Vigor (mise au cimetière), Shredder (attaque d'un planeswalker), Coin of Mastery (mana produit en trop).
- **Équilibre** (IA moyenne, `--by-deck --deck cmd-turtle-power`) : en duel, 47,4 % ± 4,0 (597 parties décidées, 19 tours) ; à quatre (sièges A, B, A, B), 35,7 % ± 5,4 (297 parties décidées, 42 tours), sous la part équitable de 50 % ; à étudier dans l'IA d'abord (attaques groupées des Tortues, marqueurs), la liste officielle n'est pas retouchée.

## Préconstruits Counter Blitz, The Fantastic Four et Mutant Menace ✅ (521 / 521)

Ajoutés le 07/10/2026 à la demande de l'utilisateur : trois listes officielles relevées dans MTGJSON (`docs/commander/decks/counter-blitz.txt`, `fantastic-four.txt`, `mutant-menace.txt`) ; préconstruits `cmd-counter-blitz` (Tidus, Yuna's Guardian, vert, blanc, bleu ; un Game Changer, Farewell, tranche estimée 3), `cmd-fantastic-four` (Invisible Woman, blanc, bleu, rouge, vert ; aucun Game Changer) et `cmd-mutant-menace` (The Wise Mothman, bleu, noir, vert ; aucun Game Changer).

**Import :** 171 cartes absentes du catalogue ajoutées à EDH. Resourceful Defense n'a chez Scryfall qu'une impression française au texte anglais : texte français complété à la main (`french-overrides.json`) ; l'import par nom trouve maintenant ces textes aussi par le nom complet d'une carte à plusieurs faces (Double Jump // Flying Kick).

**Counter Blitz (67, `edh/counterblitz.ts`, `edh/lands.ts`) :** Tidus, Yuna's Guardian ; gardiens et légendes : Auron, Gatta and Luzzu, Kimahri, Lord Jyscal Guado, Lulu, Maester Seymour, O'aka, Rikku, Shelinda, Sin, Tromell, Wakka, Yuna, Grand Summoner ; créatures : Altered Ego, Bane of Progress, Chasm Skulker, Chocobo Knights, Duskshell Crawler, Fathom Mage, Forgotten Ancient, Generous Patron, Grateful Apparition, Gyre Sage, Incubation Druid, Luminous Broodmoth, Rampant Rejuvenator, Scholar of New Horizons, Sunscorch Regent ; invocations : Summon: Ixion, Magus Sisters, Valefor, Yojimbo ; artefacts et enchantements : Blitzball Stadium, Bred for the Hunt, Everflowing Chalice, Fight Rigging, Inexorable Tide, Path of Discovery, Resourceful Defense, Sphere Grid, Summoner's Sending ; sorts : Collective Effort, Damning Verdict, Destroy Evil, Promise of Loyalty, Protection Magic, Pull from Tomorrow, Three Visits, Yuna's Decision, Yuna's Whistle ; terrains : Brushland, Canopy Vista, Flooded Grove, Forge of Heroes, Fortified Village, Idyllic Beachfront, Overflowing Basin, Port Town, Radiant Grove, Seaside Citadel, Skycloud Expanse, Sungrass Prairie, Sunpetal Grove, Tangled Islet, Temple of the False God, Vineglimmer Snarl.

**The Fantastic Four (47, `edh/fantastic.ts`) :** Invisible Woman ; héros : Alicia Masters, Black Bolt, Council of Reeds, Crystal, Dragon Man, Franklin Richards, Galactus, H.E.R.B.I.E., Human Torch, Lockjaw, Medusa, Mister Fantastic, Namor, Power Pack, Silver Surfer, The Thing, Valeria Richards, Willie Lumpkin ; artefacts et enchantements : Cosmic Crucible, Mind's Dilation, Mirage Mirror, Monologue Tax, Negative Zone Portal, The Fantasticar, Unstable Molecule Suit ; sorts : Cleansing Nova, Clever Concealment, Cut a Deal, Deep Analysis, Fantastic Elasticity, First Family, Flame On!, Galvanic Iteration, Hull Breach, Into the Time Vortex, Invisible Force Field, It's Clobberin' Time!, Nova Flame, Recurring Insight, Seize the Day, Taunt from the Rampart, Terramorph, Tragic Arrogance, Ultimate Nullification ; terrains : Rejuvenating Springs, Scorched Geyser.

**Mutant Menace (57, `edh/mutant.ts`, `edh/lands.ts`) :** The Wise Mothman ; Mutants et légendes : Agent Frank Horrigan, Alpha Deathclaw, Hancock, Harold and Bob, Jason Bright, Lily Bowen, Marcus, Piper Wright, Raul, Strong, The Master ; créatures : Bloatfly Swarm, Cathedral Acolyte, Feral Ghoul, Glowing One, Infesting Radroach, Lumbering Megasloth, Mirelurk Queen, Nightkin Ambusher, Rampaging Yao Guai, Screeching Scorchbeast, Tato Farmer, Vexing Radgull, Watchful Radstag, Winding Constrictor, Young Deathclaws ; artefacts et enchantements : Branching Evolution, Contagion Clasp, Guardian Project, Nuka-Nuke Launcher, Power Fist, Recon Craft Theta, Strength Bobblehead, Struggle for Project Purity, Vault 12: The Necropolis, Vault 87: Forced Evolution ; sorts : Atomize, Biomass Mutation, Casualties of War, Contaminated Drink, Find // Finality, Mutational Advantage, Nuclear Fallout, Putrefy, Radstorm, Rampant Growth ; terrains : Darkwater Catacombs, Fetid Pools, Mariposa Military Base, Mortuary Mire, Tainted Isle, Tainted Wood, Viridescent Bog, Woodland Cemetery ; talismans : Curiosity, Resilience.

- **Moteur :**
  - marqueurs de radiation (Fallout) : `PlayerState.rad`, `fx.rad`, `amount.rad` ; au début de sa première phase principale, un joueur qui en a meule autant de cartes et perd 1 PV et un marqueur par carte non-terrain meulée (Strong : il gagne des PV, `radiationGains`) ; la prolifération en donne un de plus ; pastille ☢ sur le plateau et ligne du journal ;
  - meule groupée : `millCards` (une seule meule, un seul événement `milled`), déclencheur « chaque fois qu'une ou plusieurs cartes [non-terrain] sont meulées » (`{ on: "milled", whose, nonland }`, `amount.eventAmount` : leur nombre), filtre « meulée ce tour-ci » (`milledThisTurn`, carte arrivée de la bibliothèque au cimetière pendant ce tour) ;
  - multikicker (702.33c, Everflowing Chalice), lu dans le texte comme l'escouade ; « Equip commander {N} » lu dans le texte (une capacité d'Équiper de plus, qui ne cible qu'un commandant) ;
  - contrôle rendu à chaque propriétaire (`fx.returnControlToOwners`, Alicia Masters) ; « garder un permanent de chaque type » sans les terrains (`keepOnePerType(…, true)`, Tragic Arrogance) ; sort mis au-dessous de la bibliothèque (`fx.bottomOnResolve`) ; « chaque adversaire renvoie en main une créature de plus grande valeur de mana » (`sacrifice(…, { to: "hand" })`, l'ancien `exile: true` devient `to: "exile"`) ;
  - F/E définies par le maximum de deux montants et par la plus grande valeur de mana d'un cimetière (Dragon Man) ; total d'un montant parmi les joueurs (`amount.sumOverPlayers`, Vault 12) ; évolution partagée (`evolve`, `edh/common.ts`).
  - correction signalée par l'utilisateur : « la première fois que cette capacité se résout ce tour-ci » n'était jamais remis à zéro (Nissa, Leyline Tamer ne révélait une créature qu'une fois par partie ; Belladonna Took aussi) ; test dans `edh-multiverse.test.ts` ;
  - corrections trouvées par le fuzz strict : les marqueurs de radiation et poison font avancer le cache des caractéristiques (Nightkin Ambusher, corrompu).
- **Tests :** `engine/test/edh-counterblitz.test.ts` (17), `edh-fantastic.test.ts` (11), `edh-mutant.test.ts` (13), Nissa (1) ; fumée EDH (521 cartes).
- **Équilibre** (IA moyenne des deux côtés, `--by-deck --deck cmd-<id>`, contre les huit autres préconstruits à tour de rôle ; 400 parties en duel, 150 à quatre, sièges A, B, A, B, part équitable 50 %) :

  | Préconstruit | Duel | À quatre |
  |---|---|---|
  | Counter Blitz | 46,8 % ± 4,9 | 45,0 % ± 8,0 |
  | The Fantastic Four | 30,1 % ± 4,5 | 32,4 % ± 7,5 |
  | Mutant Menace | 42,7 % ± 4,9 | 39,2 % ± 7,9 |

  The Fantastic Four est nettement faible : l'IA joue peu de sorts non-créature avant le combat (ce qui éveille ses héros) et paie rarement {R}{G}{W}{U} ; à étudier dans l'IA d'abord, la liste officielle n'est pas retouchée. Une décision de l'IA moyenne de 50 s à quatre joueurs (plateau chargé).
- **Outils :** budgets du bundle relevés (chunk `commander` 551 Ko pour un budget de 800 Ko, table des impressions 466 Ko pour 600 Ko).
- **Approximations :** voir `docs/approximations.md` (radiation sans la pile, levée par PLAN-H H6 ; Sin, Altered Ego, Collective Effort, Forgotten Ancient, Resourceful Defense, Yuna, Grand Summoner, Fathom Mage, Promise of Loyalty, Deep Analysis, First Family, Galactus, Namor, Black Bolt, Silver Surfer, Willie Lumpkin, Tragic Arrogance, Negative Zone Portal, Cut a Deal, Taunt from the Rampart, Hancock, Harold and Bob, Jason Bright, Lumbering Megasloth, Nightkin Ambusher, Nuka-Nuke Launcher, Young Deathclaws, Winding Constrictor, Mariposa Military Base, Finality, Mutational Advantage).

