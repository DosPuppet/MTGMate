# Audit de MTGX (MTG Mate) — 30/09/2026

**Méthode :**
- audit en lecture seule, au commit `23698dc` (`master`) : code, documentation, historique git ;
- les écarts de règles marqués **(exéc.)** ont été confirmés en jouant la position dans le moteur (script jetable, hors du dépôt) ; les autres ont été lus dans le code ;
- les tests, le fuzz et le bench n'ont pas été relancés : les nombres de tests sont comptés dans le code ;
- les chemins sont relatifs à `packages/`.

L'audit précédent (29/09/2026) est archivé dans `docs/audits/2026-09-29.md`. Cet audit insiste sur les **règles du moteur** ; l'interface, l'IA et la plateforme sont traitées plus brièvement.

## 1. Le projet en chiffres

| Élément | 29/09 | 30/09 |
|---|---|---|
| Historique | 86 commits | 114 commits, du 24 au 30/09/2026 |
| Moteur (`engine/src`) | 17 600 lignes | 19 400 lignes, 38 fichiers ; les plus gros : `stack.ts` (2 290), `dsl.ts` (1 820), `ops/zones.ts` (1 570), `triggers.ts` (1 240), `turn.ts` (1 240) |
| Scripts de cartes (`cards/src`) | 29 200 lignes | 32 100 lignes |
| Cartes jouables | environ 2 750 sur 5 161 (53 %) | **2 911 sur 5 161 (56 %)**, dont les 20 archétypes du méta relevés (88,1 % du méta) |
| IA / client / serveur | 2 100 / 8 400 / 930 lignes | 2 100 / 9 500 (plus 3 100 de CSS) / 1 270 lignes |
| Tests | environ 430 | environ 650 appels `it`/`test` (moteur 522, client 42, cartes 34, serveur 28, IA 27), test de fumée de chaque carte, 138 cartes vérifiées contre l'Oracle, 10 scripts Playwright |
| Intégration continue | aucune | GitHub Actions : `verify --ci` à chaque push, `verify --full` chaque nuit |
| DSL | 150 opérations, 55 déclencheurs | 171 opérations d'effet, 57 sortes de déclencheurs |
| `PlayerStaticAbilityDef` | 85 drapeaux (recompté avec la même méthode) | **96 drapeaux** |
| `TurnStats` | 34 compteurs | 17 compteurs |
| `Keyword` | 48 | 51, dont environ 16 propres à une carte |
| Approximations documentées | 126 entrées + 63 sous-entrées | 115 entrées + 82 sous-entrées, plus les 17 écarts relevés ici (§ 3.1) |

### Ce qui a changé depuis le 29/09

L'ancienne feuille de route a été suivie presque entièrement en deux jours :

- **P0 (socle du moteur) :**
  - intégration continue ;
  - lancer pendant la résolution (608.2g) ;
  - remplacements « au lieu du cimetière » avec l'ordre de 616.1 ;
  - équipage, Fabrication et prolifération au choix du joueur ;
  - capacités de mana à coût sans la pile (605.3b).
- **P1 (justesse des cartes) :**
  - audit Oracle ↔ script (`coverage --audit`) ;
  - attentes déduites de l'Oracle (138 cartes) ;
  - journal des événements du tour (`turnlog.ts`) ;
  - effets sur les joueurs (`s.playerEffects`).
- **P2 (plateforme) :**
  - enregistrement des parties (graine et décisions), parties en ligne reprises après un redémarrage, export et replays ;
  - images des jetons ;
  - bundle découpé et compressé, service worker ;
  - BO3 avec réserve.
- **P4, phase 1 :** les lots M1 à M6 rendent jouables les 20 archétypes du méta, réserve comprise ; les cinq premiers sont proposés en decks préconstruits.
- **Reste :** P3 (IA), repris en R8 ci-dessous, et P4 phase 2 (Tarkir: Dragonstorm à 100 %).

## 2. Points forts

### Architecture

- **Moteur pur et déterministe** (`submit(state, player, decision)`), qui tourne à quatre endroits : Web Worker, serveur qui fait autorité, simulations de l'IA et fuzz. Les replays et la reprise des parties en ligne en découlent presque gratuitement.
- **`legalActions` exhaustif,** partagé par l'interface, l'IA, l'automatisme et le serveur ; l'automatisme (`autopilot.ts`) est séparé du moteur strict, comme sur Arena.
- **Contrat d'erreurs** (`RulesError` contre `Error`), éprouvé par le fuzz « chaos ».
- **Information cachée** filtrée (`projectView`, `filterEvents`, `visibleFaces`) et auditée automatiquement.

### Justesse du cœur des règles

Vérifié dans le code :
- couches 4 à 7 avec horodatages (613.7), nouvel horodatage d'un attachement (613.7e), ensemble des objets touchés figé à la première couche (613.6), cache par version contrôlé par le fuzz ;
- blessures de combat selon les règles de 2025 (plus d'ordre d'affectation des blessures ; létal avec contact mortel ; piétinement) ;
- initiative et double initiative (first strike, double strike), avec l'étape de blessures supplémentaire décidée au bon moment ;
- dernières informations connues et nouvel objet à chaque changement de zone (400.7) ;
- règle des légendes au choix, annulation des marqueurs +1/+1 et −1/−1, Sagas, « Start your engines! » ;
- priorité gardée après un lancer (117.3c), déclencheurs en APNAP ordonnés par chaque joueur (603.3b), sort qui fizzle seulement si toutes ses cibles sont illégales (608.2b) ;
- lancer pendant la résolution (608.2g), capacités de mana sans la pile (605.3b), remplacements « au lieu du cimetière » avec auto-remplacement d'abord (616.1a).

### Outillage

- Fuzz à 2, 3 et 4 joueurs avec invariants (conservation des cartes, références, cache des couches, JSON pur), et mode « chaos ».
- Tournoi d'IA à graines appariées, bench, replays déterministes.
- Audit Oracle ↔ script et attentes déduites de l'Oracle.
- `npm run verify` (une ligne par étape) et intégration continue.
- Documentation honnête et tenue à jour : `docs/moteur.md`, `docs/approximations.md`, une page par extension.

### Produit

- Rien à installer : navigateur, tablette et téléphone, hors ligne contre l'IA.
- Français natif, avec vouvoiement et noms français à l'import des decklists.
- Présentation proche d'Arena : animations, flèches, encart « Résolution », piles de jetons, badges de mots-clés.
- Tutoriel en 9 leçons, IA à trois niveaux, BO3 avec réserve.
- Replays avec choix du point de vue, ce qu'Arena n'offre pas.

## 3. Moteur : écarts avec les règles officielles

Le cœur est juste. Les écarts qui restent sont de trois sortes :
1. des bugs de fond simples, non documentés (§ 3.1) ;
2. des interactions croisées sans cadre général : remplacements multiples, couches, copies (§ 3.2) ;
3. une dette de conception qui recommence à grossir (§ 3.3).

### 3.1 Écarts nouveaux, absents de `docs/approximations.md`

Rangés par impact décroissant.

| # | Écart | Règle | Preuve | Impact |
|---|---|---|---|---|
| 1 | **Nettoyage :** ni actions basées sur l'état, ni déclencheurs, ni priorité. Une créature 0/0 quand un bonus « jusqu'à la fin du tour » expire meurt à l'entretien du joueur suivant (exéc.) | 514.3a | `engine/src/turn.ts:306-335` (`finishCleanup` passe à `stepEnd`) | **moyen** : −1/−1 et flétrir (Lorwyn Eclipsed), défausse en fin de tour ; « meurt » se déclenche pendant le mauvais tour |
| 2 | **Lien de vie :** un gain de PV par affectation de blessures. Un piétineur 5/5 bloqué donne deux marqueurs à Ajani's Pridemate au lieu d'un (exéc.) | 119.9, 702.15b, décision d'Ajani's Pridemate | `engine/src/actions.ts:385`, appelé par affectation (`engine/src/turn.ts:928`) | **moyen** : archétype Lifegain du méta |
| 3 | **Obligation d'attaquer et taxe d'attaque :** sans mana, face à Archangel of Tithes, Juggernaut ne peut ni attaquer (taxe impayée) ni rester en arrière (obligation) ; **aucune déclaration n'est acceptée et la partie se bloque** (exéc.) | 508.1d (une obligation n'impose pas de payer un coût) | `engine/src/turn.ts:602-620` | rare, mais **bloquant** |
| 4 | **Copies de sorts :** la copie garde les cibles de l'original, sans possibilité d'en choisir de nouvelles ; la cible ne « devient pas la cible » de la copie, donc sa garde ne se déclenche pas (exéc. pour la garde) | 707.10c, 702.21a | `engine/src/stack.ts:1295-1309` (`copySpellItem` n'appelle pas `announceTargets`) | **moyen** : environ 21 cartes des extensions restantes copient un sort avec de nouvelles cibles |
| 5 | **Taxes et sorts gratuits :** un sort lancé sans payer son coût ignore les augmentations de coût (`opts.free ? 0 : spellReduction(…)`). Lightning Strike gratuit face à Thalia, the Survivor coûte 0 au lieu de {1} (exéc.) | 601.2f, 118.9d | `engine/src/stack.ts:448` | faible à moyen : Découverte, sorts complotés, Omniscience |
| 6 | **Arrivées simultanées :** de deux permanents qui arrivent ensemble, le premier ne voit pas arriver le second | 603.6a | `engine/src/triggers.ts:793` (sources recalculées à chaque événement) | moyen : jetons créés en nombre, landfall |
| 7 | « Arrive comme une copie » ne marche que pour un sort lancé : un Clone réanimé ou qui clignote arrive en tant que lui-même | 614.1c | `engine/src/stack.ts:1976-1987` | moyen pour les extensions à venir |
| 8 | **704.5b :** l'indicateur « a pioché dans une bibliothèque vide » n'est jamais remis à zéro. Quand Herald of Eternal Dawn quitte le jeu, le joueur perd pour une pioche faite des étapes plus tôt (exéc.) | 704.5b | `engine/src/actions.ts:48`, `engine/src/turn.ts:951` | faible |
| 9 | **Second partagé :** il interdit aussi les actions spéciales ; on ne peut plus retourner une carte face visible (exéc.) | 702.61b | `engine/src/stack.ts:1698` (avant la branche d'action spéciale), `engine/src/legal.ts:431` | faible |
| 10 | « Vous gagnez / perdez la partie » par un effet ignore « ne peut pas perdre » et « ne peut pas gagner » | 104.3, 104.2 | `engine/src/ops/players.ts:286-293` | faible (Herald of Eternal Dawn) |
| 11 | La protection contre tout prévient les blessures même quand elles « ne peuvent pas être prévenues » | 615 (« ne peuvent pas être prévenues »), 702.16e | `engine/src/actions.ts:262` (testé avant `unpreventable`) | faible |
| 12 | Un changement de contrôle « jusqu'à la fin du tour » rend le permanent à un contrôleur mémorisé, qui peut être périmé si un autre effet de contrôle a pris fin entre-temps | 613.1b, 613.7 | `engine/src/turn.ts:322-329` | faible |
| 13 | La valeur de mana des filtres est lue sur la carte imprimée, même pour une copie ; les exceptions d'une copie (« sauf que c'est un Zombie ») ne sont pas copiables | 707.2, 707.9b | `engine/src/layers.ts:317`, `engine/src/ops/permanents.ts:535` | faible à moyen |
| 14 | `moveWithSpec` ajoute marqueurs et types après l'événement d'arrivée ; les jetons « engagés et attaquants » sont engagés après leur arrivée | 614.1c, 614.12 | `engine/src/effects.ts:610-673`, `engine/src/ops/permanents.ts:133-145` | faible : « chaque fois qu'un Zombie arrive » manqué |
| 15 | Blessures « réparties » : le partage se fait à la résolution entre les seules cibles encore légales ; la part d'une cible devenue illégale devrait être perdue | 601.2d, 608.2b | `engine/src/ops/damage.ts:59-92` | faible |
| 16 | Une créature qui cesse d'être une créature (Véhicule, terrain animé) reste au combat | 506.4 | `engine/src/turn.ts:510-513` | faible |
| 17 | Les créatures mises en jeu attaquantes reçoivent leur défenseur d'office | 508.4 | `engine/src/ops/permanents.ts:139-143` | multijoueur seulement |

### 3.2 Écarts structurels, toujours présents

**Couches (`engine/src/layers.ts`) :**
- **Pas de couche 2.** Le contrôle passe par trois mécanismes sans horodatage : `controlChanges` (jusqu'à la fin du tour), `auraControl` (Auras et « tant que vous contrôlez… »), et `giveControl` / `exchangeControl`, qui changent `o.controller` sans trace.
- **Pas de couche 3** (texte), sans impact en Standard aujourd'hui. **Couche 5** : pas de « en plus de ses autres couleurs ».
- **613.8, dépendances :** une seule approximation à un niveau (une source qui perd ses capacités n'applique plus ses statiques).
- **Caractéristiques imprimées :** les conditions des statiques, les capacités définissant une caractéristique (7a) et les bonus « pour chaque » comptent sur les types imprimés ; un Véhicule animé ou un terrain devenu créature n'est pas une créature pour eux.
- **Couches sur le champ de bataille seulement :** ailleurs, `chars()` rend la carte imprimée. Les effets sur la main, la pile et le cimetière passent par des drapeaux (`flashFor`, `convokeCreatureSpells`, `grantWarp`…).
- Les marqueurs de capacité s'appliquent après tous les autres effets de couche 6, quel que soit leur horodatage (documenté).

**Remplacements et prévention (614 et 616) :** seule la destination « cimetière » a un cadre générique (`replaceGraveyard`), et même là le choix du joueur affecté est fait par le moteur.
- **Blessures** (`engine/src/actions.ts:286-344`) : ordre fixe (redirection, prévention, +N, ×2). Exemple : 3 blessures à un adversaire avec Artist's Talent et Twinflame Tyrant donnent 10 ; l'adversaire, qui choisit l'ordre, n'en subirait que 8.
- **Marqueurs** (`engine/src/state.ts:307-309`) : ×2 puis +1 (Yoshimaru) ; le contrôleur choisirait +1 puis ×2.
- **PV, jetons :** ordre du code, jamais demandé.
- **Pioche :** aucun point d'accroche de remplacement ; Vnwxt est un booléen (`drawDouble`), deux exemplaires ne se cumulent pas.
- **Prévention :** pas de boucliers « prévenez les N prochaines blessures » (615.7), pas de marqueurs de bouclier (122.1c).

**Combat (`engine/src/turn.ts`) :**
- blocages déclarés joueur par joueur en ordre APNAP (multijoueur seulement) ;
- une créature ne bloque qu'un attaquant ;
- obligations de blocage limitées à « doit être bloquée si possible » : pas de Leurre, pas de « doit bloquer », pas de maximisation des obligations avec la menace (509.1c) ;
- pas de batailles (aucune dans le pool aujourd'hui).

**Boucles et fin de partie :**
- pas de partie nulle sur une boucle obligatoire (104.4b), ni de raccourcis pour les boucles facultatives (732) ;
- trois gardes en tiennent lieu : `advance` lève une `Error` après 100 000 étapes (`engine/src/turn.ts:54-56`), l'hôte après 10 000 décisions automatiques par tour (`engine/src/host.ts:70`), et la boucle des actions basées sur l'état s'arrête en silence après 100 passes. Une vraie boucle obligatoire fait planter la partie au lieu de la déclarer nulle.

**Divers :**
- mulligans décidés joueur par joueur jusqu'au bout, et non tour de table par tour de table (103.5) ;
- Aura mise en jeu sans être lancée : elle va au cimetière, faute du choix de l'objet enchanté (303.4f) ;
- protection : seulement « contre tout » et « contre chaque adversaire » ; « protection contre [couleur, type] » manque (Sword of Wealth and Power est approchée) ; « défense talismanique contre X » existe en quatre variantes codées en dur ;
- second partagé et tempête ne sont pas des mots-clés (drapeau de Samut, emblème de Ral) ;
- contrôler le tour d'un autre joueur (722) : les décisions passent bien au contrôleur, mais sa vue ne montre pas la main du joueur contrôlé (non vérifié plus loin).

**Absent, mais sans carte concernée dans les données Standard aujourd'hui :** mana phyrexian, phasing, régénération, cascade (1 carte), jour et nuit, monarque, « prendre l'initiative », donjon, l'Anneau, énergie, batailles. À faire seulement quand une extension en aura besoin.

### 3.3 Dette de conception

**La tendance s'est inversée pendant les lots du méta.**
- Le P1 avait divisé `TurnStats` par deux (34 → 17) et vidé `PlayerState` de ses champs propres à une carte.
- Mais `PlayerStaticAbilityDef` est passé de 85 à 96 drapeaux en deux jours, et `Keyword` compte environ 16 mots-clés qui sont la règle d'une seule carte : `cantBeBlockedByHumans`, `…NonSpirits`, `…Glimmers`, `…PowerLE2`, `…PowerGE2`, `minThreeBlockers`, `assignsToughness`, `hexproofFromMonocolored`…
- Des traitements portent le nom d'une carte : `hellkite`, `empowerJace`, `instantJaceLoyalty`, `tripleTriad`, `graveyardCreatureOnce`, `extraMountainMana`.
- Environ 790 lignes de `engine/src`, presque toutes des commentaires, nomment environ 450 cartes différentes. Méthode : noms Scryfall avec limites de mot ; l'« environ 150 » de l'ancien audit venait d'une méthode plus étroite, la hausse n'est donc pas mesurée.
- `stack.ts` dépasse 2 290 lignes ; `CardDef` a 88 champs, `GameObject` 57, `StackItem` 37.

**Remède :** des familles génériques paramétrées par un filtre d'objet, à la place des drapeaux :
- « ne peut pas être bloquée par [filtre] » (remplace six mots-clés) ;
- « protection contre [filtre] » (lève l'approximation de Sword of Wealth and Power et de Resilient Roadrunner) ;
- « défense talismanique contre [filtre] » ;
- statiques de joueur à paramètres (« les sorts de [filtre] coûtent N de plus ou de moins », « les [filtre] ne peuvent pas… ») plutôt qu'un drapeau par carte.

### 3.4 Justesse des cartes

- Une carte est « gérée » dès qu'un script existe (`cards/src/scryfall.ts:674`).
- L'audit Oracle ↔ script est structurel : nombre de capacités, nombres présents dans le script ; 8 écarts acceptés dans `cards/data/audit-baseline.json`. Il ne vérifie ni le sens des effets ni les statiques.
- Les attentes déduites de l'Oracle couvrent 138 cartes, environ 5 % du pool.
- Le test de fumée vérifie qu'une carte se joue sans planter, pas qu'elle fait ce qu'elle dit.
- Les 11 extensions partielles (TDM, WOE, SOS, ECL, TLA, SPM, MSH, TMT, HOB, MKM, BIG) n'ont pas de fichier de tests de règles à elles : seulement `engine/test/meta.test.ts` (64 tests).
- Les écarts du § 3.1 n'étaient attrapés par rien : le fuzz ne voit que ce qui viole un invariant, et aucun test ne compare le moteur aux décisions officielles (rulings).

## 4. Interface, face à MTG Arena

La présentation est proche d'Arena (animations, flèches, résolution montrée, piles de jetons, tactile). Les manques qui comptent le plus pour le joueur :

1. **Priorité :**
   - impossible de garder la priorité sur son propre sort, sauf en « contrôle total » (`engine/src/autopilot.ts:58-61`) ;
   - « Passer le tour » est une passe dure qui laisse aussi passer les sorts adverses (`autopilot.ts:51`) ; Arena distingue passe douce et passe dure ;
   - rien pour passer jusqu'à son tour pendant le tour adverse, ni pour répondre toujours de la même façon à un déclencheur.
2. **Informations absentes :**
   - le poison n'est jamais affiché : il manque dans `PlayerView` (`engine/src/view.ts:110-123`), alors qu'un son est joué ;
   - l'événement `reveal` est ignoré : une carte révélée n'est ni montrée ni journalisée ;
   - le journal ne note ni les pertes de PV hors blessures, ni le poison, ni les destructions ; ses noms de cartes ne sont pas survolables.
3. **Choix faits d'office hors « contrôle total »** (`autoOk`) : l'ordre de ses propres déclencheurs simultanés et la répartition des blessures de piétinement ou entre plusieurs bloqueurs.
4. **Mana :**
   - un terrain engagé à la main ne se dégage pas (Arena permet d'annuler tant que le mana n'est pas dépensé) ;
   - aucune alerte en passant avec du mana flottant ;
   - pas de choix des terrains pendant le paiement ; hybride choisi d'office.
5. **Combat :**
   - pas d'aperçu des blessures ni d'alerte de létal ;
   - la menace n'est vérifiée qu'à la validation (message d'erreur) ;
   - la fenêtre de répartition ne vérifie pas le létal du piétinement ;
   - « Attaquer avec tous » envoie tout sur le premier défenseur en multijoueur.
6. **Fenêtres de choix :**
   - regard et surveillance en deux étapes génériques (choisir, puis ordonner avec des flèches) au lieu d'un glisser dessus / dessous ;
   - questions « oui / non » sans la carte source ;
   - modes présentés en texte seul.
7. **Aperçu des cartes :** dans la barre latérale et non près de la carte ; absent à la souris sous 1100 px, où la barre devient un tiroir.
8. **Accessibilité :**
   - symboles de mana en pastilles sans glyphe (noir et incolore presque identiques) ;
   - surbrillances distinguées par la seule couleur ;
   - tailles en px ;
   - pas de jeu au clavier (cartes en `div` sans `tabIndex`) ;
   - 28 attributs ARIA ou `role` en tout ;
   - pas de `prefers-reduced-motion`.
9. **Deckbuilder :** pas de syntaxe de recherche (`t:`, `o:`, `mv>=`), ni de terrains automatiques, ni de main d'essai, ni de vue en colonnes par valeur de mana ; entre deux manches, la réserve s'édite en liste texte.
10. **Réglages et finitions :**
    - arrêts, contrôle total et langue ne sont pas retenus d'une session à l'autre (`client/src/store.ts:735`) ;
    - « Abandonner » sans confirmation ;
    - noms anglais dans des invites françaises (`engine/src/turn.ts:870`, `engine/src/triggers.ts:997`) ;
    - libellé brut pour la plupart des types de marqueurs ;
    - tout l'écran se redessine au survol d'une carte : `useMainAction` s'abonne à tout le store (`client/src/board/Board.tsx:859`).

## 5. IA

Le P3 de l'ancien audit n'est pas fait :
- la déterminisation de l'ISMCTS part de la vraie liste restante de l'adversaire : seule la répartition entre main et bibliothèque est tirée au sort (`ai/src/ismcts.ts:59`) ;
- environ 24 des 30 intentions de choix reviennent à la réponse suggérée par le moteur (`ai/src/choices.ts`) ; les « vous pouvez » sont toujours acceptés ;
- l'évaluation est générique (F/E, mots-clés, cartes en main), sans connaissance propre aux cartes ;
- le mulligan ne regarde que le nombre de terrains, ni les couleurs ni la courbe ;
- en multijoueur, pas d'ISMCTS, et toutes les attaques visent l'adversaire le plus bas en PV ;
- les mesures du tournoi (`docs/ia.md`) datent du 28/09, avant les lots du méta.

## 6. Plateforme et sécurité

**Deux bugs du serveur :**
- **Plantage probable sur une URL mal encodée :** `decodeURIComponent` sans `try` dans `serveStatic` (`server/src/index.ts:73`). `GET /%` lève une `URIError` dans le gestionnaire de requêtes, et aucun `uncaughtException` ne la rattrape. pm2 redémarre le serveur et les salons sont repris, mais un seul octet suffit à couper toutes les parties. L'exception a été reproduite avec `node` ; le serveur n'a pas été lancé.
- **Plafond de connexions par IP contournable :** `clientIp` prend la première adresse de `X-Forwarded-For` (`server/src/index.ts:52-54`), or nginx y ajoute l'adresse réelle en dernier (`$proxy_add_x_forwarded_for`, `deploy/nginx-mtgmate.conf:29`) : c'est le client qui choisit la première.

**Autres défauts :**
- pas de vérification d'`Origin` sur le WebSocket (`server/src/index.ts:209`) ;
- pas d'en-têtes de sécurité (CSP, `X-Content-Type-Options`, `X-Frame-Options`) ;
- `/scry/` transmet la chaîne de requête telle quelle (`server/src/index.ts:158`) : chaque variante est une nouvelle requête à Scryfall et une nouvelle entrée dans le cache nginx ;
- les 200 places de salon peuvent être occupées par des salons abandonnés (5 minutes chacun) ;
- les jetons de reconnexion sont en clair dans `data/rooms`.

**Manques, face à un service public :** recherche d'adversaire, comptes, spectateurs, discussion ou emotes, en ligne à plus de 2 joueurs, historique des parties. Les légalités sont un instantané de l'import : une rotation ou un bannissement demande un réimport à la main.

## 7. Comparaison

| | **MTGX** | **Forge** | **XMage** | **MTG Arena** | **MTGO** | Cockatrice / Untap |
|---|---|---|---|---|---|---|
| Cartes | 2 911 (56 % du Standard, 88 % du méta) | quasiment toutes | quasiment toutes | le catalogue Arena | toutes | toutes (sans règles) |
| Justesse des règles | cœur juste ; environ 200 approximations documentées et 17 écarts relevés ici | très mûre | mûre | référence sur son catalogue | référence, règles complètes | aucune (manuel) |
| IA | 3 niveaux, simulation et ISMCTS | heuristique, indices par carte | faible | bots faibles | aucune | aucune |
| Installation | **navigateur, tablette, téléphone** | Java (bureau), Android | Java, client-serveur | client lourd, mobile | Windows | navigateur ou bureau |
| Ergonomie | **façon Arena, moderne** | datée | datée | référence | datée | manuelle |
| En ligne | duel privé, BO3, reprise après redémarrage | limité | serveurs publics, tous formats | classé, draft | tournois, marché | oui |
| Formats | Standard (duel en ligne ; jusqu'à 4 joueurs contre l'IA) | tous, Limité, modes solo | tous, draft | Standard, Historique, Limité… | tous | tous |
| Français | **natif** | interface partielle | non | officiel | officiel | non |
| Coût | gratuit, ouvert | gratuit, ouvert | gratuit, ouvert | free-to-play | cartes payantes | gratuit |

**Où MTGX se démarque :**
- rien à installer, sur tablette et téléphone, et même hors ligne ;
- l'ergonomie d'Arena, en français ;
- un moteur déterministe et testable (fuzz, replays, reprise des parties).

**Où il perd :**
- le nombre de cartes (environ un dixième de ce que couvrent Forge et XMage) ;
- la maturité des règles sur les interactions croisées (remplacements, couches, copies) face à MTGO, Arena, Forge et XMage ;
- l'écosystème en ligne (classement, recherche d'adversaire) face à Arena et MTGO.

## 8. Est-ce que ça vaut le coup ?

- **Oui**, pour :
  - jouer le méta Standard actuel en français, contre l'IA ou entre amis, en BO3 avec réserve ;
  - apprendre le jeu (tutoriel) ;
  - jouer sur tablette ou téléphone sans rien installer.
- **Pas encore**, pour :
  - servir de référence des règles : les interactions croisées restent approchées, et quelques bugs de fond (§ 3.1) touchent des parties réelles (nettoyage, lien de vie, copies) ;
  - un service public : sécurité du serveur à durcir, ni comptes ni recherche d'adversaire ;
  - le Commander ou le Limité (hors périmètre).
- **Comme base de code**, le socle reste bien au-dessus de la moyenne des projets amateurs. Deux conditions pour que cela dure :
  1. corriger les écarts du § 3.1 et écrire les cadres génériques du § 3.2 (remplacements, couche 2, copies) **avant** d'élargir la couverture aux extensions restantes, qui en ont besoin (copies avec nouvelles cibles, Clones, jetons en nombre) ;
  2. arrêter la croissance des drapeaux propres à une carte (§ 3.3).

## 9. Feuille de route (par priorité)

### Suivi

- Rien de fait pour l'instant. Ajouter ici une ligne par étape terminée, comme dans l'audit précédent.

### R0 — Corrections simples (un lot, un test de règles par correction)

- Moteur :
  - les écarts 1 à 3, 5, 8 à 12 et 14 à 16 du § 3.1 ;
  - chacun reçoit un test dans `engine/test/` qui rejoue la position (le script jetable de cet audit en donne la mise en scène), et son entrée disparaît de ce tableau.
- Serveur :
  - `decodeURIComponent` protégé (réponse 400) ;
  - adresse du client prise en fin de `X-Forwarded-For`, ou `X-Real-IP` fixé par nginx ;
  - vérification d'`Origin` ;
  - `/scry/` sans chaîne de requête ;
  - en-têtes de sécurité dans nginx.

### R1 — Cadre général des remplacements (614 et 616)

- Dans `engine/src/replacement.ts` : des remplacements décrits comme des données (événement : blessures, marqueurs, PV, jetons, pioche, arrivée ; filtre ; modification), collectés depuis les statiques et `s.replacements`.
- Boucle de 616.1 : chaque remplacement s'applique au plus une fois par événement ; s'il en reste plusieurs, le joueur ou le contrôleur affecté choisit par une `ChoiceRequest`, avec `suggested` (l'ordre actuel) et `autoOk`, comme pour le cimetière.
- Boucliers de prévention (615.7) et pioche remplaçable.
- Migration des drapeaux concernés (`drawDouble`, doubleurs de blessures, de marqueurs, de jetons) ; les écarts de Twinflame Tyrant et de Yoshimaru disparaissent.

### R2 — Couches

- Couche 2 unifiée : un effet de contrôle horodaté, qui remplace `controlChanges`, `auraControl` et `giveControl` (corrige aussi l'écart 12).
- Couche 5 « en plus de ses autres couleurs ».
- 613.8 : conditions des statiques, capacités définissant une caractéristique et bonus « pour chaque » lus sur les caractéristiques calculées (point fixe ou ordre de dépendance), avec des tests synthétiques dans `layers.test.ts`.
- Valeurs copiables complètes : exceptions de copie (707.9b), valeur de mana d'une copie (écart 13) ; « arrive comme une copie » sans lancer (écart 7).
- Couches hors du champ de bataille, pour remplacer les drapeaux de main et de pile (`flashFor`, `convokeCreatureSpells`, `grantWarp`).

### R3 — Copies de sorts et cibles

- Nouvelles cibles au choix pour une copie (707.10c), avec `suggested` = cibles de l'original et `autoOk`.
- Événement « devient la cible » pour les copies (garde, héroïsme adverse).
- Changer les cibles d'un sort à plusieurs cibles.
- Prérequis des extensions restantes (environ 21 cartes).

### R4 — Familles de mots-clés à filtre (§ 3.3)

- « Protection contre [filtre] », « ne peut pas être bloquée par [filtre] », « défense talismanique contre [filtre] ».
- Nouvelle règle dans `docs/moteur.md` : pas de nouveau drapeau de `PlayerStaticAbilityDef` ni de mot-clé propre à une carte sans avoir écarté une forme générique ; le nombre de drapeaux est suivi à chaque lot.

### R5 — Combat

- Blocages simultanés en multijoueur ; une créature qui bloque plusieurs attaquants.
- Obligations de blocage (Leurre, « doit bloquer ») avec maximisation (509.1c).
- Arrivées simultanées (603.6a, écart 6) : les déclencheurs d'arrivée regardent l'ensemble des objets arrivés ensemble.

### R6 — Boucles

- Détecter une boucle obligatoire (même état, aucune décision) et déclarer la partie nulle (104.4b), au lieu des `Error` des gardes.
- Raccourcis des boucles facultatives (732) plus tard, si des cartes le demandent.

### R7 — Justesse des cartes

- Étendre les attentes déduites de l'Oracle (phrases reconnues de `oracle-expectations.test.ts`).
- Un fichier de tests de règles par extension partielle.
- Tests tirés des décisions officielles (rulings Scryfall) pour les interactions fréquentes du méta : lien de vie, copies, remplacements, nettoyage.

### R8 — Interface et IA

- Interface, dans l'ordre du § 4 :
  1. poison et cartes révélées ;
  2. garder la priorité, passe douce et passe dure ;
  3. réglages retenus, confirmation d'abandon ;
  4. annulation d'un terrain engagé, alerte de mana flottant ;
  5. aperçu des blessures de combat ;
  6. noms français dans les invites du moteur ;
  7. accessibilité (glyphes de mana, formes en plus des couleurs, `rem`).
- IA : le P3 de l'ancien audit (déterminisation qui ne dépend que des cartes vues, réponses propres aux choix fréquents, mulligan selon les couleurs), puis nouvelles mesures au tournoi avec les decks du méta.
