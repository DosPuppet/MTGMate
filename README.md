# Planecircle

Plateforme pour jouer à Magic: The Gathering contre une ou plusieurs IA (en duel ou en multijoueur) et en ligne contre d'autres joueurs (de 2 à 4, BO3 en duel ; Standard, Sans limite ou Commander). Elle repose sur un **moteur de règles maison en TypeScript** et une interface 2D pensée pour être aussi fluide que MTG Arena :

- passage automatique de la priorité, avec un arrêt sur « Fin du tour » à la fin de chacun de vos tours (même sans rien à jouer) ;
- paiement automatique du mana ;
- arrêts configurables ;
- cible choisie automatiquement quand elle est unique ;
- glisser-déposer ;
- cartes jouables hors de la main (flashback, terrain depuis le cimetière, exil, dessus de la bibliothèque) présentées au bout de la main, avec une étiquette indiquant leur zone ;
- coût de mana modifié (réduction, taxe, flashback) affiché sur la carte dans la main ;
- IA à trois niveaux au choix (débutant, moyen, élevé), du jeu heuristique à la recherche ISMCTS en duel (voir docs/ia.md) ;
- exil consultable : bouton à côté du cimetière, et cartes exilées par un permanent affichées sous lui (survol pour les voir) ;
- jouable sur tablette et sur téléphone en paysage (voir « Tablette et téléphone ») ;
- images des cartes relayées par le serveur quand le réseau du joueur bloque Scryfall (voir « Images bloquées par le réseau ») ;
- cartes en français : nom, texte et illustration de l'impression française (celle d'une autre édition quand l'originale n'existe pas en français ; texte complété à la main quand Scryfall ne l'a pas).

**Toutes les cartes légales en Standard sont jouables** (dernière extension ajoutée : The Hobbit, 188 / 188). Dernier ajout : le **Commander**, de 2 à 4 joueurs, contre l'IA et en ligne, avec douze decks préconstruits (Edgar Markov, Y'shtola, The Ur-Dragon, Rakdos, Lord of Riots, Nissa, Leyline Tamer, The Vision, Dark Leo & Shredder, et les préconstruits officiels de Réalité fracturée, des Tortues Ninja, de Final Fantasy X, des Quatre Fantastiques et de Fallout) ; les decks suivants arrivent un par un, chacun avec ses cartes.

## Périmètre : le Standard

Le périmètre visé avant toute extension est le **format Standard** : construit, 60 cartes minimum, 4 exemplaires maximum (sauf terrains de base et cartes « n'importe quel nombre »), réserve de 15 cartes.

Les cartes ont été couvertes **extension par extension, à 100 % avant de passer à la suivante** (sauf pendant la phase « méta » du plan P4, voir plus bas) : toutes les cartes légales en Standard sont jouables. Toutes les extensions Standard sont importées (textes, légalités, faces) ; une carte qui ne serait pas gérée par le moteur apparaîtrait grisée dans le deckbuilder, avec la mention « bientôt ».

**Extensions légales en Standard au 25/09/2026** (source : Scryfall, à revérifier à chaque rotation) :

| Extension | Cartes gérées |
|---|---|
| **Foundations (FDN)** | ✅ 517 / 517 |
| **Reality Fracture (FRA, « Réalité fracturée »)** | ✅ 279 / 279 |
| **Edge of Eternities (EOE)** | ✅ 260 / 260 |
| **Aetherdrift (DFT)** | ✅ 260 / 260 |
| **Outlaws of Thunder Junction (OTJ) et The Big Score (BIG)** | ✅ 269 / 269 et 30 / 30 |
| **Final Fantasy (FIN)** | ✅ 307 / 307 |
| **Duskmourn: House of Horror (DSK, « Mornebrune : la Maison de l'horreur »)** | ✅ 268 / 268 |
| **Bloomburrow (BLB)** | ✅ 266 / 266 |
| **The Lost Caverns of Ixalan (LCI, « Les cavernes oubliées d'Ixalan »)** | ✅ 279 / 279 |
| **Tarkir: Dragonstorm (TDM, « Tarkir : Tempête draconique »)** | ✅ 259 / 259 |
| **Lorwyn Eclipsed (ECL, « Lorwyn éclipsé »)** | ✅ 266 / 266 |
| **Wilds of Eldraine (WOE, « Les friches d'Eldraine »)** | ✅ 269 / 269 |
| **Secrets of Strixhaven (SOS, « Les secrets de Strixhaven »)** | ✅ 262 / 262 |
| **Murders at Karlov Manor (MKM, « Meurtres au manoir Karlov »)** | ✅ 271 / 271 |
| **Avatar: The Last Airbender (TLA)** | ✅ 280 / 280 |
| **Marvel Super Heroes (MSH)** | ✅ 271 / 271 |
| **Marvel's Spider-Man (SPM)** | ✅ 188 / 188 |
| **Teenage Mutant Ninja Turtles (TMT)** | ✅ 188 / 188 |
| **The Hobbit (HOB)** | ✅ 188 / 188 |

Au total, **5 164 cartes jouables** sur 5 164 cartes légales en Standard (100 %, vérifié chaque semaine contre Scryfall : `tools/check-legality.ts`). Les lignes ci-dessus font 5 177 cartes : elles comptent aussi les 13 cartes bannies, gérées mais refusées par la validation des decks, sauf dans le format « Sans limite » (au choix à l'accueil, contre l'IA, et à la création d'une partie en ligne), qui accepte toute carte du catalogue, quelle que soit sa légalité.

**Rééditions, pour le format « Sans limite »** (plan G, `docs/plans/PLAN-G.md`) : les Special Guests et les feuilles bonus sorties avec les extensions ci-dessus, hors Standard, avec l'illustration de la réédition. Les cartes à mécanique propre au Commander (partenaire, éminence…) attendent un deck Commander qui les demande (plan E).

| Ensemble | Cartes gérées |
|---|---|
| Special Guests (SPG) | 132 / 132 |
| Stellar Sights (EOS) | 43 / 43 |
| Enchanting Tales (WOT) | 55 / 55 |
| Breaking News (OTP) | 61 / 61 |
| Through the Ages (FCA) | 50 / 50 |
| Mystical Archive (SOA) | 37 / 37 |
| Source Material (PZA) | 15 / 15 |
| Jurassic World Collection (REX) | 20 / 20 |

**Decks du méta (plan P4, phase 1 terminée) :** avant de finir les dernières extensions une à une, on écrit les cartes des decks Standard les plus joués (relevé MTGGoldfish du 29/09/2026, `docs/meta/`). Les **vingt archétypes relevés** (88,1 % du méta) sont jouables, réserve comprise ; les cinq premiers sont proposés comme decks préconstruits (Izzet Spellementals, Mono-Green Landfall, Dimir Midrange, Jund Sacrifice, 4c Control). Quelques réimpressions d'extensions plus anciennes sont aussi légales parce qu'elles figurent dans ces sets.

**Cartes bannies en Standard** (13) :

- Abuelo's Awakening
- Badgermole Cub
- Cori-Steel Cutter
- Gran-Gran
- Heartfire Hero
- Hopeless Nightmare
- Monstrous Rage
- Proft's Eidetic Memory
- Screaming Nemesis
- Stormchaser's Talent
- This Town Ain't Big Enough
- Up the Beanstalk
- Vivi Ornitier

**Commander (plan E, `docs/plans/PLAN-E.md`) :** règles du format (zone de commandement, taxe, retour dans la zone de commandement demandé au propriétaire, blessures de commandant, 40 points de vie, identité de couleur, singleton, liste de bannissement et Game Changers de Scryfall, premier mulligan gratuit), de 2 à 4 joueurs, contre l'IA et en ligne (avec des sièges IA tenus par le serveur), éditeur de deck Commander (100 cartes, identité, tranche estimée d'après les Game Changers). Douze préconstruits jouables : Edgar Markov (vampires, Mardu) et Y'shtola, Night's Blessed (drain et contrôle, Esper), d'après les listes moyennes d'EDHREC en bracket 4 (06/10/2026), The Ur-Dragon (Dragons, cinq couleurs, liste « How to Train Ur-Dragon » de Moxfield), Rakdos, Lord of Riots (gros sorts presque gratuits, noir et rouge, liste Moxfield), Nissa, Leyline Tamer (toucheterre et grandes créatures, quatre couleurs sans le vert, liste Moxfield), The Vision (artefacts incolores, terrains d'Urza et Eldrazi, liste TappedOut « Weight of the World »), Dark Leo & Shredder (Ninjas et ninjutsu, blanc et noir, liste Moxfield « I Am Ninja, Sneaking in the Shadows »), et cinq préconstruits officiels : Multiverse Reforged (Jace, Multiverse Architect, Réalité fracturée), Turtle Power! (Heroes in a Half Shell, Tortues Ninja), Counter Blitz (Tidus, Yuna's Guardian, Final Fantasy X), The Fantastic Four (Invisible Woman, Marvel Super Heroes) et Mutant Menace (The Wise Mothman, Fallout, avec les marqueurs de radiation). Les cartes arrivent deck par deck : celles qui manquent au catalogue forment le pseudo-ensemble « Commander » (EDH, 653 / 653 cartes gérées, `docs/extensions/edh.md`). Ajouter un deck : liste dans `docs/commander/decks/`, `npm run import-cards -- edh`, scripts et tests, préconstruit (recette dans CLAUDE.md).

| Préconstruit | Couleurs | Source | Game Changers (tranche estimée) |
|---|---|---|---|
| Edgar Markov — Vampires | blanc, noir, rouge | EDHREC, liste moyenne « optimized » | 5 (4+) |
| Y'shtola, Night's Blessed — drain et contrôle | blanc, bleu, noir | EDHREC, liste moyenne « optimized » | 13 (4+) |
| The Ur-Dragon — Dragons | cinq couleurs | Moxfield, « How to Train Ur-Dragon [Primer!] » | 7 (4+) |
| Rakdos, Lord of Riots — gros sorts gratuits | noir, rouge | Moxfield, « Rakdos, Lord of Big Free Stuff » | 2 (3) |
| Multiverse Reforged — Jace, architecte du multivers | blanc, bleu, noir, rouge | préconstruit officiel de Réalité fracturée | 0 (1–2) |
| Turtle Power! — Héros à carapace | cinq couleurs | préconstruit officiel des Tortues Ninja | 0 (1–2) |
| Counter Blitz — Tidus, gardien de Yuna | vert, blanc, bleu | préconstruit officiel de Final Fantasy X | 1 (3) |
| The Fantastic Four — Femme Invisible | blanc, bleu, rouge, vert | préconstruit officiel de Marvel Super Heroes | 0 (1–2) |
| Mutant Menace — Homme-phalène sage | bleu, noir, vert | préconstruit officiel de Fallout | 0 (1–2) |
| Nissa, Leyline Tamer — toucheterre et grandes créatures | blanc, bleu, noir, rouge | Moxfield, « Nissa, Non-Green Animist (Landfall w/ Big Creatures) » | 4 (4+) |
| The Vision — artefacts incolores | incolore | TappedOut, « Weight of the World » | 3 (3) |
| Dark Leo & Shredder — Ninjas | blanc, noir | Moxfield, « I Am Ninja, Sneaking in the Shadows » | 4 (4+) |

**Hors périmètre pour l'instant :** Limité (scellé, draft), formats éternels, cartes numériques d'Alchemy.

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173
```

### Jouer en ligne (de 2 à 4 joueurs)

- **En développement :** `npm run server` (serveur de parties, port 8787) et `npm run dev`. Ouvrez deux onglets, puis « Contre un joueur » : l'un crée la partie, l'autre la rejoint avec le code ou le lien.
- **Salons :** format Standard, Sans limite ou Commander ; de 2 à 4 sièges, chacun tenu par un joueur ou par une IA du serveur (la partie commence quand tous les sièges humains sont pris). À plusieurs, un joueur qui part abandonne et la partie continue sans lui.
- **En réseau local :** `npm run build` puis `npm run server`. Le serveur sert aussi l'interface : votre adversaire ouvre l'adresse « réseau » affichée (`http://<ip>:8787`).
- **Sur un serveur (Internet, HTTPS) :** Node + pm2 derrière nginx, avec un sous-domaine. La notice pas à pas est dans [docs/deploiement.md](docs/deploiement.md) ; les fichiers sont dans `deploy/` (configuration pm2, site nginx, script de mise à jour).
- **Match en 3 manches (BO3, en duel seulement) :** à cocher en créant le salon (et, contre l'IA, sur l'accueil). Entre deux manches, chacun ajuste son deck avec sa réserve (mêmes cartes au total, deck légal), puis le perdant de la manche précédente commence la suivante. Le match s'arrête à deux victoires.
- **Règles du salon :**
  - 60 s par décision, avec une corde affichée pendant les 20 dernières ;
  - à l'expiration, une décision par défaut est jouée ; 3 expirations valent une défaite ;
  - après une déconnexion, 60 s pour revenir (en rechargeant la page), sinon défaite ;
  - revanche possible dans le même salon.
- **Variables d'environnement :** `PORT`, `HOST` (`127.0.0.1` derrière nginx), `MTGX_DECISION_MS`, `MTGX_GRACE_MS`, `MTGX_MAX_ROOMS`, `MTGX_DATA_DIR` (sauvegarde des parties, reprises après un redémarrage ; `data/rooms` par défaut), `MTGX_MAX_ROOMS_PER_IP` (4), `MTGX_ORIGINS` (origines admises pour le WebSocket en plus du site lui-même), `MTGX_MAX_HEAP_MB` ; sièges IA : `MTGX_AI_WORKERS` (2), `MTGX_MAX_AI_ROOMS` (12), `MTGX_MAX_RSS_MB` (640). `/healthz` indique l'état du serveur (détail dans [docs/deploiement.md](docs/deploiement.md)).

### Replays et export d'une partie

- **Exporter la partie** (barre latérale) télécharge un fichier JSON : la graine, les decks et toutes les décisions. Le moteur étant déterministe, ce fichier suffit à rejouer exactement la partie ; joignez-le au signalement d'un bug. Contre l'IA, l'export est possible à tout moment ; en ligne, seulement une fois la partie terminée (le fichier révèle les decks).
- **Revoir une partie** (accueil) ouvre ce fichier dans le visionneur : étape par étape, lecture automatique, saut au début ou à la fin, et choix du point de vue (chaque joueur ne voit que ce qu'il voyait).
- **En ligne,** les parties sont sauvegardées de la même façon par le serveur (`data/rooms`) : un redémarrage ne les coupe plus.
- **Version des règles :** l'enregistrement note la version des règles du moteur et une empreinte de la partie toutes les 25 décisions. Une partie enregistrée par une version antérieure du moteur qui ne se rejoue plus à l'identique s'arrête à la première divergence, signalée dans la barre du visionneur.

### Tablette et téléphone

L'interface s'adapte à l'écran : tablette en paysage ou en portrait, téléphone en paysage. En portrait, un téléphone affiche « Tournez votre appareil ».

- **La main** se resserre pour toujours tenir dans la largeur de l'écran. Sur téléphone, elle dépasse sous l'écran, comme sur MTG Arena.
- **Au doigt :**
  - un premier tap lève une carte de la main et l'agrandit, un second la joue ; on peut aussi la glisser vers le champ de bataille ;
  - un appui long sur n'importe quelle carte l'affiche en grand, et un tap la referme.
- **Écran étroit** (moins de 1100 px, par exemple une tablette en portrait) : les réglages et le journal passent dans un tiroir ouvert par le bouton ☰.
- **Essai sur un vrai appareil :** `npm run dev -- --host`, puis ouvrez l'adresse « Network » affichée depuis la tablette (même réseau Wi-Fi).

### Images bloquées par le réseau

Les images des cartes viennent de Scryfall (`cards.scryfall.io`). Certains réseaux (entreprise, école) le bloquent, et les cartes s'affichent alors en cadre texte. Le serveur Planecircle peut relayer les images par `/scry/…` :

- **Automatique :** au démarrage, si Scryfall ne répond pas et que le serveur répond, le relais s'active tout seul.
- **À la main :** la case **« Images par le serveur Planecircle »**, sur l'accueil (en haut à droite) ou dans les réglages de la partie. Cochez-la si les cartes ne s'affichent pas. Le choix est mémorisé.
- **Serveur :** seules les images de cartes sont relayées (liste blanche) ; ce n'est pas un proxy ouvert. Derrière nginx, les images sont mises en cache (voir [docs/deploiement.md](docs/deploiement.md)). En dev, Vite relaie `/scry` directement.
- Si Scryfall est accessible, les images viennent de Scryfall en direct, et le serveur n'est pas sollicité.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run verify -- --set <EXT>` | Vérification d'un lot, parallélisée (environ 2 min) : types, Biome, couverture, tous les tests, fuzz ciblé sur l'extension à 2, 3 et 4 joueurs ; tests d'interface si le client a changé. `--set COMMANDER` : les préconstruits Commander ; `--set EDH` : le pseudo-ensemble Commander |
| `npm run verify -- --full` | Vérification complète (environ 7 min) : fuzz sur tout le pool, bench et tests d'interface. Durée de chaque étape affichée, journaux dans `test-results/verify/` |
| `npm run verify -- --ci` | Vérification de l'intégration continue (GitHub Actions, à chaque push) : types, Biome, couverture, tests et fuzz courts sur tout le pool, sans interface ni bench |
| `npm test` | Tests de règles, d'IA, et test de fumée de chaque carte gérée (Vitest, un fichier par extension) |
| `npm run golden [-- --update]` | Parties dorées (`tools/golden.ts`) : vérifie qu'elles se rejouent à l'identique ; `--update` régénère seulement celles qui divergent après un changement de `RULES_VERSION` |
| `npm run fuzz -- --games 300 [--pool decks\|all\|meta\|<EXT>\|commander] [--format commander] [--players 4] [--offers 4] [--ai random\|heuristic\|mixed\|beginner\|medium\|expert\|levels\|chaos] [--seed N] [--jobs 10]` | Parties IA contre IA, invariants vérifiés à chaque décision. `--pool FIN` : decks tirés surtout de cette extension. `--format commander` : parties de Commander (decks aléatoires, ou `--pool commander` : les préconstruits). `--offers N` : fuzz strict (toute option proposée doit être acceptée). `--jobs` : parties réparties sur plusieurs processus, mêmes résultats à graine égale |
| `npm run bench` | Décisions par seconde du moteur et temps de décision de l'IA (cibles : ≥ 5 000 déc/s, IA moyenne < 50 ms, IA élevée < 150 ms ; à mesurer sur secteur) |
| `npm run arena -- --a expert --b medium [--games 600] [--jobs 10] [--budget 100] [--pool decks\|all\|mix\|meta\|commander] [--players 4]` | Tournoi d'IA (places et decks alternés) : taux de victoire avec intervalle à 95 %, temps de décision ; `expert:0` = élevé sans ISMCTS. Équilibre des decks : `--a medium --b medium --format commander --pool commander --by-deck --deck cmd-<id>`. `--jobs` : par défaut, tous les cœurs moins deux (mêmes résultats quel que soit `--jobs`) ; avancement toutes les 10 s ; les cinq décisions les plus lentes et la commande qui rejoue leur partie ; `MTGX_SLOW_MS=N` signale les décisions de plus de N ms |
| `npm run ai-smoke` | Niveau de l'IA : sélecteur de l'accueil, latence de l'IA élevée en temps réel, processeur normal et ralenti ×4 (serveur de dev lancé) |
| `npm run tutorial-smoke [-- --only 2,3] [-- --debug]` | Tutoriel suivi dans le navigateur comme un joueur, refus hors guide, reprise (serveur de dev lancé) |
| `npm run coverage [-- --set all\|standard\|<EXT>] [-- --text [--color W]] [-- --card "<nom>"] [-- --deck <id\|all>] [-- --audit]` | Cartes gérées par extension, textes Oracle des cartes restantes, texte et script d'une carte ; `--deck` : cartes d'un deck Commander à scripter ; `--audit` : écarts entre le texte Oracle et le script des cartes gérées |
| `npm run server` | Serveur de parties en ligne (WebSocket `/ws`, sert aussi `packages/client/dist`) |
| `npm run online-smoke [-- --base <url>]` | Duel en ligne entre deux navigateurs : salon, lien d'invitation, corde, reprise après rechargement, revanche (serveur de dev par défaut, ou `--base` vers un serveur de production ou nginx) |
| `npm run proxy-smoke` | Relais des images : Scryfall bloqué (bascule automatique sur `/scry/`), case « Images par le serveur Planecircle » (serveur de dev lancé) |
| `npm run bo3-smoke` | Match BO3 contre l'IA : réserve entre les manches, perdant qui commence, issue du match (serveur de dev lancé) |
| `npm run replay-smoke` | Replays : partie contre l'IA exportée, puis rouverte dans le visionneur (avance, retour, fin, point de vue) (serveur de dev lancé) |
| `npm run mobile-smoke` | Tablette et téléphone émulés : main, bouton principal et champs à l'écran, appui long, tap pour lever une carte, tiroir, portrait (serveur de dev lancé) |
| `npm run battlefield-smoke` | Plateaux chargés (jetons, 2e ligne, 4 joueurs) mis en jeu par le bac à sable du mode dev : rangées, piles de jetons, aucune carte rognée (serveur de dev lancé) |
| `npm run import-tokens` | Images des jetons : jetons Scryfall des extensions Standard (`t<code>`) dans `packages/cards/data/tokens.json` |
| `npm run import-cards -- <set>\|all\|edh` | Import Scryfall d'une extension, de toutes les extensions Standard hors FDN et FRA (`all`), ou par nom des cartes des decks Commander absentes du catalogue (`edh`, impressions françaises en priorité) |
| `npm run import-printings` | Table des impressions (illustrations au choix dans l'éditeur de deck) ; compare aussi l'identité de couleur à Scryfall |
| `npx tsx tools/check-legality.ts [--commander] [--write]` | Légalités Standard (ou bannissements et Game Changers du Commander) comparées à Scryfall ; tâche hebdomadaire de la CI |
| `npx tsx tools/commander-smoke.ts` | Commander dans le navigateur : accueil, éditeur, partie à quatre (serveur de dev lancé) |
| `npm run deck-smoke` | Deckbuilder de bout en bout : import, édition, export, persistance, partie (serveur de dev lancé) |
| `npm run ui-smoke -- <dossier> [actions]` | Joue une partie dans Chromium via l'interface et prend des captures (serveur de dev lancé) |
| `npm run typecheck` / `npm run lint` | TypeScript strict / Biome |

## Architecture

```
packages/
  engine/   moteur pur et déterministe : état JSON, décisions, règles, autopilot, vue filtrée, GameHost
            src/model/ (types), src/ops/ (traitements des effets par domaine) ; guide : docs/moteur.md
  cards/    données Scryfall (data/<set>.json : 20 extensions Standard, 8 ensembles de rééditions, pseudo-ensemble Commander
            edh.json), scripts des cartes (src/<ext>/*.ts), lecture du texte Scryfall (src/scryfall.ts), decklists, decks
            préconstruits (decks/*.json : 5 decks de bienvenue FDN, Starter Kit FIN, 5 decks du méta, 12 decks Commander)
  ai/       IA à trois niveaux (heuristique paramétrée, combat par simulation, ISMCTS), IA aléatoire (fuzz),
            adversaire scripté (tutoriel) ; guide : docs/ia.md
  server/   jeu en ligne : salons de 2 à 4 sièges, GameHost côté serveur (fait autorité), sièges IA dans des workers,
            minuteur, reconnexion, sauvegarde et reprise ; protocole partagé ; relais des images de Scryfall (/scry/)
  client/   React + Vite + Zustand + Motion ; la partie tourne dans un Web Worker ; deckbuilder ; disposition du plateau façon MTGA (board/layout.ts) ;
            effets sonores (audio/) ; gestes tactiles (touch.ts) ; relais des images (images.ts)
tools/      import Scryfall, vérification, fuzz, bench, couverture, tests d'interface
docs/       guide du moteur, approximations connues, détail des extensions, déploiement
```

- **`submit(state, joueur, décision) → { state, events }`** : le moteur avance tout seul jusqu'à la prochaine décision. Il donne ensuite la liste exhaustive des options légales (`legalActions`), dont se servent l'interface, l'IA et l'autopilot.
- **Autopilot** (`engine/src/autopilot.ts`) : il répond aux décisions triviales. Le moteur, lui, reste strict. Le mode « contrôle total » désactive l'autopilot, sauf « Fin du tour », qui reste une demande explicite. Pendant votre tour, il s'arrête toujours à la seconde phase principale : c'est vous qui terminez le tour. Les vraies décisions (retour du commandant dans la zone de commandement…) ne sont jamais prises à votre place.
- **Effets de cartes** : ce sont des données sérialisables (`engine/src/dsl.ts`), jamais du code stocké dans l'état.
- **Règle 400.7** : un objet qui change de zone reçoit un nouvel identifiant (`id`). L'identifiant `uid`, lui, suit la carte physique pour les animations.
- **N joueurs** : priorité en tour de table, ordre APNAP, un défenseur par attaquant (joueur ou planeswalker), élimination d'un joueur (800.4a), mulligan gratuit à trois joueurs ou plus.
- **Commander** (903) : commandants désignés par leur identité physique, zone de commandement (taxe, éminence), retour demandé au propriétaire, blessures de commandant, identité de couleur.
- **Boucles** (104.4b) : une boucle d'actions obligatoires est nulle, y compris une boucle qui accumule des jetons ou des déclenchements.
- **Choix génériques** (`choices.ts`) : toute question passe par une `ChoiceRequest` (choisir, ordonner, oui/non, nombre, répartir) avec une réponse suggérée. Une résolution peut être suspendue sur un choix puis reprise ; les valeurs intermédiaires (« si vous le faites ») sont mémorisées dans la résolution.
- **Capacités déclenchées** (`triggers.ts`) :
  - détectées au moment de l'événement, avec regard en arrière pour les morts simultanées ;
  - mises sur la pile en APNAP ;
  - les conditions « si… » sont revérifiées à la résolution ;
  - sont aussi gérées : les capacités modales, « une fois par tour », les capacités retardées et réflexives, et les emblèmes.
- **Couches** (`layers.ts`) :
  - caractéristiques calculées couche par couche (4 à 7) : types, couleurs, capacités accordées ou perdues, F/E ;
  - capacités statiques, y compris sur « la créature équipée ou enchantée » ;
  - résultat mis en cache par version d'état ; le fuzz vérifie le cache.
- **Pile** : sorts et capacités ciblables, contresorts, garde (ward), « ne peut pas être contrecarré ».
- **Attachements** : Auras (ciblées au lancement), Équipements (« Équiper » lu dans le texte), actions basées sur l'état 704.5m–n.
- **Planeswalkers** : loyauté, capacités de loyauté (une par tour), attaque des planeswalkers, emblèmes.
- **Remplacements et prévention** (`replacement.ts`) et **coûts** (`mana.ts`, `stack.ts`) :
  - remplacements : exil à la place de mourir, arrivée engagée ou avec marqueurs (y compris imposée par un autre permanent), prévention ;
  - remplacements d'événements chiffrés en données (`eventReplacement`, 616.1) : blessures, perte et gain de PV, pioche, meule, marqueurs, jetons, mana et dégagement (« autant plus N », « le double », prévention, boucliers « la prochaine fois que »), dans l'ordre le plus favorable au joueur affecté ;
  - coûts : hybride, coûts additionnels, flashback, réductions, sacrifice ou marqueurs comme coût, activation depuis le cimetière.
- **Cartes à plusieurs faces** : aventures et présages, recto-verso (transformation, faces modales, Sagas au verso), cartes scindées et Salles, assemblage ; Sagas, Classes et Affaires ; cartes face cachée (déguisement, cape, manifestation), invisibles pour l'adversaire.
- **Mécaniques d'extensions** : entre autres, préparé (FRA), distorsion et station (EOE), vitesse, exhaust et Véhicules (DFT), plot, spree et crimes (OTJ), job select et tiered (FIN), Salles, manifestation effroyable, Sinistre, Survie, Délire et Imminence (DSK), Progéniture, Cadeau, Fourrager, Dépense, Vaillance et Saisons (BLB), endurance, rafale, renouveau et présages (TDM), flétrir, Vivid, changelin, contempler, flétrissure et conspiration (ECL), éminence, myriade, annihilateur, exhumation, victime et nombres choisis secrètement (Commander), Rôles, Célébration, Aventures et Marchandage (WOE), Repartee, Infusion, Opus, Increment, cascade et miracle (SOS), suspect, déguisement, cape et réunir des preuves (MKM), maîtrise de l'eau, de la terre, du feu et de l'air et présage (TLA), montée en puissance, travail d'équipe, improvisation et marqueurs de bouclier (MSH), Web-slinging, chaos, émeute et créatures modifiées (SPM), faufilement, Mutagène, Alliance et Disparition (TMT), Storied, recrutement et marqueurs d'affûtage (HOB). Le détail par extension est dans `docs/extensions/`.
- **Performance** : `submit` copie l'état puis le mute (pas d'Immer) ; les simulations de l'IA utilisent `applyMutable` sur une copie de travail.

## Ajouter une carte

Les caractéristiques d'une carte (coût, types, F/E, mots-clés, loyauté, garde, « Équiper », cycle, chapitres de Saga…) viennent de Scryfall. Une créature « vanilla » ou « french vanilla » fonctionne donc sans script. Sinon, on décrit son comportement dans `packages/cards/src/<ext>/*.ts` :

```ts
"Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
```

Chaque carte gérée est automatiquement jouée par le test de fumée (`packages/ai/test/smoke/`, un fichier par extension). Les mécaniques nouvelles ont en plus un test de règles (`packages/engine/test/<ext>.test.ts`). Pour une mécanique qui manque au moteur, `docs/moteur.md` indique où toucher.

**Ajouter une extension :**
1. `npm run coverage -- --set <EXT> --text` donne les textes des cartes restantes.
2. Écrire les scripts par lots (A : cartes simples ; B : mécaniques phares ; C et suivants : cartes uniques), avec `npm run verify -- --set <EXT>` puis un commit par lot. Chaque lot ajoute ses tests de règles (`engine/test/<ext>.test.ts`) et suit les règles de CLAUDE.md (pas de nouveau drapeau propre à une carte, remplacements en `eventReplacement`).
3. Terminer par `npm run verify -- --full`.

## État

| Étape | Contenu | État |
|---|---|---|
| 1. Fondations | monorepo, TS strict, Biome, Vitest, import Scryfall FDN | ✅ |
| 2. Noyau du moteur | tours et phases, priorité et pile, mana, combat et mots-clés, actions basées sur l'état, mulligan de Londres, X, kicker, sorts modaux, capacités activées, jetons | ✅ |
| 3. Client contre l'IA | plateau façon MTGA (créatures devant ; terrains, puis artefacts, puis enchantements derrière ; zone des planeswalkers à part, tout à droite ; attachements et cartes exilées sur leur hôte ; exil consultable ; piles de jetons « ×N » ; lignes multiples et taille des cartes adaptées à la place), main en éventail, glisser-déposer, flèches, barre des phases et arrêts, autopilot, journal FR | ✅ |
| 4a. Fondations du moteur | N joueurs, choix génériques, déclencheurs, couches, remplacements, coûts, performance | ✅ |
| 4b. Deckbuilder | collection filtrable, deck et réserve, validation 60/4/15 (Standard, Sans limite) et Commander (100 cartes, commandant, identité, Game Changers), import et export de decklists (MTGA, MTGO, Moxfield, noms FR), illustrations au choix, persistance | ✅ |
| 4c. FDN, set principal (n° 1 à 281) | lots A (longue traîne) à F (mécaniques uniques : permissions de lancement, doublements, protection, choix en arrivant, mana restreint, copie de sorts…) | ✅ **276 / 276** |
| 4d. FDN, réimpressions (n° 282 et plus) | cartes des decks d'initiation et de la Starter Collection | ✅ **241 / 241** (517 / 517 pour tout FDN) |
| 4e. Légalité Standard | légalités Scryfall importées, liste des bannies, validation du format dans le deckbuilder | ✅ |
| 4f. Cartes à plusieurs faces | aventures, recto-verso, cartes scindées et Salles, Sagas, Classes, Affaires, face cachée, assemblage | ✅ |
| 4g. Autres extensions Standard | une extension à la fois : Reality Fracture ✅, Edge of Eternities ✅, Aetherdrift ✅, Outlaws of Thunder Junction + The Big Score ✅, Final Fantasy ✅, Duskmourn ✅, Bloomburrow ✅, The Lost Caverns of Ixalan ✅, Tarkir: Dragonstorm ✅, Lorwyn Eclipsed ✅, Wilds of Eldraine ✅, Secrets of Strixhaven ✅, Murders at Karlov Manor ✅, Avatar: The Last Airbender ✅, Marvel Super Heroes ✅, Marvel's Spider-Man ✅, Teenage Mutant Ninja Turtles ✅, The Hobbit ✅ : tout le Standard est couvert | ✅ |
| 5. IA | trois niveaux au choix (débutant, moyen, élevé) ; évaluation sur les caractéristiques durables ; attaques et blocages par simulation ; ISMCTS en duel (déterminisation de l'information cachée), budget en temps ; tournoi d'IA (`npm run arena`) ; guide : docs/ia.md | ✅ |
| 6. JcJ en ligne | de 2 à 4 joueurs (Standard, Sans limite, Commander), sièges IA : serveur Node `ws` (`GameHost`, vues et faces filtrées), code de salon, corde, reconnexion, reprise après redémarrage, revanche, BO3 en duel | ✅ ; déploiement pm2 + nginx documenté |
| 7. Finitions | effets sonores ✅ ; tablette et téléphone ✅ ; relais des images Scryfall ✅ ; replays (graine + décisions) ✅ ; images des jetons ✅ ; tutoriel ✅ ; musique | en cours |
| 8. Commander | règles du format, de 2 à 4 joueurs, contre l'IA et en ligne ; decks ajoutés un par un (12 préconstruits, 653 cartes propres au Commander) | ✅ en cours d'enrichissement |

Le suivi (état, conventions, pièges) est dans [CLAUDE.md](CLAUDE.md), l'historique dans [docs/historique.md](docs/historique.md), les plans dans [docs/plans/](docs/plans/) (le dernier : [PLAN-E.md](docs/plans/PLAN-E.md), le Commander). Les approximations connues sont dans [docs/approximations.md](docs/approximations.md), et le détail de chaque extension dans [docs/extensions/](docs/extensions/).

## Cadre légal

Le code du projet est sous licence [MIT](LICENSE). Elle ne couvre pas ce qui appartient à Wizards of the Coast (noms, textes et illustrations des cartes, symboles de mana, marques) ni les données et images de Scryfall.

Projet de fan gratuit et non commercial ([Fan Content Policy](https://company.wizards.com/fancontentpolicy) de Wizards of the Coast). Les images restent hébergées par Scryfall et ne sont pas copiées dans le dépôt. Le relais du serveur les transmet telles quelles, sans les stocker ailleurs que dans le cache de nginx. Les effets sonores sont des packs de [Kenney](https://www.kenney.nl) sous licence CC0 (`packages/client/public/sounds/LICENSE-kenney.txt`).
