# Simulation Dynamique de Prédiction du Futur

## Introduction et Objectif

Ce projet vise à concevoir une application de simulation dynamique pour tenter de prédire le futur. Elle est destinée aux organisations publiques afin de les aider à prendre de meilleures décisions.
Contrairement aux simulations statiques traditionnelles, cette simulation est entièrement dynamique et interactive : l'utilisateur peut créer et modifier des personnages, des actions et des événements.

---

## 1. Concepts Fondamentaux de la Simulation

### A. Les Personnages (Entités)

Un personnage peut être :

- Une **personne** individuelle.
- Un **groupe de volonté** (représentant des courants de pensée).
- Une **organisation** (personne morale, étatique, entreprise, etc.).

### B. Les Actions et les Mesures

- Une **action** est initiée par un ou plusieurs personnages.
- Elle peut créer d'autres personnages, influencer ou déclencher des événements ou d'autres actions par effet de réaction si elle impacte trop fortement certains acteurs.
- Un ensemble d'actions coordonnées est appelé une **mesure**.

### C. Les Événements

Les événements se déclinent en quatre types :

1. **Événement à date fixe** : Défini par un nom, une description et une probabilité d'occurrence calculée à partir d'une distribution de probabilités variant dans le temps (normalisée et débutant à la date actuelle).
2. **Événement général** : Un fait dont la probabilité d'occurrence est décrite par une distribution de probabilités normalisée (permettant de modéliser le fait qu'il puisse ne jamais se produire) et tronquée vers le passé (pour ne pas calculer la probabilité qu'il se soit déjà produit, ce qui n'a pas de sens dans cette simulation).
3. **Évolution** : Courbe décrivant la trajectoire d'une grandeur dans le temps (ex. : émissions de CO2 d'un pays, prix d'une ressource) avec une probabilité associée.
4. **Classement** : Liste ordonnée de données avec des valeurs associées (ex. : résultats d'une élection, classement sportif) avec une probabilité associée.

---

## 2. Le Rôle de l'Oracle (Intelligence Artificielle) et Calculs

L'Oracle est l'IA centrale qui intervient **uniquement lors de la création ou de la modification d'un élément** (personnage, action, événement, preuve) pour définir les paramètres initiaux et les règles de liaison mathématiques du graphe. Une fois ces liaisons établies par l'Oracle, la simulation et la propagation des impacts s'effectuent de manière purement algorithmique.

Ses tâches d'initialisation comprennent :

- **Vérification du réel pour les personnes** : Lors de la création d'un personnage, l'Oracle vérifie son existence dans le monde réel afin d'y associer des données réelles et fiables (pour éviter les incohérences).
- **Modélisation des équations de transfert** : Définit mathématiquement comment les éléments s'influencent entre eux (les fonctions de transfert sur les arêtes).
- **Calcul de faisabilité initial** : Évalue la probabilité de réussite d'une action ou de réalisation d'un événement lors de sa création.
- **Évaluation des preuves** : Analyse tout type de preuve soumis (texte, lien, chiffre) et détermine souverainement son niveau de **crédibilité** et d'**impact**.

---

## 3. Philosophies et Satisfaction

### A. Les Volontés et l'Engagement

- Chaque personnage et organisation possède une ou plusieurs volontés.
- Les **groupes de volonté** agrègent en pourcentage le nombre de personnes possédant une volonté spécifique. Par exemple, si 100 personnes sont écologistes à hauteur de 10 %, cela équivaut à 10 « personnes entières » écologistes au sein de ce groupe. Un groupe de volonté peut être n'importe quoi (ex. : le groupe des personnes qui aiment le couscous).
- Chaque personne est également plus ou moins engagée dans des associations (sur une échelle de 0 à 100), suivant le même principe que pour les groupes de volonté.
- Au début, les personnes possèdent automatiquement certaines volontés fondamentales (ou font partie de certains groupes de volonté par défaut), comme le désir de vivre, le fait de ne pas subir de souffrances physiques (telles que la torture) et le désir de se déplacer.

### B. Le Système de Satisfaction

Chaque personne de la simulation possède un niveau de satisfaction (allant de -10 à 100). Pour les organisations et les groupes de volonté, ce niveau n'est pas normalisé et dépend de l'ensemble des volontés des personnes qui les composent (lesquelles sont normalisées) :

- **Le score négatif (de -10 à 0)** : Ce choix est intentionnel et modélise des situations extrêmes où les individus ont la volonté de mourir (ex. souffrance physique insupportable, fin de vie). Si un tel individu décède, sa satisfaction passe de négative à neutre (0), ce qui augmente mécaniquement le score global de l'humanité sans forcer l'individu à vivre.
- **Calcul pour les groupes et organisations (Poids de masse)** : Le score de satisfaction d'un groupe ou d'une organisation est intentionnellement multiplié par le nombre d'individus réels (ou équivalents temps plein via leur engagement). Cela donne volontairement un poids politique et démographique plus important aux grandes structures et aux grands groupes de pensée dans le graphe.
- **Événements** : Indique à quel point leur réalisation modifierait la satisfaction globale des personnages qui y sont directement ou indirectement connectés.
- **Actions** : Indique à quel point l'action influence la probabilité d'événements impactant la satisfaction des personnages.

---

## 4. Visualisation sous forme de Graphe

Toutes les entités et relations forment un graphe interactif :

- **Noeuds** : Représentent les entités (personnages, actions, événements).
  - **Forme géométrique** : Détermine le type de l'entité.
  - **Taille** : Proportionnelle à l'impact (pour les actions et les événements) ou à la satisfaction de l'entité (pour les personnages).
  - **Couleur** : Indique la valeur positive (Vert) ou négative (Rouge) de la satisfaction ou de l'impact.
- **Arêtes (Relations)** : Représentent les liens d'influence (ex. : influence d'une personne sur une autre, d'une action sur un événement, d'un événement sur un autre événement, etc.).
  - **Épaisseur** : Reflète l'intensité de la connexion ou de l'influence.
  - **Couleur** : Indique la nature positive ou négative de l'influence.

### Organisation et Performance

- **Régions thématiques** : Pour éviter la surcharge visuelle, le graphe est divisé en régions imbriquées (ex. : technologie, écologie).
- **Propagation limitée** : Les modifications se propagent de proche en proche (réaction en chaîne) mais sont limitées pour préserver les ressources de calcul.

---

## 5. Objectif du Simulateur et Forum

- **But ultime** : Maximiser la satisfaction globale de l'humanité.
- **Calcul du score** : Le score est une valeur absolue globale (et non une simple proportion), ce qui intègre implicitement la natalité et la mortalité. L'utilisateur a intérêt à maximiser les naissances et à minimiser les décès.
- **Aspect communautaire** : Un forum permet aux utilisateurs de partager leurs scores, de proposer des mesures et de débattre des résultats obtenus.

---

## 6. Fondement Factuel et Réfutabilité (Preuves)

Toute la simulation repose sur des faits réels qui peuvent être contestés par les utilisateurs à l'aide de preuves de n'importe quelle nature (chiffres, textes, liens web) :

- **Débat factuel** : Un utilisateur peut contester une prédiction ou un fait (ex. : la probabilité que le prix du pétrole atteigne 3 € en Europe d'ici 2030) en apportant des preuves. Les preuves peuvent elles-mêmes être contredites par d'autres preuves.
- **Pondération des faits dénombrables** : Une preuve modifie la valeur du fait en fonction de deux paramètres estimés par l'Oracle : sa **crédibilité** et son **impact**.
- **Anti-spam** : Si le produit `crédibilité × impact` d'une preuve est inférieur à un certain seuil, elle est ignorée pour éviter les micro-contributions spammantes ou obsolètes.
- **Faits non dénombrables** : L'Oracle évalue de manière qualitative les meilleures preuves disponibles pour ajuster le fait dans la simulation.
