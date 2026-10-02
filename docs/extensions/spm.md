# Marvel's Spider-Man (SPM, 188 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Marvel Super Heroes, avec Teenage Mutant Ninja Turtles et The Hobbit. 10 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : Web-slinging (lu dans le texte, coût alternatif qui renvoie en main une créature engagée), chaos (Mayhem, lu dans le texte : une carte défaussée ce tour-ci se lance depuis le cimetière pour son coût de chaos), Superior Spider-Man (copie d'une carte de cimetière en arrivant)… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons, « modifié » | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/spm/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi` et `artifacts` (incolores et terrains). Les aides sont dans `spm/common.ts`.

## Sous-lot 0 : socle ✅ (10 / 188)

- **Jetons :** Citoyen humain 1/1 vert et blanc, Araignée 2/1 verte avec la portée, Robot 1/1 incolore (artefact) avec le vol, Illusion Méchant 3/3 bleue ; Trésor et Nourriture viennent des communs.
- **Moteur :** filtre `modified` (700.9) : un permanent qui porte un marqueur, est équipé, ou est enchanté par une Aura que son contrôleur contrôle.
- **Tests :** test de fumée `ai/test/smoke/spm.test.ts` ; filtre « modifié » dans `rulings.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (30 / 188)

- **Cartes (20) :** Anti-Venom, Horrifying Healer, City Pigeon, Costume Closet, Daily Bugle Reporters, Flash Thompson, Spider-Fan, Friendly Neighborhood, Origin of Spider-Man, Rent Is Due, Selfless Police Captain, Silver Sable, Mercenary Leader, Spectacular Spider-Man, Spectacular Tactics, Spider-Man, Web-Slinger, Spider-UK, Starling, Aerial Ally, Sudden Strike, Thwip!, Web Up, Web-Shooters, Wild Pack Squad.
- **Moteur :** `onPrevent.counters` d'un remplacement de blessures : autant de marqueurs sur la source du remplacement, dans le remplacement même (Anti-Venom ; test dans `rulings.test.ts`).
- **Reste pour plus tard :** Arachne, Psionic Weaver (type de carte choisi en arrivant, taxe pour tous les joueurs), Peter Parker // Amazing Spider-Man (Web-slinging accordé aux sorts légendaires de couleur), With Great Power . . . (redirection de blessures, permanents attachés à l'hôte).
- **Tests :** 32 tests de règles (« lot A, blanc »).

## Sous-lot A2 : cartes bleues ✅ (49 / 188)

- **Cartes (19) :** Amazing Acrobatics, Beetle, Legacy Criminal, Doc Ock, Sinister Scientist, Doc Ock's Henchmen, Flying Octobot, Hide on the Ceiling, Impostor Syndrome, Lady Octopus, Inspired Inventor, Madame Web, Clairvoyant, Mysterio, Master of Illusion, Mysterio's Phantasm, Oscorp Research Team, Robotics Mastery, School Daze, Secret Identity, Spider-Byte, Web Warden, Spider-Man No More, Unstable Experiment, Whoosh!.
- **Moteur :** rien de nouveau (« l'un ou les deux » : un troisième mode « les deux »).
- **Reste pour plus tard :** Chameleon, Master of Disguise (copie en arrivant, sauf le nom), The Clone Saga (copie non légendaire du prochain sort de créature, nom choisi gardé par un emblème), Norman Osborn // Green Goblin (chaos pour toutes les cartes non-terrain du cimetière).
- **Tests :** 26 tests de règles (« lot A, bleu »).

## Sous-lot A3 : cartes noires ✅ (69 / 188)

- **Cartes (20) :** Agent Venom, Common Crook, The Death of Gwen Stacy, Eddie Brock // Venom, Lethal Protector, Inner Demons Gangsters, Merciless Enforcers, Morlun, Devourer of Spiders, Parker Luck, Prison Break, Risky Research, Scorpion, Seething Striker, Scorpion's Sting, Spider-Man Noir, The Spot's Portal, Swarm, Being of Bees, Tombstone, Career Criminal, Venom, Evil Unleashed, Venomized Cat, Venom's Hunger, Villainous Wrath.
- **Moteur :** rien de nouveau.
- **Reste pour plus tard :** Alien Symbiosis (lancer depuis le cimetière en défaussant une carte), Behold the Sinister Six! (cibles de noms différents), Black Cat, Cunning Thief (regarder la bibliothèque d'un adversaire, exil face cachée), Gwenom, Remorseless (payer des PV au lieu du mana), Sandman's Quicksand (« si le coût de chaos a été payé »), The Soul Stone (coût « exilez une créature que vous contrôlez »).
- **Tests :** 30 tests de règles (« lot A, noir »).
