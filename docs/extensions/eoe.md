# Edge of Eternities (EOE)

**✅ 260 / 260** (lots A à D). Mécaniques et détail des lots (déplacé de CLAUDE.md).

| Mécanique | Cartes | Lot |
|---|---:|---|
| distorsion (warp) | 32 | A |
| station (Vaisseaux, Planètes) | 27 | B |
| vide (void) | 14 | A |
| jetons Lander, Robot, Drone, Munitions | ~40 | A |
| « votre deuxième sort de chaque tour » | 6 | A |
| « deux créatures engagées ou plus » | 6 | A |
| terrains choc | 5 | A |

- Lot A ✅ (170/260). Il couvre :
  - distorsion (702.185) :
    - option de lancement « (distorsion) » depuis la main (`CardDef.warp`, lue dans le texte, points de vie compris) ;
    - le permanent est exilé à la prochaine étape de fin, puis relançable depuis l'exil un tour suivant (`warpExiledTurn`) ;
    - Timeline Culler : depuis le cimetière ; filtre `warped` ;
  - vide : condition `cond.void` (un permanent non-terrain a quitté le champ de bataille ou un sort a été lancé avec la distorsion ce tour-ci) ;
  - déclencheurs et outils génériques :
    - `when.castNthSpell(2)` ;
    - « chaque fois que vous sacrifiez » (`when.sacrifice`, fonction `sacrifice` du moteur) ;
    - blessures de combat groupées (`when.combatDamageBatch`) ;
    - « la créature enchantée subit des blessures » ;
    - « mis au cimetière depuis le champ de bataille » (`when.putIntoGraveyardSelf`) ;
    - « meurt » pour des artefacts quand le filtre les nomme ;
  - jetons engagés ou attaquants (`fx.createTappedTokens`) ; « s'il paie » (`unlessPays` avec `paidStore`) ; filtres `blocking` et `damaged` ;
  - restrictions de blocage `canBlockOnlyFlyers` (Drone) et `cantBeBlockedByMoreThanOne` ;
  - terrains choc : deux options « jouer ce terrain » (payer 2 PV, dégagé ; ou engagé).
- Lot B ✅ (201/260) : station (702.184).
  - Les paliers « N+ | … » et le seuil de créature sont lus dans le texte (`CardDef.station`). Les mots-clés d'un palier sont automatiques ; ses autres capacités viennent du script (`stationAbilities`), sans quoi la carte reste non gérée ;
  - la capacité « Station » est générée : le joueur choisit la créature à engager (`ActionOption.additional.tap`, `CastChoices.tap`), puis l'effet `station` met autant de marqueurs de charge que sa force (Tapestry Warden : l'endurance) ;
  - Planètes ; mana égal aux marqueurs (`amountCounters`) ; copies légendaires ; filtre `multicolored` ;
  - engager ou dégager un permanent fait avancer la version d'état (statiques « créatures engagées », détecté par le fuzz).
- Lot C ✅ (241/260) : 40 rares, mythiques et cartes uniques (`eoe/rares.ts`). Le moteur gagne :
  - le mana dépensé pour lancer (`manaSpent` sur le sort et le permanent ; Amount `manaSpent`, filtres `manaSpentBelowValue` et `maxManaValueManaSpent`) ;
  - les coûts d'activation réduits (`reduction`, avec condition), « retirez un marqueur d'une créature », « engagez X artefacts » (`tapX`) ;
  - des statiques de joueur : déclencheurs d'arrivée doublés, +1 carte avec une petite main, sorts d'artefact du dessus de la bibliothèque, premier sort gratuit, sorts de créature incontrecarrables, blessures de combat imprévenables, terrains depuis le cimetière, distorsion accordée ;
  - les réductions de coût conditionnelles ou variables (affinité pour les artefacts, deuxième sort du tour) ;
  - le mana restreint aux capacités d'artefacts ou aux sorts lancés hors de la main, et la capacité de mana qui engage un autre permanent (Gene Pollinator) ;
  - les cartes exilées jouables sous condition, par leur propriétaire, avec un surcoût, terrains engagés (`grantPlay`) ; « exilez jusqu'à une carte non-terrain » ;
  - une cible « carte exilée » (`TargetFilter.exiled`), la garde accordée (`wardAbility`, la garde de la carte n'est lue que si Scryfall la donne en mot-clé) ;
  - des capacités retardées à l'étape de fin de votre prochain tour et à la fin du combat (`fx.delayedAt`) ;
  - « [ce joueur] peut… ; s'il ne le fait pas » (`fx.mayForStore`), « votre total de points de vie devient N », « meurt ou est exilée » (avec force minimale), la condition « vous avez attaqué avec un Vaisseau » (`cond.attackedWith`).
- Lot D ✅ (**260/260**) : les 19 dernières cartes (`eoe/unique.ts`). Le moteur gagne :
  - **le contrôle du tour d'un adversaire** (722, The Dominion Bracelet) : `GameState.turnControl`, `decider(s)` donne le joueur qui décide ; `submit` accepte sa décision au nom du joueur contrôlé ; l'hôte et le serveur (horloge) la lui demandent ; sa vue présente la décision comme la sienne, avec la main du joueur contrôlé (`GameView.controlling`, bandeau « Vous contrôlez … ») ;
  - dévorer (`CardDef.devour`, lu dans le texte : sacrifices choisis pendant la résolution) ;
  - le doublement de marqueurs filtré (`countersFilter`), les jetons remplacés par des copies du permanent enchanté ;
  - les cibles de valeur de mana totale limitée (`maxTotalManaValue`), les filtres de parité et « endurance ≤ X » ;
  - « chaque adversaire choisit une créature et l'exile » (`sacrifice` avec `exile`), les cartes exilées par la source (`ref.exiledWith`) ;
  - `pickFromZone` parmi des objets mémorisés ou liés (`pool`), avec valeur de mana maximale variable ;
  - « défaussez deux cartes à moins de défausser une carte d'artefact », la meule de la moitié de la bibliothèque ;
  - un permanent mis en jeu attaquant ; la condition « un joueur ne contrôle aucune créature » ;
  - les remplacements d'arrivée s'appliquent aussi aux jetons créés, et savent lire le mana dépensé et les terrains arrivés ce tour-ci.
- Test de fumée : l'adversaire du scénario a un Goblin Firebomb en main (cible des contresorts d'artefact).
