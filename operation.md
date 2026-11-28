# Système de preuve

## Texte et tableau

Dans le système de preuve, quand une valeur textuelle ou un tableau est contestée, la valeur affichée est celle de la preuve ayant le plus haut score. Ce score est simplement le produit de la véracité et de la pertinence de la preuve ; la valeur gagnante remplace l'ancienne valeur affichée.

$$
X_{\text{new}}=X_{\arg\max_i(V_iR_i)}
$$

- $X_{\text{new}}$ : nouvelle valeur affichée.
- $X_i$ : valeur défendue par la preuve $i$.
- $V_i$ : véracité de la preuve $i$.
- $R_i$ : pertinence de la preuve $i$.
- $\arg\max$ : sélectionne la preuve ayant le score maximal.

## Valeur numérique, booléen et fonction

Dans le système de preuve, quand une valeur est contestée, on calcule la moyenne pondérée de toutes les valeurs proposées, où le poids est véracité × originalité × pertinence. Les preuves dont la véracité, l'originalité ou la pertinence est inférieure à 10 ne sont pas comptées, pour éviter le spam et certaines données aberrantes.


$$
X_{\text{new}}=
\frac{\sum_i X_i(V_iO_iR_i)}
{\sum_i(V_iO_iR_i)}
$$

- $X_{\text{new}}$ : nouvelle valeur calculée.
- $X_i$ : valeur défendue par la preuve $i$.
- $V_i$ : véracité de la preuve $i$.
- $O_i$ : originalité de la preuve $i$.
- $R_i$ : pertinence de la preuve $i$.
- $V_iO_iR_i$ : poids de la preuve $i$.
- $\sum_i$ : somme sur toutes les preuves considérées.

**Condition d'exclusion :** Les preuves ayant une véracité, une originalité ou une pertinence inférieure à 10 ne sont pas prises en compte dans le calcul.