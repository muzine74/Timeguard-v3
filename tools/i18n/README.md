# Traductions (anglais, espagnol, italien)

L'application est écrite en français. Les autres langues sont appliquées à l'affichage par
`src/app/state/i18n/i18n.service.ts`, à partir des dictionnaires `src/brand/i18n/{en,es,it}.json`.
Ces dictionnaires sont GÉNÉRÉS : ne pas les modifier à la main.

| Fichier | Rôle |
|---|---|
| `source.txt` | Textes français numérotés (S = texte ou attribut de gabarit, M = texte composé avec `{0}`, T = libellé du code). |
| `tr_1.tsv` … `tr_5.tsv` | Traductions : numéro, anglais, espagnol, italien. `-` = non traduit (reste en français). |
| `extras.tsv` | Ajouts à la main : `E` = texte exact, `P` = modèle à trous. Colonnes : type, français, anglais, espagnol, italien. |
| `build_dict.py` | Assemble les trois dictionnaires. À relancer après toute modification. |
| `extract.py`, `build_source.py` | Refont l'inventaire des textes (seulement pour repartir de zéro : la numérotation change). |

## Ajouter ou corriger une traduction

1. Texte déjà dans `source.txt` : corriger sa ligne dans le `tr_*.tsv` correspondant.
2. Nouveau texte : ajouter une ligne `E` (ou `P` s'il contient une valeur variable) dans `extras.tsv`.
3. `python build_dict.py`, puis reconstruire le front.

Un modèle `P` utilise `{0}`, `{1}`… pour les parties variables. Dans la traduction, `{1|a|b}` écrit `a` quand
la partie 1 est vide et `b` sinon (pluriels : `fattur{1|a|e}`).

## Ce qui n'est pas traduit

La page d'aide, les messages renvoyés par l'API, les documents générés (PDF, Excel) et la plupart des dates.
