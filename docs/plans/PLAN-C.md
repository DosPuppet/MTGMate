# Plan C — consolidation après la couverture du Standard

Plan établi le 02/10/2026 (branche `dev`) : il sert de feuille de route aux prochaines sessions. Il détaille et ordonne la feuille de route de `docs/audits/2026-10-02.md` (§ 12). Les renvois B1, J1, § 5.2… désignent les constats de cet audit.

## Suivi

- **02/10/2026 :** plan écrit. L'utilisateur demande de l'exécuter, lot par lot, dans l'ordre.
- **02/10/2026 : C0 fait** (sans changement de règles) : CLAUDE.md allégé (250 → 120 lignes ; historique dans `docs/historique.md`), README, `moteur.md` (fichiers manquants, plafonds), PLAN-R (« Reporté »), PLAN-P4 archivé, `approximations.md` (2 entrées périmées retirées, entrées générales regroupées, mana restreint, choix en arrivant, Doomsday Excruciator, Ordeal of Nylea, Eriette), en-têtes et commentaires périmés, 3 scripts morts retirés (Banishing Light d'EOE, Fake Your Own Death et Snakeskin Veil d'OTJ).
- **02/10/2026 : C1 fait** (sans changement de règles) : garde-fou de la dette élargi (`debtSurface.ts` : analyseur des types du moteur, le paquet `typescript` 7 n'ayant pas d'API de compilateur) : 98 propriétés d'une seule carte, 14 champs « ce tour-ci », 1 nom de carte dans le code, plafonds de 21 surfaces, cycle d'imports de 21 fichiers ; plafonds de sécurité réunis dans `limits.ts`, événement `capReached` au journal, compté par le fuzz ; collecteur d'événements sorti dans `events.ts`. **Écart au plan :** une coupure ne fait pas échouer le fuzz (certaines sont des approximations connues, comme les doubleurs de jetons qui se multiplient) ; elle est comptée (« plafonds atteints ») ; 3 tests (`limits.test.ts`).

## Décisions et ordre

- **Lots :** un commit par lot (ou par sous-lot), sur `dev`, à la demande de l'utilisateur.
- **Lots marqués [règles] :** ils changent le comportement du moteur. Chacun :
  - fait avancer `RULES_VERSION` (`engine/src/record.ts`, avec une ligne d'historique) ;
  - ajoute un test de règles par écart corrigé (`engine/test/rulings.test.ts`, ou le fichier de l'extension) ;
  - retire ou corrige l'entrée correspondante de `docs/approximations.md` ;
  - ne régénère que les parties dorées qui divergent (après C2).
- **Lots sans changement de règles (C7, C10, C20, refactorisations) :** les parties dorées doivent se rejouer **à l'identique sans** changer `RULES_VERSION`. C'est la preuve qu'ils ne changent rien.
- **Ce fichier est tenu à jour à chaque lot :** colonne « État », ligne de suivi, section du lot marquée ✅ avec ce qui a été fait et les écarts au prévu.
- **Pas de nouvelle fonction** (format, mode de jeu, extension hors Standard) avant la fin de C9, sauf demande contraire de l'utilisateur.

| # | Lot | Audit | Dépend de | Taille | État |
|---|---|---|---|---|---|
| 1 | C0 : documentation et nettoyage | § 4.2, § 10 | — | S | ✅ |
| 2 | C1 : garde-fous (dette élargie, plafonds) | § 5.1, § 5.4, § 5.6 | C0 | M | ✅ |
| 3 | C2 : vérification qui détecte | § 6 | — | M | |
| 4 | C3 : plateforme, correctifs rapides | B5, B6, § 7 | — | S | |
| 5 | C4 : [règles] exigences de blocage | B1 | C2 | M | |
| 6 | C5 : [règles] mana marqué | B2 | C2 | S/M | |
| 7 | C6 : information cachée | B3, B4 | C2 | M | |
| 8 | C7 : couche des coûts (sans changement de règles) | § 5.2 | C2 | L | |
| 9 | C8a, C8b, C8c : [règles] coûts choisis par le joueur | J1 | C7, C3 | 3 × M | |
| 10 | C9 : [règles] choix en arrivant | J2 | C7 | M | |
| 11 | C10 : évaluateur unique | § 5.3 | C2 | M | |
| 12 | C11 : [règles] caractéristiques des sorts | § 5.5 | C1 | M | |
| 13 | C12 : [règles] approximations groupées | § 4.2, § 4.3 | C10 | M/L | |
| 14 | C13 : justesse des cartes | § 4.5 | C2 | L, continu | |
| 15 | C14 : dette ciblée | § 5.1, § 5.7 | C1 | S/M | |
| 16 | C15 : performances | § 5.8 | C10, C11 | M | |
| 17 | C16 : serveur et exploitation | § 7 | C3 | M | |
| 18 | C17 : IA | § 8 | C8, C9 | M | |
| 19 | C18 : interface | § 9 | C7 | M/L | |
| 20 | C19 : données | § 7 | — | S | |
| 21 | C20 (facultatif) : découpage de `stack.ts` | § 5.2 | C7 à C12 | M | |

**Ordre recommandé :**
1. C0 à C3 : fondations, sans changement de règles. Ils peuvent se faire ensemble.
2. C4 à C6 : bugs réels. C4 passe en premier si un blocage figé est signalé en ligne ; il ne dépend de rien.
3. C7 à C9 : choix rendus au joueur, le plus gros gain en partie.
4. C10 à C15 : architecture et dette. C13 se mène en continu, en parallèle.
5. C16 à C19 : selon les priorités de l'utilisateur (ouverture publique du serveur, ergonomie, IA).

**Déploiements :** grouper les lots [règles] C4, C5 et C9 dans une même mise en production. Chaque changement de `RULES_VERSION` peut interrompre les parties en ligne et rendre impossibles à reprendre les sauvegardes locales.

## C0 — Documentation et nettoyage

- **CLAUDE.md allégé** (objectif : moins de 150 lignes) :
  - l'historique d'« Avancement » et de « Suite du travail » part dans `docs/historique.md`, et CLAUDE.md n'en garde qu'un résumé de trois lignes ;
  - les affirmations périmées sont corrigées (audit, § 10) ;
  - les durées de `verify` sont alignées sur `tools/verify.ts` ;
  - les chiffres de la dette sont remplacés par un renvoi à `debt-baseline.json`.
- **README :** jeu en ligne, cartes « bientôt », jalon 4g, total 5 161 et 13 bannies, durées.
- **`docs/moteur.md` :**
  - ajouter `record.ts`, `fingerprint.ts`, `choices.ts` et `autopilot.ts` ;
  - ajouter une section « Plafonds », qui renverra à `limits.ts` après C1.
- **`docs/plans/PLAN-R.md` :** liste « Reporté » mise à jour (« doit bloquer » en partie, vue 722 et boucliers 615.7 faits).
- **`docs/plans/PLAN-P4.md` :** bannière « Archivé ».
- **`docs/approximations.md` :**
  - retirer les entrées périmées (faufilement, Web-slinging) et corriger « mana restreint » ;
  - regrouper sous « Générales » les entrées de portée générale rangées parmi les cartes, et les trois entrées de la fin ;
  - corriger le renvoi « plus haut » ;
  - préciser l'entrée « choix en arrivant » : les terrains joués sont concernés (Cavern of Souls), en attendant C9 ;
  - ajouter Doomsday Excruciator, en attendant C6.
- **Code :**
  - en-têtes « L'extension n'est pas encore couverte » des neuf `cards.ts` ;
  - commentaires périmés d'ECL ;
  - en-tête de `engine/test/hob.test.ts` ;
  - les trois scripts morts masqués par FDN : supprimés, ou commentés comme tels.
- **`cards/data/audit-baseline.json` :** raisons complètes pour Ordeal of Nylea et Eriette (en attendant C12).
- **Vérification :** `npm run verify -- --ci` ; lecture croisée de CLAUDE.md et du README.

## C1 — Garde-fous : dette élargie, plafonds

**Garde-fou de la dette élargi** (`cards/test/debt.test.ts`, `cards/data/debt-baseline.json`). Quatre nouvelles sections dans la référence :

- **`ceilings` :** nombre de champs ou de sortes par surface.
  - Surfaces : `CardDef`, `GameObject`, `StackItem`, `ObjectFilter`, `Amount`, `Condition`, `Ref`, `TriggerSpec`, `CostDef`, `CastPermissionAbilityDef`, `PlayFromZone`, `LayerMods`, et le total des paramètres des opérations d'effet.
  - Le test échoue au-dessus du plafond, et aussi en dessous (« baissez le plafond »), comme pour les entrées périmées aujourd'hui.
  - Comptage par l'API du compilateur TypeScript, et non par expressions régulières : les unions sont devenues trop grandes.
- **`singleCardKeys` :** propriétés (à toute profondeur d'une `CardDef`) utilisées par une seule carte implémentée, chacune avec sa raison et sa famille cible.
  - Environ 135 aujourd'hui.
  - Même parcours que pour les opérations (`implementedCards()`).
- **`turnFields` :** champs de `GameObject` qui comptent « ce tour-ci » (`tapTurn`, `tapsThisTurn`, `countersPutTurn`, `dealtDamageTurn`…). Cette liste ne peut que baisser ; leur cible est le journal du tour.
- **`engineCardLiterals` :** chaînes du code de `engine/src` (commentaires exclus) égales à un nom de carte, comme « Leyline of Mutation ». Les commentaires restent libres : ils documentent.
- **`importCycleMax` :** taille du plus grand cycle d'imports du moteur (21 aujourd'hui). Il ne peut que baisser.

Mettre à jour la règle de fin de CLAUDE.md : toute nouvelle surface propre à une carte se justifie dans la référence.

**Plafonds : `engine/src/limits.ts`.**
- Il réunit toutes les constantes : étapes, passes d'actions basées sur l'état, boucle obligatoire, décisions automatiques, jetons, montant, permutations, passes de couches. `millWhileShared` est retiré (inutile).
- `capReached(s, nom)` émet un événement de journal (« Plafond de sécurité atteint : … ») et note le plafond dans `s.capHits`, un champ hors empreinte, initialisé dans `game.ts`.
- **Fuzz :** les coupures sont comptées et affichées (« plafonds atteints ») ; elles ne font pas échouer la série, certaines étant des approximations connues. Les gardes de boucle restent permises (partie nulle).
- Section « Plafonds » de `docs/moteur.md` ; l'entrée d'`approximations.md` renvoie à `limits.ts`.

**Vérification :** `npm run verify -- --ci`. Sans changement de règles : les parties dorées se rejouent à l'identique.

## C2 — Vérification qui détecte

**Parties dorées détectrices** (`ai/test/golden.test.ts`, `tools/golden.ts`) :
- Une divergence n'est permise que si `RULES_VERSION > record.rules`. À version égale, une divergence est une erreur. Un lot sans changement de règles doit donc tout rejouer.
- `npm run golden -- --update` ne régénère que les parties qui divergent. Le message du commit dit lesquelles et pourquoi.
- Trois parties de plus :
  - avec des decks tirés des extensions récentes (TDM à HOB) ;
  - jouées par l'IA heuristique ;
  - sans plafond de 1 200 décisions, pour qu'elles aillent au bout.
- `golden.ts` quitte `ai/src` et son index pour `tools/`, ou une entrée `@mtgx/ai/golden` (voir aussi C3).

**Fuzz strict** (`ai/src/selfplay.ts`) :
- une option proposée par `legalActions` puis refusée, choix par défaut compris, fait échouer la partie au lieu d'`illegal++` ;
- invariant : `requiredBlocks` est toujours accepté (à activer avec C4).

**Decks du fuzz** (`tools/random-deck.ts`) : `--pool all` tire aussi terrains non basiques, incolores et cartes à trois couleurs ou plus. Base de mana assortie : terrains bicolores du pool.

**Aides de test communes** (`engine/test/helpers.ts`) :
- `settle`, `cast`, `activate`, `castable`, `lands`, `nameOf`, avec une seule signature chacune ;
- les dix fichiers d'extension récents les importent au lieu de les recopier.

**CI nocturne :** un pool d'extension par nuit, en rotation (`--pool <EXT>`).

**Vérification :** `npm run verify -- --full`. Les nouvelles parties dorées sont générées une fois et relues.

## C3 — Plateforme : correctifs rapides

- **Bundle :**
  - mesurer d'abord (`npm run build`, taille de `game.worker-*.js`) ;
  - retirer `golden.ts` de l'index de `@mtgx/ai` (fait avec C2) ;
  - déclarer `@mtgx/cards` dans `ai/package.json` ;
  - ajouter `"sideEffects"` au `package.json` des paquets qui n'en ont pas ;
  - le worker ne doit plus contenir la base de cartes.
- **CI :** une étape `vite build` avec budget de taille (worker, chunk de l'application, chunk des cartes), qui échoue au-delà.
- **`deploy/update.sh` :** `/healthz` interrogé en boucle pendant 30 s au plus avant de conclure à l'échec.
- **Poignée de main de version :**
  - le client envoie sa version du protocole et `RULES_VERSION` à la connexion ;
  - en cas d'écart, le serveur répond par un message dédié, et le client propose de recharger la page (service worker mis à jour) ;
  - tests dans `server/test/online.test.ts`.
- **Vérification :** `npm run verify -- --ci`, `npm run build`, `npm run online-smoke` contre un serveur local.

## C4 — [règles] Exigences de blocage (509.1c, 509.1d)

Constat B1.

- **Exigences :** `blockRequirements(s, joueur)` renvoie la liste des exigences. Chacune est soit `{ attacker }` (doit être bloqué si possible), soit `{ blocker, attackers? }` (bloque si possible, ou bloque cet attaquant si possible).
  - Liste vide si une taxe de blocage s'applique : une exigence n'impose jamais de payer (509.1d).
- **Recherche du maximum :** `maxObeyed` cherche le nombre maximal d'exigences respectées par une déclaration légale.
  - Retour arrière limité aux créatures concernées : celles qui ont une règle « bloque », et celles qui peuvent bloquer un attaquant « doit être bloqué ».
  - Il respecte les restrictions (menace, nombre maximal de bloqueurs, « pas seule ») et élague.
  - Au-delà de 50 000 nœuds, repli glouton. Ce repli ne peut que sous-estimer le maximum, donc l'erreur est toujours indulgente.
  - Sans exigence (presque tous les combats), aucune recherche.
- **Application :**
  - `declareBlockers` ne refuse une déclaration que si elle respecte moins d'exigences que le maximum ; le message nomme une exigence non tenue ;
  - `requiredBlocks` renvoie la meilleure déclaration, légale par construction ; `fallbackDecision` (`engine/src/host.ts`) continue de s'en servir ;
  - l'IA : `withRequiredBlocks` (`ai/src/heuristic.ts`) devient `repairBlocks`, la même recherche qui part des blocages voulus par l'IA.
- **Tests** (`rulings.test.ts`) :
  - Tolsimir avec un attaquant « doit être bloqué » : les deux blocages seuls sont acceptés ;
  - deux créatures « bloque si possible » et un seul attaquant ;
  - un attaquant avec la menace qui doit être bloqué ;
  - une taxe de blocage lève toutes les exigences.
- **Invariant du fuzz :** `requiredBlocks` est accepté.
- **Vérification :** `npm run verify -- --set MKM` (Tolsimir, Fear of Being Hunted…), bench avant et après, `tutorial.test.ts`.

## C5 — [règles] Mana marqué

Constat B2.

- **Une seule liste :** `PlayerState.restrictedMana` devient `taggedMana: { type, restriction?, source, chosen?, rider? }[]`.
  - `chosen` est figé à la production (type choisi de Cavern of Souls).
  - Un engagement à la main d'une capacité qui a une restriction **ou** un cavalier ajoute des entrées marquées, y compris pour du mana non restreint qui porte un cavalier.
- **Dépense :** `allows()` lit `chosen` sur l'entrée. `payMana` rend la source et le cavalier de chaque entrée dépensée, et le code des cavaliers de `castSpell` (`uncounterable`, `copy`) ne change pas.
- **Offre :** `legal.ts` propose ces engagements, et l'interface peut garder ce mana en réserve. La réserve affichée distingue le mana marqué.
- **`approximations.md` :** les entrées « Mana restreint » et « Mana déclencheur » sont retirées.
- **Vérification :**
  - tests : Cavern engagée à la main puis dépensée pour un sort du type choisi, qui est « ne peut pas être contrecarré » ; mana marqué refusé pour un autre sort ;
  - `tutorial.test.ts` et `tutorial-smoke` (options de `legal.ts`) ;
  - `npm run verify -- --set LCI` puis `--set META`.

## C6 — Information cachée

Constats B3 et B4.

- **Exil face cachée :** `MoveSpec.faceDown?: "owner" | "none"` pose `GameObject.exiledFaceDown`.
  - `exileLibraryButBottom` (Doomsday Excruciator) et la prédiction utilisent `"owner"` ; complot et autres exils face visible inchangés.
  - Test structurel dans `cards/test/` : un texte Oracle qui contient « exile … face down » demande un script qui exile face cachée.
- **Vue :**
  - `projectView` montre l'exil face cachée d'un autre joueur comme une carte de main adverse, sans `defId` ;
  - `filterEvents` retire le `defId` des `moved` vers un exil face cachée, et de `foretold` pour les autres joueurs ;
  - `ExileViewer` affiche le dos de carte.
- **IA :** `determinize` (`ai/src/ismcts.ts`) redistribue aussi les cartes exilées face cachée et le `faceDown.card` des permanents face cachée adverses, tirés des cartes vues.
- **Tests :** `ai/test/hidden-info.test.ts`, étendu à l'exil face cachée, à `foretold`, aux permanents déguisés et à `determinize`.
- **[règles] ?** Seulement si l'empreinte (`outcomeHash`) lit le nouveau champ ; sinon pas de changement de version.
- **Vérification :** `npm run verify -- --set DSK`, `--set TDM` (prédiction), `--set MKM` (déguisement), `--ui` (visionneur d'exil).

## C7 — Couche des coûts (sans changement de règles)

Constat § 5.2. Prérequis de C8 : sans elle, chaque coût choisi ajouterait une branche à `castSpell`, à `activateAbility`, à `legal.ts` et à la machine de lancer du client.

**Nouveau module `engine/src/costs.ts`** (il n'importe pas `stack.ts`).
- **`costSpecs(…)`** rassemble les coûts en objets des six endroits où ils sont déclarés aujourd'hui : `ab.cost`, `additionalCost`, `kickerCost`, `altCostFor`, `CastTerms` (fourrager, retrait de marqueurs) et les coûts de flashback.
- **Un composant par sorte de coût :**
  ```ts
  CostComponent {
    slot; phase: "beforeMana" | "afterMana";
    offer(s, ctx, used): CostPick | null;      // ce qui est proposé
    resolve(s, ctx, picked?, used): ObjectId[]; // choix validé, ou défaut d'aujourd'hui ; RulesError sinon
    pay(s, ctx, picked): void;
  }
  CostPick { slot; label; min; max; options; suggested; repeat?; interchangeable? }
  ```
- **Champs de `legalActions` :** les champs actuels d'`ActionOption` (`additional`, `kickerPermanents`, `altBounce`, `kickerTap`…) sont produits à partir des offres. Le client ne change pas.
- **Ordre de paiement :** exactement celui d'aujourd'hui (`phase`). Les déclencheurs « chaque fois que vous sacrifiez » en dépendent.
- **Aides communes à `legal.ts` et `stack.ts`, qui suppriment le miroir écrit à la main :**
  - `abilityManaCost(s, joueur, source, capacité, cible | "best")`, en remplacement des deux réductions dupliquées ;
  - `castTiming(s, joueur, décision, termes)`, qui réunit le timing, le flash accordé et le faufilement ;
  - `kickerPayable`, `altPayable`.
- **Étapes,** chacune vérifiée par les parties dorées et le fuzz strict :
  1. capacités activées ;
  2. coûts additionnels des sorts et `autoAdditional` ;
  3. kicker non-mana ;
  4. aides de mana et de timing.
- **Client :** la machine de lancer (`store.ts`, `continueCasting`) est extraite dans `client/src/casting.ts`, en fonction pure `nextStage(c, option, réglages)` avec tests vitest. C'est le premier découpage de `store.ts`.
- **Vérification :** parties dorées identiques **sans** changement de `RULES_VERSION`, fuzz « chaos » et fuzz strict, bench avant et après (3 % de tolérance), `npm run verify -- --full`, tests d'interface.

## C8 — [règles] Coûts choisis par le joueur

Constat J1.

**Choix par la décision, et non par une `ChoiceRequest` :** les coûts sont payés à l'intérieur de `castSpell`, qui ne se suspend pas, et les champs `tap`, `sacrifice` et `bounce` de `CastChoices` font déjà ainsi.

- **Forme :** `CastChoices.picks?: Partial<Record<CostSlot, ObjectId[]>>`.
  - Les anciens champs gardent leur sens pour toujours (anciens enregistrements).
  - Donner à la fois un ancien champ et le même emplacement de `picks` lève une `RulesError`.
- **Sans choix, le défaut d'aujourd'hui,** calculé au même moment : les anciens enregistrements et les parties dorées se rejouent à l'identique.
- **Validation :** au paiement, par `resolve`. `submit` travaille sur une copie de l'état, donc une `RulesError` en cours de lancer ne laisse rien.
- **Client :** après les cibles, un sélecteur générique par `CostPick`, qui reprend `AdditionalCostPicker`. Il est sauté si le choix est forcé (pas plus d'options que le minimum), ou si les options sont interchangeables hors contrôle total.
- **IA :**
  - `randomAgent` remplit `picks` seulement sous une option du fuzz, pour que les parties dorées gardent les défauts ;
  - l'IA heuristique classe les options (la moins précieuse ; pour flétrir, d'abord une créature qui survit) ;
  - l'ISMCTS prend `suggested`.
- **Trois sous-lots,** précédés d'un classement des sites de choix automatique par nombre d'exemplaires dans le méta :
  - **C8a, cimetière :** réunir des preuves (kicker, coût alternatif, coût, X), exil de cartes du cimetière (X), kicker par exil, fourrager, coûts d'exil de symboles.
  - **C8b, permanents :** flétrir en coût de capacité et flétrir X, retrait de marqueurs (sur une créature ou parmi plusieurs), exil d'un autre permanent, renvoi d'un attaquant non bloqué (ninjutsu), sacrifice X, engagement X, et les choix d'`autoAdditional`.
    - Le défaut du kicker « flétrir » (Requiting Hex) est aligné sur `blightTarget` : c'est le seul changement de règles par défaut.
  - **C8c, paiement du mana :** convocation, improvisation, maîtrise de l'eau, cave. `picks.convoke` et `picks.delve` sont des contraintes de `solvePayment` : tous les objets choisis servent, sinon `RulesError`.
- **`approximations.md` :** l'entrée générale « flétrir en coût » et les entrées de famille (preuves, maîtrise de l'eau, fourrager…) sont retirées.
- **Vérification :**
  - `costs.test.ts` ;
  - fuzz « chaos » étendu aux choix corrompus (doublons, objets d'un autre joueur, trop peu d'objets) ;
  - parties dorées identiques avec l'option du fuzz désactivée ;
  - tournoi A/B de l'IA ;
  - tests d'interface (sélecteur).

## C9 — [règles] Choix en arrivant

Constat J2.

- **Une seule source pour les options :** le code des options, des suggestions et des libellés (`engine/src/ops/permanents.ts`) passe dans `engine/src/entryChoices.ts` : `enterChoiceRequest(s, joueur, defId) → ChoiceRequest | null` et `toChosen(sorte, valeur)`.
- **Terrain joué :** champ de décision, sur le modèle de `landType`.
  - `Decision.playLand.chosen?: string`. L'`ActionOption` du terrain porte `choose?: ChoiceRequest`, et la liste des types de créature est mise en cache par partie pour ne pas grossir la vue.
  - `playLand` valide la valeur et la passe dans `enters.chosen`. Sans valeur, repli sur `defaultChoice` (anciens enregistrements).
  - `landType` reste accepté. Multiversal Passage peut passer à `choose`.
  - Client : le `ChoicePrompt` existant devient une étape du jeu d'un terrain. IA : `suggested`.
- **Permanent mis en jeu pendant une résolution :** une `ChoiceRequest`, sur le modèle de Clone et des Auras (opération `move`, `engine/src/ops/zones.ts`).
  - Le bloc existant devient `askEntryChoices(s, r, ctx, clé, objets, qui)`, qui couvre copie, hôte et `chooseOnEnter`.
  - Il est appelé par toutes les opérations qui mettent en jeu.
  - Intention `chooseOnEnter`, `autoOk: false`.
- **Le reste** (actions basées sur l'état, retours d'exil lié, ninjutsu et faufilement) garde `defaultChoice`. L'entrée d'`approximations.md` est réduite à ces cas.
- **Vérification :** test de Cavern of Souls jouée avec un type choisi, sans poser `chosen` à la main ; les 13 terrains ; `tutorial.test.ts` (les options de terrain changent) ; `npm run verify -- --set META` et `--set LCI`.

## C10 — Évaluateur unique (sans changement de règles)

Constat § 5.3.

- **Contexte d'évaluation unique :** `evalContext({ controller, sourceId?, event?, eventObject?, entry? })` remplace les contextes faits à la main : `checkAmount` (`triggers.ts`), `reductionContext` (`stack.ts`), la taille maximale de main (`turn.ts`) et `conditionAtEntry` (`replacement.ts`).
- **Conditions :** `checkCondition` devient une simple enveloppe d'`evalCondition`. Les 13 sortes écrites deux fois n'ont plus qu'une écriture.
- **Montants :** une table de traitements par sorte, comme `ops/*`, à la place du `switch` de 369 lignes d'`evalAmount`.
- **`cdaValue` reste à part,** parce qu'il lit les types imprimés ou provisoires pendant le calcul des couches. Mais :
  - son repli devient une erreur (`assertNever` ou exception en développement) ;
  - un test des cartes vérifie que chaque sorte d'`Amount` utilisée dans une F/E variable est prise en charge.
- **Migration en trois temps :**
  1. nouveau chemin, et, sous `MTGX_SHADOW_EVAL=1`, le fuzz évalue l'ancien et le nouveau et échoue sur la moindre différence ;
  2. bascule vers le nouveau chemin ;
  3. suppression de l'ancien.
- **Vérification :** parties dorées identiques sans changement de version, fuzz en double évaluation sur tout le pool, bench avant et après.

## C11 — [règles] Caractéristiques des sorts

Constat § 5.5. Il ne s'agit pas de vraies couches hors du champ de bataille : c'est jugé plus coûteux qu'utile (voir « Ce qu'on ne fait pas »).

- **`spellChars(s, joueur, carte, zone)`** = vue du sort plus les mots-clés accordés par des statiques (`playerStatics(…, "spellKeywords")`) qui le visent.
- **Utilisé par :** le timing (flash), la convocation, l'improvisation, la cave, le second partagé sur la pile, et `chars()` quand l'objet est sur la pile.
- **Drapeaux convertis en entrées `spellKeywords` :** `flashFor`, `convokeCreatureSpells`, `delveSpells`, `splitSecondInstantsSorceries`, soit 4 drapeaux de moins dans la référence de la dette.
- **`grantWarp` et `jaceLoyaltyInstant`** restent une dette justifiée, ou vont en C14.
- **Approximations levées :** Leyline of Transformation, Heartflame Duelist, Prismari, Lorehold (à confirmer une à une).
- **Vérification :** tests de règles des cartes concernées (environ 19), bench, `npm run verify -- --full`.

## C12 — [règles] Approximations groupées

Constats § 4.2 et § 4.3. Un sous-lot par groupe, dans cet ordre :

1. **Levées immédiates :** The Earth Crystal, Pyrewood Gearhulk, Chandra (+1), Boommobile, défausses en coût (Hallway Heckler, Solitary Cell, Murmuring Volume, Thunderhead Gunner, Avishkar Raceway) ; Ordeal of Nylea (« quand vous la sacrifiez » par tout moyen).
2. **Déclencheurs « un ou plusieurs » :**
   - un déclencheur par lot d'événements simultanés, en réutilisant les lots de `triggers.ts` (`batchBefore`, `enterBatch`) ;
   - 74 cartes ont la formule, dont 16 du méta ;
   - un test par forme : arrivée, mort, marqueurs, blessures.
3. **Choix à la résolution sans cible** (environ 15) : `ChoiceRequest` au lieu d'une cible déguisée.
4. **« N manas en n'importe quelle combinaison de couleurs »** (8).
5. **« Engagez N créatures dégagées », la source comprise** (9), sur la couche des coûts (C7).
6. **Joueur qui a posé les marqueurs** (9) : champ de l'événement de marqueurs, lu par les déclencheurs.
7. **Eriette, the Beguiler :** contrôle par un effet horodaté (couche 2) au lieu d'une statique liée à Eriette.

**Vérification :** chaque entrée levée disparaît d'`approximations.md` et reçoit un test ; `npm run verify -- --set <EXT>` des extensions touchées, puis `--full`.

## C13 — Justesse des cartes (continu)

Constat § 4.5.

1. **Cartes du méta jamais testées** (124, 41 % des exemplaires) : un test de règles par carte, qui vérifie le texte Oracle, dans le fichier de son extension. Ordre : nombre d'exemplaires (Duress, Starting Town, Seam Rip, Shoot the Sheriff…).
2. **Extensions d'avant R7 et TDM** (FDN, FRA, EOE, DFT, OTJ, BIG, FIN, DSK, BLB, LCI, TDM) : rares et mythiques d'abord, puis les cartes aux effets non triviaux. Objectif : au moins 50 % des cartes nommées dans un titre de test par extension.
3. **Attentes de l'Oracle :** clauses pour les formes récurrentes d'ECL à HOB (`clause` dans `oracle-expectations.test.ts`).
4. **Audit Oracle ↔ script étendu aux statiques :** nombre de capacités statiques et mots-clés de l'Oracle face au script.
5. **Outil de suivi :** `npm run coverage -- --tests` donne, par extension, la part des cartes nommées dans un test (méthode de l'audit), pour que le compte rendu de chaque lot la cite.

Tout écart trouvé est corrigé, ou documenté comme approximation. Jamais de test qui fige un comportement faux.

## C14 — Dette ciblée

Constats § 5.1 et § 5.7.

- **Chemin chaud d'abord :** Masamune et Cloud dans `detectTriggers` passent dans la famille `triggerMod` (doublement des déclencheurs de mort et des déclencheurs quand équipé).
- **Traitements au nom d'une carte vers des familles,** ou entrée justifiée dans la référence : `hellkite`, `tripleTriad`, `graveyardCreatureOnce`, `jaceLoyaltyInstant`, `valgavothLinked`.
- **Libellé de Leyline :** le libellé du coût alternatif vient de la carte qui l'accorde.
- **Listes dupliquées :** `BASIC_LAND_TYPES` et `PERMANENT_TYPES` dans `types.ts`, importées partout.
- **Champs « ce tour-ci » de `GameObject`** vers le journal du tour (`turnlog.ts`) quand la requête existe ; la liste `turnFields` de C1 baisse d'autant.
- **`consumePlayerEffect` fait un `bump`,** comme `consumeReplacement`.
- **Vérification :** référence de la dette en baisse, parties dorées identiques (sauf [règles] annoncé), bench.

## C15 — Performances

Constat § 5.8.

- **Mesure d'abord :** bench avant et après chaque changement, coup sur coup (`git stash`), médiane de trois passes, sur secteur.
- **Index :**
  - `playerStatics` indexé par clé et par version ;
  - `liveSources` mis en cache par version ;
  - `eventReplacements` indexé par sorte d'événement.
- **`bump` ciblé :** la pioche et les PV ne font avancer la version que si une statique en dépend (index des dépendances calculé à la collecte des statiques).
- **Critère :** gain mesuré sur l'IA heuristique à 4 joueurs et l'IA élevée ; pas de cible absolue sous WSL.

## C16 — Serveur et exploitation

Constat § 7.

- **Mémoire :**
  - mesurer la mémoire par salon (test de charge local : 50 puis 200 salons) ;
  - ajuster `maxRooms` et `max_memory_restart` ;
  - empêcher la boucle de redémarrages (reprise des salons étalée, ou plafond de salons repris).
- **Serveur compilé** (bundle Node), sans `tsx` en production ; `npm ci --omit=dev` sur le VPS.
- **Sécurité :**
  - jetons de reconnexion hachés dans `data/rooms`, fichiers en 600 ;
  - CSP et HSTS ;
  - limites par /64 en IPv6 ;
  - `/healthz` privé (`127.0.0.1`), avec version, `RULES_VERSION`, mémoire et nombre de salons.
- **Reprise :**
  - `interrupted` persisté ;
  - nettoyage des `.bad` et `.rules<N>` de plus de 7 jours ;
  - salons repris comptés dans le plafond par adresse ;
  - `tools/rooms-check.ts` : rejouer une copie de `data/rooms` avec le nouveau moteur et compter les salons qui seraient interrompus, avant chaque déploiement [règles].
- **Exploitation :**
  - sauvegarde de `data/rooms` avant chaque mise à jour, et procédure de retour arrière dans `docs/deploiement.md` ;
  - rotation des journaux pm2.
- **Reprise locale :** comparaison à chaque décision et non aux seuls points de contrôle, si le coût le permet ; une carte inconnue donne le message « Partie impossible à reprendre » au lieu d'un blocage.
- **Vérification :** `server/test`, `npm run online-smoke`, test de charge, `npm run verify -- --full`.

## C17 — IA

Constat § 8.

- **Tournoi sur tout le pool** et sur le méta (600 parties ou plus), consigné dans `docs/ia.md` : c'est la nouvelle référence.
- **Choix :**
  - répartition des blessures (létal d'abord), choix multiples (`pickCards`, recherche, regard, piles, prolifération) par classement des options ;
  - ordre des déclencheurs par une vraie valeur (simulation courte ou heuristique de la capacité) ;
  - coûts choisis (après C8) et choix en arrivant (après C9).
- **Mulligan :** courbe de mana en plus des couleurs.
- **Multijoueur :** attaques réparties selon la menace, et pas seulement vers l'adversaire qui a le moins de PV.
- **Vérification :** tournoi A/B à graines appariées, `npm run ai-smoke`.

## C18 — Interface

Constat § 9, dans cet ordre :

1. perte de PV au journal, noms de cartes du journal survolables (aperçu) ;
2. passer jusqu'à son tour pendant le tour adverse ;
3. aperçu à la souris sous 1 100 px (près de la carte) ;
4. ordre de ses déclencheurs et répartition des blessures proposés hors contrôle total quand le choix compte (suggestion préremplie) ;
5. choix des terrains au paiement, choix de l'hybride ;
6. menace signalée pendant la déclaration ; létal du piétinement contrôlé ; « Attaquer avec tous » vers le défenseur choisi ;
7. regard et surveillance par glisser (dessus, dessous, cimetière) ; carte source dans les questions oui / non ; modes illustrés ;
8. libellés de toutes les sortes de marqueurs ;
9. `Card` mémoïsé, abonnements resserrés ;
10. accessibilité : `rem`, formes en plus des couleurs pour les surbrillances, règles d'accessibilité de Biome réactivées une à une.

**Vérification :** tests d'interface (`--ui`), script Playwright ponctuel avec captures pour chaque nouveauté visible, `mobile-smoke`.

## C19 — Données

Constat § 7 (données).

- **Registre unique des extensions :** `cards/src/sets.ts`, lu par `tools/import-scryfall.ts` et `tools/import-tokens.ts`.
- **Légalités :**
  - fichier de dérogations (`cards/data/legality-overrides.json`) pour un bannissement annoncé avant le réimport ;
  - tâche planifiée en CI (hebdomadaire) qui compare les légalités à Scryfall et échoue en cas d'écart ;
  - liste des bannies du README générée.
- **Noms français :** rapprochement par `oracle_id` au lieu du numéro de collection (FDN 565 à 727) ; vérifier si Scryfall a des données françaises pour FRA.
- **Vérification :** réimport à blanc (diff des JSON), `decklist.test.ts`.

## C20 — (facultatif) Découpage de `stack.ts`

Constat § 5.2. Après C7 à C12, si `stack.ts` dépasse encore 2 000 lignes :
- découper en `castTerms.ts` (permissions et timing), `cast.ts` (lancer), `activate.ts` (activer), `resolve.ts` (résoudre, contrecarrer), `lands.ts` (jouer un terrain) ;
- sans changement de règles, avec les parties dorées identiques ;
- `importCycleMax` (C1) doit baisser.

## Ce qu'on ne fait pas (coût supérieur au gain)

- **Vraies couches 613 hors du champ de bataille :** C11 couvre les cas du pool à moindre coût.
- **Casser d'un coup le cycle d'imports :** le garde-fou de C1 l'empêche de grandir ; il baissera avec C7, C10 et C20.
- **Découper tout `store.ts` :** seule la machine de lancer sort (C7). Le reste suivra les besoins de C18.
- **Viser 5 000 décisions/s sous WSL :** on juge avant et après.
- **Retirer les noms de cartes des commentaires du moteur :** ils documentent. Seuls les littéraux du code sont surveillés.
- **Renommer les champs actuels de `CastChoices` :** ils restent valables pour les anciens enregistrements.
- **Règles reportées sans carte du pool :** bloquer plusieurs attaquants, batailles, phasing, couche 3, raccourcis de boucles. Elles attendent une carte qui les exige.
- **Commander, Limité, formats éternels.**

## Risques

- **Parties en ligne et sauvegardes locales :**
  - chaque changement de `RULES_VERSION` peut interrompre les parties en cours et rendre impossibles à reprendre les sauvegardes locales ;
  - grouper les lots [règles] d'un même déploiement ;
  - lancer `tools/rooms-check.ts` (C16) avant de déployer ;
  - la poignée de main (C3) écarte les vieux clients.
- **Tutoriel :** C5 (engagements proposés), C8 (sélecteurs de coût) et C9 (options de terrain) changent ce que `legal.ts` propose. Relancer `client/test/tutorial.test.ts` et `npm run tutorial-smoke` à chacun.
- **IA :** C4, C6, C8, C9 et C11 changent ses options ou ses simulations. Tournoi A/B à graines appariées (400 parties ou plus) et `ai-smoke`.
- **Performances :**
  - C4 ne cherche que s'il y a des exigences ;
  - C7 ajoute une indirection dans `legalActions`, sur le chemin chaud de l'IA ;
  - bench A/B pour C4, C7, C10, C11 et C15 (3 % de tolérance, médiane de trois passes).
- **Information cachée :** tout nouvel événement ou champ de vue passe par `filterEvents` et `projectView`, et `hidden-info.test.ts` le couvre.
- **Taille de la vue :** la liste des types de créature (C9) et les offres de coût (C7, C8) grossissent `ActionOption`. Mise en cache, et taille des messages en ligne surveillée.

## Vérification de chaque lot

- **Chaque lot :** `npm run verify -- --set <EXT>` (ou `--set META`) pour les extensions touchées ; `npm run verify -- --full` à la fin d'une série (C0 à C3, C4 à C6, C7 à C9…).
- **Lots [règles] :** un test par écart corrigé ; `RULES_VERSION` avancée ; seules les parties dorées qui divergent sont régénérées, et le commit le dit.
- **Lots sans changement de règles :** parties dorées identiques sans changer de version, fuzz « chaos » et fuzz strict.
- **Compte rendu de lot :**
  - nombre de tests ajoutés ;
  - écarts trouvés ;
  - entrées d'`approximations.md` retirées ou ajoutées ;
  - évolution de la référence de la dette (C1) ;
  - bench si le lot touche un chemin chaud.
