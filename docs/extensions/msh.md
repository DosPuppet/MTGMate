# Marvel Super Heroes (MSH, 271 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Avatar: The Last Airbender. 20 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : montée en puissance (`activated({ powerUp: true })`), travail d'équipe (lu dans le texte, un kicker « engagez des créatures de force totale N »), exploiter (`fx.harness`, `cond.harnessed`), équiper digne, Doombot… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/msh/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `msh/common.ts`.

## Sous-lot 0 : socle ✅ (20 / 271)

- **Jetons :** Méchant 2/1 noir avec la menace, Héros 3/2 blanc avec la vigilance, Robot Méchant 2/2 incolore (artefact), Mur 0/4 incolore avec le défenseur, Insecte 1/1 vert, Ondin 1/1 bleu ; Doombot existait ; Soldat, Indice, Trésor et Nourriture viennent des communs.
- **Moteur :** rien de nouveau.
- **Tests :** test de fumée `ai/test/smoke/msh.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (52 / 271)

- **Cartes (32) :** Agent 13, Sharon Carter, Agent Phil Coulson, Agents of S.H.I.E.L.D., Avengers Assemble!, Borough Backup, Brave Brawler, Captain America, Wings of Freedom, Captain Mar-Vell, Space-Born, Colleen Wing, Street Samurai, Crowd of True Believers, Helicarrier Strike, Hero in Training, Invisible Woman, Sue Storm, Luke Cage, Power Man, Mockingbird, Ace Agent, Monica Rambeau // Photon, Living Light, Murdock's Crusade, Nick Fury, Agent of S.H.I.E.L.D., Night Nurse, Healer of Heroes, Okoye, Dora Milaje Leader, Origin of the Avengers, Panther Pounce, Patriot, Shield Wielder, Quake, Agent of S.H.I.E.L.D., Raft Security Officer, Red Guardian, Super-Soldier, The Sentry, Golden Guardian (jeton The Void), S.H.I.E.L.D. Spy Kit, Super Villain Lockup, Super-Soldier Serum, Wakandan Drone Flock, White Widow, Free Agent.
- **Moteur :** rien de nouveau (« les deux si le travail d'équipe a été payé » : un mode sous `cond.kicked` ; flash sous condition par `playerStatic({ flashFor })`).
- **Reste pour plus tard :** Agent Maria Hill (engagée pour payer un travail d'équipe), Captain America, Super-Soldier (marqueur de bouclier).
- **Tests :** 35 tests de règles (« lot A, blanc »).

## Sous-lot A2 : cartes bleues ✅ (86 / 271)

- **Cartes (34) :** Aerial Doombot, A.I.M. Scientists, Atlantean Cavalry, Atlantis Attacks, Attuma, Atlantean Warlord, Bold Biochemist, Bruce Banner // The Incredible Hulk, Depower, Echo, Perceptive Prodigy, Falcon, Winged Wonder, Falcon's Wing Harness, Frozen in Ice, Futurist Forge, Giant-Sized Flying Ant, Hydraulic Helper, I Am Iron Man, Iron Lad, Diverging Destiny, Justice, Vance Astrovik, Kang the Conqueror, Mister Fantastic, Reed Richards, Ms. Marvel, Kamala Khan, Multiversal Incursion, Pym Particles, Rewrite History, Secret Invasion, S.H.I.E.L.D. Deployment Drone, S.H.I.E.L.D. Flying Car, Shuri, Wakandan Inventor, Stature, Size Shifter, Super Intelligence, Super Suit, Thirst for Knowledge, Tony Stark // The Invincible Iron Man, Wiccan, Rising Magician.
- **Moteur :** rien de nouveau. La connivence sert désormais à plusieurs cartes : son entrée de dette est retirée.
- **Reste pour plus tard :** Ironheart, Clever Champion (improvisation), Kid Loki (« les créatures sur lesquelles vous avez mis des marqueurs ce tour-ci » dans une capacité statique), Leader, Super-Genius (remplacement de la connivence), Loki, God of Mischief (une capacité qui cible), Namor the Sub-Mariner (symboles bleus du coût d'un sort), Trickster's Stratagem (deuxième depuis le dessus).
- **Tests :** 40 tests de règles (« lot A, bleu »).

## Sous-lot A3 : cartes noires ✅ (120 / 271)

- **Cartes (34) :** Agents of HYDRA, Arnim Zola, Bio-Fanatic, Baron Strucker, HYDRA Overlord, Construct a Cosmic Cube, Crossbones, Malicious Mercenary, Cruel Alliance, Dark Deed, Decoy Ploy, Doom Reigns Supreme, Elektra, Daughter of the Hand, Grim Reaper, Lethal Legionnaire, Hour of Defeat, HYDRA Infiltration, HYDRA Troopers, Kingpin's Enforcers, Madame Masque, The Masters of Evil, Moonstone, Harsh Mistress, Ninja of the Hand, Project Deathlok Soldier, Red Room Recruit, Robot Domination, Ronin, Shadow Stalker, Roxxon Brutes, Stolen Stark Tech, Super-Skrull, Swordsman, Sharp Scoundrel, Thunderbolts Conspiracy, Too Evil to Stay Dead, Unliving Legionnaire, Visions of Villainy, Whiplash, Vengeful Engineer, Widow's Bite, Yellowjacket, Heartless Marauder.
- **Correctif du moteur :** le déclencheur « [cartes] mises dans une zone » (`when.zoneChange`) respecte `nontoken` et `token` : un jeton n'est pas une carte. Moonshadow (ECL, « cartes de permanent ») est corrigé ; test tiré des règles dans `rulings.test.ts`.
- **Reste pour plus tard :** Baron Helmut Zemo (vantardise et coût en symboles noirs), Black Widow, Super Spy (exil jusqu'à une carte dans la bibliothèque d'un autre joueur), Klaw, Sonic Subjugator (défausse après une révélation partielle).
- **Version des règles :** 46.
- **Tests :** 41 tests de règles (« lot A, noir ») et 1 test tiré des règles.

## Sous-lot A4 : cartes rouges ✅ (147 / 271)

- **Cartes (27) :** Crimson Operative, Death to Our Enemies, Fin Fang Foom, Hawkeye, Master Marksman, Hawkeye's Bow, Hex Magic, Hire a Crew, HULK SMASH!, Human Torch, Johnny Storm, HYDRA Assault Robot, Iron Fist, Living Weapon, Jessica Jones, Private Eye, K'un-Lun Warrior, Machinesmith Automaton, Misty Knight, Hero for Hire, Photon Blast Barrage, Quicksilver, Brash Blur, Red Hulk, Repulsor Blast, The Scarlet Witch, Speed, Young Avenger, Stark Industries Executive, Super Speed, Team Tactics, Truck Toss, Vision of Love, Volcanic Villain.
- **Moteur :** rien de nouveau (Plans à marqueurs comme Political Triumph, copies de sorts avec nouvelles cibles, « ne peut être bloquée que par des créatures avec la célérité »).
- **Reste pour plus tard :** Evil's Thrall (contrôle jusqu'à la fin de votre prochain tour), Hawkeye, Young Avenger (blessures augmentées de la force de la source), Loki Laufeyson (« le prochain sort de valeur de mana au plus sa force »), Wonder Man, Hollywood Hero (réactiver une montée en puissance).
- **Tests :** 34 tests de règles (« lot A, rouge »).

## Sous-lot A5 : cartes vertes ✅ (180 / 271)

- **Cartes (33) :** Ant-Man's Army, Call Damage Control, Claim the Kingdom, Doc Samson, Super Psychiatrist, Earth's Mightiest Heroes, Epic Fight, Go Nuts!, Guerrilla Gorilla, Hellcat, Undying Vigilante, Hercules, Prince of Power, Heroic Feast, Hulkling, Burgeoning Bruiser, Ka-Zar of the Savage Land, Knight of Wundagore, Mister Hyde, Monster Within, Mole Man, Moloid Master, Pet Avengers, Punishing Punch, Rapid Rescue, Reptil, Dinomorpher, Restorative Technique, Rick Jones, Destined Sidekick, Serpent Specialist, She-Hulk, Jade Defender, Super Strength, The Thing, Ben Grimm, Tigra, Feline Fury, Training Regimen, The Unbeatable Squirrel Girl, Undercover Skrull, Wakandan Royal Guard, White Tiger, Ava Ayala, World War Hulk.
- **Moteur :** rien de nouveau (remplacement de marqueurs de Doc Samson sur le cadre `eventReplacement`, terrains joués depuis la bibliothèque et le cimetière, F/E de base et types remplacés de Reptil).
- **Reste pour plus tard :** Shang-Chi, Master of Kung Fu (activer comme si elles avaient la célérité), Powerful Broker (prolifération limitée à une cible).
- **Tests :** 40 tests de règles (« lot A, vert »).

## Sous-lot A6 : multicolores, incolores et terrains ✅ (240 / 271)

- **Multicolores (30) :** Abomination, Terrifying Titan, Alien Invasion, Ant-Man, Colony Commander, Armor Wars, Avengers: Under Siege, Beast, Erudite Aerialist, Black Panther, Vanguard, Black Widow, Double Agent, Bullseye, Death Dealer, Cloak and Dagger, Entwined, The Coming of Galactus, Daredevil, Man Without Fear, Ghost, Spectral Saboteur, Iron Man, Master of Machines, Kang, Temporal Tyrant, Killmonger, Scourge of Wakanda, King T'Challa // Black Panther, Hope Enduring, The Kingpin of Crime, Madame Hydra, The Mighty Thor, Jane Foster, Moon Girl and Devil Dinosaur, Speedball, New Warrior, Spider-Man, To the Rescue, Spider-Woman, Secret Agent, The Super Hero Civil War, Thanos, the Mad Titan, U.S.Agent, John Walker, Vision Quest, War Machine, Legacy of Iron, Winter Soldier, Icy Assassin.
- **Incolores et terrains (30) :** A.I.M. Synthoids, Captain America's Shield, Cosmic Cube, Dependable Quinjet, H.E.R.B.I.E. Scout Unit, Iron Man Armor, S.H.I.E.L.D. Helicarrier, The Ten Rings, Ultron, Artificial Malevolence, Ultron Drone, Vibranium Energy Daggers, The Vision, Viv Vision, Teen Synthezoid, A.I.M. Labs, Asgardian Citadel, Avengers Hangar, Avengers Tower, Baxter Building, Birnin Zana Plaza, Dark Fortress, Fisk Tower, Gathering Place, Hell's Kitchen, Los Diablos Missile Base, Pym Technologies, Stark Industries, Subterranean Cavern, Surveillance Room, Training Compound, Villainous Hideout.
- **Correctifs du moteur (tests tirés des règles dans `rulings.test.ts`) :**
  - les dernières informations d'un permanent sont prises avant son retrait du combat (506.4) : « quand une créature attaquante meurt » se déclenche enfin ;
  - un Équipement qui devient une créature se détache (301.5c, 704.5n) : Iron Man Armor animée ;
  - une carte de la bibliothèque lancée par une permission (« lancez-la maintenant ») suit le timing de la permission ;
  - les F/E définies par une capacité lisent « légendaire » dans leurs filtres.
- **Dette :** le contrôle « tant que [la source] » (`gainControlWhileSource`) sert désormais à plusieurs cartes : son entrée est retirée.
- **Reste pour plus tard :** Ares, God of War, Absorbing Man, Taskmaster, The Astonishing Ant-Man, Captain America, Living Legend, Hulk, Gamma Goliath, The Ruinous Wrecking Crew, Scientist Supreme of A.I.M., The Serpent Society, Storm, Windrider, Titania, Rugged Rumbler, Worlds Within Worlds, Arc Reactor, Super-Adaptoid.
- **Version des règles :** 47.
- **Tests :** 34 tests de règles (« lot A, multicolores »), 24 (« lot A, incolores et terrains ») et 3 tests tirés des règles.

## Sous-lot B1 : improvisation ✅ (242 / 271)

- **Cartes (2) :** Arc Reactor, Ironheart, Clever Champion.
- **Le moteur gagne :** l'improvisation (702.126), lue dans le texte (mot-clé `improvise`) : en payant le sort, chaque artefact dégagé peut payer {1} du générique (source du solveur de mana, comme la maîtrise de l'eau, sans plafond) ; elle peut aussi être donnée aux sorts du joueur (`playerStatic({ spellKeywords: { filter, keywords: ["improvise"] } })`, Ironheart : « vos sorts non-créature »).
- **Version des règles :** 48.
- **Tests :** 2 tests de règles (« lot B1 »).

## Sous-lot B2 : marqueurs de bouclier et engagements ✅ (245 / 271)

- **Cartes (3) :** Captain America, Super-Soldier, Agent Maria Hill, Captain America, Living Legend.
- **Le moteur gagne :**
  - les marqueurs de bouclier (122.1c), règle du marqueur appliquée par le moteur : un permanent qui devrait subir des blessures ou être détruit perd un marqueur de bouclier à la place (un remplacement, pas une prévention) ;
  - l'événement d'engagement porte sa cause (`cause: "teamwork"` : engagé pour payer un travail d'équipe) et dit s'il s'agit du premier engagement du tour (`tapsThisTurn`) ; le déclencheur `{ on: "taps", cause, firstThisTurn }`.
- **Version des règles :** 49.
- **Tests :** 4 tests de règles (« lot B2 »).

## Sous-lot B3 : montée en puissance ✅ (247 / 271)

- **Cartes (2) :** Hulk, Gamma Goliath, Wonder Man, Hollywood Hero.
- **Le moteur gagne :**
  - `abilityCost: { ability: "powerUp" }` : les modificateurs de coût des capacités visent les montées en puissance (Hulk : « celles de vos autres créatures coûtent {3} de moins ») ;
  - les capacités à usage unique comptent leurs activations ; `powerUpExtraUses` permet d'activer chaque montée en puissance N fois de plus (Wonder Man ; entrée de dette justifiée).
- **Approximation conservée :** Kang the Conqueror (« pendant ce tour, les montées en puissance ne peuvent pas être activées » : un tour supplémentaire ne porte pas encore d'effet).
- **Version des règles :** 50.
- **Tests :** 2 tests de règles (« lot B3 »).

## Sous-lot C1 : caractéristiques, filtres et coûts ✅ (255 / 271)

- **Cartes (8) :** Super-Adaptoid, Ares, God of War, Namor the Sub-Mariner, Kid Loki, The Astonishing Ant-Man, Hawkeye, Young Avenger, Shang-Chi, Master of Kung Fu, Powerful Broker.
- **Le moteur gagne :**
  - le filtre `countersPutByYouThisTurn` (« sur lesquelles vous avez mis des marqueurs ce tour-ci ») lu aussi par les capacités statiques et les déclencheurs, et limité à une sorte (`countersPutByYouThisTurn: "+1/+1"`, Kid Loki) ;
  - `playerStatic({ activateAsThoughHaste: filtre })` : activer les capacités {T} de ces créatures malgré le mal d'invocation, sans pouvoir attaquer (Shang-Chi ; entrée de dette justifiée) ;
  - `modify.addSourcePower` : des blessures augmentées de la force de la source du remplacement (Hawkeye, avec `combat: false`) ;
  - le coût `removeCountersX` (« retirez un nombre quelconque de marqueurs de cette créature », X = le nombre retiré) ;
  - le montant `manaSymbolsOf(ref, couleur)` (symboles de mana d'une couleur dans un coût, hybrides compris : Namor) ;
  - `fx.proliferate(n, cible)` : la prolifération sur les seuls objets ou joueurs désignés (Powerful Broker).
- Ares et Super-Adaptoid profitent des correctifs du lot A6 (dernières informations d'une créature attaquante, « légendaire » dans les F/E définies par une capacité).
- **Version des règles :** 51.
- **Tests :** 8 tests de règles (« lot C1 »).

## Sous-lot C2 : copies, contrôle et cibles ✅ (263 / 271)

- **Cartes (8) :** Absorbing Man, Taskmaster, Mercenary Mimic, Evil's Thrall, Loki, God of Mischief, Loki Laufeyson, Scientist Supreme of A.I.M., Storm, Windrider, Leader, Super-Genius.
- **Le moteur gagne :**
  - `fx.becomeCopy(…, "untilYourNextTurn", { except })` : une copie jusqu'à votre prochain tour, avec des exceptions de copie (707.9b : nom, types, surtypes, F/E, mots-clés) ; une carte de créature d'un cimetière peut être copiée (Taskmaster) ;
  - la durée `endOfYourNextTurn` (« jusqu'à la fin de votre prochain tour ») et `fx.gainControl(…, { untilEndOfYourNextTurn })` ;
  - la condition `cond.amountGreater(a, b)` (« un Méchant de valeur de mana supérieure ») ;
  - `becomesTarget` avec `players` et `abilitiesOnly` (« un joueur ou un permanent devient la cible d'une de vos capacités ») ;
  - le filtre de `nextSpell` figé à la résolution (Loki Laufeyson : « valeur de mana au plus sa force ») ;
  - la cible `stackItems` avec `controller` et `source` (« une capacité que vous contrôlez d'une source artefact ») ;
  - la référence `ref.targetsOfEventObject` (« ces créatures » : les cibles du sort lancé) ;
  - l'événement remplaçable `connive` (Leader : piocher d'abord une carte).
- **Version des règles :** 52.
- **Tests :** 8 tests de règles (« lot C2 »).

## Sous-lot C3 : coûts, main et bibliothèque ✅ (271 / 271)

- **Cartes (8) :** Trickster's Stratagem, Baron Helmut Zemo, Black Widow, Super Spy, Klaw, Sonic Subjugator, The Ruinous Wrecking Crew, The Serpent Society, Titania, Rugged Rumbler, Worlds Within Worlds.
- **Le moteur gagne :**
  - `fx.topOrBottom(…, fromTop)` : « en deuxième position depuis le dessus ou au-dessous » ;
  - « défaussez une carte ou payez {M} », en coût additionnel (`additionalCost.discardOr.mana`, choix proposé par l'interface et l'IA) et en garde (`ward.orMana`, lue dans le texte) ;
  - la garde « recevez N marqueurs poison » (`ward.poison`, lue dans le texte) ;
  - `fx.discard(…, { chooser: "controller", reveal })` : le joueur révèle d'abord N cartes de son choix, vous choisissez parmi elles ;
  - `fx.pickFromZone(…, { who })` : chaque joueur choisit dans sa propre zone, pour lui-même ;
  - `exileUntil` dans la bibliothèque d'un autre joueur (`who`) ;
  - le coût `exileGraveyardSymbols` (« exilez des cartes [couleur] de votre cimetière totalisant N symboles »), la référence `ref.costExiled` et `castCopiesFree(…, { maxCount })` (vantardise de Baron Helmut Zemo).
- **Version des règles :** 53.
- **Tests :** 8 tests de règles (« lot C3 »).
