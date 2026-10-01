# Murders at Karlov Manor (MKM, « Meurtres au manoir Karlov », 268 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 01/10/2026, après Wilds of Eldraine et Secrets of Strixhaven. 10 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : terrains à surveillance, Vengeful Tracker, réunir des preuves (Deadly Cover-Up)… Le déguisement, la cape, les Affaires, réunir des preuves et les Indices existent déjà dans le moteur. L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : suspect (701.60), jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/mkm/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (incolores et terrains) et `legends`. Les aides sont dans `mkm/common.ts`.

## Sous-lot 0 : socle ✅ (10 / 268)

- **Suspect (701.60) :** désignation `GameObject.suspected` ; un permanent suspect a la menace et « ne peut pas bloquer » (ajoutés avec les mots-clés des marqueurs, après les effets de couche 6) ; `fx.suspect(ref)` et `fx.suspect(ref, false)` (« il n'est plus suspect ») ; filtre `suspected` (`SUSPECTED` : « créature suspecte ») ; la désignation se perd en quittant le champ de bataille. La vue la montre (`ObjectView.suspected`, pastille « Suspecte »).
- **Jetons :** Détective 2/2 blanc et bleu, Squelette 2/1 noir, Esprit 1/1 blanc et noir volant, Loup 5/5 vert et blanc avec le piétinement, Araignée 2/1 noire et verte (portée, menace), Diablotin 2/2 rouge (« en mourant, 2 blessures à chaque adversaire »), Merfolk 1/1 bleu ; Indice, Thopter, Chien, Humain et Gobelin viennent des communs.
- **Tests :** 2 tests dans `engine/test/mkm.test.ts` (« socle ») ; test de fumée `ai/test/smoke/mkm.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (37 / 268)

- **Cartes :** 27 (sur 34), dont le suspect, les Affaires (Case of the Pilfered Proof), le déguisement (Perimeter Enforcer, Haazda Vigilante…), les Indices et les Détectives.
- **[règles] Corrections du moteur (trouvées par les agents du lot A) :**
  - une capacité déclenchée « une, deux ou trois cibles » (`target.between`) respecte son minimum : Armament Dragon (TDM) n'avait aucune cible avec moins de trois créatures (test ajouté dans `tdm.test.ts`) ;
  - la condition d'une capacité déclenchée voit l'événement entier (`amount.eventAmount` : « si 3 blessures ou plus ») ;
  - `cond.handAtMost` (« s'il n'a pas de carte en main ») est évaluée hors résolution (« Pour résoudre » d'une Affaire, condition d'un déclencheur) : elle était toujours fausse.
  - `RULES_VERSION` = 33.
- **Dette :** l'opération `suspect` (701.60) entre dans `debt-baseline.json` tant qu'une seule carte l'utilise ; `solveCase` (Affaires) en sort, plusieurs cartes s'en servent.
- **Restent :** Aurelia's Vindicator (X du coût de déguisement), Case File Auditor (« chaque fois que vous résolvez une Affaire »), Case of the Gateway Express (chaque créature inflige 1 blessure), Karlov Watchdog (« ne peuvent pas être retournés face visible »), No Witnesses (« chaque joueur qui contrôle le plus de créatures »), Wojek Investigator (« adversaires qui ont plus de cartes en main »), Tenth District Hero (réunir des preuves en coût de capacité).
- **Tests :** 35 tests de règles (« lot A — blanc »).

## Sous-lot A2 : cartes bleues ✅ (68 / 268)

- **Cartes :** 31 (sur 36), dont 4 Auras (Behind the Mask, Burden of Proof, Lost in the Maze, Out Cold…), le déguisement (Bubble Smuggler, Living Conundrum…), les Affaires (Case of the Filched Falcon, Case of the Ransacked Lab), Cold Case Cracker, Proft's Eidetic Memory.
- **Dette :** l'opération `suspect` sert désormais à plusieurs cartes : son entrée est retirée.
- **Restent :** Forensic Researcher (réunir des preuves en coût de capacité), Surveillance Monitor (« vous pouvez réunir des preuves », « chaque fois que vous réunissez des preuves »), Conspiracy Unraveler (coût alternatif « réunir des preuves 10 »), Cryptic Coat (cape puis attacher l'Équipement), Intrude on the Mind (piles révélées, cartes mises au cimetière comptées).
- **Tests :** 41 tests de règles (« lot A — bleu »).

## Sous-lot A3 : cartes noires ✅ (101 / 268)

- **Cartes :** 33 (sur 35), dont le suspect (Barbed Servitor, Hunted Bonebrute, Repeat Offender…), le déguisement, les Affaires (Case of the Gorgon's Kiss, Case of the Stashed Skeleton), réunir des preuves (Extract a Confession, Leering Onlooker…), Massacre Girl, Known Killer, Outrageous Robbery.
- **Restent :** Polygraph Orb (réunir des preuves en coût de capacité), Vein Ripper (garde « sacrifiez une créature »).
- **Tests :** 42 tests de règles (« lot A — noir »).

## Sous-lot A4 : cartes rouges ✅ (129 / 268)

- **Cartes :** 28 (sur 35), dont le suspect (Convenient Target, Person of Interest, Reckless Detective…), les Affaires (Case of the Crimson Pulse), le déguisement, Krenko, Baron of Tin Street, Innocent Bystander (condition du déclencheur sur les blessures subies, grâce au correctif du lot A1).
- **Restent :** Case of the Burning Masks (sources distinctes qui ont infligé des blessures), Demand Answers (« défaussez une carte ou sacrifiez un artefact »), Expose the Culprit (« avec le déguisement », exiler puis envelopper d'une cape), Fugitive Codebreaker (coût de déguisement réduit), Goblin Maskmaker (réduction des sorts face cachée ce tour-ci), Incinerator of the Guilty et Lamplight Phoenix (« vous pouvez réunir des preuves »).
- **Tests :** 34 tests de règles (« lot A — rouge »).

## Sous-lot A5 : cartes vertes ✅ (157 / 268)

- **Cartes :** 28 (sur 35), dont les Affaires (Case of the Locked Hothouse, Case of the Trampled Garden), le déguisement, la cape (Hide in Plain Sight), Glint Weaver et Case of the Trampled Garden (« une à trois cibles », grâce au correctif du lot A1), The Pride of Hull Clade ; jetons Plante 0/1 et Limon 0/0 locaux.
- **Dette :** l'opération `putFaceDown` (cape) entre dans `debt-baseline.json` tant qu'une seule carte l'utilise.
- **Restent :** Airtight Alibi (« ne peut pas devenir suspecte »), Axebane Ferox (garde « réunir des preuves 4 »), Culvert Ambusher (« bloque si possible »), Hedge Whisperer, A Killer Among Us (choix secret parmi trois types), Sample Collector (« vous pouvez réunir des preuves »), Tunnel Tipster (créature face cachée arrivée ce tour-ci).
- **Tests :** 36 tests de règles (« lot A — vert »).

## Sous-lot A6 : multicolores, incolores et terrains ✅ (217 / 268)

- **Cartes :** 44 multicolores (sur 65 : Agrus Kos, Alquist Proft, Teysa, Trostani, Ezrim, Kellan, Rakdos, Doppelgang, Lightning Helix, les cartes scindées Cease // Desist, Fuss // Bother, Push // Pull…) et 16 incolores et terrains (sur 18 : Case of the Shattered Pact, Gravestone Strider, Thinking Cap — « Équiper Détective {1} » écrit à la main —, les sept terrains à surveillance, Public Thoroughfare, Scene of the Crime).
- **[règles]** Un sort ou une capacité à « X cibles » (`countX`) est proposé même sans cible (X = 0) ; les options de cibles portent `countX`, l'IA ajuste X au nombre de cibles et l'interface demande autant de cibles que le X choisi. `RULES_VERSION` = 34.
- **Restent :** 21 multicolores (réunir des preuves hors coût de sort : Evidence Examiner, Izoni, Kylox's Voltstrider, Urgent Necropsy ; Aurelia, Buried in the Garden, Ill-Timed Explosion, Judith, Kaya, Lazav, Vannifar, Yarus, Etrata, Kylox, Niv-Mizzet, Officious Interrogation, Tin Street Gossip, Tolsimir, Hustle // Bustle, Treacherous Greed, Flotsam // Jetsam), Cryptex et Branch of Vitu-Ghazi.
- **Tests :** 56 tests de règles (« lot A — multicolores ») et 20 (« lot A — incolores et terrains »).

## Sous-lot B1 : réunir des preuves (701.59) ✅ (229 / 268)

- **Cartes :** Surveillance Monitor, Forensic Researcher, Sample Collector, Incinerator of the Guilty, Lamplight Phoenix, Evidence Examiner, Izoni, Center of the Web, Polygraph Orb, Vein Ripper, Tenth District Hero, Cryptex, Axebane Ferox.
- **Le moteur gagne :**
  - réunir des preuves N en coût de capacité activée (`activated({ collectEvidence })`) et de capacité de mana (`manaAbility(…, { collectEvidence })`, Cryptex) ;
  - l'effet facultatif `fx.mayCollectEvidence(N, { exclude }, …effets)` (« vous pouvez réunir des preuves N. Si vous le faites, … » ; `exclude` : Lamplight Phoenix, exilé en même temps) et `fx.mayCollectEvidenceX(store, …)` (X choisi, Incinerator of the Guilty) ;
  - l'événement et le déclencheur « chaque fois que vous réunissez des preuves » (`when.collectEvidence`), émis aussi par le coût additionnel des sorts ;
  - les gardes « réunissez des preuves N » et « sacrifiez une créature » (lues dans le texte ; `ward.sacrificeFilter` remplace `sacrificeNonland`) ;
  - le choix automatique des preuves : la carte la moins chère qui suffit, sinon la plus chère (on ne gâche plus une carte chère pour un petit N).
- **[règles] Correctif (fuzz à 3 joueurs) :** « doit être bloquée si possible » tient compte de la menace (509.1c) : l'exigence ne vaut que si le défenseur peut opposer assez de bloqueurs, et le blocage par défaut en met autant (un suspect qui doit être bloqué). Test dans `rulings.test.ts`.
- **[règles]** `RULES_VERSION` = 35.
- **Tests :** 8 tests de règles (« lot B1 ») et 1 décision officielle.

## Sous-lot B2 : déguisement ✅ (235 / 268)

- **Cartes :** Aurelia's Vindicator, Fugitive Codebreaker, Goblin Maskmaker, Karlov Watchdog, Branch of Vitu-Ghazi, Tunnel Tipster.
- **Le moteur gagne :**
  - un coût de déguisement avec {X} : l'action spéciale « retourner face visible » paie X et le mémorise (`amount.sourceX`, « jusqu'à X cibles ») ;
  - `disguiseReduction` (« ce coût est réduit de {1} pour chaque… »), appliquée au seul coût de déguisement ;
  - la famille `playerStatic({ spellCost: { filter, reduce } })` (sorts du joueur moins chers, par exemple ce tour-ci avec `fx.thisTurn`) et le filtre `faceDown` sur un sort lancé face cachée ;
  - `castLimit.faceUp` : « les permanents de vos adversaires ne peuvent pas être retournés face visible pendant votre tour » ;
  - une carte de terrain avec le déguisement se lance face cachée ; `fx.addManaChoice(…, keep)` (mana gardé jusqu'à la fin du tour) ;
  - `fx.exileUntilLeaves(ref, toHand)` : exil, cartes de cimetière comprises, avec retour en main quand la source part ;
  - le journal du tour note les arrivées face cachée (`faceDown`), comme des créatures sans type.
- **[règles]** `RULES_VERSION` = 36.
- **Dette :** `spellCost` entre dans `debt-baseline.json` comme famille générique (réductions de coût accordées à un joueur, filtrées).
- **Tests :** 6 tests de règles (« lot B2 »).

## Sous-lot B3 : cape (701.58) ✅ (241 / 268)

- **Cartes :** Cryptic Coat, Expose the Culprit, Yarus, Roar of the Old Gods, Etrata, Deadly Fugitive, Vannifar, Evolved Enigma, Lazav, Wearer of Faces.
- **Le moteur gagne :**
  - `fx.cloak(ref, store)` et `fx.putFaceDown(ref, ward, { store, ownerControl })` : les créatures face cachée sont mémorisées (« puis attachez-y cet Équipement ») et peuvent revenir sous le contrôle de leur propriétaire (Yarus) ;
  - la destination `{ to: "battlefield", cloak: true }` d'un déplacement (« enveloppez d'une cape une carte de votre main ») ;
  - `fx.turnFaceUp(ref, store)` : une carte d'éphémère ou de rituel, qui ne peut pas être retournée, est exilée et mémorisée (Etrata la lance ensuite gratuitement) ;
  - le filtre `disguise` (« avec le déguisement ») ; `fx.chooseAmong(…, { anyNumber, anyZone })` (un nombre quelconque ; des cartes hors du champ de bataille, comme celles exilées avec Lazav).
- **Dette :** l'opération `putFaceDown` sert à plusieurs cartes : son entrée est retirée.
- **Tests :** 6 tests de règles (« lot B3 »).

## Sous-lot B4 : suspect et Affaires ✅ (245 / 268)

- **Cartes :** Airtight Alibi, Case File Auditor, Case of the Gateway Express, Case of the Burning Masks.
- **Le moteur gagne :**
  - le mot-clé de restriction `cantBeSuspected` (« ne peut pas devenir suspecte »), lu par `fx.suspect` (entrée justifiée dans `debt-baseline.json`) ;
  - l'événement et le déclencheur « chaque fois que vous résolvez une Affaire » (`when.caseSolved`) ;
  - `spellCost.anyMana` : « vous pouvez dépenser du mana comme s'il était de n'importe quelle couleur pour lancer les sorts [filtre] » ;
  - `fx.eachDealsDamage(filtre, cible, montant)` : chaque créature inflige ce nombre de blessures (au lieu de sa force) ;
  - le journal du tour note la source des blessures (`sourceKey`) ; `distinctSources` compte les sources différentes (« trois sources ou plus que vous contrôliez ont infligé des blessures ce tour-ci »).
- **Interface :** pastille « Suspecte » vérifiée par un script Playwright ponctuel (capture `test-results/mkm/suspect.png`).
- **Tests :** 4 tests de règles (« lot B4 »).

## Sous-lot C1 : exigences de blocage (509.1c) ✅ (248 / 268)

- **Cartes :** Culvert Ambusher, Tolsimir, Midnight's Light (jeton légendaire Voja Fenstalker), Hustle // Bustle.
- **Le moteur gagne :** les exigences de blocage de la famille `BlockRule` : `mustBlock` (« bloque ce tour-ci si possible ») et `mustBlockAttacker` (« bloque ce Loup si possible » ; `mustBlockEventObject` dans un script, fixé à la résolution) ; la déclaration des bloqueurs les vérifie (bloquer un autre attaquant n'obéit pas à une exigence d'attaquant précis) et le blocage par défaut (`requiredBlocks`) les respecte.
- **Tests :** 3 tests de règles (« lot C1 »).

## Sous-lot C2 : montants et coûts ✅ (258 / 268)

- **Cartes :** No Witnesses, Wojek Investigator, Ill-Timed Explosion, Officious Interrogation, Demand Answers, Treacherous Greed, Urgent Necropsy, Niv-Mizzet, Guildpact, Aurelia, the Law Above, Tin Street Gossip.
- **Le moteur gagne :**
  - `ref.playersWithMost(filtre)` (« chaque joueur qui contrôle le plus de créatures ») ;
  - les montants `opponentsWithMoreInHand`, `greatestManaValueOf(ref)` et `colorPairsAmong(filtre)` ;
  - `costPerExtraTarget` (« coûte {W}{U} de plus pour chaque cible au-delà de la première ») ;
  - `discardOrSacrifice` filtré (« défaussez une carte ou sacrifiez un artefact ») ;
  - `collectEvidenceTargetsManaValue` (« réunissez des preuves X, X étant la valeur de mana totale des permanents ciblés ») ;
  - le filtre `dealtDamageThisTurn` (« une créature qui a infligé des blessures ce tour-ci ») ;
  - `when.attackWith(N, filtre, anyPlayer)` (« chaque fois qu'un joueur attaque avec N créatures ou plus »).
- **Correctif :** Troyan, Gutsy Explorer (WOE) : son mana sert aussi aux sorts avec {X} dans leur coût (filtre `hasX`) ; l'approximation est levée.
- **Tests :** 10 tests de règles (« lot C2 »).

## Sous-lot C3 : dernières cartes uniques ✅ (268 / 268)

- **Cartes :** Conspiracy Unraveler, Intrude on the Mind, Hedge Whisperer, A Killer Among Us, Kylox's Voltstrider, Judith, Carnage Connoisseur, Kaya, Spirits' Justice, Kylox, Visionary Inventor, Flotsam // Jetsam, Buried in the Garden.
- **Le moteur gagne :**
  - `altCostAll` accepte un coût en preuves (« réunir des preuves 10 plutôt que payer le coût de mana de vos sorts ») ; Leyline of Mutation (DSK) passe à la forme `{ mana }` ;
  - `linkEvidence` : les cartes exilées pour un coût « réunir des preuves » sont liées à la source (« parmi les cartes exilées avec lui ») ;
  - `castNow` / `grantPlay` : `bottomAfter` (« s'il devait aller au cimetière, mettez-le au-dessous de la bibliothèque à la place ») ; le sort qui quitte la pile (résolu, contrecarré ou sans cible) passe par un seul chemin (`spellToRest`) ;
  - `fx.piles` : piles révélées et cartes mises au cimetière gardées (`storeGraveyard`) ;
  - effets « tant que [la source] reste engagée » (`fx.modifyWhileTapped`) et mot-clé de restriction `mayNotUntap` (« vous pouvez choisir de ne pas le dégager » ; entrée justifiée dans `debt-baseline.json`) ;
  - choix restreint à une liste et choix secret (`fx.chooseForSelf(kind, { options, secret })`), caché aux autres joueurs dans leur vue ;
  - `ref.graveyardOf(joueurs)` et le montant `totalPowerOf(ref)` (force totale, dernière information connue après sacrifice) ;
  - déclencheur « quitte [une zone autre que le champ de bataille] » (`from`), avec la nouvelle carte comme objet de l'événement quand elle est exilée ;
  - `extraMana: "any"` (« un mana de plus de n'importe quelle couleur que ce terrain a produite »).
- **Correctif :** `cond.refMatches` résout le filtre (types choisis, « de ce type ») comme les autres filtres.
- **Version des règles :** 37.
- **Tests :** 10 tests de règles (« lot C3 »).
