# Teenage Mutant Ninja Turtles (TMT, « Les Tortues Ninja », 188 cartes)

Mécaniques et détail des lots.

Extension demandée par l'utilisateur le 02/10/2026, après Marvel's Spider-Man et avant The Hobbit. 12 cartes étaient déjà gérées depuis la phase méta (lots M1 à M6, `docs/extensions/meta.md`) : faufilement (lu dans le texte, coût alternatif en renvoyant un attaquant non bloqué), jetons Mutagène, Classes… L'extension suit les règles d'intégration de CLAUDE.md (dette, R1, R7). Découpage : un sous-lot et un commit par couleur pour le lot A, par mécanique pour le lot B, par famille de cartes uniques ensuite.

| Mécanique | Lot |
|---|---|
| Socle : jetons | 0 |
| Cartes faisables avec le moteur, par couleur | A1 à A6 |
| Mécaniques phares restantes | B |
| Légendaires et cartes uniques | C et suivants |

Les scripts sont dans `packages/cards/src/tmt/` : `cards` (cartes du méta), `white`, `blue`, `black`, `red`, `green`, `multi` et `artifacts` (incolores et terrains). Les aides sont dans `tmt/common.ts`.

## Sous-lot 0 : socle ✅ (12 / 188)

- **Jetons :** Mutant 2/2 rouge, Ninja 1/1 noir, Robot 1/1 incolore (artefact), Insecte Guerrier 1/1 noir, Dinosaure Soldat 2/2 blanc ; Mutagène et Esprit Tortue Ninja existaient ; Rat, Nourriture et Trésor viennent des communs.
- **Moteur :** « si son coût de faufilement a été payé » se lit aussi sur le permanent (`cond.castVia("sneak")`, comme le Web-slinging et le chaos).
- **Tests :** test de fumée `ai/test/smoke/tmt.test.ts`.

## Sous-lot A1 : cartes blanches ✅ (38 / 188)

- **Cartes (26) :** Action News Crew, Agent Bishop, Man in Black, April O'Neil, Kunoichi Trainee, Dimensional Exile, East Wind Avatar, Featherbrained Filcher, Grounded for Life, Hamato Guardian Stance, High-Flying Ace, Jennika, Bad Apple Big Sister, Koya, Death from Above, Leader's Talent, Leonardo, Big Brother, Leonardo, Cutting Edge, Leonardo, Leader in Blue, Leonardo, Sewer Samurai, Leonardo's Technique, Lita, Little Orphan Amphibian, Mighty Mutanimals, Prehistoric Pet, Quintessential Katana, Sally Pride, Lioness Leader, Triceraton Commander, Turncoat Kunoichi, Turtles Forever, Uneasy Alliance.
- **Moteur :** rien de nouveau.
- **Écart trouvé :** le faufilement n'était pas jouable pour une créature ou un rituel (aucune fenêtre de lancement, pas d'arrivée engagée et attaquante) ; corrigé au sous-lot B1, où les deux tests désactivés (Leonardo, Leader in Blue ; Turncoat Kunoichi) sont réactivés.
- **Tests :** 37 tests de règles (« lot A, blanc ») ; The Ooze : un Mutagène par marqueur +1/+1 d'une créature qui part (la note qui le disait intestable était périmée).

## Sous-lot A2 : cartes bleues ✅ (62 / 188)

- **Cartes (24) :** April, Reporter of the Weird, Bespoke Bō, Buzz Bots, Crustacean Commando, Does Machines, Donatello, Gadget Master, Donatello, Mutant Mechanic, Donatello, Turtle Techie, Donatello, Way with Machines, Donatello's Technique, Kitsune, Dragon's Daughter, Kitsune's Technique, Krang, Master Mind, Metalhead, Mind Transfer Protocol, Ooze Spill, Ray Fillet, Man Ray, Renet, Temporal Apprentice, Retro-Mutation, Return to the Sewers, Sewer-veillance Cam, Stockman, Mad Fly-entist, Turtles in Time, Utrom Scientists.
- **Correctif du moteur :** un déclencheur dont les cibles doivent être « contrôlées par des joueurs différents » n'a pas de cible légale quand les créatures possibles sont toutes à un même joueur (603.3d) ; il demandait un choix impossible (Kitsune, Dragon's Daughter, trouvé par le fuzz ; test dans `rulings.test.ts`).
- **Dette :** « mélangez main et cimetière, puis piochez » sert aussi à Turtles in Time : son entrée est retirée.
- **Reste pour plus tard :** April O'Neil, Hacktivist (types distincts parmi les sorts lancés ce tour-ci), Fugitive Droid (cibler un sort qui cible vos permanents), Mondo Gecko (défense talismanique contre une couleur choisie).
- **Tests :** 32 tests de règles (« lot A, bleu ») et un dans `rulings.test.ts`.

## Sous-lot A3 : cartes noires ✅ (86 / 188)

- **Cartes (24) :** Anchovy & Banana Pizza, Armaggon, Future Shark, Bebop, Warthog Warrior, The Cloning of Shredder, Death in the Family, Foot Mystic, Insectoid Exterminator, Lord Dregg, Insect Invader, Madame Null, Power Broker, Oroku Saki, Shredder Rising, Pain 101, Paramecia Coloniex, Savanti Romero, Time's Exile, Shark Shredder, Killer Clone, Shredder, Unrelenting, Shredder's Armor, Shredder's Revenge, Shredder's Technique, South Wind Avatar, Splinter, Hamato Yoshi, Splinter's Technique, Stomped by the Foot, Super Shredder, Tunnel Rats.
- **Moteur :** rien de nouveau.
- **Reste pour plus tard :** Ninja Teen (au niveau 3, faufilement donné aux cartes de créature du cimetière), Rat King, Verminister (« la carte ciblée et toutes les autres cartes du même nom »).
- **Tests :** 29 tests de règles (« lot A, noir »).

## Sous-lot A4 : cartes rouges ✅ (111 / 188)

- **Cartes (25) :** Bot Bashing Time, Broadcast Takeover, Casey Jones, Jury-Rig Justiciar, General Traag, Heart of Stone, Hard-Won Jitte, Improvised Arsenal, Jennika's Technique, Manhole Missile, Mouser Attack!, Mouser Foundry, Mutant Town Musicians, Null Group Biological Assets, Old Hob, Alleycat Blues, Purple Dragon Punks, Raphael, Most Attitude, Raphael, Ninja Destroyer, Raphael, the Nightwatcher, Raphael, Tough Turtle, Raphael's Technique, Ravenous Robots, Rock Soldiers, Slash, Reptile Rampager, Spicy Oatmeal Pizza, Wingnut, Bat on the Belfry, Zog, Triceraton Castaway.
- **Moteur :** rien de nouveau. « Défaussez votre main et piochez sept cartes » sert aussi à Raphael's Technique : l'entrée de dette de `mayWheel` est retirée ; l'audit Oracle ↔ script la note comme une équivalence (sept cartes par construction).
- **Tests :** 34 tests de règles (« lot A, rouge »).

## Sous-lot A5 : cartes vertes ✅ (135 / 188)

- **Cartes (24) :** Courier of Comestibles, Cowabunga!, Frog Butler, Groundchuck & Dirtbag, Guac & Marshmallow Pizza, Michelangelo, Game Master, Michelangelo, Improviser, Michelangelo, Mutant BFF, Michelangelo, Weirdness to 11, Mona Lisa, Science Geek, Mutant Chain Reaction, New Generation's Technique, Novel Nunchaku, Party Dude, Primordial Pachyderm, Ragamuffin Raptor, Rocksteady, Crash Courser, Saved by the Shell, Tenderize, Transdimensional Bovine, Turtle Power!, Venus, Torn Between Worlds, West Wind Avatar, Zoo Escapees.
- **Moteur :** rien de nouveau (Groundchuck & Dirtbag : la capacité de mana déclenchée est un remplacement de mana, comme Badgermole Cub ; écart voulu dans `audit-baseline.json`).
- **Tests :** 33 tests de règles (« lot A, vert »).

## Sous-lot A6 : cartes multicolores, incolores et terrains ✅ (180 / 188)

- **Cartes multicolores (29) :** Baxter Stockman, Bebop & Rocksteady, Brilliance Unleashed, Dark Leo & Shredder, Don & Leo, Problem Solvers, EPF Point Squad, Foot Elite, Foot Ninjas, Genghis Frog, Go Ninja Go, Ice Cream Kitty, Karai, Future of the Foot, Karai's Technique, Krang & Shredder, The Last Ronin, Lessons from Life, Mechanized Ninja Cavalry, Mikey & Leo, Chaos & Order, Mouser Mark III, The Neutrinos, Nobody, Pizza Face, Gastromancer, Putrid Pals, Raph & Leo, Sibling Rivals, Raph & Mikey, Troublemakers, Slithering Cryptid, Splinter, Radical Rat, Tainted Treats, Tokka & Rahzar, Terrible Twos.
- **Cartes incolores et terrains (16) :** Chrome Dome, Everything Pizza, Henchbots, Krang, Utrom Warlord, Omni-Cheese Pizza, Technodrome, Turtle Blimp, Turtle Van, Weather Maker, Dimension X, Foot Headquarters, Illegitimate Business, Mutant Town, Northampton Farm, TCRI Building, Turtle Lair.
- **Moteur :** rien de nouveau.
- **Reste pour plus tard :** Don & Raph, Hard Science (affinité pour les artefacts donnée au prochain sort non-créature), Mikey & Don, Party Planners (un marqueur de plus pour une créature lancée depuis le dessus de la bibliothèque), North Wind Avatar (une carte hors de la partie).
- **Tests :** 63 tests de règles (« lot A, multicolores » et « lot A, incolores et terrains ») ; la branche faufilée de Karai est simulée en attendant le sous-lot B1.

## Sous-lot B1 : faufilement ✅ (180 / 188)

- **Moteur :**
  - le faufilement (702.190a) se lance à l'étape de déclaration des bloqueurs, quand vous avez la priorité, aussi pour une créature ou un rituel (`sneakTiming`) ; hors de son moment habituel, l'option n'offre que le coût de faufilement ;
  - l'attaquant non bloqué renvoyé est au choix (`bounce` dans la décision, `altBounce` dans l'option, le plus faible par défaut ; la fenêtre de l'interface sert aussi au Web-slinging) ;
  - un permanent faufilé arrive engagé et attaquant ce qu'attaquait la créature renvoyée ;
  - `RULES_VERSION` = 55, parties dorées régénérées.
- **Tests :** 2 tests de règles (« lot B1 ») ; les deux tests désactivés du lot A (Leonardo, Leader in Blue ; Turncoat Kunoichi) sont réactivés et Karai est faufilée pour de bon.

## Sous-lot C1 : cartes uniques ✅ (188 / 188)

- **Cartes (8) :** April O'Neil, Hacktivist, Fugitive Droid, Mondo Gecko, Ninja Teen, Rat King, Verminister, Don & Raph, Hard Science, Mikey & Don, Party Planners, North Wind Avatar.
- **Moteur :**
  - journal du tour : `distinctTypes` (types de carte différents parmi les sorts lancés) ;
  - cible « sort qui cible [un permanent correspondant] » (`spellsTargeting`) ;
  - un effet « devient de la couleur choisie et gagne la défense talismanique contre elle » fige la couleur choisie (chaque activation garde la sienne) ; la protection lit aussi un filtre « choisi » (`resolveFilter`) ;
  - faufilement donné depuis le cimetière (`playFrom.sneak`, Ninja Teen) ;
  - réduction du prochain sort (`nextSpell.reduce`, affinité pour les artefacts) ; marqueurs d'un sort de créature lancé du dessus de la bibliothèque (`playFrom.counters`) ;
  - sacrifice en coût qui peut inclure la source (`sacrificeOther.includeSelf`) ; `ref.sameNameInGraveyard` (la carte et ses homonymes) ;
  - approximations levées : « chaque adversaire exile jusqu'à… » vaut pour chaque joueur désigné (Krang & Shredder) ; « la moitié, arrondie au supérieur » en une seule meule (`fx.millHalf(…, true)`, Kitsune's Technique) ;
  - `RULES_VERSION` = 56, parties dorées régénérées.
- **Approximations :** North Wind Avatar (pas de zone « hors de la partie ») ; Ninja Teen (l'attaquant renvoyé par le faufilement donné est le plus faible).
- **Tests :** 8 tests de règles (« lot C1 »).
