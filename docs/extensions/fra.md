# Reality Fracture (FRA)

**✅ 279 / 279** (lots 0 à G, puis lot 0.1 du socle). Détail des lots (déplacé de CLAUDE.md).

- 285 cartes selon Scryfall, dont 6 réimpressions de FDN (terrains de base, Unsummon), donc 279 cartes propres. Toutes sont légales en Standard.
- **Sortie le 2 octobre 2026 : pas encore de textes français.** Réimporter après la sortie (`npm run import-cards -- fra`), puis vérifier les noms français dans le deckbuilder.
- Lot 0 (infrastructure multi-extensions) et lot A (cartes faisables avec le moteur, jetons Cadet, Heartwood, Lotus, Forêt Tentacule et Thopter, terrains lents) : ✅.
- Lot F (**cartes uniques**) : ✅, 50 cartes. Le moteur gagne :
  - durée « jusqu'à votre prochain tour » (`modify`, `untilYourNextTurn`) et emblèmes temporaires (`GameObject.expires`) ;
  - déclencheurs « subit des blessures », « bloque », « vous attaque » (`defending: "you"`), « lance un sort qui cible… » (`targeting`, `orFilter`) ;
  - hybride monocolore {2/W} (`ManaCost.twoHybrid`), loyauté −X (`loyalty: "X"`), coût « exilez une autre carte de votre cimetière » ;
  - garde « défaussez une carte », flashback avec défausse (`flashbackDiscard`), Équiper réduit par les marqueurs +1/+1 ;
  - combat : blessures selon l'endurance (Ghalta), valeur absolue d'une force négative (Loot), attaque malgré le défenseur, un seul attaquant par planeswalker (Tomik) ;
  - statiques de joueur : taxe adverse (Thalia), +1 marqueur (Yoshimaru), +1 blessure non de combat (Tomik), pas de déclencheur d'arrivée (Karn), pas de sorts en combat (Yuriko), jetons d'artefact → Dragons, créatures adverses exilées au lieu de mourir ;
  - Tarmogoyf (`cdaToughness`), Omnipresence, Null Summoner (carte liée lançable), sorts renvoyés en main, Molten Tide, « chaque joueur peut défausser sa main et piocher sept cartes », Kindred Judgment.
  
  Non gérées à ce lot (gérées depuis le lot 0.1 du socle multi-extensions, `docs/extensions/socle.md`) : **Emrakul, the Exigent Doom** (terrain qui gagne une capacité jusqu'au lancement depuis l'exil, garde « sacrifiez trois permanents »), **Uldaros Theorix** (copies de cartes de chaque type lancées gratuitement), **Hall of Echoes** (terrain qui devient la copie d'une créature, règle de légende suspendue).
- Lot E (**planeswalkers**) : ✅. Il couvre :
  - The Theorist, Jace Beleren ; Ajani Resolute ; Ajani Unrelenting ;
  - les sorts « créature ou planeswalker » ;
  - les 10 terrains Commons/Annex (« arrive engagé sauf si vous contrôlez un planeswalker ») ;
  - Tam (prolifération, choix automatique) ; Kiora (condition « capacité de loyauté activée ce tour-ci ») ;
  - Mabel (retirer jusqu'à trois marqueurs, choix automatique) ; Winter et Dark Matter Manipulator (bonus par carte du cimetière, `perGraveyard` et `perDivisor`) ;
  - Craftwork Crusher (« choisissez deux », sous forme des trois paires possibles).
  
  Passent au lot F :
  - Face Yourself, Identity Echo, Loot, the Anomaly, Tomik, Orzhov Lawmage ;
  - les deux Chandra, les deux Garruk, Jace, Reality Sculptor ;
  - Gideon the Oathless (garde « défaussez une carte ») et Break Under Pressure.
- Lot D (**Empower Jace**) : ✅. Il couvre :
  - l'effet `empowerJace` (aide `empower(n)` dans `fra/common.ts`) : N marqueurs de loyauté sur votre jeton Jace, créé d'abord s'il n'existe pas (−1 : surveillance 1 ; −3 : piochez) ;
  - les Ways, qui accordent des capacités de loyauté à vos planeswalkers (aide `walkersHave`) ;
  - le déclencheur « quand vous activez une capacité de loyauté » (`loyaltyActivated`) ;
  - la loyauté des Jace à vitesse d'éphémère (Jace's Machinations) et les planeswalkers qui survivent à 0 (Sanctum Lurker) ;
  - « contempler un Jace » (condition `beholdJace`), un terrain supplémentaire ce tour-ci, « le prochain sort ne peut pas être contrecarré ».
  
  Fatehold Charm (renvoyer un sort de la pile en main) et Jace, Reality Sculptor passent aux lots E et F.
- Lot C (**préparé**) : ✅, fidèle aux notes de version officielles :
  - devenir préparé crée une **copie du sort en exil** (`GameObject.preparedCopy` / `preparedFor`), lançable par le contrôleur actuel du permanent, au timing de son type, en payant son coût ;
  - lancer la copie dé-prépare le permanent ; un effet qui dé-prépare, ou le départ du permanent, fait disparaître la copie ;
  - la copie cesse d'exister en quittant la pile. Elle n'est pas une carte : l'invariant de décompte l'exclut ;
  - dans l'interface, la copie apparaît au bout de la main (comme les cartes jouables depuis l'exil), et une pastille « Préparée » s'affiche sur la créature ;
  - Pyre Rhymer (mana supplémentaire en engageant une Montagne) et Variable Chaser (« chaque joueur peut défausser sa main ») passent au lot F.
- Lot B : ✅. Il couvre :
  - les capacités activées depuis la main (`fromHand` et le coût `discardSelf`), avec un menu « Lancer / Cycle » quand une carte en main a plusieurs options ;
  - le cycle, le cycle de terrain et le cycle de type, lus dans le texte ;
  - la condition de lancement (`castCondition`), le second partagé (Samut), la convocation, l'exhaust (`once`) ;
  - le domaine (`basicLandTypes`), la recherche « de noms différents » et « quand vous défaussez cette carte ».
  
  Les cartes Jace du lot B (Hexhaven Battalion, Countersculpt, Theorist's Sanctum) passent au lot D, Tam au lot E et Emrakul au lot F.
- Lot G (**decks préconstruits**) : ✅, puis **retirés le 28/09/2026** (les decks par défaut sont désormais les decks de bienvenue et le Starter Kit Final Fantasy ; les listes restent dans l'historique git). Quatre decks bicolores en cartes FRA seules (`packages/cards/decks/fra-*.json`), un par faction :
  - Fatehold : Jace renforcé (W/U) ;
  - Innovative : sorts préparés (U/R) ;
  - Formidable : cimetière (B/G) ;
  - Dedicated : Cadets en armes (R/W).
  
  Ils sont ajoutés après les deux decks FDN dans `DECKS` (les tests et le bench utilisent les deux premiers). Équilibrage vérifié par un tournoi toutes rondes entre IA heuristiques, 10 parties par affrontement : tous les decks gagnent entre 38 et 59 % de leurs parties.
- Reste pour FRA : Emrakul, Uldaros Theorix et Hall of Echoes, puis le réimport des textes français après le 2 octobre.
