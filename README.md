# Tableau

Application de bureau (Electron) de post-its : des tableaux, des cadres et des notes, stockés en local dans de simples fichiers JSON.

## Installation

1. Va dans l'onglet **Releases** du dépôt et télécharge le zip correspondant à ta machine :
   - `Tableau-mac-arm64.zip` : Mac Apple Silicon (M1 et suivants)
   - `Tableau-mac-x64.zip` : Mac Intel
   - `Tableau-windows-x64.zip` : Windows 64 bits
2. Dézippe-le où tu veux (de préférence dans un dossier synchronisé si tu veux retrouver tes notes sur plusieurs ordinateurs).
3. Lance l'application :
   - **Mac** : `Tableau.app`.
     - **Si macOS dit que l'application est endommagée** : ouvre le Terminal, tape `xattr -cr` suivi d'un espace, glisse `Tableau.app` dans la fenêtre, appuie sur Entrée, puis relance l'app.
     - Sinon, la première fois : **clic droit > Ouvrir**. L'application n'est pas notariée par Apple (signature ad hoc seulement).
   - **Windows** : `Windows/Tableau.exe`. Si SmartScreen s'affiche : **Informations complémentaires > Exécuter quand même**.

## Organisation du dossier

```
Tableau/
├── Tableau.app  (ou Windows/)   l'application
├── index.html                   l'interface
└── donnees/                     TES NOTES (une note = un fichier JSON)
```

L'application cherche `index.html` et `donnees/` dans le dossier qui contient l'application : ne les déplace pas ailleurs.

## Données et confidentialité

Toutes tes notes sont dans le dossier `donnees/`, en clair, sur ton ordinateur. **Ne partage jamais le dossier `donnees/`** (ni par mail, ni sur GitHub, ni dans un zip envoyé à quelqu'un). Le fichier `.gitignore` de ce dépôt l'exclut déjà : garde-le si tu forkes le projet.

Le dossier `donnees/` livré dans les zips ne contient qu'un tableau vide d'exemple (voir `template/donnees/`).

## Pour les développeurs

- `public/index.html` : l'interface publiée (cadres par défaut neutres)
- `app/` : `main.js`, `package.json`, `icon.png` (processus principal Electron)
- `icons/` : icônes `.png`, `.icns`, `.ico`
- `template/donnees/` : données initiales copiées dans chaque release
- `.github/workflows/release.yml` : à chaque tag `v*`, construit les versions Mac (arm64, x64) et Windows (x64) avec `@electron/packager` (Electron 45.2.1) et les publie dans la Release

Pour sortir une version : `git tag v1.0.1 && git push origin v1.0.1`.
