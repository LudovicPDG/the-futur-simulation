# Fonctionnement

La simulation est composée de **faits** et de **liens** :

- un **fait** est une chose du monde : une personne, une organisation, un événement, une action…
- un **lien** relie des faits entre eux et décrit comment l'un influence l'autre.

La simulation est donc représentée sous la forme d'un graphe : les faits sont les sommets, les liens sont les arcs entre eux.

Trois mécanismes font fonctionner l'ensemble :

1. [Le Génie](#le-génie) crée et estime les éléments.
2. [Les faits](#les-faits) sont de types prédéfinis, qui héritent les uns des autres.
3. [Les liens](#les-liens) propagent l'influence d'un fait à l'autre.

Enfin, [tout peut être contesté](#le-système-de-preuves) grâce aux preuves.

---

## Le Génie

Le Génie est l'IA de la simulation. L'utilisateur lui parle en langage naturel, par exemple « crée telle organisation » ou « ajoute telle preuve ».

Il sert à construire le monde sans que l'utilisateur ait à tout remplir à la main :

- il crée les faits (personnes, organisations, événements, actions…) ;
- pour une personne ou une organisation réelle, il cherche à retrouver des informations fiables ;
- il estime les valeurs de départ : dates, quantités, probabilités ;
- il crée les liens entre les faits ;
- il évalue les preuves : leur crédibilité et leur impact.

L'IA coûte cher : le Génie n'intervient que lorsqu'un élément est créé ou modifié. Ensuite, la simulation calcule seule les conséquences.

---

## Les faits

Les faits sont l'élément de base de la simulation : c'est un type générique qui peut représenter n'importe quel type de chose.
Certains types de faits existent déjà dans la simulation. Chacun a des champs propres, et certains types **héritent** d'un autre : ils reprennent tout ce que leur parent contient, puis ajoutent leurs particularités.

```
Fait
├─ Action
├─ Ressource matérielle
├─ Personnage
│  ├─ Personne
│  └─ Organisation
│     └─ Groupe d'intérêt
└─ Événement
   ├─ Évolution
   └─ Classement
```

### Fait

C'est la base de tout. Tous les autres types en héritent. Un fait possède :

- un **nom** et une **description**;
- un **type** ;
- des **informations libres** supplémentaires ;
- une **existence** : la probabilité, à chaque date, que le fait existe réellement. Elle est proche de 0 avant son début, haute pendant, et retombe à 0 après sa fin. Un fait inventé ou fictif reste à une valeur très basse ;
- une **originalité** : est-ce une copie de quelque chose d'existant ? Elle évite qu'on répète la même chose pour peser plus ;
- un **impact** : l'effet moyen du fait sur chaque personnage qu'il touche ;
- un **nombre de personnes impactées**.

Un fait sans autre type est donc l'affirmation la plus générale, par exemple « il y a 8 milliards d'humains ».

### Personnage

Un personnage est un fait qui peut agir. Il hérite de Fait et ajoute :

- de l'**argent** possédé ou contrôlé ;
- des **pouvoirs** : ce qu'il est capable de faire ;
- des **volontés** : ce qu'il veut faire ou obtenir ;
- une **satisfaction** : la part de ses volontés qui sont réalisées.

Un personnage peut être de trois sortes :

- **Personne** : un individu. Son existence va de sa naissance à sa mort.
- **Organisation** : entreprise, association, État, parti… Elle remplace la satisfaction par la **satisfaction moyenne de ses membres**, et ajoute le **nombre de personnes** qui la composent. Son existence va de sa fondation à sa dissolution.
- **Groupe d'intérêt** : une organisation dont les membres partagent une même volonté (écologistes, conservateurs…). Il hérite de tout ce qu'a une organisation. Il permet de relier un événement ou une action à tout un groupe plutôt qu'à des millions de personnes une par une, ou à plusieurs groupes.

### Événement

Un événement est un fait qui peut arriver. Il hérite de Fait, et son existence devient la probabilité qu'il ait lieu. Il en existe deux variantes :

- **Évolution** : une courbe qui décrit une grandeur dans le temps (émissions de CO₂, prix du pétrole…), avec une unité et une marge d'incertitude.
- **Classement** : une liste d'éléments avec une valeur (résultat d'une élection, championnat…).

### Action

Une action est un fait réalisé par un ou plusieurs personnages. Elle hérite de Fait et décrit ce qu'il faut pour agir :

- les **ressources matérielles** utilisées, et celles qui sont nécessaires ;
- l'**argent** utilisé, et l'argent nécessaire ;
- les **humains** mobilisés, et ceux qui sont nécessaires.

### Ressource matérielle

Un objet, une matière ou une machine. Elle hérite de Fait et ajoute son **nombre d'unités**, sa **valeur financière** et ce qu'elle permet de faire.

---

## Les liens

Un lien relie deux faits, de n'importe quel type, et décrit comment une caractéristique de l'un influence une caractéristique de l'autre. Par exemple, « plus il y a de chômage, plus la satisfaction d'un groupe baisse ».

Un lien peut agir dans un sens, dans l'autre, ou dans les deux. Il a lui aussi une existence, une originalité et un impact, comme un fait, et il peut être contesté par des preuves.

Les faits reliés forment un graphe : modifier un fait modifie ceux qui lui sont liés, et ainsi de suite, de proche en proche.

> Cette partie est en cours de rédaction : le fonctionnement détaillé des liens sera ajouté plus tard.

---

## Système de preuve et valeur

### Valeur

Dans cette simulation, chaque valeur possède des paramètres de valeur qui sont : l'incertitude et la véracité.

En plus de cela, chaque valeur possède un impact, composé de deux valeurs (l'impact moyen et le nombre de personnes impactées). Cela décrit à quel point cette valeur impacte les autres valeurs. Si vous voulez en savoir plus sur l'impact, [cliquez ici](#impact-et-score-global).

Les valeurs numériques et les fonctions ont deux types de véracité : la véracité en dessous et la véracité au-dessus.

Les valeurs faisant partie d'un tableau possèdent deux paramètres de valeur en plus : l'originalité et la pertinence.

Voici en détail à quoi servent ces différents paramètres de valeur :

- **véracité** : à quel point le Génie juge que cette valeur est véridique ;
- **incertitude** : décrit à quel point les personnes sont incertaines concernant cette valeur ;
- **pertinence** : à quel point cette valeur est pertinente par rapport au fait. Une preuve peut être véridique mais impertinente ;
- **originalité** : à quel point la preuve est originale et apporte quelque chose de nouveau. Cela évite les doublons et le spam.

### Le système de preuves

Rien n'est considéré comme une vérité : **chaque élément peut être contesté**, qu'il s'agisse d'un fait, d'un lien ou d'une valeur précise.

Pour cela, on ajoute une **preuve** : un argument qui propose une autre valeur. Une preuve contient :

- ce qu'elle conteste et la valeur qu'elle propose ;
- des **sources** ;
- comment la **vérifier** et comment la **réfuter** ;
- ses propres scores : véracité, incertitude, pertinence et originalité.

La valeur retenue n'est jamais écrasée par une preuve : elle résulte du **poids de toutes les preuves**.

Pour les valeurs sur lesquelles on ne peut pas faire d'opération mathématique, comme les valeurs textuelles ou les tableaux, on retient la valeur de la preuve qui a le meilleur score, calculé à partir de sa véracité et de sa pertinence. [Cette opération est détaillée ici](./operation.md#texte-et-tableau).

Pour les valeurs numériques, les booléens et les fonctions, on fait simplement la moyenne pondérée de toutes les valeurs proposées. Le poids de chaque preuve est calculé à partir de sa véracité, de son originalité et de sa pertinence. Une preuve dont un de ces scores est trop faible est ignorée, pour empêcher quelqu'un de noyer un fait sous de multiples petites preuves sans valeur, ou de le fausser en mettant des données abérente. [Cette opération est détaillée ici](./operation.md#valeur-numérique-booléen-et-fonction).

## Impact et score global
