# Tutoriel « Apprendre à jouer »

Le tutoriel s'adresse à un joueur qui ne connaît pas Magic. Il se lance depuis le bouton **Apprendre à jouer** de l'accueil. Il comporte 9 leçons courtes, chacune un extrait de partie mis en scène avec le vrai moteur et la vraie interface :

| # | id | Contenu |
|---|---|---|
| 1 | `ecran` | But du jeu, points de vie, champ de bataille, main, bibliothèque, cimetière, phases, bouton principal, aperçu, journal |
| 2 | `mana` | Un terrain par tour, coût de mana (couleur, générique), terrains engagés, fin du tour |
| 3 | `creatures` | Force et endurance, mal d'invocation, la pile (sort adverse) |
| 4 | `attaque` | Combat, attaquants, blocage adverse, dégâts, cimetière, seconde phase principale |
| 5 | `blocage` | Se défendre, échange de créatures, perte de points de vie |
| 6 | `sorts` | Rituels et éphémères, cibles (glisser-déposer), première victoire |
| 7 | `pile` | Répondre à un sort, ordre de résolution, blessures qui durent jusqu'à la fin du tour, tour de combat |
| 8 | `capacites` | Vol, vigilance, lien de vie, portée, contact mortel, capacités déclenchées et activées |
| 9 | `partie` | Mulligan, arrêts, « Passer le tour », puis une vraie partie contre l'IA heuristique (adversaire à 10 PV), avec des conseils |

On peut **tout dérouler** (la leçon suivante est proposée en premier), **reprendre** ou choisir une leçon. La progression est gardée dans `localStorage` (`mtgmate.tutorial` : leçons terminées et leçon à reprendre). La reprise relance la leçon **depuis son début**.

## Fichiers

- `engine/src/scenario.ts` : `createScenario`, partie sans mélange, commencée au début du tour voulu (ou par le mulligan).
- `engine/src/host.ts` : l'option `gate` de `GameHost` fait attendre l'IA pendant une explication. L'humain voit alors l'état courant.
- `ai/src/scripted.ts` : `scriptedAgent`, adversaire qui suit un script de données (`playLand`, `cast` éventuellement en réponse, `activate`, `attack`, `block`, cartes désignées par leur nom). En dehors du script, il passe, n'attaque pas et fait les blocages obligatoires.
- `client/src/protocol.ts` : `ScenarioSpec`, envoyée au worker dans `start`, et message `pause`.
- `client/src/scenario.ts` : `buildScenario`, de la description par noms à la partie du moteur (worker et tests).
- `client/src/tutorial/` :
  - `lessons.ts` : le contenu ;
  - `runtime.ts` : format des étapes, garde et solveur, prédicats (pur) ;
  - `store.ts` : leçon en cours, progression, garde, avancée des étapes ;
  - `Coach.tsx` : bulle et anneau ;
  - `placement.ts` : position de la bulle (pur) ;
  - `TutorialMenu.tsx` : menu des leçons.

## Format d'une étape (`runtime.ts`)

- `text` : texte en français, au vouvoiement. `**gras**` et symboles de mana (`{G}`, `{1}{G}`) sont rendus par la bulle. Le texte peut dépendre de la partie (fonction de `Ctx`).
- `target` : élément entouré. C'est soit un repère d'interface (`myLife`, `hand`, `phaseBar`, `mainButton`, `stack`, `stops`…, via les attributs `data-tuto` du plateau), soit une carte : `{ card, zone, owner }`, par son nom anglais.
- `next: true` : explication, avec un bouton « Suivant ». L'adversaire est en pause et toute décision est refusée.
- `until` : condition de fin de l'étape, évaluée à chaque mise à jour et à chaque survol. Préférer l'état (`onField`, `inGraveyard`, `myStep`, `lifeOf`…) aux événements : plusieurs étapes peuvent se terminer sur une même mise à jour.
- `allow` : décisions acceptées (**guidage strict**). Exemples :
  - `{ playLand }`, `{ cast, target }`, `{ activate, target }` ;
  - `{ attack: [...] }`, `{ block: [[bloqueur, attaquant]] }` ;
  - `"pass"` (Combat, Résoudre, OK), `"endTurn"` (Fin du tour), `"keep"`.

  Les autres décisions sont refusées avec `hint`. Produire du mana à la main, répondre à une question du moteur et abandonner restent toujours permis.
- `free: true` : partie libre, sans restriction ; les `tips` s'affichent dans la bulle selon la situation.
- `settings` : réglages de l'automatisme appliqués en entrant dans l'étape.

## Pièges

- **Tour adverse invisible.** Quand l'adversaire ne fait rien de visible (en mode `?fast`, ou sans action de l'IA), la vue saute directement au tour suivant. Une fin de tour s'attend donc avec le numéro du tour (`pastTurn`), pas avec « c'est le tour adverse ».
- **Arrêts.** L'automatisme passe les étapes où le joueur n'a rien de significatif à faire, même avec un arrêt. Pour que la partie s'arrête en seconde phase principale, le joueur doit avoir quelque chose à y jouer (leçon 4 : le Faucon).
- **Sort adverse.** Pendant une étape guidée, le panneau du sort adverse (`StackReveal`) ne passe plus tout seul : le joueur clique OK quand le guide le demande (`useTutorialHold`). La fenêtre de fin de partie est masquée pendant une leçon : c'est le guide qui annonce la fin.
- **Noms des cartes.** Le scénario et les conditions utilisent les noms anglais, les textes les noms français affichés par l'interface. Une carte sans nom français dans les données s'afficherait en anglais : l'éviter.

## Ajouter ou modifier une leçon

1. Écrire le scénario (bibliothèques assez longues pour les pioches) et les étapes dans `lessons.ts`.
2. `npx vitest run packages/client/test/tutorial.test.ts` : chaque leçon est rejouée sans navigateur, avec la décision que déduit le solveur pour chaque `allow`. On y vérifie aussi que les affirmations des textes sont vraies (`OUTCOMES` : points de vie, morts…).
3. `npm run tutorial-smoke` (Vite lancé) : les leçons sont suivies dans le navigateur, en cliquant comme un joueur. L'option `--only 2,3` restreint aux leçons voulues, `--debug` affiche les actions. Captures dans `test-results/tutorial/`.
