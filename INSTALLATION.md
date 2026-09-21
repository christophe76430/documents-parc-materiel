# THN — version intégrée

Cette archive part de la version actuelle du dépôt et ajoute les fonctionnalités demandées.

## 1. Déploiement

- Conserver le dépôt GitHub connecté à Netlify.
- Remplacer les fichiers du dépôt par ceux de cette archive.
- Laisser Netlify effectuer un nouveau déploiement.
- Ne pas supprimer les données du store Netlify Blobs `parc-documents`.

## 2. Variables Netlify

À conserver :

- `PARC_PASSWORD` : mot de passe administrateur et accès matériel.

À ajouter pour la recherche de logement :

- `STAYINGAPI_KEY` : clé API StayingAPI.

Les variables doivent être créées dans Netlify, pas dans le dépôt. Les Functions peuvent ensuite les lire avec `process.env`. Un nouveau déploiement est nécessaire après modification d'une variable.

## 3. Fonctionnalités intégrées

- Interface d'accueil THN conservée et enrichie.
- 12 camions, 19 matériels rail-route/remorques et 14 véhicules.
- Image chantier ferroviaire pour la rubrique Véhicules.
- Espace chauffeurs avec code personnel.
- Documents chauffeur par rubriques.
- Recherche de logement pour 1 personne : adresse, dates, rayon 5/10/20/30 km.
- Résultats classés par prix total du séjour, avec lien de réservation.
- Filtrage géographique lorsque les coordonnées sont disponibles.
- Statuts documents : vert, orange, rouge, gris.
- Échéances dans les 30 jours.
- Fiches de filtration intégrées aux fiches matériel.
- Import individuel et import en masse du dossier PARCMAT.
- Suppression des documents depuis l'administration.
- Copyright `© 2026 Christophe Della Casa`.

## 4. Données Blobs

Les stores utilisent explicitement la région `eu-central-1`. Il est important de conserver cette région sur toutes les lectures, écritures et suppressions pour continuer à voir les documents existants.
