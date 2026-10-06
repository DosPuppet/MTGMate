# PLAN-E — Commander, de 2 à 4 joueurs (06/10/2026)

## Contexte

Tout le Standard est jouable (5 164 cartes). Le Commander était hors périmètre ; ce plan l'ajoute :
- les règles du format (903) ;
- le jeu complet de 2 à 4 joueurs, contre l'IA et en ligne, avec des sièges IA tenus par le serveur ;
- deux premiers decks préconstruits.

Les decks suivants viendront **un par un, chacun apportant ses cartes** : le plan installe donc aussi la chaîne « ajouter un deck » (import par nom, couverture par deck, lots, précon, équilibrage).

Plan écrit le 06/10/2026 à la demande de l'utilisateur (la lettre E est libre ; K est pris par l'audit des cartes). Les lots se font sur `dev`, un commit par lot ou sous-lot.

### Décisions de l'utilisateur (06/10/2026)

- **Decks :** Edgar Markov (Mardu, vampires agressifs) et Y'shtola, Night's Blessed (Esper, drain et contrôle). Ce sont les n° 2 et n° 1 d'EDHREC. On prend leurs listes moyennes « optimized » (bracket 4, plus de 4 000 decks chacune), figées au 06/10/2026 (annexe).
- **En ligne :** salons de 2 à 4 sièges, humains ou IA tenus par le serveur.
- **À deux joueurs :** règles officielles (40 PV, 21 blessures de commandant, bannissements officiels), pas de Duel Commander. Le mulligan gratuit (103.5c) ne vaut qu'à 3 joueurs ou plus.

### Ce que l'exploration a établi

**Déjà en place :**
- N joueurs dans le moteur : ordre du tour, élimination 800.4, combat multijoueur, `attackTax`, `startingLife`.
- Partie contre 1 à 3 IA dans l'interface, avec la mise en page multijoueur.
- Une zone `command`, utilisée seulement pour les emblèmes.

**Manquant :**
- tout le 903 : désignation du commandant, lancer depuis la zone de commandement, taxe, retour en zone de commandement, blessures de commandant, identité de couleur ;
- le mulligan gratuit ;
- un format `commander` (aujourd'hui seuls `standard` et `unlimited`, et le format n'atteint jamais le moteur) ;
- l'en ligne au-delà de deux sièges (`Seat = "p1" | "p2"`, aucune IA côté serveur).

**Données des cartes :**
- Ni l'identité de couleur, ni la légalité Commander, ni le statut Game Changer ne sont stockés.
- L'import ne se fait que par extension.
- Le chunk `cartes` n'a qu'environ 290 Ko de marge.

**Piège :** tout objet de la zone `command` est traité comme un emblème actif dans `statics.ts`, `triggers.ts`, `layers.ts`, `view.ts` et `ai/evaluate.ts`.

**Les deux decks :**
- 117 cartes à ajouter au catalogue :
  - environ 25 cartes de chaque liste sont déjà jouables, dans le Standard ou les rééditions ;
  - les autres sont des classiques du Commander, plus les deux commandants (Edgar vient de C17, Y'shtola de FIC).
- Game Changers (Scryfall `is:gamechanger`) : 5 pour Edgar, 13 pour Y'shtola. L'équilibre sera mesuré à l'arène.

## Principes de conception

### 1. Données des cartes

**Pseudo-ensemble `EDH` « Commander » :**
- C'est la dernière entrée de `SET_INFO` (`packages/cards/src/setRegistry.ts`), avec `mainMax: 0` et une marque `byName`. On l'exclut de `STANDARD_SETS`.
- Le code `CMD` est pris par Scryfall (Commander 2011, présent dans `printings.json`) ; `EDH` est libre.
- Nouveaux fichiers : `data/edh.json` et `src/edh/` (scripts), branchés dans `sets.ts`.
- Une carte déjà au catalogue garde sa définition : la première extension gagne.
- Les cartes de `EXCLUDED_REPRINTS` (Command Tower…) peuvent être définies par EDH.

**Import par nom :** `npm run import-cards -- edh` (mode ajouté à `tools/import-scryfall.ts`).
- Il lit `docs/commander/decks/*.txt` et ne garde que les noms absents du catalogue.
- Il interroge Scryfall par lots `!"A" or !"B"`, comme `tools/import-french.ts`, en anglais puis en français.
- Il signale les dispositions non gérées au lieu de les ignorer.
- L'impression d'origine va dans `printings[0]`. Relancer ensuite `npm run import-printings`.

**Identité de couleur calculée, pas stockée :**
- `colorIdentity(def)` dans un nouveau fichier `packages/engine/src/identity.ts`. Elle réunit les couleurs, les symboles du coût et du texte (rappels exclus ; hybride et phyrexian compris) et les types de terrain de base, sur toutes les faces.
- Aucun champ n'est ajouté aux quelque 5 800 entrées existantes, et FDN et FRA, retouchés à la main, ne sont pas réimportés.
- Vérifications :
  - les entrées EDH gardent l'identité donnée par Scryfall dans `RawCard`, et un test compare ;
  - `import-printings --check-identity` compare tout le catalogue à Scryfall ;
  - les cas particuliers vont dans une liste de dérogations.

**Bannissements et Game Changers :**
- `packages/cards/data/commander.json`, de la forme `{ banned, notLegal, gameChangers, checked }`.
- Il est tenu à jour par `tools/check-legality.ts --commander` (Scryfall `banned:commander`, `is:gamechanger`), dans la vérification hebdomadaire de la CI.

**Bundle :** `data/edh.json` forme son propre chunk `commander` (`client/vite.config.ts`), budget 400 Ko dans `tools/bundle-size.ts`. Le chargement à la demande attendra que les données Commander dépassent environ 1 Mo.

**Couverture par deck :** `npm run coverage -- --deck <id|fichier>` (`tools/card-coverage.ts`).
- Il classe les cartes du deck en jouable, au catalogue mais non jouable, ou absente.
- Il signale les erreurs d'identité, de singleton et de bannissement.
- `--text` affiche le texte des cartes manquantes.

### 2. Format et validation (`packages/cards/src/decklist.ts`)

**Format :** `Format` (`engine/src/model/cards.ts`) gagne `"commander"`, avec un libellé et un texte d'aide dans `FormatChoice.tsx`.

**Listes et decks :**
- `parseDeckList` lit la section « Commander » (aujourd'hui ignorée ; le test `decklist.test.ts:72` change) et les marques `*CMDR*`.
- `serializeDeckList` écrit la section « Commander » en premier.
- `DeckList` (`cards/src/decks.ts`) gagne `commander?` et `format?`.

**`validateDeck(…, "commander")` :**
- un commandant (deux seulement par paire reconnue ; les paires attendront un deck qui en a) ;
- une créature légendaire, ou « peut être votre commandant » ;
- exactement 100 cartes, commandant compris ;
- singleton, sauf les terrains de base et les cartes « n'importe quel nombre » ou « jusqu'à N » ;
- identité de chaque carte comprise dans celle du commandant ;
- `commander.json` respecté ;
- pas de réserve ni de BO3.

Elle renvoie aussi, à titre indicatif seulement, `gameChangers` et une tranche (0 → « 1–2 », jusqu'à 3 → « 3 », au-delà → « 4+ »).

**Deck de partie :** `buildGameDeck` donne `{ deck: [commandant, …99], commanders: [indices], printings }`.

**Précons :**
- `packages/cards/decks/cmd-edgar-markov.json` et `cmd-yshtola.json`, enregistrés dans `decks.ts` ;
- catégorie « Commander » à l'accueil (`Lobby.tsx`) ;
- `tools/commander-decks.ts` (sur le modèle de `meta-decks.ts`) et le test `cards/test/commander-decks.test.ts`.

### 3. Moteur (903)

**Options et enregistrement :**
- `GameOptions` reçoit `variant?: "commander"` et `PlayerSetup.commanders?: number[]`.
- `GameRecord` reçoit les mêmes données sous `variant` (`format` y est déjà pris par `"mtgx-game"`).
- `isGameRecord`, `initial()` et `createRecordedGame` sont mis à jour.

**Désignation du commandant (903.3) :**
- Nouveau champ `GameState.commander?`, absent hors Commander : `cards: Record<uid, { owner, defId, casts, damage: Record<PlayerId, number>, offered? }>`.
- La clé `uid` (identité physique, stable d'une zone à l'autre) suit la carte. Un jeton ou une copie n'est pas un commandant.
- Plafond GameState 39 → 40, justifié.

**Mise en place :**
- `createGame` met les commandants dans la zone `command` et donne 40 PV par défaut (903.7).
- Sans `variant`, le chemin ne change pas : mêmes objets, même mélange.

**Zone de commandement : cartes et emblèmes :**
- Une aide `commandZoneAbilities(s, p)` (`statics.ts`) donne toutes les capacités des emblèmes (`isToken`), mais seulement les capacités `fromCommand` des cartes (113.6, éminence).
- Elle remplace chaque lecture actuelle de la zone : `statics.ts:51`, `triggers.ts:152` et `1162`, `layers.ts:553` et `800`, `view.ts:421`, `ai/src/evaluate.ts:192`. `detectTriggers` ignore les cartes de cette zone qui ne sont pas `fromCommand`.

**Lancer depuis la zone de commandement (903.8) :**
- `baseCastTerms` (`stack.ts`) gagne une branche `source: "command"` avec `extraCost: 2 × casts`. Le coût s'ajoute même à un lancer gratuit.
- `castSpell` compte le lancer.
- `legalActions` (`legal.ts:309`) parcourt la zone de commandement.
- La vue l'ajoute à `playableElsewhere` ; la pastille de coût (`castCost`) montre la taxe.

**903.9a, retour depuis le cimetière ou l'exil :**
- Action basée sur l'état dans `stateBasedActionsOnce` (`turn.ts`), sur le modèle de la règle de légende.
- Elle pose une question oui/non (`ChoicePurpose` `commanderZone`) une fois par nouvel objet (`offered`).
- Les déclencheurs « meurt » voient la carte arriver au cimetière.

**903.9b, main ou bibliothèque :**
- Remplacement dans `moveObject`, par `replaceCommanderDestination` (`replacement.ts`, sans nouveau cycle d'imports).
- Le choix est automatique : bibliothèque → zone de commandement ; main → la carte reste en main. C'est une approximation documentée, car `moveObject` ne peut pas poser de question.

**Blessures de commandant (903.10a, 704.6c) :**
- Cumulées dans `dealDamage` (blessures de combat d'une source commandant, infect compris).
- `checkGameOver` élimine un joueur à 21 blessures d'un même commandant, avec la raison `"commander"` ; `cantLose` s'applique.
- Avec deux commandants, la taxe et les blessures se comptent par commandant.

**Élimination :** les commandants disparaissent avec les objets du joueur ; leurs entrées restent pour l'historique.

**Contrôles :**
- `checkInvariants` vérifie qu'un joueur en jeu a exactement un objet par commandant.
- `outcomeHash` (`fingerprint.ts`) ajoute l'état Commander seulement quand il existe.

**Mécaniques qui citent le commandant (lot E6) :**
- mana de l'identité du commandant : `ManaAbilityDef.produceIdentity`, qui ne produit rien sans commandant (903.4f) ;
- « si vous contrôlez un commandant » : `ObjectFilter.commander` ;
- éminence : `fromCommand` sur les capacités déclenchées et statiques. Entrée de dette « famille éminence » tant qu'Edgar est seul ;
- « deux adversaires ou plus » : forme existante (`amount.refCount(ref.eachOpponent())`) ;
- « couleur qu'un terrain d'un adversaire pourrait produire » : `produceLikeLands` lit `filter.controller`.

**Mulligan gratuit (103.5c, lot E3) :** la première fois, aucune carte n'est mise au-dessous, dans **toute** partie à 3 joueurs ou plus. C'est une correction du Standard multijoueur aussi ; elle touche les parties dorées à plusieurs qui ont un mulligan.

### 4. IA (`packages/ai`)

**Évaluation (`evaluate.ts`) :**
- un commandant dans la zone de commandement vaut une menace jouable, moins la taxe ; ce n'est plus un emblème ;
- les PV effectifs tiennent compte des blessures de commandant reçues ;
- `attackTarget` vise un joueur qu'on peut achever à 21.

**Information cachée :**
- `determinize` ne touche pas les commandants (ils sont publics).
- Une aide `forAgent(s, seat, rand)` déterminise un état pour un siège ; elle sert aux sièges IA du serveur.

**ISMCTS :** il reste réservé au duel, donc couvre le Commander à deux. Si l'arène montre qu'il joue moins bien avec des decks singleton, on le désactive en Commander.

**Parties longues :**
- `playGame` reçoit `variant` et `commanders` ;
- le plafond de décisions du fuzz passe à 15 000 × joueurs ;
- `tools/random-deck.ts` gagne `randomCommanderDeck`, qui tire un commandant légendaire et 99 cartes de son identité ;
- le bench ajoute une position Commander à 4 joueurs.

**Arène :** `npm run arena` avec `--format commander --pool commander --by-deck`, 600 parties ou plus, à 2 puis 4 joueurs. Visée : 45 à 55 %. Un écart se corrige d'abord dans l'IA, pas dans les listes.

### 5. Client

**Accueil :**
- format « Commander » : 1 à 3 IA, seulement des decks à commandant, l'illustration du commandant sur la tuile, BO3 masqué ;
- le message `start` du worker transporte `variant` et les commandants.

**Plateau :**
- une puce « Zone de commandement » dans la `PlayerBar` : vignette, pastille de taxe, zone actuelle du commandant ;
- les blessures de commandant par source, en rouge à partir de 15 ;
- des flèches vers les joueurs attaqués (`Arrows.tsx`).

**Élimination du joueur :** un bandeau « Vous avez été éliminé : regarder la fin ou quitter », et un écran de fin multijoueur.

**Hypothèses à deux joueurs à retirer :** `NetBanner` (`opponents[0]`) et `matchSummary`.

**Éditeur de deck (`DeckBuilder.tsx`) :**
- le format vient du deck (fini le Standard codé en dur) ;
- un emplacement « commandant » ;
- un compteur n/100 ;
- le singleton ;
- un filtre « dans l'identité du commandant » ;
- une étiquette « bannie en Commander » ;
- une pastille « Game Changers : n · tranche estimée ».

**Textes, sons, téléphone :** français, au vouvoiement ; un son pour le retour en zone de commandement ; des puces compactes sur téléphone.

### 6. En ligne (`packages/server`)

**Deux à quatre sièges :**
- `Seat` va de `p1` à `p4` ; `MatchInfo.seats` vaut 2, 3 ou 4.
- La création porte le nombre de joueurs, le commandant et les IA ; `PROTOCOL_VERSION` passe à 3.
- La partie part quand tous les sièges humains sont pris ; le premier joueur est tiré parmi N.
- BO3 et revanche seulement en duel.
- Un abandon ou une expiration de la reconnexion vaut une concession : le joueur est éliminé et la partie continue.
- L'état de connexion est donné par siège.
- La sauvegarde dans `data/rooms` porte les commandants et les IA.

**Sièges IA :**
- `GameHost` (`engine/src/host.ts`) accepte des agents asynchrones ; le worker local ne change pas.
- Les IA tournent dans un pool de `worker_threads` (`server/src/aiPool.ts`, `aiWorker.ts`) :
  - taille réglable par `MTGX_AI_WORKERS`, 2 par défaut ;
  - 160 Mo de tas par worker ;
  - délai de 10 s, avec un worker relancé et une décision de repli ;
  - files par salon servies à tour de rôle ;
  - définitions des cartes mises en cache par salon.
- L'IA ne voit qu'un état déterminisé (`forAgent`).
- Une priorité sans autre option que passer se règle sans le pool.
- Plafonds :
  - au plus 3 IA par salon ;
  - `MTGX_MAX_AI_ROOMS` (20 par défaut) et 1 salon IA par adresse ;
  - niveau élevé seulement en duel ;
  - création refusée au-delà d'un RSS maximal (`heapUsed` ne voit pas les workers).
- Les décisions de l'IA sont enregistrées comme les autres : une reprise les rejoue sans relancer l'IA.
- Le salon ferme quand plus aucun humain n'est là ; un éliminé peut regarder la fin.
- Mises à jour annexes :
  - `build-server.ts` produit aussi `dist/ai-worker.mjs` ;
  - `/healthz` affiche la file et la latence de l'IA ;
  - `tools/load-test.ts` gagne `--players 4 --ai 3 --format commander`, avec le délai de la boucle d'événements ;
  - `docs/deploiement.md` et `max_memory_restart` de pm2 sont revus.

## Lots

| Lot | Contenu | Règles |
|---|---|---|
| **E0** | Plan dans `docs/plans/PLAN-E.md` ; périmètre dans CLAUDE.md et le README ; listes dans `docs/commander/decks/` ; pseudo-ensemble EDH et import par nom (les 117 cartes, non jouables tant qu'elles n'ont pas de script) ; section « Commander » des decklists ; `commander.json` et `check-legality --commander` ; `coverage --deck` ; chunk `commander` | ✅ |
| **E1** | `identity.ts` ; format `commander` ; `validateDeck` ; `DeckList.commander` ; JSON des deux précons (non jouables tant que leurs cartes manquent) ; tests | ✅ |
| **E2** | Cœur du 903 : `variant`, `s.commander`, séparation cartes / emblèmes dans la zone, lancer et taxe, 903.9a et 903.9b, blessures de commandant, 40 PV, vue, invariants, empreinte, decks Commander aléatoires pour le fuzz ; `engine/test/commander.test.ts` | ✅ règles 133 |
| **E3** | Mulligan gratuit à 3 joueurs ou plus (103.5c) ; régénération des parties dorées à plusieurs | ✅ règles 134 |
| **E4** | IA : évaluation, cible d'attaque, `determinize`, plafonds du fuzz, `arena --format commander --by-deck` (`forAgent` reporté en E14, position Commander du bench en E15) | ✅ |
| **E5** | Client local : accueil, zone de commandement, blessures de commandant, flèches, élimination, éditeur de deck ; `tools/commander-smoke.ts` (4 joueurs, captures) | ✅ |
| **E6** | Mécaniques qui citent le commandant : mana de l'identité, « si vous contrôlez un commandant », éminence, mana des terrains adverses ; dette justifiée ; et les 13 cartes qui les portent | ✅ règles 135 |
| **E7** | Mécaniques génériques demandées par les listes, si elles manquent : entretien cumulatif (702.24), ascension et bénédiction de la cité, protection d'un joueur contre tout et « votre total de PV ne peut pas changer », canalisation, changement de type de créature dans un texte (New Blood, sinon approximation), « engagez N créatures dégagées d'un type » | ✅ |
| **E8** ✅ | Cartes, base de mana commune (39) : Sol Ring, Arcane Signet, Command Tower, Path of Ancestry, talismans, Fellwar Stone, Thought Vessel, Decanter, Relic of Legends, terres à douleur, à contrôle, « deux adversaires », fetchs, Triomes, Urborg, Otawara, Sunken Ruins… | ✅ |
| **E9** | Cartes, sorts communs (19) : Teferi's Protection, Demonic Tutor, Enlightened Tutor, Fierce Guardianship, Deadly Rollick, Flawless Maneuver, Force of Negation, Snuff Out, Vindicate, Toxic Deluge, Farewell, Damn, Rewind, Unwind, Frantic Search, Sink into Stupor, Village Rites, Black Market Connections, The One Ring | ✅ |
| **E10** | Cartes, Edgar : commandant et créatures (29) | ✅ |
| **E11** | Cartes, Edgar : sorts et moteurs (11) : New Blood, Olivia's Wrath, Pact of the Serpent, Blade of the Bloodchief, Herald's Horn, Phyrexian Altar, Skullclamp, Vanquisher's Banner, Anointed Procession, Exquisite Blood, Sorin ; précon Edgar jouable | ✅ |
| **E12** | Cartes, Y'shtola (19) : commandant, Emet-Selch, Esper Sentinel, Kambal, Lotho, Lyse Hext, Orcish Bowmasters, Papalymo, Sheoldred, Tataru Taru, Irenicus's Vile Duplication, Quantum Misalignment, Mindcrank, Bloodchief Ascension, Helm of the Ghastlord, Mystic Remora, Ophidian Eye, Propaganda, Teferi, Time Raveler ; précon Y'shtola jouable | ✅ |
| **E13** | En ligne, 2 à 4 sièges humains ; `PROTOCOL_VERSION` 3 ; tests serveur et `hidden-info` à 3 et 4 joueurs | ✅ |
| **E14** | En ligne, sièges IA : hôte asynchrone, pool, plafonds, sauvegarde et reprise, fermeture, test de charge, `/healthz` | ✅ |
| **E15** | Bilan : parties dorées Commander (duel et 4 joueurs), équilibrage à l'arène, `verify --full`, docs (`moteur.md` recette « Commandant », `approximations.md`, `ia.md`, `deploiement.md`, `docs/extensions/edh.md`, `historique.md`), recette « Ajouter un deck Commander » dans CLAUDE.md | — |

**Ordre et regroupement :**
- E13 et E14 ne dépendent que d'E2 et E5. Ils peuvent passer avant les lots de cartes et se tester avec des decks aléatoires.
- Les effectifs des lots de cartes sont indicatifs ; `coverage --deck` donne la liste finale.

**Compte rendu de chaque lot de cartes** (format de `docs/extensions/<ext>.md`) :
- tests de règles ajoutés dans `engine/test/edh.test.ts` ;
- écarts trouvés ;
- formes nouvelles ;
- approximations.

## Approximations prévues (à inscrire dans `approximations.md`)

- 903.9b : choix automatique (bibliothèque → zone de commandement ; main → reste en main).
- Paires de commandants (partenaire, historique…) : refusées à la validation tant qu'aucun deck n'en a. Le modèle accepte déjà deux commandants.
- New Blood : à trancher en E7.
- Les approximations multijoueurs déjà connues (dons, choix « exacts en duel ») deviennent visibles à 4 joueurs : on les relit en E15.

## Vérifications

**Chaque lot :** `npm run verify -- --set EDH`, avec en plus `--set COMMANDER` (fuzz des précons à 2, 3 et 4 joueurs) une fois les decks jouables. Les tests d'interface tournent dès qu'E5 touche le client.

**Lots [règles] :**
- faire avancer `RULES_VERSION` ;
- les parties dorées restent identiques, sauf `quatre-joueurs-a` en E3, nommée dans le commit ;
- `npm run golden`.

**Fuzz :**
- `--format commander` (decks aléatoires) et `--pool commander` (précons), à 2, 3 et 4 joueurs, IA mixte et « chaos » ;
- fuzz strict `--offers 4`, dont les lancers depuis la zone de commandement.

**Tests :**
- `engine/test/commander.test.ts` : mise en place, taxe (lancer gratuit compris), 903.9a (oui, non, nouvelle offre), 903.9b, 21 blessures (infect, deux commandants), éminence, statiques inactives dans la zone, élimination ;
- décisions officielles dans `rulings.test.ts` ;
- `offers.test.ts` ;
- `ai/test/smoke/edh.test.ts` (commandant de test à cinq couleurs dans la zone) ;
- `cards/test/identity.test.ts` et `commander-decks.test.ts` ;
- `server/test/multiplayer.test.ts` : reprise sans relancer l'IA, fermeture sans humain.

**Interface :** `commander-smoke` (4 joueurs, `?fast`, captures dans `test-results/`) et `online-smoke` avec 2 humains et 1 IA.

**Fin de série :** `npm run verify -- --full`, puis l'arène pour l'équilibre, à 2 joueurs et à 4 (A, B, A, B).

## Risques

- **Fuites de la zone de commandement** (statiques, remplacements, permissions de lancer) : toutes les lectures passent par `commandZoneAbilities`, et un test le vérifie avec un commandant porteur de ces capacités.
- **Parties longues** (40 PV, 100 cartes, boucle Sanguine Bond + Exquisite Blood) :
  - `LOOP_LIMIT` (2 000) et `MAX_AUTOMATIC_DECISIONS` à surveiller ;
  - les parties « inachevées » du fuzz ;
  - le niveau moyen de l'IA est lent à 4 joueurs (`docs/ia.md`).
- **CPU et mémoire du VPS partagé avec les sièges IA :** plafonds sur le RSS ; raccourci « passer » ; mesures au test de charge.
- **Identité de couleur mal lue :** le rapport de comparaison avec Scryfall et la liste de dérogations la rattrapent.
- **Budget du chunk `cartes` :** la marge est préservée en mettant EDH dans son propre chunk.

## Recette pour les decks suivants (écrite en E15)

1. Exporter la liste dans `docs/commander/decks/<id>.txt`.
2. `npm run import-cards -- edh`, puis `npm run import-printings`.
3. `npm run coverage -- --deck <id> --text`.
4. Lots de cartes (mécaniques d'abord), tests de règles, fumée EDH.
5. Précon JSON.
6. Arène contre les précons existants.
7. `verify --set COMMANDER`.

## Annexe : listes (EDHREC, moyenne « optimized », 06/10/2026)

**Edgar Markov** (4 131 decks).
- **Créatures :** Blood Artist, Bloodletter of Aclazotz, Bloodline Keeper, Bloodthirsty Conqueror, Captivating Vampire, Champion of Dusk, Charismatic Conqueror, Clavileño, First of the Blessed, Cordial Vampire, Cruel Celebrant, Drana, Liberator of Malakir, Edgar, Charmed Groom, Elenda, the Dusk Rose, Emeritus of Woe, Forerunner of the Legion, Indulgent Aristocrat, Knight of the Ebon Legion, Legion Lieutenant, Malakir Bloodwitch, Marauding Blight-Priest, Markov Baron, Master of Dark Rites, Mavren Fein, Dusk Apostle, Sanctum Seeker, Stromkirk Captain, Twilight Prophet, Vampire Socialite, Vampire of the Dire Moon, Vengeful Bloodwitch, Viscera Seer, Vito, Thorn of the Dusk Rose, Welcoming Vampire, Yahenni, Undying Partisan.
- **Éphémères :** Anguished Unmaking, Boros Charm, Dark Ritual, Path to Exile, Swords to Plowshares, Teferi's Protection, Vampiric Tutor, Village Rites.
- **Rituels :** Damn, Demonic Tutor, Diabolic Intent, New Blood, Olivia's Wrath, Pact of the Serpent, Ruinous Ultimatum.
- **Artefacts :** Arcane Signet, Blade of the Bloodchief, Bolas's Citadel, Herald's Horn, Phyrexian Altar, Skullclamp, Sol Ring, Talisman of Hierarchy, Vanquisher's Banner.
- **Enchantements :** Anointed Procession, Black Market Connections, Exquisite Blood, Phyrexian Arena, Sanguine Bond, Shared Animosity, Smothering Tithe.
- **Planeswalker :** Sorin, Imperious Bloodlord.
- **Terrains :** Arid Mesa, Blood Crypt, Bloodstained Mire, Bojuka Bog, Cavern of Souls, Caves of Koilos, Command Tower, Dragonskull Summit, Godless Shrine, Isolated Chapel, Luxury Suite, Marsh Flats, 3 Mountain, Path of Ancestry, Phyrexian Tower, 3 Plains, Sacred Foundry, Savai Triome, Secluded Courtyard, 6 Swamp, Three Tree City, Unclaimed Territory, Urborg, Tomb of Yawgmoth, Vault of Champions, Voldaren Estate.

**Y'shtola, Night's Blessed** (4 305 decks).
- **Créatures :** Archmage Emeritus, Delney, Streetwise Lookout, Emet-Selch of the Third Seat, Enduring Tenacity, Esper Sentinel, Kambal, Consul of Allocation, Lotho, Corrupt Shirriff, Lyse Hext, Orcish Bowmasters, Papalymo Totolymo, Sheoldred, the Apocalypse, Talion, the Kindly Lord, Tataru Taru, Vito, Thorn of the Dusk Rose.
- **Éphémères :** Anguished Unmaking, Counterspell, Cyclonic Rift, Dark Ritual, Deadly Rollick, Dismember, Enlightened Tutor, Fierce Guardianship, Flawless Maneuver, Force of Negation, Force of Will, Frantic Search, Rewind, Sink into Stupor, Snuff Out, Swords to Plowshares, Teferi's Protection, Unwind, Vampiric Tutor, Void Rend.
- **Rituels :** Demonic Tutor, Exsanguinate, Farewell, Irenicus's Vile Duplication, Quantum Misalignment, Risky Shortcut, Toxic Deluge, Vindicate.
- **Artefacts :** Arcane Signet, Bolas's Citadel, Decanter of Endless Water, Fellwar Stone, Mindcrank, Relic of Legends, Sol Ring, Talisman of Dominance, Talisman of Hierarchy, Talisman of Progress, The One Ring, Thought Vessel.
- **Enchantements :** Authority of the Consuls, Black Market Connections, Bloodchief Ascension, Curiosity, Ghostly Prison, Helm of the Ghastlord, Mystic Remora, Ophidian Eye, Propaganda, Rhystic Study, Smothering Tithe.
- **Planeswalker :** Teferi, Time Raveler.
- **Terrains :** Adarkar Wastes, Arcane Sanctum, Caves of Koilos, Command Tower, Drowned Catacomb, Exotic Orchard, Flooded Strand, Glacial Fortress, Godless Shrine, Hallowed Fountain, 3 Island, Isolated Chapel, Marsh Flats, Morphic Pool, Otawara, Soaring City, 3 Plains, Polluted Delta, Prairie Stream, Raffine's Tower, Reliquary Tower, Sea of Clouds, Sunken Hollow, Sunken Ruins, 3 Swamp, Underground River, Vault of Champions, Watery Grave.

## Suivi

- **06/10/2026 :** plan écrit à la demande de l'utilisateur après trois explorations du code (moteur ; client, serveur et IA ; import des cartes) et une conception détaillée ; decks, en ligne avec sièges IA et règles à deux joueurs choisis par l'utilisateur.
- **06/10/2026, E0 :** pseudo-ensemble `EDH` (registre : `byName`, exclu de `STANDARD_SETS`, des jetons et du groupe « Standard » de l'éditeur ; groupe « Commander » ajouté) ; import par nom (`npm run import-cards -- edh` : lots `!"A" or …`, impression par défaut la plus récente d'un ensemble ordinaire déjà sorti, hors The List et Mystery Booster ; texte français de la même impression, sinon de la plus récente sans son image ; identité de Scryfall gardée dans les données) : 117 cartes de 36 ensembles, toutes avec leur texte français ; `CardDef.origin` (export « (C17) 36 », menu des illustrations ; plafond CardDef 96 → 97, `origin` noté dans `singleCardKeys` tant qu'une seule carte EDH est gérée) ; table des impressions régénérée ; section « Commander » des decklists et marque `*CMDR*` (avancée d'E1, `coverage --deck` en a besoin) ; `commander.json` (83 bannies, 53 Game Changers, aucune carte du catalogue non légale) et `check-legality --commander [--write]`, ajouté à la tâche hebdomadaire de la CI (une seule recherche paginée croisée avec le catalogue : les lots de noms dépassaient 10 minutes ; cartes d'illustration, jetons, objets de collection et cartes de test écartés, faute de quoi Brainstorm, Pick Your Poison ou Red Herring passaient pour non légales) ; `tools/commander-decks.ts` et `coverage --deck <id|all>` (Edgar 27 / 88 cartes jouables hors terrains de base, Y'shtola 25 / 91) ; chunk `commander` (budget 400 Ko) ; fumée `edh.test.ts` ; tests `commander-decks.test.ts` (decks de 100 cartes, cartes EDH, `commander.json`) et section Commander dans `decklist.test.ts`.
- **06/10/2026, E1 :** `colorIdentity` (`engine/src/identity.ts` : couleurs, symboles du coût et du texte hors rappel, hybride et phyrexian, toutes les faces, sort préparé, types de terrain de base) ; comparée à Scryfall sur tout le catalogue par `npm run import-printings` (5 650 cartes, aucun écart ; homonymes des cartes de test écartés : Red Herring, Earth Rumble, Agents of S.H.I.E.L.D.), et l'impression d'origine d'une carte EDH n'est plus reprise dans la table ; format `commander` (type `Format`, libellé, texte d'aide ; pas encore proposé dans `FORMATS`, attendu en E5) ; `validateDeck(…, "commander")` : un commandant (paires refusées pour l'instant), créature légendaire ou « peut être votre commandant », exactement 100 cartes, singleton (sauf terrains de base, « n'importe quel nombre », « jusqu'à N »), identité, `commander.json`, pas de réserve, Game Changers et tranche indicative ; `buildGameDeck` (commandant d'abord, indices) ; `DeckList.commander` et `format` ; précons `cmd-edgar-markov` et `cmd-yshtola` (catégorie « Commander » à l'accueil ; l'éditeur valide un deck dans son format) ; le bench, le fuzz et l'arène écartent les précons Commander ; 7 tests (`commander-format.test.ts`) et 1 de cohérence précons ↔ decklists ; Edgar : 5 Game Changers, Y'shtola : 13, tranche « 4+ » pour les deux. Vérification : `verify --set EDH --ui` vert sauf vitest au premier passage (délais de 5 à 10 s dépassés dans `server/test/online.test.ts` et `persistence.test.ts`, des tests différents à chaque fois ; ils échouent aussi sur l'état E0, un passage sur quatre : fragilité préexistante sous charge), suite complète verte au passage suivant (12 449 tests).
- **06/10/2026, E2** (règles 133) : variante `commander` (`GameOptions.variant`, `PlayerSetup.commanders`, `GameRecord.variant` et `players[].commanders`, 40 PV par défaut) ; `GameState.commander` (commandants par `uid` : taxe, blessures de combat par joueur, retour déjà proposé ; plafond GameState 39 → 40) ; `commanderOf` et `commandZoneAbilities` (`state.ts`) : un commandant qui attend dans la zone de commandement n'a aucune capacité active (statiques, déclencheurs, couches, remplacements ; seuls les emblèmes) ; lancer depuis la zone (`source: "command"`, taxe {2} par lancer précédent, comptée au lancer) proposé par `legalActions` et montré au bout de la main avec sa pastille ; 903.9a (question oui/non au propriétaire, une fois par objet, après les déclencheurs « meurt ») ; 903.9b (vers la bibliothèque : zone de commandement ; vers la main : reste en main, approximation notée) ; 21 blessures de combat d'un même commandant (raison de défaite `commander`, libellé du journal) ; vue `PlayerView.commanders` et `commanderDamage`, emblèmes limités aux jetons ; empreinte (`outcomeHash`) et invariant « un objet par commandant » ; IA : les commandants ne comptent plus comme emblèmes ; fuzz `--format commander` (`randomCommanderDeck` : commandant légendaire et 99 cartes singleton de son identité ; `--pool commander` : précons jouables), séries Commander dans `verify` (`--ci`, `--full`, `--set EDH`, `--set COMMANDER`) ; partie dorée `commandant-aleatoire-4j` ; les dix autres parties dorées identiques ; 10 tests (`commander.test.ts`) ; `verify --set EDH` vert (vitest au second passage : délai dépassé dans `server/test/bo3.test.ts`, la fragilité déjà notée), tests d'interface verts.
- **06/10/2026, E3** (règles 134) : mulligan gratuit dans toute partie à trois joueurs ou plus (103.5c : le premier mulligan ne compte pas ; en duel, Commander compris, chaque mulligan compte) ; la décision `mulligan` annonce `bottom` (cartes à mettre au-dessous en gardant), lu par la fenêtre de mulligan (« Premier mulligan gratuit ») ; 3 tests (`multiplayer.test.ts`), 3 attentes de `rules.test.ts` adaptées à la nouvelle forme de la décision ; parties dorées régénérées, toutes à plusieurs : `quatre-joueurs-a`, `recentes-woe-sos-mkm` (trois joueurs) et `commandant-aleatoire-4j` ; les autres identiques. Course corrigée dans `server/test/bo3.test.ts` (Alice abandonnait parfois avant que l'arrivée de Bob ait lancé la partie : le test attend maintenant la partie) ; reste une fragilité ponctuelle préexistante (délai dépassé, un passage sur cinq environ) dans `online.test.ts` et `persistence.test.ts`. `verify --set EDH --ui` vert hors ces délais ; suite complète verte (12 463 tests).
- **06/10/2026, E4 :** IA : PV effectifs (`effectiveLife`, blessures du commandant le plus menaçant), valeur d'un commandant qui attend (0,6 × sa valeur de créature, moins avec la taxe), joueur « tuable » par les blessures de commandant (`attackTarget`), cible préférée par les PV effectifs (`targetOpponent`) ; déterminisation : un commandant reste ce qu'il est (public) et ne sert pas à deviner les cartes cachées ; arène : `--format commander`, `--pool commander` (précons jouables) et `--by-deck` (mesure des decks : les decks changent de place) ; 6 tests (`ai/test/commander.test.ts` : lancer du commandant, retour 903.9a, PV effectifs, attaque pour achever par les blessures de commandant, déterminisation, parties complètes à 2 et 4 joueurs) ; mesure : ISMCTS 65 % ± 15 contre le niveau moyen en Commander à deux (40 parties, budget 60) : gardé. Reportés : `forAgent` (sièges IA du serveur, E14) et une position Commander dans le bench (E15, avec les précons jouables). `verify --set EDH` vert.
- **06/10/2026, E5 :** client local. Accueil : format « Commander » proposé (`FORMATS` ; pas encore en ligne : `ONLINE_FORMATS`, et le serveur refuse un salon Commander jusqu'à E13), decks remplacés par des decks à commandant au changement de format, BO3 masqué, « 40 points de vie » ; le commandant de chaque deck part en tête de deck (`startGame(…, commander)`, message `start` du worker : `variant` et `commanders`). Plateau : ligne « Commander » sous chaque barre de joueur (commandant, sa zone, sa taxe ; blessures de commandant reçues, en rouge à partir de 15 ; ligne qui passe à la ligne, bornée : sans cela, trois blessures reçues repoussaient la main et le bouton principal hors de l'écran) ; commandant au bout de la main (étiquette « Commandant ») ; flèches vers le joueur attaqué en multijoueur ; question 903.9a avec la carte du commandant ; bandeau « Vous avez été éliminé. La partie continue sans vous » et nom du vainqueur à plusieurs ; journal et son du retour dans la zone de commandement (événement `moved` vers `command`, émis par 903.9a et 903.9b ; parties dorées identiques) ; un joueur éliminé n'a plus de puces Commander. Éditeur de deck : format du deck au choix, onglet « Commandant » à la place de la réserve, bouton ♛ « Définir comme commandant », compteur n/100, un exemplaire au plus, filtre « Identité du commandant », légalité dans le format du deck, Game Changers et tranche estimée ; l'import d'une liste avec une section Commander crée un deck Commander ; couleurs et illustration d'un deck Commander : celles du commandant ; « Tester contre l'IA » oppose un deck Commander à un autre. `tools/commander-smoke.ts` (éditeur : précon Edgar à 100/100, 5 Game Changers ; partie à quatre lancée par le magasin du mode dev : 40 PV, quatre commandants, lancer depuis la zone de commandement, élimination) ajouté aux tests d'interface de `verify`. `verify --set EDH --ui` vert sauf un délai dépassé dans `server/test/online.test.ts` (fragilité notée en E3 ; vert seul).
- **06/10/2026, E6** (règles 135) : formes : `ManaAbilityDef.produceIdentity` (`commanderIdentity`, `state.ts` ; rien sans commandant), `produceLikeLands` qui lit le contrôleur du filtre et se borne à `produce` (Exotic Orchard, Fellwar Stone : couleurs des terrains adverses ; Reflecting Pool et Star Compass inchangés), `ObjectFilter.commander` (instantané `commander`, filtre `matchesView`), `fromCommand` sur les capacités déclenchées et statiques (`commandZoneAbilities` les laisse fonctionner depuis la zone de commandement ; `detectTriggers` garde les indices de la définition) ; 13 cartes scriptées (`edh/commander.ts`, aides `edh/common.ts`) : Command Tower, Arcane Signet, Path of Ancestry (regard 1 non fait, approximation notée), Exotic Orchard, Fellwar Stone, Luxury Suite, Vault of Champions, Morphic Pool, Sea of Clouds, Fierce Guardianship, Deadly Rollick, Flawless Maneuver, Edgar Markov (avancées des lots E8 à E10) ; 11 tests (`engine/test/edh.test.ts`) ; dette : `fromCommand` propre à Edgar pour l'instant, `origin` retiré (plusieurs cartes EDH gérées), plafond ObjectFilter 86 → 87 ; parties dorées identiques.
- **06/10/2026, E13** (fait pendant les lots de cartes, confiés à quatre agents) : en ligne de 2 à 4 sièges, humains. Protocole 3 : sièges `p1` à `p4`, `players` et `commander` à la création, `commander` à l'arrivée, `MatchInfo.seats`, victoires et expirations par siège facultatives, commandant dans `RoomInfo.deck`. Serveur : taille du salon, premier siège libre, départ quand le salon est plein, premier joueur tiré parmi tous, Commander (commandant vérifié avec le deck, `buildGameDeck`, variante `commander`, pas de réserve), BO3 seulement en duel hors Commander, une seule manche à plusieurs (le vainqueur de la partie gagne le match), revanche quand tous l'acceptent, statut de l'adversaire réservé au duel (à plusieurs : `RoomInfo.players`), un joueur qui ne revient pas abandonne et la partie continue sans lui, sauvegarde et reprise avec les commandants ; une ligne de deck peut compter jusqu'à 100 exemplaires (99 terrains de base en Commander). Client : nombre de joueurs à la création, Commander proposé en ligne (`ONLINE_FORMATS` = tous les formats), salle d'attente avec la liste des joueurs et le nombre manquant, bandeau réseau et revanche à plusieurs. Tests : `server/test/multiplayer.test.ts` (4 : salon à trois, abandon sans fin de partie, Commander en ligne, reprise d'un salon Commander à trois), `hidden-info.test.ts` étendu au Commander à 3 et 4 joueurs. Tests d'interface à relancer à l'intégration (machine occupée par les agents).
- **06/10/2026, E14 :** sièges IA tenus par le serveur. `GameHost` accepte des IA asynchrones (`AsyncAgent` : il attend leur décision, puis repart de l'état courant s'il a changé). Pool `server/src/aiPool.ts` de `worker_threads` (`aiWorker.ts` : définitions des cartes gardées par salon, complétées à chaque envoi par celles qui manquaient, jetons compris ; taille `MTGX_AI_WORKERS`, 2 au plus par défaut ; 160 Mo par worker ; délai de 10 s : worker remplacé, décision par défaut) ; une priorité où il n'y a qu'à passer se règle sans worker. Salons : `ai: { count, level }` à la création (au moins un humain ; niveau élevé seulement en duel, sinon moyen ; decks : préconstruits jouables du format tirés au sort), sièges nommés « IA n (niveau) », toujours connectés et d'accord pour la revanche, sans minuteur ; décisions enregistrées comme les autres (une reprise les rejoue sans relancer l'IA, puis l'IA reprend si c'était à elle) ; le salon ferme quand le dernier humain part ; plafonds `MTGX_MAX_AI_ROOMS` (20) et RSS (`MTGX_MAX_RSS_MB`, 640 Mo) ; `/healthz` (`ai`) ; `build-server` produit aussi `dist/ai-worker.mjs` ; `load-test --ai N`. Client en ligne : sièges IA et niveau à la création. `forAgent` (déterminisation côté serveur) n'a pas été fait : l'IA reçoit l'état complet comme dans le worker du navigateur, sous la même règle (« ne jamais lire la main adverse »). Tests : `server/test/aiPool.test.ts` (2), `server/test/ai-seats.test.ts` (4 : duel contre l'IA, fermeture sans humain, refus et niveau ramené, reprise après redémarrage). Mesure de charge à faire sur une machine libre (E15).
- **06/10/2026, E8** (règles 136 ; lots de cartes confiés à quatre agents en parallèle, dans des copies isolées, intégrés par cherry-pick) : base de mana, 30 cartes (`edh/lands.ts`) ; `tapAnother` accepte un filtre (Relic of Legends) ; 17 tests (`edh-mana.test.ts`) ; approximations : Relic of Legends ; parties dorées identiques ; fuzz EDH strict, Commander à 4 et « chaos » propres chez l'agent. EDH : 44 / 117.
