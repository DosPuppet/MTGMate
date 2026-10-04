# PLAN-A — passe sur les approximations (04/10/2026)

Relecture de `docs/approximations.md` (environ 360 entrées) contre le code et l'Oracle, après PLAN-D, PLAN-S et PLAN-G, qui ont ajouté des formes génériques (`batched`, `oncePerTurn: "ifDone"`, `triggerCondition`, `chooseAmong.optional`, `moveTo.attachTo`, `onePerType`, `crewedSource`, `stackItems.controller`, `maxManaValueAmount`, `differentPlayers`, `copyToken.for`…). Lots faits sur `dev`, un commit par lot.

Constats de départ :

- deux bogues non documentés : Raid Bombardment n'infligeait jamais sa blessure (`ref.defendingPlayer` cherchait l'enchantement parmi les attaquants) ; Fear of Burning Alive inflige les blessures reportées depuis elle-même, et non depuis « cette source » ;
- une vingtaine d'entrées périmées (la règle exacte, ou un comportement déjà corrigé) ;
- environ 55 entrées levables par un simple changement de script, avec une forme existante ;
- une vingtaine de familles où une forme générique neuve lève au moins deux entrées ;
- ménage : la puce « Mana phyrexian » rangeait à tort sous elle toutes les rééditions qui la suivaient, doublons, étiquettes incohérentes, ponctuation.

## Lots

| Lot | Contenu | État |
|---|---|---|
| A0 [règles] | Bogues (Raid Bombardment ; question inutile de « retirez tous les marqueurs »), entrées périmées, ménage du document | ✅ |
| A1 [règles] | Levées par script, FDN à DSK : Demon Wall, « avait des marqueurs », Ultimecia et Raise a Chocobo, Tellah, Zenos, Zack Fair, Summoner's Grimoire, Webstrike Elite, Caradora, Abyssal Harvester, Kellan, the Kid, Great Train Heist, Emissary Escort, Dyadrine, Terrasymbiosis, Irreverent Gremlin, Vengeful Possession, Fear of the Dark, Dollmaker's Shop, Central Elevator, Leyline of Resonance, Claim Territory | |
| A2 [règles] | Levées par script, BLB à HOB et rééditions : Jackdaw Savior, Clement, Illicit Masquerade, Helga, Kirol, Vantress Visions, Echo, Turtle Van, Subterranean Schooner, Rune-Brand Juggler, Beast, Warden of the Inner Sky, Scolding Administrator, Fblthp, Impossibly Lost, Earth Kingdom General, Baron Strucker, Planetarium, The Queen of Dale, Aquatic Alchemist, Ral, Journey On, Alania, In the Presence of Ages, Kellan, Daring Traveler, Fecund Greenshell, Something Worth Saving, Deepfathom Echo, Echocasting Symposium, Eagle's Rescue, Eluge, sacrifices « quand vous le faites » (MSH), Grasp of Fate, Welcome to . . ., Fraying Sanity, Unlicensed Hearse, Eldrazi Temple, modulaire | |
| A3 [règles] | Petites familles : filtre de propriétaire, taille de main maximale fixée (horodatage), travail d'équipe « les deux modes », sous-types de terrain seuls (305.7), attaquants distincts au journal, montures cumulées, dernier contrôleur connu, destinataire des blessures, noms différents, restriction de mana par action, objet choisi en coût, marqueurs d'arrivée en `Amount`, « un joueur subit des blessures » | |
| A4 [règles] | Sur demande : cible « contrôlée par ce joueur », objets d'un lot « un ou plusieurs », nouvelles cibles d'un sort à plusieurs cibles, sort gratuit de toute zone, capacité retardée liée à un objet, source d'une capacité accordée, file de phases supplémentaires, marqueurs retirés parmi plusieurs permanents | |

Gardés tels quels : choix automatiques façon Arena, entrées « exact en duel », timings au même résultat, zone « hors de la partie » (Extrapolate the Impossible, Turtles Forever, North Wind Avatar).

## Vérifications

Par lot : tests de règles tirés de l'Oracle ; entrées retirées d'`approximations.md` ; `RULES_VERSION` et parties dorées ; `npm run verify -- --set <EXT>` pour les extensions touchées. En fin de série : `npm run verify -- --full`.

## Suivi

- **04/10/2026 :** plan écrit à la demande de l'utilisateur, après trois relectures en parallèle (générales à DSK, BLB à HOB, rééditions).
- **04/10/2026, A0** (règles 122) : `ref.defendingPlayer` prend l'attaquant de l'événement quand la source n'attaque pas (Raid Bombardment n'infligeait aucune blessure) ; « retirez tous les marqueurs » ne demande plus leur sorte quand tous partent (Purging Stormbrood) ; Fear of Burning Alive reste documentée (« cette source » : un sort résolu n'a plus d'objet à désigner) ; 1 test ajouté, 1 étendu ; 15 entrées retirées d'`approximations.md` (Bolt Bend, Syr Vondam, Call the Spirit Dragons, Kastral, Thought-Stalker Warlock, Sharae, Wisdom of Ages, Anzrag's Rampage, Unlucky Cabbage Merchant, Tony Stark, Moment of Glory, Plunder the Trollshaws, Raid Bombardment, Prismatic Ending, Maddening Hex), 4 réduites (Tishana, Kutzil, Feral Encounter, The Thing) ; ménage : générales « mana phyrexian », « ordre au-dessous », suspension, contrôle du tour d'un autre joueur ; doublons fusionnés (travail d'équipe, Master of Barbs, Rowdy Research) ; Blood Moon, Unstoppable Slasher, Atlantis Attacks, Murdock's Crusade ajoutés ; parties dorées identiques ; `verify --set WOT` et `--set TDM` verts, suite du moteur verte.
