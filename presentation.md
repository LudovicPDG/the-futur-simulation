Je veux créer une simulation pour essayer de predire le futur.

Cette simulation sera utile pour les différente organisation de la vie publique, pour leur permettre de prendre des meilleur decision.

pour cela au lieu que cette simulation soit statique comme la plupart des simulation se sera une simulation dynamique.

cette a dire que l'utilisateur pourra créer, modifier, des action, des évenement, des personnage.

Un personnage peut etre une personne, un groupe ideologique, une organisation.

une action est quelque chose effectuer par un ou des personnage.

une action influence 0 ou des evenement du monde. Par exemple un traité restrictif sur l'IA retarde le developmenqt de l'AGI. elle peut meme créer
des evenement si ils n'existe pas encore.

une action peut aussi créer un personnage.

une action peut aussi entrainer d'autre action d'autre personnage quand l'action impact trop les personnage.

un ensemble d'action est appelé une mesure.

Pour créer ces différente chose il devra parler a une IA nommé l'oracle.

Le role de cette oracle sera quand l'utilisateur créer une organisation de verifier si cette organisation n'exiqte pas déjà, si elle existe deja de créer l'association avec des information correct.

De faire en sorte, que lorsque l'utilisateur fasse une action qu'il calcul la faisabilité de cette action, (pour cela il doit tout prendre en compte, c'est a dire la probabilité que cela soit possible physiquement, la probabilité que la ou les acteur en la volonté d'effectué cette action).

De calculer aussi comment cela modifie les evenement du monde (ou les créer).

il existe plusieur type d'évenement comme un evenement a date fixe, un evenement, une evolution, un classement.

un evenement a date fixe est composé d'un nom, d'une description, une d'une probabilité que cette evenement ai lieu.

de calculer la probabilité d'un evenment quand un utilisateur créer un événement.

la probabilité d'un evement est calculer grace a une distribution de probabilité qui varie dans le temps.

cette destribution de probabilité commence a la date d'aujourd'huie

donc si elle dépasse cette date elle devra etre
tronqué

toute distribution est normalisé pour calculer l'impossibilité de cette évenement.

une evolution est une courbe qui décrit l'evolution d'une chose. Par exemple l'evolution de nombre 'emiossion de co2 d'un pay, ou du du prix d'une chose. Chaque evolution a aussi une probabilité d'etre vrai.

Un classement est une liste de chose avec une valeur. Par exemple le résultat, d'un election, ou le classement d'un championnat sportif. Pareil un classement possede une probabilité d'etre vrai

dans cette simulation chaque personne possede une ou des philosophie

cela se fait en pourcentage sur 100 une personne peut etre a 30% ecologiste, a 10 conservateur etc..

ces philosophie sont représenté par des groupe idéoligique

les organisation elle aussi possede une ou des philosphie comme les personne

chaque groupe idéologiqueq possede un nombre de personne, pour cela en compte le nombre d'individue (sans compté les organisation pour ne pas compté deux fois la meme chose).

Chaque groupe idéologique possede un ou des but

chaque personne, organisation, groupe idéologique possede un niveau de satisfaction compris entre -100 et 100.

chaque evenement possede aussi un niveau de satisfaction.

ce niveau de satisfaction pour les evenement indique contrairement pour les personnage a quelle point la réalisation de cette évenement modifirait le niveau de satisfaction de l'ensemble des personnage prix unitairement connecter a cette evenement si cette evenement venai a se réaliser (que soit directement ou undirectement comme nous allons le voir plus loin).

cela est pareil pour le niveau de satisfaction des action elles indiquent a quelle point une action modifie la probabilté d'un evenement qui impact beacoup la satisfaction des pesonne comme decrit plus bas que se directement ou indirectement.

dans cette simulation toute les chose peut etre relier a autre chosse, un personnage peut etre relié a un ou des autre personnage, cela peut par exemple caractérisé les relation qu'une personne entretient avec une autre personne (si le niveau de satisfaction d'une personne baisse, le niveau de satisfaction baisse aussi), cela peut aussi relier l'appartenance d'une personne a une organisation, a un groupe idéologique (a travers le fait que si son niveau de satisfaction change si le niveau de satisfaction de ces groupe chnage aussi). une personne peut etre relier a une action si la realisation de cette action modifie son nivea de satsfaction, une personne peut etre relier a un evenement si elle va etre impactée par cette evenement.

dans ce dernier cas en preferer connecté des groupe ideologique a un evenement plutot que directement une personne pour facilité certain calcul.

c'est la raison pour laquelle les groupe idéologique existe.

toute ces relation forme un graphe qui sera visible par l'utilisateur.

les nueaud seront les chose représenté dans la simulation, et les arrete leur relation. la taille des neud dépendra de leur impact par exemple un evenement sera gros si il imapct beacoup le niveau de satifaction des gens. Une action sera grosse si elle modifie beaucoup le evenement qui modifie beaucoup le niveau de satisfaction des personne, un personnage sera gros si il a un niveau de satifaction elevée ou bas.

on pourra repérer quelle chose est une personne, une organisation, une action, un evenement par sa forme gémétrique.

la couleur de la forme donnera en plus de sa taille (qui décrit son niveau d'imapct ou de satisfaction), si cela est positif ou negative. Le vert decrit si cela est positive, le rouge si cela est negative.

les relation entre les noeud seront gros si un noeud influence beaucou l'autre par exemple. La relation avec deux personne sera grosse si si la satisfaction d'un personnage baisse la satisfaction de l'autre perssonnage baisse aussi. la connexion d'un personne a une action definie a quelle la realisatio de cette action modifie le niveau de satifaction de la personne.La connexion d'une personne un evenemnt déffinira a quelle la personne et impactée par cette évenement.La connexion d'une action a un evenement determine a quelle point cette action modifie la probabilité d'un evenement. La connexion d'une action avec une autre action déçermine a quelle point réaliser cette action permettrait de réaliser cette autre action.tLa connexion d'un evenement avec un autre evenement détermine a quelle point la réalisation de cette evenement modifie la probabilité de cette évenement soit réaliser.

la largeur des arrete definie le niveau de connexion, et la couleur si cela est postive ou negative

Comment je l'ai dit chaque chose modifie chaque chose mathématiquement modifier quelque chose modifie tous les tout les autre chose avec laquelle elle est associé. par exemple modifier un évenemnet modifie plein d'autre evenement etc..

cette réaction en chaine est limiter pour des raison de resource.

mais certaine chose sont difficilement représentable mathématiquement ses pour cela que quand une personne fait une action l'oracle peut créer des evenement modifier certain evenent etc..

mais comme l'utilisation de l'IA coute chère le nombre d'intervention que peut
faire l'IA est limité.

comme si il y'a beaucoup de chose dns le graphe cela risque de le rendre illisible, certaine zone du grapeh sont répartit en regionpar exdemple une region technlogie pour les chose lier au technlogie, une region écolocologique pour les chose ecologiqyue etc..

une zone peut englober une autre.

comme je l'ai dit si une action d'un personnage impact trop le niveau de satifaction d'un autre personne, ce personnage réagit et effctue a son tour une action.

le but de cette simulation est de maximiser le satifaction glabal de l'ensemble de l'humanité sur le long terme (1000 ans) pour cela on a deja un score global qui est le niveau de satisfaction de l'humanité et le but est de realiser certaine action dans le but de maximiser le niveau de satisfaction de toute l'humanité sur long therme.

on calcule le score global et pas une proportion pour par exemple prendre en compte les possible mort et naissance, e, effet comme c'est un score global, l'uilisateur aura tout interet a maximiser les naissance e a minimiser le nombre de mort.

pour que les personne puisse s'entraiser il y'aura un forum ou l'on pourra voir les différent score que certaine personne arrive a faire en faisant telle mesure.

il pourront aussi debattre de ces mesure.

comme il est compliqué de creer un monde. commer je l'ai dit tout est modifiable.

pour cela tout les chose de la simulation que ce soit des element des evenement, des action, des personnage, est baser sur des fait.

en peut remettre en cause certain fait avec des preuve. Par la probabilité que le prix du pétrol soit de 3 euros en europe d'ici 2030 en argumentant avec des preuve.

en peut aussi contredire des preuve avec des preuve.

si le fait est dénombrable une preuve fera tendre le fait vers une certaine en fonction de deux parametre lier a ce fait qui sont ca credibilité, et son impact;

si une preuve d'un fait dénombrable a une trop peie valeur de credibilité x impact il ne sera pas comptabilisé. Pour eviter qu'une personne ne faisse plein de petit preuve caduque pour modifier un fait.

Si une preuve n'est pas dénombrable l'IA prendra compte des meilleur preuve pour modifier le fait.

Si le fait n'a pas beaucoup de preuve, l'IA prendra les preuve avec une valeur de credibilité et un impact elevé.
