/**
 * Enregistrement d'une partie : graine, joueurs et decks (dans l'ordre), puis toutes les décisions appliquées.
 * Le moteur étant déterministe, rejouer ces décisions redonne exactement la même partie : reprise d'une partie en
 * ligne après un redémarrage du serveur, replays, export d'une partie pour signaler un bug.
 *
 * Les decks sont enregistrés par noms de cartes : `resolve` redonne les définitions au rejeu.
 */
export { outcomeHash } from "./fingerprint";

import { outcomeHash } from "./fingerprint";
import { createGame, type GameOptions, type GameVariant, type StepResult, submit } from "./game";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export const RECORD_FORMAT = "mtgx-game";
export const RECORD_VERSION = 1;

/**
 * Version des règles du moteur. Elle avance à chaque lot qui change le comportement d'une partie (docs/plans/PLAN-R.md, lots
 * « [règles] ») : un enregistrement d'une autre version peut ne plus se rejouer à l'identique. Absente d'un
 * enregistrement : 0.
 *
 * - 1 : un compteur d'identifiants par préfixe (lot F1).
 * - 2 : corrections R0.1 (second partagé, protection, 704.5b, gagner ou perdre la partie, marqueurs payés comme coût,
 *   506.4).
 * - 3 : corrections R0.2 (taxes des sorts gratuits, taxes d'attaque et de blocage cumulées, obligation d'attaquer sans
 *   payer de taxe).
 * - 4 : nettoyage avec actions basées sur l'état, déclencheurs et priorité (514.3a, R0.3).
 * - 5 : lien de vie, un gain par source et par lot de blessures simultanées (R0.4).
 * - 6 : des permanents qui arrivent en même temps se voient arriver (603.6a, R0.5).
 * - 7 : accès unique aux statiques de joueur, conditions et effets sur les joueurs respectés partout (R4.0).
 * - 8 : marqueurs, types, état engagé, attaque, célérité et Imminence posés avant l'événement d'arrivée ; défenseur des
 *   jetons attaquants au choix (R2.1).
 * - 9 : copies de permanents (valeur de mana, loyauté et remplacements de la définition copiée, copie d'une copie,
 *   copie par une statique, copie d'un sort de Clone ; R2.2).
 * - 10 : un Clone ou une Aura qui arrive sans être lancé choisit ce qu'il copie ou enchante ; une Aura sans rien à
 *   enchanter reste dans sa zone (707.5, 303.4f, 303.4g ; R2.3).
 * - 11 : ordre des remplacements qui modifient un nombre (blessures, marqueurs, PV, pioche) choisi pour le joueur affecté ;
 *   toutes les pioches de la partie passent par les remplacements (616.1 ; R1).
 * - 12 : une copie de sort est un objet sur la pile ; nouvelles cibles au choix pour toute copie, qui deviennent ses
 *   cibles (garde) ; répartition des blessures et des marqueurs annoncée à la mise sur la pile, part d'une cible devenue
 *   illégale perdue (707.10c, 601.2d, 608.2b ; R3).
 * - 13 : le contrôle est une couche (613.1b) : contrôleur de base et effets de contrôle horodatés ; un joueur qui quitte
 *   la partie rend ce qu'il avait volé (800.4a ; R2.4).
 * - 14 : dépendances de couches par point fixe (conditions, « pour chaque », F/E définies qui lisent des permanents) ;
 *   exceptions de copie copiables ; couleurs ajoutées (613.8, 707.9b, 105.3 ; R2.5).
 * - 15 : protection et défense talismanique « contre [filtre] » : Sword of Wealth and Power protège des éphémères et
 *   des rituels, Resilient Roadrunner des Coyotes (702.16 ; R4.2).
 * - 16 : permissions de jouer depuis le cimetière ou le dessus de la bibliothèque unifiées (une permission sans coût passe
 *   avant Muldrotha ; Forgotten Cellar : seulement des sorts) ; modificateurs de coût des capacités unifiés (R4.4).
 * - 17 : mulligans tour de table par tour de table (103.5) ; blocages des défenseurs appliqués ensemble (509.1 ; R5).
 * - 18 : boucle d'actions obligatoires, partie nulle (104.4b) ; les déclenchements d'un joueur qui quitte la partie
 *   cessent d'exister (800.4a ; R6).
 * - 19 : justesse des cartes (R7) : « l'objet de l'événement » et « si la source… » lisent les dernières informations
 *   connues d'un objet parti (603.10) ; `pumpAll` respecte « autre » ; prouesses multiples ; terrain joué depuis le
 *   cimetière par une permission ; le solveur de mana préfère la capacité qui produit le plus (Tablet of Discovery).
 * - 20 : Tarkir: Dragonstorm, lot A : un « si » intermédiaire sur l'objet de l'événement est vérifié au déclenchement et
 *   à la résolution (603.4 ; Aclazotz) ; « a déjà infligé des blessures » (Karakyk Guardian) ; « valeur de mana X ou
 *   moins » dans une recherche (Nature's Rhythm).
 * - 21 : remplacements des blessures et de la perte de PV en données (`EventReplacement`, R1, familles E et F) ; une
 *   prévention d'un autre joueur que le blessé passe avant les modifications, la sienne après (616.1) ; boucliers « la
 *   prochaine fois que » (615.7, New Way Forward) ; des blessures prévenues ne comptent pas comme infligées.
 * - 22 : un permanent qui quitte le champ de bataille est toujours retiré du combat (506.4), quel que soit l'effet ou le
 *   coût qui le déplace (Lorwyn Eclipsed : « contemplez et exilez » un attaquant).
 * - 23 : Lorwyn Eclipsed, lot B : « du type choisi » lu partout (filtres d'effet, déclencheurs, réductions de coût,
 *   remplacements ; choix d'un sort ou d'un emblème) ; « quand il se transforme en… » ; flétrissure (702.80) ; « dégagez »
 *   retire un marqueur d'étourdissement (122.1d) ; les jetons créés sont au journal du tour ; « une autre carte » reconnaît
 *   la source morte ; une réduction de coût voit la carte lancée (contempler) ; « retirez un marqueur » de toute sorte ;
 *   le cache des couches est invalidé après le départ des permanents d'un joueur éliminé (800.4a).
 * - 24 : Lorwyn Eclipsed, lot C : un sort lancé est vu avec sa valeur de mana et son nom (filtres de mana restreint et de
 *   réductions de coût) ; mana restreint dans la réserve ; marqueurs mis au journal du tour ; un sort sur la pile peut
 *   gagner un mot-clé ; « lancer les cartes exilées liées » avec ses variantes (gratuit, une fois par tour, ce tour-ci…).
 * - 25 : Lorwyn Eclipsed, lot D : remplacements des familles H et I (jetons, marqueurs, PV gagnés, pioche, meule, mana) en
 *   données (`EventReplacement`), doubleurs et drapeaux convertis ; « ces jetons plus un jeton » appliqué une fois par
 *   événement ; un permanent peut ne pas pouvoir être dégagé ; « le terrain enchanté est de la couleur choisie ».
 * - 26 : Wilds of Eldraine, socle : jetons-Auras (Rôles), un seul Rôle par joueur sur un même permanent (704.5y).
 * - 27 : Secrets of Strixhaven, socle : une condition « si » d'une capacité déclenchée lit les montants de l'objet de
 *   l'événement (mana dépensé pour le sort lancé : Increment) ; Wilds of Eldraine, lots C4 et C5 : paiement de PV
 *   centralisé (Ashiok), « une fois par tour » depuis le dessus de la bibliothèque, coûts de capacités réduits.
 * - 28 : Secrets of Strixhaven, lot A : les montants « arrive avec » savent additionner, opposer, prendre un maximum et
 *   compter les couleurs dépensées (Sheriff of Safe Passage arrivait sans marqueur) ; les conditions « arrive avec »
 *   voient X ; « répartissez X marqueurs » sans minimum par cible quand X est plus petit que le nombre de cibles.
 * - 29 : Secrets of Strixhaven, lot A6 : le mana dépensé d'un éphémère ou d'un rituel qui se résout est lu (`manaSpent`) ;
 *   une carte lancée depuis l'exil avec « puis exilez-la » y retourne ; filtres de valeur de mana « X » et « couleurs
 *   dépensées ».
 * - 30 : Secrets of Strixhaven, lot C1 : « jouable jusqu'à votre prochain tour » pour le propriétaire (Memory Vessel ne
 *   valait que ce tour-ci) et « jusqu'à la fin de son prochain tour » ; qui a mis des marqueurs sur un objet ce tour-ci ;
 *   moitiés de PV et de main par joueur ; capacités retardées « au début de votre prochaine phase principale ».
 * - 31 : Secrets of Strixhaven, lot C2 : une copie de sort n'hérite plus des modifications d'arrivée de l'original ; le
 *   jeton copie d'un sort de permanent reçoit les siennes (célérité, sacrifice en fin de tour) ; sort gratuit de la main
 *   une fois par tour ; « ce sort ne peut pas être copié ».
 * - 32 : Secrets of Strixhaven, lot C3 : cascade (702.85) ; l'événement de pioche désigne la carte piochée (miracle) ;
 *   « lancer maintenant » pour un coût donné depuis la main.
 * - 33 : Murders at Karlov Manor, lot A : une capacité déclenchée « une à N cibles » respecte le minimum (Armament
 *   Dragon n'avait aucune cible sous N créatures) ; la condition d'un déclencheur voit l'événement (montant) ; « s'il
 *   n'a pas de carte en main » hors résolution ; désignation suspect (701.60).
 * - 34 : Murders at Karlov Manor, lot A6 : un sort ou une capacité à « X cibles » est proposé même sans cible (X = 0) ;
 *   l'IA ajuste X au nombre de cibles.
 * - 35 : Murders at Karlov Manor, lot B1 : réunir des preuves en coût de capacité (et de mana), en effet facultatif (N ou
 *   X), en garde, et « chaque fois que vous réunissez des preuves » ; choix automatique des preuves sans gâcher une carte
 *   chère ; garde « sacrifiez [type] » filtrée.
 * - 36 : Murders at Karlov Manor, lot B2 : X dans un coût de déguisement, coût de déguisement réduit, réduction des sorts
 *   face cachée, interdiction de retourner face visible, terrain lancé face cachée ; une arrivée face cachée est notée
 *   au journal du tour comme une créature sans type (la carte reste cachée).
 * - 37 : Murders at Karlov Manor, lot C3 : un sort qui quitte la pile passe par un seul chemin (exil ou dessous de la
 *   bibliothèque à la place du cimetière) ; `cond.refMatches` résout son filtre ; un déclencheur « quitte » d'une créature
 *   exilée suit la nouvelle carte ; effets « tant que la source reste engagée ».
 * - 38 : Avatar: The Last Airbender, socle : le mana de la maîtrise du feu reste jusqu'à la fin du combat (et non du tour) ;
 *   maîtrise de l'eau (artefacts et créatures engagés pour {1}) dans les coûts des capacités activées.
 * - 39 : Avatar: The Last Airbender, lot A5 : la force et l'endurance de la créature d'un événement qui a quitté le champ de
 *   bataille (« quand elle meurt, X étant sa force ») sont ses dernières informations connues (608.2h).
 * - 40 : Avatar: The Last Airbender, lot A6 : « X ne peut pas être 0 » (`minX`) refuse une activation avec un X trop petit
 *   (Katara, Water Tribe's Hope ; Gogo, Master of Mimicry).
 * - 41 : Avatar: The Last Airbender, lot B1 : maîtrise de l'eau en coût de sort (additionnel, X, facultatif), en garde,
 *   « à moins de payer » et en coût de remplacement des cartes liées ; contrôle d'un joueur limité à sa prochaine phase de
 *   combat ; marqueurs répartis d'une autre sorte, entre un nombre quelconque d'objets.
 * - 42 : Avatar: The Last Airbender, lot B2 : événement « vous maîtrisez [l'élément] » (eau payée, terre, feu résolu, air),
 *   noté au journal du tour ; réduction de coût par symboles colorés (Aang, Master of Elements).
 * - 43 : Avatar: The Last Airbender, lot C1 : F/E définies par des marqueurs sur des permanents, couleurs parmi un filtre
 *   et types exclus lus pendant les couches ; bonus par type de créature de chaque objet touché ; modes d'une capacité
 *   déclenchée sous condition ; regard fait par un joueur ciblé.
 * - 44 : Avatar: The Last Airbender, lot C2 : présage (702.143) ; « payez N PV ou {M} » ; flashback donné aux cartes du
 *   cimetière ; carte du dessus de la bibliothèque lancée par une permission ; blessures en excès d'un combat ; mana non
 *   dépensé gardé ou converti ; mots-clés des sorts ; la réserve de mana fait avancer la version d'état.
 * - 45 : Avatar: The Last Airbender, lot C3 : « gardez des créatures de force totale N ou moins » ; blessures augmentées
 *   des marqueurs de la source du remplacement ; capacité déclenchée par l'attaque d'une créature (événement) ; capacités
 *   de la carte liée choisie ; valeur de mana totale des cibles d'une capacité réflexive fixée à sa mise sur la pile.
 * - 46 : Marvel Super Heroes, lot A3 : le déclencheur « [cartes] mises dans une zone » respecte `nontoken` et `token`
 *   (un jeton n'est pas une carte : Moonshadow, Robot Domination).
 * - 47 : Marvel Super Heroes, lot A6 : dernières informations d'un permanent prises avant son retrait du combat (« quand
 *   une créature attaquante meurt ») ; un Équipement devenu créature se détache (301.5c) ; une carte de la bibliothèque
 *   lancée par une permission suit son timing ; les F/E définies par une capacité lisent « légendaire ».
 * - 48 : Marvel Super Heroes, lot B1 : improvisation (702.126), imprimée ou donnée aux sorts du joueur.
 * - 49 : Marvel Super Heroes, lot B2 : marqueurs de bouclier (122.1c : blessures et destruction remplacées par le retrait
 *   d'un marqueur) ; l'engagement d'un permanent est noté (cause « travail d'équipe », premier engagement du tour).
 * - 50 : Marvel Super Heroes, lot B3 : réductions du coût des montées en puissance ; usages comptés des capacités à
 *   usage unique (Wonder Man : une activation de plus).
 * - 51 : Marvel Super Heroes, lot C1 : « marqueurs mis par vous ce tour-ci » lu par les statiques (et par sorte) ;
 *   activer malgré le mal d'invocation ; blessures augmentées de la force de la source ; coût « retirez X marqueurs » ;
 *   symboles d'une couleur dans un coût ; prolifération sur une cible.
 * - 52 : Marvel Super Heroes, lot C2 : copie « jusqu'à votre prochain tour » avec exceptions (707.9b) ; contrôle jusqu'à
 *   la fin de votre prochain tour ; « devient la cible » pour les joueurs et les seules capacités ; filtre de `nextSpell`
 *   figé à la résolution ; capacités ciblées par contrôleur et source ; cibles du sort de l'événement ; connivence
 *   remplacée ; comparaison de deux montants.
 * - 53 : Marvel Super Heroes, lot C3 : deuxième depuis le dessus ; « défaussez une carte ou payez {M} » (coût et garde) ;
 *   garde « recevez N marqueurs poison » ; défausse après une révélation partielle ; choix dans sa propre main pour
 *   chaque joueur ; exil jusqu'à une carte dans la bibliothèque d'un autre joueur ; coût en symboles de mana du
 *   cimetière ; nombre maximal de copies lancées.
 * - 54 : Marvel's Spider-Man, lots B1 à C3 : créature renvoyée par le Web-slinging au choix, chaos donné et chaos d'un
 *   terrain, « ne peut pas être contrecarré » généralisé (Chimil et Hexing Squelcher protègent désormais tous vos sorts),
 *   émeute, redirection de blessures, permanents partis pendant une même décision (`leftBatch`).
 * - 55 : Teenage Mutant Ninja Turtles, lot B1 : faufilement lançable à l'étape des bloqueurs pour les créatures et les
 *   rituels, attaquant renvoyé au choix, permanent faufilé arrivant engagé et attaquant ; cibles « de joueurs différents »
 *   sans assez de joueurs : pas de cible légale.
 * - 56 : Teenage Mutant Ninja Turtles, lot C1 : « chaque adversaire exile jusqu'à… » pour chaque joueur désigné ; moitié de
 *   la bibliothèque arrondie au supérieur ; couleur choisie figée dans un effet « devient de la couleur choisie » ;
 *   faufilement donné depuis le cimetière ; sorts ciblant vos permanents ; réduction du prochain sort ; marqueurs d'un
 *   sort lancé du dessus de la bibliothèque ; sacrifice qui inclut la source ; cartes homonymes du cimetière.
 * - 57 : The Hobbit, lot A : un mana restreint produit à la main va dans la réserve restreinte ; le choix d'un type de
 *   créature propose aussi les types des jetons que créent les cartes de la partie.
 * - 58 : The Hobbit, lot C1 : marqueurs d'affûtage (+1/+0 à la créature équipée), cimetières de N cartes, déclencheur
 *   « activer une capacité d'une créature », mana d'un Trésor dépensé, contresort qui exile un permanent, permission
 *   payée en PV, carte révélée au hasard, capacités activées des cartes du cimetière, homonyme d'un permanent, carte
 *   venue du champ de bataille ce tour-ci.
 * - 59 : le contrôle donné par une Aura (ou un effet « tant que ») revient dès qu'elle quitte le champ de bataille, sans
 *   attendre les actions basées sur l'état (trouvé par le fuzz « chaos »).
 * - 60 : plafonds : 100 jetons au plus par événement, aucun au-delà de 400 objets sur le champ de bataille, montants
 *   remplacés bornés à un million (doubleurs de jetons qui se multiplient, trouvé par le fuzz « niveaux d'IA »).
 * - 61 : options proposées et décisions acceptées alignées (PLAN-C, lot C2, fuzz strict `--offers`) : « X cibles » avec
 *   X = 0, une cible peut payer le kicker (flétrir, Marchandage), un permanent sacrifié pour le coût d'une capacité peut
 *   d'abord produire son mana, payer 0 PV avec un total négatif, les preuves d'un mana ne prennent pas la carte qui
 *   s'exile pour sa capacité (plantage du moteur), sacrifices et « engagez X » par défaut d'abord sans capacité de mana
 *   (et réservés au paiement), Emrakul : la capacité du terrain dure jusqu'à ce que le sort soit lancé (601.2i), une
 *   capacité de mana sans couleur possible ne produit rien (106.7).
 * - 62 : les sources « engagez un autre permanent » (Springleaf Drum) se partagent les permanents à engager ; l'harmonie
 *   engage par défaut une créature sans capacité de mana (PLAN-C, lot C3, fuzz strict).
 * - 63 : 509.1c par maximisation : une déclaration de blocage n'est refusée que si une autre en respecte plus
 *   d'exigences (« bloque ce Loup si possible » et « doit être bloquée si possible » ne se bloquent plus l'une l'autre) ;
 *   509.1d : une taxe de blocage lève les exigences ; la déclaration d'attaque par défaut fait attaquer les créatures
 *   qui le doivent (sur le serveur, une corde expirée avec Juggernaut faisait abandonner la partie). PLAN-C, lot C4.
 * - 64 : mana marqué : une source restreinte ou porteuse d'un effet (Cavern of Souls) engagée à la main met son mana dans
 *   la réserve marquée avec sa source, son choix et son effet ; ces sources sont proposées à l'engagement manuel
 *   (PLAN-C, lot C5).
 * - 65 : objets payés en coût choisis par le joueur (`CastChoices.picks` : flétrir, marqueurs, exil du cimetière, preuves,
 *   sacrifier X, exiler un permanent, ninjutsu, convocation, improvisation, maîtrise de l'eau, cave ; sans choix, la
 *   suggestion du moteur, inchangée) ; le flétrir en kicker prend par défaut une créature qui survit, comme
 *   `blightTarget` (PLAN-C, lots C7 et C8).
 * - 66 : « en arrivant, choisissez… » demandé au joueur pour un terrain joué (`playLand.chosen`, Cavern of Souls) et
 *   pour un permanent mis en jeu par un effet (`moveTo`) (PLAN-C, lot C9).
 * - 67 : mots-clés accordés aux sorts (`spellKeywords`, `spellHasKeyword`) à la place de quatre drapeaux (flash, convocation,
 *   cave, second partagé) ; un sort sur la pile a les mots-clés que lui accordent les statiques de son contrôleur (Heartflame
 *   Duelist : lien de vie, copies comprises) (PLAN-C, lot C11).
 * - 68 : déclencheurs « une ou plusieurs … » : un par lot d'événements simultanés (`GameState.eventBatch`) ; Ordeal of
 *   Nylea se déclenche quelle que soit la façon dont elle est sacrifiée ; défausses en coût (Hallway Heckler, Solitary
 *   Cell, Murmuring Volume, Thunderhead Gunner, Avishkar Raceway) ; Pyrewood Gearhulk, The Earth Crystal, Chandra (+1),
 *   Boommobile (PLAN-C, lot C12).
 * - 69 : Thorin, Mountain-king ne blesse que si un Équipement devient attaché (701.3b) ; Dalkovan Encampment : capacité
 *   retardée indépendante du terrain (603.7) ; le jeton Esprit de Realm of Koh peut bloquer un Esprit (PLAN-C, lot C13).
 * - 70 : Cloud, Midgar Mercenary et The Masamune passent par `triggerMod` ; The Masamune double aussi les déclencheurs de
 *   vos emblèmes quand il n'est attaché à rien (Oracle) ; « a attaqué / a infligé des blessures ce tour-ci » lus dans le
 *   journal du tour (PLAN-C, lot C14).
 * - 71 : une source sacrifiée pour son coût de mana (Trésor) produit d'après sa dernière information connue : les
 *   remplacements de mana s'appliquent (Roxanne, Starfall Savant), comme le solveur les comptait (« Paiement incohérent »).
 * - 72 : coût additionnel « sacrifiez un nombre quelconque de permanents », chacun réduisant le coût de {1} (Rottenmouth
 *   Viper) ; permission de lancer depuis le cimetière limitée à l'Aventure (Mosswood Dreadknight) ; sort lancé avec un
 *   mot-clé dans le journal du tour (Momo, Friendly Flier) ; couleur du mana hybride choisie au lancer (Deceit) (lot K1).
 * - 73 : mana « en n'importe quelle combinaison de couleurs » réparti par le solveur ou par le joueur (Vivi Ornitier,
 *   Muerra…) ; « chaque fois que vous mettez des marqueurs » ne compte que ceux que vous mettez, sur toute créature si le
 *   texte le dit ; « engagez N créatures dégagées » peut engager la source (302.6) (lot K2).
 * - 74 : terrain choc mis sur le champ de bataille par un effet : son futur contrôleur peut payer les points de vie pour
 *   qu'il arrive dégagé ; « défaussez votre main » est un coût (Reverberating Summons, Connecting the Dots, Tarrian's
 *   Journal) ; une capacité déclenchée accordée « si… » revérifie sa condition à la résolution (603.4) ; moments corrigés
 *   par script (Earthbender Ascension, Fire Lord Azula, Azog, Puca's Eye, Ill-Timed Explosion, Granite Witness, Ezrim,
 *   Sewer-veillance Cam, Rattleback Apothecary) (lot K3).
 * - 75 : Liliana the Faultless : « défaussez une carte » est un coût (lot K4).
 * - 76 : choix rendus au joueur : sorte des marqueurs retirés par un effet ; objets des coûts additionnels d'un sort
 *   (exiler, renvoyer, engager, exiler du cimetière, contempler et exiler) ; choix non ciblés à la résolution (Seasons,
 *   Wick, Mistbreath Elder, Zell Dincht, Arid Archway, Renforcez Jace) ; « vous pouvez », « jusqu'à » (Esper Terra,
 *   Beatrix, Hama, Avatar Destiny, Severance Priest, Rambling Possum) ; cibles « autre que cette créature » (Pawpatch
 *   Recruit) et « qui l'a montée » (Giant Beaver) (lot K6).
 * - 77 : durées : « jusqu'à votre prochaine étape de fin » pour les cartes jouables (Shadow Urchin, Seek the Beast, Haste
 *   Magic, Opera Love Song), « tant que vous contrôlez [la source] » (Ty Lee, Spider-Woman), « tant qu'il reste engagé »
 *   (Braided Net), emblème « jusqu'à la fin de votre prochain tour » (Season of the Bold) (lot K7).
 * - 78 : un jeton décrit engagé (`TokenSpec.tapped`) arrive engagé (Tenured Tethermage) ; Dread Summons et Revenge of the
 *   Rats créent des jetons engagés ; Biogenic Upgrade demande une à trois cibles (lot K8, FDN).
 * - 79 : « une ou deux cibles » : au moins une (Get Out, Coordinated Clobbering, Omnivorous Flytrap, Untimely
 *   Malfunction) (lot K8, DSK).
 * - 80 : Aetherdrift (lot K8) : un Véhicule devenu créature par l'exhaust le reste ; Boom Scholar donne aussi le
 *   piétinement aux Véhicules ; Cloudspire Skycycle (une ou deux cibles), Cloudspire Coordinator (journal du tour),
 *   Demonic Junker (seulement si la créature est détruite), Gastal Thrillroller (défausse en coût), Gonti (mana de
 *   n'importe quel type), Full Throttle (toutes les créatures qui ont attaqué), Lifecraft Engine (Véhicules pilotés).
 * - 81 : une condition sur une cible ou l'objet de l'événement encore sur le champ de bataille lit le filtre complet
 *   (« arrivée ce tour-ci », Malamet Battle Glyph) ; le joueur qui découvre est fixé au premier passage (Zoyowa's
 *   Justice) ; The Lost Caverns of Ixalan (lot K8) : The Ancient One, Dire Blunderbuss, Sunfire Torch (objets liés aux
 *   capacités réflexives), Cosmium Confluence (Caverne choisie, non ciblée), The Myriad Pools (mana du terrain), Jade
 *   Seedstones (une à trois cibles), Hurl into History (contrecarre, puis découvre).
 * - 82 : un choix dans une zone garde la valeur de mana maximale de son filtre ; Wreck Remover exile bien la carte du
 *   cimetière ; Final Fantasy (lot K8) : Ambrosia Whiteheart (renvoi non ciblé), Delivery Moogle, Eden (« un autre »),
 *   Ignis Scientia, Qutrub Forayer et Magic Pot (exil depuis le cimetière), Rydia (X vérifié à la résolution).
 * - 83 : Outlaws of Thunder Junction (lot K8) : Final Showdown, Pillage the Bog, Marchesa, Oko, Rakdos, Geralf, Calamity,
 *   Lazav, Lilah, Bucolic Ranch, Demonic Ruckus, Reach for the Sky.
 * - 84 : « N blessures à chaque créature et chaque planeswalker » blesse aussi les planeswalkers (Calamitous Cave-In,
 *   Splatter Technique, Dragonback Assault, Fulminous Forte) ; Reality Fracture (lot K8) : Ajani's Anguish et Fblthp (le
 *   X de la carte lancée), Hunter's Axe (piétinement ou contact mortel, au choix), Tinybones, Pocket Nuisance (une fois
 *   par défausse groupée).
 * - 85 : une capacité déclenchée de palier (station) se déclenche même sans capacité déclenchée imprimée (Dawnsire,
 *   Entropic Battlecruiser, Sledge-Class Seedship, Synthesizer Labship) ; Edge of Eternities (lot K8) : Archenemy's
 *   Charm (une ou deux cibles), Pain for All (« une autre cible »), Broodguard Elite (tous ses marqueurs).
 * - 86 : « arrive avec » un nombre de marqueurs lu dans l'état de la partie (Gev, Scaled Scorch) ; remplacement de
 *   marqueurs « si vous deviez mettre » (`byYou`, Innkeeper's Talent) ; Bloomburrow (lot K8) : Dragonhawk (jusqu'à votre
 *   prochaine étape de fin), Kitnap (pas de marqueurs d'étourdissement si le cadeau est promis), Gev (vos créatures).
 * - 87 : « au choix » choisi à la résolution (608.2d, `fx.yourChoice`) et non comme un mode : Practiced Offense, Wingnut,
 *   Manifold Mouse ; Iceberg Titan engage ou dégage à la résolution (PLAN-D, lot D1).
 * - 88 : « quand vous le faites » après un remplacement ou une arrivée : capacité réflexive mise sur la pile (Head of the
 *   Hunt : le Loup ; Superior Spider-Man : l'exil de la carte copiée) (PLAN-D, lot D3).
 * - 89 : contempler en coût additionnel (`additionalCost.behold`) : choisi au lancement, la carte de la main révélée,
 *   retenu par le sort (`cond.beheld`), « ou payez {N} » ; contempler pendant une résolution (`fx.mayBehold`) : les
 *   Exhales, Countersculpt, les cinq « contemplez ou payez {2} » d'ECL, Sarkhan, Elven Passage (PLAN-D, lot D2).
 * - 90 : une valeur de mana de cible calculée (`maxManaValueAmount`) est évaluée au ciblage d'une capacité déclenchée,
 *   puis à la résolution (Moseo, Vein's New Dean) (PLAN-D, lot D4).
 * - 91 : condition retenue au lancement (`whenCast`, Faerie Fencing, Steer Clear) ; condition du déclencheur vérifiée au
 *   déclenchement seulement (`triggerCondition`, Social Snub) (PLAN-D, lot D5).
 * - 92 : « jusqu'à X cibles » d'une capacité déclenchée choisies au déclenchement (Prismabasher, Heroic Feast, Rollercrusher
 *   Ride…) ; modes d'une capacité réflexive (Hylda) et d'une capacité modale accordée ; Ghostly Dancers choisit à la
 *   résolution (PLAN-D, lot D6).
 * - 93 : sorte de marqueur retirée en coût choisie par le joueur (`counterKind`) ; copies facultatives de Moonlit
 *   Meditation et Mirrormind Crown ; Équipement ou hôte choisi à la résolution (Light of Judgment, Unexpected Request,
 *   One Last Job : `chooseAmong.optional`, `moveTo.attachTo`) ; coût « engagez quatre permanents » qui garde le mana
 *   nécessaire (Guardian of the Great Door) (PLAN-D, lot D7).
 * - 94 : petits écarts (PLAN-D, lot D8) : mots-clés lus seulement s'ils sont imprimés (Dion, Peter Parker, Goddric,
 *   Reluctant Role Model) ; terrains de butin jouables (Tinybones) ; carte du cimetière lancée pendant une résolution sans
 *   le flash (Tinybones, the Pickpocket) ; X figé à la défausse (Ill-Timed Explosion) ; « tant que ce terrain a un
 *   marqueur de fléau » (Ultima) ; permission liée à l'objet (Lightning) ; Glowcap Lantern attachée ; Faller's Faithful,
 *   Sunstar Expansionist, Singularity Rupture.
 * - 95 : « réunir des preuves » par un effet : le joueur choisit les cartes exilées (Izoni, Evidence Examiner, Sample
 *   Collector… ; PLAN-D, lot D9).
 * - 96 : une source de mana qui réunit des preuves (Cryptex) ne prend pas un objet réservé par le reste du coût
 *   (matériau de fabrication) ; trouvé par le fuzz de départ du PLAN-S.
 * - 97 : le journal du tour devient la seule source de « ce tour-ci » (PLAN-S, lot S2) : vie gagnée et perdue, pioches,
 *   défausses, regards, crimes, activations de loyauté, retournements ; « un adversaire » y est un adversaire encore en
 *   partie (800.4a) ; « arrivé face cachée » compte toute arrivée face cachée (Oblivious Bookworm).
 * - 98 : familles de montants (PLAN-S, lot S3) : `aggregate` (valeur de mana calculée sur le champ de bataille : une copie
 *   a celle de ce qu'elle copie, 707.2 ; force totale à l'arrivée sans l'objet qui arrive), `spent`, `manaSymbols`,
 *   référence `playersWhere`.
 * - 99 : comment un sort a été lancé (PLAN-S, lot S4) : `CastInfo` sur l'élément de pile puis sur le permanent ;
 *   évocation, distorsion et imminence sont des coûts alternatifs (`via`) ; « si ce sort a été lancé depuis un cimetière »
 *   lit la zone de lancement (et non plus la marque du flashback).
 * - 100 : les effets « toutes les … » agissent sur une référence de zone (PLAN-S, lot S6c) : le X du sort dans un filtre
 *   est lu par la référence (`withX`) ; `destroy` mémorise aussi le nombre de permanents détruits.
 * - 101 : familles d'effets (PLAN-S, lots S6d et S6e) : `extra`, `spellFate`, `gainControl` (durées, joueur `to`),
 *   `grantPlay{flashback}`, exil de distorsion par `moveTo` (`moveWithSpec`), référence `sameName` (Maelstrom Pulse),
 *   durée des emblèmes.
 * - 102 : filtres (PLAN-S, lot S8b) : les sous-filtres `anyOf` et `not` sont évalués comme le filtre lui-même (champs
 *   propres à l'objet, valeurs choisies) au lieu d'être lus seulement sur la vue (un champ inconnu y était ignoré).
 * - 103 : rééditions (PLAN-G, lot G2a) : mode lancé pour son propre coût (surcharge, fendre), escalade, ruée et
 *   spectacle ; le nombre de cartes d'une recherche faite par d'autres joueurs se lit du point de vue de chacun.
 * - 104 : rééditions (PLAN-G, lot G2b) : défense totale ; exaltation, affinité pour les artefacts, modulaire, greffe et
 *   extorsion lues dans le texte (l'extorsion de The Kingpin of Crime n'est plus écrite à la main) ; une source qui
 *   produit 0 mana (Vivi Ornitier de force 0) ne paie plus rien ; une capacité au seul coût {X} est proposée à partir de 1.
 * - 105 : déluge lu dans le texte (G2c) : les sorts lancés avant lui, par tous les joueurs, comptés au lancement (et non
 *   à la résolution ni seulement les vôtres : Stormscale Scion) ; surcharge et fendre proposées dans une option de
 *   lancement à part (sans gratuité) ; un sort qu'un joueur éliminé contrôle sans le posséder est exilé (800.4a).
 * - 106 : terrains de Stellar Sights (G3a) : contrepartie d'une capacité de mana (`drawback` : blessures à vous, PV aux
 *   adversaires).
 * - 107 : terrains de Stellar Sights (G3b) : infection (702.90), régénération (701.19, boucliers retirés au nettoyage),
 *   déplacer un marqueur, mana des couleurs de vos permanents ou des types de vos terrains, leyline conditionnelle.
 * - 108 : Special Guests (G4a) : traversée de terrain, « n'attaque pas deux fois le même joueur », statiques de joueur
 *   qui touchent d'autres joueurs (`affects`), déclencheur « vous copiez un sort », suspension depuis la main (action
 *   spéciale), carte contrecarrée mémorisée où qu'elle aille (`storeMoved`).
 * - 109 : Special Guests (G4b) : destruction sans régénération possible (`noRegenerate`, Damnation).
 * - 110 : Special Guests (G4c) : limite de sorts par types (`castLimit.spellTypes`), « un joueur joue un terrain »
 *   (`playLand.whose`).
 * - 111 : Breaking News (G6) : la recherche dans sa bibliothèque est notée au journal du tour (Archive Trap).
 * - 112 : Through the Ages (G7) : une capacité de mana peut engager un artefact (`tapAnother: "artifact"`, Urza).
 * - 113 : mana phyrexian (107.4f, G4e) : chaque {C/P} se paie avec du mana, sinon 2 PV ; K'rrik (`phyrexianMana`).
 * - 114 : coûts alternatifs qui font payer des PV, exiler des cartes de la main ou renvoyer un permanent (`altCost.pay`).
 * - 115 : règles de joueur (victoire sur pioche impossible, plancher de PV, blessures comme l'infection à 0 PV, cartes des
 *   cimetières non ciblables), remplacement « trois fois autant » du mana, dé à N faces, mue (702.37).
 * - 116 : combat : un joueur bloque avec au plus N créatures, au plus une créature attaque un joueur ; destruction notée avec
 *   le joueur qui détruit (déclencheur `destroyed`) ; défense talismanique d'un joueur contre un filtre ; retrace (702.81).
 * - 117 : folie (702.35), émerger (702.119), réplique (702.56), évasion donnée, rôder accordé, gagner le contrôle d'un sort,
 *   lancer seulement au moment d'un rituel, exceptions de copie en `entersAsCopyMods`.
 * - 118 : étape de pioche passée, pioche volée (Notion Thief), tours supplémentaires passés, défausse au-dessus de la
 *   bibliothèque, taille de main maximale générique (et condition d'une statique lue pour son contrôleur), PV payés au
 *   choix, meule répétée par couleur, une carte par type (Atraxa).
 * - 119 : jetons copies créés par d'autres joueurs, cascade filtrée, F/E égales aux cartes liées.
 * - 120 : défausser X cartes en coût, permission de jouer pour les autres joueurs, Aura attachée à un joueur au hasard,
 *   couleur choisie ajoutée.
 * - 121 : phasing (702.26), vote et paiement par un autre joueur, déclencheur du prochain sort lancé, Saga transformée en
 *   terrain avec l'évasion donnée.
 * - 122 : passe sur les approximations (A0) : « le joueur défenseur » d'un déclencheur d'attaque dont la source n'attaque
 *   pas est celui de l'attaquant (Raid Bombardment) ; retirer tous les marqueurs ne demande plus leur sorte.
 * - 123 : approximations levées par script (A1) : Kellan, the Kid lance le sort, Dyadrine fait choisir les créatures,
 *   capacités « quand elle se transforme » sur la face arrière (Ultimecia, Black Chocobo), Tellah en un déclenchement…
 * - 124 : approximations levées par script (A2) ; « faites ceci une seule fois par tour » revérifié à la résolution (deux
 *   déclenchements sur la pile) ; « une autre carte » exclut aussi la carte de la créature morte (nouvel identifiant).
 * - 125 : un permanent exilé ou renvoyé en coût additionnel n'ajoute plus son remplacement de mana au paiement proposé
 *   (Champion of the Path, Lavaleaper) ; une créature qui doit attaquer mais ne peut attaquer aucun défenseur n'y est
 *   plus obligée (The Void, Storm, Windrider).
 * - 126 : familles génériques (A3c) : attaquants distincts au journal du tour, mana restreint à une sorte de capacité
 *   (équiper, déverrouiller, retourner…), objet contemplé lisible après le coût, « vous / un adversaire subit des
 *   blessures » de toute source.
 * - 127 : familles génériques (A3b) : taille de main maximale dans l'ordre d'horodatage, « choisissez les deux » si le
 *   coût additionnel est payé (un seul mode refusé), un nouveau type de terrain ne remplace que les types de terrain
 *   (205.1a, 305.7), montures et équipages cumulés sur le tour, marqueurs d'arrivée en montant.
 * - 128 : familles génériques (A3a) : filtre de propriétaire et référence `ownerOf`, dernier contrôleur connu d'un objet
 *   parti du champ de bataille ce tour-ci (`controllerOf`), noms différents au choix et au sacrifice en coût,
 *   destinataire des blessures des déclencheurs (`to`).
 * - 129 : familles moyennes (A4b) : objets d'un lot « un ou plusieurs » (`ref.eventObjects`), capacité retardée liée à
 *   un objet pour le reste du tour (`fx.whenThisTurn`, 603.7c), « la première fois chaque tour » noté avant la
 *   condition « si » (`oncePerTurn: "firstEvent"`).
 * - 130 : familles moyennes (A4a) : cible détenue par un joueur désigné (`TargetSpec.of` : joueur de l'événement,
 *   joueur défenseur, joueur d'une autre cible), nouvelles cibles d'un sort à plusieurs cibles, capacité accordée qui
 *   connaît le permanent qui l'accorde (`ref.grantor`, `CostDef.grantor`).
 * - 131 : familles moyennes (A4c) : sort gratuit depuis toute zone (`castPermission.freeFrom`), phases et étapes
 *   ajoutées à leur place (files `turn.addedPhases`/`addedSteps`, rang de la phase principale), marqueurs retirés parmi
 *   plusieurs créatures choisis par le joueur ; le renvoi d'une créature par web-slinging est compté avant le mana.
 * - 132 : impressions de la table (`STA-42@<id>`, `printing.ts`) gardées par `createGame` et montrées par la vue.
 * - 133 : Commander (PLAN-E, E2) : variante `commander` (40 PV, zone de commandement, lancer depuis elle avec la taxe,
 *   retour dans la zone de commandement 903.9a et 903.9b, 21 blessures de commandant) ; seuls les emblèmes ont des
 *   capacités actives dans la zone de commandement.
 * - 134 : mulligan gratuit dans une partie à trois joueurs ou plus (103.5c) : le premier mulligan ne compte pas.
 * - 135 : mécaniques qui citent le commandant (PLAN-E, E6) : mana de l'identité du commandant, filtre `commander`,
 *   capacités qui fonctionnent depuis la zone de commandement (éminence), mana des terrains d'un adversaire.
 * - 136 : base de mana des decks Commander (PLAN-E, E8) : `tapAnother` d'une capacité de mana accepte un filtre
 *   (Relic of Legends), lu par le solveur de paiement.
 * - 137 : vampires d'Edgar Markov (PLAN-E, E10) : ascension et bénédiction de la cité (702.131, action basée sur
 *   l'état) ; la condition d'un `entersWith` qui touche d'autres permanents est vérifiée (Vampire Socialite).
 * - 138 : deck de Y'shtola (PLAN-E, E12) : entretien cumulatif (702.24), rebond imprimé, déclencheur de pioche « sauf la
 *   première de son étape de pioche » (`turnDraw`), changement de zone « d'un adversaire ».
 * - 139 : sorts communs des decks Commander (PLAN-E, E9) : protection d'un joueur (« des adversaires » ou « contre tout »,
 *   702.16j), « votre total de PV ne peut pas changer » (perte de PV prévenue, 119.8 : PV payables 0), verso terrain
 *   d'une carte modale joué comme terrain (712.12), « choisissez un ou plus » (`oneOrMore`).
 * - 140 : deux sources « comme les terrains » (Exotic Orchard chez deux joueurs) ne se consultent plus l'une l'autre
 *   (récursion infinie trouvée par le fuzz Commander à trois).
 */
export const RULES_VERSION = 140;

/** Un point de contrôle toutes les N décisions (plus la dernière de la partie). */
export const CHECKPOINT_EVERY = 25;

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  version: typeof RECORD_VERSION;
  seed: number;
  /**
   * Premier joueur imposé à la création (absent : tiré au sort par le moteur, ce qui consomme son hasard ; le rejeu doit
   * refaire ce tirage, pas le remplacer par son résultat).
   */
  startingPlayer?: PlayerId;
  startingLife?: number;
  /** Variante de règles (PLAN-E : `commander`). */
  variant?: GameVariant;
  /**
   * `printings` : impression choisie pour chaque carte du deck (même ordre ; absente si aucune) ; `commanders` : indices
   * des commandants dans le deck (Commander).
   */
  players: { id: PlayerId; name: string; deck: string[]; printings?: (string | null)[]; commanders?: number[] }[];
  /** Décisions appliquées, dans l'ordre : [joueur qui a décidé, décision]. */
  decisions: [PlayerId, Decision][];
  /** Date de début (ISO), pour l'affichage. */
  createdAt?: string;
  /** Version des règles du moteur qui a joué la partie (absente : 0). */
  rules?: number;
  /** Points de contrôle : [nombre de décisions appliquées, `outcomeHash` de l'état obtenu]. */
  checkpoints?: [number, string][];
}

/** Crée la partie et l'enregistrement qui permettra de la rejouer. */
export function createRecordedGame(opts: GameOptions): StepResult & { record: GameRecord } {
  const result = createGame(opts);
  const record: GameRecord = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    seed: opts.seed,
    startingPlayer: opts.startingPlayer,
    startingLife: opts.startingLife,
    ...(opts.variant ? { variant: opts.variant } : {}),
    players: opts.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map((c) => c.name),
      ...(p.printings?.some(Boolean) ? { printings: p.deck.map((_, i) => p.printings?.[i] ?? null) } : {}),
      ...(p.commanders?.length ? { commanders: [...p.commanders] } : {}),
    })),
    decisions: [],
    createdAt: new Date().toISOString(),
    rules: RULES_VERSION,
    checkpoints: [],
  };
  return { ...result, record };
}

/**
 * Ajoute une décision acceptée à l'enregistrement, avec un point de contrôle toutes les `every` décisions
 * (`CHECKPOINT_EVERY` par défaut ; 1 pour la sauvegarde d'une partie locale, vérifiée décision par décision à la reprise).
 */
export function recordDecision(
  record: GameRecord,
  player: PlayerId,
  d: Decision,
  after: GameState,
  every: number = CHECKPOINT_EVERY,
): void {
  record.decisions.push([player, d]);
  const n = record.decisions.length;
  if (n % every !== 0 && !after.over) return;
  record.checkpoints = [...(record.checkpoints ?? []), [n, outcomeHash(after)]];
}

/** Vérifie la forme d'un enregistrement reçu (fichier importé, disque du serveur). */
export function isGameRecord(x: unknown): x is GameRecord {
  const r = x as Partial<GameRecord> | null;
  return (
    !!r &&
    r.format === RECORD_FORMAT &&
    r.version === RECORD_VERSION &&
    Number.isInteger(r.seed) &&
    (r.rules === undefined || Number.isInteger(r.rules)) &&
    (r.checkpoints === undefined ||
      (Array.isArray(r.checkpoints) &&
        r.checkpoints.every((c) => Array.isArray(c) && Number.isInteger(c[0]) && typeof c[1] === "string"))) &&
    (r.startingPlayer === undefined || typeof r.startingPlayer === "string") &&
    (r.variant === undefined || r.variant === "commander") &&
    Array.isArray(r.players) &&
    r.players.every(
      (p) =>
        typeof p?.id === "string" &&
        typeof p.name === "string" &&
        Array.isArray(p.deck) &&
        (p.commanders === undefined ||
          (Array.isArray(p.commanders) && p.commanders.every((i) => Number.isInteger(i) && i >= 0 && i < p.deck.length))) &&
        (p.printings === undefined ||
          (Array.isArray(p.printings) && p.printings.every((k) => k === null || typeof k === "string"))),
    ) &&
    Array.isArray(r.decisions) &&
    r.decisions.every((d) => Array.isArray(d) && typeof d[0] === "string" && !!d[1] && typeof d[1] === "object")
  );
}

function initial(record: GameRecord, resolve: (name: string) => CardDef): StepResult {
  return createGame({
    seed: record.seed,
    startingPlayer: record.startingPlayer,
    startingLife: record.startingLife,
    variant: record.variant,
    players: record.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map(resolve),
      printings: p.printings,
      commanders: p.commanders,
    })),
  });
}

/** Rejoue la partie jusqu'à la décision `upTo` (exclue ; toutes par défaut) : état et événements produits. */
export function replayGame(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  upTo = record.decisions.length,
): { state: GameState; events: GameEvent[] } {
  let { state, events } = initial(record, resolve);
  const all = [...events];
  for (const [player, d] of record.decisions.slice(0, upTo)) {
    ({ state, events } = submit(state, player, d));
    all.push(...events);
  }
  return { state, events: all };
}

/** Tous les états de la partie : le départ, puis un par décision (replays pas à pas). */
export function replayStates(record: GameRecord, resolve: (name: string) => CardDef): GameState[] {
  let { state } = initial(record, resolve);
  const out = [state];
  for (const [player, d] of record.decisions) {
    state = submit(state, player, d).state;
    out.push(state);
  }
  return out;
}

/** Rejeu vérifié : où et pourquoi la partie cesse d'être celle qui a été enregistrée. */
export interface ReplayDivergence {
  /** Nombre de décisions appliquées sans écart. */
  index: number;
  reason: "error" | "checkpoint";
  message: string;
}

/**
 * Rejoue l'enregistrement en vérifiant ses points de contrôle, et s'arrête à la première divergence : décision refusée
 * (ou erreur du moteur), ou empreinte différente. `onStep` reçoit chaque état validé (le départ compris) et les événements
 * qui y mènent. Seuls les états antérieurs au point de contrôle qui échoue sont montrés comme sûrs : l'écart peut dater
 * d'avant lui, mais pas d'avant le point de contrôle précédent.
 */
export function replayChecked(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  onStep?: (state: GameState, events: GameEvent[]) => void,
): { state: GameState; applied: number; divergence: ReplayDivergence | null } {
  let { state, events } = initial(record, resolve);
  onStep?.(state, events);
  const expected = new Map(record.checkpoints ?? []);
  let verified = { state, applied: 0 };
  const pending: [GameState, GameEvent[]][] = [];
  const flush = () => {
    for (const [st, ev] of pending) onStep?.(st, ev);
    pending.length = 0;
  };
  for (let i = 0; i < record.decisions.length; i++) {
    const [player, d] = record.decisions[i] as [PlayerId, Decision];
    try {
      ({ state, events } = submit(state, player, d));
    } catch (e) {
      flush();
      const message = e instanceof Error ? e.message : String(e);
      return { state, applied: i, divergence: { index: i, reason: "error", message } };
    }
    pending.push([state, events]);
    const hash = expected.get(i + 1);
    if (hash === undefined) continue;
    if (hash !== outcomeHash(state)) {
      pending.length = 0;
      return {
        state: verified.state,
        applied: verified.applied,
        divergence: { index: verified.applied, reason: "checkpoint", message: `écart constaté à la décision ${i + 1}` },
      };
    }
    flush();
    verified = { state, applied: i + 1 };
  }
  flush();
  return { state, applied: record.decisions.length, divergence: null };
}
