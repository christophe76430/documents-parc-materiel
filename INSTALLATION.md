# Installation THN – V53

1. Utiliser cette version sur la branche de test `nouvelle-version-thn`.
2. Vérifier que le Deploy Preview Netlify est `Ready`.
3. Tester l'accueil, les échéances et l'administration.
4. Dans l'administration, utiliser les rubriques repliables **Parc**, **Documents**, **Chauffeurs** et **Archives**.
5. Tester le bouton ON/OFF et le remplacement d'un document.
6. Ne pas fusionner dans `main` avant validation.

La variable d'environnement `PARC_PASSWORD` doit être configurée dans Netlify.

La recherche de logement chauffeur a été supprimée de cette version : aucune variable `STAYINGAPI_KEY` n'est nécessaire.
