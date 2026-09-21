# THN V26

Cette version repart de V25 et ne modifie pas le code des tableaux/en-têtes de V23.

Correction ciblée : l'Administration pouvait dépasser le délai Netlify après connexion. La fonction ne fait plus un `getMetadata()` séquentiel pour chaque document ; elle utilise directement le nom du fichier contenu dans la clé du blob. La lecture des chauffeurs est également parallélisée.

1. Remplacer les fichiers de la branche `nouvelle-version-thn` par le contenu de cette archive.
2. Commit/push.
3. Attendre le Deploy Preview `ready`.
4. Ouvrir `/admin`, entrer `76430`.
5. Ne pas fusionner dans `main` avant validation.

La variable Netlify `PARC_PASSWORD` doit rester configurée avec `76430`.
