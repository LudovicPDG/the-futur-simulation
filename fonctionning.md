# Fonctionnement

La simulation est composée de **faits** et de **liens** :

- un **fait** est une chose du monde : une personne, une organisation, un événement, une action…
- un **lien** relie des faits entre eux et décrit comment l'un influence l'autre.

La simulation est donc représenté sous la forme un graphe : les faits sont les arrete, les liens sont les arc entre eux.

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

Les fait sont l'élément de base de la simulation, c'est un type générique de la simulation qui peut réprésenter n'importe quelle type de chose.
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
- une **existence** : la probabilité, à chaque date, que le fait existe réellement. Elle est proche de 0 avant sont début, haute pendant, et retombe à 0 après sa fin. Un fait inventé ou fictif reste à une valeur très basse ;
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
- **Groupe d'intérêt** : une organisation dont les membres partagent une même volonté (écologistes, conservateurs…). Il hérite de tout ce qu'a une organisation. Il permet de relier un événement ou une action à tout un groupe plutôt qu'à des millions de personnes une par une, ou a plusieur groupe.

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

Dans cette simulation chaque valeur possede des parametre de valeur qui sont: l'uncertitude et la véracité.

En plus de cela chaque valeur possede un impact, qui est composé en deux valeur (l'impact moyen, et le nombre de personne impacté). Cela décrit a quelle point cette valeur impact, les autre valeur. si vous voulez en savoir plus sur l'impact [cliquer ici](#impact-et-score-gloabal)

les valeur numérique et les fonction en deux type de véracité: la véracité en dessous et la veracité au dessus.

les valeur faisant partie d'un tableaux possède deux parametre de valeur en plus originalité et pertinance.

voici en détaille a quoi serve ces différent parametre de valeur:
- **véracité**: a quelle point le génie juge qut cette valeur est véridique
- **incertitude**: Décrit a quelle point les personne sont incertain concernant cette valeur.
- **pertinance**: A quelle point cette valeur est pertinante par rapport au fait. Une preuve peut étre véridique mais impertinante.
- **originalité** A quelle point la preuve est original est apporte quelle que chose de nouveaux. Cela est fait pour éviter les doublons et le spam.


### Le système de preuves

Rien n'est considéré comme une vérité : **chaque élément peut être contesté**, qu'il s'agisse d'un fait, d'un lien ou d'une valeur précise.

Pour cela, on ajoute une **preuve** : un argument qui propose une autre valeur. Une preuve contient :

- ce qu'elle conteste et la valeur qu'elle propose ;
- des **sources** ;
- comment la **vérifier** et comment la **réfuter** ;
- ses propres scores : véracité, incertitude, pertinence et originalité.

Pour les valeurs pour lesquelles ont ne peut pas faire d'opération mathématique comme les valeur textuelle ou les tableau, en choisit la valeur qui a le plus haute véracité, originalité et relevance

La valeur retenue n'est jamais écrasée par une preuve : elle résulte du **poids de toutes les preuves**. Une preuve pèse plus quand elle est vraie, pertinente et originale. Une preuve dont le poids est trop faible est ignorée, pour empêcher quelqu'un de noyer un fait sous de multiples petites preuves sans valeur.

> Cette partie sera détaillée dans un prochain document.

## Impact et score gloabal


