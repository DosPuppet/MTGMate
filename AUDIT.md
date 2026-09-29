# Audit de MTGX (MTG Mate) — 29/09/2026

Audit fait en lecture seule (code, documentation, historique git) sur la branche `dev`, au commit `41eea2f`. Les tests et le fuzz n'ont pas été relancés pour l'audit : les chiffres de tests viennent du code et des docs.

## 1. Le projet en chiffres

| Élément | Mesure |
|---|---|
| Historique | 86 commits du 24 au 29/09/2026, environ 233 000 lignes ajoutées |
| Moteur (`packages/engine/src`) | 17 600 lignes, 36 fichiers ; les plus gros : `stack.ts` (1 900), `dsl.ts` (1 640), `ops/zones.ts` (1 490), `turn.ts` (1 230), `triggers.ts` (1 190) |
| Scripts de cartes (`packages/cards/src`) | 29 200 lignes, environ 2 750 cartes jouables sur les 5 161 légales en Standard (53 %) |
| DSL | 150 opérations d'effet, 168 sortes de montants et conditions, 55 déclencheurs, 87 drapeaux de « statique de joueur » |
| IA | 2 100 lignes : heuristique, combat par simulation, ISMCTS |
| Client / serveur | 8 400 / 930 lignes |
| Tests | environ 430 tests de règles, test de fumée de chaque carte, fuzz avec invariants et fuzz « chaos », 9 scripts Playwright, bench, tournoi d'IA |
| Approximations documentées | 126 entrées + 63 sous-entrées (`docs/approximations.md`) |
| Intégration continue | **aucune** (pas de `.github/`) |

## 2. Points forts

**Architecture**
- **Moteur pur et déterministe.** L'état est du JSON, les décisions sont des données et `submit(state, player, decision)` renvoie un nouvel état (`engine/src/game.ts`). Le même moteur tourne à quatre endroits : le Web Worker, le serveur qui fait autorité, les simulations de l'IA et le fuzz. C'est le meilleur choix possible pour ce type de projet (Forge et XMage, plus anciens, mélangent état et logique).
- **Séparation moteur strict / automatisme** (`autopilot.ts`), comme sur Arena. Le moteur n'a pas de raccourcis cachés, et la fluidité vient d'une couche à part.
- **`legalActions` exhaustif**, partagé par l'interface, l'IA, l'automatisme et le serveur. `legal.ts` réutilise les fonctions de `stack.ts` (`castTerms`, `canPay`…) au lieu de les recopier.
- **Couches 613 avec cache par version** (`bump`). Le fuzz détecte un cache périmé, ce qui est rare même dans des moteurs mûrs.
- **Contrat d'erreurs net :** `RulesError` pour une décision illégale, `Error` pour un bug du moteur, et le fuzz « chaos » qui envoie des décisions corrompues.
- **Information cachée traitée sérieusement :** `projectView`, `filterEvents`, `visibleFaces`, et un audit automatique (`ai/test/hidden-info.test.ts`).
- **Import Scryfall avec déduction des mots-clés** (`cards/src/scryfall.ts`) : les créatures vanilla et « french vanilla » sont jouables sans script.

**Qualité et outillage**
- TypeScript strict, Biome, Vitest, React 19, Zustand et Vite : une pile moderne et cohérente.
- **Culture de test inhabituelle pour un projet amateur :**
  - fuzz à 2, 3 et 4 joueurs, avec des invariants (conservation des cartes, références, nombres finis, sérialisabilité) ;
  - tournoi d'IA à graines appariées, avec intervalles de confiance ;
  - bench ;
  - tests d'interface sur mobile.
- `npm run verify` donne une ligne par étape, et les journaux sont dans `test-results/verify/`.
- **Documentation exemplaire et honnête.** `docs/moteur.md` sert de guide pour ajouter une mécanique, et `docs/approximations.md` classe les écarts en `règle`, `timing` et `choix auto`.

**Produit**
- Une interface façon Arena :
  - arrêts, paiement automatique, cibles automatiques quand il n'y en a qu'une ;
  - glisser-déposer, flèches, disposition du plateau testée ;
  - jouable sur tablette et sur téléphone.
- Entièrement en français, avec vouvoiement, et les noms français à l'import des decklists.
- Tutoriel en 9 leçons, IA à 3 niveaux, sons.
- Duel en ligne privé : corde, reconnexion, revanche, limitation de débit et validation des messages.

## 3. Points faibles

### 3.1 Architecture du moteur : les cas particuliers s'accumulent (risque n° 1)

La règle « préférer un mécanisme générique » est écrite dans `docs/moteur.md`, mais le code montre l'inverse à mesure que les extensions s'ajoutent.

- **Des champs d'état au nom d'une carte :**
  - dans `PlayerState` : `extraMountainMana` (Molten Tide), `jaceInstantTurn`, `noLegendRuleTurn` (Hall of Echoes), `copyNextExhaustTurn` (Pit Automaton), `damageDoubled` (Lightning)…
  - dans `TurnStats` : une trentaine de compteurs, dont `foodSacrificed`, `coinFlips` (Edgar) et `untappedInUntapStep` (Millennium Calendar) ;
  - dans `turn` : `graveyardCreatureOnce` (Tomb of Aclazotz), `attackBans` (Sandswirl)…
  
  Voir `engine/src/model/state.ts`.
- **87 drapeaux dans `PlayerStaticAbilityDef`** (`model/cards.ts`), presque un par carte : Rest in Peace, Torpor Orb, Grand Abolisher, Vnwxt, Yoshimaru… Chacun est lu à l'endroit précis du moteur où il s'applique.
- **Pas de cadre général des remplacements (614 et 616).** `replaceDestination` (`replacement.ts`) enchaîne des `if` carte par carte (Garruk, The Darkness Crystal…). Quand plusieurs remplacements s'appliquent, le premier l'emporte, sans le choix du joueur affecté (616.1).
- **Couches incomplètes :**
  - pas de couche 2 (le contrôle passe par des champs à part : `auraControl`, `controlChanges`) ;
  - pas de dépendances (613.8) ;
  - les conditions des statiques sont lues sur les caractéristiques imprimées ;
  - une statique accordée par une autre statique n'est pas gérée.
- **Environ 150 commentaires nomment une carte** dans `engine/src`.

**Conséquence :** chaque nouvelle extension grossit le DSL, et le coût marginal d'une carte augmente au lieu de baisser. Les cas croisés (deux remplacements, dépendance entre couches) produiront des bugs discrets que le fuzz ne voit pas, parce qu'ils ne violent aucun invariant.

### 3.2 Justesse des cartes non prouvée

- `implemented = !!script || onlyKeywords(...)` (`scryfall.ts:636`) : une carte est « gérée » dès qu'un script existe. **Rien ne vérifie que le script couvre tout le texte Oracle.**
- Le test de fumée vérifie que la carte se joue **sans planter**, pas qu'elle fait **ce qu'elle dit**.
- Les tests de règles nomment environ 20 % des cartes d'une extension (LCI : 53 cartes sur 279).
- La vitesse (une extension complète en quelques heures, 233 000 lignes en 5 jours) rend impossible une relecture humaine carte par carte. Il faut donc des vérifications automatiques de fond, pas seulement contre les plantages.

### 3.3 Approximations en grappes (même cause, plusieurs cartes)

| Grappe | Exemples | Cause commune |
|---|---|---|
| « Lancez-la sans payer son coût » repoussé **après** la résolution, jusqu'à la fin du tour | Découverte (mécanique phare de LCI), Etali, Uldaros, Roving Actuator, Kaervek, Quistis, Vaan, Daring Waverider, Cruelclaw, Malcolm, rebond | pas de « lancer pendant la résolution » (608.2g) |
| Capacités de mana passées par la pile | Ramos, Evendo, Molt Tender, Loot, Conduit Pylons, Capital City, Sunbird Effigy, Thornvault Forager, Baylen | le solveur ne gère pas une capacité de mana à coût complexe |
| Coûts ou choix faits automatiquement (21 mentions) | Équipage, Fabrication, Lathril, Quilled Greatwurm, Radiant Lotus, Winter, Gallia, prolifération | le choix n'est pas posé comme une `ChoiceRequest` |
| Coût payé à la résolution | Hallway Heckler, Solitary Cell, Thunderhead Gunner | la défausse en coût existe (`discardCostOptions`, `stack.ts:1420`) mais n'est pas utilisée partout |

### 3.4 Plateforme

- **Salons uniquement en mémoire :** une mise à jour (`deploy/update.sh`) coupe les parties en cours.
- **En ligne :**
  - duel à deux seulement ;
  - ni comptes, ni classement, ni recherche d'adversaire, ni spectateurs ;
  - ni **BO3 avec réserve** (la réserve est validée mais ne sert jamais).
- **Pas de replays**, pourtant presque gratuits avec un moteur déterministe (graine + décisions). Ils sont dans la liste « Finitions ».
- **Bundle de 6,3 Mo avec toutes les cartes** (premier chargement lent sur mobile), et pas de mise en cache hors ligne (PWA).
- Jetons sans image.
- Peu d'accessibilité (23 attributs `aria` ou `role`).
- Pas d'en-têtes de sécurité sur les fichiers statiques (nginx peut les ajouter).
- **Aucune intégration continue.** Tout repose sur un `verify` lancé à la main.

### 3.5 IA

- **Elle connaît la composition exacte du deck adverse.** `determinize` (`ai/src/ismcts.ts:48`) redistribue la **vraie** main et la **vraie** bibliothèque adverses. Elle ne voit pas la main, mais elle sait quelles cartes restent. C'est une petite triche, et elle surestime ses lectures.
- Évaluation générique (F/E, mots-clés), sans connaissance propre aux cartes. Beaucoup de choix reviennent à `req.suggested` (`ai/src/choices.ts`).
- ISMCTS limité à la racine, avec une politique de simulation naïve.
- Résultats mesurés : élevé contre moyen 60,8 %, élevé contre élevé sans ISMCTS 56,7 %. L'apport existe mais reste modeste.
- Pas de plan de jeu propre à un deck, pas de mulligan selon l'archétype, pas de politique multijoueur.

## 4. Limites par rapport au vrai Magic

1. **Couverture :** 53 % du Standard. Il manque TDM, WOE, MKM, SOS, ECL, TLA, SPM, MSH, TMT et HOB, donc la plupart des decks compétitifs actuels ne s'importent pas en entier.
2. **Règles de fond simplifiées :**
   - 616.1 (ordre des remplacements) ;
   - 613.8 (dépendances) et couche 2 ;
   - 601.2d (blessures réparties choisies à la résolution) ;
   - 303.4f (Aura mise en jeu sans être lancée : elle va au cimetière) ;
   - blocages déclarés joueur par joueur en multijoueur.
3. **Timing faussé** pour les sorts lancés gratuitement « pendant la résolution » : on peut garder la carte et la lancer plus tard dans le tour. Cela change des parties réelles (Découverte).
4. **Choix automatiques** là où le joueur doit choisir, parfois même en mode « contrôle total ».
5. **Pas de gestion des boucles :** ni partie nulle sur boucle obligatoire (104.4b), ni raccourcis pour les boucles facultatives. Une garde de 100 000 itérations lève une `Error`.
6. **Pas de BO3 ni de réserve,** pas de cartes « hors de la partie ». Hors périmètre : Commander, Limité, formats éternels.
7. **Légalité figée à l'import :** une rotation ou un bannissement demande un réimport à la main.

## 5. Comparaison

| | **MTGX** | **Forge** | **XMage** | **MTG Arena** | Cockatrice / Untap |
|---|---|---|---|---|---|
| Cartes | environ 2 750 (Standard partiel) | quasiment toutes (> 25 000) | quasiment toutes | le catalogue Arena | toutes (aucune règle) |
| Justesse des règles | bonne sur le cœur, environ 190 approximations documentées | très mûre (15 ans) | mûre | référence | aucune (manuel) |
| IA | 3 niveaux, simulation + ISMCTS | heuristique avec indices par carte, correcte | faible | bots faibles | aucune |
| Installation | **navigateur, tablette, téléphone** | Java (bureau) + Android | Java client-serveur | client lourd, mobile | navigateur ou bureau |
| Ergonomie | **façon Arena, moderne** | datée | datée | référence | manuelle |
| En ligne | duel privé | limité | serveurs publics, tous formats | classé, draft | oui |
| Formats | Standard (duel, FFA contre l'IA) | tous, Limité, quête | tous, draft | Standard, Historique, Limité… | tous |
| Français | **natif** | interface partielle | non | officiel | non |
| Coût | gratuit, ouvert | gratuit, ouvert | gratuit, ouvert | free-to-play + boutique | gratuit |

**Où MTGX se démarque :**
- rien à installer, sur tablette et téléphone ;
- l'ergonomie d'Arena, en français ;
- un code moderne et testable (moteur déterministe, fuzz).

**Où il perd :**
- le nombre de cartes ;
- la maturité des règles face à Forge et XMage ;
- l'écosystème compétitif face à Arena.

## 6. Est-ce que ça vaut le coup ?

- **Oui**, pour :
  - jouer en français contre une IA correcte, dans le navigateur ou sur tablette, avec FDN et les 8 extensions couvertes ;
  - apprendre le jeu (tutoriel) ;
  - un duel privé entre amis.
- **Pas encore**, pour :
  - préparer des decks Standard compétitifs : cartes manquantes, pas de BO3 ni de réserve ;
  - les interactions de règles pointues : Forge et XMage sont plus sûrs ;
  - le Commander ou le Limité.
- **Comme base de code**, c'est un socle au-dessus de la moyenne des projets amateurs. La qualité ne tiendra que si l'on traite **maintenant** l'accumulation de cas particuliers (§ 3.1) et la vérification de la justesse des cartes (§ 3.2), **avant** d'ajouter d'autres extensions.

## 7. Feuille de route (par priorité)

### Suivi

- **P0 fait le 29/09/2026** (branche `dev`) : étapes 1 à 5 ci-dessous, une par commit ; détail dans `docs/extensions/socle.md`, lots 0.11 à 0.14. Environ 25 approximations levées, et trois erreurs de règles corrigées en route (Kaervek, Chandra, Darksteel Colossus avec un marqueur de finalité, The Darkness Crystal avec Rest in Peace).
- Restent : P1 à P4.

### P0 — Socle du moteur, pour toutes les extensions (avant la prochaine)

« Socle » désigne ici le moteur lui-même, **pas l'extension Foundations (FDN)**. Ces étapes changent des mécanismes généraux du moteur. Elles corrigent ensuite des cartes de **toutes** les extensions déjà intégrées :

| Étape | Cartes concernées, par extension |
|---|---|
| 2. Lancer pendant la résolution | LCI (Découverte, Malcolm, rebond d'Ojer Pakpatiq), FRA (Uldaros), EOE (Roving Actuator), OTJ (Kaervek), FIN (Quistis, Vaan), BLB (Daring Waverider, Cruelclaw), FDN (Etali) |
| 3. Remplacements | FRA (Garruk), FIN (Darkness Crystal), BIG (Rest in Peace), DSK (Leyline of the Void), DFT (Vnwxt), doubleurs de toutes les extensions |
| 4. Choix automatiques → vrais choix | FDN (Lathril, Quilled Greatwurm), FRA (Gallia, Mabel), DFT (Radiant Lotus, Winter, Équipage), EOE (Dyadrine), LCI (Fabrication), BLB (Fourrager) |
| 5. Capacités de mana à coût | FDN (Ramos), EOE (Evendo), DFT (Molt Tender, Loot), OTJ (Conduit Pylons), FIN (Capital City), LCI (Sunbird Effigy), BLB (Thornvault Forager, Baylen) |

La vérification de chaque étape se fait donc sur tout le pool (`verify --full`), et pas sur une seule extension.

1. **Intégration continue GitHub Actions.**
   - Fichier : `.github/workflows/ci.yml`.
   - À chaque push sur `dev` : `tsc`, Biome, `vitest` et un fuzz court.
   - Chaque nuit : `verify --full`, sans les tests d'interface.
   - On réutilise `tools/verify.ts` (ajouter une option `--ci` sans l'étape d'interface si besoin).
2. **« Lancer pendant la résolution » générique (608.2g).**
   - Nouvelle intention de choix, `castNow`, dans `choices.ts` / `model/decisions.ts`. La résolution se suspend comme pour les autres choix (`Resolution.awaiting`), le joueur lance le sort (cibles, modes, X) ou refuse, puis la résolution reprend.
   - Nouvel effet `fx.castDuringResolution(ref, { free, filter })` dans `ops/spells.ts` et `dsl.ts`, qui réutilise `castSpell` et `castTerms` (`stack.ts`).
   - On migre ensuite Découverte, Etali, Uldaros, Kaervek, rebond… et on retire leurs entrées de `docs/approximations.md`.
3. **Cadre général des remplacements (614 et 616).**
   - Dans `replacement.ts` : un type `ReplacementDef { event: zoneChange | damage | draw | lifeGain | counters | tokens | mill; filter; modify }`.
   - Les remplacements sont collectés depuis les statiques (`controlledAbilitiesWithSource`) et depuis `s.replacements`.
   - Boucle d'application : chaque remplacement ne s'applique qu'une fois par événement (616.1f). S'il en reste plusieurs, le joueur affecté choisit par une `ChoiceRequest`, avec en `suggested` l'ordre actuel et `autoOk` (l'automatisme garde le comportement d'aujourd'hui).
   - On migre ensuite les drapeaux `PlayerStaticAbilityDef` concernés : Rest in Peace, Leyline of the Void, Garruk, Darkness Crystal, Vnwxt, gain de vie +N, doubleurs de `actions.ts`…
4. **Choix automatiques transformés en `ChoiceRequest` avec `suggested` + `autoOk`.** L'infrastructure existe (`choices.ts`, `autoOk` dans `model/decisions.ts:58`) :
   - équipage, fabrication, sacrifices et marqueurs retirés en coût, prolifération ;
   - l'automatisme répond comme aujourd'hui, le mode « contrôle total » laisse choisir.
5. **Vraies capacités de mana à coût complexe** (mana, sacrifice, exil du cimetière, PV, exhaust) dans `mana.ts` : le solveur `solvePayment` les traite comme des sources avec un coût, sans passer par la pile.

### P1 — Justesse des cartes

6. **Vérificateur Oracle ↔ script** (`npm run coverage -- --audit`).
   - Rendre chaque script DSL en texte (nouveau `cards/src/render.ts`).
   - Comparer au texte Oracle, capacité par capacité :
     - nombre et nature des capacités (déclenchée « When/Whenever/At », activée « coût : effet », statique) ;
     - nombres (N blessures, piocher N, +N/+N, jetons).
   - Les écarts sont listés pour relecture. Le rendu sert aussi d'infobulle pour les jetons et les effets.
7. **Attentes dans le test de fumée.** Pour les modèles simples (blessures, pioche, PV, jetons, +N/+N), des attentes sont déduites de l'Oracle, par exemple « PV adverses −3 ». Le harnais `ai/test/smoke/harness.ts` vérifie l'effet, pas seulement l'absence de plantage.
8. **Désendetter l'état.**
   - Remplacer les compteurs de `TurnStats` et les champs de tour propres à une carte par un **journal d'événements du tour** (`s.turnLog`, des `RulesEvent` compacts), avec un montant générique `amount.eventsThisTurn(filter)`.
   - Migration progressive, avec un bench avant et après (`git stash`).

### P2 — Plateforme

9. **Parties persistées en graine + journal des décisions** (`server/src/rooms.ts`, fichier en ajout seul ou SQLite).
   - Les parties survivent au redémarrage : `update.sh` ne coupe plus rien.
   - Cela donne aussi les replays et l'export d'une partie pour signaler un bug, y compris contre l'IA depuis le worker.
10. **BO3 avec réserve**, en ligne et contre l'IA.
11. **Bundle découpé :**
    - données de cartes chargées par extension (import dynamique ou JSON), le worker recevant déjà ses définitions ;
    - mise en cache hors ligne (PWA) des données et des images.
12. **Images des jetons** : impressions de jetons Scryfall, via `imageUrl`.

### P3 — IA

13. **Déterminisation honnête :** tirer les cartes cachées d'une distribution qui ne dépend que des cartes vues et des couleurs (pool Standard géré), et non du vrai deck. On mesure l'effet au tournoi (`npm run arena`, 600 parties ou plus).
14. **Réglage des poids d'évaluation par auto-jeu,** avec le tournoi comme mesure. Réflexion pendant le temps de l'humain. Indices propres aux cartes dans `policy.ts` (retenir un contresort, cibler la bonne menace).

### P4 — Couverture (décision à prendre par vous)

15. **Couvrir d'abord les cartes des decks Standard les plus joués** (TDM, WOE, MKM…), plutôt qu'une extension entière à 100 %. Cela contredit la convention actuelle, « 100 % par extension ».
