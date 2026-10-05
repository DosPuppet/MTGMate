# Plan R — remédiation de l'audit du 30/09/2026

> **Archivé le 01/10/2026.** Plan terminé le 30/09/2026, sauf R1 (en partie) et R7 (continu), désormais suivis par la section « Ajouter des cartes ou une extension : suivre R1 et R7 » de CLAUDE.md.

Plan établi le 30/09/2026 (branche `dev`) : il sert de feuille de route aux prochaines sessions. Il détaille et ordonne la feuille de route R0 à R8 de `docs/audits/2026-09-30.md` (§ 9).

## Suivi

- **30/09/2026 :** plan écrit ; **F2 fait** (garde-fou de la dette et règle en fin de CLAUDE.md).
- **30/09/2026 : F1 fait** (`RULES_VERSION` = 1, empreintes et rejeu vérifié, un compteur d'identifiants par préfixe, reprise des salons selon la version, parties dorées ; détail dans `docs/extensions/socle.md`, lot F1).
- **30/09/2026 : F3 fait** (serveur : URL mal encodée, adresse du client par `X-Real-IP`, `Origin` vérifié, `/scry/` sans chaîne de requête, plafond de salons par adresse, en-têtes de sécurité ; nginx mis à jour).
- **30/09/2026 : R0.1 fait** (`RULES_VERSION` = 2 : second partagé et actions spéciales, protection contre tout et blessures impossibles à prévenir, 704.5b, gagner ou perdre la partie, marqueurs payés comme coût, 506.4, erreur au-delà de 100 passes d'actions basées sur l'état ; tests dans `engine/test/audit.test.ts`).
- **30/09/2026 : R0.2 fait** (`RULES_VERSION` = 3 : taxes payées par les sorts gratuits et options gratuites vérifiées, taxes d'attaque et de blocage cumulées, obligation d'attaquer seulement vers un défenseur sans taxe, `forcedAttacks` pour l'automatisme).
- **30/09/2026 : R0.3 fait** (`RULES_VERSION` = 4 : nettoyage 514.3a). `tutorial-smoke` : « action hors guide refusée » échoue sur cette machine, déjà avant R0.3 (aucun message après le clic sur la Plaine, qui n'est pas jouée) ; à examiner à part.
- **30/09/2026 : R0.4 fait** (`RULES_VERSION` = 5 : lien de vie, un gain par source et par lot de blessures simultanées).
- **30/09/2026 : R0.5 fait** (`RULES_VERSION` = 6 : 603.6a). Constat : les parties dorées des versions 1 à 5 se rejouent à l'identique avec le moteur de la version 6 ; elles couvrent le déroulement courant d'une partie, pas les cas corrigés en R0 (que couvrent les tests de `engine/test/audit.test.ts`). Piste : des parties dorées jouées par l'IA moyenne, plus riches.
- **30/09/2026 : R0.6 fait** (sans changement de règles : poison affiché, cartes révélées et poison au journal, abandon confirmé, noms de cartes des invites du moteur dans la langue de l'interface par `cardRef`). **R0 terminé.**
- **30/09/2026 : R4.0 fait** (`RULES_VERSION` = 7 : `playerStatics(s, p, clé)`, seul accès aux statiques de joueur ; 23 lectures directes migrées ; conditions des doubleurs vérifiées ; bench inchangé).
- **30/09/2026 : R2.1 fait** (`RULES_VERSION` = 8 : `EntersContext` porte l'état engagé, l'attaque, les marqueurs, les modifications de couches, la célérité et l'Imminence, posés avant l'événement d'arrivée par `moveWithSpec`, la création de jetons, `copyToken` et la résolution d'un sort de permanent ; défenseur des jetons attaquants au choix).
- **30/09/2026 : R2.2 fait** (`RULES_VERSION` = 9 : copies de permanents ; N7, N8, N9, #13 en partie).
- **30/09/2026 : R2.3 fait** (`RULES_VERSION` = 10 : Clone ou Aura qui arrive sans être lancé ; #7, 303.4f, 303.4g).
- **30/09/2026 : R1 fait en partie** (`RULES_VERSION` = 11 : ordre des remplacements chiffrés choisi pour le joueur affecté, `drawCards` pour toutes les pioches ; la conversion des drapeaux en capacité générique est reportée aux familles de R4).
- **30/09/2026 : R3 fait** (`RULES_VERSION` = 12 : une copie de sort est un objet sur la pile ; nouvelles cibles au choix pour toute copie, qui deviennent ses cibles ; répartition annoncée à la mise sur la pile, part d'une cible devenue illégale perdue ; #4, #15, N11). Constat : le fuzz à 3 joueurs du méta (2 parties inachevées sur 100) et à 4 joueurs sur tout le pool (1 sur 100) échouait déjà avant R3, à l'identique : parties aléatoires qui atteignent la limite de décisions, pas un blocage.
- **30/09/2026 : R2.4 fait** (`RULES_VERSION` = 13 : couche 2, contrôleur de base et effets de contrôle horodatés, 800.4a ; #12, N10). Bench inchangé (aléatoire 2 joueurs 6 272 → 6 668 déc/s, 4 joueurs 4 115 → 4 466). Le tutoriel se rejoue (`tutorial.test.ts`, `tutorial-smoke`).
- **30/09/2026 : R2.5 fait** (`RULES_VERSION` = 14 : 613.8 par point fixe, couleurs ajoutées, exceptions de copie copiables). Bench coup sur coup (`git stash`) : aléatoire 2 joueurs 6 529 → 6 527 déc/s, 4 joueurs 4 414 → 4 398, IA heuristique 4 joueurs 1 094 → 1 093 : inchangé, cible de 5 000 déc/s atteinte.
- **30/09/2026 : R4.1 fait** (sans changement de règles) : `BlockRule` (« ne peut pas être bloquée par [filtre] », « ne peut bloquer que [filtre] », nombre de bloqueurs, « pas seule »), 11 mots-clés en moins (33 → 22).
- **30/09/2026 : R4.2 fait** (`RULES_VERSION` = 15) : `ProtectionRule` (protection et défense talismanique « contre [filtre] »), `ObjectFilter.colorCount` et `not`, 5 mots-clés en moins (22 → 17) ; Sword of Wealth and Power et Resilient Roadrunner sans approximation.
- **30/09/2026 : R4.3 fait** (sans changement de règles) : `PowerRule` (« utilise son endurance pour » : blessures de combat, équipage, station), 4 mots-clés (17 → 13) et un drapeau de joueur (96 → 95) en moins.
- **30/09/2026 : R4.4 fait** (`RULES_VERSION` = 16) : `playFrom` (famille C, 11 drapeaux) et `abilityCost` (famille A, 5 drapeaux) ; drapeaux de joueur 95 → 81.
- **30/09/2026 : R4.5 fait** (sans changement de règles) : `castLimit` (famille D, 7 drapeaux) et `triggerMod` (famille G, 7 drapeaux) ; drapeaux de joueur 81 → 69.
- **30/09/2026 : R4.6 fait** (sans changement de règles) : `counterOnOrCreate` (renforcer Jace, amasser), « le prochain sort » en effet de joueur à usage unique (`nextSpell`), `instantJaceLoyalty` et `extraMountainMana` par `fx.thisTurn`. **R4 terminé** : la référence de la dette passe de 96 / 33 / 61 à 69 drapeaux de joueur, 13 mots-clés non imprimés et 58 opérations d'une seule carte.
- **30/09/2026 : R5 fait** (`RULES_VERSION` = 17) : blocages des défenseurs appliqués ensemble, cachés jusqu'au dernier (509.1) ; mulligans tour de table par tour de table (103.5).
- **30/09/2026 : R6 fait** (`RULES_VERSION` = 18) : boucle d'actions obligatoires déclarée nulle (104.4b) ; les trois gardes y passent. En cherchant la cause des parties « inachevées » du fuzz (méta à 3 joueurs, tout le pool à 4), trouvé : un déclenchement d'un joueur éliminé restait en attente, jamais mis sur la pile, et le nettoyage redonnait la priorité sans fin (514.3a). Corrigé (800.4a) : `verify --full` passe entièrement.
- **30/09/2026 : R7 fait** (`RULES_VERSION` = 19) : un fichier de tests de règles par extension partielle (11 fichiers, 195 tests), `rulings.test.ts` (10 tests tirés des décisions officielles), deux motifs d'Oracle de plus. Ces tests ont trouvé 7 écarts, corrigés (voir la section R7).
- **30/09/2026 : R8 fait** (sans changement de règles d'une partie) : interface (garder la priorité, passe douce et passe dure, réglages retenus, annulation d'un terrain engagé, alerte de mana flottant, aperçu des blessures de combat, accessibilité, recherche du deckbuilder, moins de redessins) ; IA (P3). Tournoi sur les decks du méta, élevé contre moyen : 66,8 % ± 3,8 avant, 65,0 % ± 3,8 après (écart non significatif ; `docs/ia.md`).
- **Le plan est terminé, sauf :** R1 en partie (familles E, H, I et boucliers 615.7, reportés faute de carte qui les exige) et R7, continu.
- **01/10/2026 :** familles E et F (TDM D), H et I (ECL D) et boucliers 615.7 faits ; R7 se poursuit, suivi par `docs/plans/PLAN-C.md` (lot C13).

## Le garde-fou de la dette (lot F2)

- Un test, `packages/cards/test/debt.test.ts`, compare trois listes à une référence, `packages/cards/data/debt-baseline.json` :
  - les champs de `PlayerStaticAbilityDef` ;
  - les membres de `Keyword` qui ne sont pas des mots-clés imprimés ;
  - les opérations d'effet utilisées par une seule carte.
- Il échoue sur une nouvelle entrée (voir la règle en fin de CLAUDE.md) et sur une entrée périmée : le plafond ne peut que baisser.


## Décisions et ordre

- **Lots :** un commit par lot, rattaché aux numéros R0 à R8 de l'audit.
- **Lots marqués [règles] :** ils changent le comportement du moteur. Chacun :
  - fait avancer `RULES_VERSION` ;
  - ajoute un test de règles par écart, dans `engine/test/audit.test.ts` (un `describe` par numéro du § 3.1, qui reprend la mise en scène du script de l'audit) ;
  - retire sa ligne du § 3.1 de `docs/audits/2026-09-30.md` et de `docs/approximations.md`, et ajoute une ligne au suivi.
- **Ce fichier est tenu à jour à chaque lot :** colonne « État » du tableau d'ordre et du tableau des écarts N, ligne de suivi, section du lot marquée ✅ avec ce qui a été réalisé et les écarts par rapport au prévu.
- **Décision de l'utilisateur (30/09/2026) : pas de nouvelles cartes tant que le moteur n'est pas sécurisé et finalisé.** La phase 2 du P4 (Tarkir: Dragonstorm) attend la fin de ce plan (au moins R0 à R6).
- **Ordre d'exécution :**

| # | Lot | Audit | Dépend de | Risque | État |
|---|---|---|---|---|---|
| 1 | F1 : version des règles, empreintes de parties, un compteur d'identifiants par préfixe | nouveau | — | moyen | ✅ `ce1dbc0` |
| 2 | F2 : garde-fou de la dette | § 3.3 | — | faible | ✅ `025b25a` |
| 3 | F3 : durcissement du serveur | § 6 | — | faible | ✅ `e5910a4` |
| 4 | R0.1 à R0.6 : corrections rapides | § 3.1 | F1 | faible à moyen | ✅ `709a43a` à `c7896e5` |
| 5 | R4.0 : accesseur unique des statiques de joueur | § 3.3 | F2 | moyen | ✅ (voir suivi) |
| 6 | R2.1 à R2.3 : entrée sur le champ de bataille, copies de permanents | § 3.1, § 3.2 | R4.0 | moyen | ✅ `f0b77a1`, `ead9cd5`, `c055371` |
| 7 | R1.1 à R1.3 : remplacements (616) | § 3.2 | R4.0, R2.1 | élevé | ✅ en partie (voir la section) |
| 8 | R3.1 et R3.2 : copies de sorts, blessures réparties | § 3.1 | R0 | moyen à élevé | ✅ `827cc6f` |
| 9 | R2.4 : couche 2 (contrôle) | § 3.2 | R4.0 | élevé | ✅ `2b2ef83` |
| 10 | R2.5 : 613.8 par point fixe, couche 5 « en plus » | § 3.2 | R2.2, R2.4 | élevé (perf.) | ✅ `be0eefa` |
| 11 | R4.1 à R4.6 : familles génériques | § 3.3 | R1, R2 | moyen | ✅ `41a3cf0` à `616411f` |
| 12 | R5 : blocages simultanés, mulligans 103.5 | § 3.2 | F1 | moyen | ✅ `ecc17e6` |
| 13 | R6 : boucles (104.4b) | § 3.2 | F1 | moyen | ✅ `95dfd1b` |
| 14 | R7 : justesse des cartes | § 3.4 | — | continu | ✅ `60549ef` (à poursuivre) |
| 15 | R8 : interface, puis IA (P3) | § 4, § 5 | — | moyen | ✅ (voir suivi) |

## Écarts supplémentaires, trouvés en préparant ce plan

Lus dans le code ; chacun est confirmé par un test au début de son lot.

| # | Écart | Preuve | Lot | État |
|---|---|---|---|---|
| N1 | Un seul compteur d'identifiants pour les objets, les effets, les déclencheurs et les effets de joueur : un effet de plus décale tous les objets suivants, et les anciens enregistrements visent d'autres objets | `engine/src/state.ts:174` | F1 | ✅ F1 |
| N2 | Les marqueurs posés comme coût (loyauté +N, `cost.addCounters`) sont doublés par les doubleurs | `engine/src/stack.ts:1807, 1824` | R0.1 | ✅ R0.1 |
| N3 | `attackTax` et `blockTax` sont lus comme des booléens : deux Archangel of Tithes coûtent {1} | `engine/src/turn.ts:612, 736` | R0.2 | ✅ R0.2 |
| N4 | Les options de sort gratuit ne vérifient pas que les coûts restants sont payables | `engine/src/legal.ts:298, 302` | R0.2 | ✅ R0.2 |
| N5 | Perte par poison annoncée comme « pioche » | `engine/src/turn.ts:951-953` | R0.1 | ✅ R0.1 |
| N6 | 29 lectures directes des statiques de joueur ignorent leur condition et les effets sur les joueurs ; `doublers` ignore la condition | `engine/src/actions.ts`, `engine/src/stack.ts`, `engine/src/statics.ts:120` | R4.0 | ✅ R4.0 |
| N7 | Un Clone qui copie un planeswalker arrive sans loyauté ; `applyEntersReplacements` lit la carte imprimée | `engine/src/replacement.ts:212-261` | R2.2 | ✅ R2.2 |
| N8 | `copyToken` lit la carte imprimée et engage le jeton par un événement « devient engagé » | `engine/src/ops/permanents.ts:218, 226` | R2.2 | ✅ R2.2 |
| N9 | Le `copyOf` d'une statique n'est jamais appliqué (Assimilation Aegis ne copie rien) ; la copie d'un sort de Clone est un 0/0 | `engine/src/layers.ts:420-424`, `engine/src/stack.ts:2115` | R2.2 | ✅ R2.2 |
| N10 | Deux vols de contrôle du même permanent dans un tour le rendent au mauvais joueur ; un joueur qui quitte la partie fait exiler les permanents volés (800.4a) | `engine/src/turn.ts:322-329, 1006-1008` | R2.4 | ✅ R2.4 |
| N11 | Une copie de sort n'a pas d'objet : « contrecarrez le sort ciblé » ne peut pas la viser, et les « défense talismanique contre » sont ignorées | `engine/src/targets.ts:207-212, 244-252` | R3.1 | ✅ R3 |
| N12 | `drawBonus` (Vnwxt, Quantum Riddler) n'est appliqué que par 2 des 11 appels de `drawCard` | `engine/src/effects.ts:769` | R1.3 | ✅ R1 |

## Phase 0 — fondations ✅

**Réalisé :** F1 (`ce1dbc0`), F2 (`025b25a`), F3 (`e5910a4`). Écart au prévu pour F3 : les en-têtes de sécurité sont envoyés par le serveur Node (nginx les transmet) ; HSTS est en commentaire dans le site nginx, à activer après certbot ; reste : jetons de reconnexion en clair dans `data/rooms`.

- **F1 [règles] : version des règles, empreintes de parties, compteur d'identifiants.**
  - Dans `engine/src/record.ts` :
    - constante `RULES_VERSION` ;
    - `GameRecord.rules` (absent = 0) ;
    - `checkpoints` : l'empreinte `outcomeHash(s)` toutes les 25 décisions.
  - `outcomeHash(s)` est une projection stable : tour, étape, décision attendue, PV, poison, zones en `defId`, champ de bataille (propriétaire, contrôleur, engagé, blessures, marqueurs), pile. Hachage pur (cyrb53).
  - Un compteur d'identifiants par préfixe (N1).
  - Serveur, partie sauvegardée :
    - même version : on la rejoue, et une empreinte différente vaut `.bad` ;
    - autre version : on la reprend si toutes les empreintes concordent, sinon le salon est fermé proprement (fichier gardé en `.rules<N>`, message « Partie interrompue par une mise à jour du moteur »).
  - Visionneur de replays : lecture jusqu'à la première divergence, avec un bandeau.
  - Test doré : `ai/test/golden.test.ts`, six parties à graine fixe (decks du méta, 2 et 4 joueurs), régénérées par un outil `--update`.
- **F2 : garde-fou de la dette.** Voir la section « Le garde-fou de la dette » plus haut.
- **F3 : durcissement du serveur.**
  - `decodeURIComponent` protégé (réponse 400) ;
  - adresse du client prise dans `X-Real-IP` (fixé par nginx), sinon le dernier `X-Forwarded-For` ;
  - liste blanche d'`Origin` ;
  - `/scry/` sans chaîne de requête ;
  - plafond de salons par IP ;
  - en-têtes de sécurité dans `deploy/nginx-planecircle.conf`.

## R0 — corrections rapides ✅

- **R0.1 [règles] :**
  - second partagé : la vérification passe après la branche des actions spéciales (`stack.ts:1698`), et le filtre de `legal.ts:431` les garde (#9) ;
  - protection contre tout soumise à `unpreventable` (#11) ;
  - 704.5b : indicateur remis à zéro après `checkGameOver` (#8) ; raison « poison » pour la perte par poison (N5) ;
  - `winGame` et `loseGame` respectent « ne peut pas perdre », plus une clé « ne peut pas gagner » (#10) ;
  - marqueurs de coût non doublés (N2) ;
  - 506.4 : un non-créature sort du combat dans les actions basées sur l'état (#16) ;
  - la limite de 100 passes des actions basées sur l'état lève une `Error` au lieu de s'arrêter en silence.
- **R0.2 [règles] :**
  - taxes payées pour les sorts gratuits (#5), et coûts restants vérifiés dans `legal.ts` (N4) ;
  - taxes d'attaque et de blocage cumulées (N3) ;
  - obligation d'attaquer seulement s'il existe un défenseur sans taxe (#3) ;
  - nouvelle API `forcedAttacks(s, p)`, utilisée par l'automatisme et l'IA (`heuristic.ts`, `combat.ts`, `random.ts`, `policy.ts`).
- **R0.3 [règles] : nettoyage 514.3a (#1).**
  - `stateBasedActions` renvoie un booléen ;
  - `finishCleanup` lance les actions basées sur l'état. Si quelque chose s'est passé ou qu'un déclencheur attend, il met `turn.cleanupAgain` et donne la priorité, puis `endStep` rejoue le nettoyage.
- **R0.4 [règles] : lien de vie (#2).** Un lot de gains par source, ouvert par le `simultaneously()` le plus extérieur (`triggers.ts:132`) et vidé à sa fin ; remis à zéro dans un `finally`.
- **R0.5 [règles] : 603.6a (#6).** Les arrivées du même lot sont détectées à la fin du lot, avec les sources d'après le lot. Même mécanisme que R0.4.
- **R0.6 : informations et finitions** (sans changer les règles) :
  - poison dans `PlayerView` ;
  - cartes révélées montrées et journalisées ;
  - confirmation avant d'abandonner ;
  - noms français dans les invites du moteur (`turn.ts:870`, `triggers.ts:997`).

**Réalisé, et écarts par rapport au prévu :**
- R0.1 : pas de nouvelle clé « ne peut pas gagner » ; `cantLose` (Herald : « vos adversaires ne peuvent pas gagner ») sert aux deux sens, conformément à la règle anti-drapeaux. Marqueurs de coût : propriété générique `effectOnly` des doubleurs (seul Doubling Season dit « si un effet devait »).
- R0.2 : `forcedAttacks` sert à l'automatisme ; l'IA garde `forcedAttackers` (désormais tenant compte des taxes) et choisit ses défenseurs elle-même ; en multijoueur, elle peut encore viser un joueur taxé.
- R0.5 : approche additive plutôt que différée : chaque arrivée reste détectée tout de suite, puis est revue en fin de lot pour les sources arrivées après elle.
- R0.6 : les messages d'erreur (`RulesError`) nomment encore les cartes en anglais ; les pertes de PV hors blessures ne sont pas journalisées.
- Tests : `engine/test/audit.test.ts` (19 tests), `client/test/i18n.test.ts`.

## R4.0 — accesseur unique des statiques de joueur [règles] ✅

- `playerStatics(s, p)` renvoie les capacités vivantes dont la condition est remplie, plus les effets sur les joueurs.
- `playerStatic`, `playerStaticTotal`, `doublers`, `counterDoublers` et `tokenMultiplier` sont réécrits dessus.
- Les 29 lectures directes y passent (N6).
- Le cache indexé par version est gardé.

**Réalisé :**
- `playerStatics(s, p, clé)` (`statics.ts`) : statiques de joueur en vigueur qui portent la clé, condition vérifiée, effets sur le joueur compris ; `playerStatic` et `playerStaticTotal` reposent dessus. La clé est obligatoire : une condition peut elle-même lire une statique (« récit durable »), et évaluer les conditions de toutes les statiques bouclait à l'infini (trouvé par le fuzz).
- 23 lectures directes migrées (`stack.ts`, `actions.ts`, `mana.ts`, `triggers.ts`, `ops/zones.ts`). Restent volontairement trois lectures de statiques d'objet (Aura ou source liée : Grievous Wound, Valgavoth, Terror of the Peaks), qui ne sont pas des statiques du joueur.
- `doublers` et `counterDoublers` vérifient la condition des doubleurs (délire).
- Bench (sur batterie, avant → après) : aléatoire 2 joueurs 2 976 → 3 008 déc/s, 4 joueurs 2 046 → 2 034 : inchangé. La cible de 5 000 déc/s n'est pas atteinte sur cette machine, avant comme après.
- Tests : `engine/test/audit.test.ts` (N6 : effet « ce tour-ci » appliqué, condition non remplie, doubleur sous condition).

## R2.1 à R2.3 — entrée sur le champ de bataille et copies de permanents ✅

- **R2.1 [règles] :**
  - `EntersContext` (`replacement.ts:23-46`) reçoit `tapped`, `attacking` (défenseur), `counters` et `mods`, appliqués avant l'événement d'arrivée ;
  - `moveWithSpec`, `createTokens`, `copyToken` et `StackItem.arrival` passent par lui (#14) ;
  - 508.4 : le défenseur d'un jeton attaquant est demandé (#17).

  **R2.1 réalisé ✅ :**
  - `EntersContext` (`replacement.ts`) : `tapped`, `attacking`, `counters`, `mods` (tout `LayerMods`), `haste`, `impending`, appliqués au début d'`applyEntersReplacements`, donc avant les autres remplacements d'arrivée et avant l'événement d'arrivée ;
  - y passent : `moveWithSpec` (plus rien n'est ajouté après coup), `createTokens(…, enters)`, `createTokenCopy(…, enters)` et `copyToken` (plus d'événement « devient engagé » pour un jeton créé engagé : c'était N8 en partie), la résolution d'un sort de permanent (`arrival` de Torgal, Summon: Fenrir, Noctis ; Imminence, qui n'est plus une créature au moment de l'arrivée) ;
  - 508.4 : l'opération « créer des jetons engagés et attaquants » demande le défenseur s'il y en a plusieurs (`autoOk`, suggestion : ce qu'attaque la source) ; ailleurs (`moveWithSpec` attaquant), choix automatique `attackingDefender` ;
  - tests : `engine/test/audit.test.ts` (#14, #17, jeton créé engagé).
- **R2.2 [règles] :**
  - valeur de mana par `copiedDefId` (#13) ;
  - `applyEntersReplacements` lit la carte copiée (N7) ;
  - `copyToken` corrigé (N8) ;
  - `copyOf` des statiques, et copie d'un sort de Clone (N9) ;
  - exceptions de copie copiables (707.9b).

  **R2.2 réalisé ✅ :**
  - `copiedDefId` voit aussi une copie portée par une statique d'un permanent attaché (Assimilation Aegis, `copyLinkedExile`), avec l'horodatage de l'attachement ; `computeBattlefield` en tient compte (N9) ;
  - valeur de mana vue par les filtres : celle de ce qui est copié ; sans copie, celle du recto (712.8e) (#13) ;
  - `applyEntersReplacements` lit la définition copiée (choix en arrivant, dévorer, terrain choc, Saga, loyauté, remplacements propres) : un Clone de planeswalker arrive avec sa loyauté (N7) ;
  - `copyToken` copie ce que copie le modèle (N8) ;
  - une copie d'un sort de permanent fait les choix d'arrivée (« arrive comme une copie », « en arrivant, choisissez ») et devient un jeton qui arrive ainsi (N9) ;
  - **reporté à R2.5 :** les exceptions de copie (707.9b : « sauf que c'est un Zombie ») ne sont toujours pas copiables ;
  - tests : `engine/test/audit.test.ts` (N7, N8, N9, #13).
- **R2.3 [règles] :**
  - choix en arrivant sans lancer : « arrive comme une copie » après une réanimation ou un clignotement (#7), hôte d'une Aura (303.4f) ;
  - le choix est demandé par les opérations de déplacement, avant `moveObject` ;
  - hors résolution, choix automatique documenté.

  **R2.3 réalisé ✅ :**
  - `copyCandidates` et `auraHosts` (`replacement.ts`) : ce qu'un Clone peut copier, ce qu'une Aura peut enchanter ;
  - l'opération `moveTo` (réanimation, clignotement, « mettez sur le champ de bataille ») demande ces choix avant tout déplacement, au joueur qui contrôlera le permanent ; `moveWithSpec` les transmet ;
  - hors résolution, `applyEntersReplacements` choisit le premier candidat (choix automatique, documenté) ; `copyChosen` distingue « rien copié, par choix » d'un choix à faire ;
  - 303.4g : `moveObject` laisse dans sa zone une Aura qui n'a rien à enchanter (au lieu de la mettre en jeu puis au cimetière, avec des déclencheurs d'arrivée et de départ parasites) ;
  - Auras de joueur (malédictions) : inchangées ;
  - tests : `engine/test/audit.test.ts` (#7, 303.4f, 303.4g).

## R1 — remplacements (616) ✅ en partie

- **R1.1 [règles] : cadre, marqueurs, jetons.**
  - `EventReplacementAbilityDef`, sur le modèle de `GraveyardReplacementAbilityDef` :
    - `event` (blessures, marqueurs, gain de PV, perte de PV, jetons, pioche, meule) ;
    - filtres ;
    - `effectOnly` (« si un effet devait ») ;
    - `modify : { add, times, atLeast, prevent }` ;
    - `condition`.
  - Un collecteur (sur R4.0 et `s.replacements`).
  - Migration des doubleurs de marqueurs et de jetons, et de `plusOneCounterBonus` : Yoshimaru avec Doubling Season donne (1+1)×2.
- **R1.2 [règles] : blessures et prévention.**
  - La chaîne de `actions.ts:212-344` devient des données : redirection, préventions, protection, +N, doubleurs.
  - Boucliers « la prochaine fois que » (615.7 ; une carte de TDM).
  - En deux temps : migration à ordre constant, tests au vert, puis politique d'ordre. Test : Artist's Talent avec Twinflame Tyrant donne 8 blessures.
- **R1.3 [règles] : PV, pioche, meule.** Une seule accroche pour les 11 appels de `drawCard` : `drawBonus` disparaît (N12), et `drawDouble` se cumule.
- **Décision (ordre des remplacements hors résolution) :**
  - rien ne peut se suspendre au milieu de `dealDamage`, `changeCounters` ou `gainLife` ; le moteur choisit donc pour le joueur affecté (616.1) ;
  - d'abord 616.1a à d, puis l'ordre des horodatages si les remplacements commutent ;
  - sinon, toutes les permutations jusqu'à 5 remplacements, et le meilleur résultat pour le joueur affecté : blessures et perte de PV minimales, gains et jetons maximaux, marqueurs maximaux sauf les nuisibles, pioche maximale sauf au-delà de la bibliothèque ;
  - une seule fonction, `chooseReplacementOrder`, pour pouvoir brancher plus tard une vraie `ChoiceRequest` ;
  - documenté en `choix auto`.

**Réalisé, et écarts au prévu :**
- `modifiers.ts` : `AmountMod` (`add`, `times`, `atLeast`) et `chooseReplacementOrder(base, mods, prefer)`, qui essaie les ordres (jusqu'à 5 remplacements) et garde le meilleur pour le joueur affecté ; des remplacements du même genre commutent et ne sont pas permutés ;
- blessures (`dealDamage`) : bonus, minimum d'Ojer Axonil, doubleurs et `damageTakenDoubled` deviennent des modificateurs ; le joueur blessé obtient le moins de blessures (Artist's Talent et Twinflame Tyrant : 3 → 8) ;
- marqueurs (`changeCounters`) : doubleurs et +1 (Yoshimaru, Caradora) ; le contrôleur obtient le plus (Yoshimaru et Doubling Season : 1 → 4) ; chaque statique compte (deux Yoshimaru : +2) ;
- PV (`gainLife`) : bonus et doubleurs, le plus pour le joueur ;
- pioche (R1.3) : `drawCards(s, p, n)`, un seul événement de pioche ; toutes les pioches de la partie y passent (11 appels, sauf la main de départ et le mulligan), `drawBonus` disparaît (N12) ; deux Vnwxt se cumulent ;
- **pas fait, et pourquoi :** la capacité générique `EventReplacementAbilityDef` et la conversion des drapeaux (`lifeGainBonus`, `plusOneCounterBonus`, bonus de blessures…) : elles relèvent des familles E, H et I, faites en R4 ; les jetons (doubleurs qui commutent, rien à ordonner) et la meule restent tels quels ; boucliers « la prochaine fois que » (615.7) : aucune carte gérée n'en a besoin (pas de nouvelles cartes), reportés ;
- bench (coup sur coup, `git stash`) : 2 656 → 2 695 déc/s en aléatoire à 2 joueurs, inchangé ;
- tests : `engine/test/audit.test.ts` (R1, N12).

## R3 — copies de sorts ✅

- **R3.1 [règles] : nouvelles cibles.**
  - L'opération `copySpell` demande de nouvelles cibles pour chaque spécification : intention `changeTarget`, `suggested` = les cibles d'origine, `autoOk`, clés `r.vars` idempotentes.
  - Puis `validateTargets` et `announceTargets`, pour que la garde se déclenche (#4).
  - Les copies faites pendant `castSpell` passent par une `ChoicePurpose` `copyTargets`.
  - Les copies deviennent des objets (N11).
- **R3.2 [règles] :**
  - `changeTarget` gère plusieurs cibles ;
  - `CastChoices.divide` est validé au lancement (601.2d) et gardé dans `StackItem.division` ; la part d'une cible devenue illégale est perdue (#15) ;
  - l'interface reçoit une étape de répartition au lancement.

**Réalisé, et écarts au prévu :**
- un seul mécanisme pour R3.1 et R3.2 (`stackChoices.ts`) : `StackItem.pendingChoices`, des choix d'un élément déjà sur la pile que `announceNext` pose avant les déclencheurs et la priorité (but `stackChoice`). Il remplace à la fois la `ChoicePurpose` `copyTargets` prévue pour les copies faites au lancement et les questions posées par l'opération `copySpell` pendant la résolution : une copie faite pendant une résolution choisit ses cibles à la fin de celle-ci (pas de clés `r.vars` à rendre idempotentes) ;
- copies : `copyStackItem` pour les sorts et les capacités ; une copie de sort est un objet `cardCopy` sur la pile (N11) ; une question par mot « cible » (intention `changeTarget`, cibles d'origine suggérées, même nombre de cibles), puis l'événement « ciblé » (garde, vaillance ; pas l'héroïsme ni le crime : une copie n'est pas lancée) (#4) ;
- **pas d'`autoOk`** sur les nouvelles cibles, contrairement au plan : l'automatisme aurait répondu à la place du joueur hors « contrôle total », qui n'aurait jamais pu changer de cible. Comme sur Arena, la question est posée, cibles d'origine pré-remplies ;
- toutes les cartes gérées qui copient disent « vous pouvez choisir de nouvelles cibles » : le choix est proposé à toute copie, sans drapeau ;
- `changeTarget` (Bolt Bend) n'a pas été étendu à plusieurs cibles : aucune carte gérée n'en a besoin ;
- répartition : pas de champ `CastChoices.divide` ni d'étape d'interface au lancement ; la répartition est une question `divide` posée dès la mise sur la pile (sort, capacité activée ou déclenchée à au moins deux cibles), que l'interface savait déjà afficher, gardée dans `StackItem.division` et copiée avec l'élément ; blessures et marqueurs +1/+1 (même règle) (#15) ;
- l'IA essaie par simulation chaque nouvelle cible d'une copie à cible unique, comme les cibles d'un déclenchement ;
- tests : `engine/test/audit.test.ts` (#4, N11, #15) ; Chandra, Flameshaper (`fdn.test.ts`) répartit à l'activation.

## R2.4 et R2.5 — couches ✅

- **R2.4 [règles] : couche 2.**
  - `GameObject.baseController` et des effets de contrôle horodatés dans `s.effects` ;
  - `syncControl(s)` applique ces effets par ordre d'horodatage, sort du combat et appelle `setController` si le contrôleur change ;
  - il est appelé dans les actions basées sur l'état, après le nettoyage, à la fin des opérations de contrôle, et dans `removePlayerObjects` (800.4a) ;
  - `controlChanges` et `auraControl` sont supprimés (#12, N10) ;
  - `o.controller` reste la valeur stockée, donc les ~200 lectures ne changent pas ;
  - nouvel invariant du fuzz : `syncControl` est idempotent.

  **R2.4 réalisé ✅ :**
  - `control.ts` : `baseController` (fixé par `createObject` à l'arrivée), `addControlEffect` (effet de `s.effects` avec `controller`, horodaté, `duration` fin du tour ou permanent, `whileSource` et `whileControlledBy` pour Possession Engine), `syncControl` (effets et Auras de contrôle par horodatage, jusqu'à 4 passes, sortie du combat) ;
  - appelé à la fin de chaque opération de contrôle, dans les actions basées sur l'état (à la place de `applyAuraControl`), après le nettoyage et dans `removePlayerObjects` ;
  - 800.4a : les effets et Auras d'un joueur qui a quitté la partie sont ignorés, ce qu'il contrôle encore est exilé ; un permanent dont il était le contrôleur de base revient ensuite à son propriétaire ;
  - approximations notées dans `docs/approximations.md` : Eriette, the Beguiler reste une statique (et non un déclencheur) ; l'horodatage d'une Aura de contrôle est celui de son arrivée ;
  - invariant du fuzz ignoré une fois la partie finie (les objets et effets du perdant du coup final restent en place) ;
  - tests : `engine/test/audit.test.ts` (#12, N10, Confiscate, 800.4a).
- **R2.5 [règles] : 613.8 et couche 5.**
  - Le booléen `computing` devient une carte `provisional`.
  - Une seconde passe ne réévalue que les statiques dépendantes (conditions, `per`, caractéristiques définies qui lisent le champ de bataille), et compare une signature ; au plus 3 passes.
  - Couche 5 « en plus de ses autres couleurs ».
  - Cible de performance : bench ≥ 5 000 décisions/s, et au plus 5 % de perte (comparaison avant et après avec `git stash`, sur secteur).

  **R2.5 réalisé ✅ :**
  - `computing` reste, et une carte `provisional` (résultat de la passe précédente) est lue par `chars`, les vues des « pour chaque » et les F/E définies par une capacité ;
  - `collectStatics` sépare ce qui ne dépend pas des couches (réutilisé) des statiques dépendantes (réévaluées) ; signature comparée, trois applications des couches au plus ;
  - une condition n'est dépendante que si elle lit un permanent pendant son évaluation (compteur de lectures) : « pendant votre tour », les PV, les marqueurs ne déclenchent pas de seconde passe ;
  - premier essai à 19,5 % de perte (IA heuristique, 4 joueurs) : la vue construite pour chaque permanent compté coûtait O(n) (permanents équipés, valeur de mana). Cache des vues et permanents équipés précalculés par collecte : perte nulle ;
  - couche 5 : `addColors` ; 707.9b : exceptions de copie copiables (reporté de R2.2) ;
  - lève les approximations « conditions et comptes sur les types imprimés » et « The Jolly Balloon Man : la copie ne devient pas rouge » ; Possessed Goat devient noir en plus de ses couleurs ;
  - tests : `engine/test/audit.test.ts` (R2.5), `layers.test.ts` (613.8, qui était un test d'approximation).

## R4.1 à R4.6 — familles génériques (chaque lot fait baisser la référence) ✅

**R4.1 réalisé ✅ :** `BlockRule` (`model/cards.ts`) dans les caractéristiques (`blockRules`, couche 6, `addBlockRules`), perdue avec toutes les capacités ; constructeurs `block.*` et `blockAbility` (DSL) ; `canBlock`, `minBlockers`, `maxBlockers` et « pas seule » dans `turn.ts` ; badges de restriction (`ObjectView.blockRules`). Remplace `cantBeBlockedByHumans`, `…NonSpirits`, `…Glimmers`, `…PowerLE2`, `…PowerGE2`, `…Walls`, `…ExceptByHaste`, `canBlockOnlyFlyers`, `cantBeBlockedByMoreThanOne`, `minThreeBlockers`, `cantAttackOrBlockAlone`. Parties dorées identiques. Test : `audit.test.ts` (un bloqueur devenu Humain par un effet).

**R4.2 réalisé ✅ :** `ProtectionRule` (`from` : filtre sur la source, `hexproofOnly` pour la défense talismanique) dans les caractéristiques (`protections`, couche 6, `addProtections`) ; `protectedFrom` et `sourceView` (`targets.ts`) servent au ciblage, au blocage, aux blessures et aux attachements ; protection contre tout = filtre vide. `ObjectFilter` reçoit `colorCount` et `not`. Remplace `protectionFromEverything`, `hexproofFromInstants`, `…Black`, `…White`, `…Monocolored` ; badges en bouclier (`ObjectView.protections`). Changement de règles pour deux cartes (protection complète) : `RULES_VERSION` = 15. Test : `audit.test.ts` (R4.2).

**R4.3 réalisé ✅ :** `PowerRule` (`uses` : blessures de combat, équipage et selle, station ; `toughness` toujours ou si plus grande, `absolute`, `bonus`) dans les caractéristiques (`powerRules`, `addPowerRules`) ; `effectivePower` sert à `combatPower`, `crewPower` et à la station ; constantes `powerFor.*` et `powerRuleAbility`. Remplace `assignsToughness`, `absolutePowerDamage`, `crewWithToughness`, `crewPlus2` et le drapeau de joueur `stationByToughness` (Tapestry Warden accorde la règle à vos créatures). Parties dorées identiques.

**R4.4 réalisé ✅ :**
- famille C, `playFrom` (`PlayFromZone` : cimetière ou dessus de la bibliothèque, filtre, terrains ou sorts, PV, fourrager, finalité, mana de n'importe quel type, sous-types) : remplace `artifactsFromGraveyardLife`, `castArtifactsFromTop`, `castCreatureFromGraveyard`, `castCreaturesFromGraveyard`, `castCreaturesFromTop`, `creaturesFromGraveyardForage`, `instantsSorceriesFromGraveyardLife`, `playFromGraveyard`, `playLandsFromGraveyard`, `playTopCard`, `playTopFilter`. `playFromRules` choisit la permission la moins coûteuse ; l'usage unique de The Tomb of Aclazotz est consommé par identité de la règle ; toute permission du dessus de la bibliothèque montre la carte du dessus à son joueur (lève l'approximation de Traveling Chocobo et The Lunar Whale) ; Forgotten Cellar ne permet plus que des sorts (Oracle) ;
- famille A, `abilityCost` (`AbilityCostMod` : exhaust, Équiper, déverrouiller, comploter ; source ; « autres » ; {N} de moins ou le premier du tour gratuit) : remplace `activatedReduction`, `exhaustReduction`, `firstEquipFree`, `plotReduction`, `unlockReduction` ;
- **pas fait :** les gratuités de sorts (`firstSpellFree`, `freeFromExileOncePerTurn`) et la famille B (dons aux sorts) restent des drapeaux : les fusionner ne ferait que déplacer des booléens propres à une carte.

**R4.5 réalisé ✅ :**
- famille D, `castLimit` (`CastLimit` : qui, pendant votre tour ou le combat, adversaires qui vous ont attaqué, au plus N sorts, sauf depuis la main, capacités bloquées) : remplace `attackersCantCast`, `cantCastSpells`, `castOnlyFromHand`, `lockOpponentsOnYourTurn`, `noSpellsDuringCombat`, `oneSpellPerTurn`, `opponentsCantCastYourTurn` ; `castLimits` et `abilitiesLocked` (`stack.ts`) ; Yuriko reste traitée comme le second partagé (pour tous, pendant le combat) ;
- famille G, `triggerMod` (`TriggerMod` : une fois de plus ou jamais, arrivées et permanent qui arrive, sources, tous les joueurs) : remplace `doubleEnterTriggers`, `doubleEnterTriggersFor`, `doubleLegendaryTriggers`, `doubleTriggers`, `doubleTriggersFor`, `noCreatureEntersTriggers`, `noEntersTriggers` ; `triggerDoublers` (`triggers.ts`) ;
- **pas fait :** famille L (`flashFor` est déjà générique ; `jaceLoyaltyInstant` va avec R4.6), vie (`cantGainLife`, `noLifeGainForAll`). Parties dorées identiques.

**R4.6 réalisé ✅ :**
- `counterOnOrCreate` (N marqueurs sur un permanent correspondant du joueur, sinon un jeton créé d'abord, sous-types en plus) : remplace les opérations `empowerJace` et `amass` (le constructeur `fx.amass` et `empower` restent) ;
- famille N, `nextSpell` (filtre ; copie, incontrecarrable, marqueurs, célérité), posé par `playerEffect` avec `once` (usage unique, ce tour-ci) et consommé au lancement par `consumeNextSpells` : remplace `s.nextCreatureSpell`, `s.nextSpellCopies`, le drapeau `nextSpellUncounterable` et les opérations `nextCreatureSpell`, `copyNextSpell`, `nextSpellUncounterable` ;
- `instantJaceLoyalty` et `extraMountainMana` ne sont plus des opérations : `fx.thisTurn` sur le drapeau ;
- **pas fait, et pourquoi :** le reste de `TurnStats` n'est pas passé au journal du tour. Ces compteurs (PV gagnés, cartes piochées, sorts lancés…) sont des statistiques générales lues à chaque évaluation de condition ; les recompter dans le journal coûterait plus cher sans réduire la dette propre à une carte. Parties dorées identiques.

- **R4.1 :** « ne peut pas être bloquée par [filtre] », qui remplace 7 mots-clés, plus `canBlockOnly` et le nombre de bloqueurs (minimum et maximum).
- **R4.2 :** « défense talismanique contre » et « protection contre [filtre] ». `ObjectFilter` reçoit `colorCount` et un `not`. Lève les approximations Sword of Wealth and Power et Resilient Roadrunner.
- **R4.3 :** une seule statique « utilise l'endurance pour » (combat, équipage, station) : `assignsToughness`, `absolutePowerDamage`, `crewWithToughness`, `crewPlus2`, `stationByToughness`.
- **R4.4 :** modificateurs de coût (famille A) ; permissions de jouer depuis une zone (famille C).
- **R4.5 :** restrictions de joueur et moment de lancer (familles D et L) ; modifications de déclencheurs (famille G).
- **R4.6 :** opérations propres à une carte :
  - `empowerJace` et `amass` deviennent `counterOnOrCreate` ;
  - `instantJaceLoyalty` et `extraMountainMana` passent par `fx.thisTurn` ;
  - le reste de `TurnStats` va au journal du tour ;
  - `nextCreatureSpell` et `nextSpellCopies` deviennent un effet de joueur « prochain sort ».

## R5 à R8

- **R5 ✅ :**
  - blocages simultanés en multijoueur, cachés dans `projectView` jusqu'à ce que tous les défenseurs aient déclaré ;
  - mulligans tour de table par tour de table (103.5) [règles].

  **Réalisé :** `combat.pendingBlocks` : chaque défenseur déclare (validation et taxes à la déclaration), ses blocages sont gardés hors de `combat.blockers` (donc de la vue) et appliqués ensemble par `commitBlocks` quand la file est vide ; `declareMulligan` et `s.mulliganTaken` : les joueurs décident à tour de rôle, ceux qui prennent un mulligan le prennent ensemble à la fin du tour de table (`nextMulligan`). Tests : `audit.test.ts` (R5), `rules.test.ts` (103.5).
- **R6 [règles] ✅ :**
  - boucle obligatoire détectée par une empreinte canonique (projection de `outcomeHash`), qui déclare la partie nulle (104.4b) ;
  - les trois gardes y passent.

  **Réalisé :** `declareLoopDraw` (`turn.ts`, événement `gameOver` avec `reason: "loop"`) ; les gardes de `advance` (100 000 tours), des actions basées sur l'état (100 passes) et de l'hôte (10 000 décisions automatiques dans un tour, `drawByLoop`) déclarent la partie nulle au lieu de lever une erreur ; `watchLoop` (`game.ts`) compte les passes pile non vide sans autre décision, relève l'empreinte (`outcomeHash`, déplacé dans `fingerprint.ts`) au-delà de 20 et déclare la partie nulle à la troisième répétition ou au-delà de 2 000 passes (boucle qui ne répète pas l'état) ; 800.4a : les déclenchements en attente et retardés d'un joueur éliminé sont retirés (`removePlayerObjects`, `processTriggers`). Tests : `audit.test.ts` (R6).
- **R7 (continu) ✅ pour ce premier passage :**
  - attentes de l'Oracle étendues ;
  - un fichier de tests de règles par extension partielle ;
  - tests tirés des décisions officielles (rulings) pour le lien de vie, les copies, les remplacements et le nettoyage.

  **Réalisé :**
  - `engine/test/<ext>.test.ts` pour TDM (24 tests), WOE (17), SOS (25), ECL (14), TLA (18), SPM (15), MSH (19), TMT (16), HOB (16), MKM (15), BIG (16) : chaque test vérifie le texte Oracle d'une carte, pas seulement qu'elle se joue ;
  - `engine/test/rulings.test.ts` : lien de vie (deux sources, deux gains ; blessures prévenues, pas de gain), copies (pas de prouesse pour une copie ; la copie survit au contresort de l'original), remplacements (doubleurs cumulés ; prévention avant doublement ; exil à la place, pas de « meurt »), nettoyage (défausse qui déclenche : seconde étape de nettoyage), prouesse multiple, Tablet of Discovery ;
  - attentes de l'Oracle : « engagez la créature ciblée », « … meule N cartes », « vous perdez N PV », « ~ inflige N blessures à chaque créature » ;
  - **écarts trouvés et corrigés :** `ref.eventObject` et la condition « si la source… » ignoraient les dernières informations connues d'un objet parti (The Ooze créait 0 Mutagène, Esoteric Duplicator ne copiait rien, la copie de Vaultborn Tyrant revenait) ; `pumpAll` ignorait « autre » (Harvester of Misery se donnait −2/−2) ; Thorin, Mountain-king n'attachait rien (arguments d'`attach` inversés) ; les prouesses multiples étaient fondues en une (Thor Odinson) ; un terrain meulé par Tablet of Discovery ne se jouait pas (permission de jouer ignorée pour un terrain du cimetière) ; son {R}{R} restreint ne payait jamais (le solveur prend maintenant, pour une même source, la capacité qui produit le plus) ;
  - à poursuivre : attentes de l'Oracle pour d'autres formes de texte, décisions officielles d'autres interactions.
- **R8 :**
  - interface :
    - garder la priorité ;
    - passe douce et passe dure (réglage autorisé par `server/src/validate.ts`) ;
    - réglages retenus d'une session à l'autre ;
    - annulation d'un terrain engagé, alerte de mana flottant ;
    - aperçu des blessures de combat ;
    - accessibilité ;
    - recherche du deckbuilder ;
    - redessins limités (`Board.tsx:859`) ;
  - IA :
    - le P3 (déterminisation qui ne dépend que des cartes vues, réponses aux choix fréquents, mulligan selon les couleurs) ;
    - puis `npm run arena` (600 parties) avec les decks du méta.

  **R8 réalisé ✅ :**
  - priorité (`engine/src/autopilot.ts`) : `holdPriority` (case « Garder la priorité ») ; `passMode` : « Fin du tour » est une passe douce, qui rend la main dès qu'un adversaire met quelque chose sur la pile (le client annule alors la passe) ; Maj+Entrée ou Maj+clic, une passe dure ; réglages acceptés par `server/src/validate.ts` ;
  - réglages retenus (`localStorage`) : arrêts, contrôle total, garder la priorité, langue ;
  - mana : décision `undoMana` (`GameState.manaUndo`, `mana.ts`) : une source engagée seulement pour {T}, sans déclenchement, se dégage d'un clic tant que son mana est dans la réserve ; toute autre décision rend l'engagement définitif ; ce n'est pas une option de `legalActions` (l'IA aléatoire bouclerait) ; alerte avant de passer, pile vide, avec du mana flottant (`passPriority`) ;
  - aperçu des blessures de combat (`client/src/board/combatPreview.ts`, testé) : PV perdus par joueur, créatures qui mourraient, « létal », pendant la déclaration des attaquants et des bloqueurs ;
  - recherche du deckbuilder (`client/src/decks/search.ts`, testée) : `t:`, `o:`, `c:`, `mv`, `pow`, `tou`, `r:`, `s:`, guillemets, négation ;
  - accessibilité : lettre dans les pastilles de mana, cartes jouables atteignables au clavier (Tab, Entrée), mouvements réduits (`prefers-reduced-motion`, `MotionConfig`) ;
  - redessins : `useMainAction` ne s'abonne plus qu'aux données dont il a besoin (`useShallow`) ;
  - IA (P3) : déterminisation par les seules cartes vues ; « vous pouvez », petits nombres et choix d'une option parmi 6 essayés par simulation ; mulligan selon les couleurs ; pool `meta` pour le tournoi ;
  - **pas fait :** annulation d'un terrain dont la capacité a un autre coût ou un déclenchement (Arena ne le permet pas non plus) ; aperçu du combat sans remplacements ni déclencheurs ; accessibilité complète (tailles en px, ARIA des fenêtres de choix) ; ISMCTS en multijoueur.

## Reporté tant qu'aucune carte ne l'exige

État au 02/10/2026 (audit du 02/10, § 5.9) :

- bloquer plusieurs attaquants : toujours reporté (aucune carte du pool) ;
- obligations de blocage : **faites** (« doit être bloquée si possible », « bloque si possible », « bloque cet attaquant si possible », MKM ; maximisation de 509.1c et 509.1d : `PLAN-C.md`, lot C4) ; pas de Leurre dans le pool ;
- batailles, phasing, couche 3, raccourcis de boucles (732) : toujours reportés (aucune carte du pool) ;
- mot-clé second partagé (seul Samut en a besoin) : toujours un drapeau ; voir `PLAN-C.md`, lot C11 ;
- couches hors du champ de bataille : remplacées par les caractéristiques des sorts, `PLAN-C.md`, lot C11 ;
- `ChoiceRequest` pour l'ordre des remplacements : toujours choisi pour le joueur affecté, au mieux de ses intérêts ;
- vue du joueur qui contrôle le tour d'un autre (722) : **faite** (`view.ts`) ;
- boucliers « la prochaine fois que » (615.7) : **faits** (`fx.shield`, TDM).

## Vérification de chaque lot

- **Chaque lot :**
  - test de règles par écart ;
  - `npm run verify -- --full`.
- **Lots [règles] :**
  - test doré régénéré, avec mention de `RULES_VERSION` dans le message de commit ;
  - lancer seuls `client/test/tutorial.test.ts` et `npm run tutorial-smoke` pour R0.3, R0.4, R0.5, R2.1 et R2.4 ;
  - bench avant et après pour R1.2, R4.0, R2.4 et R2.5 ;
  - `npm run arena` après R1.3 et après R2.5.
- **Nouveaux invariants du fuzz :**
  - lot de simultanéité vide après chaque décision ;
  - `syncControl` idempotent ;
  - au plus 3 passes de couches ;
  - le mode « chaos » refuse les réponses mal formées aux nouveaux choix.

## Risques

- Une mise à jour d'un lot [règles] peut fermer les parties en ligne en cours (politique de F1).
- Changements de l'IA : attaques obligées (R0.2), fenêtres de priorité pendant le nettoyage (R0.3), ordre des déclencheurs (R0.5, R3.1).
- Tutoriel : la leçon des capacités compte sur le lien de vie ; le nettoyage.
- Performance : le chemin des blessures, les couches, les actions basées sur l'état.
- Tout nouvel événement passe par `filterEvents` (information cachée).

