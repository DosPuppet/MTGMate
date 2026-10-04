# Historique de MTGX (MTG Mate)

Historique du projet, sorti de CLAUDE.md le 02/10/2026 (lot C0 de `docs/plans/PLAN-C.md`). CLAUDE.md ne garde que l'état présent, les règles de travail et les pièges ; le suivi des lots en cours est dans le plan en cours (`docs/plans/`).

## Avancement, jalon par jalon

| Jalon | État |
|---|---|
| Deckbuilder, decklists (import/export MTGA, MTGO, noms FR), validation 60/4/15 | ✅ |
| FDN set principal (n° 1–281, 276 cartes) | ✅ **276 / 276** (lots A à F) |
| FDN réimpressions (n° 282+, 241 cartes) | ✅ **517 / 517** pour tout FDN |
| Légalité Standard dans le deckbuilder (légalités Scryfall, bannies) | ✅ |
| Champ de bataille façon MTGA (rangées, zone des planeswalkers, piles de jetons, lignes multiples, redimensionnement) | ✅ |
| Effets sonores (échantillons Kenney CC0, volume, muet avec M) | ✅ |
| Relais des images Scryfall par le serveur (`/scry/`, bascule automatique, case « Images par le serveur MTG Mate », cache nginx) | ✅ |
| Tablette et téléphone (main ajustée à la largeur, appui long = aperçu, tap pour lever une carte, tiroir sous 1100 px, paysage imposé sur téléphone) | ✅ |
| Jeu en ligne : duel Standard à 2 (serveur local, code de salon, corde, reconnexion, revanche) | ✅ |
| Reprise à la réouverture de la page (02/10/2026) : partie contre l'IA sauvegardée et rejouée là où elle en était (journal compris) ; partie en ligne reprise par son jeton, ou message puis accueil si elle est perdue | ✅ |
| Déploiement : pm2 derrière nginx sur un VPS (`docs/deploiement.md`, `deploy/`) | ✅ documenté et testé en local (pm2, nginx) |
| **Reality Fracture (FRA, « Réalité fracturée »)** | ✅ **279 / 279** (lots 0 à G, dont 4 decks préconstruits, retirés le 28/09/2026 ; les 3 dernières au lot 0.1 du socle multi-extensions) |
| **Edge of Eternities (EOE)** | ✅ **260 / 260** (lots A à D) |
| **Aetherdrift (DFT)** | ✅ **260 / 260** (lots A à C) |
| **Outlaws of Thunder Junction + The Big Score (OTJ, BIG)** | ✅ **269 / 269 + 30 / 30** (lots A à C) |
| **Final Fantasy (FIN)** | ✅ **307 / 307** (lots A à D4) |
| **Duskmourn: House of Horror (DSK, « Mornebrune »)** | ✅ **268 / 268** (lots A à D) |
| **Bloomburrow (BLB)** | ✅ **266 / 266** (lots A à C) |
| **The Lost Caverns of Ixalan (LCI, « Les cavernes oubliées d'Ixalan »)** | ✅ **279 / 279** (lots A à D) |
| Decks préconstruits : les 5 decks de bienvenue (40 cartes FDN, joués tels quels malgré la règle des 60), le Starter Kit Final Fantasy (Séphiroth, Cloud) et, depuis le 30/09/2026, les 5 premiers decks du méta Standard avec leur réserve (`cards/decks/meta-*.json`) ; les anciens decks FDN et FRA sont retirés | ✅ |
| Tutoriel « Apprendre à jouer » (9 leçons mises en scène, guidage strict, reprise au début de la leçon ; `docs/tutoriel.md`) | ✅ |
| IA à trois niveaux (débutant, moyen, élevé : combat par simulation, ISMCTS en duel ; `docs/ia.md`, tournoi `npm run arena`) | ✅ |
| Fiabilisation (29/09/2026) : serveur (validation des messages, débit), décisions mal formées refusées, fuzz « chaos », invariants élargis, tests synthétiques des couches (`docs/moteur.md`, « Règles de conception ») | ✅ |
| Socle P0 de l'audit (29/09/2026) : intégration continue, lancer pendant la résolution (608.2g), remplacements « au lieu du cimetière » (616.1), équipage / Fabrication / prolifération au choix du joueur, capacités de mana à coût sans la pile (605.3b) ; `docs/extensions/socle.md`, lots 0.11 à 0.14 | ✅ |
| P1 de l'audit (29/09/2026) : audit Oracle ↔ script (`coverage --audit`, test `audit.test.ts`), attentes déduites de l'Oracle (84 cartes), journal des événements du tour (`turnlog.ts`) ; lots 0.15 à 0.17 | ✅ |
| P2 de l'audit (29/09/2026) : enregistrement des parties (`engine/src/record.ts`, graine + décisions), parties en ligne reprises après un redémarrage du serveur (`data/rooms`), export d'une partie et visionneur de replays | ✅ |
| P2 de l'audit, fin (29/09/2026) : images des jetons, bundle découpé et compressé, service worker (hors ligne), match BO3 avec réserve (contre l'IA et en ligne) | ✅ |
| Méta Standard, lot M1 (29/09/2026 ; plan P4, phase 1) : Izzet Spellementals et Mono-Green Landfall jouables, réserve comprise (22 cartes de 9 extensions) ; Harmonie, Marchandage, contempler, maîtrise de la terre ; `docs/extensions/meta.md` | ✅ |
| Méta Standard, lot M2 : Dimir Midrange et Jund Sacrifice (23 cartes) ; flétrir, Travail d'équipe, amasser | ✅ |
| Méta Standard, lot M3 : Dimir Excruciator, Azorius Control, Selesnya Landfall (15 cartes) ; évocation, mana dépensé par type, mobilisation, montée en puissance, réunir des preuves | ✅ |
| Méta Standard, lot M4 : 4c Control, Boros Dragons, Jeskai Artifacts (23 cartes) ; type de terrain choisi en jouant le terrain, exploiter, convergence, maîtrise du feu | ✅ |
| Méta Standard, lot M5 : Boros Dwarves, Lifegain, Mardu Discard, Boros Tokens (34 cartes) ; Storied, faufilement, chaos, paradigme, équiper digne | ✅ |
| Méta Standard, lot M6 : les six derniers archétypes (47 cartes) ; maîtrise de l'air, Web-slinging, payer X PV, tours passés. **Phase 1 du plan P4 finie : les 20 archétypes du méta (88,1 %) sont jouables** | ✅ |
| Phase 2 du plan P4 : **Tarkir: Dragonstorm (TDM)** à 100 % (`docs/plans/PLAN-P4.md`, `docs/extensions/tdm.md`) | ✅ **259 / 259** (lots A à D, 01/10/2026) ; lot D : remplacements de blessures génériques (R1, familles E et F), `RULES_VERSION` = 21 |
| **Lorwyn Eclipsed (ECL, « Lorwyn éclipsé »)** (`docs/extensions/ecl.md`) | ✅ **266 / 266** (lots A à D, 01/10/2026 ; `RULES_VERSION` = 25) |
| **Wilds of Eldraine (WOE, « Les friches d'Eldraine »)** (`docs/extensions/woe.md`) | ✅ **269 / 269** (socle 0, sous-lots A1 à A6, B1 à B4, C1 à C5, 01/10/2026 ; `RULES_VERSION` = 26) |
| **Secrets of Strixhaven (SOS, « Les secrets de Strixhaven »)** (`docs/extensions/sos.md`) | ✅ **262 / 262** (socle 0, sous-lots A1 à A6, B1 à B3, C1 à C3, 01/10/2026 ; `RULES_VERSION` = 32) |
| **Murders at Karlov Manor (MKM, « Meurtres au manoir Karlov »)** (`docs/extensions/mkm.md`) | ✅ **271 / 271** (socle 0, sous-lots A1 à A6, B1 à B4, C1 à C3, 02/10/2026 ; `RULES_VERSION` = 37 ; trois promotions légales ajoutées le 03/10/2026, PLAN-C C19) |
| **Avatar: The Last Airbender (TLA)** (`docs/extensions/tla.md`) | ✅ **280 / 280** (socle 0, sous-lots A1 à A6, B1 et B2, C1 à C3, 02/10/2026 ; `RULES_VERSION` = 45) |
| **Marvel Super Heroes (MSH)** (`docs/extensions/msh.md`) | ✅ **271 / 271** (socle 0, sous-lots A1 à A6, B1 à B3, C1 à C3, 02/10/2026 ; `RULES_VERSION` = 53) |
| **Marvel's Spider-Man (SPM)** (`docs/extensions/spm.md`) | ✅ **188 / 188** (socle 0, sous-lots A1 à A6, B1, C1 à C3, 02/10/2026 ; `RULES_VERSION` = 54) |
| **Teenage Mutant Ninja Turtles (TMT)** (`docs/extensions/tmt.md`) | ✅ **188 / 188** (socle 0, sous-lots A1 à A6, B1, C1, 02/10/2026 ; `RULES_VERSION` = 56) |
| **The Hobbit (HOB)** (`docs/extensions/hob.md`) | ✅ **188 / 188** (socle 0, sous-lots A1 à A6, C1, 02/10/2026 ; `RULES_VERSION` = 60). **Tout le Standard est jouable : 5 161 / 5 161** |
| Plan de remédiation de l'audit du 30/09/2026 (`docs/plans/PLAN-R.md`, lots F1 à R8) : F1 à F3 (fondations), R0 (corrections rapides), R4.0 à R4.6, R2.1 à R2.5, R1 en partie, R3 (copies de sorts, répartition), R5 à R8 faits, `RULES_VERSION` = 19 ; restent R1 en partie (familles E, H, I, boucliers 615.7) et R7 (continu), suivis par la section « Ajouter des cartes ou une extension » | ✅ (plan archivé le 01/10/2026) |
| Autres extensions Standard | à la demande de l'utilisateur, une à la fois |


## Suite du travail, au jour le jour

- **27/09/2026 :** l'intégration de tout le Standard d'un coup est abandonnée. La branche `standard` (socle multi-extensions, EOE, DFT, OTJ+BIG, FIN, vérification parallélisée) est fusionnée dans `master`.
- **28/09/2026 :** le travail se fait désormais sur la branche `dev` (créée depuis `master`).
- Ensuite : **une extension à la fois, sur `dev`, seulement quand l'utilisateur la nomme.**
- **30/09/2026 :** pas de nouvelles cartes tant que le moteur n'est pas sécurisé et finalisé (`docs/plans/PLAN-R.md`) ; Tarkir: Dragonstorm (phase 2 du P4) attend.
- **01/10/2026 :** PLAN-R terminé (sauf R1 en partie et R7, continu) et archivé avec son audit. Les nouvelles cartes peuvent reprendre, en suivant la section « Ajouter des cartes ou une extension » (fin de ce fichier).
- **01/10/2026 :** Tarkir: Dragonstorm faite à la demande de l'utilisateur (phase 2 du plan P4), lots A à D (`docs/extensions/tdm.md`). Prochaine extension : à la demande de l'utilisateur (suggestion du plan P4 : SOS ou TLA).
- **01/10/2026 :** Lorwyn Eclipsed faite à la demande de l'utilisateur, lots A à D (`docs/extensions/ecl.md`) ; le lot D a fait les familles H et I de R1. Prochaine extension : à la demande de l'utilisateur.
- **01/10/2026 :** l'utilisateur demande Wilds of Eldraine, Secrets of Strixhaven et Murders at Karlov Manor, dans cet ordre, par lots et sous-lots, un commit par sous-lot, sur `dev` sans fusion dans `master`. Wilds of Eldraine faite (`docs/extensions/woe.md`), puis Secrets of Strixhaven (`docs/extensions/sos.md`), puis Murders at Karlov Manor (`docs/extensions/mkm.md`, terminée le 02/10/2026). Prochaine extension : à la demande de l'utilisateur.
- **02/10/2026 :** l'utilisateur demande Avatar: The Last Airbender puis Marvel Super Heroes, par lots et sous-lots, un commit par sous-lot, sur `dev` sans fusion dans `master`. Avatar: The Last Airbender faite (`docs/extensions/tla.md`), puis Marvel Super Heroes (`docs/extensions/msh.md`). Prochaine extension : à la demande de l'utilisateur.
- **02/10/2026 :** l'utilisateur demande les trois dernières extensions, Marvel's Spider-Man, Teenage Mutant Ninja Turtles et The Hobbit, dans cet ordre, par lots et sous-lots, un commit par sous-lot, sur `dev` sans fusion dans `master`. Marvel's Spider-Man faite (`docs/extensions/spm.md`), puis Teenage Mutant Ninja Turtles (`docs/extensions/tmt.md`), puis The Hobbit (`docs/extensions/hob.md`) : toutes les cartes légales en Standard sont jouables. Correctifs de fin : contrôle rendu dès que l'Aura qui le donne part ; plafonds de jetons et de montants (doubleurs qui se multiplient).
- **02/10/2026 :** audit général (`docs/audits/2026-10-02.md`) et plan de consolidation (`docs/plans/PLAN-C.md`, lots C0 à C20) écrits à la demande de l'utilisateur ; aucun lot lancé. Les lots se font à sa demande, dans l'ordre du plan sauf avis contraire.
- **03/10/2026 :** PLAN-C fait (C0 à C19, C20 écarté) ; analyse de l'exactitude des cartes M/R/U (`docs/audits/2026-10-03-cartes.md`) et lots K0 à K8 : corrections du méta, leviers génériques (mana en combinaison, « vous mettez des marqueurs », terrains choc), choix rendus au joueur, durées, contrôles automatiques de l'Oracle, puis tests systématiques des M/R/U de onze extensions (99 à 100 % des mythiques, rares et peu communes nommées dans un test) ; règles 71 → 86.
- **03-04/10/2026 :** PLAN-S fait sur la branche `plan-s` à la demande de l'utilisateur (`docs/plans/PLAN-S.md`) : familles génériques à la place des variantes d'une ou deux cartes (journal du tour pour « ce tour-ci », `aggregate`, `spent`, `CastInfo`, références `zone`, `cost`, `playersWhere`, `sameName`, effets sur une référence de zone…), un bug trouvé par l'empreinte du fuzz (Cryptex et matériaux de fabrication) ; Effect 178 → 150 variantes, Condition 82 → 52, Amount 77 → 31, Ref 35 → 27, TriggerSpec 62 → 58, GameObject 71 → 60, StackItem 46 → 29, ObjectFilter 91 → 84, CostDef 37 → 33 ; caches suivis à la copie de l'état et invalidation par le journal selon ses lecteurs : bench au-dessus de ses cibles ; règles 95 → 102.
- **04/10/2026 :** format « Sans limite » (toute carte du catalogue), puis PLAN-G à la demande de l'utilisateur (`docs/plans/PLAN-G.md`, `docs/extensions/reeditions.md`) : les 413 cartes des Special Guests et feuilles bonus des extensions du Standard (SPG, EOS, WOT, OTP, FCA, SOA, PZA, REX), avec l'illustration de la réédition (`CardDef.printings`), hors mécaniques propres au Commander. Nouvelles règles du sous-lot difficile : mana phyrexian, coûts alternatifs payés autrement, folie, émerger, réplique, évasion, mue, phasing, vote, dé, règles de victoire et de défaite ; règles 102 → 121.
- **29/09/2026 (plan P4) :** exception décidée par l'utilisateur. On écrit d'abord les cartes des decks du méta Standard (lots M1 à M6, toutes extensions confondues ; des extensions restent donc partielles), puis Tarkir: Dragonstorm à 100 %. Un lot du méta se vérifie avec `npm run verify -- --set META`.
- Découpage habituel d'une extension :
  - lot A : cartes faisables avec le moteur, jetons et terrains ;
  - lot B : mécaniques phares ;
  - lots C et suivants : légendaires et cartes uniques, jusqu'à 100 % ;
  - un commit par lot.
