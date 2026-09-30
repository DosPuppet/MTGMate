# Plan P4 — couverture guidée par le méta, puis Tarkir: Dragonstorm

Plan établi le 29/09/2026 (branche `dev`) : il sert de feuille de route aux prochaines sessions.

## Suivi

- **Lot M1 fait le 29/09/2026** : Izzet Spellementals et Mono-Green Landfall jouables, réserve comprise (22 cartes). Détail dans `docs/extensions/meta.md`. Le test « méta » (`cards/test/meta-decks.test.ts`), `fuzz --pool meta` et `verify --set META` existent.
- **Lot M2 fait le 29/09/2026** : Dimir Midrange et Jund Sacrifice (23 cartes ; flétrir, Travail d'équipe, amasser).
- **Lot M3 fait le 29/09/2026** : Dimir Excruciator, Azorius Control, Selesnya Landfall (15 cartes ; évocation, mobilisation, montée en puissance, réunir des preuves, copie depuis un cimetière).
- **Lot M4 fait le 29/09/2026** : 4c Control, Boros Dragons, Jeskai Artifacts (23 cartes ; type de terrain choisi en jouant le terrain, exploiter, convergence, maîtrise du feu).
- **Lot M5 fait le 29/09/2026** : Boros Dwarves, Lifegain, Mardu Discard, Boros Tokens (34 cartes ; Storied, faufilement, chaos, paradigme, équiper digne).
- **Lot M6 fait le 30/09/2026** : les six derniers archétypes (47 cartes ; maîtrise de l'air, Web-slinging, payer X PV, tours passés). **La phase 1 est finie : les vingt archétypes relevés (88,1 % du méta) sont jouables, réserve comprise.**
- **30/09/2026** : les cinq premiers decks du méta (Izzet Spellementals, Mono-Green Landfall, Dimir Midrange, Jund Sacrifice, 4c Control) sont proposés comme decks préconstruits, réserve comprise (`packages/cards/decks/meta-*.json`, test `cards/test/meta-decks.test.ts`).
- À faire : la phase 2 (Tarkir: Dragonstorm à 100 %).

## Décision

Choisie par l'utilisateur le 29/09/2026 :

1. **D'abord le méta** : on écrit les cartes qui manquent pour jouer les decks Standard les plus joués, toutes extensions confondues.
2. **Ensuite, extension par extension**, en commençant par **Tarkir: Dragonstorm (TDM)**, à 100 %.

C'est une exception assumée à la règle « une extension à la fois, à 100 % » de CLAUDE.md : pendant la phase méta, des extensions seront partiellement couvertes. Le deckbuilder continue d'afficher les cartes non gérées en grisé.

## État de départ

- Couverture : 2 753 / 5 174 cartes gérées (53 %). Extensions complètes : FDN, FRA, EOE, DFT, OTJ, BIG, BLB, DSK, LCI, FIN.
- Extensions à 0–5 cartes : TDM (259), WOE (269), SOS (262), ECL (266), TLA (280), SPM (188), MSH (271), TMT (188), HOB (188), MKM (268), soit environ 2 400 cartes.

## Source et méthode

- **Source :** méta Standard de MTGGoldfish, parties en ligne, 30 derniers jours, relevé le 29/09/2026 (page `/metagame/standard/full`) ; pour chaque archétype, la liste représentative de sa page (champ `deck_input[deck]`). Le lien de téléchargement des decks est bloqué par Cloudflare, pas les pages d'archétype.
- **Instantané :** les 20 premiers archétypes (**88,1 % du méta**) sont gardés dans `docs/meta/2026-09-29/` (un fichier texte par deck, deck puis réserve), pour refaire l'analyse ou en faire des decks de test.
- **Analyse :** chaque liste est lue par `parseDeckList` (le lecteur de decklists du projet) ; une carte « manquante » est une carte non gérée (`implemented: false`). Toutes les cartes des listes sont reconnues (aucun nom inconnu).
- **Ordre des lots :** glouton, le deck qui apporte le plus de part de méta par carte nouvelle d'abord ; les decks sont ensuite regroupés en lots de 14 à 45 cartes.

## Ce qui manque

| Archétype | Méta | Cartes manquantes (deck) | Réserve |
|---|---|---|---|
| Izzet Spellementals | 15,5 % | 11 | 5 |
| Mono-Green Landfall | 13,4 % | 6 | 4 |
| Dimir Midrange | 8,3 % | 7 | 6 |
| Jund Sacrifice | 6,5 % | 10 | 7 |
| 4c Control | 6,4 % | 16 | 3 |
| Boros Dwarves | 5,4 % | 11 | 2 |
| Boros Dragons | 5,3 % | 10 | 1 |
| Dimir Excruciator | 4,3 % | 10 | 5 |
| Azorius Control | 3,5 % | 6 | 4 |
| Mardu Discard | 2,6 % | 11 | 2 |
| Boros Tokens | 2,5 % | 12 | 2 |
| Jeskai Artifacts | 2,2 % | 7 | 2 |
| Lifegain | 2,2 % | 8 | 3 |
| Golgari Midrange | 2,0 % | 18 | 6 |
| Selesnya Landfall | 1,7 % | 6 | 1 |
| Bant Airbending Combo | 1,4 % | 12 | 1 |
| Azorius Momo | 1,3 % | 11 | 5 |
| Izzet Aggro | 1,2 % | 6 | 1 |
| Jeskai Control | 1,2 % | 16 | 5 |
| Mono-Black Aggro | 1,2 % | 6 | 3 |

- **145 cartes distinctes** dans les decks principaux (environ 20 de plus en réserve), soit 6 % des cartes manquantes pour 88 % du méta.
- Par extension (decks principaux) : SOS 23, TLA 23, TDM 21, HOB 17, ECL 15, MSH 14, WOE 10, MKM 8, TMT 8, SPM 6.
- Cartes les plus rentables : Requiting Hex (9 decks), Erode (12 decks), Strategic Betrayal (10 decks), Deadly Cover-Up (5), Hallowed Fountain (6), Wan Shi Tong (6), Spell Snare, Steam Vents, Great Hall of the Biblioplex, Winternight Stories.
- Beaucoup de cartes sont simples : terrains choc de Lorwyn Eclipsed (Steam Vents, Hallowed Fountain, Blood Crypt, Overgrown Tomb, Temple Garden : la mécanique existe), terrains à surveillance de Murders at Karlov Manor (Thundering Falls, Meticulous Archive, Underground Mortuary), sorts courants.

## Mécaniques nouvelles à écrire

Relevées sur les 145 cartes (mots-clés Scryfall) ; chaque mécanique se fait dans le premier lot qui en a besoin, de façon générique pour servir ensuite à l'extension entière :

| Extension | Mécaniques | Cartes du méta concernées |
|---|---|---|
| TLA | maîtrise de l'air, de la terre, du feu (airbend, earthbend, firebend), Leçons | Aang, Appa, Airbender Ascension, Ba Sing Se, Earthbender Ascension, Firebending Lesson… |
| TDM | Behold, Mobilize, Harmonize | Voice of Victory, Stadium Headliner, Winternight Stories, Channeled Dragonfire, Dispelling Exhale, Sarkhan (Behold sert aussi à Elven Passage, de The Hobbit) |
| ECL | Blight, Evoke (Deceit, Emptiness) | Requiting Hex, Pyrrhic Strike |
| SOS | Opus, Paradigm, Infusion ; « préparé » existe déjà (FRA) | Colorstorm Stallion, Decorum Dissertation, Moseo, Emeritus of Ideation |
| HOB | Storied | Thorin Oakenshield, Kíli the Resourceful |
| TMT | Sneak | Michelangelo's Technique, The Last Ronin's Technique |
| SPM | Mayhem, Mind Swap, Web-slinging | Carnage, Superior Spider-Man, Spider-Sense |
| MSH | Power-up, Teamwork | Captain Marvel, We Say Thee Nay! |
| MKM | Collect evidence ; les Affaires (719) sont déjà gérées par le moteur | Deadly Cover-Up, Case of the Uneaten Feast |
| WOE | Bargain (les aventures existent déjà) | Torch the Tower, Hearth Elemental, Scalding Viper… |

Déjà gérés par le moteur : affinité, convergence, changelin, flashback, garde, équipement, surveillance, cartes recto-verso et aventures, Affaires, cartes « préparées ».

## Phase 1 — le méta (lots M1 à M6)

Chaque lot : les cartes des decks principaux, plus leur réserve (le BO3 en a besoin). Un commit par lot, comme pour une extension.

### Lot M1 — 17 cartes, 28.9 % du méta (cumul 28.9 %)

- Decks rendus jouables : Mono-Green Landfall (13.4 %), Izzet Spellementals (15.5 %).
- Cartes des decks principaux :
  - **SOS** (4) : Great Hall of the Biblioplex, Impractical Joke, Prismari Charm, Traumatic Critique
  - **ECL** (4) : Sapling Nursery, Spell Snare, Steam Vents, Sunderflock
  - **TLA** (2) : Ba Sing Se, Earthbender Ascension
  - **WOE** (2) : Hearth Elemental // Stoke Genius, Sleight of Hand
  - **TDM** (2) : Surrak, Elusive Hunter, Winternight Stories
  - **HOB** (1) : Elven Passage
  - **TMT** (1) : Escape Tunnel
  - **MKM** (1) : Thundering Falls
- Cartes de réserve de ces decks (5), à faire dans le même lot pour le BO3 :
  - **SPM** (2) : Hydro-Man, Fluid Felon, Sandman, Shifting Scoundrel
  - **TMT** (1) : Leatherhead, Swamp Stalker
  - **ECL** (1) : Sear
  - **WOE** (1) : Torch the Tower

### Lot M2 — 15 cartes, 14.8 % du méta (cumul 43.7 %)

- Decks rendus jouables : Dimir Midrange (8.3 %), Jund Sacrifice (6.5 %).
- Cartes des decks principaux :
  - **TLA** (4) : Callous Inspector, Deadly Precision, Obsessive Pursuit, Wan Shi Tong, Librarian
  - **MSH** (4) : Hidden Lair, The Wondrous Wasp, We Say Thee Nay!, Wolverine, Fierce Fighter
  - **ECL** (3) : Blood Crypt, Overgrown Tomb, Requiting Hex
  - **HOB** (2) : Azog, Moria's Ruin, The Sackville-Bagginses
  - **TMT** (2) : Dream Beavers, Mutagen Man, Living Ooze
- Cartes de réserve de ces decks (8), à faire dans le même lot pour le BO3 :
  - **TLA** (2) : Day of Black Sun, Raven Eagle
  - **SOS** (2) : Professor Dellian Fel, Witherbloom Charm
  - **WOE** (1) : Disdainful Stroke
  - **TDM** (1) : Strategic Betrayal
  - **TMT** (1) : The Ooze
  - **MKM** (1) : Vengeful Tracker

### Lot M3 — 14 cartes, 9.5 % du méta (cumul 53.2 %)

- Decks rendus jouables : Dimir Excruciator (4.3 %), Azorius Control (3.5 %), Selesnya Landfall (1.7 %).
- Cartes des decks principaux :
  - **MKM** (3) : Deadly Cover-Up, Meticulous Archive, No More Lies
  - **ECL** (3) : Deceit, Hallowed Fountain, Temple Garden
  - **SOS** (3) : Emeritus of Ideation, Erode, Petrified Hamlet
  - **TLA** (2) : Day of Black Sun, Shared Roots
  - **MSH** (1) : M.O.D.O.K.
  - **TDM** (1) : Strategic Betrayal
  - **SPM** (1) : Superior Spider-Man
- Cartes de réserve de ces decks (3), à faire dans le même lot pour le BO3 :
  - **TDM** (2) : Qarsi Revenant, Voice of Victory
  - **MSH** (1) : Captain Marvel, Earth's Protector

### Lot M4 — 23 cartes, 13.9 % du méta (cumul 67.1 %)

- Decks rendus jouables : 4c Control (6.4 %), Boros Dragons (5.3 %), Jeskai Artifacts (2.2 %).
- Cartes des decks principaux :
  - **TDM** (11) : Clarion Conqueror, Dispelling Exhale, Inevitable Defeat, Jeskai Revelation, Maelstrom of the Spirit Dragon, Magmatic Hellkite, Mistrise Village, Sarkhan, Dragon Ascendant, Twinmaw Stormbrood // Charring Bite, United Battlefront, Voice of Victory
  - **SOS** (4) : Flashback, Sundown Pass, Tablet of Discovery, Together as One
  - **MSH** (3) : Castle Doom, The Mind Stone, Thor, God of Thunder
  - **WOE** (1) : Candy Trail
  - **ECL** (1) : Firdoch Core
  - **TLA** (1) : Momo, Friendly Flier
  - **SPM** (1) : Multiversal Passage
  - **HOB** (1) : Smaug the Magnificent
- Cartes de réserve de ces decks (1), à faire dans le même lot pour le BO3 :
  - **TLA** (1) : The Legend of Roku // Avatar Roku

### Lot M5 — 32 cartes, 12.7 % du méta (cumul 79.8 %)

- Decks rendus jouables : Boros Dwarves (5.4 %), Lifegain (2.2 %), Mardu Discard (2.6 %), Boros Tokens (2.5 %).
- Cartes des decks principaux :
  - **HOB** (8) : Belladonna Took, Bofur, Reliable Guardian // Concerted Care, Dwarven Mauler, Dáin's Company, Kíli the Resourceful, The Lonely Mountain, Thorin Oakenshield, Thorin, Mountain-king
  - **TDM** (5) : Dalkovan Encampment, Dragonfire Blade, Frontline Rush, Stadium Headliner, Tersa Lightshatter
  - **TMT** (4) : Casey Jones, Vigilante, Cool but Rude, Skateboard, The Last Ronin's Technique
  - **SOS** (4) : Hardened Academic, Moseo, Vein's New Dean, Practiced Offense, Shattered Sanctum
  - **ECL** (3) : Emptiness, Iron-Shield Elf, Moonshadow
  - **SPM** (2) : Aunt May, Carnage, Crimson Chaos
  - **MKM** (2) : Case of the Uneaten Feast, Warleader's Call
  - **MSH** (2) : Mjölnir, Hammer of Thor, Political Triumph
  - **WOE** (2) : Song of Totentanz, Torch the Tower
- Cartes de réserve de ces decks (3), à faire dans le même lot pour le BO3 :
  - **HOB** (1) : Bilbo's Gambit
  - **SOS** (1) : Decorum Dissertation
  - **ECL** (1) : Pyrrhic Strike

### Lot M6 — 44 cartes, 8.3 % du méta (cumul 88.1 %)

- Decks rendus jouables : Izzet Aggro (1.2 %), Mono-Black Aggro (1.2 %), Azorius Momo (1.3 %), Golgari Midrange (2 %), Bant Airbending Combo (1.4 %), Jeskai Control (1.2 %).
- Cartes des decks principaux :
  - **TLA** (14) : Aang, Swift Savior // Aang and La, Ocean's Fury, Aang, at the Crossroads // Aang, Destined Savior, Abandon Attachments, Abandoned Air Temple, Accumulate Wisdom, Airbender Ascension, Appa, Steadfast Guardian, Combustion Technique, Firebending Lesson, Heartless Act, Iroh's Demonstration, It'll Quench Ya!, Price of Freedom, Realm of Koh
  - **SOS** (8) : Colorstorm Stallion, Daydream, Deathcap Glade, Dissection Practice, Professor Dellian Fel, Stormcarved Coast, Vibrant Outburst, Witherbloom Charm
  - **WOE** (5) : Bramble Familiar // Fetch Quest, Mosswood Dreadknight // Dread Whispers, Restless Cottage, Scalding Viper // Steam Clean, The End
  - **HOB** (5) : Chief Warg's Company, Desolation Prowler, Gollum, Riddle Master, Head of the Hunt, Nighthowl Pursuer
  - **MSH** (4) : Avengers Disassembled, Doctor Doom, Gleaming Bastion, Jennifer Walters // The Sensational She-Hulk
  - **TDM** (2) : Channeled Dragonfire, Sage of the Skies
  - **SPM** (2) : Interdimensional Web Watch, Spider Manifestation
  - **MKM** (2) : Steamcore Scholar, Underground Mortuary
  - **TMT** (1) : Michelangelo's Technique
  - **ECL** (1) : Springleaf Drum
- Cartes de réserve de ces decks (5), à faire dans le même lot pour le BO3 :
  - **SOS** (2) : Ral Zarek, Guest Lecturer, Vicious Rivalry
  - **TLA** (1) : Avatar's Wrath
  - **TDM** (1) : Heritage Reclamation
  - **SPM** (1) : Spider-Sense

## Phase 2 — Tarkir: Dragonstorm à 100 %

- 259 cartes, dont environ 23 faites en phase 1 (Strategic Betrayal, Winternight Stories, Voice of Victory, Surrak, Sarkhan…).
- Découpage habituel : lot A (cartes faisables avec le moteur, jetons, terrains), lot B (mécaniques phares : Behold, Mobilize et Harmonize faites en phase 1, Omen déjà géré par le moteur ; Flurry, Renew, Endure ; dragons), lots C et suivants (légendaires, cartes uniques) jusqu'à 100 %.
- Ensuite, les autres extensions une à une, dans l'ordre que choisira l'utilisateur (suggestion : celles que la phase 1 aura le plus entamées, SOS et TLA).

## Vérification, par lot

- `npm run verify -- --set <EXT>` pour chaque extension touchée par le lot, puis `npm run verify -- --full` avant le commit (tests de fumée par carte, audit Oracle ↔ script, attentes de l'Oracle).
- **Nouveau test « méta » :** `cards/test/meta-decks.test.ts` lit `docs/meta/2026-09-29/` et vérifie que chaque deck des lots terminés est légal et jouable (`validateDeck`) ; la liste des decks attendus jouables grandit à chaque lot. Un fuzz sur ces decks (`npm run fuzz -- --pool meta`, nouvelle option) joue des parties entre decks du méta.
- En fin de phase 1 : les decks du méta deviennent des decks préconstruits proposés dans le deckbuilder (« Decks du méta, 29/09/2026 »), à valider avec l'utilisateur.

## Mises à jour de suivi

- CLAUDE.md : une ligne d'avancement par lot (phase méta, puis TDM) ; la règle « une extension à la fois » est précisée (exception de la phase méta).
- `docs/extensions/<ext>.md` : le détail de chaque lot dans l'extension concernée (un lot méta touche plusieurs extensions : une section par extension).
- README : tableau des extensions (cartes gérées) à jour à chaque lot.

## Limites et risques

- **Méta daté :** instantané du 29/09/2026, parties en ligne (MTGO) ; il bouge vite. Refaire l'analyse (même méthode) avant chaque lot si plusieurs semaines ont passé.
- **Listes représentatives :** une seule liste par archétype ; des variantes peuvent utiliser d'autres cartes.
- **Extensions partielles :** pendant la phase 1, dix extensions sont entamées sans être finies ; les decks personnels des joueurs peuvent contenir des cartes encore grisées.
