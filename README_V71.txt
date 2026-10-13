THN V71 — chargement des échéances optimisé

Modifications V71 :
- Chargement en parallèle des principales sources de l'API des échéances.
- Mise en cache très courte (20 s) de l'API dashboard, avec revalidation en arrière-plan (60 s), afin d'accélérer les affichages répétés sans figer les données longtemps.
- Espace salariés : les photos ne sont plus téléchargées côté serveur avant l'affichage de la page ; elles sont chargées directement par le navigateur en parallèle.
- Espace salariés : chargement des documents/échéances de tous les salariés en parallèle.
- Liste des salariés chargée en parallèle.
- Aucune modification de la présentation ou des fonctionnalités métier.
