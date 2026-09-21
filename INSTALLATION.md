# THN V27

Cette version repart de V26 et conserve intégralement le code des tableaux/en-têtes de V23.

Correction : suppression du mot de passe de la documentation d'installation afin de ne pas déclencher le Secrets Scanning de Netlify.

1. Remplacer les fichiers de la branche `nouvelle-version-thn` par le contenu de cette archive.
2. Commit/push.
3. Attendre le Deploy Preview `ready`.
4. Ouvrir `/admin` et saisir le mot de passe configuré dans la variable Netlify `PARC_PASSWORD`.
5. Ne pas fusionner dans `main` avant validation.

La variable `PARC_PASSWORD` doit être configurée dans les variables d'environnement Netlify et ne doit pas être écrite dans les fichiers du projet.
