# L'IA : niveaux, évaluation, combat par simulation, ISMCTS

L'IA joue contre l'humain dans le navigateur (Web Worker) : on choisit son niveau à l'accueil (**Débutant**, **Moyen**, **Élevé**), et ce choix est retenu dans `localStorage`, sous `planecircle.aiLevel`. Le code est dans `packages/ai/src/`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `levels.ts` | `aiAgent(level, { seed, budget, players })` : l'agent d'un niveau ; `AiLevel`, `AiBudget` |
| `profile.ts` | `Profile` : ce qui distingue les niveaux (bruit, réponses, attaques, blocages, contre-attaque, mulligan, budget) |
| `heuristic.ts` | Décisions heuristiques paramétrées par le profil. `heuristicAgent()` = IA moyenne (fuzz, bench, tests) |
| `evaluate.ts` | Évaluation d'une position ; simulations (`rollout`, `simulate`, `step`) |
| `combat.ts` | Niveau élevé : attaques et blocages par simulation |
| `ismcts.ts` | Niveau élevé, duel : ISMCTS pour les décisions de priorité |
| `policy.ts` | Politique rapide des simulations de l'ISMCTS |
| `choices.ts` | Réponses aux choix génériques (regard, défausse, cibles de déclencheurs…) |
| `random.ts`, `scripted.ts` | IA aléatoire (fuzz), adversaire scripté (tutoriel) |

## Les niveaux

| Niveau | Sorts | Attaques | Blocages | Autres |
|---|---|---|---|---|
| **Débutant** | Simulation à un coup, mais il prend parfois une option correcte au hasard plutôt que la meilleure (45 %), ou oublie de jouer (20 %) ; ni réponse, ni tour de combat | Ce qu'aucun bloqueur ne tue sans mourir, plus un peu au hasard ; sans penser à la contre-attaque | Seulement s'il tue sans mourir, ou pour survivre | Mulligans larges ; joue toujours ses terrains |
| **Moyen** | Simulation à un coup, puis évaluation | Règles de combat (duels, attaque létale, sécurité en défense) | Gloutons par simulation | |
| **Élevé** | En duel, ISMCTS ; en multijoueur, comme le moyen avec la contre-attaque | Recherche par simulation des blocages adverses | Recherche : blocages à deux, améliorations locales | Évaluation avec la contre-attaque adverse |

## Choix et mulligan

- **Choix génériques** (`choices.ts`) : cibles d'un déclenchement et nouvelles cibles d'une copie, « vous pouvez » et « à moins que … ne paie » (oui ou non), petits nombres (X à payer, jusqu'à 6 valeurs) et choix d'une option parmi 6 au plus : chaque réponse est essayée par une simulation courte (`bestBySimulation`), la meilleure position l'emporte ; sinon la réponse suggérée par le moteur.
- **Choix multiples, répartitions, ordre des déclencheurs** (PLAN-C, C17) : quelques candidats, simulés jusqu'à la pile vide en répondant aux questions suivantes par la suggestion (`bestSettled`) :
  - répartition (blessures de combat, blessures ou marqueurs répartis) : la suggestion, tout sur un destinataire, et pour des blessures, de quoi détruire d'abord les créatures adverses les plus précieuses, le reste au joueur ;
  - choix de plusieurs options (regard, recherche, piles, prolifération, cibles multiples) : la suggestion, les plus et les moins précieuses, les siennes seules, celles des adversaires seules ;
  - ordre des déclencheurs : toutes les permutations jusqu'à trois capacités.
- **Coûts choisis et choix en arrivant** (C8, C9) : la suggestion du moteur, qui classe déjà les objets (flétrir la créature qui survit, sacrifier la moins précieuse…).
- **Mulligan** (`heuristic.ts`, profil « normal ») : 2 à 5 terrains sur 7 ; courbe : avec deux terrains, un sort de valeur 2 ou moins, avec plus, un sort jouable au tour qui suit (C17) ; au moins un sort dont les symboles colorés sont tous produits par les terrains de la main, types de terrain de base compris (305.6 ; avant C17, les terrains de base, qui n'impriment pas leur capacité, sautaient ce contrôle).
- **Attaques en multijoueur** (`attackTarget`, C17) : le joueur que l'attaque peut tuer, sinon le plus menaçant (force, planeswalkers, main), et non plus toujours celui qui a le moins de points de vie.

## Évaluation (`evaluate.ts`)

- **Caractéristiques durables.** Les créatures sont estimées d'après leurs caractéristiques en jeu, sans les effets « jusqu'à la fin du tour » (`durableChars` : `computeBattlefield` sur une copie superficielle de l'état, sans ces effets).
  - Une Aura (Pacifisme), un Équipement ou un renfort permanent comptent par leur effet sur la créature.
  - Un renfort temporaire ne compte que par ce qu'il change au combat.
  - Avant cela, l'IA ne lançait jamais Pacifisme.
- **Valeur d'une créature** (`profileValue`) : une part offensive et une part défensive.
  - Offensive : force, vol, menace, piétinement, double initiative, lien de vie.
  - Défensive : endurance, contact mortel, portée, initiative, vigilance.
  - « Ne peut pas attaquer » ou défenseur annulent la première ; « ne peut pas bloquer » réduit la seconde ; « ne se dégage pas » réduit le tout.
- **Autres permanents.**
  - Un Équipement a une valeur propre, attaché ou non (il peut changer de porteur).
  - Une Aura attachée vaut peu : elle compte à travers son hôte.
  - Au-delà de 7 terrains, un terrain de plus vaut peu.
- **Main.** Un permanent en main vaut moins qu'en jeu (0,7) ; un éphémère ou un rituel garde sa souplesse (1,5).
- **Contre-attaque** (niveau élevé, pendant son tour) : `incomingDamage` estime les blessures de la prochaine attaque adverse. Les créatures qui ont attaqué restent engagées jusqu'au prochain tour de l'IA. La pénalité vaut la moitié de la perte de vie, et elle est forte si l'attaque serait létale.

### Commander (PLAN-E)

- **PV effectifs** (`effectiveLife`) : les points de vie, réduits en proportion des blessures de combat reçues du commandant le plus menaçant (PV × (21 − blessures) / 21) ; sans blessure de commandant, les points de vie. Lus par `evaluate` et `targetOpponent`.
- **Commandant qui attend** dans la zone de commandement : 0,6 × sa valeur de créature, divisée par 1 + (lancers depuis la zone) / 2 ; il ne compte plus comme un emblème. La question 903.9a se règle par simulation (oui : le commandant reste disponible).
- **Cible d'attaque** à plusieurs (`attackTarget`) : un joueur qu'un commandant attaquant peut achever par ses 21 blessures de commandant est « tuable ».
- **Déterminisation** : un commandant est public, même dans une main ; il n'est ni tiré au hasard ni utilisé pour deviner les cartes cachées.
- **ISMCTS** reste réservé au duel, Commander compris : 65 % ± 15 contre le niveau moyen sur 40 parties de Commander à deux (decks aléatoires, budget 60, 06/10/2026).
- **Arène :** `npm run arena -- --a medium --b medium --format commander [--pool commander] [--by-deck] [--players 4]` (`--by-deck` : les decks changent de place, les IA restent ; « A » est le premier préconstruit, Edgar Markov ; `--deck cmd-<id>` : ce préconstruit contre chacun des autres). Une partie de Commander qui dépasse 150 tours est comptée inachevée (`playGame` et `maxTurns`) : une partie peut ne jamais finir selon les règles (chaque joueur contrôle une Darksteel Angel, que Dack Fayden distribue aux adversaires), et le niveau moyen ralentit quand le plateau dépasse 150 permanents. L'arène tourne par défaut sur tous les cœurs moins deux (`--jobs`) ; voir « Mesures (tournoi) ».
- **Équilibre des précons (06/10/2026, IA moyenne des deux côtés) :** en duel, Edgar Markov gagne 59,3 % ± 3,9 contre Y'shtola (600 parties, 21 tours en moyenne) ; à quatre (Edgar, Y'shtola, Edgar, Y'shtola), les sièges d'Edgar gagnent 33,3 % ± 5,3 (300 parties, 40 tours) : les drains de Y'shtola frappent chaque adversaire. Hors de la cible de 45 à 55 % dans les deux cas, en sens contraires ; les listes ne sont pas retouchées (à l'utilisateur de décider). The Ur-Dragon (troisième précon, `--deck cmd-ur-dragon`, contre les deux autres) : 54,9 % ± 4,0 en duel (600 parties, 17 tours), 41,2 % ± 5,7 à quatre (300 parties, 37 tours). Rakdos, Lord of Riots (quatrième précon, contre les trois autres) : 33,2 % ± 3,8 en duel (600 parties), 26,6 % ± 5,0 à quatre (300 parties) : nettement faible, à étudier dans l'IA.

## Combat par simulation (`combat.ts`, niveau élevé)

- **Attaques.** On essaie des ensembles d'attaquants :
  - d'abord le choix des règles ;
  - puis tous les sous-ensembles jusqu'à 4 attaquants optionnels, ou, au-delà, des préfixes triés par évasion et par force.
  
  Chacun est joué sur une copie : l'adversaire bloque comme l'IA moyenne, puis on évalue la position après le combat, contre-attaque comprise.
- **Blocages.** On part des blocages gloutons, puis on essaie :
  - les blocages à deux sur un même attaquant ;
  - le retrait ou l'échange d'un bloqueur.

## ISMCTS (`ismcts.ts`, niveau élevé, duel)

- **Quand.** Les décisions de priorité qui ont au moins deux options sensées : phases principales, réponses, fenêtres de combat.
- **Racine.** Passer, plus les 5 meilleures options de l'évaluation à un coup (`priorityOptions` de `heuristic.ts`). Le biais initial favorise les options que l'évaluation préfère.
- **Déterminisation, à chaque itération** (P3, lot R8 de PLAN-R) :
  - chaque carte cachée de l'adversaire (main et bibliothèque) est remplacée par un tirage : un terrain de base de ses couleurs vues (4 fois sur 10), sinon l'une de ses cartes vues (champ de bataille, cimetière, exil, sorts sur la pile) ;
  - sa propre bibliothèque est mélangée (rangée d'abord par définition), et le hasard du moteur est retiré.

  L'IA ne profite donc ni de la main adverse ni de la liste de son deck : seulement de ce qui a été montré. Avant R8, elle tirait la main parmi les vraies cartes restantes de l'adversaire.
- **Sélection** : UCB1.
- **Simulation** : la politique rapide (`policy.ts`), pour les deux joueurs, jusqu'au début du prochain tour de l'IA :
  - un terrain, puis le sort le plus cher, avec des cibles simples selon que l'effet nuit ou aide ;
  - attaques par règles, blocages naïfs.
- **Récompense** : victoire 1, défaite 0 ; sinon sigmoïde de l'écart d'évaluation avec la position de départ.
- **Choix final** : l'option la plus visitée.
- **Arbre limité à la racine.** Avec quelques dizaines à quelques centaines d'itérations, des nœuds plus profonds seraient trop peu visités.
- **Budget.**
  - Dans le navigateur : 0,7 s de réflexion (`AI_BUDGET`, `client/src/scenario.ts`). Environ 2 à 3 ms par itération sur la machine de dev ; si moins de 24 itérations tiennent dans ce temps (machine lente), la décision heuristique est gardée.
  - Dans les tests et au tournoi : budget en itérations, pour des résultats reproductibles.
- **Multijoueur.** Pas d'ISMCTS (trop coûteux pour rester fluide) : l'élevé garde l'évaluation avec contre-attaque et le combat par simulation.

## Latence

- La pause d'affichage entre deux actions de l'IA (`aiDelay`, 0,9 s, `engine/src/host.ts`) absorbe la réflexion. L'IA prépare son action suivante pendant la pause de la précédente (`settle`).
- Une IA élevée ne paraît donc pas plus lente, même sur une machine lente : elle y fait simplement moins d'itérations.
- `tools/ai-smoke.ts` le vérifie dans le navigateur, avec le processeur normal puis ralenti 4 fois.

## Mesures (tournoi)

`npm run arena -- --a expert --b medium --games 600 [--jobs 10] [--budget 100] [--pool decks|all|mix]`

- `--jobs` : processus parallèles, par défaut le nombre de cœurs moins deux (`--jobs 1` : tout dans le même processus). Chaque processus demande la partie suivante dès qu'il a fini la sienne : une longue partie de Commander à quatre (jusqu'à 150 tours, des décisions de plusieurs secondes) ne laisse plus les autres cœurs inoccupés (avant le 07/10/2026, chaque processus avait sa tranche fixe de parties, et `--jobs` valait 1 par défaut). Une partie ne dépend que de son numéro et de la graine : le résultat est identique quel que soit `--jobs`.
- Avancement sur la sortie d'erreur toutes les 10 s : parties jouées, temps écoulé, temps restant estimé, taux de A.
- Le compte rendu cite les cinq décisions les plus lentes (durée, partie, graine, rang de la décision, tour, joueur, niveau, attente, taille du plateau) et la commande qui rejoue chacune de ces parties seule (`--first N --games 1 --jobs 1`) ; `MTGX_SLOW_MS=N` devant cette commande détaille chaque décision de plus de N ms. Les temps de décision mesurés en parallèle sont plus élevés qu'avec `--jobs 1` (cœurs partagés) : profiler une partie seule.

- Les parties vont par paires : même graine, places et decks échangés. Le taux d'une IA contre une copie d'elle-même vaut donc exactement 50 %.
- Syntaxe `expert:200` pour un budget propre à une IA ; `expert:0` pour l'élevé sans ISMCTS.

Résultats, sur des decks préconstruits et des decks aléatoires bicolores (`--pool mix`), ISMCTS à 100 itérations :

| Paire | Parties | Taux de victoire de la première |
|---|---|---|
| Moyen (évaluation v2) contre l'IA d'origine | 1 000 | 55,5 % ± 3,1 |
| Moyen contre Débutant | 1 000 | 65,6 % ± 2,9 |
| Élevé contre Moyen | 600 | 60,8 % ± 3,9 |
| Élevé contre Débutant | 600 | 73,2 % ± 3,5 |
| Élevé contre Élevé sans ISMCTS | 300 | 56,7 % ± 5,6 |

Sur les decks du méta Standard (`--pool meta`, ISMCTS à 100 itérations), le 30/09/2026 :

| Paire | Parties | Avant le P3 | Après le P3 |
|---|---|---|---|
| Élevé contre Moyen | 600 | 66,8 % ± 3,8 | 65,0 % ± 3,8 |

**Référence du 03/10/2026** (après PLAN-C C17, ISMCTS à 100 itérations, tout le Standard jouable) :

| Paire | Pool | Parties | Taux de victoire de la première |
|---|---|---|---|
| Élevé contre Moyen | tout le pool (decks aléatoires bicolores) | 600 | 62,2 % ± 3,9 |
| Élevé contre Moyen | méta Standard | 600 | 66,2 % ± 3,8 |

Temps de décision de l'élevé pendant ces tournois (machine chargée) : 78 à 96 ms en moyenne, 570 à 740 ms au 95ᵉ centile ; le maximum (10 à 20 s) vient de décisions sur de grands plateaux, bornées dans l'interface par le budget en temps. Le premier passage de ce tournoi a trouvé une erreur interne du moteur (mana d'un Trésor avec un doubleur), corrigée avant la mesure (`RULES_VERSION` 71).

Le P3 (déterminisation par les cartes vues, choix « vous pouvez » et petits choix essayés par simulation, mulligan selon les couleurs) touche les deux niveaux ; l'écart n'est pas significatif. L'IA élevée garde son avance sans connaître la liste du deck adverse.

Temps de décision de l'élevé à 100 itérations : environ 30 ms en moyenne (la plupart des décisions sont triviales), 300 ms au 95ᵉ centile ; dans l'interface, le budget en temps borne la réflexion.

L'« IA d'origine » est l'IA heuristique d'avant les niveaux : une copie figée a servi à la mesure, puis a été retirée.

Changements du lot C17 (choix, mulligan, attaques en multijoueur), mesurés à graines appariées contre le comportement d'avant (bascule temporaire, retirée ensuite), le 03/10/2026 :

| Mesure | Parties | Taux de victoire du nouveau |
|---|---|---|
| Moyen, tout le pool | 600 | 50,2 % ± 4,0 |
| Moyen, méta | 800 | 50,2 % ± 3,5 |
| Moyen, quatre joueurs (sièges A, B, A, B) | 400 | 49,8 % ± 4,9 |
| Couleurs des terrains de base au mulligan, tout le pool | 800 | 50,2 % ± 3,5 |
| Idem, méta | 800 | 51,2 % ± 3,5 |

Aucun écart significatif, et pas de régression : ces choix sont rares en partie (sur 80 parties du méta, la réponse ne change que 2 fois au mulligan, 4 fois pour l'ordre des déclencheurs, 10 fois pour des cibles multiples, jamais pour la répartition des blessures de combat). Ils sont gardés pour leur justesse.

`npm run arena -- … --players 4` joue des parties à quatre (sièges A, B, A, B, décalés d'une partie à l'autre, decks aléatoires).

Essais sans gain mesurable, écartés :
- réglages de l'ISMCTS (exploration, échelle de la récompense, 4 ou 8 options, horizon d'un tour de plus) ;
- ISMCTS sur les attaques (53 %) : l'adversaire des simulations bloque naïvement, ce qui rend les attaques trop agressives.

## Pièges

- **Multijoueur, grands plateaux :** une décision de priorité du niveau moyen prend 1,5 à 4 s quand le champ de bataille compte 50 à 90 permanents (parties à quatre longues, mesuré au tournoi le 03/10/2026) ; c'était déjà le cas avant C17. Le niveau moyen n'a pas de budget en temps : à borner si l'interface en souffre. Borne posée le 06/10/2026 pour les choix (deck The Ur-Dragon, boucles de déclenchements) : avec plus de 12 objets sur la pile ou plus de 150 permanents, les choix ne sont plus simulés (suggestion du moteur, ordre par valeur) ; une cible de déclenchement prenait jusqu'à 242 s avec 92 objets sur la pile.

- **Information cachée.** Le code de l'IA ne doit jamais lire la main adverse, la liste de son deck ni l'ordre des bibliothèques. Il passe par `determinize` (ISMCTS), qui ne tire que de ce qui a été vu. Les simulations à un coup (`rollout`, `simulate`) ne piochent pas. `ai/test/ismcts.test.ts` vérifie qu'une autre répartition, ou d'autres cartes cachées, ne changent ni la déterminisation ni la décision.
- **`applyMutable` n'est pas transactionnel.** Une décision illégale laisse l'état à moitié modifié. Dans une simulation, on passe par `step` (`evaluate.ts`) : « passer » est appliqué sur place, le reste par `submit`, qui travaille sur une copie.
- **`GameHost.run` et les attentes.** Pendant un `await` de la boucle (pause d'affichage), une décision de l'humain peut être appliquée par `submitHuman`, dont le `run()` rend aussitôt la main (la boucle est déjà en cours). Après chaque attente, la boucle doit donc repartir de l'état courant, et ne jamais attendre sans raison : sinon l'IA reste bloquée. `engine/test/host.test.ts` le vérifie.
- **Budget.** En temps dans l'interface (latence identique sur toutes les machines), en itérations dans les tests, le tournoi, le fuzz et le bench (reproductibles).
- **Fuzz.** `npm run fuzz -- --ai levels` mélange les trois niveaux, avec un ISMCTS à petit budget, et fait partie de `verify`.
