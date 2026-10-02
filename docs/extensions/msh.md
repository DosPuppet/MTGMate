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
