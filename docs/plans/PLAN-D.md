# PLAN-D — les reports de l'analyse des cartes (03/10/2026)

Suite de `docs/audits/2026-10-03-cartes.md` (lots K0 à K8) : ce qui a été reporté faute d'une forme dans le moteur, et les
petits écarts relevés en route. Les lots se font dans l'ordre conseillé, un commit par lot sur `dev`.

Cartes des reports jouées dans les decks du méta (copies) : Practiced Offense (7), Superior Spider-Man (4), Sarkhan, Dragon
Ascendant (4), Dispelling Exhale (3), Moseo, Vein's New Dean (3), Elven Passage (2), Head of the Hunt (1).

## Lots

| Lot | Contenu | Coût | État |
|---|---|---|---|
| D1 | « Au choix » choisi à la résolution (608.2d) au lieu d'un mode : Practiced Offense, Wingnut, Manifold Mouse, Iceberg Titan | petit, scripts |✅ |
| D2 [règles] | Contempler : coût additionnel facultatif choisi au lancement (permanent ou carte de la main révélée, événement filtré), noté sur la pile (`cond.beheld`), variante « ou payez {N} », choix pendant une résolution (Sarkhan, Elven Passage) ; Exhales, cinq cartes d'ECL, Kindle the Inner Flame, Countersculpt, Theorist's Sanctum ; client et IA | moyen à gros | |
| D3 [règles] | Capacités réflexives après une arrivée ou un remplacement : Superior Spider-Man (exil de la carte copiée), Head of the Hunt (le Loup) | moyen | |
| D4 [règles] | Valeurs évaluées au ciblage : filtre de cible à valeur de mana calculée (Moseo, Likeness Looter), X annoncé pour une capacité sans {X} et respecté par le sacrifice (Sidisi) | moyen | |
| D5 [règles] | Conditions au bon moment : notée au lancement, lue à la résolution (Faerie Fencing) ; vérifiée au déclenchement seulement pour un déclencheur de sort (Social Snub) | petit à moyen | |
| D6 [règles] | Modes et cibles variables : modes d'une capacité réflexive (Hylda), « jusqu'à X cibles » d'une capacité déclenchée (Prismabasher), modes d'une capacité accordée | moyen | |
| D7 [règles] | Choix rendus au joueur, suite : sorte de marqueur retirée en coût (options qui ne sont pas des objets dans le client) ; copies facultatives (Moonlit Meditation, Mirrormind Crown) ; Équipement ou hôte choisi à la résolution (Light of Judgment, Unexpected Request, One Last Job) ; engagement automatique qui garde le mana nécessaire (Guardian of the Great Door) | moyen | |
| D8 | Petits écarts : mots-clés lus face par face à l'import (Dion), carte de permanent du cimetière lancée pendant une résolution (Tinybones, the Pickpocket), dernière information d'une carte partie du cimetière (Ill-Timed Explosion), Faller's Faithful, Sunstar Expansionist, Singularity Rupture, restes des durées (Ultima, Lightning, Security Sergeant, Glowcap Lantern…) ; Lifecraft Engine et Raiding Schemes restent documentés sauf demande | petit, à trier | |
| D9 | Fin de la couverture : les 23 M/R/U encore jamais nommées dans un test (ECL, TLA, MSH, SPM, TMT, HOB, WOE), puis les communes au fil de C13 | petit | |

Hors série, à la demande de l'utilisateur : décisions officielles de Scryfall en tests (option 7 de l'analyse), bouton
« signaler une erreur » (option 9), référents en multijoueur.

## Ordre et vérifications

- Ordre : D1, D3 (peu coûteux, trois cartes du méta), D2 (le plus de cartes), D4, D5, D6, D7 ; D8 et D9 au fil de l'eau.
- Chaque lot : tests de règles tirés de l'Oracle ; entrées retirées d'`approximations.md` ; `RULES_VERSION` et parties dorées
  pour un lot [règles] ; `npm run verify -- --set <EXT>` (ou `--set META`, `--ui` si le client change) ; un commit.
- `npm run verify -- --full` à la fin de D2, de D7 et de la série ; tournoi de l'IA (`npm run arena`) après D2 et D7.

## Suivi

- **03/10/2026 :** plan écrit à la demande de l'utilisateur.
- **03/10/2026, D1** (règles 87) : opération générique `chooseOption` et aide `fx.yourChoice(prompt, store, branches)` (« au choix », 608.2d : l'option est choisie pendant la résolution, parmi des libellés) ; Practiced Offense n'est plus un sort modal (il déclenchait à tort ce qui compte les sorts modaux) ; Wingnut et Manifold Mouse choisissent leur mot-clé à la résolution ; Iceberg Titan cible au déclenchement et engage ou dégage à la résolution (entrée retirée d'`approximations.md`) ; 1 test ajouté, 3 adaptés ; plafond « Effect (champs) » 658 → 662 ; parties dorées identiques ; suite complète, fuzz strict de SOS, TMT, BLB, LCI et `verify --set META` verts.

