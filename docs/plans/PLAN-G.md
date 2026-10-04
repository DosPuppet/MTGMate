# PLAN-G — Special Guests et rééditions, jouables en « Sans limite » (04/10/2026)

## Contexte

Avec la plupart des extensions du Standard sortent des rééditions qui ne sont pas légales en Standard : les Special Guests
(ensemble SPG) et des feuilles bonus (Enchanting Tales, Breaking News…). Le format « Sans limite » accepte toute carte du
catalogue : ces rééditions doivent donc y entrer, **avec l'illustration de la réédition** et non celle de la carte
d'origine.

Recensement Scryfall du 04/10/2026, pour les 20 extensions de l'appli :

| Ensemble | Extension | Cartes nouvelles | Déjà dans l'appli | Français sur Scryfall |
|---|---|---|---|---|
| Special Guests (SPG) | LCI, MKM, OTJ, BLB, DSK, FDN, DFT, TDM, EOE, ECL, SOS, FRA | 130 | 3 | oui |
| Stellar Sights (EOS) | EOE | 42 | 2 | non |
| Enchanting Tales (WOT) | WOE | 56 | 7 | oui |
| Breaking News (OTP) | OTJ | 62 | 3 | oui |
| Through the Ages (FCA) | FIN | 50 | 3 | non |
| Mystical Archive (SOA) | SOS | 34 | 25 | oui |
| Source Material (PZA) | TMT | 16 | 2 | oui |
| Jurassic World Collection (REX) | LCI | 20 | 0 | oui |
| **Total** | | **410** | **44** | |

**Cartes à mécanique propre au Commander, exclues pour l'instant** (15, à reprendre avec Commander) : une partie de la
carte ne fonctionne qu'en Commander (partenaire, éminence, ninjutsu de commandant, zone de commandement, identité de
couleur du commandant, « si vous contrôlez un commandant »).

| Ensemble | Cartes exclues |
|---|---|
| SPG (LCI) | Breeches, Brazen Plunderer ; Dargo, the Shipwrecker ; Malcolm, Keen-Eyed Navigator |
| FCA | Akroma's Will ; Bruse Tarl, Boorish Herder ; Command Beacon ; Inalla, Archmage Ritualist ; Ishai, Ojutai Dragonspeaker ; Kraum, Ludevic's Opus ; Thrasios, Triton Hero ; Tymna the Weaver ; Vial Smasher the Fierce ; Yuriko, the Tiger's Shadow |
| SOA | Jeska's Will |
| REX | Command Tower |

Gardées, car tout leur texte joue en duel : Lord Windgrace (« peut être votre commandant » ne règle que la construction
d'un deck Commander) ; Blue, Loyal Raptor et Owen Grady, Raptor Trainer (« partenaire avec » : en arrivant, le joueur
ciblé peut chercher le partenaire dans sa bibliothèque).

Hors périmètre (décision à confirmer) : les ensembles Commander (à faire avec Commander), les ensembles « Eternal » (TLE,
SPE, TMC, HOC : cartes nouvelles, pas des rééditions), Jumpstart (J25), Clue Edition (CLU), les promos (autres
impressions de cartes déjà présentes), Through the Omenpaths (OM1 : cartes de Spider-Man renommées, toutes présentes),
les Special Guests de Modern Horizons 3 (extension absente de l'appli).

## Principes

- **Illustration de la réédition.**
  - Une carte nouvelle prend l'image de sa réédition : elle n'a pas d'autre impression dans l'appli.
  - Pour les 44 cartes déjà présentes, le lot G1 ajoute les impressions : un deck peut choisir celle de la réédition.
  - Une carte SPG imprimée en plusieurs variantes (LCI : 24 impressions pour 18 cartes) prend sa variante de base, au
    plus petit numéro.
- **Légalité.**
  - Les données importées gardent la légalité Scryfall (`not_legal` en Standard) : le Standard les refuse, « Sans limite »
    les accepte, sans changer la validation.
  - Le registre les distingue des extensions du Standard : la couverture « 5 164 / 5 164 » et
    `tools/check-legality.ts` ne les comptent pas.
- **Ordre du registre.** Les ensembles de rééditions viennent après les extensions : une carte présente dans les deux
  garde la définition et l'image de l'extension, et la réédition devient une impression (G1).
- **Même méthode que pour une extension.**
  - Un fichier de scripts par ensemble (`packages/cards/src/<code>/`).
  - Un fichier de tests de règles par ensemble (`engine/test/<code>.test.ts`), qui vérifie le texte Oracle.
  - Un test de fumée (`ai/test/smoke/<code>.test.ts`).
  - `docs/extensions/<code>.md`.
  - `npm run verify -- --set <CODE>`, un commit par lot ou sous-lot.
  - Une mécanique ajoutée au moteur fait un lot [règles] (`RULES_VERSION`).
- **Pas de carte à mécanique propre au Commander** pour l'instant (liste plus haut) : l'import les ignore
  (`EXCLUDED` du registre, avec la raison), et la couverture ne les compte pas.
- **Français :** `tools/import-french.ts` pour FCA et EOS (texte d'une autre impression, image de la réédition gardée).

## Lots

| Lot | Contenu | Cartes | Coût |
|---|---|---|---|
| G0 | Socle : registre, import, légalité, couverture, fumée, fuzz « Sans limite », catalogue | — | moyen |
| G1 [règles] | Impressions : choisir l'illustration d'une réédition pour une carte déjà présente | 44 | moyen à gros |
| G2 [règles] | Mécaniques transverses (G2a coûts et modes, G2b mots-clés de permanent, G2c tempête et copies) | — | gros |
| G3 | Stellar Sights (terrains) | 42 | moyen |
| G4 | Special Guests, en quatre sous-lots | 130 | gros |
| G5 | Enchanting Tales | 56 | gros |
| G6 | Breaking News | 62 | gros |
| G7 | Through the Ages | 50 | gros |
| G8 | Mystical Archive | 34 | moyen |
| G9 | Source Material et Jurassic World Collection | 36 | moyen |

### G0 — socle (sans script de carte)

- `setRegistry.ts` : les ensembles de rééditions, marqués `reprint`, avec leur extension d'origine. Pour SPG, les plages
  de numéros par extension, sans la plage de Modern Horizons 3 :

  | Extension | Numéros |
  |---|---|
  | LCI | 1–18 |
  | MKM | 19–28 |
  | OTJ | 29–38 |
  | BLB | 54–63 |
  | DSK | 64–73 |
  | FDN | 74–83 |
  | DFT | 84–103 |
  | TDM | 104–118 |
  | EOE | 119–128 |
  | ECL | 129–148 |
  | SOS | 149–158 |
  | FRA | 159–168 |

- `tools/import-scryfall.ts` : importer ces ensembles (variante de base de chaque carte, légalité Scryfall, image et
  recadrage de la réédition).
- `tools/import-french.ts` pour les textes français manquants.
- `sets.ts` : un fichier de données par ensemble, et des scripts vides au départ. Les cartes que `scryfall.ts` sait
  déduire (créatures sans capacité, mots-clés) deviennent jouables d'emblée.
- `tools/card-coverage.ts` : une ligne « Sans limite » à part, avec la couverture par ensemble de rééditions ;
  `--set SPG|WOT|…` pour les textes Oracle.
- `tools/check-legality.ts`, `cards/test/legality.test.ts` : les rééditions ne comptent ni dans le Standard ni dans la
  liste des bannies.
- **Fuzz :** `--pool unlimited` (decks tirés de toutes les cartes jouables). `verify --set <REEDITION>` tire ses decks de
  l'ensemble, complétés par le reste du catalogue.
- **Éditeur de decks :** un filtre « Rééditions » ; une carte hors Standard porte l'étiquette « hors Standard ».
- **Budget du bundle :** le chunk des cartes grossit d'environ 8 %. Mesurer, puis relever `tools/bundle-size.ts` si
  besoin, avec la raison.
- **README :** la liste des ensembles de rééditions et leur couverture.

### G1 — impressions (l'illustration de la réédition) [règles, protocole]

- **Données :** `CardDef.printings?: { set, number, image, artCrop }[]`, rempli à l'import quand une carte de l'appli est
  aussi dans un ensemble de rééditions : les 44 cartes, et les variantes SPG si on les veut un jour.
- **Deck :** une entrée peut citer une impression, `[nombre, nom, impression?]` (`"SPG-13"`). L'import et l'export MTGA la
  lisent et l'écrivent (`1 Ghalta, Primal Hunger (SPG) 13`). La validation est inchangée : la légalité est celle de la
  carte.
- **Moteur :** la carte garde sa définition (règles inchangées). L'impression choisie est notée par identité physique,
  `GameState.printings: Record<uid, clé>`, à la création de la partie.
- **Vue :** `projectView` et `visibleFaces` donnent l'image de l'impression ; une carte cachée ne la révèle pas
  (`ai/test/hidden-info.test.ts`).
- **Ailleurs :** les replays et parties sauvegardées enregistrent les impressions des decks. En ligne, le deck envoyé
  porte les impressions ; cela fait avancer `PROTOCOL_VERSION`.
- **Interface :** dans l'éditeur, un choix d'illustration par carte qui a plusieurs impressions ; la tuile de deck montre
  l'illustration choisie.
- **Tests :** un deck avec `Ghalta (SPG)` affiche l'image SPG en partie, dans le replay et en ligne. Script Playwright
  avec captures.

### G2 — mécaniques transverses [règles]

Faites avant les lots de cartes, pour que chaque lot n'ait plus que des cartes à écrire. Chaque mécanique reçoit son
test de règles et ses décisions officielles si besoin (`rulings.test.ts`).

- **G2a, coûts alternatifs et modes :**

  | Mécanique | Cartes |
  |---|---|
  | surcharge | Cyclonic Rift, Mizzix's Mastery, Winds of Abandon |
  | ruée | Ragavan |
  | folie | Terminal Agony |
  | spectacle | Light Up the Stage, Skewer the Critics |
  | émergence | Cresting Mosasaurus |
  | escalade | Collective Defiance |
  | fendre | Fierce Retribution |
  | réplique | SPG |
  | retour | Waves of Aggression |
  | évocation (existe : à vérifier sur les nouvelles cartes) | — |

- **G2b, mots-clés de permanent :**

  | Mécanique | Cartes |
  |---|---|
  | exaltation | Cathedral of War |
  | affinité, métalcraft | Thoughtcast, Frogmite, Galvanic Blast… |
  | modulaire, greffe | Arcbound Ravager, Power Depot, Cytoplast Manipulator |
  | empreinte | Chrome Mox, Dino DNA |
  | racket | Blind Obedience |
  | monstruosité | Grim Giganotosaurus |
  | soif de sang | Indoraptor |
  | régénération | Swarmyard |
  | défense totale (*shroud*) | — |
  | champion | Mistbind Clique |
  | mue | SPG |
  | vantardise | Varragoth |
  | peuplement | Life Finds a Way |
  | dilemme du conseil | SPG |

- **G2c, tempête et copies :** tempête (Brain Freeze, Empty the Warrens, Flusterstorm), avec le décompte des sorts du
  tour par le journal.

Les cartes à effet unique (Show and Tell, Painter's Servant, Library of Alexandria, Splinter Twin, Living End…) vont dans
leur lot, avec une forme générique d'abord, selon la règle « pas de dette propre à une carte ».

### G3 à G9 — les cartes

- **G3, Stellar Sights (42 terrains) :** Ancient Tomb, Blast Zone, Blinkmoth Nexus, Bonders' Enclave, Cascading
  Cataracts, Cathedral of War, Celestial Colonnade, Contested War Zone, Creeping Tar Pit, Crystal Quarry, Deserted Temple,
  Eldrazi Temple, Endless Sands, Gemstone Caverns, Grove of the Burnwillows, High Market, Hissing Quagmire, Inkmoth
  Nexus, Inventors' Fair, Lavaclaw Reaches, Lotus Field, Lumbering Falls, Mana Confluence, Meteor Crater, Mirrorpool,
  Mutavault, Mystifying Maze, Needle Spires, Nesting Grounds, Petrified Field, Plaza of Heroes, Power Depot, Raging
  Ravine, Reflecting Pool, Scavenger Grounds, Shambling Vent, Stirring Wildwood, Strip Mine, Swarmyard, Terrain
  Generator, Thespian's Stage, Wandering Fumarole.
- **G4, Special Guests (130), quatre sous-lots :**
  - G4a : LCI 14, MKM 10, OTJ 10 ;
  - G4b : BLB 9, DSK 10, FDN 9, DFT 10 ;
  - G4c : TDM 10, EOE 10, ECL 20 ;
  - G4d : SOS 11, FRA 10.
  - Listes par extension : sortie de `npm run coverage -- --set SPG --text` après G0.
- **G5, Enchanting Tales (56) :** Aggravated Assault, As Foretold, Bitterblossom, Blind Obedience, Blood Moon, Compulsion,
  Copy Enchantment, Curiosity, Dark Tutelage, Dawn of Hope, Defense of the Heart, Dragon Mantle, Fiery Emancipation,
  Forced Fruition, Fraying Sanity, Goblin Bombardment, Grasp of Fate, Grave Pact, Greater Auramancy, Griffin Aerie,
  Ground Seal, Hardened Scales, Hatching Plans, Intangible Virtue, Intruder Alarm, Karmic Justice, Kindred Discovery,
  Knightly Valor, Land Tax, Leyline of Abundance, Leyline of Anticipation, Leyline of Lightning, Leyline of Sanctity, Mana
  Flare, Nature's Will, Necropotence, Oppression, Oversold Cemetery, Parallel Lives, Phyrexian Unlife, Polluted Bonds,
  Primal Vigor, Prismatic Omen, Raid Bombardment, Repercussion, Rhystic Study, Sanguine Bond, Season of Growth, Shared
  Animosity, Smothering Tithe, Sneak Attack, Spreading Seas, Stab Wound, Unnatural Growth, Utopia Sprawl, Waste Not.
- **G6, Breaking News (62) :** Abrupt Decay, Anguished Unmaking, Archive Trap, Archmage's Charm, Back for More, Bedevil,
  Clear Shot, Collective Defiance, Commandeer, Contagion Engine, Crackle with Power, Crime // Punishment, Cruel Ultimatum,
  Decimate, Decisive Denial, Detention Sphere, Dust Bowl, Electrodominance, Endless Detour, Essence Capture, Fell the
  Mighty, Fierce Retribution, Fling, Force of Vigor, Fractured Identity, Grindstone, Heartless Pillage, Hindering Light,
  Humiliate, Hypothesizzle, Imp's Mischief, Indomitable Creativity, Ionize, Journey to Nowhere, Leyline Binding, Mana
  Drain, Mindbreak Trap, Mindslaver, Oko, Thief of Crowns, Outlaws' Merriment, Overwhelming Forces, Pariah, Path to Exile,
  Pest Infestation, Primal Command, Reanimate, Repulse, Ride Down, Savage Smash, Siphon Insight, Skewer the Critics,
  Skullcrack, Surgical Extraction, Terminal Agony, Thornado, Thoughtseize, Tyrant's Scorn, Unlicensed Hearse, Vanishing
  Verse, Villainous Wealth, Void Rend, Voidslime.
- **G7, Through the Ages (50) :** Adeline, Resplendent Cathar, Ancient Copper Dragon, Atraxa, Grand Unifier, Azusa, Lost
  but Seeking, Bolas's Citadel, Brainstorm, Captain Lannery Storm, Carpet of Flowers, Chromatic Lantern, Counterspell,
  Cryptic Command, Danitha Capashen, Paragon, Dark Ritual, Deadly Dispute, Diabolic Intent, Dovin's Veto, Farseek, Fatal
  Push, Gix, Yawgmoth Praetor, Godo, Bandit Warlord, Isshin, Two Heavens as One, Jodah, the Unifier, K'rrik, Son of
  Yawgmoth, Kenrith, the Returned King, Kinnan, Bonder Prodigy, Laboratory Maniac, Light Up the Stage, Lightning Bolt,
  Loran of the Third Path, Mangara, the Diplomat, Mizzix's Mastery, Najeela, the Blade-Blossom, Nature's Claim, Nyxbloom
  Ancient, Primeval Titan, Purphoros, God of the Forge, Ragavan, Nimble Pilferer, Ranger-Captain of Eos, Smuggler's Copter,
  Sram, Senior Edificer, Strixhaven Stadium, Syr Konrad, the Grim, Teferi, Mage of Zhalfir, Traxos, Scourge of Kroog, Urza,
  Lord High Artificer, Varragoth, Bloodsky Sire, Venser, Shaper Savant, Wall of Omens, Winota, Joiner of Forces, Yawgmoth,
  Thran Physician.
- **G8, Mystical Archive (34) :** Ad Nauseam, Angel's Grace, Armageddon, Awaken the Woods, Berserk, Big Score, Brain
  Freeze, Bring to Light, Brotherhood's End, Crop Rotation, Culling Ritual, Culling the Weak, Cyclonic Rift, Daze,
  Deflecting Palm, Empty the Warrens, Flusterstorm, Force of Will, Fracture, Glimpse of Nature, Living End,
  Pongify, Preordain, Pyretic Ritual, Reprieve, Return to the Ranks, Shamanic Revelation, Sheoldred's Edict, Smallpox,
  Subterranean Tremors, Triumph of the Hordes, Vampiric Tutor, Veil of Summer, Winds of Abandon.
- **G9, Source Material (16) et Jurassic World Collection (20) :**
  - Source Material : All Will Be One, Arcbound Ravager, Ashcoat of the Shadow Swarm, Conqueror's Flail, Cytoplast
    Manipulator, Metallic Mimic, Plague of Vermin, Rhythm of the Wild, Shadowspear, Silverclad Ferocidons, Sword of Sinew
    and Steel, Teleportation Circle, Trouble in Pairs, Umezawa's Jitte, Underworld Breach (aussi en SPG), Waves of
    Aggression.
  - Jurassic World Collection : Blue, Loyal Raptor, Compy Swarm, Cresting Mosasaurus, Dino DNA, Don't
    Move, Ellie and Alan, Paleontologists, Grim Giganotosaurus, Henry Wu, InGen Geneticist, Hunting Velociraptor, Ian
    Malcolm, Chaotician, Indominus Rex, Alpha, Indoraptor, the Perfect Hybrid, Life Finds a Way, Owen Grady, Raptor
    Trainer, Permission Denied, Ravenous Tyrannosaurus, Savage Order, Spitting Dilophosaurus, Swooping Pteranodon,
    Welcome to . . . // Jurassic Park.

## Vérification

- **Par lot :** `npm run verify -- --set <CODE>` (fuzz ciblé et sur tout le pool « Sans limite »).
  - Tests de règles du lot, test de fumée de l'ensemble.
  - `npm run coverage -- --set <CODE> --audit` sans écart nouveau.
  - Compte rendu : nombre de tests ajoutés, écarts trouvés, approximations notées.
- **G0 et G1 :** les tests d'interface (`--ui`), et pour G1 un script Playwright qui vérifie l'illustration de la
  réédition en partie, dans le replay et en ligne.
- **En fin de série :** `npm run verify -- --full`.

## Décisions à confirmer avant de commencer

1. Le périmètre : les huit ensembles ci-dessus, sans Commander, « Eternal », Jumpstart ni Clue Edition.
2. Les variantes SPG multiples (LCI) : seulement la variante de base.
3. G1 (impressions) avant les cartes, ou après : il ne concerne que les 44 cartes déjà présentes, les 410 nouvelles ont
   d'emblée l'illustration de leur réédition.

## Suivi

- **G0 (04/10/2026) :** registre des huit ensembles de rééditions (`setRegistry.ts`, `reprint`, plages de numéros des
  Special Guests), liste unique des cartes exclues (`EXCLUDED_REPRINTS` : une carte exclue l'est dans tous les
  ensembles, Thrasios et Akroma's Will étant aussi en SPG et SOA), import (`npm run import-cards -- reprints`, français
  complété par `tools/import-french.ts`), légalité Scryfall gardée (hors Standard, permises en « Sans limite »),
  couverture (ligne « dont rééditions »), tableau du README, ensembles groupés dans l'éditeur de decks. Décompte réel
  après import : 413 cartes nouvelles (SPG 132, EOS 43, WOT 55, OTP 61, FCA 50, SOA 37, PZA 15, REX 20), une carte déjà
  jouable. Bundle : chunk des cartes 5 785 → 6 211 Ko, dans le budget.
- **G1 (04/10/2026) :** impressions. `CardDef.printings` (clé « SPG-11 », ensemble, numéro, illustrations anglaise et
  française) rempli au chargement des cartes pour toute carte déjà connue qu'un ensemble de rééditions réimprime :
  51 cartes (une carte peut en avoir plusieurs, Doubling Season : WOT et PZA). Deck : `[nombre, nom, impression ?]`,
  une impression par nom (elle vaut pour tous les exemplaires, deck et réserve) ; import et export MTGA
  (`4 Ghalta, Primal Hunger (SPG) 11`) ; validation et légalité inchangées. Moteur : `PlayerSetup.printings`,
  `GameState.printings` (uid → clé, posé à la création, ignoré si la carte n'a pas cette impression) ; la vue
  (`objectView`, sorts de la pile) montre l'illustration choisie, sauf pour une copie ou l'autre face ; les faces du
  journal (`visibleFaces`) gardent l'illustration de la carte, la mise en avant d'un sort adverse prend celle de la pile.
  Enregistrement des parties (`players[].printings`, replays, sauvegardes du serveur), worker et serveur
  (`deckPrintings`) ; `PROTOCOL_VERSION` 2 (ligne de deck à trois éléments). Éditeur : bouton du code de l'ensemble sur
  chaque ligne qui a des impressions (un clic passe à la suivante), aperçu et couverture du deck dans l'impression
  choisie. Pas de `RULES_VERSION` : les règles ne changent pas et les parties dorées se rejouent à l'identique. Plafonds
  CardDef 94 → 95 et GameState 38 → 39 (justifiés). Tests : `cards/test/printings.test.ts` (4), `server/test/format.test.ts`
  (1) ; script Playwright ponctuel (éditeur, export, main en partie), captures dans `test-results/plan-g/`.
- **G2a (04/10/2026) :** surcharge et fendre (`ModeDef.cost`, aide `altCostMode`), escalade (`escalate`), ruée et
  spectacle (déduits du texte, `altCost.via`), avec leurs cartes : Cyclonic Rift, Winds of Abandon, Mizzix's Mastery,
  Fierce Retribution, Collective Defiance, Ragavan, Light Up the Stage, Skewer the Critics (8). Émergence, folie,
  réplique et retour n'ont qu'une carte chacune : faits dans le lot de leur carte. `RULES_VERSION` 103, parties dorées
  identiques. Tests : 16 (`soa`, `fca`, `otp`) ; fumée par ensemble (SPG, SOA, FCA, OTP) ; détail dans
  `docs/extensions/reeditions.md`.
- **G2b (04/10/2026) :** défense totale (mot-clé), exaltation, affinité pour les artefacts, modulaire, greffe et extorsion
  lues dans le texte, champion (aide de script) ; cartes : Cathedral of War, Power Depot (EOS), Frogmite, Thoughtcast,
  Galvanic Blast, Chrome Mox, Helix Pinnacle, Mistbind Clique, Wanderwine Prophets (SPG), Arcbound Ravager, Cytoplast
  Manipulator (PZA), Blind Obedience (WOT) : 12. The Kingpin of Crime (MSH) prend l'extorsion du texte. Monstruosité, soif
  de sang, régénération, vantardise, peuplement et dilemme du conseil (une carte chacun) vont dans le lot de leur carte.
  `RULES_VERSION` 104, parties dorées identiques. Tests : 16 ; fumée EOS, PZA, WOT.
  La vérification de G2b a trouvé deux défauts, corrigés dans le lot : une source qui produit 0 mana (Vivi Ornitier de
  force 0) était comptée par le solveur (« Paiement incohérent ») ; une capacité au seul coût {X} (Helix Pinnacle) était
  proposée à X = 0 et l'IA aléatoire l'activait sans fin (elle est proposée à partir de 1).
- **G2c (04/10/2026) :** déluge lu dans le texte, compté au lancement pour tous les joueurs (`RulesEvent`
  `cast.spellsBefore`) ; Brain Freeze, Empty the Warrens, Flusterstorm (SOA) ; Stormscale Scion (TDM) prend le déluge du
  texte. `RULES_VERSION` 105. G2 est terminé ; les mécaniques d'une seule carte sont faites dans le lot de leur carte.
  Corrigés en route : les modes à coût propre (surcharge, fendre) forment une option de lancement à part, sans gratuité
  ni coût alternatif (le fuzz strict proposait Cyclonic Rift surchargé et gratuit) ; un joueur éliminé pendant qu'il
  contrôle un sort qu'il ne possède pas laissait l'objet « sur la pile » hors de la pile : il est exilé (800.4a, test
  dans `multiplayer.test.ts`).
- **G3a (04/10/2026) :** 33 terrains de Stellar Sights avec les formes existantes, plus une contrepartie de capacité de
  mana (`drawback` : Ancient Tomb, Grove of the Burnwillows) ; `RULES_VERSION` 106. Restent pour G3b les 8 terrains qui
  demandent du moteur : Blast Zone, Gemstone Caverns, Inkmoth Nexus (infection), Meteor Crater et Plaza of Heroes (mana
  des couleurs de vos permanents), Nesting Grounds (déplacer un marqueur), Reflecting Pool, Swarmyard (régénération).
  L'IA aléatoire n'active plus une capacité d'une source qui en a déjà une sur la pile (la capacité {0} de Wandering
  Fumarole faisait grossir la pile sans fin dans le fuzz).
- **G3b (04/10/2026) :** les 8 derniers terrains de Stellar Sights (43 / 43) : infection, régénération, mana des
  couleurs de vos permanents ou des types de vos terrains, filtre « valeur de mana égale aux marqueurs de la source »,
  déplacer un marqueur, leyline conditionnelle. `RULES_VERSION` 107 ; plafonds relevés (GameObject, ObjectFilter,
  Effect) et entrées justifiées dans `debt-baseline.json`.
- **G4a (04/10/2026) :** 31 Special Guests de LCI, MKM et OTJ (SPG 38 / 132). Le moteur gagne la traversée de terrain,
  « n'attaque pas deux fois le même joueur », la portée des statiques de joueur, le déclencheur « vous copiez un sort »,
  la suspension depuis la main. `RULES_VERSION` 108. Trois cartes reportées à un sous-lot difficile : Underworld Breach,
  Mirri, Weatherlight Duelist, Notion Thief.
- **G4b (04/10/2026) :** 29 Special Guests de BLB, DSK, FDN et DFT (SPG 67 / 132) ; destruction sans régénération.
  `RULES_VERSION` 109. Reportées au sous-lot difficile : Expropriate, Maddening Hex, Noxious Revival, Sphinx's Tutelage,
  Phantasmal Image.
- **G4c (04/10/2026) :** 31 Special Guests de TDM, EOE et ECL (SPG 98 / 132) ; limite de sorts par types,
  « un adversaire joue un terrain ». `RULES_VERSION` 110. Robe of Stars (phasing) reportée au sous-lot difficile.
- **G4d (04/10/2026) :** 16 Special Guests de SOS et FRA (SPG 114 / 132), sans forme nouvelle. Les 18 cartes SPG
  restantes forment le sous-lot difficile G4e (liste dans `docs/extensions/reeditions.md`).
