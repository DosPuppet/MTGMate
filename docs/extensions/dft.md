# Aetherdrift (DFT)

**✅ 260 / 260** (lots A à C). Mécaniques et détail des lots (déplacé de CLAUDE.md).

| Mécanique | Cartes | Lot |
|---|---:|---|
| Véhicules (équipage) | 43 | A |
| Montures (« attaque en étant montée ») | 32 | A |
| cycle (« quand vous cyclez cette carte ») | 28 | A |
| vitesse (« Start your engines! », « Max speed ») | 40 | B |
| exhaust | 29 | B |

- Lot A ✅ (152/260). Il couvre :
  - les pilotes (mot-clé `crewPlus2` : « monte et équipe comme si sa force était supérieure de 2 ») et Interface Ace (`crewWithToughness`) ;
  - « chaque fois que cette créature monte une Monture ou équipe un Véhicule » (`when.crews`, événement `crewed` ; l'objet de l'événement est le Véhicule) ; « devient montée » (`fx.saddle(ref)`) et « devient une créature-artefact » (`fx.animateVehicle`) ;
  - « quand vous cyclez cette carte » (`when.cycleSelf`, avec le X du coût de cycle) ; « chaque fois que vous défaussez une ou plusieurs cartes » (`when.discardBatch`, une fois par défausse) ;
  - épuiser (`exert`), les Verges (capacité de mana sous condition), les Roads, Bloodghast (« un adversaire a 10 PV ou moins ») ;
  - jetons Pilote, Servo, Éléphant, Véhicule 3/2 (équipage 1), Dinosaure Dragon (`dft/common.ts`, aussi dans le bac à sable) ;
  - le test de fumée peut ajouter des cartes au cimetière du joueur 1 (`EXTRA_P1_GRAVEYARD`).
- Lot B ✅ (218/260) : vitesse et exhaust.
  - vitesse (702.179) : `PlayerState.speed` (absente au départ). « Start your engines! » est un mot-clé lu dans le texte : un joueur sans vitesse qui contrôle un tel permanent passe à 1 (action basée sur l'état). Quand un adversaire perd des PV pendant votre tour, votre vitesse augmente de 1, une fois par tour (`setSpeed`, événement `speed`) ;
  - « Max speed — [capacité] » : condition `cond.maxSpeed` sur la capacité (statique, déclenchée, activée, de mana ou de joueur : `PlayerStaticAbilityDef.condition`) ; `amount.speed`, `perSpeed` (Samut), `fx.reduceSpeed` (Spikeshell Harrier), `ref.playersWithoutMaxSpeed` ;
  - interface : pastille « ⚡ N » près du nom du joueur (dorée à la vitesse maximale) et ligne de journal ;
  - exhaust (702.177) : aide `exhaust({...})` (une seule activation), déclencheur `when.exhaustActivated`, réduction de Boom Scholar (`exhaustReduction`), réactivation d'Elvish Refueler (`exhaustReuse`) ;
  - aussi : « lancer depuis votre cimetière [si…] » (`castFromGraveyard`), pioche doublée (Vnwxt), +1 blessure aux adversaires (Far Fortune), « si ce n'est pas son tour » (`when.castSpellOffTurn`), « sacrifie, sinon défausse » (Momentum Breaker), meule égale au cimetière.
- Lot C ✅ (**260/260**) : 42 cartes uniques (`dft/unique.ts`). Le moteur gagne :
  - le contrôle « tant que vous contrôlez [la source] » (`gainControlWhileSource`, effets `whileSource`) et l'échange de contrôle ;
  - « arrive comme copie de … » (`entersAsCopyOf`, choix pendant la résolution) ; Mimeoplasm (dévorer depuis le cimetière avec cartes liées, copie 0/0 qui garde ses capacités activées) ;
  - nommer une carte sans information cachée (`chooseCardName`, `exileNamed`) ; payer le coût de mana d'une carte (`payCostOf`) ;
  - les coûts « exilez X cartes de votre cimetière » et « sacrifiez un ou plusieurs artefacts » (`exileFromGraveyardX`, `sacrificeX`) ;
  - les déclencheurs groupés « une ou plusieurs … » (`batched`), « une carte change de zone » (`when.zoneChange`), « un sort qu'il ne possède pas », « blessures de combat à l'un de vos adversaires » ;
  - Skyseer's Chariot (taxe sur le nom choisi, `chosenNameTax`), The Aetherspark (planeswalker-Équipement, pas attaquable quand il est attaché), Pit Automaton (copie de la prochaine capacité d'exhaust), modes uniques « ce tour-ci » ;
  - « lancer depuis votre cimetière » avec PV et sacrifice en plus (Wickerfolk), X du sort mémorisé sur le permanent (`castX`), « N-ième depuis le dessus de la bibliothèque », « révélez jusqu'à N terrains ».
