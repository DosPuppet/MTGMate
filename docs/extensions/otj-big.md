# Outlaws of Thunder Junction + The Big Score (OTJ, BIG)

**✅ 269 / 269 et 30 / 30** (lots A à C). Mécaniques et détail des lots (déplacé de CLAUDE.md).

| Mécanique | Cartes | Lot |
|---|---:|---|
| plot | 32 | A |
| spree | 21 | A |
| crimes (« chaque fois que vous commettez un crime ») | 26 | A |
| hors-la-loi (Assassin, Mercenaire, Pirate, Voleur, Sorcier) | 13 | A |
| monture | 17 | A (moteur de DFT) |
| hideaway (BIG) | 1 | C |

- Lot A ✅ (OTJ 221/269). Il couvre :
  - plot (702.170) : « Plot {coût} » est lu dans le texte ; action spéciale depuis la main au moment d'un rituel (`plotCard`, `GameObject.exiledVia` de sorte `plot`) ; la carte complotée se lance gratuitement depuis l'exil à un tour ultérieur, au moment d'un rituel (`CastTerms.sorceryTiming`) ; `fx.plot` (Aven Interrupter, Kellan Joins Up) et « quand cette carte devient complotée » (déclenché depuis l'exil) ;
  - spree (702.172) : aide `spree(...)`, qui génère toutes les combinaisons de modes (`ModeDef.extraCost` additionnés, payés même si le sort est gratuit ; un mode trop cher n'est pas proposé) ;
  - crimes (700.13) : cibler un adversaire, un objet qu'il contrôle ou une carte de son cimetière (`checkCrime` à la mise sur la pile des sorts, capacités et déclencheurs) ; `when.crime`, `cond.crime` ;
  - marqueurs de capacité (122.1b : vol, lien de vie, contact mortel…), « si vous n'avez pas lancé de sort depuis votre main ce tour-ci », flash sous condition (`flashIf`), jetons X/X (`fx.createXXToken`), `perHand`, « jusqu'à la fin de votre prochain tour » pour les cartes exilées jouables ;
  - `checkCondition` évalue désormais n'importe quel montant (sommes, force d'un objet…), et plus seulement les décomptes ;
  - la pioche fait avancer la version d'état (Duelist of the Mind).
- Lot B ✅ (**OTJ 269/269**) : 48 légendaires, rares et cartes uniques (`otj/unique.ts`). Le moteur gagne :
  - les taxes d'attaque et de blocage (Archangel of Tithes : `attackTax`, `blockTax`), les surcoûts ou réductions selon la zone de lancement (`fromZones` : cimetière, exil), « un seul sort par tour » (High Noon), la taxe en PV des sorts qui ciblent (Terror of the Peaks) ;
  - les créatures qui ont monté ou équipé un permanent ce tour-ci (`GameObject.crewedBy`, `ref.crewedBy`) ; l'équipage « une fois par tour » lu dans le texte ;
  - la copie d'un sort de permanent (elle devient un jeton, 707.10) et la copie de capacités activées ou déclenchées ; le déclencheur « quand vous activez une capacité qui cible » (Ertha Jo) ;
  - les emblèmes jusqu'à la fin du tour, le flashback {0}, les permissions de jouer une carte du cimetière d'un adversaire avec du mana de n'importe quel type, le plot à la résolution (Lilah) ;
  - pile ou face (`fx.coinFlip`, événement public), étapes d'entretien supplémentaires (approximation : seuls les déclencheurs d'entretien), « chacun peut mélanger main et cimetière et piocher sept cartes », `exileOnResolve` ;
  - les déclencheurs de légendaires doublés, les Auras qui volent les permanents moins chers (Eriette), le mana supplémentaire des jetons d'artefact (Roxanne), le bonus de blessures non de combat du tour (Taii Wakeen) ;
  - les références à la carte du dessus d'une bibliothèque, aux cartes exilées d'un joueur, à tous les cimetières ; la copie liée à une carte exilée (Assimilation Aegis) ; les jetons légendaires et à F/E variables (Beau) ;
  - le helper de test initialise le nombre de tours joués (`turnsTaken`, pour Jace Reawakened).
- Lot C ✅ (**BIG 30/30**, `big/index.ts`) : hideaway (Collector's Cage, carte liée), Grand Abolisher (`lockOpponentsOnYourTurn`), Rest in Peace (`graveyardToExile`), Torpor Orb, Worldwalker Helm (jeton Carte en plus), Territory Forge (capacités activées de la carte liée, `gainLinkedActivated`), tirage au hasard parmi des cartes liées (Omenpath Journey), jetons copies 3/3 (Nexus of Becoming), montants « forces différentes » et « types de carte parmi ».
